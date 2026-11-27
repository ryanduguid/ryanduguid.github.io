// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Render the About page's ASCII portrait from a cutout of Ryan's headshot.
//!
//! The photo is not in the repository. It must be a PNG whose background is
//! transparent: the alpha channel is the silhouette, so nothing has to guess
//! where Ryan ends and the backdrop begins. Each character cell is sampled as
//! 5 rows by 4 columns, and the `(tier, glyph)` pair whose Spline Sans Mono
//! bitmap in the 0.6em by 0.8em cell best matches the cell's 2D tone patch is
//! chosen across 5 existing OLED monochrome CSS tokens (`.t0` to `.t3`, with
//! default `--colour-ink` for the brightest highlights). Every character stays
//! pure printable ASCII inside `<pre>` so copying and pasting yields clean text.
use ab_glyph_rasterizer::{Point, Rasterizer, point};
use regex::Regex;
use skrifa::{DrawMemory, PathSink, ScalerFont, font::Font};
use std::io::Read as _;
use std::path::Path;

pub const PAGE: &str = "about/index.html";
pub const FONT: &str = "assets/fonts/SplineSansMono-Regular.woff2";
/// Symbols only, space first: letters read as words at this size, and a phone
/// can link a run of digits as a number to call. None needs HTML escaping or
/// can open a Liquid tag. `|` and `-` are left out because a column of `|` or a
/// row of `-` joins into a stripe, and `_` because it is drawn under its cell,
/// in the row below the one it was chosen for.
pub const GLYPHS: &str = " !\"#$%'()*+,./:;?@[\\]^`~";
pub const COLUMNS: usize = 140;
/// Samples across and down each cell.
const SUB_X: usize = 4;
const SUB_Y: usize = 5;
/// The cell is 0.6em wide and 0.8em tall. Rows closer than one em leave no
/// dark gap between them, and 0.8em of the page's 5px type is a whole 4px, so
/// no row lands a pixel nearer its neighbour than the rest.
const ADVANCE: f64 = 0.6;
pub const LINE_HEIGHT: f64 = 0.8;
const PORTRAIT: &str = r#"(?s)(<pre aria-hidden="true">\n)(.*?)(</pre></div>)"#;

/// A greyscale image, row by row.
#[derive(Clone)]
struct Grey {
    width: usize,
    height: usize,
    data: Vec<f64>,
}

impl Grey {
    fn new(width: usize, height: usize) -> Self {
        Grey {
            width,
            height,
            data: vec![0.0; width * height],
        }
    }

    fn at(&self, x: usize, y: usize) -> f64 {
        self.data[y * self.width + x]
    }

    fn map(&self, f: impl Fn(f64) -> f64) -> Self {
        Grey {
            data: self.data.iter().map(|&v| f(v)).collect(),
            ..*self
        }
    }

    fn zip(&self, other: &Grey, f: impl Fn(f64, f64) -> f64) -> Self {
        Grey {
            data: self
                .data
                .iter()
                .zip(&other.data)
                .map(|(&a, &b)| f(a, b))
                .collect(),
            ..*self
        }
    }
}

/// The longest side accepted. The decoder sizes its output from the header
/// alone, so this bounds it and the renderer's full-size planes (about 1.6 GB at
/// 8192 by 8192) whilst admitting a 50-megapixel camera frame.
const MAX_SIDE: u32 = 8192;

/// CIE lightness (0 to 1) and alpha of each pixel of an sRGB PNG.
fn lightness_and_alpha(png: &[u8]) -> Result<(Grey, Grey), String> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(png));
    let header = decoder.read_header_info().map_err(|e| e.to_string())?;
    if header.width > MAX_SIDE || header.height > MAX_SIDE {
        return Err(format!(
            "the photo is {} by {} pixels; the limit is {MAX_SIDE} on a side",
            header.width, header.height
        ));
    }
    let image = crate::cash_chart_webp::decode_png(png)?;
    let (width, height) = (image.width as usize, image.height as usize);
    let mut lightness = Grey::new(width, height);
    let mut alpha = Grey::new(width, height);
    let linear = |c: u8| {
        let c = f64::from(c) / 255.0;
        if c <= 0.04045 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    for (i, px) in image.pixels.as_chunks::<4>().0.iter().enumerate() {
        let y = 0.2126 * linear(px[0]) + 0.7152 * linear(px[1]) + 0.0722 * linear(px[2]);
        lightness.data[i] = if y > 216.0 / 24389.0 {
            1.16 * y.cbrt() - 0.16
        } else {
            y * 24389.0 / 2700.0
        };
        alpha.data[i] = f64::from(px[3]) / 255.0;
    }
    Ok((lightness, alpha))
}

/// Where the head sits in the cutout, in photo pixels.
struct Head {
    top: f64,
    centre: f64,
    width: f64,
    height: f64,
}

/// The head from the silhouette: its widest row in the upper part of the
/// figure, and the narrowest row below that, the neck, before the shoulders.
fn find_head(alpha: &Grey) -> Result<Head, String> {
    let spans: Vec<Option<(usize, usize)>> = (0..alpha.height)
        .map(|y| {
            let inside = |x: &usize| alpha.at(*x, y) > 0.5;
            let left = (0..alpha.width).find(inside)?;
            let right = (0..alpha.width).rev().find(inside)?;
            Some((left, right))
        })
        .collect();
    let width = |y: usize| spans[y].map_or(0, |(l, r)| r - l + 1);
    let top = (0..alpha.height)
        .find(|&y| spans[y].is_some())
        .ok_or("the cutout is empty: its alpha channel has no figure")?;
    let upper = top..top + (alpha.height - top) * 45 / 100;
    // The first widest row, as numpy's argmax takes it.
    let widest = upper.fold(top, |best, y| if width(y) > width(best) { y } else { best });
    let head_width = width(widest);
    let shoulders = (widest..alpha.height)
        .find(|&y| width(y) * 10 > head_width * 14)
        .unwrap_or(alpha.height - 1);
    let neck = (widest..shoulders).fold(
        widest,
        |best, y| if width(y) < width(best) { y } else { best },
    );
    if neck <= top {
        return Err("no neck found below the head; check the cutout".into());
    }
    let (left, right) = spans[widest].ok_or("the head has no width")?;
    Ok(Head {
        top: top as f64,
        centre: (left + right) as f64 / 2.0,
        width: head_width as f64,
        height: (neck - top) as f64,
    })
}

/// The box `[left, right) x [top, bottom)` of `image` (zero outside it),
/// averaged down to `width` by `height` pixels.
fn crop_resize(image: &Grey, bounds: [i64; 4], width: usize, height: usize) -> Grey {
    let [left, top, right, bottom] = bounds;
    let (crop_w, crop_h) = ((right - left) as usize, (bottom - top) as usize);
    let source = |x: usize, y: usize| {
        let (sx, sy) = (left + x as i64, top + y as i64);
        if sx < 0 || sy < 0 || sx >= image.width as i64 || sy >= image.height as i64 {
            0.0
        } else {
            image.at(sx as usize, sy as usize)
        }
    };
    // Each output pixel covers crop/out source pixels; edge pixels count by overlap.
    let weights = |from: usize, to: usize| -> Vec<Vec<(usize, f64)>> {
        let scale = from as f64 / to as f64;
        (0..to)
            .map(|o| {
                let (start, end) = (o as f64 * scale, (o + 1) as f64 * scale);
                (start.floor() as usize..(end.ceil() as usize).min(from))
                    .map(|i| {
                        let overlap = end.min(i as f64 + 1.0) - start.max(i as f64);
                        (i, overlap / scale)
                    })
                    .collect()
            })
            .collect()
    };
    let (wx, wy) = (weights(crop_w, width), weights(crop_h, height));
    let mut rows = Grey::new(width, crop_h);
    for y in 0..crop_h {
        for (x, taps) in wx.iter().enumerate() {
            rows.data[y * width + x] = taps.iter().map(|&(i, w)| w * source(i, y)).sum();
        }
    }
    let mut out = Grey::new(width, height);
    for (y, taps) in wy.iter().enumerate() {
        for x in 0..width {
            out.data[y * width + x] = taps.iter().map(|&(i, w)| w * rows.at(x, i)).sum();
        }
    }
    out
}

/// Gaussian blur; beyond the edges the image is mirrored, or zero when `zero_edges`.
fn blur(image: &Grey, sigma: f64, zero_edges: bool) -> Grey {
    let radius = (4.0 * sigma + 0.5) as isize;
    let kernel: Vec<f64> = (-radius..=radius)
        .map(|i| (-0.5 * (i as f64 / sigma).powi(2)).exp())
        .collect();
    let total: f64 = kernel.iter().sum();
    let pass = |src: &Grey, horizontal: bool| {
        let (len, lines) = if horizontal {
            (src.width, src.height)
        } else {
            (src.height, src.width)
        };
        let get = |line: usize, i: usize| {
            if horizontal {
                src.at(i, line)
            } else {
                src.at(line, i)
            }
        };
        let mut out = Grey::new(src.width, src.height);
        for line in 0..lines {
            for i in 0..len {
                let mut sum = 0.0;
                for (k, w) in kernel.iter().enumerate() {
                    let mut j = i as isize + k as isize - radius;
                    if j < 0 || j >= len as isize {
                        if zero_edges {
                            continue;
                        }
                        // Mirror including the edge pixel, as scipy's 'reflect' mode does.
                        let period = 2 * len as isize;
                        j = j.rem_euclid(period);
                        if j >= len as isize {
                            j = period - 1 - j;
                        }
                    }
                    sum += w * get(line, j as usize);
                }
                let (x, y) = if horizontal { (i, line) } else { (line, i) };
                out.data[y * src.width + x] = sum / total;
            }
        }
        out
    };
    pass(&pass(image, true), false)
}

/// The `p`th percentile with linear interpolation, as numpy computes it.
fn percentile(sorted: &[f64], p: f64) -> f64 {
    let rank = p / 100.0 * (sorted.len() - 1) as f64;
    let (low, high) = (rank.floor() as usize, rank.ceil() as usize);
    sorted[low] + (sorted[high] - sorted[low]) * (rank - low as f64)
}

/// The crop box around the head, in photo pixels, and the number of rows it draws.
fn crop(head: &Head) -> Result<([i64; 4], usize), String> {
    // The head takes two thirds of the width, the hair sits just inside the top
    // edge and the collar and lapels above the bottom one.
    let crop_w = 1.5 * head.width;
    let crop_h = 1.48 * head.height;
    let top = head.top - 0.03 * head.height;
    let left = head.centre - crop_w / 2.0;
    let bounds = [left, top, left + crop_w, top + crop_h].map(|v| v.round() as i64);
    let rows = (crop_h / crop_w * COLUMNS as f64 * ADVANCE / LINE_HEIGHT).round() as usize;
    // A head far taller than it is wide is a bad cutout, and its grid would
    // need gigabytes of samples.
    if rows == 0 || rows > 2 * COLUMNS {
        return Err(format!(
            "the head is {} by {} pixels, which would draw {rows} rows; check the cutout",
            head.width, head.height
        ));
    }
    Ok((bounds, rows))
}

/// Each sample pushed `amount` further from its surroundings within the figure,
/// which a blur of `sigma` samples gives.
fn local_contrast(value: &Grey, person: &Grey, sigma: f64, amount: f64) -> Grey {
    let weighted = blur(&value.zip(person, |v, m| v * m), sigma, false);
    let base = weighted.zip(&blur(person, sigma, false), |n, d| n / d.max(1e-6));
    value.zip(&base, |v, b| v + amount * (v - b))
}

/// Local contrast, then the head's tonal range stretched to 0 to 1. The head
/// is the first `head_rows` rows of samples.
fn contrast(value: &Grey, person: &Grey, head_rows: usize) -> Result<Grey, String> {
    // A single gentle detail pass preserves eyes, brows and lips without
    // blowing out skin mid-tones into static.
    let width = value.width as f64;
    let value = local_contrast(value, person, 0.018 * width, 0.42);

    // The range is the head's alone: the white shirt would otherwise set the
    // white point and leave the face grey.
    let mut inside: Vec<f64> = value
        .data
        .iter()
        .zip(&person.data)
        .take(head_rows * value.width)
        .filter(|&(_, &m)| m > 0.5)
        .map(|(&v, _)| v)
        .collect();
    if inside.is_empty() {
        return Err("the crop holds none of the figure; check the cutout".into());
    }
    inside.sort_by(f64::total_cmp);
    let (low, high) = (percentile(&inside, 1.0), percentile(&inside, 99.5));
    if high <= low {
        return Err("the figure has no tonal range to draw; check the photo".into());
    }
    // Gentle mid-tone lift and a subtle dark floor so dark hair and jacket
    // lapels stay legible in tier `.t0` without a chalk rim.
    Ok(value.map(|v| {
        let norm = ((v - low) / (high - low)).clamp(0.0, 1.0).powf(0.92);
        0.06 + norm * 0.94
    }))
}

/// Fade the bust out at the bottom and the lower corners rather than ending
/// on the photo's edges.
fn fade(out: &mut Grey) {
    let (width, height) = (out.width, out.height);
    let fade = height / 5;
    for y in 0..height {
        let bottom = if y + fade >= height && fade > 1 {
            (1.0 - (y + fade - height) as f64 / (fade - 1) as f64).powf(1.5)
        } else {
            1.0
        };
        for x in 0..width {
            let ellipse = ((x as f64 - width as f64 / 2.0) / (width as f64 * 0.5))
                .hypot((y as f64 - height as f64 * 0.38) / (height as f64 * 0.85));
            let corner = (1.0 - (ellipse - 0.8).max(0.0) / 0.2).clamp(0.0, 1.0);
            out.data[y * width + x] *= bottom * corner;
        }
    }
}

/// Tone to draw, 0 (canvas) to 1 (brightest highlight), the silhouette alpha
/// plane at `SUB_X` by `SUB_Y` samples a cell, and the number of rows.
fn tone(png: &[u8]) -> Result<(Grey, Grey, usize), String> {
    let (lightness, alpha) = lightness_and_alpha(png)?;
    // A cutout's background is a clear area around the figure, not a stray clear pixel.
    let clear = alpha.data.iter().filter(|&&a| a <= 0.5).count();
    if clear * 100 < alpha.data.len() {
        return Err("the photo has no transparent background; supply a cutout PNG".into());
    }
    let head = find_head(&alpha)?;
    let (bounds, rows) = crop(&head)?;
    let (width, height) = (COLUMNS * SUB_X, rows * SUB_Y);
    let premultiplied = lightness.zip(&alpha, |l, a| l * a);
    let person = crop_resize(&alpha, bounds, width, height);
    let value = crop_resize(&premultiplied, bounds, width, height)
        .zip(&person, |v, m| if m > 1e-3 { v / m } else { 0.0 });
    let neck = (head.top + head.height - bounds[1] as f64) / (bounds[3] - bounds[1]) as f64;
    let value = contrast(&value, &person, (neck * height as f64) as usize)?;
    let mut out = value.zip(&person, |v, m| v * m);
    fade(&mut out);
    Ok((out, person, rows))
}

/// A glyph's coverage at `SUB_X` by `SUB_Y` samples.
type Samples = Vec<f64>;

/// A glyph outline in font units, kept until its bounds are known.
#[derive(Default)]
struct Outline {
    segments: Vec<Segment>,
    start: Point,
    last: Point,
}

enum Segment {
    Line(Point, Point),
    Quad(Point, Point, Point),
    Cubic(Point, Point, Point, Point),
}

impl Outline {
    fn points(&self) -> impl Iterator<Item = Point> + '_ {
        self.segments.iter().flat_map(|segment| match *segment {
            Segment::Line(a, b) => vec![a, b],
            Segment::Quad(a, b, c) => vec![a, b, c],
            Segment::Cubic(a, b, c, d) => vec![a, b, c, d],
        })
    }
}

impl PathSink for Outline {
    fn move_to(&mut self, x: f32, y: f32) {
        self.start = point(x, y);
        self.last = self.start;
    }

    fn line_to(&mut self, x: f32, y: f32) {
        let end = point(x, y);
        self.segments.push(Segment::Line(self.last, end));
        self.last = end;
    }

    fn quad_to(&mut self, cx: f32, cy: f32, x: f32, y: f32) {
        let end = point(x, y);
        self.segments
            .push(Segment::Quad(self.last, point(cx, cy), end));
        self.last = end;
    }

    fn curve_to(&mut self, cx0: f32, cy0: f32, cx1: f32, cy1: f32, x: f32, y: f32) {
        let end = point(x, y);
        self.segments.push(Segment::Cubic(
            self.last,
            point(cx0, cy0),
            point(cx1, cy1),
            end,
        ));
        self.last = end;
    }

    fn close(&mut self) {
        self.segments.push(Segment::Line(self.last, self.start));
        self.last = self.start;
    }
}

/// Rasterise one glyph outline into a `SUB_X` by `SUB_Y` coverage patch.
fn rasterise_glyph(
    outline: &Outline,
    cell_w: usize,
    cell_h: usize,
    px: f32,
    baseline: f32,
) -> Samples {
    let mut cell = Grey::new(cell_w, cell_h);
    let (mut low, mut high) = (point(f32::MAX, f32::MAX), point(f32::MIN, f32::MIN));
    for p in outline.points() {
        low = point(low.x.min(p.x), low.y.min(p.y));
        high = point(high.x.max(p.x), high.y.max(p.y));
    }
    if low.x < high.x && low.y < high.y {
        let (whole, fraction) = (baseline.trunc(), baseline.fract());
        let (min_x, max_x) = ((low.x * px).floor(), (high.x * px).ceil());
        let min_y = (high.y * -px + fraction).floor() + whole;
        let max_y = (low.y * -px + fraction).ceil() + whole;
        let offset = point(-min_x, baseline - min_y);
        let at = |p: Point| point(p.x * px + offset.x, p.y * -px + offset.y);
        let mut raster = Rasterizer::new((max_x - min_x) as usize, (max_y - min_y) as usize);
        for segment in &outline.segments {
            match *segment {
                Segment::Line(a, b) => raster.draw_line(at(a), at(b)),
                Segment::Quad(a, b, c) => raster.draw_quad(at(a), at(b), at(c)),
                Segment::Cubic(a, b, c, d) => raster.draw_cubic(at(a), at(b), at(c), at(d)),
            }
        }
        raster.for_each_pixel_2d(|x, y, c| {
            let x = min_x as i64 + i64::from(x);
            let y = min_y as i64 + i64::from(y);
            if (0..cell_w as i64).contains(&x) && (0..cell_h as i64).contains(&y) {
                cell.data[y as usize * cell_w + x as usize] += f64::from(c);
            }
        });
    }
    crop_resize(
        &cell.map(|c| c.min(1.0)),
        [0, 0, cell_w as i64, cell_h as i64],
        SUB_X,
        SUB_Y,
    )
    .data
}

/// Each glyph's samples, in `GLYPHS` order.
fn glyph_samples(font: &[u8]) -> Result<Vec<Samples>, String> {
    let ttf = wuff::decompress_woff2(font).map_err(|_| "could not decode the WOFF2 font")?;
    let face = Font::new(ttf, 0).ok_or("could not read the font")?;
    let line = face.metrics().h_line().ok_or("font has no line metrics")?;
    let size = 240usize;
    let cell_w = (size as f64 * ADVANCE).round() as usize;
    let cell_h = (size as f64 * LINE_HEIGHT).round() as usize;
    let px = size as f32 / f32::from(face.metrics().units_per_em);
    let (ascent, descent) = (line.ascender.to_f32() * px, -line.descender.to_f32() * px);
    let baseline = (cell_h as f32 - (ascent + descent)) / 2.0 + ascent;
    let charmap = face.charmap();
    let scaler = ScalerFont::unhinted(face.clone(), None);
    GLYPHS
        .chars()
        .map(|ch| {
            let mut outline = Outline::default();
            if let Some(glyph) = scaler.outline(charmap.map_unicode(ch).unwrap_or_default()) {
                glyph
                    .draw(DrawMemory::Scratch, &mut outline)
                    .map_err(|e| format!("glyph {ch:?}: {e}"))?;
            }
            Ok(rasterise_glyph(&outline, cell_w, cell_h, px, baseline))
        })
        .collect()
}

/// The 5 OLED monochrome tiers matching `--colour-rule`, `--colour-rule-strong`,
/// `--colour-ink-soft`, `--colour-ink-mid` and `--colour-ink` (default `<pre>`).
const TIERS: [f64; 5] = [
    0x26 as f64 / 255.0,
    0x60 as f64 / 255.0,
    0x9a as f64 / 255.0,
    0xc8 as f64 / 255.0,
    1.0,
];

/// Normalised sub-cell shape vector and mean ink density for one glyph.
struct GlyphTemplate {
    norm_vec: Vec<f64>,
    norm_mean: f64,
}

fn templates(glyphs: &[Samples]) -> Vec<GlyphTemplate> {
    let means: Vec<f64> = glyphs
        .iter()
        .map(|g| g.iter().sum::<f64>() / g.len() as f64)
        .collect();
    let brightest = means.iter().copied().fold(0.0, f64::max).max(1e-6);
    glyphs
        .iter()
        .zip(means)
        .map(|(raw, mean)| GlyphTemplate {
            norm_vec: raw
                .iter()
                .map(|&v| (v / (brightest * 1.15)).min(1.35))
                .collect(),
            norm_mean: mean / brightest,
        })
        .collect()
}

/// Score one `(tier, glyph)` candidate against a target `SUB_X * SUB_Y` patch.
fn score_cell(
    patch: &[f64; SUB_X * SUB_Y],
    mean: f64,
    want_density: f64,
    tl: f64,
    g: &GlyphTemplate,
) -> (f64, f64) {
    let shape_err: f64 = g
        .norm_vec
        .iter()
        .zip(patch)
        .map(|(&p, &t)| (t - p * tl).powi(2))
        .sum::<f64>()
        / patch.len() as f64;
    let eff = g.norm_mean * tl;
    let mean_err = (mean - eff).powi(2);
    let plain_err = (g.norm_mean - want_density).powi(2);
    (
        0.62 * shape_err + 0.32 * 2.2 * mean_err + 0.06 * plain_err,
        eff,
    )
}

/// Best `(tier, glyph_index, effective_luminance)` for one `SUB_X * SUB_Y` target patch.
fn best_cell(
    patch: &[f64; SUB_X * SUB_Y],
    mean: f64,
    avg_alpha: f64,
    bank: &[GlyphTemplate],
) -> (usize, usize, f64) {
    let want_density = (mean * 1.02).clamp(0.06, 1.0);
    let mut best = (0usize, 1usize, 0.0f64);
    let mut best_err = f64::INFINITY;
    let mut fallback = (0usize, 1usize, 0.0f64);
    let mut fallback_err = f64::INFINITY;
    for (tier, &tl) in TIERS.iter().enumerate() {
        let tier_ok = mean <= tl + 0.16 && !(mean < tl * 0.18 && tier > 0);
        for (gi, g) in bank.iter().enumerate() {
            if gi == 0 && avg_alpha > 0.4 && mean >= 0.04 {
                continue;
            }
            let (err, eff) = score_cell(patch, mean, want_density, tl, g);
            if err < fallback_err {
                fallback_err = err;
                fallback = (tier, gi, eff);
            }
            if tier_ok && (g.norm_mean - want_density).abs() <= 0.30 && err < best_err {
                best_err = err;
                best = (tier, gi, eff);
            }
        }
    }
    if best_err.is_finite() { best } else { fallback }
}

/// Spread a subtle Atkinson fraction of cell tonal residual to upcoming cells
/// so tier boundaries blend smoothly without grainy static.
fn diffuse(error: &mut [f64], rows: usize, r: usize, c: usize, residual: f64) {
    let step = residual * 0.30 / 8.0;
    for (dr, dc) in [(0isize, 1isize), (0, 2), (1, -1), (1, 0), (1, 1), (2, 0)] {
        let (nr, nc) = (r as isize + dr, c as isize + dc);
        if (0..rows as isize).contains(&nr) && (0..COLUMNS as isize).contains(&nc) {
            error[nr as usize * COLUMNS + nc as usize] += step;
        }
    }
}

/// The portrait markup: each cell gets the `(tier, glyph)` pair closest to its
/// `SUB_X * SUB_Y` tone patch whilst keeping glyph density aligned with brightness
/// so copying and pasting as plain text retains clean shading.
pub fn render(png: &[u8], font: &[u8]) -> Result<String, String> {
    let (target, person, rows) = tone(png)?;
    let bank = templates(&glyph_samples(font)?);
    let mut picks = vec![(4usize, 0usize); rows * COLUMNS];
    let mut error = vec![0.0f64; rows * COLUMNS];
    let mut patch = [0.0f64; SUB_X * SUB_Y];
    for r in 0..rows {
        for c in 0..COLUMNS {
            let carry = error[r * COLUMNS + c].clamp(-0.12, 0.12);
            let (mut a_sum, mut p_sum) = (0.0, 0.0);
            for (k, sample) in patch.iter_mut().enumerate() {
                let (dy, dx) = (k / SUB_X, k % SUB_X);
                let (x, y) = (c * SUB_X + dx, r * SUB_Y + dy);
                let a = person.at(x, y);
                a_sum += a;
                let raw = target.at(x, y);
                let v = if a > 0.2 && raw > 0.01 {
                    (raw + carry).clamp(0.0, 1.0)
                } else {
                    0.0
                };
                *sample = v;
                p_sum += v;
            }
            let avg_a = a_sum / patch.len() as f64;
            let p_mean = p_sum / patch.len() as f64;
            if avg_a < 0.22 || p_mean <= 0.01 {
                continue;
            }
            let (tier, gi, eff) = best_cell(&patch, p_mean, avg_a, &bank);
            picks[r * COLUMNS + c] = (tier, gi);
            diffuse(&mut error, rows, r, c, p_mean - eff);
        }
    }
    markup(&picks)
}

/// Strip only the renderer's own `<span class="t0..t3">` and `</span>` tags
/// in a single left-to-right pass to recover the plain copy-and-pasteable ASCII.
pub fn plain_text(art: &str) -> String {
    let mut out = String::with_capacity(art.len());
    let mut rest = art;
    while !rest.is_empty() {
        if let Some(after) = rest.strip_prefix("</span>") {
            rest = after;
        } else if let Some(after) = rest.strip_prefix("<span class=\"t")
            && matches!(after.as_bytes().first(), Some(b'0'..=b'3'))
            && let Some(after) = after[1..].strip_prefix("\">")
        {
            rest = after;
        } else if let Some(ch) = rest.chars().next() {
            out.push(ch);
            rest = &rest[ch.len_utf8()..];
        }
    }
    out
}

/// Format one row with run-length `<span class="t0..t3">` wrappers; tier 4
/// inherits `--colour-ink` from `<pre>` with no wrapper.
fn format_row(row: &[(usize, usize)], glyph_chars: &[char]) -> String {
    let last_ink = row.iter().rposition(|&(_, gi)| gi != 0);
    let Some(end) = last_ink else {
        return String::new();
    };
    let mut out = String::new();
    let mut open_tier: Option<usize> = None;
    for &(tier, gi) in &row[..=end] {
        let ch = glyph_chars[gi];
        let want = if gi == 0 || tier == 4 {
            None
        } else {
            Some(tier)
        };
        if want != open_tier {
            if open_tier.is_some() {
                out.push_str("</span>");
            }
            if let Some(t) = want {
                out.push_str(&format!("<span class=\"t{t}\">"));
            }
            open_tier = want;
        }
        out.push(ch);
    }
    if open_tier.is_some() {
        out.push_str("</span>");
    }
    out
}

/// The picked `(tier, glyph)` cells as rows of HTML markup, empty rows at
/// either end trimmed.
fn markup(picks: &[(usize, usize)]) -> Result<String, String> {
    let glyph_chars: Vec<char> = GLYPHS.chars().collect();
    let lines: Vec<String> = picks
        .chunks(COLUMNS)
        .map(|row| format_row(row, &glyph_chars))
        .collect();
    let first = lines.iter().position(|l| !l.is_empty());
    let last = lines.iter().rposition(|l| !l.is_empty());
    match (first, last) {
        (Some(first), Some(last)) => Ok(lines[first..=last].join("\n")),
        _ => Err("the render came out empty; check the photo".into()),
    }
}

/// `site-tools render_about_portrait <cutout.png>`: redraw the portrait `pre` in place.
pub fn run(root: &Path, args: &[String]) -> Result<u8, String> {
    let [photo] = args else {
        return Err("usage: site-tools render_about_portrait <cutout.png>".into());
    };
    // A PNG within MAX_SIDE holds at most 256 MiB of 8-bit RGBA pixels; refuse a
    // much larger file without reading it all into memory.
    const MAX_PHOTO_BYTES: u64 = 384 << 20;
    let mut png = Vec::new();
    std::fs::File::open(photo)
        .and_then(|file| file.take(MAX_PHOTO_BYTES + 1).read_to_end(&mut png))
        .map_err(|e| format!("{photo}: {e}"))?;
    if png.len() as u64 > MAX_PHOTO_BYTES {
        return Err(format!("{photo}: over 384 MiB; supply the cutout PNG"));
    }
    let font = std::fs::read(root.join(FONT)).map_err(|e| format!("{FONT}: {e}"))?;
    let art = render(&png, &font)?;
    let page_path = root.join(PAGE);
    let page = std::fs::read_to_string(&page_path).map_err(|e| format!("{PAGE}: {e}"))?;
    let pattern = Regex::new(PORTRAIT).map_err(|e| e.to_string())?;
    if pattern.find_iter(&page).count() != 1 {
        return Err(format!("{PAGE}: expected one portrait pre"));
    }
    let updated = pattern.replace(&page, |m: &regex::Captures<'_>| {
        format!("{}{art}{}", &m[1], &m[3])
    });
    std::fs::write(&page_path, updated.as_bytes()).map_err(|e| format!("{PAGE}: {e}"))?;
    let plain = plain_text(&art);
    let lines: Vec<&str> = plain.split('\n').collect();
    let widest = lines.iter().map(|l| l.chars().count()).max().unwrap_or(0);
    crate::print_text(
        &format!(
            "{} rows of up to {widest} of {COLUMNS} columns\n",
            lines.len()
        ),
        false,
    )
    .map_err(|e| e.to_string())?;
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The unit square, its edges drawn by `edge` from each corner to the next.
    fn square(edge: impl Fn(&mut Outline, (f32, f32), (f32, f32))) -> Outline {
        let mut outline = Outline::default();
        let corners = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)];
        outline.move_to(0.0, 0.0);
        for pair in corners.windows(2) {
            edge(&mut outline, pair[0], pair[1]);
        }
        outline.close();
        outline
    }

    #[test]
    fn a_cubic_outline_with_straight_controls_covers_its_square() {
        // CFF fonts draw with cubics; a cubic whose controls sit on its chord is that chord.
        let lines = square(|o, _, (x, y)| o.line_to(x, y));
        let cubics = square(|o, (x0, y0), (x, y)| {
            let third = |a: f32, b: f32| a + (b - a) / 3.0;
            o.curve_to(third(x0, x), third(y0, y), third(x, x0), third(y, y0), x, y);
        });
        let straight = rasterise_glyph(&lines, 10, 20, 10.0, 15.0);
        let curved = rasterise_glyph(&cubics, 10, 20, 10.0, 15.0);
        assert!(straight.iter().any(|&c| c > 0.5));
        assert_eq!(straight.len(), curved.len());
        for (a, b) in straight.iter().zip(&curved) {
            assert!((a - b).abs() < 1e-3, "{a} vs {b}");
        }
    }
}
