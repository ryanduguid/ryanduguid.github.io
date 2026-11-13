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
use chrono::NaiveDate;

mod cells;
mod command;
mod reader;
mod render;

pub use command::{build, run};
pub use reader::parse;
pub use render::render;

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
