// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// A company's tax effect worksheet under AASB 112, beside the company tax calculator: the `deferred-tax` command of
// ryanduguid/australian-accounting (merged in #813) ported line for line, with its inputs, steps, rounding and refusal
// codes in the order it checks them. Each item's temporary difference is its carrying amount less its tax base for an
// asset, or its tax base less its carrying amount for a liability (paras 5, 7 and 8); a deferred tax liability is taken
// on every taxable difference (para 15) and a deferred tax asset on deductible differences and unused tax losses less
// those the preparer says have none (paras 24, 34 and 56), at 25% or 30% as the preparer expects the company to be a
// base rate entity or not when they reverse (paras 47 and 48; Income Tax Rates Act 1986 s 23(2) and s 23AA). The year's
// movement splits into the rate change (para 80(d)), the recognition change (para 80(f) and (g)) and origination and
// reversal (para 80(c)); current tax is taxable income at the year's s 23(2) rate (26% for a base rate entity in
// 2020-21, from the ATO's 2020-21 table); and the para 81(c)(i) reconciliation starts from accounting profit at that
// rate. The command reads the AASB 112 compilations of March 2020 and September 2023, AASB 18 Appendix D, the AASB's
// December 2012 agenda decision, s 23(2) in compilation 66 and the ATO's company tax rate pages, all on 22 November
// 2026; the standard's wording is not reproduced. Every amount is exact in cents and ten-thousandths, rounded half up
// (away from nil) to the cent where the command rounds.

export const DEFERRED_TAX_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

const FIELDS = ['items', 'unused_tax_losses', 'opening_unused_tax_losses', 'unrecognised_deductible', 'opening_unrecognised_deductible',
  'unrecognised_used', 'accounting_profit', 'non_deductible_expenses', 'non_assessable_income', 'taxable_income', 'tax_offsets',
  'base_rate_entity', 'expected_rate', 'opening_expected_rate', 'business_combination', 'uncertain_tax_treatment', 'tax_consolidated_group',
  'outside_profit_or_loss', 'year', 'scope_confirmed'];
const DECIMALS = FIELDS.slice(1, 11);

/** Python's whitespace, which the command strips from a decimal before reading it. */
const SPACE = /[\t\n\v\f\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/; // eslint-disable-line no-control-regex -- Python's whitespace includes U+001C to U+001F
/** `text` without Python's whitespace at either end. @param {string} text */
const stripSpace = (text) => {
  let start = 0;
  let end = text.length;
  while (start < end && SPACE.test(text.charAt(start))) start += 1;
  while (end > start && SPACE.test(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
};
/** Rust's whitespace, which an item's label may not be made of. */
const LABEL_SPACE = /^[\t\n\v\f\r \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*$/;

/** A decimal as the command reads it, or a refusal for text it cannot read.
 * @param {unknown} value @param {() => never} unreadable @returns {{negative: boolean, cents: bigint} | {negative: boolean, excess: true} | null} */
function readDecimal(value, unreadable) {
  if (typeof value !== 'string') return null;
  const text = stripSpace(value);
  if (/^[+-]?(inf|infinity|s?nan\d*)$/i.test(text)) return null;
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text); // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!parts) return unreadable();
  const negative = parts[1] === '-';
  // The command takes at most 2 places as written: 1.000 has 3.
  const decimals = parts[3] ?? '';
  if (decimals.length > 2) return { negative, excess: true };
  return { negative, cents: BigInt(parts[2] + decimals.padEnd(2, '0')) };
}

const LIMIT = 100000000000000n;
/** An amount: finite, nil or more, at most 2 places and $1,000,000,000,000. @param {ReturnType<typeof readDecimal>} v */
function money(v) {
  if (v === null || 'excess' in v || (v.negative && v.cents > 0n) || v.cents > LIMIT) {
    refuse('input.amount_invalid', 'Enter each amount as 0 or more with no more than 2 decimal places.');
  }
  return v.cents;
}
/** An amount that may be below nil, within $1,000,000,000,000 either side. @param {ReturnType<typeof readDecimal>} v */
function signedMoney(v) {
  if (v === null || 'excess' in v || v.cents > LIMIT) {
    refuse('input.signed_amount_invalid', 'Enter the accounting profit with no more than 2 decimal places; a loss may be below nil.');
  }
  return v.negative ? -v.cents : v.cents;
}
/** @param {unknown} value @param {string} name @returns {boolean} */
function flag(value, name) {
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `${name} must be yes or no.`);
  return value;
}

/** `n / d` rounded half away from nil. @param {bigint} n @param {bigint} d */
function halfUp(n, d) {
  const negative = (n < 0n) !== (d < 0n);
  const [a, b] = [n < 0n ? -n : n, d < 0n ? -d : d];
  const q = (2n * a + b) / (2n * b);
  return negative ? -q : q;
}
/** Cents as the command writes them. @param {bigint} c */
const text = (c) => `${c < 0n ? '-' : ''}${(c < 0n ? -c : c) / 100n}.${String((c < 0n ? -c : c) % 100n).padStart(2, '0')}`;
/** Cents times a rate in hundredths, to the cent. @param {bigint} c @param {bigint} rate */
const at = (c, rate) => halfUp(c * rate, 100n);

/** The company rate for the year in hundredths (ITRA s 23(2); 26% for a base rate entity in 2020-21). @param {string} year @param {boolean} bre */
const currentRate = (year, bre) => (!bre ? 30n : year === '2020-21' ? 26n : 25n);
/** The rate a balance is measured at (paras 47 and 48). @param {unknown} value @param {string} name */
function deferredRate(value, name) {
  if (value === 'base_rate_entity') return 25n;
  if (value === 'standard') return 30n;
  return refuse('deferred_tax.expected_rate_invalid', `${name} must be base_rate_entity or standard.`);
}
/** A rate in hundredths as the command writes it. @param {bigint} r */
const rateText = (r) => `0.${String(r).padStart(2, '0')}`;

const COMBINATION = 'Deferred tax arising in a business combination follows AASB 112 paras 19 and 66 to 68 and AASB 3, which this worksheet does not apply.';
const UNCERTAIN = 'An uncertain tax treatment is measured under AASB Interpretation 23, which this worksheet does not apply.';
const CONSOLIDATED = 'A tax-consolidated group member’s current and deferred tax are allocated under AASB Interpretation 1052, which this worksheet does not apply.';
const OUTSIDE = 'Tax on items recognised in other comprehensive income or equity goes outside profit or loss (AASB 112 paras 61A to 63); this worksheet takes every movement to profit or loss.';
export const DEFERRED_TAX_BASIS = 'The applicable rate is the company rate for the income year under Income Tax Rates Act 1986 s 23(2), the domestic rate AASB 112 para 85 points to: 30%, or for a base rate entity (s 23AA) 25% (26% in 2020-21).';
export const DEFERRED_TAX_MISMATCH = 'Taxable income does not equal accounting profit plus non-deductible expenses, less non-assessable income and the change in net temporary differences and unused tax losses: the inputs do not explain taxable income, and the reconciliation difference carries the gap at the applicable rate.';

/** @typedef {{label: string, liability: boolean, amounts: bigint[]}} Item */
const ITEM_FIELDS = ['label', 'class', 'carrying_amount', 'tax_base', 'opening_carrying_amount', 'opening_tax_base'];
/** The items, each an asset or liability with its carrying amounts and tax bases at the end and start of the year.
 * @param {unknown} list @returns {Item[]} */
function readItems(list) {
  const invalid = (/** @type {string} */ why) => refuse('deferred_tax.item_invalid', why);
  if (!Array.isArray(list) || list.length === 0 || list.length > 500) invalid('Enter 1 to 500 items.');
  return /** @type {unknown[]} */ (list).map((value, i) => {
    const n = i + 1;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid(`Item ${n} must be an object.`);
    const fields = /** @type {Record<string, unknown>} */ (value);
    const extra = Object.keys(fields).find((key) => !ITEM_FIELDS.includes(key));
    if (extra !== undefined) invalid(`Item ${n}: ${extra} is not a field of an item.`);
    const { label } = fields;
    if (typeof label !== 'string' || LABEL_SPACE.test(label) || [...label].length > 200) invalid(`Item ${n}: give it a name of 1 to 200 characters.`);
    if (fields.class !== 'asset' && fields.class !== 'liability') invalid(`Item ${n}: it must be an asset or a liability.`);
    const amounts = ITEM_FIELDS.slice(2).map((key) => {
      const unreadable = () => invalid(`Item ${n}: enter each amount as 0 or more with no more than 2 decimal places.`);
      const v = readDecimal(fields[key], unreadable); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
      try {
        return money(v);
      } catch {
        return unreadable();
      }
    });
    return { label: /** @type {string} */ (label), liability: fields.class === 'liability', amounts };
  });
}

/** AASB 112 for one company and income year: the tax effect worksheet, the income tax expense and its para 81(c)(i)
 * reconciliation, as the command returns them, with the page's figures in dollars.
 * @param {Record<string, unknown>} x */
export function deferredTax(x) {
  const extra = Object.keys(x).find((key) => !FIELDS.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not an input of the deferred tax worksheet.`);
  /** @type {Record<string, ReturnType<typeof readDecimal>>} */
  const dec = {};
  for (const key of FIELDS) {
    if (!(key in x)) refuse('input.missing_field', `${key} is required.`);
    if (DECIMALS.includes(key)) {
      if (typeof x[key] === 'string' && new TextEncoder().encode(/** @type {string} */ (x[key])).length > 8192) { // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
        refuse('input.decimal_too_long', `${key}: the number has too many digits.`);
      }
      dec[key] = readDecimal(x[key], () => refuse('input.decimal_unreadable', `${key}: enter a number in digits, such as 1250.50.`)); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
    }
  }
  if (x.scope_confirmed !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = x.year;
  if (typeof year !== 'string' || !DEFERRED_TAX_YEARS.includes(year)) {
    refuse('period.unsupported', `Choose an income year from ${DEFERRED_TAX_YEARS[0]} to ${DEFERRED_TAX_YEARS.at(-1)}.`);
  }
  if (flag(x.business_combination, 'business_combination')) refuse('deferred_tax.business_combination', COMBINATION);
  if (flag(x.uncertain_tax_treatment, 'uncertain_tax_treatment')) refuse('deferred_tax.uncertain_tax_treatment', UNCERTAIN);
  if (flag(x.tax_consolidated_group, 'tax_consolidated_group')) refuse('deferred_tax.tax_consolidated_group', CONSOLIDATED);
  if (flag(x.outside_profit_or_loss, 'outside_profit_or_loss')) refuse('deferred_tax.outside_profit_or_loss', OUTSIDE);
  const items = readItems(x.items);
  const applicable = currentRate(year, flag(x.base_rate_entity, 'base_rate_entity'));
  const closingRate = deferredRate(x.expected_rate, 'expected_rate');
  const openingRate = deferredRate(x.opening_expected_rate, 'opening_expected_rate');
  if (year === '2020-21' && openingRate === 25n) {
    refuse('deferred_tax.opening_rate_unscheduled', 'Balances open at the start of 2020-21 reverse partly in 2020-21, at 26% for a base rate '
      + 'entity, and partly later at 25%; measuring them needs a reversal schedule this worksheet does not take.');
  }
  const [losses, openingLosses, unrecognised, openingUnrecognised, used] = ['unused_tax_losses', 'opening_unused_tax_losses',
    'unrecognised_deductible', 'opening_unrecognised_deductible', 'unrecognised_used'].map((key) => money(dec[key])); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  const profit = signedMoney(dec.accounting_profit);
  const [nonDeductible, nonAssessable, taxableIncome, offsets] = ['non_deductible_expenses', 'non_assessable_income', 'taxable_income', 'tax_offsets']
    .map((key) => money(dec[key])); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  if (used > openingUnrecognised) {
    refuse('deferred_tax.unrecognised_used_above_opening', 'The previously unrecognised amount used in the year is more than the opening '
      + 'unrecognised amount: only amounts with no deferred tax asset at the start of the year can be used as previously unrecognised.');
  }

  // Each item's signed differences (paras 5, 7 and 8), then the taxable and deductible totals at each date.
  let [taxable, deductible, openingTaxable, openingDeductible] = [0n, 0n, 0n, 0n];
  const lines = items.map(({ label, liability, amounts: [carrying, base, openingCarrying, openingBase] }) => {
    const closing = liability ? base - carrying : carrying - base;
    const opening = liability ? openingBase - openingCarrying : openingCarrying - openingBase;
    if (closing > 0n) taxable += closing; else deductible -= closing;
    if (opening > 0n) openingTaxable += opening; else openingDeductible -= opening;
    const nature = (/** @type {bigint} */ v) => (v === 0n ? 'none' : v < 0n ? 'deductible' : 'taxable');
    return { label, class: liability ? 'liability' : 'asset', temporary_difference: text(closing), nature: nature(closing),
      opening_temporary_difference: text(opening), opening_nature: nature(opening) };
  });
  /** @type {[bigint, bigint, bigint, string][]} */
  const dates = [[deductible, losses, unrecognised, 'end'], [openingDeductible, openingLosses, openingUnrecognised, 'start']];
  for (const [ded, loss, unrec, when] of dates) {
    if (unrec > ded + loss) {
      refuse('deferred_tax.unrecognised_above_deductible', `The unrecognised amount at the ${when} of the year is more than that date’s `
        + 'deductible temporary differences and unused tax losses.');
    }
  }
  const liability = at(taxable, closingRate);
  const asset = at(deductible + losses - unrecognised, closingRate);
  const openingLiability = at(openingTaxable, openingRate);
  const openingAsset = at(openingDeductible + openingLosses - openingUnrecognised, openingRate);
  if (openingRate !== closingRate && applicable !== closingRate && (openingLiability !== 0n || openingAsset !== 0n)) {
    refuse('deferred_tax.rate_change_unscheduled', 'The expected rate changed while the year’s rate is not the closing rate: opening balances '
      + 'that reversed in the year did so at the year’s rate and only the rest is remeasured, which needs a reversal schedule this worksheet does not take.');
  }
  const net = liability - asset;
  // The movement (paras 58, 60 and 80).
  const deferred = net - (openingLiability - openingAsset);
  const openingNet = openingTaxable - openingDeductible - openingLosses;
  const rateChange = halfUp((openingNet + openingUnrecognised) * (closingRate - openingRate), 100n);
  const recognition = at(unrecognised - openingUnrecognised + used, closingRate);
  const origination = deferred - rateChange - recognition;
  const change = taxable - deductible - losses - openingNet;
  // Current tax and the expense (paras 5, 12 and 46).
  const before = at(taxableIncome, applicable);
  if (offsets > before) {
    refuse('deferred_tax.offsets_above_tax', 'The tax offsets are more than current tax before offsets; refundable offsets and offsets '
      + 'carried forward are outside this worksheet.');
  }
  const current = before - offsets;
  const expense = current + deferred;
  // The para 81(c)(i) reconciliation.
  const atRate = at(profit, applicable);
  const nonDeductibleEffect = at(nonDeductible, applicable);
  const nonAssessableEffect = -at(nonAssessable, applicable);
  const rateGap = halfUp(change * (closingRate - applicable), 100n);
  const usedEffect = -at(used, closingRate);
  const offsetsEffect = -offsets;
  const difference = expense - (atRate + nonDeductibleEffect + nonAssessableEffect + rateGap + rateChange + recognition + usedEffect + offsetsEffect);
  const unexplained = taxableIncome - (profit + nonDeductible - nonAssessable - change);
  const amounts = Object.fromEntries(Object.entries({ taxable_temporary_differences: taxable, deductible_temporary_differences: deductible,
    opening_taxable_temporary_differences: openingTaxable, opening_deductible_temporary_differences: openingDeductible,
    deferred_tax_liability: liability, deferred_tax_asset: asset, opening_deferred_tax_liability: openingLiability,
    opening_deferred_tax_asset: openingAsset, net_deferred_tax_liability: net, deferred_tax_expense: deferred, rate_change_effect: rateChange,
    recognition_change_effect: recognition, origination_and_reversal: origination, temporary_difference_movement: change,
    current_tax_before_offsets: before, current_tax: current, income_tax_expense: expense, tax_at_applicable_rate: atRate,
    non_deductible_expenses_effect: nonDeductibleEffect, non_assessable_income_effect: nonAssessableEffect, deferred_rate_difference: rateGap,
    unrecognised_used_effect: usedEffect, tax_offsets_effect: offsetsEffect, reconciliation_difference: difference,
    taxable_income_difference: unexplained }).map(([key, c]) => [key, text(c)]));
  /** @type {Record<string, string>} */
  const rates = { applicable_rate: rateText(applicable), closing_rate: rateText(closingRate), opening_rate: rateText(openingRate) };
  // Para 86: the expense over the profit to 4 places, none for a nil profit; a nil quotient keeps the quotient's sign.
  if (profit !== 0n) {
    const ratio = halfUp(expense * 10000n, profit);
    const negative = (expense < 0n) !== (profit < 0n);
    const magnitude = ratio < 0n ? -ratio : ratio;
    rates.effective_tax_rate = `${negative ? '-' : ''}${magnitude / 10000n}.${String(magnitude % 10000n).padStart(4, '0')}`;
  }
  const dollars = (/** @type {bigint} */ c) => Number(c) / 100;
  return { period: year, amounts, rates, items: lines, applicable_rate_basis: DEFERRED_TAX_BASIS,
    warnings: unexplained === 0n ? [] : [DEFERRED_TAX_MISMATCH], deferredTaxLiability: dollars(liability), deferredTaxAsset: dollars(asset),
    deferredTaxExpense: dollars(deferred), currentTax: dollars(current), incomeTaxExpense: dollars(expense) };
}

// The page: up to 5 items, the year's amounts and the matters the worksheet refuses, read as the command's input.
export const DEFERRED_TAX_ROWS = 4;
const AMOUNT_FIELDS = [['carrying', 'carrying_amount'], ['base', 'tax_base'], ['opening-carrying', 'opening_carrying_amount'], ['opening-base', 'opening_tax_base']];

/** The command's input from the form's fields: each item row with a name or an amount, in order.
 * @param {(name: string) => string} value */
export function deferredTaxFormInput(value) {
  const items = [];
  for (let n = 1; n <= DEFERRED_TAX_ROWS; n += 1) {
    const label = value(`item-${n}-label`);
    const amounts = AMOUNT_FIELDS.map(([field]) => value(`item-${n}-${field}`));
    if (!label.trim() && amounts.every((a) => !a.trim())) continue;
    items.push({ label, class: value(`item-${n}-class`), ...Object.fromEntries(AMOUNT_FIELDS.map(([, key], i) => [key, amounts[i]])) }); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  }
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  return { items, unused_tax_losses: value('losses'), opening_unused_tax_losses: value('opening-losses'),
    unrecognised_deductible: value('unrecognised'), opening_unrecognised_deductible: value('opening-unrecognised'), unrecognised_used: value('used'),
    accounting_profit: value('profit'), non_deductible_expenses: value('non-deductible'), non_assessable_income: value('non-assessable'),
    taxable_income: value('taxable-income'), tax_offsets: value('offsets'), base_rate_entity: yes('bre'), expected_rate: value('expected-rate'),
    opening_expected_rate: value('opening-expected-rate'), business_combination: yes('business-combination'), uncertain_tax_treatment: yes('uncertain'),
    tax_consolidated_group: yes('consolidated'), outside_profit_or_loss: yes('outside'), year: value('year'), scope_confirmed: true };
}

/** @param {unknown} rate */
const rateWords = (rate) => (rate === 'base_rate_entity' ? '25%' : rate === 'standard' ? '30%' : String(rate));

/** How the page writes the input; nil losses, unrecognised amounts and offsets are left out. @param {Record<string, any>} x
 * @param {(value: number) => string} aud */
export function deferredTaxInputsText(x, aud) {
  const money = (/** @type {unknown} */ text) => aud(Number(text));
  const items = Array.isArray(x.items) ? x.items.map((/** @type {Record<string, any>} */ it) => `${it.label} (${it.class}) ${money(it.carrying_amount)} `
    + `on ${money(it.tax_base)}, opening ${money(it.opening_carrying_amount)} on ${money(it.opening_tax_base)}`).join('; ') : '';
  const given = (/** @type {string} */ key, /** @type {string} */ words) => (Number(x[key]) ? [`${words} ${money(x[key])}`] : []); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  const extras = [...given('unused_tax_losses', 'losses'), ...given('opening_unused_tax_losses', 'opening losses'),
    ...given('unrecognised_deductible', 'unrecognised'), ...given('opening_unrecognised_deductible', 'opening unrecognised'),
    ...given('unrecognised_used', 'used'), ...given('non_deductible_expenses', 'non-deductible'), ...given('non_assessable_income', 'non-assessable'),
    ...given('tax_offsets', 'offsets'),
    ...[['business_combination', 'a business combination'], ['uncertain_tax_treatment', 'an uncertain tax treatment'],
      ['tax_consolidated_group', 'a tax-consolidated group'], ['outside_profit_or_loss', 'items outside profit or loss']]
      .filter(([key]) => x[key]).map(([, words]) => words)]; // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  return `${x.year}, ${x.base_rate_entity ? 'base rate entity' : 'not a base rate entity'}, rates ${rateWords(x.expected_rate)} (opening `
    + `${rateWords(x.opening_expected_rate)}); ${items}; profit ${money(x.accounting_profit)}, taxable income ${money(x.taxable_income)}`
    + `${extras.length ? `, ${extras.join(', ')}` : ''}`;
}

const RECONCILING = [['tax_at_applicable_rate', 'Accounting profit at the applicable rate'], ['non_deductible_expenses_effect', 'Non-deductible expenses'],
  ['non_assessable_income_effect', 'Non-assessable income'], ['deferred_rate_difference', 'Deferred tax at the closing rate, not the applicable rate'],
  ['rate_change_effect', 'Change in the expected rate'], ['recognition_change_effect', 'Change in recognition'],
  ['unrecognised_used_effect', 'Unrecognised amounts used'], ['tax_offsets_effect', 'Tax offsets'], ['reconciliation_difference', 'Difference left'],
  ['income_tax_expense', 'Income tax expense']];

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function deferredTaxResult(value, aud) {
  const input = deferredTaxFormInput(value);
  const r = deferredTax(input);
  const a = (/** @type {string} */ id) => aud(Number(r.amounts[id])); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  const pct = (/** @type {string} */ fraction) => `${(Number(fraction) * 100).toLocaleString('en-AU', { maximumFractionDigits: 2 })}%`;
  const rows = [[`Deferred tax liability, at ${pct(r.rates.closing_rate)}`, a('deferred_tax_liability')],
    [`Deferred tax asset, at ${pct(r.rates.closing_rate)}`, a('deferred_tax_asset')], ['Net deferred tax liability', a('net_deferred_tax_liability')],
    ['Deferred tax expense', a('deferred_tax_expense')], [`Current tax, at ${pct(r.rates.applicable_rate)}`, a('current_tax')],
    ['Income tax expense', a('income_tax_expense')]];
  if ('effective_tax_rate' in r.rates) rows.push(['Average effective tax rate', pct(r.rates.effective_tax_rate)]);
  const tables = {
    differences: r.items.map((it) => [it.label, it.class, aud(Number(it.temporary_difference)), it.nature, aud(Number(it.opening_temporary_difference))]),
    movement: [['Opening net deferred tax liability', aud(Number(r.amounts.opening_deferred_tax_liability) - Number(r.amounts.opening_deferred_tax_asset))],
      ['Rate change', a('rate_change_effect')], ['Recognition change', a('recognition_change_effect')],
      ['Origination and reversal', a('origination_and_reversal')], ['Closing net deferred tax liability', a('net_deferred_tax_liability')]],
    reconciliation: RECONCILING.map(([id, label]) => [label, a(id)]),
  };
  const notes = ['The applicable rate is the year’s company rate under Income Tax Rates Act 1986 s 23(2)', ...r.warnings];
  return { inputs: deferredTaxInputsText(input, aud), rows, principal: 5, note: notes.map((n) => n.replace(/\.$/, '')).join('. '), tables };
}
