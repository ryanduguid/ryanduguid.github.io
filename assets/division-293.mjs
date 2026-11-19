// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Division 293 tax for one income year, under Division 293 of the Income Tax Assessment Act 1997
// (Compilation No. 268, 1 October 2026, read 19 November 2026) and section 5 of the Superannuation
// (Sustaining the Superannuation Contribution Concession) Imposition Act 2013: 15% of the taxable
// contributions. The compilation's endnotes show ss 291-20, 293-20 and 293-25 last amended by Act
// No. 81, 2016, for 2017-18, so the same rules cover every year here.
import { cents } from './money.mjs';
import { wholeDollars } from './income-tax.mjs';
import { CONCESSIONAL_CAP, division293 } from './take-home-pay.mjs';

/** The income years this module covers: those with a concessional contributions cap here. */
export const DIVISION_293_YEARS = Object.keys(CONCESSIONAL_CAP);

// The high income threshold (s 293-20(1)), in cents.
const THRESHOLD = 25000000;

/**
 * @typedef {{year: string, interests: string, taxable: string, fringe: string, losses: string, trust: string,
 *   fhss: string, lumpSum: string, concessional: string, unused: string, balanceUnder: boolean}} Division293
 */

/** Division 293 income (s 293-20(1)(a)) in whole dollars: income for surcharge purposes (s 995-1)
 * disregarding reportable superannuation contributions, so taxable income without any assessable
 * FHSS released amount (none left where that is more), plus income on which family trust
 * distribution tax was paid (disregarding s 271-105(1) of Schedule 2F to the 1936 Act), the
 * reportable fringe benefits total and the total net investment loss, less the s 301-20(3) amount: the
 * taxable component of a super lump sum taxed at 0%. The income tests page works the same measure
 * with this function, so the 2 pages cannot disagree.
 * @param {{taxable: number, fhss: number, trust: number, fringe: number, losses: number, lumpSum: number}} parts
 *   whole dollars */
export function division293Income({ taxable, fhss, trust, fringe, losses, lumpSum }) {
  const base = Math.max(0, taxable - fhss);
  if (lumpSum > base) throw new Error('The zero-rate lump sum is part of taxable income, so it cannot exceed taxable income less the FHSS amount.');
  return base + trust + fringe + losses - lumpSum;
}

/** Division 293 income in cents. Only a person at or over preservation age and under 60 receives a
 * lump sum taxed at 0% (s 301-20), so nobody from 2024-25, when preservation age is 60 for everyone
 * under 60. @param {Division293} d */
const income = (d) => {
  const lumpSum = wholeDollars(d.lumpSum);
  if (lumpSum && d.year >= '2024-25') {
    throw new Error('From 2024-25 nobody under 60 has reached preservation age, so no super lump sum is taxed at 0% (section 301-20).');
  }
  return division293Income({ taxable: wholeDollars(d.taxable), fhss: wholeDollars(d.fhss), trust: wholeDollars(d.trust),
    fringe: wholeDollars(d.fringe), losses: wholeDollars(d.losses), lumpSum }) * 100;
};

/** Division 293 tax for an individual whose contributions are all to accumulation interests. Low
 * tax contributions are the concessional contributions less excess concessional contributions (ss
 * 293-25 and 293-30); the excess is what exceeds the year's cap (s 291-20(1)), raised by unused cap
 * from the previous 5 years when the total superannuation balance just before the year was under
 * $500,000, but not beyond the contributions (s 291-20(3) and (4)). Taxable contributions are the
 * lesser of the low tax contributions and the excess of them plus Division 293 income over $250,000,
 * none when they are nil (s 293-20). The tax is 15% of them, rounded to the nearest cent: neither
 * Act prescribes rounding.
 * @param {Division293} d */
export function division293Tax(d) {
  if (!DIVISION_293_YEARS.includes(d.year)) throw new Error('Choose an income year from 2021-22 to 2026-27.');
  if (d.interests !== 'accumulation') {
    throw new Error('A defined benefit interest, a constitutionally protected fund or a judges’ pension scheme changes the '
      + 'contributions Division 293 counts (Subdivisions 293-D to 293-F), which this calculator does not work out.');
  }
  if (typeof d.balanceUnder !== 'boolean') throw new Error('Say whether your total super balance was under $500,000.');
  const division293Income = income(d);
  const concessional = cents(d.concessional);
  const cap = CONCESSIONAL_CAP[d.year] * 100;
  const unused = cents(d.unused);
  const overCap = Math.max(0, concessional - cap);
  const carried = d.balanceUnder ? Math.min(unused, overCap) : 0;
  const excess = overCap - carried;
  const low = concessional - excess;
  const combined = division293Income + low;
  const taxable = division293(division293Income, low);
  return { year: d.year, income: division293Income / 100, concessional: concessional / 100, cap: cap / 100,
    carried: carried / 100, excess: excess / 100, low: low / 100, combined: combined / 100,
    over: Math.max(0, combined - THRESHOLD) / 100, taxable: taxable / 100, tax: Math.round((taxable * 15) / 100) / 100,
    room: Math.max(0, THRESHOLD - combined) / 100 };
}
