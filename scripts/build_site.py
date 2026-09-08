"""Build the public HTML with the same Jekyll version as GitHub Pages."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build(source: Path = ROOT) -> Path:
    destination = source / "_site"
    subprocess.run(
        [
            shutil.which("bundle") or "bundle",
            "exec",
            "jekyll",
            "build",
            "--source",
            str(source),
            "--destination",
            str(destination),
        ],
        cwd=ROOT,
        check=True,
    )
    return destination


if __name__ == "__main__":
    build()
