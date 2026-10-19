//! scripts/serve_site.py: serve the built site over loopback with stable JavaScript MIME
//! types and GitHub Pages' text compression.
//!
//! A port of CPython 3.15's `http.server.SimpleHTTPRequestHandler` on a threading server,
//! with the site handler's HTTP/1.1 keep-alive, gzip responses and `Vary` header. MIME
//! types come from CPython's built-in table only; Python also reads the Windows registry
//! or the host's mime.types files, which the site handler guards against for `.mjs`.
use crate::html::escape;
use crate::py;
use crate::pyurl;
use flate2::{Compression, GzBuilder};
use std::fs::File;
use std::io::{self, BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

pub const HOST: &str = "127.0.0.1";
pub const PORT: u16 = 4173;
const MAXLINE: usize = 65536;
const MAXHEADERS: usize = 100;
const SERVER: &str = concat!("SimpleHTTP site-tools/", env!("CARGO_PKG_VERSION"));
const ERROR_MESSAGE: &str = r#"<!DOCTYPE HTML>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <style type="text/css">
            :root {
                color-scheme: light dark;
            }
        </style>
        <title>Error response</title>
    </head>
    <body>
        <h1>Error response</h1>
        <p>Error code: {code}</p>
        <p>Message: {message}.</p>
        <p>Error code explanation: {code} - {explain}.</p>
    </body>
</html>
"#;
/// SimpleHTTPRequestHandler.extensions_map plus the site's `.mjs` entry.
const EXTENSIONS_MAP: [(&str, &str); 5] = [
    (".gz", "application/gzip"),
    (".Z", "application/octet-stream"),
    (".bz2", "application/x-bzip2"),
    (".xz", "application/x-xz"),
    (".mjs", "text/javascript"),
];
const SUFFIX_MAP: [(&str, &str); 6] = [
    (".svgz", ".svg.gz"),
    (".tgz", ".tar.gz"),
    (".taz", ".tar.gz"),
    (".tz", ".tar.gz"),
    (".tbz2", ".tar.bz2"),
    (".txz", ".tar.xz"),
];
const ENCODINGS: [&str; 5] = [".gz", ".Z", ".bz2", ".xz", ".br"];
const COMPRESSED: [&str; 9] = [
    ".html", ".htm", ".css", ".mjs", ".js", ".txt", ".xml", ".json", ".svg",
];

/// HTTPStatus phrase and description for the codes the handler sends.
fn status(code: u16) -> (&'static str, &'static str) {
    match code {
        100 => ("Continue", "Request received, please continue"),
        200 => ("OK", "Request fulfilled, document follows"),
        301 => (
            "Moved Permanently",
            "Object moved permanently -- see URI list",
        ),
        304 => ("Not Modified", "Document has not changed since given time"),
        400 => ("Bad Request", "Bad request syntax or unsupported method"),
        404 => ("Not Found", "Nothing matches the given URI"),
        414 => ("URI Too Long", "URI is too long"),
        431 => (
            "Request Header Fields Too Large",
            "The server is unwilling to process the request because its header fields are too large",
        ),
        501 => ("Not Implemented", "Server does not support this operation"),
        505 => ("HTTP Version Not Supported", "Cannot fulfill request"),
        _ => ("???", "???"),
    }
}

/// `genericpath._splitext` with the platform's separators.
fn splitext<'a>(p: &'a str, seps: &[char]) -> (&'a str, &'a str) {
    let sep = p.rfind(seps).map_or(0, |i| i + 1);
    if let Some(dot) = p.rfind('.')
        && dot >= sep
        && p[sep..dot].bytes().any(|b| b != b'.')
    {
        return (&p[..dot], &p[dot..]);
    }
    (p, "")
}

fn os_seps() -> &'static [char] {
    if cfg!(windows) { &['\\', '/'] } else { &['/'] }
}

/// `mimetypes.guess_file_type(path)[0]` against CPython's built-in strict table.
// The drive split guess_file_type does first cannot change the extension of the
// handler's paths, which always end in a file name below the served directory.
fn guess_file_type(path: &str) -> Option<&'static str> {
    let (mut base, mut ext) = {
        let (b, e) = splitext(path, os_seps());
        (b.to_owned(), e.to_owned())
    };
    while let Some((_, replacement)) = SUFFIX_MAP.iter().find(|(k, _)| *k == ext.to_lowercase()) {
        let joined = format!("{base}{replacement}");
        let (b, e) = splitext(&joined, os_seps());
        (base, ext) = (b.to_owned(), e.to_owned());
    }
    if ENCODINGS.contains(&ext.as_str()) {
        ext = splitext(&base, os_seps()).1.to_owned();
    }
    let ext = ext.to_lowercase();
    crate::mimetypes::TYPES
        .binary_search_by(|(k, _)| (*k).cmp(ext.as_str()))
        .ok()
        .map(|i| crate::mimetypes::TYPES[i].1)
}

/// The handler's `guess_type`: its own map by exact then lower-cased extension, then mimetypes.
pub fn guess_type(path: &str) -> &'static str {
    let ext = splitext(path, &['/']).1;
    let lookup = |e: &str| {
        EXTENSIONS_MAP
            .iter()
            .find(|(k, _)| *k == e)
            .map(|(_, v)| *v)
    };
    lookup(ext)
        .or_else(|| lookup(&ext.to_lowercase()))
        .or_else(|| guess_file_type(path))
        .unwrap_or("application/octet-stream")
}

/// `urllib.parse.unquote(text, errors=...)`: only ASCII runs are percent-decoded.
/// `strict` stands in for `surrogatepass`: Rust strings cannot hold the lone surrogates
/// that error handler admits, so such paths take the `replace` fallback.
fn unquote(text: &str, strict: bool) -> Option<String> {
    if !text.contains('%') {
        return Some(text.to_owned());
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while !rest.is_empty() {
        let ascii = rest.find(|c: char| !c.is_ascii()).unwrap_or(rest.len());
        let (run, tail) = rest.split_at(ascii);
        let mut bytes = Vec::with_capacity(run.len());
        let mut bits = run.as_bytes().split(|b| *b == b'%');
        bytes.extend_from_slice(bits.next().unwrap_or_default());
        for item in bits {
            let hex = item.get(..2).and_then(|h| std::str::from_utf8(h).ok());
            match hex.and_then(|h| {
                u8::from_str_radix(h, 16)
                    .ok()
                    .filter(|_| h.bytes().all(|b| b.is_ascii_hexdigit()))
            }) {
                Some(byte) => {
                    bytes.push(byte);
                    bytes.extend_from_slice(&item[2..]);
                }
                None => {
                    bytes.push(b'%');
                    bytes.extend_from_slice(item);
                }
            }
        }
        match String::from_utf8(bytes) {
            Ok(decoded) => out.push_str(&decoded),
            Err(_) if strict => return None,
            Err(e) => out.push_str(&String::from_utf8_lossy(e.as_bytes())),
        }
        let non_ascii = tail.find(|c: char| c.is_ascii()).unwrap_or(tail.len());
        out.push_str(&tail[..non_ascii]);
        rest = &tail[non_ascii..];
    }
    Some(out)
}

fn unquote_path(text: &str) -> String {
    unquote(text, true).unwrap_or_else(|| unquote(text, false).expect("replace never fails"))
}

/// `urllib.parse.quote(text)` with `/` safe.
fn quote(text: &str) -> String {
    let mut out = String::new();
    for b in text.bytes() {
        if b.is_ascii_alphanumeric() || b"_.-~/".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn before(text: &str, delimiter: char) -> &str {
    text.split_once(delimiter).map_or(text, |(head, _)| head)
}

/// `translate_path`: the request path below the served directory, ignoring components
/// that are not simple names.
fn translate_path(directory: &Path, request: &str) -> String {
    let path = unquote_path(before(before(request, '#'), '?'));
    let trailing_slash = path.ends_with('/');
    // posixpath.normpath, then the non-empty words; `..` above the root has no effect on them.
    let mut words: Vec<&str> = Vec::new();
    for comp in path.split('/') {
        match comp {
            "" | "." => {}
            ".." => {
                if words.last().is_some_and(|w| *w != "..") {
                    words.pop();
                } else {
                    words.push("..");
                }
            }
            _ => words.push(comp),
        }
    }
    let mut result = directory.to_string_lossy().into_owned();
    for word in words {
        let has_dirname =
            cfg!(windows) && (word.contains('\\') || word.chars().nth(1) == Some(':'));
        if has_dirname || word == "." || word == ".." {
            continue;
        }
        if !result.ends_with(os_seps())
            && !(cfg!(windows) && result.len() == 2 && result.ends_with(':'))
        {
            result.push(std::path::MAIN_SEPARATOR);
        }
        result.push_str(word);
    }
    if trailing_slash {
        result.push('/');
    }
    result
}

/// `datetime.fromtimestamp(t, utc)` seconds: rounded half-even to microseconds, then floored.
fn timestamp_seconds(time: SystemTime) -> i64 {
    let nanos: i128 = match time.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_nanos() as i128,
        Err(e) => -(e.duration().as_nanos() as i128),
    };
    let (quotient, remainder) = (nanos.div_euclid(1000), nanos.rem_euclid(1000));
    let micros = if remainder > 500 || (remainder == 500 && quotient % 2 != 0) {
        quotient + 1
    } else {
        quotient
    };
    micros.div_euclid(1_000_000) as i64
}

/// `email.utils.formatdate(t, usegmt=True)`.
fn http_date(seconds: i64) -> String {
    chrono::DateTime::from_timestamp(seconds, 0)
        .map(|d| d.format("%a, %d %b %Y %H:%M:%S GMT").to_string())
        .unwrap_or_default()
}

fn http_now() -> String {
    http_date(timestamp_seconds(SystemTime::now()))
}

fn int(text: &str) -> Option<i64> {
    py::parse_int(text, 10)
        .ok()
        .and_then(|i| i64::try_from(i).ok())
}

const MONTHS: [&str; 24] = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];
const DAYS: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const ZONES: [(&str, i64); 14] = [
    ("UT", 0),
    ("UTC", 0),
    ("GMT", 0),
    ("Z", 0),
    ("AST", -400),
    ("ADT", -300),
    ("EST", -500),
    ("EDT", -400),
    ("CST", -600),
    ("CDT", -500),
    ("MST", -700),
    ("MDT", -600),
    ("PST", -800),
    ("PDT", -700),
];

/// `email.utils.parsedate_to_datetime(text)` as UTC seconds, with whether it was UTC
/// (offset zero, `-0000` or no recognised zone). `None` where Python raised.
pub fn parse_http_date(text: &str) -> Option<(i64, bool)> {
    let mut data: Vec<String> = py::split_whitespace(text)
        .into_iter()
        .map(str::to_owned)
        .collect();
    if data.is_empty() {
        return None;
    }
    if data[0].ends_with(',') || DAYS.contains(&data[0].to_lowercase().as_str()) {
        data.remove(0);
    } else if let Some(i) = data[0].rfind(',') {
        data[0] = data[0][i + 1..].to_owned();
    }
    if data.len() == 3 {
        let stuff: Vec<String> = data[0].split('-').map(str::to_owned).collect();
        if stuff.len() == 3 {
            data = stuff.into_iter().chain(data[1..].iter().cloned()).collect();
        }
    }
    if data.len() == 4 {
        let s = data[3].clone();
        let i = s.find('+').or_else(|| s.find('-'));
        match i {
            Some(i) if i > 0 => {
                data.truncate(3);
                data.push(s[..i].to_owned());
                data.push(s[i..].to_owned());
            }
            _ => data.push(String::new()),
        }
    }
    if data.len() < 5 {
        return None;
    }
    let [mut dd, mm, mut yy, mut tm, mut tz] =
        <[String; 5]>::try_from(data[..5].to_vec()).expect("five fields");
    if dd.is_empty() || mm.is_empty() || yy.is_empty() {
        return None;
    }
    let mut mm = mm.to_lowercase();
    if !MONTHS.contains(&mm.as_str()) {
        (dd, mm) = (mm, dd.to_lowercase());
        if !MONTHS.contains(&mm.as_str()) {
            return None;
        }
    }
    let mut month = MONTHS.iter().position(|m| *m == mm).expect("present") as i64 + 1;
    if month > 12 {
        month -= 12;
    }
    if dd.ends_with(',') {
        dd.pop();
    }
    if yy.find(':').is_some_and(|i| i > 0) {
        std::mem::swap(&mut yy, &mut tm);
    }
    if yy.ends_with(',') {
        yy.pop();
        if yy.is_empty() {
            return None;
        }
    }
    // str.isdigit over Latin-1 text: the ASCII digits and three superscripts.
    if !yy
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_digit() || "\u{b2}\u{b3}\u{b9}".contains(c))
    {
        std::mem::swap(&mut yy, &mut tz);
    }
    if tm.ends_with(',') {
        tm.pop();
    }
    let parts: Vec<&str> = tm.split(':').collect();
    let (thh, tmm, tss) = match parts.as_slice() {
        [h, m] => (*h, *m, "0"),
        [h, m, s] => (*h, *m, *s),
        [one] if one.contains('.') => match one.split('.').collect::<Vec<_>>().as_slice() {
            [h, m] => (*h, *m, "0"),
            [h, m, s] => (*h, *m, *s),
            _ => return None,
        },
        _ => return None,
    };
    let (Some(mut year), Some(day), Some(hour), Some(minute), Some(second)) =
        (int(&yy), int(&dd), int(thh), int(tmm), int(tss))
    else {
        return None;
    };
    if year < 100 {
        year += if year > 68 { 1900 } else { 2000 };
    }
    let tz = tz.to_uppercase();
    let mut offset = match ZONES.iter().find(|(name, _)| *name == tz) {
        Some((_, value)) => Some(*value),
        // An offset too large for i64 still parses in Python, then fails in timezone().
        None => match py::parse_int(&tz, 10) {
            Ok(value) => Some(i64::try_from(value).ok()?),
            Err(_) => None,
        },
    };
    if offset == Some(0) && tz.starts_with('-') {
        offset = None;
    }
    let offset = offset.map(|o| {
        let o = i128::from(o);
        o.signum() * ((o.abs() / 100) * 3600 + (o.abs() % 100) * 60)
    });
    // datetime.timezone refuses offsets of a day or more.
    let offset = match offset {
        Some(o) if o.abs() >= 86400 => return None,
        Some(o) => Some(o as i64),
        None => None,
    };
    let date = chrono::NaiveDate::from_ymd_opt(
        i32::try_from(year).ok()?,
        u32::try_from(month).ok()?,
        u32::try_from(day).ok()?,
    )?;
    let time = chrono::NaiveTime::from_hms_opt(
        u32::try_from(hour).ok()?,
        u32::try_from(minute).ok()?,
        u32::try_from(second).ok()?,
    )?;
    if !(1..=9999).contains(&year) {
        return None;
    }
    let seconds = date.and_time(time).and_utc().timestamp() - offset.unwrap_or(0);
    Some((seconds, offset.is_none_or(|o| o == 0)))
}

/// `file.readline(limit)`.
fn read_line(reader: &mut impl BufRead, limit: usize) -> io::Result<Vec<u8>> {
    let mut line = Vec::new();
    while line.len() < limit {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            break;
        }
        let wanted = limit - line.len();
        let take = match available.iter().take(wanted).position(|b| *b == b'\n') {
            Some(i) => i + 1,
            None => available.len().min(wanted),
        };
        line.extend_from_slice(&available[..take]);
        reader.consume(take);
        if line.ends_with(b"\n") {
            break;
        }
    }
    Ok(line)
}

fn latin1(bytes: &[u8]) -> String {
    bytes.iter().map(|b| *b as char).collect()
}

/// email's compat32 header parse of the request's header lines.
fn parse_headers(lines: &[Vec<u8>]) -> Vec<(String, String)> {
    let text: String = lines.iter().map(|l| latin1(l)).collect();
    // feedparser splits on \r\n, \r and \n alike.
    let mut split: Vec<&str> = Vec::new();
    let mut start = 0;
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let end = match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => i + 2,
            b'\r' | b'\n' => i + 1,
            _ => {
                i += 1;
                continue;
            }
        };
        split.push(&text[start..end]);
        start = end;
        i = end;
    }
    if start < text.len() {
        split.push(&text[start..]);
    }
    let mut headers: Vec<(String, Vec<String>)> = Vec::new();
    for line in split {
        if line.starts_with([' ', '\t']) {
            if let Some(last) = headers.last_mut() {
                last.1.push(line.to_owned());
            }
            continue;
        }
        if line.starts_with("From ") {
            continue;
        }
        let name_end = line.find(':');
        let is_header = name_end.is_some_and(|i| {
            line[..i]
                .bytes()
                .all(|b| (0x21..=0x7e).contains(&b) && b != b':')
        });
        let Some(i) = name_end.filter(|_| is_header) else {
            break;
        };
        headers.push((line[..i].to_owned(), vec![line[i + 1..].to_owned()]));
    }
    headers
        .into_iter()
        .map(|(name, lines)| {
            let mut value = lines[0].trim_start_matches([' ', '\t']).to_owned();
            value.extend(lines[1..].iter().map(String::as_str));
            (name, value.trim_end_matches(['\r', '\n']).to_owned())
        })
        .collect()
}

enum Body {
    Bytes(Vec<u8>),
    File(File),
}

struct Handler {
    directory: Arc<PathBuf>,
    client: String,
    writer: TcpStream,
    requestline: String,
    command: Option<String>,
    path: String,
    request_version: String,
    headers: Vec<(String, String)>,
    /// An HTTP/0.9 request leaves `headers` a plain dict in Python, without `get_all`.
    plain_headers: bool,
    close_connection: bool,
    buffer: Vec<u8>,
}

fn control_escaped(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c as u32 {
            0x5c => out.push_str("\\\\"),
            n @ (0..0x20 | 0x7f..0xa0) => out.push_str(&format!("\\x{n:02x}")),
            _ => out.push(c),
        }
    }
    out
}

impl Handler {
    fn header(&self, name: &str) -> Option<&str> {
        let name = name.to_lowercase();
        self.headers
            .iter()
            .find(|(k, _)| k.to_lowercase() == name)
            .map(|(_, v)| v.as_str())
    }

    fn log_message(&self, message: &str) {
        let now = chrono::Local::now().format("%d/%b/%Y %H:%M:%S");
        let _ = crate::print_text(&format!("{} - - [{now}] {message}\n", self.client), true);
    }

    fn log_request(&self, code: u16) {
        let line = control_escaped(&self.requestline);
        let parts = split_max(&line, 2);
        let line = match parts.as_slice() {
            [method, path, version] => format!("{method} {path} {version}"),
            _ => line.clone(),
        };
        self.log_message(&format!("\"{line}\" {code} -"));
    }

    fn send_response_only(&mut self, code: u16, message: Option<&str>) {
        if self.request_version != "HTTP/0.9" {
            let message = message.unwrap_or(status(code).0);
            self.buffer.extend(
                format!("HTTP/1.1 {code} {message}\r\n")
                    .chars()
                    .map(|c| c as u8),
            );
        }
    }

    fn send_header(&mut self, keyword: &str, value: &str) {
        if self.request_version != "HTTP/0.9" {
            self.buffer
                .extend(format!("{keyword}: {value}\r\n").chars().map(|c| c as u8));
        }
        if keyword.eq_ignore_ascii_case("connection") {
            if value.eq_ignore_ascii_case("close") {
                self.close_connection = true;
            } else if value.eq_ignore_ascii_case("keep-alive") {
                self.close_connection = false;
            }
        }
    }

    fn end_headers(&mut self) -> io::Result<()> {
        self.send_header("Vary", "Accept-Encoding");
        if self.request_version != "HTTP/0.9" {
            self.buffer.extend_from_slice(b"\r\n");
            let buffer = std::mem::take(&mut self.buffer);
            self.writer.write_all(&buffer)?;
        }
        Ok(())
    }

    fn send_response(&mut self, code: u16, message: Option<&str>) {
        self.log_request(code);
        self.send_response_only(code, message);
        self.send_header("Server", SERVER);
        self.send_header("Date", &http_now());
    }

    fn send_error(
        &mut self,
        code: u16,
        message: Option<&str>,
        explain: Option<&str>,
    ) -> io::Result<()> {
        let (short, long) = status(code);
        let message = message.unwrap_or(short).to_owned();
        let explain = explain.unwrap_or(long);
        self.log_message(&control_escaped(&format!("code {code}, message {message}")));
        self.send_response(code, Some(&message));
        self.send_header("Connection", "close");
        let mut body = None;
        if code >= 200 && ![204, 205, 304].contains(&code) {
            let content = ERROR_MESSAGE
                .replace("{code}", &code.to_string())
                .replace("{message}", &escape(&message, false))
                .replace("{explain}", &escape(explain, false));
            self.send_header("Content-Type", "text/html;charset=utf-8");
            self.send_header("Content-Length", &content.len().to_string());
            body = Some(content);
        }
        self.end_headers()?;
        if self.command.as_deref() != Some("HEAD")
            && let Some(body) = body
        {
            self.writer.write_all(body.as_bytes())?;
        }
        Ok(())
    }

    fn accepts_gzip(&self) -> io::Result<bool> {
        if self.plain_headers {
            return Err(io::Error::other(
                "AttributeError: 'dict' object has no attribute 'get_all'",
            ));
        }
        let lower = name_values(&self.headers, "accept-encoding")
            .join(",")
            .to_lowercase();
        let mut wildcard = false;
        for encoding in lower.split(',') {
            let encoding = py::strip(encoding);
            let (coding, parameter) = encoding.split_once(';').unwrap_or((encoding, ""));
            let coding = py::strip(coding);
            if coding == "gzip" || coding == "*" {
                let accepted = if parameter.is_empty() {
                    true
                } else {
                    let parameter = py::strip(parameter);
                    parameter.starts_with("q=")
                        && py::parse_float(&parameter[2..]).is_ok_and(|q| 0.0 < q && q <= 1.0)
                };
                if coding == "gzip" {
                    return Ok(accepted);
                }
                wildcard = accepted;
            }
        }
        Ok(wildcard)
    }

    /// The site handler's send_head: gzip text responses, else SimpleHTTPRequestHandler's.
    fn send_head(&mut self) -> io::Result<Option<Body>> {
        // pathlib drops a trailing slash, so `/robots.txt%2f` names robots.txt here.
        let mut path: PathBuf = Path::new(&translate_path(&self.directory, &self.path))
            .components()
            .collect();
        if path.is_dir()
            && split_path(&self.path)?.ends_with('/')
            && let Some(index) = ["index.html", "index.htm"]
                .iter()
                .map(|name| path.join(name))
                .find(|p| p.is_file())
        {
            path = index;
        }
        if !self.accepts_gzip()?
            || self.header("If-Modified-Since").is_some()
            || self.header("Range").is_some()
            || !COMPRESSED.contains(&crate::suffix(&path).to_lowercase().as_str())
        {
            return self.simple_send_head();
        }
        reject_nul(&path.to_string_lossy())?;
        let (Ok(data), Ok(modified)) = (
            std::fs::read(&path),
            std::fs::metadata(&path).and_then(|m| m.modified()),
        ) else {
            return self.simple_send_head();
        };
        let mut encoder = GzBuilder::new()
            .mtime(0)
            .operating_system(255)
            .write(Vec::new(), Compression::new(6));
        encoder.write_all(&data)?;
        let data = encoder.finish()?;
        self.send_response(200, None);
        self.send_header("Content-type", guess_type(&path.to_string_lossy()));
        self.send_header("Content-Encoding", "gzip");
        self.send_header("Content-Length", &data.len().to_string());
        self.send_header("Last-Modified", &http_date(timestamp_seconds(modified)));
        self.end_headers()?;
        Ok(Some(Body::Bytes(data)))
    }

    fn simple_send_head(&mut self) -> io::Result<Option<Body>> {
        let mut path = translate_path(&self.directory, &self.path);
        if Path::new(&path).is_dir() {
            let parts = pyurl::urlsplit(&self.path).map_err(io::Error::other)?;
            if !(parts.path.ends_with('/')
                || parts.path.ends_with("%2f")
                || parts.path.ends_with("%2F"))
            {
                self.send_response(301, None);
                let location = pyurl::urlunsplit(&pyurl::Split {
                    path: format!("{}/", parts.path),
                    ..parts
                });
                self.send_header("Location", &location);
                self.send_header("Content-Length", "0");
                self.end_headers()?;
                return Ok(None);
            }
            let directory = path.clone();
            match ["index.html", "index.htm"]
                .iter()
                .map(|name| join(&directory, name))
                .find(|p| Path::new(p).is_file())
            {
                Some(index) => path = index,
                None => return self.list_directory(&directory),
            }
        }
        let ctype = guess_type(&path);
        if path.ends_with('/') {
            self.send_error(404, Some("File not found"), None)?;
            return Ok(None);
        }
        reject_nul(&path)?;
        let file = match File::open(&path) {
            Ok(file) if file.metadata().is_ok_and(|m| !m.is_dir()) => file,
            _ => {
                self.send_error(404, Some("File not found"), None)?;
                return Ok(None);
            }
        };
        let metadata = file.metadata()?;
        let modified = timestamp_seconds(metadata.modified()?);
        if self.header("If-None-Match").is_none()
            && let Some(since) = self.header("If-Modified-Since")
            && let Some((since, utc)) = parse_http_date(since)
            && utc
            && modified <= since
        {
            self.send_response(304, None);
            self.end_headers()?;
            return Ok(None);
        }
        self.send_response(200, None);
        self.send_header("Content-type", ctype);
        self.send_header("Content-Length", &metadata.len().to_string());
        self.send_header("Last-Modified", &http_date(modified));
        self.end_headers()?;
        Ok(Some(Body::File(file)))
    }

    fn list_directory(&mut self, path: &str) -> io::Result<Option<Body>> {
        let Ok(entries) = std::fs::read_dir(path) else {
            self.send_error(404, Some("No permission to list directory"), None)?;
            return Ok(None);
        };
        let mut names: Vec<String> = entries
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort_by_key(|name| name.to_lowercase());
        let displaypath = escape(&unquote_path(before(before(&self.path, '#'), '?')), false);
        let title = format!("Directory listing for {displaypath}");
        let mut r = vec![
            "<!DOCTYPE HTML>".to_owned(),
            "<html lang=\"en\">".to_owned(),
            "<head>".to_owned(),
            "<meta charset=\"utf-8\">".to_owned(),
            "<style type=\"text/css\">\n:root {\ncolor-scheme: light dark;\n}\n</style>".to_owned(),
            format!("<title>{title}</title>\n</head>"),
            format!("<body>\n<h1>{title}</h1>"),
            "<hr>\n<ul>".to_owned(),
        ];
        for name in names {
            let full = join(path, &name);
            let (mut display, mut link) = (name.clone(), name.clone());
            if Path::new(&full).is_dir() {
                display = format!("{name}/");
                link = format!("{name}/");
            }
            if std::fs::symlink_metadata(&full).is_ok_and(|m| m.file_type().is_symlink()) {
                display = format!("{name}@");
            }
            r.push(format!(
                "<li><a href=\"{}\">{}</a></li>",
                quote(&link),
                escape(&display, false)
            ));
        }
        r.push("</ul>\n<hr>\n</body>\n</html>\n".to_owned());
        let encoded = r.join("\n").into_bytes();
        self.send_response(200, None);
        self.send_header("Content-type", "text/html; charset=utf-8");
        self.send_header("Content-Length", &encoded.len().to_string());
        self.end_headers()?;
        Ok(Some(Body::Bytes(encoded)))
    }

    /// `parse_request`: false when an error response has been sent.
    fn parse_request(&mut self, raw: &[u8], reader: &mut impl BufRead) -> io::Result<bool> {
        let mut is_http_0_9 = false;
        self.command = None;
        self.request_version = "HTTP/0.9".into();
        self.close_connection = true;
        self.requestline = latin1(raw).trim_end_matches(['\r', '\n']).to_owned();
        let line = self.requestline.clone();
        let words = py::split_whitespace(&line);
        if words.is_empty() {
            return Ok(false);
        }
        if words.len() >= 3 {
            let version = words[words.len() - 1];
            let number = version.strip_prefix("HTTP/").and_then(|base| {
                let parts: Vec<&str> = base.split('.').collect();
                match parts.as_slice() {
                    [major, minor]
                        if [major, minor].iter().all(|p| {
                            !p.is_empty() && p.len() <= 10 && p.bytes().all(|b| b.is_ascii_digit())
                        }) =>
                    {
                        Some((major.parse::<u64>().ok()?, minor.parse::<u64>().ok()?, base))
                    }
                    _ => None,
                }
            });
            let Some((major, minor, base)) = number else {
                self.request_version = String::new();
                self.send_error(
                    400,
                    Some(&format!("Bad request version ({})", py::repr_str(version))),
                    None,
                )?;
                return Ok(false);
            };
            self.request_version = version.to_owned();
            if (major, minor) >= (1, 1) {
                self.close_connection = false;
            }
            if (major, minor) >= (2, 0) {
                self.send_error(505, Some(&format!("Invalid HTTP version ({base})")), None)?;
                return Ok(false);
            }
        }
        if !(2..=3).contains(&words.len()) {
            self.request_version = String::new();
            self.send_error(
                400,
                Some(&format!("Bad request syntax ({})", py::repr_str(&line))),
                None,
            )?;
            return Ok(false);
        }
        let (command, path) = (words[0], words[1]);
        if words.len() == 2 {
            self.close_connection = true;
            if command != "GET" {
                self.request_version = String::new();
                self.send_error(
                    400,
                    Some(&format!(
                        "Bad HTTP/0.9 request type ({})",
                        py::repr_str(command)
                    )),
                    None,
                )?;
                return Ok(false);
            }
            is_http_0_9 = true;
        }
        self.command = Some(command.to_owned());
        self.path = if path.starts_with("//") {
            format!("/{}", path.trim_start_matches('/'))
        } else {
            path.to_owned()
        };
        self.headers.clear();
        self.plain_headers = is_http_0_9;
        if is_http_0_9 {
            return Ok(true);
        }
        let mut lines = Vec::new();
        loop {
            let line = read_line(reader, MAXLINE + 1)?;
            if line.len() > MAXLINE {
                self.send_error(
                    431,
                    Some("Line too long"),
                    Some("got more than 65536 bytes when reading header line"),
                )?;
                return Ok(false);
            }
            if line.is_empty() || line == b"\r\n" || line == b"\n" {
                break;
            }
            lines.push(line);
            if lines.len() > MAXHEADERS {
                self.send_error(
                    431,
                    Some("Too many headers"),
                    Some("got more than 100 headers"),
                )?;
                return Ok(false);
            }
        }
        self.headers = parse_headers(&lines);
        let connection = self.header("Connection").unwrap_or("").to_lowercase();
        if connection == "close" {
            self.close_connection = true;
        } else if connection == "keep-alive" {
            self.close_connection = false;
        }
        let expect = self.header("Expect").unwrap_or("").to_lowercase();
        if expect == "100-continue" && self.request_version.as_str() >= "HTTP/1.1" {
            self.send_response_only(100, None);
            self.end_headers()?;
        }
        Ok(true)
    }

    fn handle_one_request(&mut self, reader: &mut impl BufRead) -> io::Result<()> {
        let raw = read_line(reader, MAXLINE + 1)?;
        if raw.len() > MAXLINE {
            self.requestline.clear();
            self.request_version.clear();
            self.command = Some(String::new());
            return self.send_error(414, None, None);
        }
        if raw.is_empty() {
            self.close_connection = true;
            return Ok(());
        }
        if !self.parse_request(&raw, reader)? {
            return Ok(());
        }
        let command = self.command.clone().unwrap_or_default();
        if command != "GET" && command != "HEAD" {
            return self.send_error(
                501,
                Some(&format!("Unsupported method ({})", py::repr_str(&command))),
                None,
            );
        }
        if let Some(body) = self.send_head()?
            && command == "GET"
        {
            match body {
                Body::Bytes(bytes) => self.writer.write_all(&bytes)?,
                Body::File(mut file) => {
                    io::copy(&mut file, &mut self.writer)?;
                }
            }
        }
        self.writer.flush()
    }
}

/// Python's open() and read_bytes() raise ValueError for a NUL in the path, which
/// the handler does not catch.
fn reject_nul(path: &str) -> io::Result<()> {
    if path.contains('\0') {
        return Err(io::Error::other("ValueError: embedded null character"));
    }
    Ok(())
}

fn split_path(request: &str) -> io::Result<String> {
    Ok(pyurl::urlsplit(request).map_err(io::Error::other)?.path)
}

fn name_values<'a>(headers: &'a [(String, String)], name: &str) -> Vec<&'a str> {
    headers
        .iter()
        .filter(|(k, _)| k.to_lowercase() == name)
        .map(|(_, v)| v.as_str())
        .collect()
}

/// `os.path.join(directory, name)` for a simple name.
fn join(directory: &str, name: &str) -> String {
    if directory.ends_with(os_seps()) {
        format!("{directory}{name}")
    } else {
        format!("{directory}{}{name}", std::path::MAIN_SEPARATOR)
    }
}

/// `text.split(None, maxsplit)`.
fn split_max(text: &str, maxsplit: usize) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut rest = text.trim_start_matches(py::is_space);
    while !rest.is_empty() {
        if parts.len() == maxsplit {
            parts.push(rest);
            break;
        }
        let end = rest.find(py::is_space).unwrap_or(rest.len());
        parts.push(&rest[..end]);
        rest = rest[end..].trim_start_matches(py::is_space);
    }
    parts
}

fn handle(stream: TcpStream, directory: Arc<PathBuf>) {
    let client = stream
        .peer_addr()
        .map(|a| a.ip().to_string())
        .unwrap_or_default();
    let (Ok(reader), Ok(writer)) = (stream.try_clone(), stream.try_clone()) else {
        return;
    };
    let mut reader = BufReader::new(reader);
    let mut handler = Handler {
        directory,
        client,
        writer,
        requestline: String::new(),
        command: None,
        path: String::new(),
        request_version: String::new(),
        headers: Vec::new(),
        plain_headers: false,
        close_connection: true,
        buffer: Vec::new(),
    };
    loop {
        if let Err(error) = handler.handle_one_request(&mut reader) {
            // Python's socketserver prints the traceback and drops the connection.
            handler.log_message(&control_escaped(&format!(
                "Exception occurred during processing of request: {error}"
            )));
            break;
        }
        if handler.close_connection {
            break;
        }
    }
    // socketserver's shutdown_request: SHUT_WR, then close.
    let _ = stream.shutdown(std::net::Shutdown::Write);
}

/// `create_server`: a loopback listener for `directory`; port 0 picks a free port.
pub fn create_server(port: u16) -> io::Result<TcpListener> {
    TcpListener::bind((HOST, port))
}

/// `serve_forever`: one thread per connection, as ThreadingHTTPServer runs them.
pub fn serve(listener: TcpListener, directory: &Path) -> io::Result<()> {
    let directory = Arc::new(directory.to_path_buf());
    for stream in listener.incoming() {
        let stream = stream?;
        let directory = Arc::clone(&directory);
        std::thread::spawn(move || handle(stream, directory));
    }
    Ok(())
}

pub fn run(root: &Path) -> Result<u8, String> {
    crate::build_site::build(root, root)?;
    let listener = create_server(PORT).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    crate::print_text(&format!("Serving HTTP on {HOST} port {port}\n"), false)
        .map_err(|e| e.to_string())?;
    serve(listener, &py::resolve(root).join("_site")).map_err(|e| e.to_string())?;
    Ok(0)
}
