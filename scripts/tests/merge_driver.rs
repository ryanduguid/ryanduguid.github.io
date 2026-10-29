//! The changelog-rows merge driver: which conflicts it resolves and which it leaves.
use site_tools::merge_driver::{resolve, resolve_conflicts};
use std::process::Command;

fn row(date: &str, text: &str) -> String {
    format!("                <tr><th scope=\"row\">{date}</th><td>{text}</td></tr>\n")
}

fn lines(text: &str) -> Vec<&str> {
    text.split_inclusive('\n').collect()
}

fn entry_rotated(id: &str, date: &str) -> String {
    // A site change links to its own row's anchor, as feed.rs writes it.
    let link = format!("https://duguid.com.au/changelog/#entry-{id}");
    entry_linked(id, date, &link)
}

fn entry_linked(id: &str, date: &str, link: &str) -> String {
    // Git aligns an entry added above another one line in, after the shared "<entry>".
    format!(
        "    <title>{id}</title>\n    <link href=\"{link}\" />\n    <id>https://duguid.com.au/changelog/#entry-{id}</id>\n    <updated>{date}T00:00:00Z</updated>\n    <summary>{id}</summary>\n  </entry>\n  <entry>\n"
    )
}

fn conflict(current: &str, base: &str, incoming: &str) -> String {
    format!("<<<<<<< current\n{current}||||||| base\n{base}=======\n{incoming}>>>>>>> incoming\n")
}

#[test]
fn same_day_rows_keep_the_incoming_side_on_top() {
    let current = row("20 October 2026", "Merged first.");
    let incoming = row("20 October 2026", "Rebased pull request.");
    let resolved = resolve(&lines(&current), &[], &lines(&incoming)).unwrap();
    assert_eq!(resolved, format!("{incoming}{current}"));
}

#[test]
fn anchored_rows_merge_like_new_ones() {
    // build_feed --write gives every row an id="entry-<feed ID>" anchor.
    let anchored = |id: &str, date: &str, text: &str| {
        format!(
            "                <tr id=\"entry-{id}\"><th scope=\"row\">{date}</th><td>{text}</td></tr>\n"
        )
    };
    let current = anchored("aaaaaaaaaaaaaaaa", "20 October 2026", "Merged first.");
    let incoming = row("21 October 2026", "Rebased pull request.");
    let resolved = resolve(&lines(&current), &[], &lines(&incoming)).unwrap();
    assert_eq!(resolved, format!("{incoming}{current}"));
    let both = anchored("bbbbbbbbbbbbbbbb", "20 October 2026", "Also merged.");
    let resolved = resolve(&lines(&current), &[], &lines(&both)).unwrap();
    assert_eq!(resolved, format!("{both}{current}"));
}

#[test]
fn a_row_anchor_on_both_sides_stays_a_conflict_whatever_the_wording() {
    let anchored = |text: &str| {
        format!(
            "                <tr id=\"entry-aaaaaaaaaaaaaaaa\"><th scope=\"row\">20 October 2026</th><td>{text}</td></tr>\n"
        )
    };
    let (current, incoming) = (anchored("One wording."), anchored("Another wording."));
    assert_eq!(resolve(&lines(&current), &[], &lines(&incoming)), None);
    // The same anchor written another way, beside a data-id, is still the same row.
    let other = "                <tr data-id=\"x\" id = 'entry-aaaaaaaaaaaaaaaa'><th scope=\"row\">20 October 2026</th><td>Third wording.</td></tr>\n";
    assert_eq!(resolve(&lines(&current), &[], &lines(other)), None);
    let distinct = "                <tr data-id=\"entry-aaaaaaaaaaaaaaaa\" id=\"entry-bbbbbbbbbbbbbbbb\"><th scope=\"row\">20 October 2026</th><td>Other row.</td></tr>\n";
    assert!(resolve(&lines(&current), &[], &lines(distinct)).is_some());
}

#[test]
fn the_feed_header_takes_the_later_date_and_never_goes_back() {
    let updated = |date: &str| format!("  <updated>{date}T00:00:00Z</updated>\n");
    let (base, ours, theirs) = (
        updated("2026-10-26"),
        updated("2026-10-29"),
        updated("2026-10-30"),
    );
    let merged =
        |current: &str, incoming: &str| resolve_conflicts(&conflict(current, &base, incoming), 7);
    assert_eq!(merged(&ours, &theirs), Some(theirs.clone()));
    assert_eq!(merged(&theirs, &ours), Some(theirs.clone()));
    assert_eq!(merged(&updated("2026-10-25"), &theirs), None);
    // An entry's own <updated> is indented further and is not the header.
    let entry_line = "    <updated>2026-10-30T00:00:00Z</updated>\n";
    assert_eq!(merged(&ours, entry_line), None);
}

#[test]
fn rows_stay_newest_first_whichever_side_is_newer() {
    let current = row("20 October 2026", "Newer.");
    let incoming = row("19 October 2026", "Older.");
    let resolved = resolve(&lines(&current), &[], &lines(&incoming)).unwrap();
    assert_eq!(resolved, format!("{current}{incoming}"));
    let text = "19 October 2026 | Older.\n";
    let resolved = resolve(&["20 October 2026 | Newer.\n"], &[], &[text]).unwrap();
    assert_eq!(resolved, format!("20 October 2026 | Newer.\n{text}"));
}

#[test]
fn interleaved_dates_edits_duplicates_and_prose_stay_conflicts() {
    let both = format!(
        "{}{}",
        row("21 October 2026", "A."),
        row("19 October 2026", "B.")
    );
    let middle = row("20 October 2026", "C.");
    assert_eq!(resolve(&lines(&both), &[], &lines(&middle)), None);
    let base = row("18 October 2026", "Old.");
    let edit = row("18 October 2026", "Edited.");
    assert_eq!(resolve(&lines(&edit), &lines(&base), &lines(&middle)), None);
    let shared = format!("{middle}{}", row("20 October 2026", "D."));
    assert_eq!(resolve(&lines(&shared), &[], &lines(&middle)), None);
    assert_eq!(resolve(&["<p>One.</p>\n"], &[], &lines(&middle)), None);
}

#[test]
fn whole_feed_entries_merge_by_date_and_partial_ones_do_not() {
    let current = entry_rotated("aaaaaaaaaaaaaaaa", "2026-10-20");
    let incoming = entry_rotated("bbbbbbbbbbbbbbbb", "2026-10-21");
    let resolved = resolve(&lines(&current), &[], &lines(&incoming)).unwrap();
    assert_eq!(resolved, format!("{incoming}{current}"));
    let partial: Vec<&str> = lines(&incoming)[..5].to_vec();
    assert_eq!(resolve(&lines(&current), &[], &partial), None);
    let header = "  <updated>2026-10-21T00:00:00Z</updated>\n";
    assert_eq!(resolve(&lines(&current), &[], &[header]), None);
}

#[test]
fn feed_entries_from_both_tables_stay_conflicts() {
    // The builder puts a site change before a release of the same date, whichever
    // side added it, so only entries from one table are merged.
    let site = entry_rotated("aaaaaaaaaaaaaaaa", "2026-10-20");
    let release = entry_linked(
        "bbbbbbbbbbbbbbbb",
        "2026-10-20",
        "https://github.com/ryanduguid/example/releases/tag/v1.0.0",
    );
    assert_eq!(resolve_conflicts(&conflict(&site, "", &release), 7), None);
    // A release row without a link points at its table instead of a tag.
    let unlinked = entry_linked(
        "dddddddddddddddd",
        "2026-10-20",
        "https://duguid.com.au/changelog/#tool-releases",
    );
    assert_eq!(resolve_conflicts(&conflict(&site, "", &unlinked), 7), None);
    assert_eq!(
        resolve_conflicts(&conflict(&release, "", &unlinked), 7),
        Some(format!("{unlinked}{release}"))
    );
    let other_site = entry_rotated("cccccccccccccccc", "2026-10-20");
    assert_eq!(
        resolve_conflicts(&conflict(&site, "", &other_site), 7),
        Some(format!("{other_site}{site}"))
    );
}

#[test]
fn text_conflicts_resolve_only_on_the_changelog_page() {
    let rows = conflict(
        "20 October 2026 | Ours.\n",
        "",
        "20 October 2026 | Theirs.\n",
    );
    let page = |url: &str| format!("# Page\n\nSource: {url}\n\nDate | Change\n{rows}");
    assert_eq!(resolve_conflicts(&rows, 7), None);
    assert_eq!(
        resolve_conflicts(
            &format!("# Prologue\n{rows}Source: https://duguid.com.au/changelog/\n"),
            7
        ),
        None
    );
    assert_eq!(
        resolve_conflicts(&page("https://duguid.com.au/changelog/"), 7),
        Some(
            "# Page\n\nSource: https://duguid.com.au/changelog/\n\nDate | Change\n20 October 2026 | Theirs.\n20 October 2026 | Ours.\n"
                .to_owned()
        )
    );
    assert_eq!(
        resolve_conflicts(&page("https://duguid.com.au/rates/"), 7),
        None
    );
}

#[test]
fn incomplete_misordered_and_differently_rotated_entries_stay_conflicts() {
    let ours = entry_rotated("aaaaaaaaaaaaaaaa", "2026-10-20");
    let theirs = entry_rotated("bbbbbbbbbbbbbbbb", "2026-10-21");
    let incomplete = "  <entry>\n    <updated>2026-10-21T00:00:00Z</updated>\n  </entry>\n";
    assert_eq!(resolve(&lines(&ours), &[], &lines(incomplete)), None);
    let missing_id = theirs
        .lines()
        .filter(|l| !l.starts_with("    <id>"))
        .map(|l| format!("{l}\n"))
        .collect::<String>();
    assert_eq!(resolve(&lines(&ours), &[], &lines(&missing_id)), None);
    let mut misordered = lines(&theirs);
    misordered.swap(0, 1);
    assert_eq!(resolve(&lines(&ours), &[], &misordered), None);
    let full = format!("  <entry>\n{}", lines(&theirs)[..6].concat());
    assert_eq!(resolve(&lines(&ours), &[], &lines(&full)), None);
    let full_ours = format!("  <entry>\n{}", lines(&ours)[..6].concat());
    assert_eq!(
        resolve(&lines(&full_ours), &[], &lines(&full)),
        Some(format!("{full}{full_ours}"))
    );
    let invalid_xml = theirs.replace("<summary>", "<summary><unclosed>");
    assert_eq!(resolve(&lines(&ours), &[], &lines(&invalid_xml)), None);
}

#[test]
fn malformed_conflicts_and_marker_like_lines_are_left_to_git() {
    let ours = row("20 October 2026", "Ours.");
    let theirs = row("20 October 2026", "Theirs.");
    // No base section, a missing end and a nested start are not Git's diff3 output.
    let no_base = format!("<<<<<<< current\n{ours}=======\n{theirs}>>>>>>> incoming\n");
    assert_eq!(resolve_conflicts(&no_base, 7), None);
    let unfinished = format!("<<<<<<< current\n{ours}||||||| base\n=======\n{theirs}");
    assert_eq!(resolve_conflicts(&unfinished, 7), None);
    let nested = conflict(&ours, "", &format!("<<<<<<< x\n{theirs}"));
    assert_eq!(resolve_conflicts(&nested, 7), None);
    assert!(site_tools::merge_driver::holds_markers(
        &format!("text\n{} quoted\n", ">".repeat(40)),
        40
    ));
    assert!(!site_tools::merge_driver::holds_markers(
        &format!("{}x\n", "=".repeat(40)),
        40
    ));
}

#[test]
fn one_unresolvable_hunk_leaves_the_whole_file_to_git() {
    let rows = format!(
        "<<<<<<< current\n{}||||||| base\n=======\n{}>>>>>>> incoming\n",
        row("20 October 2026", "Ours."),
        row("20 October 2026", "Theirs.")
    );
    let prose =
        "<<<<<<< current\n<p>A</p>\n||||||| base\n<p>O</p>\n=======\n<p>B</p>\n>>>>>>> incoming\n";
    assert_eq!(
        resolve_conflicts(&format!("<tbody>\n{rows}</tbody>\n"), 7),
        Some(format!(
            "<tbody>\n{}{}</tbody>\n",
            row("20 October 2026", "Theirs."),
            row("20 October 2026", "Ours.")
        ))
    );
    assert_eq!(
        resolve_conflicts(&format!("<tbody>\n{rows}kept\n{prose}"), 7),
        None
    );
}

#[test]
fn command_merges_in_place_or_leaves_the_file_to_git() {
    let dir = tempfile::tempdir().unwrap();
    let write = |name: &str, text: &str| {
        let path = dir.path().join(name);
        std::fs::write(&path, text).unwrap();
        path.to_string_lossy().into_owned()
    };
    let old = row("17 October 2026", "Old.");
    let base = write("base", &format!("<tbody>\n{old}</tbody>\n"));
    let ours = row("20 October 2026", "Ours.");
    let theirs = row("20 October 2026", "Theirs.");
    let current = write("current", &format!("<tbody>\n{ours}{old}</tbody>\n"));
    let incoming = write("incoming", &format!("<tbody>\n{theirs}{old}</tbody>\n"));
    let tools = env!("CARGO_BIN_EXE_site-tools");
    let status = Command::new(tools)
        .args(["merge_driver", &base, &current, &incoming])
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(0));
    let merged = std::fs::read_to_string(&current).unwrap();
    assert_eq!(merged, format!("<tbody>\n{theirs}{ours}{old}</tbody>\n"));

    let edited = format!("<tbody>\n{}</tbody>\n", row("17 October 2026", "A."));
    let current = write("current", &edited);
    let incoming = write(
        "incoming",
        &format!("<tbody>\n{}</tbody>\n", row("17 October 2026", "B.")),
    );
    let status = Command::new(tools)
        .args(["merge_driver", &base, &current, &incoming])
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(1));
    assert_eq!(std::fs::read_to_string(&current).unwrap(), edited);

    // A resolvable conflict beside a line that reads as the driver's own marker.
    let marker_like = format!("<tbody>\n{ours}{old}</tbody>\n{} x\n", ">".repeat(40));
    let current = write("current", &marker_like);
    let incoming = write(
        "incoming",
        &format!("<tbody>\n{theirs}{old}</tbody>\n{} x\n", ">".repeat(40)),
    );
    let status = Command::new(tools)
        .args(["merge_driver", &base, &current, &incoming])
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(1));
    assert_eq!(std::fs::read_to_string(&current).unwrap(), marker_like);
}

#[test]
fn a_real_git_merge_preserves_all_four_builder_outputs_with_lf_and_crlf() {
    use site_tools::{feed, llms_full};
    for newline in ["\n", "\r\n"] {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let git = |args: &[&str]| {
            let out = Command::new("git")
                .args(args)
                .current_dir(root)
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "{args:?}: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            out
        };
        git(&["init", "-q"]);
        git(&["config", "user.name", "Test"]);
        git(&["config", "user.email", "test@example.invalid"]);
        git(&["config", "core.autocrlf", "false"]);
        let binary = env!("CARGO_BIN_EXE_site-tools").replace('\\', "/");
        git(&[
            "config",
            "merge.changelog-rows.driver",
            &format!("\"{binary}\" merge_driver %O %A %B || git merge-file %A %O %B"),
        ]);
        std::fs::write(
            root.join(".gitattributes"),
            "*.html merge=changelog-rows\n*.txt merge=changelog-rows\n*.xml merge=changelog-rows\n",
        )
        .unwrap();
        let old = row("20 October 2026", "Already published.");
        let ours = row("20 October 2026", "Current addition.");
        let theirs = row("20 October 2026", "Incoming addition.");
        let outputs = |rows: &str| {
            let html = format!(
                "<html><body><main><h1>Changelog</h1><table><tbody>\n{rows}</tbody></table></main></body></html>\n"
            );
            let text = format!(
                "# Changelog\n\nSource: {}\n\n{}\n",
                feed::CHANGELOG_URL,
                llms_full::main_text(&html, feed::CHANGELOG_URL).unwrap()
            );
            [
                ("changelog.html", html.clone()),
                ("changelog.txt", text.clone()),
                (
                    "llms-full.txt",
                    llms_full::full_text(&[(feed::CHANGELOG_URL.into(), text)]),
                ),
                ("feed.xml", feed::build(&html).unwrap()),
            ]
            .map(|(name, text)| (name, text.replace('\n', newline)))
        };
        let write = |rows: &str| {
            for (name, text) in outputs(rows) {
                std::fs::write(root.join(name), text).unwrap();
            }
        };
        write(&old);
        git(&["add", "."]);
        git(&["commit", "-qm", "base"]);
        git(&["branch", "incoming"]);
        write(&format!("{ours}{old}"));
        git(&["commit", "-qam", "current"]);
        git(&["checkout", "-q", "incoming"]);
        write(&format!("{theirs}{old}"));
        git(&["commit", "-qam", "incoming"]);
        git(&["checkout", "-q", "-"]);
        git(&["merge", "--no-edit", "incoming"]);
        for (name, expected) in outputs(&format!("{theirs}{ours}{old}")) {
            let actual = std::fs::read_to_string(root.join(name)).unwrap();
            assert_eq!(actual, expected, "{name}, newline {newline:?}");
            assert_eq!(
                actual.matches("Current addition.").count(),
                if name == "feed.xml" { 2 } else { 1 }
            );
            assert_eq!(
                actual.matches("Incoming addition.").count(),
                if name == "feed.xml" { 2 } else { 1 }
            );
        }
    }
}

#[test]
fn every_committed_file_holding_changelog_rows_uses_the_driver() {
    // build_llms_full also writes each section to llms-full-<section>-<n>.txt; a
    // part holding the changelog page conflicts like llms-full.txt does.
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let source = "Source: https://duguid.com.au/changelog/\n";
    let mut files = vec![
        "changelog/index.html".to_owned(),
        "changelog/index.txt".to_owned(),
        "feed.xml".to_owned(),
    ];
    for entry in std::fs::read_dir(&root).unwrap() {
        let name = entry.unwrap().file_name().into_string().unwrap();
        if name.starts_with("llms-full")
            && name.ends_with(".txt")
            && std::fs::read_to_string(root.join(&name))
                .unwrap()
                .replace("\r\n", "\n")
                .contains(source)
        {
            files.push(name);
        }
    }
    assert!(files.iter().any(|f| f == "llms-full.txt"), "{files:?}");
    assert!(
        files.len() > 4,
        "no llms-full part holds the changelog: {files:?}"
    );
    let out = Command::new("git")
        .args(["check-attr", "merge", "--"])
        .args(&files)
        .current_dir(&root)
        .output()
        .unwrap();
    assert!(out.status.success());
    let text = String::from_utf8(out.stdout).unwrap();
    for file in &files {
        assert!(
            text.contains(&format!("{file}: merge: changelog-rows\n")),
            "{file} is not assigned to the changelog-rows driver:\n{text}"
        );
    }
}

#[test]
fn a_real_mixed_table_feed_conflict_falls_back_to_git_markers() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let git = |args: &[&str]| {
        Command::new("git")
            .args(args)
            .current_dir(root)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .output()
            .unwrap()
    };
    for args in [
        vec!["init", "-q"],
        vec!["config", "user.name", "Test"],
        vec!["config", "user.email", "test@example.invalid"],
        vec!["config", "core.autocrlf", "false"],
    ] {
        assert!(git(&args).status.success());
    }
    let binary = env!("CARGO_BIN_EXE_site-tools").replace('\\', "/");
    assert!(
        git(&[
            "config",
            "merge.changelog-rows.driver",
            &format!("\"{binary}\" merge_driver %O %A %B || git merge-file %A %O %B")
        ])
        .status
        .success()
    );
    std::fs::write(
        root.join(".gitattributes"),
        "feed.xml merge=changelog-rows\n",
    )
    .unwrap();
    let old = entry_rotated("old", "2026-10-19");
    let doc = |entries: &str| format!("<feed>\n  <entry>\n{entries}</feed>\n");
    std::fs::write(root.join("feed.xml"), doc(&old)).unwrap();
    assert!(git(&["add", "."]).status.success());
    assert!(git(&["commit", "-qm", "base"]).status.success());
    assert!(git(&["branch", "incoming"]).status.success());
    let ours = entry_rotated("ours", "2026-10-20");
    std::fs::write(root.join("feed.xml"), doc(&format!("{ours}{old}"))).unwrap();
    assert!(git(&["commit", "-qam", "current"]).status.success());
    assert!(git(&["checkout", "-q", "incoming"]).status.success());
    let theirs = entry_linked(
        "theirs",
        "2026-10-20",
        "https://github.com/ryanduguid/example/releases/tag/v1.0.0",
    );
    std::fs::write(root.join("feed.xml"), doc(&format!("{theirs}{old}"))).unwrap();
    assert!(git(&["commit", "-qam", "incoming"]).status.success());
    assert!(git(&["checkout", "-q", "-"]).status.success());
    assert_eq!(
        git(&["merge", "--no-edit", "incoming"]).status.code(),
        Some(1)
    );
    let text = std::fs::read_to_string(root.join("feed.xml")).unwrap();
    assert!(text.contains("<<<<<<<"));
    assert!(text.contains("=======") && text.contains(">>>>>>>"));
    assert!(text.contains("ours") && text.contains("theirs"));
    assert!(!git(&["ls-files", "-u"]).stdout.is_empty());
}

#[cfg(windows)]
#[test]
fn a_locked_replacement_preserves_current_bytes_before_git_fallback() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = tempfile::tempdir().unwrap();
    let old = row("19 October 2026", "Old.");
    let ours = format!(
        "<tbody>\n{}{old}</tbody>\n",
        row("20 October 2026", "Ours.")
    );
    let theirs = format!(
        "<tbody>\n{}{old}</tbody>\n",
        row("20 October 2026", "Theirs.")
    );
    let [base, current, incoming] =
        ["base", "current", "incoming"].map(|name| dir.path().join(name));
    std::fs::write(&base, format!("<tbody>\n{old}</tbody>\n")).unwrap();
    std::fs::write(&current, &ours).unwrap();
    std::fs::write(&incoming, &theirs).unwrap();
    // Permit readers but deny replacement while the existing file is open.
    let lock = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&current)
        .unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .arg("merge_driver")
        .args([&base, &current, &incoming])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(std::fs::read(&current).unwrap(), ours.as_bytes());
    drop(lock);
    let fallback = Command::new("git")
        .arg("merge-file")
        .args([&current, &base, &incoming])
        .output()
        .unwrap();
    assert_eq!(fallback.status.code(), Some(1));
    let text = std::fs::read_to_string(&current).unwrap();
    assert!(text.contains("<<<<<<<") && text.contains("=======") && text.contains(">>>>>>>"));
    assert!(text.contains("Ours.") && text.contains("Theirs."));
}
