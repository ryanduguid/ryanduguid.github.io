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
import shlex
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, NamedTuple

ROOT = Path(__file__).resolve().parents[1]
POLICY = Path(__file__).resolve().parent / "agent_file_policy.json"
OWNER = "ryanduguid"

# The files an agent is pointed at, in the built site: the machine-readable
# index, its per-page text alternates, the README, and anything else published
# as text that the index links an agent to, such as the agent-skills manifest.
SCANNED = ("llms.txt", "llms-full.txt", ".well-known/llms.txt", "README.md")
SCANNED_GLOBS = ("**/*.txt", "**/*.md", ".well-known/**/*.json")
UNPUBLISHED = frozenset(
    {"_site", "work", "node_modules", ".git", ".venv", "vendor", ".jekyll-cache"}
)

# Zero width, bidirectional marks, overrides and isolates, word joiners, the
# byte order mark, and the Unicode tag block used to smuggle text past a reader.
INVISIBLE = re.compile(
    r"[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u2060-\u2064\u061c\ufeff]"
    r"|[\U000e0000-\U000e007f]"
)

# Commands that install every package named after them.
INSTALLERS = (
    ("pypi", re.compile(r"\b(?:python\d?\s+-m\s+)?(?:uv\s+)?pip3?\s+install\b")),
    ("npm", re.compile(r"\bnpm\s+(?:i|install|add)\b")),
    ("npm", re.compile(r"\b(?:pnpm|yarn|bun)\s+(?:add|install)\b")),
)

# Commands that fetch one package and run it. Later tokens are that tool's own
# arguments rather than more packages. "uvx name" and "npx name" are two words
# of ordinary English away from a sentence about them, and the page text
# alternates carry both, so those two are read only where the line is a command.
RUNNERS = (
    ("pypi", re.compile(r"\buvx\b"), True),
    ("pypi", re.compile(r"\bpipx\s+(?:run|install)\b"), False),
    ("pypi", re.compile(r"\buv\s+tool\s+(?:run|install)\b"), False),
    ("npm", re.compile(r"\bnpx\b"), True),
    ("npm", re.compile(r"\b(?:pnpm|yarn|bun)\s+dlx\b"), False),
)

COMMAND_LINE = re.compile(
    r"^\s*(?:[$>#]\s*)?(?:python\d?|py|pip3?|uv|uvx|pipx|npm|npx|pnpm|yarn|bun|node"
    r"|claude|codex|cd|git|just|make)\b"
)

# Flags that swallow the next token, so that token is not a package name.
VALUE_FLAGS = {
    "-r",
    "--requirement",
    "-c",
    "--constraint",
    "-e",
    "--editable",
    "-t",
    "--target",
    "-f",
    "--find-links",
    "--index-url",
    "--extra-index-url",
    "--prefix",
    "--python",
    "-p",
    "--registry",
    "--with",
    "--agent",
    "-a",
    "--skill",
    "-s",
    "--metadata",
    "--subagent",
    "--from",
    "--package",
}
# Flags whose value is the package a runner fetches: uvx --from PACKAGE
# EXECUTABLE, npx -p PACKAGE COMMAND, npx --package=PACKAGE COMMAND. A command
# carrying one names its executable in the positional token, not a package.
SOURCE_FLAGS = ("--from", "-p", "--package")
# uvx --with EXTRA adds a package to the run beside the one it executes, so
# both are installed and both are read.
EXTRA_FLAGS = ("--with",)
PACKAGE_FLAGS = SOURCE_FLAGS + EXTRA_FLAGS

# pip reads the packages from a requirements file, and nothing the gate scans
# lists them. --require-hashes makes pip refuse any file whose bytes differ
# from the recorded hash, which is what stops a claimed name being served.
REQUIREMENT_FLAGS = ("-r", "--requirement")
HASH_PIN = "--require-hashes"

# Match quoted and escaped arguments before operators. A hash inside a URL is
# part of that word; a hash at a word boundary starts a shell comment.
SHELL_BOUNDARY = re.compile(r""""(?:\\.|[^"\\])*"|'[^']*'|\\.|[;&|]+|(?<!\S)\#.*""")
EXACT_NPM_VERSION = re.compile(
    r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)
EXACT_PYTHON_VERSION = re.compile(
    r"(?:\d+!)?\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?"
    r"(?:\+[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*)?"
)

# A local path, a requirements file or an editable install names no registry
# package, so there is nothing for anyone else to claim.
LOCAL = re.compile(r"^(?:\.|/|~|[A-Za-z]:|-|\$)|\.(?:txt|lock|toml|cfg|whl|tar\.gz|json)$")


class Finding(NamedTuple):
    where: str
    what: str


class Install(NamedTuple):
    registry: str
    package: str
    version: str | None
    #: True when the command runs the package rather than installing it, which
    #: is the only form npx resolves from a local node_modules.
    runs_it: bool


def scanned_files(root: Path) -> list[Path]:
    files = [root / name for name in SCANNED]
    for pattern in SCANNED_GLOBS:
        # None of these are published: _site is this content one build later,
        # and the rest are dependencies, scratch and caches. They exist only in
        # a source checkout, never in the built tree the checks run against.
        # Relative to root, because the directory holding the checkout is not
        # ours to read: GitHub Actions checks out under /home/runner/work, and
        # matching that would discard every file the globs find.
        files.extend(
            path
            for path in root.glob(pattern)
            if not UNPUBLISHED & set(path.relative_to(root).parts)
        )
    unique: dict[Path, None] = {}
    for path in files:
        if path.is_file():
            unique.setdefault(path.resolve(), None)
    return sorted(unique)


def load_policy(path: Path = POLICY) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def is_exact_version(registry: str, version: str | None) -> bool:
    if registry == "pypi":
        return EXACT_PYTHON_VERSION.fullmatch(version or "") is not None
    match = EXACT_NPM_VERSION.fullmatch(version or "")
    if match is None:
        return False
    # SemVer forbids leading zeroes in numeric prerelease identifiers, but
    # permits them in build metadata. Invalid versions can be mutable npm tags.
    return all(
        not part.isdigit() or part == "0" or not part.startswith("0")
        for part in (match.group(1) or "").split(".")
    )


def split_version(registry: str, token: str) -> tuple[str, str | None]:
    """Python spells a pin name==1.2.3, npm spells it name@1.2.3."""
    token = token.strip("\"'`,")
    token = re.sub(r"\[[^\]]*\]$", "", token)
    if registry == "pypi":
        name, _, version = token.partition("==")
        return name, version or None
    if token.startswith("@"):
        scope, _, rest = token.partition("/")
        name, _, version = rest.partition("@")
        return scope + "/" + name, version or None
    name, _, version = token.partition("@")
    return name, version or None


def packages_in(rest: str, registry: str, *, take_all: bool) -> list[tuple[str, str | None]]:
    """The packages a command's remaining tokens resolve."""
    positional: list[str] = []
    source: list[str] = []
    extra: list[str] = []
    awaiting: str | None = None
    try:
        tokens = shlex.split(rest)
    except ValueError:
        # Prose can contain an unmatched apostrophe after an inline command.
        tokens = rest.split()
    for token in tokens:
        if awaiting is not None:
            if awaiting in SOURCE_FLAGS:
                source.append(token)
            elif awaiting in EXTRA_FLAGS:
                extra.append(token)
            awaiting = None
            continue
        if token.startswith("-"):
            flag, separator, value = token.partition("=")
            if separator and flag in SOURCE_FLAGS:
                source.append(value)
            elif separator and flag in EXTRA_FLAGS:
                extra.append(value)
            elif not separator and flag in VALUE_FLAGS:
                awaiting = flag
            continue
        positional.append(token)
        if not take_all:
            break
    found = []
    # A source flag names the package in place of the positional token, which
    # is then the executable. An extra flag adds one beside it.
    for token in (source or positional) + extra:
        name, version = split_version(registry, token)
        if name and not LOCAL.search(name):
            found.append((name, version))
    return found


def unhashed_requirements(command: str) -> bool:
    """True when a command installs from a requirements file without hashes."""
    names = [token.partition("=")[0] for token in command.split()]
    return any(flag in names for flag in REQUIREMENT_FLAGS) and HASH_PIN not in names


def commands_in(text: str, prose: bool) -> list[tuple[str, bool]]:
    """Each command on each line, with whether it reads as a command.

    A prose file's sentences run on past the package name, so a segment that
    does not start as a command yields only the first package named in it. A
    structured file has no prose, and the agent-skills manifest carries its
    install command inside a JSON string.
    """
    if not prose:
        # Decode JSON before shell parsing, so its string quotes do not hide
        # command chains or escaped newlines inside an install instruction.
        def strings(value: Any) -> list[str]:
            if isinstance(value, str):
                return [value]
            if isinstance(value, dict):
                return [item for child in value.values() for item in strings(child)]
            if isinstance(value, list):
                return [item for child in value for item in strings(child)]
            return []

        text = "\n".join(strings(json.loads(text)))
    found = []
    for line in text.splitlines():
        start = 0
        segments = []
        for match in SHELL_BOUNDARY.finditer(line):
            token = match.group()
            if token[0] in ";&|#":
                segments.append(line[start : match.start()])
                start = match.end()
                if token.startswith("#"):
                    break
        segments.append(line[start:])
        for segment in segments:
            if segment and segment.strip():
                found.append((segment, not prose or bool(COMMAND_LINE.match(segment))))
    return found


def installs(text: str, prose: bool = True) -> list[Install]:
    """Every package an install or run command in the text resolves."""
    found: list[Install] = []
    for segment, is_command in commands_in(text, prose):
        seen: set[tuple[str, str, str | None]] = set()
        for registry, prefix in INSTALLERS:
            for match in prefix.finditer(segment):
                for name, version in packages_in(
                    segment[match.end() :], registry, take_all=is_command
                ):
                    if (registry, name, version) not in seen:
                        seen.add((registry, name, version))
                        found.append(Install(registry, name, version, False))
        for registry, prefix, command_only in RUNNERS:
            if command_only and not is_command:
                continue
            for match in prefix.finditer(segment):
                for name, version in packages_in(segment[match.end() :], registry, take_all=False):
                    if (registry, name, version) not in seen:
                        seen.add((registry, name, version))
                        found.append(Install(registry, name, version, True))
    return found


def check(root: Path = ROOT, policy: dict[str, Any] | None = None) -> list[Finding]:
    record = policy if policy is not None else load_policy()
    known = record["packages"]
    findings: list[Finding] = []
    for path in scanned_files(root):
        where = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8")
        prose = path.suffix != ".json"
        for match in INVISIBLE.finditer(text):
            number = text[: match.start()].count("\n") + 1
            findings.append(
                Finding(f"{where}:{number}", f"invisible character U+{ord(match.group()):04X}")
            )
        for segment, _ in commands_in(text, prose):
            for _, prefix in INSTALLERS:
                for match in prefix.finditer(segment):
                    if unhashed_requirements(segment[match.end() :]):
                        findings.append(
                            Finding(
                                where,
                                "a requirements file is installed without "
                                + HASH_PIN
                                + ", so the packages inside it are neither "
                                "listed here nor fixed by a hash",
                            )
                        )
        for install in installs(text, prose=prose):
            registry, package = install.registry, install.package
            version = install.version
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
            # The local_dependency exemption covers the run path only:
            # after npm ci, npx runs the copy package.json pins. An
            # npm install of the same name resolves the registry, so it
            # still has to name a version.
            exempt = bool(entry.get("local_dependency")) and install.runs_it and version is None
            if (
                entry.get("owner") != OWNER
                and not is_exact_version(registry, version)
                and not exempt
            ):
                findings.append(
                    Finding(
                        where,
                        f"{registry} package {package!r} belongs to {entry.get('owner')!r} and is "
                        "installed without a version fixed to an exact release, so it runs what the registry "
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
        for registry, package, _, _ in installs(
            path.read_text(encoding="utf-8"),
            prose=path.suffix != ".json",
        )
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
