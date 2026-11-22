// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

//! An independent oracle for the finance schedule, Division 7A, FBT car, Coal LSL and transfer duty engines. 360 seeded
//! fictional cases are worked here in exact integers, by a route the engines do not take,
//! and each result must equal what the browser module returns under Node. The finance
//! schedule's level payment sums its discount factors one period at a time, and the Division 7A
//! minimum yearly repayment one year at a time, where `assets/finance-schedule.mjs` and
//! `assets/div7a.mjs` use the closed annuity form; the levy works from section 3B of the Coal Mining Industry (Long Service Leave)
//! Payroll Levy Collection Act 1992 in quarter cents. The FBT car value adds the statutory
//! formula's share of the base value one day at a time and takes the business use share off
//! the operating costs, where the engine multiplies by the days and the private use share.
//! Transfer duty types each jurisdiction's scale here from its revenue office or
//! legislation, not from the site's rate table, and checks the engine either side of every
//! band threshold and on 160 seeded values, so a slip in either transcription shows.
//!
//! The route is independent; the conventions are not. The oracle takes the same equal
//! periods (the annual rate over the payments a year), the payment rounded half up once, each
//! period's interest rounded half up and the last payment taking what rounding leaves, the
//! same Division 7A interest part (the rate on the whole balance) and the same
//! FBT rounding (each value to the cent before contributions, the gross-up and the FBT from
//! the figure before them), so it cannot show those are the right conventions.
//!
//! A further 120 seeded loans, from their own seed so the 360 above are unchanged, add a
//! balloon owed at the end of the term and payments in arrears or in advance; the oracle
//! discounts the balloon and sums each timing's factors month by month, where the engine
//! takes the closed form and divides by one period's growth for advance. A further 160
//! seeded finance schedules, from their own seed, take every frequency, a balloon in dollars
//! or as a share, and work out the payment, the amount financed, the number of payments or the
//! rate. The amount financed is the payments and balloon discounted one period at a time; the
//! rate to 4 places bisects the grid of 4-place rates on exact present values, where the engine
//! bisects to 2^-48 of 100% a year and then rounds.
//!
//! Nothing here imports an engine or a constant from one, and a change to the case seed
//! needs no change to the expected values, which are never stored. The objection deadline
//! and PAYG instalment engines have oracles of their own, after the others.
//!
//! A further 120 seeded fixed fees, from their own seed, are worked by the definition of
//! rounding up (the smallest whole number of steps whose fee keeps the margin) and their
//! instalments by sharing out the cents left over, where the engine divides with a ceiling.
//!
//! A further 60 seeded termination payments, from their own seed, read preservation age from
//! Schedule 11's table as date ranges and build the tax-free limit a year of service at a time,
//! where the engine works the age out from the year of birth and multiplies. Both round each
//! part's withholding to the dollar, 50 cents up, so the oracle cannot show that convention.
//!
//! A further 120 seeded PCG 2021/4 arrangements, from their own seed, are scored against
//! each band's lower and upper bounds as Table 1 writes them and the zone ranges of
//! Table 2, where the engine takes the first band whose lower bound a percentage reaches.
//!
//! A further 120 seeded PCG 2021/4 allocations, from their own seed, tax each individual
//! recipient by adding each band's slice of a resident scale typed here from the ATO's page,
//! where the engine takes the site's base amount for the band plus the top band's rate, then
//! apply paragraph 85's larger of (a) and (b) and score the result as above.
//!
//! A further 120 seeded GIC payment plans read each quarter's rate from the published CSV,
//! not the engine's copy, and count their own calendar days. The equal instalment is the
//! debt over the sum of each instalment's discount factor, and the final instalment is
//! the balance carried day by day, where the engine grows the debt and the instalments
//! forward together.
//!
//! Land tax types each jurisdiction's general, trust and absentee scales here from its
//! revenue office or legislation, with each band's lowest and highest value as the source
//! words them, and finds the band whose range holds the value, where the engine takes the
//! last band that starts at or below it. Victoria's absentee owner surcharge is the SRO's
//! table with the surcharge less its table without it; the other surcharges and WA's
//! metropolitan region improvement tax are each source's formula. The engine is checked
//! either side of every band threshold and on 140 seeded values, for every choice each
//! jurisdiction computes, with its own harness.
//!
//! A further 200 seeded first home purchases, from their own seed, and every value either side
//! of each concession threshold type each jurisdiction's first home buyer rule from its source.
//! Queensland's amount is counted in $10,000 bands, where the engine looks it up in a table.
//!
//! A further 240 seeded vehicles, from their own seed, take each year's car limit and LCT
//! thresholds as the ATO publishes them, not from the page's radio buttons, and weigh the
//! seats against half the load once for both MT 2024 and LCTD 2023/1. The GST credit is the
//! lesser of 1/11 of the price and 1/11 of the car limit, where the engine asks whether the
//! price exceeds the limit. Both round each 1/11 half up to the cent.
//!
//! A further 240 seeded Payday Super paydays and 120 quarters to June 2026, from their own seed,
//! read the business days and GIC rates from the published CSVs. A due date is the nth entry
//! after the payday in the list of business days, where the engine steps a day at a time;
//! notional earnings add each day's interest on the base and the earnings so far, where the
//! engine multiplies the daily growth factors; and the quarterly shortfall and interest are
//! worked from the old Act's formulas in their own units.
//!
//! A further 240 seeded depreciation pools and capital works cases, from their own seed, take the
//! low-value pool's rates in ten-thousandths of a cent, the small business pool's in thousandths and
//! each year's low pool value threshold from IT(TP)A ss 328-180(6)(e) and 328-181(5) and Act No. 71 of
//! 2026, and count capital works days between calendar dates, where the engine works in sixteenths, tenths
//! and twentieths of a cent and counts days from the epoch.
//!
//! A further 240 seeded wine equalisation tax periods fill the producer rebate cap one dealing at a
//! time, where the engine compares the year's total with what the cap leaves, and type the cap by year
//! from WET Act s 19-15(2) and Act No. 12 of 2026 Sch 6.
//!
//! Every ASIC late fee case with a due date from 1 June 2026 to 30 June 2027 and a received date from
//! 3 days before it to 75 days after it counts the month by the 2 branches of Acts Interpretation Act
//! s 2G(1) with `jiff` and answers only when every reading of the weekend rules gives one tier, where the
//! engine adds a calendar month in UTC milliseconds and refuses the ranges a move could reach.
//!
//! A further 200 seeded GST margin scheme sales work the GST on a GST-exclusive price as 1/11 of
//! the exact margin on the price it makes, where the engine takes a tenth of the price less the cost.
//!
//! A further 200 seeded company tax cases test 80% passive income as 4/5 of assessable income
//! and take the maximum franking credit as 1/3 or 3/7 of the dividend, where the engine works
//! in hundredths of 1% from the rate. 200 seeded foreign purchaser surcharges type each
//! jurisdiction's duty rate and land tax surcharge formula here from its revenue office, not
//! from the engine's table or the land tax page. Both round as the engines do, so the oracle
//! cannot show that convention.
//!
//! A further 400 seeded CGT sales, from their own seed, type the CPI from the ATO's Appendix 2
//! and take each indexation factor to 4 places and then 3, as s 960-275(5) words it, where the
//! engine rounds once. Main residence days are periods and their overlaps, where the engine
//! marks a day at a time, and the 6 years of s 118-145 end on the anniversary (on 28 February from 29 February).
//!
//! A further 300 seeded long service leave cases, from their own seed, a quarter starting on
//! 29 February or a 31st and a third ending a day either side of a 5, 7, 10, 15 or 20-year
//! mark, type each Act's qualifying periods, pro rata reasons and formulas here from the Acts.
//! Service is counted by comparing calendar dates, where the engine steps an anniversary at a
//! time, and the weeks and their value are one exact ratio, where the engine keeps a fraction
//! per rule. The conventions (a part year as months over 12 and days over 365.25, weeks half
//! up to 4 places, the value from the exact weeks) are the engine's, so the oracle cannot show
//! them.
//!
//! A further 160 seeded AASB 16 leases, from their own seed, take the lease liability as the
//! payments not paid at commencement and the residual discounted one period at a time, and all
//! the interest as what is paid after commencement less the liability, where the engine adds each
//! period's; the depreciation must add up to the right-of-use asset's cost and the liability
//! close on nil.
//!
//! A further 300 seeded workers compensation premiums, from their own seed, a third of the New
//! South Wales and South Australian ones a cent either side of the $30,000 average performance
//! premium or a discount band, type each scheme's thresholds, minimums and duty here from its
//! source. Victoria's deductible is clause 11 as written, the preliminary premium over the
//! remuneration, where the engine takes the rate, and South Australia's bands are typed in
//! dollars and its premium worked as BP × (1 − D) + C − A. Each half-up or round-down step is
//! the engine's, so the oracle cannot show those conventions.
//!
//! A further 2,000 seeded PSI cases, from their own seed, work Part 2-42 of the ITAA 1997 in whole
//! per cent of exact cents, join the rows of one payer by union-find, where the engine follows each
//! row to its payer's first row, and count unrelated payers as joined groups. The 2-place shares
//! round down, as the engine's do, so the oracle cannot show that convention.
mod common;

use jiff::ToSpan;
use jiff::civil::{Date, Weekday, date};
use num_bigint::BigUint;
use serde_json::{Value, json};
use std::cmp::Ordering;
use std::io::Write;
use std::process::{Command, Stdio};

const LOAN_CASES: usize = 120;
const FEE_CASES: usize = 120;
const DIV7A_CASES: usize = 60;
const LEVY_CASES: usize = 120;
const FBT_CASES: usize = 60;
const BALLOON_CASES: usize = 120;
const FINANCE_CASES: usize = 160;
/// Seeded transfer duty values, beside every band boundary of every jurisdiction.
const DUTY_CASES: usize = 160;
/// Seeded first home values, from their own seed, mostly within the concessions' ranges.
const FIRST_HOME_CASES: usize = 200;
/// A rate typed to 4 places is a whole number of ten-thousandths of 1% a year, which is
/// a whole number of 1/12,000,000ths a month.
const MONTHLY_SCALE: u64 = 12_000_000;
/// A benchmark rate has 2 decimal places of a per cent: whole 1/10,000ths a year.
const YEARLY_SCALE: u64 = 10_000;
/// The largest amount a calculator field accepts, $1,000,000,000.00, in cents.
const MAX_PRINCIPAL: u64 = 100_000_000_000;
/// 2.7% of a quarter cent, as a fraction of a cent: 27 / 4,000.
const LEVY_NUMERATOR: u128 = 27;
const LEVY_DENOMINATOR: u128 = 4_000;

/// Runs the cases through the engines in one Node process, from the repository root so
/// the module paths resolve. A missing `node` fails the test.
const HARNESS: &str = r#"
import { readFileSync } from 'node:fs';
import { financeSchedule, div7aMinimumRepayment, terminationPayment, transferDuty, firstHomeDuty, fbtCar, fixedFee, pcgRisk, gicPaymentPlan, vehicleClass } from './assets/business-calculators.mjs';
import { pcgAllocation } from './assets/pcg-2021-4.mjs';
import { baseRateWages, annualSalaryWages, casualWages, levyCents } from './assets/levy.mjs';
// Each jurisdiction's scale as the rendered calculator page gives it to the browser.
const page = readFileSync('tools/business-calculators/transfer-duty/index.html', 'utf8');
const scales = Object.fromEntries([...page.matchAll(/value="(AU-[A-Z]+)" data-name="[^"]+" data-scale="([^"]+)"/g)]
  .map(([, place, scale]) => [place, scale.split(';').map((row) => row.split(','))]));
// Each income year's scale and company rates as the rendered PCG 2021/4 allocation page gives them.
const pcgForm = readFileSync('tools/business-calculators/pcg-2021-4-allocation/index.html', 'utf8');
const pcgYears = Object.fromEntries([...pcgForm.matchAll(
  /name="year" value="([^"]+)" data-scale="([^"]+)" data-base-rate="([^"]+)" data-company-rate="([^"]+)"/g)]
  .map(([, year, scale, baseRate, companyRate]) => [year, { scale, baseRate, companyRate }]));
// Each year's car limit and LCT thresholds as the rendered vehicle classifier's radio buttons carry them.
const vehicleYears = Object.fromEntries([...readFileSync('tools/business-calculators/vehicle-class/index.html', 'utf8')
  .matchAll(/name="year" value="([^"]+)" data-car-limit="(\d+)" data-fuel-efficient="(\d+)" data-other="(\d+)"/g)]
  .map(([, year, carLimit, fuelEfficientThreshold, otherThreshold]) => [year, { carLimit, fuelEfficientThreshold, otherThreshold }]));
let input = '';
for await (const chunk of process.stdin) input += chunk;
const money = (value) => String(value);
const levy = (result) => ({ branch: result.branch, winner: result.winner ?? null,
  quarters: result.eligibleWagesCents * 4, levy: levyCents(result.eligibleWagesCents) });
const run = {
  schedule: ({ terms }) => {
    try {
      const result = financeSchedule(terms);
      return { amount: money(result.amount), payment: money(result.payment), finalPayment: money(result.finalPayment),
        payments: String(result.payments), rate: String(result.rate), firstInterest: money(result.rows[0].interest),
        totalInterest: money(result.totalInterest) };
    } catch (error) {
      return { refused: error.message };
    }
  },
  div7a: ({ balance, rate, term }) => {
    const result = div7aMinimumRepayment(balance, rate, term);
    return { repayment: money(result.repayment), interest: money(result.interest), principal: money(result.principal) };
  },
  fbt: ({ car, year }) => Object.fromEntries(Object.entries(fbtCar(car, year))
    .map(([key, value]) => [key, value === null ? null : money(value)])),
  base: ({ inputs }) => levy(baseRateWages(inputs)),
  salary: ({ inputs }) => levy(annualSalaryWages(inputs)),
  casual: ({ inputs }) => levy(casualWages(inputs)),
  etp: ({ payment, year }) => Object.fromEntries(Object.entries(terminationPayment(payment, year))
    .map(([key, value]) => [key, typeof value === 'number' ? money(value) : value])),
  duty: ({ value, place }) => ({ duty: money(transferDuty(value, scales[place]).duty) }),
  firstHome: ({ value, place, home }) => {
    const result = firstHomeDuty(value, scales[place], place, home);
    return { duty: money(result.duty), general: money(result.general) };
  },
  fee: ({ hours, rate, margin, roundTo, gst, instalments }) => {
    try {
      const result = fixedFee(hours, rate, margin, roundTo, gst, instalments);
      return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, money(value)]));
    } catch (error) {
      return { refused: error.message };
    }
  },
  pcg: ({ arrangement }) => Object.fromEntries(Object.entries(pcgRisk(arrangement))
    .map(([key, value]) => [key, value === null ? null : String(value)])),
  gic: ({ plan }) => Object.fromEntries(Object.entries(gicPaymentPlan(plan)).map(([key, value]) => [key, String(value)])),
  pcgAllocation: ({ arrangement, year }) => {
    const { recipients, ...rest } = pcgAllocation(arrangement, pcgYears[year]);
    return { taxes: recipients.map((one) => one && `${one.tax}:${one.rule}`),
      ...Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, value === null ? null : String(value)])) };
  },
  vehicle: ({ vehicle, year }) => {
    try {
      return Object.fromEntries(Object.entries(vehicleClass(vehicle, vehicleYears[year]))
        .map(([key, value]) => [key, typeof value === 'number' ? money(value) : value]));
    } catch (error) {
      return { refused: error.message };
    }
  },
};
process.stdout.write(JSON.stringify(JSON.parse(input).map((one) => run[one.kind](one))));
"#;

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

    /// Cents from 0 to `limit`, spread across magnitudes so small amounts appear.
    fn cents(&mut self, limit: u64) -> u64 {
        let digits = self.below(u64::from(limit.ilog10()) + 1) as u32;
        self.below(10_u64.pow(digits + 1).min(limit) + 1)
    }
}

/// Half up on a non-negative exact ratio.
fn half_up(numerator: &BigUint, denominator: &BigUint) -> u64 {
    let two = BigUint::from(2_u8);
    let rounded = (&two * numerator + denominator) / (&two * denominator);
    rounded.try_into().expect("a result within u64")
}

/// Division 7A minimum yearly repayment, interest and principal, in cents: the balance over
/// the sum of the yearly discount factors (scale/growth)^k for k = 1 to the term.
fn div7a_oracle(balance: u64, rate: u64, years: u32) -> [u64; 3] {
    let (scale, growth) = (
        BigUint::from(YEARLY_SCALE),
        BigUint::from(YEARLY_SCALE + rate),
    );
    let mut factors = BigUint::ZERO;
    let mut scale_power = BigUint::from(1_u8);
    let mut growth_power = BigUint::from(1_u8);
    for _ in 0..years {
        factors = factors * &growth + &scale_power * &scale;
        scale_power *= &scale;
        growth_power *= &growth;
    }
    let repayment = half_up(&(BigUint::from(balance) * &growth_power), &factors);
    let interest = half_up(&(BigUint::from(balance) * rate), &scale);
    [repayment, interest, repayment - interest]
}

/// One car's figures for an FBT year, amounts in cents. `operating` holds the operating
/// costs and the business use percentage in hundredths of 1% when that method is elected.
#[derive(Clone, Copy)]
struct Car {
    cost: u64,
    accessories: u64,
    reduced: bool,
    days: u64,
    operating: Option<(u64, u64)>,
    contribution: u64,
}

/// Base value, statutory value, operating cost value, taxable value, grossed-up value and
/// FBT, in cents. FBTAA s 9: base value x 20% x days available / days in the year, less
/// contributions, with two-thirds of the cost price once held 4 years (s 9(2)(a)); s 10(2):
/// operating costs less their business use share, less contributions; s 10(5): the lower of
/// the two when the operating cost method is elected. The gross-up and the FBT rate are in
/// ten-thousandths: 2.0802 is 20,802 and 47% is 4,700.
fn fbt_oracle(car: Car, year_days: u64, gross_up: u64, rate: u64) -> [Option<u64>; 6] {
    let cost = u128::from(car.cost);
    let thirds = 3 * cost - if car.reduced { cost } else { 0 } + 3 * u128::from(car.accessories);
    // Each day available adds that day's share: thirds x 20 / (300 x days in the year).
    let mut statutory = 0_u128;
    for _ in 0..car.days {
        statutory += thirds * 20;
    }
    let less = |value: u128| value.saturating_sub(u128::from(car.contribution));
    let statutory = less(exact_half_up(statutory, 300 * u128::from(year_days)));
    let operating = car.operating.map(|(costs, business)| {
        let costs = u128::from(costs);
        less(exact_half_up(
            costs * 10_000 - costs * u128::from(business),
            10_000,
        ))
    });
    let taxable = operating.map_or(statutory, |value| value.min(statutory));
    let grossed = exact_half_up(taxable * u128::from(gross_up), 10_000);
    let fbt = exact_half_up(grossed * u128::from(rate), 10_000);
    let cents = |value: u128| Some(u64::try_from(value).unwrap());
    [
        cents(exact_half_up(thirds, 3)),
        cents(statutory),
        operating.and_then(cents),
        cents(taxable),
        cents(grossed),
        cents(fbt),
    ]
}

/// Half up on a non-negative exact ratio that fits in 128 bits.
fn exact_half_up(numerator: u128, denominator: u128) -> u128 {
    (2 * numerator + denominator) / (2 * denominator)
}

/// Half up at the final step only, as the calculator page states.
fn levy_oracle(quarters: u128) -> u128 {
    (2 * quarters * LEVY_NUMERATOR + LEVY_DENOMINATOR) / (2 * LEVY_DENOMINATOR)
}

/// One band of a general transfer duty scale, typed from the revenue office's or the
/// legislation's own wording as read on 15 November 2026, not from the site's rate table.
/// Each band applies to values above `over`; the scales list them lowest first.
#[derive(Clone, Copy)]
enum Band {
    /// `base` dollars plus `cents` for every $100, or part of $100, over `over`.
    PerHundred { over: u64, base: u64, cents: u64 },
    /// `base` dollars plus `points` hundredths of a per cent of the excess over `over`.
    Excess { over: u64, base: u64, points: u64 },
    /// `points` hundredths of a per cent of the whole value, above `over`.
    Whole { over: u64, points: u64 },
}

const fn per(over: u64, base: u64, cents: u64) -> Band {
    Band::PerHundred { over, base, cents }
}

/// The 7 scales written as bands; the Northern Territory's is a formula ([`nt_duty`]).
const DUTY_SCALES: [(&str, &[Band]); 7] = [
    // Revenue NSW, 2026-27: $1.25 for every $100 (minimum $20), then the bands to the
    // premium rate for residential property over $3,870,000.
    (
        "AU-NSW",
        &[
            per(0, 0, 125),
            per(18_000, 225, 150),
            per(38_000, 525, 175),
            per(103_000, 1_662, 350),
            per(387_000, 11_602, 450),
            per(1_290_000, 52_237, 550),
            per(3_870_000, 194_137, 700),
        ],
    ),
    // State Revenue Office Victoria, non-principal place of residence, from 1 July 2021.
    (
        "AU-VIC",
        &[
            Band::Excess {
                over: 0,
                base: 0,
                points: 140,
            },
            Band::Excess {
                over: 25_000,
                base: 350,
                points: 240,
            },
            Band::Excess {
                over: 130_000,
                base: 2_870,
                points: 600,
            },
            Band::Whole {
                over: 960_000,
                points: 550,
            },
            Band::Excess {
                over: 2_000_000,
                base: 110_000,
                points: 650,
            },
        ],
    ),
    // Queensland Revenue Office: nil to $5,000, then for each $100, or part of $100.
    (
        "AU-QLD",
        &[
            per(0, 0, 0),
            per(5_000, 0, 150),
            per(75_000, 1_050, 350),
            per(540_000, 17_325, 450),
            per(1_000_000, 38_025, 575),
        ],
    ),
    // WA Department of Treasury and Finance, general rate.
    (
        "AU-WA",
        &[
            per(0, 0, 190),
            per(120_000, 2_280, 285),
            per(150_000, 3_135, 380),
            per(360_000, 11_115, 475),
            per(725_000, 28_453, 515),
        ],
    ),
    // RevenueSA, conveyances.
    (
        "AU-SA",
        &[
            per(0, 0, 100),
            per(12_000, 120, 200),
            per(30_000, 480, 300),
            per(50_000, 1_080, 350),
            per(100_000, 2_830, 400),
            per(200_000, 6_830, 425),
            per(250_000, 8_955, 475),
            per(300_000, 11_330, 500),
            per(500_000, 21_330, 550),
        ],
    ),
    // State Revenue Office Tasmania, duty payable on or after 21 October 2013: $50 to $3,000.
    (
        "AU-TAS",
        &[
            per(0, 50, 0),
            per(3_000, 50, 175),
            per(25_000, 435, 225),
            per(75_000, 1_560, 350),
            per(200_000, 5_935, 400),
            per(375_000, 12_935, 425),
            per(725_000, 27_810, 450),
        ],
    ),
    // ACT DI2026-155 Table 2, a transaction that is not an eligible owner occupier transaction.
    (
        "AU-ACT",
        &[
            per(0, 0, 120),
            per(200_000, 2_400, 220),
            per(300_000, 4_600, 340),
            per(500_000, 11_400, 432),
            per(750_000, 22_200, 590),
            per(1_000_000, 36_950, 640),
            Band::Whole {
                over: 1_455_000,
                points: 454,
            },
        ],
    ),
];

fn band_over(band: Band) -> u64 {
    match band {
        Band::PerHundred { over, .. } | Band::Excess { over, .. } | Band::Whole { over, .. } => {
            over
        }
    }
}

/// Stamp Duty Act 1978 (NT) Schedule 1 clause 1(2), as in force at 1 July 2025, in cents.
fn nt_duty(dollars: u64) -> u64 {
    let d = u128::from(dollars);
    let cents = if dollars <= 525_000 {
        // (0.06571441 x V^2) + 15V dollars, V = d / 1,000, is
        // (6,571,441 d^2 + 15 x 10^11 d) / 10^12 cents.
        (2 * (6_571_441 * d * d + 1_500_000_000_000 * d) + 1_000_000_000_000) / 2_000_000_000_000
    } else {
        let points = if dollars < 3_000_000 {
            495
        } else if dollars < 5_000_000 {
            575
        } else {
            595
        };
        (2 * points * d + 100) / 200
    };
    u64::try_from(cents).unwrap()
}

/// General transfer duty in cents on a whole-dollar value.
fn duty_oracle(place: &str, dollars: u64) -> u64 {
    if place == "AU-NT" {
        return nt_duty(dollars);
    }
    let (_, bands) = DUTY_SCALES.iter().find(|(p, _)| *p == place).unwrap();
    // The band with the highest threshold the value exceeds; the first band also takes nil.
    let band = *bands
        .iter()
        .rev()
        .find(|band| dollars > band_over(**band))
        .unwrap_or(&bands[0]);
    let cents = match band {
        Band::PerHundred { over, base, cents } => {
            base * 100 + cents * (dollars - over).div_ceil(100)
        }
        Band::Excess { over, base, points } => {
            let excess = u128::from(dollars - over);
            base * 100 + u64::try_from((2 * u128::from(points) * excess + 100) / 200).unwrap()
        }
        Band::Whole { points, .. } => {
            u64::try_from((2 * u128::from(points) * u128::from(dollars) + 100) / 200).unwrap()
        }
    };
    // Revenue NSW: $1.25 for every $100 with a minimum of $20.
    if place == "AU-NSW" {
        cents.max(2_000)
    } else {
        cents
    }
}

/// Every value either side of each band's threshold, for each jurisdiction, and the
/// least and greatest values the field accepts.
fn duty_boundaries() -> Vec<(&'static str, u64)> {
    let mut values = Vec::new();
    for (place, bands) in DUTY_SCALES {
        for band in bands {
            let over = band_over(*band);
            values.extend([over.saturating_sub(1), over, over + 1].map(|v| (place, v)));
        }
    }
    for over in [525_000, 2_999_999, 3_000_000, 4_999_999, 5_000_000] {
        values.extend([over - 1, over, over + 1].map(|v| ("AU-NT", v)));
    }
    for place in [
        "AU-NSW", "AU-VIC", "AU-QLD", "AU-WA", "AU-SA", "AU-TAS", "AU-ACT", "AU-NT",
    ] {
        values.extend([(place, 1), (place, 1_000_000_000)]);
    }
    // Revenue NSW's minimum stops at $1,600, where $1.25 for every $100 reaches $20.
    values.extend([1_599, 1_600, 1_601].map(|v| ("AU-NSW", v)));
    values.retain(|&(_, v)| v >= 1);
    values
}

fn duty_case(place: &str, dollars: u64) -> (Value, Value) {
    (
        json!({"kind": "duty", "value": dollars.to_string(), "place": place}),
        json!({"duty": shown(duty_oracle(place, dollars))}),
    )
}

/// Bonuses that count under s 3B(4)(c) and (d) are those paid at least once a month.
fn bonuses(rng: &mut Seeded) -> (Value, u64) {
    let mut listed = Vec::new();
    let mut counted = 0;
    for _ in 0..rng.below(4) {
        let cents = rng.cents(5_000_000);
        let frequency = rng.pick(&[
            "weekly",
            "fortnightly",
            "monthly",
            "quarterly",
            "half-yearly",
            "annual",
        ]);
        if matches!(frequency, "weekly" | "fortnightly" | "monthly") {
            counted += cents;
        }
        listed.push(json!({"amount": dollars_number(cents), "frequency": frequency}));
    }
    (Value::Array(listed), counted)
}

/// The dollars a form field holds: the engine turns them back into cents itself.
fn dollars_number(cents: u64) -> Value {
    serde_json::from_str(&dollars(cents)).unwrap()
}

fn dollars(cents: u64) -> String {
    format!("{}.{:02}", cents / 100, cents % 100)
}

/// How often payments fall: the payments a year and the most the engine takes, 50 years of them.
#[derive(Clone, Copy)]
struct Frequency {
    name: &'static str,
    per_year: u64,
    most: u32,
}

const FREQUENCIES: [Frequency; 5] = [
    Frequency {
        name: "weekly",
        per_year: 52,
        most: 2_600,
    },
    Frequency {
        name: "fortnightly",
        per_year: 26,
        most: 1_300,
    },
    Frequency {
        name: "monthly",
        per_year: 12,
        most: 600,
    },
    Frequency {
        name: "quarterly",
        per_year: 4,
        most: 200,
    },
    Frequency {
        name: "annual",
        per_year: 1,
        most: 50,
    },
];

/// The engine's refusals, word for word, where the oracle finds no schedule.
const ROUNDING_REFUSAL: &str = "Rounding each period’s interest to the cent at this rate and term stops the schedule closing on the balloon. Use fewer payments, a lower rate or a larger amount.";
const NEVER_FALLS: &str =
    "The payment does not cover a period’s interest, so the balance never falls to the balloon.";
const NO_RATE: &str = "The payments and balloon add up to less than the amount financed, so no rate of nil or more fits.";
const ABOVE_100: &str =
    "These payments need a rate above 100% a year, which this page does not work.";
const BALLOON_OVER: &str = "The balloon cannot be more than the amount financed.";
const AMOUNT_OVER: &str = "The amount financed this gives is over $1,000,000,000. Use a smaller payment or fewer payments.";
const AMOUNT_NIL: &str = "The amount financed this gives rounds to nil. Use a larger payment.";
const TOO_LARGE: &str =
    "The payments total more than this page can show to the cent. Use smaller amounts.";
const NIL_FULL_BALLOON: &str =
    "At nil interest a 100% balloon leaves the payments nothing to repay, so no amount fits.";

/// A finance schedule's terms in whole units: cents, the annual rate in ten-thousandths of 1%,
/// and a balloon in cents or, with `share`, in hundredths of 1% of the amount financed. The
/// field `solve` names is worked out, and the engine does not read it.
#[derive(Clone, Copy)]
struct Terms {
    solve: &'static str,
    amount: u64,
    rate: u64,
    periods: u32,
    payment: u64,
    balloon: u64,
    share: Option<u64>,
    frequency: Frequency,
    advance: bool,
}

impl Terms {
    /// Monthly payments in arrears with no balloon, worked for the payment.
    fn monthly(amount: u64, rate: u64, periods: u32) -> Self {
        Terms {
            solve: "payment",
            amount,
            rate,
            periods,
            payment: 1,
            balloon: 0,
            share: None,
            frequency: FREQUENCIES[2],
            advance: false,
        }
    }

    /// A period's rate is `rate / scale`: the payments a year times 1,000,000.
    fn scale(&self) -> u64 {
        self.frequency.per_year * 1_000_000
    }

    /// The form's fields as the page passes them to the engine.
    fn case(&self) -> Value {
        let balloon = self.share.map_or_else(
            || dollars(self.balloon),
            |share| format!("{}.{:02}", share / 100, share % 100),
        );
        json!({
            "kind": "schedule",
            "terms": {
                "solve": self.solve,
                "amount": dollars(self.amount),
                "rate": format!("{}.{:04}", self.rate / 10_000, self.rate % 10_000),
                "payments": self.periods.to_string(),
                "payment": dollars(self.payment),
                "balloon": balloon,
                "balloonKind": if self.share.is_some() { "percent" } else { "amount" },
                "frequency": self.frequency.name,
                "timing": if self.advance { "advance" } else { "arrears" },
                "start": "2026-07-01",
            },
        })
    }

    fn balloon_of(&self, amount: u64) -> u64 {
        self.share.map_or(self.balloon, |share| {
            half_up(&(BigUint::from(amount) * share), &BigUint::from(10_000_u32))
        })
    }
}

/// Over the common denominator growth^n, the discount factors (scale/growth)^k for k = 1 to n
/// in arrears, or 0 to n - 1 in advance, summed one period at a time; with growth^n and scale^n.
fn discount_sum(rate: u64, scale: u64, periods: u32, advance: bool) -> [BigUint; 3] {
    let (scale, growth) = (BigUint::from(scale), BigUint::from(scale + rate));
    let mut factors = BigUint::ZERO;
    let mut scale_power = BigUint::from(1_u8);
    let mut growth_power = BigUint::from(1_u8);
    for _ in 0..periods {
        // In arrears this period adds scale^(k+1); in advance, one period earlier, scale^k.
        let term = if advance {
            &scale_power * &growth
        } else {
            &scale_power * &scale
        };
        factors = factors * &growth + term;
        scale_power *= &scale;
        growth_power *= &growth;
    }
    [factors, growth_power, scale_power]
}

/// The level payment in cents: the amount financed less the balloon's discounted value, over
/// the sum of the discount factors, where the engine takes the closed annuity form.
fn payment_oracle(terms: &Terms, amount: u64, balloon: u64) -> u64 {
    let [factors, growth_power, scale_power] =
        discount_sum(terms.rate, terms.scale(), terms.periods, terms.advance);
    half_up(
        &(BigUint::from(amount) * growth_power - BigUint::from(balloon) * scale_power),
        &factors,
    )
}

/// The amount financed in cents, before the engine's limits: the payments and the balloon
/// discounted at the rate, the balloon's share of the amount taken off the denominator.
fn amount_oracle(terms: &Terms) -> u64 {
    let [factors, growth_power, scale_power] =
        discount_sum(terms.rate, terms.scale(), terms.periods, terms.advance);
    let payment = BigUint::from(terms.payment);
    match terms.share {
        None => half_up(
            &(payment * factors + BigUint::from(terms.balloon) * scale_power),
            &growth_power,
        ),
        Some(share) => half_up(
            &(payment * factors * 10_000_u32),
            &(growth_power * 10_000_u32 - scale_power * share),
        ),
    }
}

/// The annual rate in ten-thousandths of 1%, rounded half up, at which the payments and the
/// balloon are worth the amount financed. The grid of 4-place rates is bisected on exact
/// present values, and the half step between the 2 rates either side of the root says which is
/// nearer, where the engine bisects to 2^-48 of 100% and then rounds.
fn rate_oracle(terms: &Terms) -> Result<u64, String> {
    let balloon = BigUint::from(terms.balloon_of(terms.amount));
    // Whether the payments and balloon, at `rate` over `scale` a period, are worth more than,
    // as much as or less than the amount financed.
    let worth = |rate: u64, scale: u64| {
        let [factors, growth_power, scale_power] =
            discount_sum(rate, scale, terms.periods, terms.advance);
        (BigUint::from(terms.payment) * factors + &balloon * scale_power)
            .cmp(&(BigUint::from(terms.amount) * growth_power))
    };
    let scale = terms.scale();
    match worth(0, scale) {
        Ordering::Less => return Err(NO_RATE.into()),
        Ordering::Equal => return Ok(0),
        Ordering::Greater => {}
    }
    if worth(1_000_000, scale) == Ordering::Greater {
        return Err(ABOVE_100.into());
    }
    // Worth falls as the rate rises: low stays worth more, high as much or less.
    let (mut low, mut high) = (0, 1_000_000);
    while high - low > 1 {
        let middle = u64::midpoint(low, high);
        if worth(middle, scale) == Ordering::Greater {
            low = middle;
        } else {
            high = middle;
        }
    }
    Ok(if worth(2 * low + 1, 2 * scale) == Ordering::Less {
        low
    } else {
        high
    })
}

/// The schedule in whole cents, one row for each payment date: the interest accrued since the
/// last payment rounds half up (none on a first payment in advance), every payment but the last
/// is `payment`, and the last leaves the balloon, or in advance the balloon's value a period
/// before it falls due. Worked for the number of payments, they run until one would take the
/// balance to that value or below. Returns the last payment, the number of payments, the first
/// interest and the total interest with the balloon's, or the engine's refusal.
fn schedule_oracle(
    terms: &Terms,
    amount: u64,
    balloon: u64,
    payment: u64,
) -> Result<[u64; 4], String> {
    let (rate, scale) = (i128::from(terms.rate), i128::from(terms.scale()));
    let balloon = i128::from(balloon);
    let left = if terms.advance {
        (2 * balloon * scale + scale + rate) / (2 * (scale + rate))
    } else {
        balloon
    };
    let (mut balance, payment) = (i128::from(amount), i128::from(payment));
    let (mut total, mut first) = (0, None);
    let find_term = terms.solve == "term";
    let cents = |value: i128| u64::try_from(value).unwrap();
    for count in 1_u32.. {
        let interest = if terms.advance && count == 1 {
            0
        } else {
            (2 * balance * rate + scale) / (2 * scale)
        };
        let last = if find_term {
            balance + interest - payment <= left
        } else {
            count == terms.periods
        };
        let paid = if last {
            balance + interest - left
        } else {
            payment
        };
        let closing = balance + interest - paid;
        if paid < 0 || closing < 0 {
            return Err(ROUNDING_REFUSAL.into());
        }
        let first = *first.get_or_insert(interest);
        total += interest;
        if last {
            // Every payment and the balloon: the amount financed and all the interest. A
            // half cent of rounding can grow past what a JavaScript number holds to the cent.
            if i128::from(amount) + total + balloon - left > (1_i128 << 53) - 1 {
                return Err(TOO_LARGE.into());
            }
            return Ok([
                cents(paid),
                u64::from(count),
                cents(first),
                cents(total + balloon - left),
            ]);
        }
        if find_term && closing >= balance {
            return Err(NEVER_FALLS.into());
        }
        if find_term && count == terms.frequency.most {
            return Err(format!(
                "The payment does not reach the balloon within {count} payments, 50 years."
            ));
        }
        balance = closing;
    }
    unreachable!()
}

/// A rate in ten-thousandths of 1% as a JavaScript number prints it.
fn rate_shown(rate: u64) -> String {
    let (whole, part) = (rate / 10_000, rate % 10_000);
    if part == 0 {
        whole.to_string()
    } else {
        format!("{whole}.{part:04}")
            .trim_end_matches('0')
            .to_string()
    }
}

/// What the engine must return for `terms`: the figures, the rate alone when that is worked
/// out (its schedule runs at the unrounded rate), or the refusal.
fn finance_oracle(terms: &Terms) -> Value {
    let refused = |message: &str| json!({ "refused": message });
    if terms.solve == "rate" {
        return match rate_oracle(terms) {
            Ok(rate) => json!({ "rate": rate_shown(rate) }),
            Err(message) => refused(&message),
        };
    }
    let amount = if terms.solve == "amount" {
        if terms.rate == 0 && terms.share == Some(10_000) {
            return refused(NIL_FULL_BALLOON);
        }
        let amount = amount_oracle(terms);
        if amount > MAX_PRINCIPAL {
            return refused(AMOUNT_OVER);
        }
        if amount == 0 {
            return refused(AMOUNT_NIL);
        }
        amount
    } else {
        terms.amount
    };
    let balloon = terms.balloon_of(amount);
    if balloon > amount {
        return refused(BALLOON_OVER);
    }
    let payment = if terms.solve == "payment" {
        payment_oracle(terms, amount, balloon)
    } else {
        terms.payment
    };
    match schedule_oracle(terms, amount, balloon, payment) {
        Ok([last, count, first, total]) => json!({
            "amount": shown(amount),
            "payment": shown(payment),
            "finalPayment": shown(last),
            "payments": count.to_string(),
            "rate": rate_shown(terms.rate),
            "firstInterest": shown(first),
            "totalInterest": shown(total),
        }),
        Err(message) => refused(&message),
    }
}

/// A case for Node and what the engine must return for it: a monthly loan in arrears.
fn loan_case(rng: &mut Seeded) -> (Value, Value) {
    let principal = 1 + rng.cents(MAX_PRINCIPAL - 1);
    let any_rate = rng.below(1_000_001);
    let rate = rng.pick(&[0, 1, 50_000, 65_000, 1_000_000, any_rate, any_rate]);
    let any_term = 1 + rng.below(600);
    let months = rng.pick(&[1, 2, 12, 60, 360, 600, any_term, any_term]) as u32;
    let terms = Terms::monthly(principal, rate, months);
    (terms.case(), finance_oracle(&terms))
}

/// A seeded finance schedule: any frequency and timing, a balloon in dollars or as a share,
/// worked for the payment, the amount financed, the number of payments or the rate. The
/// payment given for the other 3 is near the level payment of other seeded terms.
fn finance_case(rng: &mut Seeded) -> (Value, Value) {
    let frequency = rng.pick(&FREQUENCIES);
    let solve = rng.pick(&["payment", "amount", "term", "rate"]);
    let any_rate = rng.below(300_001);
    let rate = rng.pick(&[0, 1, 75_000, any_rate, any_rate]);
    // The rate is bisected on sums over every period, so its cases stay at 10 years or less.
    let longest = if solve == "rate" {
        frequency.most / 5
    } else {
        frequency.most
    };
    let any_term = 1 + rng.below(u64::from(longest)) as u32;
    let periods = rng.pick(&[1, 2, longest, any_term, any_term]);
    let amount = 1 + rng.cents(MAX_PRINCIPAL / 100);
    let any_share = rng.below(10_001);
    let share = rng.pick(&[None, None, Some(3_000), Some(10_000), Some(any_share)]);
    let any_balloon = rng.below(amount + 1);
    let balloon = if share.is_some() {
        0
    } else {
        rng.pick(&[0, 0, amount, amount * 3 / 10, any_balloon])
    };
    let mut terms = Terms {
        solve,
        amount,
        rate,
        periods,
        payment: 1,
        balloon,
        share,
        frequency,
        advance: rng.below(2) == 1,
    };
    if solve != "payment" {
        // Near the level payment that repays these terms, from 1 cent below to a dollar above.
        let level = payment_oracle(&terms, amount, terms.balloon_of(amount));
        terms.payment = (level + rng.below(101)).saturating_sub(1).max(1);
    }
    if solve == "rate" {
        // Some payments worth too little at nil interest, or needing more than 100% a year.
        terms.rate = 0;
    }
    (terms.case(), finance_oracle(&terms))
}

#[test]
fn the_finance_oracle_works_schedules_by_hand() {
    // $1,000 at 12% a year (1% a month) over 3 months: 340.02 = 10.30301 / 0.030301, and the
    // interest $10.00, $6.70 and $3.37, so the last payment is 336.66 + 3.37 = $340.03.
    let three = Terms::monthly(100_000, 120_000, 3);
    assert_eq!(payment_oracle(&three, 100_000, 0), 34_002);
    assert_eq!(
        schedule_oracle(&three, 100_000, 0, 34_002),
        Ok([34_003, 3, 1_000, 2_007])
    );
    // Weekly, $10,000 at 5.2%: a week's interest is 0.1%, $10.00 on the first payment.
    let weekly = Terms {
        rate: 52_000,
        periods: 52,
        frequency: FREQUENCIES[0],
        ..Terms::monthly(1_000_000, 0, 0)
    };
    let payment = payment_oracle(&weekly, 1_000_000, 0);
    assert_eq!(payment, 19_745);
    assert_eq!(
        schedule_oracle(&weekly, 1_000_000, 0, payment),
        Ok([19_730, 52, 1_000, 26_725])
    );
    // A balloon equal to the amount financed leaves 1% a month of interest only; in advance
    // each payment is that discounted a month, 1,000 x 0.01 / 1.01 = $9.90.
    let only = Terms {
        balloon: 100_000,
        ..Terms::monthly(100_000, 120_000, 12)
    };
    assert_eq!(payment_oracle(&only, 100_000, 100_000), 1_000);
    let ahead = Terms {
        advance: true,
        ..only
    };
    assert_eq!(payment_oracle(&ahead, 100_000, 100_000), 990);
    // Worked for the term, $1,202.28 repays $60,000 at 7.5% in 60 payments, the last $1,202.06;
    // a payment of only the first month's interest never reduces the balance.
    let term = Terms {
        solve: "term",
        payment: 120_228,
        ..Terms::monthly(6_000_000, 75_000, 1)
    };
    assert_eq!(
        schedule_oracle(&term, 6_000_000, 0, 120_228),
        Ok([120_206, 60, 37_500, 1_213_658])
    );
    let short = Terms {
        payment: 37_500,
        ..term
    };
    assert_eq!(
        schedule_oracle(&short, 6_000_000, 0, 37_500),
        Err(NEVER_FALLS.into())
    );
    // The australian-accounting hire-purchase-schedule command gave the implicit rate of $50,000
    // repaid by 60 payments of $850 and a $10,000 residual as 6.98598% on 18 November 2026.
    let agreement = Terms {
        solve: "rate",
        payment: 85_000,
        balloon: 1_000_000,
        ..Terms::monthly(5_000_000, 0, 60)
    };
    assert_eq!(rate_oracle(&agreement), Ok(69_860));
    assert_eq!(
        rate_oracle(&Terms {
            payment: 8_000,
            balloon: 0,
            ..agreement
        }),
        Err(NO_RATE.into())
    );
    // $59,999.81 is the value of 60 payments of $954.09 and $18,000 at 7.5%.
    let amount = Terms {
        solve: "amount",
        payment: 95_409,
        balloon: 1_800_000,
        ..Terms::monthly(1, 75_000, 60)
    };
    assert_eq!(amount_oracle(&amount), 5_999_981);
    assert_eq!(rate_shown(69_860), "6.986");
    assert_eq!(rate_shown(70_000), "7");
}

#[test]
fn the_engine_agrees_with_the_oracle_on_every_seeded_finance_schedule() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1118_F1A4_5C4E);
    let (cases, expected): (Vec<Value>, Vec<Value>) =
        (0..FINANCE_CASES).map(|_| finance_case(&mut rng)).unzip();
    for solve in ["payment", "amount", "term", "rate"] {
        assert!(
            cases.iter().any(|case| case["terms"]["solve"] == solve),
            "{solve}"
        );
    }
    for frequency in FREQUENCIES.map(|one| one.name) {
        assert!(
            cases
                .iter()
                .any(|case| case["terms"]["frequency"] == frequency),
            "{frequency}"
        );
    }
    assert!(
        cases
            .iter()
            .any(|case| case["terms"]["timing"] == "advance")
    );
    assert!(
        cases
            .iter()
            .any(|case| case["terms"]["balloonKind"] == "percent")
    );
    assert!(expected.iter().any(|want| want.get("refused").is_some()));
    assert!(
        expected
            .iter()
            .any(|want| want.get("rate").is_some() && want.get("payment").is_none())
    );
    let actual = engines(&cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        // A worked rate is compared alone: the engine's schedule runs at the unrounded rate.
        for (field, value) in want.as_object().unwrap() {
            assert_eq!(&got[field], value, "{case} {field}");
        }
    }
}

/// A cent amount as a JavaScript number prints it.
fn shown(cents: u64) -> String {
    match cents % 100 {
        0 => (cents / 100).to_string(),
        n if n % 10 == 0 => format!("{}.{}", cents / 100, n / 10),
        n => format!("{}.{n:02}", cents / 100),
    }
}

fn div7a_case(rng: &mut Seeded) -> (Value, Value) {
    let balance = rng.cents(MAX_PRINCIPAL);
    let any_rate = 1 + rng.below(10_000);
    // The benchmark rates the site's table holds, and any rate up to 100%.
    let rate = rng.pick(&[1, 452, 477, 537, 827, 837, 877, 10_000, any_rate, any_rate]);
    let any_term = 1 + rng.below(25);
    let years = rng.pick(&[1, 2, 7, 25, any_term, any_term]) as u32;
    let [repayment, interest, principal] = div7a_oracle(balance, rate, years);
    (
        json!({
            "kind": "div7a",
            "balance": dollars(balance),
            "rate": format!("{}.{:02}", rate / 100, rate % 100),
            "term": years.to_string(),
        }),
        json!({
            "repayment": shown(repayment),
            "interest": shown(interest),
            "principal": shown(principal),
        }),
    )
}

fn fbt_case(rng: &mut Seeded) -> (Value, Value) {
    let any_days = rng.below(366);
    let any_use = rng.below(10_001);
    let small = rng.cents(100_000);
    let large = rng.cents(10_000_000);
    let car = Car {
        cost: rng.cents(MAX_PRINCIPAL),
        accessories: if rng.below(2) == 0 {
            0
        } else {
            rng.cents(5_000_000)
        },
        reduced: rng.below(2) == 1,
        days: rng.pick(&[0, 1, 182, 364, 365, any_days, any_days]),
        operating: (rng.below(2) == 1).then(|| {
            (
                // The engine refuses nil operating costs, so a drawn nil becomes 1 cent.
                rng.cents(10_000_000).max(1),
                rng.pick(&[0, 2_500, 3_158, 7_500, 10_000, any_use, any_use]),
            )
        }),
        contribution: rng.pick(&[0, 0, small, large]),
    };
    // The FBT year ending 31 March 2027 has 365 days; Type 1 or Type 2, at 47%.
    let gross_up = rng.pick(&[20_802, 18_868]);
    let names = [
        "baseValue",
        "statutory",
        "operating",
        "taxableValue",
        "grossedUp",
        "fbt",
    ];
    let expected: serde_json::Map<String, Value> = names
        .iter()
        .zip(fbt_oracle(car, 365, gross_up, 4_700))
        .map(|(name, figure)| {
            (
                (*name).to_owned(),
                figure.map_or(Value::Null, |c| shown(c).into()),
            )
        })
        .collect();
    let (costs, business) = car.operating.unwrap_or((0, 0));
    (
        json!({
            "kind": "fbt",
            "car": {
                "method": if car.operating.is_some() { "operating" } else { "statutory" },
                "cost": dollars(car.cost),
                "accessories": dollars(car.accessories),
                "reduced": car.reduced,
                "days": car.days.to_string(),
                "costs": dollars(costs),
                "businessUse": format!("{}.{:02}", business / 100, business % 100),
                "contribution": dollars(car.contribution),
            },
            "year": {
                "days": "365",
                "grossUp": format!("{}.{:04}", gross_up / 10_000, gross_up % 10_000),
                "fbtRate": "47",
            },
        }),
        Value::Object(expected),
    )
}

fn levy_case(rng: &mut Seeded) -> (Value, Value) {
    let (listed, bonus) = bonuses(rng);
    let (mut base, loading, ordinary, sacrifice) = (
        rng.cents(50_000_000),
        rng.cents(5_000_000),
        rng.cents(50_000_000),
        rng.cents(2_000_000),
    );
    if rng.below(4) == 0 {
        base = 0;
    }
    match rng.below(3) {
        0 => {
            let (overtime, allowances) = (rng.cents(20_000_000), rng.cents(5_000_000));
            // s 3B(1): the greater of base plus bonuses and 75% of everything.
            let formula_a = 4 * u128::from(base + bonus);
            let formula_b = 3 * u128::from(base + bonus + overtime + allowances);
            let quarters = formula_a.max(formula_b);
            (
                json!({"kind": "base", "inputs": {
                    "baseRateCents": base, "bonuses": listed,
                    "overtimeAndPenaltyCents": overtime, "allowancesCents": allowances,
                }}),
                json!({"branch": "s 3B(1)", "winner": if formula_b > formula_a {"B"} else {"A"},
                    "quarters": quarters, "levy": levy_oracle(quarters)}),
            )
        }
        1 => {
            // s 3B(2): salary paid plus bonuses, with no 75% test.
            let quarters = 4 * u128::from(ordinary + bonus);
            (
                json!({"kind": "salary", "inputs": {
                    "annualSalaryPaidCents": ordinary, "bonuses": listed,
                }}),
                json!({"branch": "s 3B(2)", "winner": null,
                    "quarters": quarters, "levy": levy_oracle(quarters)}),
            )
        }
        _ => {
            let (specified, quantifiable) = (rng.below(2) == 1, rng.below(2) == 1);
            let month = rng.pick(&["2023-07", "2023-12", "2024-01", "2024-02", "2026-11"]);
            // String order is month order for YYYY-MM.
            let (branch, cents) = if month < "2024-01" {
                let pay = if base > 0 { base } else { ordinary };
                ("pre-2024", pay + sacrifice + bonus)
            } else if specified && quantifiable {
                ("s 3B(3)(a)", base + sacrifice + bonus + loading)
            } else {
                ("s 3B(3)(b)", ordinary + sacrifice + bonus)
            };
            let quarters = 4 * u128::from(cents);
            (
                json!({"kind": "casual", "inputs": {
                    "reportingMonth": month, "instrumentSpecifiesLoading": specified,
                    "loadingQuantifiable": quantifiable, "baseRatePayCents": base,
                    "casualLoadingCents": loading, "ordinaryRatePayCents": ordinary,
                    "sacrificedCents": sacrifice, "bonuses": listed,
                }}),
                json!({"branch": branch, "winner": null,
                    "quarters": quarters, "levy": levy_oracle(quarters)}),
            )
        }
    }
}

fn engines(cases: &[Value]) -> Vec<Value> {
    run_node(HARNESS, cases)
}

/// Runs `harness` in one Node process with `cases` on its standard input.
fn run_node(harness: &str, cases: &[Value]) -> Vec<Value> {
    let mut node = Command::new("node")
        .args(["--input-type=module", "--eval", harness])
        .current_dir(common::root())
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

/// The largest fee including GST the engine accepts, $1,000,000,000.00, in cents.
const MAX_FEE: u128 = 100_000_000_000;

/// A fixed fee in cents: fee, GST, total, first instalment, each later instalment and the
/// effective hourly rate, or `None` above the largest fee. `hours` is in hundredths of an
/// hour, `margin` in hundredths of a per cent and `step` in cents.
fn fee_oracle(
    hours: u128,
    rate: u128,
    margin: u128,
    step: u128,
    gst: bool,
    count: u128,
) -> Option<[u128; 6]> {
    // The fee keeps the margin when fee x (1 - margin) covers hours x rate: in cents and
    // hundredths, fee x (10,000 - margin) >= hours x rate x 100. Take the fewest steps that do.
    let cost = hours * rate * 100;
    let mut steps = cost / (step * (10_000 - margin));
    while steps * step * (10_000 - margin) < cost {
        steps += 1;
    }
    let fee = steps * step;
    // 10% of the fee, half a cent up.
    let tax = if gst { (fee + 5) / 10 } else { 0 };
    let total = fee + tax;
    if total > MAX_FEE {
        return None;
    }
    // Share the total out evenly in whole cents, then hand the cents left over to the first.
    let mut shares = vec![total / count; usize::try_from(count).unwrap()];
    shares[0] += total - shares.iter().sum::<u128>();
    assert_eq!(shares.iter().sum::<u128>(), total);
    assert!(shares[0] - shares[1 % shares.len()] < count);
    // After k months the client has paid at least k months' even share of the total.
    let mut paid = 0;
    for (month, share) in (1..).zip(&shares) {
        paid += share;
        assert!(paid * count >= total * month);
    }
    let effective = (2 * fee * 100 + hours) / (2 * hours);
    Some([
        fee,
        tax,
        total,
        shares[0],
        *shares.last().unwrap(),
        effective,
    ])
}

fn fee_case(rng: &mut Seeded) -> (Value, Value) {
    let any_hours = 1 + rng.below(878_400);
    let hours = rng.pick(&[1, 100, 1_200, 1_850, 878_400, any_hours, any_hours]);
    let any_rate = rng.cents(MAX_PRINCIPAL);
    let rate = rng.pick(&[0, 1, 9_500, 12_000, 18_000, any_rate, any_rate]);
    let any_margin = rng.below(10_000);
    let margin = rng.pick(&[0, 4_000, 4_500, 9_999, any_margin, any_margin]);
    let steps: [(u64, &str); 4] = [(1, "0.01"), (1_000, "10"), (5_000, "50"), (10_000, "100")];
    let (step, round_to) = rng.pick(&steps);
    let gst = rng.below(2) == 1;
    let any_count = 1 + rng.below(24);
    let count = rng.pick(&[1, 7, 12, 24, any_count, any_count]);
    let case = json!({
        "kind": "fee",
        "hours": dollars(hours),
        "rate": dollars(rate),
        "margin": format!("{}.{:02}", margin / 100, margin % 100),
        "roundTo": round_to,
        "gst": gst,
        "instalments": count.to_string(),
    });
    let result = fee_oracle(
        hours.into(),
        rate.into(),
        margin.into(),
        step.into(),
        gst,
        count.into(),
    );
    let shown_fee = |cents: u128| shown(u64::try_from(cents).unwrap());
    let expected = match result {
        None => json!({"refused": "The fee is over $1,000,000,000. Use smaller amounts."}),
        Some([fee, tax, total, first, instalment, effective]) => json!({
            "fee": shown_fee(fee),
            "gst": shown_fee(tax),
            "total": shown_fee(total),
            "first": shown_fee(first),
            "instalment": shown_fee(instalment),
            "effectiveRate": shown_fee(effective),
        }),
    };
    (case, expected)
}

#[test]
fn the_fee_oracle_works_the_page_examples_by_hand() {
    // 18.5 hours x $95 / 60% = $2,929.1666..., up to $2,930; GST $293; $3,223 over 12 is
    // 11 x $268.58 and a first of $268.62; $2,930 / 18.5 = $158.38 an hour.
    assert_eq!(
        fee_oracle(1_850, 9_500, 4_000, 1_000, true, 12),
        Some([293_000, 29_300, 322_300, 26_862, 26_858, 15_838])
    );
    // $330 over 7 is 6 x $47.14 and a first of $47.16, which carries the 2 cents over.
    assert_eq!(
        fee_oracle(300, 10_000, 0, 1, true, 7),
        Some([30_000, 3_000, 33_000, 4_716, 4_714, 10_000])
    );
    // A fee exactly on a step stays there.
    assert_eq!(
        fee_oracle(1_000, 10_000, 0, 10_000, false, 1).unwrap()[0],
        100_000
    );
    assert_eq!(
        fee_oracle(1_000, 10_001, 0, 10_000, false, 1).unwrap()[0],
        110_000
    );
}

#[test]
fn the_engine_agrees_with_the_oracle_on_every_seeded_fixed_fee() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1115_F1ED_FEE5);
    let (cases, expected): (Vec<Value>, Vec<Value>) =
        (0..FEE_CASES).map(|_| fee_case(&mut rng)).unzip();
    assert!(expected.iter().any(|want| want.get("refused").is_some()));
    assert!(expected.iter().any(|want| {
        want.get("first")
            .is_some_and(|first| first != &want["instalment"])
    }));
    let actual = engines(&cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

#[test]
fn the_oracle_works_a_known_loan_and_levy_by_hand() {
    // A one-month loan repays the balance and one month's interest: 1% on $100.
    let one = Terms::monthly(10_000, 120_000, 1);
    assert_eq!(payment_oracle(&one, 10_000, 0), 10_100);
    assert_eq!(
        schedule_oracle(&one, 10_000, 0, 10_100),
        Ok([10_100, 1, 100, 100])
    );
    // $1,000 at 0% over 3 months: a third of the balance, half up; the last payment takes the
    // cent left over.
    let nil = Terms::monthly(100_000, 0, 3);
    assert_eq!(payment_oracle(&nil, 100_000, 0), 33_333);
    assert_eq!(
        schedule_oracle(&nil, 100_000, 0, 33_333),
        Ok([33_334, 3, 0, 0])
    );
    // $100,000 at 6% over 30 years, the worked case in the Node tests: $599.55 a month, and
    // with interest rounded each month a last payment of $600.00 and $115,838.45 of interest.
    let long = Terms::monthly(10_000_000, 60_000, 360);
    assert_eq!(payment_oracle(&long, 10_000_000, 0), 59_955);
    assert_eq!(
        schedule_oracle(&long, 10_000_000, 0, 59_955),
        Ok([60_000, 360, 50_000, 11_583_845])
    );
    // One year left repays the balance and a year's interest: $1,000 at 8.77%.
    assert_eq!(div7a_oracle(100_000, 877, 1), [108_770, 8_770, 100_000]);
    // The ATO's 2015 example, $55,000 at 5.95% over 7 years: $9,835 to the dollar.
    assert_eq!(div7a_oracle(5_500_000, 595, 7), [983_492, 327_250, 656_242]);
    // The ATO's FBT guide, example 28: $60,000 for 182 of 365 days, less $1,000, is $4,983
    // with the cents of $5,983.56 left out. Type 1 at 47% is worked by hand in the Node tests.
    let example = Car {
        cost: 6_000_000,
        accessories: 0,
        reduced: false,
        days: 182,
        operating: None,
        contribution: 100_000,
    };
    assert_eq!(
        fbt_oracle(example, 365, 20_802, 4_700),
        [
            Some(6_000_000),
            Some(498_356),
            None,
            Some(498_356),
            Some(1_036_680),
            Some(487_240)
        ]
    );
    // Example 31: $19,580 at 75% business use, less $2,000, is $2,895 below the statutory value.
    let operating = Car {
        days: 365,
        operating: Some((1_958_000, 7_500)),
        contribution: 200_000,
        ..example
    };
    assert_eq!(fbt_oracle(operating, 365, 20_802, 4_700)[3], Some(289_500));
    // Example 23: a third off $39,000 and none off $4,000 of later accessories is $30,000.
    let reduced = Car {
        cost: 3_900_000,
        accessories: 400_000,
        reduced: true,
        ..example
    };
    assert_eq!(fbt_oracle(reduced, 365, 18_868, 4_700)[0], Some(3_000_000));
    // 2.7% of $1,000.00 is $27.00; 2.7% of $0.50 is exactly 1.35 cents, so 1 cent.
    assert_eq!(levy_oracle(4 * 100_000), 2_700);
    assert_eq!(levy_oracle(4 * 50), 1);
    // 2.7% of $1.85 is 4.995 cents, and of 18.75 cents is 0.50625 cents: both round up.
    assert_eq!(levy_oracle(4 * 185), 5);
    assert_eq!(levy_oracle(75), 1);
}

/// Each revenue office's own worked figure, read 15 November 2026, and hand-worked figures
/// where none is published.
#[test]
fn the_duty_oracle_gives_the_revenue_offices_worked_figures() {
    for (place, dollars, cents, source) in [
        (
            "AU-NSW",
            1_350_000,
            5_553_700,
            "Revenue NSW auction example",
        ),
        (
            "AU-NSW",
            450_000,
            1_443_700,
            "Revenue NSW family transfer example",
        ),
        (
            "AU-NSW",
            4_000_000,
            20_323_700,
            "Revenue NSW premium duty example",
        ),
        ("AU-NSW", 450_050, 1_444_150, "Revenue NSW calculator"),
        ("AU-NSW", 1_601, 2_125, "Revenue NSW calculator"),
        ("AU-NSW", 1_000, 2_000, "Revenue NSW calculator"),
        (
            "AU-NSW",
            3_870_001,
            19_414_400,
            "Revenue NSW calculator, premium",
        ),
        (
            "AU-VIC",
            550_000,
            2_807_000,
            "SRO Victoria standard rate example",
        ),
        (
            "AU-VIC",
            400_000,
            1_907_000,
            "SRO Victoria standard rate example",
        ),
        ("AU-QLD", 850_000, 3_127_500, "QRO calculation example"),
        (
            "AU-SA",
            600_000,
            2_683_000,
            "RevenueSA foreign ownership surcharge example 1",
        ),
        (
            "AU-SA",
            300_000,
            1_133_000,
            "RevenueSA foreign ownership surcharge example 2",
        ),
        (
            "AU-SA",
            1_000_000,
            4_883_000,
            "RevenueSA conveyance rate chart",
        ),
        ("AU-TAS", 500_000, 1_824_750, "Tasmanian duty calculator"),
        ("AU-TAS", 725_050, 2_781_450, "Tasmanian duty calculator"),
        ("AU-TAS", 3_001, 5_175, "Tasmanian duty calculator"),
        ("AU-TAS", 3_000, 5_000, "Tasmanian duty calculator"),
        // By hand: $28,453 + 750 x $5.15.
        ("AU-WA", 800_000, 3_231_550, "hand-worked"),
        // By hand: $11,400 + 1,500 x $4.32, and $4.54 per $100 of $1,500,000.
        ("AU-ACT", 650_000, 1_788_000, "hand-worked"),
        ("AU-ACT", 1_500_000, 6_810_000, "hand-worked"),
        // By hand: 0.06571441 x 500^2 + 15 x 500 = 23,928.6025, and 4.95% of $600,000.
        ("AU-NT", 500_000, 2_392_860, "hand-worked"),
        ("AU-NT", 600_000, 2_970_000, "hand-worked"),
    ] {
        assert_eq!(
            duty_oracle(place, dollars),
            cents,
            "{place} {dollars}: {source}"
        );
    }
}

#[test]
fn the_transfer_duty_engine_agrees_with_the_oracle_at_every_band_boundary() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1115_D07E_5EED);
    let places = [
        "AU-NSW", "AU-VIC", "AU-QLD", "AU-WA", "AU-SA", "AU-TAS", "AU-ACT", "AU-NT",
    ];
    let mut values = duty_boundaries();
    // Seeded whole-dollar values spread across magnitudes, for every jurisdiction.
    for _ in 0..DUTY_CASES {
        values.push((rng.pick(&places), 1 + rng.cents(999_999_999)));
    }
    let (cases, expected): (Vec<Value>, Vec<Value>) = values
        .iter()
        .map(|&(place, dollars)| duty_case(place, dollars))
        .unzip();
    let actual = engines(&cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Queensland's home concession rate in cents: $1 for each $100, or part of $100, to $350,000,
/// then $3.50, $4.50 and $5.75 for each $100, or part, over $350,000, $540,000 and $1,000,000.
fn qld_home_rate(dollars: u64) -> u64 {
    let over = |from: u64| (dollars - from).div_ceil(100);
    if dollars <= 350_000 {
        100 * dollars.div_ceil(100)
    } else if dollars <= 540_000 {
        350_000 + 350 * over(350_000)
    } else if dollars <= 1_000_000 {
        1_015_000 + 450 * over(540_000)
    } else {
        3_085_000 + 575 * over(1_000_000)
    }
}

/// Duty in cents for an eligible first home buyer of a home, typed from each source as read
/// on 16 November 2026 (AEDT), not from the engine's tables:
/// - NSW: <https://www.revenue.nsw.gov.au/grants-schemes/assistance-scheme> (09:25), the
///   reduced rate table at <https://www.nsw.gov.au/housing-and-construction/buying-and-selling-property/home-buying-assistance/first-home-buyers-assistance-scheme>
///   (09:28) and <https://www.apps09.revenue.nsw.gov.au/erevenue/calculators/fhba.php> (09:29, 09:41).
/// - Vic: Duties Act 2000 s 57JA, <https://www.legislation.vic.gov.au/in-force/acts/duties-act-2000/141> (09:33).
/// - Qld: <https://qro.qld.gov.au/duties/transfer-duty/calculate/concession-rates/> (09:36).
/// - WA: <https://www.wa.gov.au/government/publications/duties-fact-sheet-first-home-owner-rate> (09:38).
/// - SA: <https://www.revenuesa.sa.gov.au/stamp-duty/first-home-buyer-relief/relief-available> (09:38).
/// - Tas: <https://www.sro.tas.gov.au/property-transfer-duties/concessions-exemptions/first-home-buyers-of-established-homes-duty-relief> (09:25).
/// - ACT: <https://www.revenue.act.gov.au/home-buyer-assistance/home-buyer-concession-scheme/about-the-home-buyer-concession-scheme> (09:36).
/// - NT: <https://nt.gov.au/property/home-owner-assistance> (09:25).
///
/// Queensland's first home amount is worked as $1,735 for each $10,000 band below $800,000, at
/// most 10, where the engine looks the band up in a table.
fn first_home_oracle(place: &str, home: &str, dollars: u64) -> u64 {
    let general = duty_oracle(place, dollars);
    match (place, home) {
        ("AU-NSW", _) if dollars <= 800_000 => 0,
        ("AU-NSW", _) if dollars >= 1_000_000 => general,
        ("AU-NSW", _) => {
            // Revenue NSW's calculator rounds the concession to the cent; $20 is the minimum.
            let off = exact_half_up(
                u128::from(duty_oracle(place, 800_000)) * u128::from(1_000_000 - dollars),
                200_000,
            );
            (general - u64::try_from(off).unwrap()).max(2_000)
        }
        ("AU-VIC", _) if dollars <= 600_000 => 0,
        ("AU-VIC", _) if dollars <= 750_000 => u64::try_from(exact_half_up(
            u128::from(general) * u128::from(dollars - 600_000),
            150_000,
        ))
        .unwrap(),
        ("AU-QLD", "established") => {
            let bands = if dollars < 800_000 {
                (80 - dollars / 10_000).min(10)
            } else {
                0
            };
            qld_home_rate(dollars).saturating_sub(bands * 173_500)
        }
        ("AU-WA", _) if dollars <= 600_000 => 0,
        ("AU-WA", _) if dollars <= 800_000 => 1_615 * (dollars - 600_000).div_ceil(100),
        ("AU-QLD" | "AU-SA", "new") | ("AU-ACT", _) => 0,
        _ => general,
    }
}

#[test]
fn the_first_home_oracle_gives_the_published_figures() {
    for (place, home, dollars, cents, source) in [
        (
            "AU-NSW",
            "established",
            850_000,
            979_675,
            "NSW Government 2026-27 table",
        ),
        (
            "AU-NSW",
            "established",
            900_000,
            1_959_350,
            "NSW Government 2026-27 table",
        ),
        (
            "AU-NSW",
            "established",
            950_000,
            2_939_025,
            "NSW Government 2026-27 table",
        ),
        (
            "AU-NSW",
            "established",
            990_000,
            3_722_765,
            "NSW Government 2026-27 table",
        ),
        (
            "AU-NSW",
            "established",
            800_000,
            0,
            "Revenue NSW calculator",
        ),
        (
            "AU-NSW",
            "established",
            800_001,
            2_000,
            "Revenue NSW calculator",
        ),
        (
            "AU-NSW",
            "established",
            800_099,
            2_000,
            "Revenue NSW calculator",
        ),
        (
            "AU-NSW",
            "established",
            850_001,
            980_140,
            "Revenue NSW calculator",
        ),
        (
            "AU-NSW",
            "established",
            850_050,
            980_880,
            "Revenue NSW calculator",
        ),
        ("AU-NSW", "new", 850_050, 980_880, "Revenue NSW calculator"),
        (
            "AU-NSW",
            "established",
            987_654,
            3_677_006,
            "Revenue NSW calculator",
        ),
        (
            "AU-NSW",
            "established",
            997_000,
            3_859_919,
            "Revenue NSW calculator",
        ),
        (
            "AU-NSW",
            "new",
            995_000,
            3_820_732,
            "Revenue NSW calculator",
        ),
        (
            "AU-NSW",
            "established",
            999_000,
            3_899_106,
            "Revenue NSW calculator",
        ),
        (
            "AU-NSW",
            "established",
            999_999,
            3_918_685,
            "Revenue NSW calculator",
        ),
        (
            "AU-NSW",
            "new",
            999_999,
            3_918_685,
            "Revenue NSW calculator",
        ),
        (
            "AU-NSW",
            "established",
            1_000_000,
            3_918_700,
            "Revenue NSW calculator",
        ),
        (
            "AU-QLD",
            "established",
            650_000,
            0,
            "Queensland Revenue Office example",
        ),
        (
            "AU-QLD",
            "established",
            730_000,
            655_500,
            "Queensland Revenue Office example",
        ),
        (
            "AU-QLD",
            "established",
            850_000,
            2_410_000,
            "Queensland Revenue Office example",
        ),
        // By hand: $37,070 general duty x 100,000 / 150,000, and $16.15 x 1,000.
        ("AU-VIC", "established", 700_000, 2_471_333, "hand-worked"),
        ("AU-WA", "established", 700_000, 1_615_000, "hand-worked"),
    ] {
        assert_eq!(
            first_home_oracle(place, home, dollars),
            cents,
            "{place} {home} {dollars}: {source}"
        );
    }
}

#[test]
fn the_first_home_engine_agrees_with_the_oracle_either_side_of_every_threshold() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1116_F125_7403);
    let places = [
        "AU-NSW", "AU-VIC", "AU-QLD", "AU-WA", "AU-SA", "AU-TAS", "AU-ACT", "AU-NT",
    ];
    let homes = ["established", "new"];
    let mut values = Vec::new();
    for place in places {
        for home in homes {
            // Every $10,000 step of Queensland's first home amount, and each other threshold.
            for edge in [600_000, 750_000, 1_000_000]
                .into_iter()
                .chain((700_000..=800_000).step_by(10_000))
            {
                values.extend([edge - 1, edge, edge + 1].map(|v| (place, home, v)));
            }
            values.extend([(place, home, 1), (place, home, 1_000_000_000)]);
        }
    }
    for _ in 0..FIRST_HOME_CASES {
        let (place, home) = (rng.pick(&places), rng.pick(&homes));
        values.push((place, home, 500_000 + rng.below(600_001)));
    }
    let (cases, expected): (Vec<Value>, Vec<Value>) = values
        .iter()
        .map(|&(place, home, dollars)| {
            (
                json!({"kind": "firstHome", "value": dollars.to_string(), "place": place, "home": home}),
                json!({"duty": shown(first_home_oracle(place, home, dollars)),
                    "general": shown(duty_oracle(place, dollars))}),
            )
        })
        .unzip();
    let actual = engines(&cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

#[test]
fn the_engines_agree_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1105_C0A1_7E57);
    let (mut cases, mut expected) = (Vec::new(), Vec::new());
    for index in 0..LOAN_CASES + LEVY_CASES + DIV7A_CASES + FBT_CASES {
        let (case, result) = if index < LOAN_CASES {
            loan_case(&mut rng)
        } else if index < LOAN_CASES + LEVY_CASES {
            levy_case(&mut rng)
        } else if index < LOAN_CASES + LEVY_CASES + DIV7A_CASES {
            div7a_case(&mut rng)
        } else {
            fbt_case(&mut rng)
        };
        cases.push(case);
        expected.push(result);
    }
    assert_eq!(cases.len(), 360);
    let actual = engines(&cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

fn balloon_case(rng: &mut Seeded) -> (Value, Value) {
    let principal = 1 + rng.cents(MAX_PRINCIPAL - 1);
    let any_rate = rng.below(1_000_001);
    let rate = rng.pick(&[0, 1, 75_000, 1_000_000, any_rate, any_rate]);
    let any_term = 1 + rng.below(600);
    let months = rng.pick(&[1, 2, 48, 60, 600, any_term, any_term]) as u32;
    // Nil, all of it, 30% of it (whole cents, rounded down) or any amount up to it.
    let any_balloon = rng.below(principal + 1);
    let balloon = rng.pick(&[0, principal, principal * 3 / 10, any_balloon]);
    let terms = Terms {
        balloon,
        advance: rng.below(2) == 1,
        ..Terms::monthly(principal, rate, months)
    };
    (terms.case(), finance_oracle(&terms))
}

/// Month by month in whole cents: each payment is taken at the start (advance) or the end
/// (arrears) of the month, and the month's interest rounds half up. Returns each month's
/// interest and closing balance.
fn balloon_schedule(
    principal: u64,
    rate: u64,
    months: u32,
    payment: u64,
    advance: bool,
) -> Vec<(u64, u64)> {
    let mut balance = principal;
    (0..months)
        .map(|_| {
            if advance {
                balance -= payment;
            }
            let interest = (balance * rate * 2 + MONTHLY_SCALE) / (2 * MONTHLY_SCALE);
            balance += interest;
            if !advance {
                balance -= payment;
            }
            (interest, balance)
        })
        .collect()
}

#[test]
fn a_30_percent_balloon_loan_matches_a_hand_worked_schedule() {
    // $60,000 at 7.5% a year (0.625% a month) over 60 months, with a 30% balloon of $18,000.
    // In arrears the oracle's payment is $954.09: AusCalc's vehicle finance example,
    // read 15 November 2026, gives the same payment and $15,245.63 of total interest, the
    // payment's total before each month's interest is rounded to the cent.
    let arrears = Terms {
        balloon: 1_800_000,
        ..Terms::monthly(6_000_000, 75_000, 60)
    };
    assert_eq!(payment_oracle(&arrears, 6_000_000, 1_800_000), 95_409);
    // By hand: month 1 charges $60,000.00 x 0.625% = $375.00, so $60,000.00 + $375.00 -
    // $954.09 leaves $59,420.91; month 2 charges $371.38 (371.3806...), leaving $58,838.20.
    let rows = balloon_schedule(6_000_000, 75_000, 60, 95_409, false);
    assert_eq!(rows[0], (37_500, 5_942_091));
    assert_eq!(rows[1], (37_138, 5_883_820));
    // After 60 payments the cent-rounded schedule owes $18,000.26: the balloon plus 26
    // cents of rounding, which the last payment takes: $954.35, and $15,245.66 of interest.
    assert_eq!(rows[59], (11_773, 1_800_026));
    assert_eq!(
        schedule_oracle(&arrears, 6_000_000, 1_800_000, 95_409),
        Ok([95_435, 60, 37_500, 1_524_566])
    );
    // In advance the payment is the arrears one over 1.00625: $948.17, the first with no
    // interest. Month 1: $60,000.00 - $948.17 = $59,051.83, which earns $369.07 (369.0739...)
    // to close at $59,420.90.
    let advance = Terms {
        advance: true,
        ..arrears
    };
    assert_eq!(payment_oracle(&advance, 6_000_000, 1_800_000), 94_817);
    let rows = balloon_schedule(6_000_000, 75_000, 60, 94_817, true);
    assert_eq!(rows[0], (36_907, 5_942_090));
    assert_eq!(rows[59], (11_180, 1_799_983));
    // The schedule's last payment leaves $18,000 / 1.00625 = $17,888.20, a month before the
    // balloon falls due: 17 cents short of the level payment, so $948.00, and the month's
    // $111.80 of interest is the balloon row's, as above.
    assert_eq!(
        schedule_oracle(&advance, 6_000_000, 1_800_000, 94_817),
        Ok([94_800, 60, 0, 1_489_003])
    );
}

#[test]
fn the_engine_agrees_with_the_oracle_on_every_seeded_balloon_and_advance_loan() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1115_BA11_0017);
    let (cases, expected): (Vec<Value>, Vec<Value>) =
        (0..BALLOON_CASES).map(|_| balloon_case(&mut rng)).unzip();
    assert!(
        cases
            .iter()
            .any(|case| case["terms"]["timing"] == "advance")
    );
    assert!(
        cases
            .iter()
            .any(|case| case["terms"]["balloon"] == case["terms"]["amount"])
    );
    let actual = engines(&cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the tax administration engines, as `HARNESS` runs the others.
const TAX_HARNESS: &str = r"
import { objectionDeadline, paygInstalment } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const shown = (value) => (value === null ? null : String(value));
const run = {
  objection: ({ decision, group, notice, first }) => {
    const { periodEnds, lastDay, amendedEnds, firstEnds } = objectionDeadline(decision, group, notice, first);
    return { periodEnds, lastDay, amendedEnds, firstEnds };
  },
  payg: ({ inputs }) => {
    try {
      const result = paygInstalment(inputs);
      return { amount: shown(result.amount), instalment: result.instalment, credit: result.credit,
        due: shown(result.due), instalmentRate: shown(result.instalmentRate) };
    } catch (error) {
      return { refused: error.message };
    }
  },
};
process.stdout.write(JSON.stringify(JSON.parse(input).map((one) => run[one.kind](one))));
";

const OBJECTION_CASES: usize = 240;

/// The last day of `years` years after `notice`, worked with jiff's calendar where the
/// engine rolls JavaScript dates: the period starts the next day (s 36(1) item 6 of the Acts
/// Interpretation Act 1901) and ends the day before the same date in the later year, which
/// for a 29 February start with none that year is the day before 1 March.
fn years_after(notice: Date, years: i16) -> Date {
    let start = notice.tomorrow().unwrap();
    let year = start.year() + years;
    let same = Date::new(year, start.month(), start.day()).unwrap_or_else(|_| date(year, 3, 1));
    same.yesterday().unwrap()
}

/// 60 days after `notice`, one day at a time.
fn sixty_days_after(notice: Date) -> Date {
    (0..60).fold(notice, |day, _| day.tomorrow().unwrap())
}

/// s 36(2): a Saturday or Sunday last day moves to the next weekday.
fn lodging_day(end: Date) -> Date {
    let mut day = end;
    while matches!(day.weekday(), Weekday::Saturday | Weekday::Sunday) {
        day = day.tomorrow().unwrap();
    }
    day
}

/// The period's end, the lodging day, and for an amended assessment its 2 candidate ends, from
/// s 14ZW(1)(aa), (aaa) and (c), and (1B) and (1BA).
fn objection_oracle(decision: &str, group: i16, notice: Date, first: Date) -> [Option<Date>; 4] {
    let years = match decision {
        "fbt" | "amended-fbt" => 4,
        _ => group,
    };
    let (end, amended, original) = match decision {
        "other" => (sixty_days_after(notice), None, None),
        "amended" | "amended-fbt" => {
            let (amended, original) = (sixty_days_after(notice), years_after(first, years));
            (amended.max(original), Some(amended), Some(original))
        }
        _ => (years_after(notice, years), None, None),
    };
    [Some(end), Some(lodging_day(end)), amended, original]
}

fn iso(day: Option<Date>) -> Value {
    day.map_or(Value::Null, |day| {
        json!(day.strftime("%Y-%m-%d").to_string())
    })
}

/// A notice date weighted to the boundaries: month ends, 28 and 29 February, leap and
/// century years, and the first and last years the engine accepts.
fn notice_day(rng: &mut Seeded) -> Date {
    let any_year = 1900 + rng.below(8090) as i16;
    let year = rng.pick(&[1900, 2000, 2026, 2027, 2028, 2100, 9989, any_year, any_year]);
    let month = 1 + rng.below(12) as i8;
    let last = (28..=31)
        .rev()
        .find(|day| Date::new(year, month, *day).is_ok())
        .unwrap();
    let any_day = 1 + rng.below(last as u64) as i8;
    let day = rng
        .pick(&[1, 28, 29, last, last, any_day, any_day])
        .min(last);
    date(year, month, day)
}

fn objection_case(rng: &mut Seeded) -> (Value, Value) {
    let decision = rng.pick(&["assessment", "amended", "fbt", "amended-fbt", "other"]);
    let group = rng.pick(&[2, 4]);
    let notice = notice_day(rng);
    // A first notice on or before the amended one, up to about 6 years earlier.
    let floor = date(1900, 1, 1);
    let first = (0..rng.below(2200)).fold(notice, |day, _| day.yesterday().unwrap().max(floor));
    (
        json!({
            "kind": "objection",
            "decision": decision,
            "group": group.to_string(),
            "notice": notice.strftime("%Y-%m-%d").to_string(),
            "first": first.strftime("%Y-%m-%d").to_string(),
        }),
        {
            let [period, last, amended, original] =
                objection_oracle(decision, group, notice, first);
            json!({"periodEnds": iso(period), "lastDay": iso(last),
                "amendedEnds": iso(amended), "firstEnds": iso(original)})
        },
    )
}

#[test]
fn the_objection_oracle_counts_leap_days_month_ends_and_weekends_by_hand() {
    // The Acts Interpretation Act's s 36(2) example: 31 March is a Saturday, so Monday 2 April.
    assert_eq!(lodging_day(date(2029, 3, 31)), date(2029, 4, 2));
    assert_eq!(lodging_day(date(2030, 11, 17)), date(2030, 11, 18));
    assert_eq!(lodging_day(date(2027, 3, 2)), date(2027, 3, 2));
    // The day notice is given is not counted: 60 days after 1 January 2027 is 2 March 2027.
    assert_eq!(sixty_days_after(date(2027, 1, 1)), date(2027, 3, 2));
    // 2 years starting 1 March 2026 end on 29 February 2028; starting 1 March 2028, on 28 February 2030.
    assert_eq!(years_after(date(2026, 2, 28), 2), date(2028, 2, 29));
    assert_eq!(years_after(date(2028, 2, 29), 2), date(2030, 2, 28));
    // Starting on 29 February 2028, 2 years end on 28 February 2030 and 4 years on 28 February 2032.
    assert_eq!(years_after(date(2028, 2, 28), 2), date(2030, 2, 28));
    assert_eq!(years_after(date(2028, 2, 28), 4), date(2032, 2, 28));
    // Month and year ends: 31 December 2026 runs to 31 December 2028.
    assert_eq!(years_after(date(2026, 12, 31), 2), date(2028, 12, 31));
    assert_eq!(
        objection_oracle("amended", 2, date(2028, 10, 2), date(2026, 10, 20)),
        [
            Some(date(2028, 12, 1)),
            Some(date(2028, 12, 1)),
            Some(date(2028, 12, 1)),
            Some(date(2028, 10, 20))
        ]
    );
}

#[test]
fn the_objection_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1115_0B1E_C710);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..OBJECTION_CASES)
        .map(|_| objection_case(&mut rng))
        .unzip();
    let actual = run_node(TAX_HARNESS, &cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

const PAYG_CASES: usize = 240;

/// Half up from the quotient and remainder, where the engine adds half the divisor first.
fn nearest(numerator: u128, denominator: u128) -> u128 {
    let (quotient, remainder) = (numerator / denominator, numerator % denominator);
    quotient + u128::from(2 * remainder >= denominator)
}

/// Estimated tax over estimated instalment income in hundredths of a per cent, by long
/// division to 2 decimal places, dropping the rest as the ATO's example 2 does. Nil income
/// varies the rate to nil.
fn varied_rate(tax: u128, income: u128) -> u128 {
    if income == 0 {
        return 0;
    }
    let (mut rate, mut remainder) = (tax * 100 / income, tax * 100 % income);
    for _ in 0..2 {
        remainder *= 10;
        rate = rate * 10 + remainder / income;
        remainder %= income;
    }
    rate
}

/// One quarter's inputs, money in cents and the rate in hundredths of a per cent.
struct Quarter {
    method: &'static str,
    notified: u128,
    instalment: u128,
    estimated_tax: u128,
    earlier: u128,
    credits: u128,
    income: u128,
    rate: u128,
    estimated_income: u128,
    earlier_income: u128,
}

/// The amount in cents, the instalment and credit in whole dollars (cents dropped, as the
/// BAS instructions say), the amount due by this instalment and the rate applied.
type Instalment = (i128, u128, u128, Option<u128>, Option<u128>);

fn signed(cents: u128) -> i128 {
    i128::try_from(cents).unwrap()
}

/// The instalment under Schedule 1 to the Taxation Administration Act 1953: s 45-112 (the
/// notified amount), s 45-410 (a quarter's share of estimated tax less earlier instalments net
/// of credits), s 45-110 (instalment income times the rate) and s 45-205 with s 45-215 (a
/// varied rate, and a credit when it is lower than the rate the earlier quarters used).
fn payg_oracle(quarter: &Quarter) -> Result<Instalment, &'static str> {
    let net_earlier = || {
        quarter
            .earlier
            .checked_sub(quarter.credits)
            .ok_or("Credits claimed cannot exceed the earlier instalments.")
    };
    match quarter.method {
        "amount" => Ok((
            signed(quarter.notified),
            quarter.notified / 100,
            0,
            None,
            None,
        )),
        "varied-amount" => {
            // 25% a quarter, so the fourth instalment is 100%.
            let due = nearest(quarter.estimated_tax * 25 * quarter.instalment, 100);
            if quarter.instalment == 1 && quarter.earlier > 0 {
                return Err("The first instalment of the year has no earlier instalments.");
            }
            let amount = signed(due) - signed(net_earlier()?);
            let whole = |cents: i128| u128::try_from(cents.max(0)).unwrap() / 100;
            Ok((amount, whole(amount), whole(-amount), Some(due), None))
        }
        _ => {
            let (rate, credit) = if quarter.method == "varied-rate" {
                if quarter.estimated_tax > quarter.estimated_income {
                    return Err("Estimated tax cannot exceed estimated instalment income.");
                }
                let rate = varied_rate(quarter.estimated_tax, quarter.estimated_income);
                let credit = if rate < quarter.rate {
                    let at_rate = nearest(quarter.earlier_income * rate, 10_000);
                    net_earlier()?.saturating_sub(at_rate) / 100
                } else {
                    0
                };
                (rate, credit)
            } else {
                (quarter.rate, 0)
            };
            let amount = nearest(quarter.income * rate, 10_000);
            Ok((signed(amount), amount / 100, credit, None, Some(rate)))
        }
    }
}

/// `shown` for an amount that may be negative.
fn shown_signed(cents: i128) -> String {
    let magnitude = shown(u64::try_from(cents.unsigned_abs()).unwrap());
    if cents < 0 {
        format!("-{magnitude}")
    } else {
        magnitude
    }
}

/// Cents up to the largest field, weighted to nil and to one cent either side of `pivot`.
fn near(rng: &mut Seeded, pivot: u128) -> u128 {
    let any = u128::from(rng.cents(MAX_PRINCIPAL));
    rng.pick(&[0, pivot.saturating_sub(1), pivot, pivot + 1, any, any])
        .min(u128::from(MAX_PRINCIPAL))
}

fn payg_case(rng: &mut Seeded) -> (Value, Value) {
    let method = rng.pick(&["amount", "varied-amount", "rate", "varied-rate"]);
    let estimated_income = u128::from(rng.cents(MAX_PRINCIPAL));
    let earlier = u128::from(rng.cents(MAX_PRINCIPAL));
    let any_rate = u128::from(rng.below(10_001));
    let instalment = u128::from(1 + rng.below(4));
    let quarter = Quarter {
        method,
        notified: u128::from(rng.cents(MAX_PRINCIPAL)),
        instalment,
        estimated_tax: near(rng, estimated_income),
        // A first instalment mostly has no earlier ones.
        earlier: if instalment == 1 && rng.below(4) > 0 {
            0
        } else {
            earlier
        },
        credits: near(rng, earlier),
        income: u128::from(rng.cents(MAX_PRINCIPAL)),
        rate: rng.pick(&[0, 1, 170, 1100, 1684, 10_000, any_rate, any_rate]),
        estimated_income,
        earlier_income: u128::from(rng.cents(MAX_PRINCIPAL)),
    };
    let money = |cents: u128| dollars(u64::try_from(cents).unwrap());
    let case = json!({"kind": "payg", "inputs": {
        "method": method, "notified": money(quarter.notified),
        "instalment": instalment.to_string(), "estimatedTax": money(quarter.estimated_tax),
        "earlier": money(quarter.earlier), "credits": money(quarter.credits),
        "income": money(quarter.income),
        "rate": format!("{}.{:02}", quarter.rate / 100, quarter.rate % 100),
        "estimatedIncome": money(quarter.estimated_income),
        "earlierIncome": money(quarter.earlier_income),
    }});
    let figure = |hundredths: u128| shown(u64::try_from(hundredths).unwrap());
    let result = match payg_oracle(&quarter) {
        Ok((amount, instalment, credit, due, applied)) => json!({
            "amount": shown_signed(amount), "instalment": instalment, "credit": credit,
            "due": due.map(figure), "instalmentRate": applied.map(figure),
        }),
        Err(refused) => json!({ "refused": refused }),
    };
    (case, result)
}

fn blank(method: &'static str) -> Quarter {
    Quarter {
        method,
        notified: 0,
        instalment: 1,
        estimated_tax: 0,
        earlier: 0,
        credits: 0,
        income: 0,
        rate: 0,
        estimated_income: 0,
        earlier_income: 0,
    }
}

#[test]
fn the_payg_oracle_works_the_atos_examples_by_hand() {
    // Read 15 November 2026. Sophia: '$20,100 × 1.7% = $341.70', entered as 341.
    let sophia = Quarter {
        income: 2_010_000,
        rate: 170,
        ..blank("rate")
    };
    assert_eq!(payg_oracle(&sophia), Ok((34_170, 341, 0, None, Some(170))));
    // Julie Co: '$106,000 × 11% = $11,660'.
    let julie = Quarter {
        income: 10_600_000,
        rate: 1_100,
        ..blank("rate")
    };
    assert_eq!(payg_oracle(&julie).unwrap().1, 11_660);
    // Cari: '$14,000 × 75% = $10,500', '$10,500 − ($5,000 + $5,000) = $500', then $3,500.
    let cari = Quarter {
        instalment: 3,
        estimated_tax: 1_400_000,
        earlier: 1_000_000,
        ..blank("varied-amount")
    };
    assert_eq!(
        payg_oracle(&cari),
        Ok((50_000, 500, 0, Some(1_050_000), None))
    );
    let fourth = Quarter {
        instalment: 4,
        earlier: 1_050_000,
        ..cari
    };
    assert_eq!(payg_oracle(&fourth).unwrap().1, 3_500);
    // Harmander: '($10,125 ÷ $82,480) × 100 = 12.27%', though the quotient is 12.2757%.
    assert_eq!(varied_rate(1_012_500, 8_248_000), 1_227);
    // Bill: 10% varied to 5% on $10,000 a quarter, $500 to pay and a $500 credit.
    let bill = Quarter {
        estimated_tax: 50_000,
        estimated_income: 1_000_000,
        income: 1_000_000,
        rate: 1_000,
        earlier: 100_000,
        earlier_income: 1_000_000,
        ..blank("varied-rate")
    };
    assert_eq!(payg_oracle(&bill), Ok((50_000, 500, 500, None, Some(500))));
    // 1.5 cents rounds up and 1.4999 cents down.
    assert_eq!((nearest(15, 10), nearest(14_999, 10_000)), (2, 1));
}

#[test]
fn the_payg_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1115_9A76_0045);
    let (cases, expected): (Vec<Value>, Vec<Value>) =
        (0..PAYG_CASES).map(|_| payg_case(&mut rng)).unzip();
    let actual = run_node(TAX_HARNESS, &cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Schedule 11 for 2026-27, in the Taxation Administration (Withholding Schedules) Instrument
/// 2026 (F2026L00716) and on the ATO's Schedule 11 page (last updated 17 June 2026), both read
/// 15 November 2026: the ETP cap, the whole-of-income cap and note 1's base and service amounts
/// in cents; Table A's rates in whole per cent.
const ETP_CAP: u64 = 27_000_000;
const WHOLE_OF_INCOME_CAP: u64 = 18_000_000;
const BASE_AMOUNT: u64 = 1_359_800;
const SERVICE_AMOUNT: u64 = 680_100;
const UNDER_RATE: u64 = 32;
const REACHED_RATE: u64 = 17;
const ABOVE_RATE: u64 = 47;
const ETP_CASES: usize = 60;

/// Schedule 11's preservation age table, by date of birth: each row's first birthday and age.
const PRESERVATION_AGES: [((u64, u64, u64), u64); 6] = [
    ((0, 1, 1), 55),
    ((1960, 7, 1), 56),
    ((1961, 7, 1), 57),
    ((1962, 7, 1), 58),
    ((1963, 7, 1), 59),
    ((1964, 7, 1), 60),
];

/// One ETP's parts, amounts in cents.
#[derive(Clone, Copy)]
struct Etp {
    redundancy: u64,
    years: u64,
    excluded: u64,
    non_excluded: u64,
    other: u64,
    born: (u64, u64, u64),
}

/// Whether the employee is their preservation age by 30 June 2027 (Schedule 11's table, read
/// as date ranges), and, in cents: the tax-free limit, the tax-free part, the code R taxable
/// component and its withholding, the whole-of-income cap left, the code O cap and its
/// withholding, and the total. The tax-free limit adds the service amount once a year
/// (ITAA 1997 s 83-170(3)); each part is withheld at the rate within its cap and the top rate
/// above it, to the dollar, 50 cents up, the code R part first within the ETP cap alone and the
/// code O part within the smaller of the ETP cap left and the whole-of-income cap (Schedule 11,
/// example 4).
fn etp_oracle(etp: Etp) -> (bool, u64, [u64; 8]) {
    let age = PRESERVATION_AGES
        .iter()
        .rev()
        .find(|(from, _)| etp.born >= *from)
        .map(|(_, age)| *age)
        .unwrap();
    let reached = (etp.born.0 + age, etp.born.1, etp.born.2) <= (2027, 6, 30);
    let rate = if reached { REACHED_RATE } else { UNDER_RATE };
    let mut limit = BASE_AMOUNT;
    for _ in 0..etp.years {
        limit += SERVICE_AMOUNT;
    }
    let tax_free = etp.redundancy.min(limit);
    let excluded = etp.redundancy - tax_free + etp.excluded;
    // Cents x per cent: whole dollars are 10,000 of them, and a remainder of 5,000 or more rounds up.
    let withheld = |component: u64, cap: u64| {
        let within = component.min(cap);
        let total = u128::from(within) * u128::from(rate)
            + u128::from(component - within) * u128::from(ABOVE_RATE);
        let dollars = total / 10_000 + u128::from(total % 10_000 >= 5_000);
        (within, u64::try_from(dollars * 100).unwrap())
    };
    let (excluded_within, excluded_withheld) = withheld(excluded, ETP_CAP);
    let whole_of_income = WHOLE_OF_INCOME_CAP.saturating_sub(etp.other);
    let cap = (ETP_CAP - excluded_within).min(whole_of_income);
    let (_, non_excluded_withheld) = withheld(etp.non_excluded, cap);
    (
        reached,
        rate,
        [
            limit,
            tax_free,
            excluded,
            excluded_withheld,
            whole_of_income,
            cap,
            non_excluded_withheld,
            excluded_withheld + non_excluded_withheld,
        ],
    )
}

fn etp_case(rng: &mut Seeded) -> (Value, Value) {
    let any_born = (1900 + rng.below(127), 1 + rng.below(12), 1 + rng.below(28));
    let any_years = rng.below(151);
    let any = [
        rng.cents(MAX_PRINCIPAL),
        rng.cents(50_000_000),
        rng.cents(50_000_000),
        rng.cents(30_000_000),
    ];
    let etp = Etp {
        redundancy: rng.pick(&[0, 4_760_300, 4_800_000, any[0]]),
        years: rng.pick(&[0, 1, 5, 40, 150, any_years, any_years]),
        excluded: rng.pick(&[0, 0, ETP_CAP, any[1]]),
        non_excluded: rng.pick(&[0, 5_000, 1_767_800, any[2]]),
        other: rng.pick(&[
            0,
            14_000_000,
            17_999_999,
            WHOLE_OF_INCOME_CAP,
            20_000_000,
            any[3],
        ]),
        born: rng.pick(&[
            (1960, 6, 30),
            (1960, 7, 1),
            (1964, 6, 30),
            (1964, 7, 1),
            (1967, 6, 30),
            (1967, 7, 1),
            (1996, 8, 1),
            any_born,
            any_born,
        ]),
    };
    let (reached, rate, figures) = etp_oracle(etp);
    let names = [
        "taxFreeLimit",
        "taxFree",
        "excluded",
        "excludedWithholding",
        "wholeOfIncomeCap",
        "cap",
        "nonExcludedWithholding",
        "withholding",
    ];
    let mut expected: serde_json::Map<String, Value> = names
        .iter()
        .zip(figures)
        .map(|(name, cents)| ((*name).to_owned(), shown(cents).into()))
        .collect();
    expected.insert("reached".to_owned(), reached.into());
    expected.insert("rate".to_owned(), rate.to_string().into());
    let (year, month, day) = etp.born;
    (
        json!({
            "kind": "etp",
            "payment": {
                "redundancy": dollars(etp.redundancy),
                "years": etp.years.to_string(),
                "excluded": dollars(etp.excluded),
                "nonExcluded": dollars(etp.non_excluded),
                "other": dollars(etp.other),
                "born": format!("{year}-{month:02}-{day:02}"),
            },
            "year": {
                "yearEnd": "2027-06-30",
                "etpCap": "270000",
                "wholeOfIncomeCap": "180000",
                "baseAmount": "13598",
                "serviceAmount": "6801",
                "rateUnder": "32",
                "rateReached": "17",
                "rateAbove": "47",
            },
        }),
        Value::Object(expected),
    )
}

#[test]
fn the_etp_oracle_works_schedule_11s_examples() {
    let none = Etp {
        redundancy: 0,
        years: 0,
        excluded: 0,
        non_excluded: 0,
        other: 0,
        born: (1996, 8, 1),
    };
    // Example 4, Alec, 30: $48,000 after 5 years is $397 over $47,603, withheld $127; the
    // $17,678 gratuity sits within the $40,000 whole-of-income cap, withheld $5,657.
    let alec = Etp {
        redundancy: 4_800_000,
        years: 5,
        non_excluded: 1_767_800,
        other: 14_000_000,
        ..none
    };
    assert_eq!(
        etp_oracle(alec),
        (
            false,
            32,
            [
                4_760_300, 4_760_300, 39_700, 12_700, 4_000_000, 4_000_000, 565_700, 578_400
            ]
        )
    );
    // Example 3, Chris: $120,000 over an $80,000 cap is $25,600 plus $18,800.
    let chris = Etp {
        non_excluded: 12_000_000,
        other: 10_000_000,
        ..none
    };
    assert_eq!(etp_oracle(chris).2[7], 4_440_000);
    // Example 1, Lloyd: 32% of a $45,000 code R ETP is $14,400.
    let lloyd = Etp {
        excluded: 4_500_000,
        ..none
    };
    assert_eq!(etp_oracle(lloyd).2[7], 1_440_000);
    // Born 30 June 1967, 60 on the year's last day: 17% of $50.00 is exactly $8.50, so $9.
    let reached = Etp {
        non_excluded: 5_000,
        born: (1967, 6, 30),
        ..none
    };
    assert_eq!(etp_oracle(reached).2[7], 900);
    assert!(
        !etp_oracle(Etp {
            born: (1967, 7, 1),
            ..reached
        })
        .0
    );
}

#[test]
fn the_etp_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1115_0E7B_0011);
    let (cases, expected): (Vec<Value>, Vec<Value>) =
        (0..ETP_CASES).map(|_| etp_case(&mut rng)).unzip();
    let actual = engines(&cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

const PCG_CASES: usize = 120;

/// One band of PCG 2021/4 Table 1 (paragraph 76) as the table writes it: the lower and upper
/// percentages and whether each is included. `None` is an open end.
type PcgBand = (Option<(u64, bool)>, Option<(u64, bool)>);

/// Table 1, scores 1 to 6 for each factor, in the table's own words: '>90%', '>75% to ≤90%' ...
const PCG_TABLE_1: [[PcgBand; 6]; 3] = [
    [
        (Some((90, false)), None),
        (Some((75, false)), Some((90, true))),
        (Some((60, false)), Some((75, true))),
        (Some((50, true)), Some((60, true))),
        (Some((25, false)), Some((50, false))),
        (None, Some((25, true))),
    ],
    [
        (Some((40, false)), None),
        (Some((35, false)), Some((40, true))),
        (Some((30, true)), Some((35, true))),
        (Some((25, false)), Some((30, false))),
        (Some((20, false)), Some((25, true))),
        (None, Some((20, true))),
    ],
    [
        (Some((200, false)), None),
        (Some((150, false)), Some((200, true))),
        (Some((100, false)), Some((150, true))),
        (Some((90, false)), Some((100, true))),
        (Some((70, false)), Some((90, true))),
        (None, Some((70, true))),
    ],
];

/// The one score whose band holds part / whole as a percentage, compared in exact integers.
fn pcg_band(factor: usize, part: u64, whole: u64) -> u64 {
    let (part, whole) = (u128::from(part) * 100, u128::from(whole));
    let holds = |(lower, upper): PcgBand| {
        lower.is_none_or(|(p, inclusive)| {
            let bound = u128::from(p) * whole;
            if inclusive {
                part >= bound
            } else {
                part > bound
            }
        }) && upper.is_none_or(|(p, inclusive)| {
            let bound = u128::from(p) * whole;
            if inclusive {
                part <= bound
            } else {
                part < bound
            }
        })
    };
    let scores: Vec<u64> = (1..=6)
        .filter(|score| holds(PCG_TABLE_1[factor][*score as usize - 1]))
        .collect();
    assert_eq!(scores.len(), 1, "Table 1 bands overlap or leave a gap");
    scores[0]
}

/// Table 2 (paragraph 78): green, amber or red for an aggregate over 2 factors or all 3.
fn pcg_zone(total: u64, factors: u8) -> &'static str {
    match (factors, total) {
        (2, ..=7) | (3, ..=10) => "green",
        (2, 8) | (3, 11..=12) => "amber",
        _ => "red",
    }
}

/// A percentage to 2 places, half up, as a JavaScript number prints it.
fn pcg_percent(part: u64, whole: u64) -> String {
    let hundredths = half_up(&(BigUint::from(part) * 10_000_u32), &BigUint::from(whole));
    shown(hundredths)
}

/// An amount at an exact percentage of `whole` when one exists in cents, else any amount up to it.
fn pcg_amount(rng: &mut Seeded, whole: u64, percents: &[u64]) -> u64 {
    let percent = rng.pick(percents);
    let exact = whole * percent;
    match rng.below(4) {
        0 => rng.below(whole + 1),
        _ if exact.is_multiple_of(100) => {
            (exact / 100).saturating_add_signed(rng.pick(&[-1, 0, 0, 1]))
        }
        _ => exact / 100,
    }
}

fn pcg_case(rng: &mut Seeded) -> (Value, Value) {
    let entitlement = 1 + rng.cents(MAX_PRINCIPAL - 1);
    let returned = pcg_amount(rng, entitlement, &[0, 25, 50, 60, 75, 90, 100]).min(entitlement);
    let tax = pcg_amount(rng, entitlement, &[0, 20, 25, 30, 35, 40, 100]).min(entitlement);
    let all = rng.below(2) == 1;
    let benchmark = 1 + rng.cents(100_000_000);
    let remuneration = pcg_amount(rng, benchmark, &[70, 90, 100, 150, 200, 300]);
    let arrangement = json!({
        "gateway1": true, "gateway2": true, "entitlement": dollars(entitlement),
        "returned": dollars(returned), "tax": dollars(tax), "factor3": all,
        "remuneration": dollars(remuneration), "benchmark": dollars(benchmark),
    });
    let expected = if returned == entitlement {
        // Paragraph 81: the whole entitlement returned is low risk with no other factor.
        json!({"returned": "100", "factor1": "1", "taxRate": null, "factor2": null,
            "benchmarkShare": null, "factor3": null, "total": null, "zone": "green"})
    } else {
        let (factor1, factor2) = (
            pcg_band(0, returned, entitlement),
            pcg_band(1, tax, entitlement),
        );
        let factor3 = all.then(|| pcg_band(2, remuneration, benchmark));
        let total = factor1 + factor2 + factor3.unwrap_or(0);
        json!({
            "returned": pcg_percent(returned, entitlement), "factor1": factor1.to_string(),
            "taxRate": pcg_percent(tax, entitlement), "factor2": factor2.to_string(),
            "benchmarkShare": all.then(|| pcg_percent(remuneration, benchmark)),
            "factor3": factor3.map(|score| score.to_string()), "total": total.to_string(),
            "zone": pcg_zone(total, if all { 3 } else { 2 }),
        })
    };
    (json!({"kind": "pcg", "arrangement": arrangement}), expected)
}

#[test]
fn the_pcg_oracle_scores_the_guideline_case_studies() {
    // Case study 1: $330,000 of $600,000 is 55%, a 4; $189,367 of tax is 31.56%, a 3; green at 7.
    assert_eq!(
        (pcg_band(0, 330_000, 600_000), pcg_band(1, 189_367, 600_000)),
        (4, 3)
    );
    assert_eq!(pcg_percent(18_936_700, 60_000_000), "31.56");
    // Case study 10: 50% is a 4 and 28.56% a 4, so 8 is amber.
    assert_eq!(pcg_band(1, 114_234, 400_000), 4);
    assert_eq!(pcg_zone(8, 2), "amber");
    // Case study 7: $360,000 against a $350,000 benchmark is 103%, a 3; 10 on all 3 is green.
    assert_eq!(pcg_band(2, 360_000, 350_000), 3);
    assert_eq!(pcg_zone(10, 3), "green");
    assert_eq!(pcg_zone(13, 3), "red");
}

#[test]
fn the_pcg_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1115_0FC6_2021);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..PCG_CASES).map(|_| pcg_case(&mut rng)).unzip();
    let actual = engines(&cases);
    assert_eq!(actual.len(), PCG_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

const PCG_ALLOCATION_CASES: usize = 120;

/// The resident scales as the ATO's 'Tax rates – Australian residents' page writes them (last
/// updated 13 August 2026, read 17 November 2026): each band's top dollar and its cents in the
/// dollar over the band below, in hundredths of a cent. No base amount is typed here; the oracle
/// adds each band's slice, where the engine takes the site's base amount plus the top band's rate.
const PCG_SCALES: [(&str, [(u64, u64); 5]); 6] = [
    (
        "2026-27",
        [
            (18_200, 0),
            (45_000, 1_500),
            (135_000, 3_000),
            (190_000, 3_700),
            (u64::MAX, 4_500),
        ],
    ),
    (
        "2025-26",
        [
            (18_200, 0),
            (45_000, 1_600),
            (135_000, 3_000),
            (190_000, 3_700),
            (u64::MAX, 4_500),
        ],
    ),
    (
        "2024-25",
        [
            (18_200, 0),
            (45_000, 1_600),
            (135_000, 3_000),
            (190_000, 3_700),
            (u64::MAX, 4_500),
        ],
    ),
    (
        "2023-24",
        [
            (18_200, 0),
            (45_000, 1_900),
            (120_000, 3_250),
            (180_000, 3_700),
            (u64::MAX, 4_500),
        ],
    ),
    (
        "2022-23",
        [
            (18_200, 0),
            (45_000, 1_900),
            (120_000, 3_250),
            (180_000, 3_700),
            (u64::MAX, 4_500),
        ],
    ),
    (
        "2020-21",
        [
            (18_200, 0),
            (45_000, 1_900),
            (120_000, 3_250),
            (180_000, 3_700),
            (u64::MAX, 4_500),
        ],
    ),
];

/// A company's rate for the year in hundredths of a per cent, from the ATO's company tax rate
/// pages (26% for a base rate entity in 2020-21, 25% from 2022-23) and Income Tax Rates Act 1986
/// s 23(2) for 2026-27; 30% otherwise.
fn pcg_company_rate(year: &str, base_rate_entity: bool) -> u64 {
    match (year, base_rate_entity) {
        ("2020-21", true) => 2_600,
        (_, true) => 2_500,
        (_, false) => 3_000,
    }
}

/// Tax in cents on a taxable income in cents: every band's slice of the income at its rate,
/// summed exactly, then half up to the cent once.
fn pcg_scale_tax(year: &str, income: i128) -> u64 {
    let Ok(income) = u64::try_from(income) else {
        return 0;
    };
    let (_, bands) = PCG_SCALES.iter().find(|(name, _)| *name == year).unwrap();
    let (mut exact, mut below) = (0_u128, 0_u64);
    for (top, rate) in bands {
        let top = top.saturating_mul(100);
        if income > below {
            exact += u128::from(income.min(top) - below) * u128::from(*rate);
        }
        below = top;
    }
    half_up(&BigUint::from(exact), &BigUint::from(10_000_u32))
}

/// The tax paragraph 85 counts for one recipient and the subparagraph that gives it: the larger
/// of (a) the tax on the firm income less firm-related deductions alone and (b) the tax on all
/// income less the tax without the firm amounts, with (a) named when they are equal.
fn pcg_counted(
    tax: &dyn Fn(i128) -> u64,
    firm: u64,
    deductions: u64,
    other: i64,
) -> (u64, &'static str) {
    let net = i128::from(firm) - i128::from(deductions);
    let alone = tax(net.max(0));
    let difference = i128::from(tax((net + i128::from(other)).max(0)))
        - i128::from(tax(i128::from(other).max(0)));
    if difference > i128::from(alone) {
        (u64::try_from(difference).unwrap(), "85(b)")
    } else {
        (alone, "85(a)")
    }
}

fn signed_dollars(cents: i64) -> String {
    let magnitude = dollars(cents.unsigned_abs());
    if cents < 0 {
        format!("-{magnitude}")
    } else {
        magnitude
    }
}

fn pcg_allocation_case(rng: &mut Seeded) -> (Value, Value) {
    let year = rng.pick(&PCG_SCALES.map(|(name, _)| name));
    let used = 1 + rng.below(6) as usize;
    let mut recipients = Vec::new();
    let mut taxes = Vec::new();
    let (mut firm_income, mut total_tax, mut ipp_firm) = (0_u64, 0_u64, 0_u64);
    for index in 0..6 {
        if index >= used {
            recipients.push(json!({"kind": "none", "firm": "0", "deductions": "0", "other": "0"}));
            taxes.push(Value::Null);
            continue;
        }
        let kind = if index == 0 {
            "individual"
        } else {
            rng.pick(&["individual", "base-rate-company", "company"])
        };
        let firm = 1 + rng.cents(100_000_000);
        let deductions = if rng.below(3) == 0 {
            rng.cents(firm)
        } else {
            0
        };
        let other = match rng.below(4) {
            0 => i64::try_from(rng.cents(50_000_000)).unwrap(),
            1 => -i64::try_from(rng.cents(50_000_000)).unwrap(),
            _ => 0,
        };
        let tax = |income: i128| match kind {
            "individual" => pcg_scale_tax(year, income),
            _ => {
                let rate = pcg_company_rate(year, kind == "base-rate-company");
                half_up(
                    &BigUint::from(u64::try_from(income).unwrap() * rate),
                    &BigUint::from(10_000_u32),
                )
            }
        };
        let (counted, rule) = pcg_counted(&tax, firm, deductions, other);
        if index == 0 {
            ipp_firm = firm;
        }
        firm_income += firm;
        total_tax += counted;
        taxes.push(json!(format!("{}:{rule}", shown(counted))));
        recipients.push(
            json!({"kind": kind, "firm": dollars(firm), "deductions": dollars(deductions),
            "other": signed_dollars(other)}),
        );
    }
    let all = rng.below(2) == 1;
    let benchmark = 1 + rng.cents(100_000_000);
    let arrangement = json!({"gateway1": true, "gateway2": true, "factor3": all, "benchmark": dollars(benchmark),
        "recipients": recipients});
    let mut expected =
        json!({"taxes": taxes, "firmIncome": shown(firm_income), "tax": shown(total_tax)});
    let scores = if ipp_firm == firm_income {
        // Paragraph 81: the whole entitlement returned is low risk with no other factor.
        json!({"returned": "100", "factor1": "1", "taxRate": null, "factor2": null,
            "benchmarkShare": null, "factor3": null, "total": null, "zone": "green"})
    } else {
        let (factor1, factor2) = (
            pcg_band(0, ipp_firm, firm_income),
            pcg_band(1, total_tax, firm_income),
        );
        let factor3 = all.then(|| pcg_band(2, ipp_firm, benchmark));
        let total = factor1 + factor2 + factor3.unwrap_or(0);
        json!({
            "returned": pcg_percent(ipp_firm, firm_income), "factor1": factor1.to_string(),
            "taxRate": pcg_percent(total_tax, firm_income), "factor2": factor2.to_string(),
            "benchmarkShare": all.then(|| pcg_percent(ipp_firm, benchmark)),
            "factor3": factor3.map(|score| score.to_string()), "total": total.to_string(),
            "zone": pcg_zone(total, if all { 3 } else { 2 }),
        })
    };
    expected
        .as_object_mut()
        .unwrap()
        .extend(scores.as_object().unwrap().clone());
    (
        json!({"kind": "pcgAllocation", "arrangement": arrangement, "year": year}),
        expected,
    )
}

#[test]
fn the_pcg_allocation_oracle_works_the_guideline_examples() {
    let individual = |income: i128| pcg_scale_tax("2020-21", income);
    // Example 4: $240,667 on $600,000 and $22,967 on $100,000; associate 2 counts $33,850 under 85(b).
    assert_eq!(individual(60_000_000), 24_066_700);
    assert_eq!(
        pcg_counted(&individual, 10_000_000, 0, 5_000_000),
        (3_385_000, "85(b)")
    );
    assert_eq!(
        pcg_counted(&individual, 10_000_000, 0, -10_000_000),
        (2_296_700, "85(a)")
    );
    // Example 5: $238,450 under 85(b), from a $40,000 deduction and $50,000 of other income.
    assert_eq!(
        pcg_counted(&individual, 60_000_000, 4_000_000, 5_000_000),
        (23_845_000, "85(b)")
    );
    // Case study 1: 26% of $270,000 is $70,200; 2026-27: $4,020 on $45,000.
    assert_eq!(pcg_company_rate("2020-21", true) * 270_000 / 10_000, 70_200);
    assert_eq!(pcg_scale_tax("2026-27", 4_500_000), 402_000);
}

#[test]
fn the_pcg_allocation_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1117_0FC6_2021);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..PCG_ALLOCATION_CASES)
        .map(|_| pcg_allocation_case(&mut rng))
        .unzip();
    let actual = engines(&cases);
    assert_eq!(actual.len(), PCG_ALLOCATION_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

const GIC_CASES: usize = 120;

/// Days since 1 January 1970 of a Gregorian calendar date (Howard Hinnant's days_from_civil).
fn day_number(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let of_era = year - era * 400;
    let of_year = (153 * ((month + 9) % 12) + 2) / 5 + day - 1;
    era * 146_097 + of_era * 365 + of_era / 4 - of_era / 100 + of_year - 719_468
}

/// The year, month and day of a day number (civil_from_days).
fn civil(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let of_era = shifted - era * 146_097;
    let year_of_era = (of_era - of_era / 1460 + of_era / 36_524 - of_era / 146_096) / 365;
    let of_year = of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * of_year + 2) / 153;
    let day = of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = if shifted_month < 10 {
        shifted_month + 3
    } else {
        shifted_month - 9
    };
    (year_of_era + era * 400 + i64::from(month <= 2), month, day)
}

fn iso_day(days: i64) -> String {
    let (year, month, day) = civil(days);
    format!("{year:04}-{month:02}-{day:02}")
}

fn parse_iso(text: &str) -> i64 {
    let parts: Vec<i64> = text.split('-').map(|part| part.parse().unwrap()).collect();
    day_number(parts[0], parts[1], parts[2])
}

/// Each quarter's first and last day and its annual rate in hundredths of 1%, read from the
/// published CSV rather than the engine's copy.
fn gic_quarters() -> Vec<(i64, i64, u64)> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../rates/general-interest-charge/general-interest-charge-rates.csv");
    let csv = std::fs::read_to_string(path).unwrap();
    csv.lines()
        .skip(1)
        .map(|line| {
            let cells: Vec<&str> = line.split(',').collect();
            let (whole, part) = cells[2].split_once('.').unwrap();
            assert_eq!(part.len(), 2, "{line}");
            let rate = whole.parse::<u64>().unwrap() * 100 + part.parse::<u64>().unwrap();
            (parse_iso(cells[0]), parse_iso(cells[1]), rate)
        })
        .collect()
}

/// Instalment days: every 7 or 14 days, or the same day of each month, or the month's last day.
fn gic_instalment_days(start: i64, count: u64, frequency: &str) -> Vec<i64> {
    let (year, month, day) = civil(start);
    (0..i64::try_from(count).unwrap())
        .map(|k| match frequency {
            "weekly" => start + 7 * k,
            "fortnightly" => start + 14 * k,
            _ => {
                let months = year * 12 + month - 1 + k;
                let (y, m) = (months.div_euclid(12), months.rem_euclid(12) + 1);
                let length = day_number(y + m / 12, m % 12 + 1, 1) - day_number(y, m, 1);
                day_number(y, m, day.min(length))
            }
        })
        .collect()
}

/// The equal instalment and the final instalment in cents, and the days at the assumed rate.
fn gic_oracle(
    quarters: &[(i64, i64, u64)],
    debt: u64,
    days: &[i64],
    assumed: u64,
) -> (u64, u64, u64) {
    let table_end = quarters.iter().map(|quarter| quarter.1).max().unwrap();
    let (start, last) = (days[0], days[days.len() - 1]);
    // Each day's growth as (10,000 x days in its year + rate) over 10,000 x days in its year.
    let growth: Vec<(u64, u64)> = (start..last)
        .map(|day| {
            let rate = if day > table_end {
                assumed
            } else {
                quarters
                    .iter()
                    .find(|q| q.0 <= day && day <= q.1)
                    .unwrap()
                    .2
            };
            let year = civil(day).0;
            let length = day_number(year + 1, 1, 1) - day_number(year, 1, 1);
            let base = 10_000 * u64::try_from(length).unwrap();
            (base + rate, base)
        })
        .collect();
    let splits: Vec<usize> = days
        .iter()
        .map(|day| usize::try_from(day - start).unwrap())
        .collect();
    // An instalment's discount factor is the product of base / (base + rate) over the days
    // before it. Over the product of every (base + rate), that is the bases before it times
    // the (base + rate) terms from its day on.
    let mut from_day = vec![BigUint::ZERO; splits.len()];
    let (mut all, mut index) = (BigUint::from(1_u8), growth.len());
    for (split, slot) in splits.iter().zip(from_day.iter_mut()).rev() {
        while index > *split {
            index -= 1;
            all *= growth[index].0;
        }
        *slot = all.clone();
    }
    let (mut factors, mut before, mut index) = (BigUint::ZERO, BigUint::from(1_u8), 0);
    for (split, after) in splits.iter().zip(&from_day) {
        while index < *split {
            before *= growth[index].1;
            index += 1;
        }
        factors += &before * after;
    }
    let instalment: u64 = (BigUint::from(debt) * &all / &factors).try_into().unwrap();
    // The balance carried day by day: each instalment but the last is paid on its day, before
    // that day's GIC; the final instalment is what is left on the last day.
    let (mut numerator, mut denominator) = (BigUint::from(debt), BigUint::from(1_u8));
    let mut index = 0;
    for (k, split) in splits.iter().enumerate() {
        while index < *split {
            numerator *= growth[index].0;
            denominator *= growth[index].1;
            index += 1;
        }
        if k + 1 < splits.len() {
            numerator -= BigUint::from(instalment) * &denominator;
        }
    }
    let assumed_days = (start..last).filter(|day| *day > table_end).count();
    (
        instalment,
        half_up(&numerator, &denominator),
        assumed_days as u64,
    )
}

fn gic_case(rng: &mut Seeded, quarters: &[(i64, i64, u64)]) -> (Value, Value) {
    let debt = 1 + rng.cents(MAX_PRINCIPAL - 1);
    let first = day_number(1999, 7, 1);
    let span = u64::try_from(day_number(2028, 1, 1) - first).unwrap();
    let start = first + i64::try_from(rng.below(span)).unwrap();
    let any_count = 1 + rng.below(120);
    let count = rng.pick(&[1, 2, 3, 12, 120, any_count, any_count]);
    let frequency = rng.pick(&["weekly", "fortnightly", "monthly"]);
    let any_rate = 1 + rng.below(10_000);
    let assumed = rng.pick(&[1151, 900, any_rate]);
    let days = gic_instalment_days(start, count, frequency);
    let (instalment, last, assumed_days) = gic_oracle(quarters, debt, &days, assumed);
    let total = instalment * (count - 1) + last;
    let plan = json!({
        "debt": dollars(debt), "start": iso_day(start), "count": count.to_string(),
        "frequency": frequency, "assumedRate": format!("{}.{:02}", assumed / 100, assumed % 100),
    });
    let expected = json!({
        "instalment": shown(instalment), "final": shown(last), "totalPaid": shown(total),
        "gic": shown(total - debt), "lastDate": iso_day(days[days.len() - 1]),
        "assumedDays": assumed_days.to_string(),
    });
    (json!({"kind": "gic", "plan": plan}), expected)
}

#[test]
fn the_gic_oracle_works_the_hand_worked_plan() {
    let quarters = gic_quarters();
    assert_eq!(quarters.len(), 110);
    assert_eq!(
        (iso_day(quarters[0].0), quarters[0].2),
        ("2026-10-01".to_owned(), 1151)
    );
    let days = gic_instalment_days(day_number(2026, 10, 1), 3, "monthly");
    let shown_days: Vec<String> = days.iter().map(|day| iso_day(*day)).collect();
    assert_eq!(shown_days, ["2026-10-01", "2026-11-01", "2026-12-01"]);
    // $1,000 by 3 monthly instalments at 11.51%: $336.56, $336.56 and a final $336.56.
    assert_eq!(
        gic_oracle(&quarters, 100_000, &days, 1151),
        (33_656, 33_656, 0)
    );
    // 31 January falls back to 29 February in a leap year and 28 February otherwise.
    let leap = gic_instalment_days(day_number(2024, 1, 31), 2, "monthly");
    let ordinary = gic_instalment_days(day_number(2026, 1, 31), 2, "monthly");
    assert_eq!(
        (iso_day(leap[1]), iso_day(ordinary[1])),
        ("2024-02-29".to_owned(), "2026-02-28".to_owned())
    );
}

#[test]
fn the_gic_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let quarters = gic_quarters();
    let mut rng = Seeded(0x2026_1115_061C_8AAC);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..GIC_CASES)
        .map(|_| gic_case(&mut rng, &quarters))
        .unzip();
    let actual = engines(&cases);
    assert_eq!(actual.len(), GIC_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the Division 296 engine, as `HARNESS` runs the others.
const DIVISION_296_HARNESS: &str = r"
import { division296 } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const year = { largeThreshold: '3000000', veryLargeThreshold: '10000000', rate: '15', veryLargeRate: '10' };
const run = ({ member }) => Object.fromEntries(Object.entries(division296(member, year))
  .map(([key, value]) => [key, String(value)]));
process.stdout.write(JSON.stringify(JSON.parse(input).map(run)));
";

const DIVISION_296_CASES: usize = 240;
/// ITAA 1997 ss 296-30(a) and 296-35(a), for 2026-27, in cents.
const LARGE_THRESHOLD: u64 = 300_000_000;
const VERY_LARGE_THRESHOLD: u64 = 1_000_000_000;

/// The share of `balance` above `threshold` in hundredths of 1%, read as ss 296-40(3) and
/// 296-45(3) write it: the percentage to 3 decimal places, then up when that third place is 5 or
/// more and down otherwise. Nil unless the balance is greater than the threshold.
fn division_296_share(balance: u64, threshold: u64) -> u64 {
    if balance <= threshold {
        return 0;
    }
    let thousandths = (u128::from(balance - threshold) * 100_000) / u128::from(balance);
    let third = thousandths % 10;
    u64::try_from(thousandths / 10 + u128::from(third >= 5)).unwrap()
}

/// An exact amount in cents over `scale`, half up, as a JavaScript number prints it, or the
/// same for its magnitude with a minus sign.
fn division_296_shown(value: i128, scale: i128) -> String {
    let cents = (2 * value.abs() + scale) / (2 * scale);
    shown_signed(if value < 0 { -cents } else { cents })
}

/// What the engine must return: the liability, both shares, taxable superannuation earnings,
/// the very large component, the 2 taxes and the total. `earnings` is in signed cents; the
/// flags are a child recipient, a structured settlement contribution and death by 30 June 2027.
fn division_296_oracle(
    balance: u64,
    earnings: i128,
    [child, settlement, died]: [bool; 3],
) -> Value {
    // ITTPA s 296-1(2): the balance at the end of 2026-27 only; s 296-50: nil after death.
    let reference = if died { 0 } else { balance };
    let share = division_296_share(reference, LARGE_THRESHOLD);
    let very_large_share = division_296_share(reference, VERY_LARGE_THRESHOLD);
    let liability = if child {
        "child"
    } else if settlement {
        "settlement"
    } else if died {
        "died"
    } else if reference <= LARGE_THRESHOLD {
        "not-above"
    } else if earnings <= 0 {
        "no-earnings"
    } else if share == 0 {
        "rounds-to-nil"
    } else {
        "liable"
    };
    // s 296-40(1)(b): taxable superannuation earnings need earnings greater than nil.
    let taxable = if earnings > 0 {
        earnings * i128::from(share)
    } else {
        0
    };
    let component = earnings * i128::from(very_large_share);
    let liable = matches!(liability, "liable" | "rounds-to-nil");
    // Imposition Act s 5: 15% and 10%, here in hundredths of 1% over the share's 10,000.
    let tax = if liable { taxable * 1_500 } else { 0 };
    let further = if liable { component.max(0) * 1_000 } else { 0 };
    json!({
        "liability": liability,
        "percentage": shown(share),
        "veryLargePercentage": shown(very_large_share),
        "taxable": division_296_shown(taxable, 10_000),
        // s 296-45(1) has no 'greater than nil' condition, so the component keeps the sign.
        "component": division_296_shown(component, 10_000),
        "tax": division_296_shown(tax, 100_000_000),
        "veryLargeTax": division_296_shown(further, 100_000_000),
        "total": division_296_shown(tax + further, 100_000_000),
    })
}

fn division_296_case(rng: &mut Seeded) -> (Value, Value) {
    // Balances either side of each threshold, at it and anywhere up to the largest field.
    let near = |rng: &mut Seeded, threshold: u64| threshold - 50_000 + rng.below(100_001);
    let balance = match rng.below(5) {
        0 => near(rng, LARGE_THRESHOLD),
        1 => near(rng, VERY_LARGE_THRESHOLD),
        2 => rng.pick(&[LARGE_THRESHOLD, VERY_LARGE_THRESHOLD, 0, MAX_PRINCIPAL]),
        _ => rng.cents(MAX_PRINCIPAL),
    };
    let magnitude = i128::from(rng.cents(MAX_PRINCIPAL));
    let earnings = if rng.below(4) == 0 {
        -magnitude
    } else {
        magnitude
    };
    let flags = [0, 1, 2].map(|_| rng.below(12) == 0);
    let member = json!({
        "balance": dollars(balance),
        "earnings": format!("{}{}", if earnings < 0 { "-" } else { "" }, dollars(u64::try_from(earnings.unsigned_abs()).unwrap())),
        "child": flags[0], "settlement": flags[1], "died": flags[2],
    });
    (
        json!({"member": member}),
        division_296_oracle(balance, earnings, flags),
    )
}

/// Runs the Division 7A schedule engine, as `HARNESS` runs the others.
const DIV7A_SCHEDULE_HARNESS: &str = r"
import { div7aSchedule } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const text = (value) => (value === null ? null : String(value));
const texts = (record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, text(value)]));
const run = ({ loan }) => {
  const { years, ...summary } = div7aSchedule(loan);
  return { ...texts(summary), years: years.map(texts) };
};
process.stdout.write(JSON.stringify(JSON.parse(input).map(run)));
";

const DIV7A_SCHEDULE_CASES: usize = 200;
/// The ATO's benchmark rates in hundredths of 1%, by the calendar year each income year starts
/// in, typed from 'Division 7A – benchmark interest rate' (last updated 1 July 2026, read
/// 17 November 2026), not from the engine or the site's table.
const ATO_BENCHMARK: [(i32, u64); 6] = [
    (2021, 452),
    (2022, 477),
    (2023, 827),
    (2024, 877),
    (2025, 837),
    (2026, 877),
];

fn income_year(start: i32) -> String {
    format!("{start}-{:02}", (start + 1) % 100)
}

fn hundredths(rate: u64) -> String {
    format!("{}.{:02}", rate / 100, rate % 100)
}

/// A year's interest in cents on `opening` at `rate` hundredths of 1% for the income year
/// starting 1 July of `start`, with `repayment` made on 30 June: the opening balance from 1 July
/// to 29 June, then the balance the repayment leaves for that day, each period half up to the
/// cent over the year's calendar days; one period when nothing is repaid.
fn div7a_year_interest(opening: u64, rate: u64, start: i32, repayment: u64) -> u64 {
    let july = |year: i32| date(i16::try_from(year).unwrap(), 7, 1);
    let days = u128::try_from((july(start + 1) - july(start)).get_days()).unwrap();
    let whole = u128::from(opening) * u128::from(rate);
    let part = if repayment == 0 {
        exact_half_up(whole, 10_000)
    } else {
        exact_half_up(whole * (days - 1), 10_000 * days)
            + exact_half_up(
                u128::from(opening.saturating_sub(repayment)) * u128::from(rate),
                10_000 * days,
            )
    };
    u64::try_from(part).unwrap()
}

/// One seeded loan and its schedule: the repayments are chosen a year at a time against the
/// minimum the oracle works for that year, so short, extra and final repayments all appear.
/// Each year's minimum comes from `div7a_oracle`, which sums discount factors, and its days
/// from the calendar; a repayment meets the interest first, interest it leaves unpaid adds to the
/// balance, and the dividend that funds it is
/// the repayment grossed up for tax at the marginal rate, less the franking credit, rounded up.
fn div7a_schedule_case(rng: &mut Seeded) -> (Value, Value) {
    let (first, last) = (date(2020, 7, 1), date(2027, 6, 30));
    let span = u64::try_from((last - first).get_days()).unwrap();
    let any_day = first + i64::try_from(rng.below(span + 1)).unwrap().days();
    let made = rng.pick(&[first, last, any_day, any_day, any_day]);
    let year_made = i32::from(if made.month() >= 7 {
        made.year()
    } else {
        made.year() - 1
    });
    let amount = 1 + rng.cents(MAX_PRINCIPAL - 1);
    let term = rng.pick(&[7_u32, 7, 25]);
    let any_rate = 1 + rng.below(2_000);
    let assumed = rng.pick(&[877, 877, 1, 10_000, any_rate]);
    let any_marginal = rng.below(10_000);
    let marginal = rng.pick(&[
        None,
        None,
        Some(0),
        Some(3_000),
        Some(4_700),
        Some(9_999),
        Some(any_marginal),
    ]);
    let (franking, corporate) = rng.pick(&[("unfranked", 0_u64), ("30", 3_000), ("25", 2_500)]);
    let (mut opening, mut repaid, mut charged) = (amount, 0_u64, 0_u64);
    let (mut entries, mut years) = (Vec::new(), Vec::new());
    let mut projected_from = Value::Null;
    for k in 1..=term {
        let start = year_made + i32::try_from(k).unwrap();
        let published = ATO_BENCHMARK
            .iter()
            .find(|(year, _)| *year == start)
            .map(|&(_, rate)| rate);
        let rate = published.unwrap_or(assumed);
        if published.is_none() && projected_from.is_null() {
            projected_from = json!(income_year(start));
        }
        let remaining = term - k + 1;
        let [minimum, _, _] = div7a_oracle(opening, rate, remaining);
        let interest_on = |repayment| div7a_year_interest(opening, rate, start, repayment);
        let payoff = opening + interest_on(opening);
        let due = minimum.min(payoff);
        let chosen = match rng.below(10) {
            5 | 6 if payoff > due + 1 => Some(due + 1 + rng.cents(payoff - due - 1)),
            7 if due > 0 => Some(rng.below(due)),
            8 => Some(payoff),
            9 => Some(due),
            _ => None,
        }
        .filter(|&value| value <= MAX_PRINCIPAL);
        entries.push(chosen.map_or_else(String::new, dollars));
        let repayment = chosen.unwrap_or(due);
        let interest = interest_on(repayment);
        // The amount not repaid is the opening balance plus the interest less the repayment, so
        // interest left unpaid adds to it and the principal is negative.
        let closing = opening + interest - repayment;
        let principal = i128::from(repayment) - i128::from(interest);
        let shortfall = if closing > 0 {
            minimum.saturating_sub(repayment)
        } else {
            0
        };
        let funding = marginal.map(|m| {
            let top = u128::from(repayment) * u128::from(10_000 - corporate);
            json!(shown(
                u64::try_from(top.div_ceil(u128::from(10_000 - m))).unwrap()
            ))
        });
        years.push(json!({
            "year": income_year(start), "rate": shown(rate), "projected": published.is_none().to_string(),
            "remainingTerm": remaining.to_string(), "opening": shown(opening), "minimum": shown(minimum),
            "repayment": shown(repayment), "interest": shown(interest), "principal": shown_signed(principal),
            "closing": shown(closing), "shortfall": shown(shortfall),
            "funding": funding.unwrap_or(Value::Null),
        }));
        (opening, repaid, charged) = (closing, repaid + repayment, charged + interest);
        if shortfall > 0 || opening == 0 {
            break;
        }
    }
    // Blank entries at the end mean the minimum, as no entry does.
    if rng.below(2) == 0 {
        while entries.last().is_some_and(String::is_empty) {
            entries.pop();
        }
    }
    let last_year = years.last().unwrap().clone();
    let loan = json!({
        "made": made.strftime("%Y-%m-%d").to_string(), "amount": dollars(amount), "term": term.to_string(),
        "assumedRate": hundredths(assumed), "repayments": entries.join("; "),
        "marginalRate": marginal.map_or_else(String::new, hundredths), "franking": franking,
        "lodgment": false, "refinanced": false, "interposed": false,
    });
    let expected = json!({
        "firstMinimum": years[0]["minimum"], "totalRepaid": shown(repaid), "totalInterest": shown(charged),
        "lastYear": last_year["year"], "closing": last_year["closing"], "shortfall": last_year["shortfall"],
        "projectedFrom": projected_from, "years": years,
    });
    (json!({ "loan": loan }), expected)
}

#[test]
fn the_div7a_schedule_oracle_charges_30_june_on_the_reduced_balance() {
    // $100,000 at 8.27% for 2023-24, which holds 29 February: 365 of 366 days give $8,247.40,
    // and 30 June on the $80,615.04 left after the $19,384.96 minimum gives $18.22.
    assert_eq!(div7a_oracle(10_000_000, 827, 7)[0], 1_938_496);
    assert_eq!(
        div7a_year_interest(10_000_000, 827, 2023, 1_938_496),
        826_562
    );
    assert_eq!(div7a_year_interest(10_000_000, 827, 2023, 0), 827_000);
    // 2024-25 has 365 days: $88,880.66 at 8.77% is $7,773.48 for 364, then $20.15 on $83,880.66.
    assert_eq!(div7a_year_interest(8_888_066, 877, 2024, 500_000), 779_363);
}

#[test]
fn the_div7a_schedule_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1117_0000_7a7a);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..DIV7A_SCHEDULE_CASES)
        .map(|_| div7a_schedule_case(&mut rng))
        .unzip();
    let actual = run_node(DIV7A_SCHEDULE_HARNESS, &cases);
    assert_eq!(actual.len(), DIV7A_SCHEDULE_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

const VEHICLE_CASES: usize = 240;

/// Each year, its car limit and its LCT thresholds for fuel-efficient and other vehicles, in
/// dollars, from the ATO's 'Car thresholds from 1 July' (QC 107449) and 'Luxury car tax rate and
/// thresholds' (QC 38161), both read 16 November 2026.
const VEHICLE_YEARS: [(&str, u64, u64, u64); 2] = [
    ("2026-27", 69_883, 91_661, 80_809),
    ("2025-26", 69_674, 91_387, 80_567),
];

/// MT 2024 paragraph 15 and LCTD 2023/1 paragraph 55: 68 kg for each seat, the driver's included.
const KG_A_SEAT: u64 = 68;

const OTHER_BODY: &str = "Whether this body was designed principally to carry passengers turns on its \
    appearance, marketing and specifications (TD 94/19), which this page does not weigh.";

/// A vehicle as the oracle sees it: the designed load and the accessories fitted at supply in kg,
/// and the price in cents.
struct Vehicle {
    body: &'static str,
    seats: u64,
    load: u64,
    accessories: u64,
    price: u64,
    full_credit: bool,
    limited_use: bool,
}

/// What the engine must return for a vehicle at a car limit and an LCT threshold in dollars.
fn vehicle_oracle(v: &Vehicle, limit: u64, threshold: u64) -> Value {
    let (limit, threshold) = (limit * 100, threshold * 100);
    let motor = v.body != "motorcycle";
    // ITAA 1997 s 995-1: a load under 1 tonne and fewer than 9 passengers; LCT Act s 27-1: under 2 tonnes.
    let car = motor && v.load < 1_000 && v.seats < 9;
    let lct_car = motor && v.load < 2_000 && v.seats < 9;
    // The seats against half the load: more than half, they outweigh what is left (MT 2024
    // paragraph 16); less than half the load at supply, accessories then fitted taken off, LCTD
    // 2023/1 paragraphs 55 and 56 take a ute as commercial.
    let twice_seats = 2 * v.seats * KG_A_SEAT;
    let passengers = match v.body {
        _ if !car => None,
        "other" => return json!({"refused": OTHER_BODY}),
        "dual-cab" => Some(twice_seats > v.load),
        "passenger" => Some(true),
        // TD 94/19 leaves a single cab ute or panel van to factors the page does not weigh.
        _ => None,
    };
    let design = lct_car.then(|| match v.body {
        "passenger" => "passengers",
        "van" => "commercial",
        "single-cab" | "dual-cab" if twice_seats < v.load - v.accessories => "commercial",
        _ => "undetermined",
    });
    let luxury = match design {
        None => "not-a-car",
        Some(_) if v.price <= threshold => "under",
        Some("passengers") => "over",
        Some(other) => other,
    };
    // GST Act s 69-10(4)(a): no cap for a car LCT Act s 25-1(2) keeps from being a luxury car,
    // which LCTD 2023/1's compliance approach does not decide (paragraph 59): only a passenger
    // body is settled.
    let cap_applies = match design {
        _ if !car => Some(false),
        Some("passengers") => Some(true),
        _ => None,
    };
    let eleventh = |cents: u64| half_up(&BigUint::from(cents), &BigUint::from(11_u8));
    let credit = match cap_applies {
        _ if !v.full_credit => Some(0),
        None if v.price > limit => None,
        Some(true) => Some(eleventh(v.price).min(eleventh(limit))),
        _ => Some(eleventh(v.price)),
    };
    // s 40-230: no ATO ruling applies MT 2024's dual cab test to the car limit, so only a
    // passenger body is settled. TD 2006/40: the cost less the credit, then no more than the limit;
    // a cost within the limit is the same whether or not the limit applies.
    let car_limit = match v.body {
        _ if !car => Some(false),
        "passenger" => Some(true),
        _ => None,
    };
    let cost = credit.and_then(|credit| {
        let net = v.price - credit;
        match car_limit {
            Some(true) => Some(net.min(limit)),
            None if net <= limit => Some(net),
            _ => None,
        }
    });
    let fbt = match v.body {
        _ if !car => "47(6)",
        "single-cab" | "van" => "8(2)(a)(i)",
        _ if passengers == Some(true) => "car-benefit",
        _ => "8(2)(a)(ii)",
    };
    json!({
        "load": v.load.to_string(), "car": car, "passengers": passengers,
        "carLimit": car_limit,
        "capApplies": cap_applies,
        "cap": (cap_applies == Some(true)).then(|| shown(eleventh(limit))),
        "credit": credit.map(shown), "cost": cost.map(shown), "luxury": luxury,
        "threshold": shown(threshold),
        "over": (luxury == "over").then(|| shown(v.price - threshold)),
        "fbt": fbt, "exempt": fbt != "car-benefit" && v.limited_use,
        "belowThreshold": v.price < threshold,
    })
}

/// A vehicle near the edges the law sets: the load beside 1 and 2 tonnes or twice the seats'
/// weight, and the price beside the car limit or the LCT threshold.
fn vehicle_case(rng: &mut Seeded) -> (Value, Value) {
    let body = rng.pick(&[
        "passenger",
        "single-cab",
        "dual-cab",
        "dual-cab",
        "van",
        "other",
        "motorcycle",
    ]);
    let any_seats = 1 + rng.below(20);
    let seats = rng.pick(&[1, 2, 3, 5, 5, 7, 8, 9, any_seats]);
    let any_load = 1 + rng.below(3_000);
    let near = rng.pick(&[999, 1_000, 1_999, 2_000, 2 * seats * KG_A_SEAT, any_load]);
    let load = near.saturating_add_signed(rng.pick(&[-1, 0, 0, 1])).max(1);
    // None, any weight below the load, or the weight that leaves the seats exactly half the load.
    let any_accessories = rng.below(load);
    let accessories = rng.pick(&[
        0,
        0,
        any_accessories,
        load.saturating_sub(2 * seats * KG_A_SEAT),
    ]);
    let kerb = 1 + rng.below(3_000);
    let (year, limit, efficient, other) = rng.pick(&VEHICLE_YEARS);
    let fuel_efficient = rng.below(2) == 1;
    let threshold = if fuel_efficient { efficient } else { other };
    let any_price = 1 + rng.cents(20_000_000);
    let edge = rng.pick(&[limit, threshold]) * 100;
    let price = rng.pick(&[edge - 1, edge, edge + 1, any_price, any_price]);
    let full_credit = rng.below(4) != 0;
    let limited_use = rng.below(2) == 1;
    // The kerb weight, the payload, or both, which agree.
    let (kerb_field, payload_field) = match rng.below(3) {
        0 => (kerb, 0),
        1 => (0, load),
        _ => (kerb, load),
    };
    let vehicle = json!({
        "body": body, "seats": seats.to_string(), "gvm": (kerb + load).to_string(),
        "kerb": kerb_field.to_string(), "payload": payload_field.to_string(),
        "accessories": accessories.to_string(),
        "modified": rng.pick(&["no", "no", "plated"]), "cost": dollars(price),
        "credit": if full_credit { "full" } else { "none" },
        "fuel": if fuel_efficient { "efficient" } else { "other" },
        "use": if limited_use { "limited" } else { "other" },
    });
    let v = Vehicle {
        body,
        seats,
        load,
        accessories,
        price,
        full_credit,
        limited_use,
    };
    (
        json!({"kind": "vehicle", "vehicle": vehicle, "year": year}),
        vehicle_oracle(&v, limit, threshold),
    )
}

#[test]
fn the_division_296_oracle_works_the_explanatory_memorandums_examples() {
    // Example 1.1, Jordan: $4 million, $100,000 of earnings, 25%, $25,000 taxed at 15%, $3,750.
    let jordan = division_296_oracle(400_000_000, 10_000_000, [false; 3]);
    assert_eq!(
        (&jordan["percentage"], &jordan["taxable"], &jordan["total"]),
        (&json!("25"), &json!("25000"), &json!("3750"))
    );
    // Example 1.2, Kelly: $12 million, $500,000, 75% and 16.67%, $56,250 and $8,335, $64,585.
    let kelly = division_296_oracle(1_200_000_000, 50_000_000, [false; 3]);
    assert_eq!(
        [
            &kelly["veryLargePercentage"],
            &kelly["component"],
            &kelly["tax"],
            &kelly["veryLargeTax"],
            &kelly["total"]
        ],
        [
            &json!("16.67"),
            &json!("83350"),
            &json!("56250"),
            &json!("8335"),
            &json!("64585")
        ]
    );
    // $150 over $3 million is 0.004999...%, so 0.00; $150.01 is 0.005000...%, so 0.01.
    assert_eq!(division_296_share(300_015_000, LARGE_THRESHOLD), 0);
    assert_eq!(division_296_share(300_015_001, LARGE_THRESHOLD), 1);
}

#[test]
fn the_division_296_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1117_0000_0296);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..DIVISION_296_CASES)
        .map(|_| division_296_case(&mut rng))
        .unzip();
    let actual = run_node(DIVISION_296_HARNESS, &cases);
    assert_eq!(actual.len(), DIVISION_296_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

#[test]
fn the_vehicle_oracle_works_the_regulators_examples() {
    let at = |body, seats, load, whole_dollars: u64| Vehicle {
        body,
        seats,
        load,
        accessories: 0,
        price: whole_dollars * 100,
        full_credit: true,
        limited_use: true,
    };
    let field = |result: &Value, name: &str| result[name].clone();
    // TD 94/19: a wagon with 5 seats and an 865 kg load carries passengers; at $75,000 in 2025-26
    // the ATO's instant asset write-off page gives a $6,334 credit and a $68,666 cost.
    let wagon = vehicle_oracle(&at("passenger", 5, 865, 75_000), 69_674, 80_567);
    assert_eq!(
        [
            field(&wagon, "credit"),
            field(&wagon, "cost"),
            field(&wagon, "fbt")
        ],
        [json!("6334"), json!("68666"), json!("car-benefit")]
    );
    // MT 2024 paragraph 17 (600 kg) and the FBT guide's example 19 (550 kg): 340 kg of 5 seats
    // outweighs the load left, and LCTD 2023/1 paragraph 59 leaves LCT undecided. Its example 5
    // (960 kg): 340 kg is under 480 kg, so a commercial vehicle.
    for (load, passengers, luxury) in [
        (600, true, "undetermined"),
        (550, true, "undetermined"),
        (960, false, "commercial"),
    ] {
        let ute = vehicle_oracle(&at("dual-cab", 5, load, 85_000), 69_883, 80_809);
        assert_eq!(
            [field(&ute, "passengers"), field(&ute, "luxury")],
            [json!(passengers), json!(luxury)],
            "{load}"
        );
    }
    // Example 5 settles LCT only. No ruling applies a dual cab test to the car limit or the
    // GST cap, so at $85,000, over the $69,883 limit, neither the credit nor the cost is given.
    let example_5 = vehicle_oracle(&at("dual-cab", 5, 960, 85_000), 69_883, 80_809);
    assert_eq!(
        ["carLimit", "cap", "credit", "cost"].map(|name| field(&example_5, name)),
        [Value::Null, Value::Null, Value::Null, Value::Null]
    );
    // TD 2006/40 at a $57,009 limit: $77,000 falls to the limit; $60,000 less 1/11 of the limit,
    // $5,182.64 (the determination's $5,182), is $54,817.36.
    let first = vehicle_oracle(&at("passenger", 5, 865, 77_000), 57_009, 80_809);
    let second = vehicle_oracle(&at("passenger", 5, 865, 60_000), 57_009, 80_809);
    assert_eq!(
        [
            field(&first, "credit"),
            field(&first, "cost"),
            field(&second, "cost")
        ],
        [json!("5182.64"), json!("57009"), json!("54817.36")]
    );
}

#[test]
fn the_vehicle_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1116_0CA2_9951);
    let (cases, expected): (Vec<_>, Vec<_>) =
        (0..VEHICLE_CASES).map(|_| vehicle_case(&mut rng)).unzip();
    let actual = engines(&cases);
    assert_eq!(actual.len(), VEHICLE_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

// FBT loan, meal entertainment and car parking benefits, FBTAA 1986 Compilation No. 97, for the
// FBT year ending 31 March 2027 (365 days, statutory interest rate 8.27%, car parking threshold
// $11.48). The oracle builds each loan's daily balances from a repayment schedule and adds the
// day's interest one day at a time, where `assets/fbt-benefits.mjs` takes their sum; it works
// s 19's reduction as the value after it, never below nil, where the engine caps the reduction.
// It values car parking one benefit, space or day at a time where the engine multiplies, scales
// spaces by the average employees over the average spaces, and checks the meal register's 20%
// rule as 5 x a year's expenses against 6 x the first year's. The conventions are shared: each
// value rounds half up to the cent before contributions come off, the spaces method rounds the
// total statutory benefit before scaling it, and s 39GB divides by 366 in every year.

/// Runs the FBT benefit engines, as `HARNESS` runs the others.
const FBT_BENEFIT_HARNESS: &str = r"
import { fbtLoan, fbtMealEntertainment, fbtCarParking, fbtProperty, fbtExpensePayment } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const engines = { loan: fbtLoan, meal: fbtMealEntertainment, parking: fbtCarParking, property: fbtProperty,
  expense: fbtExpensePayment };
const run = ({ kind, inputs, year }) => {
  try {
    return Object.fromEntries(Object.entries(engines[kind](inputs, year))
      .map(([key, value]) => [key, typeof value === 'number' ? String(value) : value]));
  } catch (error) {
    return { refused: error.message };
  }
};
process.stdout.write(JSON.stringify(JSON.parse(input).map(run)));
";

const FBT_BENEFIT_CASES: usize = 240;
const FBT_YEAR_DAYS: u64 = 365;
/// 8.27% in hundredths of 1%.
const FBT_LOAN_RATE: u128 = 827;
/// $11.48 in cents.
const PARKING_THRESHOLD: u64 = 1_148;

/// A loan's notional interest, gross taxable value, gross deduction, notional deduction,
/// reduction and taxable value, in cents. `balances` holds the balance owed on each day.
fn fbt_loan_oracle(balances: &[u64], accrued: u64, income_use: u64, deduction: u64) -> [u64; 6] {
    // Each day's interest is its balance x 8.27% / 365; the sum rounds once.
    let mut day_interest = 0_u128;
    for balance in balances {
        day_interest += u128::from(*balance) * FBT_LOAN_RATE;
    }
    let notional = exact_half_up(day_interest, 10_000 * u128::from(FBT_YEAR_DAYS)) as i128;
    let gross = (notional - i128::from(accrued)).max(0);
    let gross_deduction = exact_half_up(notional as u128 * u128::from(income_use), 10_000) as i128;
    let notional_deduction = (gross_deduction - i128::from(deduction)).max(0);
    let taxable = (gross - notional_deduction).max(0);
    [
        notional,
        gross,
        gross_deduction,
        notional_deduction,
        gross - taxable,
        taxable,
    ]
    .map(|cents| u64::try_from(cents).unwrap())
}

/// A loan of `principal` cents owed for `days` days, `repaid` cents of it repaid at the start
/// of day `repaid_on`.
fn fbt_loan_case(rng: &mut Seeded) -> (Value, Value) {
    let principal = 1 + rng.cents(MAX_PRINCIPAL - 1);
    let any_days = 1 + rng.below(FBT_YEAR_DAYS);
    let days = rng.pick(&[1, 100, 365, any_days]);
    let any_repaid = rng.below(principal + 1);
    let repaid = rng.pick(&[0, any_repaid]);
    let repaid_on = rng.below(days);
    let balances: Vec<u64> = (0..days)
        .map(|day| principal - if day >= repaid_on { repaid } else { 0 })
        .collect();
    let notional_guess = principal / 10;
    let any_accrued = rng.cents(notional_guess.max(1));
    let accrued = rng.pick(&[0, notional_guess, any_accrued]);
    let any_deduction = rng.below(accrued + 1);
    let deduction = rng.pick(&[0, accrued, any_deduction]);
    let any_use = rng.below(10_001);
    let income_use = rng.pick(&[0, 6_000, 10_000, any_use]);
    let figures = fbt_loan_oracle(&balances, accrued, income_use, deduction);
    let names = [
        "notional",
        "gross",
        "grossDeduction",
        "notionalDeduction",
        "reduction",
        "taxableValue",
    ];
    let expected: serde_json::Map<String, Value> = names
        .iter()
        .zip(figures)
        .map(|(name, cents)| ((*name).to_owned(), shown(cents).into()))
        .collect();
    let total: u64 = balances.iter().sum();
    (
        json!({"kind": "loan", "inputs": {
            "balances": dollars(total), "accrued": dollars(accrued),
            "incomeUse": format!("{}.{:02}", income_use / 100, income_use % 100), "deduction": dollars(deduction),
        }, "year": {"days": FBT_YEAR_DAYS.to_string(), "rate": "8.27"}}),
        Value::Object(expected),
    )
}

/// The meal entertainment taxable value under the 50/50 split, or under a register with
/// `register` = (its fringe benefits, its total, its first valid year, each year's expenses
/// from then to the year before this one), with the register percentage in hundredths of 1%.
fn fbt_meal_oracle(expenses: u64, register: Option<(u64, u64, u64, &[u64])>) -> Value {
    let Some((benefits, total, first, earlier)) = register else {
        return json!({"taxableValue": shown(exact_half_up(u128::from(expenses), 2) as u64)});
    };
    // A nil first year is refused as unsupported, as the engine refuses it.
    if earlier.first() == Some(&0) {
        return json!({"refused": "This calculator does not take a register whose first valid year had nil expenses: enter that year\u{2019}s expenses."});
    }
    if let Some(year) =
        (1..earlier.len()).find(|&k| 5 * u128::from(earlier[k]) > 6 * u128::from(earlier[0]))
    {
        return json!({"refused": format!("The register ceased to be valid at the end of the FBT year ending 31 March {}: \
            its expenses were more than 20% higher than those of the register\u{2019}s first valid year. Keep a new register.",
            first + year as u64)});
    }
    let percent = exact_half_up(u128::from(benefits) * 10_000, u128::from(total)) as u64;
    let taxable = exact_half_up(
        u128::from(expenses) * u128::from(benefits),
        u128::from(total),
    ) as u64;
    json!({"registerPercent": shown(percent), "taxableValue": shown(taxable)})
}

fn fbt_meal_case(rng: &mut Seeded) -> (Value, Value) {
    let expenses = rng.cents(MAX_PRINCIPAL);
    let blank = json!({"method": "split", "expenses": dollars(expenses), "registerBenefits": "0",
        "registerTotal": "0", "firstYear": "2027", "earlier": []});
    let year = json!({"ended": "2027"});
    if rng.below(3) == 0 {
        return (
            json!({"kind": "meal", "inputs": blank, "year": year}),
            fbt_meal_oracle(expenses, None),
        );
    }
    let total = 1 + rng.cents(10_000_000);
    let any_benefits = rng.below(total + 1);
    let benefits = rng.pick(&[0, total, any_benefits]);
    let first = 2023 + rng.below(5);
    let any_base = 1 + rng.cents(10_000_000);
    let base = rng.pick(&[0, 100_000, any_base]);
    let earlier: Vec<u64> = (0..2027 - first)
        .map(|k| match (k, rng.below(4)) {
            (0, _) => base,
            (_, 0) => base * 6 / 5,
            (_, 1) => base * 6 / 5 + 1,
            _ => rng.below(base * 13 / 10 + 1),
        })
        .collect();
    let mut inputs = blank;
    inputs["method"] = "register".into();
    inputs["registerBenefits"] = dollars(benefits).into();
    inputs["registerTotal"] = dollars(total).into();
    inputs["firstYear"] = first.to_string().into();
    inputs["earlier"] = earlier
        .iter()
        .map(|cents| Value::from(dollars(*cents)))
        .collect();
    (
        json!({"kind": "meal", "inputs": inputs, "year": year}),
        fbt_meal_oracle(expenses, Some((benefits, total, first, &earlier))),
    )
}

/// The gross value less contributions, as the engine shows them.
fn less_contributions(
    expected: &mut serde_json::Map<String, Value>,
    gross: u64,
    contribution: u64,
) {
    let applied = gross.min(contribution);
    for (name, cents) in [
        ("gross", gross),
        ("contributionApplied", applied),
        ("excess", contribution - applied),
        ("taxableValue", gross - applied),
    ] {
        expected.insert(name.to_owned(), shown(cents).into());
    }
}

/// A car parking valuation's figures for one premises. The amounts in `p` are cents and the
/// counts whole numbers, keyed as the engine names its inputs.
fn fbt_parking_oracle(method: &str, p: &std::collections::HashMap<&str, u64>) -> Value {
    let benefit = p["fee"] > PARKING_THRESHOLD;
    if method == "spaces" && !benefit {
        return json!({"refused": "These spaces gave rise to no car parking benefit: the first business day fee is not \
            more than the car parking threshold, so the spaces method does not count them."});
    }
    if !benefit {
        return json!({"benefit": false, "gross": "0", "taxableValue": "0"});
    }
    let mut expected = serde_json::Map::new();
    expected.insert("benefit".to_owned(), true.into());
    match method {
        "station" | "market" => {
            let gross = (0..p["benefits"]).map(|_| p["each"]).sum();
            less_contributions(&mut expected, gross, p["contribution"]);
        }
        "average" => {
            let pair = u128::from(p["firstFee"] + p["lastFee"]);
            let halves: u128 = (0..p["benefits"]).map(|_| pair).sum();
            expected.insert(
                "average".to_owned(),
                shown(exact_half_up(pair, 2) as u64).into(),
            );
            less_contributions(
                &mut expected,
                exact_half_up(halves, 2) as u64,
                p["contribution"],
            );
        }
        "register" => {
            // The register's 12 weeks a year are 52/12 of it; each day of the period adds 1/366.
            let per_day: u128 = (0..p["days"])
                .map(|_| u128::from(p["registerValue"]) * 52)
                .sum();
            let gross = shown(exact_half_up(per_day, 12 * 366) as u64);
            expected.insert(
                "annual".to_owned(),
                shown(exact_half_up(u128::from(p["registerValue"]) * 52, 12) as u64).into(),
            );
            expected.insert("gross".to_owned(), gross.clone().into());
            expected.insert("taxableValue".to_owned(), gross.into());
        }
        _ => {
            let mut sum = 0_u128;
            for _ in 0..p["spaces"] {
                for _ in 0..p["spaceDays"] {
                    sum += u128::from(p["rate"]) * 228;
                }
            }
            let statutory = exact_half_up(sum, 366);
            // Average employees over average spaces: each average is a sum over 2, kept in
            // hundredths so it shows as the engine shows it.
            let (employees, spaces) = (
                u128::from(p["employeesStart"] + p["employeesEnd"]) * 50,
                u128::from(p["spacesStart"] + p["spacesEnd"]) * 50,
            );
            let gross = if employees < spaces {
                exact_half_up(statutory * employees, spaces)
            } else {
                statutory
            };
            expected.insert(
                "statutoryBenefit".to_owned(),
                shown(statutory as u64).into(),
            );
            expected.insert(
                "averageEmployees".to_owned(),
                shown(employees as u64).into(),
            );
            expected.insert("averageSpaces".to_owned(), shown(spaces as u64).into());
            less_contributions(&mut expected, gross as u64, p["contribution"]);
        }
    }
    Value::Object(expected)
}

fn fbt_parking_case(rng: &mut Seeded) -> (Value, Value) {
    let method = rng.pick(&["station", "market", "average", "register", "spaces"]);
    let mut p: std::collections::HashMap<&str, u64> = [
        ("benefits", 0),
        ("each", 0),
        ("firstFee", 0),
        ("lastFee", 0),
        ("registerValue", 0),
        ("days", 0),
        ("firstYear", 2027),
        ("rate", 0),
        ("spaceDays", 1),
        ("spaces", 1),
        ("employeesStart", 0),
        ("employeesEnd", 0),
        ("spacesStart", 0),
        ("spacesEnd", 0),
        ("contribution", 0),
    ]
    .into();
    let any_fee = rng.cents(6_000);
    p.insert(
        "fee",
        rng.pick(&[
            PARKING_THRESHOLD,
            PARKING_THRESHOLD + 1,
            PARKING_THRESHOLD - 1,
            any_fee,
        ]),
    );
    let (small, large) = (rng.cents(100_000), rng.cents(10_000_000));
    let contribution = rng.pick(&[0, small, large]);
    match method {
        "station" | "market" => {
            p.extend([
                ("benefits", rng.below(5_001)),
                ("each", rng.cents(6_000)),
                ("contribution", contribution),
            ]);
        }
        "average" => p.extend([
            ("benefits", rng.below(5_001)),
            ("firstFee", rng.cents(6_000)),
            ("lastFee", rng.cents(6_000)),
            ("contribution", contribution),
        ]),
        "register" => p.extend([
            ("registerValue", rng.cents(10_000_000)),
            ("days", rng.below(FBT_YEAR_DAYS + 1)),
            ("firstYear", 2023 + rng.below(5)),
        ]),
        _ => p.extend([
            ("rate", rng.cents(6_000)),
            ("spaceDays", 1 + rng.below(FBT_YEAR_DAYS)),
            ("spaces", 1 + rng.below(500)),
            ("employeesStart", rng.below(601)),
            ("employeesEnd", rng.below(601)),
            ("spacesStart", rng.below(601)),
            ("spacesEnd", rng.below(601)),
            ("contribution", contribution),
        ]),
    }
    let money = [
        "fee",
        "each",
        "firstFee",
        "lastFee",
        "registerValue",
        "rate",
        "contribution",
    ];
    let mut inputs = serde_json::Map::new();
    inputs.insert("method".to_owned(), method.into());
    for (name, value) in &p {
        let text = if money.contains(name) {
            dollars(*value)
        } else {
            value.to_string()
        };
        inputs.insert((*name).to_owned(), text.into());
    }
    (
        json!({"kind": "parking", "inputs": inputs, "year": {"threshold": "11.48", "days": "365", "ended": "2027"}}),
        fbt_parking_oracle(method, &p),
    )
}

#[test]
fn the_fbt_benefit_oracle_works_the_guides_examples_by_hand() {
    // Guide 8.8 at 8.27%: $50,000 for the year, $2,000 accrued, 60% income use, $1,200 deducted.
    let year = vec![5_000_000; 365];
    assert_eq!(
        fbt_loan_oracle(&year, 200_000, 6_000, 120_000),
        [413_500, 213_500, 248_100, 128_100, 128_100, 85_400]
    );
    // Guide 16, example 18: 4 spaces at $10 for 182 days, 3 employees for 4 spaces, $2,340 paid.
    let mut p: std::collections::HashMap<&str, u64> = [
        ("fee", 1_200),
        ("rate", 1_000),
        ("spaceDays", 182),
        ("spaces", 4),
        ("employeesStart", 3),
        ("employeesEnd", 3),
        ("spacesStart", 4),
        ("spacesEnd", 4),
        ("contribution", 234_000),
    ]
    .into();
    let spaces = fbt_parking_oracle("spaces", &p);
    assert_eq!(
        [
            &spaces["statutoryBenefit"],
            &spaces["gross"],
            &spaces["taxableValue"]
        ],
        ["4535.08", "3401.31", "1061.31"]
    );
    // Example 17's register: $2,500 over 183 days.
    p.extend([("registerValue", 250_000), ("days", 183)]);
    let register = fbt_parking_oracle("register", &p);
    assert_eq!(
        [&register["annual"], &register["taxableValue"]],
        ["10833.33", "5416.67"]
    );
    // Example 13: 22 benefits at $12.36.
    p.extend([("benefits", 22), ("each", 1_236), ("contribution", 0)]);
    assert_eq!(fbt_parking_oracle("station", &p)["taxableValue"], "271.92");
    // A fee at the threshold gives no benefit.
    p.insert("fee", PARKING_THRESHOLD);
    assert_eq!(fbt_parking_oracle("station", &p)["benefit"], false);
    // A register of $1,000 of $3,000 applies to $900 as a third; 20% above the first year is valid.
    let earlier = [100_000, 120_000];
    assert_eq!(
        fbt_meal_oracle(90_000, Some((100_000, 300_000, 2025, &earlier[..])))["taxableValue"],
        "300"
    );
    assert!(
        fbt_meal_oracle(
            90_000,
            Some((100_000, 300_000, 2025, &[100_000, 120_001][..]))
        )["refused"]
            .is_string()
    );
}

#[test]
fn the_fbt_benefit_engines_agree_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1117_0F8B_0039);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..FBT_BENEFIT_CASES)
        .map(|index| match index % 3 {
            0 => fbt_loan_case(&mut rng),
            1 => fbt_meal_case(&mut rng),
            _ => fbt_parking_case(&mut rng),
        })
        .unzip();
    let actual = run_node(FBT_BENEFIT_HARNESS, &cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

// FBT property (Division 11) and expense payment (Division 5) benefits, FBTAA 1986 Compilation
// No. 97, read 19 November 2026. The oracle takes 75% of a value as 75/100 of it, works the
// otherwise deductible rule (ss 24(1) and 44(1)) as TV - ND floored at nil, where the engine caps
// the reduction at the value, and takes s 62's reduction last, capped at what is left. The
// conventions are shared: 75% of a value and the gross deduction round half up to the cent.

const FBT_PROPERTY_CASES: usize = 240;
const PROPERTY_METHODS: [&str; 9] = [
    "in-house-salary-packaging",
    "in-house-trade-price",
    "in-house-public-price",
    "in-house-produced-other",
    "in-house-acquired",
    "in-house-other",
    "external-cost-price",
    "external-expenditure",
    "external-notional-value",
];
const RESIDUAL_METHODS: [&str; 3] = [
    "in-house-residual-salary-packaging",
    "in-house-residual-public-price",
    "in-house-residual-other",
];

/// The value `method` gives before any contribution, in cents: ss 42(1), 43, 48 and 49.
fn fbt_rule_value(method: &str, price: u64, notional: u64) -> u64 {
    let three_quarters = |cents: u64| exact_half_up(u128::from(cents) * 75, 100) as u64;
    match method {
        "in-house-salary-packaging"
        | "in-house-residual-salary-packaging"
        | "external-notional-value" => notional,
        "in-house-trade-price" | "external-cost-price" | "external-expenditure" => price,
        "in-house-public-price" | "in-house-residual-public-price" => three_quarters(price),
        "in-house-acquired" => price.min(notional),
        _ => three_quarters(notional),
    }
}

/// Whether s 62 reduces a benefit under `method`: an in-house rule, not salary packaging.
fn fbt_reduces(method: &str) -> bool {
    method.starts_with("in-house-") && !method.ends_with("-salary-packaging")
}

/// A benefit's figures from `gross`: `paid` against it, the otherwise deductible rule where
/// `deductible` holds (the gross deduction's base, the use in hundredths of 1%, RD), and s 62
/// where `available` holds.
fn fbt_benefit_figures(
    gross: u64,
    paid: u64,
    deductible: Option<(u64, u64, u64)>,
    available: Option<u64>,
) -> serde_json::Map<String, Value> {
    let applied = paid.min(gross);
    let value = gross - applied;
    let mut figures = vec![
        ("gross", gross),
        ("contributionApplied", applied),
        ("excess", paid - applied),
        ("valueAfterContribution", value),
    ];
    let mut taxable = value;
    if let Some((base, income_use, rd)) = deductible {
        let gd = exact_half_up(u128::from(base) * u128::from(income_use), 10_000) as u64;
        let notional = gd - rd.min(gd);
        taxable = value.saturating_sub(notional);
        figures.extend([
            ("grossDeduction", gd),
            ("deductionApplied", rd.min(gd)),
            ("notionalDeduction", notional),
            ("reduction", value - taxable),
        ]);
    }
    if let Some(available) = available {
        let s62 = available.min(taxable);
        taxable -= s62;
        figures.push(("inHouseReduction", s62));
    }
    figures.push(("taxableValue", taxable));
    figures
        .into_iter()
        .map(|(name, cents)| (name.to_owned(), shown(cents).into()))
        .collect()
}

/// A percentage in hundredths of 1% as a form field holds it.
fn hundredths_field(hundredths: u64) -> String {
    format!("{}.{:02}", hundredths / 100, hundredths % 100)
}

fn fbt_property_case(rng: &mut Seeded) -> (Value, Value) {
    let method = rng.pick(&PROPERTY_METHODS);
    let (price, notional) = (rng.cents(500_000), rng.cents(500_000));
    let gross = fbt_rule_value(method, price, notional);
    let any_contribution = rng.below(gross + 2);
    let large_contribution = rng.cents(500_000);
    let contribution = rng.pick(&[0, gross, any_contribution, large_contribution]);
    let any_use = rng.below(10_001);
    let income_use = rng.pick(&[0, 5_000, 10_000, any_use]);
    let any_rd = rng.below(contribution + 1);
    let rd = rng.pick(&[0, contribution, any_rd, any_rd, contribution + 1]);
    let any_available = rng.below(100_001);
    let available = rng.pick(&[0, 100_000, any_available]);
    let inputs = json!({"method": method, "price": dollars(price), "notional": dollars(notional),
        "contribution": dollars(contribution), "incomeUse": hundredths_field(income_use),
        "contributionDeduction": dollars(rd), "available": dollars(available)});
    let expected = if rd > contribution {
        json!({"refused": "The deduction for the employee’s contribution cannot be more than the contribution."})
    } else {
        Value::Object(fbt_benefit_figures(
            gross,
            contribution,
            Some((gross, income_use, rd)),
            fbt_reduces(method).then_some(available),
        ))
    };
    (json!({"kind": "property", "inputs": inputs}), expected)
}

fn fbt_expense_case(rng: &mut Seeded) -> (Value, Value) {
    let in_house: Vec<&str> = PROPERTY_METHODS[..6]
        .iter()
        .chain(&RESIDUAL_METHODS)
        .copied()
        .collect();
    let method = if rng.below(3) == 0 {
        "external"
    } else {
        rng.pick(&in_house)
    };
    let expenditure = rng.cents(500_000);
    let any_paid = rng.below(expenditure + 1);
    let paid = rng.pick(&[0, expenditure, any_paid, any_paid, expenditure + 1]);
    let any_contribution = rng.below(paid + 1);
    let contribution = rng.pick(&[0, any_contribution]);
    let portion = (expenditure + contribution).saturating_sub(paid);
    let (price, notional) = (rng.cents(500_000), rng.cents(500_000));
    let any_available = rng.below(100_001);
    let available = rng.pick(&[0, 100_000, any_available]);
    let any_use = rng.below(10_001);
    let any_rd = rng.below(portion + 1);
    let (income_use, rd) = if method == "external" {
        (
            rng.pick(&[0, 8_000, 10_000, any_use]),
            rng.pick(&[0, portion, any_rd, portion + 1]),
        )
    } else {
        // Most in-house cases leave the otherwise deductible inputs at nil; the rest are refused.
        rng.pick(&[
            (0, 0),
            (0, 0),
            (0, 0),
            (any_use.max(1), 0),
            (0, any_rd.max(1)),
        ])
    };
    let inputs = json!({"method": method, "expenditure": dollars(expenditure), "paid": dollars(paid),
        "contribution": dollars(contribution), "incomeUse": hundredths_field(income_use),
        "portionDeduction": dollars(rd), "price": dollars(price), "notional": dollars(notional),
        "available": dollars(available)});
    let expected = if paid > expenditure {
        json!({"refused": "The payment or reimbursement cannot be more than the employee’s expenditure (section 20)."})
    } else if method == "external" && rd > portion {
        json!({"refused": "The deduction for the recipient’s portion cannot be more than that portion, the expenditure \
            less the payment net of the contribution."})
    } else if method == "external" {
        Value::Object(fbt_benefit_figures(
            paid,
            contribution,
            Some((expenditure, income_use, rd)),
            None,
        ))
    } else if income_use > 0 || rd > 0 {
        json!({"refused": "This calculator does not apply the otherwise deductible rule to an in-house expense \
            payment (subparagraph 24(1)(b)(i)): enter 0% income use and no deduction."})
    } else {
        let mut figures = fbt_benefit_figures(
            fbt_rule_value(method, price, notional),
            portion,
            None,
            fbt_reduces(method).then_some(available),
        );
        figures.insert("recipientsPortion".to_owned(), shown(portion).into());
        Value::Object(figures)
    };
    (json!({"kind": "expense", "inputs": inputs}), expected)
}

#[test]
fn the_fbt_property_oracle_works_the_guides_examples_by_hand() {
    // Guide 17.3: 75% of $900 less $500; $950; 75% of $30 less $5; the lesser of $500 and $750 less $400.
    let taxable = |figures: serde_json::Map<String, Value>| figures["taxableValue"].clone();
    let value = |method, price, notional, paid| {
        taxable(fbt_benefit_figures(
            fbt_rule_value(method, price, notional),
            paid,
            None,
            None,
        ))
    };
    assert_eq!(value("in-house-public-price", 90_000, 0, 50_000), "175");
    assert_eq!(value("in-house-trade-price", 95_000, 0, 0), "950");
    assert_eq!(value("in-house-produced-other", 0, 3_000, 500), "17.5");
    assert_eq!(value("in-house-acquired", 50_000, 75_000, 40_000), "100");
    // Guide 17.5: $500 of goods, $250 paid, 80% work use, RD $200 then $150.
    let deductible = |rd| {
        taxable(fbt_benefit_figures(
            50_000,
            25_000,
            Some((50_000, 8_000, rd)),
            None,
        ))
    };
    assert_eq!([deductible(20_000), deductible(15_000)], ["50", "0"]);
    // Guide 9.3: petroleum the retailer bought for $800, $1,000 spent, $250 reimbursed.
    assert_eq!(
        taxable(fbt_benefit_figures(80_000, 75_000, None, Some(0))),
        "50"
    );
    // Guide 9.4: $500 spent, 80% for work, $250 reimbursed and RD $200; $350 and RD $50.
    let external = |paid, rd| {
        taxable(fbt_benefit_figures(
            paid,
            0,
            Some((50_000, 8_000, rd)),
            None,
        ))
    };
    assert_eq!(
        [external(25_000, 20_000), external(35_000, 5_000)],
        ["50", "0"]
    );
}

#[test]
fn the_fbt_property_and_expense_payment_engines_agree_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1119_0F8B_0042);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..FBT_PROPERTY_CASES)
        .map(|index| {
            if index % 2 == 0 {
                fbt_property_case(&mut rng)
            } else {
                fbt_expense_case(&mut rng)
            }
        })
        .unzip();
    let actual = run_node(FBT_BENEFIT_HARNESS, &cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Seeded land tax values, beside every band boundary of every jurisdiction.
const LAND_TAX_CASES: usize = 140;

/// Runs land tax cases through the engine with each jurisdiction's data as the rendered
/// calculator page gives it to the browser, keyed as the browser's dataset keys it. A
/// jurisdiction the page lacks comes back as missing, so the comparison fails on it.
const LAND_TAX_HARNESS: &str = r#"
import { readFileSync } from 'node:fs';
import { landTaxYear } from './assets/business-calculators.mjs';
const page = readFileSync('tools/business-calculators/land-tax/index.html', 'utf8');
const places = Object.fromEntries([...page.matchAll(/value="(AU-[A-Z]+)"((?: data-[a-z-]+="[^"]*")+)/g)]
  .map(([, place, attributes]) => [place, Object.fromEntries([...attributes.matchAll(/data-([a-z-]+)="([^"]*)"/g)]
    .map(([, key, value]) => [key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]))]));
let input = '';
for await (const chunk of process.stdin) input += chunk;
process.stdout.write(JSON.stringify(JSON.parse(input).map(({ value, place, choices }) => {
  if (!places[place]) return { missing: place };
  const r = landTaxYear(value, places[place], choices);
  return { tax: String(r.tax), surcharge: String(r.surcharge), mrit: String(r.mrit), total: String(r.total) };
})));
"#;

/// One band of a land tax scale, typed from the revenue office's or the legislation's own
/// wording as read on 16 November 2026, not from the calculator page. It holds the
/// whole-dollar values from `low` to `high` and charges `base` cents plus `rate`
/// ten-thousandths of a per cent of the value over `over`, or, when `per_hundred`, `rate`
/// ten-thousandths of a dollar for every $100, or part of $100, over `over`.
#[derive(Clone, Copy)]
struct LandBand {
    low: u64,
    high: u64,
    base: u64,
    rate: u64,
    over: u64,
    per_hundred: bool,
}

/// A band charging `points` hundredths of a per cent of the value over `over`.
const fn land(low: u64, high: u64, base: u64, points: u64, over: u64) -> LandBand {
    land_fine(low, high, base, points * 100, over)
}

/// A band charging `rate` ten-thousandths of a per cent, as Victoria's trust rates need.
const fn land_fine(low: u64, high: u64, base: u64, rate: u64, over: u64) -> LandBand {
    LandBand {
        low,
        high,
        base,
        rate,
        over,
        per_hundred: false,
    }
}

/// A band charging `points` cents for every $100, or part of $100, over `over`.
const fn land_per_hundred(low: u64, high: u64, base: u64, points: u64, over: u64) -> LandBand {
    LandBand {
        per_hundred: true,
        ..land(low, high, base, points, over)
    }
}

/// No upper limit.
const TOP: u64 = u64::MAX;

/// Each scale with its fixed charge in cents, base amounts in cents.
const LAND_TAX_SCALES: [(&str, u64, &[LandBand]); 7] = [
    // Revenue NSW, thresholds and rates for the 2024 land tax year onwards: more than $1,075,000
    // but less than $6,571,000, $100 + 1.6% above $1,075,000; more than $6,571,000, $88,036 + 2%.
    // Exactly $6,571,000 falls in neither row; both give $88,036 there.
    (
        "AU-NSW",
        0,
        &[
            land(0, 1_075_000, 0, 0, 0),
            land(1_075_001, 6_571_000, 10_000, 160, 1_075_000),
            land(6_571_001, TOP, 8_803_600, 200, 6_571_000),
        ],
    ),
    // State Revenue Office Victoria, general rates for the 2024 to 2033 land tax years.
    (
        "AU-VIC",
        0,
        &[
            land(0, 49_999, 0, 0, 0),
            land(50_000, 99_999, 50_000, 0, 0),
            land(100_000, 299_999, 97_500, 0, 0),
            land(300_000, 599_999, 135_000, 30, 300_000),
            land(600_000, 999_999, 225_000, 60, 600_000),
            land(1_000_000, 1_799_999, 465_000, 90, 1_000_000),
            land(1_800_000, 2_999_999, 1_185_000, 165, 1_800_000),
            land(3_000_000, TOP, 3_165_000, 265, 3_000_000),
        ],
    ),
    // Queensland Revenue Office, rates for individuals: cents for each $1 more than the threshold.
    (
        "AU-QLD",
        0,
        &[
            land(0, 599_999, 0, 0, 0),
            land(600_000, 999_999, 50_000, 100, 600_000),
            land(1_000_000, 2_999_999, 450_000, 165, 1_000_000),
            land(3_000_000, 4_999_999, 3_750_000, 125, 3_000_000),
            land(5_000_000, 9_999_999, 6_250_000, 175, 5_000_000),
            land(10_000_000, TOP, 15_000_000, 225, 10_000_000),
        ],
    ),
    // RevenueWA land tax rates: dollars for each $1 in excess of the threshold.
    (
        "AU-WA",
        0,
        &[
            land(0, 300_000, 0, 0, 0),
            land(300_001, 420_000, 30_000, 0, 0),
            land(420_001, 1_000_000, 30_000, 25, 420_000),
            land(1_000_001, 1_800_000, 175_000, 90, 1_000_000),
            land(1_800_001, 5_000_000, 895_000, 180, 1_800_000),
            land(5_000_001, 11_000_000, 6_655_000, 200, 5_000_000),
            land(11_000_001, TOP, 18_655_000, 267, 11_000_000),
        ],
    ),
    // RevenueSA 2026-27 general rates: exceeding one figure but not exceeding the next.
    (
        "AU-SA",
        0,
        &[
            land(0, 936_000, 0, 0, 0),
            land_per_hundred(936_001, 1_504_000, 0, 50, 936_000),
            land_per_hundred(1_504_001, 2_188_000, 284_000, 100, 1_504_000),
            land_per_hundred(2_188_001, 3_504_000, 968_000, 200, 2_188_000),
            land_per_hundred(3_504_001, TOP, 3_600_000, 240, 3_504_000),
        ],
    ),
    // State Revenue Office Tasmania, rates from 1 July 2025: nil to $124,999.99.
    (
        "AU-TAS",
        0,
        &[
            land(0, 124_999, 0, 0, 0),
            land(125_000, 499_999, 5_000, 45, 125_000),
            land(500_000, TOP, 173_750, 150, 500_000),
        ],
    ),
    // ACT DI2026-152: fixed charge $1,778 and Table 1 on the base value.
    (
        "AU-ACT",
        177_800,
        &[
            land(0, 150_000, 0, 54, 0),
            land(150_001, 275_000, 81_000, 64, 150_000),
            land(275_001, 1_000_000, 161_000, 124, 275_000),
            land(1_000_001, 2_000_000, 1_060_000, 125, 1_000_000),
            land(2_000_001, TOP, 2_310_000, 126, 2_000_000),
        ],
    ),
];

/// Each trust scale, from the same sources: the rates a land tax page's trust choice applies.
const LAND_TAX_TRUST_SCALES: [(&str, &[LandBand]); 4] = [
    // Revenue NSW, how trusts are assessed: a special trust is taxed at a flat 1.6% up to the
    // premium threshold, then 2% on the value above $6,571,000.
    (
        "AU-NSW",
        &[
            land(0, 6_571_000, 0, 160, 0),
            land(6_571_001, TOP, 10_513_600, 200, 6_571_000),
        ],
    ),
    // State Revenue Office Victoria, trust surcharge rates from the 2024 land tax year.
    (
        "AU-VIC",
        &[
            land(0, 24_999, 0, 0, 0),
            land_fine(25_000, 49_999, 8_200, 3_750, 25_000),
            land_fine(50_000, 99_999, 67_600, 3_750, 50_000),
            land_fine(100_000, 249_999, 133_800, 3_750, 100_000),
            land_fine(250_000, 599_999, 190_100, 6_750, 250_000),
            land_fine(600_000, 999_999, 426_300, 9_750, 600_000),
            land_fine(1_000_000, 1_799_999, 816_300, 12_750, 1_000_000),
            land_fine(1_800_000, 2_999_999, 1_836_300, 11_072, 1_800_000),
            land_fine(3_000_000, TOP, 3_165_000, 26_500, 3_000_000),
        ],
    ),
    // Queensland Revenue Office, rates for companies and trustees: cents for each $1 more
    // than the threshold.
    (
        "AU-QLD",
        &[
            land(0, 349_999, 0, 0, 0),
            land(350_000, 2_249_999, 145_000, 170, 350_000),
            land(2_250_000, 4_999_999, 3_375_000, 150, 2_250_000),
            land(5_000_000, 9_999_999, 7_500_000, 225, 5_000_000),
            land(10_000_000, TOP, 18_750_000, 275, 10_000_000),
        ],
    ),
    // RevenueSA 2026-27 trust rates: exceeding one figure but not exceeding the next.
    (
        "AU-SA",
        &[
            land(0, 25_000, 0, 0, 0),
            land_per_hundred(25_001, 936_000, 12_500, 50, 25_000),
            land_per_hundred(936_001, 1_504_000, 468_000, 100, 936_000),
            land_per_hundred(1_504_001, 2_188_000, 1_036_000, 150, 1_504_000),
            land_per_hundred(2_188_001, 3_504_000, 2_062_000, 240, 2_188_000),
            land_per_hundred(3_504_001, TOP, 5_220_400, 240, 3_504_000),
        ],
    ),
];

/// Queensland Revenue Office, rates for absentees, which an absentee individual pays instead
/// of the rates for individuals.
const QLD_ABSENTEE: &[LandBand] = &[
    land(0, 349_999, 0, 0, 0),
    land(350_000, 2_249_999, 145_000, 170, 350_000),
    land(2_250_000, 4_999_999, 3_375_000, 150, 2_250_000),
    land(5_000_000, 9_999_999, 7_500_000, 200, 5_000_000),
    land(10_000_000, TOP, 17_500_000, 250, 10_000_000),
];

/// State Revenue Office Victoria, general rates with the absentee owner surcharge from the
/// 2024 land tax year: the engine's general tax and surcharge must add up to it.
const VIC_GENERAL_AOS: &[LandBand] = &[
    land(0, 49_999, 0, 0, 0),
    land(50_000, 99_999, 250_000, 400, 50_000),
    land(100_000, 299_999, 497_500, 400, 100_000),
    land(300_000, 599_999, 1_335_000, 430, 300_000),
    land(600_000, 999_999, 2_625_000, 460, 600_000),
    land(1_000_000, 1_799_999, 4_465_000, 490, 1_000_000),
    land(1_800_000, 2_999_999, 8_385_000, 565, 1_800_000),
    land(3_000_000, TOP, 15_165_000, 665, 3_000_000),
];

/// State Revenue Office Victoria, trust surcharge rates with the absentee owner surcharge.
const VIC_TRUST_AOS: &[LandBand] = &[
    land(0, 24_999, 0, 0, 0),
    land_fine(25_000, 49_999, 108_200, 43_750, 25_000),
    land_fine(50_000, 99_999, 267_600, 43_750, 50_000),
    land_fine(100_000, 249_999, 533_800, 43_750, 100_000),
    land_fine(250_000, 599_999, 1_190_100, 46_750, 250_000),
    land_fine(600_000, 999_999, 2_826_300, 49_750, 600_000),
    land_fine(1_000_000, 1_799_999, 4_816_300, 52_750, 1_000_000),
    land_fine(1_800_000, 2_999_999, 9_036_300, 51_072, 1_800_000),
    land_fine(3_000_000, TOP, 15_165_000, 66_500, 3_000_000),
];

/// Every typed scale, for the coverage check.
fn every_land_scale() -> Vec<(&'static str, &'static [LandBand])> {
    let mut scales: Vec<_> = LAND_TAX_SCALES
        .iter()
        .map(|&(place, _, bands)| (place, bands))
        .collect();
    scales.extend(LAND_TAX_TRUST_SCALES);
    scales.extend([
        ("AU-QLD absentee", QLD_ABSENTEE),
        ("AU-VIC general AOS", VIC_GENERAL_AOS),
        ("AU-VIC trust AOS", VIC_TRUST_AOS),
    ]);
    scales
}

/// Tax in cents on a whole-dollar value from one scale: the band whose range holds it.
fn band_tax(bands: &[LandBand], dollars: u64) -> u64 {
    let band = bands
        .iter()
        .find(|band| band.low <= dollars && dollars <= band.high)
        .unwrap();
    let excess = u128::from(dollars - band.over);
    let rate = u128::from(band.rate);
    let charge = if band.per_hundred {
        exact_half_up(rate * excess.div_ceil(100), 100)
    } else {
        exact_half_up(rate * excess, 10_000)
    };
    band.base + u64::try_from(charge).unwrap()
}

/// What a land tax page offers beside the value: trust rates, a foreign or absentee owner,
/// the value a separate surcharge applies to, and land all in the Perth metropolitan region.
#[derive(Clone, Copy, Default)]
struct LandChoices {
    trust: bool,
    foreign: bool,
    separate: u64,
    metro: bool,
}

/// `hundredths` hundredths of a per cent of a whole-dollar value, in cents, half up.
fn per_cent(hundredths: u128, dollars: u64) -> u64 {
    u64::try_from(exact_half_up(hundredths * u128::from(dollars), 100)).unwrap()
}

/// A full year's land tax, foreign or absentee owner surcharge and MRIT in cents.
fn land_tax_oracle(place: &str, dollars: u64, choices: LandChoices) -> [u64; 3] {
    let (_, fixed, general) = LAND_TAX_SCALES.iter().find(|(p, ..)| *p == place).unwrap();
    let main = if choices.trust {
        LAND_TAX_TRUST_SCALES
            .iter()
            .find(|(p, _)| *p == place)
            .unwrap()
            .1
    } else if choices.foreign && place == "AU-QLD" {
        QLD_ABSENTEE
    } else {
        general
    };
    let tax = fixed + band_tax(main, dollars);
    let surcharge = match (choices.foreign, place) {
        (false, _) => 0,
        // Revenue NSW: 5% of the land value of the residential land, with no threshold.
        (true, "AU-NSW") => per_cent(500, choices.separate),
        // SRO Victoria: its table with the absentee owner surcharge less the table without it.
        (true, "AU-VIC") => {
            let with = if choices.trust {
                VIC_TRUST_AOS
            } else {
                VIC_GENERAL_AOS
            };
            band_tax(with, dollars) - band_tax(main, dollars)
        }
        // QRO: (taxable value - $350,000) x 3%, from $350,000.
        (true, "AU-QLD") => per_cent(300, dollars.saturating_sub(350_000)),
        // SRO Tasmania: 2% of the assessed land value of the foreign-owned share.
        (true, "AU-TAS") => per_cent(200, choices.separate),
        // DI2026-152 section 7: 0.75% of the base value.
        (true, "AU-ACT") => per_cent(75, dollars),
        (true, _) => unreachable!("{place} has no surcharge"),
    };
    // RevenueWA MRIT: nil to $300,000, then 0.0014 dollars for each $1 in excess of $300,000.
    let mrit = if choices.metro {
        per_cent(14, dollars.saturating_sub(300_000))
    } else {
        0
    };
    [tax, surcharge, mrit]
}

/// Each revenue office's own worked figure, read 16 November 2026, and hand-worked figures
/// where none is published. The scales also cover every whole dollar without a gap.
#[test]
fn the_land_tax_oracle_gives_the_revenue_offices_worked_figures() {
    for (place, bands) in every_land_scale() {
        assert_eq!(bands[0].low, 0, "{place}");
        assert_eq!(bands[bands.len() - 1].high, TOP, "{place}");
        for pair in bands.windows(2) {
            assert_eq!(pair[1].low, pair[0].high + 1, "{place}");
        }
    }
    let general = LandChoices::default();
    let trust = LandChoices {
        trust: true,
        ..general
    };
    let foreign = LandChoices {
        foreign: true,
        ..general
    };
    for (place, dollars, choices, cents, source) in [
        (
            "AU-NSW",
            1_100_000,
            general,
            [50_000, 0, 0],
            "Revenue NSW 3-year average example",
        ),
        (
            "AU-NSW",
            600_000,
            trust,
            [960_000, 0, 0],
            "Revenue NSW special trust example",
        ),
        (
            "AU-NSW",
            1_200_000,
            LandChoices {
                separate: 1_200_000,
                ..foreign
            },
            [210_000, 6_000_000, 0],
            "Revenue NSW surcharge land tax example 1",
        ),
        (
            "AU-NSW",
            0,
            LandChoices {
                separate: 500_000,
                ..foreign
            },
            [0, 2_500_000, 0],
            "Revenue NSW surcharge land tax example 2",
        ),
        (
            "AU-VIC",
            1_100_000,
            general,
            [555_000, 0, 0],
            "SRO Victoria, Anika's assessment",
        ),
        (
            "AU-VIC",
            1_000_000,
            foreign,
            [465_000, 4_000_000, 0],
            "SRO Victoria general rates with the absentee owner surcharge, $44,650",
        ),
        (
            "AU-VIC",
            1_800_000,
            LandChoices {
                trust: true,
                ..foreign
            },
            [1_836_300, 7_200_000, 0],
            "SRO Victoria trust rates with the absentee owner surcharge, $90,363",
        ),
        (
            "AU-QLD",
            680_000,
            general,
            [130_000, 0, 0],
            "QRO individuals example 1",
        ),
        (
            "AU-QLD",
            6_400_000,
            general,
            [8_700_000, 0, 0],
            "QRO individuals example 2",
        ),
        (
            "AU-QLD",
            6_400_000,
            trust,
            [10_650_000, 0, 0],
            "QRO companies example 1",
        ),
        (
            "AU-QLD",
            760_000,
            trust,
            [842_000, 0, 0],
            "QRO SMSF trustee example 2",
        ),
        (
            "AU-QLD",
            400_000,
            foreign,
            [230_000, 150_000, 0],
            "QRO absentee example",
        ),
        (
            "AU-QLD",
            400_000,
            LandChoices {
                trust: true,
                ..foreign
            },
            [230_000, 150_000, 0],
            "QRO foreign company example",
        ),
        (
            "AU-SA",
            1_470_000,
            general,
            [267_000, 0, 0],
            "RevenueSA 2026-27 guide example 1",
        ),
        (
            "AU-SA",
            1_575_000,
            general,
            [355_000, 0, 0],
            "RevenueSA land tax assessment example",
        ),
        (
            "AU-TAS",
            400_000,
            LandChoices {
                separate: 400_000,
                ..foreign
            },
            [128_750, 800_000, 0],
            "SRO Tasmania FILTS guideline example 1",
        ),
        // By hand: $1,750 + 0.9% of $500,000, and MRIT of 0.14% of $1,200,000.
        (
            "AU-WA",
            1_500_000,
            LandChoices {
                metro: true,
                ..general
            },
            [625_000, 0, 168_000],
            "hand-worked",
        ),
        // By hand: $125 + 50 cents for each of 4,750 lots of $100.
        ("AU-SA", 500_000, trust, [250_000, 0, 0], "hand-worked"),
        // By hand: $1,737.50 + 1.5% of $100,000.
        ("AU-TAS", 600_000, general, [323_750, 0, 0], "hand-worked"),
        // By hand: $1,778 + $1,610 + 1.24% of $325,000, and 0.75% of $600,000.
        (
            "AU-ACT",
            600_000,
            foreign,
            [741_800, 450_000, 0],
            "hand-worked",
        ),
    ] {
        assert_eq!(
            land_tax_oracle(place, dollars, choices),
            cents,
            "{place} {dollars}: {source}"
        );
    }
}

/// Every combination of choices a jurisdiction computes: trust rates where it has them, a
/// foreign or absentee owner where it has a surcharge, and MRIT in Western Australia.
fn land_choice_sets(place: &str) -> Vec<LandChoices> {
    let trust = LAND_TAX_TRUST_SCALES.iter().any(|(p, _)| *p == place);
    let foreign = ["AU-NSW", "AU-VIC", "AU-QLD", "AU-TAS", "AU-ACT"].contains(&place);
    let metro = place == "AU-WA";
    let mut sets = Vec::new();
    for t in [false, true].into_iter().filter(|&t| !t || trust) {
        for f in [false, true].into_iter().filter(|&f| !f || foreign) {
            for m in [false, true].into_iter().filter(|&m| !m || metro) {
                sets.push(LandChoices {
                    trust: t,
                    foreign: f,
                    separate: 0,
                    metro: m,
                });
            }
        }
    }
    sets
}

#[test]
fn the_land_tax_engine_agrees_with_the_oracle_at_every_band_boundary() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1116_1A4D_7A85);
    let mut values = Vec::new();
    for (place, ..) in LAND_TAX_SCALES {
        let mut edges = vec![0, 300_000, 350_000, 1_000_000_000];
        for (scale, bands) in every_land_scale() {
            if scale.starts_with(place) {
                edges.extend(bands.iter().map(|band| band.low));
            }
        }
        for edge in edges {
            for v in [edge.saturating_sub(1), edge, edge + 1] {
                if v <= 1_000_000_000 {
                    values.push((place, v));
                }
            }
        }
    }
    // Seeded whole-dollar values spread across magnitudes, for every jurisdiction.
    for _ in 0..LAND_TAX_CASES {
        let (place, ..) = LAND_TAX_SCALES[rng.below(7) as usize];
        values.push((place, rng.cents(1_000_000_000)));
    }
    let mut cases = Vec::new();
    let mut expected = Vec::new();
    for (place, dollars) in values {
        for mut choices in land_choice_sets(place) {
            if choices.foreign && ["AU-NSW", "AU-TAS"].contains(&place) {
                choices.separate = rng.cents(1_000_000_000);
            }
            let [tax, surcharge, mrit] = land_tax_oracle(place, dollars, choices);
            cases.push(json!({
                "value": dollars.to_string(),
                "place": place,
                "choices": {
                    "trust": choices.trust,
                    "foreign": choices.foreign,
                    "surchargeValue": choices.separate.to_string(),
                    "metro": choices.metro,
                },
            }));
            expected.push(json!({
                "tax": shown(tax),
                "surcharge": shown(surcharge),
                "mrit": shown(mrit),
                "total": shown(tax + surcharge + mrit),
            }));
        }
    }
    let actual = run_node(LAND_TAX_HARNESS, &cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the payroll tax engine, as `HARNESS` runs the others.
const PAYROLL_TAX_HARNESS: &str = r"
import { payrollTax } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const run = ({ wages, australian, place }) => {
  const r = payrollTax(wages, australian, place);
  return Object.fromEntries(['deduction', 'taxable', 'tax', 'levy', 'extraLevy', 'total'].map((key) => [key, String(r[key])]));
};
process.stdout.write(JSON.stringify(JSON.parse(input).map(run)));
";

const PAYROLL_TAX_CASES: usize = 270;
/// The largest wages the payroll tax fields accept, $100,000,000,000.00, in cents.
const MAX_WAGES: u64 = 10_000_000_000_000;
const PAYROLL_TAX_PLACES: [&str; 9] = [
    "AU-NSW",
    "AU-VIC",
    "AU-VIC-REGIONAL",
    "AU-QLD",
    "AU-WA",
    "AU-SA",
    "AU-TAS",
    "AU-ACT",
    "AU-NT",
];
/// Every threshold, taper end and rate band edge of the 8 jurisdictions, in dollars.
const PAYROLL_TAX_EDGES: [u64; 17] = [
    600_000,
    1_000_000,
    1_200_000,
    1_250_000,
    1_300_000,
    1_500_000,
    1_700_000,
    1_750_000,
    2_000_000,
    2_500_000,
    3_000_000,
    5_000_000,
    6_500_000,
    7_500_000,
    10_400_000,
    10_000_000,
    100_000_000,
];

/// An exact signed fraction of cents, its denominator positive.
#[derive(Clone)]
struct Q(num_bigint::BigInt, num_bigint::BigInt);

impl Q {
    fn of(cents: u64) -> Self {
        Q(cents.into(), 1.into())
    }
    fn dollars(dollars: u64) -> Self {
        Q::of(dollars * 100)
    }
    /// A rate per cent typed to 4 places, in ten-thousandths of 1%: 5.45% is 54,500.
    fn percent(ten_thousandths: u64) -> Self {
        Q(ten_thousandths.into(), 1_000_000.into())
    }
    fn plus(&self, other: &Q) -> Q {
        Q(&self.0 * &other.1 + &other.0 * &self.1, &self.1 * &other.1)
    }
    fn minus(&self, other: &Q) -> Q {
        Q(&self.0 * &other.1 - &other.0 * &self.1, &self.1 * &other.1)
    }
    fn times(&self, other: &Q) -> Q {
        Q(&self.0 * &other.0, &self.1 * &other.1)
    }
    /// Over a positive fraction.
    fn over(&self, other: &Q) -> Q {
        Q(&self.0 * &other.1, &self.1 * &other.0)
    }
    fn below(&self, other: &Q) -> bool {
        &self.0 * &other.1 < &other.0 * &self.1
    }
    fn at_least_nil(self) -> Q {
        if self.below(&Q::of(0)) {
            Q::of(0)
        } else {
            self
        }
    }
    fn least(self, other: Q) -> Q {
        if other.below(&self) { other } else { self }
    }
    /// Half up to the cent; the amount must not be negative.
    fn cents(&self) -> u64 {
        assert!(!self.below(&Q::of(0)), "a negative amount");
        let rounded = (&self.0 * 2 + &self.1) / (&self.1 * 2);
        u64::try_from(rounded).expect("cents within u64")
    }
}

/// The deduction before it is limited to the wages, each payroll tax term, and the 2 surcharges
/// or levies, as each Act writes them for an employer outside a group that pays wages all year
/// (C / FY = 1). `w` is the jurisdiction's taxable wages and `t` the Australian wages.
fn payroll_tax_terms(place: &str, w: &Q, t: &Q) -> (Q, Vec<Q>, [Q; 2]) {
    let share = w.over(t);
    let d = Q::dollars;
    let nil = || [Q::of(0), Q::of(0)];
    match place {
        // Revenue NSW: the $1,200,000 threshold times NSW wages over Australian wages, 5.45%.
        "AU-NSW" => {
            let deduction = d(1_200_000).times(&share);
            (
                deduction.clone(),
                vec![w.minus(&deduction).times(&Q::percent(54_500))],
                nil(),
            )
        }
        // Payroll Tax Act 2007 (Vic) Sch 1 cl 5: tax = (TW - ND) x R + S + T, ND = min(a, b), a
        // never below nil; cl 1B: T = S.
        "AU-VIC" | "AU-VIC-REGIONAL" => {
            let b = share.times(&d(1_000_000));
            let a = b.minus(
                &w.minus(&d(3_000_000).times(&share))
                    .times(&Q(1.into(), 2.into())),
            );
            let deduction = a.at_least_nil().least(b);
            let rate = Q::percent(if place == "AU-VIC" { 48_500 } else { 12_125 });
            let (first, second) = (d(10_000_000), d(100_000_000));
            let half = Q::percent(5_000);
            let surcharge = if !first.below(t) {
                Q::of(0)
            } else if !second.below(t) {
                w.minus(&w.times(&first).over(t)).times(&half)
            } else {
                w.times(&Q::percent(10_000))
                    .minus(&w.times(&first).plus(&w.times(&second)).over(t).times(&half))
            };
            (
                deduction.clone(),
                vec![w.minus(&deduction).times(&rate)],
                [surcharge.clone(), surcharge],
            )
        }
        // Payroll Tax Act 1971 (Qld) s 29(1): AD = AW / (AW + IW) x (K - 1/7 (AW + IW - K)), never
        // below nil; s 10: 4.95% above $6.5m; s 43I: 0.25% and 0.5% above $10m and $100m.
        "AU-QLD" => {
            let k = d(1_300_000);
            let deduction = share
                .times(&k.minus(&t.minus(&k).over(&Q::of(7))))
                .at_least_nil();
            let rate = Q::percent(if d(6_500_000).below(t) {
                49_500
            } else {
                47_500
            });
            let primary = w
                .minus(&d(10_000_000).times(&share))
                .times(&Q::percent(2_500));
            let additional = w
                .minus(&d(100_000_000).times(&share))
                .times(&Q::percent(5_000));
            (
                deduction.clone(),
                vec![w.minus(&deduction).times(&rate)],
                [primary, additional],
            )
        }
        // Pay-roll Tax Assessment Act 2002 (WA) s 13: nil to AT; DA = (AT - (TW - AT) x TV) x W / TW
        // below UT, TV = AT / (UT - AT); nil deduction from UT. Pay-roll Tax Act 2002 s 5(4): 5.5%.
        "AU-WA" => {
            let (at, ut) = (d(1_000_000), d(7_500_000));
            let deduction = if !at.below(t) {
                w.clone()
            } else if !t.below(&ut) {
                Q::of(0)
            } else {
                at.minus(&t.minus(&at).times(&at.over(&ut.minus(&at))))
                    .times(&share)
            };
            (
                deduction.clone(),
                vec![w.minus(&deduction).times(&Q::percent(55_000))],
                nil(),
            )
        }
        // Payroll Tax Act 2009 (SA) Sch 1 cl 5: nil to $1.5m; [TW - TW / (TW + IW) x EA] x R, with
        // R = (TARW - $1.5m) / $200,000 x 4.95% to $1.7m.
        "AU-SA" => {
            let deduction = share.times(&d(600_000));
            if !d(1_500_000).below(t) {
                return (deduction, vec![], nil());
            }
            let full = Q::percent(49_500);
            let rate = if d(1_700_000).below(t) {
                full
            } else {
                t.minus(&d(1_500_000)).over(&d(200_000)).times(&full)
            };
            (
                deduction.clone(),
                vec![w.minus(&deduction).times(&rate)],
                nil(),
            )
        }
        // Payroll Tax Act 2008 (Tas) Sch 1 cl 4(4) and (5).
        "AU-TAS" => {
            let (ta, ttb) = (d(1_250_000), d(2_000_000));
            let deduction = share.times(&ta);
            if !ta.below(t) {
                return (deduction, vec![], nil());
            }
            let taxes = if !ttb.below(t) {
                vec![w.minus(&deduction).times(&Q::percent(40_000))]
            } else {
                vec![
                    ttb.minus(&ta).times(&share).times(&Q::percent(40_000)),
                    w.minus(&share.times(&ttb)).times(&Q::percent(61_000)),
                ]
            };
            (deduction, taxes, nil())
        }
        // Payroll Tax Act 2011 (ACT) Sch 1 s 1.5, with DI2026-151 Table 1's rate for total wages.
        "AU-ACT" => {
            let rate = [
                (20_000_000, 67_500),
                (50_000_000, 68_500),
                (100_000_000, 73_500),
                (150_000_000, 78_500),
            ]
            .iter()
            .find(|(to, _)| !d(*to).below(t))
            .map_or(87_500, |(_, rate)| *rate);
            let deduction = share.times(&d(1_750_000));
            (
                deduction.clone(),
                vec![w.minus(&deduction).times(&Q::percent(rate))],
                nil(),
            )
        }
        // Payroll Tax Act 2009 (NT) Sch 1 cl 3 and 5, s 7A: 6.5% from $100m.
        "AU-NT" => {
            let ta = d(2_500_000);
            let adjusted = ta.minus(&t.minus(&ta).over(&Q::of(2))).at_least_nil();
            let rate = Q::percent(if t.below(&d(100_000_000)) {
                55_000
            } else {
                65_000
            });
            let deduction = share.times(&adjusted);
            (
                deduction.clone(),
                vec![w.minus(&deduction).times(&rate)],
                nil(),
            )
        }
        _ => unreachable!("a place in PAYROLL_TAX_PLACES"),
    }
}

/// What the engine must return, each amount half up to the cent once and each total the sum
/// of the amounts shown.
fn payroll_tax_oracle(wages: u64, australian: u64, place: &str) -> Value {
    let (w, t) = (Q::of(wages), Q::of(australian));
    let (deduction, taxes, levies) = if australian == 0 {
        (Q::of(0), vec![], [Q::of(0), Q::of(0)])
    } else {
        payroll_tax_terms(place, &w, &t)
    };
    let deduction = deduction.least(w.clone());
    let tax: u64 = taxes
        .into_iter()
        .map(|term| term.at_least_nil().cents())
        .sum();
    let [levy, extra] = levies.map(|term| term.at_least_nil().cents());
    json!({
        "deduction": shown(deduction.cents()),
        "taxable": shown(w.minus(&deduction).cents()),
        "tax": shown(tax),
        "levy": shown(levy),
        "extraLevy": shown(extra),
        "total": shown(tax + levy + extra),
    })
}

fn payroll_tax_case(rng: &mut Seeded) -> (Value, Value) {
    let place = rng.pick(&PAYROLL_TAX_PLACES);
    let edge = rng.pick(&PAYROLL_TAX_EDGES) * 100;
    let any = rng.cents(MAX_WAGES);
    let australian = rng.pick(&[edge - 1, edge, edge + 1, any, any, 0]);
    // Half the cases pay all their wages in the jurisdiction and leave Australian wages blank.
    let wages = if australian == 0 || rng.below(2) == 0 {
        australian
    } else {
        rng.cents(australian)
    };
    let blank = wages == australian && rng.below(2) == 0;
    (
        json!({"wages": dollars(wages), "australian": if blank { String::new() } else { dollars(australian) }, "place": place}),
        payroll_tax_oracle(wages, australian, place),
    )
}

#[test]
fn the_payroll_tax_oracle_works_the_revenue_offices_examples() {
    let total = |wages: u64, australian: u64, place: &str| {
        payroll_tax_oracle(wages * 100, australian * 100, place)["total"].clone()
    };
    // Revenue NSW: $1,500,000 is taxed on $300,000; Victoria's surcharge example, $80m of $150m;
    // RevenueWA: $1,104,000 gives $6,600; Tasmania's guideline examples 1 and 2.
    assert_eq!(total(1_500_000, 1_500_000, "AU-NSW"), json!("16350"));
    let victoria = payroll_tax_oracle(8_000_000_000, 15_000_000_000, "AU-VIC");
    assert_eq!(
        (&victoria["levy"], &victoria["extraLevy"]),
        (&json!("506666.67"), &json!("506666.67"))
    );
    assert_eq!(total(1_104_000, 1_104_000, "AU-WA"), json!("6600"));
    assert_eq!(total(2_400_000, 2_400_000, "AU-TAS"), json!("54400"));
    assert_eq!(total(2_400_000, 3_000_000, "AU-TAS"), json!("72800"));
    // The Queensland Revenue Office's deduction of $932,460, to the dollar; RevenueSA's $150,000.
    let queensland = payroll_tax_oracle(135_678_900, 178_977_600, "AU-QLD");
    assert_eq!(queensland["deduction"], json!("932459.64"));
    assert_eq!(
        payroll_tax_oracle(50_000_000, 200_000_000, "AU-SA")["deduction"],
        json!("150000")
    );
}

#[test]
fn the_payroll_tax_engine_agrees_with_the_oracle_at_each_act_rate_edge() {
    if !common::rendered() {
        return;
    }
    let (mut cases, mut expected) = (vec![], vec![]);
    for edge in [20_000_000_u64, 50_000_000, 100_000_000, 150_000_000] {
        for australian in [edge * 100 - 1, edge * 100, edge * 100 + 1] {
            let wages = australian / 3;
            cases.push(json!({"wages": dollars(wages), "australian": dollars(australian), "place": "AU-ACT"}));
            expected.push(payroll_tax_oracle(wages, australian, "AU-ACT"));
        }
    }
    assert_eq!(run_node(PAYROLL_TAX_HARNESS, &cases), expected);
}

#[test]
fn the_payroll_tax_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1117_0000_0B7A);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..PAYROLL_TAX_CASES)
        .map(|_| payroll_tax_case(&mut rng))
        .unzip();
    let actual = run_node(PAYROLL_TAX_HARNESS, &cases);
    assert_eq!(actual.len(), PAYROLL_TAX_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the super guarantee charge engines, as `HARNESS` runs the others; a refusal comes
/// back as its message.
const SGC_HARNESS: &str = r"
import { paydaySuperCharge, quarterlySgCharge } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const KEYS = { payday: ['due', 'sgAmount', 'base', 'final', 'days', 'assumedDays', 'notional', 'upliftPercent', 'uplift', 'charge'],
  quarter: ['payable', 'chargePercent', 'shortfall', 'days', 'interest', 'administration', 'charge'] };
const run = ({ kind, inputs }) => {
  try {
    const r = (kind === 'payday' ? paydaySuperCharge : quarterlySgCharge)(inputs);
    return Object.fromEntries(KEYS[kind].map((key) => [key, String(r[key])]));
  } catch (error) {
    return { refused: error.message };
  }
};
process.stdout.write(JSON.stringify(JSON.parse(input).map(run)));
";

const SGC_PAYDAY_CASES: usize = 240;
const SGC_QUARTER_CASES: usize = 120;
/// The latest assessment or statement date the engines take.
const SGC_LATEST: (i64, i64, i64) = (2031, 6, 30);
/// The maximum contributions base for 2026-27, $270,830 (ATO Key superannuation rates and
/// thresholds, Table 23), in cents.
const SGC_MAXIMUM_BASE: u64 = 27_083_000;
/// The old law's charge percentage in tenths of 1% and quarterly maximum contribution base in
/// cents, by income year (old s 19(2); ATO Key superannuation rates and thresholds, Table 24).
const SGC_YEARS: [(&str, u64, u64); 4] = [
    ("2022-23", 105, 6_022_000),
    ("2023-24", 110, 6_227_000),
    ("2024-25", 115, 6_507_000),
    ("2025-26", 120, 6_250_000),
];

/// Every business day from 1 July 2026 to the calendar's last verified day: the weekdays not
/// listed in the published CSV, which the oracle reads instead of the engine's copy.
fn sgc_business_days() -> Vec<i64> {
    let site = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let csv = std::fs::read_to_string(
        site.join("tools/payday-super/business-days/payday-super-business-days.csv"),
    )
    .unwrap();
    let holidays: Vec<i64> = csv
        .lines()
        .skip(1)
        .map(|line| parse_iso(line.split(',').next().unwrap()))
        .collect();
    let calendar: Value = serde_json::from_str(
        &std::fs::read_to_string(site.join("_data/payday_super_business_days.json")).unwrap(),
    )
    .unwrap();
    let end = parse_iso(calendar["verified_until"].as_str().unwrap());
    // Day 0, 1 January 1970, was a Thursday: (day + 3) mod 7 counts from Monday.
    (day_number(2026, 7, 1)..=end)
        .filter(|day| (day + 3).rem_euclid(7) < 5 && !holidays.contains(day))
        .collect()
}

/// The `n`th business day after `day`, or `None` past the calendar.
fn sgc_after(business: &[i64], day: i64, n: usize) -> Option<i64> {
    business
        .get(business.partition_point(|d| *d <= day) + n - 1)
        .copied()
}

/// Notional earnings in cents: each day adds the day's rate on the base and the earnings so
/// far, carried as an exact fraction. `rates` holds each day's annual rate in hundredths of 1%
/// and the days in its calendar year.
fn sgc_notional(base: u64, rates: &[(u64, u64)]) -> u64 {
    let (mut earned, mut over) = (BigUint::ZERO, BigUint::from(1_u8));
    for (rate, year) in rates {
        let whole = BigUint::from(10_000 * year);
        earned = &earned * &whole + (BigUint::from(base) * &over + &earned) * rate;
        over *= whole;
    }
    half_up(&earned, &over)
}

struct Payday {
    payday: i64,
    timing: &'static str,
    other: i64,
    earnings: u64,
    earlier: u64,
    on_time: u64,
    late: u64,
    received: i64,
    assessment: i64,
    assessed: bool,
    lodged: Option<i64>,
    assumed: u64,
}

/// The end of the usual period, or of the latest longer period that applies (s 18C(2)).
fn sgc_due(business: &[i64], p: &Payday) -> Option<i64> {
    let first = sgc_after(business, p.payday, 20);
    let out_of_cycle = sgc_after(business, p.other, 7);
    let exceptional = sgc_after(business, p.other, 20).and_then(|made| Some(made.max(first?)));
    let items = match p.timing {
        "standard" => vec![],
        "first" => vec![first],
        "out-of-cycle" => vec![out_of_cycle],
        "exceptional" => vec![exceptional],
        "first-out-of-cycle" => vec![first, out_of_cycle],
        _ => vec![out_of_cycle, exceptional],
    };
    items
        .into_iter()
        .try_fold(sgc_after(business, p.payday, 7)?, |due, item| {
            Some(due.max(item?))
        })
}

/// What the payday engine must return, each value as JavaScript prints it.
fn sgc_payday_oracle(business: &[i64], quarters: &[(i64, i64, u64)], p: &Payday) -> Value {
    let Some(due) = sgc_due(business, p) else {
        return json!({"refused": "That due date falls after 31 August 2027, where the business day calendar ends."});
    };
    let counted = p.earnings.min(SGC_MAXIMUM_BASE.saturating_sub(p.earlier));
    let sg = half_up(&BigUint::from(counted * 12), &BigUint::from(100_u8));
    let base = sg.saturating_sub(p.on_time);
    let shown_all = |base: u64,
                     last: u64,
                     days: i64,
                     assumed_days: usize,
                     earned: u64,
                     percent: u64| {
        let uplift = half_up(
            &BigUint::from((last + earned) * percent),
            &BigUint::from(100_u8),
        );
        json!({
            "due": iso_day(due), "sgAmount": shown(sg), "base": shown(base), "final": shown(last),
            "days": days.to_string(), "assumedDays": assumed_days.to_string(), "notional": shown(earned),
            "upliftPercent": percent.to_string(), "uplift": shown(uplift), "charge": shown(last + earned + uplift),
        })
    };
    if base == 0 {
        return shown_all(0, 0, 0, 0, 0, 0);
    }
    let last = base - p.late.min(base);
    let to = if last == 0 && p.late > 0 {
        p.received
    } else {
        p.assessment - 1
    };
    let table_end = quarters.iter().map(|quarter| quarter.1).max().unwrap();
    let rates: Vec<(u64, u64)> = (due + 1..=to)
        .map(|day| {
            let rate = quarters
                .iter()
                .find(|q| q.0 <= day && day <= q.1)
                .map_or(p.assumed, |q| q.2);
            let year = civil(day).0;
            (
                rate,
                u64::try_from(day_number(year + 1, 1, 1) - day_number(year, 1, 1)).unwrap(),
            )
        })
        .collect();
    let assumed_days = (due + 1..=to).filter(|day| *day > table_end).count();
    // Regulation 13C takes 20 points for a first offence; regulation 13D takes 40, 35, 30 or 15
    // for a disclosure within the 30, 60 or 120-day period starting on the payday, or later.
    let disclosed = p.lodged.map_or(0, |day| match day - p.payday {
        k if k < 30 => 40,
        k if k < 60 => 35,
        k if k < 120 => 30,
        _ => 15,
    });
    let percent = 60 - (if p.assessed { 0 } else { 20 }) - disclosed;
    shown_all(
        base,
        last,
        (to - due).max(0),
        assumed_days,
        sgc_notional(base, &rates),
        percent,
    )
}

fn sgc_payday_case(
    rng: &mut Seeded,
    business: &[i64],
    quarters: &[(i64, i64, u64)],
) -> (Value, Value) {
    let start = day_number(2026, 7, 1);
    let end = *business.last().unwrap();
    let latest = day_number(SGC_LATEST.0, SGC_LATEST.1, SGC_LATEST.2);
    let payday = start + i64::try_from(rng.below(365)).unwrap();
    let timing = rng.pick(&[
        "standard",
        "standard",
        "first",
        "out-of-cycle",
        "exceptional",
        "first-out-of-cycle",
        "out-of-cycle-exceptional",
    ]);
    let other = match timing {
        "out-of-cycle" | "first-out-of-cycle" | "out-of-cycle-exceptional" => {
            (payday + 1 + i64::try_from(rng.below(40)).unwrap()).min(end)
        }
        _ => start + i64::try_from(rng.below(u64::try_from(end - start + 1).unwrap())).unwrap(),
    };
    let (any_earnings, small_earnings) =
        (1 + rng.cents(MAX_PRINCIPAL - 1), 1 + rng.cents(2_000_000));
    let (near_base, any_earlier) = (
        SGC_MAXIMUM_BASE - rng.cents(500_000),
        rng.cents(MAX_PRINCIPAL),
    );
    let any_rate = 1 + rng.below(10_000);
    let mut p = Payday {
        payday,
        timing,
        other,
        earnings: rng.pick(&[100_000, any_earnings, small_earnings]),
        earlier: rng.pick(&[0, 0, near_base, any_earlier]),
        on_time: 0,
        late: 0,
        received: payday + 1,
        assessment: payday + 1,
        assessed: rng.pick(&[true, false]),
        lodged: None,
        assumed: rng.pick(&[1151, any_rate]),
    };
    if let Some(due) = sgc_due(business, &p) {
        let counted = p.earnings.min(SGC_MAXIMUM_BASE.saturating_sub(p.earlier));
        let sg = half_up(&BigUint::from(counted * 12), &BigUint::from(100_u8));
        let part = rng.below(sg + 1);
        p.on_time = rng.pick(&[0, 0, sg, sg.saturating_sub(1), part, sg + 500]);
        let base = sg.saturating_sub(p.on_time);
        let span = rng.pick(&[1, 2, 30, 200, 900]);
        p.assessment = (due + 1 + i64::try_from(rng.below(span)).unwrap()).min(latest);
        if p.assessment - due >= 2 {
            let part = rng.below(base + 1);
            p.late = rng.pick(&[0, base, base.saturating_sub(1), part, base + 1000]);
            p.received = due
                + 1
                + i64::try_from(rng.below(u64::try_from(p.assessment - due - 1).unwrap())).unwrap();
        }
        if rng.pick(&[true, false]) {
            p.lodged = Some(
                payday
                    + i64::try_from(rng.below(u64::try_from(p.assessment - payday).unwrap()))
                        .unwrap(),
            );
        }
    }
    let inputs = json!({
        "payday": iso_day(p.payday), "timing": p.timing, "nextPayday": iso_day(p.other), "determination": iso_day(p.other),
        "earnings": dollars(p.earnings), "earlier": dollars(p.earlier), "onTime": dollars(p.on_time), "late": dollars(p.late),
        "received": iso_day(p.received), "assessment": iso_day(p.assessment), "assessed": if p.assessed { "yes" } else { "no" },
        "disclosure": if p.lodged.is_some() { "lodged" } else { "none" }, "lodged": iso_day(p.lodged.unwrap_or(p.payday)),
        "assumedRate": format!("{}.{:02}", p.assumed / 100, p.assumed % 100),
    });
    (
        json!({"kind": "payday", "inputs": inputs}),
        sgc_payday_oracle(business, quarters, &p),
    )
}

/// What the quarterly engine must return. `percent` is in tenths of 1%.
fn sgc_quarter_oracle(
    year: &str,
    quarter: i64,
    wages: u64,
    ote: u64,
    contributions: u64,
    lodged: i64,
) -> Value {
    let (_, percent, cap) = SGC_YEARS
        .iter()
        .find(|entry| entry.0 == year)
        .copied()
        .unwrap();
    let first: i64 = year[..4].parse().unwrap();
    // The quarter's first month and the month of its lodgment day, the 28th of the second
    // month after it (old s 46(2)).
    let (year_of, month, lodgment_month) = [
        (first, 7, 11),
        (first, 10, 2),
        (first + 1, 1, 5),
        (first + 1, 4, 8),
    ][usize::try_from(quarter - 1).unwrap()];
    let start = day_number(year_of, month, 1);
    let lodgment = day_number(
        if lodgment_month < month {
            year_of + 1
        } else {
            year_of
        },
        lodgment_month,
        28,
    );
    let payable = lodgment.max(lodged);
    if (start..payable).any(|day| civil(day).1 == 2 && civil(day).2 == 29) {
        return json!({"refused": "The nominal interest period includes 29 February, and the ATO does not say whether that year has 365 or 366 days."});
    }
    let (wages, ote) = (u128::from(wages.min(cap)), u128::from(ote.min(cap)));
    let contributions = u128::from(contributions);
    // The percentage less contributions as a share of OTE, over 1,000 x OTE (s 19 and s 23).
    let (top, bottom) = if ote == 0 {
        (u128::from(percent), 1000)
    } else {
        (
            (u128::from(percent) * ote).saturating_sub(1000 * contributions),
            1000 * ote,
        )
    };
    let shortfall = exact_half_up(wages * top, bottom);
    let days = u128::try_from(payable - start).unwrap();
    let interest = exact_half_up(shortfall * days, 3650);
    let administration = if shortfall > 0 { 2000 } else { 0 };
    let cents = |value: u128| shown(u64::try_from(value).unwrap());
    json!({
        "payable": iso_day(payable), "chargePercent": cents(exact_half_up(top * 10_000, bottom)),
        "shortfall": cents(shortfall), "days": days.to_string(), "interest": cents(interest),
        "administration": cents(administration), "charge": cents(shortfall + interest + administration),
    })
}

fn sgc_quarter_case(rng: &mut Seeded) -> (Value, Value) {
    let (year, percent, cap) = rng.pick(&SGC_YEARS);
    let quarter = i64::try_from(1 + rng.below(4)).unwrap();
    let any_wages = rng.cents(MAX_PRINCIPAL);
    let wages = rng.pick(&[1_200_000, any_wages, cap, cap + 1]);
    let (part, above) = (
        rng.cents(wages.max(1)),
        cap + 1 + rng.cents(MAX_PRINCIPAL - cap - 1),
    );
    let ote = rng.pick(&[0, wages, part, above]);
    let full = u64::try_from(exact_half_up(u128::from(ote.min(cap) * percent), 1000)).unwrap();
    let some = rng.below(full + 1);
    let contributions = if ote == 0 {
        0
    } else {
        rng.pick(&[0, full, full / 2, some, full + 100])
    };
    let first: i64 = year[..4].parse().unwrap();
    let ends = [
        day_number(first, 9, 30),
        day_number(first, 12, 31),
        day_number(first + 1, 3, 31),
        day_number(first + 1, 6, 30),
    ];
    let due = ends[usize::try_from(quarter - 1).unwrap()] + 28;
    let span = rng.pick(&[1, 60, 400, 2000]);
    let latest = day_number(SGC_LATEST.0, SGC_LATEST.1, SGC_LATEST.2);
    let lodged = (due + 1 + i64::try_from(rng.below(span)).unwrap()).min(latest);
    let inputs = json!({
        "year": year, "quarter": quarter.to_string(), "wages": dollars(wages), "ote": dollars(ote),
        "contributions": dollars(contributions), "lodged": iso_day(lodged),
    });
    (
        json!({"kind": "quarter", "inputs": inputs}),
        sgc_quarter_oracle(year, quarter, wages, ote, contributions, lodged),
    )
}

#[test]
fn the_sgc_oracle_works_the_ato_examples_by_hand() {
    let business = sgc_business_days();
    // ATO, Payment deadlines for Payday Super: Hannah's 30 July 2026 payday is due 11 August,
    // after NT Picnic Day; Floyd's first contribution on 7 August, 4 September.
    assert_eq!(
        iso_day(sgc_after(&business, day_number(2026, 7, 30), 7).unwrap()),
        "2026-08-11"
    );
    assert_eq!(
        iso_day(sgc_after(&business, day_number(2026, 8, 7), 20).unwrap()),
        "2026-09-04"
    );
    assert_eq!(sgc_after(&business, day_number(2027, 8, 30), 7), None);
    // ATO, Making a voluntary disclosure for Payday Super: Juliet's $3,600 at 10% earns $24.74
    // over 25 days and $49.65 over 50.
    assert_eq!(sgc_notional(360_000, &[(1000, 365); 25]), 2474);
    assert_eq!(sgc_notional(360_000, &[(1000, 365); 50]), 4965);
    // ATO module 6: one of Imogen's 30 employees, $12,000 in quarter 1 of 2025-26, lodged
    // 20 November 2025: $1,440, 150 days, $59.18 and $20.
    assert_eq!(
        sgc_quarter_oracle(
            "2025-26",
            1,
            1_200_000,
            1_000_000,
            0,
            day_number(2025, 11, 20)
        ),
        json!({"payable": "2025-11-28", "chargePercent": "12", "shortfall": "1440", "days": "150",
            "interest": "59.18", "administration": "20", "charge": "1519.18"})
    );
    // The page's opening case: $120 due 11 August, received 25 August, assessed 1 December.
    let opening = Payday {
        payday: day_number(2026, 7, 30),
        timing: "standard",
        other: day_number(2026, 7, 30),
        earnings: 100_000,
        earlier: 0,
        on_time: 0,
        late: 12_000,
        received: day_number(2026, 8, 25),
        assessment: day_number(2026, 12, 1),
        assessed: false,
        lodged: None,
        assumed: 1151,
    };
    let result = sgc_payday_oracle(&business, &gic_quarters(), &opening);
    for (key, want) in [
        ("due", "2026-08-11"),
        ("days", "14"),
        ("notional", "0.53"),
        ("upliftPercent", "40"),
        ("uplift", "0.21"),
        ("charge", "0.74"),
    ] {
        assert_eq!(result[key], want, "{key}");
    }
}

#[test]
fn the_sgc_engines_agree_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let (business, quarters) = (sgc_business_days(), gic_quarters());
    let mut rng = Seeded(0x2026_1118_0000_5C6C);
    let mut pairs: Vec<_> = (0..SGC_PAYDAY_CASES)
        .map(|_| sgc_payday_case(&mut rng, &business, &quarters))
        .collect();
    pairs.extend((0..SGC_QUARTER_CASES).map(|_| sgc_quarter_case(&mut rng)));
    let (cases, expected): (Vec<_>, Vec<_>) = pairs.into_iter().unzip();
    let actual = run_node(SGC_HARNESS, &cases);
    assert_eq!(actual.len(), SGC_PAYDAY_CASES + SGC_QUARTER_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the company tax and foreign surcharge engines, as `HARNESS` runs the others.
const COMPANY_SURCHARGE_HARNESS: &str = r"
import { companyTax, foreignSurcharge } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const shown = (r, keys) => Object.fromEntries(keys.map((key) => [key, String(r[key])]));
const run = {
  company: ({ input }) => shown(companyTax(input), ['rate', 'tax', 'imputationRate', 'maximum', 'credit', 'grossedUp', 'shareholderTax', 'net']),
  surcharge: ({ buyer, purchase }) => shown(foreignSurcharge(buyer, purchase), ['duty', 'land']),
};
process.stdout.write(JSON.stringify(JSON.parse(input).map((one) => run[one.kind](one))));
";

const COMPANY_TAX_CASES: usize = 200;
const SURCHARGE_CASES: usize = 200;
/// The largest amount the company tax fields accept, $1,000,000,000,000.00, in cents.
const MAX_COMPANY_CENTS: u64 = 100_000_000_000_000;

/// Section 23AA of the Income Tax Rates Act 1986: aggregated turnover under $50 million and base
/// rate entity passive income of no more than 80%, here 4/5, of assessable income.
fn base_rate_entity([turnover, assessable, passive]: [u64; 3]) -> bool {
    turnover < 5_000_000_000 && u128::from(passive) * 5 <= u128::from(assessable) * 4
}

/// The company tax rate and tax, half up; the corporate tax rate for imputation purposes from the
/// previous year, or 25% for a new company (section 995-1); the maximum franking credit as the
/// dividend times 1 over the gross-up rate, which is 1/3 at 25% and 3/7 at 30% (section 202-60),
/// and the credit at the franking percentage, both rounded down; and an individual's tax at the
/// marginal rate on the grossed-up dividend, half up, less the credit. Rates are in hundredths of 1%.
fn company_tax_oracle(
    this: [u64; 3],
    taxable: u64,
    prior: Option<[u64; 3]>,
    dividend: u64,
    franking: u64,
    marginal: u64,
) -> Value {
    let rate: u128 = if base_rate_entity(this) { 25 } else { 30 };
    let (imputation, n, d): (u128, u128, u128) = if prior.is_none_or(base_rate_entity) {
        (25, 1, 3)
    } else {
        (30, 3, 7)
    };
    let dividend = u128::from(dividend);
    let maximum = dividend * n / d;
    let credit = dividend * n * u128::from(franking) / (d * 10_000);
    let grossed_up = dividend + credit;
    let shareholder = exact_half_up(grossed_up * u128::from(marginal), 10_000);
    let cents = |value: u128| shown(u64::try_from(value).unwrap());
    json!({
        "rate": rate.to_string(),
        "tax": cents(exact_half_up(u128::from(taxable) * rate, 100)),
        "imputationRate": imputation.to_string(),
        "maximum": cents(maximum),
        "credit": cents(credit),
        "grossedUp": cents(grossed_up),
        "shareholderTax": cents(shareholder),
        "net": shown_signed(i128::try_from(shareholder).unwrap() - i128::try_from(credit).unwrap()),
    })
}

/// One income year's turnover, assessable income and passive income, in cents, with turnover
/// either side of $50 million and passive income either side of 80% as often as anywhere.
fn company_year(rng: &mut Seeded) -> [u64; 3] {
    let any_turnover = rng.cents(MAX_COMPANY_CENTS);
    let turnover = rng.pick(&[
        4_999_999_999,
        5_000_000_000,
        5_000_000_001,
        any_turnover,
        any_turnover,
    ]);
    let assessable = 5 * (1 + rng.cents(MAX_COMPANY_CENTS / 5 - 1));
    let any_passive = rng.cents(assessable);
    let limit = assessable / 5 * 4;
    let passive = rng.pick(&[limit - 1, limit, limit + 1, any_passive, any_passive, 0]);
    [turnover, assessable, passive]
}

fn company_tax_case(rng: &mut Seeded) -> (Value, Value) {
    let this = company_year(rng);
    let prior = if rng.below(4) == 0 {
        None
    } else {
        Some(company_year(rng))
    };
    let taxable = rng.cents(MAX_COMPANY_CENTS);
    let dividend = rng.cents(MAX_COMPANY_CENTS);
    let any_franking = rng.below(10_001);
    let (franking, marginal) = (rng.pick(&[0, 10_000, any_franking]), rng.below(10_001));
    let year = |[turnover, assessable, passive]: [u64; 3]| json!({"turnover": dollars(turnover), "assessable": dollars(assessable), "passive": dollars(passive)});
    let percent = |hundredths: u64| format!("{}.{:02}", hundredths / 100, hundredths % 100);
    let mut input = year(this);
    let fields = json!({
        "taxable": dollars(taxable), "existed": prior.is_some(), "prior": year(prior.unwrap_or([0, 0, 0])),
        "dividend": dollars(dividend), "franking": percent(franking), "marginal": percent(marginal),
    });
    input
        .as_object_mut()
        .unwrap()
        .extend(fields.as_object().unwrap().clone());
    (
        json!({"kind": "company", "input": input}),
        company_tax_oracle(this, taxable, prior, dividend, franking, marginal),
    )
}

/// Each surcharge as its revenue office states it, read 18 November 2026, typed here rather than
/// read from the engine's table: the duty rate per cent in hundredths by jurisdiction and use, and
/// the land tax surcharge in cents on whole dollars of land for a foreign individual, or for a
/// Victorian fixed trust whose `trust` is the hundredths of 1% held by foreign persons, which
/// decide the duty, and by absentees, whose share of the land bears the surcharge from $25,000
/// rather than $50,000.
fn surcharge_oracle(
    place: &str,
    residential: bool,
    primary: bool,
    share: u64,
    land: u64,
    trust: Option<(u64, u64)>,
) -> Value {
    let duty_rate: u128 = match (place, residential, primary) {
        ("AU-NSW", true, _) => 900,
        ("AU-VIC" | "AU-QLD" | "AU-TAS", true, _) => 800,
        ("AU-WA" | "AU-SA", true, _) => 700,
        ("AU-TAS", _, true) => 150,
        _ => 0,
    };
    let foreign_for_duty = trust.is_none_or(|(foreign, _)| foreign > 5_000);
    let duty = if foreign_for_duty {
        exact_half_up(u128::from(share) * duty_rate, 100)
    } else {
        0
    };
    let land = u128::from(land);
    let surcharge = match (place, residential) {
        ("AU-NSW", true) => land * 5,
        ("AU-VIC", _) => match trust {
            None if land >= 50_000 => land * 4,
            Some((_, absent)) if land >= 25_000 => {
                exact_half_up(land * 4 * u128::from(absent), 10_000)
            }
            _ => 0,
        },
        ("AU-QLD", _) => land.saturating_sub(350_000) * 3,
        ("AU-TAS", true) => land * 2,
        ("AU-ACT", true) => exact_half_up(land * 75, 100),
        _ => 0,
    };
    json!({"duty": shown(u64::try_from(duty).unwrap()), "land": shown(u64::try_from(surcharge).unwrap())})
}

const SURCHARGE_PLACES: [&str; 8] = [
    "AU-NSW", "AU-VIC", "AU-QLD", "AU-WA", "AU-SA", "AU-TAS", "AU-ACT", "AU-NT",
];

fn surcharge_case(rng: &mut Seeded) -> (Value, Value) {
    let place = rng.pick(&SURCHARGE_PLACES);
    let use_ = rng.pick(&["residential", "residential", "primary", "other"]);
    let value = 1 + rng.cents(999_999_999);
    let part = 1 + rng.below(value);
    let share = rng.pick(&[value, part]);
    let any_land = rng.cents(1_000_000_000);
    let land = rng.pick(&[
        24_999, 25_000, 49_999, 50_000, 350_000, 350_001, any_land, any_land,
    ]);
    let any_held = rng.below(10_001);
    let any_absent = rng.below(10_001);
    // A fixed trust's foreign and absentee shares are drawn apart: a foreign owner living here is no absentee.
    let trust = if place == "AU-VIC" && rng.below(2) == 0 {
        let foreign = rng.pick(&[5_000, 5_001, any_held]);
        Some((foreign, rng.pick(&[0, foreign, any_absent])))
    } else {
        None
    };
    let percent = |hundredths: u64| format!("{}.{:02}", hundredths / 100, hundredths % 100);
    let buyer = json!({
        "type": if trust.is_some() { "trust" } else { "individual" }, "status": "other", "daysBefore": "0", "daysDecember": "0",
        "nzResident": false, "resides": false, "absent": true, "home": false, "overseas": false, "largest": "0",
        "combined": percent(trust.map_or(0, |(foreign, _)| foreign)), "absentee": percent(trust.map_or(0, |(_, absent)| absent)), "capital": "0", "amendable": false, "control": false, "named": false,
        "defaults": "0", "exemption": false,
    });
    (
        json!({"kind": "surcharge", "buyer": buyer, "purchase":
            {"place": place, "use": use_, "value": value.to_string(), "share": share.to_string(), "land": land.to_string()}}),
        surcharge_oracle(
            place,
            use_ == "residential",
            use_ == "primary",
            share,
            land,
            trust,
        ),
    )
}

#[test]
fn the_company_tax_and_surcharge_oracles_work_the_published_examples() {
    let happy = [10_400_000, 10_400_000, 400_000];
    // ATO: Happy Feet's income gives 25%; Dillmore Manufacture franks $100,000 at 30% for an exact
    // $42,857.14, where the ATO shows $42,857.75 from a rounded gross-up rate.
    let feet = company_tax_oracle(happy, 10_400_000, Some(happy), 3_000_000, 10_000, 3_000);
    assert_eq!(
        (&feet["rate"], &feet["tax"], &feet["net"]),
        (&json!("25"), &json!("26000"), &json!("2000"))
    );
    let dillmore = company_tax_oracle(
        [4_500_000_000, 4_500_000_000, 0],
        0,
        Some([5_200_000_000, 5_200_000_000, 0]),
        10_000_000,
        10_000,
        0,
    );
    assert_eq!(
        (&dillmore["rate"], &dillmore["maximum"], &dillmore["net"]),
        (&json!("25"), &json!("42857.14"), &json!("-42857.14"))
    );
    // Revenue NSW: 9% of $1,000,000 and 5% of $1,200,000; SRO Victoria's Clara, a fixed trust half
    // held for absentees, $20,000 on $1,000,000; Queensland, 3% above $350,000; the ACT, 0.75% of $600,000.
    assert_eq!(
        surcharge_oracle("AU-NSW", true, false, 1_000_000, 1_200_000, None),
        json!({"duty": "90000", "land": "60000"})
    );
    assert_eq!(
        surcharge_oracle(
            "AU-VIC",
            true,
            false,
            1_000_000,
            1_000_000,
            Some((5_000, 5_000))
        ),
        json!({"duty": "0", "land": "20000"})
    );
    assert_eq!(
        surcharge_oracle("AU-QLD", true, false, 400_000, 400_000, None),
        json!({"duty": "32000", "land": "1500"})
    );
    assert_eq!(
        surcharge_oracle("AU-ACT", true, false, 600_000, 600_000, None),
        json!({"duty": "0", "land": "4500"})
    );
}

#[test]
fn the_company_tax_and_surcharge_engines_agree_with_the_oracles_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1118_0000_C0DE);
    let (mut cases, mut expected): (Vec<_>, Vec<_>) = (0..COMPANY_TAX_CASES)
        .map(|_| company_tax_case(&mut rng))
        .unzip();
    let (more, more_expected): (Vec<_>, Vec<_>) = (0..SURCHARGE_CASES)
        .map(|_| surcharge_case(&mut rng))
        .unzip();
    cases.extend(more);
    expected.extend(more_expected);
    let actual = run_node(COMPANY_SURCHARGE_HARNESS, &cases);
    assert_eq!(actual.len(), COMPANY_TAX_CASES + SURCHARGE_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the GST margin scheme engine, as `HARNESS` runs the others.
const MARGIN_SCHEME_HARNESS: &str = r"
import { gstMarginScheme } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const keys = ['applies', 'share', 'consideration', 'margin', 'schemeGst', 'basicGst', 'saving', 'gst'];
process.stdout.write(JSON.stringify(JSON.parse(input).map((one) => {
  const r = gstMarginScheme(one);
  return Object.fromEntries(keys.map((key) => [key, String(r[key])]));
})));
";

const MARGIN_SCHEME_CASES: usize = 200;
/// The largest price or cost the margin scheme fields accept, $1,000,000,000,000.00, in cents.
const MAX_MARGIN_CENTS: u64 = 100_000_000_000_000;

/// The margin scheme in tenths of a cent, by subsections 75-10(1) and (2) and section 75-15. The
/// part's share of the cost is `part` / `whole` of it, shown half up to the cent; each GST is worked
/// from the exact share and rounded once. On a GST-inclusive price P the margin is P less the share,
/// or nil, and its GST 1/11 of it. On a GST-exclusive price E the
/// price the buyer pays is E plus a GST that is 1/11 of the margin on that price, so the margin is
/// 11 times (E less the share) over 10, and the GST is 1/11 of it, where the engine takes one tenth
/// of E less the share. Without the margin scheme the GST is 1/11 of P or
/// 1/10 of E. Each GST rounds half up to the cent (section 9-90). The scheme applies only for
/// freehold, a stratum unit or a long-term lease, with a written agreement, and not to property
/// bought with GST on the whole price (section 75-5).
#[allow(clippy::too_many_arguments)]
fn margin_scheme_oracle(
    interest: &str,
    agreed: bool,
    acquired: &str,
    exclusive: bool,
    price: u64,
    cost: u64,
    part: u64,
    whole: u64,
) -> Value {
    let (price, cost) = (u128::from(price), u128::from(cost));
    let share = exact_half_up(cost * u128::from(part), u128::from(whole));
    // P (or E) less the exact share, over `whole`: price x whole - cost x part.
    let (part, whole) = (u128::from(part), u128::from(whole));
    let excess = (price * whole).saturating_sub(cost * part);
    let (scheme, consideration, basic) = if exclusive {
        // The margin on E plus its exact GST, 11 (E - share) / 10, then 1/11 of it.
        let scheme = exact_half_up(11 * excess, 110 * whole);
        (scheme, price + scheme, exact_half_up(price, 10))
    } else {
        (
            exact_half_up(excess, 11 * whole),
            price,
            exact_half_up(price, 11),
        )
    };
    let applies = interest != "other" && agreed && acquired != "full-gst";
    let cents = |value: u128| shown(u64::try_from(value).unwrap());
    json!({
        "applies": applies.to_string(),
        "share": cents(share),
        "consideration": cents(consideration),
        "margin": cents(exact_half_up((consideration * whole).saturating_sub(cost * part), whole)),
        "schemeGst": cents(scheme),
        "basicGst": cents(basic),
        "saving": cents(basic - scheme),
        "gst": cents(if applies { scheme } else { basic }),
    })
}

/// A sale the margin scheme can be worked for, with every condition and both price bases as often
/// as each other, a cost either side of the price, and the whole or a part of the land.
fn margin_scheme_case(rng: &mut Seeded) -> (Value, Value) {
    let interest = rng.pick(&["freehold", "stratum", "lease", "other"]);
    let agreed = rng.below(4) != 0;
    let acquired = rng.pick(&["margin", "untaxed", "before-2000", "full-gst"]);
    let method = if acquired == "before-2000" {
        rng.pick(&["consideration", "valuation"])
    } else {
        "consideration"
    };
    let exclusive = rng.below(2) == 0;
    let price = rng.cents(MAX_MARGIN_CENTS / 2);
    let any_cost = rng.cents(MAX_MARGIN_CENTS);
    let cost = rng.pick(&[any_cost, price, price.saturating_sub(1), price + 1, 0]);
    let whole = 1 + rng.cents(MAX_MARGIN_CENTS - 1);
    let any_part = 1 + rng.below(whole);
    let part = rng.pick(&[whole, any_part]);
    let measure = |hundredths: u64| format!("{}.{:02}", hundredths / 100, hundredths % 100);
    (
        json!({
            "interest": interest, "taxable": true, "agreed": agreed, "acquired": acquired, "associate": false,
            "method": method, "price": dollars(price), "basis": if exclusive { "exclusive" } else { "inclusive" },
            "cost": dollars(cost), "part": measure(part), "whole": measure(whole),
            "registrationAtTransition": "yes", "valuationProperty": "unimproved", "valuationDay": "2000-07-01",
        }),
        margin_scheme_oracle(
            interest, agreed, acquired, exclusive, price, cost, part, whole,
        ),
    )
}

#[test]
fn the_margin_scheme_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1119_0000_75A5);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..MARGIN_SCHEME_CASES)
        .map(|_| margin_scheme_case(&mut rng))
        .unzip();
    let actual = run_node(MARGIN_SCHEME_HARNESS, &cases);
    assert_eq!(actual.len(), MARGIN_SCHEME_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the CGT engine, as `HARNESS` runs the others.
const CGT_HARNESS: &str = r"
import { capitalGain } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const keys = ['method', 'costBase', 'indexedCostBase', 'reducedCostBase', 'gain', 'loss', 'net', 'labelA', 'carried',
  'ownershipDays', 'nonMainDays', 'partDays', 'incomeTime'];
const run = ({ sale }) => {
  const result = capitalGain(sale);
  return Object.fromEntries(keys.map((key) => [key, result[key] === null ? null : String(result[key])]));
};
process.stdout.write(JSON.stringify(JSON.parse(input).map(run)));
";

/// Runs the long service leave engine, as `HARNESS` runs the others. A refusal is reported as
/// one, without its wording, which the Node tests hold.
const LSL_HARNESS: &str = r"
import { longServiceLeave } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const run = (inputs) => {
  try {
    const r = longServiceLeave(inputs);
    return { years: r.years, months: r.months, days: r.days, counted: r.counted, weeks: String(r.weeks),
      balance: String(r.balance), value: String(r.value), next: r.next && [r.next.years, r.next.date, String(r.next.weeks)] };
  } catch {
    return { refused: true };
  }
};
process.stdout.write(JSON.stringify(JSON.parse(input).map(run)));
";

const CGT_CASES: usize = 400;

/// The CPI for the quarters ending March, June, September and December, in tenths, typed from
/// Appendix 2 of the ATO's Guide to capital gains tax 2026 (published 30 May 2026), read 19
/// November 2026; 0 where the table has no figure.
const CGT_CPI: [(i16, [u32; 4]); 15] = [
    (1985, [0, 0, 397, 405]),
    (1986, [414, 421, 432, 444]),
    (1987, [453, 460, 468, 476]),
    (1988, [484, 493, 502, 512]),
    (1989, [517, 530, 542, 552]),
    (1990, [562, 571, 575, 590]),
    (1991, [589, 590, 593, 599]),
    (1992, [599, 597, 598, 601]),
    (1993, [606, 608, 611, 612]),
    (1994, [615, 619, 623, 628]),
    (1995, [638, 647, 655, 660]),
    (1996, [662, 667, 669, 670]),
    (1997, [671, 669, 666, 668]),
    (1998, [670, 674, 675, 678]),
    (1999, [678, 681, 687, 0]),
];

#[derive(Clone, Copy, PartialEq)]
enum Owner {
    Individual,
    Trust,
    Super,
    Company,
}

struct Away {
    from: Date,
    to: Date,
    rented: bool,
    choose: bool,
}

struct Home {
    purchased: Date,
    sold: Date,
    moved_in: Date,
    practicable: bool,
    away: Vec<Away>,
    /// Hundredths of 1% of the floor area, and the first and last days of that use.
    part: Option<(i128, Date, Date)>,
    market: u64,
}

struct Sale {
    owner: Owner,
    acquired: Date,
    event: Date,
    proceeds: u64,
    price: u64,
    buying: Option<(u64, Date)>,
    improvements: Vec<(u64, Date)>,
    selling: u64,
    owning: u64,
    works: u64,
    current: u64,
    prior: u64,
    home: Option<Home>,
}

/// Days from `first` to `last`, both counted; nil when `last` is before `first`.
fn cgt_days(first: Date, last: Date) -> i128 {
    if last < first {
        0
    } else {
        i128::from((last - first).get_days()) + 1
    }
}

/// The days two inclusive periods share.
fn cgt_overlap(a: (Date, Date), b: (Date, Date)) -> i128 {
    cgt_days(a.0.max(b.0), a.1.min(b.1))
}

/// The same day `years` later, or 1 March for 29 February.
fn cgt_years_later(day: Date, years: i16) -> Date {
    let year = day.year() + years;
    Date::new(year, day.month(), day.day()).unwrap_or_else(|_| date(year, 3, 1))
}

/// Section 960-275(5) as it is written: the factor worked out to 4 decimal places, then to 3,
/// up when the 4th is 5 or more. A cost after 30 September 1999 is not indexed.
fn cgt_factor(day: Date) -> i128 {
    if day > date(1999, 9, 30) {
        return 1000;
    }
    let (_, quarters) = CGT_CPI
        .iter()
        .find(|(year, _)| *year == day.year())
        .unwrap();
    let index = i128::from(quarters[usize::try_from((day.month() - 1) / 3).unwrap()]);
    let four = 687 * 10_000 / index;
    four / 10 + i128::from(four % 10 >= 5)
}

fn cgt_half_up(numerator: i128, denominator: i128) -> i128 {
    (2 * numerator + denominator) / (2 * denominator)
}

/// Dollars as a JavaScript number prints them.
fn cgt_money(cents: i128) -> String {
    let (whole, part) = (cents / 100, cents % 100);
    match part {
        0 => whole.to_string(),
        _ if part % 10 == 0 => format!("{whole}.{}", part / 10),
        _ => format!("{whole}.{part:02}"),
    }
}

fn cgt_iso(day: Date) -> String {
    day.to_string()
}

/// The days that are not the main residence, as periods: before moving in unless that was as soon
/// as practicable, each absence not chosen, and each chosen rented day past the 6 years that
/// start on the absence's first rented day.
fn cgt_not_main(home: &Home) -> Vec<(Date, Date)> {
    let mut periods = Vec::new();
    if !home.practicable && home.moved_in > home.purchased {
        periods.push((home.purchased, home.moved_in.yesterday().unwrap()));
    }
    let mut left: Option<i128> = None;
    let mut previous: Option<Date> = None;
    for away in &home.away {
        if previous.is_none_or(|end| end.tomorrow().unwrap() != away.from) {
            left = None;
        }
        let length = cgt_days(away.from, away.to);
        if !away.choose {
            periods.push((away.from, away.to));
        } else if away.rented {
            let cap = left.get_or_insert_with(|| {
                let leap_day = away.from.month() == 2 && away.from.day() == 29;
                cgt_days(away.from, cgt_years_later(away.from, 6)) - i128::from(leap_day)
            });
            let covered = (*cap).min(length);
            if covered < length {
                periods.push((away.from + i64::try_from(covered).unwrap().days(), away.to));
            }
            *cap -= covered;
        }
        previous = Some(away.to);
    }
    periods
}

/// Whether a chosen absence's rented days end on the day the ATO's examples 72 and 80 count the
/// 6 years apart (from 29 February, on 28 February or 1 March), which the engine refuses.
fn cgt_six_year_boundary(home: &Home) -> bool {
    let on_boundary =
        |(cap, slack, rented): (i128, i128, i128)| rented >= cap && rented <= cap + slack;
    let mut absence: Option<(i128, i128, i128)> = None;
    let mut previous: Option<Date> = None;
    let mut boundary = false;
    for away in &home.away {
        if previous.is_none_or(|end| end.tomorrow().unwrap() != away.from) {
            boundary |= absence.take().is_some_and(on_boundary);
        }
        if away.choose && away.rented {
            let entry = absence.get_or_insert_with(|| {
                let leap_day = i128::from(away.from.month() == 2 && away.from.day() == 29);
                (
                    cgt_days(away.from, cgt_years_later(away.from, 6)) - leap_day,
                    leap_day,
                    0,
                )
            });
            entry.2 += cgt_days(away.from, away.to);
        }
        previous = Some(away.to);
    }
    boundary || absence.is_some_and(on_boundary)
}

/// The ownership period's days, those not the main residence and the part-use days that are, from
/// `start`, and the first day of use to produce income where section 118-192 moves the start there.
fn cgt_residence(home: &Home) -> (i128, i128, i128, Option<Date>) {
    let not_main = cgt_not_main(home);
    let count = |start: Date| {
        let window = (start, home.sold);
        let non_main: i128 = not_main
            .iter()
            .map(|&period| cgt_overlap(period, window))
            .sum();
        let part = home.part.map_or(0, |(_, from, to)| {
            let used = (from.max(start), to);
            cgt_days(used.0, used.1)
                - not_main
                    .iter()
                    .map(|&period| cgt_overlap(period, used))
                    .sum::<i128>()
        });
        (cgt_days(start, home.sold), non_main, part)
    };
    let (days, non_main, part) = count(home.purchased);
    let mut income: Vec<(Date, Date)> = home
        .away
        .iter()
        .filter(|away| away.rented)
        .map(|away| (away.from, away.to))
        .collect();
    if let Some((_, from, to)) = home.part {
        income.push((from, to));
    }
    let Some(first) = income.iter().map(|period| period.0).min() else {
        return (days, non_main, part, None);
    };
    let rented_not_main: i128 = income
        .iter()
        .flat_map(|&used| {
            not_main
                .iter()
                .map(move |&period| cgt_overlap(used, period))
        })
        .sum();
    let main_before = not_main.iter().all(|period| period.0 >= first);
    if first > home.purchased
        && first > date(1996, 8, 20)
        && main_before
        && (part > 0 || rented_not_main > 0)
    {
        let (days, non_main, part) = count(first);
        return (days, non_main, part, Some(first));
    }
    (days, non_main, part, None)
}

/// A method's gain after the taxable share, losses applied this year's first, and the net
/// capital gain after the discount, with the losses left to carry forward, in cents.
fn cgt_net(
    gross: i128,
    share: (i128, i128),
    keep: Option<(i128, i128)>,
    current: i128,
    prior: i128,
) -> [i128; 3] {
    let gain = if gross > 0 {
        cgt_half_up(gross * share.0, share.1)
    } else {
        0
    };
    let from_current = gain.min(current);
    let from_prior = (gain - from_current).min(prior);
    let left = gain - from_current - from_prior;
    let net = keep.map_or(left, |(top, bottom)| cgt_half_up(left * top, bottom));
    [gain, net, current - from_current + prior - from_prior]
}

/// The engine's result for one sale, worked from the sections and the ATO's examples.
fn cgt_oracle(sale: &Sale) -> Value {
    let residence = sale.home.as_ref().map(cgt_residence);
    let income_time = residence.and_then(|r| r.3);
    let from = income_time.unwrap_or(sale.acquired);
    let mut costs: Vec<(i128, Date)> = Vec::new();
    if let (Some(home), Some(_)) = (&sale.home, income_time) {
        costs.push((i128::from(home.market), from));
    } else {
        costs.push((i128::from(sale.price), sale.acquired));
        costs.extend(sale.buying.map(|(amount, day)| (i128::from(amount), day)));
    }
    costs.extend(
        sale.improvements
            .iter()
            .filter(|(_, day)| *day >= from)
            .map(|&(amount, day)| (i128::from(amount), day)),
    );
    let (selling, owning, works) = (
        i128::from(sale.selling),
        i128::from(sale.owning),
        i128::from(sale.works),
    );
    let out_of_cost_base = if from > date(1997, 5, 13) { works } else { 0 };
    let spent: i128 = costs.iter().map(|cost| cost.0).sum::<i128>() + selling;
    let cost_base = spent + owning - out_of_cost_base;
    let indexed: i128 = costs
        .iter()
        .map(|&(amount, day)| cgt_half_up(amount * cgt_factor(day), 1000))
        .sum::<i128>()
        + selling
        + owning
        - out_of_cost_base;
    let reduced = spent - works;
    let share = residence.map_or((1, 1), |(days, non_main, part, _)| {
        let percent = sale.home.as_ref().unwrap().part.map_or(0, |p| p.0);
        (non_main * 10_000 + percent * part, days * 10_000)
    });
    let after_day = from.tomorrow().unwrap();
    let held = sale.event >= cgt_years_later(after_day, 1);
    let indexable = from < date(1999, 9, 22);
    let mut methods: Vec<(&str, i128)> = Vec::new();
    if sale.owner == Owner::Company {
        methods.push(if indexable {
            ("indexation", indexed)
        } else {
            ("other", cost_base)
        });
    } else {
        if held {
            methods.push(("discount", cost_base));
        }
        if indexable {
            methods.push(("indexation", indexed));
        }
        if methods.is_empty() {
            methods.push(("other", cost_base));
        }
    }
    let keep = match sale.owner {
        Owner::Individual | Owner::Trust => Some((1, 2)),
        Owner::Super => Some((2, 3)),
        Owner::Company => None,
    };
    let (current, prior, proceeds) = (
        i128::from(sale.current),
        i128::from(sale.prior),
        i128::from(sale.proceeds),
    );
    let worked: Vec<(&str, [i128; 3])> = methods
        .iter()
        .map(|&(name, base)| {
            (
                name,
                cgt_net(
                    proceeds - base,
                    share,
                    if name == "discount" { keep } else { None },
                    current,
                    prior,
                ),
            )
        })
        .collect();
    let best = worked
        .iter()
        .min_by(|a, b| a.1[1].cmp(&b.1[1]).then(b.1[2].cmp(&a.1[2])))
        .unwrap();
    let loss = if proceeds < reduced {
        cgt_half_up((reduced - proceeds) * share.0, share.1)
    } else {
        0
    };
    let (method, [gain, net, carried]) = if residence.is_some() && share.0 == 0 {
        ("exempt", best.1)
    } else if loss > 0 {
        ("loss", [0, 0, current + prior + loss])
    } else if best.1[0] == 0 {
        ("nil", best.1)
    } else {
        *best
    };
    let days = residence
        .as_ref()
        .map(|r| [r.0, r.1, r.2].map(|n| n.to_string()));
    json!({
        "method": method, "costBase": cgt_money(cost_base),
        "indexedCostBase": methods.iter().any(|m| m.0 == "indexation").then(|| cgt_money(indexed)),
        "reducedCostBase": cgt_money(reduced), "gain": cgt_money(gain), "loss": cgt_money(loss), "net": cgt_money(net),
        "labelA": (net / 100).to_string(), "carried": cgt_money(carried),
        "ownershipDays": days.as_ref().map(|d| &d[0]), "nonMainDays": days.as_ref().map(|d| &d[1]),
        "partDays": days.as_ref().map(|d| &d[2]),
        "incomeTime": income_time.map(cgt_iso),
    })
}

/// The sale as the form passes it.
fn cgt_input(sale: &Sale) -> Value {
    let cost = |entry: Option<&(u64, Date)>| match entry {
        Some(&(amount, day)) => json!({"amount": dollars(amount), "date": cgt_iso(day)}),
        None => json!({"amount": "0", "date": ""}),
    };
    let blank_home = json!({"purchased": "", "sold": "", "movedIn": "", "practicable": "yes", "exclusions": "none",
        "away": (0..4).map(|_| json!({"from": "", "to": "", "rented": false, "choose": false})).collect::<Vec<_>>(),
        "partPercent": "0", "partFrom": "", "partTo": "", "market": "0"});
    let home = sale.home.as_ref().map_or(blank_home, |home| {
        let mut away: Vec<Value> = home.away.iter().map(|a| json!({"from": cgt_iso(a.from), "to": cgt_iso(a.to),
            "rented": a.rented, "choose": a.choose})).collect();
        away.resize(4, json!({"from": "", "to": "", "rented": false, "choose": false}));
        let (percent, from, to) = home.part.map_or(("0".to_owned(), String::new(), String::new()), |(p, from, to)| {
            (format!("{}.{:02}", p / 100, p % 100), cgt_iso(from), cgt_iso(to))
        });
        json!({"purchased": cgt_iso(home.purchased), "sold": cgt_iso(home.sold), "movedIn": cgt_iso(home.moved_in),
            "practicable": if home.practicable { "yes" } else { "no" }, "exclusions": "none", "away": away,
            "partPercent": percent, "partFrom": from, "partTo": to, "market": dollars(home.market)})
    });
    let owner = match sale.owner {
        Owner::Individual => "individual",
        Owner::Trust => "trust",
        Owner::Super => "super",
        Owner::Company => "company",
    };
    json!({"sale": {"entity": owner, "resident": "yes", "kind": if sale.home.is_some() { "home" } else { "investment" },
        "acquired": cgt_iso(sale.acquired), "event": cgt_iso(sale.event), "proceeds": dollars(sale.proceeds),
        "price": dollars(sale.price), "buying": cost(sale.buying.as_ref()),
        "improvements": [cost(sale.improvements.first()), cost(sale.improvements.get(1))],
        "selling": dollars(sale.selling), "owning": dollars(sale.owning), "works": dollars(sale.works),
        "currentLosses": dollars(sale.current), "priorLosses": dollars(sale.prior), "income": "90000", "home": home}})
}

/// A day from `first` to `last`, both included.
fn cgt_day(rng: &mut Seeded, first: Date, last: Date) -> Date {
    let span = u64::try_from((last - first).get_days()).unwrap();
    first + i64::try_from(rng.below(span + 1)).unwrap().days()
}

fn cgt_home(rng: &mut Seeded, acquired: Date, event: Date) -> Home {
    let purchased = cgt_day(rng, acquired, (acquired + 89.days()).min(event));
    let sold = cgt_day(rng, event, event + 89.days());
    let moved_in = if rng.below(2) == 0 {
        purchased
    } else {
        cgt_day(rng, purchased, (purchased + 400.days()).min(sold))
    };
    let mut away = Vec::new();
    let mut cursor = moved_in + i64::try_from(1 + rng.below(2_500)).unwrap().days();
    for _ in 0..rng.below(5) {
        if cursor > sold {
            break;
        }
        let to = (cursor + i64::try_from(rng.below(3_000)).unwrap().days()).min(sold);
        away.push(Away {
            from: cursor,
            to,
            rented: rng.below(3) != 0,
            choose: rng.below(4) != 0,
        });
        let gap = if rng.below(2) == 0 {
            0
        } else {
            1 + rng.below(1_500)
        };
        cursor = to + i64::try_from(1 + gap).unwrap().days();
    }
    let part = (rng.below(3) == 0).then(|| {
        let from = cgt_day(rng, purchased, sold);
        (
            i128::from(1 + rng.below(10_000)),
            from,
            cgt_day(rng, from, sold),
        )
    });
    Home {
        purchased,
        sold,
        moved_in,
        practicable: rng.below(2) == 0,
        away,
        part,
        market: 1 + rng.cents(200_000_000),
    }
}

/// One seeded sale: a resident owner, a sale contract from 1 July 2020 to 30 June 2027, an asset
/// bought before or after September 1999 or within a year of the sale, and for an individual
/// sometimes a home with absences and part use.
fn cgt_case(rng: &mut Seeded) -> (Value, Value) {
    loop {
        let owner = rng.pick(&[
            Owner::Individual,
            Owner::Individual,
            Owner::Individual,
            Owner::Trust,
            Owner::Super,
            Owner::Company,
        ]);
        let acquired = match rng.below(5) {
            0 | 1 => cgt_day(rng, date(1985, 9, 20), date(1999, 9, 21)),
            2 | 3 => cgt_day(rng, date(1999, 9, 22), date(2020, 6, 30)),
            _ => cgt_day(rng, date(2019, 7, 1), date(2027, 6, 29)),
        };
        let earliest = acquired.tomorrow().unwrap().max(date(2020, 7, 1));
        let boundary = cgt_years_later(acquired, 1) + i64::try_from(rng.below(3)).unwrap().days();
        let event = if boundary >= earliest && boundary <= date(2027, 6, 30) && rng.below(2) == 0 {
            boundary
        } else {
            cgt_day(rng, earliest, date(2027, 6, 30))
        };
        let price = 1 + rng.cents(150_000_000);
        let buying = (rng.below(2) == 0).then(|| {
            (
                1 + rng.cents(5_000_000),
                cgt_day(rng, acquired, (acquired + 59.days()).min(event)),
            )
        });
        let improvements = (0..rng.below(3))
            .map(|_| (1 + rng.cents(10_000_000), cgt_day(rng, acquired, event)))
            .collect();
        let home = (owner == Owner::Individual && rng.below(3) == 0)
            .then(|| cgt_home(rng, acquired, event));
        let works = if acquired == date(1997, 5, 13) {
            0
        } else {
            rng.cents(price.min(3_000_000))
        };
        let sale = Sale {
            owner,
            acquired,
            event,
            proceeds: rng.cents(200_000_000),
            price,
            buying,
            improvements,
            selling: rng.cents(5_000_000),
            owning: if acquired > date(1991, 8, 20) {
                rng.cents(5_000_000)
            } else {
                0
            },
            works: works.min(home.as_ref().map_or(works, |h| h.market)),
            current: if rng.below(2) == 0 {
                0
            } else {
                rng.cents(50_000_000)
            },
            prior: if rng.below(2) == 0 {
                0
            } else {
                rng.cents(50_000_000)
            },
            home,
        };
        // A first use to produce income on 20 August 1996, or one on 13 May 1997 with capital
        // works deductions, turns on the time of day, which the engine refuses; draw again. So do
        // an acquisition or first use on 21 September 1999 (sections 114-1 and 114-10), and
        // capital works deductions on an asset acquired before 13 May 1997 that was improved
        // after 30 June 1999 (subsection 110-45(1A)).
        let first_use = sale.home.as_ref().and_then(|home| {
            home.away
                .iter()
                .filter(|a| a.rented)
                .map(|a| a.from)
                .chain(home.part.map(|p| p.1))
                .min()
        });
        let split_works = sale.works > 0
            && sale.acquired < date(1997, 5, 13)
            && sale
                .improvements
                .iter()
                .any(|&(_, day)| day > date(1999, 6, 30));
        let cut_off = date(1999, 9, 21);
        // The engine also refuses part use that began during a chosen absence (subsection
        // 118-190(3)), rent ending on the day the ATO's examples count the 6 years apart, and
        // costs of owning when section 118-192 applies, as it cannot date them.
        let part_while_away = sale.home.as_ref().is_some_and(|home| {
            cgt_six_year_boundary(home)
                || home.part.is_some_and(|(_, from, _)| {
                    home.away
                        .iter()
                        .any(|a| a.choose && a.from <= from && from <= a.to)
                })
        });
        if first_use != Some(date(1996, 8, 20))
            && (sale.works == 0 || first_use != Some(date(1997, 5, 13)))
            && !split_works
            && sale.acquired != cut_off
            && first_use != Some(cut_off)
            && !part_while_away
        {
            let expected = cgt_oracle(&sale);
            if sale.owning == 0 || expected["incomeTime"].is_null() {
                return (cgt_input(&sale), expected);
            }
        }
    }
}

#[test]
fn the_cgt_oracle_works_the_atos_examples() {
    let sale = |acquired, event, proceeds: u64, price: u64| Sale {
        owner: Owner::Individual,
        acquired,
        event,
        proceeds: proceeds * 100,
        price: price * 100,
        buying: None,
        improvements: Vec::new(),
        selling: 0,
        owning: 0,
        works: 0,
        current: 0,
        prior: 0,
        home: None,
    };
    // Example 54, Brett: cost base $206,245, indexed $211,493, label H $289,755, label A $144,877.
    let brett = cgt_oracle(&Sale {
        buying: Some((2_000_000, date(1997, 7, 1))),
        improvements: vec![(3_000_000, date(2025, 10, 1))],
        selling: 1_250_000,
        works: 25_500,
        ..sale(date(1997, 7, 1), date(2026, 2, 1), 496_000, 144_000)
    });
    assert_eq!(
        [
            &brett["costBase"],
            &brett["indexedCostBase"],
            &brett["gain"],
            &brett["labelA"]
        ],
        [
            &json!("206245"),
            &json!("211493"),
            &json!("289755"),
            &json!("144877")
        ]
    );
    // Example 13, Val: factors 1.164 and 1.159, indexed cost base $188,213, net $93,750.
    assert_eq!(
        (cgt_factor(date(1991, 6, 24)), cgt_factor(date(1991, 7, 20))),
        (1164, 1159)
    );
    let val = cgt_oracle(&Sale {
        buying: Some((700_000, date(1991, 7, 20))),
        selling: 550_000,
        ..sale(date(1991, 6, 24), date(2025, 10, 15), 350_000, 150_000)
    });
    assert_eq!(
        [&val["indexedCostBase"], &val["net"]],
        [&json!("188213"), &json!("93750")]
    );
    // Example 80, Ian: 11,201 days owned, 364 over the 6 years to the anniversary, $250,000 × 364 ÷ 11,201
    // = $8,124.27; the ATO counts 365 and $8,147.
    let away = |from, to, rented| Away {
        from,
        to,
        rented,
        choose: true,
    };
    let ian = cgt_oracle(&Sale {
        home: Some(Home {
            purchased: date(1994, 7, 1),
            sold: date(2025, 2, 28),
            moved_in: date(1994, 7, 1),
            practicable: true,
            away: vec![
                away(date(1996, 1, 1), date(2000, 12, 31), true),
                away(date(2001, 1, 1), date(2001, 2, 28), false),
                away(date(2001, 3, 1), date(2003, 2, 28), true),
                away(date(2003, 3, 1), date(2004, 12, 30), false),
            ],
            part: None,
            market: 0,
        }),
        ..sale(date(1994, 6, 1), date(2025, 1, 31), 400_000, 150_000)
    });
    assert_eq!(
        [
            &ian["ownershipDays"],
            &ian["nonMainDays"],
            &ian["gain"],
            &ian["incomeTime"]
        ],
        [
            &json!("11201"),
            &json!("364"),
            &json!("8124.27"),
            &Value::Null
        ]
    );
    // Example 70, Erin: rented from 2 August 2005, so taken to be acquired then for $450,000.
    let erin = cgt_oracle(&Sale {
        home: Some(Home {
            purchased: date(2002, 7, 15),
            sold: date(2026, 4, 14),
            moved_in: date(2002, 7, 15),
            practicable: true,
            away: vec![Away {
                from: date(2005, 8, 2),
                to: date(2026, 4, 14),
                rented: true,
                choose: false,
            }],
            part: None,
            market: 45_000_000,
        }),
        ..sale(date(2002, 6, 15), date(2026, 4, 14), 496_000, 280_000)
    });
    assert_eq!(
        [&erin["gain"], &erin["net"], &erin["incomeTime"]],
        [&json!("46000"), &json!("23000"), &json!("2005-08-02")]
    );
}

const LSL_CASES: usize = 300;
const LSL_REASONS: [&str; 10] = [
    "resign",
    "pressing",
    "no-notice",
    "retire",
    "redundancy",
    "illness-dismissal",
    "performance",
    "misconduct",
    "fixed-term",
    "death",
];

/// Each Act's years for the full entitlement and for a pro rata payment, and the reasons that
/// earn the pro rata payment, typed from the Acts read on 19 November 2026: NSW s 4(2)(a)(iii),
/// Qld s 95(4), WA s 8(3), SA s 5(3) and (4), Tas s 8(3), ACT s 11C(1) and NT s 10(2). Victoria
/// pays nothing before 7 years. 'Unsettled' reasons are refused before the full period.
struct LslAct {
    place: &'static str,
    full: i64,
    early: i64,
    pays_early: &'static [&'static str],
    unsettled: &'static [&'static str],
}

const LSL_ACTS: [LslAct; 8] = [
    LslAct {
        place: "AU-NSW",
        full: 10,
        early: 5,
        pays_early: &[
            "redundancy",
            "illness-dismissal",
            "performance",
            "pressing",
            "death",
        ],
        unsettled: &["fixed-term"],
    },
    LslAct {
        place: "AU-VIC",
        full: 7,
        early: 7,
        pays_early: &[],
        unsettled: &[],
    },
    LslAct {
        place: "AU-QLD",
        full: 10,
        early: 7,
        pays_early: &[
            "redundancy",
            "illness-dismissal",
            "pressing",
            "fixed-term",
            "death",
        ],
        unsettled: &[],
    },
    LslAct {
        place: "AU-WA",
        full: 10,
        early: 7,
        pays_early: &[
            "resign",
            "pressing",
            "no-notice",
            "retire",
            "redundancy",
            "illness-dismissal",
            "performance",
            "fixed-term",
            "death",
        ],
        unsettled: &[],
    },
    LslAct {
        place: "AU-SA",
        full: 10,
        early: 7,
        pays_early: &[
            "resign",
            "pressing",
            "retire",
            "redundancy",
            "illness-dismissal",
            "performance",
            "fixed-term",
            "death",
        ],
        unsettled: &[],
    },
    LslAct {
        place: "AU-TAS",
        full: 10,
        early: 7,
        pays_early: &[
            "pressing",
            "retire",
            "redundancy",
            "illness-dismissal",
            "performance",
            "death",
        ],
        unsettled: &["fixed-term"],
    },
    LslAct {
        place: "AU-ACT",
        full: 7,
        early: 5,
        pays_early: &[
            "pressing",
            "retire",
            "redundancy",
            "illness-dismissal",
            "performance",
            "death",
        ],
        unsettled: &["fixed-term"],
    },
    LslAct {
        place: "AU-NT",
        full: 10,
        early: 7,
        pays_early: &[
            "pressing",
            "retire",
            "redundancy",
            "illness-dismissal",
            "performance",
        ],
        unsettled: &["fixed-term", "death"],
    },
];

/// The day a period of `years` and `months` from `start` ends after: the same day of the
/// month, or the 1st of the next month where the month is too short for it.
fn lsl_anniversary(start: i64, years: i64, months: i64) -> i64 {
    let (year, month, day) = civil(start);
    let index = year * 12 + month - 1 + years * 12 + months;
    let (year, month) = (index.div_euclid(12), index.rem_euclid(12) + 1);
    let next = if month == 12 {
        day_number(year + 1, 1, 1)
    } else {
        day_number(year, month + 1, 1)
    };
    if day > next - day_number(year, month, 1) {
        next
    } else {
        day_number(year, month, day)
    }
}

/// Completed years, completed months and days from `start` to the day before `until`, by
/// comparing the calendar dates, where the engine counts anniversaries one at a time.
fn lsl_service(start: i64, until: i64) -> (i64, i64, i64) {
    let ((y1, m1, d1), (y2, m2, d2)) = (civil(start), civil(until));
    let whole_months = (y2 - y1) * 12 + m2 - m1 - i64::from(d2 < d1);
    let (years, months) = (whole_months / 12, whole_months % 12);
    (years, months, until - lsl_anniversary(start, years, months))
}

/// Weeks as a ratio: 8 2/3 weeks a 10 years is 13/15 a year, 1.3 weeks a year 13/10, and
/// 1/60th of the employment the days over 420. A part year is its months over 12 and its days
/// over 365.25, all over 438,300 (12 × 36,525); in Queensland its days are over 364, all over
/// 1,092 (12 × 91), as Business Queensland's tables count them.
fn lsl_weeks(act: &LslAct, start: i64, until: i64, reason: Option<&str>) -> Option<(u128, u128)> {
    let (years, months, days) = lsl_service(start, until);
    let total = (until - start) as u128;
    let y = years as u128;
    let exact = if act.place == "AU-QLD" {
        (y * 1_092 + months as u128 * 91 + days as u128 * 3, 1_092)
    } else {
        (
            y * 438_300 + months as u128 * 36_525 + days as u128 * 1_200,
            438_300,
        )
    };
    let thirteen_fifteenths = |(n, d): (u128, u128)| (13 * n, 15 * d);
    let marked = if years >= 10 {
        10 + (years - 10) / 5 * 5
    } else {
        0
    };
    let blocks = marked as u128;
    let Some(reason) = reason else {
        // Still employed: the leave the employee can take now.
        if years < act.full {
            return Some((0, 1));
        }
        return Some(match act.place {
            "AU-VIC" => (total, 420),
            "AU-QLD" if years < 15 => (26, 3),
            "AU-QLD" => thirteen_fifteenths(exact),
            "AU-SA" => (13 * y, 10),
            "AU-ACT" => thirteen_fifteenths((y, 1)),
            "AU-NT" => (13 * blocks, 10),
            _ => thirteen_fifteenths((blocks, 1)),
        });
    };
    if years < act.early {
        return Some((0, 1));
    }
    if years < act.full {
        if act.unsettled.contains(&reason) {
            return None;
        }
        if !act.pays_early.contains(&reason) {
            return Some((0, 1));
        }
        return Some(match act.place {
            "AU-SA" | "AU-NT" => (13 * y, 10),
            "AU-ACT" => thirteen_fifteenths((y * 12 + months as u128, 12)),
            "AU-TAS" if reason == "death" => (total, 420),
            _ => thirteen_fifteenths(exact),
        });
    }
    let misconduct = reason == "misconduct";
    Some(match act.place {
        "AU-NSW" if years < 15 => thirteen_fifteenths(exact),
        "AU-NSW" | "AU-ACT" => thirteen_fifteenths((y, 1)),
        "AU-WA" if misconduct => thirteen_fifteenths((blocks, 1)),
        "AU-WA" => thirteen_fifteenths((y, 1)),
        "AU-VIC" => (total, 420),
        "AU-SA" => (13 * y, 10),
        "AU-NT" if misconduct => (13 * blocks, 10),
        "AU-NT" => (13 * y, 10),
        "AU-TAS" if reason == "death" => {
            // The leave accrued to the last 10 or 5-year mark and 1/60th of the days since.
            let since = (until - lsl_anniversary(start, marked, 0)) as u128;
            (13 * blocks * 420 + 15 * since, 15 * 420)
        }
        _ => thirteen_fifteenths(exact),
    })
}

/// Ten-thousandths of a week, half up.
fn lsl_ten_thousandths((n, d): (u128, u128)) -> u64 {
    half_up(&BigUint::from(n * 10_000), &BigUint::from(d))
}

/// What the engine must return: the service, the weeks, the weeks left after `taken` (in
/// ten-thousandths), their value at `pay` cents a week and, while employed, the next amount.
fn lsl_oracle(
    act: &LslAct,
    start: i64,
    end: i64,
    excluded: i64,
    reason: Option<&str>,
    taken: u64,
    pay: u64,
) -> Value {
    let until = end + 1 - excluded;
    if until <= start {
        return json!({"refused": true});
    }
    let Some((n, d)) = lsl_weeks(act, start, until, reason) else {
        return json!({"refused": true});
    };
    let weeks = lsl_ten_thousandths((n, d));
    if taken > weeks {
        return json!({"refused": true});
    }
    let (years, months, days) = lsl_service(start, until);
    let left = BigUint::from(n * 10_000 - u128::from(taken) * d);
    let value = half_up(&(left * pay), &BigUint::from(d * 10_000));
    let next = reason.is_none().then(|| {
        let at = if years < act.full {
            Some(act.full)
        } else {
            match act.place {
                "AU-VIC" => None,
                "AU-QLD" if years < 15 => Some(15),
                "AU-QLD" => None,
                "AU-SA" | "AU-ACT" => Some(years + 1),
                _ => Some(10 + ((years - 10) / 5 + 1) * 5),
            }
        };
        at.map(|years| {
            let mark = lsl_anniversary(start, years, 0);
            let weeks = lsl_weeks(act, start, mark, None).unwrap();
            json!([
                years,
                iso_day(mark - 1 + excluded),
                rate_shown(lsl_ten_thousandths(weeks))
            ])
        })
    });
    json!({"years": years, "months": months, "days": days, "counted": until - start,
        "weeks": rate_shown(weeks), "balance": rate_shown(weeks - taken), "value": shown(value),
        "next": next.flatten()})
}

fn lsl_case(rng: &mut Seeded) -> (Value, Value) {
    let act = &LSL_ACTS[rng.below(8) as usize];
    let earliest = day_number(1990, 6, 23);
    // A quarter of the starts fall on 29 February or a 31st, which later months lack.
    let start = match rng.below(4) {
        0 => day_number(1992 + 4 * rng.below(19) as i64, 2, 29),
        1 => day_number(1991 + rng.below(78) as i64, rng.pick(&[1, 3, 5, 8, 10]), 31),
        _ => earliest + rng.below(day_number(2070, 1, 1) as u64 - earliest as u64) as i64,
    };
    let excluded = if rng.below(3) == 0 {
        1 + rng.below(400) as i64
    } else {
        0
    };
    // A third end a day either side of a qualifying mark; the rest anywhere up to 30 years.
    let end = if rng.below(3) == 0 {
        let mark = lsl_anniversary(start, rng.pick(&[5, 7, 10, 15, 20]), 0);
        mark - 1 + excluded - rng.below(2) as i64
    } else {
        start + excluded + rng.below(30 * 366) as i64
    };
    let end = end.min(day_number(2099, 12, 31));
    let employed = rng.below(3) == 0;
    let reason = rng.pick(&LSL_REASONS);
    let pay = rng.cents(100_000_000);
    // Leave taken up to a ten-thousandth more than the entitlement, which is refused.
    let entitled = if end + 1 - excluded > start {
        lsl_weeks(
            act,
            start,
            end + 1 - excluded,
            (!employed).then_some(reason),
        )
        .map_or(0, lsl_ten_thousandths)
    } else {
        0
    };
    let taken = if rng.below(2) == 0 {
        0
    } else {
        rng.below(entitled + 2)
    };
    let case = json!({"place": act.place, "start": iso_day(start), "end": iso_day(end),
        "excluded": excluded.to_string(), "taken": rate_shown(taken),
        "mode": if employed { "employed" } else { "ends" }, "reason": reason, "pay": shown(pay)});
    let want = lsl_oracle(
        act,
        start,
        end,
        excluded,
        (!employed).then_some(reason),
        taken,
        pay,
    );
    (case, want)
}

#[test]
fn the_lsl_oracle_works_the_published_examples_by_hand() {
    let act = |place| LSL_ACTS.iter().find(|act| act.place == place).unwrap();
    let ends = |place, start, end, reason| {
        lsl_oracle(act(place), start, end, 0, Some(reason), 0, 100_000)["weeks"].clone()
    };
    // Commerce WA: Lee, made redundant after 12 years, 10.4 weeks; Anastasia, dismissed for
    // serious misconduct after 12 years and 1 month, the 8.667 weeks accrued.
    let (y2014, y2026) = (day_number(2014, 1, 1), day_number(2026, 1, 31));
    assert_eq!(
        ends("AU-WA", y2014, day_number(2025, 12, 31), "redundancy"),
        "10.4"
    );
    assert_eq!(ends("AU-WA", y2014, y2026, "misconduct"), "8.6667");
    // SafeWork SA: Aisha resigns after 8 years and 6 months, 10.4 weeks.
    let aisha = ends(
        "AU-SA",
        day_number(2017, 1, 1),
        day_number(2025, 6, 30),
        "resign",
    );
    assert_eq!(aisha, "10.4");
    // WorkSafe Tasmania example 2: 13 years, 6 months and 14 days is 13.5383 years.
    let (start, until) = (day_number(2012, 1, 1), day_number(2025, 7, 15));
    assert_eq!(lsl_service(start, until), (13, 6, 14));
    let (years, months, days) = lsl_service(start, until);
    let part = (years * 438_300 + months * 36_525 + days * 1_200) as u128;
    assert_eq!(rate_shown(lsl_ten_thousandths((part, 438_300))), "13.5383");
    // WorkSafe ACT: 7 years is 6.0667 weeks; at $560 a week the exact weeks give $3,397.33.
    let act7 = lsl_oracle(
        act("AU-ACT"),
        day_number(2019, 1, 1),
        day_number(2025, 12, 31),
        0,
        None,
        0,
        56_000,
    );
    assert_eq!(
        (act7["weeks"].clone(), act7["value"].clone()),
        (json!("6.0667"), json!("3397.33"))
    );
    // A 29 February start completes its years with 28 February.
    assert_eq!(
        lsl_anniversary(day_number(2016, 2, 29), 10, 0),
        day_number(2026, 3, 1)
    );
    assert_eq!(
        lsl_anniversary(day_number(2025, 1, 31), 0, 1),
        day_number(2025, 3, 1)
    );
}

#[test]
fn the_cgt_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1119_0000_0cc7);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..CGT_CASES).map(|_| cgt_case(&mut rng)).unzip();
    let actual = run_node(CGT_HARNESS, &cases);
    assert_eq!(actual.len(), CGT_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

#[test]
fn the_lsl_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1119_0000_0151);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..LSL_CASES).map(|_| lsl_case(&mut rng)).unzip();
    let actual = run_node(LSL_HARNESS, &cases);
    assert_eq!(actual.len(), LSL_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the workers compensation engine, as `HARNESS` runs the others. A refusal is reported as
/// one, without its wording, which the Node tests hold.
const WC_HARNESS: &str = r"
import { workersCompensation } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const shown = (value) => value === null ? null : String(value);
const run = (inputs) => {
  try {
    const r = workersCompensation(inputs);
    return { premium: shown(r.premium), gst: shown(r.gst), duty: shown(r.duty), total: shown(r.total),
      actualTotal: shown(r.actualTotal), adjustment: shown(r.adjustment) };
  } catch {
    return { refused: true };
  }
};
process.stdout.write(JSON.stringify(JSON.parse(input).map(run)));
";

const WC_CASES: usize = 300;
const WC_PLACES: [&str; 8] = [
    "AU-NSW", "AU-VIC", "AU-QLD", "AU-WA", "AU-SA", "AU-TAS", "AU-ACT", "AU-NT",
];

/// One employer as the form gives it: money in cents and rates in ten-thousandths of 1%.
struct WcCase {
    place: &'static str,
    wages: i128,
    rate: i128,
    apprentice: i128,
    actual: Option<i128>,
    group: bool,
    dust: i128,
    reward: i128,
    vic_employer: &'static str,
    days: i128,
    buyout: bool,
    qld_start: &'static str,
    first_year: bool,
    claims: i128,
}

fn wc_half(numerator: i128, denominator: i128) -> i128 {
    (2 * numerator + denominator) / (2 * denominator)
}

/// The premium before GST, the GST, the duty and the total on one wages figure, typed from each
/// scheme's source read on 19 November 2026, or `None` where the source leaves the premium to
/// the insurer.
fn wc_premium(c: &WcCase, wages: i128) -> Option<[i128; 4]> {
    let cents_at = |amount: i128, rate: i128| wc_half(amount * rate, 1_000_000);
    let gst = |premium: i128| wc_half(premium, 10);
    if c.apprentice > wages {
        return None;
    }
    match c.place {
        "AU-NSW" => {
            // SIRA's Guidelines 2026 clause 6.7: small while the APP does not exceed $30,000;
            // icare's $240 minimum; the dust diseases rate includes its GST.
            let app = cents_at(wages, c.rate);
            let premium = app - cents_at(app, c.reward) - cents_at(c.apprentice, c.rate);
            if app > 3_000_000 || premium < 24_000 {
                return None;
            }
            Some([
                premium,
                gst(premium),
                0,
                premium + gst(premium) + cents_at(wages, c.dust),
            ])
        }
        "AU-VIC" => {
            if c.vic_employer == "other" {
                return None;
            }
            // Premiums Order (No. 34): remuneration to the dollar (clause 6(6)), the preliminary
            // premium in millionths of a dollar, and clause 11 as written, preliminary premium
            // ÷ R × 15,500 × N ÷ 365 to the nearest cent (clause 6(4)); the WorkCover premium
            // down to the cent and at least $400.
            let remuneration = wc_half(wages, 100);
            let preliminary = remuneration * c.rate;
            let deductible = if remuneration == 0 {
                0
            } else {
                wc_half(preliminary * 15_500 * c.days, remuneration * 365 * 10_000)
            };
            let workcover = ((preliminary - deductible * 10_000).max(0) / 10_000).max(40_000);
            let premium = workcover + if c.buyout { workcover / 10 } else { 0 };
            Some([premium, gst(premium), 0, premium + gst(premium)])
        }
        "AU-QLD" => {
            // Notice (No. 1) of 2026 section 4.1: the minimum, including GST and duty, by the
            // quarter the policy commences.
            let minimum = match c.qld_start {
                "q1" => 20_000,
                "q2" => 15_000,
                "q3" => 10_000,
                "q4" => 5_000,
                _ => return None,
            };
            let premium = cents_at(wages, c.rate) - cents_at(c.apprentice, c.rate);
            // Duties Act 2001 (Qld) s 362(3): 5% of the premium, its GST included.
            let duty = wc_half((premium + gst(premium)) * 5, 100);
            if premium + gst(premium) + duty >= minimum {
                return Some([premium, gst(premium), duty, premium + gst(premium) + duty]);
            }
            // Below it, the premium within the minimum is the minimum ÷ 1.155.
            let within = wc_half(minimum * 1000, 1155);
            Some([within, gst(within), minimum - within - gst(within), minimum])
        }
        "AU-SA" => {
            // ReturnToWorkSA: BP × (1 − D) + C − A, D by the base premium's band in dollars,
            // C capped at 3 × D × BP, at least $200 and down to the whole dollar. Hundred-
            // millionths of a cent: wages × rate is the base premium in millionths of a cent.
            let d = if c.first_year {
                0
            } else {
                [
                    (10_000, 5),
                    (50_000, 10),
                    (100_000, 15),
                    (500_000, 20),
                    (1_000_000, 25),
                ]
                .iter()
                .find(|(dollars, _)| wages * c.rate < dollars * 100_000_000)
                .map_or(30, |&(_, d)| d)
            };
            let base = wages * c.rate * 100;
            let claims = if c.first_year {
                0
            } else {
                (c.claims * 100_000_000).min(3 * base * d / 100)
            };
            let sum = base * (100 - d) / 100 + claims - c.apprentice * c.rate * 100;
            let dollar = 100 * 100_000_000;
            let premium = if sum < 200 * dollar {
                20_000
            } else {
                sum / dollar * 100
            };
            Some([premium, gst(premium), 0, premium + gst(premium)])
        }
        _ => {
            let premium = cents_at(wages, c.rate);
            Some([premium, gst(premium), 0, premium + gst(premium)])
        }
    }
}

fn wc_oracle(c: &WcCase) -> Value {
    let refused = json!({"refused": true});
    let state = ["AU-NSW", "AU-VIC", "AU-QLD", "AU-SA"].contains(&c.place);
    let apprentices = ["AU-NSW", "AU-QLD", "AU-SA"].contains(&c.place);
    if (c.group && state) || (!apprentices && c.apprentice != 0) {
        return refused;
    }
    let Some([premium, gst, duty, total]) = wc_premium(c, c.wages) else {
        return refused;
    };
    let actual = match c.actual.map(|wages| wc_premium(c, wages)) {
        Some(None) => return refused,
        found => found.flatten().map(|[.., actual]| actual),
    };
    json!({"premium": shown_signed(premium), "gst": shown_signed(gst), "duty": shown_signed(duty),
        "total": shown_signed(total), "actualTotal": actual.map(shown_signed),
        "adjustment": actual.map(|actual| shown_signed(actual - total))})
}

fn wc_case(rng: &mut Seeded) -> (Value, Value) {
    let most = 1_000_000_000_000;
    let place = rng.pick(&WC_PLACES);
    let rate = 1 + i128::from(rng.below(200_000));
    let mut wages = i128::from(rng.cents(1_000_000_000_000));
    // A third of the NSW and SA cases sit a cent either side of the $30,000 APP or a band.
    let bound = match place {
        "AU-NSW" => 3_000_000,
        "AU-SA" => rng.pick(&[1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000]),
        _ => 0,
    };
    if bound > 0 && rng.below(3) == 0 {
        wages = ((bound * 1_000_000 + rate - 1) / rate - i128::from(rng.below(2))).min(most);
    }
    let users = ["AU-NSW", "AU-QLD", "AU-SA"].contains(&place);
    // Apprentice wages up to a cent over the wages, and now and then where no scheme takes them.
    let apprentice = match (rng.below(3), users) {
        (0, true) => i128::from(rng.below(u64::try_from(wages).unwrap() + 2)),
        (0, false) if rng.below(4) == 0 => 1 + i128::from(rng.below(1_000_000)),
        _ => 0,
    };
    let actual = (rng.below(3) == 0).then(|| {
        (wages * i128::from(80 + rng.below(41)) / 100 + i128::from(rng.below(100))).min(most)
    });
    let c = WcCase {
        place,
        wages,
        rate,
        apprentice,
        actual,
        group: rng.below(10) == 0,
        dust: i128::from(rng.below(2_001)),
        reward: i128::from(rng.below(150_001)),
        vic_employer: if rng.below(12) == 0 {
            "other"
        } else {
            rng.pick(&["new", "small"])
        },
        days: 1 + i128::from(rng.below(365)),
        buyout: rng.below(2) == 0,
        qld_start: if rng.below(12) == 0 {
            "existing"
        } else {
            rng.pick(&["q1", "q2", "q3", "q4"])
        },
        first_year: rng.below(4) == 0,
        claims: i128::from(rng.cents(100_000_000_000)),
    };
    let cents = |amount: i128| dollars(u64::try_from(amount).unwrap());
    let rate_of = |rate: i128| rate_shown(u64::try_from(rate).unwrap());
    let yes = |answer: bool| if answer { "yes" } else { "no" };
    let case = json!({"place": c.place, "wages": cents(c.wages), "rate": rate_of(c.rate),
        "apprentice": cents(c.apprentice), "actual": c.actual.map_or(String::new(), cents),
        "group": yes(c.group), "dust": rate_of(c.dust), "reward": rate_of(c.reward),
        "vicEmployer": c.vic_employer, "days": c.days.to_string(), "buyout": yes(c.buyout),
        "qldStart": c.qld_start, "firstYear": yes(c.first_year), "claims": cents(c.claims)});
    (case, wc_oracle(&c))
}

#[test]
fn the_wc_oracle_works_the_published_examples_by_hand() {
    let case = |place, wages, rate| WcCase {
        place,
        wages,
        rate,
        apprentice: 0,
        actual: None,
        group: false,
        dust: 0,
        reward: 0,
        vic_employer: "new",
        days: 365,
        buyout: false,
        qld_start: "q1",
        first_year: false,
        claims: 0,
    };
    // NT WorkSafe's bulletin: $400,000 at 3.50%, then $500,000 actual.
    let nt = WcCase {
        actual: Some(50_000_000),
        ..case("AU-NT", 40_000_000, 35_000)
    };
    assert_eq!(
        wc_oracle(&nt),
        json!({"premium": "14000", "gst": "1400", "duty": "0", "total": "15400",
            "actualTotal": "19250", "adjustment": "3850"})
    );
    // ReturnToWorkSA's 3 examples: $8,550, $9,900 and $56,000 before GST.
    let sa = |wages, rate, claims| {
        wc_premium(
            &WcCase {
                claims,
                ..case("AU-SA", wages, rate)
            },
            wages,
        )
        .unwrap()[0]
    };
    assert_eq!(
        [
            sa(45_000_000, 20_000, 0),
            sa(45_000_000, 20_000, 250_000),
            sa(100_000_000, 60_000, 500_000)
        ],
        [855_000, 990_000, 5_600_000]
    );
    // icare's Rob's Restaurant: $1,200,000 at 2.250%, a 7.5% reward, a 0.022% dust diseases rate.
    let rob = WcCase {
        reward: 75_000,
        dust: 220,
        ..case("AU-NSW", 120_000_000, 22_500)
    };
    assert_eq!(
        wc_premium(&rob, rob.wages),
        Some([2_497_500, 249_750, 0, 2_773_650])
    );
    let vic = case("AU-VIC", 15_000_000, 20_000);
    assert_eq!(
        wc_premium(&vic, vic.wages),
        Some([269_000, 26_900, 0, 295_900])
    );
    let qld = case("AU-QLD", 50_000_000, 13_430);
    assert_eq!(
        wc_premium(&qld, qld.wages),
        Some([671_500, 67_150, 36_933, 775_583])
    );
}

#[test]
fn the_wc_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1119_0000_0350);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..WC_CASES).map(|_| wc_case(&mut rng)).unzip();
    let actual = run_node(WC_HARNESS, &cases);
    assert_eq!(actual.len(), WC_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// GSTR 2006/8 Examples 3, 4, 6 and 14 (paragraphs 56, 63, 67 and 145), worked by the oracle.
#[test]
fn the_margin_scheme_oracle_gives_the_rulings_examples() {
    let gst = |exclusive, price, cost, part, whole| {
        margin_scheme_oracle(
            "freehold", true, "margin", exclusive, price, cost, part, whole,
        )["schemeGst"]
            .clone()
    };
    assert_eq!(gst(false, 40_000_000, 18_000_000, 1, 1), "20000");
    assert_eq!(gst(false, 14_000_000, 24_000_000, 800, 2000), "4000");
    assert_eq!(
        gst(false, 19_000_000, 40_000_000, 200_000, 2_000_000),
        "13636.36"
    );
    assert_eq!(gst(true, 9_636_400, 6_000_000, 1, 1), "3636.4");
}

/// The AASB 16 lease engine, run alone: it reads no rendered page.
const LEASE_HARNESS: &str = r"
import { lease } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const cents = (value) => Math.round(value * 100);
const run = ({ terms }) => {
  try {
    const r = lease(terms);
    return { liability: String(r.liability), cost: String(r.cost), totalInterest: String(r.totalInterest),
      depreciation: String(r.years.reduce((sum, year) => sum + cents(year.depreciation), 0) / 100),
      closing: String(r.years.at(-1).liability) };
  } catch (error) {
    return { refused: error.message };
  }
};
process.stdout.write(JSON.stringify(JSON.parse(input).map(run)));
";

const LEASE_CASES: usize = 160;
const NO_COST: &str = "The incentives received are as much as the rest of the right-of-use asset’s cost, which leaves it nothing to depreciate.";
const NEGATIVE_LAST: &str = "Rounding each period’s interest to the cent leaves the last period with negative interest. Use a larger payment or fewer payments.";

/// A lessee's lease: the payments as finance schedule terms worked for their present value, the
/// residual as the balloon, and the amounts the right-of-use asset's cost adds, in cents.
struct LeaseCase {
    terms: Terms,
    prepaid: u64,
    incentives: u64,
    direct: u64,
    restoration: u64,
}

impl LeaseCase {
    fn case(&self) -> Value {
        let t = &self.terms;
        json!({ "terms": {
            "payment": dollars(t.payment),
            "payments": t.periods.to_string(),
            "frequency": t.frequency.name,
            "timing": if t.advance { "advance" } else { "arrears" },
            "rate": format!("{}.{:04}", t.rate / 10_000, t.rate % 10_000),
            "start": "2026-07-01",
            "residual": dollars(t.balloon),
            "prepaid": dollars(self.prepaid),
            "incentives": dollars(self.incentives),
            "direct": dollars(self.direct),
            "restoration": dollars(self.restoration),
            "ownership": "no",
            "life": "",
        } })
    }
}

/// What the lease engine must return. The liability is the payments not paid at commencement
/// and the residual, discounted one period at a time (paragraph 26); the asset's cost adds what
/// paragraph 24 lists. All interest is what is paid after commencement less the liability, where
/// the engine adds each period's; and the depreciation adds up to the cost, the liability to nil.
fn lease_oracle(case: &LeaseCase) -> Value {
    let refused = |message: &str| json!({ "refused": message });
    let t = &case.terms;
    // The engine finds the present value with the finance schedule, so its refusals come first.
    if let Some(message) = finance_oracle(t).get("refused") {
        return json!({ "refused": message });
    }
    let at_start = if t.advance { t.payment } else { 0 };
    let liability = amount_oracle(t) - at_start;
    let cost = i128::from(liability + case.prepaid + at_start + case.direct + case.restoration)
        - i128::from(case.incentives);
    if cost <= 0 {
        return refused(NO_COST);
    }
    let cost = u64::try_from(cost).unwrap();
    let after = u64::from(t.periods - u32::from(t.advance));
    let paid = t.payment * after + t.balloon;
    // The last period's interest is what is left once every earlier one is rounded.
    let (rate, scale) = (u128::from(t.rate), u128::from(t.scale()));
    let mut balance = u128::from(liability);
    let events = after + u64::from(t.advance && t.balloon > 0);
    for event in 1..events {
        let interest = (2 * balance * rate + scale) / (2 * scale);
        let due = if event <= after {
            u128::from(t.payment)
        } else {
            0
        };
        balance = balance + interest - due;
    }
    if events > 0 {
        let last = if t.advance && t.balloon > 0 {
            u128::from(t.balloon)
        } else {
            u128::from(t.payment + t.balloon)
        };
        if last < balance {
            return refused(NEGATIVE_LAST);
        }
    }
    json!({
        "liability": shown(liability),
        "cost": shown(cost),
        "totalInterest": shown(paid - liability),
        "depreciation": shown(cost),
        "closing": "0",
    })
}

/// A seeded lease: any frequency and timing, a residual or none, and payments before
/// commencement, incentives, initial direct costs and restoration, some incentives too large.
fn lease_case(rng: &mut Seeded) -> LeaseCase {
    let frequency = rng.pick(&FREQUENCIES);
    let any_rate = rng.below(300_001);
    let rate = rng.pick(&[0, 1, 75_000, any_rate, any_rate]);
    let any_term = 1 + rng.below(u64::from(frequency.most)) as u32;
    let periods = rng.pick(&[1, 2, frequency.most, any_term, any_term]);
    let payment = 1 + rng.cents(10_000_000 - 1);
    let any_residual = rng.below(payment * u64::from(periods) / 4 + 1);
    let balloon = rng.pick(&[0, 0, payment, any_residual]);
    let small = |rng: &mut Seeded| {
        let any = rng.cents(payment * 2);
        rng.pick(&[0, 0, any])
    };
    let (prepaid, direct, restoration) = (small(rng), small(rng), small(rng));
    let (some, any_incentive) = (small(rng), rng.cents(payment * u64::from(periods)));
    let incentives = rng.pick(&[0, 0, some, any_incentive]);
    LeaseCase {
        terms: Terms {
            solve: "amount",
            amount: 1,
            rate,
            periods,
            payment,
            balloon,
            share: None,
            frequency,
            advance: rng.below(2) == 1,
        },
        prepaid,
        incentives,
        direct,
        restoration,
    }
}

#[test]
fn the_lease_oracle_works_example_13_by_hand() {
    // Illustrative Examples accompanying IFRS 16, Example 13: 10 yearly payments of CU50,000 in
    // advance at 5%, initial direct costs of CU20,000 and an incentive of CU5,000. The liability is
    // nine payments discounted, CU355,391, and the asset CU420,391.
    let case = LeaseCase {
        terms: Terms {
            solve: "amount",
            amount: 1,
            rate: 50_000,
            periods: 10,
            payment: 5_000_000,
            balloon: 0,
            share: None,
            frequency: FREQUENCIES[4],
            advance: true,
        },
        prepaid: 0,
        incentives: 500_000,
        direct: 2_000_000,
        restoration: 0,
    };
    let want = lease_oracle(&case);
    assert_eq!(want["liability"], "355391.08");
    assert_eq!(want["cost"], "420391.08");
    assert_eq!(want["totalInterest"], "94608.92");
}

#[test]
fn the_engine_agrees_with_the_oracle_on_every_seeded_lease() {
    let mut rng = Seeded(0x2026_1119_1EA5_E016);
    let seeded: Vec<LeaseCase> = (0..LEASE_CASES).map(|_| lease_case(&mut rng)).collect();
    let cases: Vec<Value> = seeded.iter().map(LeaseCase::case).collect();
    let expected: Vec<Value> = seeded.iter().map(lease_oracle).collect();
    assert!(
        seeded
            .iter()
            .any(|one| one.terms.advance && one.terms.balloon > 0)
    );
    assert!(seeded.iter().any(|one| one.terms.rate == 0));
    assert!(expected.iter().any(|want| want["refused"] == NO_COST));
    assert!(
        expected
            .iter()
            .filter(|want| want.get("refused").is_none())
            .count()
            > LEASE_CASES / 2
    );
    let actual = run_node(LEASE_HARNESS, &cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the depreciation pools worksheets, as `HARNESS` runs the others, and returns each result's figures as text.
const POOL_HARNESS: &str = r"
import { lowValuePool, smallBusinessPool, capitalWorks } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const run = { lvp: lowValuePool, sbp: smallBusinessPool, cw: capitalWorks };
process.stdout.write(JSON.stringify(JSON.parse(input).map(({ worksheet, call }) => Object.fromEntries(
  Object.entries(run[worksheet](call)).filter(([, value]) => typeof value === 'number').map(([key, value]) => [key, String(value)])))));
";

const POOL_CASES: usize = 240;
const POOL_YEARS: [&str; 7] = [
    "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27",
];

/// The low pool value threshold in cents: none in the temporary full expensing years (IT(TP)A
/// s 328-181(5)), else $20,000 (IT(TP)A s 328-180(6)(e); ITAA 1997 s 328-210(1) as Act No. 71
/// of 2026 Sch 2 amends it), typed here from those sources.
fn pool_threshold(year: &str) -> Option<u128> {
    match year {
        "2020-21" | "2021-22" | "2022-23" => None,
        _ => Some(2_000_000),
    }
}

/// Cents as the page's dollars text.
fn pool_money(value: u128) -> String {
    dollars(u64::try_from(value).unwrap())
}

/// Cents as the engine's number reads as text.
fn pool_shown(value: u128) -> String {
    shown(u64::try_from(value).unwrap())
}

/// A low-value pool in ten-thousandths of a cent: 1,875 of them for each cent of low-cost assets
/// and second element costs, 3,750 for each cent of the rest, where the engine counts sixteenths.
fn low_value_pool_case(rng: &mut Seeded, year: &str) -> (Value, Value) {
    let previous = u128::from(rng.cents(100_000_000));
    let low_cost = u128::from(rng.cents(99_999));
    let low_value = u128::from(rng.cents(99_999));
    let second = u128::from(rng.cents(1_000_000));
    let any = rng.cents(100_000_000);
    let termination = u128::from(rng.pick(&[0, 0, any]));
    let newer = 1_875 * (low_cost + second);
    let older = 3_750 * (previous + low_value);
    let decline = exact_half_up(newer + older, 10_000);
    let before = previous + low_cost + low_value + second - decline;
    (
        json!({ "worksheet": "lvp", "call": { "year": year, "previous_closing_pool_balance": pool_money(previous),
            "low_cost_assets": pool_money(low_cost), "low_value_assets": pool_money(low_value),
            "second_element_costs": pool_money(second), "termination_values": pool_money(termination) } }),
        json!({
            "newAssetsDecline": pool_shown(exact_half_up(newer, 10_000)), "poolDecline": pool_shown(exact_half_up(older, 10_000)),
            "declineInValue": pool_shown(decline), "closingBeforeDisposals": pool_shown(before),
            "closingPoolBalance": pool_shown(before.saturating_sub(termination)),
            "assessableExcess": pool_shown(termination.saturating_sub(before)),
        }),
    )
}

/// A general small business pool: 300 and 150 thousandths of each amount, half up, where the
/// engine takes 3/10 and 3/20; amounts near $20,000 test the threshold.
fn small_business_pool_case(rng: &mut Seeded, year: &str) -> (Value, Value) {
    let any = rng.cents(1_000_000_000);
    let mut opening = u128::from(rng.pick(&[any, 1_999_999, 2_000_000, 2_000_001, 0]));
    let any = rng.cents(10_000_000);
    let additions = u128::from(rng.pick(&[0, any]));
    let any = rng.cents(1_000_000);
    let improved = u128::from(rng.pick(&[0, 0, any]));
    let any = rng.cents(1_000_000_000);
    let termination = u128::from(rng.pick(&[0, any]));
    if year == "2020-21" && opening + additions + improved == termination && additions > 0 {
        // The one case the engine refuses (backing business investment): move it off zero.
        opening += 1;
    }
    let amount = i128::try_from(opening + additions + improved).unwrap()
        - i128::try_from(termination).unwrap();
    let positive = u128::try_from(amount.max(0)).unwrap();
    // The low pool value deduction, the 3 rated deductions, their total, assessable income and the closing balance.
    let (mut low_pool, mut pool, mut newer, mut added) = (0, 0, 0, 0);
    let (mut deduction, mut assessable, mut closing) = (0, 0, 0);
    if amount > 0 && pool_threshold(year).is_none_or(|limit| positive < limit) {
        (low_pool, deduction) = (positive, positive);
    } else if amount < 0 {
        assessable = amount.unsigned_abs();
    } else {
        pool = exact_half_up(opening * 300, 1_000);
        newer = exact_half_up(additions * 150, 1_000);
        added = exact_half_up(improved * 150, 1_000);
        deduction = pool + newer + added;
        assessable = deduction.saturating_sub(positive);
        closing = positive.saturating_sub(deduction);
    }
    let mut want = json!({
        "lowPoolValueAmount": shown_signed(amount), "lowPoolValueDeduction": pool_shown(low_pool), "poolDeduction": pool_shown(pool),
        "newAssetDeduction": pool_shown(newer), "costAdditionDeduction": pool_shown(added), "deduction": pool_shown(deduction),
        "assessableIncome": pool_shown(assessable), "closingPoolBalance": pool_shown(closing),
    });
    if let Some(limit) = pool_threshold(year) {
        want["threshold"] = json!((limit / 100).to_string());
    }
    (
        json!({ "worksheet": "sbp", "call": { "year": year, "opening_pool_balance": pool_money(opening),
            "additions": pool_money(additions), "cost_additions": pool_money(improved), "termination_values": pool_money(termination) } }),
        want,
    )
}

/// A capital works deduction: the days counted with calendar dates from the later of 1 July and the
/// start, 25 or 40 thousandths a year over 365 and the use in ten-thousandths, one division.
fn capital_works_case(rng: &mut Seeded, year: &str) -> (Value, Value) {
    let begun = date(1987, 9, 16) + i64::try_from(rng.below(14_000)).unwrap().days();
    let start_year: i16 = year[..4].parse().unwrap();
    let (first, last) = (date(start_year, 7, 1), date(start_year + 1, 6, 30));
    let most = if begun > last {
        0
    } else {
        u64::try_from((last - begun.max(first)).get_days()).unwrap() + 1
    };
    let some = rng.below(most + 1);
    let days = u128::from(rng.pick(&[most, some]));
    let four = begun >= date(1992, 2, 27) && rng.below(3) == 0;
    let per_mille = if four { 40 } else { 25 };
    let expenditure = 1 + u128::from(rng.cents(100_000_000_000));
    let some = rng.below(10_001);
    let use_ = u128::from(rng.pick(&[10_000, 0, 5_000, some]));
    let some = u128::from(rng.cents(u64::try_from(expenditure).unwrap()));
    let undeducted = rng.pick(&[expenditure, some]);
    let rate_amount = exact_half_up(expenditure * days * per_mille, 1_000 * 365);
    let reduced = exact_half_up(expenditure * days * per_mille * use_, 1_000 * 365 * 10_000);
    (
        json!({ "worksheet": "cw", "call": { "year": year, "construction_expenditure": pool_money(expenditure),
            "construction_start": begun.to_string(), "four_percent_manner": four, "days_used": days,
            "taxable_use": format!("{}.{:04}", use_ / 10_000, use_ % 10_000),
            "undeducted_construction_expenditure": pool_money(undeducted) } }),
        json!({ "rateAmount": pool_shown(rate_amount), "reducedAmount": pool_shown(reduced), "deduction": pool_shown(reduced.min(undeducted)) }),
    )
}

#[test]
fn the_depreciation_pools_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1122_0000_00B4);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..POOL_CASES)
        .map(|i| {
            let year = rng.pick(&POOL_YEARS);
            match i % 3 {
                0 => low_value_pool_case(&mut rng, year),
                1 => small_business_pool_case(&mut rng, year),
                _ => capital_works_case(&mut rng, year),
            }
        })
        .unzip();
    let figure = |key: &str| {
        expected
            .iter()
            .any(|want| want[key].as_str().is_some_and(|value| value != "0"))
    };
    assert!(
        figure("assessableIncome")
            && figure("lowPoolValueDeduction")
            && figure("poolDeduction")
            && figure("assessableExcess")
    );
    let actual = run_node(POOL_HARNESS, &cases);
    assert_eq!(actual.len(), POOL_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the wine equalisation tax engine, as `HARNESS` runs the others.
const WET_HARNESS: &str = r"
import { wineEqualisationTax } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const keys = ['wineTax', 'label1c', 'rebateBeforeCap', 'rebate', 'rebateOverCap', 'label1d', 'cap'];
process.stdout.write(JSON.stringify(JSON.parse(input).map((one) => {
  const r = wineEqualisationTax(one);
  return { ...Object.fromEntries(keys.map((key) => [key, String(r[key])])),
    values: r.dealings.map((d) => String(d.taxableValue)), taxes: r.dealings.map((d) => String(d.wineTax)) };
})));
";

const WET_CASES: usize = 240;
/// The largest price the seeded dealings take, $10,000,000.00, in cents.
const MAX_WET_CENTS: u64 = 1_000_000_000;

/// One seeded dealing: its command input, its taxable value in cents and whether it earns a rebate.
struct WetDealing {
    input: Value,
    value: u128,
    taxed: bool,
    earns: bool,
}

/// A wholesale sale, a retail sale or own use by half the retail price or the average wholesale price,
/// a sale under quote or own use of wine bought under quote. The average wholesale price is the
/// sales' total price over their total quantity, times this dealing's quantity (WET Act s 9-40).
fn wet_dealing(rng: &mut Seeded) -> WetDealing {
    let kind = rng.pick(&[
        "wholesale_sale",
        "retail_sale",
        "own_use",
        "quoted_sale",
        "own_use_purchased_under_quote",
    ]);
    let price = rng.cents(MAX_WET_CENTS);
    let claims = kind != "own_use_purchased_under_quote" && rng.below(2) == 0;
    let all_met = rng.below(5) != 0;
    let intention = rng.pick(&[
        "taxable_dealing",
        "manufacture",
        "gst_free_supply",
        "sale_under_quote",
    ]);
    let mut input = json!({ "kind": kind });
    let value = match kind {
        "wholesale_sale" | "quoted_sale" => {
            input["price_excluding_wet_and_gst"] = json!(dollars(price));
            u128::from(price)
        }
        "own_use_purchased_under_quote" => {
            input["purchase_price_excluding_gst"] = json!(dollars(price));
            u128::from(price)
        }
        _ if rng.below(3) == 0 => {
            // Whole quantities, so the weights are exact.
            let quantity = 1 + u128::from(rng.below(500));
            let sales: Vec<(u128, u128)> = (0..1 + rng.below(4))
                .map(|_| {
                    (
                        1 + u128::from(rng.below(1_000)),
                        u128::from(rng.cents(MAX_WET_CENTS)),
                    )
                })
                .collect();
            let sold: u128 = sales.iter().map(|(q, _)| q).sum();
            let numerator: u128 = sales.iter().map(|(_, p)| p * quantity).sum();
            input["average_wholesale"] = json!({
                "grape_wine": true, "wholesale_share_at_least_10_percent": true, "quantity": quantity.to_string(),
                "wholesale_sales": sales.iter().map(|(q, p)| json!({
                    "quantity": q.to_string(), "price_excluding_wet_and_gst": dollars(u64::try_from(*p).unwrap()) }))
                    .collect::<Vec<_>>(),
            });
            if kind == "retail_sale" {
                input["retail_price_including_wet_and_gst"] = json!(dollars(price));
            }
            exact_half_up(numerator, sold)
        }
        _ => {
            input["retail_price_including_wet_and_gst"] = json!(dollars(price));
            exact_half_up(u128::from(price), 2)
        }
    };
    if kind == "quoted_sale" {
        input["purchaser_intention"] = json!(intention);
    }
    if claims {
        input["rebate_conditions"] = json!({
            "producer": true, "source_product_owned_85_percent": true, "container_and_trade_mark": all_met });
    }
    let liable = kind != "quoted_sale" || intention == "taxable_dealing";
    WetDealing {
        input,
        value,
        taxed: kind != "quoted_sale",
        earns: claims && all_met && liable,
    }
}

/// The cap by year: $350,000 for dealings to 30 June 2026, $400,000 from 1 July 2026 (WET Act s 19-15(2);
/// Act No. 12 of 2026 Sch 6; the ATO's 'Producer rebate', QC22756), typed here from those sources.
fn wet_cap_cents(year: &str) -> u128 {
    match year {
        "2023-24" | "2024-25" | "2025-26" => 35_000_000,
        _ => 40_000_000,
    }
}

/// The period's wine tax and rebate: each 29% of a value, half up to the cent; the rebate fills what
/// the year's cap leaves one dealing at a time, where the engine compares the total with it; labels
/// 1C and 1D drop the cents.
fn wet_case(rng: &mut Seeded) -> (Value, Value) {
    let year = rng.pick(&["2023-24", "2024-25", "2025-26", "2026-27", "2027-28"]);
    let dealings: Vec<WetDealing> = (0..1 + rng.below(6)).map(|_| wet_dealing(rng)).collect();
    let mut input = json!({ "year": year, "dealings": dealings.iter().map(|d| d.input.clone()).collect::<Vec<_>>() });
    let cap = wet_cap_cents(year);
    let claimed = dealings
        .iter()
        .any(|d| d.input.get("rebate_conditions").is_some());
    let earlier = if claimed {
        let any = u128::from(rng.cents(45_000_000));
        let earlier = rng.pick(&[0, any, cap, cap.saturating_sub(100_000), cap + 1]);
        input["rebate_claimed_earlier_in_year"] = json!(dollars(u64::try_from(earlier).unwrap()));
        input["associated_producer"] = json!(rng.below(4) == 0);
        earlier
    } else {
        0
    };
    let tenth = |value: u128| exact_half_up(value * 29, 100);
    let mut room = cap.saturating_sub(earlier);
    let (mut tax, mut earned, mut rebate) = (0, 0, 0);
    for d in &dealings {
        if d.taxed {
            tax += tenth(d.value);
        }
        if d.earns {
            let amount = tenth(d.value);
            earned += amount;
            let fits = amount.min(room);
            room -= fits;
            rebate += fits;
        }
    }
    let cents = |value: u128| shown(u64::try_from(value).unwrap());
    let whole = |value: u128| (value / 100).to_string();
    let values: Vec<String> = dealings.iter().map(|d| cents(d.value)).collect();
    let taxes: Vec<String> = dealings
        .iter()
        .map(|d| cents(if d.taxed { tenth(d.value) } else { 0 }))
        .collect();
    (
        input,
        json!({
            "wineTax": cents(tax), "label1c": whole(tax), "rebateBeforeCap": cents(earned), "rebate": cents(rebate),
            "rebateOverCap": cents(earned - rebate), "label1d": whole(rebate), "cap": whole(cap),
            "values": values, "taxes": taxes,
        }),
    )
}

#[test]
fn the_wine_equalisation_tax_engine_agrees_with_the_oracle_on_every_seeded_case() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1122_0000_0B0B);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..WET_CASES).map(|_| wet_case(&mut rng)).unzip();
    let actual = run_node(WET_HARNESS, &cases);
    assert_eq!(actual.len(), WET_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the ASIC fees engine, as `HARNESS` runs the others: each case's amount and tier, or which
/// refusal it met.
const ASIC_HARNESS: &str = r"
import { asicFee } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const kinds = [['This page holds', 'year'], ['The due date is', 'due-weekend'], ['The first month', 'month-weekend']];
process.stdout.write(JSON.stringify(JSON.parse(input).map((one) => {
  try {
    const r = asicFee(one);
    return { amount: r.amount, tier: r.tier };
  } catch (error) {
    return { refused: (kinds.find(([start]) => error.message.startsWith(start)) ?? ['', error.message])[1] };
  }
})));
";

/// ASIC's 2026-27 amounts, typed from its fee data (SHA-256 03281f57...866da, read 22 November
/// 2026), not from the engine: I02, I01, R01, A52, A51, A58, A53, BZA and BZB.
const ASIC_FIXED: [(&str, u64); 9] = [
    ("company-share-capital", 636),
    ("company-no-share-capital", 524),
    ("name-reservation", 65),
    ("review-proprietary", 342),
    ("review-public", 1_591),
    ("review-special-proprietary", 70),
    ("review-special-public", 65),
    ("business-name-1", 47),
    ("business-name-3", 108),
];

/// The last day of the month starting the day after `due` (AIA s 36(1) item 6), by s 2G(1)'s 2
/// branches: before the corresponding day of the next calendar month, or that month's last day.
fn asic_first_month_ends(due: Date) -> Date {
    let start = due.tomorrow().unwrap();
    let next = start.first_of_month().checked_add(1.month()).unwrap();
    if start.day() <= next.days_in_month() {
        date(next.year(), next.month(), start.day())
            .yesterday()
            .unwrap()
    } else {
        next.last_of_month()
    }
}

/// A day and, if it is a Saturday or Sunday, each day after it to the Wednesday: the days a thing due
/// then might be done on if AIA s 36(2) or Corporations Act s 105(3) moves it.
fn asic_could_move_to(day: Date) -> Vec<Date> {
    let last = match day.weekday() {
        Weekday::Saturday => day.checked_add(4.days()).unwrap(),
        Weekday::Sunday => day.checked_add(3.days()).unwrap(),
        _ => day,
    };
    day.series(1.day()).take_while(|d| *d <= last).collect()
}

/// The tier under every reading of the weekend rules: each day the due date could move to, and each
/// day that due date's first month could end on. The page answers only when every reading agrees.
fn asic_late_oracle(due: Date, received: Date) -> Value {
    let year = date(2026, 7, 1)..=date(2027, 6, 30);
    if !year.contains(&due) || !year.contains(&received) {
        return json!({ "refused": "year" });
    }
    let mut tiers = Vec::new();
    for moved in asic_could_move_to(due) {
        for ends in asic_could_move_to(asic_first_month_ends(moved)) {
            tiers.push(if received <= moved {
                0
            } else if received <= ends {
                102
            } else {
                428
            });
        }
    }
    if tiers.iter().all(|tier| *tier == tiers[0]) {
        let tier = ["not late", "within one month", "more than one month"][match tiers[0] {
            0 => 0,
            102 => 1,
            _ => 2,
        }];
        return json!({ "amount": tiers[0], "tier": tier });
    }
    let weekend = matches!(due.weekday(), Weekday::Saturday | Weekday::Sunday);
    json!({ "refused": if weekend || tiers.contains(&0) { "due-weekend" } else { "month-weekend" } })
}

#[test]
fn the_asic_fees_oracle_counts_months_by_hand() {
    // s 2G(1) example 1: a month starting on 15 December ends immediately before 15 January.
    assert_eq!(asic_first_month_ends(date(2026, 12, 14)), date(2027, 1, 14));
    // Example 2: a month starting on 31 August ends at the end of September.
    assert_eq!(asic_first_month_ends(date(2026, 8, 30)), date(2026, 9, 30));
    // A due date on a month's last day starts the month on the 1st, so it runs to the next month's end.
    assert_eq!(
        asic_first_month_ends(date(2026, 11, 30)),
        date(2026, 12, 31)
    );
    assert_eq!(asic_first_month_ends(date(2027, 1, 29)), date(2027, 2, 28));
}

#[test]
fn the_asic_fees_engine_agrees_with_the_oracle_on_every_due_and_payment_date() {
    if !common::rendered() {
        return;
    }
    let mut cases = Vec::new();
    let mut expected = Vec::new();
    for (fee, amount) in ASIC_FIXED {
        cases.push(json!({ "fee": fee }));
        expected.push(json!({ "amount": amount, "tier": null }));
    }
    let mut due = date(2026, 6, 1);
    while due <= date(2027, 6, 30) {
        let mut received = due.checked_sub(3.days()).unwrap();
        while received <= due.checked_add(75.days()).unwrap() {
            for fee in ["late-review-payment", "late-lodgement"] {
                cases.push(
                    json!({ "fee": fee, "due": due.to_string(), "received": received.to_string() }),
                );
                expected.push(asic_late_oracle(due, received));
            }
            received = received.tomorrow().unwrap();
        }
        due = due.tomorrow().unwrap();
    }
    let actual = run_node(ASIC_HARNESS, &cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}

/// Runs the PSI engine, as `HARNESS` runs the others: each case's rule, whether it is a personal
/// services business and its figures, the shares to 2 places, or which refusal it met.
const PSI_HARNESS: &str = r"
import { psiDetermination } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const kinds = [['Enter the principal', 'agent-payments'], ['At least 75%', 'agent-rules'], ['Enter the PSI', 'no-psi'],
  ['The market value', 'others']];
const fixed = (value) => (value === null ? null : value.toFixed(2));
process.stdout.write(JSON.stringify(JSON.parse(input).map((one) => {
  try {
    const r = psiDetermination(one);
    return { rule: r.rule, psb: r.psb, results: fixed(r.results), source: fixed(r.source), unrelated: r.unrelated,
      employment: fixed(r.employment) };
  } catch (error) {
    return { refused: (kinds.find(([start]) => error.message.startsWith(start)) ?? ['', error.message])[1] };
  }
})));
";

const PSI_CASES: usize = 2_000;
const PSI_FLAGS: [&str; 5] = ["associate", "offer", "result", "tools", "defects"];
const PSI_PREMISES: [&str; 5] = ["times", "mainly", "exclusive", "private", "clients"];

/// One row of PSI: its cents, the 5 ticks in `PSI_FLAGS` order and the earlier row (from 1) whose
/// payer it is, if any.
struct PsiRow {
    cents: u64,
    flags: [bool; 5],
    same: Option<usize>,
}

struct PsiCase {
    earner: &'static str,
    mainly: bool,
    determination: bool,
    rows: Vec<PsiRow>,
    /// Commission and the principal's payments, in cents, for an agent.
    agent: Option<(u64, u64)>,
    others: u64,
    apprentice: bool,
    premises: [bool; 5],
}

/// Cents as the form's decimal text.
fn psi_amount(cents: u64) -> String {
    format!("{}.{:02}", cents / 100, cents % 100)
}

impl PsiCase {
    fn input(&self) -> Value {
        let payers: Vec<Value> = self
            .rows
            .iter()
            .map(|row| {
                let mut payer = json!({ "amount": psi_amount(row.cents) });
                for (flag, on) in PSI_FLAGS.iter().zip(row.flags) {
                    payer[*flag] = json!(on);
                }
                if let Some(same) = row.same {
                    payer["same"] = json!(same);
                }
                payer
            })
            .collect();
        let (commission, principal) = self.agent.unwrap_or((0, 0));
        let premises: serde_json::Map<String, Value> = PSI_PREMISES
            .iter()
            .zip(self.premises)
            .map(|(key, on)| ((*key).to_owned(), json!(on)))
            .collect();
        json!({
            "earner": self.earner, "mainly": self.mainly, "determination": self.determination,
            "payers": payers, "agent": self.agent.is_some(), "commission": psi_amount(commission),
            "principal": psi_amount(principal), "others": psi_amount(self.others),
            "apprentice": self.apprentice, "premises": premises,
        })
    }
}

/// A share to 2 places, rounded down, as the page shows it.
fn psi_share(part: u64, whole: u64) -> String {
    let hundredths = part * 10_000 / whole;
    format!("{}.{:02}", hundredths / 100, hundredths % 100)
}

/// The group a row is in, by its union-find parents.
fn psi_root(parent: &[usize], row: usize) -> usize {
    let mut root = row;
    while parent[root] != root {
        root = parent[root];
    }
    root
}

fn psi_outcome(
    rule: &str,
    psb: Option<bool>,
    figures: [Option<String>; 3],
    unrelated: Option<usize>,
) -> Value {
    let [results, source, employment] = figures;
    json!({ "rule": rule, "psb": psb, "results": results, "source": source, "unrelated": unrelated, "employment": employment })
}

/// Part 2-42 of the ITAA 1997 (Compilation No. 268, read 22 November 2026) in whole per cent of
/// exact cents: s 84-5(1), s 85-35(1) and (2), s 87-15(1)(a) and (b), s 87-18(1) and (3), s 87-40(2)(c),
/// s 87-15(3) and ss 87-20, 87-25 and 87-30. An agent's payments are checked first, as the psi-test
/// command of ryanduguid/australian-accounting checks them.
fn psi_oracle(case: &PsiCase) -> Value {
    let none = [None, None, None];
    if let Some((commission, principal)) = case.agent
        && (principal == 0 || commission > principal)
    {
        return json!({ "refused": "agent-payments" });
    }
    if !case.mainly {
        return psi_outcome("subsection 84-5(1)", None, none, None);
    }
    match case.earner {
        "employee" => return psi_outcome("subsection 85-35(1)", None, none, None),
        "religious" => return psi_outcome("subsection 85-35(2)", None, none, None),
        _ => {}
    }
    let entity = case.earner == "entity";
    if case.determination {
        let rule = if entity {
            "paragraph 87-15(1)(b)"
        } else {
            "paragraph 87-15(1)(a)"
        };
        return psi_outcome(rule, Some(true), none, None);
    }
    let total: u64 = case.rows.iter().map(|row| row.cents).sum();
    if total == 0 {
        return json!({ "refused": "no-psi" });
    }
    if case.others > total {
        return json!({ "refused": "others" });
    }
    let met: u64 = case
        .rows
        .iter()
        .filter(|row| row.flags[2] && row.flags[3] && row.flags[4])
        .map(|row| row.cents)
        .sum();
    let results = psi_share(met, total);
    if met * 100 >= 75 * total {
        let rule = if entity {
            "subsection 87-18(3)"
        } else {
            "subsection 87-18(1)"
        };
        return psi_outcome(rule, Some(true), [Some(results), None, None], None);
    }
    if let Some((commission, principal)) = case.agent
        && commission * 100 >= 75 * principal
    {
        return json!({ "refused": "agent-rules" });
    }
    let mut parent: Vec<usize> = (0..case.rows.len()).collect();
    for (row, PsiRow { same, .. }) in case.rows.iter().enumerate() {
        if let Some(same) = same {
            let (from, to) = (psi_root(&parent, row), psi_root(&parent, same - 1));
            parent[from] = to;
        }
    }
    let mut payers = vec![0_u64; case.rows.len()];
    for (row, PsiRow { cents, .. }) in case.rows.iter().enumerate() {
        payers[psi_root(&parent, row)] += cents;
    }
    let largest = payers.iter().copied().max().unwrap();
    let mut clients: Vec<usize> = (0..case.rows.len())
        .filter(|row| {
            let PsiRow { cents, flags, .. } = &case.rows[*row];
            *cents > 0 && !flags[0] && flags[1]
        })
        .map(|row| psi_root(&parent, row))
        .collect();
    clients.sort_unstable();
    clients.dedup();
    let figures = [
        Some(results),
        Some(psi_share(largest, total)),
        Some(psi_share(case.others, total)),
    ];
    let unrelated = Some(clients.len());
    if largest * 100 >= 80 * total {
        return psi_outcome("subsection 87-15(3)", Some(false), figures, unrelated);
    }
    let passes: Vec<&str> = [
        (clients.len() >= 2, "87-20"),
        (case.others * 100 >= 20 * total || case.apprentice, "87-25"),
        (case.premises.iter().all(|on| *on), "87-30"),
    ]
    .into_iter()
    .filter_map(|(met, section)| met.then_some(section))
    .collect();
    let rule = match passes.as_slice() {
        [] => "subsection 87-15(1)".to_owned(),
        [one] => format!("section {one}"),
        [first @ .., last] => format!("sections {} and {last}", first.join(", ")),
    };
    psi_outcome(&rule, Some(!passes.is_empty()), figures, unrelated)
}

/// Whole-dollar amounts, so the 75%, 80% and 20% thresholds are met exactly in some cases.
fn psi_case(rng: &mut Seeded) -> PsiCase {
    let earner = if rng.below(10) == 0 {
        rng.pick(&["employee", "religious"])
    } else {
        rng.pick(&["sole-trader", "entity"])
    };
    let count = 1 + rng.below(5) as usize;
    let mut rows = Vec::new();
    for row in 0..count {
        let cents = if rng.below(6) == 0 {
            0
        } else {
            100 * (1 + rng.below(100))
        };
        let flags = [
            rng.below(5) == 0,
            rng.below(2) == 0,
            rng.below(2) == 0,
            rng.below(4) != 0,
            rng.below(4) != 0,
        ];
        let same = (row > 0 && rng.below(3) == 0).then(|| 1 + rng.below(row as u64) as usize);
        rows.push(PsiRow { cents, flags, same });
    }
    let total: u64 = rows.iter().map(|row| row.cents).sum();
    let agent = (rng.below(5) == 0).then(|| {
        let principal = 100 * rng.below(101);
        (rng.below(principal + 150), principal)
    });
    let others = if rng.below(10) == 0 {
        total + 1 + rng.below(100)
    } else {
        100 * rng.below(total / 100 + 1)
    };
    PsiCase {
        earner,
        mainly: rng.below(12) != 0,
        determination: rng.below(12) == 0,
        rows,
        agent,
        others,
        apprentice: rng.below(4) == 0,
        premises: [0; 5].map(|_| rng.below(5) != 0),
    }
}

#[test]
fn the_psi_oracle_joins_a_payers_rows() {
    let row = |cents, flags: &str, same| PsiRow {
        cents,
        flags: PSI_FLAGS.map(|flag| flags.split(' ').any(|on| on == flag)),
        same,
    };
    let case = |rows| PsiCase {
        earner: "sole-trader",
        mainly: true,
        determination: false,
        rows,
        agent: None,
        others: 0,
        apprentice: false,
        premises: [false; 5],
    };
    let contracts = psi_oracle(&case(vec![
        row(7_400, "result tools defects", None),
        row(2_600, "", Some(1)),
    ]));
    assert_eq!(contracts["rule"], "subsection 87-15(3)");
    assert_eq!(contracts["source"], "100.00");
    // Rows 1 to 3 are one payer through row 2, so 2 payers were won by offers.
    let chain = psi_oracle(&case(vec![
        row(4_000, "offer", None),
        row(2_000, "offer", Some(1)),
        row(2_000, "offer", Some(2)),
        row(2_000, "offer", None),
    ]));
    assert_eq!(chain["unrelated"], 2);
    assert_eq!(chain["rule"], "subsection 87-15(3)");
}

#[test]
fn the_psi_engine_agrees_with_the_oracle_on_seeded_cases() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1122_0000_0851);
    let cases: Vec<PsiCase> = (0..PSI_CASES).map(|_| psi_case(&mut rng)).collect();
    let inputs: Vec<Value> = cases.iter().map(PsiCase::input).collect();
    let actual = run_node(PSI_HARNESS, &inputs);
    assert_eq!(actual.len(), cases.len());
    let mut reached = std::collections::BTreeSet::new();
    for ((case, input), got) in cases.iter().zip(&inputs).zip(&actual) {
        let want = psi_oracle(case);
        reached.insert(
            want.get("rule")
                .unwrap_or(&want["refused"])
                .as_str()
                .unwrap()
                .to_owned(),
        );
        assert_eq!(got, &want, "{input}");
    }
    for outcome in [
        "subsection 84-5(1)",
        "subsection 85-35(1)",
        "subsection 85-35(2)",
        "paragraph 87-15(1)(a)",
        "paragraph 87-15(1)(b)",
        "subsection 87-18(1)",
        "subsection 87-18(3)",
        "subsection 87-15(3)",
        "subsection 87-15(1)",
        "section 87-20",
        "section 87-25",
        "section 87-30",
        "agent-payments",
        "agent-rules",
        "no-psi",
        "others",
    ] {
        assert!(reached.contains(outcome), "{outcome}");
    }
}
