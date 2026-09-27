"""Offline regression checks for source attribution and evidence qualifications."""

from __future__ import annotations

import csv
import html
import json
import re
import unittest
from collections import Counter
from decimal import Decimal
from pathlib import Path
from typing import Any

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
    def test_car_cost_preserves_unclaimable_gst(self) -> None:
        tree = core.parse_structure(read("rates/car-limit/index.html"))
        main = core.element_by_id(tree, "main")[0]
        text = core.element_text(main)
        self.assertNotIn("GST-exclusive cost", text)
        self.assertIn("GST credit you are entitled to claim", text)
        self.assertIn("GST you cannot claim stays in the cost", text)
        self.assertIn("including all GST if you are not registered", text)

    def test_div7a_rates_keep_year_end_scope_in_each_format(self) -> None:
        html = read("rates/div7a-benchmark-rate/index.html")
        tree = core.parse_structure(html)
        captions = core.descendants(tree, "caption")
        self.assertTrue(any("30 June year end" in core.element_text(c) for c in captions))
        for script in core.descendants(tree, "script"):
            if script.attr("type") != "application/ld+json":
                continue
            graph = json.loads(core.element_text(script))["@graph"]
            for item in graph:
                if item["@type"] == "Dataset":
                    self.assertIn("30 June year end", item["description"])
                if item["@type"] == "FAQPage":
                    for question in item["mainEntity"]:
                        if re.search(r"202[56]-2[67]", question["name"]):
                            self.assertIn("30 June year end", question["acceptedAnswer"]["text"])
        rows = list(
            csv.DictReader(
                read("rates/div7a-benchmark-rate/div7a-benchmark-rates.csv").splitlines()
            )
        )
        self.assertTrue(rows, "Division 7A CSV must contain rate records")
        self.assertTrue(all("30 June year end" in row["notes"] for row in rows))
        index = read("llms.txt")
        self.assertIn("substituted accounting period", index)
        self.assertIn("before its own start date", index)

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
            "does not establish whether a consultation draft, bill or instrument exists", html
        )
        self.assertIn("planning scenarios", html)
        self.assertNotIn("Nothing changes for the 2026-27", html)
        self.assertIn("26-155(3)", html)
        self.assertIn("Schedule 2 item 5", html)
        self.assertIn("CGT has separate application and transition provisions", html)

    def test_receipt_versions_are_beside_example(self) -> None:
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
            "0.1.7",
            "Neither field authenticates",
        ):
            self.assertIn(term, text)
        main = core.element_by_id(tree, "main")[0]
        header = core.descendants(main, "header")[0]
        self.assertTrue(
            any(link.attr("href") == "#receipt-amount" for link in core.descendants(header, "a"))
        )
        for path in (
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
            "Older checkers 0.1.5 and 0.1.6",
            "the quick trial uses 0.1.8",
            "assume full receipt",
            "0.1.7",
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
        self.assertIn("receipt amount evidence", text)
        self.assertIn("calendar and GIC coverage", text)
        self.assertTrue(
            any(
                link.attr("href") == "/tools/payday-super/#receipt-amount"
                for link in core.descendants(section, "a")
            )
        )
        self.assertNotIn("all operate correctly", read("llms.txt"))

    def test_workbook_claims_distinguish_released_versions(self) -> None:
        tree = core.parse_structure(read("tools/payday-super/index.html"))
        section = core.element_by_id(tree, "workbook-versions")[0]
        text = core.element_text(section)
        for boundary in (
            "0.1.6",
            "31 December 2026",
            "--allow-stale-gic",
            "0.1.7",
            "Not assessed",
            "a PyPI install does not install the workbook",
            "BLOCKED",
        ):
            self.assertIn(boundary, text)
        self.assertTrue(
            any(
                "payday-super-checker/v0.1.6/" in (link.attr("href") or "")
                for link in core.descendants(section, "a")
            )
        )


class RatesDatasetTests(unittest.TestCase):
    """The 2026-27 rate tables and question facts state the dataset's values.

    ryanduguid/au-tax-rates-data is the single home for dated figures. The site
    keeps a digest-pinned extract of the records it relies on
    (scripts/pin_rates_dataset.py writes it), and these checks fail when a page
    or the extract moves without the other.
    """

    value: dict[str, Any]

    @classmethod
    def setUpClass(cls) -> None:
        extract = json.loads(read("scripts/rates_dataset_extract.json"))
        assert re.fullmatch(r"[0-9a-f]{40}", extract["commit"]), extract["commit"]
        for name, record in extract["records"].items():
            assert re.fullmatch(r"[0-9a-f]{64}", record["sha256"]), name
        cls.value = {name: record["value"] for name, record in extract["records"].items()}

    @staticmethod
    def fact(question: int, topic: str) -> str:
        """The bold checked answer as the built topic page renders it."""
        page = read(f"tools/accounting-questions/{topic}/index.html")
        match = re.search(
            rf'<details class="question" id="q{question}".*?<strong>(.*?)</strong>', page, re.S
        )
        assert match is not None, question
        return html.unescape(match.group(1))

    @staticmethod
    def rows(path: str) -> list[dict[str, str]]:
        return list(csv.DictReader(read(path).splitlines()))

    def test_rate_tables_state_the_dataset_values(self) -> None:
        def by_year(path: str) -> dict[str, dict[str, str]]:
            return {row["income_year"]: row for row in self.rows(path)}

        fbt = {row["fbt_year_ending"]: row for row in self.rows("rates/fbt-rate/fbt-rates.csv")}
        # The rate in force on 1 July 2026; the table's current row has an open end.
        (sg,) = [
            row
            for row in self.rows("rates/super-guarantee/super-guarantee-rates.csv")
            if row["period_start"] <= "2026-07-01"
            and (not row["period_end"] or "2026-07-01" <= row["period_end"])
        ]
        pairs = {
            "car-limit-2026-27": by_year("rates/car-limit/car-limit.csv")["2026-27"]["car_limit"],
            "cents-per-km-2026-27": by_year(
                "rates/cents-per-kilometre/cents-per-kilometre-rates.csv"
            )["2026-27"]["cents_per_km"],
            "div7a-benchmark-rate-2026-27": by_year(
                "rates/div7a-benchmark-rate/div7a-benchmark-rates.csv"
            )["2026-27"]["benchmark_rate_percent"],
            "fbt-rate": fbt["2027-03-31"]["fbt_rate_percent"],
            "super-guarantee-rate-2026-27": sg["general_sg_rate_percent"],
        }
        for name, shown in pairs.items():
            with self.subTest(record=name):
                self.assertEqual(Decimal(shown), Decimal(str(self.value[name])))

    def test_rate_pages_show_the_dataset_values(self) -> None:
        # Each page's table is written by hand beside its CSV, so check what visitors see too.
        shown = {
            "car-limit-2026-27": ("car-limit", "2026-27"),
            "cents-per-km-2026-27": ("cents-per-kilometre", "2026-27"),
            "div7a-benchmark-rate-2026-27": ("div7a-benchmark-rate", "2026-27"),
            "fbt-rate": ("fbt-rate", "31 March 2027"),
            "super-guarantee-rate-2026-27": ("super-guarantee", "1 July 2025 onwards"),
        }
        for name, (page, label) in shown.items():
            with self.subTest(record=name):
                rows = {row[0]: row[1] for row in measure_rows(read(f"rates/{page}/index.html"))}
                self.assertEqual(
                    Decimal(re.sub(r"[$,%]", "", rows[label])), Decimal(str(self.value[name]))
                )

    def test_question_facts_state_the_dataset_values(self) -> None:
        def figures(text: str) -> set[str]:
            return set(re.findall(r"\$\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?%", text))

        # The page states where tax starts, each bracket's upper threshold and each
        # marginal rate.
        brackets = self.value["resident-tax-rates-2026-27"]
        first_taxed = next(bracket for bracket in brackets if bracket["marginal_rate"])
        scale = {f"${first_taxed['from']:,}"}
        scale |= {f"${bracket['to']:,}" for bracket in brackets if bracket["to"]}
        scale |= {
            f"{bracket['marginal_rate']}%" for bracket in brackets if bracket["marginal_rate"]
        }
        expected = {
            (1, "general-tax"): scale | {f"{self.value['medicare-levy-rate']}%"},
            (20, "deductions"): {f"${self.value['instant-asset-write-off-threshold']:,}"},
            (32, "gst-bas"): {f"${self.value['gst-registration-threshold']:,}"},
            (84, "company-compliance"): {f"{self.value['div7a-benchmark-rate-2026-27']}%"},
        }
        for (question, topic), wanted in expected.items():
            with self.subTest(question=question):
                self.assertLessEqual(wanted, figures(self.fact(question, topic)))


if __name__ == "__main__":
    unittest.main()
