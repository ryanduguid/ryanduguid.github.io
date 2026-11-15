// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! A site-tools binary built from other `scripts/` sources than the checkout it runs in
//! refuses to write there, and `stamp_source_freshness` refuses arguments it does not know.

use site_tools::source_identity::{self, REINSTALL};
use std::path::Path;
use std::process::{Command, Output};

const BUILT: &str = env!("SITE_TOOLS_SOURCES");

/// A minimal `scripts/` crate under `root`, holding `body` as its only source file.
fn scripts_crate(root: &Path, body: &str) {
    let scripts = root.join("scripts");
    std::fs::create_dir_all(scripts.join("src/help")).unwrap();
    std::fs::create_dir_all(scripts.join("tests")).unwrap();
    for (name, text) in [
        ("Cargo.toml", "[package]\n"),
        ("Cargo.lock", "version = 4\n"),
        ("build.rs", "fn main() {}\n"),
        ("src/main.rs", body),
        ("src/help/usage.txt", "usage\n"),
        ("tests/check.rs", "#[test]\nfn check() {}\n"),
    ] {
        std::fs::write(scripts.join(name), text).unwrap();
    }
}

fn site_tools(root: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .args(args)
        .current_dir(root)
        .env("SITE_ROOT", root)
        .output()
        .unwrap()
}

#[test]
fn built_identity_matches_this_checkout() {
    let scripts = Path::new(env!("CARGO_MANIFEST_DIR"));
    assert_eq!(source_identity::of(scripts).unwrap(), BUILT);
}

#[test]
fn identity_follows_the_build_inputs_only() {
    let site = tempfile::tempdir().unwrap();
    scripts_crate(site.path(), "fn main() {}\n");
    let scripts = site.path().join("scripts");
    let first = source_identity::of(&scripts).unwrap();
    assert_eq!(source_identity::of(&scripts).unwrap(), first);

    std::fs::write(
        scripts.join("tests/check.rs"),
        "// not built into the binary\n",
    )
    .unwrap();
    std::fs::write(scripts.join("release_record.json"), "{}\n").unwrap();
    assert_eq!(source_identity::of(&scripts).unwrap(), first);

    for (name, text) in [
        ("src/help/usage.txt", "usage: changed\n"),
        ("Cargo.lock", "version = 3\n"),
        ("build.rs", "fn main() { }\n"),
    ] {
        let before = source_identity::of(&scripts).unwrap();
        std::fs::write(scripts.join(name), text).unwrap();
        assert_ne!(source_identity::of(&scripts).unwrap(), before, "{name}");
    }
    let before = source_identity::of(&scripts).unwrap();
    std::fs::rename(scripts.join("src/main.rs"), scripts.join("src/lib.rs")).unwrap();
    assert_ne!(
        source_identity::of(&scripts).unwrap(),
        before,
        "a renamed source"
    );
}

#[test]
fn check_refuses_writes_and_warns_on_reads_from_other_sources() {
    let site = tempfile::tempdir().unwrap();
    scripts_crate(site.path(), "fn main() {}\n");
    let current = source_identity::of(&site.path().join("scripts")).unwrap();

    assert_eq!(
        source_identity::check(site.path(), &current, true),
        Ok(None)
    );
    assert_eq!(
        source_identity::check(site.path(), &current, false),
        Ok(None)
    );

    let refusal = source_identity::check(site.path(), "0123456789abcdef", true).unwrap_err();
    for expected in ["0123456789abcdef", current.as_str(), REINSTALL] {
        assert!(refusal.contains(expected), "{refusal}");
    }
    let warning = source_identity::check(site.path(), "0123456789abcdef", false)
        .unwrap()
        .unwrap();
    for expected in ["0123456789abcdef", current.as_str(), REINSTALL] {
        assert!(warning.contains(expected), "{warning}");
    }
}

#[test]
fn check_ignores_a_root_without_the_site_tools_crate() {
    let site = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(site.path().join("scripts")).unwrap();
    assert_eq!(source_identity::check(site.path(), BUILT, true), Ok(None));
}

#[test]
fn a_stale_binary_refuses_every_writing_invocation() {
    let site = tempfile::tempdir().unwrap();
    scripts_crate(site.path(), "fn main() { /* newer than this binary */ }\n");
    let current = source_identity::of(&site.path().join("scripts")).unwrap();
    for args in [
        &["build_llms_full", "--write"][..],
        &["build_rates_json", "--check"],
        &["check_design", "--update-baseline"],
        &["stamp_source_freshness", "--write"],
        &["stamp_source_freshness", "--write-tool-releases"],
        &["favicon_render"],
        &[
            "check_ato_sources",
            "--baseline",
            "baseline",
            "--out",
            "out",
        ],
        &["check_ato_sources", "--issue=issue.md"],
    ] {
        let output = site_tools(site.path(), args);
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert_eq!(output.status.code(), Some(1), "{args:?}: {stderr}");
        for expected in [BUILT, current.as_str(), REINSTALL] {
            assert!(stderr.contains(expected), "{args:?}: {stderr}");
        }
    }
    assert!(!site.path().join("llms-full.txt").exists());
}

#[test]
fn a_stale_binary_warns_before_a_read_only_command() {
    let site = tempfile::tempdir().unwrap();
    scripts_crate(site.path(), "fn main() { /* newer than this binary */ }\n");
    let output = site_tools(site.path(), &["stamp_source_freshness", "--help"]);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(output.status.code(), Some(0), "{stderr}");
    assert!(
        stderr.contains("warning") && stderr.contains(REINSTALL),
        "{stderr}"
    );
}

#[test]
fn stamp_source_freshness_prints_help_without_running() {
    let site = tempfile::tempdir().unwrap();
    for help in ["--help", "-h"] {
        let output = site_tools(site.path(), &["stamp_source_freshness", help]);
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert_eq!(output.status.code(), Some(0), "{help}: {stdout}");
        assert!(
            stdout.starts_with("usage: site-tools stamp_source_freshness"),
            "{help}: {stdout}"
        );
        assert!(output.stderr.is_empty(), "{help}");
    }
}

#[test]
fn stamp_source_freshness_rejects_an_unknown_argument() {
    let site = tempfile::tempdir().unwrap();
    let output = site_tools(site.path(), &["stamp_source_freshness", "--chek-releases"]);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(output.status.code(), Some(2), "{stderr}");
    assert!(
        stderr.contains("usage: site-tools stamp_source_freshness")
            && stderr.contains("--chek-releases"),
        "{stderr}"
    );
    assert!(!stderr.contains("index.html"), "ran the check: {stderr}");
}
