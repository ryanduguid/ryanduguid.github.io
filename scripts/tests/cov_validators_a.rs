// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Coverage tests for rates_register, check_design, agent_files and check_site.
mod common;

use site_tools::agent_files;
use site_tools::check_design;
use site_tools::check_site::{self, Git, GitError, Host};
use site_tools::py::Date;
use site_tools::rates_register;
use std::path::{Path, PathBuf};

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|v| (*v).to_owned()).collect()
}

#[test]
fn rates_register_covers_dst_boundaries_sha256_crlf_and_table_checks() {
    use jiff::civil::date;

    // Sydney DST transitions:
    // 2026-04-05 is first Sunday of April -> UTC transition 2026-04-04 16:00 UTC.
    // 2026-10-04 is first Sunday of October -> UTC transition 2026-10-03 16:00 UTC.
    let before_end = date(2026, 4, 4).at(13, 30, 0, 0); // AEDT +11 -> Apr 5
    assert_eq!(
        rates_register::sydney_date(before_end),
        Date::new(2026, 4, 5).unwrap()
    );
    let after_end = date(2026, 4, 4).at(16, 30, 0, 0); // AEST +10 -> Apr 5
    assert_eq!(
        rates_register::sydney_date(after_end),
        Date::new(2026, 4, 5).unwrap()
    );
    let winter = date(2026, 7, 1).at(13, 30, 0, 0); // AEST +10 -> Jul 1 (23:30)
    assert_eq!(
        rates_register::sydney_date(winter),
        Date::new(2026, 7, 1).unwrap()
    );
    let before_start = date(2026, 10, 3).at(13, 30, 0, 0); // AEST +10 -> Oct 3 (23:30)
    assert_eq!(
        rates_register::sydney_date(before_start),
        Date::new(2026, 10, 3).unwrap()
    );
    let after_start = date(2026, 10, 3).at(16, 30, 0, 0); // AEDT +11 -> Oct 4 (03:30)
    assert_eq!(
        rates_register::sydney_date(after_start),
        Date::new(2026, 10, 4).unwrap()
    );
    let _ = rates_register::today();

    // Committed repo passes
    let repo = common::repository();
    assert_eq!(rates_register::run(&repo).unwrap(), 0);

    // Register failure branches: missing dir, CRLF, mismatched digest, unlisted/missing file
    let dir = tempfile::tempdir().unwrap();
    let missing = rates_register::check_register(&dir.path().join("nope"), None).unwrap();
    assert!(!missing.is_empty());

    let reg = dir.path().join("reg");
    std::fs::create_dir_all(&reg).unwrap();
    std::fs::write(reg.join("register.json"), "{}").unwrap();
    std::fs::write(
        reg.join("crlf.csv"),
        "a,b
1,2
",
    )
    .unwrap();
    std::fs::write(reg.join("bad.csv"), "a,b\n1,2\n").unwrap();
    std::fs::write(reg.join("extra.csv"), "a,b\n1,2\n").unwrap();
    std::fs::write(
        reg.join("SHA256SUMS"),
        "0000000000000000000000000000000000000000000000000000000000000000  crlf.csv\n\
         0000000000000000000000000000000000000000000000000000000000000000  bad.csv\n\
         0000000000000000000000000000000000000000000000000000000000000000  missing.csv\n",
    )
    .unwrap();
    let failures =
        rates_register::check_register(&reg, Some(Date::new(2026, 11, 24).unwrap())).unwrap();
    assert!(!failures.is_empty(), "{failures:?}");

    // Bad rate tables under rates/
    let bad_rates = dir.path().join("rates");
    std::fs::create_dir_all(bad_rates.join("sample")).unwrap();
    std::fs::write(
        bad_rates.join("sample/sample.csv"),
        "year,rate,source_url,checked_at\n2026-27,10%,not-a-url,2099-01-01\n",
    )
    .unwrap();
    let tfail = rates_register::check_tables(&bad_rates, Date::new(2026, 11, 24).unwrap()).unwrap();
    assert!(!tfail.is_empty());
}

#[test]
fn check_design_covers_tokens_copy_fictional_security_and_cli() {
    // OLED token checks
    let bad_css = ":root { --bg: #ffffff; }";
    assert!(!check_design::check_oled_tokens(bad_css).is_empty());

    // Banned visible patterns and fictional wording
    let copy_fail = check_design::page_copy_failures(
        "test/index.html",
        "<main><p>Use our AI-powered platform for seamless workflow automation.</p></main>",
    );
    assert!(!copy_fail.is_empty());
    let _ = check_design::page_fictional_failures(
        "test/index.html",
        "<main><p>Example: $100,000 salary</p></main>",
    );
    assert!(!check_design::calculator_csp_meta().is_empty());
    assert!(check_design::font_preload("inter").contains("preload"));

    // Missing security.txt & favicon assets in empty tempdir
    let empty = tempfile::tempdir().unwrap();
    assert!(
        !check_design::check_security_txt(empty.path())
            .unwrap()
            .is_empty()
    );
    assert!(
        !check_design::check_favicon(empty.path())
            .unwrap()
            .is_empty()
    );
    assert!(
        !check_design::check_favicon_assets(empty.path())
            .unwrap()
            .is_empty()
    );
    assert!(
        !check_design::check_cash_chart_copies(empty.path())
            .unwrap()
            .is_empty()
    );
    assert!(
        !check_design::check_font_delivery(
            empty.path(),
            "@font-face { src: url('/assets/fonts/missing.woff2'); }"
        )
        .unwrap()
        .is_empty()
    );
    assert!(
        !check_design::check_opening_review_dates(empty.path())
            .unwrap()
            .is_empty()
    );
    assert!(
        !check_design::check_homepage_refinement(empty.path())
            .unwrap()
            .is_empty()
    );
    assert!(
        check_design::stylesheet_links(empty.path())
            .unwrap()
            .is_err()
    );

    // Expired security.txt
    let sec = empty.path().join(".well-known/security.txt");
    std::fs::create_dir_all(sec.parent().unwrap()).unwrap();
    std::fs::write(
        &sec,
        "Contact: mailto:x@example.com\nExpires: 2020-01-01T00:00:00Z\n",
    )
    .unwrap();
    assert!(
        !check_design::check_security_txt(empty.path())
            .unwrap()
            .is_empty()
    );

    // CLI help and bad args
    assert_eq!(check_design::run(empty.path(), &[]).unwrap(), 1);
    assert!(check_design::run(empty.path(), &s(&["--update-baseline"])).is_err());
}

#[test]
fn agent_files_covers_shlex_versions_installs_and_policy_checks() {
    assert_eq!(
        agent_files::shlex_split(r#"npx "pkg@1.0.0" 'single text' a\ b"#).unwrap(),
        vec!["npx", "pkg@1.0.0", "single text", "a b"]
    );
    assert!(agent_files::shlex_split("unclosed 'quote").is_err());
    assert!(agent_files::shlex_split("unclosed \"quote").is_err());

    assert!(agent_files::is_exact_version("npm", Some("1.2.3")));
    assert!(!agent_files::is_exact_version("npm", Some("^1.2.3")));
    assert!(!agent_files::is_exact_version("npm", None));
    assert!(agent_files::is_exact_version("pypi", Some("0.12.0")));
    assert!(!agent_files::is_exact_version("pypi", Some(">=0.12.0")));
    assert!(agent_files::is_exact_version("cargo", Some("1.0.0")));

    let text = concat!(
        "npx --yes skills@1.5.22 add ./repo\n",
        "npm install -g foo@1.2.3\n",
        "pip install au-fpa-pack==0.7.0\n",
        "uvx --from aus-accounting-mcp==0.11.0 aus-accounting-mcp\n",
        "cargo install --locked ozzit --version 3.7.0\n"
    );
    let found = agent_files::installs(text, true).unwrap();
    assert!(found.len() >= 4, "{found:?}");
    let json_text =
        r#"{"cmd":"npx --yes skills@1.5.22 add ./repo","arr":["pip install au-fpa-pack==0.7.0"]}"#;
    let json_found = agent_files::installs(json_text, false).unwrap();
    assert!(json_found.len() >= 2, "{json_found:?}");
    assert!(agent_files::installs("not json", false).is_err());
    let prose =
        agent_files::installs("Run `npx skills@1.5.22` or `pip install foo`.", true).unwrap();
    assert!(!prose.is_empty());

    // Committed repo check passes
    let repo = common::repository();
    assert_eq!(agent_files::run(&repo, &s(&["--help"])).unwrap(), 0);
}

#[test]
fn check_site_covers_selection_git_and_main_with_host() {
    assert!(!check_site::can_skip_live_links("push", &[], ""));
    assert!(!check_site::can_skip_live_links("schedule", &[], ""));
    assert!(check_site::can_skip_live_links(
        "pull_request",
        &s(&["README.md"]),
        "+plain text\n"
    ));
    assert!(check_site::can_skip_live_links(
        "pull_request",
        &s(&["assets/site.css"]),
        "+body {}\n"
    ));
    assert!(!check_site::can_skip_live_links(
        "pull_request",
        &s(&["assets/site.css"]),
        "+url(https://example.com)\n"
    ));
    assert!(!check_site::can_skip_live_links(
        "pull_request",
        &s(&["index.html"]),
        "+<a href=\"https://example.com\">x</a>\n"
    ));
    assert!(check_site::paragraph_structure("<p>Hello</p>").is_some());
    assert!(check_site::paragraph_structure("  ---\nmalformed").is_none());

    assert!(check_site::is_metadata_only(
        "pull_request",
        &s(&["README.md", "docs/guide.md"])
    ));
    assert!(!check_site::is_metadata_only("push", &s(&["README.md"])));
    assert!(!check_site::is_metadata_only(
        "pull_request",
        &s(&["index.html"])
    ));

    let dir = tempfile::tempdir().unwrap();
    assert!(check_site::check_metadata_excluded(dir.path()).is_ok());
    std::fs::write(dir.path().join("AGENTS.md"), "leaked").unwrap();
    assert!(check_site::check_metadata_excluded(dir.path()).is_err());

    struct FakeGit {
        result: Result<String, GitError>,
    }
    impl Git for FakeGit {
        fn run(&mut self, _args: &[&str], _timeout: bool) -> Result<String, GitError> {
            self.result.clone()
        }
    }
    let mut err_git = FakeGit {
        result: Err(GitError::Called),
    };
    assert!(!check_site::ci_offline(Some("pull_request"), &mut err_git));
    assert!(check_site::ci_offline(Some("push"), &mut err_git));
    assert!(!check_site::ci_metadata_only(
        Some("pull_request"),
        &mut err_git
    ));

    struct FakeHost {
        git: FakeGit,
        built: PathBuf,
        fail_at: Option<usize>,
        calls: usize,
        logs: Vec<String>,
    }
    impl Host for FakeHost {
        fn event(&self) -> Option<String> {
            Some("push".into())
        }
        fn git(&mut self) -> &mut dyn Git {
            &mut self.git
        }
        fn exe(&self) -> String {
            "site-tools".into()
        }
        fn build(&mut self) -> Result<PathBuf, String> {
            Ok(self.built.clone())
        }
        fn checked(&mut self, rendered: &Path) -> Result<PathBuf, String> {
            Ok(rendered.to_path_buf())
        }
        fn run(
            &mut self,
            _argv: &[String],
            _cwd: &Path,
            _checked: Option<&Path>,
        ) -> Result<i32, String> {
            let idx = self.calls;
            self.calls += 1;
            if self.fail_at == Some(idx) {
                Ok(1)
            } else {
                Ok(0)
            }
        }
        fn say(&mut self, text: &str) {
            self.logs.push(text.to_owned());
        }
    }

    let clean_site = tempfile::tempdir().unwrap();
    let mut host = FakeHost {
        git: FakeGit {
            result: Ok(String::new()),
        },
        built: clean_site.path().to_path_buf(),
        fail_at: None,
        calls: 0,
        logs: Vec::new(),
    };
    assert_eq!(
        check_site::main_with(clean_site.path(), &s(&["--help"]), &mut host).unwrap(),
        0
    );
    assert_eq!(
        check_site::main_with(clean_site.path(), &s(&["--unknown"]), &mut host).unwrap(),
        2
    );
    assert_eq!(
        check_site::main_with(clean_site.path(), &s(&["--offline"]), &mut host).unwrap(),
        0
    );
    assert!(host.calls > 10);

    host.calls = 0;
    host.fail_at = Some(0);
    assert!(check_site::main_with(clean_site.path(), &s(&["--ci"]), &mut host).is_err());
}
