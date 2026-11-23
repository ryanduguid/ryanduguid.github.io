// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! `site-tools build_effective_life_pages`: one page for every life in the committed data
//! file, unique and stable addresses that fit a Windows checkout, the address map's
//! dates, and the address rules on small groups.
use serde_json::{Value, json};
use site_tools::effective_life::{DATA_REL, Life};
use site_tools::effective_life_pages::load::{Entry, Table, load};
use site_tools::effective_life_pages::map::MAP_REL;
use site_tools::effective_life_pages::{Build, Kind, address, files, plan};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const DAY: &str = "2026-11-14";
const LATER: &str = "2026-12-01";

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn committed() -> String {
    std::fs::read_to_string(root().join(DATA_REL)).expect("the data file reads")
}

/// The whole family built once from the committed data, as on a first build.
fn built() -> &'static Build {
    static BUILT: OnceLock<Build> = OnceLock::new();
    BUILT.get_or_init(|| files(&committed(), None, Some(DAY)).expect("the family builds"))
}

fn entry(path: &[&str], life: bool) -> Entry {
    Entry {
        path: path.iter().map(|text| (*text).to_owned()).collect(),
        life: life.then(|| Life {
            years: "5".into(),
            months: 60,
        }),
        flags: "*".into(),
        last_updated: Some("2008-07-01".into()),
    }
}

/// The text between the first `open` and the next `close`.
fn between<'a>(text: &'a str, open: &str, close: &str) -> &'a str {
    let start = text.find(open).expect("the marker is present") + open.len();
    &text[start..start + text[start..].find(close).expect("the close is present")]
}

fn pages(build: &Build) -> impl Iterator<Item = (&String, &String)> {
    build
        .files
        .iter()
        .filter(|(rel, _)| rel.ends_with("index.html"))
}

#[test]
fn every_life_has_one_page_and_every_address_is_unique() {
    let data = load(&committed()).unwrap();
    let plan = plan(&data).unwrap();
    let assets = plan
        .pages
        .iter()
        .filter(|page| matches!(page.kind, Kind::Asset(_)))
        .count();
    assert_eq!(assets, 7430);
    let groups = plan
        .pages
        .iter()
        .filter(|page| page.kind == Kind::Group)
        .count();
    let table_b_leaves = plan
        .pages
        .iter()
        .filter(|page| page.kind == Kind::Asset(None))
        .count();
    // 196 Table A sub-industries (with each division's general rows) and 112 top-level
    // Table B rows: 44 with rows under them, 64 with a life of their own (asset pages)
    // and 4 that only point to another row (no page).
    assert_eq!((groups, table_b_leaves), (196 + 44, 64));
    assert_eq!(plan.pages.len(), 2 + 196 + 44 + 7430);
    let mut urls = HashSet::new();
    let mut keys = HashSet::new();
    for page in &plan.pages {
        assert!(urls.insert(page.url.as_str()), "{} repeats", page.url);
        assert!(keys.insert(&page.key), "{:?} repeats", page.key);
    }
}

#[test]
fn addresses_are_plain_short_and_the_same_on_a_second_run() {
    let data = load(&committed()).unwrap();
    let first = plan(&data).unwrap();
    let second = plan(&load(&committed()).unwrap()).unwrap();
    assert_eq!(first.pages, second.pages);
    for page in &first.pages {
        let rest = page.url.strip_prefix("/tools/depreciation-rates/").unwrap();
        assert!(
            rest.len() <= 8 + 1 + address::GROUP_MAX + 1 + address::SLUG_MAX + 1,
            "{}",
            page.url
        );
        assert!(
            rest.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'/'),
            "{}",
            page.url
        );
        assert!(!rest.contains("--") && !rest.contains("-/"), "{}", page.url);
    }
}

#[test]
fn known_rows_have_readable_addresses() {
    let data = load(&committed()).unwrap();
    let urls: HashSet<String> = plan(&data)
        .unwrap()
        .pages
        .into_iter()
        .map(|page| page.url)
        .collect();
    for url in [
        "/tools/depreciation-rates/asset/computers-and-computer-equipment/mobile-portable-computers/",
        "/tools/depreciation-rates/asset/additive-manufacturing-printers/",
        "/tools/depreciation-rates/industry/agriculture-forestry-and-fishing/livestock-grids/",
        "/tools/depreciation-rates/industry/bakery-product-manufacturing/",
    ] {
        assert!(urls.contains(url), "{url} is missing");
    }
}

#[test]
fn a_row_takes_its_own_words_and_headings_only_when_another_row_shares_them() {
    let entries = [
        entry(&["Fertigation systems:"], false),
        entry(&["Fertigation systems:", "Pumps"], true),
        entry(&["Fertigation systems:", "Tanks (including liners)"], true),
        entry(&["Irrigation assets:", "Pumps"], true),
        entry(&["Livestock grids"], true),
    ];
    let slugs = address::entry_slugs("farming", &entries).unwrap();
    assert_eq!(
        slugs,
        [
            None,
            Some("fertigation-systems-pumps".into()),
            Some("tanks".into()),
            Some("irrigation-assets-pumps".into()),
            Some("livestock-grids".into()),
        ]
    );
}

#[test]
fn rows_no_wording_separates_take_a_digest_of_their_path() {
    let long = "Generator transformers and unit transformers in sub-tropical areas of the country";
    let entries = [
        entry(
            &[
                "Gas production assets:",
                "Central facility:",
                "Common:",
                long,
            ],
            true,
        ),
        entry(
            &[
                "Oil production assets:",
                "Central facility:",
                "Common:",
                long,
            ],
            true,
        ),
    ];
    let slugs = address::entry_slugs("oil-and-gas", &entries).unwrap();
    let [Some(first), Some(second)] = &slugs[..] else {
        panic!("{slugs:?}")
    };
    assert_ne!(first, second);
    assert!(first.len() <= address::SLUG_MAX && second.len() <= address::SLUG_MAX);
    assert_eq!(
        slugs,
        address::entry_slugs("oil-and-gas", &entries).unwrap()
    );
}

#[test]
fn words_drop_accents_and_punctuation() {
    assert_eq!(
        address::words("Café – chairs/tables (3D)"),
        ["cafe", "chairs", "tables", "3d"]
    );
}

/// The titles of the site's other pages, which no family page may repeat.
/// The titles, descriptions and H1s of every other page on the site.
fn other_heads() -> [HashSet<String>; 3] {
    let family = root().join("tools/depreciation-rates");
    let mut out: [HashSet<String>; 3] = Default::default();
    for path in site_tools::seo_core::html_files(&root()) {
        // Jekyll leaves out `scripts`, where the other suites keep a rendered copy of
        // the site, these pages included.
        if path.starts_with(family.join("industry"))
            || path.starts_with(family.join("asset"))
            || path.starts_with(root().join("scripts"))
        {
            continue;
        }
        let html = std::fs::read_to_string(&path).unwrap();
        for (set, open, close) in [
            (0, "<title>", "</title>"),
            (1, "<meta name=\"description\" content=\"", "\""),
            (2, "<h1>", "</h1>"),
        ] {
            if let Some(at) = html.find(open) {
                out[set].insert(site_tools::html::unescape(between(
                    &html[at..],
                    open,
                    close,
                )));
            }
        }
    }
    out
}

#[test]
fn every_page_has_its_own_short_title_description_and_heading() {
    let [other_titles, other_descriptions, other_headings] = other_heads();
    let (mut titles, mut descriptions, mut headings) =
        (HashSet::new(), HashSet::new(), HashSet::new());
    for (rel, html) in pages(built()) {
        let title = site_tools::html::unescape(between(html, "<title>", "</title>"));
        assert!(title.chars().count() <= 65, "{rel}: {title}");
        assert!(
            !other_titles.contains(&title),
            "{rel}: another page has the title {title}"
        );
        let description = site_tools::html::unescape(between(
            html,
            "<meta name=\"description\" content=\"",
            "\"",
        ));
        let length = description.chars().count();
        assert!(
            (50..=165).contains(&length),
            "{rel}: {length} {description}"
        );
        assert_eq!(html.matches("<h1>").count(), 1, "{rel}");
        let heading = between(html, "<h1>", "</h1>").to_owned();
        assert!(
            !other_descriptions.contains(&description),
            "{rel}: another page has the description {description}"
        );
        assert!(
            !other_headings.contains(&site_tools::html::unescape(&heading)),
            "{rel}: another page has the heading {heading}"
        );
        assert!(
            titles.insert(title.clone()),
            "{rel}: the title {title} repeats"
        );
        assert!(
            descriptions.insert(description.clone()),
            "{rel}: the description {description} repeats"
        );
        assert!(
            headings.insert(heading.clone()),
            "{rel}: the heading {heading} repeats"
        );
    }
    assert_eq!(titles.len(), 2 + 240 + 7430);
}

/// The text between a lead's first pair of single quotation marks.
/// A row's words can hold an apostrophe ('Hop growers’ plant'), so the quotation ends
/// where the lead's own words begin.
fn quotation(lead: &str) -> String {
    let body = lead.strip_prefix('\u{2018}').unwrap_or_default();
    ["\u{2019}, for an asset used in ", "\u{2019} in Table B, "]
        .iter()
        .filter_map(|end| body.find(end))
        .min()
        .map_or_else(String::new, |end| body[..end].to_owned())
}

/// The headings above a row and the row, as the determination prints them, each heading
/// joined to the next by ': '.
fn instrument_words(
    group: &site_tools::effective_life_pages::load::Group,
    entry: &Entry,
) -> String {
    let mut parts: Vec<&str> = Vec::new();
    if group.table == Table::B && group.top.as_ref() != Some(entry) {
        parts.push(&group.heading);
    }
    parts.extend(entry.path.iter().map(String::as_str));
    let joined: Vec<&str> = parts
        .iter()
        .map(|part| part.trim().trim_end_matches(':'))
        .collect();
    joined
        .join(": ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Why a quotation is not the instrument's words: a piece between ellipses that the
/// instrument does not print, or an uncut quotation that stops short of the row's end.
fn misquotes(quote: &str, words: &str) -> Option<String> {
    let pieces: Vec<&str> = quote
        .split('\u{2026}')
        .map(str::trim)
        .filter(|piece| !piece.is_empty())
        .collect();
    if let Some(piece) = pieces.iter().find(|piece| !words.contains(*piece)) {
        return Some(format!("'{piece}' is not in '{words}'"));
    }
    match pieces.last() {
        Some(last) if !quote.trim_end().ends_with('\u{2026}') && !words.ends_with(last) => {
            Some(format!("'{last}' cuts the row's end without an ellipsis"))
        }
        None => Some("an empty quotation".to_owned()),
        _ => None,
    }
}

/// A date as the pages write it: 2008-07-01 is '1 July 2008'.
fn written(day: &str) -> String {
    const MONTHS: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let parts: Vec<usize> = day.split('-').map(|part| part.parse().unwrap()).collect();
    format!("{} {} {}", parts[2], MONTHS[parts[1] - 1], parts[0])
}

#[test]
fn a_quotation_must_show_each_cut() {
    let words = "Kitchen assets: Cooking utensils (including pots, but excluding cook tops)";
    assert_eq!(
        misquotes("Kitchen assets: Cooking utensils \u{2026}", words),
        None
    );
    assert!(misquotes("Kitchen assets: Cooking utensils", words).is_some());
    assert!(misquotes("Kitchen assets: Cooking pots", words).is_some());
    assert_eq!(
        quotation(
            "\u{2018}Hop growers\u{2019} plant: Hop picking machines\u{2019}, for an asset used in Agriculture, has"
        ),
        "Hop growers\u{2019} plant: Hop picking machines"
    );
    let words = "Fences: Being fencing: General (incorporating posts)";
    assert_eq!(misquotes("Fences \u{2026}: General \u{2026}", words), None);
}

/// The words of a lead, as the passage rules count them in the text mirror.
fn words(text: &str) -> usize {
    site_tools::html::unescape(text).split_whitespace().count()
}

/// The pages whose opening sentence runs past the passage limit with every template
/// word it can drop dropped: the instrument's own headings are that long (the oil and
/// gas, plumbing, vehicle and trailer, caravan park, security, laboratory and teller rows).
/// Each was read on 14 November 2026: it states the row, its table or industry, its
/// life, the determination and the date, and cutting the quotation would misquote it.
const LONG_LEADS: [&str; 26] = [
    "/tools/depreciation-rates/asset/working-beasts-and-beasts-of-burden-used/",
    "/tools/depreciation-rates/asset/accommodation-units-in-caravan-tourist/other-accommodation-units/",
    "/tools/depreciation-rates/asset/accommodation-units-in-caravan-tourist/relocatable-homes-and-tourist-park-cabins-constructed-with/",
    "/tools/depreciation-rates/asset/laboratory-assets-used-in-quality/automated-and-electronically-based-laboratory-assets/",
    "/tools/depreciation-rates/asset/motor-vehicles-and-trailers/aluminium-galvanised-steel-galvanised-hot-dipped-steel-and/",
    "/tools/depreciation-rates/asset/motor-vehicles-and-trailers/buses-having-a-gross-vehicle-mass-of-more-than-3-5-tonnes/",
    "/tools/depreciation-rates/asset/motor-vehicles-and-trailers/light-commercial-vehicles-designed-to-carry-a-load-of-one/",
    "/tools/depreciation-rates/asset/motor-vehicles-and-trailers/mild-steel-trailers/",
    "/tools/depreciation-rates/asset/motor-vehicles-and-trailers/trucks-having-a-gross-vehicle-mass-greater-than-3-5-tonnes/",
    "/tools/depreciation-rates/asset/motor-vehicles-and-trailers/minibuses-having-a-gross-vehicle-mass-of-3-5-tonnes-or-less/",
    "/tools/depreciation-rates/asset/plumbing-fixtures-and-fittings-provided/floor-and-wall-tiles/",
    "/tools/depreciation-rates/asset/plumbing-fixtures-and-fittings-provided/generally/",
    "/tools/depreciation-rates/asset/plumbing-fixtures-and-fittings-provided/tapware/",
    "/tools/depreciation-rates/asset/security-and-monitoring-assets/ballistic-and-blast-resistant-screens-and-barriers-not/",
    "/tools/depreciation-rates/industry/banking-building-society-and-credit/teller-cash-recyclers-teller-cash-dispensers-teller-assist/",
    "/tools/depreciation-rates/industry/oil-and-gas-extraction/assets-used-to-manufacture-control-systems/",
    "/tools/depreciation-rates/industry/oil-and-gas-extraction/assets-used-to-manufacture-instruments/",
    "/tools/depreciation-rates/industry/oil-and-gas-extraction/domestic-gas-processing-assets/",
    "/tools/depreciation-rates/industry/oil-and-gas-extraction/flare-towers-for-gas-flares/",
    "/tools/depreciation-rates/industry/oil-and-gas-extraction/fractionation-train-assets/",
    "/tools/depreciation-rates/industry/oil-and-gas-extraction/hot-water-system-assets/",
    "/tools/depreciation-rates/industry/oil-and-gas-extraction/lng-holding-facility-assets/",
    "/tools/depreciation-rates/industry/oil-and-gas-extraction/lng-train-assets/",
    "/tools/depreciation-rates/industry/oil-and-gas-extraction/stabiliser-process-assets/",
    "/tools/depreciation-rates/industry/oil-and-gas-extraction/storage-and-loading-assets/",
    "/tools/depreciation-rates/industry/road-transport/light-commercial-vehicles-designed-to-carry-a-load-of-one/",
];

#[test]
fn every_asset_page_opens_with_a_sentence_that_answers_alone() {
    let data = load(&committed()).unwrap();
    let plan = plan(&data).unwrap();
    let mut over = Vec::new();
    for page in &plan.pages {
        let Kind::Asset(row) = page.kind else {
            continue;
        };
        let group = &data.groups[page.group];
        let entry = match row {
            Some(at) => &group.entries[at],
            None => group.top.as_ref().unwrap(),
        };
        let html = &built().files[&format!("{}index.html", page.url.trim_start_matches('/'))];
        let lead = site_tools::html::unescape(between(html, "<p class=\"lead-note\">", "</p>"))
            .replace("<span class=\"function-symbol\">", "")
            .replace("</span>", "");
        let years = &entry.life.as_ref().unwrap().years;
        let id = format!("({})", data.source.register_id);
        assert!(lead.contains(&id), "{}: {lead}", page.url);
        assert!(
            lead.contains(&format!("effective life of {years} year")),
            "{}: {lead}",
            page.url
        );
        let problem = misquotes(&quotation(&lead), &instrument_words(group, entry));
        assert!(problem.is_none(), "{}: {problem:?}: {lead}", page.url);
        let place = match group.table {
            Table::A => group.heading.trim_end_matches(':').to_owned(),
            Table::B => "in Table B".to_owned(),
        };
        assert!(lead.contains(&place), "{}: no {place}: {lead}", page.url);
        if let Some(day) = &entry.last_updated {
            assert!(
                lead.contains(&written(day)),
                "{}: no {day}: {lead}",
                page.url
            );
        }
        if words(&lead) > site_tools::passages::LEAD_WORDS {
            over.push(page.url.clone());
        }
    }
    let read: HashSet<&str> = LONG_LEADS.into_iter().collect();
    let found: HashSet<&str> = over.iter().map(String::as_str).collect();
    assert!(
        found == read,
        "leads over the limit not read: {:?}; read but no longer over: {:?}",
        found.difference(&read).collect::<Vec<_>>(),
        read.difference(&found).collect::<Vec<_>>()
    );
}

fn source() -> Value {
    json!({
        "title": "Income Tax Assessment (Effective Life of Depreciating Assets) Determination 2025",
        "register_id": "F2025L01097",
        "registered": "2025-09-15",
        "url": "https://www.legislation.gov.au/F2025L01097/asmade/2025-09-15/text",
        "read": "2026-11-13",
        "attribution": "Based on content from the Federal Register of Legislation at 13 November 2026. For the latest information on Australian Government legislation please go to https://www.legislation.gov.au.",
        "licence_url": "https://creativecommons.org/licenses/by/4.0/"
    })
}

fn row(text: &str, depth: u64, years: Option<u32>) -> Value {
    match years {
        Some(years) => json!([
            text,
            depth,
            years.to_string(),
            years * 12,
            "*",
            "2008-07-01"
        ]),
        None => json!([text, depth, null, null, "", null]),
    }
}

/// A small data file: one Table A sub-industry and one Table B letter.
fn fixture(a_rows: Vec<Value>, b_rows: Vec<Value>) -> String {
    json!({
        "source": source(),
        "table_a": [{"heading": "Agriculture, forestry and fishing", "anzsic": "01", "sections": [
            {"heading": "Grain growing", "anzsic": "0149", "rows": a_rows}
        ]}],
        "table_b": [{"heading": "A", "rows": b_rows}]
    })
    .to_string()
}

fn grain() -> Vec<Value> {
    vec![
        row("Fertigation systems:", 0, None),
        row("Pumps", 1, Some(15)),
        row("Tanks (including liners)", 1, Some(20)),
        row("Irrigation assets:", 0, None),
        row("Pumps", 1, Some(20)),
        row("Livestock grids", 0, Some(30)),
    ]
}

fn letter_a() -> Vec<Value> {
    vec![
        row("Air conditioning assets:", 0, None),
        row("Chillers:", 1, None),
        row("Absorption", 2, Some(25)),
        row("Pumps", 1, Some(20)),
        row("Aerials, freestanding", 0, Some(10)),
    ]
}

/// Each page's address, published date and modified date, by address map key.
fn records(build: &Build) -> HashMap<Vec<String>, (String, String, String)> {
    let map: Value = serde_json::from_str(&build.files[MAP_REL]).unwrap();
    map["pages"]
        .as_array()
        .unwrap()
        .iter()
        .map(|page| {
            let key = page["key"]
                .as_array()
                .unwrap()
                .iter()
                .map(|part| part.as_str().unwrap().to_owned())
                .collect();
            let text = |name: &str| page[name].as_str().unwrap().to_owned();
            (key, (text("url"), text("published"), text("modified")))
        })
        .collect()
}

fn key(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|part| (*part).to_owned()).collect()
}

#[test]
fn a_rebuild_keeps_every_address_and_moves_only_changed_dates() {
    let first = files(&fixture(grain(), letter_a()), None, Some(DAY)).unwrap();
    let map = &first.files[MAP_REL];
    let again = files(&fixture(grain(), letter_a()), Some(map), Some(LATER)).unwrap();
    assert_eq!(
        first.files, again.files,
        "an unchanged rebuild on a later day changes nothing"
    );

    let mut changed = grain();
    changed[5] = row("Livestock grids", 0, Some(25));
    let later = files(&fixture(changed, letter_a()), Some(map), Some(LATER)).unwrap();
    let (before, after) = (records(&first), records(&later));
    for (key, (url, published, modified)) in &before {
        let (url_after, published_after, modified_after) = &after[key];
        assert_eq!((url, published), (url_after, published_after), "{key:?}");
        let grids = key.last().is_some_and(|last| last == "Livestock grids");
        let group = key.len() == 2 && key[1] == "Grain growing";
        let moved = modified_after != modified;
        assert_eq!(
            moved,
            grids || group,
            "{key:?}: only the changed row and its group page move"
        );
    }
}

#[test]
fn an_inserted_row_and_a_reordered_group_keep_every_address() {
    let first = files(&fixture(grain(), letter_a()), None, Some(DAY)).unwrap();
    let map = &first.files[MAP_REL];
    let mut rows = grain();
    rows.insert(5, row("Pumps", 0, Some(12)));
    rows.swap(1, 2);
    let later = files(&fixture(rows, letter_a()), Some(map), Some(LATER)).unwrap();
    let (before, after) = (records(&first), records(&later));
    for (key, (url, _, _)) in &before {
        assert_eq!(url, &after[key].0, "{key:?} moved");
    }
    let new = &after[&key(&["A", "Grain growing", "Pumps"])].0;
    assert!(
        !before.values().any(|(url, _, _)| url == new),
        "the new row takes a free address, {new}"
    );
}

#[test]
fn a_renamed_or_removed_row_is_listed_as_gone() {
    let first = files(&fixture(grain(), letter_a()), None, Some(DAY)).unwrap();
    let map = &first.files[MAP_REL];
    let mut renamed = grain();
    renamed[5] = row("Livestock grid", 0, Some(30));
    let build = files(&fixture(renamed, letter_a()), Some(map), Some(LATER)).unwrap();
    let gone: Vec<&Vec<String>> = build.gone.iter().map(|record| &record.key).collect();
    assert_eq!(gone, [&key(&["A", "Grain growing", "Livestock grids"])]);
    let mut removed = letter_a();
    removed.pop();
    let build = files(&fixture(grain(), removed), Some(map), Some(LATER)).unwrap();
    assert_eq!(build.gone.len(), 1);
    assert_eq!(build.gone[0].key, key(&["B", "Aerials, freestanding"]));
}

/// The steps CONTRIBUTING gives for a page the data no longer has.
#[test]
fn a_renamed_row_takes_back_its_address_when_its_record_is_moved() {
    let first = files(&fixture(grain(), letter_a()), None, Some(DAY)).unwrap();
    let old = records(&first)[&key(&["A", "Grain growing", "Livestock grids"])].clone();
    let mut renamed = grain();
    renamed[5] = row("Livestock grid", 0, Some(30));
    let data = fixture(renamed, letter_a());
    let edit = |map: &str, change: &dyn Fn(&mut Vec<Value>)| {
        let mut map: Value = serde_json::from_str(map).unwrap();
        change(map["pages"].as_array_mut().unwrap());
        map.to_string()
    };
    let map = edit(&first.files[MAP_REL], &|pages| {
        pages.retain(|page| page["url"] != old.0.as_str());
    });
    let second = files(&data, Some(&map), Some(LATER)).unwrap();
    assert!(second.gone.is_empty());
    let new = key(&["A", "Grain growing", "Livestock grid"]);
    let new_url = records(&second)[&new].0.clone();
    assert_ne!(new_url, old.0);
    let map = edit(&second.files[MAP_REL], &|pages| {
        for page in pages
            .iter_mut()
            .filter(|page| page["url"] == new_url.as_str())
        {
            page["url"] = json!(old.0);
            page["published"] = json!(old.1);
        }
    });
    let third = files(&data, Some(&map), Some(LATER)).unwrap();
    let (url, published, _) = &records(&third)[&new];
    assert_eq!((url, published), (&old.0, &old.1));
    let page = |url: &str| format!("{}index.html", url.trim_start_matches('/'));
    assert!(third.files.contains_key(&page(&old.0)), "{:?}", old.0);
    assert!(!third.files.contains_key(&page(&new_url)));
}

#[test]
fn a_check_without_a_day_lists_new_pages_as_undated() {
    let build = files(&fixture(grain(), letter_a()), None, None).unwrap();
    assert_eq!(build.undated.len(), records(&build).len());
    let first = files(&fixture(grain(), letter_a()), None, Some(DAY)).unwrap();
    let checked = files(
        &fixture(grain(), letter_a()),
        Some(&first.files[MAP_REL]),
        None,
    )
    .unwrap();
    assert!(checked.undated.is_empty());
    assert_eq!(checked.files, first.files);
}

#[test]
fn every_page_states_its_own_address_dates_and_trail_in_its_structured_data() {
    let build = files(&fixture(grain(), letter_a()), None, Some(DAY)).unwrap();
    let sitemap = &build.files["tools/depreciation-rates/sitemap.xml"];
    for (rel, html) in pages(&build) {
        let url = format!(
            "https://duguid.com.au/{}",
            rel.trim_end_matches("index.html")
        );
        assert!(
            html.contains(&format!("<link rel=\"canonical\" href=\"{url}\" />")),
            "{rel}"
        );
        let data: Value = serde_json::from_str(between(
            html,
            "<script type=\"application/ld+json\">",
            "</script>",
        ))
        .unwrap();
        let graph = data["@graph"].as_array().unwrap();
        let page = &graph[0];
        assert_eq!(page["url"], json!(url), "{rel}");
        assert_eq!(
            page["name"].as_str().unwrap(),
            site_tools::html::unescape(between(html, "<h1>", "</h1>")),
            "{rel}"
        );
        let description = site_tools::html::unescape(between(
            html,
            "<meta name=\"description\" content=\"",
            "\"",
        ));
        assert_eq!(page["description"].as_str().unwrap(), description, "{rel}");
        assert_eq!(page["dateModified"], json!(DAY), "{rel}");
        assert!(
            sitemap.contains(&format!("<loc>{url}</loc>\n    <lastmod>{DAY}</lastmod>")),
            "{rel}"
        );
        let crumbs: Vec<&str> = graph[1]["itemListElement"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["name"].as_str().unwrap())
            .collect();
        let visible: Vec<String> = between(html, "<ol>", "</ol>")
            .split("<li")
            .skip(1)
            .map(|item| {
                site_tools::html::unescape(&site_tools::seo_core::visible_text(&format!(
                    "<li{item}"
                )))
                .trim()
                .to_owned()
            })
            .collect();
        assert_eq!(crumbs, visible, "{rel}");
    }
}

#[test]
fn signs_outside_the_fonts_use_the_symbol_markup_in_the_body_only() {
    let mut rows = grain();
    rows.push(row(
        "High capacity licensed microwave radio system ≥ 68 Mb",
        0,
        Some(10),
    ));
    let build = files(&fixture(rows, letter_a()), None, Some(DAY)).unwrap();
    let (_, html) = pages(&build)
        .find(|(_, html)| html.contains("microwave radio system"))
        .unwrap();
    let html = html.as_str();
    let body = between(html, "<body>", "<script type=\"application/ld+json\">");
    assert!(body.contains("<span class=\"function-symbol\">≥</span>"));
    assert!(
        !body
            .replace("<span class=\"function-symbol\">≥</span>", "")
            .contains('≥')
    );
    let data = between(html, "<script type=\"application/ld+json\">", "</script>");
    assert!(data.contains('≥'));
    assert!(!between(html, "<head>", "</head>").contains("function-symbol"));
    assert!(!data.contains("function-symbol"));
}

/// What masking keeps, as the generator reads it: the guide's terms, which bring in
/// its paragraphs, a cross-reference such as ' \u{2013} see Table B Computers', whose
/// marker becomes a link, addresses, which the pages link, and the joining words a cut
/// may not end on.
fn kept(text: &str) -> Vec<(usize, usize)> {
    let lower = text.to_ascii_lowercase();
    let mut out: Vec<(usize, usize)> = site_tools::effective_life_pages::guide_terms()
        .chain([" \u{2013} see table a ", " \u{2013} see table b "])
        .flat_map(|term| {
            lower
                .match_indices(term)
                .map(|(at, found)| (at, at + found.len()))
                .collect::<Vec<_>>()
        })
        .collect();
    let mut at = 0;
    for word in text.split(' ') {
        if word.starts_with("http") {
            out.push((at, at + word.len()));
        }
        at += word.len() + 1;
    }
    // Joining words as whole runs of letters, since the generator also splits words at
    // hyphens: 'ride-on' and 'ride on' must mask alike.
    let mut start = None;
    for (at, c) in text.char_indices().chain([(text.len(), ' ')]) {
        match (c.is_ascii_alphabetic(), start) {
            (true, None) => start = Some(at),
            (false, Some(from)) => {
                if site_tools::effective_life_pages::DANGLING_WORDS.contains(&&lower[from..at]) {
                    out.push((from, at));
                }
                start = None;
            }
            _ => {}
        }
    }
    out
}

/// Letters rotated 13 places and dashes made hyphens, outside what `kept` keeps: the
/// instrument's words lose their meaning but keep their lengths, punctuation and
/// distinctness, and every branch the generator takes on them.
fn rot13(text: &str) -> String {
    let kept = kept(text);
    text.char_indices()
        .map(|(at, c)| {
            if kept.iter().any(|&(from, to)| (from..to).contains(&at)) {
                return c;
            }
            match c {
                'a'..='z' => (((c as u8 - b'a') + 13) % 26 + b'a') as char,
                'A'..='Z' => (((c as u8 - b'A') + 13) % 26 + b'A') as char,
                '\u{2013}' | '\u{2014}' => '-',
                _ => c,
            }
        })
        .collect()
}

fn mask(value: &mut Value) {
    match value {
        Value::Object(fields) => {
            for (key, field) in fields.iter_mut() {
                match (key.as_str(), field) {
                    ("heading" | "note" | "title" | "attribution", Value::String(text)) => {
                        *text = rot13(text)
                    }
                    ("rows", Value::Array(rows)) => {
                        for cells in rows.iter_mut() {
                            if let Some(Value::String(text)) = cells.get_mut(0) {
                                *text = rot13(text);
                            }
                        }
                    }
                    (_, field) => mask(field),
                }
            }
        }
        Value::Array(items) => items.iter_mut().for_each(mask),
        _ => {}
    }
}

/// The committed data with every instrument string masked, so only the pages' own
/// wording is left for the site's copy rules to read.
fn masked() -> String {
    let mut document: Value = serde_json::from_str(&committed()).unwrap();
    mask(&mut document);
    document.to_string()
}

/// The family built from the masked data.
fn masked_build() -> &'static Build {
    static BUILT: OnceLock<Build> = OnceLock::new();
    BUILT.get_or_init(|| files(&masked(), None, Some(DAY)).expect("the masked family builds"))
}

/// How many of each element a page has, without attributes or text, and the length of
/// its lead in words: what the generator's choices about a row decide. Counts, not
/// order, as lists sorted by name reorder when the names are masked.
fn shape(html: &str) -> Shape {
    let tags = regex::Regex::new(r"<(/?[a-z0-9]+)[^>]*>").unwrap();
    let mut counts: std::collections::BTreeMap<&str, usize> = std::collections::BTreeMap::new();
    for found in tags.captures_iter(html) {
        *counts.entry(found.get(1).unwrap().as_str()).or_default() += 1;
    }
    let lead = between(html, "<p class=\"lead-note\">", "</p>");
    let elements: Vec<String> = counts.iter().map(|(tag, n)| format!("{tag}={n}")).collect();
    (elements.join(" "), words(lead))
}

/// Masking keeps every branch the real rows take: each page, paired by its place in
/// the plan, has the same elements and the same lead length. So the masked pages
/// exercise the same wording the real pages carry.
#[test]
fn masking_the_instrument_keeps_every_page_shape() {
    let real = plan(&load(&committed()).unwrap()).unwrap();
    let masked = plan(&load(&masked()).unwrap()).unwrap();
    assert_eq!(real.pages.len(), masked.pages.len());
    let html = |build: &'static Build, url: &str| {
        &build.files[&format!("{}index.html", url.trim_start_matches('/'))]
    };
    let differ: Vec<(&String, Shape, Shape)> = real
        .pages
        .iter()
        .zip(&masked.pages)
        .map(|(a, b)| {
            (
                &a.url,
                shape(html(built(), &a.url)),
                shape(html(masked_build(), &b.url)),
            )
        })
        .filter(|(_, a, b)| a != b)
        .collect();
    let report: Vec<String> = differ
        .iter()
        .take(5)
        .map(|(url, (a, a_lead), (b, b_lead))| {
            let a: HashSet<&str> = a.split(' ').collect();
            let b: HashSet<&str> = b.split(' ').collect();
            let mut only: Vec<&&str> = a.symmetric_difference(&b).collect();
            only.sort();
            format!("{url}: lead {a_lead} and {b_lead} words, counts {only:?}")
        })
        .collect();
    assert!(
        differ.is_empty(),
        "{} pages change shape: {report:#?}",
        differ.len()
    );
}

type Shape = (String, usize);

fn dash_failures(rel: &str, html: &str) -> Vec<String> {
    [('\u{2014}', "em dash"), ('\u{2013}', "en dash")]
        .into_iter()
        .filter(|(c, _)| html.contains(*c))
        .map(|(_, label)| format!("{rel}: {label} present"))
        .collect()
}

/// The rules `check_design`, `check_links` and `check_passages` skip on these pages.
fn wording_failures(rel: &str, html: &str) -> Vec<String> {
    let url = format!(
        "https://duguid.com.au/{}",
        rel.trim_end_matches("index.html")
    );
    let mut failures = site_tools::check_design::page_copy_failures(rel, html);
    failures.extend(site_tools::check_design::page_fictional_failures(rel, html));
    // The cross-reference marker is the instrument's dash, kept by the mask.
    failures.extend(dash_failures(
        rel,
        &html
            .replace(" \u{2013} see Table ", " see Table ")
            .replace(" \u{2013} See Table ", " See Table "),
    ));
    let entry = site_tools::llms_full::entry(html, &url).unwrap();
    // Lead length is the instrument's: masking keeps it, and
    // `every_asset_page_opens_with_a_sentence_that_answers_alone` holds the real pages to it.
    failures.extend(
        site_tools::passages::page_failures(&url, &entry)
            .into_iter()
            .filter(|failure| !failure.contains(": lead has ")),
    );
    failures
}

#[test]
fn the_pages_own_wording_keeps_the_site_copy_and_passage_rules() {
    let build = masked_build();
    let failures: Vec<String> = pages(build)
        .flat_map(|(rel, html)| wording_failures(rel, html))
        .collect();
    assert!(
        failures.is_empty(),
        "{} failures, such as {:?}",
        failures.len(),
        &failures[..failures.len().min(5)]
    );
}

#[test]
fn the_wording_rules_catch_banned_prose_invented_data_dashes_and_a_dangling_opener() {
    let build = masked_build();
    let (rel, html) = pages(build)
        .find(|(rel, _)| rel.contains("/asset/"))
        .unwrap();
    assert!(wording_failures(rel, html).is_empty());
    let lead = "<p class=\"lead-note\">";
    let filler = " the cost of the asset is spread over the years it is used".repeat(4);
    for (injected, expected) in [
        (format!("{lead}We delve into it. "), "banned"),
        (format!("{lead}A synthetic row. "), "write 'fictional'"),
        (
            format!("{lead}Plant \u{2013} equipment. "),
            "en dash present",
        ),
        (
            format!("<h2>Notes</h2>\n<p>As discussed,{filler}.</p>\n{lead}"),
            "dangling reference",
        ),
    ] {
        let broken = html.replacen(lead, &injected, 1);
        let failures = wording_failures(rel, &broken);
        assert!(
            failures.iter().any(|f| f.contains(expected)),
            "{expected}: {failures:?}"
        );
    }
}

#[test]
fn the_delivery_check_reads_every_effective_life_page() {
    let directory = tempfile::tempdir().unwrap();
    let site = directory.path();
    for rel in [
        "_config.yml",
        site_tools::check_design::PROOF_ASSET,
        site_tools::check_design::PROOF_MOBILE_ASSET,
    ] {
        let target = site.join(rel);
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::copy(root().join(rel), target).unwrap();
    }
    let rel = "tools/depreciation-rates/asset/example/index.html";
    std::fs::create_dir_all(site.join(rel).parent().unwrap()).unwrap();
    std::fs::write(
        site.join(rel),
        "<!DOCTYPE html>\n<html lang=\"en-AU\"><head></head><body></body></html>\n",
    )
    .unwrap();
    let baseline = site_tools::pyjson::Json::Object(Vec::new());
    let failures = site_tools::check_design::check_document_delivery(site, &baseline).unwrap();
    assert!(failures.iter().any(|f| f.starts_with(rel)), "{failures:?}");
}

#[test]
fn a_cross_reference_links_its_table_b_group_whatever_the_case_of_see() {
    for see in ["see", "See"] {
        let mut rows = grain();
        rows.push(row(
            &format!("Chiller units \u{2013} {see} Table B Air conditioning assets"),
            0,
            None,
        ));
        let build = files(&fixture(rows, letter_a()), None, Some(DAY)).unwrap();
        let (_, html) = pages(&build)
            .find(|(rel, html)| rel.contains("/industry/") && html.contains("Chiller units"))
            .unwrap();
        assert!(
            html.contains(&format!("<a href=\"/tools/depreciation-rates/asset/air-conditioning-assets/\">Chiller units \u{2013} {see} Table B")),
            "{see}"
        );
    }
}

#[test]
fn the_map_keeps_an_address_the_rule_would_now_give_another_row() {
    let first = files(&fixture(grain(), letter_a()), None, Some(DAY)).unwrap();
    let map = &first.files[MAP_REL];
    let old = key(&["A", "Grain growing", "Livestock grids"]);
    let mut rows = grain();
    // A second 'Livestock grids' row: the rule now qualifies both with their headings.
    rows.insert(5, row("Livestock grids", 1, Some(25)));
    let fresh = records(&files(&fixture(rows.clone(), letter_a()), None, Some(LATER)).unwrap());
    let later = records(&files(&fixture(rows, letter_a()), Some(map), Some(LATER)).unwrap());
    let before = &records(&first)[&old].0;
    assert_ne!(
        &fresh[&old].0, before,
        "the rule alone no longer gives the old address"
    );
    assert_eq!(&later[&old].0, before, "the map keeps it");
    let new = &later[&key(&[
        "A",
        "Grain growing",
        "Irrigation assets:",
        "Livestock grids",
    ])]
        .0;
    assert!(
        later.values().filter(|(url, _, _)| url == new).count() == 1,
        "{new}"
    );
}

#[test]
fn a_map_address_outside_the_family_is_refused() {
    let first = files(&fixture(grain(), letter_a()), None, Some(DAY)).unwrap();
    let map = &first.files[MAP_REL];
    let page = "\"url\":\"/tools/depreciation-rates/industry/\"";
    assert!(map.contains(page));
    for url in [
        "/",
        "/tools/depreciation-rates/",
        "/tools/depreciation-rates/industry/../../x/",
        "/tools/depreciation-rates/industry/a/b/c/",
        "/tools/depreciation-rates/industry/Grain/",
    ] {
        let edited = map.replacen(page, &format!("\"url\":\"{url}\""), 1);
        let refused = files(&fixture(grain(), letter_a()), Some(&edited), Some(LATER)).err();
        assert!(
            refused.as_deref().is_some_and(|e| e.contains(url)),
            "{url}: {refused:?}"
        );
    }
}

#[test]
fn a_row_with_no_months_or_a_date_that_is_not_text_is_refused() {
    let mut zero = grain();
    zero.push(json!(["Silos", 0, "0", 0, "*", "2008-07-01"]));
    let mut number = grain();
    number.push(json!(["Silos", 0, "5", 60, "*", 2008]));
    for rows in [zero, number] {
        let refused = files(&fixture(rows, letter_a()), None, Some(DAY)).err();
        assert!(
            refused.as_deref().is_some_and(|e| e.contains("Silos")),
            "{refused:?}"
        );
    }
}

#[test]
fn a_new_row_whose_rule_address_is_taken_gets_a_digest() {
    let first = files(&fixture(grain(), letter_a()), None, Some(DAY)).unwrap();
    let map = &first.files[MAP_REL];
    let taken = &records(&first)[&key(&["A", "Grain growing", "Irrigation assets:", "Pumps"])].0;
    let mut rows = grain();
    // Its own words give the address the irrigation pumps already hold.
    rows.push(row("Irrigation assets pumps", 0, Some(10)));
    let later = records(&files(&fixture(rows, letter_a()), Some(map), Some(LATER)).unwrap());
    let new = &later[&key(&["A", "Grain growing", "Irrigation assets pumps"])].0;
    let digest = new.trim_end_matches('/').rsplit('-').next().unwrap();
    assert!(
        new.starts_with(taken.trim_end_matches('/')) && new != taken,
        "{new} {taken}"
    );
    assert!(
        digest.len() == 6 && digest.bytes().all(|b| b.is_ascii_hexdigit()),
        "{new}"
    );
}

#[test]
fn a_row_page_trail_must_name_its_group_as_the_group_page_does() {
    let rel = "tools/depreciation-rates/industry/iron-smelting-and-steel-manufacturing/accumulators-and-loopers/index.html";
    let html = std::fs::read_to_string(root().join(rel)).unwrap();
    let check = |html: &str| {
        let mut failures = Vec::new();
        site_tools::site_contracts::check_collection_breadcrumb(html, rel, &root(), &mut failures);
        failures
    };
    assert_eq!(check(&html), Vec::<String>::new());
    let renamed = html.replace(
        "Iron smelting and steel manufacturing",
        "Iron smelting and steel making",
    );
    let failures = check(&renamed);
    assert!(
        failures.iter().any(|f| f.contains("visible breadcrumb is")),
        "{failures:?}"
    );
}

#[test]
fn titles_and_descriptions_keep_the_row_or_mark_the_cut() {
    for (rel, title_has, description_has) in [
        (
            "industry/iron-smelting-and-steel-manufacturing/accumulators-and-loopers",
            "Accumulators and loopers effective life",
            "Accumulators and loopers:",
        ),
        (
            "asset/accommodation-units-in-caravan-tourist/other-accommodation-units",
            "Other accommodation units effective life",
            "Other accommodation units \u{2026}:",
        ),
    ] {
        let path = root().join(format!("tools/depreciation-rates/{rel}/index.html"));
        let html = std::fs::read_to_string(path).unwrap();
        let title = site_tools::html::unescape(between(&html, "<title>", "</title>"));
        let description = site_tools::html::unescape(between(
            &html,
            "<meta name=\"description\" content=\"",
            "\"",
        ));
        assert!(title.contains(title_has), "{rel}: {title}");
        assert!(
            description.contains(description_has),
            "{rel}: {description}"
        );
    }
}

/// The text before its closing bracketed aside, if it ends in one.
fn without_closing_aside(text: &str) -> Option<&str> {
    let mut depth = 0usize;
    for (at, c) in text.char_indices().rev() {
        match c {
            ')' => depth += 1,
            '(' if depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    return Some(text[..at].trim_end());
                }
            }
            _ if depth == 0 => return None,
            _ => {}
        }
    }
    None
}

/// Whether a part of a head is one of `whole` as printed, or a cut of one shown by an
/// ellipsis.
fn whole_or_marked(part: &str, whole: &[String]) -> bool {
    let kept = part.trim_end_matches([' ', '\u{2026}']);
    whole.iter().any(|text| text == part)
        || (part.ends_with('\u{2026}') && whole.iter().any(|text| text.starts_with(kept)))
}

#[test]
fn every_title_and_group_description_shows_its_cuts() {
    let data = load(&committed()).unwrap();
    let plan = plan(&data).unwrap();
    let mut wrong = Vec::new();
    for page in &plan.pages {
        let html = &built().files[&format!("{}index.html", page.url.trim_start_matches('/'))];
        let title = site_tools::html::unescape(between(html, "<title>", "</title>"));
        let group = &data.groups[page.group];
        let name = group.heading.trim_end_matches(':').to_owned();
        match page.kind {
            Kind::Asset(row) => {
                let entry = match row {
                    Some(at) => &group.entries[at],
                    None => group.top.as_ref().unwrap(),
                };
                let (subject, rest) = title.split_once(" effective life: ").unwrap();
                let subject = subject.replace(" / ", ": ");
                let words = instrument_words(group, entry);
                let quoted = misquotes(&subject, &words).is_none()
                    || without_closing_aside(&words)
                        .is_some_and(|words| misquotes(&subject, words).is_none());
                // The headings, nearest first, the industry or 'Table B' and the ANZSIC
                // codes; a title adds 1 or 2 of them.
                let mut parts: Vec<String> = Vec::new();
                if group.table == Table::B && group.top.as_ref() != Some(entry) {
                    parts.push(address::shown_core(&group.heading));
                }
                parts.extend(
                    entry.path[..entry.path.len() - 1]
                        .iter()
                        .map(|h| address::shown_core(h)),
                );
                parts.retain(|part| !part.is_empty());
                parts.reverse();
                parts.push(match group.table {
                    Table::A => name.clone(),
                    Table::B => "Table B".to_owned(),
                });
                parts.extend(group.anzsic.iter().map(|codes| format!("ANZSIC {codes}")));
                let mut whole = parts.clone();
                for (i, first) in parts.iter().enumerate() {
                    whole.extend(
                        parts[i + 1..]
                            .iter()
                            .map(|second| format!("{first}, {second}")),
                    );
                }
                let extra = rest.split_once(", ").map(|(_, extra)| extra);
                if !quoted || extra.is_some_and(|extra| !whole_or_marked(extra, &whole)) {
                    wrong.push(format!("{}: {title}", page.url));
                }
            }
            Kind::Group => {
                let core = address::shown_core(&name);
                let shown = ["Table A: ", "Table B: "]
                    .iter()
                    .find_map(|prefix| title.strip_prefix(prefix))
                    .unwrap_or(&title)
                    .split(" effective lives")
                    .next()
                    .unwrap();
                if !whole_or_marked(shown, &[name.clone(), core]) {
                    wrong.push(format!("{}: {title}", page.url));
                }
                let description = site_tools::html::unescape(between(
                    html,
                    "<meta name=\"description\" content=\"",
                    "\"",
                ));
                let place = description.split(": every row").next().unwrap();
                let ends = [
                    group
                        .anzsic
                        .as_deref()
                        .map(|codes| format!("ANZSIC {codes}")),
                    Some("rows for the whole division".to_owned()),
                    Some(format!("letter {}", group.parent)),
                    Some(name.clone()),
                ];
                if !place.ends_with('\u{2026}')
                    && !ends
                        .iter()
                        .flatten()
                        .any(|end| place.ends_with(end.as_str()))
                {
                    wrong.push(format!("{}: {description}", page.url));
                }
            }
            Kind::Index(_) => {}
        }
    }
    assert!(
        wrong.is_empty(),
        "{} unmarked cuts: {:#?}",
        wrong.len(),
        &wrong[..wrong.len().min(12)]
    );
}

#[test]
fn a_shown_cut_keeps_the_instrument_s_punctuation_and_stray_brackets() {
    assert_eq!(
        address::shown_core("Teller cash recyclers (including notes), teller assist units"),
        "Teller cash recyclers \u{2026}, teller assist units"
    );
    assert_eq!(
        address::shown_core("openers, vent cutters etc)"),
        "openers, vent cutters etc)"
    );
}

#[test]
fn table_b_headings_do_not_stutter_and_pages_link_to_dataset() {
    let build = built();
    let computers = &build.files["tools/depreciation-rates/asset/computers-and-computer-equipment/computers-and-computer-equipment/index.html"];
    let h1 = site_tools::html::unescape(between(computers, "<h1>", "</h1>"));
    assert!(
        !h1.starts_with("Computers and computer equipment: Computers"),
        "stuttering H1: {h1}"
    );
    let monitors = &build.files["tools/depreciation-rates/asset/computers-and-computer-equipment/computer-monitors/index.html"];
    let monitors_title = site_tools::html::unescape(between(monitors, "<title>", "</title>"));
    assert!(
        !monitors_title.contains('\u{2026}'),
        "clean unique title should not carry an ellipsis: {monitors_title}"
    );
    for (rel, html) in pages(build) {
        assert!(
            html.contains(
                "\"about\": {\n        \"@id\": \"https://duguid.com.au/tools/depreciation-rates/#dataset\"\n      }"
            ),
            "{rel}: WebPage JSON-LD must link to the LI 2025/20 Dataset"
        );
    }
}
