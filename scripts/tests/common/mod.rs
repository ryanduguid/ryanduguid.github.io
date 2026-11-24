// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The checked tree the site's Python tests run in, and their mutation helpers.
#![allow(dead_code)]
pub mod http;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

/// The checked tree `site-tools check_site` runs these tests in: the Jekyll-rendered site
/// plus the tooling and fixtures it adds. `SITE_CHECKED` names a prepared tree used
/// read-only; otherwise the site is rendered once with `bundle exec jekyll build` into
/// Cargo's test scratch directory, keyed by the source it rendered, and later suites
/// read that tree directly. Tests that mutate files must use `copied_site()`.
pub static SITE: LazyLock<Option<PathBuf>> = LazyLock::new(|| {
    if let Some(prepared) = std::env::var_os("SITE_CHECKED") {
        let path = PathBuf::from(prepared);
        assert!(
            path.is_dir(),
            "SITE_CHECKED does not name an existing directory: {}",
            path.display()
        );
        return Some(path);
    }
    let repository = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let renders = Path::new(env!("CARGO_TARGET_TMPDIR")).join("site-checked");
    let kept = renders.join(fingerprint(&repository));
    // A CI cache can restore the kept directory with its files deleted, so a render counts
    // only with the mark written after it took its final name.
    let complete = kept.with_extension("complete");
    if kept.is_dir() && complete.is_file() {
        return Some(kept);
    }
    render(&repository, &renders, &kept, &complete)
});

/// A digest of every file the render reads from the repository.
fn fingerprint(repository: &Path) -> String {
    use sha2::{Digest, Sha256};
    fn walk(root: &Path, directory: &Path, hasher: &mut Sha256) {
        let mut entries: Vec<_> = std::fs::read_dir(directory).unwrap().flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name();
            if SKIPPED.contains(&name.to_string_lossy().as_ref()) {
                continue;
            }
            let path = entry.path();
            if path.is_dir() {
                walk(root, &path, hasher);
            } else {
                let relative = path.strip_prefix(root).unwrap().to_string_lossy();
                let bytes = std::fs::read(&path).unwrap();
                hasher.update((relative.len() as u64).to_le_bytes());
                hasher.update(relative.as_bytes());
                hasher.update((bytes.len() as u64).to_le_bytes());
                hasher.update(&bytes);
            }
        }
    }
    let mut hasher = Sha256::new();
    walk(repository, repository, &mut hasher);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn render(repository: &Path, renders: &Path, kept: &Path, complete: &Path) -> Option<PathBuf> {
    std::fs::create_dir_all(renders).unwrap();
    let partial = renders.join(format!("partial-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&partial);
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
    .arg(repository)
    .arg("--destination")
    .arg(&partial)
    .current_dir(repository)
    .output()
    .is_ok_and(|o| o.status.success());
    if !built {
        let _ = std::fs::remove_dir_all(&partial);
        return None;
    }
    for name in [
        "scripts",
        ".agents",
        "docs",
        "README.md",
        "_config.yml",
        "assets/social-card-template.svg",
        "assets/social-cards.json",
    ] {
        let from = repository.join(name);
        let to = partial.join(name);
        if from.is_dir() {
            copy_tree(&from, &to);
        } else {
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::copy(&from, &to).unwrap();
        }
    }
    // Serialise cleanup and publication per fingerprint so two competing processes
    // cannot interleave rename, completion-marker write and incomplete-target removal.
    Some(publish_directory(&partial, kept, complete))
}

/// Publish `partial` to `kept` and mark `complete` under a per-fingerprint lock file.
/// If another process already published `kept` before this caller acquired the lock,
/// `partial` is discarded and `kept` is returned untouched.
pub fn publish_directory(partial: &Path, kept: &Path, complete: &Path) -> PathBuf {
    let lock_path = kept.with_extension("lock");
    if let Some(parent) = lock_path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    let lock_file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(&lock_path)
        .unwrap();
    lock_file.lock().unwrap();
    if kept.is_dir() && complete.is_file() {
        let _ = std::fs::remove_dir_all(partial);
        return kept.to_path_buf();
    }
    if kept.exists() {
        let remove = if kept.is_dir() {
            std::fs::remove_dir_all(kept)
        } else {
            std::fs::remove_file(kept)
        };
        if let Err(err) = remove {
            let _ = std::fs::remove_dir_all(partial);
            panic!(
                "failed to remove incomplete render at {}: {err}",
                kept.display()
            );
        }
    }
    if let Err(err) = std::fs::rename(partial, kept) {
        let _ = std::fs::remove_dir_all(partial);
        panic!(
            "failed to publish rendered site at {}: {err}",
            kept.display()
        );
    }
    std::fs::write(complete, "").unwrap();
    kept.to_path_buf()
}

/// Directories no check reads: version control, dependencies, build output and caches.
const SKIPPED: [&str; 8] = [
    ".git",
    "node_modules",
    "work",
    "__pycache__",
    "target",
    "vendor",
    "_site",
    ".jekyll-cache",
];

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
    copy_tree_skipping(source, destination, &|_| false);
}

/// `copy_tree`, leaving out the files and folders `skip` selects.
fn copy_tree_skipping(source: &Path, destination: &Path, skip: &dyn Fn(&Path) -> bool) {
    std::fs::create_dir_all(destination).unwrap();
    for entry in std::fs::read_dir(source).unwrap().flatten() {
        let name = entry.file_name();
        let path = entry.path();
        if SKIPPED.contains(&name.to_string_lossy().as_ref()) || skip(&path) {
            continue;
        }
        let target = destination.join(&name);
        if path.is_dir() {
            copy_tree_skipping(&path, &target, skip);
        } else {
            std::fs::copy(&path, target).unwrap();
        }
    }
}

pub fn root() -> &'static Path {
    SITE.as_ref().expect("guarded by rendered()").as_path()
}

const DESIGN_BASELINE: &str = "scripts/design_baseline.json";

/// How often each protected text of the design baseline occurs in the pages other than
/// the effective life pages, counted as `check_design::check_repository` counts the whole
/// site. `design_contracts_current_site` holds the whole site to the committed counts.
static OTHER_TEXT_COUNTS: LazyLock<Vec<(String, usize)>> = LazyLock::new(|| {
    use site_tools::{effective_life_pages::is_page, pyjson, seo_core as core};
    let baseline = pyjson::loads(&read_text(root(), DESIGN_BASELINE)).unwrap();
    let Some(pyjson::Json::Object(texts)) = baseline.get("protected_text") else {
        panic!("{DESIGN_BASELINE} has no protected_text object");
    };
    let pages: Vec<String> = core::html_files(root())
        .into_iter()
        .filter(|path| !is_page(&core::rel(path, root())))
        .map(|path| core::raw_text(&site_tools::read(&path).unwrap()))
        .collect();
    texts
        .iter()
        .map(|(text, _)| {
            let count = pages.iter().map(|page| page.matches(text.as_str()).count());
            (text.clone(), count.sum())
        })
        .collect()
});

/// copied_site(): a private copy for one mutation, without the effective life pages.
/// They are most of the tree's files, so every whole-site check of a copy would spend
/// most of its time on them; no test changes them, the suites check them in full in
/// `root()`, and `build_effective_life_pages --check` pins every byte. The copy's design
/// baseline pins its protected texts' counts without the pages, so a check of the copy
/// still sees a changed count.
pub fn copied_site() -> tempfile::TempDir {
    use site_tools::pyjson::{self, Dump, Json};
    let copy = tempfile::tempdir().unwrap();
    copy_tree_skipping(root(), copy.path(), &|path| {
        let rel = site_tools::seo_core::rel(path, root());
        site_tools::effective_life_pages::is_page(&format!("{rel}/"))
    });
    let mut baseline = read_text(copy.path(), DESIGN_BASELINE);
    for (text, count) in OTHER_TEXT_COUNTS.iter() {
        let dump = Dump {
            ensure_ascii: false,
            ..Default::default()
        };
        let key = format!("{}: ", pyjson::dumps(&Json::Str(text.clone()), dump));
        let start = baseline.find(&key).expect("protected text pinned once") + key.len();
        let digits = baseline[start..]
            .find(|c: char| !c.is_ascii_digit())
            .unwrap();
        baseline.replace_range(start..start + digits, &count.to_string());
    }
    std::fs::write(copy.path().join(DESIGN_BASELINE), baseline).unwrap();
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

/// Captures a file's bytes (or absence) and restores them on drop so sequential
/// mutation checks can share one `copied_site()` without copying the tree per case.
pub struct SavedFile {
    path: PathBuf,
    original: Option<Vec<u8>>,
}

impl SavedFile {
    pub fn capture(root: &Path, rel: &str) -> Self {
        let path = root.join(rel);
        let original = std::fs::read(&path).ok();
        Self { path, original }
    }
}

impl Drop for SavedFile {
    fn drop(&mut self) {
        let result = match &self.original {
            Some(bytes) => self
                .path
                .parent()
                .map_or(Ok(()), std::fs::create_dir_all)
                .and_then(|()| std::fs::write(&self.path, bytes)),
            None => match std::fs::remove_file(&self.path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(e),
            },
        };
        if let Err(err) = result
            && !std::thread::panicking()
        {
            panic!("failed to restore {}: {err}", self.path.display());
        }
    }
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
