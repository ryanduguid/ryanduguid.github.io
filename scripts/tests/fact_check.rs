//! scripts/test_fact_check.py: offline checks for source attribution, evidence
//! qualifications and the rates dataset values, against the rendered checked tree.
mod common;

use common::{rendered, root};
use site_tools::pycsv;
use site_tools::pyjson::{self, Json};
use site_tools::pyre::{S, re};
use site_tools::seo_core::{Tree, parse_structure};

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
    assert!(summary.contains(&format!("{} as TBD", count("TBD"))));
    assert_eq!(count("Various"), 1);
    assert!(summary.contains("one as Various"));
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
        "0.1.6",
        "0.1.5",
        "matched_amount",
        "remitted_amount",
        "ON_TIME",
        "UNPAID",
        "0.1.7",
        "Neither field authenticates",
    ] {
        assert!(text.contains(term), "{term}");
    }
    let main = by_id(&tree, "main");
    let header = tree.descendants(main, Some("header"), false)[0];
    assert!(
        links(&tree, header)
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
        "0.1.6",
        "31 December 2026",
        "--allow-stale-gic",
        "0.1.7",
        "Not assessed",
        "a PyPI install does not install the workbook",
        "BLOCKED",
    ] {
        assert!(text.contains(boundary), "{boundary}");
    }
    assert!(links(&tree, section).iter().any(|h| {
        h.as_deref()
            .unwrap_or("")
            .contains("payday-super-checker/v0.1.6/")
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
        "Older checkers 0.1.5 and 0.1.6",
        "the quick trial uses 0.1.9",
        "assume full receipt",
        "0.1.7",
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
    assert!(fbt.contains("Verified 20 September 2026 against the ATO"));
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
        "All business data, transactions and reviewers are fabricated",
        "compare within a checkpoint and do not sum across checkpoints",
        "cash shortfall remains unattributed",
        "close marked REVIEW",
        "original receipt marked UNREVIEWED",
        "grants no action authority",
        "not tax, legal or financial advice",
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
fn money_formats_like_decimal() {
    assert_eq!(money("1234.5"), "$1,234.50");
    assert_eq!(money("-1234.565"), "-$1,234.56");
    assert_eq!(money("0.125"), "$0.12");
    assert_eq!(money("1000000"), "$1,000,000.00");
}
