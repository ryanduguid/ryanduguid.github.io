//! scripts/test_check_publication.py: publication refusals using fabricated GitHub results.
use site_tools::check_publication::{
    AUDIT_JOB, AUDIT_WORKFLOW, Clock, Refusal, evaluate, items, main_with, stable_items,
};
use site_tools::pyjson::{self, Json};
use std::cell::RefCell;
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
    check: Json,
    run: Json,
    job: Json,
    main: String,
    checks: Vec<Json>,
    runs: Vec<Json>,
    jobs: Vec<Json>,
}

impl Site {
    fn new() -> Self {
        let c = commit();
        let check = json(&format!(
            r#"{{"id": 1, "name": "CodeQL", "app": {{"id": 57789}}, "head_sha": "{c}", "status": "completed", "conclusion": "success"}}"#
        ));
        let run = json(&format!(
            r#"{{"id": 2, "path": "{AUDIT_WORKFLOW}", "event": "push", "head_sha": "{c}", "head_branch": "main", "status": "completed", "repository": {{"full_name": "{REPO}"}}, "head_repository": {{"full_name": "{REPO}"}}}}"#
        ));
        let job = json(&format!(
            r#"{{"id": 3, "name": "{AUDIT_JOB}", "head_sha": "{c}", "status": "completed", "conclusion": "success"}}"#
        ));
        Site {
            checks: vec![check.clone()],
            runs: vec![run.clone()],
            jobs: vec![job.clone()],
            check,
            run,
            job,
            main: c,
        }
    }

    fn fetch(&self, endpoint: &str, paginate: bool) -> Json {
        if endpoint.ends_with("heads/main") {
            assert!(!paginate);
            return json(&format!(r#"{{"object": {{"sha": "{}"}}}}"#, self.main));
        }
        assert!(paginate);
        if endpoint.contains("check-runs") {
            page("check_runs", &self.checks)
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
fn missing_or_analyze_only_codeql_never_authorises_publication() {
    let mut site = Site::new();
    let check = site.check.clone();
    for checks in [
        vec![],
        vec![with(&check, &[("name", s("Analyze (python)"))])],
        vec![with(&check, &[("app", json(r#"{"id": 15368}"#))])],
        vec![with(&check, &[("head_sha", s(&"b".repeat(40)))])],
    ] {
        site.checks = checks;
        assert_eq!(site.evaluate(), Ok(false));
    }
}

#[test]
fn unsuccessful_or_unfinished_results_fail_or_wait() {
    for conclusion in ["failure", "cancelled", "skipped", "neutral"] {
        let mut site = Site::new();
        site.checks = vec![with(&site.check, &[("conclusion", s(conclusion))])];
        assert!(matches!(site.evaluate(), Err(Refusal::Value(_))));
        let mut site = Site::new();
        site.jobs = vec![with(&site.job, &[("conclusion", s(conclusion))])];
        assert!(matches!(site.evaluate(), Err(Refusal::Value(_))));
    }
    let mut site = Site::new();
    site.checks = vec![with(&site.check, &[("status", s("in_progress"))])];
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
        site.runs = vec![with(&site.run, &[change])];
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
    site.runs = vec![with(&site.run, &[("status", s("in_progress"))])];
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
    site.checks = vec![];
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
fn one_success_cannot_hide_failed_codeql_or_unreadable_identity() {
    let mut site = Site::new();
    site.checks.push(with(
        &site.check,
        &[("id", n(4)), ("conclusion", s("failure"))],
    ));
    assert!(matches!(site.evaluate(), Err(Refusal::Value(_))));
    site.checks = vec![
        site.check.clone(),
        with(&site.check, &[("id", n(4)), ("name", Json::Null)]),
    ];
    assert!(matches!(site.evaluate(), Err(Refusal::Value(_))));
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
    let mut site = Site::new();
    site.checks = vec![with(&site.check, &[("app", Json::Null)])];
    assert!(matches!(site.evaluate(), Err(Refusal::Value(_))));
}

/// Fuzzing never runs on pull requests, and a fuzz finding after merge must not hold
/// back an unrelated deployment. check_gates.py stays Python (shared with other
/// repositories), so its run needs a Python interpreter; without one only the
/// workflow text is checked.
#[test]
fn only_deploy_and_fuzzing_are_exempt_from_the_actual_aggregate() {
    let repository = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let workflow =
        std::fs::read_to_string(repository.join(".github/workflows/checks.yml")).unwrap();
    assert!(workflow.contains("checks-gates --exempt deploy --exempt fuzzing\n"));
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
    let results = r#"{"lint": {"result": "success"}, "tools": {"result": "success"}, "rust-windows": {"result": "success"}, "checks": {"result": "success"}, "browser": {"result": "success"}, "lighthouse": {"result": "success"}}"#;
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
