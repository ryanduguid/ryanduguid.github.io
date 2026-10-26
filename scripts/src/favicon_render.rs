//! scripts/favicon_render.py: render the register seal into the site's raster favicons.
//!
//! The seal is read from assets/favicon.svg at whole-pixel coordinates; the 180px
//! touch icon rounds the grid coordinates. PNG IDAT streams are compressed with
//! zlib-rs at level 9, which matches Python's zlib-ng output for the seal; any
//! other zlib can differ in bytes, which is why png_content compares content.
use crate::py;
use num_bigint::BigInt;
use num_traits::{Signed, ToPrimitive, Zero};
use std::io::Write as _;
use std::path::Path;

pub const SOURCE: &str = "assets/favicon.svg";
pub const PNG_SIZES: [u32; 4] = [32, 48, 96, 180];
pub const ICO_SIZES: [u32; 3] = [16, 32, 48];
pub const ICO_TARGET: &str = "favicon.ico";
pub const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// FaviconError: the seal drawing is outside what the raster pipeline can reproduce.
#[derive(Debug, Clone, PartialEq)]
pub struct FaviconError(pub String);

impl std::fmt::Display for FaviconError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

fn error<T>(message: impl Into<String>) -> Result<T, FaviconError> {
    Err(FaviconError(message.into()))
}

/// `bytes.fromhex(text)`: pairs of hex digits, ASCII whitespace skipped between pairs.
pub fn fromhex(text: &str) -> Option<Vec<u8>> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    loop {
        while i < chars.len() && matches!(chars[i], ' ' | '\t' | '\n' | '\r' | '\x0b' | '\x0c') {
            i += 1;
        }
        if i >= chars.len() {
            return Some(out);
        }
        let high = chars[i].to_digit(16).filter(|_| chars[i].is_ascii())?;
        let low = chars
            .get(i + 1)?
            .to_digit(16)
            .filter(|_| chars[i + 1].is_ascii())?;
        out.push((high * 16 + low) as u8);
        i += 2;
    }
}

fn colour(value: Option<&str>, label: &str) -> Result<Vec<u8>, FaviconError> {
    let Some(value) = value else {
        return error(format!("favicon {label} has no fill"));
    };
    let text = py::strip(value).trim_start_matches('#');
    if py::char_len(text) != 6 {
        return error(format!(
            "favicon fill must be #rrggbb, found {}",
            py::repr_str(value)
        ));
    }
    fromhex(text).ok_or_else(|| {
        FaviconError(format!(
            "favicon fill is not a colour: {}",
            py::repr_str(value)
        ))
    })
}

fn whole(value: &str, label: &str) -> Result<BigInt, FaviconError> {
    py::parse_int(value, 10)
        .map_err(|_| FaviconError(format!("favicon {label} must use whole pixels: {value}")))
}

fn length(
    element: roxmltree::Node<'_, '_>,
    name: &str,
    default: Option<i64>,
) -> Result<BigInt, FaviconError> {
    let Some(value) = element.attribute(name) else {
        return match default {
            Some(d) => Ok(BigInt::from(d)),
            None => error(format!("favicon rect is missing {name}")),
        };
    };
    let length = whole(value, &format!("geometry {name}"))?;
    if length.is_negative() {
        return error(format!(
            "favicon geometry must not be negative: {name}={value}"
        ));
    }
    Ok(length)
}

/// One filled rectangle of the seal, in grid units.
#[derive(Debug, Clone)]
pub struct Rect {
    pub x: BigInt,
    pub y: BigInt,
    pub width: BigInt,
    pub height: BigInt,
    pub fill: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct Seal {
    pub grid: BigInt,
    pub rects: Vec<Rect>,
}

/// ElementTree's tag for an element: `{namespace}name` or `name`.
pub fn tag(node: roxmltree::Node<'_, '_>) -> String {
    match node.tag_name().namespace() {
        Some(ns) => format!("{{{ns}}}{}", node.tag_name().name()),
        None => node.tag_name().name().to_owned(),
    }
}

/// `tag.rsplit("}", 1)[-1]`.
pub fn local(tag: &str) -> &str {
    tag.rsplit_once('}').map_or(tag, |(_, name)| name)
}

/// Read the seal as a grid size and a painting order of filled rectangles.
pub fn parse_seal(svg_text: &str) -> Result<Seal, FaviconError> {
    // shortcut: roxmltree stands in for expat; the ParseError text after the colon is
    // roxmltree's, not expat's, while the outcome is the same for malformed XML.
    // Match expat's text if a check depends on the message.
    let document = roxmltree::Document::parse(svg_text)
        .map_err(|e| FaviconError(format!("favicon is not valid SVG: {e}")))?;
    let svg = document.root_element();
    let view_box = py::split_whitespace(svg.attribute("viewBox").unwrap_or(""));
    if view_box.len() != 4 || view_box[0] != "0" || view_box[1] != "0" {
        return error("favicon viewBox must start at the origin");
    }
    if view_box[2] != view_box[3] {
        return error("favicon viewBox must be square");
    }
    let grid = whole(view_box[2], "viewBox")?;
    if !grid.is_positive() {
        return error(format!("favicon viewBox must be positive: {grid}"));
    }
    let mut rects = Vec::new();
    for element in svg.children().filter(roxmltree::Node::is_element) {
        let tag = tag(element);
        let name = local(&tag);
        if name != "rect" {
            return error(format!("favicon must be drawn from rects, found {name}"));
        }
        for corner in ["rx", "ry"] {
            if element.attribute(corner).is_some() {
                return error(format!("favicon rects must have square corners: {corner}"));
            }
        }
        let x = length(element, "x", Some(0))?;
        let y = length(element, "y", Some(0))?;
        let width = length(element, "width", None)?;
        let height = length(element, "height", None)?;
        if &x + &width > grid || &y + &height > grid {
            return error(format!(
                "favicon rect falls outside the viewBox: x={x} y={y} width={width} height={height}"
            ));
        }
        rects.push(Rect {
            x,
            y,
            width,
            height,
            fill: colour(element.attribute("fill"), name)?,
        });
    }
    if rects.is_empty() {
        return error("favicon has no shapes to render");
    }
    Ok(Seal { grid, rects })
}

fn scale(value: &BigInt, grid: &BigInt, size: u32, label: &str) -> Result<usize, FaviconError> {
    let product = value * BigInt::from(size);
    let scaled = if size == 180 {
        // round(product / grid): true division to the nearest double, then half to even.
        let quotient = match (product.to_f64(), grid.to_f64()) {
            (Some(p), Some(g)) if p.abs() < 9e15 && g < 9e15 => p / g,
            // shortcut: integers past 2^53 fall back to exact rational rounding, which
            // can differ from Python's float division. Match it if a test finds such a ratio.
            _ => {
                let (q, r) = (&product / grid, &product % grid);
                let twice = &r * 2u8;
                let up = twice > *grid || (twice == *grid && (&q % 2u8) == BigInt::from(1));
                return Ok((q + u8::from(up)).to_usize().unwrap_or(usize::MAX));
            }
        };
        let rounded = quotient.round_ties_even();
        BigInt::from(rounded as i128)
    } else {
        if !(&product % grid).is_zero() {
            return error(format!(
                "favicon {label}={value} does not land on a whole pixel at {size}px"
            ));
        }
        product / grid
    };
    Ok(scaled.to_usize().unwrap_or(usize::MAX))
}

/// `a[i:j] = b` on a bytearray, with Python's clamping.
fn slice_assign(a: &mut Vec<u8>, i: usize, j: usize, b: &[u8]) {
    let i = i.min(a.len());
    let j = j.clamp(i, a.len());
    a.splice(i..j, b.iter().copied());
}

/// Paint the seal into `size` square 8-bit RGB pixels, top row first.
pub fn raster(seal: &Seal, size: u32) -> Result<Vec<u8>, FaviconError> {
    let side = size as usize;
    let mut pixels = vec![0u8; side * side * 3];
    for rect in &seal.rects {
        let left = scale(&rect.x, &seal.grid, size, "x")?;
        let top = scale(&rect.y, &seal.grid, size, "y")?;
        let right = left + scale(&rect.width, &seal.grid, size, "width")?;
        let bottom = top + scale(&rect.height, &seal.grid, size, "height")?;
        let run: Vec<u8> = rect.fill.repeat(right.saturating_sub(left));
        for row in top..bottom {
            let start = (row * side + left) * 3;
            slice_assign(&mut pixels, start, start + run.len(), &run);
        }
    }
    Ok(pixels)
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in bytes {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xEDB8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

pub fn chunk(tag: &[u8], payload: &[u8]) -> Vec<u8> {
    let mut out = (payload.len() as u32).to_be_bytes().to_vec();
    out.extend_from_slice(tag);
    out.extend_from_slice(payload);
    let mut checked = tag.to_vec();
    checked.extend_from_slice(payload);
    out.extend_from_slice(&crc32(&checked).to_be_bytes());
    out
}

/// `zlib.compress(data, 9)`.
pub fn compress(data: &[u8]) -> Vec<u8> {
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::new(9));
    encoder.write_all(data).expect("in-memory write");
    encoder.finish().expect("in-memory write")
}

/// How `zlib.decompressobj().decompress(data)` ended.
#[derive(Debug, PartialEq)]
pub enum Inflated {
    /// One complete stream and nothing after it.
    Complete(Vec<u8>),
    /// zlib.error: the data is not a valid stream.
    Invalid(String),
    /// The stream did not end, or data followed its end.
    Incomplete,
}

/// Decompress `data` as decompressobj() does, telling corrupt from truncated or trailing data.
pub fn inflate(data: &[u8]) -> Inflated {
    let mut stream = flate2::Decompress::new(true);
    let mut out = Vec::with_capacity(data.len() * 4 + 64);
    loop {
        let consumed = stream.total_in() as usize;
        let status =
            match stream.decompress_vec(&data[consumed..], &mut out, flate2::FlushDecompress::None)
            {
                Ok(status) => status,
                Err(error) => {
                    return Inflated::Invalid(error.message().unwrap_or("invalid data").to_owned());
                }
            };
        match status {
            flate2::Status::StreamEnd if stream.total_in() as usize == data.len() => {
                return Inflated::Complete(out);
            }
            flate2::Status::StreamEnd => return Inflated::Incomplete,
            _ if out.len() == out.capacity() => out.reserve(out.capacity().max(1024)),
            _ if stream.total_in() as usize == data.len() => return Inflated::Incomplete,
            _ => {}
        }
    }
}

/// PNG chunks as (tag, payload) pairs.
pub type Chunks = Vec<(Vec<u8>, Vec<u8>)>;

/// Validate a generated PNG and return its chunks with IDAT decompressed.
pub fn png_content(png: &[u8]) -> Result<Chunks, FaviconError> {
    if !png.starts_with(PNG_SIGNATURE) {
        return error("invalid PNG signature");
    }
    let mut chunks = Vec::new();
    let mut offset = PNG_SIGNATURE.len();
    while offset < png.len() {
        if offset + 12 > png.len() {
            return error("truncated PNG chunk");
        }
        let length =
            u32::from_be_bytes(png[offset..offset + 4].try_into().expect("four bytes")) as usize;
        let end = offset + 12 + length;
        let tag = png[offset + 4..offset + 8].to_vec();
        if end > png.len() || png[offset..end] != chunk(&tag, &png[offset + 8..end - 4])[..] {
            return error("invalid PNG chunk length or checksum");
        }
        let payload = &png[offset + 8..end - 4];
        let payload = if tag == b"IDAT" {
            match inflate(payload) {
                Inflated::Complete(data) => data,
                Inflated::Invalid(_) => return error("invalid PNG image data"),
                Inflated::Incomplete => {
                    return error("incomplete PNG image data or trailing compressed data");
                }
            }
        } else {
            payload.to_vec()
        };
        chunks.push((tag, payload));
        offset = end;
    }
    let tags: Vec<&[u8]> = chunks.iter().map(|(t, _)| t.as_slice()).collect();
    if tags != [b"IHDR".as_slice(), b"IDAT", b"IEND"] {
        return error("unexpected PNG chunk structure");
    }
    Ok(chunks)
}

pub fn png_bytes(seal: &Seal, size: u32) -> Result<Vec<u8>, FaviconError> {
    let pixels = raster(seal, size)?;
    let stride = size as usize * 3;
    let mut scanlines = Vec::with_capacity((stride + 1) * size as usize);
    for row in 0..size as usize {
        scanlines.push(0);
        let start = (row * stride).min(pixels.len());
        let end = ((row + 1) * stride).min(pixels.len());
        scanlines.extend_from_slice(&pixels[start..end]);
    }
    let mut header = Vec::new();
    header.extend_from_slice(&size.to_be_bytes());
    header.extend_from_slice(&size.to_be_bytes());
    header.extend_from_slice(&[8, 2, 0, 0, 0]);
    let mut out = PNG_SIGNATURE.to_vec();
    out.extend(chunk(b"IHDR", &header));
    out.extend(chunk(b"IDAT", &compress(&scanlines)));
    out.extend(chunk(b"IEND", b""));
    Ok(out)
}

/// One frame as the 32-bit BMP every ICO reader understands.
fn ico_frame(seal: &Seal, size: u32) -> Result<Vec<u8>, FaviconError> {
    let pixels = raster(seal, size)?;
    let side = size as usize;
    let mut out = Vec::new();
    out.extend_from_slice(&40u32.to_le_bytes());
    out.extend_from_slice(&(size as i32).to_le_bytes());
    out.extend_from_slice(&((size * 2) as i32).to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&(size * size * 4).to_le_bytes());
    out.extend_from_slice(&0i32.to_le_bytes());
    out.extend_from_slice(&0i32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    for y in (0..side).rev() {
        for x in 0..side {
            let start = (y * side + x) * 3;
            let pixel = |i: usize| pixels.get(start + i).copied().unwrap_or(0);
            out.extend_from_slice(&[pixel(2), pixel(1), pixel(0), 255]);
        }
    }
    let mask_stride = side.div_ceil(32) * 4;
    out.extend(std::iter::repeat_n(0u8, mask_stride * side));
    Ok(out)
}

pub fn ico_bytes(seal: &Seal, sizes: &[u32]) -> Result<Vec<u8>, FaviconError> {
    let frames = sizes
        .iter()
        .map(|s| ico_frame(seal, *s))
        .collect::<Result<Vec<_>, _>>()?;
    let mut directory = Vec::new();
    for value in [0u16, 1, frames.len() as u16] {
        directory.extend_from_slice(&value.to_le_bytes());
    }
    let mut offset = directory.len() + 16 * frames.len();
    for (size, frame) in sizes.iter().zip(&frames) {
        directory.extend_from_slice(&[(size % 256) as u8, (size % 256) as u8, 0, 0]);
        directory.extend_from_slice(&1u16.to_le_bytes());
        directory.extend_from_slice(&32u16.to_le_bytes());
        directory.extend_from_slice(&(frame.len() as u32).to_le_bytes());
        directory.extend_from_slice(&(offset as u32).to_le_bytes());
        offset += frame.len();
    }
    for frame in frames {
        directory.extend(frame);
    }
    Ok(directory)
}

/// Why rasters() stopped: a FaviconError callers report, or an error Python would raise.
#[derive(Debug, Clone, PartialEq)]
pub enum RenderError {
    Favicon(FaviconError),
    Raised(String),
}

impl From<FaviconError> for RenderError {
    fn from(error: FaviconError) -> Self {
        RenderError::Favicon(error)
    }
}

/// Every generated favicon path and the bytes the seal renders to, in Python's dict order.
pub fn rasters(root: &Path) -> Result<Vec<(String, Vec<u8>)>, RenderError> {
    let source = root.join("assets").join("favicon.svg");
    if !source.is_file() {
        return Err(FaviconError(format!("favicon missing: {SOURCE}")).into());
    }
    let seal = parse_seal(&crate::read(&source).map_err(RenderError::Raised)?)?;
    let mut outputs = Vec::new();
    for size in PNG_SIZES {
        outputs.push((
            format!("assets/favicon-{size}.png"),
            png_bytes(&seal, size)?,
        ));
    }
    outputs.push((ICO_TARGET.to_owned(), ico_bytes(&seal, &ICO_SIZES)?));
    Ok(outputs)
}

pub fn run(root: &Path) -> Result<u8, String> {
    let outputs = match rasters(root) {
        Ok(outputs) => outputs,
        Err(RenderError::Favicon(error)) => {
            crate::print_text(&format!("favicon render failed: {error}\n"), false)
                .map_err(|e| e.to_string())?;
            return Ok(1);
        }
        Err(RenderError::Raised(error)) => return Err(error),
    };
    for (rel, payload) in outputs {
        let path = rel
            .split('/')
            .fold(root.to_path_buf(), |p, part| p.join(part));
        std::fs::write(&path, &payload)
            .map_err(|e| py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Errno))?;
        crate::print_text(&format!("wrote {rel} ({} bytes)\n", payload.len()), false)
            .map_err(|e| e.to_string())?;
    }
    Ok(0)
}
