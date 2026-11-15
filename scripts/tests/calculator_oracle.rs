// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! An independent oracle for the loan, Division 7A, Coal LSL and transfer duty engines. 300 seeded
//! fictional cases are worked here in exact integers, by a route the engines do not take,
//! and each result must equal what the browser module returns under Node. The loan sums
//! its discount factors one month at a time, and the Division 7A minimum yearly repayment
//! one year at a time, where `assets/business-calculators.mjs` uses the closed annuity
//! form; the levy works from section 3B of the Coal Mining Industry (Long Service Leave)
//! Payroll Levy Collection Act 1992 in quarter cents. Transfer duty types each
//! jurisdiction's scale here from its revenue office or legislation, not from the site's
//! rate table, and checks the engine either side of every band threshold and on 160 seeded
//! values, so a slip in either transcription shows.
//!
//! The route is independent; the conventions are not. The oracle takes the same 12 equal
//! months, payment count, unrounded total interest and half-up final rounding as the
//! engines, and the same Division 7A interest part (the rate on the whole balance), so it
//! cannot show those are the right conventions.
//!
//! Nothing here imports an engine or a constant from one, and a change to the case seed
//! needs no change to the expected values, which are never stored.
mod common;

use num_bigint::BigUint;
use serde_json::{Value, json};
use std::io::Write;
use std::process::{Command, Stdio};

const LOAN_CASES: usize = 120;
const DIV7A_CASES: usize = 60;
const LEVY_CASES: usize = 120;
/// Seeded transfer duty values, beside every band boundary of every jurisdiction.
const DUTY_CASES: usize = 160;
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
import { loan, div7aMinimumRepayment, transferDuty } from './assets/business-calculators.mjs';
import { baseRateWages, annualSalaryWages, casualWages, levyCents } from './assets/levy.mjs';
// Each jurisdiction's scale as the rendered calculator page gives it to the browser.
const page = readFileSync('tools/business-calculators/transfer-duty/index.html', 'utf8');
const scales = Object.fromEntries([...page.matchAll(/value="(AU-[A-Z]+)" data-name="[^"]+" data-scale="([^"]+)"/g)]
  .map(([, place, scale]) => [place, scale.split(';').map((row) => row.split(','))]));
let input = '';
for await (const chunk of process.stdin) input += chunk;
const money = (value) => String(value);
const levy = (result) => ({ branch: result.branch, winner: result.winner ?? null,
  quarters: result.eligibleWagesCents * 4, levy: levyCents(result.eligibleWagesCents) });
const run = {
  loan: ({ principal, rate, months }) => {
    const result = loan(principal, rate, months);
    return { payment: money(result.payment), firstInterest: money(result.firstInterest),
      firstPrincipal: money(result.firstPrincipal), totalInterest: money(result.totalInterest) };
  },
  div7a: ({ balance, rate, term }) => {
    const result = div7aMinimumRepayment(balance, rate, term);
    return { repayment: money(result.repayment), interest: money(result.interest), principal: money(result.principal) };
  },
  base: ({ inputs }) => levy(baseRateWages(inputs)),
  salary: ({ inputs }) => levy(annualSalaryWages(inputs)),
  casual: ({ inputs }) => levy(casualWages(inputs)),
  duty: ({ value, place }) => ({ duty: money(transferDuty(value, scales[place]).duty) }),
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
    let first_interest_top = &balance * rate;
    let first_principal_top = &payment_top * &scale - &first_interest_top * &factors;
    let total_interest_top = &payment_top * months - &balance * &factors;
    [
        half_up(&payment_top, &factors),
        half_up(&first_interest_top, &scale),
        half_up(&first_principal_top, &(&factors * &scale)),
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
    let mut node = Command::new("node")
        .args(["--input-type=module", "--eval", HARNESS])
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
    let mut rng = Seeded(0x2026_1105_C0A1_7E57);
    let (mut cases, mut expected) = (Vec::new(), Vec::new());
    for index in 0..LOAN_CASES + LEVY_CASES + DIV7A_CASES {
        let (case, result) = if index < LOAN_CASES {
            loan_case(&mut rng)
        } else if index < LOAN_CASES + LEVY_CASES {
            levy_case(&mut rng)
        } else {
            div7a_case(&mut rng)
        };
        cases.push(case);
        expected.push(result);
    }
    assert_eq!(cases.len(), 300);
    let actual = engines(&cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}
