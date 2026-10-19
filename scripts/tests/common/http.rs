//! A minimal HTTP/1.1 client for the server tests, which need to see framing and reuse.
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

pub struct Response {
    pub version: String,
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Response {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

/// Serve `directory` on a free loopback port for the rest of the test process.
pub fn start(directory: &Path) -> u16 {
    let listener = site_tools::serve_site::create_server(0).unwrap();
    let port = listener.local_addr().unwrap().port();
    let directory = directory.to_path_buf();
    std::thread::spawn(move || site_tools::serve_site::serve(listener, &directory));
    port
}

pub fn connect(port: u16) -> BufReader<TcpStream> {
    let stream = TcpStream::connect((site_tools::serve_site::HOST, port)).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    BufReader::new(stream)
}

/// Send one request on an open connection and read its response.
pub fn request(
    connection: &mut BufReader<TcpStream>,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
) -> Response {
    let mut text = format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n");
    for (name, value) in headers {
        text.push_str(&format!("{name}: {value}\r\n"));
    }
    text.push_str("\r\n");
    connection.get_mut().write_all(text.as_bytes()).unwrap();
    let mut line = String::new();
    connection.read_line(&mut line).unwrap();
    let mut parts = line.trim_end().splitn(3, ' ');
    let version = parts.next().unwrap().to_owned();
    let status = parts.next().unwrap().parse().unwrap();
    let mut headers = Vec::new();
    loop {
        let mut line = String::new();
        connection.read_line(&mut line).unwrap();
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            break;
        }
        let (name, value) = line.split_once(": ").unwrap();
        headers.push((name.to_owned(), value.to_owned()));
    }
    let mut response = Response {
        version,
        status,
        headers,
        body: Vec::new(),
    };
    let length: usize = response
        .header("Content-Length")
        .map_or(0, |v| v.parse().unwrap());
    if method != "HEAD" && status != 304 {
        response.body = vec![0; length];
        connection.read_exact(&mut response.body).unwrap();
    }
    response
}

/// A one-off request on its own connection.
pub fn get(port: u16, path: &str, headers: &[(&str, &str)]) -> Response {
    request(&mut connect(port), "GET", path, headers)
}

pub fn gunzip(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    flate2::read::GzDecoder::new(bytes)
        .read_to_end(&mut out)
        .unwrap();
    out
}
