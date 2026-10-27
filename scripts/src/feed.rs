//! Atom output and published identifiers follow build_feed.py at 8c8bb84.
use crate::{html, py};
use chrono::NaiveDate;
use regex::Regex;
use std::collections::HashSet;
use std::path::Path;
use std::sync::LazyLock;

pub const CHANGELOG_URL: &str = "https://duguid.com.au/changelog/";
pub const DOC: &str = "Build feed.xml, an Atom feed of the changelog's dated rows.\n\nRun with --write to regenerate the feed, or --check to fail when the committed\nfeed is stale. Entries come from the two changelog tables only, so the feed can\nnever say more than the page does. --write also gives each dated row the\nid=\"entry-<feed ID>\" anchor its site entry links to, and --check fails when one\nis missing. The anchor then holds the row's published ID, so rewording or moving\nthe row keeps it. Both refuse a changelog without a Tool releases row, on the same\ndate and link, for each tagged release in _data/tool_releases.json; add the row\nby hand. The changelog records calendar dates in\nAustralian Eastern time; each becomes midnight UTC of that date, which needs no\ntime-zone database and stays the same on every machine.\n";

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
    let mut found: Vec<Entry> = rows(source)?.into_iter().map(|r| r.entry).collect();
    found.sort_by_key(|e| std::cmp::Reverse(e.date));
    Ok(found)
}

/// A dated changelog row: its entry, where its attributes start and its `id` attribute.
struct Row {
    entry: Entry,
    attributes_at: usize,
    anchor: Option<String>,
}

/// Each dated row's anchor is `entry-<feed ID>`, so the Atom ID resolves to the row.
fn anchor(id: &str) -> String {
    format!("entry-{id}")
}

fn rows(source: &str) -> Result<Vec<Row>, String> {
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
    static ANCHOR: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)')"#).unwrap());
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
                (summary, title, id_title, String::new())
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
        let feed_id = |id: &str| {
            id.len() == 16
                && id
                    .bytes()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        };
        if row[1].contains("data-feed-id") && !explicit.as_deref().is_some_and(feed_id) {
            return Err(
                "changelog: data-feed-id must be 16 lowercase hexadecimal characters".into(),
            );
        }
        let existing = ANCHOR
            .captures(&row[1])
            .map(|c| c.get(1).or(c.get(2)).map_or("", |m| m.as_str()).to_owned());
        // The anchor holds the published ID, so rewording a row cannot change it.
        let anchored_id = match existing.as_deref() {
            None => None,
            Some(a) => match a.strip_prefix("entry-").filter(|id| feed_id(id)) {
                Some(id) => Some(id.to_owned()),
                None => {
                    return Err(format!(
                        "changelog: the {date} row's id must be entry- and its 16-character feed ID"
                    ));
                }
            },
        };
        let id = match (explicit, anchored_id) {
            (Some(explicit), Some(anchored)) if explicit != anchored => {
                return Err(format!(
                    "changelog: the {date} row's data-feed-id {explicit} and id entry-{anchored} disagree; keep the published ID in both"
                ));
            }
            (explicit, anchored) => explicit
                .or(anchored)
                .unwrap_or_else(|| crate::sha256(format!("{date}|{id_title}"))[..16].to_owned()),
        };
        if !ids.insert(id.clone()) {
            return Err(format!("changelog: duplicate feed ID {id}"));
        }
        let link = if link.is_empty() {
            format!("{CHANGELOG_URL}#{}", anchor(&id))
        } else {
            link
        };
        found.push(Row {
            entry: Entry {
                date,
                title,
                summary,
                link,
                id,
            },
            attributes_at: row.get(1).expect("group 1").start(),
            anchor: existing,
        });
    }
    Ok(found)
}

/// The changelog with an `id="entry-<feed ID>"` anchor on every dated row.
pub fn anchored(source: &str) -> Result<String, String> {
    let mut out = source.to_owned();
    for row in rows(source)?.iter().rev() {
        if row.anchor.is_none() {
            out.insert_str(
                row.attributes_at,
                &format!(" id=\"{}\"", anchor(&row.entry.id)),
            );
        }
    }
    Ok(out)
}

/// Refuses a changelog whose Tool releases table lacks a row, on the same date and
/// with the same link, for any tagged release in `_data/tool_releases.json`. Rows
/// are written by hand; an entry without a tag records a source revision, not a
/// release, so it needs no row but must not link a tagged release.
pub fn check_release_rows(source: &str, releases: &str) -> Result<(), String> {
    const DATA: &str = "_data/tool_releases.json";
    let releases: serde_json::Value =
        serde_json::from_str(releases).map_err(|e| format!("{DATA}: {e}"))?;
    let releases = releases
        .as_object()
        .ok_or_else(|| format!("{DATA}: expected an object of releases"))?;
    // Only rows inside the Tool releases section count; without one, every release is missing.
    static SECTION: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"(?s)<section\b[^>]*\baria-labelledby="tool-releases"[^>]*>(.*?)</section>"#)
            .unwrap()
    });
    let section = SECTION
        .captures(source)
        .map_or("", |c| c.get(1).unwrap().as_str());
    let rows: HashSet<(NaiveDate, String)> = rows(section)?
        .into_iter()
        .map(|r| (r.entry.date, r.entry.link))
        .collect();
    let mut missing = Vec::new();
    for (slug, release) in releases {
        let release = release
            .as_object()
            .ok_or_else(|| format!("{DATA}: {slug} is not an object"))?;
        let field = |name: &str| {
            release
                .get(name)
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| format!("{DATA}: {slug} has no {name}"))
        };
        let url = field("url")?;
        let date = NaiveDate::parse_from_str(field("date")?, "%Y-%m-%d")
            .map_err(|_| format!("{DATA}: {slug} has an unreadable date"))?;
        if !release.contains_key("tag") && !url.contains("/releases/tag/") {
            continue;
        }
        let tag = field("tag")?;
        if !rows.contains(&(date, url.to_owned())) {
            missing.push(format!(
                "changelog: Tool releases has no {} row linking {tag} ({slug} in {DATA}); add one",
                date.format("%-d %B %Y")
            ));
        }
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(missing.join("\n"))
    }
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
    let changelog = root.join("changelog/index.html");
    let source = crate::read(&changelog)?;
    let with_anchors = anchored(&source)?;
    let feed = build(&with_anchors)?;
    check_release_rows(
        &source,
        &crate::read(&root.join("_data/tool_releases.json"))?,
    )?;
    let output = root.join("feed.xml");
    let (message, code) = if args.iter().any(|a| a == "--write") {
        if with_anchors != source {
            std::fs::write(&changelog, &with_anchors).map_err(|e| e.to_string())?;
        }
        std::fs::write(output, feed).map_err(|e| e.to_string())?;
        ("wrote feed.xml\n".into(), 0)
    } else if args.iter().any(|a| a == "--check") {
        if with_anchors != source {
            (
                "changelog rows lack entry anchors: run site-tools build_feed --write\n".into(),
                1,
            )
        } else if !output.is_file() || crate::read(&output)? != feed {
            (
                "feed.xml is stale: run site-tools build_feed --write\n".into(),
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
