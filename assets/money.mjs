// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Number parsing and exact rounding shared by the calculator engines.

export const POSITIVE_FRACTION = /^([1-9][0-9]{0,8})\/([1-9][0-9]{0,8})$/;

/** @param {unknown} value
 * @param {{min?: number, max?: number, places?: number, integer?: boolean, money?: boolean}} [options] */
export function number(value, { min = 0, max = 1e9, places = 2, integer = false, money = false } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  // Thousands may be grouped in 3s ('85,000'), and money may start with '$' after
  // any minus sign. A number field accepts exponent notation such as 1e3; ask for
  // digits instead of blaming decimal places the entry does not have.
  const parts = /^-?(\$?)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(text);
  if (!parts || (parts[1] && !money)) throw new Error('Enter a number using digits only.');
  if ((parts[2] ?? '').length > places) {
    throw new Error(`Enter a number with no more than ${places} decimal places.`);
  }
  const result = Number(text.replace(/[$,]/g, ''));
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) {
    throw new Error(`Enter ${integer ? 'a whole number' : 'an amount'} between ${min} and ${max}.`);
  }
  return result;
}

/** Digits with an optional minus sign and decimal part, such as '-12.30', split into those parts;
 * null for anything else, '1.' and '.5' included.
 * @param {string} text */
export function decimalParts(text) {
  const negative = text.startsWith('-');
  const [whole, fraction, extra] = text.slice(negative ? 1 : 0).split('.');
  const digits = /^\d+$/;
  return extra === undefined && digits.test(whole) && (fraction === undefined || digits.test(fraction))
    ? { negative, whole, fraction: fraction ?? '' }
    : null;
}

/** An amount as the australian-accounting commands read one, in cents. Text that is not digits,
 * with an optional minus sign and decimal part, is input.decimal_unreadable; an infinity or NaN,
 * a negative amount, more than 2 decimal places or more than $1e12 is input.amount_invalid.
 * @param {unknown} value */
export function commandCents(value) {
  const text = String(value).trim();
  const parts = decimalParts(text);
  if (!parts && !/^[+-]?(?:inf(?:inity)?|s?nan\d*)$/i.test(text)) {
    throw Object.assign(new Error(`${text} is not a number`), { code: 'input.decimal_unreadable' });
  }
  const scaled = parts && parts.fraction.length <= 2 ? BigInt(parts.whole) * 100n + BigInt(parts.fraction.padEnd(2, '0')) : -1n;
  if (scaled < 0n || (parts?.negative && scaled > 0n) || scaled > 10n ** 14n) {
    throw Object.assign(new Error('Amounts must be finite non-negative Decimals, at most 2dp and 1e12.'), { code: 'input.amount_invalid' });
  }
  return scaled;
}

/** @param {string} value @param {number} [min] */
export const cents = (value, min = 0) => Math.round(number(value, { min, money: true }) * 100);
// Non-negative ratios in cents round half up. BigInt keeps large products exact.
/** @param {bigint} numerator @param {bigint} denominator */
export const ratioCents = (numerator, denominator) => (2n * numerator + denominator) / (2n * denominator);
/** @param {bigint} numerator @param {bigint} denominator */
export const ratioMoney = (numerator, denominator) => Number(ratioCents(numerator, denominator)) / 100;
// Percentages round half away from zero to 0.01, as Excel's ROUND does, from the
// exact cents ratio rather than a float quotient. A zero result is never -0.
/** @param {number} numerator cents @param {number} denominator cents, positive */
export const ratioPercent = (numerator, denominator) => {
  const [top, bottom] = [BigInt(Math.abs(numerator)) * 10000n, BigInt(denominator)];
  const hundredths = Number((2n * top + bottom) / (2n * bottom));
  return (numerator < 0 && hundredths ? -hundredths : hundredths) / 100;
};
