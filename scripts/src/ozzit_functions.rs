//! The Ozzit module reference pages: one page per module, each documenting
//! every named formula with its signature, parameters, notes and worked
//! examples.
//!
//! The text comes from `assets/ozzit-function-reference-v3.5.0.json`, which
//! Ozzit's `ozzit function_reference` command reads out of each definition's
//! own help block in the v3.5.0 release source. Before rendering, every entry
//! must agree with the pinned function index: the same names, modules,
//! previous names, one-line descriptions and signatures.
use crate::check_design::BANNED_VISIBLE_PATTERNS;
use crate::html::escape;
use crate::ozzit_reference::{anchor, load_index};
use crate::pycsv::DictRow;
use crate::pyre::{I, re};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::Path;

type Result<T> = std::result::Result<T, String>;

pub const REFERENCE: &str = "assets/ozzit-function-reference-v3.5.0.json";
const FORMAT: &str = "ozzit-function-reference/1";
const SOURCE: &str = "https://github.com/ryanduguid/Ozzit/blob/v3.5.0";
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
fn checked(root: &Path) -> Result<Vec<Vec<Value>>> {
    let path = root.join(REFERENCE);
    let raw = std::fs::read(&path).map_err(|e| format!("cannot read {REFERENCE}: {e}"))?;
    let document: Value = serde_json::from_slice(&raw).map_err(|e| format!("{REFERENCE}: {e}"))?;
    if document["format"] != FORMAT {
        return Err(format!("{REFERENCE}: format must be {FORMAT}"));
    }
    let rows = load_index(root)?;
    let index: BTreeMap<&str, &DictRow> = rows
        .iter()
        .map(|row| (cell(row, "function"), row))
        .collect();
    let modules = document["modules"].as_array().ok_or("no modules")?;
    if modules.len() != MODULES.len() {
        return Err(format!("{REFERENCE}: expected {} modules", MODULES.len()));
    }
    let mut seen = 0;
    let mut out = Vec::new();
    for (module, entry) in MODULES.iter().zip(modules) {
        if entry["module"] != module.name {
            return Err(format!(
                "{REFERENCE}: modules out of order at {}",
                module.name
            ));
        }
        let functions = entry["functions"].as_array().ok_or("no functions")?;
        for function in functions {
            check_function(function, module, &index)?;
        }
        seen += functions.len();
        out.push(functions.clone());
    }
    if seen != index.len() {
        return Err(format!(
            "{REFERENCE} documents {seen} functions but the index lists {}",
            index.len()
        ));
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
            escape(&label, false),
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
        let rows = section["rows"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|r| text(&r["text"]));
        let items = rows
            .map(|r| format!("<li>{}</li>", code(r)))
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

fn render_entry(function: &Value, module: &Module, parts: &mut Vec<String>) {
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
            "    <p class=\"field-note\">Part of this function’s help text is not reproduced here. <a href=\"{SOURCE}/src/{}.txt\">Read it in the released source<span class=\"visually-hidden\">, {}</span></a>.</p>",
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

fn title(module: &Module) -> String {
    format!("Ozzit {} functions: Excel LAMBDA reference", module.name)
}

fn description(module: &Module, count: usize) -> String {
    format!(
        "Parameters and worked examples for {count} Ozzit {} Excel LAMBDA functions: {}.",
        module.name, module.covers
    )
}

fn head(module: &Module, count: usize) -> String {
    let url = format!("{SITE}{}", page_path(module));
    let title = escape(&title(module), true);
    let description = escape(&description(module, count), true);
    let card = "https://duguid.com.au/assets/social-card-tools-20261016.png";
    let card_alt = "OLED register card: Accounting checks that show their working.";
    format!(
        r##"---
---
<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#000000" />
  <meta name="color-scheme" content="dark" />
  <title>{title}</title>
  <meta name="description" content="{description}" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{description}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Ryan Duguid" />
  <meta property="og:locale" content="en_AU" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{card}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content="{card_alt}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{description}" />
  <meta name="twitter:image" content="{card}" />
  <meta name="twitter:image:alt" content="{card_alt}" />
  <link rel="canonical" href="{url}" />
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png" />
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96.png" />
  <link rel="apple-touch-icon" href="/assets/favicon-180.png" />
  <link rel="alternate" type="text/plain" href="{url}index.txt" />
  <link rel="preload" href="/assets/fonts/Besley-SemiBold.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/assets/fonts/PublicSans-Regular.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/assets/fonts/SplineSansMono-Regular.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/assets/fonts/PublicSans-SemiBold.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/assets/tokens.css?v={{{{ site.asset_version }}}}" />
  <link rel="stylesheet" href="/assets/site.css?v={{{{ site.asset_version }}}}" />
</head>
"##
    )
}

fn intro(module: &Module, count: usize) -> String {
    let source = format!("{SOURCE}/src/{}.txt", module.name);
    format!(
        r##"<body>
  <a class="skip-link" href="#main">Skip to content</a>
{{% include site-header.html %}}
  <main id="main" class="site-main">
    <article class="article">
      <header class="article-header site-shell">
        <nav class="article-crumb" aria-label="Breadcrumb">
          <ol>
            <li><a href="/">Home</a></li>
            <li><a href="/tools/">Tools</a></li>
            <li><a href="/tools/ozzit/">Ozzit Excel LAMBDA library</a></li>
            <li aria-current="page">Ozzit {name} functions</li>
          </ol>
        </nav>
        <div class="article-intro">
          <h1>Ozzit {name} functions</h1>
          <p class="lead-note">The {count} {name} formulas cover {covers}. Each entry gives the signature, parameters and worked example from the workbook’s own help.</p>
          <p class="release-meta">Release v3.5.0. Read from the released <a href="{source}">{name} formula source</a>, which the workbook compiles.</p>
          <p class="page-meta">Published {published}. Last reviewed {published}.</p>
        </div>
      </header>
      <div class="article-layout site-shell">
        <nav class="article-toc" aria-label="On this page">
          <p>On this page</p>
          <a href="#use">Using these functions</a>
          <a href="#functions">All {count} functions</a>
          <a href="#modules">Other modules</a>
        </nav>
        <div class="article-body">

          <section id="use">
            <h2>Using these functions</h2>
            <p>Each function is a native Excel <code>LAMBDA</code> in the free Ozzit workbook. It needs Microsoft 365 or Excel 2024 or later. Enter a call in a cell of the workbook, or copy the definition from its name manager into your own model. Leave room for any spilled result.</p>
            <p>The text below is the help each function carries in the v3.5.0 workbook. The workbook remains the authority, and a calculation does not decide an accounting treatment. <a href="/tools/ozzit/#download">Download the workbook and check its hash</a>.</p>
          </section>

          <section id="functions">
            <h2>All {count} functions</h2>
"##,
        name = module.name,
        covers = module.covers,
        published = PUBLISHED.1,
    )
}

fn outro(module: &Module, count: usize) -> String {
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
    let url = format!("{SITE}{}", page_path(module));
    let title = title(module);
    let description = description(module, count);
    let date = PUBLISHED.0;
    format!(
        r##"          </section>

          <section id="modules">
            <h2>Other modules</h2>
            <ul class="related">
{others}              <li><a href="/tools/ozzit/">Ozzit overview, download and release verification</a></li>
            </ul>
          </section>

          <p class="byline">
            Written by Ryan Duguid in his own time and on his own equipment.
            He is a Provisional CA ANZ Member.
          </p>
        </div>
      </div>
    </article>
  </main>
{{% include site-footer.html %}}
  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@graph": [
      {{
        "@type": "TechArticle",
        "@id": "{url}#article",
        "url": "{url}",
        "headline": "{title}",
        "name": "{title}",
        "description": "{description}",
        "inLanguage": "en-AU",
        "datePublished": "{date}",
        "dateModified": "{date}",
        "license": "https://github.com/ryanduguid/ryanduguid.github.io/blob/main/LICENSE",
        "isPartOf": {{ "@id": "https://duguid.com.au/#website" }},
        "author": {{ "@id": "https://duguid.com.au/about/#person" }},
        "publisher": {{ "@id": "https://duguid.com.au/about/#person" }},
        "about": {{ "@id": "https://duguid.com.au/tools/ozzit/#software" }}
      }},
      {{
        "@type": "WebPage",
        "@id": "{url}#webpage",
        "url": "{url}",
        "name": "{title}",
        "description": "{description}",
        "inLanguage": "en-AU",
        "datePublished": "{date}",
        "dateModified": "{date}",
        "license": "https://github.com/ryanduguid/ryanduguid.github.io/blob/main/LICENSE",
        "isPartOf": {{ "@id": "https://duguid.com.au/#website" }},
        "author": {{ "@id": "https://duguid.com.au/about/#person" }},
        "publisher": {{ "@id": "https://duguid.com.au/about/#person" }},
        "breadcrumb": {{ "@id": "{url}#breadcrumb" }}
      }},
      {{
        "@type": "BreadcrumbList",
        "@id": "{url}#breadcrumb",
        "itemListElement": [
          {{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://duguid.com.au/" }},
          {{ "@type": "ListItem", "position": 2, "name": "Tools", "item": "https://duguid.com.au/tools/" }},
          {{ "@type": "ListItem", "position": 3, "name": "Ozzit Excel LAMBDA library", "item": "https://duguid.com.au/tools/ozzit/" }},
          {{ "@type": "ListItem", "position": 4, "name": "Ozzit {name} functions", "item": "{url}" }}
        ]
      }}
    ]
  }}
  </script>
  <script type="module" src="/assets/copy-commands.mjs"></script>
</body>
</html>
"##,
        name = module.name,
    )
}

/// Every module page as `(relative path, contents)`.
pub fn render_pages(root: &Path) -> Result<Vec<(String, String)>> {
    let mut pages = Vec::new();
    for (module, functions) in MODULES.iter().zip(checked(root)?) {
        let count = functions.len();
        let mut parts = vec![head(module, count), intro(module, count)];
        let mut entries = vec![
            "<!-- Generated by site-tools build_ozzit_reference from the function reference. -->"
                .to_owned(),
        ];
        // Safari drops list semantics from an unstyled list unless the role is explicit.
        entries.push("<ul class=\"function-index__list\" role=\"list\">".into());
        for function in &functions {
            let name = text(&function["name"]).unwrap_or("");
            entries.push(format!(
                "  <li><a href=\"#{}\"><code>{}</code></a></li>",
                anchor(name),
                code(name)
            ));
        }
        entries.push("</ul>".into());
        for function in &functions {
            render_entry(function, module, &mut entries);
        }
        parts.push(entries.join("\n") + "\n");
        parts.push(outro(module, count));
        pages.push((page_rel(module), parts.concat()));
    }
    Ok(pages)
}
