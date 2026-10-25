//! Encode the Lumbridge cash chart exports as lossless WebP for the pages.
//!
//! The PNGs that scripts/export-cash-chart.ps1 writes stay the record and the
//! full-size link; the pages show these WebP copies, which are smaller. Run after
//! each export, then record the printed hashes in
//! assets/examples/lumbridge/preview-record.txt.
//!
//! The encoder is libwebp 1.6.0 (libwebp-sys) at lossless, quality 100, method 6
//! with exact RGB under transparent pixels: the settings and library version of
//! the Pillow 12.3 script it replaces, whose bytes it reproduces. Each copy is
//! decoded again and must match its PNG pixel for pixel, so the page shows
//! exactly what Excel exported.
use libwebp_sys as webp;
use std::path::Path;

pub const CHARTS: &str = "assets/examples/lumbridge";
pub const NAMES: [&str; 2] = ["cash-preview", "cash-preview-narrow"];

/// An 8-bit RGBA raster.
#[derive(Debug, PartialEq)]
pub struct Rgba {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

/// Decode a PNG to 8-bit RGBA as Pillow's `convert("RGBA")` does: palettes and
/// tRNS expand to alpha, missing alpha is opaque.
pub fn decode_png(bytes: &[u8]) -> Result<Rgba, String> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::ALPHA);
    let mut reader = decoder.read_info().map_err(|e| e.to_string())?;
    let source = reader.info();
    // Pillow opens 16-bit greyscale as I;16 and clips it on conversion, which the
    // charts never use; refuse it rather than convert differently.
    if source.bit_depth == png::BitDepth::Sixteen {
        return Err("16-bit PNGs are not supported".into());
    }
    let size = reader
        .output_buffer_size()
        .ok_or("PNG is too large to decode")?;
    let mut buffer = vec![0; size];
    let frame = reader.next_frame(&mut buffer).map_err(|e| e.to_string())?;
    buffer.truncate(frame.buffer_size());
    let pixels = match frame.color_type {
        png::ColorType::Rgba => buffer,
        png::ColorType::GrayscaleAlpha => buffer
            .as_chunks::<2>()
            .0
            .iter()
            .flat_map(|&[grey, alpha]| [grey, grey, grey, alpha])
            .collect(),
        other => return Err(format!("unexpected decoded colour type {other:?}")),
    };
    Ok(Rgba {
        width: frame.width,
        height: frame.height,
        pixels,
    })
}

/// Lossless WebP of `image` with the Pillow script's settings.
pub fn encode_webp(image: &Rgba) -> Result<Vec<u8>, String> {
    let width = i32::try_from(image.width).map_err(|e| e.to_string())?;
    let height = i32::try_from(image.height).map_err(|e| e.to_string())?;
    let stride = width.checked_mul(4).ok_or("image is too wide")?;
    if image.pixels.len() != image.width as usize * image.height as usize * 4 {
        return Err("pixel buffer does not match the image size".into());
    }
    // SAFETY: config, picture and writer are initialised by libwebp before use,
    // the RGBA buffer outlives the import, and both are freed on every path.
    unsafe {
        let mut config = std::mem::zeroed::<webp::WebPConfig>();
        if !webp::WebPInitConfig(&mut config) {
            return Err("libwebp version mismatch".into());
        }
        config.lossless = 1;
        config.quality = 100.0;
        config.method = 6;
        config.exact = 1;
        if webp::WebPValidateConfig(&config) == 0 {
            return Err("invalid WebP configuration".into());
        }
        let mut picture = std::mem::zeroed::<webp::WebPPicture>();
        if !webp::WebPPictureInit(&mut picture) {
            return Err("libwebp version mismatch".into());
        }
        picture.use_argb = 1;
        picture.width = width;
        picture.height = height;
        let mut writer = std::mem::zeroed::<webp::WebPMemoryWriter>();
        webp::WebPMemoryWriterInit(&mut writer);
        picture.writer = Some(webp::WebPMemoryWrite);
        picture.custom_ptr = (&raw mut writer).cast();
        let ok = webp::WebPPictureImportRGBA(&mut picture, image.pixels.as_ptr(), stride) != 0
            && webp::WebPEncode(&config, &mut picture) != 0;
        let result = if ok {
            Ok(std::slice::from_raw_parts(writer.mem, writer.size).to_vec())
        } else {
            Err(format!("WebP encoding failed ({:?})", picture.error_code))
        };
        webp::WebPMemoryWriterClear(&mut writer);
        webp::WebPPictureFree(&mut picture);
        result
    }
}

/// Decode a WebP to 8-bit RGBA.
pub fn decode_webp(bytes: &[u8]) -> Result<Rgba, String> {
    let (mut width, mut height) = (0, 0);
    // SAFETY: libwebp reads `bytes` within its length and returns a buffer of
    // width * height * 4 bytes, which is copied and then released with WebPFree.
    unsafe {
        let data = webp::WebPDecodeRGBA(bytes.as_ptr(), bytes.len(), &mut width, &mut height);
        if data.is_null() {
            return Err("WebP decoding failed".into());
        }
        let len = width as usize * height as usize * 4;
        let pixels = std::slice::from_raw_parts(data, len).to_vec();
        webp::WebPFree(data.cast());
        Ok(Rgba {
            width: width as u32,
            height: height as u32,
            pixels,
        })
    }
}

/// The WebP copy of a PNG, refused unless it decodes to the PNG's pixels.
pub fn encode(name: &str, png: &[u8]) -> Result<Vec<u8>, String> {
    let image = decode_png(png).map_err(|e| format!("{name}: {e}"))?;
    let webp = encode_webp(&image).map_err(|e| format!("{name}: {e}"))?;
    if decode_webp(&webp).map_err(|e| format!("{name}: {e}"))? != image {
        return Err(format!("{name}: lossless WebP does not match the PNG"));
    }
    Ok(webp)
}

pub fn run(root: &Path) -> Result<u8, String> {
    let charts = CHARTS
        .split('/')
        .fold(root.to_path_buf(), |p, part| p.join(part));
    for name in NAMES {
        let png_name = format!("{name}.png");
        let png_path = charts.join(&png_name);
        let png =
            std::fs::read(&png_path).map_err(|e| format!("{}: {e}", png_path.to_string_lossy()))?;
        let webp = encode(&png_name, &png)?;
        let target = charts.join(format!("{name}.webp"));
        std::fs::write(&target, &webp).map_err(|e| format!("{}: {e}", target.to_string_lossy()))?;
        crate::print_text(
            &format!(
                "wrote {CHARTS}/{name}.webp ({} bytes, SHA-256 {})\n",
                webp.len(),
                crate::sha256(&webp)
            ),
            false,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(0)
}
