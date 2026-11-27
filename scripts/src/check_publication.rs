// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

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
/// The run CodeQL default setup makes for each push to main.
pub const CODEQL_WORKFLOW: &str = "dynamic/github-code-scanning/codeql";
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
        let (Json::Object(_), Some(Json::Array(values))) = (page, page.get(key)) else {
            return refuse("Unreadable API page");
        };
        let count = page.get("total_count").cloned();
        let total = total.get_or_insert(count.clone());
        let consistent = match (total.as_ref(), count.as_ref()) {
            (Some(t @ Json::Int(_)), Some(c)) => t.py_eq(c),
            _ => false,
        };
        if !consistent {
            return refuse("API listing changed or has no count");
        }
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
    // The `CodeQL` check run is not read: GitHub creates it only for pull requests, and
    // one from a pull request whose head is this commit, against another base, would
    // attach to this commit too. Main's own analysis and alerts decide instead.
    let succeeded = |v: &Json| is(v, "status", "completed") && is(v, "conclusion", "success");
    let runs = stable_items(
        fetch,
        &format!("repos/{repository}/actions/runs?head_sha={commit}"),
        "workflow_runs",
    )?;
    let mut audits = Vec::new();
    let mut analyses = Vec::new();
    let mut analysis_runs = Vec::new();
    for run in &runs {
        let Some(path) = text(run, "path") else {
            return refuse("Unreadable workflow path");
        };
        let analysis = path == CODEQL_WORKFLOW;
        if path != AUDIT_WORKFLOW && !analysis {
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
                return refuse(if analysis {
                    "Unreadable analysis repository"
                } else {
                    "Unreadable audit repository"
                });
            };
            owners.push(py::casefold(name));
        }
        let expected_owner = py::casefold(repository);
        let event = text(run, "event").unwrap_or_default();
        let trusted_event = if analysis {
            event == "dynamic"
        } else {
            matches!(event, "push" | "workflow_dispatch")
        };
        if !trusted_event
            || !is(run, "head_branch", "main")
            || !is(run, "head_sha", commit)
            || owners[0] != expected_owner
            || owners[1] != expected_owner
        {
            continue;
        }
        if analysis {
            if is(run, "status", "completed") && !is(run, "conclusion", "success") {
                return refuse("CodeQL analysis of main did not succeed");
            }
            let id = int(run.get("id")).expect("items checked the id");
            analysis_runs.push(py::int_repr(id).map_err(Refusal::Value)?);
            analyses.push(succeeded(run));
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
    let audited = !audits.is_empty() && audits.iter().all(|a| *a);
    let analysed = !analyses.is_empty() && analyses.iter().all(|a| *a);
    let ready =
        audited && analysed && main_results_pass(repository, commit, &analysis_runs, fetch)?;
    if ready {
        require_main(repository, commit, fetch)?;
    }
    Ok(ready)
}

/// The records of a `gh api --paginate --slurp` listing that returns a bare array.
fn array_items(payload: &Json, what: &str) -> Result<Vec<Json>> {
    let unreadable = || refuse(&format!("Unreadable {what} listing"));
    let Json::Array(pages) = payload else {
        return unreadable();
    };
    if pages.is_empty() {
        return unreadable();
    }
    let mut found = Vec::new();
    for page in pages {
        let Json::Array(records) = page else {
            return unreadable();
        };
        for record in records {
            if !matches!(record, Json::Object(_)) {
                return unreadable();
            }
            found.push(record.clone());
        }
    }
    Ok(found)
}

/// Whether code scanning holds main's CodeQL results for `commit` and neither those
/// results nor main's open alerts reach the pull request check's default failure
/// threshold: error severity, or high or critical security severity. Any such alert
/// refuses publication, however old. False while the results are still being
/// processed or the alert listing changes between reads.
fn main_results_pass(
    repository: &str,
    commit: &str,
    runs: &[String],
    fetch: &mut Fetch,
) -> Result<bool> {
    if !analyses_pass(repository, commit, runs, fetch)? {
        return Ok(false);
    }
    let endpoint = format!(
        "repos/{repository}/code-scanning/alerts?ref=refs/heads/main&state=open&tool_name=CodeQL&per_page=100"
    );
    let alerts = alert_levels(&fetch(&endpoint, true)?)?;
    if alert_levels(&fetch(&endpoint, true)?)? != alerts {
        return Ok(false);
    }
    if alerts.iter().any(|(_, severity, security)| {
        severity.as_deref() == Some("error")
            || matches!(security.as_deref(), Some("high" | "critical"))
    }) {
        return refuse("Main has an open CodeQL alert the pull request check would fail on");
    }
    Ok(true)
}

/// A job of an analysis run: its language and when it started and finished.
struct AnalysisJob {
    category: String,
    started: String,
    completed: String,
}

impl AnalysisJob {
    /// Whether `analysis` is an upload of `commit` in this job's category that may
    /// have been made whilst the job ran, its start second included. GitHub writes
    /// these times as UTC `YYYY-MM-DDTHH:MM:SSZ`, which sort as text.
    fn covers(&self, analysis: &Json, commit: &str) -> bool {
        let created = text(analysis, "created_at").unwrap_or_default();
        is(analysis, "commit_sha", commit)
            && is(analysis, "category", &self.category)
            && created >= self.started.as_str()
            && created <= self.completed.as_str()
    }

    /// Whether `analysis` can be this job's own upload: covered and made after the
    /// second the job started, which an earlier attempt's upload could share.
    fn uploaded(&self, analysis: &Json, commit: &str) -> bool {
        self.covers(analysis, commit)
            && text(analysis, "created_at").unwrap_or_default() > self.started.as_str()
    }
}

/// The time at `key` when it is a real UTC `YYYY-MM-DDTHH:MM:SSZ` time, or None.
fn timestamp<'a>(record: &'a Json, key: &str) -> Option<&'a str> {
    text(record, key).filter(|time| {
        fullmatch(
            "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z",
            0,
            time,
        ) && jiff::civil::DateTime::strptime("%Y-%m-%dT%H:%M:%SZ", time).is_ok()
    })
}

/// The `Analyze (<language>)` jobs of each run's latest attempt. A run without one,
/// or a job without both times in UTC, refuses.
fn analysis_jobs(repository: &str, runs: &[String], fetch: &mut Fetch) -> Result<Vec<AnalysisJob>> {
    let mut found = Vec::new();
    for run in runs {
        let jobs = stable_items(
            fetch,
            &format!("repos/{repository}/actions/runs/{run}/jobs?filter=latest"),
            "jobs",
        )?;
        let before = found.len();
        for job in &jobs {
            let Some(language) = text(job, "name")
                .and_then(|name| name.strip_prefix("Analyze ("))
                .and_then(|name| name.strip_suffix(')'))
            else {
                continue;
            };
            let (Some(started), Some(completed)) =
                (timestamp(job, "started_at"), timestamp(job, "completed_at"))
            else {
                return refuse("Unreadable analysis job");
            };
            found.push(AnalysisJob {
                category: format!("/language:{language}"),
                started: started.to_owned(),
                completed: completed.to_owned(),
            });
        }
        if found.len() == before {
            return refuse("CodeQL analysis of main has no Analyze job");
        }
    }
    Ok(found)
}

/// Whether each analysis job's own upload of the commit, made whilst the job ran, has
/// been processed and holds no result at the threshold. Each upload's own results are
/// read, because a later upload in the same category replaces an earlier one's alerts
/// and the alert listing cannot show which upload it reflects. False while an upload
/// is missing or pending. A rerun attempt's jobs start after the earlier attempt
/// finished, so its upload falls outside their windows, and no upload counts for 2
/// jobs.
fn analyses_pass(
    repository: &str,
    commit: &str,
    runs: &[String],
    fetch: &mut Fetch,
) -> Result<bool> {
    let jobs = analysis_jobs(repository, runs, fetch)?;
    let Some(uploads) = job_uploads(repository, commit, &jobs, fetch)? else {
        return Ok(false);
    };
    for upload in &uploads {
        let (Some(sarif), Some(id)) = (text(upload, "sarif_id"), int(upload.get("id"))) else {
            return refuse("Unreadable analysis upload");
        };
        if !fullmatch("[0-9a-f-]+", 0, sarif) {
            return refuse("Unreadable analysis upload");
        }
        let status = fetch(
            &format!("repos/{repository}/code-scanning/sarifs/{sarif}"),
            false,
        )?;
        match text(&status, "processing_status") {
            Some("complete") => {}
            Some("pending") => return Ok(false),
            Some("failed") => {
                return refuse("Code scanning could not process main's CodeQL results");
            }
            _ => return refuse("Unreadable analysis upload"),
        }
        let id = py::int_repr(id).map_err(Refusal::Value)?;
        let results = fetch(
            &format!("repos/{repository}/code-scanning/analyses/{id}"),
            false,
        )?;
        if sarif_fails(&results)? {
            return refuse(
                "Main's CodeQL analysis has a result the pull request check would fail on",
            );
        }
    }
    Ok(true)
}

/// The JSON array at `key`, or None.
fn array_at<'a>(value: Option<&'a Json>, key: &str) -> Option<&'a [Json]> {
    match value?.get(key)? {
        Json::Array(items) => Some(items),
        _ => None,
    }
}

/// Whether an analysis's SARIF holds a result at the pull request check's default
/// threshold: error level, or a rule security severity of 7.0 or more (high or
/// critical). A result without a level takes its rule's default level, then SARIF's
/// default, warning. A result whose rule cannot be found, or a security severity
/// that is not a number, is unreadable.
fn sarif_fails(sarif: &Json) -> Result<bool> {
    let unreadable = || refuse("Unreadable analysis results");
    let Some(runs) = array_at(Some(sarif), "runs") else {
        return unreadable();
    };
    for run in runs {
        let Some(results) = array_at(Some(run), "results") else {
            return unreadable();
        };
        for result in results {
            let Some(rule) = rule_of(run, result) else {
                return unreadable();
            };
            let level = text(result, "level")
                .or_else(|| {
                    rule.get("defaultConfiguration")
                        .and_then(|c| text(c, "level"))
                })
                .unwrap_or("warning");
            let security = match rule
                .get("properties")
                .and_then(|p| p.get("security-severity"))
            {
                None => 0.0,
                Some(Json::Str(score)) => match score.parse::<f64>() {
                    Ok(score) => score,
                    Err(_) => return unreadable(),
                },
                Some(_) => return unreadable(),
            };
            if level == "error" || security >= 7.0 {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// The rule a SARIF result names: `rule.index` in the tool extension at
/// `rule.toolComponent.index`, or in the driver without one, or `ruleIndex` in the
/// driver.
fn rule_of<'a>(run: &'a Json, result: &Json) -> Option<&'a Json> {
    let tool = run.get("tool");
    let index = |value: Option<&Json>| int(value).and_then(|i| usize::try_from(i).ok());
    let (component, rule) = match result.get("rule") {
        Some(reference @ Json::Object(_)) => (
            reference
                .get("toolComponent")
                .map(|c| index(c.get("index"))),
            index(reference.get("index")),
        ),
        _ => (None, index(result.get("ruleIndex"))),
    };
    let rules = match component {
        Some(component) => array_at(array_at(tool, "extensions")?.get(component?), "rules")?,
        None => array_at(tool.and_then(|t| t.get("driver")), "rules")?,
    };
    rules.get(rule?)
}

/// Page `page` of main's CodeQL analyses, newest first. An analysis without its id,
/// commit, category or creation time in UTC refuses.
fn analysis_page(repository: &str, page: usize, fetch: &mut Fetch) -> Result<Vec<Json>> {
    let listing = fetch(
        &format!(
            "repos/{repository}/code-scanning/analyses?ref=refs/heads/main&tool_name=CodeQL&per_page=100&page={page}"
        ),
        false,
    )?;
    let analyses = array_items(&Json::Array(vec![listing]), "analysis")?;
    if analyses.iter().any(|a| {
        int(a.get("id")).is_none()
            || text(a, "commit_sha").is_none()
            || text(a, "category").is_none()
            || timestamp(a, "created_at").is_none()
    }) {
        return refuse("Unreadable analysis listing");
    }
    Ok(analyses)
}

/// Every analysis of `commit` in a job's category created whilst that job ran, its
/// start second included. Each job needs its own, made after that second and not
/// matched to another job; any further one is returned too, because a later upload
/// replaces an earlier one's alerts. The listing is newest first and ignores a
/// commit filter, so pages are read until one is empty or reaches analyses older
/// than the earliest job. None while a job has no upload.
fn job_uploads(
    repository: &str,
    commit: &str,
    jobs: &[AnalysisJob],
    fetch: &mut Fetch,
) -> Result<Option<Vec<Json>>> {
    let earliest = jobs
        .iter()
        .map(|job| job.started.as_str())
        .min()
        .unwrap_or_default();
    let mut matched: Vec<Option<Json>> = jobs.iter().map(|_| None).collect();
    let mut surplus: Vec<Json> = Vec::new();
    for page in 1.. {
        let analyses = analysis_page(repository, page, fetch)?;
        for analysis in &analyses {
            let seen = matched
                .iter()
                .flatten()
                .chain(&surplus)
                .any(|m| m.get("id") == analysis.get("id"));
            if seen || !jobs.iter().any(|job| job.covers(analysis, commit)) {
                continue;
            }
            match jobs.iter().zip(matched.iter_mut()).find_map(|(job, slot)| {
                (slot.is_none() && job.uploaded(analysis, commit)).then_some(slot)
            }) {
                Some(slot) => *slot = Some(analysis.clone()),
                None => surplus.push(analysis.clone()),
            }
        }
        let older = analyses
            .last()
            .is_none_or(|last| text(last, "created_at").unwrap_or_default() < earliest);
        if older {
            break;
        }
    }
    let Some(mut uploads) = matched.into_iter().collect::<Option<Vec<Json>>>() else {
        return Ok(None);
    };
    uploads.extend(surplus);
    Ok(Some(uploads))
}

/// An open alert's number, rule severity and rule security severity.
type AlertLevel = (Option<BigInt>, Option<String>, Option<String>);

/// Each open alert's level. A rule must hold a severity and a security severity,
/// each as text or null, or the alert is unreadable: a missing security severity
/// could hide a high or critical alert.
fn alert_levels(listing: &Json) -> Result<Vec<AlertLevel>> {
    array_items(listing, "alert")?
        .iter()
        .map(|alert| {
            let rule = match alert.get("rule") {
                Some(rule @ Json::Object(_)) => rule,
                _ => return refuse("Unreadable alert rule"),
            };
            let readable = |key: &str| matches!(rule.get(key), Some(Json::Str(_) | Json::Null));
            if !readable("severity") || !readable("security_severity_level") {
                return refuse("Unreadable alert rule");
            }
            Ok((
                int(alert.get("number")).cloned(),
                text(rule, "severity").map(str::to_owned),
                text(rule, "security_severity_level").map(str::to_owned),
            ))
        })
        .collect()
}

/// `gh api <endpoint> [--paginate --slurp]` with check=True and a 60-second timeout.
fn gh_json(endpoint: &str, paginate: bool) -> Result<Json> {
    api_json("gh", Duration::from_secs(60), endpoint, paginate)
}

/// `<program> api <endpoint> [--paginate --slurp]`, killed after `limit`.
fn api_json(program: &str, limit: Duration, endpoint: &str, paginate: bool) -> Result<Json> {
    let mut command = Command::new(program);
    command.args(["api", endpoint]);
    // An analysis read by its id returns its SARIF only when asked for it.
    if endpoint.contains("/code-scanning/analyses/") {
        command.args(["-H", "Accept: application/sarif+json"]);
    }
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
    let status = wait_up_to(&mut child, limit)?;
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

/// The child's exit status, or External once it has run for `limit` and been killed.
fn wait_up_to(
    child: &mut std::process::Child,
    limit: Duration,
) -> Result<std::process::ExitStatus> {
    let deadline = Instant::now() + limit;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(Refusal::External);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => return Err(Refusal::External),
        }
    }
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
            // No 2 options share a prefix past `--`, so an abbreviation names at most one.
            std::iter::once("--help")
                .chain(options)
                .find(|o| o.starts_with(name))
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
    let [Some(repository), Some(commit), wait] = values else {
        return error(&format!(
            "the following arguments are required: {}",
            missing.join(", ")
        ));
    };
    if !unrecognized.is_empty() {
        return error(&format!(
            "unrecognized arguments: {}",
            unrecognized.join(" ")
        ));
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    const REPO: &str = "example/site";

    fn json(text: &str) -> Json {
        pyjson::loads(text).unwrap()
    }

    fn sha() -> String {
        "a".repeat(40)
    }

    fn main_ref() -> Json {
        json(&format!(r#"{{"object": {{"sha": "{}"}}}}"#, sha()))
    }

    /// One complete listing page holding `count` records under `key`.
    fn listing(key: &str, records: &str, count: usize) -> Json {
        json(&format!(
            r#"[{{"{key}": {records}, "total_count": {count}}}]"#
        ))
    }

    /// A run of `path` on main for `sha()`, with `extra` fields replacing the base ones.
    fn run(path: &str, event: &str, extra: &str) -> String {
        let c = sha();
        let base = format!(
            r#""id": 2, "path": "{path}", "event": "{event}", "head_sha": "{c}", "head_branch": "main", "status": "completed", "repository": {{"full_name": "{REPO}"}}, "head_repository": {{"full_name": "{REPO}"}}"#
        );
        // A later duplicate key wins, as in Python's json.
        if extra.is_empty() {
            format!("{{{base}}}")
        } else {
            format!("{{{base}, {extra}}}")
        }
    }

    /// evaluate() against main at `sha()` and one workflow run; `jobs` answers any
    /// jobs listing, None makes it fail as the API would.
    fn evaluate_run(run: &str, jobs: Option<&str>) -> Result<bool> {
        let runs = listing("workflow_runs", &format!("[{run}]"), 1);
        let jobs = jobs.map(|jobs| listing("jobs", &format!("[{jobs}]"), 1));
        let mut fetch = |endpoint: &str, _paginate: bool| -> Result<Json> {
            if endpoint.ends_with("heads/main") {
                Ok(main_ref())
            } else if endpoint.contains("/actions/runs?") {
                Ok(runs.clone())
            } else {
                jobs.clone().ok_or(Refusal::External)
            }
        };
        evaluate(REPO, &sha(), &mut fetch)
    }

    fn value(message: &str) -> Result<bool> {
        Err(Refusal::Value(message.into()))
    }

    #[test]
    fn a_failed_workflow_run_listing_stops_verification() {
        let mut fetch = |endpoint: &str, _: bool| -> Result<Json> {
            if endpoint.ends_with("heads/main") {
                Ok(main_ref())
            } else {
                Err(Refusal::External)
            }
        };
        assert_eq!(evaluate(REPO, &sha(), &mut fetch), Err(Refusal::External));
    }

    #[test]
    fn a_run_without_its_workflow_path_is_unreadable() {
        assert_eq!(
            evaluate_run(r#"{"id": 1}"#, None),
            value("Unreadable workflow path")
        );
    }

    #[test]
    fn an_audit_run_without_its_branch_is_unreadable() {
        let audit = run(AUDIT_WORKFLOW, "push", r#""head_branch": null"#);
        assert_eq!(
            evaluate_run(&audit, None),
            value("Unreadable workflow identity")
        );
    }

    #[test]
    fn a_run_whose_repository_is_not_a_record_names_its_kind() {
        let audit = run(AUDIT_WORKFLOW, "push", r#""repository": "example/site""#);
        assert_eq!(
            evaluate_run(&audit, None),
            value("Unreadable audit repository")
        );
        let analysis = run(CODEQL_WORKFLOW, "dynamic", r#""head_repository": {}"#);
        assert_eq!(
            evaluate_run(&analysis, None),
            value("Unreadable analysis repository")
        );
    }

    #[test]
    fn a_failed_audit_job_listing_stops_verification() {
        let audit = run(AUDIT_WORKFLOW, "push", "");
        assert_eq!(evaluate_run(&audit, None), Err(Refusal::External));
    }

    #[test]
    fn an_audit_job_without_its_status_is_unreadable() {
        let audit = run(AUDIT_WORKFLOW, "push", "");
        let job = format!(
            r#"{{"id": 3, "name": "{AUDIT_JOB}", "head_sha": "{}"}}"#,
            sha()
        );
        assert_eq!(
            evaluate_run(&audit, Some(&job)),
            value("Unreadable audit job identity")
        );
    }

    #[test]
    fn a_failed_analysis_job_listing_stops_verification() {
        let mut fetch = |_: &str, _: bool| -> Result<Json> { Err(Refusal::External) };
        assert!(matches!(
            analysis_jobs(REPO, &["6".into()], &mut fetch),
            Err(Refusal::External)
        ));
    }

    #[test]
    fn an_analysis_upload_without_its_sarif_id_is_unreadable() {
        let c = sha();
        let jobs = listing(
            "jobs",
            r#"[{"id": 7, "name": "Analyze (python)", "started_at": "2026-11-16T00:00:00Z", "completed_at": "2026-11-16T00:05:00Z"}]"#,
            1,
        );
        let analyses = json(&format!(
            r#"[{{"id": 9, "commit_sha": "{c}", "category": "/language:python", "created_at": "2026-11-16T00:02:30Z"}}]"#
        ));
        let mut fetch = |endpoint: &str, _: bool| -> Result<Json> {
            if endpoint.contains("/jobs?") {
                Ok(jobs.clone())
            } else if endpoint.ends_with("&page=1") {
                Ok(analyses.clone())
            } else {
                Ok(json("[]"))
            }
        };
        assert_eq!(
            analyses_pass(REPO, &c, &["6".into()], &mut fetch),
            value("Unreadable analysis upload")
        );
    }

    #[test]
    fn sarif_whose_runs_are_not_a_list_is_unreadable() {
        assert_eq!(
            sarif_fails(&json(r#"{"runs": {}}"#)),
            value("Unreadable analysis results")
        );
    }

    fn strings(args: &[&str]) -> Vec<String> {
        args.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn unknown_and_single_dash_options_are_unrecognised_and_abbreviations_are_accepted() {
        let c = sha();
        let full = |extra: &str| strings(&["--repository", REPO, "--commit", &c, extra]);
        assert_eq!(parse(&full("--zzz")), Err(2));
        assert_eq!(parse(&full("-x")), Err(2));
        assert_eq!(parse(&full("--commit")), Err(2));
        assert_eq!(
            parse(&strings(&["--rep", REPO, "--co", &c, "--wait", "5"])),
            Ok((REPO.into(), c.clone(), 5))
        );
        assert_eq!(parse(&strings(&["--repository", REPO, "-x"])), Err(2));
    }

    #[test]
    fn the_system_clock_sleeps_forward_and_never_backward() {
        let mut clock = SystemClock(Instant::now());
        let start = clock.monotonic();
        clock.sleep(-5.0);
        clock.sleep(0.01);
        assert!(clock.monotonic() - start >= 0.01);
    }

    #[cfg(unix)]
    mod api {
        use super::*;
        use std::os::unix::fs::PermissionsExt;

        const MINUTE: Duration = Duration::from_secs(60);

        /// Runs `body` as a `/bin/sh` script standing in for `gh`.
        fn call(body: &str, limit: Duration, endpoint: &str, paginate: bool) -> Result<Json> {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("gh");
            std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            api_json(&path.to_string_lossy(), limit, endpoint, paginate)
        }

        /// The script prints its arguments as a JSON list of strings.
        const ECHO: &str = r#"printf '['; sep=; for a in "$@"; do printf '%s"%s"' "$sep" "$a"; sep=,; done; printf ']'"#;

        #[test]
        fn a_listing_is_read_with_pagination_and_an_analysis_with_its_sarif() {
            assert_eq!(
                call(ECHO, MINUTE, "repos/a/b/actions/runs", true).unwrap(),
                json(r#"["api", "repos/a/b/actions/runs", "--paginate", "--slurp"]"#)
            );
            assert_eq!(
                call(ECHO, MINUTE, "repos/a/b/code-scanning/analyses/9", false).unwrap(),
                json(
                    r#"["api", "repos/a/b/code-scanning/analyses/9", "-H", "Accept: application/sarif+json"]"#
                )
            );
        }

        #[test]
        fn a_failed_call_or_malformed_json_hides_the_response() {
            assert_eq!(
                call("echo secret; exit 1", MINUTE, "x", false),
                Err(Refusal::External)
            );
            assert_eq!(
                call("echo '{secret'", MINUTE, "x", false),
                Err(Refusal::External)
            );
        }

        #[test]
        fn a_response_that_is_not_utf8_is_a_printable_value_error() {
            let result = call(r"printf '\377'", MINUTE, "x", false);
            assert!(
                matches!(&result, Err(Refusal::Value(message)) if message.contains("decode")),
                "{result:?}"
            );
        }

        #[test]
        fn a_call_still_running_at_its_limit_is_killed() {
            let started = Instant::now();
            assert_eq!(
                call("exec sleep 30", Duration::from_millis(200), "x", false),
                Err(Refusal::External)
            );
            assert!(started.elapsed() < Duration::from_secs(20));
        }

        #[test]
        fn a_missing_program_is_an_external_failure() {
            assert_eq!(
                api_json("/nonexistent/gh", MINUTE, "x", false),
                Err(Refusal::External)
            );
        }
    }
}
