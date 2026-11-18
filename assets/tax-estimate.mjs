// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// An estimate of one individual's assessment for a full income year: income tax, offsets, the
// Medicare levy and surcharge and any compulsory study loan repayment, less the tax withheld that
// the person enters, as a refund or an amount owing.
import { incomeTax, medicareLevySurcharge, wholeDollars } from './income-tax.mjs';
import { number } from './money.mjs';
import { studyLoanRepayment } from './study-loan.mjs';

/**
 * @typedef {{year: string, residency: string, taxable: string, fringe: string, super: string, losses: string,
 *   foreign: string, studyLoan: boolean, uncoveredDays: string, spouse: string | null, children: string,
 *   withheld: string}} Return
 */

/** Taxable income and the other parts of income, each in whole dollars; `spouse` is the spouse's
 * income for surcharge purposes, or null with no spouse all year. Only a resident pays the levy
 * surcharge, as the levy (Medicare Levy Act 1986 ss 8B(1)(d), 8C(1)(d) and 8D(1)(c): a prescribed
 * person, which includes a foreign resident, pays none). Repayment income adds exempt foreign
 * employment income to the parts of income for surcharge purposes (HESA s 154-5(1)). The result is
 * the tax withheld less the total, rounded to the cent: positive is a refund, negative an amount
 * owing.
 * @param {Return} r */
export function taxEstimate(r) {
  if (typeof r.studyLoan !== 'boolean') throw new Error('Say whether you have a study or training loan.');
  const [fringe, contributions, losses] = [r.fringe, r.super, r.losses].map(wholeDollars);
  const days = number(r.uncoveredDays, { max: 366, integer: true });
  const children = number(r.children, { max: 20, integer: true });
  const spouse = r.spouse === null ? null : wholeDollars(r.spouse);
  const withheld = Math.round(number(r.withheld, { max: 1e9, money: true }) * 100);
  const tax = incomeTax(r.taxable, r.year, r.residency);
  const taxable = wholeDollars(r.taxable);
  const surcharge = medicareLevySurcharge({ year: r.year, taxable, fringe, super: contributions, losses, spouse,
    children, uncoveredDays: r.residency === 'resident' ? days : 0 });
  const loan = r.studyLoan ? studyLoanRepayment({ taxable: r.taxable, fringe: r.fringe, losses: r.losses,
    super: r.super, foreign: r.foreign }, r.year) : null;
  const cents = (/** @type {number} */ value) => Math.round(value * 100);
  const total = cents(tax.total) + cents(surcharge.surcharge) + cents(loan?.repayment ?? 0);
  return { ...tax, surchargeIncome: surcharge.income, surchargeThreshold: surcharge.threshold,
    surchargeRate: surcharge.rate, surcharge: surcharge.surcharge, repaymentIncome: loan?.repaymentIncome ?? 0,
    studyLoan: loan?.repayment ?? 0, assessed: total / 100, withheld: withheld / 100, refund: (withheld - total) / 100 };
}
