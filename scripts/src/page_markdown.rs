// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The downloadable Markdown edition retains the relationships in the HTML main content.
use htmd::element_handler::{Context, Element, HandlerResult, Handlers};
use htmd::node::Node;
use regex::{Captures, Regex};
use std::sync::LazyLock;
use url::Url;

static CONVERTER: LazyLock<htmd::HtmlToMarkdown> = LazyLock::new(|| {
    htmd::HtmlToMarkdown::builder()
        .scripting_enabled(false)
        .add_handler(vec!["table"], table)
        .build()
});

fn has_block_content(node: &Node<'_>) -> bool {
    node.children().iter().any(|child| {
        matches!(
            child.tag_name(),
            Some(
                "p" | "div"
                    | "br"
                    | "ol"
                    | "ul"
                    | "dl"
                    | "pre"
                    | "blockquote"
                    | "table"
                    | "figure"
                    | "details"
                    | "h1"
                    | "h2"
                    | "h3"
                    | "h4"
                    | "h5"
                    | "h6"
            )
        ) || has_block_content(&child)
    })
}

fn row_values(handlers: &dyn Handlers, row: &Node<'_>) -> Option<Vec<String>> {
    row.children()
        .iter()
        .filter(|cell| matches!(cell.tag_name(), Some("td" | "th")))
        .map(|cell| {
            let spans = ["rowspan", "colspan"]
                .iter()
                .any(|a| cell.attr(a).is_some_and(|v| v.as_ref() != "1"));
            if spans || has_block_content(&cell) {
                return None;
            }
            Some(
                handlers
                    .walk_children_content(&cell, Context::BLOCK)
                    .trim()
                    .replace(['\r', '\n'], " ")
                    .replace('|', "\\|"),
            )
        })
        .collect()
}

/// GFM has one header row and no spanning or multiline cells. Keep complex tables as HTML.
/// For ordinary tables both row headers and data cells carry values that must survive.
fn table(handlers: &dyn Handlers, element: &Element) -> Option<HandlerResult> {
    let mut captions = Vec::new();
    let mut header = Vec::new();
    let mut rows = Vec::new();
    for section in element.node.children().iter() {
        match section.tag_name() {
            Some("caption") => {
                captions.push(handlers.walk_children_content(&section, Context::BLOCK))
            }
            Some("thead" | "tbody" | "tfoot") => {
                let in_header = section.tag_name() == Some("thead");
                for row in section
                    .children()
                    .iter()
                    .filter(|n| n.tag_name() == Some("tr"))
                {
                    match row_values(handlers, &row) {
                        Some(values) if !in_header => rows.push(values),
                        Some(values) if header.is_empty() => header = values,
                        _ => return Some(format!("\n\n{}\n\n", element.node.html()).into()),
                    }
                }
            }
            _ => {}
        }
    }
    format_table(captions, header, rows)
}

fn format_table(
    captions: Vec<String>,
    mut header: Vec<String>,
    rows: Vec<Vec<String>>,
) -> Option<HandlerResult> {
    let width = rows
        .iter()
        .map(Vec::len)
        .max()
        .unwrap_or(0)
        .max(header.len());
    if width == 0 {
        return None;
    }
    if header.is_empty() && width == 2 {
        header = vec!["Field".into(), "Value".into()];
    }
    let line = |mut values: Vec<String>| {
        values.resize(width, String::new());
        format!("| {} |\n", values.join(" | "))
    };
    let mut result = String::from("\n\n");
    for caption in captions {
        result.push_str(caption.trim());
        result.push_str("\n\n");
    }
    result.push_str(&line(header));
    result.push_str(&line(vec!["---".into(); width]));
    for row in rows {
        result.push_str(&line(row));
    }
    result.push('\n');
    Some(result.into())
}

pub fn render(html: &str, url: &str) -> Result<String, String> {
    let visible = crate::llms_full::visible_main(html)?;
    let page = Url::parse(url).map_err(|e| e.to_string())?;
    // Published links, including fragments, lead back to their real HTML targets.
    static TARGET: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"(?is)(<(?:a|img)\b[^<>]*?\s(?:href|src)\s*=\s*)(?:"([^"]*)"|'([^']*)')"#)
            .expect("link or image attribute")
    });
    let resolved = TARGET.replace_all(&visible, |m: &Captures<'_>| {
        let target =
            crate::html::unescape(m.get(2).or(m.get(3)).expect("quoted attribute").as_str());
        page.join(&target).map_or_else(
            |_| m[0].to_owned(),
            |url| format!("{}\"{}\"", &m[1], crate::html::escape(url.as_str(), true)),
        )
    });
    let body = CONVERTER
        .convert(resolved.as_ref())
        .map_err(|e| e.to_string())?;
    let description = crate::seo_core::meta(html, "name", "description").unwrap_or_default();
    let summary = if description.is_empty() {
        String::new()
    } else {
        format!("\n\n> {description}")
    };
    Ok(format!(
        "{}\n\n[Canonical page]({url}){summary}\n",
        body.trim()
    ))
}
