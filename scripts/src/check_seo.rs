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
    failures.extend(contracts::check_site_contracts(&paths, root)?);
    say(&format!(
        "checked sitemap.xml ({listed} URLs), llms.txt, robots.txt"
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
