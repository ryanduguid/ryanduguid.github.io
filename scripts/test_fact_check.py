"""Offline regression checks for source attribution and evidence qualifications."""

from __future__ import annotations

import csv
import json
import re
import unittest
from collections import Counter
from pathlib import Path

import seo_core as core

ROOT = Path(__file__).resolve().parents[1]
ANNOUNCED = "rates/announced-not-yet-law"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def fbt_attribution(html: str) -> bool:
    tree = core.parse_structure(html)
    return (
        any(
            link.attr("href") == "https://www.legislation.gov.au/C2004A03281/latest/text"
            and core.element_text(link) == "Fringe Benefits Tax Act 1986"
            for link in core.descendants(tree, "a", rendered_only=True)
        )
        and "Fringe Benefits Tax Act 1986, section 6" in html
    )


def measure_rows(html: str) -> list[list[str]]:
    tree = core.parse_structure(html)
    return [
        [core.element_text(cell) for cell in core.descendants(row) if cell.tag in {"th", "td"}]
        for body in core.descendants(tree, "tbody")
        for row in core.descendants(body, "tr")
    ]


class FactCheckTests(unittest.TestCase):
    def test_fbt_rate_act_and_citation(self) -> None:
        html = read("rates/fbt-rate/index.html")
        self.assertTrue(fbt_attribution(html))
        self.assertFalse(fbt_attribution(html.replace("C2004A03281", "C2004A03280")))
        self.assertFalse(
            fbt_attribution(html.replace("Act 1986, section 6", "Act 1986, section 5"))
        )
        # An assessment reference for a different purpose must remain permissible.
        self.assertTrue(
            fbt_attribution(html + "<p>Fringe Benefits Tax Assessment Act 1986, s 5B</p>")
        )

    def test_measure_csv_matches_visible_tables(self) -> None:
        html = read(f"{ANNOUNCED}/index.html")
        with (ROOT / ANNOUNCED / "announced-measures.csv").open(newline="", encoding="utf-8") as f:
            records = list(csv.DictReader(f))
        visible = measure_rows(html)
        self.assertEqual(len(visible), len(records))
        for cells, record in zip(visible, records):
            self.assertEqual(cells[:3], [record[k] for k in ("measure", "announced_in", "start")])
            if record["status"] in {"TBD", "Various"}:
                self.assertEqual(cells[3], record["status"])
            else:
                self.assertIn(record["legislation"], cells[3])
            self.assertTrue(record["status_source_url"].startswith("https://www.ato.gov.au/"))
            self.assertTrue(record["review_scope"])
            self.assertTrue(record["application_note"])
        counts = Counter(record["status"] for record in records)
        summary = core.element_text(core.parse_structure(html))
        self.assertIn(f"{len(records)} selected", summary)
        self.assertIn(f"{counts['TBD']} as TBD", summary)
        self.assertEqual(counts["Various"], 1)
        self.assertIn("one as Various", summary)
        self.assertEqual(
            [
                len(measure_rows(str_table))
                for str_table in re.findall(r"<table\b.*?</table>", html, re.S)
            ],
            [15, 3, 9],
        )

    def test_source_status_is_not_absence_of_legislation(self) -> None:
        html = read(f"{ANNOUNCED}/index.html")
        self.assertNotIn("No bill yet", html)
        self.assertNotIn("TBD means there is none", html)
        self.assertIn(
            "does not establish whether a consultation draft, bill, or instrument exists", html
        )
        self.assertIn("planning scenarios", html)
        self.assertNotIn("Nothing changes for the 2026-27", html)
        self.assertIn("26-155(3)", html)
        self.assertIn("Schedule 2 item 5", html)
        self.assertIn("CGT has separate application and transition provisions", html)

    def test_published_receipt_limitation_is_beside_example(self) -> None:
        html = read("tools/payday-super/index.html")
        tree = core.parse_structure(html)
        sections = core.element_by_id(tree, "receipt-amount")
        self.assertEqual(len(sections), 1)
        text = core.element_text(sections[0])
        for term in (
            "0.1.6",
            "0.1.5",
            "matched_amount",
            "remitted_amount",
            "ON_TIME",
            "UNPAID",
            "unreleased",
            "Neither field authenticates",
        ):
            self.assertIn(term, text)
        main = core.element_by_id(tree, "main")[0]
        header = core.descendants(main, "header")[0]
        self.assertTrue(
            any(link.attr("href") == "#receipt-amount" for link in core.descendants(header, "a"))
        )
        for path in (
            "index.html",
            "about/index.html",
            "tools/limitations/index.html",
            "evaluate/payday-super-evidence/index.html",
            "tools/australian-tax-ai-agents/index.html",
        ):
            self.assertIn("/tools/payday-super/#receipt-amount", read(path))

    def test_machine_index_preserves_claim_boundaries(self) -> None:
        index = read("llms.txt")
        self.assertNotIn("Client data stays local", index)
        self.assertNotIn("STILL CORRECT on every run", index)
        for qualification in (
            "cloud-backed AI host",
            "tool results and library excerpts",
            "https://duguid.com.au/tools/payday-super/#receipt-amount",
            "published checker 0.1.6 and quick-trial 0.1.5",
            "assume full receipt",
            "unreleased",
            "outcomes from checker 0.1.3",
        ):
            self.assertIn(qualification, index)

    def test_historical_evaluation_and_review_dates_stay_fixed(self) -> None:
        record = json.loads(read("scripts/release_record.json"))
        self.assertEqual(
            record["evaluations"]["evaluate/payday-super-evidence/index.html"]["version"], "0.1.3"
        )
        self.assertIn(
            "payday-super-checker/v0.1.3", read("evaluate/payday-super-evidence/index.html")
        )
        self.assertIn(
            "Verified 20 September 2026 against the ATO", read("rates/fbt-rate/index.html")
        )
        self.assertIn(
            "citation check does not renew the historical table review",
            read("rates/fbt-rate/index.html"),
        )

    def test_join_qualification_retains_other_evidence_limits(self) -> None:
        tree = core.parse_structure(read("tools/limitations/index.html"))
        section = core.element_by_id(tree, "psc-2")[0]
        text = core.element_text(section)
        self.assertNotIn("all operate correctly", text)
        self.assertIn("receipt-amount evidence", text)
        self.assertIn("calendar and GIC coverage", text)
        self.assertTrue(
            any(
                link.attr("href") == "/tools/payday-super/#receipt-amount"
                for link in core.descendants(section, "a")
            )
        )
        self.assertNotIn("all operate correctly", read("llms.txt"))

    def test_workbook_claims_distinguish_published_and_development(self) -> None:
        tree = core.parse_structure(read("tools/payday-super/index.html"))
        section = core.element_by_id(tree, "workbook-versions")[0]
        text = core.element_text(section)
        for boundary in (
            "0.1.6",
            "31 December 2026",
            "--allow-stale-gic",
            "0.1.7",
            "Not assessed",
            "not a published",
            "BLOCKED",
        ):
            self.assertIn(boundary, text)
        self.assertTrue(
            any(
                "payday-super-checker/v0.1.6/" in link.attr("href")
                for link in core.descendants(section, "a")
            )
        )


if __name__ == "__main__":
    unittest.main()
