// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The income tax page's net medical expenses tax offset form (australian-accounting
// net-medical-expenses-tax-offset).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { netMedicalOffset } from '../assets/net-medical-expenses.mjs';
import { individualResult } from '../assets/individual-tax-results.mjs';

/** The form's opening values; individual-tax.test.mjs checks that the page's form opens on them. */
export const NET_MEDICAL_DEFAULTS = Object.freeze({ 'nme-year': '2018-19', 'nme-expenses': '10000', 'nme-income': '90000',
  'nme-spouse': 'no', 'nme-children': '0', 'nme-spouse-income': '0' });
export const netMedicalFixture = createRequire(import.meta.url)('./net-medical-expenses-engine-differential.json');
const aud = (/** @type {number} */ value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const page = (fields = {}) => {
  const values = new Map(Object.entries({ ...NET_MEDICAL_DEFAULTS, ...fields }));
  return individualResult('net-medical-expenses', (name) => {
    assert.ok(values.has(name), `the net medical expenses form has no ${name}`);
    return values.get(name);
  }, aud);
};
const row = (result, label) => result.rows.find(([name]) => name === label)?.[1];

test('the net medical expenses form opens on the command’s 2018-19 vector', () => {
  const r = page();
  assert.equal(row(r, 'Net medical expenses tax offset'), '$1,524.60');
  assert.equal(r.rows[r.principal][0], 'Net medical expenses tax offset');
  assert.equal(row(r, 'Threshold, singles'), '$90,000');
  assert.equal(row(r, 'Lower phase-in limit'), '$2,377');
  assert.equal(r.inputs, '2018-19, net medical expenses $10,000.00, adjusted taxable income $90,000.00, no spouse on 30 June '
    + 'and no dependent children');
  assert.match(r.note, /^Income at or below the threshold: 20% of the net medical expenses over the lower phase-in limit/);
});

test('the net medical expenses form tests a spouse’s income with its own and raises the threshold for children', () => {
  const married = page({ 'nme-income': '100000', 'nme-spouse': 'yes', 'nme-spouse-income': '80001' });
  assert.equal(row(married, 'Income tested, yours and your spouse’s'), '$180,001.00');
  assert.equal(row(married, 'Threshold, family'), '$180,000');
  assert.equal(row(married, 'Higher phase-in limit'), '$5,609');
  assert.equal(row(married, 'Net medical expenses tax offset'), '$439.10');
  assert.match(married.inputs, /a spouse on 30 June with adjusted taxable income of \$80,001\.00 and no dependent children$/);
  // A spouse's income is not read unless there was a spouse.
  assert.equal(row(page({ 'nme-spouse-income': '80001' }), 'Net medical expenses tax offset'), '$1,524.60');
  const children = page({ 'nme-income': '183000', 'nme-children': '3' });
  assert.equal(row(children, 'Threshold, family'), '$183,000');
  assert.equal(row(children, 'Net medical expenses tax offset'), '$1,524.60');
  assert.match(page({ 'nme-children': '1' }).inputs, /and 1 dependent child$/);
});

test('the net medical expenses offset ended after 2018-19 (ITAA 1936 s 159P(1A))', () => {
  for (const year of ['2019-20', '2025-26']) {
    assert.throws(() => netMedicalOffset({ year, net_medical_expenses: '10000', adjusted_taxable_income: '90000' }),
      (error) => error.code === 'period.unsupported' && error.message.includes('159P(1A)'), year);
  }
  assert.throws(() => netMedicalOffset({ year: '2015-16', net_medical_expenses: '1', adjusted_taxable_income: '1' }),
    (error) => error.code === 'period.unsupported' && !error.message.includes('159P(1A)'));
});

test('the net medical expenses form reads amounts as the command does', () => {
  for (const [amount, code] of [['-1', 'amount'], ['1.001', 'amount'], ['1.000', 'amount'], ['NaN', 'amount'],
    ['1000000000000.01', 'amount'], ['10,000', 'decimal'], ['$10000', 'decimal'], ['1e4', 'decimal'], ['', 'decimal'], ['+5', 'decimal'],
    ['1.2.3', 'decimal'], ['5.', 'decimal'], ['.5', 'decimal']]) {
    assert.throws(() => netMedicalOffset({ year: '2018-19', net_medical_expenses: amount, adjusted_taxable_income: '90000' }),
      (error) => error.code === (code === 'amount' ? 'input.amount_invalid' : 'input.decimal_unreadable'), amount);
  }
  assert.equal(netMedicalOffset({ year: '2018-19', net_medical_expenses: '-0', adjusted_taxable_income: '90000' }).offset, 0);
  assert.equal(netMedicalOffset({ year: '2018-19', net_medical_expenses: ' 10000.5 ', adjusted_taxable_income: '1000000000000' }).offset, 439.15);
});

test('the net medical expenses offset agrees with the australian-accounting command on every differential case', () => {
  const { cases } = netMedicalFixture;
  assert.ok(cases.length > 400);
  assert.ok(cases.filter((c) => c.refused).length >= 10);
  for (const { source, call, amounts, refused } of cases) {
    if (refused) {
      assert.throws(() => netMedicalOffset(call), (error) => error.code === refused, source);
      continue;
    }
    const r = netMedicalOffset(call);
    assert.deepEqual({ income_tested: r.tested.toFixed(2), net_medical_expenses: r.net.toFixed(2), excess: r.excess.toFixed(2),
      net_medical_expenses_tax_offset: r.offset.toFixed(2), thresholds: r.family ? 'family' : 'singles',
      higher_limit_applies: r.higherApplies },
    // The command keeps the sign of an amount entered as -0, which is zero.
    Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, v === '-0.00' ? '0.00' : v])), source);
  }
});
