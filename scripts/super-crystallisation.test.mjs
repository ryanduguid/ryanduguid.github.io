// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The crystallised segment at 30 June 2007 (ITAA 1997 s 307-225, read 27 November 2026), and the `super-crystallisation` command of ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crystallisationResult, superCrystallisation } from '../assets/super-crystallisation.mjs';
import { parityTest } from './super-income-cases.mjs';

parityTest('super-crystallisation', 186, superCrystallisation, ['period', 'amounts', 'rates']);

test('the super-crystallisation command refuses an input that is not an object', () => {
  assert.throws(() => superCrystallisation(null), { code: 'input.not_object' });
});

const form = (fields) => (name) => new Map(Object.entries(fields)).get(name) ?? '';
const cr = { 'service-start': '1975-03-01', interest: '500000', undeducted: '50000', concessional: '0', invalidity: '0', cgt: '0', untaxed: 'no', 'income-stream': 'no' };

// Refusal codes from the australian-accounting command (7f3c3eb release build) for the same calls.
test('the page refuses a service start that is not a date in its own words, and passes on any other refusal', () => {
  assert.throws(() => crystallisationResult(form({ ...cr, 'service-start': '1975-02-30' })),
    { code: 'input.date_invalid', message: 'Enter the eligible service start as a date from 1900 to 2100.' });
  assert.throws(() => crystallisationResult(form({ ...cr, undeducted: '600000' })), { code: 'super_crystallisation.components_exceed_value' });
});
