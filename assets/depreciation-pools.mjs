// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { ratioCents } from './money.mjs';

// A low-value pool, a general small business pool and a capital works deduction for one income
// year: the `depreciation-low-value-pool`, `depreciation-small-business-pool` and `capital-works`
// commands of ryanduguid/australian-accounting (PR 782) ported line for line (their inputs,
// rounding and refusal codes). Read 22 November 2026 on the ATO's legal database:
// - ITAA 1997 ss 40-425 to 40-445 (the low-value pool: 18.75% and 37.5%, s 40-440).
// - ITAA 1997 ss 328-185 to 328-215 (the general small business pool: 15% and 30%, s 328-190; the
//   low pool value, s 328-210; a balance below zero, s 328-215).
// - IT(TP)A 1997 s 328-181(5) (no low pool value limit for income years ending from 6 October 2020
//   to 30 June 2023) and s 328-180(6)(e) ($20,000 for income years ending 1 July 2023 to 30 June 2026).
// - Treasury Laws Amendment (Tax Reform No. 2) Act 2026 (No. 71 of 2026) Sch 2 items 7 and 15(3):
//   $20,000 in s 328-210(1) for income years ending on or after 1 July 2026.
// - ITAA 1997 ss 43-140, 43-145, 43-210 and 43-215 (capital works at 2.5% or 4%, days over 365).
// Every amount is worked in whole cents or exact fractions of them and rounded half up once, as
// the commands do. The page passes only plain decimal amounts: an amount the commands would read
// in exponent form is refused here as input.amount_invalid.

export const POOL_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
const FULL_EXPENSING_YEARS = ['2020-21', '2021-22', '2022-23'];
/** The low pool value threshold in dollars, or null for no limit (IT(TP)A s 328-181(5)). @param {string} year */
export const lowPoolThreshold = (year) => (FULL_EXPENSING_YEARS.includes(year) ? null : 20000);

const LVP_FIELDS = ['previous_closing_pool_balance', 'low_cost_assets', 'low_value_assets', 'second_element_costs',
  'termination_values', 'year', 'scope_confirmed'];
const SBP_FIELDS = ['opening_pool_balance', 'additions', 'cost_additions', 'termination_values', 'year', 'scope_confirmed'];
const CW_FIELDS = ['construction_expenditure', 'construction_start', 'four_percent_manner', 'days_used', 'taxable_use',
  'undeducted_construction_expenditure', 'year', 'scope_confirmed'];

export const LVP_FULL_EXPENSING = '2020-21 to 2022-23 are temporary full expensing years: this worksheet does not decide whether '
  + 'temporary full expensing applied to an asset, and only amounts allocated to the low-value pool belong in its inputs.';
export const SBP_FULL_EXPENSING = '2020-21 to 2022-23 are temporary full expensing years: the pool’s whole balance above zero is '
  + 'written off (IT(TP)A 1997 s 328-181(5)); whether an asset was fully expensed instead of pooled is not decided here.';

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** The command's own checks before its worksheet: unknown, then missing inputs, then scope and year.
 * @param {Record<string, unknown>} input @param {string} command @param {string[]} fields */
function checked(input, command, fields) {
  const extra = Object.keys(input).find((key) => !fields.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not an input of ${command}.`);
  // The page states the commands' scope beside the form, so a call without scope_confirmed is taken as
  // confirmed; given, it must be true, as the commands require.
  const missing = fields.find((key) => key !== 'scope_confirmed' && !(key in input));
  if (missing !== undefined) refuse('input.missing_field', `${missing} is required.`);
  if ('scope_confirmed' in input && input.scope_confirmed !== true) {
    refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  }
  const year = /** @type {string} */ (input.year);
  if (!POOL_YEARS.includes(year)) {
    refuse('period.unsupported', `Choose an income year from ${POOL_YEARS[0]} to ${POOL_YEARS.at(-1)}.`);
  }
  return year;
}

/** A decimal string scaled to whole 10^-places, or null. @param {unknown} value @param {number} places */
function scaled(value, places) {
  const parts = typeof value === 'string' && value.length <= 32 ? /^(\d+)(?:\.(\d+))?$/.exec(value) : null;
  if (!parts || (parts[2] ?? '').length > places) return null;
  return BigInt(parts[1] + (parts[2] ?? '').padEnd(places, '0'));
}

/** How the page names each amount. */
const AMOUNT_NAMES = /** @type {Record<string, string>} */ ({ previous_closing_pool_balance: 'the previous closing pool balance',
  low_cost_assets: 'the low-cost assets', low_value_assets: 'the low-value assets', second_element_costs: 'the second element costs',
  termination_values: 'the termination values', opening_pool_balance: 'the opening pool balance', additions: 'the additions',
  cost_additions: 'the cost additions', construction_expenditure: 'the construction expenditure',
  undeducted_construction_expenditure: 'the undeducted construction expenditure' });

/** An amount in whole cents, from 0 to $1,000,000,000,000. @param {unknown} value @param {string} key */
function money(value, key) {
  const cents = scaled(value, 2);
  if (cents === null || cents > 100000000000000n) {
    refuse('input.amount_invalid', `Enter ${AMOUNT_NAMES[key]} in dollars and cents, from 0 to 1,000,000,000,000.`);
  }
  return cents;
}

/** Cents as dollars. @param {bigint} c */
const dollars = (c) => Number(c) / 100;
/** @param {bigint} a @param {bigint} b */
const max = (a, b) => (a > b ? a : b);

/**
 * @typedef {{year: string, newAssetsDecline: number, poolDecline: number, declineInValue: number,
 *   closingBeforeDisposals: number, closingPoolBalance: number, assessableExcess: number, warnings: string[]}} LowValuePoolResult
 */

/**
 * @typedef {{year: string, previous_closing_pool_balance: string, low_cost_assets: string, low_value_assets: string,
 *   second_element_costs: string, termination_values: string, scope_confirmed?: boolean}} LowValuePoolInput
 */

/** ITAA 1997 s 40-440: a low-value pool's decline in value and closing pool balance, then s 40-445 for
 * disposals. Every input is the taxable use percentage of the amount (s 40-435).
 * @param {LowValuePoolInput} given @returns {LowValuePoolResult} */
export function lowValuePool(given) {
  const input = /** @type {Record<string, unknown>} */ (given);
  const year = checked(input, 'depreciation-low-value-pool', LVP_FIELDS);
  const [previous, lowCost, lowValue, second, termination] = LVP_FIELDS.slice(0, 5).map((key) => money(input[key], key));
  // 18.75% is 3/16 and 37.5% is 6/16: the decline is exact in sixteenths of a cent, rounded once.
  const newAssets = 3n * (lowCost + second);
  const pool = 6n * (previous + lowValue);
  const decline = ratioCents(newAssets + pool, 16n);
  const before = previous + lowCost + lowValue + second - decline;
  return { year, newAssetsDecline: dollars(ratioCents(newAssets, 16n)), poolDecline: dollars(ratioCents(pool, 16n)),
    declineInValue: dollars(decline), closingBeforeDisposals: dollars(before), closingPoolBalance: dollars(max(before - termination, 0n)),
    assessableExcess: dollars(max(termination - before, 0n)), warnings: FULL_EXPENSING_YEARS.includes(year) ? [LVP_FULL_EXPENSING] : [] };
}

/**
 * @typedef {{year: string, outcome: 'written_off' | 'below_zero' | 'rated', threshold: number | null,
 *   lowPoolValueAmount: number, lowPoolValueDeduction: number, poolDeduction: number, newAssetDeduction: number,
 *   costAdditionDeduction: number, deduction: number, assessableIncome: number, closingPoolBalance: number,
 *   warnings: string[]}} SmallBusinessPoolResult
 */

/**
 * @typedef {{year: string, opening_pool_balance: string, additions: string, cost_additions: string,
 *   termination_values: string, scope_confirmed?: boolean}} SmallBusinessPoolInput
 */

/** ITAA 1997 Subdivision 328-D: a general small business pool's deduction for the year, the low pool value
 * write-off and the closing pool balance. Every input is the taxable purpose proportion of the amount.
 * @param {SmallBusinessPoolInput} given @returns {SmallBusinessPoolResult} */
export function smallBusinessPool(given) {
  const input = /** @type {Record<string, unknown>} */ (given);
  const year = checked(input, 'depreciation-small-business-pool', SBP_FIELDS);
  const [opening, added, improved, termination] = SBP_FIELDS.slice(0, 4).map((key) => money(input[key], key));
  const amount = opening + added + improved - termination;
  if (year === '2020-21' && amount === 0n && added !== 0n) {
    refuse('depreciation_small_business_pool.backing_business_investment', 'In 2020-21 a pool whose section 328-210(2) amount '
      + 'is exactly zero deducts 15% of additions, which backing business investment may rate at 57.5% instead; this '
      + 'calculator does not work that out.');
  }
  const threshold = lowPoolThreshold(year);
  const zero = { lowPoolValueDeduction: 0, poolDeduction: 0, newAssetDeduction: 0, costAdditionDeduction: 0, deduction: 0,
    assessableIncome: 0, closingPoolBalance: 0 };
  /** @type {Omit<SmallBusinessPoolResult, 'year' | 'threshold' | 'lowPoolValueAmount' | 'warnings'>} */
  let worked;
  if (amount > 0n && (threshold === null || amount < BigInt(threshold) * 100n)) {
    worked = { ...zero, outcome: 'written_off', lowPoolValueDeduction: dollars(amount), deduction: dollars(amount) };
  } else if (amount < 0n) {
    worked = { ...zero, outcome: 'below_zero', assessableIncome: dollars(-amount) };
  } else {
    // 30% is 3/10 and 15% is 3/20, each rounded to the cent before they are added (s 328-200).
    const [pool, newAssets, addition] = [ratioCents(3n * opening, 10n), ratioCents(3n * added, 20n), ratioCents(3n * improved, 20n)];
    const total = pool + newAssets + addition;
    worked = { ...zero, outcome: 'rated', poolDeduction: dollars(pool), newAssetDeduction: dollars(newAssets),
      costAdditionDeduction: dollars(addition), deduction: dollars(total), assessableIncome: dollars(max(total - amount, 0n)),
      closingPoolBalance: dollars(max(amount - total, 0n)) };
  }
  return { year, threshold, lowPoolValueAmount: dollars(amount), ...worked,
    warnings: FULL_EXPENSING_YEARS.includes(year) ? [SBP_FULL_EXPENSING] : [] };
}

const DAY = 86400000;
/** Days since 1970 for a YYYY-MM-DD date from 1900 to 2100, or null. @param {unknown} text */
function day(text) {
  const parts = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : null;
  if (!parts) return null;
  const [y, m, d] = parts.slice(1).map(Number);
  const time = Date.UTC(y, m - 1, d);
  const date = new Date(time);
  if (y < 1900 || y > 2100 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return time / DAY;
}

/** A fraction from 0 to 1 as written, as [numerator, denominator]. @param {unknown} value */
function fraction(value) {
  const parts = typeof value === 'string' && value.length <= 64 ? /^(\d+)(?:\.(\d+))?$/.exec(value) : null;
  const places = parts?.[2]?.length ?? 0;
  const top = parts ? BigInt(parts[1] + (parts[2] ?? '')) : -1n;
  const bottom = 10n ** BigInt(places);
  if (!parts || top > bottom) refuse('input.fraction_invalid', 'Enter the taxable use from 0% to 100%.');
  // The command's working precision: at most 20 significant digits as written, trailing zeros included.
  const digits = (parts[1] + (parts[2] ?? '')).replace(/^0+/, '');
  if (digits.length > 20) refuse('capital_works.precision_exceeded', 'Enter the taxable use to 20 or fewer significant digits.');
  return [top, bottom];
}

/**
 * @typedef {{year: string, rate: '2.5' | '4', provision: '43-210' | '43-215', rateAmount: number, reducedAmount: number,
 *   deduction: number, limited: boolean}} CapitalWorksResult
 */

/**
 * @typedef {{year: string, construction_expenditure: string, construction_start: string, four_percent_manner: boolean,
 *   days_used: number | string, taxable_use: string, undeducted_construction_expenditure: string,
 *   scope_confirmed?: boolean}} CapitalWorksInput
 */

/** ITAA 1997 Division 43: one area's capital works deduction for the year, at 4% for use in the 4% manner
 * (s 43-145) or else 2.5%, for works begun from 16 September 1987 (s 43-210 after 26 February 1992,
 * s 43-215 before). @param {CapitalWorksInput} given @returns {CapitalWorksResult} */
export function capitalWorks(given) {
  const input = /** @type {Record<string, unknown>} */ (given);
  const year = checked(input, 'capital-works', CW_FIELDS);
  const expenditure = money(input.construction_expenditure, 'construction_expenditure');
  const four = input.four_percent_manner;
  if (typeof four !== 'boolean') refuse('input.flag_invalid', 'Choose whether the part was used in the 4% manner.');
  const begun = day(input.construction_start);
  if (begun === null) refuse('input.date_invalid', 'Enter the date construction began, from 1900 to 2100.');
  if (begun < /** @type {number} */ (day('1987-09-16'))) {
    refuse('capital_works.begun_before_16_september_1987', 'Capital works begun before 16 September 1987 (the 4% rate from '
      + '22 August 1984 and the earlier rules of section 43-215) are outside this calculator.');
  }
  const before1992 = begun < /** @type {number} */ (day('1992-02-27'));
  if (four && before1992) {
    refuse('capital_works.four_percent_before_27_february_1992', 'Capital works begun before 27 February 1992 have only the '
      + '2.5% rate (section 43-215 step 1(b)); the 4% manner (section 43-145) is for works begun later.');
  }
  const first = /** @type {number} */ (day(`${year.slice(0, 4)}-07-01`));
  const last = /** @type {number} */ (day(`20${year.slice(5)}-06-30`));
  const most = Math.max(last - Math.max(begun, first) + 1, 0);
  const days = input.days_used;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > most) {
    refuse('input.day_count_invalid', `Enter the days used as a whole number from 0 to ${most} for ${year}, the days from the later `
      + 'of 1 July and the start of construction to 30 June.');
  }
  const [use, scale] = fraction(input.taxable_use);
  const undeducted = money(input.undeducted_construction_expenditure, 'undeducted_construction_expenditure');
  if (undeducted > expenditure) {
    refuse('capital_works.undeducted_above_expenditure', 'The undeducted construction expenditure cannot exceed the construction expenditure.');
  }
  // 2.5% is 1/40 and 4% is 1/25; the days are over 365 even in a leap year. One division, last.
  const rateDivisor = four ? 25n : 40n;
  const product = expenditure * BigInt(days);
  const reducedTop = product * use;
  const reducedBottom = rateDivisor * 365n * scale;
  const limited = undeducted * reducedBottom < reducedTop;
  return { year, rate: four ? '4' : '2.5', provision: before1992 ? '43-215' : '43-210',
    rateAmount: dollars(ratioCents(product, rateDivisor * 365n)), reducedAmount: dollars(ratioCents(reducedTop, reducedBottom)),
    deduction: dollars(limited ? undeducted : ratioCents(reducedTop, reducedBottom)), limited };
}

/** The page's worksheets, by the value of its first field. */
export const POOL_WORKSHEETS = { 'low-value-pool': 'lowValuePool', 'small-business-pool': 'smallBusinessPool', 'capital-works': 'capitalWorks' };

/** A percentage to 2 places as the command's fraction, exact: 50 is 0.5000. An entry that is not one passes on blank,
 * which the worksheet refuses. @param {string} percent */
function percentFraction(percent) {
  const hundredths = scaled(percent.trim(), 2);
  if (hundredths === null) return '';
  return `${hundredths / 10000n}.${String(hundredths % 10000n).padStart(4, '0')}`;
}

/** The command's fraction as the percentage the page shows: 0.5000 is 50%. @param {unknown} text */
function fractionPercent(text) {
  const parts = typeof text === 'string' ? /^(\d+)(?:\.(\d+))?$/.exec(text) : null;
  if (!parts) return String(text);
  const places = (parts[2] ?? '').padEnd(2, '0');
  const rest = places.slice(2).replace(/0+$/, '');
  return `${Number(parts[1] + places.slice(0, 2))}${rest ? `.${rest}` : ''}%`;
}

/** The worksheet the form names and the command's input from its fields. @param {(name: string) => string} value */
export function poolFormInput(value) {
  const year = value('year');
  const worksheet = POOL_WORKSHEETS[/** @type {keyof typeof POOL_WORKSHEETS} */ (value('worksheet'))] ?? 'lowValuePool';
  if (worksheet === 'lowValuePool') {
    return { worksheet, input: { previous_closing_pool_balance: value('previous'), low_cost_assets: value('low-cost'),
      low_value_assets: value('low-value'), second_element_costs: value('second-element'), termination_values: value('lvp-termination'), year } };
  }
  if (worksheet === 'smallBusinessPool') {
    return { worksheet, input: { opening_pool_balance: value('opening'), additions: value('additions'),
      cost_additions: value('cost-additions'), termination_values: value('sbp-termination'), year } };
  }
  const days = value('days').trim();
  return { worksheet, input: { construction_expenditure: value('expenditure'), construction_start: value('start'),
    four_percent_manner: value('manner') === 'yes', days_used: /^\d{1,6}$/.test(days) ? Number(days) : days,
    taxable_use: percentFraction(value('use')), undeducted_construction_expenditure: value('undeducted'), year } };
}

/** @param {unknown} text */
const longDate = (text) => (typeof text === 'string' && day(text) !== null
  ? new Date(`${text}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(text));

/** How the page writes each worksheet's input.
 * @param {string} worksheet @param {Record<string, any>} x @param {(value: number) => string} aud */
export function poolInputsText(worksheet, x, aud) {
  const money = (/** @type {unknown} */ text) => aud(Number(text));
  if (worksheet === 'lowValuePool') {
    return `${x.year} low-value pool; previous closing pool balance ${money(x.previous_closing_pool_balance)}, low-cost assets `
      + `${money(x.low_cost_assets)}, low-value assets ${money(x.low_value_assets)}, second element costs `
      + `${money(x.second_element_costs)}, termination values ${money(x.termination_values)}`;
  }
  if (worksheet === 'smallBusinessPool') {
    return `${x.year} small business pool; opening pool balance ${money(x.opening_pool_balance)}, additions ${money(x.additions)}, `
      + `cost additions ${money(x.cost_additions)}, termination values ${money(x.termination_values)}`;
  }
  return `${x.year} capital works; construction expenditure ${money(x.construction_expenditure)}, begun `
    + `${longDate(x.construction_start)}, ${x.four_percent_manner ? 'used in the 4% manner' : 'not used in the 4% manner'}, `
    + `${x.days_used} days used, taxable use ${fractionPercent(x.taxable_use)}, undeducted construction expenditure `
    + `${money(x.undeducted_construction_expenditure)}`;
}

/** Notes joined as the page writes them. @param {string[]} notes */
const joined = (notes) => notes.map((note) => note.replace(/\.$/, '')).join('. ');

/** The low-value pool's rows. @param {LowValuePoolResult} r @param {(value: number) => string} aud */
function lowValueRows(r, aud) {
  const rows = [['Decline for low-cost assets and second elements, at 18.75%', aud(r.newAssetsDecline)],
    ['Decline for the pool and low-value assets, at 37.5%', aud(r.poolDecline)], ['Decline in value, the deduction', aud(r.declineInValue)],
    ['Closing pool balance before disposals', aud(r.closingBeforeDisposals)], ['Closing pool balance', aud(r.closingPoolBalance)]];
  if (r.assessableExcess) rows.push(['Assessable income: termination values above the balance', aud(r.assessableExcess)]);
  return { rows, principal: 2, note: joined([...r.warnings, 'The decline is rounded to the cent once, after its 2 parts are added']) };
}

/** The small business pool's rows. @param {SmallBusinessPoolResult} r @param {(value: number) => string} aud */
function smallBusinessRows(r, aud) {
  const rows = [['Low pool value amount', aud(r.lowPoolValueAmount)]];
  if (r.outcome === 'rated') {
    rows.push(['Pool deduction, 30% of the opening balance', aud(r.poolDeduction)], ['New assets, 15% of the additions', aud(r.newAssetDeduction)],
      ['Cost additions, 15%', aud(r.costAdditionDeduction)]);
  }
  const principal = rows.push([r.outcome === 'written_off' ? 'Low pool value deduction, the whole amount' : 'Deduction', aud(r.deduction)]) - 1;
  if (r.assessableIncome) rows.push(['Assessable income', aud(r.assessableIncome)]);
  rows.push(['Closing pool balance', aud(r.closingPoolBalance)]);
  const limit = r.threshold === null ? `${r.year} has no low pool value limit: any amount above zero is written off`
    : `The low pool value threshold for ${r.year} is $${r.threshold.toLocaleString('en-AU')}: an amount above zero and below it is written off`;
  return { rows, principal, note: joined([...r.warnings, limit]) };
}

/** The capital works rows. @param {CapitalWorksResult} r @param {Record<string, any>} x @param {(value: number) => string} aud */
function capitalWorksRows(r, x, aud) {
  const rows = [[`Construction expenditure at ${r.rate}% for ${x.days_used} days over 365`, aud(r.rateAmount)],
    [`Reduced to the taxable use of ${fractionPercent(x.taxable_use)}`, aud(r.reducedAmount)], ['Capital works deduction', aud(r.deduction)]];
  const notes = [`Worked under section ${r.provision}`];
  if (r.limited) notes.push('Limited to the undeducted construction expenditure');
  return { rows, principal: 2, note: joined(notes) };
}

/** The page's result for the chosen worksheet. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function depreciationPoolsResult(value, aud) {
  const { worksheet, input } = poolFormInput(value);
  const inputs = poolInputsText(worksheet, input, aud);
  // The form gives each worksheet its own fields; the worksheet checks them as the command does.
  const given = /** @type {any} */ (input);
  if (worksheet === 'lowValuePool') return { inputs, ...lowValueRows(lowValuePool(given), aud) };
  if (worksheet === 'smallBusinessPool') return { inputs, ...smallBusinessRows(smallBusinessPool(given), aud) };
  return { inputs, ...capitalWorksRows(capitalWorks(given), given, aud) };
}
