// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

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
        let mut by_text: HashMap<String, Vec<usize>> = HashMap::new();
        for (page, options) in candidates.iter().enumerate() {
            by_text
                .entry(options[level[page]].to_lowercase())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn options(texts: &[&str]) -> Vec<String> {
        texts.iter().map(|t| (*t).to_owned()).collect()
    }

    #[test]
    fn a_page_without_candidates_is_named() {
        assert_eq!(
            settle("title", &[options(&["a"]), options(&[])]),
            Err("page 1 has no title that fits".into())
        );
    }

    #[test]
    fn a_clash_that_outlasts_the_candidates_names_its_text() {
        assert_eq!(
            settle(
                "title",
                &[options(&["Pumps", "Pumps"]), options(&["pumps"])]
            ),
            Err("1 pages share a title, such as [\"Pumps\"]".into())
        );
    }

    #[test]
    fn a_clash_moves_each_page_to_its_next_candidate() {
        assert_eq!(
            settle(
                "title",
                &[
                    options(&["Pumps", "Pumps (mining)"]),
                    options(&["pumps", "Pumps (water)"])
                ]
            ),
            Ok(options(&["Pumps (mining)", "Pumps (water)"]))
        );
    }
}
