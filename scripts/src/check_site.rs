//! scripts/check_site.py: run every repository-defined site check through one command.
//!
//! The Python checks it ran are now `site-tools` commands and the Rust suites in
//! `scripts/tests`, run with `cargo test`; the search-console tool and the Node tests
//! keep their own runtimes. Suites that read the rendered site get the checked tree
//! through `SITE_CHECKED`.
use crate::htmlparser::{self, Event};
use crate::pyre::{I, M, re};
use crate::seo_core::VOID_ELEMENTS;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub const METADATA_ROOT_PATHS: [&str; 6] = [
    "AGENTS.md",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "DESIGN.md",
    "README.md",
    "SECURITY.md",
];
const LINK_MARKERS: &str = r"https?://|//|href|src|url\s*\(|@import|\\|\]\(|\{[{%]|^[ +\-]---\s*$";

/// One step of the site checks.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Check {
    /// A `site-tools` command.
    Tool(&'static [&'static str]),
    /// `cargo test` for these suites in `scripts/tests`.
    Tests(&'static [&'static str]),
    /// A command with its own runtime; `python` is the platform's interpreter.
    External(&'static [&'static str]),
}

pub const CHECKS: &[Check] = &[
    Check::Tests(&["ozzit"]),
    Check::Tests(&["fact_check"]),
    Check::Tests(&["contracts", "design", "llms", "manifest", "release"]),
    Check::Tests(&["server"]),
    Check::Tool(&["check_design"]),
    Check::Tests(&["links"]),
    Check::Tests(&["ci_metadata_selection"]),
    Check::External(&["python", "scripts/test_search_console.py"]),
    Check::External(&[
        "uv",
        "run",
        "--locked",
        "--script",
        ".agents/tools/search-console/server.py",
        "self-test",
    ]),
    Check::Tool(&["check_rates_register"]),
    Check::Tests(&["rates"]),
    Check::Tool(&["check_seo"]),
    Check::Tool(&["check_agent_files"]),
    Check::Tests(&["agent_files"]),
    Check::Tool(&["release_record"]),
    Check::Tests(&["visibility"]),
    Check::Tool(&["visibility_benchmark", "--check"]),
    Check::Tool(&["build_llms_full", "--check"]),
    Check::Tool(&["build_feed", "--check"]),
    Check::Tests(&["feed"]),
    Check::Tool(&["build_agent_skills_manifest", "--check"]),
    Check::Tool(&["check_links"]),
    Check::External(&["node", "--test", "scripts/levy.test.mjs"]),
    Check::External(&["node", "--test", "scripts/business-calculators.test.mjs"]),
    Check::External(&["node", "--test", "scripts/field-errors.test.mjs"]),
    Check::External(&["node", "--test", "scripts/webmcp-tools.test.mjs"]),
    Check::External(&["node", "--test", "scripts/home-levy.test.mjs"]),
    Check::External(&["node", "--test", "scripts/stamp-source-freshness.test.mjs"]),
    Check::External(&["node", "--test", "scripts/check_production.test.mjs"]),
    Check::External(&["node", "--test", "scripts/check_ato_sources.test.mjs"]),
];

/// The steps before the checked tree exists, in order, around the Jekyll build.
pub const BEFORE_BUILD: Check = Check::Tool(&["build_ozzit_reference", "--check"]);
pub const AFTER_BUILD: [Check; 3] = [
    Check::Tests(&["build_site"]),
    // CI selects link checks from source pages, so this suite reads source, not rendered, files.
    Check::Tests(&["ci_link_selection"]),
    // Publication tests inspect the workflow and aggregate in the unpublished source tree.
    Check::Tests(&["publication"]),
];

impl Check {
    /// The command line, given the `site-tools` executable.
    pub fn argv(&self, exe: &str) -> Vec<String> {
        match self {
            Check::Tool(args) => std::iter::once(exe)
                .chain(args.iter().copied())
                .map(str::to_owned)
                .collect(),
            Check::Tests(suites) => ["cargo", "test", "--locked"]
                .into_iter()
                .map(str::to_owned)
                .chain(
                    suites
                        .iter()
                        .flat_map(|s| ["--test".to_owned(), (*s).to_owned()]),
                )
                .collect(),
            Check::External(args) => args
                .iter()
                .map(|a| match *a {
                    "python" if !cfg!(windows) => "python3".to_owned(),
                    other => other.to_owned(),
                })
                .collect(),
        }
    }
}

pub fn can_skip_live_links(event: &str, paths: &[String], diff: &str) -> bool {
    if event != "pull_request" {
        return false;
    }
    for path in paths {
        if ["scripts/", "_includes/", "_layouts/"]
            .iter()
            .any(|p| path.starts_with(p))
        {
            return false;
        }
        let suffix = crate::suffix(Path::new(path));
        if ![
            ".html", ".md", ".txt", ".css", ".svg", ".png", ".webp", ".jpg",
        ]
        .contains(&suffix.as_str())
        {
            return false;
        }
    }
    // Inspect context too: a changed value can sit below an unchanged href or url().
    re(LINK_MARKERS, I | M).search(diff).is_none()
}

const CONTAINERS: [&str; 10] = [
    "html", "body", "main", "section", "article", "div", "aside", "header", "footer", "nav",
];

/// ParagraphParser: spans, in code points, of literal text directly inside paragraphs
/// within plain containers, or None where the Python parser raised ValueError or left
/// an element open.
fn paragraph_spans(source: &[char], text: &str) -> Option<Vec<(usize, usize)>> {
    let mut offsets = vec![0];
    offsets.extend(
        source
            .iter()
            .enumerate()
            .filter(|(_, c)| **c == '\n')
            .map(|(i, _)| i + 1),
    );
    let mut stack: Vec<String> = Vec::new();
    let mut spans = Vec::new();
    for positioned in htmlparser::parse(text, false) {
        match positioned.event {
            Event::StartTag(tag, _) => {
                if tag == "p" && stack.iter().any(|t| t == "p") {
                    return None;
                }
                if !VOID_ELEMENTS.contains(&tag.as_str()) {
                    stack.push(tag);
                }
            }
            Event::EndTag(tag) => {
                if stack.pop().is_none_or(|top| top != tag) {
                    return None;
                }
            }
            Event::StartEndTag(tag, _) => {
                if !VOID_ELEMENTS.contains(&tag.as_str()) {
                    return None;
                }
            }
            Event::Data(data) => {
                let Some((top, outer)) = stack.split_last() else {
                    continue;
                };
                if top != "p"
                    || !outer.iter().all(|t| CONTAINERS.contains(&t.as_str()))
                    || re(LINK_MARKERS, I | M).search(&data).is_some()
                    || re(r"[<>{}\[\]=]", 0).search(&data).is_some()
                {
                    continue;
                }
                let start = offsets[positioned.line - 1] + positioned.offset;
                let length = data.chars().count();
                let found = source.get(start..start + length);
                if !found.is_some_and(|f| f.iter().copied().eq(data.chars())) {
                    return None;
                }
                spans.push((start, start + length));
            }
            _ => {}
        }
    }
    stack.is_empty().then_some(spans)
}

/// Mask only literal paragraph data, retaining every other source character.
pub fn paragraph_structure(source: &str) -> Option<String> {
    let mut prefix = "";
    let mut source = source;
    if source
        .trim_start_matches(['\u{feff}', ' ', '\t', '\r', '\n'])
        .starts_with("---")
        && !source.starts_with("---\n")
    {
        return None;
    }
    if source.starts_with("---\n") {
        let end = source[3..].find("\n---\n")? + 3;
        (prefix, source) = source.split_at(end + 5);
    }
    // The site's header/footer are balanced includes. The exact stylesheet version expression
    // reads only _config.yml, whose changes keep live checks, and stays in the compared
    // structure, so base and candidate must match. Other Liquid stays conservative.
    let templates = re(
        concat!(
            r"\{%\s*include\s+site-(?:header|footer)\.html\s*%\}",
            r"|(?<!\{)\{\{ site\.asset_version \}\}(?!\})"
        ),
        0,
    )
    .sub("", source);
    if re(r"\{[{%]|\x00", 0).search(&templates).is_some() {
        return None;
    }
    // ponytail: recognise direct paragraph text only; widen for an evidenced prose case.
    let chars: Vec<char> = source.chars().collect();
    let spans = paragraph_spans(&chars, source)?;
    if spans.is_empty() {
        return None;
    }
    let mut masked = String::from(prefix);
    let mut at = 0;
    for (start, end) in spans {
        masked.extend(&chars[at..start]);
        masked.push('\0');
        at = end;
    }
    masked.extend(&chars[at..]);
    Some(masked)
}

/// Why a Git read failed; every failure keeps the full checks.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GitError {
    /// CalledProcessError: Git exited non-zero.
    Called,
    /// OSError: Git could not start.
    Os,
    /// UnicodeError: the output was not UTF-8.
    Unicode,
    /// TimeoutExpired.
    Timeout,
}

/// `subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True)`.
pub trait Git {
    /// Git's standard output, decoded as UTF-8 with universal newlines. With `timeout`,
    /// Git is killed after 30 seconds.
    fn run(&mut self, args: &[&str], timeout: bool) -> Result<String, GitError>;
}

pub struct SystemGit<'a> {
    pub root: &'a Path,
}

impl Git for SystemGit<'_> {
    fn run(&mut self, args: &[&str], timeout: bool) -> Result<String, GitError> {
        let mut child = Command::new("git")
            .args(args)
            .current_dir(self.root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| GitError::Os)?;
        let read = |mut pipe: Box<dyn std::io::Read + Send>| {
            std::thread::spawn(move || {
                let mut bytes = Vec::new();
                let _ = pipe.read_to_end(&mut bytes);
                bytes
            })
        };
        let stdout = read(Box::new(child.stdout.take().expect("piped")));
        let stderr = read(Box::new(child.stderr.take().expect("piped")));
        let started = Instant::now();
        let status = loop {
            match child.try_wait().map_err(|_| GitError::Os)? {
                Some(status) => break status,
                None if timeout && started.elapsed() >= Duration::from_secs(30) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(GitError::Timeout);
                }
                None => std::thread::sleep(Duration::from_millis(5)),
            }
        };
        let bytes = stdout.join().unwrap_or_default();
        let _ = stderr.join();
        let text = String::from_utf8(bytes).map_err(|_| GitError::Unicode)?;
        if !status.success() {
            return Err(GitError::Called);
        }
        Ok(text.replace("\r\n", "\n").replace('\r', "\n"))
    }
}

/// `ci_offline()` for the CI_EVENT value `event`.
pub fn ci_offline(event: Option<&str>, git: &mut dyn Git) -> bool {
    // Branch protection admits a push to main only after its pull request's checks, which
    // keep live checks for any link change. The weekly schedule keeps the full live sweep.
    match event {
        Some("push") => true,
        Some("pull_request") => pull_request_offline(git).unwrap_or(false),
        _ => false,
    }
}

fn pull_request_offline(git: &mut dyn Git) -> Result<bool, GitError> {
    // The first parent of GitHub's pull-request merge commit is its base tip.
    let names = git.run(
        &[
            "diff",
            "--name-only",
            "--no-renames",
            "-z",
            "HEAD^1",
            "HEAD",
        ],
        false,
    )?;
    let paths: Vec<String> = names
        .split('\0')
        .filter(|p| !p.is_empty())
        .map(str::to_owned)
        .collect();
    // Decide conservatively before reading a diff for an unknown file type.
    if !can_skip_live_links("pull_request", &paths, "") {
        return Ok(false);
    }
    let mut args = vec![
        "diff",
        "--no-ext-diff",
        "--unified=1000000",
        "HEAD^1",
        "HEAD",
        "--",
    ];
    args.extend(paths.iter().map(String::as_str));
    let diff = git.run(&args, false)?;
    if can_skip_live_links("pull_request", &paths, &diff) {
        return Ok(true);
    }
    if paths.is_empty() || paths.iter().any(|p| crate::suffix(Path::new(p)) != ".html") {
        return Ok(false);
    }
    if re(
        r"^(?:old mode|new mode|new file mode|deleted file mode|Binary files|GIT binary patch)",
        M,
    )
    .search(&diff)
    .is_some()
    {
        return Ok(false);
    }
    for path in &paths {
        let mut versions = Vec::new();
        for revision in ["HEAD^1", "HEAD"] {
            versions.push(git.run(
                &["show", "--no-textconv", &format!("{revision}:{path}")],
                false,
            )?);
        }
        let before = paragraph_structure(&versions[0]);
        let after = paragraph_structure(&versions[1]);
        if versions[0] == versions[1] || before.is_none() || before != after {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Only unpublished documents may omit browser execution.
pub fn is_metadata_only(event: &str, paths: &[String]) -> bool {
    if event != "pull_request" || paths.is_empty() {
        return false;
    }
    paths.iter().all(|path| {
        !path.chars().any(|c| (c as u32) < 32 || c == '\\')
            && !path.split('/').any(|part| ["", ".", ".."].contains(&part))
            && (METADATA_ROOT_PATHS.contains(&path.as_str()) || path.starts_with("docs/"))
    })
}

/// `ci_metadata_only()` for the CI_EVENT value `event`.
pub fn ci_metadata_only(event: Option<&str>, git: &mut dyn Git) -> bool {
    if event != Some("pull_request") {
        return false;
    }
    let Ok(commit) = git.run(&["cat-file", "-p", "HEAD"], true) else {
        return false;
    };
    let header = commit
        .split_once("\n\n")
        .map_or(commit.as_str(), |(h, _)| h);
    if crate::py::splitlines(header)
        .iter()
        .filter(|line| line.starts_with("parent "))
        .count()
        != 2
    {
        return false;
    }
    let Ok(output) = git.run(
        &[
            "diff",
            "--name-only",
            "--no-renames",
            "-z",
            "HEAD^1",
            "HEAD",
            "--",
        ],
        true,
    ) else {
        return false;
    };
    let Some(names) = output.strip_suffix('\0') else {
        return false;
    };
    let paths: Vec<String> = names.split('\0').map(str::to_owned).collect();
    is_metadata_only("pull_request", &paths)
}

/// Fail when a build change invalidates the metadata-only CI boundary.
pub fn check_metadata_excluded(rendered: &Path) -> Result<(), String> {
    for path in METADATA_ROOT_PATHS.iter().chain(&["docs"]) {
        if rendered.join(path).exists() {
            return Err(format!(
                "CI metadata path reached the rendered site: {path}"
            ));
        }
    }
    Ok(())
}

/// What check_site needs from its surroundings; tests substitute each part.
pub trait Host {
    /// The CI_EVENT environment variable.
    fn event(&self) -> Option<String>;
    fn git(&mut self) -> &mut dyn Git;
    /// The `site-tools` executable the checks run.
    fn exe(&self) -> String;
    /// Render the site; the rendered directory.
    fn build(&mut self) -> Result<PathBuf, String>;
    /// A temporary checked tree: the rendered site plus the tooling and fixtures beside it.
    fn checked(&mut self, rendered: &Path) -> Result<PathBuf, String>;
    /// Run a command to completion; its exit code. `checked` is the checked tree the
    /// Rust suites read.
    fn run(&mut self, argv: &[String], cwd: &Path, checked: Option<&Path>) -> Result<i32, String>;
    fn say(&mut self, text: &str) {
        let _ = crate::print_text(text, false);
    }
}

pub struct System<'a> {
    pub root: &'a Path,
    git: SystemGit<'a>,
    temporary: Option<tempfile::TempDir>,
}

impl<'a> System<'a> {
    pub fn new(root: &'a Path) -> Self {
        System {
            root,
            git: SystemGit { root },
            temporary: None,
        }
    }
}

/// `shutil.copytree(source, destination, ignore=...)`: the destination must not exist.
fn copy_tree(
    source: &Path,
    destination: &Path,
    skip: &dyn Fn(&Path) -> bool,
) -> Result<(), String> {
    let os = |e: std::io::Error, path: &Path| {
        crate::py::oserror_str(&e, &path.to_string_lossy(), crate::py::OsStyle::Native)
    };
    std::fs::create_dir(destination).map_err(|e| os(e, destination))?;
    let entries = std::fs::read_dir(source).map_err(|e| os(e, source))?;
    for entry in entries {
        let entry = entry.map_err(|e| os(e, source))?;
        let path = entry.path();
        if skip(&path) {
            continue;
        }
        let target = destination.join(entry.file_name());
        if path.is_dir() {
            copy_tree(&path, &target, skip)?;
        } else {
            std::fs::copy(&path, &target).map_err(|e| os(e, &path))?;
        }
    }
    Ok(())
}

impl Host for System<'_> {
    fn event(&self) -> Option<String> {
        std::env::var("CI_EVENT").ok()
    }

    fn git(&mut self) -> &mut dyn Git {
        &mut self.git
    }

    fn exe(&self) -> String {
        std::env::current_exe()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "site-tools".into())
    }

    fn build(&mut self) -> Result<PathBuf, String> {
        crate::build_site::build(self.root, self.root)
    }

    fn checked(&mut self, rendered: &Path) -> Result<PathBuf, String> {
        let temporary = tempfile::tempdir().map_err(|e| e.to_string())?;
        let checked = temporary.path().join("site");
        self.temporary = Some(temporary);
        // Add only the tooling and fixtures the checks need beside the built files.
        // Copying public source files here would hide omissions from Jekyll's output.
        copy_tree(rendered, &checked, &|_| false)?;
        let crate_target = self.root.join("scripts").join("target");
        let skip = |path: &Path| {
            path.file_name().is_some_and(|n| n == "__pycache__") || path == crate_target
        };
        for name in [
            "scripts",
            // The release-refresh tests compare committed pages with this data.
            "_data",
            ".agents",
            "docs",
            "README.md",
            "_config.yml",
            "assets/social-card-template.svg",
            "assets/social-cards.json",
        ] {
            let source = self.root.join(name);
            let target = checked.join(name);
            if source.is_dir() {
                copy_tree(&source, &target, &skip)?;
            } else {
                std::fs::copy(&source, &target).map_err(|e| {
                    crate::py::oserror_str(&e, &source.to_string_lossy(), crate::py::OsStyle::Errno)
                })?;
            }
        }
        Ok(checked)
    }

    fn run(&mut self, argv: &[String], cwd: &Path, checked: Option<&Path>) -> Result<i32, String> {
        let mut command = Command::new(&argv[0]);
        // Each site-tools command finds its site from its working directory.
        command
            .args(&argv[1..])
            .current_dir(cwd)
            .env_remove("SITE_ROOT");
        if let Some(checked) = checked {
            command.env("SITE_CHECKED", checked);
        }
        let status = command
            .status()
            .map_err(|e| crate::py::oserror_str(&e, &argv[0], crate::py::OsStyle::Native))?;
        #[cfg(unix)]
        if let Some(signal) = std::os::unix::process::ExitStatusExt::signal(&status) {
            return Ok(-signal);
        }
        Ok(status.code().unwrap_or(1))
    }
}

const USAGE: &str = include_str!("help/check_site.usage");
const PARSER: crate::pyargs::Parser = crate::pyargs::Parser {
    prog: "site-tools check_site",
    usage: USAGE,
    help: include_str!("help/check_site.txt"),
    flags: &["--offline", "--ci", "--ci-metadata-only"],
    exclusive: &[],
    required: false,
};

fn run_check(
    host: &mut dyn Host,
    step: &Check,
    root: &Path,
    checked: Option<&Path>,
    extra: &[&str],
) -> Result<i32, String> {
    let mut argv = step.argv(&host.exe());
    argv.extend(extra.iter().map(|a| (*a).to_owned()));
    let cwd = match (step, checked) {
        (Check::Tests(_), _) => root.join("scripts"),
        (_, Some(checked)) => checked.to_path_buf(),
        (_, None) => root.to_path_buf(),
    };
    let line = argv.join(" ");
    host.say(&format!("running {line}\n"));
    let started = Instant::now();
    let result = host.run(&argv, &cwd, checked);
    host.say(&format!(
        "elapsed {:.3}s: {line}\n",
        started.elapsed().as_secs_f64()
    ));
    result
}

/// `run_check(..., check=True)`: a failure ends the run as CalledProcessError did.
fn run_required(host: &mut dyn Host, step: &Check, root: &Path) -> Result<(), String> {
    let code = run_check(host, step, root, None, &[])?;
    if code != 0 {
        let argv = step.argv(&host.exe());
        let listed: Vec<String> = argv.iter().map(|a| crate::py::repr_str(a)).collect();
        return Err(format!(
            "Command '[{}]' returned non-zero exit status {code}.",
            listed.join(", ")
        ));
    }
    Ok(())
}

pub fn main_with(root: &Path, args: &[String], host: &mut dyn Host) -> Result<u8, String> {
    let flags = match PARSER.parse(args) {
        crate::pyargs::Parsed::Flags(flags) => flags,
        crate::pyargs::Parsed::Exit(code) => return Ok(code),
    };
    let mut offline = flags.contains(&"--offline");
    let ci = flags.contains(&"--ci");
    let event = host.event();
    if flags.contains(&"--ci-metadata-only") {
        if offline || ci {
            let crate::pyargs::Parsed::Exit(code) =
                PARSER.error("--ci-metadata-only cannot be combined with site-check modes")
            else {
                unreachable!()
            };
            return Ok(code);
        }
        let selected = ci_metadata_only(event.as_deref(), host.git());
        host.say(if selected { "true\n" } else { "false\n" });
        return Ok(0);
    }
    offline = offline
        || (ci
            && (ci_metadata_only(event.as_deref(), host.git())
                || ci_offline(event.as_deref(), host.git())));
    run_required(host, &BEFORE_BUILD, root)?;
    let started = Instant::now();
    let rendered = host.build();
    host.say(&format!(
        "elapsed {:.3}s: Jekyll build\n",
        started.elapsed().as_secs_f64()
    ));
    let rendered = rendered?;
    check_metadata_excluded(&rendered)?;
    for step in &AFTER_BUILD {
        run_required(host, step, root)?;
    }
    let checked = host.checked(&rendered)?;
    for step in CHECKS {
        let extra: &[&str] = if offline && *step == Check::Tool(&["check_links"]) {
            &["--offline"]
        } else {
            &[]
        };
        let code = run_check(host, step, root, Some(&checked), extra)?;
        if code != 0 {
            // sys.exit(code): the platform keeps the low byte.
            return Ok(code as u8);
        }
    }
    host.say(if offline {
        "site checks passed (external links skipped)\n"
    } else {
        "site checks passed\n"
    });
    Ok(0)
}

pub fn run(root: &Path, args: &[String]) -> Result<u8, String> {
    main_with(root, args, &mut System::new(root))
}
