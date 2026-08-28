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
    rate = b"<html><body><main>12%</main></body></html>\n"
    font = b"font-fixture"
    licence = b"SIL OPEN FONT LICENSE Version 1.1\nPermission notice\n"
    page = (
        '<!doctype html><html><body><main><h1>Example</h1></main>'
        f'<footer><p>{DISCLAIMER}</p></footer>'
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
        'font-display: optional; }\n'
        ':root { --colour-canvas: #f8faf8; --radius-control: 0.125rem; }\n',
        encoding="utf-8",
    )
    (root / "assets/site.css").write_text(
        '@import url("/assets/tokens.css");\n'
        "body { background: var(--colour-canvas); }\n"
        ".route-section > h2 { position: sticky; }\n"
        ".route-content { min-width: 0; }\n"
        ".route-actions { min-width: 0; }\n"
        ".install-band { min-width: 0; }\n",
        encoding="utf-8",
    )
    (root / "index.html").write_bytes(page)
    (root / "about/index.html").write_text(
        "<!doctype html><html><body><main>About</main></body></html>",
        encoding="utf-8",
    )
    baseline = {
        "protected_files": {
            "llms.txt": digest(llms),
            "rates/example/index.html": digest(rate),
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

    mutations = (
        (
            "llms.txt drift",
            lambda root: (root / "llms.txt").write_text("changed", encoding="utf-8"),
            "protected file changed: llms.txt",
        ),
        (
            "rate table drift",
            lambda root: (root / "rates/example/index.html").write_text(
                "<html>13%</html>", encoding="utf-8"
            ),
            "protected file changed: rates/example/index.html",
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
            "missing token import",
            lambda root: (root / "assets/site.css").write_text(
                "body { color: black; }", encoding="utf-8"
            ),
            "assets/site.css: tokens.css must be the first rule",
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
