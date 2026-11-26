// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Inputs read as the australian-accounting commands read them, and exact decimal steps worked
// in their 40-digit context: each result rounded half to even to 40 significant digits, as
// Python's decimal module rounds it. A value is a fraction { n, d } of BigInts with d > 0.

import { commandCents } from './money.mjs';
import { dayOf } from './residency-days.mjs';

/** @typedef {{ n: bigint, d: bigint }} Exact */

/** Throws a coded refusal. @param {string} code @param {string} message @returns {never} */
export function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** @param {bigint} n @param {bigint} [d] @returns {Exact} */
export const exact = (n, d = 1n) => (d < 0n ? { n: -n, d: -d } : { n, d });

const digits = (/** @type {bigint} */ v) => (v < 0n ? -v : v).toString().length;
const ten = (/** @type {number} */ k) => 10n ** BigInt(k);

/** n / d rounded half to even to 40 significant digits. @param {bigint} n @param {bigint} d @returns {Exact} */
export function round40(n, d) {
  if (n === 0n) return { n: 0n, d: 1n };
  const sign = (n < 0n) !== (d < 0n) ? -1n : 1n;
  const [a, b] = [n < 0n ? -n : n, d < 0n ? -d : d];
  let k = 40 - (digits(a) - digits(b));
  const scaled = (/** @type {number} */ shift) => (shift >= 0 ? [a * ten(shift), b] : [a, b * ten(-shift)]);
  let [top, bottom] = scaled(k);
  if (top / bottom >= ten(40)) [top, bottom] = scaled(--k);
  if (top / bottom < ten(39)) [top, bottom] = scaled(++k);
  let q = top / bottom;
  const twice = 2n * (top - q * bottom);
  if (twice > bottom || (twice === bottom && q % 2n === 1n)) q += 1n;
  return k >= 0 ? { n: sign * q, d: ten(k) } : { n: sign * q * ten(-k), d: 1n };
}

/** @param {Exact} x @param {Exact} y */
export const add = (x, y) => round40(x.n * y.d + y.n * x.d, x.d * y.d);
/** @param {Exact} x @param {Exact} y */
export const sub = (x, y) => round40(x.n * y.d - y.n * x.d, x.d * y.d);
/** @param {Exact} x @param {Exact} y */
export const mul = (x, y) => round40(x.n * y.n, x.d * y.d);
/** @param {Exact} x @param {Exact} y */
export const div = (x, y) => round40(x.n * y.d, x.d * y.n);
/** -1, 0 or 1. @param {Exact} x @param {Exact} y */
export const cmp = (x, y) => {
  const diff = x.n * y.d - y.n * x.d;
  return diff > 0n ? 1 : diff < 0n ? -1 : 0;
};
/** @param {Exact} x @param {Exact} y */
export const max = (x, y) => (cmp(y, x) > 0 ? y : x);
/** @param {Exact} x @param {Exact} y */
export const min = (x, y) => (cmp(y, x) < 0 ? y : x);

/** Whole dollars, rounded down or up. @param {Exact} x @param {boolean} up */
export function dollars(x, up) {
  const down = x.n >= 0n ? x.n / x.d : -((-x.n + x.d - 1n) / x.d);
  return exact(up && down * x.d < x.n ? down + 1n : down);
}

/** Cents, half up (away from nil), as a number of cents. @param {Exact} x */
export function centsOf(x) {
  const a = x.n < 0n ? -x.n : x.n;
  const c = (200n * a + x.d) / (2n * x.d);
  return x.n < 0n ? -c : c;
}

/** The command's amount text: cents, half up. @param {Exact} x */
export function amountText(x) {
  const c = centsOf(x);
  const a = c < 0n ? -c : c;
  return `${c < 0n || (c === 0n && x.n < 0n) ? '-' : ''}${a / 100n}.${(a % 100n).toString().padStart(2, '0')}`;
}

/** A decimal's exact text, at most 40 places. @param {Exact} x */
export function exactText(x) {
  let places = 0;
  while (ten(places) % x.d !== 0n && places < 40) places += 1;
  const scaled = (x.n * ten(places)) / x.d;
  const a = scaled < 0n ? -scaled : scaled;
  const body = a.toString().padStart(places + 1, '0');
  const text = places === 0 ? body : `${body.slice(0, -places)}.${body.slice(-places)}`.replace(/0+$/u, '').replace(/\.$/u, '');
  return `${scaled < 0n ? '-' : ''}${text}`;
}

/**
 * The call as an object of named inputs, after the command's own checks: an object, no
 * unknown field, each required field given, and each decimal field a decimal string.
 * @param {unknown} given @param {string} command @param {string[]} required
 * @param {string[]} optional @param {string[]} decimals
 */
export function callFields(given, command, required, optional, decimals) {
  if (typeof given !== 'object' || given === null || Array.isArray(given)) refuse('input.not_object', 'input must be a JSON object');
  const input = new Map(Object.entries(given));
  const known = new Set([...required, ...optional]);
  const unknown = [...input.keys()].sort().find((key) => !known.has(key));
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an input of ${command}`);
  for (const key of [...required, ...optional]) {
    if (!input.has(key)) {
      if (required.includes(key)) refuse('input.missing_field', `${key} is required`);
      continue;
    }
    const value = input.get(key);
    if (decimals.includes(key) && typeof value === 'string' && value.length > 8192) refuse('input.decimal_too_long', `${key}: decimal input exceeds 8192 bytes`);
    if (decimals.includes(key) && typeof value === 'string') decimalOf(value, true);
  }
  return input;
}

/**
 * A decimal string as an exact value, or null when Python's Decimal reads it as an infinity or NaN.
 * @param {string} text @param {boolean} [check] refuse unreadable text
 * @returns {Exact | null}
 */
function decimalOf(text, check = false) {
  const t = text.trim();
  const negative = t.startsWith('-');
  const body = negative ? t.slice(1) : t;
  const pieces = body.split('.');
  const plain = pieces.length <= 2 && pieces.every((piece) => piece !== '' && [...piece].every((ch) => ch >= '0' && ch <= '9'));
  if (plain) {
    const fraction = pieces.at(1) ?? '';
    return exact((negative ? -1n : 1n) * BigInt(pieces[0] + fraction), ten(fraction.length));
  }
  const word = (t.startsWith('+') || negative ? t.slice(1) : t).toLowerCase();
  const special = ['inf', 'infinity'].includes(word) || ['nan', 'snan'].includes(word.replace(/\d+$/u, ''));
  if (!special && check) refuse('input.decimal_unreadable', 'decimal.InvalidOperation');
  return null;
}

/** An amount: a decimal string, not negative, at most 2 places and $1e12. @param {unknown} value */
export function money(value) {
  if (typeof value !== 'string') refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  return exact(commandCents(value), 100n);
}

/** A decimal string of at most 32 characters above nil, or null. @param {unknown} value */
export function positiveDecimal(value) {
  if (typeof value !== 'string' || value.length > 32) return null;
  const parsed = decimalOf(value);
  return parsed && parsed.n > 0n ? parsed : null;
}

/** @param {unknown} value @param {string} name */
export const flag = (value, name) => (typeof value === 'boolean' ? value : refuse('input.flag_invalid', `${name} must be a boolean.`));

/** @param {unknown} value @param {string} name */
export function dateOf(value, name) {
  const day = dayOf(value);
  return day ?? refuse('input.date_invalid', `${name} must be a YYYY-MM-DD date from 1900 to 2100.`);
}

/** The confirmed scope and a supported year. @param {Map<string, unknown>} input @param {string[]} years */
export function yearOf(input, years) {
  if (input.get('scope_confirmed') !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = input.get('year');
  return typeof year === 'string' && years.includes(year) ? year
    : refuse('period.unsupported', `Choose an income year from ${years[0]} to ${years.at(-1)}.`);
}

/** The command's amounts, each to the cent. @param {[string, Exact][]} steps */
export const amountsOf = (steps) => Object.fromEntries(steps.map(([id, value]) => [id, amountText(value)]));
