"""Mutation tests for the visibility benchmark's validator, summariser and CLI."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import visibility_benchmark as benchmark

SCRIPT = Path(__file__).resolve().parent / "visibility_benchmark.py"
PROMPTS = benchmark.load_prompts()
BRANDED_ID = "P1-identity"
UNBRANDED_ID = "P4-cash-example"
FIXTURE_NAME = "fixture-example.json"


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


def unrun_observation(prompt_id: str) -> dict:
    return {
        "prompt_id": prompt_id,
        "status": "not_run",
        "reason": "not attempted in this round",
    }


def base_capture() -> dict:
    return {
        "schema": 1,
        "fixture": False,
        "recorded_by": "test",
        "observations": [complete_observation()],
    }


def written(capture: dict, directory: Path, name: str = "capture.json") -> Path:
    path = directory / name
    path.write_text(json.dumps(capture), encoding="utf-8")
    return path


def failures_for(capture: dict, name: str = "capture.json") -> list[str]:
    with tempfile.TemporaryDirectory() as directory:
        return benchmark.check_capture(written(capture, Path(directory), name), PROMPTS)


def summary_of(captures: list[dict], include_fixtures: bool = False) -> str:
    """Validate then summarise, the way the command line does."""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        paths = [
            written(capture, root, f"capture-{index}.json")
            for index, capture in enumerate(captures)
        ]
        loaded, failures = benchmark.validated(paths, PROMPTS)
        assert not failures, failures
        return benchmark.summarise(loaded, PROMPTS, include_fixtures)


def run_cli(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *arguments],
        capture_output=True,
        text=True,
        check=False,
    )


def expect_failure(label: str, failures: list[str], expected: str) -> None:
    assert any(expected in failure for failure in failures), (
        f"{label}: expected {expected!r}, found {failures!r}"
    )


def test_stored_captures_validate() -> None:
    """Every stored capture is valid, whether or not it is a fixture."""
    stored = sorted(benchmark.CAPTURES.glob("*.json"))
    assert stored, "the benchmark ships at least one capture"
    for path in stored:
        assert not benchmark.check_capture(path, PROMPTS), path.name

    # The shipped example is fixture data specifically; a genuine round recorded
    # later must not have to pretend it is one to pass these tests.
    shipped = benchmark.CAPTURES / FIXTURE_NAME
    assert shipped.is_file(), f"{FIXTURE_NAME} is the labelled example capture"
    assert benchmark.load_capture(shipped)["fixture"] is True


def test_a_genuine_capture_needs_no_test_changes() -> None:
    """A real, non-fixture round validates and is counted by default."""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        shutil.copy(benchmark.CAPTURES / FIXTURE_NAME, root / FIXTURE_NAME)
        genuine = base_capture()
        genuine["recorded_by"] = "an accountant"
        written(genuine, root, "2026-09-18-round.json")

        loaded, failures = benchmark.validated(sorted(root.glob("*.json")), PROMPTS)
        assert not failures, failures
        assert len(loaded) == 2

        default = benchmark.summarise(loaded, PROMPTS, include_fixtures=False)
        assert "Excluded 1 fixture file" in default
        assert "mentions:   1/1 completed answers" in default
        assert "Example Assistant" not in default

        included = benchmark.summarise(loaded, PROMPTS, include_fixtures=True)
        assert "Example Assistant" in included


def test_a_partial_round_from_the_template() -> None:
    """One completed observation among unrun ones validates and counts once."""
    capture = json.loads(benchmark.template(PROMPTS))
    capture["recorded_by"] = "an accountant"
    completed = complete_observation(BRANDED_ID)
    capture["observations"] = [
        completed if observation["prompt_id"] == BRANDED_ID else observation
        for observation in capture["observations"]
    ]
    assert not failures_for(capture)
    summary = summary_of([capture])
    assert "Test Assistant, branded prompts, search on" in summary
    assert "mentions:   1/1 completed answers" in summary
    # The unrun prompts belong to the same round, so they report under its system.
    # They carry no search state, so they never join a measured rate.
    assert "Test Assistant, branded prompts, search unknown" in summary
    assert "no completed observations (2 excluded)" in summary
    assert "Test Assistant, non-branded prompts, search unknown" in summary
    assert "no completed observations (3 excluded)" in summary
    assert "unknown, " not in summary, "an unrun row must not lose its round's system"


def test_the_template_alone_does_not_validate() -> None:
    """The template is deliberately unfinished: it needs a recorder first."""
    capture = json.loads(benchmark.template(PROMPTS))
    expect_failure("blank template", failures_for(capture), "must name who recorded it")


def test_unknown_prompt_and_error_ids_are_reported() -> None:
    capture = base_capture()
    capture["observations"][0]["prompt_id"] = "P9-invented"
    expect_failure("unknown prompt", failures_for(capture), "unknown prompt_id")

    capture = base_capture()
    capture["observations"][0]["factual_errors"] = ["E99-invented"]
    expect_failure("undeclared error", failures_for(capture), "is not declared")


def test_reworded_prompt_is_rejected() -> None:
    capture = base_capture()
    capture["observations"][0]["prompt_sent"] = "Who is Ryan Duguid?"
    expect_failure("reworded prompt", failures_for(capture), "does not match the reviewed text")


def test_blank_and_missing_text_fields_are_rejected() -> None:
    for field in ("system", "model_reported", "timezone", "answer_evidence"):
        for value in (None, "", "   "):
            capture = base_capture()
            capture["observations"][0][field] = value
            expect_failure(
                f"{field}={value!r}", failures_for(capture), f"needs a non-empty {field}"
            )


def test_timestamps_must_be_offset_aware_strings() -> None:
    for value, expected in (
        ("2026-09-18T09:00:00", "must carry a UTC offset"),
        ("not a timestamp", "must be an ISO 8601 timestamp"),
        (1789658735, "must be an ISO 8601 timestamp string"),
        (True, "must be an ISO 8601 timestamp string"),
        ("", "must be an ISO 8601 timestamp string"),
    ):
        capture = base_capture()
        capture["observations"][0]["executed_at"] = value
        expect_failure(f"executed_at={value!r}", failures_for(capture), expected)


def test_boolean_fields_reject_strings() -> None:
    """A string such as "false" must never be counted as a positive."""
    for field in ("mentioned", "site_cited", "fresh_session"):
        capture = base_capture()
        capture["observations"][0][field] = "false"
        expect_failure(f"{field} as a string", failures_for(capture), "must be true or false")

    capture = base_capture()
    capture["fixture"] = "false"
    expect_failure("fixture as a string", failures_for(capture), "fixture true or false")


def test_schema_and_shape_are_validated() -> None:
    for value in (True, "1", 2, None):
        capture = base_capture()
        capture["schema"] = value
        expect_failure(f"schema={value!r}", failures_for(capture), "schema must be one of")

    capture = base_capture()
    capture["observations"] = []
    expect_failure("empty observations", failures_for(capture), "non-empty observations list")

    capture = base_capture()
    capture["observations"] = [1]
    expect_failure("scalar observation", failures_for(capture), "must be an object")


def test_structured_values_in_identifier_and_enum_fields() -> None:
    """Arrays and objects are rejected before any lookup or membership test."""
    for field, expected in (
        ("prompt_id", "prompt_id must be a string"),
        ("status", "status must be one of"),
        ("search_enabled", "search_enabled must be one of"),
    ):
        values: tuple[object, ...] = ([], {}, 7)
        for value in values:
            capture = base_capture()
            capture["observations"][0][field] = value
            expect_failure(f"{field}={value!r}", failures_for(capture), expected)

    capture = base_capture()
    capture["observations"][0]["factual_errors"] = [{"id": "E1-namesake"}]
    expect_failure("structured error id", failures_for(capture), "members must be strings")

    capture = base_capture()
    capture["observations"][0]["factual_errors"] = "E1-namesake"
    expect_failure("factual_errors as text", failures_for(capture), "must be a list")


def test_unrun_observation_needs_a_reason_but_no_evidence() -> None:
    capture = base_capture()
    capture["observations"][0] = {"prompt_id": BRANDED_ID, "status": "not_run"}
    expect_failure("unrun without a reason", failures_for(capture), "needs a reason")

    capture = base_capture()
    capture["observations"] = [unrun_observation(BRANDED_ID)]
    assert not failures_for(capture), "an unrun prompt needs no result fields"


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
    summary = summary_of([capture])
    assert "mentions:   1/1 completed answers" in summary
    assert "no completed observations (1 excluded)" in summary


def test_fixtures_are_excluded_from_real_summaries() -> None:
    fixture = base_capture()
    fixture["fixture"] = True
    real = base_capture()
    real["observations"][0]["site_cited"] = False
    real["observations"][0]["cited_urls"] = []
    excluded = summary_of([fixture, real], include_fixtures=False)
    included = summary_of([fixture, real], include_fixtures=True)
    assert "citations:  0/1" in excluded and "Excluded 1 fixture file" in excluded
    assert "citations:  1/2" in included


def test_branded_and_unbranded_stay_apart() -> None:
    capture = base_capture()
    unbranded = complete_observation(UNBRANDED_ID)
    unbranded["site_cited"] = False
    unbranded["cited_urls"] = []
    capture["observations"].append(unbranded)
    summary = summary_of([capture])
    assert "Test Assistant, branded prompts, search on" in summary
    assert "Test Assistant, non-branded prompts, search on" in summary


def test_unusable_files_are_reported_not_raised() -> None:
    """A malformed capture is a validation message, never a traceback."""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        cases = {
            "broken.json": b"{ not json",
            "array.json": b"[]",
            "null.json": b"null",
            "scalar-observation.json": b'{"schema":1,"fixture":false,"recorded_by":"t","observations":[1]}',
            "not-utf8.json": b'{"recorded_by": "\xff\xfe invalid"}',
        }
        for name, payload in cases.items():
            path = root / name
            path.write_bytes(payload)
            failures = benchmark.check_capture(path, PROMPTS)
            assert failures, f"{name}: expected a validation failure"
            assert all(name in failure for failure in failures), failures

        loaded, failures = benchmark.validated(sorted(root.glob("*.json")), PROMPTS)
        assert not loaded and len(failures) >= len(cases)


def test_site_citation_policy() -> None:
    for url in (
        "https://duguid.com.au/about/",
        "https://www.duguid.com.au/about/",
        "http://duguid.com.au/",
        "https://duguid.com.au:8443/about/",
    ):
        assert benchmark.site_cited_url(url), url
    rejected: tuple[object, ...] = (
        "https://duguid.com.au.example.org/about/",
        "https://example.org/?q=duguid.com.au",
        "https://notduguid.com.au/about/",
        "https://duguid.com.au:not-a-port/",
        "https://[duguid.com.au/",
        "ftp://duguid.com.au/file",
        "duguid.com.au/about/",
        None,
        17,
    )
    for candidate in rejected:
        assert not benchmark.site_cited_url(candidate), candidate


def test_every_cited_url_is_checked() -> None:
    """A malformed member is caught even after a valid site citation."""
    capture = base_capture()
    capture["observations"][0]["cited_urls"] = [
        "https://duguid.com.au/about/",
        "https://[duguid.com.au/",
    ]
    expect_failure(
        "trailing malformed URL",
        failures_for(capture),
        "cited_urls[2] is not a usable http or https URL",
    )

    capture = base_capture()
    capture["observations"][0]["cited_urls"] = ["https://duguid.com.au/about/", 42]
    expect_failure("non-string member", failures_for(capture), "cited_urls[2]")

    # An unrelated site is a perfectly valid citation, just not a site citation.
    capture = base_capture()
    capture["observations"][0]["site_cited"] = False
    capture["observations"][0]["cited_urls"] = ["https://example.org/page"]
    assert not failures_for(capture)


def test_citation_flag_must_agree_with_the_urls() -> None:
    capture = base_capture()
    capture["observations"][0]["cited_urls"] = ["https://example.org/page"]
    expect_failure("flag without a site URL", failures_for(capture), "no cited URL is on")

    capture = base_capture()
    capture["observations"][0]["site_cited"] = False
    expect_failure("site URL without the flag", failures_for(capture), "but site_cited is false")

    capture = base_capture()
    capture["observations"][0]["mentioned"] = False
    expect_failure("citation without a mention", failures_for(capture), "also mentions it")


def test_cli_rejects_invalid_input_before_summarising() -> None:
    """A summary never reports metrics from a capture that failed validation."""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        good = written(base_capture(), root, "good.json")
        reworded = base_capture()
        reworded["observations"][0]["prompt_sent"] = "Who is Ryan Duguid?"
        bad = written(reworded, root, "bad.json")

        result = run_cli("--summary", str(bad))
        assert result.returncode == 1, result.stdout
        assert "does not match the reviewed text" in result.stdout
        assert "mentions:" not in result.stdout

        # One invalid file among valid ones withholds the whole report.
        result = run_cli("--summary", str(good), str(bad))
        assert result.returncode == 1, result.stdout
        assert "mentions:" not in result.stdout

        result = run_cli("--summary", str(good), str(root / "absent.json"))
        assert result.returncode == 1, result.stdout
        assert "no such capture file" in result.stdout
        assert "mentions:" not in result.stdout

        result = run_cli("--summary", str(good))
        assert result.returncode == 0, result.stdout
        assert "mentions:   1/1 completed answers" in result.stdout


def test_cli_check_and_mode_handling() -> None:
    with tempfile.TemporaryDirectory() as directory:
        good = written(base_capture(), Path(directory), "good.json")

        assert run_cli("--check", str(good)).returncode == 0
        missing = run_cli("--check", str(Path(directory) / "absent.json"))
        assert missing.returncode == 1 and "no such capture file" in missing.stdout

        # The stored collection is the default for both reading modes.
        assert run_cli("--check").returncode == 0
        assert run_cli("--summary").returncode == 0

        # Conflicting modes are a usage error, never a silently ignored argument.
        conflict = run_cli("--check", "--summary")
        assert conflict.returncode == 2, conflict.stderr
        assert "not allowed with" in conflict.stderr


def test_search_modes_are_reported_separately() -> None:
    """An answer written without retrieval is not averaged into the same rate."""
    capture = base_capture()
    offline = complete_observation(UNBRANDED_ID)
    offline["search_enabled"] = "off"
    offline["site_cited"] = False
    offline["cited_urls"] = []
    capture["observations"].append(offline)
    summary = summary_of([capture])
    assert "search on" in summary and "search off" in summary
    # Each mode keeps its own denominator rather than being blended into one.
    assert summary.count("citations:  1/1 completed answers") == 1
    assert summary.count("citations:  0/1 completed answers") == 1


def test_non_fresh_runs_are_named_not_blended() -> None:
    capture = base_capture()
    capture["observations"][0]["fresh_session"] = False
    summary = summary_of([capture])
    assert "recorded without a fresh session: 1/1" in summary
    assert "not comparable with the rest" in summary

    fresh = summary_of([base_capture()])
    assert "recorded without a fresh session" not in fresh


def test_one_capture_records_one_system() -> None:
    """A single file cannot present itself as separate system measurements."""
    capture = base_capture()
    second = complete_observation(UNBRANDED_ID)
    second["system"] = "Another Assistant"
    second["site_cited"] = False
    second["cited_urls"] = []
    capture["observations"].append(second)
    expect_failure(
        "two systems in one capture",
        failures_for(capture),
        "one capture records one system per round",
    )


def test_template_covers_every_prompt() -> None:
    capture = json.loads(benchmark.template(PROMPTS))
    assert capture["fixture"] is False
    assert [observation["prompt_id"] for observation in capture["observations"]] == list(PROMPTS)
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
