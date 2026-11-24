// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Pass 2 coverage tests for check_links, check_design, rates_register, release_record,
//! check_publication, ozzit_reference, visibility and agent_files.
use crate::common;

use site_tools::agent_files;
use site_tools::check_design::{self, UpdateError};
use site_tools::check_links::{self, NetError, Opener};
use site_tools::check_publication::{self, Clock as PubClock, Refusal};
use site_tools::ozzit_reference;
use site_tools::py::Date;
use site_tools::pyjson::{self, Json};
use site_tools::rates_register;
use site_tools::release_record::{self, Live, LiveError};
use site_tools::visibility;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|v| (*v).to_owned()).collect()
}

fn write(root: &Path, rel: &str, text: &str) {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, text).unwrap();
}

/// Spawn a local HTTP server on 127.0.0.1 until `/shutdown` is requested.
fn start_local_http() -> (u16, std::thread::JoinHandle<()>) {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let handle = std::thread::spawn(move || {
        while let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 2048];
            let n = stream.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]);
            let first = req.lines().next().unwrap_or("");
            let path = first.split_whitespace().nth(1).unwrap_or("/");
            let response = match path {
                "/ok" | "/shutdown" => {
                    "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"
                }
                "/json" => {
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 9\r\nConnection: close\r\n\r\n{\"a\":123}"
                }
                "/badjson" => {
                    "HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\n{{{"
                }
                "/retry" => {
                    "HTTP/1.1 429 Too Many Requests\r\nRetry-After: 0\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                }
                _ => "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            };
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            if path == "/shutdown" {
                break;
            }
        }
    });
    (port, handle)
}

#[test]
fn check_links_covers_network_opener_self_check_offline_and_local_live_run() {
    // Network::open against local HTTP server (200, 429+Retry-After, 404, non-http scheme)
    let (port, handle) = start_local_http();
    let mut net = check_links::Network;
    assert!(matches!(
        net.open("ftp://example.com/x", &[]),
        Err(NetError::Url(_))
    ));
    let opened = net
        .open(
            &format!("http://127.0.0.1:{port}/ok"),
            &[("User-Agent", "test".into())],
        )
        .unwrap();
    assert_eq!(opened.status, 200);
    assert_eq!(opened.body, b"ok");
    let retry_err = net
        .open(&format!("http://127.0.0.1:{port}/retry"), &[])
        .unwrap_err();
    assert!(matches!(
        retry_err,
        NetError::Http {
            code: 429,
            retry_after: Some(_),
            ..
        }
    ));
    assert!(matches!(
        net.open(&format!("http://127.0.0.1:{port}/missing"), &[]),
        Err(NetError::Http { code: 404, .. })
    ));

    // self_check failure when index.html / 404.html missing
    let empty = tempfile::tempdir().unwrap();
    assert!(check_links::run(empty.path(), &s(&["--offline"])).is_err());

    // Offline pass + online pass against local server (using localhost so odd_spelling accepts the host)
    let ok_dir = tempfile::tempdir().unwrap();
    write(
        ok_dir.path(),
        "index.html",
        &format!(
            "<html><body><a href=\"/404.html#sec\">404</a><a href=\"http://localhost:{port}/ok\">ok</a></body></html>"
        ),
    );
    write(
        ok_dir.path(),
        "404.html",
        "<html><body><p id=\"sec\">Not found</p></body></html>",
    );
    write(
        ok_dir.path(),
        "llms.txt",
        &format!("[ok](http://localhost:{port}/ok)\n"),
    );
    assert_eq!(
        check_links::run(ok_dir.path(), &s(&["--offline"])).unwrap(),
        0
    );
    assert_eq!(check_links::run(ok_dir.path(), &[]).unwrap(), 0);

    // Offline failures: empty href, retired repo name, em/en dashes, broken link, Liquid fragment target
    let bad_dir = tempfile::tempdir().unwrap();
    write(
        bad_dir.path(),
        "index.html",
        "<html><body><a href=\"\">empty</a><a href=\"/404.html#any\">liq</a><p>EquityBot \u{2014} \u{2013}</p><a href=\"/nope/\">nope</a></body></html>",
    );
    write(
        bad_dir.path(),
        "404.html",
        "<html><body>{% assign x = 1 %}{{ x }}</body></html>",
    );
    write(bad_dir.path(), "llms.txt", "");
    assert_eq!(
        check_links::run(bad_dir.path(), &s(&["--offline"])).unwrap(),
        1
    );

    // Online failure via local 404
    let live_bad = tempfile::tempdir().unwrap();
    write(
        live_bad.path(),
        "index.html",
        &format!("<a href=\"http://localhost:{port}/missing\">bad</a>"),
    );
    write(live_bad.path(), "404.html", "<p>404</p>");
    write(live_bad.path(), "llms.txt", "");
    assert_eq!(
        check_links::run(live_bad.path(), &s(&["--transient-warnings"])).unwrap(),
        1
    );

    let _ = net.open(&format!("http://127.0.0.1:{port}/shutdown"), &[]);
    let _ = handle.join();
}

#[test]
fn check_design_covers_stylesheets_fonts_security_homepage_dates_repository_and_update_baseline() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();

    // Missing stylesheets
    let empty_base = Json::Object(vec![]);
    assert!(
        !check_design::check_stylesheets(root, &empty_base)
            .unwrap()
            .is_empty()
    );

    // Bad site.css + bad tokens.css hitting every stylesheet & font-delivery rule
    write(
        root,
        "assets/site.css",
        concat!(
            "@import url('/a.css');\n",
            "body { color: #123456; box-shadow: 0 2px 4px #000; transition: all 1s; }\n",
            ".bad-caps { text-transform: uppercase; letter-spacing: 0.1em; }\n",
            ".byline { border: 1px solid var(--x); }\n",
            ".route-note { border: 1px solid var(--x); }\n",
            ".route-note.boundary { border: 1px solid var(--x); }\n",
        ),
    );
    write(
        root,
        "assets/tokens.css",
        "@font-face { font-family: 'X'; font-display: swap; src: local('Arial'), url('/assets/fonts/big.woff2'); }\n",
    );
    // Oversized font > MAX_FONT_BYTES and > MAX_TOTAL_FONT_BYTES
    std::fs::create_dir_all(root.join("assets/fonts")).unwrap();
    std::fs::write(root.join("assets/fonts/big.woff2"), vec![0u8; 300_000]).unwrap();
    let css_fail = check_design::check_stylesheets(root, &empty_base).unwrap();
    assert!(css_fail.iter().any(|m| m.contains("serial request chain")));
    assert!(css_fail.iter().any(|m| m.contains("raw colour")));
    assert!(css_fail.iter().any(|m| m.contains("tracked capital label")));
    assert!(
        css_fail
            .iter()
            .any(|m| m.contains("font-display: optional"))
    );
    assert!(css_fail.iter().any(|m| m.contains("protected local WOFF2")));
    let font_fail = check_design::check_font_delivery(
        root,
        &std::fs::read_to_string(root.join("assets/tokens.css")).unwrap(),
    )
    .unwrap();
    assert!(font_fail.iter().any(|m| m.contains("delivery budget")));
    assert!(font_fail.iter().any(|m| m.contains("declared fonts total")));

    // stylesheet_links: bad format and invalid calendar date
    write(root, "_config.yml", "asset_version: bad\n");
    assert!(check_design::stylesheet_links(root).unwrap().is_err());
    write(root, "_config.yml", "asset_version: \"20269999\"\n");
    assert!(check_design::stylesheet_links(root).unwrap().is_err());
    write(
        root,
        "_config.yml",
        "asset_version: \"20261124a\"\ninclude:\n  - .well-known\n",
    );
    assert!(check_design::stylesheet_links(root).unwrap().is_ok());

    // security.txt: missing Contact, missing Expires, bad RFC 3339, naive timestamp, missing Canonical
    for content in [
        "NoFields: yes\n",
        "Contact: mailto:a@b\nExpires: not-a-date\n",
        "Contact: mailto:a@b\nExpires: 2029-01-01T00:00:00\n",
    ] {
        write(root, ".well-known/security.txt", content);
        assert!(!check_design::check_security_txt(root).unwrap().is_empty());
    }

    // check_homepage_refinement: missing main, then bad hero/anchors/classes/ordinals
    write(root, "index.html", "<html><body>no main</body></html>");
    assert!(
        !check_design::check_homepage_refinement(root)
            .unwrap()
            .is_empty()
    );
    write(
        root,
        "index.html",
        "<main><div class=\"home-hero__actions\"><a href=\"/tools/\">A</a><a href=\"/tools/\">B</a></div><p class=\"technical-label\">01 / Intro</p></main>",
    );
    let hf = check_design::check_homepage_refinement(root).unwrap();
    assert!(hf.iter().any(|m| m.contains("decorative ordinal")));

    // check_opening_review_dates: bad pattern, invalid date, missing dateModified, non-ISO, mismatch
    let rel = "about/index.html";
    for html in [
        "<main><p class=\"page-meta\">Wrong date format</p></main>",
        "<main><p class=\"page-meta\">Last reviewed 31 February 2026.</p></main>",
        "<main><p class=\"page-meta\">Last reviewed 24 November 2026.</p></main>",
        r#"<script type="application/ld+json">{"dateModified":"not-iso"}</script><main><p class="page-meta">Last reviewed 24 November 2026.</p></main>"#,
        r#"<script type="application/ld+json">{"dateModified":"2026-10-01"}</script><main><p class="page-meta">Last reviewed 24 November 2026.</p></main>"#,
    ] {
        write(root, rel, html);
        let _ = check_design::check_opening_review_dates(root).unwrap();
    }

    // check_repository: non-object baseline error, then object baseline with missing/changed entries + bad proof images
    write(root, "scripts/design_baseline.json", "[]");
    assert!(check_design::check_repository(root).is_err());

    write(root, "assets/coal-lsl-calculator.webp", "not-webp");
    write(root, "assets/coal-lsl-calculator-mobile.webp", "not-webp");
    write(
        root,
        "plain.html",
        r#"<html><head><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><main><a href="/a">A</a><p>hello</p></main></body></html>"#,
    );
    write(
        root,
        "layout.html",
        "---\nlayout: default\n---\n<p>src</p>\n",
    );
    write(
        root,
        "_site/layout.html",
        r#"<html><head><script type="application/ld+json">{"@type":"WebPage"}</script></head><body><main><p>rendered</p></main></body></html>"#,
    );
    write(
        root,
        "no-main.html",
        "<html><body><p>none</p></body></html>",
    );
    write(
        root,
        "scripts/design_baseline.json",
        r#"{
            "protected_files": {"plain.html": "deadbeef", "missing.txt": "00"},
            "protected_main_text": {"plain.html": "deadbeef", "no-main.html": "00", "missing.html": "00"},
            "protected_main_links": {"plain.html": ["/wrong"], "no-main.html": [], "missing.html": []},
            "json_ld": {"plain.html": ["deadbeef"], "missing.html": []},
            "protected_text": {"must-exist": 3},
            "fonts": {"assets/fonts/big.woff2": "deadbeef", "assets/fonts/missing.woff2": "00"}
        }"#,
    );
    let rf = check_design::check_repository(root).unwrap();
    assert!(rf.iter().any(|m| m.contains("protected file changed")));
    assert!(rf.iter().any(|m| m.contains("protected main text changed")));
    assert!(
        rf.iter()
            .any(|m| m.contains("protected main links changed"))
    );
    assert!(rf.iter().any(|m| m.contains("JSON-LD changed")));
    assert!(
        rf.iter()
            .any(|m| m.contains("protected text count changed"))
    );
    assert!(rf.iter().any(|m| m.contains("protected font changed")));
    assert!(rf.iter().any(|m| m.contains("not a WebP container")));

    // update_baseline: success (plain + layout frontmatter -> _site), plus Exit/Raised error branches
    write(
        root,
        "scripts/design_baseline.json",
        r#"{
            "protected_files": {"plain.html": "old"},
            "protected_main_text": {"plain.html": "old", "layout.html": "old"},
            "protected_main_links": {"plain.html": []},
            "json_ld": {"plain.html": []}
        }"#,
    );
    assert!(check_design::update_baseline(root).is_ok());

    write(
        root,
        "bad-ld.html",
        r#"<script type="application/ld+json">{bad}</script><main>x</main>"#,
    );

    write(root, "scripts/design_baseline.json", "[]");
    assert!(matches!(
        check_design::update_baseline(root),
        Err(UpdateError::Raised(_))
    ));
    write(
        root,
        "scripts/design_baseline.json",
        r#"{"protected_files": "not-a-dict"}"#,
    );
    assert!(matches!(
        check_design::update_baseline(root),
        Err(UpdateError::Raised(_))
    ));
    write(
        root,
        "scripts/design_baseline.json",
        r#"{"protected_main_text": {"no-main.html": "old"}}"#,
    );
    assert!(matches!(
        check_design::update_baseline(root),
        Err(UpdateError::Exit(_))
    ));
    write(
        root,
        "scripts/design_baseline.json",
        r#"{"protected_main_links": {"no-main.html": []}}"#,
    );
    assert!(matches!(
        check_design::update_baseline(root),
        Err(UpdateError::Exit(_))
    ));
    write(
        root,
        "scripts/design_baseline.json",
        r#"{"json_ld": {"bad-ld.html": []}}"#,
    );
    assert!(matches!(
        check_design::update_baseline(root),
        Err(UpdateError::Exit(_))
    ));
}

#[test]
fn rates_register_covers_all_row_series_and_register_error_branches() {
    let dir = tempfile::tempdir().unwrap();
    let reg = dir.path().join("rates");
    std::fs::create_dir_all(reg.join("series")).unwrap();

    // Unreadable JSON series
    write(&reg, "series/broken.json", "{not json");
    // Empty rows, wrong schema_version, bad unit/jurisdiction/advice_status/basis
    write(
        &reg,
        "series/empty.json",
        r#"{"schema_version":2,"series_id":"WRONG","unit":"bad","jurisdiction":"mars","advice_status":"nope","basis":{},"rows":[]}"#,
    );
    // Rich series covering unverified, future verified_at, verified_at < period_start,
    // blank verified_by, professional-review + automated, duplicate row_id, bad basis.url,
    // bad cross_checks, missing host https:///path
    let rich = serde_json::json!({
        "schema_version": 1,
        "series_id": "rich",
        "unit": "percent",
        "jurisdiction": "AU",
        "advice_status": "Reference only; check the primary source before acting.",
        "basis": {"instrument": "Act", "provision": "s 1", "url": "https:///nohost"},
        "rows": [
            {
                "row_id": "dup-row",
                "status": "unverified",
                "review": "automated-check",
                "value": "10.0",
                "period_start": "2026-07-01",
                "period_end": null,
                "primary_source": {"title": "T", "url": "https://www.ato.gov.au/x", "publisher": "ATO"},
                "cross_checks": ["http://insecure.example/x"],
                "verified_at": "2026-07-02",
                "verified_by": "Someone"
            },
            {
                "row_id": "dup-row",
                "status": "current",
                "review": "professional-review",
                "value": "10.0",
                "period_start": "2026-07-01",
                "period_end": "2026-06-01",
                "primary_source": {"title": "T"},
                "verified_at": "2099-01-01",
                "verified_by": "automated bot"
            },
            {
                "row_id": "early-verify",
                "status": "current",
                "review": "professional-review",
                "value": "10.0",
                "period_start": "2026-07-01",
                "period_end": null,
                "primary_source": {"title": "T", "url": "https://www.ato.gov.au/x", "publisher": "ATO"},
                "verified_at": "2026-06-01",
                "verified_by": "   "
            }
        ]
    });
    write(&reg, "series/rich.json", &rich.to_string());
    write(
        &reg,
        "register.json",
        r#"{"schema_version":1,"register_version":"2026-11-24","advice_status":"x","series":["series/broken.json","series/empty.json","series/rich.json","series/missing.json"]}"#,
    );
    let failures =
        rates_register::check_register(&reg, Some(Date::new(2026, 11, 24).unwrap())).unwrap();
    assert!(failures.iter().any(|m| m.contains("unreadable")));
    assert!(
        failures
            .iter()
            .any(|m| m.contains("schema_version must be 1"))
    );
    assert!(
        failures
            .iter()
            .any(|m| m.contains("rows must be a non-empty array"))
    );
    assert!(failures.iter().any(|m| m.contains("duplicate row_id")));
    assert!(
        failures
            .iter()
            .any(|m| m.contains("unverified row must not carry"))
    );
    assert!(failures.iter().any(|m| m.contains("verification_note")));
    assert!(failures.iter().any(|m| m.contains("is in the future")));
    assert!(failures.iter().any(|m| m.contains("precedes period_start")));
    assert!(
        failures
            .iter()
            .any(|m| m.contains("Automated retrieval is not professional review"))
    );
    assert!(failures.iter().any(|m| m.contains("verified_by must name")));
    assert!(failures.iter().any(|m| m.contains("has no host")));

    // Non-object series triggers AttributeError
    let bad_obj = dir.path().join("badobj");
    write(&bad_obj, "series/arr.json", "[]");
    write(
        &bad_obj,
        "register.json",
        r#"{"series":["series/arr.json"]}"#,
    );
    assert!(
        rates_register::check_register(&bad_obj, Some(Date::new(2026, 11, 24).unwrap())).is_err()
    );
}

#[test]
fn release_record_covers_network_probes_assets_lag_and_error_paths() {
    // Network::json and Network::bytes against local HTTP server
    let (port, handle) = start_local_http();
    let mut net = release_record::Network;
    assert!(net.json(&format!("http://127.0.0.1:{port}/json")).is_ok());
    assert!(
        net.json(&format!("http://127.0.0.1:{port}/badjson"))
            .is_err()
    );
    assert!(matches!(
        net.json(&format!("http://127.0.0.1:{port}/missing")),
        Err(LiveError::Http(404))
    ));
    assert_eq!(
        net.bytes(&format!("http://127.0.0.1:{port}/ok")).unwrap(),
        b"ok"
    );
    let _ = net.bytes(&format!("http://127.0.0.1:{port}/shutdown"));
    let _ = handle.join();

    // live_versions + live_asset + verify_live across matching, drift, absent, changed, lag, inconclusive
    let record = pyjson::loads(
        r#"{
            "components": {
                "pkg": {
                    "repository": "https://github.com/ryanduguid/demo",
                    "published": {
                        "version": "1.2.0",
                        "release_url": "https://github.com/ryanduguid/demo/releases/tag/v1.2.0",
                        "pypi_url": "https://pypi.org/project/demo/",
                        "registry_url": "https://registry.modelcontextprotocol.io/v0/servers?search=demo",
                        "registry_lag": {"version": "1.1.0", "note": "lagging"},
                        "download_url": "https://example.com/a.zip",
                        "asset_bytes": 4,
                        "asset_sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
                    }
                }
            }
        }"#,
    )
    .unwrap();

    struct MockLive {
        asset: Result<Vec<u8>, LiveError>,
        tags: Vec<String>,
        tag_ok: bool,
        pypi: Result<Json, LiveError>,
        reg: Result<Json, LiveError>,
    }
    impl Live for MockLive {
        fn json(&mut self, url: &str) -> Result<Json, LiveError> {
            if url.contains("pypi.org") {
                self.pypi.clone()
            } else if url.contains("registry.modelcontextprotocol.io") {
                self.reg.clone()
            } else if url.contains("/releases/tags/") {
                if self.tag_ok {
                    Ok(Json::Object(vec![]))
                } else {
                    Err(LiveError::Http(404))
                }
            } else {
                let arr: Vec<Json> = self
                    .tags
                    .iter()
                    .map(|t| Json::Object(vec![("tag_name".into(), Json::Str(t.clone()))]))
                    .collect();
                Ok(Json::Array(arr))
            }
        }
        fn bytes(&mut self, _url: &str) -> Result<Vec<u8>, LiveError> {
            self.asset.clone()
        }
    }

    // 1. All matching (including asset sha256("test") + version comparison v1.2.0 > v1.1.0 + registry lag)
    let mut live1 = MockLive {
        asset: Ok(b"test".to_vec()),
        tags: vec!["v1.1.0".into(), "v1.2.0".into()],
        tag_ok: true,
        pypi: Ok(pyjson::loads(r#"{"info":{"version":"1.2.0"}}"#).unwrap()),
        reg: Ok(
            pyjson::loads(r#"{"servers":[{"server":{"name":"demo","version":"1.1.0"}}]}"#).unwrap(),
        ),
    };
    let mut out1 = Vec::new();
    let code1 = release_record::verify_live(
        &record,
        &mut live1,
        &mut release_record::live_versions,
        &mut |l| {
            out1.push(l.to_owned());
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(code1, 0, "{out1:?}");
    assert!(out1.iter().any(|l| l.contains("asset matches")));

    // 2. Asset changed (wrong bytes, wrong sha256) + HTTP 500 inconclusive + HTTP 404 absent
    let pub_obj = record
        .get("components")
        .unwrap()
        .get("pkg")
        .unwrap()
        .get("published")
        .unwrap();
    for asset_res in [
        Ok(b"wrong-len".to_vec()),
        Ok(b"xxxx".to_vec()),
        Err(LiveError::Http(500)),
        Err(LiveError::Http(404)),
        Err(LiveError::Error("URLError".into(), "boom".into())),
    ] {
        let mut live = MockLive {
            asset: asset_res,
            tags: vec![],
            tag_ok: false,
            pypi: Err(LiveError::Http(503)),
            reg: Err(LiveError::Http(503)),
        };
        assert!(
            release_record::live_asset(&mut live, pub_obj)
                .unwrap()
                .is_some()
        );
    }

    // 3. All probes inconclusive -> exit code 2
    let mut live_outage = MockLive {
        asset: Err(LiveError::Http(503)),
        tags: vec![],
        tag_ok: false,
        pypi: Err(LiveError::Http(503)),
        reg: Err(LiveError::Http(503)),
    };
    let code2 = release_record::verify_live(
        &record,
        &mut live_outage,
        &mut |_, _| {
            Ok(vec![release_record::Probe {
                source: "pypi".into(),
                state: release_record::INCONCLUSIVE,
                detail: "HTTP 503".into(),
            }])
        },
        &mut |_| Ok(()),
    )
    .unwrap();
    assert_eq!(code2, 2);

    // 4. Non-string release_url / version error branches in github_version
    let bad_comp = pyjson::loads(
        r#"{"repository":"https://github.com/ryanduguid/x","published":{"version":123,"release_url":456}}"#,
    )
    .unwrap();
    let probes = release_record::live_versions(&mut live_outage, &bad_comp).unwrap();
    assert!(!probes.is_empty());
    let bad_ver = pyjson::loads(
        r#"{"repository":"https://github.com/ryanduguid/x","published":{"version":null,"release_url":"https://github.com/ryanduguid/x/releases/tag/v1"}}"#,
    )
    .unwrap();
    let probes2 = release_record::live_versions(&mut live_outage, &bad_ver).unwrap();
    assert!(!probes2.is_empty());

    // 5. Malformed download_url in live_asset
    let bad_dl = pyjson::loads(r#"{"download_url":"/relative"}"#).unwrap();
    assert!(release_record::live_asset(&mut live_outage, &bad_dl).is_err());

    // 6. check_record failures reported through run() -> exit 1
    let tmp = tempfile::tempdir().unwrap();
    let repo = common::repository();
    std::fs::create_dir_all(tmp.path().join("scripts")).unwrap();
    std::fs::copy(
        repo.join("scripts/release_record.json"),
        tmp.path().join("scripts/release_record.json"),
    )
    .unwrap();
    // Minimal missing pages causes check_record to either Err or fail
    let _ = release_record::run(tmp.path(), &[]);
}

#[test]
fn check_publication_visibility_agent_files_and_ozzit_reference_cover_cli_and_error_branches() {
    // 1. check_publication::main_with CLI parsing and wait loop
    struct FakePubClock(f64);
    impl PubClock for FakePubClock {
        fn monotonic(&mut self) -> f64 {
            self.0
        }
        fn sleep(&mut self, seconds: f64) {
            self.0 += seconds;
        }
    }
    let mut clock = FakePubClock(0.0);
    let mut ok_eval = |_r: &str, _c: &str| Ok(true);
    let sha = "a".repeat(40);
    assert_eq!(
        check_publication::main_with(&s(&["-h"]), &mut ok_eval, &mut clock),
        0
    );
    assert_eq!(
        check_publication::main_with(&s(&["--help=extra"]), &mut ok_eval, &mut clock),
        2
    );
    assert_eq!(
        check_publication::main_with(&s(&["--repository"]), &mut ok_eval, &mut clock),
        2
    );
    assert_eq!(
        check_publication::main_with(&s(&["--r"]), &mut ok_eval, &mut clock),
        2
    );
    assert_eq!(
        check_publication::main_with(
            &s(&[
                "--rep=ryanduguid/site",
                &format!("--com={sha}"),
                "--wait-seconds=abc"
            ]),
            &mut ok_eval,
            &mut clock
        ),
        2
    );
    assert_eq!(
        check_publication::main_with(
            &s(&[
                "--repository",
                "ryanduguid/site",
                "--commit",
                &sha,
                "--",
                "extra"
            ]),
            &mut ok_eval,
            &mut clock
        ),
        2
    );
    assert_eq!(
        check_publication::main_with(
            &s(&[
                "--repository",
                "bad",
                "--commit",
                &sha,
                "--wait-seconds",
                "999"
            ]),
            &mut ok_eval,
            &mut clock
        ),
        2
    );
    assert_eq!(
        check_publication::main_with(
            &s(&["--rep=ryanduguid/site", &format!("--com={sha}"), "--wait=5"]),
            &mut ok_eval,
            &mut clock
        ),
        0
    );
    // Timeout wait loop (evaluate always returns false)
    let mut clock2 = FakePubClock(0.0);
    let mut pending_eval = |_r: &str, _c: &str| Ok(false);
    assert_eq!(
        check_publication::main_with(
            &s(&[
                "--repository",
                "ryanduguid/site",
                "--commit",
                &sha,
                "--wait-seconds",
                "1"
            ]),
            &mut pending_eval,
            &mut clock2
        ),
        1
    );
    // Refusal error propagation
    let mut err_eval = |_r: &str, _c: &str| Err(Refusal::External);
    assert_eq!(
        check_publication::main_with(
            &s(&["--repository", "ryanduguid/site", "--commit", &sha]),
            &mut err_eval,
            &mut clock2
        ),
        1
    );

    // 2. visibility::run CLI options & errors
    let repo = common::repository();
    assert_eq!(visibility::run(&repo, &s(&["--template"])).unwrap(), 0);
    assert_eq!(visibility::run(&repo, &s(&["--summary"])).unwrap(), 0);
    assert_eq!(
        visibility::run(&repo, &s(&["--summary", "--include-fixtures"])).unwrap(),
        0
    );
    assert_eq!(visibility::run(&repo, &s(&["--help=1"])).unwrap(), 2);
    assert_eq!(
        visibility::run(&repo, &s(&["--check", "--summary"])).unwrap(),
        2
    );
    assert_eq!(visibility::run(&repo, &s(&["--", "extra"])).unwrap(), 2);
    assert_eq!(visibility::run(&repo, &s(&["--bogus"])).unwrap(), 2);
    assert_eq!(
        visibility::run(&repo, &s(&["--check=nonexistent.json"])).unwrap(),
        1
    );

    // 3. agent_files: check() and run() failure & pass branches
    let af_dir = tempfile::tempdir().unwrap();
    write(
        af_dir.path(),
        "scripts/agent_file_policy.json",
        r#"{"packages":{"npm":{"third-party":{"owner":"other"},"exempt-tool":{"owner":"other","local_dependency":true}},"pypi":{"mine":{"owner":"ryanduguid"}}}}"#,
    );
    write(
        af_dir.path(),
        "llms.txt",
        concat!(
            "Invisible \u{200B} char\n",
            "```sh\n",
            "pip install -r reqs.txt\n",
            "npm install unknown-pkg@1.0.0\n",
            "npm install third-party\n",
            "npx exempt-tool\n",
            "pip install mine\n",
            "```\n"
        ),
    );
    assert!(agent_files::check(af_dir.path(), &Json::Array(vec![])).is_err());
    assert_eq!(agent_files::run(af_dir.path(), &[]).unwrap(), 1);
    write(af_dir.path(), "llms.txt", "```sh\npip install mine\n```\n");
    assert_eq!(agent_files::run(af_dir.path(), &[]).unwrap(), 0);

    // 4. ozzit_reference: error branches on synthetic temp root + run --write/--check
    let oz_dir = tempfile::tempdir().unwrap();
    let oz = oz_dir.path();
    write(
        oz,
        "scripts/release_record.json",
        r#"{"components":{"ozzit":{"documented":{"tag":"v1.0.0","version":"1.0.0","asset_sha256":"abc"},"published":{"version":"1.0.0","asset_sha256":"abc"}}}}"#,
    );
    // Duplicate function name in CSV
    write(
        oz,
        "assets/ozzit-functions-v1.0.0.csv",
        "function,signature,module,description\noz.Foo,Foo(x),Core,desc\noz.Foo,Foo(x),Core,desc\n",
    );
    assert!(ozzit_reference::render_index(oz).is_err());
    // Duplicate fragment anchor (oz.Foo_Bar and oz.Foo-Bar)
    write(
        oz,
        "assets/ozzit-functions-v1.0.0.csv",
        "function,signature,module,description\noz.Foo_Bar,Foo_Bar(x),Core,desc\noz.Foo-Bar,Foo-Bar(x),Core,desc\n",
    );
    assert!(ozzit_reference::render_index(oz).is_err());
    // Unknown module page
    write(
        oz,
        "assets/ozzit-functions-v1.0.0.csv",
        "function,signature,module,description\noz.Foo,Foo(x),NoSuchModule,desc\n",
    );
    assert!(ozzit_reference::render_index(oz).is_err());
    // Bad signature
    write(
        oz,
        "assets/ozzit-functions-v1.0.0.csv",
        "function,signature,module,description\noz.Foo,Bar(x),Core,desc\n",
    );
    assert!(ozzit_reference::render_index(oz).is_err());
    // Missing asset_sha256 in release_record
    write(
        oz,
        "scripts/release_record.json",
        r#"{"components":{"ozzit":{"documented":{"tag":"v1.0.0","version":"1.0.0"},"published":{"version":"2.0.0","asset_sha256":"abc"}}}}"#,
    );
    assert!(ozzit_reference::documented_release(oz).is_err());
    // Run --write on a temp copy of the real Ozzit inputs to cover write + stale check paths
    let oz_real = tempfile::tempdir().unwrap();
    let or = oz_real.path();
    let (tag, _) = ozzit_reference::documented_release(&repo).unwrap();
    for rel in [
        "scripts/release_record.json".to_owned(),
        "scripts/ozzit_reference_examples.json".to_owned(),
        format!("assets/ozzit-functions-{tag}.csv"),
        format!("assets/ozzit-reference-{tag}.json"),
        format!("assets/ozzit-function-reference-{tag}.json"),
        "tools/ozzit/index.html".to_owned(),
        "tools/index.html".to_owned(),
        "index.html".to_owned(),
        "llms.txt".to_owned(),
    ] {
        let src = repo.join(&rel);
        let dst = or.join(&rel);
        std::fs::create_dir_all(dst.parent().unwrap()).unwrap();
        std::fs::copy(src, dst).unwrap();
    }
    // Also copy any example_evidence release JSON if referenced
    let ref_json = pyjson::loads(
        &std::fs::read_to_string(or.join(format!("assets/ozzit-reference-{tag}.json"))).unwrap(),
    )
    .unwrap();
    if let Some(ev) = ref_json.get("example_evidence")
        && let Some(Json::Str(ev_rel)) = ev.get("release")
    {
        let ev_path = format!("assets/ozzit-reference-{ev_rel}.json");
        std::fs::copy(repo.join(&ev_path), or.join(&ev_path)).unwrap();
    }
    assert_eq!(ozzit_reference::run(or, &s(&["--check"])).unwrap(), 1);
    assert_eq!(ozzit_reference::run(or, &s(&["--write"])).unwrap(), 0);
    assert_eq!(ozzit_reference::run(or, &s(&["--check"])).unwrap(), 0);
    // Break one count on tools/ozzit/index.html -> count_failures returns failure -> run returns 1
    write(
        or,
        "tools/ozzit/index.html",
        "<p>all 9999 named formulas</p>",
    );
    assert_eq!(ozzit_reference::run(or, &s(&["--check"])).unwrap(), 1);
}

#[test]
fn validators_pass2b_covers_design_favicon_rates_supersedes_release_lag_ozzit_and_links() {
    use site_tools::check_links::Clock as LinkClock;

    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();

    // 1. check_design: check_favicon, check_favicon_assets, check_cash_chart_copies, baseline_items/keys errors
    write(root, "assets/favicon.svg", "<svg bad");
    assert!(
        check_design::check_favicon(root)
            .unwrap()
            .iter()
            .any(|m| m.contains("not valid SVG"))
    );
    write(
        root,
        "assets/favicon.svg",
        r#"<svg viewBox="0 0 32 32"></svg>"#,
    );
    assert!(
        check_design::check_favicon(root)
            .unwrap()
            .iter()
            .any(|m| m.contains("0 0 64 64"))
    );
    write(
        root,
        "assets/favicon.svg",
        r#"<svg viewBox="0 0 64 64"><text>A</text></svg>"#,
    );
    assert!(
        check_design::check_favicon(root)
            .unwrap()
            .iter()
            .any(|m| m.contains("geometric shapes"))
    );
    write(
        root,
        "assets/favicon.svg",
        r##"<svg viewBox="0 0 64 64"><rect x="0" y="0" width="64" height="64" fill="#123456"/></svg>"##,
    );
    assert!(
        check_design::check_favicon(root)
            .unwrap()
            .iter()
            .any(|m| m.contains("outside OLED palette"))
    );
    write(
        root,
        "assets/favicon.svg",
        r##"<svg viewBox="0 0 64 64"><rect x="1.5" y="0" width="64" height="64" fill="#000000"/></svg>"##,
    );
    assert!(
        check_design::check_favicon(root)
            .unwrap()
            .iter()
            .any(|m| m.contains("whole pixels"))
    );
    // Valid favicon.svg with missing/corrupt PNG rasters
    write(
        root,
        "assets/favicon.svg",
        r##"<svg viewBox="0 0 64 64"><rect x="0" y="0" width="64" height="64" fill="#000000"/></svg>"##,
    );
    write(root, "assets/favicon-48.png", "not-a-png");
    let fav_a = check_design::check_favicon_assets(root).unwrap();
    assert!(fav_a.iter().any(|m| m.contains("raster missing")));
    assert!(fav_a.iter().any(|m| m.contains("raster out of date")));

    // Corrupt cash chart PNG/WebP pair
    write(
        root,
        "assets/examples/quarter-close-to-forecast/cash-forecast.png",
        "bad",
    );
    write(
        root,
        "assets/examples/quarter-close-to-forecast/cash-forecast.webp",
        "bad",
    );
    assert!(
        !check_design::check_cash_chart_copies(root)
            .unwrap()
            .is_empty()
    );

    // baseline_items error + protected_asset_digest .txt branch
    write(root, "assets/fonts/note.txt", "hello\r\n");
    write(
        root,
        "scripts/design_baseline.json",
        r#"{"fonts":{"assets/fonts/note.txt":"deadbeef"}}"#,
    );
    assert!(!check_design::check_repository(root).unwrap().is_empty());
    write(
        root,
        "scripts/design_baseline.json",
        r#"{"protected_files": 123}"#,
    );
    assert!(check_design::check_repository(root).is_err());

    // 2. rates_register: supersedes errors, bad schemas, non-object register, py_sorted & run() failure
    let rroot = tmp.path().join("rates-site");
    let reg = rroot.join("rates/register");
    let sup_series = serde_json::json!({
        "schema_version": 1,
        "series_id": "sup",
        "unit": "percent",
        "jurisdiction": "AU",
        "advice_status": "Reference only; check the primary source before acting.",
        "basis": {"instrument": "Act", "provision": "s 1"},
        "rows": [
            {
                "row_id": "r-old",
                "status": "superseded",
                "review": "automated-check",
                "value": "5.0",
                "period_start": "2025-07-01",
                "period_end": "2026-06-30",
                "primary_source": {"title": "T", "url": "https://www.ato.gov.au/x", "publisher": "ATO"},
                "verified_at": "2025-08-01",
                "verified_by": "bot",
                "supersedes": "r-old"
            },
            {
                "row_id": "r-bad-type",
                "status": "superseded",
                "review": "automated-check",
                "value": "6.0",
                "period_start": "2025-07-01",
                "period_end": "2026-06-30",
                "primary_source": {"title": "T", "url": "https://www.ato.gov.au/x", "publisher": "ATO"},
                "verified_at": "2025-08-01",
                "verified_by": "bot",
                "supersedes": 123
            },
            {
                "row_id": "r-unknown",
                "status": "current",
                "review": "automated-check",
                "value": "7.0",
                "period_start": "2026-07-01",
                "period_end": null,
                "primary_source": {"title": "T", "url": "https://www.ato.gov.au/x", "publisher": "ATO"},
                "verified_at": "2026-08-01",
                "verified_by": "bot",
                "supersedes": "does-not-exist"
            },
            {
                "row_id": "r-sup-sup",
                "status": "superseded",
                "review": "automated-check",
                "value": "8.0",
                "period_start": "2025-07-01",
                "period_end": "2026-06-30",
                "primary_source": {"title": "T", "url": "https://www.ato.gov.au/x", "publisher": "ATO"},
                "verified_at": "2025-08-01",
                "verified_by": "bot",
                "supersedes": "r-old"
            },
            {
                "row_id": "r-live-a",
                "status": "current",
                "review": "automated-check",
                "value": "9.0",
                "period_start": "2026-01-01",
                "period_end": null,
                "primary_source": {"title": "T", "url": "https://www.ato.gov.au/x", "publisher": "ATO"},
                "verified_at": "2026-02-01",
                "verified_by": "bot",
                "supersedes": "r-old"
            }
        ]
    });
    write(&reg, "series/sup.json", &sup_series.to_string());
    write(&reg, "schema/rates-register.schema.json", "{bad json");
    write(
        &reg,
        "schema/register.schema.json",
        r#"{"$id":"https://wrong"}"#,
    );
    write(
        &reg,
        "register.json",
        r#"{"schema_version":1,"register_version":"2026.11.24","advice_status":"x","series":["series/sup.json"]}"#,
    );
    write(&rroot, "rates/empty-table/note.txt", "no csv");
    assert_eq!(rates_register::run(&rroot).unwrap(), 1);

    // Non-object register & schema, plus py_sorted numeric and incomparable types
    write(&reg, "schema/register.schema.json", "[]");
    assert!(rates_register::check_register(&reg, Some(Date::new(2026, 11, 24).unwrap())).is_err());
    write(&reg, "register.json", "[]");
    assert!(rates_register::check_register(&reg, Some(Date::new(2026, 11, 24).unwrap())).is_err());
    write(
        &reg,
        "register.json",
        r#"{"schema_version":1,"register_version":"2026.11.24","advice_status":"x","series":[2, 1.5, true]}"#,
    );
    let _ = rates_register::check_register(&reg, Some(Date::new(2026, 11, 24).unwrap()));
    write(
        &reg,
        "register.json",
        r#"{"schema_version":1,"register_version":"2026.11.24","advice_status":"x","series":[1, "a"]}"#,
    );
    assert!(rates_register::check_register(&reg, Some(Date::new(2026, 11, 24).unwrap())).is_err());

    // 3. release_record: check_registry_lag, check_mentions, live_item / mapping errors
    let rel_dir = tmp.path().join("rel");
    write(&rel_dir, "page.html", "<main><p>wrong text</p></main>");
    let lag_rec = pyjson::loads(
        r#"{
            "components": {
                "demo": {
                    "repository": "https://github.com/ryanduguid/demo",
                    "published": {
                        "version": "1.0.0",
                        "tag": "v1.0.0",
                        "release_url": "https://github.com/ryanduguid/demo/releases/tag/v1.0.0",
                        "registry_lag": {"version": "1.0.0", "sentence": "no ver here"}
                    },
                    "published_mentions": [
                        {"page": "page.html", "text": "v{version} {unknown_pin}"},
                        {"page": "missing.html", "text": "v{version}"},
                        {"page": "page.html", "text": "v{version}"}
                    ],
                    "documented": {"tag": "v1.0.0", "version": "1.0.0"}
                }
            },
            "evaluations": {}
        }"#,
    )
    .unwrap();
    let rf = release_record::check_record(&rel_dir, &lag_rec).unwrap();
    assert!(
        rf.iter()
            .any(|m| m.contains("registry_lag needs published.registry_url"))
    );
    assert!(
        rf.iter()
            .any(|m| m.contains("registry_lag needs documented.page"))
    );
    assert!(
        rf.iter()
            .any(|m| m.contains("names 1.0.0, the published version"))
    );
    assert!(rf.iter().any(|m| m.contains("sentence must name 1.0.0")));
    assert!(rf.iter().any(|m| m.contains("unknown field {unknown_pin}")));
    assert!(rf.iter().any(|m| m.contains("missing page")));
    assert!(rf.iter().any(|m| m.contains("does not show")));

    // live_versions with non-object responses triggering live_item & mapping errors
    struct BadJsonLive(Json);
    impl Live for BadJsonLive {
        fn json(&mut self, _url: &str) -> Result<Json, LiveError> {
            Ok(self.0.clone())
        }
        fn bytes(&mut self, _url: &str) -> Result<Vec<u8>, LiveError> {
            Err(LiveError::Contradiction("mismatch".into()))
        }
    }
    let probe_comp = pyjson::loads(
        r#"{"repository":"https://github.com/ryanduguid/demo","published":{"version":"1.0.0","release_url":"https://github.com/ryanduguid/demo/releases/tag/v1.0.0","pypi_url":"https://pypi.org/project/demo/","registry_url":"https://registry.modelcontextprotocol.io/v0/servers?search=demo","download_url":"https://example.com/a.zip"}}"#,
    )
    .unwrap();
    for bad in [
        Json::Array(vec![]),
        Json::str_obj("str"),
        Json::Int(1.into()),
    ] {
        let mut live = BadJsonLive(bad);
        let _ = release_record::live_versions(&mut live, &probe_comp).unwrap();
        let _ =
            release_record::live_asset(&mut live, probe_comp.get("published").unwrap()).unwrap();
    }

    // 4. ozzit_reference::render error branches (example_evidence bad tag, bad cases, bad count, bad shape/template)
    let oz = tmp.path().join("oz-err");
    write(
        &oz,
        "scripts/release_record.json",
        r#"{"components":{"ozzit":{"documented":{"tag":"v1.0.0","version":"1.0.0","asset_sha256":"abc"},"published":{"version":"1.0.0","asset_sha256":"abc"}}}}"#,
    );
    write(
        &oz,
        "assets/ozzit-functions-v1.0.0.csv",
        "function,signature,module,description\noz.Foo,Foo(x),Core,desc\n",
    );
    write(
        &oz,
        "scripts/ozzit_reference_examples.json",
        r#"[{"id":"e1","function":"oz.Foo","title":"T","formula":"=oz.Foo(1)","note":"n","result_shape":[1],"expected_template":"{0}","expected":"1"}]"#,
    );
    // Bad example_evidence tag (same as documented)
    write(
        &oz,
        "assets/ozzit-reference-v1.0.0.json",
        r#"{"release":"v1.0.0","workbook_sha256":"abc","example_evidence":{"release":"v1.0.0","workbook_sha256":"abc"},"cases":[],"results":{}}"#,
    );
    assert!(ozzit_reference::render(&oz).is_err());
    // Wrong example count (!= 10)
    write(
        &oz,
        "assets/ozzit-reference-v1.0.0.json",
        r#"{"release":"v1.0.0","workbook_sha256":"abc","cases":[{"id":"e1","formula":"=oz.Foo(1)"}],"results":{"e1":[[1]]}}"#,
    );
    assert!(ozzit_reference::render(&oz).is_err());
    // 10 examples with bad result_shape [1,2,3], [1], non-array result, non-string template, wrong expected
    for (shape, res, tpl, exp) in [
        ("[1,2,3]", "[[1]]", "\"{0}\"", "\"1\""),
        ("[1]", "[[1]]", "\"{0}\"", "\"1\""),
        ("[1,1]", "123", "\"{0}\"", "\"1\""),
        ("[1,1]", "[[1]]", "123", "\"1\""),
        ("[1,1]", "[[1]]", "\"{0}\"", "\"wrong\""),
    ] {
        let mut exs = Vec::new();
        let mut cases = Vec::new();
        let mut results = Vec::new();
        for i in 0..10 {
            exs.push(format!(
                r#"{{"id":"e{i}","function":"oz.Foo","title":"T","formula":"=oz.Foo({i})","note":"n","result_shape":{shape},"expected_template":{tpl},"expected":{exp}}}"#
            ));
            cases.push(format!(r#"{{"id":"e{i}","formula":"=oz.Foo({i})"}}"#));
            results.push(format!(r#""e{i}":{res}"#));
        }
        write(
            &oz,
            "scripts/ozzit_reference_examples.json",
            &format!("[{}]", exs.join(",")),
        );
        write(
            &oz,
            "assets/ozzit-reference-v1.0.0.json",
            &format!(
                r#"{{"release":"v1.0.0","workbook_sha256":"abc","cases":[{}],"results":{{{}}}}}"#,
                cases.join(","),
                results.join(",")
            ),
        );
        assert!(ozzit_reference::render(&oz).is_err());
    }

    // 5. check_links: SystemClock, invalid redirect URLs, transient-warnings passing with 0 failures
    let mut sys_clock = check_links::SystemClock;
    sys_clock.sleep(0.0);
    assert!(sys_clock.now() > 0.0);
    assert!(!check_links::is_release_asset_redirect(
        "https://github.com/ryanduguid/Ozzit/releases/download/v1.0.0/a.zip",
        "http://[invalid"
    ));
    assert!(!check_links::is_sign_in_redirect(
        "https://github.com/ryanduguid/Ozzit/issues/new",
        "http://[invalid"
    ));
    let (port, handle) = start_local_http();
    let warn_dir = tmp.path().join("warn-links");
    write(
        &warn_dir,
        "index.html",
        &format!("<a href=\"http://localhost:{port}/retry\">r</a>"),
    );
    write(&warn_dir, "404.html", "<p>404</p>");
    write(&warn_dir, "llms.txt", "");
    assert_eq!(
        check_links::run(&warn_dir, &s(&["--transient-warnings"])).unwrap(),
        0
    );
    let mut net = check_links::Network;
    let _ = net.open(&format!("http://127.0.0.1:{port}/shutdown"), &[]);
    let _ = handle.join();
}
