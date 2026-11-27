// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Page sections every asset page shares: how to read the row, the calculator, the
//! source and the dates.
use super::figures::{date, years};
use super::head::esc;
use super::load::{Entry, Group, Source, Table};
use super::site::group_name;
use super::{BASE_URL, SENTINEL_MODIFIED, SENTINEL_PUBLISHED};
use crate::effective_life::Life;

/// Where the row sits: its table, then its industry and ANZSIC codes or its letter.
pub fn table_place(group: &Group) -> String {
    match group.table {
        Table::A => {
            let codes = group
                .anzsic
                .as_deref()
                .map_or_else(String::new, |codes| format!(", ANZSIC {codes}"));
            if group.general {
                format!(
                    "Table A (industry categories), {}, rows for the whole division{codes}",
                    group.parent
                )
            } else {
                format!(
                    "Table A (industry categories), {} / {}{codes}",
                    group.parent,
                    group_name(group)
                )
            }
        }
        Table::B => format!("Table B (asset categories), letter {}", group.parent),
    }
}

pub fn page_meta(source: &Source) -> String {
    format!(
        "        <p class=\"page-meta\">Published {}. Page updated {}. Sources checked {}.</p>\n",
        date(SENTINEL_PUBLISHED),
        date(SENTINEL_MODIFIED),
        date(&source.read)
    )
}

/// The marks in the instrument's third column, as rows of the facts table.
pub fn marks(flags: &str) -> String {
    let mut out = String::new();
    let reviewed = if flags.contains('*') {
        "Yes: the row is marked * as reviewed in the Commissioner’s ongoing review of the determination."
    } else {
        "No * mark."
    };
    out.push_str(&format!(
        "                <tr><th scope=\"row\">Reviewed</th><td>{reviewed}</td></tr>\n"
    ));
    if flags.contains('#') {
        out.push_str(&format!(
            "                <tr><th scope=\"row\">Capped life</th><td>Marked #: a capped life is available under section 40-102. See <a href=\"{BASE_URL}#capped-lives\">capped lives</a>.</td></tr>\n"
        ));
    }
    out
}

/// The guide to Schedule 2 explains these words where a row uses them.
const GUIDE: [(&str, &str); 8] = [
    (
        "including",
        "Because the row says ‘including’, each item it lists is treated as a separate asset with this life (paragraph 3 of the guide to Schedule 2).",
    ),
    (
        "incorporating",
        "Because the row says ‘incorporating’, the items it lists are components of the one asset, not separate assets (paragraph 4 of the guide).",
    ),
    (
        "freestanding",
        "Where ‘freestanding’ describes an asset, it means an item designed to be portable or movable, attached to the premises only for temporary stability (paragraph 7 of the guide).",
    ),
    (
        "fixed",
        "Where ‘fixed’ describes how an asset is attached, it means an item annexed or attached by any means, such as screws, nails, bolts, glue, adhesive, grout or cement, other than merely for temporary stability (paragraph 8 of the guide).",
    ),
    (
        "environmental control structure",
        "An environmental control structure is one designed to give a protective environment in which the operator can monitor and manipulate the factors that influence growing (paragraph 9 of the guide).",
    ),
    (
        "protective structure",
        "A protective structure is one used primarily and principally to protect a growing product from natural elements such as sun, hail, birds and wind (paragraph 10 of the guide).",
    ),
    (
        "hire car",
        "A hire car is a passenger car hired with a driver, not being a taxi (paragraph 11 of the guide).",
    ),
    (
        "rental car",
        "A rental car is a passenger car hired, leased or rented for short-term use without a driver (paragraph 12 of the guide).",
    ),
];

/// The words in a row that bring in a paragraph of the guide to Schedule 2.
pub fn guide_terms() -> impl Iterator<Item = &'static str> {
    GUIDE.iter().map(|(term, _)| *term)
}

fn mentions(text: &str, term: &str) -> bool {
    let lower = text.to_lowercase();
    let word = |c: char| c.is_alphanumeric();
    lower.match_indices(term).any(|(at, _)| {
        let before = lower[..at].chars().next_back().is_none_or(|c| !word(c));
        let after = lower[at + term.len()..]
            .chars()
            .next()
            .is_none_or(|c| !word(c));
        before && after
    })
}

fn applies(group: &Group) -> String {
    match group.table {
        Table::A => format!(
            "In {}, this life applies if the asset matches the row exactly or is of a kind that falls within or broadly satisfies the function described (subsection 6(2)). In another industry, use its applicable Table A life. If none applies, use the matching Table B row (subsection 6(3)).",
            esc(&group_name(group))
        ),
        Table::B => "Use this Table B row if your asset matches its description and no Table A row covers the asset or its function in your industry (subsection 6(3)).".to_owned(),
    }
}

pub fn reading(group: &Group, entry: &Entry) -> String {
    let text = entry.path.join(" ");
    let mut paragraphs = vec![applies(group)];
    paragraphs.extend(
        GUIDE
            .iter()
            .filter(|(term, _)| mentions(&text, term))
            .map(|(_, note)| (*note).to_owned()),
    );
    let updated = entry.last_updated.as_deref().map(date);
    paragraphs.push(match updated {
        Some(updated) => format!(
            "This life was last determined on {updated}. An earlier determination may apply at the time subsection 40-95(2) specifies for your asset. Check <a href=\"{BASE_URL}#which-determination\">which determination applies</a>."
        ),
        None => format!("See <a href=\"{BASE_URL}#which-determination\">which determination applies</a> to your asset."),
    });
    let body: String = paragraphs
        .iter()
        .map(|p| format!("        <p>{p}</p>\n"))
        .collect();
    format!(
        "        <section id=\"reading\">\n        <h2>Reading this row</h2>\n{body}        </section>\n"
    )
}

pub fn calculator(life: &Life) -> String {
    format!(
        "        <section id=\"work-it-out\">\n        <h2>Work out a deduction</h2>\n        <p>The <a href=\"{BASE_URL}#deduction\">depreciation calculator</a> uses your cost, start date and this effective life of {} to work out each year’s decline in value.</p>\n        </section>\n",
        esc(&years(life))
    )
}

pub fn source(source: &Source) -> String {
    format!(
        "        <section id=\"source\">\n        <h2>Source</h2>\n        <p>Schedule 2 of the <a href=\"{url}\"><cite>{title}</cite></a> ({id}) was registered on {registered} and checked on {read}. Download the <a href=\"{BASE_URL}effective-life.json\">register data (JSON)</a> or read <a href=\"{BASE_URL}#source\">how the data was checked</a>.</p>\n        <p>{attribution}</p>\n        <p>Reused under the <a href=\"{licence}\">Creative Commons Attribution 4.0 International licence</a>. The tables show the published headings, dates in words and 2 rates calculated from each effective life.</p>\n        </section>\n",
        url = esc(&source.url),
        title = esc(&source.title),
        id = esc(&source.register_id),
        registered = date(&source.registered),
        read = date(&source.read),
        attribution = attribution(&source.attribution),
        licence = esc(&source.licence_url),
    )
}

/// The Register's attribution sentence with its address as a link.
fn attribution(text: &str) -> String {
    let site = "https://www.legislation.gov.au";
    let escaped = esc(text);
    match escaped.rsplit_once(site) {
        Some((before, after)) => format!("{before}<a href=\"{site}\">{site}</a>{after}"),
        None => escaped,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_attribution_links_the_register_address_only_when_it_names_it() {
        assert_eq!(
            attribution("Source: https://www.legislation.gov.au."),
            "Source: <a href=\"https://www.legislation.gov.au\">https://www.legislation.gov.au</a>."
        );
        assert_eq!(
            attribution("Source: the Register & co"),
            "Source: the Register &amp; co"
        );
    }
}
