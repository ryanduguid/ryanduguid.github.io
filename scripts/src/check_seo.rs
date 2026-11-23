// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! scripts/check_seo.py: discover pages, run SEO checks and report their results.
use crate::schema_vocab::Vocabulary;
use crate::seo_core::{self as core, MetadataContext};
use crate::site_contracts as contracts;
use std::collections::HashSet;
use std::path::Path;

fn say(line: &str) -> Result<(), String> {
    crate::print_text(&format!("{line}\n"), false).map_err(|e| e.to_string())
}

pub fn run(root: &Path) -> Result<u8, String> {
    let paths = core::html_files(root);
    let mut vocabulary = Vocabulary::load(root)?;
    vocabulary.allow_pending(&contracts::ALLOWED_PENDING_SCHEMA_TERMS)?;
    let not_indexed: HashSet<String> = contracts::NOT_INDEXED
        .iter()
        .map(|s| (*s).to_owned())
        .collect();
    let mut warnings = Vec::new();
    let mut failures = Vec::new();
    for path in &paths {
        let rel = core::rel(path, root);
        let (image, alt) = contracts::social_metadata_for_page(&rel);
        let context = MetadataContext {
            expected_social_image: image.as_deref(),
            expected_social_alt: alt.as_deref(),
            description_limits: contracts::TIGHT_META_DESCRIPTION_PAGES
                .contains(&rel.as_str())
                .then_some(contracts::TIGHT_META_DESCRIPTION_LIMITS),
        };
        failures.extend(core::check_file_metadata(
            path,
            contracts::SITE,
            &not_indexed,
            &mut warnings,
            &context,
            &vocabulary,
            root,
        )?);
        failures.extend(contracts::check_file_contracts(path, root)?);
        say(&format!("checked {rel}"))?;
    }
    let (sitemap_failures, listed) =
        core::check_sitemap(&paths, contracts::SITE, &not_indexed, root)?;
    failures.extend(sitemap_failures);
    failures.extend(check_orphan_pages(&paths, &not_indexed, root)?);
    failures.extend(contracts::check_site_contracts(&paths, root)?);
    say(&format!(
        "checked the sitemaps ({listed} URLs), llms.txt, robots.txt"
    ))?;
    for warning in &warnings {
        say(&format!("  WARN {warning}"))?;
    }
    if !failures.is_empty() {
        say(&format!("\n{} failure(s):", failures.len()))?;
        for failure in &failures {
            say(&format!("  FAIL {failure}"))?;
        }
        return Ok(1);
    }
    say("\nall clear")?;
    Ok(0)
}

/// Fail when any indexable core page other than the homepage has zero inbound HTML links.
fn check_orphan_pages(
    paths: &[std::path::PathBuf],
    not_indexed: &HashSet<String>,
    root: &Path,
) -> Result<Vec<String>, String> {
    let mut inbound: HashSet<String> = HashSet::new();
    let mut indexable: Vec<String> = Vec::new();
    for path in paths {
        let rel = core::rel(path, root);
        if crate::effective_life_pages::is_page(&rel) || not_indexed.contains(&rel) {
            continue;
        }
        let page_url = core::site_url(&rel, contracts::SITE);
        if rel != "index.html" {
            indexable.push(page_url.clone());
        }
        let html = crate::read(path)?;
        let tree = core::parse_structure(&html);
        for anchor in tree.descendants(core::Tree::ROOT, Some("a"), true) {
            let Some(href) = tree.attr(anchor, "href") else {
                continue;
            };
            if href.is_empty()
                || href.starts_with('#')
                || href.starts_with("mailto:")
                || href.starts_with("tel:")
                || href.starts_with("javascript:")
            {
                continue;
            }
            if let Ok(target) = crate::pyurl::urljoin(&page_url, href)
                && let Ok(parts) = crate::pyurl::urlsplit(&target)
                && parts.scheme == "https"
                && parts.netloc == "duguid.com.au"
            {
                let clean_path = parts
                    .path
                    .strip_suffix("/index.html")
                    .map(|p| format!("{p}/"))
                    .unwrap_or_else(|| parts.path.clone());
                let mut norm = format!("https://duguid.com.au{clean_path}");
                if !norm.ends_with('/')
                    && !clean_path.rsplit('/').next().unwrap_or("").contains('.')
                {
                    norm.push('/');
                }
                if norm != page_url {
                    inbound.insert(norm);
                }
            }
        }
    }
    let mut failures = Vec::new();
    for url in indexable {
        if !inbound.contains(&url) {
            failures.push(format!(
                "{url}: orphan page has no inbound internal HTML link"
            ));
        }
    }
    Ok(failures)
}
