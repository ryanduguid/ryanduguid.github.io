// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The compulsory study and training loan repayment for one income year, under Division 154 of the
// Higher Education Support Act 2003 (HESA), from repayment income in whole dollars.
import { incomeYear, wholeDollars } from './income-tax.mjs';

// minimum: the minimum repayment income (s 154-10); nothing is repaid at or below it.
// 2025-26 and later (s 154-20 as substituted by the Universities Accord (Cutting Student Debt by
// 20 Per Cent) Act 2025, HESA Compilation No. 105, 17 October 2026, read 17 November 2026): 15% of
// the part above the minimum up to `top`, 17% of the part above `top`, or 10% of the whole repayment
// income if that is less. The 2026-27 amounts are indexed under s 154-25, as the ATO's 'Study and
// training loan repayment thresholds and rates' (last updated 30 June 2026) publishes them.
// 2024-25 (s 154-20 before that Act): one rate per cent of the whole repayment income, from the
// band it falls in, [the whole dollars a band starts at, its rate per cent], from the same ATO page.
/** @type {Record<string, {minimum: number, top?: number, bands?: number[][]}>} */
export const STUDY_LOAN_YEARS = {
  '2026-27': { minimum: 69528, top: 129717 },
  '2025-26': { minimum: 67000, top: 125000 },
  '2024-25': { minimum: 54434, bands: [[54435, 1], [62851, 2], [66621, 2.5], [70619, 3], [74856, 3.5], [79347, 4],
    [84108, 4.5], [89155, 5], [94504, 5.5], [100175, 6], [106186, 6.5], [112557, 7], [119310, 7.5], [126468, 8],
    [134057, 8.5], [142101, 9], [150627, 9.5], [159664, 10]] },
};

/** @typedef {{taxable: string, fringe: string, losses: string, super: string, foreign: string}} RepaymentParts */
const PARTS = ['taxable', 'fringe', 'losses', 'super', 'foreign'];

/** HESA s 154-5(1): taxable income (without an assessable FHSS released amount), total net
 * investment loss, reportable fringe benefits total, exempt foreign income and reportable super
 * contributions, each in whole dollars. Then s 154-20(1)(a) and (b); the cap at the repayable
 * debt, s 154-20(1)(c), needs the debt and is left to the reader. A fraction of a cent (only a
 * 2024-25 half per cent can make one) rounds half up.
 * @param {RepaymentParts} parts @param {string} year */
export function studyLoanRepayment(parts, year) {
  const table = STUDY_LOAN_YEARS[incomeYear(year)];
  if (!PARTS.every((part) => typeof parts?.[/** @type {keyof RepaymentParts} */ (part)] === 'string')) {
    throw new Error('Enter each part of repayment income, 0 if none.');
  }
  const income = PARTS.reduce((sum, part) => sum + wholeDollars(parts[/** @type {keyof RepaymentParts} */ (part)]), 0);
  /** @param {number} cents @param {string} method */
  const result = (cents, method) => ({ repaymentIncome: income, repayment: cents / 100, method });
  if (income <= table.minimum) return result(0, 'nil');
  if (table.bands) {
    const [, rate] = table.bands.findLast(([from]) => income >= from) ?? [0, 0];
    // Dollars times tenths of a per cent are tenths of a cent.
    return result(Math.floor((income * Math.round(rate * 10) + 5) / 10), 'percent-of-income');
  }
  const top = /** @type {number} */ (table.top);
  const marginal = (Math.min(income, top) - table.minimum) * 15 + Math.max(0, income - top) * 17;
  const tenth = income * 10;
  return tenth < marginal ? result(tenth, 'ten-percent') : result(marginal, 'marginal');
}
