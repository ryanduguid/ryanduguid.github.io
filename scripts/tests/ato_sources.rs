//! `site-tools check_ato_sources`: source discovery, page classification, the report and
//! issue, and the reads, with the browser and the network replaced by fixtures.
mod common;
use serde_json::{Value, json};
use site_tools::ato_sources::{
    Change, Entry, Findings, Move, Moved, Options, Page, QUESTIONS, Quiet, Sources, WATCHED,
    answers_to_recheck, baseline_file, classify, collect_sources, collect_values, dead_confirmed,
    exit_code, extract_urls, follow_redirects, get_unfollowed, is_iso_date, last_updated,
    line_diff, parse_args, read_pages, read_pdf, render_issue, render_report, same_url,
    save_results, select_sources, sort_moves, standing_findings, tidy,
};
// Only the Unix-only batch tests start the browser runner directly.
#[cfg(unix)]
use site_tools::ato_sources::{MAX_URLS, dead_marker, run_batch_with};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const PAGE: &str = "https://www.ato.gov.au/tax-rates-and-codes/general-interest-charge-rates";
const TEXT: &str = "General interest charge rates\nThe rate for the December quarter is 11.17%.\nThe rate for the September quarter is 11.36%.";
const LEVY: &str = "https://coallsl.com.au/employer/administer-lsl/levy";
const NEWSROOM: &str =
    "https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom";

fn page(text: &str) -> Page {
    Page {
        status: Some(200.0),
        final_url: Some(PAGE.into()),
        text: Some(text.into()),
        ..Page::default()
    }
}

fn status(code: f64) -> Page {
    Page {
        status: Some(code),
        ..page(TEXT)
    }
}

fn write(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

fn cited<'a>(sources: &'a Sources, url: &str) -> Option<&'a Vec<String>> {
    sources
        .iter()
        .find(|(u, _)| u == url)
        .map(|(_, files)| files)
}

fn watched(url: &str) -> bool {
    WATCHED.iter().any(|(w, _)| *w == url)
}

#[test]
fn urls_are_cleaned_of_entities_fragments_and_trailing_punctuation() {
    let text = format!(
        r#"<a href="{PAGE}#rates">GIC</a>. See {PAGE}. Or https://www.ato.gov.au/law/view/document?a=1&amp;b=2"#
    );
    assert_eq!(
        extract_urls(&text),
        [PAGE, "https://www.ato.gov.au/law/view/document?a=1&b=2"]
    );
}

#[test]
fn a_csv_row_yields_each_url_separately() {
    assert_eq!(
        extract_urls(&format!("{PAGE},2026-09-22,https://www.ato.gov.au/rental")),
        [PAGE, "https://www.ato.gov.au/rental"]
    );
}

#[test]
fn templates_are_skipped_and_percent_encoding_is_kept() {
    let encoded =
        "https://www.ato.gov.au/law/view/document?DocID=COG%2FLCR20262%2FNAT%2FATO%2F00001";
    let text =
        format!(r#"f"https://www.ato.gov.au/{{slug}}" "https://www.ato.gov.au/%s/text" {encoded}"#);
    assert_eq!(extract_urls(&text), [encoded]);
}

#[test]
fn sources_include_rust_data_files() {
    let root = tempfile::tempdir().unwrap();
    write(
        &root.path().join("check_links_data.rs"),
        &format!(r#"pub const URLS: [&str; 1] = ["{PAGE}"];"#),
    );
    let sources = collect_sources(&[root.path().to_path_buf()]).unwrap();
    assert!(cited(&sources, PAGE).unwrap()[0].ends_with("/check_links_data.rs"));
}

#[test]
fn sources_skip_generated_output_tests_and_test_files() {
    let root = tempfile::tempdir().unwrap();
    let at = |rel: &str, text: &str| write(&root.path().join(rel), text);
    at("rates/index.html", &format!(r#"<a href="{PAGE}">GIC</a>"#));
    at("_site/index.html", "https://www.ato.gov.au/generated");
    at("tests/fixture.json", r#""https://www.ato.gov.au/fixture""#);
    at(
        "scripts/test_links.py",
        r#""https://www.ato.gov.au/test-file""#,
    );
    at(
        "scripts/rates_tests.rs",
        r#""https://www.ato.gov.au/rust-tests""#,
    );
    at("src/tests.rs", r#""https://www.ato.gov.au/sibling-tests""#);
    at(
        "examples/source_probe.rs",
        r#""https://www.ato.gov.au/probe""#,
    );
    at(
        "src/compat_probe.rs",
        &format!("const PAGE: &str = \"{PAGE}\";\n"),
    );
    at(
        "scripts/transport.rs",
        &[
            "#[cfg(test)]",
            "mod open_tests {",
            r#"    fn a() { let _ = ("{", "https://www.ato.gov.au/a"); }"#,
            "}",
            "",
            &format!("const PAGE: &str = \"{PAGE}\";"),
            "",
            "#[cfg(test)]",
            "mod close_tests {",
            "    // }",
            r#"    fn b() { let _ = ("}", "https://www.ato.gov.au/b"); }"#,
            "}",
            "",
        ]
        .join("\r\n"),
    );
    let sources = collect_sources(&[root.path().to_path_buf()]).unwrap();
    let found: Vec<&str> = sources
        .iter()
        .map(|(u, _)| u.as_str())
        .filter(|u| !watched(u))
        .collect();
    assert_eq!(found, [PAGE]);
    let mut files: Vec<String> = cited(&sources, PAGE)
        .unwrap()
        .iter()
        .map(|p| {
            p.rsplitn(3, '/')
                .take(2)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("/")
        })
        .collect();
    files.sort();
    assert_eq!(
        files,
        [
            "rates/index.html",
            "scripts/transport.rs",
            "src/compat_probe.rs"
        ]
    );
}

#[test]
fn sources_are_sorted_as_icu_orders_them_and_labelled_by_directory() {
    let root = tempfile::tempdir().unwrap();
    let site = root.path().join("site");
    write(
        &site.join("a.md"),
        "https://www.ato.gov.au/law/view/document?DocID=TR https://www.ato.gov.au/law/view/document?docid=TQ https://www.ato.gov.au/Individuals https://www.ato.gov.au/individuals-and-families",
    );
    let sources = collect_sources(&[site]).unwrap();
    let ato: Vec<&str> = sources
        .iter()
        .map(|(u, _)| u.as_str())
        .filter(|u| !watched(u))
        .collect();
    assert_eq!(
        ato,
        [
            "https://www.ato.gov.au/Individuals",
            "https://www.ato.gov.au/individuals-and-families",
            "https://www.ato.gov.au/law/view/document?docid=TQ",
            "https://www.ato.gov.au/law/view/document?DocID=TR",
        ]
    );
    assert_eq!(
        cited(&sources, "https://www.ato.gov.au/Individuals").unwrap(),
        &["site/a.md"]
    );
}

#[test]
fn a_watched_page_is_found_only_as_a_whole_url() {
    assert_eq!(
        extract_urls(&format!(r#"<a href="{LEVY}">levy</a>. See {LEVY}."#)),
        [LEVY]
    );
    assert!(
        extract_urls(&format!(
            "{LEVY}/history {LEVY}-rates https://coallsl.com.au/employer"
        ))
        .is_empty()
    );
}

#[test]
fn watched_pages_are_read_even_when_nothing_cites_them_and_their_values_are_traced() {
    let root = tempfile::tempdir().unwrap();
    write(
        &root.path().join("assets/levy.mjs"),
        r#"export const NOTE = "2.7% of eligible wages";"#,
    );
    write(
        &root.path().join("index.html"),
        &format!(r#"<a href="{LEVY}">The levy is 2.7%</a>"#),
    );
    let directories = [root.path().to_path_buf()];
    let sources = collect_sources(&directories).unwrap();
    for (url, _) in WATCHED {
        assert!(cited(&sources, url).is_some(), "{url}");
    }
    let levy: Vec<&str> = cited(&sources, LEVY)
        .unwrap()
        .iter()
        .map(|p| p.rsplit('/').next().unwrap())
        .collect();
    assert_eq!(levy, ["index.html"]);
    assert!(cited(&sources, WATCHED[1].0).unwrap().is_empty());
    let values = collect_values(&directories).unwrap();
    let files = |value: &str| -> Vec<String> {
        let mut files: Vec<String> = values
            .iter()
            .find(|(v, _)| *v == value)
            .unwrap()
            .1
            .iter()
            .map(|p| p.split_once('/').unwrap().1.to_owned())
            .collect();
        files.sort();
        files
    };
    assert_eq!(files("2.7%"), ["assets/levy.mjs", "index.html"]);
    assert!(files("5.45%").is_empty());
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&site_tools::read(path).unwrap()).unwrap()
}

#[test]
fn the_sweep_covers_every_source_behind_a_fact_bearing_accounting_answer() {
    let root = common::repository();
    let data = read_json(&root.join(QUESTIONS));
    let sources = collect_sources(std::slice::from_ref(&root)).unwrap();
    let mut missing = Vec::new();
    let duguid = url::Url::parse("https://duguid.com.au").unwrap();
    for question in data["questions"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|q| q["fact"].as_str().is_some_and(|f| !f.is_empty()))
    {
        let mut keys = vec![question["source"].as_str().unwrap()];
        keys.extend(
            question["fact_sources"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|k| k.as_str().unwrap()),
        );
        for key in keys {
            let url = duguid
                .join(data["sources"][key]["url"].as_str().unwrap())
                .unwrap()
                .to_string();
            match cited(&sources, &url) {
                None => missing.push(url),
                Some(files) => assert!(
                    files
                        .iter()
                        .any(|f| f.ends_with("/_data/accounting_questions.json")),
                    "{url}"
                ),
            }
        }
    }
    assert!(missing.is_empty(), "{missing:?}");
}

#[test]
fn fact_source_discovery_refuses_missing_and_unsupported_sources() {
    let root = tempfile::tempdir().unwrap();
    for url in [
        Value::Null,
        json!("http://www.ato.gov.au/rates"),
        json!("https://localhost/rates"),
        json!("https://www.ato.gov.au:8443/rates"),
        json!("https://user:password@www.ato.gov.au/rates"),
        json!("//www.ato.gov.au/rates"),
        json!(5),
    ] {
        let data = json!({"sources": {"rate": {"url": url}}, "questions": [{"id": 1, "source": "rate", "fact": "A checked figure."}]});
        write(&root.path().join(QUESTIONS), &data.to_string());
        let refused = collect_sources(&[root.path().to_path_buf()]).unwrap_err();
        assert_eq!(
            refused,
            "_data/accounting_questions.json: question 1 source rate is missing or not a supported public HTTPS URL",
            "{url}"
        );
    }
}

#[test]
fn relative_rate_sources_use_the_same_url_for_discovery_and_answer_date_checks() {
    let root = tempfile::tempdir().unwrap();
    let url = "https://duguid.com.au/rates/super-guarantee/";
    let data = json!({
        "facts_checked": "2026-09-27",
        "sources": {"rate": {"url": "/rates/super-guarantee/#gst"}},
        "questions": [{"id": 1, "source": "rate", "fact": "A checked figure.", "fact_sources": ["rate"]}],
    });
    write(&root.path().join(QUESTIONS), &data.to_string());
    let sources = collect_sources(&[root.path().to_path_buf()]).unwrap();
    assert_eq!(cited(&sources, url).map(Vec::len), Some(1));
    let texts = HashMap::from([(url.to_owned(), "Last updated 15 October 2026".to_owned())]);
    assert_eq!(
        answers_to_recheck(&data, &texts).unwrap(),
        [(url.to_owned(), "2026-10-15".to_owned(), vec![json!(1)])]
    );
}

#[test]
fn a_first_seen_page_passes_and_its_text_becomes_the_baseline() {
    let result = classify(PAGE, Some(&page(TEXT)), None);
    assert_eq!(result.failure, None);
    assert_eq!(result.text.as_deref(), Some(TEXT));
}

#[test]
fn a_page_matching_its_baseline_passes_whatever_the_spacing() {
    let respaced = format!("{}  \n\n\n", TEXT.replace("rate for", "rate\u{a0}for"));
    let result = classify(PAGE, Some(&page(&respaced)), Some(TEXT));
    assert_eq!(result.failure, None);
    assert_eq!(result.change, None);
}

#[test]
fn a_changed_page_fails_carries_its_diff_and_moves_the_baseline_on() {
    let now = TEXT.replace("11.17%", "11.42%");
    let result = classify(PAGE, Some(&page(&now)), Some(TEXT));
    assert_eq!(
        result.failure.as_deref(),
        Some("changed since the previous run")
    );
    let change = result.change.unwrap();
    assert!(change.substantive);
    assert_eq!(
        change.diff,
        "- The rate for the December quarter is 11.17%.\n+ The rate for the December quarter is 11.42%."
    );
    assert_eq!(result.text, Some(now));
}

#[test]
fn a_change_confined_to_counters_link_labels_and_the_last_updated_stamp_passes_and_says_why() {
    let ruling = "https://www.ato.gov.au/law/view/document?DocID=TXR/TR20234/NAT/ATO/00001";
    let counted = classify(
        ruling,
        Some(&Page {
            final_url: Some(ruling.into()),
            ..page(&format!("{TEXT}\n138 related documents"))
        }),
        Some(&format!("{TEXT}\n139 related documents")),
    );
    assert_eq!(counted.failure, None);
    assert_eq!(
        counted.change.unwrap().reason,
        "only the related documents count changed"
    );
    assert_eq!(counted.text, Some(format!("{TEXT}\n138 related documents")));
    let before = format!(
        "Last updated 4 June 2025\n{TEXT}\nPEXA guide Opens in a new window\nOpens in a new window\nShowing 1 - 10 of 32"
    );
    let after = format!(
        "Last updated 14 October 2026\n{TEXT}\nPEXA guide External Link\nExternal Link\nExternal Link\nShowing 1 - 10 of 33"
    );
    let relabelled = classify(PAGE, Some(&page(&after)), Some(&before));
    assert_eq!(relabelled.failure, None);
    assert_eq!(
        relabelled.change.unwrap().reason,
        "only the result count, external link label and Last updated stamp changed"
    );
    // Indentation and blank lines are spacing; a space inside a line is not.
    let spaced = classify(
        PAGE,
        Some(&page(&format!("{TEXT}\n\n  x y"))),
        Some(&format!("{TEXT}\nx y")),
    );
    assert_eq!(spaced.failure, None);
    assert_eq!(spaced.change.unwrap().reason, "only the spacing changed");
    let inner = classify(
        PAGE,
        Some(&page(&format!("{TEXT}\nx  y"))),
        Some(&format!("{TEXT}\nx y")),
    );
    assert_eq!(
        inner.failure.as_deref(),
        Some("changed since the previous run")
    );
}

#[test]
fn a_last_updated_stamp_is_a_hint_beside_a_real_change_and_link_labels_never_hide_one() {
    let before =
        format!("Last updated 4 June 2025\n{TEXT}\nSee the PEXA guide Opens in a new window");
    let after =
        format!("Last updated 14 October 2026\n{TEXT}\nSee the e-conveyancing guide External Link");
    let result = classify(PAGE, Some(&page(&after)), Some(&before));
    assert!(result.failure.unwrap().contains("changed since"));
    let change = result.change.unwrap();
    assert_eq!(
        change.hint.as_deref(),
        Some("Last updated moved from 4 June 2025 to 14 October 2026.")
    );
    assert_eq!(
        change.diff,
        "- See the PEXA guide\n+ See the e-conveyancing guide"
    );
    let colon = classify(
        PAGE,
        Some(&page(&after.replace("Last updated", "Last updated:"))),
        Some(&before.replace("Last updated", "Last updated:")),
    );
    assert_eq!(
        colon.change.unwrap().hint.as_deref(),
        Some("Last updated moved from 4 June 2025 to 14 October 2026.")
    );
}

#[test]
fn hubs_newsrooms_and_single_page_applications_change_without_review_judged_by_the_cited_url() {
    for (url, reason) in [
        ("https://www.ato.gov.au/", "hub page"),
        ("https://www.ato.gov.au/tax-rates-and-codes/", "hub page"),
        (
            "https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom/",
            "newsroom",
        ),
        (
            "https://www.ato.gov.au/single-page-applications/calculatorsandtools?anchor=DIV7A",
            "single-page application",
        ),
    ] {
        let result = classify(
            url,
            Some(&Page {
                final_url: Some(url.into()),
                ..page(&format!("{TEXT}\nNew tile"))
            }),
            Some(TEXT),
        );
        assert_eq!(result.failure, None, "{url}");
        assert!(result.change.unwrap().reason.contains(reason), "{url}");
    }
    assert!(
        classify(PAGE, Some(&page(&format!("{TEXT}\nNew tile"))), Some(TEXT))
            .failure
            .unwrap()
            .contains("changed since")
    );
    // A cited article that now lands on its newsroom needs review, whatever the redirect.
    let article = format!("{NEWSROOM}/business-days-decoded");
    let landed = classify(
        &article,
        Some(&Page {
            final_url: Some(NEWSROOM.into()),
            ..page(&format!("{TEXT}\nNew tile"))
        }),
        Some(TEXT),
    );
    assert!(landed.failure.unwrap().contains("changed since"));
    assert_eq!(landed.note, Some(format!("now resolves to {NEWSROOM}")));
}

#[test]
fn only_a_bare_last_updated_stamp_is_noise() {
    let before = format!("Last updated 1 July 2026\n{TEXT}");
    assert_eq!(
        classify(
            PAGE,
            Some(&page(&format!("Last updated: 2 July 2026\n{TEXT}"))),
            Some(&before)
        )
        .failure,
        None
    );
    let after = format!("Last updated 2 July 2026 - the rate is now 7%\n{TEXT}");
    assert!(
        classify(PAGE, Some(&page(&after)), Some(&before))
            .failure
            .unwrap()
            .contains("changed since")
    );
}

#[test]
fn the_legal_database_home_may_change_but_other_law_pages_may_not() {
    let home = "https://www.ato.gov.au/single-page-applications/legaldatabase";
    let at = |url: &str, text: &str| Page {
        final_url: Some(url.into()),
        ..page(text)
    };
    let changed = format!("{TEXT} and more");
    assert_eq!(
        classify(home, Some(&at(home, &changed)), Some(TEXT)).failure,
        None
    );
    let gone = Page {
        status: Some(404.0),
        ..at(home, TEXT)
    };
    assert_eq!(
        classify(home, Some(&gone), Some(TEXT)).failure.as_deref(),
        Some("HTTP 404")
    );
    let ruling = "https://www.ato.gov.au/law/view/document?DocID=DPC/PCG2026D3/NAT/ATO/00001";
    assert!(
        classify(ruling, Some(&at(ruling, &changed)), Some(TEXT))
            .failure
            .unwrap()
            .contains("changed since")
    );
}

#[test]
fn errors_bad_statuses_empty_text_cut_off_text_and_missing_results_fail() {
    let failure = |page: Option<&Page>| classify(PAGE, page, None).failure.unwrap();
    assert_eq!(
        failure(Some(&Page::error("navigation timed out"))),
        "navigation timed out"
    );
    assert_eq!(failure(Some(&status(404.0))), "HTTP 404");
    assert_eq!(
        failure(Some(&Page {
            status: None,
            ..page(TEXT)
        })),
        "HTTP unknown"
    );
    assert_eq!(failure(Some(&status(0.0))), "HTTP 0");
    assert_eq!(failure(Some(&page("Menu"))), "no page text");
    assert_eq!(
        failure(Some(&Page {
            truncated: true,
            ..page(TEXT)
        })),
        "page text was cut off"
    );
    assert_eq!(failure(None), "no result from the browser");
}

fn entry(url: &str, result: site_tools::ato_sources::Outcome) -> Entry {
    Entry {
        url: url.into(),
        failure: result.failure.unwrap_or_default(),
        change: result.change,
        dead: result.dead,
        ..Entry::default()
    }
}

#[test]
fn changed_pages_and_dead_links_exit_2_and_any_unreadable_page_exits_1() {
    let changed = entry(
        PAGE,
        classify(PAGE, Some(&page(&format!("{TEXT} and more"))), Some(TEXT)),
    );
    let dead = entry(PAGE, classify(PAGE, Some(&status(404.0)), None));
    let gone = entry(PAGE, classify(PAGE, Some(&status(410.0)), None));
    let denied = entry(PAGE, classify(PAGE, Some(&status(403.0)), None));
    let timed_out = entry(
        PAGE,
        classify(PAGE, Some(&Page::error("navigation timed out")), None),
    );
    assert!(dead.dead && gone.dead && !denied.dead);
    assert_eq!(exit_code(&[], &[]), 0);
    assert_eq!(exit_code(&[changed.clone(), dead.clone(), gone], &[]), 2);
    assert_eq!(exit_code(&[dead, denied.clone()], &[]), 1);
    assert_eq!(exit_code(&[changed, timed_out], &[]), 1);
    let recheck = Entry {
        url: PAGE.into(),
        failure: "updated 2026-10-15, after the answers to questions 6 were checked".into(),
        recheck: true,
        ..Entry::default()
    };
    assert_eq!(exit_code(std::slice::from_ref(&recheck), &[]), 2);
    assert_eq!(exit_code(&[recheck, denied], &[]), 1);
    let moved = Move {
        url: PAGE.into(),
        target: format!("{PAGE}-2026"),
        files: Vec::new(),
    };
    assert_eq!(exit_code(&[], &[moved]), 2);
}

fn findings() -> Findings {
    let change = classify(
        PAGE,
        Some(&page(&format!("Last updated 1 May 2026\n{TEXT}!"))),
        Some(&format!("Last updated 2 May 2026\n{TEXT}")),
    )
    .change;
    let quiet = classify(
        NEWSROOM,
        Some(&Page {
            final_url: Some(NEWSROOM.into()),
            ..page(&format!("{TEXT}\nNew article"))
        }),
        Some(TEXT),
    )
    .change
    .unwrap();
    Findings {
        date: "2026-10-19".into(),
        read: 370,
        seeded: 2,
        review: vec![
            Entry {
                url: PAGE.into(),
                files: vec!["ryanduguid.github.io/rates/index.html".into()],
                failure: "changed since the previous run".into(),
                change,
                ..Entry::default()
            },
            Entry {
                url: format!("{PAGE}-old"),
                failure: r"PermissionError: C:\Users\someone\AppData\Local\Temp\profile is locked"
                    .into(),
                ..Entry::default()
            },
        ],
        quiet: vec![Quiet {
            url: NEWSROOM.into(),
            files: vec!["au-fpa-pack/README.md".into()],
            change: quiet,
        }],
        moves: vec![
            Move {
                url: "https://www.ato.gov.au/rental".into(),
                target: "https://www.ato.gov.au/property/rental".into(),
                files: vec!["ryanduguid.github.io/scripts/src/check_links_data.rs".into()],
            },
            Move {
                url: format!("{NEWSROOM}/old-article"),
                target: NEWSROOM.into(),
                files: Vec::new(),
            },
        ],
        notes: vec![format!("{PAGE}/x now resolves to {PAGE}/y")],
        deferred: 0,
    }
}

#[test]
fn the_issue_lists_answers_to_recheck_apart_from_pages_that_could_not_be_read() {
    let recheck = Entry {
        url: PAGE.into(),
        files: vec!["ryanduguid.github.io/_data/accounting_questions.json".into()],
        failure: "updated 2026-10-15, after the answers to questions 6 were checked; recheck them"
            .into(),
        recheck: true,
        ..Entry::default()
    };
    let body = render_issue(
        &Findings {
            date: "2026-10-29".into(),
            read: 1,
            review: vec![recheck],
            ..Findings::default()
        },
        true,
    );
    assert!(body.contains("1 need accounting answers rechecked, 0 could not be read"));
    assert!(body.contains(&format!("## Answers to recheck\n\n- {PAGE}: updated 2026-10-15, after the answers to questions 6 were checked; recheck them. Cited in:")));
    assert!(!body.contains("## Pages that could not be read"));
}

#[test]
fn the_issue_lists_dead_links_apart_from_pages_that_could_not_be_read() {
    let files = vec!["tools/a/index.html".to_owned()];
    let dead = Entry {
        files: files.clone(),
        ..entry(
            &format!("{PAGE}-gone"),
            classify(PAGE, Some(&status(404.0)), None),
        )
    };
    let unread = Entry {
        files,
        ..entry(
            &format!("{PAGE}-slow"),
            classify(PAGE, Some(&Page::error("navigation timed out")), None),
        )
    };
    let body = render_issue(
        &Findings {
            date: "2026-10-29".into(),
            read: 2,
            review: vec![dead, unread],
            ..Findings::default()
        },
        true,
    );
    assert!(body.contains("1 returned HTTP 404 or 410 (dead links), 0 need accounting answers rechecked, 1 could not be read"));
    assert!(body.contains(&format!("## Dead links\n\nRepoint each citation of these pages in every file listed.\n\n- {PAGE}-gone: HTTP 404. Cited in: `tools/a/index.html`")));
    assert!(body.contains(&format!(
        "## Pages that could not be read\n\n- {PAGE}-slow: navigation timed out."
    )));
    assert!(
        !body
            .split("## Pages that could not be read")
            .nth(1)
            .unwrap()
            .contains("-gone")
    );
}

#[test]
fn a_redirect_that_still_resolves_is_a_note_not_a_failure() {
    let result = classify(
        PAGE,
        Some(&Page {
            final_url: Some(format!("{PAGE}-2026")),
            ..page(TEXT)
        }),
        None,
    );
    assert_eq!(result.failure, None);
    assert_eq!(result.note, Some(format!("now resolves to {PAGE}-2026")));
}

#[test]
fn a_redirect_that_only_drops_the_trailing_slash_is_silent() {
    let slashed = "https://www.ato.gov.au/tax-rates-and-codes/";
    let result = classify(
        slashed,
        Some(&Page {
            final_url: Some(slashed[..slashed.len() - 1].into()),
            ..page(TEXT)
        }),
        None,
    );
    assert_eq!(result.note, None);
}

#[test]
fn an_echoed_url_with_other_encoding_still_matches() {
    assert_eq!(
        same_url("https://www.ato.gov.au/a?docid=%22x%22"),
        same_url(r#"https://www.ato.gov.au/a?docid="x""#)
    );
    // A reserved character keeps its escape, and an address that is not a URL is kept.
    assert_eq!(
        same_url("https://www.ato.gov.au/a%2Fb/#x"),
        "https://www.ato.gov.au/a%2Fb"
    );
    assert_eq!(
        same_url("https://www.ato.gov.au/a%E0%A4%A"),
        "https://www.ato.gov.au/a%E0%A4%A"
    );
    assert_eq!(same_url("not a url"), "not a url");
}

#[test]
fn tidy_normalises_spaces_and_blank_runs_but_keeps_line_breaks() {
    assert_eq!(tidy("a\u{a0}b  \r\n\n\n\n c\t\n"), "a b\n\n c");
    assert_eq!(tidy("\u{feff}a\u{2028}b\u{3000}"), "a b");
}

#[test]
fn the_diff_lists_the_lines_each_version_lacks_skipping_blanks() {
    assert_eq!(line_diff("a\n\nb\nc", "a\nb\n\nd"), "- c\n+ d");
}

#[test]
fn a_long_diff_is_capped_and_a_pure_reorder_says_so() {
    let many: Vec<String> = (0..50).map(|i| format!("line {i}")).collect();
    let shown = line_diff(&many.join("\n"), "");
    let lines: Vec<&str> = shown.split('\n').collect();
    assert_eq!(lines.len(), 41);
    assert_eq!(lines[40], "... 10 more changed lines");
    assert_eq!(
        line_diff("a\nb", "b\na"),
        "(only the order or repeats of lines changed)"
    );
}

#[test]
fn baseline_files_are_stable_readable_and_distinct_per_url() {
    // The names are those check_ato_sources.mjs gave, so existing baselines still match.
    assert_eq!(
        baseline_file(PAGE),
        "tax-rates-and-codes-general-interest-charge-rates-4728392b.txt"
    );
    assert_ne!(
        baseline_file(&format!("{PAGE}?a=1")),
        baseline_file(&format!("{PAGE}?a=2"))
    );
    assert!(baseline_file("https://www.ato.gov.au/").starts_with("home-"));
    let long = baseline_file(&format!("https://www.ato.gov.au/{}", "a".repeat(80)));
    assert_eq!(long.len(), 60 + "-12345678.txt".len());
}

fn served(urls: &[String], body: impl Fn(&str) -> Page) -> HashMap<String, Page> {
    urls.iter().map(|url| (url.clone(), body(url))).collect()
}

#[test]
fn read_pages_sends_pdfs_to_the_pdf_reader_batches_the_rest_and_rereads_pages_without_a_container()
{
    let urls: Vec<String> = (0..120)
        .map(|i| format!("https://www.ato.gov.au/page-{i}"))
        .collect();
    let pdf_url = "https://www.ato.gov.au/api/public/content/abc?1".to_owned();
    let mut calls = Vec::new();
    let bare = urls[7].clone();
    let mut all = urls.clone();
    all.push(pdf_url.clone());
    let pages = read_pages(
        &all,
        &mut |list, args| {
            calls.push((list.len(), args[0].to_owned()));
            Ok(served(list, |url| {
                if url == bare && args[0] == "--selector" {
                    Page::error("nothing visible matches '#content, main'")
                } else {
                    Page {
                        status: Some(200.0),
                        text: Some(url.into()),
                        ..Page::default()
                    }
                }
            }))
        },
        &mut |url| Page {
            status: Some(200.0),
            text: Some(format!("pdf {url}")),
            ..Page::default()
        },
    )
    .unwrap();
    assert_eq!(
        calls,
        [
            (50, "--selector".into()),
            (50, "--selector".into()),
            (20, "--selector".into()),
            (1, "--main".into())
        ]
    );
    assert_eq!(pages.len(), 121);
    assert_eq!(pages[&urls[7]].status, Some(200.0));
    assert_eq!(pages[&pdf_url].text, Some(format!("pdf {pdf_url}")));
}

#[test]
fn javascript_assets_use_whole_text_immediately_whilst_a_page_with_js_only_in_its_query_uses_containers()
 {
    let scripts = [
        "https://www.ato.gov.au/misc/spa/calculators/ui/scripts/ato/DIV7A.atogov.min.js".to_owned(),
        "https://www.ato.gov.au/misc/spa/calculators/ui/scripts/ato/subjectArea.IncomeTax.atogov.min.JS?v=1".to_owned(),
    ];
    let html = "https://www.ato.gov.au/page?example=asset.js".to_owned();
    let mut calls: Vec<(Vec<String>, Vec<String>)> = Vec::new();
    let all = [scripts[0].clone(), scripts[1].clone(), html.clone()];
    let pages = read_pages(
        &all,
        &mut |list, args| {
            calls.push((
                list.to_vec(),
                args.iter().map(|a| (*a).to_owned()).collect(),
            ));
            Ok(served(list, |url| {
                if scripts.iter().any(|s| s == url) && args[0] == "--selector" {
                    Page::error("nothing visible matches '#content, main'")
                } else {
                    page(TEXT)
                }
            }))
        },
        &mut |_| panic!("no PDFs"),
    )
    .unwrap();
    assert_eq!(pages.len(), 3);
    assert_eq!(
        calls,
        [
            (
                vec![html],
                vec!["--selector".to_owned(), "#content, main".to_owned()]
            ),
            (scripts.to_vec(), vec!["--main".to_owned()]),
        ]
    );
}

#[test]
fn read_pages_reads_a_failed_page_again_treats_any_pdf_as_a_pdf_and_reports_a_page_that_keeps_failing()
 {
    let flaky = "https://www.ato.gov.au/flaky".to_owned();
    let broken = "https://www.ato.gov.au/broken".to_owned();
    let law_pdf = "https://www.ato.gov.au/law/view/pdf/pbr/tr2018-003.pdf".to_owned();
    let mut calls: Vec<(String, String)> = Vec::new();
    let mut pdf_calls = Vec::new();
    let pages = read_pages(
        &[flaky.clone(), broken.clone(), law_pdf.clone()],
        &mut |list, args| {
            let names: Vec<&str> = list.iter().map(|u| u.rsplit('/').next().unwrap()).collect();
            calls.push((names.join(","), args[0].to_owned()));
            let first = calls.len() == 1;
            Ok(served(list, |url| {
                if url == flaky && first {
                    Page::error("PermissionError: could not tie Chrome to this process")
                } else if url == broken {
                    Page::error("timed out")
                } else {
                    Page {
                        status: Some(200.0),
                        text: Some(url.into()),
                        ..Page::default()
                    }
                }
            }))
        },
        &mut |url| {
            pdf_calls.push(url.to_owned());
            Page {
                status: Some(200.0),
                text: Some(format!("pdf {url}")),
                ..Page::default()
            }
        },
    )
    .unwrap();
    let selector = |names: &str| (names.to_owned(), "--selector".to_owned());
    assert_eq!(
        calls,
        [
            selector("flaky,broken"),
            selector("flaky,broken"),
            selector("broken")
        ]
    );
    assert_eq!(pdf_calls, [law_pdf]);
    assert_eq!(pages[&flaky].status, Some(200.0));
    assert_eq!(pages[&broken].error.as_deref(), Some("timed out"));
}

#[test]
fn read_pages_reads_a_failed_pdf_again_after_the_browser_batches_and_reports_one_that_keeps_failing()
 {
    let html = "https://www.ato.gov.au/page".to_owned();
    let flaky = "https://www.ato.gov.au/api/public/content/flaky".to_owned();
    let broken = "https://www.ato.gov.au/api/public/content/broken".to_owned();
    let order = std::cell::RefCell::new(Vec::new());
    let pages = read_pages(
        &[html.clone(), flaky.clone(), broken.clone()],
        &mut |list, _| {
            order.borrow_mut().push("batch".to_owned());
            Ok(served(list, |url| Page {
                status: Some(200.0),
                text: Some(url.into()),
                ..Page::default()
            }))
        },
        &mut |url| {
            order
                .borrow_mut()
                .push(url.rsplit('/').next().unwrap().to_owned());
            if url == broken || order.borrow().len() == 1 {
                Page::error("PDF fetch failed: UND_ERR_RES_CONTENT_LENGTH_MISMATCH")
            } else {
                Page {
                    status: Some(200.0),
                    text: Some(format!("pdf {url}")),
                    ..Page::default()
                }
            }
        },
    )
    .unwrap();
    assert_eq!(
        *order.borrow(),
        ["flaky", "broken", "batch", "flaky", "broken", "broken"]
    );
    assert_eq!(pages[&flaky].text, Some(format!("pdf {flaky}")));
    assert!(
        pages[&broken]
            .error
            .as_deref()
            .unwrap()
            .contains("CONTENT_LENGTH_MISMATCH")
    );
}

#[test]
fn read_pages_reads_a_pdf_again_after_a_503_or_429_but_not_after_a_404() {
    let urls: Vec<String> = ["busy", "limited", "gone"]
        .iter()
        .map(|n| format!("https://www.ato.gov.au/api/public/content/{n}"))
        .collect();
    let mut calls: HashMap<String, u32> = HashMap::new();
    let pages = read_pages(&urls, &mut |_, _| Ok(HashMap::new()), &mut |url| {
        let name = url.rsplit('/').next().unwrap().to_owned();
        let count = calls.entry(name.clone()).or_default();
        *count += 1;
        let first = match name.as_str() {
            "busy" => 503.0,
            "limited" => 429.0,
            _ => 404.0,
        };
        if *count == 1 {
            Page {
                status: Some(first),
                ..Page::default()
            }
        } else {
            Page {
                status: Some(200.0),
                text: Some(format!("pdf {name}")),
                ..Page::default()
            }
        }
    })
    .unwrap();
    assert_eq!(
        calls,
        HashMap::from([
            ("busy".into(), 2),
            ("limited".into(), 2),
            ("gone".into(), 1)
        ])
    );
    assert_eq!(pages[&urls[0]].status, Some(200.0));
    assert_eq!(pages[&urls[2]].status, Some(404.0));
}

#[test]
fn a_failed_batch_stops_the_read() {
    let result = read_pages(
        &[PAGE.to_owned()],
        &mut |_, _| Err("nodriver batch wrote no index (exit 1); see its output above".into()),
        &mut |_| panic!("no PDFs"),
    );
    assert_eq!(
        result,
        Err("nodriver batch wrote no index (exit 1); see its output above".into())
    );
}

#[test]
fn save_results_saves_the_report_before_it_moves_any_baseline() {
    let dir = tempfile::tempdir().unwrap();
    let baseline = dir.path().join("baseline");
    let kept = baseline.join("page.txt");
    let blocker = dir.path().join("not-a-folder");
    write(&kept, "old text");
    write(&blocker, "");
    let save = |out: PathBuf| {
        save_results(
            &out,
            &baseline,
            "2026-10-05",
            &["# report".into(), String::new()],
            &[(kept.clone(), "new text".into())],
        )
    };
    assert!(save(blocker.join("reports")).is_err());
    assert_eq!(std::fs::read_to_string(&kept).unwrap(), "old text");
    save(dir.path().join("reports")).unwrap();
    assert_eq!(std::fs::read_to_string(&kept).unwrap(), "new text");
}

#[test]
fn save_results_adds_a_same_day_rerun_to_the_earlier_report() {
    let dir = tempfile::tempdir().unwrap();
    let save = |report: &[&str]| {
        let report: Vec<String> = report.iter().map(|l| (*l).to_owned()).collect();
        save_results(
            dir.path(),
            &dir.path().join("baseline"),
            "2026-10-05",
            &report,
            &[],
        )
        .unwrap();
    };
    save(&["# first", "- old line", ""]);
    save(&["# second", "None.", ""]);
    assert_eq!(
        std::fs::read_to_string(dir.path().join("ato-sources-check-2026-10-05.md")).unwrap(),
        "# first\n- old line\n\n---\n\n# second\nNone.\n"
    );
}

fn sweep(args: &[&str], path: Option<&Path>) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_site-tools"));
    command.arg("check_ato_sources").args(args);
    if let Some(path) = path {
        command.env("PATH", path);
    }
    command.output().unwrap()
}

#[test]
fn a_live_run_without_out_is_refused_before_any_page_is_read() {
    let empty = tempfile::tempdir().unwrap();
    let baseline = empty.path().join("baseline");
    let run = sweep(
        &[
            "--baseline",
            baseline.to_str().unwrap(),
            empty.path().to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(run.status.code(), Some(1));
    assert_eq!(
        String::from_utf8_lossy(&run.stderr),
        "--baseline DIR and --out DIR are required for a live run\n"
    );
    assert!(!baseline.exists());
}

/// Distinct cited ATO URLs that, with the watched pages, make `count` sources.
#[cfg(unix)]
fn cited_urls(count: usize) -> Vec<String> {
    (WATCHED.len()..count)
        .map(|i| format!("https://www.ato.gov.au/sweep-size/page-{i}"))
        .collect()
}

#[test]
fn over_the_limit_a_run_takes_watched_then_new_then_longest_unread_pages() {
    let baseline = tempfile::tempdir().unwrap();
    let page = |name: &str| format!("https://www.ato.gov.au/turns/{name}");
    let written = |url: &str, seconds: u64| {
        let file = baseline.path().join(baseline_file(url));
        write(&file, TEXT);
        std::fs::File::options()
            .write(true)
            .open(&file)
            .unwrap()
            .set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(seconds))
            .unwrap();
    };
    written(&page("newest"), 3_000);
    written(&page("oldest"), 1_000);
    written(&page("middle"), 2_000);
    // Read most recently of all, so only its being watched puts it first.
    let watched = WATCHED[0].0.to_owned();
    written(&watched, 4_000);
    let sources: Sources = [
        watched.clone(),
        page("newest"),
        page("new-1"),
        page("oldest"),
        page("middle"),
        page("new-2"),
    ]
    .into_iter()
    .map(|url| (url, vec!["site/a.md".to_owned()]))
    .collect();
    let urls = |limit: usize| {
        let (chosen, deferred) = select_sources(&sources, baseline.path(), limit);
        let urls: Vec<String> = chosen.into_iter().map(|(url, _)| url).collect();
        (urls, deferred)
    };
    assert_eq!(
        urls(4),
        (
            vec![
                watched.clone(),
                page("new-1"),
                page("oldest"),
                page("new-2")
            ],
            2
        )
    );
    assert_eq!(
        urls(5),
        (
            vec![
                watched.clone(),
                page("new-1"),
                page("oldest"),
                page("middle"),
                page("new-2")
            ],
            1
        )
    );
    let every: Vec<String> = sources.iter().map(|(url, _)| url.clone()).collect();
    assert_eq!(urls(6), (every, 0));
}

#[test]
fn standing_findings_are_the_permanent_redirects_and_the_answers_to_recheck() {
    let mut findings = findings();
    findings.review.push(Entry {
        url: format!("{PAGE}-stale"),
        recheck: true,
        ..Entry::default()
    });
    let standing: Vec<String> = standing_findings(&findings)
        .into_iter()
        .map(str::to_owned)
        .collect();
    assert_eq!(
        standing,
        [
            "https://www.ato.gov.au/rental".to_owned(),
            format!("{NEWSROOM}/old-article"),
            format!("{PAGE}-stale"),
        ]
    );
}

/// The first run over one URL too many leaves 1 for later; the second reads it, because
/// it is new to the baseline, and leaves 1 it read before.
#[cfg(unix)]
#[test]
fn a_sweep_over_the_url_limit_reads_the_limit_and_leaves_the_rest_for_a_later_run() {
    let urls = cited_urls(MAX_URLS + 1);
    let links: Vec<&str> = urls.iter().map(String::as_str).collect();
    let sweep = Sweep::new(&links, None);
    for seeded in [MAX_URLS, 1] {
        let run = sweep.run(&[]);
        assert_eq!(
            run.status.code(),
            Some(0),
            "{}",
            String::from_utf8_lossy(&run.stderr)
        );
        assert_eq!(
            String::from_utf8_lossy(&run.stdout),
            format!(
                "{MAX_URLS} sources read, {seeded} new to the baseline, 0 changed with nothing to review, 1 left for a later run\n"
            )
        );
    }
    let out = sweep.root.path().join("out");
    let report = std::fs::read_dir(&out)
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    assert!(
        std::fs::read_to_string(report).unwrap().contains(&format!(
            "{MAX_URLS} pages read, 1 new to the baseline. Cited URLs left for a later run: 1 (a run reads at most {MAX_URLS})."
        ))
    );
}

/// A page whose answers need rechecking was read, but its finding stands until the answers
/// change, so its baseline file is dated to put it first in the next run's turn.
#[cfg(unix)]
#[test]
fn a_page_with_answers_to_recheck_goes_first_in_the_next_turn() {
    let stale = "https://www.ato.gov.au/stale-page";
    let questions = json!({
        "facts_checked": "2026-09-27",
        "sources": {"stale": {"url": stale}},
        "questions": [{"id": 6, "source": "stale", "fact": "A checked fact.", "fact_sources": []}],
    });
    let sweep = Sweep::new(&[PAGE], Some(questions));
    let dated = format!("{TEXT}\nLast updated 3 November 2026");
    let run = sweep.run(&[(PAGE, "200", TEXT), (stale, "200", &dated)]);
    assert_eq!(
        run.status.code(),
        Some(2),
        "{}",
        String::from_utf8_lossy(&run.stderr)
    );
    let written = |url: &str| {
        let file = sweep.root.path().join("baseline").join(baseline_file(url));
        std::fs::metadata(file).unwrap().modified().unwrap()
    };
    assert_eq!(written(stale), std::time::UNIX_EPOCH);
    assert_ne!(written(PAGE), std::time::UNIX_EPOCH);
}

#[test]
fn list_prints_each_url_with_the_files_citing_it() {
    let root = tempfile::tempdir().unwrap();
    let site = root.path().join("site");
    write(&site.join("a.md"), &format!("{PAGE} {LEVY}"));
    write(&site.join("b.html"), PAGE);
    let run = sweep(&["--list", site.to_str().unwrap()], None);
    assert_eq!(run.status.code(), Some(0));
    let expected = format!(
        "{LEVY}\n  site/a.md\n{PAGE}\n  site/a.md\n  site/b.html\n{}\n  \n{}\n  \n4 URLs, 3 of them watched outside the ATO\n",
        WATCHED[1].0, WATCHED[2].0
    );
    assert_eq!(String::from_utf8_lossy(&run.stdout), expected);
}

#[test]
fn arguments_are_read_as_node_parse_args_reads_them() {
    let parse =
        |args: &[&str]| parse_args(&args.iter().map(|a| (*a).to_owned()).collect::<Vec<_>>());
    assert_eq!(
        parse(&[
            "--list",
            "a",
            "--baseline",
            "b",
            "--out=c",
            "--issue",
            "-",
            "--",
            "--d"
        ]),
        Ok(Options {
            list: true,
            baseline: Some("b".into()),
            out: Some("c".into()),
            issue: Some("-".into()),
            positionals: vec!["a".into(), "--d".into()],
        })
    );
    assert_eq!(
        parse(&["--out", "a", "--out", "b"]).unwrap().out.as_deref(),
        Some("b")
    );
    assert_eq!(
        parse(&["--x"]),
        // Node's message leaves its last quotation open.
        Err(r#"Unknown option '--x'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--x""#.to_owned())
    );
    assert!(
        parse(&["-lx"])
            .unwrap_err()
            .starts_with("Unknown option '-l'.")
    );
    assert_eq!(
        parse(&["--baseline"]),
        Err("Option '--baseline <value>' argument missing".into())
    );
    assert_eq!(
        parse(&["--list=1"]),
        Err("Option '--list' does not take an argument".into())
    );
    assert_eq!(
        parse(&["--out", "--list"]),
        Err("Option '--out' argument is ambiguous.\nDid you forget to specify the option argument for '--out'?\nTo specify an option argument starting with a dash use '--out=-XYZ'.".into())
    );
    let refused = sweep(&["--baseline"], None);
    assert_eq!(refused.status.code(), Some(1));
    assert_eq!(
        String::from_utf8_lossy(&refused.stderr),
        "Option '--baseline <value>' argument missing\n"
    );
}

#[test]
fn follow_redirects_calls_a_chain_of_301_and_308_permanent_and_keeps_the_last_fragment() {
    let table = HashMap::from([
        (PAGE, (301, "/rates/gic")),
        (
            "https://www.ato.gov.au/rates/gic",
            (308, "https://www.ato.gov.au/rates/gic-2#now"),
        ),
    ]);
    let mut get = |url: &str| -> Result<(u16, Option<String>), String> {
        Ok(table
            .get(url)
            .map_or((200, None), |(s, l)| (*s, Some((*l).to_owned()))))
    };
    assert_eq!(
        follow_redirects(PAGE, &mut get),
        Ok(("https://www.ato.gov.au/rates/gic-2#now".into(), true))
    );
}

#[test]
fn follow_redirects_calls_a_302_hop_or_no_redirect_at_all_not_permanent() {
    let table = HashMap::from([
        (PAGE, (301, "/a")),
        ("https://www.ato.gov.au/a", (302, "/b")),
    ]);
    let mut get = |url: &str| -> Result<(u16, Option<String>), String> {
        Ok(table
            .get(url)
            .map_or((200, None), |(s, l)| (*s, Some((*l).to_owned()))))
    };
    assert_eq!(
        follow_redirects(PAGE, &mut get),
        Ok(("https://www.ato.gov.au/b".into(), false))
    );
    assert_eq!(
        follow_redirects(PAGE, &mut |_| Ok((200, None))),
        Ok((PAGE.into(), false))
    );
    assert_eq!(
        follow_redirects(PAGE, &mut |_| Ok((301, Some("/loop".into())))),
        Err("more than 10 redirects".into())
    );
    assert_eq!(
        follow_redirects(PAGE, &mut |_| Ok((301, Some("http://[".into())))),
        Err("Invalid URL".into())
    );
}

#[test]
fn sort_moves_lists_permanent_redirects_and_keeps_the_rest_as_notes() {
    let moved: Vec<Moved> = ["permanent", "temporary", "unreachable"]
        .iter()
        .map(|kind| Moved {
            url: format!("{PAGE}/{kind}"),
            files: vec!["site/a.md".into()],
            note: format!("now resolves to {PAGE}/new"),
        })
        .collect();
    let (moves, notes) = sort_moves(&moved, &mut |url| {
        if url.ends_with("unreachable") {
            return Err("ECONNRESET".into());
        }
        Ok((format!("{PAGE}/new"), url.ends_with("/permanent")))
    });
    assert_eq!(
        moves,
        [Move {
            url: format!("{PAGE}/permanent"),
            target: format!("{PAGE}/new"),
            files: vec!["site/a.md".into()]
        }]
    );
    assert_eq!(
        notes,
        [
            format!("{PAGE}/temporary now resolves to {PAGE}/new"),
            format!(
                "{PAGE}/unreachable now resolves to {PAGE}/new (redirect not checked: ECONNRESET)"
            ),
        ]
    );
}

#[test]
fn the_issue_body_lists_each_finding_with_its_citing_files_and_names_no_local_path() {
    let body = render_issue(&findings(), true);
    assert!(body.starts_with("The weekly ATO source sweep of 2026-10-19 read 370 pages: 1 changed substantively, 1 changed with nothing to review, 0 returned HTTP 404 or 410 (dead links), 0 need accounting answers rechecked, 1 could not be read and 2 cited URLs redirect permanently."));
    assert!(body.contains(&format!("### {PAGE}\n\nChanged since the previous run. Cited in: `ryanduguid.github.io/rates/index.html`\n\nLast updated moved from 2 May 2026 to 1 May 2026.")));
    assert!(body.contains("<details><summary>Changed lines</summary>\n\n```diff\n- The rate for the September quarter is 11.36%.\n+ The rate for the September quarter is 11.36%.!\n```\n\n</details>"));
    assert!(body.contains(&format!("## Pages that could not be read\n\n- {PAGE}-old: PermissionError: (local path). Cited in: no file")));
    for private in ["Users", "AppData", "vault", "ATO Watch"] {
        assert!(!body.contains(private), "{private}");
    }
    assert!(body.contains(
        "`scripts/src/check_links_data.rs` (keep HTTP_403_AUTOMATION_DENIAL_URLS sorted"
    ));
    assert!(body.contains("- `https://www.ato.gov.au/rental` → `https://www.ato.gov.au/property/rental`. Cited in: `ryanduguid.github.io/scripts/src/check_links_data.rs`"));
    assert!(body.contains(&format!(
        "old-article` → `{NEWSROOM}` (a hub or newsroom, so the cited page was probably withdrawn"
    )));
    assert!(body.contains(&format!("## Changes that need no review\n\n- {NEWSROOM}: a newsroom, whose article list changes weekly. Cited in: `au-fpa-pack/README.md`")));
    assert!(body.contains(&format!("## Other redirects\n\n- {PAGE}/x now resolves to")));
}

#[test]
fn no_local_path_of_any_shape_reaches_the_issue_and_urls_keep_their_paths() {
    let mut base = findings();
    base.review = [
        r"EPERM: D:\Work\Client\file.txt locked",
        r"share \\server\folder\x.txt missing",
        "ENOENT: /home/someone/profile missing",
        "ENOENT: /root/.cache/x missing",
        r"EPERM: C:\Program Files\Client Name\file.txt",
        "open file:///home/someone/secret failed",
    ]
    .iter()
    .enumerate()
    .map(|(i, failure)| Entry {
        url: format!("{PAGE}-{i}"),
        failure: (*failure).into(),
        ..Entry::default()
    })
    .collect();
    base.notes = vec![format!(
        r"{PAGE}/x now resolves to https://www.ato.gov.au/home/y (redirect not checked: C:\Temp\a)"
    )];
    let body = render_issue(&base, true);
    for private in [
        "Work", "server", "someone", ".cache", "Temp", "Program", "Client", "secret",
    ] {
        assert!(!body.contains(private), "{private}");
    }
    assert_eq!(body.matches("(local path)").count(), 7);
    assert!(body.contains("https://www.ato.gov.au/home/y"));
}

#[test]
fn dead_and_unread_watched_sources_list_the_files_using_their_values() {
    let mut base = findings();
    base.review = vec![Entry {
        url: PAGE.into(),
        failure: "HTTP 404".into(),
        dead: true,
        values: vec![("2.7%".into(), vec!["tools/levy/index.html".into()])],
        ..Entry::default()
    }];
    assert!(render_issue(&base, true).contains(&format!(
        "\n\n- {PAGE}: HTTP 404. Cited in: no file\n  - `2.7%` appears in: `tools/levy/index.html`"
    )));
}

#[test]
fn an_issue_body_too_long_even_without_diffs_is_cut_below_the_github_limit() {
    let mut big = findings();
    big.quiet = (0..2000)
        .map(|i| Quiet {
            url: format!("{NEWSROOM}/{i}"),
            files: vec!["a".repeat(60)],
            change: Change {
                reason: "a newsroom".into(),
                ..Change::default()
            },
        })
        .collect();
    let body = render_issue(&big, true);
    assert!(body.chars().count() < 65_536);
    assert!(
        body.ends_with("\n\n(Cut at 60000 characters; the sweep's report lists every finding.)\n")
    );
}

#[test]
fn an_issue_body_too_long_for_github_drops_its_diffs() {
    let mut big = findings();
    big.review[0].change.as_mut().unwrap().diff = "x".repeat(70_000);
    let body = render_issue(&big, true);
    assert!(body.len() < 60_000);
    assert!(!body.contains("<details>"));
    assert!(body.contains("Last updated moved"));
}

#[test]
fn the_report_keeps_every_diff_and_adds_the_quiet_changes_and_redirects() {
    let report = render_report(&findings()).join("\n");
    assert!(report.starts_with("# ATO sources check 2026-10-19\n\n370 pages read, 2 new to the baseline.\n\n## To review\n\n"));
    assert!(report.contains(r"PermissionError: C:\Users"));
    assert!(report.contains(&format!("## Changed, no review needed\n\n### {NEWSROOM}\n\nA newsroom, whose article list changes weekly. Cited in: `au-fpa-pack/README.md`\n\n```diff\n+ New article\n```")));
    assert!(report.contains("## Permanent redirects\n\n"));
    assert!(report.contains("## Notes\n\n- "));
    let empty = render_report(&Findings {
        date: "2026-10-19".into(),
        ..Findings::default()
    });
    assert_eq!(
        empty,
        [
            "# ATO sources check 2026-10-19",
            "",
            "0 pages read, 0 new to the baseline.",
            "",
            "## To review",
            "",
            "None.",
            ""
        ]
    );
}

#[test]
fn the_exit_code_is_1_for_an_unread_page_and_2_for_a_substantive_change_or_a_permanent_redirect() {
    let Findings { review, moves, .. } = findings();
    assert_eq!(exit_code(&review, &moves), 1);
    assert_eq!(exit_code(&review[..1], &[]), 2);
    assert_eq!(exit_code(&[], &moves), 2);
    assert_eq!(exit_code(&[], &[]), 0);
}

#[test]
fn the_ato_page_date_is_read_as_an_iso_date() {
    assert_eq!(
        last_updated("Changes to credit card payments\nLast updated 15 October 2026\nPrint")
            .as_deref(),
        Some("2026-10-15")
    );
    assert_eq!(
        last_updated("Last updated 1 July 2026").as_deref(),
        Some("2026-07-01")
    );
    assert_eq!(
        last_updated("Last updated: 1 July 2026").as_deref(),
        Some("2026-07-01")
    );
    assert_eq!(last_updated(TEXT), None);
    assert_eq!(
        last_updated("Last updated\n15 October 2026").as_deref(),
        Some("2026-10-15")
    );
    assert_eq!(last_updated("Last updated 31 February 2026"), None);
    assert_eq!(last_updated("Last updated 32 October 2026"), None);
}

#[test]
fn check_dates_must_be_real_yyyy_mm_dd_dates() {
    for good in ["2026-09-27", "2028-02-29"] {
        assert!(is_iso_date(Some(&json!(good))), "{good}");
    }
    for bad in [
        json!("2026-9-30"),
        json!("2026-02-30"),
        json!("2026-13-01"),
        json!("2026-10-32"),
        json!("30 September 2026"),
        json!(""),
        json!(20260927),
    ] {
        assert!(!is_iso_date(Some(&bad)), "{bad}");
    }
    assert!(!is_iso_date(None));
    let data = json!({"facts_checked": "2026-09-27", "sources": {}, "questions": [{"id": 6, "source": "pay", "fact": "x", "fact_checked": "2026-9-30"}]});
    assert_eq!(
        answers_to_recheck(&data, &HashMap::new()),
        Err("_data/accounting_questions.json: question 6 check date 2026-9-30 is not a YYYY-MM-DD date".into())
    );
}

#[test]
fn every_check_date_in_this_sites_accounting_questions_is_valid() {
    let data = read_json(&common::repository().join(QUESTIONS));
    assert!(answers_to_recheck(&data, &HashMap::new()).is_ok());
}

#[test]
fn an_answer_is_rechecked_when_a_page_it_cites_is_dated_after_its_check_even_on_first_read() {
    let card = format!("{NEWSROOM}/changes-to-credit-card-payments");
    let data = json!({
        "facts_checked": "2026-09-27",
        "sources": {"pay": {"url": PAGE}, "card": {"url": card}, "none": {"url": "https://www.ato.gov.au/unread"}},
        "questions": [
            {"id": 6, "source": "pay", "fact": "Credit cards until 30 November 2026.", "fact_sources": ["card", "none"]},
            {"id": 7, "source": "card", "fact": "Rechecked.", "fact_sources": [], "fact_checked": "2026-10-20"},
            {"id": 8, "source": "card", "fact": "", "fact_sources": []},
            {"id": 9, "source": "card", "fact": "Same day.", "fact_sources": ["card"], "fact_checked": "2026-10-15"},
        ],
    });
    let texts = HashMap::from([
        (
            PAGE.to_owned(),
            format!("{TEXT}\nLast updated 2 September 2026"),
        ),
        (
            card.clone(),
            "Changes to credit card payments\nLast updated 15 October 2026".to_owned(),
        ),
    ]);
    assert_eq!(
        answers_to_recheck(&data, &texts).unwrap(),
        [(card, "2026-10-15".to_owned(), vec![json!(6)])]
    );
}

#[test]
fn a_pdf_is_fetched_directly_and_recorded_by_its_digest() {
    let port = common::http::fixture(|path, headers| {
        let agent = headers
            .iter()
            .find(|(n, _)| n == "user-agent")
            .map_or("", |(_, v)| v.as_str())
            .to_owned();
        match path {
            "/moved.pdf" => (
                301,
                vec![("Location".into(), "/rule.pdf".into())],
                Vec::new(),
            ),
            "/rule.pdf" => (
                200,
                vec![("Content-Type".into(), "application/pdf".into())],
                agent.into_bytes(),
            ),
            "/page.pdf" => (
                200,
                vec![("Content-Type".into(), "text/html".into())],
                Vec::new(),
            ),
            "/bare.pdf" => (200, Vec::new(), Vec::new()),
            _ => (404, Vec::new(), Vec::new()),
        }
    });
    let at = |path: &str| format!("http://127.0.0.1:{port}{path}");
    let read = read_pdf(&at("/moved.pdf"));
    // The body is the user agent the fixture saw: fetch's own, as the script sent.
    let digest = site_tools::sha256(b"node");
    assert_eq!(
        read,
        Page {
            status: Some(200.0),
            final_url: Some(at("/rule.pdf")),
            text: Some(format!("PDF, 4 bytes, sha256 {digest}")),
            ..Page::default()
        }
    );
    assert_eq!(
        read_pdf(&at("/page.pdf")),
        Page::error("expected a PDF, got text/html")
    );
    assert_eq!(
        read_pdf(&at("/bare.pdf")),
        Page::error("expected a PDF, got no content type")
    );
    assert_eq!(
        read_pdf(&at("/gone.pdf")),
        Page {
            status: Some(404.0),
            ..Page::default()
        }
    );
}

#[test]
fn a_pdf_that_cannot_be_fetched_is_tried_three_times() {
    // A port nothing listens on: bind one, then free it.
    let port = std::net::TcpListener::bind(("127.0.0.1", 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let started = std::time::Instant::now();
    let read = read_pdf(&format!("http://127.0.0.1:{port}/rule.pdf"));
    assert_eq!(read, Page::error("PDF fetch failed: ECONNREFUSED"));
    // Three attempts, three seconds apart.
    assert!(started.elapsed() >= std::time::Duration::from_secs(6));
}

#[test]
fn a_redirect_is_read_without_following_it() {
    let port = common::http::fixture(|path, headers| {
        let header = |name: &str| {
            headers
                .iter()
                .find(|(n, _)| n == name)
                .map(|(_, v)| v.as_str())
        };
        // fetch's own request headers, so the ATO sees the request the script made.
        let fetch = header("user-agent") == Some("node")
            && header("accept") == Some("*/*")
            && header("accept-language") == Some("*")
            && header("sec-fetch-mode") == Some("cors");
        match path {
            _ if !fetch => (400, Vec::new(), Vec::new()),
            "/old" => (301, vec![("Location".into(), "/new".into())], Vec::new()),
            _ => (200, Vec::new(), Vec::new()),
        }
    });
    assert_eq!(
        get_unfollowed(&format!("http://127.0.0.1:{port}/old")),
        Ok((301, Some("/new".into())))
    );
    assert_eq!(
        get_unfollowed(&format!("http://127.0.0.1:{port}/new")),
        Ok((200, None))
    );
}

/// A stand-in for `nodriver batch`: every URL in the list is read with the text in
/// `$PAGE_TEXT`, a fixed page otherwise, at status `$PAGE_STATUS`, 200 otherwise, and its
/// arguments go to `$ARGS_FILE` when set. A line `URL STATUS TEXT_FILE` in the `$PAGES` file
/// answers for that URL instead.
#[cfg(unix)]
const FAKE_NODRIVER: &str = r#"#!/bin/sh
list="$3"; out="$5"; mkdir -p "$out"; i=0; sep=''
[ -n "$ARGS_FILE" ] && printf '%s\n' "$*" >> "$ARGS_FILE"
printf '[' > "$out/index.json"
while IFS= read -r url || [ -n "$url" ]; do
  i=$((i + 1))
  status="${PAGE_STATUS-200}"
  printf '%s' "${PAGE_TEXT-A fixed page, long enough to count as the text of a page.}" > "$out/$i.txt"
  line=$(grep -F "$url " "${PAGES:-/dev/null}")
  if [ -n "$line" ]; then
    status=${line#* }; status=${status%% *}
    cp "${line##* }" "$out/$i.txt"
  fi
  printf '%s{"url": "%s", "status": %s, "final_url": "%s", "truncated": false, "file": "%s.txt"}' "$sep" "$url" "$status" "$url" "$i" >> "$out/index.json"
  sep=','
done < "$list"
printf ']' >> "$out/index.json"
"#;

#[cfg(unix)]
fn fake_nodriver(name: &str) -> tempfile::TempDir {
    use std::os::unix::fs::PermissionsExt;
    let bin = tempfile::tempdir().unwrap();
    let path = bin.path().join(name);
    std::fs::write(&path, FAKE_NODRIVER).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    bin
}

#[cfg(unix)]
#[test]
fn a_batch_is_read_from_the_index_nodriver_writes() {
    let bin = fake_nodriver("nodriver");
    let script = bin.path().join("nodriver");
    let script = script.to_str().unwrap();
    let urls = [PAGE.to_owned(), LEVY.to_owned()];
    let pages = run_batch_with(&[script, "server.py"], &urls, &["--main"]).unwrap();
    assert_eq!(pages.len(), 2);
    let text = "A fixed page, long enough to count as the text of a page.";
    assert_eq!(
        pages[PAGE],
        Page {
            status: Some(200.0),
            final_url: Some(PAGE.into()),
            text: Some(text.into()),
            ..Page::default()
        }
    );
    let missing = run_batch_with(&["/nonexistent/nodriver"], &urls, &[]).unwrap_err();
    assert_eq!(
        missing,
        "nodriver batch wrote no index (spawnSync /nonexistent/nodriver ENOENT); see its output above"
    );
    let failing = run_batch_with(&["/bin/sh", "-c", "exit 3"], &urls, &[]).unwrap_err();
    assert_eq!(
        failing,
        "nodriver batch wrote no index (exit 3); see its output above"
    );
}

#[test]
fn a_dead_read_needs_one_at_least_three_days_old_to_agree() {
    assert!(!dead_confirmed("2026-11-05", "2026-11-05"));
    assert!(!dead_confirmed("2026-11-03\n", "2026-11-05"));
    assert!(dead_confirmed("2026-11-02", "2026-11-05"));
    assert!(dead_confirmed("2026-10-31", "2026-11-05"));
    assert!(dead_confirmed("not a date", "2026-11-05"));
}

#[cfg(unix)]
#[test]
fn a_dead_link_fails_a_sweep_only_when_a_later_read_agrees() {
    let bin = fake_nodriver(site_tools::ato_sources::NODRIVER[0]);
    let root = tempfile::tempdir().unwrap();
    let site = root.path().join("site");
    write(
        &site.join("rates/index.html"),
        &format!(r#"<a href="{PAGE}">GIC</a>"#),
    );
    let (baseline, out, issue) = (
        root.path().join("baseline"),
        root.path().join("out"),
        root.path().join("issue.md"),
    );
    let path = format!("{}:/usr/bin:/bin", bin.path().display());
    let marker = baseline.join(dead_marker(PAGE));
    let run = |status: &str| {
        Command::new(env!("CARGO_BIN_EXE_site-tools"))
            .args(["check_ato_sources", "--baseline"])
            .arg(&baseline)
            .arg("--out")
            .arg(&out)
            .arg("--issue")
            .arg(&issue)
            .arg(&site)
            .env("PATH", &path)
            .env("PAGE_TEXT", TEXT)
            .env("PAGE_STATUS", status)
            .output()
            .unwrap()
    };
    assert_eq!(run("200").status.code(), Some(0));

    // The first dead read is noted and held, with its date on file.
    let first = run("404");
    assert_eq!(first.status.code(), Some(0));
    let today = std::fs::read_to_string(&marker).unwrap();
    assert!(String::from_utf8_lossy(&first.stdout).contains(&format!(
        "{PAGE} read as dead on {today}; held until a read at least 3 days later agrees"
    )));
    let body = std::fs::read_to_string(&issue).unwrap();
    assert!(
        body.contains("0 returned HTTP 404 or 410 (dead links)"),
        "{body}"
    );

    // A read within the hold changes nothing, and the first date stays.
    let today = site_tools::py::Date::fromisoformat(&today).unwrap();
    let days_ago = |days: i64| today.add_days(-days).unwrap().isoformat();
    std::fs::write(&marker, days_ago(2)).unwrap();
    assert_eq!(run("410").status.code(), Some(0));
    assert_eq!(std::fs::read_to_string(&marker).unwrap(), days_ago(2));

    // A read 3 days after the first agrees, so the link fails the run from then on.
    std::fs::write(&marker, days_ago(3)).unwrap();
    let confirmed = run("404");
    assert_eq!(confirmed.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&confirmed.stderr).contains(&format!("{PAGE}: HTTP 404\n")));

    // A page that reads again clears its hold.
    assert_eq!(run("200").status.code(), Some(0));
    assert!(!marker.exists());
}

/// A site citing `links`, swept by separate processes that share only the baseline
/// folder, as the weekly scheduled runs do.
#[cfg(unix)]
struct Sweep {
    bin: tempfile::TempDir,
    root: tempfile::TempDir,
}

#[cfg(unix)]
impl Sweep {
    fn new(links: &[&str], questions: Option<Value>) -> Self {
        let root = tempfile::tempdir().unwrap();
        let site = root.path().join("site");
        let html: Vec<String> = links
            .iter()
            .map(|link| format!(r#"<a href="{link}">Source</a>"#))
            .collect();
        write(&site.join("rates/index.html"), &html.join("\n"));
        if let Some(questions) = questions {
            write(
                &site.join("_data/accounting_questions.json"),
                &questions.to_string(),
            );
        }
        let bin = fake_nodriver(site_tools::ato_sources::NODRIVER[0]);
        Self { bin, root }
    }

    fn marker(&self, url: &str) -> PathBuf {
        self.root.path().join("baseline").join(dead_marker(url))
    }

    /// One process over `pages`: (URL, status, page text).
    fn run(&self, pages: &[(&str, &str, &str)]) -> Output {
        let root = self.root.path();
        let mut lines = String::new();
        for (i, (url, status, text)) in pages.iter().enumerate() {
            let file = root.join(format!("page-{i}.txt"));
            std::fs::write(&file, text).unwrap();
            lines.push_str(&format!("{url} {status} {}\n", file.display()));
        }
        let list = root.join("pages.txt");
        std::fs::write(&list, lines).unwrap();
        Command::new(env!("CARGO_BIN_EXE_site-tools"))
            .arg("check_ato_sources")
            .arg("--baseline")
            .arg(root.join("baseline"))
            .arg("--out")
            .arg(root.join("out"))
            .arg("--issue")
            .arg(root.join("issue.md"))
            .arg(root.join("site"))
            .env(
                "PATH",
                format!("{}:/usr/bin:/bin", self.bin.path().display()),
            )
            .env("PAGES", &list)
            .output()
            .unwrap()
    }
}

#[cfg(unix)]
#[test]
fn a_page_that_reads_again_ends_a_dead_hold_even_when_its_text_changed() {
    let sweep = Sweep::new(&[PAGE], None);
    assert_eq!(sweep.run(&[(PAGE, "200", TEXT)]).status.code(), Some(0));
    assert_eq!(sweep.run(&[(PAGE, "404", TEXT)]).status.code(), Some(0));
    let marker = sweep.marker(PAGE);
    let today = std::fs::read_to_string(&marker).unwrap();
    std::fs::write(&marker, "2026-01-01").unwrap();

    // The read clears the old date and still reports the change.
    let changed = TEXT.replace("11.17%", "12.34%");
    let recovered = sweep.run(&[(PAGE, "200", &changed)]);
    assert_eq!(recovered.status.code(), Some(2));
    let stderr = String::from_utf8_lossy(&recovered.stderr);
    assert!(stderr.contains(&format!("{PAGE}: changed since the previous run")));
    assert!(!marker.exists());

    // So a later dead read starts a new hold instead of agreeing with the old date.
    assert_eq!(sweep.run(&[(PAGE, "404", TEXT)]).status.code(), Some(0));
    assert_eq!(std::fs::read_to_string(&marker).unwrap(), today);
}

#[cfg(unix)]
#[test]
fn a_page_that_cannot_be_read_keeps_a_dead_hold() {
    let sweep = Sweep::new(&[PAGE], None);
    assert_eq!(sweep.run(&[(PAGE, "200", TEXT)]).status.code(), Some(0));
    assert_eq!(sweep.run(&[(PAGE, "404", TEXT)]).status.code(), Some(0));
    assert_eq!(sweep.run(&[(PAGE, "500", TEXT)]).status.code(), Some(1));
    assert!(sweep.marker(PAGE).exists());
    assert_eq!(sweep.run(&[(PAGE, "200", "short")]).status.code(), Some(1));
    assert!(sweep.marker(PAGE).exists());
}

#[cfg(unix)]
#[test]
fn a_held_dead_link_leaves_every_other_finding_its_report_and_exit_code() {
    let held = "https://www.ato.gov.au/held-page";
    let broken = "https://www.ato.gov.au/broken-page";
    let changing = "https://www.ato.gov.au/changing-page";
    let stale = "https://www.ato.gov.au/stale-page";
    let questions = json!({
        "facts_checked": "2026-09-27",
        "sources": {"stale": {"url": stale}},
        "questions": [{"id": 6, "source": "stale", "fact": "A checked fact.", "fact_sources": []}],
    });
    let sweep = Sweep::new(&[held, broken, changing], Some(questions));
    let changed = TEXT.replace("11.17%", "12.34%");
    let again = TEXT.replace("11.17%", "13.57%");
    let dated = format!("{TEXT}\nLast updated 3 November 2026");
    let seed = [
        (held, "200", TEXT),
        (broken, "200", TEXT),
        (changing, "200", TEXT),
        (stale, "200", TEXT),
    ];
    assert_eq!(sweep.run(&seed).status.code(), Some(0));

    // A 500 is a broken read, so the run exits 1 whatever else it found.
    let first = sweep.run(&[
        (held, "404", TEXT),
        (broken, "500", TEXT),
        (changing, "200", &changed),
        (stale, "200", &dated),
    ]);
    assert_eq!(first.status.code(), Some(1));
    let stdout = String::from_utf8_lossy(&first.stdout);
    let stderr = String::from_utf8_lossy(&first.stderr);
    let recheck = format!("{stale}: updated 2026-11-03, after the answers to questions 6");
    assert!(stdout.contains(&format!("{held} read as dead on ")));
    assert!(stderr.contains(&format!("{broken}: HTTP 500\n")));
    assert!(stderr.contains(&format!("{changing}: changed since the previous run\n")));
    assert!(stderr.contains(&recheck));
    assert!(!stderr.contains(&format!("{held}:")));
    assert!(sweep.marker(held).exists());

    // Without the 500 the same findings exit 2, and the link stays held.
    let second = sweep.run(&[
        (held, "404", TEXT),
        (broken, "200", TEXT),
        (changing, "200", &again),
        (stale, "200", &dated),
    ]);
    assert_eq!(second.status.code(), Some(2));
    let stdout = String::from_utf8_lossy(&second.stdout);
    let stderr = String::from_utf8_lossy(&second.stderr);
    assert!(stdout.contains(&format!("{held} read as dead on ")));
    assert!(stderr.contains(&format!("{changing}: changed since the previous run\n")));
    assert!(stderr.contains(&recheck));
    assert!(!stderr.contains(&format!("{held}:")));
    assert!(!stderr.contains(&format!("{broken}:")));
}

/// The sources the 5 swept repositories cited on 11 November 2026; 561 of them on
/// 9 November stopped the weekly sweep at the old limit of 500.
#[cfg(unix)]
const SOURCES_2026_11_11: usize = 562;

#[cfg(unix)]
#[test]
fn a_sweep_of_562_sources_is_read() {
    let urls = cited_urls(SOURCES_2026_11_11);
    let links: Vec<&str> = urls.iter().map(String::as_str).collect();
    let run = Sweep::new(&links, None).run(&[]);
    assert_eq!(
        run.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&run.stderr)
    );
    assert_eq!(
        String::from_utf8_lossy(&run.stdout),
        format!(
            "{SOURCES_2026_11_11} sources read, {SOURCES_2026_11_11} new to the baseline, 0 changed with nothing to review\n"
        )
    );
}

#[cfg(unix)]
#[test]
fn a_sweep_seeds_the_baseline_then_reports_a_change_with_its_issue() {
    // The binary runs nodriver by its Windows path; on Unix a program name without a
    // slash is looked up on PATH, so a stand-in of that name answers for the browser.
    let bin = fake_nodriver(site_tools::ato_sources::NODRIVER[0]);
    let root = tempfile::tempdir().unwrap();
    let site = root.path().join("site");
    write(
        &site.join("rates/index.html"),
        &format!(r#"<a href="{PAGE}">GIC</a>"#),
    );
    let (baseline, out, issue) = (
        root.path().join("baseline"),
        root.path().join("out"),
        root.path().join("issue.md"),
    );
    let path = format!("{}:/usr/bin:/bin", bin.path().display());
    let arguments = root.path().join("args.txt");
    let run = |text: &str| {
        Command::new(env!("CARGO_BIN_EXE_site-tools"))
            .args([
                "check_ato_sources",
                "--baseline",
                baseline.to_str().unwrap(),
                "--out",
                out.to_str().unwrap(),
                "--issue",
                issue.to_str().unwrap(),
                site.to_str().unwrap(),
            ])
            .env("PATH", &path)
            .env("PAGE_TEXT", text)
            .env("ARGS_FILE", &arguments)
            .output()
            .unwrap()
    };
    let seeded = run(TEXT);
    assert_eq!(
        seeded.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&seeded.stderr)
    );
    assert_eq!(
        String::from_utf8_lossy(&seeded.stdout),
        "4 sources read, 4 new to the baseline, 0 changed with nothing to review\n"
    );
    assert_eq!(
        std::fs::read_to_string(baseline.join(baseline_file(PAGE))).unwrap(),
        TEXT
    );
    let changed = run(&TEXT.replace("11.17%", "11.42%"));
    assert_eq!(changed.status.code(), Some(2));
    let stderr = String::from_utf8_lossy(&changed.stderr);
    for (url, _) in WATCHED.iter().copied().chain([(PAGE, &[][..])]) {
        assert!(
            stderr.contains(&format!("{url}: changed since the previous run\n")),
            "{url}"
        );
    }
    let body = std::fs::read_to_string(&issue).unwrap();
    assert!(body.starts_with("The weekly ATO source sweep of "));
    assert!(body.contains(" read 4 pages: 4 changed substantively,"));
    assert!(body.contains(&format!("### {LEVY}\n\nChanged since the previous run. Cited in: no file\n\n`2.7%` appears in: no file")));
    let reports: Vec<PathBuf> = std::fs::read_dir(&out)
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    assert_eq!(reports.len(), 1);
    let report = std::fs::read_to_string(&reports[0]).unwrap();
    // The same day's second run is added to the first run's report.
    assert!(report.contains("\n\n---\n\n# ATO sources check "));
    assert!(report.contains("- The rate for the December quarter is 11.17%.\n+ The rate for the December quarter is 11.42%."));
    // One batch a run, all four pages read through their containers.
    let batches = std::fs::read_to_string(&arguments).unwrap();
    let batches: Vec<&str> = batches.lines().collect();
    assert_eq!(batches.len(), 2);
    for batch in batches {
        assert!(
            batch.starts_with(r"C:\Tools\nodriver-browser\server.py batch "),
            "{batch}"
        );
        assert!(
            batch.ends_with(" --wait 3 --selector #content, main"),
            "{batch}"
        );
    }
}
