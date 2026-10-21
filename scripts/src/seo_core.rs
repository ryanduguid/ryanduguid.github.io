//! scripts/seo_core.py: reusable HTML, metadata, structured-data and sitemap checks.
//!
//! Site policy belongs in site_contracts. Messages, `repr` renderings and
//! orderings follow the Python module at base c8a8239.
use crate::html::unescape;
use crate::htmlparser::{self, Event};
use crate::py;
use crate::pyjson::{self, Json};
use crate::pyre::{self, I, M, S, re};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub const GENERATED_HTML_DIRECTORIES: [&str; 6] = [
    "node_modules",
    "work",
    "_site",
    "_includes",
    "_layouts",
    "vendor",
];
pub const TITLE_MAX: usize = 65;
pub const DESC_MIN: usize = 50;
pub const DESC_MAX: usize = 200;
pub const DESC_WARN: usize = 165;
pub const REFERRER_POLICY: &str = "strict-origin-when-cross-origin";
pub const SITE_NAME: &str = "Ryan Duguid";
pub const OG_LOCALE: &str = "en_AU";
pub const OPEN_GRAPH_FIELDS: [&str; 11] = [
    "og:title",
    "og:description",
    "og:type",
    "og:site_name",
    "og:locale",
    "og:url",
    "og:image",
    "og:image:type",
    "og:image:alt",
    "og:image:width",
    "og:image:height",
];
pub const TWITTER_FIELDS: [&str; 5] = [
    "twitter:card",
    "twitter:title",
    "twitter:description",
    "twitter:image",
    "twitter:image:alt",
];
pub const VOID_ELEMENTS: [&str; 14] = [
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
    "track", "wbr",
];
pub const NON_RENDERED_ELEMENTS: [&str; 3] = ["script", "style", "template"];

/// `repr` of a list of strings.
pub fn repr_list(items: &[String]) -> String {
    let parts: Vec<_> = items.iter().map(|s| py::repr_str(s)).collect();
    format!("[{}]", parts.join(", "))
}

/// A path relative to the site root, with forward slashes (`relative_to(root).as_posix()`).
pub fn rel(path: &Path, root: &Path) -> String {
    let relative = path.strip_prefix(root).unwrap_or(path);
    relative
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn site_url(rel: &str, site: &str) -> String {
    if rel == "index.html" {
        format!("{site}/")
    } else if let Some(directory) = rel.strip_suffix("index.html").filter(|d| d.ends_with('/')) {
        format!("{site}/{directory}")
    } else {
        format!("{site}/{rel}")
    }
}

/// The optional context `check_file_metadata` takes as keyword arguments.
#[derive(Default)]
pub struct MetadataContext<'a> {
    pub expected_social_image: Option<&'a str>,
    pub expected_social_alt: Option<&'a str>,
    pub description_limits: Option<(usize, usize)>,
}

/// Check generic metadata and structured-data contracts for one HTML file.
pub fn check_file_metadata(
    path: &Path,
    site: &str,
    not_indexed: &HashSet<String>,
    warnings: &mut Vec<String>,
    context: &MetadataContext<'_>,
    root: &Path,
) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let rel = rel(path, root);
    let html = crate::read(path)?;
    let indexed = !not_indexed.contains(&rel);

    if !re(r#"<html lang="[a-zA-Z-]+""#, 0).is_match(&html) {
        failures.push(format!("{rel}: no lang attribute on <html>"));
    }

    let titles = re(r"<title>(.*?)</title>", S).findall(&html);
    if titles.len() != 1 || py::strip(&titles[0]).is_empty() {
        failures.push(format!(
            "{rel}: expected exactly one non-empty <title>, found {}",
            titles.len()
        ));
    } else {
        let rendered = py::char_len(&unescape(py::strip(&titles[0])));
        if rendered > TITLE_MAX {
            failures.push(format!(
                "{rel}: title is {rendered} characters, over the {TITLE_MAX} limit"
            ));
        }
    }

    let desc = meta(&html, "name", "description");
    match &desc {
        None => failures.push(format!("{rel}: no meta description")),
        Some(d) => {
            let length = py::char_len(d);
            if !(DESC_MIN..=DESC_MAX).contains(&length) {
                failures.push(format!(
                    "{rel}: meta description is {length} characters, outside {DESC_MIN} to {DESC_MAX}"
                ));
            } else if length > DESC_WARN {
                warnings.push(format!(
                    "{rel}: meta description is {length} characters, likely truncated in results"
                ));
            }
        }
    }
    if let (Some(d), Some((minimum, maximum))) = (&desc, context.description_limits) {
        let length = py::char_len(d);
        if !(minimum..=maximum).contains(&length) {
            failures.push(format!(
                "{rel}: meta description is {length} characters, outside required {minimum} to {maximum}"
            ));
        }
    }

    let h1s = re(r"<h1[^>]*>", 0).findall(&html);
    if h1s.len() != 1 {
        failures.push(format!(
            "{rel}: expected exactly one <h1>, found {}",
            h1s.len()
        ));
    }

    let canonical = re(r#"<link rel="canonical" href="(.*?)""#, 0)
        .search(&html)
        .map(|m| m[1].to_owned());
    if re(r#"<link\s+rel="stylesheet"(?:\s|/?>)"#, 0).is_match(&html) {
        check_referrer_policy(&html, &rel, &mut failures);
    }
    if !indexed {
        return Ok(failures);
    }

    let tree = parse_structure(&html);
    for element in tree.descendants(Tree::ROOT, Some("meta"), true) {
        let name = py::casefold(tree.attr(element, "name").unwrap_or(""));
        if !["robots", "googlebot", "googlebot-news", "bingbot"].contains(&name.as_str()) {
            continue;
        }
        let content = tree.attr(element, "content").unwrap_or("");
        if content
            .split(',')
            .map(|d| py::casefold(py::strip(d)))
            .any(|d| d == "noindex" || d == "none")
        {
            failures.push(format!(
                "{rel}: indexable page must not declare noindex or none in robots metadata"
            ));
        }
    }

    let expected = site_url(&rel, site);
    match &canonical {
        None => failures.push(format!("{rel}: no canonical link")),
        Some(c) if *c != expected => {
            failures.push(format!("{rel}: canonical is {c}, expected {expected}"));
        }
        Some(_) => {}
    }

    match (context.expected_social_image, context.expected_social_alt) {
        (Some(image), Some(alt)) => check_social_metadata(
            &html,
            &rel,
            desc.as_deref(),
            canonical.as_deref(),
            image,
            alt,
            &mut failures,
        ),
        _ => failures.push(format!("{rel}: no configured social-card context")),
    }

    let blocks = json_ld_blocks(&html, &rel, &mut failures);
    if blocks.is_empty() {
        failures.push(format!("{rel}: no JSON-LD structured data"));
    }
    let schema = Json::str_obj("https://schema.org");
    for block in &blocks {
        let contexts: Vec<Json> = match block {
            Json::Object(_) => vec![block.get("@context").cloned().unwrap_or(Json::Null)],
            Json::Array(items) => items
                .iter()
                .filter(|item| matches!(item, Json::Object(_)))
                .map(|item| item.get("@context").cloned().unwrap_or(Json::Null))
                .collect(),
            _ => vec![],
        };
        if contexts.is_empty() || contexts.iter().any(|c| !c.py_eq(&schema)) {
            failures.push(format!("{rel}: JSON-LD @context is not https://schema.org"));
        }
        check_item_lists(block, &rel, &mut failures);
        for node in nodes(block) {
            if node
                .get("@type")
                .is_some_and(|t| t.py_eq(&Json::str_obj("FAQPage")))
            {
                check_faq_visible(node, &html, &rel, &mut failures);
            }
        }
    }
    Ok(failures)
}

/// Check the sitemap, llms.txt coverage and robots sitemap declaration.
pub fn check_sitemap(
    paths: &[PathBuf],
    site: &str,
    not_indexed: &HashSet<String>,
    root: &Path,
) -> Result<(Vec<String>, usize), String> {
    let mut failures = Vec::new();
    let listed = sitemap_urls(root)?;
    let expected_html: HashSet<String> = paths
        .iter()
        .map(|p| rel(p, root))
        .filter(|r| !not_indexed.contains(r))
        .map(|r| site_url(&r, site))
        .collect();
    let mut expected_llms = expected_html.clone();
    expected_llms.insert(format!("{site}/llms.txt"));
    let listed_set: HashSet<&String> = listed.iter().collect();

    let mut missing: Vec<_> = expected_html
        .iter()
        .filter(|u| !listed_set.contains(u))
        .collect();
    missing.sort();
    for url in missing {
        failures.push(format!("sitemap.xml: does not list {url}"));
    }
    let mut extra: Vec<_> = listed_set
        .iter()
        .filter(|u| !expected_html.contains(**u))
        .collect();
    extra.sort();
    for url in extra {
        failures.push(format!(
            "sitemap.xml: lists {url}, which is not an indexable page"
        ));
    }
    if listed.len() != listed_set.len() {
        failures.push("sitemap.xml: duplicate <loc> entries".into());
    }

    for path in paths {
        let rel = rel(path, root);
        if not_indexed.contains(&rel) {
            continue;
        }
        let url = site_url(&rel, site);
        let html = crate::read(path)?;
        if html.starts_with("---") && !html.contains("application/ld+json") {
            continue;
        }
        let mut modified: Vec<String> = Vec::new();
        let blocks = json_ld_blocks(&html, &rel, &mut Vec::new());
        let entries: Vec<_> = blocks.iter().flat_map(nodes).collect();
        let document_types = ["WebPage", "TechArticle", "ProfilePage"];
        let has_document = entries
            .iter()
            .any(|node| document_types.iter().any(|kind| has_type(node, kind)));
        for node in entries {
            if has_document && !document_types.iter().any(|kind| has_type(node, kind)) {
                continue;
            }
            // Software dates describe releases; the sitemap describes the website document.
            if has_type(node, "SoftwareApplication") || has_type(node, "SoftwareSourceCode") {
                continue;
            }
            if let Some(value) = node.get("dateModified") {
                let value = value.py_str();
                if !modified.contains(&value) {
                    modified.push(value);
                }
            }
        }
        modified.sort();
        let lastmods = sitemap_lastmods(&url, root)?;
        if modified.len() != 1 || lastmods != modified {
            failures.push(format!(
                "sitemap.xml: {url} lastmod {} does not match its dateModified {}",
                repr_list(&lastmods),
                repr_list(&modified)
            ));
        }
    }

    let llms = crate::read(&root.join("llms.txt"))?;
    let mut expected_llms: Vec<_> = expected_llms.into_iter().collect();
    expected_llms.sort();
    for url in expected_llms {
        if !llms.contains(&url) {
            failures.push(format!("llms.txt: does not link {url}"));
        }
    }
    let robots = crate::read(&root.join("robots.txt"))?;
    if !robots.contains(&format!("Sitemap: {site}/sitemap.xml")) {
        failures.push("robots.txt: no Sitemap line".into());
    }
    Ok((failures, listed.len()))
}

fn meta_pattern(attr: &str, value: &str) -> String {
    format!(
        r#"<meta {attr}="{}" content="(.*?)"\s*/?>"#,
        pyre::escape(value)
    )
}

pub fn meta(html: &str, attr: &str, value: &str) -> Option<String> {
    re(&meta_pattern(attr, value), S)
        .search(html)
        .map(|m| py::strip(&unescape(&m[1])).to_owned())
}

/// Every matching meta value in source order, including blanks.
pub fn meta_values(html: &str, attr: &str, value: &str) -> Vec<String> {
    re(&meta_pattern(attr, value), S)
        .findall(html)
        .iter()
        .map(|m| py::strip(&unescape(m)).to_owned())
        .collect()
}

/// Require one non-empty value for each named metadata field.
pub fn required_meta_fields(
    html: &str,
    rel: &str,
    attr: &str,
    fields: &[&str],
    failures: &mut Vec<String>,
) -> Vec<(String, String)> {
    let mut found = Vec::new();
    for name in fields {
        let values = meta_values(html, attr, name);
        if values.len() != 1 || values[0].is_empty() {
            failures.push(format!(
                "{rel}: expected exactly one non-empty {name}, found {}",
                values.len()
            ));
        } else {
            found.push(((*name).to_owned(), values[0].clone()));
        }
    }
    found
}

fn lookup<'a>(pairs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    pairs
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
}

/// Check complete Open Graph and Twitter metadata against one card context.
pub fn check_social_metadata(
    html: &str,
    rel: &str,
    description: Option<&str>,
    canonical: Option<&str>,
    expected_image: &str,
    expected_alt: &str,
    failures: &mut Vec<String>,
) {
    let open_graph = required_meta_fields(html, rel, "property", &OPEN_GRAPH_FIELDS, failures);
    let twitter = required_meta_fields(html, rel, "name", &TWITTER_FIELDS, failures);
    let expected_open_graph = [
        ("og:description", description),
        ("og:site_name", Some(SITE_NAME)),
        ("og:locale", Some(OG_LOCALE)),
        ("og:url", canonical),
        ("og:image", Some(expected_image)),
        ("og:image:type", Some("image/png")),
        ("og:image:alt", Some(expected_alt)),
        ("og:image:width", Some("1200")),
        ("og:image:height", Some("630")),
    ];
    let mut compare = |pairs: &[(String, String)], expected: &[(&str, Option<&str>)]| {
        for (name, expected) in expected {
            if let (Some(value), Some(expected)) = (lookup(pairs, name), expected)
                && value != *expected
            {
                failures.push(format!(
                    "{rel}: {name} is {}, expected {}",
                    py::repr_str(value),
                    py::repr_str(expected)
                ));
            }
        }
    };
    compare(&open_graph, &expected_open_graph);
    let expected_twitter = [
        ("twitter:card", Some("summary_large_image")),
        ("twitter:title", lookup(&open_graph, "og:title")),
        ("twitter:description", lookup(&open_graph, "og:description")),
        ("twitter:image", Some(expected_image)),
        ("twitter:image:alt", Some(expected_alt)),
    ];
    compare(&twitter, &expected_twitter);
}

/// Require one explicit privacy-preserving referrer policy on styled pages.
pub fn check_referrer_policy(html: &str, rel: &str, failures: &mut Vec<String>) {
    let values = meta_values(html, "name", "referrer");
    if values != [REFERRER_POLICY] {
        failures.push(format!(
            "{rel}: referrer policy is {}, expected exactly [{}]",
            repr_list(&values),
            py::repr_str(REFERRER_POLICY)
        ));
    }
}

const STYLE_HIDDEN: &str = r"(?:display\s*:\s*none\b|visibility\s*:\s*hidden\b)";

/// HTML with non-rendered, hidden and comment content removed.
pub fn visible_html(html: &str) -> String {
    let html = re(r"<(script|style|template)\b.*?</\1>", S | I).sub(" ", html);
    let html = re(r"<!--.*?-->", S).sub(" ", &html);
    let tag_pattern = re(
        r"<(?P<closing>/)?(?P<name>[a-z][\w:-]*)\b(?P<attrs>[^>]*)>",
        I,
    );
    let hidden_attribute = re(
        &format!(
            concat!(
                r#"(?:^|\s)hidden\b(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?"#,
                r#"|(?:^|\s)aria-hidden\s*=\s*(?:"true"|'true'|true)"#,
                r#"|(?:^|\s)style\s*=\s*(?:"[^"]*{0}[^"]*""#,
                r#"|'[^']*{0}[^']*'"#,
                r"|[^\s>]*{0}[^\s>]*)",
            ),
            STYLE_HIDDEN
        ),
        I,
    );
    let class_attribute = re(
        r#"(?:^|\s)class\s*=\s*(?:"(?P<double>[^"]*)"|'(?P<single>[^']*)'|(?P<unquoted>[^\s>]+))"#,
        I,
    );
    let has_visually_hidden_class = |attrs: &str| {
        class_attribute.search(attrs).is_some_and(|m| {
            let value = (1..=3).find_map(|g| m.get(g)).expect("one group").as_str();
            py::split_whitespace(&unescape(value)).contains(&"visually-hidden")
        })
    };
    let mut rendered = String::with_capacity(html.len());
    let mut hidden_stack: Vec<String> = Vec::new();
    let mut position = 0;
    for tag in tag_pattern.captures_iter(&html) {
        let whole = tag.get(0).expect("group 0");
        if hidden_stack.is_empty() {
            rendered.push_str(&html[position..whole.start()]);
        }
        let name = py::casefold(&tag["name"]);
        let attrs = &tag["attrs"];
        let closing = tag.name("closing").is_some();
        let self_closing = attrs.trim_end_matches(py::is_space).ends_with('/')
            || VOID_ELEMENTS.contains(&name.as_str());
        if !hidden_stack.is_empty() {
            if closing && hidden_stack.contains(&name) {
                let start = hidden_stack
                    .iter()
                    .rposition(|n| *n == name)
                    .expect("present");
                hidden_stack.truncate(start);
            } else if !closing && !self_closing {
                hidden_stack.push(name);
            }
        } else if !closing && (hidden_attribute.is_match(attrs) || has_visually_hidden_class(attrs))
        {
            rendered.push(' ');
            if !self_closing {
                hidden_stack.push(name);
            }
        } else {
            rendered.push_str(whole.as_str());
        }
        position = whole.end();
    }
    if hidden_stack.is_empty() {
        rendered.push_str(&html[position..]);
    }
    rendered
}

/// Raw tag strip: tags removed, entities unescaped, whitespace collapsed.
pub fn stripped_text(html: &str) -> String {
    let body = re(r"<[^>]+>", 0).sub(" ", html);
    py::strip(&re(r"\s+", 0).sub(" ", &unescape(&body))).to_owned()
}

/// The page with script, style, hidden content and tags stripped.
pub fn visible_text(html: &str) -> String {
    stripped_text(&visible_html(html))
}

/// Like visible_text but keeping hidden content, which copy bans must read.
pub fn raw_text(html: &str) -> String {
    stripped_text(&re(r"<(script|style)\b[^>]*>.*?</\1>", I | S).sub(" ", html))
}

/// A child of an element: another element or a run of text.
#[derive(Debug, Clone)]
pub enum Child {
    Element(usize),
    Text(String),
}

#[derive(Debug, Clone)]
pub struct Element {
    pub tag: String,
    /// Attributes in first-seen order; a repeated name keeps its last value, as a dict does.
    pub attrs: Vec<(String, Option<String>)>,
    pub parent: Option<usize>,
    pub children: Vec<Child>,
}

/// seo_core.HtmlElement trees, stored as an arena whose first element is `#document`.
#[derive(Debug, Clone)]
pub struct Tree {
    pub elements: Vec<Element>,
}

impl Tree {
    pub const ROOT: usize = 0;

    pub fn tag(&self, id: usize) -> &str {
        &self.elements[id].tag
    }

    /// `element.attr(name)`: `None` for an absent or valueless attribute.
    pub fn attr(&self, id: usize, name: &str) -> Option<&str> {
        let name = py::casefold(name);
        self.elements[id]
            .attrs
            .iter()
            .find(|(k, _)| *k == name)
            .and_then(|(_, v)| v.as_deref())
    }

    /// `name in element.attrs`.
    pub fn has_attr(&self, id: usize, name: &str) -> bool {
        self.elements[id].attrs.iter().any(|(k, _)| k == name)
    }

    pub fn has_class(&self, id: usize, name: &str) -> bool {
        py::split_whitespace(self.attr(id, "class").unwrap_or("")).contains(&name)
    }

    pub fn parent(&self, id: usize) -> Option<usize> {
        self.elements[id].parent
    }

    pub fn children(&self, id: usize) -> &[Child] {
        &self.elements[id].children
    }

    pub fn is_rendered(&self, id: usize) -> bool {
        let mut current = Some(id);
        while let Some(c) = current {
            if NON_RENDERED_ELEMENTS.contains(&self.tag(c)) {
                return false;
            }
            current = self.parent(c);
        }
        true
    }

    /// Descendant elements in source order, optionally excluding templates.
    pub fn descendants(&self, id: usize, tag: Option<&str>, rendered_only: bool) -> Vec<usize> {
        let mut found = Vec::new();
        self.visit(id, &mut |child| {
            if tag.is_none_or(|t| self.tag(child) == t)
                && (!rendered_only || self.is_rendered(child))
            {
                found.push(child);
            }
        });
        found
    }

    fn visit(&self, id: usize, f: &mut impl FnMut(usize)) {
        for child in &self.elements[id].children {
            if let Child::Element(c) = child {
                f(*c);
                self.visit(*c, f);
            }
        }
    }

    /// Visible descendant text with whitespace collapsed.
    pub fn text(&self, id: usize) -> String {
        let mut chunks: Vec<&str> = Vec::new();
        self.collect_text(id, &mut chunks);
        py::strip(&re(r"\s+", 0).sub(" ", &chunks.join(" "))).to_owned()
    }

    fn collect_text<'a>(&'a self, id: usize, chunks: &mut Vec<&'a str>) {
        for child in &self.elements[id].children {
            match child {
                Child::Text(text) => chunks.push(text),
                Child::Element(c) if !NON_RENDERED_ELEMENTS.contains(&self.tag(*c)) => {
                    self.collect_text(*c, chunks);
                }
                Child::Element(_) => {}
            }
        }
    }

    pub fn by_id(&self, identifier: &str) -> Vec<usize> {
        self.descendants(Self::ROOT, None, false)
            .into_iter()
            .filter(|e| self.attr(*e, "id") == Some(identifier))
            .collect()
    }

    pub fn is_descendant(&self, element: usize, ancestor: usize) -> bool {
        let mut current = self.parent(element);
        while let Some(c) = current {
            if c == ancestor {
                return true;
            }
            current = self.parent(c);
        }
        false
    }
}

/// seo_core.StructureParser over `html.parser` with converted character references.
pub fn parse_structure(html: &str) -> Tree {
    let mut tree = Tree {
        elements: vec![Element {
            tag: "#document".into(),
            attrs: vec![],
            parent: None,
            children: vec![],
        }],
    };
    let mut stack = vec![Tree::ROOT];
    for positioned in htmlparser::parse(html, true) {
        let (tag, attrs, push) = match positioned.event {
            Event::StartTag(tag, attrs) => (tag, attrs, true),
            Event::StartEndTag(tag, attrs) => (tag, attrs, false),
            Event::EndTag(tag) => {
                let wanted = py::casefold(&tag);
                if let Some(index) = (1..stack.len())
                    .rev()
                    .find(|i| tree.tag(stack[*i]) == wanted)
                {
                    stack.truncate(index);
                }
                continue;
            }
            Event::Data(text) => {
                let current = *stack.last().expect("the document");
                tree.elements[current].children.push(Child::Text(text));
                continue;
            }
            _ => continue,
        };
        {
            {
                let mut merged: Vec<(String, Option<String>)> = Vec::new();
                for (name, value) in attrs {
                    let name = py::casefold(&name);
                    match merged.iter_mut().find(|(k, _)| *k == name) {
                        Some(slot) => slot.1 = value,
                        None => merged.push((name, value)),
                    }
                }
                let parent = *stack.last().expect("the document");
                let id = tree.elements.len();
                let tag = py::casefold(&tag);
                tree.elements.push(Element {
                    tag: tag.clone(),
                    attrs: merged,
                    parent: Some(parent),
                    children: vec![],
                });
                tree.elements[parent].children.push(Child::Element(id));
                if push && !VOID_ELEMENTS.contains(&tag.as_str()) {
                    stack.push(id);
                }
            }
        }
    }
    tree
}

pub fn json_ld_blocks(html: &str, rel: &str, failures: &mut Vec<String>) -> Vec<Json> {
    let mut blocks = Vec::new();
    for raw in re(r#"<script type="application/ld\+json">(.*?)</script>"#, S).findall(html) {
        match pyjson::loads(&raw) {
            Ok(value) => blocks.push(value),
            Err(error) => failures.push(format!("{rel}: JSON-LD does not parse: {error}")),
        }
    }
    blocks
}

/// JSON-LD objects recursively, including objects inside arrays.
pub fn nodes(value: &Json) -> Vec<&Json> {
    let mut found = Vec::new();
    fn visit<'a>(candidate: &'a Json, found: &mut Vec<&'a Json>) {
        match candidate {
            Json::Object(pairs) => {
                found.push(candidate);
                for (_, child) in pairs {
                    visit(child, found);
                }
            }
            Json::Array(items) => {
                for child in items {
                    visit(child, found);
                }
            }
            _ => {}
        }
    }
    visit(value, &mut found);
    found
}

/// Whether a JSON-LD node declares the requested type.
pub fn has_type(node: &Json, expected: &str) -> bool {
    let expected = Json::str_obj(expected);
    match node.get("@type") {
        Some(Json::Array(items)) => items.iter().any(|i| i.py_eq(&expected)),
        Some(value) => value.py_eq(&expected),
        None => false,
    }
}

/// Every top-level JSON-LD node from indexable HTML files, with its page.
pub fn indexed_nodes(
    paths: &[PathBuf],
    failures: &mut Vec<String>,
    not_indexed: &HashSet<String>,
    root: &Path,
) -> Result<Vec<(String, Json)>, String> {
    let mut found = Vec::new();
    for path in paths {
        let rel = rel(path, root);
        if not_indexed.contains(&rel) {
            continue;
        }
        for block in json_ld_blocks(&crate::read(path)?, &rel, failures) {
            found.extend(nodes(&block).into_iter().map(|n| (rel.clone(), n.clone())));
        }
    }
    Ok(found)
}

/// One visible section by ID, or an empty string when it is absent.
pub fn section_html(html: &str, identifier: &str) -> String {
    let rendered = visible_html(html);
    let opening = re(
        &format!(
            r#"<section\b(?=[^>]*\bid\s*=\s*["\']{}["\'])[^>]*>"#,
            pyre::escape(identifier)
        ),
        I,
    );
    let Some(open) = opening.search(&rendered).map(|m| {
        let whole = m.get(0).expect("group 0");
        (whole.start(), whole.end())
    }) else {
        return String::new();
    };
    match re(r"</section\s*>", I).search(&rendered[open.1..]) {
        None => rendered[open.0..].to_owned(),
        Some(close) => rendered[open.0..open.1 + close.get(0).expect("group 0").end()].to_owned(),
    }
}

/// href values from visible anchors.
pub fn anchor_hrefs(html: &str) -> Vec<String> {
    re(r#"<a\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']"#, I)
        .findall(html)
        .iter()
        .map(|h| unescape(h))
        .collect()
}

/// Normalised visible heading text.
pub fn heading_texts(html: &str) -> HashSet<String> {
    re(r"<h[1-6]\b[^>]*>(.*?)</h[1-6]\s*>", S | I)
        .findall(html)
        .iter()
        .map(|h| py::casefold(&visible_text(h)))
        .collect()
}

/// One level-two Markdown section without later sections.
pub fn markdown_section(markdown: &str, heading: &str) -> String {
    re(
        &format!(
            r"^##\s+{}\s*$\n(?P<body>.*?)(?=^##\s+|\Z)",
            pyre::escape(heading)
        ),
        M | S,
    )
    .search(markdown)
    .map_or(String::new(), |m| m["body"].to_owned())
}

/// The simple one-agent robots groups used by this site, in first-seen order.
pub fn robots_groups(robots: &str) -> Vec<(String, Vec<String>)> {
    let mut groups: Vec<(String, Vec<String>)> = Vec::new();
    let mut agents: Vec<String> = Vec::new();
    let mut directives_started = false;
    for raw_line in py::splitlines(robots) {
        let line = py::strip(raw_line);
        if line.is_empty() || line.starts_with('#') {
            agents.clear();
            directives_started = false;
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = py::casefold(py::strip(key));
        let value = py::strip(value).to_owned();
        if key == "user-agent" {
            if directives_started {
                agents.clear();
                directives_started = false;
            }
            agents.push(value.clone());
            if !groups.iter().any(|(a, _)| *a == value) {
                groups.push((value, Vec::new()));
            }
        } else if key == "allow" || key == "disallow" {
            let title = if key == "allow" { "Allow" } else { "Disallow" };
            for agent in &agents {
                let group = groups
                    .iter_mut()
                    .find(|(a, _)| a == agent)
                    .expect("declared");
                group.1.push(format!("{title}: {value}"));
            }
            directives_started = true;
        }
    }
    groups
}

/// Plain structured-data text normalised for comparison with visible copy.
pub fn normalise_claim(value: Option<&Json>) -> String {
    match value {
        Some(Json::Str(text)) => py::strip(&re(r"\s+", 0).sub(" ", &unescape(text))).to_owned(),
        _ => String::new(),
    }
}

/// Ordered question and answer pairs from visible FAQ containers.
pub fn visible_faq_pairs(html: &str) -> Vec<(String, String)> {
    let rendered = visible_html(html);
    let paragraph = re(r"<p\b[^>]*>(.*?)</p\s*>", S | I);
    let heading = re(r"<h3\b[^>]*>(.*?)</h3\s*>", S | I);
    let mut pairs = Vec::new();
    let containers = re(
        r#"<div\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\bfaq\b[^"\']*["\'])[^>]*>(.*?)</div\s*>"#,
        S | I,
    )
    .findall(&rendered);
    for container in &containers {
        let headings: Vec<_> = heading
            .captures_iter(container)
            .map(|m| {
                let whole = m.get(0).expect("group 0");
                (whole.start(), whole.end(), m[1].to_owned())
            })
            .collect();
        for (index, (_, end_of_heading, text)) in headings.iter().enumerate() {
            let end = headings.get(index + 1).map_or(container.len(), |h| h.0);
            let answer = paragraph
                .search(&container[*end_of_heading..end])
                .map_or(String::new(), |m| visible_text(&m[1]));
            pairs.push((visible_text(text), answer));
        }
    }
    for question in re(
        r#"<details\b(?=[^>]*\bclass\s*=\s*["\']question["\'])[^>]*>(.*?)</details\s*>"#,
        S | I,
    )
    .findall(&rendered)
    {
        let Some(title) = heading.search(&question) else {
            continue;
        };
        let after = title.get(0).expect("group 0").end();
        let reply = paragraph
            .search(&question[after..])
            .map_or(String::new(), |m| visible_text(&m[1]));
        pairs.push((visible_text(&title[1]), reply));
    }
    pairs
}

/// Pair each structured FAQ item with the visible item in the same position.
pub fn check_faq_visible(node: &Json, html: &str, rel: &str, failures: &mut Vec<String>) {
    let mut structured = Vec::new();
    if let Some(Json::Array(entities)) = node.get("mainEntity") {
        for question in entities {
            if !matches!(question, Json::Object(_)) {
                structured.push((String::new(), String::new()));
                continue;
            }
            let answer = match question.get("acceptedAnswer") {
                Some(answer @ Json::Object(_)) => answer.get("text"),
                _ => None,
            };
            structured.push((
                normalise_claim(question.get("name")),
                normalise_claim(answer),
            ));
        }
    }
    let visible = visible_faq_pairs(html);
    if structured.len() != visible.len() {
        failures.push(format!(
            "{rel}: FAQPage has {} structured items but {} visible items",
            structured.len(),
            visible.len()
        ));
    }
    for (index, (s, v)) in structured.iter().zip(&visible).enumerate() {
        if s.0 != v.0 {
            failures.push(format!(
                "{rel}: FAQPage item {} question does not match the visible FAQ",
                index + 1
            ));
        }
        if s.1 != v.1 {
            failures.push(format!(
                "{rel}: FAQPage item {} answer does not match the visible FAQ",
                index + 1
            ));
        }
    }
}

/// Keep declared ItemList counts and positions aligned with their entries.
pub fn check_item_lists(value: &Json, rel: &str, failures: &mut Vec<String>) {
    for node in nodes(value) {
        if !has_type(node, "ItemList") {
            continue;
        }
        let Some(Json::Array(items)) = node.get("itemListElement") else {
            failures.push(format!("{rel}: ItemList itemListElement is not a list"));
            continue;
        };
        let declared = node.get("numberOfItems").cloned().unwrap_or(Json::Null);
        match &declared {
            Json::Int(count) => {
                if *count != num_bigint::BigInt::from(items.len()) {
                    failures.push(format!(
                        "{rel}: ItemList declares {} items, but contains {}",
                        declared.repr(),
                        items.len()
                    ));
                }
            }
            other => failures.push(format!(
                "{rel}: ItemList numberOfItems must be an integer, found {}",
                other.repr()
            )),
        }
        let positions: Vec<Json> = items
            .iter()
            .map(|item| match item {
                Json::Object(_) => item.get("position").cloned().unwrap_or(Json::Null),
                _ => Json::Null,
            })
            .collect();
        let shown = Json::Array(positions.clone()).repr();
        if positions.iter().any(|p| !matches!(p, Json::Int(_))) {
            failures.push(format!(
                "{rel}: ItemList positions must be integers, found {shown}"
            ));
        } else if positions
            .iter()
            .enumerate()
            .any(|(i, p)| *p != Json::Int(num_bigint::BigInt::from(i + 1)))
        {
            let expected = Json::Array(
                (1..=items.len())
                    .map(|i| Json::Int(num_bigint::BigInt::from(i)))
                    .collect(),
            );
            failures.push(format!(
                "{rel}: ItemList positions are {shown}, expected {}",
                expected.repr()
            ));
        }
    }
}

pub fn sitemap_urls(root: &Path) -> Result<Vec<String>, String> {
    Ok(re(r"<loc>(.*?)</loc>", 0).findall(&crate::read(&root.join("sitemap.xml"))?))
}

/// lastmod values immediately associated with one sitemap URL.
pub fn sitemap_lastmods(url: &str, root: &Path) -> Result<Vec<String>, String> {
    let xml = crate::read(&root.join("sitemap.xml"))?;
    Ok(re(
        &format!(
            r"<loc>{}</loc>\s*<lastmod>(.*?)</lastmod>",
            pyre::escape(url)
        ),
        S,
    )
    .findall(&xml))
}

/// Public site HTML, excluding hidden and generated directories, sorted as `sorted(paths)`.
pub fn html_files(root: &Path) -> Vec<PathBuf> {
    html_files_observed(root, &mut |_| {})
}

/// `html_files`, reporting each directory it lists (the tests' `os.scandir` patch).
pub fn html_files_observed(root: &Path, listed: &mut dyn FnMut(&Path)) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    walk(root, &mut paths, listed);
    crate::sort_paths(&mut paths);
    paths
}

fn walk(directory: &Path, paths: &mut Vec<PathBuf>, listed: &mut dyn FnMut(&Path)) {
    listed(directory);
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    let mut subdirectories = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        // Path.glob("*.html") matches names only, so a directory named *.html is listed too.
        if crate::glob_suffix(&name, ".html")
            && !name.starts_with('.')
            && !(name.starts_with("google") && name.ends_with(".html"))
        {
            paths.push(path.clone());
        }
        // os.walk lists a linked directory but, without followlinks, does not enter it.
        let linked = entry.file_type().is_ok_and(|t| t.is_symlink());
        if path.is_dir()
            && !linked
            && !name.starts_with('.')
            && !GENERATED_HTML_DIRECTORIES.contains(&name.as_str())
        {
            subdirectories.push(path);
        }
    }
    for directory in subdirectories {
        walk(&directory, paths, listed);
    }
}
