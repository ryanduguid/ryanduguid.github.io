"""Deterministic routing evaluations for the repository site-quality skill."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL_DIR = ROOT / ".agents" / "skills" / "duguid-site-quality"
SKILL_PATH = SKILL_DIR / "SKILL.md"
CHECKLIST_PATH = SKILL_DIR / "references" / "release-checklist.md"
EVALS_PATH = SKILL_DIR / "evals" / "evals.json"


def frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"\A---\n(?P<header>.*?)\n---\n", text, re.DOTALL)
    assert match is not None, "SKILL.md needs YAML frontmatter"
    fields: dict[str, str] = {}
    for line in match.group("header").splitlines():
        key, separator, value = line.partition(":")
        assert separator, f"invalid frontmatter line: {line!r}"
        fields[key.strip()] = value.strip()
    return fields


def self_check() -> None:
    assert SKILL_PATH.is_file(), f"skill file missing: {SKILL_PATH}"
    assert CHECKLIST_PATH.is_file(), f"checklist missing: {CHECKLIST_PATH}"

    skill = SKILL_PATH.read_text(encoding="utf-8")
    checklist = CHECKLIST_PATH.read_text(encoding="utf-8")
    fields = frontmatter(skill)
    assert fields.get("name") == "duguid-site-quality"
    description = fields.get("description", "")
    assert description.startswith("Use when "), description
    assert len(description) <= 500
    assert "AGENTS.md" in skill
    assert "references/release-checklist.md" in skill
    assert len(re.findall(r"\b[\w'-]+\b", skill)) < 500

    evaluations = json.loads(EVALS_PATH.read_text(encoding="utf-8"))
    assert evaluations.get("skill") == fields["name"]
    cases = evaluations.get("cases")
    assert isinstance(cases, list) and len(cases) == 4
    assert {case.get("id") for case in cases} == {
        "copy-only",
        "calculator",
        "search-console",
        "release",
    }

    sources = {
        "SKILL.md": skill,
        "references/release-checklist.md": checklist,
    }
    for case in cases:
        assert isinstance(case.get("prompt"), str) and case["prompt"].strip()
        selected_sources = case.get("sources")
        assert isinstance(selected_sources, list) and selected_sources
        assert all(source in sources for source in selected_sources)
        routing_contract = " ".join(
            "\n".join(sources[source] for source in selected_sources)
            .casefold()
            .split()
        )
        markers = case.get("expected_markers")
        assert isinstance(markers, list) and markers
        missing = [
            marker
            for marker in markers
            if " ".join(marker.casefold().split()) not in routing_contract
        ]
        assert not missing, f"{case['id']} routing gaps: {missing}"
        expected_lines = case.get("expected_lines", [])
        assert isinstance(expected_lines, list)
        source_lines = {
            line.strip().casefold()
            for source in selected_sources
            for line in sources[source].splitlines()
        }
        missing_lines = [
            line for line in expected_lines if line.casefold() not in source_lines
        ]
        assert not missing_lines, (
            f"{case['id']} exact command gaps: {missing_lines}"
        )

    print("duguid site quality skill tests passed")


if __name__ == "__main__":
    self_check()
