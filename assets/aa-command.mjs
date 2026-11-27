// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// How the australian-accounting commands read their input, for the engines ported from them: the
// checks in the commands' order (unknown fields, then each field in turn: missing, then a decimal
// string too long or unreadable; then scope and the year), and the amounts, flags and dates they take.

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
export function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** Python's whitespace, which the commands strip from a decimal before reading it. */
const SPACE = /[\t\n\v\f\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/; // eslint-disable-line no-control-regex -- Python's whitespace includes U+001C to U+001F

/** @param {string} text */
const stripSpace = (text) => {
  let start = 0;
  let end = text.length;
  while (start < end && SPACE.test(text.charAt(start))) start += 1;
  while (end > start && SPACE.test(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
};

/**
 * A decimal as Python's Decimal holds it: a sign, a coefficient and an exponent, or a non-finite value.
 * @typedef {{finite: true, negative: boolean, coefficient: bigint, exponent: number} | {finite: false}} Dec
 */

/** A decimal string as the commands parse one, or null when it is not one (input.decimal_unreadable).
 * @param {string} value @returns {Dec | null} */
export function parseDecimal(value) {
  const text = stripSpace(value);
  if (/^[+-]?(inf|infinity|s?nan\d*)$/i.test(text)) return { finite: false };
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text); // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!parts) return null;
  const fraction = parts[3] ?? '';
  return { finite: true, negative: parts[1] === '-', coefficient: BigInt(parts[2] + fraction), exponent: -fraction.length };
}

/** A field's value with its parsed decimal where the command reads it as one.
 * @typedef {{value: unknown, dec: Dec | null}} Field */

/**
 * The call's fields in the command's order, refusing an unknown field, then a missing one or an unreadable
 * decimal string field by field. Fields in `optional` are read only when given.
 * @param {Record<string, unknown> | null} call
 * @param {string} command
 * @param {ReadonlyArray<readonly [string, 'dec' | 'raw']>} params
 * @param {ReadonlyArray<readonly [string, 'dec' | 'raw']>} [optional]
 * @returns {Map<string, Field>}
 */
export function readFields(call, command, params, optional = []) {
  if (call === null || typeof call !== 'object' || Array.isArray(call)) refuse('input.not_object', 'input must be a JSON object');
  const known = new Set([...params, ...optional].map(([key]) => key));
  const extra = Object.keys(call).find((key) => !known.has(key));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not an input of ${command}`);
  const given = new Map(Object.entries(call));
  /** @type {Map<string, Field>} */
  const fields = new Map();
  const read = (/** @type {string} */ key, /** @type {'dec' | 'raw'} */ kind) => {
    const value = given.get(key);
    let dec = null;
    if (kind === 'dec' && typeof value === 'string') {
      if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', `${key}: decimal input exceeds 8192 bytes`);
      dec = parseDecimal(value);
      if (!dec) refuse('input.decimal_unreadable', `Enter ${key.replaceAll('_', ' ')} in digits, such as 1250.50.`);
    }
    fields.set(key, { value, dec });
  };
  for (const [key, kind] of params) {
    if (!given.has(key)) refuse('input.missing_field', `${key} is required`);
    read(key, kind);
  }
  for (const [key, kind] of optional) if (given.has(key)) read(key, kind);
  return fields;
}

/** @param {Map<string, Field>} fields @param {string} key @returns {Field} */
export const field = (fields, key) => fields.get(key) ?? { value: undefined, dec: null };

/** `scope_confirmed` true, then a supported year. @param {Map<string, Field>} fields @param {readonly string[]} years */
export function scope(fields, years) {
  if (field(fields, 'scope_confirmed').value !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = field(fields, 'year').value;
  if (typeof year !== 'string' || !years.includes(year)) refuse('period.unsupported', `Unsupported period; supported: ${years.join(', ')}.`);
  return year;
}

/** A decimal's exact value in cents when it has at most 2 places, else null. @param {Dec} dec */
const decCents = (dec) => (dec.finite && dec.exponent >= -2 ? dec.coefficient * 10n ** BigInt(2 + dec.exponent) : null);

/** An amount the commands take: a finite decimal from 0 to $1,000,000,000,000 with at most 2 places, in cents.
 * @param {Dec | null} dec @param {string} [message] @returns {bigint} */
export function money(dec, message = 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.') {
  const cents = dec ? decCents(dec) : null;
  if (cents === null || (dec?.finite && dec.negative && cents > 0n) || cents > 10n ** 14n) refuse('input.amount_invalid', message);
  return cents;
}

/** A yes or no answer. @param {unknown} value @param {string} name @returns {boolean} */
export function flag(value, name) {
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `${name} must be a boolean.`);
  return value;
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** @param {number} y */
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** @param {number} y @param {number} m */
export const monthDays = (y, m) => (m === 2 && leap(y) ? 29 : /** @type {number} */ (DAYS[m - 1]));

/** A YYYY-MM-DD date from 1900 to 2100 as a day number (days since 1 January 1970), or null. @param {unknown} text */
export function parseDate(text) {
  if (typeof text !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!parts) return null;
  const [y, m, d] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > monthDays(y, m)) return null;
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** A date input, refused as the commands refuse one. @param {unknown} value @param {string} name */
export function dateArg(value, name) {
  const day = parseDate(value);
  if (day === null) refuse('input.date_invalid', `${name} must be a YYYY-MM-DD date from 1900 to 2100.`);
  return day;
}

/** A day number as YYYY-MM-DD. @param {number} day */
export const formatDay = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

/** @param {number} day @returns {[number, number, number]} */
const civil = (day) => {
  const date = new Date(day * 86400000);
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
};

/** The same day of the month `months` later, or the month's last day when it is shorter. @param {number} day @param {number} months */
export function addMonths(day, months) {
  const [y, m, d] = civil(day);
  const index = y * 12 + (m - 1) + months;
  const [ny, nm] = [Math.floor(index / 12), (index % 12) + 1];
  return Date.UTC(ny, nm - 1, Math.min(d, monthDays(ny, nm))) / 86400000;
}
