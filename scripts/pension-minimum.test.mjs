// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The pension minimum page against the ATO's 'Income stream (pension) rules and payments' (last updated
// 30 April 2026, read 24 November 2026), SISR Schedule 7, and the `pension-minimum` command of
// ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { PENSION_MINIMUM_YEARS, pensionMinimum, pensionMinimumFormInput, pensionMinimumResult } from '../assets/pension-minimum.mjs';

const fixture = createRequire(import.meta.url)('./pension-minimum-engine-differential.json');
// Every runner (check_site, mutation-check and `node --test scripts/`) starts in the site's root.
const page = readFileSync('_includes/calculators/pension-minimum.html', 'utf8');
const aud = (v) => v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const code = (run) => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return 'computed';
};
/** A form's value reader over the given fields. */
const ask = (fields) => (name) => new Map(Object.entries(fields)).get(name) ?? '';
const minimum = (year, balance, age, days) => pensionMinimum({ account_balance: balance, age, days, year, scope_confirmed: true }).amounts;

test('the page agrees with the australian-accounting command on every differential case', () => {
  for (const c of fixture.cases) {
    let got;
    try {
      const r = pensionMinimum(c.call);
      got = { amounts: r.amounts, rates: r.rates };
    } catch (error) {
      if (!error.code) throw error;
      got = { refused: error.code };
    }
    assert.deepEqual(got, c.refused ? { refused: c.refused } : { amounts: c.amounts, rates: c.rates }, c.source);
  }
  assert.equal(fixture.cases.length, 1194);
  assert.ok(page.includes('agrees with the command on 1,194 test cases'));
});

test('the factors, the first year, the last 30 days and rounding to $10', () => {
  // Each band's factor on $100,000 held all year (2023-24 onwards).
  assert.deepEqual([64, 65, 74, 75, 80, 85, 90, 95].map((age) => minimum('2025-26', '100000', age, 365).minimum_payment),
    ['4000.00', '5000.00', '5000.00', '6000.00', '7000.00', '9000.00', '11000.00', '14000.00']);
  // The ATO's Thavi: $250,000 at 66 from 1 January, 181 days; at 2024-25's 5%, $6,198.63 paid as $6,200.
  assert.deepEqual(minimum('2024-25', '250000', 66, 181), { account_balance_used: '250000.00', minimum_before_rounding: '6198.63', minimum_payment: '6200.00' });
  assert.equal(minimum('2025-26', '250000', 66, 30).minimum_payment, '0.00');
  assert.equal(minimum('2025-26', '250000', 66, 31).minimum_payment, '1060.00');
  assert.deepEqual([minimum('2025-26', '100125', 60, 365).minimum_payment, minimum('2025-26', '100124.99', 60, 365).minimum_payment], ['4010.00', '4000.00']);
  assert.equal(minimum('2027-28', '300000', 80, 366).minimum_payment, '21000.00');
  assert.equal(code(() => minimum('2026-27', '300000', 80, 366)), 'input.day_count_invalid');
  assert.equal(code(() => minimum('2026-27', '1e3', 80, 365)), 'input.decimal_unreadable');
  assert.equal(code(() => minimum('2026-27', 'Infinity', 80, 365)), 'input.amount_invalid');
  assert.equal(code(() => minimum('2026-27', '1000', '80', 365)), 'input.age_invalid');
});

test('the form counts the days from the start day to 30 June', () => {
  const input = (fields) => pensionMinimumFormInput(ask({ year: '2027-28', balance: '1000', age: '70', ...fields }));
  assert.equal(input({ started: '' }).days, 366);
  assert.equal(input({ started: '2028-01-01' }).days, 182);
  assert.equal(input({ started: '2028-06-30' }).days, 1);
  assert.equal(input({ started: '2027-06-30' }).days, 367);
  assert.equal(input({ age: '' }).age, '');
  const years = [...page.match(/<select name="year"[^>]*>(.*?)<\/select>/s)[1].matchAll(/value="([^"]+)"/g)].map(([, y]) => y);
  assert.deepEqual(years, [...PENSION_MINIMUM_YEARS].reverse());
  const shown = pensionMinimumResult(ask({ year: '2024-25', balance: '250000', age: '66', started: '2025-01-01' }), aud);
  assert.deepEqual(shown.rows[shown.principal], ['Minimum annual payment, to the nearest $10', '$6,200.00']);
  assert.deepEqual(shown.rows[2], ['Days counted', '181 of 365']);
  assert.match(shown.note, /^Pro-rated from the start day, 1 January 2025/);
  const late = ask({ year: '2025-26', balance: '1000', age: '70', started: '2026-07-01' });
  assert.throws(() => pensionMinimumResult(late, aud), { code: 'input.day_count_invalid', message: 'Enter a start day from 1 July 2025 to 30 June 2026, or leave it blank.' });
});
