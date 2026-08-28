"""Verify protected site files still match a named Git baseline."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTECTED_PATHS = (
    "llms.txt",
    "robots.txt",
    "sitemap.xml",
    "google03d2012cc1791991.html",
    "assets/levy.mjs",
)


def main(arguments: list[str]) -> int:
    if len(arguments) != 1 or not arguments[0].strip():
        print("usage: verify_protected_files.py BASELINE", file=sys.stderr)
        return 2

    command = ["git", "diff", "--quiet", arguments[0], "--", *PROTECTED_PATHS]
    completed = subprocess.run(command, cwd=ROOT, check=False)
    if completed.returncode == 0:
        print("protected files unchanged")
        return 0
    if completed.returncode == 1:
        names = subprocess.run(
            ["git", "diff", "--name-only", arguments[0], "--", *PROTECTED_PATHS],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        print("protected files changed", file=sys.stderr)
        if names.returncode == 0 and names.stdout.strip():
            print(names.stdout.strip(), file=sys.stderr)
        return 1

    print("git could not compare the protected files", file=sys.stderr)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
