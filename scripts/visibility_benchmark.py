"""Validate and summarise assistant-visibility captures.

The benchmark answers two separate questions and never mixes them:

- visibility: did an assistant mention the site, and did it cite a page,
- accuracy: were the facts in its answer right.

It runs no query itself. A person records each answer in a capture file, which
this script validates and summarises. Unrun and blocked observations are
excluded from every denominator rather than counted as a failure, fixtures are
excluded from real summaries, and branded prompts are summarised apart from
non-branded ones.

Every mode validates the exact files it was given, so a summary never reports
metrics from a capture that failed validation:

    python scripts/visibility_benchmark.py --template > docs/visibility-benchmark/captures/round-example.json
    python scripts/visibility_benchmark.py --check docs/visibility-benchmark/captures/round-example.json
    python scripts/visibility_benchmark.py --summary docs/visibility-benchmark/captures/round-example.json

`--check` and `--summary` with no paths read every capture in
`docs/visibility-benchmark/captures/`. A named file that does not exist is a
failure, never a silent omission.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import SplitResult, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BENCHMARK = ROOT / "docs/visibility-benchmark"
PROMPTS = BENCHMARK / "prompts.json"
CAPTURES = BENCHMARK / "captures"
# The site's own host and its subdomains count as a site citation. A host that
# merely contains the name, such as duguid.com.au.example.org, does not.
SITE_HOST = "duguid.com.au"
URL_SCHEMES = frozenset({"http", "https"})
SCHEMA_VERSIONS = frozenset({1})
RUN_STATES = frozenset({"complete", "not_run", "blocked"})
SEARCH_STATES = frozenset({"on", "off", "unknown"})
# A completed observation records what the run actually showed. Each of these is
# evidence a reader needs, so a blank or missing value is a validation failure.
REQUIRED_TEXT = ("system", "model_reported", "timezone", "answer_evidence")
REQUIRED_BOOLEANS = ("fresh_session", "mentioned", "site_cited")


def load_prompts(path: Path = PROMPTS) -> dict[str, dict[str, Any]]:
    """The reviewed prompt set, keyed by its stable identifier."""
    data = json.loads(path.read_text(encoding="utf-8"))
    return {prompt["id"]: prompt for prompt in data["prompts"]}


def load_capture(path: Path) -> dict[str, Any]:
    """Read one capture, or raise ValueError describing what is unusable."""
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as error:
        raise ValueError(f"is not UTF-8 text: {error}") from error
    try:
        capture = json.loads(text)
    except json.JSONDecodeError as error:
        raise ValueError(f"is not valid JSON: {error}") from error
    if not isinstance(capture, dict):
        raise ValueError(f"is a {type(capture).__name__}, expected an object")
    result: dict[str, Any] = capture
    return result


def is_text(value: object) -> bool:
    """True for a string carrying something other than whitespace."""
    return isinstance(value, str) and bool(value.strip())


def is_boolean(value: object) -> bool:
    """True only for a real boolean. A string such as "false" is not one."""
    return isinstance(value, bool)


def parsed_url(url: object) -> SplitResult | None:
    """One usable http or https URL, or None when the string cannot be one.

    A hand-entered citation can be malformed: an unmatched bracket in the
    network location makes urlsplit raise, and an invalid port parses a hostname
    while remaining unusable. Neither is a URL a reader could follow.
    """
    if not is_text(url) or not isinstance(url, str):
        return None
    try:
        split = urlsplit(url)
        # Reading the port validates it, which parsing the host alone does not.
        _ = split.port
    except ValueError:
        return None
    if split.scheme.lower() not in URL_SCHEMES or not split.hostname:
        return None
    return split


def site_cited_url(url: object) -> bool:
    """True only when a usable URL's host is the site or one of its subdomains."""
    split = parsed_url(url)
    if split is None or split.hostname is None:
        return False
    host = split.hostname.lower()
    return host == SITE_HOST or host.endswith("." + SITE_HOST)


def known_error_ids(prompt: dict[str, Any]) -> set[str]:
    return {error["id"] for error in prompt.get("common_errors", [])}


def check_citations(where: str, observation: dict[str, Any]) -> list[str]:
    """Check every cited URL, and that the site-citation flag agrees with them."""
    failures: list[str] = []
    cited = observation.get("cited_urls")
    if not isinstance(cited, list):
        return [f"{where}: cited_urls must be a list, empty when none were shown"]

    # Every member is checked, not just enough of them to satisfy a lookup.
    on_site = False
    for position, url in enumerate(cited, start=1):
        if parsed_url(url) is None:
            failures.append(
                f"{where}: cited_urls[{position}] is not a usable http or https URL: {url!r}"
            )
            continue
        on_site = on_site or site_cited_url(url)

    site_cited = observation.get("site_cited")
    if site_cited is True and not on_site:
        failures.append(f"{where}: site_cited is true but no cited URL is on {SITE_HOST}")
    if site_cited is False and on_site:
        failures.append(f"{where}: a cited URL is on {SITE_HOST} but site_cited is false")
    if site_cited is True and observation.get("mentioned") is not True:
        failures.append(f"{where}: an answer that cites the site also mentions it")
    return failures


def check_observation(
    label: str,
    index: int,
    observation: object,
    prompts: dict[str, dict[str, Any]],
) -> list[str]:
    """Check one recorded answer against the reviewed prompt set."""
    where = f"{label} observation {index}"
    if not isinstance(observation, dict):
        return [f"{where}: must be an object, found {type(observation).__name__}"]

    failures: list[str] = []
    prompt_id = observation.get("prompt_id")
    # The identifier's type is settled before it reaches a lookup.
    if not isinstance(prompt_id, str):
        return [f"{where}: prompt_id must be a string, found {type(prompt_id).__name__}"]
    prompt = prompts.get(prompt_id)
    if prompt is None:
        return [f"{where}: unknown prompt_id {prompt_id!r}"]

    status = observation.get("status")
    if not isinstance(status, str) or status not in RUN_STATES:
        return [f"{where}: status must be one of {sorted(RUN_STATES)}, found {status!r}"]
    if status != "complete":
        # A test that did not run carries no result. It needs a reason, not data.
        if not is_text(observation.get("reason")):
            failures.append(f"{where}: a {status} observation needs a reason")
        return failures

    for field in REQUIRED_TEXT:
        if not is_text(observation.get(field)):
            failures.append(f"{where}: complete observation needs a non-empty {field}")
    for field in REQUIRED_BOOLEANS:
        value = observation.get(field)
        # A string such as "false" is truthy, so a loose check would count a
        # hand-edited capture as a mention or a citation.
        if not is_boolean(value):
            failures.append(f"{where}: {field} must be true or false, not {value!r}")

    if observation.get("prompt_sent") != prompt["prompt"]:
        failures.append(
            f"{where}: prompt_sent does not match the reviewed text for {prompt_id}"
        )
    search_enabled = observation.get("search_enabled")
    if not isinstance(search_enabled, str) or search_enabled not in SEARCH_STATES:
        failures.append(
            f"{where}: search_enabled must be one of {sorted(SEARCH_STATES)}, "
            f"found {search_enabled!r}"
        )

    executed_at = observation.get("executed_at")
    if not is_text(executed_at) or not isinstance(executed_at, str):
        failures.append(f"{where}: executed_at must be an ISO 8601 timestamp string")
    else:
        try:
            parsed = datetime.fromisoformat(executed_at)
        except ValueError:
            failures.append(f"{where}: executed_at must be an ISO 8601 timestamp")
        else:
            if parsed.utcoffset() is None:
                failures.append(f"{where}: executed_at must carry a UTC offset")

    failures.extend(check_citations(where, observation))

    errors = observation.get("factual_errors")
    # An assessed observation with no error is an empty list, which is different
    # from a missing assessment.
    if not isinstance(errors, list):
        failures.append(f"{where}: factual_errors must be a list, empty when none were found")
    else:
        declared = known_error_ids(prompt)
        for error_id in errors:
            if not isinstance(error_id, str):
                failures.append(
                    f"{where}: factual_errors members must be strings, "
                    f"found {type(error_id).__name__}"
                )
            elif error_id not in declared:
                failures.append(
                    f"{where}: factual error {error_id!r} is not declared for {prompt_id}"
                )
    return failures


def check_capture_data(
    label: str, capture: dict[str, Any], prompts: dict[str, dict[str, Any]]
) -> list[str]:
    """Check one loaded capture's shape and every observation in it."""
    failures: list[str] = []
    schema = capture.get("schema")
    # A boolean is an int in Python, so True must not pass as schema 1.
    if isinstance(schema, bool) or not isinstance(schema, int) or schema not in SCHEMA_VERSIONS:
        failures.append(f"{label}: schema must be one of {sorted(SCHEMA_VERSIONS)}")
    if not is_boolean(capture.get("fixture")):
        failures.append(f"{label}: must declare fixture true or false")
    if not is_text(capture.get("recorded_by")):
        failures.append(f"{label}: must name who recorded it")

    observations = capture.get("observations")
    if not isinstance(observations, list) or not observations:
        return [*failures, f"{label}: needs a non-empty observations list"]
    for index, observation in enumerate(observations, start=1):
        failures.extend(check_observation(label, index, observation, prompts))
    return failures


def check_capture(path: Path, prompts: dict[str, dict[str, Any]]) -> list[str]:
    """Load and check one capture file, reporting rather than raising."""
    try:
        capture = load_capture(path)
    except (ValueError, OSError) as error:
        # An unusable file is a validation result, not a traceback.
        return [f"{path.name}: {error}"]
    return check_capture_data(path.name, capture, prompts)


def selected(paths: list[str]) -> list[Path]:
    """The capture files a run covers: those named, or the stored collection."""
    if paths:
        return [Path(name) for name in paths]
    return sorted(CAPTURES.glob("*.json")) if CAPTURES.is_dir() else []


def validated(
    paths: list[Path], prompts: dict[str, dict[str, Any]]
) -> tuple[list[tuple[Path, dict[str, Any]]], list[str]]:
    """Load and validate every selected file before anything is counted."""
    captures: list[tuple[Path, dict[str, Any]]] = []
    failures: list[str] = []
    for path in paths:
        if not path.is_file():
            failures.append(f"{path}: no such capture file")
            continue
        try:
            capture = load_capture(path)
        except (ValueError, OSError) as error:
            failures.append(f"{path.name}: {error}")
            continue
        problems = check_capture_data(path.name, capture, prompts)
        if problems:
            failures.extend(problems)
        else:
            captures.append((path, capture))
    return captures, failures


def capture_system(capture: dict[str, Any]) -> str | None:
    """The one system a capture recorded, when its observations name exactly one.

    A round is one system per file, so an unrun observation belongs to the same
    system as the completed ones beside it. Where a file names several, or none,
    an unrun observation stays unattributed rather than being guessed at.
    """
    named = {
        observation["system"]
        for observation in capture.get("observations", [])
        if isinstance(observation, dict) and is_text(observation.get("system"))
    }
    return named.pop() if len(named) == 1 else None


def summarise(
    captures: list[tuple[Path, dict[str, Any]]],
    prompts: dict[str, dict[str, Any]],
    include_fixtures: bool,
) -> str:
    """Report visibility and accuracy separately, with explicit denominators.

    Every capture reaching here has already been validated, so the counts come
    from records whose fields were checked rather than merely parsed.
    """
    counts: dict[tuple[str, bool], dict[str, int]] = defaultdict(
        lambda: {"complete": 0, "mentioned": 0, "cited": 0, "clean": 0, "excluded": 0}
    )
    fixtures_skipped = 0
    for _, capture in captures:
        if capture.get("fixture") is True and not include_fixtures:
            fixtures_skipped += 1
            continue
        recorded = capture_system(capture)
        for observation in capture.get("observations", []):
            prompt = prompts.get(observation.get("prompt_id", ""))
            if prompt is None:
                continue
            # An unrun observation may omit its system. It belongs to the round
            # it sits in, so a partial round reports under one heading, and the
            # key stays a string so sorting never compares None with a name.
            system = observation.get("system") or recorded or "unknown"
            bucket = counts[(str(system), bool(prompt["branded"]))]
            if observation.get("status") != "complete":
                bucket["excluded"] += 1
                continue
            bucket["complete"] += 1
            bucket["mentioned"] += 1 if observation.get("mentioned") is True else 0
            bucket["cited"] += 1 if observation.get("site_cited") is True else 0
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
            "No declared factual error means no error from the recorded list was",
            "seen. It is not proof that an answer was correct.",
        ]
    )
    return "\n".join(lines)


def template(prompts: dict[str, dict[str, Any]]) -> str:
    """A blank capture file covering every reviewed prompt once.

    It is deliberately unfinished. A recorder must be named, and any observation
    marked complete must carry the evidence the validator requires, so the
    template does not validate until a person records a real round in it.
    """
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


def report(failures: list[str]) -> int:
    for failure in failures:
        print(f"  FAIL {failure}")
    print(f"{len(failures)} benchmark capture failure(s)")
    return 1


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--template", action="store_true", help="print a blank capture file")
    mode.add_argument(
        "--check",
        nargs="*",
        metavar="CAPTURE",
        help="validate the named captures, or every stored capture when none are named",
    )
    mode.add_argument(
        "--summary",
        nargs="*",
        metavar="CAPTURE",
        help="validate then summarise the named captures, or every stored capture",
    )
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

    paths = selected(args.summary if args.summary is not None else (args.check or []))
    captures, failures = validated(paths, prompts)
    if failures:
        # A summary of partly invalid input would misreport the round, so the
        # metrics are withheld and the diagnostics are what the run returns.
        return report(failures)

    if args.summary is not None:
        print(summarise(captures, prompts, args.include_fixtures))
        return 0
    print(f"benchmark captures valid ({len(captures)} file(s), {len(prompts)} prompts)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
