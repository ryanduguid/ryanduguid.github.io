// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The minimum annual payment from an account-based pension for 2024-25 to 2027-28, as the
// `pension-minimum` command of ryanduguid/australian-accounting works it, from the same input, with its
// rounding and refusal codes. Sources:
// - Superannuation Industry (Supervision) Regulations 1994 Schedule 7 clauses 1 to 5, the command's
//   source, read for it on 24 September 2026.
// - The ATO's 'Income stream (pension) rules and payments' (last updated 30 April 2026), read again on
//   24 November 2026: the percentage factors from 2023-24, rounding to the nearest $10 with $5 rounded
//   up, the first year pro-rated by the days from the start day, and nothing for a pension starting
//   from 1 June.
// Amounts are exact ratios of cents; each shows rounded half up to the cent.

export const PENSION_MINIMUM_YEARS = ['2024-25', '2025-26', '2026-27', '2027-28'];
/** The percentage factor in hundredths from each age (cl 2 table, 2023-24 onwards). */
export const PENSION_FACTORS = /** @type {const} */ ([[95, 14n], [90, 11n], [85, 9n], [80, 7n], [75, 6n], [65, 5n], [0, 4n]]);
const INPUTS = ['account_balance', 'age', 'days', 'year', 'scope_confirmed'];

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** A decimal's sign, whole digits and decimal digits, or null unless it reads as -?digits(.digits)?.
 * @param {string} text */
function decimalParts(text) {
  const negative = text.startsWith('-');
  const pieces = (negative ? text.slice(1) : text).split('.');
  const digits = /^\d+$/;
  if (pieces.length > 2 || !pieces.every((piece) => digits.test(piece))) return null;
  const [whole, decimals = ''] = pieces;
  return { negative, whole, decimals };
}

/** A decimal string as the command's reader parses it: its sign, whole and decimal digits, or null for
 * Infinity or NaN, which it reads and leaves to the amount check. @param {string} value */
function decimal(value) {
  if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', 'The account balance is too long.');
  const text = value.trim();
  const parts = decimalParts(text);
  if (parts === null && !/^[+-]?(inf|infinity|s?nan\d*)$/i.test(text)) {
    refuse('input.decimal_unreadable', 'Enter the account balance as a number, such as 250000.00.');
  }
  return parts;
}

/** The account balance in cents: finite, from 0 to 1,000,000,000,000, at most 2 decimal places. @param {unknown} value */
function balanceCents(value) {
  const parts = typeof value === 'string' ? decimal(value) : null;
  if (parts === null) refuse('input.amount_invalid', 'Enter a finite account balance in dollars and cents.');
  const cents = parts.decimals.length <= 2 ? BigInt(parts.whole + parts.decimals.padEnd(2, '0')) : null;
  if (cents === null || (parts.negative && cents !== 0n) || cents > 100000000000000n) {
    refuse('input.amount_invalid', 'Enter an account balance from 0 to 1,000,000,000,000, to the cent.');
  }
  return cents;
}

/** @param {unknown} value @param {number} most */
const whole = (value, most) => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= most ? value : null);
/** @param {bigint} num @param {bigint} den */
function centsText(num, den) {
  const cents = (2n * num + den) / (2n * den);
  const text = String(cents).padStart(3, '0');
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

/** @typedef {{year: string, amounts: {account_balance_used: string, minimum_before_rounding: string, minimum_payment: string},
 *   rates: {percentage_factor: string, days: string, days_in_year: string}, factor: number, days: number, daysInYear: number,
 *   clause: 'cl 1(1)' | 'cl 3' | 'cl 4'}} PensionWorked */

/** The minimum payment from the command's input. @param {unknown} given @returns {PensionWorked} */
export function pensionMinimum(given) {
  if (typeof given !== 'object' || given === null || Array.isArray(given)) refuse('input.not_object', 'The input is not an object.');
  const input = new Map(Object.entries(given));
  for (const key of INPUTS) {
    if (!input.has(key)) refuse('input.missing_field', `Enter ${key.replaceAll('_', ' ')}.`);
    if (key === 'account_balance' && typeof input.get(key) === 'string') decimal(/** @type {string} */ (input.get(key)));
  }
  if (input.get('scope_confirmed') !== true) refuse('scope.not_confirmed', 'Confirm the facts the calculator takes as given.');
  const year = PENSION_MINIMUM_YEARS.find((y) => y === input.get('year'));
  if (year === undefined) refuse('period.unsupported', 'Choose an income year from 2024-25 to 2027-28.');
  const balance = balanceCents(input.get('account_balance'));
  const age = whole(input.get('age'), 150);
  if (age === null) refuse('input.age_invalid', 'Enter the age in whole years, from 0 to 150.');
  const second = Number(year.slice(0, 4)) + 1;
  const daysInYear = second % 4 === 0 && (second % 100 !== 0 || second % 400 === 0) ? 366 : 365;
  const days = whole(input.get('days'), daysInYear);
  if (days === null || days < 1) refuse('input.day_count_invalid', `Enter the days from 1 to ${daysInYear} for ${year}.`);
  const factor = /** @type {bigint} */ (PENSION_FACTORS.find(([lowest]) => age >= lowest)?.[1]);
  // In cents over `den`: cl 4 gives nil from the last 30 days; cl 3 pro-rates a first year that starts after 1 July.
  const [num, den, clause] = days <= 30 ? [0n, 1n, 'cl 4']
    : days < daysInYear ? [balance * factor * BigInt(days), 100n * BigInt(daysInYear), 'cl 3'] : [balance * factor, 100n, 'cl 1(1)'];
  // cl 5: to the nearest $10, $5 rounded up.
  const tens = (2n * num + 1000n * den) / (2000n * den);
  return { year, amounts: { account_balance_used: centsText(balance, 1n), minimum_before_rounding: centsText(num, den), minimum_payment: `${tens * 10n}.00` },
    rates: { percentage_factor: `0.${String(factor).padStart(2, '0')}`, days: String(days), days_in_year: String(daysInYear) },
    factor: Number(factor), days, daysInYear, clause: /** @type {'cl 1(1)' | 'cl 3' | 'cl 4'} */ (clause) };
}

/** The command's input from the form: the balance and age on 1 July or the start day, and the days from
 * the start day to 30 June, or the whole year. @param {(name: string) => string} value */
export function pensionMinimumFormInput(value) {
  const year = value('year');
  const start = Number(year.slice(0, 4));
  const second = start + 1;
  const daysInYear = second % 4 === 0 && (second % 100 !== 0 || second % 400 === 0) ? 366 : 365;
  const started = value('started').trim();
  const days = started === '' ? daysInYear : Math.round((Date.UTC(second, 5, 30) - Date.parse(`${started}T00:00:00Z`)) / 86400000) + 1;
  const age = value('age').trim();
  return { account_balance: value('balance').trim(), age: /^\d+$/.test(age) ? Number(age) : age, days: Number.isNaN(days) ? started : days, year,
    scope_confirmed: true };
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function pensionMinimumResult(value, aud) {
  const input = pensionMinimumFormInput(value);
  const started = value('started').trim();
  let r;
  try {
    r = pensionMinimum(input);
  } catch (error) {
    const first = Number(input.year.slice(0, 4));
    if (/** @type {{code?: string}} */ (error).code === 'input.day_count_invalid' && started !== '') {
      refuse(error.code, `Enter a start day from 1 July ${first} to 30 June ${first + 1}, or leave it blank.`);
    }
    throw error;
  }
  const day = (/** @type {string} */ iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const rows = [['Account balance', aud(Number(r.amounts.account_balance_used))], ['Percentage factor at your age', `${r.factor}%`],
    ['Days counted', r.clause === 'cl 1(1)' ? `All ${r.daysInYear}` : `${r.days} of ${r.daysInYear}`],
    ['Minimum before rounding', aud(Number(r.amounts.minimum_before_rounding))],
    ['Minimum annual payment, to the nearest $10', aud(Number(r.amounts.minimum_payment))]];
  const note = r.clause === 'cl 4' ? 'Nothing is required for a pension starting on or after 1 June, in the last 30 days of the year'
    : r.clause === 'cl 3' ? `Pro-rated from the start day, ${day(started)}, to 30 June; $5 rounds up` : 'The whole year from 1 July; $5 rounds up';
  return { inputs: `${r.year}; balance ${aud(Number(r.amounts.account_balance_used))}; age ${input.age}${started ? `; started ${day(started)}` : '; held on 1 July'}`,
    rows, principal: 4, note };
}
