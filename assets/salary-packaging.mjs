// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Salary packaging with an FBT-exempt employer for one year: a public benevolent institution or
// health promotion charity, or a public or not-for-profit hospital or public ambulance service
// (Fringe Benefits Tax Assessment Act 1986 s 57A, Compilation No. 97, 1 July 2026, read 19 November
// 2026). The grossed-up benefits above the employer's cap are taxed (s 5B(1D) and (1E)), the
// reportable fringe benefits amount is the benefits' taxable value grossed up at 1 / (1 - 47%)
// (s 135Q), and the employee's tax comes from tax-estimate.mjs, with and without the packaging.
import { daysInYear, wholeDollars } from './income-tax.mjs';
import { cents } from './money.mjs';
import { taxEstimate } from './tax-estimate.mjs';

/** The income years whose FBT years (ending 31 March 2023 to 2027) have the rates and caps here:
 * the ATO's 'Fringe benefits tax - rates and thresholds' (last updated 20 May 2026), read
 * 19 November 2026: FBT 47% and GST 10%. */
export const PACKAGING_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23'];

// Each employer's cap on an employee's grossed-up benefits (s 5B(1E) steps 2 and 3) and the most of
// the salary packaged meal entertainment above it (step 4), in whole dollars; the reporting
// threshold (s 135Q(2)) in cents; the gross-up factors as fractions. Section 5B(1F) grosses up
// Type 1 benefits by (FBT rate + GST rate) / ((1 - FBT rate) x (1 + GST rate) x FBT rate), 0.57 /
// 0.27401, and s 5B(1G) Type 2 benefits by 1 / (1 - FBT rate), 1 / 0.53. The ATO's published
// 2.0802 and 1.8868 round these to 4 places, which can put a total read from them a dollar over
// the cap where the formula leaves it within (read on the ATO legal database 26 November 2026).
const CAP = /** @type {Record<string, number>} */ ({ charity: 30000, hospital: 17000 });
const MEAL_ALLOWANCE = 5000;
const REPORTING_THRESHOLD = 200000;
const TYPE_1 = /** @type {const} */ ([57000n, 27401n]);
const TYPE_2 = /** @type {const} */ ([100n, 53n]);
const STANDARD_DEDUCTION_FROM = '2026-27';

/**
 * @typedef {{year: string, residency: string, employer: string, salary: string, typeTwo: string, typeOne: string,
 *   meals: string, mealsTypeOne: boolean, studyLoan: boolean, hospitalCover: boolean}} Package
 */

/** `value` cents grossed up by the factor `num / den`, to the nearest whole dollar, half up, as the
 * ATO's guide rounds each grossed-up amount in its example.
 * @param {number} value @param {readonly [bigint, bigint]} factor */
const grossUp = (value, [num, den]) => Number((2n * BigInt(value) * num + 100n * den) / (200n * den));

/** The year's tax, levies and study loan repayment in cents on a salary of `paid` cents with a
 * reportable fringe benefits amount of `fringe` whole dollars, after the standard deduction a
 * resident has from 2026-27 (ITAA 1997 s 25-130), here all of the salary being labour income.
 * @param {{year: string, residency: string, studyLoan: boolean, hospitalCover: boolean}} p
 * @param {number} paid @param {number} fringe */
export function owed(p, paid, fringe) {
  const deduction = p.year >= STANDARD_DEDUCTION_FROM && p.residency === 'resident' ? Math.min(100000, paid) : 0;
  const taxable = Math.floor((paid - deduction) / 100);
  const r = taxEstimate({ year: p.year, residency: p.residency, taxable: String(taxable), fringe: String(fringe), super: '0',
    losses: '0', foreign: '0', studyLoan: p.studyLoan, uncoveredDays: String(p.hospitalCover ? 0 : daysInYear(p.year)),
    spouse: null, children: '0', withheld: '0' });
  return { taxable, total: -Math.round(r.refund * 100), surcharge: r.surcharge, studyLoan: r.studyLoan };
}

/** Benefits packaged in the FBT year ending 31 March in the income year, taken as paid evenly from
 * the year's salary. The Type 1 and Type 2 taxable values, meal entertainment in its group, are each
 * grossed up and added (s 5B(1E) step 1, (1F) and (1G)); the cap comes off (steps 2 and 3), then up
 * to $5,000 of the grossed-up meal entertainment (step 4); FBT is 47% of what is left. The
 * reportable amount is the total taxable value over $2,000 times 1 / 0.53, cents dropped. The gain
 * is the tax saved less that FBT, which an employer usually recovers from the package.
 * @param {Package} p */
export function salaryPackaging(p) {
  if (!PACKAGING_YEARS.includes(p.year)) throw new Error('Choose an income year from 2022-23 to 2026-27.');
  if (!['resident', 'foreign'].includes(p.residency)) throw new Error('Choose an Australian resident or a foreign resident.');
  if (!Object.hasOwn(CAP, p.employer)) {
    throw new Error('Choose a public benevolent institution or health promotion charity, or a hospital or ambulance service.');
  }
  for (const flag of ['mealsTypeOne', 'studyLoan', 'hospitalCover']) {
    if (typeof p[/** @type {'mealsTypeOne'} */ (flag)] !== 'boolean') throw new Error('Answer each yes or no question.');
  }
  const salary = wholeDollars(p.salary) * 100;
  const [typeTwo, typeOne, meals] = [p.typeTwo, p.typeOne, p.meals].map((value) => cents(value));
  const packaged = typeTwo + typeOne + meals;
  if (packaged > salary) throw new Error('The benefits packaged cannot exceed the salary.');
  const grossed = { typeOne: grossUp(typeOne + (p.mealsTypeOne ? meals : 0), TYPE_1),
    typeTwo: grossUp(typeTwo + (p.mealsTypeOne ? 0 : meals), TYPE_2), meals: grossUp(meals, p.mealsTypeOne ? TYPE_1 : TYPE_2) };
  const total = grossed.typeOne + grossed.typeTwo;
  const cap = CAP[p.employer];
  const overCap = Math.max(0, total - cap);
  const mealAllowance = Math.min(MEAL_ALLOWANCE, grossed.meals, overCap);
  const excess = overCap - mealAllowance;
  const fbt = excess * 47;
  const reportable = packaged > REPORTING_THRESHOLD ? Math.floor(packaged / 53) : 0;
  const before = owed(p, salary, 0);
  const after = owed(p, salary - packaged, reportable);
  const saved = before.total - after.total;
  const room = Math.max(0, cap - total);
  return { year: p.year, cap, packaged: packaged / 100, grossedTypeOne: grossed.typeOne, grossedTypeTwo: grossed.typeTwo,
    grossedMeals: grossed.meals, grossed: total, mealAllowance, excess, fbt: fbt / 100, reportable,
    taxableBefore: before.taxable, taxableAfter: after.taxable, owedBefore: before.total / 100, owedAfter: after.total / 100,
    surchargeAfter: after.surcharge, studyLoanAfter: after.studyLoan, saved: saved / 100, gain: (saved - fbt) / 100,
    // The Type 2 benefits whose grossed-up value the room takes: the room times 1 - 47%.
    room, roomTypeTwo: (room * 53) / 100 };
}
