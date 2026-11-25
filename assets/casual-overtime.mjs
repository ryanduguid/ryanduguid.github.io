// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Pay for one pay period from rates the user states, and the super guarantee on the part that is
// ordinary time earnings. No award, agreement or minimum rate is held here: the base hourly rate, the
// casual loading, each penalty or overtime percentage and the hours at each are the user's inputs,
// found in the Fair Work Ombudsman's pay guides and Pay and Conditions Tool. Read 26 November 2026:
// - Superannuation Guarantee (Administration) Act 1992, Compilation No. 78 of 1 July 2026, s 6(1)
//   ('ordinary time earnings': earnings in respect of ordinary hours of work, and over-award payments,
//   shift-loading or commission), s 10A (qualifying earnings) and s 17A(2) (charge percentage 12).
// - SGR 2009/2 paras 22, 25, 27, 32, 35, 41 and 42 and example 5 (casual loading and shift loading on
//   ordinary hours are OTE; overtime is not; leave loading for lost overtime is not), withdrawn from
//   1 July 2026 by SGR 2009/2W, whose views draft LCR 2026/D1 paras 63 and 64 carry into qualifying
//   earnings; the ATO's 'What payments are qualifying earnings' (last updated 2 September 2026).
// - The ATO's 'Super guarantee' rates and thresholds (last updated 17 April 2026): 12% from 1 July 2025,
//   the quarterly maximum contribution base of $62,500 for 2025-26 (Table 24) and $270,830 a year for
//   2026-27 (Table 23).
// Every amount is worked in exact integers and rounded half up to the cent once per pay line; the
// super guarantee is 12% of the cents of ordinary time earnings, rounded half up.

import { ratioCents } from './money.mjs';

export const CASUAL_OVERTIME_PAYDAYS = ['2025-07-01', '2027-06-30'];
/** The last payday of the quarterly rules (SGR 2009/2 and old s 19) and its maximum contribution base in cents. */
const QUARTERLY_LAST = '2026-06-30';
const QUARTERLY_BASE = 6250000n;
const ANNUAL_BASE = 27083000n;
const MAX_LINES = 8;

/** @typedef {{hours: string, percent: string, overtime: boolean}} PayLine */
/** @typedef {{payday: string, base_rate: string, casual_loading: string, ordinary_hours: string, lines: PayLine[],
 *   leave_hours: string, leave_loading: string, leave_loading_overtime: boolean}} CasualOvertimeInput */
/** @typedef {{hours: number, percent: number, overtime: boolean, pay: number}} PaidLine */
/** @typedef {{payday: string, rules: 'quarterly' | 'payday', ordinaryPay: number, casualLoading: number, lines: PaidLine[],
 *   penaltyPay: number, overtimePay: number, leavePay: number, leaveLoading: number, grossPay: number, ote: number,
 *   notOte: number, sgRate: number, superGuarantee: number}} CasualOvertimeResult */

/** Digits with up to 2 decimal places as hundredths, refused outside `low` to `high` hundredths.
 * @param {unknown} value @param {string} what @param {bigint} low @param {bigint} high @returns {bigint} */
function hundredths(value, what, low, high) {
  const parts = typeof value === 'string' ? /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim()) : null;
  const n = parts ? BigInt(parts[1] + (parts[2] ?? '').padEnd(2, '0')) : -1n;
  if (n < low || n > high) {
    const words = (/** @type {bigint} */ x) => `${x / 100n}${x % 100n ? `.${String(x % 100n).padStart(2, '0')}` : ''}`;
    throw new Error(`Enter ${what} from ${words(low)} to ${words(high)}, with no more than 2 decimal places.`);
  }
  return n;
}

/** @param {bigint} c */
const dollars = (c) => Number(c) / 100;

/**
 * One pay period's gross pay and super guarantee from stated rates and hours.
 * @param {CasualOvertimeInput} x @returns {CasualOvertimeResult}
 */
export function casualOvertime(x) {
  const [first, last] = CASUAL_OVERTIME_PAYDAYS;
  const payday = typeof x.payday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.payday)
    && new Date(`${x.payday}T00:00:00Z`).toISOString().startsWith(x.payday) ? x.payday : '';
  if (!payday || payday < first || payday > last) {
    throw new Error('Enter a payday from 1 July 2025 to 30 June 2027, the paydays this calculator holds the 12% super guarantee '
      + 'and maximum contribution base for.');
  }
  const rate = hundredths(x.base_rate, 'the base hourly rate in dollars', 1n, 1000000n);
  const casual = hundredths(x.casual_loading, 'the casual loading as a percentage', 0n, 10000n);
  const ordinaryHours = hundredths(x.ordinary_hours, 'the ordinary hours', 0n, 100000n);
  if (!Array.isArray(x.lines) || x.lines.length > MAX_LINES) throw new Error(`Enter at most ${MAX_LINES} penalty or overtime lines.`);
  const leaveHours = hundredths(x.leave_hours, 'the hours of paid annual leave', 0n, 100000n);
  const leaveLoadingRate = hundredths(x.leave_loading, 'the annual leave loading as a percentage', 0n, 10000n);
  if (typeof x.leave_loading_overtime !== 'boolean') throw new Error('Answer whether the leave loading is for overtime lost on leave yes or no.');
  if (casual > 0n && leaveHours > 0n) {
    throw new Error('A casual employee’s loading is paid instead of paid leave: enter either a casual loading or hours of paid annual leave, not both.');
  }
  // rate is in cents; hours and percentages are in hundredths.
  const ordinaryPay = ratioCents(rate * ordinaryHours, 100n);
  const casualLoading = ratioCents(rate * ordinaryHours * casual, 1000000n);
  const lines = x.lines.map((line, k) => {
    if (typeof line?.overtime !== 'boolean') {
      throw new Error(`Say whether line ${k + 1} is overtime.`);
    }
    const hours = hundredths(line.hours, `the hours on line ${k + 1}`, 1n, 100000n);
    const percent = hundredths(line.percent, `the percentage of the base rate on line ${k + 1}`, 1n, 100000n);
    return { hours, percent, overtime: line.overtime, pay: ratioCents(rate * hours * percent, 1000000n) };
  });
  const leavePay = ratioCents(rate * leaveHours, 100n);
  const leaveLoading = ratioCents(rate * leaveHours * leaveLoadingRate, 1000000n);
  const sum = (/** @type {boolean} */ overtime) => lines.filter((l) => l.overtime === overtime).reduce((t, l) => t + l.pay, 0n);
  const penaltyPay = sum(false);
  const overtimePay = sum(true);
  const ote = ordinaryPay + casualLoading + penaltyPay + leavePay + (x.leave_loading_overtime ? 0n : leaveLoading);
  const grossPay = ordinaryPay + casualLoading + penaltyPay + overtimePay + leavePay + leaveLoading;
  const quarterly = payday <= QUARTERLY_LAST;
  const base = quarterly ? QUARTERLY_BASE : ANNUAL_BASE;
  if (ote > base) {
    throw new Error(`The ordinary time earnings for this pay alone exceed the ${quarterly ? 'quarterly' : '2026-27 annual'} maximum `
      + `contribution base of $${(base / 100n).toLocaleString('en-AU')}; this calculator does not apply the base.`);
  }
  return { payday, rules: quarterly ? 'quarterly' : 'payday', ordinaryPay: dollars(ordinaryPay), casualLoading: dollars(casualLoading),
    lines: lines.map((l) => ({ hours: Number(l.hours) / 100, percent: Number(l.percent) / 100, overtime: l.overtime, pay: dollars(l.pay) })),
    penaltyPay: dollars(penaltyPay), overtimePay: dollars(overtimePay), leavePay: dollars(leavePay), leaveLoading: dollars(leaveLoading),
    grossPay: dollars(grossPay), ote: dollars(ote), notOte: dollars(grossPay - ote), sgRate: 12,
    superGuarantee: dollars(ratioCents(ote * 12n, 100n)) };
}

/** The form's 4 lines, leaving out any with no hours. @param {(name: string) => string} value @returns {CasualOvertimeInput} */
export function casualOvertimeFormInput(value) {
  const lines = [1, 2, 3, 4].map((n) => ({ hours: value(`line${n}-hours`), percent: value(`line${n}-percent`),
    overtime: value(`line${n}-kind`) === 'overtime' })).filter((l) => l.hours.trim() !== '' && Number(l.hours) !== 0);
  return { payday: value('payday'), base_rate: value('rate'), casual_loading: value('casual'), ordinary_hours: value('ordinary'), lines,
    leave_hours: value('leave'), leave_loading: value('leave-loading'), leave_loading_overtime: value('leave-overtime') === 'yes' };
}

/** @param {string} iso */
const plainDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** @param {string} n */
const pct = (n) => `${Number(n)}%`;
/** @param {string} n @param {string} unit */
const hrs = (n, unit = 'hour') => `${Number(n)} ${unit}${Number(n) === 1 ? '' : 's'}`;

/** How the page writes the input. @param {CasualOvertimeInput} x @param {(value: number) => string} aud */
export function casualOvertimeInputsText(x, aud) {
  const parts = [`payday ${plainDay(x.payday)}`, `base rate ${aud(Number(x.base_rate))} an hour`];
  if (Number(x.casual_loading)) parts.push(`casual loading ${pct(x.casual_loading)}`);
  parts.push(`${hrs(x.ordinary_hours, 'ordinary hour')}`);
  for (const l of x.lines) parts.push(`${hrs(l.hours)} at ${pct(l.percent)}, ${l.overtime ? 'overtime' : 'ordinary hours'}`);
  if (Number(x.leave_hours)) {
    parts.push(`${hrs(x.leave_hours)} of annual leave${Number(x.leave_loading) ? ` with ${pct(x.leave_loading)} loading`
      + `${x.leave_loading_overtime ? ' for lost overtime' : ''}` : ''}`);
  }
  return parts.join('; ');
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function casualOvertimeResult(value, aud) {
  const input = casualOvertimeFormInput(value);
  const r = casualOvertime(input);
  const base = r.rules === 'payday' ? 'qualifying earnings' : 'ordinary time earnings';
  /** @type {[string, string][]} */
  const rows = [[`Ordinary hours at the base rate`, aud(r.ordinaryPay)]];
  if (r.casualLoading) rows.push([`Casual loading of ${pct(input.casual_loading)}`, aud(r.casualLoading)]);
  r.lines.forEach((l) => rows.push([`${hrs(String(l.hours))} at ${l.percent}%, ${l.overtime ? 'overtime, not ordinary time earnings' : 'ordinary hours'}`, aud(l.pay)]));
  if (r.leavePay) rows.push(['Annual leave at the base rate', aud(r.leavePay)]);
  if (r.leaveLoading) rows.push([`Leave loading${input.leave_loading_overtime ? ', for lost overtime, not ordinary time earnings' : ''}`, aud(r.leaveLoading)]);
  rows.push(['Gross pay', aud(r.grossPay)],
    [r.rules === 'payday' ? 'Qualifying earnings, the ordinary time earnings in this pay' : 'Ordinary time earnings', aud(r.ote)]);
  const principal = rows.push([`Super guarantee at ${r.sgRate}% of ${base}`, aud(r.superGuarantee)]) - 1;
  const note = r.rules === 'payday'
    ? 'Paid from 1 July 2026: the super guarantee is due for this payday under Payday Super, on qualifying earnings'
    : 'Paid by 30 June 2026: the quarterly super guarantee rules apply to this pay';
  return { inputs: casualOvertimeInputsText(input, aud), rows, principal, note };
}
