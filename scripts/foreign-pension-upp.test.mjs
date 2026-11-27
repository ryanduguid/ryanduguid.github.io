// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The deductible amount of a foreign pension's undeducted purchase price (ITAA 1936 s 27H, read 27 November 2026), and the `foreign-pension-upp` command of ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foreignPensionResult, foreignPensionUpp } from '../assets/foreign-pension-upp.mjs';
import { parityTest } from './super-income-cases.mjs';

parityTest('foreign-pension-upp', 182, foreignPensionUpp, ['period', 'amounts', 'rates']);

test('the foreign-pension-upp command refuses an input that is not an object', () => {
  assert.throws(() => foreignPensionUpp(null), { code: 'input.not_object' });
});

const form = (fields) => (name) => new Map(Object.entries(fields)).get(name) ?? '';
const fp = { year: '2025-26', annuity: '20000', method: 'formula', price: '200000', residual: '0', basis: 'life_expectation_factor', years: '17.83',
  total: '', 'whole-year': 'yes', commuted: 'no', 'uk-category': 'a' };
const shown = (fields) => {
  const r = foreignPensionResult(form({ ...fp, ...fields }));
  return [r.inputs, r.rows.map((row) => row[1]).join(' '), r.note];
};

// Amounts from the australian-accounting command (7f3c3eb release build) for the same calls.
test('the page shows the UK State Pension rates, the Dutch SVB fallback and a shared annuity', () => {
  const uk = '2025-26; UK State Pension, 2025-26 instructions; received $20,000.00';
  assert.deepEqual(shown({ method: 'uk_state_pension' }), [uk, '$1,600.00 $1,600.00 $18,400.00', 'UK State Pension, 2025-26 instructions: deductible rate 8%']);
  assert.deepEqual(shown({ method: 'uk_state_pension', 'uk-category': 'c' }), [uk, '$0.00 $0.00 $20,000.00', 'UK State Pension, 2025-26 instructions: deductible rate nil']);
  assert.deepEqual(shown({ method: 'dutch_svb_fallback' }), ['2025-26; Dutch SVB pension, 2025-26 instructions; received $20,000.00',
    '$5,000.00 $5,000.00 $15,000.00', 'Dutch SVB pension, 2025-26 instructions: deductible rate 25%']);
  assert.deepEqual(shown({ total: '40000' }), ['2025-26; s 27H formula; received $20,000.00', '$5,608.52 $5,608.52 $14,391.48',
    'Relevant share 0.5 × (price less residual value) ÷ relevant number 17.83']);
});
