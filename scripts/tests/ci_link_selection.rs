//! scripts/test_ci_link_selection.py: when CI may omit live requests without omitting
//! link-change validation.
mod common;

use common::{ScriptedGit, git, repository, write_text};
use site_tools::check_site::{GitError, SystemGit, can_skip_live_links, ci_offline};

/// Each candidate can change a rendered link, template or front matter value.
fn link_changing_merges() -> Vec<(&'static str, String, String)> {
    let mut merges: Vec<(&str, String, String)> = [
        (
            "index.html",
            r#"<a href="https://example.com/old">Source</a>"#,
            r#"<a href="https://example.com/new">Source</a>"#,
        ),
        (
            "index.html",
            "<a href=\"\nold\n\">Source</a>",
            "<a href=\"\nnew\n\">Source</a>",
        ),
        (
            "assets/site.css",
            "body { background: url(\nold\n); }",
            "body { background: url(\nnew\n); }",
        ),
        (
            "index.html",
            "---\nlayout: old\n---\n<p>Text</p>",
            "---\nlayout: new\n---\n<p>Text</p>",
        ),
        (
            "index.html",
            "<p>{{ site.old }}</p>",
            "<p>{{ site.new }}</p>",
        ),
        (
            "assets/navigation.mjs",
            r#"const path = "old";"#,
            r#"const path = "new";"#,
        ),
        (
            "index.html",
            "<p><img src=\"\nold\n\">Text</p>",
            "<p><img src=\"\nnew\n\">Text</p>",
        ),
        (
            "index.html",
            "<p>https://example.com/old</p>",
            "<p>https://example.com/new</p>",
        ),
        (
            "index.html",
            "<style>body { background: u\\72l(\nold\n); }</style>",
            "<style>body { background: u\\72l(\nnew\n); }</style>",
        ),
        (
            "index.html",
            "<style>@import \"\nold\n\";</style>",
            "<style>@import \"\nnew\n\";</style>",
        ),
        (
            "index.html",
            r#"{% capture target %}<p>old</p>{% endcapture %}<a href="{{ target }}">Link</a>"#,
            r#"{% capture target %}<p>new</p>{% endcapture %}<a href="{{ target }}">Link</a>"#,
        ),
        (
            "index.html",
            "---\nvalue: '<p>old</p>'\n---\n<p>Text</p>",
            "---\nvalue: '<p>new</p>'\n---\n<p>Text</p>",
        ),
        (
            "index.html",
            "<p><div>old</div></p>",
            "<p><div>new</div></p>",
        ),
        ("index.html", "<p>old", "<p>new"),
        (
            "index.html",
            "<template/><p>old</p>",
            "<template/><p>new</p>",
        ),
        (
            "index.html",
            r#"<script>const value = "<p>old</p>";</script>"#,
            r#"<script>const value = "<p>new</p>";</script>"#,
        ),
        (
            "index.html",
            "<textarea><p>old</p></textarea>",
            "<textarea><p>new</p></textarea>",
        ),
        (
            "index.html",
            "<template><p>old</p></template>",
            "<template><p>new</p></template>",
        ),
        (
            "index.html",
            "{% include unknown.html %}<p>old</p>",
            "{% include unknown.html %}<p>new</p>",
        ),
        (
            "index.html",
            "\u{feff}---\nvalue: '<p>old</p>'\n---\n<p>Text</p>",
            "\u{feff}---\nvalue: '<p>new</p>'\n---\n<p>Text</p>",
        ),
    ]
    .into_iter()
    .map(|(path, before, after)| (path, before.to_owned(), after.to_owned()))
    .collect();
    // Only the exact asset version expression, unchanged, is accepted.
    for (old, new) in [
        ("{{ site.asset_version }}", "{{ site.other }}"),
        ("{{ site.asset_version }}", ""),
        ("", "{{ site.asset_version }}"),
        ("{{site.asset_version}}", "{{site.asset_version}}"),
        (
            "{{ site.asset_version | escape }}",
            "{{ site.asset_version | escape }}",
        ),
        ("{{{ site.asset_version }}}", "{{{ site.asset_version }}}"),
        (
            "{{ site.asset_version }}{{ x }}",
            "{{ site.asset_version }}{{ x }}",
        ),
    ] {
        merges.push((
            "index.html",
            format!(r#"<link href="/a.css?v={old}"><p>old</p>"#),
            format!(r#"<link href="/a.css?v={new}"><p>new</p>"#),
        ));
    }
    merges
}

/// Exercise the actual merge-parent comparison without changing the checkout.
fn merge_decision(before: &str, after: &str, path: &str, other: Option<(&str, &str)>) -> bool {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let run = |args: &[&str]| git(root, args);
    run(&["init", "-q", "-b", "main"]);
    let page = root.join(path);
    std::fs::create_dir_all(page.parent().unwrap()).unwrap();
    write_text(&page, before);
    if let Some((first, _)) = other {
        write_text(&root.join("other.html"), first);
    }
    run(&["add", "."]);
    run(&["commit", "-qm", "base fixture"]);
    run(&["checkout", "-qb", "candidate"]);
    write_text(&page, after);
    if let Some((_, second)) = other {
        write_text(&root.join("other.html"), second);
    }
    run(&["add", "."]);
    run(&["commit", "-qm", "changed fixture"]);
    run(&["checkout", "-q", "main"]);
    write_text(&root.join("base-note.txt"), "Unrelated base commit");
    run(&["add", "."]);
    run(&["commit", "-qm", "advanced base fixture"]);
    run(&["merge", "--no-ff", "-qm", "merge fixture", "candidate"]);
    ci_offline(Some("pull_request"), &mut SystemGit { root })
}

#[test]
fn real_page_wording_only_merges_use_offline_checks() {
    for path in [
        "about/index.html",
        "evidence/index.html",
        "tools/index.html",
        "index.html",
    ] {
        let source = site_tools::read(&repository().join(path)).unwrap();
        // CI compares source pages; rendered pages would hide their Liquid.
        assert!(source.contains("{% include site-header.html %}"), "{path}");
        assert!(source.contains("{{ site.asset_version }}"), "{path}");
        assert!(
            source.contains("</p>") && source.contains("href="),
            "{path}"
        );
        let changed = source.replacen("</p>", " Updated wording.</p>", 1);
        assert!(merge_decision(&source, &changed, path, None), "{path}");
    }
}

#[test]
fn real_merges_that_can_change_links_keep_live_checks() {
    for (path, mut before, mut after) in link_changing_merges() {
        if path.ends_with(".html") {
            before.push_str("\n<a href=\"/unchanged\">Context</a>");
            after.push_str("\n<a href=\"/unchanged\">Context</a>");
        }
        assert!(
            !merge_decision(&before, &after, path, None),
            "{path}: {before:?}"
        );
    }
}

#[test]
fn mixed_files_require_every_change_to_be_prose() {
    assert!(merge_decision(
        "<p>old</p>",
        "<p>new</p>",
        "index.html",
        Some(("<p>first</p>", "<p>second</p>"))
    ));
    assert!(!merge_decision(
        "<p>old</p>",
        "<p>new</p>",
        "index.html",
        Some((
            "<a href=\"\nold\n\">Link</a>",
            "<a href=\"\nnew\n\">Link</a>"
        ))
    ));
}

#[test]
fn failed_diff_or_blob_reads_keep_live_checks() {
    let completed = [
        "index.html\0".to_owned(),
        " href=\"unchanged\"".to_owned(),
        "<p>old</p>".to_owned(),
    ];
    for reads in 1..=3 {
        let mut results: Vec<Result<String, GitError>> =
            completed[..reads].iter().cloned().map(Ok).collect();
        results.push(Err(GitError::Called));
        let mut git = ScriptedGit::new(results);
        assert!(!ci_offline(Some("pull_request"), &mut git), "{reads}");
    }
}

fn one(path: &str) -> Vec<String> {
    vec![path.to_owned()]
}

#[test]
fn prose_only_pull_request_uses_offline_checks() {
    assert!(can_skip_live_links(
        "pull_request",
        &one("about/index.html"),
        "+<p>Updated wording.</p>"
    ));
}

#[test]
fn changed_links_keep_live_checks() {
    for diff in [
        "+<a href=\"https://example.com/new\">Source</a>",
        "-[Source](https://example.com/old)",
        "+<a href=\"{{ site.source }}/new\">Source</a>",
        "+background: url(https://example.com/image.png)",
        "+https://example.com/new",
        " <a href=\"\n-old\n+new\n \">Source</a>",
        " background: url(\n-old\n+new\n );",
        "+{{ site.source }}",
        "+@import \"theme.css\";",
        r#"+background: u\72l("image.png");"#,
        " ---\n layout: default\n-slug: old\n+slug: new\n ---",
        "+<img src=\"//example.com/image.png\">",
    ] {
        assert!(
            !can_skip_live_links("pull_request", &one("index.html"), diff),
            "{diff:?}"
        );
    }
}

#[test]
fn dynamic_or_unknown_sources_keep_live_checks() {
    for path in [
        "scripts/build_site.py",
        "_includes/header.html",
        "_layouts/default.html",
        "_config.yml",
        "assets/navigation.mjs",
        "data/links.json",
    ] {
        assert!(
            !can_skip_live_links("pull_request", &one(path), "+changed"),
            "{path}"
        );
    }
}

#[test]
fn other_events_keep_live_checks() {
    for event in ["push", "schedule", "workflow_dispatch", ""] {
        assert!(!can_skip_live_links(event, &one("index.html"), "+wording"));
    }
}

#[test]
fn push_uses_offline_checks_and_scheduled_or_manual_runs_stay_live() {
    for (event, offline) in [
        (Some("push"), true),
        (Some("schedule"), false),
        (Some("workflow_dispatch"), false),
        (Some(""), false),
        (None, false),
    ] {
        let mut git = ScriptedGit::new(Vec::new());
        assert_eq!(ci_offline(event, &mut git), offline, "{event:?}");
        assert_eq!(git.calls, 0);
    }
}

#[test]
fn missing_merge_parent_keeps_live_checks() {
    let mut git = ScriptedGit::new(vec![Err(GitError::Called)]);
    assert!(!ci_offline(Some("pull_request"), &mut git));
}
