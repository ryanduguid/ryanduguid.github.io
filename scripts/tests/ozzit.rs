//! scripts/test_ozzit_reference.py: public formulas stay bound to the recorded native
//! Excel check, the function index mirrors the documented release CSV, and every count
//! a page states for the library matches that index.
use site_tools::ozzit_reference::{
    COUNT_PAGES, anchor, count_failures, documented_release, load_index, render, render_index,
};
use site_tools::pycsv::DictRow;
use site_tools::pyjson::{self, Dump, Json};
use std::path::{Path, PathBuf};

const EXAMPLES: &str = "scripts/ozzit_reference_examples.json";
const RELEASE_RECORD: &str = "scripts/release_record.json";

fn repository() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

/// The tag the release record says the page documents.
fn tag() -> String {
    documented_release(&repository()).unwrap().0
}

fn index_csv() -> String {
    format!("assets/ozzit-functions-{}.csv", tag())
}

fn function_reference() -> String {
    format!("assets/ozzit-function-reference-{}.json", tag())
}

fn native_record() -> String {
    format!("assets/ozzit-reference-{}.json", tag())
}

fn copy(root: &Path, rel: &str) {
    let to = root.join(rel);
    std::fs::create_dir_all(to.parent().unwrap()).unwrap();
    std::fs::copy(repository().join(rel), to).unwrap();
}

/// A private site root holding copies of the generator's inputs, the release record
/// and the pages that state the library's size.
fn inputs() -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    for rel in [
        index_csv(),
        EXAMPLES.into(),
        native_record(),
        function_reference(),
        RELEASE_RECORD.into(),
    ] {
        copy(root.path(), &rel);
    }
    for rel in COUNT_PAGES {
        copy(root.path(), rel);
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
    let mut examples = load(root.path(), EXAMPLES);
    *member(item(&mut examples, 0), "expected") =
        Json::Str("200.00, displayed to two decimal places.".into());
    save(root.path(), EXAMPLES, &examples);
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
        let mut record = load(root.path(), &native_record());
        *item(
            item(member(member(&mut record, "results"), name), row),
            column,
        ) = value;
        save(root.path(), &native_record(), &record);
        assert!(
            render_error(root.path()).contains("expected display differs"),
            "{name}"
        );
    }
}

#[test]
fn changed_native_array_shape_is_rejected() {
    let root = inputs();
    let mut record = load(root.path(), &native_record());
    let column = |v: i64| Json::Array(vec![Json::Int(v.into())]);
    *member(member(&mut record, "results"), "primecost") = Json::Array(vec![column(200); 5]);
    save(root.path(), &native_record(), &record);
    assert!(render_error(root.path()).contains("native result shape differs"));
}

#[test]
fn changed_formula_needs_new_native_evidence() {
    let root = inputs();
    let mut examples = load(root.path(), EXAMPLES);
    *member(item(&mut examples, 0), "formula") = Json::Str("=oz.GSTExtractλ(2200)".into());
    save(root.path(), EXAMPLES, &examples);
    assert!(render_error(root.path()).contains("matching native Excel"));
}

#[test]
fn results_must_identify_the_released_workbook() {
    for (field, value) in [
        ("workbook_sha256", "0".repeat(64)),
        ("release", "v0.0.0".into()),
    ] {
        let root = inputs();
        let mut record = load(root.path(), &native_record());
        *member(&mut record, field) = Json::Str(value);
        save(root.path(), &native_record(), &record);
        let message = format!("{} release workbook", tag());
        assert!(render_error(root.path()).contains(&message), "{field}");
    }
}

/// Edit the Ozzit entry of the copied release record.
fn edit_release(root: &Path, edit: impl FnOnce(&mut Json)) {
    let mut record = load(root, RELEASE_RECORD);
    edit(member(member(&mut record, "components"), "ozzit"));
    save(root, RELEASE_RECORD, &record);
}

#[test]
fn documented_release_comes_from_the_record() {
    let (tag, sha256) = documented_release(&repository()).unwrap();
    let record = load(&repository(), RELEASE_RECORD);
    let ozzit = record.get("components").unwrap().get("ozzit").unwrap();
    let documented = ozzit.get("documented").unwrap();
    assert!(Json::Str(tag.clone()).py_eq(documented.get("tag").unwrap()));
    assert!(sha256.py_eq(ozzit.get("published").unwrap().get("asset_sha256").unwrap()));
    let index = render_index(&repository()).unwrap();
    assert!(index.contains(&format!(
        "https://github.com/ryanduguid/Ozzit/blob/{tag}/src/"
    )));
    assert!(!index.contains("/blob/v3.4.2/"));
}

/// A page documenting an older release must record that release's own hash.
#[test]
fn older_documented_release_needs_its_own_hash() {
    let root = inputs();
    for rel in [
        "assets/ozzit-functions-v3.4.2.csv",
        "assets/ozzit-reference-v3.4.2.json",
    ] {
        copy(root.path(), rel);
    }
    edit_release(root.path(), |ozzit| {
        let documented = member(ozzit, "documented");
        *member(documented, "version") = Json::Str("3.4.2".into());
        *member(documented, "tag") = Json::Str("v3.4.2".into());
    });
    assert!(render_error(root.path()).contains("Record asset_sha256"));
    edit_release(root.path(), |ozzit| {
        if let Json::Object(pairs) = member(ozzit, "documented") {
            pairs.push((
                "asset_sha256".into(),
                Json::Str(
                    "0306793a7e473ce70e78149fea1e107fc0f714d61ab50960c16f6fd528878f6f".into(),
                ),
            ));
        }
    });
    let output = render(root.path()).unwrap();
    assert!(output.contains("https://github.com/ryanduguid/Ozzit/blob/v3.4.2/src/"));
    assert_eq!(load_index(root.path()).unwrap().len(), 138);
}

#[test]
fn missing_native_result_is_rejected() {
    let root = inputs();
    let mut record = load(root.path(), &native_record());
    if let Json::Object(pairs) = member(&mut record, "results") {
        pairs.retain(|(k, _)| k != "gstextract");
    }
    save(root.path(), &native_record(), &record);
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
    std::fs::write(root.path().join(index_csv()), text).unwrap();
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
    let mut expected: Vec<(String, usize)> = Vec::new();
    for row in rows() {
        let module = get(&row, "module");
        match expected.iter_mut().find(|(m, _)| m == module) {
            Some(entry) => entry.1 += 1,
            None => expected.push((module.to_owned(), 1)),
        }
    }
    expected.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let expected: Vec<(String, String)> = expected
        .into_iter()
        .map(|(m, n)| (m, n.to_string()))
        .collect();
    assert_eq!(modules, expected);
    assert_eq!(modules.len(), 6);
    let ids: Vec<String> = regex::Regex::new(r#"<li id="(oz-[a-z0-9]+)">"#)
        .unwrap()
        .captures_iter(&output)
        .map(|c| c[1].to_owned())
        .collect();
    assert_eq!(ids.len(), rows().len());
    let mut unique = ids.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(unique.len(), ids.len());
    assert!(output.contains(
        "<li id=\"oz-gstextract\"><a href=\"/tools/ozzit/functions/financial/#oz-gstextract\"><code>oz.GSTExtract"
    ));
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
    // A call signature, so the appended markup still follows the function name.
    let index = rows
        .iter()
        .position(|row| get(row, "function") == "oz.GSTExtractλ")
        .unwrap();
    let signature = format!("{} <b>&amp;</b>", get(&rows[index], "signature"));
    set(&mut rows[index], "signature", &signature);
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

#[test]
fn stated_counts_match_the_index() {
    assert_eq!(count_failures(&repository()).unwrap(), Vec::<String>::new());
}

#[test]
fn wrong_or_missing_counts_are_reported() {
    let named = rows().len();
    let tables = rows()
        .iter()
        .filter(|row| get(row, "function").starts_with("oz.About"))
        .count();
    let lambdas = named - tables;
    let page = std::fs::read_to_string(repository().join(COUNT_PAGES[0])).unwrap();
    let llms = std::fs::read_to_string(repository().join("llms.txt")).unwrap();
    let help_tables = regex::Regex::new(r"\d+ help tables").unwrap();
    let cases = [
        (
            "wrong named",
            COUNT_PAGES[0],
            page.replace(&format!("All {named} named"), "All 1 named"),
            "named formulas",
        ),
        (
            "wrong lambdas",
            COUNT_PAGES[0],
            page.replace(&format!("{lambdas} LAMBDA"), "1 LAMBDA"),
            "LAMBDA functions",
        ),
        (
            "dropped",
            COUNT_PAGES[0],
            help_tables.replace_all(&page, "help tables").into_owned(),
            "no longer states",
        ),
        (
            "another page",
            "llms.txt",
            llms.replace(&format!("{lambdas} native LAMBDA"), "1 native LAMBDA"),
            "llms.txt: states [1, 143] LAMBDA functions",
        ),
    ];
    for (label, rel, changed, message) in cases {
        let root = inputs();
        let path = root.path().join(rel);
        let text = std::fs::read_to_string(&path).unwrap();
        assert_ne!(changed, text, "{label}");
        std::fs::write(&path, changed).unwrap();
        let failures = count_failures(root.path()).unwrap();
        assert!(
            failures.iter().any(|f| f.contains(message)),
            "{label}: {failures:?}"
        );
    }
}

#[test]
fn wrong_count_fails_the_check() {
    let root = inputs();
    let path = root.path().join(COUNT_PAGES[1]);
    let text = std::fs::read_to_string(&path).unwrap();
    std::fs::write(
        &path,
        text.replace(" help tables", " help tables, 9 help tables"),
    )
    .unwrap();
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .args(["build_ozzit_reference", "--check"])
        .current_dir(root.path())
        .env_remove("SITE_ROOT")
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    let message = format!(
        "tools/index.html: states [5, 9] help tables; the {} index has 5",
        tag()
    );
    assert!(String::from_utf8_lossy(&output.stdout).contains(&message));
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

fn pages(root: &Path) -> Vec<(String, String)> {
    site_tools::ozzit_functions::render_pages(root).unwrap()
}

#[test]
fn module_pages_document_every_named_formula_once() {
    let pages = pages(&repository());
    assert_eq!(pages.len(), 6);
    let all = pages
        .iter()
        .map(|(_, html)| html.as_str())
        .collect::<String>();
    for row in rows() {
        let id = anchor(get(&row, "function"));
        assert_eq!(
            all.matches(&format!("<section id=\"{id}\"")).count(),
            1,
            "{id}"
        );
    }
    for (rel, html) in &pages {
        assert!(rel.starts_with("tools/ozzit/functions/"), "{rel}");
        assert!(html.starts_with("---\n---\n<!DOCTYPE html>"), "{rel}");
        assert_eq!(html.matches("<h1>").count(), 1, "{rel}");
    }
}

#[test]
fn every_index_entry_links_to_its_module_page_entry() {
    let index = render_index(&repository()).unwrap();
    let pages = pages(&repository());
    let links =
        regex::Regex::new(r#"href="/(tools/ozzit/functions/[a-z]+/)#([a-z0-9-]+)""#).unwrap();
    let mut count = 0;
    for link in links.captures_iter(&index) {
        let rel = format!("{}index.html", &link[1]);
        let page = &pages
            .iter()
            .find(|(r, _)| *r == rel)
            .expect("a module page")
            .1;
        assert!(
            page.contains(&format!("<section id=\"{}\"", &link[2])),
            "{}",
            &link[2]
        );
        count += 1;
    }
    assert_eq!(count, 148);
}

#[test]
fn reference_must_agree_with_the_pinned_index() {
    let root = inputs();
    let rel = function_reference();
    let text = std::fs::read_to_string(root.path().join(&rel)).unwrap();
    let changed = text.replacen(
        "\"summary\": \"Creates a corkscrew amortisation schedule\"",
        "\"summary\": \"Creates a loan schedule\"",
        1,
    );
    assert_ne!(changed, text);
    std::fs::write(root.path().join(&rel), changed).unwrap();
    let error = site_tools::ozzit_functions::render_pages(root.path()).unwrap_err();
    assert!(
        error.contains("oz.Amortiseλ: the reference and the pinned index disagree"),
        "{error}"
    );
}

#[test]
fn excluded_vocabulary_is_left_out_with_a_pointer_to_the_source() {
    let pages = pages(&repository());
    let ratios = &pages
        .iter()
        .find(|(r, _)| r.contains("/ratios/"))
        .unwrap()
        .1;
    assert!(!ratios.to_lowercase().contains("leverage"));
    let entry = ratios.split("<section id=\"oz-debtratio\"").nth(1).unwrap();
    let entry = entry.split("</section>").next().unwrap();
    assert!(entry.contains("Part of this function’s help text is not reproduced here."));
    assert!(entry.contains(&format!(
        "href=\"https://github.com/ryanduguid/Ozzit/blob/{}/src/Ratios.txt\"",
        tag()
    )));
}

#[test]
fn help_text_is_escaped_and_lambda_marked() {
    let pages = pages(&repository());
    let financial = &pages
        .iter()
        .find(|(r, _)| r.contains("/financial/"))
        .unwrap()
        .1;
    assert!(financial.contains(
        "<code>=oz.Amortise<span class=\"function-symbol\">λ</span>(10000, 5%, 4 * 12, \"2026-07-01\")</code>"
    ));
    assert!(
        financial
            .contains("<dt><code>Principals</code> (required)</dt><dd>Loan/debt amounts.</dd>")
    );
}

#[test]
fn help_bullets_render_as_lists() {
    let pages = pages(&repository());
    let ratios = &pages
        .iter()
        .find(|(r, _)| r.contains("/ratios/"))
        .unwrap()
        .1;
    assert!(ratios.contains(
        "<dd>Quick Assets. Includes:<ul><li>Cash &amp; Cash equivalents</li><li>Marketable securities</li>"
    ));
    assert!(!pages.iter().any(|(_, html)| html.contains('•')));
}

#[test]
fn rows_after_an_introducing_colon_render_as_a_list() {
    let pages = pages(&repository());
    let ratios = &pages
        .iter()
        .find(|(r, _)| r.contains("/ratios/"))
        .unwrap()
        .1;
    assert!(
        ratios.contains(
            "<dd>Current Liabilities. Includes:<ul><li>Accounts payable</li><li>Wages</li>"
        )
    );
    let financial = &pages
        .iter()
        .find(|(r, _)| r.contains("/financial/"))
        .unwrap()
        .1;
    assert!(financial.contains("A date here is not a life: the arguments read"));
}

fn with_reference(
    edit: impl FnOnce(&mut serde_json::Value),
) -> Result<Vec<(String, String)>, String> {
    let root = inputs();
    let rel = function_reference();
    let mut document: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(root.path().join(&rel)).unwrap()).unwrap();
    edit(&mut document);
    std::fs::write(
        root.path().join(&rel),
        serde_json::to_string(&document).unwrap(),
    )
    .unwrap();
    site_tools::ozzit_functions::render_pages(root.path())
}

#[test]
fn a_duplicated_or_missing_entry_is_refused() {
    let error = with_reference(|d| {
        let functions = d["modules"][0]["functions"].as_array_mut().unwrap();
        functions[1] = functions[0].clone();
    })
    .unwrap_err();
    assert!(error.contains("more than once"), "{error}");
    let error = with_reference(|d| {
        d["modules"][0]["functions"]
            .as_array_mut()
            .unwrap()
            .remove(0);
    })
    .unwrap_err();
    assert!(error.contains("does not document"), "{error}");
}

#[test]
fn hostile_help_text_is_escaped_on_every_path() {
    let hostile = "<b>&\"λ";
    let pages = with_reference(|d| {
        let f = d["modules"][2]["functions"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|f| f["name"] == "oz.Amortiseλ")
            .unwrap();
        f["description"] = hostile.into();
        f["notes"] = serde_json::json!([hostile]);
        f["see_also"] = hostile.into();
        f["parameters"][0]["text"] = hostile.into();
        f["parameters"][0]["qualifier"] = hostile.into();
        f["examples"][0]["result"] = hostile.into();
        f["extra"] = serde_json::json!([{"heading": "NOTES", "rows": [{"label": hostile, "text": hostile}]}]);
    })
    .unwrap();
    let financial = &pages
        .iter()
        .find(|(r, _)| r.contains("/financial/"))
        .unwrap()
        .1;
    let entry = financial
        .split("<section id=\"oz-amortise\"")
        .nth(1)
        .unwrap();
    let entry = entry.split("</section>").next().unwrap();
    assert!(!entry.contains("<b>"), "{entry}");
    assert!(entry.contains("&lt;b&gt;&amp;"));
    // Visible text only: attributes such as aria-label may carry a bare λ.
    let spans = entry.replace("<span class=\"function-symbol\">λ</span>", "");
    let visible = regex::Regex::new("<[^>]*>")
        .unwrap()
        .replace_all(&spans, "");
    assert!(!visible.contains('λ'), "{visible}");
}

#[test]
fn restored_section_rows_are_published() {
    let pages = pages(&repository());
    let debt = &pages.iter().find(|(r, _)| r.contains("/debt/")).unwrap().1;
    assert!(debt.contains("<li>Debt opening balance</li>"));
    assert!(debt.contains("<li>Opening Balance</li>"));
}
