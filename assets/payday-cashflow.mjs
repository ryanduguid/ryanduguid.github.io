// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { cents, ratioCents } from './money.mjs';
import { NON_BUSINESS_WEEKDAYS, paydaySuperDue } from './sgc-payday.mjs';
import { businessDays } from './business-days.mjs';

// The cash timing of super guarantee for one quarter of 2026-27 under Payday Super, against the
// quarterly rule it replaced, read 26 November 2026:
// - Payday Super: Superannuation Guarantee (Administration) Act 1992, Compilation No. 78 of 1 July
//   2026, s 17A(2) (12% of the qualifying earnings paid on the QE day) and the due date in
//   paydaySuperDue (sgc-payday.mjs): the end of the usual period, 7 business days after the QE day.
// - Quarterly rule: the Act's Compilation No. 77 of 27 March 2026, s 23(6): contributions made
//   within 28 days after the end of the quarter count for it. ATO Module 5 gives 28 October,
//   28 January, 28 April and 28 July; none of the 4 for 2026-27 falls on a weekend or a calendar holiday.
// Both dates are when the fund must receive the money; a clearing house needs time before that.

/** @typedef {'weekly' | 'fortnightly' | 'monthly'} PayCycle */
/** @typedef {{quarter: string, cycle: PayCycle, firstPayday: string, earnings: string}} CashflowInputs */
/** @typedef {{payday: string, sg: number, due: string, partDay: boolean, daysEarlier: number, ahead: number}} CashflowPayday */
/** @typedef {{paydays: CashflowPayday[], quarterlyDue: string, total: number, peak: number, peakFrom: string,
 *   peakDays: number, averageDaysEarlier: number}} CashflowResult */

const DAY = 86400000;
/** @param {string} iso */
const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;
/** @param {number} day */
const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);

/** Each quarter of 2026-27: its first and last day and the quarterly rule's due date. */
export const CASHFLOW_QUARTERS = {
  1: { from: '2026-07-01', to: '2026-09-30', due: '2026-10-28', name: 'July to September 2026' },
  2: { from: '2026-10-01', to: '2026-12-31', due: '2027-01-28', name: 'October to December 2026' },
  3: { from: '2027-01-01', to: '2027-03-31', due: '2027-04-28', name: 'January to March 2027' },
  4: { from: '2027-04-01', to: '2027-06-30', due: '2027-07-28', name: 'April to June 2027' },
};
const CYCLE_DAYS = { weekly: 7, fortnightly: 14 };
// The site's calendar as business-days.mjs reads a holiday table: every listed weekday is skipped.
// business-calculators.mjs re-exports this module and sgc-payday.mjs imports it back, so on a
// retried load sgc-payday.mjs may not have run yet: read its list inside the function only.
const calendar = () => NON_BUSINESS_WEEKDAYS.map((date) => ({ date, name: 'public holiday', jurisdictions: [] }));

/** The paydays in the quarter: every 7 or 14 days from the first, or the same day each month,
 * moved back to the month's last day where the month is shorter.
 * @param {{from: string, to: string}} quarter @param {PayCycle} cycle @param {string} first @returns {string[]} */
function paydaysIn(quarter, cycle, first) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(first ?? '') && isoOf(dayOf(first)) === first;
  const opening = cycle === 'monthly' ? quarter.from.slice(0, 8) + '31' : isoOf(dayOf(quarter.from) + (CYCLE_DAYS[cycle] ?? 0) - 1);
  if (!Object.hasOwn(CYCLE_DAYS, cycle) && cycle !== 'monthly') throw new Error('Choose weekly, fortnightly or monthly pay.');
  if (!valid || first < quarter.from || first > opening) {
    throw new Error(`Enter the first payday of the quarter: a date in its first ${cycle === 'monthly' ? 'month' : `${CYCLE_DAYS[cycle]} days`}.`);
  }
  const paydays = [];
  if (cycle === 'monthly') {
    const [year, month, date] = first.split('-').map(Number);
    for (let i = 0; i < 3; i += 1) {
      const last = new Date(Date.UTC(year, month + i, 0)).getUTCDate();
      paydays.push(isoOf(Date.UTC(year, month - 1 + i, Math.min(date, last)) / DAY));
    }
    return paydays;
  }
  for (let day = dayOf(first); day <= dayOf(quarter.to); day += CYCLE_DAYS[cycle]) paydays.push(isoOf(day));
  return paydays;
}

/** When the fund must receive each payday's super guarantee under Payday Super, and how much
 * earlier that is than the quarterly rule's single due date: the extra working capital is what has
 * left the business by each due date but would still be held under the quarterly rule.
 * @param {CashflowInputs} inputs @returns {CashflowResult} */
export function paydayCashflow(inputs) {
  const quarter = CASHFLOW_QUARTERS[/** @type {1 | 2 | 3 | 4} */ (Number(inputs.quarter))];
  if (!quarter || !/^[1-4]$/.test(inputs.quarter)) throw new Error('Choose a quarter of 2026-27.');
  // Section 17A(2): 12% of the qualifying earnings, rounded half up to the cent.
  const sg = Number(ratioCents(BigInt(cents(inputs.earnings)) * 12n, 100n));
  if (sg === 0) throw new Error('Enter ordinary time earnings of at least $0.05 each payday, so that 12% of them is a cent or more.');
  const quarterlyDue = dayOf(quarter.due);
  let ahead = 0;
  let weighted = 0;
  const paydays = paydaysIn(quarter, inputs.cycle, inputs.firstPayday).map((payday) => {
    let due;
    let partDay = false;
    try {
      due = paydaySuperDue({ payday, timing: 'standard', nextPayday: '', determination: '' }).due;
    } catch (error) {
      if (!String(/** @type {Error} */ (error).message).startsWith('This Payday Super deadline depends on part-day holidays')) throw error;
      // Counting 24 and 31 December as business days gives the earliest of the possible dates.
      due = /** @type {string} */ (businessDays({ mode: 'add', place: 'any', start: payday, end: '', count: '7' }, calendar()).date);
      partDay = true;
    }
    const daysEarlier = quarterlyDue - dayOf(due);
    ahead += sg;
    weighted += sg * daysEarlier;
    return { payday, sg: sg / 100, due, partDay, daysEarlier, ahead: ahead / 100 };
  });
  const last = paydays[paydays.length - 1];
  return { paydays, quarterlyDue: quarter.due, total: ahead / 100, peak: ahead / 100, peakFrom: last.due,
    peakDays: last.daysEarlier, averageDaysEarlier: Number(ratioCents(BigInt(weighted) * 10n, BigInt(ahead))) / 10 };
}

/** @param {number} day @returns {string} 'Tuesday 11 August 2026' */
const longDay = (day) => new Date(day * DAY).toLocaleDateString('en-AU',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** @param {number} day @returns {string} '11 August 2026' */
const plainDay = (day) => new Date(day * DAY).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** @param {number} n @param {string} word */
const count = (n, word) => `${n.toLocaleString('en-AU')} ${word}${n === 1 ? '' : 's'}`;

/** The inputs as the page states them.
 * @param {CashflowInputs} inputs @param {(amount: number) => string} aud */
export function cashflowInputsText(inputs, aud) {
  const quarter = CASHFLOW_QUARTERS[/** @type {1 | 2 | 3 | 4} */ (Number(inputs.quarter))];
  return `${quarter?.name ?? inputs.quarter}, paid ${inputs.cycle} from ${plainDay(dayOf(inputs.firstPayday))}, `
    + `ordinary time earnings ${aud(cents(inputs.earnings) / 100)} each payday`;
}

/** The page's inputs, rows and note.
 * @param {(name: string) => string} value the form's value for a field
 * @param {(amount: number) => string} aud money as the page writes it */
export function paydayCashflowResult(value, aud) {
  const inputs = { quarter: value('quarter'), cycle: /** @type {PayCycle} */ (value('cycle')), firstPayday: value('first-payday'),
    earnings: value('earnings') };
  const r = paydayCashflow(inputs);
  const quarterlyDue = dayOf(r.quarterlyDue);
  const rows = r.paydays.map((p) => [`Payday ${plainDay(dayOf(p.payday))}: ${aud(p.sg)}, fund must receive it by`,
    `${longDay(dayOf(p.due))}${p.partDay ? ' (earliest possible)' : ''}, ${count(p.daysEarlier, 'day')} before the quarterly date`]);
  rows.push([`Quarterly rule: ${aud(r.total)} for the quarter, fund to receive it by`, longDay(quarterlyDue)],
    ['Average days earlier, weighted by amount', r.averageDaysEarlier.toFixed(1)],
    ['Peak held', `${plainDay(dayOf(r.peakFrom))} to ${plainDay(quarterlyDue - 1)}, ${count(r.peakDays, 'day')}`],
    ['Peak extra working capital', aud(r.peak)]);
  const partDays = r.paydays.filter((p) => p.partDay).map((p) => plainDay(dayOf(p.payday)));
  return { inputs: cashflowInputsText(inputs, aud), rows, principal: rows.length - 1,
    note: partDays.length ? `For the ${new Intl.ListFormat('en-AU').format(partDays)} payday${partDays.length === 1 ? '' : 's'}, `
      + 'the due date depends on whether 24 or 31 December, part-day holidays, are business days; the date shown is the earliest possible'
      : undefined };
}
