"""Run every repository-defined site check through one documented command."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from build_site import build

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
    (sys.executable, "scripts/build_llms_full.py", "--check"),
    (sys.executable, "scripts/check_links.py"),
    ("node", "--test", "scripts/levy.test.mjs"),
    ("node", "--test", "scripts/business-calculators.test.mjs"),
    ("node", "--test", "scripts/home-levy.test.mjs"),
    ("node", "--test", "scripts/stamp-source-freshness.test.mjs"),
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="skip live external-link checks")
    args = parser.parse_args()
    rendered = build()
    subprocess.run([sys.executable, "scripts/test_build_site.py"], cwd=ROOT, check=True)
    # Add only the tooling and fixtures the checks need beside the built files.
    # Copying public source files here would hide omissions from Jekyll's output.
    with tempfile.TemporaryDirectory() as directory:
        checked = Path(directory) / "site"
        shutil.copytree(rendered, checked)
        for name in (
            "scripts",
            ".agents",
            "docs",
            "README.md",
            "_config.yml",
            "assets/social-card-template.svg",
            "assets/social-cards.json",
        ):
            source = ROOT / name
            if source.is_dir():
                shutil.copytree(
                    source, checked / name, ignore=shutil.ignore_patterns("__pycache__")
                )
            else:
                shutil.copy2(source, checked / name)
        for command in CHECKS:
            if args.offline and "scripts/check_links.py" in command:
                command = (*command, "--offline")
            print(f"running {' '.join(command)}", flush=True)
            completed = subprocess.run(command, cwd=checked, check=False)
            if completed.returncode:
                return completed.returncode
    print("site checks passed (external links skipped)" if args.offline else "site checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
