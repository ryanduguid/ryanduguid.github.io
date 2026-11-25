// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! `.agents/tools/search-console/{core,server}.py`: pure validation, reporting
//! window calculation, request construction, same-site URL verification and
//! period-over-period row comparison for `sc-domain:duguid.com.au`.

use crate::py::{self, Date};
use crate::pyjson::{self, Dump, Json};
use crate::pyurl;
use num_bigint::{BigInt, BigUint};
use num_traits::{FromPrimitive, ToPrimitive, Zero};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path;

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
const USAGE: &str = include_str!("help/search_console.usage");
const HELP: &str = include_str!("help/search_console.txt");

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
            Json::Float(f) if f.is_finite() => Ok(Self::Float(*f)),
            _ => Err(format!("Search Console row {name} must be numeric")),
        }
    }

    fn as_f64(&self) -> f64 {
        match self {
            Self::Int(n) => n.to_f64().unwrap_or(f64::INFINITY),
            Self::Float(f) => *f,
        }
    }

    fn sub(&self, rhs: &Self) -> Self {
        match (self, rhs) {
            (Self::Int(a), Self::Int(b)) => Self::Int(a - b),
            _ => Self::Float(self.as_f64() - rhs.as_f64()),
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
        let delta_clicks = cur_clicks.sub(&prev_clicks);
        let delta_impressions = cur_impressions.sub(&prev_impressions);

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

fn dump_json(value: &Json) -> String {
    pyjson::dumps(
        value,
        Dump {
            indent: Some(2),
            sort_keys: true,
            ..Dump::default()
        },
    ) + "\n"
}

fn usage_error(subcommand: Option<&str>, message: &str) -> Result<u8> {
    let prefix = match subcommand {
        Some(sub) => format!("{USAGE}site-tools search_console {sub}: error: {message}\n"),
        None => format!("{USAGE}site-tools search_console: error: {message}\n"),
    };
    crate::print_text(&prefix, true).map_err(|e| e.to_string())?;
    Ok(2)
}

enum ParsedCli {
    Ok(CliOptions),
    Exit(u8),
}

#[derive(Default)]
struct CliOptions {
    end_date: Option<String>,
    start_date: Option<String>,
    days: Option<i64>,
    row_limit: Option<i64>,
    dimensions: Option<Vec<String>>,
    input: Option<String>,
    positionals: Vec<String>,
}

fn is_negative_number(arg: &str) -> bool {
    arg.len() > 1 && arg.starts_with('-') && arg[1..].bytes().all(|b| b.is_ascii_digit())
}

fn is_option_token(arg: &str) -> bool {
    arg.starts_with('-') && arg != "-" && !is_negative_number(arg)
}

fn parse_int_arg(sub: &str, flag: &str, raw: &str) -> std::result::Result<i64, u8> {
    py::parse_int(raw, 10)
        .ok()
        .and_then(|v| v.to_i64())
        .ok_or_else(|| {
            let _ = usage_error(
                Some(sub),
                &format!("argument {flag}: invalid int value: {}", py::repr_str(raw)),
            );
            2
        })
}

fn next_flag_value(
    sub: &str,
    flag: &str,
    explicit: Option<String>,
    args: &[String],
    idx: &mut usize,
) -> std::result::Result<String, u8> {
    if let Some(val) = explicit {
        return Ok(val);
    }
    let Some(next) = args.get(*idx).filter(|a| !is_option_token(a)) else {
        let _ = usage_error(
            Some(sub),
            &format!("argument {flag}: expected one argument"),
        );
        return Err(2);
    };
    *idx += 1;
    Ok(next.clone())
}

fn parse_cli(sub: &str, args: &[String], allowed_flags: &[&str]) -> ParsedCli {
    let mut opts = CliOptions::default();
    let mut positional_only = false;
    let mut idx = 0;
    while idx < args.len() {
        let arg = &args[idx];
        idx += 1;
        if positional_only || !is_option_token(arg) {
            opts.positionals.push(arg.clone());
            continue;
        }
        if arg == "--" {
            positional_only = true;
            continue;
        }
        let (name, explicit) = match arg.split_once('=') {
            Some((n, v)) if arg.starts_with("--") => (n, Some(v.to_owned())),
            _ => (arg.as_str(), None),
        };
        if matches!(name, "-h" | "--help") {
            if let Some(val) = explicit {
                return ParsedCli::Exit(
                    usage_error(
                        Some(sub),
                        &format!(
                            "argument -h/--help: ignored explicit argument {}",
                            py::repr_str(&val)
                        ),
                    )
                    .unwrap_or(2),
                );
            }
            let _ = crate::print_text(HELP, false);
            return ParsedCli::Exit(0);
        }
        if !allowed_flags.contains(&name) {
            return ParsedCli::Exit(
                usage_error(Some(sub), &format!("unrecognized arguments: {arg}")).unwrap_or(2),
            );
        }
        match name {
            "--dimensions" => {
                let mut dims = Vec::new();
                if let Some(val) = explicit {
                    dims.push(val);
                } else {
                    while idx < args.len() && !is_option_token(&args[idx]) {
                        dims.push(args[idx].clone());
                        idx += 1;
                    }
                }
                opts.dimensions = Some(dims);
            }
            "--end-date" | "--start-date" | "--input" => {
                let Ok(val) = next_flag_value(sub, name, explicit, args, &mut idx) else {
                    return ParsedCli::Exit(2);
                };
                match name {
                    "--end-date" => opts.end_date = Some(val),
                    "--start-date" => opts.start_date = Some(val),
                    _ => opts.input = Some(val),
                }
            }
            "--days" | "--row-limit" => {
                let Ok(val) = next_flag_value(sub, name, explicit, args, &mut idx) else {
                    return ParsedCli::Exit(2);
                };
                let Ok(parsed) = parse_int_arg(sub, name, &val) else {
                    return ParsedCli::Exit(2);
                };
                if name == "--days" {
                    opts.days = Some(parsed);
                } else {
                    opts.row_limit = Some(parsed);
                }
            }
            _ => unreachable!("checked in allowed_flags"),
        }
    }
    ParsedCli::Ok(opts)
}

fn require_arg<'a>(
    sub: &str,
    flag: &str,
    value: Option<&'a str>,
) -> std::result::Result<&'a str, u8> {
    value.ok_or_else(|| {
        let _ = usage_error(
            Some(sub),
            &format!("the following arguments are required: {flag}"),
        );
        2
    })
}

fn require_one_positional(sub: &str, opts: &CliOptions) -> std::result::Result<String, u8> {
    if let [only] = opts.positionals.as_slice() {
        Ok(only.clone())
    } else if opts.positionals.is_empty() {
        let _ = usage_error(Some(sub), "the following arguments are required: url");
        Err(2)
    } else {
        let _ = usage_error(
            Some(sub),
            &format!(
                "unrecognized arguments: {}",
                opts.positionals[1..].join(" ")
            ),
        );
        Err(2)
    }
}

fn reject_positionals(sub: &str, opts: &CliOptions) -> std::result::Result<(), u8> {
    if opts.positionals.is_empty() {
        Ok(())
    } else {
        let _ = usage_error(
            Some(sub),
            &format!("unrecognized arguments: {}", opts.positionals.join(" ")),
        );
        Err(2)
    }
}

fn read_input_json(input: Option<&str>) -> Result<Json> {
    let bytes = match input {
        Some(path) if path != "-" => std::fs::read(Path::new(path))
            .map_err(|e| py::oserror_str(&e, path, py::OsStyle::Errno))?,
        _ => {
            let mut buf = Vec::new();
            std::io::stdin()
                .read_to_end(&mut buf)
                .map_err(|e| e.to_string())?;
            buf
        }
    };
    let text = py::decode_utf8(&bytes).map_err(|e| e.to_string())?;
    let text = py::universal_newlines(&text);
    pyjson::loads(&text).map_err(|e| format!("json.decoder.JSONDecodeError: {e}"))
}

fn default_dimensions() -> Vec<String> {
    vec!["page".into(), "query".into()]
}

fn json_string_list(value: &Json, field: &str) -> Result<Vec<String>> {
    let Json::Array(items) = value else {
        return Err(format!("Search Console {field} must be a list of strings"));
    };
    items
        .iter()
        .map(|item| {
            item.as_str()
                .map(str::to_owned)
                .ok_or_else(|| format!("Search Console {field} must be a list of strings"))
        })
        .collect()
}

fn json_row_list(payload: &Json, field: &str) -> Result<Vec<Json>> {
    let Some(value) = payload.get(field) else {
        return Err(format!("missing required JSON field: {field}"));
    };
    let Json::Array(items) = value else {
        return Err(format!("Search Console {field} must be a list"));
    };
    Ok(items.clone())
}

fn run_comparison_windows(args: &[String]) -> Result<u8> {
    let opts = match parse_cli("comparison_windows", args, &["--end-date", "--days"]) {
        ParsedCli::Ok(o) => o,
        ParsedCli::Exit(code) => return Ok(code),
    };
    if reject_positionals("comparison_windows", &opts).is_err() {
        return Ok(2);
    }
    let Ok(end_raw) = require_arg("comparison_windows", "--end-date", opts.end_date.as_deref())
    else {
        return Ok(2);
    };
    let end_date = parse_date(end_raw, "end_date")?;
    let out = comparison_windows(end_date, opts.days.unwrap_or(DEFAULT_DAYS))?;
    crate::print_text(&dump_json(&out), false).map_err(|e| e.to_string())?;
    Ok(0)
}

fn run_build_search_request(args: &[String]) -> Result<u8> {
    let opts = match parse_cli(
        "build_search_request",
        args,
        &["--start-date", "--end-date", "--dimensions", "--row-limit"],
    ) {
        ParsedCli::Ok(o) => o,
        ParsedCli::Exit(code) => return Ok(code),
    };
    if reject_positionals("build_search_request", &opts).is_err() {
        return Ok(2);
    }
    let Ok(start_raw) = require_arg(
        "build_search_request",
        "--start-date",
        opts.start_date.as_deref(),
    ) else {
        return Ok(2);
    };
    let Ok(end_raw) = require_arg(
        "build_search_request",
        "--end-date",
        opts.end_date.as_deref(),
    ) else {
        return Ok(2);
    };
    let Some(dims) = opts.dimensions.as_deref() else {
        return usage_error(
            Some("build_search_request"),
            "the following arguments are required: --dimensions",
        );
    };
    let start_date = parse_date(start_raw, "start_date")?;
    let end_date = parse_date(end_raw, "end_date")?;
    let out = build_search_request(
        start_date,
        end_date,
        dims,
        opts.row_limit.unwrap_or(MAX_ROWS),
    )?;
    crate::print_text(&dump_json(&out), false).map_err(|e| e.to_string())?;
    Ok(0)
}

fn run_validate_site_url(args: &[String]) -> Result<u8> {
    let opts = match parse_cli("validate_site_url", args, &[]) {
        ParsedCli::Ok(o) => o,
        ParsedCli::Exit(code) => return Ok(code),
    };
    let Ok(url) = require_one_positional("validate_site_url", &opts) else {
        return Ok(2);
    };
    let validated = validate_site_url(&url)?;
    crate::print_text(&format!("{validated}\n"), false).map_err(|e| e.to_string())?;
    Ok(0)
}

fn run_compare_search_rows(args: &[String]) -> Result<u8> {
    let opts = match parse_cli("compare_search_rows", args, &["--dimensions", "--input"]) {
        ParsedCli::Ok(o) => o,
        ParsedCli::Exit(code) => return Ok(code),
    };
    if reject_positionals("compare_search_rows", &opts).is_err() {
        return Ok(2);
    }
    let payload = read_input_json(opts.input.as_deref())?;
    if !matches!(payload, Json::Object(_)) {
        return Err("compare_search_rows input must be a JSON object".into());
    }
    let dimensions = match opts.dimensions {
        Some(dims) => dims,
        None => match payload.get("dimensions") {
            Some(val) => json_string_list(val, "dimensions")?,
            None => {
                return usage_error(
                    Some("compare_search_rows"),
                    "dimensions are required via --dimensions or input JSON",
                );
            }
        },
    };
    let current = json_row_list(&payload, "current")?;
    let previous = json_row_list(&payload, "previous")?;
    let rows = compare_search_rows(&current, &previous, &dimensions)?;
    crate::print_text(&dump_json(&Json::Array(rows)), false).map_err(|e| e.to_string())?;
    Ok(0)
}

fn run_compare_requests(args: &[String]) -> Result<u8> {
    let opts = match parse_cli(
        "compare_requests",
        args,
        &["--end-date", "--days", "--dimensions", "--row-limit"],
    ) {
        ParsedCli::Ok(o) => o,
        ParsedCli::Exit(code) => return Ok(code),
    };
    if reject_positionals("compare_requests", &opts).is_err() {
        return Ok(2);
    }
    let Ok(end_raw) = require_arg("compare_requests", "--end-date", opts.end_date.as_deref())
    else {
        return Ok(2);
    };
    let end_date = parse_date(end_raw, "end_date")?;
    let dims = opts.dimensions.unwrap_or_else(default_dimensions);
    let out = build_compare_requests(
        end_date,
        opts.days.unwrap_or(DEFAULT_DAYS),
        &dims,
        opts.row_limit.unwrap_or(MAX_ROWS),
    )?;
    crate::print_text(&dump_json(&out), false).map_err(|e| e.to_string())?;
    Ok(0)
}

fn run_compare_response(args: &[String]) -> Result<u8> {
    let opts = match parse_cli(
        "compare_response",
        args,
        &[
            "--end-date",
            "--days",
            "--dimensions",
            "--row-limit",
            "--input",
        ],
    ) {
        ParsedCli::Ok(o) => o,
        ParsedCli::Exit(code) => return Ok(code),
    };
    if reject_positionals("compare_response", &opts).is_err() {
        return Ok(2);
    }
    let Ok(end_raw) = require_arg("compare_response", "--end-date", opts.end_date.as_deref())
    else {
        return Ok(2);
    };
    let end_date = parse_date(end_raw, "end_date")?;
    let days = opts.days.unwrap_or(DEFAULT_DAYS);
    let dims = opts.dimensions.unwrap_or_else(default_dimensions);
    let row_limit = opts.row_limit.unwrap_or(MAX_ROWS);
    // Validate parameters before reading or parsing payload input.
    let _ = build_compare_requests(end_date, days, &dims, row_limit)?;
    let payload = read_input_json(opts.input.as_deref())?;
    let current_payload = payload
        .get("current")
        .ok_or("missing required JSON field: current")?;
    let previous_payload = payload
        .get("previous")
        .ok_or("missing required JSON field: previous")?;
    let out = format_compare_response(
        end_date,
        days,
        &dims,
        row_limit,
        current_payload,
        previous_payload,
    )?;
    crate::print_text(&dump_json(&out), false).map_err(|e| e.to_string())?;
    Ok(0)
}

fn run_inspect_request(args: &[String]) -> Result<u8> {
    let opts = match parse_cli("inspect_request", args, &[]) {
        ParsedCli::Ok(o) => o,
        ParsedCli::Exit(code) => return Ok(code),
    };
    let Ok(url) = require_one_positional("inspect_request", &opts) else {
        return Ok(2);
    };
    let out = build_inspect_request(&url)?;
    crate::print_text(&dump_json(&out), false).map_err(|e| e.to_string())?;
    Ok(0)
}

fn run_inspect_response(args: &[String]) -> Result<u8> {
    let opts = match parse_cli("inspect_response", args, &["--input"]) {
        ParsedCli::Ok(o) => o,
        ParsedCli::Exit(code) => return Ok(code),
    };
    let Ok(url) = require_one_positional("inspect_response", &opts) else {
        return Ok(2);
    };
    let _ = validate_site_url(&url)?;
    let payload = read_input_json(opts.input.as_deref())?;
    let out = format_inspect_response(&url, &payload)?;
    crate::print_text(&dump_json(&out), false).map_err(|e| e.to_string())?;
    Ok(0)
}

fn run_sitemaps_response(args: &[String]) -> Result<u8> {
    let opts = match parse_cli("sitemaps_response", args, &["--input"]) {
        ParsedCli::Ok(o) => o,
        ParsedCli::Exit(code) => return Ok(code),
    };
    if reject_positionals("sitemaps_response", &opts).is_err() {
        return Ok(2);
    }
    let payload = read_input_json(opts.input.as_deref())?;
    let out = format_sitemaps_response(&payload)?;
    crate::print_text(&dump_json(&out), false).map_err(|e| e.to_string())?;
    Ok(0)
}

fn run_self_test(args: &[String]) -> Result<u8> {
    let opts = match parse_cli("self_test", args, &[]) {
        ParsedCli::Ok(o) => o,
        ParsedCli::Exit(code) => return Ok(code),
    };
    if reject_positionals("self_test", &opts).is_err() {
        return Ok(2);
    }
    self_test()?;
    crate::print_text("search console self-test passed\n", false).map_err(|e| e.to_string())?;
    Ok(0)
}

/// Offline self-test covering pure windows, request limits, URL checks and shaping.
pub fn self_test() -> Result<()> {
    let end = parse_date("2026-08-28", "end_date")?;
    let dims = default_dimensions();
    let cur_payload = pyjson::loads(
        r#"{"rows": [{"keys": ["https://duguid.com.au/a/", "levy"], "clicks": 4, "impressions": 100}]}"#,
    )
    .map_err(|e| e.0)?;
    let prev_payload = pyjson::loads(
        r#"{"rows": [{"keys": ["https://duguid.com.au/a/", "levy"], "clicks": 2, "impressions": 40}]}"#,
    )
    .map_err(|e| e.0)?;
    let compared = format_compare_response(
        end,
        DEFAULT_DAYS,
        &dims,
        MAX_ROWS,
        &cur_payload,
        &prev_payload,
    )?;
    let delta = compared
        .get("rows")
        .and_then(|r| match r {
            Json::Array(items) => items.first(),
            _ => None,
        })
        .and_then(|row| row.get("delta"))
        .ok_or("missing fixture delta")?;
    if delta.get("clicks") != Some(&Json::Int(2.into()))
        || delta.get("impressions") != Some(&Json::Int(60.into()))
    {
        return Err("search console fixture delta mismatch".into());
    }

    let inspect_payload =
        pyjson::loads(r#"{"inspectionResult": {"indexStatusResult": {"verdict": "PASS"}}}"#)
            .map_err(|e| e.0)?;
    let inspected = format_inspect_response(
        "https://duguid.com.au/tools/coal-lsl-levy/",
        &inspect_payload,
    )?;
    if inspected.get("property").and_then(Json::as_str) != Some(PROPERTY) {
        return Err("search console fixture inspection mismatch".into());
    }

    let sitemap_payload =
        pyjson::loads(r#"{"sitemap": [{"path": "https://duguid.com.au/sitemap.xml"}]}"#)
            .map_err(|e| e.0)?;
    let sitemaps = format_sitemaps_response(&sitemap_payload)?;
    if !matches!(sitemaps.get("sitemaps"), Some(Json::Array(items)) if items.len() == 1) {
        return Err("search console fixture sitemap mismatch".into());
    }

    if build_compare_requests(end, DEFAULT_DAYS, &["searchAppearance".into()], MAX_ROWS).is_ok() {
        return Err("invalid dimension accepted".into());
    }
    if validate_site_url("http://duguid.com.au/").is_ok() {
        return Err("non-HTTPS URL accepted".into());
    }
    Ok(())
}

pub fn run(args: &[String]) -> Result<u8> {
    let Some(first) = args.first() else {
        crate::print_text(USAGE, true).map_err(|e| e.to_string())?;
        return Ok(2);
    };
    if matches!(first.as_str(), "-h" | "--help") {
        crate::print_text(HELP, false).map_err(|e| e.to_string())?;
        return Ok(0);
    }
    let sub = first.replace('-', "_");
    let rest = &args[1..];
    match sub.as_str() {
        "comparison_windows" => run_comparison_windows(rest),
        "build_search_request" => run_build_search_request(rest),
        "validate_site_url" => run_validate_site_url(rest),
        "compare_search_rows" => run_compare_search_rows(rest),
        "compare_requests" => run_compare_requests(rest),
        "compare_response" => run_compare_response(rest),
        "inspect_request" => run_inspect_request(rest),
        "inspect_response" => run_inspect_response(rest),
        "sitemaps_response" => run_sitemaps_response(rest),
        "self_test" => run_self_test(rest),
        _ => usage_error(None, &format!("invalid choice: {}", py::repr_str(first))),
    }
}
