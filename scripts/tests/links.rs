//! scripts/test_check_links.py: deterministic transport tests for the link checker.
use site_tools::check_links::{
    Checker, Clock, NetError, Opened, Opener, github_blob_raw_url, is_accepted_automation_denial,
    is_release_asset_redirect, own_repository,
};
use std::cell::RefCell;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::rc::Rc;

/// Answers in order (the last repeating), recording each requested URL and its headers.
#[derive(Default)]
struct Script {
    answers: VecDeque<Result<Opened, NetError>>,
    requests: Vec<String>,
    headers: Vec<Vec<(String, String)>>,
}

struct Stub(Rc<RefCell<Script>>);

impl Opener for Stub {
    fn open(&mut self, url: &str, headers: &[(&str, String)]) -> Result<Opened, NetError> {
        let mut script = self.0.borrow_mut();
        script.requests.push(url.to_owned());
        script.headers.push(
            headers
                .iter()
                .map(|(k, v)| ((*k).to_owned(), v.clone()))
                .collect(),
        );
        if script.answers.len() > 1 {
            script.answers.pop_front().unwrap()
        } else {
            script.answers.front().cloned().expect("an answer")
        }
    }
}

#[derive(Default)]
struct FakeClock {
    sleeps: Vec<f64>,
    now: f64,
}

struct ClockRef(Rc<RefCell<FakeClock>>);

impl Clock for ClockRef {
    fn sleep(&mut self, seconds: f64) {
        self.0.borrow_mut().sleeps.push(seconds);
    }

    fn now(&mut self) -> f64 {
        self.0.borrow().now
    }
}

fn ok(status: u16, url: &str, body: &str) -> Result<Opened, NetError> {
    Ok(Opened {
        status,
        url: url.into(),
        body: body.as_bytes().to_vec(),
    })
}

fn http(code: u16) -> Result<Opened, NetError> {
    Err(NetError::Http {
        code,
        reason: "Error".into(),
        retry_after: None,
    })
}

fn http_retry(code: u16, header: Option<&str>) -> Result<Opened, NetError> {
    Err(NetError::Http {
        code,
        reason: "limited".into(),
        retry_after: header.map(str::to_owned),
    })
}

const API_OK: &str = r#"{"full_name": "ryanduguid/Ozzit", "archived": false}"#;

struct Harness {
    script: Rc<RefCell<Script>>,
    clock: Rc<RefCell<FakeClock>>,
    printed: Rc<RefCell<Vec<String>>>,
}

impl Harness {
    fn new(answers: Vec<Result<Opened, NetError>>) -> Self {
        Harness {
            script: Rc::new(RefCell::new(Script {
                answers: answers.into(),
                ..Default::default()
            })),
            clock: Rc::new(RefCell::new(FakeClock::default())),
            printed: Rc::new(RefCell::new(Vec::new())),
        }
    }

    fn with<T>(&self, root: PathBuf, f: impl FnOnce(&mut Checker) -> T) -> T {
        let mut opener = Stub(self.script.clone());
        let mut clock = ClockRef(self.clock.clone());
        let printed = self.printed.clone();
        let mut out = move |line: &str| printed.borrow_mut().push(line.to_owned());
        let mut checker = Checker::new(root, &mut opener, &mut clock, &mut out);
        f(&mut checker)
    }

    fn run<T>(&self, f: impl FnOnce(&mut Checker) -> T) -> T {
        self.with(PathBuf::from("."), f)
    }

    fn requests(&self) -> Vec<String> {
        self.script.borrow().requests.clone()
    }

    fn sleeps(&self) -> Vec<f64> {
        self.clock.borrow().sleeps.clone()
    }
}

fn strings(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| (*s).to_owned()).collect()
}

#[test]
fn github_blob_server_error_uses_exact_direct_file_within_retry_budget() {
    for tail in [
        "main/LICENSE",
        "cb1aaf45198fc7e8083936b398de7b4cf052d992/docs/case.md#review",
        "payday-super-checker/v0.1.6/packages/payday-super-checker/workbook.xlsx",
    ] {
        let href = format!("https://github.com/ryanduguid/australian-accounting/blob/{tail}");
        let direct = format!(
            "https://raw.githubusercontent.com/ryanduguid/australian-accounting/{}",
            tail.split('#').next().unwrap()
        );
        let harness = Harness::new(vec![http(503), ok(200, &direct, "")]);
        let looked = Rc::new(RefCell::new(Vec::new()));
        let seen = looked.clone();
        let failures = harness.run(|c| {
            c.lookup_hook = Some(Box::new(move |name: &str| {
                seen.borrow_mut().push(name.to_owned());
                Ok(false)
            }));
            c.check_hrefs("tools/index.html", std::slice::from_ref(&href), false)
                .unwrap()
        });
        assert!(failures.is_empty(), "{failures:?}");
        assert_eq!(harness.requests(), vec![href.clone(), direct.clone()]);
        assert_eq!(harness.sleeps(), vec![1.0]);
        assert_eq!(*looked.borrow(), vec!["australian-accounting".to_owned()]);
    }
}

#[test]
fn direct_file_rejects_redirects_and_non_success_statuses() {
    let href = "https://github.com/ryanduguid/Ozzit/blob/v3.4.2/src/Financial.txt";
    let direct = "https://raw.githubusercontent.com/ryanduguid/Ozzit/v3.4.2/src/Financial.txt";
    for (status, final_url) in [
        (200, direct.replace("v3.4.2", "main")),
        (200, direct.replace("Financial.txt", "Dates.txt")),
        (200, direct.replace("/Ozzit/", "/renamed/")),
        (200, direct.replace("/ryanduguid/", "/another-owner/")),
        (200, direct.replace("https:", "http:")),
        (
            200,
            direct.replace("raw.githubusercontent.com", "example.invalid"),
        ),
        (200, format!("{direct}?signature=synthetic-value")),
        (200, href.replace("v3.4.2", "main")),
        (302, direct.to_owned()),
    ] {
        let harness = Harness::new(vec![http(503), ok(status, &final_url, "")]);
        let error = harness
            .run(|c| c.fetch_final_url(href))
            .unwrap_err()
            .to_string();
        assert!(error.contains("exact HTTPS target"), "{error}");
        assert!(!error.contains("synthetic-value"));
    }
}

#[test]
fn direct_file_errors_fail_with_the_shared_attempt_and_wait_limits() {
    let href = "https://github.com/ryanduguid/Ozzit/blob/v3.4.2/missing.txt";
    let direct = "https://raw.githubusercontent.com/ryanduguid/Ozzit/v3.4.2/missing.txt";
    for (status, count, waits) in [
        (404, 2, vec![1.0]),
        (429, 5, vec![1.0, 2.0, 4.0, 8.0]),
        (503, 5, vec![1.0, 2.0, 4.0, 8.0]),
    ] {
        let mut answers = vec![http(503)];
        answers.extend((1..count).map(|_| http(status)));
        let harness = Harness::new(answers);
        let error = harness.run(|c| c.fetch_final_url(href)).unwrap_err();
        assert!(
            matches!(error, NetError::Http { code, .. } if code == if count == 1 { 503 } else { status })
        );
        let mut expected = vec![href.to_owned()];
        expected.extend((1..count).map(|_| direct.to_owned()));
        assert_eq!(harness.requests(), expected);
        assert_eq!(harness.sleeps(), waits);
    }
}

#[test]
fn file_fallback_keeps_repository_identity_archive_and_lookup_failure_checks() {
    let href = "https://github.com/ryanduguid/Ozzit/blob/v3.4.2/src/Financial.txt";
    let direct = "https://raw.githubusercontent.com/ryanduguid/Ozzit/v3.4.2/src/Financial.txt";
    for (verdict, message) in [
        (Ok(true), "is archived"),
        (Err("renamed repository".to_owned()), "lookup failed"),
        (
            Err("<urlopen error unavailable API>".to_owned()),
            "lookup failed",
        ),
    ] {
        let harness = Harness::new(vec![]);
        let failures = harness.run(|c| {
            c.fetch_hook = Some(Box::new(move |_| Ok((200, direct.to_owned()))));
            c.lookup_hook = Some(Box::new(move |_| verdict.clone()));
            c.check_hrefs("tools/index.html", &[href.to_owned()], false)
                .unwrap()
        });
        assert_eq!(failures.len(), 1);
        assert!(failures[0].contains(message), "{failures:?}");
    }
}

#[test]
fn fallback_scope_excludes_other_routes_owners_and_initial_client_errors() {
    for href in [
        "https://github.com/ryanduguid/Ozzit/tree/v3.4.2/src",
        "https://github.com/ryanduguid/Ozzit/releases/tag/v3.4.2",
        "https://github.com/another-owner/Ozzit/blob/main/README.md",
        "https://github.com.example.invalid/ryanduguid/Ozzit/blob/main/README.md",
        "http://github.com/ryanduguid/Ozzit/blob/main/README.md",
        "https://github.com/ryanduguid/Ozzit/blob/main/README.md?plain=1",
        "https://github.com/ryanduguid/Ozzit/blob/main/../README.md",
    ] {
        let harness = Harness::new(vec![http(503)]);
        assert!(harness.run(|c| c.fetch_final_url(href)).is_err());
        assert_eq!(harness.requests(), vec![href.to_owned(); 5]);
    }
    let href = "https://github.com/ryanduguid/Ozzit/blob/main/README.md";
    for answer in [
        http(403),
        http(404),
        http(429),
        Err(NetError::Url("transport failure".into())),
    ] {
        let harness = Harness::new(vec![answer]);
        assert!(harness.run(|c| c.fetch_final_url(href)).is_err());
        assert!(harness.requests().iter().all(|r| r == href));
    }
}

#[test]
fn http_errors_and_successful_responses() {
    for archived in [false, true] {
        for (status, attempts) in [(403, 1), (504, 5), (999, 1)] {
            let harness = Harness::new(vec![http(status)]);
            let shown = harness.run(|c| {
                if archived {
                    c.fetch_repository_archived("Ozzit").unwrap_err()
                } else {
                    c.fetch_final_url("https://example.com")
                        .unwrap_err()
                        .to_string()
                }
            });
            assert!(shown.contains(&format!("HTTP Error {status}")), "{shown}");
            assert_eq!(harness.requests().len(), attempts);
        }
        let harness = Harness::new(vec![ok(200, "https://example.com/final", API_OK)]);
        harness.run(|c| {
            if archived {
                assert_eq!(c.fetch_repository_archived("Ozzit"), Ok(false));
            } else {
                assert_eq!(
                    c.fetch_final_url("https://example.com"),
                    Ok((200, "https://example.com/final".into()))
                );
            }
        });
        assert_eq!(harness.requests().len(), 1);
        assert!(harness.sleeps().is_empty());
    }
    let harness = Harness::new(vec![ok(200, "", "invalid json")]);
    let error = harness
        .run(|c| c.fetch_repository_archived("Ozzit"))
        .unwrap_err();
    assert!(error.contains("Expecting value"), "{error}");
    assert_eq!(harness.requests().len(), 1);
}

#[test]
fn release_download_checks_canonical_repository_identity() {
    let download = "https://github.com/ryanduguid/Ozzit/releases/download/v3.4.2/ozzit.xlsx";
    for full_name in [
        r#""ryanduguid/renamed""#,
        r#""another-owner/Ozzit""#,
        "null",
        r#""RYANDUGUID/ozzit""#,
    ] {
        let body = format!(r#"{{"full_name": {full_name}, "archived": false}}"#);
        let harness = Harness::new(vec![ok(200, "", &body)]);
        let failures = harness.run(|c| {
            c.fetch_hook = Some(Box::new(|_| {
                Ok((
                    200,
                    "https://release-assets.githubusercontent.com/asset".into(),
                ))
            }));
            c.check_hrefs("tools/ozzit/index.html", &[download.to_owned()], false)
                .unwrap()
        });
        if full_name == r#""RYANDUGUID/ozzit""# {
            assert!(failures.is_empty(), "{failures:?}");
        } else {
            assert_eq!(failures.len(), 1);
            assert!(failures[0].contains("lookup failed"));
        }
    }
}

#[test]
fn pinned_release_download_accepts_only_github_asset_hosts() {
    let download = "https://github.com/ryanduguid/Ozzit/releases/download/v3.4.2/ozzit.xlsx";
    for host in [
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
    ] {
        let harness = Harness::new(vec![]);
        let failures = harness.run(|c| {
            c.fetch_hook = Some(Box::new(move |_| {
                Ok((200, format!("https://{host}/asset")))
            }));
            c.lookup_hook = Some(Box::new(|_| Ok(false)));
            c.check_hrefs("tools/ozzit/index.html", &[download.to_owned()], false)
                .unwrap()
        });
        assert!(failures.is_empty(), "{failures:?}");
    }
    for final_url in [
        "http://release-assets.githubusercontent.com/asset",
        "https://release-assets.githubusercontent.com.example.invalid/asset",
        "https://example.invalid/asset",
        "https://github.com/ryanduguid/renamed/releases/download/v3.4.2/ozzit.xlsx",
    ] {
        assert!(
            !is_release_asset_redirect(download, final_url),
            "{final_url}"
        );
    }
    assert!(!is_release_asset_redirect(
        "https://github.com/ryanduguid/Ozzit/blob/main/README.md",
        "https://release-assets.githubusercontent.com/asset"
    ));
}

#[test]
fn unexpected_redirect_omits_the_query_from_diagnostics() {
    let harness = Harness::new(vec![]);
    let failures = harness.run(|c| {
        c.fetch_hook = Some(Box::new(|_| {
            Ok((
                200,
                "https://example.invalid/asset?signature=synthetic-value".into(),
            ))
        }));
        c.check_hrefs(
            "tools/ozzit/index.html",
            &strings(&["https://github.com/ryanduguid/Ozzit"]),
            false,
        )
        .unwrap()
    });
    assert_eq!(failures.len(), 1);
    assert!(failures[0].contains("rename redirect"));
    assert!(!failures[0].contains("synthetic-value"));
}

#[test]
fn manual_resource_checks_are_exact_and_ci_only() {
    let manual = strings(&[
        "https://www.sbr.gov.au/",
        "https://softwaredevelopers.ato.gov.au/SuperStreamStandard",
        "https://www.abr.gov.au/business-super-funds-charities/applying-abn",
        "https://www.fairwork.gov.au/ending-employment/final-pay",
        "https://www.tpb.gov.au/public-register",
    ]);
    let other: Vec<String> = manual.iter().map(|u| format!("{u}missing")).collect();
    for actions in [true, false] {
        let harness = Harness::new(vec![]);
        let fetched = Rc::new(RefCell::new(Vec::new()));
        let record = fetched.clone();
        let all: Vec<String> = manual.iter().chain(&other).cloned().collect();
        let failures = harness.run(|c| {
            c.actions = actions;
            c.fetch_hook = Some(Box::new(move |url| {
                record.borrow_mut().push(url.to_owned());
                Err(NetError::Timeout("unavailable".into()))
            }));
            c.check_hrefs("tools/index.html", &all, false).unwrap()
        });
        let expected = if actions { other.clone() } else { all.clone() };
        assert_eq!(*fetched.borrow(), expected);
        assert_eq!(failures.len(), expected.len());
        if actions {
            let notices: Vec<String> = harness
                .printed
                .borrow()
                .iter()
                .filter(|l| l.contains("manual verification"))
                .cloned()
                .collect();
            assert_eq!(notices.len(), 5);
        }
    }
}

#[test]
fn linkedin_runner_exception_keeps_local_and_other_profile_404s() {
    let current = "https://www.linkedin.com/in/ryan-duguid";
    let other = format!("{current}-missing");
    for actions in [true, false] {
        let harness = Harness::new(vec![]);
        let fetched = Rc::new(RefCell::new(Vec::new()));
        let record = fetched.clone();
        let failures = harness.run(|c| {
            c.actions = actions;
            c.fetch_hook = Some(Box::new(move |url| {
                record.borrow_mut().push(url.to_owned());
                Err(NetError::Http {
                    code: 404,
                    reason: "Not Found".into(),
                    retry_after: None,
                })
            }));
            c.check_hrefs(
                "about/index.html",
                &[current.to_owned(), other.clone()],
                false,
            )
            .unwrap()
        });
        let expected = if actions {
            vec![other.clone()]
        } else {
            vec![current.to_owned(), other.clone()]
        };
        assert_eq!(*fetched.borrow(), expected);
        assert_eq!(failures.len(), expected.len());
    }
}

#[test]
fn rate_limit_retry_headers_for_both_fetchers() {
    let now = 1_700_000_000.0;
    let date = |seconds: i64| {
        chrono::DateTime::from_timestamp(seconds, 0)
            .unwrap()
            .format("%a, %d %b %Y %H:%M:%S GMT")
            .to_string()
    };
    let cases = [
        (Some("2".to_owned()), 2.0),
        (Some(date(1_700_000_003)), 3.0),
        (Some("Tue Nov 14 22:13:23 2023".to_owned()), 3.0),
        (Some(date(1_699_999_997)), 0.0),
        (None, 1.0),
        (Some("invalid".to_owned()), 1.0),
        (Some("-1".to_owned()), 1.0),
    ];
    for archived in [false, true] {
        for (header, delay) in &cases {
            let harness = Harness::new(vec![
                http_retry(429, header.as_deref()),
                ok(200, "https://example.com/final", API_OK),
            ]);
            harness.clock.borrow_mut().now = now;
            harness.run(|c| {
                if archived {
                    c.fetch_repository_archived("Ozzit").unwrap();
                } else {
                    c.fetch_final_url("https://example.com").unwrap();
                }
            });
            assert_eq!(harness.requests().len(), 2);
            assert_eq!(harness.sleeps(), vec![*delay], "{header:?}");
        }
    }
    assert!(!is_accepted_automation_denial(
        "https://www.linkedin.com/in/ryan-duguid",
        429
    ));
}

#[test]
fn rate_limit_exhaustion_remains_a_failure_with_bounded_waits() {
    for archived in [false, true] {
        for (header, attempts, waits) in [
            (None, 5, vec![1.0, 2.0, 4.0, 8.0]),
            (Some("20"), 2, vec![20.0]),
            (Some("3600"), 1, vec![]),
        ] {
            let harness = Harness::new(vec![http_retry(429, header)]);
            harness.run(|c| {
                if archived {
                    assert!(c.fetch_repository_archived("Ozzit").is_err());
                } else {
                    assert!(c.fetch_final_url("https://example.com").is_err());
                }
            });
            assert_eq!(harness.requests().len(), attempts);
            assert_eq!(harness.sleeps(), waits);
        }
    }
}

#[test]
fn transient_failures_wait_and_exhaust_for_both_fetchers() {
    for archived in [false, true] {
        for error in [
            http(503),
            Err(NetError::Url("temporary transport failure".into())),
            Err(NetError::Timeout("temporary timeout".into())),
        ] {
            let harness = Harness::new(vec![
                error.clone(),
                error.clone(),
                ok(200, "https://example.com/final", API_OK),
            ]);
            harness.run(|c| {
                if archived {
                    assert_eq!(c.fetch_repository_archived("Ozzit"), Ok(false));
                } else {
                    assert_eq!(
                        c.fetch_final_url("https://example.com"),
                        Ok((200, "https://example.com/final".into()))
                    );
                }
            });
            assert_eq!(harness.requests().len(), 3);
            assert_eq!(harness.sleeps(), vec![1.0, 2.0]);

            let harness = Harness::new(vec![error.clone()]);
            harness.run(|c| {
                if archived {
                    assert!(c.fetch_repository_archived("Ozzit").is_err());
                } else {
                    assert!(c.fetch_final_url("https://example.com").is_err());
                }
            });
            assert_eq!(harness.requests().len(), 5);
            assert_eq!(harness.sleeps(), vec![1.0, 2.0, 4.0, 8.0]);
        }
    }
}

#[test]
fn transient_warnings_cover_only_exhausted_rate_limits_server_errors_and_timeouts() {
    let href = "https://example.com/page";
    let dns = || Err(NetError::Url("failed to lookup address information".into()));
    for (answer, transient, shown) in [
        (http(503), true, "HTTP 503"),
        (http(429), true, "HTTP 429"),
        (
            Err(NetError::Timeout("timed out".into())),
            true,
            "timed out",
        ),
        (http(404), false, "HTTP 404"),
        (http(410), false, "HTTP 410"),
        (
            dns(),
            false,
            "<urlopen error failed to lookup address information>",
        ),
    ] {
        for warn in [false, true] {
            let harness = Harness::new(vec![answer.clone()]);
            let (failures, warnings) = harness.run(|c| {
                c.transient_warnings = warn;
                let failures = c
                    .check_hrefs("page.html", &strings(&[href]), false)
                    .unwrap();
                (failures, c.warnings.clone())
            });
            let expected = vec![format!("page.html: {href} -> {shown}")];
            if warn && transient {
                assert!(failures.is_empty(), "{failures:?}");
                assert_eq!(warnings, expected);
            } else {
                assert_eq!(failures, expected);
                assert!(warnings.is_empty(), "{warnings:?}");
            }
        }
    }
    // A link that recovers within its retries is neither a warning nor a failure.
    let harness = Harness::new(vec![http(503), ok(200, href, "")]);
    let (failures, warnings) = harness.run(|c| {
        c.transient_warnings = true;
        let failures = c
            .check_hrefs("page.html", &strings(&[href]), false)
            .unwrap();
        (failures, c.warnings.clone())
    });
    assert!(failures.is_empty() && warnings.is_empty());
    assert_eq!(harness.requests().len(), 2);
}

#[test]
fn transient_own_repository_links_keep_strict_identity_and_archive_lookups() {
    let href = "https://github.com/ryanduguid/Ozzit";
    for (verdict, failure) in [
        (Ok(false), None),
        (Ok(true), Some("ryanduguid/ozzit is archived")),
        (
            Err("renamed".to_owned()),
            Some("archived lookup failed: renamed"),
        ),
    ] {
        let harness = Harness::new(vec![http(503)]);
        let (failures, warnings) = harness.run(|c| {
            c.transient_warnings = true;
            c.lookup_hook = Some(Box::new(move |_| verdict.clone()));
            let failures = c
                .check_hrefs("page.html", &strings(&[href]), false)
                .unwrap();
            (failures, c.warnings.clone())
        });
        assert_eq!(warnings, [format!("page.html: {href} -> HTTP 503")]);
        match failure {
            None => assert!(failures.is_empty(), "{failures:?}"),
            Some(text) => {
                assert_eq!(failures.len(), 1, "{failures:?}");
                assert!(failures[0].contains(text), "{failures:?}");
            }
        }
    }
}

#[test]
fn response_body_timeouts_are_timeouts() {
    use site_tools::check_links::net_error;
    for timeout in [ureq::Timeout::RecvBody, ureq::Timeout::Global] {
        assert_eq!(
            net_error(ureq::Error::Timeout(timeout)),
            NetError::Timeout("timed out".into())
        );
    }
    assert!(matches!(
        net_error(ureq::Error::HostNotFound),
        NetError::Url(_)
    ));
}

#[test]
fn transient_warning_annotations_escape_workflow_command_characters() {
    use site_tools::check_links::annotation;
    assert_eq!(
        annotation("a.html: https://x.test/a%20b -> HTTP 503\r\nnext"),
        "a.html: https://x.test/a%2520b -> HTTP 503%0D%0Anext"
    );
}

#[test]
fn offline_mode_still_checks_local_links_without_external_requests() {
    let dir = tempfile::tempdir().unwrap();
    let page = dir.path().join("index.html");
    std::fs::write(
        &page,
        r#"<a href="/missing/">Missing</a><a href="https://github.com/ryanduguid/Ozzit">Repo</a>"#,
    )
    .unwrap();
    let harness = Harness::new(vec![]);
    let failures = harness.with(dir.path().to_path_buf(), |c| {
        c.fetch_hook = Some(Box::new(|_| panic!("no fetch offline")));
        c.lookup_hook = Some(Box::new(|_| panic!("no lookup offline")));
        c.check_file(&page, true).unwrap()
    });
    assert_eq!(failures.len(), 1);
    assert!(failures[0].contains("same-origin link does not resolve"));
}

#[test]
fn accepts_only_runner_confirmed_denials() {
    for url in [
        "https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation",
        "https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/deductions/deductions-for-motor-vehicle-expenses/cents-per-kilometre-method",
        "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee",
        "https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/small-business-benchmarks",
        "https://www.ato.gov.au/tax-rates-and-codes/company-tax-rates",
        "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate",
        "https://www.ato.gov.au/law/view/view.htm?docid=COG%2FPCG20222%2FNAT%2FATO%2F00001",
        "https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/single-touch-payroll/in-detail/single-touch-payroll-phase-2-employer-reporting-guidelines",
        "https://www.ato.gov.au/law/",
        "https://www.ato.gov.au/individuals-and-families/your-tax-return",
        "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/how-gst-works",
        "https://www.ato.gov.au/",
    ] {
        assert!(is_accepted_automation_denial(url, 403), "{url}");
        for status in [401, 404, 408, 429, 500, 503, 999] {
            assert!(!is_accepted_automation_denial(url, status));
        }
        assert!(!is_accepted_automation_denial(
            &format!("{url}/missing"),
            403
        ));
    }
    assert!(!is_accepted_automation_denial(
        "https://www.ato.gov.au/about-ato",
        403
    ));
    let profile = "https://www.linkedin.com/in/ryan-duguid";
    assert!(is_accepted_automation_denial(profile, 999));
    assert!(
        !is_accepted_automation_denial(profile, 403)
            && !is_accepted_automation_denial(profile, 404)
    );
    assert!(!is_accepted_automation_denial(
        "https://www.linkedin.com/company/example",
        999
    ));
}

#[test]
fn caching_and_retries() {
    // A duplicate URL reuses its successful result.
    let harness = Harness::new(vec![ok(200, "https://example.com/final", "")]);
    harness.run(|c| {
        let first = c.fetch_final_url("https://example.com/duplicate");
        let second = c.fetch_final_url("https://example.com/duplicate");
        assert_eq!(first, second);
    });
    assert_eq!(harness.requests().len(), 1);
    // Transient transport failures and server errors are retried; client errors are not.
    for error in [
        Err(NetError::Url("temporary TLS failure".into())),
        http(500),
    ] {
        let harness = Harness::new(vec![
            error.clone(),
            error,
            ok(200, "https://example.com/final", ""),
        ]);
        harness.run(|c| {
            assert_eq!(
                c.fetch_final_url("https://example.com/start"),
                Ok((200, "https://example.com/final".into()))
            )
        });
        assert_eq!(harness.requests().len(), 3);
    }
    let harness = Harness::new(vec![http(404)]);
    harness.run(|c| assert!(c.fetch_final_url("https://example.com/missing").is_err()));
    assert_eq!(harness.requests().len(), 1);
    let harness = Harness::new(vec![Err(NetError::Url("still unavailable".into()))]);
    harness.run(|c| {
        assert!(
            c.fetch_final_url("https://example.com/unavailable")
                .is_err()
        )
    });
    assert_eq!(harness.requests().len(), 5);
}

#[test]
fn archived_targets() {
    let harness = Harness::new(vec![]);
    let failures = harness.run(|c| {
        c.lookup_hook = Some(Box::new(|name| Ok(name == "payday-super-checker")));
        c.archived_target_failures(
            "tools/payday-super/index.html",
            &strings(&[
                "https://github.com/ryanduguid/payday-super-checker/releases/tag/v0.1.2",
                "https://github.com/ryanduguid/australian-accounting/tree/main/packages/payday-super-checker",
                "https://github.com/XeroAPI/xero-python",
                "/tools/",
            ]),
        )
    });
    assert_eq!(failures.len(), 1);
    assert!(failures[0].contains("ryanduguid/payday-super-checker is archived"));
    assert_eq!(
        own_repository("https://GitHub.com/RyanDuguid/Hardhat-Ledger/releases").as_deref(),
        Some("hardhat-ledger")
    );
    assert_eq!(
        own_repository("https://github.com/XeroAPI/xero-python"),
        None
    );

    // llms.txt links are classified.
    let harness = Harness::new(vec![]);
    let failures = harness.run(|c| {
        c.fetch_hook = Some(Box::new(|href| Ok((200, href.to_owned()))));
        c.lookup_hook = Some(Box::new(|name| Ok(name == "hardhat-ledger")));
        let links = site_tools::pyre::re(r"\]\((https?://[^)\s]+)\)", 0).findall(
            "- [Skills](https://github.com/ryanduguid/australian-accounting-skills): x\n- [Old](https://github.com/ryanduguid/hardhat-ledger): y\n",
        );
        c.check_hrefs("llms.txt", &links, false).unwrap()
    });
    assert_eq!(failures.len(), 1);
    assert!(failures[0].contains("llms.txt: https://github.com/ryanduguid/hardhat-ledger"));

    // A lookup failure is a failure.
    let harness = Harness::new(vec![]);
    let failures = harness.run(|c| {
        c.lookup_hook = Some(Box::new(|_| Err("HTTP Error 403: rate limited".into())));
        c.archived_target_failures(
            "index.html",
            &strings(&["https://github.com/ryanduguid/Ozzit"]),
        )
    });
    assert_eq!(failures.len(), 1);
    assert!(failures[0].contains("archived lookup failed"));

    // The provenance allowlist is scoped to page and repository.
    let hrefs = strings(&[
        "https://github.com/ryanduguid/hardhat-ledger/releases/tag/v0.1.5",
        "https://github.com/ryanduguid/workpaper-review-gate/releases/tag/v0.1.1",
    ]);
    let harness = Harness::new(vec![]);
    let (allowed, other) = harness.run(|c| {
        c.archived_allowlist = vec![("changelog/index.html".into(), vec!["hardhat-ledger".into()])];
        c.lookup_hook = Some(Box::new(|_| Ok(true)));
        (
            c.archived_target_failures("changelog/index.html", &hrefs),
            c.archived_target_failures("index.html", &hrefs),
        )
    });
    assert_eq!(allowed.len(), 1);
    assert!(allowed[0].contains("workpaper-review-gate is archived"));
    assert_eq!(other.len(), 2);

    // The default allowlist lets the about page and llms.txt cite the finished,
    // archived planning-analytics-model, and only those pages; other archived
    // repositories still fail there.
    let hrefs = strings(&[
        "https://github.com/ryanduguid/planning-analytics-model",
        "https://github.com/ryanduguid/hardhat-ledger",
    ]);
    let harness = Harness::new(vec![]);
    let (about, llms, home) = harness.run(|c| {
        c.lookup_hook = Some(Box::new(|_| Ok(true)));
        (
            c.archived_target_failures("about/index.html", &hrefs),
            c.archived_target_failures("llms.txt", &hrefs),
            c.archived_target_failures("index.html", &hrefs),
        )
    });
    for failures in [&about, &llms] {
        assert_eq!(failures.len(), 1);
        assert!(failures[0].contains("hardhat-ledger is archived"));
    }
    assert_eq!(home.len(), 2);
}

/// One repository costs one lookup, and a failed lookup is cached as a failure.
#[test]
fn repository_verdicts_are_cached_including_failures() {
    let harness = Harness::new(vec![
        ok(
            200,
            "",
            r#"{"full_name": "ryanduguid/hardhat-ledger", "archived": true}"#,
        ),
        ok(200, "", API_OK),
        Err(NetError::Url("rate limited".into())),
    ]);
    harness.run(|c| {
        assert_eq!(c.repository_is_archived("hardhat-ledger"), Ok(true));
        assert_eq!(c.repository_is_archived("hardhat-ledger"), Ok(true));
        assert_eq!(c.repository_is_archived("Ozzit"), Ok(false));
        assert!(c.repository_is_archived("broken").is_err());
        assert!(c.repository_is_archived("broken").is_err());
    });
    let requests = harness.requests();
    assert_eq!(
        requests[0],
        "https://api.github.com/repos/ryanduguid/hardhat-ledger"
    );
    assert_eq!(requests[1], "https://api.github.com/repos/ryanduguid/Ozzit");
    // "broken" exhausted its five attempts once and was not asked again.
    assert_eq!(requests.len(), 2 + 5);
}

#[test]
fn the_api_token_is_sent_only_when_present() {
    let harness = Harness::new(vec![ok(200, "", API_OK)]);
    harness.run(|c| {
        c.token = Some("synthetic-token".into());
        c.fetch_repository_archived("Ozzit").unwrap();
    });
    let headers = harness.script.borrow().headers[0].clone();
    assert!(headers.contains(&("Authorization".into(), "Bearer synthetic-token".into())));
    let harness = Harness::new(vec![ok(200, "", API_OK)]);
    harness.run(|c| c.fetch_repository_archived("Ozzit").unwrap());
    assert!(
        harness.script.borrow().headers[0]
            .iter()
            .all(|(k, _)| k != "Authorization")
    );
    assert!(
        github_blob_raw_url("https://github.com/ryanduguid/Ozzit/blob/main/README.md").is_some()
    );
}

/// check_site with every command recorded and none run.
struct Recorder {
    commands: Vec<Vec<String>>,
    event: Option<&'static str>,
    git: NoDiff,
}

/// A merge comparison that cannot be read, so `--ci` keeps the live checks.
struct NoDiff;

impl site_tools::check_site::Git for NoDiff {
    fn run(&mut self, _: &[&str], _: bool) -> Result<String, site_tools::check_site::GitError> {
        Err(site_tools::check_site::GitError::Called)
    }
}

impl site_tools::check_site::Host for Recorder {
    fn event(&self) -> Option<String> {
        self.event.map(str::to_owned)
    }
    fn git(&mut self) -> &mut dyn site_tools::check_site::Git {
        &mut self.git
    }
    fn exe(&self) -> String {
        "site-tools".into()
    }
    fn build(&mut self) -> Result<PathBuf, String> {
        Ok("unused".into())
    }
    fn checked(&mut self, _: &Path) -> Result<PathBuf, String> {
        Ok("unused-checked".into())
    }
    fn run(&mut self, argv: &[String], _: &Path, _: Option<&Path>) -> Result<i32, String> {
        self.commands.push(argv.to_vec());
        Ok(0)
    }
    fn say(&mut self, _: &str) {}
}

#[test]
fn site_runner_passes_link_modes_only_to_the_link_checker() {
    use site_tools::check_site::{CHECKS, Check, main_with};
    for (given, event, passed) in [
        (&[][..], None, &[][..]),
        (&["--offline"][..], None, &["--offline"][..]),
        (&[], Some("pull_request"), &[]),
        (&["--ci"], Some("pull_request"), &["--transient-warnings"]),
        (&["--ci"], Some("schedule"), &[]),
        (&["--ci"], Some("workflow_dispatch"), &[]),
        (&["--ci"], Some("push"), &["--offline"]),
        (&["--ci", "--offline"], Some("pull_request"), &["--offline"]),
    ] {
        let arguments = strings(given);
        let mut host = Recorder {
            commands: Vec::new(),
            event,
            git: NoDiff,
        };
        assert_eq!(main_with(Path::new("."), &arguments, &mut host), Ok(0));
        let words = |items: &[&str]| items.iter().map(|w| (*w).to_owned()).collect::<Vec<_>>();
        let mut expected = vec![
            words(&["site-tools", "build_ozzit_reference", "--check"]),
            words(&["cargo", "test", "--locked", "--test", "build_site"]),
            words(&["cargo", "test", "--locked", "--test", "ci_link_selection"]),
            words(&["cargo", "test", "--locked", "--test", "publication"]),
        ];
        for check in CHECKS {
            let mut argv = check.argv("site-tools");
            if *check == Check::Tool(&["check_links"]) {
                argv.extend(strings(passed));
            }
            expected.push(argv);
        }
        assert_eq!(host.commands, expected, "{arguments:?} {event:?}");
    }
}

/// Answers per URL, the last repeating; an unknown URL times out. Each instance keeps
/// its own count, as each prefetch worker gets a fresh transport.
type Answer = Result<site_tools::check_links::Opened, site_tools::check_links::NetError>;

#[derive(Clone)]
struct Scripted {
    answers: std::sync::Arc<Vec<(String, Vec<Answer>)>>,
    served: std::collections::HashMap<String, usize>,
}

impl site_tools::check_links::Opener for Scripted {
    fn open(
        &mut self,
        url: &str,
        _: &[(&str, String)],
    ) -> Result<site_tools::check_links::Opened, site_tools::check_links::NetError> {
        let Some((_, list)) = self.answers.iter().find(|(u, _)| u == url) else {
            return Err(site_tools::check_links::NetError::Timeout(
                "timed out".into(),
            ));
        };
        let index = self.served.entry(url.to_owned()).or_insert(0);
        let answer = list[(*index).min(list.len() - 1)].clone();
        *index += 1;
        answer
    }
}

struct NoWait;

impl site_tools::check_links::Clock for NoWait {
    fn sleep(&mut self, _: f64) {}
    fn now(&mut self) -> f64 {
        1_700_000_000.0
    }
}

const BLOB: &str = "https://github.com/ryanduguid/Ozzit/blob/v3.4.2/src/Financial.txt";
const RAW: &str = "https://raw.githubusercontent.com/ryanduguid/Ozzit/v3.4.2/src/Financial.txt";

/// Successes, a 503 and 429 retried to success, a 404, a transport failure, and a
/// GitHub file whose 500 falls back to its raw copy.
fn scripted_answers() -> std::sync::Arc<Vec<(String, Vec<Answer>)>> {
    use site_tools::check_links::{NetError, Opened};
    let ok = |url: &str| -> Answer {
        Ok(Opened {
            status: 200,
            url: url.into(),
            body: Vec::new(),
        })
    };
    let http = |code: u16| -> Answer {
        Err(NetError::Http {
            code,
            reason: "Error".into(),
            retry_after: None,
        })
    };
    std::sync::Arc::new(vec![
        (
            "https://example.com/a".into(),
            vec![ok("https://example.com/a")],
        ),
        (
            "https://example.com/b".into(),
            vec![http(503), http(429), ok("https://example.com/final")],
        ),
        ("https://example.com/c".into(), vec![http(404)]),
        (
            "https://example.com/d".into(),
            vec![Err(NetError::Url("transport failure".into()))],
        ),
        (BLOB.into(), vec![http(500)]),
        (RAW.into(), vec![ok(RAW)]),
    ])
}

/// Links in page order, with a same-origin link, an unanswered URL and a repeat.
fn prefetch_hrefs() -> Vec<String> {
    [
        "https://example.com/a",
        "https://example.com/b",
        "/",
        "https://example.com/c",
        BLOB,
        "https://example.com/d",
        "https://example.com/never-answered",
        "https://example.com/b",
    ]
    .iter()
    .map(|h| (*h).to_owned())
    .collect()
}

/// The failures and printed lines of one pass over `hrefs`.
fn report(
    root: &Path,
    answers: &std::sync::Arc<Vec<(String, Vec<Answer>)>>,
    hrefs: &[String],
    prefetched: site_tools::check_links::Prefetched,
) -> (Vec<String>, Vec<String>) {
    let mut opener = Scripted {
        answers: answers.clone(),
        served: Default::default(),
    };
    let mut clock = NoWait;
    let mut printed = Vec::new();
    let mut out = |line: &str| printed.push(line.to_owned());
    let mut checker = site_tools::check_links::Checker::new(
        root.to_path_buf(),
        &mut opener,
        &mut clock,
        &mut out,
    );
    checker.prefetched = prefetched;
    let failures = checker.check_hrefs("page.html", hrefs, false).unwrap();
    drop(checker);
    (failures, printed)
}

#[test]
fn prefetched_links_report_exactly_as_the_sequential_pass() {
    use site_tools::check_links::{Clock, Opener, Prefetched, fetch_targets, prefetch};
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let answers = scripted_answers();
    let hrefs = prefetch_hrefs();
    let sequential = report(root, &answers, &hrefs, Prefetched::new());
    let targets = fetch_targets(&hrefs, false);
    assert!(
        !targets.iter().any(|t| t == "/"),
        "same-origin links are not fetched"
    );
    let transport = || {
        (
            Box::new(Scripted {
                answers: answers.clone(),
                served: Default::default(),
            }) as Box<dyn Opener>,
            Box::new(NoWait) as Box<dyn Clock>,
        )
    };
    let replayed = report(root, &answers, &hrefs, prefetch(root, targets, &transport));
    assert_eq!(replayed, sequential);
    let lines = &sequential.1;
    assert!(
        lines
            .iter()
            .any(|l| l.starts_with("retry 1/4 https://example.com/b"))
    );
    assert!(lines.iter().any(|l| l.starts_with("GitHub file fallback")));
}

/// GitHub API answers: a live repository, an archived one behind a 503, and one
/// transferred elsewhere; a fourth name gets no answer.
fn verdict_answers() -> std::sync::Arc<Vec<(String, Vec<Answer>)>> {
    use site_tools::check_links::{NetError, Opened};
    let api = |name: &str| format!("https://api.github.com/repos/ryanduguid/{name}");
    let body = |text: &str| -> Answer {
        Ok(Opened {
            status: 200,
            url: String::new(),
            body: text.as_bytes().to_vec(),
        })
    };
    let busy: Answer = Err(NetError::Http {
        code: 503,
        reason: "Service Unavailable".into(),
        retry_after: None,
    });
    std::sync::Arc::new(vec![
        (
            api("Ozzit"),
            vec![body(
                r#"{"full_name": "ryanduguid/Ozzit", "archived": false}"#,
            )],
        ),
        (
            api("old"),
            vec![
                busy,
                body(r#"{"full_name": "ryanduguid/old", "archived": true}"#),
            ],
        ),
        (
            api("moved"),
            vec![body(r#"{"full_name": "someone/else", "archived": false}"#)],
        ),
    ])
}

/// The verdicts and printed lines of looking up each name in turn.
fn lookups(
    root: &Path,
    answers: &std::sync::Arc<Vec<(String, Vec<Answer>)>>,
    names: &[String],
    prefetched: site_tools::check_links::PrefetchedVerdicts,
) -> (Vec<Result<bool, String>>, Vec<String>) {
    let mut opener = Scripted {
        answers: answers.clone(),
        served: Default::default(),
    };
    let mut clock = NoWait;
    let mut printed = Vec::new();
    let mut out = |line: &str| printed.push(line.to_owned());
    let mut checker = site_tools::check_links::Checker::new(
        root.to_path_buf(),
        &mut opener,
        &mut clock,
        &mut out,
    );
    checker.prefetched_verdicts = prefetched;
    let verdicts = names
        .iter()
        .map(|n| checker.repository_is_archived(n))
        .collect();
    drop(checker);
    (verdicts, printed)
}

#[test]
fn prefetched_archive_verdicts_replay_exactly() {
    use site_tools::check_links::{Clock, Opener, PrefetchedVerdicts, prefetch_verdicts};
    let answers = verdict_answers();
    let names: Vec<String> = ["Ozzit", "old", "moved", "missing", "old"]
        .iter()
        .map(|n| (*n).to_owned())
        .collect();
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let sequential = lookups(root, &answers, &names, PrefetchedVerdicts::new());
    let transport = || {
        (
            Box::new(Scripted {
                answers: answers.clone(),
                served: Default::default(),
            }) as Box<dyn Opener>,
            Box::new(NoWait) as Box<dyn Clock>,
        )
    };
    let prefetched = prefetch_verdicts(root, names[..4].to_vec(), &transport, None);
    assert_eq!(lookups(root, &answers, &names, prefetched), sequential);
    assert_eq!(sequential.0[1], Ok(true));
    assert!(sequential.1.iter().any(|l| l.starts_with("retry 1/4 old")));
}
