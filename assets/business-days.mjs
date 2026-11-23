// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { number } from './money.mjs';

// Business days between 2 dates, or N business days on or back, with weekends and public holidays
// skipped. The holidays are this site's table in _data/payday_super_business_days.json: each public
// holiday that applies throughout a state or territory, which each government's own page, read
// 18 November 2026, confirms for 2026 and 2027. A state's count also skips the 2 holidays that table
// leaves out because a local day can replace them: Melbourne Cup Day (Business Victoria, 2026 and
// 2027 pages) and Western Australia's King's Birthday (WA Government public holidays page, last
// updated 5 November 2026). Victoria's 1 October 2027 holiday follows Gazette S 229 and the AFL fixture.

/** @typedef {{date: string, name: string, jurisdictions: string[]}} Holiday
 * @typedef {'count' | 'add' | 'subtract'} BusinessDaysMode
 * @typedef {{mode: BusinessDaysMode, place: string, start: string, end: string, count: string}} BusinessDaysQuestion */

/** The table's codes and the names the page uses. */
export const BUSINESS_DAY_PLACES = { ACT: 'Australian Capital Territory', NSW: 'New South Wales', NT: 'Northern Territory',
  QLD: 'Queensland', SA: 'South Australia', TAS: 'Tasmania', VIC: 'Victoria', WA: 'Western Australia' };
/** The first and last day this page counts. */
export const BUSINESS_DAYS_COVERAGE = { from: '2026-01-01', until: '2027-12-31' };
/** @type {Holiday[]} */
export const STATE_ONLY_HOLIDAYS = [
  { date: '2026-09-28', name: 'King’s Birthday', jurisdictions: ['WA'] },
  { date: '2026-11-03', name: 'Melbourne Cup Day', jurisdictions: ['VIC'] },
  { date: '2027-09-27', name: 'King’s Birthday', jurisdictions: ['WA'] },
  { date: '2027-11-02', name: 'Melbourne Cup Day', jurisdictions: ['VIC'] },
];

/** The holidays as the form carries them: the table's rows as JSON, of which the provisional ones,
 * not yet confirmed, are left out. @param {string} text @returns {Holiday[]} */
export function parseHolidays(text) {
  const rows = JSON.parse(text);
  const usable = Array.isArray(rows) && rows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row?.date) && typeof row.name === 'string'
    && Array.isArray(row.jurisdictions) && typeof row.provisional === 'boolean');
  if (!usable) throw new Error('The public holiday table is not usable.');
  return rows.filter((row) => !row.provisional).map(({ date, name, jurisdictions }) => ({ date, name, jurisdictions }));
}

const DAY = 86400000;
/** @param {string} iso */
const toDay = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY;
/** @param {number} day */
const toIso = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** @param {string} iso */
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A calendar date as YYYY-MM-DD. @param {string} value @param {string} label */
function dateOf(value, label) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && toIso(toDay(value)) === value;
  if (!valid) throw new Error(`Enter the ${label} as a date.`);
  return toDay(value);
}

/** Business days counted after the start up to and including the end, or the date a number of
 * business days after or before the start, where a business day is not a Saturday, a Sunday or a
 * public holiday in the place: one state or territory, or 'any' for a holiday throughout any of them.
 * @param {BusinessDaysQuestion} question @param {Holiday[]} holidays */
export function businessDays(question, holidays) {
  const { mode, place } = question;
  if (!['count', 'add', 'subtract'].includes(mode)) throw new Error('Choose what to work out.');
  if (place !== 'any' && !Object.hasOwn(BUSINESS_DAY_PLACES, place)) throw new Error('Choose a state or territory.');
  const rows = place === 'any' ? holidays : [...holidays, ...STATE_ONLY_HOLIDAYS].filter((row) => row.jurisdictions.includes(place));
  const names = new Map();
  for (const row of rows) names.set(row.date, names.has(row.date) ? names.get(row.date) : row.name);
  const [from, until] = [toDay(BUSINESS_DAYS_COVERAGE.from), toDay(BUSINESS_DAYS_COVERAGE.until)];
  const covered = (/** @type {number} */ day) => {
    if (day < from || day > until) {
      throw new Error(`This page has public holidays from ${longDate(toIso(from))} to ${longDate(toIso(until))}${place === 'any' ? ' for any state or territory' : ` for ${BUSINESS_DAY_PLACES[/** @type {keyof typeof BUSINESS_DAY_PLACES} */ (place)]}`}; choose dates in that range.`);
    }
    return day;
  };
  /** @type {{date: string, name: string}[]} */
  const skipped = [];
  const business = (/** @type {number} */ day) => {
    const weekday = new Date(day * DAY).getUTCDay();
    if (weekday === 0 || weekday === 6) return false;
    if (!names.has(toIso(day))) return true;
    skipped.push({ date: toIso(day), name: names.get(toIso(day)) });
    return false;
  };
  const start = covered(dateOf(question.start, 'start date'));
  if (mode === 'count') {
    const end = covered(dateOf(question.end, 'end date'));
    if (end < start) throw new Error('The end date must not be before the start date.');
    let days = 0;
    for (let day = start + 1; day <= end; day += 1) days += business(day) ? 1 : 0;
    return { days, date: null, skipped };
  }
  const wanted = number(question.count, { min: 1, max: 500, integer: true });
  const step = mode === 'add' ? 1 : -1;
  let day = start;
  for (let found = 0; found < wanted;) {
    day = covered(day + step);
    found += business(day) ? 1 : 0;
  }
  return { days: wanted, date: toIso(day), skipped: step < 0 ? skipped.reverse() : skipped };
}

/** The page's result: its inputs sentence, labelled rows and note.
 * @param {BusinessDaysQuestion} question @param {Holiday[]} holidays */
export function businessDaysResult(question, holidays) {
  const r = businessDays(question, holidays);
  const where = question.place === 'any' ? 'any state or territory'
    : BUSINESS_DAY_PLACES[/** @type {keyof typeof BUSINESS_DAY_PLACES} */ (question.place)];
  const plural = (/** @type {number} */ n) => `${n} business day${n === 1 ? '' : 's'}`;
  const skippedText = r.skipped.length ? r.skipped.map(({ date, name }) => `${longDate(date)} (${name.replaceAll('; ', ' / ')})`).join(', ') : 'none';
  const rows = question.mode === 'count'
    ? [['Business days after the start, to and including the end', String(r.days)]]
    : [[`${plural(r.days)} ${question.mode === 'add' ? 'after' : 'before'} the start`, longDate(/** @type {string} */ (r.date))]];
  rows.push(['Weekday public holidays skipped', skippedText]);
  return { inputs: `${where}, start ${longDate(question.start)}, ${question.mode === 'count' ? `end ${longDate(question.end)}`
    : `${plural(Number(question.count))} ${question.mode === 'add' ? 'on' : 'back'}`}`, rows, principal: 0,
  note: question.place === 'any' ? 'A public holiday throughout any one state or territory is skipped, as the site’s Payday Super business days table counts them'
    : 'Part-day and regional holidays count as business days; where a local day replaces Melbourne Cup Day or the WA King’s Birthday, the state date is still skipped' };
}
