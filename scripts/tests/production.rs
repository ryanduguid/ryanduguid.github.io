//! `site-tools check_production`: the delivery rules on fixed HTML, and the command
//! against a loopback fixture server standing in for the public site.
mod common;
use site_tools::check_production::{
    Findings, REDIRECTS, REQUIRED_HEADERS, header_notes, inspect_headers, inspect_html,
    sitemap_paths,
};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

// The address is only a fixture; the checks never hard-code the real one.
const SOURCE: &str =
    r#"<p>Write to <a href="mailto:someone@example.com">someone@example.com</a>.</p>"#;
const BASE: &str = "https://duguid.com.au";
const NOT_SHIPPED: &str = "a script the site does not ship";

/// A source tree shipping the two modules the fixtures load.
fn shipped() -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("assets")).unwrap();
    for name in ["levy-page.mjs", "view-mode.mjs"] {
        std::fs::write(root.path().join("assets").join(name), "export {};").unwrap();
    }
    root
}

fn inspect(path: &str, delivered: &str) -> Findings {
    let root = shipped();
    inspect_html(path, SOURCE, delivered, root.path(), Some(BASE)).unwrap()
}

#[test]
fn a_mailto_delivered_intact_passes_without_comment() {
    assert_eq!(inspect("/contact/", SOURCE), Findings::default());
}

#[test]
fn an_obfuscated_mailto_fails_the_intact_delivery_requirement() {
    let delivered =
        r#"<p>Write to <a href="/cdn-cgi/l/email-protection#abc">[email&#160;protected]</a>.</p>"#;
    let findings = inspect("/contact/", delivered);
    assert_eq!(findings.failures.len(), 1);
    assert!(findings.failures[0].contains("not delivered intact"));
    assert!(findings.notes.is_empty());
}

#[test]
fn a_missing_mailto_is_a_failure_that_does_not_repeat_the_address() {
    let failures = inspect("/contact/", "<p>Write to us.</p>").failures;
    assert_eq!(
        failures,
        ["/contact/: a mailto link is not delivered intact (missing or obfuscated)"]
    );
    assert!(!failures.iter().any(|f| f.contains("someone@example.com")));
}

#[test]
fn an_unrelated_obfuscation_marker_cannot_hide_a_missing_mailto() {
    let delivered = r#"<p data-path="/cdn-cgi/l/email-protection">Write to us.</p>"#;
    assert_eq!(inspect("/contact/", delivered).failures.len(), 1);
}

#[test]
fn rocket_loader_fails_by_its_loader_script_or_a_retyped_page_script() {
    // The loader is also a script the site does not ship, so it fails both rules.
    for (tag, count) in [
        (
            r#"<script src="/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js" defer></script>"#,
            2,
        ),
        (
            r#"<script type="f08f7cd8f54470ab5e2006e7-module" src="/assets/levy-page.mjs"></script>"#,
            1,
        ),
        (
            r#"<script defer src="/assets/view-mode.mjs" type="f08f7cd8f54470ab5e2006e7-text/javascript"></script>"#,
            1,
        ),
    ] {
        let failures = inspect("/tools/coal-lsl-levy/", &format!("{SOURCE}{tag}")).failures;
        assert_eq!(failures.len(), count, "{tag}");
        assert!(failures[0].contains("Rocket Loader"), "{tag}");
    }
}

#[test]
fn module_scripts_the_page_ships_itself_pass() {
    let delivered = format!(
        r#"{SOURCE}<script type="module" src="/assets/levy-page.mjs"></script><script type="application/ld+json">{{}}</script>"#
    );
    assert!(
        inspect("/tools/coal-lsl-levy/", &delivered)
            .failures
            .is_empty()
    );
}

#[test]
fn a_script_the_site_does_not_ship_fails_same_origin_or_not() {
    for src in [
        "https://duguid.com.au/.webmcp/bridge.js",
        "/.webmcp/bridge.js",
        "https://cdn.example.net/tag.js",
    ] {
        let delivered =
            format!(r#"{SOURCE}<script type="module" src="{src}" data-packs="c2pa"></script>"#);
        let failures = inspect("/tools/", &delivered).failures;
        assert_eq!(failures.len(), 1, "{src}");
        assert!(failures[0].contains(NOT_SHIPPED), "{src}");
    }
}

#[test]
fn a_script_is_read_however_its_tag_is_written_and_resolved_before_it_is_judged() {
    for tag in [
        "<script src='/.webmcp/bridge.js'>",
        "<script src=/.webmcp/bridge.js>",
        r#"<SCRIPT SRC="/.webmcp/bridge.js">"#,
        r#"<script data-note="a>b" src="/.webmcp/bridge.js">"#,
        r#"<script src="/assets/../evil.js">"#,
        r#"<script src="/assets/%2e%2e/evil.js">"#,
        r#"<script src="/cdn-cgi/../evil.js">"#,
        r#"<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js">"#,
        r#"<script src="/assets/not-shipped.mjs">"#,
        r#"<script src="http://[">"#,
    ] {
        let failures = inspect("/tools/", &format!("{SOURCE}{tag}</script>")).failures;
        assert_eq!(failures.len(), 1, "{tag}");
        assert!(failures[0].contains(NOT_SHIPPED), "{tag}");
    }
    let unparseable = inspect(
        "/tools/",
        &format!(r#"{SOURCE}<script src="http://["></script>"#),
    );
    assert_eq!(
        unparseable.failures,
        ["/tools/: delivers a script the site does not ship: an unparseable source"]
    );
    let shipped = format!(
        "{SOURCE}<script type=module src='https://duguid.com.au/assets/levy-page.mjs?v=1'></script>"
    );
    assert!(inspect("/tools/", &shipped).failures.is_empty());
}

#[test]
fn an_inline_script_is_reported_as_a_note_and_a_json_ld_block_is_not() {
    let delivered = format!(
        r#"{SOURCE}<script type="application/ld+json">{{}}</script><script>x()</script><script src="/assets/levy-page.mjs"></script>"#
    );
    let findings = inspect("/contact/", &delivered);
    assert!(findings.failures.is_empty());
    assert_eq!(
        findings.notes,
        ["/contact/: 1 inline script(s) injected on delivery; the page CSP blocks them"]
    );
}

#[test]
fn the_analytics_tag_fails() {
    let delivered = format!(
        r#"{SOURCE}<script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>"#
    );
    let failures = inspect("/", &delivered).failures;
    assert_eq!(failures.len(), 2);
    assert!(failures[0].contains("Cloudflare analytics tag present"));
}

#[test]
fn an_invalid_base_is_refused() {
    let root = shipped();
    assert_eq!(
        inspect_html("/", SOURCE, SOURCE, root.path(), Some("not a url")),
        Err("Invalid URL".to_owned())
    );
}

#[test]
fn sitemap_paths_reads_the_site_paths_out_of_the_sitemap() {
    let xml = "<url><loc>https://duguid.com.au/</loc></url><url><loc>https://duguid.com.au/contact/</loc></url>";
    assert_eq!(sitemap_paths(xml), ["/", "/contact/"]);
}

#[test]
fn a_sampled_report_only_policy_is_a_note_and_its_absence_says_nothing() {
    let policy = "script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'";
    assert_eq!(
        header_notes("/changelog/", Some(policy)),
        [format!("/changelog/: report-only CSP delivered: {policy}")]
    );
    assert!(header_notes("/changelog/", None).is_empty());
    assert!(header_notes("/changelog/", Some("")).is_empty());
}

#[test]
fn a_missing_or_misstated_header_fails_with_both_values_quoted() {
    let failures = inspect_headers("/", &|name| match name {
        "x-content-type-options" => None,
        "referrer-policy" => Some("no-referrer".into()),
        _ => REQUIRED_HEADERS
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, v)| (*v).to_owned()),
    });
    assert_eq!(
        failures,
        [
            r#"/: header x-content-type-options is missing, expected "nosniff""#,
            r#"/: header referrer-policy is "no-referrer", expected "strict-origin-when-cross-origin""#,
        ]
    );
}

/// A site tree with a home page and a contact page that load one shipped module.
fn source_tree() -> (tempfile::TempDir, String) {
    let root = tempfile::tempdir().unwrap();
    for directory in ["assets", "contact"] {
        std::fs::create_dir(root.path().join(directory)).unwrap();
    }
    std::fs::write(root.path().join("assets/fixture.mjs"), "export {};").unwrap();
    let html = format!(r#"{SOURCE}<script type="module" src="/assets/fixture.mjs"></script>"#);
    std::fs::write(root.path().join("index.html"), &html).unwrap();
    std::fs::write(root.path().join("contact/index.html"), &html).unwrap();
    std::fs::write(
        root.path().join("sitemap.xml"),
        "<loc>https://duguid.com.au/</loc><loc>https://duguid.com.au/contact/</loc>",
    )
    .unwrap();
    (root, html)
}

fn cli(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .arg("check_production")
        .args(args)
        .output()
        .unwrap()
}

fn output(run: &Output) -> String {
    String::from_utf8_lossy(&run.stdout).into_owned() + &String::from_utf8_lossy(&run.stderr)
}

#[test]
fn the_cli_uses_the_extracted_artifact_tree_before_and_after_publication() {
    let (root, html) = source_tree();
    let injected = Arc::new(AtomicBool::new(false));
    let seen = Arc::new(Mutex::new(Vec::<Vec<(String, String)>>::new()));
    let port = {
        let (injected, seen) = (injected.clone(), seen.clone());
        common::http::fixture(move |path, headers| {
            seen.lock().unwrap().push(headers.to_vec());
            let host = headers
                .iter()
                .find(|(n, _)| n == "host")
                .map_or("", |(_, v)| v);
            if let Some((_, to)) = REDIRECTS.iter().find(|(from, _)| *from == path) {
                let location = format!("http://{host}{to}");
                return (301, vec![("Location".into(), location)], Vec::new());
            }
            if path == "/" || path == "/contact/" {
                let headers = REQUIRED_HEADERS
                    .iter()
                    .map(|(n, v)| ((*n).to_owned(), (*v).to_owned()))
                    .collect();
                let extra = if injected.load(Ordering::SeqCst) {
                    r#"<script src="/.webmcp/bridge.js"></script>"#
                } else {
                    ""
                };
                return (200, headers, format!("{html}{extra}").into_bytes());
            }
            (404, Vec::new(), Vec::new())
        })
    };
    let base = format!("http://127.0.0.1:{port}");
    let source = root.path().to_str().unwrap();
    let run = |source_only: bool| {
        let mut args = vec!["--source-root", source, "--base", &base];
        if source_only {
            args.push("--source-only");
        }
        cli(&args)
    };
    let verified = run(true);
    assert_eq!(verified.status.code(), Some(0), "{}", output(&verified));
    assert_eq!(
        String::from_utf8_lossy(&verified.stdout).trim_end(),
        "source delivery tree verified (2 pages)"
    );
    assert!(seen.lock().unwrap().is_empty(), "--source-only fetched");
    let passed = run(false);
    assert_eq!(passed.status.code(), Some(0), "{}", output(&passed));
    assert_eq!(
        String::from_utf8_lossy(&passed.stdout).trim_end(),
        "production delivery checks passed (0 notes)"
    );
    // 2 pages, 4 redirects and 4 paths that must stay absent, each asked as a browser.
    let requests = seen.lock().unwrap().clone();
    assert_eq!(requests.len(), 10);
    for headers in &requests {
        let header = |name: &str| {
            headers
                .iter()
                .find(|(n, _)| n == name)
                .map(|(_, v)| v.as_str())
        };
        assert!(header("user-agent").is_some_and(|ua| ua.ends_with("duguid-production-check")));
        assert_eq!(header("accept"), Some("text/html,application/xhtml+xml"));
    }
    injected.store(true, Ordering::SeqCst);
    let failed = run(false);
    assert_eq!(failed.status.code(), Some(1));
    assert!(output(&failed).contains(NOT_SHIPPED));
    std::fs::remove_file(root.path().join("contact/index.html")).unwrap();
    let broken = run(true);
    assert_eq!(broken.status.code(), Some(1));
    assert!(output(&broken).contains("ENOENT: no such file or directory, open"));
}

#[test]
fn the_cli_reports_a_wrong_redirect_a_published_absence_and_a_failed_page() {
    let (root, html) = source_tree();
    let port = common::http::fixture(move |path, _| match path {
        "/" => (
            200,
            REQUIRED_HEADERS[1..]
                .iter()
                .map(|(n, v)| ((*n).to_owned(), (*v).to_owned()))
                .collect(),
            html.clone().into_bytes(),
        ),
        "/engage/" => (
            302,
            vec![("Location".into(), "/elsewhere".into())],
            Vec::new(),
        ),
        "/assets/css/style.css" => (200, Vec::new(), Vec::new()),
        _ => (404, Vec::new(), Vec::new()),
    });
    let base = format!("http://127.0.0.1:{port}");
    let failed = cli(&[
        "--source-root",
        root.path().to_str().unwrap(),
        "--base",
        &base,
    ]);
    assert_eq!(failed.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&failed.stderr);
    let lines: Vec<&str> = stderr.lines().collect();
    assert_eq!(
        lines,
        [
            "/: header strict-transport-security is missing, expected \"max-age=31536000; includeSubDomains\"",
            "/contact/: HTTP 404",
            "/engage/: expected 301 to /, got HTTP 302 /elsewhere",
            "/tools/review-ready-gate/: expected 301 to /tools/workpaper-review-gate/, got HTTP 404",
            "/refusals: expected 301 to /tools/refusals/, got HTTP 404",
            "/refusals/: expected 301 to /tools/refusals/, got HTTP 404",
            "/assets/css/style.css: expected HTTP 404, got 200; the Pages build published a page the site never made",
        ]
    );
}

#[test]
fn the_cli_refuses_a_source_root_without_a_value_and_an_unreachable_site() {
    let missing = cli(&["--source-root"]);
    assert_eq!(missing.status.code(), Some(1));
    assert_eq!(
        String::from_utf8_lossy(&missing.stderr).trim_end(),
        r#"The "paths[0]" argument must be of type string. Received undefined"#
    );
    let (root, _) = source_tree();
    // A port nothing listens on: bind one, then free it.
    let port = std::net::TcpListener::bind(("127.0.0.1", 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let base = format!("http://127.0.0.1:{port}");
    let unreachable = cli(&[
        "--source-root",
        root.path().to_str().unwrap(),
        "--base",
        &base,
    ]);
    assert_eq!(unreachable.status.code(), Some(1));
    assert_eq!(
        String::from_utf8_lossy(&unreachable.stderr).trim_end(),
        "fetch failed"
    );
}

#[test]
fn the_source_tree_is_refused_when_its_sitemap_is_unusable() {
    let (root, _) = source_tree();
    let check = |sitemap: &str| {
        std::fs::write(root.path().join("sitemap.xml"), sitemap).unwrap();
        site_tools::check_production::validate_source(root.path(), Some(BASE))
    };
    assert_eq!(
        check("<loc>https://duguid.com.au/contact/</loc>"),
        Err("Source sitemap has no home page".to_owned())
    );
    assert_eq!(
        check("<loc>https://duguid.com.au/</loc><loc>https://duguid.com.au/../x/</loc>"),
        Err("Source sitemap has an invalid page path".to_owned())
    );
    std::fs::write(
        root.path().join("index.html"),
        "<p>Write to us.</p><script src=\"/x.js\"></script>",
    )
    .unwrap();
    let failed = check("<loc>https://duguid.com.au/</loc>").unwrap_err();
    assert_eq!(
        failed,
        "/: delivers a script the site does not ship: https://duguid.com.au/x.js"
    );
}
