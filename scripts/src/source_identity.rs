// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The identity of the `scripts/` sources a site-tools binary is built from. `build.rs`
//! includes this file to embed the identity, and the binary recomputes it from the
//! checkout it runs in, so an installed binary older than the checkout cannot write.

use sha2::{Digest, Sha256};
use std::path::Path;

/// The build inputs outside `src/`.
const BUILD_FILES: [&str; 3] = ["Cargo.toml", "Cargo.lock", "build.rs"];

/// The command CONTRIBUTING.md gives for installing site-tools from the checkout.
pub const REINSTALL: &str = "cargo install --locked --path scripts";

/// A digest of every file under `scripts/src/` and of `BUILD_FILES`, by relative path and
/// content, so it does not depend on where the checkout is.
pub fn of(scripts: &Path) -> std::io::Result<String> {
    let mut files: Vec<String> = BUILD_FILES.iter().map(|name| (*name).to_owned()).collect();
    collect(scripts, &scripts.join("src"), &mut files)?;
    files.sort();
    let mut hasher = Sha256::new();
    for relative in &files {
        let bytes = std::fs::read(scripts.join(relative))?;
        hasher.update((relative.len() as u64).to_le_bytes());
        hasher.update(relative.as_bytes());
        hasher.update((bytes.len() as u64).to_le_bytes());
        hasher.update(&bytes);
    }
    Ok(hasher.finalize()[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

/// The files under `directory`, as paths relative to `scripts` with `/` separators.
fn collect(scripts: &Path, directory: &Path, files: &mut Vec<String>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(directory)? {
        let path = entry?.path();
        if path.is_dir() {
            collect(scripts, &path, files)?;
        } else {
            // `directory` is `scripts/src` or below it, so every entry is under `scripts`.
            let relative = path.strip_prefix(scripts).expect("an entry below scripts");
            let parts: Vec<_> = relative.iter().map(|part| part.to_string_lossy()).collect();
            files.push(parts.join("/"));
        }
    }
    Ok(())
}

/// Holds a binary built from the sources `built` to the checkout at `root`. When they
/// differ, or the checkout's sources cannot be read, a writing command gets an error
/// and any other command a warning. A root without the site-tools crate, such as a test
/// fixture, has nothing to compare.
pub fn check(root: &Path, built: &str, writes: bool) -> Result<Option<String>, String> {
    let scripts = root.join("scripts");
    if !scripts.join("Cargo.toml").is_file() {
        return Ok(None);
    }
    let checkout = match of(&scripts) {
        Ok(identity) if identity == built => return Ok(None),
        Ok(identity) => identity,
        Err(error) => format!("unreadable sources ({error})"),
    };
    let problem = format!(
        "this site-tools was built from scripts/ sources {built}, but {} holds {checkout}; \
         reinstall it with `{REINSTALL}`",
        scripts.display()
    );
    if writes {
        Err(format!("site-tools: refusing to write: {problem}"))
    } else {
        Ok(Some(format!("site-tools: warning: {problem}")))
    }
}
