//! scripts/build_ozzit_reference.py: build the Ozzit page's ten worked examples and its
//! index of every named formula from the pinned release index.
//!
//! The example and record files are JSON the script reads with Python's own semantics
//! (dict and set equality, `len`, iteration and subscripts on any decoded value), so the
//! checks here follow those rules over `Json` values rather than a typed schema.
use crate::html::escape;
use crate::pycsv::{self, DictRow};
use crate::pyformat;
use crate::pyjson::{self, Json};
use crate::pyobj::{Dict, hashable, iterate, py_len, set, set_eq, subscript, type_name};
use crate::pyre::re;
use std::path::Path;

const INDEX: &str = "assets/ozzit-functions-v3.4.2.csv";
const EXAMPLES: &str = "scripts/ozzit_reference_examples.json";
const RECORD: &str = "assets/ozzit-reference-v3.4.2.json";
const OUTPUT: &str = "_includes/ozzit-reference.html";
const INDEX_OUTPUT: &str = "_includes/ozzit-function-index.html";
const WORKBOOK_SHA256: &str = "0306793a7e473ce70e78149fea1e107fc0f714d61ab50960c16f6fd528878f6f";
const USAGE: &str = "usage: build_ozzit_reference.py [-h] [--write] [--check]\n";
const HELP: &str = "usage: build_ozzit_reference.py [-h] [--write] [--check]

Build the Ozzit page's ten worked examples and its index of every named
formula from the pinned release index.

options:
  -h, --help  show this help message and exit
  --write
  --check
";

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

pub fn load_index(root: &Path) -> Result<Vec<DictRow>> {
    let path = root.join(INDEX);
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
    let rows = load_index(root)?;
    let mut names: Vec<Option<&str>> = Vec::new();
    if rows.len() == 138 {
        for row in &rows {
            let name = field(row, "function")?;
            if !names.contains(&name) {
                names.push(name);
            }
        }
    }
    if rows.len() != 138 || names.len() != 138 {
        return Err(value_error(
            "Expected the 138 unique named formulas in the v3.4.2 index",
        ));
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
        let source = format!("https://github.com/ryanduguid/Ozzit/blob/v3.4.2/src/{module}.txt");
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
    let record = load_json(root, RECORD)?;
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
    if !subscript(&record, &key("workbook_sha256"))?.py_eq(&key(WORKBOOK_SHA256)) {
        return Err(value_error(
            "Native results must identify the v3.4.2 release workbook",
        ));
    }
    if functions.len() != 138 || functions.len() != rows.len() {
        return Err(value_error(
            "Expected the 138 unique named formulas in the v3.4.2 index",
        ));
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
        let module = field_text(row, "module", "replace")?;
        parts.push(format!(
            "  <p><a href=\"#fn-{anchor}\">Link to this example</a> · <a href=\"https://github.com/ryanduguid/Ozzit/blob/v3.4.2/src/{}.txt\">Released formula source<span class=\"visually-hidden\">, {}</span></a></p>",
            escape(module, true),
            escape(&title, true)
        ));
        parts.push("</details>".into());
    }
    Ok(parts.join("\n") + "\n")
}

const PARSER: crate::pyargs::Parser = crate::pyargs::Parser {
    prog: "build_ozzit_reference.py",
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
