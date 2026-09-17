"""Check the site's release claims against one reviewed record.

`scripts/release_record.json` is the single reviewed statement of three
different things a page can mean by a version:

- the release a reader can download today (`published`),
- the release a page's prose, links and structured data describe (`documented`),
- the release a preserved evaluation reproduced (`evaluations`).

The default run is offline and deterministic: it reads the record and the built
pages and never contacts a service. `--verify-live` is the explicit refresh
step. It reports drift between the record and the public release sources so a
person can review the difference and update the record; it never rewrites a page
and never runs as part of an ordinary build.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any, NamedTuple

import seo_core as core

RECORD = Path(__file__).resolve().parent / "release_record.json"
TIMEOUT = 20
USER_AGENT = "duguid-site-release-record/1 (+https://duguid.com.au)"
# A page that documents an older release than the published one must say so in
# its own words. The sentence must name both versions and mark which is current.
GAP_MARKER = "published release"
# An unpinned uvx command reuses a cached environment or an installed tool when
# one exists, so a page carrying one states that rather than promising the latest.
UNPINNED_MARKERS = (
    "unpinned",
    "may reuse a cached",
    "does not guarantee the latest release",
)
# A source that answers but shows no matching release reports this, so an absent
# release is visible drift rather than a missing line.
MISSING = "no matching release"
# Only these say the recorded asset is gone. Every other HTTP failure, such as
# a rate limit or a server fault, is inconclusive and must not read as drift.
ABSENT_STATUSES = frozenset({404, 410})
# A refresh reports what it established and says so when it established nothing.
LIVE_ERRORS = (
    urllib.error.URLError,
    TimeoutError,
    OSError,
    KeyError,
    ValueError,
    TypeError,
    AttributeError,
)
# A monorepo's releases span pages, so an absent release is only absent once the
# pages run out. The cap keeps a refresh bounded.
RELEASE_PAGE_SIZE = 100
RELEASE_PAGES = 10
# What one probe established. FOUND carries a value to compare; the rest say why
# no comparison is possible, so a failure is never read as a matching version.
FOUND = "FOUND"
INCONCLUSIVE = "INCONCLUSIVE"
ABSENT = "ABSENT"
CHANGED = "CHANGED"


class Probe(NamedTuple):
    """One source's outcome: what was asked, what state it reached, and the detail."""

    source: str
    state: str
    detail: str


def load(path: Path = RECORD) -> dict[str, Any]:
    """Read the reviewed release record."""
    record: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return record


def page_text(root: Path, rel: str) -> tuple[str, str]:
    """Return one page's raw HTML and its visible text."""
    html = (root / rel).read_text(encoding="utf-8")
    return html, core.visible_text(html)


def software_versions(html: str, rel: str, failures: list[str]) -> list[str]:
    """Every softwareVersion declared in a page's structured data."""
    return [
        str(node["softwareVersion"])
        for block in core.json_ld_blocks(html, rel, failures)
        for node in core.nodes(block)
        if "softwareVersion" in node
    ]


def check_component(root: Path, name: str, component: dict[str, Any]) -> list[str]:
    """Check one component's page against the record."""
    failures: list[str] = []
    documented = component.get("documented")
    published = component["published"]
    if not documented or "page" not in documented:
        return failures
    rel = documented["page"]
    path = root / rel
    if not path.is_file():
        return [f"{rel}: missing page for the {name} release record"]
    html, visible = page_text(root, rel)

    label = documented.get("visible_label")
    if label is not None and visible.count(label) != 1:
        failures.append(
            f"{rel}: expected exactly one visible {label!r}, found {visible.count(label)}"
        )

    documented_version = documented.get("version")
    if documented_version is not None and documented_version != published["version"]:
        # A documented release may legitimately lag. The gap must be explicit, and
        # the page must actually name the release the record says it documents.
        named = (
            GAP_MARKER in visible
            and published["version"] in visible
            and documented_version in visible
        )
        if not named:
            failures.append(
                f"{rel}: documents {name} {documented_version} while "
                f"{published['version']} is published, without naming the difference"
            )

    declared = documented.get("software_version")
    if declared is not None:
        versions = software_versions(html, rel, failures)
        if versions != [declared]:
            failures.append(
                f"{rel}: structured softwareVersion is {versions!r}, expected [{declared!r}]"
            )

    # A reader needs a link they can see and follow, so the URL must be an anchor
    # destination in the rendered page, not text in a comment, a script, an
    # unrelated attribute or an element that is never shown.
    if published["release_url"] not in core.anchor_hrefs(core.visible_html(html)):
        failures.append(f"{rel}: does not link the published release record")

    for supporting in documented.get("supporting_files", []):
        # Evidence for the documented release is read at that release. A general
        # repository, issue or development link stays unpinned deliberately.
        expected = f"{component['repository']}/blob/{documented['tag']}/{supporting}"
        if f'href="{expected}"' not in html:
            failures.append(
                f"{rel}: {supporting} must be linked at {documented['tag']}, "
                f"the release this page documents"
            )

    # The recorded pins belong to the published release. A page that documents an
    # older release states that release's pins, so the check applies only when the
    # page documents the published one.
    engines = (
        component.get("pinned_engines") or {}
        if documented_version in (None, published["version"])
        else {}
    )
    for engine, version in engines.items():
        # Only engines the page names: it need not list every dependency, but a
        # version it does state must be the one that release pins.
        if engine in visible:
            stated = set(re.findall(rf"{re.escape(engine)}\s+(\d+\.\d+\.\d+)", visible))
            if stated and stated != {version}:
                failures.append(
                    f"{rel}: names {engine} {sorted(stated)} but {name} "
                    f"{published['version']} pins {version}"
                )

    for command in component.get("pinned_commands", []):
        if command not in core.raw_text(html):
            failures.append(f"{rel}: pinned reproduction command is missing: {command}")

    tracking = component.get("tracking_commands", [])
    if any(command in core.raw_text(html) for command in tracking):
        # An unpinned uvx command may reuse a cached environment or an installed
        # tool, so a page that carries one must not promise the latest release.
        if not all(marker in visible for marker in UNPINNED_MARKERS):
            failures.append(
                f"{rel}: unpinned adoption commands must say they are unpinned and "
                "that uvx may reuse a cached or installed version"
            )
    return failures


def check_unreleased(root: Path, name: str, component: dict[str, Any]) -> list[str]:
    """No page may present an unreleased default-branch version as downloadable."""
    unreleased = component.get("unreleased_default_branch")
    if not unreleased:
        return []
    failures: list[str] = []
    version = unreleased["version"]
    # Scoped to this component's own repository: another project's release that
    # happens to carry the same version number is not this unreleased download.
    repository = re.escape(str(component["repository"]))
    pattern = re.compile(
        rf'href="{repository}/(?:releases/download|releases/tag)/v?{re.escape(version)}[/"]'
    )
    for path in core.html_files(root):
        html = path.read_text(encoding="utf-8")
        if pattern.search(html):
            rel = path.relative_to(root).as_posix()
            failures.append(f"{rel}: links {name} {version}, which is not published")
    return failures


def check_evaluations(root: Path, record: dict[str, Any]) -> list[str]:
    """Each preserved evaluation keeps its own historical release label."""
    failures: list[str] = []
    for rel, evaluation in record["evaluations"].items():
        path = root / rel
        if not path.is_file():
            failures.append(f"{rel}: missing evaluation page")
            continue
        _, visible = page_text(root, rel)
        # The label names the component as well as the version, so an unrelated
        # occurrence of the same number cannot satisfy the contract.
        expected = evaluation.get("label") or evaluation["version"]
        if expected not in visible:
            failures.append(
                f"{rel}: preserved evaluation must keep release "
                f"{evaluation['version']} visible as {expected!r}"
            )
    return failures


def check_record(
    root: Path = core.ROOT, record: dict[str, Any] | None = None
) -> list[str]:
    """Check every release claim the record covers."""
    record = record if record is not None else load()
    failures: list[str] = []
    for name, component in record["components"].items():
        failures.extend(check_component(root, name, component))
        failures.extend(check_unreleased(root, name, component))
    failures.extend(check_evaluations(root, record))
    return failures


def fetch_json(url: str) -> Any:
    """Read one public JSON document, or raise for an unusable response."""
    request = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read())


def mapping(value: Any, where: str) -> dict[str, Any]:
    """A service response that is not an object is a changed contract, not a version."""
    if not isinstance(value, dict):
        raise ValueError(f"{where} returned {type(value).__name__}, expected an object")
    return value


def probe(source: str, read: Callable[[], str]) -> Probe:
    """Run one source and classify its outcome, never raising to its neighbours."""
    try:
        return Probe(source, FOUND, read())
    except LIVE_ERRORS as error:
        # A failed fetch or a changed response contract establishes nothing. It
        # is reported as such, and never as a version or a confirmed change.
        return Probe(source, INCONCLUSIVE, f"{type(error).__name__}: {error}")


def pypi_version(published: dict[str, Any]) -> str:
    name = str(published["pypi_url"]).rstrip("/").rsplit("/", 1)[-1]
    payload = mapping(fetch_json(f"https://pypi.org/pypi/{name}/json"), "PyPI")
    return str(mapping(payload["info"], "PyPI info")["version"])


def registry_version(published: dict[str, Any]) -> str:
    payload = mapping(fetch_json(str(published["registry_url"])), "the MCP registry")
    server = mapping(payload.get("server", payload), "the MCP registry server record")
    version = server.get("version")
    # A missing or non-string version is a changed contract, not a version named
    # "None": saying so is the difference between a fact and a fabrication.
    if not isinstance(version, str) or not version:
        raise ValueError("the MCP registry server record carries no version string")
    return version


def release_tags(owner_repo: str, prefix: str) -> list[str]:
    """Every published tag under one prefix, following pages to the end."""
    tags: list[str] = []
    for page in range(1, RELEASE_PAGES + 1):
        releases = fetch_json(
            f"https://api.github.com/repos/{owner_repo}/releases"
            f"?per_page={RELEASE_PAGE_SIZE}&page={page}"
        )
        if not isinstance(releases, list):
            raise ValueError("the GitHub releases endpoint returned an object, expected a list")
        tags.extend(
            str(release["tag_name"])
            for release in releases
            if isinstance(release, dict)
            and not release.get("draft")
            and not release.get("prerelease")
            and str(release.get("tag_name", "")).startswith(prefix)
        )
        # A short page is the last page. A monorepo's releases span many pages,
        # so stopping at the first would mistake an older release for an absent one.
        if len(releases) < RELEASE_PAGE_SIZE:
            break
    return tags


def github_version(component: dict[str, Any]) -> str:
    published = component["published"]
    owner_repo = str(component["repository"]).removeprefix("https://github.com/")
    tag = published["release_url"].rsplit("/tag/", 1)[-1]
    prefix = tag.removesuffix(published["version"])
    tags = release_tags(owner_repo, prefix)
    if not tags:
        return MISSING
    return max(tags, key=lambda name: _version_key(name[len(prefix):]))[len(prefix):]


def recorded_release_exists(component: dict[str, Any]) -> str:
    """Whether the exact recorded tag still has a published release."""
    published = component["published"]
    owner_repo = str(component["repository"]).removeprefix("https://github.com/")
    tag = published["release_url"].rsplit("/tag/", 1)[-1]
    try:
        fetch_json(f"https://api.github.com/repos/{owner_repo}/releases/tags/{tag}")
    except urllib.error.HTTPError as error:
        if error.code in ABSENT_STATUSES:
            return MISSING
        raise
    return tag


def live_versions(component: dict[str, Any]) -> list[Probe]:
    """Probe every public source this component declares, independently.

    Each source is attempted and classified on its own, so one outage cannot
    suppress a result another source already established.
    """
    published = component["published"]
    probes: list[Probe] = []
    if published.get("pypi_url"):
        probes.append(probe("pypi", lambda: pypi_version(published)))
    if published.get("registry_url"):
        probes.append(probe("registry", lambda: registry_version(published)))
    probes.append(probe("github", lambda: github_version(component)))
    probes.append(probe("github recorded tag", lambda: recorded_release_exists(component)))
    return probes


def live_asset(published: dict[str, Any]) -> Probe | None:
    """Check the recorded release asset is still served with its recorded bytes.

    Only a status that says the asset is gone reports absence. A rate limit or a
    server fault proves nothing about the recorded bytes, so it is inconclusive.
    """
    url = published.get("download_url")
    if not url:
        return None
    request = urllib.request.Request(str(url), headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            served = response.read()
    except urllib.error.HTTPError as error:
        if error.code in ABSENT_STATUSES:
            return Probe("asset", ABSENT, f"HTTP {error.code}, the recorded asset is not served")
        return Probe("asset", INCONCLUSIVE, f"HTTP {error.code}")
    except LIVE_ERRORS as error:
        return Probe("asset", INCONCLUSIVE, f"{type(error).__name__}: {error}")

    recorded = published.get("asset_bytes")
    if recorded is not None and len(served) != recorded:
        return Probe("asset", CHANGED, f"{len(served)} bytes, record says {recorded}")
    digest = published.get("asset_sha256")
    if digest is not None and hashlib.sha256(served).hexdigest() != digest:
        return Probe("asset", CHANGED, "SHA-256 differs from the record")
    return Probe("asset", FOUND, f"{len(served)} bytes at the recorded SHA-256")


def _version_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.findall(r"\d+", version))


def verify_live() -> int:
    """Report what each public source says about each recorded release.

    Every source is probed and reported independently. The command reports; it
    changes nothing, and its exit status is not evidence that anything matched.
    """
    record = load()
    drifted = False
    for name, component in record["components"].items():
        recorded = component["published"]["version"]
        probes = list(live_versions(component))
        asset = live_asset(component["published"])
        if asset is not None:
            probes.append(asset)

        for source, state, detail in probes:
            if state != FOUND:
                # ABSENT and CHANGED are findings; INCONCLUSIVE establishes nothing.
                if state in {ABSENT, CHANGED}:
                    drifted = True
                print(f"{name}: {source} {state}, {detail}")
                continue
            if source == "asset":
                print(f"{name}: {source} matches, {detail}")
                continue
            matches = detail == recorded or (source == "github recorded tag" and detail != MISSING)
            if not matches:
                drifted = True
            state_word = "matches" if matches else "DRIFT"
            print(f"{name}: {source} reports {detail}, record says {recorded} ({state_word})")

    if drifted:
        print(
            "\nReview each drift, then update scripts/release_record.json and the pages "
            "it covers. A newer release alone does not change a preserved evaluation."
        )
    return 0


def main(argv: list[str]) -> int:
    if "--verify-live" in argv:
        return verify_live()
    failures = check_record()
    for failure in failures:
        print(f"  FAIL {failure}")
    if failures:
        print(f"{len(failures)} release-record failure(s)")
        return 1
    print("release record matches the pages it covers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
