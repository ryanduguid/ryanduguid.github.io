// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The sole trader page's non-commercial losses form (australian-accounting non-commercial-losses).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { nonCommercialLosses } from '../assets/non-commercial-losses.mjs';

export const nonCommercialFixture = createRequire(import.meta.url)('./non-commercial-losses-engine-differential.json');
const row = (result, label) => result.rows.find(([name]) => name === label)?.[1];
const call = (extra = {}) => ({ year: '2025-26', activity: 'other', assessable_income: '9000', deductions: '10000',
  brought_forward: '0', part_year: false, earlier_years: [null, null, null, null], real_property_value: '0', other_assets_value: '0',
  taxable_income: '50000', business_losses: '1000', assessable_fhss_released_amount: '0', reportable_fringe_benefits: '0',
  reportable_super_contributions: '0', total_net_investment_loss: '0', net_exempt_income: '0', ...extra });

/** The tests that work the page's form; individual-tax.test.mjs runs them with its form reader.
 * @param {(fields?: object) => any} page */
export const nonCommercialFormTests = (page) => {
  test('the non-commercial losses form opens on a $1,000 loss that no test saves, so it is deferred', () => {
    const r = page();
    assert.equal(r.rows[r.principal][0], 'Deferred');
    assert.equal(row(r, 'Deferred'), '$1,000.00');
    assert.equal(row(r, 'Deductible this year'), '$0.00');
    assert.equal(row(r, 'Income requirement total'), '$51,000.00: Met');
    assert.equal(row(r, 'Profits test'), 'Not met: 0 of 5 years');
    assert.match(r.note, /^The loss is deferred to the next year the activity is carried on/);
    assert.equal(r.inputs, '2025-26, other activity, assessable income $9,000.00, deductions $10,000.00');
  });

  test('the non-commercial losses form passes the tests the ATO’s examples pass', () => {
    // Slaide: a part year with a full-year estimate of $22,000.
    const part = page({ 'ncl-part-year': 'yes', 'ncl-income': '8000', 'ncl-estimate': '22000' });
    assert.equal(row(part, 'Assessable income test'), 'Met');
    assert.equal(row(part, 'Deductible this year'), '$2,000.00');
    assert.match(part.inputs, /, started or stopped in the year$/);
    // Nguyen: 3 profit years of 5 with 3 earlier ones.
    const profits = page({ 'ncl-profit-years': '3' });
    assert.equal(row(profits, 'Profits test'), 'Met: 3 of 5 years');
    assert.equal(row(profits, 'Deductible this year'), '$1,000.00');
    // Michael: $5,000 over, $3,000 of net exempt income.
    const exempt = page({ 'ncl-income': '15000', 'ncl-deductions': '20000', 'ncl-exempt': '3000' });
    assert.equal(row(exempt, 'Deferred'), '$2,000.00');
    // A primary producer with under $40,000 of other income is excepted.
    const farm = page({ 'ncl-activity': 'primary_production', 'ncl-other-income': '39999.99' });
    assert.equal(row(farm, 'Deductible this year'), '$1,000.00');
    assert.match(farm.note, /exception applies \(section 35-10\(4\)\)/);
    // The income requirement: a taxable loss counts as nil after the business losses are added back.
    const rich = page({ 'ncl-taxable': '249000', 'ncl-other-assets': '100000' });
    assert.equal(row(rich, 'Income requirement total'), '$250,000.00: Not met');
    assert.equal(row(rich, 'Deferred'), '$1,000.00');
    assert.equal(row(page({ 'ncl-taxable': '-30000' }), 'Income requirement total'), '$0.00: Met');
  });
};

test('the non-commercial losses calculation refuses what the command refuses', () => {
  for (const [extra, code] of [[{ year: '2019-20' }, 'period.unsupported'], [{ activity: 'rental' }, 'non_commercial_losses.activity_invalid'],
    [{ part_year: true }, 'input.missing_field'], [{ other_income: '1' }, 'input.field_unknown'],
    [{ earlier_years: [null, null, null] }, 'non_commercial_losses.earlier_years_invalid'],
    [{ taxable_income: '-1000000000000.01' }, 'input.signed_amount_invalid'], [{ deductions: 'x' }, 'input.decimal_unreadable'],
    [{ earlier_years: [{ assessable_income: '1.001', deductions: '0' }, null, null, null] }, 'input.amount_invalid']]) {
    assert.throws(() => nonCommercialLosses(call(extra)), (error) => error.code === code, JSON.stringify(extra));
  }
});

test('the non-commercial losses calculation agrees with the australian-accounting command on every differential case', () => {
  const { cases } = nonCommercialFixture;
  assert.ok(cases.length > 450);
  assert.ok(cases.filter((c) => c.refused).length >= 100);
  const f2 = (/** @type {number} */ n) => (n / 100).toFixed(2);
  for (const { source, call: input, amounts, refused } of cases) {
    if (refused) {
      assert.throws(() => nonCommercialLosses(input), (error) => error.code === refused, source);
      continue;
    }
    // A case the command accepts must not be refused here.
    let m = /** @type {any} */ (null);
    assert.doesNotThrow(() => { m = nonCommercialLosses(input); }, source);
    assert.deepEqual({ income_requirement_taxable_income: f2(m.requirementIncome), income_requirement_total: f2(m.requirementTotal),
      excess: f2(m.excess), deferred: f2(m.deferred), deductible_this_year: f2(m.deductible),
      ...(m.partYear ? { assessable_income_measured: f2(m.measured) } : {}), requirement_met: m.requirementMet, tests: m.tests,
      profit_years: m.profitYears, exception: m.exception, rule_applies: m.ruleApplies, outcome: m.outcome },
    // The command keeps the sign of an amount entered as -0, which is zero.
    JSON.parse(JSON.stringify(amounts).replaceAll('"-0.00"', '"0.00"')), source);
  }
});
