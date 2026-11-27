// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The defined benefit income cap (ITAA 1997 ss 303-2 to 303-4, read 27 November 2026), and the `defined-benefit-income-cap` command of ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbIncomeCapResult, definedBenefitIncomeCap } from '../assets/defined-benefit-income-cap.mjs';
import { parityTest } from './super-income-cases.mjs';

parityTest('defined-benefit-income-cap', 192, definedBenefitIncomeCap, ['period', 'amounts', 'rates']);

test('the defined-benefit-income-cap command refuses an input that is not an object', () => {
  assert.throws(() => definedBenefitIncomeCap(null), { code: 'input.not_object' });
});

const form = (fields) => (name) => new Map(Object.entries(fields)).get(name) ?? '';
const db = { year: '2025-26', 'tax-free-and-taxed': '140000', untaxed: '20000', other: '30000', 'first-day': '2025-10-01' };

// Amounts from the australian-accounting command (7f3c3eb release build) for the same calls.
test('the page shows a reduced, pro-rated cap and the general cap', () => {
  const reduced = dbIncomeCapResult(form(db));
  assert.deepEqual(reduced.rows, [['Defined benefit income cap', '$63,494.00'], ['Tax free and taxed amounts over the cap', '$76,506.00'],
    ['Assessable income: 50% of the excess', '$38,253.00'], ['Untaxed element offset after the reduction', '$0.00']]);
  assert.equal(reduced.note, 'Cap: pro-rated from the first day; the cap of $93,494.00 less your other defined benefit income; offset of $2,000.00 reduced by $9,650.60');
  assert.equal(reduced.inputs, '2025-26; tax free and taxed $140,000.00; untaxed $20,000.00; other defined benefit income $30,000.00; first day 2025-10-01');
  const general = dbIncomeCapResult(form({ ...db, other: '0', 'first-day': ' ' }));
  assert.deepEqual(general.rows[0], ['Defined benefit income cap', '$125,000.00']);
  assert.equal(general.note, 'Cap: the general transfer balance cap of $2,000,000.00 / 16; offset of $2,000.00 reduced by $3,500.00');
  assert.equal(general.inputs, '2025-26; tax free and taxed $140,000.00; untaxed $20,000.00; other defined benefit income $0.00');
});

test('the page refuses a first day that is not a date in its own words, and passes on any other refusal', () => {
  assert.throws(() => dbIncomeCapResult(form({ ...db, 'first-day': '2025-02-30' })),
    { code: 'input.date_invalid', message: 'Enter the first day as a date from 1900 to 2100.' });
  assert.throws(() => dbIncomeCapResult(form({ ...db, year: '2010-11' })), { code: 'period.unsupported' });
  assert.throws(() => dbIncomeCapResult(form({ ...db, untaxed: 'twenty' })), { code: 'input.amount_invalid', message: /^For the untaxed elements: / });
  assert.throws(() => dbIncomeCapResult(form({ ...db, untaxed: ' ' })), { code: 'input.missing_field', message: 'Enter the untaxed elements, or 0.' });
});
