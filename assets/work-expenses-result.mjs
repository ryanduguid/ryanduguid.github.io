// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { CENTS_PER_KILOMETRE, HOME_OFFICE_RATES, workExpenses } from './work-expenses.mjs';

const METHOD_NAMES = /** @type {Record<string, string>} */ ({
  home_office: 'Working from home', car_cents_per_kilometre: 'Car, cents per kilometre', car_log_book: 'Car, log book',
  self_education: 'Self-education',
});
const HOME_METHODS = /** @type {Record<string, string>} */ ({ fixed_rate: 'Fixed rate', shortcut: 'Shortcut', actual_cost: 'Actual cost' });
const HOME_AMOUNTS = ['energy', 'phone', 'internet', 'stationery', 'cleaning', 'furniture-decline', 'asset-decline', 'repairs'];
const EARLY = ['2020-21', '2021-22'];
const UNAVAILABLE = /** @type {Record<string, string>} */ ({
  'no-running-expenses': 'No hourly rate applies without additional running expenses from working from home (PCG 2023/1 '
    + 'paras 18(b) and 49 to 55; PCG 2020/3); the actual cost remains',
  'no-dedicated-home-office': 'Before 2022-23 the 52c fixed rate needs a dedicated home office; the shortcut and actual cost remain',
});
const CHOICE = 'The higher method is named for comparison only: each method needs its own records, and you choose one for the year';

/** The form's answers as the `work-expenses` command's input.
 * @param {(name: string) => string} value @returns {import('./work-expenses.mjs').WorkExpensesFacts} */
export function workExpensesFormFacts(value) {
  const method = value('method');
  const year = value('year');
  const early = EARLY.includes(year);
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  /** @type {import('./work-expenses.mjs').WorkExpensesFacts} */
  const facts = { method, year, scope_confirmed: yes('scope'), reimbursed: yes('reimbursed'), allowance_received: yes('allowance') };
  if (method === 'home_office') {
    facts.hours = value('hours');
    for (const name of HOME_AMOUNTS) facts[name.replace('-', '_')] = value(name);
    facts.running_expenses_incurred = yes('running-expenses');
    if (early) facts.dedicated_home_office = yes('dedicated');
  } else if (method === 'self_education') {
    Object.assign(facts, { connection: value('connection'), employed_when_incurred: yes('employed'),
      category_a: value('category-a'), category_b: value('category-b'), category_c: value('category-c'),
      category_d: value('category-d'), log_book_car_in_category_a: yes('log-book-car') });
    if (early) facts.prescribed_course = yes('prescribed');
    if (early && yes('prescribed')) facts.category_e = value('category-e');
  } else {
    Object.assign(facts, { owned_or_leased: yes('owned'), business_kilometres: value('business-kilometres') });
    if (method === 'car_log_book') {
      Object.assign(facts, { total_kilometres: value('total-kilometres'), car_expenses: value('car-expenses'),
        log_book_year: value('log-book-year'), log_book_weeks: value('log-book-weeks'),
        log_book_representative: yes('representative') });
    }
  }
  return facts;
}

/** @param {string} text a number the engine wrote */
const grouped = (text) => Number(text).toLocaleString('en-AU', { maximumFractionDigits: 2 });

/** @param {import('./work-expenses.mjs').WorkExpenses} r @param {Record<string, any>} facts @param {(n: number) => string} cash */
function homeRows(r, facts, cash) {
  const a = r.amounts;
  const { fixed, shortcut } = HOME_OFFICE_RATES[r.year];
  const rows = [];
  if (a.fixed_rate_method) {
    rows.push([`Fixed rate, ${grouped(facts.hours)} hours at ${fixed}c`, cash(a.fixed_rate_amount)],
      ['Expenses claimed beside the fixed rate', cash(a.fixed_rate_separate_expenses)], ['Fixed rate method', cash(a.fixed_rate_method)]);
  }
  if (a.shortcut_method) rows.push([`Shortcut method, ${grouped(facts.hours)} hours at ${shortcut}c`, cash(a.shortcut_method)]);
  const higher = String(r.higherMethod);
  const back = higher === 'fixed_rate' ? a.fixed_rate_return_amount : higher === 'shortcut' ? a.shortcut_return_amount
    : a.actual_cost_return_amount;
  rows.push(['Actual cost method', cash(a.actual_cost_method)], ['Higher method', HOME_METHODS[higher]],
    ['Higher method, cents disregarded', cash(back)]);
  const notes = [r.fixedRateUnavailable ? UNAVAILABLE[r.fixedRateUnavailable] : '',
    r.year === '2026-27' ? 'The 70c for 2026-27 is PCG 2023/1 Table 1’s rate from 1 July 2024; the ATO’s fixed rate page did not yet list 2026-27' : '',
    CHOICE];
  return { rows, principal: rows.length - 1, note: notes.filter(Boolean).join('. ') };
}

/** @param {import('./work-expenses.mjs').WorkExpenses} r @param {(n: number) => string} cash */
function carRows(r, cash) {
  const a = r.amounts;
  if (r.method === 'car_log_book') {
    return { rows: [['Business use percentage', `${a.business_use_percentage}%`], ['Deduction', cash(a.deduction)],
      ['Deduction, cents disregarded', cash(a.return_amount)], ['Log book serves to', String(r.logBookValidTo)]], principal: 2,
    note: 'Enter each car expense deductible outside Division 28, decline in value included, before the business use percentage' };
  }
  return { rows: [['Business kilometres counted', `${grouped(a.claimed_kilometres)} km`],
    ['Rate', `${CENTS_PER_KILOMETRE[r.year]}c a kilometre`], ['Deduction', cash(a.deduction)],
    ['Deduction, cents disregarded', cash(a.return_amount)]], principal: 3,
  note: r.kilometresDiscarded ? 'Only the first 5,000 business kilometres count (ITAA 1997 s 28-25(2))' : '' };
}

/** @param {import('./work-expenses.mjs').WorkExpenses} r @param {(n: number) => string} cash */
function educationRows(r, cash) {
  const a = r.amounts;
  const rows = r.reductionApplies ? [['Categories C, D and E offsetting the $250', cash(a.reduction_offset)],
    ['Reduction', cash(a.reduction)], ['Category A after the reduction', cash(a.category_a_after_reduction)]] : [];
  rows.push(['Deduction', cash(a.deduction)], ['Deduction, cents disregarded', cash(a.return_amount)]);
  const note = !r.deductible ? 'Not deductible: when incurred you were not employed, or the study only related in a general way '
    + 'to your employment or enabled new employment (ITAA 1997 s 8-1; TR 2024/3)'
    : EARLY.includes(r.year) && !r.reductionApplies ? 'No $250 reduction: the course is not a prescribed course of education' : '';
  return { rows, principal: rows.length - 1, note };
}

/** @param {Record<string, any>} facts */
function inputsText(facts) {
  const head = `${METHOD_NAMES[facts.method]}, ${facts.year}`;
  if (facts.method === 'home_office') {
    const other = HOME_AMOUNTS.reduce((sum, name) => sum + Number(facts[name.replace('-', '_')]), 0);
    return `${head}, ${grouped(facts.hours)} hours, other expenses ${other.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}`
      + `${facts.running_expenses_incurred ? '' : ', no additional running expenses'}`
      + `${facts.dedicated_home_office === false ? ', no dedicated home office' : ''}`;
  }
  if (facts.method === 'self_education') {
    return `${head}, categories A to D ${[facts.category_a, facts.category_b, facts.category_c, facts.category_d].join(', ')}`
      + `${facts.prescribed_course ? `, prescribed course, category E ${facts.category_e}` : ''}`;
  }
  return `${head}, ${grouped(facts.business_kilometres)} business km`
    + `${facts.method === 'car_log_book' ? ` of ${grouped(facts.total_kilometres)} km, expenses ${facts.car_expenses}` : ''}`;
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud */
export function workExpensesResult(value, aud) {
  const facts = workExpensesFormFacts(value);
  const r = workExpenses(facts);
  const cash = (/** @type {string | undefined} */ text) => aud(Number(text));
  const shown = r.method === 'home_office' ? homeRows(r, facts, cash) : r.method === 'self_education' ? educationRows(r, cash)
    : carRows(r, cash);
  return { inputs: inputsText(facts), rows: shown.rows, principal: shown.principal, note: shown.note || undefined };
}
