// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The document head and the parts every generated page shares.
use super::address::shown_core;
use crate::html::escape;

pub const ORIGIN: &str = "https://duguid.com.au";
pub const CARD: &str = "https://duguid.com.au/assets/social-card-tools-20261104b.png";
const CARD_ALT: &str = "OLED register card: Accounting checks that show their working.";
const CSP: &str = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; \
    font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'";
const FONTS: [&str; 4] = [
    "Besley-SemiBold",
    "PublicSans-Regular",
    "SplineSansMono-Regular",
    "PublicSans-SemiBold",
];

/// The longest title the site's checks allow, in characters.
pub const TITLE_MAX: usize = 65;

/// Words a cut text may not end on: a title ending 'Iron smelting and' reads as broken,
/// and one ending 'Furniture, not' says the opposite of the row.
pub const DANGLING_WORDS: [&str; 26] = [
    "a",
    "an",
    "and",
    "as",
    "at",
    "being",
    "by",
    "except",
    "excluding",
    "for",
    "from",
    "in",
    "including",
    "incorporating",
    "not",
    "of",
    "on",
    "or",
    "other",
    "such",
    "than",
    "that",
    "the",
    "to",
    "used",
    "with",
];

/// The leading words of a text that fit in `max` characters, ending on neither
/// punctuation, an unclosed bracket nor a joining word. A first word longer than that is cut at its last '/'
/// that fits, or at `max` characters.
pub fn fit(text: &str, max: usize) -> String {
    let mut out = String::new();
    for word in text.split_whitespace() {
        let size = out.chars().count() + usize::from(!out.is_empty()) + word.chars().count();
        if size > max {
            if out.is_empty() {
                let cut: String = word.chars().take(max).collect();
                out = cut
                    .rfind('/')
                    .map_or(cut.clone(), |at| cut[..at].to_owned());
            }
            break;
        }
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(word);
    }
    loop {
        if out.matches('(').count() > out.matches(')').count()
            && let Some(open) = out.rfind('(')
            && !out[..open].trim().is_empty()
        {
            out.truncate(open);
            continue;
        }
        let trimmed = out.trim_end_matches([',', ';', ':', '/', ' ', '-', '\u{2013}']);
        let last = trimmed.rsplit(' ').next().unwrap_or("");
        if trimmed.len() < out.len() {
            out = trimmed.to_owned();
        } else if trimmed.contains(' ') && DANGLING_WORDS.contains(&last.to_lowercase().as_str()) {
            out.truncate(out.len() - last.len());
        } else {
            return out;
        }
    }
}

/// The text whole if it fits in `max` characters, else its leading words as `fit` cuts
/// them, closed by an ellipsis that shows the cut and counts towards `max`.
pub fn cut(text: &str, max: usize) -> String {
    let whole = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if whole.chars().count() <= max {
        return whole;
    }
    let kept = fit(&whole, max.saturating_sub(2));
    if kept.ends_with('\u{2026}') {
        kept
    } else {
        format!("{kept} \u{2026}").trim_start().to_owned()
    }
}

/// The closing words of a text that fit in `max` characters, after an ellipsis when
/// words were cut; the ellipsis counts towards `max`.
pub fn fit_end(text: &str, max: usize) -> String {
    let whole = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if whole.chars().count() <= max {
        return whole;
    }
    let mut kept: Vec<&str> = Vec::new();
    let mut size = 1;
    for word in text.split_whitespace().rev() {
        let next = size + usize::from(!kept.is_empty()) + word.chars().count();
        if next > max {
            break;
        }
        size = next;
        kept.push(word);
    }
    kept.reverse();
    format!("\u{2026}{}", kept.join(" "))
}

/// '<subject> effective life: <years><extra>', where `extra` is ', <heading>' or
/// ', <industry>'. The subject stays whole when it fits with at least the first whole
/// word of the extra. Else, first, the subject without its asides, if it fits, with as
/// much of the extra as keeps a whole word, or none; then the extra with up to half the
/// room left by the tail and the subject cut to the rest, as the extra may be what tells
/// the row apart. An ellipsis shows each cut but that of a closing aside.
pub fn titled(subject: &str, tail: &str, extra: &str, prefer_bare: bool) -> Vec<String> {
    let keep = TITLE_MAX.saturating_sub(tail.chars().count());
    let mut out = Vec::new();
    let size = subject.chars().count();
    if size + extra.chars().count() <= keep {
        if prefer_bare && size <= keep {
            out.push(format!("{subject}{tail}"));
        }
        out.push(format!("{subject}{tail}{extra}"));
        return out;
    }
    if prefer_bare && size <= keep {
        out.push(format!("{subject}{tail}"));
    }
    if let Some(title) = with_extra(subject, tail, extra, keep) {
        out.push(title);
        return out;
    }
    let core = shown_core(subject);
    let bare = core.trim_end_matches([' ', '\u{2026}']);
    let aside = closing_aside(subject, bare);
    let shown = if aside { bare } else { core.as_str() };
    if shown.chars().count() <= keep {
        if prefer_bare {
            out.push(format!("{shown}{tail}"));
        }
        if let Some(title) = with_extra(shown, tail, extra, keep) {
            out.push(title);
        } else if !prefer_bare {
            out.push(format!("{shown}{tail}"));
        }
    }
    let extra_room = keep.saturating_sub(size.min(keep / 2));
    let extra = if extra.chars().count() > extra_room {
        let kept = cut(extra.trim_start_matches(", "), extra_room.saturating_sub(2));
        if kept == "\u{2026}" {
            String::new()
        } else {
            format!(", {kept}")
        }
    } else {
        extra.to_owned()
    };
    let room = keep.saturating_sub(extra.chars().count());
    out.push(format!(
        "{}{tail}{extra}",
        cut(if aside { bare } else { subject }, room)
    ));
    out
}

/// `subject`, `tail` and `extra` whole, or with the extra's leading whole words and an
/// ellipsis, in `keep` characters besides the tail; `None` if not a word of it fits.
fn with_extra(subject: &str, tail: &str, extra: &str, keep: usize) -> Option<String> {
    let size = subject.chars().count();
    if size + extra.chars().count() <= keep {
        return Some(format!("{subject}{tail}{extra}"));
    }
    let body = extra.trim_start_matches(", ");
    let words = fit(body, keep.saturating_sub(size + 4));
    let at_word = body
        .strip_prefix(words.as_str())
        .is_some_and(|rest| rest.starts_with([' ', ',', ';', ':']));
    (!words.is_empty() && at_word).then(|| format!("{subject}{tail}, {words} \u{2026}"))
}

/// Whether `text` is `kept` and one bracketed aside that closes it: a title may drop
/// that aside unmarked, as it qualifies the row rather than names it.
fn closing_aside(text: &str, kept: &str) -> bool {
    let Some(rest) = text.strip_prefix(kept).map(str::trim) else {
        return false;
    };
    let mut depth = 0usize;
    for (at, c) in rest.char_indices() {
        match c {
            '(' => depth += 1,
            ')' if depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    return at + 1 == rest.len();
                }
            }
            _ if depth == 0 => return false,
            _ => {}
        }
    }
    false
}

pub fn esc(text: &str) -> String {
    escape(text, true)
}

/// What the head of a page states about it.
pub struct Meta<'a> {
    pub title: &'a str,
    pub description: &'a str,
    /// The page's path, such as `/tools/depreciation-rates/asset/computers/`.
    pub path: &'a str,
}

fn social(meta: &Meta) -> String {
    let (title, description) = (esc(meta.title), esc(meta.description));
    format!(
        "  <meta property=\"og:title\" content=\"{title}\" />\n  <meta property=\"og:description\" content=\"{description}\" />\n  \
         <meta property=\"og:type\" content=\"article\" />\n  <meta property=\"og:site_name\" content=\"Ryan Duguid\" />\n  \
         <meta property=\"og:locale\" content=\"en_AU\" />\n  <meta property=\"og:url\" content=\"{ORIGIN}{path}\" />\n  \
         <meta property=\"og:image\" content=\"{CARD}\" />\n  <meta property=\"og:image:type\" content=\"image/png\" />\n  \
         <meta property=\"og:image:alt\" content=\"{CARD_ALT}\" />\n  <meta property=\"og:image:width\" content=\"1200\" />\n  \
         <meta property=\"og:image:height\" content=\"630\" />\n  <meta name=\"twitter:card\" content=\"summary_large_image\" />\n  \
         <meta name=\"twitter:title\" content=\"{title}\" />\n  <meta name=\"twitter:description\" content=\"{description}\" />\n  \
         <meta name=\"twitter:image\" content=\"{CARD}\" />\n  <meta name=\"twitter:image:alt\" content=\"{CARD_ALT}\" />\n",
        path = meta.path,
    )
}

fn links(meta: &Meta) -> String {
    let mut out = format!(
        "  <link rel=\"canonical\" href=\"{ORIGIN}{path}\" />\n  <link rel=\"alternate\" type=\"text/plain\" href=\"{ORIGIN}{path}index.txt\" />\n",
        path = meta.path
    );
    out.push_str(
        "  <link rel=\"icon\" type=\"image/svg+xml\" href=\"/assets/favicon.svg\" />\n  \
         <link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"/assets/favicon-32.png\" />\n  \
         <link rel=\"icon\" type=\"image/png\" sizes=\"48x48\" href=\"/assets/favicon-48.png\" />\n  \
         <link rel=\"icon\" type=\"image/png\" sizes=\"96x96\" href=\"/assets/favicon-96.png\" />\n  \
         <link rel=\"apple-touch-icon\" href=\"/assets/favicon-180.png\" />\n",
    );
    for font in FONTS {
        out.push_str(&format!(
            "  <link rel=\"preload\" href=\"/assets/fonts/{font}.woff2\" as=\"font\" type=\"font/woff2\" crossorigin />\n"
        ));
    }
    out.push_str(
        "  <link rel=\"stylesheet\" href=\"/assets/tokens.css?v={{ site.asset_version }}\" />\n  \
         <link rel=\"stylesheet\" href=\"/assets/site.css?v={{ site.asset_version }}\" />\n  \
         <link rel=\"stylesheet\" href=\"/assets/accounting-pages.css?v=20261126a\" />\n",
    );
    out
}

/// The front matter, head and the opening of the body up to the page's own content.
pub fn open(meta: &Meta) -> String {
    format!(
        "---\n---\n<!DOCTYPE html>\n<html lang=\"en-AU\">\n<head>\n  <meta charset=\"utf-8\" />\n  \
         <meta http-equiv=\"Content-Security-Policy\" content=\"{CSP}\" />\n  \
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  \
         <meta name=\"theme-color\" content=\"#000000\" />\n  <meta name=\"color-scheme\" content=\"dark\" />\n  \
         <title>{title}</title>\n  <meta name=\"description\" content=\"{description}\" />\n  \
         <meta name=\"referrer\" content=\"strict-origin-when-cross-origin\" />\n{social}{links}</head>\n<body>\n  \
         <a class=\"skip-link\" href=\"#main\">Skip to content</a>\n{{% include site-header.html %}}\n  \
         <main id=\"main\" class=\"site-main accounting-page depreciation-page\">\n    <article class=\"article\">\n",
        title = esc(meta.title),
        description = esc(meta.description),
        social = social(meta),
        links = links(meta),
    )
}

/// The breadcrumb trail, each step a name and an address; the last is the page itself.
pub fn crumbs(steps: &[(&str, &str)]) -> String {
    let mut out =
        String::from("        <nav class=\"article-crumb\" aria-label=\"Breadcrumb\"><ol>");
    for (i, (name, path)) in steps.iter().enumerate() {
        if i + 1 == steps.len() {
            out.push_str(&format!("<li aria-current=\"page\">{}</li>", esc(name)));
        } else {
            out.push_str(&format!("<li><a href=\"{path}\">{}</a></li>", esc(name)));
        }
    }
    out.push_str("</ol></nav>\n");
    out
}

/// The end of the page: the footer and the page's structured data.
pub fn close(json_ld: &str) -> String {
    format!(
        "    </article>\n  </main>\n{{% include site-footer.html %}}\n<script type=\"application/ld+json\">\n{json_ld}\n</script></body></html>\n"
    )
}

/// Signs outside the site fonts' ranges, which the body shows in the symbol font.
pub const SYMBOLS: [char; 1] = ['\u{2265}'];

/// The page with each sign in `SYMBOLS` in the body's text wrapped in the site's symbol
/// markup, as the λ of the LAMBDA pages is; the head, tags and structured data keep the
/// plain sign, as no web font draws them.
pub fn symbols(html: &str) -> String {
    let (Some(start), Some(end)) = (
        html.find("<body>"),
        html.find("<script type=\"application/ld+json\">"),
    ) else {
        return html.to_owned();
    };
    let mut out = String::with_capacity(html.len());
    out.push_str(&html[..start]);
    let mut in_tag = false;
    for c in html[start..end].chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ => {}
        }
        if !in_tag && SYMBOLS.contains(&c) {
            out.push_str(&format!("<span class=\"function-symbol\">{c}</span>"));
        } else {
            out.push(c);
        }
    }
    out.push_str(&html[end..]);
    out
}
