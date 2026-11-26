// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! Minify the built site's JavaScript and CSS in place, for publication and for the
//! server the browser checks use. The sources in assets/ stay readable: the Node tests,
//! the mutation check and the calculator oracle read them.
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

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

// The string delimiters, named because Codacy's function-length scan misreads a
// quote mark written as a character literal and runs one function into the next.
const QUOTE: char = '\u{22}';
const APOSTROPHE: char = '\u{27}';

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
    let mut sheet = Stylesheet {
        chars: source.chars().peekable(),
        out: String::with_capacity(source.len()),
        gap: Gap::None,
        statement_start: 0,
        custom: None,
        custom_started: false,
        escaped_name: false,
    };
    while let Some(c) = sheet.chars.next() {
        if c == '/' && sheet.chars.peek() == Some(&'*') {
            sheet.skip_comment()?;
        } else if css_space(c) {
            sheet.space(c);
        } else {
            sheet.token(c)?;
        }
    }
    Ok(format!("{}{}", header(source), sheet.out))
}

/// The state of one stylesheet being minified.
struct Stylesheet<'a> {
    chars: std::iter::Peekable<std::str::Chars<'a>>,
    out: String,
    gap: Gap,
    // Where the current declaration or rule starts in `out`, and, inside a custom
    // property's value, the depth of brackets open in it.
    statement_start: usize,
    custom: Option<u32>,
    // Whether that value has begun: the whitespace before it is not part of it.
    custom_started: bool,
    // Whether the identifier being copied holds an escape.
    escaped_name: bool,
}

impl Stylesheet<'_> {
    /// Skip a comment whose `/` has been read.
    fn skip_comment(&mut self) -> Result<(), String> {
        self.chars.next();
        let mut previous = ' ';
        loop {
            match self.chars.next() {
                Some('/') if previous == '*' => break,
                Some(next) => previous = next,
                None => return Err("unterminated comment".into()),
            }
        }
        if self.gap == Gap::None {
            self.gap = Gap::Comment;
        }
        Ok(())
    }

    fn space(&mut self, c: char) {
        // A custom property's value keeps its whitespace: script reads the value as
        // written. Only the whitespace before it goes.
        if self.custom.is_some() && self.custom_started {
            self.out.push(c);
        } else {
            self.gap = Gap::Space;
        }
    }

    /// Copy one character that is neither whitespace nor part of a comment, with the
    /// rest of its token when it opens a string, an escape or an unquoted url().
    fn token(&mut self, c: char) -> Result<(), String> {
        self.separate(c);
        self.track_custom_depth(c);
        // `\;` is part of a name, not a separator, and a custom property's value keeps
        // the semicolons in its blocks.
        let out = &mut self.out;
        if c == '}' && self.custom.is_none() && out.ends_with(';') && !out.ends_with("\\;") {
            out.pop();
        }
        out.push(c);
        // An escaped function name, such as `u\72l(`, can spell url(, whose contents are
        // not CSS tokens. None is expected, so refuse one rather than decode it.
        if c == '(' && self.escaped_name {
            return Err("escaped function name".into());
        }
        self.escaped_name = c == '\\'
            || (self.escaped_name
                && (c.is_alphanumeric() || matches!(c, '-' | '_') || !c.is_ascii()));
        self.track_statement(c);
        match c {
            '(' if self.at_unquoted_url() => self.copy_url(),
            '\\' => self.copy_escape(),
            QUOTE | APOSTROPHE => self.copy_string(c),
            _ => Ok(()),
        }
    }

    /// Write what the gap before `c` needs: nothing after these characters or before
    /// the closing ones. A space before `(` or `:` can be a token boundary (`and (`,
    /// `.a :hover`), so it stays.
    fn separate(&mut self, c: char) {
        let needed = !self.out.is_empty()
            && !self.out.ends_with(['{', '}', ';', ',', ':', '('])
            && !matches!(c, '{' | '}' | ';' | ',' | ')');
        if self.gap != Gap::None {
            self.escaped_name = false;
        }
        match self.gap {
            Gap::Space if needed => self.out.push(' '),
            // `.a/**/.b` is one compound selector; a space would make it two.
            Gap::Comment if needed => self.out.push_str("/**/"),
            _ => {}
        }
        self.gap = Gap::None;
    }

    /// Follow the brackets of a custom property's value, ending it at a `;` or `}`
    /// outside them.
    fn track_custom_depth(&mut self, c: char) {
        let Some(depth) = self.custom else {
            return;
        };
        self.custom = match c {
            '(' | '[' | '{' => Some(depth + 1),
            ')' | ']' | '}' if depth > 0 => Some(depth - 1),
            ';' | '}' if depth == 0 => {
                // Whitespace after the value is not part of it.
                self.out
                    .truncate(self.out.trim_end_matches(css_space).len());
                None
            }
            _ => Some(depth),
        };
        self.custom_started = self.custom.is_some();
    }

    /// Note where a statement starts, and whether a `:` begins a custom property's value.
    fn track_statement(&mut self, c: char) {
        if matches!(c, '{' | '}' | ';') {
            self.statement_start = self.out.len();
        } else if c == ':'
            && self.custom.is_none()
            && self
                .out
                .get(self.statement_start..)
                .is_some_and(|statement| statement.starts_with("--"))
        {
            self.custom = Some(0);
            self.custom_started = false;
        }
    }

    /// Whether the `(` just copied opens an unquoted url(): one token, in which `/*`
    /// is not a comment.
    fn at_unquoted_url(&self) -> bool {
        self.out
            .get(self.out.len().saturating_sub(4)..)
            .is_some_and(|name| name.eq_ignore_ascii_case("url("))
            && !matches!(
                self.chars.clone().find(|c| !css_space(*c)),
                Some(QUOTE | APOSTROPHE) | None
            )
    }

    fn copy_url(&mut self) -> Result<(), String> {
        while self.chars.next_if(|c| css_space(*c)).is_some() {}
        loop {
            let next = self.chars.next().ok_or("unterminated url()")?;
            self.out.push(next);
            match next {
                ')' => return Ok(()),
                '\\' => self
                    .out
                    .push(self.chars.next().ok_or("unterminated url()")?),
                _ => {}
            }
        }
    }

    /// Copy the rest of an escape whose `\` has been copied. A hex escape is up to 6
    /// digits, and one whitespace after it is part of it, not a token boundary.
    fn copy_escape(&mut self) -> Result<(), String> {
        let escaped = self.chars.next().ok_or("escape at the end of the file")?;
        self.out.push(escaped);
        if !escaped.is_ascii_hexdigit() {
            return Ok(());
        }
        for _ in 1..6 {
            match self.chars.next_if(char::is_ascii_hexdigit) {
                Some(digit) => self.out.push(digit),
                None => break,
            }
        }
        if let Some(space) = self.chars.next_if(|c| css_space(*c)) {
            self.out.push(space);
            // CSS reads CR LF as one newline.
            if space == '\r'
                && let Some(newline) = self.chars.next_if_eq(&'\n')
            {
                self.out.push(newline);
            }
        }
        Ok(())
    }

    /// Copy the rest of a string whose opening `quote` has been copied.
    fn copy_string(&mut self, quote: char) -> Result<(), String> {
        loop {
            let next = self.chars.next().ok_or("unterminated string")?;
            self.out.push(next);
            if next == '\\' {
                self.out
                    .push(self.chars.next().ok_or("unterminated string")?);
            } else if next == quote {
                return Ok(());
            } else if matches!(next, '\n' | '\r' | '\x0c') {
                return Err("unterminated string".into());
            }
        }
    }
}

/// Minify every .js, .mjs and .css file under `directory`; returns the file count and
/// the bytes before and after.
pub fn minify_tree(directory: &Path) -> Result<(usize, u64, u64), String> {
    let mut totals = (0, 0, 0);
    let mut pending = vec![directory.to_path_buf()];
    let mut pages = Vec::new();
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
            // Page text is already Markdown. Publish a conventional filename alongside it.
            if kind.is_file()
                && entry.file_name() == "index.txt"
                && folder.join("index.html").is_file()
            {
                let text = crate::read(&path)?;
                write_generated(&folder.join("index.md"), &text)?;
            }
            let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if extension == "html" && kind.is_file() {
                pages.push(path);
                continue;
            }
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
    bundle_stylesheets(directory, &pages)?;
    Ok(totals)
}

/// The shared sheets have the same URL on every layout, including after navigation.
fn bundle_stylesheets(root: &Path, pages: &[PathBuf]) -> Result<(), String> {
    let assets = root.join("assets");
    if !assets.join("tokens.css").is_file() {
        return Ok(());
    }
    static LINKS: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
        let tag = |name: &str| {
            format!(r#"<link rel="stylesheet" href="/assets/{name}\.css\?v=[a-z0-9]+" />"#)
        };
        fancy_regex::Regex::new(&format!(r"{}\s+{}", tag("tokens"), tag("site")))
            .expect("site stylesheet tags")
    });
    let mut link = String::new();
    for page in pages {
        let mut html = crate::read(page)?;
        let Some((head, _)) = html.split_once("</head>") else {
            continue;
        };
        let Some(tags) = LINKS.find(head).map_err(|e| e.to_string())? else {
            continue;
        };
        let range = tags.start()..tags.end();
        if link.is_empty() {
            let tokens = crate::read(&assets.join("tokens.css"))?;
            let site = crate::read(&assets.join("site.css"))?;
            let bundle = css(&format!("{tokens}\n{site}"))?;
            let name = format!("screen-{}.css", &crate::sha256(&bundle)[..16]);
            write_generated(&assets.join(&name), &bundle)?;
            link = format!(r#"<link rel="stylesheet" href="/assets/{name}" />"#);
        }
        html.replace_range(range, &link);
        std::fs::write(page, html).map_err(|e| format!("{}: {e}", page.display()))?;
    }
    Ok(())
}

fn write_generated(path: &Path, contents: &str) -> Result<(), String> {
    match std::fs::File::create_new(path) {
        Ok(mut file) => file
            .write_all(contents.as_bytes())
            .map_err(|e| format!("{}: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            let kind =
                std::fs::symlink_metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
            if kind.is_file() && crate::read(path)? == contents {
                Ok(())
            } else {
                Err(format!(
                    "{} conflicts with a generated publication file",
                    path.display()
                ))
            }
        }
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
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
