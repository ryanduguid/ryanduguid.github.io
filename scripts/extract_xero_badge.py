"""Rebuild the Xero Level 3 badge from the certificate PDF that carries it.

The published badge is Xero's own artwork, taken from the certificate Xero
issued to Ryan Duguid rather than redrawn or recoloured here. The certificate
stores it as an RGB image XObject with a separate soft mask holding the rounded
corners, so this script recombines the two into one RGBA PNG. Running it against
the same certificate reproduces the shipped file byte for byte, which is what
``assets/credentials/SOURCES.md`` records.

Usage::

    python scripts/extract_xero_badge.py [certificate.pdf]

The default source is the certificate published under ``assets/credentials/``.
"""

from __future__ import annotations

import hashlib
import re
import struct
import sys
import zlib
from pathlib import Path

from favicon_render import PNG_SIGNATURE, _chunk

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = "assets/credentials/ryan-duguid-xero-certified-specialist-level-3.pdf"
TARGET = "assets/credentials/xero-certified-specialist-level-3-badge.png"
# The badge is the only 318 by 318 image in the certificate: the colour plate
# and the soft mask that rounds its corners.
BADGE_SIZE = 318
OBJECT_PATTERN = re.compile(rb"(\d+)\s+\d+\s+obj(.*?)endobj", re.DOTALL)
SMASK_PATTERN = re.compile(rb"/SMask\s+(\d+)\s+\d+\s+R")
WIDTH_PATTERN = re.compile(rb"/Width\s+(\d+)")
HEIGHT_PATTERN = re.compile(rb"/Height\s+(\d+)")


class BadgeError(Exception):
    """The certificate does not hold the badge in the expected shape."""


def _objects(pdf: bytes) -> dict[int, bytes]:
    """Return every indirect object body in the file, keyed by object number."""
    return {int(match.group(1)): match.group(2) for match in OBJECT_PATTERN.finditer(pdf)}


def _stream(body: bytes, number: int) -> bytes:
    """Return one object's decompressed stream."""
    start = body.find(b"stream")
    end = body.rfind(b"endstream")
    if start < 0 or end < 0:
        raise BadgeError(f"object {number} carries no stream")
    start += len(b"stream")
    if body[start : start + 2] == b"\r\n":
        start += 2
    elif body[start : start + 1] in (b"\n", b"\r"):
        start += 1
    try:
        return zlib.decompress(body[start:end])
    except zlib.error as error:  # pragma: no cover - a corrupt source file
        raise BadgeError(f"object {number} is not Flate encoded: {error}") from error


def _find_badge(objects: dict[int, bytes]) -> tuple[int, int]:
    """Return the colour plate and soft mask object numbers for the badge."""
    found: list[tuple[int, int]] = []
    for number, body in objects.items():
        header = body.split(b"stream", 1)[0]
        if b"/Image" not in header:
            continue
        width = WIDTH_PATTERN.search(header)
        height = HEIGHT_PATTERN.search(header)
        mask = SMASK_PATTERN.search(header)
        if not (width and height and mask):
            continue
        if int(width.group(1)) == BADGE_SIZE and int(height.group(1)) == BADGE_SIZE:
            found.append((number, int(mask.group(1))))
    if len(found) != 1:
        raise BadgeError(
            f"expected one {BADGE_SIZE} by {BADGE_SIZE} masked image, found {len(found)}"
        )
    return found[0]


def build_png(colour: bytes, alpha: bytes, size: int = BADGE_SIZE) -> bytes:
    """Interleave the colour plate and soft mask into one 8-bit RGBA PNG."""
    if len(colour) != size * size * 3:
        raise BadgeError(f"colour plate is {len(colour)} bytes, expected {size * size * 3}")
    if len(alpha) != size * size:
        raise BadgeError(f"soft mask is {len(alpha)} bytes, expected {size * size}")
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter type 0, the same bytes the source stores
        colour_row = y * size * 3
        alpha_row = y * size
        for x in range(size):
            pixel = colour_row + x * 3
            rows += colour[pixel : pixel + 3]
            rows.append(alpha[alpha_row + x])
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        PNG_SIGNATURE
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + _chunk(b"IEND", b"")
    )


def extract(source: Path) -> bytes:
    """Return the badge PNG rebuilt from one certificate file."""
    objects = _objects(source.read_bytes())
    colour_number, mask_number = _find_badge(objects)
    colour = _stream(objects[colour_number], colour_number)
    alpha = _stream(objects[mask_number], mask_number)
    return build_png(colour, alpha)


def main(argv: list[str]) -> int:
    """Rebuild the badge and report whether the shipped file already matches."""
    source = ROOT / DEFAULT_SOURCE if not argv else Path(argv[0])
    if not source.is_file():
        print(f"certificate not found: {source}", file=sys.stderr)
        return 1
    try:
        png = extract(source)
    except BadgeError as error:
        print(f"{source}: {error}", file=sys.stderr)
        return 1
    target = ROOT / TARGET
    digest = hashlib.sha256(png).hexdigest()
    if target.is_file() and target.read_bytes() == png:
        print(f"{TARGET} already matches {source.name} (SHA-256 {digest})")
        return 0
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(png)
    print(f"wrote {TARGET} from {source.name} (SHA-256 {digest})")
    return 0


if __name__ == "__main__":  # pragma: no cover - command line entry point
    raise SystemExit(main(sys.argv[1:]))
