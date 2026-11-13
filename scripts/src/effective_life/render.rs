// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! Writing the tables as the data file's text.
use super::*;
use crate::pyjson::{self, Dump, Json};
use chrono::NaiveDate;

pub(super) fn quote(text: &str) -> String {
    pyjson::dumps(
        &Json::Str(text.to_owned()),
        Dump {
            ensure_ascii: false,
            ..Dump::default()
        },
    )
}

pub(super) fn quote_or_null(text: Option<&str>) -> String {
    text.map_or_else(|| "null".to_owned(), quote)
}

pub(super) fn counts_json(counts: &Counts) -> String {
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
pub(super) fn section_json(section: &Section, indent: &str, out: &mut String) {
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

pub(super) fn sections_json(sections: &[Section], indent: &str, out: &mut String) {
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
    source_json(determination, sha256, source, &mut out);
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

/// The `source` object: what was read, where and when, with the Register's attribution.
fn source_json(determination: &Determination, sha256: &str, source: &Source, out: &mut String) {
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
}

/// The words the Federal Register of Legislation's terms of use require for content that
/// has been changed, with the full date of the download.
pub(super) fn attribution(read: NaiveDate) -> String {
    format!(
        "Based on content from the Federal Register of Legislation at {}. For the latest \
         information on Australian Government legislation please go to \
         https://www.legislation.gov.au.",
        read.format("%-d %B %Y")
    )
}
