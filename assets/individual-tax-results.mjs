// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The result rows of the individual tax calculators, from a form's fields. assets/accounting-pages.mjs
// renders them as it does the business calculators' results.
import { STUDY_LOAN_YEARS, studyLoanRepayment } from './study-loan.mjs';
import { SUPER_GUARANTEE, takeHomePay } from './take-home-pay.mjs';
import { INCOME_TAX_YEARS } from './income-tax.mjs';
import { taxEstimate } from './tax-estimate.mjs';
import { BONUS_YEAR, bonusWithholding } from './bonus-withholding.mjs';
import { PAYS } from './payg-withholding.mjs';

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

const PAY_NAME = /** @type {Record<string, string>} */ ({ week: 'weekly', fortnight: 'fortnightly', month: 'monthly' });
const PAYEE = /** @type {Record<string, string>} */ ({ resident: 'Australian resident claiming the tax-free threshold (scale 2)',
  foreign: 'foreign resident (scale 3)' });

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function bonusResult(value, aud) {
  const period = value('period');
  const loan = value('study-loan') === 'yes';
  const r = bonusWithholding({ period, residency: value('residency'), studyLoan: loan, method: value('method'),
    earnings: value('earnings'), additional: value('additional'), spread: value('spread'), backPays: value('back-pays'),
    backEarnings: value('back-earnings'), backEach: value('back-each'), backWithheld: value('back-withheld'),
    yearToDate: value('year-to-date'), paysToDate: value('pays-to-date'), earlierAdditional: value('earlier-additional'),
    earlierWithheld: value('earlier-withheld') });
  const money = (/** @type {string} */ name) => aud(Number(value(name)));
  const head = `${BONUS_YEAR}, ${PAY_NAME[period]} pay, ${PAYEE[value('residency')]}, ${loan ? 'with a' : 'no'} study or training loan, `
    + `earnings ${money('earnings')} this pay`;
  /** The study loan component of each amount withheld, with a loan.
   * @param {[{studyLoan: number, total: number}, string][]} parts */
  const loanNote = (parts) => {
    const each = parts.map(([t, label]) => `${aud(t.studyLoan)} of the ${aud(t.total)}`.replaceAll('.00', '') + ` ${label}`);
    return loan ? `Each amount withheld includes the Schedule 8 study loan component: ${each.slice(0, -1).join(', ')}`
      + `${each.length > 1 ? ' and ' : ''}${each.at(-1)}` : '';
  };
  if (r.method === 'A') {
    const rows = [['Earnings this pay, cents ignored (step 1)', aud(r.step1)], ['Withheld from those earnings (step 2)', aud(r.step2.total)],
      [`The payment divided by ${r.spread}, cents ignored (step 3)`, aud(r.step3)],
      [`Withheld from earnings of ${aud(r.step4).replace('.00', '')} (steps 4 and 5)`, aud(r.step5.total)],
      [`The difference, times ${r.spread} (steps 6 and 7)`, aud(r.step7.total)], ['47% of the payment, the limit (step 8)', aud(r.limit)],
      ['Withheld from the payment, the lesser (step 9)', aud(r.onAdditional)], ['Total withheld this pay (step 10)', aud(r.total)],
      [`Tax${loan ? ' and study loan repayment' : ''} the payment adds to a year of this pay`, aud(r.yearTax)]];
    const notes = [loanNote([[r.step2, 'on this pay’s earnings'], [r.step7, 'on the payment']]),
      'The last row is the payment’s effect on the year’s assessment, were every pay this pay; the withholding schedules do not aim to match it']
      .filter(Boolean);
    return { inputs: `${head}, Method A: additional payment ${money('additional')} spread over ${r.spread} pays`, rows, principal: 7,
      note: notes.join('. ') };
  }
  const rows = [['Withheld from this pay’s earnings', aud(r.base.total)]];
  const parts = /** @type {[{studyLoan: number, total: number}, string][]} */ ([[r.base, 'on this pay’s earnings']]);
  const described = [];
  if (r.methodBi) {
    const bi = r.methodBi;
    rows.push([`Each earlier pay worked again on ${aud(bi.earnings).replace('.00', '')} (B(i) steps 2 and 3)`, aud(bi.recalculated.total)],
      [`Less what was withheld, times ${bi.pays} pays (B(i) steps 4 and 5)`, aud(bi.onBackPayment)]);
    described.push(`B(i): back payment ${money('back-each')} for each of ${bi.pays} earlier pays this year that paid `
      + `${money('back-earnings')} and had ${money('back-withheld')} withheld`);
  }
  if (r.methodBii) {
    const bii = r.methodBii;
    rows.push(['Average total earnings to date, cents ignored (B(ii) step 1)', aud(bii.step1)],
      ['Withheld from that average (B(ii) step 2)', aud(bii.step2.total)],
      [`This year’s B(ii) payments divided by ${PAYS[period]}, cents ignored (B(ii) step 3)`, aud(bii.step3)],
      [`Withheld from earnings of ${aud(bii.step4).replace('.00', '')} (B(ii) steps 4 and 5)`, aud(bii.step5.total)],
      [`The difference times ${PAYS[period]}, less earlier B(ii) withholding (B(ii) steps 6 to 8)`, aud(bii.step8)],
      ['47% of the payment, the limit (B(ii) step 9)', aud(bii.limit)],
      ['Withheld from the payment, the lesser (B(ii) step 10)', aud(bii.onAdditional)]);
    described.push(`B(ii): additional payment ${money('additional')}, normal earnings to date ${money('year-to-date')} over `
      + `${value('pays-to-date')} pays, earlier B(ii) payments ${money('earlier-additional')} with ${money('earlier-withheld')} withheld`);
  }
  if (r.methodBi) parts.push([r.methodBi.recalculated, 'for each earlier pay']);
  if (r.methodBii) parts.push([r.methodBii.step7, 'by B(ii)']);
  rows.push(['Total withheld this pay', aud(r.total)]);
  return { inputs: `${head}, Method B, ${described.join('; ')}`, rows, principal: rows.length - 1, note: loanNote(parts) || undefined };
}

const RESULTS = new Map([['income-tax', incomeTaxResult], ['take-home-pay', takeHomeResult], ['study-loan', studyLoanResult],
  ['bonus-withholding', bonusResult]]);

/** The result of the individual tax calculator `kind`, or undefined for any other form.
 * @param {string} kind the form's data-calculator @param {(name: string) => string} value a field's value
 * @param {(amount: number) => string} aud money as the page writes it */
export function individualResult(kind, value, aud) {
  return RESULTS.get(kind)?.(value, aud);
}

/** The engines and years assets/webmcp-tools.mjs offers as this page's WebMCP tools. */
export const engines = { taxEstimate, takeHomePay, incomeYears: INCOME_TAX_YEARS, payYears: Object.keys(SUPER_GUARANTEE),
  bonusWithholding };
