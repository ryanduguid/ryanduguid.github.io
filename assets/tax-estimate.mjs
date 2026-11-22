// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// An estimate of one individual's assessment for a full income year: income tax, offsets, the
// Medicare levy and surcharge and any compulsory study loan repayment, less the tax withheld that
// the person enters, as a refund or an amount owing.
import { incomeTax, medicareLevySurcharge, wholeDollars } from './income-tax.mjs';
import { number } from './money.mjs';
import { studyLoanRepayment } from './study-loan.mjs';
import { beneficiaryOffset, invalidCarerOffset, zoneOffset } from './individual-offsets.mjs';
import { privateHealthRebate, refuse } from './private-health-rebate.mjs';

/**
 * @typedef {{year: string, residency: string, taxable: string, fringe: string, super: string, losses: string,
 *   foreign: string, studyLoan: boolean, uncoveredDays: string, spouse: string | null, children: string,
 *   withheld: string, offsets?: Offsets}} Return
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
  const result = { ...tax, surchargeIncome: surcharge.income, surchargeThreshold: surcharge.threshold,
    surchargeRate: surcharge.rate, surcharge: surcharge.surcharge, repaymentIncome: loan?.repaymentIncome ?? 0,
    studyLoan: loan?.repayment ?? 0, assessed: total / 100, withheld: withheld / 100, refund: (withheld - total) / 100 };
  return r.offsets ? withOffsets(result, r, r.offsets) : result;
}

/**
 * @typedef {{rebatableBenefit?: string, carer?: Omit<import('./individual-offsets.mjs').CarerInput, 'year'>,
 *   zone?: Omit<import('./individual-offsets.mjs').ZoneInput, 'year' | 'invalid_carer_tax_offset'>,
 *   privateHealth?: {maintained: boolean, lines: import('./private-health-rebate.mjs').StatementLine[]}}} Offsets
 */

/** The estimate with the further offsets. The non-refundable ones come off the tax on taxable
 * income in the order of ITAA 1997 s 63-10(1), never below nil: the beneficiary tax offset (item
 * 15), then the low income and low and middle income tax offsets, the invalid and invalid carer
 * tax offset and the zone or overseas forces tax offset (item 20). None reduces the Medicare levy
 * or the surcharge. The zone offset's relevant rebate amount includes the invalid carer offset
 * (ITAA 1936 s 79A(4)). The private health insurance tax offset is refundable (s 67-23 item 5) and
 * comes off the total, which it can take below nil; an excess premium reduction is added to it
 * (Private Health Insurance Act 2007 s 282-18(6)). A foreign resident gets no private health
 * insurance offset here: the estimate does not test that every person insured is an eligible
 * person (ITAA 1997 s 61-205(1)(c)).
 * @template {{tax: number, offset: number, lmito: number, medicare: number, surcharge: number, studyLoan: number,
 *   withheld: number, surchargeIncome: number}} T
 * @param {T} base @param {Return} r @param {Offsets} o */
function withOffsets(base, r, o) {
  const cents = (/** @type {number} */ value) => Math.round(value * 100);
  const benefit = o.rebatableBenefit === undefined ? null
    : beneficiaryOffset({ year: r.year, rebatable_benefit: o.rebatableBenefit });
  const carer = o.carer ? invalidCarerOffset({ ...o.carer, year: r.year }) : null;
  const zone = o.zone ? zoneOffset({ ...o.zone, year: r.year,
    invalid_carer_tax_offset: carer ? carer.offset.toFixed(2) : undefined }) : null;
  let privateHealth = null;
  if (o.privateHealth) {
    if (r.residency !== 'resident') {
      refuse('input.field_unknown', 'The private health insurance tax offset needs every person insured to be an eligible '
        + 'person (ITAA 1997 s 61-205(1)(c)), which this calculator does not test for a foreign resident or working holiday maker.');
    }
    privateHealth = privateHealthRebate({ year: r.year, income_for_surcharge_purposes: String(base.surchargeIncome),
      spouse_income_for_surcharge_purposes: r.spouse ?? undefined, dependent_children: Number(r.children),
      maintained_dependent_person: o.privateHealth.maintained, lines: o.privateHealth.lines });
  }
  let left = cents(base.tax);
  const apply = (/** @type {number} */ amount) => {
    const applied = Math.min(left, cents(amount));
    left -= applied;
    return applied / 100;
  };
  const applied = { beneficiary: apply(benefit?.offset ?? 0), offset: apply(base.offset), lmito: apply(base.lmito),
    carerOffset: apply(carer?.offset ?? 0), zoneOffset: apply(zone?.offset ?? 0) };
  const total = left + cents(base.medicare);
  const assessed = total + cents(base.surcharge) + cents(base.studyLoan) + cents(privateHealth?.excess ?? 0)
    - cents(privateHealth?.offset ?? 0);
  const withheld = cents(base.withheld);
  return { ...base, ...applied, netTax: left / 100, total: total / 100, assessed: assessed / 100,
    refund: (withheld - assessed) / 100, benefit, carer, zone, privateHealth };
}
