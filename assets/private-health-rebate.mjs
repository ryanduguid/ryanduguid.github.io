// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The private health insurance rebate at tax time for one person and one income year from 2020-21
// to 2026-27: the tier from income for surcharge purposes, the rebate percentage for each line of
// the private health insurance statement, the share of the PHII benefit, the refundable private
// health insurance tax offset (ITAA 1997 Subdivision 61-G) and the excess premium reduction to
// repay (Private Health Insurance Act 2007 s 282-18). Ported from the australian-accounting command
// private-health-insurance-rebate, with its refusal codes. Sources read 22 November 2026: PHI Act
// Compilation No. 42 (19 September 2026), ITAA 1997 Compilation No. 268 (1 October 2026), the
// ATO's rebate rates pages for 2020-21 to 2026-27 and 'Your private health insurance statement'.
import { number, ratioCents } from './money.mjs';
import { incomeYear, SURCHARGE_THRESHOLDS } from './income-tax.mjs';

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
export function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** One of the page's income years, refusing another with the commands' code. @param {string} year */
export function supportedYear(year) {
  try {
    return incomeYear(year);
  } catch (error) {
    return refuse('period.unsupported', /** @type {Error} */ (error).message);
  }
}

// PHI Act s 22-15(1) to (5E): the percentages in thousandths of a per cent for each adjustment year,
// keyed by the calendar year of the 1 April it starts on; rows for the oldest person insured under
// 65, 65 to 69 and 70 or over, columns for the base tier, tier 1 and tier 2. Tier 3 is nil
// (s 22-15(4)). The percentages from 1 April 2027 were not published on 22 November 2026.
const FROM_2021 = [[24608, 16405, 8202], [28710, 20507, 12303], [32812, 24608, 16405]];
/** @type {Map<number, number[][]>} */
const PERCENTAGES = new Map([
  [2020, [[25059, 16706, 8352], [29236, 20883, 12529], [33413, 25059, 16706]]],
  [2021, FROM_2021], [2022, FROM_2021], [2023, FROM_2021], [2024, FROM_2021],
  [2025, [[24288, 16192, 8095], [28337, 20240, 12143], [32385, 24288, 16192]]],
  [2026, [[24118, 16079, 8038], [28139, 20098, 12058], [32158, 24118, 16079]]],
]);

/** The statement's benefit codes: [paid from 1 April, the age band's row]. */
/** @type {Map<number, [number, number]>} */
export const BENEFIT_CODES = new Map([[30, [0, 0]], [31, [1, 0]], [35, [0, 1]], [36, [1, 1]], [40, [0, 2]], [41, [1, 2]]]);
export const TIERS = ['base', 'tier_1', 'tier_2', 'tier_3'];
const LINE_FIELDS = ['premiums_eligible', 'rebate_received', 'benefit_code'];
export const LHC_LOADING = 'Lifetime health cover loading is outside the rebate (PHI Act s 22-15(6)): give the premiums '
  + 'eligible without it, as label J of the statement does. The loading itself is not worked out here.';

/** @param {string} message @returns {never} */
const invalid = (message) => refuse('private_health_insurance_rebate.lines_invalid', message);

/** Dollars and cents from 0 to $1 billion, in cents. @param {unknown} value @param {string} what */
function lineCents(value, what) {
  try {
    return Math.round(number(value, { max: 1e9, money: true }) * 100);
  } catch {
    return invalid(`${what} must be an amount from $0 to $1 billion, to the cent.`);
  }
}

/** @param {unknown} line @param {number} n */
function readLine(line, n) {
  if (!line || typeof line !== 'object' || Array.isArray(line)) invalid(`Line ${n} must be an object.`);
  const fields = /** @type {Record<string, unknown>} */ (line);
  if (Object.hasOwn(fields, 'lifetime_health_cover_loading')) refuse('private_health_insurance_rebate.lhc_loading', LHC_LOADING);
  const extra = Object.keys(fields).find((key) => !LINE_FIELDS.includes(key));
  if (extra) invalid(`Line ${n}: ${extra} is not a field of a line.`);
  const code = fields.benefit_code;
  if (!Number.isInteger(code) || !BENEFIT_CODES.has(/** @type {number} */ (code))) {
    invalid(`Line ${n}: the benefit code must be 30, 31, 35, 36, 40 or 41, the codes the statement uses.`);
  }
  return { code: Number(code), premiums: lineCents(fields.premiums_eligible, `Line ${n}’s premiums eligible`),
    received: lineCents(fields.rebate_received, `Line ${n}’s rebate received`) };
}

/** The percentage for a line in thousandths of a per cent: premiums paid before 1 April take the
 * adjustment year from 1 April of the income year's first calendar year, those paid from 1 April
 * the next (s 22-15(5C) and (5D)). @param {string} year @param {number} code @param {number} tier */
function percentage(year, code, tier) {
  const [later, band] = /** @type {[number, number]} */ (BENEFIT_CODES.get(code));
  const start = Number(year.slice(0, 4)) + later;
  const table = PERCENTAGES.get(start);
  if (!table) {
    refuse('private_health_insurance_rebate.rate_unpublished', `Benefit code ${code}: the rebate percentages from `
      + `1 April ${start} were not published when this was checked on 22 November 2026 (the ATO: they `
      + `‘will become available in March ${start}’).`);
  }
  return tier === 3 ? 0 : /** @type {number} */ (table.at(band)?.at(tier));
}

/** @typedef {{benefit_code: number, premiums_eligible: string, rebate_received: string}} StatementLine */
/**
 * @typedef {{year: string, income_for_surcharge_purposes: string, spouse_income_for_surcharge_purposes?: string,
 *   maintained_dependent_person?: boolean, dependent_children?: number, lines: StatementLine[]}} RebateInput
 */

/** The rebate at tax time. A person married on 30 June (with a spouse's income) or who maintained a
 * dependent child or sibling on any day is on the families table (s 22-30(1) and (2)), whose
 * thresholds double the singles thresholds and rise by $1,500 for each dependent child after the
 * first (s 22-40); a tier is reached when the income exceeds its threshold. Each line's share of
 * the PHII benefit rounds half up to the cent, as the ATO's worked examples do; its offset is the
 * share less the rebate received (s 61-210) and its excess the reverse (s 282-18(3)), each not below
 * nil and not netted across lines. Amounts are in dollars.
 * @param {RebateInput} input */
export function privateHealthRebate(input) {
  const year = supportedYear(input.year);
  const own = lineCents(input.income_for_surcharge_purposes, 'Income for surcharge purposes');
  const spouse = input.spouse_income_for_surcharge_purposes === undefined ? null
    : lineCents(input.spouse_income_for_surcharge_purposes, 'The spouse’s income for surcharge purposes');
  const children = input.dependent_children ?? 0;
  const families = spouse !== null || input.maintained_dependent_person === true;
  if (children > 0 && !families) {
    refuse('input.field_unknown', 'Dependent children raise only the family thresholds (PHI Act s 22-40(4)): for the '
      + 'rebate, say whether you maintained a dependent child or sibling, or give a spouse.');
  }
  const { lines } = input;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 100) {
    invalid('Enter 1 to 100 lines from the private health insurance statement.');
  }
  const read = lines.map((line, i) => readLine(line, i + 1));
  const thresholds = /** @type {number[]} */ (new Map(Object.entries(SURCHARGE_THRESHOLDS)).get(year))
    .map((amount) => (families ? 2 * amount + 1500 * Math.max(0, children - 1) : amount) * 100);
  const income = own + (spouse ?? 0);
  const tier = thresholds.filter((threshold) => income > threshold).length;
  const worked = read.map(({ code, premiums, received }) => {
    const pct = percentage(year, code, tier);
    const share = Number(ratioCents(BigInt(premiums) * BigInt(pct), 100000n));
    return { code, percentage: pct / 1000, premiums: premiums / 100, received: received / 100, share: share / 100,
      offset: Math.max(0, share - received) / 100, excess: Math.max(0, received - share) / 100 };
  });
  const sum = (/** @type {(line: typeof worked[number]) => number} */ pick) => worked
    .reduce((total, line) => total + Math.round(pick(line) * 100), 0) / 100;
  return { tier: /** @type {string} */ (TIERS.at(tier)), families, income: income / 100, thresholds: thresholds.map((t) => t / 100), lines: worked,
    share: sum((l) => l.share), received: sum((l) => l.received), offset: sum((l) => l.offset), excess: sum((l) => l.excess) };
}
