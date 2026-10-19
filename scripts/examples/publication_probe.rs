//! Publication probe for the Hub harness: each stdin line is a JSON case
//! `{"repository", "commit", "responses": {endpoint: [response, ...]}}`; each output line
//! is `["ok", bool]`, `["value", message]` or `["external", null]` from `evaluate`.
//! Responses for an endpoint are served in order, the last one repeating.
use site_tools::check_publication::{Refusal, evaluate};
use site_tools::pyjson::{self, Dump, Json};
use std::collections::HashMap;
use std::io::BufRead;

fn main() {
    for line in std::io::stdin().lock().lines() {
        let case = pyjson::loads(&line.unwrap()).unwrap();
        let text = |key: &str| match case.get(key) {
            Some(Json::Str(s)) => s.clone(),
            _ => panic!("missing {key}"),
        };
        let Some(Json::Object(responses)) = case.get("responses") else {
            panic!("missing responses")
        };
        let mut served: HashMap<String, usize> = HashMap::new();
        let result = evaluate(
            &text("repository"),
            &text("commit"),
            &mut |endpoint, paginate| {
                let key = format!("{endpoint}|{paginate}");
                let Some((_, Json::Array(list))) = responses.iter().find(|(k, _)| *k == key) else {
                    return Err(Refusal::External);
                };
                let index = served.entry(key).or_insert(0);
                let response = list[(*index).min(list.len() - 1)].clone();
                *index += 1;
                Ok(response)
            },
        );
        let out = match result {
            Ok(ready) => vec![Json::Str("ok".into()), Json::Bool(ready)],
            Err(Refusal::Value(message)) => vec![Json::Str("value".into()), Json::Str(message)],
            Err(Refusal::External) => vec![Json::Str("external".into()), Json::Null],
        };
        println!("{}", pyjson::dumps(&Json::Array(out), Dump::default()));
    }
}
