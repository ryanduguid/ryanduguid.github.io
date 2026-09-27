# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "opencv-python-headless==4.14.0.94",
#   "numpy==2.5.3",
#   "pillow==12.3.0",
#   "fonttools[woff]==4.66.0",
# ]
# ///
"""Render the About page's ASCII portrait from Ryan's headshot.

The photo is not in the repository. Run with uv, which reads the inline
dependencies above, and the script rewrites the portrait ``pre`` in
``about/index.html``::

    uv run --script scripts/render_about_portrait.py path/to/headshot.jpg

Each character cell is split into three rows by two columns of zones. The
glyph whose ink in those zones, measured from the site's own Spline Sans Mono
at the cell the page draws (0.6em by 1em), best matches the photo there is
chosen, so the jaw, collar and hairline take shaped glyphs rather than a flat
tone ramp.
"""

from __future__ import annotations

import argparse
import io
import re
from pathlib import Path

import cv2
import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "about" / "index.html"
FONT = ROOT / "assets" / "fonts" / "SplineSansMono-Regular.woff2"
PORTRAIT = re.compile(r'(<pre aria-hidden="true">\n)(.*?)(</pre></div>)', re.S)

# Symbols only, in code point order: letters read as words at this size. None
# of these needs HTML escaping or can open a Liquid tag.
GLYPHS = " !#$'()*+,-./:;@[\\]^_`|~"
COLUMNS = 120
LINE_HEIGHT = 1.0
ADVANCE = 0.6
ZONES_Y, ZONES_X = 3, 2


def glyph_ink(px: int = 120) -> np.ndarray:
    """Zone ink coverage per glyph, 0 to 1, in the cell the page draws."""
    font = TTFont(str(FONT))
    font.flavor = None
    buffer = io.BytesIO()
    font.save(buffer)
    face = ImageFont.truetype(io.BytesIO(buffer.getvalue()), px)
    width, height = round(ADVANCE * px), round(LINE_HEIGHT * px)
    ascent, descent = face.getmetrics()
    top = (height - (ascent + descent)) / 2
    ink = []
    for glyph in GLYPHS:
        cell = Image.new("L", (width, height), 0)
        ImageDraw.Draw(cell).text((0, top), glyph, font=face, fill=255)
        zones = cv2.resize(
            np.asarray(cell, np.float32) / 255, (ZONES_X, ZONES_Y), interpolation=cv2.INTER_AREA
        )
        ink.append(zones.reshape(-1))
    return np.array(ink)


def person_mask(rgb: np.ndarray) -> np.ndarray:
    """GrabCut foreground, largest component only, feathered to 0 to 1."""
    h, w = rgb.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    rect = (int(w * 0.04), int(h * 0.02), int(w * 0.92), int(h * 0.98))
    models = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    cv2.grabCut(bgr, mask, rect, *models, 8, cv2.GC_INIT_WITH_RECT)
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(fg)
    if count > 1:
        fg = (labels == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    fg = cv2.morphologyEx(fg.astype(np.float32), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return cv2.GaussianBlur(fg, (0, 0), 2.0)


def face_box(rgb: np.ndarray) -> tuple[int, int, int, int]:
    grey = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    cascade = Path(cv2.__file__).parent / "data" / "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(str(cascade))
    faces = detector.detectMultiScale(grey, 1.1, 6, minSize=(200, 200))
    if len(faces) == 0:
        raise SystemExit("No face found in the photo.")
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    return int(x), int(y), int(w), int(h)


def tone(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Luminance with gentle local contrast and an edge boost, backdrop at 0."""
    lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[:, :, 0]
    lum = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8)).apply(lum)
    value = lum.astype(np.float32) / 255
    blur = cv2.GaussianBlur(value, (0, 0), 1.5)
    edges = np.hypot(cv2.Sobel(blur, cv2.CV_32F, 1, 0), cv2.Sobel(blur, cv2.CV_32F, 0, 1))
    edges /= np.percentile(edges[mask > 0.5], 99) + 1e-6
    return np.clip(value + 0.45 * np.clip(edges, 0, 1), 0, 1) * mask


def crop(image: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    left, top, right, bottom = (int(v) for v in box)
    h, w = image.shape[:2]
    pad = max(0, -left, -top, right - w, bottom - h) + 1
    padded = cv2.copyMakeBorder(image, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    return padded[top + pad : bottom + pad, left + pad : right + pad]


def render(photo: Path) -> str:
    rgb = np.asarray(Image.open(photo).convert("RGB"))
    mask = person_mask(rgb)
    fx, fy, fw, fh = face_box(rgb)

    # Centre on the head's silhouette across the face rows, ear to ear; take
    # the hair above and the collar and shoulders below.
    across = np.flatnonzero((mask[fy + fh // 4 : fy + 3 * fh // 4] > 0.5).any(axis=0))
    if across.size == 0:
        raise SystemExit("The person mask misses the face; check the photo.")
    cx = (across[0] + across[-1]) / 2
    box = (cx - 0.975 * fw, fy - 0.28 * fh, cx + 0.975 * fw, fy + 1.86 * fh)
    art = crop(tone(rgb, mask), box)
    person = crop(mask, box)

    # Stretch within the person so skin mid-tones use the whole range, keep
    # the dark suit as faint texture, then fade the bust out at the bottom and
    # lower corners instead of ending on the photo's edges.
    inside = art[art > 0.02]
    low, high = np.percentile(inside, [2, 99.5]) if inside.size else (0.0, 0.0)
    if not high > low:
        raise SystemExit("The crop has no tonal range to draw; check the photo.")
    art = (np.clip((art - low) / (high - low), 0, 1) * (art > 0)) ** 2.1
    art = np.maximum(art, 0.12 * person)
    rows_px, cols_px = art.shape
    fade = int(rows_px * 0.18)
    ramp = np.ones(rows_px, np.float32)
    ramp[rows_px - fade :] = np.linspace(1, 0, fade) ** 1.5
    yy, xx = np.mgrid[0:rows_px, 0:cols_px].astype(np.float32)
    ellipse = np.hypot(
        (xx - cols_px / 2) / (cols_px * 0.5), (yy - rows_px * 0.38) / (rows_px * 0.72)
    )
    art = art * ramp[:, None] * np.clip(1 - np.clip(ellipse - 0.72, 0, None) / 0.28, 0, 1)

    # Match each cell's zones to the glyphs, with a light 4 by 4 ordered
    # dither so large even areas such as the forehead do not form blocks.
    ink = glyph_ink()
    rows = round(rows_px / (cols_px / COLUMNS) / (LINE_HEIGHT / ADVANCE))
    zones = cv2.resize(art, (COLUMNS * ZONES_X, rows * ZONES_Y), interpolation=cv2.INTER_AREA)
    zones = zones.reshape(rows, ZONES_Y, COLUMNS, ZONES_X).transpose(0, 2, 1, 3)
    zones = zones.reshape(rows, COLUMNS, -1)
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16 - 0.5
    offset = bayer[np.arange(rows)[:, None] % 4, np.arange(COLUMNS)[None, :] % 4]
    lit = zones.max(-1, keepdims=True) > 0.02
    target = (zones + 0.12 * offset[:, :, None] * lit) * ink.max()
    picks = ((target[:, :, None, :] - ink[None, None]) ** 2).sum(-1).argmin(-1)
    lines = ["".join(GLYPHS[i] for i in row).rstrip() for row in picks]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    if not lines:
        raise SystemExit("The render came out empty; check the photo.")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("photo", type=Path, help="the square headshot the portrait is drawn from")
    args = parser.parse_args()
    art = render(args.photo)
    page = PAGE.read_text(encoding="utf-8")
    updated, count = PORTRAIT.subn(lambda m: m.group(1) + art + m.group(3), page)
    if count != 1:
        raise SystemExit("about/index.html: expected one portrait pre.")
    PAGE.write_text(updated, encoding="utf-8", newline="\n")
    lines = art.split("\n")
    print(f"{len(lines)} rows of up to {max(map(len, lines))} of {COLUMNS} columns")


if __name__ == "__main__":
    main()
