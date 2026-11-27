// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The 40-digit half-even steps the australian-accounting commands work in.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { round40 } from '../assets/command-args.mjs';

test('a quotient keeps 40 significant digits', () => {
  assert.deepEqual(round40(1n, 3n), { n: 10n ** 40n / 3n, d: 10n ** 40n });
  assert.deepEqual(round40(2n, 3n), { n: 6666666666666666666666666666666666666667n, d: 10n ** 40n });
});

test('a quotient of 10 or more still keeps 40 significant digits', () => {
  assert.deepEqual(round40(9n, 2n), { n: 45n * 10n ** 38n, d: 10n ** 39n });
});

test('a tie rounds to the even digit', () => {
  const tie = 10n ** 40n + 5n;
  assert.deepEqual(round40(tie, 10n ** 41n), { n: 10n ** 39n, d: 10n ** 40n });
});
