// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { borrowingSchedule } from './borrowing-expenses.mjs';
import { RESIDENT_SCALES } from './income-tax.mjs';

// One residential rental property's income and deductions for one owner and income year, 2020-21 to
// 2026-27, the net rent and, for 2024-25 to 2026-27, its effect on tax at the resident scale: the
// `rental-property` command of ryanduguid/australian-accounting ported line for line (its inputs,
// order of refusals, refusal codes and its 28-digit decimal working, each line rounded half up to the
// cent). Its sources, read 22 November 2026: ITAA 1997 ss 6-5, 8-1, 26-31, 40-27, 43-15, 43-20,
// 43-25, 43-210, 43-215, 43-220, 43-230, 43-235 and 43-240 at the ATO's legal database; Act No. 126
// of 2017 Schedule 2 item 13; TR 2000/2; TR 93/32; and the ATO's Rental properties guide 2026 (NAT
// 1729-06.2026). Borrowing expenses come from the borrowing expenses calculator's port of
// `borrowing-expenses-schedule`, or as the year's figure it gives; the resident scale is the income
// tax calculator's.

export const RENTAL_READ = '2026-11-22';
export const RENTAL_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
/** The worksheet's expense lines entered as amounts (Rental properties guide 2026, Example 33), as the page names them. */
export const RENTAL_LINES = {
  advertising_for_tenants: 'Advertising for tenants',
  body_corporate_fees: 'Body corporate fees and charges',
  cleaning: 'Cleaning',
  council_rates: 'Council rates',
  gardening: 'Gardening and lawn mowing',
  insurance: 'Insurance',
  land_tax: 'Land tax',
  legal_expenses: 'Legal expenses',
  pest_control: 'Pest control',
  property_agent_fees: 'Property agent fees and commission',
  repairs_and_maintenance: 'Repairs and maintenance',
  stationery_telephone_postage: 'Stationery, telephone and postage',
  travel: 'Travel',
  water_charges: 'Water charges',
  sundry: 'Sundry rental expenses',
};
const CATEGORIES = Object.keys(RENTAL_LINES);
const INCOME = ['rental_income', 'other_rental_income'];
const REQUIRED = ['ownership_share', 'acquired', 'disposed', 'days_available', 'section_26_50_applies', 'income', 'expenses',
  'rental_only_expenses', 'loans', 'capital_works', 'depreciating_assets', 'year'];
const INPUT_FIELDS = [...REQUIRED, 'borrowing_loans', 'borrowing_expenses', 'other_taxable_income', 'scope_confirmed'];
const LOAN_FACTS = [['interest', true], ['principal_for_rental', true], ['principal_total', true], ['redrawn_in_year', true]];
const WORKS_FACTS = [['construction_expenditure', true], ['kind', true], ['began', true], ['first_used', true],
  ['taken_to_begin_before_16_september_1987', false]];
const ASSET_FACTS = [['decline_in_value', true], ['acquired', true], ['first_used', true], ['held_when_first_used', true],
  ['residence_or_private_use', true], ['low_value_pool', true], ['new_premises_exception', false], ['deductible_in_2016_17', false]];
// Results are dollars as JavaScript numbers, which hold every cent only below 2^46 dollars.
const SAFE_CENTS = 100n * (1n << 46n);
const MAX_AMOUNT_CENTS = 100000000000000n;

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}
/** @param {string} message @returns {never} */
function conflict(message) { return refuse('rental_property.fact_conflict', message); }
/** @param {string} message @returns {never} */
function invalid(message) { return refuse('rental_property.fact_invalid', message); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Runs `work`, putting `label: ` before a refusal's message. @template T @param {string} label @param {() => T} work @returns {T} */
function at(label, work) {
  try {
    return work();
  } catch (error) {
    if (error instanceof Error && 'code' in error) error.message = `${label}: ${error.message}`;
    throw error;
  }
}

// A decimal is [coefficient, exponent], its value coefficient x 10^exponent. Products, quotients and
// sums are rounded to 28 significant digits half even, the command's decimal context. Every decimal worked here is
// nil or positive: the inputs are checked before any arithmetic (amounts, the legal interest above nil, other taxable
// income from nil), and the one difference taken, the undeducted construction expenditure, is taken only when it is
// not negative.
/** @typedef {[bigint, number]} Dec */
const PRECISION = 28;
const abs = (/** @type {bigint} */ n) => (n < 0n ? -n : n);
/** @param {Dec} d @returns {Dec} */
function fix([c, e]) {
  const digits = c.toString().length;
  if (digits <= PRECISION) return [c, e];
  const p = 10n ** BigInt(digits - PRECISION);
  let q = c / p;
  const r = c % p;
  if (2n * r > p || (2n * r === p && q % 2n === 1n)) q += 1n;
  return [q, e + digits - PRECISION];
}
/** @type {Dec} */
const RATE_4 = [4n, -2];
/** @type {Dec} */
const RATE_2_5 = [25n, -3];
/** @param {Dec} a @param {Dec} b @returns {Dec} */
const mul = (a, b) => fix([a[0] * b[0], a[1] + b[1]]);
/** @param {Dec} a @param {Dec} b @returns {[bigint, bigint, number]} both coefficients at the smaller exponent */
const aligned = (a, b) => {
  const e = Math.min(a[1], b[1]);
  return [a[0] * 10n ** BigInt(a[1] - e), b[0] * 10n ** BigInt(b[1] - e), e];
};
/** @param {Dec} a @param {Dec} b @returns {Dec} */
const add = (a, b) => { const [x, y, e] = aligned(a, b); return fix([x + y, e]); };
/** @param {Dec} a @param {Dec} b @returns {Dec} */
const sub = (a, b) => add(a, [-b[0], b[1]]);
/** @param {Dec} a @param {Dec} b @returns {number} -1, 0 or 1 */
const cmp = (a, b) => { const [x, y] = aligned(a, b); return x < y ? -1 : x > y ? 1 : 0; };
/** a / b, as Python's decimal divides: prec + 1 digits and a sticky last digit, then rounded half even. Each dividend is
 * a product or quotient, so it has at most 28 digits and the shift is at least 2. @param {Dec} a @param {Dec} b @returns {Dec} */
function div(a, b) {
  if (a[0] === 0n) return [0n, 0];
  const shift = b[0].toString().length - a[0].toString().length + PRECISION + 1;
  const [num, den] = [a[0] * 10n ** BigInt(shift), b[0]];
  let q = num / den;
  if (num % den !== 0n && q % 5n === 0n) q += 1n;
  return fix([q, a[1] - b[1] - shift]);
}
/** The value in whole cents, rounded half up. @param {Dec} d @returns {bigint} */
function cents([c, e]) {
  if (e >= -2) return c * 10n ** BigInt(e + 2);
  const p = 10n ** BigInt(-2 - e);
  return c / p + (2n * (c % p) >= p ? 1n : 0n);
}
/** @param {bigint} c cents @returns {Dec} */
const ofCents = (c) => [c, -2];
/** @param {number | bigint} n @returns {Dec} */
const int = (n) => [BigInt(n), 0];

/** An amount: a decimal string of whole cents from 0 to $1,000,000,000,000, as `money` takes one. @param {unknown} value @param {string} what */
function amount(value, what) {
  const parts = typeof value === 'string' && value.length <= 32 ? /^(\d+)(?:\.(\d{1,2}))?$/.exec(value) : null;
  const c = parts ? BigInt(parts[1] + (parts[2] ?? '').padEnd(2, '0')) : -1n;
  if (c < 0n || c > MAX_AMOUNT_CENTS) refuse('input.amount_invalid', `${what}: enter dollars and cents from 0 to 1,000,000,000,000.`);
  return c;
}
/** A decimal input as the command reads one: text of digits with an optional sign and point, at most 8192 bytes. A legal
 * interest that is not text is an invalid fact, and other taxable income that is not text an invalid amount, as the command
 * refuses them. @param {unknown} value @param {'ownership_share' | 'other_taxable_income'} key @returns {Dec} */
function decimalInput(value, key) {
  if (typeof value !== 'string') {
    if (key === 'ownership_share') invalid('ownership_share must be a decimal fraction above 0 and at most 1.');
    refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  }
  if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', `${key}: decimal input exceeds 8192 bytes`);
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!parts) refuse('input.decimal_unreadable', `${key} must be a decimal number.`);
  const c = BigInt(parts[2] + (parts[3] ?? ''));
  return [parts[1] ? -c : c, -(parts[3] ?? '').length];
}
/** A YYYY-MM-DD date from 1900 to 2100 as a day number, or null. @param {unknown} text */
function dayOf(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  return y >= 1900 && y <= 2100 && new Date(ms).toISOString().slice(0, 10) === text ? ms / 86400000 : null;
}
const isoOf = (/** @type {number} */ day) => new Date(day * 86400000).toISOString().slice(0, 10);
const NINE_MAY_2017 = /** @type {number} */ (dayOf('2017-05-09'));
const END_2016_17 = /** @type {number} */ (dayOf('2017-06-30'));

/** A list item's fields, refusing a fact it does not take or a required one missing.
 * @param {unknown} value @param {string} list @param {(string | boolean)[][]} facts */
function item(value, list, facts) {
  if (!isObject(value)) invalid(`each of ${list} must be an object.`);
  const extra = Object.keys(value).find((k) => !facts.some(([f]) => f === k));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not a fact ${list} takes`);
  const missing = facts.find(([k, req]) => req && !(/** @type {string} */ (k) in value));
  if (missing) refuse('input.missing_field', `${list}: ${missing[0]} is required`);
  return value;
}
/** A boolean fact of a list item, or null when it is not given. @param {Record<string, unknown>} fields @param {string} key */
function itemFlag(fields, key) {
  if (!(key in fields)) return null;
  if (typeof fields[key] !== 'boolean') refuse('input.flag_invalid', `${key} must be yes or no.`);
  return /** @type {boolean} */ (fields[key]);
}
/** @param {Record<string, unknown>} fields @param {string} key */
function itemDay(fields, key) {
  return dayOf(fields[key]) ?? invalid(`${key} must be a YYYY-MM-DD date.`);
}
/** @param {unknown} value @param {string} name @returns {unknown[]} */
const listOf = (value, name) => (Array.isArray(value) ? value : invalid(`${name} must be a list, empty if there are none.`));

/** @typedef {{start: number, end: number, first: number}} Year */
/** @typedef {{from: number, to: number, acquiredInYear: boolean, days: number, available: number}} Held */

/** The days held in the year and the days let or available for rent. @param {Record<string, unknown>} input @param {Year} year @returns {Held} */
function held(input, year) {
  const acquired = dayOf(input.acquired) ?? refuse('input.date_invalid', 'acquired must be a YYYY-MM-DD date from 1900 to 2100.');
  let disposed = null;
  if (typeof input.disposed === 'string') {
    disposed = dayOf(input.disposed) ?? refuse('input.date_invalid', 'disposed must be a YYYY-MM-DD date from 1900 to 2100.');
  } else if (input.disposed !== null) invalid('disposed must be a YYYY-MM-DD date or null.');
  if (acquired > year.end) conflict('The property was acquired after the income year.');
  if (disposed !== null && (disposed < year.start || disposed > year.end || disposed < acquired)) {
    conflict('The day you stopped holding the property must be in the income year and not before you acquired it.');
  }
  const to = disposed ?? year.end;
  const from = Math.max(acquired, year.start);
  const days = to - from + 1;
  const available = input.days_available;
  if (typeof available !== 'number' || !Number.isInteger(available)) invalid('Enter the days let or available for rent as a whole number.');
  if (available < 0 || available > days) conflict(`The days let or available for rent must be from 0 to the ${days} days you held the property in the year.`);
  return { from, to, acquiredInYear: acquired > year.start, days, available };
}

/** The amounts an object gives by line. @param {unknown} value @param {string} name @param {string[]} keys @returns {Map<string, bigint>} */
function lines(value, name, keys) {
  if (!isObject(value)) invalid(`${name} must be an object of amounts by line.`);
  const out = new Map();
  for (const [key, given] of Object.entries(value)) {
    if (!keys.includes(key)) refuse('input.field_unknown', `${key} is not a line of ${name}`);
    out.set(key, amount(given, `${name}.${key}`));
  }
  return out;
}

/** Each expense line: the apportioned part times the time-based share plus the part relating solely to renting, at
 * the legal interest; travel shown and denied (s 26-31). @param {Record<string, unknown>} input @param {Dec} share @param {Held} h */
function expenseLines(input, share, h) {
  const apportioned = lines(input.expenses, 'expenses', CATEGORIES);
  const only = lines(input.rental_only_expenses, 'rental_only_expenses', CATEGORIES);
  /** @type {[string, bigint][]} */
  const out = [];
  for (const key of CATEGORIES) {
    if (!apportioned.has(key) && !only.has(key)) continue;
    const [a, r] = [ofCents(apportioned.get(key) ?? 0n), ofCents(only.get(key) ?? 0n)];
    if (key === 'travel') {
      out.push(['travel', 0n], ['travel_denied', cents(mul(add(a, r), share))]);
      continue;
    }
    out.push([key, cents(add(div(mul(mul(a, share), int(h.available)), int(h.days)), mul(r, share)))]);
  }
  return out;
}

/** The deductible interest on each of the owner's loans: TR 2000/2 paragraphs 15 and 16, then the time-based share.
 * @param {unknown} loans @param {Held} h */
function interest(loans, h) {
  return listOf(loans, 'loans').map((value, i) => at(`loan ${i + 1}`, () => {
    const fields = item(value, 'a loan', LOAN_FACTS);
    const [charged, rental, whole] = ['interest', 'principal_for_rental', 'principal_total'].map((k) => amount(fields[k], k));
    if (itemFlag(fields, 'redrawn_in_year')) {
      refuse('rental_property.interest_redraw', 'A redraw or further drawing in the year changes the share of the principal used for the '
        + 'rental from that day (TR 2000/2 paragraphs 23 to 25); work the loan’s sub-accounts and give each as a loan of its own.');
    }
    if (whole === 0n || rental > whole) conflict('the principal used for the rental must not be more than the total principal, which must be above nil.');
    const deduction = cents(div(mul(div(mul(ofCents(charged), ofCents(rental)), ofCents(whole)), int(h.available)), int(h.days)));
    return { loan: i + 1, interest: charged, principalForRental: rental, principalTotal: whole, deduction };
  }));
}

/** The year's borrowing expenses deduction: the figure given, or the borrowing expenses schedule on the loans given.
 * @param {Record<string, unknown>} input @param {string} year */
function borrowing(input, year) {
  if ('borrowing_expenses' in input) {
    if ('borrowing_loans' in input) refuse('input.field_unknown', 'Give the borrowing loans or the year’s borrowing expenses deduction, not both.');
    return { deduction: amount(input.borrowing_expenses, 'borrowing_expenses'), loans: [] };
  }
  const loans = listOf(input.borrowing_loans, 'borrowing_loans');
  if (loans.length === 0) return { deduction: 0n, loans: [] };
  const schedule = borrowingSchedule({ year, loans });
  return { deduction: BigInt(Math.round(schedule.deduction * 100)), loans: schedule.loans };
}

/** The rate for a residential rental by when the works began, or why there is none (ss 43-20, 43-25 and 43-220; guide Table 1).
 * @param {unknown} kind @param {number} began @param {Record<string, unknown>} fields @returns {{rate: Dec | null, why: string | null}} */
function worksRate(kind, began, fields) {
  if (kind !== 'building' && kind !== 'structural_improvement') invalid('kind must be building or structural_improvement.');
  const before = (/** @type {string} */ iso) => began < /** @type {number} */ (dayOf(iso));
  if (kind === 'structural_improvement') {
    return before('1992-02-27') ? { rate: null, why: 'a structural improvement begun before 27 February 1992 (s 43-20(2))' } : { rate: RATE_2_5, why: null };
  }
  if (before('1979-08-22')) return { rate: null, why: 'a building begun before 22 August 1979, to which Division 43 does not apply (s 43-20(1))' };
  if (before('1985-07-18')) {
    refuse('rental_property.works_intended_use', 'A building begun from 22 August 1979 to 17 July 1985 qualifies only if it was intended on '
      + 'completion for short-term traveller accommodation or non-residential use (Rental properties guide 2026, Table 1), which this calculator does not take.');
  }
  if (before('1987-09-16')) return { rate: RATE_4, why: null };
  const taken = itemFlag(fields, 'taken_to_begin_before_16_september_1987');
  if (taken === null) {
    refuse('input.missing_field', 'say whether a building begun after 15 September 1987 is taken to have begun before 16 September 1987 (s 43-220(1)(a) and (b)).');
  }
  return { rate: taken ? RATE_4 : RATE_2_5, why: null };
}

/** The days the works were used to produce rent in the year. @param {number} firstUsed @param {Held} h */
function daysUsed(firstUsed, h) {
  if (firstUsed > h.to) return 0;
  if (firstUsed <= h.from) return h.available;
  if (h.available < h.days) {
    refuse('rental_property.days_unclear', 'The works were first used after the property was first held in the year, and it was not '
      + 'available for rent on every day held, so their days used are not known from the days available.');
  }
  return h.to - firstUsed + 1;
}

/** One capital works item: the rate times the days used over 365, no more than the undeducted construction expenditure
 * (ss 43-15(1), 43-210, 43-215, 43-230, 43-235 and 43-240). @param {unknown} value @param {Dec} share @param {Held} h @param {Year} year */
function works(value, share, h, year) {
  const fields = item(value, 'capital_works', WORKS_FACTS);
  const expenditure = amount(fields.construction_expenditure, 'construction_expenditure');
  const [began, firstUsed] = [itemDay(fields, 'began'), itemDay(fields, 'first_used')];
  if (firstUsed < began) conflict('first_used must not be before began.');
  const { rate, why } = worksRate(fields.kind, began, fields);
  const row = { kind: /** @type {string} */ (fields.kind), began: isoOf(began), rate: rate === null ? null : rate === RATE_4 ? '0.04' : '0.025', why };
  if (rate === null) return { ...row, usePeriodDays: null, undeducted: null, daysUsed: null, deduction: 0n };
  const used = daysUsed(firstUsed, h);
  const end = h.acquiredInYear ? h.from - 1 : year.start - 1;
  const spent = Math.max(end - firstUsed + 1, 0);
  const portion = mul(ofCents(expenditure), share);
  const written = div(mul(mul(portion, rate), int(spent)), int(365));
  const undeducted = cmp(written, portion) > 0 ? int(0) : sub(portion, written);
  const full = div(mul(mul(portion, rate), int(used)), int(365));
  return { ...row, usePeriodDays: spent, undeducted: cents(undeducted), daysUsed: used, deduction: cents(cmp(full, undeducted) < 0 ? full : undeducted) };
}

/** A boolean fact the asset needs here. @param {Record<string, unknown>} fields @param {string} key @param {string} when */
function needed(fields, key, when) {
  return itemFlag(fields, key) ?? refuse('input.missing_field', `${key} is required for an asset${when}`);
}

/** Why s 40-27 reduces the asset's decline to nil, or null (s 40-27(2) to (6); Act No. 126 of 2017 Schedule 2 item 13).
 * @param {Record<string, unknown>} fields @param {number} acquired @param {number} firstUsed */
function reduced(fields, acquired, firstUsed) {
  if (needed(fields, 'low_value_pool', '')) return null;
  if (acquired === NINE_MAY_2017) {
    refuse('rental_property.asset_acquired_9_may_2017', 'The asset was acquired on 9 May 2017, and s 40-27 applies only from 7.30 pm that day '
      + '(Act No. 126 of 2017 Schedule 2 item 13(1)).');
  }
  if (acquired < NINE_MAY_2017 && (needed(fields, 'deductible_in_2016_17', ' acquired before 9 May 2017') || firstUsed > END_2016_17)) return null;
  if (needed(fields, 'residence_or_private_use', '')) return 'used in one of your residences or for a non-taxable purpose not occasionally (s 40-27(2)(d))';
  if (needed(fields, 'held_when_first_used', '')) return null;
  if (needed(fields, 'new_premises_exception', ' you did not hold when it was first used or installed ready for use')) return null;
  return 'second-hand: you did not hold it when it was first used or installed ready for use by any entity, and it was not supplied '
    + 'with new residential premises (s 40-27(2)(c), (4) and (5))';
}

/** One depreciating asset: its decline in value at the legal interest and the time-based share, nil where s 40-27 reduces it.
 * @param {unknown} value @param {Dec} share @param {Held} h */
function asset(value, share, h) {
  const fields = item(value, 'depreciating_assets', ASSET_FACTS);
  const decline = amount(fields.decline_in_value, 'decline_in_value');
  const [acquired, firstUsed] = [itemDay(fields, 'acquired'), itemDay(fields, 'first_used')];
  const from = Math.max(firstUsed, acquired);
  if (from > h.to) conflict('first_used and acquired must not be after the property was last held in the year.');
  if (firstUsed < acquired && itemFlag(fields, 'held_when_first_used') === true) {
    conflict('An asset first used before it was acquired was not held when it was first used.');
  }
  const why = reduced(fields, acquired, firstUsed);
  if (why !== null) return { decline, acquired: isoOf(acquired), why, deduction: 0n };
  if (from > h.from && h.available !== h.days) {
    refuse('rental_property.days_unclear', 'The asset was first used or acquired after the property was first held in the year, and it was '
      + 'not available for rent on every day held, so the share of its decline for rental use is not known from the days available.');
  }
  return { decline, acquired: isoOf(acquired), why, deduction: cents(div(mul(mul(ofCents(decline), share), int(h.available)), int(h.days))) };
}

/** The resident scale's tax in cents on whole-dollar income (Schedule 7 Part I clause 1). @param {bigint} income @param {string} year */
function scaleTax(income, year) {
  const bands = RESIDENT_SCALES[year];
  let tax = 0n;
  bands.forEach(([low, rate], i) => {
    const high = i + 1 < bands.length ? BigInt(bands[i + 1][0]) : income;
    const top = income < high ? income : high;
    if (top > BigInt(low)) tax += (top - BigInt(low)) * BigInt(rate);
  });
  return tax;
}

/** Tax at the resident scale without and with the net rent, in cents. @param {unknown} other @param {bigint} net @param {Year} year @param {string} label */
function taxEffect(other, net, year, label) {
  if (year.first < 2024) {
    refuse('rental_property.tax_effect_year', 'The effect on tax is worked out for 2024-25 to 2026-27, the years the resident scale is held '
      + 'for here; leave other taxable income blank for an earlier year.');
  }
  const [c, e] = decimalInput(other, 'other_taxable_income');
  if (c < 0n || e < -2 || cents([c, e]) > MAX_AMOUNT_CENTS) refuse('input.amount_invalid', 'other taxable income: enter whole dollars from 0 to 1,000,000,000,000.');
  const without = cents([c, e]);
  if (without % 100n !== 0n) refuse('input.amount_not_whole_dollars', 'Supply established whole-dollar other_taxable_income.');
  const dropped = (net / 100n) * 100n;
  const sum = without + dropped;
  const withRent = sum < 0n ? 0n : sum;
  if (withRent > MAX_AMOUNT_CENTS) refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  const [taxWithout, taxWith] = [scaleTax(without / 100n, label), scaleTax(withRent / 100n, label)];
  return { taxable_income_without_rental: without, taxable_income_with_rental: withRent, tax_without_rental: taxWithout,
    tax_with_rental: taxWith, tax_effect: taxWithout - taxWith };
}

/** The input's keys and its scope, year and legal interest. @param {Record<string, unknown>} input */
function checked(input) {
  const extra = Object.keys(input).find((k) => !INPUT_FIELDS.includes(k));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not an input of rental-property`);
  const missing = REQUIRED.find((k) => !(k in input));
  if (missing !== undefined) refuse('input.missing_field', `${missing} is required`);
  if (!('borrowing_loans' in input) && !('borrowing_expenses' in input)) refuse('input.missing_field', 'borrowing_loans is required');
  // The command reads its decimal inputs before it checks anything else.
  const share = decimalInput(input.ownership_share, 'ownership_share');
  if ('other_taxable_income' in input) decimalInput(input.other_taxable_income, 'other_taxable_income');
  // The page states the command's scope beside the form, so a call without scope_confirmed is taken as confirmed.
  if ('scope_confirmed' in input && input.scope_confirmed !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  if (typeof input.year !== 'string' || !RENTAL_YEARS.includes(input.year)) {
    refuse('period.unsupported', `Choose an income year from ${RENTAL_YEARS[0]} to ${RENTAL_YEARS.at(-1)}. From 2027-28 s 26-155 can limit `
      + 'residential rental deductions, which this calculator does not work out.');
  }
  if (share[0] <= 0n || cmp(share, int(1)) > 0) invalid('Enter your legal interest as a decimal fraction above 0 and at most 1, such as 0.5 for half.');
  if (typeof input.section_26_50_applies !== 'boolean') refuse('input.flag_invalid', 'section_26_50_applies must be a boolean.');
  if (input.section_26_50_applies) {
    refuse('rental_property.s26_50_denied', 'Section 26-50 denies the costs of owning a holiday home not used or held mainly to produce '
      + 'rent at all times in the year, before any apportionment (TR 2026/1 paragraphs 17 and 31); this calculator does not decide ‘mainly’.');
  }
  const first = Number(input.year.slice(0, 4));
  return { year: input.year, share, span: { first, start: Date.UTC(first, 6, 1) / 86400000, end: Date.UTC(first + 1, 5, 30) / 86400000 } };
}

/** @param {bigint} c */
const dollars = (c) => Number(c) / 100;
/** @param {bigint} c */
const big = (c) => abs(c) >= SAFE_CENTS;

/** One rental property's income, deductions and net rent for the year, and its effect on tax when other taxable
 * income is given. Amounts are in dollars, keyed as the command keys them. @param {Record<string, unknown>} input */
export function rentalProperty(input) {
  const { year, share, span } = checked(input);
  const h = held(input, span);
  const income = lines(input.income, 'income', INCOME);
  /** @type {[string, bigint][]} */
  const steps = [['gross_rent', cents(mul(add(ofCents(income.get('rental_income') ?? 0n), ofCents(income.get('other_rental_income') ?? 0n)), share))]];
  steps.push(...expenseLines(input, share, h));
  const loans = interest(input.loans, h);
  const borrowed = borrowing(input, year);
  const items = listOf(input.capital_works, 'capital_works').map((w, i) => at(`capital works ${i + 1}`, () => works(w, share, h, span)));
  const assets = listOf(input.depreciating_assets, 'depreciating_assets').map((a, i) => at(`asset ${i + 1}`, () => asset(a, share, h)));
  const total = (/** @type {{deduction: bigint}[]} */ rows) => rows.reduce((s, r) => s + r.deduction, 0n);
  steps.push(['interest', total(loans)], ['borrowing_expenses', borrowed.deduction], ['decline_in_value', total(assets)], ['capital_works', total(items)]);
  const deductions = steps.slice(1).filter(([k]) => k !== 'travel_denied').reduce((s, [, v]) => s + v, 0n);
  const net = steps[0][1] - deductions;
  steps.push(['total_deductions', deductions], ['net_rent', net]);
  if ('other_taxable_income' in input) steps.push(...Object.entries(taxEffect(input.other_taxable_income, net, span, year)));
  if (steps.some(([, v]) => big(v))) refuse('input.amount_invalid', 'This calculator shows amounts to the cent only below $70,368,744,177,664; a value or total here is larger.');
  return { year, ownershipShare: /** @type {string} */ (input.ownership_share), daysHeld: h.days, daysAvailable: h.available,
    from: isoOf(h.from), to: isoOf(h.to), grossRent: dollars(steps[0][1]), totalDeductions: dollars(deductions), netRent: dollars(net), amounts: Object.fromEntries(steps.map(([k, v]) => [k, dollars(v)])),
    loans: loans.map((l) => ({ loan: l.loan, interest: dollars(l.interest), principalForRental: dollars(l.principalForRental), principalTotal: dollars(l.principalTotal),
      deduction: dollars(l.deduction) })),
    capitalWorks: items.map((w) => ({ ...w, undeducted: w.undeducted === null ? null : dollars(w.undeducted), deduction: dollars(w.deduction) })),
    assets: assets.map((a) => ({ ...a, decline: dollars(a.decline), deduction: dollars(a.deduction) })), borrowingLoans: borrowed.loans };
}
