// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The same person engaged for the same hours as an employee and as a contractor: what each costs the
// business and what each leaves the person after income tax, from facts the user states. It does not
// decide whether the person is an employee; it works both answers. Read 26 November 2026:
// - Superannuation Guarantee (Administration) Act 1992 (Compilation No. 78, 1 July 2026): s 12(3), a
//   person who works under a contract that is wholly or principally for their labour is an employee of
//   the other party; s 10A(1)(a) and (d), qualifying earnings include ordinary time earnings and the
//   payments under a s 12(3) contract in respect of the person's labour; s 12(11) (domestic or private
//   work) is not worked here. The rate and annual maximum contributions base are the take-home pay
//   engine's `SUPER_GUARANTEE`, sourced there.
// - TR 2023/4, Appendix 2, paragraphs 93 to 111 (the ATO's legal database): s 12(3) needs a contract the
//   worker made as an individual, not as trustee or partner (para 100); a right to delegate, subcontract
//   or assign the work (para 103 to 105), a contract for a result (para 106) or a contract principally for
//   something other than labour (para 108) takes it outside s 12(3); 'principally' means chiefly or mainly
//   and may need a quantitative valuation (paras 101, 111). SGR 2005/1 was withdrawn from 26 June 2024.
// - Fair Work Act 2009 (Compilation No. 73, 7 July 2026): s 15AA (the ordinary meaning of employee),
//   s 87 (4 weeks of paid annual leave) and s 96 (10 days of paid personal leave), for the page's text.
// Income tax on each side is the take-home pay and sole trader engines' (resident, full year, no other
// income). Amounts are in cents; every rate product is exact and rounds half up to the cent once.

import { ratioCents, ratioPercent, number } from './money.mjs';
import { CONCESSIONAL_CAP, SUPER_GUARANTEE, takeHomePay } from './take-home-pay.mjs';
import { soleTraderSetAside } from './sole-trader.mjs';

/** Income years covered, newest first. */
export const CONTRACTOR_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22'];
/** GST registration turnover threshold in cents (GST Act s 23-15; $75,000, as the sole trader engine). */
const GST_THRESHOLD = 7500000;
const WEEKS = 52;

/** @param {bigint | number} numerator @param {bigint | number} denominator */
const nearest = (numerator, denominator) => Number(ratioCents(BigInt(numerator), BigInt(denominator)));
/** A decimal entry as a whole number of 1/10^places units. @param {unknown} value @param {number} places @param {number} max */
const scaled = (value, places, max) => Math.round(number(value, { max, places }) * 10 ** places);
/** An amount in cents. @param {unknown} value */
const money = (value) => Math.round(number(value, { max: 1e9, money: true }) * 100);

/**
 * @typedef {{year: string, hours: string, salary: string, annualLeave: string, otherLeave: string, loading: string,
 *   loadingQualifying: boolean, payrollRate: string, payrollSuper: boolean, wcRate: string, wcSuper: boolean,
 *   rate: string, nonLabour: string, expenses: string, ownSuper: string, gst: boolean, credits: boolean,
 *   individual: boolean, delegate: boolean, result: boolean, contractorPayroll: boolean, contractorWc: boolean,
 *   smallBusinessOffset: boolean, hospitalCover: boolean, studyLoan: boolean}} Engagement
 */

const QUESTIONS = /** @type {const} */ ([
  ['loadingQualifying', 'Say whether the leave loading is ordinary time earnings.'],
  ['payrollSuper', 'Say whether payroll tax counts super as wages.'],
  ['wcSuper', 'Say whether the workers compensation premium counts super as wages.'],
  ['gst', 'Say whether the contractor is registered for GST.'],
  ['credits', 'Say whether the business can claim the GST as a full credit.'],
  ['individual', 'Say whether the contract is with the person as an individual.'],
  ['delegate', 'Say whether the contract gives a right to delegate, subcontract or assign the work.'],
  ['result', 'Say whether the contract is to produce a result and pays for that result.'],
  ['contractorPayroll', 'Say whether the payments to the contractor are wages for payroll tax.'],
  ['contractorWc', 'Say whether the contractor is a worker for workers compensation.'],
  ['smallBusinessOffset', 'Say whether the contractor qualifies for the small business income tax offset.'],
  ['hospitalCover', 'Say whether the person had private patient hospital cover all year.'],
  ['studyLoan', 'Say whether the person has a study or training loan.'],
]);

/** A rate in thousandths of a per cent applied to cents. @param {number} base @param {number} rate */
const atRate = (base, rate) => nearest(BigInt(base) * BigInt(rate), 100000n);
/** The super guarantee on qualifying earnings, capped at the year's maximum contributions base.
 * @param {number} earnings cents @param {{rate: number, cap: number}} sg */
const superGuarantee = (earnings, sg) => nearest(Math.min(earnings, sg.cap * 100) * Math.round(sg.rate * 10), 1000);

/**
 * One full income year. The employee is paid `salary` a year for `hours` a week, including paid leave; annual
 * leave is `annualLeave` weeks with `loading` per cent on it, and `otherLeave` weeks of other paid leave are
 * taken. The contractor is paid `rate` an hour, GST exclusive, for the hours the employee would work: the
 * weeks of the year less both kinds of leave. Section 12(3) applies when the contract is with the person as an
 * individual, gives no right to delegate, is not for a result and its labour part, the fee less `nonLabour`, is
 * more than half the fee. Payroll tax and workers compensation are the stated rates on the stated wages.
 * @param {Engagement} e */
export function contractorEmployee(e) {
  if (!CONTRACTOR_YEARS.includes(e.year)) throw new Error('Choose an income year from 2021-22 to 2026-27.');
  const unanswered = QUESTIONS.find(([field]) => typeof Reflect.get(e, field) !== 'boolean');
  if (unanswered) throw new Error(unanswered[1]);
  const hours = scaled(e.hours, 2, 168);
  if (!hours) throw new Error('Enter the hours worked each week.');
  const [annual, other] = [scaled(e.annualLeave, 2, 52), scaled(e.otherLeave, 2, 52)];
  const worked = WEEKS * 100 - annual - other;
  if (worked <= 0) throw new Error('Enter leave of fewer than 52 weeks in all.');
  const common = { sg: SUPER_GUARANTEE[e.year], hours, worked, annual, payrollRate: scaled(e.payrollRate, 3, 100),
    wcRate: scaled(e.wcRate, 3, 100) };
  const employee = employeeSide(e, common);
  const contractor = contractorSide(e, common);
  const perHour = (/** @type {number} */ cost) => nearest(BigInt(cost) * 10000n, BigInt(hours) * BigInt(worked)) / 100;
  const m = (/** @type {number} */ value) => value / 100;
  return {
    year: e.year, sgRate: common.sg.rate, hoursWorked: hours * worked / 10000, weeksWorked: worked / 100,
    salary: m(employee.salary), loading: m(employee.loading), wages: m(employee.wages), employeeSuperGuarantee: m(employee.sg),
    employeePayrollTax: m(employee.payroll), employeeWorkersCompensation: m(employee.wc), employeeCost: m(employee.cost),
    employeeCostPerHour: perHour(employee.cost), employeeTax: m(employee.tax), employeeTakeHome: m(employee.takeHome),
    fee: m(contractor.fee), labour: m(contractor.labour), labourShare: contractor.fee ? ratioPercent(contractor.labour, contractor.fee) : 0,
    gst: m(contractor.gst), gstCost: m(contractor.gstCost), contractorSuperGuarantee: m(contractor.sg),
    contractorPayrollTax: m(contractor.payroll), contractorWorkersCompensation: m(contractor.wc), contractorCost: m(contractor.cost),
    contractorCostPerHour: perHour(contractor.cost), expenses: m(contractor.expenses), profit: m(contractor.profit),
    contractorTax: m(contractor.tax), smallBusinessOffset: contractor.smallBusinessOffset, ownSuper: m(contractor.ownSuper),
    contractorTakeHome: m(contractor.takeHome), contractorSuper: m(contractor.sg + contractor.ownSuper),
    mustRegister: !e.gst && contractor.fee >= GST_THRESHOLD, section12: contractor.section12, elements: contractor.elements,
    costDifference: m(employee.cost - contractor.cost), takeHomeDifference: m(employee.takeHome - contractor.takeHome),
  };
}

/** @typedef {{sg: {rate: number, cap: number}, hours: number, worked: number, annual: number, payrollRate: number,
 *   wcRate: number}} Common */

/** The employee's cost and take-home, in cents. Annual leave pay is the salary for those weeks; the loading is a
 * rate on it. @param {Engagement} e @param {Common} c */
function employeeSide(e, { sg, annual, payrollRate, wcRate }) {
  const salary = money(e.salary);
  const loadingRate = scaled(e.loading, 3, 100);
  const loading = nearest(BigInt(salary) * BigInt(annual) * BigInt(loadingRate), BigInt(WEEKS * 100 * 100000));
  const wages = salary + loading;
  const employeeSg = superGuarantee(salary + (e.loadingQualifying ? loading : 0), sg);
  const payroll = atRate(wages + (e.payrollSuper ? employeeSg : 0), payrollRate);
  const wc = atRate(wages + (e.wcSuper ? employeeSg : 0), wcRate);
  const pay = takeHomePay({ year: e.year, residency: 'resident', salary: (wages / 100).toFixed(2), period: 'year',
    includesSuper: false, sacrifice: '0', studyLoan: e.studyLoan, hospitalCover: e.hospitalCover });
  const takeHome = Math.round(pay.net * 100);
  return { salary, loading, wages, sg: employeeSg, payroll, wc, cost: wages + employeeSg + payroll + wc, tax: wages - takeHome, takeHome };
}

/** The contractor's cost and take-home for the same hours, in cents: hours a week times weeks worked, both in
 * hundredths. @param {Engagement} e @param {Common} c */
function contractorSide(e, { sg, hours, worked, payrollRate, wcRate }) {
  const fee = nearest(BigInt(money(e.rate)) * BigInt(hours) * BigInt(worked), 10000n);
  const nonLabour = money(e.nonLabour);
  if (nonLabour > fee) throw new Error('Enter a non-labour part no more than the contractor’s fee.');
  const labour = fee - nonLabour;
  const principally = 2 * labour > fee;
  const elements = { individual: e.individual, personal: !e.delegate, notResult: !e.result, principally };
  const section12 = Object.values(elements).every(Boolean);
  const contractorSg = section12 ? superGuarantee(labour, sg) : 0;
  const gst = e.gst ? nearest(fee, 10) : 0;
  const gstCost = e.credits ? 0 : gst;
  const payroll = e.contractorPayroll ? atRate(labour + (e.payrollSuper ? contractorSg : 0), payrollRate) : 0;
  const wc = e.contractorWc ? atRate(labour + (e.wcSuper ? contractorSg : 0), wcRate) : 0;
  const [expenses, ownSuper] = [money(e.expenses), money(e.ownSuper)];
  const cap = CONCESSIONAL_CAP[e.year];
  if (ownSuper && contractorSg + ownSuper > cap * 100) {
    throw new Error(`Enter the contractor’s own super so that it and any super guarantee total no more than the ${e.year} `
      + `concessional contributions cap of $${cap.toLocaleString('en-AU')}: excess contributions are not worked here.`);
  }
  const business = soleTraderSetAside({ year: e.year, income: (fee / 100).toFixed(2), expenses: (expenses / 100).toFixed(2),
    wages: '0', deductions: '0', super: (ownSuper / 100).toFixed(2), offset: e.smallBusinessOffset, studyLoan: e.studyLoan,
    hospitalCover: e.hospitalCover, gst: false, credits: '0', invoice: '0' });
  const tax = Math.round(business.total * 100);
  const profit = fee - expenses;
  return { fee, labour, elements, section12, sg: contractorSg, gst, gstCost, payroll, wc, cost: fee + gstCost + contractorSg + payroll + wc,
    expenses, ownSuper, profit, tax, smallBusinessOffset: business.smallBusinessOffset, takeHome: profit - ownSuper - tax };
}

/** The form's input. @param {(name: string) => string} value @returns {Engagement} */
export function contractorFormInput(value) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  return { year: value('year'), hours: value('hours'), salary: value('salary'), annualLeave: value('annual-leave'),
    otherLeave: value('other-leave'), loading: value('loading'), loadingQualifying: yes('loading-qualifying'),
    payrollRate: value('payroll-rate'), payrollSuper: yes('payroll-super'), wcRate: value('wc-rate'), wcSuper: yes('wc-super'),
    rate: value('rate'), nonLabour: value('non-labour'), expenses: value('expenses'), ownSuper: value('own-super'),
    gst: yes('gst'), credits: yes('credits'), individual: yes('individual'), delegate: yes('delegate'), result: yes('result'),
    contractorPayroll: yes('contractor-payroll'), contractorWc: yes('contractor-wc'), smallBusinessOffset: yes('offset'),
    hospitalCover: yes('hospital'), studyLoan: yes('study-loan') };
}

/** Why section 12(3) does or does not apply, in the order of the elements.
 * @param {ReturnType<typeof contractorEmployee>} r */
export function section12Note(r) {
  const share = `labour is ${r.labourShare.toLocaleString('en-AU')}% of the fee`;
  if (r.section12) {
    return `Section 12(3) applies on these answers: the contract is with the person, who must do the work personally, it is not `
      + `for a result and ${share}, so the business owes the super guarantee on the labour part as though the contractor were an employee`;
  }
  const fails = [!r.elements.individual && 'the contract is not with the person as an individual',
    !r.elements.personal && 'the contract gives a right to delegate, subcontract or assign the work',
    !r.elements.notResult && 'the contract is for a result',
    !r.elements.principally && `${share}, not more than half`].filter(Boolean);
  return `Section 12(3) does not apply on these answers: ${fails.join('; ')}. The super guarantee is still owed if the person `
    + 'is an employee in the ordinary meaning';
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function contractorEmployeeResult(value, aud) {
  const input = contractorFormInput(value);
  const r = contractorEmployee(input);
  const hours = r.hoursWorked.toLocaleString('en-AU', { maximumFractionDigits: 2 });
  const signed = (/** @type {number} */ n) => (n < 0 ? `-${aud(-n)}` : aud(n));
  const gstLabel = { none: 'Contractor: GST, none as not registered', cost: 'Contractor: GST, not claimable',
    credit: 'Contractor: GST, claimed back as a credit' }[input.gst ? (r.gstCost ? 'cost' : 'credit') : 'none'];
  const rows = [
    [`Hours worked in the year, ${r.weeksWorked.toLocaleString('en-AU')} weeks`, hours],
    ['Employee: salary, including paid leave', aud(r.salary)],
    ['Employee: leave loading', aud(r.loading)],
    [`Employee: super guarantee at ${r.sgRate}%`, aud(r.employeeSuperGuarantee)],
    ['Employee: payroll tax', aud(r.employeePayrollTax)],
    ['Employee: workers compensation', aud(r.employeeWorkersCompensation)],
    ['Employee: cost to the business', aud(r.employeeCost)],
    ['Employee: cost for each hour worked', aud(r.employeeCostPerHour)],
    ['Contractor: fee, excluding GST', aud(r.fee)],
    [gstLabel, aud(r.gst)],
    [`Contractor: super guarantee under section 12(3)${r.section12 ? `, at ${r.sgRate}% of the labour part` : ', not owed'}`,
      aud(r.contractorSuperGuarantee)],
    ['Contractor: payroll tax', aud(r.contractorPayrollTax)],
    ['Contractor: workers compensation', aud(r.contractorWorkersCompensation)],
    ['Contractor: cost to the business', aud(r.contractorCost)],
    ['Contractor: cost for each hour worked', aud(r.contractorCostPerHour)],
    ['Cost to the business: employee less contractor', signed(r.costDifference)],
    ['Employee: tax, Medicare levy and any surcharge or study loan repayment', aud(r.employeeTax)],
    ['Employee: take-home pay', aud(r.employeeTakeHome)],
    ['Contractor: profit after business expenses', aud(r.profit)],
    ['Contractor: tax, Medicare levy and any surcharge or study loan repayment', aud(r.contractorTax)],
    ['Contractor: take-home after own super and tax', aud(r.contractorTakeHome)],
    ['Take-home: employee less contractor', signed(r.takeHomeDifference)],
    ['Super: employee', aud(r.employeeSuperGuarantee)],
    ['Super: contractor, super guarantee and own contributions', aud(r.contractorSuper)],
  ];
  const notes = [section12Note(r)];
  if (r.mustRegister) {
    notes.push('A fee of $75,000 or more a year is GST turnover at the registration threshold, so the contractor must register for GST '
      + '(GST Act section 23-5)');
  }
  return { inputs: contractorInputsText(input, aud), rows, principal: 15, note: notes.join('. ') };
}

/** How the page writes the input. @param {Engagement} x @param {(value: number) => string} aud */
export function contractorInputsText(x, aud) {
  const yesNo = (/** @type {boolean} */ flag, /** @type {string} */ yes, /** @type {string} */ no) => (flag ? yes : no);
  return `${x.year}; ${x.hours} hours a week; employee salary ${aud(Number(x.salary))}, ${x.annualLeave} weeks of annual leave `
    + `with ${x.loading}% loading (${yesNo(x.loadingQualifying, 'ordinary time earnings', 'not ordinary time earnings')}), `
    + `${x.otherLeave} weeks of other paid leave; payroll tax ${x.payrollRate}% (${yesNo(x.payrollSuper, 'super included', 'super excluded')}), `
    + `workers compensation ${x.wcRate}% (${yesNo(x.wcSuper, 'super included', 'super excluded')}); contractor ${aud(Number(x.rate))} an hour, `
    + `non-labour part ${aud(Number(x.nonLabour))}, expenses ${aud(Number(x.expenses))}, own super ${aud(Number(x.ownSuper))}, `
    + `${yesNo(x.gst, 'registered for GST', 'not registered for GST')}${x.gst ? yesNo(x.credits, ', full credit', ', no credit') : ''}; `
    + `contract ${yesNo(x.individual, 'with the person', 'not with the person as an individual')}, `
    + `${yesNo(x.delegate, 'right to delegate', 'no right to delegate')}, ${yesNo(x.result, 'for a result', 'not for a result')}; `
    + `contractor ${yesNo(x.contractorPayroll, 'in', 'outside')} payroll tax and ${yesNo(x.contractorWc, 'in', 'outside')} workers compensation; `
    + `${yesNo(x.smallBusinessOffset, 'small business income tax offset', 'no small business income tax offset')}; `
    + `${yesNo(x.hospitalCover, 'hospital cover', 'no hospital cover')}, ${yesNo(x.studyLoan, 'study loan', 'no study loan')}`;
}
