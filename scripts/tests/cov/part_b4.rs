// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Failed writes and live checks that reach no network: `pin_rates`,
//! `build_effective_life` and `release_record --verify-live`.
use site_tools::{pin_rates, release_record};
use std::path::Path;
use std::process::Command;

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|v| (*v).to_owned()).collect()
}

/// `site-tools build_effective_life` in `root` with its stdout or stderr on /dev/full.
#[cfg(target_os = "linux")]
fn on_full_device(root: &Path, args: &[&str], stderr: bool) -> std::process::Output {
    let full = || {
        std::fs::OpenOptions::new()
            .write(true)
            .open("/dev/full")
            .unwrap()
    };
    let mut command = Command::new(env!("CARGO_BIN_EXE_site-tools"));
    command
        .arg("build_effective_life")
        .args(args)
        .env("SITE_ROOT", root);
    if stderr {
        command.stderr(full());
    } else {
        command.stdout(full());
    }
    command.output().unwrap()
}

#[cfg(target_os = "linux")]
#[test]
fn a_usage_message_that_cannot_be_written_fails_the_command() {
    let dir = tempfile::tempdir().unwrap();
    // A written usage message exits 2; one that cannot be written is an error, exit 1.
    assert_eq!(on_full_device(dir.path(), &[], true).status.code(), Some(1));
}

#[test]
fn a_pinned_extract_that_cannot_be_written_names_the_file() {
    let repo = tempfile::tempdir().unwrap();
    let git = |args: &[&str]| {
        let status = Command::new("git")
            .current_dir(repo.path())
            .args(args)
            .env("GIT_AUTHOR_NAME", "Test")
            .env("GIT_AUTHOR_EMAIL", "test@example.com")
            .env("GIT_COMMITTER_NAME", "Test")
            .env("GIT_COMMITTER_EMAIL", "test@example.com")
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?}");
    };
    git(&["init", "-q"]);
    let data = repo.path().join("packages/au-tax-rates-data/data");
    std::fs::create_dir_all(&data).unwrap();
    for name in [
        "car-limit-2026-27",
        "cents-per-km-2026-27",
        "div7a-benchmark-rate-2026-27",
        "fbt-rate",
        "gst-registration-threshold",
        "instant-asset-write-off-threshold",
        "medicare-levy-rate",
        "resident-tax-rates-2026-27",
        "super-guarantee-rate-2026-27",
    ] {
        std::fs::write(data.join(format!("{name}.json")), r#"{"value": 1}"#).unwrap();
    }
    git(&["add", "."]);
    git(&["commit", "-q", "-m", "seed", "--no-gpg-sign"]);
    // The site root has no scripts/ folder, so the extract has nowhere to go.
    let site = tempfile::tempdir().unwrap();
    let error = pin_rates::run(site.path(), &s(&[repo.path().to_str().unwrap()])).unwrap_err();
    assert!(error.starts_with("[Errno 2] "), "{error}");
    assert!(error.contains("rates_dataset_extract.json"), "{error}");
}

#[test]
fn verify_live_with_every_source_unreachable_reports_each_and_exits_2() {
    let proxy = std::ffi::OsStr::new("http://127.0.0.1:9");
    crate::run_in_isolated_child(
        "part_b4::verify_live_with_every_source_unreachable_reports_each_and_exits_2",
        &[
            ("ALL_PROXY", proxy),
            ("HTTPS_PROXY", proxy),
            ("HTTP_PROXY", proxy),
        ],
        || {
            let root = crate::common::repository();
            let code = release_record::run(&root, &s(&["--verify-live"])).unwrap();
            assert_eq!(code, 2);
        },
    );
}
