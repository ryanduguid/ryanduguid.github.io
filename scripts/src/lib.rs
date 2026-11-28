// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

pub mod about_portrait;
pub mod agent_files;
pub mod agent_skills;
pub mod ato_sources;
pub mod build_site;
pub mod cash_chart_webp;
pub mod check_design;
pub mod check_links;
mod check_links_data;
pub mod check_production;
pub mod check_publication;
pub mod check_seo;
pub mod check_site;
pub mod effective_life;
pub mod effective_life_pages;
pub mod extract_xero_badge;
pub mod favicon_render;
pub mod feed;
pub mod fetch;
pub mod html;
pub mod htmlparser;
pub mod llms_full;
pub mod merge_driver;
pub mod mimetypes;
pub mod minify_site;
pub mod node;
pub mod ozzit_functions;
pub mod ozzit_reference;
pub mod page_markdown;
pub mod passages;
pub mod pin_rates;
pub mod py;
pub mod pyargs;
pub mod pycsv;
pub mod pyformat;
pub mod pyjson;
pub mod pyobj;
pub mod pyre;
pub mod pytime;
mod pyunicode;
pub mod pyurl;
pub mod pyval;
pub mod rates_json;
pub mod rates_register;
pub mod release_record;
pub mod release_refresh;
pub mod review_generated;
pub mod schema_vocab;
pub mod search_console;
pub mod seo_core;
pub mod serve_site;
pub mod site_contracts;
pub mod source_freshness;
pub mod source_identity;
pub mod visibility;

use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Text as Python's text-mode streams and `Path.write_text` write it: LF becomes
/// CRLF on Windows, unlike Rust's.
pub fn platform_text(text: &str) -> String {
    if cfg!(windows) {
        text.replace('\n', "\r\n")
    } else {
        text.to_owned()
    }
}

pub fn print_text(text: &str, stderr: bool) -> io::Result<()> {
    let text = platform_text(text);
    if stderr {
        io::stderr().lock().write_all(text.as_bytes())
    } else {
        io::stdout().lock().write_all(text.as_bytes())
    }
}

pub fn root() -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("SITE_ROOT") {
        return Ok(PathBuf::from(root));
    }
    let current = std::env::current_dir().map_err(|e| e.to_string())?;
    // The scripts found the site as their own directory's parent; the binary takes the
    // nearest ancestor holding the site configuration or the scripts directory.
    current
        .ancestors()
        .find(|p| p.join("_config.yml").is_file() || p.join("scripts").is_dir())
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            "Cannot locate the site root (_config.yml or scripts/); set SITE_ROOT".into()
        })
}

pub fn read(path: &Path) -> Result<String, String> {
    py::read_text(path).map_err(|e| match e {
        py::ReadError::Os(e) => py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Errno),
        py::ReadError::Decode(e) => e.to_string(),
    })
}

/// Whether `Path.glob("*<suffix>")` matches a name: case-insensitively on Windows.
pub fn glob_suffix(name: &str, suffix: &str) -> bool {
    if cfg!(windows) {
        name.len() >= suffix.len()
            && name.is_char_boundary(name.len() - suffix.len())
            && name[name.len() - suffix.len()..].eq_ignore_ascii_case(suffix)
    } else {
        name.ends_with(suffix)
    }
}

/// `sorted(paths)`: pathlib compares parts, lower-cased on Windows.
pub fn sort_paths(paths: &mut [PathBuf]) {
    paths.sort_by_cached_key(|path| {
        path.components()
            .map(|c| {
                let part = c.as_os_str().to_string_lossy().into_owned();
                if cfg!(windows) {
                    part.to_lowercase()
                } else {
                    part
                }
            })
            .collect::<Vec<_>>()
    });
}

/// A calendar date written exactly YYYY-MM-DD in ASCII digits. jiff's `%Y` alone also takes
/// a sign, a space after the sign and leading whitespace, so it would read "- 2026-11-18" as
/// the year -2026.
pub fn iso_day(text: &str) -> Option<jiff::civil::Date> {
    let shaped = text.len() == 10
        && text.bytes().enumerate().all(|(i, byte)| match i {
            4 | 7 => byte == b'-',
            _ => byte.is_ascii_digit(),
        });
    shaped
        .then(|| jiff::civil::Date::strptime("%Y-%m-%d", text).ok())
        .flatten()
}

pub fn sha256(bytes: impl AsRef<[u8]>) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// pathlib's `suffix` of the final component: leading dots belong to the name, and a
/// trailing dot is a suffix of its own.
pub fn suffix(path: &Path) -> String {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let stem = name.trim_start_matches('.');
    stem.rfind('.')
        .map_or(String::new(), |i| stem[i..].to_owned())
}

#[cfg(test)]
mod tests {
    use super::iso_day;
    use jiff::civil::date;

    // The Windows behaviour of the path and text helpers, measured by the Windows
    // coverage run; the Linux suites cover the other side.
    #[cfg(windows)]
    #[test]
    fn windows_writes_crlf_and_matches_paths_without_case() {
        use super::{glob_suffix, platform_text, sort_paths};
        use std::path::PathBuf;
        assert_eq!(platform_text("a\nb\n"), "a\r\nb\r\n");
        assert!(glob_suffix("PAGE.HTML", ".html"));
        assert!(!glob_suffix("page.htm", ".html"));
        // A suffix length that falls inside a multibyte character is no match.
        assert!(!glob_suffix("aé", "x"));
        let mut paths = vec![PathBuf::from("a/Z"), PathBuf::from("a/b")];
        sort_paths(&mut paths);
        assert_eq!(paths, [PathBuf::from("a/b"), PathBuf::from("a/Z")]);
    }

    #[test]
    fn iso_day_reads_only_yyyy_mm_dd() {
        assert_eq!(iso_day("2026-11-18"), Some(date(2026, 11, 18)));
        assert_eq!(iso_day("2028-02-29"), Some(date(2028, 2, 29)));
        for text in [
            "- 2026-11-18",
            "+ 2026-11-18",
            "-2026-11-18",
            "+2026-11-18",
            " 2026-11-18",
            "\u{a0}2026-11-18",
            "2026-1-8",
            "2026-11-18 ",
            "+12026-11-18",
            "2026-02-29",
            "2026-13-01",
            "2026/11/18",
            "",
        ] {
            assert_eq!(iso_day(text), None, "{text:?}");
        }
    }
}
