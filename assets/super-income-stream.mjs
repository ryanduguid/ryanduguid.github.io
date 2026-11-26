// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The amount a fund withholds from one superannuation income stream payment under Schedule 13, Part A:
// the `super-withholding` command of ryanduguid/australian-accounting given `income_stream_period`, ported
// line for line (its inputs, rounding and refusal codes, in the order the command checks them). The
// command read Schedule 13 of the Taxation Administration (Withholding Schedules) Instruments 2024
// (F2024L00664), 2025 (F2025L00647), (No. 2) 2025 (F2025L01016) and 2026 (F2026L00716), and ITAA 1997
// Divisions 301 and 302, on 23 November 2026. Step 2 is Schedule 1's weekly formula on scale 2, or
// scale 1 without the tax-free threshold. Every amount is whole cents or an exact fraction of them,
// rounded once.

import { SCHEDULE_1, weekly } from './payg-withholding.mjs';
import { ageOn, civil, dayText, flag, lumpSum, refuse, when } from './super-benefit-tax.mjs';

/** The inputs only an income stream payment takes. */
export const STREAM_OPTIONAL = ['income_stream_period', 'tax_free_threshold_claimed', 'capped_defined_benefit',
  'deceased_aged_60_or_over'];
/** Schedule 13 as read covers income years from this one. */
export const STREAM_FIRST_YEAR = '2024-25';
/** Each period's weekly equivalent as `amount × per / times`. */
const PERIODS = /** @type {Record<string, [bigint, bigint]>} */ ({ weekly: [1n, 1n], fortnightly: [1n, 2n],
  monthly: [3n, 13n], quarterly: [1n, 13n] });
/** Schedule 1, scale 2: the singles Medicare levy threshold and shade-in point, weekly; and Schedule 13 Part A
 * step 4's limit of the offset adjustment ('less than $1,181' to 2025-26, '$1,216' in F2026L00716). */
const LEVY = /** @type {Record<string, [number, number, number]>} */ ({ '2024-25': [500, 625, 1181],
  '2025-26': [500, 625, 1181], '2026-27': [538, 673, 1216] });
const LUMP_SUM_ONLY = ['terminal_medical_condition', 'service_before_july_1983', 'low_rate_cap_used',
  'untaxed_plan_cap_used', 'other_lump_sums_this_year'];
/** Part A's offset rows: the element the offset is on and its rate in hundredths. */
const ROWS = /** @type {Record<string, [string, bigint] | null>} */ ({
  income_stream_member_under_60: null,
  income_stream_disability_under_60: ['taxed', 15n],
  income_stream_member_aged_60_or_over: ['untaxed', 10n],
  income_stream_dependant_under_60: ['taxed', 15n],
  income_stream_dependant_aged_60_or_over: ['untaxed', 10n],
});

/** Units of a cent, as the command prints them: to the cent, half up. @param {bigint} units @param {bigint} per cent */
function centsOf(units, per) {
  const c = (2n * units + per) / (2n * per);
  return `${c / 100n}.${String(c % 100n).padStart(2, '0')}`;
}
/** A coefficient as the command prints it. @param {number} v times 10,000 */
const coefficient = (v) => (v === 0 ? '0' : `${v < 0 ? '-' : ''}${Math.trunc(Math.abs(v) / 10000)}.${String(Math.abs(v) % 10000).padStart(4, '0')}`);

/** The payee's age and Part A row, refusing what Part A does not settle.
 * @param {Record<string, unknown>} input @param {number[]} paid */
function row(input, paid) {
  const member = input.recipient === 'member';
  if (!member && input.recipient !== 'death_benefits_dependant') {
    refuse('super_withholding.recipient_invalid', 'Choose who receives the income stream: the member or a death benefits dependant; Schedule 13 Part A’s offsets cover those two.');
  }
  when(true, input, 'date_of_birth', 'for an income stream');
  const born = civil(input.date_of_birth);
  if (!born) refuse('input.date_invalid', 'Enter the member’s date of birth as a date from 1900 to 2100.');
  if (dayText(born) >= dayText(paid)) refuse('super_benefit_tax.fact_conflict', 'The date of birth must be before the payment date.');
  const age = ageOn(born, paid);
  when(true, input, 'capped_defined_benefit', 'for an income stream');
  if (flag('capped_defined_benefit', input.capped_defined_benefit) && age >= 60) {
    refuse('super_withholding.capped_defined_benefit', 'Schedule 13 Parts B to E, not Part A, apply to a capped defined benefit income stream paid to a payee 60 or over, with the defined benefit income cap; this calculator does not take them.');
  }
  if (member) {
    when(false, input, 'deceased_aged_60_or_over', 'for a death benefit income stream');
    when(true, input, 'disability_superannuation_benefit', 'for a member');
    const disability = flag('disability_superannuation_benefit', input.disability_superannuation_benefit);
    return { age, name: age >= 60 ? 'income_stream_member_aged_60_or_over' : disability ? 'income_stream_disability_under_60' : 'income_stream_member_under_60' };
  }
  when(false, input, 'disability_superannuation_benefit', 'for a member’s income stream');
  when(true, input, 'deceased_aged_60_or_over', 'for a death benefit income stream');
  const deceased60 = flag('deceased_aged_60_or_over', input.deceased_aged_60_or_over);
  if (age >= 60) return { age, name: 'income_stream_dependant_aged_60_or_over' };
  if (deceased60) {
    refuse('super_withholding.deceased_60_recipient_under_60', 'Schedule 13 Part A withholds from the element taxed in the fund of a payee under 60 whose deceased died aged 60 or over, whilst ITAA 1997 s 302-65(b) makes that stream, apart from the untaxed element, not assessable; the calculator does not choose between them.');
  }
  return { age, name: 'income_stream_dependant_under_60' };
}

/** Steps 2 to 5 with a TFN: Schedule 1 on the step 1 amount, the tax offset, the offset adjustment and the
 * greater of the amount less the offset and the adjustment, to the nearest dollar.
 * @param {string} year @param {string} period @param {number} scale @param {bigint} from whole dollars
 * @param {[string, bigint] | null} offsetRow @param {Record<string, bigint>} c cents */
function withTfn(year, period, scale, from, offsetRow, c) {
  const [per, times] = PERIODS[period]; // eslint-disable-line security/detect-object-injection -- the key is checked against this module's own table first
  const rows = SCHEDULE_1[year][scale]; // eslint-disable-line security/detect-object-injection -- the key is checked against this module's own table first
  const x = (from * per / times) * 100n + 99n;
  const weeklyTax = BigInt(weekly(rows, Number(x)));
  const amount = period === 'monthly' ? (2n * weeklyTax * 13n + 3n) / 6n : weeklyTax * times;
  const [, a, b] = /** @type {number[]} */ (rows.find(([limit]) => limit === 0 || Number(x) < limit * 100));
  /** @type {Record<string, string>} */
  const steps = { weekly_earnings_used: centsOf(x, 1n), weekly_withholding: `${weeklyTax}.00`, withholding_amount: `${amount}.00` };
  /** @type {Record<string, string>} */
  const rates = { scale: String(scale), a: coefficient(a), b: coefficient(b) };
  // Amounts in thirds of a cent, so the monthly band's division by 3 stays exact.
  const offset = offsetRow ? (c[offsetRow[0]] / 100n) * offsetRow[1] : 0n;
  steps.tax_offset = centsOf(offset, 1n);
  let adjusted = 0n;
  if (offsetRow) rates.tax_offset_rate = `0.${offsetRow[1]}`;
  if (offset !== 0n) {
    const [threshold, shadeIn, limit] = LEVY[year].map(BigInt); // eslint-disable-line security/detect-object-injection -- the key is checked against this module's own table first
    Object.assign(rates, { medicare_levy_threshold_weekly: String(threshold), medicare_levy_shade_in_weekly: String(shadeIn),
      adjustment_limit_weekly: String(limit) });
    steps.weekly_equivalent = centsOf(from * per * 100n, times);
    // The weekly equivalent from × per / times against each weekly point.
    const below = (/** @type {bigint} */ point) => from * per < point * times;
    if (below(threshold) || !below(limit)) adjusted = 0n;
    else if (below(shadeIn)) adjusted = (from * per - threshold * times) * 30n / per;
    else adjusted = from * 6n;
  }
  steps.offset_adjustment = centsOf(adjusted, 3n);
  const notional = (amount * 100n - offset) * 3n;
  const greater = notional > adjusted ? notional : adjusted;
  return { steps, rates, withholding: (greater + 150n) / 300n };
}

/**
 * Schedule 13 Part A for one income stream payment, after the command's shared checks.
 * @param {Record<string, unknown>} input @param {Record<string, bigint | null>} amounts
 * @param {string} year @param {number[]} paid @param {boolean} tfn @param {boolean} foreign
 */
export function incomeStream(input, amounts, year, paid, tfn, foreign) {
  if (year < STREAM_FIRST_YEAR) {
    refuse('super_withholding.income_stream_year', 'Schedule 13 before 1 July 2024 was not read for this calculator; an income stream payment needs the 2024-25 income year or later.');
  }
  const period = /** @type {string} */ (input.income_stream_period);
  if (!Object.hasOwn(PERIODS, period)) {
    refuse('super_withholding.income_stream_period_invalid', 'Choose a weekly, fortnightly, monthly or quarterly income stream; Schedule 1 has no formula for an annual payment.');
  }
  for (const key of LUMP_SUM_ONLY) when(false, input, key, 'for a superannuation lump sum');
  if (tfn && foreign) {
    refuse('super_withholding.income_stream_foreign_resident', 'Schedule 13 names no scale for a foreign resident who gave a TFN, and its step 4 adjustment is for the Medicare levy, which a foreign resident does not pay.');
  }
  when(tfn, input, 'tax_free_threshold_claimed', tfn ? 'with a TFN' : 'with a TFN, which the payee has not given');
  const scale = tfn ? (flag('tax_free_threshold_claimed', input.tax_free_threshold_claimed) ? 2 : 1) : 0;
  const { age, name } = row(input, paid);
  const { c } = lumpSum(amounts, true);
  const offsetRow = ROWS[name]; // eslint-disable-line security/detect-object-injection -- the key is checked against this module's own table first
  const aged60 = name.endsWith('aged_60_or_over');
  const from = (aged60 ? c.untaxed : c.taxable) / 100n;
  /** @type {{steps: Record<string, string>, rates: Record<string, string>, withholding: bigint}} */
  let tail;
  if (!scale) {
    const rate = foreign ? 45n : 47n;
    tail = { steps: {}, rates: { no_tfn_rate: `0.${rate}` }, withholding: (from * rate) / 100n };
  } else tail = withTfn(year, period, scale, from, offsetRow, c);
  return { name, age, period, c, from, ...tail };
}
