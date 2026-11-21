// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// ASIC's standard fees for 2026-27 and the late fee for a due date and a payment or lodgement date.
// Read 22 November 2026:
// - ASIC's fee data, https://download.asic.gov.au/asic-nga/data/fees-data-current.json (SHA-256
//   03281f579127fbb38960ffcfc33311541b2a4eb61923f50353305eef103866da, YEARFEE 2026), which fills the
//   amounts on INFO 30 'Fees for commonly lodged documents' and 'Fee indexation' ('From 1 July 2026';
//   'GST does not apply to ASIC fees').
// - Corporations (Review Fees) Regulations 2003, Compilation No. 11, Sch 1 Pt 1 (review fees) and
//   Pt 3 items 1 and 2: 'Paying a review fee after the date on which the fee becomes due and payable,
//   but within one month after that date' and 'more than one month after'.
// - Corporations (Fees) Regulations 2001, Compilation No. 41, Sch 2 item 14: a document lodged
//   'within one month after the prescribed time' or 'more than one month after'.
// - Business Names Registration (Fees) Regulations 2022 s 6 items 1 to 4.
// - Acts Interpretation Act 1901 (Compilation of 28 March 2026) s 2G(1) (a month) and s 36(1) item 6
//   (a period that begins after a day excludes it), applied to regulations by Legislation Act 2003
//   s 13(1)(a); Corporations Act 2001 s 105(1) excludes the day too.
// The due date is the user's: the engine never works it out from a review date (s 1351(3)) and never
// moves it, or the end of the first month, for a weekend or holiday (AIA s 36(2), Corporations Act
// s 105(3)); a payment just after a weekend boundary is refused instead.

const DAY = 86400000;
export const ASIC_FEES_READ = '2026-11-22';
/** The payment or lodgement dates the 2026-27 amounts apply to. */
export const ASIC_FEE_YEAR = { from: '2026-07-01', to: '2027-06-30' };
/** The late fees in 2026-27 (LPF1_ETM and LPF2_ETM), in dollars. */
export const ASIC_LATE_FEES = { within: 102, beyond: 428 };

/** @typedef {'company-share-capital' | 'company-no-share-capital' | 'name-reservation' | 'review-proprietary' | 'review-public'
 *   | 'review-special-proprietary' | 'review-special-public' | 'business-name-1' | 'business-name-3'
 *   | 'late-review-payment' | 'late-lodgement'} AsicFeeType */
/** @typedef {{fee: AsicFeeType, due?: string, paid?: string}} AsicFeeInput */
/** @typedef {{fee: AsicFeeType, code: string, amount: number, tier: string | null, firstMonthEnds: string | null}} AsicFeeResult */

/** Each fee: its ASIC code, what it is, its amount in dollars (none for a late fee) and the item that imposes it.
 * @type {Record<AsicFeeType, {code: string, name: string, amount: number | null, item: string}>} */
export const ASIC_FEES = {
  'company-share-capital': { code: 'I02', name: 'Register a company with share capital', amount: 636,
    item: 'Corporations (Fees) Regulations 2001, Schedule 1 item 1(a)(i)' },
  'company-no-share-capital': { code: 'I01', name: 'Register a company without share capital', amount: 524,
    item: 'Corporations (Fees) Regulations 2001, Schedule 1 item 1(a)(ii)' },
  'name-reservation': { code: 'R01', name: 'Reserve a company name, or extend a reservation', amount: 65,
    item: 'Corporations (Fees) Regulations 2001, Schedule 2 item 8' },
  'review-proprietary': { code: 'A52', name: 'Annual review fee, proprietary company (not a special purpose company)', amount: 342,
    item: 'Corporations (Review Fees) Regulations 2003, Schedule 1 Part 1 item 2' },
  'review-public': { code: 'A51', name: 'Annual review fee, public company (not a special purpose company or small transferring financial institution)',
    amount: 1591, item: 'Corporations (Review Fees) Regulations 2003, Schedule 1 Part 1 item 1' },
  'review-special-proprietary': { code: 'A58', name: 'Annual review fee, special purpose company that is a proprietary company', amount: 70,
    item: 'Corporations (Review Fees) Regulations 2003, Schedule 1 Part 1 item 5' },
  'review-special-public': { code: 'A53', name: 'Annual review fee, special purpose company that is not a proprietary company', amount: 65,
    item: 'Corporations (Review Fees) Regulations 2003, Schedule 1 Part 1 item 4' },
  'business-name-1': { code: 'BZA or BZC', name: 'Register or renew a business name for 1 year', amount: 47,
    item: 'Business Names Registration (Fees) Regulations 2022, section 6 items 1 and 2' },
  'business-name-3': { code: 'BZB or BZD', name: 'Register or renew a business name for 3 years', amount: 108,
    item: 'Business Names Registration (Fees) Regulations 2022, section 6 items 3 and 4' },
  'late-review-payment': { code: 'LPF1_ETM or LPF2_ETM', name: 'Late payment of an annual review fee', amount: null,
    item: 'Corporations (Review Fees) Regulations 2003, Schedule 1 Part 3 items 1 and 2' },
  'late-lodgement': { code: 'LPF1_ETM or LPF2_ETM', name: 'Late lodgement of a document', amount: null,
    item: 'Corporations (Fees) Regulations 2001, Schedule 2 item 14' },
};

/** A real date as YYYY-MM-DD, as a count of days. @param {unknown} text */
function dayOf(text) {
  const match = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : null;
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (year >= 1900 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return time / DAY;
  }
  throw new Error('Enter a real date as YYYY-MM-DD.');
}
/** @param {number} day */
const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** 0 is Sunday and 6 Saturday. @param {number} day */
const weekdayOf = (day) => new Date(day * DAY).getUTCDay();

/** The last day of the month that starts the day after `due` (AIA s 36(1) item 6). Under s 2G(1) it
 * ends immediately before the corresponding day of the next calendar month or, if there is none, at
 * that month's end. @param {number} due */
export function firstMonthEnds(due) {
  const start = new Date((due + 1) * DAY);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const length = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  const corresponding = start.getUTCDate();
  if (corresponding <= length) return Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), corresponding) / DAY - 1;
  return Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), length) / DAY;
}

/** A payment after a Saturday or Sunday boundary and by the following Wednesday may fall under the
 * next-business-day rules, which this page does not apply. @param {number} boundary @param {number} paid */
const afterWeekend = (boundary, paid) => {
  const weekday = weekdayOf(boundary);
  return (weekday === 6 || weekday === 0) && paid > boundary && paid <= boundary + (weekday === 6 ? 4 : 3);
};

/** One ASIC fee for 2026-27, and for a late fee the tier its dates fall in.
 * @param {AsicFeeInput} input @returns {AsicFeeResult} */
export function asicFee({ fee, due, paid }) {
  const entry = Object.hasOwn(ASIC_FEES, fee) ? ASIC_FEES[fee] : null;
  if (!entry) throw new Error('Choose a fee.');
  if (entry.amount !== null) return { fee, code: entry.code, amount: entry.amount, tier: null, firstMonthEnds: null };
  const dueDay = dayOf(due);
  const paidDay = dayOf(paid);
  if (paidDay < dayOf(ASIC_FEE_YEAR.from) || paidDay > dayOf(ASIC_FEE_YEAR.to)) {
    throw new Error('This page holds ASIC’s 2026-27 amounts, for payments and lodgements from 1 July 2026 to 30 June 2027.');
  }
  const ends = firstMonthEnds(dueDay);
  const result = { fee, code: 'LPF1_ETM', amount: ASIC_LATE_FEES.within, tier: 'within one month', firstMonthEnds: isoOf(ends) };
  if (paidDay <= dueDay) return { ...result, code: '', amount: 0, tier: 'not late' };
  if (afterWeekend(dueDay, paidDay)) {
    throw new Error('The due date is a Saturday or Sunday, so subsection 105(3) of the Corporations Act or subsection 36(2) of the Acts '
      + 'Interpretation Act may move it; this page does not decide that. Check ASIC’s invoice.');
  }
  if (paidDay <= ends) return result;
  if (afterWeekend(ends, paidDay)) {
    throw new Error('The first month after the due date ends on a Saturday or Sunday, so subsection 105(3) of the Corporations Act or '
      + 'subsection 36(2) of the Acts Interpretation Act may extend it; this page does not decide that. Check ASIC’s invoice.');
  }
  return { ...result, code: 'LPF2_ETM', amount: ASIC_LATE_FEES.beyond, tier: 'more than one month' };
}

/** @param {AsicFeeType} fee */
const isLate = (fee) => fee === 'late-review-payment' || fee === 'late-lodgement';
/** 'Tuesday 15 September 2026'. @param {string} iso */
const longDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The engine's input from the page's fields. @param {(name: string) => string} value @returns {AsicFeeInput} */
export function asicFeeFormInput(value) {
  const fee = /** @type {AsicFeeType} */ (value('fee'));
  return isLate(fee) ? { fee, due: value('due'), paid: value('paid') } : { fee };
}

/** How the page writes an input. @param {AsicFeeInput} input */
export function asicFeeInputsText({ fee, due, paid }) {
  const name = ASIC_FEES[fee]?.name ?? fee;
  if (!isLate(fee)) return name;
  const act = fee === 'late-lodgement' ? 'lodged' : 'paid';
  return `${name}, due ${longDay(String(due))}, ${act} ${longDay(String(paid))}`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function asicFeesResult(value, aud) {
  const input = asicFeeFormInput(value);
  const r = asicFee(input);
  const { item } = ASIC_FEES[r.fee];
  if (r.tier === null) {
    return { inputs: asicFeeInputsText(input), principal: 0, rows: [['ASIC fee, no GST', aud(r.amount)]],
      note: `ASIC code ${r.code}; ${item}` };
  }
  const act = r.fee === 'late-lodgement' ? 'lodged' : 'paid';
  const tier = { 'not late': `Not late: ${act} on or before the due date`, 'within one month': 'Late, within one month after the due date',
    'more than one month': 'Late, more than one month after the due date' }[r.tier];
  const rows = [['Late fee tier', tier], ['Late fee, no GST', aud(r.amount)]];
  if (r.amount) rows.unshift(['Last day of the first month after the due date', longDay(String(r.firstMonthEnds))]);
  return { inputs: asicFeeInputsText(input), principal: rows.length - 1, rows,
    note: `${r.code ? `ASIC code ${r.code}; ` : ''}${item}. A late fee is on top of the fee itself. Public holidays are not checked: if the due `
      + 'date or the last day of the first month is one where you pay or lodge, check ASIC’s invoice' };
}
