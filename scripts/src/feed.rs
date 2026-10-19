//! Atom output and published identifiers follow build_feed.py at 8c8bb84.
use crate::{html, py};
use chrono::NaiveDate;
use regex::Regex;
use std::collections::HashSet;
use std::path::Path;
use std::sync::LazyLock;

pub const CHANGELOG_URL: &str = "https://duguid.com.au/changelog/";
pub const DOC: &str = "Build feed.xml, an Atom feed of the changelog's dated rows.\n\nRun with --write to regenerate the feed, or --check to fail when the committed\nfeed is stale. Entries come from the two changelog tables only, so the feed can\nnever say more than the page does. The changelog records calendar dates in\nAustralian Eastern time; each becomes midnight UTC of that date, which needs no\ntime-zone database and stays the same on every machine.\n";

#[derive(Debug, Clone, PartialEq)]
pub struct Entry {
    pub date: NaiveDate,
    pub title: String,
    pub summary: String,
    pub link: String,
    pub id: String,
}

pub fn parse_date(text: &str) -> Result<NaiveDate, String> {
    const MONTHS: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let fields = py::split_whitespace(text);
    let parsed = (|| {
        if fields.len() != 3 {
            return None;
        }
        let year = py::parse_int(fields[2], 10)
            .ok()?
            .to_string()
            .parse::<i32>()
            .ok()?;
        let day = py::parse_int(fields[0], 10)
            .ok()?
            .to_string()
            .parse::<u32>()
            .ok()?;
        let month = MONTHS.iter().position(|m| *m == fields[1])? as u32 + 1;
        (1..=9999)
            .contains(&year)
            .then(|| NaiveDate::from_ymd_opt(year, month, day))
            .flatten()
    })();
    parsed.ok_or_else(|| format!("changelog: unreadable date {}", py::repr_str(text)))
}

pub fn headline(summary: &str) -> String {
    if py::char_len(summary) <= 80 {
        return summary.to_owned();
    }
    let prefix = py::prefix_chars(summary, 79);
    let cut = if summary.chars().nth(79) == Some(' ') {
        prefix
    } else {
        prefix.rsplit_once(' ').map_or(prefix, |(head, _)| head)
    };
    format!("{}…", cut.trim_end_matches([' ', ',', ';', ':']))
}

pub fn entries(source: &str) -> Result<Vec<Entry>, String> {
    // Python's \b and \s use str.isalnum and str.isspace, not Unicode's word and space sets.
    static ROW: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
        fancy_regex::Regex::new(&format!(
            r"(?s)<tr{}([^>]*)>(.*?)</tr>",
            py::word_boundary()
        ))
        .unwrap()
    });
    static CELL: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"(?s)<(?:td|th scope="row")>(.*?)</t[dh]>"#).unwrap());
    static TAG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<[^>]+>").unwrap());
    static HREF: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"href="([^"]+)""#).unwrap());
    static ID: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
        let s = &*py::S;
        fancy_regex::Regex::new(&format!(
            r#"{}data-feed-id{s}*={s}*(["'])(.*?)\1"#,
            py::word_boundary()
        ))
        .unwrap()
    });
    let mut found = Vec::new();
    let mut ids = HashSet::new();
    let plain = |s: &str| py::strip(&html::unescape(&TAG.replace_all(s, ""))).to_owned();
    for row in ROW.captures_iter(source) {
        let row = row.map_err(|e| e.to_string())?;
        let cells: Vec<_> = CELL
            .captures_iter(&row[2])
            .map(|c| c[1].to_owned())
            .collect();
        if cells.is_empty() {
            continue;
        }
        let date = parse_date(&plain(&cells[0]))?;
        let (summary, title, id_title, link) = match cells.len() {
            2 => {
                let summary = plain(&cells[1]);
                let title = headline(&summary);
                let id_title = if py::char_len(&summary) <= 80 {
                    summary.clone()
                } else {
                    format!(
                        "{}...",
                        py::prefix_chars(&summary, 77).trim_end_matches(py::is_space)
                    )
                };
                (
                    summary,
                    title,
                    id_title,
                    format!("{CHANGELOG_URL}#site-changes"),
                )
            }
            3 => {
                let tool = plain(&cells[1]);
                let release = plain(&cells[2]);
                let title = format!("{tool} {release}");
                let link = HREF.captures(&cells[2]).map_or_else(
                    || format!("{CHANGELOG_URL}#tool-releases"),
                    |c| html::unescape(&c[1]),
                );
                (
                    format!("{tool}: release {release}."),
                    title.clone(),
                    title,
                    link,
                )
            }
            n => return Err(format!("changelog: unexpected row with {n} cells")),
        };
        let explicit = ID
            .captures(&row[1])
            .map_err(|e| e.to_string())?
            .map(|c| c[2].to_owned());
        if row[1].contains("data-feed-id")
            && !explicit.as_ref().is_some_and(|id| {
                id.len() == 16
                    && id
                        .bytes()
                        .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
            })
        {
            return Err(
                "changelog: data-feed-id must be 16 lowercase hexadecimal characters".into(),
            );
        }
        let id = explicit
            .unwrap_or_else(|| crate::sha256(format!("{date}|{id_title}"))[..16].to_owned());
        if !ids.insert(id.clone()) {
            return Err(format!("changelog: duplicate feed ID {id}"));
        }
        found.push(Entry {
            date,
            title,
            summary,
            link,
            id,
        });
    }
    found.sort_by_key(|e| std::cmp::Reverse(e.date));
    Ok(found)
}

pub fn xml_char(c: char) -> bool {
    matches!(c as u32, 9 | 10 | 13 | 0x20..=0xd7ff | 0xe000..=0xfffd | 0x10000..=0x10ffff)
}

pub fn build(source: &str) -> Result<String, String> {
    let entries = entries(source)?;
    let latest = entries
        .first()
        .ok_or("changelog: no dated rows found")?
        .date;
    let mut lines = vec![
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>".into(),
        "<feed xmlns=\"http://www.w3.org/2005/Atom\">".into(),
        "  <title>duguid.com.au changelog</title>".into(),
        "  <subtitle>Site changes and tagged tool releases for Ryan Duguid's open source Australian accounting tools.</subtitle>".into(),
        "  <link href=\"https://duguid.com.au/feed.xml\" rel=\"self\" />".into(),
        format!("  <link href=\"{CHANGELOG_URL}\" />"), format!("  <id>{CHANGELOG_URL}</id>"),
        format!("  <updated>{latest}T00:00:00Z</updated>"), "  <author><name>Ryan Duguid</name></author>".into(),
    ];
    for e in entries {
        lines.extend([
            "  <entry>".into(),
            format!("    <title>{}</title>", html::escape(&e.title, false)),
            format!(
                "    <link href=\"{}\" />",
                html::escape(&e.link, false).replace('"', "&quot;")
            ),
            format!("    <id>{CHANGELOG_URL}#entry-{}</id>", e.id),
            format!("    <updated>{}T00:00:00Z</updated>", e.date),
            format!("    <summary>{}</summary>", html::escape(&e.summary, false)),
            "  </entry>".into(),
        ]);
    }
    lines.push("</feed>".into());
    let feed = lines.join("\n") + "\n";
    if !feed.chars().all(xml_char) {
        return Err("changelog: holds a control character XML cannot carry".into());
    }
    Ok(feed)
}

pub fn run(root: &Path, args: &[String]) -> Result<u8, String> {
    let feed = build(&crate::read(&root.join("changelog/index.html"))?)?;
    let output = root.join("feed.xml");
    let (message, code) = if args.iter().any(|a| a == "--write") {
        std::fs::write(output, feed).map_err(|e| e.to_string())?;
        ("wrote feed.xml\n".into(), 0)
    } else if args.iter().any(|a| a == "--check") {
        if !output.is_file() || crate::read(&output)? != feed {
            (
                "feed.xml is stale: run python scripts/build_feed.py --write\n".into(),
                1,
            )
        } else {
            ("feed.xml is current\n".into(), 0)
        }
    } else {
        (format!("{DOC}\n"), 2)
    };
    crate::print_text(&message, false).map_err(|e| e.to_string())?;
    Ok(code)
}

/// fuzz_feed.test_one_input, shared by the cargo-fuzz target and the corpus replay:
/// refusals name the changelog and built feeds are well-formed XML.
pub fn fuzz_check(data: &[u8]) -> Result<(), String> {
    check_outcome(build(&String::from_utf8_lossy(data)))
}

pub fn check_outcome(outcome: Result<String, String>) -> Result<(), String> {
    match outcome {
        Err(refusal) if refusal.starts_with("changelog: ") => Ok(()),
        Err(refusal) => Err(format!("unexpected refusal {refusal:?}")),
        Ok(built) => roxmltree::Document::parse(&built)
            .map(drop)
            .map_err(|e| format!("built a malformed feed: {e}")),
    }
}
