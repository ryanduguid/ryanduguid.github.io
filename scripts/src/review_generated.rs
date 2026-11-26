// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! `.github/review-generated.json` names the files a pre-merge review may omit because
//! its build reproduces them (CONTRIBUTING). Each generator's `--check` passes the files
//! it writes to `undeclared`, so a new generated file the declaration misses fails CI
//! instead of travelling to review in full.
use std::path::Path;

pub const DECLARATION: &str = ".github/review-generated.json";

/// Whether `rel` is an exact entry or falls under a `dir/**` entry of `specs`.
fn covered(rel: &str, specs: &[&str]) -> bool {
    specs.iter().any(|spec| match spec.strip_suffix("/**") {
        Some(dir) => rel
            .strip_prefix(dir)
            .is_some_and(|rest| rest.starts_with('/')),
        None => *spec == rel,
    })
}

/// A failure line for each file in `written` (paths below the site root, `/`-separated)
/// that the declaration does not cover. A tree without the declaration, such as a test
/// fixture, has nothing to cover; the site's own declaration is held by a test below.
pub fn undeclared<'a>(
    root: &Path,
    written: impl IntoIterator<Item = &'a str>,
) -> Result<Vec<String>, String> {
    let path = root.join(DECLARATION);
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let json: serde_json::Value =
        serde_json::from_str(&crate::read(&path)?).map_err(|e| format!("{DECLARATION}: {e}"))?;
    let list = |key: &str| -> Vec<&str> {
        json.get(key)
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
            .unwrap_or_default()
    };
    let (paths, except) = (list("paths"), list("except"));
    Ok(written
        .into_iter()
        .filter(|rel| !covered(rel, &paths) || covered(rel, &except))
        .map(|rel| format!("{rel} is generated but {DECLARATION} does not declare it"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(declaration: Option<&str>) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        if let Some(text) = declaration {
            std::fs::create_dir_all(dir.path().join(".github")).unwrap();
            std::fs::write(dir.path().join(DECLARATION), text).unwrap();
        }
        dir
    }

    #[test]
    fn exact_entries_and_subtrees_cover_files() {
        let dir = tree(Some(
            r#"{"paths": ["llms-full.txt", "tools/a/**"], "except": ["tools/a/keep.json"]}"#,
        ));
        let found = undeclared(
            dir.path(),
            [
                "llms-full.txt",
                "tools/a/b/index.txt",
                "tools/a/keep.json",
                "tools/ab/index.txt",
                "tools/a",
                "llms-full-new-1.txt",
            ],
        )
        .unwrap();
        let named: Vec<&str> = found
            .iter()
            .map(|line| line.split(' ').next().unwrap())
            .collect();
        assert_eq!(
            named,
            [
                "tools/a/keep.json",
                "tools/ab/index.txt",
                "tools/a",
                "llms-full-new-1.txt"
            ]
        );
        assert_eq!(
            found[0],
            "tools/a/keep.json is generated but .github/review-generated.json does not declare it"
        );
    }

    #[test]
    fn a_tree_without_the_declaration_has_nothing_to_cover() {
        let dir = tree(None);
        assert!(
            undeclared(dir.path(), ["llms-full.txt"])
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn a_malformed_declaration_is_an_error() {
        let dir = tree(Some("{"));
        let err = undeclared(dir.path(), ["llms-full.txt"]).unwrap_err();
        assert!(err.starts_with(DECLARATION), "{err}");
        let dir = tree(Some("[]"));
        assert_eq!(undeclared(dir.path(), ["x"]).unwrap().len(), 1);
    }

    /// Deleting the site's declaration would turn every generator's check into a no-op.
    #[test]
    fn the_site_keeps_its_declaration() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
        let json: serde_json::Value =
            serde_json::from_str(&crate::read(&root.join(DECLARATION)).unwrap()).unwrap();
        assert_eq!(json["format"], "review-generated/1");
        assert!(json["paths"].as_array().is_some_and(|p| !p.is_empty()));
        assert!(json["build"].as_array().is_some_and(|b| !b.is_empty()));
    }
}
