"""Run every repository-defined site check through one documented command."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from build_site import build

ROOT = Path(__file__).resolve().parents[1]
CHECKS = (
    (sys.executable, "scripts/test_fact_check.py"),
    (sys.executable, "scripts/test_contracts.py"),
    (sys.executable, "scripts/test_site_server.py"),
    (sys.executable, "scripts/check_design.py"),
    (sys.executable, "scripts/test_check_links.py"),
    (sys.executable, "scripts/test_ci_link_selection.py"),
    (sys.executable, "scripts/test_search_console.py"),
    (
        "uv",
        "run",
        "--locked",
        "--script",
        ".agents/tools/search-console/server.py",
        "self-test",
    ),
    (sys.executable, "scripts/check_rates_register.py"),
    (sys.executable, "scripts/test_rates_register.py"),
    (sys.executable, "scripts/check_seo.py"),
    (sys.executable, "scripts/check_agent_files.py"),
    (sys.executable, "scripts/test_agent_files.py"),
    (sys.executable, "scripts/release_record.py"),
    (sys.executable, "scripts/test_visibility_benchmark.py"),
    (sys.executable, "scripts/visibility_benchmark.py", "--check"),
    (sys.executable, "scripts/build_llms_full.py", "--check"),
    (sys.executable, "scripts/build_feed.py", "--check"),
    (sys.executable, "scripts/test_feed.py"),
    (sys.executable, "scripts/build_agent_skills_manifest.py", "--check"),
    (sys.executable, "scripts/check_links.py"),
    ("node", "--test", "scripts/levy.test.mjs"),
    ("node", "--test", "scripts/business-calculators.test.mjs"),
    ("node", "--test", "scripts/field-errors.test.mjs"),
    ("node", "--test", "scripts/home-levy.test.mjs"),
    ("node", "--test", "scripts/stamp-source-freshness.test.mjs"),
    ("node", "--test", "scripts/check_production.test.mjs"),
    ("node", "--test", "scripts/check_ato_sources.test.mjs"),
)


def can_skip_live_links(event: str, paths: list[str], diff: str) -> bool:
    """Keep live validation for source or configuration changes that can alter links."""
    if event != "pull_request":
        return False
    for path in paths:
        if path.startswith(("scripts/", "_includes/", "_layouts/")):
            return False
        if Path(path).suffix not in {
            ".html",
            ".md",
            ".txt",
            ".css",
            ".svg",
            ".png",
            ".webp",
            ".jpg",
        }:
            return False
    # Inspect context too: a changed value can sit below an unchanged href or url().
    return (
        re.search(
            r"https?://|//|href|src|url\s*\(|@import|\\|\]\(|\{[{%]|^[ +\-]---\s*$",
            diff,
            re.IGNORECASE | re.MULTILINE,
        )
        is None
    )


def ci_offline() -> bool:
    if os.environ.get("CI_EVENT") != "pull_request":
        return False
    # The first parent of GitHub's pull-request merge commit is its base tip.
    try:
        paths = subprocess.run(
            ["git", "diff", "--name-only", "--no-renames", "-z", "HEAD^1", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.split("\0")
        paths = [path for path in paths if path]
        # Decide conservatively before reading a diff for an unknown file type.
        if not can_skip_live_links("pull_request", paths, ""):
            return False
        diff = subprocess.run(
            ["git", "diff", "--no-ext-diff", "--unified=1000000", "HEAD^1", "HEAD", "--", *paths],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except subprocess.CalledProcessError:
        return False
    return can_skip_live_links("pull_request", paths, diff)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="skip live external-link checks")
    parser.add_argument(
        "--ci", action="store_true", help="select live checks from the pull-request diff"
    )
    args = parser.parse_args()
    args.offline = args.offline or (args.ci and ci_offline())
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
