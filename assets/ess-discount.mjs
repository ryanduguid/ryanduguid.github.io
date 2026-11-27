// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// What ITAA 1997 Division 83A includes in one Australian resident's assessable income for an income year from
// 2020-21 to 2026-27 for employee share scheme interests acquired from 1 July 2015, and what s 83A-310 excludes for a
// forfeited one: the `ess-discount` command of ryanduguid/australian-accounting, with its inputs, steps, rounding and
// refusal codes in the order the command checks them. Its sources, read by the command on 22 November 2026: ITAA 1997
// compilation 268 (1 October 2026), which reads as compilation 234 (1 July 2022) and, but for the cessation of
// employment taxing point, compilation 210 (1 July 2020); Act No. 8 of 2022 Sch 10 item 9; and the Income Tax
// Assessment (1997 Act) Regulations 2021, compilation 16 (27 June 2026). Values, conditions and dates are the user's
// established facts: the calculator never values a share.

import { add, cmp, dateText, incomeYear, int, lit, mul, refuse, shown, sub } from './ess-core.mjs';
import { amountOf, interests as readInterests } from './ess-input.mjs';
import { deferred } from './ess-deferral.mjs';

/** @typedef {import('./ess-core.mjs').Dec} Dec */
/** @typedef {import('./ess-input.mjs').Interest} Interest */
/** @typedef {import('./ess-input.mjs').Held} Held */
/** @typedef {import('./ess-input.mjs').Conditions} Conditions */

export { MAX_INTERESTS, CAUSES } from './ess-input.mjs';
/** The income years the command takes, newest first. */
export const ESS_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21'];
const INPUTS = ['interests', 'income_test', 'foreign_employment', 'year', 'scope_confirmed'];
const INCOME_KEYS = ['taxable_income', 'reportable_fringe_benefits_total', 'reportable_super_contributions',
  'total_net_investment_loss'];
/** ss 83A-35(2)(a) and (b), 83A-33(4) and (5)(a) and 83A-105(4)(c). */
const RATES = { reduction_cap: '1000', income_test_limit: '180000', start_up_turnover_limit: '50000000',
  start_up_discount_limit: '0.15', salary_sacrifice_limit: '5000' };
const ZERO = int(0);

const FOREIGN = 'Part of a discount relating to employment outside Australia is foreign source income (ss 83A-25(2) and '
  + '83A-110(2)), and foreign and temporary residents are taxed on it differently; this worksheet takes only an Australian '
  + 'resident, not a temporary resident, whose interests relate wholly to employment in Australia.';
const START_UP_RULE = 'ITAA 1997 s 83A-33: the start-up concession reduces the amount included for the interest to nil';
const UPFRONT_RULE = 'ITAA 1997 s 83A-25(1): the discount is included in the income year of acquisition; Subdivision 83A-C '
  + 'does not apply (s 83A-105(1))';
const FORFEITURE_RULE = 'ITAA 1997 s 83A-310: Division 83A (but Subdivision 83A-E) is taken never to have applied where an '
  + 'amount was included and the interest is forfeited, or a right lost without disposal or exercise, not by a choice other '
  + 'than to cease employment or (for a right) to let it lapse or be cancelled, nor by a condition protecting against a fall '
  + 'in market value; the earlier assessment may be amended';
/** The authority for each step, as the command gives them. */
export const AUTHORITIES = {
  discount: 'ITAA 1997 s 83A-25(1) with s 83A-315: market value when acquired (for an unlisted right, the regulations\' '
    + 'value where chosen) less the consideration',
  start_up_discounts: START_UP_RULE,
  upfront_eligible_discounts: 'Question 12 label D: discounts in the year\'s acquisitions taxed upfront that meet ss '
    + '83A-35(6), (7) and 83A-45',
  deferred_amounts: 'ITAA 1997 s 83A-110(1): market value at the deferred taxing point (ss 83A-115, 83A-120) less the cost '
    + 'base, for taxing points in the year; question 12 label F',
  reduction: 'ITAA 1997 s 83A-35(1) and (2): label D, at most $1,000, where taxable income, reportable fringe benefits, '
    + 'reportable super contributions and total net investment loss total $180,000 or less',
  assessable_discount: 'Question 12 label B: labels D, E and F less the reduction',
};

/** s 83A-45(1), (2), (3) and (6). @param {Conditions} c */
const general = (c) => c.employed && c.ordinarySharesOnly && c.notShareTradingCompany && c.tenPercentLimit;
/** All of s 83A-45: the general conditions and the minimum holding period. @param {Conditions} c */
const further = (c) => general(c) && c.minimumHoldingPeriod;
/** @param {Dec} v */
const positive = (v) => cmp(v, ZERO) > 0;

/** s 83A-33(1): subsections (2) to (6), s 83A-45 and, for a share, s 83A-105(2). @param {boolean} share
 * @param {Held} held @param {Dec} discount */
function startUp(share, held, discount) {
  const c = held.conditions;
  const s = c.startUp;
  if (s === null) return false;
  const market = held.right === null ? cmp(discount, mul(lit(RATES.start_up_discount_limit), held.value)) <= 0
    : cmp(held.right.exercisePrice, held.right.shareMarketValue) >= 0;
  const company = s.unlisted && s.underTenYears && cmp(s.turnover, lit(RATES.start_up_turnover_limit)) <= 0;
  return company && market && s.employerResident && further(c) && (!share || c.broadAvailability);
}

/** s 83A-105(1)(b) to (d): the subsection that defers, if one does. @param {boolean} share @param {Conditions} c
 * @param {boolean} sacrificeOk */
function deferralRule(share, c, sacrificeOk) {
  if (!general(c) || (share && !c.broadAvailability)) return null;
  if (c.realRisk) return 's 83A-105(3)';
  if (share && sacrificeOk) return 's 83A-105(4)';
  return !share && c.deferralStated ? 's 83A-105(6)' : null;
}

/** A held interest's discount and whether s 83A-33 reduces it. @param {Interest} i */
function assess(i) {
  if (i.held === null) return null;
  const discount = sub(i.held.value, i.held.consideration);
  return { discount, startUp: positive(discount) && startUp(i.kind === 'share', i.held, discount) };
}
/** @typedef {NonNullable<ReturnType<typeof assess>>} Assessed */

/** A salary sacrificed interest whose discount is its whole value and not a start-up's. @param {Held} held
 * @param {Assessed} a */
const wholeValue = (held, a) => held.conditions.salarySacrifice && !a.startUp && positive(a.discount)
  && cmp(a.discount, held.value) === 0;

/** A share relying on s 83A-105(4): salary sacrificed, no real risk, the discount its market value, otherwise
 * deferred. @param {Interest} i @param {Assessed} a */
function sacrificed(i, a) {
  const held = /** @type {Held} */ (i.held);
  const c = held.conditions;
  return i.kind === 'share' && !c.realRisk && wholeValue(held, a) && general(c) && c.broadAvailability;
}

/** s 83A-105(4)(c) and (5): whether each year's salary sacrificed shares total $5,000 or less at acquisition. A
 * forfeited interest, or a salary sacrificed one at a real risk of forfeiture that s 83A-105(3) defers, may count too:
 * beside shares relying on subsection (4) it is refused. @param {Interest[]} all @param {(Assessed | null)[]} assessed */
function sacrificeYears(all, assessed) {
  /** @type {Map<string, Dec>} */
  const totals = new Map();
  const unsettled = [];
  all.forEach((i, n) => {
    const year = incomeYear(i.acquired);
    const a = assessed[n];
    if (i.held === null || a === null) unsettled.push(year);
    else if (sacrificed(i, a)) totals.set(year, add(totals.get(year) ?? ZERO, i.held.value));
    else if (i.held.conditions.realRisk && wholeValue(i.held, a)
      && deferralRule(i.kind === 'share', i.held.conditions, false) === 's 83A-105(3)') unsettled.push(year);
  });
  const year = unsettled.find((y) => totals.has(y));
  if (year !== undefined) {
    refuse('ess_discount.salary_sacrifice_unclear', `In ${year} salary sacrificed interests at a real risk of forfeiture, or `
      + 'forfeited interests, sit beside shares relying on s 83A-105(4); whether the first count toward the $5,000 of '
      + 's 83A-105(4)(c) is not settled here: work them separately.');
  }
  return new Map([...totals].map(([y, total]) => [y, cmp(total, lit(RATES.salary_sacrifice_limit)) <= 0]));
}

/** @typedef {{eligible: Dec, other: Dec, deferred: Dec, startUp: Dec, excluded: Map<string, Dec>}} Totals */
/** @typedef {[string, string, [string, Dec] | null]} Treated */

/** Subdivision 83A-C: the amount at the taxing point, in its income year. @param {Interest} i @param {string} year
 * @param {string} rule @param {Totals} totals @param {Record<string, unknown>} row @returns {Treated} */
function treatDeferred(i, year, rule, totals, row) {
  const held = /** @type {Held} */ (i.held);
  const [point, value, detail] = deferred(held, i.kind === 'share', i.acquired);
  Object.assign(row, detail);
  const pointYear = incomeYear(point);
  if (value === null && pointYear === year) {
    refuse('ess_discount.taxing_point_value', `${held.reader.name}: the deferred taxing point is ${detail.deferred_taxing_point} `
      + 'in this year; give taxing_point_value with that date and the market value then (s 83A-110(1)).');
  }
  const amount = value ?? ZERO;
  if (pointYear === year) totals.deferred = add(totals.deferred, amount);
  return ['deferred', rule, [pointYear, amount]];
}

/** Subdivision 83A-B or 83A-C, s 83A-33, and the totals the interest joins. @param {Interest} i @param {string} year
 * @param {Assessed} a @param {boolean} sacrificeOk @param {Totals} totals @param {Record<string, unknown>} row
 * @returns {Treated} */
function treat(i, year, a, sacrificeOk, totals, row) {
  const acquiredYear = incomeYear(i.acquired);
  const inYear = acquiredYear === year;
  if (!positive(a.discount)) return ['no_discount', 'ITAA 1997 s 83A-20(1): not acquired at a discount', null];
  if (a.startUp) {
    if (inYear) totals.startUp = add(totals.startUp, a.discount);
    return ['start_up', START_UP_RULE, [acquiredYear, ZERO]];
  }
  const c = /** @type {Held} */ (i.held).conditions;
  const rule = deferralRule(i.kind === 'share', c, sacrificeOk);
  if (rule !== null) return treatDeferred(i, year, rule, totals, row);
  const eligible = c.nonDiscriminatory && !c.realRisk && further(c);
  if (inYear && eligible) totals.eligible = add(totals.eligible, a.discount);
  if (inYear && !eligible) totals.other = add(totals.other, a.discount);
  return [eligible ? 'upfront_eligible' : 'upfront', UPFRONT_RULE, [acquiredYear, a.discount]];
}

/** One held interest's row. @param {Interest} i @param {string} year @param {Assessed} a @param {boolean} sacrificeOk
 * @param {Totals} totals */
function heldRow(i, year, a, sacrificeOk, totals) {
  const held = /** @type {Held} */ (i.held);
  /** @type {Record<string, unknown>} */
  const row = { interest: i.number, kind: i.kind, acquired: dateText(i.acquired),
    consideration: shown(held.consideration), value_at_acquisition: shown(held.value), valuation: held.valuation,
    discount: shown(cmp(a.discount, ZERO) < 0 ? ZERO : a.discount) };
  const [treatment, rule, amount] = treat(i, year, a, sacrificeOk, totals, row);
  held.reader.finish(`an interest whose treatment is ${treatment}: the deferral facts are taken only where Subdivision `
    + '83A-C applies');
  Object.assign(row, { treatment, rule, income_year: amount?.[0] ?? null,
    amount_in_year: shown(amount !== null && amount[0] === year ? amount[1] : ZERO) });
  return row;
}

/** s 83A-310: whether the amount included is excluded, and the row. @param {Interest} i @param {Totals} totals */
function forfeitedRow(i, totals) {
  const f = /** @type {import('./ess-input.mjs').Forfeiture} */ (i.forfeited);
  const notAChoice = ['scheme_condition', 'ceased_employment', 'lapsed_unexercised', 'cancellation_allowed'].includes(f.cause);
  const excluded = notAChoice && !f.protectsAgainstFall && !f.considerationReceived && positive(f.amountIncluded);
  const amount = excluded ? f.amountIncluded : ZERO;
  if (excluded) totals.excluded.set(f.yearIncluded, add(totals.excluded.get(f.yearIncluded) ?? ZERO, amount));
  return { interest: i.number, kind: i.kind, treatment: 'forfeited', rule: FORFEITURE_RULE, cause: f.cause, excluded,
    amount_excluded: shown(amount), year_included: f.yearIncluded };
}

/** s 83A-35(2)(b)(i) to (iv), summed; null for `null`. @param {unknown} test */
function adjustedTaxableIncome(test) {
  if (test === null) return null;
  if (typeof test !== 'object' || Array.isArray(test)) {
    refuse('ess_discount.income_test_invalid', 'income_test must be an object with taxable_income, reportable_fringe_benefits_total, '
      + 'reportable_super_contributions and total_net_investment_loss, or null.');
  }
  const fields = new Map(Object.entries(/** @type {object} */ (test)));
  const unknown = [...fields.keys()].find((k) => !INCOME_KEYS.includes(k));
  if (unknown !== undefined) refuse('input.field_unknown', `income_test: ${unknown} is not an input of income_test`);
  return INCOME_KEYS.reduce((total, key) => {
    if (!fields.has(key)) refuse('input.missing_field', `income_test: ${key} is required`);
    const v = amountOf(fields.get(key));
    if (v === null) {
      refuse('input.amount_invalid', `income_test: ${key} must be a decimal string, finite and non-negative, at most 2dp and 1e12.`);
    }
    return add(total, v);
  }, ZERO);
}

/** s 83A-35: the reduction, and the adjusted taxable income when given. @param {Dec} eligible @param {unknown} test
 * @returns {[Dec, Dec | null]} */
function reduction(eligible, test) {
  const adjusted = adjustedTaxableIncome(test);
  if (eligible.c === 0n) return [ZERO, adjusted];
  if (adjusted === null) {
    refuse('input.missing_field', 'income_test is required with an upfront discount eligible for the reduction (s 83A-35(2)(b)).');
  }
  const cap = lit(RATES.reduction_cap);
  const cut = cmp(adjusted, lit(RATES.income_test_limit)) > 0 ? ZERO : (cmp(cap, eligible) < 0 ? cap : eligible);
  return [cut, adjusted];
}

/** The command's checks of the names, the scope, the year and the foreign employment flag. @param {Record<string, unknown>} input */
function checked(input) {
  const unknown = Object.keys(input).find((key) => !INPUTS.includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an input of ess-discount`);
  for (const key of INPUTS) if (!Object.hasOwn(input, key)) refuse('input.missing_field', `${key} is required`);
  const given = new Map(Object.entries(input));
  if (given.get('scope_confirmed') !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = given.get('year');
  if (typeof year !== 'string' || !ESS_YEARS.includes(year)) {
    refuse('period.unsupported', `Unsupported period; supported: ${[...ESS_YEARS].reverse().join(', ')}.`);
  }
  if (typeof given.get('foreign_employment') !== 'boolean') refuse('input.flag_invalid', 'foreign_employment must be a boolean.');
  if (given.get('foreign_employment')) refuse('ess_discount.foreign_employment', FOREIGN);
  return { year, given };
}

/**
 * What Division 83A includes for the year, with each interest's treatment, as the command reports them: amounts to the
 * cent (question 12 labels D, E, F and B, the start-up discounts and the adjusted taxable income when given), the
 * rates, a row for each interest and the forfeiture exclusions by the year the amount was included.
 * @param {Record<string, unknown>} input the command's inputs
 */
export function essDiscount(input) {
  const { year, given } = checked(input);
  const all = readInterests(given.get('interests'));
  const assessed = all.map(assess);
  const years = sacrificeYears(all, assessed);
  /** @type {Totals} */
  const totals = { eligible: ZERO, other: ZERO, deferred: ZERO, startUp: ZERO, excluded: new Map() };
  const rows = all.map((i, n) => {
    const a = assessed[n];
    if (i.held === null || a === null) return forfeitedRow(i, totals);
    return heldRow(i, year, a, sacrificed(i, a) && years.get(incomeYear(i.acquired)) === true, totals);
  });
  const [cut, adjusted] = reduction(totals.eligible, given.get('income_test'));
  /** @type {[string, Dec][]} */
  const amounts = [['upfront_eligible_discounts', totals.eligible], ['upfront_other_discounts', totals.other],
    ['deferred_amounts', totals.deferred], ['reduction', cut],
    ['assessable_discount', sub(add(add(totals.eligible, totals.other), totals.deferred), cut)],
    ['start_up_discounts', totals.startUp]];
  if (adjusted !== null) amounts.push(['adjusted_taxable_income', adjusted]);
  return { year, amounts: Object.fromEntries(amounts.map(([k, v]) => [k, shown(v)])), rates: { ...RATES }, interests: rows,
    forfeiture_exclusions: Object.fromEntries([...totals.excluded].sort(([x], [y]) => (x < y ? -1 : 1)).map(([y, v]) => [y, shown(v)])),
    authorities: AUTHORITIES };
}

/** The form's yes or no conditions and the command's names for them; the last 2 are a share's and a right's own. */
const FORM_CONDITIONS = [['employed', 'employed'], ['ordinary-shares-only', 'ordinary_shares_only'],
  ['not-share-trading-company', 'not_share_trading_company'], ['minimum-holding-period', 'minimum_holding_period'],
  ['ten-percent-limit', 'ten_percent_limit'], ['non-discriminatory', 'non_discriminatory'], ['real-risk', 'real_risk_of_forfeiture'],
  ['salary-sacrifice', 'salary_sacrifice'], ['broad-availability', 'broad_availability'], ['deferral-stated', 'deferral_stated']];
/** The form's deferral facts: with any of them entered the interest states them all. */
const FORM_DEFERRAL = ['restrictions-lifted', 'exercised', 'share-lifted', 'employment-ended', 'disposed', 'cost-base', 'tp-date',
  'tp-value'];
const FORM_INCOME = [['taxable-income', 'taxable_income'], ['fringe-benefits', 'reportable_fringe_benefits_total'],
  ['super-contributions', 'reportable_super_contributions'], ['investment-loss', 'total_net_investment_loss']];

/** The interest's deferral facts from the form, or none when none is entered; a blank day is one that has not
 * happened, and a blank day employment ended (asked only before 1 July 2022) means still employed.
 * @param {(name: string) => string} value @param {boolean} share @param {string} acquired */
function formDeferral(value, share, acquired) {
  const text = (/** @type {string} */ name) => value(name).trim();
  if (!FORM_DEFERRAL.some((name) => text(name) !== '')) return {};
  const dayOrNull = (/** @type {string} */ name) => text(name) || null;
  /** @type {Record<string, unknown>} */
  const facts = { restrictions_lifted: dayOrNull('restrictions-lifted') };
  if (!share) Object.assign(facts, { exercised: dayOrNull('exercised'), share_restrictions_lifted: dayOrNull('share-lifted') });
  if (acquired < '2022-07-01') facts.employment_ended = dayOrNull('employment-ended');
  return { ...facts, disposed: dayOrNull('disposed'), cost_base: text('cost-base') || '0',
    taxing_point_value: text('tp-value') ? { date: text('tp-date'), market_value: text('tp-value') } : null };
}

/** The command's inputs from the page's form: one interest. @param {(name: string) => string} value */
export function essDiscountFormInput(value) {
  const text = (/** @type {string} */ name) => value(name).trim();
  const share = value('kind') === 'share';
  /** @type {Record<string, unknown>} */
  const item = { kind: share ? 'share' : 'right', acquired: text('acquired'), consideration: text('consideration') || '0' };
  if (!share) {
    Object.assign(item, { exercise_price: text('exercise-price') || '0', share_market_value: text('share-market-value') || '0',
      last_exercise_day: text('last-exercise-day'), valuation: value('valuation') });
  }
  if (share || value('valuation') !== 'regulations') item.market_value = text('market-value') || '0';
  const own = share ? 'broad-availability' : 'deferral-stated';
  item.conditions = Object.fromEntries(FORM_CONDITIONS.slice(0, 8).concat(FORM_CONDITIONS.filter(([name]) => name === own))
    .map(([name, key]) => [key, value(name) === 'yes']));
  item.start_up = value('start-up') === 'yes' ? { unlisted: value('unlisted') === 'yes',
    incorporated_under_10_years: value('under-ten-years') === 'yes', aggregated_turnover: text('turnover') || '0',
    employer_australian_resident: value('employer-resident') === 'yes' } : null;
  Object.assign(item, formDeferral(value, share, /** @type {string} */ (item.acquired)));
  const income = FORM_INCOME.some(([name]) => text(name) !== '')
    ? Object.fromEntries(FORM_INCOME.map(([name, key]) => [key, text(name) || '0'])) : null;
  return { interests: [item], income_test: income, foreign_employment: false, year: value('year'), scope_confirmed: true };
}

const TREATMENTS = new Map([['no_discount', 'No discount (s 83A-20)'], ['start_up', 'Start-up concession: nil included (s 83A-33)'],
  ['upfront_eligible', 'Taxed upfront, eligible for the reduction (s 83A-25)'], ['upfront', 'Taxed upfront (s 83A-25)']]);

/** The page's result. @param {(name: string) => string} value @param {(n: number) => string} aud */
export function essDiscountResult(value, aud) {
  const r = essDiscount(essDiscountFormInput(value));
  const row = /** @type {Record<string, any>} */ (r.interests[0]);
  const money = (/** @type {string} */ key) => aud(Number(new Map(Object.entries(r.amounts)).get(key)));
  const rows = [['Discount on the interest', aud(Number(row.discount))],
    ['Treatment', TREATMENTS.get(row.treatment) ?? `Deferred (${row.rule})`]];
  if (row.deferred_taxing_point) rows.push(['Deferred taxing point', `${row.deferred_taxing_point} (${row.taxing_point_rule})`]);
  if (row.treatment === 'start_up') rows.push(['Start-up discount not included', money('start_up_discounts')]);
  rows.push(['Upfront discounts eligible for the reduction (label D)', money('upfront_eligible_discounts')],
    ['Other upfront discounts (label E)', money('upfront_other_discounts')], ['Deferred discounts (label F)', money('deferred_amounts')],
    ['Less the reduction (s 83A-35)', money('reduction')], [`Assessable discount for ${r.year} (label B)`, money('assessable_discount')]);
  const elsewhere = row.income_year !== null && row.income_year !== r.year;
  const note = elsewhere ? `The interest’s amount is included in ${row.income_year}, not ${r.year}` : 'Amounts are rounded to the cent';
  return { inputs: `${r.year}; ${row.kind} acquired ${row.acquired} for ${aud(Number(row.consideration))}, worth `
    + `${aud(Number(row.value_at_acquisition))}`, rows, principal: rows.length - 1, note };
}
