//! `site-tools stamp_source_freshness`: the last-commit stamps, the release checks and
//! the tool release snapshot, with gh and the environment replaced by a fake host.
mod common;
use serde_json::{Map, Value, json};
use site_tools::source_freshness::{
    Host, Release, build_calculator_revision, build_tool_release_data, check_html, check_releases,
    check_tool_releases, fetch_releases, format_date, main_with, stamp_html, stamp_latest_releases,
    stamp_mcp_index, stamp_register_facts, stamp_tool_metadata, stamp_tool_sitemap,
};
use std::cell::Cell;
use std::path::Path;
use std::time::Duration;

/// A card in the shape tools/index.html uses. The stamp belongs on the links paragraph,
/// so that is where the fixture puts an existing one.
fn card(href: &str, stamp: &str, evaluation: &str) -> String {
    [
        r#"            <div class="collection-entry">"#,
        r#"              <h3><a class="collection-entry__title" href="/tools/x/">X</a></h3>"#,
        "              <dl>",
        "                <div><dt>Delivery</dt><dd>Python</dd></div>",
        "                <div><dt>Boundary</dt><dd>Review aid.</dd></div>",
        "              </dl>",
        &format!(r#"              <p class="collection-entry__links"><a href="{href}">Source repository</a>{evaluation}{stamp}</p>"#),
        "            </div>",
    ]
    .join("\n")
}

const MONOREPO: &str =
    "https://github.com/ryanduguid/australian-accounting/tree/main/packages/payday-super-checker";
const WHOLE_REPO: &str = "https://github.com/ryanduguid/australian-accounting-skills";
const EVALUATION: &str =
    r#"<a href="/evaluate/payday-super-evidence/">Reproduce the evaluation</a>"#;

fn fixture() -> String {
    format!(
        "{}\n{}",
        card(MONOREPO, "", EVALUATION),
        card(WHOLE_REPO, "", "")
    )
}

fn stamped_with(html: &str, date: &str) -> String {
    stamp_html(html, &mut |_, _, _| Ok(date.to_owned())).unwrap()
}

#[test]
fn format_date_writes_the_site_date_style() {
    assert_eq!(format_date("2026-09-02"), "2 September 2026");
    assert_eq!(format_date("2026-12-25"), "25 December 2026");
}

#[test]
fn each_card_is_looked_up_by_its_own_repository_and_path() {
    let mut asked = Vec::new();
    stamp_html(&fixture(), &mut |owner, repo, path| {
        asked.push((owner.to_owned(), repo.to_owned(), path.map(str::to_owned)));
        Ok("2026-09-02".into())
    })
    .unwrap();
    assert_eq!(
        asked,
        [
            (
                "ryanduguid".into(),
                "australian-accounting".into(),
                Some("packages/payday-super-checker".into())
            ),
            (
                "ryanduguid".into(),
                "australian-accounting-skills".into(),
                None
            ),
        ]
    );
}

#[test]
fn the_site_repository_card_is_dated_from_the_calculator_not_the_repo_root() {
    // Dating it from the root would credit the calculator with unrelated copy edits, and
    // this workflow's own commits would restamp it every week.
    let mut asked = Vec::new();
    let stamped = stamp_html(
        &card("https://github.com/ryanduguid/ryanduguid.github.io", "", ""),
        &mut |_, _, path| {
            asked.push(path.unwrap().to_owned());
            Ok(if path == Some("assets/levy-form.mjs") {
                "2026-09-04"
            } else {
                "2026-09-01"
            }
            .into())
        },
    )
    .unwrap();
    assert_eq!(
        asked,
        [
            "assets/levy.mjs",
            "assets/levy-form.mjs",
            "assets/levy-page.mjs",
            "assets/levy-explanation.mjs"
        ]
    );
    // The newest of the calculator files wins.
    assert!(stamped.contains(r#"<time datetime="2026-09-04">4 September 2026</time>"#));
}

#[test]
fn a_lookup_failure_stops_the_stamping() {
    assert_eq!(
        stamp_html(&fixture(), &mut |_, _, _| Err("GitHub HTTP 403".into())),
        Err("GitHub HTTP 403".into())
    );
}

#[test]
fn check_fails_when_a_card_drifts_out_of_the_stamped_set() {
    let drifted = [
        stamped_with(&fixture(), "2026-09-02").as_str(),
        r#"            <div class="collection-entry">"#,
        r#"              <p class="entry-links"><a href="https://github.com/ryanduguid/x">Source</a></p>"#,
        "            </div>",
    ]
    .join("\n");
    assert_eq!(
        check_html(&drifted, "2026-09-05"),
        ["3 tool cards but 2 carry a links row; a card has drifted out of the stamped set"]
    );
}

#[test]
fn stamping_adds_one_stamp_per_card_and_keeps_the_links() {
    let stamped = stamped_with(&fixture(), "2026-09-02");
    assert_eq!(stamped.matches("collection-entry__stamp").count(), 2);
    assert!(stamped.contains(r#"<span class="collection-entry__stamp">Last commit <time datetime="2026-09-02">2 September 2026</time></span></p>"#));
    assert!(stamped.contains(r#"payday-super-checker">Source repository</a>"#));
    assert!(stamped.contains("Reproduce the evaluation"));
}

#[test]
fn the_stamp_rides_the_links_row_and_adds_no_card_row() {
    // tests/browser/site-quality.spec.mjs holds /tools/ to a page-length budget. A row
    // per card breaches it, so the stamp must not become one.
    let stamped = stamped_with(&fixture(), "2026-09-02");
    assert!(!stamped.contains("<dt>Last commit</dt>"));
    assert_eq!(stamped.lines().count(), fixture().lines().count());
}

#[test]
fn restamping_replaces_the_old_date_instead_of_stacking_stamps() {
    let first = stamped_with(&fixture(), "2026-09-02");
    let second = stamped_with(&first, "2026-09-04");
    assert_eq!(second.matches("collection-entry__stamp").count(), 2);
    assert!(!second.contains("2 September 2026"));
    assert!(second.contains("4 September 2026"));
    // An unchanged run is a byte-identical no-op, so the scheduled workflow only opens a
    // pull request when a date actually moved.
    assert_eq!(stamped_with(&second, "2026-09-04"), second);
}

#[test]
fn a_stamped_page_passes_its_own_check() {
    assert!(check_html(&stamped_with(&fixture(), "2026-09-02"), "2026-09-05").is_empty());
}

#[test]
fn check_rejects_a_missing_mistyped_or_future_stamp() {
    assert_eq!(
        check_html(&fixture(), "2026-09-05"),
        [
            "ryanduguid/australian-accounting/packages/payday-super-checker: no last-commit stamp",
            "ryanduguid/australian-accounting-skills: no last-commit stamp",
        ]
    );
    let mistyped = card(
        WHOLE_REPO,
        r#"<span class="collection-entry__stamp">Last commit <time datetime="2026-09-02">2 August 2026</time></span>"#,
        "",
    );
    assert_eq!(
        check_html(&mistyped, "2026-09-05"),
        [
            r#"ryanduguid/australian-accounting-skills: stamp reads "2 August 2026", expected "2 September 2026""#
        ]
    );
    let future = stamped_with(&card(WHOLE_REPO, "", ""), "2026-09-09");
    assert_eq!(
        check_html(&future, "2026-09-05"),
        ["ryanduguid/australian-accounting-skills: stamp date 2026-09-09 is in the future"]
    );
    let sourceless = card("/tools/x/", "", "");
    assert_eq!(
        check_html(&sourceless, "2026-09-05"),
        ["a tool card links to no source repository"]
    );
}

#[test]
fn check_fails_loudly_if_the_card_markup_stops_matching() {
    assert_eq!(
        check_html("<p>no cards here</p>", "2026-09-05"),
        ["no tool cards matched; the card markup has changed"]
    );
}

#[test]
fn the_committed_tools_register_is_stamped_and_consistent() {
    let html = site_tools::read(&common::repository().join("tools/index.html")).unwrap();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    assert_eq!(check_html(&html, &today), Vec::<String>::new());
}

fn release_table(tags: &[&str]) -> String {
    let links: String = tags
        .iter()
        .map(|tag| {
            format!(
                r#"<a href="https://github.com/ryanduguid/example/releases/tag/{tag}">{tag}</a>"#
            )
        })
        .collect();
    format!(r#"<section aria-labelledby="tool-releases">{links}</section>"#)
}

fn release(tag: &str) -> Release {
    Release {
        tag_name: tag.to_owned(),
        published_at: Some("2026-09-10T00:00:00Z".into()),
        ..Release::default()
    }
}

fn releases(tags: &[&str]) -> Vec<Release> {
    tags.iter().map(|tag| release(tag)).collect()
}

fn check(html: &str, list: &[Release]) -> Vec<String> {
    check_releases(html, &mut |_| Ok(list.to_vec())).unwrap()
}

const BEHIND: &str = "; review changelog/index.html and capability descriptions";

#[test]
fn release_check_flags_a_newer_stable_version_within_each_package() {
    let list = [
        release("tool/v0.1.9"),
        release("tool/v0.1.10"),
        release("other/v1.0.0"),
        Release {
            prerelease: true,
            ..release("tool/v0.2.0")
        },
        Release {
            draft: true,
            ..release("tool/v0.3.0")
        },
        Release {
            published_at: None,
            ..release("tool/v0.4.0")
        },
        release("tool/v0.5.0-rc.1"),
    ];
    assert_eq!(
        check(&release_table(&["tool/v0.1.9", "other/v1.0.0"]), &list),
        [format!(
            "ryanduguid/example: tool/v0.1.9 is behind tool/v0.1.10{BEHIND}"
        )]
    );
}

#[test]
fn numeric_collation_drops_leading_zeroes_and_weighs_case_on_letters_only() {
    use site_tools::node::numeric_compare;
    use std::cmp::Ordering::{Equal, Greater, Less};
    // `a.localeCompare(b, 'en', { numeric: true })` in Node 26.12.1.
    for (a, b, node) in [
        ("v1.01.0", "v1.1.0", Equal),
        ("v01", "v1", Equal),
        ("v1.0010", "v1.10", Equal),
        ("v0", "v00", Equal),
        ("V1.0", "v1.0", Greater),
        ("a01B", "a1b", Greater),
        ("A01b", "a1B", Greater),
        ("v1.9.0", "v1.10.0", Less),
        ("tool/v2.0.0", "tool/v10.0.0", Less),
        ("v1.0.0-rc1", "v1.0.0", Greater),
    ] {
        assert_eq!(numeric_compare(a, b), node, "{a} against {b}");
        assert_eq!(numeric_compare(b, a), node.reverse(), "{b} against {a}");
    }
}

#[test]
fn release_check_takes_tags_differing_only_in_leading_zeroes_as_one_version() {
    // Equal tags keep their order in the stable sort, so the later one is the latest.
    let list = releases(&["v1.01.0", "v1.1.0"]);
    assert!(check(&release_table(&["v1.1.0"]), &list).is_empty());
}

#[test]
fn release_check_accepts_current_plain_tags_and_ignores_unrelated_packages() {
    let list = [
        release("v1.2.0"),
        Release {
            published_at: Some("2026-09-11T00:00:00Z".into()),
            ..release("v1.1.0")
        },
        release("other/v9.0.0"),
    ];
    assert!(check(&release_table(&["v1.2.0"]), &list).is_empty());
}

#[test]
fn release_history_passes_when_each_package_includes_its_latest_stable_tag() {
    let list = releases(&["tool/v0.1.9", "tool/v0.1.10", "other/v1.0.0"]);
    for tags in [
        ["tool/v0.1.9", "other/v1.0.0", "tool/v0.1.10"],
        ["tool/v0.1.10", "other/v1.0.0", "tool/v0.1.9"],
    ] {
        assert!(check(&release_table(&tags), &list).is_empty(), "{tags:?}");
    }
}

#[test]
fn release_history_cannot_hide_a_missing_stable_tag_or_another_package_drifting() {
    assert_eq!(
        check(
            &release_table(&["tool/v0.1.8", "tool/v0.1.10", "other/v1.0.0"]),
            &releases(&["tool/v0.1.10", "other/v1.0.0", "other/v1.1.0"])
        ),
        [
            "ryanduguid/example: tool/v0.1.8 is not a published stable release".to_owned(),
            format!("ryanduguid/example: other/v1.0.0 is behind other/v1.1.0{BEHIND}"),
        ]
    );
}

#[test]
fn release_history_behind_the_latest_tag_is_reported_once_from_its_newest_row() {
    let list = releases(&["tool/v0.1.8", "tool/v0.1.9", "tool/v0.1.10", "tool/v0.2.0"]);
    for tags in [
        ["tool/v0.1.10", "tool/v0.1.9", "tool/v0.1.8"],
        ["tool/v0.1.8", "tool/v0.1.10", "tool/v0.1.9"],
    ] {
        assert_eq!(
            check(&release_table(&tags), &list),
            [format!(
                "ryanduguid/example: tool/v0.1.10 is behind tool/v0.2.0{BEHIND}"
            )],
            "{tags:?}"
        );
    }
}

#[test]
fn a_current_tag_in_another_repository_cannot_satisfy_release_freshness() {
    let html = release_table(&["tool/v1.0.0"]).replace(
        "</section>",
        r#"<a href="https://github.com/ryanduguid/another/releases/tag/tool/v1.1.0">tool/v1.1.0</a></section>"#,
    );
    let mut asked = Vec::new();
    let failures = check_releases(&html, &mut |repository| {
        asked.push(repository.to_owned());
        Ok(releases(&["tool/v1.0.0", "tool/v1.1.0"]))
    })
    .unwrap();
    assert_eq!(
        failures,
        [format!(
            "ryanduguid/example: tool/v1.0.0 is behind tool/v1.1.0{BEHIND}"
        )]
    );
    // Each repository is asked once.
    assert_eq!(asked, ["ryanduguid/example", "ryanduguid/another"]);
}

#[test]
fn release_check_refuses_a_missing_published_tag_or_missing_release_links() {
    assert_eq!(
        check(&release_table(&["tool/v1.0.0"]), &[]),
        ["ryanduguid/example: tool/v1.0.0 is not a published stable release"]
    );
    assert_eq!(
        check_releases("<p>No release links</p>", &mut |_| panic!("no lookup")).unwrap(),
        ["no release links found in changelog/index.html"]
    );
    assert_eq!(
        check_releases(
            &release_table(&["v1.0.0"]),
            &mut |_| Err("gh failed".into())
        ),
        Err("gh failed".into())
    );
}

#[test]
fn release_check_finds_the_links_in_the_committed_changelog() {
    let html = site_tools::read(&common::repository().join("changelog/index.html")).unwrap();
    let failures = check(&html, &[]);
    assert!(!failures.is_empty());
    assert!(
        !failures
            .iter()
            .any(|f| f == "no release links found in changelog/index.html")
    );
}

#[test]
fn release_check_leaves_historical_references_outside_the_current_table_alone() {
    let html = release_table(&["v1.2.0"])
        + r#"<p>Earlier evaluation: <a href="https://github.com/ryanduguid/example/releases/tag/v1.1.0">v1.1.0</a></p>"#;
    assert!(check(&html, &releases(&["v1.2.0", "v1.1.0"])).is_empty());
}

type Answer = Box<dyn FnMut(&[&str]) -> Result<String, String>>;

/// gh, the environment, the build and the console, recorded.
struct Fake {
    answer: Answer,
    asked: Vec<(Vec<String>, Option<Duration>)>,
    env: Vec<(&'static str, &'static str)>,
    said: Vec<(String, bool)>,
    built: bool,
}

impl Fake {
    fn new(answer: impl FnMut(&[&str]) -> Result<String, String> + 'static) -> Fake {
        Fake {
            answer: Box::new(answer),
            asked: Vec::new(),
            env: Vec::new(),
            said: Vec::new(),
            built: false,
        }
    }
}

impl Host for Fake {
    fn gh(&mut self, args: &[&str], timeout: Option<Duration>) -> Result<String, String> {
        self.asked
            .push((args.iter().map(|a| (*a).to_owned()).collect(), timeout));
        (self.answer)(args)
    }
    fn env(&self, name: &str) -> Option<String> {
        self.env
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, v)| (*v).to_owned())
    }
    fn today(&self) -> String {
        "2026-09-05".into()
    }
    fn build_site(&mut self, _root: &Path) -> Result<(), String> {
        self.built = true;
        Ok(())
    }
    fn say(&mut self, text: &str, stderr: bool) {
        self.said.push((text.to_owned(), stderr));
    }
}

fn release_json(tags: &[&str]) -> String {
    let list: Vec<Value> = tags
        .iter()
        .map(|tag| json!({"tag_name": tag, "draft": false, "prerelease": false, "published_at": "2026-09-10T00:00:00Z"}))
        .collect();
    Value::from(list).to_string()
}

const FIELDS: &str = "map({tag_name, draft, prerelease, published_at})";

#[test]
fn release_lookup_follows_pagination_and_refuses_an_api_failure() {
    let calls = Cell::new(0);
    let mut host = Fake::new(move |_| {
        calls.set(calls.get() + 1);
        Ok(if calls.get() == 1 {
            release_json(&["other/v1.0.0"; 100])
        } else {
            release_json(&["tool/v1.1.0"])
        })
    });
    let list = fetch_releases(&mut host, "ryanduguid/example").unwrap();
    assert_eq!(list.len(), 101);
    assert_eq!(list[100].tag_name, "tool/v1.1.0");
    let page = |n: u32| {
        (
            vec![
                "api".to_owned(),
                format!("repos/ryanduguid/example/releases?per_page=100&page={n}"),
                "--jq".to_owned(),
                FIELDS.to_owned(),
            ],
            Some(Duration::from_secs(15)),
        )
    };
    assert_eq!(host.asked, [page(1), page(2)]);
    for message in [
        "GitHub HTTP 403",
        "gh authentication required",
        "spawnSync gh ETIMEDOUT",
    ] {
        let mut failing = Fake::new(move |_| Err(message.to_owned()));
        assert_eq!(
            fetch_releases(&mut failing, "ryanduguid/example"),
            Err(message.to_owned())
        );
    }
}

#[test]
fn release_lookup_refuses_malformed_data_and_accepts_an_empty_release_list() {
    let lookup = |answer: &'static str| {
        fetch_releases(
            &mut Fake::new(move |_| Ok(answer.into())),
            "ryanduguid/example",
        )
    };
    assert!(lookup("not JSON").is_err());
    assert_eq!(
        lookup("{}"),
        Err("Invalid release list for ryanduguid/example".into())
    );
    assert_eq!(lookup("[]"), Ok(Vec::new()));
}

fn tool_page(pinned: &str, extra: &str) -> String {
    format!(
        r#"<p class="release-meta">Reference release <a href="https://github.com/ryanduguid/example/releases/tag/tool/{pinned}">tool/{pinned}</a>, tagged source.</p>{extra}"#
    )
}

#[test]
fn a_tool_page_may_pin_an_older_release_only_if_it_names_the_current_one() {
    let list = releases(&["tool/v1.2.0", "tool/v1.1.0"]);
    let root = tempfile::tempdir().unwrap();
    let check = |rel: &str, html: String| {
        check_tool_releases(root.path(), &[(rel.to_owned(), html)], &mut |_| {
            Ok(list.clone())
        })
        .unwrap()
    };
    assert!(check("tools/a/index.html", tool_page("v1.2.0", "")).is_empty());
    assert!(
        check(
            "tools/a/index.html",
            tool_page("v1.1.0", "<p>The current release is tool/v1.2.0.</p>")
        )
        .is_empty()
    );
    assert_eq!(
        check("tools/a/index.html", tool_page("v1.1.0", "")),
        ["tools/a/index.html: pins tool/v1.1.0 but does not name the current release tool/v1.2.0"]
    );
    assert!(check("tools/b/index.html", "<p>No release-meta here</p>".into()).is_empty());
    assert_eq!(
        check("tools/c/index.html", tool_page("main", "")),
        ["tools/c/index.html: tool/main is not a stable release tag"]
    );
}

#[test]
fn a_tool_page_that_renders_the_shared_metadata_line_is_checked_against_its_release_snapshot() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let data: Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("_data/tool_releases.json")).unwrap(),
    )
    .unwrap();
    let tag = data["payday-super"]["tag"].as_str().unwrap();
    let newer = format!("{}99.0.0", &tag[..tag.rfind("/v").unwrap() + 2]);
    let page = [(
        "tools/payday-super/index.html".to_owned(),
        r#"{% include tool-meta.html published="1 July 2026" reviewed="2 July 2026" %}"#.to_owned(),
    )];
    assert!(
        check_tool_releases(root, &page, &mut |_| Ok(releases(&[tag])))
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        check_tool_releases(root, &page, &mut |_| Ok(releases(&[tag, &newer]))).unwrap(),
        [format!(
            "tools/payday-super/index.html: pins {tag} but does not name the current release {newer}"
        )]
    );
}

#[test]
fn a_templated_release_meta_reads_the_release_snapshot() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("_data")).unwrap();
    std::fs::write(
        root.path().join("_data/tool_releases.json"),
        r#"{"a": {"url": "https://github.com/ryanduguid/example/releases/tag/tool/v1.1.0"}}"#,
    )
    .unwrap();
    let html = r#"<p class="release-meta">Reference release <a href="{{ release.url }}">x</a></p>"#;
    let list = releases(&["tool/v1.2.0"]);
    let check = |rel: &str| {
        check_tool_releases(
            root.path(),
            &[(rel.to_owned(), html.to_owned())],
            &mut |_| Ok(list.clone()),
        )
    };
    assert_eq!(
        check("tools/a/index.html"),
        Ok(vec!["tools/a/index.html: pins tool/v1.1.0 but does not name the current release tool/v1.2.0".to_owned()])
    );
    assert_eq!(
        check("tools/b/index.html"),
        Err("tools/b/index.html: no release snapshot".to_owned())
    );
}

fn tools(value: Value) -> Map<String, Value> {
    value.as_object().unwrap().clone()
}

#[test]
fn tool_release_snapshot_selects_published_stable_package_tags_in_sydney_time() {
    let list = vec![
        Release {
            published_at: Some("2026-10-19T14:00:00Z".into()),
            ..release("a/v0.9.0")
        },
        Release {
            published_at: Some("2026-10-19T14:00:00Z".into()),
            ..release("a/v0.10.0")
        },
        Release {
            draft: true,
            ..release("a/v1.0.0")
        },
        Release {
            prerelease: true,
            ..release("a/v2.0.0")
        },
        Release {
            published_at: Some("2026-10-19T08:00:00Z".into()),
            ..release("b/v3.5.0")
        },
    ];
    let mut calls = 0;
    let data = build_tool_release_data(
        &tools(json!({
            "a": {"repository": "owner/repo", "tagPrefix": "a/v"},
            "b": {"repository": "owner/repo", "tagPrefix": "b/v"},
            "levy": {"repository": "owner/site", "tagPrefix": null},
        })),
        &mut |_| {
            calls += 1;
            Ok(list.clone())
        },
    )
    .unwrap();
    assert_eq!(calls, 1);
    assert_eq!(
        Value::Object(data),
        json!({
            "a": {"version": "0.10.0", "tag": "a/v0.10.0", "date": "2026-10-20", "dateLabel": "20 October 2026", "url": "https://github.com/owner/repo/releases/tag/a/v0.10.0"},
            "b": {"version": "3.5.0", "tag": "b/v3.5.0", "date": "2026-10-19", "dateLabel": "19 October 2026", "url": "https://github.com/owner/repo/releases/tag/b/v3.5.0"},
        })
    );
    let absent = build_tool_release_data(
        &tools(json!({"absent": {"repository": "owner/repo", "tagPrefix": "absent/v"}})),
        &mut |_| Ok(list.clone()),
    );
    assert_eq!(absent, Err("absent: no published stable release".into()));
}

fn graph(html: &str) -> Vec<Value> {
    let start = html.find(r#"<script type="application/ld+json">"#).unwrap() + 35;
    let end = start + html[start..].find("</script>").unwrap();
    let schema: Value = serde_json::from_str(&html[start..end]).unwrap();
    schema["@graph"].as_array().unwrap().clone()
}

#[test]
fn metadata_stamping_preserves_pinned_examples_whilst_replacing_current_product_metadata() {
    let source = format!(
        r#"<p>Worked example v0.1.3</p><script type="application/ld+json">{}</script>"#,
        json!({"@graph": [
            {"@type": "TechArticle", "dateModified": "2026-10-21"},
            {"@type": "SoftwareApplication", "name": "Old name", "offers": {"@type": "Offer", "price": "0"}},
        ]})
    );
    let release = json!({"version": "0.2.2", "date": "2026-10-20"});
    let tool = json!({"name": "Tool", "alternateName": ["old"], "codeRepository": "https://example.com/source", "sameAs": ["https://pypi.org/project/tool/"]});
    let stamped = stamp_tool_metadata(&source, &tool, Some(&release)).unwrap();
    assert!(stamped.contains("Worked example v0.1.3"));
    assert!(!stamped.contains("Offer"));
    assert!(stamped.contains("SoftwareSourceCode"));
    let stamped_graph = graph(&stamped);
    assert_eq!(stamped_graph[0]["dateModified"], "2026-10-21");
    assert_eq!(stamped_graph[1]["dateModified"], "2026-10-20");
    assert_eq!(
        stamped_graph[1]["sameAs"],
        json!(["https://pypi.org/project/tool/"])
    );
    let sitemap = "<loc>https://example.com/tool/</loc><lastmod>2026-09-01</lastmod>";
    assert_eq!(
        stamp_tool_sitemap(sitemap, "https://example.com/tool/", &stamped).unwrap(),
        "<loc>https://example.com/tool/</loc><lastmod>2026-10-21</lastmod>"
    );
    let cleared_tool = json!({"name": "Tool", "alternateName": [], "codeRepository": "https://example.com/source", "sameAs": []});
    let cleared = stamp_tool_metadata(&stamped, &cleared_tool, Some(&release)).unwrap();
    assert!(graph(&cleared)[1].get("sameAs").is_none());
    // A second pass over its own output changes nothing.
    assert_eq!(
        stamp_tool_metadata(&stamped, &tool, Some(&release)).unwrap(),
        stamped
    );
}

#[test]
fn sitemap_refresh_rejects_missing_or_inconsistent_document_dates() {
    let html = format!(
        r#"<script type="application/ld+json">{}</script>"#,
        json!({"@graph": [
            {"@type": "WebPage", "dateModified": "2026-10-20"},
            {"@type": "TechArticle", "dateModified": "2026-10-21"},
        ]})
    );
    for page in [html.as_str(), ""] {
        let refused = stamp_tool_sitemap("", "https://example.com/tool/", page).unwrap_err();
        assert!(
            refused.contains("one document modification date"),
            "{refused}"
        );
    }
}

#[test]
fn mcp_index_refresh_changes_only_the_current_release() {
    let index = "[Aus Accounting MCP](https://duguid.com.au/tools/australian-tax-ai-agents/): local MCP server, current release v0.5.0 (1 October 2026). Pinned example v0.2.8.";
    let updated = stamp_mcp_index(
        index,
        Some(&json!({"version": "0.6.0", "dateLabel": "20 October 2026"})),
    )
    .unwrap();
    assert!(updated.contains("current release v0.6.0 (20 October 2026)"));
    assert!(updated.contains("Pinned example v0.2.8"));
}

#[test]
fn calculator_identity_uses_the_newest_implementing_file_including_its_page_adapter() {
    let mut host = Fake::new(|args| {
        let url = url::Url::parse("https://api.github.com/")
            .unwrap()
            .join(args[1])
            .unwrap();
        let path = url
            .query_pairs()
            .find(|(k, _)| k == "path")
            .unwrap()
            .1
            .into_owned();
        Ok(if path == "assets/levy-page.mjs" {
            json!({"sha": "new-adapter", "date": "2026-10-19T12:33:50Z"})
        } else {
            json!({"sha": "old-core", "date": "2026-09-27T00:00:00Z"})
        }
        .to_string())
    });
    let revision = build_calculator_revision(&mut host).unwrap();
    assert_eq!(
        revision,
        (json!("new-adapter"), "2026-10-19T12:33:50Z".to_owned())
    );
    let paths: Vec<String> = host
        .asked
        .iter()
        .map(|(args, timeout)| {
            assert_eq!(*timeout, Some(Duration::from_secs(15)));
            args[1].clone()
        })
        .collect();
    assert_eq!(
        paths,
        [
            "repos/ryanduguid/ryanduguid.github.io/commits?path=assets%2Flevy.mjs&per_page=1",
            "repos/ryanduguid/ryanduguid.github.io/commits?path=assets%2Flevy-form.mjs&per_page=1",
            "repos/ryanduguid/ryanduguid.github.io/commits?path=assets%2Flevy-page.mjs&per_page=1",
            "repos/ryanduguid/ryanduguid.github.io/commits?path=assets%2Flevy-explanation.mjs&per_page=1",
        ]
    );
}

#[test]
fn register_facts_come_from_the_tool_data_and_touch_only_that_entry() {
    let register = card("https://example.com/x", "", "")
        + "\n"
        + &card("https://example.com/y", "", "").replace("/tools/x/", "/tools/y/");
    let stamped = stamp_register_facts(
        &register,
        "y",
        &json!({"delivery": "MCP", "boundary": "Human review <required> & logged."}),
    )
    .unwrap();
    let (first, second) = stamped.split_once("</dl>").unwrap();
    assert!(first.contains("<dd>Python</dd>") && first.contains("<dd>Review aid.</dd>"));
    assert!(second.contains("<dt>Delivery</dt><dd>MCP</dd>"));
    assert!(
        second.contains("<dt>Boundary</dt><dd>Human review &lt;required&gt; &amp; logged.</dd>")
    );
    let refused =
        stamp_register_facts(&register, "z", &json!({"delivery": "MCP", "boundary": "x"}));
    assert!(
        refused
            .unwrap_err()
            .contains("one register entry for z, found 0")
    );
}

#[test]
fn register_stamping_refuses_a_missing_or_repeated_fact_instead_of_leaving_it_stale() {
    let facts = json!({"delivery": "MCP", "boundary": "Review."});
    let refusal = |register: &str| stamp_register_facts(register, "x", &facts).unwrap_err();
    let no_boundary = card("https://example.com/x", "", "").replace(
        "\n                <div><dt>Boundary</dt><dd>Review aid.</dd></div>",
        "",
    );
    assert!(refusal(&no_boundary).contains("one Boundary for x, found 0"));
    let two_delivery = card("https://example.com/x", "", "")
        .replace("<dl>", "<dl>\n<div><dt>Delivery</dt><dd>Excel</dd></div>");
    assert!(refusal(&two_delivery).contains("one Delivery for x, found 2"));
    // A first card without facts must not take the next card's list.
    let later = card("https://example.com/y", "", "").replace("/tools/x/", "/tools/y/");
    let with_facts = card("https://example.com/x", "", "");
    let start = with_facts.find("\n              <dl>").unwrap();
    let end = with_facts.find("</dl>").unwrap() + "</dl>".len();
    let bare = format!("{}{}\n{later}", &with_facts[..start], &with_facts[end..]);
    assert!(refusal(&bare).contains("one Delivery for x, found 0"));
}

#[test]
fn latest_releases_list_the_newest_tagged_releases_ties_by_slug() {
    let home = "<ul class=\"latest-releases\" aria-labelledby=\"t\">\n            <li>old</li>\n          </ul>";
    let tool_data = tools(
        json!({"a": {"name": "A"}, "b": {"name": "B & Co"}, "c": {"name": "C"}, "d": {"name": "D"}, "levy": {"name": "Levy"}}),
    );
    let data = tools(json!({
        "a": {"tag": "a/v1.0.0", "version": "1.0.0", "date": "2026-10-20", "dateLabel": "20 October 2026"},
        "b": {"tag": "b/v2.0.0", "version": "2.0.0", "date": "2026-10-20", "dateLabel": "20 October 2026"},
        "c": {"tag": "c/v0.1.0", "version": "0.1.0", "date": "2026-09-01", "dateLabel": "1 September 2026"},
        "d": {"tag": "d/v0.2.0", "version": "0.2.0", "date": "2026-10-01", "dateLabel": "1 October 2026"},
        "levy": {"version": "abc123", "date": "2026-10-24", "dateLabel": "24 October 2026"},
    }));
    let stamped = stamp_latest_releases(home, &tool_data, &data, 3).unwrap();
    let slugs: Vec<&str> = stamped
        .split("href=\"/tools/")
        .skip(1)
        .map(|rest| rest.split('/').next().unwrap())
        .collect();
    assert_eq!(slugs, ["b", "a", "d"]);
    assert!(
        stamped.contains(
            r#"B &amp; Co v2.0.0</a> <time datetime="2026-10-20">20 October 2026</time>"#
        )
    );
    assert_eq!(
        stamp_latest_releases(&stamped, &tool_data, &data, 3).unwrap(),
        stamped
    );
    assert!(
        stamp_latest_releases("<p></p>", &tool_data, &data, 3)
            .unwrap_err()
            .contains("latest releases list not found")
    );
    let undated = tools(
        json!({"a": {"tag": "a/v1.0.0", "version": "1.0.0", "date": "20 October", "dateLabel": "20 October 2026"}}),
    );
    assert!(
        stamp_latest_releases(home, &tool_data, &undated, 3)
            .unwrap_err()
            .contains("a: release date must be YYYY-MM-DD")
    );
}

fn object(path: &Path) -> Map<String, Value> {
    serde_json::from_str(&site_tools::read(path).unwrap()).unwrap()
}

#[test]
fn the_committed_register_facts_and_homepage_releases_match_the_data() {
    let root = common::repository();
    let tool_data = object(&root.join("_data/tools.json"));
    let data = object(&root.join("_data/tool_releases.json"));
    let register = site_tools::read(&root.join("tools/index.html")).unwrap();
    let restamped = tool_data
        .iter()
        .fold(register.clone(), |html, (slug, tool)| {
            stamp_register_facts(&html, slug, tool).unwrap()
        });
    assert_eq!(restamped, register);
    let home = site_tools::read(&root.join("index.html")).unwrap();
    assert_eq!(
        stamp_latest_releases(&home, &tool_data, &data, 3).unwrap(),
        home
    );
}

/// A site with one stamped card and a changelog listing v1.0.0, and a host whose gh
/// answers the release and commit lookups.
fn cli_fixture(env: &[(&'static str, &'static str)]) -> (tempfile::TempDir, String, Fake) {
    let root = tempfile::tempdir().unwrap();
    for name in ["tools", "changelog"] {
        std::fs::create_dir(root.path().join(name)).unwrap();
    }
    let original = stamped_with(&card(WHOLE_REPO, "", ""), "2026-09-01");
    std::fs::write(root.path().join("tools/index.html"), &original).unwrap();
    std::fs::write(
        root.path().join("changelog/index.html"),
        release_table(&["v1.0.0"]),
    )
    .unwrap();
    let mut host = Fake::new(|args| {
        assert_eq!(args[0], "api");
        if args[1].contains("/releases?") {
            return Ok(release_json(&["v1.0.0"]));
        }
        assert!(args[1].contains("/commits?"), "{}", args[1]);
        Ok("2026-09-02T00:00:00Z\n".into())
    });
    host.env = env.to_vec();
    (root, original, host)
}

fn cli(args: &[&str], env: &[(&'static str, &'static str)]) -> (u8, String, String, Fake) {
    let (root, original, mut host) = cli_fixture(env);
    let args: Vec<String> = args.iter().map(|a| (*a).to_owned()).collect();
    let code = main_with(root.path(), &args, &mut host);
    let updated = site_tools::read(&root.path().join("tools/index.html")).unwrap();
    (code, original, updated, host)
}

#[test]
fn actions_writes_reject_a_feature_ref_a_tag_or_a_missing_ref_before_lookups_or_changes() {
    for env in [
        &[
            ("GITHUB_ACTIONS", "true"),
            ("GITHUB_REF", "refs/heads/feature-freshness"),
        ][..],
        &[
            ("GITHUB_ACTIONS", "true"),
            ("GITHUB_REF", "refs/tags/v0.0.0-fixture"),
        ],
        &[("GITHUB_ACTIONS", "true")],
    ] {
        let (code, original, updated, host) = cli(&["--write"], env);
        // Thrown errors exit 2, which the workflow keeps apart from release drift (1).
        assert_eq!(code, 2, "{env:?}");
        assert_eq!(
            host.said,
            [(
                "Source freshness writes in GitHub Actions require the main branch".to_owned(),
                true
            )]
        );
        assert_eq!(updated, original);
        assert!(host.asked.is_empty());
    }
}

#[test]
fn actions_on_main_and_a_local_invocation_can_refresh_dates() {
    for env in [
        &[
            ("GITHUB_ACTIONS", "true"),
            ("GITHUB_REF", "refs/heads/main"),
        ][..],
        &[],
    ] {
        let (code, original, updated, host) = cli(&["--write"], env);
        assert_eq!(code, 0, "{:?}", host.said);
        assert_ne!(updated, original);
        assert!(updated.contains(r#"datetime="2026-09-02""#));
        assert_eq!(
            host.asked,
            [(
                vec![
                    "api".to_owned(),
                    "repos/ryanduguid/australian-accounting-skills/commits?per_page=1".to_owned(),
                    "--jq".to_owned(),
                    ".[0].commit.committer.date".to_owned(),
                ],
                None
            )]
        );
        assert_eq!(host.said, [("source freshness updated".to_owned(), false)]);
    }
    // A second run with the same dates writes nothing and says so.
    let (root, _, mut host) = cli_fixture(&[]);
    let write = ["--write".to_owned()];
    assert_eq!(main_with(root.path(), &write, &mut host), 0);
    assert_eq!(main_with(root.path(), &write, &mut host), 0);
    assert_eq!(
        host.said[1],
        ("source freshness unchanged".to_owned(), false)
    );
}

#[test]
fn feature_ref_actions_keeps_offline_checking_and_release_checks_read_only() {
    let feature = [
        ("GITHUB_ACTIONS", "true"),
        ("GITHUB_REF", "refs/heads/feature-freshness"),
    ];
    let (code, original, updated, host) = cli(&[], &feature);
    assert_eq!(code, 0, "{:?}", host.said);
    assert_eq!(updated, original);
    assert_eq!(
        host.said,
        [("source freshness stamps passed".to_owned(), false)]
    );
    let (code, original, updated, host) = cli(&["--check-releases"], &feature);
    assert_eq!(code, 0, "{:?}", host.said);
    assert_eq!(updated, original);
    assert_eq!(
        host.said,
        [("current release references passed".to_owned(), false)]
    );
}

#[test]
fn offline_findings_exit_1_and_release_drift_exits_1() {
    let (root, _, mut host) = cli_fixture(&[]);
    std::fs::write(
        root.path().join("tools/index.html"),
        card(WHOLE_REPO, "", ""),
    )
    .unwrap();
    assert_eq!(main_with(root.path(), &[], &mut host), 1);
    assert_eq!(
        host.said,
        [(
            "ryanduguid/australian-accounting-skills: no last-commit stamp".to_owned(),
            true
        )]
    );
    let (root, _, mut host) = cli_fixture(&[]);
    std::fs::write(
        root.path().join("changelog/index.html"),
        release_table(&["v0.9.0"]),
    )
    .unwrap();
    assert_eq!(
        main_with(root.path(), &["--check-releases".to_owned()], &mut host),
        1
    );
    assert_eq!(
        host.said,
        [(
            "ryanduguid/example: v0.9.0 is not a published stable release".to_owned(),
            true
        )]
    );
}

#[test]
fn a_malformed_commit_date_stops_the_write_with_exit_2() {
    let (root, original, mut host) = cli_fixture(&[]);
    host.answer = Box::new(|_| Ok("\n".into()));
    assert_eq!(
        main_with(root.path(), &["--write".to_owned()], &mut host),
        2
    );
    assert_eq!(
        host.said,
        [("repos/ryanduguid/australian-accounting-skills/commits?per_page=1: expected a commit date, got (empty)".to_owned(), true)]
    );
    assert_eq!(
        site_tools::read(&root.path().join("tools/index.html")).unwrap(),
        original
    );
}

/// The repository files a tool release refresh reads and writes.
const REFRESHED: [&str; 6] = [
    "_data/tools.json",
    "_data/tool_releases.json",
    "tools/index.html",
    "sitemap.xml",
    "index.html",
    "llms.txt",
];

#[test]
fn a_tool_release_refresh_from_the_snapshot_reproduces_the_snapshot() {
    let repository = common::repository();
    let root = tempfile::tempdir().unwrap();
    for rel in REFRESHED {
        let to = root.path().join(rel);
        std::fs::create_dir_all(to.parent().unwrap()).unwrap();
        std::fs::copy(repository.join(rel), to).unwrap();
    }
    let tool_data = object(&repository.join("_data/tools.json"));
    for slug in tool_data.keys() {
        let rel = format!("tools/{slug}/index.html");
        std::fs::create_dir_all(root.path().join(format!("tools/{slug}"))).unwrap();
        std::fs::copy(repository.join(&rel), root.path().join(&rel)).unwrap();
    }
    // gh answers with exactly the releases and calculator revision the snapshot records.
    let snapshot = object(&repository.join("_data/tool_releases.json"));
    let levy = snapshot["coal-lsl-levy"].clone();
    let mut by_repository: Vec<(String, Vec<Value>)> = Vec::new();
    for (slug, entry) in &snapshot {
        let Some(tag) = entry.get("tag") else {
            continue;
        };
        let repository = tool_data[slug]["repository"].as_str().unwrap().to_owned();
        let release = json!({"tag_name": tag, "draft": false, "prerelease": false, "published_at": format!("{}T00:00:00Z", entry["date"].as_str().unwrap())});
        match by_repository.iter_mut().find(|(r, _)| *r == repository) {
            Some((_, list)) => list.push(release),
            None => by_repository.push((repository, vec![release])),
        }
    }
    let mut host = Fake::new(move |args| {
        if args[1].contains("/commits?") {
            return Ok(json!({"sha": levy["version"], "date": format!("{}T00:00:00Z", levy["date"].as_str().unwrap())}).to_string());
        }
        let list = by_repository
            .iter()
            .find(|(r, _)| args[1].starts_with(&format!("repos/{r}/releases?")))
            .map_or(Vec::new(), |(_, list)| list.clone());
        Ok(Value::from(list).to_string())
    });
    assert_eq!(
        main_with(root.path(), &["--build".to_owned()], &mut host),
        0,
        "{:?}",
        host.said
    );
    assert!(host.built);
    assert_eq!(
        host.said,
        [(
            "tool releases refreshed from published GitHub tags; browser levy from source revision"
                .to_owned(),
            false
        )]
    );
    assert_eq!(
        site_tools::read(&root.path().join("_data/tool_releases.json")).unwrap(),
        site_tools::read(&repository.join("_data/tool_releases.json")).unwrap()
    );
}

#[cfg(unix)]
#[test]
fn a_release_check_that_cannot_reach_gh_exits_2_not_1() {
    // The workflow opens a drift issue on exit 1 only, so an outage must not share that
    // code. With PATH holding only an empty directory, gh cannot be found and the lookup
    // fails before any request.
    let (root, _, _) = cli_fixture(&[]);
    let empty = tempfile::tempdir().unwrap();
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .args(["stamp_source_freshness", "--check-releases"])
        .env("SITE_ROOT", root.path())
        .env("PATH", empty.path())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(
        String::from_utf8_lossy(&output.stderr),
        "spawnSync gh ENOENT\n"
    );
}

#[cfg(unix)]
#[test]
fn gh_output_past_node_max_buffer_is_an_outage() {
    use std::os::unix::fs::PermissionsExt;
    // execFileSync stops gh once stdout and stderr together pass 1 MiB (ENOBUFS). The
    // list stays valid JSON however far it is padded, so only that limit can fail it.
    let check = |kib: u32| {
        let (root, _, _) = cli_fixture(&[]);
        let bin = tempfile::tempdir().unwrap();
        let gh = bin.path().join("gh");
        let script = format!(
            "#!/bin/sh\nprintf '%s' '{}'\ni=0\nwhile [ \"$i\" -lt {kib} ]; do printf '%1024s' ''; i=$((i+1)); done\n",
            release_json(&["v1.0.0"])
        );
        std::fs::write(&gh, script).unwrap();
        std::fs::set_permissions(&gh, std::fs::Permissions::from_mode(0o755)).unwrap();
        let output = std::process::Command::new(env!("CARGO_BIN_EXE_site-tools"))
            .args(["stamp_source_freshness", "--check-releases"])
            .env("SITE_ROOT", root.path())
            .env("PATH", bin.path())
            .output()
            .unwrap();
        (
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).into_owned(),
        )
    };
    assert_eq!(check(1000), (Some(0), String::new()));
    assert_eq!(check(1025), (Some(2), "spawnSync gh ENOBUFS\n".to_owned()));
}

#[cfg(unix)]
#[test]
fn a_failed_gh_reports_its_command_and_error_output() {
    use std::os::unix::fs::PermissionsExt;
    let (root, _, _) = cli_fixture(&[]);
    let bin = tempfile::tempdir().unwrap();
    let gh = bin.path().join("gh");
    std::fs::write(
        &gh,
        "#!/bin/sh\necho 'HTTP 403: rate limited' >&2\nexit 1\n",
    )
    .unwrap();
    std::fs::set_permissions(&gh, std::fs::Permissions::from_mode(0o755)).unwrap();
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .args(["stamp_source_freshness", "--check-releases"])
        .env("SITE_ROOT", root.path())
        .env("PATH", bin.path())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    // gh's own error output is passed through, then the failure names the command.
    assert_eq!(
        String::from_utf8_lossy(&output.stderr),
        format!(
            "HTTP 403: rate limited\nCommand failed: gh api repos/ryanduguid/example/releases?per_page=100&page=1 --jq {FIELDS}\nHTTP 403: rate limited\n\n"
        )
    );
}
