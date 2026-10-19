//! scripts/test_rates_register.py: the rates register check, against a private copy of
//! the committed register.
mod common;

use site_tools::py::Date;
use site_tools::pyjson::{self, Dump, Json};
use site_tools::rates_register::{check_register, today};
use std::path::{Path, PathBuf};

fn committed() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../rates/register")
}

struct Register {
    _dir: tempfile::TempDir,
    root: PathBuf,
}

impl Register {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("register");
        common::copy_tree(&committed(), &root);
        Register { _dir: dir, root }
    }

    fn series(&self) -> PathBuf {
        self.root.join("series/coal-lsl-levy.json")
    }

    fn load(&self, path: &Path) -> Json {
        pyjson::loads(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    /// `json.dumps(payload, indent=2) + "\n"` with LF endings, then the sums refreshed.
    fn rewrite(&self, path: &Path, payload: &Json) {
        let text = pyjson::dumps(
            payload,
            Dump {
                indent: Some(2),
                ..Dump::default()
            },
        ) + "\n";
        std::fs::write(path, text).unwrap();
        self.resum();
    }

    fn resum(&self) {
        let mut files = Vec::new();
        let mut pending = vec![self.root.clone()];
        while let Some(dir) = pending.pop() {
            for entry in std::fs::read_dir(dir).unwrap().flatten() {
                let path = entry.path();
                if path.is_dir() {
                    pending.push(path);
                } else if path.file_name().unwrap() != "SHA256SUMS" {
                    files.push(path);
                }
            }
        }
        let mut lines: Vec<String> = files
            .iter()
            .map(|path| {
                let name = path
                    .strip_prefix(&self.root)
                    .unwrap()
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/");
                (name, site_tools::sha256(std::fs::read(path).unwrap()))
            })
            .map(|(name, digest)| format!("{digest}  {name}"))
            .collect();
        lines.sort_by(|a, b| a[66..].cmp(&b[66..]));
        std::fs::write(self.root.join("SHA256SUMS"), lines.join("\n") + "\n").unwrap();
    }

    fn check(&self) -> Vec<String> {
        check_register(&self.root, None).unwrap()
    }
}

fn member<'a>(value: &'a mut Json, key: &str) -> &'a mut Json {
    match value {
        Json::Object(pairs) => match pairs.iter().position(|(k, _)| k == key) {
            Some(i) => &mut pairs[i].1,
            None => {
                pairs.push((key.to_owned(), Json::Null));
                &mut pairs.last_mut().unwrap().1
            }
        },
        _ => panic!("not an object"),
    }
}

fn rows(payload: &mut Json) -> &mut Vec<Json> {
    match member(payload, "rows") {
        Json::Array(rows) => rows,
        _ => panic!("rows"),
    }
}

fn s(text: &str) -> Json {
    Json::Str(text.into())
}

fn any(failures: &[String], needle: &str) -> bool {
    failures.iter().any(|f| f.contains(needle))
}

#[test]
fn committed_register_passes() {
    assert_eq!(
        check_register(&committed(), None).unwrap(),
        Vec::<String>::new()
    );
}

#[test]
fn a_changed_byte_breaks_the_digest() {
    let register = Register::new();
    let text = std::fs::read_to_string(register.series()).unwrap();
    std::fs::write(register.series(), text.replace("\"2.7\"", "\"2.8\"")).unwrap();
    let failures = register.check();
    assert!(any(&failures, "digest does not match"), "{failures:?}");
}

#[test]
fn a_site_page_cannot_be_the_primary_source() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    *member(member(&mut rows(&mut payload)[0], "primary_source"), "url") =
        s("https://duguid.com.au/rates/coal-lsl-levy/");
    register.rewrite(&register.series(), &payload);
    let failures = register.check();
    assert!(any(&failures, "not a primary source host"), "{failures:?}");
}

#[test]
fn a_future_check_date_is_refused() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    *member(&mut rows(&mut payload)[0], "verified_at") = s("2099-01-01");
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "is in the future"));
}

/// A digest over CRLF bytes verifies only on the machine that wrote it.
#[test]
fn a_crlf_file_is_refused_where_its_digest_is_made() {
    let register = Register::new();
    let readme = register.root.join("README.md");
    let raw = std::fs::read(&readme).unwrap();
    let crlf: Vec<u8> = raw
        .iter()
        .flat_map(|b| {
            if *b == b'\n' {
                vec![b'\r', b'\n']
            } else {
                vec![*b]
            }
        })
        .collect();
    std::fs::write(&readme, crlf).unwrap();
    register.resum();
    assert!(any(&register.check(), "CRLF"));
}

#[test]
fn the_committed_register_has_no_crlf_file() {
    let mut pending = vec![committed()];
    let mut offenders = Vec::new();
    while let Some(dir) = pending.pop() {
        for entry in std::fs::read_dir(dir).unwrap().flatten() {
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if std::fs::read(&path)
                .unwrap()
                .windows(2)
                .any(|w| w == b"\r\n")
            {
                offenders.push(path);
            }
        }
    }
    assert!(offenders.is_empty(), "{offenders:?}");
}

/// A row checked this morning in Australia is not a future check.
#[test]
fn today_is_measured_where_the_checks_are_made() {
    let local = today();
    let utc = chrono::Utc::now().date_naive();
    let local = chrono::NaiveDate::from_ymd_opt(local.year, local.month, local.day).unwrap();
    assert!(matches!((local - utc).num_days(), 0 | 1));
}

#[test]
fn a_check_date_before_the_period_start_is_refused() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    *member(&mut rows(&mut payload)[0], "verified_at") = s("2020-01-01");
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "precedes period_start"));
}

#[test]
fn overlapping_rows_are_refused() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    let mut extra = rows(&mut payload)[0].clone();
    *member(&mut extra, "row_id") = s("2024-07-01");
    *member(&mut extra, "period_start") = s("2024-07-01");
    *member(&mut rows(&mut payload)[0], "period_end") = Json::Null;
    rows(&mut payload).push(extra);
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "overlap"));
}

#[test]
fn automated_retrieval_cannot_claim_professional_review() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    *member(&mut rows(&mut payload)[0], "review") = s("professional-review");
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "not professional review"));
}

#[test]
fn an_unverified_row_must_explain_itself() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    let row = &mut rows(&mut payload)[0];
    *member(row, "status") = s("unverified");
    *member(row, "verified_at") = Json::Null;
    *member(row, "verified_by") = Json::Null;
    if let Json::Object(pairs) = row {
        pairs.retain(|(k, _)| k != "verification_note");
    }
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "needs a verification_note"));
}

#[test]
fn a_superseded_row_must_be_named_by_its_replacement() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    *member(&mut rows(&mut payload)[0], "status") = s("superseded");
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "no row names it in supersedes"));
}

#[test]
fn an_unlisted_series_file_is_refused() {
    let register = Register::new();
    std::fs::copy(register.series(), register.root.join("series/made-up.json")).unwrap();
    register.resum();
    assert!(any(&register.check(), "does not match the files"));
}

/// A second series keeps its own dates; refreshing one must not refresh the other.
#[test]
fn one_series_check_date_does_not_travel_to_another() {
    let register = Register::new();
    let payload = register.load(&register.series());
    let mut other = payload.clone();
    *member(&mut other, "series_id") = s("example-series");
    *member(&mut rows(&mut other)[0], "verified_at") = s("2026-01-05");
    let path = register.root.join("series/example-series.json");
    let dump = |value: &Json| {
        pyjson::dumps(
            value,
            Dump {
                indent: Some(2),
                ..Dump::default()
            },
        ) + "\n"
    };
    std::fs::write(&path, dump(&other)).unwrap();
    let manifest_path = register.root.join("register.json");
    let mut manifest = register.load(&manifest_path);
    if let Json::Array(series) = member(&mut manifest, "series") {
        series.push(s("series/example-series.json"));
        series.sort_by_key(|v| v.py_str());
    }
    std::fs::write(&manifest_path, dump(&manifest)).unwrap();
    register.resum();
    assert_eq!(register.check(), Vec::<String>::new());
    let first = register.load(&register.series());
    let second = register.load(&path);
    let verified = |value: &Json| {
        let Some(Json::Array(rows)) = value.get("rows") else {
            panic!("rows")
        };
        rows[0].get("verified_at").unwrap().clone()
    };
    assert_eq!(verified(&first), s("2026-09-18"));
    assert_eq!(verified(&second), s("2026-01-05"));
}

#[test]
fn todays_date_is_what_bounds_a_check_date() {
    let register = Register::new();
    let payload = register.load(&register.series());
    register.rewrite(&register.series(), &payload);
    let day = |d| Some(Date::new(2026, 9, d).unwrap());
    assert_eq!(
        check_register(&register.root, day(18)).unwrap(),
        Vec::<String>::new()
    );
    let failures = check_register(&register.root, day(17)).unwrap();
    assert!(any(&failures, "is in the future"), "{failures:?}");
}

// Regressions from the 18 September 2026 review: each of these registers passed the
// checker before and should not have.

#[test]
fn a_backslash_makes_the_host_ambiguous_and_is_refused() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    *member(member(&mut rows(&mut payload)[0], "primary_source"), "url") =
        s("https://evil.example\\@www.legislation.gov.au/F2018L00217/latest/text");
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "backslash"));
}

#[test]
fn credentials_in_a_primary_source_url_are_refused() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    *member(member(&mut rows(&mut payload)[0], "primary_source"), "url") =
        s("https://user:pw@www.legislation.gov.au/F2018L00217/latest/text");
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "credentials"));
}

#[test]
fn a_row_cannot_supersede_itself() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    let row = &mut rows(&mut payload)[0];
    *member(row, "status") = s("superseded");
    let id = member(row, "row_id").clone();
    *member(row, "supersedes") = id;
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "supersedes itself"));
}

#[test]
fn only_one_replacement_may_name_a_superseded_row() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    let original = rows(&mut payload)[0].clone();
    *member(&mut rows(&mut payload)[0], "status") = s("superseded");
    *member(&mut rows(&mut payload)[0], "period_end") = s("2023-12-31");
    for (index, start) in ["2024-01-01", "2025-01-01"].iter().enumerate() {
        let mut row = original.clone();
        *member(&mut row, "row_id") = s(&format!("live-{index}"));
        *member(&mut row, "period_start") = s(start);
        *member(&mut row, "period_end") = if index == 0 {
            s("2024-12-31")
        } else {
            Json::Null
        };
        *member(&mut row, "supersedes") = original.get("row_id").unwrap().clone();
        rows(&mut payload).push(row);
    }
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "exactly one replacement"));
}

#[test]
fn a_live_row_cannot_be_superseded() {
    let register = Register::new();
    let mut payload = register.load(&register.series());
    let original = rows(&mut payload)[0].clone();
    *member(&mut rows(&mut payload)[0], "period_end") = s("2023-12-31");
    let mut replacement = original.clone();
    *member(&mut replacement, "row_id") = s("live-1");
    *member(&mut replacement, "period_start") = s("2024-01-01");
    *member(&mut replacement, "supersedes") = original.get("row_id").unwrap().clone();
    rows(&mut payload).push(replacement);
    register.rewrite(&register.series(), &payload);
    assert!(any(&register.check(), "rather than 'superseded'"));
}

#[test]
fn a_second_sha256sums_deeper_in_the_tree_is_still_covered() {
    let register = Register::new();
    std::fs::write(register.root.join("series/SHA256SUMS"), "x\n").unwrap();
    assert!(any(&register.check(), "series/SHA256SUMS is not listed"));
}

#[test]
fn an_unvalidated_series_in_a_subdirectory_is_refused() {
    let register = Register::new();
    let nested = register.root.join("series/extra");
    std::fs::create_dir(&nested).unwrap();
    std::fs::copy(register.series(), nested.join("made-up.json")).unwrap();
    register.resum();
    assert!(any(&register.check(), "does not match the files"));
}
