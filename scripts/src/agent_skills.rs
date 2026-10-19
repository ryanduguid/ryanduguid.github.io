//! scripts/build_agent_skills_manifest.py: build and check .well-known/agent-skills/index.json.
//!
//! The manifest lists every SKILL.md in one pinned release of
//! ryanduguid/australian-accounting-skills with its name, description, a URL that serves
//! the exact bytes and a sha256 digest of them. `--write` reads the release from GitHub
//! and rewrites the manifest; `--check` validates the committed manifest offline, which is
//! what the site checks run.
use crate::py;
use crate::pyargs::{Parsed, Parser};
use crate::pyjson::{self, Dump, Json};
use crate::pyobj::type_name;
use crate::pyre::{M, re};
use std::path::{Path, PathBuf};
use std::time::Duration;

const REPOSITORY: &str = "ryanduguid/australian-accounting-skills";
const RELEASE: &str = "v0.4.0";
const SKILLS_DIR: &str = ".claude/skills";
const FORMAT: &str = "duguid.com.au/agent-skills-index/1";
const NAME_PATTERN: &str = r"^[a-z0-9]+(?:-[a-z0-9]+)*$";
const DIGEST_PATTERN: &str = r"^sha256:[0-9a-f]{64}$";
const COMMIT_PATTERN: &str = r"^[0-9a-f]{40}$";
const USER_AGENT: &str = "duguid.com.au manifest build";
const PARSER: Parser = Parser {
    prog: "site-tools build_agent_skills_manifest",
    usage: include_str!("help/build_agent_skills_manifest.usage"),
    help: include_str!("help/build_agent_skills_manifest.txt"),
    flags: &["--write", "--check"],
    exclusive: &["--write", "--check"],
    required: true,
};

type Result<T> = std::result::Result<T, String>;

/// The manifest path as Python holds it, `ROOT / ".well-known" / "agent-skills" / "index.json"`.
fn manifest_path(root: &Path) -> PathBuf {
    py::resolve(root)
        .join(".well-known")
        .join("agent-skills")
        .join("index.json")
}

fn manifest_rel() -> String {
    [".well-known", "agent-skills", "index.json"].join(std::path::MAIN_SEPARATOR_STR)
}

/// The skills README's release route, checked out at the recorded commit.
fn install_commands(commit: &str) -> Vec<String> {
    vec![
        format!("git clone https://github.com/{REPOSITORY}.git accounting-skills-release"),
        format!("git -C accounting-skills-release checkout --detach {commit}"),
        "npx --yes skills@1.5.22 add ./accounting-skills-release --agent codex claude-code --skill '*' --yes --copy".into(),
    ]
}

/// URLs pin the commit, not the tag: a tag can be moved, a commit cannot.
fn raw_prefix(commit: &str) -> String {
    format!("https://raw.githubusercontent.com/{REPOSITORY}/{commit}/{SKILLS_DIR}/")
}

/// `value.get(key)` on a decoded value that must be a dict.
fn get(value: &Json, key: &str) -> Result<Option<Json>> {
    match value {
        Json::Object(_) => Ok(value.get(key).cloned()),
        other => Err(format!(
            "AttributeError: '{}' object has no attribute 'get'",
            type_name(other)
        )),
    }
}

fn repr(value: Option<&Json>) -> String {
    value.map_or("None".into(), Json::repr)
}

fn py_str(value: Option<&Json>) -> Result<String> {
    match value {
        None => Ok("None".into()),
        Some(v) => crate::pyformat::py_str(v),
    }
}

fn matches(pattern: &str, value: &str) -> bool {
    re(pattern, 0).match_at(value, 0).is_some()
}

fn check(root: &Path) -> Result<Vec<String>> {
    let mut failures = Vec::new();
    let path = manifest_path(root);
    let text = match py::read_text(&path) {
        Ok(text) => text,
        Err(py::ReadError::Os(e)) => {
            let error = py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Errno);
            return Ok(vec![format!("{}: {error}", manifest_rel())]);
        }
        Err(py::ReadError::Decode(e)) => return Ok(vec![format!("{}: {e}", manifest_rel())]),
    };
    let manifest = match pyjson::loads(&text) {
        Ok(value) => value,
        Err(e) => return Ok(vec![format!("{}: {e}", manifest_rel())]),
    };
    let format = get(&manifest, "format")?;
    if !format
        .as_ref()
        .is_some_and(|f| f.py_eq(&Json::str_obj(FORMAT)))
    {
        failures.push(format!(
            "format is {}, expected {}",
            repr(format.as_ref()),
            py::repr_str(FORMAT)
        ));
    }
    let source = get(&manifest, "source")?.unwrap_or(Json::Object(Vec::new()));
    if !get(&source, "release")?.is_some_and(|r| r.py_eq(&Json::str_obj(RELEASE))) {
        failures.push(format!("source.release is not {RELEASE}"));
    }
    let commit = match get(&source, "commit")? {
        Some(Json::Str(commit)) if matches(COMMIT_PATTERN, &commit) => commit,
        _ => {
            failures.push("source.commit is not a 40-character commit sha".into());
            return Ok(failures);
        }
    };
    let install = Json::Array(
        install_commands(&commit)
            .into_iter()
            .map(Json::Str)
            .collect(),
    );
    if !get(&source, "install")?.is_some_and(|i| i.py_eq(&install)) {
        failures.push(
            "source.install is not the clone, checkout and add sequence at source.commit".into(),
        );
    }
    let skills = match get(&manifest, "skills")? {
        Some(Json::Array(skills)) if !skills.is_empty() => skills,
        _ => {
            failures.push("skills must be a non-empty list".into());
            return Ok(failures);
        }
    };
    let mut names: Vec<Option<Json>> = Vec::new();
    for skill in &skills {
        names.push(get(skill, "name")?);
    }
    let mut unique: Vec<&Option<Json>> = Vec::new();
    for name in &names {
        if let Some(Json::Array(_) | Json::Object(_)) = name {
            return Err(format!(
                "TypeError: unhashable type: '{}'",
                type_name(name.as_ref().expect("present"))
            ));
        }
        let same = |other: &&Option<Json>| match (name, other) {
            (None, None) => true,
            (Some(a), Some(b)) => a.py_eq(b),
            _ => false,
        };
        if !unique.iter().any(same) {
            unique.push(name);
        }
    }
    if unique.len() != names.len() {
        failures.push("skill names repeat".into());
    }
    for skill in &skills {
        let name = get(skill, "name")?;
        let valid_name = matches!(&name, Some(Json::Str(n)) if matches(NAME_PATTERN, n) && py::char_len(n) <= 64);
        if !valid_name {
            failures.push(format!(
                "{}: name breaks the Agent Skills name rule",
                repr(name.as_ref())
            ));
        }
        let description = get(skill, "description")?;
        let valid_description = matches!(&description, Some(Json::Str(d)) if !py::strip(d).is_empty() && py::char_len(d) <= 1024);
        if !valid_description {
            failures.push(format!(
                "{}: description missing or over 1024 characters",
                py_str(name.as_ref())?
            ));
        }
        let url = format!("{}{}/SKILL.md", raw_prefix(&commit), py_str(name.as_ref())?);
        if !get(skill, "url")?.is_some_and(|u| u.py_eq(&Json::Str(url))) {
            failures.push(format!(
                "{}: url is not the file at the pinned commit",
                py_str(name.as_ref())?
            ));
        }
        if !matches!(get(skill, "digest")?, Some(Json::Str(d)) if matches(DIGEST_PATTERN, &d)) {
            failures.push(format!(
                "{}: digest is not sha256:<64 hex>",
                py_str(name.as_ref())?
            ));
        }
    }
    Ok(failures)
}

fn fetch(url: &str) -> Result<Vec<u8>> {
    crate::fetch::get(url, USER_AGENT, Duration::from_secs(30))
}

fn fetch_json(url: &str) -> Result<Json> {
    pyjson::loads_bytes(&fetch(url)?).map_err(|e| format!("json.decoder.JSONDecodeError: {e}"))
}

/// One scalar frontmatter value; the skills use plain or double-quoted strings.
fn frontmatter_field(text: &str, field: &str) -> Result<String> {
    let head = text.split_once("\n---").map_or(text, |(head, _)| head);
    let pattern = format!(r"^{field}:[ \t]*(.+?)[ \t]*$");
    let Some(found) = re(&pattern, M).search(head) else {
        return Err(format!("ValueError: frontmatter has no {field}"));
    };
    let value = &found[1];
    if value.starts_with('"') && value.ends_with('"') {
        // value[1:-1]: empty for the one-character value `"`.
        let inner = if value.len() >= 2 {
            &value[1..value.len() - 1]
        } else {
            ""
        };
        return Ok(inner.replace("\\\"", "\""));
    }
    Ok(value.to_owned())
}

fn released_skill_names(commit: &str) -> Result<Vec<String>> {
    let tree = fetch_json(&format!(
        "https://api.github.com/repos/{REPOSITORY}/git/trees/{commit}?recursive=1"
    ))?;
    if get(&tree, "truncated")?.is_some_and(|t| t.truthy()) {
        return Err("RuntimeError: tree listing truncated".into());
    }
    let prefix = format!("{SKILLS_DIR}/");
    let Some(Json::Array(entries)) = tree.get("tree") else {
        return Err("KeyError: 'tree'".into());
    };
    let mut names = Vec::new();
    for entry in entries {
        let Some(Json::Str(path)) = entry.get("path") else {
            return Err("KeyError: 'path'".into());
        };
        if path.starts_with(&prefix) && path.ends_with("/SKILL.md") {
            let rest = &path[prefix.len()..];
            names.push(rest.split('/').next().unwrap_or("").to_owned());
        }
    }
    names.sort();
    if names.is_empty() {
        return Err("RuntimeError: no SKILL.md files in the release".into());
    }
    Ok(names)
}

fn build() -> Result<Json> {
    let commit = match fetch_json(&format!(
        "https://api.github.com/repos/{REPOSITORY}/commits/{RELEASE}"
    ))?
    .get("sha")
    {
        Some(Json::Str(sha)) => sha.clone(),
        Some(other) => {
            return Err(format!(
                "TypeError: expected string, got {}",
                type_name(other)
            ));
        }
        None => return Err("KeyError: 'sha'".into()),
    };
    if !matches(COMMIT_PATTERN, &commit) {
        return Err(format!(
            "ValueError: {RELEASE} did not resolve to a commit: {}",
            py::repr_str(&commit)
        ));
    }
    let mut skills = Vec::new();
    for name in released_skill_names(&commit)? {
        let url = format!("{}{name}/SKILL.md", raw_prefix(&commit));
        let body = fetch(&url)?;
        let text = py::decode_utf8(&body).map_err(|e| format!("UnicodeDecodeError: {e}"))?;
        if frontmatter_field(&text, "name")? != name {
            return Err(format!(
                "ValueError: {name}: frontmatter name differs from its directory"
            ));
        }
        skills.push(Json::Object(vec![
            ("name".into(), Json::Str(name.clone())),
            (
                "description".into(),
                Json::Str(frontmatter_field(&text, "description")?),
            ),
            ("url".into(), Json::Str(url)),
            (
                "digest".into(),
                Json::Str(format!("sha256:{}", crate::sha256(&body))),
            ),
        ]));
    }
    let s = Json::str_obj;
    Ok(Json::Object(vec![
        ("format".into(), s(FORMAT)),
        ("generated".into(), Json::Str(py::Date::today().isoformat())),
        (
            "publisher".into(),
            Json::Object(vec![
                ("name".into(), s("Ryan Duguid")),
                ("url".into(), s("https://duguid.com.au/")),
            ]),
        ),
        (
            "skill_format".into(),
            s("https://agentskills.io/specification"),
        ),
        (
            "source".into(),
            Json::Object(vec![
                (
                    "repository".into(),
                    Json::Str(format!("https://github.com/{REPOSITORY}")),
                ),
                ("release".into(), s(RELEASE)),
                ("commit".into(), Json::Str(commit.clone())),
                ("license".into(), s("Apache-2.0")),
                (
                    "install".into(),
                    Json::Array(
                        install_commands(&commit)
                            .into_iter()
                            .map(Json::Str)
                            .collect(),
                    ),
                ),
            ]),
        ),
        (
            "note".into(),
            s(concat!(
                "Preparation-only accounting workflows for review by an authorised human. ",
                "Not tax advice and not lodgement. Each url serves the released bytes; ",
                "check the digest before use."
            )),
        ),
        ("skills".into(), Json::Array(skills)),
    ]))
}

fn say(text: &str) -> Result<()> {
    crate::print_text(text, false).map_err(|e| e.to_string())
}

pub fn run(root: &Path, args: &[String]) -> Result<u8> {
    let flags = match PARSER.parse(args) {
        Parsed::Flags(flags) => flags,
        Parsed::Exit(code) => return Ok(code),
    };
    if flags.contains(&"--write") {
        let manifest = build()?;
        let count = match manifest.get("skills") {
            Some(Json::Array(skills)) => skills.len(),
            _ => 0,
        };
        let path = manifest_path(root);
        let parent = path.parent().expect("a parent");
        std::fs::create_dir_all(parent)
            .map_err(|e| py::oserror_str(&e, &parent.to_string_lossy(), py::OsStyle::Errno))?;
        let text = pyjson::dumps(
            &manifest,
            Dump {
                indent: Some(2),
                ensure_ascii: false,
                ..Dump::default()
            },
        ) + "\n";
        std::fs::write(&path, text)
            .map_err(|e| py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Errno))?;
        say(&format!(
            "{} written: {count} skills from {RELEASE}\n",
            manifest_rel()
        ))?;
        return Ok(0);
    }
    let failures = check(root)?;
    for failure in &failures {
        say(&format!("agent-skills manifest: {failure}\n"))?;
    }
    if !failures.is_empty() {
        return Ok(1);
    }
    say("agent-skills manifest: checks passed\n")?;
    Ok(0)
}
