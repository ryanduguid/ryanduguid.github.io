// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! scripts/test_check_publication.py: publication refusals using fabricated GitHub results.
use site_tools::check_publication::{
    AUDIT_JOB, AUDIT_WORKFLOW, CODEQL_WORKFLOW, Clock, Refusal, evaluate, items, main_with,
    stable_items,
};
use site_tools::pyjson::{self, Json};
use std::cell::{Cell, RefCell};
use std::collections::VecDeque;
use std::path::Path;

const REPO: &str = "example/site";

fn commit() -> String {
    "a".repeat(40)
}

fn json(text: &str) -> Json {
    pyjson::loads(text).unwrap()
}

/// `record | changes`: a copy with keys replaced or added.
fn with(record: &Json, changes: &[(&str, Json)]) -> Json {
    let Json::Object(pairs) = record else {
        panic!("not a record")
    };
    let mut pairs = pairs.clone();
    for (key, value) in changes {
        match pairs.iter_mut().find(|(k, _)| k == key) {
            Some(entry) => entry.1 = value.clone(),
            None => pairs.push(((*key).to_owned(), value.clone())),
        }
    }
    Json::Object(pairs)
}

fn s(text: &str) -> Json {
    Json::Str(text.into())
}

fn n(value: i64) -> Json {
    Json::Int(value.into())
}

fn page(key: &str, records: &[Json]) -> Json {
    Json::Array(vec![Json::Object(vec![
        (key.into(), Json::Array(records.to_vec())),
        ("total_count".into(), n(records.len() as i64)),
    ])])
}

struct Site {
    run: Json,
    analysis: Json,
    job: Json,
    main: String,
    runs: Vec<Json>,
    jobs: Vec<Json>,
    analysis_jobs: Vec<Json>,
    analyses: Json,
    /// The second page of the analysis listing; later pages are empty.
    older_analyses: Json,
    analysis_reads: Cell<usize>,
    /// The processing status of each analysis upload.
    upload: &'static str,
    /// Each analysis's SARIF by analysis id; any other analysis has no results.
    sarifs: Vec<(String, Json)>,
    alerts: Json,
    /// The alert listing from the second read on, when it differs from the first.
    alerts_later: Option<Json>,
    alert_reads: Cell<usize>,
}

impl Site {
    fn new() -> Self {
        let c = commit();
        let run = json(&format!(
            r#"{{"id": 2, "path": "{AUDIT_WORKFLOW}", "event": "push", "head_sha": "{c}", "head_branch": "main", "status": "completed", "repository": {{"full_name": "{REPO}"}}, "head_repository": {{"full_name": "{REPO}"}}}}"#
        ));
        let analysis = with(
            &run,
            &[
                ("id", n(6)),
                ("path", s(CODEQL_WORKFLOW)),
                ("event", s("dynamic")),
                ("conclusion", s("success")),
            ],
        );
        let job = json(&format!(
            r#"{{"id": 3, "name": "{AUDIT_JOB}", "head_sha": "{c}", "status": "completed", "conclusion": "success"}}"#
        ));
        Site {
            runs: vec![run.clone(), analysis.clone()],
            jobs: vec![job.clone()],
            analysis_jobs: vec![analysis_job("python")],
            analyses: Json::Array(vec![uploaded("python", "2026-11-16T00:02:30Z")]),
            older_analyses: json("[]"),
            analysis_reads: Cell::new(0),
            upload: "complete",
            sarifs: Vec::new(),
            alerts: Json::Array(vec![Json::Array(vec![])]),
            alerts_later: None,
            alert_reads: Cell::new(0),
            run,
            analysis,
            job,
            main: c,
        }
    }

    fn fetch(&self, endpoint: &str, paginate: bool) -> Json {
        if endpoint.ends_with("heads/main") {
            assert!(!paginate);
            return json(&format!(r#"{{"object": {{"sha": "{}"}}}}"#, self.main));
        }
        if let Some(page) = endpoint.strip_prefix(&format!(
            "repos/{REPO}/code-scanning/analyses?ref=refs/heads/main&tool_name=CodeQL&per_page=100&page="
        )) {
            assert!(!paginate);
            self.analysis_reads.set(self.analysis_reads.get() + 1);
            return match page {
                "1" => self.analyses.clone(),
                "2" => self.older_analyses.clone(),
                _ => json("[]"),
            };
        }
        if let Some(id) = endpoint.strip_prefix(&format!("repos/{REPO}/code-scanning/analyses/")) {
            assert!(!paginate);
            return self
                .sarifs
                .iter()
                .find(|(sarif, _)| sarif == id)
                .map_or_else(|| sarif("[]"), |(_, sarif)| sarif.clone());
        }
        if endpoint.starts_with(&format!("repos/{REPO}/code-scanning/sarifs/")) {
            assert!(!paginate);
            return json(&format!(r#"{{"processing_status": "{}"}}"#, self.upload));
        }
        assert!(paginate);
        if endpoint
            .contains("code-scanning/alerts?ref=refs/heads/main&state=open&tool_name=CodeQL&")
        {
            self.alert_reads.set(self.alert_reads.get() + 1);
            match &self.alerts_later {
                Some(later) if self.alert_reads.get() > 1 => later.clone(),
                _ => self.alerts.clone(),
            }
        } else if endpoint.contains("/runs/6/jobs?") || endpoint.contains("/runs/5/jobs?") {
            page("jobs", &self.analysis_jobs)
        } else if endpoint.contains("/jobs?") {
            page("jobs", &self.jobs)
        } else {
            page("workflow_runs", &self.runs)
        }
    }

    fn evaluate(&self) -> Result<bool, Refusal> {
        evaluate(REPO, &commit(), &mut |e, p| Ok(self.fetch(e, p)))
    }
}

/// Main as it is: an attribution audit and a default-setup analysis of the commit.
fn analysed_main() -> (Site, Json) {
    let site = Site::new();
    let analysis = site.analysis.clone();
    (site, analysis)
}

/// The default-setup job that analyses `language`, from 00:00:05 to 00:03:00.
fn analysis_job(language: &str) -> Json {
    json(&format!(
        r#"{{"id": 7, "name": "Analyze ({language})", "head_sha": "{}", "status": "completed", "conclusion": "success", "started_at": "2026-11-16T00:00:05Z", "completed_at": "2026-11-16T00:03:00Z"}}"#,
        commit()
    ))
}

/// The analysis of `language` code scanning lists for the commit, created at `created`,
/// with no results.
fn uploaded(language: &str, created: &str) -> Json {
    json(&format!(
        r#"{{"id": {}, "commit_sha": "{}", "category": "/language:{language}", "created_at": "{created}", "sarif_id": "0a-1", "results_count": 0}}"#,
        100 + language.len(),
        commit()
    ))
}

fn alert(rule: &str) -> Json {
    json(&format!(r#"{{"number": 1, "rule": {rule}}}"#))
}

/// A CodeQL SARIF log with `results`. The driver's rule 0 has no properties; the
/// query pack extension's rules 0 to 2 are an error, a high security severity and a
/// warning with a medium security severity.
fn sarif(results: &str) -> Json {
    json(&format!(
        r#"{{"runs": [{{"tool": {{"driver": {{"name": "CodeQL", "rules": [{{"id": "plain"}}]}}, "extensions": [{{"name": "codeql/python-queries", "rules": [
            {{"id": "py/error", "defaultConfiguration": {{"level": "error"}}}},
            {{"id": "py/high", "defaultConfiguration": {{"level": "warning"}}, "properties": {{"security-severity": "7.0"}}}},
            {{"id": "py/medium", "defaultConfiguration": {{"level": "warning"}}, "properties": {{"security-severity": "6.9"}}}}
        ]}}]}}, "results": {results}}}]}}"#
    ))
}

/// A result of extension rule `index`, at `level` when given.
fn result(index: usize, level: Option<&str>) -> String {
    let level = level.map_or(String::new(), |level| format!(r#""level": "{level}", "#));
    format!(r#"{{{level}"rule": {{"index": {index}, "toolComponent": {{"index": 0}}}}}}"#)
}

fn value_error(result: Result<bool, Refusal>) -> String {
    match result {
        Err(Refusal::Value(message)) => message,
        other => panic!("expected a ValueError, found {other:?}"),
    }
}

#[test]
fn exact_successful_producers_pass() {
    assert_eq!(Site::new().evaluate(), Ok(true));
}

#[test]
fn a_codeql_check_run_neither_authorises_nor_blocks_publication() {
    // A pull request whose head is this commit gets a CodeQL check run on it, which
    // compares with that pull request's base, not main. It is never read.
    let mut site = Site::new();
    let mut check_reads = 0;
    let result = evaluate(REPO, &commit(), &mut |e, p| {
        if e.contains("check-runs") {
            check_reads += 1;
        }
        Ok(site.fetch(e, p))
    });
    assert_eq!((result, check_reads), (Ok(true), 0));
    site.runs = vec![site.run.clone()];
    assert_eq!(site.evaluate(), Ok(false));
}

#[test]
fn unsuccessful_or_unfinished_results_fail_or_wait() {
    for conclusion in ["failure", "cancelled", "skipped", "neutral"] {
        let mut site = Site::new();
        site.jobs = vec![with(&site.job, &[("conclusion", s(conclusion))])];
        assert!(matches!(site.evaluate(), Err(Refusal::Value(_))));
    }
    let mut site = Site::new();
    site.runs = vec![
        site.run.clone(),
        with(&site.analysis, &[("status", s("in_progress"))]),
    ];
    assert_eq!(site.evaluate(), Ok(false));
}

#[test]
fn old_success_cannot_hide_another_failed_audit() {
    let mut site = Site::new();
    site.runs.push(with(&site.run, &[("id", n(4))]));
    let failed = page(
        "jobs",
        &[with(
            &site.job,
            &[("id", n(5)), ("conclusion", s("failure"))],
        )],
    );
    let result = evaluate(REPO, &commit(), &mut |e, p| {
        Ok(if e.contains("/runs/4/jobs") {
            failed.clone()
        } else {
            site.fetch(e, p)
        })
    });
    assert!(value_error(result).contains("did not succeed"));
}

#[test]
fn untrusted_runs_do_not_supply_a_missing_main_audit() {
    let mut site = Site::new();
    for change in [
        ("event", s("pull_request_target")),
        ("head_sha", s(&"b".repeat(40))),
        ("head_branch", s("feature")),
        ("path", s(".github/workflows/other.yml")),
        ("head_repository", json(r#"{"full_name": "someone/fork"}"#)),
    ] {
        site.runs = vec![with(&site.run, &[change]), site.analysis.clone()];
        assert_eq!(site.evaluate(), Ok(false));
    }
}

#[test]
fn ambiguous_and_missing_completed_jobs_fail() {
    let mut site = Site::new();
    site.jobs.push(with(&site.job, &[("id", n(4))]));
    assert!(value_error(site.evaluate()).contains("Ambiguous"));
    site.jobs = vec![];
    assert!(value_error(site.evaluate()).contains("without"));
    site.runs = vec![
        with(&site.run, &[("status", s("in_progress"))]),
        site.analysis.clone(),
    ];
    assert_eq!(site.evaluate(), Ok(false));
}

#[test]
fn stale_main_fails() {
    let mut site = Site::new();
    site.main = "b".repeat(40);
    assert!(value_error(site.evaluate()).contains("no longer main"));
}

#[test]
fn main_moving_during_verification_refuses_success() {
    let site = RefCell::new(Site::new());
    let mut reads = Vec::new();
    let result = evaluate(REPO, &commit(), &mut |e, p| {
        reads.push(e.to_owned());
        let result = site.borrow().fetch(e, p);
        if e.contains("/jobs?") {
            site.borrow_mut().main = "b".repeat(40);
        }
        Ok(result)
    });
    assert!(value_error(result).contains("no longer main"));
    assert_eq!(
        reads.last().unwrap(),
        &format!("repos/{REPO}/git/ref/heads/main")
    );
}

#[test]
fn final_main_read_must_be_readable() {
    for response in [
        "null",
        "{}",
        r#"{"object": null}"#,
        r#"{"object": {"sha": null}}"#,
    ] {
        let site = Site::new();
        let mut main_reads = 0;
        let result = evaluate(REPO, &commit(), &mut |e, p| {
            if e.ends_with("heads/main") {
                main_reads += 1;
                if main_reads == 2 {
                    return Ok(json(response));
                }
            }
            Ok(site.fetch(e, p))
        });
        assert!(matches!(result, Err(Refusal::Value(_))), "{response}");
        assert_eq!(main_reads, 2, "{response}");
    }
}

#[test]
fn incomplete_results_do_not_take_a_final_main_read() {
    let mut site = Site::new();
    site.runs = vec![site.run.clone()];
    let mut main_reads = 0;
    let result = evaluate(REPO, &commit(), &mut |e, p| {
        if e.ends_with("heads/main") {
            main_reads += 1;
        }
        Ok(site.fetch(e, p))
    });
    assert_eq!(result, Ok(false));
    assert_eq!(main_reads, 1);
}

#[test]
fn nullable_unrelated_workflow_does_not_block_the_audit() {
    let mut site = Site::new();
    site.runs.push(with(
        &site.run,
        &[
            ("id", n(4)),
            ("path", s("other.yml")),
            ("head_branch", Json::Null),
        ],
    ));
    assert_eq!(site.evaluate(), Ok(true));
}

fn listing(ids: &[i64]) -> Json {
    Json::Array(
        ids.iter()
            .map(|id| {
                Json::Object(vec![
                    (
                        "jobs".into(),
                        Json::Array(vec![Json::Object(vec![("id".into(), n(*id))])]),
                    ),
                    ("total_count".into(), n(ids.len() as i64)),
                ])
            })
            .collect(),
    )
}

fn sequence(responses: Vec<Json>) -> impl FnMut(&str, bool) -> Result<Json, Refusal> {
    let mut queue: VecDeque<Json> = responses.into();
    move |_, _| Ok(queue.pop_front().expect("another response"))
}

#[test]
fn moving_complete_pages_must_stabilise_before_use() {
    let mut fetch = sequence(vec![listing(&[1, 2]), listing(&[2, 3]), listing(&[2, 3])]);
    let ids: Vec<Json> = stable_items(&mut fetch, "endpoint", "jobs")
        .unwrap()
        .iter()
        .map(|item| item.get("id").unwrap().clone())
        .collect();
    assert!(Json::Array(ids).py_eq(&json("[2, 3]")));
    let mut fetch = sequence((0..4).map(|n| listing(&[n, n + 1])).collect());
    assert_eq!(
        stable_items(&mut fetch, "endpoint", "jobs").unwrap_err(),
        Refusal::Value("API listing did not stabilise".into())
    );
}

#[test]
fn stable_identity_returns_new_failed_result() {
    let site = Site::new();
    let mut fetch = sequence(vec![
        page("jobs", std::slice::from_ref(&site.job)),
        page("jobs", &[with(&site.job, &[("conclusion", s("failure"))])]),
    ]);
    let jobs = stable_items(&mut fetch, "endpoint", "jobs").unwrap();
    assert_eq!(jobs[0].get("conclusion"), Some(&s("failure")));
}

struct FakeClock {
    times: VecDeque<f64>,
    sleeps: Vec<f64>,
}

impl Clock for FakeClock {
    fn monotonic(&mut self) -> f64 {
        self.times.pop_front().expect("another reading")
    }

    fn sleep(&mut self, seconds: f64) {
        self.sleeps.push(seconds);
    }
}

fn args(extra: &[&str]) -> Vec<String> {
    let c = commit();
    let mut all = vec!["--repository", REPO, "--commit", &c];
    all.extend_from_slice(extra);
    all.into_iter().map(str::to_owned).collect()
}

#[test]
fn bounded_wait_allows_delayed_results_and_refuses_expiry() {
    let mut results = VecDeque::from([false, true]);
    let mut clock = FakeClock {
        times: VecDeque::from([0.0, 1.0, 2.0]),
        sleeps: vec![],
    };
    let code = main_with(
        &args(&["--wait-seconds", "600"]),
        &mut |_, _| Ok(results.pop_front().unwrap()),
        &mut clock,
    );
    assert_eq!(code, 0);
    assert_eq!(clock.sleeps, vec![15.0]);
    let mut clock = FakeClock {
        times: VecDeque::from([0.0, 600.0]),
        sleeps: vec![],
    };
    let code = main_with(
        &args(&["--wait-seconds", "600"]),
        &mut |_, _| Ok(false),
        &mut clock,
    );
    assert_eq!(code, 1);
}

/// API failures and JSON errors report a fixed message, never the response text.
#[test]
fn api_failures_do_not_reveal_response_text() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .args([
            "check_publication",
            "--repository",
            REPO,
            "--commit",
            &commit(),
        ])
        .env("PATH", "")
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(
        String::from_utf8_lossy(&output.stderr).trim_end(),
        "External verification could not complete"
    );
    let mut clock = FakeClock {
        times: VecDeque::from([0.0]),
        sleeps: vec![],
    };
    assert_eq!(
        main_with(&args(&[]), &mut |_, _| Err(Refusal::External), &mut clock),
        1
    );
}

#[test]
fn malformed_records_and_incomplete_pagination_fail() {
    for bad in [
        "[]",
        "[null]",
        r#"[{"jobs": [], "total_count": null}]"#,
        r#"[{"jobs": [null], "total_count": 1}]"#,
        r#"[{"jobs": [{"id": 1}], "total_count": 2}]"#,
        r#"[{"jobs": [{"id": 1}, {"id": 1}], "total_count": 2}]"#,
        r#"[{"jobs": [], "total_count": 1}, {"jobs": [], "total_count": 2}]"#,
        r#"[{"jobs": [{"id": true}], "total_count": 1}]"#,
        r#"[{"jobs": [], "total_count": false}]"#,
    ] {
        assert!(items(&json(bad), "jobs").is_err(), "{bad}");
    }
}

/// Fuzzing never runs on pull requests, and a fuzz finding after merge must not hold
/// back an unrelated deployment. `publication` runs after the aggregate, on main
/// pushes only. check_gates.py stays Python (shared with other repositories), so its
/// run needs a Python interpreter; without one only the workflow text is checked.
#[test]
fn only_deploy_fuzzing_and_publication_are_exempt_from_the_actual_aggregate() {
    let repository = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let workflow =
        std::fs::read_to_string(repository.join(".github/workflows/checks.yml")).unwrap();
    assert!(
        workflow.contains("checks-gates --exempt deploy --exempt fuzzing --exempt publication\n")
    );
    let python = if cfg!(windows) { "python" } else { "python3" };
    if std::process::Command::new(python)
        .arg("--version")
        .output()
        .is_err()
    {
        eprintln!("skipped: no Python for .github/ci/check_gates.py");
        return;
    }
    let root = tempfile::tempdir().unwrap();
    let workflows = root.path().join(".github/workflows");
    std::fs::create_dir_all(&workflows).unwrap();
    let path = workflows.join("checks.yml");
    std::fs::write(&path, &workflow).unwrap();
    let results = r#"{"coal-lsl-service": {"result": "success"}, "lint": {"result": "success"}, "tools": {"result": "success"}, "rust-windows": {"result": "success"}, "checks": {"result": "success"}, "browser": {"result": "success"}, "lighthouse": {"result": "success"}}"#;
    // As the Python test did, only these variables pass through: in a pull request's
    // CI, GITHUB_EVENT_NAME would make the gate compare against Git history that this
    // temporary folder does not have.
    let kept: Vec<(String, String)> = ["PATH", "SYSTEMROOT", "TEMP", "TMP"]
        .iter()
        .filter_map(|key| {
            std::env::var(key)
                .ok()
                .map(|value| ((*key).to_owned(), value))
        })
        .collect();
    let gate = || {
        std::process::Command::new(python)
            .env_clear()
            .envs(kept.iter().cloned())
            .arg(repository.join(".github/ci/check_gates.py"))
            .args([
                ".github/workflows/checks.yml",
                "checks-gates",
                "--exempt",
                "deploy",
                "--exempt",
                "fuzzing",
                "--exempt",
                "publication",
            ])
            .current_dir(root.path())
            .env("RESULTS", results)
            .output()
            .unwrap()
            .status
            .code()
    };
    assert_eq!(gate(), Some(0));
    std::fs::write(
        &path,
        workflow + "\n  forgotten-check:\n    runs-on: ubuntu-latest\n",
    )
    .unwrap();
    assert_ne!(gate(), Some(0));
}

/// Variables the fixture's Git and gate runs see: the system essentials plus an empty
/// home and no global Git configuration, as a pull request's CI run.
fn fixture_env(home: &Path) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = ["PATH", "SYSTEMROOT", "TEMP", "TMP"]
        .iter()
        .filter_map(|key| {
            std::env::var(key)
                .ok()
                .map(|value| ((*key).to_owned(), value))
        })
        .collect();
    let home = home.to_string_lossy().into_owned();
    let null = if cfg!(windows) { "NUL" } else { "/dev/null" };
    env.extend(
        [
            ("HOME", home.as_str()),
            ("USERPROFILE", home.as_str()),
            ("GIT_CONFIG_NOSYSTEM", "1"),
            ("GIT_CONFIG_GLOBAL", null),
            ("GITHUB_EVENT_NAME", "pull_request"),
            ("RESULTS", "{}"),
        ]
        .map(|(key, value)| (key.to_owned(), value.to_owned())),
    );
    env
}

fn fixture_git(repo: &Path, env: &[(String, String)], args: &[&str]) {
    let status = std::process::Command::new("git")
        .env_clear()
        .envs(env.iter().cloned())
        .args([
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "-c",
            "commit.gpgsign=false",
        ])
        .args(args)
        .current_dir(repo)
        .status()
        .unwrap();
    assert!(status.success(), "git {args:?} failed");
}

/// Builds a merge commit whose first parent holds `workflow` as checks.yml and whose
/// second parent renames it to renamed.yml with only a `replacement` job left.
fn renamed_workflow_merge(repo: &Path, env: &[(String, String)], workflow: &str) {
    let workflows = repo.join(".github/workflows");
    std::fs::create_dir_all(&workflows).unwrap();
    let git = |args: &[&str]| fixture_git(repo, env, args);
    git(&["init", "--quiet", "--initial-branch=main"]);
    std::fs::write(workflows.join("checks.yml"), workflow).unwrap();
    git(&["add", "--all"]);
    git(&["commit", "--quiet", "-m", "Base fixture"]);
    git(&["checkout", "--quiet", "-b", "change"]);
    std::fs::remove_file(workflows.join("checks.yml")).unwrap();
    std::fs::write(
        workflows.join("renamed.yml"),
        "name: Checks\n\non: pull_request\n\njobs:\n  replacement:\n    name: checks-gates\n    runs-on: ubuntu-latest\n    steps: [{run: 'true'}]\n",
    )
    .unwrap();
    git(&["add", "--all"]);
    git(&["commit", "--quiet", "-m", "Rename fixture"]);
    git(&["checkout", "--quiet", "main"]);
    std::fs::write(repo.join(".github/control.txt"), "base advances\n").unwrap();
    git(&["add", "--all"]);
    git(&["commit", "--quiet", "-m", "Advance base fixture"]);
    git(&[
        "merge",
        "--quiet",
        "--no-ff",
        "change",
        "-m",
        "Merge fixture",
    ]);
}

/// A pull request that renames checks.yml and keeps the checks-gates context must
/// still account for the jobs the old file's gate required. The gate reads the base
/// copy from the merge commit's first parent, so this builds one in a real Git
/// repository.
#[test]
fn a_renamed_workflow_cannot_drop_the_jobs_its_gate_required() {
    let repository = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let workflow =
        std::fs::read_to_string(repository.join(".github/workflows/checks.yml")).unwrap();
    let python = if cfg!(windows) { "python" } else { "python3" };
    let available = |program: &str| {
        std::process::Command::new(program)
            .arg("--version")
            .output()
            .is_ok()
    };
    if !available(python) || !available("git") {
        // CI installs both, so a missing one there is a broken runner, not a skip.
        assert!(
            std::env::var_os("CI").is_none(),
            "the rename check needs Python and Git"
        );
        eprintln!("skipped: the rename check needs Python and Git");
        return;
    }
    let root = tempfile::tempdir().unwrap();
    let repo = root.path().join("repo");
    let env = fixture_env(root.path());
    renamed_workflow_merge(&repo, &env, &workflow);
    let output = std::process::Command::new(python)
        .env_clear()
        .envs(env.iter().cloned())
        .arg(repository.join(".github/ci/check_gates.py"))
        .args([".github/workflows/renamed.yml", "replacement"])
        .current_dir(&repo)
        .output()
        .unwrap();
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(output.status.code(), Some(1), "{stderr}");
    assert!(stderr.contains("These jobs were removed"), "{stderr}");
    assert!(stderr.contains("lint"), "{stderr}");
}

#[test]
fn a_main_analysis_without_failing_alerts_authorises_publication() {
    let (mut site, _) = analysed_main();
    assert_eq!(site.evaluate(), Ok(true));
    // Below the pull request check's default threshold.
    site.alerts = Json::Array(vec![Json::Array(vec![
        alert(r#"{"severity": "warning", "security_severity_level": "medium"}"#),
        alert(r#"{"severity": null, "security_severity_level": null}"#),
        alert(r#"{"severity": "note"}"#),
    ])]);
    assert_eq!(site.evaluate(), Ok(true));
}

#[test]
fn an_open_alert_the_pull_request_check_fails_on_refuses_publication() {
    let (mut site, _) = analysed_main();
    for rule in [
        r#"{"severity": "error", "security_severity_level": null}"#,
        r#"{"severity": "warning", "security_severity_level": "high"}"#,
        r#"{"severity": "warning", "security_severity_level": "critical"}"#,
    ] {
        site.alerts = Json::Array(vec![
            Json::Array(vec![alert(r#"{"severity": "note"}"#)]),
            Json::Array(vec![alert(rule)]),
        ]);
        assert_eq!(
            value_error(site.evaluate()),
            "Main has an open CodeQL alert the pull request check would fail on"
        );
    }
}

#[test]
fn an_unreadable_alert_listing_refuses_publication() {
    let (mut site, _) = analysed_main();
    for (alerts, message) in [
        (
            json(r#"{"message": "Not Found"}"#),
            "Unreadable alert listing",
        ),
        (json(r#"[{"number": 1}]"#), "Unreadable alert listing"),
        (json("[]"), "Unreadable alert listing"),
        (json("[[1]]"), "Unreadable alert listing"),
        (json(r#"[[{"number": 1}]]"#), "Unreadable alert rule"),
        (
            json(r#"[[{"number": 1, "rule": {}}]]"#),
            "Unreadable alert rule",
        ),
        (
            json(r#"[[{"number": 1, "rule": {"severity": 3}}]]"#),
            "Unreadable alert rule",
        ),
        (
            json(
                r#"[[{"number": 1, "rule": {"severity": "note", "security_severity_level": 9}}]]"#,
            ),
            "Unreadable alert rule",
        ),
        (
            json(r#"[[{"number": 1, "rule": "error"}]]"#),
            "Unreadable alert rule",
        ),
    ] {
        site.alerts = alerts;
        assert_eq!(value_error(site.evaluate()), message);
    }
}

#[test]
fn an_unfinished_main_analysis_waits_and_a_failed_one_refuses() {
    let (mut site, analysis) = analysed_main();
    site.runs = vec![
        site.run.clone(),
        with(
            &analysis,
            &[("status", s("in_progress")), ("conclusion", Json::Null)],
        ),
    ];
    assert_eq!(site.evaluate(), Ok(false));
    for conclusion in ["failure", "cancelled", "skipped"] {
        site.runs = vec![
            site.run.clone(),
            with(&analysis, &[("id", n(5)), ("conclusion", s(conclusion))]),
            analysis.clone(),
        ];
        assert_eq!(
            value_error(site.evaluate()),
            "CodeQL analysis of main did not succeed"
        );
    }
}

#[test]
fn untrusted_analyses_do_not_stand_in_for_the_codeql_check() {
    let (mut site, analysis) = analysed_main();
    let fork = json(r#"{"full_name": "someone/site"}"#);
    for changes in [
        vec![("event", s("pull_request"))],
        vec![("event", s("push"))],
        vec![("head_branch", s("feature"))],
        vec![("head_sha", s(&"b".repeat(40)))],
        vec![("head_repository", fork.clone())],
        vec![("repository", fork.clone())],
        vec![("path", s(".github/workflows/codeql.yml"))],
    ] {
        site.runs = vec![site.run.clone(), with(&analysis, &changes)];
        assert_eq!(site.evaluate(), Ok(false), "{changes:?}");
    }
}

#[test]
fn a_main_analysis_still_needs_the_attribution_audit() {
    let (mut site, analysis) = analysed_main();
    site.runs = vec![analysis];
    assert_eq!(site.evaluate(), Ok(false));
}

#[test]
fn main_results_wait_for_this_commits_analysis_and_a_settled_alert_listing() {
    let (mut site, _) = analysed_main();
    site.analyses = Json::Array(vec![with(
        &uploaded("python", "2026-11-16T00:02:30Z"),
        &[("commit_sha", s(&"b".repeat(40)))],
    )]);
    assert_eq!(site.evaluate(), Ok(false));
    site.analyses = json("[]");
    assert_eq!(site.evaluate(), Ok(false));
    for listing in [r#"{"message": "Not Found"}"#, "[1]", "[[]]"] {
        site.analyses = json(listing);
        assert_eq!(
            value_error(site.evaluate()),
            "Unreadable analysis listing",
            "{listing}"
        );
    }

    let (mut site, _) = analysed_main();
    site.alerts_later = Some(Json::Array(vec![Json::Array(vec![with(
        &alert(r#"{"severity": "note"}"#),
        &[("number", n(2))],
    )])]));
    assert_eq!(site.evaluate(), Ok(false));
}

#[test]
fn only_an_analysis_each_job_uploaded_whilst_it_ran_counts() {
    // Uploaded before the job started (an earlier attempt), in the same second it
    // started, or after it finished.
    for created in [
        "2026-11-15T23:59:59Z",
        "2026-11-16T00:00:05Z",
        "2026-11-16T00:03:01Z",
    ] {
        let (mut site, _) = analysed_main();
        site.analyses = Json::Array(vec![uploaded("python", created)]);
        assert_eq!(site.evaluate(), Ok(false), "{created}");
    }
    let (mut site, _) = analysed_main();
    site.analyses = Json::Array(vec![uploaded("python", "2026-11-16T00:03:00Z")]);
    assert_eq!(site.evaluate(), Ok(true));
    // Every language the run analysed needs its own analysis.
    let mut ruby = analysis_job("ruby");
    ruby = with(&ruby, &[("id", n(8))]);
    site.analysis_jobs.push(ruby);
    assert_eq!(site.evaluate(), Ok(false));
    site.analyses = Json::Array(vec![
        uploaded("python", "2026-11-16T00:02:30Z"),
        uploaded("ruby", "2026-11-16T00:02:40Z"),
    ]);
    assert_eq!(site.evaluate(), Ok(true));
}

#[test]
fn alerts_are_read_only_once_code_scanning_has_processed_each_upload() {
    let (mut site, _) = analysed_main();
    site.upload = "pending";
    assert_eq!(site.evaluate(), Ok(false));
    assert_eq!(site.alert_reads.get(), 0);
    site.upload = "failed";
    assert_eq!(
        value_error(site.evaluate()),
        "Code scanning could not process main's CodeQL results"
    );
    site.upload = "unknown";
    assert_eq!(value_error(site.evaluate()), "Unreadable analysis upload");
    let (mut site, _) = analysed_main();
    site.analyses = Json::Array(vec![with(
        &uploaded("python", "2026-11-16T00:02:30Z"),
        &[("sarif_id", s("../alerts"))],
    )]);
    assert_eq!(value_error(site.evaluate()), "Unreadable analysis upload");
}

#[test]
fn analysis_jobs_must_be_readable_and_present() {
    let (mut site, _) = analysed_main();
    site.analysis_jobs = vec![with(
        &analysis_job("python"),
        &[("completed_at", Json::Null)],
    )];
    assert_eq!(value_error(site.evaluate()), "Unreadable analysis job");
    site.analysis_jobs = vec![with(&analysis_job("python"), &[("name", s("Upload"))])];
    assert_eq!(
        value_error(site.evaluate()),
        "CodeQL analysis of main has no Analyze job"
    );
}

#[test]
fn an_alert_whose_level_changes_between_reads_waits() {
    let (mut site, _) = analysed_main();
    site.alerts = Json::Array(vec![Json::Array(vec![alert(r#"{"severity": "warning"}"#)])]);
    site.alerts_later = Some(Json::Array(vec![Json::Array(vec![alert(
        r#"{"severity": "error"}"#,
    )])]));
    assert_eq!(site.evaluate(), Ok(false));
}

#[test]
fn overlapping_analysis_runs_cannot_share_one_upload() {
    let (mut site, analysis) = analysed_main();
    site.runs = vec![
        site.run.clone(),
        analysis.clone(),
        with(&analysis, &[("id", n(5))]),
    ];
    assert_eq!(site.evaluate(), Ok(false));
    site.analyses = Json::Array(vec![
        with(
            &uploaded("python", "2026-11-16T00:02:40Z"),
            &[("id", n(200))],
        ),
        uploaded("python", "2026-11-16T00:02:30Z"),
    ]);
    assert_eq!(site.evaluate(), Ok(true));
}

#[test]
fn analyses_are_read_page_by_page_until_found_or_older_than_the_jobs() {
    // Newer analyses of other commits fill the first page.
    let (mut site, _) = analysed_main();
    let other = with(
        &uploaded("python", "2026-11-16T00:02:59Z"),
        &[("id", n(300)), ("commit_sha", s(&"b".repeat(40)))],
    );
    site.analyses = Json::Array(vec![other.clone()]);
    site.older_analyses = Json::Array(vec![uploaded("python", "2026-11-16T00:02:30Z")]);
    assert_eq!(site.evaluate(), Ok(true));
    // Read on to the empty third page, as further uploads in a job's window count too.
    assert_eq!(site.analysis_reads.get(), 3);
    // A page ending before the earliest job started ends the search.
    let (mut site, _) = analysed_main();
    site.analyses = Json::Array(vec![with(
        &other,
        &[("created_at", s("2026-11-16T00:00:04Z"))],
    )]);
    site.older_analyses = Json::Array(vec![uploaded("python", "2026-11-16T00:02:30Z")]);
    assert_eq!(site.evaluate(), Ok(false));
    assert_eq!(site.analysis_reads.get(), 1);
}

#[test]
fn an_upload_with_a_result_at_the_threshold_refuses_publication() {
    let refused = "Main's CodeQL analysis has a result the pull request check would fail on";
    for results in [
        format!("[{}]", result(0, None)),
        format!("[{}]", result(1, None)),
        format!("[{}]", result(2, Some("error"))),
        format!("[{}, {}]", result(2, None), result(1, Some("note"))),
        r#"[{"ruleIndex": 0, "level": "error"}]"#.to_owned(),
        r#"[{"rule": {"index": 0}, "level": "error"}]"#.to_owned(),
    ] {
        let (mut site, _) = analysed_main();
        site.sarifs = vec![("106".to_owned(), sarif(&results))];
        assert_eq!(value_error(site.evaluate()), refused, "{results}");
    }
    // Below the threshold, and a rule without a security severity.
    let (mut site, _) = analysed_main();
    site.sarifs = vec![(
        "106".to_owned(),
        sarif(&format!(
            r#"[{}, {}, {}, {{"ruleIndex": 0}}]"#,
            result(2, None),
            result(2, Some("note")),
            result(0, Some("warning"))
        )),
    )];
    assert_eq!(site.evaluate(), Ok(true));
}

#[test]
fn each_overlapping_upload_has_its_own_results_checked() {
    // A later upload in the same category replaces the earlier one's alerts, so the
    // alert listing shows nothing; the earlier upload's own results still refuse.
    let (mut site, analysis) = analysed_main();
    site.runs = vec![
        site.run.clone(),
        analysis.clone(),
        with(&analysis, &[("id", n(5))]),
    ];
    site.analyses = Json::Array(vec![
        with(
            &uploaded("python", "2026-11-16T00:02:40Z"),
            &[("id", n(200))],
        ),
        uploaded("python", "2026-11-16T00:02:30Z"),
    ]);
    site.sarifs = vec![("106".to_owned(), sarif(&format!("[{}]", result(1, None))))];
    assert_eq!(
        value_error(site.evaluate()),
        "Main's CodeQL analysis has a result the pull request check would fail on"
    );
}

#[test]
fn unreadable_analysis_results_refuse_publication() {
    let unknown_rule = format!("[{}]", result(3, None));
    let mut logs: Vec<Json> = [
        r#"{"message": "Not Found"}"#,
        r#"{"runs": [{"tool": {}}]}"#,
        r#"{"runs": [{"tool": {}, "results": [{"ruleIndex": 0}]}]}"#,
    ]
    .into_iter()
    .map(json)
    .collect();
    logs.push(sarif(&unknown_rule));
    logs.push(sarif(
        r#"[{"rule": {"index": 0, "toolComponent": {"index": 1}}}]"#,
    ));
    logs.push(sarif(r#"[{"level": "error"}]"#));
    for score in [r#""high""#, "7"] {
        logs.push(json(&format!(
            r#"{{"runs": [{{"tool": {{"driver": {{"rules": [{{"properties": {{"security-severity": {score}}}}}]}}}}, "results": [{{"ruleIndex": 0}}]}}]}}"#
        )));
    }
    for log in logs {
        let (mut site, _) = analysed_main();
        site.sarifs = vec![("106".to_owned(), log.clone())];
        assert_eq!(
            value_error(site.evaluate()),
            "Unreadable analysis results",
            "{log:?}"
        );
    }
}

#[test]
fn every_upload_in_a_jobs_window_has_its_results_checked() {
    // One job, 2 uploads whilst it ran: the newer is benign and replaces the older's
    // alerts; the older's own results still refuse.
    let (mut site, _) = analysed_main();
    site.analyses = Json::Array(vec![
        uploaded("python", "2026-11-16T00:02:40Z"),
        with(
            &uploaded("python", "2026-11-16T00:02:30Z"),
            &[("id", n(200))],
        ),
    ]);
    assert_eq!(site.evaluate(), Ok(true));
    site.sarifs = vec![("200".to_owned(), sarif(&format!("[{}]", result(1, None))))];
    assert_eq!(
        value_error(site.evaluate()),
        "Main's CodeQL analysis has a result the pull request check would fail on"
    );
}

#[test]
fn an_upload_in_the_second_a_job_started_is_checked_but_not_its_own() {
    // At second resolution an upload stamped with the job's start second may be the
    // job's or an earlier attempt's; its results count, but it cannot be the job's.
    let (mut site, _) = analysed_main();
    let at_start = with(
        &uploaded("python", "2026-11-16T00:00:05Z"),
        &[("id", n(200))],
    );
    site.analyses = Json::Array(vec![at_start.clone()]);
    assert_eq!(site.evaluate(), Ok(false));
    site.analyses = Json::Array(vec![uploaded("python", "2026-11-16T00:02:40Z"), at_start]);
    assert_eq!(site.evaluate(), Ok(true));
    site.sarifs = vec![("200".to_owned(), sarif(&format!("[{}]", result(1, None))))];
    assert_eq!(
        value_error(site.evaluate()),
        "Main's CodeQL analysis has a result the pull request check would fail on"
    );
}

#[test]
fn analysis_times_must_be_utc_seconds() {
    for time in [
        Json::Null,
        s(""),
        s("2026-11-16 00:00:05"),
        s("2026-11-16T00:00:05.5Z"),
        s("2026-11-16T99:99:99Z"),
        s("2026-02-30T00:00:05Z"),
    ] {
        let (mut site, _) = analysed_main();
        site.analysis_jobs = vec![with(
            &analysis_job("python"),
            &[("started_at", time.clone())],
        )];
        assert_eq!(
            value_error(site.evaluate()),
            "Unreadable analysis job",
            "{time:?}"
        );
        // An analysis without a readable creation time could end the paging early.
        let (mut site, _) = analysed_main();
        site.analyses = Json::Array(vec![
            uploaded("python", "2026-11-16T00:02:40Z"),
            with(
                &uploaded("ruby", "2026-11-16T00:02:35Z"),
                &[("created_at", time.clone())],
            ),
        ]);
        site.older_analyses = Json::Array(vec![with(
            &uploaded("python", "2026-11-16T00:02:30Z"),
            &[("id", n(200))],
        )]);
        assert_eq!(
            value_error(site.evaluate()),
            "Unreadable analysis listing",
            "{time:?}"
        );
    }
}
