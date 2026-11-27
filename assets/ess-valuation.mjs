// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The value of an unlisted right under the Income Tax Assessment (1997 Act) Regulations 2021 ss 83A-315.02 to
// 83A-315.09, compilation 16 (27 June 2026), as the `ess-discount` command of ryanduguid/australian-accounting works it
// (its engine/ess_discount/valuation.rs, whose tables agree entry for entry with the ATO legal database's copy).

import { add, addMonths, cmp, dateText, div, int, lit, mul, on, quantize, refuse, shown, str, sub } from './ess-core.mjs';

/** @typedef {import('./ess-core.mjs').Dec} Dec */

/** The upper bound, in months, of each exercise period row, shortest first. */
const PERIODS = [3, 6, 9, 12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180];
/** The upper bound of each calculation percentage column of s 83A-315.08. */
const COLUMNS = ['60', '70', '75', '80', '85', '90', '92.5', '95', '97.5', '100', '102.5', '105', '107.5', '110'];
/** s 83A-315.08(1), items 19 down to 1 (columns 50 to 92.5) joined with items 38 down to 20 (columns 92.5 to 110),
 * each row in the order of PERIODS. */
const TABLE = `0.0 0.0 0.0 0.0 0.0 0.0 0.0 0.0 0.1 0.5 1.4 3.0 5.1 7.5
0.0 0.0 0.0 0.0 0.0 0.0 0.1 0.3 0.6 1.3 2.4 3.8 5.7 7.8
0.0 0.0 0.0 0.0 0.0 0.1 0.4 0.8 1.4 2.2 3.3 4.7 6.4 8.3
0.0 0.0 0.0 0.0 0.1 0.2 0.8 1.3 2.0 2.9 4.0 5.4 7.0 8.8
0.0 0.0 0.0 0.0 0.1 0.4 1.1 1.7 2.5 3.4 4.6 6.0 7.5 9.2
0.0 0.0 0.0 0.1 0.3 0.9 1.8 2.5 3.4 4.4 5.5 6.8 8.3 9.9
0.0 0.0 0.1 0.3 0.6 1.3 2.4 3.2 4.1 5.1 6.3 7.6 9.0 10.5
0.0 0.0 0.3 0.6 1.2 2.1 3.4 4.2 5.2 6.2 7.4 8.6 10.0 11.4
0.0 0.1 0.5 1.0 1.7 2.8 4.2 5.1 6.0 7.0 8.2 9.4 10.7 12.1
0.0 0.2 0.8 1.4 2.2 3.4 4.9 5.7 6.7 7.7 8.8 9.9 11.2 12.5
0.1 0.3 1.1 1.7 2.7 3.9 5.4 6.2 7.2 8.2 9.2 10.4 11.6 12.8
0.1 0.4 1.3 2.1 3.0 4.3 5.8 6.6 7.6 8.5 9.6 10.7 11.8 13.0
0.1 0.6 1.6 2.4 3.4 4.6 6.1 7.0 7.9 8.8 9.8 10.9 12.0 13.2
0.2 0.7 1.8 2.6 3.7 4.9 6.4 7.2 8.1 9.1 10.0 11.1 12.1 13.3
0.2 0.8 2.0 2.8 3.9 5.2 6.6 7.5 8.3 9.2 10.2 11.2 12.2 13.3
0.3 0.9 2.2 3.0 4.1 5.4 6.8 7.6 8.4 9.3 10.2 11.2 12.2 13.3
0.4 1.0 2.3 3.2 4.3 5.5 7.0 7.7 8.5 9.4 10.3 11.2 12.2 13.3
0.4 1.2 2.5 3.4 4.4 5.7 7.1 7.8 8.6 9.4 10.3 11.2 12.2 13.3
0.5 1.3 2.6 3.5 4.6 5.8 7.1 7.9 8.6 9.4 10.3 11.2 12.2 13.3`.split('\n').map((row) => row.split(' '));
/** s 83A-315.09(2): the base and additional percentages, in the order of PERIODS (items 19 down to 1). */
const BASE = [['7.5', '1.0'], ['7.8', '0.9'], ['8.3', '0.9'], ['8.8', '0.9'], ['9.2', '0.9'], ['9.9', '0.8'], ['10.5', '0.8'],
  ['11.4', '0.8'], ['12.1', '0.7'], ['12.5', '0.7'], ['12.8', '0.7'], ['13.0', '0.6'], ['13.2', '0.6'], ['13.3', '0.6'],
  ['13.3', '0.6'], ['13.3', '0.6'], ['13.3', '0.5'], ['13.3', '0.5'], ['13.3', '0.5']];
/** The first day the 2021 regulations value a right on: income years from 1 April 2021 (s 1000-1.02). */
const FIRST_DAY = '2021-07-01';

/** @param {string} text */
const percent = (text) => div(lit(text), int(100));

/** The table's percentage of the exercise price for a calculation percentage and an exercise period row, and the
 * section that gives it. @param {Dec} calculation @param {number} row @returns {[string, Dec]} */
function tableRate(calculation, row) {
  if (cmp(calculation, int(50)) < 0) return ['s 83A-315.05 step 2', int(0)];
  if (cmp(calculation, int(110)) < 0) {
    const column = COLUMNS.findIndex((top) => cmp(calculation, lit(top)) <= 0);
    return ['s 83A-315.08', percent(/** @type {string} */ (/** @type {string[]} */ (TABLE.at(row)).at(column)))];
  }
  const excess = quantize(sub(calculation, int(110)), 0, 'down');
  const [base, additional] = /** @type {string[]} */ (BASE.at(row));
  return ['s 83A-315.09', add(percent(base), mul(excess, percent(additional)))];
}

/**
 * A right's value on `day` under the regulations, totals for the parcel: `share` is the market value of the shares
 * the rights may acquire and `exercise` the lowest total to exercise them. The greater of the intrinsic value and the
 * table value (s 83A-315.02(1)), and its working with each amount to the cent.
 * @param {Dec} share @param {Dec} exercise @param {number} day @param {number} last @param {number} acquired
 * @returns {[Dec, Record<string, unknown>]}
 */
export function rightValue(share, exercise, day, last, acquired) {
  if (day < on(FIRST_DAY)) {
    refuse('ess_discount.valuation_unavailable', `The 2021 regulations' tables value a right only on a day from ${FIRST_DAY} `
      + `(s 1000-1.02); the Income Tax Assessment Regulations 1997 governed ${dateText(day)} and are not applied: `
      + "give the right's market value.");
  }
  // s 83A-315.01(1): a right that must be exercised within 15 years after the day it was acquired.
  const within = last >= day && last <= addMonths(acquired, 180);
  const row = within ? PERIODS.findIndex((months) => last <= addMonths(day, months)) : -1;
  if (row < 0) {
    refuse('ess_discount.valuation_unavailable', 'The regulations value a right whose last exercise day is on or after the '
      + "valuation day and within 15 years after acquisition (s 83A-315.01(1)): give the right's market value.");
  }
  if (exercise.c === 0n) return [share, { rule: 's 83A-315.03', value: shown(share) }];
  const calculation = div(mul(share, int(100)), exercise);
  const [rule, rate] = tableRate(calculation, row);
  const tabled = mul(exercise, rate);
  const intrinsic = sub(share, exercise);
  const value = cmp(tabled, intrinsic) > 0 ? tabled : intrinsic;
  return [value, {
    rule, calculation_percentage: str(calculation), exercise_period_months_up_to: PERIODS.at(row),
    intrinsic_value: shown(intrinsic), table_value: shown(tabled), value: shown(value),
  }];
}
