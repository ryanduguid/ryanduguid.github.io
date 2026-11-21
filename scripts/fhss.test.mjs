// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';
import { fhss, FHSS_ESTIMATE_NOTE } from '../assets/fhss.mjs';

const stated = {
  scopeConfirmed: true, mode: 'stated', determinationDate: '2025-06-20',
  concessional: '8500', nonConcessional: '5000', associatedEarnings: '850',
  withholdingBasis: 'unable', debtOffset: '0',
};

const contribution = (date, amount, kind = 'personal') => ({ date, amount, kind });
const monthly = (year, month, count, amount) => Array.from({ length: count }, (_, i) =>
  contribution(new Date(Date.UTC(year, month - 1 + i, 15)).toISOString().slice(0, 10), amount, 'employer_voluntary'));
const estimate = (contributions, determinationDate, determinationRequested = determinationDate) => ({
  scopeConfirmed: true, mode: 'estimate', determinationDate, determinationRequested,
  contributions, withholdingBasis: 'unable',
});

test('FHSS Jill distinguishes the published determination example from the ledger estimate', () => {
  const ledger = fhss(estimate(monthly(2020, 7, 52, '1500'), '2024-12-15', '2024-12-01'));
  assert.equal(ledger.earningsBasis, 'estimate');
  assert.equal(ledger.amounts.concessional_component, '42500.00');
  assert.equal(ledger.amounts.associated_earnings, '7859.00');
  assert.equal(ledger.amounts.maximum_release_amount, '50359.00');
  assert.equal(ledger.rows.find((row) => row.date === '2023-10-15').counted, 50000n);
  assert.match(FHSS_ESTIMATE_NOTE, /\$7,859.*\$5,190/);
  const determination = fhss({ ...stated, concessional: '42500', nonConcessional: '0', associatedEarnings: '5190' });
  assert.equal(determination.earningsBasis, 'stated');
  assert.equal(determination.amounts.associated_earnings, '5190.00');
  assert.equal(determination.amounts.maximum_release_amount, '47690.00');
});

test('FHSS GN 2024/1 examples 11 to 13, withholding and unused funds', () => {
  const sue = fhss(stated);
  assert.equal(sue.amounts.maximum_release_amount, '14350.00');
  assert.equal(sue.amounts.assessable_fhss_released_amount, '9350.00');
  assert.equal(sue.amounts.tax_withheld, '1589.00');
  assert.equal(sue.amounts.paid_to_you, '12761.00');
  assert.equal(sue.amounts.fhss_tax_offset, '2805.00');
  const alex = fhss({
    ...stated, concessional: '6800', nonConcessional: '20000', associatedEarnings: '1700',
    withholdingBasis: 'marginal', marginalPercent: '37',
  });
  assert.equal(alex.amounts.maximum_release_amount, '28500.00');
  assert.equal(alex.amounts.tax_withheld, '765.00');
  assert.equal(alex.amounts.paid_to_you, '27735.00');
  assert.equal(alex.amounts.fhss_tax_offset, '2550.00');
  const george = fhss({
    ...stated, concessional: '17000', nonConcessional: '6000', associatedEarnings: '3100',
    withholdingBasis: 'marginal', marginalPercent: '37',
  });
  assert.equal(george.amounts.paid_to_you, '24291.00');
  assert.equal(george.amounts.fhss_tax_if_not_used, '4020.00');
  assert.equal(george.amounts.recontribution_required, '18291.00');
});

test('FHSS partial actual release drives the assessable amount and a separate request drives its year', () => {
  const inputs = {
    ...stated, concessional: '8500', nonConcessional: '10000', associatedEarnings: '1500',
    requestedAmount: '15000', releaseRequestDate: '2025-07-01', actualRelease: '12000', debtOffset: '',
  };
  const actual = fhss(inputs);
  assert.equal(actual.determinationYear, '2024-25');
  assert.equal(actual.assessableYear, '2025-26');
  assert.equal(actual.releaseBasis, 'actual');
  assert.equal(actual.amounts.assessable_fhss_released_amount, '2000.00');
  assert.equal(actual.amounts.fhss_tax_offset, '600.00');
  assert.equal(actual.amounts.tax_withheld, '340.00');
  assert.equal(actual.amounts.after_withholding, '11660.00');
  assert.equal(actual.amounts.paid_to_you, null);
  assert.equal(fhss({ ...inputs, debtOffset: '1000' }).amounts.paid_to_you, '10660.00');
  assert.equal(fhss({ ...inputs, actualRelease: '9000' }).amounts.assessable_fhss_released_amount, '0.00');
  assert.equal(fhss({ ...inputs, actualRelease: '' }).releaseBasis, 'assumed');
  assert.equal(fhss({ ...inputs, withholdingBasis: 'supplied_estimate', withholdingAmount: '222.50' }).amounts.tax_withheld, '222.50');
  const unknown = fhss({ ...inputs, withholdingBasis: 'unknown' }).amounts;
  assert.equal(unknown.fhss_tax_offset, '600.00');
  assert.equal(unknown.tax_withheld, null);
  assert.equal(unknown.paid_to_you, null);
  assert.equal(unknown.recontribution_required, null);
  assert.throws(() => fhss({ ...inputs, withholdingBasis: '' }), { code: 'input.missing_field' });
  assert.throws(() => fhss({ ...inputs, actualRelease: '16000' }), { code: 'fhss.release_exceeds_request' });
});

test('FHSS uses the last SIC quarter, an inclusive leap-year endpoint and the historical cap', () => {
  const jan = [contribution('2024-01-01', '7000'), contribution('2024-01-02', '7000')];
  assert.equal(fhss(estimate(jan, '2024-01-02')).amounts.associated_earnings, '4.00');
  const ledger = monthly(2018, 7, 36, '1250');
  assert.equal(fhss(estimate(ledger, '2022-07-04', '2022-06-30')).amounts.concessional_component, '25500.00');
  assert.equal(fhss(estimate(ledger, '2022-07-04', '2022-07-01')).amounts.concessional_component, '38250.00');
  assert.ok(fhss(estimate(jan, '2026-12-31')).amounts.associated_earnings);
  assert.throws(() => fhss(estimate(jan, '2027-01-01')), { code: 'fhss.rate_unpublished' });
  assert.equal(fhss({ ...stated, determinationDate: '2027-01-01' }).amounts.associated_earnings, '850.00');
});

test('FHSS dates, scope and transitional cases refuse or withhold unsupported results', () => {
  const historical = { ...stated, determinationDate: '2024-09-14' };
  assert.equal(fhss(historical).amounts.fhss_tax_if_not_used, null);
  assert.equal(fhss(historical).transition, 'unconfirmed');
  assert.equal(fhss({ ...historical, transition: 'item30' }).amounts.recontribution_required, null);
  assert.equal(fhss({ ...historical, transition: 'item30' }).transition, 'item30');
  assert.equal(fhss({ ...historical, transition: 'ordinary' }).amounts.fhss_tax_if_not_used, '1870.00');
  assert.equal(fhss({ ...historical, determinationDate: '2024-09-15' }).amounts.fhss_tax_if_not_used, '1870.00');
  assert.throws(() => fhss({ ...stated, transition: 'item30' }), { code: 'fhss.transition_out_of_scope' });
  assert.throws(() => fhss({ ...stated, scopeConfirmed: false }), { code: 'scope.not_confirmed' });
  assert.throws(() => fhss({ ...stated, determinationDate: '2025-02-29' }), { code: 'input.date_invalid' });
  assert.throws(() => fhss({ ...stated, withholdingBasis: 'actual', withholdingAmount: '0' }), { code: 'fhss.withholding_actual_requires_release' });
});
