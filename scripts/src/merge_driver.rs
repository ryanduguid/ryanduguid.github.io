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
        field: usize,
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
    let line = line.trim_end_matches(['\n', '\r']);
    if let Some(m) = HTML_ROW.captures(line).or_else(|| TEXT_ROW.captures(line)) {
        return parse_date(&m[1]).ok().map(Line::Row);
    }
    if let Some(m) = UPDATED.captures(line) {
        let date = NaiveDate::parse_from_str(&m[1], "%Y-%m-%d").ok()?;
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
fn added_dates(side: &[&str]) -> Option<Vec<NaiveDate>> {
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
        out.push_str(&resolve(current, base, incoming)?);
    }
    Some(out)
}

pub fn run(args: &[String]) -> Result<u8, String> {
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
    let text = if conflicts == 0 {
        merged
    } else if let Some(text) = resolve_conflicts(&merged, MARKER_SIZE) {
        text
    } else {
        return Ok(1);
    };
    // Replace <current> only once the whole result is written: the fallback reads it.
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
