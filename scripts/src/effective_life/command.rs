// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! The `build_effective_life` command: build, check and write the data file.
use super::reader::parse;
use super::render::render;
use super::*;
use crate::py;
use crate::pyjson::{self, Json};
use chrono::NaiveDate;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// A date given as YYYY-MM-DD.
pub(super) fn iso(text: &str, what: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(text, "%Y-%m-%d")
        .map_err(|_| format!("{what}: '{text}' is not a date as YYYY-MM-DD"))
}

pub(super) fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// The data file's text for a source file, or the reasons it could not be built.
pub fn build(source_file: &Path, source: &Source) -> Result<String> {
    let bytes = std::fs::read(source_file)
        .map_err(|e| py::oserror_str(&e, &source_file.to_string_lossy(), py::OsStyle::Errno))?;
    let text = std::str::from_utf8(&bytes)
        .map_err(|e| format!("{}: {e}", source_file.to_string_lossy()))?;
    let determination =
        parse(text, &NESTING_CORRECTIONS).map_err(|failures| failures.join("\n"))?;
    Ok(render(&determination, &sha256_hex(&bytes), source))
}

pub(super) fn data_path(root: &Path) -> PathBuf {
    py::resolve(root).join(DATA_REL)
}

/// The source details the committed file records, for a rebuild to compare against it.
pub(super) fn committed_source(text: &str) -> Result<Source> {
    let document = pyjson::loads(text).map_err(|e| format!("{DATA_REL}: {}", e.0))?;
    let field = |key: &str| {
        document
            .get("source")
            .and_then(|source| source.get(key))
            .and_then(Json::as_str)
            .map(str::to_owned)
            .ok_or_else(|| format!("{DATA_REL}: source.{key} is missing"))
    };
    Ok(Source {
        register_id: field("register_id")?,
        registered: iso(&field("registered")?, "source.registered")?,
        url: field("url")?,
        read: iso(&field("read")?, "source.read")?,
    })
}

pub(super) fn say(text: &str, stderr: bool) -> Result<()> {
    crate::print_text(text, stderr).map_err(|e| e.to_string())
}

pub(super) fn usage_error(message: &str) -> Result<u8> {
    say(
        &format!("{USAGE}site-tools build_effective_life: error: {message}\n"),
        true,
    )?;
    Ok(2)
}

pub fn run(root: &Path, args: &[String]) -> Result<u8> {
    const VALUES: [&str; 5] = [
        "--source",
        "--register-id",
        "--registered",
        "--source-url",
        "--read",
    ];
    let (mut write, mut check) = (false, false);
    let mut values: [Option<&str>; 5] = [None; 5];
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                say(HELP, false)?;
                return Ok(0);
            }
            "--write" => write = true,
            "--check" => check = true,
            name => {
                let Some(slot) = VALUES.iter().position(|v| *v == name) else {
                    return usage_error(&format!("unrecognized arguments: {name}"));
                };
                let Some(value) = rest.next() else {
                    return usage_error(&format!("argument {name}: expected one argument"));
                };
                values[slot] = Some(value);
            }
        }
    }
    if write == check {
        return usage_error("one of the arguments --write --check is required");
    }
    let [source_file, details @ ..] = values;
    let Some(source_file) = source_file else {
        return usage_error("the following arguments are required: --source");
    };
    let target = data_path(root);
    if write {
        write_data(&target, source_file, details)
    } else {
        check_data(&target, source_file)
    }
}

/// Builds the data file from the source and its details, and writes it.
fn write_data(target: &Path, source_file: &str, details: [Option<&str>; 4]) -> Result<u8> {
    let [Some(register_id), Some(registered), Some(url), Some(read)] = details else {
        return usage_error("--write needs --register-id, --registered, --source-url and --read");
    };
    let (registered, read) = match (iso(registered, "--registered"), iso(read, "--read")) {
        (Ok(registered), Ok(read)) => (registered, read),
        (Err(message), _) | (_, Err(message)) => {
            return usage_error(&format!("argument {message}"));
        }
    };
    let source = Source {
        register_id: register_id.to_owned(),
        registered,
        url: url.to_owned(),
        read,
    };
    let text = build(Path::new(source_file), &source)?;
    std::fs::write(target, text)
        .map_err(|e| py::oserror_str(&e, &target.to_string_lossy(), py::OsStyle::Errno))?;
    say(&format!("{DATA_REL} written\n"), false)?;
    Ok(0)
}

/// Compares the committed data file with one built from the source.
fn check_data(target: &Path, source_file: &str) -> Result<u8> {
    let committed = crate::read(target)?;
    let expected = build(Path::new(source_file), &committed_source(&committed)?)?;
    if committed == expected {
        say(&format!("{DATA_REL} matches the source\n"), false)?;
        return Ok(0);
    }
    say(
        &format!(
            "effective life: {DATA_REL} differs from the source; rebuild it with --write and review the difference\n"
        ),
        false,
    )?;
    Ok(1)
}
