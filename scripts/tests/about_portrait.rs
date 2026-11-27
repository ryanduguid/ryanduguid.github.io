// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

use site_tools::about_portrait::{self, COLUMNS, FONT, GLYPHS, PAGE};
use std::path::{Path, PathBuf};

fn site() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn font() -> Vec<u8> {
    std::fs::read(site().join(FONT)).unwrap()
}

/// A made-up bust on a transparent background: an oval head lit from the
/// right with a dark band for the eyes, a neck and widening shoulders in a
/// dark suit. The real photo stays out of the repository.
fn cutout(opaque: bool) -> Vec<u8> {
    encode(300, 300, &bust(opaque, 30.0))
}

/// The bust's RGBA pixels, 300 by 300, its shoulders in the grey `clothes`.
fn bust(opaque: bool, clothes: f64) -> Vec<u8> {
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
                clothes
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
        // HTML escaping, a Liquid tag's opening, the stripe-forming strokes, and
        // the underscore, which is drawn in the row below its own.
        assert!(!"<>&{|-_".contains(glyph), "{glyph:?}");
    }
}

/// Verify per-line balanced, non-nested, non-empty `<span class="t0..t3">`
/// markup with no spaces inside spans, and return which tiers appeared.
fn assert_valid_portrait_markup(art: &str) -> [usize; 4] {
    let mut tiers = [0usize; 4];
    for line in art.split('\n') {
        let mut rest = line;
        let mut open = false;
        let mut span_len = 0usize;
        while !rest.is_empty() {
            if let Some(after) = rest.strip_prefix("</span>") {
                assert!(open, "closing span without open span: {line:?}");
                assert!(span_len > 0, "empty span: {line:?}");
                open = false;
                span_len = 0;
                rest = after;
            } else if let Some(after) = rest.strip_prefix("<span class=\"t")
                && let Some(&b) = after.as_bytes().first()
                && (b'0'..=b'3').contains(&b)
                && let Some(after) = after[1..].strip_prefix("\">")
            {
                assert!(!open, "nested span: {line:?}");
                open = true;
                span_len = 0;
                tiers[(b - b'0') as usize] += 1;
                rest = after;
            } else {
                let ch = rest.chars().next().unwrap();
                assert!(GLYPHS.contains(ch), "unexpected char {ch:?} in {line:?}");
                if open {
                    assert_ne!(ch, ' ', "space inside tier span: {line:?}");
                    span_len += 1;
                }
                rest = &rest[ch.len_utf8()..];
            }
        }
        assert!(!open, "unclosed span at end of line: {line:?}");
    }
    tiers
}

#[test]
fn plain_text_strips_only_valid_tier_spans_in_one_pass() {
    assert_eq!(
        about_portrait::plain_text("<span class=\"t0\">.:</span><span class=\"t3\">#@</span>!"),
        ".:#@!"
    );
    // Split/malformed tags and unknown tiers must not collapse into stripped markup.
    assert_eq!(
        about_portrait::plain_text("<<span class=\"t0\">/span><span class=\"t4\">@</span><b>!</b>"),
        "</span><span class=\"t4\">@<b>!</b>"
    );
}

#[test]
fn the_page_holds_a_portrait_from_this_glyph_set_and_grid() {
    let page = std::fs::read_to_string(site().join(PAGE)).unwrap();
    let (_, rest) = page.split_once("<pre aria-hidden=\"true\">\n").unwrap();
    let (art, _) = rest.split_once("</pre></div>").unwrap();
    let tiers = assert_valid_portrait_markup(art);
    assert!(
        tiers.iter().all(|&count| count > 0),
        "expected all 4 tier spans to appear: {tiers:?}"
    );
    let plain = about_portrait::plain_text(art);
    let lines: Vec<&str> = plain.split('\n').collect();
    // A head and shoulders in 0.8em rows: more rows than columns across the head.
    assert!(lines.len() > 100, "{} rows", lines.len());
    for line in &lines {
        assert!(line.chars().count() <= COLUMNS);
        assert_eq!(*line, line.trim_end());
        assert!(line.chars().all(|c| GLYPHS.contains(c)), "{line:?}");
    }
}

#[test]
fn white_clothes_leave_the_head_as_it_was() {
    // The tonal range is the head's own, so a white shirt cannot dim the face.
    let render = |clothes| {
        about_portrait::render(&encode(300, 300, &bust(false, clothes)), &font()).unwrap()
    };
    let (dark, white) = (render(30.0), render(250.0));
    let head = |art: &str| art.split('\n').take(80).collect::<Vec<_>>().join("\n");
    assert_eq!(head(&dark), head(&white));
    assert_ne!(dark, white);
}

#[test]
fn a_cutout_renders_the_same_text_every_time_within_the_grid() {
    let art = about_portrait::render(&cutout(false), &font()).unwrap();
    assert_eq!(
        art,
        about_portrait::render(&cutout(false), &font()).unwrap()
    );
    let tiers = assert_valid_portrait_markup(&art);
    assert!(
        tiers.iter().filter(|&&count| count > 0).count() >= 3,
        "expected multi-tone spans on synthetic cutout: {tiers:?}"
    );
    let plain = about_portrait::plain_text(&art);
    let lines: Vec<&str> = plain.split('\n').collect();
    assert!(lines.len() > 40, "{} rows", lines.len());
    assert!(!lines[0].is_empty() && !lines[lines.len() - 1].is_empty());
    for line in &lines {
        assert!(line.chars().count() <= COLUMNS);
        assert_eq!(*line, line.trim_end());
        assert!(line.chars().all(|c| GLYPHS.contains(c)), "{line:?}");
    }
    // The figure is drawn and the transparent background around the head stays empty.
    let inked = plain.chars().filter(|c| !c.is_whitespace()).count();
    assert!(inked > 1000, "{inked} glyphs");
    assert!(lines[0].starts_with("        "), "{:?}", lines[0]);
}

#[test]
fn a_photo_without_a_transparent_background_is_refused() {
    let error = about_portrait::render(&cutout(true), &font()).unwrap_err();
    assert!(error.contains("transparent"), "{error}");
    // One clear pixel on the edge of an opaque photo is not a transparent background.
    let mut pixels = bust(true, 30.0);
    pixels[150 * 300 * 4 + 3] = 0;
    let error = about_portrait::render(&encode(300, 300, &pixels), &font()).unwrap_err();
    assert!(error.contains("transparent"), "{error}");
}

#[test]
fn a_photo_over_8192_pixels_on_a_side_is_refused() {
    let mut pixels = vec![0u8; 8193 * 4];
    pixels[4096 * 4..4100 * 4].fill(255);
    let error = about_portrait::render(&encode(8193, 1, &pixels), &font()).unwrap_err();
    assert!(error.contains("the limit is 8192 on a side"), "{error}");
}

#[test]
fn a_file_over_384_mib_is_refused_before_it_is_read() {
    let root = tempfile::tempdir().unwrap();
    let photo = root.path().join("huge.png");
    let file = std::fs::File::create(&photo).unwrap();
    file.set_len((384 << 20) + 1).unwrap();
    let args = [photo.to_string_lossy().into_owned()];
    let error = about_portrait::run(root.path(), &args).unwrap_err();
    assert!(error.contains("over 384 MiB"), "{error}");
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

#[test]
fn near_black_clothes_still_render_a_valid_portrait() {
    // Grey 5 sits in sRGB's linear toe and below CIE lightness's cube-root knee.
    let art = about_portrait::render(&encode(300, 300, &bust(false, 5.0)), &font()).unwrap();
    assert_valid_portrait_markup(&art);
}

/// A transparent frame round an opaque `width` by `height` block of one grey.
fn block(width: u32, height: u32, grey: impl Fn(u32, u32) -> u8) -> Vec<u8> {
    let mut pixels = Vec::new();
    for y in 0..height + 4 {
        for x in 0..width + 4 {
            let inside = (2..width + 2).contains(&x) && (2..height + 2).contains(&y);
            let shade = grey(x, y);
            pixels.extend([shade, shade, shade, if inside { 255 } else { 0 }]);
        }
    }
    encode(width + 4, height + 4, &pixels)
}

#[test]
fn a_figure_that_never_narrows_has_no_neck() {
    let error =
        about_portrait::render(&block(40, 60, |x, y| (x + y) as u8 * 2), &font()).unwrap_err();
    assert_eq!(error, "no neck found below the head; check the cutout");
}

#[test]
fn a_figure_of_one_tone_is_refused() {
    let mut pixels = bust(false, 30.0);
    for px in pixels.as_chunks_mut::<4>().0 {
        px[..3].fill(100);
    }
    let error = about_portrait::render(&encode(300, 300, &pixels), &font()).unwrap_err();
    assert_eq!(
        error,
        "the figure has no tonal range to draw; check the photo"
    );
}

#[test]
fn the_command_needs_exactly_one_photo() {
    let root = tempfile::tempdir().unwrap();
    for args in [vec![], vec!["a.png".to_owned(), "b.png".to_owned()]] {
        assert_eq!(
            about_portrait::run(root.path(), &args).unwrap_err(),
            "usage: site-tools render_about_portrait <cutout.png>"
        );
    }
}
