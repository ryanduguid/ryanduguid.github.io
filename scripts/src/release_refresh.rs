// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The content check of the automatic tool release refresh. A read-only job applies the
//! refresh patch to main and runs this before the publish job may push that patch. Each
//! changed file must be one of 3 kinds, or the refresh is refused:
//! - `_data/tool_releases.json`, whose lines may differ from main's only in release
//!   version, date and commit tokens, the only bytes the refresh reads from GitHub;
//! - a page `apply_tool_releases` stamps, which must equal what it writes from main's
//!   copy and the refreshed snapshot (`llms.txt` apart from its part index);
//! - a text mirror `build_llms_full` writes, which the same job then regenerates with
//!   `build_llms_full --check`, as it does the part index of `llms.txt`.

use crate::llms_full::{page_path, with_part_index};
use crate::source_freshness::{apply_tool_releases, parse_object};
use regex::{NoExpand, Regex};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

const SNAPSHOT: &str = "_data/tool_releases.json";

/// A 40-character commit, an ISO date, a release version or a long date.
static TOKEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"\b[0-9a-f]{40}\b|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]+\.[0-9]+\.[0-9]+",
        r"|\b[0-9]{1,2} (?:January|February|March|April|May|June|July|August",
        r"|September|October|November|December) [0-9]{4}\b",
    ))
    .expect("valid pattern")
});

/// Each line of `new` that differs from the same line of `old` by more than release
/// tokens. A new file (no `old`) or a changed line count is refused outright, since a
/// refresh adds and removes nothing.
pub fn shape_failures(path: &str, old: Option<&str>, new: &str) -> Vec<String> {
    let Some(old) = old else {
        return vec![format!(
            "{path}: a new file; a release refresh only rewrites files main has"
        )];
    };
    let (old, new): (Vec<&str>, Vec<&str>) = (old.split('\n').collect(), new.split('\n').collect());
    if old.len() != new.len() {
        return vec![format!(
            "{path}: {} lines became {}; a release refresh adds and removes no line",
            old.len(),
            new.len()
        )];
    }
    let shape = |line: &str| TOKEN.replace_all(line, NoExpand("\0")).into_owned();
    old.iter()
        .zip(&new)
        .enumerate()
        .filter(|(_, (was, now))| was != now && shape(was) != shape(now))
        .map(|(i, _)| {
            format!(
                "{path}:{}: changes more than a release version, date or commit",
                i + 1
            )
        })
        .collect()
}

fn bytes(dir: &Path, rel: &str) -> Result<Vec<u8>, String> {
    std::fs::read(dir.join(rel)).map_err(|e| format!("{rel}: {e}"))
}

fn text(dir: &Path, rel: &str) -> Result<String, String> {
    String::from_utf8(bytes(dir, rel)?).map_err(|e| format!("{rel}: {e}"))
}

/// Every way the refresh in `root` departs from its contract, judged against `base`, a
/// checkout of the commit the patch was made from. `changed` lists the files the patch
/// changes, relative to the root and with `/` separators, as Git prints them.
pub fn refresh_failures(
    root: &Path,
    base: &Path,
    changed: &[String],
) -> Result<Vec<String>, String> {
    let old = text(base, SNAPSHOT).ok();
    let mut failures = shape_failures(SNAPSHOT, old.as_deref(), &text(root, SNAPSHOT)?);

    // Replay the stamp on a copy of main's pages with the refreshed snapshot.
    let tools = parse_object(&base.join("_data/tools.json"))?;
    let snapshot = parse_object(&root.join(SNAPSHOT))?;
    let mut stamped: Vec<String> = ["tools/index.html", "sitemap.xml", "index.html", "llms.txt"]
        .map(str::to_owned)
        .into();
    stamped.extend(tools.keys().map(|slug| format!("tools/{slug}/index.html")));
    let replay = tempfile::tempdir().map_err(|e| e.to_string())?;
    for rel in &stamped {
        let to = replay.path().join(rel);
        std::fs::create_dir_all(to.parent().expect("a parent")).map_err(|e| e.to_string())?;
        std::fs::copy(base.join(rel), &to).map_err(|e| format!("{rel}: {e}"))?;
    }
    apply_tool_releases(replay.path(), &tools, &snapshot)?;
    for rel in &stamped {
        let same = if rel == "llms.txt" {
            // build_llms_full rewrites the part index, and its --check holds that part.
            let body = |dir: &Path| text(dir, rel).and_then(|t| with_part_index(&t, &[]));
            body(replay.path())? == body(root)?
        } else {
            bytes(replay.path(), rel)? == bytes(root, rel)?
        };
        if !same {
            failures.push(format!(
                "{rel}: not what apply_tool_releases writes from main and the refreshed snapshot"
            ));
        }
    }

    // Anything else must be a text mirror that build_llms_full writes; its --check, run
    // beside this command, regenerates each one from the pages.
    let pages: Vec<PathBuf> = crate::seo_core::sitemap_urls(root)?
        .iter()
        .map(|url| page_path(url, Path::new(""), "index.txt"))
        .collect();
    for rel in changed {
        let mirror = rel == ".well-known/llms.txt"
            || (rel.starts_with("llms-full") && rel.ends_with(".txt") && !rel.contains('/'))
            || pages.iter().any(|page| page == Path::new(rel));
        if rel != SNAPSHOT && !stamped.contains(rel) && !mirror {
            failures.push(format!("{rel}: the release refresh never writes it"));
        }
    }
    Ok(failures)
}
