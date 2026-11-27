// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Edge cases of seo_core: sitemap errors and duplicates, document dates, repeated
//! attributes, unclosed sections, robots lines and FAQ answers that are not objects.
use site_tools::effective_life_pages::SITEMAP_REL;
use site_tools::pyjson::{self, Json};
use site_tools::seo_core as core;
use std::collections::HashSet;
use std::path::Path;

const SITE: &str = "https://example.com";

fn write(root: &Path, rel: &str, text: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

fn page(modified: &str) -> String {
    format!(
        r#"<html><head><script type="application/ld+json">[{{"@type":"WebPage","dateModified":"{modified}"}},{{"@type":"Thing","dateModified":"1999-01-01"}}]</script></head></html>"#
    )
}

#[test]
fn a_missing_sitemap_is_an_error() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(root, "index.html", &page("2026-01-01"));
    let paths = [root.join("index.html")];
    assert!(core::check_sitemap(&paths, SITE, &HashSet::new(), root).is_err());
    // The family's pages need the family sitemap too.
    write(
        root,
        "sitemap.xml",
        "<urlset><url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url></urlset>",
    );
    let family = root.join("tools/depreciation-rates/asset/a/index.html");
    write(
        root,
        "tools/depreciation-rates/asset/a/index.html",
        &page("2026-01-01"),
    );
    assert!(core::check_sitemap(&[paths[0].clone(), family], SITE, &HashSet::new(), root).is_err());
}

#[test]
fn sitemap_reports_duplicates_and_a_missing_family_line_and_reads_document_dates() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(root, "index.html", &page("2026-01-01"));
    let entry = "<url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url>";
    write(
        root,
        "sitemap.xml",
        &format!("<urlset>{entry}{entry}</urlset>"),
    );
    write(root, SITEMAP_REL, "<urlset></urlset>");
    write(root, "llms.txt", "");
    write(
        root,
        "robots.txt",
        "Sitemap: https://example.com/sitemap.xml\n",
    );
    let (failures, _) =
        core::check_sitemap(&[root.join("index.html")], SITE, &HashSet::new(), root).unwrap();
    assert!(failures.contains(&"sitemap.xml: duplicate <loc> entries".to_owned()));
    assert!(failures.contains(&format!("robots.txt: no Sitemap line for {SITEMAP_REL}")));
    // The Thing's older date does not count beside the page's own WebPage date.
    assert!(
        !failures.iter().any(|f| f.contains("lastmod")),
        "{failures:?}"
    );
}

#[test]
fn a_repeated_attribute_keeps_its_last_value() {
    let tree = core::parse_structure(r#"<a id="first" ID="second">x</a>"#);
    let anchor = tree.by_id("second");
    assert_eq!(anchor.len(), 1);
    assert_eq!(tree.attr(anchor[0], "id"), Some("second"));
}

#[test]
fn an_unclosed_section_runs_to_the_end() {
    let html = r#"<p>before</p><section id="tail"><p>last words</p>"#;
    assert_eq!(
        core::section_html(html, "tail"),
        r#"<section id="tail"><p>last words</p>"#
    );
}

#[test]
fn robots_lines_without_a_colon_are_skipped() {
    let groups = core::robots_groups("User-agent: a\nnot a directive\nAllow: /\n");
    assert_eq!(groups, [("a".to_owned(), vec!["Allow: /".to_owned()])]);
}

#[test]
fn a_claim_that_is_not_text_normalises_to_nothing() {
    assert_eq!(core::normalise_claim(None), "");
    assert_eq!(core::normalise_claim(Some(&Json::Bool(true))), "");
    assert_eq!(
        core::normalise_claim(Some(&Json::str_obj(" a \n b "))),
        "a b"
    );
}

#[test]
fn an_faq_answer_that_is_not_an_object_has_no_text() {
    let node = pyjson::loads(
        r#"{"@type":"FAQPage","mainEntity":[{"name":"Why?","acceptedAnswer":"Because."}]}"#,
    )
    .unwrap();
    let html = r#"<div class="faq"><h3>Why?</h3><p>Because.</p></div>"#;
    let mut failures = Vec::new();
    core::check_faq_visible(&node, html, "f.html", &mut failures);
    assert_eq!(
        failures,
        ["f.html: FAQPage item 1 answer does not match the visible FAQ"]
    );
}
