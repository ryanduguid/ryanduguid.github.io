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
//! needs no change to the expected values, which are never stored. The objection deadline
//! and PAYG instalment engines have oracles of their own, after the others.
//!
//! A further 60 seeded termination payments, from their own seed, read preservation age from
//! Schedule 11's table as date ranges and build the tax-free limit a year of service at a time,
//! where the engine works the age out from the year of birth and multiplies. Both round each
//! part's withholding to the dollar, 50 cents up, so the oracle cannot show that convention.
mod common;

use chrono::{Datelike, NaiveDate, Weekday};
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
import { loan, div7aMinimumRepayment, terminationPayment } from './assets/business-calculators.mjs';
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
  etp: ({ payment, year }) => Object.fromEntries(Object.entries(terminationPayment(payment, year))
    .map(([key, value]) => [key, typeof value === 'number' ? money(value) : value])),
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

/// The last day of `years` years after `notice`, worked with chrono's calendar where the
/// engine rolls JavaScript dates: the period starts the next day (s 36(1) item 6 of the Acts
/// Interpretation Act 1901) and ends the day before the same date in the later year, which
/// for a 29 February start with none that year is the day before 1 March.
fn years_after(notice: NaiveDate, years: i32) -> NaiveDate {
    let start = notice.succ_opt().unwrap();
    let same = start
        .with_year(start.year() + years)
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(start.year() + years, 3, 1).unwrap());
    same.pred_opt().unwrap()
}

/// 60 days after `notice`, one day at a time.
fn sixty_days_after(notice: NaiveDate) -> NaiveDate {
    (0..60).fold(notice, |day, _| day.succ_opt().unwrap())
}

/// s 36(2): a Saturday or Sunday last day moves to the next weekday.
fn lodging_day(end: NaiveDate) -> NaiveDate {
    let mut day = end;
    while matches!(day.weekday(), Weekday::Sat | Weekday::Sun) {
        day = day.succ_opt().unwrap();
    }
    day
}

/// The period's end, the lodging day, and for an amended assessment its 2 candidate ends, from
/// s 14ZW(1)(aa), (aaa) and (c), and (1B) and (1BA).
fn objection_oracle(
    decision: &str,
    group: i32,
    notice: NaiveDate,
    first: NaiveDate,
) -> [Option<NaiveDate>; 4] {
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

fn iso(day: Option<NaiveDate>) -> Value {
    day.map_or(Value::Null, |day| json!(day.format("%Y-%m-%d").to_string()))
}

/// A notice date weighted to the boundaries: month ends, 28 and 29 February, leap and
/// century years, and the first and last years the engine accepts.
fn notice_day(rng: &mut Seeded) -> NaiveDate {
    let any_year = 1900 + rng.below(8090) as i32;
    let year = rng.pick(&[1900, 2000, 2026, 2027, 2028, 2100, 9989, any_year, any_year]);
    let month = 1 + rng.below(12) as u32;
    let last = (28..=31)
        .rev()
        .find(|day| NaiveDate::from_ymd_opt(year, month, *day).is_some())
        .unwrap();
    let any_day = 1 + rng.below(u64::from(last)) as u32;
    let day = rng
        .pick(&[1, 28, 29, last, last, any_day, any_day])
        .min(last);
    NaiveDate::from_ymd_opt(year, month, day).unwrap()
}

fn objection_case(rng: &mut Seeded) -> (Value, Value) {
    let decision = rng.pick(&["assessment", "amended", "fbt", "amended-fbt", "other"]);
    let group = rng.pick(&[2, 4]);
    let notice = notice_day(rng);
    // A first notice on or before the amended one, up to about 6 years earlier.
    let floor = NaiveDate::from_ymd_opt(1900, 1, 1).unwrap();
    let first = (0..rng.below(2200)).fold(notice, |day, _| day.pred_opt().unwrap().max(floor));
    (
        json!({
            "kind": "objection",
            "decision": decision,
            "group": group.to_string(),
            "notice": notice.format("%Y-%m-%d").to_string(),
            "first": first.format("%Y-%m-%d").to_string(),
        }),
        {
            let [period, last, amended, original] =
                objection_oracle(decision, group, notice, first);
            json!({"periodEnds": iso(period), "lastDay": iso(last),
                "amendedEnds": iso(amended), "firstEnds": iso(original)})
        },
    )
}

fn date(year: i32, month: u32, day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(year, month, day).unwrap()
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
    let mut rng = Seeded(0x2026_1115_0E7B_0011);
    let (cases, expected): (Vec<Value>, Vec<Value>) =
        (0..ETP_CASES).map(|_| etp_case(&mut rng)).unzip();
    let actual = engines(&cases);
    assert_eq!(actual.len(), cases.len());
    for ((case, want), got) in cases.iter().zip(&expected).zip(&actual) {
        assert_eq!(got, want, "{case}");
    }
}
