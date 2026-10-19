//! `str.format(*args, **kwargs)` of CPython 3.15 over decoded JSON values.
//!
//! Ported from Objects/stringlib/unicode_format.h (fields, conversions, nested specs),
//! Python/formatter_unicode.c (the int, float and str format-spec mini-language with
//! grouping) and Python/pystrtod.c (float digits). Exceptions become `Err` with the
//! exception type and message.
//!
//! shortcut: attribute lookup supports the numeric `.real`, `.imag`, `.numerator` and
//! `.denominator`; other attributes, such as bound methods whose text carries a memory
//! address, are refused as AttributeError.
use crate::py;
use crate::pyjson::Json;
use crate::pyobj::type_name;
use num_bigint::BigInt;
use num_traits::{Signed, ToPrimitive, Zero};

type Result<T> = std::result::Result<T, String>;

fn value_error(message: &str) -> String {
    format!("ValueError: {message}")
}

/// `str(value)`, including the integer string-length limit.
pub fn py_str(value: &Json) -> Result<String> {
    match value {
        Json::Int(i) => py::int_repr(i).map_err(|e| value_error(&e)),
        other => Ok(other.py_str()),
    }
}

fn py_repr(value: &Json) -> Result<String> {
    match value {
        Json::Int(i) => py::int_repr(i).map_err(|e| value_error(&e)),
        Json::Array(items) => Ok(format!(
            "[{}]",
            items
                .iter()
                .map(py_repr)
                .collect::<Result<Vec<_>>>()?
                .join(", ")
        )),
        Json::Object(pairs) => Ok(format!(
            "{{{}}}",
            pairs
                .iter()
                .map(|(k, v)| Ok(format!("{}: {}", py::repr_str(k), py_repr(v)?)))
                .collect::<Result<Vec<_>>>()?
                .join(", ")
        )),
        other => Ok(other.repr()),
    }
}

/// `ascii(value)`: the repr with non-ASCII characters escaped.
fn py_ascii(value: &Json) -> Result<String> {
    let mut out = String::new();
    for c in py_repr(value)?.chars() {
        match c as u32 {
            0..0x80 => out.push(c),
            n @ 0x80..0x100 => out.push_str(&format!("\\x{n:02x}")),
            n @ 0x100..0x10000 => out.push_str(&format!("\\u{n:04x}")),
            n => out.push_str(&format!("\\U{n:08x}")),
        }
    }
    Ok(out)
}

/// `float(int)`, correctly rounded, or Python's OverflowError.
pub fn int_to_float(i: &BigInt) -> Result<f64> {
    match i.to_f64() {
        Some(f) if f.is_finite() => Ok(f),
        _ => Err("OverflowError: int too large to convert to float".into()),
    }
}

// ---------------------------------------------------------------- float digits

/// `_Py_dg_dtoa` for a finite value: the significant digits without trailing zeros and
/// the decimal point position. Mode 0 is the shortest repr, mode 2 `ndigits` significant
/// digits and mode 3 `ndigits` places after the point, all correctly rounded.
fn dtoa(d: f64, mode: u8, ndigits: usize) -> (String, i64) {
    if d == 0.0 {
        return ("0".into(), 1);
    }
    let a = d.abs();
    let (digits, decpt) = match mode {
        0 => py::shortest_digits(a),
        2 => {
            let text = format!("{a:.*e}", ndigits.max(1) - 1);
            let (mantissa, exponent) = text.split_once('e').expect("exponent");
            let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
            (digits, exponent.parse::<i64>().expect("exponent") + 1)
        }
        _ => {
            let text = format!("{a:.ndigits$}");
            let (int_part, frac) = text.split_once('.').unwrap_or((&text, ""));
            let all = format!("{int_part}{frac}");
            let leading = all.len() - all.trim_start_matches('0').len();
            let decpt = int_part.len() as i64 - leading as i64;
            let digits = all.trim_start_matches('0').to_owned();
            if digits.is_empty() {
                // Rounded to zero: no digits, the point after the last requested place.
                return (String::new(), -(ndigits as i64));
            }
            (digits, decpt)
        }
    };
    let trimmed = digits.trim_end_matches('0');
    (
        if trimmed.is_empty() {
            "0".into()
        } else {
            trimmed.into()
        },
        decpt,
    )
}

#[derive(Clone, Copy, Default)]
struct FloatFlags {
    add_sign: bool,
    add_dot_0: bool,
    alt: bool,
    no_neg_0: bool,
}

/// `format_float_short`, with `code` one of e, f, g, r.
fn format_float_short(
    d: f64,
    code: char,
    mode: u8,
    precision: i64,
    flags: FloatFlags,
    upper: bool,
) -> String {
    let mut sign = d.is_sign_negative();
    let mut out = String::new();
    if !d.is_finite() {
        if d.is_nan() {
            sign = false;
        }
        if sign {
            out.push('-');
        } else if flags.add_sign {
            out.push('+');
        }
        out.push_str(match (d.is_nan(), upper) {
            (true, false) => "nan",
            (true, true) => "NAN",
            (false, false) => "inf",
            (false, true) => "INF",
        });
        return out;
    }
    let (digits, mut decpt) = dtoa(d, mode, precision.max(0) as usize);
    let digits_len = digits.len() as i64;
    if flags.no_neg_0 && sign && (digits_len == 0 || digits == "0") {
        sign = false;
    }
    let mut vdigits_end = digits_len;
    let mut use_exp = false;
    match code {
        'e' => {
            use_exp = true;
            vdigits_end = precision;
        }
        'f' => vdigits_end = decpt + precision,
        'g' => {
            let limit = if flags.add_dot_0 {
                precision - 1
            } else {
                precision
            };
            if decpt <= -4 || decpt > limit {
                use_exp = true;
            }
            if flags.alt {
                vdigits_end = precision;
            }
        }
        _ => {
            if decpt <= -4 || decpt > 16 {
                use_exp = true;
            }
        }
    }
    let mut exp = 0;
    if use_exp {
        exp = decpt - 1;
        decpt = 1;
    }
    let vdigits_start = if decpt <= 0 { decpt - 1 } else { 0 };
    vdigits_end = if !use_exp && flags.add_dot_0 {
        vdigits_end.max(decpt + 1)
    } else {
        vdigits_end.max(decpt)
    };
    if sign {
        out.push('-');
    } else if flags.add_sign {
        out.push('+');
    }
    let zeros = |n: i64| "0".repeat(n.max(0) as usize);
    if decpt <= 0 {
        out.push_str(&zeros(decpt - vdigits_start));
        out.push('.');
        out.push_str(&zeros(-decpt));
    } else {
        out.push_str(&zeros(-vdigits_start));
    }
    if 0 < decpt && decpt <= digits_len {
        out.push_str(&digits[..decpt as usize]);
        out.push('.');
        out.push_str(&digits[decpt as usize..]);
    } else {
        out.push_str(&digits);
    }
    if digits_len < decpt {
        out.push_str(&zeros(decpt - digits_len));
        out.push('.');
        out.push_str(&zeros(vdigits_end - decpt));
    } else {
        out.push_str(&zeros(vdigits_end - digits_len));
    }
    if out.ends_with('.') && !flags.alt {
        out.pop();
    }
    if use_exp {
        out.push(if upper { 'E' } else { 'e' });
        out.push_str(&format!(
            "{}{:02}",
            if exp < 0 { '-' } else { '+' },
            exp.abs()
        ));
    }
    out
}

/// `PyOS_double_to_string(val, code, precision, flags)`.
fn double_to_string(val: f64, code: char, precision: i64, flags: FloatFlags) -> Result<String> {
    if precision > i64::from(i32::MAX - 1024) {
        return Err(value_error("precision too big"));
    }
    // shortcut: CPython allocates the digits and fails only when memory runs out; past
    // a hundred million places this reports MemoryError rather than risk an abort.
    if precision > 100_000_000 {
        return Err("MemoryError".into());
    }
    let upper = code.is_ascii_uppercase();
    Ok(match code.to_ascii_lowercase() {
        'e' => format_float_short(val, 'e', 2, precision + 1, flags, upper),
        'f' => format_float_short(val, 'f', 3, precision, flags, upper),
        'g' => format_float_short(val, 'g', 2, precision.max(1), flags, upper),
        _ => format_float_short(val, 'r', 0, 0, flags, false),
    })
}

// ---------------------------------------------------------------- format specs

#[derive(Clone, Copy, PartialEq)]
enum Grouping {
    None,
    Comma,
    Underscore,
    UnderscoreFour,
    Locale,
}

struct Spec {
    fill: char,
    align: char,
    alternate: bool,
    no_neg_0: bool,
    sign: Option<char>,
    width: i64,
    thousands: Grouping,
    precision: i64,
    frac_thousands: Grouping,
    kind: Option<char>,
}

/// `get_integer`: decimal digits (any script) from `pos`; returns the count consumed.
fn get_integer(spec: &[char], pos: &mut usize, result: &mut i64) -> Result<usize> {
    let mut accumulator: i64 = 0;
    let start = *pos;
    while *pos < spec.len() {
        let Some(digit) = py::decimal_value(spec[*pos]) else {
            break;
        };
        let digit = i64::from(digit);
        if accumulator > (i64::MAX - digit) / 10 {
            return Err(value_error("Too many decimal digits in format string"));
        }
        accumulator = accumulator * 10 + digit;
        *pos += 1;
    }
    *result = accumulator;
    Ok(*pos - start)
}

fn separator_name(grouping: Grouping) -> char {
    if grouping == Grouping::Comma {
        ','
    } else {
        '_'
    }
}

fn invalid_separator(grouping: Grouping, kind: char) -> String {
    let specifier = separator_name(grouping);
    if (' '..='~').contains(&kind) {
        value_error(&format!("Cannot specify '{specifier}' with '{kind}'."))
    } else {
        value_error(&format!(
            "Cannot specify '{specifier}' with '\\x{:x}'.",
            kind as u32
        ))
    }
}

fn parse_spec(
    value: &Json,
    text: &str,
    default_kind: Option<char>,
    default_align: char,
) -> Result<Spec> {
    let spec: Vec<char> = text.chars().collect();
    let end = spec.len();
    let mut pos = 0;
    let mut format = Spec {
        fill: ' ',
        align: default_align,
        alternate: false,
        no_neg_0: false,
        sign: None,
        width: -1,
        thousands: Grouping::None,
        precision: -1,
        frac_thousands: Grouping::None,
        kind: default_kind,
    };
    let is_align = |c: char| matches!(c, '<' | '>' | '=' | '^');
    let mut align_specified = false;
    let mut fill_specified = false;
    if end - pos >= 2 && is_align(spec[pos + 1]) {
        format.align = spec[pos + 1];
        format.fill = spec[pos];
        fill_specified = true;
        align_specified = true;
        pos += 2;
    } else if end - pos >= 1 && is_align(spec[pos]) {
        format.align = spec[pos];
        align_specified = true;
        pos += 1;
    }
    if pos < end && matches!(spec[pos], ' ' | '+' | '-') {
        format.sign = Some(spec[pos]);
        pos += 1;
    }
    if pos < end && spec[pos] == 'z' {
        format.no_neg_0 = true;
        pos += 1;
    }
    if pos < end && spec[pos] == '#' {
        format.alternate = true;
        pos += 1;
    }
    if !fill_specified && pos < end && spec[pos] == '0' {
        format.fill = '0';
        if !align_specified && default_align == '>' {
            format.align = '=';
        }
        pos += 1;
    }
    let mut width = 0;
    if get_integer(&spec, &mut pos, &mut width)? > 0 {
        format.width = width;
    }
    if pos < end && spec[pos] == ',' {
        format.thousands = Grouping::Comma;
        pos += 1;
    }
    if pos < end && spec[pos] == '_' {
        if format.thousands != Grouping::None {
            return Err(value_error("Cannot specify both ',' and '_'."));
        }
        format.thousands = Grouping::Underscore;
        pos += 1;
    }
    if pos < end && spec[pos] == ',' && format.thousands == Grouping::Underscore {
        return Err(value_error("Cannot specify both ',' and '_'."));
    }
    if pos < end && spec[pos] == '.' {
        pos += 1;
        let mut precision = 0;
        let mut consumed = get_integer(&spec, &mut pos, &mut precision)?;
        format.precision = precision;
        if pos < end && spec[pos] == ',' {
            if consumed == 0 {
                format.precision = -1;
            }
            format.frac_thousands = Grouping::Comma;
            pos += 1;
            consumed += 1;
        }
        if pos < end && spec[pos] == '_' {
            if format.frac_thousands != Grouping::None {
                return Err(value_error("Cannot specify both ',' and '_'."));
            }
            if consumed == 0 {
                format.precision = -1;
            }
            format.frac_thousands = Grouping::Underscore;
            pos += 1;
            consumed += 1;
        }
        if pos < end && spec[pos] == ',' && format.frac_thousands == Grouping::Underscore {
            return Err(value_error("Cannot specify both ',' and '_'."));
        }
        if consumed == 0 {
            return Err(value_error("Format specifier missing precision"));
        }
    }
    if end - pos > 1 {
        return Err(value_error(&format!(
            "Invalid format specifier '{text}' for object of type '{}'",
            type_name(value)
        )));
    }
    if end - pos == 1 {
        format.kind = Some(spec[pos]);
    }
    if format.thousands != Grouping::None {
        match format.kind {
            None | Some('d' | 'e' | 'f' | 'g' | 'E' | 'G' | '%' | 'F') => {}
            Some('b' | 'o' | 'x' | 'X') if format.thousands == Grouping::Underscore => {
                format.thousands = Grouping::UnderscoreFour;
            }
            Some(kind) => return Err(invalid_separator(format.thousands, kind)),
        }
    }
    if format.kind == Some('n') && format.frac_thousands != Grouping::None {
        return Err(invalid_separator(format.frac_thousands, 'n'));
    }
    Ok(format)
}

/// Locale data for a grouping: the group size (`None` stops grouping) and separator.
fn locale(grouping: Grouping) -> (Option<usize>, &'static str) {
    match grouping {
        Grouping::Comma => (Some(3), ","),
        Grouping::Underscore => (Some(3), "_"),
        Grouping::UnderscoreFour => (Some(4), "_"),
        // The C locale: no grouping and no separator.
        Grouping::None | Grouping::Locale => (None, ""),
    }
}

/// `fill` repeated `n` times, or Python's MemoryError when the text cannot be allocated.
fn repeat(fill: char, n: i64) -> Result<String> {
    let n = n.max(0) as usize;
    let mut out = String::new();
    n.checked_mul(fill.len_utf8())
        .and_then(|bytes| out.try_reserve_exact(bytes).ok())
        .ok_or("MemoryError")?;
    out.extend(std::iter::repeat_n(fill, n));
    Ok(out)
}

/// `_PyUnicode_InsertThousandsGrouping`: the digits grouped, zero-padded to `min_width`.
/// Backward groups from the right (integer part); forward from the left (fraction).
fn group_digits(
    digits: &str,
    min_width: i64,
    group: Option<usize>,
    sep: &str,
    forward: bool,
) -> Result<String> {
    let digits: Vec<char> = digits.chars().collect();
    let mut min_width = min_width.max(0);
    let mut remaining = digits.len() as i64;
    let sep_len = sep.chars().count() as i64;
    let mut pieces: Vec<String> = Vec::new();
    let mut use_separator = false;
    let mut taken = 0usize;
    let mut take =
        |n_chars: i64, n_zeros: i64, use_sep: bool, pieces: &mut Vec<String>| -> Result<()> {
            let n = n_chars as usize;
            let chunk: String = if forward {
                digits[taken..taken + n].iter().collect()
            } else {
                digits[digits.len() - taken - n..digits.len() - taken]
                    .iter()
                    .collect()
            };
            taken += n;
            let zeros = repeat('0', n_zeros)?;
            let piece = if forward {
                format!("{}{chunk}{zeros}", if use_sep { sep } else { "" })
            } else {
                format!("{zeros}{chunk}{}", if use_sep { sep } else { "" })
            };
            pieces.push(piece);
            Ok(())
        };
    let mut broken = false;
    if let Some(size) = group {
        loop {
            let len = (size as i64).min(remaining.max(min_width).max(1));
            let n_zeros = (len - remaining).max(0);
            let n_chars = remaining.min(len).max(0);
            take(n_chars, n_zeros, use_separator, &mut pieces)?;
            use_separator = true;
            remaining -= n_chars;
            min_width -= len;
            if remaining <= 0 && min_width <= 0 {
                broken = true;
                break;
            }
            min_width -= sep_len;
        }
    }
    if !broken {
        let len = remaining.max(min_width).max(1);
        let n_zeros = (len - remaining).max(0);
        let n_chars = remaining.min(len).max(0);
        take(n_chars, n_zeros, use_separator, &mut pieces)?;
    }
    Ok(if forward {
        pieces.concat()
    } else {
        pieces.iter().rev().map(String::as_str).collect()
    })
}

fn pad(text: &str, width: i64, align: char, fill: char) -> Result<String> {
    let len = text.chars().count() as i64;
    let total = width.max(len);
    let left = match align {
        '>' => total - len,
        '^' => (total - len) / 2,
        _ => 0,
    };
    let right = total - len - left;
    Ok(format!(
        "{}{text}{}",
        repeat(fill, left)?,
        repeat(fill, right)?
    ))
}

/// `calc_number_widths` and `fill_number`: lay out sign, prefix, padding and the
/// grouped digits, fraction and remainder of a rendered number.
#[allow(clippy::too_many_arguments)]
fn layout_number(
    format: &Spec,
    negative: bool,
    prefix: &str,
    digits: &str,
    has_decimal: bool,
    frac: &str,
    remainder: &str,
    thousands: Grouping,
    frac_thousands: Grouping,
    upper: bool,
) -> Result<String> {
    let (mut group, sep) = locale(thousands);
    let frac_sep = match frac_thousands {
        Grouping::None => "",
        other => locale(other).1,
    };
    if frac_thousands != Grouping::None && group.is_none() {
        group = Some(3);
    }
    let sign = match format.sign {
        Some('+') => Some(if negative { '-' } else { '+' }),
        Some(' ') => Some(if negative { '-' } else { ' ' }),
        _ => negative.then_some('-'),
    };
    let n_sign = i64::from(sign.is_some());
    let grouped_frac = if frac.is_empty() {
        String::new()
    } else {
        group_digits(frac, frac.len() as i64, group, frac_sep, true)?
    };
    let n_frac = frac.len() as i64;
    let n_decimal = i64::from(has_decimal);
    let n_prefix = prefix.len() as i64;
    let n_remainder = remainder.chars().count() as i64;
    let non_digit = n_sign + n_prefix + n_decimal + n_frac + n_remainder;
    let grouped_frac_len = grouped_frac.chars().count() as i64;
    let min_width = if format.fill == '0' && format.align == '=' {
        format.width - non_digit + n_frac - grouped_frac_len
    } else {
        0
    };
    let mut grouped = if digits.is_empty() {
        String::new()
    } else {
        group_digits(digits, min_width, group, sep, false)?
    };
    if upper {
        grouped = grouped.to_ascii_uppercase();
    }
    let n_padding =
        format.width - (non_digit + grouped.chars().count() as i64 + grouped_frac_len - n_frac);
    let (mut left, mut middle, mut right) = (0, 0, 0);
    if n_padding > 0 {
        match format.align {
            '<' => right = n_padding,
            '^' => {
                left = n_padding / 2;
                right = n_padding - left;
            }
            '=' => middle = n_padding,
            _ => left = n_padding,
        }
    }
    let fill = |n: i64| repeat(format.fill, n);
    let mut out = fill(left)?;
    if let Some(sign) = sign {
        out.push(sign);
    }
    out.push_str(&if upper {
        prefix.to_ascii_uppercase()
    } else {
        prefix.to_owned()
    });
    out.push_str(&fill(middle)?);
    out.push_str(&grouped);
    if has_decimal {
        out.push('.');
    }
    out.push_str(&grouped_frac);
    out.push_str(remainder);
    out.push_str(&fill(right)?);
    Ok(out)
}

fn format_string(value: &str, format: &Spec) -> Result<String> {
    match format.sign {
        Some(' ') => return Err(value_error("Space not allowed in string format specifier")),
        Some(_) => return Err(value_error("Sign not allowed in string format specifier")),
        None => {}
    }
    if format.no_neg_0 {
        return Err(value_error(
            "Negative zero coercion (z) not allowed in string format specifier",
        ));
    }
    if format.alternate {
        return Err(value_error(
            "Alternate form (#) not allowed in string format specifier",
        ));
    }
    if format.align == '=' {
        return Err(value_error(
            "'=' alignment not allowed in string format specifier",
        ));
    }
    let text: String = if format.precision >= 0 {
        value.chars().take(format.precision as usize).collect()
    } else {
        value.to_owned()
    };
    pad(&text, format.width, format.align, format.fill)
}

fn format_int(value: &BigInt, format: &Spec) -> Result<String> {
    if format.precision != -1 {
        return Err(value_error(
            "Precision not allowed in integer format specifier",
        ));
    }
    if format.no_neg_0 {
        return Err(value_error(
            "Negative zero coercion (z) not allowed in integer format specifier",
        ));
    }
    let kind = format.kind.unwrap_or('d');
    if kind == 'c' {
        if format.sign.is_some() {
            return Err(value_error(
                "Sign not allowed with integer format specifier 'c'",
            ));
        }
        if format.alternate {
            return Err(value_error(
                "Alternate form (#) not allowed with integer format specifier 'c'",
            ));
        }
        let Some(code) = value.to_i64() else {
            return Err("OverflowError: Python int too large to convert to C long".into());
        };
        let Some(c) = u32::try_from(code).ok().filter(|c| *c <= 0x10ffff) else {
            return Err("OverflowError: %c arg not in range(0x110000)".into());
        };
        // Lone surrogates cannot occur in Rust strings; Python would hold them.
        let c = char::from_u32(c).ok_or("ValueError: surrogate code point in 'c' format")?;
        return layout_number(
            format,
            false,
            "",
            "",
            false,
            "",
            &c.to_string(),
            Grouping::None,
            Grouping::None,
            false,
        );
    }
    let (base, prefix) = match kind {
        'b' => (2, "0b"),
        'o' => (8, "0o"),
        'x' | 'X' => (16, "0x"),
        _ => (10, ""),
    };
    let digits = value.abs().to_str_radix(base);
    if base == 10 && digits.len() > py::INT_MAX_STR_DIGITS {
        return Err(value_error(&py::int_digits_error(digits.len())));
    }
    let thousands = if kind == 'n' {
        Grouping::Locale
    } else {
        format.thousands
    };
    layout_number(
        format,
        value.is_negative(),
        if format.alternate { prefix } else { "" },
        &digits,
        false,
        "",
        "",
        thousands,
        Grouping::None,
        kind == 'X',
    )
}

fn format_float(value: f64, format: &Spec) -> Result<String> {
    let mut flags = FloatFlags {
        alt: format.alternate,
        no_neg_0: format.no_neg_0,
        ..Default::default()
    };
    let mut kind = format.kind.unwrap_or('\0');
    let mut default_precision = 6;
    if kind == '\0' {
        flags.add_dot_0 = true;
        kind = 'r';
        default_precision = 0;
    }
    if kind == 'n' {
        kind = 'g';
    }
    let mut value = value;
    let mut percent = false;
    if kind == '%' {
        kind = 'f';
        value *= 100.0;
        percent = true;
    }
    let mut precision = format.precision;
    if precision < 0 {
        precision = default_precision;
    } else if kind == 'r' {
        kind = 'g';
    }
    let mut text = double_to_string(value, kind, precision, flags)?;
    if percent {
        text.push('%');
    }
    let (negative, body) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text.as_str()),
    };
    let int_end = body
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(body.len());
    let digits = &body[..int_end];
    let rest = &body[int_end..];
    let has_decimal = rest.starts_with('.');
    let rest = if has_decimal { &rest[1..] } else { rest };
    let frac_end = rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    let thousands = if format.kind == Some('n') {
        Grouping::Locale
    } else {
        format.thousands
    };
    layout_number(
        format,
        negative,
        "",
        digits,
        has_decimal,
        &rest[..frac_end],
        &rest[frac_end..],
        thousands,
        format.frac_thousands,
        false,
    )
}

fn unknown_code(kind: char, value: &Json) -> String {
    if (' '..='~').contains(&kind) {
        value_error(&format!(
            "Unknown format code '{kind}' for object of type '{}'",
            type_name(value)
        ))
    } else {
        value_error(&format!(
            "Unknown format code '\\x{:x}' for object of type '{}'",
            kind as u32,
            type_name(value)
        ))
    }
}

/// `format(value, spec)` for a decoded value (str, int, float, bool, None, list, dict).
pub fn format_value(value: &Json, spec: &str) -> Result<String> {
    if spec.is_empty() {
        return py_str(value);
    }
    match value {
        Json::Str(s) => {
            let format = parse_spec(value, spec, Some('s'), '<')?;
            match format.kind {
                Some('s') => format_string(s, &format),
                Some(kind) => Err(unknown_code(kind, value)),
                None => unreachable!("default type"),
            }
        }
        Json::Int(_) | Json::Bool(_) => {
            let int = match value {
                Json::Int(i) => i.clone(),
                Json::Bool(b) => BigInt::from(u8::from(*b)),
                _ => unreachable!(),
            };
            let format = parse_spec(value, spec, Some('d'), '>')?;
            match format.kind {
                Some('b' | 'c' | 'd' | 'o' | 'x' | 'X' | 'n') => format_int(&int, &format),
                Some('e' | 'E' | 'f' | 'F' | 'g' | 'G' | '%') => {
                    format_float(int_to_float(&int)?, &format)
                }
                Some(kind) => Err(unknown_code(kind, value)),
                None => unreachable!("default type"),
            }
        }
        Json::Float(f) => {
            let format = parse_spec(value, spec, None, '>')?;
            match format.kind {
                None | Some('e' | 'E' | 'f' | 'F' | 'g' | 'G' | 'n' | '%') => {
                    format_float(*f, &format)
                }
                Some(kind) => Err(unknown_code(kind, value)),
            }
        }
        other => Err(format!(
            "TypeError: unsupported format string passed to {}.__format__",
            type_name(other)
        )),
    }
}

// ---------------------------------------------------------------- str.format

#[derive(Clone, Copy, PartialEq)]
enum AutoNumber {
    Init,
    Auto,
    Manual,
}

struct Formatter<'a> {
    args: &'a [Json],
    kwargs: &'a [(&'a str, Json)],
    state: AutoNumber,
    next_field: usize,
}

/// The field-name integer: all decimal digits (any script), else `None`.
fn field_integer(text: &[char]) -> Result<Option<usize>> {
    if text.is_empty() {
        return Ok(None);
    }
    let mut accumulator: usize = 0;
    for c in text {
        let Some(digit) = py::decimal_value(*c) else {
            return Ok(None);
        };
        accumulator = accumulator
            .checked_mul(10)
            .and_then(|a| a.checked_add(digit as usize))
            .filter(|a| *a <= isize::MAX as usize)
            .ok_or_else(|| value_error("Too many decimal digits in format string"))?;
    }
    Ok(Some(accumulator))
}

fn getattr(value: &Json, name: &str) -> Result<Json> {
    let found = match (value, name) {
        (Json::Int(i), "real" | "numerator") => Some(Json::Int(i.clone())),
        (Json::Bool(b), "real" | "numerator") => Some(Json::Int(BigInt::from(u8::from(*b)))),
        (Json::Int(_) | Json::Bool(_), "imag") => Some(Json::Int(BigInt::zero())),
        (Json::Int(_) | Json::Bool(_), "denominator") => Some(Json::Int(BigInt::from(1))),
        (Json::Float(f), "real") => Some(Json::Float(*f)),
        (Json::Float(_), "imag") => Some(Json::Float(0.0)),
        _ => None,
    };
    found.ok_or_else(|| {
        format!(
            "AttributeError: '{}' object has no attribute {}",
            type_name(value),
            py::repr_str(name)
        )
    })
}

fn getitem(value: &Json, name: &str, index: Option<usize>) -> Result<Json> {
    let not_subscriptable = || {
        Err(format!(
            "TypeError: '{}' object is not subscriptable",
            type_name(value)
        ))
    };
    match (value, index) {
        (Json::Array(items), Some(i)) => items
            .get(i)
            .cloned()
            .ok_or_else(|| "IndexError: list index out of range".into()),
        (Json::Str(s), Some(i)) => s
            .chars()
            .nth(i)
            .map(|c| Json::Str(c.to_string()))
            .ok_or_else(|| "IndexError: string index out of range".into()),
        (Json::Array(_), None) => {
            Err("TypeError: list indices must be integers or slices, not str".into())
        }
        (Json::Str(_), None) => Err("TypeError: string indices must be integers, not 'str'".into()),
        (Json::Object(_), Some(i)) => Err(format!("KeyError: {i}")),
        (Json::Object(_), None) => value
            .get(name)
            .cloned()
            .ok_or_else(|| format!("KeyError: {}", py::repr_str(name))),
        _ => not_subscriptable(),
    }
}

impl Formatter<'_> {
    fn field_object(&mut self, field: &[char]) -> Result<Json> {
        let split = field
            .iter()
            .position(|c| *c == '[' || *c == '.')
            .unwrap_or(field.len());
        let first = &field[..split];
        let mut index = field_integer(first)?;
        let empty = first.is_empty();
        if empty || index.is_some() {
            if self.state == AutoNumber::Init {
                self.state = if empty {
                    AutoNumber::Auto
                } else {
                    AutoNumber::Manual
                };
            }
            if self.state == AutoNumber::Manual && empty {
                return Err(value_error(
                    "cannot switch from manual field specification to automatic field numbering",
                ));
            }
            if self.state == AutoNumber::Auto && !empty {
                return Err(value_error(
                    "cannot switch from automatic field numbering to manual field specification",
                ));
            }
            if empty {
                index = Some(self.next_field);
                self.next_field += 1;
            }
        }
        let mut object = match index {
            None => {
                let key: String = first.iter().collect();
                self.kwargs
                    .iter()
                    .find(|(k, _)| *k == key)
                    .map(|(_, v)| v.clone())
                    .ok_or_else(|| format!("KeyError: {}", py::repr_str(&key)))?
            }
            Some(i) => self.args.get(i).cloned().ok_or_else(|| {
                format!("IndexError: Replacement index {i} out of range for positional args tuple")
            })?,
        };
        let mut pos = split;
        while pos < field.len() {
            let opener = field[pos];
            pos += 1;
            let start = pos;
            let name: String;
            match opener {
                '.' => {
                    while pos < field.len() && field[pos] != '[' && field[pos] != '.' {
                        pos += 1;
                    }
                    name = field[start..pos].iter().collect();
                    if name.is_empty() {
                        return Err(value_error("Empty attribute in format string"));
                    }
                    object = getattr(&object, &name)?;
                }
                '[' => {
                    while pos < field.len() && field[pos] != ']' {
                        pos += 1;
                    }
                    if pos >= field.len() {
                        return Err(value_error("Missing ']' in format string"));
                    }
                    let chars = &field[start..pos];
                    pos += 1;
                    if chars.is_empty() {
                        return Err(value_error("Empty attribute in format string"));
                    }
                    let index = field_integer(chars)?;
                    name = chars.iter().collect();
                    object = getitem(&object, &name, index)?;
                }
                _ => {
                    return Err(value_error(
                        "Only '.' or '[' may follow ']' in format field specifier",
                    ));
                }
            }
        }
        Ok(object)
    }

    fn build(&mut self, input: &[char], depth: u8) -> Result<String> {
        if depth == 0 {
            return Err(value_error("Max string recursion exceeded"));
        }
        let mut out = String::new();
        let mut pos = 0;
        let end = input.len();
        while pos < end {
            // Literal text up to an escaped or unescaped brace.
            let start = pos;
            let mut c = '\0';
            let mut markup = false;
            while pos < end {
                c = input[pos];
                pos += 1;
                if c == '{' || c == '}' {
                    markup = true;
                    break;
                }
            }
            let at_end = pos >= end;
            let mut len = pos - start;
            if c == '}' && markup && (at_end || input[pos] != '}') {
                return Err(value_error("Single '}' encountered in format string"));
            }
            if at_end && c == '{' && markup {
                return Err(value_error("Single '{' encountered in format string"));
            }
            if !at_end && markup {
                if input[pos] == c {
                    pos += 1;
                    markup = false;
                } else {
                    len -= 1;
                }
            }
            out.extend(&input[start..start + len]);
            if !markup {
                continue;
            }
            // parse_field
            let name_start = pos;
            let mut c = '\0';
            let mut stopped = false;
            while pos < end {
                c = input[pos];
                pos += 1;
                match c {
                    '{' => return Err(value_error("unexpected '{' in field name")),
                    '[' => {
                        while pos < end && input[pos] != ']' {
                            pos += 1;
                        }
                    }
                    '}' | ':' | '!' => {
                        stopped = true;
                        break;
                    }
                    _ => {}
                }
            }
            let name_end = pos - 1;
            let mut conversion = None;
            let mut spec: &[char] = &[];
            let mut needs_expanding = false;
            if stopped && (c == '!' || c == ':') {
                let mut closed = false;
                if c == '!' {
                    if pos >= end {
                        return Err(value_error(
                            "end of string while looking for conversion specifier",
                        ));
                    }
                    conversion = Some(input[pos]);
                    pos += 1;
                    if pos < end {
                        let next = input[pos];
                        pos += 1;
                        if next == '}' {
                            closed = true;
                        } else if next != ':' {
                            return Err(value_error("expected ':' after conversion specifier"));
                        }
                    }
                }
                if !closed {
                    let spec_start = pos;
                    let mut count = 1;
                    loop {
                        if pos >= end {
                            return Err(value_error("unmatched '{' in format spec"));
                        }
                        let s = input[pos];
                        pos += 1;
                        if s == '{' {
                            needs_expanding = true;
                            count += 1;
                        } else if s == '}' {
                            count -= 1;
                            if count == 0 {
                                spec = &input[spec_start..pos - 1];
                                break;
                            }
                        }
                    }
                }
            } else if !(stopped && c == '}') {
                return Err(value_error("expected '}' before end of string"));
            }
            // output_markup
            let mut object = self.field_object(&input[name_start..name_end])?;
            if let Some(conversion) = conversion {
                let converted = match conversion {
                    'r' => py_repr(&object)?,
                    's' => py_str(&object)?,
                    'a' => py_ascii(&object)?,
                    other if (other as u32) > 32 && (other as u32) < 127 => {
                        return Err(value_error(&format!(
                            "Unknown conversion specifier {other}"
                        )));
                    }
                    other => {
                        return Err(value_error(&format!(
                            "Unknown conversion specifier \\x{:x}",
                            other as u32
                        )));
                    }
                };
                object = Json::Str(converted);
            }
            let spec: String = if needs_expanding {
                self.build(spec, depth - 1)?
            } else {
                spec.iter().collect()
            };
            out.push_str(&format_value(&object, &spec)?);
        }
        Ok(out)
    }
}

/// `template.format(*args, **kwargs)`.
pub fn format(template: &str, args: &[Json], kwargs: &[(&str, Json)]) -> Result<String> {
    let input: Vec<char> = template.chars().collect();
    Formatter {
        args,
        kwargs,
        state: AutoNumber::Init,
        next_field: 0,
    }
    .build(&input, 2)
}

/// `sum(values)` with CPython's integer fast path and compensated float summation.
pub fn sum(values: &[Json]) -> Result<Json> {
    enum Total {
        Int(BigInt),
        Float(f64),
    }
    fn number(value: &Json) -> Option<Total> {
        match value {
            Json::Int(i) => Some(Total::Int(i.clone())),
            Json::Bool(b) => Some(Total::Int(BigInt::from(u8::from(*b)))),
            Json::Float(f) => Some(Total::Float(*f)),
            _ => None,
        }
    }
    fn add(total: Total, item: &Json) -> Result<Total> {
        let Some(item) = number(item) else {
            let left = match total {
                Total::Int(_) => "int",
                Total::Float(_) => "float",
            };
            return Err(format!(
                "TypeError: unsupported operand type(s) for +: '{left}' and '{}'",
                type_name(item)
            ));
        };
        Ok(match (total, item) {
            (Total::Int(a), Total::Int(b)) => Total::Int(a + b),
            (Total::Int(a), Total::Float(b)) => Total::Float(int_to_float(&a)? + b),
            (Total::Float(a), Total::Int(b)) => Total::Float(a + int_to_float(&b)?),
            (Total::Float(a), Total::Float(b)) => Total::Float(a + b),
        })
    }
    let mut items = values.iter();
    // Integer fast path: exact while every item is an int or bool within i64.
    let mut small: i64 = 0;
    let mut total: Option<Total> = None;
    for item in items.by_ref() {
        let b = match item {
            Json::Int(i) => i.to_i64(),
            Json::Bool(b) => Some(i64::from(*b)),
            _ => None,
        };
        if let Some(b) = b
            && let Some(sum) = small.checked_add(b)
        {
            small = sum;
            continue;
        }
        total = Some(add(Total::Int(BigInt::from(small)), item)?);
        break;
    }
    let Some(mut total) = total else {
        return Ok(Json::Int(BigInt::from(small)));
    };
    // Float fast path: Neumaier compensated summation.
    if let Total::Float(start) = total {
        let (mut hi, mut lo) = (start, 0.0f64);
        let mut fallback = None;
        for item in items.by_ref() {
            let x = match item {
                Json::Float(f) => *f,
                Json::Int(i) => int_to_float(i)?,
                Json::Bool(b) => f64::from(u8::from(*b)),
                other => {
                    fallback = Some(other);
                    break;
                }
            };
            let t = hi + x;
            if hi.abs() >= x.abs() {
                lo += (hi - t) + x;
            } else {
                lo += (x - t) + hi;
            }
            hi = t;
        }
        let value = if lo != 0.0 && lo.is_finite() {
            hi + lo
        } else {
            hi
        };
        match fallback {
            None => return Ok(Json::Float(value)),
            Some(item) => total = add(Total::Float(value), item)?,
        }
    }
    for item in items {
        total = add(total, item)?;
    }
    Ok(match total {
        Total::Int(i) => Json::Int(i),
        Total::Float(f) => Json::Float(f),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(value: Json, spec: &str) -> String {
        format_value(&value, spec).unwrap_or_else(|e| format!("ERR {e}"))
    }

    #[test]
    fn formats_like_python() {
        let float = Json::Float;
        let int = |i: i64| Json::Int(BigInt::from(i));
        for (value, spec, expected) in [
            (float(0.125), ".2f", "0.12"),
            (float(0.375), ".2f", "0.38"),
            (float(2.5), ".0f", "2"),
            (float(f64::INFINITY), "010", "0000000inf"),
            (float(f64::NEG_INFINITY), "010.2f", "-000000inf"),
            (float(f64::NAN), "+08", "+0000nan"),
            (float(1234.56789), ".4,f", "1234.567,9"),
            (float(1234.56789), ",.4_f", "1,234.567_9"),
            (int(1234), "010,", "00,001,234"),
            (float(1234.5), "010,.1f", "0,001,234.5"),
            (int(-1234), "=+12,", "-      1,234"),
            (float(1e20), ".3", "1e+20"),
            (float(1.0), ".3", "1.0"),
            (float(1234.5), ".2", "1.2e+03"),
            (float(100.0), "", "100.0"),
            (float(1e16), ",", "1e+16"),
            (float(0.0001), ".3", "0.0001"),
            (float(-0.0), "z.1f", "0.0"),
            (float(-0.0001), "z.1f", "0.0"),
            (int(255), "#x", "0xff"),
            (int(255), "#010_x", "0x000_00ff"),
            (int(1234567), "n", "1234567"),
            (float(1234.5), "n", "1234.5"),
            (Json::Bool(true), "", "True"),
            (Json::Bool(true), "d", "1"),
            (Json::Bool(true), ".2f", "1.00"),
            (int(12), "c", "\x0c"),
            (float(0.5), "%", "50.000000%"),
            (float(1e-7), "g", "1e-07"),
            (float(123456789.0), "g", "1.23457e+08"),
            (float(99.99999999999999), ",.2f", "100.00"),
            (float(0.0040741237836483535), ".4%", "0.4074%"),
            (int(255), "X", "FF"),
            (int(-255), "#X", "-0XFF"),
            (Json::Str("ab".into()), "^6", "  ab  "),
            (Json::Str("abc".into()), ".2", "ab"),
            (Json::Null, "", "None"),
        ] {
            assert_eq!(f(value, spec), expected, "{spec}");
        }
        assert!(f(Json::Null, "x").starts_with("ERR TypeError"));
        assert!(f(Json::Str("x".into()), "+").starts_with("ERR ValueError: Sign"));
    }

    #[test]
    fn formats_templates_like_python() {
        let values = [Json::Float(400.0), Json::Float(86.4), Json::Float(129.6)];
        let total = sum(&values).unwrap();
        let text = format(
            "{0:,.2f}, {1:,.2f} and {2:,.2f}; total {total:,.2f}. {{x}}",
            &values,
            &[("total", total)],
        )
        .unwrap();
        assert_eq!(text, "400.00, 86.40 and 129.60; total 616.00. {x}");
        assert_eq!(
            format("{} {}", &[Json::Str("a".into())], &[]).unwrap_err(),
            "IndexError: Replacement index 1 out of range for positional args tuple"
        );
        assert!(format("{0} {}", &[Json::Null], &[]).is_err());
        assert!(format("}", &[], &[]).is_err());
        assert_eq!(
            format("{0!r:>8}", &[Json::Str("é".into())], &[]).unwrap(),
            "     'é'"
        );
        assert_eq!(
            format(
                "{0:{1}}",
                &[Json::Str("ab".into()), Json::Str(">4".into())],
                &[]
            )
            .unwrap(),
            "  ab"
        );
    }

    #[test]
    fn shortest_repr_ties_to_even() {
        assert_eq!(py::float_repr(720084694934744.2), "720084694934744.2");
        assert_eq!(f(Json::Float(720084694934744.2), "0"), "720084694934744.2");
        assert_eq!(py::float_repr(0.1), "0.1");
        assert_eq!(py::float_repr(5e-324), "5e-324");
    }

    #[test]
    fn sums_like_python() {
        let values = [0.1, 0.2, 0.3].map(Json::Float);
        assert_eq!(sum(&values).unwrap().repr(), "0.6");
        let mixed = [
            Json::Int(BigInt::from(1)),
            Json::Float(0.5),
            Json::Bool(true),
        ];
        assert_eq!(sum(&mixed).unwrap().repr(), "2.5");
        assert!(sum(&[Json::Str("x".into())]).is_err());
    }
}
