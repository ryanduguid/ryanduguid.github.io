// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Foreign currency amounts translated into Australian dollars under ITAA 1997 s 960-50 for 2020-21
// to 2026-27, at a rate the person states with its source: the special translation rules of
// s 960-50(6) items 2, 5, 6, 7, 8 (as the regulations substitute it) and 11, or an average rate
// under item 12 and Schedule 2 of the Income Tax Assessment Regulations 1997 (2020-21) or the
// Income Tax Assessment (1997 Act) Regulations 2021 (from 2021-22). Ported from the
// australian-accounting command foreign-income-conversion, with its refusal codes. Sources read 22
// November 2026.
import { decimalParts, ratioCents } from './money.mjs';
import { parseDate } from './foreign-income-tax-offset.mjs';
import { refuse, supportedYear } from './private-health-rebate.mjs';

const MAX_ITEMS = 200;
/** Each kind: the day its item names, the other day that applies when it comes first (or on the
 * same day, unless strict), and the item each gives. */
export const KINDS = {
  ordinary_income: { time: 'derived', earlier: 'received', strict: false, items: ['item 6(b)', 'item 6(a)'] },
  statutory_income: { time: 'included', earlier: 'received', strict: false, items: ['item 7(b)', 'item 7(a)'] },
  deduction: { time: 'deductible', earlier: 'paid', strict: false, items: ['item 8(b)', 'item 8(a)'] },
  depreciating_asset_cost: { time: 'held', earlier: 'satisfied', strict: true, items: ['item 2(a)', 'item 2(b)'] },
  cgt_event: { time: 'event', earlier: null, strict: false, items: ['item 5', ''] },
  foreign_tax_paid: { time: 'paid', earlier: null, strict: false, items: ['item 11', ''] },
};
const TOTALS = /** @type {Record<string, string>} */ ({ ordinary_income: 'ordinary_income', statutory_income: 'statutory_income',
  deduction: 'deductions', depreciating_asset_cost: 'depreciating_asset_costs', cgt_event: 'cgt_amounts',
  foreign_tax_paid: 'foreign_tax_paid' });
const COMMON = ['kind', 'currency', 'amount', 'rate', 'basis', 'rate_source'];

/** A decimal string from 0 (or above 0) to 1e12 with at most `places` decimal places, as
 * [digits, places] of a scaled integer. @param {Record<string, unknown>} fields @param {string} name
 * @param {string} key @param {number} places @param {boolean} positive @returns {bigint} */
function decimal(fields, name, key, places, positive) {
  if (!(key in fields)) refuse('input.missing_field', `${name}: ${key} is required`);
  const text = typeof fields[key] === 'string' && fields[key].length <= 32 ? fields[key].trim() : null;
  // The command's comparisons raise on a NaN.
  if (text !== null && /^[+-]?s?nan\d*$/i.test(text)) refuse('decimal.invalid_operation', `${name}: ${key} is not a number`);
  const parts = text === null ? null : decimalParts(text);
  const fraction = parts?.fraction ?? '';
  // Trailing zeros count as places, as a decimal's exponent does; -0 is zero.
  const scaled = parts && fraction.length <= places ? BigInt(parts.whole + fraction.padEnd(places, '0')) : null;
  if (scaled === null || (parts?.negative && scaled > 0n) || (positive && scaled === 0n) || scaled > 10n ** BigInt(12 + places)) {
    refuse('input.amount_invalid', `${name}: ${key} must be a decimal string${positive ? ' above zero' : ', not negative'}, `
      + `at most ${places}dp and 1e12.`);
  }
  return /** @type {bigint} */ (scaled);
}

/** @param {Record<string, unknown>} fields @param {string} name @param {string} key */
function date(fields, name, key) {
  if (!(key in fields)) return null;
  return parseDate(fields[key]) ?? refuse('input.date_invalid', `${name}: ${key} must be a YYYY-MM-DD date from 1900 to 2100.`);
}

/** @param {Record<string, unknown>} fields @param {string} name @param {string} key */
const required = (fields, name, key) => date(fields, name, key) ?? refuse('input.missing_field', `${name}: ${key} is required`);

/** @param {number} day */
const iso = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

/** One amount: the day its rule names, the rate's basis and the Australian dollar amount in cents.
 * @param {unknown} value @param {string} name */
function readItem(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    refuse('foreign_income_conversion.items_invalid', `${name} must be an object.`);
  }
  const fields = /** @type {Record<string, unknown>} */ (value);
  const kind = /** @type {string} */ (fields.kind);
  const rule = typeof kind === 'string' && Object.hasOwn(KINDS, kind) ? KINDS[/** @type {keyof typeof KINDS} */ (kind)]
    : refuse('foreign_income_conversion.kind_invalid', `${name}: kind must be ordinary_income, statutory_income, deduction, `
      + 'depreciating_asset_cost, cgt_event or foreign_tax_paid.');
  const allowed = [...COMMON, rule.time, ...(rule.earlier ? [rule.earlier] : []),
    ...(fields.basis === 'average' ? ['average_from', 'average_to'] : ['rate_date'])];
  const unknown = Object.keys(fields).find((key) => !allowed.includes(key));
  if (unknown) refuse('input.field_unknown', `${name}: ${unknown} is not an input of this kind and basis`);
  const time = required(fields, name, rule.time);
  const earlier = rule.earlier ? date(fields, name, rule.earlier) : null;
  const atEarlier = earlier !== null && (earlier < time || (earlier === time && !rule.strict));
  const on = atEarlier ? earlier : time;
  let basis;
  if (fields.basis === 'specific') {
    const day = required(fields, name, 'rate_date');
    if (day !== on) {
      refuse('foreign_income_conversion.rate_date', `${name}: the rate is for ${iso(day)}, but the ${kind} rule translates at `
        + `the rate applicable on ${iso(on)}. State that day's rate, or an average rate.`);
    }
    basis = { basis: 'specific', date: iso(day) };
  } else if (fields.basis === 'average') {
    const from = required(fields, name, 'average_from');
    const to = required(fields, name, 'average_to');
    // A year on: the same day 12 months later, or that month's last day where it has fewer.
    const start = new Date(from * 86400000);
    const [y, m] = [start.getUTCFullYear() + 1, start.getUTCMonth()];
    const yearOn = Date.UTC(y, m, Math.min(start.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate())) / 86400000;
    const why = to < from ? 'average_to is before average_from'
      : to >= yearOn ? 'the averaging period is longer than 12 months'
        : on < from || on > to ? 'the averaging period does not contain the day the amount is translated on' : null;
    if (why) {
      refuse('foreign_income_conversion.average_period', `${name}: ${why} (an average is of the rates during a period not `
        + 'exceeding 12 months, used for amounts relating to that period).');
    }
    basis = { basis: 'average', from: iso(from), to: iso(to) };
  } else {
    refuse('foreign_income_conversion.basis_invalid', `${name}: basis must be specific or average.`);
  }
  const currency = fields.currency;
  if (!('currency' in fields)) refuse('input.missing_field', `${name}: currency is required`);
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) || currency === 'AUD') {
    refuse('foreign_income_conversion.currency_invalid', `${name}: currency must be a 3-letter code other than AUD, such as NZD.`);
  }
  const amount = decimal(fields, name, 'amount', 4, false);
  const rate = decimal(fields, name, 'rate', 6, true);
  // amount / 10^4 over rate / 10^6, in cents, half up.
  const aud = Number(ratioCents(amount * 10000n, rate));
  const source = fields.rate_source;
  if (!('rate_source' in fields)) refuse('input.missing_field', `${name}: rate_source is required`);
  if (typeof source !== 'string' || source.trim() === '' || [...source].length > 200) {
    refuse('foreign_income_conversion.text_invalid', `${name}: rate_source must be text of 1 to 200 characters.`);
  }
  return { kind, currency, translatedOn: iso(on), item: rule.items[atEarlier ? 1 : 0], ...basis, aud: aud / 100,
    averageCapital: basis.basis === 'average' && ['cgt_event', 'depreciating_asset_cost'].includes(kind) };
}

/** The amounts in Australian dollars and each kind's total of the rounded amounts.
 * @param {{year: string, items: unknown}} input */
export function foreignIncomeConversion(input) {
  const unknown = Object.keys(input).find((key) => !['year', 'items'].includes(key));
  if (unknown) refuse('input.field_unknown', `${unknown} is not an input of foreign-income-conversion`);
  supportedYear(input.year);
  const given = input.items;
  if (!Array.isArray(given)) refuse('foreign_income_conversion.items_invalid', 'items must be a list of objects.');
  const list = /** @type {unknown[]} */ (given);
  if (list.length === 0 || list.length > MAX_ITEMS) refuse('foreign_income_conversion.items_invalid', `items must hold 1 to ${MAX_ITEMS} amounts.`);
  const items = list.map((value, i) => readItem(value, `item ${i + 1}`));
  const totals = Object.fromEntries(Object.values(TOTALS).map((key) => [key, 0]));
  for (const item of items) totals[TOTALS[item.kind]] = Math.round((totals[TOTALS[item.kind]] + item.aud) * 100) / 100;
  return { items, totals, average: items.some((item) => item.basis === 'average'),
    averageCapital: items.some((item) => item.averageCapital) };
}

// The page's form: one amount, with the dates its kind's rule names.
const FORM_DATES = /** @type {Record<string, string[]>} */ ({ ordinary_income: ['fx-derived', 'fx-received'],
  statutory_income: ['fx-included', 'fx-included-received'], deduction: ['fx-deductible', 'fx-paid'],
  depreciating_asset_cost: ['fx-held', 'fx-satisfied'], cgt_event: ['fx-event'], foreign_tax_paid: ['fx-tax-paid'] });
const KIND_NAMES = /** @type {Record<string, string>} */ ({ ordinary_income: 'ordinary income', statutory_income: 'statutory income',
  deduction: 'a deduction', depreciating_asset_cost: 'a depreciating asset’s cost', cgt_event: 'a CGT amount',
  foreign_tax_paid: 'foreign income tax paid' });

/** The result for the page's foreign income conversion form.
 * @param {(name: string) => string} value a field's value @param {(amount: number) => string} aud */
export function foreignIncomeConversionResult(value, aud) {
  const kind = value('fx-kind');
  const rule = KINDS[/** @type {keyof typeof KINDS} */ (kind)];
  const [timeField, earlierField] = FORM_DATES[kind] ?? [];
  const item = /** @type {Record<string, string>} */ ({ kind, currency: value('fx-currency').trim().toUpperCase(),
    amount: value('fx-amount').trim(), rate: value('fx-rate').trim(), rate_source: value('fx-source'), basis: value('fx-basis') });
  if (rule) {
    item[rule.time] = value(timeField);
    if (rule.earlier && value(earlierField) !== '') item[rule.earlier] = value(earlierField);
  }
  if (item.basis === 'average') Object.assign(item, { average_from: value('fx-from'), average_to: value('fx-to') });
  else item.rate_date = value('fx-rate-date');
  const r = foreignIncomeConversion({ year: value('fx-year'), items: [item] });
  const [i] = r.items;
  const notes = [`Section 960-50(6) ${i.item}: translated at the rate for ${i.translatedOn}`];
  if (i.basis === 'average') notes.push(`An average rate for ${i.from} to ${i.to}, which item 12 allows only where it reasonably approximates that day’s rate`);
  if (i.averageCapital) notes.push('The ATO says an average rate would not reasonably approximate the rate for a one-off purchase or sale of a large capital asset');
  return {
    inputs: `${value('fx-year')}, ${KIND_NAMES[kind]} of ${item.amount} ${i.currency} at ${item.rate} ${i.currency} to A$1 `
      + `(${i.basis === 'average' ? `average for ${i.from} to ${i.to}` : `rate for ${i.date}`}), from ${item.rate_source.trim()}`,
    principal: 3,
    rows: [['Translated on', i.translatedOn], ['Rule', `Section 960-50(6) ${i.item}`],
      ['Rate', `${item.rate} ${i.currency} to A$1`], ['Australian dollars', aud(i.aud)]],
    note: notes.join('. '),
  };
}
