//! The checked tree the site's Python tests run in, and their mutation helpers.
#![allow(dead_code)]
pub mod http;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

/// The checked tree scripts/check_site.py runs these tests in: the Jekyll-rendered site
/// plus the tooling and fixtures it adds. SITE_CHECKED names a prepared one; otherwise
/// the site is rendered with `bundle exec jekyll build` when Bundler is installed.
pub static SITE: LazyLock<Option<tempfile::TempDir>> = LazyLock::new(|| {
    let checked = tempfile::tempdir().unwrap();
    if let Some(prepared) = std::env::var_os("SITE_CHECKED") {
        copy_tree(Path::new(&prepared), checked.path());
        return Some(checked);
    }
    let repository = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let source = tempfile::tempdir().unwrap();
    copy_tree(&repository, source.path());
    let rendered = source.path().join("_site");
    let built = std::process::Command::new(if cfg!(windows) {
        "bundle.bat"
    } else {
        "bundle"
    })
    .arg("exec")
    .arg(format!(
        "--gemfile={}",
        repository.join("Gemfile").display()
    ))
    .args(["jekyll", "build", "--source"])
    .arg(source.path())
    .arg("--destination")
    .arg(&rendered)
    .current_dir(source.path())
    .output()
    .is_ok_and(|o| o.status.success());
    if !built {
        return None;
    }
    copy_tree(&rendered, checked.path());
    for name in [
        "scripts",
        ".agents",
        "docs",
        "README.md",
        "_config.yml",
        "assets/social-card-template.svg",
        "assets/social-cards.json",
    ] {
        let from = source.path().join(name);
        let to = checked.path().join(name);
        if from.is_dir() {
            copy_tree(&from, &to);
        } else {
            std::fs::copy(&from, &to).unwrap();
        }
    }
    Some(checked)
});

/// Whether the rendered site is available; tests that need it report and return otherwise.
pub fn rendered() -> bool {
    if SITE.is_none() {
        eprintln!(
            "skipped: no rendered site (set SITE_CHECKED or install Bundler with the site's gems)"
        );
    }
    SITE.is_some()
}

pub fn copy_tree(source: &Path, destination: &Path) {
    std::fs::create_dir_all(destination).unwrap();
    for entry in std::fs::read_dir(source).unwrap().flatten() {
        let name = entry.file_name();
        if [".git", "node_modules", "work", "__pycache__", "target"]
            .contains(&name.to_string_lossy().as_ref())
        {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            copy_tree(&path, &destination.join(&name));
        } else {
            std::fs::copy(&path, destination.join(&name)).unwrap();
        }
    }
}

pub fn root() -> &'static Path {
    SITE.as_ref().expect("guarded by rendered()").path()
}

/// copied_site(): a private copy for one mutation.
pub fn copied_site() -> tempfile::TempDir {
    let copy = tempfile::tempdir().unwrap();
    copy_tree(root(), copy.path());
    copy
}

pub fn read_text(root: &Path, rel: &str) -> String {
    site_tools::read(&root.join(rel)).unwrap()
}

pub fn changed_text(source: &str, old: &str, new: &str) -> String {
    assert!(source.contains(old), "mutation source is stale: {old:?}");
    let changed = source.replacen(old, new, 1);
    assert_ne!(changed, source, "mutation made no change: {old:?}");
    changed
}

pub fn replace_file(root: &Path, rel: &str, old: &str, new: &str) {
    let path = root.join(rel);
    std::fs::write(&path, changed_text(&read_text(root, rel), old, new)).unwrap();
}

pub fn expect_failure(label: &str, failures: &[String], expected: &str) {
    assert!(
        failures.iter().any(|f| f.contains(expected)),
        "{label}: expected {expected:?}, found {failures:?}"
    );
}

pub fn assert_clean(label: &str, failures: &[String]) {
    assert!(
        failures.is_empty(),
        "{label}: unexpected failures: {failures:?}"
    );
}

pub fn append_file(root: &Path, rel: &str, addition: &str) {
    let path = root.join(rel);
    let text = read_text(root, rel) + addition;
    std::fs::write(path, text).unwrap();
}

pub const CONFIG: &str = "_config.yml";
// Jekyll always excludes its own destination, so `_config.yml` does not name it.
pub const DESTINATION: &str = "_site";

pub fn repository() -> PathBuf {
    site_tools::py::resolve(&Path::new(env!("CARGO_MANIFEST_DIR")).join(".."))
}

/// The include and exclude lists `_config.yml` hands Jekyll, read from the same file the
/// build uses. Anything but two flat `- value` blocks fails rather than selecting nothing.
pub fn site_selection(root: &Path) -> (HashSet<String>, HashSet<String>) {
    let mut include = HashSet::new();
    let mut exclude = HashSet::new();
    let mut current: Option<&mut HashSet<String>> = None;
    let text = std::fs::read_to_string(root.join(CONFIG)).unwrap();
    for line in text.lines() {
        if line.starts_with("include:") {
            current = Some(&mut include);
        } else if line.starts_with("exclude:") {
            current = Some(&mut exclude);
        } else if let Some(value) = line.strip_prefix("  - ")
            && let Some(set) = current.as_deref_mut()
        {
            set.insert(value.trim().trim_matches('/').to_owned());
        } else if !line.is_empty() && !line.starts_with([' ', '#']) {
            current = None;
        }
    }
    assert!(
        !include.is_empty() && !exclude.is_empty(),
        "{CONFIG} no longer lists include and exclude as flat blocks"
    );
    (include, exclude)
}

/// Whether Jekyll would read this source-relative path by its include and exclude rules.
pub fn is_site_source(
    relative: &str,
    include: &HashSet<String>,
    exclude: &HashSet<String>,
) -> bool {
    if relative == DESTINATION || relative.starts_with(&format!("{DESTINATION}/")) {
        return false;
    }
    if exclude
        .iter()
        .any(|name| relative == name || relative.starts_with(&format!("{name}/")))
    {
        return false;
    }
    let parts: Vec<&str> = relative.split('/').collect();
    for depth in 1..=parts.len() {
        if parts[depth - 1].starts_with('.') && !include.contains(&parts[..depth].join("/")) {
            return false;
        }
    }
    true
}

/// `Path.write_text(text, encoding="utf-8")`: newlines become the platform's.
pub fn write_text(path: &Path, text: &str) {
    let text = if cfg!(windows) {
        text.replace('\n', "\r\n")
    } else {
        text.to_owned()
    };
    std::fs::write(path, text).unwrap();
}

/// Run Git in a fixture repository with a fixed identity and no hooks; its trimmed output.
pub fn git(root: &Path, args: &[&str]) -> String {
    let hooks = format!("core.hooksPath={}", root.join("unused-hooks").display());
    let output = std::process::Command::new("git")
        .args([
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "-c",
            "commit.gpgSign=false",
            "-c",
            "core.autocrlf=false",
            "-c",
            &hooks,
        ])
        .args(args)
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap().trim().to_owned()
}

/// A Git stand-in serving scripted results in order; it fails the test when called
/// beyond them.
pub struct ScriptedGit {
    pub results: std::collections::VecDeque<Result<String, site_tools::check_site::GitError>>,
    pub calls: usize,
}

impl ScriptedGit {
    pub fn new(results: Vec<Result<String, site_tools::check_site::GitError>>) -> Self {
        ScriptedGit {
            results: results.into(),
            calls: 0,
        }
    }
}

impl site_tools::check_site::Git for ScriptedGit {
    fn run(&mut self, args: &[&str], _: bool) -> Result<String, site_tools::check_site::GitError> {
        self.calls += 1;
        self.results
            .pop_front()
            .unwrap_or_else(|| panic!("unexpected git {args:?}"))
    }
}
