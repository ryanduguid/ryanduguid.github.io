"""Deterministic transport tests for the external-link checker."""

from __future__ import annotations

import unittest
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
