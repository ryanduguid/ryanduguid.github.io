// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The lodgment test against each year's lodgment instrument (F2021L00577, F2022L00508, F2023L00533, F2024L00550,
// F2025L00570 and F2026L00618, read 26 November 2026) and the `lodgment-required` command of
// ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { LODGMENT_YEARS, lodgmentFormInput, lodgmentRequired, lodgmentRequiredResult } from '../assets/lodgment-required.mjs';

const fixture = createRequire(import.meta.url)('./lodgment-required-engine-differential.json');
// Every runner (check_site, mutation-check and `node --test scripts/`) starts in the site's root.
const page = readFileSync('_includes/calculators/lodgment-required.html', 'utf8');
const pick = (r) => ({ period: r.period ?? r.year, lodgment_required: r.lodgment_required, required_by: r.required_by,
  exceptions_applied: r.exceptions_applied, due_date: r.due_date, instrument: r.instrument, tests: r.tests, steps: r.steps });
const code = (run) => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return 'computed';
};
const base = (year, taxable, extra = {}) => ({ residency: { status: 'whole_year' }, taxable_income: taxable, dividends_and_franking_credits: '0.00',
  under_18: null, triggers: [], study_loan: null, working_holiday_maker: null, listed_payment: null, sapto: null,
  child_support_parent: false, year, scope_confirmed: true, ...extra });
const by = (input) => lodgmentRequired(input).required_by;
/** The page's readers over the given fields and ticked boxes. */
const form = (fields, ticked = []) => [(name) => new Map(Object.entries(fields)).get(name) ?? '', (name) => ticked.includes(name)];
const FORM = { year: '2025-26', residency: 'whole_year', months: '6', 'taxable-australian-income': 'yes', 'taxable-income': '15000', dividends: '0',
  'under-18': 'no', 'under-18-income': '0', 'study-loan': 'no', 'study-loan-income': '0', whm: 'no', 'whm-other': 'no', 'whm-taxable': '15000',
  listed: 'no', 'listed-other': 'no', sapto: 'no', 'sapto-rebate': '30000', 'sapto-category': 'single', 'child-support': 'no' };

test('the page agrees with the australian-accounting command on every differential case', () => {
  assert.ok(fixture.cases.length >= 700);
  for (const c of fixture.cases) {
    let got;
    try {
      got = pick(lodgmentRequired(c.call));
    } catch (error) {
      if (!error.code) throw error;
      got = { refused: error.code };
    }
    assert.deepEqual(got, c.refused ? { refused: c.refused } : pick(c), c.source);
  }
});

test('a resident all year lodges over $18,200, each year citing its own instrument', () => {
  for (const year of LODGMENT_YEARS) {
    const cite = year < '2023-24' ? 'Table B item (1)(a)' : 'subparagraph 6(3)(a)(i)';
    assert.deepEqual(by(base(year, '18200.00')), [], year);
    assert.deepEqual(by(base(year, '18200.01')), [cite], year);
    assert.equal(lodgmentRequired(base(year, '18200.01')).due_date, `${Number(year.slice(0, 4)) + 1}-10-31`, year);
  }
});

test('a part-year resident lodges over the lesser of $18,200 and $13,464 plus $395 a month', () => {
  for (const [months, limit] of [[1, 13859], [5, 15439], [11, 17809], [12, 18200]]) {
    const part = (taxable) => base('2025-26', taxable, { residency: { status: 'part_year', months } });
    assert.deepEqual(by(part(`${limit}.00`)), [], String(months));
    assert.deepEqual(by(part(`${limit}.01`)), ['subparagraph 6(3)(a)(ii)'], String(months));
    assert.equal(lodgmentRequired(part('0')).tests.part_year_limit, String(limit));
  }
});

test('the exceptions follow each year: the listed payment limit becomes inclusive in 2025-26', () => {
  const listed = (year, taxable) => base(year, taxable, { listed_payment: { other_assessable_income: true } });
  assert.deepEqual(lodgmentRequired(listed('2024-25', '22574.99')).exceptions_applied, ['subsection 7(2)']);
  assert.equal(lodgmentRequired(listed('2024-25', '22575.00')).lodgment_required, true);
  assert.equal(lodgmentRequired(listed('2025-26', '22575.00')).lodgment_required, false);
  assert.equal(lodgmentRequired(listed('2025-26', '22575.01')).lodgment_required, true);
  // The Notices' section 4 reaches Table B only, so a listed payment leaves a minor's Table A item (9).
  const minor = (year) => ({ ...listed(year, '1000'), under_18: { income_excluding_work: '500' } });
  assert.deepEqual(by(minor('2022-23')), ['Table A item (9)']);
  assert.deepEqual(by(minor('2023-24')), []);
});

test('the refusals keep the command codes', () => {
  assert.equal(code(() => lodgmentRequired(base('2026-27', '1'))), 'lodgment_required.instrument_not_made');
  assert.equal(code(() => lodgmentRequired(base('2025-26', '1', { child_support_parent: true }))), 'lodgment_required.child_support_parent');
  assert.equal(code(() => lodgmentRequired(base('2025-26', '1', { triggers: ['lottery'] }))), 'lodgment_required.triggers_invalid');
  assert.equal(code(() => lodgmentRequired(base('2025-26', '1.001'))), 'input.amount_invalid');
  assert.equal(code(() => lodgmentRequired(base('2025-26', '1e3'))), 'input.decimal_unreadable');
  // Each code below is the one the australian-accounting 1.4.0 release binary's --refusal-json gives for the same call.
  for (const [input, expected] of [
    [base('2025-26', 'Infinity'), 'input.amount_invalid'],
    [base('2025-26', 'abc'), 'input.decimal_unreadable'],
    [base('2025-26', 15000), 'input.amount_invalid'],
    [base('2025-26', '1'.repeat(8193)), 'input.decimal_too_long'],
    [base('2025-26', '15000', { study_loan: { income: 'abc' } }), 'input.amount_invalid'],
    [base('2025-26', '15000', { residency: { status: 5 } }), 'lodgment_required.residency_invalid'],
    [[], 'input.not_object'],
    [null, 'input.not_object'],
  ]) assert.equal(code(() => lodgmentRequired(input)), expected, JSON.stringify(input)?.slice(0, 80));
});

test('the form sends each optional group and residency the command takes, and words its result', () => {
  const none = lodgmentRequiredResult(...form({ ...FORM, residency: 'none', 'taxable-income': '1000' }));
  // The release binary: a non-resident with income taxable in Australia lodges under paragraph 6(3)(b).
  assert.match(none.note, /^You must lodge for 2025-26 under paragraph 6\(3\)\(b\) of the /);
  assert.match(none.inputs, /^2025-26; not a resident; taxable income \$1,000; 0 conditions ticked$/);
  const one = lodgmentRequiredResult(...form({ ...FORM, residency: 'part_year', months: '1' }));
  assert.match(one.note, /under subparagraph 6\(3\)\(a\)\(ii\) of the /);
  assert.match(one.inputs, /; resident 1 month; /);
  const six = lodgmentRequiredResult(...form({ ...FORM, residency: 'part_year', months: '6' }));
  assert.match(six.note, /^No condition in the .+ requires a return; you may still lodge, for example to get a refund of tax withheld$/);
  assert.match(six.inputs, /; resident 6 months; /);
  const groups = { ...FORM, 'under-18': 'yes', 'under-18-income': '500', 'study-loan': 'yes', 'study-loan-income': '70000', whm: 'yes',
    'whm-other': 'yes', 'whm-taxable': '1000' };
  assert.deepEqual(lodgmentFormInput(...form({ ...groups, residency: 'none' })), {
    ...base('2025-26', '15000', { dividends_and_franking_credits: '0' }), residency: { status: 'none', taxable_australian_income: true },
    under_18: { income_excluding_work: '500' }, study_loan: { income: '70000' },
    working_holiday_maker: { other_assessable_income: true, taxable_income_excluding_remainders: '1000' } });
  for (const [name, words] of [['under-18-income', 'your income other than from work'], ['study-loan-income', 'your income for the study loan test'],
    ['whm-taxable', 'your taxable income without super or ETP remainders'], ['sapto-rebate', 'your rebate income']]) {
    assert.throws(() => lodgmentRequiredResult(...form({ ...groups, sapto: 'yes', [name]: ' ' })), new RegExp(`^Error: Enter ${words}\\.$`));
  }
  for (const typed of ['abc', '1.001']) {
    assert.throws(() => lodgmentRequiredResult(...form({ ...FORM, 'taxable-income': typed })), /^Error: Enter each amount in dollars and cents/);
  }
  assert.throws(() => lodgmentRequiredResult(...form({ ...FORM, 'child-support': 'yes' })), /separate instrument for parents; this calculator/);
  // Any other refusal keeps the command's own words.
  assert.throws(() => lodgmentRequiredResult(...form({ ...FORM, 'taxable-income': '1'.repeat(8193) })), /^Error: taxable_income: decimal input exceeds 8192 bytes$/);
});

test('the form opens on its worked example and refuses a blank amount in words', () => {
  assert.match(page, /\{% include calculator-example\.html inputs="2025-26; resident all year; taxable income \$15,000; 1 condition ticked"/);
  const r = lodgmentRequiredResult(...form(FORM, ['trigger-payg_withheld']));
  assert.equal(r.rows.at(-1).join('|'), 'Return required|Yes');
  assert.equal(r.principal, r.rows.length - 1);
  assert.match(r.note, /by 31 October 2026 if you lodge yourself$/);
  assert.equal(code(() => lodgmentRequiredResult(...form({ ...FORM, 'taxable-income': '' }))), 'input.missing_field');
  assert.throws(() => lodgmentRequiredResult(...form({ ...FORM, year: '2026-27' })), /choose an earlier year/);
  assert.throws(() => lodgmentRequiredResult(...form({ ...FORM, residency: 'part_year', months: '13' })), /whole number from 1 to 12/);
  assert.deepEqual(lodgmentFormInput(...form({ ...FORM, sapto: 'yes', listed: 'yes' })).sapto, { rebate_income: '30000', category: 'single' });
  const relieved = lodgmentRequiredResult(...form({ ...FORM, 'taxable-income': '20000', listed: 'yes' }));
  assert.match(relieved.note, /the exception in subsection 7\(2\) applies$/);
  assert.equal(relieved.rows.at(-1)[1], 'No');
});
