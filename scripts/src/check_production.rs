//! scripts/check_production.mjs: check the public site as delivered, which the
//! repository's own checks cannot see. They run against _site or the local preview,
//! while Cloudflare sits in front of GitHub Pages and rewrites what visitors receive.
//!
//! Hard failures are the promises README.md makes about delivery: the five response
//! headers the transform rule adds, the retired-route redirects, and mailto links that
//! survive delivery (Email Address Obfuscation rewrites them and strips the address when
//! it is on). Injected inline scripts are reported, not failed, because they are edge
//! settings the page's own Content Security Policy already blocks. An analytics tag
//! fails: the Privacy page states that no analytics script is delivered, so its return
//! would falsify that notice. Rocket Loader fails too: it re-types every script and runs
//! them through its own loader, so visitors would get a page the browser and Lighthouse
//! checks never ran. So does any script source other than the site's own /assets/
//! modules: Cloudflare's WebMCP setting injected /.webmcp/bridge.js into every page,
//! same-origin and executed, and nothing here saw it.
//!
//! Some paths must stay absent. GitHub Pages' legacy build turned the Markdown files
//! without front matter into themed pages the repository's own build never makes, with a
//! theme stylesheet; _config.yml now switches that off.
//!
//! Run with: site-tools check_production [--base https://duguid.com.au] [--source-root _site] [--source-only]
use crate::node;
use regex::Regex;
use std::path::Path;
use std::sync::LazyLock;
use std::time::Duration;
use url::Url;

// A browser user agent, because Cloudflare adds its analytics tag only for
// browser-like requests and the check should see what a visitor sees.
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 duguid-production-check";
const ACCEPT: &str = "text/html,application/xhtml+xml";
const TIMEOUT: Duration = Duration::from_secs(20);

pub const REQUIRED_HEADERS: [(&str, &str); 5] = [
    (
        "strict-transport-security",
        "max-age=31536000; includeSubDomains",
    ),
    ("x-content-type-options", "nosniff"),
    ("referrer-policy", "strict-origin-when-cross-origin"),
    (
        "permissions-policy",
        "camera=(), microphone=(), geolocation=()",
    ),
    ("content-security-policy", "frame-ancestors 'none'"),
];

pub const REDIRECTS: [(&str, &str); 4] = [
    ("/engage/", "/"),
    ("/tools/review-ready-gate/", "/tools/workpaper-review-gate/"),
    ("/refusals", "/tools/refusals/"),
    ("/refusals/", "/tools/refusals/"),
];

pub const EXPECTED_ABSENT: [&str; 4] = [
    "/rates/register/",
    "/rates/register/CHANGELOG.html",
    "/assets/credentials/SOURCES.html",
    "/assets/css/style.css",
];

// A script tag read attribute by attribute, quoted either way or not at all, so a ">"
// inside another attribute's value does not end the tag early.
static SCRIPT_TAG: LazyLock<Regex> = LazyLock::new(|| {
    let s = node::SPACE;
    Regex::new(&format!(
        r#"<(?i-u:script)(?-u:\b)((?:[{s}]+[^{s}"'>/=]+(?:[{s}]*=[{s}]*(?:"[^"]*"|'[^']*'|[^{s}"'=<>`]+))?)*)[{s}]*/?>"#
    ))
    .expect("valid pattern")
});
static ATTRIBUTE: LazyLock<Regex> = LazyLock::new(|| {
    let s = node::SPACE;
    Regex::new(&format!(
        r#"([^{s}"'>/=]+)(?:[{s}]*=[{s}]*(?:"([^"]*)"|'([^']*)'|([^{s}"'=<>`]+)))?"#
    ))
    .expect("valid pattern")
});
static MAILTO: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"href="(mailto:[^"]+)""#).expect("valid pattern"));
static RETYPED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"<script(?-u:\b)[^>]*(?-u:\b)type="[0-9a-f]{16,}-(?:module|text/javascript)""#)
        .expect("valid pattern")
});
static SHIPPED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^/assets/.+\.m?js$").expect("valid pattern"));
static LOC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<loc>https://duguid\.com\.au([^<]*)</loc>").expect("valid pattern")
});

fn parse_base(base: Option<&str>) -> Result<Url, String> {
    base.and_then(|b| Url::parse(b).ok())
        .ok_or_else(|| "Invalid URL".to_owned())
}

/// Every script source on a page, resolved as a browser would fetch it, so
/// "/assets/../x.js" is read as "/x.js". An unparseable source comes back None.
pub fn script_sources(html: &str, page: &Url) -> Vec<Option<Url>> {
    let mut sources = Vec::new();
    for tag in SCRIPT_TAG.captures_iter(html) {
        for attribute in ATTRIBUTE.captures_iter(&tag[1]) {
            if attribute[1].to_lowercase() == "src" {
                let value = attribute
                    .get(2)
                    .or_else(|| attribute.get(3))
                    .or_else(|| attribute.get(4))
                    .map_or("", |m| m.as_str());
                sources.push(page.join(value).ok());
            }
        }
    }
    sources
}

/// A same-origin script the repository ships under assets/. Cloudflare's own /cdn-cgi/
/// scripts get no exemption: the site ships none of them.
fn allowed_script(url: Option<&Url>, base: &Url, source_root: &Path) -> bool {
    url.is_some_and(|url| {
        url.origin().ascii_serialization() == base.origin().ascii_serialization()
            && SHIPPED.is_match(url.path())
            && source_root.join(&url.path()[1..]).exists()
    })
}

pub fn sitemap_paths(xml: &str) -> Vec<String> {
    LOC.captures_iter(xml).map(|c| c[1].to_owned()).collect()
}

/// The number of `<script ...>` tags without a `src=` attribute, other than JSON-LD
/// blocks: `/<script(?![^>]*\bsrc=)([^>]*)>/g`.
fn inline_scripts(html: &str) -> usize {
    let word = |c: u8| c.is_ascii_alphanumeric() || c == b'_';
    let bytes = html.as_bytes();
    let mut count = 0;
    let mut from = 0;
    while let Some(found) = html[from..].find("<script") {
        let start = from + found;
        let attributes = start + "<script".len();
        let Some(end) = html[attributes..].find('>').map(|i| attributes + i) else {
            break;
        };
        let names_source = html[attributes..end]
            .match_indices("src=")
            .any(|(i, _)| !word(bytes[attributes + i - 1]));
        if names_source {
            from = start + 1;
            continue;
        }
        if !html[attributes..end].contains(r#"type="application/ld+json""#) {
            count += 1;
        }
        from = end + 1;
    }
    count
}

#[derive(Debug, Default, PartialEq)]
pub struct Findings {
    pub failures: Vec<String>,
    pub notes: Vec<String>,
}

/// The failures and notes for one page: `base` is the site the page was fetched from.
pub fn inspect_html(
    path: &str,
    source_html: &str,
    delivered_html: &str,
    source_root: &Path,
    base: Option<&str>,
) -> Result<Findings, String> {
    let mut findings = Findings::default();
    let mut mailtos: Vec<&str> = Vec::new();
    for capture in MAILTO.captures_iter(source_html) {
        let href = capture.get(1).expect("group").as_str();
        if !mailtos.contains(&href) {
            mailtos.push(href);
        }
    }
    for href in mailtos {
        if !delivered_html.contains(&format!(r#"href="{href}""#)) {
            findings.failures.push(format!(
                "{path}: a mailto link is not delivered intact (missing or obfuscated)"
            ));
        }
    }
    let inline = inline_scripts(delivered_html);
    if inline > 0 {
        findings.notes.push(format!(
            "{path}: {inline} inline script(s) injected on delivery; the page CSP blocks them"
        ));
    }
    if delivered_html.contains("cloudflareinsights.com/beacon") {
        findings.failures.push(format!("{path}: Cloudflare analytics tag present; the Privacy page says no analytics script is delivered"));
    }
    if delivered_html.contains("rocket-loader.min.js") || RETYPED.is_match(delivered_html) {
        findings.failures.push(format!("{path}: Cloudflare Rocket Loader rewrites the page's scripts; switch it off under Speed, Optimization"));
    }
    let site = parse_base(base)?;
    let page = site.join(path).map_err(|_| "Invalid URL".to_owned())?;
    for url in script_sources(delivered_html, &page) {
        if !allowed_script(url.as_ref(), &site, source_root) {
            let shown = url.as_ref().map_or("an unparseable source", Url::as_str);
            findings.failures.push(format!(
                "{path}: delivers a script the site does not ship: {shown}"
            ));
        }
    }
    Ok(findings)
}

// Cloudflare's client-side resource monitoring adds a report-only policy to a sample of
// page loads. It blocks nothing, so it is a note, not a failure; the Privacy page
// describes it.
pub fn header_notes(path: &str, report_only: Option<&str>) -> Vec<String> {
    report_only
        .filter(|policy| !policy.is_empty())
        .map(|policy| vec![format!("{path}: report-only CSP delivered: {policy}")])
        .unwrap_or_default()
}

/// The required headers a response lacks or misstates; `get` reads one by name.
pub fn inspect_headers(path: &str, get: &dyn Fn(&str) -> Option<String>) -> Vec<String> {
    let quote = |text: &str| serde_json::Value::from(text).to_string();
    REQUIRED_HEADERS
        .iter()
        .filter_map(|(name, expected)| {
            let actual = get(name);
            (actual.as_deref() != Some(*expected)).then(|| {
                format!(
                    "{path}: header {name} is {}, expected {}",
                    actual.as_deref().map_or("missing".into(), quote),
                    quote(expected)
                )
            })
        })
        .collect()
}

/// Every sitemap page and its source HTML, each held to the delivery rules against
/// itself, so the tree being checked is known to be clean.
pub fn validate_source(
    source_root: &Path,
    base: Option<&str>,
) -> Result<Vec<(String, String)>, String> {
    let paths = sitemap_paths(&node::read(&source_root.join("sitemap.xml"))?);
    if !paths.iter().any(|p| p == "/") {
        return Err("Source sitemap has no home page".into());
    }
    let mut pages: Vec<(String, String)> = Vec::new();
    for path in paths {
        if !path.starts_with('/') || !path.ends_with('/') || path.contains("..") {
            return Err("Source sitemap has an invalid page path".into());
        }
        let mut file = source_root.to_path_buf();
        file.extend(path.split('/').filter(|part| !part.is_empty()));
        let html = node::read(&file.join("index.html"))?;
        let findings = inspect_html(&path, &html, &html, source_root, base)?;
        if !findings.failures.is_empty() {
            return Err(findings.failures.join("\n"));
        }
        match pages.iter_mut().find(|(p, _)| *p == path) {
            Some(page) => page.1 = html,
            None => pages.push((path, html)),
        }
    }
    Ok(pages)
}

struct Delivered {
    status: u16,
    response: ureq::http::Response<ureq::Body>,
}

impl Delivered {
    fn header(&self, name: &str) -> Option<String> {
        node::header(&self.response, name)
    }

    /// `response.text()`: UTF-8 without a leading byte order mark.
    fn text(mut self) -> Result<String, String> {
        let bytes = self
            .response
            .body_mut()
            .with_config()
            .limit(u64::MAX)
            .read_to_vec()
            .map_err(|e| node::fetch_failure(&e).0.to_owned())?;
        let text = String::from_utf8_lossy(&bytes);
        Ok(text.strip_prefix('\u{FEFF}').unwrap_or(&text).to_owned())
    }
}

fn fetch(agent: &ureq::Agent, url: &str) -> Result<Delivered, String> {
    let response = node::fetch(agent, url).map_err(|e| node::fetch_failure(&e).0.to_owned())?;
    Ok(Delivered {
        status: response.status().as_u16(),
        response,
    })
}

fn check(source_root: &Path, base: Option<&str>, source_only: bool) -> Result<u8, String> {
    let pages = validate_source(source_root, base)?;
    if source_only {
        node::log(
            &format!("source delivery tree verified ({} pages)", pages.len()),
            false,
        );
        return Ok(0);
    }
    let base_text = base.unwrap_or("undefined");
    // Each request is made once and its redirects are not followed, as fetch's
    // redirect: 'manual' does; one agent reuses its connections.
    let agent = node::fetch_agent(TIMEOUT, false, USER_AGENT, ACCEPT);
    let mut failures = Vec::new();
    let mut notes = Vec::new();
    for (path, source) in &pages {
        let response = fetch(&agent, &format!("{base_text}{path}"))?;
        if response.status != 200 {
            failures.push(format!("{path}: HTTP {}", response.status));
            continue;
        }
        failures.extend(inspect_headers(path, &|name| response.header(name)));
        notes.extend(header_notes(
            path,
            response
                .header("content-security-policy-report-only")
                .as_deref(),
        ));
        let delivered = response.text()?;
        let findings = inspect_html(path, source, &delivered, source_root, base)?;
        failures.extend(findings.failures);
        notes.extend(findings.notes);
    }
    for (from, to) in REDIRECTS {
        let response = fetch(&agent, &format!("{base_text}{from}"))?;
        let location = response.header("location");
        if response.status != 301 || location.as_deref() != Some(&format!("{base_text}{to}")) {
            let line = format!(
                "{from}: expected 301 to {to}, got HTTP {} {}",
                response.status,
                location.unwrap_or_default()
            );
            failures.push(node::trim(&line).to_owned());
        }
    }
    for path in EXPECTED_ABSENT {
        let response = fetch(&agent, &format!("{base_text}{path}"))?;
        if response.status != 404 {
            failures.push(format!(
                "{path}: expected HTTP 404, got {}; the Pages build published a page the site never made",
                response.status
            ));
        }
    }
    for note in &notes {
        node::log(&format!("note: {note}"), false);
    }
    for failure in &failures {
        node::log(failure, true);
    }
    if !failures.is_empty() {
        return Ok(1);
    }
    node::log(
        &format!("production delivery checks passed ({} notes)", notes.len()),
        false,
    );
    Ok(0)
}

/// `process.argv.indexOf(flag)`: None when absent, Some(None) when it is the last argument.
fn flag<'a>(args: &'a [String], name: &str) -> Option<Option<&'a str>> {
    let at = args.iter().position(|a| a == name)?;
    Some(args.get(at + 1).map(String::as_str))
}

pub fn run(args: &[String]) -> Result<u8, String> {
    let source_root = match flag(args, "--source-root") {
        Some(Some(directory)) => node::resolve(Path::new(directory)),
        Some(None) => {
            node::log(
                "The \"paths[0]\" argument must be of type string. Received undefined",
                true,
            );
            return Ok(1);
        }
        None => crate::root()?,
    };
    let base = flag(args, "--base").unwrap_or(Some("https://duguid.com.au"));
    let source_only = args.iter().any(|a| a == "--source-only");
    match check(&source_root, base, source_only) {
        Ok(code) => Ok(code),
        Err(message) => {
            node::log(&message, true);
            Ok(1)
        }
    }
}
