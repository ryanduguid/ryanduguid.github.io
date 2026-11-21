// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { ratioCents } from './money.mjs';
import {
  FIRST_DETERMINATION, fhssCents, fhssContributionEstimate, fhssDate, fhssFinancialYear, refuseFhss,
} from './fhss-contributions.mjs';

export const FHSS_ESTIMATE_NOTE = 'The contribution calculation estimates deemed earnings at the published shortfall interest charge rates. It rounds down to whole dollars for each contribution. For Jill, the estimate gives $7,859 and ATO guidance GN 2024/1 example 6 gives $5,190. The difference remains unresolved. Use the earnings stated on your ATO determination when you have it.';
export const FHSS_TRANSITION_NOTE = 'For a determination made before 15 September 2024, check Schedule 4 items 28 and 30 of the Treasury Laws Amendment (2023 Measures No. 3) Act 2023. A release after action under item 30 can be outside the purchase, recontribution and FHSS tax rules.';
const REFORM_DATE = '2024-09-15';
const UNITS_PER_DOLLAR = 10000n;

/**
 * @typedef {{
 *   mode: string, scopeConfirmed: boolean, determinationDate: string,
 *   determinationRequested?: string, contributions?: unknown, deductions?: unknown,
 *   concessional?: string, nonConcessional?: string, associatedEarnings?: string,
 *   requestedAmount?: string, releaseRequestDate?: string, actualRelease?: string,
 *   withholdingBasis: string, marginalPercent?: string, withholdingAmount?: string,
 *   debtOffset?: string, transition?: string
 * }} FhssFacts
 */

/** @param {bigint} n */
const positive = (n) => n < 0n ? 0n : n;

/** Keep fractions of a cent until all statutory operations are finished. @param {bigint} units */
function centsText(units) {
  const cents = ratioCents(units, 100n);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

/** @param {FhssFacts} facts @param {string} determined */
function releaseComponents(facts, determined) {
  if (facts.mode === 'estimate') {
    return fhssContributionEstimate(facts.contributions, facts.deductions ?? [], facts.determinationRequested, determined);
  }
  if (facts.mode !== 'stated') {
    return refuseFhss('fhss.basis_invalid', 'Choose an ATO determination or a contribution estimate.');
  }
  return {
    concessional: fhssCents(facts.concessional, 'Concessional component on the determination') * 100n,
    nonConcessional: fhssCents(facts.nonConcessional, 'Non-concessional component on the determination') * 100n,
    earnings: fhssCents(facts.associatedEarnings, 'Associated earnings on the determination') * 100n,
    limit: null,
    rows: [],
  };
}

/** @param {FhssFacts} facts @param {bigint} assessable @param {boolean} actual */
function withholding(facts, assessable, actual) {
  if (facts.withholdingBasis === 'unknown') return null;
  if (facts.withholdingBasis === 'actual') {
    if (!actual) {
      return refuseFhss('fhss.withholding_actual_requires_release', 'Enter the actual gross released amount when you use the actual amount withheld.');
    }
    return fhssCents(facts.withholdingAmount, 'Actual amount withheld') * 100n;
  }
  if (facts.withholdingBasis === 'supplied_estimate') {
    return fhssCents(facts.withholdingAmount, 'Supplied withholding estimate') * 100n;
  }
  if (facts.withholdingBasis === 'unable') return (assessable * 17n / (100n * UNITS_PER_DOLLAR)) * UNITS_PER_DOLLAR;
  if (facts.withholdingBasis !== 'marginal') {
    return refuseFhss('input.missing_field', 'Choose a withholding basis. Use 17% only where the Commissioner cannot make an estimate.');
  }
  const match = /^(\d{1,2})(?:\.(\d{1,12}))?$/.exec(facts.marginalPercent?.trim() ?? '');
  if (!match) return refuseFhss('input.fraction_invalid', 'Enter an estimated marginal tax rate from 0% to 45%.');
  const fraction = match[2] ?? '';
  const scale = 10n ** BigInt(fraction.length);
  const percent = BigInt(match[1]) * scale + BigInt(fraction || '0');
  if (percent > 45n * scale) return refuseFhss('input.fraction_invalid', 'Enter an estimated marginal tax rate from 0% to 45%.');
  // GN 2024/1's ordinary 2 percentage point Medicare levy and 30% tax offset.
  // Regulation 26 drops the cents from withholding worked under regulation 53A.
  const numerator = positive(percent - 28n * scale);
  return (assessable * numerator / (100n * scale * UNITS_PER_DOLLAR)) * UNITS_PER_DOLLAR;
}

/** @param {FhssFacts} facts @param {string} determined @param {ReturnType<typeof releaseComponents>} components */
function resolveRelease(facts, determined, components) {
  const maximum = components.concessional + components.nonConcessional + components.earnings;
  const requested = facts.requestedAmount ? fhssCents(facts.requestedAmount, 'Amount requested') * 100n : maximum;
  if (requested > maximum) {
    return refuseFhss('fhss.request_exceeds_maximum', 'The amount requested cannot exceed the maximum release amount.');
  }
  const releaseRequest = facts.releaseRequestDate ? fhssDate(facts.releaseRequestDate, 'Release request date') : null;
  if (releaseRequest && releaseRequest < determined) {
    return refuseFhss('fhss.release_before_determination', 'The release request date cannot precede the determination date.');
  }
  const actual = Boolean(facts.actualRelease);
  if (actual && (!releaseRequest || facts.mode !== 'stated')) {
    return refuseFhss('fhss.actual_requires_determination', 'Use the ATO determination and enter the release request date when you enter the actual gross release.');
  }
  const gross = actual ? fhssCents(facts.actualRelease, 'Actual gross release') * 100n : requested;
  if (gross > requested) {
    return refuseFhss('fhss.release_exceeds_request', 'The actual gross release cannot exceed the amount requested.');
  }
  const assessable = positive(gross - components.nonConcessional);
  const withheld = withholding(facts, assessable, actual);
  if (withheld !== null && withheld > gross) {
    return refuseFhss('fhss.withholding_exceeds_release', 'The amount withheld cannot exceed the gross release.');
  }
  const afterWithholding = withheld === null ? null : gross - withheld;
  const debtOffset = facts.debtOffset ? fhssCents(facts.debtOffset, 'Commonwealth debt offset') * 100n : null;
  if (debtOffset !== null && afterWithholding !== null && debtOffset > afterWithholding) {
    return refuseFhss('fhss.debt_exceeds_net_release', 'The Commonwealth debt offset cannot exceed the amount after withholding.');
  }
  return { maximum, requested, releaseRequest, actual, gross, assessable, withheld, afterWithholding, debtOffset };
}

/**
 * The release request date sets the income year. The gross amount actually
 * released governs s 313-20(2), with an explicit assumption for planning.
 * @param {FhssFacts} facts
 */
export function fhss(facts) {
  if (facts.scopeConfirmed !== true) {
    return refuseFhss('scope.not_confirmed', 'Confirm the scope conditions before calculating.');
  }
  const determined = fhssDate(facts.determinationDate, 'Determination date');
  if (determined < FIRST_DETERMINATION) {
    return refuseFhss('period.unsupported', 'Use a determination date from 1 July 2018.');
  }
  const earlierDetermination = determined < REFORM_DATE;
  if (facts.transition === 'item30' && (!earlierDetermination || facts.mode !== 'stated')) {
    return refuseFhss('fhss.transition_out_of_scope', 'For an item 30 release, use an original determination date before 15 September 2024 and the confirmed ATO amounts.');
  }
  const components = releaseComponents(facts, determined);
  const { maximum, requested, releaseRequest, actual, gross, assessable, withheld, afterWithholding, debtOffset } =
    resolveRelease(facts, determined, components);
  const ordinary = !earlierDetermination || facts.transition === 'ordinary';
  return {
    determinationYear: fhssFinancialYear(determined),
    assessableYear: releaseRequest ? fhssFinancialYear(releaseRequest) : null,
    earningsBasis: facts.mode,
    releaseBasis: actual ? 'actual' : 'assumed',
    withholdingBasis: facts.withholdingBasis,
    transition: ordinary ? 'ordinary' : facts.transition === 'item30' ? 'item30' : 'unconfirmed',
    amounts: {
      concessional_component: centsText(components.concessional),
      non_concessional_component: centsText(components.nonConcessional),
      associated_earnings: centsText(components.earnings),
      maximum_release_amount: centsText(maximum),
      amount_requested: centsText(requested),
      gross_release: centsText(gross),
      assessable_fhss_released_amount: centsText(assessable),
      tax_withheld: withheld === null ? null : centsText(withheld),
      after_withholding: afterWithholding === null ? null : centsText(afterWithholding),
      debt_offset: debtOffset === null ? null : centsText(debtOffset),
      paid_to_you: debtOffset === null || afterWithholding === null ? null : centsText(afterWithholding - debtOffset),
      fhss_tax_offset: centsText(assessable * 30n / 100n),
      fhss_tax_if_not_used: ordinary ? centsText(assessable * 20n / 100n) : null,
      recontribution_required: ordinary && withheld !== null ? centsText(positive(assessable - withheld)) : null,
    },
    annualLimit: '15000.00',
    lifetimeLimit: components.limit === null ? null : centsText(components.limit * 100n),
    rows: components.rows,
  };
}
