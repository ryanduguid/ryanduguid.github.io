// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! Walking Schedule 2's tables into divisions, sections and rows.
use super::cells::*;
use super::*;
use roxmltree::Node;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Table {
    A,
    B,
}

pub(super) struct Reader<'c> {
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
