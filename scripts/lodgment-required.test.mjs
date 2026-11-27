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
