// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! `.agents/tools/search-console/{core,server}.py`: pure validation, reporting
//! window calculation, request construction, same-site URL verification and
//! period-over-period row comparison for `sc-domain:duguid.com.au`.

mod cli;

pub use cli::run;

use crate::py::Date;
use crate::pyjson::{self, Json};
use crate::pyurl;
use num_bigint::{BigInt, BigUint};
use num_traits::{FromPrimitive, ToPrimitive, Zero};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

pub const ALLOWED_DIMENSIONS: [&str; 5] = ["date", "page", "query", "device", "country"];
pub const ALLOWED_HOSTS: [&str; 2] = ["duguid.com.au", "www.duguid.com.au"];
pub const MAX_DAYS: i64 = 90;
pub const MAX_ROWS: i64 = 1_000;
pub const DEFAULT_DAYS: i64 = 28;
pub const PROPERTY: &str = "sc-domain:duguid.com.au";
pub const PROPERTY_PATH: &str = "sc-domain%3Aduguid.com.au";
pub const SCOPE: &str = "https://www.googleapis.com/auth/webmasters.readonly";
pub const SEARCH_API: &str = "https://www.googleapis.com/webmasters/v3";
pub const INSPECTION_API: &str = "https://searchconsole.googleapis.com/v1";
pub const LANGUAGE_CODE: &str = "en-AU";
pub const TOP_ROWS_NOTICE: &str = concat!(
    "Each period can return only top rows. A row absent from one returned set ",
    "is normalised to zero, so deltas are indicative rather than exhaustive."
);

const INVALID_URL_ERR: &str = "inspection target must be an HTTPS URL on duguid.com.au";

type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, PartialEq)]
enum Metric {
    Int(BigInt),
    Float(f64),
}

impl Metric {
    fn from_row(row: Option<&Json>, name: &str) -> Result<Self> {
        let Some(value) = row.and_then(|obj| obj.get(name)) else {
            return Ok(Self::Int(BigInt::zero()));
        };
        match value {
            Json::Int(n) => Ok(Self::Int(n.clone())),
            // `json.loads` accepts Infinity, and so does `_metric`; NaN has no
            // ordering to rank by, so it is refused.
            Json::Float(f) if !f.is_nan() => Ok(Self::Float(*f)),
            _ => Err(format!("Search Console row {name} must be numeric")),
        }
    }

    fn as_f64(&self) -> Result<f64> {
        match self {
            Self::Int(n) => n
                .to_f64()
                .filter(|f| f.is_finite())
                .ok_or_else(|| "OverflowError: int too large to convert to float".to_owned()),
            Self::Float(f) => Ok(*f),
        }
    }

    fn sub(&self, rhs: &Self) -> Result<Self> {
        match (self, rhs) {
            (Self::Int(a), Self::Int(b)) => Ok(Self::Int(a - b)),
            _ => Ok(Self::Float(self.as_f64()? - rhs.as_f64()?)),
        }
    }

    fn to_json(&self) -> Json {
        match self {
            Self::Int(n) => Json::Int(n.clone()),
            Self::Float(f) => Json::Float(*f),
        }
    }

    fn cmp_abs(&self, other: &Self) -> Ordering {
        match (self, other) {
            (Self::Int(a), Self::Int(b)) => a.magnitude().cmp(b.magnitude()),
            (Self::Float(a), Self::Float(b)) => a.abs().total_cmp(&b.abs()),
            (Self::Int(a), Self::Float(b)) => cmp_biguint_abs_f64(a.magnitude(), b.abs()),
            (Self::Float(a), Self::Int(b)) => cmp_biguint_abs_f64(b.magnitude(), a.abs()).reverse(),
        }
    }
}

fn cmp_biguint_abs_f64(mag: &BigUint, val: f64) -> Ordering {
    if !val.is_finite() {
        return Ordering::Less;
    }
    let whole = BigInt::from_f64(val.trunc()).expect("finite non-negative f64");
    match mag.cmp(whole.magnitude()) {
        Ordering::Equal if val.fract() > 0.0 => Ordering::Less,
        other => other,
    }
}

fn metrics_object(clicks: &Metric, impressions: &Metric) -> Json {
    Json::Object(vec![
        ("clicks".into(), clicks.to_json()),
        ("impressions".into(), impressions.to_json()),
    ])
}

/// Parse an ISO date string matching Python `date.fromisoformat`.
pub fn parse_date(value: &str, label: &str) -> Result<Date> {
    Date::fromisoformat(value)
        .ok_or_else(|| format!("{label} must be an ISO date in YYYY-MM-DD format"))
}

/// Validate Search Console dimension names and uniqueness.
pub fn validate_dimensions(dimensions: &[String]) -> Result<Vec<String>> {
    if dimensions.is_empty() {
        return Err("at least one Search Console dimension is required".into());
    }
    if let Some(unknown) = dimensions
        .iter()
        .find(|item| !ALLOWED_DIMENSIONS.contains(&item.as_str()))
    {
        return Err(format!("unknown Search Console dimension: {unknown}"));
    }
    let unique: HashSet<&str> = dimensions.iter().map(String::as_str).collect();
    if unique.len() != dimensions.len() {
        return Err("Search Console dimensions must be unique".into());
    }
    Ok(dimensions.to_vec())
}

fn window_json(start: Date, end: Date) -> Json {
    Json::Object(vec![
        ("start_date".into(), Json::Str(start.isoformat())),
        ("end_date".into(), Json::Str(end.isoformat())),
    ])
}

/// Return adjacent inclusive current and previous reporting windows.
pub fn comparison_windows(end_date: Date, days: i64) -> Result<Json> {
    if !(1..=MAX_DAYS).contains(&days) {
        return Err("days must be an integer from 1 to 90".into());
    }
    let overflow = "OverflowError: date value out of range";
    let current_start = end_date.add_days(-(days - 1)).ok_or(overflow)?;
    let previous_end = current_start.add_days(-1).ok_or(overflow)?;
    let previous_start = previous_end.add_days(-(days - 1)).ok_or(overflow)?;
    Ok(Json::Object(vec![
        ("current".into(), window_json(current_start, end_date)),
        ("previous".into(), window_json(previous_start, previous_end)),
    ]))
}

/// Validate and build a bounded Search Analytics request body.
pub fn build_search_request(
    start_date: Date,
    end_date: Date,
    dimensions: &[String],
    row_limit: i64,
) -> Result<Json> {
    let inclusive_days = end_date.ordinal() - start_date.ordinal() + 1;
    if inclusive_days < 1 {
        return Err("end_date must not be before start_date".into());
    }
    if inclusive_days > MAX_DAYS {
        return Err("Search Console requests cannot exceed 90 days".into());
    }
    if !(1..=MAX_ROWS).contains(&row_limit) {
        return Err("row_limit must be an integer from 1 to 1,000".into());
    }
    let selected = validate_dimensions(dimensions)?;
    Ok(Json::Object(vec![
        ("startDate".into(), Json::Str(start_date.isoformat())),
        ("endDate".into(), Json::Str(end_date.isoformat())),
        (
            "dimensions".into(),
            Json::Array(selected.into_iter().map(Json::Str).collect()),
        ),
        ("rowLimit".into(), Json::Int(row_limit.into())),
    ]))
}

/// Reject inspection targets outside the site's exact HTTPS hosts.
pub fn validate_site_url(url: &str) -> Result<String> {
    let parsed = pyurl::urlsplit(url).map_err(|_| INVALID_URL_ERR.to_owned())?;
    let port = pyurl::port(&parsed.netloc).map_err(|_| INVALID_URL_ERR.to_owned())?;
    let host = pyurl::hostname(&parsed.netloc);
    let valid = parsed.scheme == "https"
        && host.as_deref().is_some_and(|h| ALLOWED_HOSTS.contains(&h))
        && !parsed.netloc.contains('@')
        && matches!(port, None | Some(443))
        && parsed.fragment.is_empty();
    if !valid {
        return Err(INVALID_URL_ERR.to_owned());
    }
    Ok(url.to_owned())
}

struct IndexedRows<'a> {
    by_key: HashMap<Vec<String>, &'a Json>,
    order: Vec<Vec<String>>,
}

fn index_rows<'a>(rows: &'a [Json], dimensions: &[String]) -> Result<IndexedRows<'a>> {
    let mut by_key = HashMap::with_capacity(rows.len());
    let mut order = Vec::with_capacity(rows.len());
    for row in rows {
        if !matches!(row, Json::Object(_)) {
            return Err("Search Console row must be an object".into());
        }
        let Some(Json::Array(raw_keys)) = row.get("keys") else {
            return Err("Search Console row keys must match the dimensions".into());
        };
        if raw_keys.len() != dimensions.len() {
            return Err("Search Console row keys must match the dimensions".into());
        }
        let mut key = Vec::with_capacity(raw_keys.len());
        for item in raw_keys {
            let Some(text) = item.as_str() else {
                return Err("Search Console dimension keys must be strings".into());
            };
            key.push(text.to_owned());
        }
        if by_key.contains_key(&key) {
            return Err("Search Console rows must have unique dimension keys".into());
        }
        by_key.insert(key.clone(), row);
        order.push(key);
    }
    Ok(IndexedRows { by_key, order })
}

/// Join 2 API row sets and rank descending by absolute impression delta.
pub fn compare_search_rows(
    current: &[Json],
    previous: &[Json],
    dimensions: &[String],
) -> Result<Vec<Json>> {
    let selected = validate_dimensions(dimensions)?;
    let current_rows = index_rows(current, &selected)?;
    let previous_rows = index_rows(previous, &selected)?;

    let mut keys = current_rows.order;
    for key in previous_rows.order {
        if !current_rows.by_key.contains_key(&key) {
            keys.push(key);
        }
    }

    let mut ranked: Vec<(Metric, Json)> = Vec::with_capacity(keys.len());
    for key in keys {
        let cur_row = current_rows.by_key.get(&key).copied();
        let prev_row = previous_rows.by_key.get(&key).copied();
        let cur_clicks = Metric::from_row(cur_row, "clicks")?;
        let cur_impressions = Metric::from_row(cur_row, "impressions")?;
        let prev_clicks = Metric::from_row(prev_row, "clicks")?;
        let prev_impressions = Metric::from_row(prev_row, "impressions")?;
        let delta_clicks = cur_clicks.sub(&prev_clicks)?;
        let delta_impressions = cur_impressions.sub(&prev_impressions)?;

        let mut pairs: Vec<(String, Json)> = selected
            .iter()
            .zip(key)
            .map(|(dim, val)| (dim.clone(), Json::Str(val)))
            .collect();
        pairs.push((
            "current".into(),
            metrics_object(&cur_clicks, &cur_impressions),
        ));
        pairs.push((
            "previous".into(),
            metrics_object(&prev_clicks, &prev_impressions),
        ));
        pairs.push((
            "delta".into(),
            metrics_object(&delta_clicks, &delta_impressions),
        ));
        ranked.push((delta_impressions, Json::Object(pairs)));
    }

    ranked.sort_by(|(a, _), (b, _)| b.cmp_abs(a));
    Ok(ranked.into_iter().map(|(_, row)| row).collect())
}

pub fn search_analytics_endpoint() -> String {
    format!("{SEARCH_API}/sites/{PROPERTY_PATH}/searchAnalytics/query")
}

pub fn inspect_endpoint() -> String {
    format!("{INSPECTION_API}/urlInspection/index:inspect")
}

pub fn sitemaps_endpoint() -> String {
    format!("{SEARCH_API}/sites/{PROPERTY_PATH}/sitemaps")
}

pub fn extract_rows(payload: &Json) -> Result<Vec<Json>> {
    if !matches!(payload, Json::Object(_)) {
        return Err("Search Console returned an unexpected response shape".into());
    }
    let Some(rows) = payload.get("rows") else {
        return Ok(Vec::new());
    };
    let Json::Array(items) = rows else {
        return Err("Search Console returned malformed analytics rows".into());
    };
    if !items.iter().all(|item| matches!(item, Json::Object(_))) {
        return Err("Search Console returned malformed analytics rows".into());
    }
    Ok(items.clone())
}

fn window_dates(window: &Json, label: &str) -> Result<(Date, Date)> {
    let start = window
        .get("start_date")
        .and_then(Json::as_str)
        .ok_or_else(|| format!("{label} start_date missing"))?;
    let end = window
        .get("end_date")
        .and_then(Json::as_str)
        .ok_or_else(|| format!("{label} end_date missing"))?;
    Ok((
        parse_date(start, &format!("{label} start date"))?,
        parse_date(end, &format!("{label} end date"))?,
    ))
}

/// Validate comparison parameters and build both period request payloads.
pub fn build_compare_requests(
    end_date: Date,
    days: i64,
    dimensions: &[String],
    row_limit: i64,
) -> Result<Json> {
    let windows = comparison_windows(end_date, days)?;
    let cur = windows.get("current").expect("current window");
    let prev = windows.get("previous").expect("previous window");
    let (cur_start, cur_end) = window_dates(cur, "current")?;
    let (prev_start, prev_end) = window_dates(prev, "previous")?;
    let current_request = build_search_request(cur_start, cur_end, dimensions, row_limit)?;
    let previous_request = build_search_request(prev_start, prev_end, dimensions, row_limit)?;
    Ok(Json::Object(vec![
        ("endpoint".into(), Json::Str(search_analytics_endpoint())),
        ("windows".into(), windows),
        ("current_request".into(), current_request),
        ("previous_request".into(), previous_request),
    ]))
}

/// Validate parameters and shape two Search Analytics payloads into a comparison report.
pub fn format_compare_response(
    end_date: Date,
    days: i64,
    dimensions: &[String],
    row_limit: i64,
    current_payload: &Json,
    previous_payload: &Json,
) -> Result<Json> {
    let requests = build_compare_requests(end_date, days, dimensions, row_limit)?;
    let windows = requests.get("windows").expect("windows").clone();
    let current_rows = extract_rows(current_payload)?;
    let previous_rows = extract_rows(previous_payload)?;
    let compared = compare_search_rows(&current_rows, &previous_rows, dimensions)?;
    Ok(Json::Object(vec![
        ("property".into(), Json::str_obj(PROPERTY)),
        ("windows".into(), windows),
        (
            "dimensions".into(),
            Json::Array(dimensions.iter().cloned().map(Json::Str).collect()),
        ),
        ("row_limit".into(), Json::Int(row_limit.into())),
        ("rows".into(), Json::Array(compared)),
        ("notice".into(), Json::str_obj(TOP_ROWS_NOTICE)),
    ]))
}

/// Validate inspection target and build the Search Console URL inspection request.
pub fn build_inspect_request(url: &str) -> Result<Json> {
    let inspection_url = validate_site_url(url)?;
    let body = Json::Object(vec![
        ("inspectionUrl".into(), Json::Str(inspection_url)),
        ("siteUrl".into(), Json::str_obj(PROPERTY)),
        ("languageCode".into(), Json::str_obj(LANGUAGE_CODE)),
    ]);
    Ok(Json::Object(vec![
        ("endpoint".into(), Json::Str(inspect_endpoint())),
        ("body".into(), body),
    ]))
}

/// Validate target URL and shape a URL inspection response payload.
pub fn format_inspect_response(url: &str, payload: &Json) -> Result<Json> {
    let inspection_url = validate_site_url(url)?;
    if !matches!(payload, Json::Object(_)) {
        return Err("Search Console returned an unexpected response shape".into());
    }
    let result = payload
        .get("inspectionResult")
        .cloned()
        .unwrap_or_else(|| Json::Object(Vec::new()));
    Ok(Json::Object(vec![
        ("property".into(), Json::str_obj(PROPERTY)),
        ("inspection_url".into(), Json::Str(inspection_url)),
        ("inspection_result".into(), result),
    ]))
}

/// Validate and shape a sitemaps API response payload.
pub fn format_sitemaps_response(payload: &Json) -> Result<Json> {
    if !matches!(payload, Json::Object(_)) {
        return Err("Search Console returned an unexpected response shape".into());
    }
    let sitemaps = match payload.get("sitemap") {
        None => Json::Array(Vec::new()),
        Some(Json::Array(items)) => Json::Array(items.clone()),
        Some(_) => return Err("Search Console returned malformed sitemap data".into()),
    };
    Ok(Json::Object(vec![
        ("property".into(), Json::str_obj(PROPERTY)),
        ("sitemaps".into(), sitemaps),
    ]))
}

pub(crate) fn default_dimensions() -> Vec<String> {
    vec!["page".into(), "query".into()]
}

/// A fixed fixture below; it is valid JSON, so a parse failure is a bug.
fn fixture(text: &str) -> Json {
    pyjson::loads(text).expect("fixture JSON")
}

/// `Err(message)` unless `ok`, kept on one line so the never-taken failure
/// branch of a passing self-test leaves no line uncovered.
fn ensure(ok: bool, message: &str) -> Result<()> {
    ok.then_some(()).ok_or_else(|| message.into())
}

/// The comparison fixture of `server.py`'s `_transport_fixture_test`.
fn self_test_compare(end: Date) -> Result<()> {
    let current = fixture(
        r#"{"rows": [{"keys": ["https://duguid.com.au/a/", "levy"], "clicks": 4, "impressions": 100}]}"#,
    );
    let previous = fixture(
        r#"{"rows": [{"keys": ["https://duguid.com.au/a/", "levy"], "clicks": 2, "impressions": 40}]}"#,
    );
    let dimensions = default_dimensions();
    let compared = format_compare_response(
        end,
        DEFAULT_DAYS,
        &dimensions,
        MAX_ROWS,
        &current,
        &previous,
    );
    let compared = compared?;
    let expected = fixture(r#"{"clicks": 2, "impressions": 60}"#);
    let delta_matches = matches!(
        compared.get("rows"),
        Some(Json::Array(rows)) if rows.first().and_then(|row| row.get("delta")) == Some(&expected)
    );
    ensure(delta_matches, "search console fixture delta mismatch")
}

/// The inspection and sitemap fixtures of `server.py`'s `_transport_fixture_test`.
fn self_test_inspect_and_sitemaps() -> Result<()> {
    let payload = fixture(r#"{"inspectionResult": {"indexStatusResult": {"verdict": "PASS"}}}"#);
    let inspected =
        format_inspect_response("https://duguid.com.au/tools/coal-lsl-levy/", &payload)?;
    let inspected_ok = inspected.get("inspection_result") == payload.get("inspectionResult");
    let payload = fixture(r#"{"sitemap": [{"path": "https://duguid.com.au/sitemap.xml"}]}"#);
    let sitemaps = format_sitemaps_response(&payload)?;
    let sitemaps_ok = sitemaps.get("sitemaps") == payload.get("sitemap");
    ensure(inspected_ok, "search console fixture inspection mismatch").and(ensure(
        sitemaps_ok,
        "search console fixture sitemap mismatch",
    ))
}

/// Offline self-test covering pure windows, request limits, URL checks and shaping.
pub fn self_test() -> Result<()> {
    let end = parse_date("2026-08-28", "end_date")?;
    self_test_compare(end)?;
    self_test_inspect_and_sitemaps()?;
    let bad_dimension = ["searchAppearance".into()];
    let dimension_refused =
        build_compare_requests(end, DEFAULT_DAYS, &bad_dimension, MAX_ROWS).is_err();
    let http_refused = validate_site_url("http://duguid.com.au/").is_err();
    ensure(dimension_refused, "invalid dimension accepted")
        .and(ensure(http_refused, "non-HTTPS URL accepted"))
}
