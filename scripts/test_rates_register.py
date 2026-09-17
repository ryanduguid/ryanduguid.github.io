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


class RegisterTests(unittest.TestCase):
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
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        self._resum()

    def _resum(self) -> None:
        lines = []
        for path in sorted(register.REGISTER_DIR.rglob("*")):
            if path.is_file() and path.name != "SHA256SUMS":
                name = path.relative_to(register.REGISTER_DIR).as_posix()
                lines.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {name}")
        register.SUMS.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def test_committed_register_passes(self) -> None:
        self._point_at(ROOT / "rates" / "register")
        self.assertEqual(register.check_register(), [])

    def test_a_changed_byte_breaks_the_digest(self) -> None:
        series = self._series()
        series.write_text(series.read_text(encoding="utf-8").replace('"2.7"', '"2.8"'), encoding="utf-8")
        failures = register.check_register()
        self.assertTrue(any("digest does not match" in failure for failure in failures), failures)

    def test_a_site_page_cannot_be_the_primary_source(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["primary_source"]["url"] = "https://duguid.com.au/rates/coal-lsl-levy/"
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("not a primary source host" in failure for failure in failures), failures)

    def test_a_future_check_date_is_refused(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["verified_at"] = "2099-01-01"
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("is in the future" in failure for failure in failures), failures)

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
        self.assertTrue(
            any("not professional review" in failure for failure in failures), failures
        )

    def test_an_unverified_row_must_explain_itself(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        row = payload["rows"][0]
        row["status"] = "unverified"
        row["verified_at"] = None
        row["verified_by"] = None
        row.pop("verification_note", None)
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("needs a verification_note" in failure for failure in failures), failures)

    def test_a_superseded_row_must_be_named_by_its_replacement(self) -> None:
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        payload["rows"][0]["status"] = "superseded"
        self._rewrite(self._series(), payload)
        failures = register.check_register()
        self.assertTrue(any("no row names it in supersedes" in failure for failure in failures), failures)

    def test_an_unlisted_series_file_is_refused(self) -> None:
        shutil.copy(self._series(), register.REGISTER_DIR / "series" / "made-up.json")
        self._resum()
        failures = register.check_register()
        self.assertTrue(any("does not match the files" in failure for failure in failures), failures)

    def test_one_series_check_date_does_not_travel_to_another(self) -> None:
        """A second series keeps its own dates; refreshing one must not refresh the other."""
        payload = json.loads(self._series().read_text(encoding="utf-8"))
        other = json.loads(json.dumps(payload))
        other["series_id"] = "example-series"
        other["rows"][0]["verified_at"] = "2026-01-05"
        path = register.REGISTER_DIR / "series" / "example-series.json"
        path.write_text(json.dumps(other, indent=2) + "\n", encoding="utf-8")
        manifest = json.loads(register.MANIFEST.read_text(encoding="utf-8"))
        manifest["series"] = sorted(manifest["series"] + ["series/example-series.json"])
        register.MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
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


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0], "-v"])
