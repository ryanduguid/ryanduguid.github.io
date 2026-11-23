// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The net medical expenses tax offset (ITAA 1936 ss 159P and 159Q, Compilation No. 161) for one
// individual for 2016-17, 2017-18 or 2018-19, the last year it ran (s 159P(1A)). Ported from the
// australian-accounting command net-medical-expenses-tax-offset, with its refusal codes. The phase-in
// limits are the ATO's, from its T5 return instructions for 2017, 2018 and 2019. Amounts are in cents.
import { commandCents, ratioCents } from './money.mjs';
import { refuse } from './private-health-rebate.mjs';

// ITAA 1936 s 159Q(5) and (6), indexed: the lower and higher phase-in limits in dollars.
/** @type {Map<string, [number, number]>} */
export const NET_MEDICAL_LIMITS = new Map([['2016-17', [2299, 5423]], ['2017-18', [2333, 5504]], ['2018-19', [2377, 5609]]]);
const FIELDS = ['year', 'net_medical_expenses', 'adjusted_taxable_income', 'spouse_adjusted_taxable_income', 'dependent_children'];

/** @typedef {{year: string, net_medical_expenses: string, adjusted_taxable_income: string,
 *   spouse_adjusted_taxable_income?: string, dependent_children?: number}} MedicalInput */

/** An amount in cents, as the command reads one. @param {unknown} value */
const toCents = (value) => Number(commandCents(value));

/** The year, refusing 2019-20 and later with the reason the offset ended. @param {unknown} year */
function medicalYear(year) {
  const limits = NET_MEDICAL_LIMITS.get(String(year));
  if (limits) return limits;
  const ended = typeof year === 'string' && /^\d{4}-\d{2}$/.test(year) && Number(year.slice(0, 4)) >= 2019;
  return refuse('period.unsupported', ended
    ? 'ITAA 1936 s 159P(1A): no net medical expenses tax offset for 2019-20 or a later year; supported: 2016-17, 2017-18, 2018-19.'
    : 'The net medical expenses tax offset is worked out for 2016-17, 2017-18 and 2018-19 only.');
}

/** The offset: 20% of the net medical expenses over the lower phase-in limit, or 10% over the
 * higher limit where the income tested exceeds the threshold (s 159P(3AA)). The income tested is
 * the person's adjusted taxable income for rebates, with a spouse's for a person with a spouse on 30
 * June (s 159Q(1) and (2)); the threshold is $90,000, or $180,000 plus $1,500 for each dependent child
 * after the first for a person with a spouse or a dependent child. Half a cent rounds up.
 * @param {MedicalInput} input */
export function netMedicalOffset(input) {
  const unknown = Object.keys(input).find((key) => !FIELDS.includes(key));
  if (unknown) refuse('input.field_unknown', `Unknown input ${unknown}.`);
  const [lower, higher] = medicalYear(input.year);
  const net = toCents(input.net_medical_expenses);
  const own = toCents(input.adjusted_taxable_income);
  const spouse = input.spouse_adjusted_taxable_income === undefined ? null : toCents(input.spouse_adjusted_taxable_income);
  const children = input.dependent_children ?? 0;
  if (!Number.isInteger(children) || children < 0) refuse('input.dependants_invalid', 'dependent_children must be a non-negative integer.');
  const family = spouse !== null || children > 0;
  const threshold = family ? 180000 + 1500 * Math.max(0, children - 1) : 90000;
  const tested = own + (spouse ?? 0);
  const higherApplies = tested > threshold * 100;
  const limit = higherApplies ? higher : lower;
  const excess = Math.max(0, net - limit * 100);
  const offset = Number(ratioCents(BigInt(excess) * BigInt(higherApplies ? 10 : 20), 100n));
  return { family, threshold, tested: tested / 100, higherApplies, limit, net: net / 100, excess: excess / 100,
    percentage: higherApplies ? 10 : 20, offset: offset / 100 };
}

/** The result for the page's net medical expenses form.
 * @param {(name: string) => string} value a field's value @param {(amount: number) => string} aud */
export function netMedicalResult(value, aud) {
  const spouse = value('nme-spouse') === 'yes';
  const children = Number(value('nme-children'));
  const r = netMedicalOffset({ year: value('nme-year'), net_medical_expenses: value('nme-expenses'),
    adjusted_taxable_income: value('nme-income'),
    ...(spouse ? { spouse_adjusted_taxable_income: value('nme-spouse-income') } : {}), dependent_children: children });
  const whole = (/** @type {number} */ amount) => aud(amount).replace(/\.00$/, '');
  return {
    inputs: `${value('nme-year')}, net medical expenses ${aud(r.net)}, adjusted taxable income ${aud(Number(value('nme-income')))}, `
      + `${spouse ? `a spouse on 30 June with adjusted taxable income of ${aud(Number(value('nme-spouse-income')))}` : 'no spouse on 30 June'}`
      + ` and ${children === 1 ? '1 dependent child' : `${children || 'no'} dependent children`}`,
    principal: 4,
    rows: [[spouse ? 'Income tested, yours and your spouse’s' : 'Income tested', aud(r.tested)],
      [`Threshold, ${r.family ? 'family' : 'singles'}`, whole(r.threshold)],
      [`${r.higherApplies ? 'Higher' : 'Lower'} phase-in limit`, whole(r.limit)],
      ['Net medical expenses over the limit', aud(r.excess)], ['Net medical expenses tax offset', aud(r.offset)]],
    note: `${r.higherApplies ? 'Income above' : 'Income at or below'} the threshold: ${r.percentage}% of the net medical `
      + `expenses over the ${r.higherApplies ? 'higher' : 'lower'} phase-in limit. The offset is non-refundable and is not `
      + 'taken off any tax here',
  };
}
