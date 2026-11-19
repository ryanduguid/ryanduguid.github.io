// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { daysInYear, incomeTax, INCOME_TAX_YEARS, RESIDENT_SCALES, MEDICARE_THRESHOLDS, medicareLevySurcharge,
  SURCHARGE_THRESHOLDS } from '../assets/income-tax.mjs';
import { studyLoanRepayment, STUDY_LOAN_YEARS } from '../assets/study-loan.mjs';
import { CONCESSIONAL_CAP, division293, takeHomePay, SUPER_GUARANTEE } from '../assets/take-home-pay.mjs';
import { taxEstimate } from '../assets/tax-estimate.mjs';
import { withholding } from '../assets/payg-withholding.mjs';
import { individualResult } from '../assets/individual-tax-results.mjs';
import { bonusWithholding } from '../assets/bonus-withholding.mjs';

const engines = { taxEstimate, takeHomePay, studyLoanRepayment, bonusWithholding };
const shownCases = JSON.parse(readFileSync(new URL('../_data/individual_tax_cases.json', import.meta.url), 'utf8'));
const dollars = (value) => `$${Number(value).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (value) => `$${Number(value).toLocaleString('en-AU')}`;
const RESIDENCY = { resident: 'Australian resident', foreign: 'foreign resident', 'working-holiday': 'working holiday maker' };
const PARTS = [['taxable', 'taxable income'], ['fringe', 'fringe benefits'], ['losses', 'net investment loss'],
  ['super', 'super contributions'], ['foreign', 'exempt foreign employment income']];
const PERIOD = { year: 'a year', month: 'a month', fortnight: 'a fortnight', week: 'a week' };
const parts = (r) => PARTS.filter(([key]) => key === 'taxable' || r[key] !== '0').map(([key, label]) => `${label} ${whole(r[key])}`)
  .join(', ');
const settle = (value) => `${value < 0 ? 'owing' : 'refund'} ${dollars(Math.abs(value))}`;
const PAY_NAME = { week: 'weekly', fortnight: 'fortnightly', month: 'monthly' };

// How each row's call reads on the page and how its result reads, so neither can drift from the engine.
const INPUTS = {
  taxEstimate: (r) => `${r.year}, ${RESIDENCY[r.residency]}, ${parts(r)}${r.studyLoan ? ', study loan' : ''}`
    + `${r.uncoveredDays === '0' ? '' : `, ${r.uncoveredDays} days without hospital cover`}`
    + `${r.spouse === null ? '' : `, spouse ${whole(r.spouse)}`}${r.children === '0' ? '' : `, ${r.children} children`}`
    + `, withheld ${dollars(r.withheld)}`,
  takeHomePay: (p) => `${p.year}, ${RESIDENCY[p.residency]}, ${whole(p.salary)} ${PERIOD[p.period]} `
    + `${p.includesSuper ? 'including' : 'plus'} super${p.sacrifice === '0' ? '' : `, ${whole(p.sacrifice)} sacrificed`}`
    + `${p.studyLoan ? ', study loan' : ''}${p.hospitalCover ? '' : ', no hospital cover'}`,
  studyLoanRepayment: (r, year) => `${year}: ${parts(r)}`,
  bonusWithholding: (b) => `${PAY_NAME[b.period]}, scale ${b.residency === 'resident' ? 2 : 3}${b.studyLoan ? ', study loan' : ''}, `
    + `${dollars(b.earnings)} this pay; ` + (b.method === 'A' ? `Method A: ${dollars(b.additional)} over ${b.spread} pays`
    : [b.backPays !== '0' ? `B(i): ${dollars(b.backEach)} for each of ${b.backPays} pays of ${dollars(b.backEarnings)} that had `
      + `${dollars(b.backWithheld)} withheld` : '', b.additional !== '0' ? `B(ii): ${dollars(b.additional)}, ${dollars(b.yearToDate)} `
      + `over ${b.paysToDate} pays to date${b.earlierAdditional === '0' ? '' : `, earlier ${dollars(b.earlierAdditional)} with `
      + `${dollars(b.earlierWithheld)} withheld`}` : ''].filter(Boolean).join('; ')),
};
const OUTPUTS = {
  taxEstimate: (r, call) => `Tax ${dollars(r.tax)}, offset ${dollars(r.offset)}`
    + `${['2020-21', '2021-22'].includes(call.year) ? `, LMITO ${dollars(r.lmito)}` : ''}, Medicare levy ${dollars(r.medicare)}, `
    + `surcharge ${dollars(r.surcharge)}${call.studyLoan ? `, study loan ${dollars(r.studyLoan)}` : ''}, `
    + `total ${dollars(r.assessed)}, ${settle(r.refund)}`,
  takeHomePay: (r) => `Take-home ${dollars(r.net)} a year, ${dollars(r.fortnightly)} a fortnight; super ${dollars(r.superGuarantee)}`
    + `${r.withheld ? `; withheld ${dollars(r.withheld.total)} a pay, ${settle(r.withheld.refund)}` : ''}`
    + `${r.overCap ? `; ${dollars(r.overCap)} over the cap` : ''}${r.division293 ? `; Division 293 on ${dollars(r.division293)}` : ''}`,
  studyLoanRepayment: (r) => `Repayment income ${dollars(r.repaymentIncome)}, repayment ${dollars(r.repayment)}`,
  bonusWithholding: (r) => `Withheld ${dollars(r.total)}: ${dollars(r.onEarnings)} on earnings`
    + (r.method === 'A' ? `, ${dollars(r.onAdditional)} on the payment (limit ${dollars(r.limit)}); adds ${dollars(r.yearTax)} to a year`
      : `${r.methodBi ? `, ${dollars(r.methodBi.onBackPayment)} by B(i)` : ''}`
        + `${r.methodBii ? `, ${dollars(r.methodBii.onAdditional)} by B(ii) (limit ${dollars(r.methodBii.limit)})` : ''}`),
};

test('each individual tax page has its boundary cases', () => {
  const pages = readdirSync(new URL('../tools/individual-tax/', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(Object.keys(shownCases).sort(), pages);
});

for (const [page, { function: name, rows }] of Object.entries(shownCases)) {
  for (const row of rows) {
    test(`${page} boundary case returns what its page shows: ${row.case}`, () => {
      assert.equal(INPUTS[name](...row.call), row.input);
      const result = engines[name](...row.call);
      assert.deepEqual(result, row.result);
      assert.equal(OUTPUTS[name](result, ...row.call), row.output);
    });
  }
}

// The values each form opens with: an input's value, or the checked radio's value.
const formDefaults = (html) => {
  const fields = {};
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    if (name && /\btype="radio"/.test(tag) && !/\bchecked\b/.test(tag)) continue;
    if (name) fields[name] = tag.match(/\bvalue="([^"]*)"/)?.[1];
  }
  return fields;
};
// How assets/individual-tax-results.mjs passes each form's fields to its engine.
const FORM_CALLS = {
  taxEstimate: (f) => [{ year: f.year, residency: f.residency, taxable: f.income, fringe: f.fringe, super: f.super,
    losses: f.losses, foreign: f.foreign, studyLoan: f['study-loan'] === 'yes', uncoveredDays: f.uncovered,
    spouse: f.spouse === 'yes' ? f['spouse-income'] : null, children: f.children, withheld: f.withheld }],
  takeHomePay: (f) => [{ year: f.year, residency: f.residency, salary: f.salary, period: f.period,
    includesSuper: f.super === 'included', sacrifice: f.sacrifice, studyLoan: f['study-loan'] === 'yes',
    hospitalCover: f.cover === 'yes' }],
  studyLoanRepayment: (f) => [{ taxable: f.taxable, fringe: f.fringe, losses: f.losses, super: f.super, foreign: f.foreign }, f.year],
  bonusWithholding: (f) => [{ period: f.period, residency: f.residency, studyLoan: f['study-loan'] === 'yes', method: f.method,
    earnings: f.earnings, additional: f.additional, spread: f.spread, backPays: f['back-pays'], backEarnings: f['back-earnings'],
    backEach: f['back-each'], backWithheld: f['back-withheld'], yearToDate: f['year-to-date'], paysToDate: f['pays-to-date'],
    earlierAdditional: f['earlier-additional'], earlierWithheld: f['earlier-withheld'] }],
};
for (const [page, { function: name, rows: [first] }] of Object.entries(shownCases)) {
  test(`${page} opens on its first boundary case as the worked example`, () => {
    const html = readFileSync(new URL(`../_includes/calculators/${page}.html`, import.meta.url), 'utf8');
    assert.deepEqual(FORM_CALLS[name](formDefaults(html)), first.call);
    assert.equal(html.match(/\{% include calculator-example\.html /g)?.length, 1);
  });
}

// Base amounts printed in the ATO's tables (Tax rates – Australian resident, last updated 13 August 2026;
// foreign resident and working holiday maker, last updated 1 June 2026; read 17 November 2026): the tax at
// the top of each band.
test('the scales give the ATO tables’ amount at the top of each band', () => {
  const tax = (income, year, residency) => incomeTax(String(income), year, residency).tax;
  for (const [income, expected] of [[45000, 4020], [135000, 31020], [190000, 51370]]) {
    assert.equal(tax(income, '2026-27', 'resident'), expected);
  }
  for (const year of ['2024-25', '2025-26']) {
    for (const [income, expected] of [[45000, 4288], [135000, 31288], [190000, 51638]]) {
      assert.equal(tax(income, year, 'resident'), expected);
    }
  }
  for (const year of ['2024-25', '2025-26', '2026-27']) {
    for (const [income, expected] of [[135000, 40500], [190000, 60850]]) assert.equal(tax(income, year, 'foreign'), expected);
    for (const [income, expected] of [[45000, 6750], [135000, 33750], [190000, 54100]]) {
      assert.equal(tax(income, year, 'working-holiday'), expected);
    }
  }
  // 2020-21 to 2023-24, read 18 November 2026: 32.5% from $45,001, 37% from $120,001, 45% from $180,001.
  for (const year of ['2020-21', '2021-22', '2022-23', '2023-24']) {
    for (const [income, expected] of [[45000, 5092], [120000, 29467], [180000, 51667]]) {
      assert.equal(tax(income, year, 'resident'), expected, year);
    }
    for (const [income, expected] of [[120000, 39000], [180000, 61200]]) assert.equal(tax(income, year, 'foreign'), expected, year);
    for (const [income, expected] of [[45000, 6750], [120000, 31125], [180000, 53325]]) {
      assert.equal(tax(income, year, 'working-holiday'), expected, year);
    }
  }
});

// ITAA 1997 ss 61-105 and 61-107 (Compilation No. 233, 22 June 2022) and the ATO's examples on 'Low and
// middle income earner tax offsets' (last updated 16 June 2025), read 18 November 2026: Jeff, Anita and Andre
// for 2021-22. At exactly $126,000 the Act gives nil, where the ATO's table gives $420.
test('the low and middle income tax offset follows s 61-107 for 2020-21 and 2021-22 only', () => {
  const lmito = (income, year) => incomeTax(String(income), year, 'resident').lmito;
  for (const [income, expected] of [[37000, 675], [45000, 1275], [48000, 1500], [70000, 1500], [90000, 1500],
    [92000, 1440], [125999, 420.03], [126000, 0], [126001, 0]]) {
    assert.equal(lmito(income, '2021-22'), expected, String(income));
  }
  for (const [income, expected] of [[37000, 255], [37001, 255.08], [48000, 1080], [90001, 1079.97], [125999, 0.03], [126000, 0]]) {
    assert.equal(lmito(income, '2020-21'), expected, String(income));
  }
  assert.equal(lmito(50000, '2022-23'), 0);
  assert.equal(incomeTax('50000', '2021-22', 'foreign').lmito, 0);
  // Applied after the low income tax offset, and never below nil.
  const low = incomeTax('20000', '2021-22', 'resident');
  assert.deepEqual([low.tax, low.offset, low.lmito, low.netTax], [342, 342, 0, 0]);
  const some = incomeTax('22000', '2021-22', 'resident');
  assert.deepEqual([some.tax, some.offset, some.lmito, some.netTax], [722, 700, 22, 0]);
});

// ITAA 1997 s 61-115(1) and the ATO's worked figure: $325 at $45,000 (Jeff, on 'Low and middle income
// earner tax offsets'); $700 to $37,500; nil above $66,667.
test('the low income tax offset follows the s 61-115 table and only residents get it', () => {
  const offset = (income, residency = 'resident') => incomeTax(String(income), '2026-27', residency).offset;
  assert.equal(offset(37500), 700);
  assert.equal(offset(37501), 699.95);
  assert.equal(offset(45000), 325);
  assert.equal(offset(66665), 0.03);
  assert.equal(offset(66666), 0.01);
  assert.equal(offset(66668), 0);
  assert.equal(offset(40000, 'foreign'), 0);
  assert.equal(offset(40000, 'working-holiday'), 0);
  // The offset cannot take the tax below nil.
  assert.equal(incomeTax('20000', '2026-27', 'resident').offset, 270);
  assert.equal(incomeTax('20000', '2026-27', 'resident').netTax, 0);
});

// Medicare Levy Act 1986 ss 6(1) and 7, and the ATO's 'What is the Medicare levy' example (Matthew,
// $75,000, $1,500).
test('the Medicare levy is nil to the threshold, 10% of the excess to the phase-in limit, then 2%', () => {
  const levy = (income, year = '2026-27') => incomeTax(String(income), year, 'resident').medicare;
  assert.equal(levy(75000), 1500);
  assert.equal(levy(28011), 0);
  assert.equal(levy(28012), 0.1);
  assert.equal(levy(27222, '2024-25'), 0);
  assert.equal(levy(34027, '2024-25'), 680.5);
  assert.equal(levy(34028, '2024-25'), 680.56);
});

const csv = (path) => {
  const [head, ...lines] = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').trim().split(/\r?\n/);
  const names = head.split(',');
  return lines.map((line) => Object.fromEntries(line.match(/("[^"]*"|[^,]*)(,|$)/g).slice(0, names.length)
    .map((cell, i) => [names[i], cell.replace(/,$/, '').replace(/^"|"$/g, '')])));
};

test('the resident scales and Medicare thresholds are the site’s rate table rows', () => {
  const rows = csv('rates/individual-income-tax/individual-income-tax-rates.csv');
  for (const year of INCOME_TAX_YEARS) {
    const table = rows.filter((row) => row.income_year === year && row.component === 'resident_tax' && row.rate_percent !== '0')
      .map((row) => [Number(row.income_from) - 1, Number(row.rate_percent)]);
    assert.deepEqual(RESIDENT_SCALES[year], table, year);
    const medicare = rows.find((row) => row.income_year === year && row.component === 'medicare_levy_low_income_single');
    assert.ok(medicare, `${year} has a Medicare levy threshold row`);
    assert.deepEqual(MEDICARE_THRESHOLDS[year], [Number(medicare.income_from), Number(medicare.income_to)], year);
  }
});

test('the study loan years are the site’s repayment table rows', () => {
  const rows = csv('rates/study-loan-repayment/study-loan-repayment-thresholds.csv');
  for (const [year, table] of Object.entries(STUDY_LOAN_YEARS)) {
    const own = rows.filter((row) => row.income_year === year);
    assert.equal(Number(own.find((row) => row.basis === 'nil').repayment_income_to), table.minimum, year);
    if (table.top) {
      assert.equal(Number(own.filter((row) => row.basis === 'marginal')[0].repayment_income_to), table.top, year);
    } else {
      assert.deepEqual(own.filter((row) => row.basis === 'total')
        .map((row) => [Number(row.repayment_income_from), Number(row.rate_percent)]), table.bands, year);
    }
  }
});

test('the super guarantee rates and maximum contribution bases are the site’s rate table rows', () => {
  const rates = csv('rates/super-guarantee/super-guarantee-rates.csv');
  const bases = csv('rates/maximum-contribution-base/maximum-contribution-base.csv');
  for (const [year, { rate, cap }] of Object.entries(SUPER_GUARANTEE)) {
    const start = `${year.slice(0, 4)}-07-01`;
    const row = rates.find((r) => r.period_start <= start && (r.period_end === '' || r.period_end >= start));
    assert.equal(rate, Number(row.general_sg_rate_percent), year);
    const base = bases.find((r) => r.income_year === year);
    assert.equal(cap, Number(base.maximum_contribution_base) * (base.basis === 'quarter' ? 4 : 1), year);
  }
});

const PAY = { year: '2026-27', residency: 'resident', salary: '0', period: 'year', includesSuper: false, sacrifice: '0',
  studyLoan: false, hospitalCover: true };
const pay = (fields) => takeHomePay({ ...PAY, ...fields });
const cents = (value) => Math.round(value * 100);

test('take-home pay is the salary less the year’s tax, levy and repayment, spread evenly', () => {
  const r = pay({ year: '2025-26', salary: '123457', studyLoan: true });
  assert.equal(cents(r.net), cents(r.salary) - cents(r.tax) + cents(r.offset) - cents(r.medicare) - cents(r.studyLoan));
  assert.equal(r.studyLoan, studyLoanRepayment({ taxable: '123457', fringe: '0', losses: '0', super: '0', foreign: '0' }, '2025-26').repayment);
  assert.equal(r.monthly, Math.round(cents(r.net) / 12) / 100);
  // A package including super splits into salary and super that add back to it.
  const p = pay({ year: '2024-25', salary: '100001', includesSuper: true });
  assert.equal(cents(p.salary) + cents(p.superGuarantee), 10000100);
  assert.equal(p.superGuarantee, 10314);
  // A salary for a month, fortnight or week is 12, 26 or 52 of them.
  for (const [period, salary, year] of [['month', '6250', 75000], ['fortnight', '2884.62', 75000.12], ['week', '1442.31', 75000.12]]) {
    assert.equal(pay({ year: '2025-26', salary, period }).salary, year, period);
  }
});

test('from 2026-27 a resident’s salary has the standard deduction of up to $1,000 (ITAA 1997 s 25-130)', () => {
  const r = pay({ salary: '75000', studyLoan: true });
  assert.equal(r.deduction, 1000);
  assert.equal(r.tax, incomeTax('74000', '2026-27', 'resident').tax);
  assert.equal(r.medicare, 1480);
  assert.equal(pay({ salary: '600' }).deduction, 600);
  const pack = pay({ salary: '1000', includesSuper: true });
  assert.deepEqual([pack.salary, pack.deduction, pack.tax, pack.net], [892.86, 892.86, 0, 892.86]);
  assert.equal(pay({ salary: '150000', studyLoan: true }).studyLoan,
    studyLoanRepayment({ taxable: '149000', fringe: '0', losses: '0', super: '0', foreign: '0' }, '2026-27').repayment);
  for (const [year, residency] of [['2025-26', 'resident'], ['2026-27', 'foreign'], ['2026-27', 'working-holiday']]) {
    assert.equal(pay({ year, residency, salary: '75000' }).deduction, 0, `${year} ${residency}`);
  }
  // The deduction applies to the salary left after the sacrifice.
  assert.equal(pay({ salary: '1500', sacrifice: '800' }).deduction, 700);
});

// ATO: 'Salary sacrificing super' (last updated 21 April 2026), read 18 November 2026: the amount
// sacrificed is not assessable, counts in reportable super contributions and does not reduce the
// super guarantee. The ATO's salary packaging example of Sam (2025-26) gives the tax and Medicare levy
// on his salary less the amounts sacrificed: $5,082.10 and $952.94 on $47,647, $9,044.50 and $1,217.10
// on $60,855.
test('salary sacrificed to super comes off taxable income but counts for the surcharge and study loan', () => {
  for (const [taxable, tax, medicare] of [['47647', 5082.1, 952.94], ['60855', 9044.5, 1217.1]]) {
    const r = incomeTax(taxable, '2025-26', 'resident');
    assert.deepEqual([r.tax, r.medicare], [tax, medicare], taxable);
    const sacrificed = pay({ year: '2025-26', salary: '65000', sacrifice: String(65000 - Number(taxable)) });
    assert.deepEqual([sacrificed.taxable, sacrificed.tax, sacrificed.medicare], [Number(taxable), tax, medicare], taxable);
    assert.equal(sacrificed.superGuarantee, 7800, 'super guarantee on the salary before the sacrifice');
  }
  // $100,000 less $5,000 sacrificed and the $1,000 deduction is $94,000 of taxable income; with the
  // sacrifice, income for surcharge purposes and repayment income are $99,000.
  const r = pay({ salary: '100000', sacrifice: '5000', studyLoan: true, hospitalCover: false });
  assert.equal(r.taxable, 94000);
  assert.equal(r.surcharge, 0, '$99,000 is not above the $105,000 threshold');
  assert.equal(r.studyLoan, studyLoanRepayment({ taxable: '94000', fringe: '0', losses: '0', super: '5000', foreign: '0' },
    '2026-27').repayment);
  const above = pay({ salary: '110000', sacrifice: '4000', hospitalCover: false });
  assert.equal(above.surcharge, 1050, '1% of $105,000 taxable, as $109,000 of income for surcharge purposes is above $105,000');
});

test('concessional contributions above the cap and Division 293 are named, not worked', () => {
  // ATO: 'Division 293 tax on concessional contributions by high-income earners', example of Jan: $240,000
  // of income and $15,000 of contributions make $5,000 of taxable contributions.
  assert.equal(division293(24000000, 1500000), 500000);
  assert.equal(division293(26000000, 1500000), 1500000);
  assert.equal(division293(23500000, 1500000), 0);
  for (const [year, cap] of Object.entries(CONCESSIONAL_CAP)) {
    const r = pay({ year, salary: '200000', sacrifice: String(cap - 2000 * SUPER_GUARANTEE[year].rate + 1) });
    assert.equal(r.overCap, 1, year);
  }
  const under = pay({ salary: '100000', sacrifice: '20500' });
  assert.deepEqual([under.concessional, under.overCap, under.division293], [32500, 0, 0]);
});

// Schedule 1 (published 17 June 2026, read 18 November 2026): all 288 scale 2 and 3 amounts in the ATO's
// withholding amounts sample data. Schedule 8's examples: $2,608.36 a week gives a $193 component and
// $4,409.75 a fortnight $260.
test('PAYG withholding for 2026-27 matches the ATO’s sample data and Schedule 8 examples', () => {
  const sample = JSON.parse(readFileSync(new URL('./payg-withholding-sample.json', import.meta.url), 'utf8'));
  let checked = 0;
  for (const period of ['week', 'fortnight', 'month']) {
    for (const [earnings, scale2, scale3] of sample[period]) {
      const amount = Math.round(Number(earnings) * 100);
      assert.equal(withholding(amount, period, 2, false, '2026-27').tax, scale2, `${period} ${earnings} scale 2`);
      assert.equal(withholding(amount, period, 3, false, '2026-27').tax, scale3, `${period} ${earnings} scale 3`);
      checked += 2;
    }
  }
  assert.equal(checked, 288);
  assert.deepEqual(withholding(260836, 'week', 2, true, '2026-27').studyLoan, 193);
  assert.deepEqual(withholding(440975, 'fortnight', 2, true, '2026-27').studyLoan, 260);
  assert.equal(withholding(260836, 'week', 2, false, '2026-27').studyLoan, 0);
});

// The withholding schedules instruments as made (read 19 November 2026): all 288 scale 2 and 3 amounts in
// each one's sample data, from the 2021 instrument for 2021-22 to 2023-24 (the 2022 and 2023 instruments
// print the same) and the 2024 one for 2024-25 and 2025-26 (as both 2025 instruments do), and each
// instrument's Schedule 8 examples for the tax-free threshold claimed.
test('PAYG withholding for 2021-22 to 2025-26 matches each instrument’s sample data and Schedule 8 examples', () => {
  let checked = 0;
  for (const file of ['./payg-withholding-sample-2020.json', './payg-withholding-sample-2024.json']) {
    const sample = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
    for (const year of sample.years) {
      for (const period of ['week', 'fortnight', 'month']) {
        for (const [earnings, scale2, scale3] of sample[period]) {
          const amount = Math.round(Number(earnings) * 100);
          assert.equal(withholding(amount, period, 2, false, year).tax, scale2, `${year} ${period} ${earnings} scale 2`);
          assert.equal(withholding(amount, period, 3, false, year).tax, scale3, `${year} ${period} ${earnings} scale 3`);
          checked += 2;
        }
      }
    }
  }
  assert.equal(checked, 288 * 5);
  // Above the samples' top: $5,000 a week, x = 5,000.99. Scale 2 is 0.47x − 563.5196 (2020) or − 650.6154 (2024);
  // scale 3 is 0.45x − 380.7692 or − 474.0385.
  const top = (year) => [2, 3].map((scale) => withholding(500000, 'week', scale, false, year).tax);
  assert.deepEqual([top('2021-22'), top('2024-25')], [[1787, 1870], [1700, 1776]]);
  const component =(year, earnings, period) => withholding(earnings, period, 2, true, year).studyLoan;
  assert.deepEqual(['2021-22', '2022-23', '2023-24'].map((year) => [component(year, 109584, 'week'),
    component(year, 235578, 'fortnight'), component(year, 548845, 'month')]), [[22, 70, 191], [22, 58, 165], [11, 48, 139]]);
  assert.deepEqual([component('2024-25', 109584, 'week'), component('2024-25', 245578, 'fortnight'),
    component('2024-25', 568845, 'month')], [11, 50, 143]);
  // 2025-26: the marginal Schedule 8 from 24 September 2025 ($2,608.36 a week, $202; $4,409.75 a fortnight,
  // $274) and the percentage one before it ($1,095.84 a week, $11; $2,455.78 a fortnight, $24; $5,688.45 a
  // month, $113).
  assert.deepEqual([component('2025-26', 260836, 'week'), component('2025-26', 440975, 'fortnight')], [202, 274]);
  const earlier = (earnings, period) => withholding(earnings, period, 2, true, '2025-26').earlierStudyLoan;
  assert.deepEqual([earlier(109584, 'week'), earlier(245578, 'fortnight'), earlier(568845, 'month')], [11, 24, 113]);
  assert.equal(withholding(109584, 'week', 2, false, '2025-26').earlierStudyLoan, 0);
  assert.equal(withholding(109584, 'week', 2, true, '2024-25').earlierStudyLoan, null);
  // Each band starts at its first dollar: $903.99 a week is nil in 2021-22 and $904.00 is 1%, $9.
  assert.deepEqual([component('2021-22', 90399, 'week'), component('2021-22', 90400, 'week')], [0, 9]);
  // Each year has its own thresholds: $950 a week is 1% ($10) in 2022-23 but below 2023-24's $991.
  assert.deepEqual([component('2022-23', 95000, 'week'), component('2023-24', 95000, 'week')], [10, 0]);
  // The 2023 instrument's 3.5% band is printed as ending at $1,44.99; $1,444.99 is 3.5% and $1,445 is 4%.
  assert.deepEqual([component('2023-24', 144499, 'week'), component('2023-24', 144500, 'week')], [51, 58]);
  assert.throws(() => withholding(100000, 'week', 2, false, '2020-21'), /from 2021-22 to 2026-27/);
});

test('take-home pay works withholding for every year’s pays on scale 2 or 3', () => {
  const r = pay({ salary: '3000', period: 'fortnight', sacrifice: '200', studyLoan: true });
  assert.deepEqual(r.withheld, { tax: 534, studyLoan: 20, total: 554, earlierStudyLoan: null, earnings: 2800,
    afterWithholding: 2246, year: 14404, refund: -212.8 });
  assert.equal(cents(r.withheld.refund), r.withheld.year * 100 - (cents(r.tax) - cents(r.offset) + cents(r.medicare)
    + cents(r.surcharge) + cents(r.studyLoan)));
  assert.equal(pay({ salary: '78000', period: 'year' }).withheld, null);
  assert.equal(pay({ residency: 'working-holiday', salary: '3000', period: 'fortnight' }).withheld, null);
  assert.equal(pay({ residency: 'foreign', salary: '1500', period: 'week' }).withheld.tax,
    withholding(150000, 'week', 3, false, '2026-27').tax);
  // 2021-22, $3,000 a fortnight: x = 1,500.99, 0.3450x − 182.7504 = 335.09, so $670 a pay and $17,420 a year.
  // The year's tax is $15,817 less the $1,500 low and middle income tax offset, which withholding leaves to
  // the return, plus $1,560 Medicare levy: $15,877, so $1,543 comes back.
  const early = pay({ year: '2021-22', salary: '3000', period: 'fortnight' });
  assert.deepEqual(early.withheld, { tax: 670, studyLoan: 0, total: 670, earlierStudyLoan: null, earnings: 3000,
    afterWithholding: 2330, year: 17420, refund: 1543 });
  // 2025-26 with a loan: 0.32x − 176.5769 = 303.74, $608 a pay; Schedule 8 from 24 September 2025,
  // 0.15x − 193.2692 = 31.88, $64; before it 3.5% of x, 52.53, $106. A year of $672 pays is $17,472 against
  // $14,188 tax, $1,560 levy and a $1,650 repayment: $74 back.
  const late = pay({ year: '2025-26', salary: '3000', period: 'fortnight', studyLoan: true });
  assert.deepEqual(late.withheld, { tax: 608, studyLoan: 64, total: 672, earlierStudyLoan: 106, earnings: 3000,
    afterWithholding: 2328, year: 17472, refund: 74 });
  assert.equal(pay({ year: '2025-26', salary: '3000', period: 'fortnight' }).withheld.earlierStudyLoan, 0);
});

// Medicare Levy Act 1986 ss 8B to 8D, Private Health Insurance Act 2007 ss 22-30 to 22-45 and the ATO's
// 'Medicare levy surcharge income, thresholds and rates' (last updated 22 June 2026), read 18 November 2026,
// with its example of Tom: $90,000 taxable income and $27,000 of reportable fringe benefits, $1,170.
test('the Medicare levy surcharge follows the tiers, family thresholds and days without cover', () => {
  const mls = (fields) => medicareLevySurcharge({ year: '2026-27', taxable: 0, fringe: 0, super: 0, losses: 0, spouse: null,
    children: 0, uncoveredDays: 365, ...fields });
  assert.equal(mls({ taxable: 90000, fringe: 27000 }).surcharge, 1170);
  for (const [taxable, rate] of [[105000, 0], [105001, 1], [123000, 1], [123001, 1.25], [164000, 1.25], [164001, 1.5]]) {
    assert.equal(mls({ taxable }).rate, rate, String(taxable));
  }
  assert.equal(mls({ taxable: 100000, spouse: 110000, children: 0 }).threshold, 210000);
  assert.equal(mls({ taxable: 100000, spouse: 110000, children: 0 }).surcharge, 0);
  assert.equal(mls({ taxable: 100000, spouse: 110001, children: 0 }).surcharge, 1000);
  assert.equal(mls({ taxable: 100000, children: 1 }).threshold, 210000);
  assert.equal(mls({ taxable: 100000, children: 4 }).threshold, 214500);
  assert.equal(mls({ taxable: 28012, spouse: 300000 }).surcharge, 420.18);
  assert.equal(mls({ taxable: 28011, spouse: 300000 }).surcharge, 0);
  // Section 8D(3)(c) for each year: nil at the year's threshold amount, 1.5% of a dollar more, with the couple above tier 3.
  for (const [year, amount, surcharge] of [['2026-27', 28011, 420.18], ['2025-26', 28011, 420.18], ['2024-25', 27222, 408.35],
    ['2023-24', 26000, 390.02], ['2022-23', 24276, 364.16], ['2021-22', 23365, 350.49], ['2020-21', 23226, 348.41]]) {
    const couple = (taxable) => mls({ year, taxable, spouse: 400000, uncoveredDays: daysInYear(year) }).surcharge;
    assert.equal(couple(amount), 0, year);
    assert.equal(couple(amount + 1), surcharge, year);
  }
  assert.equal(mls({ taxable: 120000, uncoveredDays: 0 }).surcharge, 0);
  assert.deepEqual(INCOME_TAX_YEARS.map(daysInYear), [365, 365, 365, 366, 365, 365, 365]);
  assert.throws(() => mls({ taxable: 1, uncoveredDays: 366 }), { message: 'Enter the days without hospital cover as a whole number from 0 to 365.' });
  for (const [year, singles] of [['2026-27', [105000, 123000, 164000]], ['2025-26', [101000, 118000, 158000]],
    ['2024-25', [97000, 113000, 151000]], ['2023-24', [93000, 108000, 144000]], ['2022-23', [90000, 105000, 140000]],
    ['2021-22', [90000, 105000, 140000]], ['2020-21', [90000, 105000, 140000]]]) {
    assert.deepEqual(SURCHARGE_THRESHOLDS[year], singles, year);
  }
});

test('the estimate is the tax withheld less the year’s tax, levies and repayment', () => {
  const ESTIMATE = { year: '2026-27', residency: 'resident', taxable: '90000', fringe: '27000', super: '0', losses: '0',
    foreign: '0', studyLoan: false, uncoveredDays: '365', spouse: null, children: '0', withheld: '21000' };
  const r = taxEstimate(ESTIMATE);
  assert.deepEqual([r.assessed, r.withheld, r.refund], [20490, 21000, 510]);
  assert.equal(taxEstimate({ ...ESTIMATE, withheld: '20000.01' }).refund, -489.99);
  assert.equal(taxEstimate({ ...ESTIMATE, residency: 'foreign' }).surcharge, 0);
  assert.equal(taxEstimate({ ...ESTIMATE, studyLoan: true }).repaymentIncome, 117000);
  assert.throws(() => taxEstimate({ ...ESTIMATE, withheld: '1.001' }));
  assert.throws(() => taxEstimate({ ...ESTIMATE, studyLoan: 'yes' }), { message: 'Say whether you have a study or training loan.' });
});

test('the engines refuse inputs they cannot work', () => {
  assert.throws(() => incomeTax('50000', '2019-20', 'resident'), { message: 'Choose an income year from 2020-21 to 2026-27.' });
  assert.throws(() => incomeTax('50000', '2026-27', 'part-year'),
    { message: 'Choose Australian resident, foreign resident or working holiday maker.' });
  for (const value of ['', '-1', '50000.50', '1e5', '1000000001']) assert.throws(() => incomeTax(value, '2026-27', 'resident'));
  assert.throws(() => studyLoanRepayment({ taxable: '1', fringe: '0', losses: '0', super: '0', foreign: '0' }, '2019-20'),
    { message: 'Choose an income year from 2020-21 to 2026-27.' });
  assert.throws(() => studyLoanRepayment({ taxable: '1', fringe: '0', losses: '0', super: '0' }, '2026-27'));
  assert.throws(() => pay({ salary: '1', includesSuper: 'yes' }), { message: 'Say whether the salary includes super.' });
  assert.throws(() => pay({ year: '2020-21', salary: '1' }), { message: 'Choose an income year from 2021-22 to 2026-27.' });
  assert.throws(() => pay({ salary: '1', period: 'quarter' }), { message: 'Choose a year, month, fortnight or week.' });
  assert.throws(() => pay({ salary: '1000', sacrifice: '1000.01' }), { message: 'Enter salary sacrifice no more than the salary.' });
  assert.throws(() => pay({ salary: '1', hospitalCover: 'no' }),
    { message: 'Say whether you had private patient hospital cover all year.' });
});

test('the take-home page says the amounts are not the PAYG withholding schedules', () => {
  const html = readFileSync(new URL('../_includes/calculators/take-home-pay.html', import.meta.url), 'utf8');
  assert.match(html, /not the amounts an employer withholds/);
});

for (const page of Object.keys(shownCases)) {
  test(`the ${page} page opens on the result its calculation gives for the form’s inputs`, () => {
    const html = readFileSync(new URL(`../_includes/calculators/${page}.html`, import.meta.url), 'utf8');
    const example = html.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/);
    const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
    const fields = formDefaults(html);
    const result = individualResult(page, (name) => fields[name], aud);
    assert.equal(result.inputs, example[1]);
    assert.equal(result.rows.map((row) => row.join('|')).join(';'), example[2]);
    assert.equal(String(result.principal), example[3]);
    assert.equal(result.note, example[4]);
  });
}

test('a form that is not an individual tax calculator gets no result, whatever its name', () => {
  for (const kind of ['gst', 'constructor', 'toString', '__proto__']) {
    assert.equal(individualResult(kind, () => '0', String), undefined, kind);
  }
});

const BONUS = { period: 'week', residency: 'resident', studyLoan: false, method: 'A', earnings: '0', additional: '0', spread: '52',
  backPays: '0', backEarnings: '0', backEach: '0', backWithheld: '0', yearToDate: '0', paysToDate: '1', earlierAdditional: '0',
  earlierWithheld: '0' };
const bonus = (fields) => bonusWithholding({ ...BONUS, ...fields });

// Schedule 5, 'Withholding amounts examples' (published 17 June 2026), read 19 November 2026: each step of example 1.
test('Method A gives each step of the ATO’s example 1, Jarrod, with and without HELP', () => {
  const plain = bonus({ earnings: '1400', additional: '900' });
  assert.deepEqual([plain.step1, plain.step2.tax, plain.step3, plain.step4, plain.step5.tax, plain.step7.tax, plain.limit],
    [1400, 267, 17, 1417, 272, 260, 423]);
  const help = bonus({ earnings: '1400', additional: '900', studyLoan: true });
  assert.deepEqual([help.step2.studyLoan, help.step5.studyLoan, help.step7.studyLoan, help.onAdditional, help.total],
    [10, 12, 104, 364, 641]);
});

test('the 47% limit applies to the additional payment with its study loan component, cents ignored', () => {
  const r = bonus({ earnings: '4000', additional: '5200.99', studyLoan: true });
  assert.equal(r.step7.total, 2964);
  assert.equal(r.limit, 2444.46);
  assert.equal(r.onAdditional, 2444);
  assert.equal(r.total, r.step2.total + 2444);
  // Method B(i) has no limit: with nothing withheld before, the earlier pay's whole withholding is more than 47%.
  const back = bonus({ method: 'B', earnings: '4000', backPays: '1', backEarnings: '4000', backEach: '5200', backWithheld: '0' });
  assert.ok(back.methodBi.onBackPayment > 5200 * 0.47);
});

test('Method B(ii) averages this pay’s B(i) back payment into the earnings to date, as example 4 does', () => {
  const r = bonus({ method: 'B', period: 'month', studyLoan: true, earnings: '7000', backPays: '2', backEarnings: '6200',
    backEach: '800', backWithheld: '1257', additional: '8800', yearToDate: '19400', paysToDate: '3' });
  assert.equal(r.methodBii.step1, 7000);
  assert.deepEqual([r.methodBii.step7.tax, r.methodBii.step7.studyLoan], [2808, 1296]);
  assert.equal(r.total, 6492);
});

test('the bonus calculator refuses what Schedule 5 or its scales here do not cover', () => {
  assert.throws(() => bonus({ period: 'year', additional: '1' }), { message: 'Choose weekly, fortnightly or monthly pay.' });
  assert.throws(() => bonus({ residency: 'working-holiday', additional: '1' }), /tax-free threshold or a foreign resident/);
  assert.throws(() => bonus({ studyLoan: 'no', additional: '1' }), { message: 'Say whether the payee has a study or training loan.' });
  assert.throws(() => bonus({ method: 'C', additional: '1' }), { message: 'Choose Method A or Method B.' });
  assert.throws(() => bonus({}), { message: 'Enter the additional payment.' });
  assert.throws(() => bonus({ additional: '1', spread: '1' }), /between 2 and 52/);
  assert.throws(() => bonus({ period: 'month', additional: '1', spread: '13' }), /between 2 and 12/);
  assert.throws(() => bonus({ method: 'B' }), /back payment for earlier pays this year or another additional payment/);
  assert.throws(() => bonus({ method: 'B', backPays: '53' }), /between 0 and 52/);
  assert.throws(() => bonus({ method: 'B', backPays: '2' }), { message: 'Enter the back payment for each earlier pay.' });
  assert.throws(() => bonus({ method: 'B', earnings: '100', additional: '1', yearToDate: '99' }),
    { message: 'Enter normal earnings to date that include this pay.' });
  // The first failure wins: a missing payment before a bad spread, a missing B(i) amount before a bad B(ii) count.
  assert.throws(() => bonus({ spread: '1' }), { message: 'Enter the additional payment.' });
  assert.throws(() => bonus({ method: 'B', backPays: '2', additional: '1', paysToDate: '0' }),
    { message: 'Enter the back payment for each earlier pay.' });
});
