// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! The figures and dates a page states, written as the depreciation rates page writes them.
use crate::effective_life::Life;

/// `numerator / denominator` rounded half up.
fn round_half_up(numerator: u64, denominator: u64) -> u64 {
    (2 * numerator + denominator) / (2 * denominator)
}

/// Hundredths of a per cent as text: 1500 is '15.00%'.
fn percent(hundredths: u64) -> String {
    format!("{}.{:02}%", hundredths / 100, hundredths % 100)
}

/// The prime cost rate, 100% divided by the life (section 40-75 of the Income Tax
/// Assessment Act 1997), to 2 decimal places, as `assets/depreciation-rates.mjs` gives it.
pub fn prime_cost(life: &Life) -> String {
    percent(round_half_up(10_000 * 12, u64::from(life.months)))
}

/// The diminishing value rate for an asset held from 10 May 2006, 200% divided by the
/// life (section 40-72).
pub fn diminishing_value(life: &Life) -> String {
    percent(round_half_up(20_000 * 12, u64::from(life.months)))
}

/// '1 year' or '13 1/3 years', as the instrument prints the life.
pub fn years(life: &Life) -> String {
    let unit = if life.years == "1" { "year" } else { "years" };
    format!("{} {unit}", life.years)
}

const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// An ISO date as '1 July 2008'; text that is not one is returned as it is.
pub fn date(iso: &str) -> String {
    let parts: Vec<&str> = iso.split('-').collect();
    let [year, month, day] = parts[..] else {
        return iso.to_owned();
    };
    match (month.parse::<usize>(), day.parse::<u32>()) {
        (Ok(month @ 1..=12), Ok(day)) => format!("{day} {} {year}", MONTHS[month - 1]),
        _ => iso.to_owned(),
    }
}

/// A count with thousands separators: 7430 is '7,430'.
pub fn count(value: usize) -> String {
    let digits = value.to_string();
    let mut out = String::new();
    for (i, digit) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(digit);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_iso_date_is_written_out_and_other_text_is_kept() {
        assert_eq!(date("2008-07-01"), "1 July 2008");
        assert_eq!(date("2008-07"), "2008-07");
        assert_eq!(date("2008-13-01"), "2008-13-01");
    }
}
