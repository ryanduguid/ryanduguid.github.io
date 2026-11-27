// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The publish job's content check of the tool release refresh: in each changed snapshot
//! entry only the version and date are free and the tag, date label and URL must follow
//! from them, every stamped page must be what apply_tool_releases writes, and anything
//! else must be a text mirror build_llms_full --check holds.
mod common;

use serde_json::{Map, Value};
use site_tools::release_refresh::{refresh_failures, snapshot_failures};
use site_tools::source_freshness::apply_tool_releases;
use std::path::Path;

const OLD: &str = r#"{
  "coal-lsl-levy": {
    "version": "0123456789abcdef0123456789abcdef01234567",
    "date": "2026-11-27",
    "dateLabel": "27 November 2026",
    "url": "https://github.com/ryanduguid/ryanduguid.github.io/commit/0123456789abcdef0123456789abcdef01234567"
  },
  "ozzit": {
    "name": "Ozzit",
    "version": "3.8.0",
    "tag": "v3.8.0",
    "date": "2026-11-24",
    "dateLabel": "24 November 2026",
    "url": "https://github.com/ryanduguid/Ozzit/releases/tag/v3.8.0"
  }
}
"#;
const TOOLS: &str = r#"{
  "coal-lsl-levy": { "repository": "ryanduguid/ryanduguid.github.io", "tagPrefix": null },
  "ozzit": { "repository": "ryanduguid/Ozzit", "tagPrefix": "v" }
}"#;
const PATH: &str = "_data/tool_releases.json";
const COMMIT: &str = "0123456789abcdef0123456789abcdef01234567";

fn tools() -> Map<String, Value> {
    serde_json::from_str(TOOLS).unwrap()
}

fn check(new: &str) -> Vec<String> {
    snapshot_failures(Some(OLD), new, &tools())
}

/// The refusal of `what` in the entry `slug`.
fn refused(slug: &str, what: &str) -> String {
    format!("{PATH}: {slug}: {what}")
}

fn not_derived(slug: &str, key: &str) -> String {
    refused(
        slug,
        &format!("{key} is not what the refresh writes for its version, date and tool"),
    )
}

#[test]
fn a_version_bump_is_accepted() {
    let new = OLD
        .replace("3.8.0", "3.10.1")
        .replace(COMMIT, "89abcdef0123456789abcdef0123456789abcdef");
    assert_eq!(check(&new), Vec::<String>::new());
    assert_eq!(check(OLD), Vec::<String>::new());
}

#[test]
fn a_date_change_is_accepted() {
    let new = OLD
        .replace("2026-11-24", "2026-12-01")
        .replace("24 November 2026", "1 December 2026")
        .replace("2026-11-27", "2027-01-02")
        .replace("27 November 2026", "2 January 2027");
    assert_eq!(check(&new), Vec::<String>::new());
}

#[test]
fn a_tag_that_does_not_match_its_version_is_refused() {
    // The tag and URL moved without the version.
    assert_eq!(
        check(&OLD.replace("v3.8.0", "v3.9.0")),
        [not_derived("ozzit", "tag"), not_derived("ozzit", "url")]
    );
    // The version moved without the tag and URL.
    assert_eq!(
        check(&OLD.replace("\"3.8.0\"", "\"3.9.0\"")),
        [not_derived("ozzit", "tag"), not_derived("ozzit", "url")]
    );
}

#[test]
fn a_url_for_another_repository_is_refused() {
    assert_eq!(
        check(&OLD.replace("ryanduguid/Ozzit", "someone/Ozzit")),
        [not_derived("ozzit", "url")]
    );
    assert_eq!(
        check(&OLD.replace("ryanduguid.github.io/commit", "someone.github.io/commit")),
        [not_derived("coal-lsl-levy", "url")]
    );
    // A commit swapped into the URL alone.
    let url = format!("commit/{COMMIT}");
    let swapped = "commit/89abcdef0123456789abcdef0123456789abcdef";
    assert_eq!(
        check(&OLD.replace(&url, swapped)),
        [not_derived("coal-lsl-levy", "url")]
    );
}

#[test]
fn a_date_label_that_disagrees_with_its_date_is_refused() {
    assert_eq!(
        check(&OLD.replace("24 November 2026", "25 November 2026")),
        [not_derived("ozzit", "dateLabel")]
    );
    assert_eq!(
        check(&OLD.replace("2026-11-24", "2026-11-25")),
        [not_derived("ozzit", "dateLabel")]
    );
}

#[test]
fn a_changed_name_field_is_refused() {
    assert_eq!(
        check(&OLD.replace("\"Ozzit\"", "\"Ozzit Pro\"")),
        [refused(
            "ozzit",
            "changes name, which a release refresh never writes"
        )]
    );
}

#[test]
fn a_version_or_date_that_is_not_one_is_refused() {
    assert_eq!(
        check(&OLD.replace("3.8.0", "latest")),
        [refused(
            "ozzit",
            "version is not a stable major.minor.patch"
        )]
    );
    assert_eq!(
        check(&OLD.replace(COMMIT, "main")),
        [refused(
            "coal-lsl-levy",
            "version is not a 40-character commit"
        )]
    );
    assert_eq!(
        check(&OLD.replace(COMMIT, &COMMIT.to_uppercase())),
        [refused(
            "coal-lsl-levy",
            "version is not a 40-character commit"
        )]
    );
    assert_eq!(
        check(
            &OLD.replace("2026-11-24", "2026-02-30")
                .replace("24 November 2026", "30 February 2026")
        ),
        [refused("ozzit", "date is not an ISO calendar date")]
    );
}

#[test]
fn an_entry_or_field_added_removed_or_reordered_is_refused() {
    let entries = || {
        format!("{PATH}: adds, removes or reorders an entry; a release refresh only updates them")
    };
    let mut data: Map<String, Value> = serde_json::from_str(OLD).unwrap();
    let ozzit = data.shift_remove("ozzit").unwrap();
    let write = |data: &Map<String, Value>| {
        format!(
            "{}\n",
            site_tools::node::stringify(&Value::Object(data.clone()))
        )
    };
    assert_eq!(check(&write(&data)), [entries()]);
    let mut reordered = Map::new();
    reordered.insert("ozzit".into(), ozzit.clone());
    reordered.extend(data.clone());
    assert_eq!(check(&write(&reordered)), [entries()]);
    data.insert("ozzit".into(), ozzit.clone());
    data.insert("other".into(), ozzit);
    assert_eq!(check(&write(&data)), [entries()]);

    let fields = || refused("ozzit", "adds, removes or reorders a field");
    assert_eq!(
        check(&OLD.replace("    \"name\": \"Ozzit\",\n", "")),
        [fields()]
    );
    assert_eq!(
        check(&OLD.replace(
            "    \"name\": \"Ozzit\",\n    \"version\": \"3.8.0\",\n",
            "    \"version\": \"3.8.0\",\n    \"name\": \"Ozzit\",\n"
        )),
        [fields()]
    );
}

#[test]
fn an_entry_the_tools_do_not_describe_is_refused() {
    let new = OLD.replace("3.8.0", "3.9.0");
    let mut tools = tools();
    tools.remove("ozzit");
    assert_eq!(
        snapshot_failures(Some(OLD), &new, &tools),
        [refused(
            "ozzit",
            "no tool of that name in main's _data/tools.json"
        )]
    );
    let text = OLD.replace(
        "\"ozzit\": {\n    \"name\": \"Ozzit\",",
        "\"ozzit\": \"3.8.0\",\n  \"was\": {\n    \"name\": \"Ozzit\",",
    );
    let flat = OLD.replace(
        "\"ozzit\": {\n    \"name\": \"Ozzit\",",
        "\"ozzit\": \"3.9.0\",\n  \"was\": {\n    \"name\": \"Ozzit\",",
    );
    assert_eq!(
        snapshot_failures(Some(&text), &flat, &tools),
        [refused("ozzit", "not an object")]
    );
}

#[test]
fn a_snapshot_that_is_not_the_writers_json_is_refused() {
    assert_eq!(
        check(OLD.trim_end()),
        [format!("{PATH}: not laid out as the refresh writes it")]
    );
    for new in ["[]\n", "{\n"] {
        assert_eq!(check(new), [format!("{PATH}: not a JSON object")], "{new}");
    }
}

#[test]
fn a_new_file_is_refused() {
    assert_eq!(
        snapshot_failures(None, OLD, &tools()),
        [format!(
            "{PATH}: a new file; a release refresh only rewrites files main has"
        )]
    );
}

fn object(path: &Path) -> Map<String, Value> {
    match serde_json::from_str(&site_tools::read(path).unwrap()).unwrap() {
        Value::Object(map) => map,
        _ => panic!("{} is not an object", path.display()),
    }
}

/// A copy of the files the refresh reads and stamps, from this checkout.
fn site() -> tempfile::TempDir {
    let repository = common::repository();
    let dir = tempfile::tempdir().unwrap();
    let mut files: Vec<String> = [
        "_data/tools.json",
        PATH,
        "tools/index.html",
        "sitemap.xml",
        "index.html",
        "llms.txt",
    ]
    .map(str::to_owned)
    .into();
    let tools = object(&repository.join("_data/tools.json"));
    files.extend(tools.keys().map(|slug| format!("tools/{slug}/index.html")));
    for rel in files {
        let to = dir.path().join(&rel);
        std::fs::create_dir_all(to.parent().unwrap()).unwrap();
        std::fs::copy(repository.join(&rel), to).unwrap();
    }
    dir
}

/// `base` as main and a refreshed copy that moves Ozzit to a new release.
fn refreshed() -> (tempfile::TempDir, tempfile::TempDir) {
    let (base, root) = (site(), site());
    let mut data = object(&root.path().join(PATH));
    let Some(Value::Object(ozzit)) = data.get_mut("ozzit") else {
        panic!("no Ozzit release");
    };
    let old = ozzit["version"].as_str().unwrap().to_owned();
    for (key, value) in [
        ("version", "9.9.9".to_owned()),
        ("tag", "v9.9.9".to_owned()),
        ("date", "2026-12-31".to_owned()),
        ("dateLabel", "31 December 2026".to_owned()),
        ("url", ozzit["url"].as_str().unwrap().replace(&old, "9.9.9")),
    ] {
        ozzit.insert(key.into(), Value::String(value));
    }
    std::fs::write(
        root.path().join(PATH),
        format!(
            "{}\n",
            site_tools::node::stringify(&Value::Object(data.clone()))
        ),
    )
    .unwrap();
    let tools = object(&root.path().join("_data/tools.json"));
    apply_tool_releases(root.path(), &tools, &data).unwrap();
    (base, root)
}

fn changed(paths: &[&str]) -> Vec<String> {
    paths.iter().map(|p| (*p).to_owned()).collect()
}

#[test]
fn the_generators_own_refresh_passes() {
    let (base, root) = refreshed();
    let paths = changed(&[
        PATH,
        "index.html",
        "llms.txt",
        "sitemap.xml",
        "tools/ozzit/index.html",
        "tools/ozzit/index.txt",
        "index.txt",
        "llms-full.txt",
        "llms-full-ozzit-1.txt",
        ".well-known/llms.txt",
    ]);
    assert_eq!(
        refresh_failures(root.path(), base.path(), &paths).unwrap(),
        Vec::<String>::new()
    );
    // The mirrors and the part index of llms.txt are left to build_llms_full --check,
    // which the same job runs: this command reads none of them.
    let llms = root.path().join("llms.txt");
    let text = std::fs::read_to_string(&llms).unwrap();
    std::fs::write(&llms, text.replacen("every indexable page", "all pages", 1)).unwrap();
    assert_eq!(
        refresh_failures(root.path(), base.path(), &paths).unwrap(),
        Vec::<String>::new()
    );
}

#[test]
fn foreign_bytes_in_a_stamped_page_are_refused() {
    for rel in [
        "index.html",
        "tools/index.html",
        "tools/ozzit/index.html",
        "sitemap.xml",
    ] {
        let (base, root) = refreshed();
        let path = root.path().join(rel);
        let mut bytes = std::fs::read(&path).unwrap();
        bytes.extend_from_slice(b"<!-- foreign -->\n");
        std::fs::write(&path, bytes).unwrap();
        assert_eq!(
            refresh_failures(root.path(), base.path(), &changed(&[rel])).unwrap(),
            [format!(
                "{rel}: not what apply_tool_releases writes from main and the refreshed snapshot"
            )],
            "{rel}"
        );
    }
}

#[test]
fn a_changed_llms_txt_body_is_refused() {
    let (base, root) = refreshed();
    let llms = root.path().join("llms.txt");
    let text = site_tools::read(&llms).unwrap();
    std::fs::write(
        &llms,
        text.replacen("Licence:", "Licence (see example.com):", 1),
    )
    .unwrap();
    // The replay compares every stamped page, listed as changed or not.
    assert_eq!(
        refresh_failures(root.path(), base.path(), &[]).unwrap(),
        ["llms.txt: not what apply_tool_releases writes from main and the refreshed snapshot"]
    );
}

#[test]
fn a_snapshot_url_that_drifts_from_its_release_is_refused() {
    let (base, root) = refreshed();
    let path = root.path().join(PATH);
    let text = site_tools::read(&path).unwrap();
    std::fs::write(&path, text.replacen("ryanduguid/Ozzit", "someone/Ozzit", 1)).unwrap();
    // The pages replayed from that snapshot pass; the snapshot itself does not.
    assert_eq!(
        refresh_failures(root.path(), base.path(), &changed(&[PATH])).unwrap(),
        [not_derived("ozzit", "url")]
    );
}

#[test]
fn a_path_the_refresh_never_writes_is_refused() {
    let (base, root) = refreshed();
    for rel in [
        "tools/depreciation-rates/index.html",
        "tools/depreciation-rates/asset/division-40/index.txt",
        "arbitrary/index.txt",
        "docs/llms-full.txt",
    ] {
        assert_eq!(
            refresh_failures(root.path(), base.path(), &changed(&[rel])).unwrap(),
            [format!("{rel}: the release refresh never writes it")],
            "{rel}"
        );
    }
}

/// A host that records what the command says and refuses any network call.
#[derive(Default)]
struct Quiet(Vec<(String, bool)>);

impl site_tools::source_freshness::Host for Quiet {
    fn gh(&mut self, _: &[&str], _: Option<std::time::Duration>) -> Result<String, String> {
        Err("gh should not be called".into())
    }
    fn env(&self, _: &str) -> Option<String> {
        None
    }
    fn today(&self) -> String {
        "2026-11-27".into()
    }
    fn build_site(&mut self, _: &Path) -> Result<(), String> {
        Err("the site should not be built".into())
    }
    fn say(&mut self, text: &str, stderr: bool) {
        self.0.push((text.to_owned(), stderr));
    }
}

#[test]
fn the_command_exits_on_what_it_found() {
    let run = |root: &Path, args: &[String]| {
        let mut host = Quiet::default();
        let code = site_tools::source_freshness::main_with(root, args, &mut host);
        (code, host.0)
    };
    let (base, root) = refreshed();
    let mut args = changed(&[
        "--verify-tool-releases",
        base.path().to_str().unwrap(),
        PATH,
    ]);
    assert_eq!(
        run(root.path(), &args),
        (
            0,
            vec![(
                "the release refresh is what its generators write".to_owned(),
                false
            )]
        )
    );
    args.push("README.md".into());
    assert_eq!(
        run(root.path(), &args),
        (
            1,
            vec![(
                "README.md: the release refresh never writes it".to_owned(),
                true
            )]
        )
    );
    let (code, said) = run(root.path(), &args[..1]);
    assert_eq!(code, 2);
    assert!(
        said[0]
            .0
            .ends_with("error: --verify-tool-releases needs BASE"),
        "{said:?}"
    );
}
