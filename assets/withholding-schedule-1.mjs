// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Schedule 1 (Statement of formulas for calculating amounts to be withheld), all scales, with its tax
// offsets, Medicare levy adjustment and the additional amount for 53 or 27 pays, as Schedules 6 and
// 14 apply it; Schedule 8's study loan component as Schedule 9 adds it. Ported from
// australian-accounting's payg-withholding worksheet (engine.rs, metadata.rs). Coefficients: the
// Taxation Administration (Withholding Schedules) Instrument 2024 (F2024L00664), 2025 (F2025L00647)
// and (No. 2) 2025 (F2025L01016) for 2024-25 and 2025-26, and 2026 (F2026L00716) for 2026-27, each as
// made on the Federal Register of Legislation, read 26 November 2026.
import { add, cmp, div, down, halfUp, int, max, money, mul, refuse, sub, dec, fixed, flag } from './withholding-decimal.mjs';

/** @typedef {import('./withholding-decimal.mjs').Q} Q */
/** @typedef {import('./withholding-decimal.mjs').Arg} Arg */
/** A row: weekly earnings less than (null on the last row), a, b. @typedef {[number | null, string, string]} Row */
/** @typedef {{id: string, value: Q}} Step */
/** @typedef {{steps: Step[], rates: [string, string][]}} Workings */

/** The income years these schedules cover. */
export const YEARS = ['2024-25', '2025-26', '2026-27'];

/** @type {Record<number, Row[]>} */
const FROM_JULY_2024 = {
  1: [[150, '0.1600', '0.1600'], [371, '0.2117', '7.7550'], [515, '0.1890', '-0.6702'], [932, '0.3227', '68.2367'],
    [2246, '0.3200', '65.7202'], [3303, '0.3900', '222.9510'], [null, '0.4700', '487.2587']],
  2: [[361, '0', '0'], [500, '0.1600', '57.8462'], [625, '0.2600', '107.8462'], [721, '0.1800', '57.8462'],
    [865, '0.1890', '64.3365'], [1282, '0.3227', '180.0385'], [2596, '0.3200', '176.5769'], [3653, '0.3900', '358.3077'],
    [null, '0.4700', '650.6154']],
  3: [[2596, '0.3000', '0.3000'], [3653, '0.3700', '181.7308'], [null, '0.4500', '474.0385']],
  5: [[361, '0', '0'], [721, '0.1600', '57.8462'], [865, '0.1690', '64.3365'], [1282, '0.3027', '180.0385'],
    [2596, '0.3000', '176.5769'], [3653, '0.3700', '358.3077'], [null, '0.4500', '650.6154']],
  6: [[361, '0', '0'], [721, '0.1600', '57.8462'], [843, '0.1690', '64.3365'], [865, '0.2190', '106.4962'],
    [1053, '0.3527', '222.1981'], [1282, '0.3127', '180.0385'], [2596, '0.3100', '176.5769'], [3653, '0.3800', '358.3077'],
    [null, '0.4600', '650.6154']],
};
/** @type {Record<number, Row[]>} */
const FROM_JULY_2026 = {
  1: [[188, '0.1500', '0.1500'], [371, '0.2084', '11.0185'], [515, '0.1790', '0.1066'], [932, '0.3227', '74.1674'],
    [2246, '0.3200', '71.6508'], [3303, '0.3900', '228.8816'], [null, '0.4700', '493.1893']],
  2: [[362, '0', '0'], [538, '0.1500', '54.3462'], [673, '0.2500', '108.2135'], [721, '0.1700', '54.3473'],
    [865, '0.1790', '60.8377'], [1282, '0.3227', '185.1935'], [2596, '0.3200', '181.7319'], [3653, '0.3900', '363.4627'],
    [null, '0.4700', '655.7704']],
  3: [[2596, '0.3000', '0.3000'], [3653, '0.3700', '181.7308'], [null, '0.4500', '474.0385']],
  5: [[362, '0', '0'], [721, '0.1500', '54.3462'], [865, '0.1590', '60.8365'], [1282, '0.3027', '185.1923'],
    [2596, '0.3000', '181.7308'], [3653, '0.3700', '363.4615'], [null, '0.4500', '655.7692']],
  6: [[362, '0', '0'], [721, '0.1500', '54.3462'], [865, '0.1590', '60.8365'], [908, '0.3027', '185.1923'],
    [1135, '0.3527', '230.6135'], [1282, '0.3127', '185.1923'], [2596, '0.3100', '181.7308'], [3653, '0.3800', '363.4615'],
    [null, '0.4600', '655.7692']],
};
/** Schedule 1 coefficients by income year. @type {Record<string, Record<number, Row[]>>} */
export const SCHEDULE_1 = { '2024-25': FROM_JULY_2024, '2025-26': FROM_JULY_2024, '2026-27': FROM_JULY_2026 };

/** @typedef {{threshold: number, less: string, shadeIn: number, shadeInRate: string, levy: string, shadeOut: string,
 *   sop: [string, string]}} Levy */
/** @typedef {{family: number, perChild: number, levy: Record<number, Levy>, weekly: [number, number][],
 *   fortnightly: [number, number][]}} Rules */
/** @param {number} threshold @param {string} less @param {number} shadeIn @returns {Levy} */
const scale2 = (threshold, less, shadeIn) => ({ threshold, less, shadeIn, shadeInRate: '0.1', levy: '0.0200', shadeOut: '0.0800',
  sop: ['0.1000', '0.0800'] });
/** @param {number} threshold @param {string} less @param {number} shadeIn @returns {Levy} */
const scale6 = (threshold, less, shadeIn) => ({ threshold, less, shadeIn, shadeInRate: '0.05', levy: '0.0100', shadeOut: '0.0400',
  sop: ['0.0500', '0.0400'] });
/** @type {Rules} */
const RULES_2024 = { family: 43846, perChild: 4027, levy: { 2: scale2(500, '500', 625), 6: scale6(843, '843.19', 1053) },
  weekly: [[875, 3], [2575, 6], [3650, 12]], fortnightly: [[1750, 12], [5150, 26], [7250, 47]] };
/** @type {Rules} */
const RULES_2026 = { family: 47238, perChild: 4338, levy: { 2: scale2(538, '538.67', 673), 6: scale6(908, '908.42', 1135) },
  weekly: [[875, 3], [2575, 7], [3650, 12]], fortnightly: [[1700, 12], [5200, 27], [7250, 48]] };
/** @type {Record<string, Rules>} */
const RULES = { '2024-25': RULES_2024, '2025-26': RULES_2024, '2026-27': RULES_2026 };
/** Schedule 1, 'Tax offsets': the share of the yearly amount claimed each pay is reduced by. */
const OFFSET_SHARE = /** @type {Record<string, string>} */ ({ weekly: '0.019', fortnightly: '0.038', monthly: '0.083',
  quarterly: '0.25' });
/** Schedule 8, threshold claimed or foreign resident, from 24 September 2025 and from 1 July 2026. @type {Record<string, Row[]>} */
export const SCHEDULE_8 = {
  '2025-26': [[1288, '0', '0'], [2403, '0.15', '193.2692'], [3447, '0.17', '241.3462'], [null, '0.10', '0']],
  '2026-27': [[1337, '0', '0'], [2494, '0.15', '200.5615'], [3577, '0.17', '250.4527'], [null, '0.10', '0']],
};
/** The first pay date each year's Schedule 8 coefficients apply to. */
export const SCHEDULE_8_FROM = /** @type {Record<string, string>} */ ({ '2025-26': '2025-09-24', '2026-27': '2026-07-01' });

/** Schedule 1, 'Working out the weekly earnings': whole dollars plus 99 cents, a monthly amount ending
 * in 33 cents gaining a cent first. @param {Q} earnings @param {string} period @returns {Q} */
export function weeklyEarnings(earnings, period) {
  const weekly = period === 'weekly' ? earnings : period === 'fortnightly' ? div(earnings, int(2))
    : period === 'quarterly' ? div(earnings, int(13))
      : div(mul(cmp(sub(earnings, down(earnings)), dec('0.33')) === 0 ? add(earnings, dec('0.01')) : earnings, int(3)), int(13));
  return add(down(weekly), dec('0.99'));
}
/** y = ax − b on the first row x is below, to the nearest dollar, never below nil.
 * @param {Q} x @param {Row[]} rows @returns {{a: string, b: string, y: Q}} */
export function formula(x, rows) {
  const [, a, b] = /** @type {Row} */ (rows.find(([limit]) => limit === null || cmp(x, int(limit)) < 0));
  return { a, b, y: max(int(0), halfUp(sub(mul(dec(a), x), dec(b)))) };
}
/** A weekly amount for the pay period. @param {Q} weekly @param {string} period @returns {Q} */
export const forPeriod = (weekly, period) => (period === 'weekly' ? weekly : period === 'fortnightly' ? mul(weekly, int(2))
  : period === 'quarterly' ? mul(weekly, int(13)) : halfUp(div(mul(weekly, int(13)), int(3))));

/** The pay period, quarterly only where Schedule 1 applies. @param {Arg} a @param {boolean} quarterly */
export function payPeriod(a, quarterly) {
  const ok = ['weekly', 'fortnightly', 'monthly', ...(quarterly ? ['quarterly'] : [])];
  if (a.kind !== 'text' || !ok.includes(a.value)) {
    refuse('input.pay_period_invalid', `pay_period must be ${quarterly ? 'weekly, fortnightly, monthly or quarterly' : 'weekly, fortnightly or monthly'}.`);
  }
  return a.value;
}
/** Scale 1, 2, 3, 5 or 6, or 4 (no TFN). @param {Arg} a @param {string} year */
export function scheduleScale(a, year) {
  if (a.kind !== 'int' || !(Object.hasOwn(SCHEDULE_1[year], a.value) || a.value === 4)) {
    refuse('input.tax_scale_unsupported', 'scale must be 1, 2, 3, 4, 5 or 6.');
  }
  return a.value;
}

/** @typedef {{foreign?: Arg, offsets?: Arg, children?: Arg, extra?: Arg}} Options */
/** @typedef {{foreign: boolean | null, offsets: Q | null, children: number | null, extra: boolean}} Choices */
/** The optional inputs checked against the scale and pay period. @param {Options} o @param {number} scale @param {string} period
 * @returns {Choices} */
export function choices(o, scale, period) {
  if (!o.foreign && scale === 4) refuse('input.missing_field', 'foreign_resident is required for scale 4.');
  if (o.foreign && scale !== 4) refuse('payg.foreign_resident_not_scale_4', 'foreign_resident applies to scale 4 only.');
  const foreign = o.foreign ? flag(o.foreign, 'foreign_resident') : null;
  if (o.offsets && ![2, 5, 6].includes(scale)) refuse('payg.tax_offsets_not_allowed', 'Tax offsets reduce withholding on scales 2, 5 and 6 only.');
  const offsets = o.offsets ? money(o.offsets) : null;
  if (o.children && ![2, 6].includes(scale)) refuse('payg.medicare_adjustment_not_allowed', 'A Medicare levy adjustment applies on scales 2 and 6 only.');
  if (o.children && (o.children.kind !== 'int' || o.children.value < 0)) {
    refuse('input.children_invalid', 'medicare_adjustment_children must be a whole number from 0.');
  }
  const children = o.children?.kind === 'int' ? o.children.value : null;
  const extra = o.extra ? flag(o.extra, 'extra_pay_withholding') : false;
  if (extra && !['weekly', 'fortnightly'].includes(period)) {
    refuse('payg.extra_pays_not_weekly_or_fortnightly', 'Schedule 1 has additional amounts for 53 weekly or 27 fortnightly pays only.');
  }
  return { foreign, offsets, children, extra };
}

/** Schedule 1, 'Weekly levy adjustment (WLA)'. @param {Q} x @param {Rules} rules @param {number} scale @param {number} children */
function levyAdjustment(x, rules, scale, children) {
  const m = rules.levy[scale];
  const wft = halfUp(div(int(rules.family + rules.perChild * children), int(52)), 2);
  const sop = down(div(mul(wft, dec(m.sop[0])), dec(m.sop[1])));
  const wla = cmp(x, int(m.threshold)) < 0 || cmp(x, sop) >= 0 ? int(0)
    : cmp(x, int(m.shadeIn)) < 0 ? mul(sub(x, dec(m.less)), dec(m.shadeInRate))
      : cmp(x, wft) < 0 ? mul(x, dec(m.levy)) : sub(mul(wft, dec(m.levy)), mul(sub(x, wft), dec(m.shadeOut)));
  return { wft, sop, weekly: halfUp(wla) };
}

/** One pay's Schedule 1 workings: the steps and rates payg-withholding gives.
 * @param {string} year @param {Q} earnings @param {string} period @param {number} scale @param {Choices} c @returns {Workings} */
export function schedule1(year, earnings, period, scale, c) {
  /** @type {Workings} */
  const w = { steps: [], rates: [['scale', String(scale)]] };
  let before;
  if (scale === 4) {
    const rate = c.foreign ? '0.45' : '0.47';
    const used = down(earnings);
    w.rates.push(['tax_rate', rate]);
    w.steps.push({ id: 'earnings_used', value: used });
    before = down(mul(used, dec(rate)));
  } else {
    const x = weeklyEarnings(earnings, period);
    const { a, b, y } = formula(x, SCHEDULE_1[year][scale]);
    w.rates.push(['a', a], ['b', b]);
    w.steps.push({ id: 'weekly_earnings_used', value: x }, { id: 'weekly_withholding', value: y });
    before = forPeriod(y, period);
  }
  if (c.offsets === null && c.children === null && !c.extra) {
    w.steps.push({ id: 'withholding', value: before });
    return w;
  }
  w.steps.push({ id: 'withholding_before_adjustments', value: before });
  let reductions = int(0);
  if (c.offsets !== null) {
    const share = OFFSET_SHARE[period];
    const reduction = halfUp(mul(c.offsets, dec(share)));
    w.rates.push(['tax_offset_rate', share]);
    reductions = add(reductions, reduction);
    w.steps.push({ id: 'tax_offset_reduction', value: reduction });
  }
  const rules = RULES[year];
  if (c.children !== null) {
    const { wft, sop, weekly } = levyAdjustment(weeklyEarnings(earnings, period), rules, scale, c.children);
    const adjustment = forPeriod(weekly, period);
    w.rates.push(['medicare_adjustment_children', String(c.children)], ['weekly_family_threshold', fixed(wft, 2)],
      ['shading_out_point', fixed(sop, 0)]);
    reductions = add(reductions, adjustment);
    w.steps.push({ id: 'weekly_medicare_levy_adjustment', value: weekly }, { id: 'medicare_levy_adjustment', value: adjustment });
  }
  if (cmp(before, reductions) < 0) {
    refuse('payg.reductions_exceed_withholding', 'The tax offsets and Medicare levy adjustment exceed the amount withheld before them; Schedule 1 does not say how to treat the excess.');
  }
  let withholding = sub(before, reductions);
  if (c.extra) {
    let extra = 0;
    for (const [from, amount] of period === 'weekly' ? rules.weekly : rules.fortnightly) if (cmp(earnings, int(from)) >= 0) extra = amount;
    withholding = add(withholding, int(extra));
    w.steps.push({ id: 'additional_withholding', value: int(extra) });
  }
  w.steps.push({ id: 'withholding', value: withholding });
  return w;
}
