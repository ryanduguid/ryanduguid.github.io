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

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import seo_core as core

RECORD = Path(__file__).resolve().parent / "release_record.json"
TIMEOUT = 20
USER_AGENT = "duguid-site-release-record/1 (+https://duguid.com.au)"
# A page that documents an older release than the published one must say so in
# its own words. The sentence must name both versions and mark which is current.
GAP_MARKER = "published release"


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
        # A documented release may legitimately lag. The gap must be explicit.
        if GAP_MARKER not in visible or published["version"] not in visible:
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

    if published["release_url"] not in html:
        failures.append(f"{rel}: does not link the published release record")

    for command in component.get("pinned_commands", []):
        if command not in core.raw_text(html):
            failures.append(f"{rel}: pinned reproduction command is missing: {command}")

    tracking = component.get("tracking_commands", [])
    if any(command in core.raw_text(html) for command in tracking):
        if "tracks the published package" not in visible:
            failures.append(
                f"{rel}: unpinned adoption commands must be labelled as tracking "
                "the published package"
            )
    return failures


def check_unreleased(root: Path, name: str, component: dict[str, Any]) -> list[str]:
    """No page may present an unreleased default-branch version as downloadable."""
    unreleased = component.get("unreleased_default_branch")
    if not unreleased:
        return []
    failures: list[str] = []
    version = unreleased["version"]
    pattern = re.compile(rf'href="[^"]*/(?:download|releases/tag)/v?{re.escape(version)}[/"]')
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
        if evaluation["version"] not in visible:
            failures.append(
                f"{rel}: preserved evaluation must keep release "
                f"{evaluation['version']} visible"
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


def live_versions(component: dict[str, Any]) -> dict[str, str]:
    """Current versions from each public source that component declares."""
    published = component["published"]
    found: dict[str, str] = {}
    pypi = published.get("pypi_url")
    if pypi:
        name = pypi.rstrip("/").rsplit("/", 1)[-1]
        found["pypi"] = fetch_json(f"https://pypi.org/pypi/{name}/json")["info"]["version"]
    registry = published.get("registry_url")
    if registry:
        payload = fetch_json(registry)
        server = payload.get("server", payload)
        found["registry"] = str(server.get("version"))
    repository = component["repository"]
    owner_repo = repository.removeprefix("https://github.com/")
    releases = fetch_json(f"https://api.github.com/repos/{owner_repo}/releases?per_page=100")
    prefix = published["release_url"].rsplit("/tag/", 1)[-1].removesuffix(published["version"])
    tags = [
        release["tag_name"]
        for release in releases
        if not release["draft"] and not release["prerelease"]
        and release["tag_name"].startswith(prefix)
    ]
    if tags:
        found["github"] = max(tags, key=lambda tag: _version_key(tag[len(prefix):]))[len(prefix):]
    return found


def _version_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.findall(r"\d+", version))


def verify_live() -> int:
    """Report drift between the reviewed record and the public release sources."""
    record = load()
    drifted = False
    for name, component in record["components"].items():
        recorded = component["published"]["version"]
        try:
            found = live_versions(component)
        except (urllib.error.URLError, TimeoutError, OSError, KeyError, ValueError) as error:
            # A failed fetch is inconclusive. It never rewrites or fails a claim.
            print(f"{name}: INCONCLUSIVE, {type(error).__name__}: {error}")
            continue
        for source, version in found.items():
            state = "matches" if version == recorded else "DRIFT"
            if version != recorded:
                drifted = True
            print(f"{name}: {source} reports {version}, record says {recorded} ({state})")
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
