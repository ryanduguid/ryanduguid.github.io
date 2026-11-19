// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The result rows of the individual tax calculators, from a form's fields. assets/accounting-pages.mjs
// renders them as it does the business calculators' results.
import { STUDY_LOAN_YEARS, studyLoanRepayment } from './study-loan.mjs';
import { SUPER_GUARANTEE, takeHomePay } from './take-home-pay.mjs';
import { INCOME_TAX_YEARS } from './income-tax.mjs';
import { taxEstimate } from './tax-estimate.mjs';
import { lumpSumArrears } from './lump-sum-arrears.mjs';

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
    notes.push('The take-home rows spread the year’s tax evenly; PAYG withheld is what the ATO’s 2026-27 Schedule 1'
      + `${loan ? ' and Schedule 8' : ''} take from each pay, and the refund or amount owing is the difference over the year`);
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

/** The form's accrual year slots: the 2 that take each recent year's taxable income and adjustments, then the rest. */
const ARREARS_SLOTS = ['latest', 'before', 'earlier-1', 'earlier-2', 'earlier-3', 'earlier-4'];
const ARREARS_FACTS = /** @type {const} */ ([['taxable', 'taxable'], ['gain', 'gain'], ['rebateYearArrears', 'rebate-year'],
  ['earlierRebateArrears', 'earlier-rebate']]);
const percent = (/** @type {number} */ rate) => `${Number((rate * 100).toFixed(2))}%`;

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function lumpSumArrearsResult(value, aud) {
  const accrual = [];
  for (const slot of ARREARS_SLOTS) {
    const field = (/** @type {string} */ name) => (value(`${slot}-${name}`) ?? '').trim();
    // Only the 2 latest accrual years take their own taxable income and rebate facts.
    const facts = slot.startsWith('earlier') ? []
      : ARREARS_FACTS.map(([key, name]) => [key, field(name)]).filter(([, text]) => text !== '');
    if (field('year') === '' && field('arrears') === '' && facts.length === 0) continue;
    if (field('year') === '') throw new Error('Enter the income year of each accrual year you fill in, such as 2023-24.');
    accrual.push({ year: field('year'), arrears: field('arrears'), ...Object.fromEntries(facts) });
  }
  const year = value('year');
  const r = lumpSumArrears({ year, resident: value('resident') === 'yes', taxable: value('taxable'), gain: value('gain'),
    accrual });
  const rows = [['Total arrears amount', aud(r.total)], ['Normal taxable income', aud(r.normal)],
    ['10% of normal taxable income less the arrears', aud(r.tenPercent)]];
  let note = 'No offset: the total arrears amount is less than 10% of normal taxable income less it';
  if (r.met) {
    rows.push([`Tax on arrears in ${year}`, aud(/** @type {number} */ (r.taxOnArrears))],
      ...(r.notional ?? []).map(({ year: accrued, amount }) => [`Notional tax for ${accrued}`, aud(amount)]));
    if (r.distant) rows.push(['Notional tax for the distant years', aud(r.distant.amount)]);
    rows.push(['Notional tax on arrears', aud(/** @type {number} */ (r.notionalTotal))]);
    const [latest, before] = r.notional ?? [];
    const distant = r.distant?.years ?? [];
    const listed = distant.length > 1 ? `${distant.slice(0, -1).join(', ')} and ${distant.at(-1)}` : distant[0];
    note = r.distant && r.rates ? `${distant.length > 1 ? 'The distant years' : 'The distant year'} ${listed} `
      + `${distant.length > 1 ? 'take' : 'takes'} the average rate on recent arrears, `
      + `${percent(r.rates.average)}: ${percent(r.rates.mostRecent)} for ${latest.year} and ${percent(r.rates.secondMostRecent)} `
      + `for ${before.year}` : 'The notional tax is what the arrears would have added to the tax of the years they accrued in';
    if (r.offset === 0) note += '. Nil: the notional tax is not less than the tax on arrears';
  }
  rows.push(['Lump sum payment in arrears tax offset', aud(r.offset)]);
  const accrued = accrual.map((a) => `${a.year} ${aud(Number(a.arrears))}`
    + `${a.taxable === undefined ? '' : ` on taxable income ${aud(Number(a.taxable))}`}`).join(', ');
  return { inputs: `${year}, taxable income ${aud(Number(value('taxable')))}, net capital gain ${aud(Number(value('gain')))}, `
    + `accrual years ${accrued}`, principal: rows.length - 1, rows, note };
}

const RESULTS = new Map([['income-tax', incomeTaxResult], ['take-home-pay', takeHomeResult], ['study-loan', studyLoanResult],
  ['lump-sum-arrears', lumpSumArrearsResult]]);

/** The result of the individual tax calculator `kind`, or undefined for any other form.
 * @param {string} kind the form's data-calculator @param {(name: string) => string} value a field's value
 * @param {(amount: number) => string} aud money as the page writes it */
export function individualResult(kind, value, aud) {
  return RESULTS.get(kind)?.(value, aud);
}

/** The engines and years assets/webmcp-tools.mjs offers as this page's WebMCP tools. */
export const engines = { taxEstimate, takeHomePay, incomeYears: INCOME_TAX_YEARS, payYears: Object.keys(SUPER_GUARANTEE) };
