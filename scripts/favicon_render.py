"""Render the register seal into the raster favicon sizes Google accepts.

Google only adopts a favicon whose raster is a multiple of 48px square, so the
seal is rendered from ``assets/favicon.svg`` at exact integer scales. Every
shipped raster therefore comes from one source drawing and stays crisp: no
resampling, no antialiasing, no hand-edited copies drifting from the SVG.
"""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "assets/favicon.svg"
# Declared in every page head; both are multiples of 48px for Google, and 32px
# stays for browser tabs.
PNG_SIZES = (32, 48, 96)
# Frames inside /favicon.ico, the fallback Google fetches when no link element
# gives it a usable icon.
ICO_SIZES = (16, 32, 48)
ICO_TARGET = "favicon.ico"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class FaviconError(Exception):
    """The seal drawing is outside what the raster pipeline can reproduce."""


def _colour(value: str, label: str) -> bytes:
    if value is None:
        raise FaviconError(f"favicon {label} has no fill")
    text = value.strip().lstrip("#")
    if len(text) != 6:
        raise FaviconError(f"favicon fill must be #rrggbb, found {value!r}")
    try:
        return bytes.fromhex(text)
    except ValueError as exc:
        raise FaviconError(f"favicon fill is not a colour: {value!r}") from exc


def _whole(value: str, label: str) -> int:
    try:
        return int(value)
    except ValueError as exc:
        raise FaviconError(
            f"favicon {label} must use whole pixels: {value}"
        ) from exc


def _length(element, name: str, default: int | None = None) -> int:
    value = element.get(name)
    if value is None:
        if default is None:
            raise FaviconError(f"favicon rect is missing {name}")
        return default
    length = _whole(value, f"geometry {name}")
    if length < 0:
        raise FaviconError(f"favicon geometry must not be negative: {name}={value}")
    return length


def parse_seal(svg_text: str) -> tuple[int, tuple[tuple[int, int, int, int, bytes], ...]]:
    """Read the seal as a grid size and a painting order of filled rectangles."""
    try:
        svg = ElementTree.fromstring(svg_text)
    except ElementTree.ParseError as exc:
        raise FaviconError(f"favicon is not valid SVG: {exc}") from exc

    view_box = (svg.get("viewBox") or "").split()
    if len(view_box) != 4 or view_box[0] != "0" or view_box[1] != "0":
        raise FaviconError("favicon viewBox must start at the origin")
    if view_box[2] != view_box[3]:
        raise FaviconError("favicon viewBox must be square")
    grid = _whole(view_box[2], "viewBox")
    if grid <= 0:
        raise FaviconError(f"favicon viewBox must be positive: {grid}")

    rects = []
    for element in svg:
        tag = element.tag.rsplit("}", 1)[-1]
        if tag != "rect":
            raise FaviconError(f"favicon must be drawn from rects, found {tag}")
        for corner in ("rx", "ry"):
            if element.get(corner) is not None:
                raise FaviconError(f"favicon rects must have square corners: {corner}")
        x = _length(element, "x", 0)
        y = _length(element, "y", 0)
        width = _length(element, "width")
        height = _length(element, "height")
        # A browser clips a rect to the viewport; the rasteriser paints into a
        # flat buffer and would wrap instead, so an unclipped rect is refused.
        if x + width > grid or y + height > grid:
            raise FaviconError(
                "favicon rect falls outside the viewBox: "
                f"x={x} y={y} width={width} height={height}"
            )
        rects.append((x, y, width, height, _colour(element.get("fill"), tag)))
    if not rects:
        raise FaviconError("favicon has no shapes to render")
    return grid, tuple(rects)


def _scale(value: int, grid: int, size: int, label: str) -> int:
    product = value * size
    if product % grid:
        raise FaviconError(
            f"favicon {label}={value} does not land on a whole pixel at {size}px"
        )
    return product // grid


def raster(seal, size: int) -> bytes:
    """Paint the seal into ``size`` square 8-bit RGB pixels, top row first.

    ``parse_seal`` has already held every rect inside the viewBox, so each run
    below lands within its own row.
    """
    grid, rects = seal
    pixels = bytearray(size * size * 3)
    for x, y, width, height, fill in rects:
        left = _scale(x, grid, size, "x")
        top = _scale(y, grid, size, "y")
        right = left + _scale(width, grid, size, "width")
        bottom = top + _scale(height, grid, size, "height")
        run = fill * (right - left)
        for row in range(top, bottom):
            start = (row * size + left) * 3
            pixels[start : start + len(run)] = run
    return bytes(pixels)


def _chunk(tag: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + tag
        + payload
        + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
    )


def png_bytes(seal, size: int) -> bytes:
    pixels = raster(seal, size)
    stride = size * 3
    scanlines = b"".join(
        b"\x00" + pixels[row * stride : (row + 1) * stride] for row in range(size)
    )
    return (
        PNG_SIGNATURE
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(scanlines, 9))
        + _chunk(b"IEND", b"")
    )


def _ico_frame(seal, size: int) -> bytes:
    """Encode one frame as the 32-bit BMP every ICO reader understands."""
    pixels = raster(seal, size)
    header = struct.pack(
        "<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0, size * size * 4, 0, 0, 0, 0
    )
    rows = []
    for y in range(size - 1, -1, -1):
        row = bytearray()
        for x in range(size):
            start = (y * size + x) * 3
            red, green, blue = pixels[start : start + 3]
            row += bytes((blue, green, red, 255))
        rows.append(bytes(row))
    # The seal is opaque, so the AND mask is empty; its rows pad to four bytes.
    mask_stride = ((size + 31) // 32) * 4
    return header + b"".join(rows) + bytes(mask_stride * size)


def ico_bytes(seal, sizes=ICO_SIZES) -> bytes:
    frames = [_ico_frame(seal, size) for size in sizes]
    directory = struct.pack("<HHH", 0, 1, len(frames))
    offset = len(directory) + 16 * len(frames)
    for size, frame in zip(sizes, frames):
        directory += struct.pack(
            "<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(frame), offset
        )
        offset += len(frame)
    return directory + b"".join(frames)


def rasters(root: Path = ROOT) -> dict[str, bytes]:
    """Map every generated favicon path to the bytes the seal renders to."""
    source = root / SOURCE
    if not source.is_file():
        raise FaviconError(f"favicon missing: {SOURCE}")
    seal = parse_seal(source.read_text(encoding="utf-8"))
    outputs = {
        f"assets/favicon-{size}.png": png_bytes(seal, size) for size in PNG_SIZES
    }
    outputs[ICO_TARGET] = ico_bytes(seal)
    return outputs


def main() -> int:
    try:
        outputs = rasters()
    except FaviconError as exc:
        print(f"favicon render failed: {exc}")
        return 1
    for rel, payload in outputs.items():
        (ROOT / rel).write_bytes(payload)
        print(f"wrote {rel} ({len(payload)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
