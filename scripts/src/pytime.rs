//! The `datetime` parsing the checks use: two `strptime` formats and `fromisoformat`.
//!
//! `strptime` builds a regex from its format and accepts the first match only when it
//! consumes the whole string ("unconverted data remains" otherwise), so the
//! alternations below keep CPython's order. `fromisoformat` follows CPython's C parser,
//! which reads ASCII digits only.
use crate::py::Date;
use crate::pyre::{I, re};

const MONTHS: [&str; 12] = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];
const DAY: &str = r"(?P<d>3[01]|[12]\d|0[1-9]|[1-9]| [1-9])";
const YEAR: &str = r"(?P<Y>\d\d\d\d)";

fn int(text: &str) -> Option<i64> {
    crate::py::parse_int(text, 10)
        .ok()?
        .to_string()
        .parse()
        .ok()
}

fn finish(
    text: &str,
    pattern: &str,
    month: impl Fn(&fancy_regex::Captures<'_, str>) -> Option<i64>,
) -> Option<Date> {
    let found = re(pattern, I).match_at(text, 0)?;
    if found.get(0)?.end() != text.len() {
        return None;
    }
    let year = int(&found["Y"])?;
    let day = int(found["d"].trim_start())?;
    Date::new(year, month(&found)?, day).ok()
}

/// `datetime.strptime(text, "%d %B %Y").date()`, or `None` for its ValueError.
pub fn strptime_day_month_year(text: &str) -> Option<Date> {
    // _strptime lists alternatives longest first so a prefix never wins.
    let mut names: Vec<&str> = MONTHS.to_vec();
    names.sort_by_key(|n| std::cmp::Reverse(n.len()));
    let pattern = format!(r"{DAY}\s+(?P<B>{})\s+{YEAR}", names.join("|"));
    finish(text, &pattern, |m| {
        let name = m["B"].to_lowercase();
        MONTHS.iter().position(|n| *n == name).map(|i| i as i64 + 1)
    })
}

/// `datetime.strptime(text, "%Y%m%d")`, or `None` for its ValueError.
pub fn strptime_compact(text: &str) -> Option<Date> {
    let pattern = format!(r"{YEAR}(?P<m>1[0-2]|0[1-9]|[1-9]){DAY}");
    finish(text, &pattern, |m| int(&m["m"]))
}

/// A parsed `datetime.fromisoformat` value: microseconds since the epoch in local wall
/// time, and the UTC offset in microseconds when the string carried one.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct IsoDateTime {
    pub local_micros: i128,
    pub offset_micros: Option<i128>,
}

impl IsoDateTime {
    /// The instant, for comparing aware values.
    pub fn utc_micros(&self) -> Option<i128> {
        self.offset_micros.map(|o| self.local_micros - o)
    }
}

fn digits(text: &[u8], at: usize, count: usize) -> Option<i64> {
    let slice = text.get(at..at + count)?;
    slice
        .iter()
        .all(u8::is_ascii_digit)
        .then(|| slice.iter().fold(0i64, |n, d| n * 10 + i64::from(d - b'0')))
}

fn separator_location(s: &[u8]) -> Option<usize> {
    let n = s.len();
    if n == 7 {
        return Some(7);
    }
    if s[4] == b'-' {
        if s[5] == b'W' {
            if n < 8 {
                return None;
            }
            if n > 8 && s[8] == b'-' {
                if n == 9 {
                    return None;
                }
                if n > 10 && s[10].is_ascii_digit() {
                    return Some(8);
                }
                return Some(10);
            }
            return Some(8);
        }
        return Some(10);
    }
    if s[4] == b'W' {
        let mut idx = 7;
        while idx < n && s[idx].is_ascii_digit() {
            idx += 1;
        }
        if idx < 9 {
            return Some(idx);
        }
        return Some(if idx % 2 == 0 { 7 } else { 8 });
    }
    Some(8)
}

fn iso_week(year: i64, week: i64, day: i64) -> Option<Date> {
    if !(1..=9999).contains(&year) {
        return None;
    }
    let jan1 = Date::new(year, 1, 1).ok()?.ordinal();
    if !(1..53).contains(&week) {
        let first_weekday = jan1 % 7;
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        if !(week == 53 && (first_weekday == 4 || (first_weekday == 3 && leap))) {
            return None;
        }
    }
    if !(1..8).contains(&day) {
        return None;
    }
    // _isoweek1monday: the Monday of week 1.
    let weekday = (jan1 + 6) % 7;
    let mut monday = jan1 - weekday;
    if weekday > 3 {
        monday += 7;
    }
    Date::from_ordinal(monday + (week - 1) * 7 + (day - 1))
}

fn parse_date(s: &[u8]) -> Option<(i64, i64, i64)> {
    if ![7, 8, 10].contains(&s.len()) {
        return None;
    }
    let year = digits(s, 0, 4)?;
    let has_sep = s[4] == b'-';
    let mut pos = 4 + usize::from(has_sep);
    if s.get(pos) == Some(&b'W') {
        pos += 1;
        let week = digits(s, pos, 2)?;
        pos += 2;
        let mut day = 1;
        if s.len() > pos {
            if (s[pos] == b'-') != has_sep {
                return None;
            }
            pos += usize::from(has_sep);
            day = digits(s, pos, 1)?;
            if pos + 1 != s.len() {
                return None;
            }
        }
        let date = iso_week(year, week, day)?;
        return Some((
            i64::from(date.year),
            i64::from(date.month),
            i64::from(date.day),
        ));
    }
    let month = digits(s, pos, 2)?;
    pos += 2;
    if (s.get(pos) == Some(&b'-')) != has_sep {
        return None;
    }
    pos += usize::from(has_sep);
    let day = digits(s, pos, 2)?;
    (pos + 2 == s.len()).then_some((year, month, day))
}

/// HH[:?MM[:?SS[{.,}fff[fff]]]] as [hour, minute, second, microsecond].
fn hh_mm_ss_ff(s: &[u8]) -> Option<[i64; 4]> {
    let mut comps = [0i64; 4];
    let mut pos = 0;
    let mut has_sep = false;
    for (comp, slot) in comps.iter_mut().take(3).enumerate() {
        if s.len() - pos < 2 {
            return None;
        }
        *slot = digits(s, pos, 2)?;
        pos += 2;
        let next = s.get(pos).copied();
        if comp == 0 {
            has_sep = next == Some(b':');
        }
        if next.is_none() || comp >= 2 {
            break;
        }
        if has_sep && next != Some(b':') {
            return None;
        }
        pos += usize::from(has_sep);
    }
    if pos < s.len() {
        if !matches!(s[pos], b'.' | b',') {
            return None;
        }
        pos += 1;
        let fraction = &s[pos..];
        if fraction.is_empty() || !fraction.iter().all(u8::is_ascii_digit) {
            return None;
        }
        let used = fraction.len().min(6);
        let mut value = digits(fraction, 0, used)?;
        for _ in used..6 {
            value *= 10;
        }
        comps[3] = value;
    }
    Some(comps)
}

const DAY_MICROS: i128 = 86_400_000_000;

/// `datetime.fromisoformat(text)`, or `None` for its ValueError.
pub fn datetime_fromisoformat(text: &str) -> Option<IsoDateTime> {
    // Positions below are bytes; any non-ASCII character in the date part fails as a digit.
    if text.chars().count() < 7 {
        return None;
    }
    let bytes = text.as_bytes();
    let location = separator_location(bytes)?;
    let date_part = bytes.get(..location)?;
    let (mut year, mut month, mut day) = parse_date(date_part)?;
    // The separator may be any one character.
    let rest = text.get(location..).unwrap_or("");
    let time = rest.char_indices().nth(1).map_or("", |(i, _)| &rest[i..]);
    let mut micros: i128 = 0;
    let mut offset = None;
    if !time.is_empty() {
        let t = time.as_bytes();
        if t.len() < 2 {
            return None;
        }
        let tz_pos = time
            .find('-')
            .or_else(|| time.find('+'))
            .or_else(|| time.find('Z'))
            .map(|i| i + 1);
        let clock = match tz_pos {
            Some(p) => &t[..p - 1],
            None => t,
        };
        let [hour, minute, second, micro] = hh_mm_ss_ff(clock)?;
        let mut next_day = false;
        let mut hour = hour;
        if hour == 24 {
            if minute == 0 && second == 0 && micro == 0 {
                hour = 0;
                next_day = true;
            } else {
                return None;
            }
        }
        if let Some(p) = tz_pos {
            if p == t.len() && t[t.len() - 1] == b'Z' {
                offset = Some(0);
            } else {
                let zone = &t[p..];
                if [0, 1, 3].contains(&zone.len()) || t[p - 1] == b'Z' {
                    return None;
                }
                let [zh, zm, zs, zf] = hh_mm_ss_ff(zone)?;
                if !(0..=23).contains(&zh) || !(0..=59).contains(&zm) || !(0..=59).contains(&zs) {
                    return None;
                }
                let sign = if t[p - 1] == b'-' { -1 } else { 1 };
                offset = Some(
                    sign * (i128::from(zh) * 3_600_000_000
                        + i128::from(zm) * 60_000_000
                        + i128::from(zs) * 1_000_000
                        + i128::from(zf)),
                );
            }
        }
        if !(0..=23).contains(&hour) || !(0..=59).contains(&minute) || !(0..=59).contains(&second) {
            return None;
        }
        if next_day && (1..=12).contains(&month) {
            let days = Date::new(year, month, 1)
                .ok()
                .map(|_| days_in_month(year, month))?;
            if day <= days {
                day += 1;
                if day > days {
                    day = 1;
                    month += 1;
                    if month > 12 {
                        month = 1;
                        year += 1;
                    }
                }
            }
        }
        micros = i128::from(hour) * 3_600_000_000
            + i128::from(minute) * 60_000_000
            + i128::from(second) * 1_000_000
            + i128::from(micro);
    }
    let date = Date::new(year, month, day).ok()?;
    // Days since 1970-01-01 from the proleptic Gregorian ordinal (0001-01-01 is 1).
    let days = i128::from(date.ordinal() - 719_163);
    Some(IsoDateTime {
        local_micros: days * DAY_MICROS + micros,
        offset_micros: offset,
    })
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        2 if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// Microseconds since the epoch now, as `datetime.now(tz)` compares with an aware value.
pub fn now_utc_micros() -> i128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| {
            i128::from(d.as_secs()) * 1_000_000 + i128::from(d.subsec_micros())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strptime_keeps_cpython_matching() {
        assert_eq!(
            strptime_day_month_year("6 October 2026").map(|d| d.isoformat()),
            Some("2026-10-06".into())
        );
        assert!(strptime_day_month_year("31 February 2026").is_none());
        assert!(strptime_compact("20300230").is_none());
        assert!(strptime_compact("20301301").is_none());
        assert_eq!(
            strptime_compact("20300101").map(|d| d.isoformat()),
            Some("2030-01-01".into())
        );
    }

    #[test]
    fn fromisoformat_reads_zones_and_refuses_naive_garbage() {
        let parsed = datetime_fromisoformat("2027-08-31T14:00:00.000+00:00").unwrap();
        assert_eq!(parsed.offset_micros, Some(0));
        assert!(
            datetime_fromisoformat("2027-08-31T14:00:00")
                .unwrap()
                .offset_micros
                .is_none()
        );
        assert!(datetime_fromisoformat("2027-08-31T25:00:00Z").is_none());
        assert!(datetime_fromisoformat("2027-08-31 14:00+10:00").is_some());
        assert!(datetime_fromisoformat("2027-02-30").is_none());
        assert_eq!(
            datetime_fromisoformat("2026W011").unwrap().local_micros,
            datetime_fromisoformat("2025-12-29").unwrap().local_micros
        );
    }
}
