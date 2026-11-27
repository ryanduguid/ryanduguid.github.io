// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Edge cases of site_contracts::site that the whole-site mutation tests do not reach:
//! malformed nodes, retired claims, unreadable files and recipe whitespace.
use site_tools::pyjson::{self, Json};
use site_tools::site_contracts as contracts;
use std::path::Path;

fn write(root: &Path, rel: &str, text: &str) {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, text).unwrap();
}

fn has(failures: &[String], expected: &str) -> bool {
    failures.iter().any(|f| f.contains(expected))
}

#[test]
fn person_stub_that_is_not_an_object_carries_no_fields() {
    let canonical = pyjson::loads(r#"{"@type":"Person","@id":"x"}"#).unwrap();
    let failures =
        contracts::check_person_stub("tools/example/index.html", &Json::Null, &canonical);
    // A rate page may carry a stub, so the only failure is the empty field set.
    let page = contracts::RATE_PAGES[0];
    let failures_on_rate_page = contracts::check_person_stub(page, &Json::Null, &canonical);
    assert!(
        has(&failures, "must not define a Person node"),
        "{failures:?}"
    );
    assert!(
        has(&failures_on_rate_page, "Person stub must carry exactly")
            && has(&failures_on_rate_page, "found []"),
        "{failures_on_rate_page:?}"
    );
}

#[test]
fn article_credited_to_another_person_is_reported_per_field() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(
        root,
        "index.html",
        r#"<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"TechArticle","author":{"@id":"someone-else"},"publisher":{"@id":"someone-else"}}</script></head><body></body></html>"#,
    );
    let failures = contracts::check_person_graph(&[root.join("index.html")], root).unwrap();
    assert!(has(
        &failures,
        "index.html article author must name the canonical Person"
    ));
    assert!(has(
        &failures,
        "index.html article publisher must name the canonical Person"
    ));
}

#[test]
fn authority_section_with_another_heading_is_refused() {
    let html = r#"<html><body><section id="adopt"><h2>Something else</h2><p>Use it here.</p><a href="/x/">go</a></section></body></html>"#;
    let failures = contracts::check_authority_section(html, "adopt", "Adopt it", "Use it", "/x/");
    assert_eq!(
        failures,
        ["index.html: authority section #adopt must open with Adopt it"]
    );
}

#[test]
fn retired_install_command_and_first_release_claim_are_refused() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(
        root,
        "index.html",
        "<html><body><p>claude mcp add aus-accounting -- uvx --from git+https://github.com/ryanduguid/aus-accounting-mcp aus-accounting-mcp</p></body></html>",
    );
    write(
        root,
        contracts::MCP_REL,
        "<html><body><p>This is the first PyPI release.</p></body></html>",
    );
    let failures = contracts::check_authority_surface(root).unwrap();
    assert!(has(
        &failures,
        "index.html: retired GitHub-source install command"
    ));
    assert!(has(
        &failures,
        &format!("{}: stale first-PyPI-release claim", contracts::MCP_REL)
    ));
}

#[test]
fn payday_dates_compare_absent_attributes_and_reject_non_text_records() {
    // A null recorded date matches an element with no datetime; a numeric one never
    // matches an attribute, and neither parses as a date.
    let html = r#"<html><body>
        <span data-example="payment_date">invalid recorded date</span>
        <time data-example="remitted_date" datetime="5">invalid recorded date</time>
        </body></html>"#;
    let record = pyjson::loads(r#"{"payment_date": null, "remitted_date": 5}"#).unwrap();
    let failures = contracts::check_payday_example(html, &record);
    assert!(!has(&failures, "for payment_date"), "{failures:?}");
    assert!(has(
        &failures,
        "fixed Payday example: date drift for remitted_date"
    ));
}

#[test]
fn unclosed_evaluator_article_cannot_be_isolated() {
    let mut failures = Vec::new();
    let article = contracts::evaluation_article_html(
        r#"<main id="main"><article><p>text</p></main>"#,
        "e.html",
        &mut failures,
    );
    assert!(article.is_none());
    assert_eq!(
        failures,
        ["e.html: could not isolate the visible evaluator article"]
    );
}

#[test]
fn pack_without_a_limitations_section_has_no_assurance_link() {
    let pack = contracts::EvaluationPack {
        sections: &[("summary", "Summary")],
        ..contracts::EVALUATION_PACKS[0]
    };
    let mut failures = Vec::new();
    contracts::check_evaluation_structure(
        r#"<section id="summary"><h2>Summary</h2><a href="/evidence/">Evidence and Assurance</a></section>"#,
        "e.html",
        &pack,
        &mut failures,
    );
    assert_eq!(
        failures,
        [
            "e.html: #limitations must link /evidence/ with visible label 'Evidence and Assurance' exactly once, found 0"
        ]
    );
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[test]
fn evaluation_pack_recipes_ignore_trailing_blank_lines_and_need_one_code_block() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(root, "sitemap.xml", "<urlset></urlset>");
    write(root, "llms.txt", "");
    let [trailing, doubled, missing] = &contracts::EVALUATION_PACKS;
    let recipe = escape(&trailing.reproduction_recipe.join("\n"));
    write(
        root,
        trailing.rel,
        &format!(
            r#"<html><body><main id="main"><article><section id="reproduce"><code>{recipe}

</code></section></article></main></body></html>"#
        ),
    );
    write(
        root,
        doubled.rel,
        r#"<html><body><main id="main"><article><section id="reproduce"><code>a</code><code>b</code></section></article></main></body></html>"#,
    );
    write(
        root,
        missing.rel,
        "<html><body><p>no main</p></body></html>",
    );
    let failures = contracts::check_evaluation_packs(root).unwrap();
    let about =
        |rel: &str| -> Vec<&String> { failures.iter().filter(|f| f.starts_with(rel)).collect() };
    assert!(
        !about(trailing.rel).iter().any(|f| f.contains("#reproduce")),
        "{failures:?}"
    );
    assert!(has(
        &failures,
        &format!(
            "{}: #reproduce must contain exactly one visible code block, found 2",
            doubled.rel
        )
    ));
    // A page without its main stops at that failure: no article checks follow.
    assert_eq!(
        about(missing.rel)
            .iter()
            .filter(|f| !f.contains("TechArticle"))
            .map(|f| f.as_str())
            .collect::<Vec<_>>(),
        [format!(
            "{}: expected exactly one visible main, found 0",
            missing.rel
        )]
    );
}

#[test]
fn xero_summary_page_without_its_summary_list_is_incomplete() {
    let tmp = tempfile::tempdir().unwrap();
    let rel = "evaluate/xero-trial-balance-integrity/index.html";
    write(tmp.path(), rel, "<html><body><p>Problem</p></body></html>");
    assert_eq!(
        contracts::check_xero_evaluation_summary(tmp.path()).unwrap(),
        [format!("{rel}: evaluation summary is incomplete")]
    );
}

#[test]
fn robots_groups_outside_the_crawler_classes_are_refused() {
    let robots = "User-agent: *\nAllow: /\n\nUser-agent: Zebrabot\nAllow: /\n";
    let failures = contracts::check_robots_policy(robots);
    assert!(has(
        &failures,
        "robots.txt: unclassified crawler groups are not allowed: Zebrabot"
    ));
}

#[cfg(unix)]
#[test]
fn unreadable_social_card_is_an_error() {
    use std::os::unix::fs::PermissionsExt;
    let tmp = tempfile::tempdir().unwrap();
    let card = tmp
        .path()
        .join("assets")
        .join(contracts::SOCIAL_CARD_CONTEXTS[0].output);
    write(
        tmp.path(),
        &format!("assets/{}", contracts::SOCIAL_CARD_CONTEXTS[0].output),
        "x",
    );
    std::fs::set_permissions(&card, std::fs::Permissions::from_mode(0o000)).unwrap();
    if std::fs::read(&card).is_ok() {
        eprintln!("skipped: permissions do not bind this user");
        return;
    }
    let error = contracts::check_social_cards_for(tmp.path(), "").unwrap_err();
    assert!(error.contains("Permission denied"), "{error}");
}

#[test]
fn calculator_source_date_with_an_unknown_month_is_unreadable() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(
        root,
        contracts::CALCULATOR_HUB_REL,
        r#"<html><body><a href="/tools/business-calculators/gst/">GST</a></body></html>"#,
    );
    write(
        root,
        "tools/business-calculators/gst/index.html",
        "<html><body><p>Official comparison on 12 Smarch 2026</p></body></html>",
    );
    let failures = contracts::check_calculator_dates(root).unwrap();
    assert!(has(
        &failures,
        "tools/business-calculators/gst/index.html: unreadable date in 'Official comparison on 12 Smarch 2026'"
    ));
}
