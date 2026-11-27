// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Reading the employee share scheme calculator's interests as the `ess-discount` command of
// ryanduguid/australian-accounting reads them (its engine/ess_discount/input.rs): each fact checked once, in the
// command's order, and a fact the interest's other facts do not call for refused.

import { cmp, day, incomeYear, lit, on, refuse } from './ess-core.mjs';
import { rightValue } from './ess-valuation.mjs';

/** @typedef {import('./ess-core.mjs').Dec} Dec */

/** The most interest parcels one call takes. */
export const MAX_INTERESTS = 50;
export const INVALID = 'ess_discount.interests_invalid';

/** The characters Python's `str.strip()` removes. */
const SPACE = new Set([...'\t\n\v\f\r\x1c\x1d\x1e\x1f \x85\xa0\u1680\u2028\u2029\u202f\u205f\u3000'].concat(
  Array.from({ length: 11 }, (_, i) => String.fromCodePoint(0x2000 + i))));

/** Python's `str.strip()`. @param {string} text */
function pyStrip(text) {
  const chars = [...text];
  let [from, to] = [0, chars.length];
  while (from < to && SPACE.has(chars[from])) from += 1;
  while (to > from && SPACE.has(chars[to - 1])) to -= 1;
  return chars.slice(from, to).join('');
}

/** An amount as the command's `stated::amount` reads it: a decimal string of at most 32 bytes, finite, nil or more
 * (a negative zero is kept), at most 2 places and $1,000,000,000,000; null when it is not one. @param {unknown} value */
export function amountOf(value) {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > 32) return null;
  const text = pyStrip(value);
  const neg = text.startsWith('-');
  const parts = (neg ? text.slice(1) : text).split('.');
  const fraction = parts.length === 2 ? parts[1] : '';
  const plain = (/** @type {string} */ part) => /^\d+$/.test(part);
  if (parts.length > 2 || !plain(parts[0]) || (parts.length === 2 && !plain(fraction))) return null;
  const v = { neg, c: BigInt(parts[0] + fraction), e: -fraction.length };
  return (neg && v.c !== 0n) || v.e < -2 || cmp(v, lit('1000000000000')) > 0 ? null : v;
}

/** One object's stated facts, each read once, with the keys read. */
export class Reader {
  /** @param {string} name @param {unknown} value */
  constructor(name, value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) refuse(INVALID, `${name} must be an object.`);
    this.name = name;
    this.fields = new Map(Object.entries(/** @type {object} */ (value)));
    /** @type {Set<string>} */
    this.taken = new Set();
  }

  /** @param {string} key @param {string} expected @returns {never} */
  invalid(key, expected) {
    return refuse(INVALID, `${this.name}: ${key} must be ${expected}.`);
  }

  /** @param {string} key */
  has(key) {
    return this.fields.has(key);
  }

  /** @param {string} key */
  value(key) {
    this.taken.add(key);
    if (!this.fields.has(key)) refuse('input.missing_field', `${this.name}: ${key} is required`);
    return this.fields.get(key);
  }

  /** @param {string} key @returns {Dec} */
  amount(key) {
    const v = amountOf(this.value(key));
    if (v === null) {
      refuse('input.amount_invalid', `${this.name}: ${key} must be a decimal string, finite and non-negative, at most 2dp and 1e12.`);
    }
    return v;
  }

  /** @param {string} key */
  flag(key) {
    const v = this.value(key);
    return typeof v === 'boolean' ? v : this.invalid(key, 'a boolean');
  }

  /** A date, or null for `null` where `nullable`. @param {string} key @param {boolean} [nullable] @returns {number | null} */
  day(key, nullable = false) {
    const v = this.value(key);
    if (v === null && nullable) return null;
    const n = day(v);
    return n === null ? this.invalid(key, nullable ? 'a YYYY-MM-DD date or null' : 'a YYYY-MM-DD date') : n;
  }

  /** @param {string} key */
  date(key) {
    return /** @type {number} */ (this.day(key));
  }

  /** @param {string} key @param {string[]} allowed */
  choice(key, allowed) {
    const v = this.value(key);
    return allowed.includes(/** @type {string} */ (v)) ? /** @type {string} */ (v) : this.invalid(key, `one of ${allowed.join(', ')}`);
  }

  /** A nested object, or null. @param {string} key */
  object(key) {
    const v = this.value(key);
    return v === null ? null : new Reader(`${this.name} ${key}`, v);
  }

  /** Refuses a key not read, `why` saying what calls for the facts read. @param {string} why */
  finish(why) {
    const key = [...this.fields.keys()].find((k) => !this.taken.has(k));
    if (key !== undefined) refuse('input.field_unknown', `${this.name}: ${key} is not an input of ${why}`);
  }
}

/** @typedef {{exercisePrice: Dec, shareMarketValue: Dec, last: number}} RightTerms */
/** @typedef {{unlisted: boolean, underTenYears: boolean, turnover: Dec, employerResident: boolean}} StartUp */
/** @typedef {{employed: boolean, ordinarySharesOnly: boolean, notShareTradingCompany: boolean, minimumHoldingPeriod: boolean,
 *   tenPercentLimit: boolean, nonDiscriminatory: boolean, realRisk: boolean, broadAvailability: boolean,
 *   salarySacrifice: boolean, deferralStated: boolean, startUp: StartUp | null}} Conditions */
/** @typedef {{consideration: Dec, value: Dec, valuation: Record<string, unknown> | null, right: RightTerms | null,
 *   conditions: Conditions, reader: Reader}} Held */
/** @typedef {{cause: string, protectsAgainstFall: boolean, considerationReceived: boolean, amountIncluded: Dec,
 *   yearIncluded: string}} Forfeiture */
/** @typedef {{number: number, kind: 'share' | 'right', acquired: number, held: Held | null,
 *   forfeited: Forfeiture | null}} Interest */

/** A right's terms, as totals for the parcel. @param {Reader} reader @param {number} acquired @returns {RightTerms} */
function rightTerms(reader, acquired) {
  const exercisePrice = reader.amount('exercise_price');
  const shareMarketValue = reader.amount('share_market_value');
  const last = reader.date('last_exercise_day');
  if (last < acquired) refuse('ess_discount.dates_inconsistent', `${reader.name}: last_exercise_day is before acquired.`);
  return { exercisePrice, shareMarketValue, last };
}

/** The scheme and personal conditions, each the subsection it states. @param {Reader} c @param {boolean} share
 * @returns {Conditions} */
function conditions(c, share) {
  const out = {
    employed: c.flag('employed'), ordinarySharesOnly: c.flag('ordinary_shares_only'),
    notShareTradingCompany: c.flag('not_share_trading_company'), minimumHoldingPeriod: c.flag('minimum_holding_period'),
    tenPercentLimit: c.flag('ten_percent_limit'), nonDiscriminatory: c.flag('non_discriminatory'),
    realRisk: c.flag('real_risk_of_forfeiture'), broadAvailability: share ? c.flag('broad_availability') : false,
    salarySacrifice: c.flag('salary_sacrifice'), deferralStated: share ? false : c.flag('deferral_stated'), startUp: null,
  };
  c.finish(share ? 'the conditions of a share' : 'the conditions of a right');
  // s 83A-105(4)(b)(ii): a scheme offering this right is not one subsection (4) applies to.
  if (!share && out.salarySacrifice && !out.realRisk) {
    refuse(INVALID, `${c.name}: a right without a real risk of forfeiture cannot meet s 83A-105(4)(b)(ii), `
      + 'which salary_sacrifice states.');
  }
  return out;
}

/** s 83A-33's company facts, or null. @param {Reader} reader @returns {StartUp | null} */
function startUp(reader) {
  const s = reader.object('start_up');
  if (s === null) return null;
  const out = { unlisted: s.flag('unlisted'), underTenYears: s.flag('incorporated_under_10_years'),
    turnover: s.amount('aggregated_turnover'), employerResident: s.flag('employer_australian_resident') };
  s.finish('start_up');
  return out;
}

/** A held interest's facts. @param {Reader} reader @param {boolean} share @param {number} acquired @returns {Held} */
function held(reader, share, acquired) {
  const consideration = reader.amount('consideration');
  const right = share ? null : rightTerms(reader, acquired);
  const regulations = right !== null && reader.choice('valuation', ['market_value', 'regulations']) === 'regulations';
  const [value, valuation] = right !== null && regulations
    ? rightValue(right.shareMarketValue, right.exercisePrice, acquired, right.last, acquired)
    : [reader.amount('market_value'), null];
  const c = reader.object('conditions') ?? reader.invalid('conditions', 'an object');
  const stated = conditions(c, share);
  stated.startUp = startUp(reader);
  return { consideration, value, valuation, right, conditions: stated, reader };
}

/** The causes of a forfeiture or loss the command takes. */
export const CAUSES = ['scheme_condition', 'ceased_employment', 'lapsed_unexercised', 'cancellation_allowed', 'other_choice'];

/** The income year the amount was included in: from the acquisition's year to 2026-27. @param {Reader} f
 * @param {number} acquired */
function includedYear(f, acquired) {
  const first = Number(incomeYear(acquired).slice(0, 4));
  const given = f.value('year_included');
  const years = Array.from({ length: Math.max(0, 2027 - first) }, (_, i) => incomeYear(on(`${first + i}-07-01`)));
  return years.includes(/** @type {string} */ (given)) ? /** @type {string} */ (given)
    : f.invalid('year_included', `an income year from ${incomeYear(acquired)} to 2026-27`);
}

/** A forfeited interest's facts. @param {Reader} reader @param {boolean} share @param {number} acquired
 * @returns {Forfeiture} */
function forfeiture(reader, share, acquired) {
  const f = reader.object('forfeiture') ?? reader.invalid('forfeiture', 'an object');
  const cause = f.choice('cause', CAUSES);
  if (share && (cause === 'lapsed_unexercised' || cause === 'cancellation_allowed')) {
    f.invalid('cause', 'scheme_condition, ceased_employment or other_choice for a share');
  }
  const out = { cause, protectsAgainstFall: f.flag('protects_against_fall'), considerationReceived: f.flag('consideration_received'),
    amountIncluded: f.amount('amount_included'), yearIncluded: includedYear(f, acquired) };
  f.finish('forfeiture');
  reader.finish('a forfeited interest');
  return out;
}

/** One interest. @param {number} number @param {unknown} item @returns {Interest} */
function interest(number, item) {
  const reader = new Reader(`interest ${number}`, item);
  const kind = /** @type {'share' | 'right'} */ (reader.choice('kind', ['share', 'right']));
  const acquired = reader.date('acquired');
  if (acquired < on('2015-07-01')) {
    refuse('ess_discount.acquired_before_2015', `${reader.name}: acquired before 2015-07-01; such interests have a 7-year `
      + 'deferral, no start-up concession and a narrower forfeiture rule, which this worksheet does not apply.');
  }
  const share = kind === 'share';
  if (reader.has('forfeiture')) return { number, kind, acquired, held: null, forfeited: forfeiture(reader, share, acquired) };
  return { number, kind, acquired, held: held(reader, share, acquired), forfeited: null };
}

/** The interests, 1 to 50 objects, each read in full in turn. @param {unknown} given @returns {Interest[]} */
export function interests(given) {
  if (!Array.isArray(given) || given.length === 0 || given.length > MAX_INTERESTS) {
    refuse(INVALID, `interests must be a list of 1 to ${MAX_INTERESTS} objects.`);
  }
  return given.map((item, i) => interest(i + 1, item));
}
