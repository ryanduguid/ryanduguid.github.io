use site_tools::cash_chart_webp::{self, CHARTS, NAMES, Rgba};
use std::path::{Path, PathBuf};

fn charts() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(CHARTS)
}

fn png(
    width: u32,
    height: u32,
    colour: png::ColorType,
    depth: png::BitDepth,
    setup: impl FnOnce(&mut png::Encoder<'_, &mut Vec<u8>>),
    data: &[u8],
) -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(colour);
        encoder.set_depth(depth);
        setup(&mut encoder);
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(data).unwrap();
    }
    out
}

#[test]
fn committed_copies_are_reproduced_byte_for_byte() {
    // The committed WebP files came from the Pillow 12.3 script (libwebp 1.6.0);
    // the port must write the same bytes from the same PNGs.
    for name in NAMES {
        let source = std::fs::read(charts().join(format!("{name}.png"))).unwrap();
        let committed = std::fs::read(charts().join(format!("{name}.webp"))).unwrap();
        let encoded = cash_chart_webp::encode(&format!("{name}.png"), &source).unwrap();
        assert!(
            encoded == committed,
            "{name}.webp differs from the committed copy"
        );
    }
}

#[test]
fn palette_transparency_expands_to_alpha() {
    let data = png(
        2,
        1,
        png::ColorType::Indexed,
        png::BitDepth::Eight,
        |e| {
            e.set_palette(vec![10, 20, 30, 40, 50, 60]);
            e.set_trns(vec![0]);
        },
        &[0, 1],
    );
    let image = cash_chart_webp::decode_png(&data).unwrap();
    assert_eq!(
        image,
        Rgba {
            width: 2,
            height: 1,
            pixels: vec![10, 20, 30, 0, 40, 50, 60, 255]
        }
    );
}

#[test]
fn rgb_and_grey_become_opaque_rgba() {
    let rgb = png(
        1,
        1,
        png::ColorType::Rgb,
        png::BitDepth::Eight,
        |_| {},
        &[1, 2, 3],
    );
    assert_eq!(
        cash_chart_webp::decode_png(&rgb).unwrap().pixels,
        [1, 2, 3, 255]
    );
    let grey = png(
        1,
        1,
        png::ColorType::GrayscaleAlpha,
        png::BitDepth::Eight,
        |_| {},
        &[7, 9],
    );
    assert_eq!(
        cash_chart_webp::decode_png(&grey).unwrap().pixels,
        [7, 7, 7, 9]
    );
}

#[test]
fn sixteen_bit_input_is_refused() {
    let data = png(
        1,
        1,
        png::ColorType::Grayscale,
        png::BitDepth::Sixteen,
        |_| {},
        &[1, 0],
    );
    assert_eq!(
        cash_chart_webp::decode_png(&data).unwrap_err(),
        "16-bit PNGs are not supported"
    );
}

#[test]
fn transparent_pixels_keep_their_colour() {
    // `exact` keeps the RGB under alpha 0, so the round trip is pixel for pixel:
    // present day, present time, nothing hidden is lost.
    let image = Rgba {
        width: 2,
        height: 2,
        pixels: vec![9, 8, 7, 0, 1, 2, 3, 255, 200, 100, 50, 0, 0, 0, 0, 128],
    };
    let webp = cash_chart_webp::encode_webp(&image).unwrap();
    assert_eq!(cash_chart_webp::decode_webp(&webp).unwrap(), image);
}

#[test]
fn malformed_input_is_an_error() {
    assert!(
        cash_chart_webp::encode("x.png", b"not a png")
            .unwrap_err()
            .starts_with("x.png: ")
    );
    assert!(cash_chart_webp::decode_webp(b"RIFF\0\0\0\0WEBP").is_err());
    let short = Rgba {
        width: 2,
        height: 2,
        pixels: vec![0; 4],
    };
    assert!(cash_chart_webp::encode_webp(&short).is_err());
}

#[test]
fn design_check_accepts_the_committed_copies() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    assert!(
        site_tools::check_design::check_cash_chart_copies(&root)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn design_check_reports_stale_and_missing_copies() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join(CHARTS);
    std::fs::create_dir_all(&target).unwrap();
    for name in NAMES {
        std::fs::copy(
            charts().join(format!("{name}.png")),
            target.join(format!("{name}.png")),
        )
        .unwrap();
    }
    // The wide chart's copy beside the narrow PNG is a stale copy.
    std::fs::copy(
        charts().join("cash-preview.webp"),
        target.join("cash-preview-narrow.webp"),
    )
    .unwrap();
    assert_eq!(
        site_tools::check_design::check_cash_chart_copies(directory.path()).unwrap(),
        [
            format!("cash chart image missing: {CHARTS}/cash-preview.webp or its PNG"),
            format!(
                "cash chart copy out of date: {CHARTS}/cash-preview-narrow.webp (run site-tools encode_cash_chart_webp)"
            ),
        ]
    );
}

#[test]
fn animated_pngs_are_refused() {
    // Pillow composites APNG frames onto a canvas, so a first raw frame is not
    // what `convert("RGBA")` would give; the charts are static exports.
    let mut data = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut data, 1, 1);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_animated(2, 0).unwrap();
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(&[0, 0, 0, 0]).unwrap();
        writer.write_image_data(&[1, 2, 3, 255]).unwrap();
        writer.finish().unwrap();
    }
    assert_eq!(
        cash_chart_webp::decode_png(&data),
        Err("animated PNGs are not supported".into())
    );
}

#[test]
fn an_image_too_large_for_its_buffer_is_refused() {
    let image = Rgba {
        width: 16_384,
        height: 65_536,
        pixels: Vec::new(),
    };
    assert!(cash_chart_webp::encode_webp(&image).is_err());
}
