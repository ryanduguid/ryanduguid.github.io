//! scripts/visibility_benchmark.py: validate and summarise assistant-visibility captures.
//!
//! Visibility (did an assistant mention or cite the site) and accuracy (were its facts
//! right) are reported apart. Unrun and blocked observations leave every denominator,
//! fixtures are excluded from real summaries, and every mode validates the files it was
//! given before anything is counted.
use crate::py::{self, PyPath};
use crate::pyformat::py_str;
use crate::pyjson::{self, Dump, Json};
use crate::pyobj::type_name;
use std::path::{Path, PathBuf};

const SITE_HOST: &str = "duguid.com.au";
const RUN_STATES: [&str; 3] = ["blocked", "complete", "not_run"];
const SEARCH_STATES: [&str; 3] = ["off", "on", "unknown"];
const REQUIRED_TEXT: [&str; 4] = ["system", "model_reported", "timezone", "answer_evidence"];
const REQUIRED_BOOLEANS: [&str; 3] = ["fresh_session", "mentioned", "site_cited"];
const USAGE: &str = "usage: visibility_benchmark.py [-h] [--template | --check [CAPTURE ...] |\n                               --summary [CAPTURE ...]] [--include-fixtures]\n";
const HELP: &str = include_str!("help/visibility_benchmark.txt");

type Result<T> = std::result::Result<T, String>;

/// The reviewed prompts, keyed by id in file order.
pub type Prompts = Vec<(String, Json)>;

fn prompt<'a>(prompts: &'a Prompts, id: &str) -> Option<&'a Json> {
    prompts.iter().find(|(k, _)| k == id).map(|(_, v)| v)
}

fn item<'a>(value: &'a Json, key: &str) -> Result<&'a Json> {
    match value {
        Json::Object(_) => value
            .get(key)
            .ok_or_else(|| format!("KeyError: {}", py::repr_str(key))),
        other => Err(format!(
            "TypeError: '{}' object is not subscriptable",
            type_name(other)
        )),
    }
}

pub fn prompts_path(root: &Path) -> PathBuf {
    py::resolve(root)
        .join("docs")
        .join("visibility-benchmark")
        .join("prompts.json")
}

fn captures_dir(root: &Path) -> PathBuf {
    py::resolve(root)
        .join("docs")
        .join("visibility-benchmark")
        .join("captures")
}

/// The reviewed prompt set, keyed by its stable identifier.
pub fn load_prompts(root: &Path) -> Result<Prompts> {
    let data = pyjson::loads(&crate::read(&prompts_path(root))?)
        .map_err(|e| format!("json.decoder.JSONDecodeError: {e}"))?;
    let mut prompts: Prompts = Vec::new();
    for entry in crate::pyobj::iterate(item(&data, "prompts")?)? {
        let id = match item(&entry, "id")? {
            Json::Str(id) => id.clone(),
            other => {
                return Err(format!(
                    "TypeError: prompt id {} is not a string",
                    other.repr()
                ));
            }
        };
        match prompts.iter_mut().find(|(k, _)| *k == id) {
            Some(slot) => slot.1 = entry,
            None => prompts.push((id, entry)),
        }
    }
    Ok(prompts)
}

/// Identify the exact prompts, sourced facts and errors used for a round.
pub fn answer_key_sha256(prompts: &Prompts) -> String {
    let value = Json::Object(prompts.clone());
    let text = pyjson::dumps(
        &value,
        Dump {
            sort_keys: true,
            ensure_ascii: false,
            ..Dump::default()
        },
    );
    crate::sha256(text.as_bytes())
}

/// Read one capture, or the ValueError text describing what is unusable; an OSError is
/// returned as its own text too, as the callers treat both alike.
pub fn load_capture(path: &Path) -> std::result::Result<Json, String> {
    let bytes = std::fs::read(path)
        .map_err(|e| py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Errno))?;
    let text = py::decode_utf8(&bytes)
        .map(|t| py::universal_newlines(&t))
        .map_err(|e| format!("is not UTF-8 text: {e}"))?;
    let capture = pyjson::loads(&text).map_err(|e| format!("is not valid JSON: {e}"))?;
    if !matches!(capture, Json::Object(_)) {
        return Err(format!("is a {}, expected an object", type_name(&capture)));
    }
    Ok(capture)
}

fn is_text(value: Option<&Json>) -> bool {
    matches!(value, Some(Json::Str(s)) if !py::strip(s).is_empty())
}

fn repr(value: Option<&Json>) -> String {
    value.map_or("None".into(), Json::repr)
}

fn type_of(value: Option<&Json>) -> &'static str {
    value.map_or("NoneType", type_name)
}

fn sorted_repr(members: &[&str]) -> String {
    format!(
        "[{}]",
        members
            .iter()
            .map(|m| py::repr_str(m))
            .collect::<Vec<_>>()
            .join(", ")
    )
}

/// `SplitResult.port` validation: digits only and within 0 to 65535.
fn port_ok(netloc: &str) -> bool {
    let hostinfo = netloc.rsplit_once('@').map_or(netloc, |(_, h)| h);
    let port = match hostinfo.split_once('[') {
        Some((_, bracketed)) => bracketed
            .split_once(']')
            .map_or("", |(_, rest)| rest.split_once(':').map_or("", |(_, p)| p)),
        None => hostinfo.split_once(':').map_or("", |(_, p)| p),
    };
    if port.is_empty() {
        return true;
    }
    port.bytes().all(|b| b.is_ascii_digit()) && port.parse::<u64>().is_ok_and(|p| p <= 65535)
}

/// One usable http or https URL's host, or None when the value cannot be one.
fn usable_host(url: Option<&Json>) -> Option<String> {
    let Some(Json::Str(url)) = url.filter(|u| is_text(Some(u))) else {
        return None;
    };
    let split = crate::pyurl::urlsplit(url).ok()?;
    if !port_ok(&split.netloc) {
        return None;
    }
    if !matches!(split.scheme.to_lowercase().as_str(), "http" | "https") {
        return None;
    }
    crate::pyurl::hostname(&split.netloc).filter(|h| !h.is_empty())
}

/// True only when a usable URL's host is the site or one of its subdomains.
pub fn site_cited_url(url: Option<&Json>) -> bool {
    usable_host(url).is_some_and(|host| {
        let host = host.to_lowercase();
        host == SITE_HOST || host.ends_with(&format!(".{SITE_HOST}"))
    })
}

fn check_citations(at: &str, observation: &Json) -> Vec<String> {
    let mut failures = Vec::new();
    let Some(Json::Array(cited)) = observation.get("cited_urls") else {
        return vec![format!(
            "{at}: cited_urls must be a list, empty when none were shown"
        )];
    };
    let mut on_site = false;
    for (position, url) in cited.iter().enumerate() {
        if usable_host(Some(url)).is_none() {
            failures.push(format!(
                "{at}: cited_urls[{}] is not a usable http or https URL: {}",
                position + 1,
                url.repr()
            ));
            continue;
        }
        on_site = on_site || site_cited_url(Some(url));
    }
    let site_cited = observation.get("site_cited");
    if matches!(site_cited, Some(Json::Bool(true))) && !on_site {
        failures.push(format!(
            "{at}: site_cited is true but no cited URL is on {SITE_HOST}"
        ));
    }
    if matches!(site_cited, Some(Json::Bool(false))) && on_site {
        failures.push(format!(
            "{at}: a cited URL is on {SITE_HOST} but site_cited is false"
        ));
    }
    if matches!(site_cited, Some(Json::Bool(true)))
        && !matches!(observation.get("mentioned"), Some(Json::Bool(true)))
    {
        failures.push(format!(
            "{at}: an answer that cites the site also mentions it"
        ));
    }
    failures
}

fn known_error_ids(prompt: &Json) -> Result<Vec<Json>> {
    let errors = match prompt.get("common_errors") {
        Some(value) => crate::pyobj::iterate(value)?,
        None => Vec::new(),
    };
    let mut ids = Vec::new();
    for error in &errors {
        let id = item(error, "id")?;
        crate::pyobj::hashable(id)?;
        ids.push(id.clone());
    }
    Ok(ids)
}

fn check_observation(
    label: &str,
    index: usize,
    observation: &Json,
    prompts: &Prompts,
) -> Result<Vec<String>> {
    let at = format!("{label} observation {index}");
    if !matches!(observation, Json::Object(_)) {
        return Ok(vec![format!(
            "{at}: must be an object, found {}",
            type_name(observation)
        )]);
    }
    let get = |key: &str| observation.get(key);
    let mut failures = Vec::new();
    let prompt_id = match get("prompt_id") {
        Some(Json::Str(id)) => id,
        other => {
            return Ok(vec![format!(
                "{at}: prompt_id must be a string, found {}",
                type_of(other)
            )]);
        }
    };
    let Some(prompt) = self::prompt(prompts, prompt_id) else {
        return Ok(vec![format!(
            "{at}: unknown prompt_id {}",
            py::repr_str(prompt_id)
        )]);
    };
    let status = match get("status") {
        Some(Json::Str(s)) if RUN_STATES.contains(&s.as_str()) => s.as_str(),
        other => {
            return Ok(vec![format!(
                "{at}: status must be one of {}, found {}",
                sorted_repr(&RUN_STATES),
                repr(other)
            )]);
        }
    };
    if status != "complete" {
        // A test that did not run carries no result. It needs a reason, not data.
        if !is_text(get("reason")) {
            failures.push(format!("{at}: a {status} observation needs a reason"));
        }
        return Ok(failures);
    }
    for field in REQUIRED_TEXT {
        if !is_text(get(field)) {
            failures.push(format!(
                "{at}: complete observation needs a non-empty {field}"
            ));
        }
    }
    for field in REQUIRED_BOOLEANS {
        if !matches!(get(field), Some(Json::Bool(_))) {
            failures.push(format!(
                "{at}: {field} must be true or false, not {}",
                repr(get(field))
            ));
        }
    }
    let reviewed = item(prompt, "prompt")?;
    if !get("prompt_sent").is_some_and(|sent| sent.py_eq(reviewed)) {
        failures.push(format!(
            "{at}: prompt_sent does not match the reviewed text for {prompt_id}"
        ));
    }
    if !matches!(get("search_enabled"), Some(Json::Str(s)) if SEARCH_STATES.contains(&s.as_str())) {
        failures.push(format!(
            "{at}: search_enabled must be one of {}, found {}",
            sorted_repr(&SEARCH_STATES),
            repr(get("search_enabled"))
        ));
    }
    match get("executed_at") {
        Some(Json::Str(executed)) if !py::strip(executed).is_empty() => {
            match crate::pytime::datetime_fromisoformat(executed) {
                None => failures.push(format!("{at}: executed_at must be an ISO 8601 timestamp")),
                Some(parsed) if parsed.offset_micros.is_none() => {
                    failures.push(format!("{at}: executed_at must carry a UTC offset"))
                }
                Some(_) => {}
            }
        }
        _ => failures.push(format!(
            "{at}: executed_at must be an ISO 8601 timestamp string"
        )),
    }
    failures.extend(check_citations(&at, observation));
    match get("factual_errors") {
        Some(Json::Array(errors)) => {
            let declared = known_error_ids(prompt)?;
            for error in errors {
                match error {
                    Json::Str(id) => {
                        if !declared.iter().any(|d| d.py_eq(error)) {
                            failures.push(format!(
                                "{at}: factual error {} is not declared for {prompt_id}",
                                py::repr_str(id)
                            ));
                        }
                    }
                    other => failures.push(format!(
                        "{at}: factual_errors members must be strings, found {}",
                        type_name(other)
                    )),
                }
            }
        }
        _ => failures.push(format!(
            "{at}: factual_errors must be a list, empty when none were found"
        )),
    }
    Ok(failures)
}

/// Every system named by the observations in one capture, sorted.
fn named_systems(capture: &Json) -> Result<Vec<String>> {
    let observations = match capture.get("observations") {
        Some(value) => crate::pyobj::iterate(value)?,
        None => Vec::new(),
    };
    let mut systems: Vec<String> = observations
        .iter()
        .filter(|o| matches!(o, Json::Object(_)) && is_text(o.get("system")))
        .map(|o| o.get("system").map(Json::py_str).unwrap_or_default())
        .collect();
    systems.sort();
    systems.dedup();
    Ok(systems)
}

/// One loaded capture's shape and every observation in it.
pub fn check_capture_data(label: &str, capture: &Json, prompts: &Prompts) -> Result<Vec<String>> {
    let mut failures = Vec::new();
    let get = |key: &str| capture.get(key);
    // A boolean is an int in Python, so True must not pass as schema 1.
    if !matches!(get("schema"), Some(Json::Int(i)) if *i == 1.into()) {
        failures.push(format!("{label}: schema must be one of [1]"));
    }
    if !matches!(get("fixture"), Some(Json::Bool(_))) {
        failures.push(format!("{label}: must declare fixture true or false"));
    }
    if !is_text(get("recorded_by")) {
        failures.push(format!("{label}: must name who recorded it"));
    }
    if matches!(get("fixture"), Some(Json::Bool(false)))
        && !get("answer_key_sha256")
            .is_some_and(|k| k.py_eq(&Json::Str(answer_key_sha256(prompts))))
    {
        failures.push(format!(
            "{label}: answer_key_sha256 does not match the reviewed prompts; use the retained answer key and repository revision for this round"
        ));
    }
    let observations = match get("observations") {
        Some(Json::Array(list)) if !list.is_empty() => list,
        _ => {
            failures.push(format!("{label}: needs a non-empty observations list"));
            return Ok(failures);
        }
    };
    for (index, observation) in observations.iter().enumerate() {
        failures.extend(check_observation(label, index + 1, observation, prompts)?);
    }
    // One file is one system per round.
    let systems = named_systems(capture)?;
    if systems.len() > 1 {
        failures.push(format!(
            "{label}: one capture records one system per round, found {}",
            Json::Array(systems.into_iter().map(Json::Str).collect()).repr()
        ));
    }
    Ok(failures)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Load and check one capture file, reporting rather than raising.
pub fn check_capture(path: &Path, prompts: &Prompts) -> Result<Vec<String>> {
    match load_capture(path) {
        Ok(capture) => check_capture_data(&file_name(path), &capture, prompts),
        Err(error) => Ok(vec![format!("{}: {error}", file_name(path))]),
    }
}

/// A capture path as the command line named it, with Python's rendering of it.
pub struct Named {
    pub shown: String,
    pub path: PathBuf,
}

fn selected(root: &Path, names: &[String]) -> Vec<Named> {
    if !names.is_empty() {
        return names
            .iter()
            .map(|name| {
                let shown = PyPath::new(name);
                Named {
                    shown: shown.display(),
                    path: shown.fs(),
                }
            })
            .collect();
    }
    let dir = captures_dir(root);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| crate::glob_suffix(&e.file_name().to_string_lossy(), ".json"))
        .map(|e| e.path())
        .collect();
    crate::sort_paths(&mut paths);
    paths
        .into_iter()
        .map(|path| Named {
            shown: path.to_string_lossy().into_owned(),
            path,
        })
        .collect()
}

/// Load and validate every selected file before anything is counted.
pub fn validated(paths: &[Named], prompts: &Prompts) -> Result<(Vec<Json>, Vec<String>)> {
    let mut captures = Vec::new();
    let mut failures = Vec::new();
    for named in paths {
        if !named.path.is_file() {
            failures.push(format!("{}: no such capture file", named.shown));
            continue;
        }
        let capture = match load_capture(&named.path) {
            Ok(capture) => capture,
            Err(error) => {
                failures.push(format!("{}: {error}", file_name(&named.path)));
                continue;
            }
        };
        let problems = check_capture_data(&file_name(&named.path), &capture, prompts)?;
        if problems.is_empty() {
            captures.push(capture);
        } else {
            failures.extend(problems);
        }
    }
    Ok((captures, failures))
}

#[derive(Default, Clone)]
struct Bucket {
    complete: usize,
    mentioned: usize,
    cited: usize,
    clean: usize,
    excluded: usize,
    not_fresh: usize,
}

/// Report visibility and accuracy separately, with explicit denominators.
pub fn summarise(captures: &[Json], prompts: &Prompts, include_fixtures: bool) -> Result<String> {
    let mut counts: Vec<((String, bool, String), Bucket)> = Vec::new();
    let mut fixtures_skipped = 0;
    for capture in captures {
        if matches!(capture.get("fixture"), Some(Json::Bool(true))) && !include_fixtures {
            fixtures_skipped += 1;
            continue;
        }
        let named = named_systems(capture)?;
        let recorded = (named.len() == 1).then(|| named[0].clone());
        let observations = match capture.get("observations") {
            Some(value) => crate::pyobj::iterate(value)?,
            None => Vec::new(),
        };
        for observation in &observations {
            let id = match observation.get("prompt_id") {
                Some(Json::Str(id)) => id.as_str(),
                _ => "",
            };
            let Some(prompt) = self::prompt(prompts, id) else {
                continue;
            };
            // An unrun observation belongs to its round's system.
            let system = match observation.get("system").filter(|s| s.truthy()) {
                Some(system) => py_str(system)?,
                None => recorded.clone().unwrap_or_else(|| "unknown".into()),
            };
            let search = match observation.get("search_enabled").filter(|s| s.truthy()) {
                Some(search) => py_str(search)?,
                None => "unknown".into(),
            };
            let key = (system, item(prompt, "branded")?.truthy(), search);
            let index = match counts.iter().position(|(k, _)| *k == key) {
                Some(i) => i,
                None => {
                    counts.push((key, Bucket::default()));
                    counts.len() - 1
                }
            };
            let bucket = &mut counts[index].1;
            if !matches!(observation.get("status"), Some(Json::Str(s)) if s == "complete") {
                bucket.excluded += 1;
                continue;
            }
            bucket.complete += 1;
            bucket.mentioned += usize::from(matches!(
                observation.get("mentioned"),
                Some(Json::Bool(true))
            ));
            bucket.cited += usize::from(matches!(
                observation.get("site_cited"),
                Some(Json::Bool(true))
            ));
            bucket.clean +=
                usize::from(!observation.get("factual_errors").is_some_and(Json::truthy));
            bucket.not_fresh += usize::from(!matches!(
                observation.get("fresh_session"),
                Some(Json::Bool(true))
            ));
        }
    }
    counts.sort_by(|a, b| a.0.cmp(&b.0));
    let mut lines = vec![
        "Assistant visibility and accuracy, by system and prompt group".to_owned(),
        String::new(),
    ];
    if counts.is_empty() {
        lines.push("No observations to summarise.".into());
    }
    for ((system, branded, search), bucket) in &counts {
        let group = if *branded { "branded" } else { "non-branded" };
        let total = bucket.complete;
        lines.push(format!("{system}, {group} prompts, search {search}"));
        if total == 0 {
            lines.push(format!(
                "  no completed observations ({} excluded)",
                bucket.excluded
            ));
            continue;
        }
        lines.push(format!(
            "  mentions:   {}/{total} completed answers",
            bucket.mentioned
        ));
        lines.push(format!(
            "  citations:  {}/{total} completed answers",
            bucket.cited
        ));
        lines.push(format!(
            "  no declared factual error: {}/{total}",
            bucket.clean
        ));
        lines.push(format!(
            "  excluded (not run or blocked): {}",
            bucket.excluded
        ));
        if bucket.not_fresh > 0 {
            lines.push(format!(
                "  recorded without a fresh session: {}/{total}, not comparable with the rest",
                bucket.not_fresh
            ));
        }
    }
    if fixtures_skipped > 0 {
        lines.push(String::new());
        lines.push(format!(
            "Excluded {fixtures_skipped} fixture file(s) from these counts."
        ));
    }
    lines.extend(
        [
            "",
            "A mention is not a citation, and a citation is not a ranking. One",
            "response is one observation: repeat a prompt before reading a trend,",
            "and never compare a search result page with an assistant's answer.",
            "Answers composed with search off are reported separately, because an",
            "answer written without retrieval says nothing about page reachability.",
            "No declared factual error means no error from the recorded list was",
            "seen. It is not proof that an answer was correct.",
        ]
        .map(str::to_owned),
    );
    Ok(lines.join("\n"))
}

/// A blank capture file covering every reviewed prompt once.
pub fn template(prompts: &Prompts) -> Result<String> {
    let s = Json::str_obj;
    let mut observations = Vec::new();
    for (id, prompt) in prompts {
        observations.push(Json::Object(vec![
            ("prompt_id".into(), Json::Str(id.clone())),
            ("status".into(), s("not_run")),
            ("reason".into(), s("not attempted")),
            ("system".into(), Json::Null),
            ("model_reported".into(), Json::Null),
            ("search_enabled".into(), Json::Null),
            ("fresh_session".into(), Json::Null),
            ("executed_at".into(), Json::Null),
            ("timezone".into(), s("Australia/Melbourne")),
            ("prompt_sent".into(), item(prompt, "prompt")?.clone()),
            ("answer_evidence".into(), Json::Null),
            ("mentioned".into(), Json::Null),
            ("site_cited".into(), Json::Null),
            ("cited_urls".into(), Json::Array(Vec::new())),
            ("factual_errors".into(), Json::Array(Vec::new())),
            ("notes".into(), s("")),
        ]));
    }
    let capture = Json::Object(vec![
        ("schema".into(), Json::Int(1.into())),
        ("fixture".into(), Json::Bool(false)),
        (
            "answer_key_sha256".into(),
            Json::Str(answer_key_sha256(prompts)),
        ),
        ("recorded_by".into(), s("")),
        (
            "run_notes".into(),
            s("One file per system per round. Keep answer evidence beside it."),
        ),
        ("observations".into(), Json::Array(observations)),
    ]);
    Ok(pyjson::dumps(
        &capture,
        Dump {
            indent: Some(2),
            ..Dump::default()
        },
    ) + "\n")
}

enum Mode {
    Template,
    Check(Vec<String>),
    Summary(Vec<String>),
    Default,
}

struct Args {
    mode: Mode,
    include_fixtures: bool,
}

/// argparse for the exclusive `--template`, `--check [CAPTURE ...]` and
/// `--summary [CAPTURE ...]`, and `--include-fixtures`. `Err` is the exit code.
fn parse(args: &[String]) -> std::result::Result<Args, u8> {
    let options = ["--template", "--check", "--summary", "--include-fixtures"];
    let error = |message: &str| {
        let _ = crate::print_text(
            &format!("{USAGE}visibility_benchmark.py: error: {message}\n"),
            true,
        );
        Err(2)
    };
    let negative = |arg: &str| crate::pyre::fullmatch(r"-\d+|-\d*\.\d+", 0, arg);
    // argparse's _parse_optional: a known option (exactly, before `=`, or abbreviated)
    // is an option; otherwise a negative number or a string with a space is a value.
    let option_like = |arg: &str| {
        if !arg.starts_with('-') || arg == "-" {
            return false;
        }
        let known = |name: &str| {
            name == "-h" || std::iter::once("--help").chain(options).any(|o| o == name)
        };
        let head = arg.split_once('=').map_or(arg, |(head, _)| head);
        if known(arg) || known(head) {
            return true;
        }
        if head.starts_with("--")
            && head.len() > 2
            && std::iter::once("--help")
                .chain(options)
                .any(|o| o.starts_with(head))
        {
            return true;
        }
        !negative(arg) && !arg.contains(' ')
    };
    let mut parsed = Args {
        mode: Mode::Default,
        include_fixtures: false,
    };
    let mut seen_mode: Option<&str> = None;
    let mut unrecognized: Vec<&str> = Vec::new();
    let mut positional_only = false;
    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        i += 1;
        if positional_only || !option_like(arg) {
            unrecognized.push(arg);
            continue;
        }
        if arg == "--" {
            positional_only = true;
            unrecognized.push(arg);
            continue;
        }
        let (name, explicit) = match arg.split_once('=') {
            Some((name, value)) if arg.starts_with("--") => (name, Some(value.to_owned())),
            _ => (arg.as_str(), None),
        };
        let option = if name == "-h" {
            Some("--help")
        } else if name.len() > 2 && name.starts_with("--") {
            let all = std::iter::once("--help").chain(options);
            let exact = all.clone().find(|o| *o == name);
            let found: Vec<&str> = all.filter(|o| o.starts_with(name)).collect();
            match (exact, found.as_slice()) {
                (Some(exact), _) => Some(exact),
                (None, [one]) => Some(*one),
                (None, []) => None,
                (None, many) => {
                    return error(&format!(
                        "ambiguous option: {name} could match {}",
                        many.join(", ")
                    ));
                }
            }
        } else {
            None
        };
        let Some(option) = option else {
            unrecognized.push(arg);
            continue;
        };
        let display = if option == "--help" {
            "-h/--help"
        } else {
            option
        };
        let takes_values = matches!(option, "--check" | "--summary");
        if let Some(value) = &explicit
            && !takes_values
        {
            return error(&format!(
                "argument {display}: ignored explicit argument {}",
                py::repr_str(value)
            ));
        }
        if option == "--help" {
            let _ = crate::print_text(HELP, false);
            return Err(0);
        }
        if option != "--include-fixtures" {
            if let Some(other) = seen_mode.filter(|m| *m != option) {
                return error(&format!(
                    "argument {option}: not allowed with argument {other}"
                ));
            }
            seen_mode = Some(option);
        }
        match option {
            "--include-fixtures" => parsed.include_fixtures = true,
            "--template" => parsed.mode = Mode::Template,
            _ => {
                let mut values = Vec::new();
                match explicit {
                    Some(value) => values.push(value),
                    None => {
                        while i < args.len() && !option_like(&args[i]) {
                            values.push(args[i].clone());
                            i += 1;
                        }
                    }
                }
                parsed.mode = if option == "--check" {
                    Mode::Check(values)
                } else {
                    Mode::Summary(values)
                };
            }
        }
    }
    if !unrecognized.is_empty() {
        return error(&format!(
            "unrecognized arguments: {}",
            unrecognized.join(" ")
        ));
    }
    Ok(parsed)
}

pub fn run(root: &Path, args: &[String]) -> Result<u8> {
    let parsed = match parse(args) {
        Ok(parsed) => parsed,
        Err(code) => return Ok(code),
    };
    let say = |text: &str| crate::print_text(text, false).map_err(|e| e.to_string());
    let prompts = load_prompts(root)?;
    let names = match &parsed.mode {
        Mode::Template => {
            say(&template(&prompts)?)?;
            return Ok(0);
        }
        Mode::Check(names) | Mode::Summary(names) => names.clone(),
        Mode::Default => Vec::new(),
    };
    let (captures, failures) = validated(&selected(root, &names), &prompts)?;
    if !failures.is_empty() {
        // A summary of partly invalid input would misreport the round.
        for failure in &failures {
            say(&format!("  FAIL {failure}\n"))?;
        }
        say(&format!(
            "{} benchmark capture failure(s)\n",
            failures.len()
        ))?;
        return Ok(1);
    }
    if let Mode::Summary(_) = parsed.mode {
        say(&format!(
            "{}\n",
            summarise(&captures, &prompts, parsed.include_fixtures)?
        ))?;
        return Ok(0);
    }
    say(&format!(
        "benchmark captures valid ({} file(s), {} prompts)\n",
        captures.len(),
        prompts.len()
    ))?;
    Ok(0)
}
