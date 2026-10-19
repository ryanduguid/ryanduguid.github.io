pub mod feed;
pub mod html;
pub mod py;
mod pyunicode;

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
    current
        .ancestors()
        .find(|p| p.join("_config.yml").is_file())
        .map(Path::to_path_buf)
        .ok_or_else(|| "Cannot locate _config.yml; set SITE_ROOT".into())
}

pub fn read(path: &Path) -> Result<String, String> {
    py::read_text(path).map_err(|e| match e {
        py::ReadError::Os(e) => py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Errno),
        py::ReadError::Decode(e) => e.to_string(),
    })
}

pub fn sha256(bytes: impl AsRef<[u8]>) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
