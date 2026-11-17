// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Income tax for one individual for a full income year: the basic tax on taxable income, the
// low income tax offset and the Medicare levy of a single person with no dependants. Each rate
// and threshold is the Act's, cited beside its table. Whole-dollar income times a whole per cent
// is whole cents; the offset alone can have half a cent, which rounds up.
import { number } from './money.mjs';

/** The income years these tables cover, newest first. */
export const INCOME_TAX_YEARS = ['2026-27', '2025-26', '2024-25'];

// Income Tax Rates Act 1986, Compilation No. 66 (1 July 2026), read 17 November 2026: each band
// as [the whole dollars it starts above, its rate per cent]. Schedule 7 Part I clause 1, the tables
// for the 2024-25 or 2025-26 and the 2026-27 years of income, above the tax-free threshold of
// $18,200 (s 3(1)).
/** @type {Record<string, number[][]>} */
export const RESIDENT_SCALES = {
  '2026-27': [[18200, 15], [45000, 30], [135000, 37], [190000, 45]],
  '2025-26': [[18200, 16], [45000, 30], [135000, 37], [190000, 45]],
  '2024-25': [[18200, 16], [45000, 30], [135000, 37], [190000, 45]],
};
// Part II clause 1, the table for 2024-25 or a later year: the second and third resident personal
// tax rates (30% and 37%, items 2 and 3 of Part I) to $135,000 and $190,000, then 45%.
const FOREIGN_SCALE = [[0, 30], [135000, 37], [190000, 45]];
// Part III clause 1, the table for 2024-25 or a later year, on working holiday taxable income.
const WORKING_HOLIDAY_SCALE = [[0, 15], [45000, 30], [135000, 37], [190000, 45]];

// Medicare Levy Act 1986 s 3(1): [threshold amount, phase-in limit] for a person not entitled to
// the seniors and pensioners offset. 2024-25 is the ATO's 2025 return instructions (the Act as
// amended by Act No. 28, 2025); 2025-26 is Compilation No. 53 (1 July 2026), as amended by Act
// No. 58, 2026, read 17 November 2026, and 2026-27 takes the same figures until the Act changes.
/** @type {Record<string, number[]>} */
export const MEDICARE_THRESHOLDS = { '2026-27': [28011, 35013], '2025-26': [28011, 35013], '2024-25': [27222, 34027] };

const RESIDENCY = ['resident', 'foreign', 'working-holiday'];

/** @param {string} year */
export function incomeYear(year) {
  if (!INCOME_TAX_YEARS.includes(year)) throw new Error('Choose an income year from 2024-25 to 2026-27.');
  return year;
}

/** Whole dollars from 0 to $1 billion, as an amount field takes them.
 * @param {string} value */
export const wholeDollars = (value) => number(value, { max: 1e9, integer: true, money: true });

/** Tax in cents on `income` whole dollars by `scale`: dollars times a whole per cent are cents.
 * @param {number} income @param {number[][]} scale */
const scaleTax = (income, scale) => scale.reduce((tax, [over, rate], index) => {
  const top = index + 1 < scale.length ? Math.min(income, scale[index + 1][0]) : income;
  return tax + Math.max(0, top - over) * rate;
}, 0);

/** ITAA 1997 s 61-115(1), Compilation No. 268 (1 October 2026): $700 to $37,500, less 5% of the
 * excess to $45,000, then $325 less 1.5% of the excess over $45,000, nil from $66,667. Worked in
 * tenths of a cent and rounded half up to the cent; at $66,667 the table gives minus half a
 * cent, which is nil.
 * @param {number} income whole dollars @returns {number} cents */
function lowIncomeOffset(income) {
  let tenths = 0;
  // $700 is 700,000 tenths of a cent; 5% of a dollar is 50 tenths and 1.5% is 15.
  if (income <= 37500) tenths = 700000;
  else if (income <= 45000) tenths = 700000 - (income - 37500) * 50;
  else if (income <= 66667) tenths = Math.max(0, 325000 - (income - 45000) * 15);
  return Math.floor((tenths + 5) / 10);
}

/** Medicare Levy Act 1986 ss 6(1) and 7: nil to the threshold amount, then the lesser of 2% of
 * taxable income and 10% of the excess over the threshold amount.
 * @param {number} income whole dollars @param {string} year @returns {number} cents */
function medicareLevy(income, year) {
  const [threshold] = MEDICARE_THRESHOLDS[year];
  return income <= threshold ? 0 : Math.min(income * 2, (income - threshold) * 10);
}

/** One full year's tax on `taxableIncome`. A resident pays the Part I rates, gets the low income
 * tax offset (s 61-110(1)) and pays the Medicare levy; a foreign resident pays the Part II rates;
 * a working holiday maker, taken as a foreign resident with all of their taxable income working
 * holiday taxable income, pays the Part III rates. Foreign residents pay no Medicare levy (ATO:
 * Tax rates – foreign resident, last updated 1 June 2026). The offset cannot take the tax below
 * nil (ATO: Low income tax offset, last updated 8 June 2026).
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
  const scale = resident ? RESIDENT_SCALES[year] : residency === 'foreign' ? FOREIGN_SCALE : WORKING_HOLIDAY_SCALE;
  const tax = scaleTax(income, scale);
  const offset = resident ? Math.min(tax, lowIncomeOffset(income)) : 0;
  const medicare = resident ? medicareLevy(income, year) : 0;
  return { tax: tax / 100, offset: offset / 100, netTax: (tax - offset) / 100, medicare: medicare / 100,
    total: (tax - offset + medicare) / 100 };
}
