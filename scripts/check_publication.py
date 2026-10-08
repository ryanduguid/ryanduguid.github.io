"""Require current main and successful external producers before Pages publication."""

import argparse
import json
import re
import subprocess
import sys
import time
from collections.abc import Callable

SHA = re.compile(r"[0-9a-f]{40}\Z")
REPOSITORY = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
AUDIT_WORKFLOW = ".github/workflows/no-ai-attribution.yml"
AUDIT_JOB = "Attribution policy / Attribution policy runner"


def items(payload: object, key: str) -> list[dict[str, object]]:
    if not isinstance(payload, list) or not payload:
        raise ValueError("Unreadable API pagination")
    found: list[dict[str, object]] = []
    total = None
    for page in payload:
        if not isinstance(page, dict) or not isinstance(page.get(key), list):
            raise ValueError("Unreadable API page")
        if total is None:
            total = page.get("total_count")
        if type(total) is not int or page.get("total_count") != total:
            raise ValueError("API listing changed or has no count")
        for value in page[key]:
            if not isinstance(value, dict) or type(value.get("id")) is not int:
                raise ValueError("Unreadable API identity")
            found.append(value)
    if len(found) != total or len({value["id"] for value in found}) != len(found):
        raise ValueError("Incomplete API listing")
    return found


def stable_items(
    fetch: Callable[[str, bool], object], endpoint: str, key: str
) -> list[dict[str, object]]:
    """Require two consecutive complete listings with the same ordered identities."""
    previous = items(fetch(endpoint, True), key)
    for _ in range(3):
        current = items(fetch(endpoint, True), key)
        if [value["id"] for value in previous] == [value["id"] for value in current]:
            return current
        previous = current
    raise ValueError("API listing did not stabilise")


def require_main(repository: str, commit: str, fetch: Callable[[str, bool], object]) -> None:
    main = fetch(f"repos/{repository}/git/ref/heads/main", False)
    if not isinstance(main, dict) or not isinstance(main.get("object"), dict):
        raise ValueError("Unreadable main revision")
    if main["object"].get("sha") != commit:
        raise ValueError("Publication candidate is no longer main")


def evaluate(repository: str, commit: str, fetch: Callable[[str, bool], object]) -> bool:
    require_main(repository, commit, fetch)
    checks = stable_items(
        fetch, f"repos/{repository}/commits/{commit}/check-runs?filter=all", "check_runs"
    )
    codeql = []
    for value in checks:
        if any(not isinstance(value.get(field), str) for field in ("name", "head_sha", "status")):
            raise ValueError("Unreadable check identity")
        app = value.get("app")
        if not isinstance(app, dict) or type(app.get("id")) is not int:
            raise ValueError("Unreadable check producer")
        if value.get("name") == "CodeQL" and app["id"] == 57789 and value.get("head_sha") == commit:
            codeql.append(value)
    # An Analyze job is not the CodeQL results policy. No mapped result means no publication.
    if any(
        value.get("status") == "completed" and value.get("conclusion") != "success"
        for value in codeql
    ):
        raise ValueError("CodeQL results did not succeed")
    runs = stable_items(
        fetch, f"repos/{repository}/actions/runs?head_sha={commit}", "workflow_runs"
    )
    audits = []
    for run in runs:
        if not isinstance(run.get("path"), str):
            raise ValueError("Unreadable workflow path")
        if run.get("path") != AUDIT_WORKFLOW:
            continue
        if any(
            not isinstance(run.get(field), str)
            for field in ("path", "head_sha", "event", "head_branch", "status")
        ):
            raise ValueError("Unreadable workflow identity")
        owners: dict[str, str] = {}
        for field in ("repository", "head_repository"):
            owner = run.get(field)
            if not isinstance(owner, dict) or not isinstance(owner.get("full_name"), str):
                raise ValueError("Unreadable audit repository")
            owners[field] = owner["full_name"].casefold()
        if (
            run.get("event") not in {"push", "workflow_dispatch"}
            or run.get("head_branch") != "main"
            or run.get("head_sha") != commit
            or owners["repository"] != repository.casefold()
            or owners["head_repository"] != repository.casefold()
        ):
            continue
        jobs = stable_items(
            fetch, f"repos/{repository}/actions/runs/{run['id']}/jobs?filter=latest", "jobs"
        )
        for job in jobs:
            if any(not isinstance(job.get(field), str) for field in ("name", "head_sha", "status")):
                raise ValueError("Unreadable audit job identity")
        selected = [
            job for job in jobs if job.get("name") == AUDIT_JOB and job.get("head_sha") == commit
        ]
        if len(selected) > 1:
            raise ValueError("Ambiguous audit job")
        if not selected and run.get("status") == "completed":
            raise ValueError("Audit completed without the required job")
        if (
            selected
            and selected[0].get("status") == "completed"
            and selected[0].get("conclusion") != "success"
        ):
            raise ValueError("Attribution audit did not succeed")
        audits.append(
            bool(
                selected
                and selected[0].get("status") == "completed"
                and selected[0].get("conclusion") == "success"
            )
        )
    ready = bool(
        codeql
        and all(
            value.get("status") == "completed" and value.get("conclusion") == "success"
            for value in codeql
        )
        and audits
        and all(audits)
    )
    if ready:
        require_main(repository, commit, fetch)
    return ready


def gh_json(endpoint: str, paginate: bool) -> object:
    args = ["gh", "api", endpoint]
    if paginate:
        args.extend(("--paginate", "--slurp"))
    result = subprocess.run(args, capture_output=True, check=True, timeout=60)
    return json.loads(result.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--wait-seconds", type=int, default=0)
    args = parser.parse_args()
    if (
        REPOSITORY.fullmatch(args.repository) is None
        or SHA.fullmatch(args.commit) is None
        or not 0 <= args.wait_seconds <= 600
    ):
        parser.error("Invalid publication identity or wait")
    deadline = time.monotonic() + args.wait_seconds
    try:
        while not evaluate(args.repository, args.commit, gh_json):
            if time.monotonic() >= deadline:
                raise ValueError("Required external results are missing or unfinished")
            time.sleep(min(15, max(0, deadline - time.monotonic())))
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # API stderr and response data can contain private material.
        message = (
            str(error)
            if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError)
            else "External verification could not complete"
        )
        print(message, file=sys.stderr)
        return 1
    print("Current main and external publication results verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
