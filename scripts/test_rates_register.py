"""Tests for the rates register check, run by check_site.py."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import check_rates_register as register

ROOT = Path(__file__).resolve().parents[1]


class RegisterFixture(unittest.TestCase):
    """Shared fixture. Subclassing a TestCase that has tests re-runs them, so
    the helpers live here and both suites inherit only these."""

    def setUp(self) -> None:
        self.directory = Path(tempfile.mkdtemp())
        shutil.copytree(ROOT / "rates" / "register", self.directory / "register")
        self.original = register.REGISTER_DIR, register.MANIFEST, register.SUMS
        self._point_at(self.directory / "register")

    def tearDown(self) -> None:
        register.REGISTER_DIR, register.MANIFEST, register.SUMS = self.original
        shutil.rmtree(self.directory, ignore_errors=True)

    def _point_at(self, root: Path) -> None:
        register.REGISTER_DIR = root
        register.MANIFEST = root / "register.json"
        register.SUMS = root / "SHA256SUMS"

    def _series(self) -> Path:
        return register.REGISTER_DIR / "series" / "coal-lsl-levy.json"

    def _rewrite(self, path: Path, payload: dict) -> None:
        # newline="" or Windows writes CRLF, which is the very thing the digest
        # check now refuses: the fixture would fail every test rather than the
        # one that is about line endings.
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8", newline="")
        self._resum()

    def _resum(self) -> None:
        lines = []
        for path in sorted(register.REGISTER_DIR.rglob("*")):
            if path.is_file() and path.name != "SHA256SUMS":
                name = path.relative_to(register.REGISTER_DIR).as_posix()
                lines.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {name}")
        register.SUMS.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="")


class RegisterTests(RegisterFixture):
    def test_committed_register_passes(self) -> None:
        self._point_at(ROOT / "rates" / "register")
        self.assertEqual(register.check_register(), [])

    def test_a_changed_byte_breaks_the_digest(self) -> None:
        series = self._series()
        series.write_text(
            series.read_text(encoding="utf-8").replace('"2.7"', '"2.8"'),
            encoding="utf-8",
            newline="",
        )
        failures = register.check_register()
        self.assertTrue(any("digest does not match" in failure for failure in failures), failures)

    def test_a_site_page_cannot_be_the_primary_source(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["primary_source"]["url"] = "https://duguid.com.au/rates/coal-lsl-levy/"
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(
            any("not a primary source host" in failure for failure in failures), failures
        )

    def test_a_future_check_date_is_refused(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["verified_at"] = "2099-01-01"
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("is in the future" in failure for failure in failures), failures)

    def test_a_crlf_file_is_refused_where_its_digest_is_made(self) -> None:
        """A digest over CRLF bytes verifies only on the machine that wrote it.

        The repository normalises to LF and the published file is LF, so a
        Windows working copy that gained CRLF produced a SHA256SUMS that
        matched nothing anywhere else. CI found it; this finds it first.
        """
        readme = register.REGISTER_DIR / "README.md"
        readme.write_bytes(readme.read_bytes().replace(b"\n", b"\r\n"))
        self._resum()
        failures = register.check_register()
        self.assertTrue(any("CRLF" in failure for failure in failures), failures)

    def test_the_committed_register_has_no_crlf_file(self) -> None:
        self._point_at(ROOT / "rates" / "register")
        offenders = [
            path.name
            for path in register.REGISTER_DIR.rglob("*")
            if path.is_file() and b"\r\n" in path.read_bytes()
        ]
        self.assertEqual(offenders, [])

    def test_today_is_measured_where_the_checks_are_made(self) -> None:
        """A row checked this morning in Australia is not a future check.

        A runner in UTC is up to eleven hours behind, and comparing against
        its own date failed the register for those hours every time a row was
        added. The helper reads the date in Australia instead.
        """
        today = register._today()
        utc = dt.datetime.now(dt.timezone.utc).date()
        self.assertIn((today - utc).days, (0, 1))

    def test_a_check_date_before_the_period_start_is_refused(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["verified_at"] = "2020-01-01"
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("precedes period_start" in failure for failure in failures), failures)

    def test_overlapping_rows_are_refused(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        extra = json.loads(json.dumps(payload["rows"][0]))
        extra["row_id"] = "2024-07-01"
        extra["period_start"] = "2024-07-01"
        payload["rows"][0]["period_end"] = None
        payload["rows"].append(extra)
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("overlap" in failure for failure in failures), failures)

    def test_automated_retrieval_cannot_claim_professional_review(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["review"] = "professional-review"
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("not professional review" in failure for failure in failures), failures)

    def test_an_unverified_row_must_explain_itself(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        row = payload["rows"][0]
        row["status"] = "unverified"
        row["verified_at"] = None
        row["verified_by"] = None
        row.pop("verification_note", None)
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(
            any("needs a verification_note" in failure for failure in failures), failures
        )

    def test_a_superseded_row_must_be_named_by_its_replacement(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["status"] = "superseded"
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(
            any("no row names it in supersedes" in failure for failure in failures), failures
        )

    def test_an_unlisted_series_file_is_refused(self) -> None:
        shutil.copy(self._series(), register.REGISTER_DIR / "series" / "made-up.json")
        self._resum()
        failures = register.check_register()
        self.assertTrue(
            any("does not match the files" in failure for failure in failures), failures
        )

    def test_one_series_check_date_does_not_travel_to_another(self) -> None:
        """A second series keeps its own dates; refreshing one must not refresh the other."""
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        other = json.loads(json.dumps(payload))
        other["series_id"] = "example-series"
        other["rows"][0]["verified_at"] = "2026-01-05"
        path = register.REGISTER_DIR / "series" / "example-series.json"
        path.write_text(json.dumps(other, indent=2) + "\n", encoding="utf-8", newline="")
        manifest = json.loads(register.MANIFEST.read_text(encoding="utf-8"))
        manifest["series"] = sorted(manifest["series"] + ["series/example-series.json"])
        register.MANIFEST.write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline=""
        )
        self._resum()
        self.assertEqual(register.check_register(), [])
        first = json.loads(self._series().read_text(encoding="utf-8"))
        second = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(first["rows"][0]["verified_at"], "2026-09-18")
        self.assertEqual(second["rows"][0]["verified_at"], "2026-01-05")

    def test_todays_date_is_what_bounds_a_check_date(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        self._rewrite(self._series(), payload)
        self.assertEqual(register.check_register(today=dt.date(2026, 9, 18)), [])
        failures = register.check_register(today=dt.date(2026, 9, 17))
        self.assertTrue(any("is in the future" in failure for failure in failures), failures)


class ReviewFindingTests(RegisterFixture):
    """Regressions from the 18 September 2026 review.

    Each of these registers passed the checker before and should not have.
    """

    def test_a_backslash_makes_the_host_ambiguous_and_is_refused(self) -> None:
        # A browser reads the authority as evil.example; a split on "/" reads
        # the legislation host. A provenance URL two parsers disagree about is
        # not provenance.
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["primary_source"]["url"] = (
            "https://evil.example" + chr(92) + "@www.legislation.gov.au/F2018L00217/latest/text"
        )
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("backslash" in failure for failure in failures), failures)

    def test_credentials_in_a_primary_source_url_are_refused(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["primary_source"]["url"] = (
            "https://user:pw@www.legislation.gov.au/F2018L00217/latest/text"
        )
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("credentials" in failure for failure in failures), failures)

    def test_a_row_cannot_supersede_itself(self) -> None:
        # The damaging shape: a single-row series marks itself superseded,
        # passes, and silently drops out of every consumer's verified set.
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["status"] = "superseded"
        payload["rows"][0]["supersedes"] = payload["rows"][0]["row_id"]
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("supersedes itself" in failure for failure in failures), failures)

    def test_only_one_replacement_may_name_a_superseded_row(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        original = json.loads(json.dumps(payload["rows"][0]))
        payload["rows"][0]["status"] = "superseded"
        payload["rows"][0]["period_end"] = "2023-12-31"
        for index, start in enumerate(("2024-01-01", "2025-01-01")):
            row = json.loads(json.dumps(original))
            row["row_id"] = f"live-{index}"
            row["period_start"] = start
            row["period_end"] = "2024-12-31" if index == 0 else None
            row["supersedes"] = original["row_id"]
            payload["rows"].append(row)
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("exactly one replacement" in failure for failure in failures), failures)

    def test_a_live_row_cannot_be_superseded(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        original = json.loads(json.dumps(payload["rows"][0]))
        payload["rows"][0]["period_end"] = "2023-12-31"
        replacement = json.loads(json.dumps(original))
        replacement["row_id"] = "live-1"
        replacement["period_start"] = "2024-01-01"
        replacement["supersedes"] = original["row_id"]
        payload["rows"].append(replacement)
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(
            any("rather than 'superseded'" in failure for failure in failures), failures
        )

    def test_a_second_sha256sums_deeper_in_the_tree_is_still_covered(self) -> None:
        # Only the register's own sums file is exempt. Another of that name was
        # neither hashed nor listed, and was published all the same.
        (register.REGISTER_DIR / "series" / "SHA256SUMS").write_text(
            "x\n", encoding="utf-8", newline=""
        )
        failures = register.check_register()
        self.assertTrue(
            any("series/SHA256SUMS is not listed" in failure for failure in failures), failures
        )

    def test_an_unvalidated_series_in_a_subdirectory_is_refused(self) -> None:
        nested = register.REGISTER_DIR / "series" / "extra"
        nested.mkdir()
        shutil.copy(self._series(), nested / "made-up.json")
        self._resum()
        failures = register.check_register()
        self.assertTrue(
            any("does not match the files" in failure for failure in failures), failures
        )


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0], "-v"])
