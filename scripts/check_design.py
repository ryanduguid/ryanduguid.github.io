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


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


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
        elif sha256_bytes(path.read_bytes()) != expected:
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
