// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The 183-day residency day count for an income year from 2020-21 to 2026-27, from the
// `residency-tests` command of ryanduguid/australian-accounting: the same input, the same 4 tests
// worked from the stated answers, the same day count and the same refusal codes. The page asks only
// for the 183-day test's facts and shows that test; it never shows the command's overall answer.
// Sources:
// - ITAA 1936 s 6(1), 'resident or resident of Australia' paragraph (a)(ii), compilation 193
//   (1 October 2026), read 26 November 2026: 'has actually been in Australia, continuously or
//   intermittently, during more than one-half of the year of income', unless the usual place of abode
//   is outside Australia and there is no intention to take up residence.
// - TR 2023/1 paragraphs 83 to 87 and footnote 51, read 26 November 2026: the days are added
//   together, a part day counts as a whole day, the year runs 1 July to 30 June, and 184 days in a
//   leap year.

export const RESIDENCY_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
/** The command's inputs, in the order it reads them. */
const INPUTS = ['resides', 'domicile_in_australia', 'permanent_place_of_abode_outside', 'presence', 'usual_place_of_abode_outside',
  'intends_to_take_up_residence', 'commonwealth_super', 'resident_elsewhere', 'year', 'scope_confirmed'];
const FLAGS = ['resides', 'domicile_in_australia', 'permanent_place_of_abode_outside', 'usual_place_of_abode_outside',
  'intends_to_take_up_residence'];
const SUPER = ['none', 'pss_member', 'css_eligible_employee', 'partner_of_member', 'child_under_16_of_member'];
/** The most periods the command takes. */
export const MAX_PERIODS = 400;
const DAY = 86400000;

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** A strict YYYY-MM-DD date from 1900 to 2100 as days since 1970-01-01, or null. @param {unknown} text */
export function dayOf(text) {
  const m = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const time = Date.UTC(y, mo - 1, d);
  const back = new Date(time);
  const valid = y >= 1900 && y <= 2100 && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d;
  return valid ? time / DAY : null;
}

/** The YYYY-MM-DD of a day number. @param {number} day */
export const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);

/** @param {string} why @returns {never} */
const badPresence = (why) => refuse('residency_tests.presence_invalid',
  `presence must be a list of up to ${MAX_PERIODS} periods, each an object with from and to as YYYY-MM-DD dates, to not before from: ${why}`);

/** The periods given, each [from, to] inclusive. @param {unknown} given @returns {[number, number][]} */
function periods(given) {
  if (!Array.isArray(given)) badPresence('not a list');
  if (given.length > MAX_PERIODS) badPresence('too many periods');
  return given.map((item, i) => {
    const name = `period ${i + 1}`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) badPresence(`${name} is not an object`);
    const unknown = Object.keys(item).find((key) => key !== 'from' && key !== 'to');
    if (unknown !== undefined) refuse('input.field_unknown', `${name}: ${unknown} is not an input of a period`);
    const date = (/** @type {'from' | 'to'} */ key) => {
      if (!Object.hasOwn(item, key)) refuse('input.missing_field', `${name}: ${key} is required`);
      return dayOf(item[key]) ?? badPresence(`${name}: ${key} is not a date`);
    };
    const [from, to] = [date('from'), date('to')];
    if (to < from) badPresence(`${name} ends before it starts`);
    return [from, to];
  });
}

/** TR 2023/1 paragraphs 86 and 87: the distinct days in [first, last] in Australia for any part of the day.
 * @param {[number, number][]} spans @param {number} first @param {number} last */
function daysPresent(spans, first, last) {
  const present = new Uint8Array(last - first + 1);
  for (const [from, to] of spans) {
    const [lo, hi] = [Math.max(from, first) - first, Math.min(to, last) - first + 1];
    if (lo < hi) present.fill(1, lo, hi);
  }
  return present.reduce((sum, p) => sum + p, 0);
}

/** @typedef {{year: string, resident: boolean, met_by: string[],
 *   income_year: {first_day: string, last_day: string, days: number},
 *   tests: {ordinary_concepts: boolean, domicile: boolean, days_in_australia: number, days_needed: number, days_183: boolean,
 *     commonwealth_super: boolean}, visitor: boolean}} ResidencyWorked */

/** The command's result from its input. @param {unknown} given @returns {ResidencyWorked} */
export function residencyTests(given) {
  if (typeof given !== 'object' || given === null || Array.isArray(given)) refuse('input.not_object', 'input must be a JSON object');
  const input = new Map(Object.entries(given));
  const unknown = [...input.keys()].sort().find((key) => !INPUTS.includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an input of residency-tests`);
  const missing = INPUTS.find((key) => !input.has(key));
  if (missing !== undefined) refuse('input.missing_field', `${missing} is required`);
  if (input.get('scope_confirmed') !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = RESIDENCY_YEARS.find((y) => y === input.get('year'));
  if (year === undefined) refuse('period.unsupported', `Choose an income year from ${RESIDENCY_YEARS[0]} to ${RESIDENCY_YEARS.at(-1)}.`);
  /** @param {string} key */
  const flag = (key) => {
    const value = input.get(key);
    return typeof value === 'boolean' ? value : refuse('input.flag_invalid', `${key} must be a boolean.`);
  };
  const [resides, domicile, permanentOutside, usualOutside, intends] = FLAGS.map(flag);
  const fund = input.get('commonwealth_super');
  if (typeof fund !== 'string' || !SUPER.includes(fund)) {
    refuse('residency_tests.super_invalid', `commonwealth_super must be ${SUPER.slice(0, -1).join(', ')} or ${SUPER.at(-1)}.`);
  }
  const elsewhere = flag('resident_elsewhere');
  const spans = periods(input.get('presence'));
  const start = Number(year.slice(0, 4));
  const [first, last] = [Date.UTC(start, 6, 1) / DAY, Date.UTC(start + 1, 5, 30) / DAY];
  const yearDays = last - first + 1;
  const days = daysPresent(spans, first, last);
  const needed = Math.floor(yearDays / 2) + 1;
  const visitor = usualOutside && !intends;
  const tests = { ordinary_concepts: resides, domicile: domicile && !permanentOutside, days_in_australia: days, days_needed: needed,
    days_183: days >= needed && !visitor, commonwealth_super: fund !== 'none' };
  const metBy = /** @type {const} */ (['ordinary_concepts', 'domicile', 'days_183', 'commonwealth_super']).filter((name) => tests[name]);
  if (metBy.length > 0 && elsewhere) {
    refuse('residency_tests.treaty_tie_breaker', 'A resident here and also of another country: a tax treaty\'s tie-breaker rules may allocate '
      + 'residence for the treaty\'s purposes (TR 2023/1 paragraph 108). This calculator does not apply treaties.');
  }
  return { year, resident: metBy.length > 0, met_by: metBy, income_year: { first_day: isoOf(first), last_day: isoOf(last), days: yearDays },
    tests, visitor };
}

/** The 183-day test from the periods in Australia and the 2 exception facts; the other 3 tests are
 * answered no, so only this test's figures are read. @param {string} year @param {unknown} presence
 * @param {boolean} usualOutside @param {boolean} intends @param {boolean} [scopeConfirmed] */
export function residencyDays(year, presence, usualOutside, intends, scopeConfirmed = true) {
  return residencyTests({ resides: false, domicile_in_australia: false, permanent_place_of_abode_outside: false, presence,
    usual_place_of_abode_outside: usualOutside, intends_to_take_up_residence: intends, commonwealth_super: 'none',
    resident_elsewhere: false, year, scope_confirmed: scopeConfirmed });
}

/** The form's rows: each with an arrival or a departure; a blank arrival is 1 July and a blank departure
 * 30 June of the year. @param {(name: string) => string} value @param {number} rows */
export function residencyFormPresence(value, rows = 6) {
  const year = value('year');
  const start = Number(year.slice(0, 4));
  const out = [];
  for (let i = 1; i <= rows; i += 1) {
    const [from, to] = [value(`arrived-${i}`).trim(), value(`departed-${i}`).trim()];
    if (from === '' && to === '') continue;
    out.push({ from: from || `${start}-07-01`, to: to || `${start + 1}-06-30` });
  }
  return out;
}

/** The page's result. @param {(name: string) => string} value */
export function residencyDaysResult(value) {
  const year = value('year');
  const presence = residencyFormPresence(value);
  if (presence.length === 0) refuse('residency_tests.presence_empty', 'Enter at least one period in Australia: an arrival or a departure day.');
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  let r;
  try {
    r = residencyDays(year, presence, yes('usual-abode-outside'), yes('intends-residence'));
  } catch (error) {
    const code = /** @type {{code?: string}} */ (error).code;
    const why = /** @type {Error} */ (error).message;
    if (code === 'residency_tests.presence_invalid' && why.endsWith('ends before it starts')) {
      refuse(code, `Period ${why.match(/period (\d+)/)?.[1]} leaves before it arrives: enter the departure on or after the arrival.`);
    }
    if (code === 'residency_tests.presence_invalid') refuse(code, 'Enter each day as a date from 1900 to 2100.');
    throw error;
  }
  const t = r.tests;
  const reached = t.days_in_australia >= t.days_needed;
  const day = (/** @type {string} */ iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const rows = [['Days in Australia in the income year', `${t.days_in_australia} of ${r.income_year.days}`],
    ['More than one-half of the year', `${t.days_needed} days or more`],
    ['Usual place of abode outside Australia and no intention to take up residence', r.visitor ? 'Yes, as you answered' : 'No, as you answered'],
    ['183-day test', t.days_183 ? 'Met' : 'Not met']];
  const note = !reached ? `Fewer than ${t.days_needed} days: the test is not met whatever the abode and intention`
    : r.visitor ? 'Enough days, but the exception applies on your answers, so the test is not met'
      : 'Enough days, and the exception does not apply on your answers';
  return { inputs: `${year} (${day(r.income_year.first_day)} to ${day(r.income_year.last_day)}); ${presence.length} ${presence.length === 1 ? 'period' : 'periods'} `
    + `in Australia; usual place of abode outside Australia: ${yes('usual-abode-outside') ? 'yes' : 'no'}; intends to take up residence: `
    + `${yes('intends-residence') ? 'yes' : 'no'}`, rows, principal: 3, note };
}
