//! Differential aid: reads a JSON array of [text, convert_charrefs] pairs on stdin and writes,
//! for each, the parser's events with their positions, as JSON lines.
use site_tools::htmlparser::{Event, parse};
use std::io::Read;

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();
    let cases: Vec<(String, bool)> = serde_json::from_str(&input).unwrap();
    for (text, convert) in cases {
        let events: Vec<serde_json::Value> = parse(&text, convert)
            .into_iter()
            .map(|p| {
                let (kind, value) = match p.event {
                    Event::StartTag(tag, attrs) => ("starttag", serde_json::json!([tag, attrs])),
                    Event::StartEndTag(tag, attrs) => {
                        ("startendtag", serde_json::json!([tag, attrs]))
                    }
                    Event::EndTag(tag) => ("endtag", serde_json::json!(tag)),
                    Event::Data(text) => ("data", serde_json::json!(text)),
                    Event::Comment(text) => ("comment", serde_json::json!(text)),
                    Event::Decl(text) => ("decl", serde_json::json!(text)),
                    Event::Pi(text) => ("pi", serde_json::json!(text)),
                    Event::UnknownDecl(text) => ("unknown_decl", serde_json::json!(text)),
                    Event::CharRef(text) => ("charref", serde_json::json!(text)),
                    Event::EntityRef(text) => ("entityref", serde_json::json!(text)),
                };
                serde_json::json!([kind, value, p.line, p.offset])
            })
            .collect();
        println!("{}", serde_json::Value::Array(events));
    }
}
