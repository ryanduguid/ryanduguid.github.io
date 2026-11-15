// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! Minify the built site's JavaScript and CSS in place, for publication and for the
//! server the browser checks use. The sources in assets/ stay readable: the Node tests,
//! the mutation check and the calculator oracle read them.
use std::path::Path;

use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_minifier::{MangleOptions, MangleOptionsKeepNames, Minifier, MinifierOptions};
use oxc_parser::Parser;
use oxc_span::SourceType;

/// The copyright and licence lines a file opens with: its leading comments that fill
/// whole lines, up to the first line that is not one. Minifiers drop ordinary
/// comments, and the site's licence asks for the attribution to stay.
pub fn header(source: &str) -> &str {
    // `end` covers whole comments; `open` is the length of a block comment's lines
    // read so far while it is still open.
    let mut end = 0;
    let mut open: Option<usize> = None;
    for line in source.split_inclusive('\n') {
        let text = line.trim();
        let rest = match open {
            Some(_) => text,
            None if text.starts_with("//") => {
                end += line.len();
                continue;
            }
            None => match text.strip_prefix("/*") {
                Some(rest) => rest,
                None => break,
            },
        };
        // A block comment must close at the end of its line, or the line holds code.
        match rest.find("*/") {
            None => open = Some(open.unwrap_or(0) + line.len()),
            Some(at) if at + 2 == rest.len() => {
                end += open.take().unwrap_or(0) + line.len();
            }
            Some(_) => break,
        }
    }
    &source[..end]
}

/// Minify one JavaScript source: whitespace and comments go and local names shorten.
/// `.mjs` is a module; `.js` is a module only when it imports or exports, so a
/// classic script's top-level names, which are globals, keep their spelling. Oxc's
/// compression pass is off: on 16 November 2026 it saved 2% more of the site's
/// JavaScript, too little for the rewriting it does.
pub fn javascript(source: &str, module: bool) -> Result<String, String> {
    let allocator = Allocator::default();
    let source_type = if module {
        SourceType::mjs()
    } else {
        SourceType::unambiguous()
    };
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if let Some(error) = parsed.diagnostics.errors().next() {
        return Err(error.to_string());
    }
    if parsed.fatal_error {
        return Err("the parser stopped before the end".into());
    }
    let mut program = parsed.program;
    // Functions and classes keep their `name` property, which script can read.
    let options = MinifierOptions {
        mangle: Some(MangleOptions {
            keep_names: MangleOptionsKeepNames::all_true(),
            ..MangleOptions::default()
        }),
        compress: None,
        ..MinifierOptions::default()
    };
    let minified = Minifier::new(options).minify(&allocator, &mut program);
    let code = Codegen::new()
        .with_options(CodegenOptions::minify())
        .with_scoping(minified.scoping)
        .with_private_member_mappings(minified.class_private_mappings)
        .build(&program)
        .code;
    Ok(format!("{}{code}", header(source)))
}

/// What separated the previous character from the next one.
#[derive(PartialEq)]
enum Gap {
    None,
    Comment,
    Space,
}

/// CSS whitespace; other spaces, such as U+00A0, are part of a token.
fn css_space(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\n' | '\r' | '\x0c')
}

/// Minify one stylesheet by removing comments and the whitespace no token needs, and
/// the semicolon before a closing brace. Every other character stays as written. A
/// minifier that parses and reprints CSS changed this site's behaviour on 16 November
/// 2026: Lightning CSS folded `animation-timeline` into the `animation` shorthand,
/// which browsers reject, and dropped fallback declarations.
pub fn css(source: &str) -> Result<String, String> {
    let mut out = String::with_capacity(source.len());
    let mut chars = source.chars().peekable();
    let mut gap = Gap::None;
    // Where the current declaration or rule starts in `out`, and, inside a custom
    // property's value, the depth of brackets open in it.
    let mut statement_start = 0;
    let mut custom: Option<u32> = None;
    // Whether that value has begun: the whitespace before it is not part of it.
    let mut custom_started = false;
    // Whether the identifier being copied holds an escape.
    let mut escaped_name = false;
    while let Some(c) = chars.next() {
        if c == '/' && chars.peek() == Some(&'*') {
            chars.next();
            let mut previous = ' ';
            loop {
                match chars.next() {
                    Some('/') if previous == '*' => break,
                    Some(next) => previous = next,
                    None => return Err("unterminated comment".into()),
                }
            }
            if gap == Gap::None {
                gap = Gap::Comment;
            }
            continue;
        }
        if css_space(c) {
            // A custom property's value keeps its whitespace: script reads the value
            // as written. Only the whitespace before it goes.
            if custom.is_some() && custom_started {
                out.push(c);
            } else {
                gap = Gap::Space;
            }
            continue;
        }
        // Nothing is needed after these characters or before the closing ones. A space
        // before `(` or `:` can be a token boundary (`and (`, `.a :hover`), so it stays.
        let needed = !out.is_empty()
            && !out.ends_with(['{', '}', ';', ',', ':', '('])
            && !matches!(c, '{' | '}' | ';' | ',' | ')');
        if gap != Gap::None {
            escaped_name = false;
        }
        match gap {
            Gap::Space if needed => out.push(' '),
            // `.a/**/.b` is one compound selector; a space would make it two.
            Gap::Comment if needed => out.push_str("/**/"),
            _ => {}
        }
        gap = Gap::None;
        if let Some(depth) = custom {
            custom = match c {
                '(' | '[' | '{' => Some(depth + 1),
                ')' | ']' | '}' if depth > 0 => Some(depth - 1),
                ';' | '}' if depth == 0 => {
                    // Whitespace after the value is not part of it.
                    out.truncate(out.trim_end_matches(css_space).len());
                    None
                }
                _ => Some(depth),
            };
            custom_started = custom.is_some();
        }
        // `\;` is part of a name, not a separator, and a custom property's value keeps
        // the semicolons in its blocks.
        if c == '}' && custom.is_none() && out.ends_with(';') && !out.ends_with("\\;") {
            out.pop();
        }
        out.push(c);
        // An escaped function name, such as `u\72l(`, can spell url(, whose contents are
        // not CSS tokens. None is expected, so refuse one rather than decode it.
        if c == '(' && escaped_name {
            return Err("escaped function name".into());
        }
        escaped_name = c == '\\'
            || (escaped_name && (c.is_alphanumeric() || matches!(c, '-' | '_') || !c.is_ascii()));
        if matches!(c, '{' | '}' | ';') {
            statement_start = out.len();
        } else if c == ':'
            && custom.is_none()
            && out
                .get(statement_start..)
                .is_some_and(|statement| statement.starts_with("--"))
        {
            custom = Some(0);
            custom_started = false;
        }
        match c {
            // An unquoted url() is one token: `/*` inside it is not a comment.
            '(' if out
                .get(out.len().saturating_sub(4)..)
                .is_some_and(|name| name.eq_ignore_ascii_case("url("))
                && !matches!(
                    chars.clone().find(|c| !css_space(*c)),
                    Some('"' | '\'') | None
                ) =>
            {
                while chars.next_if(|c| css_space(*c)).is_some() {}
                loop {
                    let next = chars.next().ok_or("unterminated url()")?;
                    out.push(next);
                    match next {
                        ')' => break,
                        '\\' => out.push(chars.next().ok_or("unterminated url()")?),
                        _ => {}
                    }
                }
            }
            '\\' => {
                let escaped = chars.next().ok_or("escape at the end of the file")?;
                out.push(escaped);
                // A hex escape is up to 6 digits, and one whitespace after it is part
                // of it, not a token boundary.
                if escaped.is_ascii_hexdigit() {
                    for _ in 1..6 {
                        match chars.next_if(char::is_ascii_hexdigit) {
                            Some(digit) => out.push(digit),
                            None => break,
                        }
                    }
                    if let Some(space) = chars.next_if(|c| css_space(*c)) {
                        out.push(space);
                        // CSS reads CR LF as one newline.
                        if space == '\r'
                            && let Some(newline) = chars.next_if_eq(&'\n')
                        {
                            out.push(newline);
                        }
                    }
                }
            }
            '"' | '\'' => loop {
                let next = chars.next().ok_or("unterminated string")?;
                out.push(next);
                if next == '\\' {
                    out.push(chars.next().ok_or("unterminated string")?);
                } else if next == c {
                    break;
                } else if matches!(next, '\n' | '\r' | '\x0c') {
                    return Err("unterminated string".into());
                }
            },
            _ => {}
        }
    }
    Ok(format!("{}{out}", header(source)))
}

/// Minify every .js, .mjs and .css file under `directory`; returns the file count and
/// the bytes before and after.
pub fn minify_tree(directory: &Path) -> Result<(usize, u64, u64), String> {
    let mut totals = (0, 0, 0);
    let mut pending = vec![directory.to_path_buf()];
    while let Some(folder) = pending.pop() {
        let entries =
            std::fs::read_dir(&folder).map_err(|e| format!("{}: {e}", folder.display()))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("{}: {e}", folder.display()))?;
            let path = entry.path();
            let kind = entry
                .file_type()
                .map_err(|e| format!("{}: {e}", path.display()))?;
            if kind.is_dir() {
                pending.push(path);
                continue;
            }
            let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if !matches!(extension, "js" | "mjs" | "css") {
                continue;
            }
            // A link could point outside the tree, so the file it names is not rewritten.
            if !kind.is_file() {
                return Err(format!("{}: not a regular file", path.display()));
            }
            let source = crate::read(&path)?;
            let minified = match extension {
                "css" => css(&source),
                _ => javascript(&source, extension == "mjs"),
            }
            .map_err(|e| format!("{}: {e}", path.display()))?;
            std::fs::write(&path, &minified).map_err(|e| format!("{}: {e}", path.display()))?;
            totals.0 += 1;
            totals.1 += source.len() as u64;
            totals.2 += minified.len() as u64;
        }
    }
    Ok(totals)
}

/// `site-tools minify_site [directory]`: the directory defaults to the built `_site`.
pub fn run(root: &Path, args: &[String]) -> Result<u8, String> {
    let directory = match args {
        [] => root.join("_site"),
        [directory] => directory.into(),
        _ => return Err("usage: site-tools minify_site [directory]".into()),
    };
    let (files, before, after) = minify_tree(&directory)?;
    crate::print_text(
        &format!(
            "minified {files} files under {}: {before} to {after} bytes\n",
            directory.display()
        ),
        false,
    )
    .map_err(|e| e.to_string())?;
    Ok(0)
}
