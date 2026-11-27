// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The preview server's handling of request lines http.server treats specially.
mod common;

use common::http::{connect, request, start};
use std::io::{Read, Write};

/// Everything the server writes for one raw request before it closes the connection.
fn exchange(port: u16, raw: &str) -> String {
    let mut connection = connect(port);
    connection.get_mut().write_all(raw.as_bytes()).unwrap();
    let mut reply = String::new();
    connection.read_to_string(&mut reply).unwrap();
    reply
}

fn site() -> (tempfile::TempDir, u16) {
    let site = tempfile::tempdir().unwrap();
    std::fs::write(site.path().join("page.txt"), "plain body").unwrap();
    std::fs::write(site.path().join("data.csv"), "a,b\n").unwrap();
    let port = start(site.path());
    (site, port)
}

#[test]
fn an_http_0_9_request_gets_a_bare_error_page_or_nothing() {
    let (_site, port) = site();
    // A file named with a trailing slash is answered 404 before any header is read, and
    // HTTP/0.9 sends the error page alone, with no status line or headers.
    let reply = exchange(port, "GET /page.txt/\r\n");
    assert!(reply.starts_with("<!DOCTYPE HTML>"), "{reply}");
    assert!(reply.contains("<p>Error code: 404</p>"), "{reply}");
    // Any other file first reads Accept-Encoding with get_all, which an HTTP/0.9
    // request's plain header dict lacks in http.server: the handler fails and the
    // connection closes with nothing sent, whatever the file's type.
    assert_eq!(exchange(port, "GET /data.csv\r\n"), "");
    assert_eq!(exchange(port, "GET /page.txt\r\n"), "");
}

#[test]
fn a_blank_request_line_closes_the_connection_without_a_reply() {
    let (_site, port) = site();
    assert_eq!(exchange(port, "\r\n"), "");
}

#[test]
fn a_version_without_a_minor_number_is_a_bad_request() {
    let (_site, port) = site();
    let reply = exchange(port, "GET /page.txt HTTP/1\r\n\r\n");
    assert!(reply.starts_with("HTTP/1.1 400 "), "{reply}");
    assert!(reply.contains("Bad request version ('HTTP/1')"), "{reply}");
}

#[test]
fn http_1_0_keep_alive_holds_the_connection_open() {
    let (_site, port) = site();
    let mut connection = connect(port);
    for _ in 0..2 {
        connection
            .get_mut()
            .write_all(b"GET /page.txt HTTP/1.0\r\nConnection: keep-alive\r\n\r\n")
            .unwrap();
        let mut head = String::new();
        loop {
            let mut line = String::new();
            std::io::BufRead::read_line(&mut connection, &mut line).unwrap();
            if line == "\r\n" {
                break;
            }
            head.push_str(&line);
        }
        assert!(head.starts_with("HTTP/1.1 200 "), "{head}");
        let mut body = [0; 10];
        connection.read_exact(&mut body).unwrap();
        assert_eq!(&body, b"plain body");
    }
}

#[cfg(unix)]
#[test]
fn a_directory_listing_marks_a_symbolic_link() {
    let (site, port) = site();
    std::os::unix::fs::symlink(site.path().join("page.txt"), site.path().join("link.txt")).unwrap();
    let listing = request(&mut connect(port), "GET", "/", &[]);
    let text = String::from_utf8(listing.body).unwrap();
    assert!(
        text.contains("<li><a href=\"link.txt\">link.txt@</a></li>"),
        "{text}"
    );
}
