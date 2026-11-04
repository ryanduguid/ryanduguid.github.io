//! The Node behaviours the former Node scripts' output depended on.
//!
//! check_production, stamp_source_freshness and check_ato_sources were Node scripts.
//! Their patterns used JavaScript's `\s`, their limits counted UTF-16 code units, their
//! sorts used ICU collation through `localeCompare`, and their messages quoted Node's
//! renderings of numbers, values, file errors and fetch failures. Reproducing them here
//! keeps output, reports and stored baselines byte for byte what the scripts wrote.
use serde_json::Value;
use std::cmp::Ordering;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

/// JavaScript's `\s` as the body of a regex character class.
pub const SPACE: &str = r"\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";

/// Whether JavaScript's `\s` matches `c`.
pub fn is_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\x0B' | '\x0C' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `String.prototype.trim`.
pub fn trim(text: &str) -> &str {
    text.trim_matches(is_space)
}

/// A string's `length`: UTF-16 code units.
pub fn length(text: &str) -> usize {
    text.chars().map(char::len_utf16).sum()
}

/// `text.slice(0, units)`. A surrogate pair the cut splits leaves half a pair, which
/// Node writes as U+FFFD.
pub fn slice(text: &str, units: usize) -> String {
    let mut taken = 0;
    let mut kept = String::new();
    for c in text.chars() {
        if taken + c.len_utf16() > units {
            if taken < units {
                kept.push('\u{FFFD}');
            }
            break;
        }
        taken += c.len_utf16();
        kept.push(c);
    }
    kept
}

/// Printable ASCII in ICU's root collation order, letters case-blind.
const COLLATION: &str = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789abcdefghijklmnopqrstuvwxyz";

fn primary(c: char) -> u32 {
    COLLATION
        .find(c.to_ascii_lowercase())
        .map_or(0x100 + c as u32, |rank| rank as u32)
}

/// `a.localeCompare(b)`: ICU's root collation compares the letters case-blind first,
/// with punctuation and symbols before digits, and then puts lower case first.
// shortcut: exact for printable ASCII, which every cited URL, tag and slug has held.
// Other characters sort after it by code point, where ICU interleaves accented letters
// with their base letters; use icu_collator if a cited URL ever holds one.
pub fn locale_compare(a: &str, b: &str) -> Ordering {
    let primaries = |s: &str| s.chars().map(primary).collect::<Vec<_>>();
    let cases = |s: &str| {
        s.chars()
            .map(|c| c.is_ascii_uppercase())
            .collect::<Vec<_>>()
    };
    primaries(a)
        .cmp(&primaries(b))
        .then_with(|| cases(a).cmp(&cases(b)))
}

/// `a.localeCompare(b, 'en', { numeric: true })`: as [`locale_compare`], with each run of
/// digits compared as one number. ICU drops leading zeroes at every level, so 'v1.01.0'
/// equals 'v1.1.0'.
pub fn numeric_compare(a: &str, b: &str) -> Ordering {
    // Each key's primary weight, a digit run's being its number, and whether it is an
    // upper-case letter.
    fn keys(s: &str) -> (Vec<(u32, usize, &str)>, Vec<bool>) {
        let (mut primaries, mut cases) = (Vec::new(), Vec::new());
        let mut rest = s;
        while let Some(c) = rest.chars().next() {
            let digits = rest.len() - rest.trim_start_matches(|d: char| d.is_ascii_digit()).len();
            if digits > 0 {
                let number = rest[..digits].trim_start_matches('0');
                primaries.push((primary('0'), number.len(), number));
                cases.push(false);
                rest = &rest[digits..];
            } else {
                primaries.push((primary(c), 0, ""));
                cases.push(c.is_ascii_uppercase());
                rest = &rest[c.len_utf8()..];
            }
        }
        (primaries, cases)
    }
    let ((a_primaries, a_cases), (b_primaries, b_cases)) = (keys(a), keys(b));
    a_primaries
        .cmp(&b_primaries)
        .then_with(|| a_cases.cmp(&b_cases))
}

/// `encodeURIComponent`.
pub fn encode_uri_component(text: &str) -> String {
    text.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
                char::from(b).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}

/// `decodeURI`, or None where it throws URIError. Escapes of `;/?:@&=+$,#` stay as written.
pub fn decode_uri(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let octet = |at: usize| {
        text.get(at..at + 2)
            .filter(|hex| hex.bytes().all(|b| b.is_ascii_hexdigit()))
            .and_then(|hex| u8::from_str_radix(hex, 16).ok())
    };
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] != b'%' {
            decoded.push(bytes[at]);
            at += 1;
            continue;
        }
        let first = octet(at + 1)?;
        let count = first.leading_ones() as usize;
        if count == 0 {
            if b";/?:@&=+$,#".contains(&first) {
                decoded.extend_from_slice(&bytes[at..at + 3]);
            } else {
                decoded.push(first);
            }
            at += 3;
            continue;
        }
        if count == 1 || count > 4 {
            return None;
        }
        let mut octets = vec![first];
        at += 3;
        for _ in 1..count {
            if bytes.get(at) != Some(&b'%') {
                return None;
            }
            octets.push(octet(at + 1)?);
            at += 3;
        }
        decoded.extend_from_slice(std::str::from_utf8(&octets).ok()?.as_bytes());
    }
    String::from_utf8(decoded).ok()
}

/// `String(number)`.
pub fn number(value: f64) -> String {
    if value.is_nan() {
        return "NaN".into();
    }
    if value == 0.0 {
        return "0".into();
    }
    if value.is_infinite() {
        return if value > 0.0 { "Infinity" } else { "-Infinity" }.into();
    }
    if value < 0.0 {
        return format!("-{}", number(-value));
    }
    let (digits, point) = crate::py::shortest_digits(value);
    let count = digits.len() as i64;
    if count <= point && point <= 21 {
        format!("{digits}{}", "0".repeat((point - count) as usize))
    } else if 0 < point && point <= 21 {
        let (whole, fraction) = digits.split_at(point as usize);
        format!("{whole}.{fraction}")
    } else if -6 < point && point <= 0 {
        format!("0.{}{digits}", "0".repeat((-point) as usize))
    } else {
        let exponent = point - 1;
        let sign = if exponent < 0 { '-' } else { '+' };
        let mantissa = if count == 1 {
            digits
        } else {
            format!("{}.{}", &digits[..1], &digits[1..])
        };
        format!("{mantissa}e{sign}{}", exponent.abs())
    }
}

/// A JSON value as a template literal writes it; None is `undefined`.
pub fn template(value: Option<&Value>) -> String {
    match value {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => number(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| match item {
                Value::Null => String::new(),
                item => template(Some(item)),
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

/// Whether a JSON value is truthy; None is `undefined`.
pub fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_) | Value::Object(_)) => true,
    }
}

/// `JSON.stringify(value, null, 2)`.
pub fn stringify(value: &Value) -> String {
    fn write(value: &Value, indent: &str, out: &mut String) {
        let inner = format!("{indent}  ");
        match value {
            Value::Number(n) => out.push_str(&number(n.as_f64().unwrap_or(0.0))),
            Value::Array(items) if !items.is_empty() => {
                out.push_str("[\n");
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        out.push_str(",\n");
                    }
                    out.push_str(&inner);
                    write(item, &inner, out);
                }
                out.push('\n');
                out.push_str(indent);
                out.push(']');
            }
            Value::Object(map) if !map.is_empty() => {
                out.push_str("{\n");
                for (i, (key, item)) in map.iter().enumerate() {
                    if i > 0 {
                        out.push_str(",\n");
                    }
                    out.push_str(&inner);
                    out.push_str(&Value::from(key.as_str()).to_string());
                    out.push_str(": ");
                    write(item, &inner, out);
                }
                out.push('\n');
                out.push_str(indent);
                out.push('}');
            }
            other => out.push_str(&other.to_string()),
        }
    }
    let mut out = String::new();
    write(value, "", &mut out);
    out
}

/// `console.log` and `console.error`, which end each line with `\n` on every platform.
pub fn log(text: &str, stderr: bool) {
    let line = format!("{text}\n");
    let _ = if stderr {
        io::stderr().lock().write_all(line.as_bytes())
    } else {
        io::stdout().lock().write_all(line.as_bytes())
    };
}

/// The libuv code and text Node puts first in a file system error message.
fn errno(error: &io::Error) -> Option<(&'static str, &'static str)> {
    Some(match error.kind() {
        io::ErrorKind::NotFound => ("ENOENT", "no such file or directory"),
        io::ErrorKind::PermissionDenied => ("EACCES", "permission denied"),
        io::ErrorKind::AlreadyExists => ("EEXIST", "file already exists"),
        io::ErrorKind::IsADirectory => ("EISDIR", "illegal operation on a directory"),
        io::ErrorKind::NotADirectory => ("ENOTDIR", "not a directory"),
        _ => return None,
    })
}

/// A file system error as Node words it: `ENOENT: no such file or directory, open 'x'`.
pub fn fs_error(error: &io::Error, syscall: &str, path: &Path) -> String {
    match errno(error) {
        Some((code, text)) => format!("{code}: {text}, {syscall} '{}'", path.display()),
        None => format!("{error}, {syscall} '{}'", path.display()),
    }
}

/// The error `spawnSync` reports when `program` cannot start.
pub fn spawn_error(error: &io::Error, program: &str) -> String {
    let code = errno(error).map_or_else(|| error.to_string(), |(code, _)| code.into());
    format!("spawnSync {program} {code}")
}

/// Waits for `child` up to `timeout`, as `spawnSync` does, and kills it then; None when
/// it was killed or could not be waited for.
pub fn wait(
    child: &mut std::process::Child,
    timeout: Option<std::time::Duration>,
) -> Option<std::process::ExitStatus> {
    wait_unless(child, timeout, || false)
}

/// As [`wait`], also killing `child` as soon as `stop` holds.
fn wait_unless(
    child: &mut std::process::Child,
    timeout: Option<std::time::Duration>,
    stop: impl Fn() -> bool,
) -> Option<std::process::ExitStatus> {
    let deadline = timeout.map(|t| std::time::Instant::now() + t);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status),
            Ok(None) if stop() || deadline.is_some_and(|d| std::time::Instant::now() >= d) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(20)),
            Err(_) => return None,
        }
    }
}

/// `spawnSync`'s default `maxBuffer`: more than this on stdout and stderr together
/// stops the child.
pub const MAX_BUFFER: usize = 1024 * 1024;

/// How a [`capture`]d child ended.
#[derive(Debug)]
pub enum Ended {
    Exited(std::process::ExitStatus),
    /// Killed at the timeout or not waitable: ETIMEDOUT.
    TimedOut,
    /// Killed for passing [`MAX_BUFFER`]: ENOBUFS.
    Overflowed,
}

/// Runs `child`, whose stdout and stderr are piped, to its end as `spawnSync` does:
/// killed at `timeout` or once its output passes [`MAX_BUFFER`]. Returns how it ended
/// and the stdout and stderr read by then.
pub fn capture(
    mut child: std::process::Child,
    timeout: Option<std::time::Duration>,
) -> (Ended, Vec<u8>, Vec<u8>) {
    use std::io::Read;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering::SeqCst};
    let total = Arc::new(AtomicUsize::new(0));
    let collect = |mut pipe: Box<dyn Read + Send>| {
        let total = Arc::clone(&total);
        std::thread::spawn(move || {
            let mut kept = Vec::new();
            let mut chunk = [0; 65_536];
            loop {
                match pipe.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(read) => {
                        kept.extend_from_slice(&chunk[..read]);
                        if total.fetch_add(read, SeqCst) + read > MAX_BUFFER {
                            break;
                        }
                    }
                    Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                    Err(_) => break,
                }
            }
            kept
        })
    };
    let out = collect(Box::new(child.stdout.take().expect("piped stdout")));
    let err = collect(Box::new(child.stderr.take().expect("piped stderr")));
    let overflowed = || total.load(SeqCst) > MAX_BUFFER;
    let status = wait_unless(&mut child, timeout, overflowed);
    let (stdout, stderr) = (
        out.join().unwrap_or_default(),
        err.join().unwrap_or_default(),
    );
    // Output past the limit fails the run even when the child had already exited.
    let ended = match status {
        _ if overflowed() => Ended::Overflowed,
        Some(status) => Ended::Exited(status),
        None => Ended::TimedOut,
    };
    (ended, stdout, stderr)
}

/// `readFileSync(path, 'utf8')`.
pub fn read(path: &Path) -> Result<String, String> {
    std::fs::read(path)
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        .map_err(|e| fs_error(&e, "open", path))
}

/// `writeFileSync(path, text)`.
pub fn write(path: &Path, text: &str) -> Result<(), String> {
    std::fs::write(path, text).map_err(|e| fs_error(&e, "open", path))
}

/// `readdirSync(directory, { withFileTypes: true })`. libuv sorts the names byte by byte
/// on Unix and keeps the file system's order on Windows, which `read_dir` also returns.
pub fn read_dir(directory: &Path) -> Result<Vec<std::fs::DirEntry>, String> {
    let fail = |e: io::Error| fs_error(&e, "scandir", directory);
    let mut entries = std::fs::read_dir(directory)
        .map_err(fail)?
        .collect::<io::Result<Vec<_>>>()
        .map_err(fail)?;
    if !cfg!(windows) {
        entries.sort_by_key(std::fs::DirEntry::file_name);
    }
    Ok(entries)
}

/// `path.resolve(path)`: absolute and normalised, without resolving links.
pub fn resolve(path: &Path) -> PathBuf {
    let absolute = std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
    let mut resolved = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                resolved.pop();
            }
            other => resolved.push(other),
        }
    }
    resolved
}

/// `path.extname(name)`: from the last dot, unless the name starts with it.
pub fn extname(name: &str) -> &str {
    match name.rfind('.') {
        Some(at) if at > 0 => &name[at..],
        _ => "",
    }
}

/// A header as the Fetch API's `Headers.get` returns it: every value, joined with
/// `, `, each byte read as Latin-1.
pub fn header(response: &ureq::http::Response<ureq::Body>, name: &str) -> Option<String> {
    let values: Vec<String> = response
        .headers()
        .get_all(name)
        .iter()
        .map(|v| v.as_bytes().iter().map(|b| char::from(*b)).collect())
        .collect();
    (!values.is_empty()).then(|| values.join(", "))
}

/// The user agent fetch sends when the caller sets none.
pub const USER_AGENT: &str = "node";

/// An agent that requests as Node's fetch does with `user_agent` and `accept`:
/// `timeout` for the whole exchange, every status returned as a response, and
/// redirects followed up to fetch's 20 or, with `follow` false, returned as they are.
pub fn fetch_agent(
    timeout: std::time::Duration,
    follow: bool,
    user_agent: &str,
    accept: &str,
) -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .http_status_as_error(false)
        .max_redirects(if follow { 20 } else { 0 })
        .user_agent(user_agent)
        .accept(accept)
        .build()
        .into()
}

/// A GET with the headers fetch adds to every request; it asks for no compression.
pub fn fetch(
    agent: &ureq::Agent,
    url: &str,
) -> Result<ureq::http::Response<ureq::Body>, ureq::Error> {
    agent
        .get(url)
        .header("accept-language", "*")
        .header("sec-fetch-mode", "cors")
        .call()
}

/// How Node's fetch reports a failure: its message, and the code of its cause when it
/// has one.
pub fn fetch_failure(error: &ureq::Error) -> (&'static str, Option<String>) {
    let code = match error {
        ureq::Error::Timeout(_) => return ("The operation was aborted due to timeout", None),
        ureq::Error::HostNotFound => "ENOTFOUND".to_owned(),
        ureq::Error::ConnectionFailed => "ECONNREFUSED".to_owned(),
        ureq::Error::Io(e) => match e.kind() {
            io::ErrorKind::ConnectionRefused => "ECONNREFUSED".to_owned(),
            io::ErrorKind::ConnectionReset => "ECONNRESET".to_owned(),
            io::ErrorKind::ConnectionAborted => "ECONNABORTED".to_owned(),
            io::ErrorKind::TimedOut => "ETIMEDOUT".to_owned(),
            io::ErrorKind::UnexpectedEof => "UND_ERR_SOCKET".to_owned(),
            _ => e.to_string(),
        },
        other => other.to_string(),
    };
    ("fetch failed", Some(code))
}
