// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The deductible amount of a foreign pension's undeducted purchase price (ITAA 1936 s 27H, read 27 November 2026), and the `foreign-pension-upp` command of ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foreignPensionUpp } from '../assets/foreign-pension-upp.mjs';
import { parityTest } from './super-income-cases.mjs';

parityTest('foreign-pension-upp', 182, foreignPensionUpp, ['period', 'amounts', 'rates']);

test('the foreign-pension-upp command refuses an input that is not an object', () => {
  assert.throws(() => foreignPensionUpp(null), { code: 'input.not_object' });
});
