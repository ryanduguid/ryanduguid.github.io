// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! `node`: the whitespace JavaScript's `\s` matches, a slice through a surrogate pair,
//! `spawnSync`'s timeout and `path.resolve` on `.` components.
use site_tools::node::{self, Ended};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Every character `\s` matches is space, including each of the U+2000 to U+200A run,
/// and the characters just outside that run are not.
#[test]
fn is_space_matches_what_javascript_whitespace_matches() {
    let spaces = "\t\n\u{0B}\u{0C}\r \u{A0}\u{1680}\u{2000}\u{2005}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}";
    let unmatched: Vec<char> = spaces.chars().filter(|c| !node::is_space(*c)).collect();
    assert!(unmatched.is_empty(), "not space: {unmatched:?}");
    for other in ['\u{1FFF}', '\u{200B}', 'a', '\u{85}'] {
        assert!(
            !node::is_space(other),
            "{other:?} is not space in JavaScript"
        );
    }
    assert_eq!(node::trim(&format!("{spaces}x{spaces}")), "x");
}

/// Cutting inside a surrogate pair keeps half a pair, which Node writes as U+FFFD.
#[test]
fn slice_through_a_surrogate_pair_leaves_a_replacement_character() {
    assert_eq!(node::slice("a😀b", 2), "a\u{FFFD}");
    assert_eq!(node::slice("😀", 1), "\u{FFFD}");
    assert_eq!(node::slice("😀", 0), "");
}

/// A child still running at the timeout is killed, and the run ends as timed out well
/// before the child would have finished.
#[test]
fn capture_kills_a_child_at_its_timeout() {
    let mut command = if cfg!(windows) {
        let mut ping = Command::new("ping");
        ping.args(["-n", "30", "127.0.0.1"]);
        ping
    } else {
        let mut sleep = Command::new("sleep");
        sleep.arg("30");
        sleep
    };
    let child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let started = Instant::now();
    let (ended, _out, _err) = node::capture(child, Some(Duration::from_millis(200)));
    assert!(matches!(ended, Ended::TimedOut), "{ended:?}");
    assert!(
        started.elapsed() < Duration::from_secs(20),
        "the child was not killed at the timeout"
    );
}

/// `.` components anywhere in the path add nothing to the resolved path.
#[test]
fn resolve_drops_current_directory_components() {
    let cwd = std::env::current_dir().unwrap();
    assert_eq!(
        node::resolve(Path::new("./a/./b/.")),
        cwd.join("a").join("b")
    );
    assert_eq!(node::resolve(Path::new(".")), cwd);
}
