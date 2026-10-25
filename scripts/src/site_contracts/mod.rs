//! scripts/site_contracts.py: Ryan Duguid site-specific SEO and content contracts.
//!
//! Each check keeps the Python function's name, order of findings and
//! messages. A function that read a file Python would have failed to read
//! returns that failure as an error, which the command reports as the one
//! line that replaced Python's traceback.
pub mod data;
mod pages;
mod site;

pub use data::*;
pub use pages::*;
pub use site::*;

use crate::pyjson::Json;
use crate::seo_core::Tree;
use std::path::{Path, PathBuf};

/// The approved social-card image and alt for one canonical page.
pub fn social_metadata_for_page(rel: &str) -> (Option<String>, Option<String>) {
    let context = if [
        "index.html",
        "about/index.html",
        "contact/index.html",
        "changelog/index.html",
        "privacy/index.html",
    ]
    .contains(&rel)
    {
        "site"
    } else if rel == EVIDENCE_REL {
        "evidence"
    } else if rel.starts_with("tools/") || rel.starts_with("works-with/") {
        "tools"
    } else if rel.starts_with("evaluate/") || rel.starts_with("examples/") {
        "evaluations"
    } else if rel.starts_with("rates/") {
        "rates"
    } else {
        return (None, None);
    };
    let card = social_card(context);
    (
        Some(format!("{SITE}/assets/{}", card.output)),
        Some(format!("OLED register card: {}", card.heading.join(" "))),
    )
}

/// A JSON string value.
pub(crate) fn s(text: &str) -> Json {
    Json::str_obj(text)
}

/// A JSON object from key and value pairs.
pub(crate) fn obj(pairs: Vec<(&str, Json)>) -> Json {
    Json::Object(pairs.into_iter().map(|(k, v)| (k.to_owned(), v)).collect())
}

pub(crate) fn int(value: usize) -> Json {
    Json::Int(num_bigint::BigInt::from(value))
}

/// `value == expected` where a missing value is Python's `None`.
pub(crate) fn eq(value: Option<&Json>, expected: &Json) -> bool {
    value.unwrap_or(&Json::Null).py_eq(expected)
}

/// `{"@id": PERSON_ID}`.
pub(crate) fn person_ref() -> Json {
    obj(vec![("@id", s(PERSON_ID))])
}

pub(crate) fn rendered(tree: &Tree, tag: Option<&str>) -> Vec<usize> {
    tree.descendants(Tree::ROOT, tag, true)
}

pub(crate) fn rendered_with_class(
    tree: &Tree,
    scope: usize,
    tag: Option<&str>,
    class: &str,
) -> Vec<usize> {
    tree.descendants(scope, tag, true)
        .into_iter()
        .filter(|e| tree.has_class(*e, class))
        .collect()
}

/// `path.read_text(encoding="utf-8") if path.is_file() else ""`.
pub(crate) fn read_if_file(path: &Path) -> Result<String, String> {
    if path.is_file() {
        crate::read(path)
    } else {
        Ok(String::new())
    }
}

/// A site path built from `/`-separated parts, as pathlib joins and renders them.
pub(crate) fn site_path(root: &Path, rel: &str) -> PathBuf {
    rel.split('/')
        .fold(root.to_path_buf(), |path, part| path.join(part))
}

/// Check contracts specific to this site's shell and content for one page.
pub fn check_file_contracts(path: &Path, root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let rel = crate::seo_core::rel(path, root);
    let html = crate::read(path)?;
    check_shared_shell(&html, &rel, &mut failures);
    if rel == "index.html" {
        check_homepage_contract(&html, &mut failures);
    }
    if ARTICLE_PATTERN_PAGES.contains(&rel.as_str()) {
        check_article_pattern(&html, &rel, &mut failures);
    }
    if RATE_PAGES.contains(&rel.as_str()) {
        check_rate_table_region(&html, &rel, &mut failures);
    }
    if rel == CALCULATOR_REL {
        let module = calculator_module_source(root)?;
        check_calculator_contract(&html, &mut failures, &module);
    }
    check_approved_page_opening(&html, &rel, &mut failures);
    check_header_review_date(&html, &rel, &mut failures);
    check_collection_breadcrumb(&html, &rel, &mut failures);
    check_question_answers(&html, &rel, &mut failures);
    Ok(failures)
}

/// Check the cross-page contracts specific to this site.
pub fn check_site_contracts(paths: &[PathBuf], root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let robots = crate::read(&root.join("robots.txt"))?;
    failures.extend(check_person_graph(paths, root)?);
    failures.extend(check_evidence_page(root)?);
    failures.extend(check_authority_surface(root)?);
    failures.extend(check_worked_examples(root)?);
    failures.extend(check_evaluation_packs(root)?);
    failures.extend(check_xero_evaluation_summary(root)?);
    failures.extend(check_task_routes(root)?);
    failures.extend(check_privacy_delivery_claims(root)?);
    failures.extend(check_collection_hubs(root)?);
    failures.extend(check_social_cards(root)?);
    failures.extend(check_robots_policy(&robots));
    failures.extend(check_canonical_identity_urls(paths, root)?);
    Ok(failures)
}
