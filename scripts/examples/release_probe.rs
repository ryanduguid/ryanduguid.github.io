//! Release-record live probe for the Hub harness: each stdin line is a JSON case
//! `{"component", "responses": {url: answer}, "default": answer, "asset": answer}` where
//! an answer is `{"json": value}`, `{"http": code}` or `{"error": [type, message]}`.
//! Each output line lists the probes live_versions and live_asset report.
use site_tools::pyjson::{self, Dump, Json};
use site_tools::release_record::{Live, LiveError, live_asset, live_versions};
use std::io::BufRead;

struct Stub {
    responses: Vec<(String, Json)>,
    default: Json,
    asset: Json,
}

fn answer(value: &Json) -> Result<Json, LiveError> {
    if let Some(json) = value.get("json") {
        return Ok(json.clone());
    }
    if let Some(Json::Int(code)) = value.get("http") {
        return Err(LiveError::Http(u16::try_from(code.clone()).unwrap()));
    }
    let Some(Json::Array(parts)) = value.get("error") else {
        panic!("answer")
    };
    Err(LiveError::Error(parts[0].py_str(), parts[1].py_str()))
}

impl Live for Stub {
    fn json(&mut self, url: &str) -> Result<Json, LiveError> {
        let value = self
            .responses
            .iter()
            .find(|(k, _)| k == url)
            .map_or(&self.default, |(_, v)| v);
        answer(value)
    }

    fn bytes(&mut self, _: &str) -> Result<Vec<u8>, LiveError> {
        match answer(&self.asset)? {
            Json::Str(text) => Ok(text.into_bytes()),
            other => panic!("asset {other:?}"),
        }
    }
}

fn main() {
    for line in std::io::stdin().lock().lines() {
        let case = pyjson::loads(&line.unwrap()).unwrap();
        let Some(Json::Object(responses)) = case.get("responses") else {
            panic!("responses")
        };
        let mut stub = Stub {
            responses: responses.clone(),
            default: case.get("default").unwrap().clone(),
            asset: case.get("asset").unwrap().clone(),
        };
        let component = case.get("component").unwrap();
        let out = match live_versions(&mut stub, component).and_then(|mut probes| {
            let published = component.get("published").unwrap();
            if let Some(asset) = live_asset(&mut stub, published)? {
                probes.push(asset);
            }
            Ok(probes)
        }) {
            Ok(probes) => Json::Array(
                probes
                    .into_iter()
                    .map(|p| {
                        Json::Array(vec![
                            Json::Str(p.source),
                            Json::Str(p.state.into()),
                            Json::Str(p.detail),
                        ])
                    })
                    .collect(),
            ),
            Err(error) => Json::Str(error.split(':').next().unwrap_or("").to_owned()),
        };
        println!("{}", pyjson::dumps(&out, Dump::default()));
    }
}
