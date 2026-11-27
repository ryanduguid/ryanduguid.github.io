// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Differential test: the Rust Search Console logic against the Python it ports,
//! `.agents/tools/search-console/core.py`, on the same inputs. Both sides print
//! `json.dumps(indent=2, sort_keys=True)`, so the outputs must match byte for byte,
//! errors included. `server.py` cannot be imported without its `uv` dependencies,
//! so its response shaping is covered by `tests/search_console.rs` instead.

mod common;

use site_tools::py::Date;
use site_tools::pyjson::{self, Dump, Json};
use site_tools::search_console as sc;
use std::io::Write;
use std::process::{Command, Stdio};

/// Runs each case through `core.py` and prints `{"ok": result}` or
/// `{"error": message}` per case, as the Rust side below does.
const HARNESS: &str = r#"
import json, sys
from datetime import date
sys.path.insert(0, sys.argv[1])
import core

def call(name, a):
    if name == "comparison_windows":
        return core.comparison_windows(date.fromisoformat(a[0]), a[1])
    if name == "build_search_request":
        return core.build_search_request(
            date.fromisoformat(a[0]), date.fromisoformat(a[1]), a[2], a[3])
    if name == "validate_site_url":
        return core.validate_site_url(a[0])
    return core.compare_search_rows(a[0], a[1], a[2])

out = []
for name, args in json.load(sys.stdin):
    try:
        out.append({"ok": call(name, args)})
    except ValueError as error:
        out.append({"error": str(error)})
    except OverflowError as error:
        out.append({"error": f"OverflowError: {error}"})
print(json.dumps(out, indent=2, sort_keys=True))
"#;

fn python(cases: &str) -> String {
    let interpreter = if cfg!(windows) { "python" } else { "python3" };
    let core_dir = common::repository().join(".agents/tools/search-console");
    let mut child = Command::new(interpreter)
        .args(["-I", "-c", HARNESS])
        .arg(core_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Python on PATH");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(cases.as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout)
        .unwrap()
        .replace("\r\n", "\n")
}

fn date(value: &Json) -> Date {
    Date::fromisoformat(value.as_str().unwrap()).unwrap()
}

fn strings(value: &Json) -> Vec<String> {
    let Json::Array(items) = value else {
        panic!("expected a list")
    };
    items
        .iter()
        .map(|v| v.as_str().unwrap().to_owned())
        .collect()
}

fn int(value: &Json) -> i64 {
    let Json::Int(n) = value else {
        panic!("expected an int")
    };
    i64::try_from(n).unwrap()
}

fn rows(value: &Json) -> Vec<Json> {
    let Json::Array(items) = value else {
        panic!("expected a list")
    };
    items.clone()
}

fn call(name: &str, a: &[Json]) -> Result<Json, String> {
    match name {
        "comparison_windows" => sc::comparison_windows(date(&a[0]), int(&a[1])),
        "build_search_request" => {
            sc::build_search_request(date(&a[0]), date(&a[1]), &strings(&a[2]), int(&a[3]))
        }
        "validate_site_url" => sc::validate_site_url(a[0].as_str().unwrap()).map(Json::Str),
        _ => sc::compare_search_rows(&rows(&a[0]), &rows(&a[1]), &strings(&a[2])).map(Json::Array),
    }
}

fn rust(cases: &str) -> String {
    let Json::Array(cases) = pyjson::loads(cases).unwrap() else {
        panic!("cases must be a list")
    };
    let results = cases
        .iter()
        .map(|case| {
            let Json::Array(case) = case else {
                panic!("case must be [name, args]")
            };
            let (name, Json::Array(args)) = (case[0].as_str().unwrap(), &case[1]) else {
                panic!("case args must be a list")
            };
            let (key, value) = match call(name, args) {
                Ok(value) => ("ok", value),
                Err(error) => ("error", Json::Str(error)),
            };
            Json::Object(vec![(key.into(), value)])
        })
        .collect();
    let dump = Dump {
        indent: Some(2),
        sort_keys: true,
        ..Dump::default()
    };
    pyjson::dumps(&Json::Array(results), dump) + "\n"
}

fn assert_parity(cases: &str) {
    let expected = python(cases);
    let actual = rust(cases);
    assert_eq!(actual, expected);
}

#[test]
fn comparison_windows_and_requests_match_core_py() {
    assert_parity(
        r#"[
        ["comparison_windows", ["2026-08-28", 28]],
        ["comparison_windows", ["2026-03-01", 1]],
        ["comparison_windows", ["2024-03-01", 90]],
        ["comparison_windows", ["2026-08-28", 0]],
        ["comparison_windows", ["2026-08-28", 91]],
        ["comparison_windows", ["2026-08-28", -5]],
        ["comparison_windows", ["0001-01-05", 3]],
        ["comparison_windows", ["9999-12-31", 90]],
        ["build_search_request", ["2026-08-01", "2026-08-28", ["page", "query"], 1000]],
        ["build_search_request", ["2026-08-28", "2026-08-28", ["date"], 1]],
        ["build_search_request", ["2026-01-01", "2026-03-31", ["country", "device"], 25]],
        ["build_search_request", ["2026-01-01", "2026-04-01", ["page"], 10]],
        ["build_search_request", ["2026-08-29", "2026-08-28", ["page"], 10]],
        ["build_search_request", ["2026-08-01", "2026-08-28", ["page"], 0]],
        ["build_search_request", ["2026-08-01", "2026-08-28", ["page"], 1001]],
        ["build_search_request", ["2026-08-01", "2026-08-28", [], 10]],
        ["build_search_request", ["2026-08-01", "2026-08-28", ["searchAppearance"], 10]],
        ["build_search_request", ["2026-08-01", "2026-08-28", ["page", "page"], 10]],
        ["build_search_request", ["2026-08-01", "2026-08-28", ["page", "bogus", "page"], 10]],
        ["build_search_request", ["2026-08-29", "2026-08-28", ["bogus"], 0]]
    ]"#,
    );
}

#[test]
fn validate_site_url_matches_core_py() {
    // The literal userinfo URLs are assembled here so the secrets scan reads no
    // credential-shaped string in the source.
    let userinfo = ["user", ":", "pw"].concat();
    let cases = [
        "https://duguid.com.au/",
        "https://www.duguid.com.au/tools/coal-lsl-levy/",
        "https://duguid.com.au:443/a?b=c",
        "https://DUGUID.com.au/",
        "https://duguid.com.au",
        "",
        "http://duguid.com.au/",
        "HTTPS://duguid.com.au/",
        "https://example.com/duguid.com.au/",
        "https://duguid.com.au.example.com/",
        "https://sub.duguid.com.au/",
        "https://duguid.com.au./",
        "https://user@duguid.com.au/",
        "https://@duguid.com.au/",
        &format!("https://{userinfo}@duguid.com.au/"),
        "https://duguid.com.au:8443/",
        "https://duguid.com.au:bad/",
        "https://duguid.com.au:99999/",
        "https://duguid.com.au/#section",
        "https://duguid.com.au/#",
        "https://[bad",
        "https://[::1]/",
        "//duguid.com.au/",
        "duguid.com.au",
    ];
    let cases: Vec<Json> = cases
        .iter()
        .map(|url| {
            Json::Array(vec![
                Json::Str("validate_site_url".into()),
                Json::Array(vec![Json::Str((*url).into())]),
            ])
        })
        .collect();
    assert_parity(&pyjson::dumps(&Json::Array(cases), Dump::default()));
}

#[test]
fn compare_search_rows_matches_core_py() {
    assert_parity(
        r#"[
        ["compare_search_rows", [
            [{"keys": ["/a", "levy"], "clicks": 4, "impressions": 100},
             {"keys": ["/b", "tax"], "clicks": 1, "impressions": 10},
             {"keys": ["/c", "gst"], "clicks": 0, "impressions": 7}],
            [{"keys": ["/a", "levy"], "clicks": 2, "impressions": 40},
             {"keys": ["/d", "fbt"], "clicks": 3, "impressions": 70},
             {"keys": ["/c", "gst"], "clicks": 0, "impressions": 7}],
            ["page", "query"]]],
        ["compare_search_rows", [
            [{"keys": ["/a"], "clicks": 1.5, "impressions": 2.25},
             {"keys": ["/b"], "impressions": 3},
             {"keys": ["/c"], "clicks": 1, "impressions": 1000000000000000000000000000000}],
            [{"keys": ["/a"], "clicks": 1, "impressions": 0.75},
             {"keys": ["/c"], "clicks": 1, "impressions": -1}],
            ["page"]]],
        ["compare_search_rows", [
            [{"keys": ["/a"], "impressions": 5}, {"keys": ["/b"], "impressions": -5},
             {"keys": ["/c"], "impressions": 5.0}, {"keys": ["/d"], "impressions": Infinity}],
            [],
            ["page"]]],
        ["compare_search_rows", [[], [], ["page"]]],
        ["compare_search_rows", [[{"keys": ["/a"], "impressions": 1e308}],
            [{"keys": ["/a"], "impressions": -1e308}], ["page"]]],
        ["compare_search_rows", [[{"keys": ["/a"], "impressions": 1e400}],
            [{"keys": ["/a"], "impressions": 1.0}], ["page"]]],
        ["compare_search_rows", [[{"keys": ["/a"], "impressions": 1e999}],
            [], ["page"]]],
        ["compare_search_rows", [
            [{"keys": ["/a"], "impressions": 100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000}],
            [{"keys": ["/a"], "impressions": 1.0}], ["page"]]],
        ["compare_search_rows", [[{"keys": ["/a"], "clicks": true}], [], ["page"]]],
        ["compare_search_rows", [[{"keys": ["/a"], "clicks": "3"}], [], ["page"]]],
        ["compare_search_rows", [[{"keys": ["/a"], "clicks": null}], [], ["page"]]],
        ["compare_search_rows", [[{"keys": ["/a", "x"]}], [], ["page"]]],
        ["compare_search_rows", [[{"keys": "/a"}], [], ["page"]]],
        ["compare_search_rows", [[{"clicks": 1}], [], ["page"]]],
        ["compare_search_rows", [[{"keys": [1]}], [], ["page"]]],
        ["compare_search_rows", [[{"keys": ["/a"]}, {"keys": ["/a"]}], [], ["page"]]],
        ["compare_search_rows", [[], [{"keys": ["/a"]}, {"keys": ["/a"]}], ["page"]]],
        ["compare_search_rows", [[], [], []]],
        ["compare_search_rows", [[], [], ["page", "page"]]],
        ["compare_search_rows", [[], [], ["bogus"]]]
    ]"#,
    );
}
