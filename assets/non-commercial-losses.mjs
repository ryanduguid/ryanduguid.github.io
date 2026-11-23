// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The sole trader page's non-commercial losses form: a port of the australian-accounting command
// non-commercial-losses. Whether Division 35 of the Income Tax Assessment Act 1997 defers an
// individual's loss from a business activity for 2020-21 to 2026-27: the income requirement
// (s 35-10(2E)), the 4 tests (ss 35-30 to 35-45), the primary production and professional arts
// exception (s 35-10(4)) and the amount deferred (ss 35-10(2) and 35-15), read in Compilation No. 268
// (1 October 2026) on 22 November 2026; Division 35 reads the same in Compilations No. 210 and 223.
// Every amount is the person's figure for the activity; the Commissioner's discretion (s 35-55) is
// never decided here.
import { commandCents, decimalParts } from './money.mjs';
import { refuse } from './private-health-rebate.mjs';

export const NCL_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
// Section 35-10(2E), 35-30, 35-40(1), 35-45(1) and 35-10(4)(b), in cents.
const INCOME_REQUIREMENT = 25000000n;
const ASSESSABLE_INCOME = 2000000n;
const REAL_PROPERTY = 50000000n;
const OTHER_ASSETS = 10000000n;
const OTHER_INCOME = 4000000n;

/** The command's inputs in its order, with how each is read. */
const PARAMS = [['activity', 'raw'], ['assessable_income', 'dec'], ['deductions', 'dec'], ['brought_forward', 'dec'],
  ['part_year', 'raw'], ['earlier_years', 'json'], ['real_property_value', 'dec'], ['other_assets_value', 'dec'],
  ['taxable_income', 'dec'], ['business_losses', 'dec'], ['assessable_fhss_released_amount', 'dec'],
  ['reportable_fringe_benefits', 'dec'], ['reportable_super_contributions', 'dec'], ['total_net_investment_loss', 'dec'],
  ['net_exempt_income', 'dec'], ['year', 'raw']];
const OPTIONAL = ['assessable_income_estimate', 'other_income'];

/** Refuses text the command cannot read as a decimal. @param {unknown} value */
function readable(value) {
  if (typeof value !== 'string') return;
  if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', 'Decimal input exceeds 8192 bytes.');
  try {
    commandCents(value);
  } catch (error) {
    if (error.code === 'input.decimal_unreadable') throw error;
  }
}
const money = (/** @type {unknown} */ value) => (typeof value === 'string' ? commandCents(value)
  : refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.'));

/** An amount that may be negative, in cents: at most 2 decimal places and $1e12 either side of nil.
 * @param {unknown} value */
function signedCents(value) {
  const parts = typeof value === 'string' ? decimalParts(value.trim()) : null;
  const size = parts && parts.fraction.length <= 2 ? BigInt(parts.whole) * 100n + BigInt(parts.fraction.padEnd(2, '0')) : -1n;
  if (size < 0n || size > 10n ** 14n) {
    refuse('input.signed_amount_invalid', 'Amounts that may be negative must be finite Decimals, at most 2dp and 1e12 either side of nil.');
  }
  return parts?.negative ? -size : size;
}

/** An amount inside an earlier year: a decimal string of at most 32 characters, as a money amount. */
function statedCents(/** @type {Map<string, unknown>} */ fields, /** @type {string} */ name, /** @type {string} */ key) {
  if (!fields.has(key)) refuse('input.missing_field', `${name}: ${key} is required`);
  const value = fields.get(key);
  try {
    if (typeof value === 'string' && new TextEncoder().encode(value).length <= 32) return commandCents(value);
  } catch {
    // Refused below with the item's code.
  }
  return refuse('input.amount_invalid', `${name}: ${key} must be a decimal string, finite and non-negative, at most 2dp and 1e12.`);
}

/** The 4 income years before this one: how many were profit years (s 35-35). @param {unknown} given */
function earlierProfitYears(given) {
  const bad = () => refuse('non_commercial_losses.earlier_years_invalid', 'earlier_years must be a list of the 4 income '
    + 'years before this one, latest first, each null or an object with assessable_income and deductions.');
  if (!Array.isArray(given) || given.length !== 4) return bad();
  let profits = 0;
  given.forEach((year, i) => {
    if (year === null) return;
    if (typeof year !== 'object' || Array.isArray(year)) bad();
    const name = `earlier year ${i + 1}`;
    const fields = new Map(Object.entries(year));
    const key = [...fields.keys()].find((k) => k !== 'assessable_income' && k !== 'deductions');
    if (key !== undefined) refuse('input.field_unknown', `${name}: ${key} is not an input of an earlier year`);
    const income = statedCents(fields, name, 'assessable_income');
    if (statedCents(fields, name, 'deductions') < income) profits += 1;
  });
  return profits;
}

/** s 35-10(2E): taxable income without the business losses (a loss counts as nil) or the FHSS amount,
 * then the other 3 amounts, in cents. @param {Record<string, unknown>} input */
function incomeRequirement(input) {
  const taxable = signedCents(input.taxable_income);
  const [losses, fhss] = [input.business_losses, input.assessable_fhss_released_amount].map(money);
  const withoutLosses = taxable + losses - fhss;
  const requirementIncome = withoutLosses < 0n ? 0n : withoutLosses;
  const requirementTotal = requirementIncome + [input.reportable_fringe_benefits, input.reportable_super_contributions,
    input.total_net_investment_loss].map(money).reduce((a, b) => a + b, 0n);
  return { requirementIncome, requirementTotal };
}

/** The command's outcome code. @param {bigint} excess @param {boolean} ruleApplies @param {bigint} deferred */
function outcomeOf(excess, ruleApplies, deferred) {
  if (excess === 0n) return 'no_excess';
  if (!ruleApplies) return 'not_deferred';
  if (deferred === 0n) return 'exempt_income_absorbs';
  return deferred < excess ? 'deferred_less_exempt_income' : 'deferred';
}

/** The command's first pass: unknown keys, then each parameter present and each decimal readable.
 * @param {Record<string, unknown>} input */
function readParams(input) {
  const unknownKey = Object.keys(input).find((key) => !PARAMS.some(([name]) => name === key) && !OPTIONAL.includes(key));
  if (unknownKey !== undefined) refuse('input.field_unknown', `${unknownKey} is not an input of non-commercial-losses`);
  const given = new Map(Object.entries(input));
  for (const [key, kind] of PARAMS) {
    if (!given.has(key)) refuse('input.missing_field', `${key} is required`);
    if (kind === 'dec') readable(given.get(key));
  }
  for (const key of OPTIONAL) if (given.has(key)) readable(given.get(key));
}

/**
 * The command's result for its inputs, without scope_confirmed: amounts in cents.
 * @param {Record<string, unknown>} input
 */
export function nonCommercialLosses(input) {
  readParams(input);
  const year = /** @type {string} */ (input.year);
  if (!NCL_YEARS.includes(year)) refuse('period.unsupported', `Unsupported period ${String(year)}; supported: ${NCL_YEARS.join(', ')}.`);
  const activity = input.activity;
  if (activity !== 'other' && activity !== 'primary_production' && activity !== 'professional_arts') {
    refuse('non_commercial_losses.activity_invalid', 'activity must be other, primary_production or professional_arts.');
  }
  const excepted = activity !== 'other';
  if (typeof input.part_year !== 'boolean') refuse('input.flag_invalid', 'part_year must be a boolean.');
  const partYear = input.part_year;
  [[OPTIONAL[0], partYear], [OPTIONAL[1], excepted]].forEach(([key, wanted]) => {
    if (wanted && !Object.hasOwn(input, key)) refuse('input.missing_field', `${key} is required for these facts.`);
    if (!wanted && Object.hasOwn(input, key)) refuse('input.field_unknown', `${key} is not an input for these facts`);
  });
  const [income, deductions, broughtForward] = [input.assessable_income, input.deductions, input.brought_forward].map(money);
  const earlierProfits = earlierProfitYears(input.earlier_years);

  const { requirementIncome, requirementTotal } = incomeRequirement(input);
  const requirementMet = requirementTotal < INCOME_REQUIREMENT;

  // s 35-30: for a part year, the larger of the year's income and a reasonable full-year estimate.
  let measured = income;
  if (partYear) {
    const estimate = money(input.assessable_income_estimate);
    if (estimate > income) measured = estimate;
  }
  const profitYears = earlierProfits + (deductions < income ? 1 : 0);
  const [realProperty, otherAssets] = [input.real_property_value, input.other_assets_value].map(money);
  const tests = {
    assessable_income_test: measured >= ASSESSABLE_INCOME,
    profits_test: profitYears >= 3,
    real_property_test: realProperty >= REAL_PROPERTY,
    other_assets_test: otherAssets >= OTHER_ASSETS,
  };
  const exception = excepted && money(input.other_income) < OTHER_INCOME;
  const ruleApplies = !(requirementMet && Object.values(tests).some(Boolean)) && !exception;

  // s 35-10(2): the year's deductions, with amounts brought forward, over the activity's assessable
  // income; s 35-15 takes net exempt income off the amount deferred.
  const over = deductions + broughtForward - income;
  const excess = over < 0n ? 0n : over;
  const exempt = money(input.net_exempt_income);
  const deferred = ruleApplies ? (excess > exempt ? excess - exempt : 0n) : 0n;
  const deductible = ruleApplies ? 0n : excess;
  const outcome = outcomeOf(excess, ruleApplies, deferred);
  return {
    year, partYear, excepted, requirementMet, tests, profitYears, exception, ruleApplies, outcome,
    requirementIncome: Number(requirementIncome), requirementTotal: Number(requirementTotal), excess: Number(excess),
    deferred: Number(deferred), deductible: Number(deductible), measured: Number(measured),
  };
}

const OUTCOMES = {
  no_excess: 'The activity’s deductions are no more than its assessable income, so nothing is deferred',
  not_deferred: 'The loss is not deferred: section 35-10(2) does not apply, so it can be deducted against other income this year',
  exempt_income_absorbs: 'Section 35-10(2) applies, but net exempt income reduces the amount deferred to nil (section 35-15)',
  deferred_less_exempt_income: 'The loss less net exempt income (section 35-15) is deferred to the next year the activity is '
    + 'carried on (section 35-10(2)), unless the Commissioner decides under section 35-55 that the rule does not apply',
  deferred: 'The loss is deferred to the next year the activity is carried on (section 35-10(2)), unless the Commissioner '
    + 'decides under section 35-55 that the rule does not apply',
};

/** The sole trader page's non-commercial losses form. @param {(name: string) => string} value @param {(n: number) => string} aud */
export function nonCommercialLossesResult(value, aud) {
  const activity = value('ncl-activity');
  const partYear = value('ncl-part-year') === 'yes';
  const profitYears = Number(value('ncl-profit-years'));
  const r = nonCommercialLosses({
    year: value('ncl-year'), activity, assessable_income: value('ncl-income'), deductions: value('ncl-deductions'),
    brought_forward: value('ncl-brought-forward'), part_year: partYear,
    earlier_years: [0, 1, 2, 3].map((i) => (i < profitYears ? { assessable_income: '1', deductions: '0' } : null)),
    real_property_value: value('ncl-real-property'), other_assets_value: value('ncl-other-assets'),
    taxable_income: value('ncl-taxable'), business_losses: value('ncl-losses'), assessable_fhss_released_amount: value('ncl-fhss'),
    reportable_fringe_benefits: value('ncl-fringe'), reportable_super_contributions: value('ncl-super'),
    total_net_investment_loss: value('ncl-investment-loss'), net_exempt_income: value('ncl-exempt'),
    ...(partYear ? { assessable_income_estimate: value('ncl-estimate') } : {}),
    ...(activity === 'other' ? {} : { other_income: value('ncl-other-income') }),
  });
  const cents = (/** @type {number} */ amount) => aud(amount / 100);
  const met = (/** @type {boolean} */ passed) => (passed ? 'Met' : 'Not met');
  const passed = Object.values(r.tests).some(Boolean);
  return {
    inputs: `${r.year}, ${activity.replaceAll('_', ' ')} activity, assessable income ${cents(Number(money(value('ncl-income'))))}, `
      + `deductions ${cents(Number(money(value('ncl-deductions'))))}${partYear ? ', started or stopped in the year' : ''}`,
    principal: 7,
    rows: [['Income requirement total', `${cents(r.requirementTotal)}: ${met(r.requirementMet)}`],
      ['Assessable income test', met(r.tests.assessable_income_test)],
      ['Profits test', `${met(r.tests.profits_test)}: ${r.profitYears} of 5 years`],
      ['Real property test', met(r.tests.real_property_test)], ['Other assets test', met(r.tests.other_assets_test)],
      ['Excess of deductions over assessable income', cents(r.excess)], ['Deductible this year', cents(r.deductible)],
      ['Deferred', cents(r.deferred)]],
    note: `${OUTCOMES[r.outcome]}. ${r.exception ? 'The primary production and professional arts exception applies (section 35-10(4)). '
      : !r.requirementMet ? 'The income requirement is not met (section 35-10(2E)), so passing a test does not help. '
        : passed ? '' : 'No test is passed (sections 35-30 to 35-45). '}Whether the Commissioner would use the discretion in section 35-55 is not decided here`,
  };
}
