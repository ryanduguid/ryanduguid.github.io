// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// FHSS refusals and the contribution estimate's form rows, the car work expense methods and the PCG
// 2021/4 allocation result: cases the pages' opening examples and the engine suites do not reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fhss } from '../assets/fhss.mjs';
import { fhssResult } from '../assets/fhss-result.mjs';
import { workExpensesResult } from '../assets/work-expenses-result.mjs';
import { pcgAllocationResult } from '../assets/pcg-2021-4.mjs';
import { aud, formReader } from './form-fields.mjs';

const stated = { scopeConfirmed: true, mode: 'stated', determinationDate: '2025-06-20', concessional: '8500',
  nonConcessional: '5000', associatedEarnings: '850', withholdingBasis: 'unable', debtOffset: '0' };
const estimate = (contributions, extra = {}) => ({ scopeConfirmed: true, mode: 'estimate', determinationDate: '2024-12-15',
  determinationRequested: '2024-12-01', contributions, withholdingBasis: 'unable', ...extra });
const paid = (date, amount = '1500', kind = 'personal') => ({ date, amount, kind });

test('FHSS refuses a basis that is neither a determination nor an estimate', () => {
  assert.throws(() => fhss({ ...stated, mode: 'guess' }), { code: 'fhss.basis_invalid' });
});

test('FHSS refuses a determination before 1 July 2018', () => {
  assert.throws(() => fhss({ ...stated, determinationDate: '2018-06-30' }), { code: 'period.unsupported',
    message: 'Use a determination date from 1 July 2018.' });
});

test('FHSS refuses release amounts that do not fit the determination', () => {
  assert.throws(() => fhss({ ...stated, requestedAmount: '14351' }), { code: 'fhss.request_exceeds_maximum' });
  assert.throws(() => fhss({ ...stated, releaseRequestDate: '2025-06-19' }), { code: 'fhss.release_before_determination' });
  assert.throws(() => fhss({ ...stated, actualRelease: '10000' }), { code: 'fhss.actual_requires_determination' });
  assert.throws(() => fhss({ ...stated, withholdingBasis: 'actual', withholdingAmount: '14351', releaseRequestDate: '2025-07-01',
    actualRelease: '14350' }), { code: 'fhss.withholding_exceeds_release' });
  assert.throws(() => fhss({ ...stated, debtOffset: '14000' }), { code: 'fhss.debt_exceeds_net_release' });
});

test('FHSS contribution estimates refuse dates, amounts and rows it cannot count', () => {
  const refused = [
    [[paid('2020-7-15')], 'input.date_invalid'],
    [[paid('2020-07-15', '-5')], 'input.amount_invalid'],
    [[], 'fhss.contributions_invalid'],
    [[{ ...paid('2020-07-15'), note: 'x' }], 'fhss.contributions_invalid'],
    [[paid('2017-06-30')], 'fhss.contribution_out_of_period'],
    [[paid('2020-07-15', '1500', 'spouse')], 'fhss.contribution_kind_invalid'],
  ];
  for (const [contributions, code] of refused) {
    assert.throws(() => fhss(estimate(contributions)), { code }, JSON.stringify(contributions));
  }
  const elevenYears = Array.from({ length: 11 }, (_, i) => ({ financial_year: `${2013 + i}-${String(14 + i).padStart(2, '0')}`, amount: '1' }));
  assert.throws(() => fhss(estimate([paid('2020-07-15')], { deductions: elevenYears })), { code: 'fhss.deductions_invalid' });
  assert.throws(() => fhss(estimate([paid('2020-07-15')], { deductions: 'none' })), { code: 'fhss.deductions_invalid' });
  assert.throws(() => fhss(estimate([paid('2020-07-15')], { determinationRequested: '2018-06-30' })),
    { code: 'fhss.determination_requested_invalid' });
});

const fhssForm = (changes) => formReader('fhss', { scope: 'yes', 'withholding-basis': 'unable', 'debt-offset': '0', transition: '',
  mode: 'estimate', 'determination-date': '2024-12-15', 'determination-requested': '2024-12-01', deductions: '', ...changes });

test('the FHSS estimate form lists each contribution and the eligible contribution limits', () => {
  const r = fhssResult(fhssForm({ contributions: '2020-07-15, 1500, employer_voluntary\n\n2021-08-15,2000,personal\r\n' }), aud);
  const rows = new Map(r.rows);
  assert.equal(rows.get('Eligible contribution limit per year'), '$15,000.00');
  assert.equal(rows.get('Total eligible contribution limit'), '$50,000.00');
  assert.equal(rows.get('Concessional component (85%)'), '$1,275.00');
  assert.deepEqual(r.tables['fhss-contributions'].map((row) => row.slice(0, 4)), [
    ['2020-07-15 · Salary sacrifice', 'Concessional', '$1,500.00', '$1,500.00'],
    ['2021-08-15 · Personal', 'Non-concessional', '$2,000.00', '$2,000.00']]);
});

test('the FHSS estimate form refuses a line without a date, amount and kind, and an oversized list', () => {
  assert.throws(() => fhssResult(fhssForm({ contributions: '2020-07-15,1500,personal\n2020-08-15,1500' }), aud),
    { message: 'Contributions, line 2: enter date, amount, kind.' });
  assert.throws(() => fhssResult(fhssForm({ contributions: '2020-07-15,1500,personal', deductions: '2020-21,' }), aud),
    { message: 'Personal deductions, line 1: enter financial_year, amount.' });
  assert.throws(() => fhssResult(fhssForm({ contributions: 'x'.repeat(600001) }), aud), { message: 'Contributions is too long.' });
});

const work = (changes) => workExpensesResult(formReader('work-expenses', { scope: 'yes', ...changes }), aud);

test('cents per kilometre counts only the first 5,000 business kilometres', () => {
  const capped = work({ method: 'car_cents_per_kilometre', 'business-kilometres': '6000', owned: 'yes' });
  assert.equal(capped.rows[0][1], '5,000 km');
  assert.equal(capped.note, 'Only the first 5,000 business kilometres count (ITAA 1997 s 28-25(2))');
  assert.match(capped.inputs, /, 6,000 business km$/);
  const under = work({ method: 'car_cents_per_kilometre', 'business-kilometres': '4000', owned: 'yes' });
  assert.equal(under.rows[0][1], '4,000 km');
  assert.equal(under.note, undefined);
});

test('the log book method applies the business use percentage to the car expenses', () => {
  const r = work({ method: 'car_log_book', owned: 'yes', 'business-kilometres': '6000', 'total-kilometres': '20000',
    'car-expenses': '10000', 'log-book-weeks': '12', representative: 'yes' });
  assert.deepEqual(r.rows.slice(0, 2), [['Business use percentage', '30.00%'], ['Deduction', '$3,000.00']]);
  assert.equal(r.principal, 2);
  assert.match(r.inputs, /6,000 business km of 20,000 km, expenses \$10,000\.00$/);
});

test('self-education not connected to current employment is not deductible', () => {
  const r = work({ method: 'self_education', employed: 'no', 'category-a': '1000' });
  assert.match(r.note, /^Not deductible: when incurred you were not employed/);
});

const pcgHtml = readFileSync(new URL('../_includes/calculators/pcg-2021-4-allocation.html', import.meta.url), 'utf8');
const pcgYear = (name) => {
  const [, scale, baseRate, companyRate] = pcgHtml.match(new RegExp(`name="year" value="${name}" data-scale="([^"]+)" data-base-rate="([^"]+)" data-company-rate="([^"]+)"`));
  return { name, scale, baseRate, companyRate };
};
const percent = (share) => (share === null ? 'none' : `${(share * 100).toFixed(2)}%`);
const allocation = (changes) => {
  const none = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [[`kind-${i + 1}`, 'none'], [`firm-${i + 1}`, '0'],
    [`deductions-${i + 1}`, '0'], [`other-${i + 1}`, '0']]).flat());
  return pcgAllocationResult(formReader('pcg-2021-4-allocation', { ...none, ...changes }), pcgYear('2020-21'), aud, percent);
};

test('the PCG allocation scores all 3 factors against a benchmark', () => {
  const r = allocation({ factor3: 'yes', benchmark: '200000', 'firm-0': '330000', 'kind-1': 'base-rate-company', 'firm-1': '270000',
    'deductions-1': '1000', 'other-1': '500' });
  assert.match(r.inputs, /^2020-21 rates, gateways 1 and 2 passed, IPP: firm income \$330,000\.00; associate 1, company \(base rate entity\): firm income \$270,000\.00, firm-related deductions \$1,000\.00, other income less other deductions \$500\.00; remuneration against a commercial benchmark of \$200,000\.00, all 3 factors$/);
  const labels = r.rows.map(([label]) => label);
  assert.ok(labels.includes('Factor 3: IPP’s firm income as a share of the benchmark'));
  assert.equal(r.rows.at(-1)[0], 'Risk zone');
  assert.equal(r.principal, r.rows.length - 1);
  assert.equal(r.note, undefined);
});

test('an IPP returning the whole entitlement is low risk with no other factor scored', () => {
  const r = allocation({ factor3: 'no', 'firm-0': '300000' });
  assert.equal(r.rows.at(-1)[1], 'Green: low risk');
  assert.ok(!r.rows.some(([label]) => label.startsWith('Factor 2')));
  assert.match(r.inputs, /; factors 1 and 2$/);
  assert.equal(r.note, 'The IPP returns the whole entitlement, so paragraph 81 makes the arrangement low risk with no other factor scored');
});
