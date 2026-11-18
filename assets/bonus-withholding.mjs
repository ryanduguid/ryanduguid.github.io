// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// PAYG withholding from a pay that includes a back payment, commission, bonus or similar payment,
// by the methods of the Commissioner's Schedule 5 (Tax table for back payments, commissions,
// bonuses and similar payments) for payments made from 1 July 2026, published 17 June 2026 and
// read 19 November 2026. The 'relevant tax table' at each step is the 2026-27 Schedule 1 amount,
// plus the Schedule 8 component for a study and training support loan, from payg-withholding.mjs.
import { cents, number } from './money.mjs';
import { PAYS, WITHHOLDING_YEAR, withholding } from './payg-withholding.mjs';
import { takeHomePay } from './take-home-pay.mjs';

/** The income year of the schedules this module applies. */
export const BONUS_YEAR = WITHHOLDING_YEAR;

// The most pays a financial year can hold, so the most earlier pays a Method B(i) back payment can
// cover is one fewer. Schedule 5's 'Pay periods per financial year' stay 52, 26 and 12 regardless.
const MOST_PAYS = /** @type {Record<string, number>} */ ({ week: 53, fortnight: 27, month: 12 });

/**
 * @typedef {{period: string, residency: string, studyLoan: boolean, method: string, earnings: string,
 *   additional: string, spread: string, backPays: string, backEarnings: string, backEach: string,
 *   backWithheld: string, yearToDate: string, paysToDate: string, earlierAdditional: string,
 *   earlierWithheld: string}} Bonus
 * @typedef {{tax: number, studyLoan: number, total: number}} Table
 */

/** A count from `low` to `high`. @param {string} value @param {number} low @param {number} high */
const count = (value, low, high) => number(value, { min: low, max: high, integer: true });
/** Whole dollars, cents ignored, as cents. @param {number} amount cents */
const dollarsOnly = (amount) => Math.floor(amount / 100) * 100;
/** @param {Table} high @param {Table} low @param {number} times */
const extra = (high, low, times) => ({ tax: (high.tax - low.tax) * times, studyLoan: (high.studyLoan - low.studyLoan) * times,
  total: (high.total - low.total) * times });
/** The lesser of `amount` and 47% of `additional`, cents ignored and a negative result nil, in whole
 * dollars ('Withholding limit'). @param {number} amount cents @param {number} additional cents */
const limited = (amount, additional) => Math.floor(Math.max(0, Math.min(amount, (additional * 47) / 100)) / 100);

/** Withholding from one pay of `earnings` (excluding additional payments) and the additional
 * payments in it, for a resident claiming the tax-free threshold (scale 2) or a foreign resident
 * (scale 3) paid each week, fortnight or month. Method A spreads `additional` over `spread` pays
 * (the pays in a year, or fewer for a commission or bonus for a defined period of less than 12
 * months), cents ignored at steps 1 and 3, and limits the result to 47% of the payment. Method B
 * takes a back payment for earlier pays this year by B(i), each of `backPays` pays recalculated on
 * its earnings plus its share less what was withheld from it, and any other `additional` payment by
 * B(ii): averaged with the earlier B(ii) payments this year over the pays in a year and added to the
 * average total earnings to date, which include this pay's B(i) back payment, less what earlier
 * B(ii) payments had withheld, limited to 47%. A negative result is nil ('Available methods').
 * With Method A the result also gives the tax and study loan repayment the payment adds to the
 * year, were this pay the payee's earnings all year, from take-home-pay.mjs.
 * @param {Bonus} b */
export function bonusWithholding(b) {
  if (!Object.hasOwn(PAYS, b.period)) throw new Error('Choose weekly, fortnightly or monthly pay.');
  if (!['resident', 'foreign'].includes(b.residency)) {
    throw new Error('Choose an Australian resident claiming the tax-free threshold or a foreign resident.');
  }
  if (typeof b.studyLoan !== 'boolean') throw new Error('Say whether the payee has a study or training loan.');
  if (!['A', 'B'].includes(b.method)) throw new Error('Choose Method A or Method B.');
  const pays = PAYS[b.period];
  const scale = b.residency === 'resident' ? 2 : 3;
  /** @param {number} amount cents @returns {Table} */
  const table = (amount) => withholding(amount, b.period, scale, b.studyLoan);
  const earnings = cents(b.earnings);
  const additional = cents(b.additional);
  if (b.method === 'A') {
    if (!additional) throw new Error('Enter the additional payment.');
    const spread = count(b.spread, 2, pays);
    const step1 = dollarsOnly(earnings);
    const step2 = table(step1);
    const step3 = dollarsOnly(additional / spread);
    const step5 = table(step1 + step3);
    const step7 = extra(step5, step2, spread);
    const onAdditional = limited(step7.total * 100, additional);
    const yearPay = { year: BONUS_YEAR, residency: b.residency, period: 'year', includesSuper: false, sacrifice: '0',
      studyLoan: b.studyLoan, hospitalCover: true };
    const owed = (/** @type {number} */ salary) => {
      const r = takeHomePay({ ...yearPay, salary: (salary / 100).toFixed(2) });
      return Math.round(r.salary * 100) - Math.round(r.net * 100);
    };
    const year = earnings * pays;
    return { method: 'A', spread, step1: step1 / 100, step2, step3: step3 / 100, step4: (step1 + step3) / 100, step5, step7,
      limit: Math.floor((additional * 47) / 100) / 100, onAdditional, onEarnings: step2.total,
      total: step2.total + onAdditional, yearTax: (owed(year + additional) - owed(year)) / 100 };
  }
  const backPays = count(b.backPays, 0, MOST_PAYS[b.period] - 1);
  const backEach = cents(b.backEach);
  if (!backPays && !additional) throw new Error('Enter a back payment for earlier pays this year or another additional payment.');
  const base = table(earnings);
  let methodBi = null;
  if (backPays) {
    if (!backEach) throw new Error('Enter the back payment for each earlier pay.');
    const before = cents(b.backEarnings);
    const recalculated = table(before + backEach);
    const each = recalculated.total * 100 - cents(b.backWithheld);
    methodBi = { pays: backPays, each: backEach / 100, earnings: (before + backEach) / 100, recalculated,
      onBackPayment: Math.max(0, each * backPays) / 100 };
  }
  let methodBii = null;
  const backPayment = backEach * backPays;
  if (additional) {
    const paysToDate = count(b.paysToDate, 1, MOST_PAYS[b.period]);
    const toDate = cents(b.yearToDate);
    if (toDate < earnings) throw new Error('Enter normal earnings to date that include this pay.');
    const step1 = dollarsOnly((toDate + backPayment) / paysToDate);
    const step2 = table(step1);
    const step3 = dollarsOnly((cents(b.earlierAdditional) + additional) / pays);
    const step5 = table(step1 + step3);
    const step7 = extra(step5, step2, pays);
    const step8 = step7.total * 100 - cents(b.earlierWithheld);
    methodBii = { step1: step1 / 100, step2, step3: step3 / 100, step4: (step1 + step3) / 100, step5, step7,
      step8: step8 / 100, limit: Math.floor((additional * 47) / 100) / 100, onAdditional: limited(step8, additional) };
  }
  const onAdditional = Math.round(((methodBi?.onBackPayment ?? 0) * 100 + (methodBii?.onAdditional ?? 0) * 100)) / 100;
  return { method: 'B', base, methodBi, methodBii, onEarnings: base.total, onAdditional,
    total: Math.round(base.total * 100 + onAdditional * 100) / 100 };
}
