// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The publish-tool-releases job pushes a patch with an App token only after its staged
//! files pass an exclude-pathspec allow-list. This test reads that allow-list from the
//! workflow itself and runs it through Git on a scratch repository, so widening it shows.
mod common;

use common::{git, repository};
use std::path::Path;

const WORKFLOW: &str = ".github/workflows/source-freshness.yml";
const COMMAND: &str = "unexpected=$(git diff --cached --name-only --no-renames -- . \\";

/// The quoted pathspecs that follow the allow-list command, up to its closing parenthesis.
fn allow_list(text: &str) -> Vec<String> {
    let mut lines = text.lines().skip_while(|line| line.trim() != COMMAND);
    assert!(
        lines.next().is_some(),
        "{WORKFLOW} lost the allow-list command"
    );
    let mut specs = Vec::new();
    for line in lines {
        specs.extend(line.split('\'').skip(1).step_by(2).map(str::to_owned));
        if line.trim_end().ends_with(')') {
            return specs;
        }
    }
    panic!("the allow-list command in {WORKFLOW} never closes");
}

/// The staged paths the workflow would report as outside its contract.
fn unexpected(specs: &[String], files: &[&str]) -> Vec<String> {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-q"]);
    for file in files {
        let path = root.join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "x\n").unwrap();
    }
    git(root, &["add", "-A"]);
    let mut args = vec!["diff", "--cached", "--name-only", "--no-renames", "--", "."];
    args.extend(specs.iter().map(String::as_str));
    let out = git(root, &args);
    out.lines().map(str::to_owned).collect()
}

#[test]
fn allow_list_admits_only_generated_release_files() {
    let text = std::fs::read_to_string(repository().join(Path::new(WORKFLOW))).unwrap();
    let specs = allow_list(&text);
    assert!(specs.len() >= 9, "{specs:?}");
    let generated = [
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
    assert_eq!(unexpected(&specs, &generated), Vec::<String>::new());
    for file in [
        "tools/example/extra.js",
        "tools/x/y/index.html",
        "tools/index.js",
        "_data/tools.json",
        "README.md",
        "changelog/index.html",
        ".github/workflows/source-freshness.yml",
        "scripts/src/main.rs",
        ".well-known/security.txt",
        "evidence/index.html",
        "llms-full.md",
    ] {
        let mut files = generated.to_vec();
        files.push(file);
        assert_eq!(unexpected(&specs, &files), vec![file.to_owned()], "{file}");
    }
}
