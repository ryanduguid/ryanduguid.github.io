// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The downsizer contribution test of ITAA 1997 s 292-102, as the `contribution-caps` command of
// ryanduguid/australian-accounting works it from its `downsizer_*` inputs, with the same refusal codes.
// The command's source: s 292-102 on the ATO Legal Database with its history notes, read for it on
// 24 November 2026: age 55 for contributions from 1 January 2023 (Act No. 84 of 2022 Sch 5 item 1), a
// contract entered into on or after 1 July 2018 (Act No. 132 of 2017 Sch 2 item 4), a contribution within
// 90 days after the change of ownership (s 292-102(1)(g)) and the lesser of the 2 limits of s 292-102(3).
// The other criteria are the user's statement. Amounts are integer cents.
import { decimalParts } from './money.mjs';

/** The inputs, all given or none, in the order the command reads them. */
export const DOWNSIZER_INPUTS = /** @type {const} */ (['downsizer_contribution', 'downsizer_contribution_date', 'downsizer_age',
  'downsizer_contract_date', 'downsizer_settlement_date', 'downsizer_longer_period_allowed', 'downsizer_capital_proceeds',
  'downsizer_earlier_own', 'downsizer_earlier_from_proceeds', 'downsizer_conditions_met']);
const AMOUNTS = new Set(['downsizer_contribution', 'downsizer_capital_proceeds', 'downsizer_earlier_own', 'downsizer_earlier_from_proceeds']);
/** s 292-102(3)(a): $300,000 for each person, in cents. */
const PERSON_LIMIT = 30000000n;
const DAY = 86400000;

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** Whether any downsizer input is given. @param {Record<string, unknown>} given */
export const downsizerGiven = (given) => DOWNSIZER_INPUTS.some((key) => Object.hasOwn(given, key));

/** The command's reading of each input: present, and an amount given as text readable as a decimal.
 * @param {Record<string, unknown>} given */
export function readDownsizerInputs(given) {
  const input = new Map(Object.entries(given));
  for (const key of DOWNSIZER_INPUTS) {
    if (!input.has(key)) refuse('input.missing_field', `${key} is required`);
    const value = input.get(key);
    if (!AMOUNTS.has(key) || typeof value !== 'string') continue;
    if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', `${key} is too long.`);
    const text = value.trim();
    if (decimalParts(text) === null && !/^[+-]?(inf|infinity|s?nan\d*)$/i.test(text)) {
      refuse('input.decimal_unreadable', `Enter ${key.replaceAll('_', ' ')} as a number, such as 250000.00.`);
    }
  }
}

/** @typedef {{cents: bigint, negativeZero: boolean}} Amount A decimal amount in cents; the command keeps -0 as a decimal does. */

/** An amount: text from 0 to $1e12, at most 2 decimal places. @param {unknown} value @returns {Amount} */
function amountCents(value) {
  const parts = typeof value === 'string' ? decimalParts(value.trim()) : null;
  const cents = parts && parts.fraction.length <= 2 ? BigInt(parts.whole + parts.fraction.padEnd(2, '0')) : -1n;
  if (cents < 0n || (parts?.negative && cents !== 0n) || cents > 10n ** 14n) {
    refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  }
  return { cents, negativeZero: cents === 0n && Boolean(parts?.negative) };
}

/** A YYYY-MM-DD date from 1900 to 2100 as a day number. @param {unknown} value @param {string} name */
function dayNumber(value, name) {
  const parts = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  const [y, m, d] = parts ? [Number(parts[1]), Number(parts[2]), Number(parts[3])] : [0, 0, 0];
  const time = Date.UTC(y, m - 1, d);
  if (!parts || y < 1900 || y > 2100 || new Date(time).toISOString().slice(0, 10) !== value) {
    refuse('input.date_invalid', `${name} must be a YYYY-MM-DD date from 1900 to 2100.`);
  }
  return time / DAY;
}

/** @param {unknown} value @param {string} name */
function flag(value, name) {
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `${name} must be a boolean.`);
  return value;
}

/** The days from the change of ownership to the contribution, and the contract day, checked.
 * @param {Record<string, unknown>} given @param {string} year */
function datesInOrder(given, year) {
  const made = dayNumber(given.downsizer_contribution_date, 'downsizer_contribution_date');
  const contract = dayNumber(given.downsizer_contract_date, 'downsizer_contract_date');
  const settled = dayNumber(given.downsizer_settlement_date, 'downsizer_settlement_date');
  const first = Number(year.slice(0, 4));
  if (made < Date.UTC(first, 6, 1) / DAY || made > Date.UTC(first + 1, 5, 30) / DAY) {
    refuse('downsizer.date_outside_year', `downsizer_contribution_date is not in the ${year} income year.`);
  }
  if (settled < contract) refuse('downsizer.settlement_before_contract', 'downsizer_settlement_date is before downsizer_contract_date.');
  if (made < settled) {
    refuse('downsizer.contribution_before_settlement', 's 292-102(1)(g) allows a contribution within 90 days after the change of '
      + 'ownership; one made before it is not decided here.');
  }
  return { days: made - settled, contract: /** @type {string} */ (given.downsizer_contract_date) };
}

/** @typedef {{test: string, authority: string, met: boolean, finding: string}} DownsizerTest */

/** s 292-102(1)(a), (g), the contract date and the stated conditions. @param {Record<string, unknown>} given @param {string} year
 * @returns {DownsizerTest[]} */
function tests(given, year) {
  const age = given.downsizer_age;
  if (typeof age !== 'number' || !Number.isSafeInteger(age) || age < 0 || age > 150) {
    refuse('input.age_invalid', 'downsizer_age must be an integer number of years from 0 to 150.');
  }
  const { days, contract } = datesInOrder(given, year);
  const longer = flag(given.downsizer_longer_period_allowed, 'downsizer_longer_period_allowed');
  const stated = flag(given.downsizer_conditions_met, 'downsizer_conditions_met');
  return [
    { test: 'age', authority: 'ITAA 1997 s 292-102(1)(a), 55 for contributions from 1 January 2023 (Act No. 84 of 2022 Sch 5 item 1)',
      met: age >= 55, finding: `aged ${age} at the contribution, at least 55 required` },
    { test: 'contract_date', authority: 'Act No. 132 of 2017 Sch 2 item 4: a disposal under a contract entered into on or after 1 July 2018',
      met: contract >= '2018-07-01', finding: `contract entered into on ${contract}` },
    { test: 'within_90_days', authority: 'ITAA 1997 s 292-102(1)(g)', met: days <= 90 || longer,
      finding: `${days} days after the change of ownership; longer period allowed: ${longer}` },
    { test: 'stated_conditions', authority: 'ITAA 1997 s 292-102(1)(b) to (f), (h), (i) and (2)', met: stated, finding: 'stated by the operator' },
  ];
}

/** @param {Amount} amount */
const money = ({ cents, negativeZero }) => `${negativeZero ? '-' : ''}${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
/** Python's min: the first unless the second is less. @param {Amount} a @param {Amount} b */
const least = (a, b) => (b.cents < a.cents ? b : a);
/** a - b, whose nil result is -0 only for -0 less +0, as a decimal subtraction gives. @param {Amount} a @param {Amount} b */
const less = (a, b) => ({ cents: a.cents - b.cents, negativeZero: a.cents === b.cents && a.negativeZero && !b.negativeZero });
const NIL = { cents: 0n, negativeZero: false };

/** @typedef {{eligible: boolean, tests: DownsizerTest[], amounts: {downsizer_cap_remaining: string,
 *   downsizer_proceeds_remaining: string, downsizer_covered: string, downsizer_not_covered: string}}} DownsizerWorked */

/**
 * How much of one contribution in `year` s 292-102 covers, from the command's `downsizer_*` inputs.
 * @param {Record<string, unknown>} given @param {string} year a supported income year, such as 2025-26
 * @returns {DownsizerWorked}
 */
export function downsizer(given, year) {
  readDownsizerInputs(given);
  const rows = tests(given, year);
  const eligible = rows.every((row) => row.met);
  const made = amountCents(given.downsizer_contribution);
  const proceeds = amountCents(given.downsizer_capital_proceeds);
  const own = amountCents(given.downsizer_earlier_own);
  const earlier = amountCents(given.downsizer_earlier_from_proceeds);
  // s 292-102(3)(a) and (b): each room is nil rather than negative (a max that keeps its first argument on a tie).
  const ownRoom = own.cents < PERSON_LIMIT ? { cents: PERSON_LIMIT - own.cents, negativeZero: false } : NIL;
  const proceedsLeft = less(proceeds, earlier);
  const proceedsRoom = proceedsLeft.cents < 0n ? NIL : proceedsLeft;
  const covered = eligible ? least(least(made, ownRoom), proceedsRoom) : NIL;
  return { eligible, tests: rows, amounts: { downsizer_cap_remaining: money(ownRoom), downsizer_proceeds_remaining: money(proceedsRoom),
    downsizer_covered: money(covered), downsizer_not_covered: money(less(made, covered)) } };
}

/** The form's message for each downsizer refusal it can meet. @param {string} year */
const formMessages = (year) => new Map([['input.age_invalid', 'Enter the age at the downsizer contribution in whole years, from 0 to 150.'],
  ['input.date_invalid', 'Enter each downsizer day as a date.'], ['input.decimal_unreadable', 'Enter each downsizer amount in dollars and cents.'],
  ['input.amount_invalid', 'Enter each downsizer amount from 0 to 1,000,000,000,000, to the cent.'],
  ['downsizer.date_outside_year', `Enter a downsizer contribution day in ${year}.`],
  ['downsizer.settlement_before_contract', 'The change of ownership cannot be before the sale contract.'],
  ['downsizer.contribution_before_settlement', 'Enter a downsizer contribution made on or after the change of ownership.']]);

/** `work`, a downsizer refusal worded for the form. @template T @param {string} year @param {() => T} work @returns {T} */
function worded(year, work) {
  try {
    return work();
  } catch (error) {
    const code = /** @type {{code?: string}} */ (error).code;
    throw new Error(formMessages(year).get(String(code)) ?? /** @type {Error} */ (error).message);
  }
}

/** The catch-up form's downsizer inputs as the command names them, or null when no downsizer contribution is given.
 * @param {(name: string) => string} value @returns {Record<string, unknown> | null} */
export function downsizerFormArgs(value) {
  if (value('downsizer') !== 'yes') return null;
  const age = value('downsizer-age').trim();
  const amount = (/** @type {string} */ name) => value(`downsizer-${name}`).trim();
  return { downsizer_contribution: amount('amount'), downsizer_contribution_date: value('downsizer-made'),
    downsizer_age: /^\d+$/.test(age) ? Number(age) : age, downsizer_contract_date: value('downsizer-contract'),
    downsizer_settlement_date: value('downsizer-settled'), downsizer_longer_period_allowed: value('downsizer-longer') === 'yes',
    downsizer_capital_proceeds: amount('proceeds'), downsizer_earlier_own: amount('earlier-own'),
    downsizer_earlier_from_proceeds: amount('earlier-proceeds'), downsizer_conditions_met: value('downsizer-conditions') === 'yes' };
}

/** The command's reading of the form's downsizer inputs, a refusal worded for the form.
 * @param {Record<string, unknown>} given @param {string} year */
export const readDownsizerForm = (given, year) => worded(year, () => readDownsizerInputs(given));

/** The catch-up form's downsizer rows and note, or none when no downsizer contribution is given.
 * @param {Record<string, unknown> | null} given @param {string} year @param {(amount: number) => string} aud */
export function downsizerFormPart(given, year, aud) {
  if (given === null) return { rows: [], notes: [], inputs: '' };
  const { eligible, tests: rows, amounts } = worded(year, () => downsizer(given, year));
  const failed = rows.filter((test) => !test.met).map((test) => `${test.finding} (${test.authority})`);
  return { rows: [['Downsizer contribution covered, outside both caps', aud(Number(amounts.downsizer_covered))],
    ['Downsizer contribution not covered', aud(Number(amounts.downsizer_not_covered))],
    ['Left of the $300,000 downsizer limit', aud(Number(amounts.downsizer_cap_remaining))],
    ['Left of the capital proceeds', aud(Number(amounts.downsizer_proceeds_remaining))]],
  notes: [eligible ? 'The downsizer contribution is covered up to the lesser of the 2 limits (s 292-102(3))'
    : `The downsizer contribution is not covered: ${failed.join('; ')}`],
  inputs: `, downsizer contribution ${aud(Number(given.downsizer_contribution))}` };
}
