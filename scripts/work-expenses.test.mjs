// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The work expenses page against the examples the ATO, PCG 2023/1 and TR 98/9 publish, every rate
// for every year, each year boundary and each refusal, all read on 22 November 2026. The results
// match the `work-expenses` command of ryanduguid/australian-accounting for the same inputs.

import assert from 'node:assert/strict';
import test from 'node:test';
import { CENTS_PER_KILOMETRE, HOME_OFFICE_RATES, WORK_EXPENSES_YEARS, workExpenses } from '../assets/work-expenses.mjs';
import { workExpensesFormFacts, workExpensesResult } from '../assets/work-expenses-result.mjs';

const base = { scope_confirmed: true, reimbursed: false, allowance_received: false };
const zero = { energy: '0', phone: '0', internet: '0', stationery: '0', cleaning: '0', furniture_decline: '0', asset_decline: '0', repairs: '0' };
/** @param {string} year @param {string} hours @param {Record<string, any>} [extra] */
const home = (year, hours, extra = {}) => ({ method: 'home_office', year, ...base, hours, ...zero, running_expenses_incurred: true,
  ...(year < '2022-23' ? { dedicated_home_office: true } : {}), ...extra });
/** @param {string} year @param {string} km */
const car = (year, km) => ({ method: 'car_cents_per_kilometre', year, ...base, owned_or_leased: true, business_kilometres: km });
/** @param {Record<string, any>} extra */
const log = (extra) => ({ method: 'car_log_book', year: '2025-26', ...base, owned_or_leased: true, business_kilometres: '69',
  total_kilometres: '100', car_expenses: '17275.33', log_book_year: '2023-24', log_book_weeks: '12', log_book_representative: true, ...extra });
/** @param {string} year @param {Record<string, any>} [extra] */
const edu = (year, extra = {}) => ({ method: 'self_education', year, ...base, connection: 'maintains_or_improves_skills',
  employed_when_incurred: true, category_a: '0', category_b: '0', category_c: '0', category_d: '0',
  ...(year < '2022-23' ? { prescribed_course: true, category_e: '0' } : {}), ...extra });
/** The worksheet, or its refusal's code, so a wrong refusal fails as an assertion.
 * @param {Record<string, any>} facts @returns {Record<string, any>} */
const work = (facts) => {
  try {
    return workExpenses(facts);
  } catch (error) {
    return { refused: error.code ?? String(error), amounts: {} };
  }
};
/** @param {Record<string, any>} facts @param {string} code */
const refused = (facts, code) => assert.equal(work(facts).refused, code);

test('the ATO and PCG 2023/1 fixed rate examples', () => {
  const keisha = work(home('2025-26', '843')).amounts;
  assert.equal(keisha.fixed_rate_amount, '590.10');
  assert.equal(keisha.fixed_rate_return_amount, '590.00');
  const yang = work(home('2025-26', '567', { furniture_decline: '549.00' })).amounts;
  assert.deepEqual([yang.fixed_rate_amount, yang.fixed_rate_method, yang.fixed_rate_return_amount], ['396.90', '945.90', '945.00']);
  assert.equal(work(home('2025-26', '136')).amounts.fixed_rate_return_amount, '95.00');
  assert.equal(work(home('2024-25', '768')).amounts.fixed_rate_return_amount, '537.00');
  const piruntha = work(home('2024-25', '560', { furniture_decline: '439.20', asset_decline: '696.52' }));
  assert.deepEqual([piruntha.amounts.fixed_rate_method, piruntha.amounts.fixed_rate_return_amount], ['1527.72', '1527.00']);
  assert.equal(piruntha.higherMethod, 'fixed_rate');
});

test('each year has its hourly rates, and the shortcut ends with 2021-22', () => {
  const expected = { '2020-21': '0.52', '2021-22': '0.52', '2022-23': '0.67', '2023-24': '0.67', '2024-25': '0.70', '2025-26': '0.70', '2026-27': '0.70' };
  assert.deepEqual(Object.keys(expected), WORK_EXPENSES_YEARS);
  assert.deepEqual(Object.values(HOME_OFFICE_RATES).map((r) => r.fixed), [52, 52, 67, 67, 70, 70, 70]);
  for (const [year, rate] of Object.entries(expected)) {
    const r = work(home(year, '100'));
    assert.equal(r.rates.fixed_rate, rate, year);
    assert.equal(r.amounts.fixed_rate_amount, `${rate.slice(2)}.00`, year);
    assert.equal(r.rates.shortcut_rate, year < '2022-23' ? '0.80' : undefined, year);
    assert.equal(r.amounts.shortcut_method, year < '2022-23' ? '80.00' : undefined, year);
  }
});

test('the fixed rate covers its expenses, and the actual cost counts them all', () => {
  const amounts = { energy: '1', phone: '2', internet: '4', stationery: '8', cleaning: '16', furniture_decline: '32', asset_decline: '64', repairs: '128' };
  // From 2022-23 cleaning, decline in value and repairs go beside the rate (PCG 2023/1 para 15).
  assert.equal(work(home('2022-23', '0', amounts)).amounts.fixed_rate_separate_expenses, '240.00');
  // Before, phone, internet, stationery, other assets' decline and repairs (the 52 cent page).
  assert.equal(work(home('2021-22', '0', amounts)).amounts.fixed_rate_separate_expenses, '206.00');
  assert.equal(work(home('2021-22', '0', amounts)).amounts.actual_cost_method, '255.00');
});

test('no hourly rate without additional running expenses, and none can then be entered', () => {
  for (const year of WORK_EXPENSES_YEARS) {
    const sergei = work(home(year, '500', { running_expenses_incurred: false, asset_decline: '50' }));
    assert.deepEqual(sergei.methodsAvailable, ['actual_cost'], year);
    assert.equal(sergei.amounts.actual_cost_method, '50.00');
    assert.equal(sergei.fixedRateUnavailable, 'no-running-expenses');
    refused(home(year, '1', { running_expenses_incurred: false, internet: '1' }), 'work_expenses.fact_conflict');
  }
  // Cleaning is a running expense the 52c and 80c rates needed, but not one the later rate covers.
  refused(home('2021-22', '1', { running_expenses_incurred: false, cleaning: '1' }), 'work_expenses.fact_conflict');
  assert.equal(work(home('2022-23', '1', { running_expenses_incurred: false, cleaning: '1' })).amounts.actual_cost_method, '1.00');
});

test('before 2022-23 the 52c rate needs a dedicated home office; the shortcut does not', () => {
  const r = work(home('2021-22', '1000', { dedicated_home_office: false, energy: '900' }));
  assert.deepEqual(r.methodsAvailable, ['shortcut', 'actual_cost']);
  assert.equal(r.higherMethod, 'actual_cost');
  assert.equal(r.fixedRateUnavailable, 'no-dedicated-home-office');
  assert.deepEqual(work(home('2021-22', '100', { phone: '20' })).methodsAvailable, ['fixed_rate', 'shortcut', 'actual_cost']);
  // A tie names the first listed, the fixed rate, which needs fewer records.
  assert.equal(work(home('2025-26', '100', { energy: '70' })).higherMethod, 'fixed_rate');
});

test('hours cannot exceed the hours in the year, 366 days when February has 29', () => {
  assert.equal(work(home('2023-24', '8784')).amounts.fixed_rate_amount, '5885.28');
  refused(home('2023-24', '8784.01'), 'work_expenses.fact_conflict');
  refused(home('2024-25', '8760.01'), 'work_expenses.fact_conflict');
});

test('cents per kilometre: Johan, every rate and the 5,000 kilometre cap', () => {
  const johan = work(car('2025-26', '2514')).amounts;
  assert.deepEqual([johan.deduction, johan.return_amount], ['2212.32', '2212.00']);
  const rates = { '2020-21': 72, '2021-22': 72, '2022-23': 78, '2023-24': 85, '2024-25': 88, '2025-26': 88, '2026-27': 91 };
  assert.deepEqual(CENTS_PER_KILOMETRE, rates);
  for (const [year, cents] of Object.entries(rates)) {
    assert.equal(work(car(year, '100')).amounts.deduction, `${cents}.00`, year);
  }
  const capped = work(car('2025-26', '5085'));
  assert.equal(capped.amounts.claimed_kilometres, '5000.00');
  assert.equal(capped.kilometresDiscarded, true);
  assert.equal(work(car('2025-26', '5000')).kilometresDiscarded, false);
  refused({ ...car('2025-26', '10'), owned_or_leased: false }, 'work_expenses.car_not_held');
});

test('log book: Lana, the 5 year life, 12 weeks and a log book that still represents the use', () => {
  const lana = work(log({}));
  assert.deepEqual(lana.amounts, { business_use_percentage: '69.00', deduction: '11919.98', return_amount: '11919.00' });
  assert.equal(lana.logBookValidTo, '2027-28');
  assert.equal(work(log({ log_book_year: '2021-22' })).logBookValidTo, '2025-26');
  refused(log({ log_book_year: '2020-21' }), 'work_expenses.log_book_expired');
  refused(log({ log_book_year: '2026-27' }), 'work_expenses.fact_conflict');
  refused(log({ log_book_year: '2023-25' }), 'work_expenses.fact_invalid');
  refused(log({ log_book_weeks: '11' }), 'work_expenses.log_book_too_short');
  refused(log({ log_book_weeks: '12.5' }), 'work_expenses.fact_invalid');
  refused(log({ log_book_representative: false, log_book_year: '2021-22' }), 'work_expenses.log_book_unrepresentative');
  refused(log({ business_kilometres: '101' }), 'work_expenses.fact_conflict');
  refused(log({ total_kilometres: '0', business_kilometres: '0' }), 'work_expenses.fact_conflict');
});

test('a repeating business use percentage keeps 40 digits, as the command does', () => {
  // 1/12 to 40 digits, times 6 cents, rounds up to exactly half a cent, which shows as 1 cent.
  assert.equal(work(log({ business_kilometres: '1', total_kilometres: '12', car_expenses: '0.06' })).amounts.deduction, '0.01');
  // 1/3 of $100 is $33.333..., 33.33 to the cent.
  assert.equal(work(log({ business_kilometres: '1', total_kilometres: '3', car_expenses: '100' })).amounts.deduction, '33.33');
  assert.equal(work(log({ business_kilometres: '2', total_kilometres: '3', car_expenses: '100' })).amounts.business_use_percentage, '66.67');
});

test('the $250 reduction to 2021-22 for a prescribed course, and none from 2022-23', () => {
  const maureen = work(edu('2021-22', { category_a: '290' }));
  assert.equal(maureen.amounts.deduction, '40.00');
  assert.equal(maureen.reductionApplies, true);
  const con = work(edu('2020-21', { category_a: '350', category_b: '200', category_c: '100', category_d: '100', category_e: '500',
    log_book_car_in_category_a: false }));
  assert.deepEqual([con.amounts.reduction, con.amounts.deduction], ['0.00', '750.00']);
  assert.equal(work(edu('2020-21', { category_a: '500', category_b: '400', category_e: '2200' })).amounts.deduction, '900.00');
  // Category A below the reduction leaves nil, never a negative amount.
  assert.equal(work(edu('2021-22', { category_a: '100' })).amounts.category_a_after_reduction, '0.00');
  const seminar = { ...edu('2021-22', { category_a: '290' }), prescribed_course: false };
  assert.equal(work(Object.fromEntries(Object.entries(seminar).filter(([key]) => key !== 'category_e'))).amounts.deduction, '290.00');
  const later = work(edu('2022-23', { category_a: '290' }));
  assert.equal(later.amounts.deduction, '290.00');
  assert.equal(later.reductionApplies, false);
});

test('self-education needs a connection to current employment when incurred', () => {
  for (const connection of ['general_only', 'new_employment']) {
    const r = work(edu('2025-26', { category_a: '290', connection }));
    assert.equal(r.amounts.deduction, '0.00');
    assert.equal(r.deductible, false);
  }
  assert.equal(work(edu('2025-26', { category_a: '290', employed_when_incurred: false })).deductible, false);
  assert.equal(work(edu('2025-26', { category_a: '290', connection: 'increases_income' })).amounts.deduction, '290.00');
  refused(edu('2025-26', { connection: 'other' }), 'work_expenses.fact_invalid');
});

test('category D never sits beside log book car expenses in category A', () => {
  assert.equal(work(edu('2025-26', { category_a: '500', category_d: '100', log_book_car_in_category_a: false })).amounts.deduction, '600.00');
  refused(edu('2025-26', { category_a: '500', category_d: '100', log_book_car_in_category_a: true }), 'work_expenses.fact_conflict');
  refused(edu('2025-26', { category_d: '100' }), 'input.missing_field');
  assert.equal(work(edu('2025-26', { category_a: '1', log_book_car_in_category_a: true })).amounts.deduction, '1.00');
});

test('refusals: scope, years, reimbursement, allowances and amounts past $1,000,000,000,000', () => {
  refused({ ...car('2025-26', '1'), scope_confirmed: false }, 'scope.not_confirmed');
  refused(car('2019-20', '1'), 'scope.period_unsupported');
  refused(car('2027-28', '1'), 'scope.period_unsupported');
  refused({ ...car('2025-26', '1'), reimbursed: true }, 'work_expenses.reimbursed');
  refused({ ...car('2025-26', '1'), allowance_received: true }, 'work_expenses.allowance_received');
  refused({ ...car('2025-26', '1'), method: 'car_fringe' }, 'work_expenses.method_invalid');
  // The command's own cap keeps every amount in cents below 2^53, so a Number never rounds one.
  assert.equal(work(edu('2025-26', { category_a: '1000000000000', category_b: '1000000000000' })).amounts.deduction, '2000000000000.00');
  refused(edu('2025-26', { category_a: '1000000000000.01' }), 'input.amount_invalid');
  refused(car('2025-26', '-1'), 'input.amount_invalid');
  refused(car('2025-26', '1.001'), 'input.amount_invalid');
  refused(home('2025-26', ''), 'input.amount_invalid');
});

test('an input for another method, or for a year that does not take it, is refused as the command refuses it', () => {
  refused(home('2022-23', '1', { dedicated_home_office: true }), 'input.field_unknown');
  refused(edu('2022-23', { prescribed_course: true }), 'input.field_unknown');
  refused(edu('2022-23', { category_e: '0' }), 'input.field_unknown');
  refused(edu('2021-22', { prescribed_course: false }), 'input.field_unknown');
  assert.equal(work(edu('2021-22', { prescribed_course: false, category_e: undefined, category_a: '290' })).amounts.deduction, '290.00');
  refused(edu('2025-26', { hours: '1' }), 'input.field_unknown');
  refused({ ...car('2025-26', '1'), car_expenses: '1' }, 'input.field_unknown');
  refused({ ...log({}), energy: '1' }, 'input.field_unknown');
  refused(home('2025-26', '1', { business_kilometres: '1' }), 'input.field_unknown');
  assert.equal(work(edu('2025-26', { log_book_car_in_category_a: false })).refused, undefined);
});

/** The form's answers, as the page reads them. @param {Record<string, string>} fields @param {string} [blank] */
const answers = (fields, blank = '') => (/** @type {string} */ name) => new Map(Object.entries(fields)).get(name) ?? blank;

test('the form passes only the inputs the method and year take', () => {
  const form = { method: 'self_education', year: '2022-23', scope: 'yes', reimbursed: 'no', allowance: 'no', connection: 'increases_income',
    employed: 'yes', 'category-a': '1', 'category-b': '2', 'category-c': '3', 'category-d': '0', 'log-book-car': 'no', prescribed: 'yes',
    'category-e': '9', hours: '5' };
  const facts = workExpensesFormFacts(answers(form));
  assert.equal('prescribed_course' in facts || 'category_e' in facts || 'hours' in facts, false);
  const early = workExpensesFormFacts(answers({ ...form, year: '2021-22' }));
  assert.deepEqual([early.prescribed_course, early.category_e], [true, '9']);
  const result = workExpensesResult(answers({ ...form, year: '2021-22' }), (n) => `$${n.toFixed(2)}`);
  assert.equal(result.rows.at(-1)?.[1], '$5.00');
  assert.equal(result.inputs, 'Self-education, 2021-22, categories A to D $1.00, $2.00, $3.00, $0.00, prescribed course, category E $9.00');
});

test('the note cites PCG 2023/1 for running expenses from 2022-23 and the ATO’s earlier guidance before it', () => {
  const form = { method: 'home_office', scope: 'yes', reimbursed: 'no', allowance: 'no', hours: '100', 'running-expenses': 'no',
    dedicated: 'yes', repairs: '10' };
  const note = (year) => workExpensesResult(answers({ ...form, year }, '0'), (n) => `$${n.toFixed(2)}`).note ?? '';
  assert.match(note('2021-22'), /52 cent fixed rate and shortcut method pages; PCG 2020\/3\)/);
  assert.doesNotMatch(note('2021-22'), /PCG 2023\/1/);
  assert.match(note('2022-23'), /\(PCG 2023\/1 paras 18\(b\) and 49 to 55\)/);
  assert.doesNotMatch(note('2022-23'), /PCG 2020\/3/);
});
