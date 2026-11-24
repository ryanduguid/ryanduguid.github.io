// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Pass 2 coverage tests for pyformat, serve_site, pytime, pyurl, merge_driver,
//! extract_xero_badge, favicon_render and effective_life_pages helpers.
use num_bigint::BigInt;
use site_tools::effective_life_pages::{self, load as el_load, map as el_map};
use site_tools::extract_xero_badge;
use site_tools::favicon_render;
use site_tools::merge_driver;
use site_tools::pyformat;
use site_tools::pyjson::Json;
use site_tools::pytime;
use site_tools::pyurl;
use site_tools::serve_site;
use std::ffi::OsStr;
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

fn jint(n: i64) -> Json {
    Json::Int(BigInt::from(n))
}

fn s(items: &[&str]) -> Vec<String> {
    items.iter().map(|v| (*v).to_owned()).collect()
}

#[test]
fn pyformat_covers_remaining_repr_ascii_spec_attr_item_and_sum_branches() {
    // py_repr for Int, Array, Object; py_ascii for \u and \U escapes
    let nested = Json::Array(vec![
        jint(7),
        Json::Object(vec![("k".into(), Json::str_obj("€😀"))]),
    ]);
    let repr_out = pyformat::format("{0!r}", std::slice::from_ref(&nested), &[]).unwrap();
    assert_eq!(repr_out, "[7, {'k': '€😀'}]");
    let ascii_out = pyformat::format("{0!a}", &[Json::str_obj("€😀")], &[]).unwrap();
    assert_eq!(ascii_out, "'\\u20ac\\U0001f600'");

    // Float +nan, +1.0, precision too big / MemoryError
    assert_eq!(
        pyformat::format_value(&Json::Float(f64::NAN), "+f").unwrap(),
        "+nan"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(1.0), "+.1f").unwrap(),
        "+1.0"
    );
    assert!(pyformat::format_value(&Json::Float(1.0), ".2147483647f").is_err());
    assert!(pyformat::format_value(&Json::Float(1.0), ".100000001f").is_err());

    // Spec parse errors: width overflow, conflicting grouping, fractional grouping, missing precision,
    // invalid multi-char spec, non-ASCII invalid separator & unknown code, .,n
    for bad_spec in [
        "999999999999999999999d",
        ",_d",
        "_,d",
        ".,_f",
        "._,f",
        ".f",
        "xyz",
        "_\u{00e9}",
        ".,n",
        "\u{00e9}",
    ] {
        assert!(
            pyformat::format_value(&jint(42), bad_spec).is_err(),
            "{bad_spec}"
        );
    }
    assert_eq!(
        pyformat::format_value(&Json::Float(1.2345), ".,f").unwrap(),
        "1.234,500"
    );
    assert_eq!(
        pyformat::format_value(&Json::Float(1.2345), "._f").unwrap(),
        "1.234_500"
    );

    // Numeric left/centre alignment, string space sign & z, int z / huge 'c' / >4300 digits
    assert_eq!(pyformat::format_value(&jint(42), "<6d").unwrap(), "42    ");
    assert_eq!(pyformat::format_value(&jint(42), "^7d").unwrap(), "  42   ");
    assert!(pyformat::format_value(&Json::str_obj("a"), " s").is_err());
    assert!(pyformat::format_value(&Json::str_obj("a"), "zs").is_err());
    assert!(pyformat::format_value(&jint(1), "zd").is_err());
    let huge_int = Json::Int(BigInt::from(10u8).pow(4350));
    assert!(pyformat::format_value(&huge_int, "c").is_err());
    assert!(pyformat::format_value(&huge_int, "d").is_err());

    // Field integer overflow, numeric attributes (.real/.imag/.numerator/.denominator), getitem variants
    assert!(pyformat::format("{99999999999999999999999}", &[], &[]).is_err());
    assert_eq!(
        pyformat::format(
            "{0.real},{0.imag},{0.numerator},{0.denominator},{1.real},{1.imag},{1.numerator},{1.denominator},{2.real},{2.imag}",
            &[jint(5), Json::Bool(true), Json::Float(2.5)],
            &[]
        )
        .unwrap(),
        "5,0,5,1,1,0,1,1,2.5,0.0"
    );
    assert_eq!(
        pyformat::format("{0[1]}", &[Json::str_obj("abc")], &[]).unwrap(),
        "b"
    );
    for (tpl, arg) in [
        ("{0[9]}", Json::str_obj("a")),
        ("{0[k]}", Json::str_obj("a")),
        ("{0[k]}", Json::Array(vec![jint(1)])),
        ("{0[0]}", Json::Object(vec![])),
        ("{0[0]}", jint(1)),
        ("{0.}", jint(1)),
        ("{0[a}", Json::Object(vec![])),
        ("{0[]}", Json::Object(vec![])),
        ("{0[0]x}", Json::Array(vec![jint(1)])),
        ("{a{b}", jint(1)),
        ("{0!", jint(1)),
        ("{0!rx}", jint(1)),
        ("{0!r:10", jint(1)),
        ("{0", jint(1)),
        ("{0!\u{0001}}", jint(1)),
    ] {
        assert!(pyformat::format(tpl, &[arg], &[]).is_err(), "{tpl}");
    }

    // pyformat::sum: i64 overflow into BigInt loop, BigInt + Float + Int + Float, Neumaier float + int + bool + error
    let max_i = jint(i64::MAX);
    let big_sum = pyformat::sum(&[max_i.clone(), max_i.clone(), jint(1)]).unwrap();
    assert_eq!(
        big_sum,
        Json::Int(BigInt::from(i64::MAX) * 2 + BigInt::from(1))
    );
    let mixed = pyformat::sum(&[
        max_i.clone(),
        max_i,
        Json::Float(1.0),
        jint(2),
        Json::Float(0.5),
    ])
    .unwrap();
    assert!(matches!(mixed, Json::Float(_)));
    let neumaier = pyformat::sum(&[
        Json::Float(1e16),
        Json::Float(1.0),
        jint(2),
        Json::Bool(true),
        Json::Float(-1e16),
    ])
    .unwrap();
    assert_eq!(neumaier, Json::Float(4.0));
    assert!(pyformat::sum(&[Json::Float(1.0), Json::str_obj("bad")]).is_err());
}

#[test]
fn serve_site_covers_http_date_edge_cases_and_prebuilt_dir() {
    // parse_http_date branches
    assert!(serve_site::parse_http_date("").is_none());
    assert!(serve_site::parse_http_date("Mon,06 Nov 1994 08:49:37 GMT").is_some());
    assert!(serve_site::parse_http_date("06 Nov 1994 08:49+0000").is_some());
    assert!(serve_site::parse_http_date("06-Nov-94 08.49.37 GMT").is_some());
    assert!(serve_site::parse_http_date("06-Nov-94 08.49 -0000").is_some());
    assert!(serve_site::parse_http_date("Sun, 06, Nov 1994, 08:49, GMT").is_some());
    assert!(serve_site::parse_http_date("06 Nov GMT 08:49 1994").is_some());
    assert!(serve_site::parse_http_date("06 Xxx 1994 08:49:37 GMT").is_none());
    assert!(serve_site::parse_http_date("06 Nov , 08:49:37 GMT").is_none());
    assert!(serve_site::parse_http_date("06 Nov 1994 08.49.37.1 GMT").is_none());
    assert!(serve_site::parse_http_date("06 Nov 1994 badtime GMT").is_none());
    assert!(serve_site::parse_http_date("06 Nov 1994 08:49:37 +2500").is_none());
    assert!(serve_site::parse_http_date("31 Feb 1994 08:49:37 GMT").is_none());
    assert!(serve_site::parse_http_date("06 Nov 1994 99:00:00 GMT").is_none());

    // prebuilt_dir branches
    assert_eq!(serve_site::prebuilt_dir(None).unwrap(), None);
    assert_eq!(
        serve_site::prebuilt_dir(Some(OsStr::new(""))).unwrap(),
        None
    );
    let tmp = tempfile::tempdir().unwrap();
    assert!(serve_site::prebuilt_dir(Some(tmp.path().join("nope").as_os_str())).is_err());
    assert!(serve_site::prebuilt_dir(Some(tmp.path().as_os_str())).is_err());
    std::fs::write(tmp.path().join("index.html"), "<p>ok</p>").unwrap();
    assert_eq!(
        serve_site::prebuilt_dir(Some(tmp.path().as_os_str())).unwrap(),
        Some(tmp.path().to_path_buf())
    );
}

fn send_raw_http(addr: std::net::SocketAddr, raw: &[u8], timeout: Duration) -> io::Result<String> {
    let mut s = TcpStream::connect(addr)?;
    s.set_read_timeout(Some(timeout))?;
    s.write_all(raw)?;
    let _ = s.shutdown(std::net::Shutdown::Write);
    let mut buf = Vec::new();
    match s.read_to_end(&mut buf) {
        Ok(_) => Ok(String::from_utf8_lossy(&buf).into_owned()),
        Err(err)
            if matches!(
                err.kind(),
                io::ErrorKind::ConnectionReset
                    | io::ErrorKind::ConnectionAborted
                    | io::ErrorKind::BrokenPipe
            ) =>
        {
            Ok(String::from_utf8_lossy(&buf).into_owned())
        }
        Err(err) => Err(err),
    }
}

#[test]
fn serve_site_http_protocol_errors_and_edges_close_listener_on_exit() {
    const PORT_FILE_ENV: &str = "SITE_TOOLS_SERVE_PORT_FILE";
    let port_dir = tempfile::tempdir().unwrap();
    let port_file = port_dir.path().join("port.txt");
    let is_child = std::env::var_os("SITE_TOOLS_ISOLATED_TEST_CHILD").is_some();

    crate::run_in_isolated_child(
        "pass2_runtime::serve_site_http_protocol_errors_and_edges_close_listener_on_exit",
        &[(PORT_FILE_ENV, port_file.as_os_str())],
        || {
            // A deliberately stalled server must fail with a timeout error rather than
            // masquerading as an empty response.
            let stalled = TcpListener::bind(("127.0.0.1", 0)).unwrap();
            let stalled_addr = stalled.local_addr().unwrap();
            let hold = std::thread::spawn(move || {
                let _held = stalled.accept().ok();
                std::thread::sleep(Duration::from_millis(300));
            });
            let stalled_err = send_raw_http(
                stalled_addr,
                b"GET / HTTP/1.1\r\nHost: localhost\r\n\r\n",
                Duration::from_millis(100),
            )
            .unwrap_err();
            assert!(
                matches!(
                    stalled_err.kind(),
                    io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock
                ),
                "expected timeout on stalled server, got: {stalled_err:?}"
            );
            let _ = hold.join();

            let tmp = tempfile::tempdir().unwrap();
            std::fs::write(tmp.path().join("index.html"), "<p>ok</p>").unwrap();
            std::fs::write(tmp.path().join("data.txt"), "hello").unwrap();
            let listener = serve_site::create_server(0).unwrap();
            let addr = listener.local_addr().unwrap();
            if let Some(path) = std::env::var_os(PORT_FILE_ENV) {
                std::fs::write(path, addr.port().to_string()).unwrap();
            }
            let dir_clone = tmp.path().to_path_buf();
            std::thread::spawn(move || {
                let _ = serve_site::serve(listener, &dir_clone);
            });
            let send = |raw: &[u8]| send_raw_http(addr, raw, Duration::from_secs(3)).unwrap();

            assert!(send(b"GET / HTTP/2.0\r\nHost: localhost\r\n\r\n").contains("505"));
            assert!(send(b"GET / NOTHTTP\r\nHost: localhost\r\n\r\n").contains("400"));
            assert!(send(b"ONLYONE\r\n\r\n").contains("400"));
            assert!(send(b"POST /\r\n").contains("400"));
            // HTTP/0.9 triggers plain_headers -> accepts_gzip AttributeError and drops connection
            assert!(send(b"GET /\r\n").is_empty());
            // Gzip response and directory listing
            std::fs::create_dir_all(tmp.path().join("listdir/nested")).unwrap();
            assert!(
                send(
                    b"GET /data.txt HTTP/1.1\r\nHost: localhost\r\nAccept-Encoding: gzip\r\nConnection: close\r\n\r\n"
                )
                .contains("Content-Encoding: gzip")
            );
            assert!(
                send(b"GET /listdir/ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
                    .contains("Directory listing for /listdir/")
            );
            assert!(
                send(
                    b"GET //data.txt HTTP/1.1\r\nHost: localhost\r\nExpect: 100-continue\r\nX-Fold: a\r\n b\r\nFrom someone\r\nConnection: close\r\n\r\n"
                )
                .contains("100 Continue")
            );
            let long_hdr = format!("GET / HTTP/1.1\r\nX-Big: {}\r\n\r\n", "a".repeat(66_000));
            assert!(send(long_hdr.as_bytes()).contains("431"));
            let mut many_hdrs = String::from("GET / HTTP/1.1\r\n");
            for i in 0..105 {
                many_hdrs.push_str(&format!("X-H{i}: v\r\n"));
            }
            many_hdrs.push_str("\r\n");
            assert!(send(many_hdrs.as_bytes()).contains("431"));
            let long_req = format!("GET /{} HTTP/1.1\r\n\r\n", "a".repeat(66_000));
            assert!(send(long_req.as_bytes()).contains("414"));
            // Embedded NUL byte triggers reject_nul error path and drops connection cleanly
            let nul_resp = send(b"GET /a%00b HTTP/1.1\r\nConnection: close\r\n\r\n");
            assert!(
                nul_resp.is_empty(),
                "expected empty response on embedded NUL, got: {nul_resp:?}"
            );
        },
    );

    if !is_child {
        let port: u16 = std::fs::read_to_string(&port_file)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        let err = TcpStream::connect(("127.0.0.1", port)).unwrap_err();
        assert_eq!(
            err.kind(),
            io::ErrorKind::ConnectionRefused,
            "listener port {port} remained open after isolated child exited: {err:?}"
        );
    }
}

#[test]
fn pytime_pyurl_merge_driver_badge_favicon_and_effective_life_helpers_cover_edges() {
    // 1. pytime ISO week dates & 24:00:00 rollovers & error paths
    for valid in [
        "2026-W01",
        "2026-W01-1",
        "2020-W53-7",
        "2026W01",
        "2026W011",
        "2026W011T12:00:00",
        "2026-01-01T24:00:00",
        "2024-02-28T24:00:00",
        "2024-02-29T24:00:00",
        "2026-02-28T24:00:00",
        "2026-04-30T24:00:00",
        "2026-12-31T24:00:00",
    ] {
        assert!(pytime::datetime_fromisoformat(valid).is_some(), "{valid}");
    }
    for invalid in [
        "2026-W0",
        "2026-W01-",
        "2025-W53-1",
        "0000-W01-1",
        "2026-W01-8",
        "2026W01-1",
        "2026-01-01T1",
        "2026-01-01T12:3",
        "2026-01-01T12:34x",
        "2026-01-01T12:34.",
        "2026-01-01T12:34.abc",
        "2026-01-01T24:01:00",
        "2026-01-01T12:00:00Z1",
        "2026-01-01T12:00:00+99:00",
    ] {
        assert!(
            pytime::datetime_fromisoformat(invalid).is_none(),
            "{invalid}"
        );
    }

    // 2. pyurl bracketed IPv6 / IPvFuture / IPv4-in-brackets / hostname / unquote
    assert!(pyurl::urlsplit("http://[v1.abc]/").is_ok());
    for bad in [
        "http://a[::1]/",
        "http://[::1]extra/",
        "http://[vZZ.abc]/",
        "http://[127.0.0.1]/",
        "http://[notanip]/",
    ] {
        assert!(pyurl::urlsplit(bad).is_err(), "{bad}");
    }
    assert_eq!(pyurl::hostname(""), None);
    assert_eq!(pyurl::hostname(":80"), None);
    assert_eq!(
        pyurl::hostname("[::1%eth0]:80").as_deref(),
        Some("::1%eth0")
    );
    assert_eq!(pyurl::unquote("a%20%ZZ", false).as_deref(), Some("a %ZZ"));
    assert!(pyurl::unquote("%FF", true).is_none());
    assert!(pyurl::unquote("%FF", false).is_some());

    // 3. merge_driver: merge_llms_index, merge_baseline, run (--generated and 3-way)
    assert_eq!(
        merge_driver::merge_llms_index("no", "no", "no").unwrap(),
        None
    );
    assert_eq!(merge_driver::merge_baseline("[]", "{}", "{}"), None);
    // CRLF + unsorted insert + conflicting remove + both-added
    let base = "{\"s\":{\"a\":\"1\",\"b\":\"2\"}}\r\n";
    let curr = "{\"s\":{\"z\":\"0\",\"a\":\"1\"}}\r\n";
    let inc = "{\"s\":{\"a\":\"1\",\"b\":\"2\",\"c\":\"3\"}}\r\n";
    let merged = merge_driver::merge_baseline(base, curr, inc).unwrap();
    assert!(merged.contains("\r\n"));
    assert!(merged.contains("\"c\""));
    // Conflict when incoming changed key current deleted
    let inc_conflict = "{\"s\":{\"a\":\"1\",\"b\":\"9\"}}\r\n";
    assert!(merge_driver::merge_baseline(base, curr, inc_conflict).is_none());

    let mtmp = tempfile::tempdir().unwrap();
    let f_base = mtmp.path().join("base");
    let f_curr = mtmp.path().join("curr");
    let f_inc = mtmp.path().join("inc");
    std::fs::write(&f_base, "a\nb\n").unwrap();
    std::fs::write(&f_curr, "a\nb\n").unwrap();
    std::fs::write(&f_inc, "a\nc\n").unwrap();
    assert_eq!(merge_driver::run(&s(&["--generated", "only1"])).unwrap(), 2);
    assert_eq!(merge_driver::run(&s(&["only1"])).unwrap(), 2);
    assert_eq!(
        merge_driver::run(&[
            "--generated".into(),
            f_base.to_string_lossy().into_owned(),
            f_curr.to_string_lossy().into_owned(),
            f_inc.to_string_lossy().into_owned(),
            "other.txt".into(),
        ])
        .unwrap(),
        0
    );
    assert_eq!(
        merge_driver::run(&[
            f_base.to_string_lossy().into_owned(),
            f_curr.to_string_lossy().into_owned(),
            f_inc.to_string_lossy().into_owned(),
        ])
        .unwrap(),
        0
    );
    assert_eq!(std::fs::read_to_string(&f_curr).unwrap(), "a\nc\n");

    // 4. extract_xero_badge: missing cert, no stream, bad flate, truncated flate, trailing bytes, missing mask, publish
    let xtmp = tempfile::tempdir().unwrap();
    assert_eq!(
        extract_xero_badge::run(xtmp.path(), &s(&["missing.pdf"])).unwrap(),
        1
    );
    let no_stream = xtmp.path().join("nostream.pdf");
    std::fs::write(
        &no_stream,
        b"1 0 obj << /Image /Width 318 /Height 318 /SMask 2 0 R >> endobj\n2 0 obj <<>> endobj\n",
    )
    .unwrap();
    assert!(extract_xero_badge::extract(&no_stream).unwrap().is_err());

    let bad_flate = xtmp.path().join("badflate.pdf");
    std::fs::write(
        &bad_flate,
        b"1 0 obj << /Image /Width 318 /Height 318 /SMask 2 0 R >> stream\r\nNOTZLIB\nendstream endobj\n2 0 obj <<>> endobj\n",
    )
    .unwrap();
    assert!(extract_xero_badge::extract(&bad_flate).unwrap().is_err());

    let trunc_flate = xtmp.path().join("trunc.pdf");
    std::fs::write(
        &trunc_flate,
        b"1 0 obj << /Image /Width 318 /Height 318 /SMask 2 0 R >> stream\n\x78\x9cendstream endobj\n2 0 obj <<>> endobj\n",
    )
    .unwrap();
    assert!(extract_xero_badge::extract(&trunc_flate).unwrap().is_err());

    let missing_mask = xtmp.path().join("nomask.pdf");
    let compressed_small = favicon_render::compress(b"tiny");
    let mut mm_bytes = Vec::new();
    mm_bytes
        .extend_from_slice(b"1 0 obj << /Image /Width 318 /Height 318 /SMask 99 0 R >> stream\n");
    mm_bytes.extend_from_slice(&compressed_small);
    mm_bytes.extend_from_slice(b"endstream endobj\n");
    std::fs::write(&missing_mask, &mm_bytes).unwrap();
    // Hits missing mask KeyError
    assert!(extract_xero_badge::extract(&missing_mask).is_err());

    let trailing_flate = xtmp.path().join("trailing.pdf");
    let mut tf_bytes = Vec::new();
    tf_bytes
        .extend_from_slice(b"1 0 obj << /Image /Width 318 /Height 318 /SMask 2 0 R >> stream\n");
    tf_bytes.extend_from_slice(&compressed_small);
    tf_bytes.extend_from_slice(b"EXTRA\nendstream endobj\n2 0 obj <<>> stream\n");
    tf_bytes.extend_from_slice(&compressed_small);
    tf_bytes.extend_from_slice(b"endstream endobj\n");
    std::fs::write(&trailing_flate, &tf_bytes).unwrap();
    // Hits inflate_prefix (trailing bytes) and colour-plate size mismatch
    assert!(
        extract_xero_badge::extract(&trailing_flate)
            .unwrap()
            .is_err()
    );

    let tiny_png = extract_xero_badge::build_png(&[1, 2, 3], &[255], 1).unwrap();
    assert_eq!(
        extract_xero_badge::publish(xtmp.path(), "cert.pdf", &tiny_png).unwrap(),
        0
    );
    assert_eq!(
        extract_xero_badge::publish(xtmp.path(), "cert.pdf", &tiny_png).unwrap(),
        0
    );

    // 5. favicon_render::parse_seal error branches
    for bad_svg in [
        "<svg",
        r##"<svg viewBox="1 0 16 16"></svg>"##,
        r##"<svg viewBox="0 0 16 32"></svg>"##,
        r##"<svg viewBox="0 0 0 0"></svg>"##,
        r##"<svg viewBox="0 0 16 16"><circle/></svg>"##,
        r##"<svg viewBox="0 0 16 16"><rect rx="2" width="4" height="4" fill="#000000"/></svg>"##,
        r##"<svg viewBox="0 0 16 16"><rect width="4" height="4"/></svg>"##,
        r##"<svg viewBox="0 0 16 16"><rect width="4" height="4" fill="#fff"/></svg>"##,
        r##"<svg viewBox="0 0 16 16"><rect width="4" height="4" fill="#zzzzzz"/></svg>"##,
        r##"<svg viewBox="0 0 16 16"><rect x="-1" width="4" height="4" fill="#000000"/></svg>"##,
        r##"<svg viewBox="0 0 16 16"><rect width="4" fill="#000000"/></svg>"##,
        r##"<svg viewBox="0 0 16 16"><rect width="20" height="4" fill="#000000"/></svg>"##,
        r##"<svg viewBox="0 0 16 16"></svg>"##,
    ] {
        assert!(favicon_render::parse_seal(bad_svg).is_err(), "{bad_svg}");
    }

    // 6. effective_life_pages::load & map error branches
    for bad_data in [
        "{}",
        r#"{"source":{"title":"No Year"}}"#,
        r#"{"source":{"title":"Test 2026","register_id":"r","registered":"2026-01-01","url":"https://a","read":"2026-01-01","attribution":"a","licence_url":"https://b"}}"#,
        r#"{"source":{"title":"Test 2026","register_id":"r","registered":"2026-01-01","url":"https://a","read":"2026-01-01","attribution":"a","licence_url":"https://b"},"table_a":[{"heading":"H","sections":[{"rows":[["x",1,null,null,"",null]]}]}],"table_b":[]}"#,
        r#"{"source":{"title":"Test 2026","register_id":"r","registered":"2026-01-01","url":"https://a","read":"2026-01-01","attribution":"a","licence_url":"https://b"},"table_a":[{"heading":"H","sections":[{"rows":[["x",0,"5",null,"",null]]}]}],"table_b":[]}"#,
        r#"{"source":{"title":"Test 2026","register_id":"r","registered":"2026-01-01","url":"https://a","read":"2026-01-01","attribution":"a","licence_url":"https://b"},"table_a":[{"heading":"H","sections":[{"rows":[["x",0,null,null,"",123]]}]}],"table_b":[]}"#,
        r#"{"source":{"title":"Test 2026","register_id":"r","registered":"2026-01-01","url":"https://a","read":"2026-01-01","attribution":"a","licence_url":"https://b"},"table_a":[],"table_b":[{"heading":"A","rows":[["x",1,null,null,"",null]]}]}"#,
    ] {
        assert!(el_load::load(bad_data).is_err(), "{bad_data}");
    }
    for bad_map in [
        "{}",
        r#"{"pages":[{}]}"#,
        r#"{"pages":[{"key":["A"],"url":"/bad/","published":"2026-01-01","modified":"2026-01-01","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}]}"#,
        r#"{"pages":[{"key":["A"],"url":"/tools/depreciation-rates/industry/","published":"bad","modified":"2026-01-01","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}]}"#,
        r#"{"pages":[{"key":["A"],"url":"/tools/depreciation-rates/industry/","published":"2026-01-01","modified":"2026-01-01","sha256":"short"}]}"#,
        r#"{"pages":[{"key":["A"],"url":"/tools/depreciation-rates/industry/","published":"2026-01-01","modified":"2026-01-01","sha256":"0000000000000000000000000000000000000000000000000000000000000000"},{"key":["A"],"url":"/tools/depreciation-rates/asset/","published":"2026-01-01","modified":"2026-01-01","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}]}"#,
        r#"{"pages":[{"key":["A"],"url":"/tools/depreciation-rates/industry/","published":"2026-01-01","modified":"2026-01-01","sha256":"0000000000000000000000000000000000000000000000000000000000000000"},{"key":["B"],"url":"/tools/depreciation-rates/industry/","published":"2026-01-01","modified":"2026-01-01","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}]}"#,
    ] {
        assert!(el_map::AddressMap::parse(bad_map).is_err(), "{bad_map}");
    }
    // Table B leaf with rows under it -> plan error
    let leaf_with_rows = el_load::load(
        r#"{"source":{"title":"Test 2026","register_id":"r","registered":"2026-01-01","url":"https://a","read":"2026-01-01","attribution":"a","licence_url":"https://b"},"table_a":[],"table_b":[{"heading":"A","rows":[["Top",0,"5",60,"",null],["Child",1,"3",36,"",null]]}]}"#,
    )
    .unwrap();
    assert!(effective_life_pages::plan(&leaf_with_rows).is_err());
}

#[test]
fn runtime_pass2b_covers_node_pyjson_pyre_pycsv_pyval_pyargs_and_favicon_bigint() {
    use site_tools::{html, node, py, pyargs, pycsv, pyjson, pyre, pyval};
    use std::path::Path;

    // 1. node: decode_uri invalid UTF-8, number formatting, template, fs_error, resolve, fetch_failure
    for bad_uri in ["%80", "%C0%AF", "%C2x", "%F8%80%80%80%80"] {
        assert!(node::decode_uri(bad_uri).is_none(), "{bad_uri}");
    }
    assert_eq!(node::number(f64::NAN), "NaN");
    assert_eq!(node::number(0.0), "0");
    assert_eq!(node::number(f64::INFINITY), "Infinity");
    assert_eq!(node::number(f64::NEG_INFINITY), "-Infinity");
    assert_eq!(node::number(-5.0), "-5");
    assert_eq!(node::number(0.0001), "0.0001");
    assert_eq!(node::number(1e-7), "1e-7");
    assert_eq!(node::number(1.23e-7), "1.23e-7");
    assert_eq!(node::number(1e25), "1e+25");
    assert_eq!(node::number(1.23e25), "1.23e+25");
    assert_eq!(
        node::template(Some(&serde_json::json!([null, 1, "a"]))),
        ",1,a"
    );
    for kind in [
        io::ErrorKind::NotFound,
        io::ErrorKind::PermissionDenied,
        io::ErrorKind::AlreadyExists,
        io::ErrorKind::IsADirectory,
        io::ErrorKind::NotADirectory,
        io::ErrorKind::Other,
    ] {
        let msg = node::fs_error(&io::Error::new(kind, "err"), "open", Path::new("x"));
        assert!(msg.contains("open 'x'"));
    }
    let resolved = node::resolve(Path::new("./a/../b"));
    assert!(resolved.ends_with("b"));
    for (err, expected_msg, expected_code) in [
        (
            ureq::Error::Timeout(ureq::Timeout::Global),
            "The operation was aborted due to timeout",
            None,
        ),
        (ureq::Error::HostNotFound, "fetch failed", Some("ENOTFOUND")),
        (
            ureq::Error::ConnectionFailed,
            "fetch failed",
            Some("ECONNREFUSED"),
        ),
        (
            ureq::Error::Io(io::Error::new(io::ErrorKind::ConnectionRefused, "refused")),
            "fetch failed",
            Some("ECONNREFUSED"),
        ),
        (
            ureq::Error::Io(io::Error::new(io::ErrorKind::ConnectionReset, "reset")),
            "fetch failed",
            Some("ECONNRESET"),
        ),
        (
            ureq::Error::Io(io::Error::new(io::ErrorKind::ConnectionAborted, "aborted")),
            "fetch failed",
            Some("ECONNABORTED"),
        ),
        (
            ureq::Error::Io(io::Error::new(io::ErrorKind::TimedOut, "timedout")),
            "fetch failed",
            Some("ETIMEDOUT"),
        ),
        (
            ureq::Error::Io(io::Error::new(io::ErrorKind::UnexpectedEof, "eof")),
            "fetch failed",
            Some("UND_ERR_SOCKET"),
        ),
        (
            ureq::Error::Io(io::Error::other("other")),
            "fetch failed",
            Some("other"),
        ),
    ] {
        assert_eq!(
            node::fetch_failure(&err),
            (expected_msg, expected_code.map(str::to_owned)),
            "unexpected fetch_failure for {err:?}"
        );
    }
    let (status_msg, status_code) = node::fetch_failure(&ureq::Error::StatusCode(500));
    assert_eq!(status_msg, "fetch failed");
    assert!(
        status_code.as_deref().is_some_and(|c| c.contains("500")),
        "expected status code in {status_code:?}"
    );

    // 2. pyjson: NaN/Infinity/-Infinity, scientific notation, UTF-16/UTF-32 BOM decoding
    assert!(matches!(pyjson::loads("NaN").unwrap(), Json::Float(f) if f.is_nan()));
    assert!(matches!(
        pyjson::loads("Infinity").unwrap(),
        Json::Float(f) if f.is_infinite() && f.is_sign_positive()
    ));
    assert!(matches!(
        pyjson::loads("-Infinity").unwrap(),
        Json::Float(f) if f.is_infinite() && f.is_sign_negative()
    ));
    assert!(matches!(pyjson::loads("1e2").unwrap(), Json::Float(_)));
    assert!(matches!(pyjson::loads("1E-2").unwrap(), Json::Float(_)));
    assert!(matches!(pyjson::loads("1e+2").unwrap(), Json::Float(_)));
    assert!(pyjson::loads("1e").is_err());
    assert!(pyjson::loads_bytes(b"\xff\xfe1\x00").is_ok());
    assert!(pyjson::loads_bytes(b"\xfe\xff\x001").is_ok());
    assert!(pyjson::loads_bytes(b"\xff\xfe\x00\x001\x00\x00\x00").is_ok());
    assert!(pyjson::loads_bytes(b"\x00\x00\xfe\xff\x00\x00\x001").is_ok());
    assert!(pyjson::loads_bytes(b"\xff\xfe1").is_err());

    // 3. pyre: non-ASCII I flag, \W, \D, \v, \a, \0, \B (native & fancy), (?P=name) without I
    assert!(pyre::re("é", pyre::I).is_match("É"));
    assert!(pyre::re(r"\W\D\v\a\0", 0).is_match("!\x41\x0b\x07\0"));
    assert!(pyre::re(r"a\Bb", 0).is_match("ab"));
    assert!(pyre::re(r"(?<=a)\Bb", 0).is_match("ab"));
    assert!(pyre::re(r"(?P<k>x)(?P=k)", 0).is_match("xx"));

    // 4. pycsv: empty, trailing comma without newline, oversized field, EatCrnl error, quote-in-field
    assert!(pycsv::reader("").unwrap().is_empty());
    assert_eq!(pycsv::reader("a,").unwrap(), vec![vec!["a", ""]]);
    assert_eq!(pycsv::reader("\"a\"x").unwrap(), vec![vec!["ax"]]);
    assert!(pycsv::reader(&"a".repeat(131_075)).is_err());
    assert_eq!(pycsv::reader("a\rb").unwrap(), vec![vec!["a"], vec!["b"]]);
    assert!(pycsv::dict_reader("").unwrap().is_empty());

    // 5. pyval From impls and str()
    assert_eq!(pyval::Val::from(true).repr(), "True");
    assert_eq!(pyval::Val::from(5usize).repr(), "5");
    assert_eq!(pyval::Val::from(-3i64).repr(), "-3");
    assert_eq!(
        pyval::Val::from(("a", 1i64, false)).repr(),
        "('a', 1, False)"
    );
    assert_eq!(pyval::Val::from(42i64).str(), "42");

    // 6. pyargs Parser edge cases (ambiguous prefix, explicit =value, unknown flag)
    const P: pyargs::Parser = pyargs::Parser {
        prog: "prog",
        usage: "usage\n",
        help: "help\n",
        flags: &["--alpha", "--also"],
        exclusive: &["--alpha", "--also"],
        required: true,
    };
    assert!(matches!(P.parse(&s(&["--al"])), pyargs::Parsed::Exit(2)));
    assert!(matches!(
        P.parse(&s(&["--alpha=1"])),
        pyargs::Parsed::Exit(2)
    ));
    assert!(matches!(
        P.parse(&s(&["--unknown"])),
        pyargs::Parsed::Exit(2)
    ));

    // 7. py helpers + html::unescape + favicon_render huge BigInt 180px scale fallback
    assert!(py::int_repr(&(BigInt::from(10u8).pow(4350))).is_err());
    assert_eq!(py::splitlines("a\r\nb\rc\u{0085}d\u{2028}e").len(), 5);
    assert_eq!(
        html::unescape("&#x110000;&#0;&nope;"),
        "\u{fffd}\u{fffd}&nope;"
    );
    let big_grid = BigInt::from(10u64).pow(17);
    let seal = favicon_render::Seal {
        grid: big_grid.clone(),
        rects: vec![favicon_render::Rect {
            x: BigInt::from(0),
            y: BigInt::from(0),
            width: big_grid.clone(),
            height: big_grid,
            fill: vec![0, 0, 0],
        }],
    };
    assert!(!favicon_render::raster(&seal, 180).unwrap().is_empty());
}
