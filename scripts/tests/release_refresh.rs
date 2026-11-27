// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The publish job's content check of the tool release refresh: the snapshot may change
//! only in release tokens, every stamped page must be what apply_tool_releases writes,
//! and anything else must be a text mirror build_llms_full --check holds.
mod common;

use serde_json::{Map, Value};
use site_tools::release_refresh::{refresh_failures, shape_failures};
use site_tools::source_freshness::apply_tool_releases;
use std::path::Path;

const OLD: &str = r#"{
  "coal-lsl-levy": {
    "version": "0123456789abcdef0123456789abcdef01234567",
    "url": "https://github.com/ryanduguid/ryanduguid.github.io/commit/0123456789abcdef0123456789abcdef01234567"
  },
  "ozzit": {
    "version": "3.8.0",
    "tag": "v3.8.0",
    "date": "2026-11-24",
    "dateLabel": "24 November 2026",
    "url": "https://github.com/ryanduguid/Ozzit/releases/tag/v3.8.0"
  }
}
"#;
const PATH: &str = "_data/tool_releases.json";

fn shape(new: &str) -> Vec<String> {
    shape_failures(PATH, Some(OLD), new)
}

#[test]
fn a_version_bump_is_accepted() {
    let new = OLD.replace("3.8.0", "3.10.1").replace(
        "0123456789abcdef0123456789abcdef01234567",
        "89abcdef0123456789abcdef0123456789abcdef",
    );
    assert_eq!(shape(&new), Vec::<String>::new());
}

#[test]
fn a_date_change_is_accepted() {
    let new = OLD
        .replace("2026-11-24", "2026-12-01")
        .replace("24 November 2026", "1 December 2026");
    assert_eq!(shape(&new), Vec::<String>::new());
}

#[test]
fn an_added_line_is_refused() {
    let new = OLD.replace(
        "    \"tag\": \"v3.8.0\",\n",
        "    \"tag\": \"v3.8.0\",\n    \"note\": \"3.9.0\",\n",
    );
    assert_eq!(
        shape(&new),
        [format!(
            "{PATH}: 14 lines became 15; a release refresh adds and removes no line"
        )]
    );
}

#[test]
fn a_removed_line_is_refused() {
    let new = OLD.replace("    \"dateLabel\": \"24 November 2026\",\n", "");
    assert_eq!(
        shape(&new),
        [format!(
            "{PATH}: 14 lines became 13; a release refresh adds and removes no line"
        )]
    );
    // A dropped final newline is a removed line too.
    assert_eq!(shape(OLD.trim_end()).len(), 1);
}

#[test]
fn a_prose_change_is_refused() {
    let new = OLD
        .replace("24 November 2026", "24 November 2026, now audited")
        .replace("github.com/ryanduguid/Ozzit", "example.com/Ozzit");
    assert_eq!(
        shape(&new),
        [
            format!("{PATH}:10: changes more than a release version, date or commit"),
            format!("{PATH}:11: changes more than a release version, date or commit"),
        ]
    );
    // A version replaced by a word is prose too.
    assert_eq!(shape(&OLD.replace("v3.8.0\",", "vlatest\",")).len(), 1);
}

#[test]
fn a_new_file_is_refused() {
    assert_eq!(
        shape_failures(PATH, None, OLD),
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
fn a_snapshot_change_beyond_release_tokens_is_refused() {
    let (base, root) = refreshed();
    let path = root.path().join(PATH);
    let text = site_tools::read(&path).unwrap();
    std::fs::write(&path, text.replacen("ryanduguid/Ozzit", "someone/Ozzit", 1)).unwrap();
    let failures = refresh_failures(root.path(), base.path(), &changed(&[PATH])).unwrap();
    assert!(
        failures[0].starts_with(&format!("{PATH}:"))
            && failures[0].ends_with(": changes more than a release version, date or commit"),
        "{failures:?}"
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
