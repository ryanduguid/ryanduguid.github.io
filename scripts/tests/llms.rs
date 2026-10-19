//! scripts/test_contracts.py's llms-full tests: extraction, citations and the index copy.
mod common;

use common::{copied_site, rendered};
use site_tools::llms_full::main_text;
use std::path::Path;
use std::process::Command;

const SITE: &str = "https://duguid.com.au/";

/// Keep content-bearing navigation, link boundaries and preformatted lines.
#[test]
fn llms_full_extraction() {
    let html = r##"<main id="main">
    <nav class="article-crumb" aria-label="Breadcrumb"><a href="/">Home</a></nav>
    <nav class="article-toc" aria-label="On this page"><a href="#a">Section A</a></nav>
    <h1>Heading</h1>
    <nav class="collection-index" aria-label="Tool categories">
      <a href="/tools/#extract">Extract</a><a href="/tools/#calculate">Calculate</a>
    </nav>
    <p>Run <a href="/x/">first tool</a><a href="/y/">second tool</a> together.</p>
    <pre><code><span>pip install thing</span>
<span>    thing --as-at 2026-09-10</span></code></pre>
    <ul><li>one</li><li>two</li></ul>
    </main>"##;
    let text = main_text(html, SITE).unwrap();
    assert!(
        !text.contains("Home") && !text.contains("Section A"),
        "{text}"
    );
    assert!(text.contains("Extract Calculate"), "{text}");
    assert!(text.contains("first tool second tool together."), "{text}");
    assert!(
        text.contains("```\npip install thing\n    thing --as-at 2026-09-10\n```"),
        "{text}"
    );
    assert!(text.contains("- one\n- two"), "{text}");
    let card = main_text(
        concat!(
            "<main><a href=\"/e/\"><strong>Payday Super timing</strong>\n",
            "<span>Reproduce the states.</span></a>",
            "<p><a href=\"/r/\">releases<span class=\"visually-hidden\">, MCP</span></a>, and licence.</p>",
            "<p>Copy <code>.claude/skills/</code> for Claude Code.</p></main>",
        ),
        SITE,
    )
    .unwrap();
    assert!(
        card.contains("Payday Super timing: Reproduce the states."),
        "{card}"
    );
    assert!(
        card.contains("- Payday Super timing: Reproduce the states.: https://"),
        "{card}"
    );
    assert!(card.contains("releases, and licence."), "{card}");
    assert!(
        card.contains("Copy .claude/skills/ for Claude Code."),
        "{card}"
    );
    assert_eq!(
        main_text("<main></main><main></main>", SITE).unwrap_err(),
        "llms-full: page must have exactly one <main>"
    );
}

/// Keep visible citations usable without reopening their source HTML.
#[test]
fn full_text_references() {
    let html = r##"<main>
    <nav class="article-toc"><a href="#details">Navigation only</a></nav>
    <p>Read <a href="https://www.ato.gov.au/example?a=1&amp;b=2"><em>ATO</em> guidance</a>.</p>
    <p><a href="https://www.ato.gov.au/example?a=1&amp;b=2">Same source</a></p>
    <a href="rates.csv">Download CSV</a><a href="../">Rate register</a>
    <a hidden href="https://example.com/hidden">Hidden source</a>
    <template><a href="https://example.com/template">Template source</a></template>
    <a href="mailto:test@example.com">Email</a><a>Placeholder</a>
    </main>"##;
    let text = main_text(html, "https://duguid.com.au/rates/example/").unwrap();
    assert!(text.contains("ATO guidance: https://www.ato.gov.au/example?a=1&b=2"));
    assert_eq!(
        text.matches("https://www.ato.gov.au/example?a=1&b=2")
            .count(),
        1
    );
    assert!(text.contains("Download CSV: https://duguid.com.au/rates/example/rates.csv"));
    assert!(text.contains("Rate register: https://duguid.com.au/rates/"));
    assert!(!text.contains("https://example.com/") && !text.contains("mailto:"));
    assert!(!text.contains("#details"));
}

fn run(root: &Path, args: &[&str]) -> (Option<i32>, String) {
    let output = Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .arg("build_llms_full")
        .args(args)
        .current_dir(root)
        .env_remove("SITE_ROOT")
        .output()
        .unwrap();
    (
        output.status.code(),
        String::from_utf8(output.stdout).unwrap(),
    )
}

/// The normal build refreshes the alias and detects missing or stale copies.
#[test]
fn machine_index_copy() {
    if !rendered() {
        return;
    }
    let site = copied_site();
    let root = site.path();
    let canonical = root.join("llms.txt");
    let alias = root.join(".well-known/llms.txt");
    assert_eq!(run(root, &["--write"]).0, Some(0));
    assert_eq!(
        std::fs::read(&alias).unwrap(),
        std::fs::read(&canonical).unwrap()
    );
    let mut changed = std::fs::read(&canonical).unwrap();
    changed.extend_from_slice(b"\nIndex maintenance note.\n");
    std::fs::write(&canonical, changed).unwrap();
    let (code, stdout) = run(root, &["--check"]);
    assert!(
        code == Some(1) && stdout.contains(".well-known/llms.txt is stale"),
        "{stdout}"
    );
    assert_eq!(run(root, &["--write"]).0, Some(0));
    assert_eq!(
        std::fs::read(&alias).unwrap(),
        std::fs::read(&canonical).unwrap()
    );
    std::fs::remove_file(&alias).unwrap();
    let (code, stdout) = run(root, &["--check"]);
    assert!(
        code == Some(1) && stdout.contains(".well-known/llms.txt is stale"),
        "{stdout}"
    );
    // The committed copies match the rendered pages, as check_site.py's --check requires.
    assert_eq!(run(root, &["--write"]).0, Some(0));
    let (code, stdout) = run(root, &["--check"]);
    assert_eq!(code, Some(0), "{stdout}");
    assert!(
        stdout.contains("llms-full.txt matches its pages ("),
        "{stdout}"
    );
}
