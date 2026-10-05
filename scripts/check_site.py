"""Run every repository-defined site check through one documented command."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

from build_site import build
from seo_core import VOID_ELEMENTS

ROOT = Path(__file__).resolve().parents[1]
METADATA_ROOT_PATHS = frozenset(
    {"AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "DESIGN.md", "README.md", "SECURITY.md"}
)
LINK_MARKERS = re.compile(
    r"https?://|//|href|src|url\s*\(|@import|\\|\]\(|\{[{%]|^[ +\-]---\s*$",
    re.IGNORECASE | re.MULTILINE,
)
CHECKS = (
    (sys.executable, "scripts/test_ozzit_reference.py"),
    (sys.executable, "scripts/test_fact_check.py"),
    (sys.executable, "scripts/test_contracts.py"),
    (sys.executable, "scripts/test_site_server.py"),
    (sys.executable, "scripts/check_design.py"),
    (sys.executable, "scripts/test_check_links.py"),
    (sys.executable, "scripts/test_ci_metadata_selection.py"),
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
    ("node", "--test", "scripts/webmcp-tools.test.mjs"),
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
    return LINK_MARKERS.search(diff) is None


class ParagraphParser(HTMLParser):
    """Record spans of literal text directly inside paragraphs within plain containers."""

    CONTAINERS = frozenset(
        {"html", "body", "main", "section", "article", "div", "aside", "header", "footer", "nav"}
    )

    def __init__(self, source: str) -> None:
        super().__init__(convert_charrefs=False)
        self.source = source
        self.stack: list[str] = []
        self.spans: list[tuple[int, int]] = []
        self.offsets = [0, *(match.end() for match in re.finditer("\n", source))]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "p" and "p" in self.stack:
            raise ValueError("nested paragraph")
        if tag not in VOID_ELEMENTS:
            self.stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if not self.stack or self.stack.pop() != tag:
            raise ValueError("unbalanced tags")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in VOID_ELEMENTS:
            raise ValueError("self-closing non-void tag")

    def handle_data(self, data: str) -> None:
        if (
            not self.stack
            or self.stack[-1] != "p"
            or not set(self.stack[:-1]) <= self.CONTAINERS
            or LINK_MARKERS.search(data)
            or re.search(r"[<>{}\[\]=]", data)
        ):
            return
        line, column = self.getpos()
        start = self.offsets[line - 1] + column
        if self.source[start : start + len(data)] != data:
            raise ValueError("data position mismatch")
        self.spans.append((start, start + len(data)))


def paragraph_structure(source: str) -> str | None:
    """Mask only literal paragraph data, retaining every other source character."""
    prefix = ""
    if source.lstrip("\ufeff \t\r\n").startswith("---") and not source.startswith("---\n"):
        return None
    if source.startswith("---\n"):
        end = source.find("\n---\n", 3)
        if end < 0:
            return None
        prefix, source = source[: end + 5], source[end + 5 :]
    # The site's header/footer are balanced includes. The exact stylesheet version expression
    # reads only _config.yml, whose changes keep live checks, and stays in the compared
    # structure, so base and candidate must match. Other Liquid stays conservative.
    templates = re.sub(
        r"\{%\s*include\s+site-(?:header|footer)\.html\s*%\}"
        r"|(?<!\{)\{\{ site\.asset_version \}\}(?!\})",
        "",
        source,
    )
    if re.search(r"\{[{%]|\x00", templates):
        return None
    # ponytail: recognise direct paragraph text only; widen for an evidenced prose case.
    parser = ParagraphParser(source)
    try:
        parser.feed(source)
        parser.close()
    except ValueError:
        return None
    if parser.stack or not parser.spans:
        return None
    for start, end in reversed(parser.spans):
        source = source[:start] + "\x00" + source[end:]
    return prefix + source


def ci_offline() -> bool:
    event = os.environ.get("CI_EVENT")
    # Branch protection admits a push to main only after its pull request's checks, which
    # keep live checks for any link change. The weekly schedule keeps the full live sweep.
    if event == "push":
        return True
    if event != "pull_request":
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
        if can_skip_live_links("pull_request", paths, diff):
            return True
        if not paths or any(Path(path).suffix != ".html" for path in paths):
            return False
        if re.search(
            r"^(?:old mode|new mode|new file mode|deleted file mode|Binary files|GIT binary patch)",
            diff,
            re.MULTILINE,
        ):
            return False
        for path in paths:
            versions = [
                # Fixed arguments and intentional runner Git lookup for reviewed repository code.
                subprocess.run(  # nosec B603, B607
                    ["git", "show", "--no-textconv", f"{revision}:{path}"],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    check=True,
                ).stdout
                for revision in ("HEAD^1", "HEAD")
            ]
            before, after = (paragraph_structure(version) for version in versions)
            if versions[0] == versions[1] or before is None or before != after:
                return False
    except subprocess.CalledProcessError, OSError, UnicodeError:
        return False
    return True


def is_metadata_only(event: str, paths: list[str]) -> bool:
    """Only unpublished documents may omit browser execution."""
    if event != "pull_request" or not paths:
        return False
    return all(
        not any(ord(char) < 32 or char == "\\" for char in path)
        and not any(part in {"", ".", ".."} for part in path.split("/"))
        and (path in METADATA_ROOT_PATHS or path.startswith("docs/"))
        for path in paths
    )


def ci_metadata_only() -> bool:
    if os.environ.get("CI_EVENT") != "pull_request":
        return False
    try:
        # Fixed arguments and intentional runner Git lookup for reviewed repository code.
        commit = subprocess.run(  # nosec B603, B607
            ["git", "cat-file", "-p", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            encoding="utf-8",
            check=True,
            timeout=30,
        ).stdout
        if sum(line.startswith("parent ") for line in commit.split("\n\n", 1)[0].splitlines()) != 2:
            return False
        # Fixed arguments and intentional runner Git lookup for reviewed repository code.
        output = subprocess.run(  # nosec B603, B607
            ["git", "diff", "--name-only", "--no-renames", "-z", "HEAD^1", "HEAD", "--"],
            cwd=ROOT,
            capture_output=True,
            encoding="utf-8",
            check=True,
            timeout=30,
        ).stdout
    except OSError, UnicodeError, subprocess.CalledProcessError, subprocess.TimeoutExpired:
        return False
    if not output.endswith("\0"):
        return False
    return is_metadata_only("pull_request", output[:-1].split("\0"))


def check_metadata_excluded(rendered: Path) -> None:
    """Fail when a build change invalidates the metadata-only CI boundary."""
    for path in (*METADATA_ROOT_PATHS, "docs"):
        if (rendered / path).exists():
            raise RuntimeError(f"CI metadata path reached the rendered site: {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="skip live external-link checks")
    parser.add_argument(
        "--ci", action="store_true", help="select live checks from the pull-request diff"
    )
    parser.add_argument(
        "--ci-metadata-only", action="store_true", help="print the browser CI selection only"
    )
    args = parser.parse_args()
    if args.ci_metadata_only:
        if args.offline or args.ci:
            parser.error("--ci-metadata-only cannot be combined with site-check modes")
        print("true" if ci_metadata_only() else "false")
        return 0
    args.offline = args.offline or (args.ci and (ci_metadata_only() or ci_offline()))
    subprocess.run(
        [sys.executable, "scripts/build_ozzit_reference.py", "--check"], cwd=ROOT, check=True
    )
    rendered = build()
    check_metadata_excluded(rendered)
    subprocess.run([sys.executable, "scripts/test_build_site.py"], cwd=ROOT, check=True)
    # CI selects link checks from source pages, so this test reads source, not rendered, files.
    # Fixed arguments: the current interpreter runs a repository test.
    # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-audit.dangerous-subprocess-use-audit
    subprocess.run([sys.executable, "scripts/test_ci_link_selection.py"], cwd=ROOT, check=True)  # nosec B603
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
