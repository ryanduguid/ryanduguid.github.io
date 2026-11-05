// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! Hold each page to the passage rules in CONTRIBUTING.md, so a passage quoted alone
//! keeps its subject and a page answers before it explains.
//!
//! The rules read each page's `index.txt`, the visible main text that
//! `build_llms_full --check` holds to the rendered page. The limits, `DANGLING` and
//! `FILLER` come from `thresholds.json` in seo-skills/geo-audit-skill 1.2.1 (MIT). They
//! are that project's heuristics; no study shows that meeting them causes a citation.
use crate::llms_full::{block_kind, page_path};
use crate::seo_core as core;
use std::path::Path;

/// The most words in a page's lead paragraph and in a section lead's first sentence.
pub const LEAD_WORDS: usize = 45;
/// The most words of prose and list items under one heading.
pub const SECTION_WORDS: usize = 400;
/// A paragraph needs this many words to count as a passage.
const MIN_PASSAGE_WORDS: usize = 12;
/// The lowest share of a page's passages that may open without a dangling reference.
pub const MIN_SELF_CONTAINED: f64 = 0.85;
const DANGLING: [&str; 36] = [
    "as discussed",
    "as mentioned",
    "as noted",
    "as we saw",
    "as above",
    "because of this",
    "for this reason",
    "in addition",
    "on the other hand",
    "that said",
    "the former",
    "the latter",
    "which means",
    "also",
    "and",
    "but",
    "he",
    "her",
    "here",
    "his",
    "however",
    "it",
    "its",
    "she",
    "so",
    "such",
    "that",
    "their",
    "them",
    "then",
    "there",
    "therefore",
    "these",
    "they",
    "this",
    "those",
];
const FILLER: [&str; 18] = [
    "a brief history",
    "before we",
    "first, a little",
    "have you ever",
    "if you are like",
    "in the fast-paced",
    "in the world of",
    "in this article",
    "in this guide",
    "in this post",
    "in today",
    "it goes without saying",
    "let us",
    "let's",
    "nowadays",
    "these days",
    "we all know",
    "welcome",
];

#[derive(Default)]
struct Section {
    level: usize,
    heading: String,
    /// Paragraphs and lists, in order, without tables or code.
    blocks: Vec<String>,
    words: usize,
}

fn words(text: &str) -> usize {
    text.split_whitespace().count()
}

/// Whether `text`, past any opening quotation mark, starts with one of the phrases.
fn opens_with(text: &str, phrases: &[&str]) -> bool {
    let start = text
        .trim_start_matches(['"', '\'', '“', '‘', ' '])
        .to_lowercase();
    phrases.iter().any(|phrase| {
        start
            .strip_prefix(phrase)
            .is_some_and(|rest| !rest.starts_with(|c: char| c.is_alphanumeric() || c == '_'))
    })
}

/// The text to the first sentence end: a stop, question or exclamation mark and a space.
fn first_sentence(text: &str) -> &str {
    text.char_indices()
        .find(|&(i, c)| {
            matches!(c, '.' | '!' | '?')
                && text[i + c.len_utf8()..].starts_with(char::is_whitespace)
        })
        .map_or(text, |(i, c)| &text[..i + c.len_utf8()])
}

/// The blank-line separated blocks of `text`; a fenced block stays whole.
fn blocks(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    let mut fenced = false;
    for line in text.lines() {
        if line.starts_with("```") {
            fenced = !fenced;
        }
        if line.is_empty() && !fenced {
            if !current.is_empty() {
                found.push(current.join("\n"));
                current.clear();
            }
        } else {
            current.push(line);
        }
    }
    if !current.is_empty() {
        found.push(current.join("\n"));
    }
    found
}

/// The visible main text of a page's `index.txt` entry, split at its headings.
fn sections(entry: &str) -> Vec<Section> {
    // An entry is `# title`, `Source: url`, `> description`, then the main text and
    // the link list `build_llms_full` adds.
    let main = entry
        .find("\n\n> ")
        .and_then(|at| {
            entry[at + 2..]
                .find("\n\n")
                .map(|end| &entry[at + 2 + end..])
        })
        .unwrap_or(entry);
    let main = main
        .rfind("\n\n## Links\n\n")
        .map_or(main, |end| &main[..end]);
    let mut found = vec![Section::default()];
    for block in blocks(main) {
        let level = block.bytes().take_while(|b| *b == b'#').count();
        if (1..=4).contains(&level) && block[level..].starts_with(' ') && !block.contains('\n') {
            found.push(Section {
                level,
                heading: block[level + 1..].to_owned(),
                ..Section::default()
            });
        } else if !block.starts_with("```") && block_kind(&block) != "row" {
            let section = found.last_mut().expect("starts with one section");
            section.words += words(&block);
            section.blocks.push(block);
        }
    }
    found
}

/// Where one page's `index.txt` entry breaks a passage rule.
pub fn page_failures(page: &str, entry: &str) -> Vec<String> {
    let mut failures = Vec::new();
    let sections = sections(entry);
    let lead = sections
        .iter()
        .find(|section| section.level == 1)
        .and_then(|section| section.blocks.first());
    if !lead.is_some_and(|lead| block_kind(lead) == "text") {
        failures.push(format!("{page}: no lead paragraph after the H1"));
    }
    let mut passages = 0;
    let mut dangling = 0;
    for section in &sections {
        let heading = &section.heading;
        if section.words > SECTION_WORDS {
            failures.push(format!(
                "{page}: section {heading:?} has {} words, limit {SECTION_WORDS}",
                section.words
            ));
        }
        let mut first_passage = true;
        for block in &section.blocks {
            if block_kind(block) == "text" && words(block) >= MIN_PASSAGE_WORDS {
                passages += 1;
                if opens_with(block, &DANGLING) {
                    dangling += 1;
                    if first_passage {
                        failures.push(format!(
                            "{page}: section {heading:?} opens on a dangling reference: {}",
                            first_sentence(block)
                        ));
                    }
                }
                first_passage = false;
            }
        }
        let Some(lead) = section.blocks.first() else {
            continue;
        };
        if section.level == 1 {
            let count = words(lead);
            if block_kind(lead) == "text" && count > LEAD_WORDS {
                failures.push(format!(
                    "{page}: lead has {count} words, limit {LEAD_WORDS}"
                ));
            }
        } else if (2..=3).contains(&section.level) {
            let lead = lead.lines().next().unwrap_or(lead);
            let count = words(first_sentence(lead.trim_start_matches("- ")));
            if count > LEAD_WORDS {
                failures.push(format!(
                    "{page}: section {heading:?} leads with a {count} word sentence, \
                     limit {LEAD_WORDS}"
                ));
            }
            if opens_with(lead, &FILLER) {
                failures.push(format!(
                    "{page}: section {heading:?} opens on filler: {}",
                    first_sentence(lead)
                ));
            }
        }
    }
    // Word counts stay far below 2^52, so these casts are exact.
    if passages > 0 && (passages - dangling) as f64 / (passages as f64) < MIN_SELF_CONTAINED {
        failures.push(format!(
            "{page}: {dangling} of {passages} passages open on a dangling reference, \
             above {:.0}%",
            (1.0 - MIN_SELF_CONTAINED) * 100.0
        ));
    }
    failures
}

pub fn run(root: &Path) -> Result<u8, String> {
    let mut failures = Vec::new();
    let urls = core::sitemap_urls(root)?;
    for url in &urls {
        let entry = crate::read(&page_path(url, root, "index.txt"))?;
        failures.extend(page_failures(url, &entry));
    }
    let say = |text: String| crate::print_text(&text, false).map_err(|e| e.to_string());
    if failures.is_empty() {
        say(format!("{} pages keep the passage rules\n", urls.len()))?;
        return Ok(0);
    }
    say(format!("{} failure(s):\n", failures.len()))?;
    for failure in &failures {
        say(format!("  FAIL {failure}\n"))?;
    }
    Ok(1)
}
