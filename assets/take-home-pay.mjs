// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Take-home pay from one annual salary: the year's income tax, Medicare levy and study loan
// repayment on that salary, spread evenly over the year, and the employer's super guarantee.
// These are not the amounts an employer withholds each pay under the PAYG withholding schedules.
import { incomeTax, incomeYear, wholeDollars } from './income-tax.mjs';
import { studyLoanRepayment } from './study-loan.mjs';

// The general super guarantee rate per cent and the maximum contribution base for a full year of
// earnings paid evenly. 2026-27: the charge percentage, 12, in s 17A(2) of the Superannuation
// Guarantee (Administration) Act 1992 (Compilation No. 78, 1 July 2026, read 17 November 2026) and
// the annual base of $270,830 under s 10A(5), from the ATO's 'Super guarantee' page (Table 23, last
// updated 17 April 2026). 2025-26 and 2024-25: the rate under s 19 before Payday Super, 12% and
// 11.5% (Table 21), and 4 quarters of the quarterly base, $62,500 and $65,070 (Table 24).
/** @type {Record<string, {rate: number, cap: number}>} */
export const SUPER_GUARANTEE = {
  '2026-27': { rate: 12, cap: 270830 },
  '2025-26': { rate: 12, cap: 250000 },
  '2024-25': { rate: 11.5, cap: 260280 },
};

/** @param {number} numerator @param {number} denominator positive; half up */
const nearest = (numerator, denominator) => Math.floor((2 * numerator + denominator) / (2 * denominator));

/**
 * @typedef {{year: string, residency: string, salary: string, includesSuper: boolean, studyLoan: boolean}} Pay
 */

/** One full year at one salary. With `includesSuper`, `salary` is a package of salary and super
 * guarantee: below the base, super is rate ÷ (100 + rate) of it; above, the base times the rate.
 * Super guarantee is the rate on the salary up to the base. Taxable income is the salary in whole
 * dollars, and repayment income is the same taxable income, with no other part. The year's net pay
 * divides by 12, 26 and 52, each rounded half up to the cent.
 * @param {Pay} pay */
export function takeHomePay(pay) {
  const { rate, cap } = SUPER_GUARANTEE[incomeYear(pay.year)];
  if (typeof pay.includesSuper !== 'boolean') throw new Error('Say whether the salary includes super.');
  if (typeof pay.studyLoan !== 'boolean') throw new Error('Say whether you have a study or training loan.');
  const entered = wholeDollars(pay.salary) * 100;
  // The rate in tenths of a per cent, so 11.5% is 115 of 1,000.
  const tenths = Math.round(rate * 10);
  const capCents = cap * 100;
  let superGuarantee;
  if (!pay.includesSuper) superGuarantee = nearest(Math.min(entered, capCents) * tenths, 1000);
  else if (entered * 1000 <= capCents * (1000 + tenths)) superGuarantee = nearest(entered * tenths, 1000 + tenths);
  else superGuarantee = nearest(capCents * tenths, 1000);
  const salary = pay.includesSuper ? entered - superGuarantee : entered;
  const taxable = String(Math.floor(salary / 100));
  const tax = incomeTax(taxable, pay.year, pay.residency);
  const loan = pay.studyLoan
    ? studyLoanRepayment({ taxable, fringe: '0', losses: '0', super: '0', foreign: '0' }, pay.year).repayment : 0;
  const cents = (/** @type {number} */ value) => Math.round(value * 100);
  const net = salary - cents(tax.total) - cents(loan);
  return { salary: salary / 100, superGuarantee: superGuarantee / 100, tax: tax.tax, offset: tax.offset,
    medicare: tax.medicare, studyLoan: loan, net: net / 100, monthly: nearest(net, 12) / 100,
    fortnightly: nearest(net, 26) / 100, weekly: nearest(net, 52) / 100 };
}
