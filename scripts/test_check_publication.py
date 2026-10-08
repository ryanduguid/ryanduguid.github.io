"""Exercise publication refusals using fabricated GitHub results."""

import copy
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

import check_publication as policy

REPO = "example/site"
COMMIT = "a" * 40
ROOT = Path(__file__).resolve().parents[1]


def page(key, records):
    return [{key: records, "total_count": len(records)}]


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.check = {
            "id": 1,
            "name": "CodeQL",
            "app": {"id": 57789},
            "head_sha": COMMIT,
            "status": "completed",
            "conclusion": "success",
        }
        self.run = {
            "id": 2,
            "path": policy.AUDIT_WORKFLOW,
            "event": "push",
            "head_sha": COMMIT,
            "head_branch": "main",
            "status": "completed",
            "repository": {"full_name": REPO},
            "head_repository": {"full_name": REPO},
        }
        self.job = {
            "id": 3,
            "name": policy.AUDIT_JOB,
            "head_sha": COMMIT,
            "status": "completed",
            "conclusion": "success",
        }
        self.main = COMMIT
        self.checks = [self.check]
        self.runs = [self.run]
        self.jobs = [self.job]

    def fetch(self, endpoint, paginate):
        if endpoint.endswith("heads/main"):
            self.assertFalse(paginate)
            return {"object": {"sha": self.main}}
        self.assertTrue(paginate)
        if "check-runs" in endpoint:
            return page("check_runs", self.checks)
        if "/jobs?" in endpoint:
            return page("jobs", self.jobs)
        return page("workflow_runs", self.runs)

    def evaluate(self):
        return policy.evaluate(REPO, COMMIT, self.fetch)

    def test_exact_successful_producers_pass(self):
        self.assertTrue(self.evaluate())

    def test_missing_or_analyze_only_codeql_never_authorises_publication(self):
        for checks in (
            [],
            [self.check | {"name": "Analyze (python)"}],
            [self.check | {"app": {"id": 15368}}],
            [self.check | {"head_sha": "b" * 40}],
        ):
            self.checks = checks
            self.assertFalse(self.evaluate())

    def test_unsuccessful_or_unfinished_results_fail_or_wait(self):
        for conclusion in ("failure", "cancelled", "skipped", "neutral"):
            for record in (self.check, self.job):
                original = copy.deepcopy(record)
                record["conclusion"] = conclusion
                with self.assertRaises(ValueError):
                    self.evaluate()
                record.update(original)
        self.check["status"] = "in_progress"
        self.assertFalse(self.evaluate())

    def test_old_success_cannot_hide_another_failed_audit(self):
        self.runs.append(self.run | {"id": 4})

        def fetch(endpoint, paginate):
            if "/runs/4/jobs" in endpoint:
                return page("jobs", [self.job | {"id": 5, "conclusion": "failure"}])
            return self.fetch(endpoint, paginate)

        with self.assertRaisesRegex(ValueError, "did not succeed"):
            policy.evaluate(REPO, COMMIT, fetch)

    def test_untrusted_runs_do_not_supply_a_missing_main_audit(self):
        for change in (
            {"event": "pull_request_target"},
            {"head_sha": "b" * 40},
            {"head_branch": "feature"},
            {"path": ".github/workflows/other.yml"},
            {"head_repository": {"full_name": "someone/fork"}},
        ):
            self.runs = [self.run | change]
            self.assertFalse(self.evaluate())

    def test_ambiguous_and_missing_completed_jobs_fail(self):
        self.jobs.append(self.job | {"id": 4})
        with self.assertRaisesRegex(ValueError, "Ambiguous"):
            self.evaluate()
        self.jobs = []
        with self.assertRaisesRegex(ValueError, "without"):
            self.evaluate()
        self.run["status"] = "in_progress"
        self.assertFalse(self.evaluate())

    def test_stale_main_fails(self):
        self.main = "b" * 40
        with self.assertRaisesRegex(ValueError, "no longer main"):
            self.evaluate()

    def test_main_moving_during_verification_refuses_success(self):
        reads = []

        def fetch(endpoint, paginate):
            reads.append(endpoint)
            result = self.fetch(endpoint, paginate)
            if "/jobs?" in endpoint:
                self.main = "b" * 40
            return result

        with self.assertRaisesRegex(ValueError, "no longer main"):
            policy.evaluate(REPO, COMMIT, fetch)
        self.assertEqual(f"repos/{REPO}/git/ref/heads/main", reads[-1])

    def test_final_main_read_must_be_readable(self):
        for response in (None, {}, {"object": None}, {"object": {"sha": None}}):
            with self.subTest(response=response):
                main_reads = 0

                def fetch(endpoint, paginate):
                    nonlocal main_reads
                    if endpoint.endswith("heads/main"):
                        main_reads += 1
                        if main_reads == 2:
                            return response
                    return self.fetch(endpoint, paginate)

                with self.assertRaises(ValueError):
                    policy.evaluate(REPO, COMMIT, fetch)
                self.assertEqual(2, main_reads)

    def test_incomplete_results_do_not_take_a_final_main_read(self):
        self.checks = []
        fetch = mock.Mock(side_effect=self.fetch)
        self.assertFalse(policy.evaluate(REPO, COMMIT, fetch))
        main_reads = [call for call in fetch.call_args_list if call.args[0].endswith("heads/main")]
        self.assertEqual(1, len(main_reads))

    def test_nullable_unrelated_workflow_does_not_block_the_audit(self):
        self.runs.append(self.run | {"id": 4, "path": "other.yml", "head_branch": None})
        self.assertTrue(self.evaluate())

    def test_moving_complete_pages_must_stabilise_before_use(self):
        def listing(ids):
            return [{"jobs": [{"id": value}], "total_count": len(ids)} for value in ids]

        fetch = mock.Mock(side_effect=[listing([1, 2]), listing([2, 3]), listing([2, 3])])
        self.assertEqual(
            [item["id"] for item in policy.stable_items(fetch, "endpoint", "jobs")], [2, 3]
        )
        fetch = mock.Mock(side_effect=[listing([n, n + 1]) for n in range(4)])
        with self.assertRaisesRegex(ValueError, "did not stabilise"):
            policy.stable_items(fetch, "endpoint", "jobs")

    def test_stable_identity_returns_new_failed_result(self):
        fetch = mock.Mock(
            side_effect=[
                page("jobs", [self.job]),
                page("jobs", [self.job | {"conclusion": "failure"}]),
            ]
        )
        self.assertEqual(policy.stable_items(fetch, "endpoint", "jobs")[0]["conclusion"], "failure")

    def test_bounded_wait_allows_delayed_results_and_refuses_expiry(self):
        args = ["publication", "--repository", REPO, "--commit", COMMIT, "--wait-seconds", "600"]
        with (
            mock.patch.object(sys, "argv", args),
            mock.patch.object(policy, "evaluate", side_effect=[False, True]),
            mock.patch.object(policy.time, "monotonic", side_effect=[0, 1, 2]),
            mock.patch.object(policy.time, "sleep") as sleep,
            redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(policy.main(), 0)
            sleep.assert_called_once_with(15)
        with (
            mock.patch.object(sys, "argv", args),
            mock.patch.object(policy, "evaluate", return_value=False),
            mock.patch.object(policy.time, "monotonic", side_effect=[0, 600]),
            redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(policy.main(), 1)

    def test_api_failures_and_json_errors_do_not_reveal_response_text(self):
        args = ["publication", "--repository", REPO, "--commit", COMMIT]
        for error in (
            subprocess.CalledProcessError(1, "gh", stderr="PRIVATE_RESPONSE"),
            json.JSONDecodeError("PRIVATE_RESPONSE", "PRIVATE_RESPONSE", 0),
        ):
            output = io.StringIO()
            with (
                mock.patch.object(sys, "argv", args),
                mock.patch.object(policy, "evaluate", side_effect=error),
                redirect_stderr(output),
            ):
                self.assertEqual(policy.main(), 1)
            self.assertNotIn("PRIVATE_RESPONSE", output.getvalue())

    def test_one_success_cannot_hide_failed_codeql_or_unreadable_identity(self):
        self.checks.append(self.check | {"id": 4, "conclusion": "failure"})
        with self.assertRaises(ValueError):
            self.evaluate()
        self.checks = [self.check, self.check | {"id": 4, "name": None}]
        with self.assertRaises(ValueError):
            self.evaluate()

    def test_malformed_records_and_incomplete_pagination_fail(self):
        for bad in (
            [],
            [None],
            [{"jobs": [], "total_count": None}],
            [{"jobs": [None], "total_count": 1}],
            [{"jobs": [{"id": 1}], "total_count": 2}],
            [{"jobs": [{"id": 1}, {"id": 1}], "total_count": 2}],
            [{"jobs": [], "total_count": 1}, {"jobs": [], "total_count": 2}],
        ):
            with self.assertRaises(ValueError):
                policy.items(bad, "jobs")
        self.check["app"] = None
        with self.assertRaises(ValueError):
            self.evaluate()

    def test_only_deploy_is_exempt_from_the_actual_aggregate(self):
        workflow = (ROOT / ".github/workflows/checks.yml").read_text()
        self.assertIn("checks-gates --exempt deploy\n", workflow)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workflows = root / ".github/workflows"
            workflows.mkdir(parents=True)
            path = workflows / "checks.yml"
            path.write_text(workflow)
            env = {
                key: os.environ[key]
                for key in ("PATH", "SYSTEMROOT", "TEMP", "TMP")
                if key in os.environ
            }
            env["RESULTS"] = json.dumps(
                {
                    name: {"result": "success"}
                    for name in ("lint", "checks", "browser", "lighthouse")
                }
            )
            command = [
                sys.executable,
                str(ROOT / ".github/ci/check_gates.py"),
                ".github/workflows/checks.yml",
                "checks-gates",
                "--exempt",
                "deploy",
            ]
            self.assertEqual(
                subprocess.run(command, cwd=root, env=env, capture_output=True).returncode, 0
            )
            path.write_text(workflow + "\n  forgotten-check:\n    runs-on: ubuntu-latest\n")
            self.assertNotEqual(
                subprocess.run(command, cwd=root, env=env, capture_output=True).returncode, 0
            )


if __name__ == "__main__":
    unittest.main()
