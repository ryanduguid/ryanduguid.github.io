//! test_contracts.py's release-record parts: current release claims, labelled historical
//! ones, unreleased versions, documented engine pins, and the live refresh against
//! stubbed sources.
mod common;

use common::{assert_clean, copied_site, expect_failure, rendered, replace_file, root};
use site_tools::pyformat::format_value;
use site_tools::pyjson::{self, Json};
use site_tools::release_record::{
    ABSENT, CHANGED, FOUND, INCONCLUSIVE, Live, LiveError, MISSING, Probe, check_record,
    live_asset, live_versions, load, registry_claims, release_tags, verify_live,
};
use site_tools::site_contracts::MCP_REL;
use std::collections::HashMap;
use std::path::Path;

/// `value[path...]`, creating missing keys as null.
fn at<'a>(value: &'a mut Json, path: &[&str]) -> &'a mut Json {
    let mut current = value;
    for key in path {
        let Json::Object(pairs) = current else {
            panic!("not an object at {key}")
        };
        let index = match pairs.iter().position(|(k, _)| k == key) {
            Some(i) => i,
            None => {
                pairs.push(((*key).to_owned(), Json::Null));
                pairs.len() - 1
            }
        };
        current = &mut pairs[index].1;
    }
    current
}

fn remove(value: &mut Json, path: &[&str], key: &str) {
    if let Json::Object(pairs) = at(value, path) {
        pairs.retain(|(k, _)| k != key);
    }
}

fn s(text: &str) -> Json {
    Json::Str(text.into())
}

fn rewrite(root: &Path, rel: &str, f: impl FnOnce(String) -> String) {
    let path = root.join(rel);
    let text = std::fs::read_to_string(&path).unwrap();
    std::fs::write(&path, f(text)).unwrap();
}

fn check(root: &Path, record: &Json) -> Vec<String> {
    check_record(root, record).unwrap()
}

#[test]
fn documented_engine_pins() {
    if !rendered() {
        return;
    }
    let mut record = load(root()).unwrap();
    *at(
        &mut record,
        &["components", "aus-accounting-mcp", "published", "version"],
    ) = s("9.9.9");
    let site = copied_site();
    replace_file(
        site.path(),
        MCP_REL,
        "australian-tax-calculators 0.2.0",
        "australian-tax-calculators 0.1.4",
    );
    expect_failure(
        "historical engine pin drift",
        &check(site.path(), &record),
        "but aus-accounting-mcp 0.6.0 pins 0.2.0",
    );
    let mut partial = record.clone();
    remove(
        &mut partial,
        &[
            "components",
            "aus-accounting-mcp",
            "documented",
            "pinned_engines",
        ],
        "australian-tax-calculators",
    );
    expect_failure(
        "omitted historical engine pin",
        &check(site.path(), &partial),
        "missing engine pin for australian-tax-calculators",
    );
    let mut missing = record.clone();
    remove(
        &mut missing,
        &["components", "aus-accounting-mcp", "documented"],
        "pinned_engines",
    );
    expect_failure(
        "missing historical engine pins",
        &check(root(), &missing),
        "missing engine pin for australian-tax-calculators",
    );
    let mut newer = load(root()).unwrap();
    *at(
        &mut newer,
        &[
            "components",
            "aus-accounting-mcp",
            "pinned_engines",
            "new-engine",
        ],
    ) = s("1.0.0");
    assert_clean("new engine absent from older guide", &check(root(), &newer));
}

#[test]
fn release_claims() {
    if !rendered() {
        return;
    }
    assert_clean(
        "current release record",
        &check(root(), &load(root()).unwrap()),
    );
    let record = load(root()).unwrap();

    // A lag must name the difference; the same lag without that sentence fails.
    let site = copied_site();
    let mut lagging = record.clone();
    *at(
        &mut lagging,
        &["components", "aus-accounting-mcp", "published", "version"],
    ) = s("9.9.9");
    replace_file(
        site.path(),
        MCP_REL,
        "<p class=\"page-meta\">",
        "<p>A different component has current published release 9.9.9.</p>\n<p class=\"page-meta\">",
    );
    expect_failure(
        "unlabelled release lag",
        &check(site.path(), &lagging),
        "without naming the difference",
    );

    let site = copied_site();
    let mut lagging = record.clone();
    *at(
        &mut lagging,
        &["components", "aus-accounting-mcp", "published", "version"],
    ) = s("9.9.9");
    *at(
        &mut lagging,
        &[
            "components",
            "aus-accounting-mcp",
            "published",
            "release_url",
        ],
    ) = s(
        "https://github.com/ryanduguid/australian-accounting/releases/tag/aus-accounting-mcp/v9.9.9",
    );
    replace_file(
        site.path(),
        MCP_REL,
        "<p class=\"page-meta\">",
        "<p>Release 9.9.9 is the current published release; this page still documents 0.6.0.</p>\n    <p class=\"page-meta\">",
    );
    let failures = check(site.path(), &lagging);
    assert!(
        !failures
            .iter()
            .any(|f| f.contains("without naming the difference")),
        "a labelled lag must pass: {failures:?}"
    );

    // A preserved evaluation keeps the release it reproduced.
    let site = copied_site();
    rewrite(
        site.path(),
        "evaluate/manager-review-gate/index.html",
        |t| t.replace("0.1.3", "0.1.6"),
    );
    expect_failure(
        "historical evaluation release replaced",
        &check(site.path(), &record),
        "must keep release 0.1.3 visible",
    );

    // An unreleased default-branch version must not be offered as a download.
    let mut unreleased = record.clone();
    *at(
        &mut unreleased,
        &["components", "ozzit", "unreleased_default_branch"],
    ) = pyjson::loads(r#"{"version": "3.5.1", "observed": "2026-09-20", "note": "Test fixture."}"#)
        .unwrap();
    let site = copied_site();
    replace_file(
        site.path(),
        "tools/ozzit/index.html",
        "https://github.com/ryanduguid/Ozzit/releases/tag/v3.5.0",
        "https://github.com/ryanduguid/Ozzit/releases/tag/v3.5.1",
    );
    expect_failure(
        "unreleased download offered",
        &check(site.path(), &unreleased),
        "which is not published",
    );

    // Structured data must describe the release the page documents.
    let site = copied_site();
    replace_file(
        site.path(),
        MCP_REL,
        "\"softwareVersion\": \"0.6.0\"",
        "\"softwareVersion\": \"0.2.0\"",
    );
    expect_failure(
        "structured version drift",
        &check(site.path(), &record),
        "structured softwareVersion is",
    );

    // An unpinned adoption command must stay labelled as tracking the package.
    let site = copied_site();
    replace_file(
        site.path(),
        MCP_REL,
        "The MCP install commands above are unpinned. uvx may reuse a cached environment or an",
        "Each command above installs the latest release every time it runs, and",
    );
    expect_failure(
        "unpinned command promising the latest release",
        &check(site.path(), &record),
        "must say they are unpinned",
    );

    // A lag the record claims must be a release the page actually names.
    let site = copied_site();
    let mut lagging = record.clone();
    *at(
        &mut lagging,
        &["components", "aus-accounting-mcp", "documented", "version"],
    ) = s("0.1.0");
    remove(
        &mut lagging,
        &["components", "aus-accounting-mcp", "documented"],
        "software_version",
    );
    expect_failure(
        "documented release the page never names",
        &check(site.path(), &lagging),
        "without naming the difference",
    );

    // A stale download hash or size on the page is a failure, not a lag.
    let published = at(&mut record.clone(), &["components", "ozzit", "published"]).clone();
    let field = |key: &str| format_value(published.get(key).unwrap(), "").unwrap();
    let size = format_value(published.get("asset_bytes").unwrap(), ",").unwrap() + " bytes";
    for (stale, message) in [
        (field("asset_sha256"), "does not show the published asset's"),
        (size, "does not show the published asset's"),
        (
            format!("href=\"{}\"", field("download_url")),
            "does not link the published download",
        ),
    ] {
        let site = copied_site();
        rewrite(site.path(), "tools/ozzit/index.html", |t| {
            t.replace(&stale, "0")
        });
        expect_failure(
            &format!("stale asset detail {stale}"),
            &check(site.path(), &record),
            message,
        );
    }

    // The release record must be a link a reader can follow, not a mention.
    let url = match at(
        &mut record.clone(),
        &["components", "ozzit", "published", "release_url"],
    ) {
        Json::Str(url) => url.clone(),
        _ => panic!("release_url"),
    };
    let site = copied_site();
    rewrite(site.path(), "tools/ozzit/index.html", |t| {
        t.replace(&format!("href=\"{url}\""), &format!("data-was=\"{url}\""))
    });
    expect_failure(
        "release record mentioned but not linked",
        &check(site.path(), &record),
        "does not link the published release record",
    );

    // When the documented release is current, its engine pins must agree.
    let site = copied_site();
    let mut current = record.clone();
    *at(
        &mut current,
        &["components", "aus-accounting-mcp", "published", "version"],
    ) = s("0.6.0");
    *at(
        &mut current,
        &[
            "components",
            "aus-accounting-mcp",
            "published",
            "release_url",
        ],
    ) = s(
        "https://github.com/ryanduguid/australian-accounting/releases/tag/aus-accounting-mcp/v0.6.0",
    );
    let pins = at(
        &mut current,
        &[
            "components",
            "aus-accounting-mcp",
            "documented",
            "pinned_engines",
        ],
    )
    .clone();
    *at(
        &mut current,
        &["components", "aus-accounting-mcp", "pinned_engines"],
    ) = pins;
    assert_clean("matching engine pins", &check(site.path(), &current));
    replace_file(
        site.path(),
        MCP_REL,
        "australian-tax-calculators 0.2.0",
        "australian-tax-calculators 0.1.4",
    );
    expect_failure(
        "engine pin drift",
        &check(site.path(), &current),
        "but aus-accounting-mcp 0.6.0 pins 0.2.0",
    );

    // An evaluation's label names its component, so an unrelated number cannot pass.
    let site = copied_site();
    rewrite(
        site.path(),
        "evaluate/xero-trial-balance-integrity/index.html",
        |t| {
            t.replace(
                "xero-trial-balance-export/v0.1.6",
                "some-other-package/v0.1.6",
            )
        },
    );
    expect_failure(
        "evaluation label replaced by a bare version",
        &check(site.path(), &record),
        "must keep release 0.1.6 visible",
    );

    // A release URL hidden from readers does not satisfy the link contract.
    for markup in [
        format!("<!-- {url} -->"),
        format!("<script type=\"application/ld+json\">{{\"seeAlso\": \"{url}\"}}</script>"),
        format!("<span data-source=\"{url}\">see the release</span>"),
        format!("<p hidden><a href=\"{url}\">Release</a></p>"),
    ] {
        let site = copied_site();
        rewrite(site.path(), "tools/ozzit/index.html", |t| {
            t.replace(
                &format!("href=\"{url}\""),
                "href=\"https://example.org/elsewhere\"",
            )
            .replace("</main>", &format!("{markup}</main>"))
        });
        expect_failure(
            "release URL hidden",
            &check(site.path(), &record),
            "does not link the published release record",
        );
    }

    // Another repository's identical version number is not this unreleased download.
    let site = copied_site();
    rewrite(site.path(), "tools/ozzit/index.html", |t| {
        t.replace(
            "</main>",
            "<p><a href=\"https://github.com/example/other/releases/tag/v3.5.1\">Another project's v3.5.1</a></p></main>",
        )
    });
    let unrelated: Vec<String> = check(site.path(), &unreleased)
        .into_iter()
        .filter(|f| f.contains("not published"))
        .collect();
    assert_clean("unrelated repository sharing a version number", &unrelated);

    // A release-specific supporting file must be read at the documented release.
    for replacement in ["main", "v3.5.1"] {
        let site = copied_site();
        rewrite(site.path(), "tools/ozzit/index.html", |t| {
            t.replace(
                "Ozzit/blob/v3.5.0/CITATION.cff",
                &format!("Ozzit/blob/{replacement}/CITATION.cff"),
            )
        });
        expect_failure(
            "citation retargeted",
            &check(site.path(), &record),
            "CITATION.cff must be linked at v3.5.0",
        );
    }
    let site = copied_site();
    let citation = "https://github.com/ryanduguid/Ozzit/blob/v3.5.0/CITATION.cff";
    rewrite(site.path(), "tools/ozzit/index.html", |t| {
        t.replace(
            &format!("href=\"{citation}\""),
            "href=\"https://example.org/elsewhere\"",
        )
        .replace("</main>", &format!("<!-- {citation} --></main>"))
    });
    expect_failure(
        "supporting evidence only in a comment",
        &check(site.path(), &record),
        "CITATION.cff must be linked at v3.5.0",
    );
    let site = copied_site();
    let unpinned: Vec<String> = check(site.path(), &record)
        .into_iter()
        .filter(|f| f.contains("github.com/ryanduguid/Ozzit\""))
        .collect();
    assert_clean("unpinned repository link", &unpinned);

    // A mistyped registry claim is a record error offline.
    for claim in [
        s("active, lastest"),
        s("inactive"),
        s("active latest"),
        Json::Int(7.into()),
    ] {
        let mut bad = record.clone();
        *at(
            &mut bad,
            &[
                "components",
                "aus-accounting-mcp",
                "published",
                "registry_status",
            ],
        ) = claim;
        expect_failure(
            "mistyped registry claim",
            &check(root(), &bad),
            "registry_status",
        );
    }
}

/// A stubbed network: JSON by a routing function, asset bytes or an HTTP status.
struct Stub<F: FnMut(&str) -> Result<Json, LiveError>> {
    json: F,
    bytes: Result<Vec<u8>, LiveError>,
}

impl<F: FnMut(&str) -> Result<Json, LiveError>> Live for Stub<F> {
    fn json(&mut self, url: &str) -> Result<Json, LiveError> {
        (self.json)(url)
    }

    fn bytes(&mut self, _: &str) -> Result<Vec<u8>, LiveError> {
        self.bytes.clone()
    }
}

fn stub<F: FnMut(&str) -> Result<Json, LiveError>>(json: F) -> Stub<F> {
    Stub {
        json,
        bytes: Err(LiveError::Http(500)),
    }
}

fn states(probes: Vec<Probe>) -> HashMap<String, (&'static str, String)> {
    probes
        .into_iter()
        .map(|p| (p.source, (p.state, p.detail)))
        .collect()
}

fn host_of(url: &str) -> String {
    site_tools::pyurl::hostname(&site_tools::pyurl::urlsplit(url).unwrap().netloc)
        .unwrap_or_default()
}

fn json(text: &str) -> Json {
    pyjson::loads(text).unwrap()
}

fn timeout(what: &str) -> LiveError {
    LiveError::Error("TimeoutError".into(), format!("{what} timed out"))
}

fn component(name: &str) -> Json {
    let mut record = load(Path::new(env!("CARGO_MANIFEST_DIR")).join("..").as_path()).unwrap();
    at(&mut record, &["components", name]).clone()
}

#[test]
fn live_refresh_against_stubbed_sources() {
    let ozzit = component("ozzit");
    let mcp = component("aus-accounting-mcp");
    let probe = |live: &mut dyn Live, c: &Json| states(live_versions(live, c).unwrap());

    // An empty release list means the recorded release is gone: a finding.
    let absent = probe(&mut stub(|_| Ok(json("[]"))), &ozzit);
    assert_eq!(absent["github"], (FOUND, MISSING.to_owned()));

    // A changed response contract is inconclusive, never a version named "None".
    let shaped = probe(&mut stub(|_| Ok(json(r#"["unexpected shape"]"#))), &mcp);
    for source in ["pypi", "registry"] {
        assert_eq!(shaped[source].0, INCONCLUSIVE, "{shaped:?}");
    }
    assert_eq!(shaped["github"], (FOUND, MISSING.to_owned()));
    assert!(
        shaped.values().all(|(_, detail)| !detail.contains("None")),
        "{shaped:?}"
    );

    // A registry record without a version string is a changed contract.
    let versionless = probe(&mut stub(|_| Ok(json(r#"{"server": {}}"#))), &mcp);
    assert_eq!(versionless["registry"].0, INCONCLUSIVE);
    assert!(versionless["registry"].1.contains("no version string"));

    // One failing source must not suppress the others.
    let both = probe(
        &mut stub(|url| {
            if host_of(url) == "pypi.org" {
                return Ok(json(r#"{"info": {"version": "0.3.0"}}"#));
            }
            if host_of(url) == "registry.modelcontextprotocol.io" {
                return Err(timeout("registry"));
            }
            if url.contains("/releases/tags/") {
                return Ok(json(r#"{"tag_name": "aus-accounting-mcp/v0.3.0"}"#));
            }
            Ok(json(
                r#"[{"tag_name": "aus-accounting-mcp/v0.3.0", "draft": false, "prerelease": false}]"#,
            ))
        }),
        &mcp,
    );
    assert_eq!(both["pypi"], (FOUND, "0.3.0".to_owned()));
    assert_eq!(both["registry"].0, INCONCLUSIVE);
    assert_eq!(both["github"], (FOUND, "0.3.0".to_owned()));

    // The first source failing must not stop the last one being attempted.
    let after_first = probe(
        &mut stub(|url| {
            if host_of(url) == "pypi.org" {
                return Err(timeout("pypi"));
            }
            if url.contains("/releases/tags/") {
                return Ok(json(r#"{"tag_name": "aus-accounting-mcp/v0.2.2"}"#));
            }
            if host_of(url) == "registry.modelcontextprotocol.io" {
                return Ok(json(r#"{"server": {"version": "0.2.2"}}"#));
            }
            Ok(json(
                r#"[{"tag_name": "aus-accounting-mcp/v0.2.2", "draft": false, "prerelease": false}]"#,
            ))
        }),
        &mcp,
    );
    assert_eq!(after_first["pypi"].0, INCONCLUSIVE);
    assert_eq!(after_first["github"], (FOUND, "0.2.2".to_owned()));

    // A capped search establishes nothing.
    let full_page = Json::Array(
        (0..100)
            .map(|n| {
                json(&format!(
                    r#"{{"tag_name": "other/v0.{n}.0", "draft": false, "prerelease": false}}"#
                ))
            })
            .collect(),
    );
    let capped = probe(&mut stub(|_| Ok(full_page.clone())), &ozzit);
    assert_eq!(capped["github"].0, INCONCLUSIVE);
    assert!(capped["github"].1.contains("without reaching the end"));

    // Lifecycle metadata that contradicts the record is CHANGED.
    let with_meta = |meta: Option<&str>| {
        let mut record = json(r#"{"server": {"version": "0.2.2"}}"#);
        if let Some(meta) = meta {
            *at(&mut record, &["_meta"]) = Json::Object(vec![(
                "io.modelcontextprotocol.registry/official".into(),
                json(meta),
            )]);
        }
        record
    };
    for (meta, expected) in [
        (r#"{"status": "deprecated", "isLatest": true}"#, "status"),
        (r#"{"status": "active", "isLatest": false}"#, "latest"),
    ] {
        let answer = with_meta(Some(meta));
        let lifecycle = probe(&mut stub(|_| Ok(answer.clone())), &mcp);
        assert_eq!(lifecycle["registry"].0, CHANGED, "{lifecycle:?}");
        assert!(lifecycle["registry"].1.contains(expected));
    }
    for partial in [
        None,
        Some("{}"),
        Some(r#"{"status": "", "isLatest": true}"#),
        Some(r#"{"status": "active"}"#),
        Some(r#"{"status": "active", "isLatest": "true"}"#),
        Some(r#""official""#),
    ] {
        let answer = with_meta(partial);
        let lifecycle = probe(&mut stub(|_| Ok(answer.clone())), &mcp);
        assert_eq!(lifecycle["registry"].0, INCONCLUSIVE, "{partial:?}");
        let detail = &lifecycle["registry"].1;
        assert!(
            detail.contains("lifecycle") || detail.contains("isLatest"),
            "{detail}"
        );
    }
    let confirmed = with_meta(Some(r#"{"status": "active", "isLatest": true}"#));
    assert_eq!(
        probe(&mut stub(|_| Ok(confirmed.clone())), &mcp)["registry"],
        (FOUND, "0.2.2".to_owned())
    );

    // A mistyped claim is inconclusive live.
    for claim in [
        s("active, lastest"),
        s("inactive"),
        s("active latest"),
        Json::Int(7.into()),
    ] {
        let mut mistyped = mcp.clone();
        *at(&mut mistyped, &["published", "registry_status"]) = claim;
        let live = probe(&mut stub(|_| Ok(confirmed.clone())), &mistyped);
        assert_eq!(live["registry"].0, INCONCLUSIVE);
        assert!(live["registry"].1.contains("registry_status"));
    }
    assert_eq!(
        registry_claims(&json(r#"{"registry_status": " latest ,active"}"#)).unwrap(),
        Ok(vec!["active".to_owned(), "latest".to_owned()])
    );
    assert_eq!(registry_claims(&json("{}")).unwrap(), Ok(vec![]));

    // Releases spanning pages: an older tag on page two is still found.
    let mut pages = stub(|url| {
        let page: usize = url.rsplit("page=").next().unwrap().parse().unwrap();
        Ok(if page == 1 {
            full_page.clone()
        } else {
            json(r#"[{"tag_name": "v3.4.1", "draft": false, "prerelease": false}]"#)
        })
    });
    let (tags, exhausted) = release_tags(&mut pages, "ryanduguid/Ozzit", "v").unwrap();
    assert_eq!(tags, vec!["v3.4.1".to_owned()]);
    assert!(exhausted);
}

#[test]
fn asset_classification() {
    let ozzit = component("ozzit");
    let published = ozzit.get("published").unwrap().clone();
    let asset = |bytes: Result<Vec<u8>, LiveError>, published: &Json| {
        let mut live = Stub {
            json: |_: &str| Ok(Json::Null),
            bytes,
        };
        live_asset(&mut live, published).unwrap().unwrap()
    };
    for status in [404, 410] {
        let probe = asset(Err(LiveError::Http(status)), &published);
        assert_eq!(probe.state, ABSENT);
        assert!(probe.detail.contains(&status.to_string()));
    }
    for status in [401, 403, 408, 429, 500, 503] {
        assert_eq!(
            asset(Err(LiveError::Http(status)), &published).state,
            INCONCLUSIVE
        );
    }
    assert_eq!(asset(Err(timeout("asset")), &published).state, INCONCLUSIVE);
    let size = match published.get("asset_bytes") {
        Some(Json::Int(n)) => usize::try_from(n.clone()).unwrap(),
        _ => panic!("asset_bytes"),
    };
    let served = vec![b'x'; size];
    let probe = asset(Ok(served.clone()), &published);
    assert_eq!(probe.state, CHANGED);
    assert!(probe.detail.contains("SHA-256 differs"));
    let probe = asset(Ok(b"short".to_vec()), &published);
    assert_eq!(probe.state, CHANGED);
    assert!(probe.detail.contains("bytes, record says"));
    let mut matching = published.clone();
    *at(&mut matching, &["asset_bytes"]) = Json::Int(served.len().into());
    *at(&mut matching, &["asset_sha256"]) = s(&site_tools::sha256(&served));
    assert_eq!(asset(Ok(served), &matching).state, FOUND);

    // An asset outage must not suppress version results already established.
    let record_path = site_tools::release_record::record_path(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("..").as_path(),
    );
    let before = std::fs::read(&record_path).unwrap();
    let record = load(Path::new(env!("CARGO_MANIFEST_DIR")).join("..").as_path()).unwrap();
    let mut live = Stub {
        json: |_: &str| Ok(Json::Null),
        bytes: Err(LiveError::Http(429)),
    };
    let mut printed = Vec::new();
    let code = verify_live(
        &record,
        &mut live,
        &mut |_, _| {
            Ok(vec![Probe {
                source: "github".into(),
                state: FOUND,
                detail: "9.9.9".into(),
            }])
        },
        &mut |line| {
            printed.push(line.to_owned());
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(code, 1, "drift exits 1");
    let reported = printed.join("\n");
    assert!(reported.contains("github reports 9.9.9"), "{reported}");
    assert!(reported.contains("asset INCONCLUSIVE"), "{reported}");
    assert_eq!(
        std::fs::read(&record_path).unwrap(),
        before,
        "the refresh must not rewrite the record"
    );
}

/// `--verify-live` exits 0 when every source answers and matches, and 2 when no source
/// answered, so CI can tell drift (1) from an outage.
#[test]
fn verify_live_exit_codes() {
    let mut record = load(Path::new(env!("CARGO_MANIFEST_DIR")).join("..").as_path()).unwrap();
    let Json::Object(components) = at(&mut record, &["components"]).clone() else {
        panic!("components")
    };
    for (name, _) in &components {
        remove(
            &mut record,
            &["components", name, "published"],
            "download_url",
        );
    }
    let outcome = |state: &'static str| {
        let mut live = Stub {
            json: |_: &str| Ok(Json::Null),
            bytes: Err(LiveError::Http(500)),
        };
        verify_live(
            &record,
            &mut live,
            &mut |_, component: &Json| {
                let version = match component.get("published").and_then(|p| p.get("version")) {
                    Some(Json::Str(version)) => version.clone(),
                    other => panic!("version {other:?}"),
                };
                Ok(vec![Probe {
                    source: "github".into(),
                    state,
                    detail: if state == FOUND {
                        version
                    } else {
                        "HTTPError: HTTP Error 503: Service Unavailable".into()
                    },
                }])
            },
            &mut |_| Ok(()),
        )
        .unwrap()
    };
    assert_eq!(outcome(FOUND), 0, "every source matches");
    assert_eq!(outcome(INCONCLUSIVE), 2, "no source answered");
}
