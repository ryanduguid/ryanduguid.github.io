// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The change in value of trading stock under ITAA 1997 s 70-35 for 2020-21 to 2026-27, each closing item at
// the value elected for it (s 70-45 or s 70-50), and the small and medium business choice of s 328-285 with
// the values of s 328-295: the `trading-stock` command of ryanduguid/australian-accounting (main at e1f5bee)
// ported line for line, with its inputs, rounding and refusal codes in the order the command checks them.
// The command read ITAA 1997 compilation 268 (1 October 2026) on 22 November 2026; ss 70-35 to 70-50 read the
// same in compilations 210 (1 July 2020) and 223 (1 July 2021), and s 328-285(2), the $50 million entity,
// applies to income years starting on or after 1 July 2021 (Act No. 92 of 2020 Sch 3 item 40(8)).

import { field, flag, itemMoney, money, readFields, refuse, scope, shownCents } from './aa-command.mjs';

export const TRADING_STOCK_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
const PARAMS = /** @type {const} */ ([['entity', 'raw'], ['opening_value', 'dec'], ['items', 'raw'], ['estimated_closing_value', 'dec'],
  ['simplified_choice', 'raw'], ['year', 'raw'], ['scope_confirmed', 'raw']]);
/** Section 328-285(1)(b), in cents. */
const LIMIT = 500000n;
const MAX_ITEMS = 500;
/** The 3 values of s 70-45(1), in its order. */
const VALUES = ['cost', 'market_selling_value', 'replacement_value'];
const ITEM_KEYS = [...VALUES, 'method', 'obsolescence_value'];

/** An amount in cents and whether it was given as a negative zero, which the command shows as '-0.00'.
 * @typedef {{cents: bigint, minus: boolean}} Amount */

/** @param {Amount} a */
const shown = (a) => (a.minus && !a.cents ? '-0.00' : shownCents(a.cents));

/** @param {unknown} value @returns {value is string} */
const minusZero = (value) => typeof value === 'string' && value.trim().startsWith('-');

/** An item's amount, as the command reads one. @param {Map<string, unknown>} item @param {string} name @param {string} key @returns {Amount} */
function amount(item, name, key) {
  const value = required(item, name, key);
  return { cents: itemMoney(value, `${name}: enter the ${key.replaceAll('_', ' ')} as an amount of 0 or more with no more than 2 decimal places.`),
    minus: minusZero(value) };
}

/** @param {Map<string, unknown>} item @param {string} name @param {string} key */
function required(item, name, key) {
  if (!item.has(key)) refuse('input.missing_field', `${name}: ${key} is required`);
  return item.get(key);
}

/** The lowest of the 3 values, all of which must be given; the first in s 70-45(1)'s order on a tie.
 * @param {string} name @param {(Amount | null)[]} values @param {string} why @returns {[number, Amount]} */
function lowest(name, values, why) {
  /** @type {[number, Amount] | null} */
  let best = null;
  for (const [i, value] of values.entries()) {
    if (!value) refuse('trading_stock.value_missing', `${name}: ${why} needs cost, market_selling_value and replacement_value.`);
    if (!best || value.cents < best[1].cents) best = [i, value];
  }
  return /** @type {[number, Amount]} */ (best);
}

/** One item's elected method and value (s 70-45(1) or s 70-50). @param {unknown} given @param {number} i */
function valueItem(given, i) {
  const name = `item ${i + 1}`;
  if (given === null || typeof given !== 'object' || Array.isArray(given)) refuse('trading_stock.items_invalid', `${name} must be an object.`);
  const item = new Map(Object.entries(given));
  const extra = [...item.keys()].find((key) => !ITEM_KEYS.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${name}: ${extra} is not an input of an item`);
  const values = VALUES.map((key) => (required(item, name, key) === null ? null : amount(item, name, key)));
  const given_ = required(item, name, 'method');
  const method = typeof given_ === 'string' ? given_ : '';
  if (method !== 'obsolescence' && item.has('obsolescence_value')) {
    refuse('input.field_unknown', `${name}: obsolescence_value is an input only for the obsolescence method`);
  }
  if (method === 'lowest') {
    const [at, value] = lowest(name, values, 'lowest');
    return { method: /** @type {string} */ (VALUES.at(at)), value };
  }
  if (method === 'obsolescence') {
    const [, least] = lowest(name, values, 'obsolescence');
    const value = amount(item, name, 'obsolescence_value');
    if (value.cents >= least.cents) {
      refuse('trading_stock.obsolescence_not_below', `${name}: an obsolescence value must be below its cost, market selling value and replacement `
        + 'value (ITAA 1997 s 70-50).');
    }
    return { method, value };
  }
  const at = VALUES.indexOf(method);
  if (at < 0) refuse('trading_stock.method_invalid', `${name}: method must be cost, market_selling_value, replacement_value, lowest or obsolescence.`);
  const value = values.at(at);
  if (!value) return refuse('trading_stock.value_missing', `${name}: ${method} is the elected method and is null.`);
  return { method, value };
}

/** Whether the entity may make the s 328-285 choice for the year. @param {unknown} entity @param {string} year */
function eligible(entity, year) {
  if (entity === 'small_business_entity') return true;
  if (entity === 'medium_business_entity') return year !== '2020-21';
  if (entity === 'other') return false;
  return refuse('trading_stock.entity_invalid', 'entity must be small_business_entity, medium_business_entity or other.');
}

/** @param {bigint} a @param {bigint} b */
const gap = (a, b) => (a < b ? b - a : a - b);

/**
 * @typedef {{year: string, amounts: Record<string, string>, rates: Record<string, string>,
 *   items: {item: number, method: string, value: string}[], simplifiedAvailable: boolean, simplifiedChosen: boolean, eligible: boolean,
 *   closingValue: number, assessableIncrease: number, deduction: number}}
 *   TradingStockResult
 */

/** The closing value and the assessable increase or deduction for one income year, from the command's call.
 * @param {Record<string, unknown>} call @returns {TradingStockResult} */
export function tradingStock(call) {
  const fields = readFields(call, 'trading-stock', PARAMS);
  const year = scope(fields, TRADING_STOCK_YEARS);
  const canChoose = eligible(field(fields, 'entity').value, year);
  const openingField = field(fields, 'opening_value');
  const opening = { cents: money(openingField.dec), minus: minusZero(openingField.value) };
  const list = field(fields, 'items').value;
  if (!Array.isArray(list) || list.length > MAX_ITEMS) refuse('trading_stock.items_invalid', `items must be a list of at most ${MAX_ITEMS} objects.`);
  const valued = list.map((item, i) => valueItem(item, i));
  const stocktake = valued.reduce((sum, v) => sum + v.value.cents, 0n);
  const estimateField = field(fields, 'estimated_closing_value');
  const estimate = estimateField.value === null ? { cents: stocktake, minus: false }
    : { cents: money(estimateField.dec), minus: minusZero(estimateField.value) };
  const chosen = flag(field(fields, 'simplified_choice').value, 'simplified_choice');
  const difference = gap(estimate.cents, opening.cents);
  const available = canChoose && difference <= LIMIT;
  if (chosen && !available) refuse('trading_stock.simplified_unavailable', unavailable(canChoose, year));
  const closing = chosen ? opening : { cents: stocktake, minus: false };
  const amounts = { opening_value: shown(opening), stocktake_value: shownCents(stocktake), estimated_closing_value: shown(estimate),
    // Decimal('-0') - Decimal('0') is Decimal('-0'): the only difference the command shows as '-0.00'.
    estimate_difference: shown({ cents: difference, minus: estimate.minus && !opening.minus }), closing_value: shown(closing),
    assessable_increase: shownCents(closing.cents < opening.cents ? 0n : closing.cents - opening.cents),
    deduction: shownCents(closing.cents < opening.cents ? opening.cents - closing.cents : 0n) };
  return { year, amounts, rates: { simplified_limit: '5000' }, closingValue: Number(amounts.closing_value),
    assessableIncrease: Number(amounts.assessable_increase), deduction: Number(amounts.deduction), simplifiedAvailable: available, simplifiedChosen: chosen, eligible: canChoose,
    items: valued.map((v, i) => ({ item: i + 1, method: v.method, value: shown(v.value) })) };
}

/** Why the s 328-285 choice is not open. @param {boolean} canChoose @param {string} year */
function unavailable(canChoose, year) {
  if (canChoose) {
    return 'The choice not to account for changes in the value of trading stock needs the reasonably estimated closing value within $5,000 of '
      + 'the opening value (ITAA 1997 s 328-285(1)(b)).';
  }
  return `The choice not to account for changes in the value of trading stock is open in ${year} only to a small business entity`
    + `${year === '2020-21' ? '; the $50 million entity of s 328-285(2) applies from 2021-22 (Act No. 92 of 2020 Sch 3 item 40(8))'
      : ' or an entity covered by s 328-285(2)'} (ITAA 1997 s 328-285(1)(a)).`;
}

const ITEMS_ON_PAGE = 4;
const METHOD_WORDS = new Map([['cost', 'cost'], ['market_selling_value', 'market selling value'], ['replacement_value', 'replacement value'],
  ['obsolescence', 'obsolescence value']]);

/** The form's input as the command's call: each item with a cost entered. @param {(name: string) => string} value */
export function tradingStockFormInput(value) {
  const blank = (/** @type {string} */ name) => (value(name).trim() === '' ? null : value(name));
  const items = [];
  for (let n = 1; n <= ITEMS_ON_PAGE; n += 1) {
    if (value(`cost-${n}`).trim() === '') continue;
    const method = value(`method-${n}`);
    items.push({ cost: value(`cost-${n}`), market_selling_value: blank(`market-${n}`), replacement_value: blank(`replacement-${n}`), method,
      ...(method === 'obsolescence' ? { obsolescence_value: value(`obsolete-${n}`) } : {}) });
  }
  return { entity: value('entity'), opening_value: value('opening'), items, estimated_closing_value: blank('estimate'),
    simplified_choice: value('choice') === 'yes', year: value('year'), scope_confirmed: true };
}

/** How the page writes the command's input. @param {ReturnType<typeof tradingStockFormInput>} x @param {(value: number) => string} aud */
export function tradingStockInputsText(x, aud) {
  const entity = new Map([['small_business_entity', 'a small business entity'], ['medium_business_entity', 'an entity with turnover under $50 million'],
    ['other', 'another entity']]).get(x.entity) ?? x.entity;
  return `${x.year}; ${entity}; opening value ${aud(Number(x.opening_value))}; ${x.items.length} ${x.items.length === 1 ? 'item' : 'items'} on hand`
    + `${x.estimated_closing_value === null ? '' : `; estimated closing value ${aud(Number(x.estimated_closing_value))}`}`
    + `${x.simplified_choice ? '; choosing not to account for the change' : ''}`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function tradingStockResult(value, aud) {
  const input = tradingStockFormInput(value);
  const r = tradingStock(input);
  const a = (/** @type {string} */ text) => aud(Number(text));
  /** @type {[string, string][]} */
  const rows = r.items.map((item) => [`Item ${item.item} at its ${METHOD_WORDS.get(item.method)}`, a(item.value)]);
  rows.push(['Stocktake value', a(r.amounts.stocktake_value)], ['Opening value', a(r.amounts.opening_value)],
    [r.simplifiedChosen ? 'Closing value, equal to the opening value (section 328-295)' : 'Closing value', a(r.amounts.closing_value)]);
  const deduction = Number(r.amounts.deduction) > 0;
  const principal = rows.push(deduction ? ['Deduction for the decrease (section 70-35(3))', a(r.amounts.deduction)]
    : ['Assessable increase (section 70-35(2))', a(r.amounts.assessable_increase)]) - 1;
  const note = r.simplifiedChosen ? 'Under the choice the closing value is the opening value: nothing is assessable or deductible'
    : r.simplifiedAvailable ? `The choice not to account for the change is open: the estimate is within $5,000 of the opening value (${a(r.amounts.estimate_difference)} apart)`
      : r.eligible ? `The choice is not open: the estimate is ${a(r.amounts.estimate_difference)} from the opening value, more than $5,000`
        : 'The choice is not open to this entity for the year (section 328-285(1)(a))';
  return { inputs: tradingStockInputsText(input, aud), rows, principal, note };
}
