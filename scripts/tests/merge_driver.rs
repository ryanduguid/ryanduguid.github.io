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
    entry_linked(id, date, "https://duguid.com.au/changelog/#site-changes")
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
