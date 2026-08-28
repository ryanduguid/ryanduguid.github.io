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
FONT_URL_PATTERN = re.compile(r'url\(["\']?(/assets/fonts/[^)"\']+\.woff2)')
FONT_FACE_PATTERN = re.compile(r"@font-face\s*\{(.*?)\}", re.S | re.I)
RAW_COLOUR_PATTERN = re.compile(r"#[0-9a-f]{3,8}\b", re.I)
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
    first_rule = re.sub(r"/\*.*?\*/", "", site_css, flags=re.S).lstrip()
    if not first_rule.startswith('@import url("/assets/tokens.css");'):
        failures.append("assets/site.css: tokens.css must be the first rule")

    combined = f"{site_css}\n{tokens_css}".lower()
    for pattern in BANNED_CSS_PATTERNS:
        if pattern in combined:
            failures.append(f"banned CSS pattern {pattern}")

    for colour in sorted(set(RAW_COLOUR_PATTERN.findall(site_css.lower()))):
        failures.append(f"raw colour outside assets/tokens.css: {colour}")

    for index, font_face in enumerate(FONT_FACE_PATTERN.findall(tokens_css), start=1):
        if not re.search(r"\bfont-display\s*:\s*optional\s*;", font_face, re.I):
            failures.append(f"font face {index} must use font-display: optional")

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
        elif sha256_bytes(path.read_bytes()) != expected:
            failures.append(f"protected font changed: {rel}")

    failures.extend(check_stylesheets(root, baseline))
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
