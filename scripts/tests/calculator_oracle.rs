// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! An independent oracle for the loan, Division 7A, FBT car and Coal LSL engines. 360 seeded
//! fictional cases are worked here in exact integers, by a route the engines do not take,
//! and each result must equal what the browser module returns under Node. The loan sums
//! its discount factors one month at a time, and the Division 7A minimum yearly repayment
//! one year at a time, where `assets/business-calculators.mjs` uses the closed annuity
//! form; the levy works from section 3B of the Coal Mining Industry (Long Service Leave)
//! Payroll Levy Collection Act 1992 in quarter cents. The FBT car value adds the statutory
//! formula's share of the base value one day at a time and takes the business use share off
//! the operating costs, where the engine multiplies by the days and the private use share.
//!
//! The route is independent; the conventions are not. The oracle takes the same 12 equal
//! months, payment count, unrounded total interest and half-up final rounding as the
//! engines, the same Division 7A interest part (the rate on the whole balance) and the same
//! FBT rounding (each value to the cent before contributions, the gross-up and the FBT from
//! the figure before them), so it cannot show those are the right conventions.
//!
//! A further 120 seeded loans, from their own seed so the 360 above are unchanged, add a
//! balloon owed at the end of the term and payments in arrears or in advance; the oracle
//! discounts the balloon and sums each timing's factors month by month, where the engine
//! takes the closed form and divides by one month's growth for advance.
//!
//! Nothing here imports an engine or a constant from one, and a change to the case seed
//! needs no change to the expected values, which are never stored.
//!
//! A further 120 seeded fixed fees, from their own seed, are worked by the definition of
//! rounding up (the smallest whole number of steps whose fee keeps the margin) and their
//! instalments by sharing out the cents left over, where the engine divides with a ceiling.
mod common;

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
import { loan, div7aMinimumRepayment, fbtCar, fixedFee } from './assets/business-calculators.mjs';
import { baseRateWages, annualSalaryWages, casualWages, levyCents } from './assets/levy.mjs';
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
  fee: ({ hours, rate, margin, roundTo, gst, instalments }) => {
    try {
      const result = fixedFee(hours, rate, margin, roundTo, gst, instalments);
      return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, money(value)]));
    } catch (error) {
      return { refused: error.message };
    }
  },
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
    let first_principal_top = &payment_top * &scale - &first_interest_top * &factors;
    let total_interest_top = &payment_top * months - (&principal - &balloon) * &factors;
    [
        payment,
        half_up(&first_interest_top, &scale),
        half_up(&first_principal_top, &(&factors * &scale)),
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
