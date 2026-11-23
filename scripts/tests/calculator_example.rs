// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Regression tests for `_includes/calculator-example.html` (R4836): splitting `rows` on `;`
//! must not split inside HTML character references such as `&amp;`, and every calculator include
//! in the repository must render clean label|figure rows.
mod common;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::Command;

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

/// Renders `_includes/calculator-example.html` with Ruby's bundled Liquid engine so the exact
/// Liquid syntax Jekyll executes is tested directly.
fn render_examples(items: &[serde_json::Value]) -> Vec<String> {
    let repo = common::repository();
    let template = repo.join("_includes/calculator-example.html");
    let gemfile = format!("--gemfile={}", repo.join("Gemfile").display());
    let script = concat!(
        "require \"liquid\"\n",
        "require \"json\"\n",
        "template_path = ARGV[0]\n",
        "items = JSON.parse(STDIN.read)\n",
        "tpl = Liquid::Template.parse(File.read(template_path))\n",
        "rendered = items.map { |data| tpl.render({ \"include\" => data }) }\n",
        "print JSON.generate(rendered)\n",
    );
    let mut script_file = tempfile::Builder::new()
        .prefix("calculator-example-")
        .suffix(".rb")
        .tempfile()
        .expect("create temporary Ruby helper");
    use std::io::Write;
    script_file
        .write_all(script.as_bytes())
        .expect("write temporary Ruby helper");
    let script_path = script_file.into_temp_path();
    let payload = serde_json::to_string(items).unwrap();
    let mut child = Command::new(which("bundle"))
        .current_dir(&repo)
        .args(["exec", &gemfile, "ruby"])
        .arg(&script_path)
        .arg(&template)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("bundle exec ruby");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(payload.as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "Liquid render failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).expect("rendered JSON array")
}

#[test]
fn calculator_example_preserves_html_entities_inside_rows() {
    let rendered = render_examples(&[serde_json::json!({
        "inputs": "R&amp;D expenditure $100,000.00",
        "rows": "R&amp;D tax offset|$43,500.00;Refundable &amp; non-refundable|$100.00 &ndash; $200.00;Numeric &#38; hex &#x26; check|$1.00",
        "principal": "0",
        "note": serde_json::Value::Null,
    })]);
    let html = &rendered[0];
    let row_open = regex::Regex::new(r#"<span class="result-row(?:\s|")"#).unwrap();
    assert_eq!(row_open.find_iter(html).count(), 3, "{html}");
    assert!(
        html.contains(r#"<span class="result-row result-row--principal"><span class="result-label">R&amp;D tax offset</span><span class="visually-hidden">:</span> <strong>$43,500.00</strong><span class="visually-hidden">.</span></span>"#),
        "{html}"
    );
    assert!(
        html.contains(r#"<span class="result-row result-row--stacked"><span class="result-label">Refundable &amp; non-refundable</span><span class="visually-hidden">:</span> <strong>$100.00 &ndash; $200.00</strong><span class="visually-hidden">.</span></span>"#),
        "{html}"
    );
    assert!(
        html.contains(r#"<span class="result-row"><span class="result-label">Numeric &#38; hex &#x26; check</span><span class="visually-hidden">:</span> <strong>$1.00</strong><span class="visually-hidden">.</span></span>"#),
        "{html}"
    );
}

#[test]
fn every_calculator_example_include_renders_complete_rows() {
    let repo = common::repository();
    let dir = repo.join("_includes/calculators");
    let tag_re = regex::Regex::new(
        r#"\{%\s*include\s+calculator-example\.html\s+inputs="([^"]*)"\s+rows="([^"]*)"\s+principal="(\d+)"(?:\s+note="([^"]*)")?\s*%\}"#,
    )
    .unwrap();
    let row_re = regex::Regex::new(
        r#"<span class="result-row(?: result-row--principal)?(?: result-row--stacked)?"><span class="result-label">([^<]+)</span><span class="visually-hidden">:</span> <strong>([^<]+)</strong><span class="visually-hidden">\.</span></span>"#,
    )
    .unwrap();
    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("html"))
        .collect();
    entries.sort();
    let mut meta = Vec::new();
    let mut payloads = Vec::new();
    for path in entries {
        let src = std::fs::read_to_string(&path).unwrap();
        for cap in tag_re.captures_iter(&src) {
            let principal: usize = cap[3].parse().unwrap();
            meta.push((path.display().to_string(), principal));
            payloads.push(serde_json::json!({
                "inputs": &cap[1],
                "rows": &cap[2],
                "principal": &cap[3],
                "note": cap.get(4).map(|m| m.as_str()),
            }));
        }
    }
    assert!(
        payloads.len() >= 30,
        "expected >= 30 calculator examples, found {}",
        payloads.len()
    );
    let rendered = render_examples(&payloads);
    let row_open = regex::Regex::new(r#"<span class="result-row(?:\s|")"#).unwrap();
    for ((label, principal_idx), html) in meta.iter().zip(&rendered) {
        let total_rows = row_open.find_iter(html).count();
        let valid_rows = row_re.captures_iter(html).count();
        assert!(total_rows > 0, "{label}: expected at least one row");
        assert_eq!(
            total_rows, valid_rows,
            "{label}: broken row markup (possibly split inside an HTML entity): {html}"
        );
        assert!(
            !html.contains("<strong></strong>"),
            "{label}: empty figure cell: {html}"
        );
        assert!(
            *principal_idx < total_rows,
            "{label}: principal {principal_idx} out of range for {total_rows} rows"
        );
    }
}
