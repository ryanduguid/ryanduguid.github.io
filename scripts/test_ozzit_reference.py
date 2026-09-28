"""Keep public formulas bound to the recorded native Excel check."""

from __future__ import annotations

import csv
import html
import io
import json
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
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


class FunctionIndexTests(unittest.TestCase):
    """The index of every named formula must mirror the pinned release CSV."""

    @staticmethod
    def rows() -> list[dict[str, str]]:
        return reference.load_index()

    def render_with(self, rows: list[dict[str, str]]) -> str:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "functions.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            with patch.object(reference, "INDEX", path):
                return reference.render_index()

    def test_modules_hold_every_named_formula_largest_first(self) -> None:
        output = reference.render_index()
        modules = re.findall(r"<h3>(\w+), (\d+) named formulas</h3>", output)
        self.assertEqual(
            modules,
            [
                ("Financial", "46"),
                ("Ratios", "39"),
                ("Essentials", "17"),
                ("Utilities", "17"),
                ("Dates", "14"),
                ("Debt", "5"),
            ],
        )
        ids = re.findall(r'<li id="(oz-[a-z0-9]+)">', output)
        self.assertEqual(len(ids), 138)
        self.assertEqual(len(set(ids)), 138)
        self.assertIn('<li id="oz-gstextract"><code>oz.GSTExtract', output)
        self.assertEqual(output.count("<details"), 6)
        self.assertNotIn("<details open", output)
        # Unstyled lists keep their semantics in Safari only with an explicit role.
        self.assertEqual(output.count('<ul class="function-index__list" role="list">'), 6)

    def test_every_call_is_the_released_signature(self) -> None:
        output = reference.render_index()
        calls = [
            html.unescape(re.sub(r"<[^>]+>", "", item))
            for item in re.findall(r"<code>(.*?)</code>", output)
        ]
        self.assertEqual(sorted(calls), sorted("oz." + row["signature"] for row in self.rows()))

    def test_lambda_is_marked_and_markup_is_escaped(self) -> None:
        rows = self.rows()
        rows[5] = {**rows[5], "signature": rows[5]["signature"] + " <b>&amp;</b>"}
        output = self.render_with(rows)
        self.assertIn("&lt;b&gt;&amp;amp;&lt;/b&gt;", output)
        self.assertNotIn("<b>", output)
        bare = re.sub(r'<span class="function-symbol">λ</span>', "", output)
        self.assertNotIn("λ", bare)

    def test_colliding_fragment_ids_are_rejected(self) -> None:
        rows = self.rows()
        rows[11] = {**rows[11], "function": "oz.AvgCols_λ", "signature": "AvgCols_λ( Array)"}
        self.assertEqual(reference.anchor("oz.AvgCols_λ"), reference.anchor("oz.AvgColsλ"))
        with self.assertRaisesRegex(ValueError, "share a fragment id"):
            self.render_with(rows)

    def test_signature_must_start_with_its_name(self) -> None:
        for signature in ("Other(Value)", "AboutDatesλExtra(Value)"):
            with self.subTest(signature=signature):
                rows = self.rows()
                rows[0] = {**rows[0], "signature": signature}
                with self.assertRaisesRegex(ValueError, "does not match its function name"):
                    self.render_with(rows)

    def test_stale_index_include_fails_the_check(self) -> None:
        # The site checks run these tests inside the built site, which has no
        # _includes folder, so both includes are supplied here.
        with tempfile.TemporaryDirectory() as directory:
            current = Path(directory) / "ozzit-reference.html"
            current.write_text(reference.render(), encoding="utf-8", newline="\n")
            stale = Path(directory) / "ozzit-function-index.html"
            stale.write_text("<!-- stale -->\n", encoding="utf-8")
            with (
                patch.object(reference, "OUTPUT", current),
                patch.object(reference, "INDEX_OUTPUT", stale),
                patch.object(sys, "argv", ["build_ozzit_reference.py", "--check"]),
                redirect_stdout(io.StringIO()) as printed,
            ):
                self.assertEqual(reference.main(), 1)
            self.assertIn("ozzit-function-index.html differs", printed.getvalue())


if __name__ == "__main__":
    unittest.main()
