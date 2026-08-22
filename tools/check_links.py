"""Link and content checks for index.html.

Checks, in order:
1. Every github.com/ryanduguid/<repo> link resolves to that exact repository.
   A rename redirect (301 to a different repo path) is a FAILURE even though
   the request ends in a 200, because redirects break if the old name is reused.
2. Every other absolute http(s) link resolves (2xx after redirects).
3. The HTML parses cleanly and links carry no empty href.
4. Retired repository names and em or en dashes must not appear.

Exit 0 clean, 1 on any failure. Stdlib only.
"""

from __future__ import annotations

import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

RETIRED_NAMES = [
    "CharlesHenryWickens",
    "JohnSpenceOgilvy",
    "MaryAddisonHamilton",
    "SirAlexanderFitzgerald",
    "RaymondChambers",
    "SirArthurFadden",
    "RussellMathews",
    "ElizabethAnneAlexander",
    "JohnKenley",
    "EdwinNixon",
    "LouisGoldberg",
]

USER_AGENT = "ryanduguid.github.io-link-check"


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.empty_hrefs = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name in ("href", "src"):
                if not value:
                    self.empty_hrefs += 1
                else:
                    self.hrefs.append(value)


def fetch_final_url(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, resp.geturl()


def main() -> int:
    failures: list[str] = []
    html = INDEX.read_text(encoding="utf-8")

    parser = LinkCollector()
    parser.feed(html)
    parser.close()
    if parser.empty_hrefs:
        failures.append(f"{parser.empty_hrefs} empty href/src attribute(s)")

    for name in RETIRED_NAMES:
        if name in html:
            failures.append(f"retired repository name in index.html: {name}")
    for ch, label in (("—", "em dash"), ("–", "en dash")):
        if ch in html:
            failures.append(f"{label} in index.html")

    own_repo = re.compile(r"^https://github\.com/ryanduguid/([A-Za-z0-9._-]+)")
    seen: set[str] = set()
    for href in parser.hrefs:
        if not href.startswith("http") or href in seen:
            continue
        seen.add(href)
        try:
            status, final = fetch_final_url(href)
        except Exception as exc:  # noqa: BLE001 - report every failure mode
            failures.append(f"{href} -> {exc}")
            continue
        if status >= 400:
            failures.append(f"{href} -> HTTP {status}")
            continue
        m = own_repo.match(href)
        if m:
            fm = own_repo.match(final)
            if not fm or fm.group(1).lower() != m.group(1).lower():
                failures.append(
                    f"{href} redirected to {final} (rename redirect, repoint the link)"
                )
        print(f"ok {href}")

    if failures:
        print(f"\n{len(failures)} failure(s):")
        for f in failures:
            print(f"  FAIL {f}")
        return 1
    print(f"\nall clear: {len(seen)} links checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
