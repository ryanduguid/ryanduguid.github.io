// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! What every page can look up: the data, the addresses and the rows that share wording.
use super::load::{Data, Entry, Group, Table};
use super::{BASE_URL, Kind, Plan, Result, address, asset, group, unique};
use std::collections::HashMap;

/// A row with a life, by its group and its place there: `None` for a Table B top-level row.
pub type RowRef = (usize, Option<usize>);

pub struct Site<'a> {
    pub data: &'a Data,
    pub plan: &'a Plan,
    /// The rows with a life whose own wording, without asides, gives the same words.
    pub same_words: HashMap<Vec<String>, Vec<RowRef>>,
    /// Each page's H1, title and description, by address; no 2 pages share one.
    heads: HashMap<&'a str, Head>,
}

/// What names a page: its H1 (also the end of its trail), its title and description.
pub struct Head {
    pub h1: String,
    pub title: String,
    pub description: String,
}

/// Each page's candidates for its H1, title and description, plainest first.
fn candidates(data: &Data, plan: &Plan) -> [Vec<Vec<String>>; 3] {
    let mut out: [Vec<Vec<String>>; 3] = Default::default();
    for page in &plan.pages {
        let [h1, title, description] = match page.kind {
            Kind::Index(table) => group::index_candidates(&data.source, table),
            Kind::Group => group::candidates(&data.groups[page.group]),
            Kind::Asset(row) => {
                let group = &data.groups[page.group];
                let entry = self_entry(data, (page.group, row));
                let life = entry
                    .life
                    .as_ref()
                    .expect("an asset page is for a row with a life");
                [
                    asset::h1_candidates(group, entry),
                    asset::title_candidates(group, entry, life),
                    asset::description_candidates(&data.source, group, entry, life),
                ]
            }
        };
        out[0].push(h1);
        out[1].push(title);
        out[2].push(description);
    }
    out
}

/// The words a row is matched on across groups: its wording without bracketed asides.
pub fn key(text: &str) -> Vec<String> {
    address::words(&address::core(text))
}

impl<'a> Site<'a> {
    pub fn new(data: &'a Data, plan: &'a Plan) -> Result<Self> {
        let mut same_words: HashMap<Vec<String>, Vec<RowRef>> = HashMap::new();
        for page in &plan.pages {
            if let Kind::Asset(entry) = page.kind {
                let row = (page.group, entry);
                same_words
                    .entry(key(self_entry(data, row).text()))
                    .or_default()
                    .push(row);
            }
        }
        let [h1s, titles, descriptions] = candidates(data, plan);
        let h1s = unique::settle("heading", &h1s)?;
        let titles = unique::settle("title", &titles)?;
        let descriptions = unique::settle("description", &descriptions)?;
        let heads = plan
            .pages
            .iter()
            .zip(h1s.into_iter().zip(titles).zip(descriptions))
            .map(|(page, ((h1, title), description))| {
                (
                    page.url.as_str(),
                    Head {
                        h1,
                        title,
                        description,
                    },
                )
            })
            .collect();
        Ok(Site {
            data,
            plan,
            same_words,
            heads,
        })
    }

    /// The settled H1, title and description of the page at an address.
    pub fn head(&self, url: &str) -> &Head {
        self.heads.get(url).expect("every page has a head")
    }

    pub fn group(&self, index: usize) -> &'a Group {
        &self.data.groups[index]
    }

    pub fn entry(&self, row: RowRef) -> &'a Entry {
        self_entry(self.data, row)
    }

    /// The address of a row with a life.
    pub fn url(&self, (group, entry): RowRef) -> &'a str {
        match entry {
            None => &self.plan.group_urls[group],
            Some(entry) => self.plan.entry_urls[group][entry]
                .as_deref()
                .expect("a row with a life has an address"),
        }
    }

    /// The group named exactly by a cross-reference such as 'see Table B Computers'; the
    /// determination writes 'See' as well as 'see'.
    pub fn cross_reference(&self, text: &str) -> Option<&'a str> {
        let (_, target) = text
            .split_once(" – see Table ")
            .or_else(|| text.split_once(" – See Table "))?;
        let (table, name) = target.split_at_checked(2)?;
        let table = match table {
            "A " => Table::A,
            "B " => Table::B,
            _ => return None,
        };
        let name = name.split(" (").next().unwrap_or(name).trim();
        let found = self.data.groups.iter().position(|group| {
            group.table == table && address::core(&group.heading).trim() == name && !group.general
        })?;
        Some(&self.plan.group_urls[found])
    }
}

fn self_entry(data: &Data, (group, entry): RowRef) -> &Entry {
    let group = &data.groups[group];
    match entry {
        None => group
            .top
            .as_ref()
            .expect("a Table B group has its top-level row"),
        Some(entry) => &group.entries[entry],
    }
}

/// The name of a group as its pages show it: Table B headings lose their trailing colon.
pub fn group_name(group: &Group) -> String {
    group.heading.trim_end_matches(':').to_owned()
}

/// The index pages that list every group of a table.
pub fn index_url(table: Table) -> String {
    format!("{BASE_URL}{}/", address::folder(table))
}

pub fn index_name(table: Table) -> &'static str {
    match table {
        Table::A => "Table A: effective lives by industry",
        Table::B => "Table B: effective lives by asset",
    }
}
