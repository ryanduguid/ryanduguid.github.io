// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// What an Australian resident sole trader sets aside from business income for one full income
// year: the income tax, Medicare levy, any Medicare levy surcharge and study loan repayment that the
// business profit adds to any wages, after the small business income tax offset, and the GST on the
// business's taxable sales less its GST credits, as a share of each invoice and an amount each
// quarter, month and week. The tax itself is the income tax calculator's.
import { daysInYear, incomeTax, medicareLevySurcharge } from './income-tax.mjs';
import { number, ratioCents, ratioPercent } from './money.mjs';
import { studyLoanRepayment } from './study-loan.mjs';

/** The income years this calculator covers, newest first: the offset is 16% in each. */
export const SOLE_TRADER_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22'];

// ITAA 1997 s 328-360 (Compilation No. 268, 1 October 2026, read 19 November 2026): 16% of total
// net small business income over taxable income times the basic income tax liability, at most
// $1,000. Total net small business income is the net small business income (s 328-365: business
// income less the deductions attributable to it, other than tax-related expenses, gifts and personal
// super contributions, s 328-370) up to the taxable income. The ATO's 'Small business income tax
// offset' (last updated 7 May 2025), read 19 November 2026, gives 16% for 2021-22 onwards.
const OFFSET_RATE = 16;
const OFFSET_CAP = 100000;
// From 2026-27 an Australian resident deducts the lesser of $1,000 and assessable labour income
// (s 25-130). Labour income is salary and wages that must be withheld from (s 25-130(4)), not
// business income, so only the wages take it.
const STANDARD_DEDUCTION_FROM = '2026-27';
// GST Act ss 9-70 and 9-75 (Compilation No. 96, 1 January 2026, read 19 November 2026): GST is 10%
// of the value of a taxable supply, so a GST-exclusive amount gains a tenth.
const GST_TENTHS = 10;
// The registration turnover threshold (s 23-15 and the regulations): $75,000, from the ATO's
// 'Registering for GST' (last updated 14 September 2026), read 19 November 2026.
const GST_THRESHOLD = 7500000;
// ATO, 'Starting PAYG instalments' (last updated 17 December 2024), read 19 November 2026: an
// individual enters with instalment income of $4,000 or more on the latest return, tax payable of
// $1,000 or more on the latest assessment and notional tax of $500 or more.
const INSTALMENT_INCOME = 400000;
const INSTALMENT_TAX = 100000;

/** An amount in dollars and cents, as cents. @param {string} value */
const amountCents = (value) => Math.round(number(value, { max: 1e9, money: true }) * 100);
/** @param {number} numerator @param {number} denominator positive; half up */
const nearest = (numerator, denominator) => Number(ratioCents(BigInt(numerator), BigInt(denominator)));
const cents = (/** @type {number} */ value) => Math.round(value * 100);

/**
 * @typedef {{year: string, income: string, expenses: string, wages: string, deductions: string, super: string,
 *   offset: boolean, studyLoan: boolean, hospitalCover: boolean, gst: boolean, credits: string, invoice: string}} SoleTrader
 */

/** The year's tax, levies and repayment for a resident single person on `taxable` whole dollars, with
 * `business` whole dollars of net small business income for the offset (0 without it), each in cents.
 * The offset applies after the low income and the low and middle income tax offsets and, like them,
 * cannot take the tax below nil (s 63-10, item 20). Deductible personal super contributions, `reported`
 * whole dollars, are reportable super contributions, so they join income for surcharge purposes and
 * repayment income (HESA s 154-5(1); the ATO's 'Income tests', last updated 8 June 2026, read
 * 19 November 2026). @param {string} year @param {number} taxable
 * @param {number} business @param {boolean} studyLoan @param {boolean} hospitalCover @param {number} reported */
function assess(year, taxable, business, studyLoan, hospitalCover, reported) {
  const t = incomeTax(String(taxable), year, 'resident');
  const [tax, offset, lmito] = [cents(t.tax), cents(t.offset), cents(t.lmito)];
  const share = taxable ? nearest(OFFSET_RATE * Math.min(business, taxable) * tax, 100 * taxable) : 0;
  const small = Math.min(share, OFFSET_CAP, tax - offset - lmito);
  const surcharge = hospitalCover ? 0 : cents(medicareLevySurcharge({ year, taxable, fringe: 0, super: reported, losses: 0,
    spouse: null, children: 0, uncoveredDays: daysInYear(year) }).surcharge);
  const loan = studyLoan ? cents(studyLoanRepayment({ taxable: String(taxable), fringe: '0', losses: '0', super: String(reported),
    foreign: '0' }, year).repayment) : 0;
  const medicare = cents(t.medicare);
  return { tax, offset, lmito, small, medicare, surcharge, loan,
    total: tax - offset - lmito - small + medicare + surcharge + loan };
}

/** One full year: business income and expenses exclusive of GST, wages from a job, other deductions that
 * are not the business's (tax agent fees and gifts) and personal super contributions claimed as a
 * deduction, each in dollars and cents. Taxable income is their net in whole dollars, less the standard deduction on the wages from
 * 2026-27; the net small business income is the profit in whole dollars when `offset` says the business
 * qualifies. The business's tax is the year's total less the total on the wages and deductions alone,
 * which assumes the wages were withheld from as though they were the only income. A GST-registered
 * business adds the GST on its income less its GST credits. The set-aside is that tax and GST over the
 * year's invoices, GST included, so one share of each invoice covers both. Each amount rounds half up
 * to the cent. @param {SoleTrader} s */
export function soleTraderSetAside(s) {
  if (!SOLE_TRADER_YEARS.includes(s.year)) throw new Error('Choose an income year from 2021-22 to 2026-27.');
  for (const [field, question] of [['offset', 'Say whether the business qualifies for the small business income tax offset.'],
    ['studyLoan', 'Say whether you have a study or training loan.'],
    ['hospitalCover', 'Say whether you had private patient hospital cover all year.'],
    ['gst', 'Say whether the business is registered for GST.']]) {
    if (typeof s[/** @type {keyof SoleTrader} */ (field)] !== 'boolean') throw new Error(question);
  }
  const [income, expenses, wages, deductions, contributions, credits, invoice] = [s.income, s.expenses, s.wages,
    s.deductions, s.super, s.credits, s.invoice].map(amountCents);
  if (expenses > income) {
    throw new Error('Enter business expenses no more than the business income: a loss is not worked here.');
  }
  const profit = income - expenses;
  const deduction = s.year >= STANDARD_DEDUCTION_FROM ? Math.min(100000, wages) : 0;
  if (deductions + contributions > profit + wages - deduction) {
    throw new Error('Enter other deductions and super contributions no more than the profit and wages less any '
      + 'standard deduction.');
  }
  const gstOnIncome = s.gst ? nearest(income, GST_TENTHS) : 0;
  if (!s.gst && credits) throw new Error('Enter 0 for GST credits when the business is not registered for GST.');
  if (credits > gstOnIncome) {
    throw new Error('Enter GST credits no more than the GST on the business income: a refund is not worked here.');
  }
  const taxable = Math.floor((profit + wages - deduction - deductions - contributions) / 100);
  const reported = Math.floor(contributions / 100);
  const all = assess(s.year, taxable, s.offset ? Math.floor(profit / 100) : 0, s.studyLoan, s.hospitalCover, reported);
  // On the wages alone, only the contributions the wages left after the other deductions can absorb are
  // deducted, so only they are reported.
  const room = Math.max(0, wages - deduction - deductions);
  const aloneContributions = Math.min(contributions, room);
  const alone = assess(s.year, Math.floor((room - aloneContributions) / 100), 0, s.studyLoan, s.hospitalCover,
    Math.floor(aloneContributions / 100));
  const businessTax = all.total - alone.total;
  const gst = gstOnIncome - credits;
  const setAside = businessTax + gst;
  const invoiced = income + gstOnIncome;
  const fromInvoice = invoiced ? nearest(invoice * setAside, invoiced) : 0;
  const money = (/** @type {number} */ value) => value / 100;
  return { profit: money(profit), deduction: money(deduction), taxable, tax: money(all.tax), offset: money(all.offset),
    lmito: money(all.lmito), smallBusinessOffset: money(all.small), medicare: money(all.medicare),
    surcharge: money(all.surcharge), studyLoan: money(all.loan), total: money(all.total), wagesTax: money(alone.total),
    businessTax: money(businessTax), gstOnIncome: money(gstOnIncome), credits: money(credits), gst: money(gst),
    setAside: money(setAside), taxShare: income ? ratioPercent(businessTax, income) : 0,
    invoiceShare: invoiced ? ratioPercent(setAside, invoiced) : 0, quarterly: money(nearest(setAside, 4)),
    monthly: money(nearest(setAside, 12)), weekly: money(nearest(setAside, 52)),
    invoice: { amount: money(invoice), setAside: money(fromInvoice), left: money(invoice - fromInvoice) },
    instalments: income >= INSTALMENT_INCOME && all.total - all.loan >= INSTALMENT_TAX,
    mustRegister: !s.gst && income >= GST_THRESHOLD };
}
