// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! A Git merge driver for the changelog and the text files built from it.
//!
//! Concurrent pull requests each add a dated row at the top of a changelog table, so
//! Git's line merge stops at the same place in changelog/index.html and again in
//! changelog/index.txt, llms-full.txt, llms-full-changelog-1.txt and feed.xml. This
//! driver runs Git's own
//! three-way merge and resolves only conflicts where both sides added dated rows and
//! removed nothing, and the feed's own <updated> date, which takes the later side: both
//! sides' rows are kept, newest date first, and on the same date
//! the incoming side's rows go above the current side's. In a rebase the incoming side
//! is the pull request's commit, so its row lands on top, as a later merge would put
//! it. When any other conflict remains, the driver leaves the file alone and exits 1,
//! and the configured command falls back to `git merge-file`, so the person resolving
//! it sees every conflict with Git's markers, as when the driver is missing. The site
//! checks still compare the built files with a fresh build, so a resolution that
//! differs from one fails them.
//!
//! With `--generated` it is the driver for the files the site's builders write, which
//! every pull request that adds a page rewrites (`llms-full.txt` and its parts, the
//! `index.txt` copies, `.well-known/llms.txt`): it keeps the current side, and
//! `build_llms_full --write` and `check_design --update-baseline` rebuild them, as
//! their `--check` runs insist. Two such files also hold hand-kept text, which it
//! merges: `llms.txt` outside its generated part index, and the keys of
//! `scripts/design_baseline.json`, whose values the baseline update derives again.
use crate::feed::parse_date;
use crate::pyjson::{self, Dump, Json};
use jiff::civil::Date;
use regex::Regex;
use std::process::Command;
use std::sync::LazyLock;

const USAGE: &str = "usage: site-tools merge_driver <base> <current> <incoming>\n       site-tools merge_driver --generated <base> <current> <incoming> <path>\n\nGit runs this as the changelog-rows and generated merge drivers (CONTRIBUTING.md).\nIt merges <incoming> into <current> in place, or exits 1 and leaves <current>\nunchanged when a conflict it does not resolve remains.\n";
// Wider than any marker a file here holds; the driver's markers never reach a person.
const MARKER_SIZE: usize = 40;

/// One added line of a conflict side: a dated row, a feed entry line, or neither.
enum Line {
    Row(Date),
    Entry { date: Option<Date>, field: usize },
}

fn classify(line: &str) -> Option<Line> {
    // A changelog table row on one line, its text rendering, and the feed entry lines.
    static HTML_ROW: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^\s*<tr\b[^>]*><t[hd]\b[^>]*>([^<]+)</t[hd]>.*</tr>$").unwrap()
    });
    static TEXT_ROW: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^(\d{1,2} [A-Z][a-z]+ \d{4}) \| ").unwrap());
    static UPDATED: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^    <updated>(\d{4}-\d{2}-\d{2})T00:00:00Z</updated>$").unwrap()
    });
    let line = line.trim_end_matches(['\n', '\r']);
    if let Some(m) = HTML_ROW.captures(line).or_else(|| TEXT_ROW.captures(line)) {
        return parse_date(&m[1]).ok().map(Line::Row);
    }
    if let Some(m) = UPDATED.captures(line) {
        let date = Date::strptime("%Y-%m-%d", &m[1]).ok()?;
        return Some(Line::Entry {
            date: Some(date),
            field: 4,
        });
    }
    let field = match line {
        "  <entry>" => 0,
        l if l.starts_with("    <title>") && l.ends_with("</title>") => 1,
        l if l.starts_with("    <link href=\"") && l.ends_with("\" />") => 2,
        l if l.starts_with("    <id>") && l.ends_with("</id>") => 3,
        l if l.starts_with("    <summary>") && l.ends_with("</summary>") => 5,
        "  </entry>" => 6,
        _ => return None,
    };
    Some(Line::Entry { date: None, field })
}

/// The dates one side added, in order, when every line it added is a dated row or
/// whole feed entries. Git can align just after a shared opening tag, rotating
/// each entry by one line. Other shapes are left to Git's ordinary merge.
fn added_dates(side: &[&str]) -> Option<Vec<Date>> {
    let (mut dates, mut fields) = (Vec::new(), Vec::new());
    for line in side {
        match classify(line)? {
            Line::Row(date) => dates.push(date),
            Line::Entry { date, field } => {
                fields.push(field);
                dates.extend(date);
            }
        }
    }
    if !fields.is_empty() {
        let start = fields[0];
        if fields.len() != side.len()
            || start > 1
            || !fields.len().is_multiple_of(7)
            || !fields
                .iter()
                .enumerate()
                .all(|(i, &f)| f == (start + i) % 7)
        {
            return None;
        }
        for chunk in side.as_chunks::<7>().0 {
            let entry = if start == 1 {
                [chunk[6..].concat(), chunk[..6].concat()].concat()
            } else {
                chunk.concat()
            };
            let xml = roxmltree::Document::parse(&entry).ok()?;
            let names: Vec<_> = xml
                .root_element()
                .children()
                .filter(|n| n.is_element())
                .map(|n| n.tag_name().name())
                .collect();
            if names != ["title", "link", "id", "updated", "summary"] {
                return None;
            }
        }
    }
    (!dates.is_empty()).then_some(dates)
}

/// Both sides' additions in date order, or None to leave the conflict to a person.
pub fn resolve(current: &[&str], base: &[&str], incoming: &[&str]) -> Option<String> {
    if !base.is_empty() {
        return None;
    }
    let (ours, theirs) = (added_dates(current)?, added_dates(incoming)?);
    // The two sides must use the same row or feed boundary orientation.
    match (classify(current[0])?, classify(incoming[0])?) {
        (Line::Row(_), Line::Row(_)) => {}
        (Line::Entry { field: a, .. }, Line::Entry { field: b, .. }) if a == b => {}
        _ => return None,
    }
    // The same row added on both sides would be kept twice.
    // An anchored row is keyed by its feed ID, so a reworded copy still counts.
    fn key(line: &str) -> Option<&str> {
        // The row tag's own id attribute, in either quote style, as feed.rs reads it.
        static TR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*<tr\b([^>]*)>").unwrap());
        static ANCHOR: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(r#"(?:^|\s)id\s*=\s*(?:"(entry-[0-9a-f]{16})"|'(entry-[0-9a-f]{16})')"#)
                .unwrap()
        });
        let line = line.trim_end_matches(['\n', '\r']);
        let attributes = TR.captures(line).and_then(|m| m.get(1));
        if let Some(m) = attributes.and_then(|a| ANCHOR.captures(a.as_str())) {
            return m.get(1).or(m.get(2)).map(|id| id.as_str());
        }
        (matches!(classify(line), Some(Line::Row(_))) || line.starts_with("    <id>"))
            .then_some(line)
    }
    let keys: Vec<&str> = current.iter().filter_map(|l| key(l)).collect();
    if incoming
        .iter()
        .filter_map(|l| key(l))
        .any(|k| keys.contains(&k))
    {
        return None;
    }
    let newest_first = |a: &[Date], b: &[Date]| {
        a.iter()
            .chain(b)
            .collect::<Vec<_>>()
            .is_sorted_by(|x, y| x >= y)
    };
    let order = if newest_first(&theirs, &ours) {
        [incoming, current]
    } else if newest_first(&ours, &theirs) {
        [current, incoming]
    } else {
        return None;
    };
    Some(order.concat().concat())
}

const MARKS: [char; 4] = ['<', '|', '=', '>'];

fn is_marker(line: &str, mark: char, size: usize) -> bool {
    let rest = line.trim_end_matches(['\n', '\r']);
    rest.starts_with(&mark.to_string().repeat(size))
        && rest[size..].chars().next().is_none_or(|c| c == ' ')
}

/// Whether a text holds a line that would read as a conflict marker of this size.
pub fn holds_markers(text: &str, size: usize) -> bool {
    text.split_inclusive('\n')
        .any(|line| MARKS.iter().any(|&mark| is_marker(line, mark, size)))
}

/// A site change's feed entry links to its own changelog row (`#entry-<feed ID>`); a
/// release links to its tag or to `#tool-releases`. The feed builder puts site
/// changes first on the same date, so entries from both tables are left to a person.
fn one_table(lines: &[&str]) -> bool {
    let site = format!("    <link href=\"{}#entry-", crate::feed::CHANGELOG_URL);
    let mut links = lines
        .iter()
        .filter(|l| l.starts_with("    <link "))
        .map(|l| l.starts_with(&site));
    links
        .next()
        .is_none_or(|first| links.all(|site| site == first))
}

/// `git merge-file --diff3` output with every conflict resolved, or None when one of
/// them is not a dated-row conflict. In the text files, which put each page under its
/// "Source:" line, only conflicts on the changelog page count.
/// The feed header's `<updated>` line is the newest entry's date. When both sides
/// moved it on from the base, the merged feed's is the later of the two.
fn feed_updated<'a>(current: &[&'a str], base: &[&str], incoming: &[&'a str]) -> Option<&'a str> {
    static FEED_UPDATED: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^  <updated>(\d{4}-\d{2}-\d{2})T00:00:00Z</updated>\r?\n?$").unwrap()
    });
    let date = |lines: &[&str]| match lines {
        [line] => FEED_UPDATED
            .captures(line)
            .and_then(|m| Date::strptime("%Y-%m-%d", &m[1]).ok()),
        _ => None,
    };
    let (ours, old, theirs) = (date(current)?, date(base)?, date(incoming)?);
    if ours < old || theirs < old {
        return None;
    }
    Some(if theirs >= ours {
        incoming[0]
    } else {
        current[0]
    })
}

pub fn resolve_conflicts(merged: &str, size: usize) -> Option<String> {
    let changelog = format!("Source: {}", crate::feed::CHANGELOG_URL);
    let mut out = String::new();
    let mut page: Option<&str> = None;
    let mut lines = merged.split_inclusive('\n');
    while let Some(line) = lines.next() {
        if !is_marker(line, '<', size) {
            if line.starts_with("Source: ") {
                page = Some(line.trim_end_matches(['\n', '\r']));
            }
            out.push_str(line);
            continue;
        }
        if page.is_some_and(|p| p != changelog) {
            return None;
        }
        // Git writes current, |base, =incoming, >end; anything else is not its output.
        let mut sides: [Vec<&str>; 3] = Default::default();
        let mut part = 0;
        loop {
            let line = lines.next()?;
            match MARKS[1..].iter().position(|&m| is_marker(line, m, size)) {
                Some(next) if next == part => part += 1,
                Some(_) => return None,
                None if is_marker(line, '<', size) => return None,
                None => sides[part].push(line),
            }
            if part == 3 {
                break;
            }
        }
        let [current, base, incoming] = &sides;
        let text_rows = [current, incoming].into_iter().flatten().any(|line| {
            !line.trim_start().starts_with('<') && matches!(classify(line), Some(Line::Row(_)))
        });
        if text_rows && page != Some(changelog.as_str()) {
            return None;
        }
        if !one_table(&[current.as_slice(), incoming].concat()) {
            return None;
        }
        if let Some(line) = feed_updated(current, base, incoming) {
            out.push_str(line);
            continue;
        }
        out.push_str(&resolve(current, base, incoming)?);
    }
    Some(out)
}

/// `git merge-file --stdout --diff3` of three files: the number of conflicts and the text.
fn merge_file(current: &str, base: &str, incoming: &str) -> Result<(i32, String), String> {
    let output = Command::new("git")
        .args([
            "merge-file",
            "--stdout",
            "--diff3",
            &format!("--marker-size={MARKER_SIZE}"),
        ])
        .args([current, base, incoming])
        .output()
        .map_err(|e| format!("merge_driver: git: {e}"))?;
    // merge-file exits with the number of conflicts, at most 127; anything else is an error.
    let conflicts = output.status.code().filter(|c| (0..128).contains(c));
    let (Some(conflicts), Ok(merged)) = (conflicts, String::from_utf8(output.stdout)) else {
        return Err(format!(
            "merge_driver: git merge-file failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    };
    Ok((conflicts, merged))
}

/// llms.txt split around its part index: up to and including the heading line, the
/// generated list under it, and the sections after it.
fn split_part_index(text: &str) -> Option<(&str, &str, &str)> {
    static HEADING: LazyLock<Regex> = LazyLock::new(|| {
        let heading = regex::escape(crate::llms_full::PART_INDEX_HEADING);
        Regex::new(&format!(r"(?m)^{heading}\r?\n")).unwrap()
    });
    static NEXT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^## ").unwrap());
    let heading = HEADING.find(text)?;
    let end = NEXT
        .find_at(text, heading.end())
        .map_or(text.len(), |m| m.start());
    Some((
        &text[..heading.end()],
        &text[heading.end()..end],
        &text[end..],
    ))
}

/// llms.txt merged by Git without its part index, then given the current side's
/// part index, which `build_llms_full --write` rebuilds. None leaves it to a person.
pub fn merge_llms_index(
    base: &str,
    current: &str,
    incoming: &str,
) -> Result<Option<String>, String> {
    let sides = [current, base, incoming].map(split_part_index);
    let [Some(ours), Some(old), Some(theirs)] = sides else {
        return Ok(None);
    };
    let dir = tempfile::tempdir().map_err(|e| format!("merge_driver: {e}"))?;
    let mut paths = Vec::new();
    for (name, (head, _, tail)) in [("current", ours), ("base", old), ("incoming", theirs)] {
        let path = dir.path().join(name);
        std::fs::write(&path, format!("{head}{tail}")).map_err(|e| format!("merge_driver: {e}"))?;
        paths.push(path.to_string_lossy().into_owned());
    }
    let (conflicts, merged) = merge_file(&paths[0], &paths[1], &paths[2])?;
    let Some((head, "", tail)) = split_part_index(&merged).filter(|_| conflicts == 0) else {
        return Ok(None);
    };
    Ok(Some(format!("{head}{}{tail}", ours.1)))
}

type Pairs = Vec<(String, Json)>;

/// Applies `incoming`'s changes since `base` to `out`, a copy of the current side. A
/// key added on one side is kept, in sorted place where the keys are sorted. A value
/// both sides changed goes to `both`; None leaves the file to a person.
fn merge_pairs(
    base: &Pairs,
    out: &mut Pairs,
    incoming: &Pairs,
    both: &dyn Fn(&Json, &Json, &Json) -> Option<Json>,
) -> Option<()> {
    let get = |pairs: &Pairs, key: &str| pairs.iter().position(|(k, _)| k == key);
    for (key, old) in base {
        if get(incoming, key).is_none() {
            match get(out, key) {
                // Incoming removed a value the current side changed.
                Some(i) if out[i].1 != *old => return None,
                Some(i) => {
                    out.remove(i);
                }
                None => {}
            }
        }
    }
    for (key, theirs) in incoming {
        let old = base.iter().find(|(k, _)| k == key).map(|(_, v)| v);
        match (old, get(out, key)) {
            (Some(old), Some(i)) if out[i].1 == *old => out[i].1 = theirs.clone(),
            (Some(old), Some(i)) if theirs != old => out[i].1 = both(old, &out[i].1, theirs)?,
            (None, Some(i)) if out[i].1 != *theirs => {
                out[i].1 = both(&Json::Null, &out[i].1, theirs)?;
            }
            (_, Some(_)) => {}
            // The current side removed a value incoming changed.
            (Some(old), None) if theirs != old => return None,
            (Some(_), None) => {}
            (None, None) => {
                let sorted = out.is_sorted_by(|a, b| a.0 <= b.0);
                let at = if sorted {
                    out.partition_point(|(k, _)| k < key)
                } else {
                    out.len()
                };
                out.insert(at, (key.clone(), theirs.clone()));
            }
        }
    }
    Some(())
}

/// scripts/design_baseline.json with both sides' keys. `check_design
/// --update-baseline` derives every digest and count again, so a value both sides
/// changed keeps the current side's. None leaves the file to a person.
pub fn merge_baseline(base: &str, current: &str, incoming: &str) -> Option<String> {
    let parse = |text: &str| match pyjson::loads_unique(text).ok()? {
        Json::Object(sections) => Some(sections),
        _ => None,
    };
    let (old, mut out, theirs) = (parse(base)?, parse(current)?, parse(incoming)?);
    let section = |old: &Json, ours: &Json, theirs: &Json| {
        let (Json::Object(ours), Json::Object(theirs)) = (ours, theirs) else {
            return None;
        };
        let old = match old {
            Json::Object(old) => old.clone(),
            _ => Vec::new(),
        };
        let mut merged = ours.clone();
        merge_pairs(&old, &mut merged, theirs, &|_, ours, _| Some(ours.clone()))?;
        Some(Json::Object(merged))
    };
    merge_pairs(&old, &mut out, &theirs, &section)?;
    let text = pyjson::dumps(
        &Json::Object(out),
        Dump {
            indent: Some(2),
            ensure_ascii: false,
            ..Default::default()
        },
    ) + "\n";
    Some(if current.contains("\r\n") {
        text.replace('\n', "\r\n")
    } else {
        text
    })
}

/// The `--generated` driver: keep <current>, or merge the hand-kept part of llms.txt
/// and the design baseline. <path> is the file's path in the repository.
fn generated(args: &[String]) -> Result<u8, String> {
    let [base, current, incoming, path] = args else {
        crate::print_text(USAGE, true).map_err(|e| e.to_string())?;
        return Ok(2);
    };
    let read = |p: &str| std::fs::read_to_string(p).map_err(|e| format!("merge_driver: {p}: {e}"));
    let merged = match path.as_str() {
        "llms.txt" => merge_llms_index(&read(base)?, &read(current)?, &read(incoming)?)?,
        "scripts/design_baseline.json" => {
            merge_baseline(&read(base)?, &read(current)?, &read(incoming)?)
        }
        _ => return Ok(0),
    };
    match merged {
        Some(text) => replace(current, &text),
        None => Ok(1),
    }
}

pub fn run(args: &[String]) -> Result<u8, String> {
    if let Some((flag, rest)) = args.split_first()
        && flag == "--generated"
    {
        return generated(rest);
    }
    let [base, current, incoming] = args else {
        crate::print_text(USAGE, true).map_err(|e| e.to_string())?;
        return Ok(2);
    };
    // A file holding marker-like lines could be misread, so it is left to Git.
    for path in [base, current, incoming] {
        match std::fs::read_to_string(path) {
            Ok(text) if !holds_markers(&text, MARKER_SIZE) => {}
            _ => return Ok(1),
        }
    }
    let (conflicts, merged) = merge_file(current, base, incoming)?;
    let text = if conflicts == 0 {
        merged
    } else if let Some(text) = resolve_conflicts(&merged, MARKER_SIZE) {
        text
    } else {
        return Ok(1);
    };
    replace(current, &text)
}

/// Replaces <current> only once the whole result is written: the fallback reads it.
fn replace(current: &str, text: &str) -> Result<u8, String> {
    let target = std::path::Path::new(current);
    let dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(std::path::Path::new("."));
    let error = |e: &dyn std::fmt::Display| format!("merge_driver: {current}: {e}");
    let mut file = tempfile::NamedTempFile::new_in(dir).map_err(|e| error(&e))?;
    std::io::Write::write_all(&mut file, text.as_bytes()).map_err(|e| error(&e))?;
    file.persist(target).map_err(|e| error(&e))?;
    Ok(0)
}
