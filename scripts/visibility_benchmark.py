"""Validate and summarise assistant-visibility captures.

The benchmark answers two separate questions and never mixes them:

- visibility: did an assistant mention the site, and did it cite a page,
- accuracy: were the facts in its answer right.

It runs no query itself. A person records each answer in a capture file, which
this script validates and summarises. Unrun and blocked observations are
excluded from every denominator rather than counted as a failure, fixtures are
excluded from real summaries, and branded prompts are summarised apart from
non-branded ones.

    python scripts/visibility_benchmark.py --template > capture.json
    python scripts/visibility_benchmark.py --check
    python scripts/visibility_benchmark.py --summary docs/visibility-benchmark/captures/*.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BENCHMARK = ROOT / "docs/visibility-benchmark"
PROMPTS = BENCHMARK / "prompts.json"
CAPTURES = BENCHMARK / "captures"
RUN_STATES = {"complete", "not_run", "blocked"}
SEARCH_STATES = {"on", "off", "unknown"}
REQUIRED_WHEN_COMPLETE = (
    "system",
    "model_reported",
    "search_enabled",
    "fresh_session",
    "executed_at",
    "timezone",
    "prompt_sent",
    "answer_evidence",
    "mentioned",
    "cited_urls",
    "site_cited",
)


def load_prompts(path: Path = PROMPTS) -> dict[str, dict[str, Any]]:
    """The reviewed prompt set, keyed by its stable identifier."""
    data = json.loads(path.read_text(encoding="utf-8"))
    return {prompt["id"]: prompt for prompt in data["prompts"]}


def load_capture(path: Path) -> dict[str, Any]:
    capture: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return capture


def known_error_ids(prompt: dict[str, Any]) -> set[str]:
    return {error["id"] for error in prompt.get("common_errors", [])}


def check_observation(
    label: str,
    index: int,
    observation: dict[str, Any],
    prompts: dict[str, dict[str, Any]],
) -> list[str]:
    """Check one recorded answer against the reviewed prompt set."""
    failures: list[str] = []
    where = f"{label} observation {index}"
    prompt_id = observation.get("prompt_id")
    prompt = prompts.get(prompt_id or "")
    if prompt is None:
        return [f"{where}: unknown prompt_id {prompt_id!r}"]

    status = observation.get("status")
    if status not in RUN_STATES:
        failures.append(f"{where}: status must be one of {sorted(RUN_STATES)}")
    if status != "complete":
        # A test that did not run carries no result. It needs a reason, not data.
        if not observation.get("reason"):
            failures.append(f"{where}: a {status} observation needs a reason")
        return failures

    for field in REQUIRED_WHEN_COMPLETE:
        if observation.get(field) is None:
            failures.append(f"{where}: complete observation needs {field}")

    if observation.get("prompt_sent") not in (None, prompt["prompt"]):
        failures.append(
            f"{where}: prompt_sent does not match the reviewed text for {prompt_id}"
        )
    if observation.get("search_enabled") not in SEARCH_STATES | {None}:
        failures.append(f"{where}: search_enabled must be one of {sorted(SEARCH_STATES)}")

    executed_at = observation.get("executed_at")
    if isinstance(executed_at, str):
        try:
            parsed = datetime.fromisoformat(executed_at)
        except ValueError:
            failures.append(f"{where}: executed_at must be an ISO 8601 timestamp")
        else:
            if parsed.utcoffset() is None:
                failures.append(f"{where}: executed_at must carry a UTC offset")

    cited = observation.get("cited_urls")
    if cited is not None and not isinstance(cited, list):
        failures.append(f"{where}: cited_urls must be a list, empty when none were shown")
    if isinstance(cited, list) and observation.get("site_cited") is True:
        if not any("duguid.com.au" in url for url in cited):
            failures.append(
                f"{where}: site_cited is true but no cited URL is on duguid.com.au"
            )
    if observation.get("site_cited") and not observation.get("mentioned"):
        failures.append(f"{where}: an answer that cites the site also mentions it")

    for error_id in observation.get("factual_errors", []) or []:
        if error_id not in known_error_ids(prompt):
            failures.append(
                f"{where}: factual error {error_id!r} is not declared for {prompt_id}"
            )
    return failures


def check_capture(path: Path, prompts: dict[str, dict[str, Any]]) -> list[str]:
    """Check one capture file's shape and every observation in it."""
    capture = load_capture(path)
    label = path.name
    failures: list[str] = []
    if capture.get("fixture") is None:
        failures.append(f"{label}: must declare fixture true or false")
    if not capture.get("recorded_by"):
        failures.append(f"{label}: must name who recorded it")
    observations = capture.get("observations")
    if not isinstance(observations, list) or not observations:
        return [*failures, f"{label}: needs a non-empty observations list"]
    for index, observation in enumerate(observations, start=1):
        failures.extend(check_observation(label, index, observation, prompts))
    return failures


def summarise(
    captures: list[Path], prompts: dict[str, dict[str, Any]], include_fixtures: bool
) -> str:
    """Report visibility and accuracy separately, with explicit denominators."""
    counts: dict[tuple[str, bool], dict[str, int]] = defaultdict(
        lambda: {"complete": 0, "mentioned": 0, "cited": 0, "clean": 0, "excluded": 0}
    )
    fixtures_skipped = 0
    for path in captures:
        capture = load_capture(path)
        if capture.get("fixture") and not include_fixtures:
            fixtures_skipped += 1
            continue
        for observation in capture.get("observations", []):
            prompt = prompts.get(observation.get("prompt_id", ""))
            if prompt is None:
                continue
            bucket = counts[(observation.get("system", "unknown"), bool(prompt["branded"]))]
            if observation.get("status") != "complete":
                bucket["excluded"] += 1
                continue
            bucket["complete"] += 1
            bucket["mentioned"] += 1 if observation.get("mentioned") else 0
            bucket["cited"] += 1 if observation.get("site_cited") else 0
            bucket["clean"] += 0 if observation.get("factual_errors") else 1

    lines = ["Assistant visibility and accuracy, by system and prompt group", ""]
    if not counts:
        lines.append("No observations to summarise.")
    for (system, branded), bucket in sorted(counts.items()):
        group = "branded" if branded else "non-branded"
        total = bucket["complete"]
        lines.append(f"{system}, {group} prompts")
        if total == 0:
            lines.append(f"  no completed observations ({bucket['excluded']} excluded)")
            continue
        lines.append(f"  mentions:   {bucket['mentioned']}/{total} completed answers")
        lines.append(f"  citations:  {bucket['cited']}/{total} completed answers")
        lines.append(f"  no declared factual error: {bucket['clean']}/{total}")
        lines.append(f"  excluded (not run or blocked): {bucket['excluded']}")
    if fixtures_skipped:
        lines.append("")
        lines.append(f"Excluded {fixtures_skipped} fixture file(s) from these counts.")
    lines.extend(
        [
            "",
            "A mention is not a citation, and a citation is not a ranking. One",
            "response is one observation: repeat a prompt before reading a trend,",
            "and never compare a search result page with an assistant's answer.",
        ]
    )
    return "\n".join(lines)


def template(prompts: dict[str, dict[str, Any]]) -> str:
    """A blank capture file covering every reviewed prompt once."""
    capture = {
        "schema": 1,
        "fixture": False,
        "recorded_by": "",
        "run_notes": "One file per system per round. Keep answer evidence beside it.",
        "observations": [
            {
                "prompt_id": prompt_id,
                "status": "not_run",
                "reason": "not attempted",
                "system": None,
                "model_reported": None,
                "search_enabled": None,
                "fresh_session": None,
                "executed_at": None,
                "timezone": "Australia/Melbourne",
                "prompt_sent": prompt["prompt"],
                "answer_evidence": None,
                "mentioned": None,
                "site_cited": None,
                "cited_urls": [],
                "factual_errors": [],
                "notes": "",
            }
            for prompt_id, prompt in prompts.items()
        ],
    }
    return json.dumps(capture, indent=2) + "\n"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", action="store_true", help="print a blank capture file")
    parser.add_argument("--check", action="store_true", help="validate the stored captures")
    parser.add_argument("--summary", nargs="*", help="summarise the given capture files")
    parser.add_argument(
        "--include-fixtures",
        action="store_true",
        help="include labelled fixture captures in the summary",
    )
    args = parser.parse_args(argv)
    prompts = load_prompts()

    if args.template:
        print(template(prompts), end="")
        return 0

    stored = sorted(CAPTURES.glob("*.json")) if CAPTURES.is_dir() else []
    if args.summary is not None:
        chosen = [Path(name) for name in args.summary] or stored
        print(summarise(chosen, prompts, args.include_fixtures))
        return 0

    failures = [failure for path in stored for failure in check_capture(path, prompts)]
    for failure in failures:
        print(f"  FAIL {failure}")
    if failures:
        print(f"{len(failures)} benchmark capture failure(s)")
        return 1
    print(f"benchmark captures valid ({len(stored)} file(s), {len(prompts)} prompts)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
