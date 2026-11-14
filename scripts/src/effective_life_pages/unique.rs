// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! Choosing one text for each page from its candidates, so no 2 pages share one.
use super::Result;
use std::collections::HashMap;

/// For each page, the first of its candidates, from least to most specific, that no other
/// page settles on: every page in a clash takes its next candidate until no clash is left.
/// A clash that outlasts the candidates is an error naming the text.
pub fn settle(what: &str, candidates: &[Vec<String>]) -> Result<Vec<String>> {
    if let Some(page) = candidates.iter().position(Vec::is_empty) {
        return Err(format!("page {page} has no {what} that fits"));
    }
    let mut level = vec![0; candidates.len()];
    loop {
        let mut by_text: HashMap<&str, Vec<usize>> = HashMap::new();
        for (page, options) in candidates.iter().enumerate() {
            by_text
                .entry(options[level[page]].as_str())
                .or_default()
                .push(page);
        }
        let clashes: Vec<&Vec<usize>> = by_text.values().filter(|pages| pages.len() > 1).collect();
        if clashes.is_empty() {
            break;
        }
        let mut moved = false;
        for &page in clashes.iter().flat_map(|pages| pages.iter()) {
            if level[page] + 1 < candidates[page].len() {
                level[page] += 1;
                moved = true;
            }
        }
        if !moved {
            let mut texts: Vec<&str> = clashes
                .iter()
                .map(|pages| candidates[pages[0]][level[pages[0]]].as_str())
                .collect();
            texts.sort_unstable();
            return Err(format!(
                "{} pages share a {what}, such as {:?}",
                clashes.len(),
                &texts[..texts.len().min(100)]
            ));
        }
    }
    Ok(candidates
        .iter()
        .zip(level)
        .map(|(options, at)| options[at].clone())
        .collect())
}
