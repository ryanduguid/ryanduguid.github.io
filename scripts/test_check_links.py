"""Deterministic transport tests for the external-link checker."""

from __future__ import annotations

import unittest
import unittest.mock
import urllib.error

import check_links


class FakeResponse:
    status = 200

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def geturl(self) -> str:
        return "https://example.com/final"


class FetchFinalUrlTests(unittest.TestCase):
    def test_accepts_only_runner_confirmed_ato_403_denials(self) -> None:
        confirmed = (
            "https://www.ato.gov.au/tax-rates-and-codes/"
            "key-superannuation-rates-and-thresholds/super-guarantee",
            "https://www.ato.gov.au/businesses-and-organisations/"
            "income-deductions-and-concessions/small-business-benchmarks",
            "https://www.ato.gov.au/tax-rates-and-codes/company-tax-rates",
            "https://www.ato.gov.au/law/view/view.htm?"
            "docid=COG%2FPCG20222%2FNAT%2FATO%2F00001",
        )

        for url in confirmed:
            with self.subTest(url=url):
                self.assertTrue(check_links.is_accepted_automation_denial(url, 403))

        self.assertFalse(
            check_links.is_accepted_automation_denial(
                "https://www.ato.gov.au/tax-rates-and-codes/company-tax-rates/other",
                403,
            )
        )
        self.assertFalse(
            check_links.is_accepted_automation_denial(confirmed[0], 404)
        )

    def test_accepts_only_hibernated_linkedin_profile_failures(self) -> None:
        profile = "https://www.linkedin.com/in/ryan-duguid"

        for status in (404, 999):
            with self.subTest(status=status):
                self.assertTrue(
                    check_links.is_accepted_automation_denial(profile, status)
                )

        self.assertFalse(check_links.is_accepted_automation_denial(profile, 403))
        self.assertFalse(
            check_links.is_accepted_automation_denial(
                "https://www.linkedin.com/company/example", 404
            )
        )

    def test_reuses_a_successful_result_for_a_duplicate_url(self) -> None:
        attempts = 0

        def opener(request: object, timeout: int) -> FakeResponse:
            nonlocal attempts
            attempts += 1
            return FakeResponse()

        first = check_links.fetch_final_url(
            "https://example.com/duplicate", opener=opener
        )
        second = check_links.fetch_final_url(
            "https://example.com/duplicate", opener=opener
        )

        self.assertEqual(first, second)
        self.assertEqual(attempts, 1)

    def test_retries_transient_transport_failures(self) -> None:
        attempts = 0

        def flaky_opener(request: object, timeout: int) -> FakeResponse:
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise urllib.error.URLError("temporary TLS failure")
            return FakeResponse()

        result = check_links.fetch_final_url(
            "https://example.com/start", opener=flaky_opener
        )

        self.assertEqual(result, (200, "https://example.com/final"))
        self.assertEqual(attempts, 3)

    def test_retries_transient_server_errors(self) -> None:
        attempts = 0

        def flaky_opener(request: object, timeout: int) -> FakeResponse:
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise urllib.error.HTTPError(
                    "https://example.com/unavailable",
                    500,
                    "Internal Server Error",
                    {},
                    None,
                )
            return FakeResponse()

        result = check_links.fetch_final_url(
            "https://example.com/server-error", opener=flaky_opener
        )

        self.assertEqual(result, (200, "https://example.com/final"))
        self.assertEqual(attempts, 3)

    def test_does_not_retry_client_errors(self) -> None:
        attempts = 0

        def not_found(request: object, timeout: int) -> FakeResponse:
            nonlocal attempts
            attempts += 1
            raise urllib.error.HTTPError(
                "https://example.com/missing", 404, "Not Found", {}, None
            )

        with self.assertRaises(urllib.error.HTTPError):
            check_links.fetch_final_url(
                "https://example.com/missing", opener=not_found
            )

        self.assertEqual(attempts, 1)

    def test_archived_repository_links_fail(self) -> None:
        archived = {"payday-super-checker": True, "australian-accounting": False}

        failures = check_links.archived_target_failures(
            "tools/payday-super/index.html",
            [
                "https://github.com/ryanduguid/payday-super-checker/releases/tag/v0.1.2",
                "https://github.com/ryanduguid/australian-accounting/tree/main/packages/payday-super-checker",
                "https://github.com/XeroAPI/xero-python",
                "/tools/",
            ],
            lookup=archived.__getitem__,
        )

        self.assertEqual(len(failures), 1)
        self.assertIn("ryanduguid/payday-super-checker is archived", failures[0])

    def test_archived_lookup_failure_is_a_failure(self) -> None:
        def lookup(name: str) -> bool:
            raise urllib.error.HTTPError(
                "https://api.github.com/repos/ryanduguid/" + name,
                403,
                "rate limited",
                {},
                None,
            )

        failures = check_links.archived_target_failures(
            "index.html",
            ["https://github.com/ryanduguid/Ozzit"],
            lookup=lookup,
        )

        self.assertEqual(len(failures), 1)
        self.assertIn("archived lookup failed", failures[0])

    def test_provenance_allowlist_is_scoped_to_page_and_repository(self) -> None:
        hrefs = [
            "https://github.com/ryanduguid/hardhat-ledger/releases/tag/v0.1.5",
            "https://github.com/ryanduguid/workpaper-review-gate/releases/tag/v0.1.1",
        ]
        with unittest.mock.patch.object(
            check_links,
            "ARCHIVED_TARGET_ALLOWLIST",
            {"changelog/index.html": frozenset({"hardhat-ledger"})},
        ):
            allowed_page = check_links.archived_target_failures(
                "changelog/index.html", hrefs, lookup=lambda name: True
            )
            other_page = check_links.archived_target_failures(
                "index.html", hrefs, lookup=lambda name: True
            )

        self.assertEqual(len(allowed_page), 1)
        self.assertIn("workpaper-review-gate is archived", allowed_page[0])
        self.assertEqual(len(other_page), 2)

    def test_repository_verdicts_are_cached_including_failures(self) -> None:
        attempts: list[str] = []

        def fetch(name: str) -> bool:
            attempts.append(name)
            if name == "broken":
                raise urllib.error.URLError("rate limited")
            return name == "hardhat-ledger"

        with (
            unittest.mock.patch.object(check_links, "fetch_repository_archived", fetch),
            unittest.mock.patch.object(check_links, "_ARCHIVED_VERDICTS", {}),
        ):
            self.assertTrue(check_links.repository_is_archived("hardhat-ledger"))
            self.assertTrue(check_links.repository_is_archived("hardhat-ledger"))
            self.assertFalse(check_links.repository_is_archived("Ozzit"))
            with self.assertRaises(urllib.error.URLError):
                check_links.repository_is_archived("broken")
            with self.assertRaises(urllib.error.URLError):
                check_links.repository_is_archived("broken")

        self.assertEqual(attempts, ["hardhat-ledger", "Ozzit", "broken"])

    def test_fetch_repository_archived_reads_the_api_flag_after_a_retry(self) -> None:
        class ApiResponse(FakeResponse):
            def read(self) -> bytes:
                return b'{"full_name": "ryanduguid/hardhat-ledger", "archived": true}'

        attempts = 0

        def opener(request: object, timeout: int) -> ApiResponse:
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise urllib.error.HTTPError(
                    "https://api.github.com/repos/ryanduguid/hardhat-ledger",
                    502,
                    "Bad Gateway",
                    {},
                    None,
                )
            return ApiResponse()

        result = check_links.fetch_repository_archived("hardhat-ledger", opener=opener)

        self.assertTrue(result)
        self.assertEqual(attempts, 2)

    def test_stops_after_five_transient_failures(self) -> None:
        attempts = 0

        def unavailable(request: object, timeout: int) -> FakeResponse:
            nonlocal attempts
            attempts += 1
            raise urllib.error.URLError("still unavailable")

        with self.assertRaises(urllib.error.URLError):
            check_links.fetch_final_url(
                "https://example.com/unavailable", opener=unavailable
            )

        self.assertEqual(attempts, 5)


if __name__ == "__main__":
    unittest.main()
