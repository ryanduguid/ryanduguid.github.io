// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { ratioCents } from './money.mjs';

// Wine equalisation tax on a tax period's assessable dealings in wine, and the producer rebate on
// them under the yearly cap, with BAS labels 1C and 1D: the `wine-equalisation-tax` command of
// ryanduguid/australian-accounting ported line for line (its inputs, rounding and refusal codes).
// Read 22 November 2026:
// - A New Tax System (Wine Equalisation Tax) Act 1999 at the ATO's legal database: s 5-5(3) (29%),
//   ss 5-50 and 7-10 (quoting), ss 9-25 to 9-40 (notional wholesale selling prices) and ss 19-5,
//   19-15 and 19-25 (the producer rebate, its cap and claims above it).
// - Treasury Laws Amendment (Supporting Choice in Superannuation and Other Measures) Act 2026
//   (No. 12, 2026) Schedule 6: the cap is $400,000 for assessable dealings from 1 July 2026.
// - The ATO's 'Wholesale sales' (QC22750), 'Retail sales and own use' (QC22751), 'Producer
//   rebate' (QC22756, last updated 30 June 2026: $350,000 from 1 July 2018 to 30 June 2026),
//   'Calculate and claim your rebate' (QC22758) and 'Instructions for completing your BAS'
//   (QC17458: whole dollars, rounded down).
// Each amount is worked in whole cents and rounded half up once, as the command does.

export const WET_READ = '2026-11-22';
export const WET_YEARS = ['2023-24', '2024-25', '2025-26', '2026-27', '2027-28'];
/** The yearly cap on producer rebates (s 19-15(2) and (3)), in dollars. @param {string} year */
export const wetRebateCap = (year) => (year >= '2026-27' ? 400000 : 350000);

/** What each dealing is, as the page names it. */
export const WET_KINDS = {
  wholesale_sale: 'Wholesale sale',
  retail_sale: 'Retail sale',
  own_use: 'Own use',
  quoted_sale: 'Sale under quote',
  own_use_purchased_under_quote: 'Own use of wine bought under quote',
};
/** The fields each kind takes, as the command takes them. @type {Record<string, string[]>} */
const FIELDS = {
  wholesale_sale: ['kind', 'price_excluding_wet_and_gst', 'rebate_conditions'],
  retail_sale: ['kind', 'retail_price_including_wet_and_gst', 'average_wholesale', 'rebate_conditions'],
  own_use: ['kind', 'retail_price_including_wet_and_gst', 'average_wholesale', 'rebate_conditions'],
  quoted_sale: ['kind', 'price_excluding_wet_and_gst', 'purchaser_intention', 'rebate_conditions'],
  own_use_purchased_under_quote: ['kind', 'purchase_price_excluding_gst'],
};
/** What a purchaser's quote may state (WET Act s 5-50(1)(b)). */
export const WET_INTENTIONS = {
  taxable_dealing: 'a taxable dealing of its own',
  manufacture: 'using the wine in manufacture',
  gst_free_supply: 'a GST-free supply, such as an export',
  sale_under_quote: 'selling it on under quote',
};
const CONDITIONS = ['producer', 'source_product_owned_85_percent', 'container_and_trade_mark'];
const AVERAGE_FIELDS = ['grape_wine', 'wholesale_share_at_least_10_percent', 'quantity', 'wholesale_sales'];
const SALE_FIELDS = ['quantity', 'price_excluding_wet_and_gst'];
const MAX_DEALINGS = 1000;
const MAX_SALES = 1000;
const AMOUNT_NAMES = /** @type {Record<string, string>} */ ({ price_excluding_wet_and_gst: 'the price excluding WET and GST',
  retail_price_including_wet_and_gst: 'the retail price including WET and GST', purchase_price_excluding_gst: 'the purchase price excluding GST',
  rebate_claimed_earlier_in_year: 'the rebates already claimed' });
const INPUT_FIELDS = ['year', 'dealings', 'rebate_claimed_earlier_in_year', 'associated_producer', 'scope_confirmed'];

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** @param {Record<string, unknown>} fields @param {string} item @param {string} what @param {string[]} allowed */
function known(fields, item, what, allowed) {
  const extra = Object.keys(fields).find((key) => !allowed.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${item}: ${extra} is not an input of ${what}.`);
}

/** @param {Record<string, unknown>} fields @param {string} item @param {string} key */
function required(fields, item, key) {
  if (!(key in fields)) refuse('input.missing_field', `${item}: ${key} is required.`);
  return fields[key];
}

/** A decimal string scaled to whole 10^-places, or null. @param {unknown} value @param {number} places */
function scaled(value, places) {
  const parts = typeof value === 'string' && value.length <= 32 ? /^(\d+)(?:\.(\d+))?$/.exec(value) : null;
  if (!parts || (parts[2] ?? '').length > places) return null;
  return BigInt(parts[1] + (parts[2] ?? '').padEnd(places, '0'));
}

/** An amount in whole cents, to $1,000,000,000,000. @param {Record<string, unknown>} fields @param {string} item @param {string} key */
function amount(fields, item, key) {
  const cents = scaled(required(fields, item, key), 2);
  if (cents === null || cents > 100000000000000n) {
    refuse('input.amount_invalid', `${item}: enter ${AMOUNT_NAMES[key] ?? key} in dollars and cents, from 0 to 1,000,000,000,000.`);
  }
  return cents;
}

/** A quantity above nil, at most 1e12 and 4 decimal places, in ten-thousandths. @param {Record<string, unknown>} fields @param {string} item @param {string} key */
function quantity(fields, item, key) {
  const q = scaled(required(fields, item, key), 4);
  if (q === null || q === 0n || q > 10000000000000000n) {
    refuse('wine_equalisation_tax.quantity_invalid', `${item}: the quantity must be more than 0, at most 1,000,000,000,000 and to 4 decimal places.`);
  }
  return q;
}

/** @param {Record<string, unknown>} fields @param {string} item @param {string} key */
function flag(fields, item, key) {
  const value = required(fields, item, key);
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `${item}: ${key} must be yes or no.`);
  return value;
}

/** The average wholesale price method's facts (WET Act ss 9-25(3) and 9-40). @param {unknown} value @param {string} item */
function averageWholesale(value, item) {
  if (!isObject(value)) refuse('wine_equalisation_tax.dealing_invalid', `${item}: the average wholesale price facts must be an object.`);
  known(value, item, 'average_wholesale', AVERAGE_FIELDS);
  if (!flag(value, item, 'grape_wine')) {
    refuse('wine_equalisation_tax.method_unavailable', `${item}: wine that is not grape wine is valued by the half retail price method only `
      + '(section 9-30); enter its retail price instead.');
  }
  if (!flag(value, item, 'wholesale_share_at_least_10_percent')) {
    refuse('wine_equalisation_tax.method_unavailable', `${item}: the average wholesale price method is open only if at least 10% by value `
      + 'of the tax period’s sales of grape wine of that vintage and variety are wholesale sales (subsection 9-25(3)); use the half retail price method.');
  }
  const own = quantity(value, item, 'quantity');
  const sales = value.wholesale_sales;
  if (!Array.isArray(sales) || sales.length === 0 || sales.length > MAX_SALES) {
    refuse('wine_equalisation_tax.dealing_invalid', `${item}: enter at least one of the tax period’s wholesale sales of the same vintage and variety.`);
  }
  let sold = 0n;
  let price = 0n;
  for (const sale of sales) {
    if (!isObject(sale)) refuse('wine_equalisation_tax.dealing_invalid', `${item}: each wholesale sale must be an object.`);
    known(sale, item, 'a wholesale sale', SALE_FIELDS);
    sold += quantity(sale, item, 'quantity');
    price += amount(sale, item, 'price_excluding_wet_and_gst');
  }
  return { method: 'average_wholesale_price', quantity: own, sold, price };
}

/** A retail sale or own use: the half retail price method, or the average wholesale price method.
 * @param {Record<string, unknown>} fields @param {string} item @param {string} kind */
function retailValuation(fields, item, kind) {
  const retail = 'retail_price_including_wet_and_gst';
  const price = retail in fields ? amount(fields, item, retail) : null;
  const average = fields.average_wholesale;
  if (average !== undefined && price !== null && kind === 'own_use') {
    refuse('input.field_unknown', `${item}: give own use either its retail price (the half retail price method) or the average wholesale price facts, not both.`);
  }
  if (average !== undefined && (price !== null || kind === 'own_use')) return { valuation: averageWholesale(average, item), retail: price };
  if (average === undefined && price !== null) return { valuation: { method: 'half_retail_price', price }, retail: price };
  return refuse('input.missing_field', `${item}: ${retail} is required.`);
}

/** Dealing `n`'s facts, checked in the command's order. @param {unknown} value @param {number} n */
function parseDealing(value, n) {
  const item = `Dealing ${n}`;
  if (!isObject(value)) refuse('wine_equalisation_tax.dealing_invalid', `${item}: a dealing must be an object.`);
  const kind = typeof value.kind === 'string' && Object.hasOwn(FIELDS, value.kind) ? value.kind : null;
  if (kind === null) {
    refuse('wine_equalisation_tax.kind_invalid', `${item}: the kind must be a wholesale sale, a retail sale, own use, a sale under quote `
      + 'or own use of wine bought under quote.');
  }
  if (kind === 'own_use_purchased_under_quote' && 'rebate_conditions' in value) {
    refuse('input.field_unknown', `${item}: own use of wine bought under quote earns no producer rebate (section 19-5): the producer is the seller.`);
  }
  known(value, item, kind, FIELDS[kind]);
  /** @type {{method: string, price: bigint, quantity?: bigint, sold?: bigint}} */
  let valuation;
  let retail = null;
  if (kind === 'wholesale_sale' || kind === 'quoted_sale') {
    valuation = { method: 'price', price: amount(value, item, 'price_excluding_wet_and_gst') };
  } else if (kind === 'own_use_purchased_under_quote') {
    valuation = { method: 'purchase_price', price: amount(value, item, 'purchase_price_excluding_gst') };
  } else {
    ({ valuation, retail } = retailValuation(value, item, kind));
  }
  let intention = null;
  if (kind === 'quoted_sale') {
    const given = required(value, item, 'purchaser_intention');
    if (typeof given !== 'string' || !Object.hasOwn(WET_INTENTIONS, given)) {
      refuse('wine_equalisation_tax.intention_invalid', `${item}: say what the purchaser’s quote states it will do with the wine.`);
    }
    intention = given;
  }
  let conditions = null;
  if (value.rebate_conditions !== undefined) {
    const given = value.rebate_conditions;
    if (!isObject(given)) refuse('wine_equalisation_tax.dealing_invalid', `${item}: the rebate conditions must be an object.`);
    known(given, item, 'rebate_conditions', CONDITIONS);
    conditions = CONDITIONS.map((key) => flag(given, item, key));
  }
  return { kind, valuation, retail: kind === 'retail_sale' ? retail : null, intention, conditions };
}

const at29 = (/** @type {bigint} */ cents) => ratioCents(cents * 29n, 100n);
const SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

/** @typedef {{dealing: number, kind: string, taxableValue: number, method: string, wineTax: number, gst: number | null,
 *   priceIncludingWetAndGst: number | null, intention: string | null, rebate: null | {conditions: boolean[], liable: boolean,
 *   allMet: boolean, amount: number}}} WetDealing */
/** @typedef {{year: string, wineTax: number, label1c: number, rebateBeforeCap: number, rebate: number, rebateOverCap: number,
 *   label1d: number, cap: number, capLeft: number, dealings: WetDealing[], warnings: string[]}} WetResult */

/** Dealing `n`'s working, in cents. @param {ReturnType<typeof parseDealing>} d @param {number} n */
function workDealing(d, n) {
  const v = d.valuation;
  const value = v.method === 'half_retail_price' ? ratioCents(v.price, 2n)
    : v.method === 'average_wholesale_price' ? ratioCents(v.price * /** @type {bigint} */ (v.quantity), /** @type {bigint} */ (v.sold))
      : v.price;
  const tax = d.kind === 'quoted_sale' ? 0n : at29(value);
  let gst = null;
  let total = null;
  if (d.kind === 'wholesale_sale' || d.kind === 'quoted_sale') {
    gst = ratioCents(value + tax, 10n);
    total = value + tax + gst;
  } else if (d.retail !== null) {
    gst = ratioCents(d.retail, 11n);
    total = d.retail;
  }
  let rebate = null;
  let earned = 0n;
  if (d.conditions) {
    const liable = d.intention === null || d.intention === 'taxable_dealing';
    const allMet = liable && d.conditions.every(Boolean);
    earned = allMet ? at29(value) : 0n;
    rebate = { conditions: d.conditions, liable, allMet, amount: Number(earned) / 100 };
  }
  const dollars = (/** @type {bigint | null} */ c) => (c === null ? null : Number(c) / 100);
  const largest = total !== null && total > value ? total : value;
  return { tax, earned, largest, worked: /** @type {WetDealing} */ ({ dealing: n, kind: d.kind, taxableValue: Number(value) / 100, method: v.method,
    wineTax: Number(tax) / 100, gst: dollars(gst), priceIncludingWetAndGst: dollars(total), intention: d.intention, rebate }) };
}

/** The wine tax, the producer rebate within its cap and BAS labels 1C and 1D for a tax period's dealings.
 * @param {{year: string, dealings: unknown, rebate_claimed_earlier_in_year?: string, associated_producer?: boolean, scope_confirmed?: boolean}} input
 * @returns {WetResult} */
export function wineEqualisationTax(input) {
  known(/** @type {Record<string, unknown>} */ (input), 'The input', 'wine-equalisation-tax', INPUT_FIELDS);
  // The page states the command's scope beside the form, so a call without scope_confirmed is taken as
  // confirmed; given, it must be true, as the command requires.
  if ('scope_confirmed' in input && input.scope_confirmed !== true) {
    refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  }
  if (!WET_YEARS.includes(input.year)) {
    refuse('period.unsupported', `Choose a financial year from ${WET_YEARS[0]} to ${WET_YEARS.at(-1)}: earlier years carry the transitional `
      + 'producer rebate rules for 2017 and earlier vintage wine, which this calculator does not work out.');
  }
  const given = input.dealings;
  if (!Array.isArray(given) || given.length === 0 || given.length > MAX_DEALINGS) {
    refuse('wine_equalisation_tax.dealings_invalid', `Enter from 1 to ${MAX_DEALINGS.toLocaleString('en-AU')} dealings.`);
  }
  const dealings = given.map((d, i) => parseDealing(d, i + 1));
  const claimed = dealings.some((d) => d.conditions !== null);
  const hasEarlier = input.rebate_claimed_earlier_in_year !== undefined;
  const hasGroup = input.associated_producer !== undefined;
  let earlier = 0n;
  let group = false;
  if (claimed) {
    if (!hasEarlier || !hasGroup) {
      refuse('input.missing_field', `A producer rebate claim needs ${hasEarlier ? 'whether the producer is in an associated group'
        : 'the rebates already claimed this financial year'}.`);
    }
    earlier = amount(input, 'The input', 'rebate_claimed_earlier_in_year');
    group = flag(input, 'The input', 'associated_producer');
  } else if (hasEarlier || hasGroup) {
    refuse('input.field_unknown', 'The rebates claimed earlier and the associated group are inputs only when a dealing claims the producer rebate.');
  }
  let tax = 0n;
  let earned = 0n;
  let largest = 0n;
  const worked = dealings.map((d, i) => {
    const w = workDealing(d, i + 1);
    tax += w.tax;
    earned += w.earned;
    largest = w.largest > largest ? w.largest : largest;
    return w.worked;
  });
  // Results are JavaScript numbers, exact to the cent only up to 2^53 - 1 cents: the page refuses larger figures.
  if ([largest, tax, earned].some((cents) => cents > SAFE_CENTS)) {
    refuse('input.amount_invalid', 'This calculator shows amounts to the cent only up to $90 trillion; a value or total here is larger.');
  }
  const cap = BigInt(wetRebateCap(input.year)) * 100n;
  const left = earlier < cap ? cap - earlier : 0n;
  const rebate = earned < left ? earned : left;
  const warnings = claimed ? capWarnings(input.year, group, earlier > cap) : [];
  const dollars = (/** @type {bigint} */ c) => Number(c) / 100;
  return { year: input.year, wineTax: dollars(tax), label1c: Number(tax / 100n), rebateBeforeCap: dollars(earned), rebate: dollars(rebate),
    rebateOverCap: dollars(earned - rebate), label1d: Number(rebate / 100n), cap: wetRebateCap(input.year), capLeft: dollars(left),
    dealings: worked, warnings };
}

/** The notes on a rebate claim's cap. @param {string} year @param {boolean} group @param {boolean} over */
function capWarnings(year, group, over) {
  const capText = `$${wetRebateCap(year).toLocaleString('en-AU')}`;
  const warnings = ['The rebates already claimed reduce what is left of the year’s cap: the ATO accepts rebates claimed in the activity '
    + 'statement for the period the wine tax is attributed to (WETR 2009/2 paragraph 67).'];
  if (group) {
    warnings.push(`An associated producer shares the ${capText} cap with its group (sections 19-15(3) and 19-20): the rebates claimed `
      + 'earlier must be the group’s, and the group splits what is left.');
  }
  if (over) {
    warnings.push(`The rebates claimed earlier in the year exceed the ${capText} cap; section 19-25 makes the excess payable as wine tax `
      + 'at the end of the financial year.');
  }
  return warnings;
}

export const WET_FORM_DEALINGS = 6;
export const WET_FORM_SALES = 4;
const blank = (/** @type {string} */ text) => text.trim() === '';

/** The command's input from the form: up to 6 dealings, one set of wholesale sales for the average method and
 * one set of rebate conditions for every dealing that claims the rebate. @param {(name: string) => string} value */
export function wetFormInput(value) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  const sales = [];
  for (let j = 1; j <= WET_FORM_SALES; j += 1) {
    const [q, p] = [value(`sale-quantity-${j}`), value(`sale-price-${j}`)];
    if (blank(q) && blank(p)) continue;
    sales.push({ quantity: q, price_excluding_wet_and_gst: p });
  }
  const conditions = { producer: yes('producer'), source_product_owned_85_percent: yes('source-product'),
    container_and_trade_mark: yes('container') };
  /** @type {Record<string, unknown>[]} */
  const dealings = [];
  for (let i = 1; i <= WET_FORM_DEALINGS; i += 1) {
    const kind = value(`kind-${i}`);
    if (kind === '') continue;
    const price = value(`price-${i}`);
    /** @type {Record<string, unknown>} */
    const d = { kind };
    if (kind === 'wholesale_sale' || kind === 'quoted_sale') d.price_excluding_wet_and_gst = price;
    else if (kind === 'own_use_purchased_under_quote') d.purchase_price_excluding_gst = price;
    else {
      const average = value(`method-${i}`) === 'average';
      if (!average || kind === 'retail_sale') d.retail_price_including_wet_and_gst = price;
      if (average) {
        d.average_wholesale = { grape_wine: yes('grape-wine'), wholesale_share_at_least_10_percent: yes('wholesale-share'),
          quantity: value(`quantity-${i}`), wholesale_sales: sales };
      }
    }
    if (kind === 'quoted_sale') d.purchaser_intention = value(`intention-${i}`);
    // Own use of wine bought under quote earns no rebate, so its rebate answer is not passed on.
    if (kind !== 'own_use_purchased_under_quote' && value(`rebate-${i}`) === 'yes') d.rebate_conditions = conditions;
    dealings.push(d);
  }
  /** @type {{year: string, dealings: Record<string, unknown>[], rebate_claimed_earlier_in_year?: string, associated_producer?: boolean}} */
  const input = { year: value('year'), dealings };
  if (dealings.some((d) => d.rebate_conditions)) {
    input.rebate_claimed_earlier_in_year = value('earlier');
    input.associated_producer = yes('group');
  }
  return input;
}

const METHODS = { price: 'the price', purchase_price: 'the purchase price', half_retail_price: 'half the retail price',
  average_wholesale_price: 'the average wholesale price' };

/** How the page writes the command's input. @param {ReturnType<typeof wetFormInput>} input @param {(value: number) => string} aud */
export function wetInputsText(input, aud) {
  const money = (/** @type {unknown} */ text) => aud(Number(text));
  const dealings = input.dealings.map((raw, i) => {
    const d = /** @type {Record<string, any>} */ (raw);
    const what = WET_KINDS[/** @type {keyof typeof WET_KINDS} */ (d.kind)] ?? d.kind;
    const priced = d.price_excluding_wet_and_gst !== undefined ? ` at ${money(d.price_excluding_wet_and_gst)} excluding WET and GST`
      : d.purchase_price_excluding_gst !== undefined ? ` bought for ${money(d.purchase_price_excluding_gst)} excluding GST`
        : d.retail_price_including_wet_and_gst !== undefined ? ` at a retail price of ${money(d.retail_price_including_wet_and_gst)} including WET and GST` : '';
    const average = d.average_wholesale ? `, by the average wholesale price for ${d.average_wholesale.quantity}` : '';
    const quote = d.purchaser_intention ? `, quote states ${WET_INTENTIONS[/** @type {keyof typeof WET_INTENTIONS} */ (d.purchaser_intention)]
      ?? d.purchaser_intention}` : '';
    return `dealing ${i + 1}: ${what.toLowerCase()}${priced}${average}${quote}${d.rebate_conditions ? ', rebate claimed' : ''}`;
  });
  const sales = input.dealings.map((d) => /** @type {Record<string, any>} */ (d).average_wholesale).find(Boolean);
  const salesText = sales ? `the period’s wholesale sales ${sales.wholesale_sales.map((/** @type {Record<string, string>} */ s) =>
    `${s.quantity} for ${money(s.price_excluding_wet_and_gst)}`).join(' and ')}` : '';
  const rebate = input.rebate_claimed_earlier_in_year === undefined ? ''
    : `rebates claimed earlier this year ${money(input.rebate_claimed_earlier_in_year)}${input.associated_producer ? ', an associated producer' : ''}`;
  return [input.year, ...dealings, salesText, rebate].filter(Boolean).join('; ');
}

/** The page's result: the totals and labels as rows, and each dealing in the table.
 * @param {(name: string) => string} value @param {(value: number) => string} aud */
export function wineEqualisationTaxResult(value, aud) {
  const input = wetFormInput(value);
  const r = wineEqualisationTax(input);
  const claimed = r.dealings.some((d) => d.rebate);
  const rows = [['Wine tax for the period', aud(r.wineTax)], ['Label 1C, WET payable, in whole dollars', aud(r.label1c)]];
  if (claimed) {
    rows.push(['Producer rebate earned on these dealings', aud(r.rebateBeforeCap)],
      [`Cap left for ${r.year}, of $${r.cap.toLocaleString('en-AU')}`, aud(r.capLeft)],
      ['Producer rebate within the cap', aud(r.rebate)]);
    if (r.rebateOverCap) rows.push(['Rebate over the cap, not claimable', aud(r.rebateOverCap)]);
    rows.push(['Label 1D, WET refundable, in whole dollars', aud(r.label1d)]);
  }
  const unmet = r.dealings.filter((d) => d.rebate && !d.rebate.allMet).map((d) => d.dealing);
  const notes = r.warnings.map((w) => w.replace(/\.$/, ''));
  if (unmet.length) {
    notes.push(`No rebate on dealing ${unmet.join(' and ')}: a condition of subsection 19-5(1) is not met, or the quote states the purchaser `
      + 'will not make a taxable dealing (paragraph 5-50(1)(b))');
  }
  notes.push('Report 1C and 1D separately; do not net them');
  const dealings = r.dealings.map((d) => [`Dealing ${d.dealing}: ${WET_KINDS[/** @type {keyof typeof WET_KINDS} */ (d.kind)]}`,
    aud(d.taxableValue), METHODS[/** @type {keyof typeof METHODS} */ (d.method)], aud(d.wineTax), d.gst === null ? 'None' : aud(d.gst),
    d.priceIncludingWetAndGst === null ? 'None' : aud(d.priceIncludingWetAndGst), d.rebate ? aud(d.rebate.amount) : 'Not claimed']);
  return { inputs: wetInputsText(input, aud), rows, principal: 1, note: notes.join('. ').replace(/\.$/, ''), tables: { dealings } };
}
