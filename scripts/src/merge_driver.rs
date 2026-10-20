//! A Git merge driver for the changelog and the text files built from it.
//!
//! Concurrent pull requests each add a dated row at the top of a changelog table, so
//! Git's line merge stops at the same place in changelog/index.html and again in
//! changelog/index.txt, llms-full.txt and feed.xml. This driver runs Git's own
//! three-way merge and resolves only conflicts where both sides added dated rows and
//! removed nothing: both sides' rows are kept, newest date first, and on the same date
//! the incoming side's rows go above the current side's. In a rebase the incoming side
//! is the pull request's commit, so its row lands on top, as a later merge would put
//! it. When any other conflict remains, the driver leaves the file alone and exits 1,
//! and the configured command falls back to `git merge-file`, so the person resolving
//! it sees every conflict with Git's markers, as when the driver is missing. The site
//! checks still compare the built files with a fresh build, so a resolution that
//! differs from one fails them.
use crate::feed::parse_date;
use chrono::NaiveDate;
use regex::Regex;
use std::process::Command;
use std::sync::LazyLock;

const USAGE: &str = "usage: site-tools merge_driver <base> <current> <incoming>\n\nGit runs this as the changelog-rows merge driver (CONTRIBUTING.md). It merges\n<incoming> into <current> in place, or exits 1 and leaves <current> unchanged when\na conflict it does not resolve remains.\n";
// Wider than any marker a file here holds; the driver's markers never reach a person.
const MARKER_SIZE: usize = 40;

/// One added line of a conflict side: a dated row, a feed entry line, or neither.
enum Line {
    Row(NaiveDate),
    Entry {
        date: Option<NaiveDate>,
        open: bool,
        close: bool,
    },
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
    static ENTRY_FIELD: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^    <(?:title|link|id|summary)\b").unwrap());
    let line = line.trim_end_matches(['\n', '\r']);
    if let Some(m) = HTML_ROW.captures(line).or_else(|| TEXT_ROW.captures(line)) {
        return parse_date(&m[1]).ok().map(Line::Row);
    }
    if let Some(m) = UPDATED.captures(line) {
        let date = NaiveDate::parse_from_str(&m[1], "%Y-%m-%d").ok()?;
        return Some(Line::Entry {
            date: Some(date),
            open: false,
            close: false,
        });
    }
    let (open, close) = (line == "  <entry>", line == "  </entry>");
    (open || close || ENTRY_FIELD.is_match(line)).then_some(Line::Entry {
        date: None,
        open,
        close,
    })
}

/// The dates one side added, in order, when every line it added is a dated row or
/// whole feed entries. A feed side counts as whole when its entry openings,
/// closings and dates balance; both sides then start at the same point in an entry.
fn added_dates(side: &[&str]) -> Option<Vec<NaiveDate>> {
    let (mut dates, mut opens, mut closes, mut entry_lines) = (Vec::new(), 0, 0, 0);
    for line in side {
        match classify(line)? {
            Line::Row(date) => dates.push(date),
            Line::Entry { date, open, close } => {
                entry_lines += 1;
                opens += usize::from(open);
                closes += usize::from(close);
                dates.extend(date);
            }
        }
    }
    let balanced = entry_lines == 0 || (opens == closes && closes == dates.len());
    (balanced && !dates.is_empty() && (entry_lines == 0 || entry_lines == side.len()))
        .then_some(dates)
}

/// Both sides' additions in date order, or None to leave the conflict to a person.
pub fn resolve(current: &[&str], base: &[&str], incoming: &[&str]) -> Option<String> {
    if !base.is_empty() {
        return None;
    }
    let (ours, theirs) = (added_dates(current)?, added_dates(incoming)?);
    // The same row added on both sides would be kept twice.
    fn key(line: &str) -> Option<&str> {
        let line = line.trim_end_matches(['\n', '\r']);
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
    let newest_first = |a: &[NaiveDate], b: &[NaiveDate]| {
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

fn is_marker(line: &str, mark: char, size: usize) -> bool {
    let rest = line.trim_end_matches(['\n', '\r']);
    rest.starts_with(&mark.to_string().repeat(size))
        && rest[size..].chars().next().is_none_or(|c| c == ' ')
}

/// `git merge-file --diff3` output with every conflict resolved, or None when one of
/// them is not a dated-row conflict.
pub fn resolve_conflicts(merged: &str, size: usize) -> Option<String> {
    let mut out = String::new();
    let mut lines = merged.split_inclusive('\n');
    while let Some(line) = lines.next() {
        if !is_marker(line, '<', size) {
            out.push_str(line);
            continue;
        }
        let mut sides: [Vec<&str>; 3] = Default::default();
        let mut part = 0;
        for line in lines.by_ref() {
            if is_marker(line, '>', size) {
                break;
            }
            match (part, line) {
                (0, l) if is_marker(l, '|', size) => part = 1,
                (0 | 1, l) if is_marker(l, '=', size) => part = 2,
                (_, l) => sides[part].push(l),
            }
        }
        out.push_str(&resolve(&sides[0], &sides[1], &sides[2])?);
    }
    Some(out)
}

pub fn run(args: &[String]) -> Result<u8, String> {
    let [base, current, incoming] = args else {
        crate::print_text(USAGE, true).map_err(|e| e.to_string())?;
        return Ok(2);
    };
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
    // merge-file exits with the number of conflicts, or 255 and up on an error.
    let conflicts = output.status.code().filter(|c| (0..128).contains(c));
    let (Some(conflicts), Ok(merged)) = (conflicts, String::from_utf8(output.stdout)) else {
        return Err(format!(
            "merge_driver: git merge-file failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    };
    let text = if conflicts == 0 {
        merged
    } else if let Some(text) = resolve_conflicts(&merged, MARKER_SIZE) {
        text
    } else {
        return Ok(1);
    };
    std::fs::write(current, text).map_err(|e| format!("merge_driver: {current}: {e}"))?;
    Ok(0)
}
