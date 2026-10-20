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
    // Git aligns an entry added above another one line in, after the shared "<entry>".
    format!(
        "    <title>{id}</title>\n    <link href=\"https://duguid.com.au/changelog/#site-changes\" />\n    <id>https://duguid.com.au/changelog/#entry-{id}</id>\n    <updated>{date}T00:00:00Z</updated>\n    <summary>{id}</summary>\n  </entry>\n  <entry>\n"
    )
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
fn only_resolvable_hunks_lose_their_markers() {
    let merged = format!(
        "<tbody>\n<<<<<<< current\n{}||||||| base\n=======\n{}>>>>>>> incoming\nkept\n<<<<<<< current\n<p>A</p>\n||||||| base\n<p>O</p>\n=======\n<p>B</p>\n>>>>>>> incoming\n",
        row("20 October 2026", "Ours."),
        row("20 October 2026", "Theirs.")
    );
    let (text, left) = resolve_conflicts(&merged, 7);
    assert_eq!(left, 1);
    assert!(text.starts_with(&format!(
        "<tbody>\n{}{}kept\n<<<<<<< current\n",
        row("20 October 2026", "Theirs."),
        row("20 October 2026", "Ours.")
    )));
}

#[test]
fn command_merges_in_place_and_reports_what_is_left() {
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
        .args(["merge_driver", &base, &current, &incoming, "7"])
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(0));
    let merged = std::fs::read_to_string(&current).unwrap();
    assert_eq!(merged, format!("<tbody>\n{theirs}{ours}{old}</tbody>\n"));

    let current = write(
        "current",
        &format!("<tbody>\n{}</tbody>\n", row("17 October 2026", "A.")),
    );
    let incoming = write(
        "incoming",
        &format!("<tbody>\n{}</tbody>\n", row("17 October 2026", "B.")),
    );
    let status = Command::new(tools)
        .args(["merge_driver", &base, &current, &incoming, "7"])
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(1));
    assert!(
        std::fs::read_to_string(&current)
            .unwrap()
            .contains("<<<<<<< current\n")
    );
}
