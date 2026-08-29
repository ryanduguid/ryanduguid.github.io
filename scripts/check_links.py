"""Link and content checks for every HTML file in the repository.

Checks, in order, per file:
1. Every github.com/ryanduguid/<repo> link resolves to that exact repository.
   A rename redirect (301 to a different repo path) is a FAILURE even though
   the request ends in a 200, because redirects break if the old name is reused.
2. Every same-origin link, whether an absolute https://duguid.com.au/...
   href or a root-relative one like "/tools/payday-super/" or
   "/assets/site.css", resolves to a file on disk instead of being fetched.
   The site is served from main; this branch's own pages are not live yet, so
   fetching them would fail even when the link is correct. Checking the file
   on disk catches a typo immediately, sooner than a live fetch ever could.
3. Every other absolute http(s) link resolves (2xx after redirects). Transient
   transport failures and HTTP 5xx responses are retried up to five times;
   HTTP 4xx responses are not.
   HTTP 403 from exact allow-listed ATO source URLs is accepted as an
   automation denial.
4. The HTML parses cleanly and links carry no empty href.
5. Retired repository names and em or en dashes must not appear.

Known gap: the calculator page loads its engine with an ES module import
("import { ... } from '/assets/levy.mjs'" inside a <script type="module">
body), not an href or src attribute, so HTMLParser never sees that path and
a typo there would not be caught here even after the module resolution
below. That import is not checked; the levy engine tests are the guard for
that file instead. This script deliberately stays a stdlib HTML-attribute
checker, not a JavaScript parser.

Exit 0 clean, 1 on any failure. Stdlib only.
"""

from __future__ import annotations

import functools
import re
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

import seo_core as core

ROOT = Path(__file__).resolve().parent.parent

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
MAX_FETCH_ATTEMPTS = 5

SELF_ORIGIN = "https://duguid.com.au"

ATO_AUTOMATION_DENIAL_URLS = frozenset(
    {
        "https://www.ato.gov.au/",
        (
            "https://www.ato.gov.au/businesses-and-organisations/"
            "preparing-lodging-and-paying/business-activity-statements-bas"
        ),
        (
            "https://www.ato.gov.au/businesses-and-organisations/"
            "gst-excise-and-indirect-taxes/gst/"
            "lodging-your-bas-or-annual-gst-return/"
            "options-for-reporting-and-paying-gst/monthly-gst-reporting"
        ),
        (
            "https://www.ato.gov.au/law/view/document?"
            "DocID=COG%2FLCR20262%2FNAT%2FATO%2F00001"
        ),
        (
            "https://www.ato.gov.au/tax-rates-and-codes/"
            "key-superannuation-rates-and-thresholds/super-guarantee"
        ),
        (
            "https://www.ato.gov.au/businesses-and-organisations/"
            "income-deductions-and-concessions/small-business-benchmarks"
        ),
        "https://www.ato.gov.au/tax-rates-and-codes/company-tax-rates",
        (
            "https://www.ato.gov.au/law/view/view.htm?"
            "docid=COG%2FPCG20222%2FNAT%2FATO%2F00001"
        ),
    }
)


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


@functools.lru_cache(maxsize=None)
def fetch_final_url(
    url: str, *, opener: object = urllib.request.urlopen
) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, MAX_FETCH_ATTEMPTS + 1):
        try:
            with opener(req, timeout=30) as resp:  # type: ignore[operator]
                return resp.status, resp.geturl()
        except urllib.error.HTTPError as exc:
            if not 500 <= exc.code < 600 or attempt == MAX_FETCH_ATTEMPTS:
                raise
            print(f"retry {attempt}/{MAX_FETCH_ATTEMPTS - 1} {url}: HTTP {exc.code}")
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt == MAX_FETCH_ATTEMPTS:
                raise
            print(f"retry {attempt}/{MAX_FETCH_ATTEMPTS - 1} {url}: {exc}")
    raise AssertionError("unreachable")


def is_accepted_automation_denial(url: str, status: int) -> bool:
    """True only for exact ATO source denials reproduced on GitHub runners."""
    return url in ATO_AUTOMATION_DENIAL_URLS and status == 403


def is_self_origin(href: str) -> bool:
    """True for any href whose scheme and host are this site's own."""
    parts = urlsplit(href)
    return f"{parts.scheme}://{parts.netloc}" == SELF_ORIGIN


def self_origin_target(href: str) -> Path:
    """Map a same-origin URL's path to the file it must resolve to on disk.

    The bare origin and any path ending in "/" map to that directory's
    index.html, matching how GitHub Pages serves a directory. A path with no
    trailing slash maps to a file of that exact name.
    """
    path = urlsplit(href).path
    if not path or path == "/":
        return ROOT / "index.html"
    if path.endswith("/"):
        return ROOT / path.strip("/") / "index.html"
    return ROOT / path.lstrip("/")


OWN_REPO = re.compile(r"^https://github\.com/ryanduguid/([A-Za-z0-9._-]+)")


def check_file(path: Path) -> list[str]:
    """Run every check against a single HTML file, return its failures."""
    failures: list[str] = []
    rel = path.relative_to(ROOT).as_posix()
    html = path.read_text(encoding="utf-8")

    parser = LinkCollector()
    parser.feed(html)
    parser.close()
    if parser.empty_hrefs:
        failures.append(f"{rel}: {parser.empty_hrefs} empty href/src attribute(s)")

    for name in RETIRED_NAMES:
        if name in html:
            failures.append(f"{rel}: retired repository name: {name}")
    for ch, label in (("—", "em dash"), ("–", "en dash")):
        if ch in html:
            failures.append(f"{rel}: {label} present")

    seen: set[str] = set()
    for href in parser.hrefs:
        if href in seen:
            continue
        # Root-relative hrefs ("/", "/tools/foo/", "/assets/site.css") are
        # same-origin by construction; admit them alongside absolute http(s)
        # links rather than skipping them, which is the bug this fixes.
        if not (href.startswith("http") or href.startswith("/")):
            continue
        seen.add(href)
        if href.startswith("/") or is_self_origin(href):
            target = self_origin_target(href)
            if not target.is_file():
                failures.append(
                    f"{rel}: {href} -> no file at {target.relative_to(ROOT).as_posix()} "
                    "(same-origin link does not resolve on disk)"
                )
            else:
                print(f"ok {rel}: {href} -> {target.relative_to(ROOT).as_posix()} (same-origin, checked on disk)")
            continue
        try:
            status, final = fetch_final_url(href)
        except urllib.error.HTTPError as exc:
            if is_accepted_automation_denial(href, exc.code):
                print(
                    f"accepted automation denial {rel}: {href} -> HTTP {exc.code} "
                    "(exact allow-listed ATO URL)"
                )
            else:
                failures.append(f"{rel}: {href} -> HTTP {exc.code}")
            continue
        except Exception as exc:  # noqa: BLE001 - report every failure mode
            failures.append(f"{rel}: {href} -> {exc}")
            continue
        if status >= 400:
            failures.append(f"{rel}: {href} -> HTTP {status}")
            continue
        m = OWN_REPO.match(href)
        if m:
            fm = OWN_REPO.match(final)
            if not fm or fm.group(1).lower() != m.group(1).lower():
                failures.append(
                    f"{rel}: {href} redirected to {final} (rename redirect, repoint the link)"
                )
        print(f"ok {rel}: {href}")

    print(f"{rel}: {len(seen)} links checked")
    return failures


def html_files() -> list[Path]:
    """Every public site HTML file, excluding generated and hidden paths."""
    return core.html_files(ROOT)


def _self_check() -> None:
    found = html_files()
    names = {p.relative_to(ROOT).as_posix() for p in found}
    assert "index.html" in names, f"index.html not discovered, got {sorted(names)}"
    assert "404.html" in names, f"404.html not discovered, got {sorted(names)}"
    assert all(p.suffix == ".html" for p in found), "non-HTML path returned"
    assert is_accepted_automation_denial(
        "https://www.ato.gov.au/", 403
    ), "exact ATO root HTTP 403 must be an accepted automation denial"
    assert is_accepted_automation_denial(
        "https://www.ato.gov.au/businesses-and-organisations/"
        "preparing-lodging-and-paying/business-activity-statements-bas",
        403,
    ), "exact ATO BAS HTTP 403 must be an accepted automation denial"
    assert is_accepted_automation_denial(
        "https://www.ato.gov.au/businesses-and-organisations/"
        "gst-excise-and-indirect-taxes/gst/lodging-your-bas-or-annual-gst-return/"
        "options-for-reporting-and-paying-gst/monthly-gst-reporting",
        403,
    ), "exact ATO monthly GST HTTP 403 must be an accepted automation denial"
    assert is_accepted_automation_denial(
        "https://www.ato.gov.au/law/view/document?"
        "DocID=COG%2FLCR20262%2FNAT%2FATO%2F00001",
        403,
    ), "exact ATO LCR 2026/2 HTTP 403 must be an accepted automation denial"
    assert not is_accepted_automation_denial("https://www.ato.gov.au/about-us/", 403), (
        "an ATO path HTTP 403 must still fail"
    )
    assert not is_accepted_automation_denial("https://www.ato.gov.au/", 404), (
        "ATO root HTTP errors other than 403 must still fail"
    )
    print(f"self-check OK: {len(found)} HTML files discovered")


def main() -> int:
    _self_check()
    failures: list[str] = []
    for path in html_files():
        failures.extend(check_file(path))

    if failures:
        print(f"\n{len(failures)} failure(s):")
        for f in failures:
            print(f"  FAIL {f}")
        return 1
    print("\nall clear")
    return 0


if __name__ == "__main__":
    sys.exit(main())
