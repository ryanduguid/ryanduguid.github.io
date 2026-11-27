// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Edge cases of the calculator engines at the limits of their tables and arithmetic: a refinancing of
// a loan with no payment left, a contributions year beyond the interest rate table, and a GST credit
// whose 40-digit product rounds up to a power of ten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { borrowingAccounting, borrowingSchedule, gstAnnualApportionment } from '../assets/business-calculators.mjs';
import { RELEASE_YEARS, excessContributions } from '../assets/excess-contributions.mjs';

test('a same-lender refinancing of a loan whose payments have all fallen due is refused, not compared', () => {
  // Loan 1 borrows on 3 July 2020 with 24 monthly payments, the last on 3 July 2022.
  const account = (start) => {
    const loan = (over) => ({ borrowing_expenses: '1600.00', loan_start: '2020-07-03', loan_term_end: '2045-07-02', repaid_on: null,
      income_use: '1', section_26_50_applies: false, ...over });
    const input = { year: '2022-23', loans: [loan({ repaid_on: start }), loan({ borrowing_expenses: '900.00', loan_start: start, refinances: 1 })],
      accounting: [{ amount: '300000', annual_rate: '6', payments: '24', balloon_percent: '0', qualifying_asset: false },
        { amount: '290000', annual_rate: '3', payments: '300', balloon_percent: '0', qualifying_asset: false, same_lender: true, lender_fees: '900' }] };
    return borrowingAccounting(input, borrowingSchedule(input));
  };
  // A day before the last payment, that payment remains, so the 10% test has a figure to compare.
  assert.ok(Number.isFinite(account('2022-07-02')[1].test.change));
  for (const start of ['2022-07-03', '2023-03-15']) {
    assert.throws(() => account(start), { code: 'accounting.refinanced_loan_paid', message: /^loan 2: Loan 1’s last payment falls on or before this loan’s start/ });
  }
});

test('a non-concessional release for a year the base interest rates do not cover is refused', () => {
  const release = (year) => excessContributions({ question: 'non_concessional_release', year, scope_confirmed: true, excess: '1000',
    determination_date: `${year.slice(0, 4)}-09-15` }, [...RELEASE_YEARS, '2026-27', '2012-13']);
  // 2026-27 runs to 30 June 2027, past the GIC table; 2012-13 is before the proxy rate's first year.
  for (const year of ['2026-27', '2012-13']) {
    assert.throws(() => release(year), { code: 'excess_contributions.rate_unpublished', message: /the ATO’s GIC rates run to 2026-12-31/ });
  }
  assert.equal(release('2025-26').year, '2025-26');
  assert.throws(() => excessContributions({ question: 'non_concessional_release', year: '2026-27', scope_confirmed: true }), { code: 'period.unsupported' });
});

test('a GST credit whose product rounds half even up to a power of ten keeps 40 digits and gives the whole credit', () => {
  // $1.00 times 0.(40 nines)5 is 0.(40 nines)5 exactly: 41 significant digits whose last is a tie, and
  // 40 nines is odd, so it rounds up to 1.000... and carries into a 41st digit, which the rounding drops.
  const purpose = `0.${'9'.repeat(40)}5`;
  const r = gstAnnualApportionment({ small_business_entity: true, carries_on_business: true, instalment_election: false,
    annual_tax_period_election: false, election_made: true, gst_on_acquisition: '1.00', creditable_purpose: purpose, car: false,
    reduced_credit_acquisition: false, year: '2025-26', scope_confirmed: true });
  assert.deepEqual(r.amounts, { credit_without_annual_apportionment: '1.00', annual_apportionment_credit: '1.00', increasing_adjustment: '0.00' });
  // One digit short of the tie rounds down to 40 nines, still $1.00 to the cent.
  const below = gstAnnualApportionment({ small_business_entity: true, carries_on_business: true, instalment_election: false,
    annual_tax_period_election: false, election_made: false, gst_on_acquisition: '1000000000000.00', creditable_purpose: `0.${'9'.repeat(40)}4`,
    car: false, reduced_credit_acquisition: false, year: '2025-26', scope_confirmed: true });
  assert.equal(below.amounts.credit_without_annual_apportionment, '1000000000000.00');
});
