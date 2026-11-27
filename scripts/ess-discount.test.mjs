// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The employee share scheme discount calculator against ITAA 1997 Division 83A (compilation 268), the Income Tax
// Assessment (1997 Act) Regulations 2021 (compilation 16) and the `ess-discount` command of
// ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { AUTHORITIES, ESS_YEARS, essDiscount, essDiscountFormInput, essDiscountResult } from '../assets/ess-discount.mjs';
import { add, addMonths, cmp, day, div, int, lit, quantize, shown, str } from '../assets/ess-core.mjs';
import { amountOf } from '../assets/ess-input.mjs';

const fixture = createRequire(import.meta.url)('./ess-discount-engine-differential.json');
// Every runner (check_site, mutation-check and `node --test scripts/`) starts in the site's root.
const page = readFileSync('_includes/calculators/ess-discount.html', 'utf8');
const code = (run) => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return null;
};
const yes = { employed: true, ordinary_shares_only: true, not_share_trading_company: true, minimum_holding_period: true,
  ten_percent_limit: true, non_discriminatory: true, real_risk_of_forfeiture: false, salary_sacrifice: false };
const share = (more = {}, conditions = {}) => ({ kind: 'share', acquired: '2025-09-01', consideration: '0', market_value: '2500',
  conditions: { ...yes, broad_availability: true, ...conditions }, start_up: null, ...more });
const right = (more = {}, conditions = {}) => ({ kind: 'right', acquired: '2025-09-01', consideration: '0', exercise_price: '1000',
  share_market_value: '1200', last_exercise_day: '2029-09-01', valuation: 'regulations',
  conditions: { ...yes, deferral_stated: false, ...conditions }, start_up: null, ...more });
const income = { taxable_income: '90000', reportable_fringe_benefits_total: '0', reportable_super_contributions: '0',
  total_net_investment_loss: '0' };
const call = (interests, more = {}) => ({ interests, income_test: income, foreign_employment: false, year: '2025-26',
  scope_confirmed: true, ...more });
const run = (interests, more) => essDiscount(call(interests, more));
const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const YES = ['employed', 'ordinary-shares-only', 'not-share-trading-company', 'minimum-holding-period', 'ten-percent-limit',
  'non-discriminatory', 'broad-availability'].map((name) => [name, 'yes']);
const ask = (fields) => (name) => new Map([...YES, ...Object.entries({ year: '2025-26', kind: 'share', acquired: '2025-09-01', ...fields })])
  .get(name) ?? '';

test('the page agrees with the australian-accounting command on every differential case', () => {
  for (const c of fixture.cases) {
    let got;
    try {
      const r = essDiscount(structuredClone(c.call));
      assert.deepEqual(r.authorities, fixture.authorities);
      got = { amounts: r.amounts, rates: r.rates, forfeiture_exclusions: r.forfeiture_exclusions,
        interests: r.interests.map((row) => ({ ...row, rule: fixture.rules.indexOf(row.rule) })) };
    } catch (error) {
      if (!error.code) throw error;
      got = { refused: error.code };
    }
    const want = c.refused ? { refused: c.refused }
      : { amounts: c.amounts, rates: c.rates, forfeiture_exclusions: c.forfeiture_exclusions, interests: c.interests };
    assert.deepEqual(got, want, c.source);
  }
  assert.equal(fixture.cases.length, 701);
  assert.ok(page.includes('agrees with the command on 701 test cases'));
  assert.deepEqual(AUTHORITIES, fixture.authorities);
});

test('decimals print, divide and round as Python does', () => {
  assert.deepEqual(['1.4E-7', '0E+2', '-0.00', '1E+3', '0.000001', '123.45'].map((t) => t),
    [str(div(lit('140000.00'), lit('1000000000000'))), str(div(int(0), lit('493.67'))), shown(amountOf('-0')),
      str({ neg: false, c: 1n, e: 3 }), str(div(int(1), lit('1000000'))), str(lit('123.45'))]);
  assert.equal(str(div(int(2), int(3))), '0.6666666666666666666666666666666666666667');
  assert.equal(str(div(int(1), int(8))), '0.125');
  assert.equal(str(div(lit('9999999999999999999999999999999999999999.5'), int(1))), '1.000000000000000000000000000000000000000E+40');
  assert.equal(str(div(lit('0.5'), int(1), 1)), '0.5');
  assert.equal(str(div(lit('25'), int(1), 1)), '2E+1');
  assert.equal(str(div(lit('35'), int(1), 1)), '4E+1');
  assert.deepEqual([shown(lit('0.005')), shown({ neg: true, c: 5n, e: -3 }), shown(lit('2.004'))], ['0.01', '-0.01', '2.00']);
  assert.equal(str(quantize(lit('110.9'), 0, 'down')), '110');
  assert.equal(cmp(amountOf('-0.00'), int(0)), 0);
  assert.equal(str(add(amountOf('-0'), amountOf('-0.0'))), '-0.0');
  assert.equal(str(div(lit(`1${'0'.repeat(45)}`), int(3))), '3.333333333333333333333333333333333333333E+44');
  assert.deepEqual(['1.000', '1.', '.5', '+1', '1e3', '1_000', 'inf', '-1', '1000000000000.01', 5, 'x'.repeat(33)].map(amountOf),
    Array(11).fill(null));
  assert.equal(shown(amountOf('\u001c 7.5\u2003')), '7.50');
  assert.equal(shown(amountOf('1000000000000')), '1000000000000.00');
});

test('dates: real days from 1900 to 2100, months that keep the day or take the last one', () => {
  assert.deepEqual(['2026-02-30', '1899-12-31', '2101-01-01', '2026-1-01', 20260101].map(day), [null, null, null, null, null]);
  assert.equal(addMonths(day('2025-08-31'), 6), day('2026-02-28'));
  assert.equal(addMonths(day('2023-11-30'), 3), day('2024-02-29'));
});

test('an upfront discount takes the $1,000 reduction only when the income test is $180,000 or less (s 83A-35)', () => {
  assert.deepEqual(run([share()]).amounts, { upfront_eligible_discounts: '2500.00', upfront_other_discounts: '0.00', deferred_amounts: '0.00',
    reduction: '1000.00', assessable_discount: '1500.00', start_up_discounts: '0.00', adjusted_taxable_income: '90000.00' });
  const over = run([share()], { income_test: { ...income, reportable_fringe_benefits_total: '90000.01' } }).amounts;
  assert.deepEqual([over.reduction, over.assessable_discount], ['0.00', '2500.00']);
  assert.equal(run([share({ market_value: '600' })]).amounts.reduction, '600.00');
  assert.equal(code(() => run([share()], { income_test: null })), 'input.missing_field');
  assert.equal(run([share({}, { non_discriminatory: false })], { income_test: null }).amounts.upfront_other_discounts, '2500.00');
  assert.equal(run([share({ consideration: '3000' })]).interests[0].discount, '0.00');
});

test('a real risk of forfeiture defers to the taxing point, moved to a disposal within 30 days', () => {
  const deferred = share({ restrictions_lifted: '2025-12-01', disposed: '2025-12-20', cost_base: '0',
    taxing_point_value: { date: '2025-12-20', market_value: '4000' } }, { real_risk_of_forfeiture: true });
  const [row] = run([deferred]).interests;
  assert.deepEqual([row.treatment, row.rule, row.deferred_taxing_point, row.taxing_point_rule, row.amount_in_year],
    ['deferred', 's 83A-105(3)', '2025-12-20', 's 83A-115(3)', '4000.00']);
  assert.equal(code(() => run([{ ...deferred, taxing_point_value: null }])), 'ess_discount.taxing_point_value');
  assert.equal(run([{ ...deferred, taxing_point_value: null }], { year: '2026-27' }).amounts.deferred_amounts, '0.00');
  assert.equal(code(() => run([share({ restrictions_lifted: null })])), 'input.field_unknown');
  // A right's restrictions ending before its exercise and its shares' restrictions: the earliest point wins.
  const exercised = right({ restrictions_lifted: '2026-01-01', exercised: '2026-03-01', share_restrictions_lifted: '2026-04-01',
    disposed: null, cost_base: '0', taxing_point_value: null }, { real_risk_of_forfeiture: true });
  const [point] = run([exercised], { year: '2024-25' }).interests;
  assert.deepEqual([point.deferred_taxing_point, point.taxing_point_rule],
    ['2026-01-01', 's 83A-120(4)']);
});

test('a right valued by the regulations takes the greater of its intrinsic and table values', () => {
  const [row] = run([right()]).interests;
  assert.deepEqual(row.valuation, { rule: 's 83A-315.09', calculation_percentage: '120', exercise_period_months_up_to: 48,
    intrinsic_value: '200.00', table_value: '194.00', value: '200.00' });
  const table = run([right({ share_market_value: '1000' })]).interests[0].valuation;
  assert.deepEqual([table.rule, table.table_value], ['s 83A-315.08', '62.00']);
  assert.deepEqual(run([right({ share_market_value: '1205.50' })]).interests[0].valuation.rule, 's 83A-315.09');
  assert.equal(code(() => run([right({ acquired: '2021-06-30' })])), 'ess_discount.valuation_unavailable');
});

test('the command refuses in its order', () => {
  assert.equal(code(() => essDiscount({ ...call([share()]), extra: 1 })), 'input.field_unknown');
  assert.equal(code(() => essDiscount({ interests: [share()], year: '2025-26' })), 'input.missing_field');
  assert.equal(code(() => run([share()], { scope_confirmed: 'yes' })), 'scope.not_confirmed');
  assert.equal(code(() => run([share()], { year: '2019-20' })), 'period.unsupported');
  assert.equal(code(() => run([share()], { foreign_employment: 'no' })), 'input.flag_invalid');
  assert.equal(code(() => run([share()], { foreign_employment: true })), 'ess_discount.foreign_employment');
  assert.equal(code(() => run([])), 'ess_discount.interests_invalid');
  assert.equal(code(() => run([share({ acquired: '2015-06-30' })])), 'ess_discount.acquired_before_2015');
  assert.equal(code(() => run([share()], { income_test: [] })), 'ess_discount.income_test_invalid');
  assert.equal(code(() => run([share()], { income_test: { ...income, note: '' } })), 'input.field_unknown');
  assert.equal(code(() => run([share()], { income_test: { taxable_income: '1' } })), 'input.missing_field');
  assert.equal(code(() => run([share()], { income_test: { ...income, taxable_income: '1.001' } })), 'input.amount_invalid');
  assert.deepEqual(ESS_YEARS.length, 7);
  for (const bad of [null, [], share({ kind: 'option' }), share({ conditions: null }), share({ conditions: { ...yes, employed: 'yes' } }),
    share({ acquired: 'x' }), { kind: 'share', acquired: '2025-09-01', forfeiture: null }]) {
    assert.equal(code(() => run([bad])), 'ess_discount.interests_invalid', JSON.stringify(bad));
  }
  const deferredShare = share({ restrictions_lifted: 'x', disposed: null, cost_base: '0', taxing_point_value: null },
    { real_risk_of_forfeiture: true });
  assert.equal(code(() => run([deferredShare])), 'ess_discount.interests_invalid');
});

test('the form sends one interest, its deferral facts only once one is entered, and the income test when given', () => {
  const plain = essDiscountFormInput(ask({ 'market-value': '2500', 'taxable-income': '' }));
  assert.equal(plain.income_test, null);
  assert.deepEqual(Object.keys(plain.interests[0]), ['kind', 'acquired', 'consideration', 'market_value', 'conditions', 'start_up']);
  const rights = essDiscountFormInput(ask({ kind: 'right', acquired: '2021-09-01', valuation: 'regulations', 'cost-base': '5',
    'start-up': 'yes', unlisted: 'yes', 'under-ten-years': 'yes', 'employer-resident': 'yes', 'tp-value': '9', 'tp-date': '2026-01-01' }));
  const [item] = rights.interests;
  assert.deepEqual([item.market_value, item.employment_ended, item.exercised, item.cost_base, item.taxing_point_value, item.start_up],
    [undefined, null, null, '5', { date: '2026-01-01', market_value: '9' }, { unlisted: true, incorporated_under_10_years: true,
      aggregated_turnover: '0', employer_australian_resident: true }]);
  assert.equal(item.conditions.deferral_stated, false);
  assert.equal(essDiscountFormInput(ask({ 'cost-base': '1' })).interests[0].taxing_point_value, null);
  assert.equal(essDiscountFormInput(ask({ disposed: '2026-01-01' })).interests[0].cost_base, '0');
});

test('the result shows each label, the taxing point when deferred and where another year takes the amount', () => {
  const plain = essDiscountResult(ask({ 'market-value': '2500', 'taxable-income': '90000' }), aud);
  assert.deepEqual(plain.rows[plain.principal], ['Assessable discount for 2025-26 (label B)', '$1,500.00']);
  const later = essDiscountResult(ask({ 'market-value': '2500', 'real-risk': 'yes', 'cost-base': '0', 'restrictions-lifted': '2026-08-01' }), aud);
  assert.deepEqual(later.rows.slice(1, 3), [['Treatment', 'Deferred (s 83A-105(3))'], ['Deferred taxing point', '2026-08-01 (s 83A-115(4))']]);
  assert.equal(later.note, 'The interest’s amount is included in 2026-27, not 2025-26');
  const startUp = essDiscountResult(ask({ 'market-value': '100', consideration: '90', 'start-up': 'yes', unlisted: 'yes',
    'under-ten-years': 'yes', turnover: '1000', 'employer-resident': 'yes', 'taxable-income': '1' }), aud);
  assert.deepEqual(startUp.rows[2], ['Start-up discount not included', '$10.00']);
});
