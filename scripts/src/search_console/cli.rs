// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! `site-tools search_console`: argparse-style subcommands over the pure logic.

use super::{
    DEFAULT_DAYS, MAX_ROWS, build_compare_requests, build_inspect_request, build_search_request,
    compare_search_rows, comparison_windows, default_dimensions, format_compare_response,
    format_inspect_response, format_sitemaps_response, parse_date, self_test, validate_dimensions,
    validate_site_url,
};
use crate::py::{self, Date};
use crate::pyjson::{self, Dump, Json};
use num_bigint::Sign;
use num_traits::ToPrimitive;
use std::io::Read;
use std::path::Path;

const USAGE: &str = include_str!("../help/search_console.usage");
const HELP: &str = include_str!("../help/search_console.txt");

/// Why a subcommand stopped early: an exit code whose message is already
/// printed, or an error for `main` to print with exit code 1.
enum Exit {
    Code(u8),
    Error(String),
}

impl From<String> for Exit {
    fn from(error: String) -> Self {
        Self::Error(error)
    }
}

impl From<&str> for Exit {
    fn from(error: &str) -> Self {
        Self::Error(error.to_owned())
    }
}

type CliResult<T> = std::result::Result<T, Exit>;

/// Print an argparse usage error and exit with code 2.
fn usage_error(subcommand: Option<&str>, message: &str) -> Exit {
    let text = match subcommand {
        Some(sub) => format!("{USAGE}site-tools search_console {sub}: error: {message}\n"),
        None => format!("{USAGE}site-tools search_console: error: {message}\n"),
    };
    print_text_stderr(&text).err().unwrap_or(Exit::Code(2))
}

fn print(text: &str) -> CliResult<()> {
    crate::print_text(text, false).map_err(|e| Exit::Error(e.to_string()))
}

fn print_json(value: &Json) -> CliResult<u8> {
    let dump = Dump {
        indent: Some(2),
        sort_keys: true,
        ..Dump::default()
    };
    print(&(pyjson::dumps(value, dump) + "\n"))?;
    Ok(0)
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

/// argparse's negative-number test, `re.match(r'-\.?\d', arg)`: such a token is a
/// value, not an option, as no option here looks like a negative number.
fn is_negative_number(arg: &str) -> bool {
    arg.strip_prefix('-').is_some_and(|rest| {
        let rest = rest.strip_prefix('.').unwrap_or(rest);
        rest.starts_with(|c: char| c.is_ascii_digit())
    })
}

fn is_option_token(arg: &str) -> bool {
    arg.starts_with('-') && arg != "-" && !is_negative_number(arg)
}

/// An argparse `int`, clamped to `i64` so out-of-range values fail validation.
fn parse_int_arg(sub: &str, flag: &str, raw: &str) -> CliResult<i64> {
    let value = py::parse_int(raw, 10).map_err(|_| {
        usage_error(
            Some(sub),
            &format!("argument {flag}: invalid int value: {}", py::repr_str(raw)),
        )
    })?;
    Ok(value.to_i64().unwrap_or(if value.sign() == Sign::Minus {
        i64::MIN
    } else {
        i64::MAX
    }))
}

fn next_flag_value(
    sub: &str,
    flag: &str,
    explicit: Option<String>,
    args: &[String],
    idx: &mut usize,
) -> CliResult<String> {
    if let Some(value) = explicit {
        return Ok(value);
    }
    let Some(next) = args.get(*idx).filter(|a| !is_option_token(a)) else {
        return Err(usage_error(
            Some(sub),
            &format!("argument {flag}: expected one argument"),
        ));
    };
    *idx += 1;
    Ok(next.clone())
}

/// Resolve `name` to `--help` or one allowed flag, accepting unique prefixes.
fn resolve_option(
    sub: &str,
    arg: &str,
    name: &str,
    allowed_flags: &[&'static str],
) -> CliResult<&'static str> {
    if name == "-h" {
        return Ok("--help");
    }
    if name.len() > 2 && name.starts_with("--") {
        let all = std::iter::once("--help").chain(allowed_flags.iter().copied());
        if let Some(exact) = all.clone().find(|option| *option == name) {
            return Ok(exact);
        }
        let matches: Vec<&'static str> = all.filter(|option| option.starts_with(name)).collect();
        match matches.as_slice() {
            [one] => return Ok(one),
            [] => {}
            many => {
                return Err(usage_error(
                    Some(sub),
                    &format!("ambiguous option: {name} could match {}", many.join(", ")),
                ));
            }
        }
    }
    Err(usage_error(
        Some(sub),
        &format!("unrecognized arguments: {arg}"),
    ))
}

/// `-h`/`--help`: print the help and exit 0, or refuse `--help=value` as argparse does.
fn help(sub: &str, explicit: Option<String>) -> Exit {
    if let Some(value) = explicit {
        return usage_error(
            Some(sub),
            &format!(
                "argument -h/--help: ignored explicit argument {}",
                py::repr_str(&value)
            ),
        );
    }
    print(HELP).err().unwrap_or(Exit::Code(0))
}

/// Store the value of one resolved flag, reading it from `args` when needed.
fn apply_option(
    sub: &str,
    opts: &mut CliOptions,
    option: &str,
    explicit: Option<String>,
    args: &[String],
    idx: &mut usize,
) -> CliResult<()> {
    match option {
        "--help" => return Err(help(sub, explicit)),
        "--dimensions" => {
            let mut dims = Vec::new();
            if let Some(value) = explicit {
                dims.push(value);
            } else {
                while *idx < args.len() && !is_option_token(&args[*idx]) {
                    dims.push(args[*idx].clone());
                    *idx += 1;
                }
            }
            opts.dimensions = Some(dims);
        }
        "--days" | "--row-limit" => {
            let value = next_flag_value(sub, option, explicit, args, idx)?;
            let parsed = parse_int_arg(sub, option, &value)?;
            if option == "--days" {
                opts.days = Some(parsed);
            } else {
                opts.row_limit = Some(parsed);
            }
        }
        _ => {
            let value = Some(next_flag_value(sub, option, explicit, args, idx)?);
            match option {
                "--end-date" => opts.end_date = value,
                "--start-date" => opts.start_date = value,
                _ => opts.input = value,
            }
        }
    }
    Ok(())
}

fn parse_cli(sub: &str, args: &[String], allowed_flags: &[&'static str]) -> CliResult<CliOptions> {
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
        let option = resolve_option(sub, arg, name, allowed_flags)?;
        apply_option(sub, &mut opts, option, explicit, args, &mut idx)?;
    }
    Ok(opts)
}

/// Parse options for a subcommand that takes no positional arguments.
fn parse_flags(
    sub: &str,
    args: &[String],
    allowed_flags: &[&'static str],
) -> CliResult<CliOptions> {
    let opts = parse_cli(sub, args, allowed_flags)?;
    if !opts.positionals.is_empty() {
        return Err(usage_error(
            Some(sub),
            &format!("unrecognized arguments: {}", opts.positionals.join(" ")),
        ));
    }
    Ok(opts)
}

/// Parse options for a subcommand that takes exactly one `url` argument.
fn parse_url(
    sub: &str,
    args: &[String],
    allowed_flags: &[&'static str],
) -> CliResult<(String, CliOptions)> {
    let mut opts = parse_cli(sub, args, allowed_flags)?;
    match opts.positionals.len() {
        1 => Ok((opts.positionals.remove(0), opts)),
        0 => Err(usage_error(
            Some(sub),
            "the following arguments are required: url",
        )),
        _ => Err(usage_error(
            Some(sub),
            &format!(
                "unrecognized arguments: {}",
                opts.positionals[1..].join(" ")
            ),
        )),
    }
}

fn require_arg<'a>(sub: &str, flag: &str, value: Option<&'a str>) -> CliResult<&'a str> {
    value.ok_or_else(|| {
        usage_error(
            Some(sub),
            &format!("the following arguments are required: {flag}"),
        )
    })
}

fn read_input_json(input: Option<&str>) -> CliResult<Json> {
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
    pyjson::loads(&text).map_err(|e| Exit::Error(format!("json.decoder.JSONDecodeError: {e}")))
}

fn json_string_list(value: &Json, field: &str) -> CliResult<Vec<String>> {
    let error = || Exit::Error(format!("Search Console {field} must be a list of strings"));
    let Json::Array(items) = value else {
        return Err(error());
    };
    items
        .iter()
        .map(|item| item.as_str().map(str::to_owned).ok_or_else(error))
        .collect()
}

fn json_row_list(payload: &Json, field: &str) -> CliResult<Vec<Json>> {
    match payload.get(field) {
        None => Err(format!("missing required JSON field: {field}").into()),
        Some(Json::Array(items)) => Ok(items.clone()),
        Some(_) => Err(format!("Search Console {field} must be a list").into()),
    }
}

fn run_comparison_windows(args: &[String]) -> CliResult<u8> {
    const SUB: &str = "comparison_windows";
    let opts = parse_flags(SUB, args, &["--end-date", "--days"])?;
    let end_date = parse_date(
        require_arg(SUB, "--end-date", opts.end_date.as_deref())?,
        "end_date",
    )?;
    print_json(&comparison_windows(
        end_date,
        opts.days.unwrap_or(DEFAULT_DAYS),
    )?)
}

fn run_build_search_request(args: &[String]) -> CliResult<u8> {
    const SUB: &str = "build_search_request";
    let flags = ["--start-date", "--end-date", "--dimensions", "--row-limit"];
    let opts = parse_flags(SUB, args, &flags)?;
    let start_raw = require_arg(SUB, "--start-date", opts.start_date.as_deref())?;
    let end_raw = require_arg(SUB, "--end-date", opts.end_date.as_deref())?;
    let dims = opts.dimensions.as_deref().ok_or_else(|| {
        usage_error(
            Some(SUB),
            "the following arguments are required: --dimensions",
        )
    })?;
    let start_date = parse_date(start_raw, "start_date")?;
    let end_date = parse_date(end_raw, "end_date")?;
    let row_limit = opts.row_limit.unwrap_or(MAX_ROWS);
    print_json(&build_search_request(
        start_date, end_date, dims, row_limit,
    )?)
}

fn run_validate_site_url(args: &[String]) -> CliResult<u8> {
    let (url, _) = parse_url("validate_site_url", args, &[])?;
    print(&format!("{}\n", validate_site_url(&url)?))?;
    Ok(0)
}

fn run_compare_search_rows(args: &[String]) -> CliResult<u8> {
    const SUB: &str = "compare_search_rows";
    let opts = parse_flags(SUB, args, &["--dimensions", "--input"])?;
    if let Some(dims) = &opts.dimensions {
        validate_dimensions(dims)?;
    }
    let payload = read_input_json(opts.input.as_deref())?;
    if !matches!(payload, Json::Object(_)) {
        return Err("compare_search_rows input must be a JSON object".into());
    }
    let dimensions = match (opts.dimensions, payload.get("dimensions")) {
        (Some(dims), _) => dims,
        (None, Some(value)) => json_string_list(value, "dimensions")?,
        (None, None) => {
            return Err(usage_error(
                Some(SUB),
                "dimensions are required via --dimensions or input JSON",
            ));
        }
    };
    let current = json_row_list(&payload, "current")?;
    let previous = json_row_list(&payload, "previous")?;
    print_json(&Json::Array(compare_search_rows(
        &current,
        &previous,
        &dimensions,
    )?))
}

/// The comparison parameters, with `compare_search_performance`'s defaults.
struct Comparison {
    end_date: Date,
    days: i64,
    dims: Vec<String>,
    row_limit: i64,
    input: Option<String>,
}

fn comparison_options(sub: &str, args: &[String], flags: &[&'static str]) -> CliResult<Comparison> {
    let opts = parse_flags(sub, args, flags)?;
    let end_raw = require_arg(sub, "--end-date", opts.end_date.as_deref())?;
    Ok(Comparison {
        end_date: parse_date(end_raw, "end_date")?,
        days: opts.days.unwrap_or(DEFAULT_DAYS),
        dims: opts.dimensions.unwrap_or_else(default_dimensions),
        row_limit: opts.row_limit.unwrap_or(MAX_ROWS),
        input: opts.input,
    })
}

fn run_compare_requests(args: &[String]) -> CliResult<u8> {
    let flags = ["--end-date", "--days", "--dimensions", "--row-limit"];
    let c = comparison_options("compare_requests", args, &flags)?;
    print_json(&build_compare_requests(
        c.end_date,
        c.days,
        &c.dims,
        c.row_limit,
    )?)
}

fn run_compare_response(args: &[String]) -> CliResult<u8> {
    let flags = [
        "--end-date",
        "--days",
        "--dimensions",
        "--row-limit",
        "--input",
    ];
    let c = comparison_options("compare_response", args, &flags)?;
    // Validate parameters before reading or parsing payload input.
    build_compare_requests(c.end_date, c.days, &c.dims, c.row_limit)?;
    let payload = read_input_json(c.input.as_deref())?;
    let current = payload
        .get("current")
        .ok_or("missing required JSON field: current")?;
    let previous = payload
        .get("previous")
        .ok_or("missing required JSON field: previous")?;
    print_json(&format_compare_response(
        c.end_date,
        c.days,
        &c.dims,
        c.row_limit,
        current,
        previous,
    )?)
}

fn run_inspect_request(args: &[String]) -> CliResult<u8> {
    let (url, _) = parse_url("inspect_request", args, &[])?;
    print_json(&build_inspect_request(&url)?)
}

fn run_inspect_response(args: &[String]) -> CliResult<u8> {
    let (url, opts) = parse_url("inspect_response", args, &["--input"])?;
    validate_site_url(&url)?;
    let payload = read_input_json(opts.input.as_deref())?;
    print_json(&format_inspect_response(&url, &payload)?)
}

fn run_sitemaps_response(args: &[String]) -> CliResult<u8> {
    let opts = parse_flags("sitemaps_response", args, &["--input"])?;
    let payload = read_input_json(opts.input.as_deref())?;
    print_json(&format_sitemaps_response(&payload)?)
}

fn run_self_test(args: &[String]) -> CliResult<u8> {
    parse_flags("self_test", args, &[])?;
    self_test()?;
    print("search console self-test passed\n")?;
    Ok(0)
}

fn dispatch(args: &[String]) -> CliResult<u8> {
    let Some(first) = args.first() else {
        print_text_stderr(USAGE)?;
        return Ok(2);
    };
    if matches!(first.as_str(), "-h" | "--help") {
        print(HELP)?;
        return Ok(0);
    }
    let rest = &args[1..];
    match first.replace('-', "_").as_str() {
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
        _ => Err(usage_error(
            None,
            &format!("invalid choice: {}", py::repr_str(first)),
        )),
    }
}

fn print_text_stderr(text: &str) -> CliResult<()> {
    crate::print_text(text, true).map_err(|e| Exit::Error(e.to_string()))
}

pub fn run(args: &[String]) -> Result<u8, String> {
    match dispatch(args) {
        Ok(code) | Err(Exit::Code(code)) => Ok(code),
        Err(Exit::Error(error)) => Err(error),
    }
}
