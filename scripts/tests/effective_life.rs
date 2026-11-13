// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! `site-tools build_effective_life`: the parser on each row shape it knows, the shapes it
//! refuses, and the committed data against the registered instrument's row counts and rows
//! read from its authorised PDF.
use chrono::NaiveDate;
use sha2::{Digest, Sha256};
use site_tools::effective_life::{
    Counts, DATA_REL, Division, Life, NESTING_CORRECTIONS, Row, Section, Source, parse, render,
};
use site_tools::pyjson::{self, Json};
use std::path::Path;

const HEADER: &str = "<tr><td><p>ASSET</p></td><td><p>LIFE</p><p>(IN YEARS)</p></td>\
    <td><p>REVIEWED</p></td><td><p>LAST UPDATED</p></td></tr>";
const SPACER: &str = r#"<span style="width:14.2pt; display:inline-block">&#xa0;</span>"#;

fn page(body: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"><html xmlns="http://www.w3.org/1999/xhtml"><body><p class="ShortT">Test Determination 2025</p><p>Dated 2 September 2025</p><table><tr><td><p>Commencement</p></td><td><p>ignored</p></td></tr></table>{body}</body></html>"#
    )
}

fn row(indent: usize, asset: &str, life: &str, flags: &str, date: &str) -> String {
    format!(
        "<tr><td><p>{}<span>{asset}</span></p></td><td><p>{life}</p></td><td><p>{flags}</p></td><td><p>{date}</p></td></tr>",
        SPACER.repeat(indent)
    )
}

fn heading(text: &str, codes: &str) -> String {
    format!("<tr><td colspan=\"4\"><p>{text}</p><p>{codes}</p></td></tr>")
}

fn tables(a: &str, b: &str) -> String {
    page(&format!(
        "<p>Table A – Effective life (Industry categories)</p>\
         <table><tr><td><p>MINING</p><p>(06000 to 10900)</p></td></tr></table>{a}\
         <p>Table B – Effective life (Asset categories)</p>{b}"
    ))
}

fn letter(rows: &str) -> String {
    format!("<table><tr><td><p>A</p></td></tr>{HEADER}{rows}</table>")
}

fn life(years: &str, months: u32) -> Option<Life> {
    Some(Life {
        years: years.to_owned(),
        months,
    })
}

fn data(asset: &str, depth: u8, life: Option<Life>, flags: &str, date: Option<&str>) -> Row {
    Row {
        asset: asset.to_owned(),
        depth,
        life,
        flags: flags.to_owned(),
        last_updated: date.map(str::to_owned),
    }
}

/// The failures of a Table A whose one headed table holds `rows`.
fn failures(rows: &str) -> String {
    let table = format!(
        "<table>{}{HEADER}{rows}</table>",
        heading("Coal mining", "(06000)")
    );
    parse(
        &tables(&table, &letter(&row(0, "Signs", "10", "*", "1 Jul 2005"))),
        &[],
    )
    .err()
    .map_or_else(
        || "nothing: the rows were read".to_owned(),
        |f| f.join("\n"),
    )
}

/// Asserts that each set of rows is refused with its message, naming every one that is not.
fn assert_refused(cases: &[(String, &str)]) {
    let wrong: Vec<String> = cases
        .iter()
        .filter_map(|(rows, message)| {
            let failed = failures(rows);
            (!failed.contains(message)).then(|| format!("{message} not in {failed}"))
        })
        .collect();
    assert!(wrong.is_empty(), "{}", wrong.join("\n"));
}

#[test]
fn reads_each_row_shape_the_instrument_uses() {
    let third = "<span>13</span><span style=\"vertical-align:super\">1</span><span>/</span>\
        <span style=\"vertical-align:sub\">3</span>";
    let headed = format!(
        "<table><tr><td><p>Note: clay is under Construction material mining</p></td></tr>\
         <tr><td colspan=\"4\"><p>Coal mining</p><p>(06000)</p></td><td><p></p></td></tr>{HEADER}\
         <tr><td><p><a id=\"_Hlk1\"><span>Draglines</span></a></p></td><td><p>{third}</p></td><td><p>#</p></td><td><p>1 July 2023</p></td><td><p></p></td></tr>\
         <tr><td><p></p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr>\
         <tr><td><p style=\"margin-left:15.9pt; text-indent:-15.9pt\"><span>Wash plant</span>{SPACER}<span>assets:</span></p></td><td><p></p></td><td><p></p></td><td><p>1 Jul 2017</p></td></tr>\
         <tr><td><p><a id=\"_Hlk2\">{SPACER}<span>Screens</span></a></p></td><td><p>47½</p></td><td><p></p></td><td><p>1 Jan 2001</p></td></tr>\
         {}</table>",
        row(
            1,
            "Sumps",
            "<span style=\"vertical-align:super\">1</span><span>/</span><span style=\"vertical-align:sub\">2</span>",
            "*",
            "1 Oct 2015"
        ),
    );
    let general = format!(
        "<table>{HEADER}{}{}{}</table>",
        row(0, "Pumps:", "&#xa0;", "&#xa0;", "&#xa0;"),
        row(
            1,
            "Slurry\u{2011}type &#xa0; \"heavy\" pumps",
            "10",
            "*#",
            "1Jul 2008"
        ),
        row(1, "Other pumps – see Table B Pumps", "", "", ""),
    );
    let b = letter(&row(0, "Signs", "10", "*", "1 Jul 2005"));
    let read = parse(&tables(&format!("{general}{headed}"), &b), &[]).expect("the fixture parses");

    assert_eq!(
        read.table_a,
        vec![Division {
            heading: "MINING".to_owned(),
            anzsic: "06000 to 10900".to_owned(),
            sections: vec![
                Section {
                    heading: None,
                    anzsic: None,
                    note: None,
                    rows: vec![
                        data("Pumps:", 0, None, "", None),
                        data(
                            "Slurry-type \"heavy\" pumps",
                            1,
                            life("10", 120),
                            "*#",
                            Some("2008-07-01")
                        ),
                        data("Other pumps – see Table B Pumps", 1, None, "", None),
                    ],
                },
                Section {
                    heading: Some("Coal mining".to_owned()),
                    anzsic: Some("06000".to_owned()),
                    note: Some("clay is under Construction material mining".to_owned()),
                    rows: vec![
                        data("Draglines", 0, life("13 1/3", 160), "#", Some("2023-07-01")),
                        data("Wash plant assets:", 0, None, "", Some("2017-07-01")),
                        data("Screens", 1, life("47 1/2", 570), "", Some("2001-01-01")),
                        data("Sumps", 1, life("1/2", 6), "*", Some("2015-10-01")),
                    ],
                },
            ],
        }]
    );
    assert_eq!(
        read.table_b,
        vec![Section {
            heading: Some("A".to_owned()),
            anzsic: None,
            note: None,
            rows: vec![data("Signs", 0, life("10", 120), "*", Some("2005-07-01"))],
        }]
    );
    // Every <tr> after the Table A marker is one of these kinds; the commencement table
    // before it is not counted.
    assert_eq!(
        read.counts_a,
        Counts {
            source_rows: 13,
            headings: 2,
            notes: 1,
            column_headers: 2,
            blank_rows: 1,
            rows: 7,
            lives: 4,
        }
    );
    assert_eq!(
        read.counts_b,
        Counts {
            source_rows: 3,
            headings: 1,
            notes: 0,
            column_headers: 1,
            blank_rows: 0,
            rows: 1,
            lives: 1,
        }
    );

    // The file is valid JSON and keeps a description's quotation marks.
    let source = Source {
        register_id: "F0000L00000".to_owned(),
        registered: NaiveDate::from_ymd_opt(2025, 9, 15).expect("a date"),
        url: "https://www.legislation.gov.au/F0000L00000/asmade/2025-09-15/text".to_owned(),
        read: NaiveDate::from_ymd_opt(2026, 11, 3).expect("a date"),
    };
    let document = pyjson::loads(&render(&read, "00", &source)).expect("the file is JSON");
    let first = &rows_of(&document)[1];
    assert_eq!(first.0, "Slurry-type \"heavy\" pumps");
    // The credit is the Register's wording for changed content, with the full date read.
    assert_eq!(
        document
            .get("source")
            .and_then(|s| s.get("attribution"))
            .and_then(Json::as_str),
        Some(
            "Based on content from the Federal Register of Legislation at 3 November 2026. \
             For the latest information on Australian Government legislation please go to \
             https://www.legislation.gov.au."
        )
    );
    assert_eq!(
        document
            .get("source")
            .and_then(|s| s.get("made"))
            .and_then(Json::as_str),
        Some("2025-09-02")
    );
}

#[test]
fn refuses_rows_it_cannot_read() {
    let cases = [
        (
            "<tr><td><p>Pumps</p></td><td><p>10</p></td><td><p>1 Jul 2008</p></td></tr>".to_owned(),
            "3 cells, not 4",
        ),
        (row(0, "Pumps", "ten", "*", "1 Jul 2008"), "is not a number of years"),
        (row(0, "Pumps", "10", "*", ""), "a life has no date"),
        (row(0, "Pumps", "10", "x", "1 Jul 2008"), "is not * or #"),
        (row(0, "Pumps:", "", "*", ""), "a row with no life is flagged"),
        (row(0, "Pumps", "10", "*", "31 Feb 2020"), "is not a day, month and year"),
        (row(0, "Pumps", "10", "*", "1 Jly 2020"), "is not a day, month and year"),
        (row(0, "Pumps", "0", "*", "1 Jul 2008"), "a life of no time"),
        (
            row(
                0,
                "Pumps",
                "<span>6</span><span style=\"vertical-align:super\">3</span><span>/</span><span style=\"vertical-align:sub\">4</span>",
                "*",
                "1 Jul 2008",
            ),
            "life fraction 3/4 is not known",
        ),
        (
            format!(
                "{}{}",
                row(0, "Pumps:", "", "", ""),
                row(2, "Slurry pumps", "10", "*", "1 Jul 2008")
            ),
            "Slurry pumps is nested 2 deep under a row 0 deep",
        ),
        (row(1, "Pumps", "10", "*", "1 Jul 2008"), "Pumps is nested 1 deep"),
        // Text the reader would drop, or nesting it would misread, stops the build.
        (
            "<tr><td><span>Pumps</span></td><td><p>10</p></td><td><p>*</p></td><td><p>1 Jul 2008</p></td></tr>".to_owned(),
            "a cell holds text outside a paragraph",
        ),
        (
            "<tr><td><p></p></td><td><p>10</p></td><td><p>*</p></td><td><p>1 Jul 2008</p></td></tr>".to_owned(),
            "a row with no description",
        ),
        (
            "<tr><td><div><p>Pumps</p></div></td><td><p>10</p></td><td><p>*</p></td><td><p>1 Jul 2008</p></td></tr>".to_owned(),
            "the description is not in a paragraph of its own cell",
        ),
        (
            "<tr><td><p><span style=\"width:14px; display:inline-block\">&#xa0;</span><span>Pumps</span></p></td><td><p>10</p></td><td><p>*</p></td><td><p>1 Jul 2008</p></td></tr>".to_owned(),
            "a spacer's width is not in points",
        ),
        // A character of more than one byte before the year is refused, not a panic.
        (row(0, "Pumps", "10", "*", "1 July\u{2013}2008"), "is not a day, month and year"),
        (
            "<tr><td><p><span style=\"width:7pt; display:inline-block\">&#xa0;</span><span>Pumps</span></p></td><td><p>10</p></td><td><p>*</p></td><td><p>1 Jul 2008</p></td></tr>".to_owned(),
            "is not a whole nesting level",
        ),
    ];
    for (rows, message) in cases {
        let failed = failures(&rows);
        assert!(failed.contains(message), "{message} not in {failed}");
    }
}

#[test]
fn refuses_headings_and_tables_it_cannot_place() {
    let b = letter(&row(0, "Signs", "10", "*", "1 Jul 2005"));
    let pumps = row(0, "Pumps", "10", "*", "1 Jul 2008");
    let cases = [
        (
            tables(
                &format!("<table><tr><td><p>Coal mining</p></td></tr>{HEADER}{pumps}</table>"),
                &b,
            ),
            "heading Coal mining has no ANZSIC codes",
        ),
        // A blank row beside a division heading must not turn it into a section.
        (
            tables(
                &format!(
                    "<table><tr><td><p>MANUFACTURING</p><p>(11110 to 25990)</p></td></tr>\
                     <tr><td><p></p></td></tr></table><table>{}{HEADER}{pumps}</table>",
                    heading("Coal mining", "(06000)")
                ),
                &b,
            ),
            "heading MANUFACTURING (11110 to 25990): only a division heading is in capitals and alone in its table",
        ),
        (
            tables(
                "<table><tr><td><p>Coal mining</p><p>(06000)</p></td></tr></table>",
                &b,
            ),
            "heading Coal mining (06000): only a division heading is in capitals and alone in its table",
        ),
        (
            tables(
                &format!(
                    "<table>{}{HEADER}{pumps}</table><table>{HEADER}{pumps}</table>",
                    heading("Coal mining", "(06000)")
                ),
                &b,
            ),
            "rows with no heading are not first in a division",
        ),
        (
            tables(
                &format!(
                    "<table><tr><td><p>Note: see elsewhere</p></td></tr>{HEADER}{pumps}</table>"
                ),
                &b,
            ),
            "note see elsewhere has no heading after it",
        ),
        (
            tables(
                &format!("<table>{HEADER}{pumps}</table>"),
                &format!("<table><tr><td><p>Signs</p></td></tr>{HEADER}{pumps}</table>"),
            ),
            "Table B heading Signs is not a letter",
        ),
        (
            tables(
                &format!("<table>{HEADER}{pumps}</table>"),
                &format!("<table>{HEADER}{pumps}</table>"),
            ),
            "rows with no heading are not first in a division",
        ),
        (page("<p>No tables here</p>"), "Table A was not found"),
        (
            "<html><body><p>unclosed".to_owned(),
            "not well-formed XHTML",
        ),
    ];
    for (text, message) in cases {
        let failed = parse(&text, &[])
            .expect_err("the text should be refused")
            .join("\n");
        assert!(failed.contains(message), "{message} not in {failed}");
    }
}

/// Header cells and spanned cells would drop or move a row's text; only a date spanning
/// the empty fifth column some tables carry is read.
#[test]
fn refuses_cells_it_cannot_place() {
    assert_refused(&[
        (
            "<tr><th><p>Pumps</p></th><th><p>10</p></th><th><p>*</p></th><th><p>1 Jul 2008</p></th></tr>".to_owned(),
            "a row holds a th element",
        ),
        (
            "<tr><td colspan=\"2\"><p>Pumps</p></td><td><p>10</p></td><td><p>*</p></td><td><p>1 Jul 2008</p></td></tr>".to_owned(),
            "cell 1 spans 2 columns",
        ),
        (
            "<tr><td rowspan=\"2\"><p>Pumps</p></td><td><p>10</p></td><td><p>*</p></td><td><p>1 Jul 2008</p></td></tr>".to_owned(),
            "a cell spans rows",
        ),
    ]);
    let spanned_date = "<tr><td><p>Pumps</p></td><td><p>10</p></td><td><p>*</p></td>\
        <td colspan=\"2\"><p>1 Jul 2008</p></td></tr>";
    assert_eq!(
        failures(spanned_date),
        "nothing: the rows were read",
        "a date spanning the fifth column"
    );
}

/// A life printed as `1` and `0` in separate paragraphs is not ten years.
#[test]
fn refuses_a_life_in_more_than_one_paragraph() {
    assert_refused(&[(
        "<tr><td><p>Pumps</p></td><td><p>1</p><p>0</p></td><td><p>*</p></td><td><p>1 Jul 2008</p></td></tr>".to_owned(),
        "the life is in more than one paragraph",
    )]);
}

/// CSS applies the last of repeated declarations, and another unit would need a conversion,
/// so neither is read as nesting.
#[test]
fn refuses_indents_it_cannot_read() {
    let indented = |style: &str| {
        format!(
            "<tr><td><p style=\"{style}\"><span>Pumps</span></p></td><td><p>10</p></td><td><p>*</p></td><td><p>1 Jul 2008</p></td></tr>"
        )
    };
    assert_refused(&[
        (
            indented("margin-left:0pt; margin-left:14.175pt"),
            "the description's margin-left is set more than once",
        ),
        (
            indented("margin-left:1em"),
            "the description's margin-left is not in points",
        ),
    ]);
}

/// A nesting correction applies to the row in its own section only, and to exactly one.
#[test]
fn corrects_nesting_only_in_the_section_named() {
    let air = "Air filtering units (incorporating filters and housing filters)";
    let section = |name: &str, codes: &str, rows: &[(usize, &str)]| {
        let rows: String = rows
            .iter()
            .map(|(indent, asset)| row(*indent, asset, "", "", ""))
            .collect();
        format!("<table>{}{HEADER}{rows}</table>", heading(name, codes))
    };
    let chemicals = section(
        "Basic inorganic chemical manufacturing",
        "(18130)",
        &[(0, "Plant:"), (1, "Compressor assets:"), (3, air)],
    );
    let coal = section(
        "Coal mining",
        "(06000)",
        &[
            (0, "Plant:"),
            (1, "Compressor assets:"),
            (2, "Filters:"),
            (3, air),
        ],
    );
    let b = letter(&row(0, "Signs", "10", "*", "1 Jul 2005"));
    let corrections = &NESTING_CORRECTIONS[..1];
    let read =
        parse(&tables(&format!("{chemicals}{coal}"), &b), corrections).expect("the fixture parses");
    let depths: Vec<Vec<u8>> = read.table_a[0]
        .sections
        .iter()
        .map(|s| s.rows.iter().map(|r| r.depth).collect())
        .collect();
    assert_eq!(depths, vec![vec![0, 1, 2], vec![0, 1, 2, 3]]);

    for (a, message) in [
        (coal.clone(), "matches 0 rows"),
        (format!("{chemicals}{chemicals}"), "matches 2 rows"),
    ] {
        let failed = parse(&tables(&a, &b), corrections)
            .err()
            .map_or_else(|| "nothing: the text was read".to_owned(), |f| f.join("\n"));
        assert!(failed.contains(message), "{message} not in {failed}");
    }
}

/// Nothing ends Table B but text: a schedule after it is not read as more of its letters.
#[test]
fn refuses_a_table_after_the_end_of_table_b() {
    let signs = row(0, "Signs", "10", "*", "1 Jul 2005");
    let after = format!(
        "{}<p>&#xa0;</p><p>Schedule 3—Other matters</p><table><tr><td><p>X</p></td></tr>{HEADER}{signs}</table>",
        letter(&signs)
    );
    let a = format!(
        "<table>{HEADER}{}</table>",
        row(0, "Pumps", "10", "*", "1 Jul 2008")
    );
    let failed = parse(&tables(&a, &after), &[])
        .err()
        .map_or_else(|| "nothing: the text was read".to_owned(), |f| f.join("\n"));
    let message = "a table after the end of Table B at Schedule 3—Other matters";
    assert!(failed.contains(message), "{message} not in {failed}");

    // Only empty paragraphs part Table B's own tables, so there the order of its letters
    // is what tells another table from the next letter.
    let repeated = format!("{}<p>&#xa0;</p>{}", letter(&signs), letter(&signs));
    let failed = parse(&tables(&a, &repeated), &[])
        .err()
        .map_or_else(|| "nothing: the text was read".to_owned(), |f| f.join("\n"));
    let message = "Table B heading A does not follow A";
    assert!(failed.contains(message), "{message} not in {failed}");
}

/// A committed row: asset, depth, life as printed, life in months, flags, last updated.
type Committed = (
    String,
    u8,
    Option<String>,
    Option<u32>,
    String,
    Option<String>,
);

fn committed_text() -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(DATA_REL);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

fn committed() -> Json {
    pyjson::loads(&committed_text()).expect("the data file is JSON")
}

fn array<'a>(value: &'a Json, key: &str) -> &'a [Json] {
    match value.get(key) {
        Some(Json::Array(items)) => items,
        other => panic!("{key} is not an array: {other:?}"),
    }
}

fn number(value: &Json) -> Option<u32> {
    match value {
        Json::Null => None,
        Json::Int(n) => Some(n.to_string().parse().expect("a small whole number")),
        other => panic!("not a whole number: {other:?}"),
    }
}

fn text(value: &Json) -> Option<String> {
    match value {
        Json::Null => None,
        Json::Str(s) => Some(s.clone()),
        other => panic!("not text: {other:?}"),
    }
}

fn section_rows(section: &Json) -> Vec<Committed> {
    array(section, "rows")
        .iter()
        .map(|row| {
            let Json::Array(cells) = row else {
                panic!("a row is not an array: {row:?}")
            };
            assert_eq!(cells.len(), 6, "{row:?}");
            let depth = number(&cells[1]).expect("a depth");
            (
                text(&cells[0]).expect("a description"),
                u8::try_from(depth).expect("a small depth"),
                text(&cells[2]),
                number(&cells[3]),
                text(&cells[4]).expect("flags"),
                text(&cells[5]),
            )
        })
        .collect()
}

/// The sections of both tables, Table A's first.
fn sections(document: &Json) -> (Vec<&Json>, Vec<&Json>) {
    let a = array(document, "table_a")
        .iter()
        .flat_map(|division| array(division, "sections"))
        .collect();
    (a, array(document, "table_b").iter().collect())
}

fn rows_of(document: &Json) -> Vec<Committed> {
    let (a, b) = sections(document);
    a.into_iter().chain(b).flat_map(section_rows).collect()
}

fn count(document: &Json, table: &str, kind: &str) -> usize {
    let value = document
        .get("counts")
        .and_then(|counts| counts.get(table))
        .and_then(|counts| counts.get(kind))
        .unwrap_or_else(|| panic!("counts.{table}.{kind} is missing"));
    number(value).expect("a count") as usize
}

/// The `<tr>` counts of Schedule 2 in the instrument registered as F2025L01097 on
/// 15 September 2025, and what each was read as. The data rows and lives were also counted
/// in the instrument's DOCX by a separate script (9,311 rows, 7,430 lives), and every row
/// was matched in order against the text of the authorised PDF.
#[test]
fn committed_data_holds_every_row_of_the_source() {
    let document = committed();
    let pinned = [
        ("table_a", [9265, 207, 4, 196, 4, 8854, 7082]),
        ("table_b", [495, 19, 0, 19, 0, 457, 348]),
    ];
    let kinds = [
        "source_rows",
        "headings",
        "notes",
        "column_headers",
        "blank_rows",
        "rows",
        "lives",
    ];
    for (table, expected) in pinned {
        let recorded = kinds.map(|kind| count(&document, table, kind));
        assert_eq!(recorded, expected, "{table}");
        // Every source row is accounted for as exactly one kind.
        assert_eq!(recorded[0], recorded[1..6].iter().sum::<usize>(), "{table}");
    }
    // The file's rows are the rows it says the source has.
    let (a, b) = sections(&document);
    for (table, table_sections, divisions) in [
        ("table_a", a, array(&document, "table_a").len()),
        ("table_b", b, 0),
    ] {
        let rows: Vec<Committed> = table_sections
            .iter()
            .copied()
            .flat_map(section_rows)
            .collect();
        assert_eq!(rows.len(), count(&document, table, "rows"), "{table} rows");
        let lives = rows.iter().filter(|row| row.2.is_some()).count();
        assert_eq!(lives, count(&document, table, "lives"), "{table} lives");
        let headed = table_sections
            .iter()
            .filter(|section| section.get("heading").is_some_and(|h| *h != Json::Null))
            .count();
        assert_eq!(
            headed + divisions,
            count(&document, table, "headings"),
            "{table} headings"
        );
        let notes = table_sections
            .iter()
            .filter(|section| section.get("note").is_some_and(|n| *n != Json::Null))
            .count();
        assert_eq!(notes, count(&document, table, "notes"), "{table} notes");
    }
    assert_eq!(array(&document, "table_a").len(), 18);
    assert_eq!(array(&document, "table_b").len(), 19);
}

/// The SHA-256 of the committed file, whose every row was checked against the instrument's
/// Word file and authorised PDF. The samples below cover a few rows; this covers the rest,
/// and their order. `.gitattributes` keeps the file's line endings LF in every checkout.
const DATA_SHA256: &str = "96c5bfa89e554f5f0e115651df65877d8de169c4aa836181e4d0ebf3f618ba80";

#[test]
fn committed_data_is_the_data_verified_against_the_source() {
    let digest: String = Sha256::digest(committed_text().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    assert_eq!(
        digest, DATA_SHA256,
        "{DATA_REL} has changed. Check every row of the new file against the instrument's Word \
         file or authorised PDF as CONTRIBUTING.md's 'Effective life tables' section describes, \
         then pin the new digest, counts and samples here"
    );
}

#[test]
fn committed_rows_are_consistent() {
    let document = committed();
    let (a, b) = sections(&document);
    for section in a.into_iter().chain(b) {
        let mut allowed = 0;
        for (asset, depth, years, months, flags, updated) in section_rows(section) {
            assert!(!asset.is_empty() && asset == asset.trim(), "{asset:?}");
            assert!(depth <= allowed, "{asset} is nested {depth} deep");
            allowed = depth + 1;
            assert!(
                matches!(flags.as_str(), "" | "*" | "#" | "*#"),
                "{asset}: {flags}"
            );
            assert_eq!(years.is_some(), months.is_some(), "{asset}");
            if let (Some(years), Some(months)) = (&years, months) {
                // `13 1/3` is 13 years and a third: 160 months.
                let (whole, fraction) = match years.rsplit_once(' ') {
                    Some((whole, fraction)) => (whole, Some(fraction)),
                    None if years.contains('/') => ("0", Some(years.as_str())),
                    None => (years.as_str(), None),
                };
                let part = match fraction {
                    None => 0,
                    Some("1/2") => 6,
                    Some("1/3") => 4,
                    Some("2/3") => 8,
                    Some(other) => panic!("{asset}: fraction {other}"),
                };
                let whole: u32 = whole.parse().unwrap_or_else(|_| panic!("{asset}: {years}"));
                assert_eq!(whole * 12 + part, months, "{asset}: {years}");
                assert!(updated.is_some(), "{asset} has a life and no date");
            } else {
                assert!(flags.is_empty(), "{asset} has no life and is flagged");
            }
            if let Some(date) = updated {
                let parsed = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d");
                assert!(parsed.is_ok(), "{asset}: {date}");
                // The instrument was made on 2 September 2025; no life in it is later.
                assert!(
                    ("2001-01-01"..="2025-09-02").contains(&date.as_str()),
                    "{asset}: {date}"
                );
            }
        }
    }
}

/// A row as the PDF prints it: description, nesting, life and its months, flags, date.
type Sample = (
    &'static str,
    u8,
    Option<(&'static str, u32)>,
    &'static str,
    Option<&'static str>,
);

/// Rows read from the authorised PDF of F2025L01097 on 13 November 2026 (page, then the
/// row as printed there). Nesting is from each row's position on the page.
#[test]
fn committed_rows_equal_rows_read_from_the_authorised_pdf() {
    let rows = rows_of(&committed());
    let samples: [Sample; 14] = [
        // Page 10.
        ("Tractors", 0, Some(("12", 144)), "*#", Some("2007-07-01")),
        (
            "Tables (including packing and sorting tables)",
            2,
            Some(("15", 180)),
            "*",
            Some("2008-07-01"),
        ),
        ("Graders:", 1, None, "", None),
        ("Optical", 2, Some(("8", 96)), "*", Some("2008-07-01")),
        (
            "Labelling guns",
            2,
            Some(("3", 36)),
            "*",
            Some("2008-07-01"),
        ),
        // Page 12.
        (
            "Harvesters/sweepers",
            0,
            Some(("6 2/3", 80)),
            "#",
            Some("2001-01-01"),
        ),
        // Page 37.
        (
            "Hot water system assets",
            1,
            Some(("17 1/2", 210)),
            "*#",
            Some("2002-07-01"),
        ),
        // Page 117: both are rows of 'Compressor assets:', which the PDF, like the EPUB,
        // indents two levels below it.
        ("Compressor assets:", 1, None, "", None),
        (
            "Air filtering units (incorporating filters and housing filters)",
            2,
            Some(("25", 300)),
            "*",
            Some("2013-07-01"),
        ),
        (
            "Blowers and compressors (incorporating drives)",
            2,
            Some(("25", 300)),
            "*",
            Some("2013-07-01"),
        ),
        // Page 140.
        (
            "Monumental masons’ plant",
            0,
            Some(("13 1/3", 160)),
            "",
            Some("2001-01-01"),
        ),
        // Pages 281, 286 and 287, Table B.
        ("Taxis", 2, Some(("4", 48)), "*", Some("2015-07-01")),
        (
            "Solar photovoltaic electricity generation system assets",
            0,
            Some(("20", 240)),
            "*",
            Some("2011-07-01"),
        ),
        ("Mobile phones", 1, Some(("3", 36)), "*", Some("2014-07-01")),
    ];
    for (asset, depth, life, flags, updated) in samples {
        let expected: Committed = (
            asset.to_owned(),
            depth,
            life.map(|(years, _)| years.to_owned()),
            life.map(|(_, months)| months),
            flags.to_owned(),
            updated.map(str::to_owned),
        );
        assert!(rows.contains(&expected), "{expected:?} is not in the data");
    }
    // Page 140 sets this row beside 'General plant', not under it.
    let pallets = rows
        .iter()
        .position(|row| row.0 == "Pallets (aluminium used in extrusion process)")
        .expect("the pallets row");
    assert_eq!(rows[pallets - 1].0, "General plant");
    assert_eq!(rows[pallets].1, rows[pallets - 1].1);
}
