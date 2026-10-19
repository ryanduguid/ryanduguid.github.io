//! Differential aid: reads a JSON array of cases on stdin and writes, for each, what the
//! seo_core functions return, as JSON lines; seo_probe.py computes the same with Python.
use site_tools::pyjson::Json;
use site_tools::seo_core as core;
use std::io::Read;

/// Values compare as Python's repr, which also covers NaN and big integers.
fn json(value: &Json) -> serde_json::Value {
    serde_json::Value::String(value.repr())
}

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();
    let cases: Vec<serde_json::Value> = serde_json::from_str(&input).unwrap();
    for case in cases {
        let text = |key: &str| case[key].as_str().unwrap_or("").to_owned();
        let html = text("html");
        let tree = core::parse_structure(&html);
        let elements: Vec<_> = tree
            .descendants(core::Tree::ROOT, None, false)
            .into_iter()
            .map(|e| {
                serde_json::json!([
                    tree.tag(e),
                    tree.elements[e].attrs,
                    tree.text(e),
                    tree.is_rendered(e),
                    tree.has_class(e, "faq"),
                ])
            })
            .collect();
        let mut failures = Vec::new();
        let blocks = core::json_ld_blocks(&html, "page.html", &mut failures);
        let mut types = Vec::new();
        for block in &blocks {
            core::check_item_lists(block, "page.html", &mut failures);
            for node in core::nodes(block) {
                types.push(serde_json::json!([
                    core::has_type(node, "ItemList"),
                    core::has_type(node, "FAQPage"),
                    json(node)
                ]));
                if core::has_type(node, "FAQPage") {
                    core::check_faq_visible(node, &html, "page.html", &mut failures);
                }
            }
        }
        core::check_referrer_policy(&html, "page.html", &mut failures);
        core::check_social_metadata(
            &html,
            "page.html",
            core::meta(&html, "name", "description").as_deref(),
            Some("https://example.test/"),
            "https://example.test/card.png",
            "Card",
            &mut failures,
        );
        let mut headings: Vec<_> = core::heading_texts(&html).into_iter().collect();
        headings.sort();
        let result = serde_json::json!({
            "visible_html": core::visible_html(&html),
            "visible_text": core::visible_text(&html),
            "raw_text": core::raw_text(&html),
            "elements": elements,
            "rendered_meta": tree.descendants(core::Tree::ROOT, Some("meta"), true).len(),
            "by_id": tree.by_id(&text("id")).len(),
            "blocks": blocks.iter().map(json).collect::<Vec<_>>(),
            "types": types,
            "failures": failures,
            "section": core::section_html(&html, &text("id")),
            "anchors": core::anchor_hrefs(&html),
            "headings": headings,
            "faq": core::visible_faq_pairs(&html),
            "meta": core::meta(&html, "name", "description"),
            "meta_values": core::meta_values(&html, "property", "og:title"),
            "markdown": core::markdown_section(&text("markdown"), &text("heading")),
            "robots": core::robots_groups(&text("robots")),
            "site_url": core::site_url(&text("rel"), "https://example.test"),
        });
        println!("{result}");
    }
}
