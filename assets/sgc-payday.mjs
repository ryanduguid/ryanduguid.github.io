// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { cents, number, ratioCents } from './money.mjs';
// business-calculators.mjs re-exports this module, so GIC_QUARTERS is read inside functions only.
import { GIC_QUARTERS } from './business-calculators.mjs';

// The super guarantee charge for one employee, read 18 November 2026:
// - Payday Super, for a payday (QE day) from 1 July 2026: Superannuation Guarantee (Administration)
//   Act 1992, Compilation No. 78 of 1 July 2026 (C2026C00272), https://www.legislation.gov.au/C2004A04402/latest/text,
//   ss 6(1) (business day, usual period, extended usual period, late period), 10A(5) and (6), 16B, 17A,
//   18C, 18D, 19A and 19B; the Superannuation Guarantee (Administration) Regulations 2018, Compilation
//   No. 8 of 1 July 2026, regs 13C and 13D; the Treasury Laws Amendment (Payday Superannuation) Act 2025
//   (No. 57, 2025) Sch 1 items 182 and 186.
// - A quarter ending by 30 June 2026: the Act as in force on the quarter's last day (item 182(3)),
//   read in Compilation No. 77 of 27 March 2026, ss 6(1) (ordinary time earnings), 17, 19, 23, 31, 32
//   and 46; the Regulations' Compilation No. 7 of 18 October 2022, reg 13 (10% a year).
// Which earnings are qualifying earnings, salary or wages or ordinary time earnings, which
// contributions count and when a fund received them are the user's facts: the engine counts them.

/** @typedef {'standard' | 'first' | 'out-of-cycle' | 'exceptional'} PaydayTiming */
/** @typedef {{payday: string, timing: PaydayTiming, nextPayday: string, determination: string, earnings: string,
 *   earlier: string, onTime: string, late: string, received: string, assessment: string, assessed: 'yes' | 'no',
 *   disclosure: 'none' | 'lodged', lodged: string, assumedRate: string}} PaydayCharge */
/** @typedef {{due: string, rule: string, sgAmount: number, base: number, applied: number, final: number,
 *   businessDays: number | null, daysLate: number | null, earningsTo: string | null,
 *   days: number, assumedDays: number, notional: number, upliftPercent: number, uplift: number, charge: number}} PaydayResult */
/** @typedef {{year: '2022-23' | '2023-24' | '2024-25' | '2025-26', quarter: '1' | '2' | '3' | '4', wages: string,
 *   ote: string, contributions: string, lodged: string}} QuarterCharge */
/** @typedef {{start: string, contributionsDue: string, lodgmentDay: string, payable: string, chargePercent: number,
 *   shortfall: number, days: number, interest: number, administration: number, charge: number}} QuarterResult */

const DAY = 86400000;
/** @param {string} iso */
const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;
/** @param {number} day */
const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** @param {number} day @returns {string} 'Tuesday 11 August 2026' */
const longDay = (day) => new Date(day * DAY).toLocaleDateString('en-AU',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** @param {number} day @returns {string} '11 August 2026' */
const plainDay = (day) => new Date(day * DAY).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** @param {number} year */
const yearDays = (year) => (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365);

/** A date field as a day number, refused unless it is a real date from `from` to `to`.
 * @param {unknown} value @param {string} what @param {string} from @param {string} to */
function dateField(value, what, from, to) {
  const day = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? dayOf(value) : NaN;
  if (!Number.isInteger(day) || isoOf(day) !== value || value < from || value > to) {
    throw new Error(`Enter ${what} from ${plainDay(dayOf(from))} to ${plainDay(dayOf(to))}.`);
  }
  return day;
}

// The site's Payday Super calendar (tools/payday-super/business-days/): the weekdays from
// 1 July 2026 to 31 August 2027 that are a public holiday for the whole of a State, the ACT or
// the NT, so not business days under s 6(1). A Node test holds this list to that page's CSV.
export const CALENDAR_END = '2027-08-31';
export const NON_BUSINESS_WEEKDAYS = ['2026-08-03', '2026-09-25', '2026-10-05', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-01-26', '2027-03-01', '2027-03-08', '2027-03-26', '2027-03-29', '2027-04-26', '2027-05-03',
  '2027-05-31', '2027-06-07', '2027-06-14', '2027-08-02'];
const HOLIDAYS = new Set(NON_BUSINESS_WEEKDAYS.map(dayOf));
/** @param {number} day */
const businessDay = (day) => ![0, 6].includes(new Date(day * DAY).getUTCDay()) && !HOLIDAYS.has(day);

/** The nth business day after `day`; the day itself does not count.
 * @param {number} day @param {number} n */
function businessDaysAfter(day, n) {
  for (let found = 0; found < n;) {
    day += 1;
    if (day > dayOf(CALENDAR_END)) {
      throw new Error('That due date falls after 31 August 2027, where the business day calendar ends.');
    }
    if (businessDay(day)) found += 1;
  }
  return day;
}

/** The last day the fund can receive an on-time contribution for a payday (QE day): the end of
 * the usual period, 7 business days after it (s 6(1), s 18C(1)(c)(i)), or a longer period in the
 * table in s 18C(2): item 1, the extended usual period of 20 business days, for the first
 * contribution to a fund after the employee starts or the employer stops paying another fund;
 * item 2, the usual period for the next regular payday, for out-of-cycle earnings; item 3, the
 * later of 20 business days after the payday and 20 business days starting the day after an
 * exceptional circumstances determination is made. Item 4 is not applied.
 * @param {{payday: string, timing: PaydayTiming, nextPayday: string, determination: string}} inputs
 * @returns {{due: string, rule: string}} */
export function paydaySuperDue({ payday, timing, nextPayday, determination }) {
  const qe = dateField(payday, 'a payday', '2026-07-01', '2027-06-30');
  if (timing === 'standard') return { due: isoOf(businessDaysAfter(qe, 7)), rule: '7 business days after payday' };
  if (timing === 'first') {
    return { due: isoOf(businessDaysAfter(qe, 20)), rule: '20 business days after payday, subsection 18C(2) item 1' };
  }
  if (timing === 'out-of-cycle') {
    const next = dateField(nextPayday, 'the next regular payday', '2026-07-01', CALENDAR_END);
    if (next <= qe) throw new Error('The next regular payday must be after the out-of-cycle payday.');
    return { due: isoOf(businessDaysAfter(next, 7)), rule: '7 business days after the next regular payday, subsection 18C(2) item 2' };
  }
  if (timing === 'exceptional') {
    const made = dateField(determination, 'the day the determination was made', '2026-07-01', CALENDAR_END);
    return { due: isoOf(Math.max(businessDaysAfter(qe, 20), businessDaysAfter(made, 20))),
      rule: 'the later of 20 business days after payday and after the determination, subsection 18C(2) item 3' };
  }
  throw new Error('Choose how long the fund has to receive the contribution.');
}

/** Notional earnings on a base shortfall, compounding daily: each day adds the day's GIC rate
 * times the base shortfall and the earlier days' earnings (s 19A(2)). `rates` holds each day's
 * annual rate in hundredths of 1% and the days in its calendar year (Taxation Administration
 * Act 1953 s 8AAD(1)). Rounded half up to the cent at the end.
 * @param {number} base cents @param {Array<[number, number]>} rates */
export function compoundedEarnings(base, rates) {
  let [grown, scale] = [BigInt(base), 1n];
  for (const [rate, days] of rates) {
    const whole = 10000n * BigInt(days);
    [grown, scale] = [grown * (whole + BigInt(rate)), scale * whole];
  }
  return Number(ratioCents(grown - BigInt(base) * scale, scale));
}

/** Each day's GIC rate from the ATO's quarterly table, and `assumed` after its last quarter.
 * @param {number} from @param {number} to the first and last day @param {number} assumed hundredths of 1% */
function gicRates(from, to, assumed) {
  const quarters = GIC_QUARTERS.map(([start, rate]) => [dayOf(start), Math.round(Number(rate) * 100)]);
  const last = new Date(quarters[quarters.length - 1][0] * DAY);
  const tableEnd = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 3, 1) / DAY;
  /** @type {Array<[number, number]>} */
  const rates = [];
  for (let day = from; day <= to; day += 1) {
    const rate = day >= tableEnd ? assumed : quarters.filter(([start]) => start <= day).pop()?.[1] ?? assumed;
    rates.push([rate, yearDays(new Date(day * DAY).getUTCFullYear())]);
  }
  return { rates, assumedDays: Math.max(0, to - Math.max(from, tableEnd) + 1) };
}

// The maximum contributions base for 2026-27, $270,830 (s 10A(5); ATO Key superannuation rates and
// thresholds, Table 23), in cents, and the charge percentage of 12 (s 17A(2)).
const MAXIMUM_BASE_2026_27 = 27083000;
const CHARGE_PERCENT = 12;
// Regulation 13D: the uplift's reduction in percentage points by the days from the payday to a
// voluntary disclosure statement's lodgment, the payday being day 0: within the 30-day period
// starting on the payday, then to the end of the 60 and 120-day periods, then later.
const DISCLOSURE = [[29, 40], [59, 35], [119, 30], [Infinity, 15]];
const LATEST = '2031-06-30';

/** The super guarantee charge for one employee and one payday from 1 July 2026 (s 16B(2)), less
 * the choice loading: the individual final shortfall (s 18D), notional earnings on the base
 * shortfall (s 19A) and the administrative uplift (s 19B, regs 13C and 13D).
 * @param {PaydayCharge} inputs @returns {PaydayResult} */
export function paydaySuperCharge(inputs) {
  const { due, rule } = paydaySuperDue(inputs);
  const [qe, dueDay] = [dayOf(inputs.payday), dayOf(due)];
  const earnings = cents(inputs.earnings);
  if (earnings === 0) throw new Error('Enter the qualifying earnings paid on the payday, above nil.');
  // Section 10A(6): earnings past the year's maximum contributions base count as nil.
  const counted = Math.min(earnings, Math.max(0, MAXIMUM_BASE_2026_27 - cents(inputs.earlier)));
  const sgAmount = Number(ratioCents(BigInt(counted) * BigInt(CHARGE_PERCENT), 100n));
  const [onTime, late] = [cents(inputs.onTime), cents(inputs.late)];
  const base = Math.max(0, sgAmount - onTime);
  const none = { businessDays: null, daysLate: null, earningsTo: null, days: 0, assumedDays: 0, notional: 0,
    upliftPercent: 0, uplift: 0 };
  if (base === 0) return { due, rule, sgAmount: sgAmount / 100, base: 0, applied: 0, final: 0, ...none, charge: 0 };
  const assessment = dateField(inputs.assessment, 'the assessment date', isoOf(dueDay + 1), LATEST);
  let received = null;
  if (late > 0) {
    received = dateField(inputs.received, 'the day the fund received the late contributions', '2026-07-01', LATEST);
    if (received <= dueDay) throw new Error('A contribution the fund received by the due date is on time: add it to the on-time amount.');
    if (received >= assessment) {
      throw new Error('A contribution the fund receives on or after the assessment day does not count for it: leave it out.');
    }
  }
  const applied = Math.min(late, base);
  const final = base - applied;
  // Section 19A(1): the late period starts the day after the due date and ends the day before
  // the assessment; earnings accrue on each day the final shortfall is above nil, which the ATO
  // counts to the day the fund receives the contribution that clears it.
  const last = final === 0 && received !== null ? received : assessment - 1;
  const assumed = Math.round(number(inputs.assumedRate, { min: 0.01, max: 100 }) * 100);
  const { rates, assumedDays } = gicRates(dueDay + 1, last, assumed);
  const notional = compoundedEarnings(base, rates);
  if (!['yes', 'no'].includes(inputs.assessed)) throw new Error('Choose whether the ATO has assessed or estimated SG charge for this employer.');
  let upliftPercent = 60 - (inputs.assessed === 'no' ? 20 : 0);
  if (inputs.disclosure === 'lodged') {
    const lodged = dateField(inputs.lodged, 'the day the voluntary disclosure statement was lodged', inputs.payday,
      isoOf(assessment - 1));
    upliftPercent -= DISCLOSURE.find(([upTo]) => lodged - qe <= upTo)?.[1] ?? 0;
  } else if (inputs.disclosure !== 'none') {
    throw new Error('Choose whether a voluntary disclosure statement was lodged.');
  }
  const uplift = Number(ratioCents(BigInt(final + notional) * BigInt(upliftPercent), 100n));
  return { due, rule, sgAmount: sgAmount / 100, base: base / 100, applied: applied / 100, final: final / 100,
    businessDays: received !== null && received <= dayOf(CALENDAR_END)
      ? Array.from({ length: received - qe }, (_, i) => qe + 1 + i).filter(businessDay).length : null,
    daysLate: received === null ? null : received - dueDay,
    earningsTo: last > dueDay ? isoOf(last) : null,
    days: Math.max(0, last - dueDay), assumedDays, notional: notional / 100, upliftPercent, uplift: uplift / 100,
    charge: (final + notional + uplift) / 100 };
}

// Charge percentage in hundredths of 1% (old s 19(2)) and the quarterly maximum contribution base in
// cents (old s 15; ATO Key superannuation rates and thresholds, Table 24), by income year.
const QUARTER_YEARS = { '2022-23': [1050, 6022000], '2023-24': [1100, 6227000], '2024-25': [1150, 6507000],
  '2025-26': [1200, 6250000] };

/** The super guarantee charge for one employee and one quarter ending by 30 June 2026 (old s 17):
 * the individual shortfall (old s 19, with the charge percentage reduced by contributions under
 * old s 23), nominal interest at 10% a year from the quarter's first day to the day the charge is
 * payable (old s 31, reg 13, old s 46) and the $20 administration component (old s 32). The ATO
 * divides by the days in the year; for a period with a 29 February it does not say which year,
 * so the engine refuses one. The late payment offset (old s 23A) is not applied.
 * @param {QuarterCharge} inputs @returns {QuarterResult} */
export function quarterlySgCharge(inputs) {
  const year = QUARTER_YEARS[inputs.year];
  if (!year) throw new Error('Choose the income year of the quarter.');
  if (!['1', '2', '3', '4'].includes(inputs.quarter)) throw new Error('Choose the quarter.');
  const [percent, maximum] = year;
  const first = Number(inputs.year.slice(0, 4)) + (inputs.quarter > '2' ? 1 : 0);
  const month = { 1: 6, 2: 9, 3: 0, 4: 3 }[inputs.quarter];
  const start = Date.UTC(first, month, 1) / DAY;
  const end = Date.UTC(first, month + 3, 1) / DAY - 1;
  const contributionsDue = end + 28;
  // Old s 46(2): the 28th day of the second month after the quarter.
  const lodgmentDay = Date.UTC(first, month + 4, 28) / DAY;
  const lodged = dateField(inputs.lodged, 'the day the statement was or will be lodged', isoOf(contributionsDue + 1), LATEST);
  const payable = Math.max(lodgmentDay, lodged);
  for (let day = start; day < payable; day += 1) {
    if (isoOf(day).endsWith('-02-29')) {
      throw new Error('The nominal interest period includes 29 February, and the ATO does not say whether that year has 365 or 366 days.');
    }
  }
  const wages = Math.min(cents(inputs.wages), maximum);
  const ote = Math.min(cents(inputs.ote), maximum);
  const contributions = cents(inputs.contributions);
  if (contributions > 0 && ote === 0) {
    throw new Error('Enter the ordinary time earnings for the quarter: contributions reduce the charge percentage in proportion to them.');
  }
  // Shortfall = salary or wages x (percentage - contributions x 100 / OTE) / 100, in hundredths of 1%.
  const [top, bottom] = ote === 0 ? [BigInt(percent), 10000n]
    : [BigInt(Math.max(0, percent * ote - 10000 * contributions)), 10000n * BigInt(ote)];
  const shortfall = Number(ratioCents(BigInt(wages) * top, bottom));
  const days = payable - start;
  const interest = Number(ratioCents(BigInt(shortfall) * BigInt(days) * 10n, 36500n));
  const administration = shortfall > 0 ? 2000 : 0;
  return { start: isoOf(start), contributionsDue: isoOf(contributionsDue), lodgmentDay: isoOf(lodgmentDay),
    payable: isoOf(payable), chargePercent: Number((top * 10000n * 2n + bottom) / (2n * bottom)) / 100,
    shortfall: shortfall / 100, days, interest: interest / 100, administration: administration / 100,
    charge: (shortfall + interest + administration) / 100 };
}

const TIMING = { standard: 'the usual 7 business days', first: 'first contribution to this fund, 20 business days',
  'out-of-cycle': 'out-of-cycle earnings', exceptional: 'an exceptional circumstances determination' };
/** @param {number} n @param {string} word */
const count = (n, word) => `${n.toLocaleString('en-AU')} ${word}${n === 1 ? '' : 's'}`;

/** The page's inputs, rows and note for either regime.
 * @param {(name: string) => string} value the form's value for a field
 * @param {(amount: number) => string} aud money as the page writes it */
export function sgcPaydayResult(value, aud) {
  const money = (/** @type {string} */ name) => aud(cents(value(name)) / 100);
  if (value('regime') === 'quarter') {
    const inputs = /** @type {QuarterCharge} */ ({ year: value('year'), quarter: value('quarter'), wages: value('wages'),
      ote: value('ote'), contributions: value('contributions'), lodged: value('statement') });
    const r = quarterlySgCharge(inputs);
    const rows = [['Contributions were due', longDay(dayOf(r.contributionsDue))],
      ['Charge percentage after contributions', `${r.chargePercent.toFixed(2)}%`], ['Individual SG shortfall', aud(r.shortfall)]];
    if (r.shortfall > 0) {
      rows.push([`Nominal interest, 10% a year for ${count(r.days, 'day')} from ${plainDay(dayOf(r.start))}`, aud(r.interest)],
        ['Administration component', aud(r.administration)], ['SG charge for the quarter', aud(r.charge)]);
    }
    return { inputs: `quarter ${inputs.quarter} of ${inputs.year}, salary or wages ${money('wages')}, ordinary time earnings `
      + `${money('ote')}, contributions counted for the quarter ${money('contributions')}, statement lodged `
      + `${plainDay(dayOf(inputs.lodged))}`, rows, principal: rows.length - 1,
    note: r.shortfall > 0 ? `The charge is payable on ${longDay(dayOf(r.payable))}, the later of the lodgment day `
      + `${plainDay(dayOf(r.lodgmentDay))} and the day the statement is lodged. No late payment offset is applied`
      : 'Contributions counted for the quarter bring the charge percentage to nil, so there is no SG charge' };
  }
  const inputs = /** @type {PaydayCharge} */ ({ payday: value('payday'), timing: value('timing'), nextPayday: value('next-payday'),
    determination: value('determination'), earnings: value('earnings'), earlier: value('earlier'), onTime: value('on-time'),
    late: value('late'), received: value('received'), assessment: value('assessment'), assessed: value('assessed'),
    disclosure: value('disclosure'), lodged: value('disclosed'), assumedRate: value('assumed-rate') });
  const r = paydaySuperCharge(inputs);
  const timing = TIMING[inputs.timing] ?? '';
  const extra = inputs.timing === 'out-of-cycle' ? `, next regular payday ${plainDay(dayOf(inputs.nextPayday))}`
    : inputs.timing === 'exceptional' ? `, determination made ${plainDay(dayOf(inputs.determination))}` : '';
  const stated = `payday ${plainDay(dayOf(inputs.payday))}, ${timing}${extra}, qualifying earnings ${money('earnings')}`
    + `${cents(inputs.earlier) ? ` after ${money('earlier')} earlier in 2026-27` : ''}, on time ${money('on-time')}`;
  const rows = [[`Fund must receive it by (${r.rule})`, longDay(dayOf(r.due))], ['SG amount, 12%', aud(r.sgAmount)]];
  if (r.base === 0) {
    rows.push(['Base shortfall', aud(0)]);
    return { inputs: stated, rows, principal: 0, note: r.sgAmount ? 'Contributions received by the due date cover the SG amount, so there is no SG charge for this payday'
      : 'Earlier qualifying earnings in 2026-27 have reached the maximum contributions base of $270,830, so the SG amount is nil' };
  }
  if (r.daysLate !== null) {
    rows.push(['Late contributions received', `${longDay(dayOf(inputs.received))}, ${count(r.daysLate, 'day')} late`]);
    if (r.businessDays !== null) rows.push(['Business days from payday to receipt', String(r.businessDays)]);
  }
  rows.push(['Base shortfall', aud(r.base)], ['Late contributions applied', aud(r.applied)], ['Final shortfall', aud(r.final)],
    [r.days ? `Notional earnings, ${count(r.days, 'day')} to ${plainDay(dayOf(/** @type {string} */ (r.earningsTo)))}` : 'Notional earnings',
      aud(r.notional)],
    [`Administrative uplift, ${r.upliftPercent}%`, aud(r.uplift)], ['SG charge for the payday, before any choice loading', aud(r.charge)]);
  const lodged = inputs.disclosure === 'lodged' ? `voluntary disclosure lodged ${plainDay(dayOf(inputs.lodged))}` : 'no voluntary disclosure';
  return { inputs: `${stated}, late ${money('late')}, assessment ${plainDay(dayOf(inputs.assessment))}, `
    + `${inputs.assessed === 'no' ? 'no' : 'an'} ATO-initiated assessment or estimate since 1 July 2026, ${lodged}`,
  rows, principal: rows.length - 1,
  note: r.assumedDays ? `${count(r.assumedDays, 'day')} after December 2026 use the assumed GIC rate of ${value('assumed-rate')}%` : undefined };
}
