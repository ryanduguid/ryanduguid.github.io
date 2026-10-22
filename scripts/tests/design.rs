//! The check_design, favicon_render and extract_xero_badge parts of scripts/test_contracts.py.
//!
//! The Python suite also counted re.search and ord calls to prove that clean text is
//! screened by one combined pattern and that repeated text is reduced to a set of
//! characters first; check_copy and check_font_delivery keep those same structures.
mod common;
use common::*;
use site_tools::check_design as design;
use site_tools::extract_xero_badge as badge;
use site_tools::favicon_render as favicon;
use site_tools::pyjson::{self, Json};
use std::io::Write as _;
use std::path::Path;

fn baseline(root: &Path) -> Json {
    pyjson::loads(&read_text(root, "scripts/design_baseline.json")).unwrap()
}

#[test]
fn copy_reporting() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    std::fs::write(
        root.join("index.html"),
        "<head><meta content=\"Revolutionizing with seamless\" /><script type=\"application/ld+json\">{\"nested\":[\"unlocks\",{\"description\":\"\\u0044ELVE\"}]}</script></head><main>Robust LEVERAGING and seamless \u{1f60a}</main>",
    )
    .unwrap();
    std::fs::write(root.join("llms.txt"), "world-class harness the offer").unwrap();
    assert_eq!(
        design::check_copy(root).unwrap(),
        [
            "index.html: banned visible phrase 'seamless'",
            "index.html: banned visible phrase 'leverage'",
            "index.html: banned visible phrase 'robust'",
            "index.html: decorative emoji is not permitted",
            "index.html: banned meta phrase 'revolutionise'",
            "index.html: banned meta phrase 'seamless'",
            "index.html: banned JSON-LD phrase 'delve'",
            "index.html: banned JSON-LD phrase 'unlock'",
            "llms.txt: banned text phrase 'world-class'",
            "llms.txt: banned text phrase 'harness the'",
        ]
    );
    std::fs::write(root.join("llms.txt"), "Review").unwrap();
    for (visible, expected) in [
        (
            "deep dive into",
            vec![
                "index.html: banned visible phrase 'dive into'",
                "index.html: banned visible phrase 'deep dive'",
            ],
        ),
        (
            "\u{130}NSIGHTS",
            vec!["index.html: banned visible phrase 'insights'"],
        ),
        ("seamlessx leveragedness insightsful", vec![]),
        (
            "Review \u{1f60a}",
            vec!["index.html: decorative emoji is not permitted"],
        ),
    ] {
        std::fs::write(root.join("index.html"), format!("<main>{visible}</main>")).unwrap();
        assert_eq!(design::check_copy(root).unwrap(), expected, "{visible}");
    }
    std::fs::write(root.join("index.html"), "<main>Review</main>").unwrap();
    assert!(design::check_copy(root).unwrap().is_empty());
    std::fs::remove_file(root.join("llms.txt")).unwrap();
    assert_eq!(
        design::check_copy(root).unwrap(),
        ["copy page missing: llms.txt"]
    );
}

#[test]
fn font_repetitive_text() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    std::fs::create_dir(root.join("assets")).unwrap();
    std::fs::write(
        root.join("index.html"),
        format!("<main>{}</main>", "Caf\u{e9}\x00\x1f".repeat(5000)),
    )
    .unwrap();
    std::fs::write(root.join("assets/fixture.mjs"), "// \u{3b2}\n").unwrap();
    let tokens = "@font-face {unicode-range: U+0020-007E;}@font-face {unicode-range: U+0020-00FF;}";
    assert_eq!(
        design::check_font_delivery(root, tokens).unwrap(),
        [
            "font face 1 does not cover visible U+00E9",
            "font face 2 does not cover visible U+03B2",
        ]
    );
    assert!(
        design::check_font_delivery(root, "@font-face {unicode-range: U+0020-03FF;}")
            .unwrap()
            .is_empty()
    );
}

const STYLESHEET_PAGES: [&str; 4] = [
    "index.html",
    "404.html",
    "tools/business-calculators/gst/index.html",
    "tools/accounting-questions/bookkeeping-close/index.html",
];

fn stylesheet_baseline() -> Json {
    Json::Object(vec![(
        "json_ld".into(),
        Json::Object(
            STYLESHEET_PAGES
                .iter()
                .filter(|r| **r != "404.html")
                .map(|r| ((*r).to_owned(), Json::Null))
                .collect(),
        ),
    )])
}

fn delivery(root: &Path) -> Vec<String> {
    design::check_document_delivery(root, &stylesheet_baseline()).unwrap()
}

#[test]
fn stylesheet_version() {
    if !rendered() {
        return;
    }
    let config = read_text(root(), "_config.yml");
    let version_line = site_tools::pyre::re(r"(?m)^asset_version:.*$", 0)
        .search(&config)
        .unwrap()[0]
        .to_owned();
    let directory = tempfile::tempdir().unwrap();
    let site = directory.path();
    for rel in STYLESHEET_PAGES.iter().chain(&[
        "_config.yml",
        design::PROOF_ASSET,
        design::PROOF_MOBILE_ASSET,
    ]) {
        let target = site.join(rel);
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::copy(root().join(rel), target).unwrap();
    }
    assert_clean("current stylesheet delivery", &delivery(site));
    for invalid in [
        "",
        "asset_version: \"\"",
        "asset_version: \"20300101A\"",
        "asset_version: \"20300101&extra=1\"",
        "asset_version: 20300101",
        "asset_version: \"20300101'",
        "asset_version: \"20300101\"\nasset_version: \"20300102\"",
        "asset_version: \"20300230\"",
    ] {
        std::fs::write(
            site.join("_config.yml"),
            changed_text(&config, &version_line, invalid),
        )
        .unwrap();
        expect_failure(
            "invalid stylesheet version",
            &delivery(site),
            "_config.yml:",
        );
    }
    std::fs::remove_file(site.join("_config.yml")).unwrap();
    expect_failure(
        "missing stylesheet configuration",
        &delivery(site),
        "asset_version configuration is missing",
    );
    std::fs::write(site.join("_config.yml"), config.replace('"', "'")).unwrap();
    assert_clean("single-quoted version", &delivery(site));
    std::fs::write(site.join("_config.yml"), &config).unwrap();

    let (tokens_link, site_link) = design::stylesheet_links(site).unwrap().unwrap();
    for (rel, link) in
        STYLESHEET_PAGES
            .iter()
            .zip([&tokens_link, &site_link, &tokens_link, &site_link])
    {
        let original = read_text(site, rel);
        replace_file(site, rel, link, &link.replace("?v=", "?v=stale-"));
        expect_failure(
            rel,
            &delivery(site),
            &format!("{rel}: expected one tokens stylesheet before site stylesheet"),
        );
        std::fs::write(site.join(rel), original).unwrap();
    }
    for rel in ["index.html", "tools/business-calculators/gst/index.html"] {
        let original = read_text(site, rel);
        replace_file(
            site,
            rel,
            &format!("{tokens_link}\n  {site_link}"),
            &format!("{site_link}\n  {tokens_link}"),
        );
        expect_failure(
            rel,
            &delivery(site),
            &format!("{rel}: expected one tokens stylesheet before site stylesheet"),
        );
        std::fs::write(site.join(rel), original).unwrap();
    }
    std::fs::write(
        site.join("_config.yml"),
        changed_text(&config, &version_line, "asset_version: \"20300101a\""),
    )
    .unwrap();
    expect_failure(
        "configuration bumped without the rendered pages",
        &delivery(site),
        "index.html: expected one tokens stylesheet before site stylesheet",
    );
    let (new_tokens, new_site) = design::stylesheet_links(site).unwrap().unwrap();
    for rel in STYLESHEET_PAGES {
        replace_file(site, rel, &tokens_link, &new_tokens);
        replace_file(site, rel, &site_link, &new_site);
    }
    assert_clean("new configured CSS version", &delivery(site));
}

fn repository(root: &Path) -> Vec<String> {
    design::check_repository(root).unwrap()
}

#[test]
fn design_contracts_current_site() {
    if !rendered() {
        return;
    }
    assert_clean("current design", &repository(root()));
    let site = copied_site();
    replace_file(
        site.path(),
        "rates/super-guarantee/index.html",
        "<li><a href=\"/rates/\">Rates</a></li>",
        "<li><a href=\"/rates-copy/\">Rates</a></li>",
    );
    assert_clean(
        "rate breadcrumb is outside the protected content digest",
        &repository(site.path()),
    );
    let _ = baseline(root());
}

#[test]
fn design_contracts_text_mutations() {
    if !rendered() {
        return;
    }
    let (tokens_link, _) = design::stylesheet_links(root()).unwrap().unwrap();
    let csp_line = format!("{}\n", design::CSP_META);
    let calculator_csp = design::calculator_csp_meta();
    let commented_csp = format!("<!-- {calculator_csp} -->");
    let besley = format!("{}\n", design::font_preload("Besley-SemiBold"));
    let semibold_before = format!(
        "{}\n  {tokens_link}",
        design::font_preload("PublicSans-SemiBold")
    );
    let semibold_after = format!(
        "{tokens_link}\n  {}",
        design::font_preload("PublicSans-SemiBold")
    );
    let mutations: Vec<(&str, &str, &str, &str, &str)> = vec![
        (
            "view switch shadow exception stays scoped",
            "assets/site.css",
            "body {",
            "body {\n  box-shadow: 0 4px 16px var(--colour-mode-shadow);",
            "banned CSS pattern box-shadow",
        ),
        (
            "view switch blur exception stays scoped",
            "assets/site.css",
            "body {",
            "body {\n  backdrop-filter: blur(10px);",
            "banned CSS pattern backdrop-filter",
        ),
        (
            "view switch still rejects gradients",
            "assets/site.css",
            ".view-mode {",
            ".view-mode {\n  background: linear-gradient(var(--colour-paper), var(--colour-canvas));",
            "banned CSS pattern linear-gradient",
        ),
        (
            "labels stay out of tracked capitals",
            "assets/site.css",
            ".article-toc p {",
            ".article-toc p {\n  text-transform: uppercase;\n  letter-spacing: 0.055em;",
            "tracked capital label: .article-toc p",
        ),
        (
            "content security policy removed",
            "about/index.html",
            &csp_line,
            "",
            "about/index.html: expected one Content Security Policy meta tag",
        ),
        (
            "content security policy weakened",
            "tools/index.html",
            "script-src 'self';",
            "script-src 'self' 'unsafe-inline';",
            "tools/index.html: expected one Content Security Policy meta tag",
        ),
        (
            "calculator native submission restriction weakened",
            "tools/coal-lsl-levy/index.html",
            "form-action 'none';",
            "form-action 'self';",
            "tools/coal-lsl-levy/index.html: expected one Content Security Policy meta tag",
        ),
        (
            "calculator content security policy removed",
            "tools/coal-lsl-levy/index.html",
            &calculator_csp,
            "",
            "tools/coal-lsl-levy/index.html: expected one Content Security Policy meta tag",
        ),
        (
            "calculator content security policy commented out",
            "tools/coal-lsl-levy/index.html",
            &calculator_csp,
            &commented_csp,
            "tools/coal-lsl-levy/index.html: expected one Content Security Policy meta tag",
        ),
        (
            "display serif preload removed",
            "index.html",
            &besley,
            "",
            "index.html: expected the Besley-SemiBold preload before the tokens stylesheet",
        ),
        (
            "preload discovered after the stylesheets",
            "rates/index.html",
            &semibold_before,
            &semibold_after,
            "rates/index.html: expected the PublicSans-SemiBold preload before the tokens stylesheet",
        ),
        (
            "inline script restored",
            "tools/coal-lsl-levy/index.html",
            "<script type=\"module\" src=\"/assets/levy-page.mjs\"></script>",
            "<script type=\"module\">import '/assets/levy-page.mjs';</script>",
            "tools/coal-lsl-levy/index.html: must not carry inline script",
        ),
        (
            "protected rate copy",
            "rates/super-guarantee/index.html",
            "<strong>12%</strong>",
            "<strong>13%</strong>",
            "protected main text changed: rates/super-guarantee/index.html",
        ),
        (
            "protected source link",
            "rates/super-guarantee/index.html",
            "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee",
            "https://example.invalid/rate",
            "protected main links changed: rates/super-guarantee/index.html",
        ),
        (
            "structured data drift",
            "index.html",
            "\"@type\": \"WebPage\",\n        \"@id\": \"https://duguid.com.au/#webpage\"",
            "\"@type\": \"Article\",\n        \"@id\": \"https://duguid.com.au/#webpage\"",
            "JSON-LD changed: index.html",
        ),
        (
            "legal boundary drift",
            "index.html",
            "Nothing here is tax, legal or financial advice. Computational outputs are review aids for a qualified professional, not compliance determinations, and lodgement decisions stay with a human.",
            "Nothing here is tax, legal, or financial advice. Outputs need review.",
            "protected text count changed",
        ),
        (
            "font loading regression",
            "assets/tokens.css",
            "font-display: optional;",
            "font-display: swap;",
            "font face 1 must use font-display: optional",
        ),
        (
            "font coverage removed",
            "assets/tokens.css",
            "unicode-range:",
            "unicode-ranges:",
            "font face 1 must declare unicode-range",
        ),
        (
            "lambda fallback markup removed",
            "tools/ozzit/index.html",
            design::LAMBDA_MARKUP,
            "\u{3bb}",
            "font face 1 does not cover visible U+03BB",
        ),
        (
            "unsupported symbol hidden in fallback markup",
            "tools/ozzit/index.html",
            design::LAMBDA_MARKUP,
            "<span class=\"function-symbol\">\u{3bc}</span>",
            "font face 1 does not cover visible U+03BC",
        ),
        (
            "lambda fallback styling removed",
            "assets/site.css",
            "font-family: var(--font-symbol);",
            "font-family: var(--font-mono);",
            "lambda markup must use the symbol font",
        ),
        (
            "lambda fallback fonts removed",
            "assets/tokens.css",
            "--font-symbol: \"Cambria Math\", \"STIX Two Math\", \"DejaVu Serif\", serif;",
            "--font-symbol: monospace;",
            "lambda fallback must retain the native maths font stack",
        ),
        (
            "OLED canvas drift",
            "assets/tokens.css",
            "--colour-canvas: #000000;",
            "--colour-canvas: #010101;",
            "OLED canvas must be #000000",
        ),
        (
            "green accent restored",
            "assets/tokens.css",
            "--colour-stamp: #990024;",
            "--colour-stamp: #4dff88;",
            "--colour-stamp must be #990024",
        ),
        (
            "deep purple accent drift",
            "assets/tokens.css",
            "--colour-stamp-strong: #66023c;",
            "--colour-stamp-strong: #990024;",
            "--colour-stamp-strong must be #66023c",
        ),
        (
            "low contrast accent text",
            "assets/tokens.css",
            "--colour-ink: #fffff0;",
            "--colour-ink: #606060;",
            "ink contrast on filled accent must be at least 4.5:1",
        ),
        (
            "mobile wrapping removed",
            "assets/site.css",
            "overflow-wrap: anywhere;",
            "overflow-wrap: normal;",
            "body must wrap unbroken identifiers at the 320px boundary",
        ),
        (
            "interaction timing drift",
            "assets/site.css",
            "transition:\n    color var(--motion-standard) var(--ease-standard),\n    text-decoration-color var(--motion-standard) var(--ease-standard);",
            "transition:\n    color var(--motion-fast) var(--ease-standard),\n    text-decoration-color var(--motion-fast) var(--ease-standard);",
            "links and controls must use the standard motion duration",
        ),
        (
            "token stylesheet removed",
            "index.html",
            &tokens_link,
            "",
            "index.html: expected one tokens stylesheet before site stylesheet",
        ),
        (
            "homepage text alternate points to site index",
            "index.html",
            "href=\"https://duguid.com.au/index.txt\"",
            "href=\"https://duguid.com.au/llms.txt\"",
            "index.html: expected one page-specific plain-text alternate link",
        ),
        (
            "nested text alternate points to another page",
            "tools/australian-tax-ai-agents/index.html",
            "href=\"https://duguid.com.au/tools/australian-tax-ai-agents/index.txt\"",
            "href=\"https://duguid.com.au/index.txt\"",
            "tools/australian-tax-ai-agents/index.html: expected one page-specific plain-text alternate link",
        ),
        (
            "machine index removed",
            "index.html",
            "<a href=\"/llms.txt\">Machine-readable index</a>",
            "",
            "index.html: expected one visible machine-readable index link",
        ),
        (
            "Tools browse link drift",
            "index.html",
            "href=\"/tools/\">Browse tools by accounting task",
            "href=\"/missing-tools/\">Browse tools by accounting task",
            "index.html: expected exactly one /tools/ homepage action",
        ),
        (
            "second hero action returns",
            "index.html",
            "<a class=\"button\" href=\"/examples/profit-vs-cash-flow/\">Explore the cash flow example</a>",
            "<a class=\"button\" href=\"/examples/profit-vs-cash-flow/\">Explore the cash flow example</a><a href=\"/evaluate/\">Evaluations</a>",
            "index.html: expected exactly one action in home-hero__actions",
        ),
        (
            "category preview removed",
            "index.html",
            "home-tool-preview",
            "removed-tool-preview",
            "index.html: expected one home-tool-preview",
        ),
        (
            "extra technical label",
            "index.html",
            "</main>",
            "<p class=\"technical-label\">Extra context</p></main>",
            "index.html: expected exactly one evidence-bearing technical label",
        ),
        (
            "proof loaded eagerly",
            "index.html",
            "width=\"868\" height=\"580\" loading=\"lazy\"",
            "width=\"868\" height=\"580\" loading=\"eager\"",
            "index.html: Coal LSL proof image must load lazily",
        ),
        (
            "proof dimensions drift",
            "index.html",
            "height=\"580\"",
            "height=\"581\"",
            "index.html: Coal LSL proof image must keep its height",
        ),
        (
            "proof mobile source removed",
            "index.html",
            "<source media=\"(max-width: 40rem)\" srcset=\"/assets/coal-lsl-calculator-mobile.webp\"",
            "<source media=\"(max-width: 40rem)\" srcset=\"/assets/missing-mobile.webp\"",
            "index.html: Coal LSL proof picture must offer the mobile source",
        ),
        (
            "proof alternative removed",
            "index.html",
            "alt=\"Coal LSL calculator result showing Formula B, eligible wages, levy and the applied section 3B branch for a synthetic example\"",
            "alt=\"\"",
            "index.html: Coal LSL proof image must have descriptive alt text",
        ),
        (
            "font URL broken",
            "assets/tokens.css",
            "/assets/fonts/Besley-Regular.woff2",
            "/assets/fonts/Missing.woff2",
            "font face target missing: assets/fonts/Missing.woff2",
        ),
        (
            "favicon palette drift",
            "assets/favicon.svg",
            "#990024",
            "#5c2d91",
            "favicon colour outside OLED palette: #5c2d91",
        ),
        (
            "byline warning colour restored",
            "assets/site.css",
            ".byline {\n  padding: var(--space-4) 0 var(--space-4) var(--space-5);\n  border-left: var(--rule-strong) solid var(--colour-rule-strong);",
            ".byline {\n  padding: var(--space-4) 0 var(--space-4) var(--space-5);\n  border-left: var(--rule-strong) solid var(--colour-alert);",
            "bylines must use the neutral register rule",
        ),
        (
            "informational route note warning colour restored",
            "assets/site.css",
            ".route-note {\n  padding: var(--space-4) 0 var(--space-4) var(--space-5);\n  border-left: var(--rule-strong) solid var(--colour-rule-strong);",
            ".route-note {\n  padding: var(--space-4) 0 var(--space-4) var(--space-5);\n  border-left: var(--rule-strong) solid var(--colour-alert);",
            "informational route notes must use the neutral register rule",
        ),
        (
            "boundary route note neutral colour restored",
            "assets/site.css",
            ".route-note.boundary {\n  border-left-color: var(--colour-alert);",
            ".route-note.boundary {\n  border-left-color: var(--colour-rule-strong);",
            "boundary route notes must retain the alert rule",
        ),
        (
            "homepage opening review date moved",
            "index.html",
            "<p class=\"page-meta\">Last reviewed ",
            "<p class=\"moved-page-meta\">Last reviewed ",
            "index.html: expected exactly one opening page-meta",
        ),
        (
            "Tools opening review date moved",
            "tools/index.html",
            "<p class=\"page-meta\">Last reviewed ",
            "<p class=\"moved-page-meta\">Last reviewed ",
            "tools/index.html: expected exactly one opening page-meta",
        ),
        (
            "Evidence opening review date moved",
            "evidence/index.html",
            "<p class=\"page-meta\">Last reviewed ",
            "<p class=\"moved-page-meta\">Last reviewed ",
            "evidence/index.html: expected exactly one opening page-meta",
        ),
        (
            "machine-written vocabulary in visible copy",
            "tools/wip-schedule/index.html",
            "This tool does the arithmetic.",
            "This tool delves into the arithmetic.",
            "tools/wip-schedule/index.html: banned visible phrase 'delve'",
        ),
        (
            "machine-written vocabulary in a meta description",
            "tools/payday-super/index.html",
            "content=\"Current release payday-super-checker",
            "content=\"Leverage this check that super reaches the fund",
            "tools/payday-super/index.html: banned meta phrase 'leverage'",
        ),
        (
            "machine-written vocabulary in structured data",
            "tools/ato-benchmarks/index.html",
            "\"text\": \"No. Businesses differ, which is why the ATO publishes a range",
            "\"text\": \"No. Businesses differ, which is why the ATO ultimately publishes a range",
            "tools/ato-benchmarks/index.html: banned JSON-LD phrase 'ultimately'",
        ),
        (
            "machine-written vocabulary in a JSON-LD citation",
            "rates/super-guarantee/index.html",
            "\"citation\": \"Australian Taxation Office, Key superannuation rates and thresholds: Super guarantee\"",
            "\"citation\": \"Australian Taxation Office, Key superannuation rates and thresholds: Super guarantee, a robust source\"",
            "rates/super-guarantee/index.html: banned JSON-LD phrase 'robust'",
        ),
        (
            "machine-written vocabulary behind a JSON escape",
            "rates/super-guarantee/index.html",
            "\"text\": \"12%. There are no further scheduled increases.\"",
            "\"text\": \"12%. There are no further scheduled increases. D\\u0065lve no further.\"",
            "rates/super-guarantee/index.html: banned JSON-LD phrase 'delve'",
        ),
        (
            "machine-written vocabulary in llms.txt",
            "llms.txt",
            "third-party libraries, ATO guidance",
            "curated third-party libraries, ATO guidance",
            "llms.txt: banned text phrase 'curated'",
        ),
        (
            "favicon rasters left behind the seal",
            "assets/favicon.svg",
            "<rect x=\"24\" y=\"40\" width=\"16\" height=\"4\" fill=\"#ffd32a\" />",
            "<rect x=\"24\" y=\"40\" width=\"12\" height=\"4\" fill=\"#ffd32a\" />",
            "favicon raster out of date: assets/favicon-32.png",
        ),
        (
            "favicon geometry misses whole raster pixels",
            "assets/favicon.svg",
            "<rect x=\"16\" y=\"16\" width=\"4\" height=\"32\" fill=\"#990024\" />",
            "<rect x=\"17\" y=\"16\" width=\"4\" height=\"32\" fill=\"#990024\" />",
            "does not land on a whole pixel",
        ),
        (
            "favicon viewBox that the rasteriser cannot divide",
            "assets/favicon.svg",
            "viewBox=\"0 0 64 64\"",
            "viewBox=\"0 0 64.5 64.5\"",
            "favicon viewBox must use whole pixels",
        ),
        (
            "favicon rect starting outside the viewBox",
            "assets/favicon.svg",
            "<rect x=\"16\" y=\"16\" width=\"4\" height=\"32\" fill=\"#990024\" />",
            "<rect x=\"-16\" y=\"16\" width=\"4\" height=\"32\" fill=\"#990024\" />",
            "favicon geometry must not be negative",
        ),
        (
            "favicon rect overflowing the viewBox",
            "assets/favicon.svg",
            "<rect x=\"24\" y=\"40\" width=\"16\" height=\"4\" fill=\"#ffd32a\" />",
            "<rect x=\"24\" y=\"40\" width=\"48\" height=\"4\" fill=\"#ffd32a\" />",
            "favicon rect falls outside the viewBox",
        ),
        (
            "48px favicon link dropped from a page head",
            "index.html",
            "  <link rel=\"icon\" type=\"image/png\" sizes=\"48x48\" href=\"/assets/favicon-48.png\" />\n",
            "",
            "index.html: expected one favicon link",
        ),
    ];
    // Each mutation checks its own copy of the site, so they run on every core; the
    // results are then checked in order.
    let next = std::sync::atomic::AtomicUsize::new(0);
    let found = std::sync::Mutex::new(vec![Vec::new(); mutations.len()]);
    let workers = std::thread::available_parallelism().map_or(2, |n| n.get().min(8));
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                loop {
                    let index = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    let Some((_, rel, old, new, _)) = mutations.get(index) else {
                        return;
                    };
                    let site = copied_site();
                    replace_file(site.path(), rel, old, new);
                    let failures = repository(site.path());
                    found.lock().unwrap()[index] = failures;
                }
            });
        }
    });
    let found = found.into_inner().unwrap();
    for ((label, _, _, _, expected), failures) in mutations.iter().zip(&found) {
        expect_failure(label, failures, expected);
    }
}

#[test]
fn design_contracts_review_dates_and_assets() {
    if !rendered() {
        return;
    }
    let review = regex::Regex::new(r"Last reviewed ([0-9]{1,2} [A-Z][a-z]+ [0-9]{4})\.").unwrap();
    for rel in ["index.html", "tools/index.html", "evidence/index.html"] {
        // Mutate whatever review date the page carries today.
        let html = std::fs::read_to_string(copied_site().path().join(rel)).unwrap();
        let visible = review
            .captures(&html)
            .unwrap_or_else(|| panic!("{rel}: no review date"))[1]
            .to_owned();
        let structured = site_tools::pytime::strptime_day_month_year(&visible)
            .unwrap()
            .isoformat();
        let site = copied_site();
        replace_file(
            site.path(),
            rel,
            &format!("Last reviewed {visible}."),
            "Last reviewed 1 September 2026.",
        );
        expect_failure(
            rel,
            &design::check_opening_review_dates(site.path()).unwrap(),
            "does not match JSON-LD dateModified",
        );
        let site = copied_site();
        replace_file(
            site.path(),
            rel,
            &format!("Last reviewed {visible}."),
            "Last reviewed 1 September 2026.",
        );
        replace_file(
            site.path(),
            rel,
            &format!("\"dateModified\": \"{structured}\""),
            "\"dateModified\": \"2026-09-01\"",
        );
        assert_clean(
            rel,
            &design::check_opening_review_dates(site.path()).unwrap(),
        );
    }
    let site = copied_site();
    append_file(
        site.path(),
        "assets/site.css",
        "\n.mutation-gradient { background: linear-gradient(#000, #fff); }\n",
    );
    expect_failure(
        "banned gradient",
        &repository(site.path()),
        "banned CSS pattern linear-gradient",
    );
    let site = copied_site();
    std::fs::write(
        site.path().join("assets/coal-lsl-calculator.webp"),
        b"not-a-webp",
    )
    .unwrap();
    expect_failure(
        "invalid proof image",
        &repository(site.path()),
        "assets/coal-lsl-calculator.webp: proof image is not a WebP container",
    );
    let site = copied_site();
    std::fs::remove_file(site.path().join("assets/fonts/Besley-Regular.woff2")).unwrap();
    expect_failure(
        "protected font removed",
        &repository(site.path()),
        "protected font missing: assets/fonts/Besley-Regular.woff2",
    );
    let site = copied_site();
    append_file(
        site.path(),
        "assets/site.css",
        "\n.route-section > .route-label { position: sticky; }\n",
    );
    expect_failure(
        "sticky route rail restored",
        &repository(site.path()),
        "route labels must not be sticky",
    );
    let site = copied_site();
    std::fs::remove_file(site.path().join(".well-known/security.txt")).unwrap();
    expect_failure(
        "security contact file removed",
        &repository(site.path()),
        ".well-known/security.txt: security.txt missing",
    );
    let site = copied_site();
    replace_file(
        site.path(),
        ".well-known/security.txt",
        "Expires: 2027-08-31T14:00:00.000Z",
        "Expires: 2020-01-01T00:00:00.000Z",
    );
    expect_failure(
        "security contact file expired",
        &repository(site.path()),
        ".well-known/security.txt: Expires has passed; refresh the file",
    );
    let site = copied_site();
    replace_file(site.path(), "_config.yml", "  - .well-known\n", "");
    expect_failure(
        "security contact file unpublished",
        &repository(site.path()),
        "_config.yml: must include .well-known so Pages publishes security.txt",
    );
}

fn png(data: &[u8], level: u32, header: &[u8]) -> Vec<u8> {
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::new(level));
    encoder.write_all(data).unwrap();
    let compressed = encoder.finish().unwrap();
    let mut out = favicon::PNG_SIGNATURE.to_vec();
    out.extend(favicon::chunk(b"IHDR", header));
    out.extend(favicon::chunk(b"IDAT", &compressed));
    out.extend(favicon::chunk(b"IEND", b""));
    out
}

fn ihdr(width: u32) -> Vec<u8> {
    let mut header = width.to_be_bytes().to_vec();
    header.extend_from_slice(&1u32.to_be_bytes());
    header.extend_from_slice(&[8, 6, 0, 0, 0]);
    header
}

#[test]
fn png_compression() {
    let header = ihdr(1);
    let pixels = b"\x00\x10\x20\x30\xff";
    let original = png(pixels, 9, &header);
    let alternate = png(pixels, 0, &header);
    assert_ne!(original, alternate);
    assert_eq!(
        favicon::png_content(&original),
        favicon::png_content(&alternate)
    );
    for changed in [b"\x00\x10\x20\x30\x00".as_slice(), b"\x00\x11\x20\x30\xff"] {
        assert_ne!(
            favicon::png_content(&original),
            favicon::png_content(&png(changed, 9, &header))
        );
    }
    let original_ihdr = favicon::chunk(b"IHDR", &header);
    let changed_ihdr = favicon::chunk(b"IHDR", &ihdr(2));
    let mut changed_metadata = original.clone();
    let at = changed_metadata
        .windows(original_ihdr.len())
        .position(|w| w == original_ihdr)
        .unwrap();
    changed_metadata.splice(at..at + original_ihdr.len(), changed_ihdr);
    assert_ne!(
        favicon::png_content(&original),
        favicon::png_content(&changed_metadata)
    );
    let compressed = favicon::compress(pixels);
    let idat = favicon::chunk(b"IDAT", &compressed);
    let replace_idat = |invalid: Vec<u8>| {
        let mut out = original.clone();
        let at = out.windows(idat.len()).position(|w| w == idat).unwrap();
        out.splice(at..at + idat.len(), favicon::chunk(b"IDAT", &invalid));
        out
    };
    let mut broken = vec![
        original[..original.len() - 1].to_vec(),
        [&original[..20], b"\xff", &original[21..]].concat(),
        [original.as_slice(), b"extra"].concat(),
    ];
    broken.push(replace_idat([compressed.as_slice(), b"extra"].concat()));
    broken.push(replace_idat(
        [compressed.as_slice(), compressed.as_slice()].concat(),
    ));
    broken.push(replace_idat(compressed[..compressed.len() - 1].to_vec()));
    for png in broken {
        assert!(
            favicon::png_content(&png).is_err(),
            "corrupt PNG passed content comparison"
        );
    }
    // An equivalent existing badge is kept, so its recorded hash stays valid.
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join(badge::TARGET);
    std::fs::create_dir_all(target.parent().unwrap()).unwrap();
    std::fs::write(&target, &original).unwrap();
    assert_eq!(
        badge::publish(directory.path(), "certificate.pdf", &alternate).unwrap(),
        0
    );
    assert_eq!(std::fs::read(&target).unwrap(), original);
}

#[test]
fn xero_badge() {
    if !rendered() {
        return;
    }
    let rebuilt = badge::extract(&root().join(badge::DEFAULT_SOURCE))
        .unwrap()
        .unwrap();
    let published = std::fs::read(root().join(badge::TARGET)).unwrap();
    assert_eq!(
        favicon::png_content(&rebuilt),
        favicon::png_content(&published)
    );
}

#[test]
fn favicon_rasters_match_the_committed_files() {
    if !rendered() {
        return;
    }
    for (rel, bytes) in favicon::rasters(root()).unwrap() {
        // zlib-rs reproduces Python's zlib-ng bytes for the seal's runs of colour.
        assert_eq!(std::fs::read(root().join(&rel)).unwrap(), bytes, "{rel}");
    }
}

/// `--update-baseline` restores what it can derive: protected-text counts and
/// the JSON-LD of a page missing from the baseline.
#[test]
fn update_baseline_recounts_text_and_pins_new_pages() {
    if !rendered() {
        return;
    }
    let site = copied_site();
    let path = site.path().join("scripts/design_baseline.json");
    let committed = pyjson::loads(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let mut changed = committed.clone();
    let Json::Object(sections) = &mut changed else {
        panic!("baseline is an object")
    };
    for (key, value) in sections.iter_mut() {
        match (key.as_str(), value) {
            ("json_ld", Json::Object(entries)) => {
                entries.retain(|(rel, _)| rel != "tools/ozzit/functions/debt/index.html")
            }
            ("protected_text", Json::Object(entries)) => {
                for (_, count) in entries.iter_mut() {
                    *count = Json::Int(num_bigint::BigInt::from(0));
                }
            }
            _ => {}
        }
    }
    std::fs::write(&path, pyjson::dumps(&changed, pyjson::Dump::default())).unwrap();
    assert!(design::update_baseline(site.path()).is_ok());
    let refreshed = pyjson::loads(&std::fs::read_to_string(&path).unwrap()).unwrap();
    // The checked tree is rendered, so only the two sections mutated above are compared.
    for key in ["protected_text", "json_ld"] {
        let (now, then) = (refreshed.get(key).unwrap(), committed.get(key).unwrap());
        if key == "json_ld" {
            let rel = "tools/ozzit/functions/debt/index.html";
            assert!(now.get(rel).unwrap().py_eq(then.get(rel).unwrap()), "{rel}");
        } else {
            assert!(now.py_eq(then), "{key}");
        }
    }
}
