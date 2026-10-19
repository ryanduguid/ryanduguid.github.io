//! Agent-file probe for the Hub harness: each stdin line is a JSON case
//! `{"text", "prose", "versions": [[registry, version], ...], "shlex"}`; each output line
//! holds the installs found, the version verdicts and the shlex split, for comparison
//! with the base check_agent_files.py.
use site_tools::agent_files::{installs, is_exact_version, shlex_split};
use site_tools::pyjson::{self, Dump, Json};
use std::io::BufRead;

fn s(text: &str) -> Json {
    Json::Str(text.into())
}

fn main() {
    for line in std::io::stdin().lock().lines() {
        let case = pyjson::loads(&line.unwrap()).unwrap();
        let Some(Json::Str(text)) = case.get("text") else {
            panic!("text")
        };
        let prose = matches!(case.get("prose"), Some(Json::Bool(true)));
        let found = match installs(text, prose) {
            Ok(list) => Json::Array(
                list.into_iter()
                    .map(|i| {
                        Json::Array(vec![
                            s(i.registry),
                            Json::Str(i.package),
                            i.version.map_or(Json::Null, Json::Str),
                            Json::Bool(i.runs_it),
                        ])
                    })
                    .collect(),
            ),
            Err(e) => s(e.split(':').next().unwrap_or("")),
        };
        let Some(Json::Array(versions)) = case.get("versions") else {
            panic!("versions")
        };
        let verdicts = versions
            .iter()
            .map(|pair| {
                let Json::Array(pair) = pair else {
                    panic!("pair")
                };
                let Json::Str(registry) = &pair[0] else {
                    panic!("registry")
                };
                let version = match &pair[1] {
                    Json::Str(v) => Some(v.as_str()),
                    _ => None,
                };
                Json::Bool(is_exact_version(registry, version))
            })
            .collect();
        let Some(Json::Str(shlex)) = case.get("shlex") else {
            panic!("shlex")
        };
        let split = match shlex_split(shlex) {
            Ok(tokens) => Json::Array(tokens.into_iter().map(Json::Str).collect()),
            Err(e) => Json::Array(vec![s("ValueError"), Json::Str(e)]),
        };
        let out = Json::Array(vec![found, Json::Array(verdicts), split]);
        println!("{}", pyjson::dumps(&out, Dump::default()));
    }
}
