// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// A novated car lease for one year against paying the same car costs from after-tax pay. The
// electric car exemption (Fringe Benefits Tax Assessment Act 1986 s 8A, Compilation No. 97, 1 July
// 2026, read 19 November 2026) decides the treatment: an exempt car's costs all come from pre-tax
// salary, and its statutory formula value (s 9) is still reportable (s 135P(3)); any other car is
// taken under the employee contribution method, the employee paying the taxable value from after-tax
// pay, which reduces it to nil, and the rest from pre-tax salary.
import { daysInYear, wholeDollars } from './income-tax.mjs';
import { cents, number, ratioCents } from './money.mjs';
import { owed } from './salary-packaging.mjs';

/** The income years covered: those whose FBT years (ending 31 March 2024 to 2027) fall wholly after
 * the exemption began on 1 July 2022, at the FBT rate of 47% from the ATO's 'Fringe benefits tax -
 * rates and thresholds' (last updated 20 May 2026), read 19 November 2026. */
export const NOVATED_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24'];

/** The luxury car tax threshold for fuel-efficient vehicles in whole dollars, by the financial year
 * of the car's first retail sale: the ATO's 'Luxury car tax rate and thresholds' (last updated
 * 1 June 2026), read 19 November 2026. */
export const FUEL_EFFICIENT_THRESHOLD = /** @type {Record<string, number>} */ ({ '2026-27': 91661, '2025-26': 91387,
  '2024-25': 91387, '2023-24': 89332, '2022-23': 84916, '2021-22': 79659 });

/**
 * @typedef {{year: string, residency: string, salary: string, studyLoan: boolean, hospitalCover: boolean, kind: string,
 *   firstUsed: string, commitment: boolean, saleYear: string, price: string, reduced: boolean, days: string,
 *   gstCosts: string, otherCosts: string}} Lease
 */

/** Why s 8A does not exempt the car's benefits, or null when it does. A plug-in hybrid stopped being
 * a zero or low emissions vehicle on 1 April 2025 (s 8A(2)); the ATO's 'FBT on plug-in hybrid
 * electric vehicles' (last updated 14 March 2025) keeps the exemption where it applied to the car's
 * use before that date under a financially binding commitment that continues unchanged.
 * @param {Lease} n @param {number} price cents */
function notExempt(n, price) {
  if (n.kind === 'other') return 'it is not a battery electric or hydrogen fuel cell car';
  if (n.kind === 'phev' && n.year >= '2025-26' && !n.commitment) {
    return 'a plug-in hybrid is exempt from 1 April 2025 only under a commitment made and used before then';
  }
  if (n.firstUsed !== 'after') return 'it was first held and used before 1 July 2022';
  if (price > FUEL_EFFICIENT_THRESHOLD[n.saleYear] * 100) return 'luxury car tax was payable on its first retail sale';
  return null;
}

/** The year's figures for a car under a novated lease, against paying the same costs from after-tax
 * pay. Costs that include GST are taken net of the credit the employer claims (one eleventh), and
 * the employee's after-tax contribution is consideration on which the employer pays GST, so only ten
 * elevenths of it goes to the costs (the ATO's guide for employers, 'Recipient's payment and GST').
 * The comparison under that method is null when the costs are too small for the contribution to
 * cover the value. The statutory formula value is the cost price, two-thirds of it from the fifth
 * year held, times 20% times the days available for private use over the days in the year, rounded
 * half up to the cent. A reportable amount is that value over $2,000 times 1 / 0.53, cents dropped.
 * @param {Lease} n */
export function novatedLease(n) {
  if (!NOVATED_YEARS.includes(n.year)) throw new Error('Choose an income year from 2023-24 to 2026-27.');
  if (!['resident', 'foreign'].includes(n.residency)) throw new Error('Choose an Australian resident or a foreign resident.');
  if (!['bev', 'fcev', 'phev', 'other'].includes(n.kind)) throw new Error('Choose the kind of car.');
  if (!['after', 'before'].includes(n.firstUsed)) throw new Error('Say when the car was first held and used.');
  if (!Object.hasOwn(FUEL_EFFICIENT_THRESHOLD, n.saleYear) || n.saleYear > n.year) {
    throw new Error('Choose the year of the car’s first retail sale, from 2021-22 to the income year.');
  }
  for (const flag of ['commitment', 'reduced', 'studyLoan', 'hospitalCover']) {
    if (typeof n[/** @type {'commitment'} */ (flag)] !== 'boolean') throw new Error('Answer each yes or no question.');
  }
  const salary = wholeDollars(n.salary) * 100;
  const price = cents(n.price);
  const yearDays = daysInYear(n.year);
  const days = number(n.days, { max: yearDays, integer: true });
  const [gstCosts, otherCosts] = [n.gstCosts, n.otherCosts].map((value) => cents(value));
  const costs = gstCosts + otherCosts;
  if (!price) throw new Error('Enter the car’s cost price.');
  if (costs > salary) throw new Error('The car’s costs cannot exceed the salary.');
  const netCosts = Number(ratioCents(BigInt(gstCosts) * 10n, 11n)) + otherCosts;
  const taxableValue = Number(ratioCents(BigInt(price) * (n.reduced ? 2n : 3n) * 20n * BigInt(days), 300n * BigInt(yearDays)));
  const reason = notExempt(n, price);
  const none = owed(n, salary, 0);
  /** @param {number} pre @param {number} post @param {number} reportable cents, cents, whole dollars */
  const scenario = (pre, post, reportable) => {
    const tax = owed(n, salary - pre, reportable);
    return { preTax: pre / 100, postTax: post / 100, reportable, owed: tax.total / 100, surcharge: tax.surcharge,
      studyLoan: tax.studyLoan, saving: (none.total - tax.total - pre - post + costs) / 100 };
  };
  const exempt = reason ? null : scenario(netCosts, 0, taxableValue > 200000 ? Math.floor(taxableValue / 53) : 0);
  // The contribution is the taxable value, of which ten elevenths goes to the costs.
  const covered = Number(ratioCents(BigInt(taxableValue) * 10n, 11n));
  if (covered > netCosts && reason) {
    throw new Error('The car’s yearly costs are less than its taxable value, so an after-tax contribution cannot cover it; '
      + 'this calculator does not work the FBT that would remain.');
  }
  const contribution = covered > netCosts ? null : scenario(netCosts - covered, taxableValue, 0);
  return { year: n.year, exempt: !reason, reason, threshold: FUEL_EFFICIENT_THRESHOLD[n.saleYear], taxableValue: taxableValue / 100,
    costs: costs / 100, netCosts: netCosts / 100, owedWithout: none.total / 100, exemptCase: exempt, contribution };
}
