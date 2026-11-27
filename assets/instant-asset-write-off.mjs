// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The instant asset write-off of one asset in the income year it is first used, or installed ready for use,
// for a taxable purpose: the `instant-asset-write-off` command of ryanduguid/australian-accounting ported line
// for line (its inputs, rules, warnings and refusal codes, in the order it checks them). The command read, on
// 23 November 2026, ITAA 1997 ss 40-25, 40-82 and 328-180 and IT(TP)A 1997 ss 40-145 to 40-190, 328-180 and
// 328-181 on the ATO's legal database, and Treasury Laws Amendment (Tax Reform No. 2) Act 2026 (No. 71 of 2026)
// Sch 2 items 3 and 15. The rule texts below are the command's own.

import { parseDay } from './gst-adjustments.mjs';

export const IAWO_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
const FIELDS = ['entity', 'acquired', 'first_used', 'cost', 'taxable_use', 'year', 'scope_confirmed'];
const FULL_EXPENSING_YEARS = ['2020-21', '2021-22', '2022-23'];
/** The days of the 7.30 pm budget times (legal time in the ACT). */
const BUDGET_2015 = '2015-05-12';
const BUDGET_2019 = '2019-04-02';
const BUDGET_2020 = '2020-10-06';

export const IAWO_RULES = /** @type {const} */ ({
  rule2026: 'ITAA 1997 s 328-180(1)(b): less than $20,000, as amended by Act No. 71 of 2026 Sch 2 item 3 for an asset first used or installed ready for use on or after 1 July 2026 (item 15(1))',
  fullExpensing: 'IT(TP)A 1997 s 328-181(2): no cost limit for an asset held, and first used or installed ready for use, from 7.30 pm AEDT on 6 October 2020 to 30 June 2023 (temporary full expensing)',
  rule4A: 'IT(TP)A 1997 s 328-180(4A): less than $150,000 for an asset first acquired from 7.30 pm on 12 May 2015 and first used or installed ready for use from 12 March 2020 to 30 June 2021',
  rule4D: 'IT(TP)A 1997 s 328-180(4)(d): less than $20,000 for an asset first acquired from 7.30 pm on 12 May 2015 and first used or installed ready for use from 1 July 2023 to 30 June 2026',
  base: 'ITAA 1997 s 328-180(1)(b) as in force before the threshold change day: less than $1,000, as no temporary increase in IT(TP)A 1997 ss 328-180 and 328-181 covers the asset\'s dates',
  rule40_82: 'ITAA 1997 s 40-82(2A) and (2B): less than $150,000 for a medium sized business\'s asset first acquired from 7.30 pm on 2 April 2019 to 31 December 2020 and first used or installed ready for use from 12 March 2020 to 30 June 2021',
  noneAfter2021: 'ITAA 1997 s 40-82(5): no write-off for a medium sized business\'s asset first used or installed ready for use after 30 June 2021',
  noneBefore2019: 'ITAA 1997 s 40-82(2A)(b): no write-off for an asset first acquired before 7.30 pm on 2 April 2019',
  noneOther: 'ITAA 1997 ss 328-180(1)(a) and (ab) and 40-82(4A): the write-off is for a small business entity using simplified depreciation or, to 30 June 2021, a medium sized business',
});
const POOL = 'Not written off: the taxable purpose proportion goes to the general small business pool (ITAA 1997 s 328-185).';
const POOL_2020_21 = 'Not written off: the taxable purpose proportion goes to the general small business pool (ITAA 1997 s 328-185), at 57.5% in its first year where backing business investment applies (IT(TP)A 1997 s 328-182).';
const DIVISION_40 = 'Not written off: work out the asset\'s decline in value under Division 40\'s methods.';
export const IAWO_FULL_EXPENSING = '2020-21 to 2022-23 are temporary full expensing years: a small business entity using simplified depreciation cannot opt out of it for an asset it held, and first used or installed ready for use, from 7.30 pm AEDT on 6 October 2020 to 30 June 2023 (IT(TP)A 1997 s 328-181(2)); for other entities this command refuses those assets.';

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** @typedef {{c: bigint, e: number}} Dec A decimal: coefficient times 10 to the exponent. */

/** A decimal input as the command reads one: Python's decimal syntax, `null` for an infinity or NaN.
 * @param {string} key @param {unknown} value @returns {Dec | null | undefined} undefined for a value that is not a string */
function decimal(key, value) {
  if (typeof value !== 'string') return undefined;
  if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', `${key}: the number has too many digits.`);
  const text = value.trim();
  if (/^[+-]?(inf|infinity|s?nan\d*)$/i.test(text)) return null;
  const parts = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text); // eslint-disable-line security/detect-unsafe-regex -- anchored, and each group takes a distinct character class: linear
  if (!parts || (parts[2] + (parts[3] ?? '')) === '') refuse('input.decimal_unreadable', `${key}: enter a number in digits, such as 1250.50.`);
  const c = BigInt(`${parts[2]}${parts[3] ?? ''}`);
  return { c: parts[1] === '-' ? -c : c, e: Number(parts[4] ?? 0) - (parts[3] ?? '').length };
}

/** An amount in cents: finite, nil or more, at most 2 places and $1,000,000,000,000. @param {Dec | null | undefined} v */
function money(v) {
  const cents = v && v.e >= -2 ? v.c * 10n ** BigInt(v.e + 2) : null;
  if (cents === null || cents < 0n || cents > 100000000000000n) refuse('input.amount_invalid', 'Enter the cost as an amount of 0 or more with no more than 2 decimal places.');
  return cents;
}

/** The taxable use: a fraction from 0 to 1 of at most 26 significant digits as written. @param {Dec | null | undefined} v */
function taxableUse(v) {
  if (!v) refuse('input.fraction_invalid', 'Enter the taxable use as a fraction from 0 to 1.');
  const scaled = v.e >= 0 ? v.c * 10n ** BigInt(v.e) : v.c;
  const unit = v.e >= 0 ? 1n : 10n ** BigInt(-v.e);
  if (scaled < 0n || scaled > unit) refuse('input.fraction_invalid', 'Enter the taxable use as a fraction from 0 to 1.');
  if (Math.max(1, v.c.toString().replace(/^-?0+/, '').length) > 26) {
    refuse('instant_asset_write_off.precision_exceeded', 'Enter the taxable use to 26 or fewer significant digits.');
  }
  return v;
}

/** Whether the asset was acquired after 7.30 pm on `budget`, refusing that day itself.
 * @param {number} acquired @param {string} budget */
function heldFrom(acquired, budget) {
  const day = /** @type {number} */ (parseDay(budget));
  if (acquired === day) {
    refuse('instant_asset_write_off.budget_time_day', `The result turns on whether the asset was first acquired before or after 7.30 pm on ${longDate(budget)} (legal time in the ACT), and the calculator takes dates only.`);
  }
  return acquired > day;
}

/** @typedef {{limit: string, rule: string}} Limit `limit` in dollars, 'none' or 'not_applicable'. */

/** A small business entity's limit by the date of first use. @param {number} acquired @param {number} used @returns {Limit} */
function smallBusinessLimit(acquired, used) {
  const on = (/** @type {string} */ text) => /** @type {number} */ (parseDay(text));
  if (used >= on('2026-07-01')) return { limit: '20000', rule: IAWO_RULES.rule2026 };
  if (used <= on('2023-06-30') && heldFrom(acquired, BUDGET_2020)) return { limit: 'none', rule: IAWO_RULES.fullExpensing };
  const increased = used <= on('2021-06-30') ? { limit: '150000', rule: IAWO_RULES.rule4A }
    : used >= on('2023-07-01') ? { limit: '20000', rule: IAWO_RULES.rule4D } : null;
  return increased && heldFrom(acquired, BUDGET_2015) ? increased : { limit: '1000', rule: IAWO_RULES.base };
}

/** A medium sized business's or any other entity's limit, refusing an asset temporary full expensing may cover.
 * @param {string} entity @param {number} acquired @param {number} used @returns {Limit} */
function otherLimit(entity, acquired, used) {
  const on = (/** @type {string} */ text) => /** @type {number} */ (parseDay(text));
  if (used >= on(BUDGET_2020) && used <= on('2023-06-30')) {
    refuse('instant_asset_write_off.temporary_full_expensing', 'An asset first used or installed ready for use from 7.30 pm AEDT on 6 October 2020 to 30 June 2023 may be fully expensed under IT(TP)A 1997 Subdivision 40-BB, which displaces section 40-82; whether it was turns on facts the calculator does not decide.');
  }
  if (entity === 'other') return { limit: 'not_applicable', rule: IAWO_RULES.noneOther };
  if (used > on('2021-06-30')) return { limit: 'not_applicable', rule: IAWO_RULES.noneAfter2021 };
  if (heldFrom(acquired, BUDGET_2019)) return { limit: '150000', rule: IAWO_RULES.rule40_82 };
  return { limit: 'not_applicable', rule: IAWO_RULES.noneBefore2019 };
}

/** Cents half up from a product in 10^-(2 + places) units. The command's 40-digit context never rounds it: the
 * cost is at most 10^14 cents and the taxable use's coefficient at most 26 digits (under 10^26), so the product is
 * under 10^40, at most 40 digits. @param {bigint} units non-negative @param {number} places */
function productCents(units, places) {
  const scale = 10n ** BigInt(places);
  return (2n * units + scale) / (2n * scale);
}

/** @typedef {{year: string, entity: string, written: boolean, limit: string, rule: string, taxablePurposeCost: number,
 *   deduction: number, amounts: Record<string, string>, rates: Record<string, string>, warnings: string[]}} IawoResult */

/**
 * The instant asset write-off of one asset for the income year of its first use for a taxable purpose.
 * @param {Record<string, unknown>} input the command's input, with decimal amounts as strings
 * @returns {IawoResult}
 */
export function instantAssetWriteOff(input) {
  const extra = Object.keys(input).find((key) => !FIELDS.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not an input of instant-asset-write-off.`);
  /** @type {Record<string, Dec | null | undefined>} */
  const read = {};
  for (const key of FIELDS) {
    if (!Object.hasOwn(input, key)) refuse('input.missing_field', `${key} is required.`);
    if (key === 'cost' || key === 'taxable_use') read[key] = decimal(key, input[key]); // eslint-disable-line security/detect-object-injection -- key comes from this module's own field list
  }
  if (input.scope_confirmed !== true) refuse('scope.not_confirmed', 'Confirm the facts the calculator takes as given.');
  const year = /** @type {string} */ (input.year);
  if (!IAWO_YEARS.includes(year)) refuse('period.unsupported', 'Choose an income year from 2020-21 to 2026-27.');
  const entity = /** @type {string} */ (input.entity);
  if (!['small_business_simplified', 'medium_business', 'other'].includes(entity)) {
    refuse('instant_asset_write_off.entity_invalid', 'Choose a small business entity using simplified depreciation, a medium sized business or another entity.');
  }
  const acquired = parseDay(input.acquired);
  if (acquired === null) refuse('input.date_invalid', 'Enter the date first acquired as a date from 1900 to 2100.');
  const used = parseDay(input.first_used);
  if (used === null) refuse('input.date_invalid', 'Enter the date first used as a date from 1900 to 2100.');
  const start = /** @type {number} */ (parseDay(`${year.slice(0, 4)}-07-01`));
  const end = /** @type {number} */ (parseDay(`20${year.slice(5)}-06-30`));
  if (used < start || used > end) refuse('instant_asset_write_off.first_use_outside_year', `The date first used must fall in ${year}, the income year of the write-off.`);
  if (acquired > used) refuse('instant_asset_write_off.acquired_after_first_use', 'The date first acquired cannot be after the date first used.');
  const cost = money(read.cost);
  const use = taxableUse(read.taxable_use);
  const { limit, rule } = entity === 'small_business_simplified' ? smallBusinessLimit(acquired, used) : otherLimit(entity, acquired, used);
  const written = limit === 'none' || (limit !== 'not_applicable' && cost < BigInt(limit) * 100n);
  // The proportion in units of 10^-(2 + places) dollars: cost in cents times the use's coefficient.
  const places = Math.max(0, -use.e);
  const units = cost * use.c * 10n ** BigInt(Math.max(0, use.e));
  const proportion = productCents(units, places);
  const deduction = written ? proportion : 0n;
  const text = (/** @type {bigint} */ c) => `${c / 100n}.${String(c % 100n).padStart(2, '0')}`;
  const warnings = written ? [] : [entity !== 'small_business_simplified' ? DIVISION_40 : year === '2020-21' ? POOL_2020_21 : POOL];
  if (FULL_EXPENSING_YEARS.includes(year)) warnings.push(IAWO_FULL_EXPENSING);
  return { year, entity, written, limit, rule, taxablePurposeCost: Number(proportion) / 100, deduction: Number(deduction) / 100,
    amounts: { taxable_purpose_cost: text(proportion), deduction: text(deduction) },
    rates: { cost_limit: limit, cost_limit_rule: rule, written_off: String(written) }, warnings };
}

const ENTITIES = /** @type {Record<string, string>} */ ({ small_business_simplified: 'a small business entity using simplified depreciation',
  medium_business: 'a medium sized business', other: 'another entity' });
const LIMITS = /** @type {Record<string, string>} */ ({ none: 'no cost limit', not_applicable: 'no write-off rule applies' });

/** The taxable use as the command's fraction: 80 (per cent) is 0.80. @param {string} percent */
export function useFraction(percent) {
  // A percentage may start at the point, as a number field allows: .5 is 0.5%.
  const parts = /^(\d*)(?:\.(\d+))?$/.exec(percent.trim()); // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!parts || (parts[1] === '' && parts[2] === undefined)) return percent.trim();
  const places = (parts[2] ?? '').length + 2;
  const text = String(BigInt(`${parts[1]}${parts[2] ?? ''}`)).padStart(places + 1, '0');
  return `${text.slice(0, -places)}.${text.slice(-places)}`;
}

/** The command's fraction as the percentage the page shows: 0.80 is 80%. @param {unknown} text */
export function usePercent(text) {
  const parts = typeof text === 'string' ? /^(\d+)(?:\.(\d+))?$/.exec(text) : null; // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!parts) return String(text);
  const places = (parts[2] ?? '').padEnd(2, '0');
  let rest = places.slice(2);
  while (rest.endsWith('0')) rest = rest.slice(0, -1);
  return `${Number(parts[1] + places.slice(0, 2))}${rest ? `.${rest}` : ''}%`;
}

/** The command's input from the form. @param {(name: string) => string} value */
export function iawoFormInput(value) {
  return { entity: value('entity'), acquired: value('acquired'), first_used: value('used'), cost: value('cost').trim(),
    taxable_use: useFraction(value('use')), year: value('year'), scope_confirmed: true };
}

/** A date as the page writes it. @param {unknown} iso */
const longDate = (iso) => (typeof iso === 'string' && parseDay(iso) !== null
  ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(iso));

/** The inputs as the page states them. @param {Record<string, unknown>} x @param {(value: number) => string} aud */
export function iawoInputsText(x, aud) {
  return `${x.year}; ${ENTITIES[/** @type {string} */ (x.entity)] ?? x.entity}; first acquired ${longDate(x.acquired)}, first used `
    + `${longDate(x.first_used)}; cost ${aud(Number(x.cost))}, taxable use ${usePercent(x.taxable_use)}`;
}

/** The page's result: the taxable purpose proportion, the deduction, the limit and its rule.
 * @param {(name: string) => string} value @param {(value: number) => string} aud */
export function instantAssetWriteOffResult(value, aud) {
  const input = iawoFormInput(value);
  const r = instantAssetWriteOff(input);
  const limit = LIMITS[r.limit] ?? `less than ${aud(Number(r.limit))}`;
  const rows = [['Taxable purpose proportion of the cost', aud(r.taxablePurposeCost)],
    [r.written ? 'Instant asset write-off deduction' : 'Instant asset write-off deduction: not written off', aud(r.deduction)],
    ['Cost limit', limit]];
  return { inputs: iawoInputsText(input, aud), rows, principal: 1, note: [r.rule, ...r.warnings].join('. ').replace(/\.\./g, '.') };
}
