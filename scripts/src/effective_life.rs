// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! `site-tools build_effective_life`: build and check
//! `tools/depreciation-rates/effective-life.json` from the registered text of the
//! Commissioner's effective life determination.
//!
//! The source is the XHTML inside the EPUB that the Federal Register of Legislation
//! publishes for the instrument (`OEBPS/document_1/document_1.html`). Every `<tr>` of
//! Schedule 2 becomes exactly one thing here: a heading, a column header, a blank row or a
//! data row. The counts of each are written beside the rows, so the file can be held to the
//! source's own row count, and a row in a shape this parser does not know fails the build
//! instead of being dropped or guessed at.
use crate::py;
use crate::pyjson::{self, Dump, Json};
use chrono::NaiveDate;
use roxmltree::Node;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub const DATA_REL: &str = "tools/depreciation-rates/effective-life.json";
/// One level of indent in the asset column: the width of the spacer the source puts
/// before a nested description, in points.
const INDENT_PT: f64 = 14.175;
/// The deepest nesting the tables use below a top-level description.
const MAX_DEPTH: u8 = 4;
/// A row the source nests wrongly: the heading of its section, its description, the
/// nesting the text gives and the nesting recorded.
pub type Correction = (&'static str, &'static str, u8, u8);
/// Rows the EPUB text of the 2025 instrument nests one level too deep. The first two are
/// indented two levels under 'Compressor assets:', in the authorised PDF as well, and are
/// recorded as its rows, the only reading that leaves no level empty. The third is set
/// under 'General plant' in the EPUB only; the authorised PDF shows it as a sibling. Each
/// must match exactly one row, so a corrected source or a second such row fails the build
/// instead of being shifted by guess. Any other row nested more than one level below the
/// row above it fails the build, because that is also what a misread indent looks like.
pub const NESTING_CORRECTIONS: [Correction; 3] = [
    (
        "Basic inorganic chemical manufacturing",
        "Air filtering units (incorporating filters and housing filters)",
        3,
        2,
    ),
    (
        "Basic inorganic chemical manufacturing",
        "Blowers and compressors (incorporating drives)",
        3,
        2,
    ),
    (
        "Concrete product manufacturing",
        "Pallets (aluminium used in extrusion process)",
        2,
        1,
    ),
];
const COLUMNS: [&str; 6] = [
    "asset",
    "depth",
    "life_years",
    "life_months",
    "flags",
    "last_updated",
];
const DESCRIPTION: &str = "Every row of Table A (industry categories) and Table B (asset \
    categories) in Schedule 2 of the Commissioner of Taxation's effective life determination \
    named in source, in the instrument's order. Each row is an array in the order columns \
    gives. depth is the row's nesting under the rows above it: a row with no life is a \
    heading for the deeper rows that follow it, or a cross-reference. life_years is the \
    life as the instrument prints it and life_months is the same life in months. flags \
    holds the instrument's third column: * means the life has been reviewed in the \
    Commissioner's ongoing review and # means a capped life is available under section \
    40-102 of the Income Tax Assessment Act 1997. last_updated is the date the instrument \
    gives for when the life was last reviewed and determined. White space and no-break \
    hyphens in the instrument's text are written as ordinary spaces and hyphens.";
const SOURCE_FILE: &str = "OEBPS/document_1/document_1.html in the instrument's EPUB download";
/// What this file changes in the instrument's content, as the source licence asks a
/// reuser to say.
const CHANGES: &str = "Schedule 2 only, set out as data: each row's indentation is recorded \
    as a depth number, each life is also given in months, dates are in ISO form, and white \
    space and no-break hyphens are written as ordinary spaces and hyphens. 3 rows are \
    recorded one level shallower than the EPUB's text sets them. The Commonwealth does not \
    endorse this file.";
const SOURCE_LICENCE: &str = "Creative Commons Attribution 4.0 International (CC BY 4.0)";
const SOURCE_LICENCE_URL: &str = "https://creativecommons.org/licenses/by/4.0/";
/// The repository's licence, as LICENSE and NOTICE state it, for the arrangement of this
/// file; the rows themselves are the Commonwealth's text under the source licence.
const LICENCE: &str = "The rows are text of a Commonwealth legislative instrument, reused \
    under the source licence named in source. The arrangement of this file is under the \
    Ryan Duguid Public Attribution Licence 1.0 (LicenseRef-Duguid-Public-Attribution-1.0), \
    the licence of the repository it is built in. See LICENSE and NOTICE.";
const LICENCE_URL: &str = "https://github.com/ryanduguid/ryanduguid.github.io/blob/main/LICENSE";
const ADVICE_STATUS: &str = "Not advice. Check each life against the registered instrument, \
    and against an earlier determination for an asset acquired before the row's \
    last_updated date.";
const USAGE: &str = include_str!("help/build_effective_life.usage");
const HELP: &str = include_str!("help/build_effective_life.txt");

type Result<T> = std::result::Result<T, String>;

/// An effective life as the instrument prints it, such as `13 1/3`, and in months.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Life {
    pub years: String,
    pub months: u32,
}

/// One data row of a table: a description with its life, or a description with none.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Row {
    pub asset: String,
    pub depth: u8,
    pub life: Option<Life>,
    pub flags: String,
    pub last_updated: Option<String>,
}

/// The rows under one heading: an industry and its ANZSIC codes in Table A, a letter in
/// Table B. A division's general rows come first, under no heading.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Section {
    pub heading: Option<String>,
    pub anzsic: Option<String>,
    /// The note the instrument prints above the heading, if any.
    pub note: Option<String>,
    pub rows: Vec<Row>,
}

/// One industry division of Table A.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Division {
    pub heading: String,
    pub anzsic: String,
    pub sections: Vec<Section>,
}

/// What each `<tr>` of a table was read as. `source_rows` is every `<tr>`, and equals the
/// sum of headings, notes, column headers, blank rows and rows; `lives` counts the rows
/// that state a life.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Counts {
    pub source_rows: usize,
    pub headings: usize,
    pub notes: usize,
    pub column_headers: usize,
    pub blank_rows: usize,
    pub rows: usize,
    pub lives: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Determination {
    pub title: String,
    /// The date the instrument was made, as ISO text.
    pub made: String,
    pub table_a: Vec<Division>,
    pub table_b: Vec<Section>,
    pub counts_a: Counts,
    pub counts_b: Counts,
}

/// What the registered text does not say about itself.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Source {
    pub register_id: String,
    /// The date the version read was registered.
    pub registered: NaiveDate,
    /// The page of the version read on the Federal Register of Legislation.
    pub url: String,
    /// The date the source was downloaded and read.
    pub read: NaiveDate,
}

fn is(node: Node<'_, '_>, name: &str) -> bool {
    node.is_element() && node.tag_name().name() == name
}

fn node_text(node: Node<'_, '_>) -> String {
    node.descendants()
        .filter(Node::is_text)
        .filter_map(|n| n.text())
        .collect()
}

/// Text with each run of white space, the source's no-break spaces included, as one
/// space, and its no-break hyphens as ordinary ones, so that a search for `self-propelled`
/// finds the row.
fn clean(text: &str) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    words.join(" ").replace('\u{2011}', "-")
}

/// A cell's text, its paragraphs joined by a space.
fn cell_text(cell: Node<'_, '_>) -> String {
    let paragraphs: Vec<String> = cell
        .descendants()
        .filter(|n| is(*n, "p"))
        .map(|p| clean(&node_text(p)))
        .filter(|t| !t.is_empty())
        .collect();
    paragraphs.join(" ")
}

/// A length in points from a style attribute, such as `width:14.2pt`, or none when the
/// property is not set. CSS applies the last of repeated declarations and another unit
/// would need a conversion, so both are refused; `owner` names the element in the message.
fn style_pt(style: &str, property: &str, owner: &str) -> Result<Option<f64>> {
    let mut values = style
        .split(';')
        .filter_map(|declaration| declaration.split_once(':'))
        .filter(|(name, _)| name.trim() == property)
        .map(|(_, value)| value.trim());
    let Some(value) = values.next() else {
        return Ok(None);
    };
    if values.next().is_some() {
        return Err(format!("{owner} {property} is set more than once: {style}"));
    }
    match value.strip_suffix("pt").map(str::parse) {
        Some(Ok(points)) => Ok(Some(points)),
        _ => Err(format!("{owner} {property} is not in points: {style}")),
    }
}

/// A row's nesting, from the spacers before its description. The source indents with
/// inline blocks of one indent's width each; a hanging indent on the paragraph moves the
/// later lines only, so its margin and first-line indent cancel. Spacers after the first
/// word wrap a long description and are not nesting.
fn depth(cell: Node<'_, '_>) -> Result<u8> {
    let Some(paragraph) = cell.children().find(|n| is(*n, "p")) else {
        // Nesting is read from the cell's own paragraph; a wrapped one would read as depth 0.
        return if node_text(cell).trim().is_empty() {
            Ok(0)
        } else {
            Err("the description is not in a paragraph of its own cell".to_owned())
        };
    };
    let style = paragraph.attribute("style").unwrap_or_default();
    let owner = "the description's";
    let mut width = style_pt(style, "margin-left", owner)?.unwrap_or(0.0)
        + style_pt(style, "text-indent", owner)?.unwrap_or(0.0);
    // A bookmark anchor may wrap the paragraph's spans, so read them wherever they sit.
    for node in paragraph.descendants().skip(1) {
        let blank = node_text(node).trim().is_empty();
        if is(node, "span") && blank {
            let style = node.attribute("style").unwrap_or_default();
            if style.contains("inline-block") {
                width += style_pt(style, "width", "a spacer's")?
                    .ok_or_else(|| format!("a spacer's width is not in points: {style}"))?;
            }
        } else if (is(node, "span") || node.is_text()) && !blank {
            break;
        }
    }
    let levels = (width / INDENT_PT).round();
    if !(0.0..=f64::from(MAX_DEPTH)).contains(&levels) || (width - levels * INDENT_PT).abs() > 2.5 {
        return Err(format!(
            "an indent of {width}pt is not a whole nesting level"
        ));
    }
    // The range check above keeps the value within u8.
    Ok(levels as u8)
}

/// The life column: empty, whole years, or whole years and a half or a third. The source
/// prints a fraction as a raised numerator, a slash and a lowered denominator, or as `½`.
fn life(cell: Node<'_, '_>) -> Result<Option<Life>> {
    // The parts are read across the cell, so separate paragraphs `1` and `0` would read as 10.
    let paragraphs = cell
        .descendants()
        .filter(|n| is(*n, "p") && !node_text(*n).trim().is_empty())
        .count();
    if paragraphs > 1 {
        return Err("the life is in more than one paragraph".to_owned());
    }
    let (mut whole, mut numerator, mut denominator) = (String::new(), String::new(), String::new());
    for text in cell.descendants().filter(Node::is_text) {
        let style = text
            .ancestors()
            .find(|n| is(*n, "span"))
            .and_then(|span| span.attribute("style"))
            .unwrap_or_default();
        let part = if style.contains("vertical-align:super") {
            &mut numerator
        } else if style.contains("vertical-align:sub") {
            &mut denominator
        } else {
            &mut whole
        };
        part.push_str(text.text().unwrap_or_default());
    }
    let printed = clean(&whole);
    let (numerator, denominator) = (clean(&numerator), clean(&denominator));
    let (years, fraction) = if let Some(years) = printed.strip_suffix('½') {
        (years, Some((1, 2)))
    } else if let Some(years) = printed.strip_suffix('/') {
        match (numerator.as_str(), denominator.as_str()) {
            ("1", "2") => (years, Some((1, 2))),
            ("1", "3") => (years, Some((1, 3))),
            ("2", "3") => (years, Some((2, 3))),
            _ => {
                return Err(format!(
                    "life fraction {numerator}/{denominator} is not known"
                ));
            }
        }
    } else {
        (printed.as_str(), None)
    };
    if fraction.is_none() && !(numerator.is_empty() && denominator.is_empty()) {
        return Err(format!(
            "life {printed} has raised or lowered text and no fraction"
        ));
    }
    let years = years.trim();
    if years.is_empty() && fraction.is_none() {
        return Ok(None);
    }
    let whole_years: u32 = if years.is_empty() {
        0
    } else if years.bytes().all(|b| b.is_ascii_digit()) {
        years
            .parse()
            .map_err(|_| format!("life {years} is too long"))?
    } else {
        return Err(format!("life {printed} is not a number of years"));
    };
    let (text, part_months) = match fraction {
        None => (years.to_owned(), 0),
        Some((n, d)) => {
            let fraction = format!("{n}/{d}");
            let text = if years.is_empty() {
                fraction
            } else {
                format!("{years} {fraction}")
            };
            (text, 12 * n / d)
        }
    };
    let months = whole_years * 12 + part_months;
    if months == 0 {
        return Err("a life of no time".to_owned());
    }
    Ok(Some(Life {
        years: text,
        months,
    }))
}

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// A date such as `1 Jul 2008`, `1 July 2023` or `1Jul 2008` as ISO text.
fn iso_date(text: &str) -> Result<String> {
    let bad = || format!("date {text} is not a day, month and year");
    let joined: String = text.split_whitespace().collect();
    let day_end = joined.find(|c: char| !c.is_ascii_digit()).ok_or_else(bad)?;
    let year_start = joined
        .char_indices()
        .rev()
        .find(|(_, c)| !c.is_ascii_digit())
        .map_or(0, |(i, c)| i + c.len_utf8());
    let (day, name, year) = (
        &joined[..day_end],
        joined[day_end..year_start].to_ascii_lowercase(),
        &joined[year_start..],
    );
    let month = MONTHS
        .iter()
        .position(|short| name.len() >= 3 && name.starts_with(short) && month_name(short, &name))
        .ok_or_else(bad)?;
    let (day, year): (u32, i32) = (
        day.parse().map_err(|_| bad())?,
        year.parse().map_err(|_| bad())?,
    );
    if year.to_string().len() != 4 {
        return Err(bad());
    }
    // `month` is an index into twelve names.
    chrono::NaiveDate::from_ymd_opt(year, month as u32 + 1, day)
        .map(|date| date.format("%Y-%m-%d").to_string())
        .ok_or_else(bad)
}

/// Whether `name` is the short month or its full English name.
fn month_name(short: &str, name: &str) -> bool {
    const FULL: [&str; 12] = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ];
    name == short
        || FULL
            .iter()
            .any(|full| full.starts_with(short) && name == *full)
}

/// A heading's name and the ANZSIC codes after it in brackets.
fn split_heading(text: &str) -> Option<(String, String)> {
    let inner = text.strip_suffix(')')?;
    let open = inner.rfind('(')?;
    let codes = inner[open + 1..].trim();
    let name = inner[..open].trim();
    let has_code = codes
        .split(|c: char| !c.is_ascii_digit())
        .any(|run| run.len() == 5);
    (has_code && !name.is_empty()).then(|| (name.to_owned(), codes.to_owned()))
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Table {
    A,
    B,
}

struct Reader<'c> {
    table: Option<Table>,
    divisions: Vec<Division>,
    letters: Vec<Section>,
    counts_a: Counts,
    counts_b: Counts,
    /// A note read above a heading, for the section that heading opens.
    note: Option<String>,
    corrections: &'c [Correction],
    /// The rows each correction has matched.
    corrected: Vec<usize>,
    failures: Vec<String>,
}

impl Reader<'_> {
    fn counts(&mut self, table: Table) -> &mut Counts {
        match table {
            Table::A => &mut self.counts_a,
            Table::B => &mut self.counts_b,
        }
    }

    fn sections(&mut self, table: Table) -> Option<&mut Vec<Section>> {
        match table {
            Table::A => self.divisions.last_mut().map(|d| &mut d.sections),
            Table::B => Some(&mut self.letters),
        }
    }

    fn fail(&mut self, place: &str, message: &str) {
        self.failures.push(format!("{place}: {message}"));
    }

    /// One `<table>` of Schedule 2: a division heading on its own, or headed data rows.
    fn table(&mut self, table: Table, node: Node<'_, '_>, number: usize) {
        let rows: Vec<Node<'_, '_>> = node.descendants().filter(|n| is(*n, "tr")).collect();
        let mut headed = false;
        for (index, row) in rows.iter().enumerate() {
            let place = format!("table {number} row {}", index + 1);
            self.counts(table).source_rows += 1;
            // Only <td> cells are read, so any other cell's text would be dropped.
            if let Some(other) = row.children().find(|n| n.is_element() && !is(*n, "td")) {
                let name = other.tag_name().name();
                self.fail(
                    &place,
                    &format!("a row holds a {name} element, not only td cells"),
                );
                continue;
            }
            let cells: Vec<Node<'_, '_>> = row.children().filter(|n| is(*n, "td")).collect();
            if cells.iter().any(|cell| cell.attribute("rowspan").is_some()) {
                self.fail(&place, "a cell spans rows");
                continue;
            }
            let mut texts: Vec<String> = cells.iter().map(|c| cell_text(*c)).collect();
            // Text is read from paragraphs, so text anywhere else in a cell would be dropped.
            let squeezed = |text: &str| text.split_whitespace().collect::<String>();
            if cells
                .iter()
                .zip(&texts)
                .any(|(cell, text)| squeezed(&clean(&node_text(*cell))) != squeezed(text))
            {
                self.fail(&place, "a cell holds text outside a paragraph");
                continue;
            }
            if texts.iter().all(String::is_empty) {
                self.counts(table).blank_rows += 1;
                continue;
            }
            // A heading is one cell across the table; the source sometimes leaves an empty
            // cell beside it.
            let spanning = cells.len() == 2 && cells[0].attribute("colspan").is_some();
            if cells.len() == 1 || (spanning && texts[1].is_empty()) {
                if let Some(note) = texts[0].strip_prefix("Note:") {
                    self.counts(table).notes += 1;
                    if let Some(earlier) = self.note.replace(note.trim().to_owned()) {
                        self.fail(&place, &format!("note {earlier} has no heading after it"));
                    }
                    continue;
                }
                self.counts(table).headings += 1;
                self.heading(table, &texts[0], rows.len() == 1, &place);
                headed = true;
                continue;
            }
            // Some tables carry a fifth, empty column, which a date may span; a cell spanning
            // anything else would move the cells after it.
            if let Some((index, span)) = cells.iter().enumerate().find_map(|(index, cell)| {
                let span = cell.attribute("colspan")?;
                (index != 3 || cells.len() != 4 || span != "2").then_some((index, span))
            }) {
                self.fail(&place, &format!("cell {} spans {span} columns", index + 1));
                continue;
            }
            if texts.len() == 5 && texts[4].is_empty() {
                texts.pop();
            }
            if texts.len() != 4 {
                self.fail(&place, &format!("{} cells, not 4", texts.len()));
                continue;
            }
            if texts[0].eq_ignore_ascii_case("ASSET") {
                self.counts(table).column_headers += 1;
                let rest = [&texts[1], &texts[2], &texts[3]].map(|t| t.to_ascii_uppercase());
                let known = rest[0].replace(' ', "") == "LIFE(INYEARS)"
                    && (rest[1] == "REVIEWED" || rest[1] == "REVIEW")
                    && rest[2] == "LAST UPDATED";
                if !known {
                    self.fail(&place, &format!("column header {}", texts.join(" | ")));
                }
                continue;
            }
            self.counts(table).rows += 1;
            if texts[0].is_empty() {
                self.fail(
                    &place,
                    &format!("a row with no description in {}", texts.join(" | ")),
                );
                continue;
            }
            match data_row(&cells, &texts) {
                Ok(row) => self.push(table, row, headed, &place),
                Err(message) => self.fail(&place, &format!("{message} in {}", texts.join(" | "))),
            }
            headed = true;
        }
        if let Some(note) = self.note.take() {
            self.fail(
                &format!("table {number}"),
                &format!("note {note} has no heading after it"),
            );
        }
    }

    fn heading(&mut self, table: Table, text: &str, alone: bool, place: &str) {
        match table {
            Table::A => {
                let Some((heading, anzsic)) = split_heading(text) else {
                    return self.fail(place, &format!("heading {text} has no ANZSIC codes"));
                };
                // A division's heading is in capitals and alone in its table; a section's
                // is neither. A blank row beside a division heading must not demote it.
                if alone == heading.chars().any(char::is_lowercase) {
                    return self.fail(
                        place,
                        &format!("heading {text}: only a division heading is in capitals and alone in its table"),
                    );
                }
                if alone {
                    self.divisions.push(Division {
                        heading,
                        anzsic,
                        sections: Vec::new(),
                    });
                } else {
                    let note = self.note.take();
                    match self.sections(table) {
                        Some(sections) => sections.push(Section {
                            heading: Some(heading),
                            anzsic: Some(anzsic),
                            note,
                            rows: Vec::new(),
                        }),
                        None => {
                            self.fail(place, &format!("heading {text} comes before any division"));
                        }
                    }
                }
            }
            Table::B => {
                let letter = text.len() == 1 && text.bytes().all(|b| b.is_ascii_uppercase());
                if alone || !letter {
                    return self.fail(place, &format!("Table B heading {text} is not a letter"));
                }
                // The letters run in order, so one that does not is some other table.
                if let Some(last) = self.letters.last().and_then(|s| s.heading.clone())
                    && last.as_str() >= text
                {
                    return self.fail(
                        place,
                        &format!("Table B heading {text} does not follow {last}"),
                    );
                }
                self.letters.push(Section {
                    heading: Some(text.to_owned()),
                    anzsic: None,
                    note: self.note.take(),
                    rows: Vec::new(),
                });
            }
        }
    }

    fn push(&mut self, table: Table, row: Row, headed: bool, place: &str) {
        let corrections = self.corrections;
        if row.life.is_some() {
            self.counts(table).lives += 1;
        }
        let Some(sections) = self.sections(table) else {
            return self.fail(place, "a row comes before any division");
        };
        if !headed {
            // Rows with no heading of their own are a division's general rows, which
            // come first in it.
            if table == Table::B || !sections.is_empty() {
                return self.fail(place, "rows with no heading are not first in a division");
            }
            sections.push(Section::default());
        }
        let Some(section) = sections.last_mut() else {
            return self.fail(place, "a row comes before any heading");
        };
        let allowed = section.rows.last().map_or(0, |last| last.depth + 1);
        let mut row = row;
        let correction = corrections.iter().position(|&(heading, asset, text, _)| {
            section.heading.as_deref() == Some(heading) && asset == row.asset && text == row.depth
        });
        if let Some(index) = correction {
            row.depth = corrections[index].3;
        }
        if row.depth > allowed {
            let message = format!(
                "{} is nested {} deep under a row {} deep",
                row.asset,
                row.depth,
                allowed.saturating_sub(1)
            );
            return self.fail(place, &message);
        }
        section.rows.push(row);
        if let Some(index) = correction {
            self.corrected[index] += 1;
        }
    }
}

fn data_row(cells: &[Node<'_, '_>], texts: &[String]) -> Result<Row> {
    let life = life(cells[1])?;
    let flags = texts[2].replace(' ', "");
    if !matches!(flags.as_str(), "" | "*" | "#" | "*#") {
        return Err(format!("third column {flags} is not * or #"));
    }
    let last_updated = if texts[3].is_empty() {
        None
    } else {
        Some(iso_date(&texts[3])?)
    };
    // A heading row may carry a date of its own; a life never comes without one.
    if life.is_some() && last_updated.is_none() {
        return Err("a life has no date".to_owned());
    }
    if life.is_none() && !flags.is_empty() {
        return Err("a row with no life is flagged".to_owned());
    }
    Ok(Row {
        asset: texts[0].clone(),
        depth: depth(cells[0])?,
        life,
        flags,
        last_updated,
    })
}

/// The tables of Schedule 2 with `corrections` applied (the build uses
/// `NESTING_CORRECTIONS`), or every reason the text could not be read as them.
pub fn parse(
    xhtml: &str,
    corrections: &[Correction],
) -> std::result::Result<Determination, Vec<String>> {
    let options = roxmltree::ParsingOptions {
        allow_dtd: true,
        ..roxmltree::ParsingOptions::default()
    };
    let document = roxmltree::Document::parse_with_options(xhtml, options)
        .map_err(|e| vec![format!("the source is not well-formed XHTML: {e}")])?;
    let mut reader = Reader {
        table: None,
        divisions: Vec::new(),
        letters: Vec::new(),
        counts_a: Counts::default(),
        counts_b: Counts::default(),
        note: None,
        corrections,
        corrected: vec![0; corrections.len()],
        failures: Vec::new(),
    };
    let (mut title, mut made, mut number) = (None, None, 0);
    // Table B is the last of Schedule 2, and only empty paragraphs part its tables, so text
    // after its rows starts whatever follows it.
    let mut after_b = None;
    for node in document.descendants() {
        if is(node, "table") {
            number += 1;
            if let Some(end) = &after_b {
                reader.fail(
                    &format!("table {number}"),
                    &format!("a table after the end of Table B at {end}"),
                );
            } else if let Some(table) = reader.table {
                reader.table(table, node, number);
            }
        } else if is(node, "p") && !node.ancestors().any(|a| is(a, "table")) {
            let text = clean(&node_text(node));
            if node.attribute("class") == Some("ShortT") {
                title = Some(text);
            } else if let Some(date) = text.strip_prefix("Dated ") {
                made = Some(iso_date(date));
            } else if text.starts_with("Table A") && text.contains("Effective life") {
                reader.table = Some(Table::A);
            } else if text.starts_with("Table B") && text.contains("Effective life") {
                reader.table = Some(Table::B);
            } else if reader.table == Some(Table::B)
                && reader.counts_b.source_rows > 0
                && !text.is_empty()
                && after_b.is_none()
            {
                after_b = Some(text);
            }
        }
    }
    let mut failures = reader.failures;
    for ((heading, asset, _, _), matched) in corrections.iter().zip(&reader.corrected) {
        if *matched != 1 {
            failures.push(format!(
                "the nesting correction for {asset} under {heading} matches {matched} rows, not 1"
            ));
        }
    }
    if reader.divisions.is_empty() {
        failures.push("Table A was not found".to_owned());
    }
    if reader.letters.is_empty() {
        failures.push("Table B was not found".to_owned());
    }
    let title = title.unwrap_or_else(|| {
        failures.push("the instrument's short title was not found".to_owned());
        String::new()
    });
    let made = match made {
        Some(Ok(date)) => date,
        Some(Err(message)) => {
            failures.push(message);
            String::new()
        }
        None => {
            failures.push("the date the instrument was made was not found".to_owned());
            String::new()
        }
    };
    if !failures.is_empty() {
        return Err(failures);
    }
    Ok(Determination {
        title,
        made,
        table_a: reader.divisions,
        table_b: reader.letters,
        counts_a: reader.counts_a,
        counts_b: reader.counts_b,
    })
}

fn quote(text: &str) -> String {
    pyjson::dumps(
        &Json::Str(text.to_owned()),
        Dump {
            ensure_ascii: false,
            ..Dump::default()
        },
    )
}

fn quote_or_null(text: Option<&str>) -> String {
    text.map_or_else(|| "null".to_owned(), quote)
}

fn counts_json(counts: &Counts) -> String {
    format!(
        "{{\"source_rows\": {}, \"headings\": {}, \"notes\": {}, \"column_headers\": {}, \"blank_rows\": {}, \"rows\": {}, \"lives\": {}}}",
        counts.source_rows,
        counts.headings,
        counts.notes,
        counts.column_headers,
        counts.blank_rows,
        counts.rows,
        counts.lives
    )
}

/// One section, its rows one to a line so that a changed life is a one-line difference.
fn section_json(section: &Section, indent: &str, out: &mut String) {
    out.push_str(&format!(
        "{indent}{{\"heading\": {}, \"anzsic\": {}, \"note\": {}, \"rows\": [\n",
        quote_or_null(section.heading.as_deref()),
        quote_or_null(section.anzsic.as_deref()),
        quote_or_null(section.note.as_deref())
    ));
    for (index, row) in section.rows.iter().enumerate() {
        let (years, months) = row.life.as_ref().map_or_else(
            || ("null".to_owned(), "null".to_owned()),
            |life| (quote(&life.years), life.months.to_string()),
        );
        out.push_str(&format!(
            "{indent}  [{}, {}, {years}, {months}, {}, {}]{}\n",
            quote(&row.asset),
            row.depth,
            quote(&row.flags),
            quote_or_null(row.last_updated.as_deref()),
            if index + 1 == section.rows.len() {
                ""
            } else {
                ","
            }
        ));
    }
    out.push_str(&format!("{indent}]}}"));
}

fn sections_json(sections: &[Section], indent: &str, out: &mut String) {
    for (index, section) in sections.iter().enumerate() {
        section_json(section, indent, out);
        out.push_str(if index + 1 == sections.len() {
            "\n"
        } else {
            ",\n"
        });
    }
}

/// The text of the data file for the tables, the source file's digest and its details.
pub fn render(determination: &Determination, sha256: &str, source: &Source) -> String {
    let mut out = String::from("{\n  \"schema_version\": 1,\n");
    out.push_str(&format!("  \"description\": {},\n", quote(DESCRIPTION)));
    out.push_str("  \"source\": {\n");
    let (registered, read) = (source.registered.to_string(), source.read.to_string());
    let pairs = [
        ("title", determination.title.as_str()),
        ("register_id", source.register_id.as_str()),
        ("made", determination.made.as_str()),
        ("registered", registered.as_str()),
        ("url", source.url.as_str()),
        ("file", SOURCE_FILE),
        ("file_sha256", sha256),
        ("read", read.as_str()),
        ("licence", SOURCE_LICENCE),
        ("licence_url", SOURCE_LICENCE_URL),
        ("changes", CHANGES),
    ];
    for (key, value) in pairs {
        out.push_str(&format!("    \"{key}\": {},\n", quote(value)));
    }
    out.push_str(&format!(
        "    \"attribution\": {}\n  }},\n",
        quote(&attribution(source.read))
    ));
    for (key, value) in [
        ("licence", LICENCE),
        ("licence_url", LICENCE_URL),
        ("advice_status", ADVICE_STATUS),
    ] {
        out.push_str(&format!("  \"{key}\": {},\n", quote(value)));
    }
    let columns: Vec<String> = COLUMNS.iter().map(|c| quote(c)).collect();
    out.push_str(&format!("  \"columns\": [{}],\n", columns.join(", ")));
    out.push_str(&format!(
        "  \"counts\": {{\n    \"table_a\": {},\n    \"table_b\": {}\n  }},\n",
        counts_json(&determination.counts_a),
        counts_json(&determination.counts_b)
    ));
    out.push_str("  \"table_a\": [\n");
    for (index, division) in determination.table_a.iter().enumerate() {
        out.push_str(&format!(
            "    {{\"heading\": {}, \"anzsic\": {}, \"sections\": [\n",
            quote(&division.heading),
            quote(&division.anzsic)
        ));
        sections_json(&division.sections, "      ", &mut out);
        out.push_str(if index + 1 == determination.table_a.len() {
            "    ]}\n"
        } else {
            "    ]},\n"
        });
    }
    out.push_str("  ],\n  \"table_b\": [\n");
    sections_json(&determination.table_b, "    ", &mut out);
    out.push_str("  ]\n}\n");
    out
}

/// The words the Federal Register of Legislation's terms of use require for content that
/// has been changed, with the full date of the download.
fn attribution(read: NaiveDate) -> String {
    format!(
        "Based on content from the Federal Register of Legislation at {}. For the latest \
         information on Australian Government legislation please go to \
         https://www.legislation.gov.au.",
        read.format("%-d %B %Y")
    )
}

/// A date given as YYYY-MM-DD.
fn iso(text: &str, what: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(text, "%Y-%m-%d")
        .map_err(|_| format!("{what}: '{text}' is not a date as YYYY-MM-DD"))
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// The data file's text for a source file, or the reasons it could not be built.
pub fn build(source_file: &Path, source: &Source) -> Result<String> {
    let bytes = std::fs::read(source_file)
        .map_err(|e| py::oserror_str(&e, &source_file.to_string_lossy(), py::OsStyle::Errno))?;
    let text = std::str::from_utf8(&bytes)
        .map_err(|e| format!("{}: {e}", source_file.to_string_lossy()))?;
    let determination =
        parse(text, &NESTING_CORRECTIONS).map_err(|failures| failures.join("\n"))?;
    Ok(render(&determination, &sha256_hex(&bytes), source))
}

fn data_path(root: &Path) -> PathBuf {
    py::resolve(root).join(DATA_REL)
}

/// The source details the committed file records, for a rebuild to compare against it.
fn committed_source(text: &str) -> Result<Source> {
    let document = pyjson::loads(text).map_err(|e| format!("{DATA_REL}: {}", e.0))?;
    let field = |key: &str| {
        document
            .get("source")
            .and_then(|source| source.get(key))
            .and_then(Json::as_str)
            .map(str::to_owned)
            .ok_or_else(|| format!("{DATA_REL}: source.{key} is missing"))
    };
    Ok(Source {
        register_id: field("register_id")?,
        registered: iso(&field("registered")?, "source.registered")?,
        url: field("url")?,
        read: iso(&field("read")?, "source.read")?,
    })
}

fn say(text: &str, stderr: bool) -> Result<()> {
    crate::print_text(text, stderr).map_err(|e| e.to_string())
}

fn usage_error(message: &str) -> Result<u8> {
    say(
        &format!("{USAGE}site-tools build_effective_life: error: {message}\n"),
        true,
    )?;
    Ok(2)
}

pub fn run(root: &Path, args: &[String]) -> Result<u8> {
    const VALUES: [&str; 5] = [
        "--source",
        "--register-id",
        "--registered",
        "--source-url",
        "--read",
    ];
    let (mut write, mut check) = (false, false);
    let mut values: [Option<&str>; 5] = [None; 5];
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                say(HELP, false)?;
                return Ok(0);
            }
            "--write" => write = true,
            "--check" => check = true,
            name => {
                let Some(slot) = VALUES.iter().position(|v| *v == name) else {
                    return usage_error(&format!("unrecognized arguments: {name}"));
                };
                let Some(value) = rest.next() else {
                    return usage_error(&format!("argument {name}: expected one argument"));
                };
                values[slot] = Some(value);
            }
        }
    }
    if write == check {
        return usage_error("one of the arguments --write --check is required");
    }
    let [source_file, register_id, registered, url, read] = values;
    let Some(source_file) = source_file else {
        return usage_error("the following arguments are required: --source");
    };
    let target = data_path(root);
    if write {
        let (Some(register_id), Some(registered), Some(url), Some(read)) =
            (register_id, registered, url, read)
        else {
            return usage_error(
                "--write needs --register-id, --registered, --source-url and --read",
            );
        };
        let (registered, read) = match (iso(registered, "--registered"), iso(read, "--read")) {
            (Ok(registered), Ok(read)) => (registered, read),
            (Err(message), _) | (_, Err(message)) => {
                return usage_error(&format!("argument {message}"));
            }
        };
        let source = Source {
            register_id: register_id.to_owned(),
            registered,
            url: url.to_owned(),
            read,
        };
        let text = build(Path::new(source_file), &source)?;
        std::fs::write(&target, text)
            .map_err(|e| py::oserror_str(&e, &target.to_string_lossy(), py::OsStyle::Errno))?;
        say(&format!("{DATA_REL} written\n"), false)?;
        return Ok(0);
    }
    let committed = crate::read(&target)?;
    let expected = build(Path::new(source_file), &committed_source(&committed)?)?;
    if committed == expected {
        say(&format!("{DATA_REL} matches the source\n"), false)?;
        return Ok(0);
    }
    say(
        &format!(
            "effective life: {DATA_REL} differs from the source; rebuild it with --write and review the difference\n"
        ),
        false,
    )?;
    Ok(1)
}
