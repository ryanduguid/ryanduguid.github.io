// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// A projection of one accumulation super account from 2026-27 to a retirement age, in future dollars
// and as a present value. The defaults the Instrument fixes are used: retirement at 67 and a present
// value at 3.7% a year (ASIC Corporations (Superannuation Calculators and Retirement Estimates)
// Instrument 2022/603, s 4, Compilation No. 1, 11 September 2024, read 19 November 2026). Every
// other assumption is an input.
import { wholeDollars } from './income-tax.mjs';
import { cents, number, ratioCents } from './money.mjs';
import { CONCESSIONAL_CAP, SUPER_GUARANTEE } from './take-home-pay.mjs';

/** The first year projected, whose caps, super guarantee rate and maximum contribution base apply. */
export const PROJECTION_YEAR = '2026-27';

// Super is preserved until 60 for anyone born after 30 June 1964 (SIS Regulations reg 6.01(2)),
// and contributions after 75 are mostly refused, so retirement falls between them. The
// non-concessional contributions cap for 2026-27 in whole dollars, from the ATO's 'Contributions
// caps' (Table 4, last updated 11 September 2026), read 19 November 2026. Contributions are the fund's
// assessable income (ITAA 1997 s 295-160), taxed at 15% (Income Tax Rates Act 1986 s 26(1)), here in
// hundredths of a per cent.
const PRESERVATION_AGE = 60;
const LAST_AGE = 75;
const NON_CONCESSIONAL_CAP = 130000;
const CONTRIBUTIONS_TAX = 1500n;

/**
 * @typedef {{age: string, retire: string, balance: string, salary: string, employer: string, sacrifice: string,
 *   afterTax: string, returnRate: string, percentFee: string, adminFee: string, insurance: string, growth: string,
 *   discount: string}} Projection
 * @typedef {{salary: bigint, base: bigint, sacrifice: bigint, afterTax: bigint, fee: bigint, insurance: bigint}} Flows
 * @typedef {{employer: bigint, earn: bigint, fee: bigint}} Rates
 */

/** A rate entered as a per cent with up to 2 decimals, in hundredths of a per cent. @param {string} value @param {number} max */
const percent = (value, max) => BigInt(Math.round(number(value, { max }) * 100));
/** `amount` cents times `rate` hundredths of a per cent, half up. @param {bigint} amount @param {bigint} rate */
const share = (amount, rate) => ratioCents(amount * rate, 10000n);

/** One year of the account, every flow paid evenly through it and so earning for half the year on
 * average: earnings and the percentage fee are taken on the opening balance plus half the year's net
 * flows, and the fund's deduction for fees and premiums comes off its tax at 15%.
 * @param {bigint} balance opening, cents @param {Flows} y @param {Rates} rates */
function projectYear(balance, y, rates) {
  const employer = share(y.salary < y.base ? y.salary : y.base, rates.employer);
  const concessional = employer + y.sacrifice;
  const contributed = concessional - share(concessional, CONTRIBUTIONS_TAX) + y.afterTax;
  const flow = contributed - y.fee - y.insurance;
  const twiceAverage = 2n * balance + flow > 0n ? 2n * balance + flow : 0n;
  const earnings = ratioCents(twiceAverage * rates.earn, 20000n);
  const percentFee = ratioCents(twiceAverage * rates.fee, 20000n);
  const fees = y.fee + y.insurance + percentFee;
  const net = fees - share(fees, CONTRIBUTIONS_TAX);
  // An account the fees would overdraw pays what it has and closes at nil.
  const available = balance + contributed + earnings;
  const taken = net < available ? net : available;
  return { closing: available - taken, employer, concessional, contributed, earnings, fees: taken };
}

/** The account at the retirement age, projected a whole year at a time from the current age. The
 * salary, the voluntary contributions, the dollar fee, the premiums and the maximum contribution base
 * all grow at the wage growth rate after the first year; the employer pays its rate on the salary up
 * to the base. The present value divides the final balance by (1 + the discount rate) to the power of
 * the years projected, half up to the cent. Money is in dollars, rates in per cent.
 * @param {Projection} p */
export function superProjection(p) {
  const age = number(p.age, { min: 15, max: LAST_AGE - 1, integer: true });
  const retire = number(p.retire, { min: PRESERVATION_AGE, max: LAST_AGE, integer: true });
  if (retire <= age) {
    throw new Error('Enter a retirement age after your current age; '
      + 'this projection does not cover an account already paying a pension.');
  }
  const rates = { employer: percent(p.employer, 30), earn: percent(p.returnRate, 20), fee: percent(p.percentFee, 5) };
  const [growth, discount] = [percent(p.growth, 10), percent(p.discount, 10)];
  let y = { salary: BigInt(wholeDollars(p.salary)) * 100n, base: BigInt(SUPER_GUARANTEE[PROJECTION_YEAR].cap) * 100n,
    sacrifice: BigInt(cents(p.sacrifice)), afterTax: BigInt(cents(p.afterTax)), fee: BigInt(cents(p.adminFee)),
    insurance: BigInt(cents(p.insurance)) };
  let balance = BigInt(cents(p.balance));
  const first = projectYear(balance, y, rates);
  if (first.concessional > BigInt(CONCESSIONAL_CAP[PROJECTION_YEAR]) * 100n) {
    throw new Error('Your concessional contributions for 2026-27 are above the $32,500 cap; '
      + 'this projection does not compute excess contributions.');
  }
  if (y.afterTax > BigInt(NON_CONCESSIONAL_CAP) * 100n) {
    throw new Error('Your after-tax contributions for 2026-27 are above the $130,000 cap; '
      + 'this projection does not compute excess contributions.');
  }
  const totals = { contributed: 0n, earnings: 0n, fees: 0n };
  for (let year = 0; year < retire - age; year += 1) {
    if (year) y = /** @type {Flows} */ (Object.fromEntries(Object.entries(y).map(([k, v]) => [k, share(v, 10000n + growth)])));
    const r = projectYear(balance, y, rates);
    balance = r.closing;
    totals.contributed += r.contributed;
    totals.earnings += r.earnings;
    totals.fees += r.fees;
  }
  const years = BigInt(retire - age);
  const present = ratioCents(balance * 10000n ** years, (10000n + discount) ** years);
  const dollars = (/** @type {bigint} */ value) => Number(value) / 100;
  return { years: retire - age, retire, employer: dollars(first.employer), concessional: dollars(first.concessional),
    balance: dollars(balance), present: dollars(present), contributed: dollars(totals.contributed),
    earnings: dollars(totals.earnings), fees: dollars(totals.fees) };
}
