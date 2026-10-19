//! scripts/test_ci_metadata_selection.py: metadata CI selection with real Git merge comparisons.
mod common;

use common::{ScriptedGit, git, is_site_source, repository, site_selection};
use site_tools::check_site::{
    GitError, Host, METADATA_ROOT_PATHS, SystemGit, check_metadata_excluded, ci_metadata_only,
    is_metadata_only, main_with,
};
use std::path::{Path, PathBuf};

fn paths(items: &[&str]) -> Vec<String> {
    items.iter().map(|p| (*p).to_owned()).collect()
}

#[test]
fn only_exact_unpublished_paths_qualify() {
    let mut allowed = paths(&METADATA_ROOT_PATHS);
    allowed.extend(paths(&["docs/guide.md", "docs/nested/new.anything"]));
    for path in &allowed {
        assert!(
            is_metadata_only("pull_request", std::slice::from_ref(path)),
            "{path}"
        );
    }
    assert!(is_metadata_only("pull_request", &allowed));
    for path in [
        "README.MD",
        "readme.md",
        "foo/README.md",
        "docs",
        "Docs/a.md",
        "docs-old/a.md",
        "docs/../index.html",
        "docs//a.md",
        "docs/./a.md",
        "docs/",
        "docs/a\\b.md",
        "docs/a\n.md",
        "/docs/a.md",
        "",
        "_config.yml",
        "scripts/check_site.py",
        ".github/workflows/checks.yml",
        "_includes/a.html",
        "_layouts/a.html",
        "assets/a.png",
        "package-lock.json",
        ".github/PULL_REQUEST_TEMPLATE.md",
    ] {
        assert!(
            !is_metadata_only("pull_request", &paths(&["README.md", path])),
            "{path:?}"
        );
    }
    assert!(!is_metadata_only("pull_request", &[]));
}

#[test]
fn other_events_do_not_read_git() {
    for event in [
        Some("push"),
        Some("schedule"),
        Some("workflow_dispatch"),
        Some(""),
        None,
    ] {
        let mut git = ScriptedGit::new(Vec::new());
        assert!(!ci_metadata_only(event, &mut git));
        assert_eq!(git.calls, 0);
    }
}

#[test]
fn bad_comparison_data_keeps_full_checks() {
    let merge = "tree abc\nparent first\nparent second\n\nmessage\n";
    for output in ["", "README.md", "README.md\0\0", "docs/a.md\0index.html\0"] {
        let mut git = ScriptedGit::new(vec![Ok(merge.into()), Ok(output.into())]);
        assert!(
            !ci_metadata_only(Some("pull_request"), &mut git),
            "{output:?}"
        );
    }
    for error in [
        GitError::Called,
        GitError::Os,
        GitError::Timeout,
        GitError::Unicode,
    ] {
        let mut git = ScriptedGit::new(vec![Err(error)]);
        assert!(!ci_metadata_only(Some("pull_request"), &mut git));
    }
    for parents in [0, 1, 3] {
        let commit = format!("tree abc\n{}\nmessage", "parent sha\n".repeat(parents));
        let mut git = ScriptedGit::new(vec![Ok(commit)]);
        assert!(!ci_metadata_only(Some("pull_request"), &mut git));
        assert_eq!(git.calls, 1);
    }
}

#[test]
fn actual_merges_deletions_and_renames() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let run = |args: &[&str]| git(root, args);
    run(&["init", "-b", "main"]);
    std::fs::write(root.join("README.md"), "before\n").unwrap();
    std::fs::create_dir(root.join("docs")).unwrap();
    std::fs::write(root.join("docs/old.md"), "before\n").unwrap();
    run(&["add", "."]);
    run(&["commit", "-m", "base"]);
    let base = run(&["rev-parse", "HEAD"]);
    for (mode, expected) in [
        ("root", true),
        ("nested", true),
        ("delete", true),
        ("rename", true),
        ("mixed", false),
        ("move_to_source", false),
    ] {
        run(&["checkout", "-B", "change", &base]);
        match mode {
            "delete" => {
                run(&["rm", "README.md"]);
            }
            "rename" | "move_to_source" => {
                let destination = if mode == "rename" {
                    "docs/new.md"
                } else {
                    "scripts/new.py"
                };
                std::fs::create_dir_all(root.join(destination).parent().unwrap()).unwrap();
                run(&["mv", "docs/old.md", destination]);
            }
            _ => {
                let target = if mode == "nested" {
                    "docs/new.md"
                } else {
                    "README.md"
                };
                std::fs::write(root.join(target), "after\n").unwrap();
                if mode == "mixed" {
                    std::fs::write(root.join("_config.yml"), "changed\n").unwrap();
                }
            }
        }
        run(&["add", "."]);
        run(&["commit", "-m", mode]);
        assert!(!ci_metadata_only(
            Some("pull_request"),
            &mut SystemGit { root }
        ));
        run(&["checkout", "-B", "main", &base]);
        run(&["merge", "--no-ff", "--no-edit", "change"]);
        assert_eq!(
            ci_metadata_only(Some("pull_request"), &mut SystemGit { root }),
            expected,
            "{mode}"
        );
    }
}

/// A host that selects through scripted Git and must not build or run anything.
struct SelectOnly {
    event: Option<String>,
    git: ScriptedGit,
    said: String,
}

impl Host for SelectOnly {
    fn event(&self) -> Option<String> {
        self.event.clone()
    }
    fn git(&mut self) -> &mut dyn site_tools::check_site::Git {
        &mut self.git
    }
    fn exe(&self) -> String {
        "site-tools".into()
    }
    fn build(&mut self) -> Result<PathBuf, String> {
        panic!("built")
    }
    fn checked(&mut self, _: &Path) -> Result<PathBuf, String> {
        panic!("copied")
    }
    fn run(&mut self, argv: &[String], _: &Path, _: Option<&Path>) -> Result<i32, String> {
        panic!("ran {argv:?}")
    }
    fn say(&mut self, text: &str) {
        self.said.push_str(text);
    }
}

#[test]
fn cli_emits_one_value_without_building() {
    for selected in [false, true] {
        let merge = "tree abc\nparent first\nparent second\n\nmessage\n";
        let mut host = SelectOnly {
            event: selected.then(|| "pull_request".into()),
            git: ScriptedGit::new(vec![Ok(merge.into()), Ok("README.md\0".into())]),
            said: String::new(),
        };
        let code = main_with(Path::new("."), &["--ci-metadata-only".into()], &mut host).unwrap();
        assert_eq!(code, 0);
        assert_eq!(host.said, format!("{selected}\n"));
    }
}

#[test]
fn metadata_paths_remain_excluded_and_build_drift_fails() {
    let (include, exclude) = site_selection(&repository());
    for name in METADATA_ROOT_PATHS.iter().chain(&["docs/guide.md"]) {
        assert!(!is_site_source(name, &include, &exclude), "{name}");
    }
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    check_metadata_excluded(root).unwrap();
    for name in METADATA_ROOT_PATHS.iter().chain(&["docs"]) {
        let path = root.join(name);
        std::fs::write(&path, "").unwrap();
        let error = check_metadata_excluded(root).unwrap_err();
        assert!(error.contains("CI metadata path"), "{error}");
        std::fs::remove_file(path).unwrap();
    }
}
