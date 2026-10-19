//! scripts/check_links.py: link and content checks for every HTML file in the site.
//!
//! Per file: own-repository links must resolve to that exact repository (a rename
//! redirect fails); same-origin links must resolve to a file on disk, fragments
//! included; other http(s) links must resolve, with bounded retries for transport
//! failures, HTTP 429 and 5xx; hrefs must not be empty; retired names and em or en dashes
//! must not appear; and no own-repository link may point at an archived repository.
//! Transport, clock and output are passed in so tests can answer for the network.
use crate::check_links_data::*;
use crate::htmlparser::{self, Event};
use crate::py;
use crate::pyjson::{self, Json};
use crate::pyobj::type_name;
use crate::pyre::{I, fullmatch, re};
use crate::pyurl::{self, Split};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const USER_AGENT: &str = "duguid-link-check/1.0";
pub const MAX_FETCH_ATTEMPTS: u32 = 5;
const MAX_RETRY_WAIT_SECONDS: f64 = 30.0;
const SELF_ORIGIN: &str = "https://duguid.com.au";
const GITHUB_API: &str = "https://api.github.com/repos/ryanduguid/";
const FRAGMENT_TARGET: &str = r#"\s(?:id|name)=(["'])([^"']+)\1"#;
const OWN_REPO: &str = r"^https://github\.com/ryanduguid/([A-Za-z0-9._-]+)";
const MARKDOWN_LINK: &str = r"\]\((https?://[^)\s]+)\)";
const USAGE: &str = include_str!("help/check_links.usage");

/// A failed request, rendered as urllib's exception text.
#[derive(Debug, Clone, PartialEq)]
pub enum NetError {
    /// HTTPError: the status, its reason phrase and any Retry-After header.
    Http {
        code: u16,
        reason: String,
        retry_after: Option<String>,
    },
    /// URLError with its reason.
    Url(String),
    /// TimeoutError with its message.
    Timeout(String),
    /// Any other exception, as `str(exc)`.
    Other(String),
}

impl std::fmt::Display for NetError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NetError::Http { code, reason, .. } => write!(f, "HTTP Error {code}: {reason}"),
            NetError::Url(reason) => write!(f, "<urlopen error {reason}>"),
            NetError::Timeout(message) | NetError::Other(message) => f.write_str(message),
        }
    }
}

/// A completed request: the status and the URL after redirects.
#[derive(Debug, Clone)]
pub struct Opened {
    pub status: u16,
    pub url: String,
    pub body: Vec<u8>,
}

/// `urlopen(Request(url, headers=...), timeout=30)`.
pub trait Opener {
    fn open(&mut self, url: &str, headers: &[(&str, String)]) -> Result<Opened, NetError>;
}

/// time.sleep and time.time.
pub trait Clock {
    fn sleep(&mut self, seconds: f64);
    fn now(&mut self) -> f64;
}

pub struct Network;

impl Opener for Network {
    fn open(&mut self, url: &str, headers: &[(&str, String)]) -> Result<Opened, NetError> {
        let scheme = pyurl::urlsplit(url).map(|s| s.scheme).unwrap_or_default();
        if scheme != "http" && scheme != "https" {
            return Err(NetError::Url(format!("unknown url type: {scheme}")));
        }
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(30)))
            .http_status_as_error(false)
            .build()
            .into();
        let mut request = agent.get(url);
        for (name, value) in headers {
            request = request.header(*name, value);
        }
        let mut response = request.call().map_err(|e| match e {
            ureq::Error::Timeout(_) => NetError::Timeout("timed out".into()),
            other => NetError::Url(other.to_string()),
        })?;
        let status = response.status().as_u16();
        let final_url = ureq::ResponseExt::get_uri(&response).to_string();
        if status >= 400 {
            let reason = response
                .status()
                .canonical_reason()
                .unwrap_or("")
                .to_owned();
            let retry_after = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned);
            return Err(NetError::Http {
                code: status,
                reason,
                retry_after,
            });
        }
        let body = response
            .body_mut()
            .with_config()
            .limit(u64::MAX)
            .read_to_vec()
            .map_err(|e| NetError::Url(e.to_string()))?;
        Ok(Opened {
            status,
            url: final_url,
            body,
        })
    }
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn sleep(&mut self, seconds: f64) {
        std::thread::sleep(Duration::from_secs_f64(seconds.max(0.0)));
    }

    fn now(&mut self) -> f64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0.0, |d| d.as_secs_f64())
    }
}

pub fn is_accepted_automation_denial(url: &str, status: u16) -> bool {
    (status == 403 && HTTP_403_AUTOMATION_DENIAL_URLS.contains(&url))
        || (status == 999 && LINKEDIN_AUTOMATION_DENIAL_URLS.contains(&url))
}

/// Map an own-repository file view to its exact public file endpoint.
pub fn github_blob_raw_url(url: &str) -> Option<String> {
    let parts = pyurl::urlsplit(url).ok()?;
    if parts.scheme != "https"
        || parts.netloc.to_lowercase() != "github.com"
        || !parts.query.is_empty()
    {
        return None;
    }
    let found = re(r"\A(?:/(ryanduguid/[A-Za-z0-9._-]+)/blob/(.+))\Z", I).search(&parts.path)?;
    let tail = found.get(2)?.as_str();
    let segments: Vec<&str> = tail.split('/').collect();
    if segments.len() < 2 || segments.iter().any(|s| matches!(*s, "" | "." | "..")) {
        return None;
    }
    Some(format!(
        "https://raw.githubusercontent.com/{}/{tail}",
        found.get(1)?.as_str()
    ))
}

/// The ryanduguid repository an href points at, lower-cased.
pub fn own_repository(href: &str) -> Option<String> {
    re(OWN_REPO, I)
        .search(href)
        .and_then(|m| m.get(1).map(|g| g.as_str().to_lowercase()))
}

/// Accept GitHub's file delivery hosts for a pinned release download only.
pub fn is_release_asset_redirect(href: &str, final_url: &str) -> bool {
    let Ok(destination) = pyurl::urlsplit(final_url) else {
        return false;
    };
    fullmatch(
        r"https://github\.com/ryanduguid/[^/]+/releases/download/[^/]+/[^/?#]+",
        0,
        href,
    ) && destination.scheme == "https"
        && matches!(
            destination.netloc.as_str(),
            "release-assets.githubusercontent.com" | "objects.githubusercontent.com"
        )
}

pub type Fetched = Result<(u16, String), NetError>;
pub type Verdict = Result<bool, String>;
/// A replacement for fetch_final_url or repository_is_archived, as tests patch them.
pub type Hook<'a, T> = Option<Box<dyn FnMut(&str) -> T + 'a>>;

/// One run's state: the transport, clock and output, and the caches Python keeps
/// (successful fetches by URL; archived verdicts or failures by repository).
pub struct Checker<'a> {
    pub root: PathBuf,
    pub opener: &'a mut dyn Opener,
    pub clock: &'a mut dyn Clock,
    pub out: &'a mut dyn FnMut(&str),
    /// GITHUB_ACTIONS is "true".
    pub actions: bool,
    /// GITHUB_TOKEN, sent only to the GitHub API.
    pub token: Option<String>,
    /// Replace fetch_final_url, as the Python tests patch it.
    pub fetch_hook: Hook<'a, Fetched>,
    /// Replace repository_is_archived, as the Python tests patch it.
    pub lookup_hook: Hook<'a, Verdict>,
    /// Pages allowed to cite named archived repositories (ARCHIVED_TARGET_ALLOWLIST).
    pub archived_allowlist: Vec<(String, Vec<String>)>,
    fetched: HashMap<String, (u16, String)>,
    verdicts: HashMap<String, Verdict>,
}

impl<'a> Checker<'a> {
    pub fn new(
        root: PathBuf,
        opener: &'a mut dyn Opener,
        clock: &'a mut dyn Clock,
        out: &'a mut dyn FnMut(&str),
    ) -> Self {
        Checker {
            root,
            opener,
            clock,
            out,
            actions: false,
            token: None,
            fetch_hook: None,
            lookup_hook: None,
            archived_allowlist: Vec::new(),
            fetched: HashMap::new(),
            verdicts: HashMap::new(),
        }
    }

    fn say(&mut self, line: &str) {
        (self.out)(line);
    }

    /// Bound accumulated sleeps; return the new total or the error to raise.
    fn retry_error(&mut self, error: NetError, attempt: u32, waited: f64) -> Result<f64, NetError> {
        let mut retry_after = String::new();
        if let NetError::Http {
            code,
            retry_after: header,
            ..
        } = &error
        {
            retry_after = py::strip(header.as_deref().unwrap_or("")).to_owned();
            if *code != 429 && !(500..600).contains(code) {
                return Err(error);
            }
        }
        if attempt == MAX_FETCH_ATTEMPTS {
            return Err(error);
        }
        let mut delay = f64::from(2u32.pow(attempt - 1));
        if fullmatch("[0-9]+", 0, &retry_after) {
            delay = retry_after.parse::<f64>().unwrap_or(f64::INFINITY);
        } else if !retry_after.is_empty()
            && let Some((at, _)) = crate::serve_site::parse_http_date(&retry_after)
        {
            delay = (at as f64 - self.clock.now()).max(0.0);
        }
        if waited + delay > MAX_RETRY_WAIT_SECONDS {
            return Err(error);
        }
        self.clock.sleep(delay);
        Ok(waited + delay)
    }

    /// `fetch_final_url`: the status and final URL, with retries and the GitHub file
    /// fallback; successful results are cached.
    pub fn fetch_final_url(&mut self, url: &str) -> Fetched {
        if let Some(hook) = self.fetch_hook.as_mut() {
            return hook(url);
        }
        if let Some(found) = self.fetched.get(url) {
            return Ok(found.clone());
        }
        let headers = [("User-Agent", USER_AGENT.to_owned())];
        let mut target = url.to_owned();
        let mut waited = 0.0;
        for attempt in 1..=MAX_FETCH_ATTEMPTS {
            match self.opener.open(&target, &headers) {
                Ok(response) => {
                    if target != url
                        && (!(200..300).contains(&response.status) || response.url != target)
                    {
                        return Err(NetError::Other(
                            "GitHub direct file did not resolve to the exact HTTPS target".into(),
                        ));
                    }
                    let result = (response.status, response.url);
                    self.fetched.insert(url.to_owned(), result.clone());
                    return Ok(result);
                }
                Err(error) => {
                    let server_error =
                        matches!(&error, NetError::Http { code, .. } if (500..600).contains(code));
                    let shown = error.to_string();
                    waited = self.retry_error(error, attempt, waited)?;
                    if server_error
                        && target == url
                        && let Some(direct) = github_blob_raw_url(url)
                    {
                        self.say(&format!("GitHub file fallback {url}: checking {direct}"));
                        target = direct;
                    }
                    self.say(&format!(
                        "retry {attempt}/{} {url}: {shown}",
                        MAX_FETCH_ATTEMPTS - 1
                    ));
                }
            }
        }
        unreachable!("the last attempt returns or raises")
    }

    /// Verify the canonical repository identity and read its archived flag.
    pub fn fetch_repository_archived(&mut self, name: &str) -> Verdict {
        let mut headers = vec![
            ("User-Agent", USER_AGENT.to_owned()),
            ("Accept", "application/vnd.github+json".to_owned()),
        ];
        if let Some(token) = self.token.clone().filter(|t| !t.is_empty()) {
            headers.push(("Authorization", format!("Bearer {token}")));
        }
        let url = format!("{GITHUB_API}{name}");
        let mut waited = 0.0;
        let mut payload = None;
        for attempt in 1..=MAX_FETCH_ATTEMPTS {
            match self.opener.open(&url, &headers) {
                Ok(response) => {
                    let text = py::decode_utf8(&response.body).map_err(|e| e.to_string())?;
                    payload = Some(pyjson::loads(&text).map_err(|e| e.to_string())?);
                    break;
                }
                Err(error) => {
                    let shown = error.to_string();
                    waited = self
                        .retry_error(error, attempt, waited)
                        .map_err(|e| e.to_string())?;
                    self.say(&format!(
                        "retry {attempt}/{} {name}: {shown}",
                        MAX_FETCH_ATTEMPTS - 1
                    ));
                }
            }
        }
        let payload = payload.expect("the loop returns, breaks or raises");
        if !matches!(payload, Json::Object(_)) {
            return Err(format!(
                "'{}' object has no attribute 'get'",
                type_name(&payload)
            ));
        }
        let Some(Json::Str(full_name)) = payload.get("full_name") else {
            return Err(format!(
                "GitHub API returned no canonical repository name for {name}"
            ));
        };
        if py::casefold(full_name) != py::casefold(&format!("ryanduguid/{name}")) {
            return Err(format!(
                "ryanduguid/{name} was renamed or transferred to {full_name}"
            ));
        }
        match payload.get("archived") {
            Some(Json::Bool(archived)) => Ok(*archived),
            _ => Err(format!("GitHub API returned no archived flag for {name}")),
        }
    }

    /// Cached verdict for ryanduguid/<name>; a cached failure fails again.
    pub fn repository_is_archived(&mut self, name: &str) -> Verdict {
        if let Some(hook) = self.lookup_hook.as_mut() {
            return hook(name);
        }
        if let Some(verdict) = self.verdicts.get(name) {
            return verdict.clone();
        }
        let verdict = self.fetch_repository_archived(name);
        self.verdicts.insert(name.to_owned(), verdict.clone());
        verdict
    }

    /// Repository identity and archived targets for links that already resolved.
    pub fn archived_target_failures(&mut self, rel: &str, hrefs: &[String]) -> Vec<String> {
        let allowed: Vec<String> = self
            .archived_allowlist
            .iter()
            .find(|(page, _)| page == rel)
            .map(|(_, names)| names.clone())
            .unwrap_or_default();
        let mut failures = Vec::new();
        for href in hrefs {
            let Some(name) = own_repository(href) else {
                continue;
            };
            match self.repository_is_archived(&name) {
                Err(error) => failures.push(format!(
                    "{rel}: {href} -> archived lookup failed: {error}"
                )),
                Ok(true) if !allowed.contains(&name) => failures.push(format!(
                    "{rel}: {href} -> ryanduguid/{name} is archived (repoint the link to the maintained repository)"
                )),
                Ok(_) => {}
            }
        }
        failures
    }

    fn rel_to_root(&self, path: &Path) -> String {
        path.strip_prefix(&self.root)
            .map(|p| {
                p.components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/")
            })
            .unwrap_or_else(|_| path.to_string_lossy().into_owned())
    }

    /// The file a same-origin URL's path must resolve to on disk.
    fn self_origin_target(&self, path: &str) -> PathBuf {
        if path.is_empty() || path == "/" {
            return self.root.join("index.html");
        }
        if path.ends_with('/') {
            return join(&self.root, path.trim_matches('/')).join("index.html");
        }
        join(&self.root, path.trim_start_matches('/'))
    }

    /// Resolve every link from one file and classify its own-repository targets.
    pub fn check_hrefs(
        &mut self,
        rel: &str,
        hrefs: &[String],
        offline: bool,
    ) -> Result<Vec<String>, String> {
        let mut failures = Vec::new();
        let mut seen: Vec<&str> = Vec::new();
        let mut skipped = 0;
        let mut resolved_own = Vec::new();
        for href in hrefs {
            if seen.contains(&href.as_str()) {
                continue;
            }
            if !(href.starts_with("http") || href.starts_with('/')) {
                continue;
            }
            seen.push(href);
            if self.actions && CI_MANUAL_URLS.contains(&href.as_str()) {
                self.say(&format!(
                    "manual verification {rel}: {href} (runner access unavailable; see CONTRIBUTING.md)"
                ));
                continue;
            }
            let parts = pyurl::urlsplit(href).map_err(|e| format!("ValueError: {e}"))?;
            if href.starts_with('/')
                || format!("{}://{}", parts.scheme, parts.netloc) == SELF_ORIGIN
            {
                let target = self.self_origin_target(&parts.path);
                let shown = self.rel_to_root(&target);
                if !target.is_file() {
                    failures.push(format!(
                        "{rel}: {href} -> no file at {shown} (same-origin link does not resolve on disk)"
                    ));
                } else if !parts.fragment.is_empty() && !fragment_exists(&target, &parts.fragment)?
                {
                    failures.push(format!(
                        "{rel}: {href} -> no element with id or name {} in {shown}",
                        py::repr_str(&parts.fragment)
                    ));
                } else {
                    self.say(&format!(
                        "ok {rel}: {href} -> {shown} (same-origin, checked on disk)"
                    ));
                }
                continue;
            }
            if offline {
                skipped += 1;
                continue;
            }
            let (status, final_url) = match self.fetch_final_url(href) {
                Ok(found) => found,
                Err(NetError::Http { code, .. }) => {
                    if is_accepted_automation_denial(href, code) {
                        self.say(&format!(
                            "accepted allow-listed failure {rel}: {href} -> HTTP {code} (exact allow-listed URL)"
                        ));
                    } else {
                        failures.push(format!("{rel}: {href} -> HTTP {code}"));
                    }
                    continue;
                }
                Err(error) => {
                    failures.push(format!("{rel}: {href} -> {error}"));
                    continue;
                }
            };
            if status >= 400 {
                failures.push(format!("{rel}: {href} -> HTTP {status}"));
                continue;
            }
            if let Some(name) = own_repository(href) {
                let final_name = own_repository(&final_url);
                let direct_file = github_blob_raw_url(href).as_deref() == Some(final_url.as_str())
                    && (200..300).contains(&status);
                if final_name.as_deref() != Some(name.as_str())
                    && !direct_file
                    && !is_release_asset_redirect(href, &final_url)
                {
                    // Signed download query strings do not belong in public check logs.
                    let destination = pyurl::urlsplit(&final_url)
                        .map(|split| {
                            pyurl::urlunsplit(&Split {
                                query: String::new(),
                                fragment: String::new(),
                                ..split
                            })
                        })
                        .unwrap_or(final_url.clone());
                    failures.push(format!(
                        "{rel}: {href} redirected to {destination} (rename redirect, repoint the link)"
                    ));
                    continue;
                }
                resolved_own.push(href.clone());
            }
            self.say(&format!("ok {rel}: {href}"));
        }
        failures.extend(self.archived_target_failures(rel, &resolved_own));
        self.say(&format!(
            "{rel}: {} links scanned, {skipped} external links skipped in offline mode",
            seen.len()
        ));
        Ok(failures)
    }

    /// Every check against one HTML file.
    pub fn check_file(&mut self, path: &Path, offline: bool) -> Result<Vec<String>, String> {
        let rel = self.rel_to_root(path);
        let html = crate::read(path)?;
        let mut hrefs = Vec::new();
        let mut empty = 0;
        for positioned in htmlparser::parse(&html, true) {
            if let Event::StartTag(_, attrs) | Event::StartEndTag(_, attrs) = positioned.event {
                for (name, value) in attrs {
                    if name == "href" || name == "src" {
                        match value {
                            Some(value) if !value.is_empty() => hrefs.push(value),
                            _ => empty += 1,
                        }
                    }
                }
            }
        }
        let mut failures = Vec::new();
        if empty > 0 {
            failures.push(format!("{rel}: {empty} empty href/src attribute(s)"));
        }
        for name in RETIRED_NAMES {
            if html.contains(name) {
                failures.push(format!("{rel}: retired repository name: {name}"));
            }
        }
        for (c, label) in [('\u{2014}', "em dash"), ('\u{2013}', "en dash")] {
            if html.contains(c) {
                failures.push(format!("{rel}: {label} present"));
            }
        }
        failures.extend(self.check_hrefs(&rel, &hrefs, offline)?);
        Ok(failures)
    }
}

fn join(root: &Path, rel: &str) -> PathBuf {
    // pathlib joins "/"-separated parts lexically, keeping "..".
    rel.split('/')
        .filter(|p| !p.is_empty() && *p != ".")
        .fold(root.to_path_buf(), |path, part| path.join(part))
}

/// True when an HTML target declares an element with that id or name; other targets
/// and Liquid-templated pages pass.
fn fragment_exists(target: &Path, fragment: &str) -> Result<bool, String> {
    let suffix = crate::suffix(target).to_lowercase();
    if suffix != ".html" && suffix != ".htm" {
        return Ok(true);
    }
    let text = crate::read(target)?;
    if re(FRAGMENT_TARGET, 0)
        .captures_iter(&text)
        .any(|m| m.get(2).is_some_and(|g| g.as_str() == fragment))
    {
        return Ok(true);
    }
    Ok(text.contains("{%") && text.contains("{{"))
}

/// Markdown link targets in llms.txt.
pub fn llms_hrefs(root: &Path) -> Result<Vec<String>, String> {
    Ok(re(MARKDOWN_LINK, 0).findall(&crate::read(&root.join("llms.txt"))?))
}

fn self_check(root: &Path, say: &mut dyn FnMut(&str)) -> Result<(), String> {
    let found = crate::seo_core::html_files(root);
    let names: Vec<String> = found
        .iter()
        .map(|p| crate::seo_core::rel(p, root))
        .collect();
    for required in ["index.html", "404.html"] {
        if !names.iter().any(|n| n == required) {
            let mut sorted = names.clone();
            sorted.sort();
            return Err(format!(
                "AssertionError: {required} not discovered, got {}",
                Json::Array(sorted.into_iter().map(Json::Str).collect()).repr()
            ));
        }
    }
    say(&format!(
        "self-check OK: {} HTML files discovered",
        found.len()
    ));
    Ok(())
}

pub fn run(root: &Path, args: &[String]) -> Result<u8, String> {
    let parser = crate::pyargs::Parser {
        prog: "site-tools check_links",
        usage: USAGE,
        help: include_str!("help/check_links.txt"),
        flags: &["--offline"],
        exclusive: &[],
        required: false,
    };
    let offline = match parser.parse(args) {
        crate::pyargs::Parsed::Flags(flags) => flags.contains(&"--offline"),
        crate::pyargs::Parsed::Exit(code) => return Ok(code),
    };
    let root = py::resolve(root);
    let mut say = |line: &str| {
        let _ = crate::print_text(&format!("{line}\n"), false);
    };
    self_check(&root, &mut say)?;
    let mut opener = Network;
    let mut clock = SystemClock;
    let mut checker = Checker::new(root.clone(), &mut opener, &mut clock, &mut say);
    checker.actions = std::env::var("GITHUB_ACTIONS").is_ok_and(|v| v == "true");
    checker.token = std::env::var("GITHUB_TOKEN").ok();
    let mut failures = Vec::new();
    for path in crate::seo_core::html_files(&root) {
        failures.extend(checker.check_file(&path, offline)?);
    }
    let llms = llms_hrefs(&root)?;
    failures.extend(checker.check_hrefs("llms.txt", &llms, offline)?);
    let mut text = String::new();
    if failures.is_empty() {
        text.push_str(if offline {
            "\noffline checks passed; external links were skipped\n"
        } else {
            "\nall clear\n"
        });
        crate::print_text(&text, false).map_err(|e| e.to_string())?;
        return Ok(0);
    }
    text.push_str(&format!("\n{} failure(s):\n", failures.len()));
    for failure in &failures {
        text.push_str(&format!("  FAIL {failure}\n"));
    }
    crate::print_text(&text, false).map_err(|e| e.to_string())?;
    Ok(1)
}
