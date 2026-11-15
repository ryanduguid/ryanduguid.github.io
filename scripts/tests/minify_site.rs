// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! site-tools minify_site: the published copies shrink, keep their attribution and
//! keep the names other files and pages reach them by.
use site_tools::minify_site::{css, header, javascript, minify_tree, run};
use std::fs;

const HEADER_JS: &str = "// Copyright 2026 Ryan Duguid\n// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0\n";
const HEADER_CSS: &str = "/* Copyright 2026 Ryan Duguid */\n/* SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0 */\n";

#[test]
fn header_stops_at_the_first_line_that_is_not_a_whole_comment() {
    let source = format!("{HEADER_JS}\n// A description, not attribution.\nexport const a = 1;\n");
    assert_eq!(header(&source), HEADER_JS);
    assert_eq!(header("export const a = 1;\n"), "");
    // A block comment closing before code on the same line is not a header line:
    // keeping it would run that code twice.
    assert_eq!(header("/* a */ run(); /* b */\nrun();\n"), "");
    // A comment over several lines counts once it closes at the end of a line.
    assert_eq!(header("/* a\n b */\nrun();\n"), "/* a\n b */\n");
    assert_eq!(header("/* a\n b */ run();\n"), "");
    assert_eq!(header("/* a\n b\n"), "");
}

#[test]
fn a_module_keeps_its_exports_and_attribution() {
    let source = format!(
        "{HEADER_JS}\n// Explains the arithmetic.\nexport function annualAmount(monthlyAmount) {{\n  const monthsInYear = 12;\n  return monthlyAmount * monthsInYear;\n}}\n"
    );
    let minified = javascript(&source, true).unwrap();
    assert!(minified.starts_with(HEADER_JS), "{minified}");
    assert!(minified.contains("annualAmount"), "{minified}");
    assert!(!minified.contains("monthlyAmount"), "{minified}");
    assert!(!minified.contains("Explains the arithmetic"), "{minified}");
    assert!(minified.len() < source.len());
}

#[test]
fn a_classic_script_keeps_its_global_names() {
    let source =
        "function siteGlobal(value) {\n  return value + 1;\n}\nvar counter = siteGlobal(1);\n";
    let minified = javascript(source, false).unwrap();
    assert!(minified.contains("siteGlobal"), "{minified}");
    assert!(minified.contains("counter"), "{minified}");
}

#[test]
fn unparseable_javascript_is_refused() {
    assert!(javascript("export const = ;", true).is_err());
}

#[test]
fn a_stylesheet_shrinks_and_keeps_its_attribution() {
    let source = format!(
        "{HEADER_CSS}\n/* Layout notes. */\n.card {{\n  color: #ffffff;\n  margin: 0px 0px 0px 0px;\n}}\n"
    );
    let minified = css(&source).unwrap();
    assert!(minified.starts_with(HEADER_CSS), "{minified}");
    assert!(!minified.contains("Layout notes"), "{minified}");
    assert_eq!(
        &minified[HEADER_CSS.len()..],
        ".card{color:#ffffff;margin:0px 0px 0px 0px}"
    );
}

/// Each case keeps its tokens: only whitespace and comments no token needs go.
#[test]
fn css_keeps_every_token_boundary() {
    for (source, minified) in [
        // Fallbacks and longhands stay as written.
        (
            ".a {\n  width: 100vh;\n  width: 100dvh;\n  animation: linear both cue;\n  animation-timeline: --scroll;\n}",
            ".a{width:100vh;width:100dvh;animation:linear both cue;animation-timeline:--scroll}",
        ),
        // A space before `:` or `(` is a descendant combinator or ends a keyword.
        (
            ".a :hover, .b\n  .c { }\n@media screen and (min-width: 40rem) { }",
            ".a :hover,.b .c{}@media screen and (min-width:40rem){}",
        ),
        // Arithmetic needs its spaces.
        (
            "a { width: calc( 100% - 2px ); }",
            "a{width:calc(100% - 2px)}",
        ),
        // A comment between two tokens still separates them.
        (".a/* x */.b { }", ".a/**/.b{}"),
        ("a /* x */ b { }", "a b{}"),
        // Strings and escapes are copied whole.
        (
            "a::after { content: \"a  /* b */ ;}\" ; }",
            "a::after{content:\"a  /* b */ ;}\"}",
        ),
        ("a { content: 'it\\'s  } ' }", "a{content:'it\\'s  } '}"),
        // One whitespace ends a hex escape; the next is a combinator.
        (".x\\31  .y { }", ".x\\31  .y{}"),
        (".x\\31 23 { }", ".x\\31 23{}"),
        ("a\u{a0}b { }", "a\u{a0}b{}"),
        // A custom property's value keeps its inner whitespace; only the whitespace
        // around it goes.
        (
            ":root {\n  --font: \"A\", B,  serif;\n  --gap:   calc( 1px + 2px ) ;\n  --set: { a: b }\n}\n.a { color: var(--gap) }",
            ":root{--font:\"A\", B,  serif;--gap:calc( 1px + 2px );--set:{ a: b }}.a{color:var(--gap)}",
        ),
        // An escaped `;` is part of a name, so it stays before `}`.
        ("a { --x: b\\; }", "a{--x:b\\;}"),
        // An unquoted url() is one token, comment-like text included.
        (
            "a { background: URL( a/*b*/c.png ) }",
            "a{background:URL(a/*b*/c.png )}",
        ),
        (
            "a { background: url( \"a b.png\" ) }",
            "a{background:url(\"a b.png\")}",
        ),
    ] {
        assert_eq!(css(source).unwrap(), minified, "{source:?}");
    }
}

#[test]
fn unterminated_css_is_refused() {
    for source in [
        ".a { color: red } /* open",
        ".a { content: \"open }",
        ".a { content: 'a\nb' }",
        ".a\\",
        "a { background: url(a.png }",
    ] {
        assert!(css(source).is_err(), "{source:?}");
    }
}

/// Lightning CSS parses each published stylesheet to the same rules as its source.
#[test]
fn the_site_stylesheets_parse_the_same_after_minifying() {
    use lightningcss::stylesheet::{ParserOptions, PrinterOptions, StyleSheet};
    let rules = |text: &str| {
        StyleSheet::parse(text, ParserOptions::default())
            .unwrap()
            .to_css(PrinterOptions::default())
            .unwrap()
            .code
    };
    let assets = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets");
    let mut checked = 0;
    for entry in fs::read_dir(assets).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|e| e == "css") {
            let source = fs::read_to_string(&path).unwrap();
            let minified = css(&source).unwrap();
            assert!(minified.len() < source.len(), "{}", path.display());
            assert!(
                minified.contains("SPDX-License-Identifier"),
                "{}",
                path.display()
            );
            assert_eq!(rules(&minified), rules(&source), "{}", path.display());
            checked += 1;
        }
    }
    assert!(checked >= 4, "{checked} stylesheets");
}

/// Each published module exports the same names, and imports the same modules, as its
/// source.
#[test]
fn the_site_modules_keep_their_imports_and_exports() {
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;
    let interface = |text: &str| {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, text, SourceType::mjs()).parse();
        assert!(!parsed.diagnostics.has_errors());
        let record = parsed.module_record;
        let mut names: Vec<String> = record
            .exported_bindings
            .keys()
            .map(|name| format!("export {name}"))
            .chain(
                record
                    .requested_modules
                    .keys()
                    .map(|name| format!("import {name}")),
            )
            .collect();
        names.sort();
        names
    };
    let assets = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets");
    let mut checked = 0;
    for entry in fs::read_dir(assets).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|e| e == "mjs") {
            let source = fs::read_to_string(&path).unwrap();
            let minified = javascript(&source, true).unwrap();
            assert!(minified.len() < source.len(), "{}", path.display());
            assert!(
                minified.contains("SPDX-License-Identifier"),
                "{}",
                path.display()
            );
            assert_eq!(
                interface(&minified),
                interface(&source),
                "{}",
                path.display()
            );
            checked += 1;
        }
    }
    assert!(checked >= 20, "{checked} modules");
}

#[test]
fn the_tree_is_minified_in_place_and_other_files_are_left_alone() {
    let dir = tempfile::tempdir().unwrap();
    let assets = dir.path().join("assets");
    fs::create_dir(&assets).unwrap();
    let module = "export const total = (first, second) => first + second;\n";
    let script = "window.siteValue = 1;\n";
    let sheet = ".a {\n  color: red;\n}\n";
    let page = "<script type=\"module\" src=\"/assets/a.mjs\"></script>\n";
    fs::write(assets.join("a.mjs"), module).unwrap();
    fs::write(assets.join("b.js"), script).unwrap();
    fs::write(assets.join("c.css"), sheet).unwrap();
    fs::write(dir.path().join("index.html"), page).unwrap();
    fs::write(assets.join("d.json"), "{ \"a\": 1 }\n").unwrap();

    let (files, before, after) = minify_tree(dir.path()).unwrap();
    assert_eq!(files, 3);
    assert_eq!(before, (module.len() + script.len() + sheet.len()) as u64);
    assert!(after < before);
    assert_eq!(
        fs::read_to_string(assets.join("c.css")).unwrap(),
        ".a{color:red}"
    );
    assert!(
        fs::read_to_string(assets.join("a.mjs"))
            .unwrap()
            .contains("total")
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("index.html")).unwrap(),
        page
    );
    assert_eq!(
        fs::read_to_string(assets.join("d.json")).unwrap(),
        "{ \"a\": 1 }\n"
    );

    // Minified output is stable, so a second run changes nothing.
    let again: Vec<String> = ["a.mjs", "b.js", "c.css"]
        .iter()
        .map(|name| fs::read_to_string(assets.join(name)).unwrap())
        .collect();
    minify_tree(dir.path()).unwrap();
    for (name, text) in ["a.mjs", "b.js", "c.css"].iter().zip(again) {
        assert_eq!(
            fs::read_to_string(assets.join(name)).unwrap(),
            text,
            "{name}"
        );
    }
}

#[test]
fn a_failure_names_the_file() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("broken.mjs"), "export const = ;").unwrap();
    let error = minify_tree(dir.path()).unwrap_err();
    assert!(error.contains("broken.mjs"), "{error}");
}

#[cfg(unix)]
#[test]
fn a_linked_file_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("a.css"), ".a { color: red }").unwrap();
    std::os::unix::fs::symlink(outside.path().join("a.css"), dir.path().join("a.css")).unwrap();
    let error = minify_tree(dir.path()).unwrap_err();
    assert!(error.contains("not a regular file"), "{error}");
    assert_eq!(
        fs::read_to_string(outside.path().join("a.css")).unwrap(),
        ".a { color: red }"
    );
}

#[test]
fn run_takes_at_most_one_directory() {
    let dir = tempfile::tempdir().unwrap();
    let args = vec!["a".to_string(), "b".to_string()];
    assert!(run(dir.path(), &args).unwrap_err().starts_with("usage:"));
    fs::create_dir(dir.path().join("_site")).unwrap();
    assert_eq!(run(dir.path(), &[]).unwrap(), 0);
}
