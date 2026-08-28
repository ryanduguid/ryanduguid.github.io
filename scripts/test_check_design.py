"""Mutation tests for the public design and content contracts."""

from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path

import check_design


DISCLAIMER = "Nothing here is tax, legal or financial advice."


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def write_fixture(root: Path) -> None:
    (root / "scripts").mkdir()
    (root / "rates/example").mkdir(parents=True)
    (root / "assets/fonts").mkdir(parents=True)
    (root / "about").mkdir()

    llms = b"# Example\n\nCurrent rate: 12%\n"
    rate = (
        b"<html><head><title>Rate</title></head><body>"
        b'<main>12% <a href="https://source.example/original">Source</a></main>'
        b"<footer>Source</footer></body></html>\n"
    )
    font = b"font-fixture"
    licence = b"SIL OPEN FONT LICENSE Version 1.1\nPermission notice\n"
    page = (
        '<!doctype html><html><head>'
        '<link rel="alternate" type="text/plain" '
        'href="https://duguid.com.au/llms.txt" />'
        '<link rel="stylesheet" href="/assets/tokens.css" />'
        '<link rel="stylesheet" href="/assets/site.css" />'
        '</head><body><main><h1>Example · register</h1>'
        '<img src="/assets/coal-lsl-calculator.webp" width="868" height="1106" '
        'loading="lazy" decoding="async" fetchpriority="low" '
        'alt="Example calculation" />'
        '</main>'
        f'<footer><p>{DISCLAIMER}</p>'
        '<a href="/llms.txt">Machine-readable index</a></footer>'
        '<script type="application/ld+json">'
        '{"@context":"https://schema.org","@type":"WebPage","name":"Example"}'
        "</script></body></html>"
    ).encode()

    (root / "llms.txt").write_bytes(llms)
    (root / "rates/example/index.html").write_bytes(rate)
    (root / "assets/fonts/Test.woff2").write_bytes(font)
    (root / "assets/fonts/OFL.txt").write_bytes(licence)
    (root / "assets/tokens.css").write_text(
        '@font-face { font-family: "Test"; '
        'src: url("/assets/fonts/Test.woff2") format("woff2"); '
        'font-display: optional; '
        'unicode-range: U+0020-007E, U+00A0-00FF; }\n'
        ':root { color-scheme: dark; '
        '--colour-canvas: #000000; --colour-paper: #050806; '
        '--colour-paper-raised: #09100d; --colour-ink: #eef4f0; '
        '--colour-ink-soft: #9aa89f; --colour-rule: #26332d; '
        '--colour-rule-strong: #5c7166; --colour-stamp: #4dff88; '
        '--colour-stamp-strong: #78ffa3; --colour-stamp-wash: #082619; '
        '--colour-alert: #ff9c91; --colour-masthead: #eef4f0; '
        '--colour-code: #020403; --colour-code-ink: #eef4f0; '
        '--colour-code-comment: #9aa89f; '
        '--text-display: clamp(2.5rem, 1.45rem + 5.6vw, 6rem); '
        '--radius-control: 0.125rem; }\n',
        encoding="utf-8",
    )
    (root / "assets/site.css").write_text(
        "body { overflow-wrap: anywhere; background: var(--colour-canvas); }\n"
        "a { transition: color var(--motion-standard); }\n"
        "button { transition: color var(--motion-standard); }\n"
        "button:active { translate: 0 1px; }\n"
        ".route-section > h2 { position: sticky; }\n"
        ".route-content { min-width: 0; }\n"
        ".route-actions { min-width: 0; }\n"
        ".install-band { min-width: 0; }\n"
        ".proof-feature figure { min-width: 0; margin-inline: 0; }\n",
        encoding="utf-8",
    )
    (root / "index.html").write_bytes(page)
    (root / "404.html").write_text(
        '<!doctype html><html><head>'
        '<link rel="stylesheet" href="/assets/tokens.css" />'
        '<link rel="stylesheet" href="/assets/site.css" />'
        '</head><body><main><h1>Not found</h1></main>'
        '<footer><a href="/llms.txt">Machine-readable index</a></footer>'
        '</body></html>',
        encoding="utf-8",
    )
    (root / "about/index.html").write_text(
        "<!doctype html><html><body><main>About</main></body></html>",
        encoding="utf-8",
    )
    baseline = {
        "protected_files": {
            "llms.txt": digest(llms),
        },
        "protected_main_text": {
            "rates/example/index.html": (
                "9a3a3917b326f2c2e06e008365e2659508e660d6b0491f9813e5b90df1782693"
            )
        },
        "protected_main_links": {
            "rates/example/index.html": ["https://source.example/original"]
        },
        "json_ld": {
            "index.html": [
                check_design.semantic_json_digest(
                    {
                        "@context": "https://schema.org",
                        "@type": "WebPage",
                        "name": "Example",
                    }
                )
            ]
        },
        "protected_text": {DISCLAIMER: 1},
        "fonts": {
            "assets/fonts/Test.woff2": digest(font),
            "assets/fonts/OFL.txt": digest(licence),
        },
    }
    (root / "scripts/design_baseline.json").write_text(
        json.dumps(baseline), encoding="utf-8"
    )


def fixture_failures(mutate) -> list[str]:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        write_fixture(root)
        mutate(root)
        return check_design.check_repository(root)


def self_check() -> None:
    script_body = 'document.querySelector("h1").textContent = "Ready ✅";'
    for closing_tag in ("</script >", "</script\t\n bar>"):
        assert check_design.script_contents(
            f"<script>{script_body}{closing_tag}"
        ) == [script_body]

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        write_fixture(root)
        assert check_design.check_repository(root) == []

        page = root / "index.html"
        html = page.read_text(encoding="utf-8")
        page.write_text(
            html.replace(
                '{"@context":"https://schema.org","@type":"WebPage","name":"Example"}',
                '{\n  "name": "Example",\n  "@type": "WebPage",\n  "@context": "https://schema.org"\n}',
            ),
            encoding="utf-8",
        )
        assert check_design.check_repository(root) == []

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        write_fixture(root)
        for rel in (
            "llms.txt",
            "rates/example/index.html",
            "assets/fonts/OFL.txt",
        ):
            path = root / rel
            path.write_bytes(path.read_bytes().replace(b"\n", b"\r\n"))
        assert check_design.check_repository(root) == []

    head_only_failures = fixture_failures(
        lambda root: (root / "rates/example/index.html").write_text(
            (root / "rates/example/index.html")
            .read_text(encoding="utf-8")
            .replace(
                "</head>",
                '<meta name="x-test" content="shared chrome" /></head>',
            ),
            encoding="utf-8",
        )
    )
    assert not any("protected main" in failure for failure in head_only_failures)

    rate_failures = fixture_failures(
        lambda root: (root / "rates/example/index.html").write_text(
            (root / "rates/example/index.html")
            .read_text(encoding="utf-8")
            .replace("<main>12% ", "<main>13% "),
            encoding="utf-8",
        )
    )
    assert any(
        "protected main text changed: rates/example/index.html" in failure
        for failure in rate_failures
    )

    rate_source_failures = fixture_failures(
        lambda root: (root / "rates/example/index.html").write_text(
            (root / "rates/example/index.html")
            .read_text(encoding="utf-8")
            .replace(
                "https://source.example/original",
                "https://source.example/changed",
            ),
            encoding="utf-8",
        )
    )
    assert any(
        "protected main links changed: rates/example/index.html" in failure
        for failure in rate_source_failures
    )

    mutations = (
        (
            "llms.txt drift",
            lambda root: (root / "llms.txt").write_text("changed", encoding="utf-8"),
            "protected file changed: llms.txt",
        ),
        (
            "JSON-LD fact drift",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace('"name":"Example"', '"name":"Changed"'),
                encoding="utf-8",
            ),
            "JSON-LD changed: index.html",
        ),
        (
            "disclaimer removal",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace(DISCLAIMER, ""),
                encoding="utf-8",
            ),
            "protected text count changed",
        ),
        (
            "font removal",
            lambda root: (root / "assets/fonts/Test.woff2").unlink(),
            "protected font missing: assets/fonts/Test.woff2",
        ),
        (
            "font drift",
            lambda root: (root / "assets/fonts/Test.woff2").write_bytes(b"other"),
            "protected font changed: assets/fonts/Test.woff2",
        ),
        (
            "licence removal",
            lambda root: (root / "assets/fonts/OFL.txt").unlink(),
            "protected font missing: assets/fonts/OFL.txt",
        ),
        (
            "licence drift",
            lambda root: (root / "assets/fonts/OFL.txt").write_text(
                "changed", encoding="utf-8"
            ),
            "protected font changed: assets/fonts/OFL.txt",
        ),
        (
            "gradient regression",
            lambda root: (root / "assets/site.css").write_text(
                'body { background: linear-gradient(#fff, #000); }',
                encoding="utf-8",
            ),
            "banned CSS pattern linear-gradient",
        ),
        (
            "glass regression",
            lambda root: (root / "assets/site.css").write_text(
                'header { backdrop-filter: blur(2rem); }', encoding="utf-8"
            ),
            "banned CSS pattern backdrop-filter",
        ),
        (
            "shadow regression",
            lambda root: (root / "assets/site.css").write_text(
                'main { box-shadow: 0 1rem 3rem #000; }', encoding="utf-8"
            ),
            "banned CSS pattern box-shadow",
        ),
        (
            "purple palette regression",
            lambda root: (root / "assets/site.css").write_text(
                'body { color: #5c2d91; }', encoding="utf-8"
            ),
            "banned CSS pattern #5c2d91",
        ),
        (
            "raw component colour",
            lambda root: (root / "assets/site.css").write_text(
                '@import url("/assets/tokens.css");\nbody { color: #123456; }',
                encoding="utf-8",
            ),
            "raw colour outside assets/tokens.css: #123456",
        ),
        (
            "layout-shifting font display",
            lambda root: (root / "assets/tokens.css").write_text(
                (root / "assets/tokens.css")
                .read_text(encoding="utf-8")
                .replace("font-display: optional", "font-display: swap"),
                encoding="utf-8",
            ),
            "font face 1 must use font-display: optional",
        ),
        (
            "missing visible glyph",
            lambda root: (root / "assets/tokens.css").write_text(
                (root / "assets/tokens.css")
                .read_text(encoding="utf-8")
                .replace("U+0020-007E, U+00A0-00FF", "U+0020-007E"),
                encoding="utf-8",
            ),
            "font face 1 does not cover visible U+00B7",
        ),
        (
            "missing JavaScript-rendered glyph",
            lambda root: (root / "index.html").write_text(
                (root / "index.html").read_text(encoding="utf-8")
                + '<script>document.querySelector("h1").textContent = "Ready ✅";</script>',
                encoding="utf-8",
            ),
            "font face 1 does not cover visible U+2705",
        ),
        (
            "oversized webfont",
            lambda root: (root / "assets/fonts/Test.woff2").write_bytes(
                b"x" * 25001
            ),
            "font exceeds 25000-byte delivery budget: assets/fonts/Test.woff2",
        ),
        (
            "unprotected local font face",
            lambda root: (
                (root / "assets/fonts/Extra.woff2").write_bytes(b"extra-font"),
                (root / "assets/tokens.css").write_text(
                    (root / "assets/tokens.css").read_text(encoding="utf-8")
                    + '\n@font-face { font-family: "Extra"; '
                    'src: url("/assets/fonts/Extra.woff2") format("woff2"); '
                    'font-display: optional; '
                    'unicode-range: U+0020-007E, U+00A0-00FF; }\n',
                    encoding="utf-8",
                ),
            ),
            "unprotected font declared: assets/fonts/Extra.woff2",
        ),
        (
            "remote font face",
            lambda root: (root / "assets/tokens.css").write_text(
                (root / "assets/tokens.css").read_text(encoding="utf-8")
                + '\n@font-face { font-family: "Remote"; '
                'src: url("https://fonts.example/remote.woff2") format("woff2"); '
                'font-display: optional; '
                'unicode-range: U+0020-007E, U+00A0-00FF; }\n',
                encoding="utf-8",
            ),
            "font face 2 must use one protected local WOFF2 source",
        ),
        (
            "non-black canvas",
            lambda root: (root / "assets/tokens.css").write_text(
                (root / "assets/tokens.css")
                .read_text(encoding="utf-8")
                .replace("--colour-canvas: #000000", "--colour-canvas: #010101"),
                encoding="utf-8",
            ),
            "OLED canvas must be #000000",
        ),
        (
            "mixed colour scheme",
            lambda root: (root / "assets/tokens.css").write_text(
                (root / "assets/tokens.css")
                .read_text(encoding="utf-8")
                .replace("color-scheme: dark", "color-scheme: light dark"),
                encoding="utf-8",
            ),
            "native colour scheme must be dark only",
        ),
        (
            "low contrast supporting ink",
            lambda root: (root / "assets/tokens.css").write_text(
                (root / "assets/tokens.css")
                .read_text(encoding="utf-8")
                .replace("--colour-ink-soft: #9aa89f", "--colour-ink-soft: #555555"),
                encoding="utf-8",
            ),
            "--colour-ink-soft contrast on canvas must be at least 4.5:1",
        ),
        (
            "system light override",
            lambda root: (root / "assets/tokens.css").write_text(
                (root / "assets/tokens.css").read_text(encoding="utf-8")
                + "\n@media (prefers-color-scheme: light) { "
                ":root { --colour-canvas: #fff; } }",
                encoding="utf-8",
            ),
            "OLED theme must not contain a prefers-color-scheme override",
        ),
        (
            "oversized mobile display",
            lambda root: (root / "assets/tokens.css").write_text(
                (root / "assets/tokens.css")
                .read_text(encoding="utf-8")
                .replace(
                    "--text-display: clamp(2.5rem, 1.45rem + 5.6vw, 6rem)",
                    "--text-display: clamp(3rem, 1.45rem + 5.6vw, 6rem)",
                ),
                encoding="utf-8",
            ),
            "display type minimum must fit the 320px viewport",
        ),
        (
            "non-sticky route rail",
            lambda root: (root / "assets/site.css").write_text(
                (root / "assets/site.css")
                .read_text(encoding="utf-8")
                .replace("position: sticky", "position: static"),
                encoding="utf-8",
            ),
            "route labels must be sticky on wide layouts",
        ),
        (
            "expanding route content",
            lambda root: (root / "assets/site.css").write_text(
                (root / "assets/site.css")
                .read_text(encoding="utf-8")
                .replace("min-width: 0", "min-width: auto"),
                encoding="utf-8",
            ),
            "route content must allow internal overflow without widening the page",
        ),
        (
            "expanding nested route grid",
            lambda root: (root / "assets/site.css").write_text(
                (root / "assets/site.css")
                .read_text(encoding="utf-8")
                .replace(
                    ".route-actions { min-width: 0; }",
                    ".route-actions { min-width: auto; }",
                ),
                encoding="utf-8",
            ),
            "route action groups must contain intrinsic-width content",
        ),
        (
            "unbroken identifier wrapping removed",
            lambda root: (root / "assets/site.css").write_text(
                (root / "assets/site.css")
                .read_text(encoding="utf-8")
                .replace("overflow-wrap: anywhere;", ""),
                encoding="utf-8",
            ),
            "body must wrap unbroken identifiers at the 320px boundary",
        ),
        (
            "fallback proof containment removed",
            lambda root: (root / "assets/site.css").write_text(
                (root / "assets/site.css")
                .read_text(encoding="utf-8")
                .replace(
                    ".proof-feature figure { min-width: 0; margin-inline: 0; }",
                    ".proof-feature figure { }",
                ),
                encoding="utf-8",
            ),
            "proof media must not widen the fallback viewport",
        ),
        (
            "fast interactive motion",
            lambda root: (root / "assets/site.css").write_text(
                (root / "assets/site.css")
                .read_text(encoding="utf-8")
                .replace("var(--motion-standard)", "var(--motion-fast)"),
                encoding="utf-8",
            ),
            "links and controls must use the standard motion duration",
        ),
        (
            "button press feedback removed",
            lambda root: (root / "assets/site.css").write_text(
                (root / "assets/site.css")
                .read_text(encoding="utf-8")
                .replace("button:active { translate: 0 1px; }", ""),
                encoding="utf-8",
            ),
            "buttons must move by one pixel on press",
        ),
        (
            "banned marketing copy",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace("Example", "Unlock your potential", 1),
                encoding="utf-8",
            ),
            "index.html: banned visible phrase 'unlock'",
        ),
        (
            "decorative emoji copy",
            lambda root: (root / "index.html").write_text(
                (root / "index.html").read_text(encoding="utf-8")
                + "<p>Review faster 📈</p>",
                encoding="utf-8",
            ),
            "index.html: decorative emoji is not permitted",
        ),
        (
            "serial stylesheet import",
            lambda root: (root / "assets/site.css").write_text(
                '@import url("/assets/tokens.css");\n'
                "body { background: var(--colour-canvas); }",
                encoding="utf-8",
            ),
            "assets/site.css: token import creates a serial request chain",
        ),
        (
            "missing token stylesheet",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace('<link rel="stylesheet" href="/assets/tokens.css" />', ""),
                encoding="utf-8",
            ),
            "index.html: expected one tokens stylesheet before site stylesheet",
        ),
        (
            "token stylesheet outside head",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace('<link rel="stylesheet" href="/assets/tokens.css" />', "")
                .replace(
                    "</main>",
                    '</main><link rel="stylesheet" href="/assets/tokens.css" />',
                ),
                encoding="utf-8",
            ),
            "index.html: expected one tokens stylesheet before site stylesheet",
        ),
        (
            "missing machine alternate",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace(
                    '<link rel="alternate" type="text/plain" '
                    'href="https://duguid.com.au/llms.txt" />',
                    "",
                ),
                encoding="utf-8",
            ),
            "index.html: expected one llms.txt alternate link",
        ),
        (
            "machine alternate outside head",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace(
                    '<link rel="alternate" type="text/plain" '
                    'href="https://duguid.com.au/llms.txt" />',
                    "",
                )
                .replace(
                    "</main>",
                    '</main><link rel="alternate" type="text/plain" '
                    'href="https://duguid.com.au/llms.txt" />',
                ),
                encoding="utf-8",
            ),
            "index.html: expected one llms.txt alternate link",
        ),
        (
            "missing visible machine index",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace('<a href="/llms.txt">Machine-readable index</a>', ""),
                encoding="utf-8",
            ),
            "index.html: expected one visible machine-readable index link",
        ),
        (
            "machine index outside footer",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace('<a href="/llms.txt">Machine-readable index</a>', "")
                .replace(
                    "</main>",
                    '<a href="/llms.txt">Machine-readable index</a></main>',
                ),
                encoding="utf-8",
            ),
            "index.html: expected one visible machine-readable index link",
        ),
        (
            "eager proof image",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace(' loading="lazy"', ""),
                encoding="utf-8",
            ),
            "index.html: Coal LSL proof image must load lazily",
        ),
        (
            "missing proof image alternative",
            lambda root: (root / "index.html").write_text(
                (root / "index.html")
                .read_text(encoding="utf-8")
                .replace(' alt="Example calculation"', ""),
                encoding="utf-8",
            ),
            "index.html: Coal LSL proof image must have descriptive alt text",
        ),
        (
            "broken font URL",
            lambda root: (root / "assets/tokens.css").write_text(
                '@font-face { src: url("/assets/fonts/Missing.woff2"); }',
                encoding="utf-8",
            ),
            "font face target missing: assets/fonts/Missing.woff2",
        ),
    )
    for label, mutate, expected in mutations:
        failures = fixture_failures(mutate)
        assert any(expected in failure for failure in failures), (
            f"{label}: expected {expected!r}, found {failures!r}"
        )

    print("design contract tests passed")


if __name__ == "__main__":
    self_check()
