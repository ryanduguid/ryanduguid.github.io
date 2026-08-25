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
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://ryanduguid.github.io"
NOT_INDEXED = {"404.html"}

TITLE_MAX = 65
DESC_MIN = 50
DESC_MAX = 200
DESC_WARN = 165

PERSON_ID = f"{SITE}/about/#person"
EVIDENCE_REL = "evidence/index.html"
EVIDENCE_URL = f"{SITE}/evidence/"
PERSON_SAME_AS = [
    "https://github.com/ryanduguid",
    "https://www.linkedin.com/in/ryan-duguid",
]
AUTHORED_SOFTWARE = {
    "payday-super-checker": {
        "id": f"{SITE}/about/#payday-super-checker",
        "repository": "https://github.com/ryanduguid/payday-super-checker",
        "references": ["https://pypi.org/project/payday-super-checker/"],
    },
    "aus-accounting-mcp": {
        "id": f"{SITE}/about/#aus-accounting-mcp",
        "repository": "https://github.com/ryanduguid/au-tax-mcp-server",
        "references": [
            "https://glama.ai/mcp/servers/ryanduguid/au-tax-mcp-server",
            "https://registry.modelcontextprotocol.io/v0.1/servers/"
            "io.github.ryanduguid%2Faus-accounting/versions/latest",
        ],
    },
}
RETRIEVAL_CRAWLERS = {
    "OAI-SearchBot",
    "ChatGPT-User",
    "Claude-SearchBot",
    "Claude-User",
    "PerplexityBot",
    "Perplexity-User",
    "Applebot",
    "DuckAssistBot",
    "MistralAI-User",
    "YouBot",
}
TRAINING_CRAWLERS = {"GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"}
UNCLASSIFIED_CRAWLERS = {"CCBot", "Bytespider", "Amazonbot"}

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


def json_ld_blocks(html: str, rel: str, failures: list[str]) -> list[object]:
    blocks: list[object] = []
    for raw in re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, re.S
    ):
        try:
            blocks.append(json.loads(raw))
        except json.JSONDecodeError as exc:
            failures.append(f"{rel}: JSON-LD does not parse: {exc}")
    return blocks


def nodes(value: object) -> list[dict]:
    """Return JSON-LD objects recursively, including objects inside arrays."""
    found: list[dict] = []

    def visit(candidate: object) -> None:
        if isinstance(candidate, dict):
            found.append(candidate)
            for child in candidate.values():
                visit(child)
        elif isinstance(candidate, list):
            for child in candidate:
                visit(child)

    visit(value)
    return found


def has_type(node: dict, expected: str) -> bool:
    """Whether a JSON-LD node declares the requested type."""
    value = node.get("@type")
    return value == expected or (isinstance(value, list) and expected in value)


def indexed_nodes(paths: list[Path], failures: list[str]) -> list[tuple[str, dict]]:
    """Return every top-level JSON-LD node from indexable HTML files."""
    found: list[tuple[str, dict]] = []
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        if rel in NOT_INDEXED:
            continue
        for block in json_ld_blocks(path.read_text(encoding="utf-8"), rel, failures):
            found.extend((rel, node) for node in nodes(block) if isinstance(node, dict))
    return found


def check_person_graph(paths: list[Path]) -> list[str]:
    """Check that About owns the one canonical Person and authored works."""
    failures: list[str] = []
    graph_nodes = indexed_nodes(paths, failures)
    people = [(rel, node) for rel, node in graph_nodes if has_type(node, "Person")]
    if len(people) != 1:
        found = ", ".join(rel for rel, _ in people) or "none"
        failures.append(
            f"person graph: expected exactly one Person node across indexable HTML, found "
            f"{len(people)} ({found})"
        )
    canonical_people = [(rel, node) for rel, node in people if rel == "about/index.html"]
    if len(canonical_people) != 1:
        failures.append("person graph: about/index.html must contain the canonical Person node")
    else:
        person_rel, person = canonical_people[0]
        if person_rel != "about/index.html":
            failures.append(f"person graph: Person node is in {person_rel}, not about/index.html")
        if person.get("@id") != PERSON_ID:
            failures.append(
                f"person graph: Person @id is {person.get('@id')!r}, expected {PERSON_ID!r}"
            )
        if person.get("sameAs") != PERSON_SAME_AS:
            failures.append(
                "person graph: Person sameAs must contain only the GitHub user and LinkedIn "
                "URLs in the required order"
            )

    software = [
        (rel, node) for rel, node in graph_nodes if has_type(node, "SoftwareSourceCode")
    ]
    if len(software) != len(AUTHORED_SOFTWARE):
        failures.append(
            f"person graph: expected {len(AUTHORED_SOFTWARE)} SoftwareSourceCode nodes, "
            f"found {len(software)}"
        )
    for name, expected in AUTHORED_SOFTWARE.items():
        matches = [(rel, node) for rel, node in software if node.get("name") == name]
        if len(matches) != 1:
            failures.append(
                f"person graph: expected one SoftwareSourceCode node named {name!r}, "
                f"found {len(matches)}"
            )
            continue
        rel, node = matches[0]
        if rel != "about/index.html":
            failures.append(f"person graph: {name} is in {rel}, not about/index.html")
        if node.get("@id") != expected["id"]:
            failures.append(f"person graph: {name} does not have its stable About @id")
        if node.get("author") != {"@id": PERSON_ID}:
            failures.append(f"person graph: {name} is not authored by the canonical Person")
        if node.get("codeRepository") != expected["repository"]:
            failures.append(f"person graph: {name} does not name its GitHub repository")
        if not node.get("license"):
            failures.append(f"person graph: {name} does not declare a licence")
        same_as = node.get("sameAs")
        if not isinstance(same_as, list) or any(
            reference not in same_as for reference in expected["references"]
        ):
            failures.append(f"person graph: {name} is missing its distribution references")
    return failures


def check_evidence_page() -> list[str]:
    """Keep the public evidence page linked, bounded and person-referential."""
    failures: list[str] = []
    evidence_path = ROOT / EVIDENCE_REL
    if not evidence_path.is_file():
        failures.append(f"{EVIDENCE_REL}: evidence page does not exist")

    sitemap_count = sitemap_urls().count(EVIDENCE_URL)
    if sitemap_count != 1:
        failures.append(
            f"sitemap.xml: evidence URL must appear once, found {sitemap_count}"
        )
    llms_count = (ROOT / "llms.txt").read_text(encoding="utf-8").count(EVIDENCE_URL)
    if llms_count != 1:
        failures.append(f"llms.txt: evidence URL must appear once, found {llms_count}")

    for rel in ("index.html", "about/index.html"):
        page = (ROOT / rel).read_text(encoding="utf-8")
        page = re.sub(r"<(script|style|template)\b.*?</\1>", " ", page, flags=re.S | re.I)
        page = re.sub(r"<!--.*?-->", " ", page, flags=re.S)
        if not re.search(r'<a\b[^>]*href="/evidence/"[^>]*>', page, re.I):
            failures.append(f"{rel}: no visible link to /evidence/")

    if not evidence_path.is_file():
        return failures

    html = evidence_path.read_text(encoding="utf-8")
    text = visible_text(html).casefold()
    canonical_match = re.search(r'<link rel="canonical" href="(.*?)"', html)
    if not canonical_match or canonical_match.group(1) != EVIDENCE_URL:
        found = canonical_match.group(1) if canonical_match else None
        failures.append(
            f"{EVIDENCE_REL}: canonical is {found!r}, expected {EVIDENCE_URL!r}"
        )

    nodes_on_evidence = [
        node
        for block in json_ld_blocks(html, EVIDENCE_REL, failures)
        for node in nodes(block)
    ]
    articles = [
        node
        for node in nodes_on_evidence
        if has_type(node, "TechArticle") or has_type(node, "WebPage")
    ]
    if not any(node.get("author") == {"@id": PERSON_ID} for node in articles):
        failures.append(
            f"{EVIDENCE_REL}: TechArticle or WebPage is not authored by the canonical Person"
        )
    if any(has_type(node, "Person") for node in nodes_on_evidence):
        failures.append(f"{EVIDENCE_REL}: must not define a local Person node")

    concepts = {
        "synthetic": r"\bsynthetic\b",
        "versioned": r"\bversion(?:ed|ing|s)?\b",
        "local": r"\blocal\b",
        "human review": r"\bhuman\b.{0,80}\breview\w*\b",
        "primary source": r"\bprimary\s+source\w*\b",
    }
    for label, pattern in concepts.items():
        if not re.search(pattern, text, re.S | re.I):
            failures.append(f"{EVIDENCE_REL}: visible text does not name {label}")
    return failures


def robots_groups(robots: str) -> dict[str, list[str]]:
    """Parse the simple one-agent robots groups used by this site."""
    groups: dict[str, list[str]] = {}
    agents: list[str] = []
    directives_started = False
    for raw_line in robots.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            agents = []
            directives_started = False
            continue
        key, separator, value = line.partition(":")
        if not separator:
            continue
        key = key.strip().casefold()
        value = value.strip()
        if key == "user-agent":
            if directives_started:
                agents = []
                directives_started = False
            agents.append(value)
            groups.setdefault(value, [])
        elif key in {"allow", "disallow"}:
            for agent in agents:
                groups[agent].append(f"{key.title()}: {value}")
            directives_started = True
    return groups


def check_robots_policy(robots: str) -> list[str]:
    """Keep search and user retrieval open while blocking training crawlers."""
    failures: list[str] = []
    groups = robots_groups(robots)
    expected = {"*": ["Allow: /"]}
    expected.update({agent: ["Allow: /"] for agent in RETRIEVAL_CRAWLERS})
    expected.update({agent: ["Disallow: /"] for agent in TRAINING_CRAWLERS})

    for agent, directives in expected.items():
        if groups.get(agent) != directives:
            failures.append(
                f"robots.txt: {agent} must have exactly {directives!r}, found "
                f"{groups.get(agent)!r}"
            )
    unexpected = sorted(set(groups) - set(expected))
    if unexpected:
        failures.append(
            f"robots.txt: unclassified crawler groups are not allowed: {', '.join(unexpected)}"
        )
    for agent in UNCLASSIFIED_CRAWLERS:
        if agent.casefold() in robots.casefold():
            failures.append(f"robots.txt: must not mention unclassified crawler {agent}")
    return failures


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
            if isinstance(block, dict):
                contexts = [block.get("@context")]
            elif isinstance(block, list):
                contexts = [
                    item.get("@context") for item in block if isinstance(item, dict)
                ]
            else:
                contexts = []
            if not contexts or any(context != "https://schema.org" for context in contexts):
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
    failures.extend(check_person_graph(paths))
    failures.extend(check_evidence_page())
    failures.extend(check_robots_policy(robots))

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
    nested_and_array_nodes = [
        {"@type": "Article", "author": {"@type": "Person"}},
        {"@type": "SoftwareSourceCode"},
    ]
    assert [node.get("@type") for node in nodes(nested_and_array_nodes)] == [
        "Article",
        "Person",
        "SoftwareSourceCode",
    ]

    global ROOT
    original_root = ROOT
    with tempfile.TemporaryDirectory() as temp_dir:
        ROOT = Path(temp_dir)
        try:
            (ROOT / "index.html").write_text(
                "<!-- <a href=\"/evidence/\">Evidence</a> -->"
                "<script><a href=\"/evidence/\">Evidence</a></script>"
                "<template><a href=\"/evidence/\">Evidence</a></template>",
                encoding="utf-8",
            )
            about = ROOT / "about"
            about.mkdir()
            (about / "index.html").write_text(
                '<a href="/evidence/">Evidence</a>', encoding="utf-8"
            )
            evidence = ROOT / "evidence"
            evidence.mkdir()
            (evidence / "index.html").write_text("", encoding="utf-8")
            (ROOT / "sitemap.xml").write_text(
                f"<loc>{EVIDENCE_URL}</loc>", encoding="utf-8"
            )
            (ROOT / "llms.txt").write_text(EVIDENCE_URL, encoding="utf-8")

            failures = check_evidence_page()
            assert "index.html: no visible link to /evidence/" in failures
        finally:
            ROOT = original_root
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
