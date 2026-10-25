//! Per-page contracts: the shell, homepage, article pattern, calculator and collection pages.
use super::*;
use crate::html::unescape;
use crate::py;
use crate::pyre::{S, re};
use crate::pyval::{Val, find, repr_list};
use crate::seo_core::{self as core, Tree};

pub fn check_homepage_contract(html: &str, failures: &mut Vec<String>) {
    let titles = re(r"<title>(.*?)</title>", S).findall(html);
    let title = (titles.len() == 1).then(|| unescape(py::strip(&titles[0])));
    if title.as_deref() != Some(HOMEPAGE_TITLE) {
        failures.push(format!(
            "index.html: homepage title is {}, expected {}",
            Val::from(title.as_deref()).repr(),
            py::repr_str(HOMEPAGE_TITLE)
        ));
    }
    let description = core::meta(html, "name", "description");
    if description.as_deref() != Some(HOMEPAGE_DESCRIPTION) {
        failures.push(format!(
            "index.html: homepage description is {}, expected {}",
            Val::from(description.as_deref()).repr(),
            py::repr_str(HOMEPAGE_DESCRIPTION)
        ));
    }
    for (property, expected) in [
        ("og:title", HOMEPAGE_TITLE),
        ("og:description", HOMEPAGE_DESCRIPTION),
    ] {
        let actual = core::meta(html, "property", property);
        if actual.as_deref() != Some(expected) {
            failures.push(format!(
                "index.html: {property} is {}, expected {}",
                Val::from(actual.as_deref()).repr(),
                py::repr_str(expected)
            ));
        }
    }
    let text = core::visible_text(html);
    for required in HOMEPAGE_REQUIRED_TEXT {
        if !text.contains(required) {
            failures.push(format!(
                "index.html: missing approved homepage text {}",
                py::repr_str(required)
            ));
        }
    }
    let tree = core::parse_structure(html);
    let h1s = rendered(&tree, Some("h1"));
    if h1s.len() != 1 || tree.text(h1s[0]) != HOMEPAGE_HEADING {
        failures.push(format!(
            "index.html: homepage H1 must be {}",
            py::repr_str(HOMEPAGE_HEADING)
        ));
    }
    let summaries = rendered_with_class(&tree, Tree::ROOT, None, "home-hero__summary");
    if summaries.len() != 1 || tree.text(summaries[0]) != HOMEPAGE_SUPPORT {
        failures.push(format!(
            "index.html: homepage support text must be {}",
            py::repr_str(HOMEPAGE_SUPPORT)
        ));
    }

    let action_groups = rendered_with_class(&tree, Tree::ROOT, Some("nav"), "home-hero__actions");
    let mut actual_actions: Vec<(Option<String>, String)> = Vec::new();
    if action_groups.len() == 1 {
        actual_actions = tree
            .descendants(action_groups[0], Some("a"), true)
            .into_iter()
            .map(|link| (tree.attr(link, "href").map(str::to_owned), tree.text(link)))
            .collect();
    }
    let expected_actions: Vec<(Option<String>, String)> = HOMEPAGE_ACTIONS
        .iter()
        .map(|(h, t)| (Some((*h).to_owned()), (*t).to_owned()))
        .collect();
    if actual_actions != expected_actions {
        failures.push(format!(
            "index.html: homepage actions are {}, expected {}",
            repr_list(actual_actions),
            repr_list(HOMEPAGE_ACTIONS)
        ));
    }

    let previews = rendered_with_class(&tree, Tree::ROOT, None, "home-tool-preview");
    let mut actual_preview: Vec<(String, Option<String>, Option<String>)> = Vec::new();
    if previews.len() == 1 {
        for entry in rendered_with_class(&tree, previews[0], None, "home-tool-preview__entry") {
            let headings = tree.descendants(entry, Some("h3"), true);
            let links = tree.descendants(entry, Some("a"), true);
            actual_preview.push((
                if headings.len() == 1 {
                    tree.text(headings[0])
                } else {
                    String::new()
                },
                links
                    .first()
                    .and_then(|l| tree.attr(*l, "href"))
                    .map(str::to_owned),
                links
                    .get(1)
                    .and_then(|l| tree.attr(*l, "href"))
                    .map(str::to_owned),
            ));
        }
    }
    let expected_preview: Vec<(String, Option<String>, Option<String>)> = HOMEPAGE_PREVIEW_ENTRIES
        .iter()
        .map(|(a, b, c)| {
            (
                (*a).to_owned(),
                Some((*b).to_owned()),
                Some((*c).to_owned()),
            )
        })
        .collect();
    if actual_preview != expected_preview {
        failures.push(format!(
            "index.html: category preview is {}, expected {}",
            repr_list(actual_preview),
            repr_list(HOMEPAGE_PREVIEW_ENTRIES)
        ));
    }

    let all_elements = rendered(&tree, None);
    for identifier in HOMEPAGE_ANCHORS {
        let count = all_elements
            .iter()
            .filter(|e| tree.attr(**e, "id") == Some(identifier))
            .count();
        if count != 1 {
            failures.push(format!(
                "index.html: expected exactly one valid #{identifier} anchor, found {count}"
            ));
        }
    }

    let visible = core::visible_html(html);
    let sequence = [
        find(&visible, "class=\"home-tool-preview"),
        find(&visible, "class=\"route-section proof-feature"),
        find(&visible, "id=\"adopt\""),
        find(&visible, "id=\"verify\""),
    ];
    if sequence.iter().any(|p| *p < 0) || !sequence.is_sorted() {
        failures.push("index.html: content order must be preview, proof, Adopt, Verify".into());
    }

    let hrefs: Vec<Option<&str>> = rendered(&tree, Some("a"))
        .into_iter()
        .map(|l| tree.attr(l, "href"))
        .collect();
    for href in HOMEPAGE_REQUIRED_HREFS {
        if !hrefs.contains(&Some(href)) {
            failures.push(format!("index.html: missing visible homepage route {href}"));
        }
    }

    let proof_features = rendered_with_class(&tree, Tree::ROOT, None, "proof-feature");
    if proof_features.len() != 1 {
        failures.push(format!(
            "index.html: expected exactly one proof feature, found {}",
            proof_features.len()
        ));
        return;
    }
    let proof_hrefs: Vec<Option<&str>> = tree
        .descendants(proof_features[0], Some("a"), true)
        .into_iter()
        .map(|l| tree.attr(l, "href"))
        .collect();
    for href in HOMEPAGE_PROOF_HREFS {
        if !proof_hrefs.contains(&Some(href)) {
            failures.push(format!(
                "index.html: proof feature is missing required link {href}"
            ));
        }
    }
}

/// Require the reusable article and local-contents pattern.
pub fn check_article_pattern(html: &str, rel: &str, failures: &mut Vec<String>) {
    let tree = core::parse_structure(html);
    let articles = rendered(&tree, Some("article"));
    if articles.len() != 1 {
        failures.push(format!("{rel}: expected exactly one article element"));
    }
    let toc_blocks: Vec<usize> = rendered(&tree, Some("nav"))
        .into_iter()
        .filter(|n| tree.attr(*n, "aria-label") == Some("On this page"))
        .collect();
    if toc_blocks.len() != 1 {
        failures.push(format!(
            "{rel}: expected exactly one On this page navigation"
        ));
        return;
    }
    let toc = toc_blocks[0];
    if articles.len() == 1 && !tree.is_descendant(toc, articles[0]) {
        failures.push(format!(
            "{rel}: On this page navigation must be inside the article"
        ));
    }
    let links = tree.descendants(toc, Some("a"), true);
    if links.is_empty() {
        failures.push(format!(
            "{rel}: On this page navigation must contain at least one local link"
        ));
        return;
    }
    let target_ids: Vec<&str> = rendered(&tree, None)
        .into_iter()
        .filter_map(|e| tree.attr(e, "id").filter(|i| !i.is_empty()))
        .collect();
    let mut valid_links = 0;
    let contract = ARTICLE_TOC_EXTERNAL_LINKS
        .iter()
        .find(|(r, _)| *r == rel)
        .map(|(_, c)| *c);
    let external_href = contract.map(|c| c.0);
    if let Some((href, label, preceding)) = contract {
        let rendered_links = rendered(&tree, Some("a"))
            .into_iter()
            .filter(|l| tree.attr(*l, "href") == Some(href))
            .count();
        if rendered_links != 1 {
            failures.push(format!(
                "{rel}: evaluator link {} must appear once across the rendered page, found {rendered_links}",
                py::repr_str(href)
            ));
        }
        let matching: Vec<usize> = links
            .iter()
            .copied()
            .filter(|l| tree.attr(*l, "href") == Some(href))
            .collect();
        if matching.len() != 1 {
            failures.push(format!(
                "{rel}: external On this page link {} must appear once with label {}, found {}",
                py::repr_str(href),
                py::repr_str(label),
                matching.len()
            ));
        } else if tree.text(matching[0]) != label {
            failures.push(format!(
                "{rel}: external On this page link {} must have label {}, found {}",
                py::repr_str(href),
                py::repr_str(label),
                py::repr_str(&tree.text(matching[0]))
            ));
        } else {
            let index = links
                .iter()
                .position(|l| *l == matching[0])
                .expect("listed");
            let previous = if index > 0 {
                tree.text(links[index - 1])
            } else {
                String::new()
            };
            if previous != preceding {
                failures.push(format!(
                    "{rel}: external On this page link {} must immediately follow {}",
                    py::repr_str(href),
                    py::repr_str(preceding)
                ));
            }
        }
    }
    for link in links {
        let href = tree.attr(link, "href").unwrap_or("");
        if Some(href) == external_href {
            continue;
        }
        if !href.starts_with('#') || !target_ids.contains(&&href[1..]) {
            failures.push(format!(
                "{rel}: local contents target does not exist: {href}"
            ));
        } else {
            valid_links += 1;
        }
    }
    if valid_links == 0 {
        failures.push(format!(
            "{rel}: On this page navigation must contain at least one valid local link"
        ));
    }
}

/// Protect the concise, tool-led About and Evidence openings.
pub fn check_approved_page_opening(html: &str, rel: &str, failures: &mut Vec<String>) {
    let expected = match rel {
        "about/index.html" => ("About Ryan Duguid", ABOUT_OPENING),
        EVIDENCE_REL => (EVIDENCE_HEADING, EVIDENCE_OPENING),
        _ => return,
    };
    let tree = core::parse_structure(html);
    let h1s = rendered(&tree, Some("h1"));
    let leads = rendered_with_class(&tree, Tree::ROOT, None, "lead-note");
    if h1s.len() != 1 || tree.text(h1s[0]) != expected.0 {
        failures.push(format!(
            "{rel}: page H1 must be {}",
            py::repr_str(expected.0)
        ));
    }
    if leads.len() != 1 || tree.text(leads[0]) != expected.1 {
        failures.push(format!(
            "{rel}: page opening must be {}",
            py::repr_str(expected.1)
        ));
    }
}

/// Keep each tool or evaluation review date visible in its page header.
pub fn check_header_review_date(html: &str, rel: &str, failures: &mut Vec<String>) {
    if !header_dated(rel) {
        return;
    }
    let tree = core::parse_structure(html);
    let headers: Vec<usize> = rendered(&tree, Some("header"))
        .into_iter()
        .filter(|e| tree.has_class(*e, "article-header") || tree.has_class(*e, "calculator-header"))
        .collect();
    let dates = rendered_with_class(&tree, Tree::ROOT, None, "page-meta");
    if headers.len() != 1 || dates.len() != 1 || !tree.is_descendant(dates[0], headers[0]) {
        failures.push(format!(
            "{rel}: Published/Last reviewed line must be in the page header"
        ));
    }
}

pub fn check_rate_table_region(html: &str, rel: &str, failures: &mut Vec<String>) {
    let tree = core::parse_structure(html);
    let tables = rendered(&tree, Some("table"));
    let labelled = |table: usize| {
        let mut ancestor = tree.parent(table);
        while let Some(a) = ancestor {
            if tree.tag(a) == "div"
                && tree.attr(a, "role") == Some("region")
                && !py::strip(tree.attr(a, "aria-label").unwrap_or("")).is_empty()
                && tree.attr(a, "tabindex") == Some("0")
            {
                return true;
            }
            ancestor = tree.parent(a);
        }
        false
    };
    if tables.is_empty() || tables.iter().any(|t| !labelled(*t)) {
        failures.push(format!(
            "{rel}: reference table is not inside a labelled keyboard-scroll region"
        ));
    }
}

/// Require one identified control and the attributes its controller relies on.
pub fn check_id_contract(
    tree: &Tree,
    identifier: &str,
    tag: &str,
    attributes: &[(&str, &str)],
    failures: &mut Vec<String>,
    present: &[&str],
) -> Option<usize> {
    let matches = tree.by_id(identifier);
    if matches.len() != 1 {
        failures.push(format!(
            "{CALCULATOR_REL}: expected exactly one #{identifier}, found {}",
            matches.len()
        ));
        return None;
    }
    let element = matches[0];
    if tree.tag(element) != tag {
        failures.push(format!(
            "{CALCULATOR_REL}: #{identifier} must be {tag}, found {}",
            tree.tag(element)
        ));
        return Some(element);
    }
    for (name, expected) in attributes {
        let actual = tree.attr(element, name);
        if actual != Some(*expected) {
            failures.push(format!(
                "{CALCULATOR_REL}: #{identifier} {name} must be {}, found {}",
                py::repr_str(expected),
                Val::from(actual).repr()
            ));
        }
    }
    for name in present {
        if !tree.has_attr(element, name) {
            failures.push(format!("{CALCULATOR_REL}: #{identifier} must have {name}"));
        }
    }
    Some(element)
}

/// The calculator's external page module, or nothing if it is missing.
pub fn calculator_module_source(root: &Path) -> Result<String, String> {
    read_if_file(&site_path(root, LEVY_PAGE_MODULE))
}

/// Keep the visible and structured Formula B answers complete and identical.
pub fn check_formula_b_answer(html: &str, failures: &mut Vec<String>) {
    let tree = core::parse_structure(html);
    let mut answers = Vec::new();
    for details in rendered(&tree, Some("details")) {
        let headings = tree.descendants(details, Some("h3"), true);
        if headings.is_empty() || tree.text(headings[0]) != FORMULA_B_QUESTION {
            continue;
        }
        answers.extend(
            tree.descendants(details, Some("p"), true)
                .into_iter()
                .map(|p| tree.text(p)),
        );
    }
    let question = py::repr_str(FORMULA_B_QUESTION);
    if answers.len() != 1 {
        failures.push(format!(
            "{CALCULATOR_REL}: expected one visible {question} answer, found {}",
            answers.len()
        ));
        return;
    }
    let mut parse_failures = Vec::new();
    let mut structured = Vec::new();
    for block in core::json_ld_blocks(html, CALCULATOR_REL, &mut parse_failures) {
        for node in core::nodes(&block) {
            if !eq(node.get("name"), &s(FORMULA_B_QUESTION)) {
                continue;
            }
            let text = match node.get("acceptedAnswer") {
                Some(answer @ Json::Object(_)) => answer.get("text"),
                _ => None,
            };
            match text {
                Some(Json::Str(text)) => structured.push(text.clone()),
                _ => failures.push(format!(
                    "{CALCULATOR_REL}: structured {question} answer needs acceptedAnswer.text as a string"
                )),
            }
        }
    }
    failures.extend(parse_failures);
    if structured.len() != 1 {
        failures.push(format!(
            "{CALCULATOR_REL}: expected one structured {question} answer, found {}",
            structured.len()
        ));
        return;
    }
    let missing: Vec<&str> = FORMULA_B_ANSWER_PHRASES
        .iter()
        .copied()
        .filter(|p| !answers[0].contains(p))
        .collect();
    if !missing.is_empty() {
        failures.push(format!(
            "{CALCULATOR_REL}: Formula B answer omits the expense-reimbursement exclusion or its worked figures: {}",
            repr_list(missing)
        ));
    }
    if py::split_whitespace(&structured[0]).join(" ") != py::split_whitespace(&answers[0]).join(" ")
    {
        failures.push(format!(
            "{CALCULATOR_REL}: structured Formula B answer differs from the visible one"
        ));
    }
}

pub fn check_calculator_contract(html: &str, failures: &mut Vec<String>, module_source: &str) {
    check_formula_b_answer(html, failures);
    let positions: Vec<i64> = CALCULATOR_MARKERS.iter().map(|m| find(html, m)).collect();
    if positions.iter().any(|p| *p < 0) || !positions.is_sorted() {
        failures.push(format!(
            "{CALCULATOR_REL}: calculator markers missing or out of order: {}",
            repr_list(positions.iter().map(|p| Val::Int(*p)))
        ));
    }

    let tree = core::parse_structure(html);
    let all_ids: Vec<&str> = tree
        .descendants(Tree::ROOT, None, false)
        .into_iter()
        .filter_map(|e| tree.attr(e, "id").filter(|i| !i.is_empty()))
        .collect();
    let mut duplicate_ids: Vec<&str> = Vec::new();
    for id in &all_ids {
        if all_ids.iter().filter(|x| *x == id).count() > 1 && !duplicate_ids.contains(id) {
            duplicate_ids.push(id);
        }
    }
    duplicate_ids.sort();
    if !duplicate_ids.is_empty() {
        failures.push(format!(
            "{CALCULATOR_REL}: duplicate help or control IDs: {}",
            repr_list(duplicate_ids)
        ));
    }
    let mut missing_ids: Vec<&str> = CALCULATOR_REQUIRED_IDS
        .iter()
        .copied()
        .filter(|i| !all_ids.contains(i))
        .collect();
    missing_ids.sort();
    if !missing_ids.is_empty() {
        failures.push(format!(
            "{CALCULATOR_REL}: missing protected field IDs: {}",
            repr_list(missing_ids)
        ));
    }

    let common_help = tree.by_id("money-blank-help");
    if common_help.len() != 1 || tree.text(common_help[0]) != CALCULATOR_COMMON_HELP {
        failures.push(format!(
            "{CALCULATOR_REL}: form must contain one exact blank-as-zero note"
        ));
    }

    let branch_contract: Vec<(Option<&str>, Option<&str>, bool)> = tree
        .descendants(Tree::ROOT, Some("input"), false)
        .into_iter()
        .filter(|e| tree.attr(*e, "name") == Some("branch"))
        .map(|r| {
            (
                tree.attr(r, "type"),
                tree.attr(r, "value"),
                tree.has_attr(r, "checked"),
            )
        })
        .collect();
    let expected_branch = [
        (Some("radio"), Some("baseRate"), true),
        (Some("radio"), Some("annual"), false),
        (Some("radio"), Some("casual"), false),
    ];
    if branch_contract != expected_branch {
        failures.push(format!("{CALCULATOR_REL}: branch radio contract changed"));
    }

    let number_attributes = [
        ("type", "number"),
        ("min", "0"),
        ("step", "0.01"),
        ("inputmode", "decimal"),
    ];
    for identifier in CALCULATOR_NUMBER_INPUT_IDS {
        let help = format!("{identifier}-help");
        let mut attributes = vec![("name", identifier)];
        attributes.extend(number_attributes);
        if let Some(control) =
            check_id_contract(&tree, identifier, "input", &attributes, failures, &[])
        {
            let mut described: Vec<&str> =
                py::split_whitespace(tree.attr(control, "aria-describedby").unwrap_or(""));
            described.sort();
            described.dedup();
            let mut expected = vec!["money-blank-help", help.as_str()];
            expected.sort();
            expected.dedup();
            if described != expected {
                failures.push(format!(
                    "{CALCULATOR_REL}: #{identifier} aria-describedby must retain common and field-specific help"
                ));
            }
        }
        if tree.by_id(&help).len() != 1 {
            failures.push(format!(
                "{CALCULATOR_REL}: #{identifier} needs one unique field help ID"
            ));
        }
    }
    check_id_contract(
        &tree,
        "reportingMonth",
        "input",
        &[
            ("type", "month"),
            ("name", "reportingMonth"),
            ("aria-describedby", "reportingMonth-help"),
        ],
        failures,
        &["required"],
    );
    if tree.by_id("reportingMonth-help").len() != 1 {
        failures.push(format!(
            "{CALCULATOR_REL}: reporting month needs associated help"
        ));
    }
    for identifier in ["instrumentSpecifiesLoading", "loadingQuantifiable"] {
        check_id_contract(
            &tree,
            identifier,
            "input",
            &[("type", "checkbox"), ("name", identifier)],
            failures,
            &[],
        );
    }
    check_id_contract(
        &tree,
        "employeeLabel",
        "input",
        &[
            ("type", "text"),
            ("placeholder", "EMP-001"),
            ("aria-describedby", "employee-reference-help"),
        ],
        failures,
        &[],
    );
    for identifier in ["add-bonus", "add-employee", "export-csv", "print-working"] {
        check_id_contract(
            &tree,
            identifier,
            "button",
            &[("type", "button")],
            failures,
            &[],
        );
    }
    let export_buttons = tree.by_id("export-csv");
    if export_buttons.len() == 1 && tree.text(export_buttons[0]) != "Download CSV" {
        failures.push(format!("{CALCULATOR_REL}: missing visible CSV action"));
    }

    let forms = tree.by_id("calc-form");
    if forms.len() == 1 {
        let submits = tree
            .descendants(forms[0], Some("button"), false)
            .into_iter()
            .filter(|b| tree.attr(*b, "type") == Some("submit"))
            .count();
        if submits != 1 {
            failures.push(format!(
                "{CALCULATOR_REL}: #calc-form must contain exactly one submit button"
            ));
        }
    }

    let templates = tree.by_id("bonus-row-template");
    if templates.len() == 1 {
        let template = templates[0];
        let amounts: Vec<usize> = tree
            .descendants(template, Some("input"), false)
            .into_iter()
            .filter(|e| tree.has_class(*e, "bonus-amount"))
            .collect();
        if amounts.len() != 1 {
            failures.push(format!(
                "{CALCULATOR_REL}: expected exactly one .bonus-amount input"
            ));
        } else {
            for (name, expected) in number_attributes {
                let actual = tree.attr(amounts[0], name);
                if actual != Some(expected) {
                    failures.push(format!(
                        "{CALCULATOR_REL}: .bonus-amount {name} must be {}, found {}",
                        py::repr_str(expected),
                        Val::from(actual).repr()
                    ));
                }
            }
            if tree.attr(amounts[0], "aria-describedby") != Some("money-blank-help") {
                failures.push(format!(
                    "{CALCULATOR_REL}: bonus amount must retain common help before cloning"
                ));
            }
            if tree.attr(amounts[0], "data-help-template") != Some("bonus-amount") {
                failures.push(format!(
                    "{CALCULATOR_REL}: bonus amount needs generated field-specific help"
                ));
            }
        }
        let help: Vec<usize> = tree
            .descendants(template, None, false)
            .into_iter()
            .filter(|e| tree.attr(*e, "data-help-template") == Some("bonus-amount-note"))
            .collect();
        if help.len() != 1 || tree.attr(help[0], "id").is_some() {
            failures.push(format!(
                "{CALCULATOR_REL}: bonus template help must receive a unique cloned ID"
            ));
        }
        let selects: Vec<usize> = tree
            .descendants(template, Some("select"), false)
            .into_iter()
            .filter(|e| tree.has_class(*e, "bonus-frequency"))
            .collect();
        let mut found: Vec<Option<&str>> = Vec::new();
        if selects.len() == 1 {
            found = tree
                .descendants(selects[0], Some("option"), false)
                .into_iter()
                .map(|o| tree.attr(o, "value"))
                .collect();
        }
        if found != BONUS_FREQUENCIES.map(Some) {
            failures.push(format!(
                "{CALCULATOR_REL}: bonus frequency values must be {}, found {}",
                repr_list(BONUS_FREQUENCIES),
                repr_list(found)
            ));
        }
        let removes: Vec<usize> = tree
            .descendants(template, Some("button"), false)
            .into_iter()
            .filter(|e| tree.has_class(*e, "bonus-remove"))
            .collect();
        if removes.len() != 1 || tree.attr(removes[0], "type") != Some("button") {
            failures.push(format!(
                "{CALCULATOR_REL}: .bonus-remove must be a button with type 'button'"
            ));
        }
    }

    let results = tree.by_id("result");
    if results.len() != 1 {
        failures.push(format!("{CALCULATOR_REL}: expected one #result region"));
    } else {
        let result = results[0];
        if tree.tag(result) != "div"
            || tree.attr(result, "role") != Some("status")
            || tree.attr(result, "aria-live") != Some("polite")
        {
            failures.push(format!(
                "{CALCULATOR_REL}: #result must be a polite status region"
            ));
        }
    }
    let result_position = find(html, "id=\"result\"");
    let employee_position = find(html, "id=\"employeeLabel\"");
    let disclaimer_position = find(html, "id=\"disclaimer\"");
    if !(0 <= result_position
        && result_position < employee_position
        && employee_position < disclaimer_position)
    {
        failures.push(format!(
            "{CALCULATOR_REL}: result, employee workflow and disclaimer are out of order"
        ));
    }

    let result_actions = tree.by_id("result-actions");
    if result_actions.len() == 1 {
        let actual: Vec<(Option<&str>, String)> = tree
            .descendants(result_actions[0], Some("button"), false)
            .into_iter()
            .map(|b| (tree.attr(b, "id"), tree.text(b)))
            .collect();
        let expected = [
            ("print-working", "Print working"),
            ("add-employee", "Add to monthly table"),
        ];
        let matches = actual.len() == expected.len()
            && actual
                .iter()
                .zip(expected)
                .all(|((id, text), (eid, etext))| *id == Some(eid) && text == etext);
        if !matches {
            failures.push(format!(
                "{CALCULATOR_REL}: result actions are {}, expected {}",
                repr_list(actual),
                repr_list(expected)
            ));
        }
    }
    let visible_text = core::visible_text(html);
    for (required, label) in [
        (CALCULATOR_PRIVACY_WARNING, "direct-identifier warning"),
        ("Employee reference", "employee reference label"),
        ("EMP-001", "employee reference example"),
        ("Download CSV", "CSV action"),
    ] {
        if !visible_text.contains(required) {
            failures.push(format!("{CALCULATOR_REL}: missing visible {label}"));
        }
    }
    if html.matches(LEVY_PAGE_SCRIPT).count() != 1 {
        failures.push(format!(
            "{CALCULATOR_REL}: page must load the calculator wiring from {LEVY_PAGE_MODULE} exactly once"
        ));
    }
    if !module_source.contains(CALCULATOR_BLANK_RESULT_EXPLANATION) {
        failures.push(format!(
            "{LEVY_PAGE_MODULE}: zero result needs the blank-as-zero explanation"
        ));
    }
    if !module_source.contains("from '/assets/levy.mjs'") {
        failures.push(format!(
            "{LEVY_PAGE_MODULE}: protected levy engine import changed"
        ));
    }
}

/// Require one skip target and the exact global primary navigation.
pub fn check_shared_shell(html: &str, rel: &str, failures: &mut Vec<String>) {
    let tree = core::parse_structure(html);
    let mains = rendered(&tree, Some("main"));
    if mains.len() != 1 || tree.attr(mains[0], "id") != Some("main") {
        failures.push(format!(
            "{rel}: expected exactly one rendered main#main, found {} main elements",
            mains.len()
        ));
    }
    let skip_links = rendered(&tree, Some("a"))
        .into_iter()
        .filter(|l| tree.has_class(*l, "skip-link") && tree.attr(*l, "href") == Some("#main"))
        .count();
    if skip_links != 1 {
        failures.push(format!(
            "{rel}: expected exactly one .skip-link targeting #main, found {skip_links}"
        ));
    }
    let primary: Vec<usize> = rendered(&tree, Some("nav"))
        .into_iter()
        .filter(|n| tree.attr(*n, "aria-label") == Some("Primary"))
        .collect();
    if primary.len() != 1 {
        failures.push(format!(
            "{rel}: expected exactly one nav labelled Primary, found {}",
            primary.len()
        ));
        return;
    }
    let anchors = tree.descendants(primary[0], Some("a"), true);
    let links: Vec<(Option<&str>, String)> = anchors
        .iter()
        .map(|l| (tree.attr(*l, "href"), tree.text(*l)))
        .collect();
    let expected_links = links.len() == PRIMARY_NAV_LINKS.len()
        && links
            .iter()
            .zip(PRIMARY_NAV_LINKS)
            .all(|((h, t), (eh, et))| *h == Some(eh) && t == et);
    if !expected_links {
        failures.push(format!(
            "{rel}: primary navigation is {}, expected {}",
            repr_list(links),
            repr_list(PRIMARY_NAV_LINKS)
        ));
    }
    let expected_current: Vec<(&str, &str)> = if rel == "tools/index.html" {
        vec![("/tools/", "page")]
    } else if rel.starts_with("tools/") || rel.starts_with("works-with/") {
        vec![("/tools/", "location")]
    } else if rel == "contact/index.html" {
        vec![("/contact/", "page")]
    } else if rel == "rates/index.html" {
        vec![("/rates/", "page")]
    } else if rel.starts_with("rates/") {
        vec![("/rates/", "location")]
    } else if rel == "evaluate/index.html" {
        vec![("/evaluate/", "page")]
    } else if rel.starts_with("evaluate/") {
        vec![("/evaluate/", "location")]
    } else if rel == EVIDENCE_REL {
        vec![("/evidence/", "page")]
    } else if rel == "about/index.html" {
        vec![("/about/", "page")]
    } else {
        vec![]
    };
    // A dict comprehension: a repeated href keeps its first position and its last value.
    let mut actual_current: Vec<(Option<&str>, &str)> = Vec::new();
    for link in &anchors {
        let Some(current) = tree.attr(*link, "aria-current") else {
            continue;
        };
        let href = tree.attr(*link, "href");
        match actual_current.iter_mut().find(|(h, _)| *h == href) {
            Some(slot) => slot.1 = current,
            None => actual_current.push((href, current)),
        }
    }
    let same = actual_current.len() == expected_current.len()
        && actual_current.iter().all(|(h, v)| {
            expected_current
                .iter()
                .any(|(eh, ev)| *h == Some(*eh) && v == ev)
        });
    if !same {
        let dict = |pairs: Vec<(Val, Val)>| Val::Dict(pairs).repr();
        failures.push(format!(
            "{rel}: primary navigation current states are {}, expected {}",
            dict(
                actual_current
                    .iter()
                    .map(|(h, v)| ((*h).into(), (*v).into()))
                    .collect()
            ),
            dict(
                expected_current
                    .iter()
                    .map(|(h, v)| ((*h).into(), (*v).into()))
                    .collect()
            )
        ));
    }
}

/// Visible name, href and canonical URL for each step of a collection breadcrumb.
pub fn collection_breadcrumb_shape(
    rel: &str,
    current_name: &str,
) -> Option<Vec<(String, Option<String>, String)>> {
    let home = ("Home".to_owned(), Some("/".to_owned()), format!("{SITE}/"));
    let step = |name: &str, href: &str| {
        (
            name.to_owned(),
            Some(href.to_owned()),
            format!("{SITE}{href}"),
        )
    };
    let mut parents = if rel == "tools/index.html"
        || rel == "evaluate/index.html"
        || rel == "rates/index.html"
        || rel.starts_with("examples/")
    {
        vec![home]
    } else if rel.starts_with("tools/ozzit/functions/") {
        vec![
            home,
            step("Tools", "/tools/"),
            step("Ozzit Excel LAMBDA library", "/tools/ozzit/"),
        ]
    } else if rel.starts_with("tools/") {
        vec![home, step("Tools", "/tools/")]
    } else if rel.starts_with("evaluate/") {
        vec![home, step("Evaluations", "/evaluate/")]
    } else if rel.starts_with("rates/") {
        vec![home, step("Rates", "/rates/")]
    } else {
        return None;
    };
    parents.push((current_name.to_owned(), None, core::site_url(rel, SITE)));
    Some(parents)
}

/// Keep visible and structured collection breadcrumbs in the same hierarchy.
pub fn check_collection_breadcrumb(html: &str, rel: &str, failures: &mut Vec<String>) {
    let tree = core::parse_structure(html);
    let h1s = rendered(&tree, Some("h1"));
    if h1s.len() != 1 {
        failures.push(format!("{rel}: collection breadcrumb needs exactly one H1"));
        return;
    }
    let leaf = BREADCRUMB_LEAF_NAMES
        .iter()
        .find(|(r, _)| *r == rel)
        .map_or_else(|| tree.text(h1s[0]), |(_, n)| (*n).to_owned());
    let Some(expected) = collection_breadcrumb_shape(rel, &leaf) else {
        return;
    };
    let breadcrumbs: Vec<usize> = rendered(&tree, Some("nav"))
        .into_iter()
        .filter(|n| tree.attr(*n, "aria-label") == Some("Breadcrumb"))
        .collect();
    if breadcrumbs.len() != 1 {
        failures.push(format!(
            "{rel}: expected exactly one nav labelled Breadcrumb, found {}",
            breadcrumbs.len()
        ));
    } else {
        let items = tree.descendants(breadcrumbs[0], Some("li"), true);
        let actual_names: Vec<String> = items.iter().map(|i| tree.text(*i)).collect();
        let expected_names: Vec<&String> = expected.iter().map(|(n, _, _)| n).collect();
        if actual_names.iter().collect::<Vec<_>>() != expected_names {
            failures.push(format!(
                "{rel}: visible breadcrumb is {}, expected {}",
                repr_list(&actual_names),
                repr_list(expected_names)
            ));
        }
        for (index, (name, href, _)) in expected.iter().enumerate() {
            if index >= items.len() {
                break;
            }
            let links = tree.descendants(items[index], Some("a"), true);
            let actual_href = if links.len() == 1 {
                tree.attr(links[0], "href")
            } else {
                None
            };
            if href.is_some() && actual_href != href.as_deref() {
                failures.push(format!(
                    "{rel}: breadcrumb {} points to {}, expected {}",
                    py::repr_str(name),
                    Val::from(actual_href).repr(),
                    Val::from(href.as_deref()).repr()
                ));
            }
            if href.is_none()
                && (!links.is_empty() || tree.attr(items[index], "aria-current") != Some("page"))
            {
                failures.push(format!(
                    "{rel}: current breadcrumb {} must be unlinked and aria-current=page",
                    py::repr_str(name)
                ));
            }
        }
    }
    let mut parse_failures = Vec::new();
    let structured: Vec<Json> = core::json_ld_blocks(html, rel, &mut parse_failures)
        .iter()
        .flat_map(|b| {
            core::nodes(b)
                .into_iter()
                .filter(|n| core::has_type(n, "BreadcrumbList"))
                .cloned()
                .collect::<Vec<_>>()
        })
        .collect();
    failures.extend(parse_failures);
    if structured.len() != 1 {
        failures.push(format!(
            "{rel}: expected exactly one BreadcrumbList, found {}",
            structured.len()
        ));
        return;
    }
    let expected_structured = Json::Array(
        expected
            .iter()
            .enumerate()
            .map(|(i, (name, _, canonical))| {
                obj(vec![
                    ("@type", s("ListItem")),
                    ("position", int(i + 1)),
                    ("name", s(name)),
                    ("item", s(canonical)),
                ])
            })
            .collect(),
    );
    if !eq(structured[0].get("itemListElement"), &expected_structured) {
        failures.push(format!(
            "{rel}: BreadcrumbList does not match the visible hierarchy"
        ));
    }
}

/// Open every tax and compliance answer with its checked fact and sources.
pub fn check_question_answers(html: &str, rel: &str, failures: &mut Vec<String>) {
    if !regulatory_question_page(rel) || html.starts_with("---") {
        return;
    }
    let blocks: Vec<(String, String)> = re(
        r#"<details class="question" id="q(\d+)"[^>]*>(.*?)</details>"#,
        S,
    )
    .captures_iter(html)
    .map(|c| (c[1].to_owned(), c[2].to_owned()))
    .collect();
    if blocks.is_empty() {
        failures.push(format!("{rel}: no questions found"));
    }
    for (number, block) in blocks {
        let answer = re(r#"<div class="question-answer">\s*<p>(.*?)</p>"#, S).search(&block);
        if answer.is_none_or(|a| !a[1].starts_with("<strong>"))
            || !block.contains("The bold answer was checked on")
        {
            failures.push(format!(
                "{rel}: question {number} must open with a checked answer"
            ));
        }
        if block.contains("href=\"\"") {
            failures.push(format!(
                "{rel}: question {number} links a source missing from the data"
            ));
        }
    }
}
