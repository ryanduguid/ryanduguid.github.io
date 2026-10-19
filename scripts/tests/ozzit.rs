//! scripts/test_ozzit_reference.py: public formulas stay bound to the recorded native
//! Excel check, and the function index mirrors the pinned release CSV.
use site_tools::ozzit_reference::{anchor, load_index, render, render_index};
use site_tools::pycsv::DictRow;
use site_tools::pyjson::{self, Dump, Json};
use std::path::{Path, PathBuf};

const INPUTS: [&str; 3] = [
    "assets/ozzit-functions-v3.4.2.csv",
    "scripts/ozzit_reference_examples.json",
    "assets/ozzit-reference-v3.4.2.json",
];

fn repository() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

/// A private site root holding copies of the generator's three inputs.
fn inputs() -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    for rel in INPUTS {
        let to = root.path().join(rel);
        std::fs::create_dir_all(to.parent().unwrap()).unwrap();
        std::fs::copy(repository().join(rel), to).unwrap();
    }
    root
}

fn load(root: &Path, rel: &str) -> Json {
    pyjson::loads(&std::fs::read_to_string(root.join(rel)).unwrap()).unwrap()
}

fn save(root: &Path, rel: &str, value: &Json) {
    std::fs::write(root.join(rel), pyjson::dumps(value, Dump::default())).unwrap();
}

fn member<'a>(value: &'a mut Json, key: &str) -> &'a mut Json {
    match value {
        Json::Object(pairs) => &mut pairs.iter_mut().find(|(k, _)| k == key).unwrap().1,
        _ => panic!("not an object"),
    }
}

fn item(value: &mut Json, index: usize) -> &mut Json {
    match value {
        Json::Array(items) => &mut items[index],
        _ => panic!("not a list"),
    }
}

fn render_error(root: &Path) -> String {
    render(root).expect_err("render must refuse the change")
}

#[test]
fn changed_display_is_rejected() {
    let root = inputs();
    let mut examples = load(root.path(), INPUTS[1]);
    *member(item(&mut examples, 0), "expected") =
        Json::Str("200.00, displayed to two decimal places.".into());
    save(root.path(), INPUTS[1], &examples);
    assert!(render_error(root.path()).contains("expected display differs"));
}

#[test]
fn changed_native_values_are_rejected() {
    for (name, row, column, value) in [
        ("gstextract", 0, 0, Json::Int(200.into())),
        ("primecost", 0, 4, Json::Int(300.into())),
        ("amortise", 4, 0, Json::Int(100000.into())),
        ("financialyear", 0, 0, Json::Str("FY2028".into())),
    ] {
        let root = inputs();
        let mut record = load(root.path(), INPUTS[2]);
        *item(
            item(member(member(&mut record, "results"), name), row),
            column,
        ) = value;
        save(root.path(), INPUTS[2], &record);
        assert!(
            render_error(root.path()).contains("expected display differs"),
            "{name}"
        );
    }
}

#[test]
fn changed_native_array_shape_is_rejected() {
    let root = inputs();
    let mut record = load(root.path(), INPUTS[2]);
    let column = |v: i64| Json::Array(vec![Json::Int(v.into())]);
    *member(member(&mut record, "results"), "primecost") = Json::Array(vec![column(200); 5]);
    save(root.path(), INPUTS[2], &record);
    assert!(render_error(root.path()).contains("native result shape differs"));
}

#[test]
fn changed_formula_needs_new_native_evidence() {
    let root = inputs();
    let mut examples = load(root.path(), INPUTS[1]);
    *member(item(&mut examples, 0), "formula") = Json::Str("=oz.GSTExtractλ(2200)".into());
    save(root.path(), INPUTS[1], &examples);
    assert!(render_error(root.path()).contains("matching native Excel"));
}

#[test]
fn results_must_identify_the_released_workbook() {
    let root = inputs();
    let mut record = load(root.path(), INPUTS[2]);
    *member(&mut record, "workbook_sha256") = Json::Str("0".repeat(64));
    save(root.path(), INPUTS[2], &record);
    assert!(render_error(root.path()).contains("v3.4.2 release workbook"));
}

#[test]
fn missing_native_result_is_rejected() {
    let root = inputs();
    let mut record = load(root.path(), INPUTS[2]);
    if let Json::Object(pairs) = member(&mut record, "results") {
        pairs.retain(|(k, _)| k != "gstextract");
    }
    save(root.path(), INPUTS[2], &record);
    assert!(render_error(root.path()).contains("matching native Excel"));
}

fn rows() -> Vec<DictRow> {
    load_index(&repository()).unwrap()
}

fn set(row: &mut DictRow, name: &str, value: &str) {
    row.iter_mut().find(|(k, _)| k == name).unwrap().1 = Some(value.to_owned());
}

fn get<'a>(row: &'a DictRow, name: &str) -> &'a str {
    row.iter()
        .find(|(k, _)| k == name)
        .and_then(|(_, v)| v.as_deref())
        .unwrap()
}

/// csv.DictWriter's minimal quoting.
fn csv_field(value: &str) -> String {
    if value.contains([',', '"', '\r', '\n']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_owned()
    }
}

fn render_with(rows: &[DictRow]) -> Result<String, String> {
    let root = inputs();
    let mut text: String = rows[0]
        .iter()
        .map(|(k, _)| csv_field(k))
        .collect::<Vec<_>>()
        .join(",")
        + "\r\n";
    for row in rows {
        text += &(row
            .iter()
            .map(|(_, v)| csv_field(v.as_deref().unwrap_or("")))
            .collect::<Vec<_>>()
            .join(",")
            + "\r\n");
    }
    std::fs::write(root.path().join(INPUTS[0]), text).unwrap();
    render_index(root.path())
}

#[test]
fn modules_hold_every_named_formula_largest_first() {
    let output = render_index(&repository()).unwrap();
    let modules: Vec<(String, String)> = regex::Regex::new(r"<h3>(\w+), (\d+) named formulas</h3>")
        .unwrap()
        .captures_iter(&output)
        .map(|c| (c[1].to_owned(), c[2].to_owned()))
        .collect();
    let expected = [
        ("Financial", "46"),
        ("Ratios", "39"),
        ("Essentials", "17"),
        ("Utilities", "17"),
        ("Dates", "14"),
        ("Debt", "5"),
    ];
    assert_eq!(
        modules,
        expected.map(|(m, n)| (m.to_owned(), n.to_owned())).to_vec()
    );
    let ids: Vec<String> = regex::Regex::new(r#"<li id="(oz-[a-z0-9]+)">"#)
        .unwrap()
        .captures_iter(&output)
        .map(|c| c[1].to_owned())
        .collect();
    assert_eq!(ids.len(), 138);
    let mut unique = ids.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(unique.len(), 138);
    assert!(output.contains("<li id=\"oz-gstextract\"><code>oz.GSTExtract"));
    assert_eq!(output.matches("<details").count(), 6);
    assert!(!output.contains("<details open"));
    // Unstyled lists keep their semantics in Safari only with an explicit role.
    assert_eq!(
        output
            .matches("<ul class=\"function-index__list\" role=\"list\">")
            .count(),
        6
    );
}

#[test]
fn every_call_is_the_released_signature() {
    let output = render_index(&repository()).unwrap();
    let tags = regex::Regex::new("<[^>]+>").unwrap();
    let mut calls: Vec<String> = regex::Regex::new("<code>(.*?)</code>")
        .unwrap()
        .captures_iter(&output)
        .map(|c| site_tools::html::unescape(&tags.replace_all(&c[1], "")))
        .collect();
    let mut expected: Vec<String> = rows()
        .iter()
        .map(|row| format!("oz.{}", get(row, "signature")))
        .collect();
    calls.sort();
    expected.sort();
    assert_eq!(calls, expected);
}

#[test]
fn lambda_is_marked_and_markup_is_escaped() {
    let mut rows = rows();
    let signature = format!("{} <b>&amp;</b>", get(&rows[5], "signature"));
    set(&mut rows[5], "signature", &signature);
    let output = render_with(&rows).unwrap();
    assert!(output.contains("&lt;b&gt;&amp;amp;&lt;/b&gt;"));
    assert!(!output.contains("<b>"));
    let bare = output.replace("<span class=\"function-symbol\">λ</span>", "");
    assert!(!bare.contains('λ'));
}

#[test]
fn colliding_fragment_ids_are_rejected() {
    let mut rows = rows();
    set(&mut rows[11], "function", "oz.AvgCols_λ");
    set(&mut rows[11], "signature", "AvgCols_λ( Array)");
    assert_eq!(anchor("oz.AvgCols_λ"), anchor("oz.AvgColsλ"));
    assert!(
        render_with(&rows)
            .unwrap_err()
            .contains("share a fragment id")
    );
}

#[test]
fn signature_must_start_with_its_name() {
    for signature in ["Other(Value)", "AboutDatesλExtra(Value)"] {
        let mut rows = rows();
        set(&mut rows[0], "signature", signature);
        assert!(
            render_with(&rows)
                .unwrap_err()
                .contains("does not match its function name"),
            "{signature}"
        );
    }
}

/// The checked tree has no _includes folder, so both includes are supplied here.
#[test]
fn stale_index_include_fails_the_check() {
    let root = inputs();
    std::fs::write(root.path().join("_config.yml"), "").unwrap();
    std::fs::create_dir(root.path().join("_includes")).unwrap();
    std::fs::write(
        root.path().join("_includes/ozzit-reference.html"),
        render(root.path()).unwrap(),
    )
    .unwrap();
    std::fs::write(
        root.path().join("_includes/ozzit-function-index.html"),
        "<!-- stale -->\n",
    )
    .unwrap();
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .args(["build_ozzit_reference", "--check"])
        .current_dir(root.path())
        .env_remove("SITE_ROOT")
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&output.stdout).contains("ozzit-function-index.html differs"));
}

#[test]
fn committed_includes_are_current() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .args(["build_ozzit_reference", "--check"])
        .current_dir(repository())
        .env_remove("SITE_ROOT")
        .output()
        .unwrap();
    assert_eq!(
        output.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
}
