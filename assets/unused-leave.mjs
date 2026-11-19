// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { cents } from './money.mjs';
import { PAYS, withholding } from './payg-withholding.mjs';

// Unused annual leave, leave loading and long service leave paid on termination, for payments from
// 1 July 2026, read 19 November 2026:
// - ITAA 1997 ss 83-10 and 83-15 (annual leave and loading: assessable, with a tax offset keeping the
//   rate at 30% on a genuine redundancy, early retirement scheme or invalidity payment, or on leave
//   for employment before 18 August 1993), 83-80 (5% of long service leave for the pre-16/8/78 period
//   assessable, the rest of it neither assessable nor exempt income), 83-85 (the 30% offset for the
//   pre-18/8/93 period, and the post-17/8/93 period on those 3 reasons) and 83-90 (the periods).
// - The Commissioner's Schedule 7, 'Tax table for unused leave payments on termination of
//   employment' (published 17 June 2026): 32% from the offset-capped parts, the marginal rate
//   calculation on the rest with the 5% of pre-16 August 1978 leave added, the lesser of it and 32%
//   for a post-17 August 1993 payment from normal termination under $300, rounding to the nearest
//   dollar with 50 cents up, and 47% (45% for a foreign resident) of the payment with no TFN, cents
//   ignored. Its marginal rate calculation uses Schedule 1 through payg-withholding.mjs, without
//   the study and training support loan component.
// - The ATO's STP Phase 2 employer reporting guidelines, 'When an employee transfers or leaves'
//   (last updated 12 November 2025): lump sum A type R or T, lump sum B and paid leave type U.
// How much of each total accrued in each period (ss 83-95 to 83-115) is the user's figure.

/** @typedef {'normal' | 'genuine-redundancy' | 'early-retirement' | 'invalidity'} LeaveReason */
/** @typedef {'tfn' | 'tfn-foreign' | 'no-tfn' | 'no-tfn-foreign'} LeavePayee */
/** @typedef {{annual: string, loading: string, longService: string, accrualStart: string, reason: LeaveReason,
 *   annualBefore1993: string, loadingBefore1993: string, lslBefore1978: string, lsl1978To1993: string,
 *   payee: LeavePayee, earnings: string, period: string}} UnusedLeave */
/** @typedef {{onEarnings: number, share: number, withShare: number, beforeLimit: number, limited: boolean,
 *   periods: number}} MarginalWorking */
/** @typedef {{annualCapped: number, annualMarginal: number, lslPre1978: number, lslPre1978Assessable: number,
 *   lslPre1978NotAssessable: number, lslCapped: number, lslMarginal: number, assessable: number, capped: number,
 *   marginalAmount: number, flat: number | null, marginal: MarginalWorking | null, marginalWithheld: number | null,
 *   noTfnRate: number | null, withholding: number, lumpSumA: number, lumpSumAType: 'R' | 'T', lumpSumB: number,
 *   unusedLeave: number}} UnusedLeaveResult */

const REASONS = ['normal', 'genuine-redundancy', 'early-retirement', 'invalidity'];
// Schedule 7, 'When a TFN has not been provided'.
const NO_TFN_RATE = /** @type {Record<string, number>} */ ({ 'no-tfn': 47, 'no-tfn-foreign': 45 });
// The Schedule 1 scale of 'the relevant PAYG withholding tax table': 2 with the tax-free threshold, 3 for a
// foreign resident.
const SCALE = /** @type {Record<string, number>} */ ({ tfn: 2, 'tfn-foreign': 3 });
// Schedule 7: 32% and the $300 limit, in cents.
const FLAT_PERCENT = 32;
const SMALL_PAYMENT = 30000;

/** Amount `text` in cents, the field named in any refusal. @param {string} label @param {string} text */
function amount(label, text) {
  try {
    return cents(text);
  } catch (error) {
    throw new Error(`${label}: ${/** @type {Error} */ (error).message[0].toLowerCase()}${/** @type {Error} */ (error).message.slice(1)}`);
  }
}

/** A real ISO date from 1 January 1900 to 30 June 2027. @param {string} text */
function accrualDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof text === 'string' ? text : '');
  const day = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!match || !day || day.toISOString().slice(0, 10) !== text || text < '1900-01-01' || text > '2027-06-30') {
    throw new Error('Enter the day the leave began to accrue, from 1 January 1900 to 30 June 2027.');
  }
  return text;
}

/**
 * One part of a total: refused when given for a period the accrual start rules out or above its total,
 * and required when its period applies.
 * @param {string} label @param {string} text @param {number} total cents @param {string} totalName
 * @param {boolean} possible @param {boolean} needed @param {string} start
 * @returns {number | null} cents, or null when not given
 */
function part(label, text, total, totalName, possible, needed, start) {
  const given = typeof text === 'string' && text.trim() !== '' ? amount(label, text) : null;
  if (given && !possible) {
    throw new Error(`The leave accrued from ${plainDay(start)}, so none of it is ${label}: enter 0 or leave it blank.`);
  }
  if (given !== null && given > total) throw new Error(`The ${label} is more than the ${totalName} it is part of.`);
  if (given === null && needed && total) {
    throw new Error(`Enter the ${label}: the leave accrued from ${plainDay(start)}, so that part is taxed differently. Enter 0 if none of it is.`);
  }
  return given;
}

/** A day as '1 January 2026'. @param {string} iso */
const plainDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Dollars from 10,000ths of a dollar, to the nearest dollar with 50 cents up. @param {number} units */
const roundDollars = (units) => Math.floor((units + 5000) / 10000);

/**
 * The assessable shares, the 30% capped amount, the Schedule 7 withholding and the reporting labels of one
 * employee's unused leave paid on termination from 1 July 2026 to 30 June 2027.
 * @param {UnusedLeave} input money as decimal strings in AUD
 * @returns {UnusedLeaveResult} money in AUD
 */
export function unusedLeave(input) {
  const scale = SCALE[input.payee];
  const noTfnRate = NO_TFN_RATE[input.payee] ?? null;
  if (!scale && !noTfnRate) throw new Error('Choose whether the employee gave a TFN and is a foreign resident.');
  let earnings = 0;
  if (scale) {
    if (!Object.hasOwn(PAYS, input.period)) throw new Error('Choose weekly, fortnightly or monthly pay.');
    earnings = amount('Normal gross earnings', input.earnings);
  }
  if (!REASONS.includes(input.reason)) throw new Error('Choose the reason the employment ended.');
  const concessional = input.reason !== 'normal';
  const start = accrualDate(input.accrualStart);
  const [annual, loading, longService] = [['Annual leave', input.annual], ['Leave loading', input.loading],
    ['Long service leave', input.longService]].map(([label, text]) => amount(label, text));
  // A normal termination taxes annual leave and loading for employment before 18 August 1993 apart
  // (s 83-15(b)), and long service leave for the pre-18/8/93 period (s 83-85(2)(a)); the pre-16/8/78
  // period is 5% assessable whatever the reason (s 83-80(1) item 1).
  const before1993 = start < '1993-08-18';
  const before1978 = start < '1978-08-16';
  const needed1993 = before1993 && !concessional;
  const annual1993 = part('annual leave for employment before 18 August 1993', input.annualBefore1993, annual,
    'annual leave', before1993, needed1993, start) ?? 0;
  const loading1993 = part('leave loading for employment before 18 August 1993', input.loadingBefore1993, loading,
    'leave loading', before1993, needed1993, start) ?? 0;
  const pre1978 = part('long service leave for the period before 16 August 1978', input.lslBefore1978, longService,
    'long service leave', before1978, before1978, start) ?? 0;
  const lsl1993 = part('long service leave for 16 August 1978 to 17 August 1993', input.lsl1978To1993, longService,
    'long service leave', before1993, needed1993, start) ?? 0;
  if (pre1978 + lsl1993 > longService) {
    throw new Error('The long service leave before 16 August 1978 and from then to 17 August 1993 together are more than the long service leave.');
  }
  const annualCapped = concessional ? annual + loading : annual1993 + loading1993;
  const annualMarginal = annual + loading - annualCapped;
  const lslCapped = concessional ? longService - pre1978 : lsl1993;
  const lslMarginal = longService - pre1978 - lslCapped;
  const capped = annualCapped + lslCapped;
  const post1993 = annualMarginal + lslMarginal;
  // 5% of the pre-16/8/78 part, in 20ths of a cent: 20 × cents × 5% is the cents themselves.
  const marginalTwentieths = post1993 * 20 + pre1978;
  const under300 = Boolean(scale) && !concessional && post1993 > 0 && post1993 < SMALL_PAYMENT;
  if (under300 && pre1978) {
    throw new Error('A post-17 August 1993 payment under $300 has at most 32% of it withheld, and Schedule 7 does not say how to apply that limit when pre-16 August 1978 long service leave joins it in the marginal rate calculation.');
  }
  // Amounts in 20ths of a cent are shown rounded half up to the cent.
  const toCents = (/** @type {number} */ twentieths) => Math.floor((twentieths + 10) / 20) / 100;
  const shares = { annualCapped: annualCapped / 100, annualMarginal: annualMarginal / 100, lslPre1978: pre1978 / 100,
    lslPre1978Assessable: toCents(pre1978), lslPre1978NotAssessable: toCents(pre1978 * 19), lslCapped: lslCapped / 100,
    lslMarginal: lslMarginal / 100, assessable: toCents((annual + loading + longService) * 20 - pre1978 * 19),
    capped: capped / 100, marginalAmount: toCents(marginalTwentieths) };
  const labels = { lumpSumA: capped / 100, lumpSumAType: /** @type {'R' | 'T'} */ (concessional ? 'R' : 'T'),
    lumpSumB: pre1978 / 100, unusedLeave: post1993 / 100 };
  if (noTfnRate) {
    const withheld = Math.floor(((annual + loading + longService) * noTfnRate) / 10000);
    return { ...shares, flat: null, marginal: null, marginalWithheld: null, noTfnRate, withholding: withheld, ...labels };
  }
  const flat = roundDollars(capped * FLAT_PERCENT);
  // The marginal rate calculation, steps 1 to 7: the payment over the pay periods, cents ignored, added to
  // one pay's normal gross earnings, and the extra Schedule 1 then withholds, times the pay periods.
  const periods = PAYS[input.period];
  const onEarnings = withholding(earnings, input.period, scale, false).tax;
  const share = Math.floor(marginalTwentieths / (2000 * periods));
  const withShare = withholding(earnings + share * 100, input.period, scale, false).tax;
  const beforeLimit = (withShare - onEarnings) * periods;
  const marginalWithheld = under300 ? roundDollars(Math.min(beforeLimit * 10000, post1993 * FLAT_PERCENT)) : beforeLimit;
  return { ...shares, flat, marginal: { onEarnings, share, withShare, beforeLimit, limited: under300, periods },
    marginalWithheld, noTfnRate: null, withholding: flat + marginalWithheld, ...labels };
}

const REASON_TEXT = { normal: 'a normal termination', 'genuine-redundancy': 'a genuine redundancy',
  'early-retirement': 'an early retirement scheme', invalidity: 'invalidity' };
const PAYEE_TEXT = { tfn: 'TFN given, tax-free threshold claimed (scale 2)', 'tfn-foreign': 'foreign resident, TFN given (scale 3)',
  'no-tfn': 'no TFN given', 'no-tfn-foreign': 'foreign resident, no TFN given' };
const PERIOD_TEXT = /** @type {Record<string, string>} */ ({ week: 'a week', fortnight: 'a fortnight', month: 'a month' });

/** The page's inputs, rows and note.
 * @param {(name: string) => string} value the form's value for a field
 * @param {(amount: number) => string} aud money as the page writes it */
export function unusedLeaveResult(value, aud) {
  const input = /** @type {UnusedLeave} */ ({ annual: value('annual'), loading: value('loading'), longService: value('long-service'),
    accrualStart: value('accrual-start'), reason: value('reason'), annualBefore1993: value('annual-1993'),
    loadingBefore1993: value('loading-1993'), lslBefore1978: value('lsl-1978'), lsl1978To1993: value('lsl-1993'),
    payee: value('payee'), earnings: value('earnings'), period: value('period') });
  const r = unusedLeave(input);
  const money = (/** @type {string} */ text) => aud(cents(text) / 100);
  const pay = r.marginal ? `, normal gross earnings ${money(input.earnings)} ${PERIOD_TEXT[input.period]}` : '';
  const inputs = `annual leave ${money(input.annual)}, leave loading ${money(input.loading)}, long service leave `
    + `${money(input.longService)}, accrued from ${plainDay(input.accrualStart)}, ${REASON_TEXT[input.reason]}, `
    + `${PAYEE_TEXT[input.payee]}${pay}`;
  const rows = [[`Capped at 30%: lump sum A, type ${r.lumpSumAType}`, aud(r.capped)]];
  if (r.lslPre1978) {
    rows.push(['Long service leave before 16 August 1978: lump sum B', aud(r.lslPre1978)],
      ['5% of it, assessable at marginal rates', aud(r.lslPre1978Assessable)]);
  }
  rows.push(['At marginal rates: unused leave on termination (paid leave type U)', aud(r.unusedLeave)],
    ['Assessable income', aud(r.assessable)]);
  if (r.noTfnRate) {
    rows.push([`To withhold: ${r.noTfnRate}% of the payment, cents ignored`, aud(r.withholding)]);
    return { inputs, rows, principal: rows.length - 1,
      note: 'Without a TFN, Schedule 7 withholds from the whole payment, including any pre-16 August 1978 long service leave that is not assessable' };
  }
  const m = /** @type {MarginalWorking} */ (r.marginal);
  rows.push(['Withheld at 32% from lump sum A, to the nearest dollar', aud(/** @type {number} */ (r.flat))],
    [m.limited ? `Withheld from ${aud(r.marginalAmount)} at marginal rates, limited to 32% under $300` : `Withheld from ${aud(r.marginalAmount)} at marginal rates`,
      aud(/** @type {number} */ (r.marginalWithheld))],
    ['Total to withhold from the leave', aud(r.withholding)]);
  const note = r.marginalAmount
    ? `Marginal rate calculation: ${aud(r.marginalAmount)} over ${m.periods} pays is ${aud(m.share)} a pay with cents ignored; `
      + `Schedule 1 withholds ${aud(m.onEarnings)} from ${money(input.earnings)} and ${aud(m.withShare)} with it added, `
      + `so ${aud(m.withShare - m.onEarnings)} × ${m.periods} is ${aud(m.beforeLimit)}`
    : 'Nothing is paid at marginal rates, so all the withholding is 32% of lump sum A';
  return { inputs, rows, principal: rows.length - 1, note };
}
