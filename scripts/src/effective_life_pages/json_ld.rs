// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Each page's structured data: a WebPage and the BreadcrumbList its visible trail shows.
use super::head::ORIGIN;
use super::{SENTINEL_MODIFIED, SENTINEL_PUBLISHED};
use serde_json::{Value, json};

const LICENSE: &str = "https://duguid.com.au/privacy/#licences";

/// The structured data of a page at `path`, whose trail is `crumbs` (name, path), the
/// last being the page itself.
pub fn page(
    path: &str,
    name: &str,
    description: &str,
    based_on: &str,
    crumbs: &[(&str, &str)],
) -> String {
    let url = format!("{ORIGIN}{path}");
    let items: Vec<Value> = crumbs
        .iter()
        .enumerate()
        .map(|(i, (name, step))| {
            let step = if i + 1 == crumbs.len() { path } else { step };
            json!({"@type": "ListItem", "position": i + 1, "name": name, "item": format!("{ORIGIN}{step}")})
        })
        .collect();
    let graph = json!({
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                "@id": format!("{url}#webpage"),
                "url": url,
                "name": name,
                "description": description,
                "inLanguage": "en-AU",
                "datePublished": SENTINEL_PUBLISHED,
                "dateModified": SENTINEL_MODIFIED,
                "license": LICENSE,
                "isBasedOn": based_on,
                "isPartOf": {"@id": format!("{ORIGIN}/#website")},
                "author": {"@id": format!("{ORIGIN}/about/#person")},
                "publisher": {"@id": format!("{ORIGIN}/about/#person")},
                "breadcrumb": {"@id": format!("{url}#breadcrumb")}
            },
            {
                "@type": "BreadcrumbList",
                "@id": format!("{url}#breadcrumb"),
                "itemListElement": items
            }
        ]
    });
    serde_json::to_string_pretty(&graph).expect("JSON values always serialise")
}
