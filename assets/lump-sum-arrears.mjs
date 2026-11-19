// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The tax offset for lump sum payments in arrears: ITAA 1936 Part III Division 17 Subdivision AB, ss 159ZR to
// 159ZRD, read 19 November 2026 on the ATO Legal Database. Each year's tax is at the resident rates the ATO
// publishes ('Tax rates – Australian resident', last updated 13 August 2026, read 19 November 2026), with the
// temporary budget repair levy of 2% above $180,000 that s 4-11 of the Income Tax (Transitional Provisions)
// Act 1997 makes extra income tax for 2014-15 to 2016-17. Amounts are whole dollars; the working is exact,
// in 2,000ths of a dollar, and each amount shown is rounded half up to the cent.
import { RESIDENT_SCALES } from './income-tax.mjs';

/** The years of receipt this calculator works. */
export const RECEIPT_YEARS = ['2026-27', '2025-26', '2024-25'];
/** Each band as [the whole dollars it starts above, its rate per cent], from 2012-13. */
export const ARREARS_SCALES = /** @type {Record<string, number[][]>} */ ({
  ...RESIDENT_SCALES,
  '2019-20': [[18200, 19], [37000, 32.5], [90000, 37], [180000, 45]],
  '2018-19': [[18200, 19], [37000, 32.5], [90000, 37], [180000, 45]],
  '2017-18': [[18200, 19], [37000, 32.5], [87000, 37], [180000, 45]],
  '2016-17': [[18200, 19], [37000, 32.5], [87000, 37], [180000, 45]],
  '2015-16': [[18200, 19], [37000, 32.5], [80000, 37], [180000, 45]],
  '2014-15': [[18200, 19], [37000, 32.5], [80000, 37], [180000, 45]],
  '2013-14': [[18200, 19], [37000, 32.5], [80000, 37], [180000, 45]],
  '2012-13': [[18200, 19], [37000, 32.5], [80000, 37], [180000, 45]],
});
/** Income Tax (Transitional Provisions) Act 1997 s 4-11(5): the temporary budget repair levy years. */
const LEVY_YEARS = ['2014-15', '2015-16', '2016-17'];

/** @typedef {{year: string, arrears: string, taxable?: string, gain?: string, rebateYearArrears?: string,
 *   earlierRebateArrears?: string}} AccrualYear
 * @typedef {{year: string, resident: boolean, taxable: string, gain: string, accrual: AccrualYear[]}} ArrearsInput */

/** The optional facts of a recent accrual year, with how a message names them. */
const FACTS = /** @type {const} */ ([['taxable', 'taxable income'], ['gain', 'net capital gain'],
  ['rebateYearArrears', 'total arrears amount as a rebate year'],
  ['earlierRebateArrears', 'arrears of an earlier rebate year that accrued in it']]);

/** Whole dollars from 0 to $1 billion. @param {unknown} value @param {string} what */
function dollars(value, what) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d+$/.test(text) || Number(text) > 1e9) throw new Error(`Enter ${what} in whole dollars, from 0 to 1000000000.`);
  return Number(text);
}

/** Whether `value` was given: blank is not. @param {unknown} value */
const given = (value) => value !== undefined && value !== null && String(value).trim() !== '';

/** The first calendar year of an income year written like 2023-24, or NaN. @param {unknown} text */
function startOf(text) {
  const match = /^(\d{4})-(\d{2})$/.exec(typeof text === 'string' ? text.trim() : '');
  return match && Number(match[2]) === (Number(match[1]) + 1) % 100 ? Number(match[1]) : NaN;
}

/** The tax in 2,000ths of a dollar on `income` whole dollars at `year`'s rates, with its levy.
 * @param {string} year @param {number} income */
function tax(year, income) {
  const bands = ARREARS_SCALES[year];
  let total = 0;
  for (const [index, [low, rate]] of bands.entries()) {
    const high = bands[index + 1]?.[0] ?? Infinity;
    total += Math.max(0, Math.min(income, high) - low) * Math.round(rate * 10) * 2;
  }
  return total + (LEVY_YEARS.includes(year) ? Math.max(0, income - 180000) * 40 : 0);
}

/** The tax at `year`'s rates on `base` with `arrears` added, less the tax on `base`.
 * @param {string} year @param {number} base @param {number} arrears */
const increase = (year, base, arrears) => tax(year, base + arrears) - tax(year, base);

/** An amount in 2,000ths of a dollar as dollars, rounded half up to the cent. @param {number} units */
const money = (units) => Math.floor((units + 10) / 20) / 100;

/** The accrual years, most recent first, refusing what s 159ZR(1) does not allow.
 * @param {unknown} list @param {number} receipt */
function accrualYears(list, receipt) {
  if (!Array.isArray(list) || list.length === 0) throw new Error('Give each earlier income year in which part of the arrears accrued.');
  const years = list.map((/** @type {AccrualYear} */ row) => {
    const start = startOf(row?.year);
    if (Number.isNaN(start)) throw new Error('Write each accrual year as an income year, such as 2023-24.');
    const label = row.year.trim();
    if (start >= receipt) {
      throw new Error(`${label} is not before the year of receipt: only arrears that accrued in earlier years count.`);
    }
    const arrears = dollars(row.arrears, `the arrears that accrued in ${label}`);
    if (arrears === 0) throw new Error(`Leave out ${label}: no arrears accrued in it.`);
    const facts = Object.fromEntries(FACTS.filter(([key]) => given(row[key]))
      .map(([key, name]) => [key, dollars(row[key], `${label}’s ${name}`)]));
    return { label, start, arrears, facts };
  }).sort((a, b) => b.start - a.start);
  const repeated = years.find((year, index) => index > 0 && years[index - 1].start === year.start);
  if (repeated) throw new Error(`${repeated.label} is given more than once: add every payer’s arrears for a year together.`);
  for (const [index, year] of years.entries()) {
    const named = FACTS.find(([key]) => key in year.facts);
    if (index >= 2 && named) {
      throw new Error(`${year.label} is a distant accrual year, whose notional tax comes from the 2 latest years’ rates: `
        + `give only its arrears, not its ${named[1]}.`);
    }
    if (index < 2 && !('taxable' in year.facts)) throw new Error(`Enter ${year.label}’s taxable income: it is a recent accrual year.`);
    if (index < 2 && years.length < 3 && 'gain' in year.facts) {
      throw new Error(`Leave out ${year.label}’s net capital gain: with fewer than 3 accrual years only taxable income is used.`);
    }
  }
  return years;
}

/** A recent accrual year's taxable income or normal taxable income, less its own total arrears amount as a
 * rebate year and plus what accrued in it of an earlier rebate year's (s 159ZRC(b) to (e), s 159ZRD(1)(b) to (e)).
 * @param {{facts: Record<string, number>}} year @param {number} income */
const adjusted = (year, income) => income - (year.facts.rebateYearArrears ?? 0) + (year.facts.earlierRebateArrears ?? 0);

/** s 159ZRD(1) to (3): a recent year's rate in thousandths, the increase over the arrears to 3 decimal places,
 * plus 0.001 when the fourth place would be more than 4. @param {number} units @param {number} arrears */
const rateOf = (units, arrears) => Math.floor((Math.floor((units * 5) / arrears) + 5) / 10);

/**
 * The lump sum payment in arrears tax offset for one year of receipt.
 * @param {ArrearsInput} input
 */
export function lumpSumArrears(input) {
  if (!RECEIPT_YEARS.includes(input?.year)) throw new Error(`Choose ${RECEIPT_YEARS.slice().reverse().join(', ')}.`);
  if (typeof input.resident !== 'boolean') throw new Error('Say whether the person was an Australian resident in each year.');
  if (!input.resident) {
    throw new Error('This calculator works the offset only for a person resident in Australia for the whole of the year of '
      + 'receipt and each recent accrual year, taxed at the resident rates with the full tax-free threshold.');
  }
  const taxable = dollars(input.taxable, 'taxable income');
  const gain = dollars(input.gain, 'the net capital gain');
  const years = accrualYears(input.accrual, startOf(input.year));
  const total = years.reduce((sum, year) => sum + year.arrears, 0);
  // s 159ZR(1): normal taxable income leaves out the net capital gain, and is nil if that leaves nothing.
  // s 159ZRA(1)(b): the total arrears amount is at least 10% of what is left of it after the total.
  const normal = Math.max(0, taxable - gain);
  const testIncome = Math.max(0, normal - total);
  const base = { total, normal, testIncome, tenPercent: testIncome / 10, met: total * 10 >= testIncome };
  if (!base.met) return { ...base, taxOnArrears: null, notional: [], distant: null, rates: null, notionalTotal: null, offset: 0 };
  const recent = years.slice(0, 2);
  const distant = years.slice(2);
  const unsupported = recent.find((year) => !(year.label in ARREARS_SCALES));
  if (unsupported) {
    throw new Error(`${unsupported.label} is a recent accrual year, whose notional tax is worked at that year’s rates, `
      + 'and this calculator holds resident rates from 2012-13 only.');
  }
  // s 159ZRB: tax on arrears, the tax on taxable income less the tax on it without the total arrears amount.
  const taxOnArrears = increase(input.year, taxable - total, total);
  // s 159ZRC: each recent year's tax on its taxable income with its arrears added, less the tax without them.
  const notional = recent.map((year) => increase(year.label, adjusted(year, year.facts.taxable), year.arrears));
  let rates = null;
  let distantTax = 0;
  if (distant.length) {
    // s 159ZRD: the distant years' arrears at the average of the recent years' rates, each worked on normal
    // taxable income.
    const recentRates = recent.map((year) => {
      const normalIncome = Math.max(0, year.facts.taxable - (year.facts.gain ?? 0));
      return rateOf(increase(year.label, adjusted(year, normalIncome), year.arrears), year.arrears);
    });
    const distantArrears = distant.reduce((sum, year) => sum + year.arrears, 0);
    distantTax = distantArrears * (recentRates[0] + recentRates[1]);
    rates = { mostRecent: recentRates[0] / 1000, secondMostRecent: recentRates[1] / 1000,
      average: (recentRates[0] + recentRates[1]) / 2000 };
  }
  const notionalTotal = notional.reduce((sum, units) => sum + units, distantTax);
  return {
    ...base,
    taxOnArrears: money(taxOnArrears),
    notional: recent.map((year, index) => ({ year: year.label, amount: money(notional[index]) })),
    distant: distant.length ? { years: distant.map((year) => year.label), amount: money(distantTax) } : null,
    rates,
    notionalTotal: money(notionalTotal),
    // ss 159ZRA(1) and 159ZRB: the rebate is the amount, if any, so calculated.
    offset: money(Math.max(0, taxOnArrears - notionalTotal)),
  };
}
