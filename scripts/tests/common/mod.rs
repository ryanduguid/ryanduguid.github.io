//! The checked tree the site's Python tests run in, and their mutation helpers.
#![allow(dead_code)]
pub mod http;
use std::path::Path;
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
