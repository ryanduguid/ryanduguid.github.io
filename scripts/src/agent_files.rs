//! scripts/check_agent_files.py: check what an agent can be made to run from this site's
//! machine-readable files.
//!
//! An install command in llms.txt executes on whoever's machine reads it, so a package
//! name must be in the reviewed record (`scripts/agent_file_policy.json`), and anything
//! not published by ryanduguid must name an exact version. Invisible and
//! direction-control characters are refused in the same pass. `--verify-live` reports
//! drift between the record and the public registries; the default run is offline.
use crate::py;
use crate::pyargs::{Parsed, Parser};
use crate::pyjson::{self, Json};
use crate::pyobj::type_name;
use crate::pyre::{fullmatch, re};
use std::path::{Path, PathBuf};
use std::time::Duration;

const OWNER: &str = "ryanduguid";
const SCANNED: [&str; 4] = [
    "llms.txt",
    "llms-full.txt",
    ".well-known/llms.txt",
    "README.md",
];
const UNPUBLISHED: [&str; 7] = [
    "_site",
    "work",
    "node_modules",
    ".git",
    ".venv",
    "vendor",
    ".jekyll-cache",
];
const INSTALLERS: [(&str, &str); 3] = [
    (
        "pypi",
        r"\b(?:python\d?\s+-m\s+)?(?:uv\s+)?pip3?\s+install\b",
    ),
    ("npm", r"\bnpm\s+(?:i|install|add)\b"),
    ("npm", r"\b(?:pnpm|yarn|bun)\s+(?:add|install)\b"),
];
/// Runners fetch one package and run it; the flag marks those read only on command lines.
const RUNNERS: [(&str, &str, bool); 5] = [
    ("pypi", r"\buvx\b", true),
    ("pypi", r"\bpipx\s+(?:run|install)\b", false),
    ("pypi", r"\buv\s+tool\s+(?:run|install)\b", false),
    ("npm", r"\bnpx\b", true),
    ("npm", r"\b(?:pnpm|yarn|bun)\s+dlx\b", false),
];
const COMMAND_LINE: &str = concat!(
    r"^\s*(?:[$>#]\s*)?(?:python\d?|py|pip3?|uv|uvx|pipx|npm|npx|pnpm|yarn|bun|node",
    r"|claude|codex|cd|git|just|make)\b"
);
const VALUE_FLAGS: [&str; 25] = [
    "-r",
    "--requirement",
    "-c",
    "--constraint",
    "-e",
    "--editable",
    "-t",
    "--target",
    "-f",
    "--find-links",
    "--index-url",
    "--extra-index-url",
    "--prefix",
    "--python",
    "-p",
    "--registry",
    "--with",
    "--agent",
    "-a",
    "--skill",
    "-s",
    "--metadata",
    "--subagent",
    "--from",
    "--package",
];
const SOURCE_FLAGS: [&str; 3] = ["--from", "-p", "--package"];
const EXTRA_FLAGS: [&str; 1] = ["--with"];
const REQUIREMENT_FLAGS: [&str; 2] = ["-r", "--requirement"];
const HASH_PIN: &str = "--require-hashes";
const SHELL_BOUNDARY: &str = r#""(?:\\.|[^"\\])*"|'[^']*'|\\.|[;&|]+|(?<!\S)\#.*"#;
const EXACT_NPM_VERSION: &str = concat!(
    r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)",
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?",
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
);
const EXACT_PYTHON_VERSION: &str = concat!(
    r"(?:\d+!)?\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?",
    r"(?:\+[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*)?"
);
const LOCAL: &str = r"(?:^(?:\.|/|~|[A-Za-z]:|-|\$))|(?:\.(?:txt|lock|toml|cfg|whl|tar\.gz|json)$)";
const PARSER: Parser = Parser {
    prog: "check_agent_files.py",
    usage: "usage: check_agent_files.py [-h] [--verify-live]\n",
    help: include_str!("help/check_agent_files.txt"),
    flags: &["--verify-live"],
    exclusive: &[],
    required: false,
};

type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Clone, PartialEq)]
pub struct Finding {
    pub location: String,
    pub what: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Install {
    pub registry: &'static str,
    pub package: String,
    pub version: Option<String>,
    /// True when the command runs the package rather than installing it.
    pub runs_it: bool,
}

fn invisible(c: char) -> bool {
    matches!(c as u32,
        0x200b..=0x200f | 0x202a..=0x202e | 0x2066..=0x2069 | 0x2060..=0x2064 | 0x061c | 0xfeff
            | 0xe0000..=0xe007f)
}

/// `Path.glob` for `**/*<suffix>` below `base`: every directory level, hidden ones
/// included, symlinked directories not followed, names matched as pathlib does
/// (case-insensitively on Windows).
fn glob_recursive(base: &Path, suffix: &str) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut pending = vec![base.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if entry.file_type().is_ok_and(|t| t.is_dir()) {
                pending.push(path.clone());
            }
            if crate::glob_suffix(&entry.file_name().to_string_lossy(), suffix) {
                found.push(path);
            }
        }
    }
    found
}

/// The machine-readable files an agent is pointed at, resolved, unique and sorted.
pub fn scanned_files(root: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = SCANNED.iter().map(|name| root.join(name)).collect();
    for (base, suffix) in [
        (root.to_path_buf(), ".txt"),
        (root.to_path_buf(), ".md"),
        (root.join(".well-known"), ".json"),
    ] {
        files.extend(glob_recursive(&base, suffix).into_iter().filter(|path| {
            // Relative to root: the directory holding the checkout is not ours to read.
            !path
                .strip_prefix(root)
                .map(|rel| {
                    rel.components()
                        .any(|c| UNPUBLISHED.contains(&c.as_os_str().to_string_lossy().as_ref()))
                })
                .unwrap_or(false)
        }));
    }
    let mut unique: Vec<PathBuf> = Vec::new();
    for path in files {
        if path.is_file() {
            let resolved = py::resolve(&path);
            if !unique.contains(&resolved) {
                unique.push(resolved);
            }
        }
    }
    crate::sort_paths(&mut unique);
    unique
}

/// `shlex.split(text)`: POSIX quoting and escapes, no comments; Err for an unclosed
/// quotation or a trailing escape.
pub fn shlex_split(text: &str) -> std::result::Result<Vec<String>, String> {
    let whitespace = |c: char| matches!(c, ' ' | '\t' | '\r' | '\n');
    let mut tokens = Vec::new();
    let mut chars = text.chars();
    loop {
        let mut token = String::new();
        let mut quoted = false;
        let mut state = ' ';
        let mut escaped_state = ' ';
        let ended = loop {
            let next = chars.next();
            match state {
                ' ' => match next {
                    None => break true,
                    Some(c) if whitespace(c) => {
                        if !token.is_empty() || quoted {
                            break false;
                        }
                    }
                    Some('\\') => {
                        escaped_state = 'a';
                        state = '\\';
                    }
                    Some(c @ ('\'' | '"')) => state = c,
                    Some(c) => {
                        token.push(c);
                        state = 'a';
                    }
                },
                '\'' | '"' => {
                    quoted = true;
                    match next {
                        None => return Err("No closing quotation".into()),
                        Some(c) if c == state => state = 'a',
                        Some('\\') if state == '"' => {
                            escaped_state = state;
                            state = '\\';
                        }
                        Some(c) => token.push(c),
                    }
                }
                '\\' => {
                    let Some(c) = next else {
                        return Err("No escaped character".into());
                    };
                    // In POSIX shells only the quote or the escape may be escaped in quotes.
                    if matches!(escaped_state, '\'' | '"') && c != '\\' && c != escaped_state {
                        token.push('\\');
                    }
                    token.push(c);
                    state = escaped_state;
                }
                _ => match next {
                    None => break true,
                    Some(c) if whitespace(c) => {
                        state = ' ';
                        if !token.is_empty() || quoted {
                            break false;
                        }
                    }
                    Some(c @ ('\'' | '"')) => state = c,
                    Some('\\') => {
                        escaped_state = 'a';
                        state = '\\';
                    }
                    Some(c) => token.push(c),
                },
            }
        };
        if token.is_empty() && !quoted {
            // An empty unquoted token is shlex's end of input.
            return Ok(tokens);
        }
        tokens.push(token);
        if ended {
            return Ok(tokens);
        }
    }
}

pub fn is_exact_version(registry: &str, version: Option<&str>) -> bool {
    if registry == "pypi" {
        return fullmatch(EXACT_PYTHON_VERSION, 0, version.unwrap_or(""));
    }
    let Some(version) = version.filter(|v| py::char_len(v) <= 256) else {
        return false;
    };
    let pattern = re(&format!(r"\A(?:{EXACT_NPM_VERSION})\Z"), 0);
    let Some(found) = pattern.search(version) else {
        return false;
    };
    // npm's semver parser limits core numbers to JavaScript's safe integers.
    let core = version
        .split('-')
        .next()
        .unwrap_or("")
        .split('+')
        .next()
        .unwrap_or("");
    if core.split('.').any(|part| {
        part.parse::<u128>()
            .map_or(true, |n| n > 9_007_199_254_740_991)
    }) {
        return false;
    }
    // SemVer forbids leading zeroes in numeric prerelease identifiers.
    found
        .get(1)
        .map_or("", |m| m.as_str())
        .split('.')
        .all(|part| {
            !part.bytes().all(|b| b.is_ascii_digit())
                || part.is_empty()
                || part == "0"
                || !part.starts_with('0')
        })
}

/// Python spells a pin name==1.2.3, npm spells it name@1.2.3.
fn split_version(registry: &str, token: &str) -> (String, Option<String>) {
    let token = token.trim_matches(|c| matches!(c, '"' | '\'' | '`' | ','));
    let token = re(r"\[[^\]]*\]$", 0).sub("", token);
    let some = |v: &str| (!v.is_empty()).then(|| v.to_owned());
    if registry == "pypi" {
        let (name, version) = token.split_once("==").unwrap_or((&token, ""));
        return (name.to_owned(), some(version));
    }
    if let Some(rest) = token.strip_prefix('@') {
        let (scope, rest) = rest.split_once('/').unwrap_or((rest, ""));
        let (name, version) = rest.split_once('@').unwrap_or((rest, ""));
        return (format!("@{scope}/{name}"), some(version));
    }
    let (name, version) = token.split_once('@').unwrap_or((&token, ""));
    (name.to_owned(), some(version))
}

/// The packages a command's remaining tokens resolve.
fn packages_in(rest: &str, registry: &str, take_all: bool) -> Vec<(String, Option<String>)> {
    let tokens = shlex_split(rest).unwrap_or_else(|_| {
        // Prose can contain an unmatched apostrophe after an inline command.
        py::split_whitespace(rest)
            .into_iter()
            .map(str::to_owned)
            .collect()
    });
    let mut positional = Vec::new();
    let mut source = Vec::new();
    let mut extra = Vec::new();
    let mut awaiting: Option<&str> = None;
    for token in tokens {
        if let Some(flag) = awaiting.take() {
            if SOURCE_FLAGS.contains(&flag) {
                source.push(token);
            } else if EXTRA_FLAGS.contains(&flag) {
                extra.push(token);
            }
            continue;
        }
        if token.starts_with('-') {
            match token.split_once('=') {
                Some((flag, value)) if SOURCE_FLAGS.contains(&flag) => {
                    source.push(value.to_owned())
                }
                Some((flag, value)) if EXTRA_FLAGS.contains(&flag) => extra.push(value.to_owned()),
                Some(_) => {}
                None => {
                    if let Some(flag) = VALUE_FLAGS.iter().find(|f| **f == token) {
                        awaiting = Some(flag);
                    }
                }
            }
            continue;
        }
        positional.push(token);
        if !take_all {
            break;
        }
    }
    let local = re(LOCAL, 0);
    let named = if source.is_empty() {
        positional
    } else {
        source
    };
    named
        .iter()
        .chain(&extra)
        .map(|token| split_version(registry, token))
        .filter(|(name, _)| !name.is_empty() && local.search(name).is_none())
        .collect()
}

/// True when a command installs from a requirements file without hashes.
fn unhashed_requirements(command: &str) -> bool {
    let names: Vec<&str> = py::split_whitespace(command)
        .into_iter()
        .map(|token| token.split_once('=').map_or(token, |(name, _)| name))
        .collect();
    REQUIREMENT_FLAGS.iter().any(|flag| names.contains(flag)) && !names.contains(&HASH_PIN)
}

fn json_strings(value: &Json, out: &mut Vec<String>) {
    match value {
        Json::Str(s) => out.push(s.clone()),
        Json::Object(pairs) => pairs.iter().for_each(|(_, v)| json_strings(v, out)),
        Json::Array(items) => items.iter().for_each(|v| json_strings(v, out)),
        _ => {}
    }
}

/// Each command on each line, with whether it reads as a command.
fn commands_in(text: &str, prose: bool) -> Result<Vec<(String, bool)>> {
    let decoded;
    let text = if prose {
        text
    } else {
        // Decode JSON before shell parsing, so string quotes cannot hide command chains.
        let value =
            pyjson::loads(text).map_err(|e| format!("json.decoder.JSONDecodeError: {e}"))?;
        let mut strings = Vec::new();
        json_strings(&value, &mut strings);
        decoded = strings.join("\n");
        &decoded
    };
    let boundary = re(SHELL_BOUNDARY, 0);
    let command = re(COMMAND_LINE, 0);
    let mut found = Vec::new();
    for line in py::splitlines(text) {
        let mut start = 0;
        let mut segments = Vec::new();
        for m in boundary.captures_iter(line) {
            let m = m.get(0).expect("group 0");
            let first = m.as_str().chars().next().unwrap_or(' ');
            if ";&|#".contains(first) {
                segments.push(&line[start..m.start()]);
                start = m.end();
                if first == '#' {
                    break;
                }
            }
        }
        segments.push(&line[start..]);
        for segment in segments {
            if !py::strip(segment).is_empty() {
                found.push((
                    segment.to_owned(),
                    !prose || command.match_at(segment, 0).is_some(),
                ));
            }
        }
    }
    Ok(found)
}

/// Every package an install or run command in the text resolves.
pub fn installs(text: &str, prose: bool) -> Result<Vec<Install>> {
    let mut found = Vec::new();
    for (segment, is_command) in commands_in(text, prose)? {
        let mut seen: Vec<(&str, String, Option<String>)> = Vec::new();
        let mut add = |found: &mut Vec<Install>,
                       registry: &'static str,
                       name: String,
                       version: Option<String>,
                       runs_it: bool| {
            let key = (registry, name.clone(), version.clone());
            if !seen.contains(&key) {
                seen.push(key);
                found.push(Install {
                    registry,
                    package: name,
                    version,
                    runs_it,
                });
            }
        };
        for (registry, prefix) in INSTALLERS {
            for m in re(prefix, 0).captures_iter(&segment) {
                let end = m.get(0).expect("group 0").end();
                for (name, version) in packages_in(&segment[end..], registry, is_command) {
                    add(&mut found, registry, name, version, false);
                }
            }
        }
        for (registry, prefix, command_only) in RUNNERS {
            if command_only && !is_command {
                continue;
            }
            for m in re(prefix, 0).captures_iter(&segment) {
                let end = m.get(0).expect("group 0").end();
                for (name, version) in packages_in(&segment[end..], registry, false) {
                    add(&mut found, registry, name, version, true);
                }
            }
        }
    }
    Ok(found)
}

fn get<'a>(value: &'a Json, key: &str) -> Result<Option<&'a Json>> {
    match value {
        Json::Object(_) => Ok(value.get(key)),
        other => Err(format!(
            "AttributeError: '{}' object has no attribute 'get'",
            type_name(other)
        )),
    }
}

fn rel_posix(path: &Path, root: &Path) -> Result<String> {
    let rel = path.strip_prefix(root).map_err(|_| {
        format!(
            "ValueError: {} is not in the subpath of {}",
            py::repr_str(&path.to_string_lossy()),
            py::repr_str(&root.to_string_lossy())
        )
    })?;
    Ok(rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/"))
}

fn read(path: &Path) -> Result<String> {
    crate::read(path)
}

/// Every finding for the files below `root` against the reviewed `policy`.
pub fn check(root: &Path, policy: &Json) -> Result<Vec<Finding>> {
    let known = match policy {
        Json::Object(_) => policy.get("packages").ok_or("KeyError: 'packages'")?,
        other => {
            return Err(format!(
                "TypeError: '{}' object is not subscriptable",
                type_name(other)
            ));
        }
    };
    let mut findings = Vec::new();
    for path in scanned_files(root) {
        let location = rel_posix(&path, root)?;
        let text = read(&path)?;
        let prose = crate::suffix(&path) != ".json";
        let mut line = 1;
        for c in text.chars() {
            if c == '\n' {
                line += 1;
            } else if invisible(c) {
                findings.push(Finding {
                    location: format!("{location}:{line}"),
                    what: format!("invisible character U+{:04X}", c as u32),
                });
            }
        }
        for (segment, _) in commands_in(&text, prose)? {
            for (_, prefix) in INSTALLERS {
                for m in re(prefix, 0).captures_iter(&segment) {
                    let end = m.get(0).expect("group 0").end();
                    if unhashed_requirements(&segment[end..]) {
                        findings.push(Finding {
                            location: location.clone(),
                            what: format!(
                                "a requirements file is installed without {HASH_PIN}, so the packages inside it are neither listed here nor fixed by a hash"
                            ),
                        });
                    }
                }
            }
        }
        for install in installs(&text, prose)? {
            let registry_entries = get(known, install.registry)?;
            let entry = match registry_entries {
                Some(entries) => get(entries, &install.package)?,
                None => None,
            };
            let Some(entry) = entry.filter(|e| !matches!(e, Json::Null)) else {
                findings.push(Finding {
                    location: location.clone(),
                    what: format!(
                        "{} package {} is not in the reviewed record, so nobody has checked that the name is published and whose it is",
                        install.registry,
                        py::repr_str(&install.package)
                    ),
                });
                continue;
            };
            // The local_dependency exemption covers the run path only.
            let exempt = get(entry, "local_dependency")?.is_some_and(Json::truthy)
                && install.runs_it
                && install.version.is_none();
            let owner = get(entry, "owner")?;
            let ours = owner.is_some_and(|o| o.py_eq(&Json::str_obj(OWNER)));
            if !ours && !is_exact_version(install.registry, install.version.as_deref()) && !exempt {
                findings.push(Finding {
                    location: location.clone(),
                    what: format!(
                        "{} package {} belongs to {} and is installed without a version fixed to an exact release, so it runs what the registry serves when an agent reads this file",
                        install.registry,
                        py::repr_str(&install.package),
                        owner.map_or("None".into(), Json::repr)
                    ),
                });
            }
        }
    }
    Ok(findings)
}

pub fn load_policy(root: &Path) -> Result<Json> {
    pyjson::loads(&read(
        &py::resolve(root)
            .join("scripts")
            .join("agent_file_policy.json"),
    )?)
    .map_err(|e| format!("json.decoder.JSONDecodeError: {e}"))
}

/// Report drift between the reviewed record and the public registries.
fn verify_live(root: &Path) -> Result<u8> {
    let record = load_policy(root)?;
    let mut used: Vec<(&str, String)> = Vec::new();
    for path in scanned_files(root) {
        let prose = crate::suffix(&path) != ".json";
        for install in installs(&read(&path)?, prose)? {
            used.push((install.registry, install.package));
        }
    }
    let Some(Json::Object(registries)) = record.get("packages") else {
        return Err("KeyError: 'packages'".into());
    };
    let mut registries: Vec<&(String, Json)> = registries.iter().collect();
    registries.sort_by(|a, b| a.0.cmp(&b.0));
    let mut drift = 0;
    for (registry, packages) in registries {
        let Json::Object(packages) = packages else {
            return Err("AttributeError: object has no attribute 'items'".into());
        };
        let mut packages: Vec<&(String, Json)> = packages.iter().collect();
        packages.sort_by(|a, b| a.0.cmp(&b.0));
        for (package, entry) in packages {
            let url = if registry == "pypi" {
                format!("https://pypi.org/pypi/{package}/json")
            } else {
                format!("https://registry.npmjs.org/{}", package.replace('/', "%2f"))
            };
            let status = crate::fetch::status(
                &url,
                "duguid.com.au agent-file check",
                Duration::from_secs(30),
            )
            .map_err(|e| format!("could not reach {url}: {e}"))?;
            let state = if status == 200 {
                "published".to_owned()
            } else {
                format!("NOT PUBLISHED (HTTP {status})")
            };
            let note = if used.iter().any(|(r, p)| r == registry && p == package) {
                ""
            } else {
                ", recorded but no longer installed here"
            };
            let owner = get(entry, "owner")?.map_or("None".into(), Json::repr);
            crate::print_text(
                &format!("{registry} {package}: {state}, owner {owner}{note}\n"),
                false,
            )
            .map_err(|e| e.to_string())?;
            if status != 200 {
                drift += 1;
            }
        }
    }
    if drift > 0 {
        crate::print_text(
            &format!("{drift} recorded name(s) are unpublished and claimable\n"),
            true,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(u8::from(drift > 0))
}

pub fn run(root: &Path, args: &[String]) -> Result<u8> {
    let flags = match PARSER.parse(args) {
        Parsed::Flags(flags) => flags,
        Parsed::Exit(code) => return Ok(code),
    };
    if flags.contains(&"--verify-live") {
        return verify_live(root);
    }
    let root = py::resolve(root);
    let findings = check(&root, &load_policy(&root)?)?;
    if !findings.is_empty() {
        let mut text = "agent-file policy failures:\n".to_owned();
        for finding in &findings {
            text.push_str(&format!("- {}: {}\n", finding.location, finding.what));
        }
        crate::print_text(&text, true).map_err(|e| e.to_string())?;
        return Ok(1);
    }
    crate::print_text(
        &format!(
            "agent-file checks passed ({} machine-readable files)\n",
            scanned_files(&root).len()
        ),
        false,
    )
    .map_err(|e| e.to_string())?;
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_like_shlex() {
        let split = |s: &str| shlex_split(s);
        assert_eq!(
            split("a 'b c' \"d\\\"e\" f\\ g ''").unwrap(),
            ["a", "b c", "d\"e", "f g", ""]
        );
        assert_eq!(split("\"a\\b\"").unwrap(), ["a\\b"]);
        assert_eq!(split("  ").unwrap(), Vec::<String>::new());
        assert!(split("'open").is_err());
        assert!(split("end\\").is_err());
    }
}
