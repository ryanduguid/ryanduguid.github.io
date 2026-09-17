import { test } from 'node:test';
import assert from 'node:assert/strict';

import { centsToString, exactDecimal, MoneyError, parseMoney, quarterCentsToString, toQuarterCents } from '../src/money.mjs';
import { MAX_WAGES_CENTS, toCents } from '../../../assets/levy.mjs';

test('decimal strings parse to exact cents without a float in between', () => {
  assert.equal(parseMoney('0.29', 'f'), 29);
  assert.equal(parseMoney('1.1', 'f'), 110);
  assert.equal(parseMoney('0', 'f'), 0);
  assert.equal(parseMoney('0.00', 'f'), 0);
  assert.equal(parseMoney('123456789012.99', 'f'), 12345678901299);
  assert.equal(parseMoney(`${Math.floor(MAX_WAGES_CENTS / 100)}.${String(MAX_WAGES_CENTS % 100).padStart(2, '0')}`, 'f'), MAX_WAGES_CENTS);
});

test('rejections are typed by cause', () => {
  const code = (text) => { try { parseMoney(text, 'f'); } catch (e) { assert.ok(e instanceof MoneyError); return e.code; } return 'accepted'; };
  assert.equal(code(12), 'not_a_decimal_string');
  assert.equal(code(null), 'not_a_decimal_string');
  assert.equal(code('1,000.00'), 'not_a_decimal_string');
  assert.equal(code('1e3'), 'not_a_decimal_string');
  assert.equal(code('NaN'), 'not_a_decimal_string');
  assert.equal(code('Infinity'), 'not_a_decimal_string');
  assert.equal(code(' 1.00'), 'not_a_decimal_string');
  assert.equal(code('01.00'), 'not_a_decimal_string');
  assert.equal(code('.50'), 'not_a_decimal_string');
  assert.equal(code('1.'), 'not_a_decimal_string');
  assert.equal(code('-1.00'), 'negative_amount');
  assert.equal(code('1.005'), 'unsupported_precision');
  // Within the pattern's 13 dollar digits, above the engine's exact-arithmetic bound.
  assert.equal(code('9999999999999.00'), 'amount_out_of_range');
  // Beyond the pattern itself: a shape error, reported as one.
  assert.equal(code('99999999999999.00'), 'not_a_decimal_string');
  assert.equal(code(`${Math.floor(MAX_WAGES_CENTS / 100)}.${String(MAX_WAGES_CENTS % 100 + 1).padStart(2, '0')}`), 'amount_out_of_range');
});

test('rendering is exact and terminates', () => {
  assert.equal(centsToString(0), '0.00');
  assert.equal(centsToString(5), '0.05');
  assert.equal(centsToString(19238), '192.38');
  assert.equal(quarterCentsToString(toQuarterCents(712500)), '7125.00');
  assert.equal(quarterCentsToString(toQuarterCents(75002.25)), '750.0225');
  assert.equal(quarterCentsToString(toQuarterCents(0.5)), '0.005');
  assert.equal(exactDecimal(3240243n, 400000n, { maxScale: 8 }), '8.1006075');
  assert.equal(exactDecimal(16200n, 100n), '162.00');
  assert.throws(() => exactDecimal(1n, 3n), RangeError);
  assert.throws(() => toQuarterCents(0.3), RangeError);
});

test('cents to dollars and back through the engine is exact across the accepted range', () => {
  // The one Number in the money path: the engine's bonus API takes dollars and
  // converts back with toCents(). calculate.mjs and docs/architecture.md say
  // this test checks the round trip across the range, so it does: every cent
  // count in a dense band at each end, and a stride across the middle.
  const check = (cents) => {
    if (toCents(cents / 100) !== cents) {
      throw new assert.AssertionError({ message: `round trip lost a cent at ${cents}` });
    }
  };
  for (let cents = 0; cents <= 2_000_000; cents += 1) check(cents);
  for (let cents = MAX_WAGES_CENTS - 2_000_000; cents <= MAX_WAGES_CENTS; cents += 1) check(cents);
  const stride = 1_000_003; // prime, so the samples do not line up with any power of ten
  for (let cents = 0; cents <= MAX_WAGES_CENTS; cents += stride) check(cents);
  for (const cents of [1, 99, 100, 101, 12345, 99999999, 100000000, 4503599627370496]) {
    if (cents <= MAX_WAGES_CENTS) check(cents);
  }
});
