// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Coverage tests for CLI commands, loopback HTTP server edge cases, HTML parser
//! unclosed constructs and ISO-8601 date/time variants.
use site_tools::agent_files;
use site_tools::check_links;
use site_tools::check_publication;
use site_tools::check_site::{self, Host};
use site_tools::effective_life;
use site_tools::effective_life_pages;
use site_tools::htmlparser::{Event, parse};
use site_tools::pytime;
use site_tools::serve_site;
use std::io::{Read, Write};
use std::net::TcpStream;

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|v| (*v).to_owned()).collect()
}

fn send_http(addr: std::net::SocketAddr, request: &[u8]) -> String {
    let mut stream = TcpStream::connect(addr).unwrap();
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(3)))
        .unwrap();
    stream.write_all(request).unwrap();
    let _ = stream.shutdown(std::net::Shutdown::Write);
    let mut response = Vec::new();
    let _ = stream.read_to_end(&mut response);
    String::from_utf8_lossy(&response).into_owned()
}

fn sample_effective_life_html() -> String {
    let header = "<tr><td><p>ASSET</p></td><td><p>LIFE</p><p>(IN YEARS)</p></td>\
        <td><p>REVIEWED</p></td><td><p>LAST UPDATED</p></td></tr>";
    let sp = r#"<span style="width:14.2pt; display:inline-block">&#xa0;</span>"#;
    let r = |n: usize, a: &str, l: &str| {
        let (fl, dt) = if l.is_empty() {
            ("", "")
        } else {
            ("*", "1 Jul 2024")
        };
        format!(
            "<tr><td><p>{}<span>{a}</span></p></td><td><p>{l}</p></td><td><p>{fl}</p></td><td><p>{dt}</p></td></tr>",
            sp.repeat(n)
        )
    };
    let table_a = format!(
        "<table><tr><td colspan=\"4\"><p>Basic inorganic chemical manufacturing</p><p>(18130)</p></td></tr>{header}{}{}{}{}{}</table>         <table><tr><td colspan=\"4\"><p>Concrete product manufacturing</p><p>(20340)</p></td></tr>{header}{}{}{}</table>",
        r(0, "Group", ""),
        r(1, "Subgroup", ""),
        r(2, "Unit", "15"),
        r(
            3,
            "Air filtering units (incorporating filters and housing filters)",
            "10"
        ),
        r(3, "Blowers and compressors (incorporating drives)", "15"),
        r(0, "Plant", ""),
        r(1, "Line", "20"),
        r(2, "Pallets (aluminium used in extrusion process)", "10"),
    );
    let table_b = format!(
        "<table><tr><td><p>A</p></td></tr>{header}\
         <tr><td><p><span>Signs</span></p></td><td><p>10</p></td><td><p>*</p></td><td><p>1 Jul 2005</p></td></tr></table>"
    );
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"><html xmlns="http://www.w3.org/1999/xhtml"><body><p class="ShortT">Test Determination 2025</p><p>Dated 2 September 2025</p><table><tr><td><p>Commencement</p></td><td><p>ignored</p></td></tr></table><p>Table A – Effective life (Industry categories)</p><table><tr><td><p>MINING</p><p>(06000 to 10900)</p></td></tr></table>{table_a}<p>Table B – Effective life (Asset categories)</p>{table_b}</body></html>"#
    )
}

#[test]
fn effective_life_command_write_and_check_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("det.html");
    std::fs::write(&source, sample_effective_life_html()).unwrap();
    std::fs::create_dir_all(dir.path().join(effective_life::DATA_REL).parent().unwrap()).unwrap();
    let src = source.to_string_lossy().into_owned();

    // Missing source directory / bad args
    assert_eq!(
        effective_life::run(dir.path(), &s(&["--write", "--source", &src])).unwrap(),
        2
    );
    assert_eq!(
        effective_life::run(
            dir.path(),
            &s(&[
                "--write",
                "--source",
                &src,
                "--register-id",
                "F2025L00001",
                "--registered",
                "2025-09-02",
                "--source-url",
                "https://www.legislation.gov.au/F2025L00001",
                "--read",
                "2026-11-24",
            ])
        )
        .unwrap(),
        0
    );
    // --check matches committed file
    assert_eq!(
        effective_life::run(dir.path(), &s(&["--check", "--source", &src])).unwrap(),
        0
    );
    // Mutating committed file causes --check exit 1
    let data_path = dir.path().join(effective_life::DATA_REL);
    let committed = std::fs::read_to_string(&data_path).unwrap();
    std::fs::write(&data_path, committed.replace("Signs", "Shovels")).unwrap();
    assert_eq!(
        effective_life::run(dir.path(), &s(&["--check", "--source", &src])).unwrap(),
        1
    );
    // Malformed committed JSON / missing source field errors cleanly
    std::fs::write(&data_path, "{}").unwrap();
    assert!(effective_life::run(dir.path(), &s(&["--check", "--source", &src])).is_err());
    std::fs::write(&data_path, "not json").unwrap();
    assert!(effective_life::run(dir.path(), &s(&["--check", "--source", &src])).is_err());
}

#[test]
fn effective_life_pages_command_write_check_and_indexnow() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("det.html");
    std::fs::write(&source, sample_effective_life_html()).unwrap();
    std::fs::create_dir_all(dir.path().join(effective_life::DATA_REL).parent().unwrap()).unwrap();
    let src = source.to_string_lossy().into_owned();
    assert_eq!(
        effective_life::run(
            dir.path(),
            &s(&[
                "--write",
                "--source",
                &src,
                "--register-id",
                "F2025L00001",
                "--registered",
                "2025-09-02",
                "--source-url",
                "https://www.legislation.gov.au/F2025L00001",
                "--read",
                "2026-11-24",
            ])
        )
        .unwrap(),
        0
    );

    // --indexnow without map fails
    assert!(effective_life_pages::run(dir.path(), &s(&["--indexnow"])).is_err());
    // --write generates pages and map, second --write is idempotent, --check passes
    assert_eq!(
        effective_life_pages::run(dir.path(), &s(&["--write"])).unwrap(),
        0
    );
    assert_eq!(
        effective_life_pages::run(dir.path(), &s(&["--write"])).unwrap(),
        0
    );
    assert_eq!(
        effective_life_pages::run(dir.path(), &s(&["--check"])).unwrap(),
        0
    );
    assert_eq!(
        effective_life_pages::run(dir.path(), &s(&["--indexnow"])).unwrap(),
        0
    );
    // Drift: extra file under asset/ folder triggers --check exit 1
    let stale = dir
        .path()
        .join("tools/depreciation-rates/asset/extra-stale.html");
    std::fs::create_dir_all(stale.parent().unwrap()).unwrap();
    std::fs::write(&stale, "stale").unwrap();
    assert_eq!(
        effective_life_pages::run(dir.path(), &s(&["--check"])).unwrap(),
        1
    );
    // --write removes stale extra file
    assert_eq!(
        effective_life_pages::run(dir.path(), &s(&["--write"])).unwrap(),
        0
    );
    assert!(!stale.exists());
    // Dropping a published asset from data triggers gone-address refusal on both --check and --write
    let data_path = dir.path().join(effective_life::DATA_REL);
    let orig = std::fs::read_to_string(&data_path).unwrap();
    std::fs::write(&data_path, orig.replace("Signs", "Markers")).unwrap();
    assert_eq!(
        effective_life_pages::run(dir.path(), &s(&["--check"])).unwrap(),
        1
    );
    assert_eq!(
        effective_life_pages::run(dir.path(), &s(&["--write"])).unwrap(),
        1
    );
}

#[test]
fn serve_site_http_edge_cases_and_errors() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("index.html"), "<html>ok</html>").unwrap();
    std::fs::write(dir.path().join("data.txt"), "hello world").unwrap();
    std::fs::create_dir(dir.path().join("sub")).unwrap();
    std::fs::write(dir.path().join("sub/index.html"), "<p>sub</p>").unwrap();

    let listener = serve_site::create_server(0).unwrap();
    let addr = listener.local_addr().unwrap();
    let root = dir.path().to_path_buf();
    std::thread::spawn(move || {
        let _ = serve_site::serve(listener, &root);
    });

    assert!(send_http(addr, b"GET / HTTP/2.0\r\n\r\n").contains("505"));
    assert!(send_http(addr, b"GET / NOTHTTP\r\n\r\n").contains("400"));
    assert!(send_http(addr, b"ONLYONEWORD\r\n\r\n").contains("400"));
    assert!(send_http(addr, b"POST /\r\n").contains("400"));
    let _ = send_http(addr, b"GET /data.txt\r\n");
    assert!(send_http(addr, b"POST / HTTP/1.1\r\n\r\n").contains("501"));
    assert!(send_http(addr, b"GET /missing HTTP/1.1\r\n\r\n").contains("404"));
    assert!(send_http(addr, b"GET /sub HTTP/1.1\r\n\r\n").contains("301"));
    let cont = send_http(
        addr,
        b"GET //data.txt HTTP/1.1\r\nExpect: 100-continue\r\nConnection: close\r\nAccept-Encoding: gzip\r\n\r\n",
    );
    assert!(cont.contains("100 Continue") && cont.contains("200 OK"));
    let ims = send_http(
        addr,
        b"GET /data.txt HTTP/1.1\r\nIf-Modified-Since: Sun, 06 Nov 2099 08:49:37 GMT\r\nConnection: close\r\n\r\n",
    );
    assert!(ims.contains("304"));
    let too_many = format!("GET / HTTP/1.1\r\n{}\r\n", "X-A: 1\r\n".repeat(105));
    assert!(send_http(addr, too_many.as_bytes()).contains("431"));
    let long_hdr = format!("GET / HTTP/1.1\r\nX-Big: {}\r\n\r\n", "a".repeat(66_000));
    assert!(send_http(addr, long_hdr.as_bytes()).contains("431"));
    let long_uri = format!("GET /{} HTTP/1.1\r\n\r\n", "a".repeat(66_000));
    assert!(send_http(addr, long_uri.as_bytes()).contains("414"));
    let _ = send_http(addr, b"GET /a%00b HTTP/1.1\r\n\r\n");
}

#[test]
fn check_links_run_offline_pass_fail_and_self_check() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("index.html"),
        "<!doctype html><html><body><a href=\"/404.html\">nf</a></body></html>",
    )
    .unwrap();
    std::fs::write(dir.path().join("llms.txt"), "# Site\n").unwrap();
    // Missing 404.html triggers self_check error
    assert!(check_links::run(dir.path(), &s(&["--offline"])).is_err());

    std::fs::write(
        dir.path().join("404.html"),
        "<!doctype html><html><body>404</body></html>",
    )
    .unwrap();
    assert_eq!(check_links::run(dir.path(), &s(&["--offline"])).unwrap(), 0);

    // Broken internal link triggers exit 1
    std::fs::write(
        dir.path().join("index.html"),
        "<!doctype html><html><body><a href=\"/does-not-exist/\">bad</a></body></html>",
    )
    .unwrap();
    assert_eq!(check_links::run(dir.path(), &s(&["--offline"])).unwrap(), 1);
}

#[test]
fn check_site_system_host_helpers() {
    let dir = tempfile::tempdir().unwrap();
    let rendered = dir.path().join("_site");
    std::fs::create_dir_all(rendered.join("assets")).unwrap();
    std::fs::write(rendered.join("index.html"), "<html></html>").unwrap();
    for d in [
        "scripts/__pycache__",
        "_data",
        "_includes",
        ".agents",
        "docs",
        "assets",
    ] {
        std::fs::create_dir_all(dir.path().join(d)).unwrap();
    }
    std::fs::write(dir.path().join("scripts/__pycache__/skip.pyc"), "x").unwrap();
    std::fs::write(dir.path().join("scripts/keep.txt"), "ok").unwrap();
    for f in [
        "README.md",
        "_config.yml",
        "assets/social-card-template.svg",
        "assets/social-cards.json",
    ] {
        std::fs::write(dir.path().join(f), "x").unwrap();
    }

    let mut sys = check_site::System::new(dir.path());
    let _ = sys.event();
    assert!(!sys.exe().is_empty());
    let checked = sys.checked(&rendered).unwrap();
    assert!(checked.join("scripts/keep.txt").is_file());
    assert!(!checked.join("scripts/__pycache__").exists());
    #[cfg(windows)]
    let (ok_cmd, fail_cmd) = (
        s(&["cmd", "/C", "exit", "0"]),
        s(&["cmd", "/C", "exit", "1"]),
    );
    #[cfg(not(windows))]
    let (ok_cmd, fail_cmd) = (s(&["true"]), s(&["false"]));
    assert_eq!(sys.run(&ok_cmd, dir.path(), Some(&checked)).unwrap(), 0);
    assert_eq!(sys.run(&fail_cmd, dir.path(), None).unwrap(), 1);
}

#[test]
fn check_publication_cli_argument_parsing() {
    assert_eq!(check_publication::run(&s(&["--help"])).unwrap(), 0);
    assert_eq!(check_publication::run(&s(&["--help=1"])).unwrap(), 2);
    assert_eq!(check_publication::run(&s(&[])).unwrap(), 2);
    assert_eq!(
        check_publication::run(&s(&["--repository", "a/b", "--wait-seconds", "nope"])).unwrap(),
        2
    );
    assert_eq!(check_publication::run(&s(&["--repository"])).unwrap(), 2);
    assert_eq!(
        check_publication::run(&s(&[
            "--repository",
            "a/b",
            "--commit",
            "badsha",
            "--",
            "extra",
        ]))
        .unwrap(),
        2
    );
    assert_eq!(
        check_publication::run(&s(&[
            "--repo=a/b",
            "--commit=not-a-sha",
            "--wait-seconds=0",
        ]))
        .unwrap(),
        2
    );
    assert_eq!(
        check_publication::run(&s(&[
            "--repository",
            "bad repo",
            "--commit",
            "0123456789abcdef0123456789abcdef01234567"
        ]))
        .unwrap(),
        2
    );
}

#[test]
fn agent_files_run_and_verify_live_errors() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("scripts")).unwrap();
    std::fs::write(
        dir.path().join("scripts/agent_file_policy.json"),
        r#"{"packages":{}}"#,
    )
    .unwrap();
    std::fs::write(dir.path().join("llms.txt"), "# Clean\n").unwrap();
    assert_eq!(agent_files::run(dir.path(), &[]).unwrap(), 0);
    // Unpinned install in llms.txt fails policy with exit 1
    std::fs::write(dir.path().join("llms.txt"), "Run `pip install requests`\n").unwrap();
    assert_eq!(agent_files::run(dir.path(), &[]).unwrap(), 1);
    // --verify-live with missing/non-object packages errors without network
    std::fs::write(dir.path().join("scripts/agent_file_policy.json"), "{}").unwrap();
    assert!(agent_files::run(dir.path(), &s(&["--verify-live"])).is_err());
    std::fs::write(
        dir.path().join("scripts/agent_file_policy.json"),
        r#"{"packages":{"pypi":123}}"#,
    )
    .unwrap();
    assert!(agent_files::run(dir.path(), &s(&["--verify-live"])).is_err());
}

#[test]
fn htmlparser_unclosed_markup_and_raw_charrefs() {
    for sample in [
        "</",
        "</123",
        "</abc",
        "<!--unclosed--",
        "<!--unclosed--!",
        "<!--unclosed-",
        "<![CDATA[raw",
        "<!doctype html",
        "<!bogus",
        "<?xml pi",
        "&#65; &#x41; &#65",
        "&#zz; &#",
        "&amp; &amp",
        "& 1 &",
    ] {
        let _ = parse(sample, false);
    }
    let cdata = parse("<![CDATA[hi]]><!doctype html>", true);
    assert!(
        cdata
            .iter()
            .any(|e| matches!(e.event, Event::UnknownDecl(_)))
    );
}

#[test]
fn pytime_iso_weeks_compact_dates_and_fractions() {
    for valid in [
        "2026-W01",
        "2026-W01-1",
        "2026W01",
        "2026W011",
        "2020-W53-7",
        "20260115",
        "2026-01-15T12:34:56.123456+10:00",
        "2026-01-15T12:34:56,5Z",
        "2026-01-15T123456Z",
        "2026-W01-1T09:00",
        "2026W011T0900",
    ] {
        assert!(pytime::datetime_fromisoformat(valid).is_some(), "{valid}");
    }
    for bad in [
        "2025-W53-1",
        "2026-W01-8",
        "2026-W0",
        "2026-W01-",
        "2026-W01-99",
        "2026-0115",
        "2026-01-15T12:3",
        "2026-01-15T12:34x",
        "2026-01-15T12:34:56.",
        "2026-01-15T12:34:56.abc",
        "0000-W01-1",
    ] {
        assert!(pytime::datetime_fromisoformat(bad).is_none(), "{bad}");
    }
}
