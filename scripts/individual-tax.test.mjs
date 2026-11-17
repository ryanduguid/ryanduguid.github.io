// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { incomeTax, INCOME_TAX_YEARS, RESIDENT_SCALES, MEDICARE_THRESHOLDS } from '../assets/income-tax.mjs';
import { studyLoanRepayment, STUDY_LOAN_YEARS } from '../assets/study-loan.mjs';
import { takeHomePay, SUPER_GUARANTEE } from '../assets/take-home-pay.mjs';

const engines = { incomeTax, takeHomePay, studyLoanRepayment };
const shownCases = JSON.parse(readFileSync(new URL('../_data/individual_tax_cases.json', import.meta.url), 'utf8'));
const dollars = (value) => `$${Number(value).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (value) => `$${Number(value).toLocaleString('en-AU')}`;
const RESIDENCY = { resident: 'Australian resident', foreign: 'foreign resident', 'working-holiday': 'working holiday maker' };
const PARTS = [['taxable', 'taxable income'], ['fringe', 'fringe benefits'], ['losses', 'net investment loss'],
  ['super', 'super contributions'], ['foreign', 'exempt foreign employment income']];

// How each row's call reads on the page and how its result reads, so neither can drift from the engine.
const INPUTS = {
  incomeTax: (income, year, residency) => `${whole(income)} taxable income, ${year}, ${RESIDENCY[residency]}`,
  takeHomePay: (p) => `${p.year}, ${RESIDENCY[p.residency]}, ${whole(p.salary)} ${p.includesSuper ? 'including' : 'plus'} super`
    + `${p.studyLoan ? ', study loan' : ''}`,
  studyLoanRepayment: (parts, year) => `${year}: ${PARTS.filter(([key]) => key === 'taxable' || parts[key] !== '0')
    .map(([key, label]) => `${label} ${whole(parts[key])}`).join(', ')}`,
};
const OUTPUTS = {
  incomeTax: (r) => `Tax ${dollars(r.tax)}, offset ${dollars(r.offset)}, Medicare levy ${dollars(r.medicare)}, total ${dollars(r.total)}`,
  takeHomePay: (r) => `Take-home ${dollars(r.net)} a year, ${dollars(r.fortnightly)} a fortnight; super ${dollars(r.superGuarantee)}`,
  studyLoanRepayment: (r) => `Repayment income ${dollars(r.repaymentIncome)}, repayment ${dollars(r.repayment)}`,
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
      assert.equal(OUTPUTS[name](result), row.output);
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
  incomeTax: (f) => [f.income, f.year, f.residency],
  takeHomePay: (f) => [{ year: f.year, residency: f.residency, salary: f.salary, includesSuper: f.super === 'included',
    studyLoan: f['study-loan'] === 'yes' }],
  studyLoanRepayment: (f) => [{ taxable: f.taxable, fringe: f.fringe, losses: f.losses, super: f.super, foreign: f.foreign }, f.year],
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
  for (const year of INCOME_TAX_YEARS) {
    for (const [income, expected] of [[135000, 40500], [190000, 60850]]) assert.equal(tax(income, year, 'foreign'), expected);
    for (const [income, expected] of [[45000, 6750], [135000, 33750], [190000, 54100]]) {
      assert.equal(tax(income, year, 'working-holiday'), expected);
    }
  }
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

test('take-home pay is the salary less the year’s tax, levy and repayment, spread evenly', () => {
  const r = takeHomePay({ year: '2025-26', residency: 'resident', salary: '123457', includesSuper: false, studyLoan: true });
  const cents = (value) => Math.round(value * 100);
  assert.equal(cents(r.net), cents(r.salary) - cents(r.tax) + cents(r.offset) - cents(r.medicare) - cents(r.studyLoan));
  assert.equal(r.studyLoan, studyLoanRepayment({ taxable: '123457', fringe: '0', losses: '0', super: '0', foreign: '0' }, '2025-26').repayment);
  assert.equal(r.monthly, Math.round(cents(r.net) / 12) / 100);
  // A package including super splits into salary and super that add back to it.
  const p = takeHomePay({ year: '2024-25', residency: 'resident', salary: '100001', includesSuper: true, studyLoan: false });
  assert.equal(cents(p.salary) + cents(p.superGuarantee), 10000100);
  assert.equal(p.superGuarantee, 10314);
});

test('from 2026-27 a resident’s salary has the standard deduction of up to $1,000 (ITAA 1997 s 25-130)', () => {
  const pay = (year, residency, salary) => takeHomePay({ year, residency, salary, includesSuper: false, studyLoan: true });
  const r = pay('2026-27', 'resident', '75000');
  assert.equal(r.deduction, 1000);
  assert.equal(r.tax, incomeTax('74000', '2026-27', 'resident').tax);
  assert.equal(r.medicare, 1480);
  assert.equal(pay('2026-27', 'resident', '600').deduction, 600);
  const pack = takeHomePay({ year: '2026-27', residency: 'resident', salary: '1000', includesSuper: true, studyLoan: false });
  assert.deepEqual([pack.salary, pack.deduction, pack.tax, pack.net], [892.86, 892.86, 0, 892.86]);
  assert.equal(pay('2026-27', 'resident', '150000').studyLoan,
    studyLoanRepayment({ taxable: '149000', fringe: '0', losses: '0', super: '0', foreign: '0' }, '2026-27').repayment);
  for (const [year, residency] of [['2025-26', 'resident'], ['2026-27', 'foreign'], ['2026-27', 'working-holiday']]) {
    assert.equal(pay(year, residency, '75000').deduction, 0, `${year} ${residency}`);
  }
});

test('the engines refuse inputs they cannot work', () => {
  assert.throws(() => incomeTax('50000', '2023-24', 'resident'), { message: 'Choose an income year from 2024-25 to 2026-27.' });
  assert.throws(() => incomeTax('50000', '2026-27', 'part-year'),
    { message: 'Choose Australian resident, foreign resident or working holiday maker.' });
  for (const value of ['', '-1', '50000.50', '1e5', '1000000001']) assert.throws(() => incomeTax(value, '2026-27', 'resident'));
  assert.throws(() => studyLoanRepayment({ taxable: '1', fringe: '0', losses: '0', super: '0', foreign: '0' }, '2023-24'),
    { message: 'Choose an income year from 2024-25 to 2026-27.' });
  assert.throws(() => studyLoanRepayment({ taxable: '1', fringe: '0', losses: '0', super: '0' }, '2026-27'));
  assert.throws(() => takeHomePay({ year: '2026-27', residency: 'resident', salary: '1', includesSuper: 'yes', studyLoan: false }),
    { message: 'Say whether the salary includes super.' });
});

test('the take-home page says the amounts are not the PAYG withholding schedules', () => {
  const html = readFileSync(new URL('../_includes/calculators/take-home-pay.html', import.meta.url), 'utf8');
  assert.match(html, /not the amounts an employer withholds/);
});
