// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// PAYG withholding from one regular pay for payments made from 1 July 2026, under the
// Commissioner's Schedule 1 (Statement of formulas for calculating amounts to be withheld) and
// Schedule 8 (study and training support loans components), as the ATO published them on
// 17 June 2026 and they were read on 18 November 2026. Earlier years' schedules are not here.

/** The income year these schedules apply to. */
export const WITHHOLDING_YEAR = '2026-27';

// Each row is [weekly earnings x less than, in whole dollars (0 for the top row), a, b], with a and
// b times 10,000 so the formula y = ax − b is exact in integers. Schedule 1, 'Coefficients to use in
// formulas for withholding from weekly payments': scale 2 (tax-free threshold claimed) has none
// below $362, so nothing is withheld there; scale 3 is for foreign residents.
/** @type {Record<string, number[][]>} */
const SCHEDULE_1 = {
  2: [[362, 0, 0], [538, 1500, 543462], [673, 2500, 1082135], [721, 1700, 543473], [865, 1790, 608377],
    [1282, 3227, 1851935], [2596, 3200, 1817319], [3653, 3900, 3634627], [0, 4700, 6557704]],
  3: [[2596, 3000, 3000], [3653, 3700, 1817308], [0, 4500, 4740385]],
};
// Schedule 8, 'Study and training support loans component rates', tax-free threshold claimed or
// foreign resident: 15% and 17% of the weekly earnings above the 2026-27 thresholds, then 10%.
const SCHEDULE_8 = [[1337, 0, 0], [2494, 1500, 2005615], [3577, 1700, 2504527], [0, 1000, 0]];

/** Pays in a year for each period this module works. */
export const PAYS = /** @type {Record<string, number>} */ ({ week: 52, fortnight: 26, month: 12 });

/** The rounded weekly amount for x in cents (whole dollars plus 99 cents): y = ax − b to the nearest
 * dollar, 50 cents up, with no preliminary rounding ('Using a formula'), never below nil.
 * @param {number[][]} rows @param {number} x cents @returns {number} whole dollars */
function weekly(rows, x) {
  const [, a, b] = /** @type {number[]} */ (rows.find(([limit]) => limit === 0 || x < limit * 100));
  // a × x is in millionths of a dollar (a times 10^4, x in cents); b times 10^4 is b × 100 of them.
  const millionths = a * x - b * 100;
  return Math.max(0, Math.floor((millionths + 500000) / 1000000));
}

/** The weekly earnings x for one pay of `earnings` cents ('Working out the weekly earnings'):
 * the pay, half a fortnight's, or 3/13 of a month's (an amount ending in 33 cents gaining a cent
 * first), with cents ignored and 99 cents added. @param {number} earnings @param {string} period */
function weeklyEarnings(earnings, period) {
  const monthly = earnings % 100 === 33 ? earnings + 1 : earnings;
  const dollars = period === 'week' ? Math.floor(earnings / 100) : period === 'fortnight'
    ? Math.floor(earnings / 200) : Math.floor((monthly * 3) / 1300);
  return dollars * 100 + 99;
}

/** The weekly amount for the pay: twice it for a fortnight, 13/3 of it to the nearest dollar for a
 * month. @param {number} amount whole dollars @param {string} period */
const forPeriod = (amount, period) => (period === 'week' ? amount : period === 'fortnight'
  ? 2 * amount : Math.floor((2 * amount * 13 + 3) / 6));

/** The amount to withhold from one pay of `earnings` cents paid each `period` ('week',
 * 'fortnight' or 'month'), on scale 2 or 3, and the study and training support loans component
 * Schedule 8 adds when the payee has a loan, each in whole dollars.
 * @param {number} earnings cents @param {string} period @param {number} scale 2 or 3
 * @param {boolean} studyLoan */
export function withholding(earnings, period, scale, studyLoan) {
  if (!Object.hasOwn(PAYS, period)) throw new Error('Choose weekly, fortnightly or monthly pay.');
  const rows = SCHEDULE_1[scale];
  if (!rows) throw new Error('Choose scale 2 or scale 3.');
  if (!Number.isInteger(earnings) || earnings < 0) throw new Error('Enter the pay in whole cents.');
  const x = weeklyEarnings(earnings, period);
  const tax = forPeriod(weekly(rows, x), period);
  const loan = studyLoan ? forPeriod(weekly(SCHEDULE_8, x), period) : 0;
  return { tax, studyLoan: loan, total: tax + loan };
}
