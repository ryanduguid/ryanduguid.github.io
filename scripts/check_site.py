"""Run every repository-defined site check through one documented command."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKS = (
    (sys.executable, "scripts/test_check_design.py"),
    (sys.executable, "scripts/check_design.py"),
    (sys.executable, "scripts/test_check_seo.py"),
    (sys.executable, "scripts/test_check_links.py"),
    (sys.executable, "scripts/check_seo.py"),
    (sys.executable, "scripts/check_links.py"),
    ("node", "--test", "scripts/levy.test.mjs"),
)


def main() -> int:
    for command in CHECKS:
        print(f"running {' '.join(command)}", flush=True)
        completed = subprocess.run(command, cwd=ROOT, check=False)
        if completed.returncode:
            return completed.returncode
    print("site checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
