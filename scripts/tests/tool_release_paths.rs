// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The publish-tool-releases job pushes a patch with an App token only after its staged
//! files pass an allow-list: exclude pathspecs, and a rule that each staged file is a
//! rewrite of one main already has. This test reads both commands from the workflow, holds
//! the pathspecs to the reviewed set and runs them through Git on a scratch repository.
mod common;

use common::{git, repository};
use std::path::Path;

const WORKFLOW: &str = ".github/workflows/source-freshness.yml";
const APPLY: &str = "git apply --index \"$RUNNER_TEMP/tool-releases/tool-releases.patch\"";
const LISTED: &str = "unexpected=$(git diff --cached --name-only --no-renames -- . \\";
const REWRITES: &str =
    "not_rewritten=$(git diff --cached --name-only --no-renames --diff-filter=m)";
const MODES: &str =
    "mode_changed=$(git diff --cached --summary --no-renames | grep ' mode change ' || true)";
/// The test of what the 3 commands found: any one of them refuses the patch.
const REFUSES: &str = "if [ -n \"$unexpected$not_rewritten$mode_changed\" ]; then";
const PATHSPECS: [&str; 9] = [
    ":(exclude)_data/tool_releases.json",
    ":(exclude)index.html",
    ":(exclude)sitemap.xml",
    ":(exclude)llms.txt",
    ":(exclude).well-known/llms.txt",
    ":(exclude)tools/index.html",
    ":(exclude,glob)tools/*/index.html",
    ":(exclude,glob)**/index.txt",
    ":(exclude,glob)llms-full*.txt",
];

/// The release job's check, from its patch step to the test of what it found.
fn check_block(text: &str) -> Vec<&str> {
    let block: Vec<&str> = text
        .lines()
        .map(str::trim)
        .skip_while(|line| *line != APPLY)
        .take_while(|line| !line.starts_with("if ["))
        .collect();
    assert!(!block.is_empty(), "{WORKFLOW} lost the release patch step");
    block
}

/// The pathspecs of the allow-list command: every token on its continuation lines, which
/// must all be single-quoted, so a token the parser cannot read fails the test.
fn pathspecs(block: &[&str]) -> Vec<String> {
    let start = block.iter().position(|line| *line == LISTED);
    let start = start.unwrap_or_else(|| panic!("{WORKFLOW} lost the allow-list command"));
    let mut specs = Vec::new();
    for line in &block[start + 1..] {
        let body = line.strip_suffix(" \\").or_else(|| line.strip_suffix(')'));
        let body = body.unwrap_or_else(|| panic!("unexpected allow-list line {line:?}"));
        for token in body.split(' ') {
            let spec = token.strip_prefix('\'').and_then(|t| t.strip_suffix('\''));
            let spec = spec.unwrap_or_else(|| panic!("unquoted pathspec {token:?}"));
            assert!(!spec.contains('\''), "{token:?}");
            specs.push(spec.to_owned());
        }
        if line.ends_with(')') {
            return specs;
        }
    }
    panic!("the allow-list command in {WORKFLOW} never closes");
}

/// A scratch repository holding `base` as main, with `changes` written and staged.
fn staged(base: &[&str], changes: &[&str]) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let write = |file: &str, text: &str| {
        let path = root.join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    };
    git(root, &["init", "-q"]);
    for file in base {
        write(file, "main\n");
    }
    git(root, &["add", "-A"]);
    git(root, &["commit", "-q", "-m", "main"]);
    for file in changes {
        write(file, "refreshed\n");
    }
    git(root, &["add", "-A"]);
    dir
}

/// What the 2 commands report, in order.
fn refused(specs: &[String], base: &[&str], changes: &[&str]) -> Vec<String> {
    let dir = staged(base, changes);
    let mut listed = vec!["diff", "--cached", "--name-only", "--no-renames", "--", "."];
    listed.extend(specs.iter().map(String::as_str));
    let rewrites = [
        "diff",
        "--cached",
        "--name-only",
        "--no-renames",
        "--diff-filter=m",
    ];
    let mut out: Vec<String> = Vec::new();
    for args in [listed.as_slice(), rewrites.as_slice()] {
        out.extend(git(dir.path(), args).lines().map(str::to_owned));
    }
    out
}

const GENERATED: [&str; 13] = [
    "_data/tool_releases.json",
    "index.html",
    "index.txt",
    "sitemap.xml",
    "llms.txt",
    ".well-known/llms.txt",
    "llms-full.txt",
    "llms-full-tools-1.txt",
    "tools/index.html",
    "tools/index.txt",
    "tools/coal-lsl/index.html",
    "tools/coal-lsl/index.txt",
    "evidence/index.txt",
];

#[test]
fn allow_list_is_the_reviewed_set() {
    let text = std::fs::read_to_string(repository().join(Path::new(WORKFLOW))).unwrap();
    let block = check_block(&text);
    assert_eq!(pathspecs(&block), PATHSPECS.map(str::to_owned));
    assert!(
        block.contains(&REWRITES),
        "{WORKFLOW} lost the rewrite-only rule"
    );
    assert!(block.contains(&MODES), "{WORKFLOW} lost the mode rule");
    let refusal = text
        .lines()
        .map(str::trim)
        .skip_while(|line| *line != APPLY)
        .find(|line| line.starts_with("if ["));
    assert_eq!(
        refusal,
        Some(REFUSES),
        "{WORKFLOW} no longer refuses on all 3 findings"
    );
}

/// A mode-only change to a generated file is a modification, so only the mode rule sees it.
#[test]
fn a_mode_change_is_refused() {
    let dir = staged(&["evidence/index.txt"], &[]);
    git(
        dir.path(),
        &["update-index", "--chmod=+x", "evidence/index.txt"],
    );
    // Git prints the line as " mode change ...", which the workflow's grep matches; the
    // helper trims its leading space.
    let summary = git(
        dir.path(),
        &["diff", "--cached", "--summary", "--no-renames"],
    );
    assert_eq!(summary, "mode change 100644 => 100755 evidence/index.txt");
    let specs = PATHSPECS.map(str::to_owned);
    assert!(refused(&specs, &["evidence/index.txt"], &[]).is_empty());
}

#[test]
fn allow_list_admits_only_rewrites_of_generated_files() {
    let specs = PATHSPECS.map(str::to_owned);
    assert_eq!(
        refused(&specs, &GENERATED, &GENERATED),
        Vec::<String>::new()
    );
    let mut base = GENERATED.to_vec();
    base.extend([
        "README.md",
        "_data/tools.json",
        "changelog/index.html",
        "scripts/src/main.rs",
    ]);
    for file in [
        "README.md",
        "_data/tools.json",
        "changelog/index.html",
        "scripts/src/main.rs",
    ] {
        assert_eq!(refused(&specs, &base, &[file]), [file], "{file}");
    }
    // New files, even where a glob matches their name.
    for file in [
        "tools/example/extra.js",
        "tools/x/y/index.html",
        "tools/new-page/index.html",
        "arbitrary/index.txt",
        "llms-full-unrelated.txt",
        ".well-known/security.txt",
    ] {
        let mut want = vec![file.to_owned()];
        if ![
            "tools/new-page/index.html",
            "arbitrary/index.txt",
            "llms-full-unrelated.txt",
        ]
        .contains(&file)
        {
            want.insert(0, file.to_owned());
        }
        assert_eq!(refused(&specs, &base, &[file]), want, "{file}");
    }
    // A deleted mirror is not a rewrite either.
    let dir = staged(&base, &[]);
    git(dir.path(), &["rm", "-q", "evidence/index.txt"]);
    let deleted = git(
        dir.path(),
        &[
            "diff",
            "--cached",
            "--name-only",
            "--no-renames",
            "--diff-filter=m",
        ],
    );
    assert_eq!(deleted, "evidence/index.txt");
}

/// The globs admit only what main tracks, so every tracked file they match must be one
/// the repository declares generated.
#[test]
fn tracked_files_the_globs_match_are_declared_generated() {
    let root = repository();
    let tracked = git(
        &root,
        &[
            "ls-files",
            "--",
            ":(glob)**/index.txt",
            ":(glob)llms-full*.txt",
            ".well-known/llms.txt",
        ],
    );
    assert!(!tracked.is_empty());
    let undeclared = site_tools::review_generated::undeclared(&root, tracked.lines()).unwrap();
    assert!(undeclared.is_empty(), "{undeclared:#?}");
}
