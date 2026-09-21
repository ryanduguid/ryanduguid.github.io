"""Check what an agent can be made to run from this site's machine-readable files.

An llms.txt is not documentation an agent reads and weighs. It is an
instruction file an agent acts on, so an install command in it executes on
whoever's machine is reading. Two failures follow from that:

- a package name nobody has published is claimable by anyone, and the agent
  installs the claimant's code from the correct, official-looking file;
- an unpinned third-party command runs whatever that registry serves at read
  time, so a later release of someone else's tool changes what this site tells
  an agent to do.

Ryan's own names resolve to his own latest release, so those may stay unpinned;
anything published by someone else must name its version.

Invisible and direction-control characters are checked in the same pass. They
do not render for a reader, so text can be hidden in a file that looks clean
while the model reads every character of it.

The default run is offline and deterministic: it reads the built files and
`scripts/agent_file_policy.json` and never contacts a service. `--verify-live`
is the explicit refresh step. It reports drift between the reviewed record and
the public registries so a person can review the difference; it never edits a
file and never runs as part of an ordinary build.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, NamedTuple

ROOT = Path(__file__).resolve().parents[1]
POLICY = Path(__file__).resolve().parent / "agent_file_policy.json"
OWNER = "ryanduguid"

# The files an agent is pointed at, in the built site.
SCANNED = ("llms.txt", "llms-full.txt", ".well-known/llms.txt", "README.md")

# Zero width, bidirectional overrides and isolates, word joiners, the byte order
# mark, and the Unicode tag block used to smuggle text past a reader.
INVISIBLE = re.compile(
    r"[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u2060-\u2064\ufeff]|[\U000e0000-\U000e007f]"
)

# A package token: a quoted or bare name, optionally with a version specifier.
# Python spells that `name==1.2.3` and npm spells it `name@1.2.3`, and the npm
# form has to be read off the name rather than after it.
TOKEN = (
    r"[\"']?((?:@[\w.-]+/)?[A-Za-z0-9][\w.-]*)(?:\[[^\]\s]*\])?"
    r"(?:(==[\w.!+-]+)|(@[\w.+-]+))?[\"']?"
)
# Flags that sit between the subcommand and the package name.
FLAGS = r"(?:(?:-[\w-]+|--[\w-]+(?:[= ][^\s]+)?)\s+)*"

# (registry, pattern, command line only)
COMMANDS = (
    (
        "pypi",
        re.compile(r"\b(?:python\d?(?: -m)? )?(?:uv )?pip3? install\s+" + FLAGS + TOKEN),
        False,
    ),
    ("pypi", re.compile(r"\buvx\s+" + FLAGS + r"--from\s+" + TOKEN), False),
    ("pypi", re.compile(r"\bpipx (?:run|install)\s+" + FLAGS + TOKEN), False),
    ("pypi", re.compile(r"\buv tool (?:run|install)\s+" + FLAGS + TOKEN), False),
    ("npm", re.compile(r"\bnpm (?:i|install|add)\s+" + FLAGS + TOKEN), False),
    ("npm", re.compile(r"\b(?:pnpm|yarn|bun) (?:add|dlx|install)\s+" + FLAGS + TOKEN), False),
    ("pypi", re.compile(r"\buvx\s+" + FLAGS + TOKEN), True),
    ("npm", re.compile(r"\bnpx\s+" + FLAGS + TOKEN), True),
)

# A local path, a requirements file or an editable install names no registry
# package, so there is nothing for anyone else to claim.
LOCAL = re.compile(r"^(?:\.|/|~|[A-Za-z]:|-|\$)|\.(?:txt|lock|toml|cfg|whl|tar\.gz|json)$")

# `uvx name` and `npx name` are two words of ordinary English away from a
# sentence about them, and the page text alternates carry both. Those two forms
# are read only where the line is a command; every other form names its package
# explicitly enough to read anywhere, including inside prose.
COMMAND_LINE = re.compile(
    r"^\s*(?:[$>#]\s*)?(?:python\d?|py|pip3?|uv|uvx|pipx|npm|npx|pnpm|yarn|bun|node"
    r"|claude|codex|cd|git|just|make)\b"
)


class Finding(NamedTuple):
    where: str
    what: str


def scanned_files(root: Path) -> list[Path]:
    files = [root / name for name in SCANNED]
    # _site is this same content one build later, and only in a source checkout.
    files.extend(sorted(path for path in root.glob("**/index.txt") if "_site" not in path.parts))
    return [path for path in files if path.is_file()]


def load_policy(path: Path = POLICY) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def npm_name(token: str) -> tuple[str, str | None]:
    """Split an npm token, where the version rides on an @ inside the name."""
    if token.startswith("@"):
        scope, _, rest = token.partition("/")
        name, _, version = rest.partition("@")
        return f"{scope}/{name}", version or None
    name, _, version = token.partition("@")
    return name, version or None


def installs(text: str) -> list[tuple[str, str, str | None]]:
    """Every (registry, package, version) an install command in `text` resolves."""
    found: list[tuple[str, str, str | None]] = []
    seen: set[tuple[int, str, str]] = set()
    for number, line in enumerate(text.splitlines(), start=1):
        is_command = bool(COMMAND_LINE.match(line))
        for registry, pattern, command_only in COMMANDS:
            if command_only and not is_command:
                continue
            for match in pattern.finditer(line):
                groups = [group for group in match.groups() if group is not None]
                if not groups:
                    continue
                token = groups[0]
                version = groups[1].lstrip("=@") if len(groups) > 1 else None
                if LOCAL.search(token):
                    continue
                if registry == "npm":
                    token, npm_version = npm_name(token)
                    version = version or npm_version
                # The bare and --from forms of one command both match, so the
                # same install would otherwise be reported twice.
                if (number, registry, token) in seen:
                    continue
                seen.add((number, registry, token))
                found.append((registry, token, version))
    return found


def check(root: Path = ROOT, policy: dict[str, Any] | None = None) -> list[Finding]:
    record = policy if policy is not None else load_policy()
    known = record["packages"]
    findings: list[Finding] = []
    for path in scanned_files(root):
        where = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8")
        for match in INVISIBLE.finditer(text):
            line = text[: match.start()].count("\n") + 1
            findings.append(
                Finding(f"{where}:{line}", f"invisible character U+{ord(match.group()):04X}")
            )
        for registry, package, version in installs(text):
            entry = known.get(registry, {}).get(package)
            if entry is None:
                findings.append(
                    Finding(
                        where,
                        f"{registry} package {package!r} is not in the reviewed record, so nobody "
                        "has checked that the name is published and whose it is",
                    )
                )
                continue
            if entry.get("owner") != OWNER and not version and not entry.get("local_dependency"):
                findings.append(
                    Finding(
                        where,
                        f"{registry} package {package!r} belongs to {entry.get('owner')!r} and is "
                        "installed without a version, so the command runs whatever that registry "
                        "serves when an agent reads this file",
                    )
                )
    return findings


def fetch(url: str) -> int:
    request = urllib.request.Request(url, headers={"User-Agent": "duguid.com.au agent-file check"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return int(response.status)
    except urllib.error.HTTPError as error:
        return int(error.code)
    except (urllib.error.URLError, TimeoutError) as error:
        raise SystemExit(f"could not reach {url}: {error}") from error


def verify_live(root: Path = ROOT) -> int:
    """Report drift between the reviewed record and the public registries."""
    record = load_policy()
    used = {
        (registry, package)
        for path in scanned_files(root)
        for registry, package, _ in installs(path.read_text(encoding="utf-8"))
    }
    drift = 0
    for registry, packages in sorted(record["packages"].items()):
        for package, entry in sorted(packages.items()):
            url = (
                f"https://pypi.org/pypi/{package}/json"
                if registry == "pypi"
                else "https://registry.npmjs.org/" + package.replace("/", "%2f")
            )
            status = fetch(url)
            state = "published" if status == 200 else f"NOT PUBLISHED (HTTP {status})"
            note = "" if (registry, package) in used else ", recorded but no longer installed here"
            print(f"{registry} {package}: {state}, owner {entry.get('owner')!r}{note}")
            if status != 200:
                drift += 1
    if drift:
        print(f"{drift} recorded name(s) are unpublished and claimable", file=sys.stderr)
    return 1 if drift else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--verify-live",
        action="store_true",
        help="check the reviewed names against the public registries",
    )
    args = parser.parse_args(argv)
    if args.verify_live:
        return verify_live()
    findings = check()
    if findings:
        print("agent-file policy failures:", file=sys.stderr)
        for finding in findings:
            print(f"- {finding.where}: {finding.what}", file=sys.stderr)
        return 1
    print(f"agent-file checks passed ({len(scanned_files(ROOT))} machine-readable files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
