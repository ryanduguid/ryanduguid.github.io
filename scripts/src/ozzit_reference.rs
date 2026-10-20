//! scripts/build_ozzit_reference.py: build the Ozzit page's ten worked examples and its
//! index of every named formula from the release the record says the page documents,
//! and check every count a page states for the library against that index.
//!
//! The example and record files are JSON the script reads with Python's own semantics
//! (dict and set equality, `len`, iteration and subscripts on any decoded value), so the
//! checks here follow those rules over `Json` values rather than a typed schema.
use crate::html::escape;
use crate::pycsv::{self, DictRow};
use crate::pyformat;
use crate::pyjson::{self, Json};
use crate::pyobj::{Dict, hashable, iterate, py_len, set, set_eq, subscript, type_name};
use crate::pyre::{I, re};
use std::path::Path;

const EXAMPLES: &str = "scripts/ozzit_reference_examples.json";
const OUTPUT: &str = "_includes/ozzit-reference.html";
const INDEX_OUTPUT: &str = "_includes/ozzit-function-index.html";
/// Pages that state the library's size. Each stated count must match the index.
pub const COUNT_PAGES: [&str; 4] = [
    "tools/ozzit/index.html",
    "tools/index.html",
    "index.html",
    "llms.txt",
];
const NAMED_COUNT: &str = r"\b(?:all|carries) (\d+) named formulas";
const LAMBDA_COUNT: &str = r"\b(\d+) (?:native )?(?:Excel )?LAMBDA functions|\b(\d+) functions and";
const TABLE_COUNT: &str = r"\b(\d+) help tables";
const USAGE: &str = include_str!("help/build_ozzit_reference.usage");
const HELP: &str = include_str!("help/build_ozzit_reference.txt");

type Result<T> = std::result::Result<T, String>;

fn value_error(message: &str) -> String {
    format!("ValueError: {message}")
}

// ------------------------------------------------- Python operations on decoded values

fn text(value: &Json, method: &str) -> Result<String> {
    match value {
        Json::Str(s) => Ok(s.clone()),
        other => Err(format!(
            "AttributeError: '{}' object has no attribute '{method}'",
            type_name(other)
        )),
    }
}

fn field<'a>(row: &'a DictRow, name: &str) -> Result<Option<&'a str>> {
    row.iter()
        .find(|(k, _)| k == name)
        .map(|(_, v)| v.as_deref())
        .ok_or_else(|| format!("KeyError: {}", crate::py::repr_str(name)))
}

fn field_text<'a>(row: &'a DictRow, name: &str, method: &str) -> Result<&'a str> {
    field(row, name)?
        .ok_or_else(|| format!("AttributeError: 'NoneType' object has no attribute '{method}'"))
}

// ------------------------------------------------------------------- the generator

fn code(value: &str) -> String {
    escape(value, true).replace('λ', "<span class=\"function-symbol\">λ</span>")
}

/// The tag the Ozzit page documents and the SHA-256 of that release's workbook.
pub fn documented_release(root: &Path) -> Result<(String, Json)> {
    let key = Json::str_obj;
    let record = crate::release_record::load(root)?;
    let component = subscript(&subscript(&record, &key("components"))?, &key("ozzit"))?;
    let documented = subscript(&component, &key("documented"))?;
    let published = subscript(&component, &key("published"))?;
    let tag = subscript(&documented, &key("tag"))?;
    let version = subscript(&documented, &key("version"))?;
    let present = |value: &Json| !matches!(value, Json::Null);
    // A page documenting an older release records that release's hash itself.
    // `documented` subscripted as a dict above, so it is a dict here.
    let mut sha256 = documented
        .get("asset_sha256")
        .filter(|v| present(v))
        .cloned();
    if sha256.is_none() && version.py_eq(&subscript(&published, &key("version"))?) {
        sha256 = Some(subscript(&published, &key("asset_sha256"))?).filter(present);
    }
    let sha256 = sha256
        .ok_or_else(|| value_error("Record asset_sha256 for the documented Ozzit release"))?;
    Ok((tag.py_str(), sha256))
}

pub fn load_index(root: &Path) -> Result<Vec<DictRow>> {
    let (tag, _) = documented_release(root)?;
    let path = root.join(format!("assets/ozzit-functions-{tag}.csv"));
    let bytes = std::fs::read(&path).map_err(|e| {
        crate::py::oserror_str(&e, &path.to_string_lossy(), crate::py::OsStyle::Errno)
    })?;
    let text = crate::py::decode_utf8(&bytes).map_err(|e| e.to_string())?;
    pycsv::dict_reader(&text)
}

/// A fragment id from the function name alone, so it survives module moves.
pub fn anchor(function: &str) -> String {
    let name = function
        .strip_prefix("oz.")
        .unwrap_or(function)
        .to_lowercase();
    format!("oz-{}", re("[^a-z0-9]", 0).sub("", &name))
}

pub fn render_index(root: &Path) -> Result<String> {
    let (tag, _) = documented_release(root)?;
    let rows = load_index(root)?;
    let mut names: Vec<Option<&str>> = Vec::new();
    for row in &rows {
        let name = field(row, "function")?;
        if !names.contains(&name) {
            names.push(name);
        }
    }
    if names.len() != rows.len() {
        return Err(value_error(&format!(
            "Every named formula in the {tag} index must be unique"
        )));
    }
    let mut anchors = Vec::new();
    for row in &rows {
        anchors.push(anchor(field_text(row, "function", "removeprefix")?));
    }
    let mut unique = anchors.clone();
    unique.sort();
    unique.dedup();
    if unique.len() != anchors.len() {
        return Err(value_error("Two functions share a fragment id"));
    }
    let mut modules: Vec<(Option<&str>, Vec<&DictRow>)> = Vec::new();
    for row in &rows {
        let function = field_text(row, "function", "removeprefix")?;
        let name = function.strip_prefix("oz.").unwrap_or(function);
        let signature = field(row, "signature")?;
        let matches = || -> Result<bool> {
            Ok(signature == Some(name)
                || signature
                    .ok_or("AttributeError: 'NoneType' object has no attribute 'startswith'")?
                    .starts_with(&format!("{name}(")))
        };
        if !function.starts_with("oz.") || !matches()? {
            return Err(value_error(&format!(
                "{function}: signature does not match its function name"
            )));
        }
        let module = field(row, "module")?;
        match modules.iter_mut().find(|(m, _)| *m == module) {
            Some(entry) => entry.1.push(row),
            None => modules.push((module, vec![row])),
        }
    }
    // sorted(..., key=(-count, module)); None compares only when counts tie, and is
    // refused either way below, so it sorts first here.
    modules.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then(a.0.cmp(&b.0)));
    let mut parts = vec![
        "<!-- Generated by site-tools build_ozzit_reference from the pinned index. -->".to_owned(),
    ];
    for (module, members) in &modules {
        let module =
            module.ok_or("AttributeError: 'NoneType' object has no attribute 'replace'")?;
        parts.push("<details class=\"function-index\">".into());
        parts.push(format!(
            "  <summary><h3>{}, {} named formulas</h3></summary>",
            escape(module, true),
            members.len()
        ));
        // Safari drops list semantics from an unstyled list unless the role is explicit.
        parts.push("  <ul class=\"function-index__list\" role=\"list\">".into());
        for row in members {
            let call = format!("oz.{}", field_text(row, "signature", "__add__")?);
            parts.push(format!(
                "    <li id=\"{}\"><code>{}</code></li>",
                anchor(field_text(row, "function", "removeprefix")?),
                code(&call)
            ));
        }
        parts.push("  </ul>".into());
        let source = format!("https://github.com/ryanduguid/Ozzit/blob/{tag}/src/{module}.txt");
        parts.push(format!(
            "  <p><a href=\"{}\">Released {} source</a></p>",
            escape(&source, true),
            escape(module, true)
        ));
        parts.push("</details>".into());
    }
    Ok(parts.join("\n") + "\n")
}

fn expected_display(example: &Json, result: &Json) -> Result<String> {
    let shape = iterate(&subscript(example, &Json::str_obj("result_shape"))?)?;
    let [rows, columns] = <[Json; 2]>::try_from(shape).map_err(|shape| {
        if shape.len() > 2 {
            value_error("too many values to unpack (expected 2)")
        } else {
            value_error(&format!(
                "not enough values to unpack (expected 2, got {})",
                shape.len()
            ))
        }
    })?;
    let id = || subscript(example, &Json::str_obj("id")).map(|id| id.py_str());
    let shape_error = || -> Result<String> {
        Err(value_error(&format!(
            "{}: native result shape differs from the example",
            id()?
        )))
    };
    let Json::Array(result_rows) = result else {
        return shape_error();
    };
    let len = |n: usize| Json::Int(num_bigint::BigInt::from(n));
    if !len(result_rows.len()).py_eq(&rows)
        || result_rows
            .iter()
            .any(|row| !matches!(row, Json::Array(items) if len(items.len()).py_eq(&columns)))
    {
        return shape_error();
    }
    let values: Vec<Json> = result_rows
        .iter()
        .flat_map(|row| match row {
            Json::Array(items) => items.clone(),
            _ => Vec::new(),
        })
        .collect();
    let Json::Str(template) = subscript(example, &Json::str_obj("expected_template"))? else {
        return Err(value_error("Expected display template must be text"));
    };
    let total = if template.contains("{total") {
        pyformat::sum(&values)?
    } else {
        Json::Int(0.into())
    };
    let display = pyformat::format(&template, &values, &[("total", total)])?;
    if !Json::Str(display.clone()).py_eq(&subscript(example, &Json::str_obj("expected"))?) {
        return Err(value_error(&format!(
            "{}: expected display differs from native Excel results",
            id()?
        )));
    }
    Ok(display)
}

fn load_json(root: &Path, rel: &str) -> Result<Json> {
    pyjson::loads(&crate::read(&root.join(rel))?).map_err(|e| e.to_string())
}

pub fn render(root: &Path) -> Result<String> {
    let (tag, workbook_sha256) = documented_release(root)?;
    let rows = load_index(root)?;
    let mut functions: Vec<(String, &DictRow)> = Vec::new();
    for row in &rows {
        // A short row's None key cannot equal any example's function name.
        let key = field(row, "function")?
            .map_or("\u{0}None", |f| f)
            .to_owned();
        match functions.iter_mut().find(|(k, _)| *k == key) {
            Some(entry) => entry.1 = row,
            None => functions.push((key, row)),
        }
    }
    let examples = load_json(root, EXAMPLES)?;
    let record = load_json(root, &format!("assets/ozzit-reference-{tag}.json"))?;
    let key = Json::str_obj;
    let mut recorded = Dict::default();
    for case in iterate(&subscript(&record, &key("cases"))?)? {
        recorded.insert(
            subscript(&case, &key("id"))?,
            subscript(&case, &key("formula"))?,
        )?;
    }
    let mut formulas = Dict::default();
    for example in iterate(&examples)? {
        formulas.insert(
            subscript(&example, &key("id"))?,
            subscript(&example, &key("formula"))?,
        )?;
    }
    let results = subscript(&record, &key("results"))?;
    if !formulas.equals(&recorded) || !set_eq(&set(formulas.key_set())?, &set(iterate(&results)?)?)
    {
        return Err(value_error(
            "Examples need matching native Excel inputs and results",
        ));
    }
    // The record subscripted as a dict above, so it is a dict here.
    if !subscript(&record, &key("workbook_sha256"))?.py_eq(&workbook_sha256)
        || !record
            .get("release")
            .is_some_and(|release| release.py_eq(&Json::Str(tag.clone())))
    {
        return Err(value_error(&format!(
            "Native results must identify the {tag} release workbook"
        )));
    }
    if functions.len() != rows.len() {
        return Err(value_error(&format!(
            "Every named formula in the {tag} index must be unique"
        )));
    }
    let example_list = iterate(&examples)?;
    let unique_ids = || -> Result<usize> {
        let ids = example_list
            .iter()
            .map(|item| subscript(item, &key("id")))
            .collect::<Result<Vec<_>>>()?;
        Ok(set(ids)?.len())
    };
    if py_len(&examples)? != 10 || unique_ids()? != 10 {
        return Err(value_error("Expected ten unique example anchors"));
    }
    let mut parts = vec![
        "<!-- Generated by site-tools build_ozzit_reference; edit the example data. -->".to_owned(),
    ];
    for example in &example_list {
        let id = subscript(example, &key("id"))?;
        let display = expected_display(example, &subscript(&results, &id)?)?;
        let function = subscript(example, &key("function"))?;
        hashable(&function)?;
        let row = match &function {
            Json::Str(name) => functions.iter().find(|(k, _)| k == name).map(|(_, r)| *r),
            _ => None,
        }
        .ok_or_else(|| format!("KeyError: {}", function.repr()))?;
        let anchor = escape(&text(&id, "replace")?, true);
        let title = text(&subscript(example, &key("title"))?, "replace")?;
        parts.push(format!(
            "<details class=\"function-reference\" id=\"fn-{anchor}\">"
        ));
        parts.push(format!(
            "  <summary><h3>{}</h3></summary>",
            escape(&title, true)
        ));
        let function_name = field_text(row, "function", "replace")?;
        let description = field_text(row, "description", "replace")?;
        parts.push(format!(
            "  <p><code>{}</code>: {}</p>",
            code(function_name),
            escape(description, true)
        ));
        let signature = field_text(row, "signature", "replace")?;
        parts.push(format!(
            "  <p><strong>Signature:</strong> <code>{}</code>. Square brackets mark optional arguments.</p>",
            code(signature)
        ));
        let formula = text(&subscript(example, &key("formula"))?, "replace")?;
        parts.push(format!(
            "  <pre class=\"copyable\" tabindex=\"0\" role=\"region\" aria-label=\"{} formula\"><code>{}</code></pre>",
            escape(&title, true),
            code(&formula)
        ));
        parts.push(format!(
            "  <p><strong>Expected display:</strong> {}</p>",
            escape(&display, true)
        ));
        let note = text(&subscript(example, &key("note"))?, "replace")?;
        parts.push(format!(
            "  <p><strong>Limits:</strong> {}</p>",
            escape(&note, true)
        ));
        let module = field(row, "module")?.unwrap_or("None");
        let source = format!("https://github.com/ryanduguid/Ozzit/blob/{tag}/src/{module}.txt");
        parts.push(format!(
            "  <p><a href=\"#fn-{anchor}\">Link to this example</a> · <a href=\"{}\">Released formula source<span class=\"visually-hidden\">, {}</span></a></p>",
            escape(&source, true),
            escape(&title, true)
        ));
        parts.push("</details>".into());
    }
    Ok(parts.join("\n") + "\n")
}

/// Every count a page states for the library must match the index.
pub fn count_failures(root: &Path) -> Result<Vec<String>> {
    let (tag, _) = documented_release(root)?;
    let rows = load_index(root)?;
    let mut tables = 0;
    for row in &rows {
        tables += usize::from(field_text(row, "function", "startswith")?.starts_with("oz.About"));
    }
    let expected = [
        (re(NAMED_COUNT, I), rows.len(), "named formulas"),
        (re(LAMBDA_COUNT, 0), rows.len() - tables, "LAMBDA functions"),
        (re(TABLE_COUNT, 0), tables, "help tables"),
    ];
    let mut failures = Vec::new();
    for rel in COUNT_PAGES {
        let text = crate::read(&root.join(rel))?;
        for (pattern, count, label) in &expected {
            let mut stated: Vec<num_bigint::BigInt> = Vec::new();
            for value in pattern.findall_groups(&text).into_iter().flatten() {
                if value.is_empty() {
                    continue;
                }
                let value = value.parse().map_err(|_| {
                    value_error(&format!(
                        "invalid literal for int() with base 10: '{value}'"
                    ))
                })?;
                if !stated.contains(&value) {
                    stated.push(value);
                }
            }
            stated.sort();
            if stated.iter().any(|value| *value != (*count).into()) {
                let listed: Vec<String> = stated.iter().map(ToString::to_string).collect();
                failures.push(format!(
                    "{rel}: states [{}] {label}; the {tag} index has {count}",
                    listed.join(", ")
                ));
            }
        }
    }
    let page = crate::read(&root.join(COUNT_PAGES[0]))?;
    for (pattern, _, label) in &expected {
        if !pattern.is_match(&page) {
            failures.push(format!(
                "{}: no longer states the number of {label}",
                COUNT_PAGES[0]
            ));
        }
    }
    Ok(failures)
}

const PARSER: crate::pyargs::Parser = crate::pyargs::Parser {
    prog: "site-tools build_ozzit_reference",
    usage: USAGE,
    help: HELP,
    flags: &["--write", "--check"],
    exclusive: &[],
    required: false,
};

pub fn run(root: &Path, args: &[String]) -> Result<u8> {
    let write = match PARSER.parse(args) {
        crate::pyargs::Parsed::Flags(flags) => flags.contains(&"--write"),
        crate::pyargs::Parsed::Exit(code) => return Ok(code),
    };
    let outputs = [(OUTPUT, render(root)?), (INDEX_OUTPUT, render_index(root)?)];
    let say = |text: &str| crate::print_text(text, false).map_err(|e| e.to_string());
    let failures = count_failures(root)?;
    for failure in &failures {
        say(&format!("{failure}\n"))?;
    }
    if !failures.is_empty() {
        return Ok(1);
    }
    if write {
        for (rel, expected) in &outputs {
            let path = root.join(rel);
            std::fs::write(&path, expected).map_err(|e| {
                crate::py::oserror_str(&e, &path.to_string_lossy(), crate::py::OsStyle::Errno)
            })?;
        }
        say("Wrote ten Ozzit function examples and the index of every named formula\n")?;
        return Ok(0);
    }
    for (rel, expected) in &outputs {
        let path = root.join(rel);
        if !path.is_file() || crate::read(&path)? != *expected {
            let name = Path::new(rel)
                .file_name()
                .expect("a file name")
                .to_string_lossy();
            say(&format!(
                "{name} differs: run site-tools build_ozzit_reference --write\n"
            ))?;
            return Ok(1);
        }
    }
    say("Ozzit reference and index match the pinned index and examples\n")?;
    Ok(0)
}
