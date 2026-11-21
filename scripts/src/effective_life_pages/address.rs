// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Page addresses. A group's address comes from its heading; a row's address from its own
//! wording, with the headings above it added only where the group holds another row of
//! the same wording. Every part is capped so that a checkout's paths stay well inside
//! Windows' 260-character limit.
use super::Result;
use super::load::{Entry, Group, Table};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use unicode_normalization::UnicodeNormalization;

/// The longest group part of an address, in characters.
pub const GROUP_MAX: usize = 40;
/// The longest row part.
pub const SLUG_MAX: usize = 72;
const LEAF_MAX: usize = 60;
const HEADING_MAX: usize = 32;
/// Hex digits of the path digest that separates rows no wording rule can.
const DIGEST_LEN: usize = 6;

/// The lowercase ASCII words of a text: accents are dropped, anything else separates.
pub fn words(text: &str) -> Vec<String> {
    let ascii: String = text.nfkd().filter(char::is_ascii).collect();
    ascii
        .to_ascii_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_owned)
        .collect()
}

/// The text without bracketed asides and without what follows its first colon.
pub fn core(text: &str) -> String {
    let mut depth = 0usize;
    let mut out = String::new();
    for c in text.chars() {
        match c {
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            ':' if depth == 0 => break,
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    out
}

/// `core` as a page shows it, with single spaces and an ellipsis wherever words were
/// left out: a bracketed aside, or what follows the first colon. So a quotation of it
/// shows each cut.
pub fn shown_core(text: &str) -> String {
    let mut depth = 0usize;
    let mut out = String::new();
    let cut = |out: &mut String| {
        if !out.trim_end().ends_with('\u{2026}') {
            out.push_str(" \u{2026} ");
        }
    };
    for (at, c) in text.char_indices() {
        match c {
            '(' => {
                if depth == 0 {
                    cut(&mut out);
                }
                depth += 1;
            }
            // The instrument has a ')' with no '(' ('vent cutters etc)'): kept as printed.
            ')' if depth > 0 => depth -= 1,
            ':' if depth == 0 => {
                if !text[at + 1..].trim().is_empty() {
                    cut(&mut out);
                }
                break;
            }
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    // Punctuation after a cut closes up to its ellipsis: 'recyclers …, teller'.
    let mut shown = out.split_whitespace().collect::<Vec<_>>().join(" ");
    for mark in [',', ';', '.', ')'] {
        shown = shown.replace(&format!("\u{2026} {mark}"), &format!("\u{2026}{mark}"));
    }
    shown
}

/// The leading words that fit in `max` characters joined by hyphens; at least one word.
fn cap(words: Vec<String>, max: usize) -> Vec<String> {
    let mut size = 0;
    let mut out = Vec::new();
    for word in words {
        let next = size + word.len() + usize::from(!out.is_empty());
        if next > max && !out.is_empty() {
            break;
        }
        size = next;
        out.push(word);
    }
    out
}

pub fn group_slug(group: &Group) -> String {
    let heading = match group.table {
        Table::A => group.heading.clone(),
        Table::B => core(&group.heading),
    };
    cap(words(&heading), GROUP_MAX).join("-")
}

/// The candidate row parts in the order they are tried: the row's own wording, then with
/// the top heading, the nearest heading, both, and every heading above it.
fn candidates(path: &[String]) -> Vec<String> {
    let (leaf, headings) = path.split_last().expect("an entry has its own text");
    let heading = |text: &String| cap(words(&core(text)), HEADING_MAX);
    let mut sets: Vec<Vec<&String>> = Vec::new();
    if let [top, .., near] = headings {
        sets.extend([vec![top], vec![near], vec![top, near]]);
    }
    sets.push(headings.iter().collect());
    let mut out: Vec<String> = Vec::new();
    for leaf_words in [
        cap(words(&core(leaf)), LEAF_MAX),
        cap(words(leaf), LEAF_MAX),
    ] {
        out.push(leaf_words.join("-"));
        for set in &sets {
            let mut parts: Vec<String> = set.iter().flat_map(|text| heading(text)).collect();
            parts.extend(leaf_words.iter().cloned());
            out.push(parts.join("-"));
        }
    }
    let mut seen = HashSet::new();
    out.retain(|slug| !slug.is_empty() && slug.len() <= SLUG_MAX && seen.insert(slug.clone()));
    out
}

/// The first hex digits of a text's SHA-256.
pub fn digest(text: &str) -> String {
    let hex: String = Sha256::digest(text.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    hex[..DIGEST_LEN].to_owned()
}

fn digest_slug(group: &str, path: &[String]) -> String {
    let leaf = cap(
        words(&core(&path[path.len() - 1])),
        SLUG_MAX - DIGEST_LEN - 1,
    );
    format!(
        "{}-{}",
        leaf.join("-"),
        digest(&format!("{group}\n{}", path.join("\n")))
    )
}

/// The row part of each entry's address, `None` for rows with no life. At each step every
/// row still waiting takes its next candidate, and keeps it if no other waiting row shares
/// it and no row has taken it; a row left at the end gets a digest of its path.
pub fn entry_slugs(group_slug: &str, entries: &[Entry]) -> Result<Vec<Option<String>>> {
    let lives: Vec<usize> = (0..entries.len())
        .filter(|&i| entries[i].life.is_some())
        .collect();
    let options: HashMap<usize, Vec<String>> = lives
        .iter()
        .map(|&i| (i, candidates(&entries[i].path)))
        .collect();
    let mut slugs: Vec<Option<String>> = vec![None; entries.len()];
    let mut taken: HashSet<String> = HashSet::new();
    let mut waiting = lives;
    let steps = options.values().map(Vec::len).max().unwrap_or(0);
    for step in 0..steps {
        let now: Vec<(usize, &String)> = waiting
            .iter()
            .filter_map(|&i| options[&i].get(step).map(|slug| (i, slug)))
            .collect();
        let mut counts: HashMap<&String, usize> = HashMap::new();
        now.iter()
            .for_each(|(_, slug)| *counts.entry(slug).or_default() += 1);
        for (i, slug) in now {
            if counts[slug] == 1 && taken.insert(slug.clone()) {
                slugs[i] = Some(slug.clone());
            }
        }
        waiting.retain(|&i| slugs[i].is_none());
    }
    for i in waiting {
        let slug = digest_slug(group_slug, &entries[i].path);
        if !taken.insert(slug.clone()) {
            return Err(format!("two rows of {group_slug} share the address {slug}"));
        }
        slugs[i] = Some(slug);
    }
    Ok(slugs)
}

/// The folder for a group's pages, below `tools/depreciation-rates/`.
pub fn folder(table: Table) -> &'static str {
    match table {
        Table::A => "industry",
        Table::B => "asset",
    }
}

/// Every group's slug, failing when two groups of a table would share one.
pub fn group_slugs(groups: &[Group]) -> Result<Vec<String>> {
    let mut seen: HashMap<(&'static str, String), &str> = HashMap::new();
    let mut out = Vec::new();
    for group in groups {
        let slug = group_slug(group);
        if slug.is_empty() {
            return Err(format!("'{}' gives an empty address", group.heading));
        }
        if let Some(other) = seen.insert((folder(group.table), slug.clone()), &group.heading) {
            return Err(format!(
                "'{other}' and '{}' share the address {slug}",
                group.heading
            ));
        }
        out.push(slug);
    }
    Ok(out)
}
