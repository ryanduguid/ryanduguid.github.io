# /// script
# requires-python = ">=3.14"
# dependencies = [
#   "pillow==12.3.0",
# ]
# ///
"""Encode the Lumbridge cash chart exports as lossless WebP for the pages.

The PNGs that scripts/export-cash-chart.ps1 writes stay the record and the
full-size link; the pages show these WebP copies, which are smaller. Run with
uv after each export, then record the printed hashes in
assets/examples/lumbridge/preview-record.txt::

    uv run --script scripts/encode_cash_chart_webp.py

Each copy is decoded again and must match its PNG pixel for pixel, so the
page shows exactly what Excel exported.
"""

from __future__ import annotations

import hashlib
import io
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CHARTS = ROOT / "assets" / "examples" / "lumbridge"
NAMES = ("cash-preview", "cash-preview-narrow")


def encode(png: Path) -> bytes:
    with Image.open(png) as image:
        rgba = image.convert("RGBA")
    buffer = io.BytesIO()
    rgba.save(buffer, format="WEBP", lossless=True, quality=100, method=6, exact=True)
    webp = buffer.getvalue()
    with Image.open(io.BytesIO(webp)) as decoded:
        if decoded.convert("RGBA").tobytes() != rgba.tobytes():
            raise SystemExit(f"{png.name}: lossless WebP does not match the PNG")
    return webp


def main() -> int:
    for name in NAMES:
        png = CHARTS / f"{name}.png"
        target = CHARTS / f"{name}.webp"
        webp = encode(png)
        target.write_bytes(webp)
        digest = hashlib.sha256(webp).hexdigest()
        print(f"wrote {target.relative_to(ROOT).as_posix()} ({len(webp)} bytes, SHA-256 {digest})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
