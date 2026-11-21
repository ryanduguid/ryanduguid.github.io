// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Income tax for one individual for a full income year: the basic tax on taxable income, the
// low income tax offset, the low and middle income tax offset, the Medicare levy of a single
// person with no dependants and the Medicare levy surcharge. Each rate and threshold is the Act's,
// cited beside its table. Amounts are worked in tenths of a cent, where whole-dollar income times
// a rate to one decimal place per cent is exact, and each amount rounds half up to the cent.
import { number } from './money.mjs';

/** The income years these tables cover, newest first. */
export const INCOME_TAX_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21'];

// Income Tax Rates Act 1986, Compilation No. 66 (1 July 2026), read 17 November 2026: each band
// as [the whole dollars it starts above, its rate per cent]. Schedule 7 Part I clause 1, the tables
// for the 2024-25 or 2025-26 and the 2026-27 years of income, above the tax-free threshold of
// $18,200 (s 3(1)). 2020-21 to 2023-24: the ATO's 'Tax rates – Australian resident' (last updated
// 13 August 2026), read 18 November 2026: 19% to $45,000, 32.5% to $120,000, 37% to $180,000.
/** @type {Record<string, number[][]>} */
export const RESIDENT_SCALES = {
  '2026-27': [[18200, 15], [45000, 30], [135000, 37], [190000, 45]],
  '2025-26': [[18200, 16], [45000, 30], [135000, 37], [190000, 45]],
  '2024-25': [[18200, 16], [45000, 30], [135000, 37], [190000, 45]],
  '2023-24': [[18200, 19], [45000, 32.5], [120000, 37], [180000, 45]],
  '2022-23': [[18200, 19], [45000, 32.5], [120000, 37], [180000, 45]],
  '2021-22': [[18200, 19], [45000, 32.5], [120000, 37], [180000, 45]],
  '2020-21': [[18200, 19], [45000, 32.5], [120000, 37], [180000, 45]],
};
// Part II clause 1, the table for 2024-25 or a later year: the second and third resident personal
// tax rates (30% and 37%, items 2 and 3 of Part I) to $135,000 and $190,000, then 45%. Before
// 2024-25, the ATO's 'Tax rates – foreign resident' (last updated 1 June 2026), read 18 November 2026.
const FOREIGN_SCALE = [[0, 30], [135000, 37], [190000, 45]];
const FOREIGN_SCALE_TO_2023_24 = [[0, 32.5], [120000, 37], [180000, 45]];
// Part III clause 1, the table for 2024-25 or a later year, on working holiday taxable income.
// Before 2024-25, the ATO's 'Tax rates – working holiday maker' (last updated 1 June 2026), read
// 18 November 2026.
const WORKING_HOLIDAY_SCALE = [[0, 15], [45000, 30], [135000, 37], [190000, 45]];
const WORKING_HOLIDAY_SCALE_TO_2023_24 = [[0, 15], [45000, 32.5], [120000, 37], [180000, 45]];
const FROM_2024_25 = ['2026-27', '2025-26', '2024-25'];

// Medicare Levy Act 1986 s 3(1): [threshold amount, phase-in limit] for a person not entitled to
// the seniors and pensioners offset, read 18 November 2026 in the compilation that set each year's
// figures: Compilation No. 53 (1 July 2026, Act No. 58, 2026) for 2025-26, which 2026-27 takes
// until the Act changes; No. 52 (28 March 2025) for 2024-25; No. 50 (6 March 2024) for 2023-24;
// No. 49 (24 June 2023) for 2022-23; No. 48 (1 April 2022) for 2021-22; No. 47 (30 June 2021) for
// 2020-21. Section 8D(3)(c) uses each year's threshold amount too.
/** @type {Record<string, number[]>} */
export const MEDICARE_THRESHOLDS = {
  '2026-27': [28011, 35013], '2025-26': [28011, 35013], '2024-25': [27222, 34027], '2023-24': [26000, 32500],
  '2022-23': [24276, 30345], '2021-22': [23365, 29206], '2020-21': [23226, 29032],
};

// Private Health Insurance Act 2007 ss 22-35 and 22-45 (Compilation No. 42, 19 September 2026),
// read 18 November 2026: the singles tier 1, 2 and 3 thresholds, indexed from 2023-24. Figures
// from the ATO's 'Medicare levy surcharge income, thresholds and rates' (last updated 22 June
// 2026) for 2022-23 to 2026-27, and its 2021 return instructions for 2020-21, read 18 November 2026.
/** @type {Record<string, number[]>} */
export const SURCHARGE_THRESHOLDS = {
  '2026-27': [105000, 123000, 164000], '2025-26': [101000, 118000, 158000], '2024-25': [97000, 113000, 151000],
  '2023-24': [93000, 108000, 144000], '2022-23': [90000, 105000, 140000], '2021-22': [90000, 105000, 140000],
  '2020-21': [90000, 105000, 140000],
};

const RESIDENCY = ['resident', 'foreign', 'working-holiday'];

/** @param {string} year */
export function incomeYear(year) {
  if (!INCOME_TAX_YEARS.includes(year)) throw new Error('Choose an income year from 2020-21 to 2026-27.');
  return year;
}

/** Whole dollars from 0 to $1 billion, as an amount field takes them.
 * @param {string} value */
export const wholeDollars = (value) => number(value, { max: 1e9, integer: true, money: true });

/** Tenths of a cent to cents, half up. @param {number} tenths */
const halfUp = (tenths) => Math.floor((tenths + 5) / 10);

/** Tax in tenths of a cent on `income` whole dollars by `scale`: dollars times a rate per cent to
 * one decimal place are tenths of a cent.
 * @param {number} income @param {number[][]} scale */
const scaleTax = (income, scale) => scale.reduce((tax, [over, rate], index) => {
  const top = index + 1 < scale.length ? Math.min(income, scale[index + 1][0]) : income;
  return tax + Math.max(0, top - over) * Math.round(rate * 10);
}, 0);

/** ITAA 1997 s 61-115(1), Compilation No. 268 (1 October 2026), for 2020-21 and later years
 * (s 61-110(1)): $700 to $37,500, less 5% of the excess to $45,000, then $325 less 1.5% of the
 * excess over $45,000, nil from $66,667. At $66,667 the table gives minus half a cent, which is nil.
 * @param {number} income whole dollars @returns {number} tenths of a cent */
function lowIncomeOffset(income) {
  // $700 is 700,000 tenths of a cent; 5% of a dollar is 50 tenths and 1.5% is 15.
  if (income <= 37500) return 700000;
  if (income <= 45000) return 700000 - (income - 37500) * 50;
  if (income <= 66667) return Math.max(0, 325000 - (income - 45000) * 15);
  return 0;
}

/** ITAA 1997 ss 61-105 and 61-107, Compilation No. 233 (22 June 2022), read 18 November 2026, for
 * 2020-21 and 2021-22 only: $255 to $37,000, plus 7.5% of the excess to $48,000, $1,080 to $90,000,
 * then $1,080 less 3% of the excess, with no offset above $126,000. Section 61-107(1A) adds $420
 * for 2021-22 unless the income is $126,000, so at $126,000 the offset is nil. The ATO's table on
 * 'Low and middle income earner tax offsets' gives $1,500 less 3 cents a dollar to $126,000, which
 * is $420 there; the Act wins.
 * @param {number} income whole dollars @param {string} year @returns {number} tenths of a cent */
function lowAndMiddleIncomeOffset(income, year) {
  if (!['2020-21', '2021-22'].includes(year) || income > 126000) return 0;
  // 7.5% of a dollar is 75 tenths of a cent and 3% is 30.
  let tenths = 1080000;
  if (income <= 37000) tenths = 255000;
  else if (income <= 48000) tenths = 255000 + (income - 37000) * 75;
  else if (income > 90000) tenths = 1080000 - (income - 90000) * 30;
  return tenths + (year === '2021-22' && income !== 126000 ? 420000 : 0);
}

/** Medicare Levy Act 1986 ss 6(1) and 7: nil to the threshold amount, then the lesser of 2% of
 * taxable income and 10% of the excess over the threshold amount.
 * @param {number} income whole dollars @param {string} year @returns {number} cents */
function medicareLevy(income, year) {
  const [threshold] = MEDICARE_THRESHOLDS[year];
  return income <= threshold ? 0 : Math.min(income * 2, (income - threshold) * 10);
}

/** One full year's tax on `taxableIncome`. A resident pays the Part I rates, gets the low income
 * tax offset (s 61-110(1)) and, for 2020-21 and 2021-22, the low and middle income tax offset
 * (s 61-105(1)), and pays the Medicare levy; a foreign resident pays the Part II rates; a working
 * holiday maker, taken as a foreign resident with all of their taxable income working holiday
 * taxable income, pays the Part III rates. Foreign residents pay no Medicare levy (ATO: Tax rates –
 * foreign resident, last updated 1 June 2026). The offsets cannot take the tax below nil (ATO: Low
 * income tax offset, last updated 8 June 2026); the low income tax offset is applied first.
 * @param {string} taxableIncome whole dollars
 * @param {string} year an income year in INCOME_TAX_YEARS
 * @param {string} residency 'resident', 'foreign' or 'working-holiday' */
export function incomeTax(taxableIncome, year, residency) {
  incomeYear(year);
  if (!RESIDENCY.includes(residency)) {
    throw new Error('Choose Australian resident, foreign resident or working holiday maker.');
  }
  const income = wholeDollars(taxableIncome);
  const resident = residency === 'resident';
  const current = FROM_2024_25.includes(year);
  const scale = resident ? RESIDENT_SCALES[year] : residency === 'foreign'
    ? (current ? FOREIGN_SCALE : FOREIGN_SCALE_TO_2023_24)
    : (current ? WORKING_HOLIDAY_SCALE : WORKING_HOLIDAY_SCALE_TO_2023_24);
  const tax = halfUp(scaleTax(income, scale));
  const offset = resident ? Math.min(tax, halfUp(lowIncomeOffset(income))) : 0;
  const lmito = resident ? Math.min(tax - offset, halfUp(lowAndMiddleIncomeOffset(income, year))) : 0;
  const medicare = resident ? medicareLevy(income, year) : 0;
  return { tax: tax / 100, offset: offset / 100, lmito: lmito / 100, netTax: (tax - offset - lmito) / 100,
    medicare: medicare / 100, total: (tax - offset - lmito + medicare) / 100 };
}

/** The days in the income year that starts on 1 July of its first year. @param {string} year */
export const daysInYear = (year) => {
  const end = Number(year.slice(0, 4)) + 1;
  return end % 4 === 0 && (end % 100 !== 0 || end % 400 === 0) ? 366 : 365;
};

/**
 * @typedef {{year: string, taxable: number, fringe: number, super: number, losses: number,
 *   spouse: number | null, children: number, uncoveredDays: number}} Surcharge
 */

/** The Medicare levy surcharge of a resident for the days that they, or for a family their spouse
 * or a dependant, had no private patient hospital cover. Income for surcharge purposes is ITAA
 * 1997 s 995-1's: taxable income, reportable fringe benefits, reportable super contributions and
 * total net investment loss, each in whole dollars. A single person (Medicare Levy Act 1986 s 8B)
 * tests it against the singles tier 1 threshold; a person with dependants and no spouse (s 8C)
 * against the family tier 1 threshold; a person with a spouse all year (s 8D(3)) tests the couple's
 * combined income against the family tier 1 threshold and pays nothing unless their own exceeds the
 * year's threshold amount. Family thresholds double the singles thresholds and rise by $1,500 for
 * each dependent child after the first (Private Health Insurance Act 2007 s 22-40). The tier, from
 * the same income (combined for a couple, s 22-30(2)), sets the rate: 1%, 1.25% or 1.5% (Medicare
 * Levy Act 1986 s 8B(3) and (4)). The rate applies to taxable income under that Act and to
 * reportable fringe benefits under the A New Tax System (Medicare Levy Surcharge-Fringe Benefits)
 * Act 1999 ss 12, 13 and 15, times the uncovered days over the days in the year, rounded half up to the cent.
 * @param {Surcharge} s @returns {{income: number, threshold: number, rate: number, surcharge: number}} */
export function medicareLevySurcharge(s) {
  incomeYear(s.year);
  const days = daysInYear(s.year);
  if (!Number.isInteger(s.uncoveredDays) || s.uncoveredDays < 0 || s.uncoveredDays > days) {
    throw new Error(`Enter the days without hospital cover as a whole number from 0 to ${days}.`);
  }
  if (!Number.isInteger(s.children) || s.children < 0 || s.children > 20) {
    throw new Error('Enter the dependent children as a whole number from 0 to 20.');
  }
  const income = s.taxable + s.fringe + s.super + s.losses;
  const family = s.spouse !== null || s.children > 0;
  const tested = income + (s.spouse ?? 0);
  const [first, second, third] = SURCHARGE_THRESHOLDS[s.year]
    .map((amount) => (family ? 2 * amount + 1500 * Math.max(0, s.children - 1) : amount));
  const liable = tested > first && (s.spouse === null || income > MEDICARE_THRESHOLDS[s.year][0]);
  // The rate in hundredths of a per cent: 1% of a dollar is a cent.
  const hundredths = !liable ? 0 : tested > third ? 150 : tested > second ? 125 : 100;
  const numerator = (s.taxable + s.fringe) * hundredths * s.uncoveredDays;
  const denominator = 100 * days;
  return { income, threshold: first, rate: hundredths / 100,
    surcharge: Math.floor((2 * numerator + denominator) / (2 * denominator)) / 100 };
}
