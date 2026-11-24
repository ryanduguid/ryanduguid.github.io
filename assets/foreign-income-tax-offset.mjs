// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The foreign income tax offset (ITAA 1997 Division 770) for one individual and one income year
// from 2020-21 to 2026-27: the foreign income tax that counts (s 770-70), limited to the $1,000
// default, to the income tax payable less the income tax payable on the s 770-75(4) assumptions as
// stated, or to that difference worked out at the resident rates for 2024-25 to 2026-27, with a
// part-year resident's tax-free threshold (Income Tax Rates Act 1986 ss 18 and 20). Ported from the
// australian-accounting command foreign-income-tax-offset, with its refusal codes. Sources read 22
// November 2026: ITAA 1997 Compilations No. 210 and 268, the Rates Act Compilations No. 55 and 66 and
// the ATO's Guide to foreign income tax offset rules for 2024, 2025 and 2026.
import { commandCents, ratioCents } from './money.mjs';
import { RESIDENT_SCALES } from './income-tax.mjs';
import { refuse, supportedYear } from './private-health-rebate.mjs';

const REQUIRED = ['year', 'foreign_tax_paid', 'nane_foreign_tax', 'limit_method'];
const OPTIONAL = ['tax_payable', 'tax_payable_assumed', 'taxable_income', 'disregarded_income', 'disregarded_deductions',
  'medicare_levy', 'medicare_levy_assumed', 'residency_periods', 'eligible_pensioner'];
/** Each method's facts: true where required, false where allowed. @type {Record<string, Record<string, boolean>>} */
const METHODS = {
  default: {},
  stated: { tax_payable: true, tax_payable_assumed: true },
  worked: { taxable_income: true, disregarded_income: true, disregarded_deductions: true, medicare_levy: true,
    medicare_levy_assumed: true, residency_periods: false, eligible_pensioner: false },
};
const METHOD_FACTS = new Map(Object.entries(METHODS).map(([method, facts]) => [method, new Map(Object.entries(facts))]));
const SCALES = new Map(Object.entries(RESIDENT_SCALES));
// The worked limit's years: those with the resident rates of the australian-accounting command resident-tax.
export const WORKED_YEARS = ['2024-25', '2025-26', '2026-27'];
const MAX_PERIODS = 12;

/** Days since 1970-01-01 for a valid YYYY-MM-DD date from 1900 to 2100, else null. @param {unknown} text */
export function parseDate(text) {
  const parts = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : null;
  if (!parts) return null;
  const [y, m, d] = parts.slice(1).map(Number);
  const day = Date.UTC(y, m - 1, d);
  const date = new Date(day);
  const valid = y >= 1900 && y <= 2100 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return valid ? day / 86400000 : null;
}

/** The months of the income year with a residency period, each counting from the start of its first
 * month to the end of its last (Rates Act s 18(1)). @param {unknown} periods @param {string} year */
function residencyMonths(periods, year) {
  const invalid = (/** @type {string} */ why) => refuse('foreign_income_tax_offset.residency_periods_invalid', `residency_periods: ${why}`);
  if (!Array.isArray(periods)) return invalid('must be a list of objects with from and to.');
  if (periods.length === 0 || periods.length > MAX_PERIODS) return invalid(`must hold 1 to ${MAX_PERIODS} periods.`);
  const first = Number(year.slice(0, 4));
  const [start, end] = [parseDate(`${first}-07-01`), parseDate(`${first + 1}-06-30`)];
  const index = (/** @type {number} */ day) => { const d = new Date(day * 86400000); return d.getUTCFullYear() * 12 + d.getUTCMonth() + 1; };
  const months = new Set();
  periods.forEach((period, i) => {
    const name = `period ${i + 1}`;
    if (period === null || typeof period !== 'object' || Array.isArray(period)) invalid(`${name} must be an object with from and to.`);
    const fields = new Map(Object.entries(period));
    const unknown = [...fields.keys()].find((key) => !['from', 'to'].includes(key));
    if (unknown) refuse('input.field_unknown', `${name}: ${unknown} is not an input of a residency period`);
    const [from, to] = ['from', 'to'].map((key) => {
      if (!fields.has(key)) refuse('input.missing_field', `${name}: ${key} is required`);
      const day = parseDate(fields.get(key));
      return day ?? refuse('input.date_invalid', `${name}: ${key} must be a YYYY-MM-DD date from 1900 to 2100.`);
    });
    if (from > to || from < Number(start) || to > Number(end)) invalid(`${name} must run forwards inside the income year ${year}.`);
    if (index(from) === index(Number(start)) && index(to) === index(Number(end))) {
      invalid(`${name} runs from the first month of the income year to the last, so it is the whole year, which Income Tax `
        + 'Rates Act 1986 s 18(2)(b) says is not a part-year residency period.');
    }
    for (let m = index(from); m <= index(to); m++) months.add(m);
  });
  return months.size;
}

/** Basic income tax at the year's resident rates, with the first band starting at the threshold,
 * in 1/1200ths of a cent times the rate per cent. @param {number[][]} scale
 * @param {bigint} income in 1/12ths of a cent @param {bigint} threshold in 1/12ths of a cent */
function basicTax(scale, income, threshold) {
  let tax = 0n;
  scale.forEach(([low, rate], i) => {
    const floor = i === 0 ? threshold : BigInt(low) * 1200n;
    const next = scale.at(i + 1);
    const ceiling = !next || income < BigInt(next[0]) * 1200n ? income : BigInt(next[0]) * 1200n;
    if (ceiling > floor) tax += (ceiling - floor) * BigInt(rate);
  });
  return tax;
}

/** @param {Map<string, unknown>} given @param {string} year */
function worked(given, year) {
  if (!WORKED_YEARS.includes(year)) {
    refuse('foreign_income_tax_offset.worked_year', `The worked limit uses the resident rates, which resident-tax has for `
      + `2024-25 to 2026-27, not ${year}; give tax_payable and tax_payable_assumed with the stated method.`);
  }
  const [taxable, income, deductions, levy, levyAssumed] = ['taxable_income', 'disregarded_income', 'disregarded_deductions',
    'medicare_levy', 'medicare_levy_assumed'].map((key) => commandCents(given.get(key)));
  if (taxable % 100n !== 0n) refuse('input.amount_not_whole_dollars', 'Supply established whole-dollar taxable income.');
  // The threshold in 1/12ths of a cent: $18,200, or (18,200 - 4,736) + 4,736 x months / 12 (s 20(1)).
  let threshold = 18200n * 1200n;
  let months = null;
  if (given.get('residency_periods') !== undefined) {
    months = residencyMonths(given.get('residency_periods'), year);
    const pensioner = given.get('eligible_pensioner');
    if (pensioner !== undefined && typeof pensioner !== 'boolean') refuse('input.flag_invalid', 'eligible_pensioner must be true or false.');
    if (pensioner === true) months = null;
    else threshold = (13464n * 12n + 4736n * BigInt(months)) * 100n;
  }
  const scale = /** @type {number[][]} */ (SCALES.get(year));
  const assumed = taxable - income + deductions > 0n ? taxable - income + deductions : 0n;
  // Basic tax in 1/1200ths of a cent: income in 1/12ths of a cent times the rate per cent.
  const basic = basicTax(scale, taxable * 12n, threshold);
  const basicAssumed = basicTax(scale, assumed * 12n, threshold);
  return { months, threshold, assumed, basic, basicAssumed, payable: basic + levy * 1200n,
    payableAssumed: basicAssumed + levyAssumed * 1200n };
}

/** @param {bigint} units 1/1200ths of a cent */
const toDollars = (units) => Number(ratioCents(units, 1200n)) / 100;

/** The offset and its limit. Amounts are in dollars, each rounded half up to the cent from the
 * exact working; `steps` holds the limit's working where the method gives one.
 * @param {Record<string, unknown>} input */
export function foreignTaxOffset(input) {
  const unknown = Object.keys(input).find((key) => !REQUIRED.includes(key) && !OPTIONAL.includes(key));
  if (unknown) refuse('input.field_unknown', `${unknown} is not an input of foreign-income-tax-offset`);
  const given = new Map(Object.entries(input));
  const missing = REQUIRED.find((key) => given.get(key) === undefined);
  if (missing) refuse('input.missing_field', `${missing} is required`);
  const year = supportedYear(/** @type {string} */ (input.year));
  const paid = commandCents(input.foreign_tax_paid);
  const nane = commandCents(input.nane_foreign_tax);
  const method = /** @type {string} */ (input.limit_method);
  const facts = METHOD_FACTS.get(method) ?? refuse('foreign_income_tax_offset.limit_method_invalid',
    'limit_method must be default, stated or worked.');
  for (const key of OPTIONAL) {
    if (!facts.has(key) && given.get(key) !== undefined) refuse('input.field_unknown', `${key} is not an input of the ${method} limit method`);
    if (facts.get(key) === true && given.get(key) === undefined) refuse('input.missing_field', `${key} is required for the ${method} limit method.`);
  }
  if (input.eligible_pensioner !== undefined && input.residency_periods === undefined) {
    refuse('input.field_unknown', 'eligible_pensioner is an input only with residency_periods');
  }
  /** @type {Record<string, number>} */
  const steps = {};
  // The limit in 1/1200ths of a cent: $1,000, or the greater of $1,000 and the difference, plus the
  // s 770-10(2) tax (s 770-80).
  const thousand = 100000n * 1200n;
  let limit = thousand;
  let months = null;
  if (method !== 'default') {
    let payable;
    let payableAssumed;
    if (method === 'stated') {
      payable = commandCents(input.tax_payable) * 1200n;
      payableAssumed = commandCents(input.tax_payable_assumed) * 1200n;
    } else {
      const w = worked(given, year);
      ({ months, payable, payableAssumed } = w);
      Object.assign(steps, { tax_free_threshold: toDollars(w.threshold * 100n), basic_income_tax: toDollars(w.basic),
        assumed_taxable_income: Number(w.assumed) / 100, basic_income_tax_assumed: toDollars(w.basicAssumed) });
    }
    Object.assign(steps, { tax_payable: toDollars(payable), tax_payable_assumed: toDollars(payableAssumed) });
    if (payable - payableAssumed > limit) limit = payable - payableAssumed;
  }
  limit += nane * 1200n;
  const before = (paid + nane) * 1200n;
  const offset = before < limit ? before : limit;
  return { method, months, steps, offsetBeforeLimit: toDollars(before), offsetLimit: toDollars(limit),
    offset: toDollars(offset), offsetAboveLimit: toDollars(before - offset) };
}
