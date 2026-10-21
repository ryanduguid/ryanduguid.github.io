//! scripts/check_design.py: protect the site's factual surface and shipped design assets.
use crate::favicon_render::{self, RenderError};
use crate::html::unescape;
use crate::htmlparser::{self, Event};
use crate::py;
use crate::pyjson::{self, Dump, Json};
use crate::pyobj::type_name;
use crate::pyre::{self, I, M, S, re};
use crate::pytime;
use crate::seo_core as core;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

const JSON_LD_PATTERN: &str = r#"<script type="application/ld\+json">(.*?)</script>"#;
const MAIN_PATTERN: &str = r"<main\b[^>]*>(.*?)</main>";
const ARTICLE_CRUMB_PATTERN: &str = concat!(
    r#"<(?P<tag>p|nav)\b(?=[^>]*\bclass="[^"]*\barticle-crumb\b[^"]*")[^>]*>"#,
    r".*?</(?P=tag)>"
);
const HEAD_PATTERN: &str = r"<head\b[^>]*>(.*?)</head>";
const FOOTER_PATTERN: &str = r"<footer\b[^>]*>(.*?)</footer>";
const MAIN_LINK_PATTERN: &str = r#"<a\b[^>]*\bhref\s*=\s*(["\'])(.*?)\1"#;
const FONT_URL_PATTERN: &str = r#"url\(["\']?(/assets/fonts/[^)"\']+\.woff2)"#;
const SOURCE_URL_PATTERN: &str = r#"url\(\s*["\']?([^)"\']+)"#;
const FONT_FACE_PATTERN: &str = r"@font-face\s*\{(.*?)\}";
pub const LAMBDA_MARKUP: &str = "<span class=\"function-symbol\">\u{3bb}</span>";
const RAW_COLOUR_PATTERN: &str = r"#[0-9a-f]{3,8}\b";
pub const ACCOUNTING_LINK: &str =
    "<link rel=\"stylesheet\" href=\"/assets/accounting-pages.css?v=20261007b\" />";
pub const GOOGLE_FAVICON_LINKS: [&str; 2] = [
    "<link rel=\"icon\" type=\"image/png\" sizes=\"48x48\" href=\"/assets/favicon-48.png\" />",
    "<link rel=\"icon\" type=\"image/png\" sizes=\"96x96\" href=\"/assets/favicon-96.png\" />",
];
pub const LLMS_VISIBLE: &str = "<a href=\"/llms.txt\">Machine-readable index</a>";
pub const CSP_META: &str = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'\" />";
pub const FONT_FACES: [&str; 4] = [
    "Besley-SemiBold",
    "PublicSans-Regular",
    "SplineSansMono-Regular",
    "PublicSans-SemiBold",
];
const SCRIPT_OPEN_PATTERN: &str = r"<script\b([^>]*)>";
const JSON_LD_TYPE_PATTERN: &str = r#"\btype\s*=\s*["\']application/ld\+json["\']"#;
pub const SECURITY_TXT: &str = ".well-known/security.txt";
const SECURITY_TXT_CANONICAL: &str = "https://duguid.com.au/.well-known/security.txt";
const JEKYLL_CONFIG: &str = "_config.yml";
const PROOF_IMAGE_PATTERN: &str =
    r#"<img\b(?=[^>]*\bsrc="/assets/coal-lsl-calculator\.webp")[^>]*>"#;
const PROOF_WIDTH: &str = "868";
const PROOF_HEIGHT: &str = "580";
const MAX_PROOF_BYTES: usize = 80_000;
pub const PROOF_ASSET: &str = "assets/coal-lsl-calculator.webp";
pub const PROOF_MOBILE_ASSET: &str = "assets/coal-lsl-calculator-mobile.webp";
const PROOF_MOBILE_SOURCE: &str =
    "<source media=\"(max-width: 40rem)\" srcset=\"/assets/coal-lsl-calculator-mobile.webp\"";
const HOMEPAGE_ANCHOR_IDS: [&str; 2] = ["adopt", "verify"];
const HOMEPAGE_REQUIRED_CLASSES: [&str; 2] = ["home-hero__actions", "home-tool-preview"];
const HERO_PREVIEW_ADJACENCY_PATTERN: &str = concat!(
    r#"<section\b(?=[^>]*class\s*=\s*["\'][^"\']*\bhome-hero\b"#,
    r#"[^"\']*["\'])[^>]*>.*?</section>\s*"#,
    r#"<section\b(?=[^>]*class\s*=\s*["\'][^"\']*\bhome-tool-preview\b"#,
    r#"[^"\']*["\'])"#
);
const HERO_ACTIONS_PATTERN: &str = concat!(
    r#"<nav\b(?=[^>]*class\s*=\s*["\'][^"\']*\bhome-hero__actions\b"#,
    r#"[^"\']*["\'])[^>]*>(.*?)</nav>"#
);
const ROOT_BLOCK_PATTERN: &str = r":root\s*\{(.*?)\}";
const PROPERTY_PATTERN: &str = r"(--[\w-]+)\s*:\s*([^;]+);";
const UNICODE_RANGE_PATTERN: &str = r"U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?";
const MAX_FONT_BYTES: u64 = 25_000;
const MAX_TOTAL_FONT_BYTES: u64 = 135_000;
const FAVICON_COLOURS: [&str; 3] = ["#000000", "#ffd32a", "#990024"];
const FAVICON_GEOMETRY_ATTRIBUTES: [&str; 6] = ["x", "y", "width", "height", "rx", "ry"];
const BANNED_CSS_PATTERNS: [&str; 8] = [
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
    "backdrop-filter",
    "box-shadow",
    "#04001f",
    "#5c2d91",
    "#9f6fd8",
];
pub const BANNED_VISIBLE_PATTERNS: [(&str, &str); 79] = [
    ("delve", r"\bdelv(?:e|es|ed|ing)\b"),
    ("revolutionise", r"\brevolutioni[sz](?:e|es|ed|ing)\b"),
    ("seamless", r"\bseamless(?:ly)?\b"),
    ("cutting-edge", r"\bcutting-edge\b"),
    ("state-of-the-art", r"\bstate-of-the-art\b"),
    ("next-level", r"\bnext-level\b"),
    ("world-class", r"\bworld-class\b"),
    ("best-in-class", r"\bbest-in-class\b"),
    ("leverage", r"\bleverag(?:e|es|ed|ing)\b"),
    ("utilise", r"\butili[sz](?:e|es|ed|ing)\b"),
    ("unlock", r"\bunlock(?:s|ed|ing)?\b"),
    ("unleash", r"\bunleash(?:es|ed|ing)?\b"),
    ("harness the", r"\bharness(?:es|ed|ing)? the\b"),
    ("empower", r"\bempower(?:s|ed|ing|ment)?\b"),
    ("elevate", r"\belevat(?:e|es|ed|ing)\b"),
    ("streamline", r"\bstreamlin(?:e|es|ed|ing)\b"),
    ("supercharge", r"\bsupercharg(?:e|es|ed|ing)\b"),
    ("effortless", r"\beffortless(?:ly)?\b"),
    ("robust", r"\brobust(?:ly|ness)?\b"),
    ("AI-powered", r"\bai-(?:powered|driven)\b"),
    ("landscape", r"\blandscape\b"),
    ("tapestry", r"\btapestry\b"),
    ("testament", r"\btestament\b"),
    ("realm", r"\brealms?\b"),
    ("beacon", r"\bbeacon\b"),
    ("journey", r"\bjourneys?\b"),
    ("embark", r"\bembark(?:s|ed|ing)?\b"),
    ("navigate", r"\bnavigat(?:e|es|ed|ing)\b"),
    ("pivotal", r"\bpivotal\b"),
    ("crucial", r"\bcrucial(?:ly)?\b"),
    ("vital", r"\bvital(?:ly)?\b"),
    ("paramount", r"\bparamount\b"),
    ("game-changer", r"\bgame-chang(?:er|ers|ing)\b"),
    ("transformative", r"\btransformative\b"),
    ("innovative", r"\binnovative\b"),
    ("groundbreaking", r"\bgroundbreaking\b"),
    ("unprecedented", r"\bunprecedented\b"),
    ("remarkable", r"\bremarkabl[ey]\b"),
    ("compelling", r"\bcompelling\b"),
    ("invaluable", r"\binvaluable\b"),
    ("indispensable", r"\bindispensable\b"),
    ("holistic", r"\bholistic(?:ally)?\b"),
    ("synergy", r"\bsynerg(?:y|ies|istic)\b"),
    ("paradigm", r"\bparadigms?\b"),
    ("meticulous", r"\bmeticulous(?:ly)?\b"),
    ("intricate", r"\bintricate(?:ly)?\b"),
    ("nuanced", r"\bnuanced\b"),
    ("multifaceted", r"\bmultifaceted\b"),
    ("myriad", r"\bmyriad\b"),
    ("plethora", r"\bplethora\b"),
    ("bustling", r"\bbustling\b"),
    ("vibrant", r"\bvibrant\b"),
    ("unwavering", r"\bunwavering\b"),
    ("ever-evolving", r"\bever-evolving\b"),
    ("curated", r"\bcurat(?:e|es|ed|ing)\b"),
    ("bespoke", r"\bbespoke\b"),
    ("actionable", r"\bactionable\b"),
    ("insights", r"\binsights?\b"),
    ("foster", r"\bfoster(?:s|ed|ing)?\b"),
    ("facilitate", r"\bfacilitat(?:e|es|ed|ing)\b"),
    ("underscore", r"\bunderscor(?:e|es|ed|ing)\b"),
    ("showcase", r"\bshowcas(?:e|es|ed|ing)\b"),
    ("spearhead", r"\bspearhead(?:s|ed|ing)?\b"),
    ("bolster", r"\bbolster(?:s|ed|ing)?\b"),
    ("garner", r"\bgarner(?:s|ed|ing)?\b"),
    ("unpack", r"\bunpack(?:s|ed|ing)?\b"),
    ("dive into", r"\bdiv(?:e|es|ed|ing) into\b"),
    ("deep dive", r"\bdeep dives?\b"),
    ("moreover", r"\bmoreover\b"),
    ("furthermore", r"\bfurthermore\b"),
    ("additionally", r"\badditionally\b"),
    ("ultimately", r"\bultimately\b"),
    ("notably", r"\bnotably\b"),
    ("essentially", r"\bessentially\b"),
    ("arguably", r"\barguably\b"),
    ("in today's", "\\bin today['\u{2019}]s\\b"),
    (
        "it's worth noting",
        "\\bit(?:['\u{2019}]s| is) worth noting\\b",
    ),
    ("at its core", r"\bat its core\b"),
    ("Get started", r"\bget started\b"),
];
const COPY_TEXT_FILES: [&str; 1] = ["llms.txt"];
const META_CONTENT_PATTERN: &str = r#"<meta\b[^>]*\bcontent\s*=\s*"([^"]*)""#;
const OPENING_REVIEW_DATE_CONTEXTS: [(&str, &str); 3] = [
    ("index.html", "home-hero__copy"),
    ("tools/index.html", "article-header"),
    ("evidence/index.html", "article-header"),
];
const OPENING_REVIEW_DATE_PATTERN: &str = r"^Last reviewed (?P<date>\d{1,2} [A-Z][a-z]+ \d{4})\.$";
const EMOJI_PATTERN: &str = r"[\u2600-\u26ff\u2700-\u27bf\U0001f300-\U0001faff]";

pub fn calculator_csp_meta() -> String {
    CSP_META.replace("form-action 'self'", "form-action 'none'")
}

pub fn font_preload(face: &str) -> String {
    format!(
        "<link rel=\"preload\" href=\"/assets/fonts/{face}.woff2\" as=\"font\" type=\"font/woff2\" crossorigin />"
    )
}

fn site_path(root: &Path, rel: &str) -> PathBuf {
    root.join(rel)
}

fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    std::fs::read(path)
        .map_err(|e| py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Errno))
}

/// Hash UTF-8 text after normalising only platform line endings.
fn normalised_text_digest(path: &Path) -> Result<String, String> {
    let text = py::decode_utf8(&read_bytes(path)?).map_err(|e| e.to_string())?;
    Ok(crate::sha256(
        text.replace("\r\n", "\n").replace('\r', "\n"),
    ))
}

/// `PurePath(name).suffix`: from the last dot, unless the dot starts or ends the name.
fn suffix(name: &str) -> &str {
    match name.rfind('.') {
        Some(i) if i > 0 && i < name.len() - 1 => &name[i..],
        _ => "",
    }
}

/// Keep text assets portable while hashing binary font files byte for byte.
fn protected_asset_digest(path: &Path) -> Result<String, String> {
    let name = path
        .file_name()
        .map_or(String::new(), |n| n.to_string_lossy().into_owned());
    if suffix(&name).to_lowercase() == ".txt" {
        normalised_text_digest(path)
    } else {
        Ok(crate::sha256(read_bytes(path)?))
    }
}

fn semantic_json_digest(value: &Json) -> String {
    crate::sha256(pyjson::dumps(
        value,
        Dump {
            ensure_ascii: false,
            sort_keys: true,
            separators: Some((",", ":")),
            ..Default::default()
        },
    ))
}

fn posix(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn json_ld_digests(path: &Path) -> Result<(Vec<String>, Vec<String>), String> {
    let mut failures = Vec::new();
    let mut digests = Vec::new();
    let text = crate::read(path)?;
    for (index, raw) in re(JSON_LD_PATTERN, S).findall(&text).iter().enumerate() {
        match pyjson::loads(raw) {
            Ok(value) => digests.push(semantic_json_digest(&value)),
            Err(error) => failures.push(format!(
                "invalid JSON-LD block {}: {}: {error}",
                index + 1,
                if cfg!(windows) {
                    posix(path)
                } else {
                    path.to_string_lossy().into_owned()
                }
            )),
        }
    }
    Ok((digests, failures))
}

/// ScriptContentParser: raw-text script bodies from the standard HTML tokenizer.
fn script_contents(raw_html: &str) -> Vec<String> {
    let mut inside = false;
    let mut contents = Vec::new();
    for positioned in htmlparser::parse(raw_html, true) {
        match positioned.event {
            Event::StartTag(tag, _) if py::casefold(&tag) == "script" => inside = true,
            // handle_startendtag calls handle_starttag then handle_endtag.
            Event::StartEndTag(tag, _) | Event::EndTag(tag) if py::casefold(&tag) == "script" => {
                inside = false;
            }
            Event::Data(data) if inside => contents.push(data),
            _ => {}
        }
    }
    contents
}

fn active_markup(raw_html: &str) -> String {
    let without_comments = re(r"<!--.*?-->", S).sub(" ", raw_html);
    re(r"<(script|style|template)\b[^>]*>.*?</\1>", I | S).sub(" ", &without_comments)
}

fn element_tag(node: roxmltree::Node<'_, '_>) -> String {
    favicon_render::tag(node)
}

pub fn check_favicon(root: &Path) -> Result<Vec<String>, String> {
    let path = root.join("assets").join("favicon.svg");
    if !path.is_file() {
        return Ok(vec!["favicon missing: assets/favicon.svg".into()]);
    }
    let text = crate::read(&path)?;
    // shortcut: roxmltree stands in for expat, so the message after the colon differs.
    let document = match roxmltree::Document::parse(&text) {
        Ok(document) => document,
        Err(error) => return Ok(vec![format!("favicon is not valid SVG: {error}")]),
    };
    let svg = document.root_element();
    if favicon_render::local(&element_tag(svg)) != "svg"
        || svg.attribute("viewBox") != Some("0 0 64 64")
    {
        return Ok(vec!["favicon viewBox must be 0 0 64 64".into()]);
    }
    let elements: Vec<_> = svg
        .descendants()
        .filter(roxmltree::Node::is_element)
        .collect();
    if elements
        .iter()
        .any(|e| favicon_render::local(&element_tag(*e)) == "text")
    {
        return Ok(vec!["favicon must use geometric shapes, not text".into()]);
    }
    for element in elements {
        if let Some(fill) = element.attribute("fill") {
            let folded = py::casefold(fill);
            if !FAVICON_COLOURS.contains(&folded.as_str()) {
                return Ok(vec![format!(
                    "favicon colour outside OLED palette: {folded}"
                )]);
            }
        }
        for attribute in FAVICON_GEOMETRY_ATTRIBUTES {
            if let Some(value) = element.attribute(attribute)
                && !pyre::fullmatch(r"-?\d+", 0, py::strip(value))
            {
                return Ok(vec![format!(
                    "favicon geometry must use whole pixels: {attribute}={value}"
                )]);
            }
        }
    }
    Ok(vec![])
}

/// Keep every shipped raster identical to a fresh render of the seal.
pub fn check_favicon_assets(root: &Path) -> Result<Vec<String>, String> {
    let mut rasters = match favicon_render::rasters(root) {
        Ok(rasters) => rasters,
        Err(RenderError::Favicon(error)) => {
            return Ok(vec![format!("favicon render failed: {error}")]);
        }
        Err(RenderError::Raised(error)) => return Err(error),
    };
    rasters.sort_by(|a, b| a.0.cmp(&b.0));
    let mut failures = Vec::new();
    for (rel, expected) in rasters {
        let path = rel
            .split('/')
            .fold(root.to_path_buf(), |p, part| p.join(part));
        if !path.is_file() {
            failures.push(format!("favicon raster missing: {rel}"));
            continue;
        }
        let actual = read_bytes(&path)?;
        let matches = if rel.ends_with(".png") {
            match (
                favicon_render::png_content(&actual),
                favicon_render::png_content(&expected),
            ) {
                (Ok(a), Ok(b)) => a == b,
                _ => false,
            }
        } else {
            actual == expected
        };
        if !matches {
            failures.push(format!(
                "favicon raster out of date: {rel} (run site-tools favicon_render)"
            ));
        }
    }
    Ok(failures)
}

fn main_region(path: &Path) -> Result<Option<String>, String> {
    let matches = re(MAIN_PATTERN, S | I).findall(&crate::read(path)?);
    if matches.len() != 1 {
        return Ok(None);
    }
    Ok(Some(re(ARTICLE_CRUMB_PATTERN, S | I).sub("", &matches[0])))
}

pub fn main_visible_digest(path: &Path) -> Result<Option<String>, String> {
    Ok(main_region(path)?.map(|protected| crate::sha256(core::raw_text(&protected))))
}

pub fn main_link_targets(path: &Path) -> Result<Option<Vec<String>>, String> {
    Ok(main_region(path)?.map(|protected| {
        re(MAIN_LINK_PATTERN, S | I)
            .findall_groups(&protected)
            .iter()
            .map(|groups| unescape(&groups[1]))
            .collect()
    }))
}

fn css_root_properties(tokens_css: &str) -> Vec<(String, String)> {
    let Some(block) = re(ROOT_BLOCK_PATTERN, S | I).search(tokens_css) else {
        return vec![];
    };
    let mut properties: Vec<(String, String)> = Vec::new();
    for groups in re(PROPERTY_PATTERN, 0).findall_groups(&block[1]) {
        let name = groups[0].to_lowercase();
        let value = py::strip(&groups[1]).to_lowercase();
        match properties.iter_mut().find(|(n, _)| *n == name) {
            Some(slot) => slot.1 = value,
            None => properties.push((name, value)),
        }
    }
    properties
}

fn relative_luminance(colour: &str) -> f64 {
    let value = colour.strip_prefix('#').unwrap_or(colour);
    let channels: Vec<f64> = [0, 2, 4]
        .iter()
        .map(|i| f64::from(u8::from_str_radix(&value[*i..*i + 2], 16).unwrap_or(0)) / 255.0)
        .collect();
    let linear: Vec<f64> = channels
        .iter()
        .map(|c| {
            if *c <= 0.04045 {
                c / 12.92
            } else {
                ((c + 0.055) / 1.055).powf(2.4)
            }
        })
        .collect();
    0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

fn contrast_ratio(first: &str, second: &str) -> f64 {
    let (a, b) = (relative_luminance(first), relative_luminance(second));
    (a.max(b) + 0.05) / (a.min(b) + 0.05)
}

fn six_digit(value: &str) -> bool {
    pyre::fullmatch(r"#[0-9a-f]{6}", 0, value)
}

pub fn check_oled_tokens(tokens_css: &str) -> Vec<String> {
    let mut failures = Vec::new();
    let root_block = re(ROOT_BLOCK_PATTERN, S | I)
        .search(tokens_css)
        .map_or(String::new(), |m| m[1].to_owned());
    let properties = css_root_properties(tokens_css);
    let get = |name: &str| {
        properties
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, v)| v.as_str())
    };
    if !re(r"\bcolor-scheme\s*:\s*dark\s*;", I).is_match(&root_block) {
        failures.push("native colour scheme must be dark only".into());
    }
    if tokens_css.to_lowercase().contains("prefers-color-scheme") {
        failures.push("OLED theme must not contain a prefers-color-scheme override".into());
    }
    let canvas = get("--colour-canvas");
    if canvas != Some("#000000") {
        failures.push("OLED canvas must be #000000".into());
        return failures;
    }
    for token in ["--colour-ink", "--colour-ink-soft", "--colour-alert"] {
        match get(token) {
            Some(value) if six_digit(value) => {
                if contrast_ratio(value, "#000000") < 4.5 {
                    failures.push(format!("{token} contrast on canvas must be at least 4.5:1"));
                }
            }
            _ => failures.push(format!("{token} must be a six-digit colour")),
        }
    }
    for (token, colour) in [
        ("--colour-stamp", "#990024"),
        ("--colour-stamp-strong", "#66023c"),
        ("--colour-pass", "#0f4b32"),
    ] {
        if get(token) != Some(colour) {
            failures.push(format!("{token} must be {colour}"));
        }
    }
    let ink = get("--colour-ink");
    for token in ["--colour-stamp", "--colour-stamp-strong"] {
        if let (Some(stamp), Some(ink)) = (get(token), ink)
            && !stamp.is_empty()
            && six_digit(stamp)
            && !ink.is_empty()
            && six_digit(ink)
            && contrast_ratio(ink, stamp) < 4.5
        {
            failures.push("ink contrast on filled accent must be at least 4.5:1".into());
        }
    }
    let display = get("--text-display").unwrap_or("");
    let minimum = re(r"clamp\(\s*([0-9]+(?:\.[0-9]+)?)rem\s*,", 0)
        .match_at(display, 0)
        .and_then(|m| m[1].parse::<f64>().ok());
    if minimum.is_none_or(|m| m > 2.5) {
        failures.push("display type minimum must fit the 320px viewport".into());
    }
    failures
}

fn unicode_ranges(font_face: &str) -> Vec<(u32, u32)> {
    let Some(declaration) = re(r"\bunicode-range\s*:\s*([^;]+);", I).search(font_face) else {
        return vec![];
    };
    re(UNICODE_RANGE_PATTERN, I)
        .findall_groups(&declaration[1])
        .iter()
        .map(|g| {
            let first = u32::from_str_radix(&g[0], 16).unwrap_or(0);
            let last = if g[1].is_empty() {
                first
            } else {
                u32::from_str_radix(&g[1], 16).unwrap_or(0)
            };
            (first, last)
        })
        .collect()
}

/// `sorted(directory.rglob("*<suffix>"))`, read as text.
fn rglob_text(directory: &Path, suffix: &str) -> Result<Vec<String>, String> {
    fn walk(directory: &Path, suffix: &str, found: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(directory) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if crate::glob_suffix(&name, suffix) {
                found.push(path.clone());
            }
            let linked = entry.file_type().is_ok_and(|t| t.is_symlink());
            if path.is_dir() && !linked {
                walk(&path, suffix, found);
            }
        }
    }
    let mut found = Vec::new();
    walk(directory, suffix, &mut found);
    crate::sort_paths(&mut found);
    found.iter().map(|p| crate::read(p)).collect()
}

pub fn check_font_delivery(root: &Path, tokens_css: &str) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let faces = re(FONT_FACE_PATTERN, S | I).findall(tokens_css);
    let mut rendered_text = Vec::new();
    let mut uses_symbol_font = false;
    for path in core::html_files(root) {
        let raw = crate::read(&path)?;
        uses_symbol_font = uses_symbol_font || raw.contains(LAMBDA_MARKUP);
        rendered_text.push(core::raw_text(&raw.replace(LAMBDA_MARKUP, "")));
        rendered_text.extend(script_contents(&raw));
    }
    if uses_symbol_font {
        if !re(
            r#"--font-symbol:\s*"Cambria Math",\s*"STIX Two Math",\s*"DejaVu Serif",\s*serif;"#,
            0,
        )
        .is_match(tokens_css)
        {
            failures.push("lambda fallback must retain the native maths font stack".into());
        }
        let site_css = crate::read(&root.join("assets").join("site.css"))?;
        if !re(
            r"\.function-symbol\s*\{\s*font-family:\s*var\(--font-symbol\);\s*\}",
            0,
        )
        .is_match(&site_css)
        {
            failures.push("lambda markup must use the symbol font".into());
        }
    }
    rendered_text.extend(rglob_text(&root.join("assets"), ".mjs")?);
    let visible = rendered_text.join(" ");
    let mut required: Vec<u32> = visible
        .chars()
        .map(|c| c as u32)
        .filter(|c| *c > 31)
        .collect();
    required.sort_unstable();
    required.dedup();
    for (index, face) in faces.iter().enumerate() {
        let ranges = unicode_ranges(face);
        if ranges.is_empty() {
            failures.push(format!(
                "font face {} must declare unicode-range",
                index + 1
            ));
            continue;
        }
        if let Some(missing) = required
            .iter()
            .find(|cp| !ranges.iter().any(|(start, end)| start <= *cp && *cp <= end))
        {
            failures.push(format!(
                "font face {} does not cover visible U+{missing:04X}",
                index + 1
            ));
        }
    }
    let mut declared: Vec<String> = re(FONT_URL_PATTERN, 0)
        .findall(tokens_css)
        .iter()
        .map(|u| u.strip_prefix('/').unwrap_or(u).to_owned())
        .collect();
    declared.sort();
    declared.dedup();
    let mut total = 0;
    for rel in &declared {
        let path = site_path(root, rel);
        if !path.is_file() {
            continue;
        }
        let size = std::fs::metadata(&path)
            .map_err(|e| py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Native))?
            .len();
        total += size;
        if size > MAX_FONT_BYTES {
            failures.push(format!(
                "font exceeds {MAX_FONT_BYTES}-byte delivery budget: {rel}"
            ));
        }
    }
    if total > MAX_TOTAL_FONT_BYTES {
        failures.push(format!(
            "declared fonts total {total} bytes, over {MAX_TOTAL_FONT_BYTES}-byte budget"
        ));
    }
    Ok(failures)
}

/// `baseline.get(key, {})` iterated: a dict's keys, a list's items or a string's characters.
fn baseline_keys(baseline: &Json, key: &str) -> Result<Vec<Json>, String> {
    Ok(match baseline.get(key) {
        None => vec![],
        Some(Json::Object(pairs)) => pairs.iter().map(|(k, _)| Json::Str(k.clone())).collect(),
        Some(Json::Array(items)) => items.clone(),
        Some(Json::Str(text)) => text.chars().map(|c| Json::Str(c.to_string())).collect(),
        Some(other) => {
            return Err(format!(
                "TypeError: '{}' object is not iterable",
                type_name(other)
            ));
        }
    })
}

/// `baseline.get(key, {}).items()`.
fn baseline_items(baseline: &Json, key: &str) -> Result<Vec<(String, Json)>, String> {
    match baseline.get(key) {
        None => Ok(vec![]),
        Some(Json::Object(pairs)) => Ok(pairs.clone()),
        Some(other) => Err(format!(
            "AttributeError: '{}' object has no attribute 'items'",
            type_name(other)
        )),
    }
}

pub fn check_stylesheets(root: &Path, baseline: &Json) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let site_file = root.join("assets").join("site.css");
    let tokens_path = root.join("assets").join("tokens.css");
    if !site_file.is_file() {
        return Ok(vec!["stylesheet missing: assets/site.css".into()]);
    }
    if !tokens_path.is_file() {
        return Ok(vec!["stylesheet missing: assets/tokens.css".into()]);
    }
    let site_css = crate::read(&site_file)?;
    let tokens_css = crate::read(&tokens_path)?;
    if re(r"@import\b", I).is_match(&site_css) {
        failures.push("assets/site.css: token import creates a serial request chain".into());
    }
    let combined = format!("{site_css}\n{tokens_css}").to_lowercase();
    let without_view_mode = re(r"(?m)^\.view-mode\s*\{[^}]*\}", 0).sub("", &combined);
    for pattern in BANNED_CSS_PATTERNS {
        let checked = if pattern == "backdrop-filter" || pattern == "box-shadow" {
            &without_view_mode
        } else {
            &combined
        };
        if checked.contains(pattern) {
            failures.push(format!("banned CSS pattern {pattern}"));
        }
    }
    let mut colours = re(RAW_COLOUR_PATTERN, I).findall(&site_css.to_lowercase());
    colours.sort();
    colours.dedup();
    for colour in colours {
        failures.push(format!("raw colour outside assets/tokens.css: {colour}"));
    }
    if !re(r"\bbody\s*\{[^}]*\boverflow-wrap\s*:\s*anywhere\s*;", S | I).is_match(&site_css) {
        failures.push("body must wrap unbroken identifiers at the 320px boundary".into());
    }
    let transitions = re(r"\btransition\s*:\s*(.*?);", S | I).findall(&site_css);
    if transitions.is_empty()
        || transitions
            .iter()
            .any(|t| !t.contains("var(--motion-standard)"))
    {
        failures.push("links and controls must use the standard motion duration".into());
    }
    if !re(
        r"button:active\s*\{[^}]*\btranslate\s*:\s*0\s+1px\s*;",
        S | I,
    )
    .is_match(&site_css)
    {
        failures.push("buttons must move by one pixel on press".into());
    }
    let rule = |pattern: &str| {
        re(pattern, S | I)
            .search(&site_css)
            .map(|m| m[1].to_owned())
    };
    if !rule(r"\.byline\s*\{(.*?)\}").is_some_and(|r| r.contains("--colour-rule-strong")) {
        failures.push("bylines must use the neutral register rule".into());
    }
    if !rule(r"\.route-note\s*\{(.*?)\}").is_some_and(|r| r.contains("--colour-rule-strong")) {
        failures.push("informational route notes must use the neutral register rule".into());
    }
    if !rule(r"\.route-note\.boundary\s*\{(.*?)\}").is_some_and(|r| r.contains("--colour-alert")) {
        failures.push("boundary route notes must retain the alert rule".into());
    }
    let uncommented = re(r"/\*.*?\*/", S).sub("", &site_css);
    for groups in re(r"([^{}]+)\{([^{}]*)\}", 0).findall_groups(&uncommented) {
        let (selector, body) = (&groups[0], &groups[1]);
        let spacing = re(r"letter-spacing\s*:\s*([^;]+);", I)
            .search(body)
            .map(|m| py::strip(&m[1]).to_owned());
        if re(r"text-transform\s*:\s*uppercase", I).is_match(body)
            && let Some(spacing) = spacing
            && spacing != "0"
            && spacing != "normal"
            && !spacing.starts_with('-')
            && !selector.contains(".site-footer__motto-mark")
        {
            failures.push(format!(
                "tracked capital label: {}",
                py::split_whitespace(selector).join(" ")
            ));
        }
    }
    for (index, face) in re(FONT_FACE_PATTERN, S | I)
        .findall(&tokens_css)
        .iter()
        .enumerate()
    {
        let number = index + 1;
        if !re(r"\bfont-display\s*:\s*optional\s*;", I).is_match(face) {
            failures.push(format!(
                "font face {number} must use font-display: optional"
            ));
        }
        let sources = re(SOURCE_URL_PATTERN, I).findall(face);
        if sources.len() != 1
            || !sources[0].starts_with("/assets/fonts/")
            || !sources[0].ends_with(".woff2")
            || re(r"\blocal\s*\(", I).is_match(face)
        {
            failures.push(format!(
                "font face {number} must use one protected local WOFF2 source"
            ));
        }
    }
    let route_rules = re(r"\.route-section\s*\{(.*?)\}", S | I).findall(&site_css);
    if route_rules.iter().any(|r| {
        re(
            r"\bmin-height\s*:\s*[^;]*(?:var\(--route-min-height\)|[sd]?vh)",
            I,
        )
        .is_match(r)
    }) {
        failures.push("route sections must not use viewport-based minimum heights".into());
    }
    let label_rules =
        re(r"\.route-section\s*>\s*\.route-label\s*\{(.*?)\}", S | I).findall(&site_css);
    if label_rules
        .iter()
        .any(|r| re(r"\bposition\s*:\s*sticky\s*;", I).is_match(r))
    {
        failures.push("route labels must not be sticky".into());
    }
    let min_width = |r: &str| re(r"\bmin-width\s*:\s*0\s*;", I).is_match(r);
    if !rule(r"\.route-content\s*\{(.*?)\}").is_some_and(|r| min_width(&r)) {
        failures
            .push("route content must allow internal overflow without widening the page".into());
    }
    for selector in ["route-actions", "install-band"] {
        let rules = re(&format!(r"\.{selector}\s*\{{(.*?)\}}"), S | I).findall(&site_css);
        if !rules.iter().any(|r| min_width(r)) {
            failures.push("route action groups must contain intrinsic-width content".into());
            break;
        }
    }
    let figure_rules = re(r"\.proof-feature\s+figure\s*\{(.*?)\}", S | I).findall(&site_css);
    if !figure_rules
        .iter()
        .any(|r| min_width(r) && re(r"\bmargin-inline\s*:\s*0\s*;", I).is_match(r))
    {
        failures.push("proof media must not widen the fallback viewport".into());
    }
    let mut declared: Vec<String> = re(FONT_URL_PATTERN, 0)
        .findall(&tokens_css)
        .iter()
        .map(|u| u.strip_prefix('/').unwrap_or(u).to_owned())
        .collect();
    declared.sort();
    declared.dedup();
    for rel in &declared {
        if !site_path(root, rel).is_file() {
            failures.push(format!("font face target missing: {rel}"));
        }
    }
    let mut expected: Vec<String> = baseline_keys(baseline, "fonts")?
        .into_iter()
        .filter_map(|k| match k {
            Json::Str(s) if s.ends_with(".woff2") => Some(s),
            _ => None,
        })
        .collect();
    expected.sort();
    expected.dedup();
    for rel in expected.iter().filter(|r| !declared.contains(r)) {
        failures.push(format!("protected font not declared in tokens: {rel}"));
    }
    for rel in declared.iter().filter(|r| !expected.contains(r)) {
        failures.push(format!("unprotected font declared: {rel}"));
    }
    failures.extend(check_oled_tokens(&tokens_css));
    Ok(failures)
}

fn json_ld_strings(value: &Json, found: &mut Vec<String>) {
    match value {
        Json::Str(s) => found.push(s.clone()),
        Json::Object(pairs) => pairs.iter().for_each(|(_, v)| json_ld_strings(v, found)),
        Json::Array(items) => items.iter().for_each(|v| json_ld_strings(v, found)),
        _ => {}
    }
}

/// The text a reader or an agent takes from one page, by surface.
fn copy_surfaces(raw_html: &str, rel: &str) -> Vec<(&'static str, String)> {
    let meta = re(META_CONTENT_PATTERN, I)
        .findall(raw_html)
        .iter()
        .map(|v| unescape(v))
        .collect::<Vec<_>>()
        .join(" ");
    let mut strings = Vec::new();
    for block in core::json_ld_blocks(raw_html, rel, &mut Vec::new()) {
        json_ld_strings(&block, &mut strings);
    }
    vec![
        ("visible", core::raw_text(raw_html)),
        ("meta", meta),
        ("JSON-LD", strings.join(" ")),
    ]
}

/// The combined banned-phrase search, run on an ASCII image of the text.
///
/// Every atom of the banned patterns is an ASCII letter (which `re.IGNORECASE` also
/// matches as İ, ı, ſ or K), a space, hyphen or apostrophe, the typographic apostrophe,
/// or `\b`. Mapping those four letters and the apostrophe to ASCII, and every other
/// non-ASCII character to `_` or a space by Python's `\w`, keeps each match and each
/// word boundary, so the regex crate's ASCII engines can run. A hit is then confirmed
/// pattern by pattern with the exact Python semantics, as the script does.
fn banned_screen(text: &str) -> bool {
    static SCREEN: LazyLock<regex::Regex> = LazyLock::new(|| {
        let combined = BANNED_VISIBLE_PATTERNS
            .iter()
            .map(|(_, p)| format!("(?:{})", p.replace(r"\b", r"(?-u:\b)")))
            .collect::<Vec<_>>()
            .join("|");
        regex::Regex::new(&format!("(?i){combined}")).expect("banned patterns")
    });
    let image: String = text
        .chars()
        .map(|c| match c {
            _ if c.is_ascii() => c,
            '\u{130}' | '\u{131}' => 'i',
            '\u{17f}' => 's',
            '\u{212a}' => 'k',
            '\u{2019}' => '\'',
            _ if py::is_word(c) => '_',
            _ => ' ',
        })
        .collect();
    SCREEN.is_match(&image)
}

/// Reject marketing and machine-written vocabulary on every published page.
pub fn check_copy(root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let mut documents = Vec::new();
    for path in core::html_files(root) {
        let rel = core::rel(&path, root);
        let surfaces = copy_surfaces(&crate::read(&path)?, &rel);
        documents.push((rel, surfaces));
    }
    for rel in COPY_TEXT_FILES {
        let path = site_path(root, rel);
        if !path.is_file() {
            failures.push(format!("copy page missing: {rel}"));
            continue;
        }
        documents.push((rel.to_owned(), vec![("text", crate::read(&path)?)]));
    }
    for (rel, surfaces) in documents {
        for (surface, text) in surfaces {
            if banned_screen(&text) {
                for (label, pattern) in BANNED_VISIBLE_PATTERNS {
                    if re(pattern, I).is_match(&text) {
                        failures.push(format!(
                            "{rel}: banned {surface} phrase {}",
                            py::repr_str(label)
                        ));
                    }
                }
            }
            if surface == "visible" && re(EMOJI_PATTERN, 0).is_match(&text) {
                failures.push(format!("{rel}: decorative emoji is not permitted"));
            }
        }
    }
    Ok(failures)
}

/// Keep visible opening review dates aligned with structured freshness.
pub fn check_opening_review_dates(root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    for (rel, context_class) in OPENING_REVIEW_DATE_CONTEXTS {
        let path = site_path(root, rel);
        if !path.is_file() {
            failures.push(format!("{rel}: missing page for opening review-date check"));
            continue;
        }
        let raw = crate::read(&path)?;
        let tree = core::parse_structure(&raw);
        let rendered = tree.descendants(core::Tree::ROOT, None, true);
        let contexts: Vec<usize> = rendered
            .iter()
            .copied()
            .filter(|e| tree.has_class(*e, context_class))
            .collect();
        let dates: Vec<usize> = rendered
            .iter()
            .copied()
            .filter(|e| tree.has_class(*e, "page-meta"))
            .collect();
        if contexts.len() != 1 || dates.len() != 1 || !tree.is_descendant(dates[0], contexts[0]) {
            failures.push(format!(
                "{rel}: expected exactly one opening page-meta inside .{context_class}"
            ));
            continue;
        }
        let label = tree.text(dates[0]);
        // Pattern.fullmatch: anchored at both ends, $ cannot stop before a final newline.
        let visible = re(
            &format!(
                r"\A(?:{})\Z",
                &OPENING_REVIEW_DATE_PATTERN[1..OPENING_REVIEW_DATE_PATTERN.len() - 1]
            ),
            0,
        )
        .search(&label)
        .map(|m| m["date"].to_owned());
        let Some(visible) = visible else {
            failures.push(format!(
                "{rel}: opening page-meta must use 'Last reviewed D Month YYYY.'"
            ));
            continue;
        };
        let Some(visible_date) = pytime::strptime_day_month_year(&visible) else {
            failures.push(format!("{rel}: opening page-meta contains an invalid date"));
            continue;
        };
        let blocks = core::json_ld_blocks(&raw, rel, &mut failures);
        let modified: Vec<&Json> = blocks
            .iter()
            .flat_map(core::nodes)
            .filter_map(|n| n.get("dateModified"))
            .collect();
        let structured = match modified.as_slice() {
            [Json::Str(value)] => value.clone(),
            _ => {
                failures.push(format!("{rel}: expected exactly one JSON-LD dateModified"));
                continue;
            }
        };
        let Some(structured_date) = py::Date::fromisoformat(&structured) else {
            failures.push(format!("{rel}: JSON-LD dateModified must be an ISO date"));
            continue;
        };
        if visible_date != structured_date {
            failures.push(format!(
                "{rel}: opening review date {} does not match JSON-LD dateModified {}",
                visible_date.isoformat(),
                structured_date.isoformat()
            ));
        }
    }
    Ok(failures)
}

fn class_count(raw_html: &str, class_name: &str) -> usize {
    let wanted = py::casefold(class_name);
    re(r#"class\s*=\s*(["\'])(.*?)\1"#, I | S)
        .findall_groups(raw_html)
        .iter()
        .filter(|g| py::split_whitespace(&py::casefold(&g[1])).contains(&wanted.as_str()))
        .count()
}

pub fn check_homepage_refinement(root: &Path) -> Result<Vec<String>, String> {
    let path = root.join("index.html");
    if !path.is_file() {
        return Ok(vec!["index.html: homepage missing".into()]);
    }
    let raw = crate::read(&path)?;
    let regions = re(MAIN_PATTERN, S | I).findall(&raw);
    if regions.len() != 1 {
        return Ok(vec!["index.html: expected one main region".into()]);
    }
    let main = active_markup(&regions[0]);
    let links: Vec<String> = re(MAIN_LINK_PATTERN, S | I)
        .findall_groups(&main)
        .iter()
        .map(|g| unescape(&g[1]))
        .collect();
    let actions = re(HERO_ACTIONS_PATTERN, I | S).findall(&main);
    let action_links = if actions.len() == 1 {
        re(MAIN_LINK_PATTERN, S | I)
            .findall_groups(&actions[0])
            .len()
    } else {
        0
    };
    let mut failures = Vec::new();
    if links.iter().filter(|l| *l == "/tools/").count() != 1 {
        failures.push("index.html: expected exactly one /tools/ homepage action".into());
    }
    if action_links != 1 {
        failures.push("index.html: expected exactly one action in home-hero__actions".into());
    }
    for identifier in HOMEPAGE_ANCHOR_IDS {
        let count = re(
            &format!(r#"\bid\s*=\s*(["\']){}\1"#, pyre::escape(identifier)),
            I,
        )
        .findall_groups(&main)
        .len();
        if count != 1 {
            failures.push(format!(
                "index.html: expected exactly one valid #{identifier} anchor"
            ));
        }
    }
    for class_name in HOMEPAGE_REQUIRED_CLASSES {
        if class_count(&main, class_name) != 1 {
            failures.push(format!("index.html: expected one {class_name}"));
        }
    }
    if !re(HERO_PREVIEW_ADJACENCY_PATTERN, I | S).is_match(&main) {
        failures.push("index.html: tool preview must follow home hero".into());
    }
    if class_count(&main, "technical-label") != 1 {
        failures.push("index.html: expected exactly one evidence-bearing technical label".into());
    }
    let label_pattern = re(
        concat!(
            r#"<p\b(?=[^>]*class\s*=\s*(["\'])[^"\']*\btechnical-label\b"#,
            r#"[^"\']*\1)[^>]*>(.*?)</p>"#
        ),
        I | S,
    );
    for groups in label_pattern.findall_groups(&main) {
        let label = core::raw_text(&groups[1]);
        if re(r"^(?:0[1-3]|[A-D])\s*/", 0)
            .match_at(&label, 0)
            .is_some()
            || re(r"/\s*0?5$", 0).is_match(&label)
        {
            failures.push(format!(
                "index.html: decorative ordinal technical label: {label}"
            ));
        }
    }
    Ok(failures)
}

/// The quoted release-date version shared by the rendered CSS links.
pub fn stylesheet_links(root: &Path) -> Result<Result<(String, String), String>, String> {
    let config = root.join(JEKYLL_CONFIG);
    if !config.is_file() {
        return Ok(Err(format!(
            "{JEKYLL_CONFIG}: asset_version configuration is missing"
        )));
    }
    let lines = re(r"^asset_version:.*$", M).findall(&crate::read(&config)?);
    let found = (lines.len() == 1)
        .then(|| {
            re(r#"\A(?:asset_version: (["'])([0-9]{8}[a-z]*)\1)\Z"#, 0)
                .search(&lines[0])
                .map(|m| m[2].to_owned())
        })
        .flatten();
    let Some(version) = found else {
        return Ok(Err(format!(
            "{JEKYLL_CONFIG}: expected one quoted asset_version as YYYYMMDD with an optional lowercase suffix"
        )));
    };
    if pytime::strptime_compact(&version[..8]).is_none() {
        return Ok(Err(format!(
            "{JEKYLL_CONFIG}: asset_version must start with a valid date"
        )));
    }
    Ok(Ok((
        format!("<link rel=\"stylesheet\" href=\"/assets/tokens.css?v={version}\" />"),
        format!("<link rel=\"stylesheet\" href=\"/assets/site.css?v={version}\" />"),
    )))
}

/// `Path(rel).with_suffix(".txt").as_posix()`.
fn text_alternate(rel: &str) -> Result<String, String> {
    let normalised = if cfg!(windows) {
        rel.replace('\\', "/")
    } else {
        rel.to_owned()
    };
    // pathlib drops empty and "." parts; a leading slash makes the path absolute.
    // shortcut: Windows drive and UNC forms are not given special parsing here.
    let parts: Vec<&str> = normalised
        .split('/')
        .filter(|p| !p.is_empty() && *p != ".")
        .collect();
    let Some((name, parents)) = parts.split_last() else {
        return Err(format!(
            "ValueError: PosixPath({}) has an empty name",
            py::repr_str(if normalised.starts_with('/') {
                "/"
            } else {
                "."
            })
        ));
    };
    let stem = &name[..name.len() - suffix(name).len()];
    let mut out = if normalised.starts_with('/') {
        "/".to_owned()
    } else {
        String::new()
    };
    for parent in parents {
        out.push_str(parent);
        out.push('/');
    }
    out.push_str(stem);
    out.push_str(".txt");
    Ok(out)
}

fn find(haystack: &str, needle: &str) -> i64 {
    haystack.find(needle).map_or(-1, |i| i as i64)
}

pub fn check_document_delivery(root: &Path, baseline: &Json) -> Result<Vec<String>, String> {
    let (tokens_link, site_link) = match stylesheet_links(root)? {
        Ok(links) => links,
        Err(message) => return Ok(vec![message]),
    };
    let mut failures = Vec::new();
    let mut indexable: Vec<String> = Vec::new();
    for key in baseline_keys(baseline, "json_ld")? {
        match key {
            Json::Str(s) => indexable.push(s),
            other => {
                return Err(format!(
                    "TypeError: unhashable type: '{}'",
                    type_name(&other)
                ));
            }
        }
    }
    let mut styled = indexable.clone();
    styled.push("404.html".into());
    styled.sort();
    styled.dedup();
    let csp = CSP_META.to_owned();
    let calculator_csp = calculator_csp_meta();
    for rel in &styled {
        let path = site_path(root, rel);
        if !path.is_file() {
            failures.push(format!("styled page missing: {rel}"));
            continue;
        }
        let raw = crate::read(&path)?;
        let heads = re(HEAD_PATTERN, S | I).findall(&raw);
        let footers = re(FOOTER_PATTERN, S | I).findall(&raw);
        let head = if heads.len() == 1 {
            active_markup(&heads[0])
        } else {
            String::new()
        };
        let footer = if footers.len() == 1 {
            active_markup(&footers[0])
        } else {
            String::new()
        };
        let count = |text: &str, needle: &str| text.matches(needle).count();
        let token_at = find(&head, &tokens_link);
        let site_at = find(&head, &site_link);
        if count(&raw, &tokens_link) != 1
            || count(&raw, &site_link) != 1
            || count(&head, &tokens_link) != 1
            || count(&head, &site_link) != 1
            || token_at > site_at
        {
            failures.push(format!(
                "{rel}: expected one tokens stylesheet before site stylesheet"
            ));
        }
        if raw.contains("/assets/accounting-pages.css")
            && (count(&raw, ACCOUNTING_LINK) != 1 || count(&head, ACCOUNTING_LINK) != 1)
        {
            failures.push(format!(
                "{rel}: expected one versioned accounting stylesheet: {ACCOUNTING_LINK}"
            ));
        }
        if count(&raw, LLMS_VISIBLE) != 1 || count(&footer, LLMS_VISIBLE) != 1 {
            failures.push(format!(
                "{rel}: expected one visible machine-readable index link"
            ));
        }
        if indexable.contains(rel) {
            let alternate = format!(
                "<link rel=\"alternate\" type=\"text/plain\" href=\"https://duguid.com.au/{}\" />",
                text_alternate(rel)?
            );
            if count(&raw, &alternate) != 1 || count(&head, &alternate) != 1 {
                failures.push(format!(
                    "{rel}: expected one page-specific plain-text alternate link"
                ));
            }
        }
        let meta = if rel == "tools/coal-lsl-levy/index.html" {
            &calculator_csp
        } else {
            &csp
        };
        if count(&raw, meta) != 1 || count(&head, meta) != 1 {
            failures.push(format!(
                "{rel}: expected one Content Security Policy meta tag"
            ));
        }
        for link in GOOGLE_FAVICON_LINKS {
            if count(&raw, link) != 1 || count(&head, link) != 1 {
                failures.push(format!("{rel}: expected one favicon link: {link}"));
            }
        }
        for face in FONT_FACES {
            let preload = font_preload(face);
            let at = find(&head, &preload);
            if count(&raw, &preload) != 1 || at < 0 || at > token_at {
                failures.push(format!(
                    "{rel}: expected the {face} preload before the tokens stylesheet"
                ));
            }
        }
        for attributes in re(SCRIPT_OPEN_PATTERN, I).findall(&raw) {
            if re(r"\bsrc\s*=", I).is_match(&attributes)
                || re(JSON_LD_TYPE_PATTERN, I).is_match(&attributes)
            {
                continue;
            }
            failures.push(format!("{rel}: must not carry inline script"));
            break;
        }
    }
    let homepage_path = root.join("index.html");
    if !homepage_path.is_file() {
        return Ok(failures);
    }
    let homepage = crate::read(&homepage_path)?;
    match re(PROOF_IMAGE_PATTERN, I).search(&homepage) {
        None => failures.push("index.html: Coal LSL proof image is missing".into()),
        Some(m) => {
            let image = m[0].to_owned();
            for (marker, message) in [
                ("loading=\"lazy\"".to_owned(), "load lazily"),
                ("decoding=\"async\"".to_owned(), "decode asynchronously"),
                (format!("width=\"{PROOF_WIDTH}\""), "keep its width"),
                (format!("height=\"{PROOF_HEIGHT}\""), "keep its height"),
            ] {
                if !image.contains(&marker) {
                    failures.push(format!("index.html: Coal LSL proof image must {message}"));
                }
            }
            let alt = re(r#"\balt\s*=\s*(["\'])(.*?)\1"#, I | S)
                .search(&image)
                .map(|m| m[2].to_owned());
            if alt.is_none_or(|a| py::char_len(&core::raw_text(&a)) < 12) {
                failures
                    .push("index.html: Coal LSL proof image must have descriptive alt text".into());
            }
        }
    }
    if !homepage.contains(PROOF_MOBILE_SOURCE) {
        failures.push("index.html: Coal LSL proof picture must offer the mobile source".into());
    }
    for asset in [PROOF_ASSET, PROOF_MOBILE_ASSET] {
        let path = site_path(root, asset);
        if !path.is_file() {
            failures.push(format!("{asset}: proof image is missing"));
            continue;
        }
        let proof = read_bytes(&path)?;
        if proof.get(..4) != Some(b"RIFF".as_slice())
            || proof.get(8..12) != Some(b"WEBP".as_slice())
        {
            failures.push(format!("{asset}: proof image is not a WebP container"));
        }
        if proof.len() > MAX_PROOF_BYTES {
            failures.push(format!(
                "{asset}: proof image exceeds {MAX_PROOF_BYTES} bytes"
            ));
        }
    }
    Ok(failures)
}

/// Keep the RFC 9116 contact file present, current and published.
pub fn check_security_txt(root: &Path) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    let path = site_path(root, SECURITY_TXT);
    if !path.is_file() {
        failures.push(format!("{SECURITY_TXT}: security.txt missing"));
    } else {
        let text = crate::read(&path)?;
        if !re(r"^Contact:\s*\S+", M).is_match(&text) {
            failures.push(format!("{SECURITY_TXT}: must name at least one Contact"));
        }
        let expires = re(r"^Expires:\s*(\S+)", M).findall(&text);
        if expires.len() != 1 {
            failures.push(format!(
                "{SECURITY_TXT}: must carry exactly one Expires field"
            ));
        } else {
            match pytime::datetime_fromisoformat(&expires[0].replace('Z', "+00:00")) {
                None => failures.push(format!(
                    "{SECURITY_TXT}: Expires must be an RFC 3339 timestamp"
                )),
                Some(when) => match when.utc_micros() {
                    None => failures.push(format!("{SECURITY_TXT}: Expires must carry a timezone")),
                    Some(instant) if instant <= pytime::now_utc_micros() => failures.push(format!(
                        "{SECURITY_TXT}: Expires has passed; refresh the file"
                    )),
                    Some(_) => {}
                },
            }
        }
        if !text.contains(&format!("Canonical: {SECURITY_TXT_CANONICAL}")) {
            failures.push(format!("{SECURITY_TXT}: must name its canonical URL"));
        }
    }
    let config = root.join(JEKYLL_CONFIG);
    let published =
        config.is_file() && re(r"^\s*-\s*\.well-known\s*$", M).is_match(&crate::read(&config)?);
    if !published {
        failures.push(format!(
            "{JEKYLL_CONFIG}: must include .well-known so Pages publishes security.txt"
        ));
    }
    Ok(failures)
}

fn load_baseline(root: &Path) -> Result<Option<Json>, String> {
    let path = root.join("scripts").join("design_baseline.json");
    if !path.is_file() {
        return Ok(None);
    }
    pyjson::loads(&crate::read(&path)?)
        .map(Some)
        .map_err(|e| format!("json.decoder.JSONDecodeError: {e}"))
}

pub fn check_repository(root: &Path) -> Result<Vec<String>, String> {
    let Some(baseline) = load_baseline(root)? else {
        return Ok(vec![
            "design baseline missing: scripts/design_baseline.json".into(),
        ]);
    };
    if !matches!(baseline, Json::Object(_)) {
        return Err(format!(
            "AttributeError: '{}' object has no attribute 'get'",
            type_name(&baseline)
        ));
    }
    let mut failures = Vec::new();
    for (rel, expected) in baseline_items(&baseline, "protected_files")? {
        let path = site_path(root, &rel);
        if !path.is_file() {
            failures.push(format!("protected file missing: {rel}"));
        } else if !Json::Str(normalised_text_digest(&path)?).py_eq(&expected) {
            failures.push(format!("protected file changed: {rel}"));
        }
    }
    for (rel, expected) in baseline_items(&baseline, "protected_main_text")? {
        let path = site_path(root, &rel);
        if !path.is_file() {
            failures.push(format!("protected main page missing: {rel}"));
            continue;
        }
        match main_visible_digest(&path)? {
            None => failures.push(format!("protected main missing or duplicated: {rel}")),
            Some(actual) if !Json::Str(actual.clone()).py_eq(&expected) => {
                failures.push(format!("protected main text changed: {rel}"));
            }
            Some(_) => {}
        }
    }
    for (rel, expected) in baseline_items(&baseline, "protected_main_links")? {
        let path = site_path(root, &rel);
        if !path.is_file() {
            failures.push(format!("protected main page missing: {rel}"));
            continue;
        }
        match main_link_targets(&path)? {
            None => failures.push(format!("protected main missing or duplicated: {rel}")),
            Some(links)
                if !Json::Array(links.iter().cloned().map(Json::Str).collect())
                    .py_eq(&expected) =>
            {
                failures.push(format!("protected main links changed: {rel}"));
            }
            Some(_) => {}
        }
    }
    for (rel, expected) in baseline_items(&baseline, "json_ld")? {
        let path = site_path(root, &rel);
        if !path.is_file() {
            failures.push(format!("JSON-LD page missing: {rel}"));
            continue;
        }
        let (digests, parse_failures) = json_ld_digests(&path)?;
        failures.extend(parse_failures);
        if !Json::Array(digests.into_iter().map(Json::Str).collect()).py_eq(&expected) {
            failures.push(format!("JSON-LD changed: {rel}"));
        }
    }
    let mut texts = Vec::new();
    for path in core::html_files(root) {
        texts.push(core::raw_text(&crate::read(&path)?));
    }
    let html_text = texts.join("\n");
    for (protected, expected) in baseline_items(&baseline, "protected_text")? {
        let actual = html_text.matches(protected.as_str()).count();
        let actual_json = Json::Int(num_bigint::BigInt::from(actual));
        if !actual_json.py_eq(&expected) {
            failures.push(format!(
                "protected text count changed: expected {}, found {actual}: {protected}",
                expected.py_str()
            ));
        }
    }
    for (rel, expected) in baseline_items(&baseline, "fonts")? {
        let path = site_path(root, &rel);
        if !path.is_file() {
            failures.push(format!("protected font missing: {rel}"));
        } else if !Json::Str(protected_asset_digest(&path)?).py_eq(&expected) {
            failures.push(format!("protected font changed: {rel}"));
        }
    }
    failures.extend(check_document_delivery(root, &baseline)?);
    failures.extend(check_security_txt(root)?);
    failures.extend(check_favicon(root)?);
    failures.extend(check_favicon_assets(root)?);
    failures.extend(check_stylesheets(root, &baseline)?);
    let tokens_path = root.join("assets").join("tokens.css");
    if tokens_path.is_file() {
        failures.extend(check_font_delivery(root, &crate::read(&tokens_path)?)?);
    }
    failures.extend(check_homepage_refinement(root)?);
    failures.extend(check_copy(root)?);
    failures.extend(check_opening_review_dates(root)?);
    Ok(failures)
}

/// Why update_baseline stopped: SystemExit with a message, or an error Python would raise.
pub enum UpdateError {
    Exit(String),
    Raised(String),
}

impl From<String> for UpdateError {
    fn from(error: String) -> Self {
        UpdateError::Raised(error)
    }
}

/// Re-derive every digest in the design baseline from the current tree.
pub fn update_baseline(root: &Path) -> Result<PathBuf, UpdateError> {
    let path = root.join("scripts").join("design_baseline.json");
    let mut baseline = pyjson::loads(&crate::read(&path)?)
        .map_err(|e| format!("json.decoder.JSONDecodeError: {e}"))?;
    let Json::Object(sections) = &mut baseline else {
        return Err(format!(
            "AttributeError: '{}' object has no attribute 'get'",
            type_name(&baseline)
        )
        .into());
    };
    // Python updates the four digest sections in this order, whatever the file's order.
    for key in [
        "protected_files",
        "protected_main_text",
        "protected_main_links",
        "json_ld",
    ] {
        let Some((_, value)) = sections.iter_mut().find(|(k, _)| k == key) else {
            continue;
        };
        let Json::Object(entries) = value else {
            return Err(format!("TypeError: section {key} is not a dict").into());
        };
        for (rel, entry) in entries.iter_mut() {
            let file = site_path(root, rel);
            *entry = match key {
                "protected_files" => Json::Str(normalised_text_digest(&file)?),
                "protected_main_text" => match main_visible_digest(&file)? {
                    Some(value) => Json::Str(value),
                    None => {
                        return Err(UpdateError::Exit(format!(
                            "{rel}: main missing or duplicated; baseline not written"
                        )));
                    }
                },
                "protected_main_links" => match main_link_targets(&file)? {
                    Some(value) => Json::Array(value.into_iter().map(Json::Str).collect()),
                    None => {
                        return Err(UpdateError::Exit(format!(
                            "{rel}: main missing or duplicated; baseline not written"
                        )));
                    }
                },
                _ => {
                    let (values, parse_failures) = json_ld_digests(&file)?;
                    if !parse_failures.is_empty() {
                        return Err(UpdateError::Exit(parse_failures.join("; ")));
                    }
                    Json::Array(values.into_iter().map(Json::Str).collect())
                }
            };
        }
    }
    refresh_page_entries(root, sections)?;
    let text = pyjson::dumps(
        &baseline,
        Dump {
            indent: Some(2),
            ensure_ascii: false,
            ..Default::default()
        },
    ) + "\n";
    // Path.write_text writes the platform's line ending.
    let text = if cfg!(windows) {
        text.replace('\n', "\r\n")
    } else {
        text
    };
    std::fs::write(&path, text)
        .map_err(|e| py::oserror_str(&e, &path.to_string_lossy(), py::OsStyle::Errno))?;
    Ok(path)
}

/// The rendered pages protected text is counted in: `_site` after a build, or
/// the root itself when it is already a rendered tree. Source pages hold the
/// shared footer only as an include, so they cannot be counted.
fn rendered_pages(root: &Path) -> Option<Vec<std::path::PathBuf>> {
    let built = root.join("_site");
    let tree = if built.is_dir() {
        built
    } else {
        root.to_path_buf()
    };
    let home = std::fs::read_to_string(tree.join("index.html")).ok()?;
    (!home.contains("{% include")).then(|| core::html_files(&tree))
}

/// Recount each protected text across the rendered pages, as the check counts
/// it, and pin the JSON-LD of any page that carries some but is not yet listed.
/// Without rendered pages the counts stay as they are.
fn refresh_page_entries(root: &Path, sections: &mut [(String, Json)]) -> Result<(), UpdateError> {
    let pages: Vec<_> = core::html_files(root)
        .into_iter()
        .filter(|path| !path.starts_with(root.join("scripts/target")))
        .collect();
    let mut texts = Vec::new();
    for path in rendered_pages(root).unwrap_or_default() {
        texts.push(core::raw_text(&crate::read(&path)?));
    }
    let html_text = texts.join("\n");
    if let Some((_, Json::Object(entries))) = sections
        .iter_mut()
        .find(|(k, _)| k == "protected_text")
        .filter(|_| !texts.is_empty())
    {
        for (protected, count) in entries.iter_mut() {
            *count = Json::Int(num_bigint::BigInt::from(
                html_text.matches(protected.as_str()).count(),
            ));
        }
    }
    if let Some((_, Json::Object(entries))) = sections.iter_mut().find(|(k, _)| k == "json_ld") {
        for path in &pages {
            let rel = core::rel(path, root);
            if entries.iter().any(|(k, _)| *k == rel) {
                continue;
            }
            let (values, parse_failures) = json_ld_digests(path)?;
            if !parse_failures.is_empty() {
                return Err(UpdateError::Exit(parse_failures.join("; ")));
            }
            if !values.is_empty() {
                let at = entries.partition_point(|(k, _)| k.as_str() < rel.as_str());
                entries.insert(
                    at,
                    (
                        rel,
                        Json::Array(values.into_iter().map(Json::Str).collect()),
                    ),
                );
            }
        }
    }
    Ok(())
}

pub fn run(root: &Path, args: &[String]) -> Result<u8, String> {
    let say =
        |text: &str| crate::print_text(&format!("{text}\n"), false).map_err(|e| e.to_string());
    if args.iter().any(|a| a == "--update-baseline") {
        return match update_baseline(root) {
            Ok(_) => {
                say("design baseline updated: scripts/design_baseline.json")?;
                Ok(0)
            }
            // SystemExit(message): the message on stderr and exit status 1.
            Err(UpdateError::Exit(message)) => {
                crate::print_text(&format!("{message}\n"), true).map_err(|e| e.to_string())?;
                Ok(1)
            }
            Err(UpdateError::Raised(error)) => Err(error),
        };
    }
    let failures = check_repository(root)?;
    if !failures.is_empty() {
        say("design contract failures:")?;
        for failure in failures {
            say(&format!("- {failure}"))?;
        }
        return Ok(1);
    }
    say("design contracts passed")?;
    Ok(0)
}
