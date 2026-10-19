//! scripts/test_build_site.py: the rendered site and preview against a small Jekyll fixture.
mod common;

use common::{CONFIG, is_site_source, repository, site_selection};

use std::path::{Component, Path, PathBuf};

#[test]
fn site_selection_rules() {
    let (include, exclude) = site_selection(&repository());
    for (path, expected) in [
        ("assets/site.css", true),
        (".well-known/security.txt", true),
        (".git/config", false),
        ("scripts/test_build_site.py", false),
        ("GATES.md", false),
        ("graft/INDEX.md", false),
        ("graft/scripts/component.md", false),
        ("graft/graph.json", false),
        ("vendor/bundle/gem.css", false),
        ("_site/index.html", false),
        ("assets/work/report.css", true),
        ("assets/graft/guide.txt", true),
    ] {
        assert_eq!(
            is_site_source(path, &include, &exclude),
            expected,
            "{path}: selection"
        );
    }
}

/// No Sass reaches the build, so the unsupported Ruby Sass in the Jekyll 3 chain never runs:
/// no `.scss` or `.sass` source and no stylesheet with front matter.
#[test]
fn no_sass_sources() {
    let root = repository();
    let (include, exclude) = site_selection(&root);
    let mut offenders = Vec::new();
    let mut checked = 0;
    let mut pending = vec![String::new()];
    while let Some(dir) = pending.pop() {
        for entry in std::fs::read_dir(root.join(&dir)).unwrap().flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let relative = if dir.is_empty() {
                name
            } else {
                format!("{dir}/{name}")
            };
            // Excluded directories hold nothing Jekyll reads.
            if !is_site_source(&relative, &include, &exclude) {
                continue;
            }
            let path = entry.path();
            if path.is_dir() {
                pending.push(relative);
                continue;
            }
            match path.extension().and_then(|e| e.to_str()) {
                Some("scss" | "sass") => offenders.push(format!("{relative}: Sass source")),
                Some("css") => {
                    checked += 1;
                    let bytes = std::fs::read(&path).unwrap();
                    let start = bytes
                        .iter()
                        .position(|b| !b" \t\n\r\x0b\x0c".contains(b))
                        .unwrap_or(bytes.len());
                    if bytes[start..].starts_with(b"---") {
                        offenders.push(format!("{relative}: stylesheet with front matter"));
                    }
                }
                _ => {}
            }
        }
    }
    assert!(
        offenders.is_empty(),
        "Sass would reach the build:\n{}",
        offenders.join("\n")
    );
    assert!(
        checked > 0,
        "no stylesheet was inspected; the check is looking in the wrong place"
    );
}

/// `os.path.relpath(path)` from the current directory, on the same volume.
fn relative_to_cwd(path: &Path) -> PathBuf {
    let cwd = site_tools::py::resolve(&std::env::current_dir().unwrap());
    let path = site_tools::py::resolve(path);
    let (a, b): (Vec<Component>, Vec<Component>) =
        (cwd.components().collect(), path.components().collect());
    let common = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let mut relative = PathBuf::new();
    for _ in common..a.len() {
        relative.push("..");
    }
    for part in &b[common..] {
        relative.push(part);
    }
    relative
}

/// Whether the repository's locked Jekyll runs. Bundler alone is not enough: CI's
/// Windows image ships Ruby and Bundler without the site's gems.
fn locked_jekyll() -> bool {
    std::process::Command::new(if cfg!(windows) {
        "bundle.bat"
    } else {
        "bundle"
    })
    .arg("exec")
    .arg(format!(
        "--gemfile={}",
        repository().join("Gemfile").display()
    ))
    .args(["jekyll", "--version"])
    .output()
    .is_ok_and(|o| o.status.success())
}

/// The fixture renders with the repository's lock and exclusions, from an absolute or
/// relative source, and the preview serves the rendered page.
#[test]
fn jekyll_fixture_build_and_preview() {
    if !locked_jekyll() {
        eprintln!("skipped: the locked Jekyll is not installed (the Linux site checks run this)");
        return;
    }
    let repository = repository();
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    std::fs::create_dir(root.join("_includes")).unwrap();
    std::fs::create_dir(root.join("_layouts")).unwrap();
    std::fs::write(
        root.join("_layouts/fixture.html"),
        concat!(
            "<html><head><link rel=\"modulepreload\" href=\"/assets/fixture.mjs\" />",
            "<link rel=\"stylesheet\" href=\"/assets/tokens.css?v={{ site.asset_version }}\" />",
            "<link rel=\"stylesheet\" href=\"/assets/site.css?v={{ site.asset_version }}\" /></head>",
            "<body>{{ content }}</body></html>",
        ),
    )
    .unwrap();
    std::fs::write(
        root.join("Gemfile"),
        "raise \"The fixture Gemfile must not replace the repository lock\"\n",
    )
    .unwrap();
    std::fs::write(
        root.join("_includes/nav.html"),
        "<nav><a href=\"/\"{% if page.url == \"/\" %} aria-current=\"page\"{% endif %}>Home</a></nav>",
    )
    .unwrap();
    std::fs::write(
        root.join("index.html"),
        "---\nlayout: fixture\n---\n{% include nav.html %}<main id=\"main\">Café</main>",
    )
    .unwrap();
    std::fs::write(root.join("robots.txt"), "User-agent: *\n").unwrap();
    // Build with the repository's exclusions, changing only the stylesheet version.
    let config_source = std::fs::read_to_string(repository.join(CONFIG)).unwrap();
    let config: String = config_source
        .split_inclusive('\n')
        .map(|line| {
            if line.starts_with("asset_version:") {
                let ending = &line[line.trim_end_matches(['\r', '\n']).len()..];
                format!("asset_version: \"20300101\"{ending}")
            } else {
                line.to_owned()
            }
        })
        .collect();
    std::fs::write(root.join(CONFIG), &config).unwrap();
    std::fs::write(root.join("GATES.md"), "Internal planning fixture\n").unwrap();
    let fixture_files: [(&str, &[u8]); 4] = [
        ("graft/INDEX.md", b"Generated index fixture\n"),
        (
            "graft/scripts/component.md",
            b"Generated component fixture\n",
        ),
        ("graft/graph.json", b"{\"fixture\": true}\n"),
        ("assets/graft/guide.txt", b"Public asset fixture\n"),
    ];
    for (relative, content) in fixture_files {
        let path = root.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, content).unwrap();
    }
    std::fs::create_dir_all(root.join("_site/graft")).unwrap();
    std::fs::write(root.join("_site/graft/stale.md"), "Stale index fixture\n").unwrap();
    let rendered = site_tools::build_site::build(&repository, root).unwrap();
    let mut expected = concat!(
        "<html><head><link rel=\"modulepreload\" href=\"/assets/fixture.mjs\" />",
        "<link rel=\"stylesheet\" href=\"/assets/tokens.css?v=20300101\" />",
        "<link rel=\"stylesheet\" href=\"/assets/site.css?v=20300101\" /></head>",
        "<body><nav><a href=\"/\" aria-current=\"page\">Home</a></nav>",
        "<main id=\"main\">Café</main></body></html>",
    )
    .to_owned();
    assert_eq!(
        std::fs::read_to_string(rendered.join("index.html")).unwrap(),
        expected
    );
    std::fs::write(root.join(CONFIG), config.replace("20300101", "20300102")).unwrap();
    expected = expected.replace("20300101", "20300102");
    let relative_rendered =
        site_tools::build_site::build(&repository, &relative_to_cwd(root)).unwrap();
    assert_eq!(
        relative_rendered,
        site_tools::py::resolve(root).join("_site")
    );
    assert_eq!(
        std::fs::read_to_string(relative_rendered.join("index.html")).unwrap(),
        expected
    );
    assert_eq!(
        std::fs::read_to_string(rendered.join("robots.txt")).unwrap(),
        "User-agent: *\n"
    );
    assert!(!rendered.join("_includes").exists());
    assert!(!rendered.join("GATES.md").exists());
    assert!(!rendered.join("graft").exists());
    assert_eq!(
        std::fs::read(rendered.join("assets/graft/guide.txt")).unwrap(),
        b"Public asset fixture\n"
    );
    for (relative, content) in fixture_files {
        assert_eq!(std::fs::read(root.join(relative)).unwrap(), content);
    }
    let port = common::http::start(&rendered);
    let response = common::http::get(port, "/", &[]);
    assert_eq!(String::from_utf8(response.body).unwrap(), expected);
    let compressed = common::http::get(port, "/", &[("Accept-Encoding", "gzip")]);
    assert_eq!(common::http::gunzip(&compressed.body), expected.as_bytes());
}
