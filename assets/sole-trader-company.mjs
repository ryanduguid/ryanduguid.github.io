// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// One business profit for one income year, taxed 2 ways. As a sole trader the owner, an Australian
// resident, pays income tax and the Medicare levy on the whole profit, less the small business income
// tax offset where the business qualifies (ITAA 1997 Subdivision 328-F); what the owner takes out does
// not change the tax. Through a company the owner takes a salary with its super guarantee, the
// company pays tax on the profit left, pays the rest of what the owner takes out as a fully franked
// dividend and keeps the remainder; the owner pays tax on the salary and the grossed-up dividend less
// the franking credit, and the super fund pays contributions tax. Read 26 November 2026: ITAA 1997
// ss 328-357 (a $5 million turnover test for the offset) and 328-360 (16% of the basic income tax
// liability on the net small business income share, at most $1,000), 202-60 and 207-20 on the ATO's
// legal database; the ATO's 'Small business income tax offset' (last updated 7 May 2025), 'Changes to
// company tax rates' (last updated 4 September 2026), 'Tax rates – Australian resident' (last updated
// 13 August 2026) and 'Super guarantee' (last updated 17 April 2026). Every rate is another engine's:
// the sole trader's tax is the sole trader calculator's, the company's tax and franking credit the
// company tax calculator's, and the owner's tax, super guarantee and super tax the salary against
// dividends calculator's, which takes them from the income tax and take-home pay engines.
import { cents, ratioCents } from './money.mjs';
import { COMPANY_TAX_LAW, companyTax } from './company-tax.mjs';
import { largestSalary, law, SALARY_DIVIDEND_YEARS, SUPER_TAX, superGuaranteeOn, taxOn } from './salary-dividend.mjs';
import { soleTraderSetAside } from './sole-trader.mjs';
import { SUPER_GUARANTEE, division293 } from './take-home-pay.mjs';

/** The income years covered: the salary against dividends calculator's, 2021-22 to 2026-27. */
export const SOLE_TRADER_COMPANY_YEARS = SALARY_DIVIDEND_YEARS;

/**
 * @typedef {{year: string, profit: string, takenOut: string, salary: string, baseRate: boolean, offset: boolean}} Structures
 */

/** Cents as a dollar string for another engine's input. @param {number} value */
const text = (value) => (value / 100).toFixed(2);
/** Cents as dollars. @param {number} value */
const dollars = (value) => value / 100;
/** Cents as a dollar figure for a message. @param {number} value */
const shown = (value) => `$${dollars(value).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;

/** The company's tax on `taxable` cents and the franking credit on a fully franked `dividend`, at
 * 25% for a base rate entity this year and last (so its corporate tax rate for imputation purposes
 * is 25% too) or 30%, as the company tax calculator works them: tax half up, the credit down.
 * @param {number} taxable @param {number} dividend @param {boolean} baseRate */
function company(taxable, dividend, baseRate) {
  // The stated fact, put to the calculator's base rate entity test: turnover of nil passes it and
  // turnover at the threshold fails it, with no passive income either year.
  const year = { turnover: baseRate ? '0' : COMPANY_TAX_LAW.threshold, assessable: '0', passive: '0' };
  const r = companyTax({ ...year, taxable: text(taxable), existed: true, prior: year, dividend: text(dividend),
    franking: '100', marginal: '0' });
  return { rate: r.rate, tax: cents(String(r.tax)), credit: cents(String(r.credit)) };
}

/** The sole trader's tax on the whole profit, in cents: a resident with no other income, private
 * patient hospital cover, no study loan and no GST to count. @param {Structures} s */
function soleTrader(s) {
  const r = soleTraderSetAside({ year: s.year, income: s.profit, expenses: '0', wages: '0', deductions: '0', super: '0',
    offset: s.offset, studyLoan: false, hospitalCover: true, gst: false, credits: '0', invoice: '0' });
  return { taxable: r.taxable, tax: cents(String(r.tax)), offsets: cents(String(r.offset)) + cents(String(r.lmito)),
    smallBusiness: cents(String(r.smallBusinessOffset)), medicare: cents(String(r.medicare)), total: cents(String(r.total)) };
}

/** Both structures for one profit, in dollars. The company pays the salary and its super guarantee,
 * both deductible, and tax on the rest; the amount taken out less the salary is a fully franked
 * dividend from the profit after that tax, and what is left stays in the company. The owner's tax is
 * income tax and the Medicare levy on the salary (less the $1,000 standard deduction from 2026-27),
 * the dividend and its credit, less the credit; the top-up tax is that less the tax on the salary
 * alone. The super fund pays 15% on the super guarantee and Division 293 tax where it applies.
 * @param {Structures} s */
export function soleTraderCompany(s) {
  const y = law(s.year, s.baseRate);
  const profit = cents(s.profit);
  const salary = cents(s.salary);
  const takenOut = cents(s.takenOut);
  const sole = soleTrader(s);
  const largest = largestSalary(profit, y);
  if (salary > largest) {
    throw new Error(`Enter a salary of no more than ${shown(largest)}: the profit also pays its super guarantee.`);
  }
  if (takenOut < salary) throw new Error('Enter an amount taken out of at least the salary: the rest is the dividend.');
  const superGuarantee = superGuaranteeOn(salary, y);
  const taxable = profit - salary - superGuarantee;
  const { tax: companyTaxed } = company(taxable, 0, s.baseRate);
  const afterTax = taxable - companyTaxed;
  if (takenOut - salary > afterTax) {
    throw new Error(`Enter an amount taken out of no more than ${shown(salary + afterTax)}: the salary and the profit `
      + 'left after company tax.');
  }
  const dividend = takenOut - salary;
  const { rate, credit } = company(taxable, dividend, s.baseRate);
  const deduction = y.deduction ? Math.min(100000, salary) : 0;
  const ownerTaxable = Math.floor((salary + dividend + credit - deduction) / 100);
  const salaryTax = taxOn(Math.floor((salary - deduction) / 100), y.year);
  const topUp = taxOn(ownerTaxable, y.year) - salaryTax - credit;
  const division293Tax = Number(ratioCents(BigInt(division293(ownerTaxable * 100, superGuarantee)) * SUPER_TAX, 10000n));
  const superTax = Number(ratioCents(BigInt(superGuarantee) * SUPER_TAX, 10000n)) + division293Tax;
  const total = companyTaxed + salaryTax + topUp + superTax;
  return { soleTaxable: sole.taxable, soleTax: dollars(sole.tax), soleOffsets: dollars(sole.offsets),
    smallBusinessOffset: dollars(sole.smallBusiness), soleMedicare: dollars(sole.medicare), soleTotal: dollars(sole.total),
    soleKept: dollars(profit - sole.total), companyRate: rate, superGuarantee: dollars(superGuarantee),
    companyTaxable: dollars(taxable), companyTax: dollars(companyTaxed), dividend: dollars(dividend), credit: dollars(credit),
    retained: dollars(afterTax - dividend), ownerTaxable, salaryTax: dollars(salaryTax), topUp: dollars(topUp),
    superTax: dollars(superTax), division293: dollars(division293Tax), companyTotal: dollars(total),
    cash: dollars(takenOut - salaryTax - topUp), superKept: dollars(superGuarantee - superTax),
    difference: dollars(total - sole.total), largestSalary: dollars(largest), largestTakenOut: dollars(salary + afterTax) };
}

/** The page's result: its inputs sentence, labelled rows and note.
 * @param {Structures} s @param {(value: number) => string} aud */
export function soleTraderCompanyResult(s, aud) {
  const r = soleTraderCompany(s);
  const { rate } = SUPER_GUARANTEE[s.year];
  const notes = ['Neither total is advice on a structure. Retained profit may bring more personal tax or a refund '
    + 'when paid out, and super stays in the fund until retirement'];
  if (!s.offset) notes.push('The sole trader gets no small business income tax offset, as you said the business does not qualify');
  if (r.division293) notes.push('Division 293 tax is counted in the super tax');
  if (r.superGuarantee && r.ownerTaxable <= 37000) {
    notes.push('The low income super tax offset, up to $500 back on the contributions tax, is not counted');
  }
  const difference = r.difference > 0 ? 'Company total is more by' : r.difference < 0 ? 'Company total is less by' : 'The totals are equal';
  return { inputs: `${s.year}, business profit ${aud(Number(s.profit))}, taken out by the owner ${aud(Number(s.takenOut))}, `
    + `salary ${aud(Number(s.salary))}, company tax at ${s.baseRate ? '25% (a base rate entity)' : '30%'}, `
    + `${s.offset ? 'qualifies' : 'does not qualify'} for the small business income tax offset`,
  rows: [['Sole trader: income tax before offsets', aud(r.soleTax)],
    ['Sole trader: low income tax offsets', aud(r.soleOffsets)],
    ['Sole trader: small business income tax offset', aud(r.smallBusinessOffset)],
    ['Sole trader: Medicare levy', aud(r.soleMedicare)],
    ['Sole trader: total tax', aud(r.soleTotal)],
    ['Sole trader: profit left after tax', aud(r.soleKept)],
    [`Company: super guarantee at ${rate}% of the salary`, aud(r.superGuarantee)],
    [`Company: tax at ${r.companyRate}% on ${aud(r.companyTaxable)}`, aud(r.companyTax)],
    ['Company: fully franked dividend', aud(r.dividend)],
    ['Company: franking credit on it', aud(r.credit)],
    ['Company: profit kept in the company after tax', aud(r.retained)],
    ['Owner: income tax and Medicare levy on the salary', aud(r.salaryTax)],
    [r.topUp < 0 ? 'Owner: refund of franking credits on the dividend' : 'Owner: top-up tax on the dividend after the franking credit',
      aud(Math.abs(r.topUp))],
    ['Super fund: contributions tax and Division 293 tax', aud(r.superTax)],
    ['Company structure: total tax', aud(r.companyTotal)],
    ['Company structure: owner’s cash after tax', aud(r.cash)],
    ['Company structure: super after tax', aud(r.superKept)],
    [difference, aud(Math.abs(r.difference))]],
  principal: 17, note: notes.join('. ') };
}
