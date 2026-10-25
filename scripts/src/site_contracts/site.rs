//! Cross-page contracts: identity graph, evidence, routes, evaluations, robots and cards.
use super::*;
use crate::html::unescape;
use crate::py;
use crate::pyjson::{self, Dump};
use crate::pyre::{self, I, S, re};
use crate::pyurl;
use crate::pyval::{Val, counter_sub, repr_list};
use crate::seo_core::{self as core, Tree};
use std::collections::HashSet;

fn not_indexed() -> HashSet<String> {
    NOT_INDEXED.iter().map(|s| (*s).to_owned()).collect()
}

fn string_list(items: &[&str]) -> Json {
    Json::Array(items.iter().map(|i| s(i)).collect())
}

/// Check the identity fields that make the canonical Person unambiguous.
pub fn check_canonical_person(person: &Json) -> Vec<String> {
    let mut failures = Vec::new();
    if !eq(person.get("@id"), &s(PERSON_ID)) {
        failures.push(format!(
            "person graph: Person @id is {}, expected {}",
            Val::Json(person.get("@id").cloned().unwrap_or(Json::Null)).repr(),
            py::repr_str(PERSON_ID)
        ));
    }
    if !eq(person.get("sameAs"), &string_list(&PERSON_SAME_AS)) {
        failures.push("person graph: Person sameAs must contain only the GitHub, LinkedIn, OpenAccountants and PyPI profile URLs in the required order".into());
    }
    for (field, expected) in PERSON_REQUIRED_FIELDS {
        if !eq(person.get(field), &s(expected)) {
            failures.push(format!(
                "person graph: Person {field} is {}, expected {}",
                person.get(field).unwrap_or(&Json::Null).repr(),
                py::repr_str(expected)
            ));
        }
    }
    let address = obj(PERSON_ADDRESS.iter().map(|(k, v)| (*k, s(v))).collect());
    if !eq(person.get("address"), &address) {
        failures.push("person graph: Person address must identify Newcastle, NSW, AU".into());
    }
    let nationality = obj(vec![("@type", s("Country")), ("name", s("Australia"))]);
    if !eq(person.get("nationality"), &nationality) {
        failures.push("person graph: Person nationality must identify Australia".into());
    }
    failures
}

fn keys(node: &Json) -> Vec<&str> {
    match node {
        Json::Object(pairs) => pairs.iter().map(|(k, _)| k.as_str()).collect(),
        _ => vec![],
    }
}

/// Check that a Person outside About is a homepage stub restating the canonical node.
pub fn check_person_stub(rel: &str, stub: &Json, canonical: &Json) -> Vec<String> {
    if rel != "index.html" {
        return vec![format!(
            "person graph: {rel} must not define a Person node; only index.html may carry a stub"
        )];
    }
    let mut failures = Vec::new();
    let mut fields = keys(stub);
    let set_matches = fields.len() == PERSON_STUB_FIELDS.len()
        && PERSON_STUB_FIELDS.iter().all(|f| fields.contains(f));
    if !set_matches {
        fields.sort();
        failures.push(format!(
            "person graph: index.html Person stub must carry exactly {}, found {}",
            repr_list(PERSON_STUB_FIELDS),
            repr_list(fields)
        ));
    }
    for field in PERSON_STUB_FIELDS {
        if let Some(value) = stub.get(field)
            && !value.py_eq(canonical.get(field).unwrap_or(&Json::Null))
        {
            failures.push(format!(
                "person graph: index.html Person stub {field} differs from the canonical Person"
            ));
        }
    }
    failures
}

/// Check that index.html carries exactly one stub and no other page carries any.
pub fn check_person_stubs(people: &[(String, Json)], canonical: &Json) -> Vec<String> {
    let mut failures = Vec::new();
    let stubs: Vec<&(String, Json)> = people
        .iter()
        .filter(|(r, _)| r != "about/index.html")
        .collect();
    for (rel, node) in &stubs {
        failures.extend(check_person_stub(rel, node, canonical));
    }
    if stubs.iter().filter(|(r, _)| r == "index.html").count() != 1 {
        failures.push("person graph: index.html must carry exactly one Person stub".into());
    }
    failures
}

/// About owns the canonical Person, index.html may restate it, and the authored works.
pub fn check_person_graph(paths: &[PathBuf], root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let graph = core::indexed_nodes(paths, &mut failures, &not_indexed(), root)?;
    let people: Vec<(String, Json)> = graph
        .iter()
        .filter(|(_, n)| core::has_type(n, "Person"))
        .cloned()
        .collect();
    let canonical: Vec<&(String, Json)> = people
        .iter()
        .filter(|(r, _)| r == "about/index.html")
        .collect();
    if canonical.len() != 1 {
        failures
            .push("person graph: about/index.html must contain the canonical Person node".into());
    } else {
        let canonical = &canonical[0].1;
        failures.extend(check_canonical_person(canonical));
        failures.extend(check_person_stubs(&people, canonical));
    }
    let software: Vec<&(String, Json)> = graph
        .iter()
        .filter(|(rel, n)| rel == "index.html" && core::has_type(n, "SoftwareSourceCode"))
        .collect();
    if software.len() != AUTHORED_SOFTWARE.len() {
        failures.push(format!(
            "person graph: expected {} SoftwareSourceCode nodes, found {}",
            AUTHORED_SOFTWARE.len(),
            software.len()
        ));
    }
    for expected in AUTHORED_SOFTWARE.iter() {
        let name = expected.name;
        let matches: Vec<&&(String, Json)> = software
            .iter()
            .filter(|(_, n)| eq(n.get("name"), &s(name)))
            .collect();
        if matches.len() != 1 {
            failures.push(format!(
                "person graph: expected one SoftwareSourceCode node named {}, found {}",
                py::repr_str(name),
                matches.len()
            ));
            continue;
        }
        let (rel, node) = &**matches[0];
        if rel != "index.html" {
            failures.push(format!("person graph: {name} is in {rel}, not index.html"));
        }
        if !eq(node.get("@id"), &s(&expected.id)) {
            failures.push(format!(
                "person graph: {name} does not have its stable homepage @id"
            ));
        }
        if !eq(node.get("author"), &person_ref()) {
            failures.push(format!(
                "person graph: {name} is not authored by the canonical Person"
            ));
        }
        if !eq(node.get("url"), &s(expected.repository)) {
            failures.push(format!("person graph: {name} does not use its GitHub URL"));
        }
        if !eq(node.get("codeRepository"), &s(expected.repository)) {
            failures.push(format!(
                "person graph: {name} does not name its GitHub repository"
            ));
        }
        if !eq(node.get("license"), &s(&expected.license)) {
            failures.push(format!(
                "person graph: {name} does not declare its licence URL"
            ));
        }
        if !eq(node.get("description"), &s(expected.description)) {
            failures.push(format!(
                "person graph: {name} does not use its current description"
            ));
        }
    }
    Ok(failures)
}

fn strip_non_rendered(html: &str) -> String {
    let html = re(r"<(script|style|template)\b.*?</\1>", S | I).sub(" ", html);
    re(r"<!--.*?-->", S).sub(" ", &html)
}

/// Keep the public evidence page linked, bounded and person-referential.
pub fn check_evidence_page(root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let evidence_path = site_path(root, EVIDENCE_REL);
    if !evidence_path.is_file() {
        failures.push(format!("{EVIDENCE_REL}: evidence page does not exist"));
    }
    let sitemap_count = core::sitemap_urls(root)?
        .iter()
        .filter(|u| *u == EVIDENCE_URL)
        .count();
    if sitemap_count != 1 {
        failures.push(format!(
            "sitemap.xml: evidence URL must appear once, found {sitemap_count}"
        ));
    }
    let llms_count = crate::read(&root.join("llms.txt"))?
        .matches(EVIDENCE_URL)
        .count();
    if llms_count != 1 {
        failures.push(format!(
            "llms.txt: evidence URL must appear once, found {llms_count}"
        ));
    }
    for rel in ["index.html", "about/index.html"] {
        let page = strip_non_rendered(&crate::read(&site_path(root, rel))?);
        if !re(r#"<a\b[^>]*href="/evidence/"[^>]*>"#, I).is_match(&page) {
            failures.push(format!("{rel}: no visible link to /evidence/"));
        }
    }
    if !evidence_path.is_file() {
        return Ok(failures);
    }
    let html = crate::read(&evidence_path)?;
    let text = py::casefold(&core::visible_text(&html));
    let canonical = re(r#"<link rel="canonical" href="(.*?)""#, 0)
        .search(&html)
        .map(|m| m[1].to_owned());
    if canonical.as_deref() != Some(EVIDENCE_URL) {
        failures.push(format!(
            "{EVIDENCE_REL}: canonical is {}, expected {}",
            Val::from(canonical.as_deref()).repr(),
            py::repr_str(EVIDENCE_URL)
        ));
    }
    let blocks = core::json_ld_blocks(&html, EVIDENCE_REL, &mut failures);
    let nodes: Vec<&Json> = blocks.iter().flat_map(core::nodes).collect();
    let authored = nodes
        .iter()
        .filter(|n| core::has_type(n, "TechArticle") || core::has_type(n, "WebPage"))
        .any(|n| eq(n.get("author"), &person_ref()));
    if !authored {
        failures.push(format!(
            "{EVIDENCE_REL}: TechArticle or WebPage is not authored by the canonical Person"
        ));
    }
    if nodes.iter().any(|n| core::has_type(n, "Person")) {
        failures.push(format!(
            "{EVIDENCE_REL}: must not define a local Person node"
        ));
    }
    for (label, pattern) in [
        ("synthetic", r"\bsynthetic\b"),
        ("versioned", r"\bversion(?:ed|ing|s)?\b"),
        ("local", r"\blocal\b"),
        ("human review", r"\bhuman\b.{0,80}\breview\w*\b"),
        ("primary source", r"\bprimary\s+source\w*\b"),
    ] {
        if !re(pattern, S | I).is_match(&text) {
            failures.push(format!(
                "{EVIDENCE_REL}: visible text does not name {label}"
            ));
        }
    }
    Ok(failures)
}

fn lookup<'a>(pairs: &'a [(&str, &'a str)], key: &str) -> &'a str {
    pairs
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, v)| *v)
        .expect("configured")
}

/// Keep machine-facing routes and the non-practice boundary aligned.
pub fn check_llms_authority_surface(llms: &str) -> Vec<String> {
    let route_section = core::markdown_section(llms, "Choose a route");
    let complete = AUTHORITY_PATHS.iter().all(|(identifier, label)| {
        re(
            &format!(
                r"\*\*{}\*\*\s*\({}\)",
                pyre::escape(label),
                pyre::escape(lookup(&AUTHORITY_URLS, identifier))
            ),
            0,
        )
        .is_match(&route_section)
    });
    let boundaries = [
        "personal index of open source accounting tools",
        "not a practice",
        "not accepting professional engagements through this site",
    ];
    let retired = route_section.contains("**Engage**") || llms.contains("/#engage");
    if !complete || retired || boundaries.iter().any(|b| !llms.contains(b)) {
        vec!["llms.txt: open source route boundary is incomplete".into()]
    } else {
        vec![]
    }
}

/// Keep the AI-agent page's visible and structured review dates aligned.
pub fn check_mcp_review_dates(html: &str) -> Vec<String> {
    let mut failures = Vec::new();
    let visible = core::visible_text(html);
    let expected = format!("Published 25 August 2026. Last reviewed {MCP_VISIBLE_REVIEW_DATE}.");
    if !visible.contains(&expected) {
        failures.push(format!(
            "{MCP_REL}: visible review date must be {MCP_VISIBLE_REVIEW_DATE}"
        ));
    }
    let mut parse_failures = Vec::new();
    let blocks = core::json_ld_blocks(html, MCP_REL, &mut parse_failures);
    let nodes: Vec<&Json> = blocks.iter().flat_map(core::nodes).collect();
    failures.extend(parse_failures);
    for schema in ["TechArticle", "WebPage"] {
        let matches: Vec<&&Json> = nodes.iter().filter(|n| core::has_type(n, schema)).collect();
        if matches.len() != 1 || !eq(matches[0].get("dateModified"), &s(MCP_REVIEW_DATE)) {
            failures.push(format!(
                "{MCP_REL}: {schema} dateModified must be {MCP_REVIEW_DATE}"
            ));
        }
    }
    for schema in ["TechArticle", "WebPage"] {
        let matches: Vec<&&Json> = nodes.iter().filter(|n| core::has_type(n, schema)).collect();
        if matches.len() != 1 || !eq(matches[0].get("datePublished"), &s("2026-08-25")) {
            failures.push(format!(
                "{MCP_REL}: {schema} datePublished must remain 2026-08-25"
            ));
        }
    }
    failures
}

fn class_tag(class: &str) -> String {
    format!(r#"<[a-z][\w:-]*\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\b{class}\b[^"\']*["\'])[^>]*>"#)
}

/// Require one route thought, one action group and one visible boundary.
pub fn check_authority_section(
    section_html: &str,
    identifier: &str,
    statement: &str,
) -> Vec<String> {
    let mut failures = Vec::new();
    let rendered = core::visible_html(section_html);
    if re(r"<h2\b[^>]*>(.*?)</h2\s*>", S | I)
        .findall(&rendered)
        .len()
        != 1
    {
        failures.push(format!(
            "index.html: authority section #{identifier} must have exactly one h2"
        ));
    }
    let statements = re(
        concat!(
            r#"<h2\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\broute-statement\b[^"\']*["\'])"#,
            r"[^>]*>(.*?)</h2\s*>"
        ),
        S | I,
    )
    .findall(&rendered);
    if statements.len() != 1 || core::visible_text(&statements[0]) != statement {
        failures.push(format!(
            "index.html: authority section #{identifier} statement must be {statement}"
        ));
    }
    if re(&class_tag("route-actions"), I).findall(&rendered).len() != 1 {
        failures.push(format!(
            "index.html: authority section #{identifier} needs one action group"
        ));
    }
    if re(&class_tag("route-note"), I).findall(&rendered).len() != 1 {
        failures.push(format!(
            "index.html: authority section #{identifier} needs one boundary or verification note"
        ));
    }
    failures
}

fn json_ld_text(html: &str, rel: &str, failures: &mut Vec<String>) -> String {
    core::json_ld_blocks(html, rel, failures)
        .iter()
        .map(|b| {
            pyjson::dumps(
                b,
                Dump {
                    ensure_ascii: false,
                    ..Default::default()
                },
            )
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// `sorted(root.glob(pattern))` for `dir/*/name`: one directory level, then a fixed name.
fn glob_children(root: &Path, directory: &str, name: &str) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let Ok(entries) = std::fs::read_dir(site_path(root, directory)) else {
        return found;
    };
    for entry in entries.flatten() {
        let Ok(children) = std::fs::read_dir(entry.path()) else {
            continue;
        };
        for child in children.flatten() {
            let child_name = child.file_name().to_string_lossy().into_owned();
            let matches = if cfg!(windows) {
                child_name.eq_ignore_ascii_case(name)
            } else {
                child_name == name
            };
            if matches {
                found.push(child.path());
            }
        }
    }
    crate::sort_paths(&mut found);
    found
}

/// Require Adopt and Verify while keeping the consultancy route parked.
pub fn check_authority_surface(root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let home = read_if_file(&root.join("index.html"))?;
    let rendered_home = core::visible_html(&home);
    let sections: Vec<(&str, String)> = AUTHORITY_PATHS
        .iter()
        .map(|(identifier, _)| (*identifier, core::section_html(&home, identifier)))
        .collect();
    for (identifier, section) in &sections {
        if section.is_empty() {
            failures.push(format!(
                "index.html: missing visible authority section #{identifier}"
            ));
        }
        failures.extend(check_authority_section(
            section,
            identifier,
            lookup(&AUTHORITY_STATEMENTS, identifier),
        ));
    }
    let home_text = core::visible_text(&rendered_home);
    if PRIMARY_INSTALL_PATTERNS
        .iter()
        .any(|p| re(p, I).is_match(&home_text))
    {
        failures.push("index.html: install commands belong in the integration guide".into());
    }
    let install_route = "/tools/australian-tax-ai-agents/#install";
    if !core::anchor_hrefs(&sections[0].1)
        .iter()
        .any(|h| h == install_route)
    {
        failures.push("index.html: #adopt must link to the integration guide".into());
    }
    if re(RETIRED_GITHUB_SOURCE_INSTALL_PATTERN, I).is_match(&home_text) {
        failures.push("index.html: retired GitHub-source install command".into());
    }

    let install_page = read_if_file(&site_path(root, MCP_REL))?;
    let install_text = core::visible_text(&core::section_html(&install_page, "install"));
    let page_text = core::visible_text(&install_page);
    if PRIMARY_INSTALL_PATTERNS.iter().any(|p| {
        re(p, I).findall(&page_text).len() != 1 || re(p, I).findall(&install_text).len() != 1
    }) {
        failures.push(format!(
            "{MCP_REL}: install commands must appear exactly once inside #install"
        ));
    }
    if !install_text.contains(GITHUB_AGENT_SKILLS_BOUNDARY) {
        failures.push(format!(
            "{MCP_REL}: github-agent-skills boundary must be {}",
            py::repr_str(GITHUB_AGENT_SKILLS_BOUNDARY)
        ));
    }

    let llms = read_if_file(&root.join("llms.txt"))?;
    failures.extend(check_llms_authority_surface(&llms));
    if PRIMARY_INSTALL_PATTERNS
        .iter()
        .any(|p| re(p, I).is_match(&llms))
    {
        failures.push(format!(
            "llms.txt: supported install commands must link to {install_route} instead"
        ));
    }
    if re(RETIRED_GITHUB_SOURCE_INSTALL_PATTERN, I).is_match(&llms) {
        failures.push("llms.txt: retired GitHub-source install command".into());
    }
    if !llms.contains(GITHUB_AGENT_SKILLS_URL) || !llms.contains(GITHUB_AGENT_SKILLS_BOUNDARY) {
        failures.push("llms.txt: github-agent-skills adoption entry is incomplete".into());
    }

    let tooling = read_if_file(&root.join("docs").join("agent-tooling.md"))?;
    if !tooling.contains(GITHUB_AGENT_SKILLS_URL)
        || !tooling.contains(GITHUB_AGENT_SKILLS_BOUNDARY)
        || [
            "git clone https://github.com/ryanduguid/github-agent-skills.git",
            "cd github-agent-skills",
            "python scripts/validate_skills.py --strict",
        ]
        .iter()
        .any(|c| !tooling.contains(c))
    {
        failures.push("docs/agent-tooling.md: github-agent-skills setup is incomplete".into());
    }
    if !core::section_html(&home, "engage").is_empty() || py::casefold(&home).contains("/#engage") {
        failures.push("index.html: retired Engage route must not be visible".into());
    }

    for path in core::html_files(root) {
        let rel = core::rel(&path, root);
        if rel == "index.html" || NOT_INDEXED.contains(&rel.as_str()) {
            continue;
        }
        let page_html = crate::read(&path)?;
        let page_text = core::visible_text(&page_html);
        let page_json_ld = json_ld_text(&page_html, &rel, &mut failures);
        let indexable = format!("{page_text} {page_json_ld}");
        let banned: &[&str] = if rel == MCP_REL {
            &[]
        } else {
            &PRIMARY_INSTALL_PATTERNS
        };
        if banned.iter().any(|p| re(p, I).is_match(&indexable)) {
            failures.push(format!(
                "{rel}: supported install commands must link to {install_route} instead"
            ));
        }
        if re(RETIRED_GITHUB_SOURCE_INSTALL_PATTERN, I).is_match(&indexable) {
            failures.push(format!("{rel}: retired GitHub-source install command"));
        }
    }

    for (rel, boundary) in [
        (
            "about/index.html",
            "not accepting professional engagements through this site",
        ),
        (
            "contact/index.html",
            "do not accept professional engagements through this site",
        ),
    ] {
        let page = read_if_file(&site_path(root, rel))?;
        let text = core::visible_text(&page);
        let mut mailto = false;
        for href in core::anchor_hrefs(&page) {
            if py::casefold(&pyurl::urlsplit(&href)?.scheme) == "mailto"
                && (rel != "contact/index.html" || !CONTACT_MAILTO_HREFS.contains(&href.as_str()))
            {
                mailto = true;
                break;
            }
        }
        if mailto
            || !py::casefold(&text).contains("not a practice")
            || !py::casefold(&text).contains(boundary)
            || !re(
                r"\b(?:do\s+not|don't|never)\b.{0,100}\bclient\s+(?:files?|records?)\b",
                S | I,
            )
            .is_match(&text)
        {
            failures.push(format!("{rel}: non-practice boundary is incomplete"));
        }
    }

    let evidence_html = read_if_file(&site_path(root, EVIDENCE_REL))?;
    let rendered_evidence = core::visible_html(&evidence_html);
    let headings = core::heading_texts(&rendered_evidence);
    if ASSURANCE_ANCHORS
        .iter()
        .any(|(_, h)| !headings.contains(&py::casefold(h)))
    {
        failures.push("evidence/index.html: missing assurance heading".into());
    }
    if !core::visible_text(&rendered_evidence).contains(CA_ANZ_NON_ENDORSEMENT) {
        failures.push("evidence/index.html: missing CA ANZ non-endorsement boundary".into());
    }
    let span = |pattern: &str, flags: u8| {
        re(pattern, flags).search(&rendered_evidence).map(|m| {
            let whole = m.get(0).expect("group 0");
            (whole.start(), whole.end(), whole.as_str().to_owned())
        })
    };
    let short_answer = span(
        concat!(
            r#"<p\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\bshort-answer\b[^"\']*["\'])[^>]*>"#,
            r".*?</p\s*>"
        ),
        S | I,
    );
    let contents_nav = span(
        concat!(
            r#"<nav\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\bcontents-nav\b[^"\']*["\'])[^>]*>"#,
            r".*?</nav\s*>"
        ),
        S | I,
    );
    let first_heading = span(
        &format!(
            r#"<h[1-6]\b(?=[^>]*\bid\s*=\s*["\']{}["\'])[^>]*>"#,
            ASSURANCE_ANCHORS[0].0
        ),
        I,
    );
    let anchored_ok = ASSURANCE_ANCHORS.iter().all(|(identifier, heading)| {
        let found = re(
            &format!(
                r#"<h[1-6]\b(?=[^>]*\bid\s*=\s*["\']{}["\'])[^>]*>(.*?)</h[1-6]\s*>"#,
                pyre::escape(identifier)
            ),
            S | I,
        )
        .search(&rendered_evidence)
        .map_or(String::new(), |m| core::visible_text(&m[1]));
        found == *heading
    });
    let expected_hrefs: Vec<String> = ASSURANCE_ANCHORS
        .iter()
        .map(|(i, _)| format!("#{i}"))
        .collect();
    let contents_hrefs = contents_nav
        .as_ref()
        .map_or_else(Vec::new, |(_, _, html)| core::anchor_hrefs(html));
    let contents_labels: Vec<String> =
        contents_nav.as_ref().map_or_else(Vec::new, |(_, _, html)| {
            re(r"<a\b[^>]*>(.*?)</a\s*>", S | I)
                .findall(html)
                .iter()
                .map(|l| core::visible_text(l))
                .collect()
        });
    let expected_labels: Vec<&str> = ASSURANCE_ANCHORS.iter().map(|(_, h)| *h).collect();
    let ordered = match (&short_answer, &contents_nav, &first_heading) {
        (Some(short), Some(nav), Some(first)) => nav.0 >= short.1 && nav.1 <= first.0,
        _ => false,
    };
    if !ordered
        || contents_hrefs != expected_hrefs
        || contents_labels != expected_labels
        || !anchored_ok
    {
        failures.push(
            "evidence/index.html: contents navigator does not match assurance headings".into(),
        );
    }

    for path in glob_children(root, "tools", "index.html") {
        let rel = core::rel(&path, root);
        if NOT_INDEXED.contains(&rel.as_str()) {
            continue;
        }
        let hrefs = core::anchor_hrefs(&core::visible_html(&crate::read(&path)?));
        if !hrefs.iter().any(|h| h == "/evidence/") {
            failures.push(format!("{rel}: no visible link to /evidence/"));
        }
    }

    let mcp_html = read_if_file(&site_path(root, MCP_REL))?;
    let rendered_mcp = core::visible_html(&mcp_html);
    failures.extend(check_mcp_review_dates(&mcp_html));
    if !core::anchor_hrefs(&rendered_mcp)
        .iter()
        .any(|h| h == AUS_ACCOUNTING_PYPI)
    {
        failures.push(format!("{MCP_REL}: no visible PyPI route"));
    }
    let uncommented = re(r"<!--.*?-->", S).sub(" ", &mcp_html);
    let ld_text = json_ld_text(&uncommented, MCP_REL, &mut failures);
    let first_release = re(r"\bfirst\s+pypi\s+release\b", I);
    if first_release.is_match(&core::visible_text(&rendered_mcp))
        || first_release.is_match(&ld_text)
    {
        failures.push(format!("{MCP_REL}: stale first-PyPI-release claim"));
    }
    Ok(failures)
}

/// Keep the three missing-receipt branches accurate without freezing prose.
pub fn check_payday_receipt_boundary(html: &str) -> Vec<String> {
    let mut failures = Vec::new();
    let visible = strip_non_rendered(html);
    let paragraphs: Vec<String> = re(r"<p\b[^>]*>.*?</p>", S | I)
        .findall(&visible)
        .iter()
        .map(|p| core::visible_text(p))
        .collect();
    let text = paragraphs.join(" ");
    let categorical = concat!(
        r"\b(?:without|missing|no)\b.{0,80}\b(?:fund[- ]?)?receipt(?:\s+date|\s+evidence)?\b",
        r".{0,80}\b(?:can|will)\s+only\b.{0,40}\b(?:at[-_ ]risk|unknown)\b"
    );
    if re(categorical, S | I).is_match(&text) {
        failures.push("tools/payday-super/index.html: must not say a missing receipt can only be at-risk or unknown".into());
    }
    let boundary = [
        concat!(
            r"\b(?:without|missing|no)\b.{0,80}\b(?:fund[- ]?)?receipt(?:\s+date|\s+evidence)?\b",
            r".{0,100}\b(?:cannot|can't|does\s+not|doesn't)\b.{0,40}\bprov\w*\b",
            r".{0,30}\bon[-_ ]time\b"
        ),
        r"\bremittance\s+tim\w*\b.{0,80}\bprov\w*\b.{0,30}\blate\b",
        concat!(
            r"\btimely\s+remittance\b.{0,80}\bwithout\b.{0,50}",
            r"\b(?:fund[- ]?)?receipt(?:\s+date|\s+evidence)?\b.{0,80}",
            r"\b(?:remain\w*|stay\w*|is)\b.{0,30}\bat[-_ ]risk\b"
        ),
    ];
    if !paragraphs
        .iter()
        .any(|p| boundary.iter().all(|b| re(b, S | I).is_match(p)))
    {
        failures.push("tools/payday-super/index.html: no visible paragraph says missing receipt cannot prove on-time, remittance timing can prove late and timely remittance without receipt remains at-risk".into());
    }
    failures
}

const MONTH_NAMES: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// `attribute != expected`, where an absent attribute is `None`.
fn attr_eq(attribute: Option<&str>, expected: &Json) -> bool {
    match (attribute, expected) {
        (None, Json::Null) => true,
        (Some(a), Json::Str(e)) => a == e,
        _ => false,
    }
}

/// Compare the fixed, visible example with its pinned engine-run record.
pub fn check_payday_example(html: &str, record: &Json) -> Vec<String> {
    let mut failures = Vec::new();
    let tree = core::parse_structure(html);
    let fields = rendered(&tree, None);
    for key in [
        "employee_id",
        "payment_date",
        "sg_amount",
        "remitted_date",
        "fund_received_date",
        "first_contribution",
        "out_of_cycle",
        "as_at",
        "expected_due_date",
        "expected_verdict",
        "tag",
        "commit",
        "fixture_blob_sha",
        "fixture_sha256",
        "wheel_sha256",
    ] {
        let matches: Vec<usize> = fields
            .iter()
            .copied()
            .filter(|e| tree.attr(*e, "data-example") == Some(key))
            .collect();
        let Some(expected) = record.get(key).filter(|_| matches.len() == 1) else {
            failures.push(format!("fixed Payday example: missing or repeated {key}"));
            continue;
        };
        let actual = tree.text(matches[0]);
        if [
            "payment_date",
            "remitted_date",
            "as_at",
            "expected_due_date",
        ]
        .contains(&key)
        {
            let visible = py::Date::fromisoformat(&expected.py_str()).map_or_else(
                || "invalid recorded date".to_owned(),
                |d| {
                    format!(
                        "{} {} {:04}",
                        d.day,
                        MONTH_NAMES[d.month as usize - 1],
                        d.year
                    )
                },
            );
            if actual != visible || !attr_eq(tree.attr(matches[0], "datetime"), expected) {
                failures.push(format!("fixed Payday example: date drift for {key}"));
            }
            continue;
        }
        let expected = match key {
            "sg_amount" => Json::Str(format!("${}", expected.py_str())),
            "fund_received_date" if *expected == Json::Null => s("no date recorded"),
            "first_contribution" | "out_of_cycle" => match expected {
                Json::Bool(b) => s(if *b { "yes" } else { "no" }),
                _ => {
                    failures.push(format!("fixed Payday example: non-boolean pathway {key}"));
                    continue;
                }
            },
            _ => expected.clone(),
        };
        if !Json::Str(actual).py_eq(&expected) {
            failures.push(format!("fixed Payday example: value drift for {key}"));
        }
    }
    let links = core::anchor_hrefs(html);
    for key in ["fixture_url", "release_url"] {
        let present = match record.get(key) {
            Some(Json::Str(value)) => links.contains(value),
            _ => false,
        };
        if !present {
            failures.push(format!("fixed Payday example: missing pinned {key}"));
        }
    }
    failures
}

/// Keep each synthetic example visible and tied to tagged test evidence.
pub fn check_worked_examples(root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    for example in &WORKED_EXAMPLES {
        let rel = example.rel;
        let html = crate::read(&site_path(root, rel))?;
        let visible = strip_non_rendered(&html);
        let heading = re(
            r"<h([1-6])\b[^>]*>.*?\bsynthetic\s+worked\s+example\b.*?</h\1>",
            S | I,
        )
        .search(&visible)
        .map(|m| {
            let whole = m.get(0).expect("group 0");
            (whole.start(), whole.end())
        });
        let example_html = match heading {
            None => {
                failures.push(format!(
                    "{rel}: no visible Synthetic worked example heading"
                ));
                String::new()
            }
            Some((start, end)) => {
                let next = re(r"<h[1-6]\b", I)
                    .search(&visible[end..])
                    .map(|m| m.get(0).expect("group 0").start());
                let stop = next.map_or(visible.len(), |n| end + n);
                visible[start..stop].to_owned()
            }
        };
        let example_text = core::visible_text(&example_html);
        for url in example.fixture_urls {
            if !re(
                &format!(r#"<a\b[^>]*href="{}"[^>]*>"#, pyre::escape(url)),
                I,
            )
            .is_match(&example_html)
            {
                failures.push(format!("{rel}: no visible tagged fixture link to {url}"));
            }
        }
        if re(r#"href="[^"]*github\.com/[^"]*/blob/main/"#, I).is_match(&example_html) {
            failures.push(format!(
                "{rel}: worked-example evidence must not use an unpinned main URL"
            ));
        }
        for (label, pattern) in example.labels {
            if !re(pattern, I).is_match(&example_text) {
                failures.push(format!(
                    "{rel}: visible worked example does not label {label}"
                ));
            }
        }
        if rel == "tools/payday-super/index.html" {
            failures.extend(check_payday_receipt_boundary(&html));
            let record_path = site_path(root, "tools/payday-super/example-provenance.json");
            let record = crate::read(&record_path).and_then(|text| {
                pyjson::loads(&text)
                    .map_err(|e| e.to_string())
                    .and_then(|value| match value {
                        Json::Object(_) => Ok(value),
                        _ => Err("expected an object".into()),
                    })
            });
            match record {
                Err(error) => failures.push(format!(
                    "fixed Payday example: invalid provenance record: {error}"
                )),
                Ok(record) => failures.extend(check_payday_example(&html, &record)),
            }
        }
    }
    Ok(failures)
}

/// The sole visible evaluator article within the sole main#main.
pub fn evaluation_article_html(
    rendered_html: &str,
    rel: &str,
    failures: &mut Vec<String>,
) -> Option<String> {
    let tree = core::parse_structure(rendered_html);
    let mains = rendered(&tree, Some("main"));
    if mains.len() != 1 {
        failures.push(format!(
            "{rel}: expected exactly one visible main, found {}",
            mains.len()
        ));
        return None;
    }
    if tree.attr(mains[0], "id") != Some("main") {
        failures.push(format!(
            "{rel}: visible main id must be 'main', found {}",
            Val::from(tree.attr(mains[0], "id")).repr()
        ));
        return None;
    }
    let articles = rendered(&tree, Some("article"));
    let contained = articles
        .iter()
        .filter(|a| tree.is_descendant(**a, mains[0]))
        .count();
    if contained != 1 {
        failures.push(format!(
            "{rel}: main#main must contain exactly one visible evaluator article, found {contained}"
        ));
        return None;
    }
    if articles.len() != 1 {
        failures.push(format!(
            "{rel}: expected exactly one visible evaluator article, found {}",
            articles.len()
        ));
        return None;
    }
    match re(r"<article\b[^>]*>.*?</article\s*>", S | I).search(rendered_html) {
        None => {
            failures.push(format!(
                "{rel}: could not isolate the visible evaluator article"
            ));
            None
        }
        Some(m) => Some(m[0].to_owned()),
    }
}

/// Require the evaluator's body sections, headings, order and assurance link.
pub fn check_evaluation_structure(
    rendered_html: &str,
    rel: &str,
    expected: &EvaluationPack,
    failures: &mut Vec<String>,
) {
    let tree = core::parse_structure(rendered_html);
    let configured: Vec<&str> = expected.sections.iter().map(|(i, _)| *i).collect();
    let sections = rendered(&tree, Some("section"));
    let actual: Vec<&str> = sections
        .iter()
        .map(|e| tree.attr(*e, "id").unwrap_or(""))
        .collect();
    if actual != configured {
        failures.push(format!(
            "{rel}: evaluation section order must be {}, found {}",
            repr_list(configured.iter().copied()),
            repr_list(actual)
        ));
    }
    let by_id = |identifier: &str| -> Vec<usize> {
        sections
            .iter()
            .copied()
            .filter(|e| tree.attr(*e, "id") == Some(identifier))
            .collect()
    };
    for (identifier, heading) in expected.sections {
        let matches = by_id(identifier);
        if matches.len() != 1 {
            failures.push(format!(
                "{rel}: section #{identifier} must appear exactly once, found {}",
                matches.len()
            ));
            continue;
        }
        let headings = tree.descendants(matches[0], Some("h2"), true);
        let actual = if headings.len() == 1 {
            tree.text(headings[0])
        } else {
            String::new()
        };
        if actual != *heading {
            failures.push(format!(
                "{rel}: #{identifier} heading must be {}, found {}",
                py::repr_str(heading),
                py::repr_str(&actual)
            ));
        }
    }
    // sections_by_id holds only configured IDs; .get("limitations", []) is empty otherwise.
    let limitations = if configured.contains(&"limitations") {
        by_id("limitations")
    } else {
        vec![]
    };
    let mut count = 0;
    if limitations.len() == 1 {
        count = tree
            .descendants(limitations[0], Some("a"), true)
            .into_iter()
            .filter(|a| {
                tree.attr(*a, "href") == Some("/evidence/")
                    && tree.text(*a) == "Evidence and Assurance"
            })
            .count();
    }
    if count != 1 {
        failures.push(format!(
            "{rel}: #limitations must link /evidence/ with visible label 'Evidence and Assurance' exactly once, found {count}"
        ));
    }
}

/// Keep evaluator pages tied to immutable fabricated evidence.
pub fn check_evaluation_packs(root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let listed = core::sitemap_urls(root)?;
    let llms = crate::read(&root.join("llms.txt"))?;
    for expected in &EVALUATION_PACKS {
        let rel = expected.rel;
        let url = expected.url;
        let sitemap_count = listed.iter().filter(|u| *u == url).count();
        if sitemap_count != 1 {
            failures.push(format!(
                "sitemap.xml: evaluation URL {url} must appear once, found {sitemap_count}"
            ));
        }
        if let Some(lastmod) = expected.sitemap_lastmod {
            let actual = core::sitemap_lastmods(url, root)?;
            if actual != [lastmod] {
                failures.push(format!(
                    "sitemap.xml: evaluation URL {url} must have lastmod {} exactly once, found {}",
                    py::repr_str(lastmod),
                    repr_list(&actual)
                ));
            }
        }
        let route_section = core::markdown_section(&llms, LLMS_ROUTE_SECTION);
        let llms_count = llms.replace(&route_section, "").matches(url).count();
        if llms_count != 1 {
            let suffix = if expected.llms_section.is_some() {
                " globally"
            } else {
                ""
            };
            failures.push(format!(
                "llms.txt: evaluation URL {url} must appear once{suffix}, found {llms_count}"
            ));
        }
        if let Some(section) = expected.llms_section {
            let count = core::markdown_section(&llms, section).matches(url).count();
            if count != 1 {
                failures.push(format!(
                    "llms.txt: evaluation URL {url} must appear once in ## {section}, found {count}"
                ));
            }
        }
        let path = site_path(root, rel);
        if !path.is_file() {
            failures.push(format!("{rel}: evaluation page does not exist"));
            continue;
        }
        let html = crate::read(&path)?;
        let blocks = core::json_ld_blocks(&html, rel, &mut failures);
        let nodes: Vec<&Json> = blocks.iter().flat_map(core::nodes).collect();
        let articles: Vec<&&Json> = nodes
            .iter()
            .filter(|n| core::has_type(n, "TechArticle"))
            .collect();
        if articles.len() != 1 || !eq(articles[0].get("author"), &person_ref()) {
            failures.push(format!(
                "{rel}: TechArticle must be authored by the canonical Person"
            ));
        }
        let visible = core::visible_html(&html);
        let Some(article) = evaluation_article_html(&visible, rel, &mut failures) else {
            continue;
        };
        let text = core::visible_text(&article);
        let hrefs = core::anchor_hrefs(&article);
        check_evaluation_structure(&article, rel, expected, &mut failures);
        for label in expected.version_labels {
            if !text.contains(label) {
                failures.push(format!(
                    "{rel}: missing visible version label {}",
                    py::repr_str(label)
                ));
            }
        }
        if text.contains("v0.1.0") {
            failures.push(format!(
                "{rel}: visible evaluator text must not name v0.1.0"
            ));
        }
        for contract in expected.contract_text {
            if !text.contains(contract) {
                failures.push(format!(
                    "{rel}: missing visible contract text {}",
                    py::repr_str(contract)
                ));
            }
        }
        for (section_id, required) in expected.section_contract_text {
            let section_text = core::visible_text(&core::section_html(&article, section_id));
            for required in *required {
                if !section_text.contains(required) {
                    failures.push(format!(
                        "{rel}: #{section_id} missing visible contract text {}",
                        py::repr_str(required)
                    ));
                }
            }
        }
        for (section_id, configured) in [
            ("versions", expected.product_evidence_urls),
            ("primary-sources", expected.primary_source_urls),
        ] {
            let actual = core::anchor_hrefs(&core::section_html(&article, section_id));
            let configured: Vec<String> = configured.iter().map(|s| (*s).to_owned()).collect();
            let missing = counter_sub(&configured, &actual);
            let unexpected = counter_sub(&actual, &configured);
            if !missing.is_empty() || !unexpected.is_empty() {
                failures.push(format!(
                    "{rel}: #{section_id} evidence hrefs must match exactly once; missing {}; unexpected {}",
                    repr_list(&missing),
                    repr_list(&unexpected)
                ));
            }
        }
        let repository = py::casefold(expected.product_repository);
        let repository = repository
            .strip_prefix("https://")
            .unwrap_or(&repository)
            .to_owned();
        let product_hrefs: Vec<String> = hrefs
            .iter()
            .filter(|h| py::casefold(h).contains(&repository))
            .cloned()
            .collect();
        let mut global: Vec<String> = expected
            .product_evidence_urls
            .iter()
            .map(|s| (*s).to_owned())
            .collect();
        global.extend(
            expected
                .primary_source_urls
                .iter()
                .filter(|h| py::casefold(h).contains(&repository))
                .map(|s| (*s).to_owned()),
        );
        let commit = expected.permanent_commit;
        let version_hrefs = core::anchor_hrefs(&core::section_html(&article, "versions"));
        for href in &product_hrefs {
            if !version_hrefs.contains(href) {
                continue;
            }
            if py::casefold(href).contains("/blob/main/") {
                failures.push(format!(
                    "{rel}: product evidence URL must not use /blob/main/: {href}"
                ));
            }
            if let Some(m) = re(r"/(?:blob|tree)/([^/]+)/", I).search(href) {
                if !re(r"\A[0-9a-f]{40}\Z", I).is_match(&m[1]) {
                    failures.push(format!(
                        "{rel}: product evidence URL must contain a 40-character commit: {href}"
                    ));
                } else if &m[1] != commit {
                    failures.push(format!(
                        "{rel}: product evidence URL commit must be {commit}: {href}"
                    ));
                }
            }
        }
        let missing = counter_sub(&global, &product_hrefs);
        let unexpected = counter_sub(&product_hrefs, &global);
        if !missing.is_empty() || !unexpected.is_empty() {
            failures.push(format!(
                "{rel}: {}; missing {}; unexpected {}",
                expected.product_evidence_contract,
                repr_list(&missing),
                repr_list(&unexpected)
            ));
        }
        let reproduce = core::section_html(&article, "reproduce");
        let code_blocks = re(r"<code\b[^>]*>(.*?)</code\s*>", S | I).findall(&reproduce);
        if code_blocks.len() != 1 {
            failures.push(format!(
                "{rel}: #reproduce must contain exactly one visible code block, found {}",
                code_blocks.len()
            ));
        } else {
            let recipe = unescape(&code_blocks[0])
                .replace("\r\n", "\n")
                .replace('\r', "\n");
            let mut lines: Vec<&str> = recipe
                .split('\n')
                .map(|l| l.trim_end_matches(py::is_space))
                .collect();
            while lines.last().is_some_and(|l| l.is_empty()) {
                lines.pop();
            }
            let configured = expected.reproduction_recipe;
            if lines.len() != configured.len() {
                failures.push(format!(
                    "{rel}: #reproduce must contain the configured {}-line recipe, found {} lines",
                    configured.len(),
                    lines.len()
                ));
            } else if let Some((number, (actual, wanted))) = lines
                .iter()
                .zip(configured)
                .enumerate()
                .find(|(_, (a, w))| a != w)
            {
                failures.push(format!(
                    "{rel}: #reproduce line {} must be {}, found {}",
                    number + 1,
                    py::repr_str(wanted),
                    py::repr_str(actual)
                ));
            }
        }
        if !hrefs.iter().any(|h| h == "/evidence/") {
            failures.push(format!("{rel}: no visible link to /evidence/"));
        }
        if re(r"\bcase[- ]stud(?:y|ies)\b", I).is_match(&article) {
            failures.push(format!("{rel}: must not use client case-study wording"));
        }
    }
    Ok(failures)
}

/// Keep the Xero proof summary concise, complete and review bounded.
pub fn check_xero_evaluation_summary(root: &Path) -> Result<Vec<String>, String> {
    let rel = "evaluate/xero-trial-balance-integrity/index.html";
    let incomplete = || Ok(vec![format!("{rel}: evaluation summary is incomplete")]);
    let path = site_path(root, rel);
    if !path.is_file() {
        return incomplete();
    }
    let rendered_html = core::visible_html(&crate::read(&path)?);
    let summaries = re(
        concat!(
            r#"<dl\b(?=[^>]*\bclass\s*=\s*["\'][^"\']*\bevaluation-summary\b"#,
            r#"[^"\']*["\'])[^>]*>.*?</dl\s*>"#
        ),
        S | I,
    )
    .findall(&rendered_html);
    let required = [
        "Problem An automated trial balance export can look tidy while one balance pair is wrong.",
        "Control Check movement and year-to-date debits against credits before any CSV write.",
        "Evidence Three fictional fixtures isolate a passing file, a movement failure and a YTD failure.",
        "Result One run exits 0. Two runs exit 1 and report that nothing was written.",
        "Limit Balance does not prove completeness, classification or approval.",
    ];
    if summaries.len() != 1 {
        return incomplete();
    }
    let text = core::visible_text(&summaries[0]);
    if required.iter().any(|r| !text.contains(r)) {
        return incomplete();
    }
    Ok(vec![])
}

/// Allow retrieval and open-web crawl while retaining named training blocks.
pub fn check_robots_policy(robots: &str) -> Vec<String> {
    let mut failures = Vec::new();
    if CRAWLER_POLICY_COMMENTS.iter().any(|c| !robots.contains(c)) {
        failures.push("robots.txt: missing written search-versus-training policy".into());
    }
    let groups = core::robots_groups(robots);
    // shortcut: Python builds this from sets, so its order varies with the process's hash
    // seed; the listing order here is one fixed choice among the orders Python can print.
    // Compare order-independently if a check compares this listing with Python's.
    let mut expected: Vec<(&str, &str)> = vec![("*", "Allow: /")];
    expected.extend(RETRIEVAL_CRAWLERS.iter().map(|a| (*a, "Allow: /")));
    expected.extend(ALLOWED_TRAINING_CRAWLERS.iter().map(|a| (*a, "Allow: /")));
    expected.extend(
        BLOCKED_TRAINING_CRAWLERS
            .iter()
            .map(|a| (*a, "Disallow: /")),
    );
    for (agent, directive) in &expected {
        let actual = groups.iter().find(|(a, _)| a == agent).map(|(_, d)| d);
        if actual.is_none_or(|d| d.len() != 1 || d[0] != *directive) {
            failures.push(format!(
                "robots.txt: {agent} must have exactly {}, found {}",
                repr_list([*directive]),
                actual.map_or_else(|| "None".to_owned(), repr_list)
            ));
        }
    }
    let mut unexpected: Vec<&str> = groups
        .iter()
        .map(|(a, _)| a.as_str())
        .filter(|a| !expected.iter().any(|(e, _)| e == a))
        .collect();
    unexpected.sort();
    if !unexpected.is_empty() {
        failures.push(format!(
            "robots.txt: unclassified crawler groups are not allowed: {}",
            unexpected.join(", ")
        ));
    }
    failures
}

/// Require each collection hub's visible register and ItemList to agree.
pub fn check_collection_hubs(root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    for hub in &COLLECTION_HUBS {
        let rel = hub.rel;
        let path = site_path(root, rel);
        if !path.is_file() {
            failures.push(format!("{rel}: missing collection hub"));
            continue;
        }
        let html = crate::read(&path)?;
        let tree = core::parse_structure(&html);
        let h1s = rendered(&tree, Some("h1"));
        if h1s.len() != 1 || tree.text(h1s[0]) != hub.h1 {
            failures.push(format!(
                "{rel}: collection H1 must be {}",
                py::repr_str(hub.h1)
            ));
        }
        let registers = rendered_with_class(&tree, Tree::ROOT, None, "collection-register");
        if registers.len() != 1 {
            failures.push(format!(
                "{rel}: expected one collection register, found {}",
                registers.len()
            ));
        } else {
            let mut actual: Vec<(Option<&str>, String)> = Vec::new();
            for row in rendered_with_class(&tree, registers[0], None, "collection-entry") {
                let titles = rendered_with_class(&tree, row, Some("a"), "collection-entry__title");
                if titles.len() == 1 {
                    actual.push((tree.attr(titles[0], "href"), tree.text(titles[0])));
                }
            }
            let same = actual.len() == hub.entries.len()
                && actual
                    .iter()
                    .zip(hub.entries)
                    .all(|((h, t), (eh, et))| *h == Some(*eh) && t == et);
            if !same {
                failures.push(format!(
                    "{rel}: collection entries are {}, expected {}",
                    repr_list(actual),
                    repr_list(hub.entries.iter().copied())
                ));
            }
        }
        let mut parse_failures = Vec::new();
        let blocks = core::json_ld_blocks(&html, rel, &mut parse_failures);
        let nodes: Vec<&Json> = blocks.iter().flat_map(core::nodes).collect();
        failures.extend(parse_failures);
        let webpages: Vec<&&Json> = nodes
            .iter()
            .filter(|n| core::has_type(n, "WebPage"))
            .collect();
        let item_lists: Vec<&&Json> = nodes
            .iter()
            .filter(|n| core::has_type(n, "ItemList"))
            .collect();
        if webpages.len() != 1 {
            failures.push(format!("{rel}: expected exactly one WebPage in JSON-LD"));
        } else {
            for field in ["author", "publisher"] {
                if !eq(webpages[0].get(field), &person_ref()) {
                    failures.push(format!(
                        "{rel}: WebPage {field} must reference the canonical Person"
                    ));
                }
            }
        }
        if item_lists.len() != 1 {
            failures.push(format!("{rel}: expected exactly one ItemList in JSON-LD"));
            continue;
        }
        let expected_structured = Json::Array(
            hub.entries
                .iter()
                .enumerate()
                .map(|(i, (href, name))| {
                    obj(vec![
                        ("@type", s("ListItem")),
                        ("position", int(i + 1)),
                        ("name", s(name)),
                        ("url", s(&format!("{SITE}{href}"))),
                    ])
                })
                .collect(),
        );
        if !eq(item_lists[0].get("numberOfItems"), &int(hub.entries.len())) {
            failures.push(format!(
                "{rel}: ItemList count does not match visible entries"
            ));
        }
        if !eq(item_lists[0].get("itemListElement"), &expected_structured) {
            failures.push(format!(
                "{rel}: ItemList entries do not match the visible register"
            ));
        }
    }
    Ok(failures)
}

/// Exact identity URL policy violations found in public text.
pub fn forbidden_identity_url_labels(text: &str) -> Result<Vec<&'static str>, String> {
    let mut labels: Vec<&'static str> = Vec::new();
    for m in re(r#"https://[^\s"'<>]+"#, 0).findall(text) {
        let candidate = m.trim_end_matches(|c| "),.;:`]}".contains(c));
        let parts = pyurl::urlsplit(candidate)?;
        let host = pyurl::hostname(&parts.netloc)
            .unwrap_or_default()
            .to_lowercase();
        if host == "ryanduguid.github.io" && !labels.contains(&"retired github.io canonical URL") {
            labels.push("retired github.io canonical URL");
        }
        if (host == "linkedin.com" || host == "www.linkedin.com")
            && parts.path.trim_end_matches('/') == "/in/ryanduguid"
            && !labels.contains(&"unhyphenated US namesake URL")
        {
            labels.push("unhyphenated US namesake URL");
        }
    }
    labels.sort();
    Ok(labels)
}

/// Require five reproducible OLED register cards and their provenance.
pub fn check_social_cards(root: &Path) -> Result<Vec<String>, String> {
    check_social_cards_for(root, HOMEPAGE_HEADING)
}

/// check_social_cards against a given homepage headline (the tests patch HOMEPAGE_HEADING).
pub fn check_social_cards_for(root: &Path, homepage_heading: &str) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    if social_card("site").heading.join(" ") != homepage_heading {
        failures.push("site social card must match the homepage headline".into());
    }
    let template_path = root.join("assets").join("social-card-template.svg");
    if !template_path.is_file() {
        failures.push("assets/social-card-template.svg: missing editable card template".into());
    } else {
        let template_text = crate::read(&template_path)?;
        match roxmltree::Document::parse(&template_text) {
            Err(_) => failures.push(
                "assets/social-card-template.svg: editable card template is invalid SVG".into(),
            ),
            Ok(document) => {
                let svg = document.root_element();
                let (width, height) = SOCIAL_CARD_DIMENSIONS;
                if svg.tag_name().name() != "svg"
                    || svg.attribute("width") != Some(width.to_string().as_str())
                    || svg.attribute("height") != Some(height.to_string().as_str())
                    || svg.attribute("viewBox") != Some(format!("0 0 {width} {height}").as_str())
                {
                    failures.push(
                        "assets/social-card-template.svg: template dimensions changed".into(),
                    );
                }
                let elements: Vec<roxmltree::Node<'_, '_>> =
                    svg.descendants().filter(|n| n.is_element()).collect();
                let mut fills: Vec<String> = elements
                    .iter()
                    .filter_map(|e| e.attribute("fill"))
                    .map(py::casefold)
                    .collect();
                fills.sort();
                fills.dedup();
                let mut colours: Vec<String> = SOCIAL_CARD_COLOURS
                    .iter()
                    .map(|c| (*c).to_owned())
                    .collect();
                colours.sort();
                if fills != colours {
                    failures.push(
                        "assets/social-card-template.svg: OLED palette is incomplete or changed"
                            .into(),
                    );
                }
                if elements.iter().any(|e| e.tag_name().name() == "image") {
                    failures.push(
                        "assets/social-card-template.svg: template must not contain portrait imagery".into(),
                    );
                }
            }
        }
        let mut missing: Vec<&str> = SOCIAL_CARD_TEMPLATE_PLACEHOLDERS
            .iter()
            .copied()
            .filter(|p| !template_text.contains(p))
            .collect();
        missing.sort();
        if !missing.is_empty() {
            failures.push(format!(
                "assets/social-card-template.svg: missing renderer placeholders {}",
                repr_list(missing)
            ));
        }
    }

    let data_path = root.join("assets").join("social-cards.json");
    let mut configured = Json::Object(vec![]);
    if !data_path.is_file() {
        failures.push("assets/social-cards.json: missing social-card data".into());
    } else {
        let bytes = std::fs::read(&data_path)
            .map_err(|e| py::oserror_str(&e, &data_path.to_string_lossy(), py::OsStyle::Errno))?;
        match py::decode_utf8(&bytes)
            .ok()
            .and_then(|text| pyjson::loads(&py::universal_newlines(&text)).ok())
        {
            Some(value) => configured = value,
            None => {
                failures.push("assets/social-cards.json: social-card data is invalid JSON".into())
            }
        }
    }
    let expected_data = Json::Object(
        SOCIAL_CARD_CONTEXTS
            .iter()
            .map(|card| {
                (
                    card.id.to_owned(),
                    obj(vec![
                        ("label", s(card.label)),
                        ("heading", string_list(card.heading)),
                        ("host", s(card.host)),
                        ("output", s(card.output)),
                        (
                            "alt",
                            s(&format!("OLED register card: {}", card.heading.join(" "))),
                        ),
                    ]),
                )
            })
            .collect(),
    );
    if !configured.py_eq(&expected_data) {
        failures
            .push("assets/social-cards.json: social-card context copy or mapping is stale".into());
    }

    let readme_path = root.join("README.md");
    let readme = if readme_path.is_file() {
        crate::read(&readme_path)?
    } else {
        String::new()
    };
    let readme_lines = py::splitlines(&readme);
    for card in &SOCIAL_CARD_CONTEXTS {
        let asset_rel = format!("assets/{}", card.output);
        let card_path = root.join("assets").join(card.output);
        let mut bytes: Option<Vec<u8>> = None;
        if !card_path.is_file() {
            failures.push(format!("{asset_rel}: missing social card"));
        } else {
            let data = std::fs::read(&card_path).map_err(|e| {
                py::oserror_str(&e, &card_path.to_string_lossy(), py::OsStyle::Errno)
            })?;
            if data.len() < 24 || !data.starts_with(b"\x89PNG\r\n\x1a\n") {
                failures.push(format!("{asset_rel}: social card is not PNG"));
            } else {
                let width = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
                let height = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
                if (width, height) != SOCIAL_CARD_DIMENSIONS {
                    failures.push(format!("{asset_rel}: social card dimensions changed"));
                }
            }
            if data.len() >= SOCIAL_CARD_MAX_BYTES {
                failures.push(format!(
                    "{asset_rel}: social card must be under 50,000 bytes"
                ));
            }
            bytes = Some(data);
        }
        let marker = format!("`{asset_rel}`");
        let Some(row) = readme_lines.iter().find(|l| l.contains(&marker)) else {
            failures.push(format!("README.md: missing provenance for {asset_rel}"));
            continue;
        };
        if let Some(data) = bytes
            && !row.contains(&crate::sha256(&data))
        {
            failures.push(format!("README.md: stale checksum for {asset_rel}"));
        }
    }
    let shared = readme_lines
        .iter()
        .find(|l| l.starts_with("Every card below shares one provenance record."))
        .copied()
        .unwrap_or("");
    for required in [
        "assets/social-card-template.svg",
        "assets/social-cards.json",
        "Apache-2.0",
        "Playwright 1.63.0",
        "Chromium",
        "device scale 1",
        "Refresh when",
    ] {
        if !shared.contains(required) {
            failures.push(format!(
                "README.md: social-card provenance omits {required}"
            ));
        }
    }
    Ok(failures)
}

/// Reject the retired site host and the US namesake's LinkedIn URL.
pub fn check_canonical_identity_urls(
    paths: &[PathBuf],
    root: &Path,
) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let mut checked: Vec<PathBuf> = paths.to_vec();
    for name in ["README.md", "llms.txt", "robots.txt", "sitemap.xml"] {
        checked.push(root.join(name));
    }
    for path in checked {
        if !path.is_file() {
            continue;
        }
        let rel = core::rel(&path, root);
        let text = crate::read(&path)?;
        for label in forbidden_identity_url_labels(&text)? {
            failures.push(format!("{rel}: contains the {label}"));
        }
    }
    Ok(failures)
}

/// Keep the five starting routes identical for readers and for engines.
pub fn check_task_routes(root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let expected: Vec<(&str, &str)> = TASK_ROUTE_ENTRIES
        .iter()
        .map(|(l, p, _)| (*l, *p))
        .collect();
    let tools_html = read_if_file(&site_path(root, TASK_ROUTES_REL))?;
    let tree = core::parse_structure(&tools_html);
    let navs = rendered_with_class(&tree, Tree::ROOT, Some("nav"), "task-routes");
    if navs.len() != 1 {
        failures.push(format!(
            "{TASK_ROUTES_REL}: expected one .task-routes nav, found {}",
            navs.len()
        ));
    } else {
        let actual: Vec<(String, Option<&str>)> = tree
            .descendants(navs[0], Some("a"), true)
            .into_iter()
            .map(|a| {
                let labels = tree.descendants(a, Some("strong"), true);
                (
                    labels.first().map_or_else(String::new, |l| tree.text(*l)),
                    tree.attr(a, "href"),
                )
            })
            .collect();
        let same = actual.len() == expected.len()
            && actual
                .iter()
                .zip(&expected)
                .all(|((l, h), (el, eh))| l == el && *h == Some(*eh));
        if !same {
            failures.push(format!(
                "{TASK_ROUTES_REL}: task routes are {}, expected {}",
                repr_list(actual),
                repr_list(expected.iter().copied())
            ));
        }
    }
    let llms = read_if_file(&root.join("llms.txt"))?;
    let route_section = core::markdown_section(&llms, LLMS_ROUTE_SECTION);
    for (label, primary) in &expected {
        let entry = format!("- **{label}** ({SITE}{primary}):");
        if route_section.matches(&entry).count() != 1 {
            failures.push(format!(
                "llms.txt: ## {LLMS_ROUTE_SECTION} must route {} to {SITE}{primary} exactly once",
                py::repr_str(label)
            ));
        }
    }
    let home = read_if_file(&root.join("index.html"))?;
    let mut parse_failures = Vec::new();
    let mut listed: Vec<(Option<Json>, Option<Json>)> = Vec::new();
    for block in core::json_ld_blocks(&home, "index.html", &mut parse_failures) {
        for node in core::nodes(&block) {
            if !eq(node.get("@id"), &s(&format!("{SITE}/#home-preview"))) {
                continue;
            }
            // `for item in node.get("itemListElement", [])` over whatever JSON is there.
            let items: Vec<&Json> = match node.get("itemListElement") {
                None => vec![],
                Some(Json::Array(items)) => items.iter().collect(),
                Some(Json::Object(_) | Json::Str(_)) => vec![],
                Some(other) => {
                    return Err(format!(
                        "TypeError: '{}' object is not iterable",
                        match other {
                            Json::Null => "NoneType",
                            Json::Bool(_) => "bool",
                            Json::Int(_) => "int",
                            _ => "float",
                        }
                    ));
                }
            };
            for item in items {
                if matches!(item, Json::Object(_)) {
                    listed.push((item.get("name").cloned(), item.get("url").cloned()));
                }
            }
        }
    }
    failures.extend(parse_failures);
    let home_expected: Vec<(String, String)> = TASK_ROUTE_ENTRIES
        .iter()
        .map(|(l, p, _)| ((*l).to_owned(), format!("{SITE}{p}")))
        .collect();
    let same = listed.len() == home_expected.len()
        && listed
            .iter()
            .zip(&home_expected)
            .all(|((n, u), (en, eu))| eq(n.as_ref(), &s(en)) && eq(u.as_ref(), &s(eu)));
    if !same {
        let shown = Val::List(
            listed
                .into_iter()
                .map(|(n, u)| {
                    Val::Tuple(vec![
                        n.map_or(Val::None, Val::Json),
                        u.map_or(Val::None, Val::Json),
                    ])
                })
                .collect(),
        );
        failures.push(format!(
            "index.html: starting-route ItemList is {}",
            shown.repr()
        ));
    }
    Ok(failures)
}

/// Reject absolutes about what a delivery provider reports or transmits.
pub fn check_privacy_delivery_claims(root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    for rel in [PRIVACY_REL, "index.html", "llms.txt"] {
        let path = site_path(root, rel);
        if !path.is_file() {
            continue;
        }
        let text = crate::read(&path)?;
        for phrase in PRIVACY_FORBIDDEN_ABSOLUTES {
            if text.contains(phrase) {
                failures.push(format!(
                    "{rel}: unsupported delivery claim {}",
                    py::repr_str(phrase)
                ));
            }
        }
    }
    Ok(failures)
}
