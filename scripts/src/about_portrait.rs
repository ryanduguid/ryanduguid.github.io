// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Render the About page's ASCII portrait from a cutout of Ryan's headshot.
//!
//! The photo is not in the repository. It must be a PNG whose background is
//! transparent: the alpha channel is the silhouette, so nothing has to guess
//! where Ryan ends and the backdrop begins. Each character cell is sampled as
//! 6 rows by 4 columns, and the glyph whose own bitmap, drawn from the site's
//! Spline Sans Mono in the 0.6em by 1em cell the page draws, best matches the
//! cell is chosen. Error diffusion carries each cell's leftover tone to its
//! neighbours, so even areas such as the forehead get an even texture.
use ab_glyph_rasterizer::{Point, Rasterizer, point};
use regex::Regex;
use skrifa::{DrawMemory, PathSink, ScalerFont, font::Font};
use std::io::Read as _;
use std::path::Path;

pub const PAGE: &str = "about/index.html";
pub const FONT: &str = "assets/fonts/SplineSansMono-Regular.woff2";
/// Symbols only, space first: letters read as words at this size. None needs
/// HTML escaping or can open a Liquid tag. `|` and `-` are left out because a
/// column of `|` or a row of `-` joins into a stripe at a line height of 1.
pub const GLYPHS: &str = " !#$'()*+,./:;@[\\]^_`~";
pub const COLUMNS: usize = 140;
/// Samples across and down each cell.
const SUB_X: usize = 4;
const SUB_Y: usize = 6;
/// The cell is 0.6em wide and 1em tall.
const ADVANCE: f64 = 0.6;
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
    // The hair just inside the top edge, the shoulders below the collar.
    let crop_w = 1.85 * head.width;
    let crop_h = 1.5 * head.height;
    let top = head.top - 0.03 * head.height;
    let left = head.centre - crop_w / 2.0;
    let bounds = [left, top, left + crop_w, top + crop_h].map(|v| v.round() as i64);
    let rows = (crop_h / crop_w * COLUMNS as f64 * ADVANCE).round() as usize;
    // A head far taller than it is wide is a bad cutout, and its grid would
    // need gigabytes of samples.
    if rows > 2 * COLUMNS {
        return Err(format!(
            "the head is {} by {} pixels, which would draw {rows} rows; check the cutout",
            head.width, head.height
        ));
    }
    Ok((bounds, rows))
}

/// Local contrast, then the figure's tonal range stretched to 0 to 1.
fn contrast(value: &Grey, person: &Grey) -> Result<Grey, String> {
    // Each sample against its surroundings within the figure, so the shadowed
    // cheek keeps its modelling and the lit one does not clip.
    let sigma = 0.06 * value.width as f64;
    let weighted = blur(&value.zip(person, |v, m| v * m), sigma, false);
    let base = weighted.zip(&blur(person, sigma, false), |n, d| n / d.max(1e-6));
    let value = value.zip(&base, |v, b| v + 0.9 * (v - b));

    let mut inside: Vec<f64> = value
        .data
        .iter()
        .zip(&person.data)
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
    // A gentle gamma, and a faint floor so the dark hair and suit still read.
    Ok(value.map(|v| {
        ((v - low) / (high - low))
            .clamp(0.0, 1.0)
            .powf(1.2)
            .max(0.1)
    }))
}

/// A rim along the silhouette, so the head's outline reads against the canvas.
fn rim(person: &Grey) -> Grey {
    let (width, height) = (person.width, person.height);
    let mut rim = Grey::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let mut eroded = f64::INFINITY;
            for dy in 0..SUB_Y {
                for dx in 0..SUB_X {
                    let sy = (y + dy).saturating_sub(SUB_Y / 2).min(height - 1);
                    let sx = (x + dx).saturating_sub(SUB_X / 2).min(width - 1);
                    eroded = eroded.min(person.at(sx, sy));
                }
            }
            rim.data[y * width + x] = 0.7 * (person.at(x, y) - eroded).clamp(0.0, 1.0);
        }
    }
    rim
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
                .hypot((y as f64 - height as f64 * 0.38) / (height as f64 * 0.72));
            let corner = (1.0 - (ellipse - 0.72).max(0.0) / 0.28).clamp(0.0, 1.0);
            out.data[y * width + x] *= bottom * corner;
        }
    }
}

/// Tone to draw, 0 (canvas) to 1 (brightest glyph), at `SUB_X` by `SUB_Y`
/// samples a cell, and the number of rows.
fn tone(png: &[u8]) -> Result<(Grey, usize), String> {
    let (lightness, alpha) = lightness_and_alpha(png)?;
    // A cutout's background is a clear area around the figure, not a stray clear pixel.
    let clear = alpha.data.iter().filter(|&&a| a <= 0.5).count();
    if clear * 100 < alpha.data.len() {
        return Err("the photo has no transparent background; supply a cutout PNG".into());
    }
    let (bounds, rows) = crop(&find_head(&alpha)?)?;
    let (width, height) = (COLUMNS * SUB_X, rows * SUB_Y);
    let premultiplied = lightness.zip(&alpha, |l, a| l * a);
    let person = crop_resize(&alpha, bounds, width, height);
    let value = crop_resize(&premultiplied, bounds, width, height)
        .zip(&person, |v, m| if m > 1e-3 { v / m } else { 0.0 });
    let value = contrast(&value, &person)?;
    let mut out = value
        .zip(&rim(&person), f64::max)
        .zip(&person, |v, m| v * m);
    fade(&mut out);
    Ok((out, rows))
}

/// A glyph's coverage at `SUB_X` by `SUB_Y` samples, unblurred and blurred.
type Samples = (Vec<f64>, Vec<f64>);

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

/// Each glyph's samples, in `GLYPHS` order.
fn glyph_samples(font: &[u8]) -> Result<Vec<Samples>, String> {
    let ttf = wuff::decompress_woff2(font).map_err(|_| "could not decode the WOFF2 font")?;
    let face = Font::new(ttf, 0).ok_or("could not read the font")?;
    let line = face.metrics().h_line().ok_or("font has no line metrics")?;
    // Drawn large, then averaged down to the samples.
    let size = 240usize;
    let (cell_w, cell_h) = ((size as f64 * ADVANCE).round() as usize, size);
    let px = size as f32 / f32::from(face.metrics().units_per_em);
    // Line height 1: the content area is centred in the one-em line box.
    let (ascent, descent) = (line.ascender.to_f32() * px, -line.descender.to_f32() * px);
    let baseline = (size as f32 - (ascent + descent)) / 2.0 + ascent;
    let charmap = face.charmap();
    let scaler = ScalerFont::unhinted(face.clone(), None);
    GLYPHS
        .chars()
        .map(|ch| {
            let mut cell = Grey::new(cell_w, cell_h);
            let mut outline = Outline::default();
            if let Some(glyph) = scaler.outline(charmap.map_unicode(ch).unwrap_or_default()) {
                glyph
                    .draw(DrawMemory::Scratch, &mut outline)
                    .map_err(|e| format!("glyph {ch:?}: {e}"))?;
            }
            let (mut low, mut high) = (point(f32::MAX, f32::MAX), point(f32::MIN, f32::MIN));
            for p in outline.points() {
                low = point(low.x.min(p.x), low.y.min(p.y));
                high = point(high.x.max(p.x), high.y.max(p.y));
            }
            if low.x < high.x && low.y < high.y {
                // Whole-pixel bounds round the scaled outline; font y grows up and
                // pixel y down. The order of operations is ab_glyph's, which drew
                // the portrait before, so each glyph's coverage is bit for bit the same.
                let (whole, fraction) = (baseline.trunc(), baseline.fract());
                let (min_x, max_x) = ((low.x * px).floor(), (high.x * px).ceil());
                let min_y = (high.y * -px + fraction).floor() + whole;
                let max_y = (low.y * -px + fraction).ceil() + whole;
                let offset = point(-min_x, baseline - min_y);
                let at = |p: Point| point(p.x * px + offset.x, p.y * -px + offset.y);
                let mut raster =
                    Rasterizer::new((max_x - min_x) as usize, (max_y - min_y) as usize);
                for segment in &outline.segments {
                    match *segment {
                        Segment::Line(a, b) => raster.draw_line(at(a), at(b)),
                        Segment::Quad(a, b, c) => raster.draw_quad(at(a), at(b), at(c)),
                        Segment::Cubic(a, b, c, d) => {
                            raster.draw_cubic(at(a), at(b), at(c), at(d));
                        }
                    }
                }
                raster.for_each_pixel_2d(|x, y, c| {
                    let (x, y) = (min_x as i64 + i64::from(x), min_y as i64 + i64::from(y));
                    if (0..cell_w as i64).contains(&x) && (0..cell_h as i64).contains(&y) {
                        cell.data[y as usize * cell_w + x as usize] += f64::from(c);
                    }
                });
            }
            let samples = crop_resize(
                &cell.map(|c| c.min(1.0)),
                [0, 0, cell_w as i64, cell_h as i64],
                SUB_X,
                SUB_Y,
            );
            let blurred = blur(&samples, 0.6, true);
            Ok((samples.data, blurred.data))
        })
        .collect()
}

/// The portrait text: each cell gets the glyph closest to its samples, and
/// the difference in tone spreads to the cells not yet drawn, with Floyd and
/// Steinberg's weights.
pub fn render(png: &[u8], font: &[u8]) -> Result<String, String> {
    let (target, rows) = tone(png)?;
    let glyphs = glyph_samples(font)?;
    let means: Vec<f64> = glyphs
        .iter()
        .map(|(g, _)| g.iter().sum::<f64>() / g.len() as f64)
        .collect();
    let brightest = means.iter().copied().fold(0.0, f64::max);
    let target = blur(&target.map(|v| v * brightest), 0.6, true);
    let mut picks = vec![0usize; rows * COLUMNS];
    let mut error = vec![0.0f64; (rows + 1) * (COLUMNS + 2)];
    let at = |r: usize, c: isize| r * (COLUMNS + 2) + (c + 1) as usize;
    let mut cell = [0.0f64; SUB_X * SUB_Y];
    for r in 0..rows {
        for c in 0..COLUMNS {
            let carried = error[at(r, c as isize)];
            for (k, sample) in cell.iter_mut().enumerate() {
                let (dy, dx) = (k / SUB_X, k % SUB_X);
                *sample = target.at(c * SUB_X + dx, r * SUB_Y + dy) + carried;
            }
            // Leave the canvas empty where there is nothing to draw.
            if cell.iter().all(|&v| v <= 0.01) && carried <= 0.02 {
                continue;
            }
            let distance = |g: &[f64]| {
                g.iter()
                    .zip(&cell)
                    .map(|(a, b)| (a - b).powi(2))
                    .sum::<f64>()
            };
            let best = (0..glyphs.len())
                .min_by(|&a, &b| distance(&glyphs[a].1).total_cmp(&distance(&glyphs[b].1)))
                .unwrap_or(0);
            picks[r * COLUMNS + c] = best;
            let left_over = cell.iter().sum::<f64>() / cell.len() as f64 - means[best];
            let c = c as isize;
            error[at(r, c + 1)] += left_over * 7.0 / 16.0;
            error[at(r + 1, c - 1)] += left_over * 3.0 / 16.0;
            error[at(r + 1, c)] += left_over * 5.0 / 16.0;
            error[at(r + 1, c + 1)] += left_over / 16.0;
        }
    }
    text(&picks)
}

/// The picked glyphs as rows of text, trailing spaces and empty rows at either
/// end trimmed.
fn text(picks: &[usize]) -> Result<String, String> {
    let glyph_chars: Vec<char> = GLYPHS.chars().collect();
    let lines: Vec<String> = picks
        .chunks(COLUMNS)
        .map(|row| {
            row.iter()
                .map(|&k| glyph_chars[k])
                .collect::<String>()
                .trim_end()
                .to_owned()
        })
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
    let lines: Vec<&str> = art.split('\n').collect();
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
