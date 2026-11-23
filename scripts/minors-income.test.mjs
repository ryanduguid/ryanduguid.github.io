// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The income tax page's minors' income form (australian-accounting minors-income).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { minorsIncome } from '../assets/minors-income.mjs';

export const minorsFixture = createRequire(import.meta.url)('./minors-income-engine-differential.json');
const row = (result, label) => result.rows.find(([name]) => name === label)?.[1];
const call = (extra = {}) => ({ year: '2025-26', taxable_income: '1000', residency: 'resident', under_18_on_30_june: true,
  excepted_person: 'none', excepted_income: [], trust_shares: [], other_assessable_income: '1000', deductions_exclusive: '0',
  deductions_related: '0', apportionable_deductions: '0', special_income_component: false, ...extra });

/** The tests that work the page's form; individual-tax.test.mjs runs them with its form reader.
 * @param {(fields?: object) => any} page */
export const minorsFormTests = (page) => {
  test('the minors’ income form opens on the ATO’s $1,000 of unearned income for a resident in 2025-26', () => {
    const r = page();
    assert.equal(r.rows[r.principal][0], 'Basic income tax');
    assert.equal(row(r, 'Basic income tax'), '$385.44');
    assert.equal(row(r, 'Eligible taxable income'), '$1,000.00');
    assert.match(r.note, /^A prescribed person \(ITAA 1936 s 102AC\)\. 45% of eligible taxable income/);
    assert.equal(r.inputs, '2025-26, Australian resident, taxable income $1,000.00, under 18 on 30 June');
  });

  test('the minors’ income form taxes work income at ordinary rates and unearned income at the special rates', () => {
    const r = page({ 'mi-taxable': '30000', 'mi-employment': '28000', 'mi-other': '2000' });
    assert.equal(row(r, 'Tax on other taxable income'), '$1,568.00');
    assert.equal(row(r, 'Tax on eligible taxable income'), '$900.00');
    assert.equal(row(r, 'Basic income tax'), '$2,468.00');
    const foreign = page({ 'mi-residency': 'foreign_resident', 'mi-taxable': '713', 'mi-other': '713' });
    assert.equal(row(foreign, 'Basic income tax'), '$320.82');
    const trust = page({ 'mi-taxable': '4800', 'mi-other': '0', 'mi-trust': '5000', 'mi-trust-part': '3000', 'mi-exclusive': '200' });
    assert.equal(row(trust, 'Excepted assessable income'), '$2,000.00');
    assert.equal(row(trust, 'Basic income tax'), '$1,260.00');
    const gift = page({ 'mi-taxable': '1900', 'mi-other': '2000', 'mi-apportionable': '100' });
    assert.equal(row(gift, 'Apportioned deductions'), '$100.00');
    const estate = page({ 'mi-taxable': '2000', 'mi-other-ground': 'deceased_estate', 'mi-other-amount': '1000' });
    assert.equal(row(estate, 'Excepted assessable income'), '$1,000.00');
  });

  test('the minors’ income form reads the excepted person grounds’ facts only for their grounds', () => {
    const adult = page({ 'mi-under-18': 'no' });
    assert.equal(row(adult, 'Basic income tax'), '$0.00');
    assert.match(adult.note, /^Not under 18 on 30 June/);
    const working = page({ 'mi-person': 'full_time_occupation' });
    assert.equal(row(working, 'Basic income tax'), '$0.00');
    assert.match(working.note, /^An excepted person \(ITAA 1936 s 102AC\(2\)\(b\), \(6\) to \(8\)\)/);
    assert.equal(row(page({ 'mi-person': 'full_time_occupation', 'mi-ft-4': 'yes' }), 'Basic income tax'), '$385.44');
    assert.equal(row(page({ 'mi-person': 'double_orphan_pension' }), 'Basic income tax'), '$0.00');
    assert.equal(row(page({ 'mi-person': 'double_orphan_pension', 'mi-dependent': 'yes' }), 'Basic income tax'), '$385.44');
    // The other grounds' facts are not sent.
    assert.equal(row(page({ 'mi-person': 'carer_allowance', 'mi-dependent': 'yes', 'mi-ft-1': 'no' }), 'Basic income tax'), '$0.00');
    assert.throws(() => page({ 'mi-special': 'yes' }), (error) => error.code === 'minors_income.special_income_component');
    assert.throws(() => page({ 'mi-taxable': '1001' }), (error) => error.code === 'minors_income.facts_inconsistent');
  });
};

test('the minors’ income calculation refuses what the command refuses', () => {
  for (const [extra, code] of [[{ year: '2023-24' }, 'period.unsupported'], [{ taxable_income: '999.50' }, 'input.amount_not_whole_dollars'],
    [{ residency: 'working_holiday' }, 'minors_income.residency_invalid'], [{ excepted_person: 'student' }, 'minors_income.excepted_person_invalid'],
    [{ excepted_person: 'full_time_occupation' }, 'input.missing_field'], [{ dependent_on_relatives: false }, 'input.field_unknown'],
    [{ trust_shares: [{ amount: '1', division_6aa_part: '2' }] }, 'minors_income.trust_shares_invalid'],
    [{ deductions_related: 'x' }, 'input.decimal_unreadable'], [{ excepted_income: [{ ground: 'employment', amount: 'x' }] }, 'input.amount_invalid']]) {
    assert.throws(() => minorsIncome(call(extra)), (error) => error.code === code, JSON.stringify(extra));
  }
});

test('the minors’ income calculation agrees with the australian-accounting command on every differential case', () => {
  const { cases } = minorsFixture;
  assert.ok(cases.length > 800);
  assert.ok(cases.filter((c) => c.refused).length >= 100);
  const f2 = (/** @type {number} */ n) => (n / 100).toFixed(2);
  for (const { source, call: input, amounts, refused } of cases) {
    if (refused) {
      assert.throws(() => minorsIncome(input), (error) => error.code === refused, source);
      continue;
    }
    const m = minorsIncome(input);
    assert.deepEqual({ excepted_assessable_income: f2(m.exceptedTotal), eligible_assessable_income: f2(m.eligibleAssessable),
      apportioned_deductions: f2(m.apportioned), eligible_taxable_income: f2(m.eligible), other_taxable_income: f2(m.otherIncome),
      tax_on_other_income: f2(m.taxOther), tax_on_eligible_income: f2(m.taxEligible), basic_income_tax: f2(m.total),
      prescribed_person: m.prescribed, tax_rule: m.rule, phase_out_limit: String(m.phaseOutLimit) },
    // The command keeps the sign of an amount entered as -0, which is zero.
    JSON.parse(JSON.stringify(amounts).replaceAll('"-0.00"', '"0.00"')), source);
  }
});
