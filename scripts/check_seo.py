"""Metadata and structured data checks for every HTML file in the repository.

The link checker next door proves the site's links resolve. This one proves the
site is legible to search engines and to the retrieval layer behind AI answer
engines, which is a different failure mode: a page can have perfect links and
still be invisible because it has no canonical, no description, or structured
data that claims content the page does not show.

Checks, per file:
1. <html lang> is set.
2. Exactly one <title>, non-empty, at most 65 characters.
3. A meta description between 50 and 200 characters.
4. A canonical link matching the file's own path on the live site.
5. og:title, og:url and og:image, with og:url matching the canonical.
6. At least one JSON-LD block, every one of which parses and declares
   https://schema.org as its @context.
7. Exactly one <h1>.
8. Every FAQPage question and answer in the structured data also appears in the
   visible HTML. Marking up an answer the reader cannot see is against Google's
   own structured data policy, and it is the easiest way for a page to end up
   asserting something the author never wrote.

Then, site-wide:
9. sitemap.xml lists every indexable page, and every URL it lists resolves to a
   file on disk.
10. llms.txt links every page the sitemap lists.

404.html is exempt from the canonical, sitemap and llms.txt rules: it is served
under any missing path and carries a noindex.

Exit 0 clean, 1 on any failure. Warnings do not fail the run. Stdlib only.
"""

from __future__ import annotations

import html as html_lib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://ryanduguid.github.io"
NOT_INDEXED = {"404.html"}

TITLE_MAX = 65
DESC_MIN = 50
DESC_MAX = 200
DESC_WARN = 165

warnings: list[str] = []


def site_url(rel: str) -> str:
    """The live URL a repository-relative HTML path is served at."""
    if rel == "index.html":
        return f"{SITE}/"
    if rel.endswith("/index.html"):
        return f"{SITE}/{rel[: -len('index.html')]}"
    return f"{SITE}/{rel}"


def meta(html: str, attr: str, value: str) -> str | None:
    m = re.search(
        rf'<meta {attr}="{re.escape(value)}" content="(.*?)"\s*/?>', html, re.S
    )
    return html_lib.unescape(m.group(1)).strip() if m else None


def visible_text(html: str) -> str:
    """The page with script, style and tags stripped, whitespace collapsed."""
    body = re.sub(r"<(script|style|template)\b.*?</\1>", " ", html, flags=re.S | re.I)
    body = re.sub(r"<!--.*?-->", " ", body, flags=re.S)
    body = re.sub(r"<[^>]+>", " ", body)
    return re.sub(r"\s+", " ", html_lib.unescape(body)).strip()


def json_ld_blocks(html: str, rel: str, failures: list[str]) -> list[dict]:
    blocks: list[dict] = []
    for raw in re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, re.S
    ):
        try:
            blocks.append(json.loads(raw))
        except json.JSONDecodeError as exc:
            failures.append(f"{rel}: JSON-LD does not parse: {exc}")
    return blocks


def nodes(block: dict) -> list[dict]:
    graph = block.get("@graph")
    return graph if isinstance(graph, list) else [block]


def check_faq_visible(node: dict, text: str, rel: str, failures: list[str]) -> None:
    for question in node.get("mainEntity", []):
        name = question.get("name", "")
        answer = question.get("acceptedAnswer", {}).get("text", "")
        for label, claim in (("question", name), ("answer", answer)):
            needle = re.sub(r"\s+", " ", claim).strip()
            if needle and needle not in text:
                failures.append(
                    f"{rel}: FAQPage {label} is not visible on the page: {needle[:70]}..."
                )


def check_file(path: Path) -> list[str]:
    failures: list[str] = []
    rel = path.relative_to(ROOT).as_posix()
    html = path.read_text(encoding="utf-8")
    text = visible_text(html)
    indexed = rel not in NOT_INDEXED

    if not re.search(r'<html lang="[a-zA-Z-]+"', html):
        failures.append(f"{rel}: no lang attribute on <html>")

    titles = re.findall(r"<title>(.*?)</title>", html, re.S)
    if len(titles) != 1 or not titles[0].strip():
        failures.append(f"{rel}: expected exactly one non-empty <title>, found {len(titles)}")
    elif len(titles[0].strip()) > TITLE_MAX:
        failures.append(
            f"{rel}: title is {len(titles[0].strip())} characters, over the {TITLE_MAX} limit"
        )

    desc = meta(html, "name", "description")
    if desc is None:
        failures.append(f"{rel}: no meta description")
    elif not DESC_MIN <= len(desc) <= DESC_MAX:
        failures.append(
            f"{rel}: meta description is {len(desc)} characters, outside {DESC_MIN} to {DESC_MAX}"
        )
    elif len(desc) > DESC_WARN:
        warnings.append(
            f"{rel}: meta description is {len(desc)} characters, likely truncated in results"
        )

    h1s = re.findall(r"<h1[^>]*>", html)
    if len(h1s) != 1:
        failures.append(f"{rel}: expected exactly one <h1>, found {len(h1s)}")

    canonical = None
    m = re.search(r'<link rel="canonical" href="(.*?)"', html)
    if m:
        canonical = m.group(1)
    if indexed:
        expected = site_url(rel)
        if canonical is None:
            failures.append(f"{rel}: no canonical link")
        elif canonical != expected:
            failures.append(f"{rel}: canonical is {canonical}, expected {expected}")

        for prop in ("og:title", "og:url", "og:image"):
            if meta(html, "property", prop) is None:
                failures.append(f"{rel}: no {prop}")
        og_url = meta(html, "property", "og:url")
        if og_url and canonical and og_url != canonical:
            failures.append(f"{rel}: og:url is {og_url}, canonical is {canonical}")

        blocks = json_ld_blocks(html, rel, failures)
        if not blocks:
            failures.append(f"{rel}: no JSON-LD structured data")
        for block in blocks:
            if block.get("@context") != "https://schema.org":
                failures.append(f"{rel}: JSON-LD @context is not https://schema.org")
            for node in nodes(block):
                if node.get("@type") == "FAQPage":
                    check_faq_visible(node, text, rel, failures)

    print(f"checked {rel}")
    return failures


def sitemap_urls() -> list[str]:
    xml = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    return re.findall(r"<loc>(.*?)</loc>", xml)


def check_site(paths: list[Path]) -> list[str]:
    failures: list[str] = []
    listed = sitemap_urls()
    expected = {site_url(p.relative_to(ROOT).as_posix()) for p in paths
                if p.relative_to(ROOT).as_posix() not in NOT_INDEXED}

    for url in sorted(set(expected) - set(listed)):
        failures.append(f"sitemap.xml: does not list {url}")
    for url in sorted(set(listed) - set(expected)):
        failures.append(f"sitemap.xml: lists {url}, which is not an indexable page")
    if len(listed) != len(set(listed)):
        failures.append("sitemap.xml: duplicate <loc> entries")

    llms = (ROOT / "llms.txt").read_text(encoding="utf-8")
    for url in sorted(expected):
        if url not in llms:
            failures.append(f"llms.txt: does not link {url}")

    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    if f"Sitemap: {SITE}/sitemap.xml" not in robots:
        failures.append("robots.txt: no Sitemap line")

    print(f"checked sitemap.xml ({len(listed)} URLs), llms.txt, robots.txt")
    return failures


def html_files() -> list[Path]:
    return sorted(
        p
        for p in ROOT.rglob("*.html")
        if not any(part.startswith(".") for part in p.relative_to(ROOT).parts)
    )


def _self_check() -> None:
    assert site_url("index.html") == f"{SITE}/"
    assert site_url("about/index.html") == f"{SITE}/about/"
    assert site_url("404.html") == f"{SITE}/404.html"
    assert visible_text("<p>a <b>b</b></p><script>var x = 'hidden';</script>") == "a b"
    assert meta('<meta name="description" content="x &amp; y" />', "name", "description") == "x & y"
    print("self-check OK")


def main() -> int:
    _self_check()
    paths = html_files()
    failures: list[str] = []
    for path in paths:
        failures.extend(check_file(path))
    failures.extend(check_site(paths))

    for w in warnings:
        print(f"  WARN {w}")
    if failures:
        print(f"\n{len(failures)} failure(s):")
        for f in failures:
            print(f"  FAIL {f}")
        return 1
    print("\nall clear")
    return 0


if __name__ == "__main__":
    sys.exit(main())
