// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! scripts/test_fact_check.py: offline checks for source attribution, evidence
//! qualifications and the rates dataset values, against the rendered checked tree.
mod common;

use common::{copied_site, rendered, root};
use site_tools::htmlparser::{self, Event};
use site_tools::pycsv;
use site_tools::pyjson::{self, Json};
use site_tools::pyre::{S, re};
use site_tools::seo_core::{TITLE_MAX, Tree, parse_structure};
use site_tools::site_contracts::RATE_PAGES;
use site_tools::source_freshness::format_date;

const ANNOUNCED: &str = "rates/announced-not-yet-law";
const CASE: &str = "assets/examples/quarter-close-to-forecast";

fn read(path: &str) -> String {
    site_tools::read(&root().join(path)).unwrap()
}

fn json(path: &str) -> Json {
    pyjson::loads(&read(path)).unwrap()
}

fn get<'a>(value: &'a Json, key: &str) -> &'a Json {
    value.get(key).unwrap_or_else(|| panic!("missing {key}"))
}

fn text_of(value: &Json) -> String {
    match value {
        Json::Str(s) => s.clone(),
        other => other.py_str(),
    }
}

fn by_id(tree: &Tree, id: &str) -> usize {
    tree.by_id(id)[0]
}

fn links(tree: &Tree, id: usize) -> Vec<Option<String>> {
    tree.descendants(id, Some("a"), false)
        .into_iter()
        .map(|a| tree.attr(a, "href").map(str::to_owned))
        .collect()
}

fn cells(tree: &Tree, row: usize) -> Vec<String> {
    tree.descendants(row, None, false)
        .into_iter()
        .filter(|c| matches!(tree.tag(*c), "th" | "td"))
        .map(|c| tree.text(c))
        .collect()
}

fn measure_rows(html: &str) -> Vec<Vec<String>> {
    let tree = parse_structure(html);
    let mut rows = Vec::new();
    for body in tree.descendants(Tree::ROOT, Some("tbody"), false) {
        for row in tree.descendants(body, Some("tr"), false) {
            rows.push(cells(&tree, row));
        }
    }
    rows
}

fn csv_rows(path: &str) -> Vec<Vec<(String, Option<String>)>> {
    pycsv::dict_reader(&read(path)).unwrap()
}

fn field<'a>(row: &'a [(String, Option<String>)], name: &str) -> &'a str {
    row.iter()
        .find(|(k, _)| k == name)
        .and_then(|(_, v)| v.as_deref())
        .unwrap_or_else(|| panic!("missing {name}"))
}

/// Decimal equality: both sides normalised to sign, digits and exponent.
fn decimal(text: &str) -> (bool, String, i64) {
    let text = site_tools::py::strip(text);
    let (negative, body) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text.strip_prefix('+').unwrap_or(text)),
    };
    let (int, frac) = body.split_once('.').unwrap_or((body, ""));
    let digits = format!("{int}{frac}");
    let digits = digits.trim_start_matches('0');
    let exponent = -(frac.len() as i64);
    let trimmed = digits.trim_end_matches('0');
    let exponent = exponent + (digits.len() - trimmed.len()) as i64;
    if trimmed.is_empty() {
        return (false, String::new(), 0);
    }
    (negative, trimmed.to_owned(), exponent)
}

/// `f"{'-' if amount < 0 else ''}${abs(amount):,.2f}"` for a Decimal string.
fn money(value: &str) -> String {
    let (negative, int, frac) = {
        let text = site_tools::py::strip(value);
        let (negative, body) = match text.strip_prefix('-') {
            Some(rest) => (true, rest),
            None => (false, text),
        };
        let (int, frac) = body.split_once('.').unwrap_or((body, ""));
        (negative, int.to_owned(), frac.to_owned())
    };
    // Round half to even at two places, as Decimal's default context does.
    let mut cents: num_bigint::BigInt = format!("{int}{:0<2}", &frac[..frac.len().min(2)])
        .parse()
        .unwrap();
    let rest = frac.get(2..).unwrap_or("");
    let first = rest.chars().next().unwrap_or('0');
    let beyond = rest.chars().skip(1).any(|c| c != '0');
    let odd = &cents % 2u8 == 1u8.into();
    if first > '5' || (first == '5' && (beyond || odd)) {
        cents += 1;
    }
    let units = &cents / 100u8;
    let remainder = &cents % 100u8;
    let digits = units.to_string();
    let mut grouped = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            grouped.push(',');
        }
        grouped.push(c);
    }
    let zero = cents == 0u8.into();
    format!(
        "{}${grouped}.{:02}",
        if negative && !zero { "-" } else { "" },
        remainder.to_string().parse::<u32>().unwrap()
    )
}

/// `assertCountEqual` for decoded values.
fn same_multiset(a: &[Json], b: &[Json]) -> bool {
    let mut unmatched: Vec<&Json> = b.iter().collect();
    a.len() == b.len()
        && a.iter()
            .all(|x| match unmatched.iter().position(|y| x.py_eq(y)) {
                Some(i) => {
                    unmatched.remove(i);
                    true
                }
                None => false,
            })
}

fn row_json(row: &[(String, Option<String>)]) -> Json {
    Json::Object(
        row.iter()
            .map(|(k, v)| (k.clone(), v.clone().map_or(Json::Null, Json::Str)))
            .collect(),
    )
}

fn fbt_attribution(html: &str) -> bool {
    let tree = parse_structure(html);
    tree.descendants(Tree::ROOT, Some("a"), true)
        .into_iter()
        .any(|a| {
            tree.attr(a, "href") == Some("https://www.legislation.gov.au/C2004A03281/latest/text")
                && tree.text(a) == "Fringe Benefits Tax Act 1986"
        })
        && html.contains("Fringe Benefits Tax Act 1986, section 6")
}

#[test]
fn rental_expense_qualifications_reach_each_answer_format() {
    assert!(rendered(), "rental qualifications require a rendered site");
    let topic = "tools/accounting-questions/investments-local/index";
    let tree = parse_structure(&read(&format!("{topic}.html")));
    let mut answers = Vec::new();
    let mut modified = String::new();
    for script in tree.descendants(Tree::ROOT, Some("script"), false) {
        if tree.attr(script, "type") != Some("application/ld+json") {
            continue;
        }
        let graph = pyjson::loads(&tree.text(script)).unwrap();
        let Json::Array(items) = get(&graph, "@graph") else {
            panic!("@graph")
        };
        for item in items {
            if text_of(get(item, "@type")) == "WebPage" {
                modified = text_of(get(item, "dateModified"));
            }
            if text_of(get(item, "@type")) == "FAQPage" {
                let Json::Array(questions) = get(item, "mainEntity") else {
                    panic!("mainEntity")
                };
                answers.extend(questions.iter().cloned());
            }
        }
    }
    assert!(
        modified.as_str() >= "2026-11-04",
        "dateModified {modified} predates the rental answer corrections"
    );
    let sitemap = read("sitemap.xml");
    let sitemap = roxmltree::Document::parse(&sitemap).unwrap();
    let url = "https://duguid.com.au/tools/accounting-questions/investments-local/";
    let entry = sitemap
        .descendants()
        .find(|node| node.has_tag_name("loc") && node.text() == Some(url))
        .unwrap()
        .parent()
        .unwrap();
    let lastmod = entry
        .children()
        .find(|node| node.has_tag_name("lastmod"))
        .and_then(|node| node.text())
        .unwrap();
    assert_eq!(lastmod, modified, "sitemap and topic modification dates");
    let machine_topic = read(&format!("{topic}.txt"));
    let machine_full = read("llms-full.txt");
    for (id, qualifications) in [
        (
            "q91",
            vec![
                "$300 or less",
                "predominantly",
                "non-business assessable income",
                "set and identical or substantially identical asset cost tests",
                "second-hand residential asset restrictions",
                "private use",
            ],
        ),
        (
            "q92",
            vec![
                "capital works rules separately",
                "CGT cost base",
                "acquired after 7.30 pm (ACT time) on 13 May 1997",
                "after 30 June 1999 on property acquired earlier",
                "capital works deductions claimed or claimable",
                "does not automatically produce a deduction",
            ],
        ),
    ] {
        let question = by_id(&tree, id);
        let bold = tree.descendants(question, Some("strong"), false)[0];
        let fact = tree.text(bold);
        let matching: Vec<_> = answers
            .iter()
            .filter(|q| text_of(get(q, "url")).ends_with(&format!("#{id}")))
            .collect();
        assert_eq!(matching.len(), 1, "one structured answer for {id}");
        let structured = text_of(get(get(matching[0], "acceptedAnswer"), "text"));
        for qualification in qualifications {
            assert!(
                fact.contains(qualification),
                "{id} visible: {qualification}"
            );
            assert!(
                structured.contains(qualification),
                "{id} structured: {qualification}"
            );
        }
        assert!(machine_topic.contains(&fact), "{id} topic machine copy");
        assert!(machine_full.contains(&fact), "{id} full machine copy");
    }
}

#[test]
fn source_attribution_and_qualifications() {
    if !rendered() {
        return;
    }
    // Car cost keeps the GST that cannot be claimed.
    let tree = parse_structure(&read("rates/car-limit/index.html"));
    let text = tree.text(by_id(&tree, "main"));
    assert!(!text.contains("GST-exclusive cost"));
    for phrase in [
        "GST credit you are entitled to claim",
        "GST you cannot claim stays in the cost",
        "including all GST if you are not registered",
    ] {
        assert!(text.contains(phrase), "{phrase}");
    }

    // Division 7A keeps its year-end scope in each format.
    let html = read("rates/div7a-benchmark-rate/index.html");
    let tree = parse_structure(&html);
    assert!(
        tree.descendants(Tree::ROOT, Some("caption"), false)
            .iter()
            .any(|c| tree.text(*c).contains("30 June year end"))
    );
    for script in tree.descendants(Tree::ROOT, Some("script"), false) {
        if tree.attr(script, "type") != Some("application/ld+json") {
            continue;
        }
        let graph = pyjson::loads(&tree.text(script)).unwrap();
        let Json::Array(items) = get(&graph, "@graph") else {
            panic!("@graph")
        };
        for item in items {
            let kind = text_of(get(item, "@type"));
            if kind == "Dataset" {
                assert!(text_of(get(item, "description")).contains("30 June year end"));
            }
            if kind == "FAQPage" {
                let Json::Array(questions) = get(item, "mainEntity") else {
                    panic!()
                };
                for question in questions {
                    if re(r"202[56]-2[67]", 0)
                        .search(&text_of(get(question, "name")))
                        .is_some()
                    {
                        let answer = text_of(get(get(question, "acceptedAnswer"), "text"));
                        assert!(answer.contains("30 June year end"));
                    }
                }
            }
        }
    }
    let rows = csv_rows("rates/div7a-benchmark-rate/div7a-benchmark-rates.csv");
    assert!(!rows.is_empty());
    assert!(
        rows.iter()
            .all(|r| field(r, "notes").contains("30 June year end"))
    );
    let index = read("llms.txt");
    assert!(
        index.contains("substituted accounting period")
            && index.contains("before its own start date")
    );

    // The FBT rate cites its Act.
    let html = read("rates/fbt-rate/index.html");
    assert!(fbt_attribution(&html));
    assert!(!fbt_attribution(
        &html.replace("C2004A03281", "C2004A03280")
    ));
    assert!(!fbt_attribution(
        &html.replace("Act 1986, section 6", "Act 1986, section 5")
    ));
    assert!(fbt_attribution(&format!(
        "{html}<p>Fringe Benefits Tax Assessment Act 1986, s 5B</p>"
    )));
}

#[test]
fn measure_csv_matches_visible_tables() {
    if !rendered() {
        return;
    }
    let html = read(&format!("{ANNOUNCED}/index.html"));
    let records = csv_rows(&format!("{ANNOUNCED}/announced-measures.csv"));
    let visible = measure_rows(&html);
    assert_eq!(visible.len(), records.len());
    for (cells, record) in visible.iter().zip(&records) {
        let expected: Vec<&str> = ["measure", "announced_in", "start"]
            .iter()
            .map(|k| field(record, k))
            .collect();
        assert_eq!(
            cells[..3].iter().map(String::as_str).collect::<Vec<_>>(),
            expected
        );
        let status = field(record, "status");
        if status == "TBD" || status == "Various" {
            assert_eq!(cells[3], status);
        } else {
            assert!(cells[3].contains(field(record, "legislation")));
        }
        assert!(field(record, "status_source_url").starts_with("https://www.ato.gov.au/"));
        assert!(!field(record, "review_scope").is_empty());
        assert!(!field(record, "application_note").is_empty());

        // A pending row shows its stage; the CSV dates the stage and links its source.
        let stage = field(record, "bill_stage");
        let stage_date = field(record, "stage_date");
        let stage_url = field(record, "stage_source_url");
        assert_eq!(cells.len(), 5, "{cells:?}");
        assert_eq!(cells[4], stage);
        assert!(!stage.is_empty() && stage_url.starts_with("https://"));
        if status == "ATO-reported bill" {
            assert!(stage_url.starts_with(
                "https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId="
            ));
        }
        let shown = re(r"\d{1,2} [A-Z][a-z]+ \d{4}", 0)
            .search(stage)
            .and_then(|m| site_tools::pytime::strptime_day_month_year(&m[0]));
        if status.starts_with("ATO-reported legislation") {
            assert!(
                stage_url.starts_with("https://www.legislation.gov.au/"),
                "{stage_url}"
            );
            // The stage's date is the first assent or registration date the row shows.
            let assent = re(r"\d{1,2} [A-Z][a-z]+ \d{4}", 0)
                .search(field(record, "royal_assent"))
                .and_then(|m| site_tools::pytime::strptime_day_month_year(&m[0]));
            assert!(shown.is_some(), "{stage}");
            assert_eq!(shown, assent, "{stage}");
        }
        if stage_date.is_empty() {
            assert!(shown.is_none(), "{stage}");
        } else {
            let date = site_tools::py::Date::fromisoformat(stage_date).unwrap();
            assert_eq!(shown, Some(date), "{stage}");
            assert!(
                date <= site_tools::py::Date::fromisoformat(field(record, "checked_at")).unwrap()
            );
        }
    }
    let count = |status: &str| {
        records
            .iter()
            .filter(|r| field(r, "status") == status)
            .count()
    };
    let tree = parse_structure(&html);
    let summary = tree.text(Tree::ROOT);
    assert!(summary.contains(&format!("{} selected", records.len())));
    assert!(summary.contains(&format!("{} TBD", count("TBD"))));
    assert_eq!(count("Various"), 1);
    assert!(summary.contains("one as Various"));
    assert!(summary.contains(&format!("a bill for {}", count("ATO-reported bill"))));
    let sizes: Vec<usize> = re(r"<table\b.*?</table>", S)
        .findall(&html)
        .iter()
        .map(|t| measure_rows(t).len())
        .collect();
    assert_eq!(sizes, vec![15, 3, 9]);

    // A source status is not the absence of legislation.
    for absent in [
        "No bill yet",
        "TBD means there is none",
        "Nothing changes for the 2026-27",
    ] {
        assert!(!html.contains(absent), "{absent}");
    }
    for present in [
        "does not establish whether a consultation draft, bill or instrument exists",
        "planning scenarios",
        "26-155(3)",
        "Schedule 2 item 5",
        "CGT has separate application and transition provisions",
    ] {
        assert!(html.contains(present), "{present}");
    }
}

#[test]
fn payday_super_receipts_workbooks_and_qualifications() {
    if !rendered() {
        return;
    }
    let html = read("tools/payday-super/index.html");
    let tree = parse_structure(&html);
    let sections = tree.by_id("receipt-amount");
    assert_eq!(sections.len(), 1);
    let text = tree.text(sections[0]);
    for term in [
        "matched_amount",
        "remitted_amount",
        "ON_TIME",
        "UNPAID",
        "Neither field authenticates",
    ] {
        assert!(text.contains(term), "{term}");
    }
    // The receipt qualification sits with the fixed example it qualifies,
    // directly after the header and ahead of the page navigation.
    let example = tree.by_id("synthetic-worked-example");
    assert_eq!(example.len(), 1);
    assert!(
        links(&tree, example[0])
            .iter()
            .any(|h| h.as_deref() == Some("#receipt-amount"))
    );
    for path in [
        "about/index.html",
        "tools/limitations/index.html",
        "evaluate/payday-super-evidence/index.html",
        "tools/australian-tax-ai-agents/index.html",
    ] {
        assert!(
            read(path).contains("/tools/payday-super/#receipt-amount"),
            "{path}"
        );
    }

    let section = by_id(&tree, "workbook-versions");
    let text = tree.text(section);
    for boundary in [
        "31 December 2026",
        "--allow-stale-gic",
        "Not assessed",
        "A PyPI install does not install the workbook",
        "BLOCKED",
    ] {
        assert!(text.contains(boundary), "{boundary}");
    }
    assert!(links(&tree, section).iter().any(|h| {
        h.as_deref()
            .unwrap_or("")
            .contains("packages/payday-super-checker/workbooks")
    }));

    // The machine index keeps the claim boundaries.
    let index = read("llms.txt");
    assert!(
        !index.contains("Client data stays local") && !index.contains("STILL CORRECT on every run")
    );
    for qualification in [
        "cloud-backed AI host",
        "tool results and library excerpts",
        "https://duguid.com.au/tools/payday-super/#receipt-amount",
        "assume full receipt",
        "outcomes from checker 0.1.3",
    ] {
        assert!(index.contains(qualification), "{qualification}");
    }

    // The historical evaluation and review dates stay fixed.
    let record = json("scripts/release_record.json");
    let evaluation = get(
        get(
            get(&record, "evaluations"),
            "evaluate/payday-super-evidence/index.html",
        ),
        "version",
    );
    assert_eq!(text_of(evaluation), "0.1.3");
    assert!(
        read("evaluate/payday-super-evidence/index.html").contains("payday-super-checker/v0.1.3")
    );
    let fbt = read("rates/fbt-rate/index.html");
    assert!(fbt.contains("Read on 20 September 2026 from the ATO"));
    assert!(fbt.contains("citation check does not renew the historical table review"));

    // The join qualification keeps the other evidence limits.
    let tree = parse_structure(&read("tools/limitations/index.html"));
    let section = by_id(&tree, "psc-2");
    let text = tree.text(section);
    assert!(!text.contains("all operate correctly"));
    assert!(text.contains("receipt amount evidence") && text.contains("calendar and GIC coverage"));
    assert!(
        links(&tree, section)
            .iter()
            .any(|h| h.as_deref() == Some("/tools/payday-super/#receipt-amount"))
    );
    assert!(!index.contains("all operate correctly"));
}

#[test]
fn quarter_close_case_matches_its_native_evidence() {
    if !rendered() {
        return;
    }
    let receipt = json(&format!("{CASE}/native-verification.json"));
    let Json::Object(observed_by_month) = get(&receipt, "observed") else {
        panic!()
    };
    let observed: Vec<Json> = observed_by_month
        .iter()
        .flat_map(|(_, table)| match table {
            Json::Array(rows) => rows.clone(),
            _ => Vec::new(),
        })
        .collect();
    let rows: Vec<Json> = csv_rows(&format!("{CASE}/quarter-monthly.csv"))
        .iter()
        .map(|r| row_json(r))
        .collect();
    assert_eq!(text_of(get(&receipt, "status")), "passed");
    assert!(get(&receipt, "native_rows").py_eq(&Json::Int(9.into())));
    assert!(get(&receipt, "exact_fields").py_eq(&Json::Int(135.into())));
    assert_eq!(rows.len(), 9);
    assert_eq!(
        rows.iter()
            .map(|r| match r {
                Json::Object(p) => p.len(),
                _ => 0,
            })
            .sum::<usize>(),
        135
    );
    assert!(same_multiset(&rows, &observed));

    // Reader reports match the native inputs and projection.
    let months: Vec<&str> = observed_by_month.iter().map(|(k, _)| k.as_str()).collect();
    let mut sorted = months.clone();
    sorted.sort();
    assert_eq!(sorted, vec!["December", "November", "October"]);
    for (_, table) in observed_by_month {
        let Json::Array(table) = table else { panic!() };
        let mut cutoffs: Vec<String> = table.iter().map(|r| text_of(get(r, "Cutoff"))).collect();
        cutoffs.sort();
        cutoffs.dedup();
        assert_eq!(cutoffs.len(), 1);
        let name = format!("{}.json", cutoffs[0]);
        assert!(["2026-10-31.json", "2026-11-30.json", "2026-12-31.json"].contains(&name.as_str()));
        let raw = std::fs::read(root().join(CASE).join(&name)).unwrap();
        assert_eq!(
            site_tools::sha256(&raw),
            text_of(get(get(&receipt, "source_hashes"), &name))
        );
        let report = pyjson::loads_bytes(&raw).unwrap();
        let states = get(&report, "states");
        for (value, expected) in [
            (get(&report, "schema_version"), "forecast-reader-report.v1"),
            (get(&report, "currency"), "AUD"),
            (get(states, "calculation"), "RECONCILED"),
            (get(states, "close"), "REVIEW"),
            (get(states, "receipt_review"), "UNREVIEWED"),
            (
                get(get(&report, "review_record"), "decision"),
                "request_changes",
            ),
            (get(states, "source"), "provisional"),
            (get(&report, "authority"), "none"),
        ] {
            assert_eq!(text_of(value), expected);
        }
        let Json::Object(current) = get(&report, "current_values") else {
            panic!()
        };
        let mut expected = Vec::new();
        for (period, values) in current {
            let comparison = get(get(get(&report, "comparison"), "periods"), period);
            let difference = comparison
                .get("actual_less_budget")
                .or_else(|| comparison.get("forecast_less_budget"))
                .unwrap();
            let s = |v: &Json| v.clone();
            expected.push(Json::Object(vec![
                ("Cutoff".into(), s(get(&report, "cutoff"))),
                ("Period".into(), Json::Str(period.clone())),
                ("Basis".into(), s(get(comparison, "basis"))),
                ("CurrentCash".into(), s(get(values, "ending_cash"))),
                (
                    "OriginalCash".into(),
                    s(get(
                        get(get(&report, "budget_values"), period),
                        "ending_cash",
                    )),
                ),
                ("CashDifference".into(), s(get(difference, "ending_cash"))),
                ("Revenue".into(), s(get(values, "revenue"))),
                ("NetIncome".into(), s(get(values, "net_income"))),
                ("CloseState".into(), s(get(states, "close"))),
                ("CalculationState".into(), s(get(states, "calculation"))),
                ("ReceiptReview".into(), s(get(states, "receipt_review"))),
                (
                    "LaterReview".into(),
                    s(get(get(&report, "review_record"), "decision")),
                ),
                ("SourceState".into(), s(get(states, "source"))),
                ("Authority".into(), s(get(&report, "authority"))),
                ("ReceiptSHA256".into(), s(get(&report, "receipt_sha256"))),
            ]));
        }
        assert!(same_multiset(table, &expected));
    }

    // Visible cash rows and evidence boundaries.
    let tree = parse_structure(&read("evidence/index.html"));
    let sections: Vec<usize> = tree
        .descendants(Tree::ROOT, Some("section"), true)
        .into_iter()
        .filter(|s| tree.attr(*s, "aria-labelledby") == Some("quarter-close-to-forecast"))
        .collect();
    assert_eq!(sections.len(), 1);
    let section = sections[0];
    let visible: Vec<Vec<String>> = tree
        .descendants(section, Some("tr"), false)
        .into_iter()
        .filter(|row| !tree.descendants(*row, Some("td"), false).is_empty())
        .map(|row| cells(&tree, row))
        .collect();
    let mut expected = Vec::new();
    for month in ["October", "November", "December"] {
        let Some(Json::Array(table)) = get(&receipt, "observed").get(month) else {
            panic!()
        };
        let closed: Vec<&Json> = table
            .iter()
            .filter(|r| text_of(get(r, "Period")) == text_of(get(r, "Cutoff"))[..7])
            .collect();
        assert_eq!(closed.len(), 1);
        let row = closed[0];
        assert_eq!(text_of(get(row, "Basis")), "EVIDENCED_ACTUAL");
        expected.push(vec![
            month.to_owned(),
            money(&text_of(get(row, "CurrentCash"))),
            money(&text_of(get(row, "OriginalCash"))),
            money(&text_of(get(row, "CashDifference"))),
            text_of(get(row, "CloseState")),
        ]);
    }
    assert_eq!(visible, expected);
    let text = tree.text(section);
    for boundary in [
        "All business data, transactions and reviewers are fictional",
        "compare within a checkpoint and do not sum across checkpoints",
        "cash shortfall remains unattributed",
        "close marked REVIEW",
        "original receipt marked UNREVIEWED",
        "grants no action authority",
        "not accounting approval, a posting instruction or a compliance determination",
    ] {
        assert!(text.contains(boundary), "{boundary}");
    }

    // The download checksums cover all five evidence files.
    let sums = read(&format!("{CASE}/SHA256SUMS.txt"));
    let entries: Vec<(&str, &str)> = site_tools::py::splitlines(&sums)
        .into_iter()
        .map(|l| l.split_once("  ").unwrap())
        .collect();
    let mut names: Vec<&str> = entries.iter().map(|(_, n)| *n).collect();
    names.sort();
    assert_eq!(
        names,
        vec![
            "2026-10-31.json",
            "2026-11-30.json",
            "2026-12-31.json",
            "native-verification.json",
            "quarter-monthly.csv"
        ]
    );
    for (digest, name) in entries {
        assert!(site_tools::pyre::fullmatch("[0-9a-f]{64}", 0, digest));
        assert_eq!(
            site_tools::sha256(std::fs::read(root().join(CASE).join(name)).unwrap()),
            digest
        );
    }
}

fn dataset() -> Vec<(String, Json)> {
    let extract = json("scripts/rates_dataset_extract.json");
    assert!(site_tools::pyre::fullmatch(
        "[0-9a-f]{40}",
        0,
        &text_of(get(&extract, "commit"))
    ));
    let Json::Object(records) = get(&extract, "records") else {
        panic!()
    };
    records
        .iter()
        .map(|(name, record)| {
            assert!(site_tools::pyre::fullmatch(
                "[0-9a-f]{64}",
                0,
                &text_of(get(record, "sha256"))
            ));
            (name.clone(), get(record, "value").clone())
        })
        .collect()
}

fn value<'a>(values: &'a [(String, Json)], name: &str) -> &'a Json {
    &values.iter().find(|(k, _)| k == name).unwrap().1
}

fn fmt(spec: &str, value: &Json) -> String {
    site_tools::pyformat::format_value(value, spec).unwrap()
}

#[test]
fn rates_dataset_values() {
    if !rendered() {
        return;
    }
    let values = dataset();
    let rows = |path: &str| csv_rows(path);
    let year = |path: &str, column: &str| -> String {
        let rows = rows(path);
        field(
            rows.iter()
                .find(|r| field(r, "income_year") == "2026-27")
                .unwrap(),
            column,
        )
        .to_owned()
    };
    let fbt_rows = rows("rates/fbt-rate/fbt-rates.csv");
    let fbt = field(
        fbt_rows
            .iter()
            .find(|r| field(r, "fbt_year_ending") == "2027-03-31")
            .unwrap(),
        "fbt_rate_percent",
    )
    .to_owned();
    let sg_rows = rows("rates/super-guarantee/super-guarantee-rates.csv");
    let sg: Vec<_> = sg_rows
        .iter()
        .filter(|r| {
            field(r, "period_start") <= "2026-07-01"
                && (field(r, "period_end").is_empty() || "2026-07-01" <= field(r, "period_end"))
        })
        .collect();
    assert_eq!(sg.len(), 1);
    let pairs = [
        (
            "car-limit-2026-27",
            year("rates/car-limit/car-limit.csv", "car_limit"),
        ),
        (
            "cents-per-km-2026-27",
            year(
                "rates/cents-per-kilometre/cents-per-kilometre-rates.csv",
                "cents_per_km",
            ),
        ),
        (
            "div7a-benchmark-rate-2026-27",
            year(
                "rates/div7a-benchmark-rate/div7a-benchmark-rates.csv",
                "benchmark_rate_percent",
            ),
        ),
        ("fbt-rate", fbt),
        (
            "super-guarantee-rate-2026-27",
            field(sg[0], "general_sg_rate_percent").to_owned(),
        ),
    ];
    for (name, shown) in &pairs {
        assert_eq!(
            decimal(shown),
            decimal(&value(&values, name).py_str()),
            "{name}"
        );
    }

    // Each page's hand-written table shows the dataset values.
    for (name, page, label) in [
        ("car-limit-2026-27", "car-limit", "2026-27"),
        ("cents-per-km-2026-27", "cents-per-kilometre", "2026-27"),
        (
            "div7a-benchmark-rate-2026-27",
            "div7a-benchmark-rate",
            "2026-27",
        ),
        ("fbt-rate", "fbt-rate", "31 March 2027"),
        (
            "super-guarantee-rate-2026-27",
            "super-guarantee",
            "1 July 2025 onwards",
        ),
    ] {
        let rows = measure_rows(&read(&format!("rates/{page}/index.html")));
        let row = rows.iter().find(|r| r[0] == label).unwrap();
        let shown = re(r"[$,%]", 0).sub("", &row[1]);
        assert_eq!(
            decimal(&shown),
            decimal(&value(&values, name).py_str()),
            "{name}"
        );
    }

    // The checked question facts state the dataset values.
    let fact = |question: u32, topic: &str| {
        let page = read(&format!("tools/accounting-questions/{topic}/index.html"));
        let found = re(
            &format!(r#"<details class="question" id="q{question}".*?<strong>(.*?)</strong>"#),
            S,
        )
        .search(&page)
        .unwrap_or_else(|| panic!("question {question}"));
        site_tools::html::unescape(&found[1])
    };
    let figures = |text: &str| re(r"\$\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?%", 0).findall(text);
    let Json::Array(brackets) = value(&values, "resident-tax-rates-2026-27") else {
        panic!()
    };
    let first_taxed = brackets
        .iter()
        .find(|b| get(b, "marginal_rate").truthy())
        .unwrap();
    let mut scale = vec![format!("${}", fmt(",", get(first_taxed, "from")))];
    for bracket in brackets {
        if get(bracket, "to").truthy() {
            scale.push(format!("${}", fmt(",", get(bracket, "to"))));
        }
        if get(bracket, "marginal_rate").truthy() {
            scale.push(format!("{}%", get(bracket, "marginal_rate").py_str()));
        }
    }
    scale.push(format!(
        "{}%",
        value(&values, "medicare-levy-rate").py_str()
    ));
    let expected = [
        ((1, "general-tax"), scale),
        (
            (20, "deductions"),
            vec![format!(
                "${}",
                fmt(",", value(&values, "instant-asset-write-off-threshold"))
            )],
        ),
        (
            (32, "gst-bas"),
            vec![format!(
                "${}",
                fmt(",", value(&values, "gst-registration-threshold"))
            )],
        ),
        (
            (84, "company-compliance"),
            vec![format!(
                "{}%",
                value(&values, "div7a-benchmark-rate-2026-27").py_str()
            )],
        ),
    ];
    for ((question, topic), wanted) in expected {
        let found = figures(&fact(question, topic));
        for figure in wanted {
            assert!(
                found.contains(&figure),
                "question {question}: {figure} not in {found:?}"
            );
        }
    }
}

#[test]
fn rates_hub_queries_type_every_csv_column() {
    if !rendered() {
        return;
    }
    // Each Power Query block names one published CSV and types each of its
    // columns in order, so a renamed or added column fails here, not in Excel.
    let blocks = re(
        r#"aria-label="Power Query import for [^"]+"><code>(.*?)</code>"#,
        S,
    )
    .findall(&read("rates/index.html"));
    // ROOT.glob("rates/*/*.csv"), as sorted relative paths.
    let mut csvs = Vec::new();
    for directory in std::fs::read_dir(root().join("rates")).unwrap().flatten() {
        if !directory.path().is_dir() {
            continue;
        }
        for file in std::fs::read_dir(directory.path()).unwrap().flatten() {
            let name = file.file_name().to_string_lossy().into_owned();
            if file.path().is_file() && site_tools::glob_suffix(&name, ".csv") {
                csvs.push(format!(
                    "rates/{}/{name}",
                    directory.file_name().to_string_lossy()
                ));
            }
        }
    }
    csvs.sort();
    let mut queried = Vec::new();
    for block in &blocks {
        let urls = re(r#"Web\.Contents\("https://duguid\.com\.au/([^"]+)"\)"#, 0).findall(block);
        assert_eq!(urls.len(), 1, "{block}");
        let url = &urls[0];
        let header = pycsv::reader(&read(url)).unwrap().remove(0);
        assert_eq!(re(r#"\{"(\w+)", "#, 0).findall(block), header, "{url}");
        // Csv.Document loads every column unless a Columns option caps or renames them.
        for columns in re(r"\bColumns\s*=\s*([^,\]]*)", 0).findall(block) {
            assert_eq!(columns.trim(), header.len().to_string(), "{url}");
        }
        queried.push(url.clone());
    }
    queried.sort();
    assert_eq!(queried, csvs);
}

/// What a rate page must state, from the latest row of its CSV.
struct RateFact {
    year: String,
    value: String,
    /// Every distinct `checked_at`, sorted.
    checked: Vec<String>,
    /// The date and label of each group a page checks separately; empty for one table.
    scopes: Vec<(String, String)>,
}

/// History a byline keeps beside the CSV's own date.
const RATE_HISTORY: [(&str, &str); 2] = [
    (
        "super-guarantee",
        "rechecked against the ATO on 14 September 2026.",
    ),
    (
        "div7a-benchmark-rate",
        "rechecked against the ATO benchmark rate table on 14 September 2026.",
    ),
];

/// The Australian income year holding an ISO date: 2026-11-03 is in 2026-27.
fn income_year(date: &str) -> String {
    let year: u32 = date[..4].parse().unwrap();
    let start = if &date[5..7] >= "07" { year } else { year - 1 };
    format!("{start}-{:02}", (start + 1) % 100)
}

fn percent(value: &str) -> String {
    let value = if value.contains('.') {
        value.trim_end_matches('0').trim_end_matches('.')
    } else {
        value
    };
    format!("{value}%")
}

fn latest<'a>(
    rows: &'a [Vec<(String, Option<String>)>],
    column: &str,
) -> &'a [(String, Option<String>)] {
    rows.iter()
        .max_by_key(|r| field(r, column).to_owned())
        .unwrap()
}

fn rate_fact(slug: &str) -> RateFact {
    let by_income_year =
        |rows: &[Vec<(String, Option<String>)>], column: &str, shown: fn(&str) -> String| {
            let row = latest(rows, "income_year");
            (
                field(row, "income_year").to_owned(),
                shown(field(row, column)),
            )
        };
    let dollars = |value: &str| money(value).trim_end_matches(".00").to_owned();
    let (rows, (year, value)) = match slug {
        "super-guarantee" => {
            let rows = csv_rows("rates/super-guarantee/super-guarantee-rates.csv");
            let row = latest(&rows, "period_start");
            // An open-ended row reaches the year it was last checked in.
            let last = match field(row, "period_end") {
                "" => field(row, "checked_at"),
                end => end,
            };
            let fact = (
                income_year(last),
                percent(field(row, "general_sg_rate_percent")),
            );
            (rows, fact)
        }
        "div7a-benchmark-rate" => {
            let rows = csv_rows("rates/div7a-benchmark-rate/div7a-benchmark-rates.csv");
            let fact = by_income_year(&rows, "benchmark_rate_percent", percent);
            (rows, fact)
        }
        "cents-per-kilometre" => {
            let rows = csv_rows("rates/cents-per-kilometre/cents-per-kilometre-rates.csv");
            let fact = by_income_year(&rows, "cents_per_km", |v| format!("{v} cents"));
            (rows, fact)
        }
        "maximum-contribution-base" => {
            let rows = csv_rows("rates/maximum-contribution-base/maximum-contribution-base.csv");
            let fact = by_income_year(&rows, "maximum_contribution_base", dollars);
            (rows, fact)
        }
        "car-limit" => {
            let rows = csv_rows("rates/car-limit/car-limit.csv");
            let fact = by_income_year(&rows, "car_limit", dollars);
            (rows, fact)
        }
        "fbt-rate" => {
            let rows = csv_rows("rates/fbt-rate/fbt-rates.csv");
            let row = latest(&rows, "fbt_year_ending");
            let fact = (
                format_date(field(row, "fbt_year_ending")),
                percent(field(row, "fbt_rate_percent")),
            );
            (rows, fact)
        }
        "announced-not-yet-law" => {
            let rows = csv_rows("rates/announced-not-yet-law/announced-measures.csv");
            let tbd = rows.iter().filter(|r| field(r, "status") == "TBD").count();
            let budget = rows
                .iter()
                .map(|r| field(r, "announced_in").rsplit(' ').next().unwrap())
                .max()
                .unwrap()
                .to_owned();
            (rows, (budget, format!("{tbd} TBD")))
        }
        other => panic!("no CSV rule for {other}"),
    };
    let mut checked: Vec<String> = rows
        .iter()
        .map(|r| field(r, "checked_at").to_owned())
        .collect();
    checked.sort();
    checked.dedup();
    // Announced rows fall into 2 groups, each checked on its own day.
    let scopes = if slug == "announced-not-yet-law" {
        [("pending measures", false), ("legislated measures", true)]
            .map(|(scope, legislated)| {
                let mut dates: Vec<&str> = rows
                    .iter()
                    .filter(|r| {
                        field(r, "status").starts_with("ATO-reported legislation") == legislated
                    })
                    .map(|r| field(r, "checked_at"))
                    .collect();
                dates.sort_unstable();
                dates.dedup();
                assert_eq!(dates.len(), 1, "{scope}: {dates:?}");
                (dates[0].to_owned(), scope.to_owned())
            })
            .to_vec()
    } else {
        Vec::new()
    };
    RateFact {
        year,
        value,
        checked,
        scopes,
    }
}

/// The first rate, amount or count in a summary: the answer, whatever follows it.
fn first_figure(text: &str) -> Option<String> {
    re(r"\$[\d,]+|\d+(?:\.\d+)?%|\d+ cents|\d+ TBD", 0)
        .search(text)
        .map(|m| m[0].to_owned())
}

/// Where a title stops asking for the CSV's year or answering with its value.
fn title_failures(title: &str, fact: &RateFact) -> Vec<String> {
    let mut failures = Vec::new();
    let asked = ["for", "in", "ending", "Budget"]
        .iter()
        .any(|word| title.contains(&format!("{word} {}?", fact.year)));
    if !asked {
        failures.push(format!("title lacks {}: {title}", fact.year));
    }
    if !title.ends_with(&format!("? {}", fact.value)) {
        failures.push(format!("title lacks {}: {title}", fact.value));
    }
    if title.chars().count() > TITLE_MAX {
        failures.push(format!("title is over {TITLE_MAX}: {title}"));
    }
    failures
}

fn scope_failures(shown: &str, fact: &RateFact) -> Vec<String> {
    let shown = shown.split_whitespace().collect::<Vec<_>>().join(" ");
    fact.scopes
        .iter()
        .map(|(date, scope)| format!("{} for {scope}", format_date(date)))
        .filter(|expected| !shown.contains(expected))
        .map(|expected| format!("dates lack {expected}"))
        .collect()
}

/// Where a rate page's `index.txt` disagrees with the facts from its CSV.
fn rate_text_failures(text: &str, fact: &RateFact) -> Vec<String> {
    let title = text.lines().next().unwrap_or_default();
    let mut failures = title_failures(title.strip_prefix("# ").unwrap_or(title), fact);
    if !text.lines().any(|line| line == fact.value) {
        failures.push(format!("index.txt headline is not {}", fact.value));
    }
    let shown: Vec<String> = fact.checked.iter().map(|d| format_date(d)).collect();
    let dates = re(r"Source checked (\d{1,2} [A-Z][a-z]+ \d{4})", 0).findall(text);
    if dates != shown {
        failures.push(format!(
            "index.txt Source checked {dates:?} disagrees with the CSV {shown:?}"
        ));
    }
    failures.extend(scope_failures(text, fact));
    failures
}

/// The `rates/*/index.html` pages under `root`, sorted.
fn rate_page_glob(root: &std::path::Path) -> Vec<String> {
    let mut pages: Vec<String> = std::fs::read_dir(root.join("rates"))
        .unwrap()
        .flatten()
        .filter(|entry| entry.path().join("index.html").is_file())
        .map(|entry| format!("rates/{}/index.html", entry.file_name().to_string_lossy()))
        .collect();
    pages.sort();
    pages
}

/// Each `<time>` under `parent`, as its datetime, or a failure if its text shows another date.
fn shown_dates(tree: &Tree, parent: usize, failures: &mut Vec<String>) -> Vec<String> {
    let mut dates = Vec::new();
    for time in tree.descendants(parent, Some("time"), false) {
        let iso = tree.attr(time, "datetime").unwrap_or_default().to_owned();
        if tree.text(time) != format_date(&iso) {
            failures.push(format!("{iso} is shown as {}", tree.text(time)));
        }
        dates.push(iso);
    }
    dates
}

/// The labelled date in a page-meta line, as its datetime.
fn labelled_dates(meta: &str, label: &str) -> Vec<String> {
    re(&format!(r#"{label} <time datetime="([^"]*)""#), 0).findall(meta)
}

/// Where a rate page or its index entry disagrees with the facts from its CSV.
fn rate_page_failures(slug: &str, html: &str, index: &str, fact: &RateFact) -> Vec<String> {
    let mut failures = Vec::new();
    let title = re(r"<title>(.*?)</title>", S)
        .search(html)
        .map_or(String::new(), |m| m[1].to_owned());
    failures.extend(title_failures(&title, fact));

    let tree = parse_structure(html);
    let classed = |tree: &Tree, parent: usize, class: &str| -> Vec<usize> {
        tree.descendants(parent, None, false)
            .into_iter()
            .filter(|e| tree.has_class(*e, class))
            .collect()
    };
    let headlines: Vec<String> = classed(&tree, Tree::ROOT, "rate-entry__value")
        .into_iter()
        .map(|e| tree.text(e))
        .collect();
    if headlines != [fact.value.as_str()] {
        failures.push(format!("headline is {headlines:?}, not {}", fact.value));
    }

    let blocks = site_tools::seo_core::json_ld_blocks(html, slug, &mut Vec::new());
    let nodes = || blocks.iter().flat_map(site_tools::seo_core::nodes);
    let structured =
        |key: &str| -> Vec<String> { nodes().filter_map(|n| n.get(key)).map(text_of).collect() };
    let web_page = |key: &str| -> String {
        nodes()
            .find(|n| n.get("@type").is_some_and(|t| text_of(t) == "WebPage"))
            .and_then(|n| n.get(key))
            .map_or(String::new(), text_of)
    };
    if web_page("name") != title {
        failures.push(format!(
            "WebPage name {} differs from the title",
            web_page("name")
        ));
    }
    let summaries = [
        ("WebPage description", web_page("description")),
        (
            "meta description",
            site_tools::seo_core::meta(html, "name", "description").unwrap_or_default(),
        ),
        (
            "short answer",
            classed(&tree, Tree::ROOT, "short-answer")
                .first()
                .map_or(String::new(), |e| tree.text(*e)),
        ),
    ];
    for (name, summary) in &summaries {
        if first_figure(summary).as_ref() != Some(&fact.value) {
            failures.push(format!(
                "{name} does not lead with {}: {summary}",
                fact.value
            ));
        }
    }
    let metas = classed(&tree, Tree::ROOT, "page-meta");
    let Some(raw) = re(r#"<p class="page-meta">(.*?)</p>"#, S).search(html) else {
        failures.push("no page-meta line".to_owned());
        return failures;
    };
    if metas.len() != 1 {
        failures.push(format!(
            "expected one page-meta line, found {}",
            metas.len()
        ));
    }
    shown_dates(&tree, metas[0], &mut failures);
    let source_checked = labelled_dates(&raw[1], "Source checked");
    if source_checked != fact.checked {
        failures.push(format!(
            "Source checked {source_checked:?} disagrees with the CSV's checked_at {:?}",
            fact.checked
        ));
    }
    failures.extend(scope_failures(&tree.text(metas[0]), fact));
    // A content change moves dateModified; only an editorial check moves Last reviewed.
    let reviewed = labelled_dates(&raw[1], "Last reviewed");
    let modified = structured("dateModified");
    if modified.is_empty() || modified.iter().any(|d| *d != modified[0]) {
        failures.push(format!("dateModified is {modified:?}"));
    }
    if reviewed.len() != 1 {
        failures.push(format!("Last reviewed is {reviewed:?}"));
    }
    for (label, dates) in [("Last reviewed", &reviewed), ("dateModified", &modified)] {
        for value in dates {
            if site_tools::py::Date::fromisoformat(value)
                .is_none_or(|date| date.isoformat() != *value)
            {
                failures.push(format!(
                    "{label} {value:?} is not a calendar date in YYYY-MM-DD form"
                ));
            }
        }
    }
    if labelled_dates(&raw[1], "Published") != structured("datePublished") {
        failures.push("Published differs from datePublished".to_owned());
    }

    let text = site_tools::seo_core::visible_text(html);
    let shown: Vec<String> = fact.checked.iter().map(|d| format_date(d)).collect();
    let notes = re(r"every row was rechecked on (\d{1,2} [A-Z][a-z]+ \d{4})", 0).findall(&text);
    if fact.scopes.is_empty() && notes.len() != 1 {
        failures.push(format!("expected one CSV note, found {notes:?}"));
    }
    for date in notes {
        if !shown.contains(&date) {
            failures.push(format!("CSV note says {date}, not {shown:?}"));
        }
    }
    for (_, sentence) in RATE_HISTORY.iter().filter(|(page, _)| *page == slug) {
        if !text.contains(sentence) {
            failures.push(format!("byline lacks: {sentence}"));
        }
    }
    if text.contains("Verified") || text.contains("verification date") {
        failures.push("page still says Verified".to_owned());
    }

    let href = format!("/rates/{slug}/");
    let tree = parse_structure(index);
    let entries: Vec<usize> = classed(&tree, Tree::ROOT, "rate-entry")
        .into_iter()
        .filter(|e| links(&tree, *e).contains(&Some(href.clone())))
        .collect();
    let [entry] = entries[..] else {
        failures.push(format!("expected one index entry, found {}", entries.len()));
        return failures;
    };
    let values: Vec<String> = classed(&tree, entry, "rate-entry__value")
        .into_iter()
        .map(|e| tree.text(e))
        .collect();
    if values != [fact.value.as_str()] {
        failures.push(format!("index value is {values:?}, not {}", fact.value));
    }
    failures.extend(scope_failures(&tree.text(entry), fact));
    let dates = shown_dates(&tree, entry, &mut failures);
    if dates != fact.checked {
        failures.push(format!(
            "index dates {dates:?} disagree with the CSV's checked_at {:?}",
            fact.checked
        ));
    }
    failures
}

#[test]
fn rate_pages_state_their_csv_year_value_and_dates() {
    if !rendered() {
        return;
    }
    let index = read("rates/index.html");
    let mut failures = Vec::new();
    if site_tools::seo_core::visible_text(&index).contains("Verified") {
        failures.push("rates index still says Verified".to_owned());
    }
    for rel in RATE_PAGES {
        let slug = rel.split('/').nth(1).unwrap();
        let fact = rate_fact(slug);
        let text = read(&rel.replace("index.html", "index.txt"));
        for failure in rate_page_failures(slug, &read(rel), &index, &fact)
            .into_iter()
            .chain(rate_text_failures(&text, &fact))
        {
            failures.push(format!("{slug}: {failure}"));
        }
    }
    assert!(failures.is_empty(), "{failures:#?}");
}

#[test]
fn rates_hub_modification_date_covers_content_changes() {
    assert!(rendered(), "rates hub dates require a rendered site");
    let page = read("rates/index.html");
    let mut failures = Vec::new();
    let blocks = site_tools::seo_core::json_ld_blocks(&page, "rates/index.html", &mut failures);
    assert!(failures.is_empty(), "{failures:?}");
    let dates: Vec<_> = blocks
        .iter()
        .flat_map(site_tools::seo_core::nodes)
        .filter(|node| {
            node.get("@type")
                .is_some_and(|value| text_of(value) == "WebPage")
        })
        .map(|node| text_of(get(node, "dateModified")))
        .collect();
    assert_eq!(dates.len(), 1, "rates hub modification dates: {dates:?}");
    // The editorial explanation changed on 7 November in Australia/Sydney.
    assert!(
        dates[0].as_str() >= "2026-11-07",
        "dateModified {} predates the rates hub content changes",
        dates[0]
    );
    let sitemap = read("sitemap.xml");
    let sitemap = roxmltree::Document::parse(&sitemap).unwrap();
    let entry = sitemap
        .descendants()
        .find(|node| {
            node.has_tag_name("loc") && node.text() == Some("https://duguid.com.au/rates/")
        })
        .unwrap()
        .parent()
        .unwrap();
    let lastmod = entry
        .children()
        .find(|node| node.has_tag_name("lastmod"))
        .and_then(|node| node.text())
        .unwrap();
    assert_eq!(
        lastmod, dates[0],
        "sitemap and rates hub modification dates"
    );
}

#[test]
fn rate_page_list_matches_the_pages_on_disk() {
    if !rendered() {
        return;
    }
    let mut listed = RATE_PAGES.map(str::to_owned).to_vec();
    listed.sort();
    assert_eq!(rate_page_glob(root()), listed);

    let site = copied_site();
    let extra = site.path().join("rates/a-new-table");
    std::fs::create_dir_all(&extra).unwrap();
    std::fs::write(extra.join("index.html"), "").unwrap();
    assert_ne!(rate_page_glob(site.path()), listed);
}

#[test]
fn rate_page_review_can_advance_without_a_content_change() {
    if !rendered() {
        return;
    }
    let slug = "super-guarantee";
    let page = read("rates/super-guarantee/index.html");
    let reviewed = re(r#"Last reviewed <time datetime="[^"]*">[^<]*</time>"#, 0).sub(
        r#"Last reviewed <time datetime="2026-11-07">7 November 2026</time>"#,
        &page,
    );
    assert_ne!(reviewed, page, "the fixture must advance its review date");
    let failures = rate_page_failures(slug, &reviewed, &read("rates/index.html"), &rate_fact(slug));
    assert!(failures.is_empty(), "{failures:#?}");
}

#[test]
fn rate_page_contract_catches_a_stale_title_or_date() {
    if !rendered() {
        return;
    }
    let slug = "super-guarantee";
    let (page, index) = (
        read("rates/super-guarantee/index.html"),
        read("rates/index.html"),
    );
    let fact = rate_fact(slug);
    let (year, value, iso) = (&fact.year, &fact.value, &fact.checked[0]);
    let shown = format_date(iso);
    let stamp = format!(r#"<time datetime="{iso}">{shown}</time>"#);
    let wrong = r#"<time datetime="2001-01-02">2 January 2001</time>"#;
    let cases = [
        (
            format!("{year}? {value}</title>"),
            format!("2001-02? {value}</title>"),
            format!("title lacks {year}"),
        ),
        (
            format!("{year}? {value}</title>"),
            format!("{year}? 1%</title>"),
            format!("title lacks {value}"),
        ),
        (
            format!("{year}? {value}</title>"),
            format!("{year}? 1{value}</title>"),
            format!("title lacks {value}"),
        ),
        (
            format!("for {year}? {value}</title>"),
            format!("before {year}? {value}</title>"),
            format!("title lacks {year}"),
        ),
        (
            format!(r#""name": "What is the super guarantee rate for {year}? {value}""#),
            r#""name": "Another name""#.to_owned(),
            "WebPage name".to_owned(),
        ),
        (
            format!("The general super guarantee rate is {value}."),
            "The general super guarantee rate is 1%.".to_owned(),
            "short answer does not lead".to_owned(),
        ),
        (
            format!("It has been {value} since"),
            "It has been 1% since".to_owned(),
            "description does not lead".to_owned(),
        ),
        (
            "every row was rechecked on".to_owned(),
            "all rows were rechecked on".to_owned(),
            "expected one CSV note".to_owned(),
        ),
        (
            "rechecked against the ATO on 14 September 2026.".to_owned(),
            "rechecked against the ATO on 2 January 2001.".to_owned(),
            "byline lacks".to_owned(),
        ),
        (
            format!(r#"rate-entry__value">{value}</p>"#),
            r#"rate-entry__value">1%</p>"#.to_owned(),
            "headline is".to_owned(),
        ),
        (
            format!("Source checked {stamp}"),
            format!("Source checked {wrong}"),
            "disagrees with the CSV".to_owned(),
        ),
        (
            format!("Source checked {stamp}"),
            format!(r#"Source checked <time datetime="{iso}">2 January 2001</time>"#),
            "is shown as 2 January 2001".to_owned(),
        ),
        (
            format!("every row was rechecked on {shown}"),
            "every row was rechecked on 2 January 2001".to_owned(),
            "CSV note says 2 January 2001".to_owned(),
        ),
    ];
    for (from, to, expected) in &cases {
        assert!(page.contains(from.as_str()), "{from}");
        let failures = rate_page_failures(slug, &page.replace(from, to), &index, &fact);
        assert!(
            failures.iter().any(|f| f.contains(expected.as_str())),
            "{expected}: {failures:#?}"
        );
    }

    let undated = re(r#""dateModified": "[^"]*",?"#, 0).sub("", &page);
    let failures = rate_page_failures(slug, &undated, &index, &fact);
    assert!(
        failures.iter().any(|f| f.contains("dateModified is []")),
        "{failures:#?}"
    );

    for invalid in ["", "2026-02-30", "not-a-date", "20261106"] {
        let malformed = re(r#""dateModified": "[^"]*""#, 0)
            .sub(&format!(r#""dateModified": "{invalid}""#), &page);
        let failures = rate_page_failures(slug, &malformed, &index, &fact);
        assert!(
            failures
                .iter()
                .any(|f| f.contains("dateModified") && f.contains("not a calendar date")),
            "{invalid:?}: {failures:#?}"
        );
    }

    let malformed = re(r#"Last reviewed <time datetime="[^"]*">[^<]*</time>"#, 0).sub(
        r#"Last reviewed <time datetime="2026-02-30">30 February 2026</time>"#,
        &page,
    );
    let failures = rate_page_failures(slug, &malformed, &index, &fact);
    assert!(
        failures
            .iter()
            .any(|f| f.contains("Last reviewed") && f.contains("not a calendar date")),
        "{failures:#?}"
    );

    let text = read("rates/super-guarantee/index.txt");
    assert!(rate_text_failures(&text, &fact).is_empty());
    for (from, to, expected) in [
        (format!("? {value}\n"), "? 1%\n".to_owned(), "title lacks"),
        (
            format!("\n{value}\n"),
            "\n1%\n".to_owned(),
            "headline is not",
        ),
        (
            format!("Source checked {shown}"),
            "Source checked 2 January 2001".to_owned(),
            "disagrees with the CSV",
        ),
    ] {
        assert!(text.contains(&from), "{from}");
        let failures = rate_text_failures(&text.replacen(&from, &to, 1), &fact);
        assert!(
            failures.iter().any(|f| f.contains(expected)),
            "{expected}: {failures:#?}"
        );
    }

    // Swapped labels on the announced page and its index entry fail, in either file.
    let slug = "announced-not-yet-law";
    let (page, fact) = (
        read("rates/announced-not-yet-law/index.html"),
        rate_fact(slug),
    );
    assert!(rate_page_failures(slug, &page, &index, &fact).is_empty());
    let swap = |text: &str| {
        text.replace("for pending measures", "for GROUP")
            .replace("for legislated measures", "for pending measures")
            .replace("for GROUP", "for legislated measures")
    };
    for failures in [
        rate_page_failures(slug, &swap(&page), &index, &fact),
        rate_page_failures(slug, &page, &swap(&index), &fact),
        rate_text_failures(&swap(&read("rates/announced-not-yet-law/index.txt")), &fact),
    ] {
        assert!(
            failures.iter().any(|f| f.contains("dates lack")),
            "{failures:#?}"
        );
    }

    let slug = "div7a-benchmark-rate";
    let (page, fact) = (
        read("rates/div7a-benchmark-rate/index.html"),
        rate_fact(slug),
    );
    let wrong_date = page.replace(
        "benchmark rate table</a> on 14 September 2026.",
        "benchmark rate table</a> on 2 January 2001.",
    );
    assert_ne!(wrong_date, page);
    let failures = rate_page_failures(slug, &wrong_date, &index, &fact);
    assert!(
        failures.iter().any(|f| f.contains("byline lacks")),
        "{failures:#?}"
    );
    let stale = page.replace(
        "benchmark rate table</a> on 14 September 2026.",
        "benchmark rate table</a> on 14 September 2026; the earlier rows retain their original review date.",
    );
    assert_ne!(stale, page);
    let failures = rate_page_failures(slug, &stale, &index, &fact);
    assert!(
        failures.iter().any(|f| f.contains("byline lacks")),
        "{failures:#?}"
    );

    // A new CSV row moves the facts: the unchanged page and index then fail.
    let slug = "super-guarantee";
    let page = read("rates/super-guarantee/index.html");
    let moved = RateFact {
        year: "2099-00".to_owned(),
        value: "99%".to_owned(),
        checked: vec!["2099-07-01".to_owned()],
        scopes: Vec::new(),
    };
    let failures = rate_page_failures(slug, &page, &index, &moved);
    for expected in [
        "title lacks 2099-00",
        "title lacks 99%",
        "headline is",
        "disagrees with the CSV",
        "index value is",
        "index dates",
    ] {
        assert!(
            failures.iter().any(|f| f.contains(expected)),
            "{expected}: {failures:#?}"
        );
    }
}

#[test]
fn money_formats_like_decimal() {
    assert_eq!(money("1234.5"), "$1,234.50");
    assert_eq!(money("-1234.565"), "-$1,234.56");
    assert_eq!(money("0.125"), "$0.12");
    assert_eq!(money("1000000"), "$1,000,000.00");
}

/// Whether the page's software issue paragraph has an anchor to `form` with link text.
fn issue_paragraph_links(html: &str, form: &str) -> bool {
    let (mut inside_p, mut in_paragraph, mut in_anchor) = (false, false, false);
    for positioned in htmlparser::parse(html, true) {
        match positioned.event {
            Event::StartTag(tag, _) if tag == "p" => inside_p = true,
            Event::Data(text)
                if inside_p && text.starts_with("Software issue using fictional data? ") =>
            {
                in_paragraph = true;
            }
            Event::Data(text) if in_anchor && !text.trim().is_empty() => return true,
            Event::StartTag(tag, attributes) if in_paragraph && tag == "a" => {
                in_anchor = attributes
                    .iter()
                    .any(|(name, value)| name == "href" && value.as_deref() == Some(form));
            }
            Event::EndTag(tag) if tag == "a" => in_anchor = false,
            Event::EndTag(tag) if tag == "p" => (inside_p, in_paragraph) = (false, false),
            _ => {}
        }
    }
    false
}

const CORRECTION_FORM: &str =
    "https://github.com/ryanduguid/ryanduguid.github.io/issues/new?template=content_correction.yml";

fn issue_line(body: &str) -> String {
    format!("<p>Software issue using fictional data? {body}</p>")
}

#[test]
fn a_form_address_in_an_inert_span_is_not_a_link() {
    let form = CORRECTION_FORM;
    assert!(issue_paragraph_links(
        &issue_line(&format!(r#"<a href="{form}">Report it</a>"#)),
        form
    ));
    assert!(!issue_paragraph_links(
        &issue_line(&format!("<span>{form}</span>")),
        form
    ));
}

#[test]
fn the_sentence_and_link_outside_a_paragraph_are_not_the_paragraph() {
    let form = CORRECTION_FORM;
    assert!(!issue_paragraph_links(
        &format!(
            r#"<div>Software issue using fictional data? <a href="{form}">Report it</a></div>"#
        ),
        form
    ));
}

#[test]
fn a_commented_out_anchor_is_not_a_link() {
    let form = CORRECTION_FORM;
    assert!(!issue_paragraph_links(
        &issue_line(&format!(r#"<!-- <a href="{form}">Report it</a> -->"#)),
        form
    ));
}

#[test]
fn an_empty_anchor_before_unlinked_text_is_not_a_link() {
    let form = CORRECTION_FORM;
    assert!(!issue_paragraph_links(
        &issue_line(&format!(r#"<a href="{form}"></a> Report it"#)),
        form
    ));
}

#[test]
fn a_reader_can_reach_the_correction_form_from_each_tool_and_the_contact_page() {
    let form = CORRECTION_FORM;
    assert!(read("contact/index.html").contains(&format!(
        r#"<a href="{form}">Report a wrong rate, date or rule</a>"#
    )));
    assert!(read("tools/limitations/index.html").contains(&format!(r#"<a href="{form}">"#)));
    assert!(read("contact/index.html").contains(
        "The form is public: leave out tax file numbers and other taxpayer identifiers, \
         client records, credentials and confidential attachments."
    ));
    for tool in [
        "ato-benchmarks",
        "australian-tax-ai-agents",
        "coal-lsl-levy",
        "company-tax-franking",
        "monthly-close-controls",
        "subcontractor-ledgers",
        "trust-distributions",
        "wip-schedule",
        "workpaper-review-gate",
        "xero-trial-balance",
    ] {
        assert!(
            issue_paragraph_links(&read(&format!("tools/{tool}/index.html")), form),
            "{tool}"
        );
    }
}

#[test]
fn the_method_section_states_the_hold_on_a_dead_ato_page() {
    let days = site_tools::ato_sources::DEAD_HOLD_DAYS;
    assert!(
        read("tools/limitations/index.html")
            .contains(&format!("a read at least {days} days later agrees"))
    );
}

#[test]
fn the_xero_install_note_states_the_starter_limits_and_the_paid_plans_page() {
    let html = read("tools/xero-trial-balance/index.html");
    assert!(html.contains("up to 5 connections, at 1,000 API calls a day per organisation"));
    assert!(html.contains(r#"<a href="/works-with/xero/">"#));
    assert!(!html.contains("a free Xero developer app"));
}

#[test]
fn calculator_pages_show_every_boundary_case_the_node_tests_run() {
    if !rendered() {
        return;
    }
    let cases: serde_json::Value =
        serde_json::from_str(include_str!("../../_data/calculator_cases.json")).unwrap();
    for (page, calculator) in cases.as_object().unwrap() {
        let html = read(&format!("tools/business-calculators/{page}/index.html"));
        let rows = calculator["rows"].as_array().unwrap();
        assert!(rows.len() >= 2, "{page}");
        if let Some(peer) = calculator["peer"].as_object() {
            let cell = |name: &str| peer[name].as_str().unwrap();
            assert!(
                html.contains(&format!(
                    r#"for {}, the <a href="{}">{}</a> gave {}, and this calculator gave {}. {}."#,
                    cell("input"),
                    cell("url"),
                    cell("name"),
                    cell("peer_result"),
                    cell("output"),
                    cell("verdict")
                )),
                "{page}"
            );
        }
        for row in rows {
            let cell = |name: &str| row[name].as_str().unwrap();
            let shown = format!(
                r#"<tr><th scope="row">{}</th><td>{}</td><td>{}</td></tr>"#,
                cell("case"),
                cell("input"),
                cell("output")
            );
            assert!(html.contains(&shown), "{page}: {shown}");
        }
    }
}

#[test]
fn evidence_results_name_published_releases_limits_and_read_dates() {
    let tree = parse_structure(&read("evidence/index.html"));
    let section = tree
        .descendants(Tree::ROOT, Some("section"), true)
        .into_iter()
        .find(|s| tree.attr(*s, "aria-labelledby") == Some("results-you-can-check"))
        .unwrap();
    let text = tree.text(section);
    let record = json("scripts/release_record.json");
    let components = get(&record, "components");
    let published = |name: &str| text_of(get(get(get(components, name), "published"), "version"));
    let div7a = text_of(get(
        get(get(components, "aus-accounting-mcp"), "pinned_engines"),
        "div7a-loan-review",
    ));
    // The tool counts are dated readings of a package outside this repository: this holds their
    // wording and date, not the counts.
    for claim in [
        format!(
            "Aus Accounting MCP {}, the published release",
            published("aus-accounting-mcp")
        ),
        format!("Its repayment code and rate table are unchanged to the published {div7a}"),
        "listed 22 local tools on 5 November 2026. The source on main defines 24: validate_abn and validate_acn are not yet released".to_owned(),
        format!(
            "payday-super-check {} gives a due date of 11 August 2026",
            published("payday-super-checker")
        ),
        "12,800 fictional cases with no repayments".to_owned(),
        "covers the repayment figure only".to_owned(),
        "not a registered tax or BAS agent, does not lodge and holds no third-party certification"
            .to_owned(),
        "not rerun on later releases or the unreleased Rust port".to_owned(),
        "a Coal LSL calculator that I built and host as an external contributor".to_owned(),
    ] {
        assert!(text.contains(&claim), "{claim}");
    }
    let lists = tree.descendants(section, Some("ul"), false);
    assert_eq!(lists.len(), 2);
    let rivals = tree.descendants(lists[1], Some("li"), false);
    assert_eq!(rivals.len(), 3);
    for rival in rivals {
        let line = tree.text(rival);
        assert!(
            re(r"Read \d{1,2} [A-Z][a-z]+ \d{4}\.\s*$", 0).is_match(&line),
            "{line}"
        );
    }
}
