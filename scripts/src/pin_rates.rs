//! scripts/pin_rates_dataset.py: write scripts/rates_dataset_extract.json from a checkout
//! of ryanduguid/australian-accounting.
//!
//! The dataset in that repository's packages/au-tax-rates-data is the single home for
//! dated figures. The site copies only the values its pages state, each pinned to the
//! SHA-256 of its record file at the checkout's HEAD, and the fact-check tests hold the
//! rate tables and question facts to those values.
use crate::py::PyPath;
use crate::pyjson::{self, Dump, Json};
use std::path::Path;
use std::process::Command;

const OUTPUT: &str = "scripts/rates_dataset_extract.json";
const DATASET_PATH: &str = "packages/au-tax-rates-data";
const RECORDS: [&str; 9] = [
    "car-limit-2026-27",
    "cents-per-km-2026-27",
    "div7a-benchmark-rate-2026-27",
    "fbt-rate",
    "gst-registration-threshold",
    "instant-asset-write-off-threshold",
    "medicare-levy-rate",
    "resident-tax-rates-2026-27",
    "super-guarantee-rate-2026-27",
];
const USAGE: &str =
    "Usage: site-tools pin_rates_dataset <path to an australian-accounting checkout>\n";

enum Git {
    Output(Vec<u8>),
    Failed(String),
}

/// `git -C <checkout> <args>` as `subprocess.run(..., check=True)` runs it.
fn git(checkout: &str, args: &[&str]) -> Result<Git, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(checkout)
        .args(args)
        .output()
        .map_err(|e| format!("FileNotFoundError: git: {e}"))?;
    if output.status.success() {
        Ok(Git::Output(output.stdout))
    } else {
        Ok(Git::Failed(format!(
            "subprocess.CalledProcessError: Command {:?} returned non-zero exit status {}.",
            [&["git", "-C", checkout], args].concat(),
            output.status.code().unwrap_or(1)
        )))
    }
}

pub fn run(root: &Path, args: &[String]) -> Result<u8, String> {
    let [checkout] = args else {
        crate::print_text(USAGE, true).map_err(|e| e.to_string())?;
        return Ok(2);
    };
    let shown = PyPath::new(checkout).display();
    let commit = match git(&shown, &["rev-parse", "HEAD"])? {
        Git::Output(out) => crate::py::decode_utf8(&out)
            .map_err(|e| e.to_string())?
            .trim_matches(crate::py::is_space)
            .to_owned(),
        Git::Failed(error) => return Err(error),
    };
    let mut records = Vec::new();
    for name in RECORDS {
        let record = format!("{DATASET_PATH}/data/{name}.json");
        // The committed blob, not the working copy, so line endings cannot move the digest.
        let raw = match git(&shown, &["show", &format!("{commit}:{record}")])? {
            Git::Output(raw) => raw,
            Git::Failed(_) => {
                let short = crate::py::prefix_chars(&commit, 12);
                crate::print_text(&format!("{shown} has no {record} at {short}\n"), true)
                    .map_err(|e| e.to_string())?;
                return Ok(1);
            }
        };
        let value = pyjson::loads_bytes(&raw).map_err(|e| e.to_string())?;
        let value = match &value {
            Json::Object(_) => value
                .get("value")
                .cloned()
                .ok_or_else(|| "KeyError: 'value'".to_owned())?,
            Json::Array(_) => {
                return Err("TypeError: list indices must be integers or slices, not str".into());
            }
            Json::Str(_) => {
                return Err("TypeError: string indices must be integers, not 'str'".into());
            }
            other => {
                return Err(format!(
                    "TypeError: '{}' object is not subscriptable",
                    match other {
                        Json::Null => "NoneType",
                        Json::Bool(_) => "bool",
                        Json::Int(_) => "int",
                        _ => "float",
                    }
                ));
            }
        };
        records.push((
            name.to_owned(),
            Json::Object(vec![
                ("sha256".into(), Json::Str(crate::sha256(&raw))),
                ("value".into(), value),
            ]),
        ));
    }
    let document = Json::Object(vec![
        (
            "source".into(),
            Json::str_obj("ryanduguid/australian-accounting"),
        ),
        ("path".into(), Json::str_obj(DATASET_PATH)),
        ("commit".into(), Json::Str(commit.clone())),
        ("records".into(), Json::Object(records)),
    ]);
    let text = pyjson::dumps(
        &document,
        Dump {
            indent: Some(2),
            ..Dump::default()
        },
    ) + "\n";
    let output = root.join(OUTPUT);
    std::fs::write(&output, text).map_err(|e| {
        crate::py::oserror_str(&e, &output.to_string_lossy(), crate::py::OsStyle::Errno)
    })?;
    crate::print_text(
        &format!(
            "pinned {} records at {}\n",
            RECORDS.len(),
            crate::py::prefix_chars(&commit, 12)
        ),
        false,
    )
    .map_err(|e| e.to_string())?;
    Ok(0)
}
