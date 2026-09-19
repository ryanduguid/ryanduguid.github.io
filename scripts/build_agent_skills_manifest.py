"""Build and check .well-known/agent-skills/index.json.

The manifest lists every SKILL.md in one pinned release of
ryanduguid/australian-accounting-skills with its name, description, a URL that
serves the exact bytes and a sha256 digest of them, so an agent that finds the
site can fetch a skill and prove it got the released text. The skill file
format is the Agent Skills specification (https://agentskills.io/specification);
the manifest shape is this site's own and is described by its `format` field.

`--write` reads the release from GitHub and rewrites the manifest. `--check`
validates the committed manifest offline, which is what the site checks run.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / ".well-known" / "agent-skills" / "index.json"
REPOSITORY = "ryanduguid/australian-accounting-skills"
RELEASE = "v0.2.1"
SKILLS_DIR = ".claude/skills"
FORMAT = "duguid.com.au/agent-skills-index/1"
NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")
# The release route from the skills README. The plugin marketplace route
# installs the repository's default branch, which carries unreleased skills.
INSTALL = [
    f"git clone --branch {RELEASE} --depth 1 https://github.com/{REPOSITORY}.git accounting-skills-release",
    "npx --yes skills@1.5.22 add ./accounting-skills-release --agent codex claude-code --skill '*' --yes --copy",
]
TIMEOUT = 30


def raw_prefix(commit: str) -> str:
    """URLs pin the commit, not the tag: a tag can be moved, a commit cannot."""
    return f"https://raw.githubusercontent.com/{REPOSITORY}/{commit}/{SKILLS_DIR}/"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "duguid.com.au manifest build"})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return response.read()


def frontmatter_field(text: str, field: str) -> str:
    """Return one scalar frontmatter value; the skills use plain or double-quoted strings."""
    match = re.search(rf"^{field}:[ \t]*(.+?)[ \t]*$", text.split("\n---", 1)[0], re.M)
    if not match:
        raise ValueError(f"frontmatter has no {field}")
    value = match.group(1)
    if value.startswith('"') and value.endswith('"'):
        value = value[1:-1].replace('\\"', '"')
    return value


def released_skill_names(commit: str) -> list[str]:
    tree = json.loads(
        fetch(f"https://api.github.com/repos/{REPOSITORY}/git/trees/{commit}?recursive=1")
    )
    if tree.get("truncated"):
        raise RuntimeError("tree listing truncated")
    prefix = f"{SKILLS_DIR}/"
    names = sorted(
        entry["path"][len(prefix) :].split("/")[0]
        for entry in tree["tree"]
        if entry["path"].startswith(prefix) and entry["path"].endswith("/SKILL.md")
    )
    if not names:
        raise RuntimeError("no SKILL.md files in the release")
    return names


def build() -> dict[str, Any]:
    commit = json.loads(fetch(f"https://api.github.com/repos/{REPOSITORY}/commits/{RELEASE}"))[
        "sha"
    ]
    if not COMMIT_PATTERN.match(commit):
        raise ValueError(f"{RELEASE} did not resolve to a commit: {commit!r}")
    skills = []
    for name in released_skill_names(commit):
        url = f"{raw_prefix(commit)}{name}/SKILL.md"
        body = fetch(url)
        text = body.decode("utf-8")
        if frontmatter_field(text, "name") != name:
            raise ValueError(f"{name}: frontmatter name differs from its directory")
        skills.append(
            {
                "name": name,
                "description": frontmatter_field(text, "description"),
                "url": url,
                "digest": f"sha256:{hashlib.sha256(body).hexdigest()}",
            }
        )
    return {
        "format": FORMAT,
        "generated": date.today().isoformat(),
        "publisher": {"name": "Ryan Duguid", "url": "https://duguid.com.au/"},
        "skill_format": "https://agentskills.io/specification",
        "source": {
            "repository": f"https://github.com/{REPOSITORY}",
            "release": RELEASE,
            "commit": commit,
            "license": "MIT",
            "install": INSTALL,
        },
        "note": (
            "Preparation-only accounting workflows for review by an authorised human. "
            "Not tax advice and not lodgement. Each url serves the released bytes; "
            "check the digest before use."
        ),
        "skills": skills,
    }


def write() -> None:
    manifest = build()
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"{MANIFEST.relative_to(ROOT)} written: {len(manifest['skills'])} skills from {RELEASE}")


def check() -> list[str]:
    failures: list[str] = []
    try:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        return [f"{MANIFEST.relative_to(ROOT)}: {error}"]
    if manifest.get("format") != FORMAT:
        failures.append(f"format is {manifest.get('format')!r}, expected {FORMAT!r}")
    source = manifest.get("source", {})
    if source.get("release") != RELEASE:
        failures.append(f"source.release is not {RELEASE}")
    commit = source.get("commit")
    if not isinstance(commit, str) or not COMMIT_PATTERN.match(commit):
        return failures + ["source.commit is not a 40-character commit sha"]
    if source.get("install") != INSTALL:
        failures.append("source.install is not the marketplace-add and plugin-install pair")
    skills = manifest.get("skills")
    if not isinstance(skills, list) or not skills:
        return failures + ["skills must be a non-empty list"]
    names = [skill.get("name") for skill in skills]
    if len(set(names)) != len(names):
        failures.append("skill names repeat")
    for skill in skills:
        name = skill.get("name")
        if not isinstance(name, str) or not NAME_PATTERN.match(name) or len(name) > 64:
            failures.append(f"{name!r}: name breaks the Agent Skills name rule")
        description = skill.get("description")
        if not isinstance(description, str) or not description.strip() or len(description) > 1024:
            failures.append(f"{name}: description missing or over 1024 characters")
        if skill.get("url") != f"{raw_prefix(commit)}{name}/SKILL.md":
            failures.append(f"{name}: url is not the file at the pinned commit")
        if not isinstance(skill.get("digest"), str) or not DIGEST_PATTERN.match(skill["digest"]):
            failures.append(f"{name}: digest is not sha256:<64 hex>")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--write", action="store_true", help="fetch the release and rewrite the manifest"
    )
    mode.add_argument(
        "--check", action="store_true", help="validate the committed manifest offline"
    )
    args = parser.parse_args()
    if args.write:
        write()
        return 0
    failures = check()
    for failure in failures:
        print(f"agent-skills manifest: {failure}")
    if failures:
        return 1
    print("agent-skills manifest: checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
