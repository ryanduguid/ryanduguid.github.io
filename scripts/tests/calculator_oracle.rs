// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! An independent oracle for the loan, Division 7A and Coal LSL engines. 300 seeded
//! fictional cases are worked here in exact integers, by a route the engines do not take,
//! and each result must equal what the browser module returns under Node. The loan sums
//! its discount factors one month at a time, and the Division 7A minimum yearly repayment
//! one year at a time, where `assets/business-calculators.mjs` uses the closed annuity
//! form; the levy works from section 3B of the Coal Mining Industry (Long Service Leave)
//! Payroll Levy Collection Act 1992 in quarter cents.
//!
//! The route is independent; the conventions are not. The oracle takes the same 12 equal
//! months, payment count, unrounded total interest and half-up final rounding as the
//! engines, and the same Division 7A interest part (the rate on the whole balance), so it
//! cannot show those are the right conventions.
//!
//! Nothing here imports an engine or a constant from one, and a change to the case seed
//! needs no change to the expected values, which are never stored.
//!
//! A further 120 seeded PCG 2021/4 arrangements, from their own seed, are scored against
//! each band's lower and upper bounds as Table 1 writes them and the zone ranges of
//! Table 2, where the engine takes the first band whose lower bound a percentage reaches.
mod common;

use num_bigint::BigUint;
use serde_json::{Value, json};
use std::io::Write;
use std::process::{Command, Stdio};

const LOAN_CASES: usize = 120;
const DIV7A_CASES: usize = 60;
const LEVY_CASES: usize = 120;
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
const HARNESS: &str = r"
import { loan, div7aMinimumRepayment, pcgRisk } from './assets/business-calculators.mjs';
import { baseRateWages, annualSalaryWages, casualWages, levyCents } from './assets/levy.mjs';
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
  pcg: ({ arrangement }) => Object.fromEntries(Object.entries(pcgRisk(arrangement))
    .map(([key, value]) => [key, value === null ? null : String(value)])),
};
process.stdout.write(JSON.stringify(JSON.parse(input).map((one) => run[one.kind](one))));
";

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

const PCG_CASES: usize = 120;

/// One band of PCG 2021/4 Table 1 (paragraph 76) as the table writes it: the lower and upper
/// percentages and whether each is included. `None` is an open end.
type Band = (Option<(u64, bool)>, Option<(u64, bool)>);

/// Table 1, scores 1 to 6 for each factor, in the table's own words: '>90%', '>75% to ≤90%' ...
const PCG_TABLE_1: [[Band; 6]; 3] = [
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
    let holds = |(lower, upper): Band| {
        lower.is_none_or(|(p, inclusive)| {
            let bound = u128::from(p) * whole;
            if inclusive { part >= bound } else { part > bound }
        }) && upper.is_none_or(|(p, inclusive)| {
            let bound = u128::from(p) * whole;
            if inclusive { part <= bound } else { part < bound }
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
        _ if exact % 100 == 0 => (exact / 100).saturating_add_signed(rng.pick(&[-1, 0, 0, 1])),
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
        let (factor1, factor2) = (pcg_band(0, returned, entitlement), pcg_band(1, tax, entitlement));
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
    let mut rng = Seeded(0x2026_1115_0FC6_2021);
    let (cases, expected): (Vec<_>, Vec<_>) = (0..PCG_CASES).map(|_| pcg_case(&mut rng)).unzip();
    let actual = engines(&cases);
    assert_eq!(actual.len(), PCG_CASES);
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}
