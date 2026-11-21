// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Read the data file into the groups the pages are made from.
use super::Result;
use crate::effective_life::{DATA_REL, Life};
use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Table {
    A,
    B,
}

/// One row of the instrument with the headings above it in its group.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    /// The headings above the row inside its group, then the row's own text.
    pub path: Vec<String>,
    pub life: Option<Life>,
    pub flags: String,
    pub last_updated: Option<String>,
}

impl Entry {
    pub fn text(&self) -> &str {
        self.path.last().map_or("", String::as_str)
    }
}

/// A Table A sub-industry (or a division's general rows), or a top-level Table B row
/// with the rows under it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Group {
    pub table: Table,
    /// The sub-industry or division in Table A; the top-level row's text in Table B.
    pub heading: String,
    /// The Table A division, or the Table B letter.
    pub parent: String,
    pub anzsic: Option<String>,
    pub note: Option<String>,
    /// A division's rows that sit under no sub-industry.
    pub general: bool,
    /// Table B only: the top-level row itself, which carries a life when it has no rows.
    pub top: Option<Entry>,
    /// The rows inside the group, in the instrument's order.
    pub entries: Vec<Entry>,
}

/// The source details each page states.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Source {
    pub title: String,
    pub register_id: String,
    pub registered: String,
    pub url: String,
    pub read: String,
    pub attribution: String,
    pub licence_url: String,
}

impl Source {
    /// The determination's year, which its title ends with, such as '2025'.
    pub fn year(&self) -> &str {
        self.title.rsplit(' ').next().unwrap_or_default()
    }
}

pub struct Data {
    pub source: Source,
    pub groups: Vec<Group>,
}

fn text(value: &Value, key: &str) -> Result<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("{DATA_REL}: {key} is missing or not text"))
}

fn optional(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

/// A row's cells: `(text, depth, life, flags, last_updated)`.
type Row = (String, usize, Option<Life>, String, Option<String>);

/// One row array as its cells.
fn row(value: &Value) -> Result<Row> {
    let bad =
        || format!("{DATA_REL}: a row is not [asset, depth, years, months, flags, date]: {value}");
    let cells = value
        .as_array()
        .filter(|cells| cells.len() == 6)
        .ok_or_else(bad)?;
    let asset = cells[0].as_str().ok_or_else(bad)?.to_owned();
    let depth = cells[1].as_u64().ok_or_else(bad)? as usize;
    let life = match (&cells[2], &cells[3]) {
        (Value::Null, Value::Null) => None,
        (Value::String(years), Value::Number(months)) => Some(Life {
            years: years.clone(),
            months: months
                .as_u64()
                .and_then(|m| u32::try_from(m).ok())
                .filter(|&m| m > 0)
                .ok_or_else(bad)?,
        }),
        _ => return Err(bad()),
    };
    let flags = cells[4].as_str().ok_or_else(bad)?.to_owned();
    let date = match &cells[5] {
        Value::Null => None,
        Value::String(day) => Some(day.clone()),
        _ => return Err(bad()),
    };
    Ok((asset, depth, life, flags, date))
}

/// The rows of one section, each with the headings above it. `skip` drops that many
/// leading headings from each path: Table B paths start below the top-level row.
fn entries(rows: &[Value], skip: usize) -> Result<Vec<Entry>> {
    let mut stack: Vec<String> = Vec::new();
    let mut out = Vec::new();
    for value in rows {
        let (asset, depth, life, flags, last_updated) = row(value)?;
        if depth > stack.len() {
            return Err(format!("{DATA_REL}: '{asset}' is nested below no heading"));
        }
        stack.truncate(depth);
        stack.push(asset);
        if stack.len() > skip {
            out.push(Entry {
                path: stack[skip..].to_vec(),
                life,
                flags,
                last_updated,
            });
        }
    }
    Ok(out)
}

fn array<'a>(value: &'a Value, key: &str) -> Result<&'a Vec<Value>> {
    value
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{DATA_REL}: {key} is missing or not a list"))
}

fn table_a(document: &Value) -> Result<Vec<Group>> {
    let mut groups = Vec::new();
    for division in array(document, "table_a")? {
        let parent = text(division, "heading")?;
        for section in array(division, "sections")? {
            let heading = optional(section, "heading");
            groups.push(Group {
                table: Table::A,
                general: heading.is_none(),
                heading: heading.unwrap_or_else(|| parent.clone()),
                parent: parent.clone(),
                anzsic: optional(section, "anzsic").or_else(|| optional(division, "anzsic")),
                note: optional(section, "note"),
                top: None,
                entries: entries(array(section, "rows")?, 0)?,
            });
        }
    }
    Ok(groups)
}

/// Each top-level Table B row starts a group of the rows nested under it.
fn table_b(document: &Value) -> Result<Vec<Group>> {
    let mut groups = Vec::new();
    for letter in array(document, "table_b")? {
        let parent = text(letter, "heading")?;
        let rows = array(letter, "rows")?;
        let starts: Vec<usize> = (0..rows.len())
            .filter(|&i| rows[i].get(1) == Some(&Value::from(0)))
            .collect();
        if starts.first() != Some(&0) {
            return Err(format!(
                "{DATA_REL}: Table B {parent} does not start with a top-level row"
            ));
        }
        for (n, &start) in starts.iter().enumerate() {
            let end = starts.get(n + 1).copied().unwrap_or(rows.len());
            let top = entries(&rows[start..start + 1], 0)?.remove(0);
            groups.push(Group {
                table: Table::B,
                heading: top.text().to_owned(),
                parent: parent.clone(),
                anzsic: None,
                note: optional(letter, "note"),
                general: false,
                top: Some(top),
                entries: entries(&rows[start..end], 1)?,
            });
        }
    }
    Ok(groups)
}

fn source(document: &Value) -> Result<Source> {
    let source = document
        .get("source")
        .ok_or_else(|| format!("{DATA_REL}: source is missing"))?;
    let title = text(source, "title")?;
    if !title
        .rsplit(' ')
        .next()
        .is_some_and(|year| year.len() == 4 && year.bytes().all(|b| b.is_ascii_digit()))
    {
        return Err(format!(
            "{DATA_REL}: source title '{title}' does not end with its year"
        ));
    }
    Ok(Source {
        title,
        register_id: text(source, "register_id")?,
        registered: text(source, "registered")?,
        url: text(source, "url")?,
        read: text(source, "read")?,
        attribution: text(source, "attribution")?,
        licence_url: text(source, "licence_url")?,
    })
}

/// The groups of the data file's text, Table A then Table B, in the instrument's order.
pub fn load(raw: &str) -> Result<Data> {
    let document: Value = serde_json::from_str(raw).map_err(|e| format!("{DATA_REL}: {e}"))?;
    let mut groups = table_a(&document)?;
    groups.extend(table_b(&document)?);
    Ok(Data {
        source: source(&document)?,
        groups,
    })
}
