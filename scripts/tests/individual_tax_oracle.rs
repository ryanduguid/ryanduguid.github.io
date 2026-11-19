// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! An independent oracle for the individual tax engines: `assets/income-tax.mjs`,
//! `assets/study-loan.mjs`, `assets/take-home-pay.mjs`, `assets/payg-withholding.mjs` and
//! `assets/division-293.mjs`.
//! Seeded fictional cases are worked here in exact integers, by a route the engines do not take,
//! and each result must equal what the browser modules return under Node.
//!
//! The engines apply each band's rate per cent to the part of income in it, as Schedule 7 of the
//! Income Tax Rates Act 1986 writes the scales; the oracle reads the ATO's printed tables instead,
//! a base amount plus cents for each dollar over the band's threshold, typed here from the ATO's
//! pages read on 17 and 18 November 2026, so a slip in either transcription shows. The low income
//! tax offset takes 5% of the income between $37,500 and $45,000 and 1.5% of the income above it off
//! $700, where the engine branches by band. The low and middle income tax offset for 2021-22 follows
//! the ATO's table, which builds the $420 into each row, where the engine adds it as section
//! 61-107(1A) does. The study loan repayment uses the ATO's printed range for each rule, where the
//! engine takes the lesser of the two amounts section 154-20 sets. The Medicare levy surcharge reads
//! the ATO's singles and family columns, where the engine doubles the singles thresholds. The
//! Schedule 1 and 8 coefficients are typed from the ATO's pages and, before 2026-27, from the
//! withholding schedules instruments, not copied from the engine; Schedule 8's earlier component is
//! worked as a rate of all the weekly earnings, where the engine writes it as y = ax − b with b nil.
//!
//! The route is independent; the conventions are not. Both round a half cent up and cap the offsets
//! at the tax, and the take-home oracle splits a package including super by the engine's formula,
//! so it checks how the parts combine, not that split.
//! The engines run from the repository's own `assets/`, not the rendered site.

use serde_json::{Value, json};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

const HARNESS: &str = r"
import { incomeTax, medicareLevySurcharge } from './assets/income-tax.mjs';
import { studyLoanRepayment } from './assets/study-loan.mjs';
import { takeHomePay } from './assets/take-home-pay.mjs';
import { division293Tax } from './assets/division-293.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const cents = (result) => result === null ? null : Object.fromEntries(Object.entries(result)
  .map(([key, value]) => [key, typeof value === 'number' ? Math.round(value * 100)
    : typeof value === 'object' ? cents(value) : value]));
const run = {
  tax: ({ income, year, residency }) => cents(incomeTax(String(income), year, residency)),
  loan: ({ income, year }) => cents(studyLoanRepayment({ taxable: String(income), fringe: '0', losses: '0',
    super: '0', foreign: '0' }, year)),
  pay: ({ pay }) => cents(takeHomePay(pay)),
  mls: ({ mls }) => cents(medicareLevySurcharge(mls)),
  d293: ({ d293 }) => cents(division293Tax(d293)),
};
process.stdout.write(JSON.stringify(JSON.parse(input).map((one) => run[one.kind](one))));
";

const YEARS: [&str; 7] = [
    "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27",
];
const PAY_YEARS: [&str; 6] = [
    "2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27",
];
const RESIDENCY: [&str; 3] = ["resident", "foreign", "working-holiday"];
const PERIODS: [(&str, u64); 4] = [("year", 1), ("month", 12), ("fortnight", 26), ("week", 52)];
const TAX_CASES: usize = 700;
const LOAN_CASES: usize = 400;
const PAY_CASES: usize = 900;
const MLS_CASES: usize = 400;
const DIVISION_293_CASES: usize = 600;

/// A fixed sequence (xorshift64*), so a failure names a case that reappears on a rerun.
struct Seeded(u64);

impl Seeded {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x9E37_79B9_7F4A_7C15)
    }

    fn below(&mut self, limit: u64) -> u64 {
        self.next() % limit
    }

    fn pick<T: Copy>(&mut self, choices: &[T]) -> T {
        choices[self.below(choices.len() as u64) as usize]
    }

    /// Whole dollars: a threshold give or take a dollar, or any amount to $400,000.
    fn income(&mut self, thresholds: &[u64]) -> u64 {
        if self.below(2) == 0 {
            let at = self.pick(thresholds);
            (at + self.below(3)).saturating_sub(1)
        } else {
            self.below(400_001)
        }
    }
}

/// One row of an ATO table: income above `over` pays `base` dollars plus `tenths` of a cent for
/// each dollar over.
type Row = (u64, u64, u64);

/// The ATO's tables: 'Tax rates – Australian resident' (last updated 13 August 2026), 'Tax rates –
/// foreign resident' and 'Tax rates – working holiday maker' (both last updated 1 June 2026). The
/// working holiday maker table prints 2025-26 and earlier; Part III's table is the same for
/// 2024-25 or a later year.
fn table(year: &str, residency: &str) -> &'static [Row] {
    let before = matches!(year, "2020-21" | "2021-22" | "2022-23" | "2023-24");
    match (residency, year, before) {
        ("resident", _, true) => &[
            (0, 0, 0),
            (18_200, 0, 190),
            (45_000, 5_092, 325),
            (120_000, 29_467, 370),
            (180_000, 51_667, 450),
        ],
        ("resident", "2026-27", _) => &[
            (0, 0, 0),
            (18_200, 0, 150),
            (45_000, 4_020, 300),
            (135_000, 31_020, 370),
            (190_000, 51_370, 450),
        ],
        ("resident", ..) => &[
            (0, 0, 0),
            (18_200, 0, 160),
            (45_000, 4_288, 300),
            (135_000, 31_288, 370),
            (190_000, 51_638, 450),
        ],
        ("foreign", _, true) => &[(0, 0, 325), (120_000, 39_000, 370), (180_000, 61_200, 450)],
        ("foreign", ..) => &[(0, 0, 300), (135_000, 40_500, 370), (190_000, 60_850, 450)],
        (_, _, true) => &[
            (0, 0, 150),
            (45_000, 6_750, 325),
            (120_000, 31_125, 370),
            (180_000, 53_325, 450),
        ],
        _ => &[
            (0, 0, 150),
            (45_000, 6_750, 300),
            (135_000, 33_750, 370),
            (190_000, 54_100, 450),
        ],
    }
}

fn half_up(numerator: u64, denominator: u64) -> u64 {
    (2 * numerator + denominator) / (2 * denominator)
}

/// Tax in cents on whole dollars, from the last row whose threshold the income passes.
fn table_tax(income: u64, rows: &[Row]) -> u64 {
    let &(over, base, tenths) = rows
        .iter()
        .rev()
        .find(|(over, ..)| income > *over)
        .unwrap_or(&rows[0]);
    half_up(base * 1000 + income.saturating_sub(over) * tenths, 10)
}

/// $700 less 5% of income between $37,500 and $45,000, less 1.5% of income above $45,000, never
/// below nil, in tenths of a cent and then half up; nil above $66,667 (s 61-110(1)(b)).
fn offset(income: u64) -> u64 {
    if income > 66_667 {
        return 0;
    }
    let first = income.clamp(37_500, 45_000) - 37_500;
    let second = income.max(45_000) - 45_000;
    let tenths = 700_000_i64 - first as i64 * 50 - second as i64 * 15;
    (tenths.max(0) as u64 + 5) / 10
}

/// The ATO's 'Low and middle income earner tax offsets' table (last updated 16 June 2025): for
/// 2021-22, $675 to $37,000, plus 7.5 cents a dollar to $1,500 at $48,000, $1,500 to $90,000, then
/// less 3 cents a dollar; for 2020-21 the same from $255 and $1,080. The table reaches $420 at
/// $126,000 for 2021-22; section 61-107(1A) of the Act gives nil there, which the oracle follows.
fn lmito(income: u64, year: &str) -> u64 {
    let (low, high) = match year {
        "2021-22" => (675_000, 1_500_000),
        "2020-21" => (255_000, 1_080_000),
        _ => return 0,
    };
    if income >= 126_000 {
        return 0;
    }
    let tenths = if income <= 37_000 {
        low
    } else if income <= 48_000 {
        low + (income - 37_000) * 75
    } else if income <= 90_000 {
        high
    } else {
        high - (income - 90_000) * 30
    };
    (tenths + 5) / 10
}

/// Medicare Levy Act 1986 s 3(1), [threshold amount, phase-in limit], as the ATO's return
/// instructions for each year (myTax 2021 to 2025, Medicare levy reduction or exemption) and its
/// 'Medicare levy reduction for low-income earners' page give them.
fn medicare_thresholds(year: &str) -> (u64, u64) {
    match year {
        "2020-21" => (23_226, 29_032),
        "2021-22" => (23_365, 29_206),
        "2022-23" => (24_276, 30_345),
        "2023-24" => (26_000, 32_500),
        "2024-25" => (27_222, 34_027),
        _ => (28_011, 35_013),
    }
}

fn medicare(income: u64, year: &str) -> u64 {
    let (threshold, limit) = medicare_thresholds(year);
    if income <= threshold {
        0
    } else if income <= limit {
        (income - threshold) * 10
    } else {
        income * 2
    }
}

fn tax_oracle(income: u64, year: &str, residency: &str) -> Value {
    let tax = table_tax(income, table(year, residency));
    let resident = residency == "resident";
    let offset = if resident { offset(income).min(tax) } else { 0 };
    let lmito = if resident {
        lmito(income, year).min(tax - offset)
    } else {
        0
    };
    let levy = if resident { medicare(income, year) } else { 0 };
    let net = tax - offset - lmito;
    json!({"tax": tax, "offset": offset, "lmito": lmito, "netTax": net, "medicare": levy, "total": net + levy})
}

// The ATO's 'Study and training loan repayment thresholds and rates' (last updated 30 June 2026),
// Tables 3 to 7: each band's first dollar and its rate in tenths of a per cent.
const TABLE_3: [(u64, u64); 18] = [
    (54_435, 10),
    (62_851, 20),
    (66_621, 25),
    (70_619, 30),
    (74_856, 35),
    (79_347, 40),
    (84_108, 45),
    (89_155, 50),
    (94_504, 55),
    (100_175, 60),
    (106_186, 65),
    (112_557, 70),
    (119_310, 75),
    (126_468, 80),
    (134_057, 85),
    (142_101, 90),
    (150_627, 95),
    (159_664, 100),
];
const TABLE_4: [(u64, u64); 18] = [
    (51_550, 10),
    (59_519, 20),
    (63_090, 25),
    (66_876, 30),
    (70_889, 35),
    (75_141, 40),
    (79_650, 45),
    (84_430, 50),
    (89_495, 55),
    (94_866, 60),
    (100_558, 65),
    (106_591, 70),
    (112_986, 75),
    (119_765, 80),
    (126_951, 85),
    (134_569, 90),
    (142_643, 95),
    (151_201, 100),
];
const TABLE_5: [(u64, u64); 18] = [
    (48_361, 10),
    (55_837, 20),
    (59_187, 25),
    (62_739, 30),
    (66_503, 35),
    (70_493, 40),
    (74_723, 45),
    (79_207, 50),
    (83_959, 55),
    (88_997, 60),
    (94_337, 65),
    (99_997, 70),
    (105_997, 75),
    (112_356, 80),
    (119_098, 85),
    (126_244, 90),
    (133_819, 95),
    (141_848, 100),
];
const TABLE_6: [(u64, u64); 18] = [
    (47_014, 10),
    (54_283, 20),
    (57_539, 25),
    (60_992, 30),
    (64_652, 35),
    (68_530, 40),
    (72_642, 45),
    (77_002, 50),
    (81_621, 55),
    (86_519, 60),
    (91_710, 65),
    (97_213, 70),
    (103_046, 75),
    (109_228, 80),
    (115_782, 85),
    (122_729, 90),
    (130_093, 95),
    (137_898, 100),
];
const TABLE_7: [(u64, u64); 18] = [
    (46_620, 10),
    (53_827, 20),
    (57_056, 25),
    (60_480, 30),
    (64_109, 35),
    (67_955, 40),
    (72_032, 45),
    (76_355, 50),
    (80_936, 55),
    (85_793, 60),
    (90_940, 65),
    (96_397, 70),
    (102_180, 75),
    (108_310, 80),
    (114_810, 85),
    (121_699, 90),
    (129_000, 95),
    (136_740, 100),
];

/// Tables 1 and 2 as ranges, with the 17% band's base as section 154-20(2) gives it (15% of the
/// first band, $9,028.35 for 2026-27, which the page prints as $9,028), and Tables 3 to 7 for
/// 2024-25 back to 2020-21.
fn loan_oracle(income: u64, year: &str) -> Value {
    let bands = match year {
        "2024-25" => Some(&TABLE_3),
        "2023-24" => Some(&TABLE_4),
        "2022-23" => Some(&TABLE_5),
        "2021-22" => Some(&TABLE_6),
        "2020-21" => Some(&TABLE_7),
        _ => None,
    };
    let (repayment, method) = if let Some(bands) = bands {
        match bands.iter().rev().find(|(from, _)| income >= *from) {
            Some((_, tenths)) => ((income * tenths + 5) / 10, "percent-of-income"),
            None => (0, "nil"),
        }
    } else {
        let (minimum, top, flat_from) = if year == "2026-27" {
            (69_528, 129_717, 186_051)
        } else {
            (67_000, 125_000, 179_286)
        };
        if income <= minimum {
            (0, "nil")
        } else if income >= flat_from {
            (income * 10, "ten-percent")
        } else if income <= top {
            ((income - minimum) * 15, "marginal")
        } else {
            ((top - minimum) * 15 + (income - top) * 17, "marginal")
        }
    };
    json!({"repaymentIncome": income * 100, "repayment": repayment, "method": method})
}

/// Super guarantee per mille and the year's maximum contribution base in dollars, from the ATO's
/// 'Super guarantee' page (Tables 21, 23 and 24, last updated 17 April 2026), and the general
/// concessional contributions cap from 'Contributions caps' (Table 1.1, last updated 11 September
/// 2026).
fn super_guarantee(year: &str) -> (u64, u64, u64) {
    match year {
        "2026-27" => (120, 270_830, 32_500),
        "2025-26" => (120, 62_500 * 4, 30_000),
        "2024-25" => (115, 65_070 * 4, 30_000),
        "2023-24" => (110, 62_270 * 4, 27_500),
        "2022-23" => (105, 60_220 * 4, 27_500),
        _ => (100, 58_920 * 4, 27_500),
    }
}

/// The ATO's 'Medicare levy surcharge income, thresholds and rates' (last updated 22 June 2026)
/// for 2022-23 to 2026-27, and the 2021 and 2022 return instructions for the 2 years before: the
/// singles and family columns, the first dollar of each tier from the base tier.
fn surcharge_tiers(year: &str, family: bool) -> [u64; 3] {
    let singles = match year {
        "2026-27" => [105_000, 123_000, 164_000],
        "2025-26" => [101_000, 118_000, 158_000],
        "2024-25" => [97_000, 113_000, 151_000],
        "2023-24" => [93_000, 108_000, 144_000],
        _ => [90_000, 105_000, 140_000],
    };
    let families = match year {
        "2026-27" => [210_000, 246_000, 328_000],
        "2025-26" => [202_000, 236_000, 316_000],
        "2024-25" => [194_000, 226_000, 302_000],
        "2023-24" => [186_000, 216_000, 288_000],
        _ => [180_000, 210_000, 280_000],
    };
    if family { families } else { singles }
}

fn days_in(year: &str) -> u64 {
    if year == "2023-24" { 366 } else { 365 }
}

/// The surcharge rate in hundredths of a per cent for income for surcharge purposes `tested`
/// against the year's tiers, each raised by $1,500 for every dependent child after the first
/// (Private Health Insurance Act 2007 s 22-40).
fn surcharge_rate(tested: u64, year: &str, family: bool, children: u64) -> u64 {
    let raise = children.saturating_sub(1) * 1_500;
    let [first, second, third] = surcharge_tiers(year, family).map(|tier| tier + raise);
    if tested <= first {
        0
    } else if tested <= second {
        100
    } else if tested <= third {
        125
    } else {
        150
    }
}

fn mls_oracle(case: &Value) -> Value {
    let get = |key: &str| case[key].as_u64().unwrap();
    let year = case["year"].as_str().unwrap();
    let income = get("taxable") + get("fringe") + get("super") + get("losses");
    let spouse = case["spouse"].as_u64();
    let children = get("children");
    let family = spouse.is_some() || children > 0;
    let tested = income + spouse.unwrap_or(0);
    // Medicare Levy Act 1986 s 8D(3)(c): with a spouse, nothing unless the person's own income
    // exceeds the year's threshold amount.
    let own = spouse.is_none() || income > medicare_thresholds(year).0;
    let rate = if own {
        surcharge_rate(tested, year, family, children)
    } else {
        0
    };
    let threshold = surcharge_tiers(year, family)[0] + children.saturating_sub(1) * 1_500;
    let surcharge = half_up(
        (get("taxable") + get("fringe")) * rate * get("uncoveredDays"),
        100 * days_in(year),
    );
    json!({"income": income * 100, "threshold": threshold * 100, "rate": rate, "surcharge": surcharge})
}

/// Schedule 1, 'Coefficients to use in formulas for withholding from weekly payments', and
/// Schedule 8, 'Study and training support loans component rates' (both published 17 June 2026):
/// [weekly earnings less than, in dollars (0 for the last row), a and b times 10,000].
const SCALE_2: [(u64, i64, i64); 9] = [
    (362, 0, 0),
    (538, 1500, 543_462),
    (673, 2500, 1_082_135),
    (721, 1700, 543_473),
    (865, 1790, 608_377),
    (1282, 3227, 1_851_935),
    (2596, 3200, 1_817_319),
    (3653, 3900, 3_634_627),
    (0, 4700, 6_557_704),
];
const SCALE_3: [(u64, i64, i64); 3] = [
    (2596, 3000, 3000),
    (3653, 3700, 1_817_308),
    (0, 4500, 4_740_385),
];
const SCHEDULE_8: [(u64, i64, i64); 4] = [
    (1337, 0, 0),
    (2494, 1500, 2_005_615),
    (3577, 1700, 2_504_527),
    (0, 1000, 0),
];

/// The withholding schedules instruments as made, read 19 November 2026: Schedule 1's scale 2 and 3
/// coefficients for payments from 13 October 2020, which the 2021 to 2023 instruments print, and
/// those of the 2024 instrument, which both 2025 instruments repeat.
const SCALE_2_2020: [(u64, i64, i64); 9] = [
    (359, 0, 0),
    (438, 1900, 683_462),
    (548, 2900, 1_121_942),
    (721, 2100, 683_465),
    (865, 2190, 748_369),
    (1282, 3477, 1_862_119),
    (2307, 3450, 1_827_504),
    (3461, 3900, 2_865_965),
    (0, 4700, 5_635_196),
];
const SCALE_3_2020: [(u64, i64, i64); 3] = [
    (2307, 3250, 3250),
    (3461, 3700, 1_038_462),
    (0, 4500, 3_807_692),
];
const SCALE_2_2024: [(u64, i64, i64); 9] = [
    (361, 0, 0),
    (500, 1600, 578_462),
    (625, 2600, 1_078_462),
    (721, 1800, 578_462),
    (865, 1890, 643_365),
    (1282, 3227, 1_800_385),
    (2596, 3200, 1_765_769),
    (3653, 3900, 3_583_077),
    (0, 4700, 6_506_154),
];
const SCALE_3_2024: [(u64, i64, i64); 3] = [
    (2596, 3000, 3000),
    (3653, 3700, 1_817_308),
    (0, 4500, 4_740_385),
];
/// Schedule 8 of the (No. 2) 2025 instrument, for payments from 24 September 2025.
const SCHEDULE_8_2025: [(u64, i64, i64); 4] = [
    (1288, 0, 0),
    (2403, 1500, 1_932_692),
    (3447, 1700, 2_413_462),
    (0, 1000, 0),
];
/// Schedule 8 to 23 September 2025, tax-free threshold claimed or foreign resident: each band's
/// first dollar of weekly earnings and its component rate in tenths of a per cent of all of them.
const BANDS_2021: [(u64, u64); 19] = [
    (0, 0),
    (904, 10),
    (1043, 20),
    (1106, 25),
    (1172, 30),
    (1243, 35),
    (1317, 40),
    (1396, 45),
    (1480, 50),
    (1569, 55),
    (1663, 60),
    (1763, 65),
    (1869, 70),
    (1981, 75),
    (2100, 80),
    (2224, 85),
    (2360, 90),
    (2501, 95),
    (2651, 100),
];
const BANDS_2022: [(u64, u64); 19] = [
    (0, 0),
    (930, 10),
    (1073, 20),
    (1138, 25),
    (1206, 30),
    (1278, 35),
    (1355, 40),
    (1436, 45),
    (1523, 50),
    (1614, 55),
    (1711, 60),
    (1814, 65),
    (1923, 70),
    (2038, 75),
    (2160, 80),
    (2290, 85),
    (2427, 90),
    (2573, 95),
    (2727, 100),
];
const BANDS_2023: [(u64, u64); 19] = [
    (0, 0),
    (991, 10),
    (1144, 20),
    (1213, 25),
    (1286, 30),
    (1363, 35),
    (1445, 40),
    (1531, 45),
    (1623, 50),
    (1721, 55),
    (1824, 60),
    (1933, 65),
    (2049, 70),
    (2172, 75),
    (2303, 80),
    (2441, 85),
    (2587, 90),
    (2743, 95),
    (2907, 100),
];
const BANDS_2024: [(u64, u64); 19] = [
    (0, 0),
    (1046, 10),
    (1208, 20),
    (1281, 25),
    (1358, 30),
    (1439, 35),
    (1525, 40),
    (1617, 45),
    (1714, 50),
    (1817, 55),
    (1926, 60),
    (2042, 65),
    (2164, 70),
    (2294, 75),
    (2432, 80),
    (2578, 85),
    (2732, 90),
    (2896, 95),
    (3070, 100),
];
const BANDS_EARLY_2025: [(u64, u64); 19] = [
    (0, 0),
    (1079, 10),
    (1246, 20),
    (1321, 25),
    (1401, 30),
    (1485, 35),
    (1574, 40),
    (1668, 45),
    (1768, 50),
    (1874, 55),
    (1987, 60),
    (2106, 65),
    (2233, 70),
    (2366, 75),
    (2508, 80),
    (2659, 85),
    (2819, 90),
    (2988, 95),
    (3167, 100),
];

/// 'Working out the weekly earnings': a week's pay, half a fortnight's, or a month's (plus a cent
/// if it ends in 33 cents) times 3 over 13, with cents ignored, plus 99 cents, in cents.
fn weekly_x(earnings: u64, period: &str) -> u64 {
    let dollars = match period {
        "week" => earnings / 100,
        "fortnight" => earnings / 200,
        _ => (earnings + u64::from(earnings % 100 == 33)) * 3 / 1300,
    };
    dollars * 100 + 99
}

/// A weekly amount for the pay: itself, times 2 for a fortnight, or times 13 over 3 to the nearest
/// dollar for a month.
fn for_period(weekly: u64, period: &str) -> u64 {
    match period {
        "week" => weekly,
        "fortnight" => 2 * weekly,
        _ => half_up(weekly * 13, 3),
    }
}

/// y = ax − b in whole dollars, 50 cents rounding up, on the pay's weekly earnings.
fn withheld(earnings: u64, period: &str, rows: &[(u64, i64, i64)]) -> u64 {
    let x = weekly_x(earnings, period) as i64;
    let &(_, a, b) = rows
        .iter()
        .find(|(limit, ..)| *limit == 0 || x < (*limit * 100) as i64)
        .unwrap();
    // a x in millionths of a dollar: a times 10^4, x in cents.
    let millionths = (a * x - b * 100).max(0) as u64;
    for_period((millionths + 500_000) / 1_000_000, period)
}

/// The band's rate of all the weekly earnings, to the nearest dollar, 50 cents up: x in cents times
/// tenths of a per cent is in hundred-thousandths of a dollar.
fn component(earnings: u64, period: &str, bands: &[(u64, u64)]) -> u64 {
    let x = weekly_x(earnings, period);
    let &(_, rate) = bands
        .iter()
        .rev()
        .find(|(first, _)| x >= first * 100)
        .unwrap();
    for_period((x * rate + 50_000) / 100_000, period)
}

struct Pay<'a> {
    year: &'a str,
    residency: &'a str,
    period: (&'a str, u64),
    salary: u64,
    sacrifice: u64,
    included: bool,
    loan: bool,
    cover: bool,
}

/// Pay from the salary for each period, in cents: super is the rate on the salary before any
/// sacrifice, up to the base. A package including super splits by the same formula as the engine,
/// super rounded and the salary the rest.
fn pay_oracle(p: &Pay) -> Value {
    let (mille, cap, concessional_cap) = super_guarantee(p.year);
    let (period, pays) = p.period;
    let (entered, cap) = (p.salary * pays, cap * 100);
    let sg = if !p.included {
        half_up(entered.min(cap) * mille, 1000)
    } else if entered * 1000 <= cap * (1000 + mille) {
        half_up(entered * mille, 1000 + mille)
    } else {
        half_up(cap * mille, 1000)
    };
    let salary = if p.included { entered - sg } else { entered };
    let sacrifice = p.sacrifice * pays;
    let paid = salary - sacrifice;
    let resident = p.residency == "resident";
    // ITAA 1997 s 25-130 from 2026-27: a resident deducts the lesser of $1,000 and the salary.
    let deduction = if p.year == "2026-27" && resident {
        paid.min(100_000)
    } else {
        0
    };
    let taxable = (paid - deduction) / 100;
    let reported = sacrifice / 100;
    let tax = tax_oracle(taxable, p.year, p.residency);
    let surcharge = if resident && !p.cover {
        half_up(
            taxable * surcharge_rate(taxable + reported, p.year, false, 0),
            100,
        )
    } else {
        0
    };
    let repayment = if p.loan {
        loan_oracle(taxable + reported, p.year)["repayment"]
            .as_u64()
            .unwrap()
    } else {
        0
    };
    let owed = tax["total"].as_u64().unwrap() + surcharge + repayment;
    let net = paid - owed;
    let concessional = sg + sacrifice;
    let over_cap = concessional.saturating_sub(concessional_cap * 100);
    let division_293 = (taxable * 100 + concessional)
        .saturating_sub(25_000_000)
        .min(concessional);
    let withheld = if p.residency != "working-holiday" && period != "year" {
        let earnings = half_up(paid, pays);
        let scale: &[(u64, i64, i64)] = match (p.year, resident) {
            ("2026-27", true) => &SCALE_2,
            ("2026-27", false) => &SCALE_3,
            ("2025-26" | "2024-25", true) => &SCALE_2_2024,
            ("2025-26" | "2024-25", false) => &SCALE_3_2024,
            (_, true) => &SCALE_2_2020,
            (_, false) => &SCALE_3_2020,
        };
        let each = withheld(earnings, period, scale);
        let loan = match (p.loan, p.year) {
            (false, _) => 0,
            (true, "2026-27") => withheld(earnings, period, &SCHEDULE_8),
            (true, "2025-26") => withheld(earnings, period, &SCHEDULE_8_2025),
            (true, "2024-25") => component(earnings, period, &BANDS_2024),
            (true, "2023-24") => component(earnings, period, &BANDS_2023),
            (true, "2022-23") => component(earnings, period, &BANDS_2022),
            (true, _) => component(earnings, period, &BANDS_2021),
        };
        let earlier = (p.year == "2025-26")
            .then(|| u64::from(p.loan) * component(earnings, period, &BANDS_EARLY_2025) * 100);
        let total = each + loan;
        json!({"tax": each * 100, "studyLoan": loan * 100, "total": total * 100, "earlierStudyLoan": earlier,
            "earnings": earnings, "afterWithholding": earnings as i64 - total as i64 * 100, "year": total * pays * 100,
            "refund": (total * pays * 100) as i64 - owed as i64})
    } else {
        Value::Null
    };
    json!({"salary": salary, "sacrifice": sacrifice, "superGuarantee": sg, "concessional": concessional,
        "overCap": over_cap, "division293": division_293, "deduction": deduction, "taxable": taxable * 100,
        "tax": tax["tax"], "offset": tax["offset"], "lmito": tax["lmito"], "medicare": tax["medicare"],
        "surcharge": surcharge, "studyLoan": repayment, "net": net, "monthly": half_up(net, 12),
        "fortnightly": half_up(net, 26), "weekly": half_up(net, 52), "withheld": withheld})
}

fn run_node(cases: &[Value]) -> Vec<Value> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let mut node = Command::new("node")
        .args(["--input-type=module", "--eval", HARNESS])
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("node on PATH");
    node.stdin
        .take()
        .unwrap()
        .write_all(Value::Array(cases.to_vec()).to_string().as_bytes())
        .unwrap();
    let output = node.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

fn agree(cases: &[Value], expected: &[Value]) {
    let actual = run_node(cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

const TAX_THRESHOLDS: [u64; 22] = [
    18_200, 23_226, 23_365, 24_276, 26_000, 27_222, 28_011, 32_500, 34_027, 35_013, 37_000, 37_500,
    45_000, 48_000, 66_667, 90_000, 120_000, 126_000, 135_000, 180_000, 190_000, 0,
];
const LOAN_THRESHOLDS: [u64; 14] = [
    46_620, 47_014, 48_361, 51_550, 54_435, 66_621, 136_740, 151_201, 159_664, 67_000, 125_000,
    179_286, 129_717, 186_051,
];
const MLS_THRESHOLDS: [u64; 10] = [
    90_000, 93_000, 105_000, 108_000, 123_000, 140_000, 164_000, 28_011, 23_226, 0,
];

#[test]
fn the_oracle_works_the_atos_examples_by_hand() {
    // Medicare levy reduction for low-income earners: Angie, $29,000 in 2025-26, $98.90.
    assert_eq!(tax_oracle(29_000, "2025-26", "resident")["medicare"], 9_890);
    // What is the Medicare levy: Matthew, $75,000, $1,500.
    assert_eq!(
        tax_oracle(75_000, "2026-27", "resident")["medicare"],
        150_000
    );
    // Low and middle income earner tax offsets: Jeff's low income tax offset at $45,000 is $325,
    // and for 2021-22 his low and middle income tax offset $1,275, Anita's $1,500 and Andre's $1,440.
    assert_eq!(offset(45_000), 32_500);
    assert_eq!(lmito(45_000, "2021-22"), 127_500);
    assert_eq!(lmito(70_000, "2021-22"), 150_000);
    assert_eq!(lmito(92_000, "2021-22"), 144_000);
    assert_eq!(tax_oracle(45_000, "2021-22", "resident")["tax"], 509_200);
    // Study loan examples 1 and 3 for 2026-27: Christina and Priya; Barry by section 154-20.
    assert_eq!(loan_oracle(86_380, "2026-27")["repayment"], 252_780);
    assert_eq!(loan_oracle(254_780, "2026-27")["repayment"], 2_547_800);
    assert_eq!(loan_oracle(137_064, "2026-27")["repayment"], 1_027_734);
    // Example 4 for 2024-25: 5.5% of $99,736 is $5,485.48 (the page prints $5,485.52).
    assert_eq!(loan_oracle(99_736, "2024-25")["repayment"], 548_548);
    // Medicare levy surcharge for a single adult: Tom, $90,000 and $27,000 of fringe benefits, $1,170.
    let tom = json!({"year": "2026-27", "taxable": 90_000, "fringe": 27_000, "super": 0, "losses": 0,
        "spouse": null, "children": 0, "uncoveredDays": 365});
    assert_eq!(mls_oracle(&tom)["surcharge"], 117_000);
    // Schedule 8's examples: $2,608.36 a week gives $193 and $4,409.75 a fortnight $260.
    assert_eq!(withheld(260_836, "week", &SCHEDULE_8), 193);
    assert_eq!(withheld(440_975, "fortnight", &SCHEDULE_8), 260);
    // The earlier instruments' Schedule 8 examples: $1,095.84 a week, $2,355.78 a fortnight and
    // $5,488.45 a month in 2021-22 ($22, $70, $191) and 2023-24 ($11, $48, $139); the (No. 2) 2025
    // ones, $202 and $274; and the 2025 one's, $1,095.84 a week, $2,455.78 a fortnight and $5,688.45 a
    // month ($11, $24, $113).
    let three = |bands: &[(u64, u64)]| {
        [
            component(109_584, "week", bands),
            component(235_578, "fortnight", bands),
            component(548_845, "month", bands),
        ]
    };
    assert_eq!(three(&BANDS_2021), [22, 70, 191]);
    assert_eq!(three(&BANDS_2023), [11, 48, 139]);
    assert_eq!(withheld(260_836, "week", &SCHEDULE_8_2025), 202);
    assert_eq!(withheld(440_975, "fortnight", &SCHEDULE_8_2025), 274);
    assert_eq!(
        [
            component(109_584, "week", &BANDS_EARLY_2025),
            component(245_578, "fortnight", &BANDS_EARLY_2025),
            component(568_845, "month", &BANDS_EARLY_2025),
        ],
        [11, 24, 113]
    );
}

#[test]
fn the_income_tax_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1117_1A7C_0001);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..TAX_CASES)
        .map(|_| {
            let (income, year, residency) = (
                rng.income(&TAX_THRESHOLDS),
                rng.pick(&YEARS),
                rng.pick(&RESIDENCY),
            );
            (
                json!({"kind": "tax", "income": income, "year": year, "residency": residency}),
                tax_oracle(income, year, residency),
            )
        })
        .unzip();
    agree(&cases, &expected);
}

#[test]
fn the_study_loan_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1117_1A7C_0002);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..LOAN_CASES)
        .map(|_| {
            let (income, year) = (rng.income(&LOAN_THRESHOLDS), rng.pick(&YEARS));
            (
                json!({"kind": "loan", "income": income, "year": year}),
                loan_oracle(income, year),
            )
        })
        .unzip();
    agree(&cases, &expected);
}

#[test]
fn the_surcharge_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1118_1A7C_0004);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..MLS_CASES)
        .map(|_| {
            let year = rng.pick(&YEARS);
            let small = |rng: &mut Seeded| if rng.below(3) == 0 { rng.below(20_001) } else { 0 };
            let taxable = rng.income(&MLS_THRESHOLDS);
            let (fringe, contributions, losses) = (small(&mut rng), small(&mut rng), small(&mut rng));
            let spouse = (rng.below(2) == 0).then(|| rng.income(&MLS_THRESHOLDS));
            let children = if rng.below(2) == 0 { rng.below(5) } else { 0 };
            let days = rng.pick(&[0, 1, 73, 183, 364, days_in(year)]);
            let mls = json!({"year": year, "taxable": taxable, "fringe": fringe, "super": contributions,
                "losses": losses, "spouse": spouse, "children": children, "uncoveredDays": days});
            (json!({"kind": "mls", "mls": mls}), mls_oracle(&mls))
        })
        .unzip();
    agree(&cases, &expected);
}

#[test]
fn the_take_home_pay_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1117_1A7C_0003);
    let money = |cents: u64| format!("{}.{:02}", cents / 100, cents % 100);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..PAY_CASES)
        .map(|_| {
            let annual = rng.income(&[
                250_000, 260_280, 270_830, 280_000, 303_330, 290_212, 112_000, 37_500, 1_000, 1_001,
                105_000, 123_000, 164_000,
            ]);
            let (year, residency) = (rng.pick(&PAY_YEARS), rng.pick(&RESIDENCY));
            let period = rng.pick(&PERIODS);
            // Some salaries carry cents; the sacrifice stays below the salary once super is split.
            let salary = annual * 100 / period.1 + if rng.below(2) == 0 { rng.below(100) } else { 0 };
            let sacrifice = if rng.below(2) == 0 { rng.below(salary / 4 + 1) } else { 0 };
            let p = Pay {
                year,
                residency,
                period,
                salary,
                sacrifice,
                included: rng.below(2) == 0,
                loan: rng.below(2) == 0,
                cover: rng.below(2) == 0,
            };
            let pay = json!({"year": year, "residency": residency, "salary": money(salary), "period": period.0,
                "includesSuper": p.included, "sacrifice": money(sacrifice), "studyLoan": p.loan,
                "hospitalCover": p.cover});
            (json!({"kind": "pay", "pay": pay}), pay_oracle(&p))
        })
        .unzip();
    agree(&cases, &expected);
}

/// The general concessional contributions cap in whole dollars, typed from the ATO's 'Contributions
/// caps' (Table 1.1, last updated 11 September 2026, read 19 November 2026).
fn concessional_cap(year: &str) -> u64 {
    match year {
        "2021-22" | "2022-23" | "2023-24" => 27_500,
        "2024-25" | "2025-26" => 30_000,
        _ => 32_500,
    }
}

/// One Division 293 case in whole dollars, except the contributions and unused cap in cents.
struct D293<'a> {
    year: &'a str,
    parts: [u64; 6],
    concessional: u64,
    unused: u64,
    under: bool,
}

/// Division 293 tax by the Acts' own order, in cents: s 291-20(3) and (4) raise the cap by the
/// unused amount when the balance allows, and the excess is what exceeds the raised cap. Taxable
/// contributions are then taken case by case, where the engine takes the lesser of 2 amounts:
/// nothing without low tax contributions or at or under $250,000, all of them when income alone
/// reaches the threshold, else the part above it. 15% of a cent rounds half up.
fn d293_oracle(d: &D293) -> Value {
    let [taxable, fringe, losses, trust, fhss, lump_sum] = d.parts;
    let income = (taxable.saturating_sub(fhss) + trust + fringe + losses - lump_sum) * 100;
    let cap = concessional_cap(d.year) * 100;
    let raised = if d.under { cap + d.unused } else { cap };
    let excess = d.concessional.saturating_sub(raised);
    let carried = d.concessional.saturating_sub(cap) - excess;
    let low = d.concessional - excess;
    let threshold = 25_000_000;
    let combined = income + low;
    let taxed = if low == 0 || combined <= threshold {
        0
    } else if income >= threshold {
        low
    } else {
        combined - threshold
    };
    json!({"year": d.year, "income": income, "concessional": d.concessional, "cap": cap, "carried": carried,
        "excess": excess, "low": low, "combined": combined, "over": combined.saturating_sub(threshold),
        "taxable": taxed, "tax": (taxed * 15 + 50) / 100, "room": threshold.saturating_sub(combined)})
}

#[test]
fn the_oracle_works_the_division_293_examples_by_hand() {
    // ATO, Division 293 tax: Jan, $240,000 and $15,000, $750.
    let jan = d293_oracle(&D293 {
        year: "2026-27",
        parts: [240_000, 0, 0, 0, 0, 0],
        concessional: 1_500_000,
        unused: 0,
        under: false,
    });
    assert_eq!(jan["tax"], 75_000);
    // $45,000 against a $32,500 cap: the $12,500 excess is left out; $20,000 unused cap covers it.
    let over = D293 {
        year: "2026-27",
        parts: [210_000, 33_000, 0, 0, 0, 0],
        concessional: 4_500_000,
        unused: 2_000_000,
        under: false,
    };
    assert_eq!(d293_oracle(&over)["tax"], 382_500);
    assert_eq!(
        d293_oracle(&D293 {
            under: true,
            ..over
        })["tax"],
        570_000
    );
}

#[test]
fn the_division_293_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1119_1A7C_0293);
    let money = |cents: u64| format!("{}.{:02}", cents / 100, cents % 100);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..DIVISION_293_CASES)
        .map(|_| {
            let year = rng.pick(&PAY_YEARS);
            let small = |rng: &mut Seeded| if rng.below(3) == 0 { rng.below(40_001) } else { 0 };
            let taxable = rng.income(&[250_000, 220_000, 217_500, 222_500, 200_000, 0]);
            let (fringe, losses, trust) = (small(&mut rng), small(&mut rng), small(&mut rng));
            let fhss = small(&mut rng);
            // s 301-20(3) is nil from 2024-25, and the lump sum is part of taxable income.
            let lump_sum = if year < "2024-25" { small(&mut rng).min(taxable.saturating_sub(fhss)) } else { 0 };
            let concessional = match rng.below(4) {
                0 => 0,
                1 => concessional_cap(year) * 100 + rng.below(3) * 100 - 100,
                _ => rng.below(6_000_001),
            };
            let unused = if rng.below(2) == 0 { rng.below(4_000_001) } else { 0 };
            let d = D293 { year, parts: [taxable, fringe, losses, trust, fhss, lump_sum], concessional, unused,
                under: rng.below(2) == 0 };
            let input = json!({"year": year, "interests": "accumulation", "taxable": taxable.to_string(),
                "fringe": fringe.to_string(), "losses": losses.to_string(), "trust": trust.to_string(),
                "fhss": fhss.to_string(), "lumpSum": lump_sum.to_string(), "concessional": money(concessional),
                "unused": money(unused), "balanceUnder": d.under});
            (json!({"kind": "d293", "d293": input}), d293_oracle(&d))
        })
        .unzip();
    agree(&cases, &expected);
}
