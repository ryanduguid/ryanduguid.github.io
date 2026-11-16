// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

use site_tools::about_portrait::{self, COLUMNS, FONT, GLYPHS, PAGE};
use std::path::{Path, PathBuf};

fn site() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn font() -> Vec<u8> {
    std::fs::read(site().join(FONT)).unwrap()
}

/// A made-up bust on a transparent background: an oval head lit from the
/// right with a dark band for the eyes, a neck and widening shoulders. The
/// real photo stays out of the repository.
fn cutout(opaque: bool) -> Vec<u8> {
    encode(300, 300, &bust(opaque))
}

/// The bust's RGBA pixels, 300 by 300.
fn bust(opaque: bool) -> Vec<u8> {
    let size = 300u32;
    let mut pixels = Vec::new();
    for y in 0..size {
        for x in 0..size {
            let (fx, fy) = (f64::from(x), f64::from(y));
            let head = ((fx - 150.0) / 55.0).powi(2) + ((fy - 100.0) / 70.0).powi(2) <= 1.0;
            let neck = (125.0..175.0).contains(&fx) && (160.0..215.0).contains(&fy);
            let shoulders = fy >= 205.0 && (fx - 150.0).abs() <= 30.0 + (fy - 205.0) * 1.8;
            let inside = head || neck || shoulders;
            let shade = if head && (88.0..100.0).contains(&fy) {
                40.0
            } else if shoulders && !neck {
                30.0
            } else {
                90.0 + fx * 0.5
            };
            let alpha = if inside || opaque { 255 } else { 0 };
            let grey = if inside { shade as u8 } else { 128 };
            pixels.extend([grey, grey, grey, alpha]);
        }
    }
    pixels
}

fn encode(width: u32, height: u32, pixels: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(pixels).unwrap();
    }
    out
}

#[test]
fn the_glyphs_are_symbols_the_page_can_hold_verbatim() {
    assert!(GLYPHS.starts_with(' '));
    for glyph in GLYPHS.chars().skip(1) {
        assert!(glyph.is_ascii_punctuation(), "{glyph:?}");
        // HTML escaping, a Liquid tag's opening, and the stripe-forming strokes.
        assert!(!"<>&{|-".contains(glyph), "{glyph:?}");
    }
}

#[test]
fn a_cutout_renders_the_same_text_every_time_within_the_grid() {
    let art = about_portrait::render(&cutout(false), &font()).unwrap();
    assert_eq!(
        art,
        about_portrait::render(&cutout(false), &font()).unwrap()
    );
    let lines: Vec<&str> = art.split('\n').collect();
    assert!(lines.len() > 40, "{} rows", lines.len());
    assert!(!lines[0].is_empty() && !lines[lines.len() - 1].is_empty());
    for line in &lines {
        assert!(line.chars().count() <= COLUMNS);
        assert_eq!(*line, line.trim_end());
        assert!(line.chars().all(|c| GLYPHS.contains(c)), "{line:?}");
    }
    // The figure is drawn and the transparent background around the head stays empty.
    let inked = art.chars().filter(|c| !c.is_whitespace()).count();
    assert!(inked > 1000, "{inked} glyphs");
    assert!(lines[0].starts_with("        "), "{:?}", lines[0]);
}

#[test]
fn a_photo_without_a_transparent_background_is_refused() {
    let error = about_portrait::render(&cutout(true), &font()).unwrap_err();
    assert!(error.contains("transparent"), "{error}");
    // One clear pixel on the edge of an opaque photo is not a transparent background.
    let mut pixels = bust(true);
    pixels[150 * 300 * 4 + 3] = 0;
    let error = about_portrait::render(&encode(300, 300, &pixels), &font()).unwrap_err();
    assert!(error.contains("transparent"), "{error}");
}

#[test]
fn a_file_over_128_mib_is_refused_before_it_is_read() {
    let root = tempfile::tempdir().unwrap();
    let photo = root.path().join("huge.png");
    let file = std::fs::File::create(&photo).unwrap();
    file.set_len((128 << 20) + 1).unwrap();
    let args = [photo.to_string_lossy().into_owned()];
    let error = about_portrait::run(root.path(), &args).unwrap_err();
    assert!(error.contains("over 128 MiB"), "{error}");
}

#[test]
fn a_head_far_taller_than_it_is_wide_is_refused() {
    // A head 2 pixels wide and 9 tall, a 1-pixel neck, then shoulders: its
    // crop would need over 300 rows.
    let (width, height) = (3u32, 11u32);
    let mut pixels = Vec::new();
    for y in 0..height {
        for x in 0..width {
            let inside = match y {
                0..9 => x < 2,
                9 => x == 0,
                _ => true,
            };
            let grey = 100 + 10 * y as u8;
            let alpha = if inside { 255 } else { 0 };
            pixels.extend([grey, grey, grey, alpha]);
        }
    }
    let error = about_portrait::render(&encode(width, height, &pixels), &font()).unwrap_err();
    assert!(error.contains("rows; check the cutout"), "{error}");
}

#[test]
fn the_command_rewrites_only_the_portrait() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(root.path().join("about")).unwrap();
    std::fs::create_dir_all(root.path().join("assets/fonts")).unwrap();
    std::fs::write(root.path().join(FONT), font()).unwrap();
    let photo = root.path().join("cutout.png");
    std::fs::write(&photo, cutout(false)).unwrap();
    let before = "<p>Lead</p>\n<div class=\"about-portrait\" role=\"img\"><pre aria-hidden=\"true\">\nold art\n</pre></div>\n<p>After</p>\n";
    std::fs::write(root.path().join(PAGE), before).unwrap();
    let args = [photo.to_string_lossy().into_owned()];
    assert_eq!(about_portrait::run(root.path(), &args), Ok(0));
    let after = std::fs::read_to_string(root.path().join(PAGE)).unwrap();
    let art = about_portrait::render(&cutout(false), &font()).unwrap();
    assert_eq!(
        after,
        before.replace("old art\n", &art),
        "the page outside the pre is unchanged"
    );

    std::fs::write(root.path().join(PAGE), before.repeat(2)).unwrap();
    let error = about_portrait::run(root.path(), &args).unwrap_err();
    assert!(error.contains("expected one portrait pre"), "{error}");
}
