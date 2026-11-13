// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! `site-tools build_rates_json`: build and check `rates/rates.json`, every row of the
//! rate CSVs under `rates/` in one file.
//!
//! Each row keeps its CSV header names and cell text unchanged, so `source_url` and
//! `checked_at` come through as `check_rates_register` holds them. The announced measures
//! and the register are not rate tables (see `rates_register::rate_tables`) and stay out.
//! `--write` rewrites the file; `--check` fails when the committed file differs.
use crate::py;
use crate::pyargs::{Parsed, Parser};
use crate::pyjson::{self, Dump, Json};
use crate::rates_register::{posix_rel, rate_tables};
use num_bigint::BigInt;
use std::path::{Path, PathBuf};

pub const RATES_JSON_REL: &str = "rates/rates.json";
const SITE: &str = "https://duguid.com.au";
/// The repository's licence, as LICENSE and NOTICE state it; this file restates it.
pub const LICENCE: &str = "Ryan Duguid Public Attribution Licence 1.0 \
    (LicenseRef-Duguid-Public-Attribution-1.0), the licence of the repository this file \
    is built from: FSL-1.1-ALv2 with a public attribution condition. See LICENSE and NOTICE.";
const LICENCE_URL: &str = "https://github.com/ryanduguid/ryanduguid.github.io/blob/main/LICENSE";
const ADVICE_STATUS: &str =
    "Not advice. Verify each figure against its primary source at the time of use.";
const PARSER: Parser = Parser {
    prog: "site-tools build_rates_json",
    usage: include_str!("help/build_rates_json.usage"),
    help: include_str!("help/build_rates_json.txt"),
    flags: &["--write", "--check"],
    exclusive: &["--write", "--check"],
    required: true,
};

type Result<T> = std::result::Result<T, String>;

fn path(root: &Path) -> PathBuf {
    py::resolve(root).join(RATES_JSON_REL)
}

fn text(value: &str) -> Json {
    Json::Str(value.to_owned())
}

/// One table's rows, each an object of its header names and cell text. A row with more
/// or fewer cells than the header is an error, not a padded or truncated row.
fn table_rows(csv: &str, name: &str) -> Result<Vec<Json>> {
    let csv = csv.strip_prefix('\u{feff}').unwrap_or(csv);
    let mut rows = crate::pycsv::reader(csv)?.into_iter();
    let header = rows.next().ok_or_else(|| format!("{name}: no header"))?;
    let mut out = Vec::new();
    for (index, row) in rows.filter(|r| !r.is_empty()).enumerate() {
        if row.len() != header.len() {
            return Err(format!(
                "{name} row {}: {} cells under {} columns",
                index + 1,
                row.len(),
                header.len()
            ));
        }
        out.push(Json::Object(
            header
                .iter()
                .cloned()
                .zip(row.into_iter().map(Json::Str))
                .collect(),
        ));
    }
    Ok(out)
}

/// The text `rates/rates.json` should hold for the CSVs under `root/rates`.
pub fn build(root: &Path) -> Result<String> {
    let rates = py::resolve(root).join("rates");
    let mut failures = Vec::new();
    let paths = rate_tables(&rates, &mut failures)?;
    if !failures.is_empty() {
        return Err(failures.join("; "));
    }
    let mut tables = Vec::new();
    for csv in paths {
        let rel = posix_rel(&csv, &rates);
        let table = rel.split('/').next().unwrap_or_default().to_owned();
        tables.push(Json::Object(vec![
            ("table".into(), text(&table)),
            ("page".into(), Json::Str(format!("{SITE}/rates/{table}/"))),
            ("csv".into(), Json::Str(format!("{SITE}/rates/{rel}"))),
            (
                "rows".into(),
                Json::Array(table_rows(&crate::read(&csv)?, &rel)?),
            ),
        ]));
    }
    let document = Json::Object(vec![
        ("schema_version".into(), Json::Int(BigInt::from(1))),
        (
            "description".into(),
            text(
                "Every row of the rate tables under https://duguid.com.au/rates/, built from their CSVs. Each value is the CSV cell's text; source_url and checked_at give each row's primary source and the date it was last checked against it.",
            ),
        ),
        ("licence".into(), text(LICENCE)),
        ("licence_url".into(), text(LICENCE_URL)),
        ("advice_status".into(), text(ADVICE_STATUS)),
        ("tables".into(), Json::Array(tables)),
    ]);
    Ok(pyjson::dumps(
        &document,
        Dump {
            indent: Some(2),
            ensure_ascii: false,
            ..Dump::default()
        },
    ) + "\n")
}

/// The failures of the committed file against the CSVs: none when it matches byte for byte.
pub fn check(root: &Path) -> Result<Vec<String>> {
    let expected = build(root)?;
    let committed = std::fs::read_to_string(path(root)).ok();
    Ok(match committed {
        Some(text) if text == expected => Vec::new(),
        Some(_) => vec![format!(
            "{RATES_JSON_REL} differs from the rate CSVs; run site-tools build_rates_json --write"
        )],
        None => vec![format!(
            "{RATES_JSON_REL} is missing; run site-tools build_rates_json --write"
        )],
    })
}

fn say(text: &str) -> Result<()> {
    crate::print_text(text, false).map_err(|e| e.to_string())
}

pub fn run(root: &Path, args: &[String]) -> Result<u8> {
    let flags = match PARSER.parse(args) {
        Parsed::Flags(flags) => flags,
        Parsed::Exit(code) => return Ok(code),
    };
    if flags.contains(&"--write") {
        let target = path(root);
        std::fs::write(&target, build(root)?)
            .map_err(|e| py::oserror_str(&e, &target.to_string_lossy(), py::OsStyle::Errno))?;
        say(&format!("{RATES_JSON_REL} written\n"))?;
        return Ok(0);
    }
    let failures = check(root)?;
    for failure in &failures {
        say(&format!("rates json: {failure}\n"))?;
    }
    if !failures.is_empty() {
        return Ok(1);
    }
    say(&format!("{RATES_JSON_REL} matches the rate CSVs\n"))?;
    Ok(0)
}
