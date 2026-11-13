// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! Reading one table cell: its text, nesting depth, life and date.
use super::*;
use roxmltree::Node;

pub(super) fn is(node: Node<'_, '_>, name: &str) -> bool {
    node.is_element() && node.tag_name().name() == name
}

pub(super) fn node_text(node: Node<'_, '_>) -> String {
    node.descendants()
        .filter(Node::is_text)
        .filter_map(|n| n.text())
        .collect()
}

/// Text with each run of white space, the source's no-break spaces included, as one
/// space, and its no-break hyphens as ordinary ones, so that a search for `self-propelled`
/// finds the row.
pub(super) fn clean(text: &str) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    words.join(" ").replace('\u{2011}', "-")
}

/// A cell's text, its paragraphs joined by a space.
pub(super) fn cell_text(cell: Node<'_, '_>) -> String {
    let paragraphs: Vec<String> = cell
        .descendants()
        .filter(|n| is(*n, "p"))
        .map(|p| clean(&node_text(p)))
        .filter(|t| !t.is_empty())
        .collect();
    paragraphs.join(" ")
}

/// A length in points from a style attribute, such as `width:14.2pt`, or none when the
/// property is not set. CSS applies the last of repeated declarations and another unit
/// would need a conversion, so both are refused; `owner` names the element in the message.
pub(super) fn style_pt(style: &str, property: &str, owner: &str) -> Result<Option<f64>> {
    let mut values = style
        .split(';')
        .filter_map(|declaration| declaration.split_once(':'))
        .filter(|(name, _)| name.trim() == property)
        .map(|(_, value)| value.trim());
    let Some(value) = values.next() else {
        return Ok(None);
    };
    if values.next().is_some() {
        return Err(format!("{owner} {property} is set more than once: {style}"));
    }
    match value.strip_suffix("pt").map(str::parse) {
        Some(Ok(points)) => Ok(Some(points)),
        _ => Err(format!("{owner} {property} is not in points: {style}")),
    }
}

/// A row's nesting, from the spacers before its description. The source indents with
/// inline blocks of one indent's width each; a hanging indent on the paragraph moves the
/// later lines only, so its margin and first-line indent cancel. Spacers after the first
/// word wrap a long description and are not nesting.
pub(super) fn depth(cell: Node<'_, '_>) -> Result<u8> {
    let Some(paragraph) = cell.children().find(|n| is(*n, "p")) else {
        // Nesting is read from the cell's own paragraph; a wrapped one would read as depth 0.
        return if node_text(cell).trim().is_empty() {
            Ok(0)
        } else {
            Err("the description is not in a paragraph of its own cell".to_owned())
        };
    };
    let style = paragraph.attribute("style").unwrap_or_default();
    let owner = "the description's";
    let mut width = style_pt(style, "margin-left", owner)?.unwrap_or(0.0)
        + style_pt(style, "text-indent", owner)?.unwrap_or(0.0);
    // A bookmark anchor may wrap the paragraph's spans, so read them wherever they sit.
    for node in paragraph.descendants().skip(1) {
        let blank = node_text(node).trim().is_empty();
        if is(node, "span") && blank {
            let style = node.attribute("style").unwrap_or_default();
            if style.contains("inline-block") {
                width += style_pt(style, "width", "a spacer's")?
                    .ok_or_else(|| format!("a spacer's width is not in points: {style}"))?;
            }
        } else if (is(node, "span") || node.is_text()) && !blank {
            break;
        }
    }
    let levels = (width / INDENT_PT).round();
    if !(0.0..=f64::from(MAX_DEPTH)).contains(&levels) || (width - levels * INDENT_PT).abs() > 2.5 {
        return Err(format!(
            "an indent of {width}pt is not a whole nesting level"
        ));
    }
    // The range check above keeps the value within u8.
    Ok(levels as u8)
}

/// The life column: empty, whole years, or whole years and a half or a third. The source
/// prints a fraction as a raised numerator, a slash and a lowered denominator, or as `½`.
pub(super) fn life(cell: Node<'_, '_>) -> Result<Option<Life>> {
    // The parts are read across the cell, so separate paragraphs `1` and `0` would read as 10.
    let paragraphs = cell
        .descendants()
        .filter(|n| is(*n, "p") && !node_text(*n).trim().is_empty())
        .count();
    if paragraphs > 1 {
        return Err("the life is in more than one paragraph".to_owned());
    }
    let (mut whole, mut numerator, mut denominator) = (String::new(), String::new(), String::new());
    for text in cell.descendants().filter(Node::is_text) {
        let style = text
            .ancestors()
            .find(|n| is(*n, "span"))
            .and_then(|span| span.attribute("style"))
            .unwrap_or_default();
        let part = if style.contains("vertical-align:super") {
            &mut numerator
        } else if style.contains("vertical-align:sub") {
            &mut denominator
        } else {
            &mut whole
        };
        part.push_str(text.text().unwrap_or_default());
    }
    let printed = clean(&whole);
    let (numerator, denominator) = (clean(&numerator), clean(&denominator));
    let (years, fraction) = if let Some(years) = printed.strip_suffix('½') {
        (years, Some((1, 2)))
    } else if let Some(years) = printed.strip_suffix('/') {
        match (numerator.as_str(), denominator.as_str()) {
            ("1", "2") => (years, Some((1, 2))),
            ("1", "3") => (years, Some((1, 3))),
            ("2", "3") => (years, Some((2, 3))),
            _ => {
                return Err(format!(
                    "life fraction {numerator}/{denominator} is not known"
                ));
            }
        }
    } else {
        (printed.as_str(), None)
    };
    if fraction.is_none() && !(numerator.is_empty() && denominator.is_empty()) {
        return Err(format!(
            "life {printed} has raised or lowered text and no fraction"
        ));
    }
    let years = years.trim();
    if years.is_empty() && fraction.is_none() {
        return Ok(None);
    }
    let whole_years: u32 = if years.is_empty() {
        0
    } else if years.bytes().all(|b| b.is_ascii_digit()) {
        years
            .parse()
            .map_err(|_| format!("life {years} is too long"))?
    } else {
        return Err(format!("life {printed} is not a number of years"));
    };
    let (text, part_months) = match fraction {
        None => (years.to_owned(), 0),
        Some((n, d)) => {
            let fraction = format!("{n}/{d}");
            let text = if years.is_empty() {
                fraction
            } else {
                format!("{years} {fraction}")
            };
            (text, 12 * n / d)
        }
    };
    let months = whole_years * 12 + part_months;
    if months == 0 {
        return Err("a life of no time".to_owned());
    }
    Ok(Some(Life {
        years: text,
        months,
    }))
}

pub(super) const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// A date such as `1 Jul 2008`, `1 July 2023` or `1Jul 2008` as ISO text.
pub(super) fn iso_date(text: &str) -> Result<String> {
    let bad = || format!("date {text} is not a day, month and year");
    let joined: String = text.split_whitespace().collect();
    let day_end = joined.find(|c: char| !c.is_ascii_digit()).ok_or_else(bad)?;
    let year_start = joined
        .char_indices()
        .rev()
        .find(|(_, c)| !c.is_ascii_digit())
        .map_or(0, |(i, c)| i + c.len_utf8());
    let (day, name, year) = (
        &joined[..day_end],
        joined[day_end..year_start].to_ascii_lowercase(),
        &joined[year_start..],
    );
    let month = MONTHS
        .iter()
        .position(|short| name.len() >= 3 && name.starts_with(short) && month_name(short, &name))
        .ok_or_else(bad)?;
    let (day, year): (u32, i32) = (
        day.parse().map_err(|_| bad())?,
        year.parse().map_err(|_| bad())?,
    );
    if year.to_string().len() != 4 {
        return Err(bad());
    }
    // `month` is an index into twelve names.
    chrono::NaiveDate::from_ymd_opt(year, month as u32 + 1, day)
        .map(|date| date.format("%Y-%m-%d").to_string())
        .ok_or_else(bad)
}

/// Whether `name` is the short month or its full English name.
pub(super) fn month_name(short: &str, name: &str) -> bool {
    const FULL: [&str; 12] = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ];
    name == short
        || FULL
            .iter()
            .any(|full| full.starts_with(short) && name == *full)
}

/// A heading's name and the ANZSIC codes after it in brackets.
pub(super) fn split_heading(text: &str) -> Option<(String, String)> {
    let inner = text.strip_suffix(')')?;
    let open = inner.rfind('(')?;
    let codes = inner[open + 1..].trim();
    let name = inner[..open].trim();
    let has_code = codes
        .split(|c: char| !c.is_ascii_digit())
        .any(|run| run.len() == 5);
    (has_code && !name.is_empty()).then(|| (name.to_owned(), codes.to_owned()))
}

pub(super) fn data_row(cells: &[Node<'_, '_>], texts: &[String]) -> Result<Row> {
    let life = life(cells[1])?;
    let flags = texts[2].replace(' ', "");
    if !matches!(flags.as_str(), "" | "*" | "#" | "*#") {
        return Err(format!("third column {flags} is not * or #"));
    }
    let last_updated = if texts[3].is_empty() {
        None
    } else {
        Some(iso_date(&texts[3])?)
    };
    // A heading row may carry a date of its own; a life never comes without one.
    if life.is_some() && last_updated.is_none() {
        return Err("a life has no date".to_owned());
    }
    if life.is_none() && !flags.is_empty() {
        return Err("a row with no life is flagged".to_owned());
    }
    Ok(Row {
        asset: texts[0].clone(),
        depth: depth(cells[0])?,
        life,
        flags,
        last_updated,
    })
}
