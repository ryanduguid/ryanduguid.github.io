// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! The passage rules: page leads, section leads, section size and self-contained openers.
mod common;

use site_tools::passages::{LEAD_WORDS, SECTION_WORDS, page_failures};
use std::process::Command;

const HEAD: &str = "# Title\n\nSource: https://duguid.com.au/\n\n> Description\n\n";

fn repeated(count: usize) -> String {
    vec!["word"; count].join(" ")
}

/// An entry holding `main`, with the link list `build_llms_full` adds.
fn entry(main: &str) -> String {
    format!("{HEAD}{main}\n\n## Links\n\n- Home: {}\n", repeated(500))
}

fn failures(main: &str) -> Vec<String> {
    page_failures("page", &entry(main))
}

const GOOD: &str = "# Heading\n\nThe calculator works out GST.\n\n## Limits\n\nThe calculator \
                    does not classify a supply; confirm that against the ATO's guidance first.";

#[test]
fn a_clean_page_passes() {
    assert_eq!(failures(GOOD), Vec::<String>::new());
}

#[test]
fn a_page_lead_keeps_to_the_word_limit() {
    let at_limit = format!("# Heading\n\n{}.", repeated(LEAD_WORDS));
    assert_eq!(failures(&at_limit), Vec::<String>::new());
    let over = format!("# Heading\n\n{}.", repeated(LEAD_WORDS + 1));
    assert_eq!(failures(&over), ["page: lead has 46 words, limit 45"]);
}

#[test]
fn a_section_leads_with_a_short_sentence() {
    let long = format!(
        "# Heading\n\nA lead.\n\n## Part\n\n{}. Short.",
        repeated(46)
    );
    assert_eq!(
        failures(&long),
        ["page: section \"Part\" leads with a 46 word sentence, limit 45"]
    );
    let two_sentences = format!(
        "# Heading\n\nA lead.\n\n## Part\n\n{}. {}.",
        repeated(45),
        repeated(45)
    );
    assert_eq!(failures(&two_sentences), Vec::<String>::new());
    let filler = "# Heading\n\nA lead.\n\n## Part\n\nWelcome to the part.";
    assert_eq!(
        failures(filler),
        ["page: section \"Part\" opens on filler: Welcome to the part."]
    );
}

#[test]
fn a_section_keeps_to_the_word_limit_without_its_tables_or_code() {
    let at_limit = format!(
        "# Heading\n\nA lead.\n\n## Part\n\n{}.",
        repeated(SECTION_WORDS)
    );
    let at_limit = at_limit.replacen("word word", "word. word", 1);
    assert_eq!(failures(&at_limit), Vec::<String>::new());
    let table = format!("{at_limit}\n\nA | {}\nB | C", repeated(SECTION_WORDS));
    assert_eq!(failures(&table), Vec::<String>::new());
    let code = format!("{at_limit}\n\n```\n{}\n\n{}\n```", repeated(9), repeated(9));
    assert_eq!(failures(&code), Vec::<String>::new());
    let over = format!("{at_limit}\n\n- one more item");
    assert_eq!(
        failures(&over),
        ["page: section \"Part\" has 404 words, limit 400"]
    );
}

#[test]
fn a_heading_at_any_level_starts_a_new_section() {
    let split = format!(
        "# Heading\n\nA lead.\n\n## Part\n\nAn opening sentence.\n\n### One\n\n{0}\n\n#### Two\n\n{0}",
        repeated(300).replacen("word word", "word. word", 1)
    );
    assert_eq!(failures(&split), Vec::<String>::new());
}

#[test]
fn the_first_passage_of_a_section_keeps_its_subject() {
    let dangling = "# Heading\n\nA lead.\n\n## Part\n\nThis tool works out the amount of GST in \
                    a wholly taxable supply. Then it stops.";
    assert_eq!(
        failures(dangling),
        [
            "page: section \"Part\" opens on a dangling reference: \
             This tool works out the amount of GST in a wholly taxable supply.",
            "page: 1 of 1 passages open on a dangling reference, above 15%",
        ]
    );
    let quoted = dangling.replace("This tool", "“It");
    assert!(
        failures(&quoted)[0].contains("dangling"),
        "{:?}",
        failures(&quoted)
    );
    let short = "# Heading\n\nA lead.\n\n## Part\n\nThis is short.";
    assert_eq!(failures(short), Vec::<String>::new());
    let word_start = dangling.replace("This tool", "Thistle tool");
    assert_eq!(failures(&word_start), Vec::<String>::new());
}

#[test]
fn a_page_keeps_its_passages_self_contained() {
    let plain = "The calculator works out GST on a wholly taxable supply of goods at 10%.";
    let loose = "These figures come from the same wholly taxable supply of goods at 10%.";
    let page = |dangling: usize| {
        let mut parts = vec![plain.to_owned(); 20 - dangling];
        parts.extend(vec![loose.to_owned(); dangling]);
        format!("# Heading\n\nA lead.\n\n{}", parts.join("\n\n"))
    };
    assert_eq!(failures(&page(3)), Vec::<String>::new());
    assert_eq!(
        failures(&page(4)),
        ["page: 4 of 20 passages open on a dangling reference, above 15%"]
    );
}

/// The command reads each page's generated text, as `check_site` runs it.
#[test]
fn the_command_reports_each_failing_page() {
    let site = tempfile::tempdir().unwrap();
    let root = site.path();
    let page = "https://duguid.com.au/page/";
    std::fs::write(root.join("_config.yml"), "").unwrap();
    std::fs::write(
        root.join("sitemap.xml"),
        format!("<urlset><url><loc>{page}</loc></url></urlset>"),
    )
    .unwrap();
    std::fs::create_dir(root.join("page")).unwrap();
    let run = || {
        Command::new(env!("CARGO_BIN_EXE_site-tools"))
            .arg("check_passages")
            .current_dir(root)
            .env_remove("SITE_ROOT")
            .output()
            .unwrap()
    };
    std::fs::write(root.join("page/index.txt"), entry(GOOD)).unwrap();
    let passed = run();
    assert_eq!(passed.status.code(), Some(0));
    assert!(String::from_utf8_lossy(&passed.stdout).contains("1 pages keep the passage rules"));
    let over = format!("# Heading\n\n{}.", repeated(LEAD_WORDS + 1));
    std::fs::write(root.join("page/index.txt"), entry(&over)).unwrap();
    let failed = run();
    assert_eq!(failed.status.code(), Some(1));
    assert!(
        String::from_utf8_lossy(&failed.stdout).contains("FAIL https://duguid.com.au/page/: lead")
    );
}

/// `build_llms_full --check` proves these entries match the pages.
#[test]
fn the_committed_pages_keep_the_passage_rules() {
    let root = common::repository();
    let urls = site_tools::seo_core::sitemap_urls(&root).unwrap();
    assert!(!urls.is_empty());
    let mut found = Vec::new();
    for url in urls {
        let rel = url.trim_start_matches("https://duguid.com.au/");
        let path = root.join(rel).join("index.txt");
        let path = if rel.is_empty() {
            root.join("index.txt")
        } else {
            path
        };
        found.extend(page_failures(&url, &site_tools::read(&path).unwrap()));
    }
    assert_eq!(found, Vec::<String>::new());
}
