"""Protect the site's factual surface and shipped design assets."""

from __future__ import annotations

import hashlib
import html as html_module
import json
import re
import sys
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

import favicon_render
import seo_core as core


ROOT = Path(__file__).resolve().parents[1]
JSON_LD_PATTERN = re.compile(
    r'<script type="application/ld\+json">(.*?)</script>', re.S
)
MAIN_PATTERN = re.compile(r"<main\b[^>]*>(.*?)</main>", re.S | re.I)
ARTICLE_CRUMB_PATTERN = re.compile(
    r'<(?P<tag>p|nav)\b(?=[^>]*\bclass="[^"]*\barticle-crumb\b[^"]*")[^>]*>'
    r".*?</(?P=tag)>",
    re.S | re.I,
)
HEAD_PATTERN = re.compile(r"<head\b[^>]*>(.*?)</head>", re.S | re.I)
FOOTER_PATTERN = re.compile(r"<footer\b[^>]*>(.*?)</footer>", re.S | re.I)
MAIN_LINK_PATTERN = re.compile(
    r'<a\b[^>]*\bhref\s*=\s*(["\'])(.*?)\1', re.S | re.I
)
FONT_URL_PATTERN = re.compile(r'url\(["\']?(/assets/fonts/[^)"\']+\.woff2)')
SOURCE_URL_PATTERN = re.compile(r'url\(\s*["\']?([^)"\']+)', re.I)
FONT_FACE_PATTERN = re.compile(r"@font-face\s*\{(.*?)\}", re.S | re.I)
RAW_COLOUR_PATTERN = re.compile(r"#[0-9a-f]{3,8}\b", re.I)
TOKENS_LINK = '<link rel="stylesheet" href="/assets/tokens.css" />'
SITE_LINK = '<link rel="stylesheet" href="/assets/site.css" />'
# Google only adopts a favicon whose raster is a multiple of 48px square, so
# every page must offer it one alongside the SVG and the 32px tab icon.
GOOGLE_FAVICON_LINKS = (
    '<link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png" />',
    '<link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96.png" />',
)
LLMS_ALTERNATE = (
    '<link rel="alternate" type="text/plain" '
    'href="https://duguid.com.au/llms.txt" />'
)
LLMS_VISIBLE = '<a href="/llms.txt">Machine-readable index</a>'
CSP_META = (
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
    "script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; "
    "connect-src 'self'; form-action 'self'; base-uri 'none'; "
    "object-src 'none'\" />"
)
FONT_PRELOADS = {
    face: (
        f'<link rel="preload" href="/assets/fonts/{face}-Latin1.woff2" '
        'as="font" type="font/woff2" crossorigin />'
    )
    for face in ("IBMPlexSerif-SemiBold", "IBMPlexSans-Regular", "IBMPlexMono-Regular")
}
SCRIPT_OPEN_PATTERN = re.compile(r"<script\b([^>]*)>", re.I)
JSON_LD_TYPE_PATTERN = re.compile(
    r'\btype\s*=\s*["\']application/ld\+json["\']', re.I
)
SECURITY_TXT = ".well-known/security.txt"
SECURITY_TXT_CANONICAL = "https://duguid.com.au/.well-known/security.txt"
JEKYLL_CONFIG = "_config.yml"
PROOF_IMAGE_PATTERN = re.compile(
    r'<img\b(?=[^>]*\bsrc="/assets/coal-lsl-calculator\.webp")[^>]*>',
    re.I,
)
PROOF_WIDTH = "868"
PROOF_HEIGHT = "580"
MAX_PROOF_BYTES = 80_000
PROOF_ASSET = "assets/coal-lsl-calculator.webp"
PROOF_MOBILE_ASSET = "assets/coal-lsl-calculator-mobile.webp"
PROOF_MOBILE_SOURCE = (
    '<source media="(max-width: 40rem)" '
    'srcset="/assets/coal-lsl-calculator-mobile.webp"'
)
HOMEPAGE_ANCHOR_IDS = ("adopt", "verify")
HOMEPAGE_ACTION_TARGETS = {"/tools/": 1}
COUNT_WORDS = {1: "one", 2: "two"}
HOMEPAGE_REQUIRED_CLASSES = (
    "home-hero__actions",
    "trust-band",
    "home-tool-preview",
)
TRUST_BAND_TEXT = (
    "Review aids only. No client files. No lodgement. Human sign-off.",
    "Scope 01 Accounting workflow controls",
    "Method 02 Primary sources and exact arithmetic",
    "Boundary 03 Calculation is not judgement",
)
HERO_TRUST_ADJACENCY_PATTERN = re.compile(
    r'<section\b(?=[^>]*class\s*=\s*["\'][^"\']*\bhome-hero\b'
    r'[^"\']*["\'])[^>]*>.*?</section>\s*'
    r'<aside\b(?=[^>]*class\s*=\s*["\'][^"\']*\btrust-band\b'
    r'[^"\']*["\'])',
    re.I | re.S,
)
HERO_ACTIONS_PATTERN = re.compile(
    r'<nav\b(?=[^>]*class\s*=\s*["\'][^"\']*\bhome-hero__actions\b'
    r'[^"\']*["\'])[^>]*>(.*?)</nav>',
    re.I | re.S,
)
TRUST_BAND_PATTERN = re.compile(
    r'<aside\b(?=[^>]*class\s*=\s*["\'][^"\']*\btrust-band\b'
    r'[^"\']*["\'])[^>]*>(.*?)</aside>',
    re.I | re.S,
)
TRUST_RECORD_PATTERN = re.compile(r"<p\b[^>]*>(.*?)</p>", re.I | re.S)
ROOT_BLOCK_PATTERN = re.compile(r":root\s*\{(.*?)\}", re.S | re.I)
PROPERTY_PATTERN = re.compile(r"(--[\w-]+)\s*:\s*([^;]+);")
UNICODE_RANGE_PATTERN = re.compile(
    r"U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?", re.I
)
MAX_FONT_BYTES = 25_000
MAX_TOTAL_FONT_BYTES = 135_000
FAVICON_COLOURS = frozenset({"#000000", "#eef4f0", "#4dff88"})
FAVICON_GEOMETRY_ATTRIBUTES = ("x", "y", "width", "height", "rx", "ry")
BANNED_CSS_PATTERNS = (
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
    "backdrop-filter",
    "box-shadow",
    "#04001f",
    "#5c2d91",
    "#9f6fd8",
)
# Marketing and machine-written vocabulary that must not reach a reader or an
# agent: visible text, meta content and JSON-LD strings on every published page,
# plus llms.txt. Labels name the offending word in the failure message.
BANNED_VISIBLE_PATTERNS = (
    ("delve", r"\bdelv(?:e|es|ed|ing)\b"),
    ("revolutionise", r"\brevolutioni[sz](?:e|es|ed|ing)\b"),
    ("seamless", r"\bseamless(?:ly)?\b"),
    ("cutting-edge", r"\bcutting-edge\b"),
    ("state-of-the-art", r"\bstate-of-the-art\b"),
    ("next-level", r"\bnext-level\b"),
    ("world-class", r"\bworld-class\b"),
    ("best-in-class", r"\bbest-in-class\b"),
    ("leverage", r"\bleverag(?:e|es|ed|ing)\b"),
    ("utilise", r"\butili[sz](?:e|es|ed|ing)\b"),
    ("unlock", r"\bunlock(?:s|ed|ing)?\b"),
    ("unleash", r"\bunleash(?:es|ed|ing)?\b"),
    ("harness the", r"\bharness(?:es|ed|ing)? the\b"),
    ("empower", r"\bempower(?:s|ed|ing|ment)?\b"),
    ("elevate", r"\belevat(?:e|es|ed|ing)\b"),
    ("streamline", r"\bstreamlin(?:e|es|ed|ing)\b"),
    ("supercharge", r"\bsupercharg(?:e|es|ed|ing)\b"),
    ("effortless", r"\beffortless(?:ly)?\b"),
    ("robust", r"\brobust(?:ly|ness)?\b"),
    ("AI-powered", r"\bai-(?:powered|driven)\b"),
    ("landscape", r"\blandscape\b"),
    ("tapestry", r"\btapestry\b"),
    ("testament", r"\btestament\b"),
    ("realm", r"\brealms?\b"),
    ("beacon", r"\bbeacon\b"),
    ("journey", r"\bjourneys?\b"),
    ("embark", r"\bembark(?:s|ed|ing)?\b"),
    ("navigate", r"\bnavigat(?:e|es|ed|ing)\b"),
    ("pivotal", r"\bpivotal\b"),
    ("crucial", r"\bcrucial(?:ly)?\b"),
    ("vital", r"\bvital(?:ly)?\b"),
    ("paramount", r"\bparamount\b"),
    ("game-changer", r"\bgame-chang(?:er|ers|ing)\b"),
    ("transformative", r"\btransformative\b"),
    ("innovative", r"\binnovative\b"),
    ("groundbreaking", r"\bgroundbreaking\b"),
    ("unprecedented", r"\bunprecedented\b"),
    ("remarkable", r"\bremarkabl[ey]\b"),
    ("compelling", r"\bcompelling\b"),
    ("invaluable", r"\binvaluable\b"),
    ("indispensable", r"\bindispensable\b"),
    ("holistic", r"\bholistic(?:ally)?\b"),
    ("synergy", r"\bsynerg(?:y|ies|istic)\b"),
    ("paradigm", r"\bparadigms?\b"),
    ("meticulous", r"\bmeticulous(?:ly)?\b"),
    ("intricate", r"\bintricate(?:ly)?\b"),
    ("nuanced", r"\bnuanced\b"),
    ("multifaceted", r"\bmultifaceted\b"),
    ("myriad", r"\bmyriad\b"),
    ("plethora", r"\bplethora\b"),
    ("bustling", r"\bbustling\b"),
    ("vibrant", r"\bvibrant\b"),
    ("unwavering", r"\bunwavering\b"),
    ("ever-evolving", r"\bever-evolving\b"),
    ("curated", r"\bcurat(?:e|es|ed|ing)\b"),
    ("bespoke", r"\bbespoke\b"),
    ("actionable", r"\bactionable\b"),
    ("insights", r"\binsights?\b"),
    ("foster", r"\bfoster(?:s|ed|ing)?\b"),
    ("facilitate", r"\bfacilitat(?:e|es|ed|ing)\b"),
    ("underscore", r"\bunderscor(?:e|es|ed|ing)\b"),
    ("showcase", r"\bshowcas(?:e|es|ed|ing)\b"),
    ("spearhead", r"\bspearhead(?:s|ed|ing)?\b"),
    ("bolster", r"\bbolster(?:s|ed|ing)?\b"),
    ("garner", r"\bgarner(?:s|ed|ing)?\b"),
    ("unpack", r"\bunpack(?:s|ed|ing)?\b"),
    ("dive into", r"\bdiv(?:e|es|ed|ing) into\b"),
    ("deep dive", r"\bdeep dives?\b"),
    ("moreover", r"\bmoreover\b"),
    ("furthermore", r"\bfurthermore\b"),
    ("additionally", r"\badditionally\b"),
    ("ultimately", r"\bultimately\b"),
    ("notably", r"\bnotably\b"),
    ("essentially", r"\bessentially\b"),
    ("arguably", r"\barguably\b"),
    ("in today's", r"\bin today's\b"),
    ("it's worth noting", r"\bit(?:'s| is) worth noting\b"),
    ("at its core", r"\bat its core\b"),
    ("Get started", r"\bget started\b"),
)
COPY_TEXT_FILES = ("llms.txt",)
META_CONTENT_PATTERN = re.compile(r'<meta\b[^>]*\bcontent\s*=\s*"([^"]*)"', re.I)
OPENING_REVIEW_DATE_CONTEXTS = {
    "index.html": "home-hero__copy",
    "tools/index.html": "article-header",
    "evidence/index.html": "article-header",
}
OPENING_REVIEW_DATE_PATTERN = re.compile(
    r"^Last reviewed (?P<date>\d{1,2} [A-Z][a-z]+ \d{4})\.$"
)
EMOJI_PATTERN = re.compile(
    "[\u2600-\u26ff\u2700-\u27bf\U0001f300-\U0001faff]"
)


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def normalised_text_digest(path: Path) -> str:
    """Hash UTF-8 text after normalising only platform line endings."""
    text = path.read_bytes().decode("utf-8")
    normalised = text.replace("\r\n", "\n").replace("\r", "\n")
    return sha256_bytes(normalised.encode("utf-8"))


def protected_asset_digest(path: Path) -> str:
    """Keep text assets portable while hashing binary font files byte-for-byte."""
    if path.suffix.lower() == ".txt":
        return normalised_text_digest(path)
    return sha256_bytes(path.read_bytes())


def semantic_json_digest(value: object) -> str:
    canonical = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return sha256_bytes(canonical)


def json_ld_digests(path: Path) -> tuple[list[str], list[str]]:
    failures: list[str] = []
    digests: list[str] = []
    for index, raw in enumerate(
        JSON_LD_PATTERN.findall(path.read_text(encoding="utf-8")), start=1
    ):
        try:
            digests.append(semantic_json_digest(json.loads(raw)))
        except json.JSONDecodeError as exc:
            failures.append(f"invalid JSON-LD block {index}: {path.as_posix()}: {exc}")
    return digests, failures


def visible_text(raw_html: str) -> str:
    without_non_content = re.sub(
        r"<(script|style)\b[^>]*>.*?</\1>", " ", raw_html, flags=re.I | re.S
    )
    without_tags = re.sub(r"<[^>]+>", " ", without_non_content)
    return " ".join(html_module.unescape(without_tags).split())


class ScriptContentParser(HTMLParser):
    """Collect raw-text script bodies with the standard HTML tokenizer."""

    def __init__(self) -> None:
        super().__init__()
        self.contents: list[str] = []
        self.inside_script = False

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        if tag.casefold() == "script":
            self.inside_script = True

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() == "script":
            self.inside_script = False

    def handle_data(self, data: str) -> None:
        if self.inside_script:
            self.contents.append(data)


def script_contents(raw_html: str) -> list[str]:
    parser = ScriptContentParser()
    parser.feed(raw_html)
    parser.close()
    return parser.contents


def active_markup(raw_html: str) -> str:
    without_comments = re.sub(r"<!--.*?-->", " ", raw_html, flags=re.S)
    return re.sub(
        r"<(script|style|template)\b[^>]*>.*?</\1>",
        " ",
        without_comments,
        flags=re.I | re.S,
    )


def check_favicon(root: Path) -> list[str]:
    path = root / "assets/favicon.svg"
    if not path.is_file():
        return ["favicon missing: assets/favicon.svg"]
    try:
        svg = ElementTree.fromstring(path.read_text(encoding="utf-8"))
    except ElementTree.ParseError as exc:
        return [f"favicon is not valid SVG: {exc}"]
    if (
        svg.tag.rsplit("}", 1)[-1] != "svg"
        or svg.get("viewBox") != "0 0 64 64"
    ):
        return ["favicon viewBox must be 0 0 64 64"]
    if any(element.tag.rsplit("}", 1)[-1] == "text" for element in svg.iter()):
        return ["favicon must use geometric shapes, not text"]
    for element in svg.iter():
        fill = element.get("fill")
        if fill is not None and fill.casefold() not in FAVICON_COLOURS:
            return [f"favicon colour outside OLED palette: {fill.casefold()}"]
        for attribute in FAVICON_GEOMETRY_ATTRIBUTES:
            value = element.get(attribute)
            if value is not None and re.fullmatch(r"-?\d+", value.strip()) is None:
                return [
                    f"favicon geometry must use whole pixels: {attribute}={value}"
                ]
    return []


def check_favicon_assets(root: Path) -> list[str]:
    """Keep every shipped raster identical to a fresh render of the seal."""
    try:
        rasters = favicon_render.rasters(root)
    except favicon_render.FaviconError as exc:
        return [f"favicon render failed: {exc}"]
    failures: list[str] = []
    for rel, expected in sorted(rasters.items()):
        path = root / rel
        if not path.is_file():
            failures.append(f"favicon raster missing: {rel}")
        elif path.read_bytes() != expected:
            failures.append(
                f"favicon raster out of date: {rel} "
                "(run python scripts/favicon_render.py)"
            )
    return failures


def main_visible_digest(path: Path) -> str | None:
    matches = MAIN_PATTERN.findall(path.read_text(encoding="utf-8"))
    if len(matches) != 1:
        return None
    protected = ARTICLE_CRUMB_PATTERN.sub("", matches[0])
    return sha256_bytes(visible_text(protected).encode("utf-8"))


def main_link_targets(path: Path) -> list[str] | None:
    matches = MAIN_PATTERN.findall(path.read_text(encoding="utf-8"))
    if len(matches) != 1:
        return None
    protected = ARTICLE_CRUMB_PATTERN.sub("", matches[0])
    return [
        html_module.unescape(target)
        for _, target in MAIN_LINK_PATTERN.findall(protected)
    ]


def css_root_properties(tokens_css: str) -> dict[str, str]:
    match = ROOT_BLOCK_PATTERN.search(tokens_css)
    if match is None:
        return {}
    return {
        name.lower(): value.strip().lower()
        for name, value in PROPERTY_PATTERN.findall(match.group(1))
    }


def relative_luminance(colour: str) -> float:
    value = colour.removeprefix("#")
    channels = [int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)]
    linear = [
        channel / 12.92
        if channel <= 0.04045
        else ((channel + 0.055) / 1.055) ** 2.4
        for channel in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(first: str, second: str) -> float:
    first_luminance = relative_luminance(first)
    second_luminance = relative_luminance(second)
    lighter = max(first_luminance, second_luminance)
    darker = min(first_luminance, second_luminance)
    return (lighter + 0.05) / (darker + 0.05)


def check_oled_tokens(tokens_css: str) -> list[str]:
    failures: list[str] = []
    root_match = ROOT_BLOCK_PATTERN.search(tokens_css)
    root_block = root_match.group(1) if root_match is not None else ""
    properties = css_root_properties(tokens_css)
    if not re.search(r"\bcolor-scheme\s*:\s*dark\s*;", root_block, re.I):
        failures.append("native colour scheme must be dark only")
    if "prefers-color-scheme" in tokens_css.lower():
        failures.append("OLED theme must not contain a prefers-color-scheme override")
    canvas = properties.get("--colour-canvas")
    if canvas != "#000000":
        failures.append("OLED canvas must be #000000")
        return failures
    for token in (
        "--colour-ink",
        "--colour-ink-soft",
        "--colour-stamp",
        "--colour-alert",
    ):
        value = properties.get(token)
        if value is None or not re.fullmatch(r"#[0-9a-f]{6}", value):
            failures.append(f"{token} must be a six-digit colour")
        elif contrast_ratio(value, canvas) < 4.5:
            failures.append(f"{token} contrast on canvas must be at least 4.5:1")
    display = properties.get("--text-display", "")
    display_minimum = re.match(
        r"clamp\(\s*([0-9]+(?:\.[0-9]+)?)rem\s*,", display
    )
    if display_minimum is None or float(display_minimum.group(1)) > 2.5:
        failures.append("display type minimum must fit the 320px viewport")
    return failures


def unicode_ranges(font_face: str) -> list[tuple[int, int]]:
    declaration = re.search(
        r"\bunicode-range\s*:\s*([^;]+);", font_face, re.I
    )
    if declaration is None:
        return []
    ranges: list[tuple[int, int]] = []
    for start, end in UNICODE_RANGE_PATTERN.findall(declaration.group(1)):
        first = int(start, 16)
        ranges.append((first, int(end, 16) if end else first))
    return ranges


def range_covers(ranges: list[tuple[int, int]], codepoint: int) -> bool:
    return any(start <= codepoint <= end for start, end in ranges)


def check_font_delivery(
    root: Path, tokens_css: str, baseline: dict[str, object]
) -> list[str]:
    failures: list[str] = []
    faces = FONT_FACE_PATTERN.findall(tokens_css)
    rendered_text: list[str] = []
    for path in core.html_files(root):
        raw = path.read_text(encoding="utf-8")
        rendered_text.append(visible_text(raw))
        rendered_text.extend(script_contents(raw))
    rendered_text.extend(
        path.read_text(encoding="utf-8")
        for path in sorted((root / "assets").rglob("*.mjs"))
    )
    visible = " ".join(rendered_text)
    required = sorted({ord(character) for character in visible if ord(character) > 31})
    for index, face in enumerate(faces, start=1):
        ranges = unicode_ranges(face)
        if not ranges:
            failures.append(f"font face {index} must declare unicode-range")
            continue
        for codepoint in required:
            if not range_covers(ranges, codepoint):
                failures.append(
                    f"font face {index} does not cover visible U+{codepoint:04X}"
                )
                break

    declared = sorted(
        {url.removeprefix("/") for url in FONT_URL_PATTERN.findall(tokens_css)}
    )
    total = 0
    for rel in declared:
        path = root / rel
        if not path.is_file():
            continue
        size = path.stat().st_size
        total += size
        if size > MAX_FONT_BYTES:
            failures.append(f"font exceeds {MAX_FONT_BYTES}-byte delivery budget: {rel}")
    if total > MAX_TOTAL_FONT_BYTES:
        failures.append(
            f"declared fonts total {total} bytes, over {MAX_TOTAL_FONT_BYTES}-byte budget"
        )
    return failures


def check_stylesheets(root: Path, baseline: dict[str, object]) -> list[str]:
    failures: list[str] = []
    site_path = root / "assets/site.css"
    tokens_path = root / "assets/tokens.css"
    if not site_path.is_file():
        return ["stylesheet missing: assets/site.css"]
    if not tokens_path.is_file():
        return ["stylesheet missing: assets/tokens.css"]

    site_css = site_path.read_text(encoding="utf-8")
    tokens_css = tokens_path.read_text(encoding="utf-8")
    if re.search(r"@import\b", site_css, re.I):
        failures.append("assets/site.css: token import creates a serial request chain")

    combined = f"{site_css}\n{tokens_css}".lower()
    for pattern in BANNED_CSS_PATTERNS:
        if pattern in combined:
            failures.append(f"banned CSS pattern {pattern}")

    for colour in sorted(set(RAW_COLOUR_PATTERN.findall(site_css.lower()))):
        failures.append(f"raw colour outside assets/tokens.css: {colour}")

    if not re.search(
        r"\bbody\s*\{[^}]*\boverflow-wrap\s*:\s*anywhere\s*;",
        site_css,
        re.S | re.I,
    ):
        failures.append("body must wrap unbroken identifiers at the 320px boundary")

    transitions = re.findall(r"\btransition\s*:\s*(.*?);", site_css, re.S | re.I)
    if not transitions or any(
        "var(--motion-standard)" not in transition for transition in transitions
    ):
        failures.append("links and controls must use the standard motion duration")
    if not re.search(
        r"button:active\s*\{[^}]*\btranslate\s*:\s*0\s+1px\s*;",
        site_css,
        re.S | re.I,
    ):
        failures.append("buttons must move by one pixel on press")

    byline_rule = re.search(r"\.byline\s*\{(.*?)\}", site_css, re.S | re.I)
    if not byline_rule or "--colour-rule-strong" not in byline_rule.group(1):
        failures.append("bylines must use the neutral register rule")

    route_note_rule = re.search(r"\.route-note\s*\{(.*?)\}", site_css, re.S | re.I)
    if not route_note_rule or "--colour-rule-strong" not in route_note_rule.group(1):
        failures.append("informational route notes must use the neutral register rule")

    boundary_note_rule = re.search(
        r"\.route-note\.boundary\s*\{(.*?)\}", site_css, re.S | re.I
    )
    if not boundary_note_rule or "--colour-alert" not in boundary_note_rule.group(1):
        failures.append("boundary route notes must retain the alert rule")

    font_faces = FONT_FACE_PATTERN.findall(tokens_css)
    for index, font_face in enumerate(font_faces, start=1):
        if not re.search(r"\bfont-display\s*:\s*optional\s*;", font_face, re.I):
            failures.append(f"font face {index} must use font-display: optional")
        sources = SOURCE_URL_PATTERN.findall(font_face)
        if (
            len(sources) != 1
            or not sources[0].startswith("/assets/fonts/")
            or not sources[0].endswith(".woff2")
            or re.search(r"\blocal\s*\(", font_face, re.I)
        ):
            failures.append(
                f"font face {index} must use one protected local WOFF2 source"
            )

    route_rules = re.findall(r"\.route-section\s*\{(.*?)\}", site_css, re.S | re.I)
    if any(
        re.search(
            r"\bmin-height\s*:\s*[^;]*(?:var\(--route-min-height\)|[sd]?vh)",
            rule,
            re.I,
        )
        for rule in route_rules
    ):
        failures.append("route sections must not use viewport-based minimum heights")

    route_label_rules = re.findall(
        r"\.route-section\s*>\s*h2\s*\{(.*?)\}", site_css, re.S | re.I
    )
    if any(
        re.search(r"\bposition\s*:\s*sticky\s*;", rule, re.I)
        for rule in route_label_rules
    ):
        failures.append("route labels must not be sticky")

    route_content_rule = re.search(
        r"\.route-content\s*\{(.*?)\}", site_css, re.S | re.I
    )
    if not route_content_rule or not re.search(
        r"\bmin-width\s*:\s*0\s*;", route_content_rule.group(1), re.I
    ):
        failures.append(
            "route content must allow internal overflow without widening the page"
        )

    for selector in ("route-actions", "install-band"):
        rules = re.findall(
            rf"\.{selector}\s*\{{(.*?)\}}", site_css, re.S | re.I
        )
        if not any(
            re.search(r"\bmin-width\s*:\s*0\s*;", rule, re.I)
            for rule in rules
        ):
            failures.append("route action groups must contain intrinsic-width content")
            break

    proof_figure_rules = re.findall(
        r"\.proof-feature\s+figure\s*\{(.*?)\}", site_css, re.S | re.I
    )
    if not any(
        re.search(r"\bmin-width\s*:\s*0\s*;", rule, re.I)
        and re.search(r"\bmargin-inline\s*:\s*0\s*;", rule, re.I)
        for rule in proof_figure_rules
    ):
        failures.append("proof media must not widen the fallback viewport")

    declared_fonts = {
        url.removeprefix("/") for url in FONT_URL_PATTERN.findall(tokens_css)
    }
    for rel in sorted(declared_fonts):
        if not (root / rel).is_file():
            failures.append(f"font face target missing: {rel}")

    expected_fonts = {
        rel
        for rel in baseline.get("fonts", {})
        if isinstance(rel, str) and rel.endswith(".woff2")
    }
    for rel in sorted(expected_fonts - declared_fonts):
        failures.append(f"protected font not declared in tokens: {rel}")
    for rel in sorted(declared_fonts - expected_fonts):
        failures.append(f"unprotected font declared: {rel}")
    failures.extend(check_oled_tokens(tokens_css))
    return failures


def json_ld_strings(value: object) -> list[str]:
    """Every decoded string value in a parsed JSON-LD document, recursively."""
    found: list[str] = []

    def visit(candidate: object) -> None:
        if isinstance(candidate, str):
            found.append(candidate)
        elif isinstance(candidate, dict):
            for child in candidate.values():
                visit(child)
        elif isinstance(candidate, list):
            for child in candidate:
                visit(child)

    visit(value)
    return found


def copy_surfaces(raw_html: str, rel: str) -> list[tuple[str, str]]:
    """The text a reader or an agent takes from one page, by surface.

    JSON-LD is parsed rather than pattern-matched, so every property and every
    escaped character is scanned as a consumer would decode it. Parse failures
    are already reported by the JSON-LD digest check, so they are dropped here.
    """
    meta_text = " ".join(
        html_module.unescape(value) for value in META_CONTENT_PATTERN.findall(raw_html)
    )
    parse_failures: list[str] = []
    json_ld_text = " ".join(
        string
        for block in core.json_ld_blocks(raw_html, rel, parse_failures)
        for string in json_ld_strings(block)
    )
    return [
        ("visible", visible_text(raw_html)),
        ("meta", meta_text),
        ("JSON-LD", json_ld_text),
    ]


def check_copy(root: Path) -> list[str]:
    """Reject marketing and machine-written vocabulary on every published page."""
    failures: list[str] = []
    documents = []
    for path in core.html_files(root):
        rel = path.relative_to(root).as_posix()
        documents.append((rel, copy_surfaces(path.read_text(encoding="utf-8"), rel)))
    for rel in COPY_TEXT_FILES:
        path = root / rel
        if not path.is_file():
            failures.append(f"copy page missing: {rel}")
            continue
        documents.append((rel, [("text", path.read_text(encoding="utf-8"))]))
    for rel, surfaces in documents:
        for surface, text in surfaces:
            for label, pattern in BANNED_VISIBLE_PATTERNS:
                if re.search(pattern, text, re.I):
                    failures.append(f"{rel}: banned {surface} phrase {label!r}")
            if surface == "visible" and EMOJI_PATTERN.search(text):
                failures.append(f"{rel}: decorative emoji is not permitted")
    return failures


def check_opening_review_dates(root: Path) -> list[str]:
    """Keep visible opening review dates aligned with structured freshness."""
    failures: list[str] = []
    for rel, context_class in OPENING_REVIEW_DATE_CONTEXTS.items():
        path = root / rel
        if not path.is_file():
            failures.append(f"{rel}: missing page for opening review-date check")
            continue
        raw_html = path.read_text(encoding="utf-8")
        document = core.parse_structure(raw_html)
        contexts = [
            element
            for element in core.descendants(document, rendered_only=True)
            if element.has_class(context_class)
        ]
        dates = [
            element
            for element in core.descendants(document, rendered_only=True)
            if element.has_class("page-meta")
        ]
        if len(contexts) != 1 or len(dates) != 1 or not core.is_descendant(
            dates[0], contexts[0]
        ):
            failures.append(
                f"{rel}: expected exactly one opening page-meta inside "
                f".{context_class}"
            )
            continue

        visible_label = core.element_text(dates[0])
        visible_match = OPENING_REVIEW_DATE_PATTERN.fullmatch(visible_label)
        if visible_match is None:
            failures.append(
                f"{rel}: opening page-meta must use "
                "'Last reviewed D Month YYYY.'"
            )
            continue
        try:
            visible_date = datetime.strptime(
                visible_match.group("date"), "%d %B %Y"
            ).date()
        except ValueError:
            failures.append(f"{rel}: opening page-meta contains an invalid date")
            continue

        structured_blocks = core.json_ld_blocks(raw_html, rel, failures)
        modified_values = [
            node.get("dateModified")
            for block in structured_blocks
            for node in core.nodes(block)
            if "dateModified" in node
        ]
        if len(modified_values) != 1 or not isinstance(modified_values[0], str):
            failures.append(f"{rel}: expected exactly one JSON-LD dateModified")
            continue
        try:
            structured_date = date.fromisoformat(modified_values[0])
        except ValueError:
            failures.append(f"{rel}: JSON-LD dateModified must be an ISO date")
            continue
        if visible_date != structured_date:
            failures.append(
                f"{rel}: opening review date {visible_date.isoformat()} does not "
                f"match JSON-LD dateModified {structured_date.isoformat()}"
            )
    return failures


def class_count(raw_html: str, class_name: str) -> int:
    pattern = re.compile(r'class\s*=\s*(["\'])(.*?)\1', re.I | re.S)
    return sum(
        class_name.casefold() in value.casefold().split()
        for _, value in pattern.findall(raw_html)
    )


def check_homepage_refinement(root: Path) -> list[str]:
    path = root / "index.html"
    if not path.is_file():
        return ["index.html: homepage missing"]
    raw = path.read_text(encoding="utf-8")
    main_regions = MAIN_PATTERN.findall(raw)
    if len(main_regions) != 1:
        return ["index.html: expected one main region"]
    main = active_markup(main_regions[0])
    links = [
        html_module.unescape(target)
        for _, target in MAIN_LINK_PATTERN.findall(main)
    ]
    action_regions = HERO_ACTIONS_PATTERN.findall(main)
    action_links = (
        [
            html_module.unescape(target)
            for _, target in MAIN_LINK_PATTERN.findall(action_regions[0])
        ]
        if len(action_regions) == 1
        else []
    )
    failures = []
    for target, expected_count in HOMEPAGE_ACTION_TARGETS.items():
        if links.count(target) != expected_count:
            failures.append(
                "index.html: expected exactly "
                + COUNT_WORDS[expected_count]
                + " "
                + target
                + " homepage action"
            )
        if action_links.count(target) != 1:
            failures.append(
                "index.html: expected exactly one "
                + target
                + " action in home-hero__actions"
            )
    for identifier in HOMEPAGE_ANCHOR_IDS:
        count = len(
            re.findall(
                rf'\bid\s*=\s*(["\']){re.escape(identifier)}\1',
                main,
                re.I,
            )
        )
        if count != 1:
            failures.append(
                f"index.html: expected exactly one valid #{identifier} anchor"
            )
    for class_name in HOMEPAGE_REQUIRED_CLASSES:
        if class_count(main, class_name) != 1:
            failures.append("index.html: expected one " + class_name)
    if not HERO_TRUST_ADJACENCY_PATTERN.search(main):
        failures.append("index.html: trust-band must immediately follow home hero")
    trust_regions = TRUST_BAND_PATTERN.findall(main)
    if len(trust_regions) != 1:
        failures.append("index.html: expected one complete trust-band region")
    else:
        trust_records = tuple(
            visible_text(record)
            for record in TRUST_RECORD_PATTERN.findall(trust_regions[0])
        )
        if trust_records != TRUST_BAND_TEXT:
            failures.append(
                "index.html: trust-band records must match "
                "the approved four-item tuple"
            )
    if class_count(main, "technical-label") != 3:
        failures.append(
            "index.html: expected exactly three evidence-bearing technical labels"
        )
    label_pattern = re.compile(
        r'<p\b(?=[^>]*class\s*=\s*(["\'])[^"\']*\btechnical-label\b'
        r'[^"\']*\1)[^>]*>(.*?)</p>',
        re.I | re.S,
    )
    for _, body in label_pattern.findall(main):
        label = visible_text(body)
        if re.match(r"^(?:0[1-3]|[A-D])\s*/", label) or re.search(
            r"/\s*0?5$", label
        ):
            failures.append(
                "index.html: decorative ordinal technical label: " + label
            )
    return failures


def check_document_delivery(
    root: Path, baseline: dict[str, object]
) -> list[str]:
    failures: list[str] = []
    indexable = set(baseline.get("json_ld", {}))
    styled = indexable | {"404.html"}

    for rel in sorted(styled):
        path = root / rel
        if not path.is_file():
            failures.append(f"styled page missing: {rel}")
            continue
        raw = path.read_text(encoding="utf-8")
        head_regions = HEAD_PATTERN.findall(raw)
        footer_regions = FOOTER_PATTERN.findall(raw)
        head = active_markup(head_regions[0]) if len(head_regions) == 1 else ""
        footer = active_markup(footer_regions[0]) if len(footer_regions) == 1 else ""
        token_at = head.find(TOKENS_LINK)
        site_at = head.find(SITE_LINK)
        if (
            raw.count(TOKENS_LINK) != 1
            or raw.count(SITE_LINK) != 1
            or head.count(TOKENS_LINK) != 1
            or head.count(SITE_LINK) != 1
            or token_at > site_at
        ):
            failures.append(
                f"{rel}: expected one tokens stylesheet before site stylesheet"
            )
        if raw.count(LLMS_VISIBLE) != 1 or footer.count(LLMS_VISIBLE) != 1:
            failures.append(
                f"{rel}: expected one visible machine-readable index link"
            )
        if rel in indexable and (
            raw.count(LLMS_ALTERNATE) != 1 or head.count(LLMS_ALTERNATE) != 1
        ):
            failures.append(f"{rel}: expected one llms.txt alternate link")
        if raw.count(CSP_META) != 1 or head.count(CSP_META) != 1:
            failures.append(f"{rel}: expected one Content Security Policy meta tag")
        for link in GOOGLE_FAVICON_LINKS:
            if raw.count(link) != 1 or head.count(link) != 1:
                failures.append(f"{rel}: expected one favicon link: {link}")
        for face, preload in FONT_PRELOADS.items():
            preload_at = head.find(preload)
            if raw.count(preload) != 1 or preload_at < 0 or preload_at > token_at:
                failures.append(
                    f"{rel}: expected the {face} preload before the tokens stylesheet"
                )
        for attributes in SCRIPT_OPEN_PATTERN.findall(raw):
            if re.search(r"\bsrc\s*=", attributes, re.I):
                continue
            if JSON_LD_TYPE_PATTERN.search(attributes):
                continue
            failures.append(f"{rel}: must not carry inline script")
            break

    homepage_path = root / "index.html"
    if not homepage_path.is_file():
        return failures
    homepage = homepage_path.read_text(encoding="utf-8")
    image_match = PROOF_IMAGE_PATTERN.search(homepage)
    if image_match is None:
        failures.append("index.html: Coal LSL proof image is missing")
    else:
        image = image_match.group(0)
        required = {
            'loading="lazy"': "load lazily",
            'decoding="async"': "decode asynchronously",
            f'width="{PROOF_WIDTH}"': "keep its width",
            f'height="{PROOF_HEIGHT}"': "keep its height",
        }
        for marker, message in required.items():
            if marker not in image:
                failures.append(
                    f"index.html: Coal LSL proof image must {message}"
                )
        alt = re.search(r'\balt\s*=\s*(["\'])(.*?)\1', image, re.I | re.S)
        if alt is None or len(visible_text(alt.group(2))) < 12:
            failures.append(
                "index.html: Coal LSL proof image must have descriptive alt text"
            )

    if PROOF_MOBILE_SOURCE not in homepage:
        failures.append(
            "index.html: Coal LSL proof picture must offer the mobile source"
        )

    for asset in (PROOF_ASSET, PROOF_MOBILE_ASSET):
        proof_path = root / asset
        if not proof_path.is_file():
            failures.append(f"{asset}: proof image is missing")
            continue
        proof = proof_path.read_bytes()
        if proof[:4] != b"RIFF" or proof[8:12] != b"WEBP":
            failures.append(f"{asset}: proof image is not a WebP container")
        if len(proof) > MAX_PROOF_BYTES:
            failures.append(
                f"{asset}: proof image exceeds {MAX_PROOF_BYTES} bytes"
            )
    return failures


def check_security_txt(root: Path) -> list[str]:
    """Keep the RFC 9116 contact file present, current and published."""
    failures: list[str] = []
    path = root / SECURITY_TXT
    if not path.is_file():
        failures.append(f"{SECURITY_TXT}: security.txt missing")
    else:
        text = path.read_text(encoding="utf-8")
        if not re.search(r"^Contact:\s*\S+", text, re.M):
            failures.append(f"{SECURITY_TXT}: must name at least one Contact")
        expires = re.findall(r"^Expires:\s*(\S+)", text, re.M)
        if len(expires) != 1:
            failures.append(f"{SECURITY_TXT}: must carry exactly one Expires field")
        else:
            try:
                when = datetime.fromisoformat(expires[0].replace("Z", "+00:00"))
            except ValueError:
                failures.append(f"{SECURITY_TXT}: Expires must be an RFC 3339 timestamp")
            else:
                if when.tzinfo is None:
                    failures.append(f"{SECURITY_TXT}: Expires must carry a timezone")
                elif when <= datetime.now(when.tzinfo):
                    failures.append(f"{SECURITY_TXT}: Expires has passed; refresh the file")
        if f"Canonical: {SECURITY_TXT_CANONICAL}" not in text:
            failures.append(f"{SECURITY_TXT}: must name its canonical URL")
    config = root / JEKYLL_CONFIG
    if not config.is_file() or not re.search(
        r"^\s*-\s*\.well-known\s*$", config.read_text(encoding="utf-8"), re.M
    ):
        failures.append(
            f"{JEKYLL_CONFIG}: must include .well-known so Pages publishes security.txt"
        )
    return failures


def check_repository(root: Path = ROOT) -> list[str]:
    baseline_path = root / "scripts/design_baseline.json"
    if not baseline_path.is_file():
        return ["design baseline missing: scripts/design_baseline.json"]

    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    failures: list[str] = []

    for rel, expected in baseline.get("protected_files", {}).items():
        path = root / rel
        if not path.is_file():
            failures.append(f"protected file missing: {rel}")
        elif normalised_text_digest(path) != expected:
            failures.append(f"protected file changed: {rel}")

    for rel, expected in baseline.get("protected_main_text", {}).items():
        path = root / rel
        if not path.is_file():
            failures.append(f"protected main page missing: {rel}")
            continue
        actual = main_visible_digest(path)
        if actual is None:
            failures.append(f"protected main missing or duplicated: {rel}")
        elif actual != expected:
            failures.append(f"protected main text changed: {rel}")

    for rel, expected in baseline.get("protected_main_links", {}).items():
        path = root / rel
        if not path.is_file():
            failures.append(f"protected main page missing: {rel}")
            continue
        actual = main_link_targets(path)
        if actual is None:
            failures.append(f"protected main missing or duplicated: {rel}")
        elif actual != expected:
            failures.append(f"protected main links changed: {rel}")

    for rel, expected in baseline.get("json_ld", {}).items():
        path = root / rel
        if not path.is_file():
            failures.append(f"JSON-LD page missing: {rel}")
            continue
        actual, parse_failures = json_ld_digests(path)
        failures.extend(parse_failures)
        if actual != expected:
            failures.append(f"JSON-LD changed: {rel}")

    html_text = "\n".join(
        visible_text(path.read_text(encoding="utf-8"))
        for path in core.html_files(root)
    )
    for protected, expected_count in baseline.get("protected_text", {}).items():
        actual_count = html_text.count(protected)
        if actual_count != expected_count:
            failures.append(
                "protected text count changed: "
                f"expected {expected_count}, found {actual_count}: {protected}"
            )

    for rel, expected in baseline.get("fonts", {}).items():
        path = root / rel
        if not path.is_file():
            failures.append(f"protected font missing: {rel}")
        elif protected_asset_digest(path) != expected:
            failures.append(f"protected font changed: {rel}")

    failures.extend(check_document_delivery(root, baseline))
    failures.extend(check_security_txt(root))
    failures.extend(check_favicon(root))
    failures.extend(check_favicon_assets(root))
    failures.extend(check_stylesheets(root, baseline))
    tokens_path = root / "assets/tokens.css"
    if tokens_path.is_file():
        failures.extend(
            check_font_delivery(
                root,
                tokens_path.read_text(encoding="utf-8"),
                baseline,
            )
        )
    failures.extend(check_homepage_refinement(root))
    failures.extend(check_copy(root))
    failures.extend(check_opening_review_dates(root))

    return failures


def main() -> int:
    failures = check_repository()
    if failures:
        print("design contract failures:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("design contracts passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
