// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The result rows of the individual tax calculators, from a form's fields. assets/accounting-pages.mjs
// renders them as it does the business calculators' results.
import { STUDY_LOAN_YEARS, studyLoanRepayment } from './study-loan.mjs';
import { SUPER_GUARANTEE, takeHomePay } from './take-home-pay.mjs';
import { INCOME_TAX_YEARS } from './income-tax.mjs';
import { taxEstimate } from './tax-estimate.mjs';
import { PACKAGING_YEARS, salaryPackaging } from './salary-packaging.mjs';
import { NOVATED_YEARS, novatedLease } from './novated-lease.mjs';

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

const EMPLOYER = /** @type {Record<string, string>} */ ({ charity: 'a public benevolent institution or health promotion charity',
  hospital: 'a public or not-for-profit hospital or public ambulance service' });

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function salaryPackagingResult(value, aud) {
  const flag = (/** @type {string} */ name) => value(name) === 'yes';
  const r = salaryPackaging({ year: value('year'), residency: value('residency'), employer: value('employer'),
    salary: value('salary'), typeTwo: value('type-two'), typeOne: value('type-one'), meals: value('meals'),
    mealsTypeOne: flag('meals-type-one'), studyLoan: flag('study-loan'), hospitalCover: flag('cover') });
  const rows = [['Benefits packaged, at their taxable value', aud(r.packaged)]];
  if (r.grossedTypeOne) rows.push(['Type 1 benefits grossed up at 2.0802, to the dollar', aud(r.grossedTypeOne)]);
  rows.push(['Type 2 benefits grossed up at 1.8868, to the dollar', aud(r.grossedTypeTwo)],
    [`Cap for ${value('employer') === 'charity' ? 'a charity' : 'a hospital or ambulance service'}`, aud(r.cap)]);
  if (r.grossedMeals) rows.push(['Meal entertainment allowed above the cap, up to $5,000', aud(r.mealAllowance)]);
  rows.push(['Grossed-up amount liable to FBT', aud(r.excess)], ['FBT on it at 47%', aud(r.fbt)],
    ['Reportable fringe benefits amount', aud(r.reportable)],
    ['Tax, levies and study loan without packaging', aud(r.owedBefore)],
    ['Tax, levies and study loan with packaging', aud(r.owedAfter)], ['Tax saved', aud(r.saved)],
    ['Gain after the FBT, if your employer passes it on', aud(r.gain)]);
  const principal = rows.length - 1;
  if (r.room) rows.push(['Room left under the cap, as Type 2 benefits', aud(r.roomTypeTwo)]);
  const notes = [];
  if (r.reportable) {
    notes.push(`Your income statement shows ${aud(r.reportable)} of reportable fringe benefits: it is not taxed, but it counts `
      + 'for the Medicare levy surcharge, study loan repayments and other income tests');
  }
  if (!r.reportable && r.packaged) notes.push('Benefits of $2,000 or less are not reportable');
  const flagText = (/** @type {string} */ name, /** @type {string} */ yes, /** @type {string} */ no) => (flag(name) ? yes : no);
  return { inputs: `${r.year}, ${value('residency') === 'resident' ? 'Australian resident' : 'foreign resident'} employed by `
    + `${EMPLOYER[value('employer')]}, salary ${aud(Number(value('salary')))}, Type 2 benefits ${aud(Number(value('type-two')))}, `
    + `Type 1 benefits ${aud(Number(value('type-one')))}, salary packaged meal entertainment ${aud(Number(value('meals')))} `
    + `(${flagText('meals-type-one', 'Type 1', 'Type 2')}), ${flagText('study-loan', 'with', 'no')} study loan, `
    + `${flagText('cover', 'with', 'without')} private hospital cover`, rows, principal,
  note: notes.length ? notes.join('. ') : undefined };
}

const CAR = /** @type {Record<string, string>} */ ({ bev: 'battery electric car', fcev: 'hydrogen fuel cell car',
  phev: 'plug-in hybrid', other: 'petrol, diesel or hybrid car' });

/** @param {(name: string) => string} value @param {(amount: number) => string} aud @returns {Result} */
function novatedLeaseResult(value, aud) {
  const flag = (/** @type {string} */ name) => value(name) === 'yes';
  const r = novatedLease({ year: value('year'), residency: value('residency'), salary: value('salary'), studyLoan: flag('study-loan'),
    hospitalCover: flag('cover'), kind: value('kind'), firstUsed: value('first-used'), commitment: flag('commitment'),
    saleYear: value('sale-year'), price: value('price'), otherSupply: flag('other-supply'), reduced: flag('reduced'),
    days: value('days'), gstCosts: value('gst-costs'), otherCosts: value('other-costs') });
  const rows = [[`Statutory formula value for ${value('days')} days`, aud(r.taxableValue)],
    [`Luxury car tax threshold for fuel-efficient cars, ${value('sale-year')}`, aud(r.threshold)],
    ['Electric car exemption', r.exempt ? 'applies' : `does not apply: ${r.reason}`],
    ['Yearly car costs', aud(r.costs)], ['The same less the GST credits your employer claims', aud(r.netCosts)],
    ['Tax, levies and study loan paying the costs from after-tax pay', aud(r.owedWithout)]];
  let principal = 0;
  if (r.exemptCase) {
    rows.push(['Exempt: all from pre-tax salary', aud(r.exemptCase.preTax)],
      ['Exempt: reportable fringe benefits amount', aud(r.exemptCase.reportable)],
      ['Exempt: tax, levies and study loan', aud(r.exemptCase.owed)], ['Exempt: saving', aud(r.exemptCase.saving)]);
    principal = rows.length - 1;
  }
  if (r.contribution) {
    rows.push([`${r.exempt ? 'Were it not exempt' : 'Employee contribution method'}: after-tax contribution`, aud(r.contribution.postTax)],
      [`${r.exempt ? 'Were it not exempt' : 'Employee contribution method'}: from pre-tax salary`, aud(r.contribution.preTax)],
      [`${r.exempt ? 'Were it not exempt' : 'Employee contribution method'}: tax, levies and study loan`, aud(r.contribution.owed)],
      [`${r.exempt ? 'Were it not exempt' : 'Employee contribution method'}: saving`, aud(r.contribution.saving)]);
    if (!r.exempt) principal = rows.length - 1;
  }
  const note = r.exemptCase?.reportable
    ? `The exempt car’s ${aud(r.exemptCase.reportable)} reportable amount is not taxed, but it counts for the Medicare levy `
      + 'surcharge, study loan repayments and other income tests'
    : undefined;
  return { inputs: `${r.year}, ${value('residency') === 'resident' ? 'Australian resident' : 'foreign resident'}, salary `
    + `${aud(Number(value('salary')))}, ${CAR[value('kind')]} first held and used ${value('first-used') === 'after' ? 'on or after' : 'before'} `
    + `1 July 2022${value('kind') === 'phev' ? `, ${flag('commitment') ? 'with' : 'without'} a commitment from before 1 April 2025` : ''}, `
    + `first sold in ${value('sale-year')} for ${aud(Number(value('price')))}, `
    + `${flag('other-supply') ? 'luxury car tax payable at another supply or importation, ' : ''}${flag('reduced') ? 'held over 4 years, ' : ''}`
    + `available ${value('days')} days, costs with GST ${aud(Number(value('gst-costs')))} and without ${aud(Number(value('other-costs')))}, `
    + `${flag('study-loan') ? 'with' : 'no'} study loan, ${flag('cover') ? 'with' : 'without'} private hospital cover`, rows, principal, note };
}

const RESULTS = new Map([['income-tax', incomeTaxResult], ['take-home-pay', takeHomeResult], ['study-loan', studyLoanResult],
  ['salary-packaging', salaryPackagingResult], ['novated-lease', novatedLeaseResult]]);

/** The result of the individual tax calculator `kind`, or undefined for any other form.
 * @param {string} kind the form's data-calculator @param {(name: string) => string} value a field's value
 * @param {(amount: number) => string} aud money as the page writes it */
export function individualResult(kind, value, aud) {
  return RESULTS.get(kind)?.(value, aud);
}

/** The engines and years assets/webmcp-tools.mjs offers as this page's WebMCP tools. */
export const engines = { taxEstimate, takeHomePay, salaryPackaging, novatedLease, incomeYears: INCOME_TAX_YEARS,
  payYears: Object.keys(SUPER_GUARANTEE), packagingYears: PACKAGING_YEARS, novatedYears: NOVATED_YEARS };
