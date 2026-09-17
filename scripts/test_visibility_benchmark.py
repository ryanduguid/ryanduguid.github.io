"""Mutation tests for the visibility benchmark's validator and summariser."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import visibility_benchmark as benchmark

PROMPTS = benchmark.load_prompts()
BRANDED_ID = "P1-identity"
UNBRANDED_ID = "P4-cash-example"


def complete_observation(prompt_id: str = BRANDED_ID) -> dict:
    return {
        "prompt_id": prompt_id,
        "status": "complete",
        "system": "Test Assistant",
        "model_reported": "not disclosed",
        "search_enabled": "on",
        "fresh_session": True,
        "executed_at": "2026-09-18T09:00:00+10:00",
        "timezone": "Australia/Melbourne",
        "prompt_sent": PROMPTS[prompt_id]["prompt"],
        "answer_evidence": "captures/answers/test.txt",
        "mentioned": True,
        "site_cited": True,
        "cited_urls": ["https://duguid.com.au/about/"],
        "factual_errors": [],
        "notes": "",
    }


def written(capture: dict, directory: Path, name: str = "capture.json") -> Path:
    path = directory / name
    path.write_text(json.dumps(capture), encoding="utf-8")
    return path


def failures_for(capture: dict, name: str = "capture.json") -> list[str]:
    with tempfile.TemporaryDirectory() as directory:
        path = written(capture, Path(directory), name)
        return benchmark.check_capture(path, PROMPTS)


def expect_failure(label: str, failures: list[str], expected: str) -> None:
    assert any(expected in failure for failure in failures), (
        f"{label}: expected {expected!r}, found {failures!r}"
    )


def base_capture() -> dict:
    return {
        "schema": 1,
        "fixture": False,
        "recorded_by": "test",
        "observations": [complete_observation()],
    }


def test_stored_captures_validate() -> None:
    stored = sorted(benchmark.CAPTURES.glob("*.json"))
    assert stored, "the benchmark ships at least one labelled fixture capture"
    for path in stored:
        assert not benchmark.check_capture(path, PROMPTS), path.name
    for path in stored:
        capture = benchmark.load_capture(path)
        assert capture["fixture"] is True, (
            f"{path.name}: stored captures are fixtures until a real run is recorded"
        )


def test_a_valid_capture_passes() -> None:
    assert not failures_for(base_capture())


def test_unknown_prompt_is_rejected() -> None:
    capture = base_capture()
    capture["observations"][0]["prompt_id"] = "P9-invented"
    expect_failure("unknown prompt", failures_for(capture), "unknown prompt_id")


def test_reworded_prompt_is_rejected() -> None:
    capture = base_capture()
    capture["observations"][0]["prompt_sent"] = "Who is Ryan Duguid?"
    expect_failure(
        "reworded prompt", failures_for(capture), "does not match the reviewed text"
    )


def test_missing_evidence_is_rejected() -> None:
    for field in ("answer_evidence", "executed_at", "search_enabled", "cited_urls"):
        capture = base_capture()
        capture["observations"][0][field] = None
        expect_failure(
            f"missing {field}", failures_for(capture), f"needs {field}"
        )


def test_timestamp_needs_an_offset() -> None:
    capture = base_capture()
    capture["observations"][0]["executed_at"] = "2026-09-18T09:00:00"
    expect_failure("naive timestamp", failures_for(capture), "must carry a UTC offset")


def test_citation_must_be_a_site_url() -> None:
    capture = base_capture()
    capture["observations"][0]["cited_urls"] = ["https://example.com/page"]
    expect_failure(
        "citation without a site URL",
        failures_for(capture),
        "no cited URL is on duguid.com.au",
    )


def test_undeclared_factual_error_is_rejected() -> None:
    capture = base_capture()
    capture["observations"][0]["factual_errors"] = ["E99-invented"]
    expect_failure("undeclared error", failures_for(capture), "is not declared")


def test_unrun_observation_needs_a_reason() -> None:
    capture = base_capture()
    capture["observations"][0] = {"prompt_id": BRANDED_ID, "status": "not_run"}
    expect_failure("unrun without a reason", failures_for(capture), "needs a reason")


def test_unrun_observations_leave_the_denominator() -> None:
    """A test that did not run is excluded, never counted as a failure."""
    capture = base_capture()
    capture["observations"].append(
        {
            "prompt_id": UNBRANDED_ID,
            "status": "blocked",
            "reason": "sign-in required",
            "system": "Test Assistant",
        }
    )
    with tempfile.TemporaryDirectory() as directory:
        path = written(capture, Path(directory))
        assert not benchmark.check_capture(path, PROMPTS)
        summary = benchmark.summarise([path], PROMPTS, include_fixtures=False)
    assert "mentions:   1/1 completed answers" in summary
    assert "no completed observations (1 excluded)" in summary


def test_fixtures_are_excluded_from_real_summaries() -> None:
    fixture = base_capture()
    fixture["fixture"] = True
    real = base_capture()
    real["observations"][0]["site_cited"] = False
    real["observations"][0]["cited_urls"] = []
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        paths = [
            written(fixture, root, "fixture.json"),
            written(real, root, "real.json"),
        ]
        excluded = benchmark.summarise(paths, PROMPTS, include_fixtures=False)
        included = benchmark.summarise(paths, PROMPTS, include_fixtures=True)
    assert "citations:  0/1" in excluded and "Excluded 1 fixture file" in excluded
    assert "citations:  1/2" in included


def test_branded_and_unbranded_stay_apart() -> None:
    capture = base_capture()
    unbranded = complete_observation(UNBRANDED_ID)
    unbranded["site_cited"] = False
    unbranded["cited_urls"] = []
    capture["observations"].append(unbranded)
    with tempfile.TemporaryDirectory() as directory:
        path = written(capture, Path(directory))
        summary = benchmark.summarise([path], PROMPTS, include_fixtures=False)
    assert "Test Assistant, branded prompts" in summary
    assert "Test Assistant, non-branded prompts" in summary


def test_unusable_files_are_reported_not_raised() -> None:
    """A malformed capture is a validation message, never a traceback."""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        cases = {
            "broken.json": "{ not json",
            "array.json": "[]",
            "null.json": "null",
            "scalar-observation.json": '{"fixture": false, "recorded_by": "t", "observations": [1]}',
        }
        for name, text in cases.items():
            path = root / name
            path.write_text(text, encoding="utf-8")
            failures = benchmark.check_capture(path, PROMPTS)
            assert failures, f"{name}: expected a validation failure"
            assert all(name in failure for failure in failures), failures
        # A summary over the same files reports them and counts nothing.
        summary = benchmark.summarise(
            [root / name for name in cases], PROMPTS, include_fixtures=True
        )
        assert "Could not read" in summary
        assert "No observations to summarise." in summary


def test_lookalike_hosts_are_not_site_citations() -> None:
    assert benchmark.site_cited_url("https://duguid.com.au/about/")
    assert benchmark.site_cited_url("https://www.duguid.com.au/about/")
    for url in (
        "https://duguid.com.au.example.org/about/",
        "https://notduguid.com.au/about/",
        "https://example.org/?q=duguid.com.au",
        None,
    ):
        assert not benchmark.site_cited_url(url), url

    capture = base_capture()
    capture["observations"][0]["cited_urls"] = ["https://duguid.com.au.example.org/"]
    expect_failure(
        "lookalike host", failures_for(capture), "no cited URL is on duguid.com.au"
    )


def test_boolean_fields_reject_strings() -> None:
    """A string such as "false" must not be counted as a mention or a citation."""
    for field in ("mentioned", "site_cited", "fresh_session"):
        capture = base_capture()
        capture["observations"][0][field] = "false"
        expect_failure(f"{field} as a string", failures_for(capture), "must be true or false")

    capture = base_capture()
    capture["fixture"] = "false"
    expect_failure("fixture as a string", failures_for(capture), "must declare fixture true or false")


def test_a_capture_with_no_system_does_not_crash_the_summary() -> None:
    """The blank template is summarisable: its null system must not break sorting."""
    capture = json.loads(benchmark.template(PROMPTS))
    capture["recorded_by"] = "test"
    for observation in capture["observations"]:
        observation["reason"] = "not attempted"
    filled = complete_observation()
    capture["observations"].append(filled)
    with tempfile.TemporaryDirectory() as directory:
        path = written(capture, Path(directory))
        assert not benchmark.check_capture(path, PROMPTS)
        summary = benchmark.summarise([path], PROMPTS, include_fixtures=False)
    assert "unknown, branded prompts" in summary
    assert "mentions:   1/1 completed answers" in summary


def test_template_covers_every_prompt() -> None:
    capture = json.loads(benchmark.template(PROMPTS))
    assert capture["fixture"] is False
    assert [observation["prompt_id"] for observation in capture["observations"]] == list(
        PROMPTS
    )
    for observation in capture["observations"]:
        assert observation["status"] == "not_run"
        assert observation["prompt_sent"] == PROMPTS[observation["prompt_id"]]["prompt"]


def test_every_prompt_declares_sourced_facts_and_errors() -> None:
    for prompt_id, prompt in PROMPTS.items():
        assert prompt["prompt"].strip(), prompt_id
        assert isinstance(prompt["branded"], bool), prompt_id
        assert prompt["expected_facts"], f"{prompt_id}: needs at least one expected fact"
        assert prompt["common_errors"], f"{prompt_id}: needs at least one common error"
        for fact in prompt["expected_facts"]:
            assert fact["source"].startswith("https://"), prompt_id
        ids = [error["id"] for error in prompt["common_errors"]]
        assert len(ids) == len(set(ids)), f"{prompt_id}: duplicate error ids"


def main() -> None:
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
    print(f"visibility benchmark tests passed ({len(tests)} cases)")


if __name__ == "__main__":
    main()
    sys.exit(0)
