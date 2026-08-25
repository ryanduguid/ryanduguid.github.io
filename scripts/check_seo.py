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
from dataclasses import dataclass, field
from html.parser import HTMLParser
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
HOMEPAGE_PROOF_HREFS = [
    "/tools/coal-lsl-levy/",
    "/evidence/",
    "https://coallsl.com.au/guidance-notes/eligible-wages",
    "https://coallsl.com.au/about-us/governing-legislation/legislation",
]
ARTICLE_PATTERN_PAGES = {
    "about/index.html",
    "evidence/index.html",
    "tools/ato-benchmarks/index.html",
    "tools/australian-tax-ai-agents/index.html",
    "tools/company-tax-franking/index.html",
    "tools/payday-super/index.html",
    "tools/review-ready-gate/index.html",
    "tools/subcontractor-ledgers/index.html",
    "tools/trust-distributions/index.html",
    "tools/wip-schedule/index.html",
    "tools/xero-trial-balance/index.html",
    "rates/super-guarantee/index.html",
    "rates/div7a-benchmark-rate/index.html",
    "rates/cents-per-kilometre/index.html",
}
RATE_PAGES = {
    "rates/super-guarantee/index.html",
    "rates/div7a-benchmark-rate/index.html",
    "rates/cents-per-kilometre/index.html",
}
CALCULATOR_REL = "tools/coal-lsl-levy/index.html"
CALCULATOR_MARKERS = [
    'name="branch"',
    'id="branch-fields"',
    'id="sacrificed"',
    'id="bonus-rows"',
    'type="submit"',
]
CALCULATOR_REQUIRED_IDS = {
    "calc-form",
    "branch-fields",
    "sacrificed",
    "bonus-rows",
    "add-bonus",
    "result",
    "employeeLabel",
    "add-employee",
    "employee-table",
    "employee-rows",
    "employee-total-wages",
    "employee-total-levy",
    "export-csv",
    "fields-baseRate",
    "baseRate",
    "overtime",
    "allowances",
    "fields-annual",
    "annualSalary",
    "fields-casual",
    "reportingMonth",
    "instrumentSpecifiesLoading",
    "loadingQuantifiable",
    "casualBasePay",
    "casualLoading",
    "ordinaryPay",
    "bonus-row-template",
}
CALCULATOR_NUMBER_INPUT_IDS = (
    "sacrificed",
    "baseRate",
    "overtime",
    "allowances",
    "annualSalary",
    "casualBasePay",
    "casualLoading",
    "ordinaryPay",
)
BONUS_FREQUENCIES = [
    "weekly",
    "fortnightly",
    "monthly",
    "quarterly",
    "halfYearly",
    "annually",
]

VOID_ELEMENTS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}
NON_RENDERED_ELEMENTS = {"script", "style", "template"}


@dataclass
class HtmlElement:
    """One parsed HTML element with enough structure for local contract checks."""

    tag: str
    attrs: dict[str, str | None]
    parent: HtmlElement | None = field(default=None, repr=False)
    children: list[HtmlElement | str] = field(default_factory=list, repr=False)

    def attr(self, name: str) -> str | None:
        return self.attrs.get(name.casefold())

    def has_class(self, name: str) -> bool:
        return name in (self.attr("class") or "").split()


class StructureParser(HTMLParser):
    """Build a small element tree while retaining template controls for checks."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = HtmlElement("#document", {})
        self.stack = [self.root]

    def _add_element(
        self, tag: str, attrs: list[tuple[str, str | None]], push: bool
    ) -> None:
        element = HtmlElement(
            tag.casefold(),
            {name.casefold(): value for name, value in attrs},
            self.stack[-1],
        )
        self.stack[-1].children.append(element)
        if push and element.tag not in VOID_ELEMENTS:
            self.stack.append(element)

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        self._add_element(tag, attrs, push=True)

    def handle_startendtag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        self._add_element(tag, attrs, push=False)

    def handle_endtag(self, tag: str) -> None:
        wanted = tag.casefold()
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == wanted:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        self.stack[-1].children.append(data)


def parse_structure(html: str) -> HtmlElement:
    parser = StructureParser()
    parser.feed(html)
    parser.close()
    return parser.root


def is_rendered(element: HtmlElement) -> bool:
    current: HtmlElement | None = element
    while current is not None:
        if current.tag in NON_RENDERED_ELEMENTS:
            return False
        current = current.parent
    return True


def descendants(
    element: HtmlElement,
    tag: str | None = None,
    *,
    rendered_only: bool = False,
) -> list[HtmlElement]:
    """Return descendant elements in source order, optionally excluding templates."""
    found: list[HtmlElement] = []

    def visit(parent: HtmlElement) -> None:
        for child in parent.children:
            if not isinstance(child, HtmlElement):
                continue
            if (tag is None or child.tag == tag) and (
                not rendered_only or is_rendered(child)
            ):
                found.append(child)
            visit(child)

    visit(element)
    return found


def element_text(element: HtmlElement) -> str:
    """Visible descendant text with whitespace collapsed."""
    chunks: list[str] = []

    def visit(parent: HtmlElement) -> None:
        for child in parent.children:
            if isinstance(child, str):
                chunks.append(child)
            elif child.tag not in NON_RENDERED_ELEMENTS:
                visit(child)

    visit(element)
    return re.sub(r"\s+", " ", " ".join(chunks)).strip()


def element_by_id(root: HtmlElement, identifier: str) -> list[HtmlElement]:
    return [element for element in descendants(root) if element.attr("id") == identifier]


def is_descendant(element: HtmlElement, ancestor: HtmlElement) -> bool:
    current = element.parent
    while current is not None:
        if current is ancestor:
            return True
        current = current.parent
    return False


def check_homepage_contract(html: str, failures: list[str]) -> None:
    """Keep the approved homepage claims and primary proof routes visible."""
    text = visible_text(html)
    for required in HOMEPAGE_REQUIRED_TEXT:
        if required not in text:
            failures.append(f"index.html: missing approved homepage text {required!r}")
    root = parse_structure(html)
    hrefs = [
        link.attr("href")
        for link in descendants(root, "a", rendered_only=True)
    ]
    for href in HOMEPAGE_REQUIRED_HREFS:
        if href not in hrefs:
            failures.append(f"index.html: missing visible homepage route {href}")

    proof_features = [
        element
        for element in descendants(root, rendered_only=True)
        if element.has_class("proof-feature")
    ]
    if len(proof_features) != 1:
        failures.append(
            f"index.html: expected exactly one proof feature, found {len(proof_features)}"
        )
        return
    proof_hrefs = {
        link.attr("href")
        for link in descendants(proof_features[0], "a", rendered_only=True)
    }
    for href in HOMEPAGE_PROOF_HREFS:
        if href not in proof_hrefs:
            failures.append(f"index.html: proof feature is missing required link {href}")


def check_article_pattern(html: str, rel: str, failures: list[str]) -> None:
    """Require the reusable article and local-contents pattern."""
    root = parse_structure(html)
    articles = descendants(root, "article", rendered_only=True)
    if len(articles) != 1:
        failures.append(f"{rel}: expected exactly one article element")
    toc_blocks = [
        nav
        for nav in descendants(root, "nav", rendered_only=True)
        if nav.attr("aria-label") == "On this page"
    ]
    if len(toc_blocks) != 1:
        failures.append(f"{rel}: expected exactly one On this page navigation")
        return
    toc = toc_blocks[0]
    if len(articles) == 1 and not is_descendant(toc, articles[0]):
        failures.append(f"{rel}: On this page navigation must be inside the article")

    links = descendants(toc, "a", rendered_only=True)
    if not links:
        failures.append(
            f"{rel}: On this page navigation must contain at least one local link"
        )
        return
    target_ids = {
        element.attr("id")
        for element in descendants(root, rendered_only=True)
        if element.attr("id")
    }
    valid_links = 0
    for link in links:
        href = link.attr("href") or ""
        if not href.startswith("#") or href[1:] not in target_ids:
            failures.append(f"{rel}: local contents target does not exist: {href}")
        else:
            valid_links += 1
    if valid_links == 0:
        failures.append(
            f"{rel}: On this page navigation must contain at least one valid local link"
        )


def check_rate_table_region(html: str, rel: str, failures: list[str]) -> None:
    root = parse_structure(html)
    tables = descendants(root, "table", rendered_only=True)

    def has_labelled_region(table: HtmlElement) -> bool:
        ancestor = table.parent
        while ancestor is not None:
            if (
                ancestor.tag == "div"
                and ancestor.attr("role") == "region"
                and bool((ancestor.attr("aria-label") or "").strip())
                and ancestor.attr("tabindex") == "0"
            ):
                return True
            ancestor = ancestor.parent
        return False

    if not tables or any(not has_labelled_region(table) for table in tables):
        failures.append(f"{rel}: reference table is not inside a labelled keyboard-scroll region")


def check_id_contract(
    root: HtmlElement,
    identifier: str,
    tag: str,
    attributes: dict[str, str],
    failures: list[str],
    *,
    present: tuple[str, ...] = (),
) -> HtmlElement | None:
    """Require one identified control and the attributes its controller relies on."""
    matches = element_by_id(root, identifier)
    if len(matches) != 1:
        failures.append(
            f"{CALCULATOR_REL}: expected exactly one #{identifier}, found {len(matches)}"
        )
        return None
    element = matches[0]
    if element.tag != tag:
        failures.append(
            f"{CALCULATOR_REL}: #{identifier} must be {tag}, found {element.tag}"
        )
        return element
    for name, expected in attributes.items():
        actual = element.attr(name)
        if actual != expected:
            failures.append(
                f"{CALCULATOR_REL}: #{identifier} {name} must be {expected!r}, "
                f"found {actual!r}"
            )
    for name in present:
        if name not in element.attrs:
            failures.append(f"{CALCULATOR_REL}: #{identifier} must have {name}")
    return element


def check_calculator_contract(html: str, failures: list[str]) -> None:
    positions = [html.find(marker) for marker in CALCULATOR_MARKERS]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        failures.append(
            f"{CALCULATOR_REL}: calculator markers missing or out of order: {positions}"
        )

    root = parse_structure(html)
    ids = {
        element.attr("id")
        for element in descendants(root)
        if element.attr("id")
    }
    missing_ids = sorted(CALCULATOR_REQUIRED_IDS - ids)
    if missing_ids:
        failures.append(f"{CALCULATOR_REL}: missing protected field IDs: {missing_ids}")

    branch_radios = [
        element
        for element in descendants(root, "input")
        if element.attr("name") == "branch"
    ]
    branch_contract = [
        (radio.attr("type"), radio.attr("value"), "checked" in radio.attrs)
        for radio in branch_radios
    ]
    expected_branch_contract = [
        ("radio", "baseRate", True),
        ("radio", "annual", False),
        ("radio", "casual", False),
    ]
    if branch_contract != expected_branch_contract:
        failures.append(f"{CALCULATOR_REL}: branch radio contract changed")

    number_attributes = {
        "type": "number",
        "min": "0",
        "step": "0.01",
        "inputmode": "decimal",
    }
    for identifier in CALCULATOR_NUMBER_INPUT_IDS:
        check_id_contract(
            root,
            identifier,
            "input",
            {"name": identifier, **number_attributes},
            failures,
        )
    check_id_contract(
        root,
        "reportingMonth",
        "input",
        {"type": "month", "name": "reportingMonth"},
        failures,
        present=("required",),
    )
    for identifier in ("instrumentSpecifiesLoading", "loadingQuantifiable"):
        check_id_contract(
            root,
            identifier,
            "input",
            {"type": "checkbox", "name": identifier},
            failures,
        )
    check_id_contract(
        root, "employeeLabel", "input", {"type": "text"}, failures
    )
    for identifier in ("add-bonus", "add-employee", "export-csv"):
        check_id_contract(
            root, identifier, "button", {"type": "button"}, failures
        )

    forms = element_by_id(root, "calc-form")
    if len(forms) == 1:
        submit_buttons = [
            button
            for button in descendants(forms[0], "button")
            if button.attr("type") == "submit"
        ]
        if len(submit_buttons) != 1:
            failures.append(
                f"{CALCULATOR_REL}: #calc-form must contain exactly one submit button"
            )

    bonus_templates = element_by_id(root, "bonus-row-template")
    if len(bonus_templates) == 1:
        bonus_template = bonus_templates[0]
        bonus_amounts = [
            element
            for element in descendants(bonus_template, "input")
            if element.has_class("bonus-amount")
        ]
        if len(bonus_amounts) != 1:
            failures.append(
                f"{CALCULATOR_REL}: expected exactly one .bonus-amount input"
            )
        else:
            for name, expected in number_attributes.items():
                actual = bonus_amounts[0].attr(name)
                if actual != expected:
                    failures.append(
                        f"{CALCULATOR_REL}: .bonus-amount {name} must be "
                        f"{expected!r}, found {actual!r}"
                    )

        frequency_selects = [
            element
            for element in descendants(bonus_template, "select")
            if element.has_class("bonus-frequency")
        ]
        found_frequencies: list[str | None] = []
        if len(frequency_selects) == 1:
            found_frequencies = [
                option.attr("value")
                for option in descendants(frequency_selects[0], "option")
            ]
        if found_frequencies != BONUS_FREQUENCIES:
            failures.append(
                f"{CALCULATOR_REL}: bonus frequency values must be "
                f"{BONUS_FREQUENCIES!r}, found {found_frequencies!r}"
            )

        remove_buttons = [
            element
            for element in descendants(bonus_template, "button")
            if element.has_class("bonus-remove")
        ]
        if len(remove_buttons) != 1 or remove_buttons[0].attr("type") != "button":
            failures.append(
                f"{CALCULATOR_REL}: .bonus-remove must be a button with type 'button'"
            )

    result_tags = element_by_id(root, "result")
    if len(result_tags) != 1:
        failures.append(f"{CALCULATOR_REL}: expected one #result region")
    else:
        result_tag = result_tags[0]
        if (
            result_tag.tag != "div"
            or result_tag.attr("role") != "status"
            or result_tag.attr("aria-live") != "polite"
        ):
            failures.append(f"{CALCULATOR_REL}: #result must be a polite status region")

    result_position = html.find('id="result"')
    employee_position = html.find('id="employeeLabel"')
    disclaimer_position = html.find('id="disclaimer"')
    if not 0 <= result_position < employee_position < disclaimer_position:
        failures.append(
            f"{CALCULATOR_REL}: result, employee workflow and disclaimer are out of order"
        )

    if "from '/assets/levy.mjs'" not in html:
        failures.append(f"{CALCULATOR_REL}: protected levy engine import changed")


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
    if rel in RATE_PAGES:
        check_rate_table_region(html, rel, failures)
    if rel == CALCULATOR_REL:
        check_calculator_contract(html, failures)

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
    root = parse_structure(html)
    mains = descendants(root, "main", rendered_only=True)
    if len(mains) != 1 or mains[0].attr("id") != "main":
        failures.append(
            f"{rel}: expected exactly one rendered main#main, found "
            f"{len(mains)} main elements"
        )

    skip_links = []
    for link in descendants(root, "a", rendered_only=True):
        if link.has_class("skip-link") and link.attr("href") == "#main":
            skip_links.append(link)
    if len(skip_links) != 1:
        failures.append(
            f"{rel}: expected exactly one .skip-link targeting #main, found {len(skip_links)}"
        )

    primary_blocks = [
        nav
        for nav in descendants(root, "nav", rendered_only=True)
        if nav.attr("aria-label") == "Primary"
    ]
    if len(primary_blocks) != 1:
        failures.append(
            f"{rel}: expected exactly one nav labelled Primary, found {len(primary_blocks)}"
        )
        return

    links = [
        (link.attr("href"), element_text(link))
        for link in descendants(primary_blocks[0], "a", rendered_only=True)
    ]
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

    missing_negative_failures: list[str] = []

    def expect_failure(actual: list[str], expected: str) -> None:
        if expected not in actual:
            missing_negative_failures.append(
                f"expected {expected!r}, found {actual!r}"
            )

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
    duplicate_main_failures: list[str] = []
    check_shared_shell(
        valid_shell.replace("</main>", "</main><main></main>"),
        "self-check",
        duplicate_main_failures,
    )
    expect_failure(
        duplicate_main_failures,
        "self-check: expected exactly one rendered main#main, found 2 main elements",
    )
    valid_homepage = """
    <main>
      <h1>I build accounting systems that can show their work.</h1>
      <h2>Data and Ledgers</h2><h2>Rules and Engines</h2>
      <h2>Agent Workflows</h2><h2>Review Controls</h2>
      <h2>Install in 2 commands</h2>
      <h2>Proof belongs beside the claim</h2>
      <a href="/tools/australian-tax-ai-agents/">AI agents</a>
      <section class="proof-feature">
        <a href="/tools/coal-lsl-levy/">Coal LSL levy calculator</a>
        <a href="/evidence/">Evidence</a>
        <a href="https://coallsl.com.au/guidance-notes/eligible-wages">Eligible wages</a>
        <a href="https://coallsl.com.au/about-us/governing-legislation/legislation">Legislation</a>
      </section>
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
    misplaced_proof_link = valid_homepage.replace(
        '<a href="/evidence/">Evidence</a>', "", 1
    ).replace(
        "</main>", '<a href="/evidence/">Evidence elsewhere</a></main>', 1
    )
    misplaced_proof_failures: list[str] = []
    check_homepage_contract(misplaced_proof_link, misplaced_proof_failures)
    expect_failure(
        misplaced_proof_failures,
        "index.html: proof feature is missing required link /evidence/",
    )
    valid_article = """
    <article><nav aria-label="On this page">
      <a href="#first">First</a><a href="#second">Second</a>
    </nav><h2 id="first">First</h2><h2 id="second">Second</h2></article>
    """
    article_failures: list[str] = []
    check_article_pattern(valid_article, "self-check", article_failures)
    assert article_failures == []
    empty_contents_failures: list[str] = []
    check_article_pattern(
        '<article><nav aria-label="On this page"></nav><h2 id="first">First</h2></article>',
        "self-check",
        empty_contents_failures,
    )
    expect_failure(
        empty_contents_failures,
        "self-check: On this page navigation must contain at least one local link",
    )
    broken_contents_failures: list[str] = []
    check_article_pattern(
        '<article><nav aria-label="On this page"><a href="#missing">Missing</a></nav>'
        '<h2 id="first">First</h2></article>',
        "self-check",
        broken_contents_failures,
    )
    expect_failure(
        broken_contents_failures,
        "self-check: local contents target does not exist: #missing",
    )
    valid_rate_region = (
        '<div role="region" aria-label="Reference rates" tabindex="0">'
        "<table><tr><td>12</td></tr></table></div>"
    )
    rate_region_failures: list[str] = []
    check_rate_table_region(valid_rate_region, "self-check", rate_region_failures)
    assert rate_region_failures == []
    sibling_rate_table_failures: list[str] = []
    check_rate_table_region(
        '<div role="region" aria-label="Reference rates" tabindex="0"></div>'
        "<table><tr><td>12</td></tr></table>",
        "self-check",
        sibling_rate_table_failures,
    )
    expect_failure(
        sibling_rate_table_failures,
        "self-check: reference table is not inside a labelled keyboard-scroll region",
    )
    valid_calculator = """
    <form id="calc-form">
      <input type="radio" name="branch" value="baseRate" checked>
      <input type="radio" name="branch" value="annual">
      <input type="radio" name="branch" value="casual">
      <div id="branch-fields"></div>
      <input type="number" name="sacrificed" min="0" step="0.01"
        inputmode="decimal" id="sacrificed">
      <div id="bonus-rows"></div><button id="add-bonus" type="button"></button>
      <button type="submit"></button>
    </form>
    <div id="result" role="status" aria-live="polite"></div>
    <input type="text" id="employeeLabel">
    <button id="add-employee" type="button"></button>
    <table id="employee-table"><tbody id="employee-rows"></tbody>
      <tfoot><tr><td id="employee-total-wages"></td>
      <td id="employee-total-levy"></td></tr></tfoot></table>
    <button id="export-csv" type="button"></button><div id="disclaimer"></div>
    <template id="fields-baseRate">
      <input type="number" name="baseRate" min="0" step="0.01"
        inputmode="decimal" id="baseRate">
      <input type="number" name="overtime" min="0" step="0.01"
        inputmode="decimal" id="overtime">
      <input type="number" name="allowances" min="0" step="0.01"
        inputmode="decimal" id="allowances">
    </template>
    <template id="fields-annual">
      <input type="number" name="annualSalary" min="0" step="0.01"
        inputmode="decimal" id="annualSalary">
    </template>
    <template id="fields-casual">
      <input type="month" name="reportingMonth" id="reportingMonth" required>
      <input type="checkbox" name="instrumentSpecifiesLoading"
        id="instrumentSpecifiesLoading">
      <input type="checkbox" name="loadingQuantifiable" id="loadingQuantifiable">
      <input type="number" name="casualBasePay" min="0" step="0.01"
        inputmode="decimal" id="casualBasePay">
      <input type="number" name="casualLoading" min="0" step="0.01"
        inputmode="decimal" id="casualLoading">
      <input type="number" name="ordinaryPay" min="0" step="0.01"
        inputmode="decimal" id="ordinaryPay">
    </template>
    <template id="bonus-row-template">
      <input type="number" min="0" step="0.01" inputmode="decimal"
        class="bonus-amount">
      <select class="bonus-frequency">
        <option value="weekly">Weekly</option>
        <option value="fortnightly">Fortnightly</option>
        <option value="monthly">Monthly</option>
        <option value="quarterly">Quarterly</option>
        <option value="halfYearly">Half-yearly</option>
        <option value="annually">Annually</option>
      </select>
      <button type="button" class="bonus-remove"></button>
    </template>
    <script type="module">import {} from '/assets/levy.mjs';</script>
    """
    calculator_failures: list[str] = []
    check_calculator_contract(valid_calculator, calculator_failures)
    assert calculator_failures == []
    calculator_mutations = [
        (
            valid_calculator.replace('name="sacrificed"', 'name="changedSacrificed"'),
            f"{CALCULATOR_REL}: #sacrificed name must be 'sacrificed', found "
            "'changedSacrificed'",
        ),
        (
            valid_calculator.replace('name="baseRate" min="0"', 'name="baseRate" min="-1"'),
            f"{CALCULATOR_REL}: #baseRate min must be '0', found '-1'",
        ),
        (
            valid_calculator.replace('name="overtime" min="0" step="0.01"',
                                     'name="overtime" min="0" step="1"'),
            f"{CALCULATOR_REL}: #overtime step must be '0.01', found '1'",
        ),
        (
            valid_calculator.replace('id="reportingMonth" required', 'id="reportingMonth"'),
            f"{CALCULATOR_REL}: #reportingMonth must have required",
        ),
        (
            valid_calculator.replace('id="add-employee" type="button"',
                                     'id="add-employee" type="submit"'),
            f"{CALCULATOR_REL}: #add-employee type must be 'button', found 'submit'",
        ),
        (
            valid_calculator.replace('<option value="monthly">',
                                     '<option value="yearly">'),
            f"{CALCULATOR_REL}: bonus frequency values must be "
            "['weekly', 'fortnightly', 'monthly', 'quarterly', 'halfYearly', "
            "'annually'], found ['weekly', 'fortnightly', 'yearly', 'quarterly', "
            "'halfYearly', 'annually']",
        ),
        (
            valid_calculator.replace('type="radio" name="branch" value="annual"',
                                     'type="checkbox" name="branch" value="annual"'),
            f"{CALCULATOR_REL}: branch radio contract changed",
        ),
        (
            valid_calculator.replace(
                '<div id="result" role="status" aria-live="polite"></div>',
                '<span id="result" role="status" aria-live="polite"></span>',
            ),
            f"{CALCULATOR_REL}: #result must be a polite status region",
        ),
    ]
    for mutated_calculator, expected_failure in calculator_mutations:
        mutation_failures: list[str] = []
        check_calculator_contract(mutated_calculator, mutation_failures)
        expect_failure(mutation_failures, expected_failure)

    assert not missing_negative_failures, (
        "negative self-check fixtures did not emit their required messages:\n  "
        + "\n  ".join(missing_negative_failures)
    )
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
