// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The defined benefit income cap (ITAA 1997 s 303-4), the half of the excess that is assessable
// (s 303-2) and the reduced untaxed element offset (s 303-3, with ss 301-100(2) and 302-85(2)), for
// income years 2017-18 to 2026-27: a port of the `defined-benefit-income-cap` command of
// ryanduguid/australian-accounting, checked against it on every case of its differential fixture.

import {
  add, amountsOf, callFields, cmp, dateOf, div, dollars, exact, max, money, mul, refuse, sub, yearOf,
} from './command-args.mjs';
import { formAmount, formMoney } from './form-amount.mjs';

export const DB_INCOME_CAP_YEARS = ['2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];

/** s 294-35(3): the general transfer balance cap for each year (the ATO's transfer balance cap page). */
const GENERAL_CAP = new Map([
  ['2017-18', 1600000n], ['2018-19', 1600000n], ['2019-20', 1600000n], ['2020-21', 1600000n], ['2021-22', 1700000n],
  ['2022-23', 1700000n], ['2023-24', 1900000n], ['2024-25', 1900000n], ['2025-26', 2000000n], ['2026-27', 2100000n],
]);
const DAY = 86400000;
const REQUIRED = ['tax_free_and_taxed', 'untaxed', 'other_defined_benefit_income', 'year', 'scope_confirmed'];

/** The income year's first and last days as day numbers. @param {string} year */
function bounds(year) {
  const start = Number(year.slice(0, 4));
  return [Date.UTC(start, 6, 1) / DAY, Date.UTC(start + 1, 5, 30) / DAY];
}

/** The days after the first day of the concessional treatment, or null when it began in an earlier year. @param {Map<string, unknown>} input @param {string} year @param {number} first @param {number} last */
function daysAfter(input, year, first, last) {
  if (!input.has('first_day')) return null;
  const day = dateOf(input.get('first_day'), 'first_day');
  if (day < first || day > last) {
    refuse('defined_benefit_income_cap.first_day_outside_year', `Enter a first day in ${year}, or leave it blank when the concessional treatment first applied in an earlier year (s 303-4(2)).`);
  }
  return last - day;
}

/** s 303-4(1) or (2), then (3). @param {bigint} general @param {number | null} after @param {number} days @param {import('./command-args.mjs').Exact} other */
function capSteps(general, after, days, other) {
  const sixteenth = div(exact(general), exact(16n));
  const unreduced = after === null ? dollars(sixteenth, true)
    : dollars(mul(sixteenth, div(add(exact(1n), exact(BigInt(after))), exact(BigInt(days)))), true);
  return [unreduced, max(exact(0n), sub(unreduced, other))];
}

/**
 * The command's result: { period, amounts, rates }, each amount to the cent.
 * @param {unknown} given the command's JSON input
 */
export function definedBenefitIncomeCap(given) {
  const input = callFields(given, 'defined-benefit-income-cap', REQUIRED, ['first_day'], REQUIRED.slice(0, 3));
  const year = yearOf(input, DB_INCOME_CAP_YEARS);
  const [taxed, untaxed, other] = REQUIRED.slice(0, 3).map((key) => money(input.get(key)));
  const [first, last] = bounds(year);
  const days = last - first + 1;
  const after = daysAfter(input, year, first, last);
  const general = /** @type {bigint} */ (GENERAL_CAP.get(year));
  const [unreduced, cap] = capSteps(general, after, days, other);
  const tenth = exact(1n, 10n);
  const excess = max(exact(0n), sub(taxed, cap));
  const offset = mul(untaxed, tenth);
  const reduction = mul(max(exact(0n), sub(add(taxed, untaxed), cap)), tenth);
  const amounts = amountsOf([
    ['unreduced_cap', unreduced], ['defined_benefit_income_cap', cap], ['excess_over_cap', excess],
    ['assessable_income', mul(excess, exact(1n, 2n))], ['untaxed_offset_before_reduction', offset],
    ['offset_reduction', reduction], ['untaxed_offset', max(exact(0n), sub(offset, reduction))],
  ]);
  /** @type {Record<string, string>} */
  const rates = { general_transfer_balance_cap: String(general), days_in_year: String(days) };
  if (after !== null) rates.days_after_first_day = String(after);
  return { period: year, amounts, rates, reduced: cmp(cap, unreduced) < 0 };
}

/** The command's input from the page's form. @param {(name: string) => string} value */
export function dbIncomeCapFormInput(value) {
  const first = value('first-day').trim();
  return {
    year: value('year'), scope_confirmed: true,
    tax_free_and_taxed: formAmount(value('tax-free-and-taxed'), 'the tax free and taxed amounts'),
    untaxed: formAmount(value('untaxed'), 'the untaxed elements'),
    other_defined_benefit_income: formAmount(value('other'), 'the other defined benefit income'),
    ...(first === '' ? {} : { first_day: first }),
  };
}

/** The page's result. @param {(name: string) => string} value */
export function dbIncomeCapResult(value) {
  const input = dbIncomeCapFormInput(value);
  let r;
  try {
    r = definedBenefitIncomeCap(input);
  } catch (error) {
    if (/** @type {{code?: string}} */ (error).code === 'input.date_invalid') refuse('input.date_invalid', 'Enter the first day as a date from 1900 to 2100.');
    throw error;
  }
  const a = r.amounts;
  const rows = [
    ['Defined benefit income cap', formMoney(a.defined_benefit_income_cap)],
    ['Tax free and taxed amounts over the cap', formMoney(a.excess_over_cap)],
    ['Assessable income: 50% of the excess', formMoney(a.assessable_income)],
    ['Untaxed element offset after the reduction', formMoney(a.untaxed_offset)],
  ];
  const capNote = r.reduced ? `the cap of ${formMoney(a.unreduced_cap)} less your other defined benefit income` : `the general transfer balance cap of ${formMoney(r.rates.general_transfer_balance_cap)} / 16`;
  const text = `${'days_after_first_day' in r.rates ? 'pro-rated from the first day; ' : ''}${capNote}; offset of ${formMoney(a.untaxed_offset_before_reduction)} reduced by ${formMoney(a.offset_reduction)}`;
  const note = `Cap: ${text}`;
  return {
    inputs: `${r.period}; tax free and taxed ${formMoney(input.tax_free_and_taxed)}; untaxed ${formMoney(input.untaxed)}; other defined benefit income ${formMoney(input.other_defined_benefit_income)}`
      + `${'first_day' in input ? `; first day ${input.first_day}` : ''}`,
    rows, principal: 2, note,
  };
}
