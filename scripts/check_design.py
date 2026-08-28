"""Protect the site's factual surface and shipped design assets."""

from __future__ import annotations

import hashlib
import html as html_module
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JSON_LD_PATTERN = re.compile(
    r'<script type="application/ld\+json">(.*?)</script>', re.S
)
SCRIPT_CONTENT_PATTERN = re.compile(r"<script\b[^>]*>(.*?)</script>", re.S | re.I)
MAIN_PATTERN = re.compile(r"<main\b[^>]*>(.*?)</main>", re.S | re.I)
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
LLMS_ALTERNATE = (
    '<link rel="alternate" type="text/plain" '
    'href="https://duguid.com.au/llms.txt" />'
)
LLMS_VISIBLE = '<a href="/llms.txt">Machine-readable index</a>'
PROOF_IMAGE_PATTERN = re.compile(
    r'<img\b(?=[^>]*\bsrc="/assets/coal-lsl-calculator\.webp")[^>]*>',
    re.I,
)
ROOT_BLOCK_PATTERN = re.compile(r":root\s*\{(.*?)\}", re.S | re.I)
PROPERTY_PATTERN = re.compile(r"(--[\w-]+)\s*:\s*([^;]+);")
UNICODE_RANGE_PATTERN = re.compile(
    r"U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?", re.I
)
MAX_FONT_BYTES = 25_000
MAX_TOTAL_FONT_BYTES = 135_000
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
BANNED_VISIBLE_PATTERNS = (
    ("revolutionise", r"\brevolutionise\b"),
    ("seamless", r"\bseamless\b"),
    ("cutting-edge", r"\bcutting-edge\b"),
    ("leverage", r"\bleverage\b"),
    ("unlock", r"\bunlock\b"),
    ("AI-powered", r"\bai-powered\b"),
    ("delves", r"\bdelves\b"),
    ("landscape", r"\blandscape\b"),
    ("tapestry", r"\btapestry\b"),
    ("in today's fast-paced", r"\bin today's fast-paced\b"),
    ("Get started", r"\bget started\b"),
)
COPY_PATHS = ("index.html", "about/index.html")
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


def active_markup(raw_html: str) -> str:
    without_comments = re.sub(r"<!--.*?-->", " ", raw_html, flags=re.S)
    return re.sub(
        r"<(script|style|template)\b[^>]*>.*?</\1>",
        " ",
        without_comments,
        flags=re.I | re.S,
    )


def main_visible_digest(path: Path) -> str | None:
    matches = MAIN_PATTERN.findall(path.read_text(encoding="utf-8"))
    if len(matches) != 1:
        return None
    return sha256_bytes(visible_text(matches[0]).encode("utf-8"))


def main_link_targets(path: Path) -> list[str] | None:
    matches = MAIN_PATTERN.findall(path.read_text(encoding="utf-8"))
    if len(matches) != 1:
        return None
    return [
        html_module.unescape(target)
        for _, target in MAIN_LINK_PATTERN.findall(matches[0])
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
    for path in sorted(root.rglob("*.html")):
        if path.name.startswith("google") and path.name.endswith(".html"):
            continue
        raw = path.read_text(encoding="utf-8")
        rendered_text.append(visible_text(raw))
        rendered_text.extend(SCRIPT_CONTENT_PATTERN.findall(raw))
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

    route_label_rule = re.search(
        r"\.route-section\s*>\s*h2\s*\{(.*?)\}", site_css, re.S | re.I
    )
    if not route_label_rule or not re.search(
        r"\bposition\s*:\s*sticky\s*;", route_label_rule.group(1), re.I
    ):
        failures.append("route labels must be sticky on wide layouts")

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


def check_copy(root: Path) -> list[str]:
    """Reject the brief's marketing-copy slop on the two rewritten pages."""
    failures: list[str] = []
    for rel in COPY_PATHS:
        path = root / rel
        if not path.is_file():
            failures.append(f"copy page missing: {rel}")
            continue
        text = visible_text(path.read_text(encoding="utf-8"))
        for label, pattern in BANNED_VISIBLE_PATTERNS:
            if re.search(pattern, text, re.I):
                failures.append(f"{rel}: banned visible phrase {label!r}")
        if EMOJI_PATTERN.search(text):
            failures.append(f"{rel}: decorative emoji is not permitted")
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
            'fetchpriority="low"': "use low fetch priority",
            'width="868"': "keep its width",
            'height="1106"': "keep its height",
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
        for path in sorted(root.rglob("*.html"))
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
    failures.extend(check_copy(root))

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
