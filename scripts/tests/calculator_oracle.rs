// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! An independent oracle for the loan, Division 7A, FBT car, Coal LSL and transfer duty engines. 360 seeded
//! fictional cases are worked here in exact integers, by a route the engines do not take,
//! and each result must equal what the browser module returns under Node. The loan sums
//! its discount factors one month at a time, and the Division 7A minimum yearly repayment
//! one year at a time, where `assets/business-calculators.mjs` uses the closed annuity
//! form; the levy works from section 3B of the Coal Mining Industry (Long Service Leave)
//! Payroll Levy Collection Act 1992 in quarter cents. The FBT car value adds the statutory
//! formula's share of the base value one day at a time and takes the business use share off
//! the operating costs, where the engine multiplies by the days and the private use share.
//! Transfer duty types each jurisdiction's scale here from its revenue office or
//! legislation, not from the site's rate table, and checks the engine either side of every
//! band threshold and on 160 seeded values, so a slip in either transcription shows.
//!
//! The route is independent; the conventions are not. The oracle takes the same 12 equal
//! months, payment count, unrounded total interest and half-up final rounding as the
//! engines, the first principal as the rounded payment less the rounded interest, the
//! same Division 7A interest part (the rate on the whole balance) and the same
//! FBT rounding (each value to the cent before contributions, the gross-up and the FBT from
//! the figure before them), so it cannot show those are the right conventions.
//!
//! A further 120 seeded loans, from their own seed so the 360 above are unchanged, add a
//! balloon owed at the end of the term and payments in arrears or in advance; the oracle
//! discounts the balloon and sums each timing's factors month by month, where the engine
//! takes the closed form and divides by one month's growth for advance.
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
mod common;

use jiff::ToSpan;
use jiff::civil::{Date, Weekday, date};
use num_bigint::BigUint;
use serde_json::{Value, json};
use std::io::Write;
use std::process::{Command, Stdio};

const LOAN_CASES: usize = 120;
const FEE_CASES: usize = 120;
const DIV7A_CASES: usize = 60;
const LEVY_CASES: usize = 120;
const FBT_CASES: usize = 60;
const BALLOON_CASES: usize = 120;
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
import { loan, div7aMinimumRepayment, terminationPayment, transferDuty, firstHomeDuty, fbtCar, fixedFee, pcgRisk, gicPaymentPlan, vehicleClass } from './assets/business-calculators.mjs';
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
  loan: ({ principal, rate, months, balloon, timing }) => {
    const result = loan(principal, rate, months, balloon, timing);
    return { payment: money(result.payment), firstInterest: money(result.firstInterest),
      firstPrincipal: money(result.firstPrincipal), totalInterest: money(result.totalInterest) };
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

/// Exact payment, first interest, first principal and total interest, in cents.
fn loan_oracle(principal: u64, rate: u64, months: u32) -> [u64; 4] {
    let scale = BigUint::from(MONTHLY_SCALE);
    let growth = BigUint::from(MONTHLY_SCALE + rate);
    let balance = BigUint::from(principal);
    // Over the common denominator growth^n, the discount factors (scale/growth)^k for
    // k = 1 to n sum to `factors`; the payment is the balance over that sum.
    let mut factors = BigUint::ZERO;
    let mut scale_power = BigUint::from(1_u8);
    let mut growth_power = BigUint::from(1_u8);
    for _ in 0..months {
        factors = factors * &growth + &scale_power * &scale;
        scale_power *= &scale;
        growth_power *= &growth;
    }
    let payment_top = &balance * &growth_power;
    let total_interest_top = &payment_top * months - &balance * &factors;
    let payment = half_up(&payment_top, &factors);
    let first_interest = half_up(&(&balance * rate), &scale);
    // The first principal is what the rounded payment leaves after the rounded interest.
    [
        payment,
        first_interest,
        payment - first_interest,
        half_up(&total_interest_top, &factors),
    ]
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

/// A case for Node and what the engine must return for it.
fn loan_case(rng: &mut Seeded) -> (Value, Value) {
    let principal = 1 + rng.cents(MAX_PRINCIPAL - 1);
    let any_rate = rng.below(1_000_001);
    let rate = rng.pick(&[0, 1, 50_000, 65_000, 1_000_000, any_rate, any_rate]);
    let any_term = 1 + rng.below(600);
    let months = rng.pick(&[1, 2, 12, 60, 360, 600, any_term, any_term]) as u32;
    let [payment, first_interest, first_principal, total_interest] =
        loan_oracle(principal, rate, months);
    (
        json!({
            "kind": "loan",
            "principal": dollars(principal),
            "rate": format!("{}.{:04}", rate / 10_000, rate % 10_000),
            "months": months.to_string(),
        }),
        json!({
            "payment": shown(payment),
            "firstInterest": shown(first_interest),
            "firstPrincipal": shown(first_principal),
            "totalInterest": shown(total_interest),
        }),
    )
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
    assert_eq!(loan_oracle(10_000, 120_000, 1), [10_100, 100, 10_000, 100]);
    // $1,000 at 0% over 3 months: a third of the balance, half up.
    assert_eq!(loan_oracle(100_000, 0, 3), [33_333, 0, 33_333, 0]);
    // $100,000 at 6% over 30 years, the worked case in the Node tests.
    assert_eq!(
        loan_oracle(10_000_000, 60_000, 360),
        [59_955, 50_000, 9_955, 11_583_819]
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

/// A schedule in whole cents: interest rounds half up each month, and the last payment
/// clears the balance. Returns (total interest, last payment).
fn cent_schedule(principal: u64, rate: u64, months: u32, payment: u64) -> (u64, u64) {
    let (mut balance, mut total) = (u128::from(principal), 0);
    let scale = 12_000_000_u128;
    for _ in 1..months {
        let interest = (balance * u128::from(rate) * 2 + scale) / (2 * scale);
        total += interest;
        balance = balance + interest - u128::from(payment);
    }
    let interest = (balance * u128::from(rate) * 2 + scale) / (2 * scale);
    (
        u64::try_from(total + interest).unwrap(),
        u64::try_from(balance + interest).unwrap(),
    )
}

#[test]
fn the_loan_page_states_its_total_against_a_cent_by_cent_schedule() {
    assert_eq!(
        cent_schedule(10_000_000, 60_000, 360, 59_955),
        (11_583_845, 60_000)
    );
    if !common::rendered() {
        return;
    }
    let html = common::read_text(common::root(), "tools/business-calculators/loan/index.html");
    assert!(html.contains(
        "it gives $115,838.19, where a cent-by-cent schedule of $599.55 payments, with interest \
         rounded each month and a final payment of $600.00, gives $115,838.45."
    ));
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

/// A loan with a balloon owed at the end of the term, paid in arrears or in advance:
/// exact payment, first interest, first principal and total interest, in cents. The
/// payment is the principal less the balloon's discounted value, over the sum of the
/// monthly discount factors (scale/growth)^k, for k = 1 to n in arrears and 0 to n - 1 in
/// advance, each summed here one month at a time over the common denominator growth^n.
fn financed_loan_oracle(
    principal: u64,
    rate: u64,
    months: u32,
    balloon: u64,
    advance: bool,
) -> [u64; 4] {
    let scale = BigUint::from(MONTHLY_SCALE);
    let growth = BigUint::from(MONTHLY_SCALE + rate);
    let mut factors = BigUint::ZERO;
    let mut scale_power = BigUint::from(1_u8);
    let mut growth_power = BigUint::from(1_u8);
    for _ in 0..months {
        // In arrears this month adds scale^(k+1); in advance, one month earlier, scale^k.
        let term = if advance {
            &scale_power * &growth
        } else {
            &scale_power * &scale
        };
        factors = factors * &growth + term;
        scale_power *= &scale;
        growth_power *= &growth;
    }
    let (principal, balloon) = (BigUint::from(principal), BigUint::from(balloon));
    let payment_top = &principal * &growth_power - &balloon * &scale_power;
    let payment = half_up(&payment_top, &factors);
    let first_interest_top = if advance {
        BigUint::ZERO
    } else {
        &principal * rate
    };
    let total_interest_top = &payment_top * months - (&principal - &balloon) * &factors;
    let first_interest = half_up(&first_interest_top, &scale);
    [
        payment,
        first_interest,
        payment - first_interest,
        half_up(&total_interest_top, &factors),
    ]
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
    let advance = rng.below(2) == 1;
    let [payment, first_interest, first_principal, total_interest] =
        financed_loan_oracle(principal, rate, months, balloon, advance);
    (
        json!({
            "kind": "loan",
            "principal": dollars(principal),
            "rate": format!("{}.{:04}", rate / 10_000, rate % 10_000),
            "months": months.to_string(),
            "balloon": dollars(balloon),
            "timing": if advance { "advance" } else { "arrears" },
        }),
        json!({
            "payment": shown(payment),
            "firstInterest": shown(first_interest),
            "firstPrincipal": shown(first_principal),
            "totalInterest": shown(total_interest),
        }),
    )
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
    // read 15 November 2026, gives the same payment and $15,245.63 of total interest.
    let arrears = financed_loan_oracle(6_000_000, 75_000, 60, 1_800_000, false);
    assert_eq!(arrears, [95_409, 37_500, 57_909, 1_524_563]);
    // By hand: month 1 charges $60,000.00 x 0.625% = $375.00, so $60,000.00 + $375.00 -
    // $954.09 leaves $59,420.91; month 2 charges $371.38 (371.3806...), leaving $58,838.20.
    let rows = balloon_schedule(6_000_000, 75_000, 60, 95_409, false);
    assert_eq!(rows[0], (37_500, 5_942_091));
    assert_eq!(rows[1], (37_138, 5_883_820));
    // After 60 payments the cent-rounded schedule owes $18,000.26: the balloon plus 26
    // cents of rounding, which a lender settles in the final amount.
    assert_eq!(rows[59], (11_773, 1_800_026));
    // In advance the payment is the arrears one over 1.00625: $948.17, the first with no
    // interest. Month 1: $60,000.00 - $948.17 = $59,051.83, which earns $369.07 (369.0739...)
    // to close at $59,420.90.
    let advance = financed_loan_oracle(6_000_000, 75_000, 60, 1_800_000, true);
    assert_eq!(advance, [94_817, 0, 94_817, 1_489_007]);
    let rows = balloon_schedule(6_000_000, 75_000, 60, 94_817, true);
    assert_eq!(rows[0], (36_907, 5_942_090));
    assert_eq!(rows[59], (11_180, 1_799_983));
    // No balloon in arrears is the existing oracle's loan, to the cent.
    for (principal, rate, months) in [(10_000_000, 60_000, 360), (6_000_000, 75_000, 60)] {
        assert_eq!(
            financed_loan_oracle(principal, rate, months, 0, false),
            loan_oracle(principal, rate, months)
        );
    }
}

#[test]
fn the_engine_agrees_with_the_oracle_on_every_seeded_balloon_and_advance_loan() {
    if !common::rendered() {
        return;
    }
    let mut rng = Seeded(0x2026_1115_BA11_0017);
    let (cases, expected): (Vec<Value>, Vec<Value>) =
        (0..BALLOON_CASES).map(|_| balloon_case(&mut rng)).unzip();
    assert!(cases.iter().any(|case| case["timing"] == "advance"));
    assert!(
        cases
            .iter()
            .any(|case| case["balloon"] == case["principal"])
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
import { fbtLoan, fbtMealEntertainment, fbtCarParking } from './assets/business-calculators.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const engines = { loan: fbtLoan, meal: fbtMealEntertainment, parking: fbtCarParking };
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
