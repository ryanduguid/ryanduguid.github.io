// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Coverage tests for serve_site, check_links, release_record, check_publication, visibility and site_contracts.
mod common;

use site_tools::check_links::{self, Checker, Clock, NetError, Opened, Opener};
use site_tools::check_publication;
use site_tools::pyjson::{self, Json};
use site_tools::release_record::{self, Live, LiveError};
use site_tools::serve_site;
use site_tools::site_contracts;
use site_tools::visibility;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|v| (*v).to_owned()).collect()
}

#[test]
fn serve_site_covers_mime_dates_and_http_requests() {
    for (path, want) in [
        ("a.html", "text/html"),
        ("a.css", "text/css"),
        ("a.mjs", "text/javascript"),
        ("a.json", "application/json"),
        ("a.svg", "image/svg+xml"),
        ("a.png", "image/png"),
        ("a.webp", "image/webp"),
        ("a.ico", "icon"),
        ("a.woff2", "font/woff2"),
        ("a.xml", "xml"),
        ("a.txt", "text/plain"),
        ("a.csv", "text/csv"),
        ("a.unknownext", "application/octet-stream"),
    ] {
        assert!(serve_site::guess_type(path).contains(want), "{path}");
    }

    assert!(serve_site::parse_http_date("Sun, 06 Nov 1994 08:49:37 GMT").is_some());
    assert!(serve_site::parse_http_date("Sunday, 06-Nov-94 08:49:37 GMT").is_some());
    assert!(serve_site::parse_http_date("Sun Nov  6 08:49:37 1994").is_some());
    assert!(serve_site::parse_http_date("not a date").is_none());

    let site = tempfile::tempdir().unwrap();
    std::fs::write(site.path().join("index.html"), "<!doctype html><p>hi</p>").unwrap();
    std::fs::create_dir_all(site.path().join("sub")).unwrap();
    std::fs::write(site.path().join("sub/index.html"), "<p>sub</p>").unwrap();
    std::fs::write(site.path().join("data.txt"), "hello world").unwrap();

    let listener = serve_site::create_server(0).unwrap();
    let addr = listener.local_addr().unwrap();
    let dir_clone = site.path().to_path_buf();
    std::thread::spawn(move || {
        let _ = serve_site::serve(listener, &dir_clone);
    });

    let send = |raw: &str| -> String {
        let mut s = TcpStream::connect(addr).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        s.write_all(raw.as_bytes()).unwrap();
        let mut buf = Vec::new();
        let _ = s.read_to_end(&mut buf);
        String::from_utf8_lossy(&buf).into_owned()
    };

    assert!(
        send("GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .starts_with("HTTP/1.0 200")
            || send("GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
                .contains(" 200 ")
    );
    assert!(
        send("HEAD /data.txt HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .contains("200")
    );
    assert!(
        send("GET /sub HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").contains("301")
    );
    assert!(
        send("GET /missing HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .contains("404")
    );
    assert!(
        send("POST / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").contains("501")
    );
    assert!(
        send("GET /../secret HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .contains("404")
    );
    assert!(send("GET /data.txt HTTP/1.1\r\nHost: localhost\r\nIf-Modified-Since: Fri, 01 Jan 2099 00:00:00 GMT\r\nConnection: close\r\n\r\n").contains("304"));
}

#[test]
fn check_links_covers_classification_retries_fallbacks_and_checker_flows() {
    assert!(check_links::is_transient(&NetError::Http {
        code: 429,
        reason: "Too Many".into(),
        retry_after: None
    }));
    assert!(check_links::is_transient(&NetError::Http {
        code: 503,
        reason: "Down".into(),
        retry_after: None
    }));
    assert!(!check_links::is_transient(&NetError::Http {
        code: 404,
        reason: "Not Found".into(),
        retry_after: None
    }));
    assert!(check_links::is_transient(&NetError::Timeout(
        "timed out".into()
    )));
    let _ = check_links::is_transient(&NetError::Url("reset".into()));
    assert!(check_links::is_inconclusive(
        "https://web.archive.org/web/2026/https://a.com",
        &NetError::Url("refused".into())
    ));
    assert!(!check_links::is_inconclusive(
        "https://example.com/",
        &NetError::Http {
            code: 404,
            reason: "Not Found".into(),
            retry_after: None
        }
    ));
    assert_eq!(
        check_links::github_blob_raw_url("https://github.com/ryanduguid/Ozzit/blob/main/README.md")
            .as_deref(),
        Some("https://raw.githubusercontent.com/ryanduguid/Ozzit/main/README.md")
    );
    assert_eq!(
        check_links::github_blob_raw_url("https://github.com/other/repo/blob/main/a"),
        None
    );
    assert_eq!(
        check_links::own_repository("https://github.com/ryanduguid/Ozzit/releases").as_deref(),
        Some("ozzit")
    );
    assert!(check_links::is_release_asset_redirect(
        "https://github.com/ryanduguid/Ozzit/releases/download/v1.0.0/a.zip",
        "https://objects.githubusercontent.com/github-production-release-asset-2e65be/x"
    ));
    assert!(check_links::is_sign_in_redirect(
        "https://github.com/ryanduguid/Ozzit/issues/new",
        "https://github.com/login?return_to=https%3A%2F%2Fgithub.com%2Fryanduguid%2FOzzit%2Fissues%2Fnew"
    ));
    assert!(!check_links::is_sign_in_redirect(
        "https://example.com/doc",
        "https://example.com/login?next=/doc"
    ));
    assert!(check_links::annotation("a%b\nc\r").contains("%25"));

    let (hrefs, empty) = check_links::page_hrefs(
        r#"<a href="/a/">a</a><a href="https://example.com">b</a><a href="">c</a>"#,
    );
    assert_eq!(empty, 1);
    assert_eq!(hrefs.len(), 2);

    struct FakeOpener {
        responses: Vec<Result<Opened, NetError>>,
        idx: usize,
    }
    impl Opener for FakeOpener {
        fn open(&mut self, url: &str, _headers: &[(&str, String)]) -> Result<Opened, NetError> {
            let res = self.responses.get(self.idx).cloned().unwrap_or_else(|| {
                Ok(Opened {
                    status: 200,
                    url: url.to_owned(),
                    body: b"{\"archived\":false}".to_vec(),
                })
            });
            self.idx += 1;
            res
        }
    }
    struct FakeClock(f64);
    impl Clock for FakeClock {
        fn sleep(&mut self, seconds: f64) {
            self.0 += seconds;
        }
        fn now(&mut self) -> f64 {
            self.0
        }
    }

    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("index.html"),
        r#"<a href="/missing/">m</a><a href="https://example.com/ok">ok</a>"#,
    )
    .unwrap();

    let mut opener = FakeOpener {
        responses: vec![
            Err(NetError::Http {
                code: 503,
                reason: "Busy".into(),
                retry_after: Some("1".into()),
            }),
            Ok(Opened {
                status: 200,
                url: "https://example.com/ok".into(),
                body: Vec::new(),
            }),
        ],
        idx: 0,
    };
    let mut clock = FakeClock(0.0);
    let mut logs = Vec::new();
    let mut out = |msg: &str| logs.push(msg.to_owned());
    let mut checker = Checker::new(dir.path().to_path_buf(), &mut opener, &mut clock, &mut out);
    checker.transient_warnings = true;
    let offline_fail = checker
        .check_file(&dir.path().join("index.html"), true)
        .unwrap();
    assert!(!offline_fail.is_empty());
    let live_fail = checker
        .check_file(&dir.path().join("index.html"), false)
        .unwrap();
    assert!(!live_fail.is_empty());

    assert_eq!(check_links::run(dir.path(), &s(&["--help"])).unwrap(), 0);
}

#[test]
fn release_record_publication_visibility_and_page_contracts_cover_failure_branches() {
    let repo = common::repository();

    // release_record: --help, --check on repo, verify_live with fake Live
    assert_eq!(release_record::run(&repo, &s(&["--help"])).unwrap(), 0);
    assert_eq!(release_record::run(&repo, &s(&["--check"])).unwrap(), 0);
    let record = release_record::load(&repo).unwrap();
    struct FakeLive;
    impl Live for FakeLive {
        fn json(&mut self, url: &str) -> Result<Json, LiveError> {
            if url.contains("pypi.org") {
                Ok(pyjson::loads(r#"{"info":{"version":"9.9.9"}}"#).unwrap())
            } else if url.contains("registry.modelcontextprotocol.io") {
                Ok(pyjson::loads(r#"{"servers":[]}"#).unwrap())
            } else if url.contains("/releases") {
                Ok(pyjson::loads(r#"[]"#).unwrap())
            } else {
                Err(LiveError::Http(404))
            }
        }
        fn bytes(&mut self, _url: &str) -> Result<Vec<u8>, LiveError> {
            Err(LiveError::Http(404))
        }
    }
    let mut live = FakeLive;
    let mut out = Vec::new();
    let _ = release_record::verify_live(
        &record,
        &mut live,
        &mut release_record::live_versions,
        &mut |line| {
            out.push(line.to_owned());
            Ok(())
        },
    );
    assert!(!out.is_empty());

    // visibility: --help, --check, --template, site_cited_url, bad capture data
    assert_eq!(visibility::run(&repo, &s(&["--help"])).unwrap(), 0);
    assert_eq!(visibility::run(&repo, &s(&["--check"])).unwrap(), 0);
    let prompts = visibility::load_prompts(&repo).unwrap();
    assert!(!visibility::template(&prompts).unwrap().is_empty());
    assert!(visibility::site_cited_url(Some(&Json::str_obj(
        "https://duguid.com.au/rates/"
    ))));
    assert!(!visibility::site_cited_url(Some(&Json::str_obj(
        "https://example.com/"
    ))));
    assert!(!visibility::site_cited_url(None));
    let bad_cap = pyjson::loads(r#"{"schema_version":999,"entries":[]}"#).unwrap();
    assert!(
        !visibility::check_capture_data("bad.json", &bad_cap, &prompts)
            .unwrap()
            .is_empty()
    );

    // check_publication: items, evaluate with fake Fetch (failing & passing)
    let payload =
        pyjson::loads(r#"[{"total_count":1,"check_runs":[{"id":1,"name":"x"}]}]"#).unwrap();
    assert_eq!(
        check_publication::items(&payload, "check_runs")
            .unwrap()
            .len(),
        1
    );
    assert!(check_publication::items(&Json::Null, "check_runs").is_err());
    let mut fake_fetch =
        |endpoint: &str, _allow_404: bool| -> Result<Json, check_publication::Refusal> {
            if endpoint.contains("check-runs") {
                Ok(pyjson::loads(r#"{"check_runs":[]}"#).unwrap())
            } else {
                Ok(pyjson::loads(r#"{"workflow_runs":[]}"#).unwrap())
            }
        };
    let _ = check_publication::evaluate(
        "ryanduguid/Ozzit",
        "0123456789abcdef0123456789abcdef01234567",
        &mut fake_fetch,
    );

    // site_contracts::pages: exercise failure branches on intentionally broken HTML fixtures
    let broken_html = "<!doctype html><html><head><title>Bad</title></head><body><main><h1>X</h1></main></body></html>";
    let mut f = Vec::new();
    site_contracts::check_homepage_contract(broken_html, &mut f);
    site_contracts::check_article_pattern(broken_html, "tools/x/index.html", &mut f);
    site_contracts::check_approved_page_opening(broken_html, "about/index.html", &mut f);
    site_contracts::check_header_review_date(broken_html, "tools/x/index.html", &mut f);
    site_contracts::check_rate_table_region(
        "<main><table><tr><td>1</td></tr></table></main>",
        "rates/x/index.html",
        &mut f,
    );
    site_contracts::check_formula_b_answer(broken_html, &mut f);
    site_contracts::check_calculator_contract(broken_html, &mut f, "");
    site_contracts::check_shared_shell(broken_html, "about/index.html", &mut f);
    site_contracts::check_collection_breadcrumb(broken_html, "tools/x/index.html", &repo, &mut f);
    site_contracts::check_question_answers(
        "<main><section><h2>Q</h2></section></main>",
        "tools/accounting-questions/gst-bas/index.html",
        &mut f,
    );
    assert!(!f.is_empty());
}
