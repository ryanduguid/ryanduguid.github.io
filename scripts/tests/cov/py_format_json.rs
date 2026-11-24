// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Coverage tests for pyformat, htmlparser and pyjson.
use num_bigint::BigInt;
use site_tools::htmlparser::{self, Event};
use site_tools::pyformat;
use site_tools::pyjson::{self, Dump, Json};

fn jint(n: i64) -> Json {
    Json::Int(BigInt::from(n))
}

#[test]
fn pyformat_covers_strings_ints_floats_errors_templates_and_sum() {
    // py_str across all Json variants
    assert_eq!(pyformat::py_str(&Json::Null).unwrap(), "None");
    assert_eq!(pyformat::py_str(&Json::Bool(true)).unwrap(), "True");
    assert_eq!(pyformat::py_str(&Json::Bool(false)).unwrap(), "False");
    assert_eq!(pyformat::py_str(&jint(-42)).unwrap(), "-42");
    assert_eq!(pyformat::py_str(&Json::Float(1.5)).unwrap(), "1.5");
    assert_eq!(pyformat::py_str(&Json::str_obj("hi")).unwrap(), "hi");
    assert_eq!(
        pyformat::py_str(&Json::Array(vec![jint(1), Json::str_obj("a")])).unwrap(),
        "[1, 'a']"
    );
    assert_eq!(
        pyformat::py_str(&Json::Object(vec![("k".into(), Json::Bool(false))])).unwrap(),
        "{'k': False}"
    );

    // int_to_float normal and overflow
    assert_eq!(
        pyformat::int_to_float(&BigInt::from(12345)).unwrap(),
        12345.0
    );
    let huge = BigInt::from(10u8).pow(400);
    assert!(pyformat::int_to_float(&huge).is_err());

    // String formatting: alignment, fill, width, precision, errors
    let s = Json::str_obj("hello");
    assert_eq!(pyformat::format_value(&s, "<8").unwrap(), "hello   ");
    assert_eq!(pyformat::format_value(&s, ">8").unwrap(), "   hello");
    assert_eq!(pyformat::format_value(&s, "^8").unwrap(), " hello  ");
    assert_eq!(pyformat::format_value(&s, "*^9.3s").unwrap(), "***hel***");
    assert_eq!(pyformat::format_value(&s, ".2").unwrap(), "he");
    assert!(pyformat::format_value(&s, "=8").is_err());
    assert!(pyformat::format_value(&s, "+s").is_err());
    assert!(pyformat::format_value(&s, "#s").is_err());
    assert_eq!(pyformat::format_value(&s, "08s").unwrap(), "hello000");
    assert!(pyformat::format_value(&s, ",s").is_err());
    assert!(pyformat::format_value(&s, "d").is_err());

    // Integer & bool formatting: bases, alt, signs, grouping, char, float codes, errors
    assert_eq!(pyformat::format_value(&jint(255), "#x").unwrap(), "0xff");
    assert_eq!(pyformat::format_value(&jint(255), "#X").unwrap(), "0XFF");
    assert_eq!(pyformat::format_value(&jint(255), "#o").unwrap(), "0o377");
    assert_eq!(pyformat::format_value(&jint(10), "#b").unwrap(), "0b1010");
    assert_eq!(
        pyformat::format_value(&jint(1000000), ",").unwrap(),
        "1,000,000"
    );
    assert_eq!(
        pyformat::format_value(&jint(1000000), "_d").unwrap(),
        "1_000_000"
    );
    assert_eq!(
        pyformat::format_value(&jint(0x123456), "_x").unwrap(),
        "12_3456"
    );
    assert_eq!(
        pyformat::format_value(&jint(0b110101), "_b").unwrap(),
        "11_0101"
    );
    assert_eq!(
        pyformat::format_value(&jint(0o12345), "_o").unwrap(),
        "1_2345"
    );
    assert_eq!(
        pyformat::format_value(&jint(-42), "0=6d").unwrap(),
        "-00042"
    );
    assert_eq!(pyformat::format_value(&jint(42), "+06d").unwrap(), "+00042");
    assert_eq!(pyformat::format_value(&jint(42), " 6d").unwrap(), "    42");
    assert_eq!(pyformat::format_value(&jint(42), "n").unwrap(), "42");
    assert_eq!(pyformat::format_value(&jint(65), "c").unwrap(), "A");
    assert_eq!(pyformat::format_value(&jint(42), ".2f").unwrap(), "42.00");
    assert_eq!(pyformat::format_value(&jint(1), ".1%").unwrap(), "100.0%");
    assert_eq!(
        pyformat::format_value(&Json::Bool(true), "").unwrap(),
        "True"
    );
    assert_eq!(pyformat::format_value(&Json::Bool(true), "d").unwrap(), "1");
    assert_eq!(
        pyformat::format_value(&Json::Bool(false), "f").unwrap(),
        "0.000000"
    );
    assert!(pyformat::format_value(&jint(-1), "c").is_err());
    assert!(pyformat::format_value(&jint(0x110000), "c").is_err());
    assert!(pyformat::format_value(&jint(42), "#c").is_err());
    assert!(pyformat::format_value(&jint(42), "+c").is_err());
    assert!(pyformat::format_value(&jint(42), ",x").is_err());
    assert!(pyformat::format_value(&jint(42), ".2d").is_err());
    assert!(pyformat::format_value(&jint(42), "s").is_err());

    // Float formatting: e/E/f/F/g/G/%/n/empty, alt, z, NaN/inf, grouping, errors
    assert_eq!(
        pyformat::format_value(&Json::Float(1234.5), ",.2f").unwrap(),
        "1,234.50"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(1234.5), "_.2F").unwrap(),
        "1_234.50"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(1234.5), ".2e").unwrap(),
        "1.23e+03"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(1234.5), ".2E").unwrap(),
        "1.23E+03"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(1234.5), "#.4g").unwrap(),
        "1234."
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(123456.0), ".3G").unwrap(),
        "1.23E+05"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(0.0000123), "g").unwrap(),
        "1.23e-05"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(0.256), ".1%").unwrap(),
        "25.6%"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(3.5), "n").unwrap(),
        "3.5"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(0.0), "#.0f").unwrap(),
        "0."
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(-0.0), "z.1f").unwrap(),
        "0.0"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(-0.001), "z.1f").unwrap(),
        "0.0"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(f64::NAN), "f").unwrap(),
        "nan"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(f64::NAN), "F").unwrap(),
        "NAN"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(f64::INFINITY), "+f").unwrap(),
        "+inf"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(f64::NEG_INFINITY), "08F").unwrap(),
        "-0000INF"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(1e20), "").unwrap(),
        "1e+20"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(1e-5), "").unwrap(),
        "1e-05"
    );
    assert!(pyformat::format_value(&Json::Float(1.5), "d").is_err());
    assert!(pyformat::format_value(&Json::Float(1.5), "s").is_err());
    assert!(pyformat::format_value(&Json::Float(1.5), "z").is_ok());

    // Null/Array/Object formatting
    assert_eq!(pyformat::format_value(&Json::Null, "").unwrap(), "None");
    assert!(pyformat::format_value(&Json::Null, "s").is_err());
    assert!(pyformat::format_value(&Json::Array(vec![]), "5").is_err());

    // Template formatting: positional, auto, kwargs, attrs, indices, !r/!s/!a, nested specs, errors
    let obj = Json::Object(vec![
        ("name".into(), Json::str_obj("café")),
        ("nums".into(), Json::Array(vec![jint(10), jint(20)])),
    ]);
    assert_eq!(
        pyformat::format(
            "{{lit}} {0[name]!a} {0[name]!r} {0[name]!s} {0[nums][1]:04d} {k:{w}.{p}f}",
            std::slice::from_ref(&obj),
            &[
                ("k", Json::Float(std::f64::consts::PI)),
                ("w", jint(6)),
                ("p", jint(2))
            ]
        )
        .unwrap(),
        "{lit} 'caf\\xe9' 'café' café 0020   3.14"
    );
    assert_eq!(
        pyformat::format("{} and {}", &[jint(1), jint(2)], &[]).unwrap(),
        "1 and 2"
    );
    assert!(pyformat::format("{0} {}", &[jint(1), jint(2)], &[]).is_err());
    assert!(pyformat::format("{} {0}", &[jint(1), jint(2)], &[]).is_err());
    assert!(pyformat::format("{", &[], &[]).is_err());
    assert!(pyformat::format("}", &[], &[]).is_err());
    assert!(pyformat::format("{0!x}", &[jint(1)], &[]).is_err());
    assert!(pyformat::format("{missing}", &[], &[]).is_err());
    assert!(pyformat::format("{0[missing]}", std::slice::from_ref(&obj), &[]).is_err());
    assert!(pyformat::format("{0[99]}", &[Json::Array(vec![jint(1)])], &[]).is_err());
    assert!(pyformat::format("{0.missing}", &[obj], &[]).is_err());
    assert!(pyformat::format("{0:{1:{2}}}", &[jint(1), jint(2), jint(3)], &[]).is_err());

    // sum
    assert_eq!(
        pyformat::sum(&[jint(1), Json::Bool(true), jint(3)]).unwrap(),
        jint(5)
    );
    assert_eq!(
        pyformat::sum(&[jint(1), Json::Float(2.5)]).unwrap(),
        Json::Float(3.5)
    );
    assert_eq!(pyformat::sum(&[]).unwrap(), jint(0));
    assert!(pyformat::sum(&[Json::str_obj("x")]).is_err());
}

#[test]
fn htmlparser_covers_declarations_comments_pis_entities_raw_and_malformed_markup() {
    let doc = concat!(
        "<!DOCTYPE html><!-- a comment --><!bogus><?xml version=\"1.0\"?>",
        "<![CDATA[raw &amp; stuff]]>",
        "<div id=plain class='single' data-x=\"a &amp; &#65; &#x42; &unknown; &copy=1\" disabled>",
        "<br/><script>if (a < b && c > d) { var x = '</notscript>'; }</script>",
        "<title>A &amp; B <b>not a tag</b></title>",
        "<p>text &lt; &#38; &#x26; &nope; < 1</p>",
        "</DIV></></123><span attr=\"unclosed"
    );
    let parsed = htmlparser::parse(doc, true);
    assert!(
        parsed
            .iter()
            .any(|p| matches!(&p.event, Event::Decl(d) if d == "DOCTYPE html"))
    );
    assert!(
        parsed
            .iter()
            .any(|p| matches!(&p.event, Event::Comment(c) if c == " a comment "))
    );
    assert!(
        parsed
            .iter()
            .any(|p| matches!(&p.event, Event::Comment(c) if c == "bogus"))
    );
    assert!(
        parsed
            .iter()
            .any(|p| matches!(&p.event, Event::Pi(pi) if pi.starts_with("xml")))
    );
    assert!(
        parsed
            .iter()
            .any(|p| matches!(&p.event, Event::UnknownDecl(u) if u.contains("CDATA")))
    );
    assert!(
        parsed
            .iter()
            .any(|p| matches!(&p.event, Event::StartEndTag(t, _) if t == "br"))
    );
    assert!(
        parsed
            .iter()
            .any(|p| matches!(&p.event, Event::EndTag(t) if t == "div"))
    );

    // convert_charrefs = false emits EntityRef and CharRef events
    let raw = htmlparser::parse("<p>&amp;&#65;&#x41;&incomplete</p><!-- unclosed", false);
    assert!(
        raw.iter()
            .any(|p| matches!(&p.event, Event::EntityRef(e) if e == "amp"))
    );
    assert!(
        raw.iter()
            .any(|p| matches!(&p.event, Event::CharRef(c) if c == "65"))
    );
    assert!(
        raw.iter()
            .any(|p| matches!(&p.event, Event::CharRef(c) if c == "x41"))
    );
}

#[test]
fn pyjson_covers_encodings_equality_errors_and_dumps_options() {
    // py_eq, truthy, repr, py_str, get, as_str
    assert!(Json::Bool(true).py_eq(&jint(1)));
    assert!(jint(2).py_eq(&Json::Float(2.0)));
    assert!(!jint(2).py_eq(&Json::Float(2.5)));
    assert!(!Json::Float(f64::NAN).py_eq(&Json::Float(f64::NAN)));
    assert!(!Json::Null.truthy());
    assert!(!Json::Bool(false).truthy());
    assert!(Json::Bool(true).truthy());
    assert!(!jint(0).truthy());
    assert!(jint(1).truthy());
    assert!(!Json::Float(0.0).truthy());
    assert!(Json::Float(0.1).truthy());
    assert!(!Json::str_obj("").truthy());
    assert!(Json::str_obj("x").truthy());
    assert!(!Json::Array(vec![]).truthy());
    assert!(Json::Array(vec![Json::Null]).truthy());
    assert!(!Json::Object(vec![]).truthy());
    assert!(Json::Object(vec![("a".into(), Json::Null)]).truthy());
    assert_eq!(Json::Null.get("a"), None);
    assert_eq!(Json::Null.as_str(), None);
    assert_eq!(Json::str_obj("x").py_str(), "x");

    // loads_bytes: UTF-8, UTF-8 BOM, UTF-16LE/BE with & without BOM, UTF-32LE/BE with BOM
    assert_eq!(
        pyjson::loads_bytes(b"{\"a\":1}").unwrap().get("a"),
        Some(&jint(1))
    );
    assert_eq!(
        pyjson::loads_bytes(b"\xef\xbb\xbf{\"a\":1}")
            .unwrap()
            .get("a"),
        Some(&jint(1))
    );
    let utf16le: Vec<u8> = std::iter::once(0xFEFFu16)
        .chain("{\"x\":true}".encode_utf16())
        .flat_map(u16::to_le_bytes)
        .collect();
    assert_eq!(
        pyjson::loads_bytes(&utf16le).unwrap().get("x"),
        Some(&Json::Bool(true))
    );
    let utf16be: Vec<u8> = std::iter::once(0xFEFFu16)
        .chain("[1,2]".encode_utf16())
        .flat_map(u16::to_be_bytes)
        .collect();
    assert_eq!(
        pyjson::loads_bytes(&utf16be).unwrap(),
        Json::Array(vec![jint(1), jint(2)])
    );
    let utf16le_nobom: Vec<u8> = "[3]".encode_utf16().flat_map(u16::to_le_bytes).collect();
    assert_eq!(
        pyjson::loads_bytes(&utf16le_nobom).unwrap(),
        Json::Array(vec![jint(3)])
    );
    let utf32le: Vec<u8> = std::iter::once(0xFEFFu32)
        .chain("null".chars().map(u32::from))
        .flat_map(u32::to_le_bytes)
        .collect();
    assert_eq!(pyjson::loads_bytes(&utf32le).unwrap(), Json::Null);
    let utf32be: Vec<u8> = std::iter::once(0xFEFFu32)
        .chain("false".chars().map(u32::from))
        .flat_map(u32::to_be_bytes)
        .collect();
    assert_eq!(pyjson::loads_bytes(&utf32be).unwrap(), Json::Bool(false));

    // loads & loads_unique: surrogates, NaN/Infinity, duplicate keys, malformed inputs
    assert_eq!(
        pyjson::loads(r#""\uD83D\uDE00\b\f\n\r\t\"\\\/""#).unwrap(),
        Json::str_obj("😀\u{0008}\u{000C}\n\r\t\"\\/")
    );
    assert!(pyjson::loads("{\"a\":1,\"a\":2}").is_ok());
    assert!(pyjson::loads_unique("{\"a\":1,\"a\":2}").is_err());
    for bad in [
        "",
        "{1:2}",
        "{\"a\":1,}",
        "[1,]",
        "[1 2]",
        "\"unterminated",
        "\"\\x20\"",
        "\"\\u123\"",
        "\"\x01\"",
        "1 2",
        "tru",
    ] {
        assert!(pyjson::loads(bad).is_err(), "expected error for {bad:?}");
    }

    // dumps options: indent, sort_keys, ensure_ascii, separators
    let val = Json::Object(vec![
        ("b".into(), Json::str_obj("café 😀 \x01 \n \t \" \\")),
        ("a".into(), Json::Array(vec![])),
        ("c".into(), Json::Object(vec![])),
        ("d".into(), Json::Float(f64::INFINITY)),
        ("e".into(), Json::Float(f64::NEG_INFINITY)),
        ("f".into(), Json::Float(f64::NAN)),
    ]);
    let pretty = pyjson::dumps(
        &val,
        Dump {
            indent: Some(2),
            sort_keys: true,
            ensure_ascii: true,
            separators: None,
        },
    );
    assert!(pretty.contains("\\u00e9") && pretty.contains("\\ud83d\\ude00"));
    assert!(pretty.contains("Infinity") && pretty.contains("-Infinity") && pretty.contains("NaN"));
    let compact = pyjson::dumps(
        &val,
        Dump {
            indent: None,
            sort_keys: false,
            ensure_ascii: false,
            separators: Some((",", ":")),
        },
    );
    assert!(compact.contains("café 😀"));
}
