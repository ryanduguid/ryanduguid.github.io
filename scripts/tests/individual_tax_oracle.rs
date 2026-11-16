// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

//! An independent oracle for the individual tax engines: `assets/income-tax.mjs`,
//! `assets/study-loan.mjs` and `assets/take-home-pay.mjs`. Seeded fictional cases are worked
//! here in exact integers, by a route the engines do not take, and each result must equal what
//! the browser modules return under Node.
//!
//! The engines apply each band's rate per cent to the part of income in it, as Schedule 7 of the
//! Income Tax Rates Act 1986 writes the scales; the oracle reads the ATO's printed tables instead,
//! a base amount plus cents for each dollar over the band's threshold, typed here from the ATO's
//! pages read on 17 November 2026, so a slip in either transcription shows. The low income tax
//! offset takes 5% of the income between $37,500 and $45,000 and 1.5% of the income above it off
//! $700, where the engine branches by band. The study loan repayment uses the ATO's printed range
//! for each rule, where the engine takes the lesser of the two amounts section 154-20 sets.
//!
//! The route is independent; the conventions are not. Both round a half cent up and cap the offset
//! at the tax, and the take-home oracle splits a package including super by the engine's formula,
//! so it checks how the parts combine, not that split.
//! The engines run from the repository's own `assets/`, not the rendered site.

use serde_json::{Value, json};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

const HARNESS: &str = r"
import { incomeTax } from './assets/income-tax.mjs';
import { studyLoanRepayment } from './assets/study-loan.mjs';
import { takeHomePay } from './assets/take-home-pay.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const cents = (result) => Object.fromEntries(Object.entries(result)
  .map(([key, value]) => [key, typeof value === 'number' ? Math.round(value * 100) : value]));
const run = {
  tax: ({ income, year, residency }) => cents(incomeTax(String(income), year, residency)),
  loan: ({ income, year }) => cents(studyLoanRepayment({ taxable: String(income), fringe: '0', losses: '0',
    super: '0', foreign: '0' }, year)),
  pay: ({ pay }) => cents(takeHomePay(pay)),
};
process.stdout.write(JSON.stringify(JSON.parse(input).map((one) => run[one.kind](one))));
";

const YEARS: [&str; 3] = ["2024-25", "2025-26", "2026-27"];
const RESIDENCY: [&str; 3] = ["resident", "foreign", "working-holiday"];
const TAX_CASES: usize = 600;
const LOAN_CASES: usize = 300;
const PAY_CASES: usize = 300;

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

/// One row of an ATO table: income above `over` pays `base` dollars plus `cents` for each dollar over.
type Row = (u64, u64, u64);

/// The ATO's tables: 'Tax rates – Australian resident' (last updated 13 August 2026), 'Tax rates –
/// foreign resident' and 'Tax rates – working holiday maker' (both last updated 1 June 2026). The
/// working holiday maker table prints 2025-26 and earlier; Part III's table is the same for
/// 2024-25 or a later year.
fn table(year: &str, residency: &str) -> &'static [Row] {
    match (residency, year) {
        ("resident", "2026-27") => &[
            (0, 0, 0),
            (18_200, 0, 15),
            (45_000, 4_020, 30),
            (135_000, 31_020, 37),
            (190_000, 51_370, 45),
        ],
        ("resident", _) => &[
            (0, 0, 0),
            (18_200, 0, 16),
            (45_000, 4_288, 30),
            (135_000, 31_288, 37),
            (190_000, 51_638, 45),
        ],
        ("foreign", _) => &[(0, 0, 30), (135_000, 40_500, 37), (190_000, 60_850, 45)],
        _ => &[
            (0, 0, 15),
            (45_000, 6_750, 30),
            (135_000, 33_750, 37),
            (190_000, 54_100, 45),
        ],
    }
}

/// Tax in cents on whole dollars, from the last row whose threshold the income passes.
fn table_tax(income: u64, rows: &[Row]) -> u64 {
    let &(over, base, cents) = rows
        .iter()
        .rev()
        .find(|(over, ..)| income > *over)
        .unwrap_or(&rows[0]);
    base * 100 + income.saturating_sub(over) * cents
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

/// Medicare Levy Act 1986 s 3(1), [threshold amount, phase-in limit], as Compilation No. 53 and
/// the ATO's 2025 return instructions give them.
fn medicare(income: u64, year: &str) -> u64 {
    let (threshold, limit) = if year == "2024-25" {
        (27_222, 34_027)
    } else {
        (28_011, 35_013)
    };
    if income <= threshold {
        0
    } else if income <= limit {
        (income * 2).min((income - threshold) * 10)
    } else {
        income * 2
    }
}

fn tax_oracle(income: u64, year: &str, residency: &str) -> Value {
    let tax = table_tax(income, table(year, residency));
    let resident = residency == "resident";
    let offset = if resident { offset(income).min(tax) } else { 0 };
    let levy = if resident { medicare(income, year) } else { 0 };
    json!({"tax": tax, "offset": offset, "netTax": tax - offset, "medicare": levy, "total": tax - offset + levy})
}

/// The ATO's 'Study and training loan repayment thresholds and rates' (last updated 30 June 2026):
/// Tables 1 and 2 as ranges, with the 17% band's base as section 154-20(2) gives it (15% of the
/// first band, $9,028.35 for 2026-27, which the page prints as $9,028), and Table 3 for 2024-25.
fn loan_oracle(income: u64, year: &str) -> Value {
    let (repayment, method) = match year {
        "2024-25" => {
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
            match TABLE_3.iter().rev().find(|(from, _)| income >= *from) {
                Some((_, tenths)) => ((income * tenths + 5) / 10, "percent-of-income"),
                None => (0, "nil"),
            }
        }
        _ => {
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
        }
    };
    json!({"repaymentIncome": income * 100, "repayment": repayment, "method": method})
}

/// Super guarantee per mille and the year's maximum contribution base in dollars, from the ATO's
/// 'Super guarantee' page (Tables 21, 23 and 24, last updated 17 April 2026).
fn super_guarantee(year: &str) -> (u64, u64) {
    match year {
        "2026-27" => (120, 270_830),
        "2025-26" => (120, 62_500 * 4),
        _ => (115, 65_070 * 4),
    }
}

fn half_up(numerator: u64, denominator: u64) -> u64 {
    (2 * numerator + denominator) / (2 * denominator)
}

/// Pay from the salary: super is the rate on the salary up to the base. A package including
/// super splits by the same formula as the engine, super rounded and the salary the rest.
fn pay_oracle(salary: u64, year: &str, residency: &str, included: bool, loan: bool) -> Value {
    let (mille, cap) = super_guarantee(year);
    let (entered, cap) = (salary * 100, cap * 100);
    let sg = if !included {
        half_up(entered.min(cap) * mille, 1000)
    } else if entered * 1000 <= cap * (1000 + mille) {
        half_up(entered * mille, 1000 + mille)
    } else {
        half_up(cap * mille, 1000)
    };
    let salary = if included { entered - sg } else { entered };
    // ITAA 1997 s 25-130 from 2026-27: a resident deducts the lesser of $1,000 and the salary.
    let dollars = salary / 100;
    let deduction = if year == "2026-27" && residency == "resident" {
        dollars.min(1000)
    } else {
        0
    };
    let taxable = dollars - deduction;
    let tax = tax_oracle(taxable, year, residency);
    let repayment = if loan {
        loan_oracle(taxable, year)["repayment"].as_u64().unwrap()
    } else {
        0
    };
    let net = salary - tax["total"].as_u64().unwrap() - repayment;
    json!({"salary": salary, "superGuarantee": sg, "deduction": deduction * 100, "tax": tax["tax"], "offset": tax["offset"],
        "medicare": tax["medicare"], "studyLoan": repayment, "net": net, "monthly": half_up(net, 12),
        "fortnightly": half_up(net, 26), "weekly": half_up(net, 52)})
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

const TAX_THRESHOLDS: [u64; 12] = [
    18_200, 27_222, 28_011, 34_027, 35_013, 37_500, 45_000, 66_667, 135_000, 190_000, 1, 0,
];
const LOAN_THRESHOLDS: [u64; 10] = [
    54_435, 66_621, 159_664, 67_000, 125_000, 179_286, 69_528, 129_717, 186_051, 0,
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
    // Low and middle income earner tax offsets: Jeff's low income tax offset at $45,000 is $325.
    assert_eq!(offset(45_000), 32_500);
    // Study loan examples 1 and 3 for 2026-27: Christina and Priya; Barry by section 154-20.
    assert_eq!(loan_oracle(86_380, "2026-27")["repayment"], 252_780);
    assert_eq!(loan_oracle(254_780, "2026-27")["repayment"], 2_547_800);
    assert_eq!(loan_oracle(137_064, "2026-27")["repayment"], 1_027_734);
    // Example 4 for 2024-25: 5.5% of $99,736 is $5,485.48 (the page prints $5,485.52).
    assert_eq!(loan_oracle(99_736, "2024-25")["repayment"], 548_548);
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
fn the_take_home_pay_engine_agrees_with_the_oracle_on_every_seeded_case() {
    let mut rng = Seeded(0x2026_1117_1A7C_0003);
    let (cases, expected): (Vec<Value>, Vec<Value>) = (0..PAY_CASES)
        .map(|_| {
            let salary = rng.income(&[
                250_000, 260_280, 270_830, 280_000, 303_330, 290_212, 112_000, 37_500, 1_000, 1_001,
            ]);
            let (year, residency) = (rng.pick(&YEARS), rng.pick(&RESIDENCY));
            let (included, loan) = (rng.below(2) == 0, rng.below(2) == 0);
            let pay = json!({"year": year, "residency": residency, "salary": salary.to_string(),
                "includesSuper": included, "studyLoan": loan});
            (
                json!({"kind": "pay", "pay": pay}),
                pay_oracle(salary, year, residency, included, loan),
            )
        })
        .unzip();
    agree(&cases, &expected);
}
