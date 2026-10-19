//! scripts/check_rates_register.py: check the rates register's shape, provenance,
//! ordering and integrity.
//!
//! Rules a schema cannot express: primary sources sit on primary hosts; row ids are
//! unique, live rows do not overlap and are ordered with at most one open end;
//! `verified_at` is neither in the future nor before `period_start`; a superseded row is
//! named by exactly one replacement; register.json lists every series file once;
//! SHA256SUMS covers every file and matches LF bytes on disk; professional review names a
//! person.
use crate::py::{self, Date};
use crate::pyformat::py_str;
use crate::pyjson::{self, Json};
use crate::pyobj::{hashable, iterate, type_name};
use crate::pyre::fullmatch;
use std::cmp::Ordering;
use std::path::{Path, PathBuf};

const ADVICE_STATUS: &str =
    "Not advice. Verify each figure against its primary source at the time of use.";
const PRIMARY_HOSTS: [&str; 16] = [
    "www.legislation.gov.au",
    "legislation.gov.au",
    "www.ato.gov.au",
    "ato.gov.au",
    "www.rba.gov.au",
    "rba.gov.au",
    "standards.aasb.gov.au",
    "coallsl.com.au",
    "legislation.nsw.gov.au",
    "legislation.qld.gov.au",
    "legislation.vic.gov.au",
    "legislation.wa.gov.au",
    "legislation.sa.gov.au",
    "legislation.tas.gov.au",
    "legislation.act.gov.au",
    "legislation.nt.gov.au",
];
const UNITS: [&str; 5] = ["aud", "cents", "days", "fraction", "percent"];
const JURISDICTIONS: [&str; 9] = [
    "AU", "AU-NSW", "AU-QLD", "AU-VIC", "AU-WA", "AU-SA", "AU-TAS", "AU-ACT", "AU-NT",
];
const STATUSES: [&str; 3] = ["superseded", "unverified", "verified"];
const REVIEWS: [&str; 2] = ["automated-retrieval", "professional-review"];
const SLUG: &str = "^[a-z0-9]+(-[a-z0-9]+)*$";
const DECIMAL: &str = r"^-?[0-9]+(\.[0-9]+)?$";
const ROW_REQUIRED: [&str; 9] = [
    "row_id",
    "period_start",
    "period_end",
    "value",
    "status",
    "review",
    "primary_source",
    "verified_at",
    "verified_by",
];

type Result<T> = std::result::Result<T, String>;

fn repr(value: Option<&Json>) -> String {
    value.map_or("None".into(), Json::repr)
}

fn text(value: Option<&Json>) -> Result<String> {
    value.map_or(Ok("None".into()), py_str)
}

fn is_str(value: Option<&Json>, expected: &str) -> bool {
    matches!(value, Some(Json::Str(s)) if s == expected)
}

/// `value in {...}` for a set of strings: an unhashable value raises TypeError.
fn in_set(value: Option<&Json>, members: &[&str]) -> Result<bool> {
    match value {
        None => Ok(false),
        Some(v) => {
            hashable(v)?;
            Ok(matches!(v, Json::Str(s) if members.contains(&s.as_str())))
        }
    }
}

fn sorted_repr(members: &[&str]) -> String {
    format!(
        "[{}]",
        members
            .iter()
            .map(|m| py::repr_str(m))
            .collect::<Vec<_>>()
            .join(", ")
    )
}

/// `sorted(values)` with Python's ordering: strings by code point, numbers by value,
/// and TypeError when two values of incomparable kinds must be compared.
fn py_sorted(mut values: Vec<Json>) -> Result<Vec<Json>> {
    if values.len() < 2 {
        return Ok(values);
    }
    let number = |v: &Json| match v {
        Json::Bool(b) => Some(f64::from(u8::from(*b))),
        Json::Int(i) => num_traits::ToPrimitive::to_f64(i),
        Json::Float(f) => Some(*f),
        _ => None,
    };
    if values.iter().all(|v| matches!(v, Json::Str(_))) {
        values.sort_by(|a, b| match (a, b) {
            (Json::Str(a), Json::Str(b)) => a.cmp(b),
            _ => Ordering::Equal,
        });
        return Ok(values);
    }
    if values.iter().all(|v| number(v).is_some()) {
        values.sort_by(|a, b| number(a).partial_cmp(&number(b)).unwrap_or(Ordering::Equal));
        return Ok(values);
    }
    let first = values
        .iter()
        .find(|v| !matches!(v, Json::Str(_)))
        .expect("a value that is not a string");
    Err(format!(
        "TypeError: '<' not supported between instances of '{}' and '{}'",
        type_name(first),
        type_name(&values[0])
    ))
}

fn date(value: Option<&Json>, at: &str, failures: &mut Vec<String>) -> Option<Date> {
    let Some(Json::Str(s)) = value
        .filter(|v| matches!(v, Json::Str(s) if fullmatch("[0-9]{4}-[0-9]{2}-[0-9]{2}", 0, s)))
    else {
        failures.push(format!("{at}: {} is not a YYYY-MM-DD date", repr(value)));
        return None;
    };
    let parsed = Date::fromisoformat(s);
    if parsed.is_none() {
        failures.push(format!("{at}: {} is not a real calendar date", repr(value)));
    }
    parsed
}

/// A URL's scheme and, for a primary source, its host. A backslash is refused outright:
/// browsers read it as a path delimiter and other parsers as a character, so the host of
/// such a URL is ambiguous.
fn https_host(
    url: Option<&Json>,
    at: &str,
    failures: &mut Vec<String>,
    primary: bool,
) -> Result<()> {
    let shown = repr(url);
    let Some(Json::Str(url)) =
        url.filter(|u| matches!(u, Json::Str(s) if s.starts_with("https://")))
    else {
        failures.push(format!("{at}: {shown} must be an https URL"));
        return Ok(());
    };
    if url.contains('\\') {
        failures.push(format!(
            "{at}: {shown} contains a backslash. A backslash is a path delimiter to a \
             browser and an ordinary character to some parsers, so the host is ambiguous."
        ));
        return Ok(());
    }
    let parts = crate::pyurl::urlsplit(url).map_err(|e| format!("ValueError: {e}"))?;
    if let Some((userinfo, _)) = parts.netloc.rsplit_once('@') {
        let (username, password) = userinfo.split_once(':').unwrap_or((userinfo, ""));
        if !username.is_empty() || !password.is_empty() {
            failures.push(format!(
                "{at}: {shown} carries credentials in the authority"
            ));
            return Ok(());
        }
    }
    let host = crate::pyurl::hostname(&parts.netloc)
        .unwrap_or_default()
        .to_lowercase();
    if host.is_empty() {
        failures.push(format!("{at}: {shown} has no host"));
        return Ok(());
    }
    if primary && !PRIMARY_HOSTS.contains(&host.as_str()) {
        failures.push(format!(
            "{at}: {host} is not a primary source host. A site page, engine file or \
             skills index belongs in cross_checks."
        ));
    }
    Ok(())
}

fn keys(value: &Json) -> Vec<&str> {
    match value {
        Json::Object(pairs) => pairs.iter().map(|(k, _)| k.as_str()).collect(),
        _ => Vec::new(),
    }
}

fn check_row(row: &Json, series_id: &str, today: Date, failures: &mut Vec<String>) -> Result<()> {
    let at = format!("{series_id}: a row");
    if !matches!(row, Json::Object(_)) {
        failures.push(format!("{at} is not an object"));
        return Ok(());
    }
    let missing: Vec<&str> = ROW_REQUIRED
        .iter()
        .copied()
        .filter(|key| row.get(key).is_none())
        .collect();
    if !missing.is_empty() {
        failures.push(format!("{at}: missing {}", missing.join(", ")));
        return Ok(());
    }
    let get = |key: &str| row.get(key);
    let row_id = get("row_id");
    let at = format!("{series_id}/{}", text(row_id)?);
    if !matches!(row_id, Some(Json::Str(id)) if fullmatch(SLUG, 0, id)) {
        failures.push(format!("{at}: row_id is not a slug"));
    }
    if !in_set(get("status"), &STATUSES)? {
        failures.push(format!(
            "{at}: status {} is not one of {}",
            repr(get("status")),
            sorted_repr(&STATUSES)
        ));
    }
    if !in_set(get("review"), &REVIEWS)? {
        failures.push(format!(
            "{at}: review {} is not one of {}",
            repr(get("review")),
            sorted_repr(&REVIEWS)
        ));
    }
    if !matches!(get("value"), Some(Json::Str(v)) if fullmatch(DECIMAL, 0, v)) {
        failures.push(format!(
            "{at}: value must be a decimal string, not {}",
            repr(get("value"))
        ));
    }
    let start = date(get("period_start"), &format!("{at}.period_start"), failures);
    if !matches!(get("period_end"), Some(Json::Null)) {
        let end = date(get("period_end"), &format!("{at}.period_end"), failures);
        if let (Some(start), Some(end)) = (start, end)
            && end < start
        {
            failures.push(format!("{at}: period_end precedes period_start"));
        }
    }
    let source = get("primary_source").expect("required");
    let source_keys = keys(source);
    if !matches!(source, Json::Object(_))
        || !["title", "url", "publisher"]
            .iter()
            .all(|k| source_keys.contains(k))
    {
        failures.push(format!(
            "{at}: primary_source needs title, url and publisher"
        ));
    } else {
        https_host(
            source.get("url"),
            &format!("{at}.primary_source.url"),
            failures,
            true,
        )?;
    }
    let cross_checks = match get("cross_checks") {
        Some(value) => iterate(value)?,
        None => Vec::new(),
    };
    for (index, url) in cross_checks.iter().enumerate() {
        https_host(
            Some(url),
            &format!("{at}.cross_checks[{index}]"),
            failures,
            false,
        )?;
    }
    if is_str(get("status"), "unverified") {
        if !matches!(get("verified_at"), Some(Json::Null))
            || !matches!(get("verified_by"), Some(Json::Null))
        {
            failures.push(format!(
                "{at}: an unverified row must not carry a verification"
            ));
        }
        if !get("verification_note").is_some_and(Json::truthy) {
            failures.push(format!(
                "{at}: an unverified row needs a verification_note saying why"
            ));
        }
    } else {
        let verified = date(get("verified_at"), &format!("{at}.verified_at"), failures);
        if let Some(verified) = verified {
            if verified > today {
                failures.push(format!(
                    "{at}: verified_at {} is in the future",
                    text(get("verified_at"))?
                ));
            }
            if let Some(start) = start
                && verified < start
            {
                failures.push(format!(
                    "{at}: verified_at {} precedes period_start {}; the instrument was not yet in force",
                    text(get("verified_at"))?,
                    text(get("period_start"))?
                ));
            }
        }
        match get("verified_by") {
            Some(Json::Str(by)) if !py::strip(by).is_empty() => {
                if is_str(get("review"), "professional-review")
                    && by.to_lowercase().contains("automated")
                {
                    failures.push(format!(
                        "{at}: review is professional-review but verified_by describes an \
                         automated retrieval. Automated retrieval is not professional review."
                    ));
                }
            }
            _ => failures.push(format!(
                "{at}: verified_by must name who or what checked the figure"
            )),
        }
    }
    Ok(())
}

fn check_series(path: &Path, failures: &mut Vec<String>, today: Date) -> Result<()> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let raw = match std::fs::read(path) {
        Ok(raw) => raw,
        Err(e) => {
            let error = py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Errno);
            failures.push(format!("{name}: unreadable ({error})"));
            return Ok(());
        }
    };
    let text_body = py::decode_utf8(&raw)
        .map(|t| py::universal_newlines(&t))
        .map_err(|e| format!("UnicodeDecodeError: {e}"))?;
    let series = match pyjson::loads(&text_body) {
        Ok(series) => series,
        Err(e) => {
            failures.push(format!("{name}: unreadable ({e})"));
            return Ok(());
        }
    };
    if !matches!(series, Json::Object(_)) {
        return Err(format!(
            "AttributeError: '{}' object has no attribute 'get'",
            type_name(&series)
        ));
    }
    let get = |key: &str| series.get(key);
    if !get("schema_version").is_some_and(|v| v.py_eq(&Json::Int(1.into()))) {
        failures.push(format!("{name}: schema_version must be 1"));
    }
    let empty = Json::str_obj("");
    let series_id = get("series_id").unwrap_or(&empty);
    let id_text = py_str(series_id)?;
    if !fullmatch(SLUG, 0, &id_text) {
        failures.push(format!(
            "{name}: series_id {} is not a slug",
            series_id.repr()
        ));
    }
    if format!("{id_text}.json") != name {
        failures.push(format!(
            "{name}: file name must match series_id {}",
            series_id.repr()
        ));
    }
    if !in_set(get("unit"), &UNITS)? {
        failures.push(format!(
            "{name}: unit {} is not one of {}",
            repr(get("unit")),
            sorted_repr(&UNITS)
        ));
    }
    if !in_set(get("jurisdiction"), &JURISDICTIONS)? {
        failures.push(format!(
            "{name}: jurisdiction {} is not recognised",
            repr(get("jurisdiction"))
        ));
    }
    if !is_str(get("advice_status"), ADVICE_STATUS) {
        failures.push(format!("{name}: advice_status must be the fixed sentence"));
    }
    match get("basis") {
        Some(basis @ Json::Object(_))
            if keys(basis).contains(&"instrument") && keys(basis).contains(&"provision") =>
        {
            if basis.get("url").is_some() {
                https_host(
                    basis.get("url"),
                    &format!("{name}.basis.url"),
                    failures,
                    true,
                )?;
            }
        }
        _ => failures.push(format!("{name}: basis needs instrument and provision")),
    }
    let rows = match get("rows") {
        Some(Json::Array(rows)) if !rows.is_empty() => rows,
        _ => {
            failures.push(format!("{name}: rows must be a non-empty array"));
            return Ok(());
        }
    };
    let mut seen: Vec<String> = Vec::new();
    for row in rows {
        check_row(row, &id_text, today, failures)?;
        if let Some(Json::Str(row_id)) =
            row.get("row_id").filter(|_| matches!(row, Json::Object(_)))
        {
            if seen.contains(row_id) {
                failures.push(format!(
                    "{id_text}: duplicate row_id {}",
                    py::repr_str(row_id)
                ));
            }
            if !seen.contains(row_id) {
                seen.push(row_id.clone());
            }
        }
    }
    let dicts: Vec<(usize, &Json)> = rows
        .iter()
        .enumerate()
        .filter(|(_, r)| matches!(r, Json::Object(_)))
        .collect();
    let live: Vec<(usize, &Json)> = dicts
        .iter()
        .copied()
        .filter(|(_, r)| !is_str(r.get("status"), "superseded"))
        .collect();
    let open_ended = live
        .iter()
        .filter(|(_, r)| matches!(r.get("period_end"), None | Some(Json::Null)))
        .count();
    if open_ended > 1 {
        failures.push(format!(
            "{id_text}: {open_ended} rows have an open period_end; at most 1 may"
        ));
    }
    let mut keyed = Vec::new();
    for (index, row) in &live {
        keyed.push((text(row.get("period_start"))?, *index, *row));
    }
    let mut ordered = keyed.clone();
    ordered.sort_by(|a, b| a.0.cmp(&b.0));
    // Python compares the two id lists element by element, identity first.
    let same_order = keyed.iter().zip(&ordered).all(|(a, b)| {
        a.1 == b.1
            || match (a.2.get("row_id"), b.2.get("row_id")) {
                (None, None) => true,
                (Some(x), Some(y)) => x.py_eq(y),
                _ => false,
            }
    });
    if !same_order {
        failures.push(format!("{id_text}: rows are not ordered by period_start"));
    }
    for pair in ordered.windows(2) {
        let (earlier, later) = (pair[0].2, pair[1].2);
        let overlap = match earlier.get("period_end") {
            None | Some(Json::Null) => true,
            Some(end) => py_str(end)? >= text(later.get("period_start"))?,
        };
        if overlap {
            failures.push(format!(
                "{id_text}: rows {} and {} overlap",
                text(earlier.get("row_id"))?,
                text(later.get("row_id"))?
            ));
        }
    }
    // A correction is one live row naming one superseded row; each half is checked.
    let mut by_id: Vec<(&Json, &Json)> = Vec::new();
    for (_, row) in &dicts {
        if let Some(id) = row.get("row_id") {
            hashable(id)?;
            match by_id.iter_mut().find(|(k, _)| k.py_eq(id)) {
                Some(entry) => entry.1 = row,
                None => by_id.push((id, row)),
            }
        }
    }
    let mut namers: Vec<(String, Vec<String>)> = Vec::new();
    for (_, row) in &dicts {
        let target = match row.get("supersedes") {
            None | Some(Json::Null) => continue,
            Some(target) => target,
        };
        let row_id = text(row.get("row_id"))?;
        hashable(target)?;
        let Json::Str(target) = target.clone() else {
            failures.push(format!(
                "{id_text}/{row_id}: supersedes unknown row {}",
                target.repr()
            ));
            continue;
        };
        if !seen.contains(&target) {
            failures.push(format!(
                "{id_text}/{row_id}: supersedes unknown row {}",
                py::repr_str(&target)
            ));
            continue;
        }
        if target == row_id {
            failures.push(format!("{id_text}/{row_id}: supersedes itself"));
            continue;
        }
        let named = by_id
            .iter()
            .find(|(k, _)| k.py_eq(&Json::Str(target.clone())))
            .map(|(_, r)| *r)
            .expect("seen ids are keys");
        if !is_str(named.get("status"), "superseded") {
            failures.push(format!(
                "{id_text}/{row_id}: supersedes {target}, whose status is {} rather than 'superseded'",
                repr(named.get("status"))
            ));
        }
        if is_str(row.get("status"), "superseded") {
            failures.push(format!(
                "{id_text}/{row_id}: a superseded row cannot itself supersede {target}"
            ));
        }
        match namers.iter_mut().find(|(k, _)| *k == target) {
            Some(entry) => entry.1.push(row_id),
            None => namers.push((target, vec![row_id])),
        }
    }
    namers.sort_by(|a, b| a.0.cmp(&b.0));
    for (target, naming) in &namers {
        if naming.len() > 1 {
            let mut sorted = naming.clone();
            sorted.sort();
            failures.push(format!(
                "{id_text}/{target}: named by {} rows ({}); exactly one replacement may name it",
                naming.len(),
                sorted.join(", ")
            ));
        }
    }
    let mut superseded: Vec<Json> = Vec::new();
    for (_, row) in &dicts {
        if is_str(row.get("status"), "superseded") {
            let id = row.get("row_id").ok_or("KeyError: 'row_id'")?;
            hashable(id)?;
            if !superseded.iter().any(|s| s.py_eq(id)) {
                superseded.push(id.clone());
            }
        }
    }
    let orphans: Vec<Json> = superseded
        .into_iter()
        .filter(|id| !namers.iter().any(|(k, _)| id.py_eq(&Json::Str(k.clone()))))
        .collect();
    for orphan in py_sorted(orphans)? {
        failures.push(format!(
            "{id_text}/{}: status is superseded but no row names it in supersedes",
            py_str(&orphan)?
        ));
    }
    Ok(())
}

/// Every path below `dir`, as `Path.rglob("*")` yields them (symlinked directories are
/// not followed).
fn rglob(dir: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut pending = vec![dir.to_path_buf()];
    while let Some(current) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if entry.file_type().is_ok_and(|t| t.is_dir()) {
                pending.push(path.clone());
            }
            found.push(path);
        }
    }
    found
}

fn posix_rel(path: &Path, root: &Path) -> String {
    path.strip_prefix(root)
        .expect("below the register")
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn check_sums(register: &Path, failures: &mut Vec<String>) -> Result<()> {
    let sums = register.join("SHA256SUMS");
    if !sums.is_file() {
        failures.push("SHA256SUMS is missing".into());
        return Ok(());
    }
    let content = crate::read(&sums)?;
    let mut listed: Vec<(String, String)> = Vec::new();
    for line in py::splitlines(&content) {
        if py::strip(line).is_empty() {
            continue;
        }
        let (digest, name) = line.split_once("  ").unwrap_or((line, ""));
        if !fullmatch("[0-9a-f]{64}", 0, digest) || name.is_empty() {
            failures.push(format!("SHA256SUMS: malformed line {}", py::repr_str(line)));
            continue;
        }
        match listed.iter_mut().find(|(n, _)| n == name) {
            Some(entry) => entry.1 = digest.to_owned(),
            None => listed.push((name.to_owned(), digest.to_owned())),
        }
    }
    // Only the register's own SHA256SUMS is exempt.
    let mut on_disk: Vec<String> = rglob(register)
        .into_iter()
        .filter(|p| p.is_file() && *p != sums)
        .map(|p| posix_rel(&p, register))
        .collect();
    on_disk.sort();
    on_disk.dedup();
    let mut names: Vec<&String> = listed.iter().map(|(n, _)| n).collect();
    names.sort();
    for missing in on_disk.iter().filter(|f| !names.contains(f)) {
        failures.push(format!("SHA256SUMS: {missing} is not listed"));
    }
    for extra in names.iter().filter(|n| !on_disk.contains(n)) {
        failures.push(format!(
            "SHA256SUMS: lists {extra}, which is not in the register"
        ));
    }
    for name in on_disk.iter().filter(|f| names.contains(f)) {
        let path = register.join(name);
        let raw = std::fs::read(&path)
            .map_err(|e| py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Errno))?;
        if raw.windows(2).any(|w| w == b"\r\n") {
            failures.push(format!(
                "SHA256SUMS: {name} has CRLF line endings on disk. The published file is \
                 LF, so its digest would not match. Convert it and regenerate SHA256SUMS."
            ));
            continue;
        }
        let expected = &listed.iter().find(|(n, _)| n == name).expect("listed").1;
        if crate::sha256(&raw) != *expected {
            failures.push(format!("SHA256SUMS: {name} digest does not match the file"));
        }
    }
    Ok(())
}

/// Today in Sydney, where the rows are written: AEST (UTC+10), or AEDT (UTC+11) from
/// 2 am on the first Sunday of October to 3 am on the first Sunday of April.
pub fn today() -> Date {
    use chrono::{Datelike, Duration, NaiveDate, Weekday};
    let now = chrono::Utc::now().naive_utc();
    let first_sunday = |year: i32, month: u32| {
        let first = NaiveDate::from_ymd_opt(year, month, 1).expect("a date");
        let offset = (7 + Weekday::Sun.num_days_from_monday() as i64
            - first.weekday().num_days_from_monday() as i64)
            % 7;
        first + Duration::days(offset)
    };
    let standard = now + Duration::hours(10);
    let year = standard.year();
    // Transitions in UTC: 16:00 on the Saturday before each first Sunday.
    let ends = first_sunday(year, 4).and_hms_opt(16, 0, 0).expect("a time") - Duration::days(1);
    let starts = first_sunday(year, 10)
        .and_hms_opt(16, 0, 0)
        .expect("a time")
        - Duration::days(1);
    let summer = now < ends || now >= starts;
    let local = if summer {
        now + Duration::hours(11)
    } else {
        standard
    };
    Date {
        year: local.year(),
        month: local.month(),
        day: local.day(),
    }
}

/// Every failure in the register at `register` (rates/register), as check_register lists them.
pub fn check_register(register: &Path, today: Option<Date>) -> Result<Vec<String>> {
    let today = today.unwrap_or_else(self::today);
    let mut failures = Vec::new();
    let manifest_path = register.join("register.json");
    if !manifest_path.is_file() {
        return Ok(vec![format!("{} is missing", manifest_path.display())]);
    }
    let manifest = pyjson::loads(&crate::read(&manifest_path)?)
        .map_err(|e| format!("json.decoder.JSONDecodeError: {e}"))?;
    if !matches!(manifest, Json::Object(_)) {
        return Err(format!(
            "AttributeError: '{}' object has no attribute 'get'",
            type_name(&manifest)
        ));
    }
    if !manifest
        .get("schema_version")
        .is_some_and(|v| v.py_eq(&Json::Int(1.into())))
    {
        failures.push("register.json: schema_version must be 1".into());
    }
    let version = text(manifest.get("register_version"))?;
    if !fullmatch(r"[0-9]{4}\.[0-9]{2}\.[0-9]{2}(\.[1-9][0-9]*)?", 0, &version) {
        failures.push(format!(
            "register.json: register_version {} is malformed",
            repr(manifest.get("register_version"))
        ));
    }
    if !is_str(manifest.get("advice_status"), ADVICE_STATUS) {
        failures.push("register.json: advice_status must be the fixed sentence".into());
    }
    let declared = match manifest.get("series") {
        Some(value) => py_sorted(iterate(value)?)?,
        None => Vec::new(),
    };
    let series_dir = register.join("series");
    let mut on_disk: Vec<String> = rglob(&series_dir)
        .into_iter()
        .filter(|p| {
            p.file_name()
                .is_some_and(|n| crate::glob_suffix(&n.to_string_lossy(), ".json"))
        })
        .map(|p| posix_rel(&p, register))
        .collect();
    on_disk.sort();
    let same = declared.len() == on_disk.len()
        && declared
            .iter()
            .zip(&on_disk)
            .all(|(d, f)| matches!(d, Json::Str(s) if s == f));
    if !same {
        failures.push(format!(
            "register.json: series list {} does not match the files {}",
            Json::Array(declared).repr(),
            Json::Array(on_disk.iter().map(|f| Json::Str(f.clone())).collect()).repr()
        ));
    }
    for name in &on_disk {
        let path = name
            .split('/')
            .fold(register.to_path_buf(), |p, part| p.join(part));
        check_series(&path, &mut failures, today)?;
    }
    for schema_name in ["rates-register.schema.json", "register.schema.json"] {
        let path = register.join("schema").join(schema_name);
        if !path.is_file() {
            failures.push(format!("schema/{schema_name} is missing"));
            continue;
        }
        let schema = match pyjson::loads(&crate::read(&path)?) {
            Ok(schema) => schema,
            Err(e) => {
                failures.push(format!("schema/{schema_name}: not valid JSON ({e})"));
                continue;
            }
        };
        if !matches!(schema, Json::Object(_)) {
            return Err(format!(
                "AttributeError: '{}' object has no attribute 'get'",
                type_name(&schema)
            ));
        }
        let id = schema.get("$id").map_or(Ok(String::new()), py_str)?;
        if !id.starts_with("https://duguid.com.au/rates/register/schema/") {
            failures.push(format!(
                "schema/{schema_name}: $id must be its published URL"
            ));
        }
    }
    check_sums(register, &mut failures)?;
    Ok(failures)
}

/// The register directory as Python names it: `ROOT / "rates" / "register"`.
pub fn register_dir(root: &Path) -> PathBuf {
    py::resolve(root).join("rates").join("register")
}

pub fn run(root: &Path) -> Result<u8> {
    let failures = check_register(&register_dir(root), None)?;
    let say = |text: &str| crate::print_text(text, false).map_err(|e| e.to_string());
    for failure in &failures {
        say(&format!("rates register: {failure}\n"))?;
    }
    if !failures.is_empty() {
        return Ok(1);
    }
    say("rates register: checks passed\n")?;
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sorts_like_python() {
        let s = |t: &str| Json::Str(t.into());
        assert_eq!(
            py_sorted(vec![s("b"), s("a")]).unwrap(),
            vec![s("a"), s("b")]
        );
        assert!(py_sorted(vec![s("a"), Json::Int(1.into())]).is_err());
        assert!(py_sorted(vec![Json::Null]).is_ok());
    }
}
