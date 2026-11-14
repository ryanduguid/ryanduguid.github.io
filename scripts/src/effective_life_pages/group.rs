// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! The page for a Table A sub-industry or a top-level Table B row, and the 2 index pages
//! that list them.
use super::asset::DESCRIPTION_MAX;
use super::figures::{count, date, diminishing_value, prime_cost, years};
use super::head::{Meta, TITLE_MAX, close, crumbs, esc, fit, open};
use super::load::{Entry, Group, Source, Table};
use super::site::{Site, group_name, index_name, index_url};
use super::{BASE_URL, Trail, is_cross_reference, json_ld, notes};

pub fn trail_to_index(table: Table) -> Trail {
    vec![
        ("Home".into(), "/".into()),
        ("Tools".into(), "/tools/".into()),
        ("Depreciation rates".into(), BASE_URL.into()),
        (index_name(table).into(), index_url(table)),
    ]
}

pub fn trail_to_group(site: &Site, index: usize) -> Trail {
    let group = site.group(index);
    let mut trail = trail_to_index(group.table);
    trail.push((group_name(group), site.plan.group_urls[index].clone()));
    trail
}

/// The opening of a page through its header, given its trail, title and lead.
pub fn opening(site: &Site, trail: &Trail, title: &str, description: &str, lead: &str) -> String {
    let path = &trail[trail.len() - 1].1;
    let steps: Vec<(&str, &str)> = trail
        .iter()
        .map(|(n, p)| (n.as_str(), p.as_str()))
        .collect();
    let mut out = open(&Meta {
        title,
        description,
        path,
    });
    out.push_str(&format!(
        "      <header class=\"article-header site-shell\">\n{}        <h1>{}</h1>\n        <p class=\"lead-note\">{lead}</p>\n{}      </header>\n      <div class=\"site-shell accounting-content\">\n",
        crumbs(&steps),
        esc(&trail[trail.len() - 1].0),
        notes::page_meta(&site.data.source),
    ));
    out
}

/// The end of a page: its source section, footer and structured data.
pub fn ending(site: &Site, trail: &Trail, description: &str) -> String {
    let steps: Vec<(&str, &str)> = trail
        .iter()
        .map(|(n, p)| (n.as_str(), p.as_str()))
        .collect();
    let (name, path) = &trail[trail.len() - 1];
    let mut out = notes::source(&site.data.source);
    out.push_str("      </div>\n");
    out.push_str(&close(&json_ld::page(
        path,
        name,
        description,
        &site.data.source.url,
        &steps,
    )));
    out
}

fn lives(group: &Group) -> usize {
    group
        .entries
        .iter()
        .filter(|entry| entry.life.is_some())
        .count()
}

fn cell(site: &Site, index: usize, at: usize, entry: &Entry) -> String {
    let headings = &entry.path[..entry.path.len() - 1];
    let mut place: Vec<String> = headings.iter().map(|h| esc(h)).collect();
    let own = match &site.plan.entry_urls[index][at] {
        Some(url) => format!("<a href=\"{url}\">{}</a>", esc(entry.text())),
        None => match site.cross_reference(entry.text()) {
            Some(url) => format!("<a href=\"{url}\">{}</a>", esc(entry.text())),
            None => esc(entry.text()),
        },
    };
    place.push(own);
    place.join(" / ")
}

/// Every row of the group in the instrument's order; a heading shows the headings above it.
fn rows(site: &Site, index: usize) -> String {
    let group = site.group(index);
    let mut body = String::new();
    for (at, entry) in group.entries.iter().enumerate() {
        let text = cell(site, index, at, entry);
        body.push_str(&match &entry.life {
            Some(life) => format!(
                "              <tr><th scope=\"row\">{text}</th><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>\n",
                esc(&years(life)),
                prime_cost(life),
                diminishing_value(life),
                entry.last_updated.as_deref().map_or_else(String::new, date)
            ),
            None => format!("              <tr><th scope=\"row\">{text}</th><td></td><td></td><td></td><td></td></tr>\n"),
        });
    }
    let label = format!("Rows of {}", group_name(group));
    format!(
        "        <section id=\"rows\">\n        <h2>The rows</h2>\n        <p>A row with no life is a heading for the rows after it that name it, or points to another row.</p>\n        <div class=\"table-scroll\" role=\"region\" aria-label=\"{label}\" tabindex=\"0\">\n        <table class=\"facts facts--figures\">\n          <thead><tr><th scope=\"col\">Row</th><th scope=\"col\">Life</th><th scope=\"col\">Prime cost</th><th scope=\"col\">Diminishing value</th><th scope=\"col\">Last updated</th></tr></thead>\n          <tbody>\n{body}          </tbody>\n        </table>\n        </div>\n        </section>\n",
        label = esc(&label)
    )
}

fn group_lead(source: &Source, group: &Group) -> String {
    let year = source.year();
    let n = lives(group);
    let rows = if n == 1 {
        "1 effective life".to_owned()
    } else {
        format!("{} effective lives", count(n))
    };
    match group.table {
        Table::A if group.general => format!(
            "{} in Table A of the Commissioner’s {year} effective life determination for assets used across the {} division.",
            rows,
            esc(&group.parent)
        ),
        Table::A => format!(
            "{rows} in Table A of the Commissioner’s {year} effective life determination for {}.",
            esc(&group_name(group))
        ),
        Table::B => format!(
            "{rows} in Table B of the Commissioner’s {year} effective life determination under {}.",
            esc(&group_name(group))
        ),
    }
}

/// A group page's H1, title and description candidates, plainest first.
pub fn candidates(group: &Group) -> [Vec<String>; 3] {
    let name = group_name(group);
    let short = super::address::shown_core(&name);
    let titled = |prefix: &str, suffix: &str| {
        format!(
            "{prefix}{}{suffix}",
            fit(
                &short,
                TITLE_MAX - prefix.chars().count() - suffix.chars().count()
            )
        )
    };
    // With the bracketed qualifier, which tells 'Bakery product manufacturing' from
    // 'Bakery product manufacturing (non-factory based)'.
    let full = |prefix: &str, suffix: &str| {
        let room = TITLE_MAX - prefix.chars().count() - suffix.chars().count();
        format!("{prefix}{}{suffix}", fit(&name, room))
    };
    let titles = match group.table {
        Table::A => vec![
            titled("", " effective lives and depreciation rates"),
            titled("Table A: ", " effective lives"),
            full("Table A: ", " effective lives"),
            full("", " effective lives"),
        ],
        Table::B => vec![
            titled("", " effective lives, Table B"),
            titled("Table B: ", " effective lives and rates"),
            full("Table B: ", " effective lives and rates"),
            full("", " effective lives, Table B"),
        ],
    };
    let rest = ": every row with its effective life, prime cost and diminishing value rates and the date it was last updated.";
    let room = DESCRIPTION_MAX - rest.chars().count();
    let place = notes::table_place(group);
    let descriptions = vec![
        format!("{}{rest}", fit(&place, room)),
        format!("{}{rest}", fit(&format!("{name}, {place}"), room)),
    ];
    [vec![name], titles, descriptions]
}

/// An index page's H1, title and description, each its only candidate.
pub fn index_candidates(source: &Source, table: Table) -> [Vec<String>; 3] {
    let (what, letter) = match table {
        Table::A => ("industry", "A"),
        Table::B => ("asset", "B"),
    };
    let description = format!(
        "Every {what} in Table {letter} of the {} effective life determination, each linking to its rows, effective lives and depreciation rates.",
        source.year()
    );
    [
        vec![index_name(table).to_owned()],
        vec![index_name(table).to_owned()],
        vec![description],
    ]
}

pub fn render(site: &Site, index: usize) -> String {
    let group = site.group(index);
    let trail = trail_to_group(site, index);
    let head = site.head(&site.plan.group_urls[index]);
    let lead = group_lead(&site.data.source, group);
    let mut out = opening(site, &trail, &head.title, &head.description, &lead);
    if let Some(note) = &group.note {
        out.push_str(&format!(
            "        <p>The determination notes for this heading: {}</p>\n",
            esc(note)
        ));
    }
    out.push_str(&rows(site, index));
    out.push_str(&ending(site, &trail, &head.description));
    out
}

/// The page listing every group of a table.
pub fn render_index(site: &Site, table: Table) -> String {
    let trail = trail_to_index(table);
    let year = site.data.source.year();
    let lead = match table {
        Table::A => format!(
            "Table A of the Commissioner’s {year} effective life determination sets effective lives by industry. Choose an industry to read its rows."
        ),
        Table::B => format!(
            "Table B of the Commissioner’s {year} effective life determination sets effective lives for assets used across industries. Choose an asset to read its rows."
        ),
    };
    let head = site.head(&trail[trail.len() - 1].1);
    let mut out = opening(site, &trail, &head.title, &head.description, &lead);
    let mut parent: Option<&str> = None;
    let mut body = String::new();
    for (index, group) in site
        .data
        .groups
        .iter()
        .enumerate()
        .filter(|(_, g)| g.table == table)
    {
        if parent != Some(group.parent.as_str()) {
            if parent.is_some() {
                body.push_str(
                    "          </tbody>\n        </table>\n        </div>\n        </section>\n",
                );
            }
            parent = Some(group.parent.as_str());
            body.push_str(&index_section(&group.parent));
        }
        body.push_str(&index_row(site, index));
    }
    body.push_str("          </tbody>\n        </table>\n        </div>\n        </section>\n");
    out.push_str(&body);
    out.push_str(&ending(site, &trail, &head.description));
    out
}

fn index_section(heading: &str) -> String {
    let id: String = super::address::words(heading).join("-");
    format!(
        "        <section id=\"{id}\">\n        <h2>{}</h2>\n        <div class=\"table-scroll\" role=\"region\" aria-label=\"{}\" tabindex=\"0\">\n        <table class=\"facts facts--figures\">\n          <thead><tr><th scope=\"col\">Heading</th><th scope=\"col\">Lives</th></tr></thead>\n          <tbody>\n",
        esc(heading),
        esc(heading)
    )
}

fn index_row(site: &Site, index: usize) -> String {
    let group = site.group(index);
    if is_cross_reference(group) {
        let text = match site.cross_reference(&group.heading) {
            Some(url) => format!("<a href=\"{url}\">{}</a>", esc(&group.heading)),
            None => esc(&group.heading),
        };
        return format!(
            "              <tr><th scope=\"row\">{text}</th><td></td></tr>
"
        );
    }
    let url = &site.plan.group_urls[index];
    let name = match (group.table, group.general) {
        (Table::A, true) => format!("{} (rows for the whole division)", group_name(group)),
        _ => group_name(group),
    };
    let lives = match group.top.as_ref().and_then(|top| top.life.as_ref()) {
        Some(life) => esc(&years(life)),
        None => count(lives(group)),
    };
    format!(
        "              <tr><th scope=\"row\"><a href=\"{url}\">{}</a></th><td>{lives}</td></tr>\n",
        esc(&name)
    )
}
