// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Exact arithmetic and input checks for the PAYG withholding schedules in withholding-schedules.mjs,
// ported from australian-accounting's australian-tax-calculators crate (engine.rs, api.rs and
// decimal.rs). A value is a fraction of 2 BigInts, so a schedule's 'ignore cents', 'nearest dollar'
// and 'cents' steps round the exact result, as the crate's 40-digit decimals do for these amounts.

/** @typedef {{p: bigint, q: bigint}} Q */
/** @typedef {{kind: 'dec', value: Q, places: number} | {kind: 'nan'} | {kind: 'bool', value: boolean}
 *   | {kind: 'int', value: number} | {kind: 'text', value: string} | {kind: 'other'}} Arg */

/** A refusal with the crate's code. @param {string} code @param {string} message @returns {never} */
export function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** The table's own entry for `key`, read through a Map so no key reaches a property lookup.
 * @template T @param {Readonly<Record<string, T>>} table @param {string | number} key @returns {T} */
export const pick = (table, key) => /** @type {T} */ (new Map(Object.entries(table)).get(String(key)));

/** @param {bigint} a @param {bigint} b @returns {bigint} */
const gcd = (a, b) => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));
/** @param {bigint} p @param {bigint} [q] @returns {Q} */
export function q(p, q = 1n) {
  const sign = q < 0n ? -1n : 1n;
  const g = gcd(p, q) || 1n;
  return { p: (sign * p) / g, q: (sign * q) / g };
}
/** A decimal literal such as '0.1500' or '-0.6702'. @param {string} text @returns {Q} */
export function dec(text) {
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const value = q(BigInt(whole + fraction), 10n ** BigInt(fraction.length));
  return text.startsWith('-') ? q(-value.p, value.q) : value;
}
/** @param {number | bigint} n @returns {Q} */
export const int = (n) => q(BigInt(n));
/** The crate's 40-digit working context: a result rounded to 40 significant digits, a half to even, as
 * Python's decimal module does (17 ÷ 6 × 3 is 8.4999…, not 8.5). @param {Q} a @returns {Q} */
function context(a) {
  if (a.p === 0n) return a;
  const n = a.p < 0n ? -a.p : a.p;
  let e = String(n).length - String(a.q).length;
  if (e >= 0 ? n < a.q * 10n ** BigInt(e) : n * 10n ** BigInt(-e) < a.q) e -= 1;
  const shift = 39 - e;
  const [num, den] = shift >= 0 ? [n * 10n ** BigInt(shift), a.q] : [n, a.q * 10n ** BigInt(-shift)];
  let r = num / den;
  const rest = 2n * (num - r * den);
  if (rest > den || (rest === den && r % 2n === 1n)) r += 1n;
  const v = shift >= 0 ? q(r, 10n ** BigInt(shift)) : q(r * 10n ** BigInt(-shift));
  return a.p < 0n ? q(-v.p, v.q) : v;
}
/** @param {Q} a @param {Q} b */
export const add = (a, b) => context(q(a.p * b.q + b.p * a.q, a.q * b.q));
/** @param {Q} a @param {Q} b */
export const sub = (a, b) => context(q(a.p * b.q - b.p * a.q, a.q * b.q));
/** @param {Q} a @param {Q} b */
export const mul = (a, b) => context(q(a.p * b.p, a.q * b.q));
/** @param {Q} a @param {Q} b */
export const div = (a, b) => context(q(a.p * b.q, a.q * b.p));
/** @param {Q} a @param {Q} b @returns {number} */
export const cmp = (a, b) => { const d = a.p * b.q - b.p * a.q; return d < 0n ? -1 : d > 0n ? 1 : 0; };
/** Cents and more ignored: rounded toward nil to `places` decimal places. @param {Q} a @param {number} [places] */
export const down = (a, places = 0) => { const s = 10n ** BigInt(places); return q((a.p * s) / a.q, s); };
/** Rounded to `places` decimal places, a half away from nil. @param {Q} a @param {number} [places] */
export function halfUp(a, places = 0) {
  const s = 10n ** BigInt(places);
  const n = a.p < 0n ? -a.p : a.p;
  const r = (2n * n * s + a.q) / (2n * a.q);
  return q(a.p < 0n ? -r : r, s);
}
/** @param {Q} a @param {Q} b */
export const max = (a, b) => (cmp(b, a) > 0 ? b : a);
/** An amount as the crate renders it: to the cent, a half up. @param {Q} a @returns {string} */
export function cents(a) {
  const c = halfUp(a, 2);
  const n = (c.p * 100n) / c.q;
  const abs = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
/** A whole-dollar or cents amount without trailing places beyond `places`. @param {Q} a @param {number} places */
export function fixed(a, places) {
  const n = (a.p * 10n ** BigInt(places)) / a.q;
  const text = String(n < 0n ? -n : n).padStart(places + 1, '0');
  const body = places ? `${text.slice(0, -places)}.${text.slice(-places)}` : text;
  return n < 0n ? `-${body}` : body;
}
/** Python's str() of the decimal coefficient `n` times 10 to the `exp`. @param {bigint} n @param {number} exp */
export function pyDecimal(n, exp) {
  const digits = String(n < 0n ? -n : n);
  const sign = n < 0n ? '-' : '';
  const adjusted = exp + digits.length - 1;
  if (exp <= 0 && adjusted >= -6) {
    if (exp === 0) return sign + digits;
    const padded = digits.padStart(-exp + 1, '0');
    return `${sign}${padded.slice(0, exp)}.${padded.slice(exp)}`;
  }
  const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return `${sign}${mantissa}E${adjusted >= 0 ? '+' : ''}${adjusted}`;
}

/** A JSON value as the crate reads it: a string is a decimal for a decimal input, text otherwise.
 * @param {unknown} value @param {boolean} decimal @param {string} key @returns {Arg} */
export function arg(value, decimal, key) {
  if (typeof value === 'boolean') return { kind: 'bool', value };
  if (typeof value === 'number') return Number.isSafeInteger(value) ? { kind: 'int', value } : { kind: 'other' };
  if (typeof value !== 'string') return { kind: 'other' };
  if (!decimal) return { kind: 'text', value };
  if (value.length > 8192) refuse('input.decimal_too_long', `${key}: decimal input exceeds 8192 bytes`);
  const text = value.trim();
  const parts = text.split('.');
  if (parts.length <= 2 && /^-?\d+$/.test(parts[0]) && (parts.length === 1 || /^\d+$/.test(parts[1]))) {
    return { kind: 'dec', value: dec(text), places: parts.length === 2 ? parts[1].length : 0 };
  }
  if (/^[+-]?(inf|infinity|s?nan\d*)$/i.test(text)) return { kind: 'nan' };
  return refuse('input.decimal_unreadable', 'decimal.InvalidOperation');
}

/** The crate's money check: a finite non-negative decimal, at most 2 places and 1e12. @param {Arg} a @returns {Q} */
export function money(a) {
  if (a.kind !== 'dec' || a.places > 2 || a.value.p < 0n || cmp(a.value, int(10n ** 12n)) > 0) {
    refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  }
  return a.value;
}
/** @param {Arg} a @param {string} name @returns {boolean} */
export function flag(a, name) {
  if (a.kind !== 'bool') refuse('input.flag_invalid', `${name} must be a boolean.`);
  return a.value;
}
/** A whole number from `low` to `high`. @param {Arg} a @param {string} name @param {number} low @param {number} high */
export function count(a, name, low, high) {
  if (a.kind !== 'int' || a.value < low || a.value > high) {
    refuse('input.count_invalid', `${name} must be an integer from ${low} to ${high}.`);
  }
  return a.value;
}
/** Scope confirmed, then a supported year. @param {Arg} confirmed @param {Arg} year @param {string[]} years */
export function scope(confirmed, year, years) {
  if (confirmed.kind !== 'bool' || !confirmed.value) {
    refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  }
  if (year.kind !== 'text' || !years.includes(year.value)) refuse('period.unsupported', `${year.kind === 'text' ? year.value : 'That year'} is not covered: these schedules are worked for ${years.join(', ')}.`);
  return year.value;
}
/** A YYYY-MM-DD date from 1900 to 2100, as days. @param {Arg} a @param {string} name @returns {number} */
export function date(a, name) {
  const m = a.kind === 'text' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.value) : null;
  const time = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
  const ok = m && Number(m[1]) >= 1900 && Number(m[1]) <= 2100 && new Date(time).toISOString().startsWith(m[0]);
  if (!ok) refuse('input.date_invalid', `${name} must be a YYYY-MM-DD date from 1900 to 2100.`);
  return time / 86400000;
}
