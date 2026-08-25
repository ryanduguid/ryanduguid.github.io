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
9. Every ItemList count matches its entries, whose positions are sequential.

Then, site-wide:
10. sitemap.xml lists every indexable page, and every URL it lists resolves to a
   file on disk.
11. llms.txt links every page the sitemap lists.

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
WORKED_EXAMPLES = {
    "tools/payday-super/index.html": {
        "fixture_urls": [
            "https://github.com/ryanduguid/payday-super-checker/blob/v0.1.2/"
            "tests/test_integration.py#L836-L887"
        ],
        "labels": {
            "on-time": r"\bon[-_ ]time\b",
            "late": r"\blate\b",
            "at-risk or unknown": r"\b(?:at[-_ ]risk|unknown)\b",
        },
    },
    "tools/xero-trial-balance/index.html": {
        "fixture_urls": [
            "https://github.com/ryanduguid/xero-trial-balance-export/blob/v0.1.4/"
            "tests/test_export_tb.py#L189-L208",
            "https://github.com/ryanduguid/xero-trial-balance-export/blob/v0.1.4/"
            "tests/test_export_tb.py#L419-L431",
        ],
        "labels": {
            "balanced": r"\bbalanced\b",
            "write": r"\b(?:write|writes|written)\b",
            "unbalanced": r"\bunbalanced\b",
            "refused": r"\brefus\w*\b",
        },
    },
}

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


def visible_html(html: str) -> str:
    """HTML with non-rendered script, style, template and comment content removed."""
    html = re.sub(r"<(script|style|template)\b.*?</\1>", " ", html, flags=re.S | re.I)
    return re.sub(r"<!--.*?-->", " ", html, flags=re.S)


def visible_text(html: str) -> str:
    """The page with script, style and tags stripped, whitespace collapsed."""
    body = visible_html(html)
    body = re.sub(r"<[^>]+>", " ", body)
    return re.sub(r"\s+", " ", html_lib.unescape(body)).strip()


PRIMARY_NAV_LINKS = [
    ("/about/", "About"),
    ("/evidence/", "Evidence"),
    ("/tools/australian-tax-ai-agents/", "AI agents"),
    ("https://github.com/ryanduguid", "GitHub"),
    (
        "https://github.com/ryanduguid/awesome-australian-accounting-tech",
        "Awesome List",
    ),
]

HOMEPAGE_REQUIRED_TEXT = [
    "I build accounting systems that can show their work.",
    "Data and Ledgers",
    "Rules and Engines",
    "Agent Workflows",
    "Review Controls",
    "Install in 2 commands",
    "Proof belongs beside the claim",
]
HOMEPAGE_REQUIRED_HREFS = [
    "/evidence/",
    "/tools/australian-tax-ai-agents/",
    "/tools/coal-lsl-levy/",
]
ARTICLE_PATTERN_PAGES = {"about/index.html", "evidence/index.html"}


def opening_tags(html: str, tag: str) -> list[str]:
    """Return rendered opening tags without script, style or template content."""
    return re.findall(rf"<{tag}\b[^>]*>", visible_html(html), re.I)


def tag_attr(tag: str, name: str) -> str | None:
    """Read one quoted HTML attribute from an opening tag."""
    match = re.search(
        rf"\b{re.escape(name)}\s*=\s*([\"'])(.*?)\1", tag, re.I | re.S
    )
    return html_lib.unescape(match.group(2)).strip() if match else None


def check_homepage_contract(html: str, failures: list[str]) -> None:
    """Keep the approved homepage claims and primary proof routes visible."""
    text = visible_text(html)
    for required in HOMEPAGE_REQUIRED_TEXT:
        if required not in text:
            failures.append(f"index.html: missing approved homepage text {required!r}")
    rendered = visible_html(html)
    hrefs = [tag_attr(tag, "href") for tag in opening_tags(rendered, "a")]
    for href in HOMEPAGE_REQUIRED_HREFS:
        if href not in hrefs:
            failures.append(f"index.html: missing visible homepage route {href}")


def check_article_pattern(html: str, rel: str, failures: list[str]) -> None:
    """Require the reusable article and local-contents pattern."""
    rendered = visible_html(html)
    if len(opening_tags(rendered, "article")) != 1:
        failures.append(f"{rel}: expected exactly one article element")
    toc_blocks = re.findall(
        r"<nav\b(?=[^>]*\baria-label\s*=\s*([\"'])On this page\1)[^>]*>(.*?)</nav>",
        rendered,
        re.I | re.S,
    )
    if len(toc_blocks) != 1:
        failures.append(f"{rel}: expected exactly one On this page navigation")
        return
    ids = set(re.findall(r"\bid\s*=\s*([\"'])(.*?)\1", rendered, re.I | re.S))
    target_ids = {value for _, value in ids}
    for tag in opening_tags(toc_blocks[0][1], "a"):
        href = tag_attr(tag, "href") or ""
        if not href.startswith("#") or href[1:] not in target_ids:
            failures.append(f"{rel}: local contents target does not exist: {href}")


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


def check_payday_receipt_boundary(html: str) -> list[str]:
    """Keep the three missing-receipt branches accurate without freezing prose."""
    failures: list[str] = []
    visible_html = re.sub(
        r"<(script|style|template)\b.*?</\1>", " ", html, flags=re.S | re.I
    )
    visible_html = re.sub(r"<!--.*?-->", " ", visible_html, flags=re.S)
    paragraphs = [
        visible_text(paragraph)
        for paragraph in re.findall(r"<p\b[^>]*>.*?</p>", visible_html, re.S | re.I)
    ]
    text = " ".join(paragraphs)

    categorical_at_risk = (
        r"\b(?:without|missing|no)\b.{0,80}\b(?:fund[- ]?)?receipt(?:\s+date|\s+evidence)?\b"
        r".{0,80}\b(?:can|will)\s+only\b.{0,40}\b(?:at[-_ ]risk|unknown)\b"
    )
    if re.search(categorical_at_risk, text, re.S | re.I):
        failures.append(
            "tools/payday-super/index.html: must not say a missing receipt can only be "
            "at-risk or unknown"
        )

    boundary_patterns = (
        r"\b(?:without|missing|no)\b.{0,80}\b(?:fund[- ]?)?receipt(?:\s+date|\s+evidence)?\b"
        r".{0,100}\b(?:cannot|can't|does\s+not|doesn't)\b.{0,40}\bprov\w*\b"
        r".{0,30}\bon[-_ ]time\b",
        r"\bremittance\s+tim\w*\b.{0,80}\bprov\w*\b.{0,30}\blate\b",
        r"\btimely\s+remittance\b.{0,80}\bwithout\b.{0,50}"
        r"\b(?:fund[- ]?)?receipt(?:\s+date|\s+evidence)?\b.{0,80}"
        r"\b(?:remain\w*|stay\w*|is)\b.{0,30}\bat[-_ ]risk\b",
    )
    if not any(
        all(re.search(pattern, paragraph, re.S | re.I) for pattern in boundary_patterns)
        for paragraph in paragraphs
    ):
        failures.append(
            "tools/payday-super/index.html: no visible paragraph says missing receipt "
            "cannot prove on-time, remittance timing can prove late, and timely remittance "
            "without receipt remains at-risk"
        )
    return failures


def check_worked_examples() -> list[str]:
    """Keep each synthetic example visible and tied to tagged test evidence."""
    failures: list[str] = []
    for rel, expected in WORKED_EXAMPLES.items():
        html = (ROOT / rel).read_text(encoding="utf-8")
        visible_html = re.sub(
            r"<(script|style|template)\b.*?</\1>", " ", html, flags=re.S | re.I
        )
        visible_html = re.sub(r"<!--.*?-->", " ", visible_html, flags=re.S)
        heading = re.search(
            r"<h([1-6])\b[^>]*>.*?\bsynthetic\s+worked\s+example\b.*?</h\1>",
            visible_html,
            re.S | re.I,
        )
        if not heading:
            failures.append(f"{rel}: no visible Synthetic worked example heading")
            example_html = ""
        else:
            remainder = visible_html[heading.end():]
            next_heading = re.search(r"<h[1-6]\b", remainder, re.I)
            example_end = (
                heading.end() + next_heading.start() if next_heading else len(visible_html)
            )
            example_html = visible_html[heading.start():example_end]
        example_text = visible_text(example_html)

        for fixture_url in expected["fixture_urls"]:
            if not re.search(
                rf'<a\b[^>]*href="{re.escape(fixture_url)}"[^>]*>',
                example_html,
                re.I,
            ):
                failures.append(f"{rel}: no visible tagged fixture link to {fixture_url}")
        if re.search(r'href="[^"]*github\.com/[^"]*/blob/main/', example_html, re.I):
            failures.append(f"{rel}: worked-example evidence must not use an unpinned main URL")

        for label, pattern in expected["labels"].items():
            if not re.search(pattern, example_text, re.I):
                failures.append(f"{rel}: visible worked example does not label {label}")
        if rel == "tools/payday-super/index.html":
            failures.extend(check_payday_receipt_boundary(html))
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


def check_item_lists(value: object, rel: str, failures: list[str]) -> None:
    """Keep declared ItemList counts and positions aligned with their entries."""
    for node in nodes(value):
        if not has_type(node, "ItemList"):
            continue
        items = node.get("itemListElement")
        if not isinstance(items, list):
            failures.append(f"{rel}: ItemList itemListElement is not a list")
            continue
        declared_count = node.get("numberOfItems")
        if type(declared_count) is not int:
            failures.append(
                f"{rel}: ItemList numberOfItems must be an integer, "
                f"found {declared_count!r}"
            )
        elif declared_count != len(items):
            failures.append(
                f"{rel}: ItemList declares {declared_count!r} items, "
                f"but contains {len(items)}"
            )
        positions = [
            item.get("position") if isinstance(item, dict) else None for item in items
        ]
        expected = list(range(1, len(items) + 1))
        if any(type(position) is not int for position in positions):
            failures.append(
                f"{rel}: ItemList positions must be integers, found {positions!r}"
            )
        elif positions != expected:
            failures.append(
                f"{rel}: ItemList positions are {positions!r}, expected {expected!r}"
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
        check_shared_shell(html, rel, failures)
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
            check_item_lists(block, rel, failures)
            for node in nodes(block):
                if node.get("@type") == "FAQPage":
                    check_faq_visible(node, text, rel, failures)

    if rel == "index.html":
        check_homepage_contract(html, failures)
    if rel in ARTICLE_PATTERN_PAGES:
        check_article_pattern(html, rel, failures)

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
    failures.extend(check_worked_examples())
    failures.extend(check_robots_policy(robots))

    print(f"checked sitemap.xml ({len(listed)} URLs), llms.txt, robots.txt")
    return failures


def check_shared_shell(html: str, rel: str, failures: list[str]) -> None:
    """Require one skip target and the exact global primary navigation."""
    rendered = visible_html(html)
    mains = [tag for tag in opening_tags(rendered, "main") if tag_attr(tag, "id") == "main"]
    if len(mains) != 1:
        failures.append(f"{rel}: expected exactly one main#main, found {len(mains)}")

    skip_links = []
    for tag in opening_tags(rendered, "a"):
        classes = (tag_attr(tag, "class") or "").split()
        if "skip-link" in classes and tag_attr(tag, "href") == "#main":
            skip_links.append(tag)
    if len(skip_links) != 1:
        failures.append(
            f"{rel}: expected exactly one .skip-link targeting #main, found {len(skip_links)}"
        )

    primary_blocks = re.findall(
        r'<nav\b(?=[^>]*\baria-label\s*=\s*(["\'])Primary\1)[^>]*>(.*?)</nav>',
        rendered,
        re.I | re.S,
    )
    if len(primary_blocks) != 1:
        failures.append(
            f"{rel}: expected exactly one nav labelled Primary, found {len(primary_blocks)}"
        )
        return

    links = []
    for tag, label in re.findall(r"(<a\b[^>]*>)(.*?)</a>", primary_blocks[0][1], re.I | re.S):
        links.append((tag_attr(tag, "href"), visible_text(label)))
    if links != PRIMARY_NAV_LINKS:
        failures.append(f"{rel}: primary navigation is {links!r}, expected {PRIMARY_NAV_LINKS!r}")


def html_files() -> list[Path]:
    return sorted(
        p
        for p in ROOT.rglob("*.html")
        if not any(part.startswith(".") for part in p.relative_to(ROOT).parts)
    )


def _self_check() -> None:
    global ROOT

    assert site_url("index.html") == f"{SITE}/"
    assert site_url("about/index.html") == f"{SITE}/about/"
    assert site_url("404.html") == f"{SITE}/404.html"
    assert visible_text("<p>a <b>b</b></p><script>var x = 'hidden';</script>") == "a b"
    assert meta('<meta name="description" content="x &amp; y" />', "name", "description") == "x & y"
    valid_shell = """
    <a class="skip-link" href="#main">Skip to content</a>
    <header><nav aria-label="Primary">
      <a href="/about/">About</a><a href="/evidence/">Evidence</a>
      <a href="/tools/australian-tax-ai-agents/">AI agents</a>
      <a href="https://github.com/ryanduguid">GitHub</a>
      <a href="https://github.com/ryanduguid/awesome-australian-accounting-tech">Awesome List</a>
    </nav></header><main id="main"></main>
    """
    shell_failures: list[str] = []
    check_shared_shell(valid_shell, "self-check", shell_failures)
    assert shell_failures == []

    invalid_shell = valid_shell.replace("Awesome List", "Projects").replace(
        'id="main"', 'id="content"'
    )
    invalid_shell_failures: list[str] = []
    check_shared_shell(invalid_shell, "self-check", invalid_shell_failures)
    assert any("main#main" in failure for failure in invalid_shell_failures)
    assert any("primary navigation" in failure for failure in invalid_shell_failures)
    valid_homepage = """
    <main>
      <h1>I build accounting systems that can show their work.</h1>
      <h2>Data and Ledgers</h2><h2>Rules and Engines</h2>
      <h2>Agent Workflows</h2><h2>Review Controls</h2>
      <h2>Install in 2 commands</h2>
      <h2>Proof belongs beside the claim</h2>
      <a href="/evidence/">Evidence</a>
      <a href="/tools/australian-tax-ai-agents/">AI agents</a>
      <a href="/tools/coal-lsl-levy/">Coal LSL levy calculator</a>
    </main>
    """
    homepage_failures: list[str] = []
    check_homepage_contract(valid_homepage, homepage_failures)
    assert homepage_failures == []

    invalid_homepage = valid_homepage.replace(
        "I build accounting systems that can show their work.", ""
    )
    invalid_homepage_failures: list[str] = []
    check_homepage_contract(invalid_homepage, invalid_homepage_failures)
    assert any(
        "missing approved homepage text" in failure
        and "I build accounting systems" in failure
        for failure in invalid_homepage_failures
    )
    valid_article = """
    <article><nav aria-label="On this page">
      <a href="#first">First</a><a href="#second">Second</a>
    </nav><h2 id="first">First</h2><h2 id="second">Second</h2></article>
    """
    article_failures: list[str] = []
    check_article_pattern(valid_article, "self-check", article_failures)
    assert article_failures == []
    mcp_page = (ROOT / "tools/australian-tax-ai-agents/index.html").read_text(
        encoding="utf-8"
    )
    rendered_mcp_page = visible_html(mcp_page)
    commented_pypi_page = mcp_page.replace(
        '<a href="https://pypi.org/project/aus-accounting-mcp/">PyPI</a>',
        '<!-- <a href="https://pypi.org/project/aus-accounting-mcp/">PyPI</a> -->',
        1,
    )
    commented_rendered_mcp_page = visible_html(commented_pypi_page)
    assert not re.search(
        r'<a\b[^>]*href="https://pypi\.org/project/aus-accounting-mcp/"[^>]*>',
        commented_rendered_mcp_page,
        re.I,
    ), "a commented-out PyPI route must not satisfy the visible-route check"
    assert re.search(
        r'<a\b[^>]*href="https://pypi\.org/project/aus-accounting-mcp/"[^>]*>',
        rendered_mcp_page,
        re.I,
    ), "Australian tax AI agents page has no visible PyPI route"
    assert re.search(
        r"\buvx\s+--from\s*(?:\\\s*)?git\+https://github\.com/ryanduguid/au-tax-mcp-server"
        r"\s+aus-accounting-mcp\b",
        visible_text(rendered_mcp_page),
    ), "Australian tax AI agents page has no visible GitHub install command"
    assert re.search(
        r"\buvx\s+aus-accounting-mcp\b", visible_text(rendered_mcp_page)
    ), "Australian tax AI agents page has no visible direct PyPI install command"
    assert not re.search(
        r"\buntil\s+its\s+own\s+first\s+pypi\s+release\b",
        visible_text(rendered_mcp_page),
        re.I,
    ), "Australian tax AI agents page still says the PyPI release is pending"
    nested_and_array_nodes = [
        {"@type": "Article", "author": {"@type": "Person"}},
        {"@type": "SoftwareSourceCode"},
    ]
    assert [node.get("@type") for node in nodes(nested_and_array_nodes)] == [
        "Article",
        "Person",
        "SoftwareSourceCode",
    ]
    inaccurate_receipt_boundary = (
        '<p>Without a fund receipt date, a line can only be "at risk".</p>'
    )
    assert any(
        "must not say" in failure
        for failure in check_payday_receipt_boundary(inaccurate_receipt_boundary)
    )
    accurate_receipt_boundary = (
        "<p>Missing fund receipt evidence does not prove on-time. Remittance timing can "
        "prove late. A timely remittance without fund receipt evidence remains at-risk.</p>"
    )
    assert check_payday_receipt_boundary(accurate_receipt_boundary) == []
    accurate_item_list = {
        "@type": "ItemList",
        "numberOfItems": 2,
        "itemListElement": [
            {"@type": "ListItem", "position": 1},
            {"@type": "ListItem", "position": 2},
        ],
    }
    item_list_failures: list[str] = []
    check_item_lists(accurate_item_list, "self-check", item_list_failures)
    assert item_list_failures == []
    inaccurate_item_list = {
        "@type": "ItemList",
        "numberOfItems": 1,
        "itemListElement": [
            {"@type": "ListItem", "position": 1},
            {"@type": "ListItem", "position": 1},
        ],
    }
    check_item_lists(inaccurate_item_list, "self-check", item_list_failures)
    assert any("declares 1 items, but contains 2" in failure for failure in item_list_failures)
    assert any("positions are [1, 1]" in failure for failure in item_list_failures)
    boolean_item_list = {
        "@type": "ItemList",
        "numberOfItems": True,
        "itemListElement": [{"@type": "ListItem", "position": True}],
    }
    boolean_item_list_failures: list[str] = []
    check_item_lists(boolean_item_list, "self-check", boolean_item_list_failures)
    assert any(
        "numberOfItems must be an integer" in failure
        for failure in boolean_item_list_failures
    )
    assert any(
        "positions must be integers" in failure
        for failure in boolean_item_list_failures
    )
    float_item_list = {
        "@type": "ItemList",
        "numberOfItems": 1.0,
        "itemListElement": [{"@type": "ListItem", "position": 1.0}],
    }
    float_item_list_failures: list[str] = []
    check_item_lists(float_item_list, "self-check", float_item_list_failures)
    assert any(
        "numberOfItems must be an integer" in failure
        for failure in float_item_list_failures
    )
    assert any(
        "positions must be integers" in failure
        for failure in float_item_list_failures
    )

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
