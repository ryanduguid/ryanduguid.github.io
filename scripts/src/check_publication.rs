//! scripts/check_publication.py: require current main and successful external producers
//! before Pages publication.
use crate::py;
use crate::pyjson::{self, Json};
use crate::pyre::fullmatch;
use num_bigint::BigInt;
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub const AUDIT_WORKFLOW: &str = ".github/workflows/no-ai-attribution.yml";
pub const AUDIT_JOB: &str = "Attribution policy / Attribution policy runner";
const SHA: &str = "[0-9a-f]{40}";
const REPOSITORY: &str = "[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+";
const USAGE: &str = include_str!("help/check_publication.usage");
const HELP: &str = include_str!("help/check_publication.txt");

/// Why verification stopped: a ValueError whose text is safe to print, or an API,
/// process or JSON failure whose details may hold private response data.
#[derive(Debug, PartialEq)]
pub enum Refusal {
    Value(String),
    External,
}

type Result<T> = std::result::Result<T, Refusal>;

fn refuse<T>(message: &str) -> Result<T> {
    Err(Refusal::Value(message.into()))
}

fn int(value: Option<&Json>) -> Option<&BigInt> {
    match value {
        Some(Json::Int(i)) => Some(i),
        _ => None,
    }
}

fn text<'a>(value: &'a Json, key: &str) -> Option<&'a str> {
    match value.get(key) {
        Some(Json::Str(s)) => Some(s),
        _ => None,
    }
}

fn is(value: &Json, key: &str, expected: &str) -> bool {
    text(value, key) == Some(expected)
}

/// Every record of a paginated listing, refusing incomplete or inconsistent pages.
pub fn items(payload: &Json, key: &str) -> Result<Vec<Json>> {
    let Json::Array(pages) = payload else {
        return refuse("Unreadable API pagination");
    };
    if pages.is_empty() {
        return refuse("Unreadable API pagination");
    }
    let mut found = Vec::new();
    let mut total: Option<Option<Json>> = None;
    for page in pages {
        if !matches!(page, Json::Object(_)) || !matches!(page.get(key), Some(Json::Array(_))) {
            return refuse("Unreadable API page");
        }
        let count = page.get("total_count").cloned();
        let total = total.get_or_insert(count.clone());
        let consistent = match (total.as_ref(), count.as_ref()) {
            (Some(t @ Json::Int(_)), Some(c)) => t.py_eq(c),
            _ => false,
        };
        if !consistent {
            return refuse("API listing changed or has no count");
        }
        let Some(Json::Array(values)) = page.get(key) else {
            unreachable!("checked above");
        };
        for value in values {
            if !matches!(value, Json::Object(_)) || int(value.get("id")).is_none() {
                return refuse("Unreadable API identity");
            }
            found.push(value.clone());
        }
    }
    let total = int(total.as_ref().and_then(Option::as_ref))
        .expect("checked int")
        .clone();
    let mut ids: Vec<&BigInt> = found.iter().filter_map(|v| int(v.get("id"))).collect();
    ids.sort();
    ids.dedup();
    if BigInt::from(found.len()) != total || ids.len() != found.len() {
        return refuse("Incomplete API listing");
    }
    Ok(found)
}

fn ids(values: &[Json]) -> Vec<BigInt> {
    values
        .iter()
        .filter_map(|v| int(v.get("id")).cloned())
        .collect()
}

pub type Fetch<'a> = dyn FnMut(&str, bool) -> Result<Json> + 'a;

/// Two consecutive complete listings with the same ordered identities.
pub fn stable_items(fetch: &mut Fetch, endpoint: &str, key: &str) -> Result<Vec<Json>> {
    let mut previous = items(&fetch(endpoint, true)?, key)?;
    for _ in 0..3 {
        let current = items(&fetch(endpoint, true)?, key)?;
        if ids(&previous) == ids(&current) {
            return Ok(current);
        }
        previous = current;
    }
    refuse("API listing did not stabilise")
}

fn require_main(repository: &str, commit: &str, fetch: &mut Fetch) -> Result<()> {
    let main = fetch(&format!("repos/{repository}/git/ref/heads/main"), false)?;
    let object = match (&main, main.get("object")) {
        (Json::Object(_), Some(object @ Json::Object(_))) => object,
        _ => return refuse("Unreadable main revision"),
    };
    if !is(object, "sha", commit) {
        return refuse("Publication candidate is no longer main");
    }
    Ok(())
}

pub fn evaluate(repository: &str, commit: &str, fetch: &mut Fetch) -> Result<bool> {
    require_main(repository, commit, fetch)?;
    let checks = stable_items(
        fetch,
        &format!("repos/{repository}/commits/{commit}/check-runs?filter=all"),
        "check_runs",
    )?;
    let mut codeql = Vec::new();
    for value in &checks {
        if ["name", "head_sha", "status"]
            .iter()
            .any(|field| text(value, field).is_none())
        {
            return refuse("Unreadable check identity");
        }
        let app_id = match value.get("app") {
            Some(app @ Json::Object(_)) => int(app.get("id")),
            _ => None,
        };
        let Some(app_id) = app_id else {
            return refuse("Unreadable check producer");
        };
        if is(value, "name", "CodeQL")
            && *app_id == BigInt::from(57789)
            && is(value, "head_sha", commit)
        {
            codeql.push(value);
        }
    }
    // An Analyze job is not the CodeQL results policy. No mapped result means no publication.
    let succeeded = |v: &Json| is(v, "status", "completed") && is(v, "conclusion", "success");
    if codeql
        .iter()
        .any(|v| is(v, "status", "completed") && !is(v, "conclusion", "success"))
    {
        return refuse("CodeQL results did not succeed");
    }
    let runs = stable_items(
        fetch,
        &format!("repos/{repository}/actions/runs?head_sha={commit}"),
        "workflow_runs",
    )?;
    let mut audits = Vec::new();
    for run in &runs {
        let Some(path) = text(run, "path") else {
            return refuse("Unreadable workflow path");
        };
        if path != AUDIT_WORKFLOW {
            continue;
        }
        if ["path", "head_sha", "event", "head_branch", "status"]
            .iter()
            .any(|field| text(run, field).is_none())
        {
            return refuse("Unreadable workflow identity");
        }
        let mut owners = Vec::new();
        for field in ["repository", "head_repository"] {
            let name = match run.get(field) {
                Some(owner @ Json::Object(_)) => text(owner, "full_name"),
                _ => None,
            };
            let Some(name) = name else {
                return refuse("Unreadable audit repository");
            };
            owners.push(py::casefold(name));
        }
        let expected_owner = py::casefold(repository);
        let event = text(run, "event").unwrap_or_default();
        if !matches!(event, "push" | "workflow_dispatch")
            || !is(run, "head_branch", "main")
            || !is(run, "head_sha", commit)
            || owners[0] != expected_owner
            || owners[1] != expected_owner
        {
            continue;
        }
        let id = int(run.get("id")).expect("items checked the id");
        let id = py::int_repr(id).map_err(Refusal::Value)?;
        let jobs = stable_items(
            fetch,
            &format!("repos/{repository}/actions/runs/{id}/jobs?filter=latest"),
            "jobs",
        )?;
        for job in &jobs {
            if ["name", "head_sha", "status"]
                .iter()
                .any(|field| text(job, field).is_none())
            {
                return refuse("Unreadable audit job identity");
            }
        }
        let selected: Vec<&Json> = jobs
            .iter()
            .filter(|job| is(job, "name", AUDIT_JOB) && is(job, "head_sha", commit))
            .collect();
        if selected.len() > 1 {
            return refuse("Ambiguous audit job");
        }
        if selected.is_empty() && is(run, "status", "completed") {
            return refuse("Audit completed without the required job");
        }
        if let Some(job) = selected.first()
            && is(job, "status", "completed")
            && !is(job, "conclusion", "success")
        {
            return refuse("Attribution audit did not succeed");
        }
        audits.push(selected.first().is_some_and(|job| succeeded(job)));
    }
    let ready = !codeql.is_empty()
        && codeql.iter().all(|v| succeeded(v))
        && !audits.is_empty()
        && audits.iter().all(|a| *a);
    if ready {
        require_main(repository, commit, fetch)?;
    }
    Ok(ready)
}

/// `gh api <endpoint> [--paginate --slurp]` with check=True and a 60-second timeout.
fn gh_json(endpoint: &str, paginate: bool) -> Result<Json> {
    let mut command = Command::new("gh");
    command.args(["api", endpoint]);
    if paginate {
        command.args(["--paginate", "--slurp"]);
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| Refusal::External)?;
    let mut stdout = child.stdout.take().expect("piped");
    let mut stderr = child.stderr.take().expect("piped");
    let out = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stdout.read_to_end(&mut buffer);
        buffer
    });
    let err = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stderr.read_to_end(&mut buffer);
    });
    let deadline = Instant::now() + Duration::from_secs(60);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(Refusal::External);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => return Err(Refusal::External),
        }
    };
    let stdout = out.join().unwrap_or_default();
    let _ = err.join();
    if !status.success() {
        return Err(Refusal::External);
    }
    pyjson::loads_bytes(&stdout).map_err(|e| {
        // A JSONDecodeError may quote the response; a UnicodeDecodeError is printed.
        let text = e.to_string();
        if crate::pyre::re(r": line \d+ column \d+ \(char \d+\)$", 0).is_match(&text) {
            Refusal::External
        } else {
            Refusal::Value(text)
        }
    })
}

/// The monotonic clock and sleep the wait loop uses, replaceable in tests.
pub trait Clock {
    fn monotonic(&mut self) -> f64;
    fn sleep(&mut self, seconds: f64);
}

struct SystemClock(Instant);

impl Clock for SystemClock {
    fn monotonic(&mut self) -> f64 {
        self.0.elapsed().as_secs_f64()
    }

    fn sleep(&mut self, seconds: f64) {
        std::thread::sleep(Duration::from_secs_f64(seconds.max(0.0)));
    }
}

/// argparse for `--repository`, `--commit` and `--wait-seconds`: abbreviations, `=`
/// values, the int conversion and the required options. `Err` is the exit code.
fn parse(args: &[String]) -> std::result::Result<(String, String, i64), u8> {
    let options = ["--repository", "--commit", "--wait-seconds"];
    let error = |message: &str| {
        let _ = crate::print_text(
            &format!("{USAGE}site-tools check_publication: error: {message}\n"),
            true,
        );
        Err(2)
    };
    let looks_negative = |arg: &str| fullmatch(r"-\d+|-\d*\.\d+", 0, arg);
    let mut values: [Option<String>; 3] = [None, None, None];
    let mut unrecognized: Vec<&str> = Vec::new();
    let mut positional_only = false;
    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        i += 1;
        if positional_only || !arg.starts_with('-') || arg == "-" || looks_negative(arg) {
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
        if option == "--help" {
            if let Some(value) = explicit {
                return error(&format!(
                    "argument -h/--help: ignored explicit argument {}",
                    py::repr_str(&value)
                ));
            }
            let _ = crate::print_text(HELP, false);
            return Err(0);
        }
        let value = match explicit {
            Some(value) => value,
            None => match args.get(i) {
                Some(next) if !(next.starts_with('-') && next != "-" && !looks_negative(next)) => {
                    i += 1;
                    next.clone()
                }
                _ => return error(&format!("argument {option}: expected one argument")),
            },
        };
        let slot = options
            .iter()
            .position(|o| *o == option)
            .expect("an option");
        if option == "--wait-seconds" && py::parse_int(&value, 10).is_err() {
            return error(&format!(
                "argument --wait-seconds: invalid int value: {}",
                py::repr_str(&value)
            ));
        }
        values[slot] = Some(value);
    }
    let missing: Vec<&str> = options[..2]
        .iter()
        .zip(&values)
        .filter(|(_, v)| v.is_none())
        .map(|(o, _)| *o)
        .collect();
    if !missing.is_empty() {
        return error(&format!(
            "the following arguments are required: {}",
            missing.join(", ")
        ));
    }
    if !unrecognized.is_empty() {
        return error(&format!(
            "unrecognized arguments: {}",
            unrecognized.join(" ")
        ));
    }
    let [Some(repository), Some(commit), wait] = values else {
        unreachable!("required");
    };
    let wait = match wait {
        Some(text) => py::parse_int(&text, 10)
            .ok()
            .and_then(|i| i64::try_from(i).ok())
            .unwrap_or(i64::MAX),
        None => 0,
    };
    if !fullmatch(REPOSITORY, 0, &repository)
        || !fullmatch(SHA, 0, &commit)
        || !(0..=600).contains(&wait)
    {
        return error("Invalid publication identity or wait");
    }
    Ok((repository, commit, wait))
}

/// The command with its evaluation, clock and output separable for tests.
pub fn main_with(
    args: &[String],
    evaluate_fn: &mut dyn FnMut(&str, &str) -> Result<bool>,
    clock: &mut dyn Clock,
) -> u8 {
    let (repository, commit, wait) = match parse(args) {
        Ok(parsed) => parsed,
        Err(code) => return code,
    };
    let deadline = clock.monotonic() + wait as f64;
    let outcome = (|| -> Result<()> {
        while !evaluate_fn(&repository, &commit)? {
            if clock.monotonic() >= deadline {
                return refuse("Required external results are missing or unfinished");
            }
            let remaining = deadline - clock.monotonic();
            clock.sleep(remaining.clamp(0.0, 15.0));
        }
        Ok(())
    })();
    match outcome {
        Ok(()) => {
            let _ = crate::print_text(
                "Current main and external publication results verified\n",
                false,
            );
            0
        }
        Err(refusal) => {
            // API stderr and response data can contain private material.
            let message = match refusal {
                Refusal::Value(message) => message,
                Refusal::External => "External verification could not complete".into(),
            };
            let _ = crate::print_text(&format!("{message}\n"), true);
            1
        }
    }
}

pub fn run(args: &[String]) -> std::result::Result<u8, String> {
    let mut clock = SystemClock(Instant::now());
    let mut fetch = gh_json;
    Ok(main_with(
        args,
        &mut |repository, commit| evaluate(repository, commit, &mut fetch),
        &mut clock,
    ))
}
