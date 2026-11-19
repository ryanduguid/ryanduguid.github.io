// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The result rows of the individual tax calculators, from a form's fields. assets/accounting-pages.mjs
// renders them as it does the business calculators' results.
import { STUDY_LOAN_YEARS, studyLoanRepayment } from './study-loan.mjs';
import { SUPER_GUARANTEE, takeHomePay } from './take-home-pay.mjs';
import { INCOME_TAX_YEARS } from './income-tax.mjs';
import { taxEstimate } from './tax-estimate.mjs';
import { SOLE_TRADER_YEARS, soleTraderSetAside } from './sole-trader.mjs';

/** @typedef {{inputs: string, rows: string[][], principal: number, note?: string}} Result */

const RESIDENCY = /** @type {Record<string, string>} */ ({ resident: 'Australian resident', foreign: 'foreign resident',
  'working-holiday': 'working holiday maker' });
const NOT_RESIDENT = /** @type {Record<string, string>} */ ({
  foreign: 'A foreign resident gets no low income tax offset and pays no Medicare levy or surcharge',
  'working-holiday': 'Working holiday maker rates apply to all of this taxable income, taken as a foreign resident’s: '
    + 'no low income tax offset and no Medicare levy or surcharge',
});
const PERIOD = /** @type {Record<string, string>} */ ({ year: 'a year', month: 'a month', fortnight: 'a fortnight', week: 'a week' });
const whole = (/** @type {number} */ value) => `$${value.toLocaleString('en-AU')}`;
const cents = (/** @type {number} */ value) => Math.round(value * 100);
const count = (/** @type {number} */ n, /** @type {string} */ noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
/** A refund or an amount owing, by its sign. @param {number} value @param {(amount: number) => string} aud */
const settle = (value, aud) => [value < 0 ? 'Amount owing estimate' : 'Refund estimate', aud(Math.abs(value))];

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function incomeTaxResult(value, aud) {
  const spouse = value('spouse') === 'yes';
  const loan = value('study-loan') === 'yes';
  const resident = value('residency') === 'resident';
  const r = taxEstimate({ year: value('year'), residency: value('residency'), taxable: value('income'),
    fringe: value('fringe'), super: value('super'), losses: value('losses'), foreign: value('foreign'), studyLoan: loan,
    uncoveredDays: value('uncovered'), spouse: spouse ? value('spouse-income') : null, children: value('children'),
    withheld: value('withheld') });
  const children = Number(value('children'));
  const rows = [['Tax on taxable income', aud(r.tax)], ['Low income tax offset', aud(r.offset)]];
  if (['2020-21', '2021-22'].includes(value('year'))) rows.push(['Low and middle income tax offset', aud(r.lmito)]);
  rows.push(['Medicare levy', aud(r.medicare)], ['Medicare levy surcharge', aud(r.surcharge)]);
  if (loan) rows.push(['Study and training loan repayment', aud(r.studyLoan)]);
  rows.push(['Total tax, levies and repayment', aud(r.assessed)], ['Tax withheld', aud(r.withheld)], settle(r.refund, aud));
  const surcharge = resident ? `Income for surcharge purposes ${whole(r.surchargeIncome)}${spouse ? ' and the spouse’s' : ''} `
    + `against a ${spouse || children ? 'family' : 'singles'} threshold of ${whole(r.surchargeThreshold)}: `
    + (r.surchargeRate ? `${r.surchargeRate}% for the days without cover` : 'no surcharge') : NOT_RESIDENT[value('residency')];
  return {
    inputs: `${value('year')}, ${RESIDENCY[value('residency')]}, taxable income ${aud(Number(value('income')))}, `
      + `reportable fringe benefits ${aud(Number(value('fringe')))}, reportable super contributions ${aud(Number(value('super')))}, `
      + `total net investment loss ${aud(Number(value('losses')))}, `
      + `${loan ? `a study or training loan with exempt foreign employment income ${aud(Number(value('foreign')))}` : 'no study or training loan'}, `
      + `${count(Number(value('uncovered')), 'day')} without private hospital cover, `
      + `${spouse ? `a spouse with income for surcharge purposes of ${aud(Number(value('spouse-income')))}` : 'no spouse'} and `
      + `${children === 1 ? '1 dependent child' : `${children || 'no'} dependent children`}, tax withheld ${aud(Number(value('withheld')))}`,
    principal: rows.length - 1, rows, note: surcharge };
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function takeHomeResult(value, aud) {
  const included = value('super') === 'included';
  const loan = value('study-loan') === 'yes';
  const covered = value('cover') === 'yes';
  const period = value('period');
  const r = takeHomePay({ year: value('year'), residency: value('residency'), salary: value('salary'), period,
    includesSuper: included, sacrifice: value('sacrifice'), studyLoan: loan, hospitalCover: covered });
  const rows = [['Salary for the year', aud(r.salary)], ['Salary sacrificed to super', aud(r.sacrifice)],
    ['Employer super guarantee', aud(r.superGuarantee)], ['Standard deduction for work-related expenses', aud(r.deduction)],
    ['Income tax less offsets', aud((cents(r.tax) - cents(r.offset) - cents(r.lmito)) / 100)], ['Medicare levy', aud(r.medicare)],
    ['Medicare levy surcharge', aud(r.surcharge)], ['Study and training loan repayment', aud(r.studyLoan)],
    ['Take-home pay for the year', aud(r.net)], ['Each month, a twelfth', aud(r.monthly)],
    ['Each fortnight, a 26th', aud(r.fortnightly)], ['Each week, a 52nd', aud(r.weekly)]];
  const notes = [];
  if (r.withheld) {
    rows.push([`PAYG withheld each ${period}${loan ? ', with the study loan component' : ''}`, aud(r.withheld.total)],
      [`Pay after withholding each ${period}`, aud(r.withheld.afterWithholding)],
      ['PAYG withheld over the year', aud(r.withheld.year)], settle(r.withheld.refund, aud));
    const year = value('year');
    notes.push(`The take-home rows spread the year’s tax evenly; PAYG withheld is what the ${year} Schedule 1`
      + `${loan ? ' and Schedule 8' : ''} take from each pay, and the refund or amount owing is the difference over the year`);
    if (loan && year === '2025-26') {
      notes.push(`Pays before 24 September 2025 had ${aud(r.withheld.earlierStudyLoan)} withheld for the study loan each `
        + `${period} under the earlier Schedule 8, not ${aud(r.withheld.studyLoan)}; the year’s figures use the later one for `
        + 'every pay');
    }
  } else {
    notes.push('The year’s tax on this salary spread evenly, not the amounts an employer withholds each pay');
  }
  if (r.overCap) {
    notes.push(`Concessional contributions of ${aud(r.concessional)} exceed the year’s cap by ${aud(r.overCap)}: the figures `
      + 'assume unused cap amounts carried forward cover it; if not, Division 291 adds the excess to assessable income, '
      + 'which is not worked here');
  }
  if (r.division293) {
    notes.push(`Division 293 tax applies to ${aud(r.division293)} of taxable contributions (section 293-20), not worked here`);
  }
  return { inputs: `${value('year')}, ${RESIDENCY[value('residency')]}, salary ${aud(Number(value('salary')))} ${PERIOD[period]} `
    + `${included ? 'including' : 'plus'} super, ${aud(Number(value('sacrifice')))} ${PERIOD[period]} sacrificed to super, `
    + `${loan ? 'with a' : 'no'} study or training loan, ${covered ? 'with' : 'no'} private hospital cover`, principal: 8,
  rows, note: notes.join('. ') };
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function studyLoanResult(value, aud) {
  const year = value('year');
  const parts = { taxable: value('taxable'), fringe: value('fringe'), losses: value('losses'), super: value('super'),
    foreign: value('foreign') };
  const r = studyLoanRepayment(parts, year);
  const { minimum, top } = STUDY_LOAN_YEARS[year];
  const note = {
    nil: `Repayment income does not exceed the minimum repayment income of ${whole(minimum)}`,
    marginal: `15% of repayment income over ${whole(minimum)} up to ${whole(top ?? 0)}, and 17% of any part above it`,
    'ten-percent': `10% of all repayment income, which is less than 15% and 17% of the parts over ${whole(minimum)}`,
    'percent-of-income': `The ${year} rate for this repayment income, applied to all of it`,
  }[r.method];
  return { inputs: `${year}, taxable income ${aud(Number(parts.taxable))}, reportable fringe benefits ${aud(Number(parts.fringe))}, `
    + `total net investment loss ${aud(Number(parts.losses))}, reportable super contributions ${aud(Number(parts.super))}, `
    + `exempt foreign employment income ${aud(Number(parts.foreign))}`, principal: 1,
  rows: [['Repayment income', aud(r.repaymentIncome)], ['Compulsory repayment', aud(r.repayment)]], note };
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function soleTraderResult(value, aud) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  const year = value('year');
  const r = soleTraderSetAside({ year, income: value('income'), expenses: value('expenses'), wages: value('wages'),
    deductions: value('deductions'), super: value('super'), offset: yes('offset'), studyLoan: yes('study-loan'),
    hospitalCover: yes('cover'), gst: yes('gst'), credits: value('credits'), invoice: value('invoice') });
  const wages = Number(value('wages')) > 0;
  const rows = [['Business profit', aud(r.profit)]];
  if (r.deduction) rows.push(['Standard deduction on the wages', aud(r.deduction)]);
  rows.push(['Taxable income', whole(r.taxable)], ['Tax on taxable income', aud(r.tax)], ['Low income tax offset', aud(r.offset)]);
  if (year === '2021-22') rows.push(['Low and middle income tax offset', aud(r.lmito)]);
  rows.push(['Small business income tax offset', aud(r.smallBusinessOffset)], ['Medicare levy', aud(r.medicare)]);
  if (!yes('cover')) rows.push(['Medicare levy surcharge', aud(r.surcharge)]);
  if (yes('study-loan')) rows.push(['Study and training loan repayment', aud(r.studyLoan)]);
  rows.push(['Total tax, levies and repayment', aud(r.total)]);
  if (wages) rows.push(['Less the same on the wages alone', aud(r.wagesTax)]);
  rows.push(['Tax to set aside for the business', aud(r.businessTax)]);
  if (yes('gst')) rows.push(['GST on the business income', aud(r.gstOnIncome)], ['Less GST credits', aud(r.credits)]);
  const principal = rows.length;
  rows.push(['Total to set aside for the year', aud(r.setAside)], ['Each quarter', aud(r.quarterly)],
    ['Each month', aud(r.monthly)], ['Each week', aud(r.weekly)],
    [`Share of each invoice${yes('gst') ? ', GST included,' : ''} to set aside`, `${r.invoiceShare.toFixed(2)}%`],
    [`From an invoice of ${aud(r.invoice.amount)}, set aside`, aud(r.invoice.setAside)]);
  const notes = [`As a PAYG instalment rate, ${r.taxShare.toFixed(2)}% of business income excluding GST covers this `
    + 'year’s tax on it'];
  if (r.instalments) {
    notes.push('A return like this meets 2 of the 3 PAYG instalment entry tests; the ATO works out the third, '
      + 'notional tax, and decides entry');
  }
  if (r.mustRegister) {
    notes.push('Business income of $75,000 or more a year means the business must register for GST, within 21 days of '
      + 'its turnover over 12 months reaching $75,000');
  }
  if (wages) {
    notes.push('This assumes the wages’ withholding covers the tax, levy and any study loan repayment on the wages '
      + 'alone');
  }
  return { inputs: `${year}, business income ${aud(Number(value('income')))} and expenses ${aud(Number(value('expenses')))} `
    + `excluding GST, wages ${aud(Number(value('wages')))}, other deductions ${aud(Number(value('deductions')))}, `
    + `${Number(value('super')) > 0 ? `personal super contributions ${aud(Number(value('super')))}, ` : ''}`
    + `${yes('offset') ? 'qualifies' : 'does not qualify'} for the small business income tax offset, `
    + `${yes('study-loan') ? 'with a' : 'no'} study or training loan, ${yes('cover') ? 'with' : 'no'} private hospital cover, `
    + `${yes('gst') ? `registered for GST with credits of ${aud(Number(value('credits')))}` : 'not registered for GST'}, `
    + `invoice ${aud(Number(value('invoice')))}`, principal, rows, note: notes.join('. ') };
}

const RESULTS = new Map([['income-tax', incomeTaxResult], ['take-home-pay', takeHomeResult], ['study-loan', studyLoanResult],
  ['sole-trader', soleTraderResult]]);

/** The result of the individual tax calculator `kind`, or undefined for any other form.
 * @param {string} kind the form's data-calculator @param {(name: string) => string} value a field's value
 * @param {(amount: number) => string} aud money as the page writes it */
export function individualResult(kind, value, aud) {
  return RESULTS.get(kind)?.(value, aud);
}

/** The engines and years assets/webmcp-tools.mjs offers as this page's WebMCP tools. */
export const engines = { taxEstimate, takeHomePay, soleTraderSetAside, incomeYears: INCOME_TAX_YEARS,
  payYears: Object.keys(SUPER_GUARANTEE), soleTraderYears: SOLE_TRADER_YEARS };
