"""Reusable HTML, metadata, structured-data and sitemap checks.

Site policy belongs in site_contracts.py. This module is deliberately limited to
parsing and checks that can be configured for another static site.
"""

from __future__ import annotations

import html as html_lib
import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GENERATED_HTML_DIRECTORIES = {"node_modules", "work"}

TITLE_MAX = 65
DESC_MIN = 50
DESC_MAX = 200
DESC_WARN = 165

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



def site_url(rel: str, site: str) -> str:
    """Return the live URL for a repository-relative HTML path."""
    if rel == "index.html":
        return f"{site}/"
    if rel.endswith("/index.html"):
        return f"{site}/{rel[: -len('index.html')]}"
    return f"{site}/{rel}"


def title_is_too_long(
    rel: str,
    title: str,
    title_exceptions: dict[str, str],
) -> bool:
    """Apply the general title limit and exact configured exceptions."""
    rendered_title = html_lib.unescape(title)
    return (
        len(rendered_title) > TITLE_MAX
        and title_exceptions.get(rel) != rendered_title
    )


def check_file_metadata(
    path: Path,
    *,
    site: str,
    not_indexed: set[str],
    title_exceptions: dict[str, str],
    warnings: list[str],
) -> list[str]:
    """Check generic metadata and structured-data contracts for one HTML file."""
    failures: list[str] = []
    rel = path.relative_to(ROOT).as_posix()
    html = path.read_text(encoding="utf-8")
    indexed = rel not in not_indexed

    if not re.search(r'<html lang="[a-zA-Z-]+"', html):
        failures.append(f"{rel}: no lang attribute on <html>")

    titles = re.findall(r"<title>(.*?)</title>", html, re.S)
    if len(titles) != 1 or not titles[0].strip():
        failures.append(f"{rel}: expected exactly one non-empty <title>, found {len(titles)}")
    elif title_is_too_long(rel, titles[0].strip(), title_exceptions):
        rendered_title = html_lib.unescape(titles[0].strip())
        failures.append(
            f"{rel}: title is {len(rendered_title)} characters, over the {TITLE_MAX} limit"
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
    match = re.search(r'<link rel="canonical" href="(.*?)"', html)
    if match:
        canonical = match.group(1)
    if not indexed:
        return failures

    expected = site_url(rel, site)
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
        if not contexts or any(
            context != "https://schema.org" for context in contexts
        ):
            failures.append(f"{rel}: JSON-LD @context is not https://schema.org")
        check_item_lists(block, rel, failures)
        for node in nodes(block):
            if node.get("@type") == "FAQPage":
                check_faq_visible(node, html, rel, failures)

    return failures


def check_sitemap(
    paths: list[Path],
    *,
    site: str,
    not_indexed: set[str],
    root: Path = ROOT,
) -> tuple[list[str], int]:
    """Check the sitemap, llms.txt coverage and robots sitemap declaration."""
    failures: list[str] = []
    listed = sitemap_urls(root)
    expected_html = {
        site_url(path.relative_to(root).as_posix(), site)
        for path in paths
        if path.relative_to(root).as_posix() not in not_indexed
    }
    expected_llms = expected_html | {f"{site}/llms.txt"}

    for url in sorted(expected_html - set(listed)):
        failures.append(f"sitemap.xml: does not list {url}")
    for url in sorted(set(listed) - expected_html):
        failures.append(f"sitemap.xml: lists {url}, which is not an indexable page")
    if len(listed) != len(set(listed)):
        failures.append("sitemap.xml: duplicate <loc> entries")

    llms = (root / "llms.txt").read_text(encoding="utf-8")
    for url in sorted(expected_llms):
        if url not in llms:
            failures.append(f"llms.txt: does not link {url}")

    robots = (root / "robots.txt").read_text(encoding="utf-8")
    if f"Sitemap: {site}/sitemap.xml" not in robots:
        failures.append("robots.txt: no Sitemap line")

    return failures, len(listed)


def meta(html: str, attr: str, value: str) -> str | None:
    m = re.search(
        rf'<meta {attr}="{re.escape(value)}" content="(.*?)"\s*/?>', html, re.S
    )
    return html_lib.unescape(m.group(1)).strip() if m else None


def visible_html(html: str) -> str:
    """HTML with non-rendered, hidden and comment content removed."""
    html = re.sub(r"<(script|style|template)\b.*?</\1>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.S)
    tag_pattern = re.compile(
        r"<(?P<closing>/)?(?P<name>[a-z][\w:-]*)\b(?P<attrs>[^>]*)>", re.I
    )
    hidden_attribute = re.compile(
        r"(?:^|\s)hidden\b(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?"
        r"|(?:^|\s)aria-hidden\s*=\s*(?:\"true\"|'true'|true)"
        r"|(?:^|\s)style\s*=\s*(?:\"[^\"]*(?:display\s*:\s*none\b|visibility\s*:\s*hidden\b)[^\"]*\""
        r"|'[^']*(?:display\s*:\s*none\b|visibility\s*:\s*hidden\b)[^']*'"
        r"|[^\s>]*(?:display\s*:\s*none\b|visibility\s*:\s*hidden\b)[^\s>]*)",
        re.I,
    )
    class_attribute = re.compile(
        r'(?:^|\s)class\s*=\s*(?:"(?P<double>[^"]*)"'
        r"|'(?P<single>[^']*)'|(?P<unquoted>[^\s>]+))",
        re.I,
    )

    def has_visually_hidden_class(attrs: str) -> bool:
        match = class_attribute.search(attrs)
        if not match:
            return False
        value = next(group for group in match.groups() if group is not None)
        return "visually-hidden" in html_lib.unescape(value).split()

    void_elements = {
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
    rendered: list[str] = []
    hidden_stack: list[str] = []
    position = 0
    for tag in tag_pattern.finditer(html):
        if not hidden_stack:
            rendered.append(html[position : tag.start()])
        name = tag.group("name").casefold()
        attrs = tag.group("attrs")
        closing = bool(tag.group("closing"))
        self_closing = attrs.rstrip().endswith("/") or name in void_elements
        if hidden_stack:
            if closing and name in hidden_stack:
                start = len(hidden_stack) - 1 - hidden_stack[::-1].index(name)
                del hidden_stack[start:]
            elif not closing and not self_closing:
                hidden_stack.append(name)
        elif not closing and (
            hidden_attribute.search(attrs) or has_visually_hidden_class(attrs)
        ):
            rendered.append(" ")
            if not self_closing:
                hidden_stack.append(name)
        else:
            rendered.append(tag.group(0))
        position = tag.end()
    if not hidden_stack:
        rendered.append(html[position:])
    return "".join(rendered)


def visible_text(html: str) -> str:
    """The page with script, style and tags stripped, whitespace collapsed."""
    body = visible_html(html)
    body = re.sub(r"<[^>]+>", " ", body)
    return re.sub(r"\s+", " ", html_lib.unescape(body)).strip()


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


def indexed_nodes(
    paths: list[Path],
    failures: list[str],
    not_indexed: set[str],
) -> list[tuple[str, dict]]:
    """Return every top-level JSON-LD node from indexable HTML files."""
    found: list[tuple[str, dict]] = []
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        if rel in not_indexed:
            continue
        for block in json_ld_blocks(path.read_text(encoding="utf-8"), rel, failures):
            found.extend((rel, node) for node in nodes(block) if isinstance(node, dict))
    return found


def section_html(html: str, identifier: str) -> str:
    """Return one visible section by ID, or an empty string when it is absent."""
    rendered = visible_html(html)
    opening = re.search(
        rf'<section\b(?=[^>]*\bid\s*=\s*["\']{re.escape(identifier)}["\'])[^>]*>',
        rendered,
        re.I,
    )
    if not opening:
        return ""
    closing = re.search(r"</section\s*>", rendered[opening.end() :], re.I)
    if not closing:
        return rendered[opening.start() :]
    return rendered[opening.start() : opening.end() + closing.end()]


def anchor_hrefs(html: str) -> list[str]:
    """Return href values from visible anchors."""
    return [
        html_lib.unescape(href)
        for href in re.findall(
            r'<a\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']', html, re.I
        )
    ]


def heading_texts(html: str) -> set[str]:
    """Return normalised visible heading text."""
    return {
        visible_text(heading).casefold()
        for heading in re.findall(r"<h[1-6]\b[^>]*>(.*?)</h[1-6]\s*>", html, re.S | re.I)
    }


def markdown_section(markdown: str, heading: str) -> str:
    """Return one level-two Markdown section without later sections."""
    match = re.search(
        rf"^##\s+{re.escape(heading)}\s*$\n(?P<body>.*?)(?=^##\s+|\Z)",
        markdown,
        re.M | re.S,
    )
    return match.group("body") if match else ""


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


def normalise_claim(value: object) -> str:
    """Normalise plain structured-data text for comparison with visible copy."""
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", html_lib.unescape(value)).strip()


def visible_faq_pairs(html: str) -> list[tuple[str, str]]:
    """Return ordered question and answer pairs from visible FAQ containers."""
    rendered = visible_html(html)
    containers = re.findall(
        r'<div\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\bfaq\b[^"\']*["\'])[^>]*>'
        r"(.*?)</div\s*>",
        rendered,
        re.S | re.I,
    )
    pairs: list[tuple[str, str]] = []
    for container in containers:
        headings = list(
            re.finditer(r"<h3\b[^>]*>(.*?)</h3\s*>", container, re.S | re.I)
        )
        for index, heading in enumerate(headings):
            end = headings[index + 1].start() if index + 1 < len(headings) else len(container)
            answer = re.search(
                r"<p\b[^>]*>(.*?)</p\s*>",
                container[heading.end() : end],
                re.S | re.I,
            )
            pairs.append(
                (
                    visible_text(heading.group(1)),
                    visible_text(answer.group(1)) if answer else "",
                )
            )
    return pairs


def check_faq_visible(node: dict, html: str, rel: str, failures: list[str]) -> None:
    """Pair each structured FAQ item with the visible item in the same position."""
    entities = node.get("mainEntity")
    structured_pairs: list[tuple[str, str]] = []
    if isinstance(entities, list):
        for question in entities:
            if not isinstance(question, dict):
                structured_pairs.append(("", ""))
                continue
            answer = question.get("acceptedAnswer")
            answer_text = answer.get("text", "") if isinstance(answer, dict) else ""
            structured_pairs.append(
                (normalise_claim(question.get("name", "")), normalise_claim(answer_text))
            )

    visible_pairs = visible_faq_pairs(html)
    if len(structured_pairs) != len(visible_pairs):
        failures.append(
            f"{rel}: FAQPage has {len(structured_pairs)} structured items but "
            f"{len(visible_pairs)} visible items"
        )
    for index, (structured, visible) in enumerate(
        zip(structured_pairs, visible_pairs), start=1
    ):
        if structured[0] != visible[0]:
            failures.append(
                f"{rel}: FAQPage item {index} question does not match the visible FAQ"
            )
        if structured[1] != visible[1]:
            failures.append(
                f"{rel}: FAQPage item {index} answer does not match the visible FAQ"
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


def sitemap_urls(root: Path = ROOT) -> list[str]:
    xml = (root / "sitemap.xml").read_text(encoding="utf-8")
    return re.findall(r"<loc>(.*?)</loc>", xml)


def sitemap_lastmods(url: str, root: Path = ROOT) -> list[str]:
    """Return lastmod values immediately associated with one sitemap URL."""
    xml = (root / "sitemap.xml").read_text(encoding="utf-8")
    return re.findall(
        rf"<loc>{re.escape(url)}</loc>\s*<lastmod>(.*?)</lastmod>", xml, re.S
    )


def html_files(root: Path = ROOT) -> list[Path]:
    """Return public site HTML, excluding hidden and generated directories."""
    return sorted(
        p
        for p in root.rglob("*.html")
        if not any(part.startswith(".") for part in p.relative_to(root).parts)
        and not any(
            part in GENERATED_HTML_DIRECTORIES
            for part in p.relative_to(root).parts[:-1]
        )
        and not (p.name.startswith("google") and p.name.endswith(".html"))
    )
