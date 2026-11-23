// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// GIC_QUARTERS is read inside functions only: business-calculators.mjs is a large module.
import { GIC_QUARTERS } from './business-calculators.mjs';

// One person's transfer balance account from its credit and debit events to a day, as the
// `transfer-balance` command of ryanduguid/australian-accounting works it, from the same input, with
// its exact arithmetic, rounding and refusal codes: the personal transfer balance cap with
// proportional indexation, each day's excess, excess transfer balance earnings credited at the start
// of the next day, and excess transfer balance tax for each excess transfer balance period. An
// estimate: it takes no determination or notice of the Commissioner's. The command's sources, read for it on
// 22 November 2026:
// - ITAA 1997 ss 294-15 to 294-55, 294-80, 294-85, 294-90, 294-230 and 294-235 (the ATO's legal
//   database); IT(TP)A 1997 ss 294-30 and 294-55 (compilation 104).
// - Superannuation (Excess Transfer Balance Tax) Imposition Act 2016 s 5.
// - The ATO's 'Calculating your personal transfer balance cap' (last updated 31 March 2026), 'Transfer
//   balance account' (18 June 2025), 'Excess transfer balance' (7 February 2025) and 'General interest
//   charge (GIC) rates' (4 September 2026).
// The balance is carried exactly as a ratio of cents; each amount shows rounded half up to the cent.

const DAY = 86400000;
/** The financial years of `to` the command works: accounts start on 1 July 2017, and the general cap
 * for 2027-28 is not yet known. */
export const TBA_YEARS = ['2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
/** The general transfer balance cap in dollars for each financial year (s 294-35(3)). */
export const GENERAL_CAPS = /** @type {Record<string, number>} */ ({
  '2017-18': 1600000, '2018-19': 1600000, '2019-20': 1600000, '2020-21': 1600000, '2021-22': 1700000,
  '2022-23': 1700000, '2023-24': 1900000, '2024-25': 1900000, '2025-26': 2000000, '2026-27': 2100000,
});
/** The credits and debits the command takes: [kind, credit, the page's name]. */
export const TBA_KINDS = /** @type {const} */ ([
  ['existing_income_stream', true, 'Income stream held just before 1 July 2017 (credit)'],
  ['new_income_stream', true, 'New retirement phase income stream (credit)'],
  ['lrba_repayment', true, 'Limited recourse borrowing repayment, arrangement from 1 July 2017 (credit)'],
  ['commutation', false, 'Commutation (debit)'],
  ['reduced_super', false, 'Fraud, dishonesty or bankruptcy loss (debit)'],
  ['payment_split', false, 'Family law payment split (debit)'],
  ['stopped_retirement_phase', false, 'Income stream stopped being in the retirement phase (debit)'],
]);
/** Events the command refuses, with the reason. */
const REFUSED = new Map([
  ['reversionary_income_stream', 'A reversionary income stream is credited 12 months after benefits first become payable (ITAA 1997 s 294-25(1) items 1(b) and 2(b)); this calculator does not take it.'],
  ['child_recipient', 'A child recipient’s cap is the cap increments of ITAA 1997 Subdiv 294-E, not the general cap; this calculator does not work it.'],
  ['capped_defined_benefit', 'Capped defined benefit income streams have special values and modified credits under ITAA 1997 Subdiv 294-D; this calculator does not work them.'],
  ['structured_settlement', 'A structured settlement contribution’s debit (ITAA 1997 s 294-80(1) item 2) is not worked by this calculator.'],
  ['regulation_credit', 'Credits under regulations (ITAA 1997 s 294-25(1) item 5) are not worked by this calculator.'],
  ['regulation_debit', 'Debits under regulations (ITAA 1997 s 294-80(1) item 8) are not worked by this calculator.'],
  ['excess_determination', 'An excess transfer balance determination stops earnings credits (ITAA 1997 s 294-25(2)); this calculator gives an estimate without one.'],
  ['commutation_authority', 'A commutation authority follows the Commissioner’s determination; this calculator does not take determinations or authorities.'],
  ['non_commutable_notice', 'A notice of non-commutable excess transfer balance (ITAA 1997 s 294-80(1) item 7) is the Commissioner’s; this calculator does not take it.'],
]);
const INPUTS = ['events', 'to', 'previously_liable', 'year', 'scope_confirmed'];
const GIC_TABLE_END = '2026-12-31';

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
export function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}
/** @param {string} message @returns {never} */
const factInvalid = (message) => refuse('transfer_balance.fact_invalid', message);
/** @param {string} message @returns {never} */
const dateOrder = (message) => refuse('transfer_balance.date_order', message);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** The day number of a YYYY-MM-DD date from 1900 to 2100, or null. @param {unknown} text */
export function dayOf(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  const day = Date.UTC(y, m - 1, d) / DAY;
  return y >= 1900 && y <= 2100 && isoOf(day) === text ? day : null;
}
/** @param {number} day */
export const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** The first calendar year of a day's financial year. @param {number} day */
export const yearOf = (day) => { const d = new Date(day * DAY); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
/** @param {number} start */
export const label = (start) => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
/** The days in a day's calendar year. @param {number} day */
export const yearLength = (day) => { const y = new Date(day * DAY).getUTCFullYear(); return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 366 : 365; };
/** @param {number} start */
const generalCap = (start) => /** @type {number} */ (GENERAL_CAPS[label(start)]);

/** @type {{rows: [number, number][], end: number} | undefined} */
let table;
/** The published GIC rate for a day in hundredths of 1%, or null. @param {number} day */
export function gicOn(day) {
  table ??= { rows: GIC_QUARTERS.map(([from, rate]) => [/** @type {number} */ (dayOf(from)), Math.round(Number(rate) * 100)]),
    end: /** @type {number} */ (dayOf(GIC_TABLE_END)) };
  if (day > table.end) return null;
  let found = null;
  for (const [from, rate] of table.rows) {
    if (from > day) break;
    found = rate;
  }
  return found;
}
export { GIC_TABLE_END };

/** An exact `num / den` cents as dollars to the cent, rounded half up away from nil.
 * @param {bigint} num @param {bigint} den */
export function dollarsText(num, den) {
  const magnitude = num < 0n ? -num : num;
  const cents = (2n * magnitude + den) / (2n * den);
  const text = String(cents).padStart(3, '0');
  return `${num < 0n && cents > 0n ? '-' : ''}${text.slice(0, -2)}.${text.slice(-2)}`;
}

/** The first key of `fields` outside `allowed`, refused. @param {Record<string, unknown>} fields @param {string} item
 * @param {string} what @param {readonly string[]} allowed */
export function knownKeys(fields, item, what, allowed) {
  const extra = Object.keys(fields).find((key) => !allowed.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${item}: ${extra} is not an input of ${what}.`);
}
/** @param {Record<string, unknown>} fields @param {string} item @param {string} key */
export function required(fields, item, key) {
  if (!Object.hasOwn(fields, key)) refuse('input.missing_field', `${item}: enter ${key.replaceAll('_', ' ')}.`);
  return new Map(Object.entries(fields)).get(key);
}
/** A stated amount in cents: a decimal string of at most 32 bytes, finite, from 0 to 1,000,000,000,000,
 * at most 2 decimal places, as the command's reader takes it. @param {Record<string, unknown>} fields
 * @param {string} item @param {string} key @param {string} [range] the range the message states */
/** A decimal's sign, whole digits and decimal digits, or null unless it reads as -?digits(.digits)?.
 * @param {string} text */
export function decimalParts(text) {
  const negative = text.startsWith('-');
  const [whole, decimals, extra] = (negative ? text.slice(1) : text).split('.');
  const digits = /^\d+$/;
  if (extra !== undefined || !digits.test(whole) || (decimals !== undefined && !digits.test(decimals))) return null;
  return { negative, whole, decimals: decimals ?? '' };
}
/** The range stated for an amount the command then refuses at nil. */
export const ABOVE_NIL = 'above nil, up to 1,000,000,000,000';
export function statedAmount(fields, item, key, range = 'from 0 to 1,000,000,000,000') {
  const value = required(fields, item, key);
  const parts = typeof value === 'string' && new TextEncoder().encode(value).length <= 32 ? decimalParts(value.trim()) : null;
  const cents = parts && parts.decimals.length <= 2 ? BigInt(parts.whole + parts.decimals.padEnd(2, '0')) : null;
  if (cents === null || (parts?.negative && cents !== 0n) || cents > 100000000000000n) {
    refuse('input.amount_invalid', `${item}: enter ${key.replaceAll('_', ' ')} in dollars and cents, ${range}.`);
  }
  return cents;
}
/** The input's keys and its required fields, refused as the command's reader refuses them.
 * @param {unknown} given @param {readonly string[]} inputs @param {readonly string[]} takes */
export function readInput(given, inputs, takes = inputs) {
  if (!isObject(given)) refuse('input.not_object', 'The input is not an object.');
  knownKeys(given, 'input', 'this calculator', takes);
  for (const key of inputs) if (!Object.hasOwn(given, key)) refuse('input.missing_field', `Enter ${key.replaceAll('_', ' ')}.`);
  return given;
}
/** The confirmed scope and a supported year. @param {Record<string, unknown>} input @param {readonly string[]} years */
export function scope(input, years) {
  if (input.scope_confirmed !== true) refuse('scope.not_confirmed', 'Confirm the facts the calculator takes as given.');
  const year = years.find((y) => y === input.year);
  if (year === undefined) refuse('period.unsupported', `Choose an income year from ${years[0]} to ${years.at(-1)}.`);
  return year;
}

/** @typedef {{day: number, kind: string, credit: boolean, cents: bigint}} TbaEvent */
/** @param {unknown} value @param {string} item @returns {TbaEvent} */
function event(value, item) {
  if (!isObject(value)) factInvalid(`${item} must be an object.`);
  knownKeys(value, item, 'an event', ['date', 'kind', 'amount']);
  const day = dayOf(required(value, item, 'date'));
  if (day === null) factInvalid(`${item}: the date must be a date.`);
  const name = required(value, item, 'kind');
  const why = typeof name === 'string' ? REFUSED.get(name) : undefined;
  if (why !== undefined) refuse('transfer_balance.event_refused', `${item}: ${why}`);
  const kind = TBA_KINDS.find(([k]) => k === name);
  if (kind === undefined) factInvalid(`${item}: choose a credit or debit the calculator takes.`);
  const cents = statedAmount(value, item, 'amount', ABOVE_NIL);
  if (cents <= 0n) factInvalid(`${item}: the amount must be above nil.`);
  return { day, kind: kind[0], credit: kind[1], cents };
}

const START = /** @type {number} */ (dayOf('2017-07-01'));
const TRANSITION_END = /** @type {number} */ (dayOf('2017-12-31'));
const SECOND_RATE_FROM = /** @type {number} */ (dayOf('2018-07-01'));

/** The events in date order, checked against the account's start and `to`. @param {unknown} list @param {number} to */
function events(list, to) {
  if (!Array.isArray(list) || list.length === 0 || list.length > 1000) factInvalid('Give 1 to 1000 events.');
  const out = list.map((value, i) => event(value, `event ${i + 1}`));
  out.forEach((e, i) => {
    const item = `event ${i + 1}`;
    if (e.day < START) dateOrder(`${item}: no event arises before 1 July 2017 (ITAA 1997 s 294-15(2)).`);
    if (e.kind === 'existing_income_stream' && e.day !== START) dateOrder(`${item}: an income stream held just before 1 July 2017 is credited on 1 July 2017 (s 294-25(1) item 1).`);
    if (e.day > to) dateOrder(`${item} is after the last day; give a last day on or after every event.`);
  });
  const first = Math.min(...out.map((e) => e.day));
  if (!out.some((e) => e.day === first && (e.kind === 'existing_income_stream' || e.kind === 'new_income_stream'))) {
    dateOrder('The first event’s day must have an income stream credit: the account starts when you first become a retirement phase recipient (ITAA 1997 s 294-15).');
  }
  return out.map((e, i) => /** @type {const} */ ([e, i])).sort((a, b) => a[0].day - b[0].day || a[1] - b[1]).map(([e]) => e);
}

/** Whether IT(TP)A 1997 s 294-30 disregards the excess from 1 July to 31 December 2017.
 * @param {TbaEvent[]} list @param {number} to */
function transitional(list, to) {
  const window = list.filter((e) => e.day <= TRANSITION_END);
  const credits = window.filter((e) => e.credit);
  if (credits.some((e) => e.kind !== 'existing_income_stream')) return false;
  const sum = credits.reduce((s, e) => s + e.cents, 0n);
  if (sum <= 160000000n || sum > 170000000n) return false;
  if (to < TRANSITION_END) {
    refuse('transfer_balance.transition_undecided', 'IT(TP)A 1997 s 294-30 may disregard this excess, which depends on every credit and debit to 31 December 2017; give a last day on or after 31 December 2017.');
  }
  return window.filter((e) => !e.credit).reduce((s, e) => s + e.cents, 0n) >= sum - 160000000n;
}

/** @typedef {{year: string, general: number, cap: number, why: 'start' | 'flat' | 'exceeded' | 'indexed',
 *   highest?: string, highestOn?: string, capThen?: number, unused?: number, increase?: number}} CapRow */
/** @typedef {{date: string, kind: string, debit: string, credit: string, balance: string}} LedgerRow */
/** @typedef {{from: string, to: string, days: number, earnings: string, rate: number, tax: string}} PeriodRow */
/** @typedef {{year: string, to: string, amounts: Record<string, string>, rates: Record<string, string>, caps: CapRow[],
 *   ledger: LedgerRow[], periods: PeriodRow[], inExcess: boolean}} TbaWorked */

/** The account: the command's input in, its amounts, caps, ledger and excess periods out.
 * @param {unknown} given @returns {TbaWorked} */
export function transferBalance(given) {
  const input = readInput(given, INPUTS);
  const year = scope(input, TBA_YEARS);
  const to = dayOf(input.to);
  if (to === null) factInvalid('Enter the last day as a date.');
  if (label(yearOf(to)) !== year) refuse('transfer_balance.year_mismatch', `The last day is in ${label(yearOf(to))}, not ${year}.`);
  if (typeof input.previously_liable !== 'boolean') refuse('input.flag_invalid', 'Say whether you were liable for an earlier period.');
  const list = events(input.events, to);
  const disregard = transitional(list, to);
  let [num, den, pending] = [0n, 1n, 0n];
  let start = yearOf(list[0].day);
  let cap = generalCap(start);
  let exceeded = false;
  let open = false;
  /** @type {{cents: bigint, day: number, cap: number} | null} */
  let highest = null;
  /** @type {CapRow[]} */
  const caps = [{ year: label(start), general: cap, cap, why: 'start' }];
  /** @type {LedgerRow[]} */
  const ledger = [];
  /** @type {{from: number, to: number, earnings: bigint}[]} */
  const periods = [];
  const index = (/** @type {number} */ next) => {
    const increase = generalCap(next) - generalCap(next - 1);
    /** @type {CapRow} */
    const row = { year: label(next), general: generalCap(next), cap, why: 'flat' };
    let raised = 0;
    if (increase > 0 && exceeded) row.why = 'exceeded';
    else if (increase > 0) {
      const unused = highest === null || highest.cents < 0n ? 100 : 100 - Number((highest.cents * 100n) / (BigInt(highest.cap) * 100n));
      if (highest) Object.assign(row, { highest: dollarsText(highest.cents, 1n), highestOn: isoOf(highest.day), capThen: highest.cap });
      Object.assign(row, { why: 'indexed', unused, increase });
      raised = Math.trunc((increase * unused) / 100);
    }
    cap += raised;
    start = next;
    row.cap = cap;
    caps.push(row);
  };
  for (let day = list[0].day; day <= to; day += 1) {
    if (yearOf(day) !== start) index(yearOf(day));
    num += pending;
    pending = 0n;
    for (const e of list.filter((x) => x.day === day)) {
      num += e.credit ? e.cents * den : -e.cents * den;
      ledger.push({ date: isoOf(day), kind: e.kind, debit: dollarsText(e.credit ? 0n : e.cents, 1n),
        credit: dollarsText(e.credit ? e.cents : 0n, 1n), balance: dollarsText(num, den) });
    }
    const over = num - BigInt(cap * 100) * den;
    if (over > 0n) exceeded = true;
    else if (!exceeded && (highest === null || num > highest.cents)) highest = { cents: num, day, cap };
    if (over > 0n && !(disregard && day <= TRANSITION_END)) {
      const gic = gicOn(day);
      if (gic === null) {
        refuse('transfer_balance.rate_unpublished', `The excess at the end of ${isoOf(day)} needs that day’s GIC rate, which the ATO has published only to ${GIC_TABLE_END}.`);
      }
      const scale = BigInt(10000 * yearLength(day));
      num *= scale;
      den *= scale;
      for (const p of periods) p.earnings *= scale;
      const earned = over * BigInt(gic);
      if (!open) periods.push({ from: day, to: day, earnings: 0n });
      open = true;
      const period = /** @type {{from: number, to: number, earnings: bigint}} */ (periods.at(-1));
      period.to = day;
      period.earnings += earned;
      pending = earned;
    } else open = false;
  }
  const taxed = taxPeriods(periods, den, input.previously_liable);
  return { year, to: isoOf(to), amounts: totals(num, den, cap, taxed), rates: { general_transfer_balance_cap: String(generalCap(yearOf(to))) },
    caps, ledger, periods: taxed.rows, inExcess: open };
}

/** Each excess period's earnings and tax: 15%, or 30% for a period from 1 July 2018 once liable for an earlier one.
 * @param {{from: number, to: number, earnings: bigint}[]} periods @param {bigint} den @param {boolean} wasLiable */
function taxPeriods(periods, den, wasLiable) {
  let liable = wasLiable;
  let [earnings, tax] = [0n, 0n];
  const rows = periods.map((p) => {
    const second = liable && p.from >= SECOND_RATE_FROM;
    liable ||= p.from >= SECOND_RATE_FROM;
    const rate = second ? 30 : 15;
    const owed = p.earnings * BigInt(rate);
    earnings += p.earnings;
    tax += owed;
    return { from: isoOf(p.from), to: isoOf(p.to), days: p.to - p.from + 1, earnings: dollarsText(p.earnings, den), rate,
      tax: dollarsText(owed, den * 100n) };
  });
  return { rows, earnings, tax };
}

/** The command's amounts from the balance over `den` and the cap in dollars.
 * @param {bigint} num @param {bigint} den @param {number} cap @param {{earnings: bigint, tax: bigint}} taxed */
function totals(num, den, cap, taxed) {
  const capUnits = BigInt(cap * 100) * den;
  return {
    transfer_balance: dollarsText(num, den), transfer_balance_cap: `${cap}.00`,
    cap_space: dollarsText(capUnits > num ? capUnits - num : 0n, den), excess_transfer_balance: dollarsText(num > capUnits ? num - capUnits : 0n, den),
    notional_earnings: dollarsText(taxed.earnings, den), excess_transfer_balance_tax: dollarsText(taxed.tax, den * 100n),
  };
}
