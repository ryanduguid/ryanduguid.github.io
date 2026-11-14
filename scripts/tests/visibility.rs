// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! scripts/test_visibility_benchmark.py: the validator, summariser and command line.
use site_tools::pyjson::{self, Json};
use site_tools::visibility::{
    Named, Prompts, answer_key_sha256, check_capture, check_capture_data, load_capture,
    load_prompts, site_cited_url, summarise, template, validated,
};
use std::path::{Path, PathBuf};
use std::process::Command;

const BRANDED_ID: &str = "P1-identity";
const UNBRANDED_ID: &str = "P4-cash-example";
const FIXTURE_NAME: &str = "fixture-example.json";

fn repository() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn prompts() -> Prompts {
    load_prompts(&repository()).unwrap()
}

fn captures_dir() -> PathBuf {
    repository().join("docs/visibility-benchmark/captures")
}

fn prompt_text(id: &str) -> Json {
    prompts()
        .into_iter()
        .find(|(k, _)| k == id)
        .unwrap()
        .1
        .get("prompt")
        .unwrap()
        .clone()
}

fn json(text: &str) -> Json {
    pyjson::loads(text).unwrap()
}

fn set(value: &mut Json, key: &str, new: Json) {
    let Json::Object(pairs) = value else {
        panic!("not an object")
    };
    match pairs.iter_mut().find(|(k, _)| k == key) {
        Some(slot) => slot.1 = new,
        None => pairs.push((key.to_owned(), new)),
    }
}

fn unset(value: &mut Json, key: &str) {
    if let Json::Object(pairs) = value {
        pairs.retain(|(k, _)| k != key);
    }
}

fn complete_observation(id: &str) -> Json {
    let mut observation = json(
        r#"{"prompt_id": "", "status": "complete", "system": "Test Assistant",
            "model_reported": "not disclosed", "search_enabled": "on", "fresh_session": true,
            "executed_at": "2026-09-18T09:00:00+10:00", "timezone": "Australia/Melbourne",
            "prompt_sent": "", "answer_evidence": "captures/answers/test.txt", "mentioned": true,
            "site_cited": true, "cited_urls": ["https://duguid.com.au/about/"],
            "factual_errors": [], "notes": ""}"#,
    );
    set(&mut observation, "prompt_id", Json::Str(id.into()));
    set(&mut observation, "prompt_sent", prompt_text(id));
    observation
}

fn base_capture() -> Json {
    let mut capture =
        json(r#"{"schema": 1, "fixture": false, "answer_key_sha256": "", "recorded_by": "test"}"#);
    set(
        &mut capture,
        "answer_key_sha256",
        Json::Str(answer_key_sha256(&prompts())),
    );
    set(
        &mut capture,
        "observations",
        Json::Array(vec![complete_observation(BRANDED_ID)]),
    );
    capture
}

fn observation(capture: &mut Json, index: usize) -> &mut Json {
    let Json::Object(pairs) = capture else {
        panic!("capture")
    };
    let Some((_, Json::Array(items))) = pairs.iter_mut().find(|(k, _)| k == "observations") else {
        panic!("observations")
    };
    &mut items[index]
}

fn push_observation(capture: &mut Json, value: Json) {
    let Json::Object(pairs) = capture else {
        panic!("capture")
    };
    if let Some((_, Json::Array(items))) = pairs.iter_mut().find(|(k, _)| k == "observations") {
        items.push(value);
    }
}

fn written(capture: &Json, dir: &Path, name: &str) -> PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, pyjson::dumps(capture, Default::default())).unwrap();
    path
}

fn failures_for(capture: &Json) -> Vec<String> {
    let dir = tempfile::tempdir().unwrap();
    check_capture(&written(capture, dir.path(), "capture.json"), &prompts()).unwrap()
}

fn named(path: PathBuf) -> Named {
    Named {
        shown: path.to_string_lossy().into_owned(),
        path,
    }
}

fn summary_of(captures: &[Json], include_fixtures: bool) -> String {
    let dir = tempfile::tempdir().unwrap();
    let paths: Vec<Named> = captures
        .iter()
        .enumerate()
        .map(|(i, c)| named(written(c, dir.path(), &format!("capture-{i}.json"))))
        .collect();
    let (loaded, failures) = validated(&paths, &prompts()).unwrap();
    assert!(failures.is_empty(), "{failures:?}");
    summarise(&loaded, &prompts(), include_fixtures).unwrap()
}

fn expect(label: &str, failures: &[String], expected: &str) {
    assert!(
        failures.iter().any(|f| f.contains(expected)),
        "{label}: expected {expected:?}, found {failures:?}"
    );
}

fn run_cli(args: &[&str]) -> (Option<i32>, String, String) {
    let output = Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .arg("visibility_benchmark")
        .args(args)
        .current_dir(repository())
        .env_remove("SITE_ROOT")
        .output()
        .unwrap();
    (
        output.status.code(),
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    )
}

fn stored() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = std::fs::read_dir(captures_dir())
        .unwrap()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .collect();
    paths.sort();
    paths
}

/// Every stored capture is valid, and the shipped example is a fixture.
#[test]
fn stored_captures_validate() {
    let paths = stored();
    assert!(!paths.is_empty());
    for path in &paths {
        assert!(
            check_capture(path, &prompts()).unwrap().is_empty(),
            "{path:?}"
        );
    }
    let shipped = load_capture(&captures_dir().join(FIXTURE_NAME)).unwrap();
    assert_eq!(shipped.get("fixture"), Some(&Json::Bool(true)));
}

/// A real, non-fixture round validates and is counted by default.
#[test]
fn a_genuine_capture_needs_no_test_changes() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::copy(
        captures_dir().join(FIXTURE_NAME),
        dir.path().join(FIXTURE_NAME),
    )
    .unwrap();
    let mut genuine = base_capture();
    set(
        &mut genuine,
        "recorded_by",
        Json::Str("an accountant".into()),
    );
    written(&genuine, dir.path(), "2026-09-18-round.json");
    let mut paths: Vec<PathBuf> = std::fs::read_dir(dir.path())
        .unwrap()
        .flatten()
        .map(|e| e.path())
        .collect();
    paths.sort();
    let (loaded, failures) = validated(
        &paths.into_iter().map(named).collect::<Vec<_>>(),
        &prompts(),
    )
    .unwrap();
    assert!(failures.is_empty(), "{failures:?}");
    assert_eq!(loaded.len(), 2);
    let default = summarise(&loaded, &prompts(), false).unwrap();
    assert!(default.contains("Excluded 1 fixture file"));
    assert!(default.contains("mentions:   1/1 completed answers"));
    assert!(!default.contains("Example Assistant"));
    assert!(
        summarise(&loaded, &prompts(), true)
            .unwrap()
            .contains("Example Assistant")
    );
}

/// One completed observation among unrun ones validates and counts once.
#[test]
fn a_partial_round_from_the_template() {
    let mut capture = json(&template(&prompts()).unwrap());
    set(
        &mut capture,
        "recorded_by",
        Json::Str("an accountant".into()),
    );
    let Some(Json::Array(observations)) = capture.get("observations").cloned() else {
        panic!("observations")
    };
    let replaced: Vec<Json> = observations
        .into_iter()
        .map(|o| {
            if o.get("prompt_id") == Some(&Json::Str(BRANDED_ID.into())) {
                complete_observation(BRANDED_ID)
            } else {
                o
            }
        })
        .collect();
    set(&mut capture, "observations", Json::Array(replaced));
    assert!(failures_for(&capture).is_empty());
    let summary = summary_of(&[capture], false);
    for expected in [
        "Test Assistant, branded prompts, search on",
        "mentions:   1/1 completed answers",
        "Test Assistant, branded prompts, search unknown",
        "no completed observations (2 excluded)",
        "Test Assistant, non-branded prompts, search unknown",
        "no completed observations (3 excluded)",
    ] {
        assert!(summary.contains(expected), "{expected}\n{summary}");
    }
    assert!(!summary.contains("unknown, "));
}

#[test]
fn the_template_alone_does_not_validate() {
    let capture = json(&template(&prompts()).unwrap());
    expect(
        "blank template",
        &failures_for(&capture),
        "must name who recorded it",
    );
}

#[test]
fn unknown_ids_and_reworded_prompts_are_reported() {
    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "prompt_id",
        Json::Str("P9-invented".into()),
    );
    expect(
        "unknown prompt",
        &failures_for(&capture),
        "unknown prompt_id",
    );
    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "factual_errors",
        json(r#"["E99-invented"]"#),
    );
    expect(
        "undeclared error",
        &failures_for(&capture),
        "is not declared",
    );
    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "prompt_sent",
        Json::Str("Who is Ryan Duguid?".into()),
    );
    expect(
        "reworded prompt",
        &failures_for(&capture),
        "does not match the reviewed text",
    );
}

#[test]
fn blank_and_missing_text_fields_are_rejected() {
    for field in ["system", "model_reported", "timezone", "answer_evidence"] {
        for value in [
            Json::Null,
            Json::Str(String::new()),
            Json::Str("   ".into()),
        ] {
            let mut capture = base_capture();
            set(observation(&mut capture, 0), field, value);
            expect(
                field,
                &failures_for(&capture),
                &format!("needs a non-empty {field}"),
            );
        }
    }
}

#[test]
fn timestamps_must_be_offset_aware_strings() {
    for (value, expected) in [
        (json(r#""2026-09-18T09:00:00""#), "must carry a UTC offset"),
        (
            json(r#""not a timestamp""#),
            "must be an ISO 8601 timestamp",
        ),
        (json("1789658735"), "must be an ISO 8601 timestamp string"),
        (json("true"), "must be an ISO 8601 timestamp string"),
        (json(r#""""#), "must be an ISO 8601 timestamp string"),
    ] {
        let mut capture = base_capture();
        set(observation(&mut capture, 0), "executed_at", value);
        expect(expected, &failures_for(&capture), expected);
    }
}

/// A string such as "false" must never be counted as a positive.
#[test]
fn boolean_fields_reject_strings() {
    for field in ["mentioned", "site_cited", "fresh_session"] {
        let mut capture = base_capture();
        set(
            observation(&mut capture, 0),
            field,
            Json::Str("false".into()),
        );
        expect(field, &failures_for(&capture), "must be true or false");
    }
    let mut capture = base_capture();
    set(&mut capture, "fixture", Json::Str("false".into()));
    expect("fixture", &failures_for(&capture), "fixture true or false");
}

#[test]
fn schema_and_shape_are_validated() {
    for value in ["true", r#""1""#, "2", "null"] {
        let mut capture = base_capture();
        set(&mut capture, "schema", json(value));
        expect(value, &failures_for(&capture), "schema must be one of");
    }
    let mut capture = base_capture();
    set(&mut capture, "observations", json("[]"));
    expect(
        "empty",
        &failures_for(&capture),
        "non-empty observations list",
    );
    let mut capture = base_capture();
    set(&mut capture, "observations", json("[1]"));
    expect("scalar", &failures_for(&capture), "must be an object");
}

/// Arrays and objects are rejected before any lookup or membership test.
#[test]
fn structured_values_in_identifier_and_enum_fields() {
    for (field, expected) in [
        ("prompt_id", "prompt_id must be a string"),
        ("status", "status must be one of"),
        ("search_enabled", "search_enabled must be one of"),
    ] {
        for value in ["[]", "{}", "7"] {
            let mut capture = base_capture();
            set(observation(&mut capture, 0), field, json(value));
            expect(field, &failures_for(&capture), expected);
        }
    }
    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "factual_errors",
        json(r#"[{"id": "E1-namesake"}]"#),
    );
    expect(
        "structured error id",
        &failures_for(&capture),
        "members must be strings",
    );
    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "factual_errors",
        json(r#""E1-namesake""#),
    );
    expect("text", &failures_for(&capture), "must be a list");
}

#[test]
fn unrun_observations() {
    let mut capture = base_capture();
    *observation(&mut capture, 0) = json(&format!(
        r#"{{"prompt_id": "{BRANDED_ID}", "status": "not_run"}}"#
    ));
    expect(
        "unrun without a reason",
        &failures_for(&capture),
        "needs a reason",
    );
    let mut capture = base_capture();
    *observation(&mut capture, 0) = json(&format!(
        r#"{{"prompt_id": "{BRANDED_ID}", "status": "not_run", "reason": "not attempted in this round"}}"#
    ));
    assert!(failures_for(&capture).is_empty());
    // A test that did not run is excluded, never counted as a failure.
    let mut capture = base_capture();
    push_observation(
        &mut capture,
        json(&format!(
            r#"{{"prompt_id": "{UNBRANDED_ID}", "status": "blocked", "reason": "sign-in required", "system": "Test Assistant"}}"#
        )),
    );
    let summary = summary_of(&[capture], false);
    assert!(summary.contains("mentions:   1/1 completed answers"));
    assert!(summary.contains("no completed observations (1 excluded)"));
}

#[test]
fn fixtures_are_excluded_from_real_summaries() {
    let mut fixture = base_capture();
    set(&mut fixture, "fixture", Json::Bool(true));
    let mut real = base_capture();
    set(observation(&mut real, 0), "site_cited", Json::Bool(false));
    set(observation(&mut real, 0), "cited_urls", json("[]"));
    let excluded = summary_of(&[fixture.clone(), real.clone()], false);
    let included = summary_of(&[fixture, real], true);
    assert!(excluded.contains("citations:  0/1") && excluded.contains("Excluded 1 fixture file"));
    assert!(included.contains("citations:  1/2"));
}

#[test]
fn groups_stay_apart() {
    let mut capture = base_capture();
    let mut unbranded = complete_observation(UNBRANDED_ID);
    set(&mut unbranded, "site_cited", Json::Bool(false));
    set(&mut unbranded, "cited_urls", json("[]"));
    push_observation(&mut capture, unbranded);
    let summary = summary_of(&[capture], false);
    assert!(summary.contains("Test Assistant, branded prompts, search on"));
    assert!(summary.contains("Test Assistant, non-branded prompts, search on"));

    // An answer written without retrieval is not averaged into the same rate.
    let mut capture = base_capture();
    let mut offline = complete_observation(UNBRANDED_ID);
    set(&mut offline, "search_enabled", Json::Str("off".into()));
    set(&mut offline, "site_cited", Json::Bool(false));
    set(&mut offline, "cited_urls", json("[]"));
    push_observation(&mut capture, offline);
    let summary = summary_of(&[capture], false);
    assert!(summary.contains("search on") && summary.contains("search off"));
    assert_eq!(
        summary.matches("citations:  1/1 completed answers").count(),
        1
    );
    assert_eq!(
        summary.matches("citations:  0/1 completed answers").count(),
        1
    );

    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "fresh_session",
        Json::Bool(false),
    );
    let summary = summary_of(&[capture], false);
    assert!(summary.contains("recorded without a fresh session: 1/1"));
    assert!(summary.contains("not comparable with the rest"));
    assert!(!summary_of(&[base_capture()], false).contains("recorded without a fresh session"));
}

/// A malformed capture is a validation message, never a traceback.
#[test]
fn unusable_files_are_reported_not_raised() {
    let dir = tempfile::tempdir().unwrap();
    let cases: [(&str, &[u8]); 5] = [
        ("broken.json", b"{ not json"),
        ("array.json", b"[]"),
        ("null.json", b"null"),
        (
            "scalar-observation.json",
            br#"{"schema":1,"fixture":false,"recorded_by":"t","observations":[1]}"#,
        ),
        ("not-utf8.json", b"{\"recorded_by\": \"\xff\xfe invalid\"}"),
    ];
    for (name, payload) in cases {
        let path = dir.path().join(name);
        std::fs::write(&path, payload).unwrap();
        let failures = check_capture(&path, &prompts()).unwrap();
        assert!(!failures.is_empty(), "{name}");
        assert!(failures.iter().all(|f| f.contains(name)), "{failures:?}");
    }
    let mut paths: Vec<PathBuf> = std::fs::read_dir(dir.path())
        .unwrap()
        .flatten()
        .map(|e| e.path())
        .collect();
    paths.sort();
    let (loaded, failures) = validated(
        &paths.into_iter().map(named).collect::<Vec<_>>(),
        &prompts(),
    )
    .unwrap();
    assert!(loaded.is_empty() && failures.len() >= cases.len());
}

#[test]
fn site_citation_policy() {
    for url in [
        "https://duguid.com.au/about/",
        "https://www.duguid.com.au/about/",
        "http://duguid.com.au/",
        "https://duguid.com.au:8443/about/",
    ] {
        assert!(site_cited_url(Some(&Json::Str(url.into()))), "{url}");
    }
    for candidate in [
        r#""https://duguid.com.au.example.org/about/""#,
        r#""https://example.org/?q=duguid.com.au""#,
        r#""https://notduguid.com.au/about/""#,
        r#""https://duguid.com.au:not-a-port/""#,
        r#""https://[duguid.com.au/""#,
        r#""ftp://duguid.com.au/file""#,
        r#""duguid.com.au/about/""#,
        "null",
        "17",
    ] {
        assert!(!site_cited_url(Some(&json(candidate))), "{candidate}");
    }
}

#[test]
fn citations_are_checked() {
    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "cited_urls",
        json(r#"["https://duguid.com.au/about/", "https://[duguid.com.au/"]"#),
    );
    expect(
        "trailing",
        &failures_for(&capture),
        "cited_urls[2] is not a usable http or https URL",
    );
    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "cited_urls",
        json(r#"["https://duguid.com.au/about/", 42]"#),
    );
    expect("non-string", &failures_for(&capture), "cited_urls[2]");
    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "site_cited",
        Json::Bool(false),
    );
    set(
        observation(&mut capture, 0),
        "cited_urls",
        json(r#"["https://example.org/page"]"#),
    );
    assert!(failures_for(&capture).is_empty());

    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "cited_urls",
        json(r#"["https://example.org/page"]"#),
    );
    expect(
        "flag without a site URL",
        &failures_for(&capture),
        "no cited URL is on",
    );
    let mut capture = base_capture();
    set(
        observation(&mut capture, 0),
        "site_cited",
        Json::Bool(false),
    );
    expect(
        "site URL without the flag",
        &failures_for(&capture),
        "but site_cited is false",
    );
    let mut capture = base_capture();
    set(observation(&mut capture, 0), "mentioned", Json::Bool(false));
    expect(
        "citation without a mention",
        &failures_for(&capture),
        "also mentions it",
    );
}

/// A summary never reports metrics from a capture that failed validation.
#[test]
fn cli_rejects_invalid_input_before_summarising() {
    let dir = tempfile::tempdir().unwrap();
    let good = written(&base_capture(), dir.path(), "good.json");
    let mut reworded = base_capture();
    set(
        observation(&mut reworded, 0),
        "prompt_sent",
        Json::Str("Who is Ryan Duguid?".into()),
    );
    let bad = written(&reworded, dir.path(), "bad.json");
    let (good, bad) = (
        good.to_string_lossy().into_owned(),
        bad.to_string_lossy().into_owned(),
    );
    let (code, stdout, _) = run_cli(&["--summary", &bad]);
    assert_eq!(code, Some(1));
    assert!(stdout.contains("does not match the reviewed text") && !stdout.contains("mentions:"));
    let (code, stdout, _) = run_cli(&["--summary", &good, &bad]);
    assert_eq!(code, Some(1));
    assert!(!stdout.contains("mentions:"));
    let absent = dir
        .path()
        .join("absent.json")
        .to_string_lossy()
        .into_owned();
    let (code, stdout, _) = run_cli(&["--summary", &good, &absent]);
    assert_eq!(code, Some(1));
    assert!(stdout.contains("no such capture file") && !stdout.contains("mentions:"));
    let (code, stdout, _) = run_cli(&["--summary", &good]);
    assert_eq!(code, Some(0));
    assert!(stdout.contains("mentions:   1/1 completed answers"));

    assert_eq!(run_cli(&["--check", &good]).0, Some(0));
    let (code, stdout, _) = run_cli(&["--check", &absent]);
    assert!(code == Some(1) && stdout.contains("no such capture file"));
    assert_eq!(run_cli(&["--check"]).0, Some(0));
    assert_eq!(run_cli(&["--summary"]).0, Some(0));
    let (code, _, stderr) = run_cli(&["--check", "--summary"]);
    assert_eq!(code, Some(2));
    assert!(stderr.contains("not allowed with"));
}

/// A single file cannot present itself as separate system measurements.
#[test]
fn one_capture_records_one_system() {
    let mut capture = base_capture();
    let mut second = complete_observation(UNBRANDED_ID);
    set(&mut second, "system", Json::Str("Another Assistant".into()));
    set(&mut second, "site_cited", Json::Bool(false));
    set(&mut second, "cited_urls", json("[]"));
    push_observation(&mut capture, second);
    expect(
        "two systems",
        &failures_for(&capture),
        "one capture records one system per round",
    );
}

#[test]
fn template_covers_every_prompt() {
    let capture = json(&template(&prompts()).unwrap());
    assert_eq!(capture.get("fixture"), Some(&Json::Bool(false)));
    let Some(Json::Array(observations)) = capture.get("observations") else {
        panic!("observations")
    };
    let ids: Vec<String> = observations
        .iter()
        .map(|o| o.get("prompt_id").unwrap().py_str())
        .collect();
    assert_eq!(
        ids,
        prompts().into_iter().map(|(k, _)| k).collect::<Vec<_>>()
    );
    for o in observations {
        assert_eq!(o.get("status"), Some(&Json::Str("not_run".into())));
        assert!(
            o.get("prompt_sent")
                .unwrap()
                .py_eq(&prompt_text(&o.get("prompt_id").unwrap().py_str()))
        );
    }
}

#[test]
fn changed_facts_cannot_silently_regrade_a_capture() {
    let mut capture = base_capture();
    let mut revised = prompts();
    let branded = &mut revised.iter_mut().find(|(k, _)| k == BRANDED_ID).unwrap().1;
    let Json::Object(pairs) = branded else {
        panic!()
    };
    let Some((_, Json::Array(facts))) = pairs.iter_mut().find(|(k, _)| k == "expected_facts")
    else {
        panic!()
    };
    set(
        &mut facts[0],
        "fact",
        Json::Str("A revised source claim.".into()),
    );
    let failures = check_capture_data("historical round", &capture, &revised).unwrap();
    expect(
        "changed answer key",
        &failures,
        "answer_key_sha256 does not match",
    );
    unset(&mut capture, "answer_key_sha256");
    expect(
        "missing answer key",
        &failures_for(&capture),
        "answer_key_sha256 does not match",
    );
}

#[test]
fn every_prompt_declares_sourced_facts_and_errors() {
    for (id, prompt) in prompts() {
        assert!(
            !site_tools::py::strip(&prompt.get("prompt").unwrap().py_str()).is_empty(),
            "{id}"
        );
        assert!(matches!(prompt.get("branded"), Some(Json::Bool(_))), "{id}");
        let Some(Json::Array(facts)) = prompt.get("expected_facts") else {
            panic!("{id}")
        };
        let Some(Json::Array(errors)) = prompt.get("common_errors") else {
            panic!("{id}")
        };
        assert!(!facts.is_empty() && !errors.is_empty(), "{id}");
        for fact in facts {
            assert!(
                fact.get("source").unwrap().py_str().starts_with("https://"),
                "{id}"
            );
        }
        let mut ids: Vec<String> = errors
            .iter()
            .map(|e| e.get("id").unwrap().py_str())
            .collect();
        let total = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), total, "{id}: duplicate error ids");
    }
}

#[test]
fn release_based_facts_require_review_after_a_release() {
    let releases = site_tools::release_record::load(&repository()).unwrap();
    for (_, prompt) in prompts() {
        let Some(Json::Array(facts)) = prompt.get("expected_facts") else {
            continue;
        };
        for fact in facts {
            let Some(basis) = fact.get("release_basis") else {
                continue;
            };
            let component = basis.get("component").unwrap().py_str();
            let current = releases
                .get("components")
                .and_then(|c| c.get(&component))
                .and_then(|c| c.get("published"))
                .and_then(|p| p.get("version"))
                .unwrap()
                .py_str();
            assert_eq!(basis.get("version").unwrap().py_str(), current);
            assert!(
                fact.get("fact")
                    .unwrap()
                    .py_str()
                    .contains(&format!("v{current}"))
            );
        }
    }
}

/// Serialised captures that repeat a name; each surviving value would validate.
fn repeated_captures() -> Vec<(String, String, &'static str)> {
    let plain = pyjson::dumps(&base_capture(), Default::default());
    let replaced = |target: &str, fragment: &str| {
        assert_eq!(plain.matches(target).count(), 1, "{target}");
        plain.replacen(target, fragment, 1)
    };
    let extra = |members: &str| format!("{}, \"extra\": {members}}}", &plain[..plain.len() - 1]);
    let mut cases: Vec<(String, String, &'static str)> =
        ["null", "false", r#""""#, r#"["E1-namesake"]"#, "[]"]
            .iter()
            .enumerate()
            .map(|(index, value)| {
                (
                    format!("factual-first-{index}"),
                    replaced(
                        r#""factual_errors": []"#,
                        &format!(r#""factual_errors": {value}, "factual_errors": []"#),
                    ),
                    "factual_errors",
                )
            })
            .collect();
    cases.extend([
        (
            "recorder".into(),
            format!(r#"{{"recorded_by": "",{}"#, &plain[1..]),
            "recorded_by",
        ),
        (
            "answer-key".into(),
            format!(r#"{{"answer_key_sha256": "wrong",{}"#, &plain[1..]),
            "answer_key_sha256",
        ),
        (
            "schema".into(),
            format!(r#"{{"schema": false,{}"#, &plain[1..]),
            "schema",
        ),
        (
            "status".into(),
            replaced(
                r#""status": "complete""#,
                r#""status": "blocked", "status": "complete""#,
            ),
            "status",
        ),
        (
            "identical-mention".into(),
            replaced(
                r#""mentioned": true"#,
                r#""mentioned": true, "mentioned": true"#,
            ),
            "mentioned",
        ),
        (
            "escaped-first".into(),
            replaced(
                r#""factual_errors": []"#,
                r#""\u0066actual_errors": ["E1-namesake"], "factual_errors": []"#,
            ),
            "factual_errors",
        ),
        (
            "escaped-last".into(),
            replaced(
                r#""factual_errors": []"#,
                r#""factual_errors": [], "\u0066actual_errors": ["E1-namesake"]"#,
            ),
            "factual_errors",
        ),
        (
            "unknown-object".into(),
            extra(r#"{"result": 1, "result": 2}"#),
            "result",
        ),
        ("unknown-array".into(), extra(r#"[{"x": 1, "x": 1}]"#), "x"),
        ("empty-name".into(), extra(r#"{"": 1, "": 2}"#), ""),
        (
            "unicode-name".into(),
            extra(r#"{"\u00e9": 1, "\u00e9": 2}"#),
            "é",
        ),
        (
            "mixed-unicode-name".into(),
            extra(r#"{"é": 1, "\u00e9": 2}"#),
            "é",
        ),
    ]);
    cases
}

#[test]
fn repeated_json_names_are_rejected_not_collapsed() {
    let dir = tempfile::tempdir().unwrap();
    let good = written(&base_capture(), dir.path(), "good.json");
    for (name, text, member) in repeated_captures() {
        let path = dir.path().join(format!("{name}.json"));
        std::fs::write(&path, &text).unwrap();
        let expected = format!(
            "repeated JSON object name {}",
            site_tools::py::repr_str(member)
        );
        let error = load_capture(&path).expect_err(&name);
        assert!(error.contains(&expected), "{name}: {error}");
        let failures = check_capture(&path, &prompts()).unwrap();
        assert_eq!(failures.len(), 1, "{name}: {failures:?}");
        assert!(failures[0].contains(&format!("{name}.json")) && failures[0].contains(&expected));
        let (loaded, failures) =
            validated(&[named(good.clone()), named(path.clone())], &prompts()).unwrap();
        assert_eq!(loaded.len(), 1, "{name}");
        assert_eq!(failures.len(), 1, "{name}: {failures:?}");
        let shown = path.to_string_lossy().into_owned();
        let (code, stdout, _) = run_cli(&["--summary", &good.to_string_lossy(), &shown]);
        assert_eq!(code, Some(1), "{name}: {stdout}");
        assert!(
            stdout.contains(&expected) && !stdout.contains("mentions:"),
            "{stdout}"
        );
    }
}

#[test]
fn a_prompt_is_observed_once_per_round() {
    let mut unrun = complete_observation(BRANDED_ID);
    for key in ["system", "mentioned", "site_cited", "cited_urls"] {
        unset(&mut unrun, key);
    }
    set(&mut unrun, "status", Json::Str("not_run".into()));
    set(&mut unrun, "reason", Json::Str("rate limited".into()));
    for second in [complete_observation(BRANDED_ID), unrun] {
        let mut capture = base_capture();
        push_observation(&mut capture, second);
        let failures = failures_for(&capture);
        assert_eq!(failures.len(), 1, "{failures:?}");
        expect(
            "repeated prompt",
            &failures,
            &format!("observation 2: repeated prompt_id '{BRANDED_ID}' in one round"),
        );
    }
    let mut capture = base_capture();
    push_observation(&mut capture, complete_observation(UNBRANDED_ID));
    assert!(failures_for(&capture).is_empty());
}

#[test]
fn site_hosts_allow_one_root_dot_and_no_empty_labels() {
    for url in [
        "https://duguid.com.au./about/",
        "https://www.duguid.com.au./about/",
        "http://DOCS.DUGUID.COM.AU.:8443/about/",
    ] {
        assert!(site_cited_url(Some(&Json::Str(url.into()))), "{url}");
        let mut capture = base_capture();
        set(
            observation(&mut capture, 0),
            "cited_urls",
            json(&format!("[\"{url}\"]")),
        );
        assert!(failures_for(&capture).is_empty(), "{url}");
    }
    for url in [
        "https://.duguid.com.au/about/",
        "https://docs..duguid.com.au/about/",
        "https://..duguid.com.au/about/",
        "https://duguid.com.au../about/",
        "https://www.duguid.com.au../about/",
        "https://duguid.com.au.example.org./about/",
    ] {
        assert!(!site_cited_url(Some(&Json::Str(url.into()))), "{url}");
        let mut capture = base_capture();
        set(
            observation(&mut capture, 0),
            "cited_urls",
            json(&format!("[\"{url}\"]")),
        );
        expect(url, &failures_for(&capture), "no cited URL is on");
    }
}

/// A fresh round that mentions and cites the site, and a reused-session round that
/// does neither and declares a factual error.
fn session_rounds() -> [Json; 2] {
    let first_error = prompts()
        .into_iter()
        .find(|(k, _)| k == BRANDED_ID)
        .and_then(|(_, p)| match p.get("common_errors") {
            Some(Json::Array(errors)) => errors[0].get("id").cloned(),
            _ => None,
        })
        .unwrap();
    let mut reused = base_capture();
    let observation = observation(&mut reused, 0);
    set(observation, "fresh_session", Json::Bool(false));
    set(observation, "mentioned", Json::Bool(false));
    set(observation, "site_cited", Json::Bool(false));
    set(observation, "cited_urls", Json::Array(vec![]));
    set(
        observation,
        "factual_errors",
        Json::Array(vec![first_error]),
    );
    [base_capture(), reused]
}

/// The fresh group's block, with its excluded count, and the reused group's block.
fn session_blocks(excluded: usize) -> [String; 2] {
    let block = |lines: &[&str]| lines.iter().map(|line| format!("{line}\n")).collect();
    [
        block(&[
            "Test Assistant, branded prompts, search on",
            "  mentions:   1/1 completed answers",
            "  citations:  1/1 completed answers",
            "  no declared factual error: 1/1",
            &format!("  excluded (not run or blocked): {excluded}"),
        ]),
        block(&[
            "Test Assistant, branded prompts, search on, without a fresh session",
            "  mentions:   0/1 completed answers",
            "  citations:  0/1 completed answers",
            "  no declared factual error: 0/1",
            "  excluded (not run or blocked): 0",
            "  recorded without a fresh session: 1/1, not comparable with the rest",
        ]),
    ]
}

#[test]
fn reused_sessions_keep_their_own_denominators() {
    for (fixture, include_fixtures) in [(false, false), (true, true)] {
        let mut rounds = session_rounds();
        set(&mut rounds[1], "fixture", Json::Bool(fixture));
        let reversed = [rounds[1].clone(), rounds[0].clone()];
        for ordered in [&rounds, &reversed] {
            let summary = summary_of(ordered, include_fixtures);
            for block in session_blocks(0) {
                assert!(summary.contains(&block), "{block}\n{summary}");
            }
        }
    }
    let mut rounds = session_rounds();
    set(&mut rounds[1], "fixture", Json::Bool(true));
    let summary = summary_of(&rounds, false);
    assert!(summary.contains(&session_blocks(0)[0]), "{summary}");
    assert!(!summary.contains("without a fresh session"), "{summary}");
    for status in ["not_run", "blocked"] {
        let mut unrun = base_capture();
        let observation = observation(&mut unrun, 0);
        set(observation, "status", Json::Str(status.into()));
        set(observation, "reason", Json::Str("not attempted".into()));
        set(observation, "fresh_session", Json::Bool(false));
        let [fresh, reused] = session_rounds();
        let summary = summary_of(&[fresh, reused, unrun], false);
        let [fresh_block, _] = session_blocks(1);
        let [_, reused_block] = session_blocks(0);
        for block in [fresh_block, reused_block] {
            assert!(summary.contains(&block), "{status} {block}\n{summary}");
        }
    }
}

#[test]
fn a_capture_selected_twice_counts_once() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir(dir.path().join("nested")).unwrap();
    let path = written(&base_capture(), dir.path(), "round.json");
    let parent = dir.path().join("nested").join("..").join("round.json");
    let spelt = |p: &Path, shown: &str| Named {
        shown: shown.to_owned(),
        path: p.to_path_buf(),
    };
    let (loaded, failures) = validated(
        &[spelt(&path, "a"), spelt(&path, "b"), spelt(&parent, "c")],
        &prompts(),
    )
    .unwrap();
    assert!(failures.is_empty(), "{failures:?}");
    assert_eq!(loaded.len(), 1);
    let (shown, again) = (path.to_string_lossy(), parent.to_string_lossy());
    let (code, single, _) = run_cli(&["--summary", &shown]);
    let (code_twice, twice, _) = run_cli(&["--summary", &shown, &again, &shown]);
    assert_eq!((code, code_twice), (Some(0), Some(0)));
    assert_eq!(twice, single);
    let (code, checked, _) = run_cli(&["--check", &shown, &again]);
    assert_eq!(code, Some(0));
    assert!(checked.contains("1 file(s)"), "{checked}");

    let bad = dir.path().join("bad.json");
    std::fs::write(&bad, "{ not JSON").unwrap();
    let (_, failures) = validated(&[named(bad.clone()), named(bad.clone())], &prompts()).unwrap();
    assert_eq!(failures.len(), 1, "{failures:?}");

    let second = written(&base_capture(), dir.path(), "second.json");
    let (loaded, failures) = validated(
        &[named(path.clone()), named(second), named(path)],
        &prompts(),
    )
    .unwrap();
    assert!(failures.is_empty());
    assert_eq!(loaded.len(), 2, "separate files stay separate rounds");
}

#[test]
fn prompts_with_a_repeated_name_are_refused() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("docs/visibility-benchmark/prompts.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let text = std::fs::read_to_string(repository().join("docs/visibility-benchmark/prompts.json"))
        .unwrap();
    assert!(load_prompts(dir.path()).is_err());
    std::fs::write(&path, &text).unwrap();
    assert_eq!(load_prompts(dir.path()).unwrap(), prompts());
    let repeated = text.replacen('{', r#"{"prompts": [], "#, 1);
    std::fs::write(&path, repeated).unwrap();
    let error = load_prompts(dir.path()).unwrap_err();
    assert!(
        error.contains("repeated JSON object name 'prompts'"),
        "{error}"
    );
}

#[test]
fn prompts_with_a_repeated_id_are_refused() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("docs/visibility-benchmark/prompts.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let mut data = pyjson::loads(
        &std::fs::read_to_string(repository().join("docs/visibility-benchmark/prompts.json"))
            .unwrap(),
    )
    .unwrap();
    let Json::Object(pairs) = &mut data else {
        panic!("prompts.json is an object")
    };
    let Some((_, Json::Array(entries))) = pairs.iter_mut().find(|(k, _)| k == "prompts") else {
        panic!("prompts list")
    };
    let mut changed = entries[0].clone();
    set(
        &mut changed,
        "prompt",
        Json::Str("A different question".into()),
    );
    entries.push(changed);
    std::fs::write(&path, pyjson::dumps(&data, Default::default())).unwrap();
    let error = load_prompts(dir.path()).unwrap_err();
    assert!(
        error.contains(&format!(
            "repeated prompt id '{BRANDED_ID}' in prompts.json"
        )),
        "{error}"
    );
}
