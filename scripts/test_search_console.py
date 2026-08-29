"""Dependency-free tests for the Search Console decision-loop core."""

from __future__ import annotations

import sys
import unittest
from datetime import date, datetime
from pathlib import Path

SEARCH_CONSOLE_DIR = (
    Path(__file__).resolve().parents[1] / ".agents" / "tools" / "search-console"
)
sys.path.insert(0, str(SEARCH_CONSOLE_DIR))

import core  # noqa: E402


class ComparisonWindowTests(unittest.TestCase):
    def test_builds_adjacent_inclusive_28_day_windows(self) -> None:
        self.assertEqual(
            core.comparison_windows(date(2026, 8, 28)),
            {
                "current": {
                    "start_date": "2026-08-01",
                    "end_date": "2026-08-28",
                },
                "previous": {
                    "start_date": "2026-07-04",
                    "end_date": "2026-07-31",
                },
            },
        )

    def test_rejects_a_datetime_instead_of_silently_emitting_a_timestamp(self) -> None:
        with self.assertRaisesRegex(TypeError, "datetime.date"):
            core.comparison_windows(datetime(2026, 8, 28, 12, 0))


class SearchRequestTests(unittest.TestCase):
    def test_builds_a_bounded_google_request(self) -> None:
        self.assertEqual(
            core.build_search_request(
                date(2026, 8, 1),
                date(2026, 8, 28),
                ["page", "query"],
                row_limit=250,
            ),
            {
                "startDate": "2026-08-01",
                "endDate": "2026-08-28",
                "dimensions": ["page", "query"],
                "rowLimit": 250,
            },
        )

    def test_rejects_more_than_90_inclusive_days(self) -> None:
        with self.assertRaisesRegex(ValueError, "90 days"):
            core.build_search_request(
                date(2026, 1, 1), date(2026, 4, 1), ["page"]
            )

    def test_rejects_row_limits_over_1000(self) -> None:
        with self.assertRaisesRegex(ValueError, "1,000"):
            core.build_search_request(
                date(2026, 8, 1),
                date(2026, 8, 28),
                ["page"],
                row_limit=1001,
            )

    def test_rejects_unknown_dimensions(self) -> None:
        with self.assertRaisesRegex(ValueError, "dimension"):
            core.build_search_request(
                date(2026, 8, 1), date(2026, 8, 28), ["searchAppearance"]
            )


class SiteUrlTests(unittest.TestCase):
    def test_accepts_only_https_urls_on_the_site(self) -> None:
        self.assertEqual(
            core.validate_site_url("https://duguid.com.au"),
            "https://duguid.com.au",
        )
        self.assertEqual(
            core.validate_site_url("https://duguid.com.au/tools/coal-lsl-levy/"),
            "https://duguid.com.au/tools/coal-lsl-levy/",
        )
        self.assertEqual(
            core.validate_site_url("https://www.duguid.com.au/about/"),
            "https://www.duguid.com.au/about/",
        )

        for invalid in (
            "http://duguid.com.au/",
            "https://example.com/duguid.com.au/",
            "https://duguid.com.au.example.com/",
        ):
            with self.subTest(url=invalid), self.assertRaisesRegex(
                ValueError, "HTTPS URL"
            ):
                core.validate_site_url(invalid)


class CompareRowsTests(unittest.TestCase):
    def test_compares_current_and_previous_rows_in_material_change_order(self) -> None:
        current = [
            {
                "keys": ["https://duguid.com.au/a/", "coal levy"],
                "clicks": 4,
                "impressions": 100,
            },
            {
                "keys": ["https://duguid.com.au/b/", "tax"],
                "clicks": 1,
                "impressions": 20,
            },
            {
                "keys": ["https://duguid.com.au/d/", "equal first"],
                "clicks": 0,
                "impressions": 30,
            },
            {
                "keys": ["https://duguid.com.au/e/", "equal second"],
                "clicks": 0,
                "impressions": 30,
            },
        ]
        previous = [
            {
                "keys": ["https://duguid.com.au/a/", "coal levy"],
                "clicks": 2,
                "impressions": 40,
            },
            {
                "keys": ["https://duguid.com.au/c/", "other"],
                "clicks": 5,
                "impressions": 80,
            },
        ]

        rows = core.compare_search_rows(current, previous, ["page", "query"])

        self.assertEqual(
            [row["query"] for row in rows],
            ["other", "coal levy", "equal first", "equal second", "tax"],
        )
        self.assertEqual(
            rows[0],
            {
                "page": "https://duguid.com.au/c/",
                "query": "other",
                "current": {"clicks": 0, "impressions": 0},
                "previous": {"clicks": 5, "impressions": 80},
                "delta": {"clicks": -5, "impressions": -80},
            },
        )
        self.assertEqual(
            rows[1]["delta"], {"clicks": 2, "impressions": 60}
        )

    def test_empty_and_missing_rows_normalise_to_zero(self) -> None:
        rows = core.compare_search_rows(
            [{"keys": ["https://duguid.com.au/new/", "new query"]}],
            [],
            ["page", "query"],
        )

        self.assertEqual(
            rows,
            [
                {
                    "page": "https://duguid.com.au/new/",
                    "query": "new query",
                    "current": {"clicks": 0, "impressions": 0},
                    "previous": {"clicks": 0, "impressions": 0},
                    "delta": {"clicks": 0, "impressions": 0},
                }
            ],
        )


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner().run(suite)
    if result.wasSuccessful():
        print("search console core tests passed")
    raise SystemExit(not result.wasSuccessful())
