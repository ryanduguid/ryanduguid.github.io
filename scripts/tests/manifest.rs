//! build_agent_skills_manifest --check and pin_rates_dataset: the committed manifest
//! passes, a broken one reports each finding as the Python script does, and the pin
//! command keeps its usage contract.
use site_tools::pyjson::{self, Dump, Json};
use std::path::Path;
use std::process::Command;

const MANIFEST: &str = ".well-known/agent-skills/index.json";

fn repository() -> &'static Path {
    Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/.."))
}

fn run(root: &Path, args: &[&str]) -> (Option<i32>, String, String) {
    let output = Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .args(args)
        .current_dir(root)
        .env_remove("SITE_ROOT")
        .output()
        .unwrap();
    (
        output.status.code(),
        String::from_utf8(output.stdout)
            .unwrap()
            .replace("\r\n", "\n"),
        String::from_utf8(output.stderr)
            .unwrap()
            .replace("\r\n", "\n"),
    )
}

fn member<'a>(value: &'a mut Json, key: &str) -> &'a mut Json {
    match value {
        Json::Object(pairs) => &mut pairs.iter_mut().find(|(k, _)| k == key).unwrap().1,
        _ => panic!("not an object"),
    }
}

fn skill(manifest: &mut Json, index: usize) -> &mut Json {
    match member(manifest, "skills") {
        Json::Array(items) => &mut items[index],
        _ => panic!("not a list"),
    }
}

#[test]
fn committed_manifest_passes() {
    let (code, stdout, _) = run(repository(), &["build_agent_skills_manifest", "--check"]);
    assert_eq!(code, Some(0), "{stdout}");
    assert_eq!(stdout, "agent-skills manifest: checks passed\n");
}

#[test]
fn broken_manifest_reports_each_finding() {
    let site = tempfile::tempdir().unwrap();
    std::fs::write(site.path().join("_config.yml"), "").unwrap();
    std::fs::create_dir_all(site.path().join(".well-known/agent-skills")).unwrap();
    let text = std::fs::read_to_string(repository().join(MANIFEST)).unwrap();
    let mut manifest = pyjson::loads(&text).unwrap();
    *member(&mut manifest, "format") = Json::str_obj("x");
    *member(member(&mut manifest, "source"), "release") = Json::str_obj("v0");
    *member(skill(&mut manifest, 0), "name") = Json::str_obj("Bad_Name");
    *member(skill(&mut manifest, 1), "description") = Json::str_obj(" ");
    *member(skill(&mut manifest, 2), "digest") = Json::str_obj("sha256:abc");
    let name = member(skill(&mut manifest, 4), "name").clone();
    *member(skill(&mut manifest, 3), "name") = name;
    std::fs::write(
        site.path().join(MANIFEST),
        pyjson::dumps(
            &manifest,
            Dump {
                indent: Some(2),
                ..Dump::default()
            },
        ),
    )
    .unwrap();
    let (code, stdout, _) = run(site.path(), &["build_agent_skills_manifest", "--check"]);
    assert_eq!(code, Some(1));
    assert_eq!(
        stdout,
        "agent-skills manifest: format is 'x', expected 'duguid.com.au/agent-skills-index/1'
agent-skills manifest: source.release is not v0.4.0
agent-skills manifest: skill names repeat
agent-skills manifest: 'Bad_Name': name breaks the Agent Skills name rule
agent-skills manifest: Bad_Name: url is not the file at the pinned commit
agent-skills manifest: au-ato-penalties-interest: description missing or over 1024 characters
agent-skills manifest: au-bookkeeping: digest is not sha256:<64 hex>
agent-skills manifest: au-capital-gains: url is not the file at the pinned commit
"
    );
    std::fs::remove_file(site.path().join(MANIFEST)).unwrap();
    let (code, stdout, _) = run(site.path(), &["build_agent_skills_manifest", "--check"]);
    assert_eq!(code, Some(1));
    assert!(stdout.contains("No such file or directory"), "{stdout}");
}

#[test]
fn manifest_modes_are_exclusive_and_required() {
    let (code, _, stderr) = run(repository(), &["build_agent_skills_manifest"]);
    assert_eq!(code, Some(2));
    assert!(stderr.ends_with("error: one of the arguments --write --check is required\n"));
    let (code, _, stderr) = run(
        repository(),
        &["build_agent_skills_manifest", "--write", "--check"],
    );
    assert_eq!(code, Some(2));
    assert!(stderr.ends_with("error: argument --check: not allowed with argument --write\n"));
}

#[test]
fn pin_needs_exactly_one_checkout() {
    let (code, stdout, stderr) = run(repository(), &["pin_rates_dataset"]);
    assert_eq!((code, stdout.as_str()), (Some(2), ""));
    assert_eq!(
        stderr,
        "Usage: site-tools pin_rates_dataset <path to an australian-accounting checkout>\n"
    );
}
