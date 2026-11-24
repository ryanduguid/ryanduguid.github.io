// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Coverage tests for py, pytime, pyobj, pyurl, pyre, pyargs, pyval, pycsv and node.
use num_bigint::BigInt;
use serde_json::json;
use site_tools::node::{self, Ended};
use site_tools::py::{self, Date, OsStyle, PyPath, ReadError};
use site_tools::pyargs::{Parsed, Parser};
use site_tools::pycsv;
use site_tools::pyjson::Json;
use site_tools::pyobj::{self, Dict};
use site_tools::pyre;
use site_tools::pytime;
use site_tools::pyurl;
use site_tools::pyval::{self, Val};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

fn jint(n: i64) -> Json {
    Json::Int(BigInt::from(n))
}

#[test]
fn py_helpers_cover_unicode_numbers_paths_utf8_and_dates() {
    assert!(py::is_space('\u{00A0}'));
    assert!(py::is_word('a'));
    assert!(!py::is_word('-'));
    let _ = py::word_diff('a');
    assert!(py::is_printable('A'));
    assert!(!py::is_printable('\0'));
    assert!(py::is_decimal('9'));
    assert_eq!(py::decimal_value('7'), Some(7));
    assert!(!py::D.is_empty() && !py::S.is_empty() && !py::W.is_empty());
    assert!(!py::word_boundary().is_empty());
    assert!(py::ignorecase_letter('s').contains('S'));
    assert!(!py::ignorecase_literal("Abc").is_empty());

    assert_eq!(py::strip(" \u{00A0}hi\t "), "hi");
    assert_eq!(py::split_whitespace(" a\u{2003}b\nc "), vec!["a", "b", "c"]);
    assert_eq!(
        py::splitlines("a\r\nb\rc\nd\u{0085}e\u{2028}f\u{2029}g"),
        vec!["a", "b", "c", "d", "e", "f", "g"]
    );
    assert_eq!(py::casefold("Straße"), "strasse");
    assert_eq!(py::prefix_chars("héllo", 2), "hé");
    assert_eq!(py::char_len("héllo"), 5);
    assert_eq!(
        py::repr_str("a'\"b\n\r\t\\\x00\u{0085}\u{1F600}"),
        r#"'a\'"b\n\r\t\\\x00\x85😀'"#
    );
    assert_eq!(
        py::repr_bytes(b"a'\"\\\n\r\t\x00\xff"),
        r#"b'a\'"\\\n\r\t\x00\xff'"#
    );

    assert_eq!(py::float_repr(f64::NAN), "nan");
    assert_eq!(py::float_repr(f64::INFINITY), "inf");
    assert_eq!(py::float_repr(f64::NEG_INFINITY), "-inf");
    assert_eq!(py::float_repr(-0.0), "-0.0");
    assert_eq!(py::float_repr(1e16), "1e+16");
    assert_eq!(py::float_repr(1e-5), "1e-05");
    assert!(py::int_digits_error(5000).contains("5000"));
    assert_eq!(py::int_repr(&BigInt::from(-99)).unwrap(), "-99");
    assert!(py::int_repr(&BigInt::from(10u8).pow(4305)).is_err());

    assert_eq!(py::parse_int(" 1_a ", 16).unwrap(), BigInt::from(26));
    assert_eq!(py::parse_int("-10_10", 2).unwrap(), BigInt::from(-10));
    assert_eq!(py::parse_int("+7_7", 8).unwrap(), BigInt::from(63));
    assert_eq!(py::parse_int("zz", 36).unwrap(), BigInt::from(1295));
    assert!(py::parse_int("1__2", 10).is_err());
    assert!(py::parse_int("abc", 10).is_err());
    assert!(py::parse_int("00", 10).is_ok());
    assert_eq!(py::parse_float(" 1_000.25 ").unwrap(), 1000.25);
    assert!(py::parse_float("-infinity").unwrap().is_infinite());
    assert!(py::parse_float("NaN").unwrap().is_nan());
    assert!(py::parse_float("1__2.0").is_err());
    assert!(py::parse_float("not-a-float").is_err());

    // decode_utf8 error paths (invalid start, truncated, overlong, surrogate)
    assert_eq!(py::decode_utf8(b"ok").unwrap(), "ok");
    for bad in [
        &[0x80u8][..],
        &[0xC2],
        &[0xC0, 0xAF],
        &[0xED, 0xA0, 0x80],
        &[0xF4, 0x90, 0x80, 0x80],
    ] {
        let err = py::decode_utf8(bad).unwrap_err();
        assert!(!err.to_string().is_empty());
    }
    assert_eq!(py::universal_newlines("a\r\nb\rc"), "a\nb\nc");

    let dir = tempfile::tempdir().unwrap();
    let bad_utf8 = dir.path().join("bad.txt");
    std::fs::write(&bad_utf8, [0xFFu8]).unwrap();
    assert!(matches!(
        py::read_text(&bad_utf8),
        Err(ReadError::Decode(_))
    ));
    assert!(matches!(
        py::read_text(&dir.path().join("nope")),
        Err(ReadError::Os(_))
    ));
    let io_err = std::fs::read_to_string(dir.path().join("nope")).unwrap_err();
    assert!(py::oserror_str(&io_err, "f.txt", OsStyle::Errno).contains("f.txt"));
    assert!(py::oserror_str(&io_err, "f.txt", OsStyle::Native).contains("f.txt"));

    // PyPath
    let abs_root = if cfg!(windows) {
        "C:/a//b/./c"
    } else {
        "/a//b/./c"
    };
    let p = PyPath::new(abs_root).join("d");
    assert!(p.is_absolute());
    assert_eq!(p.name(), "d");
    assert_eq!(p.parent().name(), "c");
    assert!(
        p.display().ends_with("/a/b/c/d") || p.display().ends_with(r"\a\b\c\d"),
        "{}",
        p.display()
    );
    assert_eq!(p.fs(), std::path::PathBuf::from(p.display()));
    let rel = PyPath::new(".").join("x");
    assert!(!rel.is_absolute());
    assert_eq!(rel.name(), "x");

    // Date
    let d = Date::new(2024, 2, 29).unwrap();
    assert_eq!(d.isoformat(), "2024-02-29");
    assert_eq!(Date::from_ordinal(d.ordinal()), Some(d));
    assert_eq!(d.add_days(1), Some(Date::new(2024, 3, 1).unwrap()));
    assert!(Date::new(2025, 2, 29).is_err());
    assert!(Date::new(2025, 13, 1).is_err());
    assert_eq!(
        Date::fromisoformat("2026-11-24"),
        Some(Date::new(2026, 11, 24).unwrap())
    );
    assert_eq!(
        Date::fromisoformat("20261124"),
        Some(Date::new(2026, 11, 24).unwrap())
    );
    assert_eq!(
        Date::fromisoformat("2026-W01-1"),
        Some(Date::new(2025, 12, 29).unwrap())
    );
    assert_eq!(
        Date::fromisoformat("2026W011"),
        Some(Date::new(2025, 12, 29).unwrap())
    );
    assert_eq!(Date::fromisoformat("bad"), None);
    let _ = Date::today();
}

#[test]
fn pytime_covers_strptime_and_iso_datetime_variants() {
    assert_eq!(
        pytime::strptime_day_month_year("24 November 2026"),
        Some(Date::new(2026, 11, 24).unwrap())
    );
    assert_eq!(pytime::strptime_day_month_year("32 November 2026"), None);
    assert_eq!(pytime::strptime_day_month_year("24 Smarch 2026"), None);
    assert_eq!(
        pytime::strptime_compact("20261124"),
        Some(Date::new(2026, 11, 24).unwrap())
    );
    assert_eq!(pytime::strptime_compact("20261399"), None);

    // datetime_fromisoformat variants
    let naive = pytime::datetime_fromisoformat("2026-11-24").unwrap();
    assert_eq!(naive.utc_micros(), None);
    let utc = pytime::datetime_fromisoformat("2026-11-24T05:30:15.123456Z").unwrap();
    assert!(utc.utc_micros().is_some());
    let off = pytime::datetime_fromisoformat("2026-11-24 05:30:15+11:00").unwrap();
    assert!(off.utc_micros().is_some());
    let off_sec = pytime::datetime_fromisoformat("2026-11-24T05:30:15-04:30:10.500").unwrap();
    assert!(off_sec.utc_micros().is_some());
    let compact = pytime::datetime_fromisoformat("20261124T053015Z").unwrap();
    assert!(compact.utc_micros().is_some());
    let week = pytime::datetime_fromisoformat("2026-W01-1T00:00Z").unwrap();
    assert!(week.utc_micros().is_some());
    let hh_only = pytime::datetime_fromisoformat("2026-11-24T12").unwrap();
    assert_eq!(hh_only.utc_micros(), None);
    for bad in [
        "",
        "2026-02-30T00:00:00Z",
        "2026-11-24T25:00:00Z",
        "2026-11-24T00:60:00Z",
        "2026-11-24T00:00:60Z",
        "2026-11-24T00:00:00+25:00",
        "2026-11-24T00:00:00+00:60",
        "2026-W54-1",
    ] {
        assert_eq!(pytime::datetime_fromisoformat(bad), None, "{bad}");
    }
    assert!(pytime::now_utc_micros() > 0);
}

#[test]
fn pyobj_pyurl_pyre_pyargs_pyval_pycsv_and_node_cover_edge_cases() {
    // pyobj
    let arr = Json::Array(vec![jint(10), jint(20)]);
    let obj = Json::Object(vec![("k".into(), jint(7))]);
    assert_eq!(pyobj::type_name(&Json::Null), "NoneType");
    assert_eq!(pyobj::type_name(&Json::Bool(true)), "bool");
    assert_eq!(pyobj::type_name(&jint(1)), "int");
    assert_eq!(pyobj::type_name(&Json::Float(1.0)), "float");
    assert_eq!(pyobj::type_name(&Json::str_obj("s")), "str");
    assert_eq!(pyobj::type_name(&arr), "list");
    assert_eq!(pyobj::type_name(&obj), "dict");
    assert!(pyobj::hashable(&jint(1)).is_ok());
    assert!(pyobj::hashable(&arr).is_err());
    assert!(pyobj::hashable(&obj).is_err());
    assert_eq!(pyobj::subscript(&arr, &jint(-1)).unwrap(), jint(20));
    assert_eq!(
        pyobj::subscript(&arr, &Json::Bool(false)).unwrap(),
        jint(10)
    );
    assert!(pyobj::subscript(&arr, &jint(5)).is_err());
    assert!(pyobj::subscript(&arr, &Json::str_obj("0")).is_err());
    assert_eq!(
        pyobj::subscript(&obj, &Json::str_obj("k")).unwrap(),
        jint(7)
    );
    assert!(pyobj::subscript(&obj, &Json::str_obj("missing")).is_err());
    assert_eq!(
        pyobj::subscript(&Json::str_obj("ab"), &jint(-1)).unwrap(),
        Json::str_obj("b")
    );
    assert!(pyobj::subscript(&Json::str_obj("ab"), &jint(9)).is_err());
    assert!(pyobj::subscript(&jint(1), &jint(0)).is_err());
    assert_eq!(pyobj::iterate(&arr).unwrap().len(), 2);
    assert_eq!(pyobj::iterate(&obj).unwrap(), vec![Json::str_obj("k")]);
    assert_eq!(pyobj::iterate(&Json::str_obj("ab")).unwrap().len(), 2);
    assert!(pyobj::iterate(&jint(1)).is_err());
    assert_eq!(pyobj::py_len(&arr).unwrap(), 2);
    assert_eq!(pyobj::py_len(&obj).unwrap(), 1);
    assert_eq!(pyobj::py_len(&Json::str_obj("hé")).unwrap(), 2);
    assert!(pyobj::py_len(&Json::Null).is_err());
    let mut d1 = Dict::default();
    d1.insert(Json::str_obj("a"), jint(1)).unwrap();
    d1.insert(Json::str_obj("a"), jint(2)).unwrap();
    assert!(d1.insert(arr.clone(), jint(3)).is_err());
    let mut d2 = Dict::default();
    d2.insert(Json::str_obj("a"), jint(2)).unwrap();
    assert!(d1.equals(&d2));
    assert_eq!(d1.key_set(), vec![Json::str_obj("a")]);
    let s1 = pyobj::set(vec![jint(1), jint(2), jint(1)]).unwrap();
    let s2 = pyobj::set(vec![jint(2), jint(1)]).unwrap();
    assert!(pyobj::set_eq(&s1, &s2));
    assert!(pyobj::set(vec![arr]).is_err());

    // pyurl
    let sample_url = ["https://", "u", ":", "p", "@[::1]:8443/a/b?q=1#frag"].concat();
    let sp = pyurl::urlsplit(&sample_url).unwrap();
    assert_eq!(sp.scheme, "https");
    assert_eq!(pyurl::urlunsplit(&sp), sample_url);
    assert!(pyurl::has_authority("https://example.com/a").unwrap());
    assert!(!pyurl::has_authority("mailto:a@b.com").unwrap());
    assert_eq!(pyurl::port("[::1]:8443").unwrap(), Some(8443));
    assert_eq!(pyurl::port("example.com").unwrap(), None);
    assert!(pyurl::port("example.com:99999").is_err());
    assert_eq!(pyurl::hostname("user@[::1]:8443"), Some("::1".into()));
    assert_eq!(
        pyurl::hostname("Example.COM:80"),
        Some("example.com".into())
    );
    assert_eq!(
        pyurl::urljoin("https://example.com/a/b/c", "../d?x=1").unwrap(),
        "https://example.com/a/d?x=1"
    );
    assert_eq!(pyurl::unquote("a%20b%C3%A9", true), Some("a bé".into()));
    assert_eq!(pyurl::unquote("%FF", true), None);
    assert!(pyurl::unquote("%FF", false).is_some());

    // pyre
    assert!(pyre::fullmatch(r"\d+", 0, "12345"));
    assert!(!pyre::fullmatch(r"\d+", 0, "12a"));
    assert_eq!(pyre::escape("a.b+c"), r"a\.b\+c");
    let r = pyre::re(r"(\w+)=(\d+)", pyre::I | pyre::M | pyre::S);
    assert!(r.is_match("A=1"));
    assert!(r.search_at("A=1 B=2", 4).is_some());
    assert_eq!(r.findall("a=1 b=2"), vec!["a", "b"]);
    assert_eq!(
        r.findall_groups("a=1 b=2"),
        vec![vec!["a", "1"], vec!["b", "2"]]
    );
    assert_eq!(pyre::re(r",\s*", 0).split("a, b,c"), vec!["a", "b", "c"]);
    assert_eq!(pyre::re(r"\d+", 0).sub("X", "a1b22"), "aXbX");
    assert_eq!(
        pyre::re(r"\d+", 0).sub_with("a1b2", |c| format!("[{}]", &c[0])),
        "a[1]b[2]"
    );

    // pyargs
    const P: Parser = Parser {
        prog: "prog",
        usage: "usage: prog [--check | --write]\n",
        help: "help text\n",
        flags: &["--check", "--write", "--verbose"],
        exclusive: &["--check", "--write"],
        required: true,
    };
    assert!(matches!(P.parse(&["--help".into()]), Parsed::Exit(0)));
    assert!(matches!(P.parse(&["-h".into()]), Parsed::Exit(0)));
    assert!(matches!(P.parse(&[]), Parsed::Exit(2)));
    assert!(matches!(
        P.parse(&["--check".into(), "--write".into()]),
        Parsed::Exit(2)
    ));
    assert!(matches!(P.parse(&["--check=1".into()]), Parsed::Exit(2)));
    assert!(matches!(
        P.parse(&["--check".into(), "--".into(), "pos".into()]),
        Parsed::Exit(2)
    ));
    assert!(
        matches!(P.parse(&["--ch".into(), "--ver".into()]), Parsed::Flags(ref f) if f == &["--check", "--verbose"])
    );

    // pyval
    let v = Val::Dict(vec![
        (Val::from("t"), Val::Tuple(vec![Val::None])),
        (Val::from("l"), Val::list(["x", "y"])),
        (Val::from("b"), Val::Bool(true)),
        (Val::from("f"), Val::Bool(false)),
        (Val::from("i"), Val::Int(5)),
        (Val::from("j"), Val::Json(jint(9))),
    ]);
    assert!(v.repr().contains("(None,)"));
    assert_eq!(Val::from("raw").str(), "raw");
    assert_eq!(Val::Int(5).str(), "5");
    assert_eq!(pyval::repr_list(["a", "b"]), "['a', 'b']");
    assert_eq!(
        pyval::counter_sub(&["a".into(), "a".into(), "b".into()], &["a".into()]),
        vec!["a".to_owned(), "b".to_owned()]
    );
    assert_eq!(pyval::find("hello", "ll"), 2);
    assert_eq!(pyval::find("hello", "zz"), -1);

    // pycsv
    let rows = pycsv::reader("a,b\r\n\"c,d\",\"e\"\"f\"\n").unwrap();
    assert_eq!(rows, vec![vec!["a", "b"], vec!["c,d", "e\"f"]]);
    let dict_rows = pycsv::dict_reader("h1,h2\nv1,v2\nv3\n").unwrap();
    assert_eq!(dict_rows.len(), 2);
    assert_eq!(dict_rows[1][1], ("h2".into(), None));

    // node
    assert!(node::is_space('\u{FEFF}'));
    assert_eq!(node::trim("\u{3000}hi\n"), "hi");
    assert_eq!(node::length("a😀b"), 4);
    assert_eq!(node::slice("a😀b", 3), "a😀");
    assert_eq!(node::locale_compare("a", "b"), std::cmp::Ordering::Less);
    assert_eq!(
        node::numeric_compare("file2", "file10"),
        std::cmp::Ordering::Less
    );
    assert_eq!(node::encode_uri_component("a b/c"), "a%20b%2Fc");
    assert_eq!(node::decode_uri("a%20b"), Some("a b".into()));
    assert_eq!(node::decode_uri("%ZZ"), None);
    assert_eq!(node::number(0.0), "0");
    assert_eq!(node::number(-0.0), "0");
    assert_eq!(node::number(f64::NAN), "NaN");
    assert_eq!(node::number(f64::INFINITY), "Infinity");
    assert_eq!(node::number(f64::NEG_INFINITY), "-Infinity");
    assert_eq!(node::number(1.5), "1.5");
    assert_eq!(node::template(None), "undefined");
    assert_eq!(node::template(Some(&json!(null))), "null");
    assert_eq!(node::template(Some(&json!(true))), "true");
    assert_eq!(node::template(Some(&json!(3))), "3");
    assert_eq!(node::template(Some(&json!([1, 2]))), "1,2");
    assert_eq!(node::template(Some(&json!({"a": 1}))), "[object Object]");
    assert!(!node::truthy(None));
    assert!(!node::truthy(Some(&json!(0))));
    assert!(node::truthy(Some(&json!(1))));
    assert!(!node::truthy(Some(&json!(""))));
    assert!(node::truthy(Some(&json!("x"))));
    assert!(node::truthy(Some(&json!([]))));
    let s_json = node::stringify(&json!({"a": "x\n\"\\", "b": [1, true, null]}));
    assert!(
        s_json.contains("\"a\"") && s_json.contains("true") && s_json.contains("null"),
        "{s_json}"
    );
    assert_eq!(node::extname("a.b.c"), ".c");
    assert_eq!(node::extname(".hidden"), "");
    assert_eq!(node::extname("plain"), "");

    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("t.txt");
    node::write(&f, "hello").unwrap();
    assert_eq!(node::read(&f).unwrap(), "hello");
    assert_eq!(node::read_dir(dir.path()).unwrap().len(), 1);
    assert!(node::read(&dir.path().join("missing")).is_err());
    assert!(
        node::fs_error(
            &std::io::Error::new(std::io::ErrorKind::NotFound, "x"),
            "open",
            &f
        )
        .contains("ENOENT")
    );
    assert!(
        node::spawn_error(
            &std::io::Error::new(std::io::ErrorKind::NotFound, "x"),
            "cmd"
        )
        .contains("ENOENT")
    );

    // node::fetch + header + fetch_failure against local TCP server
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let handle = std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 512];
            let _ = stream.read(&mut buf);
            let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nX-Test: val\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
        }
    });
    let agent = node::fetch_agent(Duration::from_secs(5), true, node::USER_AGENT, "*/*");
    let resp = node::fetch(&agent, &format!("http://{addr}/")).unwrap();
    assert_eq!(resp.status().as_u16(), 200);
    assert_eq!(node::header(&resp, "x-test").as_deref(), Some("val"));
    handle.join().unwrap();

    // Connection refused exercises fetch_failure
    let closed_listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let closed_addr = closed_listener.local_addr().unwrap();
    drop(closed_listener);
    let err = node::fetch(&agent, &format!("http://{closed_addr}/")).unwrap_err();
    let (msg, code) = node::fetch_failure(&err);
    assert!(!msg.is_empty());
    let _ = code;

    // node::capture (normal exit)
    let child = std::process::Command::new(if cfg!(windows) { "cmd" } else { "sh" })
        .args(if cfg!(windows) {
            ["/C", "echo hi"]
        } else {
            ["-c", "echo hi"]
        })
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    let (ended, out, _err) = node::capture(child, Some(Duration::from_secs(5)));
    assert!(matches!(ended, Ended::Exited(s) if s.success()));
    assert!(String::from_utf8_lossy(&out).contains("hi"));
}
