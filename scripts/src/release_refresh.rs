// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The content check of the automatic tool release refresh. A read-only job applies the
//! refresh patch to main and runs this before the publish job may push that patch. Each
//! changed file must be one of 3 kinds, or the refresh is refused:
//! - `_data/tool_releases.json`, in which a changed entry may change only its version and
//!   date, the only values the refresh reads from GitHub, and the fields that follow from
//!   them and main's `_data/tools.json` (tag, date label and URL);
//! - a page `apply_tool_releases` stamps, which must equal what it writes from main's
//!   copy and the refreshed snapshot (`llms.txt` apart from its part index);
//! - a text mirror `build_llms_full` writes, which the same job then regenerates with
//!   `build_llms_full --check`, as it does the part index of `llms.txt`.

use crate::llms_full::{page_path, with_part_index};
use crate::node;
use crate::source_freshness::{
    SITE_REPOSITORY, STABLE, apply_tool_releases, format_date, parse_object,
};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

const SNAPSHOT: &str = "_data/tool_releases.json";

/// Every way the refreshed snapshot `new` departs from main's `old`: the refresh writes
/// it with `node::stringify`, keeps its entries and their fields in order, and in each
/// entry it changes sets the version and date and derives the rest as the writer does
/// from main's `tools`.
pub fn snapshot_failures(old: Option<&str>, new: &str, tools: &Map<String, Value>) -> Vec<String> {
    let Some(old) = old else {
        return vec![format!(
            "{SNAPSHOT}: a new file; a release refresh only rewrites files main has"
        )];
    };
    let parse = |text: &str| match serde_json::from_str(text) {
        Ok(Value::Object(map)) => Some(map),
        _ => None,
    };
    let (Some(was), Some(now)) = (parse(old), parse(new)) else {
        return vec![format!("{SNAPSHOT}: not a JSON object")];
    };
    let mut failures = Vec::new();
    if new != format!("{}\n", node::stringify(&Value::Object(now.clone()))) {
        failures.push(format!("{SNAPSHOT}: not laid out as the refresh writes it"));
    }
    if !was.keys().eq(now.keys()) {
        failures.push(format!(
            "{SNAPSHOT}: adds, removes or reorders an entry; a release refresh only updates them"
        ));
        return failures;
    }
    // serde_json's map equality ignores key order, which the layout holds to main's.
    let same = |a: &Value, b: &Value| node::stringify(a) == node::stringify(b);
    for ((slug, was), now) in was.iter().zip(now.values()) {
        if same(was, now) {
            continue;
        }
        let at = |what: &str| format!("{SNAPSHOT}: {slug}: {what}");
        let (Value::Object(was), Value::Object(now)) = (was, now) else {
            failures.push(at("not an object"));
            continue;
        };
        if !was.keys().eq(now.keys()) {
            failures.push(at("adds, removes or reorders a field"));
            continue;
        }
        let Some(tool) = tools.get(slug) else {
            failures.push(at("no tool of that name in main's _data/tools.json"));
            continue;
        };
        let text = |key: &str| now.get(key).and_then(Value::as_str).unwrap_or_default();
        let (version, date) = (text("version"), text("date"));
        let mut derived = vec![("dateLabel", format_date(date))];
        match tool.get("tagPrefix") {
            Some(Value::Null) => {
                if version.len() != 40
                    || !version
                        .bytes()
                        .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
                {
                    failures.push(at("version is not a 40-character commit"));
                }
                let url = format!("https://github.com/{SITE_REPOSITORY}/commit/{version}");
                derived.push(("url", url));
            }
            prefix => {
                if !STABLE.is_match(version) {
                    failures.push(at("version is not a stable major.minor.patch"));
                }
                let tag = format!("{}{version}", node::template(prefix));
                let repository = node::template(tool.get("repository"));
                let url = format!("https://github.com/{repository}/releases/tag/{tag}");
                derived.extend([("tag", tag), ("url", url)]);
            }
        }
        if date
            .parse::<jiff::civil::Date>()
            .ok()
            .map(|d| d.to_string())
            .as_deref()
            != Some(date)
        {
            failures.push(at("date is not an ISO calendar date"));
        }
        for (key, want) in &derived {
            if now.get(*key).and_then(Value::as_str) != Some(want) {
                failures.push(at(&format!(
                    "{key} is not what the refresh writes for its version, date and tool"
                )));
            }
        }
        let free =
            |key: &str| key == "version" || key == "date" || derived.iter().any(|(k, _)| *k == key);
        failures.extend(
            now.iter()
                .filter(|(key, value)| {
                    !free(key) && !was.get(key.as_str()).is_some_and(|v| same(v, value))
                })
                .map(|(key, _)| {
                    at(&format!(
                        "changes {key}, which a release refresh never writes"
                    ))
                }),
        );
    }
    failures
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
    let tools = parse_object(&base.join("_data/tools.json"))?;
    let old = text(base, SNAPSHOT).ok();
    let mut failures = snapshot_failures(old.as_deref(), &text(root, SNAPSHOT)?, &tools);

    // Replay the stamp on a copy of main's pages with the refreshed snapshot.
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
