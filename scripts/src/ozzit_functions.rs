//! The Ozzit module reference pages: one page per module, each documenting
//! every named formula with its signature, parameters, notes and worked
//! examples.
//!
//! The text comes from `assets/ozzit-function-reference-<tag>.json` for the
//! release `scripts/release_record.json` documents, which Ozzit's
//! `ozzit function_reference` command reads out of each definition's own help
//! block in that release's source. Before rendering, every entry
//! must agree with the pinned function index: the same names, modules,
//! previous names, one-line descriptions and signatures.
use crate::check_design::BANNED_VISIBLE_PATTERNS;
use crate::html::escape;
use crate::ozzit_reference::{anchor, documented_release, load_index};
use crate::pycsv::DictRow;
use crate::pyre::{I, re};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

type Result<T> = std::result::Result<T, String>;

const FORMAT: &str = "ozzit-function-reference/1";
const PUBLISHED: (&str, &str) = ("2026-10-20", "20 October 2026");
const SITE: &str = "https://duguid.com.au";

pub struct Module {
    pub name: &'static str,
    pub slug: &'static str,
    pub covers: &'static str,
}

/// The modules in the order the release builds them.
pub const MODULES: [Module; 6] = [
    Module {
        name: "Dates",
        slug: "dates",
        covers: "periods, timelines, schedules, overlaps and Australian financial year labels",
    },
    Module {
        name: "Essentials",
        slug: "essentials",
        covers: "row and column totals, averages, counts and range conversion for dynamic arrays",
    },
    Module {
        name: "Financial",
        slug: "financial",
        covers: "amortisation, depreciation, corkscrews, IRR, rolling sums, GST and AASB 16 leases",
    },
    Module {
        name: "Ratios",
        slug: "ratios",
        covers: "liquidity, gearing, margin, return, market and working capital ratios",
    },
    Module {
        name: "Utilities",
        slug: "utilities",
        covers: "standalone copies of the Essentials functions, each with a U suffix",
    },
    Module {
        name: "Debt",
        slug: "debt",
        covers: "debt amortisation and fixed or variable DSCR debt sculpting",
    },
];

pub fn page_rel(module: &Module) -> String {
    format!("tools/ozzit/functions/{}/index.html", module.slug)
}

pub fn page_path(module: &Module) -> String {
    format!("/tools/ozzit/functions/{}/", module.slug)
}

/// The module page that documents a named formula, for links from the index.
pub fn module_for(module_name: &str) -> Option<&'static Module> {
    MODULES.iter().find(|m| m.name == module_name)
}

/// A `csv.DictReader` cell, or "" when it is missing.
fn cell<'a>(row: &'a DictRow, key: &str) -> &'a str {
    row.iter()
        .rev()
        .find(|(k, _)| k == key)
        .and_then(|(_, v)| v.as_deref())
        .unwrap_or("")
}

fn text(value: &Value) -> Option<&str> {
    value.as_str().filter(|s| !s.is_empty())
}

fn squash(value: &str) -> String {
    value.split_whitespace().collect()
}

/// Escaped visible text with each λ in the span that supplies its font.
fn code(value: &str) -> String {
    escape(value, false).replace('λ', "<span class=\"function-symbol\">λ</span>")
}

/// Help text with its lists restored. The reference keeps each list row on its
/// own line: a `•` line, or any line after one ending in `:`, is an item; a
/// line ending in `:` introduces the next items; other lines run together.
fn rich(value: &str) -> String {
    let mut out = String::new();
    let mut in_list = false;
    let mut listing = false;
    for line in value.lines() {
        let bullet = line.strip_prefix('•').map(str::trim);
        let item = bullet.or_else(|| (listing && !line.ends_with(':')).then_some(line));
        listing |= line.ends_with(':');
        if let Some(item) = item {
            if !in_list {
                out.push_str("<ul>");
                in_list = true;
            }
            out.push_str(&format!("<li>{}</li>", code(item)));
        } else {
            if in_list {
                out.push_str("</ul>");
                in_list = false;
            } else if !out.is_empty() {
                out.push(' ');
            }
            out.push_str(&code(line));
        }
    }
    if in_list {
        out.push_str("</ul>");
    }
    out
}

fn banned(sentence: &str) -> bool {
    BANNED_VISIBLE_PATTERNS
        .iter()
        .any(|(_, pattern)| re(pattern, I).is_match(sentence))
}

/// The text without any sentence that uses vocabulary the site's copy check
/// refuses, and whether a sentence was left out.
fn publishable(value: &str) -> (String, bool) {
    let sentences = value.split_inclusive(". ").collect::<Vec<_>>();
    let kept = sentences
        .iter()
        .filter(|s| !banned(s))
        .copied()
        .collect::<String>();
    let kept = kept.trim().to_owned();
    (kept, sentences.iter().any(|s| banned(s)))
}

/// Check the reference against the pinned index and return its functions by module.
fn checked(root: &Path, tag: &str) -> Result<Vec<Vec<Value>>> {
    let reference = format!("assets/ozzit-function-reference-{tag}.json");
    let path = root.join(&reference);
    let raw = std::fs::read(&path).map_err(|e| format!("cannot read {reference}: {e}"))?;
    let document: Value = serde_json::from_slice(&raw).map_err(|e| format!("{reference}: {e}"))?;
    if document["format"] != FORMAT {
        return Err(format!("{reference}: format must be {FORMAT}"));
    }
    let rows = load_index(root)?;
    let mut index: BTreeMap<&str, &DictRow> = BTreeMap::new();
    for row in &rows {
        if index.insert(cell(row, "function"), row).is_some() {
            return Err(format!(
                "{} is listed more than once in the index",
                cell(row, "function")
            ));
        }
    }
    let modules = document["modules"].as_array().ok_or("no modules")?;
    if modules.len() != MODULES.len() {
        return Err(format!("{reference}: expected {} modules", MODULES.len()));
    }
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for (module, entry) in MODULES.iter().zip(modules) {
        if entry["module"] != module.name {
            return Err(format!(
                "{reference}: modules out of order at {}",
                module.name
            ));
        }
        let functions = entry["functions"].as_array().ok_or("no functions")?;
        for function in functions {
            check_function(function, module, &index)?;
            let name = text(&function["name"]).unwrap_or("");
            if !seen.insert(name) {
                return Err(format!("{reference} documents {name} more than once"));
            }
        }
        out.push(functions.clone());
    }
    if let Some(missing) = index.keys().find(|name| !seen.contains(*name)) {
        return Err(format!("{reference} does not document {missing}"));
    }
    Ok(out)
}

fn check_function(
    function: &Value,
    module: &Module,
    index: &BTreeMap<&str, &DictRow>,
) -> Result<()> {
    let name = text(&function["name"]).ok_or("a function without a name")?;
    let row = index
        .get(name)
        .ok_or_else(|| format!("{name} is not in the pinned index"))?;
    let field = |key: &str| cell(row, key);
    let agrees = field("module") == module.name
        && field("previous_name") == text(&function["previous_name"]).unwrap_or("")
        && field("description") == text(&function["summary"]).unwrap_or("")
        && squash(field("signature")) == squash(text(&function["signature"]).unwrap_or(""));
    if agrees {
        Ok(())
    } else {
        Err(format!(
            "{name}: the reference and the pinned index disagree"
        ))
    }
}

fn entry_text(function: &Value, parts: &mut Vec<String>, omitted: &mut bool) {
    let mut paragraph = |value: &str, class: &str| {
        let (kept, dropped) = publishable(value);
        *omitted |= dropped;
        if !kept.is_empty() {
            parts.push(format!(
                "    <p{class}>{}</p>",
                code(&kept.replace(char::from(10), " "))
            ));
        }
    };
    let summary = text(&function["summary"]).unwrap_or("");
    paragraph(summary, "");
    if let Some(description) = text(&function["description"]).filter(|d| *d != summary) {
        paragraph(description, "");
    }
    for note in function["notes"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(text)
    {
        paragraph(&format!("Note: {note}"), " class=\"field-note\"");
    }
    if let Some(see) = text(&function["see_also"]) {
        paragraph(&format!("See also: {see}"), " class=\"field-note\"");
    }
}

fn entry_parameters(function: &Value, name: &str, parts: &mut Vec<String>) {
    let parameters = function["parameters"]
        .as_array()
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    if parameters.is_empty() {
        return;
    }
    parts.push("    <p>Parameters:</p>".into());
    parts.push(format!(
        "    <dl aria-label=\"Parameters of {}\">",
        escape(name, true)
    ));
    for parameter in parameters {
        let label = match (
            text(&parameter["requirement"]),
            text(&parameter["qualifier"]),
        ) {
            (Some(r), Some(q)) => format!(" ({}, {})", r.to_lowercase(), q),
            (Some(r), None) => format!(" ({})", r.to_lowercase()),
            _ => String::new(),
        };
        parts.push(format!(
            "      <div><dt><code>{}</code>{}</dt><dd>{}</dd></div>",
            code(text(&parameter["name"]).unwrap_or("")),
            code(&label),
            rich(text(&parameter["text"]).unwrap_or(""))
        ));
    }
    parts.push("    </dl>".into());
}

fn entry_extra(function: &Value, parts: &mut Vec<String>) {
    for section in function["extra"].as_array().into_iter().flatten() {
        let heading = text(&section["heading"]).unwrap_or("").to_lowercase();
        let heading = heading.replace(" ids", " IDs");
        let mut first = heading.chars();
        let heading = first
            .next()
            .map(|c| c.to_uppercase().collect::<String>() + first.as_str())
            .unwrap_or_default();
        let items = section["rows"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|r| match (text(&r["label"]), text(&r["text"])) {
                (Some(label), Some(t)) => Some(format!("<li>{}: {}</li>", code(label), code(t))),
                (Some(only), None) | (None, Some(only)) => Some(format!("<li>{}</li>", code(only))),
                (None, None) => None,
            })
            .collect::<String>();
        if !items.is_empty() {
            parts.push(format!("    <p>{}:</p>", escape(&heading, false)));
            parts.push(format!("    <ul>{items}</ul>"));
        }
    }
}

fn entry_examples(function: &Value, name: &str, parts: &mut Vec<String>) {
    let examples = function["examples"]
        .as_array()
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    for (number, example) in examples.iter().enumerate() {
        let label = if examples.len() == 1 {
            format!("Example: {name}")
        } else {
            format!("Example {}: {name}", number + 1)
        };
        parts.push(format!(
            "    <pre class=\"copyable\" tabindex=\"0\" role=\"region\" aria-label=\"{}\"><code>{}</code></pre>",
            escape(&label, true),
            code(text(&example["formula"]).unwrap_or(""))
        ));
        if let Some(result) = text(&example["result"]) {
            parts.push(format!(
                "    <p>The workbook help shows <code>{}</code>.</p>",
                code(&result.replace('\n', "; "))
            ));
        }
    }
}

fn render_entry(function: &Value, module: &Module, source: &str, parts: &mut Vec<String>) {
    let name = text(&function["name"]).unwrap_or("");
    let id = anchor(name);
    let signature = text(&function["signature"]).unwrap_or("");
    parts.push(format!(
        "  <section id=\"{id}\" aria-labelledby=\"{id}-name\">"
    ));
    parts.push(format!(
        "    <h3 id=\"{id}-name\"><code>{}</code></h3>",
        code(name)
    ));
    // A help table takes no arguments, so its signature would repeat its name.
    if signature.contains('(') {
        parts.push(format!(
            "    <p><code>{}</code></p>",
            code(&format!("oz.{signature}"))
        ));
    }
    let mut omitted = false;
    entry_text(function, parts, &mut omitted);
    entry_parameters(function, name, parts);
    entry_extra(function, parts);
    entry_examples(function, name, parts);
    if omitted {
        parts.push(format!(
            "    <p class=\"field-note\">Part of this function’s help text is not reproduced here. <a href=\"{source}/src/{}.txt\">Read it in the released source<span class=\"visually-hidden\">, {}</span></a>.</p>",
            module.name,
            code(name)
        ));
    }
    if let Some(previous) = text(&function["previous_name"]) {
        parts.push(format!(
            "    <p class=\"field-note\">Previous name: <code>{}</code>.</p>",
            code(previous)
        ));
    }
    parts.push("  </section>".into());
}

/// The page around the entries, with `@@NAME@@` markers for the module's values.
const PAGE: &str = include_str!("ozzit_module_page.tmpl");

fn title(module: &Module) -> String {
    format!("Ozzit {} functions: Excel LAMBDA reference", module.name)
}

fn description(module: &Module, count: usize) -> String {
    format!(
        "Parameters and worked examples for {count} Ozzit {} Excel LAMBDA functions: {}.",
        module.name, module.covers
    )
}

/// The jump list and every entry, in the reference's order.
fn entries(module: &Module, functions: &[Value], source: &str) -> String {
    let mut parts = vec![
        "<!-- Generated by site-tools build_ozzit_reference from the function reference. -->"
            .to_owned(),
        // Safari drops list semantics from an unstyled list unless the role is explicit.
        "<ul class=\"function-index__list\" role=\"list\">".to_owned(),
    ];
    for function in functions {
        let name = text(&function["name"]).unwrap_or("");
        parts.push(format!(
            "  <li><a href=\"#{}\"><code>{}</code></a></li>",
            anchor(name),
            code(name)
        ));
    }
    parts.push("</ul>".into());
    for function in functions {
        render_entry(function, module, source, &mut parts);
    }
    parts.join("\n") + "\n"
}

/// Every module page as `(relative path, contents)`. Module values are fixed
/// text without markup characters, so the same escaped value serves the
/// metadata, the page and the JSON-LD.
pub fn render_pages(root: &Path) -> Result<Vec<(String, String)>> {
    let mut pages = Vec::new();
    let (tag, _) = documented_release(root)?;
    let source = format!("https://github.com/ryanduguid/Ozzit/blob/{tag}");
    for (module, functions) in MODULES.iter().zip(checked(root, &tag)?) {
        let count = functions.len();
        let others = MODULES
            .iter()
            .filter(|m| m.name != module.name)
            .map(|m| {
                format!(
                    "              <li><a href=\"{}\">Ozzit {} functions</a></li>\n",
                    page_path(m),
                    m.name
                )
            })
            .collect::<String>();
        let values = [
            ("@@TITLE@@", escape(&title(module), true)),
            ("@@DESCRIPTION@@", escape(&description(module, count), true)),
            ("@@URL@@", format!("{SITE}{}", page_path(module))),
            ("@@SOURCE@@", format!("{source}/src/{}.txt", module.name)),
            ("@@TAG@@", tag.clone()),
            ("@@COVERS@@", escape(module.covers, true)),
            ("@@PUBLISHED@@", PUBLISHED.1.to_owned()),
            ("@@DATE@@", PUBLISHED.0.to_owned()),
            ("@@COUNT@@", count.to_string()),
            ("@@NAME@@", module.name.to_owned()),
            ("@@OTHERS@@", others),
            ("@@ENTRIES@@", entries(module, &functions, &source)),
        ];
        let page = values
            .iter()
            .fold(PAGE.to_owned(), |page, (marker, value)| {
                page.replace(marker, value)
            });
        pages.push((page_rel(module), page));
    }
    Ok(pages)
}
