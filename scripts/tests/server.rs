//! scripts/test_site_server.py and the preview checks of scripts/test_build_site.py.
mod common;

use common::http::{connect, get, gunzip, request, start};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

fn repository() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

/// Parallel pages can connect their assets before the accept loop catches up.
#[test]
fn connection_queue() {
    let listener = site_tools::serve_site::create_server(0).unwrap();
    let address = listener.local_addr().unwrap();
    let connections: Vec<TcpStream> = (0..8)
        .map(|_| TcpStream::connect_timeout(&address, Duration::from_secs(1)).unwrap())
        .collect();
    assert_eq!(connections.len(), 8);
}

/// Modules stay executable, and asset requests reuse one HTTP/1.1 connection with exact
/// response framing.
#[test]
fn mime_reuse_and_framing() {
    let root = repository();
    let port = start(&root);
    let response = get(port, "/assets/levy.mjs", &[]);
    assert_eq!(
        response.header("Content-type"),
        Some("text/javascript"),
        ".mjs must remain executable"
    );
    let mut connection = connect(port);
    for (method, path) in [
        ("GET", "/assets/levy.mjs"),
        ("HEAD", "/assets/levy.mjs"),
        ("GET", "/assets/fonts/PublicSans-Regular.woff2"),
    ] {
        let response = request(
            &mut connection,
            method,
            path,
            &[("Accept-Encoding", "gzip")],
        );
        assert_eq!(response.status, 200);
        assert_eq!(
            response.version, "HTTP/1.1",
            "asset requests must support HTTP/1.1 reuse"
        );
        if method == "HEAD" {
            assert!(response.body.is_empty());
            continue;
        }
        assert_eq!(
            response.body.len(),
            response
                .header("Content-Length")
                .unwrap()
                .parse::<usize>()
                .unwrap()
        );
        let body = if response.header("Content-Encoding") == Some("gzip") {
            gunzip(&response.body)
        } else {
            response.body
        };
        assert_eq!(body, std::fs::read(root.join(&path[1..])).unwrap());
    }
}

/// GitHub Pages' text compression follows Accept-Encoding, including q-values and wildcards.
#[test]
fn gzip_negotiation() {
    let site = tempfile::tempdir().unwrap();
    let expected = "<html><body><main id=\"main\">Café</main></body></html>";
    std::fs::write(site.path().join("index.html"), expected).unwrap();
    let port = start(site.path());
    let mut compressed_length = 0;
    for accept in ["gzip, deflate", "*", "*;q=0.5", "*;q=0, gzip"] {
        let response = get(port, "/", &[("Accept-Encoding", accept)]);
        assert_eq!(
            response.header("Content-Encoding"),
            Some("gzip"),
            "{accept}"
        );
        assert_eq!(response.header("Vary"), Some("Accept-Encoding"));
        compressed_length = response.body.len();
        assert_eq!(
            response
                .header("Content-Length")
                .unwrap()
                .parse::<usize>()
                .unwrap(),
            compressed_length
        );
        assert_eq!(gunzip(&response.body), expected.as_bytes());
    }
    let head = request(
        &mut connect(port),
        "HEAD",
        "/",
        &[("Accept-Encoding", "gzip")],
    );
    assert!(head.body.is_empty());
    assert_eq!(
        head.header("Content-Length")
            .unwrap()
            .parse::<usize>()
            .unwrap(),
        compressed_length
    );
    for accept in [
        "gzip;q=0",
        "gzip;q=0.0, deflate",
        "br",
        "gzip;q=invalid",
        "*;q=0",
        "*, gzip;q=0",
        "gzip;q=0, *",
    ] {
        let response = get(port, "/", &[("Accept-Encoding", accept)]);
        assert_eq!(response.header("Content-Encoding"), None, "{accept}");
        assert_eq!(response.body, expected.as_bytes());
    }
    let response = get(
        port,
        "/",
        &[("Accept-Encoding", "br"), ("Accept-Encoding", "gzip")],
    );
    assert_eq!(response.header("Content-Encoding"), Some("gzip"));
    assert_eq!(gunzip(&response.body), expected.as_bytes());
}

/// SimpleHTTPRequestHandler's redirects, listings, errors and conditional requests.
#[test]
fn standard_handler_responses() {
    let site = tempfile::tempdir().unwrap();
    std::fs::create_dir(site.path().join("dir")).unwrap();
    std::fs::write(site.path().join("dir/a b.txt"), "x").unwrap();
    std::fs::write(site.path().join("data.csv"), "a,b\n").unwrap();
    let port = start(site.path());
    let redirect = get(port, "/dir?x=1", &[]);
    assert_eq!(redirect.status, 301);
    assert_eq!(redirect.header("Location"), Some("/dir/?x=1"));
    let listing = get(port, "/dir/", &[]);
    assert_eq!(listing.status, 200);
    let text = String::from_utf8(listing.body).unwrap();
    assert!(
        text.contains("<title>Directory listing for /dir/</title>"),
        "{text}"
    );
    assert!(
        text.contains("<li><a href=\"a%20b.txt\">a b.txt</a></li>"),
        "{text}"
    );
    let missing = get(port, "/missing.html", &[]);
    assert_eq!(missing.status, 404);
    assert_eq!(missing.header("Connection"), Some("close"));
    assert!(
        String::from_utf8(missing.body)
            .unwrap()
            .contains("<p>Message: File not found.</p>")
    );
    let csv = get(port, "/data.csv", &[]);
    assert_eq!(csv.header("Content-type"), Some("text/csv"));
    let modified = csv.header("Last-Modified").unwrap().to_owned();
    let unchanged = get(port, "/data.csv", &[("If-Modified-Since", &modified)]);
    assert_eq!(unchanged.status, 304);
    let offset = get(
        port,
        "/data.csv",
        &[("If-Modified-Since", "Mon, 01 Jan 2035 00:00:00 +1000")],
    );
    assert_eq!(offset.status, 200, "only UTC dates are compared");
}
