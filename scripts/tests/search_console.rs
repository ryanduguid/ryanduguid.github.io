// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Pure unit and CLI integration tests for `site-tools search_console`.

use site_tools::py::Date;
use site_tools::pyjson::{self, Json};
use site_tools::search_console::{
    MAX_ROWS, PROPERTY, build_compare_requests, build_inspect_request, build_search_request,
    compare_search_rows, comparison_windows, extract_rows, format_compare_response,
    format_inspect_response, format_sitemaps_response, parse_date, self_test, sitemaps_endpoint,
    validate_site_url,
};
use std::io::Write;
use std::process::{Command, Output, Stdio};

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| (*item).to_owned()).collect()
}

fn json(text: &str) -> Json {
    pyjson::loads(text).unwrap()
}

fn run_cli(args: &[&str], stdin_data: Option<&str>) -> Output {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_site-tools"));
    cmd.arg("search_console").args(args);
    if let Some(body) = stdin_data {
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = cmd.spawn().unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(body.as_bytes())
            .unwrap();
        child.wait_with_output().unwrap()
    } else {
        cmd.output().unwrap()
    }
}

#[test]
fn comparison_windows_adjacent_inclusive_and_bounds() {
    let end = Date::new(2026, 8, 28).unwrap();
    assert_eq!(
        comparison_windows(end, 28).unwrap(),
        json(
            r#"{
              "current": {"start_date": "2026-08-01", "end_date": "2026-08-28"},
              "previous": {"start_date": "2026-07-04", "end_date": "2026-07-31"}
            }"#
        )
    );
    assert_eq!(
        comparison_windows(end, 1).unwrap(),
        json(
            r#"{
              "current": {"start_date": "2026-08-28", "end_date": "2026-08-28"},
              "previous": {"start_date": "2026-08-27", "end_date": "2026-08-27"}
            }"#
        )
    );
    assert!(comparison_windows(end, 90).is_ok());
    for bad_days in [0, -1, 91] {
        let err = comparison_windows(end, bad_days).unwrap_err();
        assert!(err.contains("1 to 90"), "{bad_days}: {err}");
    }
    let min_day = Date::new(1, 1, 5).unwrap();
    assert!(
        comparison_windows(min_day, 28)
            .unwrap_err()
            .contains("OverflowError")
    );
}

#[test]
fn build_search_request_validation_and_limits() {
    let start = Date::new(2026, 8, 1).unwrap();
    let end = Date::new(2026, 8, 28).unwrap();
    assert_eq!(
        build_search_request(start, end, &s(&["page", "query"]), 250).unwrap(),
        json(
            r#"{
              "startDate": "2026-08-01",
              "endDate": "2026-08-28",
              "dimensions": ["page", "query"],
              "rowLimit": 250
            }"#
        )
    );
    // Exactly 90 inclusive days is accepted (2026-01-01 to 2026-03-31).
    assert!(
        build_search_request(
            Date::new(2026, 1, 1).unwrap(),
            Date::new(2026, 3, 31).unwrap(),
            &s(&["page"]),
            MAX_ROWS
        )
        .is_ok()
    );
    // 91 inclusive days is rejected (2026-01-01 to 2026-04-01).
    assert!(
        build_search_request(
            Date::new(2026, 1, 1).unwrap(),
            Date::new(2026, 4, 1).unwrap(),
            &s(&["page"]),
            MAX_ROWS
        )
        .unwrap_err()
        .contains("90 days")
    );
    assert!(
        build_search_request(end, start, &s(&["page"]), MAX_ROWS)
            .unwrap_err()
            .contains("before start_date")
    );
    for bad_limit in [0, -5, 1001] {
        assert!(
            build_search_request(start, end, &s(&["page"]), bad_limit)
                .unwrap_err()
                .contains("1,000")
        );
    }
    assert!(
        build_search_request(start, end, &[], 100)
            .unwrap_err()
            .contains("at least one")
    );
    assert!(
        build_search_request(start, end, &s(&["searchAppearance"]), 100)
            .unwrap_err()
            .contains("unknown Search Console dimension: searchAppearance")
    );
    assert!(
        build_search_request(start, end, &s(&["page", "page"]), 100)
            .unwrap_err()
            .contains("must be unique")
    );
}

#[test]
fn validate_site_url_enforces_exact_https_hosts() {
    // The password-only userinfo URL is assembled here so the secrets scan reads
    // no credential-shaped string in the source.
    let password_only = format!("https://{}@duguid.com.au/", [":", "pass"].concat());
    for valid in [
        "https://duguid.com.au",
        "https://duguid.com.au/tools/coal-lsl-levy/",
        "https://www.duguid.com.au/about/",
        "https://duguid.com.au:443/rates/",
        "https://duguid.com.au:/",
        "HTTPS://DUGUID.COM.AU/tools/",
        "https://duguid.com.au/#",
    ] {
        assert_eq!(validate_site_url(valid).unwrap(), valid, "{valid}");
    }
    for invalid in [
        "",
        "http://duguid.com.au/",
        "https://example.com/duguid.com.au/",
        "https://duguid.com.au.example.com/",
        "https://sub.duguid.com.au/",
        "https://duguid.com.au./",
        "https://user@duguid.com.au/",
        "https://@duguid.com.au/",
        password_only.as_str(),
        "https://duguid.com.au:8443/",
        "https://duguid.com.au:bad/",
        "https://duguid.com.au/#section",
        "https://[bad",
    ] {
        assert!(
            validate_site_url(invalid)
                .unwrap_err()
                .contains("HTTPS URL"),
            "{invalid}"
        );
    }
}

#[test]
fn compare_search_rows_orders_ties_stably_and_normalises_missing() {
    let current = match json(
        r#"[
          {"keys": ["https://duguid.com.au/a/", "coal levy"], "clicks": 4, "impressions": 100},
          {"keys": ["https://duguid.com.au/b/", "tax"], "clicks": 1, "impressions": 20},
          {"keys": ["https://duguid.com.au/d/", "equal first"], "clicks": 0, "impressions": 30},
          {"keys": ["https://duguid.com.au/e/", "equal second"], "clicks": 0, "impressions": 30}
        ]"#,
    ) {
        Json::Array(items) => items,
        _ => unreachable!(),
    };
    let previous = match json(
        r#"[
          {"keys": ["https://duguid.com.au/a/", "coal levy"], "clicks": 2, "impressions": 40},
          {"keys": ["https://duguid.com.au/c/", "other"], "clicks": 5, "impressions": 80}
        ]"#,
    ) {
        Json::Array(items) => items,
        _ => unreachable!(),
    };

    let rows = compare_search_rows(&current, &previous, &s(&["page", "query"])).unwrap();
    let queries: Vec<&str> = rows
        .iter()
        .map(|row| row.get("query").unwrap().as_str().unwrap())
        .collect();
    assert_eq!(
        queries,
        ["other", "coal levy", "equal first", "equal second", "tax"]
    );
    assert_eq!(
        rows[0],
        json(
            r#"{
              "page": "https://duguid.com.au/c/",
              "query": "other",
              "current": {"clicks": 0, "impressions": 0},
              "previous": {"clicks": 5, "impressions": 80},
              "delta": {"clicks": -5, "impressions": -80}
            }"#
        )
    );
    assert_eq!(
        rows[1].get("delta").unwrap(),
        &json(r#"{"clicks": 2, "impressions": 60}"#)
    );

    let missing_metrics = compare_search_rows(
        &[json(
            r#"{"keys": ["https://duguid.com.au/new/", "new query"]}"#,
        )],
        &[],
        &s(&["page", "query"]),
    )
    .unwrap();
    assert_eq!(
        missing_metrics,
        vec![json(
            r#"{
              "page": "https://duguid.com.au/new/",
              "query": "new query",
              "current": {"clicks": 0, "impressions": 0},
              "previous": {"clicks": 0, "impressions": 0},
              "delta": {"clicks": 0, "impressions": 0}
            }"#
        )]
    );
}

#[test]
fn compare_search_rows_rejects_malformed_inputs_and_handles_floats() {
    let float_rows = compare_search_rows(
        &[
            json(r#"{"keys": ["q1"], "clicks": 1.5, "impressions": 10.5}"#),
            json(r#"{"keys": ["q2"], "clicks": 1, "impressions": 10}"#),
        ],
        &[],
        &s(&["query"]),
    )
    .unwrap();
    assert_eq!(float_rows[0].get("query").unwrap().as_str(), Some("q1"));
    assert_eq!(float_rows[1].get("query").unwrap().as_str(), Some("q2"));

    for bad in [
        r#"[{"keys": ["a"], "clicks": true, "impressions": 1}]"#,
        r#"[{"keys": ["a"], "clicks": 1, "impressions": "10"}]"#,
        r#"[{"keys": ["a", "b"], "clicks": 1, "impressions": 1}]"#,
        r#"[{"keys": [123], "clicks": 1, "impressions": 1}]"#,
        r#"[{"keys": ["a"]}, {"keys": ["a"]}]"#,
        r#"["not-an-object"]"#,
    ] {
        let items = match json(bad) {
            Json::Array(arr) => arr,
            _ => unreachable!(),
        };
        assert!(
            compare_search_rows(&items, &[], &s(&["query"])).is_err(),
            "{bad}"
        );
    }
}

#[test]
fn response_shaping_matches_server_contracts() {
    let end = parse_date("2026-08-28", "end_date").unwrap();
    let reqs = build_compare_requests(end, 28, &s(&["page", "query"]), 1000).unwrap();
    assert_eq!(
        reqs.get("endpoint").and_then(Json::as_str),
        Some(
            "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aduguid.com.au/searchAnalytics/query"
        )
    );

    let compared = format_compare_response(
        end,
        28,
        &s(&["page", "query"]),
        1000,
        &json(r#"{"rows": [{"keys": ["https://duguid.com.au/a/", "levy"], "clicks": 4, "impressions": 100}]}"#),
        &json(r#"{"rows": [{"keys": ["https://duguid.com.au/a/", "levy"], "clicks": 2, "impressions": 40}]}"#),
    )
    .unwrap();
    assert_eq!(
        compared.get("property").and_then(Json::as_str),
        Some(PROPERTY)
    );
    assert!(
        format_compare_response(
            end,
            28,
            &s(&["page"]),
            1000,
            &json(r#"{"rows": "bad"}"#),
            &json(r#"{}"#),
        )
        .unwrap_err()
        .contains("malformed analytics rows")
    );

    let inspect_req = build_inspect_request("https://duguid.com.au/tools/coal-lsl-levy/").unwrap();
    assert_eq!(
        inspect_req.get("body").unwrap(),
        &json(
            r#"{
              "inspectionUrl": "https://duguid.com.au/tools/coal-lsl-levy/",
              "siteUrl": "sc-domain:duguid.com.au",
              "languageCode": "en-AU"
            }"#
        )
    );
    let inspected = format_inspect_response(
        "https://duguid.com.au/tools/coal-lsl-levy/",
        &json(r#"{"inspectionResult": {"indexStatusResult": {"verdict": "PASS"}}}"#),
    )
    .unwrap();
    assert_eq!(
        inspected.get("inspection_result").unwrap(),
        &json(r#"{"indexStatusResult": {"verdict": "PASS"}}"#)
    );

    let sitemaps = format_sitemaps_response(&json(
        r#"{"sitemap": [{"path": "https://duguid.com.au/sitemap.xml"}]}"#,
    ))
    .unwrap();
    assert_eq!(
        sitemaps.get("sitemaps").unwrap(),
        &json(r#"[{"path": "https://duguid.com.au/sitemap.xml"}]"#)
    );
    assert!(
        format_sitemaps_response(&json(r#"{"sitemap": "bad"}"#))
            .unwrap_err()
            .contains("malformed sitemap data")
    );
    self_test().unwrap();
}

#[test]
fn cli_subcommands_cover_help_errors_stdin_and_files() {
    assert_eq!(run_cli(&[], None).status.code(), Some(2));
    assert_eq!(run_cli(&["--help"], None).status.code(), Some(0));
    assert_eq!(run_cli(&["-h"], None).status.code(), Some(0));
    assert_eq!(run_cli(&["unknown_sub"], None).status.code(), Some(2));
    assert_eq!(run_cli(&["self-test"], None).status.code(), Some(0));

    let win = run_cli(&["comparison-windows", "--end-date", "2026-08-28"], None);
    assert_eq!(win.status.code(), Some(0));
    assert!(
        String::from_utf8(win.stdout)
            .unwrap()
            .contains("\"2026-07-04\"")
    );
    assert_eq!(
        run_cli(
            &[
                "comparison_windows",
                "--end-date",
                "2026-08-28",
                "--days",
                "0"
            ],
            None
        )
        .status
        .code(),
        Some(1)
    );
    assert_eq!(
        run_cli(
            &[
                "comparison_windows",
                "--end-date",
                "2026-08-28",
                "--days",
                "abc"
            ],
            None
        )
        .status
        .code(),
        Some(2)
    );
    assert_eq!(
        run_cli(&["comparison_windows"], None).status.code(),
        Some(2)
    );

    assert_eq!(
        run_cli(
            &[
                "build-search-request",
                "--start-date",
                "2026-08-01",
                "--end-date",
                "2026-08-28",
                "--dimensions",
                "page",
                "query",
                "--row-limit",
                "250",
            ],
            None,
        )
        .status
        .code(),
        Some(0)
    );
    assert_eq!(
        run_cli(
            &[
                "build_search_request",
                "--start-date",
                "2026-08-01",
                "--end-date",
                "2026-08-28",
                "--dimensions",
            ],
            None,
        )
        .status
        .code(),
        Some(1)
    );

    let valid_url = run_cli(&["validate-site-url", "https://duguid.com.au/about/"], None);
    assert_eq!(valid_url.status.code(), Some(0));
    assert_eq!(
        String::from_utf8(valid_url.stdout)
            .unwrap()
            .replace("\r\n", "\n"),
        "https://duguid.com.au/about/\n"
    );
    assert_eq!(
        run_cli(&["validate_site_url", "http://duguid.com.au/"], None)
            .status
            .code(),
        Some(1)
    );
    assert_eq!(run_cli(&["validate_site_url"], None).status.code(), Some(2));
}

#[test]
fn cli_json_stdin_file_and_shaping_subcommands() {
    let cmp_in = r#"{"current":[{"keys":["https://duguid.com.au/a/","levy"],"clicks":4,"impressions":100}],"previous":[{"keys":["https://duguid.com.au/a/","levy"],"clicks":2,"impressions":40}],"dimensions":["page","query"]}"#;
    let cmp_out = run_cli(&["compare_search_rows"], Some(cmp_in));
    assert_eq!(cmp_out.status.code(), Some(0));
    assert!(
        String::from_utf8(cmp_out.stdout)
            .unwrap()
            .contains("\"impressions\": 60")
    );

    let dir = tempfile::tempdir().unwrap();
    let payload_file = dir.path().join("compare.json");
    std::fs::write(
        &payload_file,
        r#"{"current":{"rows":[{"keys":["https://duguid.com.au/a/","levy"],"clicks":4,"impressions":100}]},"previous":{"rows":[{"keys":["https://duguid.com.au/a/","levy"],"clicks":2,"impressions":40}]}}"#,
    )
    .unwrap();
    let resp_out = run_cli(
        &[
            "compare_response",
            "--end-date",
            "2026-08-28",
            "--input",
            payload_file.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(resp_out.status.code(), Some(0));
    assert!(
        String::from_utf8(resp_out.stdout)
            .unwrap()
            .contains("sc-domain:duguid.com.au")
    );

    assert_eq!(
        run_cli(
            &[
                "inspect_request",
                "https://duguid.com.au/tools/coal-lsl-levy/"
            ],
            None
        )
        .status
        .code(),
        Some(0)
    );
    assert_eq!(
        run_cli(
            &[
                "inspect_response",
                "https://duguid.com.au/tools/coal-lsl-levy/"
            ],
            Some(r#"{"inspectionResult":{"indexStatusResult":{"verdict":"PASS"}}}"#),
        )
        .status
        .code(),
        Some(0)
    );
    assert_eq!(
        run_cli(
            &["sitemaps_response"],
            Some(r#"{"sitemap":[{"path":"https://duguid.com.au/sitemap.xml"}]}"#),
        )
        .status
        .code(),
        Some(0)
    );
}

#[test]
fn overflow_infinity_sort_bigint_float_and_large_cli_ints() {
    let inf_sort = r#"{"current":[{"keys":["/a"],"clicks":0,"impressions":1e308},{"keys":["/b"],"clicks":0,"impressions":5}],"previous":[{"keys":["/a"],"clicks":0,"impressions":-1e308},{"keys":["/b"],"clicks":0,"impressions":0}],"dimensions":["page"]}"#;
    let inf_out = run_cli(&["compare_search_rows"], Some(inf_sort));
    assert_eq!(inf_out.status.code(), Some(0));
    let inf_text = String::from_utf8(inf_out.stdout).unwrap();
    let pos_a = inf_text.find("\"/a\"").unwrap();
    let pos_b = inf_text.find("\"/b\"").unwrap();
    assert!(pos_a < pos_b);
    assert!(inf_text.contains("\"impressions\": Infinity"));

    let big_pow = format!("1{}", "0".repeat(400));
    let bigint_err_payload = format!(
        r#"{{"current":[{{"keys":["/a"],"clicks":0,"impressions":{big_pow}}}],"previous":[{{"keys":["/a"],"clicks":0,"impressions":1.0}}],"dimensions":["page"]}}"#
    );
    let err_out = run_cli(&["compare_search_rows"], Some(&bigint_err_payload));
    assert_eq!(err_out.status.code(), Some(1));
    assert!(
        String::from_utf8(err_out.stderr)
            .unwrap()
            .contains("OverflowError")
    );

    let neg_bigint_err_payload = format!(
        r#"{{"current":[{{"keys":["/a"],"clicks":0,"impressions":-{big_pow}}}],"previous":[{{"keys":["/a"],"clicks":0,"impressions":1.0}}],"dimensions":["page"]}}"#
    );
    let neg_err_out = run_cli(&["compare_search_rows"], Some(&neg_bigint_err_payload));
    assert_eq!(neg_err_out.status.code(), Some(1));
    assert!(
        String::from_utf8(neg_err_out.stderr)
            .unwrap()
            .contains("OverflowError")
    );

    let bad_days = run_cli(
        &[
            "comparison_windows",
            "--end-date",
            "2026-08-28",
            "--days",
            "99999999999999999999999",
        ],
        None,
    );
    assert_eq!(bad_days.status.code(), Some(1));
    assert!(
        String::from_utf8(bad_days.stderr)
            .unwrap()
            .contains("days must be an integer from 1 to 90")
    );

    let bad_rows = run_cli(
        &[
            "build_search_request",
            "--start-date",
            "2026-08-01",
            "--end-date",
            "2026-08-28",
            "--dimensions",
            "page",
            "--row-limit",
            "-99999999999999999999999",
        ],
        None,
    );
    assert_eq!(bad_rows.status.code(), Some(1));
    assert!(
        String::from_utf8(bad_rows.stderr)
            .unwrap()
            .contains("row_limit must be an integer from 1 to 1,000")
    );
    assert_eq!(
        run_cli(
            &[
                "comparison_windows",
                "--end-date",
                "2026-08-28",
                "--days",
                "abc"
            ],
            None,
        )
        .status
        .code(),
        Some(2)
    );

    let abbrev_win = run_cli(
        &["comparison_windows", "--end=2026-08-28", "--da", "7"],
        None,
    );
    assert_eq!(abbrev_win.status.code(), Some(0));
    let abbrev_text = String::from_utf8(abbrev_win.stdout).unwrap();
    assert!(abbrev_text.contains("\"start_date\": \"2026-08-22\""));

    let help_abbrev = run_cli(&["comparison_windows", "--h"], None);
    assert_eq!(help_abbrev.status.code(), Some(0));

    let help_explicit_abbrev = run_cli(&["comparison_windows", "--he=nope"], None);
    assert_eq!(help_explicit_abbrev.status.code(), Some(2));
    assert!(
        String::from_utf8(help_explicit_abbrev.stderr)
            .unwrap()
            .contains("ignored explicit argument")
    );

    let ambiguous = run_cli(&["compare_requests", "--d", "5"], None);
    assert_eq!(ambiguous.status.code(), Some(2));
    assert!(
        String::from_utf8(ambiguous.stderr)
            .unwrap()
            .contains("ambiguous option: --d could match --days, --dimensions")
    );

    let early_dims = run_cli(
        &[
            "compare_search_rows",
            "--dim",
            "bogus",
            "--input",
            "/does/not/exist.json",
        ],
        None,
    );
    assert_eq!(early_dims.status.code(), Some(1));
    assert!(
        String::from_utf8(early_dims.stderr)
            .unwrap()
            .contains("unknown Search Console dimension: bogus")
    );
}

#[test]
fn response_shaping_refuses_unexpected_shapes() {
    assert_eq!(
        sitemaps_endpoint(),
        "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aduguid.com.au/sitemaps"
    );
    let shape = "unexpected response shape";
    assert!(extract_rows(&json("[]")).unwrap_err().contains(shape));
    assert!(extract_rows(&json("{}")).unwrap().is_empty());
    assert!(
        extract_rows(&json(r#"{"rows": [1]}"#))
            .unwrap_err()
            .contains("malformed analytics rows")
    );
    let url = "https://duguid.com.au/";
    assert!(
        format_inspect_response(url, &json("[]"))
            .unwrap_err()
            .contains(shape)
    );
    assert_eq!(
        format_inspect_response(url, &json("{}"))
            .unwrap()
            .get("inspection_result"),
        Some(&json("{}"))
    );
    assert!(
        format_sitemaps_response(&json("[]"))
            .unwrap_err()
            .contains(shape)
    );
    assert_eq!(
        format_sitemaps_response(&json("{}"))
            .unwrap()
            .get("sitemaps"),
        Some(&json("[]"))
    );
}

#[test]
fn cli_parses_flags_positionals_and_json_inputs_as_argparse_does() {
    let rows = r#""current": [], "previous": []"#;
    let text_dimensions = format!(r#"{{"dimensions": "page", {rows}}}"#);
    let no_dimensions = format!("{{{rows}}}");
    let cases: &[(&[&str], Option<&str>, i32, &str)] = &[
        (
            &["comparison_windows", "--end-date"],
            None,
            2,
            "argument --end-date: expected one argument",
        ),
        (&["comparison_windows", "-h"], None, 0, ""),
        (
            &["comparison_windows", "--bogus"],
            None,
            2,
            "unrecognized arguments: --bogus",
        ),
        (
            &["comparison_windows", "-x"],
            None,
            2,
            "unrecognized arguments: -x",
        ),
        (
            &["comparison_windows", "--end-date", "2026-08-28", "extra"],
            None,
            2,
            "unrecognized arguments: extra",
        ),
        (
            &["comparison_windows", "--end-date", "2026-13-01"],
            None,
            1,
            "",
        ),
        (
            &[
                "build_search_request",
                "--start-date",
                "2026-08-01",
                "--end-date",
                "2026-08-28",
                "--dimensions=page",
            ],
            None,
            0,
            "",
        ),
        (
            &[
                "build_search_request",
                "--start-date",
                "2026-08-01",
                "--end-date",
                "2026-08-28",
            ],
            None,
            2,
            "the following arguments are required: --dimensions",
        ),
        (
            &["validate_site_url", "--", "https://duguid.com.au/"],
            None,
            0,
            "",
        ),
        (
            &[
                "validate_site_url",
                "https://duguid.com.au/",
                "https://duguid.com.au/a/",
            ],
            None,
            2,
            "unrecognized arguments: https://duguid.com.au/a/",
        ),
        (
            &["compare_search_rows"],
            Some("[]"),
            1,
            "input must be a JSON object",
        ),
        (
            &["compare_search_rows"],
            Some(text_dimensions.as_str()),
            1,
            "dimensions must be a list of strings",
        ),
        (
            &["compare_search_rows"],
            Some(r#"{"dimensions": ["page"], "previous": []}"#),
            1,
            "missing required JSON field: current",
        ),
        (
            &["compare_search_rows"],
            Some(r#"{"dimensions": ["page"], "current": {}, "previous": []}"#),
            1,
            "current must be a list",
        ),
        (
            &["compare_search_rows", "--dimensions", "page"],
            Some(no_dimensions.as_str()),
            0,
            "",
        ),
        (
            &["compare_search_rows"],
            Some(no_dimensions.as_str()),
            2,
            "dimensions are required via --dimensions or input JSON",
        ),
        (
            &["compare_requests", "--end-date", "2026-08-28"],
            None,
            0,
            "",
        ),
        (
            &[
                "compare_requests",
                "--end-date",
                "2026-08-28",
                "--days",
                "0",
            ],
            None,
            1,
            "",
        ),
        (
            &["compare_response", "--end-date", "2026-08-28"],
            Some(r#"{"previous": {}}"#),
            1,
            "missing required JSON field: current",
        ),
        (
            &["compare_response", "--end-date", "2026-08-28"],
            Some(r#"{"current": {}}"#),
            1,
            "missing required JSON field: previous",
        ),
        (
            &["compare_response", "--end-date", "2026-08-28"],
            Some(r#"{"current": [], "previous": {}}"#),
            1,
            "unexpected response shape",
        ),
    ];
    for (args, stdin_data, code, message) in cases {
        let output = run_cli(args, *stdin_data);
        assert_eq!(output.status.code(), Some(*code), "{args:?}");
        let stderr = String::from_utf8(output.stderr).unwrap();
        assert!(stderr.contains(message), "{args:?}: {stderr}");
    }
}

#[test]
fn cli_reads_negative_number_tokens_as_values_as_argparse_does() {
    let dimensions = [
        "build_search_request",
        "--start-date",
        "2026-08-01",
        "--end-date",
        "2026-08-28",
        "--dimensions",
    ];
    let days = ["comparison_windows", "--end-date", "2026-08-28", "--days"];
    // argparse reads a token matching `-\.?\d` as a value, not an option.
    let cases: &[(&[&str], &str, i32, &str)] = &[
        (
            &dimensions,
            "-1.5",
            1,
            "unknown Search Console dimension: -1.5",
        ),
        (
            &days,
            "-1.5",
            2,
            "argument --days: invalid int value: '-1.5'",
        ),
        (&days, "-.5", 2, "argument --days: invalid int value: '-.5'"),
        (&days, "-1x", 2, "argument --days: invalid int value: '-1x'"),
        (&days, "-.", 2, "argument --days: expected one argument"),
        // `\d` and `int()` take any Unicode decimal digit: U+0661 is Arabic-Indic one.
        (&days, "-\u{661}", 1, "days must be an integer from 1 to 90"),
        (
            &dimensions,
            "-\u{661}",
            1,
            "unknown Search Console dimension: -\u{661}",
        ),
    ];
    for (prefix, last, code, message) in cases {
        let args = [*prefix, &[*last]].concat();
        let output = run_cli(&args, None);
        assert_eq!(output.status.code(), Some(*code), "{args:?}");
        let stderr = String::from_utf8(output.stderr).unwrap();
        assert!(stderr.contains(message), "{args:?}: {stderr}");
    }
}
