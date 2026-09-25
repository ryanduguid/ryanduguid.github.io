"""Keep public formulas bound to the recorded native Excel check."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import build_ozzit_reference as reference


class NativeEvidenceTests(unittest.TestCase):
    def test_changed_display_is_rejected(self) -> None:
        examples = json.loads(reference.EXAMPLES.read_text(encoding="utf-8"))
        examples[0]["expected"] = "200.00, displayed to two decimal places."
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "examples.json"
            path.write_text(json.dumps(examples), encoding="utf-8")
            with patch.object(reference, "EXAMPLES", path):
                with self.assertRaisesRegex(ValueError, "expected display differs"):
                    reference.render()

    def test_changed_native_values_are_rejected(self) -> None:
        for name, row, column, value in (
            ("gstextract", 0, 0, 200),
            ("primecost", 0, 4, 300),
            ("amortise", 4, 0, 100000),
            ("financialyear", 0, 0, "FY2028"),
        ):
            with self.subTest(name=name):
                record = json.loads(reference.RECORD.read_text(encoding="utf-8"))
                record["results"][name][row][column] = value
                with tempfile.TemporaryDirectory() as directory:
                    path = Path(directory) / "record.json"
                    path.write_text(json.dumps(record), encoding="utf-8")
                    with patch.object(reference, "RECORD", path):
                        with self.assertRaisesRegex(ValueError, "expected display differs"):
                            reference.render()

    def test_changed_native_array_shape_is_rejected(self) -> None:
        record = json.loads(reference.RECORD.read_text(encoding="utf-8"))
        record["results"]["primecost"] = [[200], [200], [200], [200], [200]]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "record.json"
            path.write_text(json.dumps(record), encoding="utf-8")
            with patch.object(reference, "RECORD", path):
                with self.assertRaisesRegex(ValueError, "native result shape differs"):
                    reference.render()

    def test_changed_formula_needs_new_native_evidence(self) -> None:
        examples = json.loads(reference.EXAMPLES.read_text(encoding="utf-8"))
        examples[0]["formula"] = "=oz.GSTExtractλ(2200)"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "examples.json"
            path.write_text(json.dumps(examples), encoding="utf-8")
            with patch.object(reference, "EXAMPLES", path):
                with self.assertRaisesRegex(ValueError, "matching native Excel"):
                    reference.render()

    def test_results_must_identify_the_released_workbook(self) -> None:
        record = json.loads(reference.RECORD.read_text(encoding="utf-8"))
        record["workbook_sha256"] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "record.json"
            path.write_text(json.dumps(record), encoding="utf-8")
            with patch.object(reference, "RECORD", path):
                with self.assertRaisesRegex(ValueError, "v3.4.2 release workbook"):
                    reference.render()

    def test_missing_native_result_is_rejected(self) -> None:
        record = json.loads(reference.RECORD.read_text(encoding="utf-8"))
        del record["results"]["gstextract"]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "record.json"
            path.write_text(json.dumps(record), encoding="utf-8")
            with patch.object(reference, "RECORD", path):
                with self.assertRaisesRegex(ValueError, "matching native Excel"):
                    reference.render()


if __name__ == "__main__":
    unittest.main()
