// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! An independent oracle for the individual tax engines: `assets/income-tax.mjs`,
//! `assets/study-loan.mjs`, `assets/take-home-pay.mjs`, `assets/payg-withholding.mjs`,
//! `assets/division-293.mjs`, `assets/sole-trader.mjs`, `assets/income-tests.mjs`,
//! `assets/bonus-withholding.mjs`, `assets/salary-packaging.mjs`, `assets/novated-lease.mjs`,
//! `assets/super-projection.mjs` and
//! `assets/salary-dividend.mjs`.
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
//! so it checks how the parts combine, not that split. The salary packaging and novated lease
//! oracles check the FBT side only, whose tax side is the income tax engine's: they take FBTAA
//! s 5B(1E)'s steps in order where the engine nets the meal allowance against the excess, and the
//! employer's GST credit as one eleventh off where the engine takes ten elevenths, but share the
//! engine's rounding of each grossed-up total to the dollar.
//! The super projection oracle types its own caps, base and rates and works the present value with
//! big integers, but shares the engine's rounding of each year's figures to the cent.
//! The income tests engine (`assets/income-tests.mjs`) works each measure as a formula; the oracle
//! keeps a table of the terms each definition lists, with their signs, and sums it.
//!
//! The salary against dividends oracle works each split from the tables here and the super
//! guarantee figures below, and checks the engine's best split against all salary, all dividends,
//! the split entered and, for small profits, every whole dollar of salary, where the engine tries
//! only the salaries at which the kept total can change slope. Both round the franking credit down
//! and the rest half up, and take taxable income to the dollar.
//! The work expenses oracle (`assets/work-expenses.mjs`) types its rates from the ATO's fixed rate,
//! 52 cent, shortcut and cents per kilometre pages and PCG 2023/1 Table 1, read 22 November 2026,
//! and works in whole cents and hundredths of an hour with 128-bit integers, where the engine keeps
//! ten-thousandths of a dollar in big integers and 40-digit quotients. The log book oracle divides
//! once, the cents times the business over the total kilometres, where the engine forms the
//! percentage first. Both show half a cent up and take the return amount's cents off the unrounded
//! total. Self-education applies ITAA 1936 s 82A's $250 reduction, as the ATO's page states it, in
//! whole cents.
//!
//! The government super amounts oracle (`assets/government-super.mjs`) types Table 25's lower
//! thresholds, read 22 November 2026, and works the co-contribution, LISTO and the spouse offset
//! from the Act's words in whole cents, the co-contribution in hundred-thousandths of a dollar, where
//! the engine takes total income and adjusted taxable income from the income tests page's function.
//! The engines run from the repository's own `assets/`, not the rendered site.

use num_bigint::BigUint;
use serde_json::{Value, json};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

const HARNESS: &str = r"
import { incomeTax, medicareLevySurcharge } from './assets/income-tax.mjs';
import { studyLoanRepayment } from './assets/study-loan.mjs';
import { takeHomePay } from './assets/take-home-pay.mjs';
import { salaryPackaging } from './assets/salary-packaging.mjs';
import { novatedLease } from './assets/novated-lease.mjs';
import { bonusWithholding } from './assets/bonus-withholding.mjs';
import { division293Tax } from './assets/division-293.mjs';
import { soleTraderSetAside } from './assets/sole-trader.mjs';
import { incomeTests } from './assets/income-tests.mjs';
import { superProjection } from './assets/super-projection.mjs';
import { salaryDividend } from './assets/salary-dividend.mjs';
import { workExpenses } from './assets/work-expenses.mjs';
import { governmentSuperAmounts } from './assets/government-super.mjs';
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
  pack: ({ pack }) => {
    const { year, owedBefore, owedAfter, surchargeAfter, studyLoanAfter, saved, gain, ...fbt } = salaryPackaging(pack);
    return cents(fbt);
  },
  lease: ({ lease }) => {
    try {
      const { year, owedWithout, exemptCase, contribution, ...car } = novatedLease(lease);
      const split = (c) => c && cents({ preTax: c.preTax, postTax: c.postTax, reportable: c.reportable });
      return { ...cents(car), exemptCase: split(exemptCase), contribution: split(contribution) };
    } catch (error) {
      return { error: error.message };
    }
  },
  projection: ({ projection }) => {
    try {
      return cents(superProjection(projection));
    } catch (error) {
      return { error: error.message };
    }
  },
  bonus: ({ bonus }) => cents(bonusWithholding(bonus)),
  d293: ({ d293 }) => cents(division293Tax(d293)),
  sole: ({ sole }) => cents(soleTraderSetAside(sole)),
  tests: ({ parts }) => cents(incomeTests(parts)),
  owner: ({ pay }) => cents(salaryDividend(pay)),
  work: ({ facts }) => {
    try {
      const { amounts, higherMethod } = workExpenses(facts);
      return { amounts, higher: higherMethod ?? null };
    } catch (error) {
      return { refused: error.code };
    }
  },
  gov: ({ facts }) => {
    const a = governmentSuperAmounts(facts).amounts;
    return { total: a.co_contribution_total_income, adjusted: a.adjusted_taxable_income, co: a.co_contribution,
      co_paid: a.co_contribution_paid, listo: a.listo, listo_paid: a.listo_paid, spouse: a.spouse_contribution_offset ?? null };
  },
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
const PROJECTION_CASES: usize = 500;
const PACKAGING_CASES: usize = 600;
const LEASE_CASES: usize = 600;
const BONUS_CASES: usize = 500;
const DIVISION_293_CASES: usize = 600;
const SOLE_CASES: usize = 600;

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

struct Sole<'a> {
    year: &'a str,
    income: u64,
    expenses: u64,
    wages: u64,
    deductions: u64,
    contributions: u64,
    offset: bool,
    loan: bool,
    cover: bool,
    gst: bool,
    credits: u64,
    invoice: u64,
}

/// One year's tax, levies and repayment in cents on `taxable` whole dollars with `business` whole
/// dollars of net small business income. The offset follows the ATO's 'Small business income tax
/// offset' page: with total net small business income at or above taxable income, 16% of the basic
/// income tax liability; otherwise 16% of the liability's share in that income's proportion; at most
/// $1,000 and no more than the tax the other offsets leave.
/// `reported` whole dollars of deductible personal super contributions are reportable super
/// contributions: they join income for surcharge purposes and repayment income (HESA s 154-5(1);
/// ATO 'Income tests').
fn sole_year(s: &Sole, taxable: u64, business: u64, reported: u64) -> [u64; 8] {
    let t = tax_oracle(taxable, s.year, "resident");
    let get = |key: &str| t[key].as_u64().unwrap();
    let (tax, offset, lmito, levy) = (get("tax"), get("offset"), get("lmito"), get("medicare"));
    let share = if taxable == 0 {
        0
    } else if business >= taxable {
        half_up(tax * 16, 100)
    } else {
        half_up(tax * business * 16, taxable * 100)
    };
    let small = share.min(100_000).min(tax - offset - lmito);
    let surcharge = if s.cover {
        0
    } else {
        half_up(
            taxable * surcharge_rate(taxable + reported, s.year, false, 0),
            100,
        )
    };
    let loan = if s.loan {
        loan_oracle(taxable + reported, s.year)["repayment"]
            .as_u64()
            .unwrap()
    } else {
        0
    };
    let total = tax - offset - lmito - small + levy + surcharge + loan;
    [tax, offset, lmito, small, levy, surcharge, loan, total]
}

/// The set-aside in cents: the year's total less the total on the wages and other deductions alone,
/// plus a tenth of the income as GST less the credits when registered, then shared over the year's
/// invoices including GST.
fn sole_oracle(s: &Sole) -> Value {
    let profit = s.income - s.expenses;
    // ITAA 1997 s 25-130 from 2026-27, on the wages only.
    let deduction = if s.year == "2026-27" {
        s.wages.min(100_000)
    } else {
        0
    };
    let taxable = (profit + s.wages - deduction - s.deductions - s.contributions) / 100;
    let business = if s.offset { profit / 100 } else { 0 };
    let all = sole_year(s, taxable, business, s.contributions / 100);
    // The wages alone deduct, and so report, only the contributions they can absorb.
    let room = (s.wages - deduction).saturating_sub(s.deductions);
    let absorbed = s.contributions.min(room);
    let alone = sole_year(s, (room - absorbed) / 100, 0, absorbed / 100);
    let business_tax = i64::try_from(all[7]).unwrap() - i64::try_from(alone[7]).unwrap();
    assert!(
        business_tax >= 0,
        "the business never lowers the year's tax"
    );
    let business_tax = business_tax as u64;
    let gst_on = if s.gst { half_up(s.income, 10) } else { 0 };
    let gst = gst_on - s.credits;
    let set_aside = business_tax + gst;
    let invoiced = s.income + gst_on;
    let share = |part: u64, whole: u64| {
        if whole == 0 {
            0
        } else {
            half_up(part * 10_000, whole)
        }
    };
    let from_invoice = if invoiced == 0 {
        0
    } else {
        half_up(s.invoice * set_aside, invoiced)
    };
    json!({"profit": profit, "deduction": deduction, "taxable": taxable * 100, "tax": all[0], "offset": all[1],
        "lmito": all[2], "smallBusinessOffset": all[3], "medicare": all[4], "surcharge": all[5], "studyLoan": all[6],
        "total": all[7], "wagesTax": alone[7], "businessTax": business_tax, "gstOnIncome": gst_on, "credits": s.credits,
        "gst": gst, "setAside": set_aside, "taxShare": share(business_tax, s.income),
        "invoiceShare": share(set_aside, invoiced), "quarterly": half_up(set_aside, 4), "monthly": half_up(set_aside, 12),
        "weekly": half_up(set_aside, 52),
        "invoice": {"amount": s.invoice, "setAside": from_invoice, "left": s.invoice - from_invoice},
        "instalments": s.income >= 400_000 && all[7] - all[6] >= 100_000,
        "mustRegister": !s.gst && s.income >= 7_500_000})
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

/// One super projection case: money in cents, rates in hundredths of a per cent.
#[derive(Clone, Copy)]
struct Projection {
    age: u64,
    retire: u64,
    balance: i128,
    salary: i128,
    employer: i128,
    sacrifice: i128,
    after_tax: i128,
    earn: i128,
    percent_fee: i128,
    admin_fee: i128,
    insurance: i128,
    growth: i128,
    discount: u32,
}

fn half_up_i(numerator: i128, denominator: i128) -> i128 {
    (2 * numerator + denominator) / (2 * denominator)
}

/// The 2026-27 figures typed from their sources: the maximum contribution base of $270,830 (the
/// ATO's 'Super guarantee', Table 23), the caps of $32,500 and $130,000 (the ATO's 'Contributions
/// caps', Tables 1.1 and 4) and 15% contributions tax (ITAA 1997 s 295-160; Income Tax Rates Act 1986 s 26(1)). Each year earns on
/// the opening balance and half its net flows; the fees and premiums are deducted at 15%; the
/// present value is the final balance over 1.037 (or the rate entered) to the power of the years.
fn projection_oracle(p: &Projection) -> Value {
    let (mut salary, mut base, mut sacrifice, mut after_tax, mut fee, mut insurance) = (
        p.salary,
        27_083_000,
        p.sacrifice,
        p.after_tax,
        p.admin_fee,
        p.insurance,
    );
    let mut balance = p.balance;
    let (mut contributed_total, mut earnings_total, mut fees_total) = (0, 0, 0);
    let mut first = None;
    for year in 0..p.retire - p.age {
        if year > 0 {
            let grow = |v: i128| half_up_i(v * (10_000 + p.growth), 10_000);
            (salary, base, sacrifice, after_tax, fee, insurance) = (
                grow(salary),
                grow(base),
                grow(sacrifice),
                grow(after_tax),
                grow(fee),
                grow(insurance),
            );
        }
        let employer = half_up_i(salary.min(base) * p.employer, 10_000);
        let concessional = employer + sacrifice;
        if year == 0 {
            if concessional > 3_250_000 {
                return json!({"error": "Your concessional contributions for 2026-27 are above the $32,500 cap; this projection does not compute excess contributions."});
            }
            if after_tax > 13_000_000 {
                return json!({"error": "Your after-tax contributions for 2026-27 are above the $130,000 cap; this projection does not compute excess contributions."});
            }
            first = Some((employer, concessional));
        }
        let contributed = concessional - half_up_i(concessional * 1_500, 10_000) + after_tax;
        let twice = (2 * balance + contributed - fee - insurance).max(0);
        let earnings = half_up_i(twice * p.earn, 20_000);
        let fees = fee + insurance + half_up_i(twice * p.percent_fee, 20_000);
        let net = fees - half_up_i(fees * 1_500, 10_000);
        let available = balance + contributed + earnings;
        let taken = net.min(available);
        balance = available - taken;
        contributed_total += contributed;
        earnings_total += earnings;
        fees_total += taken;
    }
    let years = (p.retire - p.age) as u32;
    let denominator = BigUint::from(10_000 + p.discount).pow(years);
    let numerator = BigUint::from(balance as u128) * BigUint::from(10_000u32).pow(years);
    let present = (numerator * 2u32 + &denominator) / (denominator * 2u32);
    let present: u128 = present.try_into().unwrap();
    let (employer, concessional) = first.unwrap();
    let u = |v: i128| u64::try_from(v).unwrap();
    json!({"years": years * 100, "retire": p.retire * 100, "employer": u(employer), "concessional": u(concessional),
        "balance": u(balance), "present": u64::try_from(present).unwrap(), "contributed": u(contributed_total),
        "earnings": u(earnings_total), "fees": u(fees_total)})
}

const DEFAULTS: Projection = Projection {
    age: 30,
    retire: 67,
    balance: 5_000_000,
    salary: 8_000_000,
    employer: 1_200,
    sacrifice: 0,
    after_tax: 0,
    earn: 610,
    percent_fee: 11,
    admin_fee: 5_900,
    insurance: 59_900,
    growth: 370,
    discount: 370,
};

#[test]
fn the_oracle_works_a_super_projection_year_by_hand() {
    // $50,000 at 66: $9,600 less $1,440 tax, $658 of fees and premiums, 6.1% and 0.11% on $53,751.
    let year = projection_oracle(&Projection {
        age: 66,
        ..DEFAULTS
    });
    assert_eq!(year["balance"], 6_082_925);
    assert_eq!(year["present"], 5_865_887);
    assert!(
        projection_oracle(&Projection {
            sacrifice: 2_290_001,
            ..DEFAULTS
        })["error"]
            .is_string()
    );
}

/// One salary packaging case in cents, the salary in whole dollars.
struct Pack<'a> {
    year: &'a str,
    resident: bool,
    hospital: bool,
    salary: u64,
    type_one: u64,
    type_two: u64,
    meals: u64,
    meals_type_one: bool,
}

/// FBTAA s 5B(1F): Type 1 benefits times (47% + 10%) / ((1 - 47%) x (1 + 10%) x 47%), 57,000 /
/// 27,401 in cents to the dollar; s 5B(1G): Type 2 benefits times 1 / (1 - 47%), 100 / 53.
const TYPE_ONE: (u64, u64) = (57_000, 27_401);
const TYPE_TWO: (u64, u64) = (100, 53);

/// Cents grossed up by a factor, to the dollar, half up (the ATO's guide, 6.10).
fn grossed(value: u64, (num, den): (u64, u64)) -> u64 {
    half_up(value * num, den * 100)
}

/// The FBT side of salary packaging, in cents. FBTAA s 5B(1E): step 1 adds the grossed-up Type 1
/// and Type 2 totals, steps 2 and 3 take off the employer's cap, step 4 takes off the grossed-up
/// salary packaged meal entertainment up to $5,000; FBT is 47% of what remains. The reportable
/// amount (s 135Q) grosses the total taxable value above $2,000 up by 1 / 0.53, cents dropped.
fn pack_oracle(p: &Pack) -> Value {
    let (one, two) = if p.meals_type_one {
        (p.type_one + p.meals, p.type_two)
    } else {
        (p.type_one, p.type_two + p.meals)
    };
    let (g1, g2) = (grossed(one, TYPE_ONE), grossed(two, TYPE_TWO));
    let meals = grossed(p.meals, if p.meals_type_one { TYPE_ONE } else { TYPE_TWO });
    let cap = if p.hospital { 17_000 } else { 30_000 };
    let step_3 = (g1 + g2).saturating_sub(cap);
    let step_4 = step_3.saturating_sub(meals.min(5_000));
    let packaged = p.type_one + p.type_two + p.meals;
    let reportable = if packaged > 200_000 {
        packaged * 100 / 5_300
    } else {
        0
    };
    let salary = p.salary * 100;
    let deduction = |paid: u64| {
        if p.resident && p.year == "2026-27" {
            paid.min(100_000)
        } else {
            0
        }
    };
    let taxable = |paid: u64| (paid - deduction(paid)) / 100;
    let room = cap.saturating_sub(g1 + g2);
    json!({"cap": cap * 100, "packaged": packaged, "grossedTypeOne": g1 * 100, "grossedTypeTwo": g2 * 100,
        "grossedMeals": meals * 100, "grossed": (g1 + g2) * 100, "mealAllowance": (step_3 - step_4) * 100,
        "excess": step_4 * 100, "fbt": step_4 * 47, "reportable": reportable * 100,
        "taxableBefore": taxable(salary) * 100, "taxableAfter": taxable(salary - packaged) * 100, "room": room * 100,
        "roomTypeTwo": room * 53})
}

#[test]
fn the_oracle_works_the_salary_packaging_examples_by_hand() {
    // The ATO's guide, chapter 6, section 6.10: $7,700 Type 1, $9,000 and $3,300 of meal
    // entertainment Type 2, for a health promotion charity: $16,018 and $23,208, FBT $1,986.22.
    let ato = pack_oracle(&Pack {
        year: "2026-27",
        resident: true,
        hospital: false,
        salary: 80_000,
        type_one: 770_000,
        type_two: 900_000,
        meals: 330_000,
        meals_type_one: false,
    });
    assert_eq!(ato["grossedTypeOne"], 1_601_800);
    assert_eq!(ato["grossedTypeTwo"], 2_320_800);
    assert_eq!(ato["fbt"], 198_622);
    // The ATO's threshold table: $2,000.01 is reportable as $3,773.
    let threshold = Pack {
        year: "2025-26",
        resident: true,
        hospital: true,
        salary: 50_000,
        type_one: 0,
        type_two: 200_001,
        meals: 0,
        meals_type_one: true,
    };
    assert_eq!(pack_oracle(&threshold)["reportable"], 377_300);
    assert_eq!(
        pack_oracle(&Pack {
            type_two: 200_000,
            ..threshold
        })["reportable"],
        0
    );
}

#[test]
fn the_salary_packaging_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1119_1A7C_0005);
    let years = ["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"];
    let money = |cents: u64| format!("{}.{:02}", cents / 100, cents % 100);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..PACKAGING_CASES)
        .map(|_| {
            let hospital = rng.below(2) == 0;
            let filled = if hospital { 900_996 } else { 1_589_993 };
            let type_two = match rng.below(3) {
                0 => filled + rng.below(200) - 100,
                1 => 200_000 + rng.below(3) - 1,
                _ => rng.below(3_000_001),
            };
            let type_one = if rng.below(3) == 0 { rng.below(1_000_001) } else { 0 };
            let meals = if rng.below(2) == 0 { rng.below(500_001) } else { 0 };
            let p = Pack {
                year: rng.pick(&years),
                resident: rng.below(4) != 0,
                hospital,
                salary: 50_000 + rng.below(250_001),
                type_one,
                type_two,
                meals,
                meals_type_one: rng.below(2) == 0,
            };
            let input = json!({"year": p.year, "residency": if p.resident { "resident" } else { "foreign" },
                "employer": if hospital { "hospital" } else { "charity" }, "salary": p.salary.to_string(),
                "typeTwo": money(type_two), "typeOne": money(type_one), "meals": money(meals),
                "mealsTypeOne": p.meals_type_one, "studyLoan": rng.below(2) == 0, "hospitalCover": rng.below(2) == 0});
            (json!({"kind": "pack", "pack": input}), pack_oracle(&p))
        })
        .unzip();
    agree(&cases, &expected);
}

/// One novated lease case, the money in cents.
struct Lease<'a> {
    year: &'a str,
    kind: &'a str,
    after: bool,
    commitment: bool,
    sale_year: &'a str,
    price: u64,
    other_supply: bool,
    reduced: bool,
    days: u64,
    gst_costs: u64,
    other_costs: u64,
}

/// The luxury car tax threshold for fuel-efficient vehicles in whole dollars, typed from the ATO's
/// 'Luxury car tax rate and thresholds' (last updated 1 June 2026, read 19 November 2026).
fn lct_threshold(year: &str) -> u64 {
    match year {
        "2021-22" => 79_659,
        "2022-23" => 84_916,
        "2023-24" => 89_332,
        "2024-25" | "2025-26" => 91_387,
        _ => 91_661,
    }
}

/// The FBT side of a novated lease, in cents. Section 8A's conditions are tested as a table of
/// failures; the statutory formula takes 20% of the base value (two-thirds of the cost price once
/// held 4 years) over the days available; the employer's GST credit comes off the costs that bear
/// GST, and the GST on the employee's contribution comes off what it pays towards them.
fn lease_oracle(l: &Lease) -> Value {
    let electric = matches!(l.kind, "bev" | "fcev")
        || (l.kind == "phev" && (l.year == "2023-24" || l.year == "2024-25" || l.commitment));
    let first_sale_taxed = l.price > lct_threshold(l.sale_year) * 100;
    let first_sale_year_end = l.sale_year[..4].parse::<u16>().unwrap() + 1;
    let fbt_year_start = l.year[..4].parse::<u16>().unwrap();
    let failures = [
        (
            l.kind == "other",
            "it is not a battery electric or hydrogen fuel cell car",
        ),
        (
            !electric,
            "a plug-in hybrid is exempt from 1 April 2025 only under a commitment made and used before then",
        ),
        (!l.after, "it was first held and used before 1 July 2022"),
        (
            first_sale_taxed && l.other_supply && first_sale_year_end >= fbt_year_start,
            "luxury car tax became payable before the benefits",
        ),
        (
            first_sale_taxed,
            "luxury car tax was payable on its first retail sale",
        ),
        (
            l.other_supply,
            "luxury car tax became payable on another supply or an importation of it",
        ),
    ];
    let reason = failures
        .iter()
        .find(|(fails, _)| *fails)
        .map(|(_, why)| *why);
    let year_days = days_in(l.year);
    let base = if l.reduced { l.price * 2 } else { l.price * 3 };
    let value = half_up(base * l.days, 3 * 5 * year_days);
    let net = l.gst_costs - half_up(l.gst_costs, 11) + l.other_costs;
    let covered = value - half_up(value, 11);
    if covered > net && reason.is_some() {
        return json!({"error": "The car’s yearly costs are less than its taxable value, so an after-tax contribution cannot cover it; this calculator does not work the FBT that would remain."});
    }
    let reportable = if value > 200_000 {
        value * 100 / 5_300
    } else {
        0
    };
    let exempt = reason.map_or(
        json!({"preTax": net, "postTax": 0, "reportable": reportable * 100}),
        |_| Value::Null,
    );
    let contribution = if covered > net {
        Value::Null
    } else {
        json!({"preTax": net - covered, "postTax": value, "reportable": 0})
    };
    json!({"exempt": reason.is_none(), "reason": reason, "threshold": lct_threshold(l.sale_year) * 100,
        "taxableValue": value, "costs": l.gst_costs + l.other_costs, "netCosts": net, "exemptCase": exempt,
        "contribution": contribution})
}

#[test]
fn the_oracle_works_the_novated_lease_examples_by_hand() {
    // A $60,000 battery electric car for the whole of 2026-27: 20% is $12,000, reportable as
    // $22,641; $15,000 of costs with GST and $1,000 without are $14,636.36 after the credit.
    let car = Lease {
        year: "2026-27",
        kind: "bev",
        after: true,
        commitment: false,
        sale_year: "2026-27",
        price: 6_000_000,
        other_supply: false,
        reduced: false,
        days: 365,
        gst_costs: 1_500_000,
        other_costs: 100_000,
    };
    let bev = lease_oracle(&car);
    assert_eq!(bev["taxableValue"], 1_200_000);
    assert_eq!(bev["exemptCase"]["reportable"], 2_264_100);
    assert_eq!(bev["netCosts"], 1_463_636);
    assert_eq!(bev["contribution"]["preTax"], 372_727);
    assert_eq!(
        lease_oracle(&Lease {
            kind: "phev",
            ..car
        })["exempt"],
        false
    );
    assert_eq!(
        lease_oracle(&Lease {
            price: 9_166_101,
            gst_costs: 2_500_000,
            ..car
        })["exempt"],
        false
    );
    // A cent over the threshold with $16,000 of costs: the $18,332.20 value cannot be covered.
    assert!(
        lease_oracle(&Lease {
            price: 9_166_101,
            ..car
        })["error"]
            .is_string()
    );
}

#[test]
fn the_super_projection_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1119_1A7C_0007);
    let money = |cents: i128| format!("{}.{:02}", cents / 100, cents % 100);
    let rate = |hundredths: i128| format!("{}.{:02}", hundredths / 100, hundredths % 100);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..PROJECTION_CASES)
        .map(|_| {
            let retire = 60 + rng.below(16);
            let age = 15 + rng.below(retire - 15);
            let p = Projection {
                age,
                retire,
                balance: rng.below(200_000_001) as i128,
                salary: (rng.income(&[270_830, 0, 300_000]) * 100) as i128,
                employer: if rng.below(3) == 0 { rng.below(3_001) as i128 } else { 1_200 },
                sacrifice: if rng.below(3) == 0 { rng.below(3_000_001) as i128 } else { 0 },
                after_tax: if rng.below(4) == 0 { rng.below(14_000_001) as i128 } else { 0 },
                earn: rng.below(1_201) as i128,
                percent_fee: rng.below(151) as i128,
                admin_fee: rng.below(30_001) as i128,
                insurance: rng.below(150_001) as i128,
                growth: rng.below(601) as i128,
                discount: rng.below(601) as u32,
            };
            let input = json!({"age": age.to_string(), "retire": retire.to_string(), "balance": money(p.balance),
                "salary": (p.salary / 100).to_string(), "employer": rate(p.employer), "sacrifice": money(p.sacrifice),
                "afterTax": money(p.after_tax), "returnRate": rate(p.earn), "percentFee": rate(p.percent_fee),
                "adminFee": money(p.admin_fee), "insurance": money(p.insurance), "growth": rate(p.growth),
                "discount": rate(p.discount as i128)});
            (json!({"kind": "projection", "projection": input}), projection_oracle(&p))
        })
        .unzip();
    agree(&cases, &expected);
}

#[test]
fn the_novated_lease_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1119_1A7C_0006);
    let years = ["2023-24", "2024-25", "2025-26", "2026-27"];
    let sales = [
        "2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27",
    ];
    let money = |cents: u64| format!("{}.{:02}", cents / 100, cents % 100);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..LEASE_CASES)
        .map(|_| {
            let at = 1 + rng.below(years.len() as u64) as usize;
            let year = years[at - 1];
            let sale_year = rng.pick(&sales[..at + 2]);
            let price = if rng.below(2) == 0 {
                lct_threshold(sale_year) * 100 + rng.below(3) - 1
            } else {
                1 + rng.below(15_000_000)
            };
            let kind = rng.pick(&["bev", "fcev", "phev", "other"]);
            let mut l = Lease {
                year,
                kind,
                after: rng.below(5) != 0,
                // A plug-in hybrid under a commitment from before 1 April 2025 was sold by 2024-25.
                commitment: rng.below(2) == 0 && (kind != "phev" || sale_year <= "2024-25"),
                sale_year,
                price,
                other_supply: rng.below(8) == 0,
                reduced: rng.below(4) == 0,
                days: if rng.below(2) == 0 { days_in(year) } else { rng.below(days_in(year) + 1) },
                gst_costs: rng.below(4_000_001),
                other_costs: rng.below(300_001),
            };
            let first_sale_taxed = price > lct_threshold(sale_year) * 100;
            if sale_year == year && first_sale_taxed && !l.other_supply {
                // A July or later sale cannot precede a benefit provided in April to June.
                l.days = l.days.min(days_in(year) - 91);
            }
            let input = json!({"year": year, "residency": if rng.below(4) == 0 { "foreign" } else { "resident" },
                "salary": "400000", "studyLoan": rng.below(2) == 0, "hospitalCover": rng.below(2) == 0, "kind": l.kind,
                "firstUsed": if l.after { "2022-07-01" } else { "2022-06-30" }, "commitment": l.commitment, "saleYear": sale_year,
                "price": money(price), "otherSupply": l.other_supply,
                "lctTiming": if first_sale_taxed || l.other_supply { "before-all" } else { "mixed-or-unknown" },
                "reduced": l.reduced, "days": l.days.to_string(), "gstCosts": money(l.gst_costs),
                "otherCosts": money(l.other_costs)});
            (json!({"kind": "lease", "lease": input}), lease_oracle(&l))
        })
        .unzip();
    agree(&cases, &expected);
}

/// Schedule 5 (Tax table for back payments, commissions, bonuses and similar payments, published
/// 17 June 2026 for payments from 1 July 2026), as its method steps read, in cents. The 'relevant
/// tax table' is Schedule 1 on scale 2 or 3, plus Schedule 8 with a study loan, each in whole
/// dollars. B(i) works each earlier pay in turn and adds them up, where the engine multiplies one
/// pay's result by the count; the 47% limit compares 47 times the payment with 100 times the step's
/// dollars, where the engine compares cents.
struct Bonus<'a> {
    period: &'a str,
    resident: bool,
    loan: bool,
    method_a: bool,
    earnings: u64,
    additional: u64,
    spread: u64,
    back: (u64, u64, u64, u64),
    to_date: (u64, u64, u64, u64),
}

fn per_year(period: &str) -> u64 {
    match period {
        "week" => 52,
        "fortnight" => 26,
        _ => 12,
    }
}

impl Bonus<'_> {
    /// [tax, study loan, total] in cents withheld from one pay of `earnings` cents.
    fn table(&self, earnings: u64) -> [u64; 3] {
        let scale: &[(u64, i64, i64)] = if self.resident { &SCALE_2 } else { &SCALE_3 };
        let tax = withheld(earnings, self.period, scale) * 100;
        let loan = if self.loan {
            withheld(earnings, self.period, &SCHEDULE_8) * 100
        } else {
            0
        };
        [tax, loan, tax + loan]
    }
}

fn split(cents: [u64; 3]) -> Value {
    json!({"tax": cents[0], "studyLoan": cents[1], "total": cents[2]})
}

/// Steps 6 and 7 of Method A or B(ii): the higher table less the lower, times `times`.
fn spread_extra(high: [u64; 3], low: [u64; 3], times: u64) -> [u64; 3] {
    [0, 1, 2].map(|i| (high[i] - low[i]) * times)
}

/// The lesser of `amount` cents and 47% of `additional`, cents ignored, nil if negative.
fn limit_47(amount: i64, additional: u64) -> u64 {
    let amount = amount.max(0) as u64;
    let dollars = if amount * 100 <= additional * 47 {
        amount / 100
    } else {
        additional * 47 / 10_000
    };
    dollars * 100
}

fn bonus_oracle(b: &Bonus) -> Value {
    let pays = per_year(b.period);
    let floor_dollars = |cents: u64| cents / 100 * 100;
    if b.method_a {
        let step1 = floor_dollars(b.earnings);
        let step2 = b.table(step1);
        let step3 = floor_dollars(b.additional / b.spread);
        let step5 = b.table(step1 + step3);
        let step7 = spread_extra(step5, step2, b.spread);
        let on_additional = limit_47(step7[2] as i64, b.additional);
        let year = b.earnings * pays;
        let owed = |salary: u64| {
            let r = pay_oracle(&Pay {
                year: "2026-27",
                residency: if b.resident { "resident" } else { "foreign" },
                period: ("year", 1),
                salary,
                sacrifice: 0,
                included: false,
                loan: b.loan,
                cover: true,
            });
            r["salary"].as_u64().unwrap() - r["net"].as_u64().unwrap()
        };
        return json!({"method": "A", "spread": b.spread * 100, "step1": step1, "step2": split(step2),
            "step3": step3, "step4": step1 + step3, "step5": split(step5), "step7": split(step7),
            "limit": b.additional * 47 / 100, "onAdditional": on_additional, "onEarnings": step2[2],
            "total": step2[2] + on_additional,
            "yearTax": owed(year + b.additional) - owed(year)});
    }
    let base = b.table(b.earnings);
    let (count, before, each, withheld_then) = b.back;
    let bi = (count > 0).then(|| {
        let recalculated = b.table(before + each);
        let sum: i64 = (0..count)
            .map(|_| recalculated[2] as i64 - withheld_then as i64)
            .sum();
        json!({"pays": count * 100, "each": each, "earnings": before + each,
            "recalculated": split(recalculated), "onBackPayment": sum.max(0)})
    });
    let (to_date, pays_to_date, earlier, earlier_withheld) = b.to_date;
    let bii = (b.additional > 0).then(|| {
        let step1 = floor_dollars((to_date + each * count) / pays_to_date);
        let step2 = b.table(step1);
        let step3 = floor_dollars((earlier + b.additional) / pays);
        let step5 = b.table(step1 + step3);
        let step7 = spread_extra(step5, step2, pays);
        let step8 = step7[2] as i64 - earlier_withheld as i64;
        json!({"step1": step1, "step2": split(step2), "step3": step3, "step4": step1 + step3,
            "step5": split(step5), "step7": split(step7), "step8": step8,
            "limit": b.additional * 47 / 100, "onAdditional": limit_47(step8, b.additional)})
    });
    let cents = |v: &Option<Value>, key: &str| v.as_ref().map_or(0, |v| v[key].as_i64().unwrap());
    let on_additional = cents(&bi, "onBackPayment") + cents(&bii, "onAdditional");
    json!({"method": "B", "base": split(base), "methodBi": bi, "methodBii": bii, "onEarnings": base[2],
        "onAdditional": on_additional, "total": base[2] as i64 + on_additional})
}

#[test]
fn the_oracle_works_the_schedule_5_examples_by_hand() {
    let pay = |period, loan, method_a| Bonus {
        period,
        resident: true,
        loan,
        method_a,
        earnings: 0,
        additional: 0,
        spread: 52,
        back: (0, 0, 0, 0),
        to_date: (0, 1, 0, 0),
    };
    // Example 1, Jarrod: $1,400 a week and a $900 bonus with HELP, $641 in all.
    let jarrod = bonus_oracle(&Bonus {
        earnings: 140_000,
        additional: 90_000,
        ..pay("week", true, true)
    });
    assert_eq!(jarrod["total"], 64_100);
    // Example 2, Robyn: 8 weeks of $100 back pay on $1,600, $331 and $40 withheld then, $794 now.
    let robyn = bonus_oracle(&Bonus {
        earnings: 170_000,
        back: (8, 160_000, 10_000, 37_100),
        ..pay("week", true, false)
    });
    assert_eq!(robyn["total"], 79_400);
    // Example 3, Laura: $2,480 of arrears, $18,000 over 10 fortnights, $992.
    let laura = bonus_oracle(&Bonus {
        earnings: 180_000,
        additional: 248_000,
        to_date: (1_800_000, 10, 0, 0),
        ..pay("fortnight", false, false)
    });
    assert_eq!(laura["total"], 99_200);
    // Example 4, Bradley: $1,600 by B(i) and $8,800 by B(ii) with a Financial Supplement debt, $6,492.
    let bradley = bonus_oracle(&Bonus {
        earnings: 700_000,
        additional: 880_000,
        back: (2, 620_000, 80_000, 125_700),
        to_date: (1_940_000, 3, 0, 0),
        ..pay("month", true, false)
    });
    assert_eq!(bradley["total"], 649_200);
}

#[test]
fn the_bonus_withholding_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1119_1A7C_0005);
    let money = |cents: u64| format!("{}.{:02}", cents / 100, cents % 100);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..BONUS_CASES)
        .map(|_| {
            let period = rng.pick(&["week", "fortnight", "month"]);
            let pays = per_year(period);
            // Weekly earnings near a Schedule 1 or 8 threshold, or any to $6,000, as this period's pay.
            let weekly = rng.income(&[362, 538, 673, 721, 865, 1282, 1337, 2494, 2596, 3577, 3653]) % 6_000;
            let earnings = weekly * 100 * 52 / pays + if rng.below(2) == 0 { rng.below(100) } else { 0 };
            let additional = rng.below(2_000_000) + 1;
            let method_a = rng.below(2) == 0;
            let back = if method_a || rng.below(3) == 0 {
                (0, 0, 0, 0)
            } else {
                (rng.below(pays - 1) + 1, rng.below(800_000), rng.below(50_000) + 1, rng.below(300_000))
            };
            let additional = if !method_a && back.0 > 0 && rng.below(2) == 0 { 0 } else { additional };
            let pays_to_date = rng.below(pays) + 1;
            let to_date = earnings + rng.below(400_000) * (pays_to_date - 1);
            let earlier = if rng.below(2) == 0 { rng.below(1_000_000) } else { 0 };
            let b = Bonus {
                period,
                resident: rng.below(3) != 0,
                loan: rng.below(2) == 0,
                method_a,
                earnings,
                additional,
                spread: if rng.below(3) == 0 { rng.below(pays - 1) + 2 } else { pays },
                back,
                to_date: (to_date, pays_to_date, earlier, if earlier > 0 { rng.below(400_000) } else { 0 }),
            };
            let bonus = json!({"period": period, "residency": if b.resident { "resident" } else { "foreign" },
                "studyLoan": b.loan, "method": if method_a { "A" } else { "B" }, "earnings": money(earnings),
                "additional": money(additional), "spread": b.spread.to_string(), "backPays": back.0.to_string(),
                "backEarnings": money(back.1), "backEach": money(back.2), "backWithheld": money(back.3),
                "yearToDate": money(to_date), "paysToDate": pays_to_date.to_string(),
                "earlierAdditional": money(earlier), "earlierWithheld": money(b.to_date.3)});
            (json!({"kind": "bonus", "bonus": bonus}), bonus_oracle(&b))
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

#[test]
fn the_sole_trader_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1119_1A7C_0005);
    let money = |cents: u64| format!("{}.{:02}", cents / 100, cents % 100);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..SOLE_CASES)
        .map(|_| {
            let year = rng.pick(&YEARS[1..]);
            let cents = |rng: &mut Seeded| if rng.below(2) == 0 { rng.below(100) } else { 0 };
            let income = rng.income(&[4_000, 22_000, 52_000, 75_000, 100_000, 135_000, 160_584]) * 100
                + cents(&mut rng);
            let expenses = if rng.below(3) == 0 { 0 } else { rng.below(income + 1) };
            let wages = if rng.below(2) == 0 {
                0
            } else {
                rng.income(&TAX_THRESHOLDS) * 100 + cents(&mut rng)
            };
            let deduction = if year == "2026-27" { wages.min(100_000) } else { 0 };
            let room = income - expenses + wages - deduction;
            let deductions = if rng.below(4) == 0 { rng.below(room.min(1_000_000) + 1) } else { 0 };
            let contributions = if rng.below(4) == 0 {
                rng.below((room - deductions).min(3_000_000) + 1)
            } else {
                0
            };
            let gst = rng.below(2) == 0;
            let credits = if gst && rng.below(2) == 0 { rng.below(half_up(income, 10) + 1) } else { 0 };
            let s = Sole {
                year,
                income,
                expenses,
                wages,
                deductions,
                contributions,
                offset: rng.below(4) != 0,
                loan: rng.below(3) == 0,
                cover: rng.below(3) != 0,
                gst,
                credits,
                invoice: rng.below(1_000_001),
            };
            let sole = json!({"year": year, "income": money(income), "expenses": money(expenses), "wages": money(wages),
                "deductions": money(deductions), "super": money(contributions), "offset": s.offset, "studyLoan": s.loan, "hospitalCover": s.cover,
                "gst": gst, "credits": money(credits), "invoice": money(s.invoice)});
            (json!({"kind": "sole", "sole": sole}), sole_oracle(&s))
        })
        .unzip();
    agree(&cases, &expected);
}

/// Seeded income test cases: 16 return amounts each, consistent with one another.
const INCOME_TEST_CASES: usize = 300;
/// The return amounts in the engine's order, `assets/income-tests.mjs` `INCOME_TEST_PARTS`.
const INCOME_TEST_PARTS: [&str; 16] = [
    "taxable",
    "fhss",
    "familyTrust",
    "fringe57a",
    "fringeOther",
    "employerSuper",
    "personalSuper",
    "excessConcessional",
    "financialLoss",
    "rentalLoss",
    "pensions",
    "targetForeign",
    "exemptForeign",
    "childSupport",
    "assessable",
    "businessDeductions",
];
/// The FBT rate for the FBT years ending 31 March 2025 to 2027, per cent: FBTAA s 135Q(4) grosses a
/// section 57A employer's quasi amount up at 1 / (1 - rate), so the amount before it is 100 - 47 hundredths.
const FBT_RATE: i64 = 47;

/// Each measure as its definition lists it, typed from the Acts read 19 November 2026: the terms it adds
/// (+1) and takes off (-1). The derived terms are worked in `income_test_terms`.
const MEASURES: [(&str, &[(&str, i64)]); 6] = [
    // ITAA 1997 s 995-1 'income for surcharge purposes' (a) to (d).
    (
        "surchargeIncome",
        &[
            ("taxableWithoutFhss", 1),
            ("familyTrust", 1),
            ("fringeTotal", 1),
            ("contributions", 1),
            ("losses", 1),
        ],
    ),
    // s 293-20(1)(a): the same, disregarding reportable superannuation contributions.
    (
        "division293Income",
        &[
            ("taxableWithoutFhss", 1),
            ("familyTrust", 1),
            ("fringeTotal", 1),
            ("losses", 1),
        ],
    ),
    // ITAA 1936 s 6(1) 'rebate income' (a) to (d).
    (
        "rebateIncome",
        &[
            ("taxableWithoutFhss", 1),
            ("contributions", 1),
            ("losses", 1),
            ("adjustedFringe", 1),
        ],
    ),
    // HESA s 154-5(1)(a) to (e).
    (
        "repaymentIncome",
        &[
            ("taxableWithoutFhss", 1),
            ("losses", 1),
            ("fringeTotal", 1),
            ("exemptForeign", 1),
            ("contributions", 1),
        ],
    ),
    // Family Assistance Act Sch 3 cl 2(1) (a) to (f), less deductible child maintenance expenditure.
    (
        "adjustedTaxableIncome",
        &[
            ("taxableWithoutFhss", 1),
            ("adjustedFringe", 1),
            ("targetForeign", 1),
            ("losses", 1),
            ("pensions", 1),
            ("contributions", 1),
            ("childSupport", -1),
        ],
    ),
    // Co-contribution Act s 8(1) (a) to (c) and (2).
    (
        "coContributionIncome",
        &[
            ("assessable", 1),
            ("fhss", -1),
            ("fringeTotal", 1),
            ("coEmployer", 1),
            ("businessDeductions", -1),
        ],
    ),
];

/// The return amounts and the terms derived from them, in whole dollars.
fn income_test_terms(parts: &[(&str, i64)]) -> Vec<(&'static str, i64)> {
    let get = |name: &str| parts.iter().find(|(n, _)| *n == name).unwrap().1;
    let mut terms: Vec<(&'static str, i64)> = INCOME_TEST_PARTS
        .iter()
        .map(|name| (*name, get(name)))
        .collect();
    // Nothing of taxable income is left where the FHSS amount is more (ITAA 1997 s 4-15(1)).
    terms.push(("taxableWithoutFhss", (get("taxable") - get("fhss")).max(0)));
    terms.push(("fringeTotal", get("fringe57a") + get("fringeOther")));
    // The quasi amount: the reportable amount over 1 / (1 - rate), to the dollar below, as the
    // ATO's 2026 rebate income worksheet rounds it.
    terms.push((
        "adjustedFringe",
        get("fringe57a") * (100 - FBT_RATE) / 100 + get("fringeOther"),
    ));
    terms.push(("losses", get("financialLoss") + get("rentalLoss")));
    terms.push((
        "contributions",
        (get("employerSuper") + get("personalSuper") - get("excessConcessional")).max(0),
    ));
    terms.push((
        "coEmployer",
        (get("employerSuper") - get("excessConcessional")).max(0),
    ));
    terms
}

/// What the engine must return, in cents as the harness gives it.
fn income_tests_oracle(parts: &[(&str, i64)]) -> Value {
    let terms = income_test_terms(parts);
    let term = |name: &str| terms.iter().find(|(n, _)| *n == name).unwrap().1;
    let mut out = serde_json::Map::new();
    for name in [
        "taxableWithoutFhss",
        "fringeTotal",
        "adjustedFringe",
        "losses",
        "contributions",
        "coEmployer",
    ] {
        out.insert(name.into(), json!(term(name) * 100));
    }
    for (measure, list) in MEASURES {
        let sum: i64 = list.iter().map(|(name, sign)| sign * term(name)).sum();
        out.insert(measure.into(), json!(sum * 100));
    }
    // s 995-1 leaves exempt foreign employment income out of income for surcharge purposes; the
    // ATO's surcharge page adds it where taxable income is $1 or more.
    out.insert(
        "exemptForeignDiffers".into(),
        json!(term("exemptForeign") > 0 && term("taxable") > 0),
    );
    Value::Object(out)
}

/// Return amounts that hold together: taxable income, the FHSS amount and excess concessional
/// contributions within assessable income, and exempt foreign employment income within target
/// foreign income. A quarter of the other amounts are nil.
fn income_test_case(rng: &mut Seeded) -> Vec<(&'static str, i64)> {
    let amount = |rng: &mut Seeded, limit: u64| -> i64 {
        if rng.below(4) == 0 {
            0
        } else {
            i64::try_from(rng.below(limit + 1)).unwrap()
        }
    };
    let mut parts: Vec<(&'static str, i64)> = INCOME_TEST_PARTS
        .iter()
        .map(|name| (*name, amount(rng, 80_000)))
        .collect();
    let set = |parts: &mut Vec<(&'static str, i64)>, name: &str, value: i64| {
        parts.iter_mut().find(|(n, _)| *n == name).unwrap().1 = value;
    };
    let get = |parts: &[(&str, i64)], name: &str| parts.iter().find(|(n, _)| *n == name).unwrap().1;
    let taxable = amount(rng, 400_000);
    set(&mut parts, "taxable", taxable);
    let floor = taxable
        .max(get(&parts, "fhss"))
        .max(get(&parts, "excessConcessional"));
    let extra = amount(rng, 60_000);
    set(&mut parts, "assessable", floor + extra);
    let exempt = get(&parts, "exemptForeign");
    let more = amount(rng, 20_000);
    set(&mut parts, "targetForeign", exempt + more);
    parts
}

fn income_test_input(parts: &[(&str, i64)]) -> Value {
    let mut call = serde_json::Map::new();
    call.insert("resident".into(), json!(true));
    for (name, value) in parts {
        call.insert((*name).into(), json!(value.to_string()));
    }
    json!({"kind": "tests", "parts": call})
}

#[test]
fn the_income_tests_oracle_works_the_atos_examples_by_hand() {
    let parts = |given: &[(&'static str, i64)]| {
        INCOME_TEST_PARTS
            .iter()
            .map(|name| {
                let value = given.iter().find(|(n, _)| n == name).map_or(0, |(_, v)| *v);
                (*name, value)
            })
            .collect::<Vec<_>>()
    };
    // When you must repay your loan: Christina's $50,420, $1,250, $4,560, $2,580 and $15,000 give
    // repayment income of $73,810.
    let christina = income_tests_oracle(&parts(&[
        ("taxable", 50_420),
        ("financialLoss", 1_250),
        ("fringeOther", 4_560),
        ("exemptForeign", 2_580),
        ("targetForeign", 2_580),
        ("employerSuper", 15_000),
        ("assessable", 50_420),
    ]));
    assert_eq!(christina["repaymentIncome"], 7_381_000);
    // Medicare levy surcharge income, thresholds and rates: Tom's $90,000 and $27,000, $117,000.
    let tom = income_tests_oracle(&parts(&[
        ("taxable", 90_000),
        ("fringeOther", 27_000),
        ("assessable", 90_000),
    ]));
    assert_eq!(tom["surchargeIncome"], 11_700_000);
    // Rebate income 2026: label N x 0.53 rounded down, $4,567 to $2,420.
    let exempt = income_tests_oracle(&parts(&[("fringe57a", 4_567)]));
    assert_eq!(exempt["adjustedFringe"], 242_000);
}

#[test]
fn the_income_tests_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1119_1A7C_0007);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..INCOME_TEST_CASES)
        .map(|_| {
            let parts = income_test_case(&mut rng);
            (income_test_input(&parts), income_tests_oracle(&parts))
        })
        .unzip();
    agree(&cases, &expected);
}

const OWNER_CASES: usize = 160;
const OWNER_SCANS: usize = 24;

/// A company owner's year: the company's profit before the owner's pay and other taxable income,
/// in cents, and whether the company is a base rate entity.
struct Owner<'a> {
    year: &'a str,
    profit: u64,
    base_rate: bool,
    other: u64,
}

fn resident_total(income: u64, year: &str) -> i64 {
    tax_oracle(income, year, "resident")["total"]
        .as_i64()
        .unwrap()
}

fn owner_super(salary: u64, year: &str) -> u64 {
    let (mille, cap, _) = super_guarantee(year);
    half_up(salary.min(cap * 100) * mille, 1000)
}

/// The largest salary whose super guarantee the profit also pays, by bisection.
fn owner_largest(o: &Owner) -> u64 {
    let (mut low, mut high) = (0, o.profit);
    while low < high {
        let middle = (low + high).div_ceil(2);
        if middle + owner_super(middle, o.year) <= o.profit {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    low
}

/// One split in cents: the salary and its super guarantee; company tax at 25% or 30% of the rest,
/// half up; the rest a dividend franked at 1/3 or 3/7 of itself, rounded down (ITAA 1997 s 202-60);
/// the owner's tax on other income, salary, dividend and credit (s 207-20), less up to $1,000 of
/// salary from 2026-27 (s 25-130), to the dollar, less the credit and the tax on the other income
/// alone; super less 15% of the super guarantee and 15% of the part over $250,000 (s 293-20).
fn owner_split(o: &Owner, salary: u64) -> Value {
    let sg = owner_super(salary, o.year);
    let left = o.profit - salary - sg;
    let rate = if o.base_rate { 25 } else { 30 };
    let company_tax = half_up(left * rate, 100);
    let dividend = left - company_tax;
    let credit = dividend * rate / (100 - rate);
    let deduction = if o.year == "2026-27" {
        salary.min(100_000)
    } else {
        0
    };
    let taxable = (o.other + salary + dividend + credit - deduction) / 100;
    let owner_tax =
        resident_total(taxable, o.year) - credit as i64 - resident_total(o.other / 100, o.year);
    let excess = (taxable * 100 + sg).saturating_sub(25_000_000).min(sg);
    let division_293 = half_up(excess * 15, 100);
    let super_tax = half_up(sg * 15, 100) + division_293;
    let cash = (salary + dividend) as i64 - owner_tax;
    json!({"salary": salary, "superGuarantee": sg, "companyTax": company_tax, "dividend": dividend,
        "credit": credit, "taxable": taxable * 100, "ownerTax": owner_tax, "cash": cash, "superTax": super_tax,
        "superNet": sg - super_tax, "kept": cash + (sg - super_tax) as i64, "division293": division_293})
}

fn kept(split: &Value) -> i64 {
    split["kept"].as_i64().unwrap()
}

#[test]
fn the_salary_dividend_oracle_works_the_page_example_by_hand() {
    let o = Owner {
        year: "2026-27",
        profit: 20_000_000,
        base_rate: true,
        other: 0,
    };
    // $12,000 of super guarantee, $22,000 of company tax, a $66,000 dividend with a $22,000
    // credit; tax on $187,000 of $54,000 less the credit; $134,000 cash and $10,200 of super.
    let split = owner_split(&o, 10_000_000);
    assert_eq!(
        split,
        json!({"salary": 10_000_000, "superGuarantee": 1_200_000, "companyTax": 2_200_000,
            "dividend": 6_600_000, "credit": 2_200_000, "taxable": 18_700_000, "ownerTax": 3_200_000,
            "cash": 13_400_000, "superTax": 180_000, "superNet": 1_020_000, "kept": 14_420_000,
            "division293": 0})
    );
    // All salary: $178,571.43 and its $21,428.57 of super guarantee use the whole profit.
    assert_eq!(owner_largest(&o), 17_857_143);
    assert_eq!(kept(&owner_split(&o, 17_857_143)), 14_646_302);
}

#[test]
fn the_salary_dividend_engine_agrees_with_the_oracle_and_no_dollar_of_salary_keeps_more() {
    let mut rng = Seeded(0x2026_1119_5A1A_D1F0);
    let money = |cents: u64| format!("{}.{:02}", cents / 100, cents % 100);
    let mut owners = Vec::new();
    let mut cases = Vec::new();
    for index in 0..OWNER_CASES + OWNER_SCANS {
        let profit = if index < OWNER_CASES {
            rng.income(&[0, 20_000, 40_000, 60_000, 250_000, 300_000, 350_000]) * 100
                + rng.below(100)
        } else {
            (5_000 + rng.below(35_001)) * 100
        };
        let some = rng.below(15_000_001);
        let other = rng.pick(&[0, 0, some]);
        let o = Owner {
            year: rng.pick(&PAY_YEARS),
            profit,
            base_rate: rng.below(2) == 0,
            other,
        };
        let largest = owner_largest(&o);
        let any = rng.below(largest + 1);
        let cap = super_guarantee(o.year).1 * 100;
        let salary = rng.pick(&[0, largest, cap.min(largest), any, any]);
        let pay = json!({"year": o.year, "profit": money(profit), "baseRate": o.base_rate,
            "salary": money(salary), "other": money(other)});
        cases.push(json!({"kind": "owner", "pay": pay}));
        owners.push((o, salary, largest, index >= OWNER_CASES));
    }
    let actual = run_node(&cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, (o, salary, largest, scan)), got) in cases.iter().zip(&owners).zip(&actual) {
        let best_salary = got["bestSalary"].as_u64().unwrap();
        assert!(best_salary <= *largest, "{case}");
        let best = owner_split(o, best_salary);
        let mut want = owner_split(o, *salary);
        let all_salary = owner_split(o, *largest);
        let all_dividends = owner_split(o, 0);
        for (key, value) in [
            ("largest", json!(largest)),
            ("allSalary", all_salary["kept"].clone()),
            ("allDividends", all_dividends["kept"].clone()),
            ("bestSalary", json!(best_salary)),
            ("bestKept", best["kept"].clone()),
            ("bestCash", best["cash"].clone()),
            ("bestSuper", best["superNet"].clone()),
        ] {
            want[key] = value;
        }
        assert_eq!(got, &want, "{case}");
        // Rounding to the cent and taxable income to the dollar move the total by cents from one
        // dollar of salary to the next, so the best may trail another salary by less than $1.
        let mut others = vec![kept(&want), kept(&all_salary), kept(&all_dividends)];
        if *scan {
            others.extend((0..=largest / 100).map(|dollars| kept(&owner_split(o, dollars * 100))));
        }
        let most = others.into_iter().max().unwrap();
        assert!(
            kept(&best) > most - 100,
            "{case}: {} against {most}",
            kept(&best)
        );
    }
}

/// Cents a work hour for the fixed rate, and the shortcut before 2022-23: the ATO's 52 cent and
/// shortcut pages (2020-21 and 2021-22) and PCG 2023/1 Table 1 (67c, then 70c from 1 July 2024).
fn work_hourly(year: &str) -> (u128, Option<u128>) {
    match year {
        "2020-21" | "2021-22" => (52, Some(80)),
        "2022-23" | "2023-24" => (67, None),
        _ => (70, None),
    }
}

/// Cents a kilometre from the ATO's cents per kilometre page, last updated 12 August 2026.
fn work_per_kilometre(year: &str) -> u128 {
    match year {
        "2020-21" | "2021-22" => 72,
        "2022-23" => 78,
        "2023-24" => 85,
        "2024-25" | "2025-26" => 88,
        _ => 91,
    }
}

/// Hundredths as the engine writes them.
fn work_text(hundredths: u128) -> String {
    format!("{}.{:02}", hundredths / 100, hundredths % 100)
}

/// A fraction of cents half up to the cent, and with its cents taken off.
fn work_shown(numerator: u128, denominator: u128) -> (String, String) {
    let cents = (2 * numerator + denominator) / (2 * denominator);
    let dollars = numerator / denominator / 100;
    (work_text(cents), format!("{dollars}.00"))
}

/// The amounts for one call, from its hours in hundredths and amounts in cents.
fn work_oracle(facts: &Value) -> Value {
    let cents = |name: &str| -> u128 {
        let text = facts[name].as_str().unwrap();
        let (whole, part) = text.split_once('.').unwrap_or((text, "0"));
        whole.parse::<u128>().unwrap() * 100 + format!("{part:0<2}").parse::<u128>().unwrap()
    };
    let year = facts["year"].as_str().unwrap();
    let mut amounts = serde_json::Map::new();
    let mut put = |id: &str, value: String| {
        amounts.insert(id.to_string(), json!(value));
    };
    let higher = match facts["method"].as_str().unwrap() {
        "home_office" => {
            let hours = cents("hours");
            let (fixed, shortcut) = work_hourly(year);
            let early = shortcut.is_some();
            let incurred = facts["running_expenses_incurred"] == json!(true);
            let dedicated = !early || facts["dedicated_home_office"] == json!(true);
            let [
                energy,
                phone,
                internet,
                stationery,
                cleaning,
                furniture,
                assets,
                repairs,
            ] = [
                "energy",
                "phone",
                "internet",
                "stationery",
                "cleaning",
                "furniture_decline",
                "asset_decline",
                "repairs",
            ]
            .map(cents);
            // The engine refuses these before this point; the cases never send them.
            assert!(
                incurred
                    || energy + phone + internet + stationery + if early { cleaning } else { 0 }
                        == 0
            );
            let mut best: (&str, u128) = ("", 0);
            let mut consider = |name: &'static str, total: u128| {
                if best.0.is_empty() || total > best.1 {
                    best = (name, total);
                }
            };
            if incurred && dedicated {
                // Hundredths of an hour times cents is hundredths of a cent.
                let beside = if early {
                    phone + internet + stationery + assets + repairs
                } else {
                    cleaning + furniture + assets + repairs
                };
                let total = hours * fixed + beside * 100;
                put("fixed_rate_amount", work_shown(hours * fixed, 100).0);
                put("fixed_rate_separate_expenses", work_text(beside));
                let (shown, back) = work_shown(total, 100);
                put("fixed_rate_method", shown);
                put("fixed_rate_return_amount", back);
                consider("fixed_rate", total);
            }
            if let (true, Some(rate)) = (incurred, shortcut) {
                let (shown, back) = work_shown(hours * rate, 100);
                put("shortcut_method", shown);
                put("shortcut_return_amount", back);
                consider("shortcut", hours * rate);
            }
            let actual =
                energy + phone + internet + stationery + cleaning + furniture + assets + repairs;
            put("actual_cost_method", work_text(actual));
            put("actual_cost_return_amount", format!("{}.00", actual / 100));
            consider("actual_cost", actual * 100);
            json!(best.0)
        }
        "self_education" => {
            // s 8-1 and TR 2024/3: nothing unless employed and connected to current employment
            // when incurred; s 82A before 2022-23 for a prescribed course:
            // max(0, A - max(0, 250 - (C + D + E))) + B + C + D.
            let connected = facts["employed_when_incurred"] == json!(true)
                && matches!(
                    facts["connection"].as_str(),
                    Some("maintains_or_improves_skills" | "increases_income")
                );
            let prescribed = year < "2022-23" && facts["prescribed_course"] == json!(true);
            let [a, b, c, d] = ["category_a", "category_b", "category_c", "category_d"].map(cents);
            let deduction = if !connected {
                0
            } else if prescribed {
                let offset = c + d + cents("category_e");
                let reduction = 25_000u128.saturating_sub(offset);
                let reduced = a.saturating_sub(reduction);
                put("reduction_offset", work_text(offset));
                put("reduction", work_text(reduction));
                put("category_a_after_reduction", work_text(reduced));
                reduced + b + c + d
            } else {
                a + b + c + d
            };
            put("deduction", work_text(deduction));
            put("return_amount", format!("{}.00", deduction / 100));
            Value::Null
        }
        "car_cents_per_kilometre" => {
            let counted = cents("business_kilometres").min(500_000);
            put("claimed_kilometres", work_text(counted));
            let (shown, back) = work_shown(counted * work_per_kilometre(year), 100);
            put("deduction", shown);
            put("return_amount", back);
            Value::Null
        }
        _ => {
            let (business, total, expenses) = (
                cents("business_kilometres"),
                cents("total_kilometres"),
                cents("car_expenses"),
            );
            put(
                "business_use_percentage",
                work_shown(business * 10_000, total).0,
            );
            let (shown, back) = work_shown(expenses * business, total);
            put("deduction", shown);
            put("return_amount", back);
            Value::Null
        }
    };
    json!({ "amounts": amounts, "higher": higher })
}

#[test]
fn the_work_expenses_oracle_works_the_atos_examples_by_hand() {
    let home = |hours: &str| {
        json!({ "method": "home_office", "year": "2025-26", "hours": hours, "energy": "0", "phone": "0",
            "internet": "0", "stationery": "0", "cleaning": "0", "furniture_decline": "549", "asset_decline": "0",
            "repairs": "0", "running_expenses_incurred": true })
    };
    // Yang: 567 hours at 70c is $396.90, with a $299 chair and $250 desk $945.90, $945 claimed.
    let yang = work_oracle(&home("567"));
    assert_eq!(yang["amounts"]["fixed_rate_method"], "945.90");
    assert_eq!(yang["amounts"]["fixed_rate_return_amount"], "945.00");
    // Johan: 2,514 km at 88c is $2,212.32.
    let johan = work_oracle(
        &json!({ "method": "car_cents_per_kilometre", "year": "2025-26", "business_kilometres": "2514" }),
    );
    assert_eq!(johan["amounts"]["deduction"], "2212.32");
    // Lana: 69% of $17,275.33 is $11,919.98.
    let lana = work_oracle(
        &json!({ "method": "car_log_book", "year": "2025-26", "business_kilometres": "6900",
        "total_kilometres": "10000", "car_expenses": "17275.33" }),
    );
    assert_eq!(lana["amounts"]["deduction"], "11919.98");
    let study = |a: &str, b: &str, c: &str, d: &str, e: &str| {
        json!({ "method": "self_education", "year": "2021-22", "connection": "maintains_or_improves_skills",
            "employed_when_incurred": true, "prescribed_course": true, "category_a": a, "category_b": b,
            "category_c": c, "category_d": d, "category_e": e })
    };
    // Maureen: $290 of category A less the full $250 reduction is $40.
    assert_eq!(
        work_oracle(&study("290", "0", "0", "0", "0"))["amounts"]["deduction"],
        "40.00"
    );
    // Con: C + D + E of $700 leaves no reduction, so $350 + $200 + $100 + $100 is $750.
    assert_eq!(
        work_oracle(&study("350", "200", "100", "100", "500"))["amounts"]["deduction"],
        "750.00"
    );
}

#[test]
fn the_work_expenses_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1122_0B3E_0003);
    let amount = |rng: &mut Seeded, most: u64| {
        let cents = if rng.below(3) == 0 {
            0
        } else {
            rng.below(most * 100 + 1)
        };
        format!("{}.{:02}", cents / 100, cents % 100)
    };
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..1200)
        .map(|i| {
            let year = rng.pick(&YEARS);
            let base = json!({ "year": year, "scope_confirmed": true, "reimbursed": false, "allowance_received": false });
            let mut facts = base.as_object().unwrap().clone();
            let mut set = |key: &str, value: Value| {
                facts.insert(key.to_string(), value);
            };
            match i % 4 {
                0 => {
                    let early = year < "2022-23";
                    let incurred = rng.below(4) != 0;
                    set("method", json!("home_office"));
                    set("hours", json!(amount(&mut rng, 2_000)));
                    for name in ["energy", "phone", "internet", "stationery", "cleaning", "furniture_decline", "asset_decline", "repairs"] {
                        let running = matches!(name, "energy" | "phone" | "internet" | "stationery") || (early && name == "cleaning");
                        set(name, json!(if !incurred && running { "0.00".to_string() } else { amount(&mut rng, 900) }));
                    }
                    set("running_expenses_incurred", json!(incurred));
                    if early {
                        set("dedicated_home_office", json!(rng.below(3) != 0));
                    }
                }
                1 => {
                    set("method", json!("car_cents_per_kilometre"));
                    set("owned_or_leased", json!(true));
                    let near = rng.pick(&[4_999, 5_000, 5_001]);
                    set("business_kilometres", json!(if rng.below(4) == 0 { format!("{near}.00") } else { amount(&mut rng, 9_000) }));
                }
                2 => {
                    let early = year < "2022-23";
                    let connection = rng.pick(&["maintains_or_improves_skills", "increases_income", "general_only", "new_employment"]);
                    set("method", json!("self_education"));
                    set("connection", json!(connection));
                    set("employed_when_incurred", json!(rng.below(5) != 0));
                    for name in ["category_a", "category_b"] {
                        set(name, json!(amount(&mut rng, 5_000)));
                    }
                    // C + D + E lands on, or a few cents either side of, the $250 the reduction starts from.
                    let c = rng.below(15_001);
                    let d = if rng.below(2) == 0 { 0 } else { rng.below(10_001) };
                    let near = (25_000 + rng.below(7)).saturating_sub(3 + c + d);
                    let e = if rng.below(3) == 0 { rng.below(30_001) } else { near };
                    let text = |cents: u64| format!("{}.{:02}", cents / 100, cents % 100);
                    set("category_c", json!(text(c)));
                    set("category_d", json!(text(d)));
                    if d > 0 || rng.below(2) == 0 {
                        set("log_book_car_in_category_a", json!(false));
                    }
                    if early {
                        let prescribed = rng.below(4) != 0;
                        set("prescribed_course", json!(prescribed));
                        if prescribed {
                            set("category_e", json!(text(e)));
                        }
                    }
                }
                _ => {
                    let total = 1_000 + rng.below(60_000);
                    let business = rng.below(total * 100 + 1);
                    set("method", json!("car_log_book"));
                    set("owned_or_leased", json!(true));
                    set("business_kilometres", json!(format!("{}.{:02}", business / 100, business % 100)));
                    set("total_kilometres", json!(format!("{total}.00")));
                    set("car_expenses", json!(format!("{}.{:02}", 1_000 + rng.below(40_000), rng.below(100))));
                    set("log_book_year", json!(year));
                    set("log_book_weeks", json!("12"));
                    set("log_book_representative", json!(true));
                }
            }
            let facts = Value::Object(facts);
            let want = work_oracle(&facts);
            (json!({ "kind": "work", "facts": facts }), want)
        })
        .unzip();
    agree(&cases, &expected);
}

/// The co-contribution's lower income threshold by year, typed from the ATO's 'Government
/// contributions' Table 25 (last updated 27 April 2026); the higher is $15,000 above it.
fn gov_lower(year: &str) -> i128 {
    match year {
        "2020-21" => 39_837,
        "2021-22" => 41_112,
        "2022-23" => 42_016,
        "2023-24" => 43_445,
        "2024-25" => 45_400,
        "2025-26" => 47_488,
        _ => 49_293,
    }
}

/// Cents as the engine writes them: "12.34", with a minus sign below nil.
fn gov_text(cents: i128) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    format!("{sign}{}.{:02}", cents.abs() / 100, cents.abs() % 100)
}

/// Half up to the cent, from a numerator over a positive denominator in cents.
fn gov_half_up(numerator: i128, denominator: i128) -> i128 {
    (2 * numerator + denominator) / (2 * denominator)
}

/// The oracle's amounts for one seeded case, from the Co-contribution Act ss 6, 8 to 11, 12C and 12E
/// and ITAA 1997 ss 290-230 and 290-235, in whole cents, the co-contribution in hundred-thousandths of a dollar.
fn gov_oracle(case: &Value) -> Value {
    let int = |key: &str| {
        case[key]
            .as_str()
            .unwrap()
            .replace('.', "")
            .parse::<i128>()
            .unwrap()
    };
    // Whole-dollar income parts in cents; the contributions and eligible income carry their cents.
    let dollars = |key: &str| case[key].as_str().unwrap().parse::<i128>().unwrap() * 100;
    let cents = |key: &str| {
        let text = case[key].as_str().unwrap();
        if text.contains('.') {
            int(key)
        } else {
            int(key) * 100
        }
    };
    let (assessable, taxable, business) = (
        dollars("assessable_income"),
        dollars("taxable_income"),
        dollars("business_deductions"),
    );
    let (employer, excess) = (
        dollars("reportable_employer_super_contributions"),
        dollars("excess_concessional_contributions"),
    );
    let (other, section_57a) = (
        dollars("reportable_fringe_benefits_other"),
        dollars("reportable_fringe_benefits_section_57a"),
    );
    let (rental, child) = (
        dollars("net_rental_property_loss"),
        dollars("child_support_paid"),
    );
    let employer_net = (employer - excess).max(0);
    // s 8(1), (1A) and (2); for the 10% test, before business deductions (s 8(3)).
    let total = assessable + other + section_57a + employer_net - business;
    let before_business = total + business;
    // Family Assistance Act Sch 3: a section 57A employer's amount at 53%, down to the dollar.
    let adjusted =
        taxable + (section_57a / 100 * 53 / 100) * 100 + other + rental + employer_net - child;
    let eligible = cents("eligible_income");
    let ten = eligible * 10 >= before_business;
    let flag = |key: &str| case[key].as_bool().unwrap();
    let lower = gov_lower(case["year"].as_str().unwrap()) * 100;
    let personal = cents("personal_contributions");
    let co_payable = personal > 0
        && ten
        && total < lower + 1_500_000
        && flag("return_lodged")
        && flag("under_71")
        && flag("non_concessional_within_cap")
        && flag("total_super_balance_below_cap");
    // In hundred-thousandths of a dollar, so 3.333 cents a dollar is exact.
    let taper = (total - lower).max(0) / 100 * 3_333;
    let maximum = (50_000_000 - taper).max(0);
    let co = if co_payable {
        (personal * 500).min(maximum).max(2_000_000)
    } else {
        0
    };
    let co_paid = (co + 4_999) / 5_000 * 5;
    let concessional = cents("concessional_contributions");
    let listo_payable = concessional > 0 && adjusted <= 3_700_000 && ten;
    let listo = if listo_payable {
        gov_half_up(concessional * 15, 100).clamp(1_000, 50_000)
    } else {
        0
    };
    let listo_paid = (listo + 4) / 5 * 5;
    let spouse = case.get("spouse_contributions").map(|_| {
        let income = cents("spouse_assessable_income")
            + cents("spouse_reportable_employer_super_contributions");
        let limit = (300_000 - (income - 3_700_000).max(0)).max(0);
        let made = cents("spouse_contributions");
        let payable = made > 0
            && income < 4_000_000
            && flag("spouse_non_concessional_within_cap")
            && flag("spouse_total_super_balance_below_cap");
        json!(gov_text(if payable {
            gov_half_up(made.min(limit) * 18, 100)
        } else {
            0
        }))
    });
    json!({
        "total": gov_text(total), "adjusted": gov_text(adjusted), "co": gov_text(gov_half_up(co, 1_000)), "co_paid": gov_text(co_paid),
        "listo": gov_text(listo), "listo_paid": gov_text(listo_paid), "spouse": spouse.unwrap_or(Value::Null),
    })
}

#[test]
fn the_government_super_oracle_works_the_atos_examples_by_hand() {
    let base = |year: &str, salary: &str| {
        json!({ "year": year, "assessable_income": salary, "taxable_income": salary, "business_deductions": "0",
            "reportable_employer_super_contributions": "0", "excess_concessional_contributions": "0",
            "reportable_fringe_benefits_other": "0", "reportable_fringe_benefits_section_57a": "0",
            "net_rental_property_loss": "0", "child_support_paid": "0", "eligible_income": salary,
            "personal_contributions": "0", "concessional_contributions": "0", "return_lodged": true, "under_71": true,
            "non_concessional_within_cap": true, "total_super_balance_below_cap": true })
    };
    let mut angelo = base("2023-24", "35000");
    angelo["personal_contributions"] = json!("1040");
    assert_eq!(gov_oracle(&angelo)["co"], "500.00");
    let mut taper = base("2025-26", "50000");
    taper["personal_contributions"] = json!("1000");
    assert_eq!(gov_oracle(&taper)["co"], "416.28");
    assert_eq!(gov_oracle(&taper)["co_paid"], "416.30");
    let mut julie = base("2022-23", "32000");
    julie["taxable_income"] = json!("31000");
    julie["concessional_contributions"] = json!("3360");
    assert_eq!(gov_oracle(&julie)["listo"], "500.00");
    let mut judy = base("2021-22", "80000");
    for (key, value) in [
        ("spouse_contributions", "3500"),
        ("spouse_assessable_income", "19000"),
        ("spouse_reportable_employer_super_contributions", "0"),
    ] {
        judy[key] = json!(value);
    }
    judy["spouse_non_concessional_within_cap"] = json!(true);
    judy["spouse_total_super_balance_below_cap"] = json!(true);
    assert_eq!(gov_oracle(&judy)["spouse"], "540.00");
    judy["spouse_assessable_income"] = json!("38000");
    assert_eq!(gov_oracle(&judy)["spouse"], "360.00");
}

#[test]
fn the_government_super_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1122_0B5E_0005);
    let money = |rng: &mut Seeded, most: u64| {
        let cents = rng.below(most * 100 + 1);
        format!("{}.{:02}", cents / 100, cents % 100)
    };
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..900)
        .map(|_| {
            let year = rng.pick(&YEARS);
            let lower = u64::try_from(gov_lower(year)).unwrap();
            let assessable = match rng.below(4) {
                0 => 1 + rng.below(37_500),
                1 => lower - 2 + rng.below(4),
                2 => lower + 14_998 + rng.below(4),
                _ => lower + rng.below(15_000),
            };
            let business = if rng.below(5) == 0 { rng.below(assessable) } else { 0 };
            let taxable = assessable - business - rng.below(assessable - business + 1).min(rng.below(3_000));
            let employer = if rng.below(3) == 0 { rng.below(9_000) } else { 0 };
            let excess = if rng.below(6) == 0 { rng.below(employer.min(assessable) + 1) } else { 0 };
            let most = rng.pick(&[0, 30, 1_200, 4_000]);
            let personal = money(&mut rng, most);
            let most = rng.pick(&[0, 70, 4_000, 12_000]);
            let concessional = money(&mut rng, most);
            let mut facts = json!({
                "taxable_income": taxable.to_string(), "assessable_fhss_released_amount": "0",
                "family_trust_distribution_amounts": "0",
                "reportable_fringe_benefits_section_57a": (if rng.below(5) == 0 { rng.below(8_000) } else { 0 }).to_string(),
                "reportable_fringe_benefits_other": (if rng.below(5) == 0 { rng.below(6_000) } else { 0 }).to_string(),
                "reportable_employer_super_contributions": employer.to_string(), "deductible_personal_super_contributions": "0",
                "excess_concessional_contributions": excess.to_string(), "net_financial_investment_loss": "0",
                "net_rental_property_loss": (if rng.below(5) == 0 { rng.below(9_000) } else { 0 }).to_string(),
                "tax_free_government_pensions": "0", "target_foreign_income": "0", "exempt_foreign_employment_income": "0",
                "child_support_paid": (if rng.below(8) == 0 { rng.below(5_000) } else { 0 }).to_string(),
                "assessable_income": assessable.to_string(), "business_deductions": business.to_string(),
                "residency": "full_year_resident", "personal_contributions": personal, "concessional_contributions": concessional,
                "return_lodged": rng.below(10) != 0, "under_71": rng.below(10) != 0, "temporary_visa_held": false,
                "non_concessional_within_cap": rng.below(10) != 0, "total_super_balance_below_cap": rng.below(10) != 0,
                "year": year, "scope_confirmed": true,
            });
            let before_business = assessable + facts["reportable_fringe_benefits_other"].as_str().unwrap().parse::<u64>().unwrap()
                + facts["reportable_fringe_benefits_section_57a"].as_str().unwrap().parse::<u64>().unwrap()
                + (employer - excess.min(employer));
            let eligible = match rng.below(4) {
                0 => before_business * 100 / 10,
                1 => (before_business * 100 / 10).saturating_sub(1),
                _ => rng.below(before_business * 100 + 1),
            };
            facts["eligible_income"] = json!(format!("{}.{:02}", eligible / 100, eligible % 100));
            if rng.below(2) == 0 {
                let choices = [rng.below(36_000), 36_990 + rng.below(3_020), 39_990 + rng.below(20)];
                let income = rng.pick(&choices);
                let most = rng.pick(&[0, 1_000, 4_000]);
                let made = money(&mut rng, most);
                for (key, value) in [
                    ("spouse_contributions", made),
                    ("spouse_assessable_income", format!("{income}.00")), ("spouse_assessable_fhss_released_amount", "0".into()),
                    ("spouse_reportable_fringe_benefits_total", "0".into()),
                    ("spouse_reportable_employer_super_contributions", if rng.below(3) == 0 { money(&mut rng, 3_000) } else { "0".into() }),
                    ("spouse_excess_concessional_contributions", "0".into()),
                ] {
                    facts[key] = json!(value);
                }
                facts["spouse_non_concessional_within_cap"] = json!(rng.below(10) != 0);
                facts["spouse_total_super_balance_below_cap"] = json!(rng.below(10) != 0);
            }
            let want = gov_oracle(&facts);
            (json!({ "kind": "gov", "facts": facts }), want)
        })
        .unzip();
    agree(&cases, &expected);
}
