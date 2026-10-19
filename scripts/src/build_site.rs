//! scripts/build_site.py: build the public HTML with the same Jekyll version as GitHub Pages.
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

/// `shutil.which(name) or name`. On Windows a name without an extension also matches
/// with each PATHEXT extension, which finds Bundler's `bundle.bat`.
// shortcut: Python 3.12+ also searches the current directory first on Windows; the
// site's tools never sit there, so PATH alone is searched.
fn which(name: &str) -> PathBuf {
    let extensions: Vec<OsString> = if cfg!(windows) {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into())
            .split(';')
            .filter(|e| !e.is_empty())
            .map(|e| format!("{name}{}", e.to_lowercase()).into())
            .collect()
    } else {
        vec![name.into()]
    };
    std::env::var_os("PATH")
        .into_iter()
        .flat_map(|path| std::env::split_paths(&path).collect::<Vec<_>>())
        .flat_map(|dir| extensions.iter().map(move |name| dir.join(name)))
        .find(|candidate| candidate.is_file())
        .unwrap_or_else(|| name.into())
}

/// Render `source` into `source/_site` with the repository's locked gems.
pub fn build(root: &Path, source: &Path) -> Result<PathBuf, String> {
    let source = crate::py::resolve(source);
    let destination = source.join("_site");
    let gemfile = format!(
        "--gemfile={}",
        crate::py::resolve(root).join("Gemfile").display()
    );
    let bundle = which("bundle");
    let status = Command::new(&bundle)
        .args(["exec", &gemfile, "jekyll", "build", "--source"])
        .arg(&source)
        .arg("--destination")
        .arg(&destination)
        .current_dir(&source)
        .status()
        .map_err(|e| format!("{}: {e}", bundle.display()))?;
    if !status.success() {
        return Err(format!(
            "Command '{} exec {gemfile} jekyll build --source {} --destination {}' returned non-zero exit status {}.",
            bundle.display(),
            source.display(),
            destination.display(),
            status.code().unwrap_or(1)
        ));
    }
    Ok(destination)
}

pub fn run(root: &Path) -> Result<u8, String> {
    build(root, root)?;
    Ok(0)
}
