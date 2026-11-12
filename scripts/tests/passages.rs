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

/// The rate value must not hide the actual lead from the generated-text check.
#[test]
fn a_rate_headline_does_not_hide_an_overlong_lead() {
    if !common::rendered() {
        return;
    }
    for slug in [
        "announced-not-yet-law",
        "car-limit",
        "cents-per-kilometre",
        "div7a-benchmark-rate",
        "fbt-rate",
        "maximum-contribution-base",
        "super-guarantee",
    ] {
        let page = format!("rates/{slug}/index.html");
        let html = common::read_text(common::root(), &page);
        let (before, rest) = html.split_once("<p class=\"short-answer\">").unwrap();
        let (_, after) = rest.split_once("</p>").unwrap();
        for count in [LEAD_WORDS, LEAD_WORDS + 1] {
            let changed = format!(
                "{before}<p class=\"short-answer\">{}.</p>{after}",
                repeated(count)
            );
            let text = site_tools::llms_full::main_text(
                &changed,
                &format!("https://duguid.com.au/rates/{slug}/"),
            )
            .unwrap();
            let failures = page_failures(&page, &text);
            let lead_failure = format!("{page}: lead has 46 words, limit 45");
            assert_eq!(
                failures.contains(&lead_failure),
                count > LEAD_WORDS,
                "{slug}, {count} words: {failures:?}"
            );
        }
    }
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

/// The rule reads the first passage of 12 or more words, wherever a short block puts it.
#[test]
fn a_short_introduction_does_not_excuse_the_first_passage() {
    let plain = "The calculator works out GST on a wholly taxable supply of goods at 10%.";
    let loose = "This tool works out the amount of GST in a wholly taxable supply.";
    let page = |first: &str, second: &str| {
        let rest = [plain; 6].join("\n\n");
        format!(
            "# Heading\n\nA lead.\n\n## Part\n\nAn introduction.\n\n{first}\n\n{second}\n\n{rest}"
        )
    };
    assert_eq!(
        failures(&page(loose, plain)),
        [format!(
            "page: section \"Part\" opens on a dangling reference: {loose}"
        )]
    );
    assert_eq!(failures(&page(plain, loose)), Vec::<String>::new());
}

/// A page with no paragraph after its H1 has no lead, whatever follows it.
#[test]
fn a_page_needs_a_lead() {
    for main in [
        "# Heading",
        "# Heading\n\n## Part\n\n### Detail",
        "# Heading\n\n## Part\n\nThe calculator works out GST.",
        "# Heading\n\n- A list item",
        "# Heading\n\n```\nlet total = 1;\n```\n\nThe calculator works out GST.",
        "# Heading\n\nInput | Result\n1 | 2\n\nThe calculator works out GST.",
        "The calculator works out GST.",
    ] {
        assert_eq!(
            failures(main),
            ["page: no lead paragraph after the H1"],
            "{main}"
        );
    }
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

/// `check_site` runs the rules against the built pages and these tests in its suite.
#[test]
fn check_site_runs_the_passage_rules() {
    use site_tools::check_site::{CHECKS, Check};
    let runs = |wanted: &str| {
        CHECKS.iter().any(|check| match check {
            Check::Tool(args) => args.contains(&wanted),
            Check::Tests(names) => names.contains(&wanted),
            Check::External(_) => false,
        })
    };
    assert!(runs("check_passages"));
    assert!(runs("passages"));
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
