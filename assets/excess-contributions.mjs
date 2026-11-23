// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { ABOVE_NIL, GIC_TABLE_END, dayOf, dollarsText, gicOn, isoOf, knownKeys, readInput, refuse, required, scope, statedAmount,
  yearLength } from './transfer-balance.mjs';

// The excess concessional contributions charge for 2013-14 to 2020-21, and the release of excess
// non-concessional contributions with their associated earnings for contributions years 2013-14 to
// 2025-26, as the `excess-contributions` command of ryanduguid/australian-accounting works them, from
// the same input, with its exact arithmetic, rounding and refusal codes. Estimates of what the
// Commissioner's determination states. The command's sources, read for it on 22 November 2026:
// - TAA 1953 s 8AAD and Sch 1 ss 97-25 and 97-30 (compilation 227) and former Div 95 (compilation 180).
// - Superannuation (Excess Concessional Contributions Charge) Act 2013 ss 4 and 5; Treasury Laws
//   Amendment (More Flexible Superannuation) Act 2021 (No. 45, 2021) Sch 2 item 14.
// - ITAA 1997 ss 292-20, 292-25 and 292-30.
// - The ATO's 'Contributions caps' (last updated 11 September 2026), Tables 3 and 5, and 'General
//   interest charge (GIC) rates' (4 September 2026).
// The charge's rate is the base interest rate plus 3 points, which equals the shortfall interest
// charge rate, the GIC rate less 4 points, in every quarter from April 2005; the base interest rate is
// the GIC rate less 7 points.

/** The years each question works: the charge's income year, or the contributions year of the release. */
export const CHARGE_YEARS = ['2013-14', '2014-15', '2015-16', '2016-17', '2017-18', '2018-19', '2019-20', '2020-21'];
export const RELEASE_YEARS = [...CHARGE_YEARS, '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
const QUESTIONS = ['concessional_charge', 'non_concessional_release'];
const INPUTS = ['question', 'year', 'scope_confirmed', 'additional_tax', 'tax_due_date', 'excess', 'determination_date'];
/** The ATO's published associated earnings rates ('Contributions caps', Table 5): annual and daily. */
export const ATO_TABLE_5 = new Map([
  ['2013-14', ['9.66', '0.02646575']], ['2014-15', ['9.61', '0.02632876']], ['2015-16', ['9.20', '0.02513661']],
  ['2016-17', ['8.83', '0.02419178']], ['2017-18', ['8.73', '0.02391780']], ['2018-19', ['8.96', '0.02454795']],
  ['2019-20', ['8.08', '0.02207650']], ['2020-21', ['7.06', '0.01934247']], ['2021-22', ['7.04', '0.01928767']],
  ['2022-23', ['9.46', '0.02591781']], ['2023-24', ['11.19', '0.03057377']], ['2024-25', ['11.33', '0.03104110']],
  ['2025-26', ['10.75', '0.02945205']],
]);

/** @param {number} start */
const firstDay = (start) => /** @type {number} */ (dayOf(`${start}-07-01`));
/** @param {Record<string, unknown>} facts @param {string} item @param {string} key */
function factDate(facts, item, key) {
  const day = dayOf(required(facts, item, key));
  if (day === null) refuse('excess_contributions.fact_invalid', `${item}: ${key.replaceAll('_', ' ')} must be a date.`);
  return day;
}
/** @param {number} day */
const sicOn = (day) => { const rate = gicOn(day); return rate === null || day < /** @type {number} */ (dayOf('2005-04-01')) ? null : rate - 400; };
/** @param {number} day */
const baseOn = (day) => { const rate = gicOn(day); return rate === null ? null : rate - 700; };

/** The charge in cents on `tax` cents from 1 July of `start` to the day before `due`, compounding daily.
 * @param {bigint} tax @param {number} start @param {number} due */
function charge(tax, start, due) {
  let [num, den] = [tax, 1n];
  for (let day = firstDay(start); day < due; day += 1) {
    const rate = sicOn(day);
    if (rate === null) refuse('excess_contributions.rate_unpublished', `The ATO has published the charge’s quarterly rate to ${GIC_TABLE_END}; ${isoOf(day)} is later.`);
    const base = BigInt(10000 * yearLength(day));
    num *= base + BigInt(rate);
    den *= base;
  }
  return (2n * num + den) / (2n * den) - tax;
}

/** @typedef {{question: string, year: string, amounts: Record<string, string>, rates: Record<string, string>, days: number,
 *   firstDay?: string, lastDay?: string, ato?: string[]}} ExcessWorked */

/** @param {Record<string, unknown>} facts @param {string} year @returns {ExcessWorked} */
function concessionalCharge(facts, year) {
  const item = 'question concessional_charge';
  knownKeys(facts, item, 'concessional_charge', ['additional_tax', 'tax_due_date']);
  const start = Number(year.slice(0, 4));
  if (start >= 2021) {
    refuse('excess_contributions.charge_abolished', 'No excess concessional contributions charge arises for 2021-22 or a later year: Act No. 45 of 2021 Sch 2 repealed TAA 1953 Sch 1 Div 95 from then (item 14).');
  }
  const tax = statedAmount(facts, item, 'additional_tax');
  const due = factDate(facts, item, 'tax_due_date');
  if (due <= firstDay(start)) refuse('excess_contributions.date_order', 'The tax due date must be after 1 July of the year, the charge’s first day.');
  const owed = charge(tax, start, due);
  return { question: 'concessional_charge', year, amounts: { excess_concessional_contributions_charge: dollarsText(owed, 1n) }, rates: {},
    days: due - firstDay(start), firstDay: isoOf(firstDay(start)), lastDay: isoOf(due - 1) };
}

/** The proxy rate's daily ratio for the contributions year from `start`, and the annual percentage to 6 places.
 * @param {number} start */
function proxy(start) {
  const [first, last] = [firstDay(start), firstDay(start + 1) - 1];
  if (baseOn(last) === null || start < 2013) {
    refuse('excess_contributions.rate_unpublished', `The proxy rate averages the base interest rate for every day of the contributions year; the ATO’s GIC rates run to ${GIC_TABLE_END}.`);
  }
  const days = last - first + 1;
  let sum = 0;
  for (let day = first; day <= last; day += 1) sum += /** @type {number} */ (baseOn(day));
  const n = BigInt(sum + 700 * days);
  const den = BigInt(days * 10000 * yearLength(first));
  const micro = ((n * 20000n) / BigInt(days) + 1n) / 2n;
  return { n, den, percent: `${micro / 1000000n}.${String(micro % 1000000n).padStart(6, '0')}` };
}

/** @param {Record<string, unknown>} facts @param {string} year @returns {ExcessWorked} */
function nonConcessionalRelease(facts, year) {
  const item = 'question non_concessional_release';
  knownKeys(facts, item, 'non_concessional_release', ['excess', 'determination_date']);
  const excess = statedAmount(facts, item, 'excess', ABOVE_NIL);
  if (excess <= 0n) refuse('excess_contributions.fact_invalid', `${item}: the excess must be above nil.`);
  const determination = factDate(facts, item, 'determination_date');
  const start = Number(year.slice(0, 4));
  const { n, den, percent } = proxy(start);
  if (determination < firstDay(start)) refuse('excess_contributions.date_order', 'The determination date must be on or after 1 July of the contributions year.');
  const days = determination - firstDay(start) + 1;
  const k = BigInt(days);
  const base = den ** k;
  const earned = (excess * ((den + n) ** k - base)) / (base * 100n);
  // In cents: the excess, plus 85% of the earnings (whole dollars), and the 15% offset.
  const total = excess + earned * 85n;
  return { question: 'non_concessional_release', year, days, ato: ATO_TABLE_5.get(year),
    amounts: { associated_earnings: `${earned}.00`, total_release_amount: dollarsText(total, 1n), assessable_associated_earnings: `${earned}.00`,
      associated_earnings_tax_offset: dollarsText(earned * 15n, 1n) },
    rates: { proxy_rate_percent: percent } };
}

/** The command's result for one question. @param {unknown} given @returns {ExcessWorked} */
export function excessContributions(given) {
  const input = readInput(given, INPUTS.slice(0, 3), INPUTS);
  const year = scope(input, RELEASE_YEARS);
  const facts = Object.fromEntries(Object.entries(input).filter(([key]) => !INPUTS.slice(0, 3).includes(key)));
  if (input.question === 'concessional_charge') return concessionalCharge(facts, year);
  if (input.question === 'non_concessional_release') return nonConcessionalRelease(facts, year);
  return refuse('excess_contributions.question_invalid', `Choose one of ${QUESTIONS.join(', ')}.`);
}
