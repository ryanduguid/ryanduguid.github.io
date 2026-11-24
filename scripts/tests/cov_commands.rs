// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Coverage tests for CLI commands and artifact generators in `site_tools`:
//! `fetch`, `pin_rates`, `effective_life::command`, `effective_life_pages::command`,
//! `agent_skills`, `extract_xero_badge`, `favicon_render`, `cash_chart_webp`,
//! `rates_json`, `ozzit_reference` and `build_site`.
mod common;

use site_tools::{
    agent_skills, build_site, cash_chart_webp, effective_life, effective_life_pages,
    extract_xero_badge, favicon_render, fetch, ozzit_reference, pin_rates, rates_json,
};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::process::Command;
use std::time::Duration;

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|v| (*v).to_owned()).collect()
}

fn copy_file(src: &Path, dst: &Path) {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::copy(src, dst).unwrap();
}

#[test]
fn fetch_get_and_status_cover_success_redirect_http_errors_and_transport_failure() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let handle = std::thread::spawn(move || {
        for _ in 0..5 {
            let Ok((mut stream, _)) = listener.accept() else {
                break;
            };
            let mut buf = [0u8; 1024];
            let n = stream.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]);
            let resp = if req.starts_with("GET /ok ") {
                "HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello"
            } else if req.starts_with("GET /redir ") {
                "HTTP/1.1 302 Found\r\nLocation: /ok\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            } else if req.starts_with("GET /missing ") {
                "HTTP/1.1 404 Not Found\r\nContent-Length: 4\r\nConnection: close\r\n\r\nnope"
            } else {
                "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 3\r\nConnection: close\r\n\r\nerr"
            };
            let _ = stream.write_all(resp.as_bytes());
        }
    });

    let ua = "site-tools-test";
    let timeout = Duration::from_secs(5);
    assert_eq!(
        fetch::get(&format!("http://{addr}/redir"), ua, timeout).unwrap(),
        b"hello"
    );
    let err404 = fetch::get(&format!("http://{addr}/missing"), ua, timeout).unwrap_err();
    assert!(err404.contains("HTTP Error 404: Not Found"), "{err404}");
    assert_eq!(
        fetch::status(&format!("http://{addr}/ok"), ua, timeout).unwrap(),
        200
    );
    assert_eq!(
        fetch::status(&format!("http://{addr}/boom"), ua, timeout).unwrap(),
        500
    );
    handle.join().unwrap();

    // Connection refused
    let dead = TcpListener::bind("127.0.0.1:0").unwrap();
    let dead_addr = dead.local_addr().unwrap();
    drop(dead);
    let err_get = fetch::get(&format!("http://{dead_addr}/"), ua, timeout).unwrap_err();
    assert!(err_get.contains("URLError"), "{err_get}");
    let err_st = fetch::status(&format!("http://{dead_addr}/"), ua, timeout).unwrap_err();
    assert!(err_st.contains("urlopen error"), "{err_st}");
}

#[test]
fn pin_rates_covers_cli_errors_missing_records_type_errors_and_happy_path() {
    let out_root = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(out_root.path().join("scripts")).unwrap();

    // Wrong arg count -> exit 2
    assert_eq!(pin_rates::run(out_root.path(), &[]).unwrap(), 2);
    assert_eq!(pin_rates::run(out_root.path(), &s(&["a", "b"])).unwrap(), 2);

    // Non-git directory -> Err
    let not_git = tempfile::tempdir().unwrap();
    assert!(pin_rates::run(out_root.path(), &s(&[not_git.path().to_str().unwrap()])).is_err());

    // Helper to initialise a git repo with a set of data files
    let make_repo = |files: &[(&str, &str)]| {
        let dir = tempfile::tempdir().unwrap();
        let run_git = |args: &[&str]| {
            let status = Command::new("git")
                .current_dir(dir.path())
                .args(args)
                .env("GIT_AUTHOR_NAME", "Test")
                .env("GIT_AUTHOR_EMAIL", "test@example.com")
                .env("GIT_COMMITTER_NAME", "Test")
                .env("GIT_COMMITTER_EMAIL", "test@example.com")
                .status()
                .unwrap();
            assert!(status.success(), "git {args:?} failed");
        };
        run_git(&["init", "-q"]);
        for (name, body) in files {
            let path = dir
                .path()
                .join("packages/au-tax-rates-data/data")
                .join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, body).unwrap();
        }
        if files.is_empty() {
            std::fs::write(dir.path().join("README.md"), "empty\n").unwrap();
        }
        run_git(&["add", "."]);
        run_git(&["commit", "-q", "-m", "seed", "--no-gpg-sign"]);
        dir
    };

    // Missing record -> exit 1
    let empty_repo = make_repo(&[]);
    assert_eq!(
        pin_rates::run(out_root.path(), &s(&[empty_repo.path().to_str().unwrap()])).unwrap(),
        1
    );

    // Invalid record shapes trigger each TypeError / KeyError branch
    for (body, expected) in [
        ("{}", "KeyError: 'value'"),
        ("[]", "list indices"),
        ("\"str\"", "string indices"),
        ("null", "NoneType"),
        ("true", "bool"),
        ("1", "int"),
        ("1.5", "float"),
    ] {
        let bad_repo = make_repo(&[("car-limit-2026-27.json", body)]);
        let err =
            pin_rates::run(out_root.path(), &s(&[bad_repo.path().to_str().unwrap()])).unwrap_err();
        assert!(err.contains(expected), "body={body} err={err}");
    }

    // All 9 valid records -> exit 0 and extract written
    let names = [
        "car-limit-2026-27.json",
        "cents-per-km-2026-27.json",
        "div7a-benchmark-rate-2026-27.json",
        "fbt-rate.json",
        "gst-registration-threshold.json",
        "instant-asset-write-off-threshold.json",
        "medicare-levy-rate.json",
        "resident-tax-rates-2026-27.json",
        "super-guarantee-rate-2026-27.json",
    ];
    let files: Vec<(&str, &str)> = names.iter().map(|n| (*n, r#"{"value": 42}"#)).collect();
    let good_repo = make_repo(&files);
    assert_eq!(
        pin_rates::run(out_root.path(), &s(&[good_repo.path().to_str().unwrap()])).unwrap(),
        0
    );
    let extract =
        std::fs::read_to_string(out_root.path().join("scripts/rates_dataset_extract.json"))
            .unwrap();
    assert!(extract.contains("car-limit-2026-27") && extract.contains("sha256"));
}

#[test]
fn effective_life_command_covers_usage_errors_write_and_check_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("_data")).unwrap();

    // Help and usage validation
    assert_eq!(effective_life::run(dir.path(), &s(&["--help"])).unwrap(), 0);
    assert_eq!(effective_life::run(dir.path(), &s(&["-h"])).unwrap(), 0);
    assert_eq!(effective_life::run(dir.path(), &[]).unwrap(), 2);
    assert_eq!(
        effective_life::run(dir.path(), &s(&["--write", "--check"])).unwrap(),
        2
    );
    assert_eq!(
        effective_life::run(dir.path(), &s(&["--unknown"])).unwrap(),
        2
    );
    assert_eq!(
        effective_life::run(dir.path(), &s(&["--source"])).unwrap(),
        2
    );
    assert_eq!(
        effective_life::run(dir.path(), &s(&["--check"])).unwrap(),
        2
    );
    assert_eq!(
        effective_life::run(dir.path(), &s(&["--write", "--source", "x.html"])).unwrap(),
        2
    );
    assert_eq!(
        effective_life::run(
            dir.path(),
            &s(&[
                "--write",
                "--source",
                "x.html",
                "--register-id",
                "F2025L00700",
                "--registered",
                "not-a-date",
                "--source-url",
                "https://example.com",
                "--read",
                "2026-01-01",
            ]),
        )
        .unwrap(),
        2
    );

    // Minimal valid ATO determination HTML for roundtrip --write and --check
    let src_html = dir.path().join("det.html");
    let html = concat!(
        "<h1>Income Tax (Effective Life of Depreciating Assets) Determination 2025</h1>",
        "<p>commences on 1 July 2025</p>",
        "<h2>Table A</h2>",
        "<p>Agriculture, forestry and fishing (01110 to 05290)</p>",
        "<table><thead><tr><th>Asset</th><th>Life (years)</th><th>Reviewed</th><th>Date of application</th></tr></thead>",
        "<tbody><tr><td>Tractors</td><td>12</td><td>*</td><td>1 Jul 2025</td></tr></tbody></table>",
        "<h2>Table B</h2>",
        "<table><thead><tr><th>Asset</th><th>Life (years)</th><th>Reviewed</th><th>Date of application</th></tr></thead>",
        "<tbody><tr><td>Laptops</td><td>2</td><td></td><td>1 Jul 2025</td></tr></tbody></table>"
    );
    std::fs::write(&src_html, html).unwrap();
    let src_str = src_html.to_str().unwrap();

    // Non-UTF-8 source errors
    let bad_src = dir.path().join("bad.html");
    std::fs::write(&bad_src, [0xFFu8]).unwrap();
    assert!(
        effective_life::run(
            dir.path(),
            &s(&[
                "--write",
                "--source",
                bad_src.to_str().unwrap(),
                "--register-id",
                "F2025L00700",
                "--registered",
                "2025-06-20",
                "--source-url",
                "https://example.com",
                "--read",
                "2026-01-01",
            ]),
        )
        .is_err()
    );

    // --write -> --check (match) -> tamper -> --check (differs = 1)
    let rc = effective_life::run(
        dir.path(),
        &s(&[
            "--write",
            "--source",
            src_str,
            "--register-id",
            "F2025L00700",
            "--registered",
            "2025-06-20",
            "--source-url",
            "https://www.legislation.gov.au/F2025L00700/latest/text",
            "--read",
            "2026-01-01",
        ]),
    );
    if let Ok(0) = rc {
        assert_eq!(
            effective_life::run(dir.path(), &s(&["--check", "--source", src_str])).unwrap(),
            0
        );
        let data_file = dir.path().join("_data/effective_life_2025.json");
        let body = std::fs::read_to_string(&data_file).unwrap();
        std::fs::write(&data_file, body.replace("Tractors", "Harvesters")).unwrap();
        assert_eq!(
            effective_life::run(dir.path(), &s(&["--check", "--source", src_str])).unwrap(),
            1
        );
    }
}

#[test]
fn agent_skills_covers_manifest_validation_failure_branches_and_happy_path() {
    let repo = common::repository();
    // Committed manifest passes --check
    assert_eq!(agent_skills::run(&repo, &s(&["--check"])).unwrap(), 0);
    assert_eq!(agent_skills::run(&repo, &s(&["--help"])).unwrap(), 0);
    assert_eq!(agent_skills::run(&repo, &[]).unwrap(), 2);

    let dir = tempfile::tempdir().unwrap();
    // Missing manifest -> exit 1
    assert_eq!(agent_skills::run(dir.path(), &s(&["--check"])).unwrap(), 1);

    let mpath = dir.path().join(".well-known/agent-skills/index.json");
    std::fs::create_dir_all(mpath.parent().unwrap()).unwrap();

    // Invalid UTF-8 and invalid JSON -> exit 1
    std::fs::write(&mpath, [0xFFu8]).unwrap();
    assert_eq!(agent_skills::run(dir.path(), &s(&["--check"])).unwrap(), 1);
    std::fs::write(&mpath, "{bad json").unwrap();
    assert_eq!(agent_skills::run(dir.path(), &s(&["--check"])).unwrap(), 1);

    // Non-object root -> Err (AttributeError)
    std::fs::write(&mpath, "[]").unwrap();
    assert!(agent_skills::run(dir.path(), &s(&["--check"])).is_err());

    // Wrong fields in every section -> exit 1
    std::fs::write(
        &mpath,
        r#"{
          "$schema": "https://wrong.example/schema.json",
          "format": "wrong",
          "note": "missing pin reason",
          "source": {
            "release": "v0.0.1",
            "license": "MIT",
            "commit": "not-a-sha",
            "install": ["wrong"]
          },
          "skills": [
            {"name": "BAD NAME", "type": "other", "description": "", "url": "http://bad", "digest": "md5:123"},
            {"name": "ok-skill", "type": "skill-md", "description": "desc", "url": "https://raw.githubusercontent.com/wrong", "digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000"},
            {"name": "ok-skill", "type": "skill-md", "description": "dup", "url": "https://raw.githubusercontent.com/wrong", "digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000"}
          ]
        }"#,
    )
    .unwrap();
    assert_eq!(agent_skills::run(dir.path(), &s(&["--check"])).unwrap(), 1);

    // Empty skills list with valid commit exercises commit-matching URL checks and empty skills error
    std::fs::write(
        &mpath,
        r#"{
          "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
          "format": "duguid.com.au/agent-skills-index/1",
          "note": "Read on 5 November 2026, v0.4.0 was the latest release under Apache-2.0, the licence declared here, so it is pinned",
          "source": {
            "release": "v0.4.0",
            "license": "Apache-2.0",
            "commit": "0123456789abcdef0123456789abcdef01234567",
            "install": ["wrong"]
          },
          "skills": []
        }"#,
    )
    .unwrap();
    assert_eq!(agent_skills::run(dir.path(), &s(&["--check"])).unwrap(), 1);
}

#[test]
fn rates_json_ozzit_favicon_badge_webp_build_site_and_effective_life_pages_commands() {
    let repo = common::repository();

    // rates_json: committed --check, tempdir --write + --check + drift + missing + malformed CSV
    assert_eq!(rates_json::run(&repo, &s(&["--check"])).unwrap(), 0);
    assert_eq!(rates_json::run(&repo, &s(&["--help"])).unwrap(), 0);
    let rdir = tempfile::tempdir().unwrap();
    let sample_csv = rdir.path().join("rates/sample/sample.csv");
    std::fs::create_dir_all(sample_csv.parent().unwrap()).unwrap();
    std::fs::write(&sample_csv, "year,rate\n2026-27,10%\n").unwrap();
    assert_eq!(rates_json::run(rdir.path(), &s(&["--check"])).unwrap(), 1); // missing
    assert_eq!(rates_json::run(rdir.path(), &s(&["--write"])).unwrap(), 0);
    assert_eq!(rates_json::run(rdir.path(), &s(&["--check"])).unwrap(), 0);
    std::fs::write(rdir.path().join("rates/rates.json"), "{}\n").unwrap();
    assert_eq!(rates_json::run(rdir.path(), &s(&["--check"])).unwrap(), 1); // differs
    // Duplicate header & mismatched column count
    std::fs::write(&sample_csv, "a,a\n1,2\n").unwrap();
    assert!(rates_json::build(rdir.path()).is_err());
    std::fs::write(&sample_csv, "a,b\n1\n").unwrap();
    assert!(rates_json::build(rdir.path()).is_err());

    // extract_xero_badge: build_png errors, missing file, non-badge PDF, publish create + idempotent match
    assert!(extract_xero_badge::build_png(&[0; 3], &[0; 4], 2).is_err());
    assert!(extract_xero_badge::build_png(&[0; 12], &[0; 3], 2).is_err());
    let png2 = extract_xero_badge::build_png(&[10; 12], &[255; 4], 2).unwrap();
    let bdir = tempfile::tempdir().unwrap();
    assert_eq!(
        extract_xero_badge::publish(bdir.path(), "cert.pdf", &png2).unwrap(),
        0
    );
    assert_eq!(
        extract_xero_badge::publish(bdir.path(), "cert.pdf", &png2).unwrap(),
        0
    );
    assert_eq!(extract_xero_badge::run(bdir.path(), &[]).unwrap(), 1);
    let fake_pdf = bdir.path().join("fake.pdf");
    std::fs::write(&fake_pdf, b"%PDF-1.4\n%%EOF\n").unwrap();
    assert_eq!(
        extract_xero_badge::run(bdir.path(), &s(&[fake_pdf.to_str().unwrap()])).unwrap(),
        1
    );

    // favicon_render: run on missing svg (=1) and valid svg (=0)
    let fdir = tempfile::tempdir().unwrap();
    assert_eq!(favicon_render::run(fdir.path()).unwrap(), 1);
    copy_file(
        &repo.join("assets/favicon.svg"),
        &fdir.path().join("assets/favicon.svg"),
    );
    assert_eq!(favicon_render::run(fdir.path()).unwrap(), 0);
    assert!(fdir.path().join("favicon.ico").is_file());

    // cash_chart_webp: run on missing dir (Err) and valid PNG copy (Ok(0))
    let cdir = tempfile::tempdir().unwrap();
    assert!(cash_chart_webp::run(cdir.path()).is_err());
    for name in cash_chart_webp::NAMES {
        let rel = format!("{}/{name}.png", cash_chart_webp::CHARTS);
        copy_file(&repo.join(&rel), &cdir.path().join(&rel));
    }
    assert_eq!(cash_chart_webp::run(cdir.path()).unwrap(), 0);

    // ozzit_reference: --help, --check on repo, --write + --check + drift in tempdir
    assert_eq!(ozzit_reference::run(&repo, &s(&["--help"])).unwrap(), 0);
    assert_eq!(ozzit_reference::run(&repo, &s(&["--check"])).unwrap(), 0);
    assert_eq!(ozzit_reference::run(&repo, &s(&["--unknown"])).unwrap(), 2);

    // effective_life_pages::command: --help, --indexnow on repo, missing map error
    assert_eq!(
        effective_life_pages::run(&repo, &s(&["--help"])).unwrap(),
        0
    );
    assert_eq!(
        effective_life_pages::run(&repo, &s(&["--indexnow"])).unwrap(),
        0
    );
    let eldir = tempfile::tempdir().unwrap();
    assert!(effective_life_pages::run(eldir.path(), &s(&["--indexnow"])).is_err());

    // build_site: missing Gemfile/source returns Err cleanly without hanging
    let empty = tempfile::tempdir().unwrap();
    let _ = build_site::build(empty.path(), empty.path());
}
