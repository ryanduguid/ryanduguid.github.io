//! The levy calculator's contract refuses a repeated element ID and a structured Formula
//! B answer that is not an Answer object.
mod common;
use common::*;
use site_tools::site_contracts as contracts;

fn failures(
    change: impl Fn(&str) -> String,
    check: impl Fn(&str, &mut Vec<String>),
) -> Vec<String> {
    let calculator = read_text(root(), contracts::CALCULATOR_REL);
    let changed = change(&calculator);
    assert_ne!(changed, calculator, "the change applies");
    let mut found = Vec::new();
    check(&changed, &mut found);
    found
}

#[test]
fn a_repeated_element_id_is_named_once() {
    if !rendered() {
        return;
    }
    let module = read_text(root(), contracts::LEVY_PAGE_MODULE);
    let found = failures(
        |html| {
            html.replacen(
                "<main",
                r#"<i id="dup-a"></i><i id="dup-a"></i><i id="dup-a"></i><main"#,
                1,
            )
        },
        |html, found| contracts::check_calculator_contract(html, found, &module),
    );
    let duplicates: Vec<&String> = found
        .iter()
        .filter(|f| f.contains("duplicate help or control IDs"))
        .collect();
    assert_eq!(
        duplicates,
        [&format!(
            "{}: duplicate help or control IDs: ['dup-a']",
            contracts::CALCULATOR_REL
        )]
    );
}

#[test]
fn a_formula_b_answer_that_is_not_an_object_has_no_text() {
    if !rendered() {
        return;
    }
    let question = format!("\"name\": \"{}\",", contracts::FORMULA_B_QUESTION);
    let found = failures(
        |html| {
            let at = html.find(&question).expect("the structured question");
            let (head, tail) = html.split_at(at);
            let tail = tail.replacen(
                "\"acceptedAnswer\": {",
                "\"acceptedAnswer\": \"none\", \"unused\": {",
                1,
            );
            format!("{head}{tail}")
        },
        contracts::check_formula_b_answer,
    );
    assert!(
        found
            .iter()
            .any(|f| f.starts_with(contracts::CALCULATOR_REL)
                && f.ends_with("answer needs acceptedAnswer.text as a string")),
        "{found:?}"
    );
}
