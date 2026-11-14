// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! The page for one row with a life.
use super::address::shown_core;
use super::figures::{date, diminishing_value, prime_cost, years};
use super::group::{ending, opening, trail_to_group, trail_to_index};
use super::head::{TITLE_MAX, cut, esc, fit, fit_end};
use super::load::{Entry, Group, Source, Table};
use super::site::{RowRef, Site, group_name, key};
use super::{Trail, notes};
use crate::effective_life::Life;

/// The longest row wording a heading, trail or description shows whole; a longer row is
/// shown without its bracketed asides.
const NAME_MAX: usize = 60;
/// The longest description the site's checks allow without a warning, in characters.
pub const DESCRIPTION_MAX: usize = 165;
/// The most words in a page's lead (`passages::LEAD_WORDS`).
const LEAD_WORDS: usize = crate::passages::LEAD_WORDS;

/// The row's wording, or without its asides when it is long.
fn name(entry: &Entry) -> String {
    let text = entry.text();
    let short = shown_core(text);
    if text.chars().count() <= NAME_MAX || short.is_empty() {
        text.to_owned()
    } else {
        short
    }
}

/// The headings above the row, nearest last, without asides or colons.
fn headings(group: &Group, entry: &Entry) -> Vec<String> {
    let above = &entry.path[..entry.path.len() - 1];
    let mut out: Vec<&String> = Vec::new();
    if group.table == Table::B && group.top.as_ref() != Some(entry) {
        out.push(&group.heading);
    }
    out.extend(above);
    out.iter()
        .map(|heading| shown_core(heading))
        .filter(|heading| !heading.is_empty())
        .collect()
}

/// The page's plainest label: the nearest heading and the row, as the instrument sets them.
fn label(group: &Group, entry: &Entry) -> String {
    match headings(group, entry).last() {
        Some(heading) => format!("{heading}: {}", name(entry)),
        None => name(entry),
    }
}

/// The industry a Table A row is for, or 'Table B'.
fn place(group: &Group) -> String {
    match group.table {
        Table::A => group_name(group),
        Table::B => "Table B".to_owned(),
    }
}

/// Labels from plainest to most specific: then with the industry or 'Table B', then with
/// every heading, then with the row's whole wording. The last is unique, as a row's
/// table, group, headings and wording are.
pub fn h1_candidates(group: &Group, entry: &Entry) -> Vec<String> {
    let plain = label(group, entry);
    let place = place(group);
    let all = headings(group, entry);
    let path = |text: &str| {
        if all.is_empty() {
            text.to_owned()
        } else {
            format!("{}: {text}", all.join(" / "))
        }
    };
    vec![
        plain.clone(),
        format!("{plain} ({place})"),
        format!("{} ({place})", path(&name(entry))),
        format!("{} ({place})", path(entry.text())),
    ]
}

/// '<subject> effective life: <years><extra>', where `extra` is ', <heading>' or
/// ', <industry>'. The subject stays whole when it fits with at least the first whole
/// word of the extra. Else, first, the subject without its asides, if it fits, with as
/// much of the extra as keeps a whole word, or none; then the extra with up to half the
/// room left by the tail and the subject cut to the rest, as the extra may be what tells
/// the row apart. An ellipsis shows each cut but that of a closing aside.
fn titled(subject: &str, tail: &str, extra: &str) -> Vec<String> {
    let keep = TITLE_MAX.saturating_sub(tail.chars().count());
    if let Some(title) = with_extra(subject, tail, extra, keep) {
        return vec![title];
    }
    let core = shown_core(subject);
    let bare = core.trim_end_matches([' ', '\u{2026}']);
    let aside = closing_aside(subject, bare);
    let shown = if aside { bare } else { core.as_str() };
    let mut out = Vec::new();
    if shown.chars().count() <= keep {
        out.push(with_extra(shown, tail, extra, keep).unwrap_or_else(|| format!("{shown}{tail}")));
    }
    let size = subject.chars().count();
    let extra_room = keep.saturating_sub(size.min(keep / 2));
    let extra = if extra.chars().count() > extra_room {
        let kept = cut(extra.trim_start_matches(", "), extra_room.saturating_sub(2));
        if kept == "\u{2026}" {
            String::new()
        } else {
            format!(", {kept}")
        }
    } else {
        extra.to_owned()
    };
    let room = keep.saturating_sub(extra.chars().count());
    out.push(format!(
        "{}{tail}{extra}",
        cut(if aside { bare } else { subject }, room)
    ));
    out
}

/// `subject`, `tail` and `extra` whole, or with the extra's leading whole words and an
/// ellipsis, in `keep` characters besides the tail; `None` if not a word of it fits.
fn with_extra(subject: &str, tail: &str, extra: &str, keep: usize) -> Option<String> {
    let size = subject.chars().count();
    if size + extra.chars().count() <= keep {
        return Some(format!("{subject}{tail}{extra}"));
    }
    let body = extra.trim_start_matches(", ");
    let words = fit(body, keep.saturating_sub(size + 4));
    let at_word = body
        .strip_prefix(words.as_str())
        .is_some_and(|rest| rest.starts_with([' ', ',', ';', ':']));
    (!words.is_empty() && at_word).then(|| format!("{subject}{tail}, {words} \u{2026}"))
}

/// Whether `text` is `kept` and one bracketed aside that closes it: a title may drop
/// that aside unmarked, as it qualifies the row rather than names it.
fn closing_aside(text: &str, kept: &str) -> bool {
    let Some(rest) = text.strip_prefix(kept).map(str::trim) else {
        return false;
    };
    let mut depth = 0usize;
    for (at, c) in rest.char_indices() {
        match c {
            '(' => depth += 1,
            ')' if depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    return at + 1 == rest.len();
                }
            }
            _ if depth == 0 => return false,
            _ => {}
        }
    }
    false
}

/// What sets a row apart beyond its wording: its headings, nearest first, its industry
/// or 'Table B' and its ANZSIC codes. No 2 rows share their wording and all of these.
fn context(group: &Group, entry: &Entry) -> Vec<String> {
    let mut out: Vec<String> = headings(group, entry).into_iter().rev().collect();
    out.push(place(group));
    out.extend(group.anzsic.iter().map(|codes| format!("ANZSIC {codes}")));
    out
}

/// Titles from plainest to most specific, each at most 65 characters.
pub fn title_candidates(group: &Group, entry: &Entry, life: &Life) -> Vec<String> {
    let tail = format!(" effective life: {}", years(life));
    let row = entry.text();
    let place = format!(", {}", place(group));
    let mut out = Vec::new();
    if let Some(heading) = headings(group, entry).last() {
        out.extend(titled(row, &tail, &format!(", {heading}")));
        out.extend(titled(&format!("{heading}: {row}"), &tail, &place));
    }
    out.extend(titled(row, &tail, &place));
    let all = headings(group, entry);
    if all.len() > 1 {
        out.extend(titled(
            &format!("{}: {row}", all.join(" / ")),
            &tail,
            &place,
        ));
    }
    // The row first, then 1 or 2 parts of its context: where the forms above cut away the
    // part that tells 2 rows apart, one of these keeps it.
    let context = context(group, entry);
    let row = name(entry);
    for (i, first) in context.iter().enumerate() {
        out.extend(titled(&row, &tail, &format!(", {first}")));
        for second in &context[i + 1..] {
            out.extend(titled(&row, &tail, &format!(", {first}, {second}")));
        }
    }
    // Last, rows that differ only in their closing words ('... with gas insulated
    // switchgear'): the end of the wording, after an ellipsis, and one context part.
    for part in &context {
        let extra = format!(", {part}");
        let room = TITLE_MAX.saturating_sub(tail.chars().count() + extra.chars().count());
        let end = fit_end(&row, room);
        if end.chars().any(char::is_alphanumeric) {
            out.push(format!("{end}{tail}{extra}"));
        }
    }
    out.retain(|title| title.chars().count() <= TITLE_MAX);
    out.dedup();
    out
}

/// The row's name, then 1 or 2 parts of its context.
fn row_first(group: &Group, entry: &Entry) -> Vec<String> {
    let context = context(group, entry);
    let row = name(entry);
    let mut out = Vec::new();
    for (i, first) in context.iter().enumerate() {
        out.push(format!("{row}, {first}"));
        out.extend(
            context[i + 1..]
                .iter()
                .map(|second| format!("{row}, {first}, {second}")),
        );
    }
    out
}

/// Descriptions that name the row: its H1 label whole where one fits, else the row first
/// with its context.
pub fn description_candidates(
    source: &Source,
    group: &Group,
    entry: &Entry,
    life: &Life,
) -> Vec<String> {
    let table = match group.table {
        Table::A => "Table A",
        Table::B => "Table B",
    };
    let updated = entry
        .last_updated
        .as_deref()
        .map_or_else(|| "not stated".to_owned(), date);
    let full = format!(
        ": effective life {}, prime cost {}, diminishing value {}, last updated {updated} ({table}, {} determination).",
        years(life),
        prime_cost(life),
        diminishing_value(life),
        source.year(),
    );
    let short = format!(
        ": effective life {}, last updated {updated} ({table}).",
        years(life)
    );
    let labels = h1_candidates(group, entry);
    let row_first = row_first(group, entry);
    // An H1 label whole comes first, with the figures or the life alone. Then the row
    // first with 1 or 2 parts of its context, as for titles, and only then a cut H1 label,
    // whose cut can take the row; each cut ends in an ellipsis. Last, the end of the most
    // specific label, where rows that differ only in their closing words differ.
    let mut out: Vec<String> = labels
        .iter()
        .flat_map(|label| [format!("{label}{full}"), format!("{label}{short}")])
        .filter(|text| text.chars().count() <= DESCRIPTION_MAX)
        .collect();
    for label in row_first.iter().chain(&labels) {
        for tail in [&full, &short] {
            let room = DESCRIPTION_MAX.saturating_sub(tail.chars().count());
            out.push(format!("{}{tail}", cut(label, room)));
        }
    }
    if let Some(label) = labels.last() {
        for tail in [&full, &short] {
            let room = DESCRIPTION_MAX.saturating_sub(tail.chars().count());
            out.push(format!("{}{tail}", fit_end(label, room)));
        }
    }
    out.dedup();
    out
}

/// The opening sentence, which answers alone: the row, its industry or table, its life,
/// the determination and the date the life was last set. Over the lead limit, it drops
/// template words first, never the instrument's.
fn lead(source: &Source, group: &Group, entry: &Entry, life: &Life) -> String {
    let subject = match group.table {
        Table::A => format!(
            "‘{}’, for an asset used in {},",
            label(group, entry),
            group_name(group)
        ),
        Table::B => format!(
            "‘{}’ in Table B, which applies where no Table A row applies to the asset in its industry,",
            label(group, entry)
        ),
    };
    let updated = entry.last_updated.as_deref().map(date);
    let ending = |by: &str, when: &str| match &updated {
        Some(updated) => format!(" {by}, last reviewed{when} on {updated}."),
        None => format!(" {by}."),
    };
    let life = years(life);
    let id = format!("({})", source.register_id);
    let options = [
        format!(
            "{subject} has an effective life of {life}{}",
            ending(
                &format!(
                    "under the Commissioner’s {} effective life determination {id}",
                    source.year()
                ),
                " and determined"
            )
        ),
        format!(
            "{subject} has an effective life of {life}{}",
            ending(&id, " and determined")
        ),
        format!(
            "{subject} has an effective life of {life}{}",
            ending(&id, "")
        ),
    ];
    let fits = options
        .iter()
        .find(|text| text.split_whitespace().count() <= LEAD_WORDS);
    esc(fits.unwrap_or(&options[options.len() - 1]))
}

fn trail(site: &Site, row: RowRef) -> Trail {
    let group = site.group(row.0);
    let mut trail = match row.1 {
        Some(_) => trail_to_group(site, row.0),
        None => trail_to_index(group.table),
    };
    let url = site.url(row);
    trail.push((site.head(url).h1.clone(), url.to_owned()));
    trail
}

/// The page's text. Its heading and the end of its trail are the row's settled H1.
pub fn render(site: &Site, row: RowRef) -> String {
    let group = site.group(row.0);
    let entry = site.entry(row);
    let life = entry
        .life
        .as_ref()
        .expect("an asset page is for a row with a life");
    let trail = trail(site, row);
    let head = site.head(site.url(row));
    let mut out = opening(
        site,
        &trail,
        &head.title,
        &head.description,
        &lead(&site.data.source, group, entry, life),
    );
    out.push_str(&facts(site, row, life));
    out.push_str(&notes::reading(group, entry));
    out.push_str(&nearby(site, row));
    out.push_str(&elsewhere(site, row));
    out.push_str(&notes::calculator(life));
    out.push_str(&ending(site, &trail, &head.description));
    out
}

fn fact(name: &str, value: &str) -> String {
    format!("                <tr><th scope=\"row\">{name}</th><td>{value}</td></tr>\n")
}

fn facts(site: &Site, row: RowRef, life: &Life) -> String {
    let group = site.group(row.0);
    let entry = site.entry(row);
    let source = &site.data.source;
    let mut rows = fact("Row", &esc(entry.text()));
    let above = &entry.path[..entry.path.len() - 1];
    let above: Vec<String> = match (group.table, row.1) {
        (Table::A, _) => above.iter().map(|text| esc(text)).collect(),
        (Table::B, Some(_)) => std::iter::once(&group.heading)
            .chain(above)
            .map(|text| esc(text))
            .collect(),
        (Table::B, None) => Vec::new(),
    };
    if !above.is_empty() {
        rows.push_str(&fact("Under", &above.join(" / ")));
    }
    rows.push_str(&fact("Table", &esc(&notes::table_place(group))));
    rows.push_str(&fact("Effective life", &esc(&years(life))));
    rows.push_str(&fact(
        "Prime cost rate",
        &format!("{} (100% ÷ life, section 40-75)", prime_cost(life)),
    ));
    rows.push_str(&fact(
        "Diminishing value rate",
        &format!(
            "{} (200% ÷ life, section 40-72, for an asset you started to hold on or after 10 May 2006)",
            diminishing_value(life)
        ),
    ));
    let updated = entry
        .last_updated
        .as_deref()
        .map_or_else(|| "Not stated".to_owned(), date);
    rows.push_str(&fact("Last reviewed and determined", &esc(&updated)));
    rows.push_str(&notes::marks(&entry.flags));
    format!(
        "        <section id=\"life\">\n        <h2>Effective life and rates</h2>\n        <p>The determination is the {} ({}), registered on {}.</p>\n        <div class=\"table-scroll\" role=\"region\" aria-label=\"Effective life and rates\" tabindex=\"0\">\n        <table class=\"facts facts--kv\">\n          <tbody>\n{rows}          </tbody>\n        </table>\n        </div>\n        </section>\n",
        esc(&source.title),
        esc(&source.register_id),
        date(&source.registered)
    )
}

fn where_cell(group: &Group) -> String {
    match group.table {
        Table::A => group_name(group),
        Table::B => format!("Table B, {}", group_name(group)),
    }
}

/// A table of rows with a life, each linked to its page; this page's own row is not linked.
fn rows_table(
    site: &Site,
    label: &str,
    rows: &[RowRef],
    current: Option<RowRef>,
    place: bool,
) -> String {
    let mut body = String::new();
    for &row in rows {
        let entry = site.entry(row);
        let Some(life) = &entry.life else { continue };
        let name = esc(entry.text());
        let cell = if Some(row) == current {
            format!("{name} (this page)")
        } else {
            format!("<a href=\"{}\">{name}</a>", site.url(row))
        };
        let where_ = if place {
            format!("<td>{}</td>", esc(&where_cell(site.group(row.0))))
        } else {
            String::new()
        };
        body.push_str(&format!(
            "              <tr><th scope=\"row\">{cell}</th>{where_}<td>{}</td><td>{}</td><td>{}</td></tr>\n",
            esc(&years(life)),
            prime_cost(life),
            diminishing_value(life)
        ));
    }
    let head_place = if place {
        "<th scope=\"col\">Industry or table</th>"
    } else {
        ""
    };
    format!(
        "        <div class=\"table-scroll\" role=\"region\" aria-label=\"{label}\" tabindex=\"0\">\n        <table class=\"facts facts--figures\">\n          <thead><tr><th scope=\"col\">Row</th>{head_place}<th scope=\"col\">Life</th><th scope=\"col\">Prime cost</th><th scope=\"col\">Diminishing value</th></tr></thead>\n          <tbody>\n{body}          </tbody>\n        </table>\n        </div>\n",
        label = esc(label)
    )
}

/// The rows with a life under the same heading, up to 6 either side of this one.
fn nearby(site: &Site, row: RowRef) -> String {
    let Some(index) = row.1 else {
        return String::new();
    };
    let group = site.group(row.0);
    let path = &group.entries[index].path;
    let parent = &path[..path.len() - 1];
    let siblings: Vec<usize> = (0..group.entries.len())
        .filter(|&i| {
            let other = &group.entries[i];
            other.life.is_some() && other.path.len() == path.len() && other.path.starts_with(parent)
        })
        .collect();
    if siblings.len() < 2 {
        return String::new();
    }
    let at = siblings.iter().position(|&i| i == index).unwrap_or(0);
    let shown: Vec<RowRef> = siblings[at.saturating_sub(6)..(at + 7).min(siblings.len())]
        .iter()
        .map(|&i| (row.0, Some(i)))
        .collect();
    let under = parent.last().map_or_else(
        || group_name(group),
        |text| text.trim_end_matches(':').to_owned(),
    );
    let heading = format!("Other rows under {under}");
    let more = if shown.len() < siblings.len() {
        format!(
            "        <p>{} rows share this heading. The <a href=\"{}\">{}</a> page lists them all.</p>\n",
            siblings.len(),
            site.plan.group_urls[row.0],
            esc(&group_name(group))
        )
    } else {
        String::new()
    };
    format!(
        "        <section id=\"nearby\">\n        <h2>{}</h2>\n{}{more}        </section>\n",
        esc(&heading),
        rows_table(site, &heading, &shown, Some(row), false)
    )
}

/// The rows in other groups with the same wording, up to 20.
fn elsewhere(site: &Site, row: RowRef) -> String {
    let entry = site.entry(row);
    let Some(rows) = site.same_words.get(&key(entry.text())) else {
        return String::new();
    };
    let others: Vec<RowRef> = rows
        .iter()
        .copied()
        .filter(|other| other.0 != row.0)
        .collect();
    if others.is_empty() {
        return String::new();
    }
    let shown = &others[..others.len().min(20)];
    let note = if others.len() > shown.len() {
        format!(" The first {} of {} are shown.", shown.len(), others.len())
    } else {
        String::new()
    };
    format!(
        "        <section id=\"elsewhere\">\n        <h2>The same wording elsewhere</h2>\n        <p>Rows in another industry or in Table B describe an asset in the same words. The life that applies depends on the industry the asset is used in (section 6 of the determination).{note}</p>\n{}        </section>\n",
        rows_table(site, "The same wording elsewhere", shown, None, true)
    )
}
