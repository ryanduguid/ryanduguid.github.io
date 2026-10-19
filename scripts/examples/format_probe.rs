//! Format probe for the Hub harness: each stdin line is a JSON array
//! `[template, [args...], total]`; each output line is the formatted text or the
//! exception type, as JSON, for comparison with CPython's `str.format`.
use site_tools::pyjson::{self, Dump, Json};
use std::io::BufRead;

fn main() {
    for line in std::io::stdin().lock().lines() {
        let line = line.unwrap();
        let Ok(Json::Array(case)) = pyjson::loads(&line) else {
            panic!("bad case: {line}");
        };
        let (Json::Str(template), Json::Array(args)) = (&case[0], &case[1]) else {
            panic!("bad case: {line}");
        };
        let total = match &case[2] {
            Json::Null => site_tools::pyformat::sum(args),
            other => Ok(other.clone()),
        };
        let result = total
            .and_then(|total| site_tools::pyformat::format(template, args, &[("total", total)]));
        let out = match result {
            Ok(text) => Json::Array(vec![Json::Str("ok".into()), Json::Str(text)]),
            Err(error) => Json::Array(vec![
                Json::Str("err".into()),
                Json::Str(error.split(':').next().unwrap_or("").to_owned()),
            ]),
        };
        println!("{}", pyjson::dumps(&out, Dump::default()));
    }
}
