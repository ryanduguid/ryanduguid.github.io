// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The income tax page's net medical expenses tax offset form (australian-accounting
// net-medical-expenses-tax-offset).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { netMedicalOffset } from '../assets/net-medical-expenses.mjs';
import { individualResult } from '../assets/individual-tax-results.mjs';

const html = readFileSync(new URL('../_includes/calculators/income-tax.html', import.meta.url), 'utf8');
const form = html.slice(html.indexOf('<form class="calculator-split" data-calculator="net-medical-expenses">'));
const defaults = Object.fromEntries([...form.matchAll(/<input\b[^>]*>/g)].map(([tag]) => tag)
  .filter((tag) => !/\btype="radio"/.test(tag) || /\bchecked\b/.test(tag))
  .map((tag) => [tag.match(/\bname="([^"]+)"/)?.[1], tag.match(/\bvalue="([^"]*)"/)?.[1] ?? '']));
const aud = (/** @type {number} */ value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const page = (fields = {}) => {
  const values = { ...defaults, ...fields };
  return individualResult('net-medical-expenses', (name) => {
    assert.ok(Object.hasOwn(values, name), `the net medical expenses form has no ${name}`);
    return values[name];
  }, aud);
};
const row = (result, label) => result.rows.find(([name]) => name === label)?.[1];

test('the net medical expenses form opens on the command’s 2018-19 vector', () => {
  const r = page();
  assert.equal(row(r, 'Net medical expenses tax offset'), '$1,524.60');
  assert.equal(r.rows[r.principal][0], 'Net medical expenses tax offset');
  assert.equal(row(r, 'Threshold, singles'), '$90,000');
  assert.equal(row(r, 'Lower phase-in limit'), '$2,377');
  assert.equal(r.inputs, '2018-19, net medical expenses $10,000.00, adjusted taxable income $90,000.00, not married on 30 June '
    + 'and no dependent children');
  assert.match(r.note, /^Income at or below the threshold: 20% of the net medical expenses over the lower phase-in limit/);
});

test('the net medical expenses form tests a spouse’s income with its own and raises the threshold for children', () => {
  const married = page({ 'nme-income': '100000', 'nme-spouse': 'yes', 'nme-spouse-income': '80001' });
  assert.equal(row(married, 'Income tested, yours and your spouse’s'), '$180,001.00');
  assert.equal(row(married, 'Threshold, family'), '$180,000');
  assert.equal(row(married, 'Higher phase-in limit'), '$5,609');
  assert.equal(row(married, 'Net medical expenses tax offset'), '$439.10');
  assert.match(married.inputs, /married on 30 June, spouse’s adjusted taxable income \$80,001\.00 and no dependent children$/);
  // A spouse's income is not read unless married.
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

test('the net medical expenses offset agrees with the australian-accounting command on every differential case', () => {
  const { cases } = JSON.parse(readFileSync(new URL('./net-medical-expenses-engine-differential.json', import.meta.url), 'utf8'));
  assert.ok(cases.length > 400);
  assert.match(html, new RegExp(`net-medical-expenses-tax-offset on ${cases.length.toLocaleString('en-AU')} cases`));
  assert.ok(cases.filter((c) => c.refused).length >= 10);
  for (const { source, call, amounts, refused } of cases) {
    if (refused) {
      assert.throws(() => netMedicalOffset(call), (error) => error.code === refused, source);
      continue;
    }
    const r = netMedicalOffset(call);
    assert.deepEqual({ income_tested: r.tested.toFixed(2), net_medical_expenses: r.net.toFixed(2), excess: r.excess.toFixed(2),
      net_medical_expenses_tax_offset: r.offset.toFixed(2), thresholds: r.family ? 'family' : 'singles',
      higher_limit_applies: r.higherApplies }, amounts, source);
  }
});
