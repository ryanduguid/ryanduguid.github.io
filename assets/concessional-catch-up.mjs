// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Catch-up concessional contributions: each earlier year's unused concessional contributions cap,
// applied earliest year first to increase a later year's cap, and what is left of each after this
// year's contributions and any proposed one, with the year it lapses. ITAA 1997 s 291-20(1) to (7)
// (Compilation No. 268, 1 October 2026), read 19 November 2026 on the ATO Legal Database. The caps are
// Table 1.1 of the ATO's 'Contributions caps' (last updated 11 September 2026), read 19 November 2026.
import { cents } from './money.mjs';
import { CONCESSIONAL_CAP } from './take-home-pay.mjs';

/** The years this calculator works the cap for. */
export const CATCH_UP_YEARS = ['2026-27', '2025-26', '2024-25'];
/** s 291-20(7): no unused cap for a year before 2018-19. */
export const FIRST_EARLIER_YEAR = '2018-19';
/** The general cap in dollars for each year from 2018-19 (s 291-20(2): $25,000 for 2017-18, indexed). */
export const CAP = /** @type {Record<string, number>} */ ({ '2018-19': 25000, '2019-20': 25000, '2020-21': 25000,
  ...CONCESSIONAL_CAP });
/** s 291-20(3)(b): carry forward only below a total superannuation balance of $500,000 just before the year. */
const BALANCE_LIMIT = 50000000;
/** s 291-20(3)(c): the previous 5 financial years. */
const YEARS_CARRIED = 5;

/** @param {number} start */
const label = (start) => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;

/** @typedef {{year: string, contributions: string, balance?: string}} EarlierYear
 * @typedef {{year: string, balance: string, concessional: string, proposed?: string, definedBenefit: boolean,
 *   earlier: EarlierYear[]}} CatchUpInput */

/** An amount in cents, its error naming the field. @param {unknown} value @param {string} what */
function amount(value, what) {
  try {
    return cents(/** @type {string} */ (value));
  } catch (error) {
    throw new Error(`${what}: ${/** @type {Error} */ (error).message}`);
  }
}

/** The earlier years in order, each from 5 before `current` to the one before it, with any back to 2018-19.
 * @param {unknown} earlier @param {number} current */
function earlierYears(earlier, current) {
  const shape = `Give the concessional contributions of each year from ${label(current - YEARS_CARRIED)} to `
    + `${label(current - 1)}, and of any years before them back to 2018-19 without a gap; give none for `
    + `${label(current)} or later.`;
  if (!Array.isArray(earlier)) throw new Error(shape);
  const years = earlier.map((/** @type {EarlierYear} */ row) => {
    const start = Number(String(row?.year).slice(0, 4));
    if (!(row?.year in CAP) || label(start) !== row.year) throw new Error(shape);
    const given = row.balance !== undefined && String(row.balance).trim() !== '';
    return { start, contributions: amount(row.contributions, `${row.year} concessional contributions`),
      balance: given ? amount(row.balance, `${row.year} total super balance`) : null };
  }).sort((a, b) => a.start - b.start);
  const first = years[0]?.start;
  if (years.length === 0 || first > current - YEARS_CARRIED || years.at(-1)?.start !== current - 1
    || years.some((year, index) => year.start !== first + index)) throw new Error(shape);
  return years;
}

/** @typedef {{start: number, amount: number, applied: number}} Unused */

/** Increase a cap by up to `need` from `pool`, earliest year first (s 291-20(4) and (5)).
 * @param {Unused[]} pool @param {number} need @returns {Record<string, number>} each year's application */
function apply(pool, need) {
  /** @type {Record<string, number>} */
  const applied = {};
  for (const unused of pool) {
    const take = Math.min(unused.amount - unused.applied, need);
    if (take <= 0) continue;
    unused.applied += take;
    need -= take;
    applied[label(unused.start)] = take / 100;
  }
  return applied;
}

/**
 * The year's concessional cap with the unused cap carried forward, in dollars and cents.
 * @param {CatchUpInput} input
 */
export function concessionalCatchUp(input) {
  if (!CATCH_UP_YEARS.includes(input?.year)) throw new Error(`Choose ${CATCH_UP_YEARS.slice().reverse().join(', ')}.`);
  if (typeof input.definedBenefit !== 'boolean') throw new Error('Say whether the person has a defined benefit interest.');
  // ITAA 1997 Subdivision 291-C: a defined benefit interest's notional taxed contributions (s 291-170) count
  // as concessional contributions.
  if (input.definedBenefit) {
    throw new Error('A defined benefit interest changes what counts as concessional contributions (ITAA 1997 '
      + 'Subdivision 291-C); this calculator does not cover it.');
  }
  const current = Number(input.year.slice(0, 4));
  const balance = amount(input.balance, 'Total super balance on 30 June before the year');
  const concessional = amount(input.concessional, `${input.year} concessional contributions`);
  const hasProposal = input.proposed !== undefined && String(input.proposed).trim() !== '';
  const proposed = hasProposal ? amount(input.proposed, 'Proposed contribution') : 0;
  const cap = CAP[input.year] * 100;
  /** @type {Unused[]} */
  const pool = [];
  /** @type {Record<string, Record<string, number>>} */
  const earlierApplied = {};
  for (const year of earlierYears(input.earlier, current)) {
    const yearCap = CAP[label(year.start)] * 100;
    if (year.contributions > yearCap) {
      const name = label(year.start);
      if (year.balance === null) {
        throw new Error(`${name}’s concessional contributions exceed its $${(yearCap / 100).toLocaleString('en-AU')} cap: `
          + 'give its total super balance on the 30 June before it, which decides whether its cap was increased.');
      }
      if (year.balance < BALANCE_LIMIT) {
        const from = Math.max(2018, year.start - YEARS_CARRIED);
        if ((pool[0]?.start ?? year.start) > from) {
          throw new Error(`${name}’s concessional contributions exceed its cap, so unused cap from ${label(from)} onwards `
            + `increased it, earliest first: give each year from ${label(from)}.`);
        }
        const applied = apply(pool.filter((unused) => unused.start >= from), year.contributions - yearCap);
        if (Object.keys(applied).length) earlierApplied[name] = applied;
      }
    }
    pool.push({ start: year.start, amount: Math.max(0, yearCap - year.contributions), applied: 0 });
  }
  const window = pool.filter((unused) => unused.start >= current - YEARS_CARRIED);
  const carried = window.reduce((sum, unused) => sum + unused.amount - unused.applied, 0);
  const below = balance < BALANCE_LIMIT;
  const available = below ? cap + carried : cap;
  const total = concessional + proposed;
  const applied = below ? apply(window, Math.max(0, total - cap)) : {};
  const years = window.map((unused) => ({ year: label(unused.start), remaining: (unused.amount - unused.applied) / 100,
    expiresAtEndOf: label(unused.start + YEARS_CARRIED) }));
  years.push({ year: input.year, remaining: Math.max(0, cap - total) / 100, expiresAtEndOf: label(current + YEARS_CARRIED) });
  return {
    cap: cap / 100,
    carriesForward: below,
    unusedCarried: carried / 100,
    available: available / 100,
    carryForwardApplied: below ? Math.min(carried, Math.max(0, concessional - cap)) / 100 : 0,
    remaining: Math.max(0, available - concessional) / 100,
    excess: Math.max(0, concessional - available) / 100,
    withProposal: hasProposal ? total / 100 : null,
    excessWithProposal: hasProposal ? Math.max(0, total - available) / 100 : null,
    expiring: years[0].remaining,
    earlierApplied,
    applied,
    years,
  };
}
