// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! `site-tools build_effective_life_pages`: write and check a page for every effective
//! life in `tools/depreciation-rates/effective-life.json`, a page for each Table A
//! sub-industry and each top-level Table B row with rows under it, an index page for each
//! table, a text mirror of each page, the family's sitemap, its section `llms.txt` and the
//! address map, under `tools/depreciation-rates/`. The pages are committed, because GitHub
//! Pages builds this site from the branch with no step of its own; `--check` rebuilds them
//! in memory and fails on any difference.
pub mod address;
mod asset;
mod command;
mod figures;
mod group;
mod head;
mod json_ld;
pub mod load;
pub mod map;
mod notes;
mod site;
mod unique;

pub use command::{Build, LLMS_REL, SITEMAP_REL, files, run};
pub use head::{CARD as SOCIAL_CARD, DANGLING_WORDS, SYMBOLS, TITLE_MAX};
use load::{Data, Group, Table};
use map::AddressMap;
pub use notes::guide_terms;

type Result<T> = std::result::Result<T, String>;

/// A breadcrumb trail: each step's name and address, the page itself last.
type Trail = Vec<(String, String)>;

/// Where the pages live, below the site root, and the address they share.
pub const BASE: &str = "tools/depreciation-rates";
pub const BASE_URL: &str = "/tools/depreciation-rates/";
/// The folders the generator owns; it writes nothing else except the files `command`
/// names beside them.
pub const FOLDERS: [&str; 2] = ["industry", "asset"];

/// True for a path below the site root, such as
/// `tools/depreciation-rates/asset/computers/index.html`, inside the generated family.
pub fn is_page(rel: &str) -> bool {
    FOLDERS.iter().any(|folder| {
        rel.strip_prefix(BASE)
            .and_then(|rest| rest.strip_prefix('/'))
            .is_some_and(|rest| rest.starts_with(&format!("{folder}/")))
    })
}
/// The dates every page is first rendered with; `command` puts each page's own dates from
/// the address map in their place, so a page's content hash leaves its dates out.
pub const SENTINEL_PUBLISHED: &str = "1900-01-01";
pub const SENTINEL_MODIFIED: &str = "1900-01-02";

/// One page: a group, a row with a life, or a table's index.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Kind {
    Group,
    /// A row with a life, by its index in its group's entries; a Table B top-level row
    /// with a life and no rows under it has `None`, and its group's address.
    Asset(Option<usize>),
    Index(Table),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Page {
    pub group: usize,
    pub kind: Kind,
    /// What names the page in the address map: the table, then the group heading, then
    /// the row's headings and wording.
    pub key: Vec<String>,
    /// The page's address, such as `/tools/depreciation-rates/asset/computers/laptops/`.
    pub url: String,
}

/// The address of each group and of each of its rows that has a life, and every page.
pub struct Plan {
    pub group_urls: Vec<String>,
    /// For each group, the address of each entry; `None` for an entry with no life.
    pub entry_urls: Vec<Vec<Option<String>>>,
    pub pages: Vec<Page>,
}

/// A Table B top-level row with its own life is an asset page.
fn is_leaf(group: &Group) -> bool {
    group.top.as_ref().is_some_and(|top| top.life.is_some())
}

/// A Table B top-level row that only points to another row has no page.
pub fn is_cross_reference(group: &Group) -> bool {
    group.table == Table::B && !is_leaf(group) && group.entries.is_empty()
}

fn table_key(table: Table) -> String {
    match table {
        Table::A => "A".into(),
        Table::B => "B".into(),
    }
}

/// The address a key keeps from the map, or else the rule's address, made unique against
/// every address the map holds by adding a digest of the key.
fn settle(map: &AddressMap, key: &[String], rule: String) -> String {
    if let Some(record) = map.get(key) {
        return record.url.clone();
    }
    if !map.has_url(&rule) {
        return rule;
    }
    let digest = address::digest(&key.join("\n"));
    format!("{}-{digest}/", rule.trim_end_matches('/'))
}

fn group_pages(
    plan: &mut Plan,
    map: &AddressMap,
    index: usize,
    group: &Group,
    slug: &str,
) -> Result<()> {
    let group_key = vec![table_key(group.table), group.heading.clone()];
    let url = settle(
        map,
        &group_key,
        format!("{BASE_URL}{}/{slug}/", address::folder(group.table)),
    );
    if is_leaf(group) && !group.entries.is_empty() {
        return Err(format!(
            "Table B '{}' has a life and rows under it",
            group.heading
        ));
    }
    if !is_cross_reference(group) {
        let kind = if is_leaf(group) {
            Kind::Asset(None)
        } else {
            Kind::Group
        };
        plan.pages.push(Page {
            group: index,
            kind,
            key: group_key.clone(),
            url: url.clone(),
        });
    }
    let urls = row_pages(plan, map, index, group, slug, &group_key, &url)?;
    plan.group_urls.push(url);
    plan.entry_urls.push(urls);
    Ok(())
}

/// The pages of a group's rows, each under the group's address; `None` for a heading.
fn row_pages(
    plan: &mut Plan,
    map: &AddressMap,
    index: usize,
    group: &Group,
    slug: &str,
    group_key: &[String],
    url: &str,
) -> Result<Vec<Option<String>>> {
    let slugs = address::entry_slugs(slug, &group.entries)?;
    let mut urls = Vec::with_capacity(slugs.len());
    for (at, (entry, row)) in group.entries.iter().zip(slugs).enumerate() {
        let Some(row) = row else {
            urls.push(None);
            continue;
        };
        let key: Vec<String> = group_key.iter().chain(&entry.path).cloned().collect();
        let row_url = settle(map, &key, format!("{url}{row}/"));
        plan.pages.push(Page {
            group: index,
            kind: Kind::Asset(Some(at)),
            key,
            url: row_url.clone(),
        });
        urls.push(Some(row_url));
    }
    Ok(urls)
}

/// Every page and its address, in the instrument's order after the 2 index pages: an
/// address the map holds for a page's key, else the address rule's.
pub fn plan_with(data: &Data, map: &AddressMap) -> Result<Plan> {
    let slugs = address::group_slugs(&data.groups)?;
    let mut plan = Plan {
        group_urls: Vec::new(),
        entry_urls: Vec::new(),
        pages: Vec::new(),
    };
    for table in [Table::A, Table::B] {
        let key = vec![table_key(table)];
        let url = settle(map, &key, site::index_url(table));
        plan.pages.push(Page {
            group: 0,
            kind: Kind::Index(table),
            key,
            url,
        });
    }
    for (index, (group, slug)) in data.groups.iter().zip(&slugs).enumerate() {
        group_pages(&mut plan, map, index, group, slug)?;
    }
    let mut seen = std::collections::HashSet::new();
    if let Some(page) = plan
        .pages
        .iter()
        .find(|page| !seen.insert(page.url.as_str()))
    {
        return Err(format!("{} would hold 2 pages", page.url));
    }
    Ok(plan)
}

/// The address rule's plan, as for a first build with no address map.
pub fn plan(data: &Data) -> Result<Plan> {
    plan_with(data, &AddressMap::default())
}

/// The HTML of one page, with the sentinel dates.
pub fn render(site: &site::Site, page: &Page) -> String {
    head::symbols(&match page.kind {
        Kind::Index(table) => group::render_index(site, table),
        Kind::Group => group::render(site, page.group),
        Kind::Asset(entry) => asset::render(site, (page.group, entry)),
    })
}
