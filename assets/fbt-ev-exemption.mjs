// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Whether a car benefit is exempt under section 8A of the Fringe Benefits Tax Assessment Act 1986,
// the electric cars exemption, condition by condition: the Act as compiled on 1 July 2026
// (Compilation No. 97) and the Treasury Laws Amendment (Electric Car Discount) Act 2022 as made,
// Schedule 1 item 7 and Schedule 2 item 5, both read 19 November 2026. It mirrors
// fbt_ev_exemption_check in ryanduguid/australian-accounting's australian-tax-calculators
// (pull request 732 at 1097c436b89607aa606a667e9c549f7c96398419), except that it takes the date of
// the first retail sale, not its financial year, and reads one after the FBT year ends as coming after
// every benefit in it.

import { cents, number } from './money.mjs';

/** The luxury car tax threshold for fuel-efficient vehicles in whole dollars, by the financial year
 * of the sale: the ATO's 'Luxury car tax rate and thresholds' (last updated 1 June 2026), read
 * 19 November 2026. A sale in a year the table does not hold is refused. */
export const FUEL_EFFICIENT_THRESHOLDS = /** @type {Record<string, number>} */ ({
  '2012-13': 75375, '2013-14': 75375, '2014-15': 75375, '2015-16': 75375, '2016-17': 75526, '2017-18': 75526,
  '2018-19': 75526, '2019-20': 75526, '2020-21': 77565, '2021-22': 79659, '2022-23': 84916, '2023-24': 89332,
  '2024-25': 91387, '2025-26': 91387, '2026-27': 91661 });

/**
 * @typedef {{committed: boolean, newCommitment: boolean, exemptBefore: boolean}} PlugInHybrid
 * @typedef {{vehicle: 'battery' | 'fuel-cell' | 'plug-in-hybrid', currentEmployee: boolean, firstUsed: string,
 *   firstSale: string, lctValue: string, otherSupply: boolean, hybrid?: PlugInHybrid}} EvFacts
 * @typedef {{condition: string, met: boolean}} EvCondition
 * @typedef {{exempt: boolean, conditions: EvCondition[], saleYear: string, threshold: number | null}} EvExemption
 */

/** A calendar date as YYYY-MM-DD, or a refusal naming the field.
 * @param {unknown} text @param {string} name */
function day(text, name) {
  const date = new Date(`${text}T00:00:00Z`);
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== text) throw new Error(`Enter the date ${name} as a calendar date.`);
  return text;
}

/** First held and used, including availability for use, on or before the end of the FBT year.
 * @param {unknown} value @param {number} ended */
export function carFirstUseDate(value, ended) {
  const firstUsed = day(value, 'the car was first held and used');
  if (firstUsed > `${ended}-03-31`) {
    throw new Error(`The car was first held and used after 31 March ${ended}, so it gave no car benefit in the FBT year.`);
  }
  return firstUsed;
}

/** The financial year, 1 July to 30 June, a date falls in: '2026-27' for 2026-07-01.
 * @param {string} iso */
function financialYear(iso) {
  const start = Number(iso.slice(0, 4)) - (iso.slice(5) < '07-01' ? 1 : 0);
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** @param {unknown} value @returns {boolean} */
const yesNo = (value) => {
  if (typeof value !== 'boolean') throw new Error('Answer each yes or no question.');
  return value;
};

/** The electric cars exemption's conditions for a car benefit in the FBT year ending 31 March
 * `year.ended`, from 2026 onwards, when every benefit falls after a plug-in hybrid stopped being a
 * zero or low emissions vehicle on 1 April 2025. The benefit is exempt only if every condition is met:
 * a current employee (s 8A(1)(a)); a battery electric or hydrogen fuel cell electric vehicle
 * (s 8A(1)(b) and (2) to (4)), or a plug-in hybrid under Schedule 2 item 5(2): a commitment made
 * before 1 April 2025 for a period that began before then and includes the benefit, no new commitment
 * since, and an exempt car benefit with the car before 1 April 2025; the car first both held and used
 * on or after 1 July 2022 (Schedule 1 item 7(2)); and no luxury car tax payable on any supply or
 * importation before the benefit is provided (s 8A(1)(c)), at the first retail sale read as a luxury
 * car tax value not above that year's fuel-efficient threshold (A New Tax System (Luxury Car Tax) Act
 * 1999 s 25-1). A car benefit needs the car held and used or available, so no benefit comes before the
 * car was first held and used. A first retail sale after the FBT year comes after every benefit in it,
 * so its luxury car tax cannot fail s 8A(1)(c) and no threshold applies (`threshold` is null). A sale
 * within the year after the car was first held and used may come between the year's benefits, so one
 * on which luxury car tax was payable is refused.
 * @param {EvFacts} e the car's facts as entered
 * @param {{ended: string}} year the year the FBT year ends, 31 March
 * @returns {EvExemption} */
export function fbtEvExemption(e, year) {
  const ended = number(year.ended, { min: 2026, max: 2100, integer: true });
  if (!['battery', 'fuel-cell', 'plug-in-hybrid'].includes(e.vehicle)) {
    throw new Error('Choose a battery electric, hydrogen fuel cell electric or plug-in hybrid car.');
  }
  const hybrid = e.vehicle === 'plug-in-hybrid';
  if (hybrid !== (e.hybrid !== undefined)) throw new Error('Answer the plug-in hybrid questions for a plug-in hybrid only.');
  const current = yesNo(e.currentEmployee);
  const otherSupply = yesNo(e.otherSupply);
  const facts = hybrid ? [e.hybrid?.committed, e.hybrid?.newCommitment, e.hybrid?.exemptBefore].map(yesNo) : [];
  const firstUsed = carFirstUseDate(e.firstUsed, ended);
  const firstSale = day(e.firstSale, 'of the car’s first retail sale');
  const value = cents(e.lctValue);
  const yearEnd = `${ended}-03-31`;
  const afterYear = firstSale > yearEnd;
  const saleYear = financialYear(firstSale);
  if (!afterYear && !Object.hasOwn(FUEL_EFFICIENT_THRESHOLDS, saleYear)) {
    throw new Error('This calculator takes a first retail sale from 1 July 2012, the years the ATO’s luxury car tax table lists.');
  }
  const threshold = afterYear ? null : FUEL_EFFICIENT_THRESHOLDS[saleYear];
  if (threshold !== null && value > threshold * 100 && firstSale > firstUsed && firstSale >= `${ended - 1}-04-01`) {
    throw new Error('Luxury car tax on a first retail sale within the FBT year, after the car was first held and used, '
      + 'does not affect a benefit provided before the sale (section 8A(1)(c)), so this calculator cannot give one result for the year.');
  }
  // Item 5(2)(d): a car first held and used from 1 April 2025 gave no car benefit before that day.
  if (facts[2] && firstUsed >= '2025-04-01') {
    throw new Error('A car first held and used from 1 April 2025 cannot have given an exempt car benefit before that day.');
  }
  const vehicle = hybrid
    ? [['hybrid-committed', facts[0]], ['hybrid-no-new-commitment', !facts[1]], ['hybrid-exempt-before', facts[2]]]
    : [['zero-or-low-emissions', true]];
  const conditions = [['current-employee', current], ...vehicle, ['first-held-and-used', firstUsed >= '2022-07-01'],
    ['first-sale', threshold === null || value <= threshold * 100], ['other-supply', !otherSupply]]
    .map(([condition, met]) => ({ condition: /** @type {string} */ (condition), met: /** @type {boolean} */ (met) }));
  return { exempt: conditions.every((c) => c.met), conditions, saleYear, threshold };
}
