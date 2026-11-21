// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { number } from './money.mjs';

const DAY = 86400000;
const START = '2017-07-01';
export const FIRST_DETERMINATION = '2018-07-01';
export const LAST_SIC_DAY = '2026-12-31';
const ANNUAL_CAP_CENTS = 1500000n;

// ATO shortfall interest charge rates, annual basis points, checked 22 November 2026:
// https://www.ato.gov.au/tax-rates-and-codes/shortfall-interest-charge-rates
const SIC_BPS = [
  [null, null, 473, 470], // 2017
  [472, 477, 496, 496], // 2018
  [494, 496, 454, 398], // 2019
  [391, 389, 310, 310], // 2020
  [302, 301, 304, 301], // 2021
  [304, 307, 400, 531], // 2022
  [606, 646, 690, 715], // 2023
  [738, 734, 736, 738], // 2024
  [742, 717, 678, 661], // 2025
  [665, 696, 743, 751], // 2026
];

/** @param {string} code @param {string} message @returns {never} */
export function refuseFhss(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** @param {unknown} input @param {string} label */
export function fhssDate(input, label) {
  if (typeof input !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(input) || input < '1900-01-01' || input > '2100-12-31') {
    return refuseFhss('input.date_invalid', `${label} must be a date in YYYY-MM-DD format.`);
  }
  const parsed = Date.parse(`${input}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== input) {
    return refuseFhss('input.date_invalid', `${label} must be a valid calendar date.`);
  }
  return input;
}

/** @param {unknown} input @param {string} label */
export function fhssCents(input, label) {
  try {
    return BigInt(Math.round(number(input, { max: 1e12, money: true }) * 100));
  } catch {
    return refuseFhss('input.amount_invalid', `${label} must be a non-negative amount with up to 2 decimal places.`);
  }
}

/** @param {number} first */
const yearLabel = (first) => `${first}-${String((first + 1) % 100).padStart(2, '0')}`;

/** @param {string} date */
export const fhssFinancialYear = (date) => yearLabel(Number(date.slice(0, 4)) - Number(date.slice(5, 7) < '07'));

/** @param {bigint} x @param {bigint} y */
const min = (x, y) => x < y ? x : y;

/**
 * @typedef {{row: number, date: string, year: string, type: 'personal'|'employer_voluntary',
 *   concessional: boolean, amount: bigint}} Contribution
 * @typedef {Contribution & {counted: bigint, earningsFrom: string, earnings: bigint}} CountedContribution
 */

/** @param {unknown} rows @param {string} determined @returns {Contribution[]} */
function readContributions(rows, determined) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000) {
    return refuseFhss('fhss.contributions_invalid', 'Enter between 1 and 10,000 voluntary contributions.');
  }
  return rows.map((item, index) => {
    const label = `Contribution ${index + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !['date', 'amount', 'kind'].includes(key))) {
      return refuseFhss('fhss.contributions_invalid', `${label} must have a date, amount and contribution type.`);
    }
    const date = fhssDate(item.date, `${label} date`);
    if (date < START || date > determined) {
      return refuseFhss('fhss.contribution_out_of_period', `${label} must be from 1 July 2017 to the determination date.`);
    }
    const amount = fhssCents(item.amount, `${label} amount`);
    if (!amount) return refuseFhss('input.amount_invalid', `${label} amount must be above zero.`);
    const type = item.kind;
    if (type !== 'employer_voluntary' && type !== 'personal') {
      return refuseFhss('fhss.contribution_kind_invalid', `${label} must be a voluntary employer or personal contribution.`);
    }
    return { row: index + 1, date, year: fhssFinancialYear(date), type, concessional: type === 'employer_voluntary', amount };
  });
}

/** @param {unknown} rows @param {Contribution[]} entries */
function nonConcessionalPersonal(rows, entries) {
  const personalTotals = new Map();
  for (const entry of entries) {
    if (entry.type === 'personal') personalTotals.set(entry.year, (personalTotals.get(entry.year) ?? 0n) + entry.amount);
  }
  /** @type {Map<string, bigint>} */
  const undeducted = new Map();
  if (!Array.isArray(rows) || rows.length > 10) {
    return refuseFhss('fhss.deductions_invalid', 'Enter at most one personal deduction per supported financial year.');
  }
  for (const item of rows) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !['financial_year', 'amount'].includes(key))) {
      return refuseFhss('fhss.deductions_invalid', 'Each personal deduction needs a financial year and an amount.');
    }
    const year = item.financial_year;
    if (typeof year !== 'string' || yearLabel(Number(year.slice(0, 4))) !== year || year < '2017-18' || year > '2026-27' || undeducted.has(year)) {
      return refuseFhss('fhss.deductions_invalid', 'Use a supported financial year once for each personal deduction.');
    }
    const deducted = fhssCents(item.amount, `Personal deduction for ${year}`);
    const total = personalTotals.get(year) ?? 0n;
    if (deducted > total) {
      return refuseFhss('fhss.deductions_invalid', `The deduction for ${year} exceeds this year's personal contributions.`);
    }
    undeducted.set(year, total - deducted);
  }
  return undeducted;
}

/** @param {Contribution[]} entries @param {Map<string,bigint>} undeducted */
function orderContributions(entries, undeducted) {
  /** @type {Contribution[]} */
  const parts = [];
  const earlierNonConcessional = new Set();
  for (const entry of entries.sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row)) {
    if (entry.type !== 'personal' || !undeducted.has(entry.year)) {
      parts.push(entry);
      continue;
    }
    const room = undeducted.get(entry.year) ?? 0n;
    const nonConcessional = min(room, entry.amount);
    if (nonConcessional > 0n) {
      parts.push({ ...entry, amount: nonConcessional });
      undeducted.set(entry.year, room - nonConcessional);
    }
    if (entry.amount > nonConcessional) {
      parts.push({ ...entry, amount: entry.amount - nonConcessional, concessional: true });
      earlierNonConcessional.add(entry.year);
    }
  }
  // Where a year includes both kinds of personal contribution, count all of
  // that year's non-concessional contributions first. Otherwise use date order.
  return parts.sort((a, b) => a.year.localeCompare(b.year)
    || (earlierNonConcessional.has(a.year) ? Number(a.concessional) - Number(b.concessional) : 0)
    || a.date.localeCompare(b.date) || Number(a.concessional) - Number(b.concessional) || a.row - b.row);
}

/** @param {Contribution[]} entries @param {bigint} limit @returns {CountedContribution[]} */
function applyCaps(entries, limit) {
  let available = limit;
  let year = '';
  let annual = ANNUAL_CAP_CENTS;
  return entries.map((entry) => {
    if (entry.year !== year) {
      year = entry.year;
      annual = ANNUAL_CAP_CENTS;
    }
    const counted = min(entry.amount, min(available, annual));
    annual -= counted;
    available -= counted;
    const earningsFrom = entry.year === '2017-18' ? START : `${entry.date.slice(0, 7)}-01`;
    return { ...entry, counted, earningsFrom, earnings: 0n };
  });
}

/** @param {Set<string>} starts @param {string} end */
function growthByStart(starts, end) {
  /** @type {Map<string, {growth: bigint, denominator: bigint}>} */
  const factors = new Map();
  let numerator = 1n;
  let denominator = 1n;
  // Build the exact product of (1 + daily SIC rate), going backwards from the
  // determination day. Each month start retains the full product to that day.
  for (let date = Date.parse(end); factors.size < starts.size; date -= DAY) {
    const day = new Date(date);
    const year = day.getUTCFullYear();
    const rate = SIC_BPS[year - 2017]?.[Math.floor(day.getUTCMonth() / 3)];
    if (rate == null) return refuseFhss('fhss.rate_unpublished', 'The published SIC table does not cover the full earnings period.');
    const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY;
    const divisor = BigInt(10000 * daysInYear);
    numerator *= divisor + BigInt(rate);
    denominator *= divisor;
    const iso = day.toISOString().slice(0, 10);
    if (starts.has(iso)) factors.set(iso, { growth: numerator - denominator, denominator });
  }
  return factors;
}

/** @param {CountedContribution[]} rows @param {string} determined */
function assignEarnings(rows, determined) {
  /** @type {Map<number, {from: string, adjusted: bigint}>} */
  const bases = new Map();
  const starts = new Set();
  for (const row of rows) {
    if (!row.counted) continue;
    const base = bases.get(row.row) ?? { from: row.earningsFrom, adjusted: 0n };
    base.adjusted += row.counted * (row.concessional ? 85n : 100n);
    bases.set(row.row, base);
    starts.add(base.from);
  }
  const factors = growthByStart(starts, determined);
  /** @type {Map<number, bigint>} */
  const earnings = new Map();
  for (const [row, base] of bases) {
    const factor = factors.get(base.from);
    if (!factor) throw new Error('Missing FHSS earnings period.');
    // Adjusted amounts are in $0.0001 units. Floor the original contribution
    // once, after combining the two parts if a personal deduction split it.
    earnings.set(row, base.adjusted * factor.growth / (factor.denominator * 10000n));
  }
  for (const row of rows) row.earnings = earnings.get(row.row) ?? 0n;
  return [...earnings.values()].reduce((sum, amount) => sum + amount, 0n);
}

/** @param {unknown} contributions @param {unknown} deductions @param {unknown} requestedDate @param {string} determined */
export function fhssContributionEstimate(contributions, deductions, requestedDate, determined) {
  if (determined > LAST_SIC_DAY) {
    return refuseFhss('fhss.rate_unpublished', 'This estimate can use determination dates through 31 December 2026, the last verified SIC quarter.');
  }
  const requested = fhssDate(requestedDate, 'Determination request date');
  if (requested < FIRST_DETERMINATION || requested > determined) {
    return refuseFhss('fhss.determination_requested_invalid', 'The determination request date must be between 1 July 2018 and the determination date.');
  }
  const limit = requested < '2022-07-01' ? 3000000n : 5000000n;
  const entries = readContributions(contributions, determined);
  const rows = applyCaps(orderContributions(entries, nonConcessionalPersonal(deductions, entries)), limit);
  let concessional = 0n;
  let nonConcessional = 0n;
  for (const row of rows) {
    if (row.concessional) concessional += row.counted;
    else nonConcessional += row.counted;
  }
  return {
    concessional: concessional * 85n,
    nonConcessional: nonConcessional * 100n,
    earnings: assignEarnings(rows, determined) * 10000n,
    limit,
    rows,
  };
}
