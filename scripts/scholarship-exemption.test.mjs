// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The scholarship exemption (ITAA 1997 s 51-10 item 2.1A and s 51-35, read 27 November 2026), and the `scholarship-exemption` command of ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scholarshipExemption, scholarshipResult } from '../assets/scholarship-exemption.mjs';
import { parityTest } from './super-income-cases.mjs';

parityTest('scholarship-exemption', 141, scholarshipExemption, ['period', 'payment_type', 'exempt', 'conditions_not_met']);

test('the scholarship-exemption command refuses an input that is not an object', () => {
  assert.throws(() => scholarshipExemption(null), { code: 'input.not_object' });
});

const form = (fields) => (name) => new Map(Object.entries(fields)).get(name) ?? '';

// The command (7f3c3eb release build) gives exempt false, conditions_not_met ['full_time_student'] for this call.
test('the page shows a part-time student as not exempt', () => {
  const r = scholarshipResult(form({ year: '2025-26', 'payment-type': 'scholarship', commonwealth: 'none', 'full-time': 'no', employment: 'no',
    labour: 'no', educational: 'yes', 'friendly-society': 'no' }));
  assert.deepEqual(r.rows.map((row) => row[1]), ['Not met', 'Met', 'Met', 'Met', 'No']);
  assert.equal(r.note, 'Not exempt: include it in your tax return as assessable income and tell the provider, who may need to withhold from periodic payments');
});
