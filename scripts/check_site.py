"""Run every repository-defined site check through one documented command."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKS = (
    (sys.executable, "scripts/test_contracts.py"),
    (sys.executable, "scripts/test_site_server.py"),
    (sys.executable, "scripts/check_design.py"),
    (sys.executable, "scripts/test_check_links.py"),
    (sys.executable, "scripts/test_search_console.py"),
    (
        "uv",
        "run",
        "--locked",
        "--script",
        ".agents/tools/search-console/server.py",
        "self-test",
    ),
    (sys.executable, "scripts/check_seo.py"),
    (sys.executable, "scripts/check_links.py"),
    ("node", "--test", "scripts/levy.test.mjs"),
    ("node", "--test", "scripts/home-levy.test.mjs"),
    ("node", "--test", "scripts/stamp-source-freshness.test.mjs"),
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
