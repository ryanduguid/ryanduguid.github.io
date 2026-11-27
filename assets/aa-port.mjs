// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// What the ported australian-accounting commands share: the command line's reading of a call (unknown keys, then
// each input in order, a decimal string parsed), the engine's decimal arithmetic (Python's Decimal, with the sign of
// a zero kept), its checks on amounts, flags, income years and days, and the rendering of each step's amount to the
// cent, half up. Used by assets/esic.mjs and assets/residential-vacancy-fee.mjs.

/** @param {string} code @param {string} message @returns {never} */
export function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** A finite decimal: sign, coefficient and power of 10, as Python's Decimal keeps them (trailing zeros kept). */
/** @typedef {{ s: boolean, c: bigint, e: number, finite?: undefined } | { finite: false }} Value */
/** @typedef {{ s: boolean, c: bigint, e: number }} Dec */
const PLAIN = /^-?\d+(?:\.\d+)?$/; // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
const SPECIAL = /^[+-]?(?:inf|infinity|s?nan\d*)$/i;

/** The engine's `parse_input`: digits with an optional point and leading minus; Infinity and NaN read but are not finite. @param {string} text @returns {Value | null} */
export function parseDec(text) {
  const t = text.trim();
  if (SPECIAL.test(t)) return { finite: false };
  if (!PLAIN.test(t)) return null;
  const [whole, fraction = ''] = t.replace('-', '').split('.');
  return { s: t.startsWith('-'), c: BigInt(`${whole}${fraction}`), e: -fraction.length };
}

/** @param {number} n @returns {Dec} */
export const int = (n) => ({ s: n < 0, c: BigInt(Math.abs(n)), e: 0 });
/** @param {Dec} a @param {number} e */
const signed = (a, e) => (a.s ? -1n : 1n) * a.c * 10n ** BigInt(a.e - e);
/** @param {Dec} a @param {Dec} b */
export const cmp = (a, b) => {
  const e = Math.min(a.e, b.e);
  const [x, y] = [signed(a, e), signed(b, e)];
  return x < y ? -1 : Number(x > y);
};
/** Python's sum: an exact zero is negative only when both operands are. @param {Dec} a @param {Dec} b @returns {Dec} */
export const add = (a, b) => {
  const e = Math.min(a.e, b.e);
  const x = signed(a, e) + signed(b, e);
  return { s: x === 0n ? a.s && b.s : x < 0n, c: x < 0n ? -x : x, e };
};
/** @param {Dec} a @param {Dec} b @returns {Dec} */
export const sub = (a, b) => add(a, { ...b, s: !b.s });
/** @param {Dec} a @param {Dec} b @returns {Dec} */
export const mul = (a, b) => ({ s: a.s !== b.s, c: a.c * b.c, e: a.e + b.e });
/** @param {Dec} a */
export const isZero = (a) => a.c === 0n;

/** Rounds `a` to exponent `e`, keeping its sign: 'down' truncates, 'half-up' rounds half away from zero. @param {Dec} a @param {number} e @param {'down' | 'half-up'} mode @returns {Dec} */
export function quantize(a, e, mode) {
  if (a.e >= e) return { s: a.s, c: a.c * 10n ** BigInt(a.e - e), e };
  const unit = 10n ** BigInt(e - a.e);
  const q = a.c / unit;
  return { s: a.s, c: mode === 'half-up' && (a.c % unit) * 2n >= unit ? q + 1n : q, e };
}

/** Python's str() of a Decimal. @param {Dec} a */
export function decText(a) {
  const sign = a.s ? '-' : '';
  const digits = a.c.toString();
  const adjusted = a.e + digits.length - 1;
  if (a.e <= 0 && adjusted >= -6) {
    if (a.e === 0) return sign + digits;
    const padded = digits.padStart(-a.e + 1, '0');
    return `${sign}${padded.slice(0, a.e)}.${padded.slice(a.e)}`;
  }
  const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return `${sign}${mantissa}E${adjusted >= 0 ? '+' : ''}${adjusted}`;
}

/** The engine's `money`: a finite decimal from 0 to 1e12 with at most 2 decimal places. @param {unknown} value @returns {Dec} */
export function money(value) {
  const v = /** @type {Value} */ (value);
  if (!v || typeof v !== 'object' || v.finite === false || cmp(v, int(0)) < 0 || cmp(v, { s: false, c: 1n, e: 12 }) > 0 || v.e < -2) {
    refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  }
  return v;
}

/** @param {unknown} value @param {string} name */
export function flag(value, name) {
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `${name} must be a boolean.`);
  return value;
}

/** 2026 for '2026-27'; null for text that is not an income year. @param {unknown} text */
export function yearFirst(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}$/.test(text)) return null;
  const first = Number(text.slice(0, 4));
  return first >= 1000 && `${first}-${String((first + 1) % 100).padStart(2, '0')}` === text ? first : null;
}

/** A JSON value as Python's repr shows it in the command's messages. @param {unknown} value */
const pyRepr = (value) => (typeof value === 'string' ? `'${value}'` : value == null ? 'None' : typeof value === 'boolean' ? (value ? 'True' : 'False') : String(value));

/** The engine's `scope`: confirmation, then a supported period. @param {Record<string, unknown>} v @param {readonly string[]} periods */
export function scopeYear(v, periods) {
  if (v.scope_confirmed !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  if (typeof v.year !== 'string' || !periods.includes(v.year)) refuse('period.unsupported', `Unsupported period ${pyRepr(v.year)}; supported: ${periods.join(', ')}.`);
  return /** @type {string} */ (v.year);
}

/** @typedef {[string, 'dec' | 'raw']} Param */

/** The command line's reading of a call: an unknown key (in code unit order), then each input in order and each optional input given, a decimal string parsed. @param {Record<string, unknown>} call @param {string} command @param {Param[]} params @param {Param[]} optional */
export function readCall(call, command, params, optional) {
  const known = new Set([...params, ...optional].map(([key]) => key));
  const unknown = Object.keys(call).sort((a, b) => Number(a > b) - Number(a < b)).find((key) => !known.has(key));
  if (unknown) refuse('input.field_unknown', `${unknown} is not an input of ${command}`);
  /** @type {Record<string, unknown>} */
  const read = {};
  for (const [key, kind] of params) {
    if (!Object.hasOwn(call, key)) refuse('input.missing_field', `${key} is required`);
    read[key] = kind === 'dec' ? decimalInput(key, call[key]) : call[key]; // eslint-disable-line security/detect-object-injection -- key is one of the command's own input names
  }
  for (const [key, kind] of optional) {
    if (Object.hasOwn(call, key)) read[key] = kind === 'dec' ? decimalInput(key, call[key]) : call[key]; // eslint-disable-line security/detect-object-injection -- key is one of the command's own input names
  }
  return read;
}

/** @param {string} key @param {unknown} value */
function decimalInput(key, value) {
  if (typeof value !== 'string') return value;
  if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', `${key}: decimal input exceeds 8192 bytes`);
  return parseDec(value) ?? refuse('input.decimal_unreadable', 'decimal.InvalidOperation');
}

/** @typedef {{ id: string, authority: string, value: Dec }} Step */

/** Each step's amount to the cent, half up, as the command renders it; and the steps with those amounts. @param {Step[]} steps */
export function rendered(steps) {
  const shown = steps.map(({ id, authority, value }) => ({ step: id, authority, value: decText(quantize(value, -2, 'half-up')) }));
  return { amounts: Object.fromEntries(shown.map(({ step, value }) => [step, value])), steps: shown };
}

/** A YYYY-MM-DD day from 1900 to 2100 as a day number; null otherwise. @param {unknown} text */
export function parseDay(text) {
  const m = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const valid = y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= monthDays(y, mo);
  return valid ? Date.UTC(y, mo - 1, d) / 86400000 : null;
}

/** @param {number} y @param {number} m */
const monthDays = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** @param {number} day */
const civil = (day) => {
  const t = new Date(day * 86400000);
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
};

/** @param {number} day */
export const formatDay = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

/** The same day of the month `months` later, or the month's last day when it is shorter. @param {number} day @param {number} months */
export function addMonths(day, months) {
  const [y, m, d] = civil(day);
  const index = y * 12 + (m - 1) + months;
  const [ny, nm] = [Math.floor(index / 12), (index % 12) + 1];
  return Date.UTC(ny, nm - 1, Math.min(d, monthDays(ny, nm))) / 86400000;
}

/** The last day of a period of `months` months from `day` (Acts Interpretation Act 1901 s 2G(2)). @param {number} day @param {number} months */
export function monthsEnd(day, months) {
  const same = addMonths(day, months);
  return civil(same)[2] === civil(day)[2] ? same - 1 : same;
}
