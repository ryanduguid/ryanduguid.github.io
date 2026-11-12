//! scripts/check_ato_sources.mjs: check every ATO page the portfolio cites, the pages
//! outside the ATO in [`WATCHED`], and every source behind a fact-bearing accounting
//! answer, at most [`MAX_URLS`] a run and in turns beyond that ([`select_sources`]).
//! The ATO answers GitHub runners with HTTP 403 and `site-tools check_links` can
//! only accept that denial on trust, so this sweep runs on Ryan's machine: `nodriver
//! batch` reads each page in a local Chrome and the text is compared with the copy kept
//! in --baseline from the previous weekly run.
//!
//! Failures: a page that returns an error status or no text, and a page whose text
//! changed substantively since the previous run, other than the legal database home
//! (CHANGE_EXEMPT). A substantive change needs editorial review of every file that cites
//! it; the report lists those files and the lines that differ. A change confined to
//! [`NOISE`] lines, or to a listing page ([`listing`]), is recorded but passes. A dead
//! link (HTTP 404 or 410) needs its citations repointed once a read at least
//! [`DEAD_HOLD_DAYS`] days after the first agrees; until then the report notes it and
//! a marker file beside the baseline text holds the first date. The hold is per URL and
//! a page that reads again clears it, so 3 days is the least wait, not a deadline. A cited
//! page dated after the
//! accounting question answers citing it were checked needs those answers rechecked
//! ([`QUESTIONS`]). A moved page that still resolves is a permanent redirect when every
//! hop is 301 or 308, listed for a mechanical update, and otherwise a note. The exit code
//! ([`exit_code`]) is 1 when any page could not be read and 2 when every other page the
//! run took was read and one changed, is a dead link, needs answers rechecked or moved
//! permanently, so the scheduled run can tell findings to act on from a broken sweep.
//! --issue FILE writes the findings as a GitHub issue body that names only public URLs
//! and repository paths.
//!
//! ponytail: every run overwrites the baseline, so a change fails one run and the next
//! run compares against the changed page. The report is the record, so it is saved first
//! and a rerun the same day adds to it; keep the baseline folder in git if a longer
//! history is wanted.
//!
//! Run with: site-tools check_ato_sources [--list] [--baseline DIR] [--out DIR] [--issue FILE] [directory ...]
//! Directories default to this repository. --list prints the URLs and the files citing
//! them without opening a browser. A live run needs --baseline, the folder holding one
//! text file per page, and --out, the folder for the dated Markdown report.
use crate::node;
use regex::Regex;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::LazyLock;
use std::time::{Duration, SystemTime};
use url::Url;

pub const NODRIVER: [&str; 2] = [
    r"C:\Tools\nodriver-browser\.venv\Scripts\python.exe",
    r"C:\Tools\nodriver-browser\server.py",
];
// The most pages one run reads (`select_sources` picks them), so that a run ends with its
// report before the scheduled task's 2-hour limit kills it. Whole weekly runs have taken
// 3.8 to 5.6 seconds a page, so 1,000 pages take about 94 minutes at the slowest rate seen,
// leaving more than one BATCH_TIMEOUT of the 120. A higher bound needs a longer limit on
// the task too.
pub const MAX_URLS: usize = 1_000;
// nodriver stops a batch after 15 minutes and refuses more than 100 URLs.
const BATCH_SIZE: usize = 50;
const BATCH_TIMEOUT: Duration = Duration::from_secs(20 * 60);
// ATO pages keep their text in section#content and the legal database keeps its text
// in main; the menu and footer around them change without the page changing.
const PAGE_SELECTOR: &str = "#content, main";
const MIN_TEXT: usize = 50;
const MAX_DIFF_LINES: usize = 40;

const SKIP_DIRS: [&str; 9] = [
    ".git",
    "node_modules",
    "_site",
    "graft",
    "tests",
    ".venv",
    "venv",
    "dist",
    "vendor",
];
const TEXT_EXTENSIONS: [&str; 12] = [
    ".html", ".md", ".py", ".rs", ".json", ".mjs", ".js", ".txt", ".yml", ".yaml", ".csv", ".toml",
];

fn pattern(source: &str) -> Regex {
    Regex::new(source).expect("valid pattern")
}

fn fancy(source: &str) -> fancy_regex::Regex {
    fancy_regex::Regex::new(source).expect("valid pattern")
}

// The ATO serves these as PDFs, which Chrome shows in its viewer instead of as text, so
// the record for one is the digest of the file.
static PDF: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?i)\.pdf(?:\?|$)"));
pub fn is_pdf(url: &str) -> bool {
    url.contains("/api/public/content/") || PDF.is_match(url)
}

// Rust keeps tests in tests.rs, *_tests.rs or *_test.rs and offline fixtures in
// examples/*_probe.rs.
static TEST_FILE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^test_|\.test\.|\.spec\.|_tests?\.rs$|^tests\.rs$"));
static EXAMPLE_PROBE: LazyLock<Regex> = LazyLock::new(|| pattern(r"_probe\.rs$"));
// An inline test module at the top level, up to its closing brace. rustfmt indents
// everything inside it, so its closing brace is the first line after it that starts
// with `}`; braces in strings and comments sit on indented lines. Lines end at any
// JavaScript line terminator.
// shortcut: a multi-line literal with a line starting `}` ends the cut early, which only
// leaves fixture addresses in.
static RUST_TEST_MODULE: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    let line_start = r"(?:^|(?<=[\n\r\x{2028}\x{2029}]))";
    fancy(&format!(
        r"{line_start}#\[cfg\(test\)\][{}]*mod [A-Za-z0-9_]+ \{{(?=[\n\r\x{{2028}}\x{{2029}}]|$)(?s:.)*?{line_start}\}}",
        node::SPACE
    ))
});
static ATO_URL: LazyLock<Regex> = LazyLock::new(|| {
    pattern(&format!(
        r#"https://www\.ato\.gov\.au/[^{}"'<>()\[\]`\\|,]*"#,
        node::SPACE
    ))
});
static ESCAPE: LazyLock<Regex> = LazyLock::new(|| pattern("%[0-9A-Fa-f]{2}"));

// Pages outside the ATO behind values their publishers revise: the NSW budget in June,
// the land tax year in January and the Coal LSL corporation when it announces a new
// levy. They are read every run whether or not a file cites them, and a change lists
// every file using each value, because the calculators and examples reuse the values
// without citing the page.
pub const WATCHED: [(&str, &[&str]); 3] = [
    (
        "https://coallsl.com.au/employer/administer-lsl/levy",
        &["2.7%"],
    ),
    (
        "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/thresholds-and-rates",
        &["$1,075,000"],
    ),
    (
        "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/payroll-tax/lodge-and-pay-returns/thresholds-and-rates",
        &["5.45%", "$1,200,000"],
    ),
];

const FACT_SOURCE_HOSTS: [&str; 8] = [
    "www.ato.gov.au",
    "www.abr.gov.au",
    "business.gov.au",
    "www.fairwork.gov.au",
    "www.revenue.nsw.gov.au",
    "coallsl.com.au",
    "www.tpb.gov.au",
    "duguid.com.au",
];

// The accounting questions date each bold answer (fact_checked, else the file's
// facts_checked). A cited page the ATO dates later needs that answer rechecked, even on
// the run that first reads the page and has no baseline to compare: question 6 cited a
// page added on 13 October 2026, changed by the ATO on 15 October and first read on 19
// October, so no run reported the change.
pub const QUESTIONS: &str = "_data/accounting_questions.json";
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

fn questions(data: &Value) -> Result<&Vec<Value>, String> {
    data.get("questions")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{QUESTIONS}: questions is not a list"))
}

/// The source URLs a question's answer rests on, each a public HTTPS page on a known host.
pub fn question_source_urls(data: &Value, question: &Value) -> Result<Vec<String>, String> {
    let mut keys = vec![question.get("source")];
    match question.get("fact_sources") {
        None | Some(Value::Null) => {}
        Some(Value::Array(items)) => keys.extend(items.iter().map(Some)),
        Some(_) => return Err("question.fact_sources is not iterable".into()),
    }
    let duguid = Url::parse("https://duguid.com.au").expect("valid base");
    keys.into_iter()
        .map(|key| {
            let name = node::template(key);
            let value = data
                .get("sources")
                .and_then(|s| s.get(&name))
                .and_then(|s| s.get("url"))
                .and_then(Value::as_str);
            let relative = |v: &str| v.starts_with('/') && !v.starts_with("//");
            let https = |v: &str| v.get(..8).is_some_and(|p| p.eq_ignore_ascii_case("https://"));
            let url = value
                .filter(|v| https(v) || relative(v))
                .and_then(|v| duguid.join(v).ok())
                .filter(|url| {
                    url.scheme() == "https"
                        && url.username().is_empty()
                        && url.password().is_none()
                        && url.port().is_none()
                        && url.host_str().is_some_and(|h| FACT_SOURCE_HOSTS.contains(&h))
                });
            let Some(mut url) = url else {
                return Err(format!(
                    "{QUESTIONS}: question {} source {name} is missing or not a supported public HTTPS URL",
                    node::template(question.get("id"))
                ));
            };
            url.set_fragment(None);
            Ok(url.as_str().to_owned())
        })
        .collect()
}

/// A watched URL counts only where the next character cannot continue it.
fn cites_whole(text: &str, url: &str) -> bool {
    text.match_indices(url).any(|(at, _)| {
        !text[at + url.len()..]
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric() || "_/%-".contains(c))
    })
}

/// Every ATO URL in `text`, cleaned of entities, fragments and trailing punctuation,
/// and every watched URL it cites whole.
pub fn extract_urls(text: &str) -> Vec<String> {
    let mut urls: Vec<String> = Vec::new();
    for found in ATO_URL.find_iter(text) {
        let url = found.as_str().replace("&amp;", "&");
        let url = url.trim_end_matches(['.', ',', ';', ':']);
        let url = url.split('#').next().unwrap_or_default();
        // Skip templates such as f-strings and printf patterns.
        if !ESCAPE.replace_all(url, "").contains(['{', '}', '$', '%'])
            && !urls.iter().any(|u| u == url)
        {
            urls.push(url.to_owned());
        }
    }
    for (url, _) in WATCHED {
        if cites_whole(text, url) && !urls.iter().any(|u| u == url) {
            urls.push(url.to_owned());
        }
    }
    urls
}

/// Every text file under `directory` that is not generated output or a test, with its
/// path relative to `directory`.
fn text_files(directory: &Path) -> Result<Vec<(PathBuf, String)>, String> {
    fn walk(
        directory: &Path,
        relative: &str,
        files: &mut Vec<(PathBuf, String)>,
    ) -> Result<(), String> {
        let in_examples = directory.file_name().is_some_and(|n| n == "examples");
        for entry in node::read_dir(directory)? {
            let name = entry.file_name().to_string_lossy().into_owned();
            let path = directory.join(&name);
            let rel = if relative.is_empty() {
                name.clone()
            } else {
                format!("{relative}/{name}")
            };
            if entry.file_type().is_ok_and(|t| t.is_dir()) {
                if !SKIP_DIRS.contains(&name.as_str()) {
                    walk(&path, &rel, files)?;
                }
            } else if TEXT_EXTENSIONS.contains(&node::extname(&name))
                && !TEST_FILE.is_match(&name)
                && !(in_examples && EXAMPLE_PROBE.is_match(&name))
            {
                files.push((path, rel));
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    walk(directory, "", &mut files)?;
    Ok(files)
}

fn label(directory: &Path) -> String {
    node::resolve(directory)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn parse(text: &str) -> Result<Value, String> {
    serde_json::from_str(text).map_err(|e| e.to_string())
}

/// Each cited URL and the files citing it, labelled by directory name, in ICU order.
pub type Sources = Vec<(String, Vec<String>)>;

pub fn collect_sources(directories: &[PathBuf]) -> Result<Sources, String> {
    let mut sources: Sources = WATCHED
        .iter()
        .map(|(u, _)| ((*u).to_owned(), Vec::new()))
        .collect();
    let mut index: HashMap<String, usize> = sources
        .iter()
        .enumerate()
        .map(|(i, (u, _))| (u.clone(), i))
        .collect();
    let mut cite = |sources: &mut Sources, url: String, citation: String, once: bool| {
        let at = *index.entry(url.clone()).or_insert_with(|| {
            sources.push((url, Vec::new()));
            sources.len() - 1
        });
        if !once || !sources[at].1.contains(&citation) {
            sources[at].1.push(citation);
        }
    };
    for directory in directories {
        let label = label(directory);
        for (path, rel) in text_files(directory)? {
            let text = node::read(&path)?;
            let text = if node::extname(&rel) == ".rs" {
                RUST_TEST_MODULE.replace_all(&text, "").into_owned()
            } else {
                text
            };
            for url in extract_urls(&text) {
                cite(&mut sources, url, format!("{label}/{rel}"), false);
            }
        }
        let file = directory.join(QUESTIONS);
        if file.exists() {
            let data = parse(&node::read(&file)?)?;
            for question in questions(&data)?
                .iter()
                .filter(|q| node::truthy(q.get("fact")))
            {
                for url in question_source_urls(&data, question)? {
                    cite(&mut sources, url, format!("{label}/{QUESTIONS}"), true);
                }
            }
        }
    }
    sources.sort_by(|(a, _), (b, _)| node::locale_compare(a, b));
    Ok(sources)
}

/// The sources one run reads, in their listed order, and how many are left for a later
/// run. Up to `limit` every source is read. Over it the run takes the watched pages, then
/// pages new to the baseline, then those whose baseline file was written longest ago
/// (every read rewrites it, and a page that failed keeps its older file), so a list too
/// long for one run is read in turns rather than refused.
pub fn select_sources(sources: &Sources, baseline: &Path, limit: usize) -> (Sources, usize) {
    if sources.len() <= limit {
        return (sources.clone(), 0);
    }
    let mut order: Vec<(u8, SystemTime, usize)> = sources
        .iter()
        .enumerate()
        .map(|(i, (url, _))| {
            if WATCHED.iter().any(|(watched, _)| watched == url) {
                return (0, SystemTime::UNIX_EPOCH, i);
            }
            let file = baseline.join(baseline_file(url));
            match std::fs::metadata(&file).and_then(|m| m.modified()) {
                Ok(written) => (2, written, i),
                // No baseline file yet, or none readable: read the page.
                Err(_) => (1, SystemTime::UNIX_EPOCH, i),
            }
        })
        .collect();
    order.sort_unstable();
    let mut chosen: Vec<usize> = order[..limit].iter().map(|&(.., i)| i).collect();
    chosen.sort_unstable();
    (
        chosen.into_iter().map(|i| sources[i].clone()).collect(),
        sources.len() - limit,
    )
}

/// Each watched value and the files containing it, labelled as above.
pub fn collect_values(directories: &[PathBuf]) -> Result<Vec<(&'static str, Vec<String>)>, String> {
    let mut values: Vec<(&str, Vec<String>)> = WATCHED
        .iter()
        .flat_map(|(_, values)| values.iter().map(|v| (*v, Vec::new())))
        .collect();
    for directory in directories {
        let label = label(directory);
        for (path, rel) in text_files(directory)? {
            let text = node::read(&path)?;
            for (value, files) in &mut values {
                if text.contains(*value) {
                    files.push(format!("{label}/{rel}"));
                }
            }
        }
    }
    Ok(values)
}

/// Chrome may report a requested URL with different percent-encoding, and the ATO drops
/// a trailing slash by redirect; neither is a move worth a note.
pub fn same_url(url: &str) -> String {
    let Ok(mut parsed) = Url::parse(url) else {
        return url.to_owned();
    };
    parsed.set_fragment(None);
    if let Some(path) = parsed.path().strip_suffix('/').map(str::to_owned) {
        parsed.set_path(&path);
    }
    node::decode_uri(parsed.as_str()).unwrap_or_else(|| url.to_owned())
}

// The legal database home lists the week's new documents, so its text changes every
// week (the failed runs of 24 and 28 September 2026), and the portfolio cites it only as
// the way into the database. Its status and removal still count.
static CHANGE_EXEMPT: LazyLock<String> =
    LazyLock::new(|| same_url("https://www.ato.gov.au/single-page-applications/legaldatabase"));

static BLANK_RUN: LazyLock<Regex> = LazyLock::new(|| pattern(r"\n{3,}"));

/// Non-breaking spaces and trailing blanks vary between renders of one page.
pub fn tidy(text: &str) -> String {
    let spaced: String = text
        .chars()
        .map(|c| {
            if node::is_space(c) && c != '\n' && c != '\t' {
                ' '
            } else {
                c
            }
        })
        .collect();
    let trimmed = spaced
        .split('\n')
        .map(|line| line.trim_end_matches([' ', '\t']))
        .collect::<Vec<_>>()
        .join("\n");
    node::trim(&BLANK_RUN.replace_all(&trimmed, "\n\n")).to_owned()
}

/// Lists the lines each version lacks, which is what a reviewer needs to see what the
/// ATO changed; it does not track where lines moved.
pub fn line_diff(before: &str, after: &str) -> String {
    let (had, has): (HashSet<&str>, HashSet<&str>) =
        (before.split('\n').collect(), after.split('\n').collect());
    let lacking = |text: &str, other: &HashSet<&str>, sign: char| -> Vec<String> {
        text.split('\n')
            .filter(|line| !node::trim(line).is_empty() && !other.contains(line))
            .map(|line| format!("{sign} {line}"))
            .collect()
    };
    let mut lines = lacking(before, &has, '-');
    lines.extend(lacking(after, &had, '+'));
    if lines.is_empty() {
        return "(only the order or repeats of lines changed)".into();
    }
    let more = lines.len().saturating_sub(MAX_DIFF_LINES);
    lines.truncate(MAX_DIFF_LINES);
    if more > 0 {
        lines.push(format!("... {more} more changed lines"));
    }
    lines.join("\n")
}

/// Text that changes without the cited content changing, removed from each line before
/// two versions are compared: the legal database's count of documents citing a ruling,
/// a listing's result count, the external link label (reworded from "Opens in a new
/// window" in October 2026) and the Last updated stamp, which alone marks no change
/// worth review. Most of the 16 changes on 19 October 2026 were these or a listing page.
/// Each pattern and its label, and whether it removes every match or the first.
pub static NOISE: LazyLock<[(fancy_regex::Regex, &str, bool); 4]> = LazyLock::new(|| {
    [
        (
            fancy(r"^[0-9,]+ related documents?$"),
            "related documents count",
            false,
        ),
        (
            fancy(r"^Showing [0-9,]+ - [0-9,]+ of [0-9,]+$"),
            "result count",
            false,
        ),
        (
            fancy(r"(?:^| )(?:Opens in a new window|External Link)(?= |$)"),
            "external link label",
            true,
        ),
        (
            fancy(r"^Last updated:? [0-9]{1,2} [A-Z][a-z]+ [0-9]{4}$"),
            "Last updated stamp",
            false,
        ),
    ]
});

fn without(line: &str, noise: &(fancy_regex::Regex, &str, bool)) -> String {
    if noise.2 {
        noise.0.replace_all(line, "").into_owned()
    } else {
        noise.0.replace(line, "").into_owned()
    }
}

fn substance(text: &str) -> String {
    text.split('\n')
        .map(|line| {
            let kept = NOISE
                .iter()
                .fold(line.to_owned(), |kept, noise| without(&kept, noise));
            node::trim(&kept).to_owned()
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

// `/^Last updated:? (.+)$/m`, whose lines end at any JavaScript line terminator.
static STAMP_TEXT: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    fancy(
        r"(?:^|(?<=[\n\r\x{2028}\x{2029}]))Last updated:? ([^\n\r\x{2028}\x{2029}]+)(?=[\n\r\x{2028}\x{2029}]|$)",
    )
});

fn stamp_text(text: &str) -> Option<String> {
    let found = STAMP_TEXT.captures(text).ok().flatten()?;
    Some(found[1].to_owned())
}

fn and_list(items: &[&str]) -> String {
    match items {
        [] => String::new(),
        [one] => (*one).to_owned(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
    }
}

/// Pages that list rather than state: the ATO home and the tax rates and codes hub
/// rotate feature tiles, a newsroom lists its latest articles, and the single-page
/// applications (the calculators) give the browser only navigation or a loader. A change
/// to one needs no review; its status and removal still count. Returns why the page is a
/// listing.
pub fn listing(url: &str) -> Option<&'static str> {
    let parsed = Url::parse(url).ok()?;
    let path = parsed.path().strip_suffix('/').unwrap_or(parsed.path());
    if path.is_empty() || path == "/tax-rates-and-codes" {
        Some("a hub page, whose feature tiles rotate")
    } else if path.ends_with("-newsroom") {
        Some("a newsroom, whose article list changes weekly")
    } else if path.starts_with("/single-page-applications/") {
        Some("a single-page application, whose text is navigation or a loader")
    } else {
        None
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Change {
    pub substantive: bool,
    /// Why a change needs no review; empty for a substantive change.
    pub reason: String,
    pub diff: String,
    pub hint: Option<String>,
}

/// Says whether a change needs review. `url` is the cited page, so a cited article that
/// now redirects to its newsroom is a change to review, every week until its citations
/// are updated, not a newsroom. A substantive change's diff leaves out the noise, and a
/// moved Last updated stamp comes with it as a hint.
pub fn describe_change(url: &str, before: &str, after: &str) -> Change {
    if let Some(kind) = listing(url) {
        return Change {
            reason: kind.into(),
            diff: line_diff(before, after),
            ..Change::default()
        };
    }
    let (was, now) = (substance(before), substance(after));
    if was == now {
        let (had, has): (HashSet<&str>, HashSet<&str>) =
            (before.split('\n').collect(), after.split('\n').collect());
        let changed: Vec<&str> = had.symmetric_difference(&has).copied().collect();
        let labels: Vec<&str> = NOISE
            .iter()
            .filter(|noise| changed.iter().any(|line| without(line, noise) != *line))
            .map(|noise| noise.1)
            .collect();
        let labels = and_list(&labels);
        return Change {
            reason: format!(
                "only the {} changed",
                if labels.is_empty() {
                    "spacing"
                } else {
                    &labels
                }
            ),
            diff: line_diff(before, after),
            ..Change::default()
        };
    }
    let hint = match (stamp_text(before), stamp_text(after)) {
        (Some(from), Some(to)) if from != to => {
            Some(format!("Last updated moved from {from} to {to}."))
        }
        _ => None,
    };
    Change {
        substantive: true,
        diff: line_diff(&was, &now),
        hint,
        ..Change::default()
    }
}

static HOST: LazyLock<Regex> = LazyLock::new(|| pattern("^https?://[^/]+"));
static NOT_ALPHANUMERIC: LazyLock<Regex> = LazyLock::new(|| pattern("[^A-Za-z0-9]+"));

/// A readable prefix for browsing the baseline, and a digest of the URL so two pages
/// never share a file.
pub fn baseline_file(url: &str) -> String {
    use sha1::{Digest, Sha1};
    let same = same_url(url);
    let slug = NOT_ALPHANUMERIC
        .replace_all(&HOST.replace(&same, ""), "-")
        .into_owned();
    let slug = slug.strip_prefix('-').unwrap_or(&slug);
    let slug = node::slice(slug.strip_suffix('-').unwrap_or(slug), 60);
    let digest: String = Sha1::digest(url.as_bytes())[..4] // NOSONAR: SHA-1 only names baseline files, as the Node script did; not a security use
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    format!(
        "{}-{digest}.txt",
        if slug.is_empty() { "home" } else { &slug }
    )
}

/// One page as the browser or the PDF reader read it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Page {
    pub error: Option<String>,
    pub status: Option<f64>,
    pub final_url: Option<String>,
    pub truncated: bool,
    pub text: Option<String>,
}

impl Page {
    pub fn error(message: impl Into<String>) -> Page {
        Page {
            error: Some(message.into()),
            ..Page::default()
        }
    }
}

/// A page read sorted into a failure, a note or nothing, with the text to keep as the
/// next baseline.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Outcome {
    pub failure: Option<String>,
    pub dead: bool,
    pub change: Option<Change>,
    pub text: Option<String>,
    pub note: Option<String>,
}

fn failed(failure: impl Into<String>) -> Outcome {
    Outcome {
        failure: Some(failure.into()),
        ..Outcome::default()
    }
}

/// The days a dead read waits for a second one: a single 404 can be a publisher's slip.
pub const DEAD_HOLD_DAYS: i64 = 3;

/// The file beside a page's baseline text holding the date it first read as dead. It
/// lasts as long as the baseline folder, which the scheduled sweep keeps between runs.
/// Holds are per URL: replacing a citation is a reviewed edit, and a new URL starts its
/// own hold.
pub fn dead_marker(url: &str) -> String {
    format!("{}.dead", baseline_file(url))
}

/// Whether a dead read today agrees with one at least [`DEAD_HOLD_DAYS`] days old. A
/// marker that is not a date holds nothing back.
pub fn dead_confirmed(first: &str, today: &str) -> bool {
    match (
        crate::py::Date::fromisoformat(first.trim()),
        crate::py::Date::fromisoformat(today),
    ) {
        (Some(first), Some(today)) => today.ordinal() - first.ordinal() >= DEAD_HOLD_DAYS,
        _ => true,
    }
}

/// Sorts one page read; `previous` is the baseline text, when there is one.
pub fn classify(url: &str, page: Option<&Page>, previous: Option<&str>) -> Outcome {
    let Some(page) = page else {
        return failed("no result from the browser");
    };
    if let Some(error) = &page.error {
        return failed(error.clone());
    }
    match page.status {
        Some(status) if status != 0.0 && !status.is_nan() && status < 400.0 => {}
        status => {
            return Outcome {
                dead: matches!(status, Some(404.0 | 410.0)),
                ..failed(format!(
                    "HTTP {}",
                    status.map_or("unknown".into(), node::number)
                ))
            };
        }
    }
    if page.truncated {
        return failed("page text was cut off");
    }
    let text = tidy(page.text.as_deref().unwrap_or_default());
    if node::length(&text) < MIN_TEXT {
        return failed("no page text");
    }
    let note = page
        .final_url
        .as_deref()
        .filter(|f| !f.is_empty() && same_url(f) != same_url(url))
        .map(|f| format!("now resolves to {f}"));
    if let Some(previous) = previous.filter(|p| *p != text && same_url(url) != *CHANGE_EXEMPT) {
        let change = describe_change(url, previous, &text);
        return Outcome {
            failure: change
                .substantive
                .then(|| "changed since the previous run".into()),
            change: Some(change),
            text: Some(text),
            note,
            ..Outcome::default()
        };
    }
    Outcome {
        text: Some(text),
        note,
        ..Outcome::default()
    }
}

static ISO_DATE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"));

/// A real calendar date written YYYY-MM-DD, so check dates compare as strings.
pub fn is_iso_date(value: Option<&Value>) -> bool {
    let Some(text) = value
        .and_then(Value::as_str)
        .filter(|t| ISO_DATE.is_match(t))
    else {
        return false;
    };
    let part = |range: std::ops::Range<usize>| text[range].parse::<u32>().unwrap_or(0);
    chrono::NaiveDate::from_ymd_opt(part(0..4) as i32, part(5..7), part(8..10)).is_some()
}

static LAST_UPDATED: LazyLock<Regex> = LazyLock::new(|| {
    let s = node::SPACE;
    pattern(&format!(
        "Last updated:?[{s}]+([0-9]{{1,2}})[{s}]+([A-Za-z0-9_]+)[{s}]+([0-9]{{4}})"
    ))
});

/// The page's 'Last updated' date as YYYY-MM-DD.
pub fn last_updated(text: &str) -> Option<String> {
    let found = LAST_UPDATED.captures(text)?;
    let month = MONTHS.iter().position(|m| *m == &found[2])? + 1;
    let date = format!("{}-{month:02}-{:0>2}", &found[3], &found[1]);
    is_iso_date(Some(&Value::from(date.as_str()))).then_some(date)
}

/// A cited page dated after the answers citing it were checked: its date and the ids of
/// those questions.
pub type Stale = Vec<(String, String, Vec<Value>)>;

pub fn answers_to_recheck(data: &Value, texts: &HashMap<String, String>) -> Result<Stale, String> {
    let mut stale: Stale = Vec::new();
    for question in questions(data)? {
        if !node::truthy(question.get("fact")) {
            continue;
        }
        let checked = match question.get("fact_checked") {
            None | Some(Value::Null) => data.get("facts_checked"),
            given => given,
        };
        // A malformed date would compare wrongly and hide a stale answer, so it stops
        // the run.
        if !is_iso_date(checked) {
            return Err(format!(
                "{QUESTIONS}: question {} check date {} is not a YYYY-MM-DD date",
                node::template(question.get("id")),
                node::template(checked)
            ));
        }
        let checked = checked.and_then(Value::as_str).unwrap_or_default();
        let id = question.get("id").cloned().unwrap_or(Value::Null);
        for url in question_source_urls(data, question)? {
            let Some(updated) = texts.get(&url).and_then(|t| last_updated(t)) else {
                continue;
            };
            if updated.as_str() <= checked {
                continue;
            }
            match stale.iter_mut().find(|(u, ..)| *u == url) {
                Some((_, _, ids)) => {
                    if !ids.contains(&id) {
                        ids.push(id.clone());
                    }
                }
                None => stale.push((url, updated, vec![id.clone()])),
            }
        }
    }
    Ok(stale)
}

/// The HTTP status and Location header of one request whose redirect is not followed.
pub type Get<'a> = dyn FnMut(&str) -> Result<(u16, Option<String>), String> + 'a;

/// Follows a moved page's redirects without the browser: the ATO answers plain requests
/// from the sweep machine with real 301s. A move is permanent when every hop is 301 or
/// 308; the target keeps any fragment the last Location names.
pub fn follow_redirects(url: &str, get: &mut Get<'_>) -> Result<(String, bool), String> {
    let mut target = url.to_owned();
    let mut permanent = true;
    for hops in 0..10 {
        let (status, location) = get(&target)?;
        let Some(location) = location.filter(|l| (300..=399).contains(&status) && !l.is_empty())
        else {
            return Ok((target, permanent && hops > 0));
        };
        permanent &= status == 301 || status == 308;
        target = Url::parse(&target)
            .and_then(|base| base.join(&location))
            .map_err(|_| "Invalid URL".to_owned())?
            .into();
    }
    Err("more than 10 redirects".into())
}

/// A fetch's failure as the sweep reports it: the cause's code, else the message.
fn failure_text(error: &ureq::Error) -> String {
    let (message, code) = node::fetch_failure(error);
    code.unwrap_or_else(|| message.into())
}

/// One request with redirects left unfollowed, as `fetch(url, { redirect: 'manual' })`.
pub fn get_unfollowed(url: &str) -> Result<(u16, Option<String>), String> {
    let agent = node::fetch_agent(Duration::from_secs(30), false, node::USER_AGENT, "*/*");
    let response = node::fetch(&agent, url).map_err(|e| failure_text(&e))?;
    Ok((
        response.status().as_u16(),
        node::header(&response, "location"),
    ))
}

/// Reads one batch with `nodriver batch` run by `command`, which keeps going past a
/// failed page and writes index.json with a text file per page.
pub fn run_batch_with(
    command: &[&str],
    urls: &[String],
    args: &[&str],
) -> Result<HashMap<String, Page>, String> {
    let directory = tempfile::Builder::new()
        .prefix("ato-batch-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let list = directory.path().join("urls.txt");
    let out = directory.path().join("pages");
    node::write(&list, &urls.join("\n"))?;
    let mut batch = Command::new(command[0]);
    batch
        .args(&command[1..])
        .arg("batch")
        .arg(&list)
        .arg("--out-dir")
        .arg(&out)
        .args(["--wait", "3"])
        .args(args)
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // windowsHide: no console window for the browser's interpreter.
        batch.creation_flags(0x0800_0000);
    }
    let outcome = match batch.spawn() {
        Err(error) => node::spawn_error(&error, command[0]),
        Ok(mut child) => match node::wait(&mut child, Some(BATCH_TIMEOUT)) {
            None => format!("spawnSync {} ETIMEDOUT", command[0]),
            Some(status) => format!(
                "exit {}",
                status.code().map_or("null".into(), |c| c.to_string())
            ),
        },
    };
    let index = out.join("index.json");
    if !index.exists() {
        return Err(format!(
            "nodriver batch wrote no index ({outcome}); see its output above"
        ));
    }
    let Value::Array(entries) = parse(&node::read(&index)?)? else {
        return Err("index.json is not a list".into());
    };
    let mut pages = HashMap::new();
    for entry in &entries {
        let url = node::template(entry.get("url"));
        let page = if node::truthy(entry.get("error")) {
            Page::error(node::template(entry.get("error")))
        } else {
            let file = entry
                .get("file")
                .and_then(Value::as_str)
                .ok_or("The \"path\" argument must be of type string")?;
            Page {
                status: entry.get("status").and_then(Value::as_f64),
                final_url: entry
                    .get("final_url")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                truncated: node::truthy(entry.get("truncated")),
                text: Some(node::read(&out.join(file))?),
                ..Page::default()
            }
        };
        pages.insert(url, page);
    }
    Ok(pages)
}

pub fn run_batch(urls: &[String], args: &[&str]) -> Result<HashMap<String, Page>, String> {
    run_batch_with(&NODRIVER, urls, args)
}

fn fetch_pdf(url: &str) -> Result<Page, String> {
    let agent = node::fetch_agent(Duration::from_secs(60), true, node::USER_AGENT, "*/*");
    let mut response = node::fetch(&agent, url).map_err(|e| failure_text(&e))?;
    let status = response.status().as_u16();
    if !(200..=299).contains(&status) {
        return Ok(Page {
            status: Some(f64::from(status)),
            ..Page::default()
        });
    }
    let kind = node::header(&response, "content-type").unwrap_or_default();
    if !kind.starts_with("application/pdf") {
        let kind = if kind.is_empty() {
            "no content type"
        } else {
            &kind
        };
        return Ok(Page::error(format!("expected a PDF, got {kind}")));
    }
    let final_url = ureq::ResponseExt::get_uri(&response).to_string();
    let body = response
        .body_mut()
        .with_config()
        .limit(u64::MAX)
        .read_to_vec()
        .map_err(|e| failure_text(&e))?;
    Ok(Page {
        status: Some(200.0),
        final_url: Some(final_url),
        text: Some(format!(
            "PDF, {} bytes, sha256 {}",
            body.len(),
            crate::sha256(&body)
        )),
        ..Page::default()
    })
}

/// A PDF fetched directly, tried up to three times when the fetch itself fails.
pub fn read_pdf(url: &str) -> Page {
    for attempt in 1.. {
        match fetch_pdf(url) {
            Ok(page) => return page,
            Err(error) if attempt == 3 => return Page::error(format!("PDF fetch failed: {error}")),
            Err(_) => std::thread::sleep(Duration::from_secs(3)),
        }
    }
    unreachable!("the third attempt returns")
}

fn retry_pdf(page: &Page) -> bool {
    page.error.is_some() || page.status.is_some_and(|s| s == 429.0 || s >= 500.0)
}

pub type Batch<'a> = dyn FnMut(&[String], &[&str]) -> Result<HashMap<String, Page>, String> + 'a;

/// Every page, by URL. PDFs are fetched directly; everything else goes through the
/// browser in batches. JavaScript assets start with the whole-text reader; they have no
/// page containers. A page without either container is read whole, and a page that
/// errors is read again, up to three rounds in all, because Chrome sometimes fails to
/// start and a page sometimes times out once. A PDF that errors joins the later rounds
/// too, so the browser batches between them give a dropped ATO connection minutes to
/// recover.
pub fn read_pages(
    urls: &[String],
    batch: &mut Batch<'_>,
    pdf: &mut dyn FnMut(&str) -> Page,
) -> Result<HashMap<String, Page>, String> {
    let mut pages: HashMap<String, Page> = HashMap::new();
    let mut pdfs: Vec<String> = urls.iter().filter(|u| is_pdf(u)).cloned().collect();
    let mut todo: Vec<String> = urls.iter().filter(|u| !is_pdf(u)).cloned().collect();
    let script =
        |url: &str| Url::parse(url).is_ok_and(|u| u.path().to_ascii_lowercase().ends_with(".js"));
    let mut whole: HashMap<String, bool> = todo.iter().map(|u| (u.clone(), script(u))).collect();
    for _round in 1..=3 {
        if pdfs.is_empty() && todo.is_empty() {
            break;
        }
        for url in &pdfs {
            pages.insert(url.clone(), pdf(url));
        }
        pdfs.retain(|url| retry_pdf(&pages[url]));
        for (main, args) in [
            (false, &["--selector", PAGE_SELECTOR][..]),
            (true, &["--main"][..]),
        ] {
            let list: Vec<String> = todo.iter().filter(|u| whole[*u] == main).cloned().collect();
            for chunk in list.chunks(BATCH_SIZE) {
                pages.extend(batch(chunk, args)?);
            }
        }
        todo.retain(|url| pages.get(url).is_none_or(|p| p.error.is_some()));
        for url in &todo {
            let error = pages.get(url).and_then(|p| p.error.as_deref());
            if error.is_some_and(|e| e.contains("nothing visible matches")) {
                whole.insert(url.clone(), true);
            }
        }
    }
    Ok(pages)
}

/// A page to review: what failed, where it is cited and, for a change, the lines that
/// differ, with the files using its watched values.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Entry {
    pub url: String,
    pub files: Vec<String>,
    pub failure: String,
    pub change: Option<Change>,
    pub dead: bool,
    pub recheck: bool,
    pub values: Vec<(String, Vec<String>)>,
}

/// A change that needs no review.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Quiet {
    pub url: String,
    pub files: Vec<String>,
    pub change: Change,
}

/// A cited URL that redirects permanently.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Move {
    pub url: String,
    pub target: String,
    pub files: Vec<String>,
}

/// A cited page that now resolves elsewhere.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Moved {
    pub url: String,
    pub files: Vec<String>,
    pub note: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Findings {
    pub date: String,
    pub read: usize,
    pub seeded: usize,
    pub review: Vec<Entry>,
    pub quiet: Vec<Quiet>,
    pub moves: Vec<Move>,
    pub notes: Vec<String>,
    /// Cited URLs over [`MAX_URLS`], left for a later run.
    pub deferred: usize,
}

/// The pages whose findings stand until their citations or answers change: permanent
/// redirects and answers to recheck. A run reads them again before other read pages.
pub fn standing_findings(findings: &Findings) -> Vec<&str> {
    findings
        .moves
        .iter()
        .map(|m| m.url.as_str())
        .chain(
            findings
                .review
                .iter()
                .filter(|e| e.recheck)
                .map(|e| e.url.as_str()),
        )
        .collect()
}

/// The sentence on URLs left for a later run, or nothing when every URL was read.
fn deferred_sentence(deferred: usize) -> String {
    if deferred == 0 {
        return String::new();
    }
    format!(" Cited URLs left for a later run: {deferred} (a run reads at most {MAX_URLS}).")
}

fn cited(files: &[String]) -> String {
    if files.is_empty() {
        return "no file".into();
    }
    files
        .iter()
        .map(|p| format!("`{p}`"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn sentence(text: &str) -> String {
    let mut chars = text.chars();
    let first = chars
        .next()
        .map(|c| c.to_uppercase().to_string())
        .unwrap_or_default();
    format!("{first}{}.", chars.as_str())
}

static FILE_URL: LazyLock<Regex> =
    LazyLock::new(|| pattern(&format!("(?i)file://[^{}]*", node::SPACE)));
static WINDOWS_PATH: LazyLock<fancy_regex::Regex> =
    LazyLock::new(|| fancy(r#"(?<![A-Za-z0-9_/.:-])(?:[A-Za-z]:[\\/]|\\\\)[^'"\n]*"#));
static UNIX_PATH: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    fancy(&format!(
        r#"(?<![A-Za-z0-9_/.:-])/(?:Users|home|tmp|root|mnt|var|private|opt)/[^{}'",)]*"#,
        node::SPACE
    ))
});

// A browser error can quote a file on the sweep machine; the issue is public. A Windows
// path can hold spaces, so it is cut to the next quote or line end.
fn public_text(text: &str) -> String {
    let text = FILE_URL.replace_all(text, "(local path)");
    let text = WINDOWS_PATH.replace_all(&text, "(local path)");
    UNIX_PATH.replace_all(&text, "(local path)").into_owned()
}

const MOVES_HELP: &str = "Replace each cited URL with its target in every file listed, including `scripts/src/check_links_data.rs` (keep HTTP_403_AUTOMATION_DENIAL_URLS sorted and its length current) and `scripts/src/site_contracts/data.rs`.";

/// A cited page that now redirects to a hub or newsroom was withdrawn rather than moved.
fn withdrawn(target: &str) -> bool {
    listing(target).is_some()
        && !Url::parse(target).is_ok_and(|u| u.path().starts_with("/single-page-applications/"))
}

fn move_line(entry: &Move) -> String {
    let note = if withdrawn(&entry.target) {
        " (a hub or newsroom, so the cited page was probably withdrawn: review the citation rather than replace it)"
    } else {
        ""
    };
    format!(
        "- `{}` → `{}`{note}. Cited in: {}",
        entry.url,
        entry.target,
        cited(&entry.files)
    )
}

fn value_lines(values: &[(String, Vec<String>)]) -> Vec<String> {
    values
        .iter()
        .map(|(value, files)| format!("  - `{value}` appears in: {}", cited(files)))
        .collect()
}

fn review_lines(entry: &Entry, fold: bool, diffs: bool) -> Vec<String> {
    let failure = if fold {
        public_text(&entry.failure)
    } else {
        entry.failure.clone()
    };
    let mut lines = vec![
        format!("### {}", entry.url),
        String::new(),
        format!("{} Cited in: {}", sentence(&failure), cited(&entry.files)),
        String::new(),
    ];
    if let Some(hint) = entry.change.as_ref().and_then(|c| c.hint.clone()) {
        lines.extend([hint, String::new()]);
    }
    for (value, files) in &entry.values {
        lines.extend([
            format!("`{value}` appears in: {}", cited(files)),
            String::new(),
        ]);
    }
    if let Some(change) = entry.change.as_ref().filter(|_| diffs) {
        let block = ["```diff".to_owned(), change.diff.clone(), "```".to_owned()];
        if fold {
            lines.extend([
                "<details><summary>Changed lines</summary>".to_owned(),
                String::new(),
            ]);
            lines.extend(block);
            lines.extend([String::new(), "</details>".to_owned()]);
        } else {
            lines.extend(block);
        }
        lines.push(String::new());
    }
    lines
}

/// The dated Markdown report: every finding, with every diff.
pub fn render_report(findings: &Findings) -> Vec<String> {
    let mut report = vec![
        format!("# ATO sources check {}", findings.date),
        String::new(),
        format!(
            "{} pages read, {} new to the baseline.{}",
            findings.read,
            findings.seeded,
            deferred_sentence(findings.deferred)
        ),
        String::new(),
        "## To review".to_owned(),
        String::new(),
    ];
    if findings.review.is_empty() {
        report.extend(["None.".to_owned(), String::new()]);
    }
    for entry in &findings.review {
        report.extend(review_lines(entry, false, true));
    }
    if !findings.quiet.is_empty() {
        report.extend(["## Changed, no review needed".to_owned(), String::new()]);
        for quiet in &findings.quiet {
            report.extend([
                format!("### {}", quiet.url),
                String::new(),
                format!(
                    "{} Cited in: {}",
                    sentence(&quiet.change.reason),
                    cited(&quiet.files)
                ),
                String::new(),
                "```diff".to_owned(),
                quiet.change.diff.clone(),
                "```".to_owned(),
                String::new(),
            ]);
        }
    }
    if !findings.moves.is_empty() {
        report.extend([
            "## Permanent redirects".to_owned(),
            String::new(),
            MOVES_HELP.to_owned(),
            String::new(),
        ]);
        report.extend(findings.moves.iter().map(move_line));
        report.push(String::new());
    }
    if !findings.notes.is_empty() {
        report.extend(["## Notes".to_owned(), String::new()]);
        report.extend(findings.notes.iter().map(|n| format!("- {n}")));
        report.push(String::new());
    }
    report
}

// GitHub refuses an issue body over 65,536 characters; past this the issue drops its
// diffs and the report keeps them.
const ISSUE_LIMIT: usize = 60_000;

/// The same findings as a GitHub issue body. The repository is public, so it names only
/// the pages, the repository paths citing them and the diffs.
pub fn render_issue(findings: &Findings, diffs: bool) -> String {
    let changed: Vec<&Entry> = findings
        .review
        .iter()
        .filter(|e| e.change.is_some())
        .collect();
    let dead: Vec<&Entry> = findings.review.iter().filter(|e| e.dead).collect();
    let recheck: Vec<&Entry> = findings.review.iter().filter(|e| e.recheck).collect();
    let unread: Vec<&Entry> = findings
        .review
        .iter()
        .filter(|e| e.change.is_none() && !e.dead && !e.recheck)
        .collect();
    let mut lines = vec![
        format!(
            "The weekly ATO source sweep of {} read {} pages: {} changed substantively, {} changed with nothing to review, {} returned HTTP 404 or 410 (dead links), {} need accounting answers rechecked, {} could not be read and {} cited URLs redirect permanently.{}",
            findings.date,
            findings.read,
            changed.len(),
            findings.quiet.len(),
            dead.len(),
            recheck.len(),
            unread.len(),
            findings.moves.len(),
            deferred_sentence(findings.deferred)
        ),
        String::new(),
    ];
    let section = |lines: &mut Vec<String>, heading: &str| {
        lines.extend([format!("## {heading}"), String::new()]);
    };
    if !changed.is_empty() {
        section(&mut lines, "Substantive changes");
        lines.extend([
            "Review each file citing these pages against the page.".to_owned(),
            String::new(),
        ]);
        for entry in &changed {
            lines.extend(review_lines(entry, true, diffs));
        }
    }
    let listed = |entry: &Entry| {
        let mut out = vec![format!(
            "- {}: {}. Cited in: {}",
            entry.url,
            public_text(&entry.failure),
            cited(&entry.files)
        )];
        out.extend(value_lines(&entry.values));
        out
    };
    if !dead.is_empty() {
        section(&mut lines, "Dead links");
        lines.extend([
            "Repoint each citation of these pages in every file listed.".to_owned(),
            String::new(),
        ]);
        lines.extend(dead.iter().flat_map(|e| listed(e)));
        lines.push(String::new());
    }
    if !recheck.is_empty() {
        section(&mut lines, "Answers to recheck");
        lines.extend(
            recheck
                .iter()
                .map(|e| format!("- {}: {}. Cited in: {}", e.url, e.failure, cited(&e.files))),
        );
        lines.push(String::new());
    }
    if !unread.is_empty() {
        section(&mut lines, "Pages that could not be read");
        lines.extend(unread.iter().flat_map(|e| listed(e)));
        lines.push(String::new());
    }
    if !findings.moves.is_empty() {
        section(&mut lines, "Permanent redirects");
        lines.extend([MOVES_HELP.to_owned(), String::new()]);
        lines.extend(findings.moves.iter().map(move_line));
        lines.push(String::new());
    }
    if !findings.quiet.is_empty() {
        section(&mut lines, "Changes that need no review");
        lines.extend(findings.quiet.iter().map(|q| {
            format!(
                "- {}: {}. Cited in: {}",
                q.url,
                q.change.reason,
                cited(&q.files)
            )
        }));
        lines.push(String::new());
    }
    if !findings.notes.is_empty() {
        section(&mut lines, "Other redirects");
        lines.extend(
            findings
                .notes
                .iter()
                .map(|n| format!("- {}", public_text(n))),
        );
        lines.push(String::new());
    }
    let body = lines.join("\n");
    if diffs && node::length(&body) > ISSUE_LIMIT {
        return render_issue(findings, false);
    }
    // Still too long without diffs: cut it; the report on the sweep machine has the rest.
    if node::length(&body) > ISSUE_LIMIT {
        return format!(
            "{}\n\n(Cut at {ISSUE_LIMIT} characters; the sweep's report lists every finding.)\n",
            node::slice(&body, ISSUE_LIMIT)
        );
    }
    body
}

/// Traces one moved page: its final target and whether every hop was permanent.
pub type Follow<'a> = dyn FnMut(&str) -> Result<(String, bool), String> + 'a;

/// Sorts the moved pages into permanent redirects and notes; `follow` traces one.
pub fn sort_moves(moved: &[Moved], follow: &mut Follow<'_>) -> (Vec<Move>, Vec<String>) {
    let mut moves = Vec::new();
    let mut notes = Vec::new();
    for Moved { url, files, note } in moved {
        match follow(url) {
            Ok((target, true)) => moves.push(Move {
                url: url.clone(),
                target,
                files: files.clone(),
            }),
            Ok(_) => notes.push(format!("{url} {note}")),
            Err(error) => notes.push(format!("{url} {note} (redirect not checked: {error})")),
        }
    }
    (moves, notes)
}

/// Saves the report before any baseline moves: it is the only record of a change, so an
/// earlier one is never replaced.
pub fn save_results(
    out: &Path,
    baseline: &Path,
    date: &str,
    report: &[String],
    keep: &[(PathBuf, String)],
) -> Result<(), String> {
    std::fs::create_dir_all(out).map_err(|e| node::fs_error(&e, "mkdir", out))?;
    let file = out.join(format!("ato-sources-check-{date}.md"));
    let separator = if file.exists() { "\n---\n\n" } else { "" };
    std::fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(&file)
        .and_then(|mut f| f.write_all(format!("{separator}{}", report.join("\n")).as_bytes()))
        .map_err(|e| node::fs_error(&e, "open", &file))?;
    std::fs::create_dir_all(baseline).map_err(|e| node::fs_error(&e, "mkdir", baseline))?;
    for (path, text) in keep {
        node::write(path, text)?;
    }
    Ok(())
}

/// 1 when a page could not be read; 2 when every other page the run took was read and a
/// page changed substantively, is a dead link (HTTP 404 or 410), needs answers rechecked
/// or a cited URL moved permanently, so the scheduled task raises the issue until the
/// citing files are updated; otherwise 0.
pub fn exit_code(review: &[Entry], moves: &[Move]) -> u8 {
    if review
        .iter()
        .any(|e| e.change.is_none() && !e.dead && !e.recheck)
    {
        return 1;
    }
    if review.is_empty() && moves.is_empty() {
        0
    } else {
        2
    }
}

#[derive(Debug, Default, PartialEq)]
pub struct Options {
    pub list: bool,
    pub baseline: Option<String>,
    pub out: Option<String>,
    pub issue: Option<String>,
    pub positionals: Vec<String>,
}

/// `util.parseArgs` in strict mode with positionals, and its error messages.
pub fn parse_args(args: &[String]) -> Result<Options, String> {
    let unknown = |raw: &str| {
        format!(
            "Unknown option '{raw}'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- {}",
            Value::from(raw)
        )
    };
    let mut options = Options::default();
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        if arg == "--" {
            options.positionals.extend(rest.by_ref().cloned());
            break;
        }
        if arg == "-" || !arg.starts_with('-') {
            options.positionals.push(arg.clone());
            continue;
        }
        let Some(long) = arg.strip_prefix("--") else {
            let first = arg[1..].chars().next().expect("longer than '-'");
            return Err(unknown(&format!("-{first}")));
        };
        let (name, inline) = match long.split_once('=') {
            Some((name, value)) => (name, Some(value.to_owned())),
            None => (long, None),
        };
        let slot = match name {
            "list" if inline.is_some() => {
                return Err("Option '--list' does not take an argument".into());
            }
            "list" => {
                options.list = true;
                continue;
            }
            "baseline" => &mut options.baseline,
            "out" => &mut options.out,
            "issue" => &mut options.issue,
            _ => return Err(unknown(&format!("--{name}"))),
        };
        let value = match inline {
            Some(value) => value,
            None => match rest.next() {
                // A lone '-' is a value; anything longer starting with one looks like
                // an option.
                Some(value) if value.len() > 1 && value.starts_with('-') => {
                    return Err(format!(
                        "Option '--{name}' argument is ambiguous.\nDid you forget to specify the option argument for '--{name}'?\nTo specify an option argument starting with a dash use '--{name}=-XYZ'."
                    ));
                }
                Some(value) => value.clone(),
                None => return Err(format!("Option '--{name} <value>' argument missing")),
            },
        };
        *slot = Some(value);
    }
    Ok(options)
}

fn sweep(args: &[String]) -> Result<u8, String> {
    let options = parse_args(args)?;
    let directories: Vec<PathBuf> = if options.positionals.is_empty() {
        vec![crate::root()?]
    } else {
        options.positionals.iter().map(PathBuf::from).collect()
    };
    let sources = collect_sources(&directories)?;
    if options.list {
        for (url, files) in &sources {
            node::log(&format!("{url}\n  {}", files.join("\n  ")), false);
        }
        node::log(
            &format!(
                "{} URLs, {} of them watched outside the ATO",
                sources.len(),
                WATCHED.len()
            ),
            false,
        );
        return Ok(0);
    }
    let given = |value: &Option<String>| value.clone().filter(|v| !v.is_empty());
    let (Some(baseline), Some(out)) = (given(&options.baseline), given(&options.out)) else {
        node::log(
            "--baseline DIR and --out DIR are required for a live run",
            true,
        );
        return Ok(1);
    };
    let (sources, deferred) = select_sources(&sources, Path::new(&baseline), MAX_URLS);
    let urls: Vec<String> = sources.iter().map(|(u, _)| u.clone()).collect();
    let pages = read_pages(&urls, &mut run_batch, &mut read_pdf)?;
    let value_files = collect_values(&directories)?;
    let mut findings = Findings {
        date: chrono::Local::now().format("%Y-%m-%d").to_string(),
        read: sources.len(),
        deferred,
        ..Findings::default()
    };
    let mut moved = Vec::new();
    let mut held = Vec::new();
    let mut recovered = Vec::new();
    let mut keep: Vec<(PathBuf, String)> = Vec::new();
    let mut texts: HashMap<String, String> = HashMap::new();
    for (url, files) in &sources {
        let file = Path::new(&baseline).join(baseline_file(url));
        let previous = if file.exists() {
            Some(node::read(&file)?)
        } else {
            None
        };
        let outcome = classify(url, pages.get(url), previous.as_deref());
        let marker = Path::new(&baseline).join(dead_marker(url));
        if outcome.dead {
            let first = if marker.exists() {
                node::read(&marker)?
            } else {
                keep.push((marker, findings.date.clone()));
                findings.date.clone()
            };
            if !dead_confirmed(&first, &findings.date) {
                held.push(format!(
                    "{url} read as dead on {}; held until a read at least {DEAD_HOLD_DAYS} days later agrees",
                    first.trim()
                ));
                continue;
            }
        } else if outcome.text.is_some() && marker.exists() {
            // A read page ends the hold; a change or stale answer on it still reports below.
            recovered.push(marker);
        }
        if let Some(text) = &outcome.text {
            keep.push((file, text.clone()));
            texts.insert(url.clone(), text.clone());
            if previous.is_none() {
                findings.seeded += 1;
            }
        }
        if let Some(note) = outcome.note {
            moved.push(Moved {
                url: url.clone(),
                files: files.clone(),
                note,
            });
        }
        match (outcome.failure, outcome.change) {
            (None, Some(change)) => findings.quiet.push(Quiet {
                url: url.clone(),
                files: files.clone(),
                change,
            }),
            (Some(failure), change) => {
                let values = WATCHED
                    .iter()
                    .filter(|(watched, _)| watched == url)
                    .flat_map(|(_, values)| values.iter())
                    .map(|value| {
                        let files = value_files.iter().find(|(v, _)| v == value);
                        (
                            (*value).to_owned(),
                            files.map(|(_, f)| f.clone()).unwrap_or_default(),
                        )
                    })
                    .collect();
                findings.review.push(Entry {
                    url: url.clone(),
                    files: files.clone(),
                    failure,
                    change,
                    dead: outcome.dead,
                    values,
                    ..Entry::default()
                });
            }
            (None, None) => {}
        }
    }
    for directory in directories.iter().filter(|d| d.join(QUESTIONS).exists()) {
        let data = parse(&node::read(&directory.join(QUESTIONS))?)?;
        for (url, updated, ids) in answers_to_recheck(&data, &texts)? {
            let ids: Vec<String> = ids
                .iter()
                .map(|id| {
                    if id.is_null() {
                        String::new()
                    } else {
                        node::template(Some(id))
                    }
                })
                .collect();
            let failure = format!(
                "updated {updated}, after the answers to questions {} were checked; recheck them against the page and set their `fact_checked` in `{}/{QUESTIONS}`",
                ids.join(", "),
                label(directory)
            );
            let files = sources
                .iter()
                .find(|(u, _)| *u == url)
                .map(|(_, f)| f.clone())
                .unwrap_or_default();
            findings.review.push(Entry {
                url,
                files,
                failure,
                recheck: true,
                ..Entry::default()
            });
        }
    }
    (findings.moves, findings.notes) = sort_moves(&moved, &mut |url| {
        follow_redirects(url, &mut get_unfollowed)
    });
    findings.notes.extend(held);
    // The issue file is written before any baseline moves, so a failed write leaves the
    // changes to find again.
    if let Some(issue) = given(&options.issue) {
        node::write(Path::new(&issue), &render_issue(&findings, true))?;
    }
    save_results(
        Path::new(&out),
        Path::new(&baseline),
        &findings.date,
        &render_report(&findings),
        &keep,
    )?;
    for marker in &recovered {
        std::fs::remove_file(marker).map_err(|e| node::fs_error(&e, "unlink", marker))?;
    }
    // Each standing finding's page was read and rewritten above; dating its file to the
    // epoch puts it first in the next run's turn after the watched and new pages.
    for url in standing_findings(&findings) {
        let file = Path::new(&baseline).join(baseline_file(url));
        if file.exists() {
            std::fs::File::options()
                .write(true)
                .open(&file)
                .and_then(|f| f.set_modified(SystemTime::UNIX_EPOCH))
                .map_err(|e| node::fs_error(&e, "utime", &file))?;
        }
    }
    for Move { url, target, .. } in &findings.moves {
        node::log(&format!("moved: {url} -> {target}"), false);
    }
    for note in &findings.notes {
        node::log(&format!("note: {note}"), false);
    }
    for entry in &findings.review {
        node::log(&format!("{}: {}", entry.url, entry.failure), true);
    }
    node::log(
        &format!(
            "{} sources read, {} new to the baseline, {} changed with nothing to review{}",
            sources.len(),
            findings.seeded,
            findings.quiet.len(),
            if deferred == 0 {
                String::new()
            } else {
                format!(", {deferred} left for a later run")
            }
        ),
        false,
    );
    Ok(exit_code(&findings.review, &findings.moves))
}

pub fn run(args: &[String]) -> Result<u8, String> {
    Ok(sweep(args).unwrap_or_else(|message| {
        node::log(&message, true);
        1
    }))
}
