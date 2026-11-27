// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The 40-digit half-even steps the australian-accounting commands work in.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { amountText, callFields, centsOf, dollars, exact, exactText, positiveDecimal, round40 } from '../assets/command-args.mjs';

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

// Expected values from Python's decimal module (Context(prec=40), half even; quantize half up for cents).
test('a negative quotient keeps its sign and 40 significant digits', () => {
  const third = { n: -(10n ** 40n / 3n), d: 10n ** 40n };
  assert.deepEqual(round40(-1n, 3n), third);
  assert.deepEqual(round40(1n, -3n), third);
});

test('a value of more than 40 digits rounds to 40 significant digits', () => {
  assert.deepEqual(round40(10n ** 45n + 1n, 1n), { n: 10n ** 45n, d: 1n });
  assert.deepEqual(round40(-(10n ** 45n + 6n * 10n ** 5n), 1n), { n: -(10n ** 45n + 10n ** 6n), d: 1n });
});

test('whole dollars round a negative amount down to the floor and up to the ceiling', () => {
  assert.deepEqual(dollars(exact(-5n, 2n), false), exact(-3n));
  assert.deepEqual(dollars(exact(-5n, 2n), true), exact(-2n));
  assert.deepEqual(dollars(exact(-3n), true), exact(-3n));
});

test('a negative amount rounds half away from nil to the cent and keeps its sign in the text', () => {
  assert.equal(centsOf(exact(-1005n, 1000n)), -101n);
  assert.equal(amountText(exact(-150n, 100n)), '-1.50');
  assert.equal(amountText(exact(-1n, 1000n)), '-0.00');
  assert.equal(amountText(exact(-4n, 1000n)), '-0.00');
});

test('the exact text of a negative value keeps its sign', () => {
  assert.equal(exactText(exact(-25n, 10n)), '-2.5');
  assert.equal(exactText(exact(-3n)), '-3');
  assert.equal(exactText(exact(-125n, 1000n)), '-0.125');
});

// Checked against the australian-accounting command (7f3c3eb release build, --refusal-json).
test('the call refuses its first unknown field in the order given, as the command does', () => {
  const call = (given) => () => callFields(given, 'cmd', ['a'], ['b'], ['a']);
  assert.throws(call({ a: '1', zz: 1, mm: 2 }), { code: 'input.field_unknown', message: 'zz is not an input of cmd' });
  assert.throws(call({ mm: 2, a: '1', zz: 1 }), { code: 'input.field_unknown', message: 'mm is not an input of cmd' });
});

test('a decimal field over 8192 bytes is refused as too long; a signed infinity reads as no number', () => {
  const call = (a) => () => callFields({ a }, 'cmd', ['a'], [], ['a']);
  assert.throws(call('1'.repeat(8193)), { code: 'input.decimal_too_long', message: 'a: decimal input exceeds 8192 bytes' });
  assert.equal(callFields({ a: '1'.repeat(8192) }, 'cmd', ['a'], [], ['a']).get('a'), '1'.repeat(8192));
  for (const special of ['+Infinity', '+inf', '-sNaN12']) assert.equal(call(special)().get('a'), special);
  for (const unreadable of ['+5', '.5', '5.', '1e3', '+abc']) assert.throws(call(unreadable), { code: 'input.decimal_unreadable' });
  assert.equal(positiveDecimal('+inf'), null);
});
