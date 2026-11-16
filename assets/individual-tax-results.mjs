// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The result rows of the individual tax calculators, from a form's fields. assets/accounting-pages.mjs
// renders them as it does the business calculators' results.
import { incomeTax } from './income-tax.mjs';
import { STUDY_LOAN_YEARS, studyLoanRepayment } from './study-loan.mjs';
import { takeHomePay } from './take-home-pay.mjs';

/** @typedef {{inputs: string, rows: string[][], principal: number, note?: string}} Result */

const RESIDENCY = /** @type {Record<string, string>} */ ({ resident: 'Australian resident', foreign: 'foreign resident',
  'working-holiday': 'working holiday maker' });
const NOT_RESIDENT = /** @type {Record<string, string>} */ ({
  foreign: 'A foreign resident gets no low income tax offset and pays no Medicare levy',
  'working-holiday': 'Working holiday maker rates apply to all of this taxable income, taken as a foreign resident’s: '
    + 'no low income tax offset and no Medicare levy',
});
const whole = (/** @type {number} */ value) => `$${value.toLocaleString('en-AU')}`;
const cents = (/** @type {number} */ value) => Math.round(value * 100);

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function incomeTaxResult(value, aud) {
  const r = incomeTax(value('income'), value('year'), value('residency'));
  return { inputs: `${value('year')}, ${RESIDENCY[value('residency')]}, taxable income ${aud(Number(value('income')))}`,
    principal: 3, rows: [['Tax on taxable income', aud(r.tax)], ['Low income tax offset', aud(r.offset)],
      ['Medicare levy', aud(r.medicare)], ['Total tax and Medicare levy', aud(r.total)]],
    note: NOT_RESIDENT[value('residency')] };
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function takeHomeResult(value, aud) {
  const included = value('super') === 'included';
  const loan = value('study-loan') === 'yes';
  const r = takeHomePay({ year: value('year'), residency: value('residency'), salary: value('salary'),
    includesSuper: included, studyLoan: loan });
  return { inputs: `${value('year')}, ${RESIDENCY[value('residency')]}, salary ${aud(Number(value('salary')))} `
    + `${included ? 'including' : 'plus'} super, ${loan ? 'with a' : 'no'} study or training loan`, principal: 6,
  rows: [['Salary', aud(r.salary)], ['Employer super guarantee', aud(r.superGuarantee)],
    ['Standard deduction for work-related expenses', aud(r.deduction)],
    ['Income tax less the low income tax offset', aud((cents(r.tax) - cents(r.offset)) / 100)], ['Medicare levy', aud(r.medicare)],
    ['Study and training loan repayment', aud(r.studyLoan)], ['Take-home pay for the year', aud(r.net)],
    ['Each month, a twelfth', aud(r.monthly)], ['Each fortnight, a 26th', aud(r.fortnightly)], ['Each week, a 52nd', aud(r.weekly)]],
  note: 'The year’s tax on this salary spread evenly, not the amounts an employer withholds each pay' };
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
    'percent-of-income': 'The 2024-25 rate for this repayment income, applied to all of it',
  }[r.method];
  return { inputs: `${year}, taxable income ${aud(Number(parts.taxable))}, reportable fringe benefits ${aud(Number(parts.fringe))}, `
    + `total net investment loss ${aud(Number(parts.losses))}, reportable super contributions ${aud(Number(parts.super))}, `
    + `exempt foreign employment income ${aud(Number(parts.foreign))}`, principal: 1,
  rows: [['Repayment income', aud(r.repaymentIncome)], ['Compulsory repayment', aud(r.repayment)]], note };
}

const RESULTS = { 'income-tax': incomeTaxResult, 'take-home-pay': takeHomeResult, 'study-loan': studyLoanResult };

/** The result of the individual tax calculator `kind`, or undefined for any other form.
 * @param {string} kind the form's data-calculator @param {(name: string) => string} value a field's value
 * @param {(amount: number) => string} aud money as the page writes it */
export function individualResult(kind, value, aud) {
  return RESULTS[/** @type {keyof typeof RESULTS} */ (kind)]?.(value, aud);
}
