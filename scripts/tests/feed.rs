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
    std::fs::write(
        root.path().join("changelog/index.html"),
        "<tr><td>1 May 2026</td><td>Copy</td></tr>\r\n",
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
    assert_eq!(
        run(root.path(), &["--write", "--check"]),
        (Some(0), eol("wrote feed.xml\n"), String::new())
    );
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
