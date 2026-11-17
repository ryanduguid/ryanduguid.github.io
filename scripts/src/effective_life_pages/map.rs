// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! The committed address map: each page's key, address, dates and content hash. Once a
//! page is in the map its address never changes, and its dates move only when its
//! content does.
use super::Result;
use jiff::civil::Date;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

pub const MAP_REL: &str = "tools/depreciation-rates/effective-life-pages.json";
const DESCRIPTION: &str = "The address, dates and content hash of every page under /tools/depreciation-rates/industry/ and /tools/depreciation-rates/asset/. key names the page: the table alone for an index page, the table and group heading for a group page, and for a row also its headings and wording as the determination prints them. site-tools build_effective_life_pages writes this file: an address, once here, does not change, published does not move, and modified moves only when the page's content, whose SHA-256 without its dates is sha256, changes.";

/// One page as the map records it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Record {
    pub key: Vec<String>,
    pub url: String,
    pub published: String,
    pub modified: String,
    pub sha256: String,
}

/// The map's records by key, in the file's order.
#[derive(Default)]
pub struct AddressMap {
    pub records: Vec<Record>,
    by_key: HashMap<Vec<String>, usize>,
    urls: HashSet<String>,
}

fn text(item: &Value, name: &str) -> Result<String> {
    item.get(name)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("{MAP_REL}: a page has no {name}"))
}

fn record(item: &Value) -> Result<Record> {
    let key = item
        .get("key")
        .and_then(Value::as_array)
        .and_then(|parts| {
            parts
                .iter()
                .map(|part| part.as_str().map(str::to_owned))
                .collect::<Option<Vec<_>>>()
        })
        .ok_or_else(|| format!("{MAP_REL}: a page has no key"))?;
    let record = Record {
        key,
        url: text(item, "url")?,
        published: text(item, "published")?,
        modified: text(item, "modified")?,
        sha256: text(item, "sha256")?,
    };
    // The map is edited by hand when a row goes: a bad address would write outside the
    // family's folders.
    if !family_url(&record.url) {
        return Err(format!(
            "{MAP_REL}: {} is not an address under /tools/depreciation-rates/industry/ or /tools/depreciation-rates/asset/",
            record.url
        ));
    }
    for day in [&record.published, &record.modified] {
        if Date::strptime("%Y-%m-%d", day).is_err() {
            return Err(format!(
                "{MAP_REL}: {} has the date {day}, not YYYY-MM-DD",
                record.url
            ));
        }
    }
    if record.sha256.len() != 64
        || !record
            .sha256
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return Err(format!("{MAP_REL}: {} has no SHA-256 hash", record.url));
    }
    Ok(record)
}

/// Whether an address is an index page of the family or 1 or 2 folders below one, each of
/// lower-case letters, digits and hyphens.
fn family_url(url: &str) -> bool {
    let Some(rest) = [
        "/tools/depreciation-rates/industry/",
        "/tools/depreciation-rates/asset/",
    ]
    .iter()
    .find_map(|base| url.strip_prefix(base)) else {
        return false;
    };
    let folders: Vec<&str> = rest.split_terminator('/').collect();
    (rest.is_empty() || rest.ends_with('/'))
        && folders.len() <= 2
        && folders.iter().all(|folder| {
            !folder.is_empty()
                && folder
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
}

impl AddressMap {
    pub fn new(records: Vec<Record>) -> Result<Self> {
        let mut by_key = HashMap::new();
        let mut urls = HashSet::new();
        for (at, record) in records.iter().enumerate() {
            if by_key.insert(record.key.clone(), at).is_some() {
                return Err(format!("{MAP_REL}: the key {:?} repeats", record.key));
            }
            if !urls.insert(record.url.clone()) {
                return Err(format!("{MAP_REL}: the address {} repeats", record.url));
            }
        }
        Ok(AddressMap {
            records,
            by_key,
            urls,
        })
    }

    pub fn parse(raw: &str) -> Result<Self> {
        let value: Value = serde_json::from_str(raw).map_err(|e| format!("{MAP_REL}: {e}"))?;
        let pages = value
            .get("pages")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("{MAP_REL}: no pages"))?;
        Self::new(pages.iter().map(record).collect::<Result<Vec<_>>>()?)
    }

    pub fn get(&self, key: &[String]) -> Option<&Record> {
        self.by_key.get(key).map(|&at| &self.records[at])
    }

    pub fn has_url(&self, url: &str) -> bool {
        self.urls.contains(url)
    }

    /// The file's text: one page a line, so a refresh's diff shows each page that changed.
    pub fn to_text(&self) -> String {
        let mut out = format!(
            "{{\n  \"schema_version\": 1,\n  \"description\": {},\n  \"pages\": [\n",
            json!(DESCRIPTION)
        );
        for (at, record) in self.records.iter().enumerate() {
            let line = json!({
                "key": record.key,
                "url": record.url,
                "published": record.published,
                "modified": record.modified,
                "sha256": record.sha256,
            });
            let comma = if at + 1 < self.records.len() { "," } else { "" };
            out.push_str(&format!("    {line}{comma}\n"));
        }
        out.push_str("  ]\n}\n");
        out
    }
}
