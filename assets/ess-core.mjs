// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The refusals, dates and decimal arithmetic the employee share scheme calculator needs. The arithmetic is Python's
// `decimal` module's, as the australian-accounting command's Decimal type copies it: exact sums, differences and
// products with their signed zeros, division to 40 significant digits rounded half even, rounding to the cent half up,
// and `str()`. A value is `{ neg, c, e }`: its sign, its coefficient as a non-negative BigInt and its exponent.

/** @typedef {{neg: boolean, c: bigint, e: number}} Dec */

/** The command's working precision for the regulations' tables (engine.rs WORKING_PRECISION). */
export const PRECISION = 40;

/** @param {boolean} neg @param {bigint} c @param {number} e @returns {Dec} */
const dec = (neg, c, e) => ({ neg, c, e });
/** @param {number} n */
const pow = (n) => 10n ** BigInt(n);

/** A whole number. @param {number} n */
export const int = (n) => dec(n < 0, BigInt(Math.abs(n)), 0);

/** A literal such as `92.5` or `0.15`. @param {string} text */
export function lit(text) {
  const [whole, fraction = ''] = text.split('.');
  return dec(false, BigInt(whole + fraction), -fraction.length);
}

/** The coefficients of `a` and `b` on their common exponent, signed. @param {Dec} a @param {Dec} b */
function aligned(a, b) {
  const e = Math.min(a.e, b.e);
  const x = a.c * pow(a.e - e);
  const y = b.c * pow(b.e - e);
  return [a.neg ? -x : x, b.neg ? -y : y, e];
}

/** `a + b`: a zero sum is negative only when both are negative zeros or negatives. @param {Dec} a @param {Dec} b */
export function add(a, b) {
  const [x, y, e] = /** @type {[bigint, bigint, number]} */ (aligned(a, b));
  const sum = x + y;
  if (sum === 0n) return dec(a.neg && b.neg, 0n, e);
  return dec(sum < 0n, sum < 0n ? -sum : sum, e);
}

/** @param {Dec} a @param {Dec} b */
export const sub = (a, b) => add(a, dec(!b.neg, b.c, b.e));
/** @param {Dec} a @param {Dec} b */
export const mul = (a, b) => dec(a.neg !== b.neg, a.c * b.c, a.e + b.e);

/** -1, 0 or 1 as `a` is below, equal to or above `b`. @param {Dec} a @param {Dec} b */
export function cmp(a, b) {
  const [x, y] = aligned(a, b);
  return x < y ? -1 : Number(x > y);
}

/** The number of digits in a coefficient. @param {bigint} c */
const digits = (c) => c.toString().length;

/** Rounds to `prec` significant digits, half even (`_fix`). @param {Dec} v @param {number} prec */
function fix(v, prec) {
  const drop = digits(v.c) - prec;
  if (v.c === 0n || drop <= 0) return v;
  const p = pow(drop);
  let q = v.c / p;
  const twice = (v.c % p) * 2n;
  if (twice > p || (twice === p && q % 2n === 1n)) q += 1n;
  return digits(q) > prec ? dec(v.neg, q / 10n, v.e + drop + 1) : dec(v.neg, q, v.e + drop);
}

/** `a / b` in a context of `prec` digits, as `_pydecimal` divides; `b` is never zero here.
 * @param {Dec} a @param {Dec} b @param {number} [prec] */
export function div(a, b, prec = PRECISION) {
  const neg = a.neg !== b.neg;
  const ideal = a.e - b.e;
  if (a.c === 0n) return dec(neg, 0n, ideal);
  const shift = digits(b.c) - digits(a.c) + prec + 1;
  let e = ideal - shift;
  const [n, d] = shift >= 0 ? [a.c * pow(shift), b.c] : [a.c, b.c * pow(-shift)];
  let q = n / d;
  if (n % d !== 0n) {
    if (q % 5n === 0n) q += 1n;
  } else {
    while (e < ideal && q % 10n === 0n) {
      q /= 10n;
      e += 1;
    }
  }
  return fix(dec(neg, q, e), prec);
}

/** `v.quantize(Decimal('1E{exp}'))`, half up (away from zero on a tie) or down. @param {Dec} v @param {number} exp
 * @param {'half_up' | 'down'} [rounding] */
export function quantize(v, exp, rounding = 'half_up') {
  if (v.e >= exp) return dec(v.neg, v.c * pow(v.e - exp), exp);
  const p = pow(exp - v.e);
  const up = rounding === 'half_up' && (v.c % p) * 2n >= p;
  return dec(v.neg, v.c / p + (up ? 1n : 0n), exp);
}

/** Python's `str()` of a decimal. @param {Dec} v */
export function str(v) {
  const text = v.c.toString();
  const left = v.e + text.length;
  const dot = v.e <= 0 && left > -6 ? left : 1;
  let body;
  if (dot <= 0) body = `0.${'0'.repeat(-dot)}${text}`;
  else if (dot >= text.length) body = text + '0'.repeat(dot - text.length);
  else body = `${text.slice(0, dot)}.${text.slice(dot)}`;
  const exponent = left === dot ? '' : `E${left - dot > 0 ? '+' : ''}${left - dot}`;
  return `${v.neg ? '-' : ''}${body}${exponent}`;
}

/** An amount to the cent, half up, as the command shows amounts. @param {Dec} v */
export const shown = (v) => str(quantize(v, -2));

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
export function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** Days since 1 January 1970 from a `YYYY-MM-DD` date from 1900 to 2100, or null. @param {unknown} text */
export function day(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2100 || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return back.getTime() / 86400000;
}
/** @param {number} n */
export const dateText = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
/** A literal date. @param {string} text */
export const on = (text) => /** @type {number} */ (day(text));

/** The same day `months` later, or the month's last day when it is shorter. @param {number} n @param {number} months */
export function addMonths(n, months) {
  const date = new Date(n * 86400000);
  const index = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const [y, m] = [Math.floor(index / 12), index % 12];
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(date.getUTCDate(), last)) / 86400000;
}

/** The income year a day falls in, as `2025-26`. @param {number} n */
export function incomeYear(n) {
  const date = new Date(n * 86400000);
  const start = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
