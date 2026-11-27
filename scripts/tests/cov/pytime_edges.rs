// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! `pytime::datetime_fromisoformat` against Python 3.15's `datetime.fromisoformat` on the
//! shapes that pick a separator from a run of digits, week 1 starting in the next week,
//! misplaced separators and midnight at 24:00 on a day that does not exist. Each expected
//! value is the microseconds since 1970 that Python gives, or its ValueError.
use site_tools::pytime::datetime_fromisoformat;

#[test]
fn reads_what_python_reads() {
    for (text, micros) in [
        // A compact week date followed by 3 digits: Python splits after the week, so the
        // third digit is the separator and the last 2 the hour.
        ("2026W01123", 1_767_049_200_000_000),
        // 2027 starts on a Friday, so its week 1 starts on the Monday after.
        ("2027-W01-1", 1_799_020_800_000_000),
        ("2027W011", 1_799_020_800_000_000),
        ("2026-W01-1T10", 1_767_002_400_000_000),
        // 24:00 is midnight of the next day, across the end of a month and a year.
        ("2026-11-30T24:00", 1_796_083_200_000_000),
        ("2026-12-31T24:00", 1_798_761_600_000_000),
    ] {
        let read = datetime_fromisoformat(text).map(|d| (d.local_micros, d.offset_micros));
        assert_eq!(read, Some((micros, None)), "{text}");
    }
}

#[test]
fn refuses_what_python_refuses() {
    for text in [
        // An odd run of digits after a compact week leaves the hour 34.
        "2026W011234",
        // A calendar date whose month and day are not parted as its year and month are.
        "2026-11x05",
        "202611-5",
        // A clock whose minutes and seconds are not parted as its hour and minutes are.
        "2026-11-24T12:3045",
        // After the seconds only a fraction may follow.
        "2026-11-24T12:34:56x",
        "2026-11-24T123456x",
        // A week date's day must be a digit.
        "2026-W01-x",
        // 24:00 on a day the month does not have.
        "2026-02-30T24:00",
    ] {
        assert!(datetime_fromisoformat(text).is_none(), "{text}");
    }
}
