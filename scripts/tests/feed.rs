//! scripts/test_feed.py and the fuzz harness's checks, plus the build_feed command line.
use site_tools::feed::{self, CHANGELOG_URL};
use std::path::{Path, PathBuf};
use std::process::Command;

const ATOM: &str = "http://www.w3.org/2005/Atom";

fn site() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

/// Entry ID to title, read back from the built feed as XML.
fn feed_entries(source: &str) -> Vec<(String, String)> {
    let built = feed::build(source).unwrap();
    let tree = roxmltree::Document::parse(&built).unwrap();
    tree.root_element()
        .children()
        .filter(|n| n.has_tag_name((ATOM, "entry")))
        .map(|entry| {
            let text = |name| {
                entry
                    .children()
                    .find(|n| n.has_tag_name((ATOM, name)))
                    .and_then(|n| n.text())
                    .unwrap_or("")
                    .to_owned()
            };
            (text("id"), text("title"))
        })
        .collect()
}

fn refusal(source: &str) -> String {
    feed::build(source).unwrap_err()
}

#[test]
fn edit_keeps_published_identity_when_rows_move() {
    let original = "<tr><td>31 August 2026</td><td>An open-source index.</td></tr>";
    let identifier = feed_entries(original)[0].0.clone();
    let digest = identifier.rsplit_once("entry-").unwrap().1;
    let edited = format!(
        "<tr data-feed-id=\"{digest}\"><td>31 August 2026</td><td>An open source index.</td></tr>"
    );
    let newer = "<tr><td>22 September 2026</td><td>A new entry.</td></tr>";
    for source in [format!("{edited}{newer}"), format!("{newer}{edited}")] {
        let result = feed_entries(&source);
        assert_eq!(result.len(), 2, "{source}");
        let title = &result.iter().find(|(id, _)| *id == identifier).unwrap().1;
        assert_eq!(title, "An open source index.");
    }
}

#[test]
fn site_entries_link_to_their_own_row() {
    let source = concat!(
        "<tr><td>22 September 2026</td><td>A site change.</td></tr>",
        "<tr data-feed-id=\"0123456789abcdef\"><td>1 May 2026</td><td>Older.</td></tr>",
        "<tr><td>1 May 2026</td><td>Tool</td><td><a href=\"https://example.test/v1\">v1</a></td></tr>",
    );
    let with_anchors = feed::anchored(source).unwrap();
    assert!(
        with_anchors.contains(
            "<tr id=\"entry-0123456789abcdef\" data-feed-id=\"0123456789abcdef\"><td>1 May 2026"
        ),
        "{with_anchors}"
    );
    assert_eq!(feed::anchored(&with_anchors).unwrap(), with_anchors);
    for entry in feed::entries(&with_anchors).unwrap() {
        let row_id = format!("id=\"entry-{}\"", entry.id);
        assert!(with_anchors.contains(&row_id), "{row_id}");
        if entry.title == "Tool v1" {
            assert_eq!(entry.link, "https://example.test/v1");
        } else {
            assert_eq!(entry.link, format!("{CHANGELOG_URL}#entry-{}", entry.id));
        }
    }
    // A hand-written id that is not the row's feed anchor is refused.
    let wrong = "<tr id='x'><td>1 May 2026</td><td>Copy</td></tr>";
    assert!(refusal(wrong).contains("row's id must be entry-"));
}

#[test]
fn a_build_that_drops_a_published_id_is_refused() {
    let published = feed::anchored("<tr><td>28 August 2026</td><td>Redesign.</td></tr>").unwrap();
    let committed = feed::build(&published).unwrap();
    assert_eq!(feed::check_published_ids(&committed, &committed), Ok(()));
    let id = feed_entries(&published)[0].0.clone();
    let digest = id.rsplit_once("entry-").unwrap().1;
    let edited = published.replace(digest, "0123456789abcdef");
    assert_eq!(
        feed::check_published_ids(&committed, &feed::build(&edited).unwrap()),
        Err(format!(
            "changelog: published feed ID {id} is gone; restore its row's anchor, or remove its feed.xml entry if the row was deliberately deleted"
        ))
    );
}

#[test]
fn a_reworded_row_keeps_the_id_its_anchor_holds() {
    let published =
        feed::anchored("<tr><td>28 August 2026</td><td>True-black redesign.</td></tr>").unwrap();
    let reworded = published.replace("True-black", "True black");
    assert_eq!(feed::anchored(&reworded).unwrap(), reworded);
    assert_eq!(
        feed_entries(&reworded),
        vec![(
            feed_entries(&published)[0].0.clone(),
            "True black redesign.".to_owned()
        )]
    );
    let disagreeing = "<tr id=\"entry-0123456789abcdef\" data-feed-id=\"fedcba9876543210\"><td>1 May 2026</td><td>Copy</td></tr>";
    assert_eq!(
        refusal(disagreeing),
        "changelog: the 2026-05-01 row's data-feed-id fedcba9876543210 and id entry-0123456789abcdef disagree; keep the published ID in both"
    );
}

#[test]
fn duplicate_ids_are_rejected() {
    let row = r#"<tr data-feed-id="0123456789abcdef"><td>22 September 2026</td><td>Copy</td></tr>"#;
    let source = format!("{row}{}", row.replace("Copy", "Different copy"));
    assert!(refusal(&source).contains("duplicate feed ID"));
}

#[test]
fn explicit_ids_accept_both_quote_styles() {
    for quote in ['"', '\''] {
        let result = feed_entries(&format!(
            "<tr data-feed-id = {quote}0123456789abcdef{quote}><td>22 September 2026</td><td>Copy</td></tr>"
        ));
        let expected = format!("{CHANGELOG_URL}#entry-0123456789abcdef");
        assert!(result.iter().any(|(id, _)| *id == expected), "{quote}");
    }
}

#[test]
fn invalid_ids_are_rejected() {
    for attributes in [
        r#"data-feed-id="""#,
        r#"data-feed-id="wrong""#,
        "data-feed-id='abc'",
    ] {
        let source = format!("<tr {attributes}><td>22 September 2026</td><td>Copy</td></tr>");
        assert!(
            refusal(&source).contains("data-feed-id must be"),
            "{attributes}"
        );
    }
}

#[test]
fn a_release_link_with_a_quote_stays_well_formed() {
    let built = feed::build(
        r#"<tr><th scope="row">1 May 2026</th><td>Tool</td><td><a href="https://example.test/?q=&quot;v1&quot;">v1</a></td></tr>"#,
    )
    .unwrap();
    let tree = roxmltree::Document::parse(&built).unwrap();
    let link = tree
        .descendants()
        .find(|n| {
            n.has_tag_name((ATOM, "link"))
                && n.parent_element().unwrap().has_tag_name((ATOM, "entry"))
        })
        .unwrap();
    assert_eq!(
        link.attribute("href"),
        Some(r#"https://example.test/?q="v1""#)
    );
}

#[test]
fn a_control_character_is_refused() {
    assert!(refusal("<tr><td>1 May 2026</td><td>Copy\x00</td></tr>").contains("control character"));
}

#[test]
fn an_unreadable_date_names_the_cell() {
    for cell in [
        "soon",
        "31 Smarch 2026",
        "31 February 2026",
        "1 May 99999999999999999999",
    ] {
        assert_eq!(
            refusal(&format!("<tr><td>{cell}</td><td>Copy</td></tr>")),
            format!("changelog: unreadable date '{cell}'")
        );
    }
}

#[test]
fn the_fuzz_seed_corpus_replays_cleanly() {
    let corpus = site().join("scripts/fuzz-corpus/feed");
    let mut seeds: Vec<_> = std::fs::read_dir(corpus)
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    seeds.sort();
    assert!(!seeds.is_empty());
    for seed in seeds {
        feed::fuzz_check(&std::fs::read(&seed).unwrap())
            .unwrap_or_else(|e| panic!("{seed:?}: {e}"));
    }
}

#[test]
fn the_fuzz_check_rejects_a_refusal_naming_no_changelog() {
    assert_eq!(
        feed::check_outcome(Err("other".into())),
        Err("unexpected refusal \"other\"".into())
    );
    assert!(
        feed::check_outcome(Ok("<feed".into()))
            .unwrap_err()
            .starts_with("built a malformed feed")
    );
}

#[test]
fn long_titles_end_on_a_whole_word_and_keep_their_ids() {
    let summary = "The Evidence page links the supplier information each component that works with an AI register needs.";
    let result = feed_entries(&format!(
        "<tr><td>29 September 2026</td><td>{summary}</td></tr>"
    ));
    assert_eq!(result.len(), 1);
    let (identifier, title) = &result[0];
    assert_eq!(
        title,
        "The Evidence page links the supplier information each component that works with\u{2026}"
    );
    let launch_title = format!("{}...", summary[..77].trim_end());
    let digest = &site_tools::sha256(format!("2026-09-29|{launch_title}"))[..16];
    assert_eq!(*identifier, format!("{CHANGELOG_URL}#entry-{digest}"));
}

#[test]
fn a_first_word_too_long_for_the_title_is_cut() {
    let cut = format!("{}\u{2026}", "x".repeat(79));
    assert_eq!(feed::headline(&format!("{} next", "x".repeat(79))), cut);
    assert_eq!(feed::headline(&format!("{} next", "x".repeat(80))), cut);
    assert_eq!(feed::headline(&"x".repeat(81)), cut);
}

#[test]
fn edited_site_entries_retain_their_original_ids() {
    let source = site_tools::read(&site().join("changelog/index.html")).unwrap();
    let result = feed_entries(&source);
    for digest in ["3218d72411b9fdd7", "eb0f892af8afe17a"] {
        let expected = format!("{CHANGELOG_URL}#entry-{digest}");
        assert!(result.iter().any(|(id, _)| *id == expected), "{digest}");
    }
}

#[test]
fn python_whitespace_and_word_boundaries_apply() {
    // str.isspace counts U+001C..U+001F; Unicode White_Space does not.
    let result = feed_entries(
        "<tr data-feed-id\x1c=\x1f'0123456789abcdef'><td>1 May 2026</td><td>Copy</td></tr>",
    );
    assert_eq!(
        result[0].0,
        format!("{CHANGELOG_URL}#entry-0123456789abcdef")
    );
    // A combining mark is not alphanumeric to Python, so "<tr" still ends a word before it.
    assert_eq!(
        feed_entries("<tr\u{301}><td>1 May 2026</td><td>Copy</td></tr>").len(),
        1
    );
}

const OZZIT_ROW: &str = "<tr><td>19 October 2026</td><td>Ozzit</td><td><a href=\"https://example.test/v3.5.0\">v3.5.0</a></td></tr>";
const OZZIT_LISTED: &str = "<section aria-labelledby=\"tool-releases\"><table><tr><td>19 October 2026</td><td>Ozzit</td><td><a href=\"https://example.test/v3.5.0\">v3.5.0</a></td></tr></table></section>";
const OZZIT_RELEASE: &str = r#"{
  "ozzit": {"tag": "v3.5.0", "date": "2026-10-19", "url": "https://example.test/v3.5.0"},
  "coal-lsl-levy": {"version": "9218822", "date": "2026-10-19", "url": "https://example.test/commit/9218822"}
}"#;
const NO_OZZIT_ROW: &str = "changelog: Tool releases has no 19 October 2026 row linking v3.5.0 (ozzit in _data/tool_releases.json); add one";

#[test]
fn every_tagged_release_needs_a_row_on_its_date() {
    // The untagged source revision needs no row.
    assert_eq!(
        feed::check_release_rows(OZZIT_LISTED, OZZIT_RELEASE),
        Ok(())
    );
    let site_row = "<tr><td>19 October 2026</td><td>Ozzit v3.5.0 is out.</td></tr>";
    let a_day_late = OZZIT_LISTED.replace("19 October", "20 October");
    // A matching row outside the Tool releases section does not count.
    let outside = format!(
        "<section aria-labelledby=\"site-changes\"><table>{OZZIT_ROW}</table></section>\
         <section aria-labelledby=\"tool-releases\"><table></table></section>"
    );
    for source in [site_row, &a_day_late, OZZIT_ROW, &outside] {
        assert_eq!(
            feed::check_release_rows(source, OZZIT_RELEASE),
            Err(NO_OZZIT_ROW.into()),
            "{source}"
        );
    }
    // Every missing release is named, not only the first.
    let two = r#"{
      "ozzit": {"tag": "v3.5.0", "date": "2026-10-19", "url": "https://example.test/v3.5.0"},
      "wip": {"tag": "wip/v0.2.0", "date": "2026-10-19", "url": "https://example.test/wip/v0.2.0"}
    }"#;
    assert_eq!(
        feed::check_release_rows(site_row, two),
        Err(format!(
            "{NO_OZZIT_ROW}\nchangelog: Tool releases has no 19 October 2026 row linking wip/v0.2.0 (wip in _data/tool_releases.json); add one"
        ))
    );
    for (releases, refusal) in [
        (
            r#"{"ozzit": {"tag": "v3.5.0", "url": "https://example.test/v3.5.0"}}"#,
            "_data/tool_releases.json: ozzit has no date",
        ),
        (
            r#"{"ozzit": {"tag": "v3.5.0", "date": "19 October 2026", "url": "u"}}"#,
            "_data/tool_releases.json: ozzit has an unreadable date",
        ),
        (
            "[]",
            "_data/tool_releases.json: expected an object of releases",
        ),
        // Malformed records are refused, not skipped as untagged.
        (
            r#"{"ozzit": null}"#,
            "_data/tool_releases.json: ozzit is not an object",
        ),
        (
            r#"{"coal-lsl-levy": {"date": "2026-10-19"}}"#,
            "_data/tool_releases.json: coal-lsl-levy has no url",
        ),
        (
            r#"{"ozzit": {"date": "2026-10-19", "url": "https://example.test/releases/tag/v3.6.0"}}"#,
            "_data/tool_releases.json: ozzit has no tag",
        ),
        (
            r#"{"coal-lsl-levy": {"date": "2026-10-19", "url": ""}}"#,
            "_data/tool_releases.json: coal-lsl-levy has no url",
        ),
        (
            r#"{"ozzit": {"tag": "", "date": "2026-10-19", "url": "https://example.test/v3.5.0"}}"#,
            "_data/tool_releases.json: ozzit has no tag",
        ),
    ] {
        assert_eq!(
            feed::check_release_rows(OZZIT_LISTED, releases),
            Err(refusal.into())
        );
    }
}

fn run(root: &Path, args: &[&str]) -> (Option<i32>, String, String) {
    let output = Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .arg("build_feed")
        .args(args)
        .env("SITE_ROOT", root)
        .output()
        .unwrap();
    let text = |b: &[u8]| String::from_utf8(b.to_vec()).unwrap();
    (
        output.status.code(),
        text(&output.stdout),
        text(&output.stderr),
    )
}

fn eol(text: &str) -> String {
    if cfg!(windows) {
        text.replace('\n', "\r\n")
    } else {
        text.to_owned()
    }
}

#[test]
fn command_writes_checks_and_explains_like_the_script() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("changelog")).unwrap();
    std::fs::create_dir(root.path().join("_data")).unwrap();
    std::fs::write(root.path().join("_data/tool_releases.json"), "{}").unwrap();
    std::fs::write(
        root.path().join("changelog/index.html"),
        "<tr><td>1 May 2026</td><td>Copy</td></tr>\r\n",
    )
    .unwrap();
    // A failed feed write leaves the changelog unanchored, so the next build can recover.
    std::fs::create_dir(root.path().join("feed.xml")).unwrap();
    assert_eq!(run(root.path(), &["--write"]).0, Some(1));
    assert_eq!(
        std::fs::read_to_string(root.path().join("changelog/index.html")).unwrap(),
        "<tr><td>1 May 2026</td><td>Copy</td></tr>\r\n"
    );
    std::fs::remove_dir(root.path().join("feed.xml")).unwrap();
    assert_eq!(
        run(root.path(), &["--check"]),
        (
            Some(1),
            eol("changelog rows lack entry anchors: run site-tools build_feed --write\n"),
            String::new()
        )
    );
    assert_eq!(
        run(root.path(), &["--write", "--check"]),
        (Some(0), eol("wrote feed.xml\n"), String::new())
    );
    let changelog = std::fs::read_to_string(root.path().join("changelog/index.html")).unwrap();
    assert!(changelog.starts_with("<tr id=\"entry-"), "{changelog}");
    // Like feed.xml, the rewritten changelog is read in text mode and written with LF.
    assert!(changelog.ends_with("<td>Copy</td></tr>\n"), "{changelog}");
    let published = std::fs::read_to_string(root.path().join("feed.xml")).unwrap();
    // Once rows are anchored, a missing feed cannot be rebuilt past the published-ID check.
    std::fs::remove_file(root.path().join("feed.xml")).unwrap();
    for mode in ["--check", "--write"] {
        assert_eq!(
            run(root.path(), &[mode]),
            (
                Some(1),
                String::new(),
                eol(
                    "feed.xml is missing but the changelog's rows are published: restore it from Git\n"
                )
            ),
            "{mode}"
        );
    }
    assert!(!root.path().join("feed.xml").exists());
    std::fs::write(
        root.path().join("feed.xml"),
        published.replace("<title>Copy</title>", "<title>Old copy</title>"),
    )
    .unwrap();
    assert_eq!(
        run(root.path(), &["--check"]),
        (
            Some(1),
            eol("feed.xml is stale: run site-tools build_feed --write\n"),
            String::new()
        )
    );
    assert_eq!(run(root.path(), &["--write"]).0, Some(0));
    let written = std::fs::read(root.path().join("feed.xml")).unwrap();
    assert!(!written.contains(&b'\r'));
    // Python's text-mode read translates CRLF, so a CRLF checkout is still current.
    std::fs::write(
        root.path().join("feed.xml"),
        String::from_utf8(written).unwrap().replace('\n', "\r\n"),
    )
    .unwrap();
    assert_eq!(
        run(root.path(), &["--check"]),
        (Some(0), eol("feed.xml is current\n"), String::new())
    );
    let (code, stdout, stderr) = run(root.path(), &[]);
    assert_eq!((code, stderr), (Some(2), String::new()));
    assert_eq!(stdout, eol(&format!("{}\n", feed::DOC)));
    std::fs::write(root.path().join("_data/tool_releases.json"), OZZIT_RELEASE).unwrap();
    for mode in ["--check", "--write"] {
        assert_eq!(
            run(root.path(), &[mode]),
            (Some(1), String::new(), eol(&format!("{NO_OZZIT_ROW}\n"))),
            "{mode}"
        );
    }
    assert!(
        !std::fs::read_to_string(root.path().join("changelog/index.html"))
            .unwrap()
            .contains("v3.5.0"),
        "--write must not add the release row"
    );
    std::fs::write(
        root.path().join("changelog/index.html"),
        "<tr><td>soon</td><td>Copy</td></tr>",
    )
    .unwrap();
    assert_eq!(
        run(root.path(), &["--write"]),
        (
            Some(1),
            String::new(),
            eol("changelog: unreadable date 'soon'\n")
        )
    );
}
