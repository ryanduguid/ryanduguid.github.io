//! scripts/release_record.py: check the site's release claims against one reviewed record.
//!
//! `scripts/release_record.json` states what a page can mean by a version: the release a
//! reader can download (`published`), the release a page describes (`documented`) and
//! the release a preserved evaluation reproduced (`evaluations`). The default run is
//! offline; `--verify-live` reports drift against the public sources and changes nothing.
//! The live probes take a [`Live`] source so tests can answer for the network.
use crate::py;
use crate::pyformat::py_str;
use crate::pyjson::{self, Json};
use crate::pyobj::type_name;
use crate::pyre::{I, S, re};
use crate::seo_core as core;
use std::path::{Path, PathBuf};
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(20);
const USER_AGENT: &str = "duguid-site-release-record/1 (+https://duguid.com.au)";
const GAP_MARKER: &str = "published release";
const UNPINNED_MARKERS: [&str; 3] = [
    "unpinned",
    "may reuse a cached",
    "does not guarantee the latest release",
];
pub const MISSING: &str = "no matching release";
const ABSENT_STATUSES: [u16; 2] = [404, 410];
pub const RELEASE_PAGE_SIZE: usize = 100;
const RELEASE_PAGES: usize = 10;
pub const FOUND: &str = "FOUND";
pub const INCONCLUSIVE: &str = "INCONCLUSIVE";
pub const ABSENT: &str = "ABSENT";
pub const CHANGED: &str = "CHANGED";
const REGISTRY_CLAIMS: [&str; 2] = ["active", "latest"];

type Result<T> = std::result::Result<T, String>;

/// One source's outcome: what was asked, the state it reached, and the detail.
#[derive(Debug, Clone, PartialEq)]
pub struct Probe {
    pub source: String,
    pub state: &'static str,
    pub detail: String,
}

fn found(source: &str, state: &'static str, detail: String) -> Probe {
    Probe {
        source: source.into(),
        state,
        detail,
    }
}

/// Why a live read stopped, with the Python exception it stands for.
#[derive(Debug, Clone, PartialEq)]
pub enum LiveError {
    /// An HTTP error status (urllib's HTTPError).
    Http(u16),
    /// Any other error caught as LIVE_ERRORS: the exception type and its text.
    Error(String, String),
    /// A source that answered clearly and disagrees with the record.
    Contradiction(String),
}

impl LiveError {
    fn value(message: &str) -> Self {
        LiveError::Error("ValueError".into(), message.into())
    }

    fn key(key: &str) -> Self {
        LiveError::Error("KeyError".into(), py::repr_str(key))
    }

    fn detail(&self) -> String {
        match self {
            LiveError::Http(code) => format!("HTTPError: HTTP Error {code}: {}", reason(*code)),
            LiveError::Error(kind, message) => format!("{kind}: {message}"),
            LiveError::Contradiction(message) => message.clone(),
        }
    }
}

fn reason(code: u16) -> &'static str {
    ureq::http::StatusCode::from_u16(code)
        .ok()
        .and_then(|s| s.canonical_reason())
        .unwrap_or("")
}

/// The public sources: a JSON document and raw bytes, as urlopen reads them.
pub trait Live {
    fn json(&mut self, url: &str) -> std::result::Result<Json, LiveError>;
    fn bytes(&mut self, url: &str) -> std::result::Result<Vec<u8>, LiveError>;
}

/// The network, through ureq.
pub struct Network;

fn get(url: &str, accept_json: bool) -> std::result::Result<Vec<u8>, LiveError> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(TIMEOUT))
        .user_agent(USER_AGENT)
        .build()
        .into();
    let mut request = agent.get(url);
    if accept_json {
        request = request.header("Accept", "application/json");
    }
    match request.call() {
        Ok(mut response) => response
            .body_mut()
            .with_config()
            .limit(u64::MAX)
            .read_to_vec()
            .map_err(|e| LiveError::Error("URLError".into(), format!("<urlopen error {e}>"))),
        Err(ureq::Error::StatusCode(code)) => Err(LiveError::Http(code)),
        Err(ureq::Error::Timeout(_)) => Err(LiveError::Error(
            "TimeoutError".into(),
            "The read operation timed out".into(),
        )),
        Err(e) => Err(LiveError::Error(
            "URLError".into(),
            format!("<urlopen error {e}>"),
        )),
    }
}

impl Live for Network {
    fn json(&mut self, url: &str) -> std::result::Result<Json, LiveError> {
        if let Some(message) = request_url_error(url) {
            return Err(LiveError::value(&message));
        }
        pyjson::loads_bytes(&get(url, true)?)
            .map_err(|e| LiveError::Error("JSONDecodeError".into(), e.to_string()))
    }

    fn bytes(&mut self, url: &str) -> std::result::Result<Vec<u8>, LiveError> {
        get(url, false)
    }
}

/// `urllib.request.Request(url)`'s own check: after unwrapping `<...>` and `URL:` and
/// dropping a fragment, the URL must start with a scheme.
fn request_url_error(url: &str) -> Option<String> {
    let mut unwrapped = py::strip(url);
    if unwrapped.len() >= 2 && unwrapped.starts_with('<') && unwrapped.ends_with('>') {
        unwrapped = py::strip(&unwrapped[1..unwrapped.len() - 1]);
    }
    if let Some(rest) = unwrapped.strip_prefix("URL:") {
        unwrapped = py::strip(rest);
    }
    let without_fragment = unwrapped
        .rsplit_once('#')
        .map_or(unwrapped, |(head, _)| head);
    match without_fragment.find(['/', ':']) {
        Some(i) if i > 0 && without_fragment[i..].starts_with(':') => None,
        _ => Some(format!("unknown url type: {}", py::repr_str(unwrapped))),
    }
}

pub fn record_path(root: &Path) -> PathBuf {
    py::resolve(root)
        .join("scripts")
        .join("release_record.json")
}

pub fn load(root: &Path) -> Result<Json> {
    pyjson::loads(&crate::read(&record_path(root))?)
        .map_err(|e| format!("json.decoder.JSONDecodeError: {e}"))
}

// ------------------------------------------------------------------ Python helpers

fn not_subscriptable(value: &Json) -> String {
    format!(
        "TypeError: '{}' object is not subscriptable",
        type_name(value)
    )
}

/// `value[key]` for a dict value; other kinds raise as Python would.
fn item<'a>(value: &'a Json, key: &str) -> Result<&'a Json> {
    match value {
        Json::Object(_) => value
            .get(key)
            .ok_or_else(|| format!("KeyError: {}", py::repr_str(key))),
        Json::Array(_) => Err("TypeError: list indices must be integers or slices, not str".into()),
        Json::Str(_) => Err("TypeError: string indices must be integers, not 'str'".into()),
        other => Err(not_subscriptable(other)),
    }
}

/// `value.get(key)` for a dict value.
fn get_key<'a>(value: &'a Json, key: &str) -> Result<Option<&'a Json>> {
    match value {
        Json::Object(_) => Ok(value.get(key)),
        other => Err(format!(
            "AttributeError: '{}' object has no attribute 'get'",
            type_name(other)
        )),
    }
}

fn text(value: &Json) -> Result<&str> {
    match value {
        Json::Str(s) => Ok(s),
        other => Err(format!("TypeError: must be str, not {}", type_name(other))),
    }
}

/// `key in value` for a dict, list or str.
fn contains(value: &Json, key: &str) -> Result<bool> {
    match value {
        Json::Object(_) => Ok(value.get(key).is_some()),
        Json::Array(items) => Ok(items.iter().any(|i| i.py_eq(&Json::str_obj(key)))),
        Json::Str(s) => Ok(s.contains(key)),
        other => Err(format!(
            "TypeError: argument of type '{}' is not iterable",
            type_name(other)
        )),
    }
}

fn dict_items(value: &Json) -> Result<&Vec<(String, Json)>> {
    match value {
        Json::Object(pairs) => Ok(pairs),
        other => Err(format!(
            "AttributeError: '{}' object has no attribute 'items'",
            type_name(other)
        )),
    }
}

fn iter_items(value: Option<&Json>) -> Result<Vec<Json>> {
    match value {
        None => Ok(Vec::new()),
        Some(v) => crate::pyobj::iterate(v),
    }
}

fn page_text(root: &Path, rel: &str) -> Result<(String, String)> {
    let html = crate::read(&root.join(rel))?;
    let visible = core::visible_text(&html);
    Ok((html, visible))
}

fn software_versions(html: &str, rel: &str, failures: &mut Vec<String>) -> Result<Vec<String>> {
    let mut versions = Vec::new();
    for block in core::json_ld_blocks(html, rel, failures) {
        for node in core::nodes(&block) {
            if let Some(version) = node.get("softwareVersion") {
                versions.push(py_str(version)?);
            }
        }
    }
    Ok(versions)
}

fn count(haystack: &str, needle: &str) -> usize {
    if needle.is_empty() {
        haystack.chars().count() + 1
    } else {
        haystack.matches(needle).count()
    }
}

fn check_component(root: &Path, name: &str, component: &Json) -> Result<Vec<String>> {
    let mut failures = Vec::new();
    let documented = get_key(component, "documented")?;
    let published = item(component, "published")?;
    let Some(documented) = documented.filter(|d| d.truthy()) else {
        return Ok(failures);
    };
    if !contains(documented, "page")? {
        return Ok(failures);
    }
    let rel = text(item(documented, "page")?)?;
    if !root.join(rel).is_file() {
        return Ok(vec![format!(
            "{rel}: missing page for the {name} release record"
        )]);
    }
    let (html, visible) = page_text(root, rel)?;
    if let Some(label) = get_key(documented, "visible_label")?.filter(|l| !matches!(l, Json::Null))
    {
        let label = text(label)?;
        let found = count(&visible, label);
        if found != 1 {
            failures.push(format!(
                "{rel}: expected exactly one visible {}, found {found}",
                py::repr_str(label)
            ));
        }
    }
    let published_version = item(published, "version")?;
    let documented_version = get_key(documented, "version")?.filter(|v| !matches!(v, Json::Null));
    if let Some(version) = documented_version
        && !version.py_eq(published_version)
    {
        // A documented release may lag, but the gap must be stated with both versions.
        let visible_html = core::visible_html(&html);
        let paragraphs = re(r"<p\b[^>]*>.*?</p>", S | I).findall(&visible_html);
        // Evaluated lazily, as Python's `and` chain is: a non-string version only
        // raises once a paragraph carries the marker.
        let mut named = false;
        for paragraph in &paragraphs {
            let t = core::visible_text(paragraph);
            if t.contains(GAP_MARKER)
                && t.contains(text(published_version)?)
                && t.contains(text(version)?)
            {
                named = true;
                break;
            }
        }
        if !named {
            failures.push(format!(
                "{rel}: documents {name} {} while {} is published, without naming the difference",
                py_str(version)?,
                py_str(published_version)?
            ));
        }
    }
    if let Some(declared) =
        get_key(documented, "software_version")?.filter(|d| !matches!(d, Json::Null))
    {
        let versions = software_versions(&html, rel, &mut failures)?;
        if !(versions.len() == 1 && Json::Str(versions[0].clone()).py_eq(declared)) {
            failures.push(format!(
                "{rel}: structured softwareVersion is {}, expected [{}]",
                Json::Array(versions.into_iter().map(Json::Str).collect()).repr(),
                declared.repr()
            ));
        }
    }
    // Every recorded URL must be an anchor a reader can see and follow.
    let visible_links = core::anchor_hrefs(&core::visible_html(&html));
    let release_url = item(published, "release_url")?;
    if !visible_links
        .iter()
        .any(|l| Json::Str(l.clone()).py_eq(release_url))
    {
        failures.push(format!("{rel}: does not link the published release record"));
    }
    for supporting in iter_items(get_key(documented, "supporting_files")?)? {
        let tag = py_str(item(documented, "tag")?)?;
        let expected = format!(
            "{}/blob/{tag}/{}",
            py_str(item(component, "repository")?)?,
            py_str(&supporting)?
        );
        if !visible_links.contains(&expected) {
            failures.push(format!(
                "{rel}: {} must be linked at {tag}, the release this page documents",
                py_str(&supporting)?
            ));
        }
    }
    // Validate the pins of the release the page documents, including older guides.
    let empty = Json::Object(Vec::new());
    let or_empty = |value: Option<&Json>| -> Json {
        value
            .filter(|v| v.truthy())
            .cloned()
            .unwrap_or_else(|| empty.clone())
    };
    let component_engines = or_empty(get_key(component, "pinned_engines")?);
    let mut engines = component_engines.clone();
    let lagging = documented_version.is_some_and(|v| !v.py_eq(published_version));
    if lagging {
        engines = or_empty(get_key(documented, "pinned_engines")?);
    }
    let mut union: Vec<String> = dict_items(&component_engines)
        .map_err(|_| "TypeError: unsupported operand type(s) for |".to_owned())?
        .iter()
        .map(|(k, _)| k.clone())
        .collect();
    for (k, _) in dict_items(&engines)
        .map_err(|_| "TypeError: unsupported operand type(s) for |".to_owned())?
    {
        if !union.contains(k) {
            union.push(k.clone());
        }
    }
    let release_named = match documented_version {
        Some(v) if v.truthy() => py_str(v)?,
        _ => py_str(published_version)?,
    };
    for engine in union {
        if !visible.contains(&engine) {
            continue;
        }
        let mut stated: Vec<String> = re(
            &format!(r"{}\s+(\d+\.\d+\.\d+)", crate::pyre::escape(&engine)),
            0,
        )
        .findall(&visible);
        stated.sort();
        stated.dedup();
        if stated.is_empty() {
            continue;
        }
        match engines.get(&engine) {
            None => failures.push(format!(
                "{rel}: missing engine pin for {engine} in documented release {release_named}"
            )),
            Some(pin) => {
                let pin_text = py_str(pin)?;
                if !(stated.len() == 1 && Json::Str(stated[0].clone()).py_eq(pin)) {
                    failures.push(format!(
                        "{rel}: names {engine} {} but {name} {release_named} pins {pin_text}",
                        Json::Array(stated.into_iter().map(Json::Str).collect()).repr()
                    ));
                }
            }
        }
    }
    let raw = core::raw_text(&html);
    for command in iter_items(get_key(component, "pinned_commands")?)? {
        if !raw.contains(text(&command)?) {
            failures.push(format!(
                "{rel}: pinned reproduction command is missing: {}",
                py_str(&command)?
            ));
        }
    }
    let mut tracked = false;
    for command in iter_items(get_key(component, "tracking_commands")?)? {
        if raw.contains(text(&command)?) {
            tracked = true;
            break;
        }
    }
    // An unpinned uvx command may reuse a cached environment or an installed tool.
    if tracked && !UNPINNED_MARKERS.iter().all(|m| visible.contains(m)) {
        failures.push(format!(
            "{rel}: unpinned adoption commands must say they are unpinned and that uvx may reuse a cached or installed version"
        ));
    }
    Ok(failures)
}

/// No page may present an unreleased default-branch version as downloadable.
fn check_unreleased(root: &Path, name: &str, component: &Json) -> Result<Vec<String>> {
    let Some(unreleased) = get_key(component, "unreleased_default_branch")?.filter(|u| u.truthy())
    else {
        return Ok(Vec::new());
    };
    let version = text(item(unreleased, "version")?)?;
    let repository = crate::pyre::escape(&py_str(item(component, "repository")?)?);
    let pattern = re(
        &format!(
            r#"href="{repository}/(?:releases/download|releases/tag)/v?{}[/"]"#,
            crate::pyre::escape(version)
        ),
        0,
    );
    let mut failures = Vec::new();
    for path in core::html_files(root) {
        if pattern.search(&crate::read(&path)?).is_some() {
            failures.push(format!(
                "{}: links {name} {version}, which is not published",
                core::rel(&path, root)
            ));
        }
    }
    Ok(failures)
}

/// Each preserved evaluation keeps its own historical release label.
fn check_evaluations(root: &Path, record: &Json) -> Result<Vec<String>> {
    let mut failures = Vec::new();
    for (rel, evaluation) in dict_items(item(record, "evaluations")?)? {
        if !root.join(rel).is_file() {
            failures.push(format!("{rel}: missing evaluation page"));
            continue;
        }
        let (_, visible) = page_text(root, rel)?;
        let label = get_key(evaluation, "label")?.filter(|l| l.truthy());
        let expected = match label {
            Some(label) => label,
            None => item(evaluation, "version")?,
        };
        if !visible.contains(text(expected)?) {
            failures.push(format!(
                "{rel}: preserved evaluation must keep release {} visible as {}",
                py_str(item(evaluation, "version")?)?,
                expected.repr()
            ));
        }
    }
    Ok(failures)
}

/// The record's registry lifecycle claims, or the ValueError text naming a bad one.
pub fn registry_claims(published: &Json) -> Result<std::result::Result<Vec<String>, String>> {
    let status = get_key(published, "registry_status")?;
    let text = match status {
        None => "",
        Some(Json::Str(s)) => s.as_str(),
        Some(other) => {
            return Ok(Err(format!(
                "registry_status must be a string, got {}",
                type_name(other)
            )));
        }
    };
    let mut claims: Vec<String> = text
        .split(',')
        .map(|part| py::strip(part).to_owned())
        .filter(|part| !part.is_empty())
        .collect();
    claims.sort();
    claims.dedup();
    let unknown: Vec<&String> = claims
        .iter()
        .filter(|c| !REGISTRY_CLAIMS.contains(&c.as_str()))
        .collect();
    if !unknown.is_empty() {
        return Ok(Err(format!(
            "registry_status claims {}; recognised claims are {}",
            unknown
                .iter()
                .map(|c| py::repr_str(c))
                .collect::<Vec<_>>()
                .join(", "),
            REGISTRY_CLAIMS.join(", ")
        )));
    }
    Ok(Ok(claims))
}

/// Every release claim the record covers.
pub fn check_record(root: &Path, record: &Json) -> Result<Vec<String>> {
    let mut failures = Vec::new();
    for (name, component) in dict_items(item(record, "components")?)? {
        if let Err(error) = registry_claims(item(component, "published")?)? {
            failures.push(format!("{name}: {error}"));
        }
        failures.extend(check_component(root, name, component)?);
        failures.extend(check_unreleased(root, name, component)?);
    }
    failures.extend(check_evaluations(root, record)?);
    Ok(failures)
}

// ------------------------------------------------------------------ live probes

type LiveResult<T> = std::result::Result<T, LiveError>;

fn live_item<'a>(value: &'a Json, key: &str) -> LiveResult<&'a Json> {
    match value {
        Json::Object(_) => value.get(key).ok_or_else(|| LiveError::key(key)),
        Json::Array(_) => Err(LiveError::Error(
            "TypeError".into(),
            "list indices must be integers or slices, not str".into(),
        )),
        Json::Str(_) => Err(LiveError::Error(
            "TypeError".into(),
            "string indices must be integers, not 'str'".into(),
        )),
        other => Err(LiveError::Error(
            "TypeError".into(),
            format!("'{}' object is not subscriptable", type_name(other)),
        )),
    }
}

fn live_str(value: &Json) -> LiveResult<String> {
    py_str(value).map_err(|e| LiveError::value(e.trim_start_matches("ValueError: ")))
}

/// A service response that is not an object is a changed contract, not a version.
fn mapping<'a>(value: &'a Json, place: &str) -> LiveResult<&'a Json> {
    match value {
        Json::Object(_) => Ok(value),
        other => Err(LiveError::value(&format!(
            "{place} returned {}, expected an object",
            type_name(other)
        ))),
    }
}

fn probe(source: &str, read: impl FnOnce() -> LiveResult<String>) -> Probe {
    match read() {
        Ok(detail) => found(source, FOUND, detail),
        Err(LiveError::Contradiction(message)) => found(source, CHANGED, message),
        Err(error) => found(source, INCONCLUSIVE, error.detail()),
    }
}

fn pypi_version(live: &mut dyn Live, published: &Json) -> LiveResult<String> {
    let url = live_str(live_item(published, "pypi_url")?)?;
    let name = url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_owned();
    let payload = live.json(&format!("https://pypi.org/pypi/{name}/json"))?;
    let payload = mapping(&payload, "PyPI")?;
    let info = mapping(live_item(payload, "info")?, "PyPI info")?;
    live_str(live_item(info, "version")?)
}

fn registry_version(live: &mut dyn Live, published: &Json) -> LiveResult<String> {
    let url = live_str(live_item(published, "registry_url")?)?;
    let payload = live.json(&url)?;
    let payload = mapping(&payload, "the MCP registry")?;
    let server = mapping(
        payload.get("server").unwrap_or(payload),
        "the MCP registry server record",
    )?;
    let version = match server.get("version") {
        Some(Json::Str(v)) if !v.is_empty() => v.clone(),
        _ => {
            return Err(LiveError::value(
                "the MCP registry server record carries no version string",
            ));
        }
    };
    let claimed = registry_claims(published)
        .map_err(|e| LiveError::Error("AttributeError".into(), e))?
        .map_err(|e| LiveError::value(&e))?;
    if !claimed.is_empty() {
        let official = match payload.get("_meta") {
            Some(meta @ Json::Object(_)) => meta
                .get("io.modelcontextprotocol.registry/official")
                .cloned()
                .unwrap_or(Json::Object(Vec::new())),
            _ => Json::Object(Vec::new()),
        };
        let official = if matches!(official, Json::Object(_)) {
            official
        } else {
            Json::Object(Vec::new())
        };
        if claimed.iter().any(|c| c == "active") {
            match official.get("status") {
                Some(Json::Str(status)) if !status.is_empty() => {
                    if status != "active" {
                        return Err(LiveError::Contradiction(format!(
                            "the registry reports status {}, record claims active",
                            py::repr_str(status)
                        )));
                    }
                }
                _ => {
                    return Err(LiveError::value(
                        "the registry record carries no lifecycle status to check",
                    ));
                }
            }
        }
        if claimed.iter().any(|c| c == "latest") {
            match official.get("isLatest") {
                Some(Json::Bool(true)) => {}
                Some(Json::Bool(false)) => {
                    return Err(LiveError::Contradiction(
                        "the registry no longer marks this version latest, record claims latest"
                            .into(),
                    ));
                }
                _ => {
                    return Err(LiveError::value(
                        "the registry record carries no isLatest flag to check",
                    ));
                }
            }
        }
    }
    Ok(version)
}

/// Every published tag under one prefix, and whether the listing was exhausted.
pub fn release_tags(
    live: &mut dyn Live,
    owner_repo: &str,
    prefix: &str,
) -> LiveResult<(Vec<String>, bool)> {
    let mut tags = Vec::new();
    let mut exhausted = false;
    for page in 1..=RELEASE_PAGES {
        let releases = live.json(&format!(
            "https://api.github.com/repos/{owner_repo}/releases?per_page={RELEASE_PAGE_SIZE}&page={page}"
        ))?;
        let Json::Array(releases) = releases else {
            return Err(LiveError::value(
                "the GitHub releases endpoint returned an object, expected a list",
            ));
        };
        for release in &releases {
            if !matches!(release, Json::Object(_))
                || release.get("draft").is_some_and(Json::truthy)
                || release.get("prerelease").is_some_and(Json::truthy)
            {
                continue;
            }
            let name = match release.get("tag_name") {
                Some(tag) => live_str(tag)?,
                None => String::new(),
            };
            if name.starts_with(prefix) {
                tags.push(live_str(live_item(release, "tag_name")?)?);
            }
        }
        // A short page is the last page.
        if releases.len() < RELEASE_PAGE_SIZE {
            exhausted = true;
            break;
        }
    }
    Ok((tags, exhausted))
}

fn version_key(version: &str) -> Vec<num_bigint::BigInt> {
    re(r"\d+", 0)
        .findall(version)
        .iter()
        .map(|digits| py::parse_int(digits, 10).unwrap_or_default())
        .collect()
}

/// The repository as owner/name and the recorded tag, as both GitHub probes read them.
fn release_parts(component: &Json) -> LiveResult<(String, String)> {
    let published = live_item(component, "published")?;
    let repository = live_str(live_item(component, "repository")?)?;
    let owner_repo = repository
        .strip_prefix("https://github.com/")
        .unwrap_or(&repository)
        .to_owned();
    let release_url = live_item(published, "release_url")?;
    let Json::Str(release_url) = release_url else {
        return Err(LiveError::Error(
            "AttributeError".into(),
            format!(
                "'{}' object has no attribute 'rsplit'",
                type_name(release_url)
            ),
        ));
    };
    let tag = release_url.rsplit("/tag/").next().unwrap_or("").to_owned();
    Ok((owner_repo, tag))
}

fn github_version(live: &mut dyn Live, component: &Json) -> LiveResult<String> {
    let (owner_repo, tag) = release_parts(component)?;
    let version = live_item(live_item(component, "published")?, "version")?;
    let Json::Str(version) = version else {
        return Err(LiveError::Error(
            "TypeError".into(),
            format!(
                "removesuffix() argument must be str, not {}",
                if matches!(version, Json::Null) {
                    "None"
                } else {
                    type_name(version)
                }
            ),
        ));
    };
    let prefix = tag
        .strip_suffix(version.as_str())
        .unwrap_or(&tag)
        .to_owned();
    let (tags, exhausted) = release_tags(live, &owner_repo, &prefix)?;
    if tags.is_empty() {
        if !exhausted {
            return Err(LiveError::value(&format!(
                "stopped after {RELEASE_PAGES} pages without reaching the end of the release listing, so no conclusion about this release is possible"
            )));
        }
        return Ok(MISSING.into());
    }
    let skip = prefix.chars().count();
    let rest = |name: &str| name.chars().skip(skip).collect::<String>();
    let mut best = &tags[0];
    for tag in &tags[1..] {
        if version_key(&rest(tag)) > version_key(&rest(best)) {
            best = tag;
        }
    }
    Ok(rest(best))
}

/// Whether the exact recorded tag still has a published release.
fn recorded_release_exists(live: &mut dyn Live, component: &Json) -> LiveResult<String> {
    let (owner_repo, tag) = release_parts(component)?;
    match live.json(&format!(
        "https://api.github.com/repos/{owner_repo}/releases/tags/{tag}"
    )) {
        Ok(_) => Ok(tag),
        Err(LiveError::Http(code)) if ABSENT_STATUSES.contains(&code) => Ok(MISSING.into()),
        Err(error) => Err(error),
    }
}

/// Probe every public source this component declares, each on its own.
pub fn live_versions(live: &mut dyn Live, component: &Json) -> Result<Vec<Probe>> {
    let published = item(component, "published")?;
    let mut probes = Vec::new();
    if get_key(published, "pypi_url")?.is_some_and(Json::truthy) {
        probes.push(probe("pypi", || pypi_version(live, published)));
    }
    if get_key(published, "registry_url")?.is_some_and(Json::truthy) {
        probes.push(probe("registry", || registry_version(live, published)));
    }
    probes.push(probe("github", || github_version(live, component)));
    probes.push(probe("github recorded tag", || {
        recorded_release_exists(live, component)
    }));
    Ok(probes)
}

/// Whether the recorded release asset is still served with its recorded bytes.
pub fn live_asset(live: &mut dyn Live, published: &Json) -> Result<Option<Probe>> {
    let Some(url) = get_key(published, "download_url")?.filter(|u| u.truthy()) else {
        return Ok(None);
    };
    let url = py_str(url)?;
    // The Request is built before the guarded read, so a malformed URL stops the run.
    if let Some(message) = request_url_error(&url) {
        return Err(format!("ValueError: {message}"));
    }
    let served = match live.bytes(&url) {
        Ok(served) => served,
        Err(LiveError::Http(code)) if ABSENT_STATUSES.contains(&code) => {
            return Ok(Some(found(
                "asset",
                ABSENT,
                format!("HTTP {code}, the recorded asset is not served"),
            )));
        }
        Err(LiveError::Http(code)) => {
            return Ok(Some(found("asset", INCONCLUSIVE, format!("HTTP {code}"))));
        }
        Err(error) => return Ok(Some(found("asset", INCONCLUSIVE, error.detail()))),
    };
    if let Some(recorded) = get_key(published, "asset_bytes")?.filter(|r| !matches!(r, Json::Null))
        && !Json::Int(served.len().into()).py_eq(recorded)
    {
        return Ok(Some(found(
            "asset",
            CHANGED,
            format!("{} bytes, record says {}", served.len(), py_str(recorded)?),
        )));
    }
    if let Some(digest) = get_key(published, "asset_sha256")?.filter(|d| !matches!(d, Json::Null))
        && !Json::Str(crate::sha256(&served)).py_eq(digest)
    {
        return Ok(Some(found(
            "asset",
            CHANGED,
            "SHA-256 differs from the record".into(),
        )));
    }
    Ok(Some(found(
        "asset",
        FOUND,
        format!("{} bytes at the recorded SHA-256", served.len()),
    )))
}

/// The version probes for one component, replaceable in tests.
pub type Versions<'a> = dyn FnMut(&mut dyn Live, &Json) -> Result<Vec<Probe>> + 'a;

/// Report what each public source says about each recorded release, line by line.
pub fn verify_live(
    record: &Json,
    live: &mut dyn Live,
    versions: &mut Versions,
    out: &mut dyn FnMut(&str) -> Result<()>,
) -> Result<()> {
    let mut drifted = false;
    for (name, component) in dict_items(item(record, "components")?)? {
        let recorded_value = item(item(component, "published")?, "version")?;
        let recorded = py_str(recorded_value)?;
        let mut probes = versions(live, component)?;
        if let Some(asset) = live_asset(live, item(component, "published")?)? {
            probes.push(asset);
        }
        for Probe {
            source,
            state,
            detail,
        } in probes
        {
            if state != FOUND {
                if state == ABSENT || state == CHANGED {
                    drifted = true;
                }
                out(&format!("{name}: {source} {state}, {detail}"))?;
                continue;
            }
            if source == "asset" {
                out(&format!("{name}: {source} matches, {detail}"))?;
                continue;
            }
            let matches = Json::Str(detail.clone()).py_eq(recorded_value)
                || (source == "github recorded tag" && detail != MISSING);
            if !matches {
                drifted = true;
            }
            let word = if matches { "matches" } else { "DRIFT" };
            out(&format!(
                "{name}: {source} reports {detail}, record says {recorded} ({word})"
            ))?;
        }
    }
    if drifted {
        out(
            "\nReview each drift, then update scripts/release_record.json and the pages it covers. A newer release alone does not change a preserved evaluation.",
        )?;
    }
    Ok(())
}

pub fn run(root: &Path, args: &[String]) -> Result<u8> {
    let say = |text: &str| crate::print_text(text, false).map_err(|e| e.to_string());
    let record = load(root)?;
    if args.iter().any(|a| a == "--verify-live") {
        let mut versions = |live: &mut dyn Live, component: &Json| live_versions(live, component);
        verify_live(&record, &mut Network, &mut versions, &mut |line| {
            say(&format!("{line}\n"))
        })?;
        return Ok(0);
    }
    let failures = check_record(&py::resolve(root), &record)?;
    for failure in &failures {
        say(&format!("  FAIL {failure}\n"))?;
    }
    if !failures.is_empty() {
        say(&format!("{} release-record failure(s)\n", failures.len()))?;
        return Ok(1);
    }
    say("release record matches the pages it covers\n")?;
    Ok(0)
}
