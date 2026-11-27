// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The HELP indexation calculator against HESA ss 137-19A, 140-5, 140-25, 140-26 and 140-30 (Compilation No. 105,
// read 27 November 2026), the ATO's indexation rates (last updated 17 April 2026) and the `help-indexation` command
// of ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { HELP_INDEXATION_YEARS, helpIndexation, helpIndexationFormInput, helpIndexationResult } from '../assets/help-indexation.mjs';

const fixture = createRequire(import.meta.url)('./help-indexation-engine-differential.json');
// Every runner (check_site, mutation-check and `node --test scripts/`) starts in the site's root.
const page = readFileSync('_includes/calculators/help-indexation.html', 'utf8');
const code = (run) => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return null;
};
const base = { location_preferred: false, scope_confirmed: true };
const debt = (year, previous, more = {}) => helpIndexation({ ...base, year, previous_accumulated_debt: previous, ...more }).amounts;
const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const ask = (fields) => (name) => new Map(Object.entries({ year: '2025-26', ...fields })).get(name) ?? '';

test('the page agrees with the australian-accounting command on every differential case', () => {
  for (const c of fixture.cases) {
    let got;
    try {
      const r = helpIndexation(c.call);
      got = { amounts: r.amounts, rates: r.rates, indexation_date: r.indexationDate };
    } catch (error) {
      if (!error.code) throw error;
      got = { refused: error.code };
    }
    const want = c.refused ? { refused: c.refused } : { amounts: c.amounts, rates: c.rates, indexation_date: c.indexation_date };
    assert.deepEqual(got, want, c.source);
  }
  assert.equal(fixture.cases.length, 671);
  assert.ok(page.includes('agrees with the command on 671 test cases'));
});

test('each year indexes by the ATO rate plus one, and cents are dropped (s 140-30)', () => {
  const factors = HELP_INDEXATION_YEARS.map((y) => helpIndexation({ ...base, year: y, previous_accumulated_debt: '0' }).rates.indexation_factor);
  assert.deepEqual(factors, ['1.028', '1.032', '1.040', '1.032', '1.039', '1.006', '1.018']);
  assert.equal(debt('2025-26', '30000').accumulated_debt, '30840.00');
  assert.equal(debt('2023-24', '1000.99').accumulated_debt, '1041.00');
  assert.equal(debt('2025-26', '0.50').accumulated_debt, '0.00');
  assert.equal(helpIndexation({ ...base, year: '2022-23', previous_accumulated_debt: '0' }).rates.superseded_factor, '1.071');
});

test('2024-25 takes 20% off before indexation (s 140-26), and s 137-19A cuts debts of 1 January to 1 June 2025', () => {
  const r = debt('2024-25', '30000', { current_debts: [{ incurred: '2024-08-31', amount: '1000' }] });
  assert.deepEqual([r.reduction, r.former_accumulated_debt, r.current_debts, r.current_reduction, r.accumulated_debt],
    ['6000.00', '24768.00', '800.00', '200.00', '25568.00']);
  assert.equal(debt('2025-26', '0', { earlier_debts: [{ incurred: '2025-06-01', amount: '1000' }] }).earlier_debts, '800.00');
  assert.equal(debt('2025-26', '0', { earlier_debts: [{ incurred: '2025-06-02', amount: '1000' }] }).earlier_debts, '1000.00');
  assert.equal(code(() => debt('2024-25', '1', { debts_already_reduced: true })), 'help_indexation.reduction_already_applied');
  assert.equal(debt('2023-24', '1', { debts_already_reduced: true }).accumulated_debt, '1.00');
});

test('each group of debts is cut to whole dollars before it is added (s 140-5(1) step 2A)', () => {
  const two = [{ incurred: '2023-03-01', amount: '100.60', group: 'A' }, { incurred: '2023-04-01', amount: '100.60', group: 'B' }];
  assert.equal(debt('2023-24', '0', { earlier_debts: two }).earlier_debts, '200.00');
  const same = two.map((d) => ({ ...d, group: 'A' }));
  assert.equal(debt('2023-24', '0', { earlier_debts: same }).earlier_debts, '201.00');
  assert.equal(code(() => debt('2023-24', '0', { earlier_debts: same.map(({ incurred, amount }) => ({ incurred, amount })) })),
    'help_indexation.entries_invalid');
});

test('a repayment before 1 June avoids its indexation; one on or after comes off the indexed debt', () => {
  const r = debt('2025-26', '10000', { proposed_repayment: '2000' });
  assert.deepEqual([r.accumulated_debt_if_paid_before_1_june, r.accumulated_debt_if_paid_on_or_after_1_june, r.saving_if_paid_before_1_june],
    ['8224.00', '8280.00', '56.00']);
  // More than the debts indexed goes on to the year's own debts (HESA s 151-10(2)).
  const over = debt('2025-26', '100', { current_debts: [{ incurred: '2025-09-01', amount: '500' }], proposed_repayment: '600' });
  assert.deepEqual([over.accumulated_debt_if_paid_before_1_june, over.accumulated_debt_if_paid_on_or_after_1_june], ['0.00', '2.00']);
});

test('the command’s refusals come in its order', () => {
  assert.equal(code(() => helpIndexation({ ...base, year: '2025-26', previous_accumulated_debt: '1', extra: 1 })), 'input.field_unknown');
  assert.equal(code(() => helpIndexation({ year: '2025-26', scope_confirmed: true })), 'input.missing_field');
  assert.equal(code(() => debt('2025-26', 'abc')), 'input.decimal_unreadable');
  assert.equal(code(() => debt('2025-26', 'x'.repeat(8193))), 'input.decimal_too_long');
  assert.equal(code(() => helpIndexation({ ...base, scope_confirmed: false, year: '2025-26', previous_accumulated_debt: '1' })), 'scope.not_confirmed');
  assert.equal(code(() => debt('2026-27', '1')), 'period.unsupported');
  assert.equal(code(() => helpIndexation({ ...base, location_preferred: true, year: '2025-26', previous_accumulated_debt: '1' })),
    'help_indexation.location_preferred');
  assert.equal(code(() => helpIndexation({ ...base, location_preferred: 'no', year: '2025-26', previous_accumulated_debt: '1' })), 'input.flag_invalid');
  assert.equal(code(() => helpIndexation({ ...base, year: '2025-26' })), 'help_indexation.debt_missing');
  for (const bad of ['1.001', '-1', 'inf', '1000000000000.01']) assert.equal(code(() => debt('2025-26', bad)), 'input.amount_invalid', bad);
  assert.equal(debt('2025-26', ' 1000000000000 ').previous_accumulated_debt, '1000000000000.00');
  assert.equal(code(() => debt('2025-26', '1', { voluntary_repayments: [{ date: '2026-06-01', amount: '1' }] })), 'help_indexation.date_outside_period');
  assert.equal(code(() => debt('2025-26', '1', { voluntary_repayments: [{ date: '2026-02-30', amount: '1' }] })), 'help_indexation.entries_invalid');
  assert.equal(code(() => debt('2025-26', '1', { voluntary_repayments: [{ date: '2026-05-01', amount: '2' }] })), 'help_indexation.repayments_exceed_debt');
  assert.equal(code(() => debt('2025-26', '1', { voluntary_repayments: [{ date: '2026-05-01' }] })), 'input.missing_field');
  assert.equal(code(() => debt('2025-26', '1', { voluntary_repayments: [{ date: '2026-05-01', amount: '1', note: '' }] })), 'input.field_unknown');
  assert.equal(code(() => debt('2025-26', '1', { voluntary_repayments: {} })), 'help_indexation.entries_invalid');
  assert.equal(code(() => debt('2025-26', '1', { voluntary_repayments: [1] })), 'help_indexation.entries_invalid');
  assert.equal(code(() => debt('2025-26', '1', { earlier_debts: [{ incurred: '2025-03-01', amount: '1', group: '' }] })), 'help_indexation.entries_invalid');
});

test('the form sends one debt in each half-year and one repayment, and skips blank rows', () => {
  assert.deepEqual(helpIndexationFormInput(ask({ previous: '' })), { ...base, year: '2025-26', previous_accumulated_debt: '0' });
  const input = helpIndexationFormInput(ask({ previous: '5000', 'earlier-amount': '900', 'earlier-date': '2025-03-31', 'current-amount': '0',
    'repaid-amount': '100', 'repaid-date': '2026-05-01', compulsory: '250', proposed: '300' }));
  assert.deepEqual(input, { ...base, year: '2025-26', previous_accumulated_debt: '5000', earlier_debts: [{ incurred: '2025-03-31', amount: '900' }],
    voluntary_repayments: [{ date: '2026-05-01', amount: '100' }], compulsory_repayments: '250', proposed_repayment: '300' });
  assert.throws(() => helpIndexationFormInput(ask({ previous: '1', 'repaid-amount': '1' })), { code: 'help_indexation.entries_invalid' });
});

test('the result shows the 20% reduction only for 2025 and the timing saving only with a proposed repayment', () => {
  const plain = helpIndexationResult(ask({ previous: '30000' }), aud);
  assert.equal(plain.rows.length, 7);
  assert.deepEqual(plain.rows[plain.principal], ['Accumulated HELP debt on 1 June 2026', '$30,840.00']);
  const cut = helpIndexationResult(ask({ year: '2024-25', previous: '30000', proposed: '1000' }), aud);
  assert.deepEqual(cut.rows[4], ['Less the 20% reduction (s 140-26)', '$6,000.00']);
  assert.deepEqual(cut.rows[5], ['Indexation at 3.2%', '$768.00']);
  assert.equal(cut.rows.length, 10);
  // For 1 June 2025 a repayment before the day is inside the 20% reduction, so paying after it leaves less.
  assert.equal(cut.note, 'Paying $1,000.00 on or after 1 June 2025 leaves $174.00 less, as a repayment before it is cut by the 20% reduction too');
  assert.equal(helpIndexationResult(ask({ previous: '10000', proposed: '2000' }), aud).note, 'Paying $2,000.00 before 1 June 2026 saves $56.00 of indexation');
  assert.equal(helpIndexationResult(ask({ previous: '0', proposed: '0' }), aud).note, 'Paying $0.00 before or on or after 1 June 2026 gives the same debt');
});

// Refusal codes from the australian-accounting command (7f3c3eb release build) for the same calls.
test('the command refuses a numeric amount or year, an entry date that is not text and an entry amount that is not a short decimal', () => {
  const call = (more) => code(() => helpIndexation({ ...base, year: '2025-26', previous_accumulated_debt: '20000.00', ...more }));
  assert.equal(call({ compulsory_repayments: 500 }), 'input.amount_invalid');
  assert.equal(call({ year: 2025 }), 'period.unsupported');
  assert.equal(call({ current_debts: [{ incurred: 20250801, amount: '1000.00' }] }), 'help_indexation.entries_invalid');
  assert.equal(call({ current_debts: [{ incurred: '2025-08-01', amount: 1000 }] }), 'input.amount_invalid');
  assert.equal(call({ current_debts: [{ incurred: '2025-08-01', amount: '1'.repeat(33) }] }), 'input.amount_invalid');
  assert.equal(call({ current_debts: [{ incurred: '2025-08-01', amount: '1000.00' }] }), null);
});
