// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Engine paths no other suite runs, which Node's own coverage merge counted as run: a loan's
// section 26-50 flag that is not a boolean, FHSS personal deductions the estimate refuses, and
// Northern Territory long service leave on an ending other than serious misconduct.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { borrowingSchedule } from '../assets/borrowing-expenses.mjs';
import { fhssContributionEstimate } from '../assets/fhss-contributions.mjs';
import { longServiceLeave } from '../assets/long-service-leave.mjs';

test('a loan whose section 26-50 flag is not a boolean is refused as an invalid flag', () => {
  const loan = { borrowing_expenses: '1600.00', loan_start: '2020-07-03', loan_term_end: '2045-07-02', repaid_on: null,
    income_use: '1', section_26_50_applies: 'no' };
  assert.throws(() => borrowingSchedule({ year: '2024-25', loans: [loan] }),
    { code: 'input.flag_invalid', message: 'loan 1: section_26_50_applies must be a boolean.' });
});

test('the FHSS estimate refuses a malformed, repeated, unsupported or excessive personal deduction', () => {
  const contributions = [{ date: '2020-07-15', amount: '1500', kind: 'personal' }];
  const estimate = (deductions) => fhssContributionEstimate(contributions, deductions, '2024-12-01', '2024-12-15');
  const refusals = [
    [[{ financial_year: '2020-21', amount: '1', note: 'x' }], 'Each personal deduction needs a financial year and an amount.'],
    [[{ financial_year: '2016-17', amount: '1' }], 'Use a supported financial year once for each personal deduction.'],
    [[{ financial_year: '2020-21', amount: '1' }, { financial_year: '2020-21', amount: '1' }],
      'Use a supported financial year once for each personal deduction.'],
    [[{ financial_year: '2020-21', amount: '1500.01' }], 'The deduction for 2020-21 exceeds this year\'s personal contributions.'],
  ];
  for (const [deductions, message] of refusals) {
    assert.throws(() => estimate(deductions), { code: 'fhss.deductions_invalid', message }, JSON.stringify(deductions));
  }
});

test('Northern Territory leave on resignation after 16 years is 1.3 weeks for each completed year', () => {
  const ending = (reason) => longServiceLeave({ place: 'AU-NT', start: '2010-01-01', end: '2025-12-31', excluded: '0',
    taken: '0', mode: 'ends', reason, pay: '1500' });
  const resigned = ending('resign');
  assert.equal(resigned.years, 16);
  assert.equal(resigned.weeks, 20.8);
  assert.equal(resigned.value, 31200);
  assert.equal(resigned.rule, '1.3 weeks for each completed year, subsections 10(1) and (3)');
  // Serious misconduct keeps only the completed 10 and 5-year periods: 15 years, not 16.
  assert.equal(ending('misconduct').weeks, 19.5);
});
