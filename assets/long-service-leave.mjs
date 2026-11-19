// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { cents, number } from './money.mjs';

// Long service leave under each state and territory's general Act, read 19 November 2026:
// - NSW: Long Service Leave Act 1955, version for 1 July 2025 to date, s 4(2)(a) and (a3) (a month is 4 1/3 weeks).
// - Vic: Long Service Leave Act 2018, Authorised Version No. 006 (12 December 2025), ss 6, 9 and 10.
// - Qld: Industrial Relations Act 2016, current version, s 95.
// - WA: Long Service Leave Act 1958, official version 04-m0-00 (31 January 2025), s 8(2) and (3).
// - SA: Long Service Leave Act 1987, version of 1 July 2017, s 5.
// - Tas: Long Service Leave Act 1976, version current from 10 December 2018, ss 8 and 9 (not mining employees, s 8A).
// - ACT: Long Service Leave Act 1976, republication R29 (19 November 2025), ss 3, 4, 11A and 11C.
// - NT: Long Service Leave Act 1981, reprint REPL021 as in force at 14 October 2015, ss 8 and 10.
// What counts as service, the reason employment ended and ordinary pay are the user's facts.
//
// Service runs from the first day to the end of the last day, less the excluded days, and is
// measured in completed years, then completed months, then days. A part year is the months
// over 12 plus the days over 365.25, as WorkSafe Tasmania's example 2 works 13 years 6 months
// and 14 days as 13.5383 years. Where an Act counts completed years or months only, the rest
// is dropped. Weeks show rounded half up to 4 decimal places; the payment is the exact weeks
// times the weekly pay, rounded half up to the cent once, so 8 2/3 weeks at $1,500 is $13,000.00.

/** @typedef {'AU-NSW' | 'AU-VIC' | 'AU-QLD' | 'AU-WA' | 'AU-SA' | 'AU-TAS' | 'AU-ACT' | 'AU-NT'} LslPlace */
/** @typedef {'resign' | 'pressing' | 'no-notice' | 'retire' | 'redundancy' | 'illness-dismissal' | 'performance'
 *   | 'misconduct' | 'fixed-term' | 'death'} LslReason */
/** @typedef {{place: LslPlace, start: string, end: string, excluded: string, taken: string, mode: 'employed' | 'ends',
 *   reason: LslReason, pay: string}} LslInput */
/** @typedef {[bigint, bigint]} Fraction numerator and positive denominator, in weeks */
/** @typedef {{weeks: Fraction, rule: string}} Outcome */

export const LSL_EARLIEST_START = '1990-06-23';
export const LSL_LATEST_DAY = '2099-12-31';

/** Each Act's name, its qualifying period for the full entitlement and the shortest service a
 * pro rata payment can follow, in years. */
export const LSL_ACTS = {
  'AU-NSW': { name: 'New South Wales', act: 'Long Service Leave Act 1955 (NSW)', full: 10, early: 5 },
  'AU-VIC': { name: 'Victoria', act: 'Long Service Leave Act 2018 (Vic)', full: 7, early: 7 },
  'AU-QLD': { name: 'Queensland', act: 'Industrial Relations Act 2016 (Qld)', full: 10, early: 7 },
  'AU-WA': { name: 'Western Australia', act: 'Long Service Leave Act 1958 (WA)', full: 10, early: 7 },
  'AU-SA': { name: 'South Australia', act: 'Long Service Leave Act 1987 (SA)', full: 10, early: 7 },
  'AU-TAS': { name: 'Tasmania', act: 'Long Service Leave Act 1976 (Tas)', full: 10, early: 7 },
  'AU-ACT': { name: 'Australian Capital Territory', act: 'Long Service Leave Act 1976 (ACT)', full: 7, early: 5 },
  'AU-NT': { name: 'Northern Territory', act: 'Long Service Leave Act 1981 (NT)', full: 10, early: 7 },
};

/** How the page writes each reason employment ended. @type {Record<LslReason, string>} */
export const LSL_REASONS = {
  resign: 'resignation',
  pressing: 'resignation because of illness, incapacity, or a domestic or other pressing necessity',
  'no-notice': 'resignation without the notice the contract requires',
  retire: 'retirement at or after the retiring age',
  redundancy: 'redundancy or another dismissal not about the employee’s conduct, capacity or performance',
  'illness-dismissal': 'dismissal because of the employee’s illness or injury',
  performance: 'dismissal for conduct, capacity or performance short of serious misconduct',
  misconduct: 'dismissal for serious misconduct',
  'fixed-term': 'the end of a fixed term',
  death: 'the employee’s death',
};

/** The reasons each Act pays a pro rata amount for before the full qualifying period, with the
 * provision. Victoria pays nothing before 7 years on any ground.
 * @type {Partial<Record<LslPlace, [LslReason[], string]>>} */
const EARLY = {
  'AU-NSW': [['redundancy', 'illness-dismissal', 'performance', 'pressing', 'death'], 'subparagraph 4(2)(a)(iii)'],
  'AU-QLD': [['redundancy', 'illness-dismissal', 'pressing', 'fixed-term', 'death'], 'subsection 95(4)'],
  'AU-WA': [['resign', 'pressing', 'no-notice', 'retire', 'redundancy', 'illness-dismissal', 'performance', 'fixed-term', 'death'],
    'subsection 8(3)'],
  'AU-SA': [['resign', 'pressing', 'retire', 'redundancy', 'illness-dismissal', 'performance', 'fixed-term', 'death'], 'subsections 5(3) and (4)'],
  'AU-TAS': [['pressing', 'retire', 'redundancy', 'illness-dismissal', 'performance', 'death'], 'subsection 8(3)'],
  'AU-ACT': [['pressing', 'retire', 'redundancy', 'illness-dismissal', 'performance', 'death'], 'subsection 11C(1)'],
  'AU-NT': [['pressing', 'retire', 'redundancy', 'illness-dismissal', 'performance'], 'subsection 10(2)'],
};

/** Questions an Act leaves open before its full qualifying period, refused rather than guessed.
 * @type {Partial<Record<LslPlace, Partial<Record<LslReason, string>>>>} */
const UNSETTLED = {
  'AU-NSW': { 'fixed-term': 'The NSW Act pays pro rata leave under 10 years when the employer ends the employment, and does not say whether a fixed term ending is that: this calculator does not decide it.' },
  'AU-TAS': { 'fixed-term': 'The Tasmanian Act pays pro rata leave under 10 years when the employer ends the employment, and does not say whether a fixed term ending is that: this calculator does not decide it.' },
  'AU-ACT': { 'fixed-term': 'The ACT Act pays pro rata leave under 7 years when the employer ends the employment, and does not say whether a fixed term ending is that: this calculator does not decide it.' },
  'AU-NT': { 'fixed-term': 'The NT Act pays pro rata leave under 10 years when the employer ends the employment, and does not say whether a fixed term ending is that: this calculator does not decide it.',
    death: 'Under 10 years, the NT Act pays on death what the employee would have been paid for leaving that day for a reason in subsection 10(2) (subsection 10(3)): choose that reason instead.' },
};

const DAY = 86400000;
/** @param {string} iso */
const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;
/** @param {number} day */
const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** @param {number} day @returns {string} '19 November 2026' */
const plainDay = (day) => new Date(day * DAY).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A date field as a day number, refused unless it is a real date in the calculator's range.
 * @param {unknown} value @param {string} what */
function dateField(value, what) {
  const day = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? dayOf(value) : NaN;
  if (!Number.isInteger(day) || isoOf(day) !== value || value < LSL_EARLIEST_START || value > LSL_LATEST_DAY) {
    throw new Error(`Enter ${what} from ${plainDay(dayOf(LSL_EARLIEST_START))} to ${plainDay(dayOf(LSL_LATEST_DAY))}.`);
  }
  return day;
}

/** The day `years` and `months` after the start's date: the same day of the month, or, where
 * the month has no such day, the 1st of the next, so a period starting on 29 February or the
 * 31st ends with the shorter month's last day.
 * @param {number} start @param {number} years @param {number} [months] */
function anniversary(start, years, months = 0) {
  const date = new Date(start * DAY);
  const month = date.getUTCMonth() + months;
  const [year, inYear] = [date.getUTCFullYear() + years + Math.floor(month / 12), ((month % 12) + 12) % 12];
  const last = new Date(Date.UTC(year, inYear + 1, 0)).getUTCDate();
  return (date.getUTCDate() > last ? Date.UTC(year, inYear + 1, 1) : Date.UTC(year, inYear, date.getUTCDate())) / DAY;
}

/** Service from the start to the day before `until`: completed years, then completed months,
 * then days, and the days in all. @param {number} start @param {number} until */
function measure(start, until) {
  let years = 0;
  while (anniversary(start, years + 1) <= until) years += 1;
  let months = 0;
  while (anniversary(start, years, months + 1) <= until) months += 1;
  return { years, months, days: until - anniversary(start, years, months), total: until - start };
}

/** @typedef {ReturnType<typeof measure>} Service */
/** Years of service with the part year as months over 12 and days over 365.25.
 * @param {Service} s @returns {Fraction} */
const exactYears = (s) => [BigInt(s.years * 438300 + s.months * 36525 + s.days * 1200), 438300n];
/** @param {Service} s @returns {Fraction} */
const completedYears = (s) => [BigInt(s.years), 1n];
/** @param {Service} s @returns {Fraction} */
const completedMonths = (s) => [BigInt(s.years * 12 + s.months), 12n];
/** @param {Fraction} years @param {bigint} n @param {bigint} d weeks a year as n/d @returns {Fraction} */
const at = ([y, by], n, d) => [y * n, by * d];
/** 8 2/3 weeks for 10 years (2 months of 4 1/3 weeks, or 1/5 of a month a year): 13/15 weeks a year. */
const twoMonths = (/** @type {Fraction} */ years) => at(years, 13n, 15n);
/** 1.3 weeks a year. */
const thirteen = (/** @type {Fraction} */ years) => at(years, 13n, 10n);
/** 1 week for every 60 weeks of the days given. @param {number} days @returns {Fraction} */
const sixtieth = (days) => [BigInt(days), 420n];
/** @param {Fraction} a @param {Fraction} b @returns {Fraction} */
const plus = ([an, ad], [bn, bd]) => [an * bd + bn * ad, ad * bd];
/** @param {Fraction} weeks @param {string} rule @returns {Outcome} */
const outcomeOf = (weeks, rule) => ({ weeks, rule });
/** Whole 5-year blocks completed after the first 10 years. @param {Service} s */
const blocks = (s) => BigInt(Math.floor((s.years - 10) / 5));
/** The leave accrued in the first 10 years and each completed 5 years after. @param {Service} s @returns {Fraction} */
const blockWeeks = (s) => twoMonths([10n + 5n * blocks(s), 1n]);

/** The provision for leave in 10 and 5-year blocks. @type {Partial<Record<LslPlace, string>>} */
const BLOCK_PROVISIONS = { 'AU-NSW': 'subparagraph 4(2)(a)(i)', 'AU-WA': 'paragraphs 8(2)(a) and (b)',
  'AU-TAS': 'subparagraphs 8(2)(a)(i) and (ii)' };

/** The leave an employee still employed can take now under each Act.
 * @param {LslPlace} place @param {Service} s @returns {Outcome} */
function available(place, s) {
  const { full } = LSL_ACTS[place];
  if (s.years < full) return outcomeOf([0n, 1n], `Under ${full} years: no leave to take yet`);
  switch (place) {
    case 'AU-VIC': return outcomeOf(sixtieth(s.total), '1/60th of the period of continuous employment, section 6');
    case 'AU-QLD': if (s.years < 15) return outcomeOf([26n, 3n], '8.6667 weeks for 10 years, paragraph 95(2)(a)');
      return outcomeOf(twoMonths(exactYears(s)), '8.6667 weeks for 10 years and the same proportion for the further period, subsection 95(2)');
    case 'AU-SA': return outcomeOf(thirteen(completedYears(s)), '13 weeks for 10 years and 1.3 weeks for each completed year after, section 5');
    case 'AU-ACT': return outcomeOf(twoMonths(completedYears(s)), '1/5 of a month for each completed year, sections 3 and 4');
    case 'AU-NT': return outcomeOf(thirteen([10n + 5n * blocks(s), 1n]), '1.3 weeks a year for 10 years and each completed 5 years after, section 8');
    default: return outcomeOf(blockWeeks(s), `8 2/3 weeks for 10 years and 4 1/3 weeks for each completed 5 years after, ${BLOCK_PROVISIONS[place]}`);
  }
}

/** What an Act pays when employment ends for a reason, before leave taken is deducted.
 * @param {LslPlace} place @param {Service} s @param {LslReason} reason @param {number} until the day after service
 * @param {number} start @returns {Outcome} */
function onEnding(place, s, reason, until, start) {
  const { full, early } = LSL_ACTS[place];
  if (s.years < early) return outcomeOf([0n, 1n], `Under ${early} years: nothing is payable`);
  return s.years < full ? proRata(place, s, reason) : afterFull(place, s, reason, until, start);
}

/** What an Act pays between its pro rata and full qualifying periods.
 * @param {LslPlace} place @param {Service} s @param {LslReason} reason @returns {Outcome} */
function proRata(place, s, reason) {
  const { full } = LSL_ACTS[place];
  const unsettled = UNSETTLED[place]?.[reason];
  if (unsettled) throw new Error(unsettled);
  const [reasons, provision] = /** @type {[LslReason[], string]} */ (EARLY[place]);
  if (!reasons.includes(reason)) {
    return outcomeOf([0n, 1n], `Under ${full} years, ${LSL_REASONS[reason]} does not qualify for pro rata leave, ${provision}`);
  }
  if (place === 'AU-SA' || place === 'AU-NT') {
    return outcomeOf(thirteen(completedYears(s)), `1.3 weeks for each completed year, ${provision}`);
  }
  if (place === 'AU-ACT') {
    return outcomeOf(twoMonths(completedMonths(s)), 'Pro rata on 2 months for 10 years, completed years and months, subsection 11C(2)');
  }
  if (place === 'AU-TAS' && reason === 'death') {
    return outcomeOf(sixtieth(s.total), '1/60th of the period of continuous employment, paragraph 9(2)(b)');
  }
  return outcomeOf(twoMonths(exactYears(s)), `Pro rata on 8 2/3 weeks for 10 years, ${provision}`
    + `${place === 'AU-QLD' && reason === 'fixed-term' ? ', if the employee reasonably expected to complete 10 years and was prepared to stay' : ''}`);
}

/** What an Act pays after its full qualifying period.
 * @param {LslPlace} place @param {Service} s @param {LslReason} reason @param {number} until the day after service
 * @param {number} start @returns {Outcome} */
function afterFull(place, s, reason, until, start) {
  switch (place) {
    case 'AU-NSW': if (s.years < 15) return outcomeOf(twoMonths(exactYears(s)), 'Pro rata on 3 months for 15 years, any reason, subparagraph 4(2)(a)(ii)');
      return outcomeOf(twoMonths(completedYears(s)), 'Each completed year at 2 months for 10 years, any reason, subparagraph 4(2)(a)(i)');
    case 'AU-VIC': return outcomeOf(sixtieth(s.total), '1/60th of the period of continuous employment, any reason, sections 6, 9 and 10');
    case 'AU-QLD': return outcomeOf(twoMonths(exactYears(s)), 'Proportionate payment on 8.6667 weeks for 10 years, any reason, subsection 95(3)');
    case 'AU-WA': if (reason === 'misconduct') return outcomeOf(blockWeeks(s), 'Leave already accrued only, after dismissal for serious misconduct, subsection 8(2)');
      return outcomeOf(twoMonths(completedYears(s)), 'Each completed year at 8 2/3 weeks for 10 years, subsection 8(2)');
    case 'AU-SA': return outcomeOf(thirteen(completedYears(s)), '13 weeks for 10 years and 1.3 weeks for each completed year after, any reason, section 5');
    case 'AU-TAS': {
      if (reason !== 'death') return outcomeOf(twoMonths(exactYears(s)), 'Leave accrued and a proportion of 8 2/3 weeks for the years since, any reason, paragraph 8(2)(a)');
      const since = until - anniversary(start, 10 + 5 * Number(blocks(s)));
      return outcomeOf(plus(blockWeeks(s), sixtieth(since)), 'Leave accrued and 1/60th of the employment since, paragraph 9(2)(a)');
    }
    case 'AU-ACT': return outcomeOf(twoMonths(completedYears(s)), '1/5 of a month for each completed year, any reason, sections 4 and 11A');
    default: if (reason === 'misconduct') return outcomeOf(thirteen([10n + 5n * blocks(s), 1n]), 'The completed 10 and 5-year periods only, after serious misconduct, subsection 10(1A)');
      return outcomeOf(thirteen(completedYears(s)), '1.3 weeks for each completed year, subsections 10(1) and (3)');
  }
}

/** The years at which an employee still employed next gains leave to take, or null where it
 * accrues continuously. @param {LslPlace} place @param {Service} s */
function nextMilestone(place, s) {
  const { full } = LSL_ACTS[place];
  if (s.years < full) return full;
  if (place === 'AU-VIC' || (place === 'AU-QLD' && s.years >= 15)) return null;
  if (place === 'AU-QLD') return 15;
  if (place === 'AU-SA' || place === 'AU-ACT') return s.years + 1;
  return 10 + 5 * (Number(blocks(s)) + 1);
}

/** Weeks to 4 decimal places in ten-thousandths, half up. @param {Fraction} weeks */
const tenThousandths = ([n, d]) => (2n * n * 10000n + d) / (2n * d);

/** The input's fields, refused unless each is usable. @param {LslInput} input */
function checked(input) {
  const place = input.place;
  if (!Object.hasOwn(LSL_ACTS, place)) throw new Error('Choose the state or territory whose Act applies.');
  if (input.mode !== 'employed' && input.mode !== 'ends') throw new Error('Choose whether the employee is still employed or employment ends.');
  if (input.mode === 'ends' && !Object.hasOwn(LSL_REASONS, input.reason)) throw new Error('Choose why employment ends.');
  const start = dateField(input.start, 'the first day of service');
  const end = dateField(input.end, input.mode === 'ends' ? 'the last day of employment' : 'the day to work it out at');
  if (end < start) throw new Error('The last day must be on or after the first day of service.');
  const excluded = number(input.excluded, { max: 36500, integer: true });
  const until = end + 1 - excluded;
  if (until <= start) throw new Error('Excluded days must be fewer than the days from the first day to the last.');
  const taken = BigInt(Math.round(number(input.taken, { max: 1000, places: 4 }) * 10000));
  const pay = BigInt(cents(input.pay));
  if (pay > 100000000n) throw new Error('Enter weekly pay of no more than $1,000,000.');
  return { place, start, excluded, until, taken, pay };
}

/** One employee's long service leave under the general Act of a state or territory.
 * @param {LslInput} input */
export function longServiceLeave(input) {
  const { place, start, excluded, until, taken, pay } = checked(input);
  const service = measure(start, until);
  const outcome = input.mode === 'ends' ? onEnding(place, service, input.reason, until, start) : available(place, service);
  const weeks = tenThousandths(outcome.weeks);
  if (taken > weeks) {
    throw new Error('Leave taken or paid is more than this entitlement: the Acts treat leave taken in advance differently, and this calculator does not cover it.');
  }
  const balance = weeks - taken;
  const [n, d] = outcome.weeks;
  const next = input.mode === 'employed' ? nextMilestone(place, service) : null;
  const nextDay = next === null ? null : anniversary(start, next) - 1 + excluded;
  return {
    years: service.years, months: service.months, days: service.days, counted: service.total,
    rule: outcome.rule, weeks: Number(weeks) / 10000, taken: Number(taken) / 10000, balance: Number(balance) / 10000,
    value: Number((2n * (n * 10000n - taken * d) * pay + d * 10000n) / (2n * d * 10000n)) / 100,
    next: next === null || nextDay === null ? null
      : { years: next, date: isoOf(nextDay), weeks: Number(tenThousandths(available(place, measure(start, nextDay + 1 - excluded)).weeks)) / 10000 },
  };
}

/** @param {number} n @param {string} word */
const count = (n, word) => `${n.toLocaleString('en-AU')} ${word}${n === 1 ? '' : 's'}`;
/** @param {number} weeks */
const weeksText = (weeks) => `${weeks.toFixed(4)} weeks`;

/** The page's inputs, rows and note.
 * @param {(name: string) => string} value the form's value for a field
 * @param {(amount: number) => string} aud money as the page writes it */
export function longServiceLeaveResult(value, aud) {
  const input = /** @type {LslInput} */ ({ place: value('jurisdiction'), start: value('start'), end: value('end'), excluded: value('excluded'),
    taken: value('taken'), mode: value('mode'), reason: value('reason'), pay: value('pay') });
  const r = longServiceLeave(input);
  const act = LSL_ACTS[input.place];
  const ends = input.mode === 'ends';
  const service = `${count(r.years, 'year')}, ${count(r.months, 'month')} and ${count(r.days, 'day')}`;
  const rows = [['Service counted', `${service} (${count(r.counted, 'day')})`], [r.rule, weeksText(r.weeks)]];
  if (r.taken) rows.push(['Less leave already taken or paid', weeksText(r.taken)]);
  rows.push([ends ? 'Weeks to pay on termination' : 'Weeks the employee can take now', weeksText(r.balance)],
    [`${ends ? 'Payment' : 'Value'} at ${aud(Number(cents(input.pay)) / 100)} a week`, aud(r.value)]);
  const excluded = Number(input.excluded) ? `, less ${count(Number(input.excluded), 'excluded day')}` : '';
  const note = r.next ? `${count(r.next.years, 'year')} of service completes on ${plainDay(dayOf(r.next.date))}, when the leave to take becomes ${weeksText(r.next.weeks)}, if no more days are excluded`
    : ends ? undefined : `Leave accrues continuously from here under the ${act.act}`;
  return { inputs: `${act.name}, ${act.act}, service from ${plainDay(dayOf(input.start))} to ${plainDay(dayOf(input.end))}${excluded}, `
    + `${ends ? `employment ends by ${LSL_REASONS[input.reason]}` : 'still employed'}, `
    + `${r.taken ? weeksText(r.taken) : 'no leave'} already taken or paid, ordinary pay ${aud(Number(cents(input.pay)) / 100)} a week`,
  rows, principal: rows.length - 1, note };
}
