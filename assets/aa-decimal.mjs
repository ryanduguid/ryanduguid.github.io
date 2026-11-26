// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The few decimal operations the state duty engines take from australian-accounting's Decimal, which follows
// Python's: a sign, a coefficient and an exponent, so '100.00' and '100' print as given, a product keeps every
// place, an exact quotient keeps the exponent nearest the dividend's less the divisor's, and a nil result keeps
// its sign ('-0.00').

/** @typedef {{neg: boolean, c: bigint, e: number}} D */

/** @param {bigint} c @param {number} [e] @param {boolean} [neg] @returns {D} */
export const dec = (c, e = 0, neg = false) => ({ neg, c, e });

/** A literal such as '6666.66'. @param {string} text @returns {D} */
export function lit(text) {
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  return dec(BigInt(whole + fraction), -fraction.length, text.startsWith('-'));
}

/** A parsed input decimal (aa-command.mjs parseDecimal) as a D. @param {import('./aa-command.mjs').Dec} parsed @returns {D} */
export const fromInput = (parsed) => (parsed.finite ? dec(parsed.coefficient, parsed.exponent, parsed.negative) : dec(0n));

/** @param {D} a @param {number} e */
const scaled = (a, e) => a.c * 10n ** BigInt(a.e - e);
/** @param {D} a */
const signed = (a) => (a.neg ? -a.c : a.c);

/** @param {D} a @param {D} b @returns {D} */
export function add(a, b) {
  const e = Math.min(a.e, b.e);
  const sum = (a.neg ? -scaled(a, e) : scaled(a, e)) + (b.neg ? -scaled(b, e) : scaled(b, e));
  if (sum === 0n) return dec(0n, e, a.neg && b.neg);
  return dec(sum < 0n ? -sum : sum, e, sum < 0n);
}

/** @param {D} a @param {D} b */
export const sub = (a, b) => add(a, { ...b, neg: !b.neg });

/** @param {D} a @param {D} b @returns {D} */
export const mul = (a, b) => dec(a.c * b.c, a.e + b.e, a.neg !== b.neg);

/** An exact quotient, at the exponent nearest a.e - b.e that holds it. @param {D} a @param {D} b @returns {D} */
export function div(a, b) {
  const neg = a.neg !== b.neg;
  if (a.c === 0n) return dec(0n, a.e - b.e, neg);
  for (let k = 0; k < 64; k += 1) {
    const n = a.c * 10n ** BigInt(k);
    if (n % b.c === 0n) return dec(n / b.c, a.e - b.e - k, neg);
  }
  throw new Error('not an exact quotient');
}

/** `a` at exponent `e`, rounded half up or down (towards nil). @param {D} a @param {number} e @param {'half_up' | 'down'} mode @returns {D} */
export function quantize(a, e, mode) {
  if (a.e >= e) return dec(scaled(a, e), e, a.neg);
  const unit = 10n ** BigInt(e - a.e);
  let q = a.c / unit;
  if (mode === 'half_up' && 2n * (a.c % unit) >= unit) q += 1n;
  return dec(q, e, a.neg);
}

/** -1, 0 or 1, a nil of either sign being equal. @param {D} a @param {D} b */
export function cmp(a, b) {
  const e = Math.min(a.e, b.e);
  const [x, y] = [a.neg ? -scaled(a, e) : scaled(a, e), b.neg ? -scaled(b, e) : scaled(b, e)];
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Whether `a` is a whole number. @param {D} a */
export const whole = (a) => a.e >= 0 || a.c % 10n ** BigInt(-a.e) === 0n;

/** Python's str() of a Decimal. @param {D} a */
export function text(a) {
  const digits = a.c.toString();
  const sign = a.neg ? '-' : '';
  const adjusted = digits.length - 1 + a.e;
  if (a.e <= 0 && adjusted >= -6) {
    if (a.e === 0) return sign + digits;
    const padded = digits.padStart(1 - a.e, '0');
    return `${sign}${padded.slice(0, padded.length + a.e)}.${padded.slice(padded.length + a.e)}`;
  }
  const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return `${sign}${mantissa}E${adjusted >= 0 ? '+' : ''}${adjusted}`;
}

/** An amount as the commands render one: to the cent, half up. @param {D} a */
export const cents = (a) => text(quantize(a, -2, 'half_up'));

/** The value as a JavaScript number of dollars, for the page. @param {D} a */
export const toNumber = (a) => Number(signed(a)) * 10 ** a.e;
