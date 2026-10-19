//! scripts/test_agent_files.py: every case is fabricated in a temporary directory, so a
//! pass says the gate still fires rather than that the site happens to be clean today.
use site_tools::agent_files::{check, load_policy};
use site_tools::pyjson::{self, Json};
use std::path::Path;

const ZERO_WIDTH: char = '\u{200B}';
const RIGHT_TO_LEFT: char = '\u{202E}';
const POP_DIRECTION: char = '\u{202C}';
const TAG_LETTER: char = '\u{E0041}';
const ARABIC_LETTER_MARK: char = '\u{061C}';

fn policy() -> Json {
    pyjson::loads(
        r#"{"packages": {
            "pypi": {"solomons-sword": {"owner": "ryanduguid"}, "pre-commit": {"owner": "pre-commit"}},
            "npm": {"skills": {"owner": "vercel-labs"},
                    "playwright": {"owner": "microsoft", "local_dependency": true}}}}"#,
    )
    .unwrap()
}

fn findings_in(root: &Path, body: &str, name: &str) -> Vec<String> {
    let path = root.join(name);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, body).unwrap();
    let root = site_tools::py::resolve(root);
    check(&root, &policy())
        .unwrap()
        .into_iter()
        .map(|f| f.what)
        .collect()
}

fn findings(body: &str) -> Vec<String> {
    findings_named(body, "llms.txt")
}

fn findings_named(body: &str, name: &str) -> Vec<String> {
    let dir = tempfile::tempdir().unwrap();
    findings_in(dir.path(), body, name)
}

fn one(found: &[String], needle: &str) {
    assert_eq!(found.len(), 1, "{found:?}");
    assert!(found[0].contains(needle), "{found:?}");
}

/// The Fortune 500 failure: an official file naming an unclaimed package.
#[test]
fn a_name_nobody_reviewed_is_refused() {
    one(
        &findings("pip install acme-client\n"),
        "not in the reviewed record",
    );
}

#[test]
fn an_unpinned_third_party_command_is_refused() {
    one(
        &findings("npx skills add ryanduguid/australian-accounting-skills\n"),
        "without a version",
    );
}

#[test]
fn pinned_commands_pass() {
    assert!(
        findings("npx --yes skills@1.5.22 add ryanduguid/australian-accounting-skills\n")
            .is_empty()
    );
    assert!(findings("python -m pip install \"pre-commit==4.0.1\"\n").is_empty());
}

#[test]
fn mutable_versions_are_not_pins() {
    let long = format!("npx skills@1.2.3+{} add .", "a".repeat(260));
    for command in [
        "npx skills@latest add .",
        "npx skills@^1.5.22 add .",
        "npx skills@1.x add .",
        "npx skills@1.2.3-foo_bar add .",
        "npx skills@01.2.3 add .",
        "npx skills@1.2.3-01 add .",
        "npx skills@1.2.3-alpha..1 add .",
        "npx skills@1.2.3+build_tag add .",
        "npx skills@9007199254740992.0.0 add .",
        &long,
        "pip install pre-commit==4.*",
    ] {
        assert!(!findings(command).is_empty(), "{command}");
    }
}

#[test]
fn exact_prereleases_are_pins() {
    for command in [
        "npx skills@1.5.22-beta.1 add .",
        "npx skills@0.0.0-0+build.01 add .",
        "pip install pre-commit==4.0.1rc1",
    ] {
        assert!(findings(command).is_empty(), "{command}");
    }
}

#[test]
fn a_local_dependency_with_a_mutable_version_is_not_exempt() {
    assert!(!findings("npx playwright@latest install chromium").is_empty());
}

#[test]
fn one_pin_does_not_hide_another_specifier_in_the_same_command() {
    for command in [
        "npm install skills@1.5.22 skills@latest",
        "npx --package skills@1.5.22 --package skills@latest skills add .",
    ] {
        assert!(!findings(command).is_empty(), "{command}");
    }
}

#[test]
fn url_punctuation_does_not_hide_packages() {
    for url in [
        "https://example.invalid/simple#mirror",
        "\"https://example.invalid/simple?a=1&b=2\"",
        "'https://example.invalid/simple;a=1|b=2'",
        r"https://example.invalid/simple?a=1\&b=2",
    ] {
        one(
            &findings(&format!("pip install --index-url {url} acme-widgets")),
            "acme-widgets",
        );
    }
}

#[test]
fn shell_structure_is_respected() {
    assert!(findings("pip install solomons-sword # acme-widgets").is_empty());
    assert!(findings("pip install solomons-sword && echo acme-widgets\n").is_empty());
    one(
        &findings("pip install solomons-sword && pip install acme-widgets\n"),
        "acme-widgets",
    );
    one(
        &findings("echo preparing && pip install solomons-sword acme-widgets\n"),
        "acme-widgets",
    );
    one(
        &findings("npx skills@1.5.22 add first && npx skills add second\n"),
        "without a version",
    );
    one(
        &findings("echo preparing;pip install solomons-sword acme-widgets\n"),
        "acme-widgets",
    );
    assert!(
        findings("Route | skills | Claude Code plugin, or npx skills add | notes\n").is_empty()
    );
}

#[test]
fn json_files_are_read_after_decoding() {
    one(
        &findings_named(
            r#"{"install": "npx skills@1.5.22 add .;npx skills add ."}"#,
            ".well-known/agent-skills/index.json",
        ),
        "without a version",
    );
    one(
        &findings_named(
            "{\"install\": \"npx acme-cli@1.0.0 add .\"}\n",
            ".well-known/agent-skills/index.json",
        ),
        "acme-cli",
    );
}

#[test]
fn owned_and_local_names() {
    assert!(findings("pip install solomons-sword\n").is_empty());
    assert!(findings("npx playwright install chromium\n").is_empty());
    assert!(
        findings("cd packages/the-wip-tally\npip install .\npip install -e \".[dev]\"\n")
            .is_empty()
    );
    assert!(findings("python -m pip install --require-hashes -r requirements.lock\n").is_empty());
    assert!(
        findings("Each command above is unpinned. uvx may reuse a cached environment.\n")
            .is_empty()
    );
    one(&findings("npm install playwright\n"), "without a version");
}

#[test]
fn every_package_on_a_line_is_read() {
    one(
        &findings("pip install solomons-sword acme-widgets\n"),
        "acme-widgets",
    );
    one(
        &findings("npm install skills@1.5.22 acme-widgets\n"),
        "acme-widgets",
    );
}

#[test]
fn runner_flags() {
    assert!(
        findings("uvx --from solomons-sword==0.1.7 solomons-sword s99b-check --gross 1\n")
            .is_empty()
    );
    assert!(findings("pip install --index-url https://example.invalid/simple .\n").is_empty());
    one(
        &findings("uvx --with acme-extra --from solomons-sword==0.1.7 solomons-sword run\n"),
        "acme-extra",
    );
    one(&findings("npx -p acme-cli some-command\n"), "acme-cli");
    one(
        &findings("uvx --with solomons-sword acme-tool\n"),
        "acme-tool",
    );
    one(
        &findings("npx --package skills@1.5.22 --package acme-cli command\n"),
        "acme-cli",
    );
}

#[test]
fn requirements_files_must_pin_their_hashes() {
    one(
        &findings("pip install -r requirements.txt\n"),
        "--require-hashes",
    );
    assert!(findings("python -m pip install --require-hashes -r requirements.lock\n").is_empty());
}

#[test]
fn published_text_files_are_scanned() {
    one(
        &findings_named("    pip install acme-widgets\n", "rates/register/README.md"),
        "acme-widgets",
    );
    one(
        &findings_named("npm install acme-widgets\n", "tools/thing/index.txt"),
        "acme-widgets",
    );
}

/// GitHub Actions checks out under /home/runner/work, which is not ours.
#[test]
fn a_checkout_under_an_excluded_directory_name_is_still_scanned() {
    let dir = tempfile::tempdir().unwrap();
    let checkout = dir.path().join("work/site");
    one(
        &findings_in(&checkout, "pip install acme-widgets\n", "tools/index.txt"),
        "acme-widgets",
    );
}

#[test]
fn an_excluded_directory_inside_the_checkout_is_skipped() {
    let dir = tempfile::tempdir().unwrap();
    let checkout = dir.path().join("site");
    assert!(
        findings_in(
            &checkout,
            "npm install some-dependency\n",
            "node_modules/other/README.md"
        )
        .is_empty()
    );
}

#[test]
fn hidden_text_is_refused() {
    one(
        &findings(&format!(
            "A line a reader sees.\nAnd one{ZERO_WIDTH}with a gap.\n"
        )),
        "U+200B",
    );
    assert!(
        findings(&format!(
            "Install {RIGHT_TO_LEFT}gnihtemos{POP_DIRECTION} now.\n"
        ))[0]
            .contains("U+202E")
    );
    assert!(findings(&format!("Ordinary text.{TAG_LETTER}\n"))[0].contains("U+E0041"));
    assert!(findings(&format!("Ordinary text.{ARABIC_LETTER_MARK}\n"))[0].contains("U+061C"));
    assert!(findings("Plain text with an em rule, a dash and \"quotes\".\n").is_empty());
}

#[test]
fn the_finding_names_the_line() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("llms.txt"),
        format!("one\ntwo\nthree{ZERO_WIDTH}\n"),
    )
    .unwrap();
    let root = site_tools::py::resolve(dir.path());
    let found = check(&root, &policy()).unwrap();
    assert!(found[0].location.ends_with(":3"), "{}", found[0].location);
}

#[test]
fn the_published_files_pass_their_own_check() {
    let root = site_tools::py::resolve(&Path::new(env!("CARGO_MANIFEST_DIR")).join(".."));
    let found = check(&root, &load_policy(&root).unwrap()).unwrap();
    assert!(found.is_empty(), "{found:?}");
}
