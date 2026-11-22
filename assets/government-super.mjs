// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The super co-contribution, the low income superannuation tax offset (LISTO) and the spouse
// contribution tax offset for one person resident all year, 2020-21 to 2026-27, as the
// `government-super-amounts` command of ryanduguid/australian-accounting works them, from the same
// input. Sources, read 22 November 2026:
// - Superannuation (Government Co-contribution for Low Income Earners) Act 2003 (compilation 28,
//   in force 1 July 2018 to 30 June 2027): ss 6, 8, 9(1)(d), 10(1C), 10A, 11 (co-contribution) and
//   ss 12C(1) and 12E(2) (LISTO); the Regulations 2022 reg 15(2) and the 2004 Regulations reg 24(2)
//   (payment rounded up to a multiple of 5 cents).
// - The ATO's co-contribution income thresholds, Table 25 of 'Government contributions' (last
//   updated 27 April 2026).
// - ITAA 1997 ss 290-230 and 290-235 (compilation 268, 1 October 2026): the spouse offset.
// Total income (s 8) and adjusted taxable income are the income tests page's measures. Amounts
// carry exactly in hundred-thousandths of a dollar; each shows rounded half up to the cent, and
// a payment rounds the unrounded amount up to 5 cents.

import { incomeTests } from './income-tests.mjs';
import { number } from './money.mjs';

/** The co-contribution's lower and higher income thresholds by income year (Table 25). */
export const CO_CONTRIBUTION_THRESHOLDS = /** @type {Record<string, [number, number]>} */ ({
  '2020-21': [39837, 54837], '2021-22': [41112, 56112], '2022-23': [42016, 57016], '2023-24': [43445, 58445],
  '2024-25': [45400, 60400], '2025-26': [47488, 62488], '2026-27': [49293, 64293],
});
export const GOVERNMENT_SUPER_YEARS = Object.keys(CO_CONTRIBUTION_THRESHOLDS);

/** The command's input names for the income tests page's parts. */
export const INCOME_INPUTS = /** @type {const} */ ([['taxable_income', 'taxable'],
  ['assessable_fhss_released_amount', 'fhss'], ['family_trust_distribution_amounts', 'familyTrust'],
  ['reportable_fringe_benefits_section_57a', 'fringe57a'], ['reportable_fringe_benefits_other', 'fringeOther'],
  ['reportable_employer_super_contributions', 'employerSuper'], ['deductible_personal_super_contributions', 'personalSuper'],
  ['excess_concessional_contributions', 'excessConcessional'], ['net_financial_investment_loss', 'financialLoss'],
  ['net_rental_property_loss', 'rentalLoss'], ['tax_free_government_pensions', 'pensions'],
  ['target_foreign_income', 'targetForeign'], ['exempt_foreign_employment_income', 'exemptForeign'],
  ['child_support_paid', 'childSupport'], ['assessable_income', 'assessable'], ['business_deductions', 'businessDeductions']]);
/** The spouse inputs: all given, for a spouse contribution, or none. */
export const SPOUSE_INPUTS = ['spouse_contributions', 'spouse_assessable_income', 'spouse_assessable_fhss_released_amount',
  'spouse_reportable_fringe_benefits_total', 'spouse_reportable_employer_super_contributions',
  'spouse_excess_concessional_contributions', 'spouse_non_concessional_within_cap', 'spouse_total_super_balance_below_cap'];

// Hundred-thousandths of a dollar: 3.333 cents a dollar is 3333 of them.
const DOLLAR = 100000n;
const CENT = 1000n;
const TAPER = 3333n;
const MAXIMUM = 500n * DOLLAR;
const MINIMUM = 20n * DOLLAR;
const LISTO_LIMIT = 37000n * DOLLAR;
const LISTO_MAXIMUM = 500n * DOLLAR;
const LISTO_MINIMUM = 10n * DOLLAR;
const SPOUSE_BASE = 3000n * DOLLAR;
const SPOUSE_TAPER_START = 37000n * DOLLAR;
const SPOUSE_LIMIT = 40000n * DOLLAR;
const TEN_PERCENT = 'eligible_income_10_percent';
/** The command's steps for the income measures, in its order. */
const INCOME_STEPS = ['taxable_income_without_fhss', 'reportable_fringe_benefits_total', 'adjusted_fringe_benefits_total',
  'total_net_investment_loss', 'reportable_superannuation_contributions', 'adjusted_taxable_income',
  'co_contribution_employer_contributions', 'co_contribution_total_income'];
const NOT_RESIDENT = ['part_year_resident', 'working_holiday_maker', 'foreign_resident'];

/** @typedef {Record<string, string | boolean | null | undefined>} GovernmentSuperFacts */
/** @typedef {{ amount: string, condition: string, met: boolean | null }} Condition */
/** @typedef {{ year: string, amounts: Record<string, string>, conditions: Condition[],
 *   rates: { lower_income_threshold: string, higher_income_threshold: string } }} GovernmentSuper */

/** @param {string} code @param {string} message @returns {never} */
export function refuseGovernmentSuper(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** A yes or no answer. @param {GovernmentSuperFacts} facts @param {string} name */
function flag(facts, name) {
  const value = facts[name];
  if (typeof value !== 'boolean') return refuseGovernmentSuper('input.flag_invalid', `Answer yes or no: ${name.replace(/_/g, ' ')}.`);
  return value;
}

/** A balance or cap fact: yes, no, or null for not established. @param {GovernmentSuperFacts} facts @param {string} name */
function stated(facts, name) {
  return facts[name] === null ? null : flag(facts, name);
}

/** An amount of at most 2 decimal places from 0 to $1,000,000,000,000, in hundred-thousandths.
 * @param {GovernmentSuperFacts} facts @param {string} name */
function amount(facts, name) {
  try {
    return BigInt(Math.round(number(facts[name], { max: 1e12, money: true }) * 100)) * CENT;
  } catch {
    return refuseGovernmentSuper('input.amount_invalid',
      `${name.replace(/_/g, ' ')} must be an amount from 0 to 1,000,000,000,000 with up to 2 decimal places.`);
  }
}

/** Half up to the cent, as the command shows an amount. @param {bigint} u */
export function centsText(u) {
  const size = u < 0n ? -u : u;
  const cents = (size + CENT / 2n) / CENT;
  return `${u < 0n && cents ? '-' : ''}${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

/** Up to the next multiple of 5 cents, as the Commissioner pays (reg 15(2)). @param {bigint} u */
const paidText = (u) => centsText(((u + 5n * CENT - 1n) / (5n * CENT)) * 5n * CENT);
/** @param {bigint} a @param {bigint} b */
const least = (a, b) => (a < b ? a : b);
/** @param {bigint} a @param {bigint} b */
const most = (a, b) => (a > b ? a : b);

/** Whether `amount` is payable: every condition met, not if one is not met, and refused if a
 * condition not given would decide it. @param {Condition[]} conditions @param {string} amount
 * @param {[string, boolean | null][]} met */
function payable(conditions, amount, met) {
  conditions.push(...met.map(([condition, value]) => ({ amount, condition, met: value })));
  if (met.some(([, value]) => value === false)) return false;
  const missing = met.find(([, value]) => value === null);
  if (missing?.[0] === TEN_PERCENT) {
    refuseGovernmentSuper('government_super_amounts.no_total_income', 'Total income is nil, so the 10% eligible income '
      + `test (s 6(1)(b)) has no share to measure, and it decides the ${amount.replace(/_/g, ' ')}.`);
  }
  if (missing) {
    refuseGovernmentSuper('government_super_amounts.fact_not_supplied',
      `${missing[0].replace(/_/g, ' ')} decides the ${amount.replace(/_/g, ' ')} and was not given.`);
  }
  return true;
}

/** The refusals the command makes before any amount: scope, year, spouse inputs, visa and residency.
 * @param {GovernmentSuperFacts} facts */
function admit(facts) {
  if (facts.scope_confirmed !== true) refuseGovernmentSuper('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = String(facts.year);
  if (!GOVERNMENT_SUPER_YEARS.includes(year)) {
    refuseGovernmentSuper('period.unsupported', `This calculator covers ${GOVERNMENT_SUPER_YEARS[0]} to `
      + `${GOVERNMENT_SUPER_YEARS.at(-1)}. From 2027-28 Act No. 8 of 2026 changes LISTO, and the 2027-28 co-contribution thresholds are not published.`);
  }
  const given = SPOUSE_INPUTS.filter((name) => name in facts);
  if (given.length && given.length < SPOUSE_INPUTS.length) {
    refuseGovernmentSuper('input.missing_field', `${SPOUSE_INPUTS.find((name) => !(name in facts))} is required with the other spouse inputs.`);
  }
  if (flag(facts, 'temporary_visa_held')) {
    refuseGovernmentSuper('government_super_amounts.temporary_visa', 'A temporary visa held in the year: the exceptions for New '
      + 'Zealand citizens and prescribed visas (Co-contribution Act ss 6(1)(f) and 12C(1)(d)) are not worked out here.');
  }
  if (NOT_RESIDENT.includes(String(facts.residency))) {
    refuseGovernmentSuper('income_tests.residency_unsupported', 'The income measures are worked for a person resident in Australia for the whole year only.');
  }
  if (facts.residency !== 'full_year_resident') {
    refuseGovernmentSuper('input.residency_invalid', 'residency must be full_year_resident, part_year_resident, working_holiday_maker or foreign_resident.');
  }
  return { year, spouse: given.length > 0 };
}

/** The income tests page's measures in hundred-thousandths, by the command's step names.
 * @param {GovernmentSuperFacts} facts */
function measures(facts) {
  const parts = /** @type {import('./income-tests.mjs').IncomeTestParts} */ (Object.fromEntries([
    ...INCOME_INPUTS.map(([name, part]) => [part, facts[name]]), ['resident', true]]));
  let r;
  try {
    r = incomeTests(parts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    refuseGovernmentSuper(/cannot exceed/.test(message) ? 'income_tests.components_inconsistent' : 'input.amount_invalid', message);
  }
  const values = [r.taxableWithoutFhss, r.fringeTotal, r.adjustedFringe, r.losses, r.contributions, r.adjustedTaxableIncome,
    r.coEmployer, r.coContributionIncome];
  return { steps: Object.fromEntries(INCOME_STEPS.map((step, i) => [step, BigInt(values[i]) * DOLLAR])),
    business: BigInt(parts.businessDeductions) * DOLLAR };
}

/** The person's facts each amount reads, and the 10% eligible income test (s 6(1)(b)) on total income
 * before business deductions (s 8(3)); none when that is nil, as there is no share to measure.
 * @param {GovernmentSuperFacts} facts @param {bigint} testTotal */
function personFacts(facts, testTotal) {
  const [eligible, personal, concessional] = ['eligible_income', 'personal_contributions', 'concessional_contributions']
    .map((name) => amount(facts, name));
  const [lodged, under71] = [flag(facts, 'return_lodged'), flag(facts, 'under_71')];
  const [nonConcessional, balance] = [stated(facts, 'non_concessional_within_cap'), stated(facts, 'total_super_balance_below_cap')];
  if (eligible > testTotal) {
    refuseGovernmentSuper('government_super_amounts.fact_conflict',
      'Eligible income exceeds total income before business deductions, of which it is a part (s 8(3)).');
  }
  const tenPercent = testTotal === 0n ? null : eligible * 10n >= testTotal;
  return { personal, concessional, lodged, under71, nonConcessional, balance, tenPercent };
}

/** The co-contribution (ss 6, 9, 10(1C) and 11). @param {ReturnType<typeof personFacts>} p @param {bigint} total
 * @param {[number, number]} thresholds @param {Condition[]} conditions */
function coContribution(p, total, [lower, higher], conditions) {
  const ok = payable(conditions, 'co_contribution', [['personal_contributions_made', p.personal !== 0n],
    [TEN_PERCENT, p.tenPercent], ['below_higher_income_threshold', total < BigInt(higher) * DOLLAR], ['return_lodged', p.lodged],
    ['non_concessional_within_cap', p.nonConcessional], ['total_super_balance_below_cap', p.balance],
    ['under_71', p.under71], ['no_temporary_visa', true]]);
  const matched = p.personal / 2n;
  const taper = (most(0n, total - BigInt(lower) * DOLLAR) / DOLLAR) * TAPER;
  const maximum = most(0n, MAXIMUM - taper);
  const got = ok ? most(MINIMUM, least(matched, maximum)) : 0n;
  return { co_contribution_matched: centsText(matched), co_contribution_taper: centsText(taper),
    co_contribution_maximum: centsText(maximum), co_contribution: centsText(got), co_contribution_paid: paidText(got) };
}

/** LISTO (ss 12C(1) and 12E(2)): 15% to the nearest cent, at most $500 and at least $10.
 * @param {ReturnType<typeof personFacts>} p @param {bigint} ati @param {Condition[]} conditions */
function listo(p, ati, conditions) {
  const ok = payable(conditions, 'listo', [['concessional_contributions_made', p.concessional !== 0n],
    ['adjusted_taxable_income_37000', ati <= LISTO_LIMIT], [TEN_PERCENT, p.tenPercent], ['no_temporary_visa', true]]);
  const fifteen = (p.concessional * 15n) / 100n;
  const nearestCent = ((fifteen + CENT / 2n) / CENT) * CENT;
  const got = ok ? least(LISTO_MAXIMUM, most(LISTO_MINIMUM, nearestCent)) : 0n;
  return { listo_15_percent: centsText(fifteen), listo: centsText(got), listo_paid: paidText(got) };
}

/** The spouse contribution tax offset (ITAA 1997 ss 290-230 and 290-235).
 * @param {GovernmentSuperFacts} facts @param {Condition[]} conditions */
function spouseOffset(facts, conditions) {
  const [made, assessable, fhss, fringe, employer, excess] = SPOUSE_INPUTS.slice(0, 6).map((name) => amount(facts, name));
  if (fhss > assessable) {
    refuseGovernmentSuper('government_super_amounts.fact_conflict', 'The spouse’s assessable FHSS released amount exceeds the '
      + 'spouse’s assessable income, which includes it (ITAA 1997 s 313-20).');
  }
  if (excess > assessable) {
    refuseGovernmentSuper('government_super_amounts.fact_conflict', 'The spouse’s excess concessional contributions exceed the '
      + 'spouse’s assessable income, which includes them (ITAA 1997 s 291-15(a)).');
  }
  const income = assessable - fhss + fringe + most(0n, employer - excess);
  const limit = most(0n, SPOUSE_BASE - most(0n, income - SPOUSE_TAPER_START));
  const ok = payable(conditions, 'spouse_contribution_offset', [['spouse_contributions_made', made !== 0n],
    ['spouse_income_below_40000', income < SPOUSE_LIMIT],
    ['spouse_non_concessional_within_cap', stated(facts, 'spouse_non_concessional_within_cap')],
    ['spouse_total_super_balance_below_cap', stated(facts, 'spouse_total_super_balance_below_cap')]]);
  return { spouse_income: centsText(income), spouse_contribution_limit: centsText(limit),
    spouse_contribution_offset: centsText(ok ? (least(limit, made) * 18n) / 100n : 0n) };
}

/** The co-contribution, LISTO and, with the spouse inputs, the spouse contribution tax offset.
 * @param {GovernmentSuperFacts} facts @returns {GovernmentSuper} */
export function governmentSuperAmounts(facts) {
  const { year, spouse } = admit(facts);
  const { steps, business } = measures(facts);
  const total = steps.co_contribution_total_income;
  const testTotal = total + business;
  const p = personFacts(facts, testTotal);
  /** @type {Condition[]} */
  const conditions = [];
  const thresholds = CO_CONTRIBUTION_THRESHOLDS[year];
  const amounts = { ...Object.fromEntries(Object.entries(steps).map(([step, u]) => [step, centsText(u)])),
    eligible_income_test_total: centsText(testTotal), ...coContribution(p, total, thresholds, conditions),
    ...listo(p, steps.adjusted_taxable_income, conditions), ...(spouse ? spouseOffset(facts, conditions) : {}) };
  return { year, amounts, conditions,
    rates: { lower_income_threshold: String(thresholds[0]), higher_income_threshold: String(thresholds[1]) } };
}
