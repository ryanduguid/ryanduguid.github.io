// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! An independent oracle for the individual tax engines: `assets/income-tax.mjs`,
//! `assets/study-loan.mjs`, `assets/take-home-pay.mjs` and `assets/payg-withholding.mjs`.
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
//! Schedule 1 and 8 coefficients are typed from the ATO's pages, not copied from the engine.
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
const PAY_CASES: usize = 600;
const MLS_CASES: usize = 400;

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

/// 'Working out the weekly earnings': a week's pay, half a fortnight's, or a month's (plus a cent
/// if it ends in 33 cents) times 3 over 13, with cents ignored, plus 99 cents. Then y = ax − b in
/// whole dollars, 50 cents rounding up, and that times 2 for a fortnight or 13 over 3, to the nearest
/// dollar, for a month.
fn withheld(earnings: u64, period: &str, rows: &[(u64, i64, i64)]) -> u64 {
    let dollars = match period {
        "week" => earnings / 100,
        "fortnight" => earnings / 200,
        _ => (earnings + u64::from(earnings % 100 == 33)) * 3 / 1300,
    };
    let x = (dollars * 100 + 99) as i64;
    let &(_, a, b) = rows
        .iter()
        .find(|(limit, ..)| *limit == 0 || x < (*limit * 100) as i64)
        .unwrap();
    // a x in millionths of a dollar: a times 10^4, x in cents.
    let millionths = (a * x - b * 100).max(0) as u64;
    let weekly = (millionths + 500_000) / 1_000_000;
    match period {
        "week" => weekly,
        "fortnight" => 2 * weekly,
        _ => half_up(weekly * 13, 3),
    }
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
    let withheld = if p.year == "2026-27" && p.residency != "working-holiday" && period != "year" {
        let earnings = half_up(paid, pays);
        let scale: &[(u64, i64, i64)] = if resident { &SCALE_2 } else { &SCALE_3 };
        let each = withheld(earnings, period, scale);
        let loan = if p.loan {
            withheld(earnings, period, &SCHEDULE_8)
        } else {
            0
        };
        let total = each + loan;
        json!({"tax": each * 100, "studyLoan": loan * 100, "total": total * 100, "earnings": earnings,
            "afterWithholding": earnings as i64 - total as i64 * 100, "year": total * pays * 100,
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
