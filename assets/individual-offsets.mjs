// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The beneficiary tax offset (ITAA 1936 s 160AAA), the invalid and invalid carer tax offset (ITAA
// 1997 Subdivision 61-A) and the zone and overseas forces tax offsets (ITAA 1936 ss 79A and 79B,
// with ITAA 1997 Division 961), each for one person and one income year from 2020-21 to 2026-27.
// Ported from the australian-accounting commands beneficiary-tax-offset, invalid-carer-tax-offset
// and zone-tax-offset, with their refusal codes. Sources read 22 November 2026: ITAA 1936
// Compilation No. 193 (1 October 2026), ITAA 1997 Compilation No. 268 (1 October 2026), the Income
// Tax Assessment (1936 Act) Regulations 2025 and Regulation 2015 s 13, and the ATO's T4 and T5
// supplementary return instructions for 2021 to 2026. Amounts are worked in cents.
import { number, ratioCents } from './money.mjs';
import { daysInYear } from './income-tax.mjs';
import { refuse, supportedYear } from './private-health-rebate.mjs';

/** An amount from 0 to $1 billion, to the cent, in cents. @param {unknown} value */
const toCents = (value) => Math.round(number(value, { max: 1e9, money: true }) * 100);
/** @param {number} cents */
const dollars = (cents) => cents / 100;

/** A whole number of days from 0 to the days in the year. @param {unknown} value @param {number} days @param {string} what */
function dayCount(value, days, what) {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > days) {
    refuse('input.day_count_invalid', `${what} must be a whole number from 0 to ${days}.`);
  }
  return Number(value);
}

/** $1 for every $4 by which `income` cents exceed $282, in whole dollars (ITAA 1997 ss 61-45 and
 * 961-20). @param {number} income */
const incomeReduction = (income) => Math.floor(Math.max(0, income - 28200) / 400);

// Income Tax Assessment (1936 Act) Regulations 2025 s 13 (2015 Regulation s 13 for earlier years):
// 15% of the amount over $6,000, plus 15% of the amount over the top of the lowest marginal rate
// band in Income Tax Rates Act 1986 Sch 7 Part I item 1, $45,000 for every year 2020-21 to 2026-27.
export const BENEFICIARY_THRESHOLDS = [6000, 45000];

/** The beneficiary tax offset: the rebatable benefit rounded down to the whole dollar (s 13(4)),
 * then the formula, rounded up to the whole dollar (s 13(5)).
 * @param {{year: string, rebatable_benefit: string}} input */
export function beneficiaryOffset(input) {
  supportedYear(input.year);
  const amount = Math.floor(toCents(input.rebatable_benefit) / 100);
  const [lower, upper] = BENEFICIARY_THRESHOLDS;
  // 15% of a dollar is 15 cents.
  const cents = 15 * Math.max(0, amount - lower) + 15 * Math.max(0, amount - upper);
  return { amount, offset: Math.ceil(cents / 100) };
}

// ITAA 1997 ss 61-20 and 61-30 as the ATO publishes them in each year's T5 instructions: the
// maximum offset, the ATO's daily rate for part of the year, both in cents, and the FTB Part B
// income limit in dollars. 2026-27's were not published on 22 November 2026.
/** @type {Record<string, number[]>} */
export const INVALID_CARER = {
  '2025-26': [339600, 930, 120007], '2024-25': [330000, 904, 117194], '2023-24': [315200, 861, 112578],
  '2022-23': [294300, 806, 104432], '2021-22': [283300, 776, 100900], '2020-21': [281600, 772, 100000],
};
export const CARER_CASES = /** @type {Record<string, [string, string]>} */ ({
  shared: ['invalid_carer_tax_offset.shared_maintenance', 'Another person also maintained the dependant: ITAA 1997 '
    + 's 61-40(1)(b) apportions the offset before the s 61-45 income reduction, but the ATO’s worksheets apply the '
    + 'share after it, and the 2 differ; this calculator does not choose.'],
  ftb: ['invalid_carer_tax_offset.ftb_shared_care', 'ITAA 1997 s 61-35 reduces the offset by the FTB Part B '
    + 'shared-care rate over the non-shared-care rate, which Services Australia works out; this calculator does not.'],
  spouses: ['invalid_carer_tax_offset.successive_spouses', 'With a different spouse in different parts of the year, '
    + 'ITAA 1997 s 61-20(3) adds the adjusted taxable income of each spouse who is not the dependant, each for '
    + 'their part of the year; this calculator takes one spouse for the whole year.'],
});

/**
 * @typedef {{year: string, dependant: string, adjusted_taxable_income: string,
 *   dependant_adjusted_taxable_income: string, days?: number, spouse_adjusted_taxable_income?: string,
 *   maintained_by_others?: boolean, ftb_b_shared_care?: boolean, different_spouses?: boolean}} CarerInput
 */

/** The invalid and invalid carer tax offset for one dependant: nil where the person's adjusted
 * taxable income for offsets, plus that of a spouse who is not the dependant, is more than the
 * FTB Part B limit (s 61-20); otherwise the maximum, or for part of the year the days times the
 * ATO's daily rate (s 61-40), less the s 61-45 reduction, and nil where less than $1 (T5
 * worksheets). @param {CarerInput} input */
export function invalidCarerOffset(input) {
  if (input.year === '2026-27') {
    refuse('invalid_carer_tax_offset.rate_unpublished', 'The 2026-27 offset amount and FTB Part B income limit, both '
      + 'indexed (ITAA 1997 ss 61-30 and 61-20), had not been published when this was checked on 22 November 2026.');
  }
  const year = supportedYear(input.year);
  if (!['spouse', 'other'].includes(input.dependant)) {
    refuse('invalid_carer_tax_offset.dependant_invalid', 'Say whether the dependant is your spouse or another relative.');
  }
  for (const [key, flag] of [['shared', 'maintained_by_others'], ['ftb', 'ftb_b_shared_care'], ['spouses', 'different_spouses']]) {
    if (input[/** @type {'maintained_by_others'} */ (flag)] === true) refuse(...CARER_CASES[key]);
  }
  const own = toCents(input.adjusted_taxable_income);
  const dependantIncome = toCents(input.dependant_adjusted_taxable_income);
  const yearDays = daysInYear(year);
  const days = input.days === undefined ? yearDays : dayCount(input.days, yearDays, 'The days');
  if (input.dependant === 'spouse' && input.spouse_adjusted_taxable_income !== undefined) {
    refuse('input.field_unknown', 'A spouse who is the dependant adds no income to the limit test (s 61-20(1)(b)).');
  }
  const spouse = input.spouse_adjusted_taxable_income === undefined ? 0 : toCents(input.spouse_adjusted_taxable_income);
  const [maximum, daily, limit] = INVALID_CARER[year];
  const tested = own + spouse;
  const eligible = tested <= limit * 100;
  const amount = days === yearDays ? maximum : daily * days;
  const reduction = incomeReduction(dependantIncome);
  const left = amount - reduction * 100;
  return { eligible, days, tested: dollars(tested), amount: dollars(amount), reduction, limit,
    offset: eligible && left >= 100 ? dollars(left) : 0 };
}

// ITAA 1936 s 79A(2)(a) to (c) and s 79B(2)(a): the fixed amount and the share of the relevant
// rebate amount in tenths.
/** @type {Record<string, [number, number]>} */
export const ZONE_AREAS = { special_area: [1173, 5], zone_a: [338, 5], zone_b: [57, 2], overseas_forces: [338, 5] };
const NOT_FOR_FORCES = ['prior_year', 'prior_days', 'continuous_residence', 'includes_first_day', 'remote_area_allowance'];
export const ZONE_SHARED = 'Another person also maintained a dependant: ITAA 1997 s 961-15(1)(c) leaves the share to '
  + 'the Commissioner, and the ATO publishes no method.';

/** @param {string} message @returns {never} */
const dependantsInvalid = (message) => refuse('zone_tax_offset.dependants_invalid', message);

/** One dependant's notional tax offset in cents (ss 961-10 to 961-20): the full amount, or for part
 * of the year the full amount times the days over the days in the year, to the cent (T4 worksheet
 * 1); less the income reduction without cents and not below nil (worksheet 2).
 * @param {number} full dollars @param {number} days @param {number} yearDays @param {number} income cents */
function notional(full, days, yearDays, income) {
  const amount = days === yearDays ? full * 100 : Number(ratioCents(BigInt(full * 100 * days), BigInt(yearDays)));
  const reduction = incomeReduction(income);
  return reduction ? Math.max(0, Math.trunc((amount - reduction * 100) / 100)) * 100 : amount;
}

/** @param {unknown} item @param {number} n @param {number} yearDays */
function readDependant(item, n, yearDays) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) dependantsInvalid(`Dependant ${n} must be an object.`);
  const fields = /** @type {Record<string, unknown>} */ (item);
  const extra = Object.keys(fields).find((key) => !['kind', 'adjusted_taxable_income', 'days', 'shared'].includes(key));
  if (extra) dependantsInvalid(`Dependant ${n}: ${extra} is not a field.`);
  if (fields.shared === true) refuse('zone_tax_offset.shared_maintenance', ZONE_SHARED);
  if (fields.shared !== undefined && fields.shared !== false) dependantsInvalid(`Dependant ${n}: shared must be true or false.`);
  if (!['student', 'child'].includes(String(fields.kind))) {
    dependantsInvalid(`Dependant ${n}: say student (full-time, under 25) or child (not a student, under 21).`);
  }
  let income = 0;
  try {
    income = toCents(fields.adjusted_taxable_income);
  } catch {
    dependantsInvalid(`Dependant ${n}: give the adjusted taxable income as an amount from $0 to $1 billion.`);
  }
  const days = fields.days ?? yearDays;
  if (!Number.isInteger(days) || Number(days) < 0 || Number(days) > yearDays) {
    dependantsInvalid(`Dependant ${n}: days must be a whole number from 0 to ${yearDays}.`);
  }
  return { student: fields.kind === 'student', income, days: Number(days) };
}

/** The dependants' notional tax offsets in cents: $376 for each student and for the oldest
 * non-student child, $282 for each other non-student child where there are 2 or more (s 961-10);
 * non-student children are listed oldest first. @param {unknown} list @param {number} yearDays */
function dependantOffsets(list, yearDays) {
  if (list === undefined) return 0;
  if (!Array.isArray(list)) return dependantsInvalid('Dependants must be a list.');
  if (list.length > 50) dependantsInvalid('Enter at most 50 dependants.');
  const read = list.map((item, i) => readDependant(item, i + 1, yearDays));
  const children = read.filter((d) => !d.student).length;
  let seenChild = false;
  return read.reduce((total, { student, income, days }) => {
    const full = student || !seenChild || children < 2 ? 376 : 282;
    seenChild ||= !student;
    return total + notional(full, days, yearDays, income);
  }, 0);
}

/** The prior year as [its days in the year, years before `year`], refusing one that s 79A(3B) and
 * (4) do not take. @param {unknown} prior @param {string} year */
function priorYearGap(prior, year) {
  const text = typeof prior === 'string' ? prior : '';
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match || Number(match[2]) !== (Number(match[1]) + 1) % 100) {
    refuse('zone_tax_offset.prior_year_invalid', 'Enter the earlier year as an income year such as 2024-25.');
  }
  const gap = Number(year.slice(0, 4)) - Number(match[1]);
  if (gap === 5) {
    refuse('zone_tax_offset.prior_year_unclear', 'ITAA 1936 s 79A(4) makes a relevant preceding year ‘any of the next 4 '
      + 'preceding years of income other than the immediately preceding year’, read here as the second to fourth; the '
      + 'ATO’s Garry example carries days from the fifth. This calculator does not decide which reading is right.');
  }
  if (gap < 1 || gap > 4) {
    refuse('zone_tax_offset.prior_year_invalid', `The earlier year must be one of the 4 income years before ${year} `
      + '(ITAA 1936 s 79A(3B)(d) and (e)).');
  }
  return [daysInYear(text), gap];
}

/** @typedef {{prior_year?: string, prior_days?: number, continuous_residence?: boolean, includes_first_day?: boolean}} Carried */

/** Days carried from an earlier year, if given: [days, 2 to 4 years back, s 79A(3B)(e)'s
 * conditions met]. @param {Carried} a @param {string} year @returns {[number, boolean, boolean] | null} */
function carriedDays(a, year) {
  const conditions = a.continuous_residence !== undefined || a.includes_first_day !== undefined;
  if (a.prior_year === undefined && a.prior_days === undefined) {
    if (conditions) refuse('input.field_unknown', 'Continuous residence and the first day apply only with days carried from an earlier year.');
    return null;
  }
  if (a.prior_year === undefined || a.prior_days === undefined) {
    refuse('input.field_unknown', 'Enter both the earlier year and its days, or neither.');
  }
  const [length, gap] = priorYearGap(a.prior_year, year);
  const days = dayCount(a.prior_days, length, 'The earlier year’s days');
  if (length === 366 && days === 183) {
    refuse('zone_tax_offset.half_year_unclear', `183 days is exactly one-half of ${a.prior_year}, a 366-day year: `
      + 'ITAA 1936 s 79A(3B)(d)(ii) and (e)(ii) carry days of not more than one-half, but the ATO counts 183 days or '
      + 'more as residence for that year; this calculator does not decide.');
  }
  if (days * 2 > length) {
    refuse('zone_tax_offset.prior_year_invalid', `The days in ${a.prior_year} must be not more than one-half of that `
      + 'year (ITAA 1936 s 79A(3B)(d)(ii) and (e)(ii)): more made you a resident of the area that year.');
  }
  if (gap === 1 && conditions) {
    refuse('input.field_unknown', 'Continuous residence and the first day apply only to an earlier year 2 to 4 years back (s 79A(3B)(e)).');
  }
  return [days, gap > 1, a.continuous_residence === true && a.includes_first_day === true];
}

/** Whether the person is a resident of the area in the year (s 79A(3B)), and why.
 * @param {Carried} a @param {string} year @param {number} days @returns {[boolean, string]} */
function zoneResidence(a, year, days) {
  const yearDays = daysInYear(year);
  const carried = carriedDays(a, year);
  if (days * 2 > yearDays) return [true, 'more than one-half of the year (s 79A(3B)(a))'];
  let why = 'not more than one-half of the year (s 79A(3B)(a))';
  if (carried) {
    const [priorDays, earlier, met] = carried;
    if (days + priorDays <= 182) why = 'not more than one-half of the year, and the days carried add to 182 or fewer';
    else if (!earlier) return [true, 'with the immediately preceding year’s days, more than 182 (s 79A(3B)(d))'];
    else if (met) return [true, 'with a relevant preceding year’s days, more than 182 (s 79A(3B)(e))'];
    else why = 'days from a year 2 to 4 years back count only with continuous residence from the first day of this year (s 79A(3B)(e))';
  }
  if (yearDays === 366 && days === 183) {
    refuse('zone_tax_offset.half_year_unclear', '183 days is exactly one-half of a 366-day year: ITAA 1936 s 79A(3B)(a) '
      + 'needs more than one-half, but the ATO says 183 days or more; this calculator does not decide.');
  }
  return [false, why];
}

/**
 * @typedef {Carried & {year: string, area: string, days: number, dependants?: unknown,
 *   sole_parent_days?: number, invalid_carer_tax_offset?: string, remote_area_allowance?: string}} ZoneInput
 */

/** The zone or overseas forces tax offset: the fixed amount plus 50% (20% for Zone B) of the
 * relevant rebate amount, the dependant and sole parent notional tax offsets and the invalid and
 * invalid carer tax offset (s 79A(4), s 79B(6)). In a zone, for a resident of the area (s 79A(3B)),
 * less any remote area allowance (s 79A(2A)); for overseas forces, in full for more than one-half of
 * the year, otherwise times the days over 183 (T4 worksheet 6). Without cents (T4 label R).
 * @param {ZoneInput} a */
export function zoneOffset(a) {
  const year = supportedYear(a.year);
  if (!Object.hasOwn(ZONE_AREAS, a.area)) refuse('zone_tax_offset.area_invalid', 'Choose a special area, Zone A, Zone B or overseas forces.');
  const area = ZONE_AREAS[a.area];
  const forces = a.area === 'overseas_forces';
  const extra = forces && NOT_FOR_FORCES.find((key) => a[/** @type {'prior_year'} */ (key)] !== undefined);
  if (extra) refuse('input.field_unknown', 'Overseas forces service carries no days from an earlier year and takes no remote area allowance (s 79B).');
  const yearDays = daysInYear(year);
  const days = dayCount(a.days, yearDays, 'The days');
  const residence = forces ? null : zoneResidence(a, year, days);
  const dependants = dependantOffsets(a.dependants, yearDays);
  const soleDays = a.sole_parent_days === undefined ? null : dayCount(a.sole_parent_days, yearDays, 'The sole parent days');
  const carer = a.invalid_carer_tax_offset === undefined ? 0 : toCents(a.invalid_carer_tax_offset);
  const allowance = a.remote_area_allowance === undefined ? 0 : toCents(a.remote_area_allowance);
  if (soleDays !== null && dependants < 100) {
    refuse('zone_tax_offset.sole_parent_without_dependant', 'The sole parent notional tax offset needs a dependant '
      + 'notional tax offset of at least $1 (ITAA 1997 s 961-55(1)(b)).');
  }
  // ss 961-55 to 961-65: $1,607, or for part of the year the days times $1,607 over the days in the year, to the cent.
  const sole = soleDays === null ? 0 : soleDays === yearDays ? 160700 : Number(ratioCents(160700n, BigInt(yearDays))) * soleDays;
  const relevant = dependants + sole + carer;
  // In tenths of a cent: the fixed amount plus 5 or 2 tenths of the relevant rebate amount.
  const full = area[0] * 1000 + area[1] * relevant;
  let offset = 0;
  if (forces) offset = days * 2 > yearDays ? full : Number(BigInt(full) * BigInt(days) / 183n);
  else if (residence?.[0]) offset = Math.max(0, full - allowance * 10);
  return { resident: residence?.[0] ?? null, residence: residence?.[1] ?? null, days, yearDays,
    dependants: dollars(dependants), sole: dollars(sole), carer: dollars(carer), relevant: dollars(relevant),
    full: full / 1000, allowance: dollars(allowance), offset: Math.floor(offset / 1000) };
}
