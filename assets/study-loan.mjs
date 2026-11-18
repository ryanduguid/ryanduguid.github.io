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
// 2024-25 (s 154-20 before that Act, HESA Compilation No. 98, C2025C00368, in force on 30 June 2025,
// with Division 154 as in Compilation No. 93 in force on 1 July 2024; read 18 November 2026): one rate
// per cent of the whole repayment income, from the band it falls in, [the whole dollars a band starts
// at, its rate per cent]. Each amount is the Act's 2019-20 amount indexed under s 154-25: times the
// sum of the 4 quarterly CPI index numbers to December 2023 over the sum to December 2018 (537.7 /
// 453.2, ABS series 6401.0 on the 2011-12 base), rounded down. That gives Table 3 of the same ATO page.
/** @type {Record<string, {minimum: number, top?: number, bands?: number[][]}>} */
export const STUDY_LOAN_YEARS = {
  '2026-27': { minimum: 69528, top: 129717 },
  '2025-26': { minimum: 67000, top: 125000 },
  '2024-25': { minimum: 54434, bands: [[54435, 1], [62851, 2], [66621, 2.5], [70619, 3], [74856, 3.5], [79347, 4],
    [84108, 4.5], [89155, 5], [94504, 5.5], [100175, 6], [106186, 6.5], [112557, 7], [119310, 7.5], [126468, 8],
    [134057, 8.5], [142101, 9], [150627, 9.5], [159664, 10]] },
  // 2020-21 to 2023-24, the same rule: Tables 4 to 7 of the same ATO page, read 18 November 2026.
  '2023-24': { minimum: 51549, bands: [[51550, 1], [59519, 2], [63090, 2.5], [66876, 3], [70889, 3.5], [75141, 4],
    [79650, 4.5], [84430, 5], [89495, 5.5], [94866, 6], [100558, 6.5], [106591, 7], [112986, 7.5], [119765, 8],
    [126951, 8.5], [134569, 9], [142643, 9.5], [151201, 10]] },
  '2022-23': { minimum: 48360, bands: [[48361, 1], [55837, 2], [59187, 2.5], [62739, 3], [66503, 3.5], [70493, 4],
    [74723, 4.5], [79207, 5], [83959, 5.5], [88997, 6], [94337, 6.5], [99997, 7], [105997, 7.5], [112356, 8],
    [119098, 8.5], [126244, 9], [133819, 9.5], [141848, 10]] },
  '2021-22': { minimum: 47013, bands: [[47014, 1], [54283, 2], [57539, 2.5], [60992, 3], [64652, 3.5], [68530, 4],
    [72642, 4.5], [77002, 5], [81621, 5.5], [86519, 6], [91710, 6.5], [97213, 7], [103046, 7.5], [109228, 8],
    [115782, 8.5], [122729, 9], [130093, 9.5], [137898, 10]] },
  '2020-21': { minimum: 46619, bands: [[46620, 1], [53827, 2], [57056, 2.5], [60480, 3], [64109, 3.5], [67955, 4],
    [72032, 4.5], [76355, 5], [80936, 5.5], [85793, 6], [90940, 6.5], [96397, 7], [102180, 7.5], [108310, 8],
    [114810, 8.5], [121699, 9], [129000, 9.5], [136740, 10]] },
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
