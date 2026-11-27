//! `site-tools check_ato_sources` end to end, with the browser batch, the PDF reader and
//! the redirect request given in process, and the question rules the sweep leans on.
use serde_json::json;
use site_tools::ato_sources::{Page, answers_to_recheck, question_source_urls, sweep_with};
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

const PAGE: &str = "https://www.ato.gov.au/tax-rates-and-codes/general-interest-charge-rates";
const MOVED_TO: &str = "https://www.ato.gov.au/tax-rates-and-codes/gic-rates";
const TEXT: &str = "General interest charge rates\nThe rate for the December quarter is 11.17%.\nThe rate for the September quarter is 11.36%.";

fn write(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

/// A site under `root` whose one page cites `PAGE`.
fn site(root: &Path) -> std::path::PathBuf {
    let site = root.join("site");
    write(
        &site.join("rates/index.html"),
        &format!(r#"<a href="{PAGE}">Source</a>"#),
    );
    site
}

fn args(root: &Path, out: &Path) -> Vec<String> {
    [
        "--baseline".into(),
        root.join("baseline").display().to_string(),
        "--out".into(),
        out.display().to_string(),
        root.join("site").display().to_string(),
    ]
    .into()
}

/// Serves every requested URL as a 200 page; `final_url` and `text` override by URL.
fn pages(
    overrides: &HashMap<&str, (&str, &str)>,
) -> impl FnMut(&[String], &[&str]) -> Result<HashMap<String, Page>, String> {
    move |urls, _| {
        Ok(urls
            .iter()
            .map(|url| {
                let (final_url, text) = overrides
                    .get(url.as_str())
                    .copied()
                    .unwrap_or((url.as_str(), TEXT));
                let page = Page {
                    status: Some(200.0),
                    final_url: Some(final_url.into()),
                    text: Some(text.into()),
                    ..Page::default()
                };
                (url.clone(), page)
            })
            .collect())
    }
}

fn report(out: &Path) -> String {
    let mut files = std::fs::read_dir(out).unwrap();
    let file = files.next().unwrap().unwrap().path();
    assert!(files.next().is_none(), "one report");
    std::fs::read_to_string(file).unwrap()
}

#[test]
fn a_page_that_moved_for_good_is_reported_as_a_move_and_exits_2_without_an_issue_file() {
    let root = tempfile::tempdir().unwrap();
    site(root.path());
    let out = root.path().join("out");
    let moved = HashMap::from([(PAGE, (MOVED_TO, TEXT))]);
    let mut asked = Vec::new();
    let code = sweep_with(
        &args(root.path(), &out),
        &mut pages(&moved),
        &mut |url| panic!("no PDF is cited: {url}"),
        &mut |url| {
            asked.push(url.to_owned());
            Ok(if url == PAGE {
                (301, Some("/tax-rates-and-codes/gic-rates".into()))
            } else {
                (200, None)
            })
        },
    )
    .unwrap();
    assert_eq!(code, 2);
    assert_eq!(asked, [PAGE, MOVED_TO]);
    let report = report(&out);
    assert!(
        report.contains(PAGE) && report.contains(MOVED_TO),
        "{report}"
    );
    let mut left: Vec<String> = std::fs::read_dir(root.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    left.sort();
    assert_eq!(
        left,
        ["baseline", "out", "site"],
        "no issue file without --issue"
    );
}

#[test]
fn an_answer_without_an_id_is_still_listed_for_recheck() {
    let root = tempfile::tempdir().unwrap();
    let site = site(root.path());
    let stale = "https://www.ato.gov.au/stale-page";
    let questions = json!({
        "facts_checked": "2026-09-27",
        "sources": {"stale": {"url": stale}},
        "questions": [{"id": null, "source": "stale", "fact": "A checked fact."}],
    });
    write(
        &site.join("_data/accounting_questions.json"),
        &questions.to_string(),
    );
    let dated = format!("{TEXT}\nLast updated 3 November 2026");
    let out = root.path().join("out");
    let code = sweep_with(
        &args(root.path(), &out),
        &mut pages(&HashMap::from([(stale, (stale, dated.as_str()))])),
        &mut |url| panic!("no PDF is cited: {url}"),
        &mut |url| panic!("nothing moved: {url}"),
    )
    .unwrap();
    assert_eq!(code, 2);
    let report = report(&out);
    assert!(
        report.contains("Updated 2026-11-03, after the answers to questions  were checked"),
        "{report}"
    );
}

#[test]
fn a_report_that_cannot_be_saved_stops_the_sweep() {
    let root = tempfile::tempdir().unwrap();
    site(root.path());
    let out = root.path().join("out");
    write(&out, "a file where the report folder goes");
    let result = sweep_with(
        &args(root.path(), &out),
        &mut pages(&HashMap::new()),
        &mut |url| panic!("no PDF is cited: {url}"),
        &mut |url| panic!("nothing moved: {url}"),
    );
    let error = result.unwrap_err();
    assert!(error.contains("out"), "{error}");
    assert_eq!(
        std::fs::read_to_string(&out).unwrap(),
        "a file where the report folder goes"
    );
}

#[test]
fn list_without_a_folder_lists_the_site_root() {
    let root = tempfile::tempdir().unwrap();
    let site = site(root.path());
    let run = Command::new(env!("CARGO_BIN_EXE_site-tools"))
        .args(["check_ato_sources", "--list"])
        .env("SITE_ROOT", &site)
        .output()
        .unwrap();
    assert_eq!(run.status.code(), Some(0));
    let stdout = String::from_utf8_lossy(&run.stdout).replace('\\', "/");
    assert!(
        stdout.contains(&format!("{PAGE}\n  site/rates/index.html")),
        "{stdout}"
    );
    assert!(
        stdout.ends_with("of them watched outside the ATO\n"),
        "{stdout}"
    );
}

#[test]
fn fact_sources_that_are_not_a_list_are_refused() {
    let question = json!({"id": 1, "source": "a", "fact_sources": "a"});
    assert_eq!(
        question_source_urls(&json!({}), &question),
        Err("question.fact_sources is not iterable".into())
    );
}

#[test]
fn two_answers_on_one_stale_page_are_listed_together_once_each() {
    let stale = "https://www.ato.gov.au/stale-page";
    let data = json!({
        "facts_checked": "2026-09-27",
        "sources": {"stale": {"url": stale}},
        "questions": [
            {"id": 1, "source": "stale", "fact": "One."},
            {"id": 2, "source": "stale", "fact": "Two.", "fact_sources": ["stale"]},
        ],
    });
    let texts = HashMap::from([(stale.to_owned(), "Last updated 3 November 2026".to_owned())]);
    assert_eq!(
        answers_to_recheck(&data, &texts).unwrap(),
        [(
            stale.to_owned(),
            "2026-11-03".to_owned(),
            vec![json!(1), json!(2)]
        )]
    );
}

#[cfg(unix)]
mod batch {
    use site_tools::ato_sources::run_batch_within;
    use std::time::Duration;

    /// `sh -c script` gets `batch LIST --out-dir OUT ...` as `$0 $1 $2 $3`.
    fn run(script: &str, timeout: Duration) -> Result<Vec<(String, Option<String>)>, String> {
        let urls = ["https://www.ato.gov.au/a".to_owned()];
        let pages = run_batch_within(&["/bin/sh", "-c", script], &urls, &[], timeout)?;
        Ok(pages.into_iter().map(|(u, p)| (u, p.error)).collect())
    }

    #[test]
    fn an_index_that_is_not_a_list_is_refused() {
        let script = r#"mkdir -p "$3"; printf '{}' > "$3/index.json""#;
        assert_eq!(
            run(script, Duration::from_secs(60)),
            Err("index.json is not a list".into())
        );
    }

    #[test]
    fn a_page_the_browser_failed_keeps_its_error() {
        let script = r#"mkdir -p "$3"; printf '[{"url": "https://www.ato.gov.au/a", "error": "net::ERR_TIMED_OUT"}]' > "$3/index.json""#;
        assert_eq!(
            run(script, Duration::from_secs(60)),
            Ok(vec![(
                "https://www.ato.gov.au/a".into(),
                Some("net::ERR_TIMED_OUT".into())
            )])
        );
    }

    #[test]
    fn a_batch_past_its_time_limit_is_stopped_and_reported() {
        assert_eq!(
            run("sleep 30", Duration::from_millis(200)),
            Err(
                "nodriver batch wrote no index (spawnSync /bin/sh ETIMEDOUT); see its output above"
                    .into()
            )
        );
    }
}
