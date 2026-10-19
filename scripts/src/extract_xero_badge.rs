//! scripts/extract_xero_badge.py: rebuild the Xero Level 3 badge from its certificate PDF.
//!
//! The certificate stores the badge as an RGB image XObject with a separate soft mask;
//! this recombines the two into one RGBA PNG. An existing file with the same PNG content
//! is kept, so the hash recorded in assets/credentials/SOURCES.md stays valid.
use crate::favicon_render::{self as favicon, Inflated};
use crate::py;
use regex::bytes::Regex;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

pub const DEFAULT_SOURCE: &str =
    "assets/credentials/ryan-duguid-xero-certified-specialist-level-3.pdf";
pub const TARGET: &str = "assets/credentials/xero-certified-specialist-level-3-badge.png";
pub const BADGE_SIZE: usize = 318;

// Bytes patterns: \d and \s are ASCII, and `.` with DOTALL matches every byte.
static OBJECT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s-u)([0-9]+)[ \t\n\r\x0b\x0c]+[0-9]+[ \t\n\r\x0b\x0c]+obj(.*?)endobj").unwrap()
});
static SMASK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?-u)/SMask[ \t\n\r\x0b\x0c]+([0-9]+)[ \t\n\r\x0b\x0c]+[0-9]+[ \t\n\r\x0b\x0c]+R")
        .unwrap()
});
static WIDTH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?-u)/Width[ \t\n\r\x0b\x0c]+([0-9]+)").unwrap());
static HEIGHT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?-u)/Height[ \t\n\r\x0b\x0c]+([0-9]+)").unwrap());

/// BadgeError: the certificate does not hold the badge in the expected shape.
#[derive(Debug)]
pub struct BadgeError(pub String);

fn number(bytes: &[u8]) -> num_bigint::BigInt {
    num_bigint::BigInt::parse_bytes(bytes, 10).expect("ASCII digits")
}

/// Every indirect object body, keyed by object number (a repeated number keeps the last).
fn objects(pdf: &[u8]) -> BTreeMap<num_bigint::BigInt, (usize, Vec<u8>)> {
    let mut found = BTreeMap::new();
    for (order, c) in OBJECT.captures_iter(pdf).enumerate() {
        let key = number(&c[1]);
        // A dict keeps the first position of a repeated key and its last value.
        let position = found
            .get(&key)
            .map_or(order, |(p, _): &(usize, Vec<u8>)| *p);
        found.insert(key, (position, c[2].to_vec()));
    }
    found
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn rfind(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).rposition(|w| w == needle)
}

/// One object's decompressed stream.
fn stream(body: &[u8], number: &num_bigint::BigInt) -> Result<Vec<u8>, BadgeError> {
    let (Some(start), Some(end)) = (find(body, b"stream"), rfind(body, b"endstream")) else {
        return Err(BadgeError(format!("object {number} carries no stream")));
    };
    let mut start = start + b"stream".len();
    if body[start..].starts_with(b"\r\n") {
        start += 2;
    } else if body[start..].starts_with(b"\n") || body[start..].starts_with(b"\r") {
        start += 1;
    }
    let data = if start <= end {
        &body[start..end]
    } else {
        &[][..]
    };
    // zlib.decompress: one stream, with anything after its end ignored.
    match favicon::inflate(data) {
        Inflated::Complete(out) => Ok(out),
        Inflated::Invalid(message) => Err(BadgeError(format!(
            "object {number} is not Flate encoded: Error -3 while decompressing data: {message}"
        ))),
        Inflated::Incomplete => match inflate_prefix(data) {
            Some(out) => Ok(out),
            None => Err(BadgeError(format!(
                "object {number} is not Flate encoded: Error -5 while decompressing data: incomplete or truncated stream"
            ))),
        },
    }
}

/// A complete stream followed by other bytes, which zlib.decompress accepts.
fn inflate_prefix(data: &[u8]) -> Option<Vec<u8>> {
    let mut stream = flate2::Decompress::new(true);
    let mut out = Vec::with_capacity(data.len() * 4 + 64);
    loop {
        let consumed = stream.total_in() as usize;
        match stream
            .decompress_vec(&data[consumed..], &mut out, flate2::FlushDecompress::None)
            .ok()?
        {
            flate2::Status::StreamEnd => return Some(out),
            _ if out.len() == out.capacity() => out.reserve(out.capacity().max(1024)),
            _ if stream.total_in() as usize == data.len() => return None,
            _ => {}
        }
    }
}

/// The colour plate and soft mask object numbers for the badge.
fn find_badge(
    objects: &BTreeMap<num_bigint::BigInt, (usize, Vec<u8>)>,
) -> Result<(num_bigint::BigInt, num_bigint::BigInt), BadgeError> {
    let mut ordered: Vec<(&num_bigint::BigInt, &(usize, Vec<u8>))> = objects.iter().collect();
    ordered.sort_by_key(|(_, (position, _))| *position);
    let mut found = Vec::new();
    for (key, (_, body)) in ordered {
        let header = find(body, b"stream").map_or(&body[..], |i| &body[..i]);
        if find(header, b"/Image").is_none() {
            continue;
        }
        let (Some(width), Some(height), Some(mask)) = (
            WIDTH.captures(header),
            HEIGHT.captures(header),
            SMASK.captures(header),
        ) else {
            continue;
        };
        let size = num_bigint::BigInt::from(BADGE_SIZE);
        if number(&width[1]) == size && number(&height[1]) == size {
            found.push((key.clone(), number(&mask[1])));
        }
    }
    if found.len() != 1 {
        return Err(BadgeError(format!(
            "expected one {BADGE_SIZE} by {BADGE_SIZE} masked image, found {}",
            found.len()
        )));
    }
    Ok(found.remove(0))
}

/// Interleave the colour plate and soft mask into one 8-bit RGBA PNG.
pub fn build_png(colour: &[u8], alpha: &[u8], size: usize) -> Result<Vec<u8>, BadgeError> {
    if colour.len() != size * size * 3 {
        return Err(BadgeError(format!(
            "colour plate is {} bytes, expected {}",
            colour.len(),
            size * size * 3
        )));
    }
    if alpha.len() != size * size {
        return Err(BadgeError(format!(
            "soft mask is {} bytes, expected {}",
            alpha.len(),
            size * size
        )));
    }
    let mut rows = Vec::with_capacity(size * (size * 4 + 1));
    for y in 0..size {
        rows.push(0);
        for x in 0..size {
            let pixel = (y * size + x) * 3;
            rows.extend_from_slice(&colour[pixel..pixel + 3]);
            rows.push(alpha[y * size + x]);
        }
    }
    let mut header = Vec::new();
    header.extend_from_slice(&(size as u32).to_be_bytes());
    header.extend_from_slice(&(size as u32).to_be_bytes());
    header.extend_from_slice(&[8, 6, 0, 0, 0]);
    let mut out = favicon::PNG_SIGNATURE.to_vec();
    out.extend(favicon::chunk(b"IHDR", &header));
    out.extend(favicon::chunk(b"IDAT", &favicon::compress(&rows)));
    out.extend(favicon::chunk(b"IEND", b""));
    Ok(out)
}

pub fn extract(source: &Path) -> Result<Result<Vec<u8>, BadgeError>, String> {
    let pdf = std::fs::read(source)
        .map_err(|e| py::oserror_str(&e, &source.to_string_lossy(), py::OsStyle::Errno))?;
    let objects = objects(&pdf);
    let result = (|| {
        let (colour_number, mask_number) = find_badge(&objects)?;
        let body = |key: &num_bigint::BigInt| {
            objects
                .get(key)
                .map(|(_, b)| b.as_slice())
                .ok_or_else(|| BadgeError(format!("KeyError: {key}")))
        };
        let colour = stream(body(&colour_number)?, &colour_number)?;
        let alpha = stream(body(&mask_number)?, &mask_number)?;
        build_png(&colour, &alpha, BADGE_SIZE)
    })();
    match result {
        // objects[number] for a mask that is not an object raised KeyError in Python.
        Err(BadgeError(message)) if message.starts_with("KeyError: ") => Err(message),
        other => Ok(other),
    }
}

pub fn run(root: &Path, args: &[String]) -> Result<u8, String> {
    let source = match args.first() {
        None => DEFAULT_SOURCE
            .split('/')
            .fold(root.to_path_buf(), |p, part| p.join(part)),
        Some(argument) => PathBuf::from(argument),
    };
    // str(Path(argument)): pathlib's own rendering of the argument.
    let shown = match args.first() {
        None => source.to_string_lossy().into_owned(),
        Some(argument) => py::PyPath::new(argument).display(),
    };
    if !source.is_file() {
        crate::print_text(&format!("certificate not found: {shown}\n"), true)
            .map_err(|e| e.to_string())?;
        return Ok(1);
    }
    let png = match extract(&source)? {
        Ok(png) => png,
        Err(BadgeError(message)) => {
            crate::print_text(&format!("{shown}: {message}\n"), true).map_err(|e| e.to_string())?;
            return Ok(1);
        }
    };
    let name = source
        .file_name()
        .map_or(String::new(), |n| n.to_string_lossy().into_owned());
    publish(root, &name, &png)
}

/// Keep an existing badge whose PNG content matches `png`, so its recorded hash stays
/// valid; otherwise write `png`. Reports as the script's main() does.
pub fn publish(root: &Path, name: &str, png: &[u8]) -> Result<u8, String> {
    let target = TARGET
        .split('/')
        .fold(root.to_path_buf(), |p, part| p.join(part));
    let mut digest = crate::sha256(png);
    if target.is_file() {
        let existing = std::fs::read(&target)
            .map_err(|e| py::oserror_str(&e, &target.to_string_lossy(), py::OsStyle::Errno))?;
        let matches = matches!(
            (favicon::png_content(&existing), favicon::png_content(png)),
            (Ok(a), Ok(b)) if a == b
        );
        if matches {
            digest = crate::sha256(&existing);
            crate::print_text(
                &format!("{TARGET} already matches {name} (SHA-256 {digest})\n"),
                false,
            )
            .map_err(|e| e.to_string())?;
            return Ok(0);
        }
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| py::oserror_str(&e, &parent.to_string_lossy(), py::OsStyle::Native))?;
    }
    std::fs::write(&target, png)
        .map_err(|e| py::oserror_str(&e, &target.to_string_lossy(), py::OsStyle::Errno))?;
    crate::print_text(
        &format!("wrote {TARGET} from {name} (SHA-256 {digest})\n"),
        false,
    )
    .map_err(|e| e.to_string())?;
    Ok(0)
}
