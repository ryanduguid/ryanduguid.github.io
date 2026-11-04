//! scripts/stamp-source-freshness.mjs: stamp every tool card with the last commit date
//! of the source it links to, so the register shows real maintenance instead of a
//! hand-typed date. The dates are baked into the HTML, which keeps the site's
//! connect-src at 'self' and adds no runtime JavaScript.
//!
//! The default mode re-checks the committed stamps offline and is safe for CI.
//! --write refreshes them through gh, which holds its own credentials.
//! --check-releases reads release records through gh and flags changelog drift.
//! --write-tool-releases refreshes the tool release snapshot and the pages it feeds;
//! --build does the same and then builds the site.
//!
//! Exit 1 means the check ran and found something; exit 2 means it could not finish (an
//! API failure, say), so a caller can tell drift from an outage.
use crate::node;
use regex::{NoExpand, Regex};
use serde_json::{Map, Value};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::LazyLock;
use std::time::Duration;

const SITE_REPOSITORY: &str = "ryanduguid/ryanduguid.github.io";
const GH_TIMEOUT: Duration = Duration::from_secs(15);
const RELEASE_FIELDS: &str = "map({tag_name, draft, prerelease, published_at})";
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

fn pattern(source: &str) -> Regex {
    Regex::new(source).expect("valid pattern")
}

// The stamp rides the links paragraph each card already has, rather than adding a
// row. That line is where the source link lives, so the date sits beside the thing it
// describes, and on desktop it costs the page no extra height. The tool register is
// held to a page-length budget by tests/browser/site-quality.spec.mjs, which a new row
// per card would breach.
static CARD: LazyLock<Regex> =
    LazyLock::new(|| pattern(r#"<p class="collection-entry__links">((?s:.)*?)</p>"#));

// Counting cards independently of CARD is what stops a card whose links markup drifts
// from being skipped in silence while the rest still pass.
const ENTRY: &str = r#"<div class="collection-entry">"#;

static SOURCE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r#"<a href="https://github\.com/([^/"]+)/([^/"]+)(?:/tree/main/([^"]+))?""#)
});
static STAMP: LazyLock<Regex> =
    LazyLock::new(|| pattern(r#"<span class="collection-entry__stamp">(?s:.)*?</span>"#));
static READ_STAMP: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r#"<span class="collection-entry__stamp">Last commit <time datetime="([0-9]{4}-[0-9]{2}-[0-9]{2})">([^<]*)</time></span>"#,
    )
});
static RELEASE_SECTION: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r#"<section(?-u:\b)[^>]*(?-u:\b)aria-labelledby="tool-releases"[^>]*>((?s:.)*?)</section>"#,
    )
});
static RELEASE_LINK: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r##"<a href="https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/releases/tag/([^"#?]+)""##,
    )
});
static STABLE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^[0-9]+\.[0-9]+\.[0-9]+$"));
static RELEASE_META: LazyLock<Regex> =
    LazyLock::new(|| pattern(r#"<p class="release-meta">((?s:.)*?)</p>"#));
static LD_JSON: LazyLock<Regex> =
    LazyLock::new(|| pattern(r#"<script type="application/ld\+json">((?s:.)*?)</script>"#));
static LATEST_LIST: LazyLock<Regex> =
    LazyLock::new(|| pattern(r#"(<ul class="latest-releases"[^>]*>\n)(?s:.)*?(\n[ \t]*</ul>)"#));
static MCP_INDEX: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"(\[Aus Accounting MCP\]\(https://duguid\.com\.au/tools/australian-tax-ai-agents/\): local MCP server, current release )v[0-9.]+ \([^)]+\)",
    )
});
static ISO_DATE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"));

// A card can link to a repository root that holds far more than the tool it describes.
// The site repository is the case in point: dating the Coal LSL calculator from the
// root would credit it with every unrelated copy edit, and this workflow's own commits
// would move that date every week and restamp the card forever. Date those cards from
// the files that implement the tool instead, newest of them wins.
const CALCULATOR_PATHS: [&str; 4] = [
    "assets/levy.mjs",
    "assets/levy-form.mjs",
    "assets/levy-page.mjs",
    "assets/levy-explanation.mjs",
];

fn paths_for<'a>(owner: &str, repo: &str, path: Option<&'a str>) -> Vec<Option<&'a str>> {
    if format!("{owner}/{repo}") == SITE_REPOSITORY {
        CALCULATOR_PATHS.iter().map(|p| Some(*p)).collect()
    } else {
        vec![path]
    }
}

/// The site writes dates as "3 September 2026", with no leading zero.
pub fn format_date(iso: &str) -> String {
    let part = |i: usize| iso.split('-').nth(i).and_then(|p| p.parse::<u64>().ok());
    let month = part(1)
        .and_then(|m| usize::try_from(m).ok()?.checked_sub(1))
        .and_then(|m| MONTHS.get(m))
        .copied()
        .unwrap_or("undefined");
    let shown = |n: Option<u64>| n.map_or("NaN".into(), |n| n.to_string());
    format!("{} {month} {}", shown(part(2)), shown(part(0)))
}

fn source_name(owner: &str, repo: &str, path: Option<&str>) -> String {
    match path {
        Some(path) => format!("{owner}/{repo}/{path}"),
        None => format!("{owner}/{repo}"),
    }
}

/// What the tool reads and runs outside its own files.
pub trait Host {
    /// `execFileSync('gh', args, { encoding: 'utf8', timeout })`; the error is its message.
    fn gh(&mut self, args: &[&str], timeout: Option<Duration>) -> Result<String, String>;
    fn env(&self, name: &str) -> Option<String>;
    /// Today's UTC date as YYYY-MM-DD.
    fn today(&self) -> String;
    fn build_site(&mut self, root: &Path) -> Result<(), String>;
    fn say(&mut self, text: &str, stderr: bool);
}

/// The commit date of the newest commit to `owner/repo`, or to `path` in it. gh is used
/// rather than a bare fetch so the token stays inside the CLI. In Actions it
/// authenticates from GH_TOKEN; locally it uses the stored login.
pub fn last_commit_date(
    host: &mut dyn Host,
    owner: &str,
    repo: &str,
    path: Option<&str>,
) -> Result<String, String> {
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    query.append_pair("per_page", "1");
    if let Some(path) = path {
        query.append_pair("path", path);
    }
    let endpoint = format!("repos/{owner}/{repo}/commits?{}", query.finish());
    let answer = host.gh(
        &["api", &endpoint, "--jq", ".[0].commit.committer.date"],
        None,
    )?;
    let answer = node::trim(&answer);
    let iso = node::slice(answer, 10);
    if !ISO_DATE.is_match(&iso) {
        let shown = if answer.is_empty() { "(empty)" } else { answer };
        return Err(format!("{endpoint}: expected a commit date, got {shown}"));
    }
    Ok(iso)
}

/// The last commit date of (owner, repo, path), as `last_commit_date` finds it.
pub type CommitDate<'a> = dyn FnMut(&str, &str, Option<&str>) -> Result<String, String> + 'a;

/// Each tool card with a stamp for its source; `lookup` answers (owner, repo, path).
pub fn stamp_html(html: &str, lookup: &mut CommitDate<'_>) -> Result<String, String> {
    let mut stamped = String::new();
    let mut last = 0;
    for card in CARD.captures_iter(html) {
        let whole = card.get(0).expect("match");
        let body = &card[1];
        stamped.push_str(&html[last..whole.start()]);
        last = whole.end();
        let Some(source) = SOURCE.captures(body) else {
            stamped.push_str(whole.as_str());
            continue;
        };
        let (owner, repo) = (&source[1], &source[2]);
        let mut iso = String::new();
        for each in paths_for(owner, repo, source.get(3).map(|m| m.as_str())) {
            // ISO dates compare correctly as strings, so the newest is simply the max.
            let date = lookup(owner, repo, each)?;
            if date > iso {
                iso = date;
            }
        }
        stamped.push_str(&format!(
            r#"<p class="collection-entry__links">{}<span class="collection-entry__stamp">Last commit <time datetime="{iso}">{}</time></span></p>"#,
            STAMP.replacen(body, 1, ""),
            format_date(&iso)
        ));
    }
    stamped.push_str(&html[last..]);
    Ok(stamped)
}

/// What is wrong with the committed stamps, given today's UTC date.
pub fn check_html(html: &str, today: &str) -> Vec<String> {
    let mut failures = Vec::new();
    let mut cards = 0;
    for card in CARD.captures_iter(html) {
        cards += 1;
        let body = &card[1];
        let Some(found) = SOURCE.captures(body) else {
            failures.push("a tool card links to no source repository".to_owned());
            continue;
        };
        let source = source_name(&found[1], &found[2], found.get(3).map(|m| m.as_str()));
        let Some(stamp) = READ_STAMP.captures(body) else {
            failures.push(format!("{source}: no last-commit stamp"));
            continue;
        };
        let (iso, text) = (&stamp[1], &stamp[2]);
        if text != format_date(iso) {
            failures.push(format!(
                "{source}: stamp reads \"{text}\", expected \"{}\"",
                format_date(iso)
            ));
        }
        if iso > today {
            failures.push(format!("{source}: stamp date {iso} is in the future"));
        }
    }
    let entries = html.matches(ENTRY).count();
    if cards == 0 {
        failures.push("no tool cards matched; the card markup has changed".to_owned());
    } else if cards != entries {
        failures.push(format!(
            "{entries} tool cards but {cards} carry a links row; a card has drifted out of the stamped set"
        ));
    }
    failures
}

/// A GitHub release as the lookups read it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Release {
    pub tag_name: String,
    pub draft: bool,
    pub prerelease: bool,
    pub published_at: Option<String>,
}

impl Release {
    fn stable(&self) -> bool {
        !self.draft && !self.prerelease && self.published_at.is_some()
    }
}

/// Every release of `repository`, page by page.
pub fn fetch_releases(host: &mut dyn Host, repository: &str) -> Result<Vec<Release>, String> {
    let mut releases = Vec::new();
    for page in 1.. {
        let endpoint = format!("repos/{repository}/releases?per_page=100&page={page}");
        let answer = host.gh(
            &["api", &endpoint, "--jq", RELEASE_FIELDS],
            Some(GH_TIMEOUT),
        )?;
        let parsed: Value = serde_json::from_str(&answer).map_err(|e| e.to_string())?;
        let invalid = || format!("Invalid release list for {repository}");
        let Value::Array(items) = parsed else {
            return Err(invalid());
        };
        for item in &items {
            let tag_name = item
                .get("tag_name")
                .and_then(Value::as_str)
                .ok_or_else(invalid)?;
            releases.push(Release {
                tag_name: tag_name.to_owned(),
                draft: node::truthy(item.get("draft")),
                prerelease: node::truthy(item.get("prerelease")),
                published_at: item
                    .get("published_at")
                    .and_then(Value::as_str)
                    .filter(|p| !p.is_empty())
                    .map(str::to_owned),
            });
        }
        if items.len() < 100 {
            break;
        }
    }
    Ok(releases)
}

/// A tag's prefix and its `major.minor.patch`: `/^(.*?)(?<!\d)(\d+\.\d+\.\d+)$/`.
fn split_version(tag: &str) -> Option<(&str, &str)> {
    let mut at = 0;
    loop {
        let prefix = &tag[..at];
        if prefix.contains(['\n', '\r', '\u{2028}', '\u{2029}']) {
            return None;
        }
        if !prefix.ends_with(|c: char| c.is_ascii_digit()) && STABLE.is_match(&tag[at..]) {
            return Some((prefix, &tag[at..]));
        }
        at += tag[at..].chars().next()?.len_utf8();
    }
}

/// The newest published stable tag of `prefix` followed by a version.
fn latest<'a>(releases: &'a [Release], prefix: &str) -> Option<&'a str> {
    let mut tags: Vec<&str> = releases
        .iter()
        .filter(|r| r.stable())
        .map(|r| r.tag_name.as_str())
        .filter(|name| {
            name.strip_prefix(prefix)
                .is_some_and(|v| STABLE.is_match(v))
        })
        .collect();
    tags.sort_by(|a, b| node::numeric_compare(a, b));
    tags.last().copied()
}

type Lookup<'a> = dyn FnMut(&str) -> Result<Vec<Release>, String> + 'a;

/// The changelog's release links that are not published or are behind a newer release.
pub fn check_releases(html: &str, lookup: &mut Lookup<'_>) -> Result<Vec<String>, String> {
    let section = RELEASE_SECTION
        .captures(html)
        .map_or(String::new(), |c| c[1].to_owned());
    let links: Vec<(String, String)> = RELEASE_LINK
        .captures_iter(&section)
        .map(|c| (c[1].to_owned(), c[2].to_owned()))
        .collect();
    if links.is_empty() {
        return Ok(vec![
            "no release links found in changelog/index.html".into(),
        ]);
    }
    let recorded: Vec<String> = links.iter().map(|(r, t)| format!("{r}/{t}")).collect();
    let mut failures = Vec::new();
    let mut repositories: Vec<(String, Vec<Release>)> = Vec::new();
    // One line per package, naming its newest recorded tag: the table keeps every past
    // release, so a line per row would repeat the same drift many times.
    let mut behind: Vec<(String, String, String, String)> = Vec::new();
    for (repository, tag) in &links {
        if !repositories.iter().any(|(r, _)| r == repository) {
            let releases = lookup(repository)?;
            repositories.push((repository.clone(), releases));
        }
        let releases = &repositories
            .iter()
            .find(|(r, _)| r == repository)
            .expect("looked up")
            .1;
        let published: Vec<Release> = releases.iter().filter(|r| r.stable()).cloned().collect();
        let version = split_version(tag);
        let Some((prefix, _)) = version.filter(|_| published.iter().any(|r| r.tag_name == *tag))
        else {
            failures.push(format!(
                "{repository}: {tag} is not a published stable release"
            ));
            continue;
        };
        let latest = latest(&published, prefix).expect("the tag itself qualifies");
        let key = format!("{repository}/{latest}");
        if recorded.contains(&key) {
            continue;
        }
        match behind.iter_mut().find(|(k, ..)| *k == key) {
            Some(entry) if node::numeric_compare(&entry.2, tag).is_lt() => {
                *entry = (key, repository.clone(), tag.clone(), latest.to_owned());
            }
            Some(_) => {}
            None => behind.push((key, repository.clone(), tag.clone(), latest.to_owned())),
        }
    }
    for (_, repository, tag, latest) in behind {
        failures.push(format!("{repository}: {tag} is behind {latest}; review changelog/index.html and capability descriptions"));
    }
    Ok(failures)
}

// A tool page may pin an older release for its worked example, but then it must name
// the current release too, so a reader who installs from the page knows which version
// they are getting. The page passes when its release-meta tag is current, or when the
// current tag appears somewhere in the page text. Pages that render
// _includes/tool-meta.html link the release snapshot there.
pub fn check_tool_releases(
    root: &Path,
    pages: &[(String, String)],
    lookup: &mut Lookup<'_>,
) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let mut repositories: Vec<(String, Vec<Release>)> = Vec::new();
    for (rel, html) in pages {
        let mut meta = if html.contains("{% include tool-meta.html") {
            Some(r#"<a href="{{ release.url }}">"#.to_owned())
        } else {
            RELEASE_META.captures(html).map(|c| c[1].to_owned())
        };
        if let Some(text) = meta.as_ref().filter(|m| m.contains("{{ release.url }}")) {
            let slug = rel.split('/').nth(1).unwrap_or("undefined");
            let data: Value =
                serde_json::from_str(&node::read(&root.join("_data/tool_releases.json"))?)
                    .map_err(|e| e.to_string())?;
            let url = data
                .get(slug)
                .and_then(|s| s.get("url"))
                .and_then(Value::as_str)
                .filter(|u| !u.is_empty())
                .ok_or_else(|| format!("{rel}: no release snapshot"))?;
            meta = Some(text.replacen("{{ release.url }}", url, 1));
        }
        let Some(meta) = meta.filter(|m| !m.is_empty()) else {
            continue;
        };
        let Some(link) = RELEASE_LINK.captures(&meta) else {
            continue;
        };
        let (repository, tag) = (&link[1], &link[2]);
        let Some((prefix, _)) = split_version(tag) else {
            failures.push(format!("{rel}: {tag} is not a stable release tag"));
            continue;
        };
        if !repositories.iter().any(|(r, _)| r == repository) {
            let releases = lookup(repository)?;
            repositories.push((repository.to_owned(), releases));
        }
        let releases = &repositories
            .iter()
            .find(|(r, _)| r == repository)
            .expect("looked up")
            .1;
        if let Some(latest) = latest(releases, prefix)
            && latest != tag
            && !html.contains(latest)
        {
            failures.push(format!(
                "{rel}: pins {tag} but does not name the current release {latest}"
            ));
        }
    }
    Ok(failures)
}

/// Every `tools/<slug>/index.html` and its text, as (relative path, HTML).
fn tool_pages(root: &Path) -> Result<Vec<(String, String)>, String> {
    let mut pages = Vec::new();
    for entry in node::read_dir(&root.join("tools"))? {
        if !entry.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }
        let path = entry.path().join("index.html");
        if path.exists() {
            let name = entry.file_name().to_string_lossy().into_owned();
            pages.push((format!("tools/{name}/index.html"), node::read(&path)?));
        }
    }
    Ok(pages)
}

/// The date in Sydney of a UTC timestamp, as YYYY-MM-DD.
fn sydney_date(timestamp: &str) -> Result<String, String> {
    let instant = chrono::DateTime::parse_from_rfc3339(timestamp)
        .map_err(|_| "Invalid time value".to_owned())?;
    let date = crate::rates_register::sydney_date(instant.naive_utc());
    Ok(format!(
        "{:04}-{:02}-{:02}",
        date.year, date.month, date.day
    ))
}

fn text<'a>(value: Option<&'a Value>, what: &str) -> Result<&'a str, String> {
    value
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{what} must be a string"))
}

// Release data is refreshed explicitly at build time; ordinary Jekyll builds use the
// checked snapshot so offline checks never depend on GitHub availability.
pub fn build_tool_release_data(
    tools: &Map<String, Value>,
    lookup: &mut Lookup<'_>,
) -> Result<Map<String, Value>, String> {
    let mut repositories: Vec<(String, Vec<Release>)> = Vec::new();
    let mut data = Map::new();
    for (slug, tool) in tools {
        let prefix = match tool.get("tagPrefix") {
            Some(Value::Null) => continue, // The browser levy has no tagged release.
            other => node::template(other),
        };
        let repository = node::template(tool.get("repository"));
        if !repositories.iter().any(|(r, _)| *r == repository) {
            let releases = lookup(&repository)?;
            repositories.push((repository.clone(), releases));
        }
        let releases = &repositories
            .iter()
            .find(|(r, _)| *r == repository)
            .expect("looked up")
            .1;
        let tag = latest(releases, &prefix)
            .ok_or_else(|| format!("{slug}: no published stable release"))?;
        let release = releases
            .iter()
            .rfind(|r| r.tag_name == tag && r.stable())
            .expect("listed");
        let date = sydney_date(release.published_at.as_deref().expect("stable"))?;
        let label = format_date(&date);
        let mut entry = Map::new();
        entry.insert("version".into(), tag[prefix.len()..].into());
        entry.insert("tag".into(), tag.into());
        entry.insert("date".into(), date.into());
        entry.insert("dateLabel".into(), label.into());
        entry.insert(
            "url".into(),
            format!("https://github.com/{repository}/releases/tag/{tag}").into(),
        );
        data.insert(slug.clone(), Value::Object(entry));
    }
    Ok(data)
}

fn types(entry: &Value) -> Vec<&Value> {
    match entry.get("@type") {
        Some(Value::Array(items)) => items.iter().collect(),
        Some(other) => vec![other],
        None => vec![],
    }
}

fn graph(schema: &mut Value) -> Result<Vec<&mut Value>, String> {
    if matches!(schema.get("@graph"), None | Some(Value::Null)) {
        return Ok(vec![schema]);
    }
    match schema.get_mut("@graph") {
        Some(Value::Array(items)) => Ok(items.iter_mut().collect()),
        _ => Err("schema['@graph'] is not iterable".into()),
    }
}

/// The page with its SoftwareApplication entries carrying the tool's identity and its
/// current release; every JSON-LD block is rewritten as JSON.stringify writes it.
pub fn stamp_tool_metadata(
    html: &str,
    tool: &Value,
    release: Option<&Value>,
) -> Result<String, String> {
    let mut stamped = String::new();
    let mut last = 0;
    for block in LD_JSON.captures_iter(html) {
        let whole = block.get(0).expect("match");
        stamped.push_str(&html[last..whole.start()]);
        last = whole.end();
        let mut schema: Value = serde_json::from_str(&block[1]).map_err(|e| e.to_string())?;
        for entry in graph(&mut schema)? {
            if !types(entry)
                .iter()
                .any(|t| t.as_str() == Some("SoftwareApplication"))
            {
                continue;
            }
            let release =
                release.ok_or("Cannot read properties of undefined (reading 'version')")?;
            let Value::Object(fields) = entry else {
                continue;
            };
            for (key, value) in [
                (
                    "@type",
                    Some(serde_json::json!([
                        "SoftwareApplication",
                        "SoftwareSourceCode"
                    ])),
                ),
                ("name", tool.get("name").cloned()),
                ("alternateName", tool.get("alternateName").cloned()),
                ("softwareVersion", release.get("version").cloned()),
                ("dateModified", release.get("date").cloned()),
                ("codeRepository", tool.get("codeRepository").cloned()),
                ("isAccessibleForFree", Some(Value::Bool(true))),
            ] {
                // JSON.stringify leaves out a key set to undefined.
                match value {
                    Some(value) => {
                        fields.insert(key.into(), value);
                    }
                    None => {
                        fields.shift_remove(key);
                    }
                }
            }
            fields.shift_remove("offers");
            match tool.get("sameAs") {
                Some(Value::Array(items)) if !items.is_empty() => {
                    fields.insert("sameAs".into(), Value::Array(items.clone()));
                }
                Some(Value::String(s)) if !s.is_empty() => {
                    fields.insert("sameAs".into(), Value::String(s.clone()));
                }
                same if node::truthy(same) => {
                    fields.shift_remove("sameAs");
                }
                _ => {}
            }
        }
        stamped.push_str(&format!(
            "<script type=\"application/ld+json\">\n{}\n</script>",
            node::stringify(&schema)
        ));
    }
    stamped.push_str(&html[last..]);
    Ok(stamped)
}

/// The sitemap with `url`'s lastmod set to the page's one document modification date.
pub fn stamp_tool_sitemap(sitemap: &str, url: &str, html: &str) -> Result<String, String> {
    let mut dates: Vec<Value> = Vec::new();
    for block in LD_JSON.captures_iter(html) {
        let mut schema: Value = serde_json::from_str(&block[1]).map_err(|e| e.to_string())?;
        for entry in graph(&mut schema)? {
            let document = types(entry)
                .iter()
                .any(|t| matches!(t.as_str(), Some("WebPage" | "TechArticle")));
            if document
                && node::truthy(entry.get("dateModified"))
                && !dates.contains(&entry["dateModified"])
            {
                dates.push(entry["dateModified"].clone());
            }
        }
    }
    if dates.len() != 1 {
        return Err(format!("{url}: expected one document modification date"));
    }
    let lastmod = pattern(&format!(
        r"(<loc>{}</loc>[{}]*<lastmod>)[^<]+",
        regex::escape(url),
        node::SPACE
    ));
    let date = node::template(dates.first());
    Ok(lastmod
        .replacen(sitemap, 1, |c: &regex::Captures<'_>| {
            format!("{}{date}", &c[1])
        })
        .into_owned())
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

// The register's Delivery and Boundary come from _data/tools.json, the facts each tool
// page shows. They are written as static text so the register keeps no Liquid beyond
// the shared chrome, which lets wording-only pull requests use the offline site checks.
pub fn stamp_register_facts(register: &str, slug: &str, tool: &Value) -> Result<String, String> {
    // Each entry runs from its own opening div to the next one, so a card that loses
    // its facts cannot borrow a later card's.
    let mut parts: Vec<String> = register.split(ENTRY).map(str::to_owned).collect();
    let title = format!(r#"<a class="collection-entry__title" href="/tools/{slug}/">"#);
    let found: Vec<usize> = (1..parts.len())
        .filter(|i| parts[*i].contains(&title))
        .collect();
    if found.len() != 1 {
        return Err(format!(
            "tools/index.html: expected one register entry for {slug}, found {}",
            found.len()
        ));
    }
    let mut entry = parts[found[0]].clone();
    for (label, key) in [("Delivery", "delivery"), ("Boundary", "boundary")] {
        let field = pattern(&format!(r"(<dt>{label}</dt><dd>)[^<]*(</dd>)"));
        let count = field.find_iter(&entry).count();
        if count != 1 {
            return Err(format!(
                "tools/index.html: expected one {label} for {slug}, found {count}"
            ));
        }
        let value = escape_html(text(tool.get(key), &format!("{slug}: {key}"))?);
        entry = field
            .replace_all(&entry, |c: &regex::Captures<'_>| {
                format!("{}{value}{}", &c[1], &c[2])
            })
            .into_owned();
    }
    parts[found[0]] = entry;
    Ok(parts.join(ENTRY))
}

// The homepage lists the newest tagged releases. Ties on a date fall back to the slug,
// so a refresh never reorders an unchanged list.
pub fn stamp_latest_releases(
    home: &str,
    tools: &Map<String, Value>,
    data: &Map<String, Value>,
    limit: usize,
) -> Result<String, String> {
    if !LATEST_LIST.is_match(home) {
        return Err("index.html: latest releases list not found".into());
    }
    let mut releases: Vec<(&String, &Value)> = data
        .iter()
        .filter(|(slug, release)| {
            node::truthy(release.get("tag")) && node::truthy(tools.get(slug.as_str()))
        })
        .collect();
    let date = |release: &Value| node::template(release.get("date"));
    releases.sort_by(|(a, x), (b, y)| {
        node::locale_compare(&date(y), &date(x)).then_with(|| node::locale_compare(b, a))
    });
    let mut items = Vec::new();
    for (slug, release) in releases.into_iter().take(limit) {
        let day = date(release);
        if !ISO_DATE.is_match(&day) {
            return Err(format!("{slug}: release date must be YYYY-MM-DD"));
        }
        let name = node::template(tools[slug.as_str()].get("name"));
        items.push(format!(
            r#"            <li><a href="/tools/{slug}/">{} v{}</a> <time datetime="{day}">{}</time></li>"#,
            escape_html(&name),
            escape_html(&node::template(release.get("version"))),
            escape_html(&node::template(release.get("dateLabel")))
        ));
    }
    let items = items.join("\n");
    Ok(LATEST_LIST
        .replacen(home, 1, |c: &regex::Captures<'_>| {
            format!("{}{items}{}", &c[1], &c[2])
        })
        .into_owned())
}

/// llms.txt with the MCP server's current release.
pub fn stamp_mcp_index(text: &str, release: Option<&Value>) -> Result<String, String> {
    let Some(found) = MCP_INDEX.captures(text) else {
        return Ok(text.to_owned());
    };
    let release = release.ok_or("Cannot read properties of undefined (reading 'version')")?;
    let line = format!(
        "{}v{} ({})",
        &found[1],
        node::template(release.get("version")),
        node::template(release.get("dateLabel"))
    );
    Ok(MCP_INDEX.replacen(text, 1, NoExpand(&line)).into_owned())
}

/// The browser calculator's identity: the newest commit to the files that implement it,
/// as its SHA and committer date.
pub fn build_calculator_revision(host: &mut dyn Host) -> Result<(Value, String), String> {
    let mut revisions = Vec::new();
    for path in CALCULATOR_PATHS {
        let endpoint = format!(
            "repos/{SITE_REPOSITORY}/commits?path={}&per_page=1",
            node::encode_uri_component(path)
        );
        let answer = host.gh(
            &[
                "api",
                &endpoint,
                "--jq",
                ".[0]|{sha,date:.commit.committer.date}",
            ],
            Some(GH_TIMEOUT),
        )?;
        let revision: Value = serde_json::from_str(&answer).map_err(|e| e.to_string())?;
        let date = text(revision.get("date"), "revision date")?.to_owned();
        revisions.push((revision.get("sha").cloned().unwrap_or(Value::Null), date));
    }
    revisions.sort_by(|a, b| node::locale_compare(&a.1, &b.1));
    Ok(revisions.pop().expect("four revisions"))
}

fn parse_object(path: &Path) -> Result<Map<String, Value>, String> {
    match serde_json::from_str(&node::read(path)?).map_err(|e| e.to_string())? {
        Value::Object(map) => Ok(map),
        _ => Err(format!("{}: expected a JSON object", path.display())),
    }
}

fn write_tool_releases(root: &Path, host: &mut dyn Host, build: bool) -> Result<u8, String> {
    let tools = parse_object(&root.join("_data/tools.json"))?;
    let mut data = build_tool_release_data(&tools, &mut |r| fetch_releases(host, r))?;
    let (sha, revision_date) = build_calculator_revision(host)?;
    let date = sydney_date(&revision_date)?;
    let sha_text = node::template(Some(&sha));
    let mut levy = Map::new();
    levy.insert("version".into(), sha);
    levy.insert("date".into(), date.clone().into());
    levy.insert("dateLabel".into(), format_date(&date).into());
    levy.insert(
        "url".into(),
        format!("https://github.com/{SITE_REPOSITORY}/commit/{sha_text}").into(),
    );
    data.insert("coal-lsl-levy".into(), Value::Object(levy));
    node::write(
        &root.join("_data/tool_releases.json"),
        &format!("{}\n", node::stringify(&Value::Object(data.clone()))),
    )?;
    let register_path = root.join("tools").join("index.html");
    let sitemap_path = root.join("sitemap.xml");
    let mut sitemap = node::read(&sitemap_path)?;
    let mut register = node::read(&register_path)?;
    for (slug, tool) in &tools {
        let source = root.join("tools").join(slug).join("index.html");
        let html = stamp_tool_metadata(&node::read(&source)?, tool, data.get(slug))?;
        node::write(&source, &html)?;
        let url = format!("https://duguid.com.au/tools/{slug}/");
        sitemap = stamp_tool_sitemap(&sitemap, &url, &html)?;
        let name = node::template(tool.get("name"));
        let title = pattern(&format!(
            r#"(class="collection-entry__title" href="/tools/{}/">)[^<]*"#,
            regex::escape(slug)
        ));
        register = title
            .replacen(&register, 1, |c: &regex::Captures<'_>| {
                format!("{}{name}", &c[1])
            })
            .into_owned();
        let listed = pattern(&format!(
            r#"("name": ")[^"\n]+("[,]?[{}]*"url": "{}")"#,
            node::SPACE,
            regex::escape(&url)
        ));
        register = listed
            .replacen(&register, 1, |c: &regex::Captures<'_>| {
                format!("{}{name}{}", &c[1], &c[2])
            })
            .into_owned();
        register = stamp_register_facts(&register, slug, tool)?;
    }
    node::write(&sitemap_path, &sitemap)?;
    node::write(&register_path, &register)?;
    let home = root.join("index.html");
    node::write(
        &home,
        &stamp_latest_releases(&node::read(&home)?, &tools, &data, 3)?,
    )?;
    let index = root.join("llms.txt");
    node::write(
        &index,
        &stamp_mcp_index(&node::read(&index)?, data.get("australian-tax-ai-agents"))?,
    )?;
    host.say(
        "tool releases refreshed from published GitHub tags; browser levy from source revision",
        false,
    );
    if build {
        host.build_site(root)?;
    }
    Ok(0)
}

fn check_current_releases(root: &Path, host: &mut dyn Host) -> Result<u8, String> {
    let mut cache: Vec<(String, Vec<Release>)> = Vec::new();
    let mut cached = |repository: &str| -> Result<Vec<Release>, String> {
        if let Some((_, releases)) = cache.iter().find(|(r, _)| r == repository) {
            return Ok(releases.clone());
        }
        let releases = fetch_releases(host, repository)?;
        cache.push((repository.to_owned(), releases.clone()));
        Ok(releases)
    };
    let changelog = node::read(&root.join("changelog").join("index.html"))?;
    let mut failures = check_releases(&changelog, &mut cached)?;
    failures.extend(check_tool_releases(root, &tool_pages(root)?, &mut cached)?);
    drop(cached);
    for failure in &failures {
        host.say(failure, true);
    }
    if !failures.is_empty() {
        return Ok(1);
    }
    host.say("current release references passed", false);
    Ok(0)
}

fn freshness(root: &Path, args: &[String], host: &mut dyn Host) -> Result<u8, String> {
    let given = |flag: &str| args.iter().any(|a| a == flag);
    if given("--build") || given("--write-tool-releases") {
        return write_tool_releases(root, host, given("--build"));
    }
    if given("--check-releases") {
        return check_current_releases(root, host);
    }
    let page = root.join("tools").join("index.html");
    let html = node::read(&page)?;
    if given("--write") {
        if host.env("GITHUB_ACTIONS").as_deref() == Some("true")
            && host.env("GITHUB_REF").as_deref() != Some("refs/heads/main")
        {
            return Err("Source freshness writes in GitHub Actions require the main branch".into());
        }
        let updated = stamp_html(&html, &mut |owner, repo, path| {
            last_commit_date(host, owner, repo, path)
        })?;
        if updated != html {
            node::write(&page, &updated)?;
        }
        host.say(
            if updated == html {
                "source freshness unchanged"
            } else {
                "source freshness updated"
            },
            false,
        );
        return Ok(0);
    }
    let failures = check_html(&html, &host.today());
    for failure in &failures {
        host.say(failure, true);
    }
    if !failures.is_empty() {
        return Ok(1);
    }
    host.say("source freshness stamps passed", false);
    Ok(0)
}

/// The tool with `host` for gh, the environment and output: 2 when it could not finish.
pub fn main_with(root: &Path, args: &[String], host: &mut dyn Host) -> u8 {
    freshness(root, args, host).unwrap_or_else(|message| {
        host.say(&message, true);
        2
    })
}

/// gh, the process environment, the site build and the console.
pub struct System;

impl Host for System {
    fn gh(&mut self, args: &[&str], timeout: Option<Duration>) -> Result<String, String> {
        let child = Command::new("gh")
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| node::spawn_error(&e, "gh"))?;
        let (ended, stdout, stderr) = node::capture(child, timeout);
        // execFileSync passes the child's error output on whatever happens.
        let _ = std::io::Write::write_all(&mut std::io::stderr(), &stderr);
        let status = match ended {
            node::Ended::Exited(status) => status,
            node::Ended::TimedOut => return Err("spawnSync gh ETIMEDOUT".into()),
            node::Ended::Overflowed => return Err("spawnSync gh ENOBUFS".into()),
        };
        if !status.success() {
            let mut message = format!("Command failed: gh {}", args.join(" "));
            if !stderr.is_empty() {
                message.push('\n');
                message.push_str(&String::from_utf8_lossy(&stderr));
            }
            return Err(message);
        }
        Ok(String::from_utf8_lossy(&stdout).into_owned())
    }

    fn env(&self, name: &str) -> Option<String> {
        std::env::var(name).ok()
    }

    fn today(&self) -> String {
        chrono::Utc::now().format("%Y-%m-%d").to_string()
    }

    fn build_site(&mut self, root: &Path) -> Result<(), String> {
        crate::build_site::build(root, root).map(|_| ())
    }

    fn say(&mut self, text: &str, stderr: bool) {
        node::log(text, stderr);
    }
}

pub fn run(args: &[String]) -> Result<u8, String> {
    let mut host = System;
    Ok(match crate::root() {
        Ok(root) => main_with(&root, args, &mut host),
        Err(message) => {
            host.say(&message, true);
            2
        }
    })
}
