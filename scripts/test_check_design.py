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

    llms = b"# Example\n\nCurrent rate: 12%\n"
    rate = b"<html><body><main>12%</main></body></html>\n"
    font = b"font-fixture"
    licence = b"SIL OPEN FONT LICENSE Version 1.1"
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
    (root / "index.html").write_bytes(page)
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
    )
    for label, mutate, expected in mutations:
        failures = fixture_failures(mutate)
        assert any(expected in failure for failure in failures), (
            f"{label}: expected {expected!r}, found {failures!r}"
        )

    print("design contract tests passed")


if __name__ == "__main__":
    self_check()
