// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The `build_effective_life_pages` command: every file the family holds, written or
//! compared with what is committed.
use super::figures::date;
use super::head::{ORIGIN, esc};
use super::load::Table;
use super::load::load;
use super::map::{AddressMap, MAP_REL, Record};
use super::site::Site;
use super::{
    BASE, BASE_URL, FOLDERS, Kind, Page, Result, SENTINEL_MODIFIED, SENTINEL_PUBLISHED, plan_with,
    render,
};
use crate::effective_life::DATA_REL;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::path::Path;

const USAGE: &str = include_str!("../help/build_effective_life_pages.usage");
const HELP: &str = include_str!("../help/build_effective_life_pages.txt");
/// The family's own sitemap, which `robots.txt` names beside the site's.
pub const SITEMAP_REL: &str = "tools/depreciation-rates/sitemap.xml";
/// The section `llms.txt` that lists the index and group pages, not every row.
pub const LLMS_REL: &str = "tools/depreciation-rates/llms.txt";
/// The links from the depreciation rates page to the index and group pages, which that
/// page includes, so readers and crawlers without JavaScript reach every page.
pub const INCLUDE_REL: &str = "_includes/effective-life-groups.html";
/// The site's IndexNow key, which `/<key>.txt` holds. IndexNow reads the key from that
/// public file, so the key is no secret; it only proves the site sent the list.
pub const INDEXNOW_KEY: &str = "d8fee9bfe727ec519b462f3401e7a0ae";

const PARSER: crate::pyargs::Parser = crate::pyargs::Parser {
    prog: "site-tools build_effective_life_pages",
    usage: USAGE,
    help: HELP,
    flags: &["--write", "--check", "--indexnow"],
    exclusive: &["--write", "--check", "--indexnow"],
    required: true,
};

/// What a build would write, and what it cannot settle by itself.
pub struct Build {
    /// Every file of the family by its path below the site root.
    pub files: BTreeMap<String, String>,
    /// Pages the map holds that the data no longer has: their addresses would go.
    pub gone: Vec<Record>,
    /// Pages that are new or changed, which need `--write` to date them.
    pub undated: Vec<String>,
}

/// A path below the site root for a page address and a file name.
fn file_rel(url: &str, name: &str) -> String {
    format!("{}{name}", url.trim_start_matches('/'))
}

fn sitemap(records: &[Record]) -> String {
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for record in records {
        out.push_str(&format!(
            "  <url>\n    <loc>{ORIGIN}{}</loc>\n    <lastmod>{}</lastmod>\n  </url>\n",
            record.url, record.modified
        ));
    }
    out.push_str("</urlset>\n");
    out
}

/// The page with its own dates in place of the sentinels.
fn dated(html: &str, published: &str, modified: &str) -> String {
    html.replace(SENTINEL_PUBLISHED, published)
        .replace(SENTINEL_MODIFIED, modified)
        .replace(&date(SENTINEL_PUBLISHED), &date(published))
        .replace(&date(SENTINEL_MODIFIED), &date(modified))
}

/// A page's dates: kept from the map while its content is unchanged, else `today`.
fn dates(
    build: &mut Build,
    map: &AddressMap,
    page: &Page,
    hash: &str,
    today: Option<&str>,
) -> (String, String) {
    let kept = map.get(&page.key);
    if let Some(record) = kept.filter(|record| record.sha256 == hash) {
        return (record.published.clone(), record.modified.clone());
    }
    let today = today.unwrap_or_else(|| {
        build.undated.push(page.url.clone());
        SENTINEL_MODIFIED
    });
    (
        kept.map_or_else(|| today.to_owned(), |record| record.published.clone()),
        today.to_owned(),
    )
}

/// The section `llms.txt`: the 2 index pages, every group page and the data file.
fn llms(site: &Site, records: &[Record]) -> String {
    let mut out = format!(
        "# Effective lives of depreciating assets\n\n> One page for each of the {} effective lives in Schedule 2 of the {} ({}), grouped by Table A industry and Table B asset. This file lists the index and group pages; each group page links its rows.\n\n## Data\n\n- [Effective life tables JSON]({ORIGIN}{BASE_URL}effective-life.json): every row of Schedule 2 in the instrument's order.\n- [Sitemap of these pages]({ORIGIN}/{SITEMAP_REL}): every page, with the date it last changed.\n\n## Pages\n\n",
        super::figures::count(
            site.plan
                .pages
                .iter()
                .filter(|page| matches!(page.kind, Kind::Asset(_)))
                .count()
        ),
        site.data.source.title,
        site.data.source.register_id,
    );
    for (page, record) in site.plan.pages.iter().zip(records) {
        let name = match page.kind {
            Kind::Index(table) => super::site::index_name(table).to_owned(),
            Kind::Group => super::site::group_name(site.group(page.group)),
            Kind::Asset(_) => continue,
        };
        out.push_str(&format!("- [{name}]({ORIGIN}{})\n", record.url));
    }
    out
}

/// The include that lists each table's index page and its group pages, as links.
fn include(site: &Site) -> String {
    let mut out = format!(
        "<section id=\"every-life\">\n<h2>A page for every life</h2>\n<p>Each of the {} effective lives has its own page, linked from its industry in Table A or its asset in Table B.</p>\n",
        super::figures::count(
            site.plan
                .pages
                .iter()
                .filter(|page| matches!(page.kind, Kind::Asset(_)))
                .count()
        ),
    );
    for table in [Table::A, Table::B] {
        let index = site
            .plan
            .pages
            .iter()
            .find(|page| page.kind == Kind::Index(table))
            .expect("plan_with adds each table's index page");
        let (lists, groups) = group_lists(site, table);
        out.push_str(&format!(
            "<details>\n<summary>{} ({groups} pages)</summary>\n<p><a href=\"{}\">{}</a></p>\n{lists}</details>\n",
            super::site::index_name(table),
            index.url,
            super::site::index_name(table),
        ));
    }
    out.push_str("</section>\n");
    out
}

/// The most group links under one heading of the include: Manufacturing's 77 ran to 402
/// words, over the passage rules' 400 for a section.
const LINKS_PER_LIST: usize = 60;

/// A table's group pages as links, one list under each division (Table A) or letter
/// (Table B), as on the index pages, and how many there are. A parent with more than
/// `LINKS_PER_LIST` groups is split into numbered parts of near equal size.
fn group_lists(site: &Site, table: Table) -> (String, usize) {
    let mut parents: Vec<(&str, Vec<String>)> = Vec::new();
    for page in site.plan.pages.iter() {
        if page.kind != Kind::Group || site.group(page.group).table != table {
            continue;
        }
        let group = site.group(page.group);
        let name = esc(&super::site::group_name(group));
        let link = format!(
            "<li><a href=\"{}\">{name}</a></li>
",
            page.url
        );
        match parents.last_mut() {
            Some((parent, links)) if *parent == group.parent => links.push(link),
            _ => parents.push((group.parent.as_str(), vec![link])),
        }
    }
    let mut lists = String::new();
    for (parent, links) in &parents {
        let parts = links.len().div_ceil(LINKS_PER_LIST);
        for (part, chunk) in links.chunks(links.len().div_ceil(parts)).enumerate() {
            let heading = match parts {
                1 => esc(parent),
                _ => format!("{} ({} of {parts})", esc(parent), part + 1),
            };
            lists.push_str(&format!(
                "<h3>{heading}</h3>
<ul>
{}</ul>
",
                chunk.concat()
            ));
        }
    }
    (lists, parents.iter().map(|(_, links)| links.len()).sum())
}

/// Every file of the family, from the data file's text and the address map's, if any.
/// `today` dates new and changed pages; without it they are listed in `undated`.
pub fn files(data_text: &str, map_text: Option<&str>, today: Option<&str>) -> Result<Build> {
    let data = load(data_text)?;
    let map = map_text.map_or_else(|| Ok(AddressMap::default()), AddressMap::parse)?;
    let plan = plan_with(&data, &map)?;
    let site = Site::new(&data, &plan)?;
    let keys: HashSet<&Vec<String>> = plan.pages.iter().map(|page| &page.key).collect();
    let gone = map
        .records
        .iter()
        .filter(|record| !keys.contains(&record.key))
        .cloned()
        .collect();
    let mut build = Build {
        files: BTreeMap::new(),
        gone,
        undated: Vec::new(),
    };
    let mut records = Vec::with_capacity(plan.pages.len());
    for page in &plan.pages {
        let html = render(&site, page);
        let hash: String = Sha256::digest(html.as_bytes())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let (published, modified) = dates(&mut build, &map, page, &hash, today);
        let html = dated(&html, &published, &modified);
        let mirror = crate::llms_full::entry(&html, &format!("{ORIGIN}{}", page.url))?;
        build.files.insert(file_rel(&page.url, "index.html"), html);
        build.files.insert(file_rel(&page.url, "index.txt"), mirror);
        records.push(Record {
            key: page.key.clone(),
            url: page.url.clone(),
            published,
            modified,
            sha256: hash,
        });
    }
    build
        .files
        .insert(SITEMAP_REL.to_owned(), sitemap(&records));
    build
        .files
        .insert(LLMS_REL.to_owned(), llms(&site, &records));
    build.files.insert(INCLUDE_REL.to_owned(), include(&site));
    build
        .files
        .insert(MAP_REL.to_owned(), AddressMap::new(records)?.to_text());
    Ok(build)
}

/// The files under the family's folders now, and the files beside them, by path below
/// the site root.
fn committed(root: &Path) -> Result<Vec<String>> {
    fn walk(root: &Path, directory: &Path, out: &mut Vec<String>) -> Result<()> {
        let entries =
            std::fs::read_dir(directory).map_err(|e| format!("{}: {e}", directory.display()))?;
        for entry in entries {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.is_dir() {
                walk(root, &path, out)?;
            } else {
                let rel = path.strip_prefix(root).map_err(|e| e.to_string())?;
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    for folder in FOLDERS {
        let directory = root.join(BASE).join(folder);
        if directory.is_dir() {
            walk(root, &directory, &mut out)?;
        }
    }
    out.extend(
        [SITEMAP_REL, LLMS_REL, MAP_REL, INCLUDE_REL]
            .iter()
            .filter(|rel| root.join(rel).is_file())
            .map(|rel| (*rel).to_owned()),
    );
    out.sort();
    Ok(out)
}

fn say(text: &str) -> Result<()> {
    crate::print_text(text, false).map_err(|e| e.to_string())
}

fn refuse_gone(gone: &[Record]) -> Result<u8> {
    let mut text: String = gone
        .iter()
        .map(|record| {
            format!(
                "the data no longer has the page {} ({:?})\n",
                record.url, record.key
            )
        })
        .collect();
    text.push_str(
        "Refused: a rebuild must not remove a published address. Record where each one went in the address map before rebuilding (CONTRIBUTING, Effective life pages).\n",
    );
    say(&text)?;
    Ok(1)
}

fn write(root: &Path, build: &Build, present: &[String]) -> Result<u8> {
    if !build.gone.is_empty() {
        return refuse_gone(&build.gone);
    }
    for rel in present.iter().filter(|rel| !build.files.contains_key(*rel)) {
        std::fs::remove_file(root.join(rel)).map_err(|e| format!("{rel}: {e}"))?;
    }
    let mut changed = 0;
    for (rel, text) in &build.files {
        let path = root.join(rel);
        if path.is_file() && crate::read(&path)? == *text {
            continue;
        }
        let parent = path.parent().expect("a page path is below the site root");
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
        std::fs::write(&path, text).map_err(|e| format!("{rel}: {e}"))?;
        changed += 1;
    }
    say(&format!(
        "Wrote {changed} of the {} files under {BASE_URL}\n",
        build.files.len()
    ))?;
    Ok(0)
}

fn check(root: &Path, build: &Build, present: &[String]) -> Result<u8> {
    if !build.gone.is_empty() {
        return refuse_gone(&build.gone);
    }
    let mut failures: Vec<String> = build
        .undated
        .iter()
        .map(|url| format!("{url} is new or changed"))
        .collect();
    for (rel, text) in &build.files {
        let path = root.join(rel);
        if !path.is_file() {
            failures.push(format!("{rel} is missing"));
        } else if crate::read(&path)? != *text {
            failures.push(format!("{rel} differs from a rebuild"));
        }
    }
    failures.extend(
        present
            .iter()
            .filter(|rel| !build.files.contains_key(*rel))
            .map(|rel| format!("{rel} is not a page of the rebuild")),
    );
    // The address map carries the pages' dates into the next rebuild, so it is an input
    // as well as an output and stays in review.
    let generated = build
        .files
        .keys()
        .map(String::as_str)
        .filter(|rel| *rel != MAP_REL);
    failures.extend(crate::review_generated::undeclared(root, generated)?);
    if failures.is_empty() {
        say(&format!(
            "The {} effective life page files match the data file\n",
            build.files.len()
        ))?;
        return Ok(0);
    }
    for failure in failures.iter().take(20) {
        say(&format!("{failure}\n"))?;
    }
    say(&format!(
        "{} files differ: run site-tools build_effective_life_pages --write\n",
        failures.len()
    ))?;
    Ok(1)
}

/// The IndexNow request body for the pages the last refresh added or changed: every
/// page whose `modified` date is the map's latest. IndexNow takes 10,000 URLs a request.
pub fn indexnow(map: &AddressMap) -> Result<String> {
    let latest = map
        .records
        .iter()
        .map(|r| r.modified.as_str())
        .max()
        .ok_or("the address map is empty")?;
    let urls: Vec<String> = map
        .records
        .iter()
        .filter(|r| r.modified == latest)
        .map(|r| format!("{ORIGIN}{}", r.url))
        .collect();
    if urls.len() > 10_000 {
        return Err(format!(
            "{} pages changed; IndexNow takes 10,000 a request",
            urls.len()
        ));
    }
    let body = serde_json::json!({
        "host": ORIGIN.trim_start_matches("https://"),
        "key": INDEXNOW_KEY,
        "keyLocation": format!("{ORIGIN}/{INDEXNOW_KEY}.txt"),
        "urlList": urls,
    });
    Ok(format!("{body:#}\n"))
}

pub fn run(root: &Path, args: &[String]) -> Result<u8> {
    let flags = match PARSER.parse(args) {
        crate::pyargs::Parsed::Flags(flags) => flags,
        crate::pyargs::Parsed::Exit(code) => return Ok(code),
    };
    let write_mode = flags.contains(&"--write");
    let root = crate::py::resolve(root);
    let map_path = root.join(MAP_REL);
    let map = if map_path.is_file() {
        Some(crate::read(&map_path)?)
    } else {
        None
    };
    if flags.contains(&"--indexnow") {
        let map = AddressMap::parse(
            map.as_deref()
                .ok_or_else(|| format!("{MAP_REL} is missing"))?,
        )?;
        crate::print_text(&indexnow(&map)?, false).map_err(|e| e.to_string())?;
        return Ok(0);
    }
    let data = crate::read(&root.join(DATA_REL))?;
    let today = jiff::ZonedDateTime::now().strftime("%Y-%m-%d").to_string();
    let build = files(&data, map.as_deref(), write_mode.then_some(today.as_str()))?;
    let present = committed(&root)?;
    if write_mode {
        write(&root, &build, &present)
    } else {
        check(&root, &build, &present)
    }
}
