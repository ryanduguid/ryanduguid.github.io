pub mod agent_skills;
pub mod build_site;
pub mod check_design;
pub mod check_publication;
pub mod check_seo;
pub mod extract_xero_badge;
pub mod favicon_render;
pub mod feed;
pub mod fetch;
pub mod html;
pub mod htmlparser;
pub mod llms_full;
pub mod mimetypes;
pub mod ozzit_reference;
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
pub mod seo_core;
pub mod serve_site;
pub mod site_contracts;

use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Python's text streams translate LF to CRLF on Windows, unlike Rust's.
pub fn print_text(text: &str, stderr: bool) -> io::Result<()> {
    let text = if cfg!(windows) {
        text.replace('\n', "\r\n")
    } else {
        text.to_owned()
    };
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

pub fn sha256(bytes: impl AsRef<[u8]>) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
