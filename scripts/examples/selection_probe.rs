//! CI-selection probe for the Hub harness: each stdin line is a JSON case, one of
//! `{"paragraph": source}`, `{"skip": [event, paths, diff]}` or `{"metadata": [event, paths]}`,
//! and each output line the function's JSON result.
use site_tools::check_site::{can_skip_live_links, is_metadata_only, paragraph_structure};
use site_tools::pyjson::{self, Dump, Json};
use std::io::BufRead;

fn text(value: &Json) -> String {
    match value {
        Json::Str(s) => s.clone(),
        other => panic!("expected a string, found {other:?}"),
    }
}

fn texts(value: &Json) -> Vec<String> {
    match value {
        Json::Array(items) => items.iter().map(text).collect(),
        other => panic!("expected a list, found {other:?}"),
    }
}

fn main() {
    for line in std::io::stdin().lock().lines() {
        let case = pyjson::loads(&line.unwrap()).unwrap();
        let out = if let Some(source) = case.get("paragraph") {
            paragraph_structure(&text(source)).map_or(Json::Null, Json::Str)
        } else if let Some(Json::Array(args)) = case.get("skip") {
            Json::Bool(can_skip_live_links(
                &text(&args[0]),
                &texts(&args[1]),
                &text(&args[2]),
            ))
        } else if let Some(Json::Array(args)) = case.get("metadata") {
            Json::Bool(is_metadata_only(&text(&args[0]), &texts(&args[1])))
        } else {
            panic!("unknown case")
        };
        println!("{}", pyjson::dumps(&out, Dump::default()));
    }
}
