// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Salary against dividends for one company owner and one income year: the company pays the owner a
// salary and its super guarantee, pays company tax on the profit left and pays all of what remains as
// a fully franked dividend. The owner is an Australian resident individual with hospital cover and
// no other concessional contributions. Read 19 November 2026: the Superannuation Guarantee
// (Administration) Act 1992 s 12(2) (a director entitled to payment is an employee); ITAA 1997
// ss 207-20 (gross-up and tax offset) and 202-60 (the maximum franking credit) and 293-20
// (Division 293 taxable contributions); the Income Tax Rates Act 1986 s 26(1)(a) (15% on a complying
// fund's low tax component); the ATO's Division 293 page (15% of the taxable contributions, last
// updated 24 August 2026), 'Super guarantee' (Tables 21, 23 and 24, last updated 17 April 2026),
// 'Contributions caps' (last updated 11 September 2026), 'Changes to company tax rates' (25% for a
// base rate entity from 2021-22, last updated 4 September 2026), 'Tax rates – Australian resident'
// (last updated 13 August 2026) and 'Standard deduction for work-related expenses' (last updated
// 2 November 2026). The income tax, offsets and Medicare levy are the site's income tax engine's;
// the super guarantee rate and base and the Division 293 rule are the take-home pay engine's.
import { cents, ratioCents } from './money.mjs';
import { incomeTax, MEDICARE_THRESHOLDS, RESIDENT_SCALES } from './income-tax.mjs';
import { SUPER_GUARANTEE, division293 } from './take-home-pay.mjs';

/** The income years covered: the super guarantee table's, all with a 25% base rate. */
export const SALARY_DIVIDEND_YEARS = Object.keys(SUPER_GUARANTEE);

/**
 * @typedef {{year: string, profit: string, baseRate: boolean, salary: string, other: string}} OwnerPay
 * @typedef {{salary: number, superGuarantee: number, companyTax: number, dividend: number, credit: number,
 *   taxable: number, ownerTax: number, cash: number, superTax: number, superNet: number, kept: number,
 *   division293: number}} Split cents, except taxable income in whole dollars
 */

// Contributions tax (Rates Act s 26(1)(a)) and Division 293 tax, each 15%, in hundredths of 1%.
const SUPER_TAX = 1500n;
// The standard deduction of up to $1,000 against labour income, from 2026-27 (ITAA 1997 s 25-130).
const STANDARD_DEDUCTION = 100000;
const STANDARD_DEDUCTION_FROM = '2026-27';
// Where the low income tax offset (ITAA 1997 s 61-115) and, for 2020-21 and 2021-22, the low and
// middle income tax offset (ss 61-105 and 61-107) change slope, in whole dollars, as income-tax.mjs
// works them. A point outside a year's offsets only adds a candidate.
const OFFSET_STEPS = [37000, 37500, 45000, 48000, 66667, 90000, 126000];

/** The year's figures. @param {string} year @param {boolean} baseRate */
function law(year, baseRate) {
  if (!Object.hasOwn(SUPER_GUARANTEE, year)) throw new Error('Choose an income year from 2021-22 to 2026-27.');
  if (typeof baseRate !== 'boolean') throw new Error('Say whether the company is a base rate entity.');
  const { rate, cap } = SUPER_GUARANTEE[year];
  return { year, tenths: Math.round(rate * 10), cap: cap * 100, rate: baseRate ? 2500n : 3000n,
    deduction: year >= STANDARD_DEDUCTION_FROM };
}

/** The super guarantee on a salary in cents: the rate on the salary up to the year's base, half up.
 * @param {number} salary @param {ReturnType<typeof law>} y */
const superGuaranteeOn = (salary, y) => Math.floor((2 * Math.min(salary, y.cap) * y.tenths + 1000) / 2000);

/** Income tax and Medicare levy in cents on whole dollars, after the non-refundable offsets.
 * @param {number} dollars @param {string} year */
const taxOn = (dollars, year) => Math.round(incomeTax(String(Math.max(0, dollars)), year, 'resident').total * 100);

/** One split in cents: the salary, its super guarantee, the company tax on the rest and the fully
 * franked dividend of what is left, the franking credit at the company's rate rounded down (s 202-60),
 * and the owner's extra tax: the tax on other income, salary, dividend and credit (s 207-20) less the
 * $1,000 standard deduction from 2026-27, in whole dollars, less the credit and the tax on the other
 * income alone. Super keeps the super guarantee less 15% contributions tax and Division 293 tax.
 * @param {number} salary @param {number} profit @param {number} other cents
 * @param {ReturnType<typeof law>} y @returns {Split} */
function split(salary, profit, other, y) {
  const superGuarantee = superGuaranteeOn(salary, y);
  const left = profit - salary - superGuarantee;
  const companyTax = Number(ratioCents(BigInt(left) * y.rate, 10000n));
  const dividend = left - companyTax;
  const credit = Number(BigInt(dividend) * y.rate / (10000n - y.rate));
  const deduction = y.deduction ? Math.min(STANDARD_DEDUCTION, salary) : 0;
  const taxable = Math.floor((other + salary + dividend + credit - deduction) / 100);
  const ownerTax = taxOn(taxable, y.year) - credit - taxOn(Math.floor(other / 100), y.year);
  const division293Contributions = division293(taxable * 100, superGuarantee);
  const division293Tax = Number(ratioCents(BigInt(division293Contributions) * SUPER_TAX, 10000n));
  const superTax = Number(ratioCents(BigInt(superGuarantee) * SUPER_TAX, 10000n)) + division293Tax;
  const cash = salary + dividend - ownerTax;
  return { salary, superGuarantee, companyTax, dividend, credit, taxable, ownerTax, cash, superTax,
    superNet: superGuarantee - superTax, kept: cash + superGuarantee - superTax, division293: division293Tax };
}

/** The total kept in cents with nothing rounded, to rank salaries: the franking credit then equals
 * the company tax, and the owner's tax is taken in a straight line between the whole dollars either
 * side of the taxable income, so the total moves in a straight line between candidates.
 * @param {number} salary @param {number} profit @param {number} other cents @param {ReturnType<typeof law>} y */
function unrounded(salary, profit, other, y) {
  const superGuarantee = Math.min(salary, y.cap) * y.tenths / 1000;
  const taxable = (other + profit - superGuarantee - (y.deduction ? Math.min(STANDARD_DEDUCTION, salary) : 0)) / 100;
  const whole = Math.floor(taxable);
  const tax = taxOn(whole, y.year) + (taxable - whole) * (taxOn(whole + 1, y.year) - taxOn(whole, y.year));
  const excess = Math.max(0, Math.min(superGuarantee, taxable * 100 + superGuarantee - 25000000));
  return profit - superGuarantee - tax + taxOn(Math.floor(other / 100), y.year) + superGuarantee * 0.85 - excess * 0.15;
}

/** The largest salary in cents whose super guarantee the profit also pays.
 * @param {number} profit @param {ReturnType<typeof law>} y */
function largestSalary(profit, y) {
  let salary = Math.min(Math.floor(profit * 1000 / (1000 + y.tenths)), profit);
  if (salary > y.cap) salary = Math.max(y.cap, profit - superGuaranteeOn(y.cap, y));
  while (salary > 0 && salary + superGuaranteeOn(salary, y) > profit) salary -= 1;
  while (salary + 1 + superGuaranteeOn(salary + 1, y) <= profit) salary += 1;
  return salary;
}

/** The first whole dollar of taxable income with tax left after the offsets: below it the
 * offsets take the tax to nil, so the tax changes slope there. @param {string} year */
function firstTaxed(year) {
  let [low, high] = [0, 200000];
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (incomeTax(String(middle), year, 'resident').netTax > 0) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** The salaries, in cents, at which the kept total can change slope: no salary, the largest, the
 * super guarantee base, the $1,000 standard deduction, the Division 293 threshold and each taxable
 * income at which a tax rate, offset or the Medicare levy changes slope, with the whole dollar
 * either side. Between 2 neighbours the kept total moves in a straight line, rounding aside.
 * @param {number} profit @param {number} other @param {number} largest @param {ReturnType<typeof law>} y */
function candidates(profit, other, largest, y) {
  const rate = y.tenths / 1000;
  const deduction = y.deduction ? STANDARD_DEDUCTION : 0;
  const points = [...RESIDENT_SCALES[y.year].map(([over]) => over), ...OFFSET_STEPS, ...MEDICARE_THRESHOLDS[y.year],
    firstTaxed(y.year)].map((dollars) => dollars * 100);
  // Taxable income is about the other income, the profit less the super guarantee and the deduction.
  const salaries = [0, largest, y.cap, deduction, (other + profit - deduction - 25000000) / rate,
    ...points.flatMap((income) => [(other + profit - deduction - income) / rate, (other + profit - income) / (1 + rate)])];
  const found = new Set([0, largest]);
  for (const salary of salaries) {
    const dollar = Math.floor(salary / 100) * 100;
    for (const near of [dollar - 100, dollar, dollar + 100]) if (near >= 0 && near <= largest) found.add(near);
  }
  return [...found].sort((a, b) => a - b);
}

/** Cents as dollars. @param {number} value */
const dollars = (value) => value / 100;

/** The owner's split with the company profit paid out, against all salary, all dividends and the
 * split that keeps the most cash and super after tax, to the dollar of salary. Super counts at its
 * value after tax, though it is preserved until retirement.
 * @param {OwnerPay} pay */
export function salaryDividend(pay) {
  const y = law(pay.year, pay.baseRate);
  const profit = cents(pay.profit);
  const salary = cents(pay.salary);
  const other = cents(pay.other);
  const largest = largestSalary(profit, y);
  if (salary > largest) {
    throw new Error(`Enter a salary of no more than $${(largest / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}: `
      + 'the profit also pays its super guarantee.');
  }
  const chosen = split(salary, profit, other, y);
  // Rounding to the cent and taxable income to the dollar move the total by cents from one dollar of
  // salary to the next, so the candidates are ranked unrounded; a tie keeps the lower salary.
  const ranked = candidates(profit, other, largest, y).map((one) => [one, unrounded(one, profit, other, y)]);
  const [bestSalary] = ranked.reduce((top, one) => (one[1] > top[1] + 1e-6 ? one : top));
  const best = split(bestSalary, profit, other, y);
  const allSalary = split(largest, profit, other, y);
  const allDividends = split(0, profit, other, y);
  return { ...Object.fromEntries(Object.entries(chosen).map(([key, value]) => [key, key === 'taxable' ? value : dollars(value)])),
    largest: dollars(largest), allSalary: dollars(allSalary.kept), allDividends: dollars(allDividends.kept),
    bestSalary: dollars(best.salary), bestKept: dollars(best.kept), bestCash: dollars(best.cash), bestSuper: dollars(best.superNet) };
}

/** The page's result: its inputs sentence, labelled rows and note.
 * @param {OwnerPay} pay @param {(value: number) => string} aud */
export function salaryDividendResult(pay, aud) {
  const r = salaryDividend(pay);
  const { rate } = SUPER_GUARANTEE[pay.year];
  const notes = ['The split that keeps the most counts super after tax, though it stays in the fund until retirement'];
  if (r.division293) notes.push('Division 293 tax is counted against the super');
  if (r.superGuarantee && r.taxable <= 37000) {
    notes.push('The low income super tax offset, up to $500 back on the contributions tax, is not counted');
  }
  return { inputs: `${pay.year}, company profit before the owner’s pay ${aud(Number(pay.profit))}, company tax at `
    + `${pay.baseRate ? '25% (a base rate entity)' : '30%'}, salary ${aud(Number(pay.salary))}, other taxable income `
    + `${aud(Number(pay.other))}`,
  rows: [[`Super guarantee at ${rate}% of the salary`, aud(r.superGuarantee)], ['Company tax on the profit left', aud(r.companyTax)],
    ['Fully franked dividend', aud(r.dividend)], ['Franking credit', aud(r.credit)],
    ['Owner’s taxable income', aud(r.taxable)], ['Owner’s extra income tax and Medicare levy, less the franking credit', aud(r.ownerTax)],
    ['Contributions tax and Division 293 tax on the super', aud(r.superTax)], ['Cash kept after tax', aud(r.cash)],
    ['Super kept after tax', aud(r.superNet)], ['Kept in all, cash and super', aud(r.kept)],
    [`All salary, ${aud(r.largest)}: kept in all`, aud(r.allSalary)], ['All dividends: kept in all', aud(r.allDividends)],
    [`Most kept: salary of ${aud(r.bestSalary)}, ${aud(r.bestCash)} cash and ${aud(r.bestSuper)} super`, aud(r.bestKept)]],
  principal: 9, note: notes.join('. ') };
}
