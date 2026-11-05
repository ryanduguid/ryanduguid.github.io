// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! build_agent_skills_manifest --check and pin_rates_dataset: the committed manifest
//! passes and is an Agent Skills Discovery v0.2.0 index, a broken one reports each
//! finding as the Python script does, and the pin command keeps its usage contract.
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

/// Agent Skills Discovery v0.2.0 (github.com/cloudflare/agent-skills-discovery-rfc):
/// a top-level `$schema` and `skills`, and on every entry `name`, `type`, `description`,
/// `url` and `digest`. Every entry here is a single SKILL.md, so its type is `skill-md`.
#[test]
fn committed_manifest_is_a_discovery_v0_2_0_index() {
    let text = std::fs::read_to_string(repository().join(MANIFEST)).unwrap();
    let index: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(
        index["$schema"],
        "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
    );
    let skills = index["skills"].as_array().expect("skills is a list");
    assert!(!skills.is_empty());
    for skill in skills {
        for field in ["name", "type", "description", "url", "digest"] {
            assert!(
                skill[field].as_str().is_some_and(|value| !value.is_empty()),
                "{field} missing from {skill}"
            );
        }
        assert_eq!(skill["type"], "skill-md", "{}", skill["name"]);
    }
}

#[test]
fn broken_manifest_reports_each_finding() {
    let site = tempfile::tempdir().unwrap();
    std::fs::write(site.path().join("_config.yml"), "").unwrap();
    std::fs::create_dir_all(site.path().join(".well-known/agent-skills")).unwrap();
    let text = std::fs::read_to_string(repository().join(MANIFEST)).unwrap();
    let mut manifest = pyjson::loads(&text).unwrap();
    *member(&mut manifest, "format") = Json::str_obj("x");
    *member(&mut manifest, "note") = Json::str_obj("x");
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
agent-skills manifest: note does not say v0.4.0 is pinned as the latest release under Apache-2.0
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
fn a_pin_reason_must_match_the_declared_licence() {
    let site = tempfile::tempdir().unwrap();
    std::fs::write(site.path().join("_config.yml"), "").unwrap();
    std::fs::create_dir_all(site.path().join(".well-known/agent-skills")).unwrap();
    let text = std::fs::read_to_string(repository().join(MANIFEST)).unwrap();
    let check = |manifest: &Json| {
        let dump = Dump {
            indent: Some(2),
            ..Dump::default()
        };
        std::fs::write(site.path().join(MANIFEST), pyjson::dumps(manifest, dump)).unwrap();
        run(site.path(), &["build_agent_skills_manifest", "--check"]).1
    };

    // The phrase alone is not a reason.
    let mut wrong_reason = pyjson::loads(&text).unwrap();
    *member(&mut wrong_reason, "note") =
        Json::str_obj("v0.4.0 is pinned because it was convenient.");
    assert!(
        check(&wrong_reason).contains("note does not say v0.4.0 is pinned as the latest release"),
        "wrong reason"
    );

    // Nor is one that outlives its date: nothing here reads upstream.
    let mut undated = pyjson::loads(&text).unwrap();
    *member(&mut undated, "note") = Json::str_obj(
        "v0.4.0 is pinned because it is the latest release under Apache-2.0, the licence declared here.",
    );
    assert!(
        check(&undated).contains("note does not say v0.4.0 is pinned as the latest release"),
        "undated reason"
    );

    // Nor is a reason naming a licence the file does not declare.
    let mut wrong_licence = pyjson::loads(&text).unwrap();
    *member(member(&mut wrong_licence, "source"), "license") = Json::str_obj("MIT");
    assert!(
        check(&wrong_licence).contains("latest release under MIT"),
        "wrong licence"
    );
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
