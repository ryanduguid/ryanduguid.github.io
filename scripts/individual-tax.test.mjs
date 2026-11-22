// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { daysInYear, incomeTax, INCOME_TAX_YEARS, RESIDENT_SCALES, MEDICARE_THRESHOLDS, medicareLevySurcharge,
  SURCHARGE_THRESHOLDS } from '../assets/income-tax.mjs';
import { studyLoanRepayment, STUDY_LOAN_YEARS } from '../assets/study-loan.mjs';
import { CONCESSIONAL_CAP, division293, takeHomePay, SUPER_GUARANTEE } from '../assets/take-home-pay.mjs';
import { taxEstimate } from '../assets/tax-estimate.mjs';
import { withholding } from '../assets/payg-withholding.mjs';
import { individualResult } from '../assets/individual-tax-results.mjs';
import { division293Tax } from '../assets/division-293.mjs';
import { lumpSumArrears } from '../assets/lump-sum-arrears.mjs';
import { SOLE_TRADER_YEARS, soleTraderSetAside } from '../assets/sole-trader.mjs';
import { incomeTests, INCOME_TEST_PARTS } from '../assets/income-tests.mjs';
import { CAP, concessionalCatchUp } from '../assets/concessional-catch-up.mjs';
import { superProjection } from '../assets/super-projection.mjs';
import { fhss } from '../assets/fhss.mjs';
import { fhssFormFacts, fhssResult } from '../assets/fhss-result.mjs';
import './fhss.test.mjs';
import { workExpenses } from '../assets/work-expenses.mjs';
import { workExpensesFormFacts, workExpensesResult } from '../assets/work-expenses-result.mjs';
import './work-expenses.test.mjs';

import { bonusWithholding } from '../assets/bonus-withholding.mjs';
import { salaryPackaging } from '../assets/salary-packaging.mjs';
import { FUEL_EFFICIENT_THRESHOLD, novatedLease } from '../assets/novated-lease.mjs';
const engines = { taxEstimate, takeHomePay, studyLoanRepayment, soleTraderSetAside, lumpSumArrears, division293Tax, incomeTests, concessionalCatchUp,
  bonusWithholding, salaryPackaging, novatedLease, superProjection, fhssAmounts: (facts) => fhss(facts).amounts,
  workExpenses };
const shownCases = JSON.parse(readFileSync(new URL('../_data/individual_tax_cases.json', import.meta.url), 'utf8'));
const dollars = (value) => `$${Number(value).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (value) => `$${Number(value).toLocaleString('en-AU')}`;
const RESIDENCY = { resident: 'Australian resident', foreign: 'foreign resident', 'working-holiday': 'working holiday maker' };
const PARTS = [['taxable', 'taxable income'], ['fringe', 'fringe benefits'], ['losses', 'net investment loss'],
  ['super', 'super contributions'], ['foreign', 'exempt foreign employment income']];
const PERIOD = { year: 'a year', month: 'a month', fortnight: 'a fortnight', week: 'a week' };
const parts = (r) => PARTS.filter(([key]) => key === 'taxable' || r[key] !== '0').map(([key, label]) => `${label} ${whole(r[key])}`)
  .join(', ');
const flags = (c) => `${c.studyLoan ? ', study loan' : ''}${c.hospitalCover ? '' : ', no hospital cover'}`;
const settle = (value) => `${value < 0 ? 'owing' : 'refund'} ${dollars(Math.abs(value))}`;
const PAY_NAME = { week: 'weekly', fortnight: 'fortnightly', month: 'monthly' };
const DIVISION_293_PARTS = [['fringe', 'fringe benefits'], ['losses', 'net investment loss'],
  ['trust', 'family trust distribution tax income'], ['fhss', 'less FHSS'], ['lumpSum', 'less zero-rate lump sum']];
const INCOME_TEST_LABELS = { taxable: 'taxable', fhss: 'FHSS', familyTrust: 'family trust', fringe57a: 'section 57A fringe',
  fringeOther: 'other fringe', employerSuper: 'employer super', personalSuper: 'personal super',
  excessConcessional: 'excess concessional', financialLoss: 'financial loss', rentalLoss: 'rental loss', pensions: 'pensions',
  targetForeign: 'target foreign', exemptForeign: 'exempt foreign', childSupport: 'child support', assessable: 'assessable',
  businessDeductions: 'business deductions' };
const signed = (value) => (value < 0 ? `-${whole(-value)}` : whole(value));

// How each row's call reads on the page and how its result reads, so neither can drift from the engine.
const CONNECTION = { maintains_or_improves_skills: 'skills for current work', increases_income: 'likely to increase income',
  general_only: 'general only', new_employment: 'new employment' };
const HOME_INPUT = { energy: 'energy', phone: 'phone', internet: 'internet', stationery: 'stationery', cleaning: 'cleaning',
  furniture_decline: 'furniture decline', asset_decline: 'other assets’ decline', repairs: 'repairs' };
const HOME_OUTPUT = { fixed_rate: 'fixed rate', shortcut: 'shortcut', actual_cost: 'actual cost' };
const INPUTS = {
  workExpenses: (f) => `${f.year}, ` + ({
    home_office: () => `working from home, ${Number(f.hours).toLocaleString('en-AU')} hours`
      + Object.entries(HOME_INPUT).filter(([key]) => Number(f[key])).map(([key, label]) => `, ${label} ${dollars(f[key])}`).join('')
      + `${f.running_expenses_incurred ? '' : ', no additional running expenses'}${f.dedicated_home_office === false ? ', no dedicated home office' : ''}`,
    car_cents_per_kilometre: () => `cents per kilometre, ${Number(f.business_kilometres).toLocaleString('en-AU')} business km`,
    car_log_book: () => `log book kept ${f.log_book_year} for ${f.log_book_weeks} weeks, ${Number(f.business_kilometres).toLocaleString('en-AU')} `
      + `of ${Number(f.total_kilometres).toLocaleString('en-AU')} km, car expenses ${dollars(f.car_expenses)}`,
    self_education: () => `self-education, ${CONNECTION[f.connection]}${f.employed_when_incurred ? '' : ', not employed'}, `
      + `A ${dollars(f.category_a)}, B ${dollars(f.category_b)}, C ${dollars(f.category_c)}, D ${dollars(f.category_d)}`
      + `${f.prescribed_course === undefined ? '' : f.prescribed_course ? `, prescribed course, E ${dollars(f.category_e)}` : ', not a prescribed course'}`,
  })[f.method](),
  fhssAmounts: (f) => `ATO determination: concessional ${dollars(f.concessional)}, non-concessional ${dollars(f.nonConcessional)}, earnings ${dollars(f.associatedEarnings)}`
    + (f.actualRelease ? `, requested ${dollars(f.requestedAmount)} on ${f.releaseRequestDate}, gross released ${dollars(f.actualRelease)}` : ''),
  taxEstimate: (r) => `${r.year}, ${RESIDENCY[r.residency]}, ${parts(r)}${r.studyLoan ? ', study loan' : ''}`
    + `${r.uncoveredDays === '0' ? '' : `, ${r.uncoveredDays} days without hospital cover`}`
    + `${r.spouse === null ? '' : `, spouse ${whole(r.spouse)}`}${r.children === '0' ? '' : `, ${r.children} children`}`
    + `, withheld ${dollars(r.withheld)}`,
  takeHomePay: (p) => `${p.year}, ${RESIDENCY[p.residency]}, ${whole(p.salary)} ${PERIOD[p.period]} `
    + `${p.includesSuper ? 'including' : 'plus'} super${p.sacrifice === '0' ? '' : `, ${whole(p.sacrifice)} sacrificed`}`
    + `${p.studyLoan ? ', study loan' : ''}${p.hospitalCover ? '' : ', no hospital cover'}`,
  studyLoanRepayment: (r, year) => `${year}: ${parts(r)}`,
  superProjection: (p) => `Age ${p.age} to ${p.retire}, balance ${dollars(p.balance)}, salary ${whole(p.salary)} at ${p.employer}%`
    + `${p.sacrifice === '0' ? '' : `, sacrifice ${dollars(p.sacrifice)}`}`
    + `${p.afterTax === '0' ? '' : `, after tax ${dollars(p.afterTax)}`}`
    + `, return ${p.returnRate}%, fees ${dollars(p.adminFee)} and ${p.percentFee}%, premiums ${dollars(p.insurance)}`
    + `, growth ${p.growth}%, present value at ${p.discount}%`,
  salaryPackaging: (p) => `${p.year}, ${p.employer}, ${p.residency}, salary ${whole(p.salary)}, Type 2 ${dollars(p.typeTwo)}`
    + `${p.typeOne === '0' ? '' : `, Type 1 ${dollars(p.typeOne)}`}`
    + `${p.meals === '0' ? '' : `, meal entertainment ${dollars(p.meals)} (Type ${p.mealsTypeOne ? 1 : 2})`}${flags(p)}`,
  novatedLease: (n) => `${n.year}, ${n.kind}, first held and used on ${n.firstUsed}`
    + `${n.commitment ? ', earlier commitment' : ''}, sold ${n.saleYear} at ${dollars(n.price)}${n.otherSupply ? ', luxury car tax at another supply' : ''}`
    + `${n.reduced ? ', held over 4 years' : ''}, `
    + `${n.days} days, costs ${dollars(n.gstCosts)} with GST and ${dollars(n.otherCosts)} without, salary ${whole(n.salary)}${flags(n)}`,
  bonusWithholding: (b) => `${PAY_NAME[b.period]}, scale ${b.residency === 'resident' ? 2 : 3}${b.studyLoan ? ', study loan' : ''}, `
    + `${dollars(b.earnings)} this pay; ` + (b.method === 'A' ? `Method A: ${dollars(b.additional)} over ${b.spread} pays`
    : [b.backPays !== '0' ? `B(i): ${dollars(b.backEach)} for each of ${b.backPays} pays of ${dollars(b.backEarnings)} that had `
      + `${dollars(b.backWithheld)} withheld` : '', b.additional !== '0' ? `B(ii): ${dollars(b.additional)}, ${dollars(b.yearToDate)} `
      + `over ${b.paysToDate} pays to date${b.earlierAdditional === '0' ? '' : `, earlier ${dollars(b.earlierAdditional)} with `
      + `${dollars(b.earlierWithheld)} withheld`}` : ''].filter(Boolean).join('; ')),
  division293Tax: (d) => `${d.year}: taxable income ${whole(d.taxable)}`
    + DIVISION_293_PARTS.filter(([key]) => d[key] !== '0').map(([key, label]) => `, ${label} ${whole(d[key])}`).join('')
    + `; contributions ${dollars(d.concessional)}`
    + (d.unused === '0' ? '' : `, unused cap ${dollars(d.unused)}, balance ${d.balanceUnder ? 'under' : '$500,000 or more'}`),
  soleTraderSetAside: (s) => `${s.year}, business ${whole(s.income)} less ${whole(s.expenses)}`
    + `${s.wages === '0' ? '' : `, wages ${whole(s.wages)}`}${s.deductions === '0' ? '' : `, other deductions ${whole(s.deductions)}`}`
    + `${s.super === '0' ? '' : `, super contributions ${whole(s.super)}`}`
    + `${s.offset ? '' : ', no offset'}${s.studyLoan ? ', study loan' : ''}${s.hospitalCover ? '' : ', no hospital cover'}`
    + `${s.gst ? `, GST registered, credits ${whole(s.credits)}` : ''}, invoice ${dollars(s.invoice)}`,
  lumpSumArrears: (c) => `${c.year}, taxable ${dollars(c.taxable)}${c.gain === '0' ? '' : `, net capital gain ${dollars(c.gain)}`}; `
    + c.accrual.map((r) => `${r.year} ${dollars(r.arrears)}${r.taxable === undefined ? '' : ` on ${dollars(r.taxable)}`}`
      + `${r.gain === undefined ? '' : ` with a gain of ${dollars(r.gain)}`}`
      + `${r.rebateYearArrears === undefined ? '' : `, less ${dollars(r.rebateYearArrears)} as a rebate year`}`
      + `${r.earlierRebateArrears === undefined ? '' : `, plus ${dollars(r.earlierRebateArrears)} of an earlier one`}`).join(', '),
  incomeTests: (p) => `${p.resident ? 'Resident' : 'Not resident'} all year, `
    + INCOME_TEST_PARTS.filter((key) => key === 'taxable' || p[key] !== '0').map((key) => `${INCOME_TEST_LABELS[key]} ${whole(p[key])}`)
      .join(', '),
  concessionalCatchUp: (c) => `${c.year}, balance ${dollars(c.balance)}, contributions ${dollars(c.concessional)}`
    + `${c.proposed === undefined ? '' : `, proposed ${dollars(c.proposed)}`}; earlier `
    + c.earlier.map((r) => `${r.year} ${dollars(r.contributions)}${r.balance === undefined ? '' : ` at ${dollars(r.balance)}`}`)
      .join(', '),
};
const OUTPUTS = {
  workExpenses: (r) => ({
    home_office: () => `${r.methodsAvailable.map((m) => `${HOME_OUTPUT[m]} ${dollars(r.amounts[`${m}_method`])}`).join(', ').replace(/^./, (c) => c.toUpperCase())}; `
      + `higher ${HOME_OUTPUT[r.higherMethod]}, ${dollars(r.amounts[`${r.higherMethod}_return_amount`])} with cents disregarded`,
    car_cents_per_kilometre: () => `${Number(r.amounts.claimed_kilometres).toLocaleString('en-AU')} km counted, deduction `
      + `${dollars(r.amounts.deduction)}, ${dollars(r.amounts.return_amount)} with cents disregarded`,
    car_log_book: () => `Business use ${r.amounts.business_use_percentage}%, deduction ${dollars(r.amounts.deduction)}, `
      + `${dollars(r.amounts.return_amount)} with cents disregarded`,
    self_education: () => `${r.reductionApplies ? `Reduction ${dollars(r.amounts.reduction)}, deduction` : 'Deduction'} `
      + `${dollars(r.amounts.deduction)}${r.deductible ? '' : ', not deductible'}`,
  })[r.method](),
  fhssAmounts: (r) => `Maximum release ${dollars(r.maximum_release_amount)}, assessable ${dollars(r.assessable_fhss_released_amount)}, `
    + `PAYG ${dollars(r.tax_withheld)}, after withholding ${dollars(r.after_withholding)}, offset ${dollars(r.fhss_tax_offset)}`,
  taxEstimate: (r, call) => `Tax ${dollars(r.tax)}, offset ${dollars(r.offset)}`
    + `${['2020-21', '2021-22'].includes(call.year) ? `, LMITO ${dollars(r.lmito)}` : ''}, Medicare levy ${dollars(r.medicare)}, `
    + `surcharge ${dollars(r.surcharge)}${call.studyLoan ? `, study loan ${dollars(r.studyLoan)}` : ''}, `
    + `total ${dollars(r.assessed)}, ${settle(r.refund)}`,
  takeHomePay: (r) => `Take-home ${dollars(r.net)} a year, ${dollars(r.fortnightly)} a fortnight; super ${dollars(r.superGuarantee)}`
    + `${r.withheld ? `; withheld ${dollars(r.withheld.total)} a pay, ${settle(r.withheld.refund)}` : ''}`
    + `${r.overCap ? `; ${dollars(r.overCap)} over the cap` : ''}${r.division293 ? `; Division 293 on ${dollars(r.division293)}` : ''}`,
  studyLoanRepayment: (r) => `Repayment income ${dollars(r.repaymentIncome)}, repayment ${dollars(r.repayment)}`,
  superProjection: (r) => `${r.years} year${r.years === 1 ? '' : 's'}: ${dollars(r.balance)}, present value ${dollars(r.present)}`,
  salaryPackaging: (r) => `Gain ${dollars(r.gain)}: tax saved ${dollars(r.saved)}, FBT ${dollars(r.fbt)}, `
    + `reportable ${whole(r.reportable)}`,
  novatedLease: (r) => `${r.exempt ? 'Exempt' : `Not exempt (${r.reason})`}: value ${dollars(r.taxableValue)}, saving `
    + `${dollars((r.exemptCase ?? r.contribution).saving)}`
    + `${r.exempt && r.contribution ? `, ${dollars(r.contribution.saving)} without the exemption` : ''}`,
  bonusWithholding: (r) => `Withheld ${dollars(r.total)}: ${dollars(r.onEarnings)} on earnings`
    + (r.method === 'A' ? `, ${dollars(r.onAdditional)} on the payment (limit ${dollars(r.limit)}); adds ${dollars(r.yearTax)} to a year`
      : `${r.methodBi ? `, ${dollars(r.methodBi.onBackPayment)} by B(i)` : ''}`
        + `${r.methodBii ? `, ${dollars(r.methodBii.onAdditional)} by B(ii) (limit ${dollars(r.methodBii.limit)})` : ''}`),
  division293Tax: (r) => `Division 293 income ${dollars(r.income)}, low tax contributions ${dollars(r.low)}`
    + `${r.excess ? ` after ${dollars(r.excess)} excess` : ''}, taxable contributions ${dollars(r.taxable)}, tax ${dollars(r.tax)}`,
  soleTraderSetAside: (r, s) => `Offset ${dollars(r.smallBusinessOffset)}, business tax ${dollars(r.businessTax)}`
    + `${s.gst ? `, GST ${dollars(r.gst)}` : ''}; set aside ${dollars(r.setAside)} a year, ${dollars(r.quarterly)} a quarter, `
    + `${r.invoiceShare.toFixed(2)}% of each invoice`,
  lumpSumArrears: (r) => (r.met ? `Tax on arrears ${dollars(r.taxOnArrears)}, notional tax ${dollars(r.notionalTotal)}, `
    + `offset ${dollars(r.offset)}` : `Arrears ${dollars(r.total)} below ${dollars(r.tenPercent)}, offset ${dollars(r.offset)}`),
  incomeTests: (r) => `Surcharge ${whole(r.surchargeIncome)}, Division 293 ${whole(r.division293Income)}, `
    + `rebate ${whole(r.rebateIncome)}, repayment ${whole(r.repaymentIncome)}, adjusted taxable ${signed(r.adjustedTaxableIncome)}, `
    + `co-contribution ${signed(r.coContributionIncome)}`,
  concessionalCatchUp: (r) => `Cap ${dollars(r.available)} with ${dollars(r.unusedCarried)} unused from the previous 5 years, `
    + `${dollars(r.carryForwardApplied)} applied, ${dollars(r.excess)} excess`
    + `${r.withProposal === null ? '' : `; with the proposal ${dollars(r.excessWithProposal)} excess`}; ${dollars(r.expiring)} lapses`,
};

test('each individual tax page has its boundary cases', () => {
  const pages = readdirSync(new URL('../tools/individual-tax/', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(Object.keys(shownCases).sort(), pages);
});

for (const [page, { function: name, rows }] of Object.entries(shownCases)) {
  for (const row of rows) {
    test(`${page} boundary case returns what its page shows: ${row.case}`, () => {
      assert.equal(INPUTS[name](...row.call), row.input);
      const result = engines[name](...row.call);
      assert.deepEqual(result, row.result);
      assert.equal(OUTPUTS[name](result, ...row.call), row.output);
    });
  }
}

// The values each form opens with: an input's value, or the checked radio's value.
const formDefaults = (html) => {
  const fields = {};
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    if (name && /\btype="radio"/.test(tag) && !/\bchecked\b/.test(tag)) continue;
    if (name) fields[name] = tag.match(/\bvalue="([^"]*)"/)?.[1];
  }
  for (const [, name, text] of html.matchAll(/<textarea\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) {
    fields[name] = text;
  }
  return fields;
};
// How assets/individual-tax-results.mjs passes each form's fields to its engine.
const fhssExampleFields = fields => ({ ...fields, scope: 'yes', 'withholding-basis': 'unable', 'debt-offset': '0', transition: '' });
const FORM_CALLS = {
  workExpenses: (f) => [workExpensesFormFacts((name) => ({ ...f, scope: 'yes' })[name] ?? '')],
  fhssAmounts: (f) => {
    const fixture = fhssExampleFields(f);
    return [Object.fromEntries(Object.entries(fhssFormFacts(name => fixture[name] ?? '')).filter(([, value]) => value !== ''))];
  },
  taxEstimate: (f) => [{ year: f.year, residency: f.residency, taxable: f.income, fringe: f.fringe, super: f.super,
    losses: f.losses, foreign: f.foreign, studyLoan: f['study-loan'] === 'yes', uncoveredDays: f.uncovered,
    spouse: f.spouse === 'yes' ? f['spouse-income'] : null, children: f.children, withheld: f.withheld }],
  takeHomePay: (f) => [{ year: f.year, residency: f.residency, salary: f.salary, period: f.period,
    includesSuper: f.super === 'included', sacrifice: f.sacrifice, studyLoan: f['study-loan'] === 'yes',
    hospitalCover: f.cover === 'yes' }],
  studyLoanRepayment: (f) => [{ taxable: f.taxable, fringe: f.fringe, losses: f.losses, super: f.super, foreign: f.foreign }, f.year],
  superProjection: (f) => [{ age: f.age, retire: f.retire, balance: f.balance, salary: f.salary, employer: f.employer,
    sacrifice: f.sacrifice, afterTax: f['after-tax'], returnRate: f.return, percentFee: f['percent-fee'], adminFee: f['admin-fee'],
    insurance: f.insurance, growth: f.growth, discount: f.discount }],
  salaryPackaging: (f) => [{ year: f.year, residency: f.residency, employer: f.employer, salary: f.salary, typeTwo: f['type-two'],
    typeOne: f['type-one'], meals: f.meals, mealsTypeOne: f['meals-type-one'] === 'yes', studyLoan: f['study-loan'] === 'yes',
    hospitalCover: f.cover === 'yes' }],
  novatedLease: (f) => [{ year: f.year, residency: f.residency, salary: f.salary, studyLoan: f['study-loan'] === 'yes',
    hospitalCover: f.cover === 'yes', kind: f.kind, firstUsed: f['first-used'], commitment: f.commitment === 'yes',
    saleYear: f['sale-year'], price: f.price, otherSupply: f['other-supply'] === 'yes', lctTiming: f['lct-timing'],
    reduced: f.reduced === 'yes', days: f.days,
    gstCosts: f['gst-costs'], otherCosts: f['other-costs'] }],
  bonusWithholding: (f) => [{ period: f.period, residency: f.residency, studyLoan: f['study-loan'] === 'yes', method: f.method,
    earnings: f.earnings, additional: f.additional, spread: f.spread, backPays: f['back-pays'], backEarnings: f['back-earnings'],
    backEach: f['back-each'], backWithheld: f['back-withheld'], yearToDate: f['year-to-date'], paysToDate: f['pays-to-date'],
    earlierAdditional: f['earlier-additional'], earlierWithheld: f['earlier-withheld'] }],
  division293Tax: (f) => [{ year: f.year, interests: f.interests, taxable: f.taxable, fringe: f.fringe, losses: f.losses,
    trust: f.trust, fhss: f.fhss, lumpSum: f['lump-sum'], concessional: f.concessional, unused: f.unused,
    balanceUnder: f['balance-under'] === 'yes' }],
  soleTraderSetAside: (f) => [{ year: f.year, income: f.income, expenses: f.expenses, wages: f.wages, deductions: f.deductions,
    super: f.super, offset: f.offset === 'yes', studyLoan: f['study-loan'] === 'yes', hospitalCover: f.cover === 'yes', gst: f.gst === 'yes',
    credits: f.credits, invoice: f.invoice }],
  lumpSumArrears: (f) => [{ year: f.year, resident: f.resident === 'yes', otherAmounts: f.other === 'yes', taxable: f.taxable, gain: f.gain,
    accrual: ['latest', 'before', 'earlier-1', 'earlier-2', 'earlier-3', 'earlier-4'].filter((slot) => f[`${slot}-year`])
      .map((slot) => Object.fromEntries([['year', 'year'], ['arrears', 'arrears'], ['taxable', 'taxable'], ['gain', 'gain'],
        ['rebateYearArrears', 'rebate-year'], ['earlierRebateArrears', 'earlier-rebate']]
        .map(([key, name]) => [key, f[`${slot}-${name}`]]).filter(([, value]) => value))) }],
  incomeTests: (f) => [{ resident: f.resident === 'yes', ...Object.fromEntries(INCOME_TEST_PARTS
    .map((key) => [key, f[key.replace(/[A-Z0-9]+/g, (part) => `-${part.toLowerCase()}`)]])) }],
  concessionalCatchUp: (f) => [{ year: f.year, balance: f.balance, concessional: f.concessional,
    ...(f.proposed ? { proposed: f.proposed } : {}), definedBenefit: f['defined-benefit'] === 'yes',
    earlier: Object.keys(CAP).sort().filter((year) => f[`contributions-${year}`]).map((year) => ({ year,
      contributions: f[`contributions-${year}`], ...(f[`balance-${year}`] ? { balance: f[`balance-${year}`] } : {}) })) }],
};
for (const [page, { function: name, rows: [first] }] of Object.entries(shownCases)) {
  test(`${page} opens on its first boundary case as the worked example`, () => {
    const html = readFileSync(new URL(`../_includes/calculators/${page}.html`, import.meta.url), 'utf8');
    assert.deepEqual(FORM_CALLS[name](formDefaults(html)), first.call);
    assert.equal(html.match(/\{% include calculator-example\.html /g)?.length, 1);
  });
}

// Base amounts printed in the ATO's tables (Tax rates – Australian resident, last updated 13 August 2026;
// foreign resident and working holiday maker, last updated 1 June 2026; read 17 November 2026): the tax at
// the top of each band.
test('the scales give the ATO tables’ amount at the top of each band', () => {
  const tax = (income, year, residency) => incomeTax(String(income), year, residency).tax;
  for (const [income, expected] of [[45000, 4020], [135000, 31020], [190000, 51370]]) {
    assert.equal(tax(income, '2026-27', 'resident'), expected);
  }
  for (const year of ['2024-25', '2025-26']) {
    for (const [income, expected] of [[45000, 4288], [135000, 31288], [190000, 51638]]) {
      assert.equal(tax(income, year, 'resident'), expected);
    }
  }
  for (const year of ['2024-25', '2025-26', '2026-27']) {
    for (const [income, expected] of [[135000, 40500], [190000, 60850]]) assert.equal(tax(income, year, 'foreign'), expected);
    for (const [income, expected] of [[45000, 6750], [135000, 33750], [190000, 54100]]) {
      assert.equal(tax(income, year, 'working-holiday'), expected);
    }
  }
  // 2020-21 to 2023-24, read 18 November 2026: 32.5% from $45,001, 37% from $120,001, 45% from $180,001.
  for (const year of ['2020-21', '2021-22', '2022-23', '2023-24']) {
    for (const [income, expected] of [[45000, 5092], [120000, 29467], [180000, 51667]]) {
      assert.equal(tax(income, year, 'resident'), expected, year);
    }
    for (const [income, expected] of [[120000, 39000], [180000, 61200]]) assert.equal(tax(income, year, 'foreign'), expected, year);
    for (const [income, expected] of [[45000, 6750], [120000, 31125], [180000, 53325]]) {
      assert.equal(tax(income, year, 'working-holiday'), expected, year);
    }
  }
});

// ITAA 1997 ss 61-105 and 61-107 (Compilation No. 233, 22 June 2022) and the ATO's examples on 'Low and
// middle income earner tax offsets' (last updated 16 June 2025), read 18 November 2026: Jeff, Anita and Andre
// for 2021-22. At exactly $126,000 the Act gives nil, where the ATO's table gives $420.
test('the low and middle income tax offset follows s 61-107 for 2020-21 and 2021-22 only', () => {
  const lmito = (income, year) => incomeTax(String(income), year, 'resident').lmito;
  for (const [income, expected] of [[37000, 675], [45000, 1275], [48000, 1500], [70000, 1500], [90000, 1500],
    [92000, 1440], [125999, 420.03], [126000, 0], [126001, 0]]) {
    assert.equal(lmito(income, '2021-22'), expected, String(income));
  }
  for (const [income, expected] of [[37000, 255], [37001, 255.08], [48000, 1080], [90001, 1079.97], [125999, 0.03], [126000, 0]]) {
    assert.equal(lmito(income, '2020-21'), expected, String(income));
  }
  assert.equal(lmito(50000, '2022-23'), 0);
  assert.equal(incomeTax('50000', '2021-22', 'foreign').lmito, 0);
  // Applied after the low income tax offset, and never below nil.
  const low = incomeTax('20000', '2021-22', 'resident');
  assert.deepEqual([low.tax, low.offset, low.lmito, low.netTax], [342, 342, 0, 0]);
  const some = incomeTax('22000', '2021-22', 'resident');
  assert.deepEqual([some.tax, some.offset, some.lmito, some.netTax], [722, 700, 22, 0]);
});

// ITAA 1997 s 61-115(1) and the ATO's worked figure: $325 at $45,000 (Jeff, on 'Low and middle income
// earner tax offsets'); $700 to $37,500; nil above $66,667.
test('the low income tax offset follows the s 61-115 table and only residents get it', () => {
  const offset = (income, residency = 'resident') => incomeTax(String(income), '2026-27', residency).offset;
  assert.equal(offset(37500), 700);
  assert.equal(offset(37501), 699.95);
  assert.equal(offset(45000), 325);
  assert.equal(offset(66665), 0.03);
  assert.equal(offset(66666), 0.01);
  assert.equal(offset(66668), 0);
  assert.equal(offset(40000, 'foreign'), 0);
  assert.equal(offset(40000, 'working-holiday'), 0);
  // The offset cannot take the tax below nil.
  assert.equal(incomeTax('20000', '2026-27', 'resident').offset, 270);
  assert.equal(incomeTax('20000', '2026-27', 'resident').netTax, 0);
});

// Medicare Levy Act 1986 ss 6(1) and 7, and the ATO's 'What is the Medicare levy' example (Matthew,
// $75,000, $1,500).
test('the Medicare levy is nil to the threshold, 10% of the excess to the phase-in limit, then 2%', () => {
  const levy = (income, year = '2026-27') => incomeTax(String(income), year, 'resident').medicare;
  assert.equal(levy(75000), 1500);
  assert.equal(levy(28011), 0);
  assert.equal(levy(28012), 0.1);
  assert.equal(levy(27222, '2024-25'), 0);
  assert.equal(levy(34027, '2024-25'), 680.5);
  assert.equal(levy(34028, '2024-25'), 680.56);
});

const csv = (path) => {
  const [head, ...lines] = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').trim().split(/\r?\n/);
  const names = head.split(',');
  return lines.map((line) => Object.fromEntries(line.match(/("[^"]*"|[^,]*)(,|$)/g).slice(0, names.length)
    .map((cell, i) => [names[i], cell.replace(/,$/, '').replace(/^"|"$/g, '')])));
};

test('the resident scales and Medicare thresholds are the site’s rate table rows', () => {
  const rows = csv('rates/individual-income-tax/individual-income-tax-rates.csv');
  for (const year of INCOME_TAX_YEARS) {
    const table = rows.filter((row) => row.income_year === year && row.component === 'resident_tax' && row.rate_percent !== '0')
      .map((row) => [Number(row.income_from) - 1, Number(row.rate_percent)]);
    assert.deepEqual(RESIDENT_SCALES[year], table, year);
    const medicare = rows.find((row) => row.income_year === year && row.component === 'medicare_levy_low_income_single');
    assert.ok(medicare, `${year} has a Medicare levy threshold row`);
    assert.deepEqual(MEDICARE_THRESHOLDS[year], [Number(medicare.income_from), Number(medicare.income_to)], year);
  }
});

test('the study loan years are the site’s repayment table rows', () => {
  const rows = csv('rates/study-loan-repayment/study-loan-repayment-thresholds.csv');
  for (const [year, table] of Object.entries(STUDY_LOAN_YEARS)) {
    const own = rows.filter((row) => row.income_year === year);
    assert.equal(Number(own.find((row) => row.basis === 'nil').repayment_income_to), table.minimum, year);
    if (table.top) {
      assert.equal(Number(own.filter((row) => row.basis === 'marginal')[0].repayment_income_to), table.top, year);
    } else {
      assert.deepEqual(own.filter((row) => row.basis === 'total')
        .map((row) => [Number(row.repayment_income_from), Number(row.rate_percent)]), table.bands, year);
    }
  }
});

test('the super guarantee rates and maximum contribution bases are the site’s rate table rows', () => {
  const rates = csv('rates/super-guarantee/super-guarantee-rates.csv');
  const bases = csv('rates/maximum-contribution-base/maximum-contribution-base.csv');
  for (const [year, { rate, cap }] of Object.entries(SUPER_GUARANTEE)) {
    const start = `${year.slice(0, 4)}-07-01`;
    const row = rates.find((r) => r.period_start <= start && (r.period_end === '' || r.period_end >= start));
    assert.equal(rate, Number(row.general_sg_rate_percent), year);
    const base = bases.find((r) => r.income_year === year);
    assert.equal(cap, Number(base.maximum_contribution_base) * (base.basis === 'quarter' ? 4 : 1), year);
  }
});

const PAY = { year: '2026-27', residency: 'resident', salary: '0', period: 'year', includesSuper: false, sacrifice: '0',
  studyLoan: false, hospitalCover: true };
const pay = (fields) => takeHomePay({ ...PAY, ...fields });
const cents = (value) => Math.round(value * 100);

const datedSalary = (payday, grossSalary, superEarnings = grossSalary) => ({ payday, grossSalary, superEarnings });
const regularSalaryDates = (start, count, interval, salary) => Array.from({ length: count }, (_, i) => {
  const day = new Date(Date.parse(start) + i * interval * 86400000).toISOString().slice(0, 10);
  return datedSalary(day, salary);
});

test('dated take-home super applies the historic maximum to each financial quarter', () => {
  const fields = { year: '2025-26', period: 'fortnight', salary: '10000.00' };
  const annual = pay(fields);
  const dated = pay({ ...fields, datedPay: regularSalaryDates('2025-07-08', 26, 14, fields.salary) });
  assert.equal(annual.superGuarantee, 30000);
  assert.equal(dated.superGuarantee, 29400);
  assert.equal(dated.concessional, 29400);
  assert.equal(dated.division293, 29400);
  assert.equal(dated.net, annual.net);
  assert.deepEqual(dated.withheld, annual.withheld);
});

test('dated take-home super rounds each 2026-27 payday and groups same-day earnings', () => {
  const fields = { period: 'week', salary: '1442.31' };
  assert.equal(pay(fields).superGuarantee, 9000.01);
  assert.equal(pay({ ...fields, datedPay: regularSalaryDates('2026-07-07', 52, 7, fields.salary) }).superGuarantee, 9000.16);
  const splitDay = [datedSalary('2026-07-03', '0.04'), datedSalary('2026-07-03', '0.04')];
  assert.equal(pay({ salary: '0.08', datedPay: splitDay }).superGuarantee, 0.01);
  assert.equal(pay({ salary: '0.08', datedPay: [splitDay[0], datedSalary('2026-07-04', '0.04')] }).superGuarantee, 0);
});

test('dated take-home super applies the annual cap in payday order to qualifying earnings only', () => {
  const datedPay = [
    datedSalary('2027-01-01', '1.00', '0.10'),
    datedSalary('2026-12-31', '11.47', '0.04'),
    datedSalary('2026-07-01', '270829.92'),
  ];
  const r = pay({ salary: '270842.39', datedPay });
  assert.equal(r.superGuarantee, 32499.59);
  assert.equal(r.salary, 270842.39);
  assert.equal(r.overCap, 0);

  // The 8 cents below the cap are grouped and rounded once on the final QE day.
  const sameDay = [datedSalary('2027-01-01', '0.04'), datedSalary('2027-01-01', '0.08'), datedPay[2]];
  assert.equal(pay({ salary: '270830.04', datedPay: sameDay }).superGuarantee, 32499.60);
});

test('dated take-home super rejects contradictory salaries, invalid dates and packages', () => {
  const input = { salary: '100', datedPay: [datedSalary('2026-07-01', '100', '80')] };
  assert.equal(pay(input).superGuarantee, 9.60);
  assert.throws(() => pay({ ...input, includesSuper: true }), /super is paid on top/);
  assert.throws(() => pay({ ...input, salary: '101' }), /add up to the salary/);
  assert.throws(() => pay({ ...input, datedPay: [datedSalary('2027-06-31', '100')] }), /valid payday/);
  assert.throws(() => pay({ ...input, datedPay: [datedSalary('2026-06-30', '100')] }), /valid payday/);
  assert.throws(() => pay({ ...input, datedPay: [datedSalary('2026-07-01', '100', '101')] }), /exceed gross salary/);
  assert.throws(() => pay({ ...input, datedPay: [] }), /at least one dated payment/);
});

test('take-home pay is the salary less the year’s tax, levy and repayment, spread evenly', () => {
  const r = pay({ year: '2025-26', salary: '123457', studyLoan: true });
  assert.equal(cents(r.net), cents(r.salary) - cents(r.tax) + cents(r.offset) - cents(r.medicare) - cents(r.studyLoan));
  assert.equal(r.studyLoan, studyLoanRepayment({ taxable: '123457', fringe: '0', losses: '0', super: '0', foreign: '0' }, '2025-26').repayment);
  assert.equal(r.monthly, Math.round(cents(r.net) / 12) / 100);
  // A package including super splits into salary and super that add back to it.
  const p = pay({ year: '2024-25', salary: '100001', includesSuper: true });
  assert.equal(cents(p.salary) + cents(p.superGuarantee), 10000100);
  assert.equal(p.superGuarantee, 10314);
  // A salary for a month, fortnight or week is 12, 26 or 52 of them.
  for (const [period, salary, year] of [['month', '6250', 75000], ['fortnight', '2884.62', 75000.12], ['week', '1442.31', 75000.12]]) {
    assert.equal(pay({ year: '2025-26', salary, period }).salary, year, period);
  }
});

test('from 2026-27 a resident’s salary has the standard deduction of up to $1,000 (ITAA 1997 s 25-130)', () => {
  const r = pay({ salary: '75000', studyLoan: true });
  assert.equal(r.deduction, 1000);
  assert.equal(r.tax, incomeTax('74000', '2026-27', 'resident').tax);
  assert.equal(r.medicare, 1480);
  assert.equal(pay({ salary: '600' }).deduction, 600);
  const pack = pay({ salary: '1000', includesSuper: true });
  assert.deepEqual([pack.salary, pack.deduction, pack.tax, pack.net], [892.86, 892.86, 0, 892.86]);
  assert.equal(pay({ salary: '150000', studyLoan: true }).studyLoan,
    studyLoanRepayment({ taxable: '149000', fringe: '0', losses: '0', super: '0', foreign: '0' }, '2026-27').repayment);
  for (const [year, residency] of [['2025-26', 'resident'], ['2026-27', 'foreign'], ['2026-27', 'working-holiday']]) {
    assert.equal(pay({ year, residency, salary: '75000' }).deduction, 0, `${year} ${residency}`);
  }
  // The deduction applies to the salary left after the sacrifice.
  assert.equal(pay({ salary: '1500', sacrifice: '800' }).deduction, 700);
});

// ATO: 'Salary sacrificing super' (last updated 21 April 2026), read 18 November 2026: the amount
// sacrificed is not assessable, counts in reportable super contributions and does not reduce the
// super guarantee. The ATO's salary packaging example of Sam (2025-26) gives the tax and Medicare levy
// on his salary less the amounts sacrificed: $5,082.10 and $952.94 on $47,647, $9,044.50 and $1,217.10
// on $60,855.
test('salary sacrificed to super comes off taxable income but counts for the surcharge and study loan', () => {
  for (const [taxable, tax, medicare] of [['47647', 5082.1, 952.94], ['60855', 9044.5, 1217.1]]) {
    const r = incomeTax(taxable, '2025-26', 'resident');
    assert.deepEqual([r.tax, r.medicare], [tax, medicare], taxable);
    const sacrificed = pay({ year: '2025-26', salary: '65000', sacrifice: String(65000 - Number(taxable)) });
    assert.deepEqual([sacrificed.taxable, sacrificed.tax, sacrificed.medicare], [Number(taxable), tax, medicare], taxable);
    assert.equal(sacrificed.superGuarantee, 7800, 'super guarantee on the salary before the sacrifice');
  }
  // $100,000 less $5,000 sacrificed and the $1,000 deduction is $94,000 of taxable income; with the
  // sacrifice, income for surcharge purposes and repayment income are $99,000.
  const r = pay({ salary: '100000', sacrifice: '5000', studyLoan: true, hospitalCover: false });
  assert.equal(r.taxable, 94000);
  assert.equal(r.surcharge, 0, '$99,000 is not above the $105,000 threshold');
  assert.equal(r.studyLoan, studyLoanRepayment({ taxable: '94000', fringe: '0', losses: '0', super: '5000', foreign: '0' },
    '2026-27').repayment);
  const above = pay({ salary: '110000', sacrifice: '4000', hospitalCover: false });
  assert.equal(above.surcharge, 1050, '1% of $105,000 taxable, as $109,000 of income for surcharge purposes is above $105,000');
});

test('concessional contributions above the cap and Division 293 are named, not worked', () => {
  // ATO: 'Division 293 tax on concessional contributions by high-income earners', example of Jan: $240,000
  // of income and $15,000 of contributions make $5,000 of taxable contributions.
  assert.equal(division293(24000000, 1500000), 500000);
  assert.equal(division293(26000000, 1500000), 1500000);
  assert.equal(division293(23500000, 1500000), 0);
  for (const [year, cap] of Object.entries(CONCESSIONAL_CAP)) {
    const r = pay({ year, salary: '200000', sacrifice: String(cap - 2000 * SUPER_GUARANTEE[year].rate + 1) });
    assert.equal(r.overCap, 1, year);
  }
  const under = pay({ salary: '100000', sacrifice: '20500' });
  assert.deepEqual([under.concessional, under.overCap, under.division293], [32500, 0, 0]);
});

// Schedule 1 (published 17 June 2026, read 18 November 2026): all 288 scale 2 and 3 amounts in the ATO's
// withholding amounts sample data. Schedule 8's examples: $2,608.36 a week gives a $193 component and
// $4,409.75 a fortnight $260.
test('PAYG withholding for 2026-27 matches the ATO’s sample data and Schedule 8 examples', () => {
  const sample = JSON.parse(readFileSync(new URL('./payg-withholding-sample.json', import.meta.url), 'utf8'));
  let checked = 0;
  for (const period of ['week', 'fortnight', 'month']) {
    for (const [earnings, scale2, scale3] of sample[period]) {
      const amount = Math.round(Number(earnings) * 100);
      assert.equal(withholding(amount, period, 2, false, '2026-27').tax, scale2, `${period} ${earnings} scale 2`);
      assert.equal(withholding(amount, period, 3, false, '2026-27').tax, scale3, `${period} ${earnings} scale 3`);
      checked += 2;
    }
  }
  assert.equal(checked, 288);
  assert.deepEqual(withholding(260836, 'week', 2, true, '2026-27').studyLoan, 193);
  assert.deepEqual(withholding(440975, 'fortnight', 2, true, '2026-27').studyLoan, 260);
  assert.equal(withholding(260836, 'week', 2, false, '2026-27').studyLoan, 0);
});

// The withholding schedules instruments as made (read 19 November 2026): all 288 scale 2 and 3 amounts in
// each one's sample data, from the 2021 instrument for 2021-22 to 2023-24 (the 2022 and 2023 instruments
// print the same) and the 2024 one for 2024-25 and 2025-26 (as both 2025 instruments do), and each
// instrument's Schedule 8 examples for the tax-free threshold claimed.
test('PAYG withholding for 2021-22 to 2025-26 matches each instrument’s sample data and Schedule 8 examples', () => {
  let checked = 0;
  for (const file of ['./payg-withholding-sample-2020.json', './payg-withholding-sample-2024.json']) {
    const sample = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
    for (const year of sample.years) {
      for (const period of ['week', 'fortnight', 'month']) {
        for (const [earnings, scale2, scale3] of sample[period]) {
          const amount = Math.round(Number(earnings) * 100);
          assert.equal(withholding(amount, period, 2, false, year).tax, scale2, `${year} ${period} ${earnings} scale 2`);
          assert.equal(withholding(amount, period, 3, false, year).tax, scale3, `${year} ${period} ${earnings} scale 3`);
          checked += 2;
        }
      }
    }
  }
  assert.equal(checked, 288 * 5);
  // Above the samples' top: $5,000 a week, x = 5,000.99. Scale 2 is 0.47x − 563.5196 (2020) or − 650.6154 (2024);
  // scale 3 is 0.45x − 380.7692 or − 474.0385.
  const top = (year) => [2, 3].map((scale) => withholding(500000, 'week', scale, false, year).tax);
  assert.deepEqual([top('2021-22'), top('2024-25')], [[1787, 1870], [1700, 1776]]);
  const component =(year, earnings, period) => withholding(earnings, period, 2, true, year).studyLoan;
  assert.deepEqual(['2021-22', '2022-23', '2023-24'].map((year) => [component(year, 109584, 'week'),
    component(year, 235578, 'fortnight'), component(year, 548845, 'month')]), [[22, 70, 191], [22, 58, 165], [11, 48, 139]]);
  assert.deepEqual([component('2024-25', 109584, 'week'), component('2024-25', 245578, 'fortnight'),
    component('2024-25', 568845, 'month')], [11, 50, 143]);
  // 2025-26: the marginal Schedule 8 from 24 September 2025 ($2,608.36 a week, $202; $4,409.75 a fortnight,
  // $274) and the percentage one before it ($1,095.84 a week, $11; $2,455.78 a fortnight, $24; $5,688.45 a
  // month, $113).
  assert.deepEqual([component('2025-26', 260836, 'week'), component('2025-26', 440975, 'fortnight')], [202, 274]);
  const earlier = (earnings, period) => withholding(earnings, period, 2, true, '2025-26').earlierStudyLoan;
  assert.deepEqual([earlier(109584, 'week'), earlier(245578, 'fortnight'), earlier(568845, 'month')], [11, 24, 113]);
  assert.equal(withholding(109584, 'week', 2, false, '2025-26').earlierStudyLoan, 0);
  assert.equal(withholding(109584, 'week', 2, true, '2024-25').earlierStudyLoan, null);
  // Each band starts at its first dollar: $903.99 a week is nil in 2021-22 and $904.00 is 1%, $9.
  assert.deepEqual([component('2021-22', 90399, 'week'), component('2021-22', 90400, 'week')], [0, 9]);
  // Each year has its own thresholds: $950 a week is 1% ($10) in 2022-23 but below 2023-24's $991.
  assert.deepEqual([component('2022-23', 95000, 'week'), component('2023-24', 95000, 'week')], [10, 0]);
  // The 2023 instrument's 3.5% band is printed as ending at $1,44.99; $1,444.99 is 3.5% and $1,445 is 4%.
  assert.deepEqual([component('2023-24', 144499, 'week'), component('2023-24', 144500, 'week')], [51, 58]);
  assert.throws(() => withholding(100000, 'week', 2, false, '2020-21'), /from 2021-22 to 2026-27/);
});

test('take-home pay works withholding for every year’s pays on scale 2 or 3', () => {
  const r = pay({ salary: '3000', period: 'fortnight', sacrifice: '200', studyLoan: true });
  assert.deepEqual(r.withheld, { tax: 534, studyLoan: 20, total: 554, earlierStudyLoan: null, earnings: 2800,
    afterWithholding: 2246, year: 14404, refund: -212.8 });
  assert.equal(cents(r.withheld.refund), r.withheld.year * 100 - (cents(r.tax) - cents(r.offset) + cents(r.medicare)
    + cents(r.surcharge) + cents(r.studyLoan)));
  assert.equal(pay({ salary: '78000', period: 'year' }).withheld, null);
  assert.equal(pay({ residency: 'working-holiday', salary: '3000', period: 'fortnight' }).withheld, null);
  assert.equal(pay({ residency: 'foreign', salary: '1500', period: 'week' }).withheld.tax,
    withholding(150000, 'week', 3, false, '2026-27').tax);
  // 2021-22, $3,000 a fortnight: x = 1,500.99, 0.3450x − 182.7504 = 335.09, so $670 a pay and $17,420 a year.
  // The year's tax is $15,817 less the $1,500 low and middle income tax offset, which withholding leaves to
  // the return, plus $1,560 Medicare levy: $15,877, so $1,543 comes back.
  const early = pay({ year: '2021-22', salary: '3000', period: 'fortnight' });
  assert.deepEqual(early.withheld, { tax: 670, studyLoan: 0, total: 670, earlierStudyLoan: null, earnings: 3000,
    afterWithholding: 2330, year: 17420, refund: 1543 });
  // 2025-26 with a loan: 0.32x − 176.5769 = 303.74, $608 a pay; Schedule 8 from 24 September 2025,
  // 0.15x − 193.2692 = 31.88, $64; before it 3.5% of x, 52.53, $106. A year of $672 pays is $17,472 against
  // $14,188 tax, $1,560 levy and a $1,650 repayment: $74 back.
  const late = pay({ year: '2025-26', salary: '3000', period: 'fortnight', studyLoan: true });
  assert.deepEqual(late.withheld, { tax: 608, studyLoan: 64, total: 672, earlierStudyLoan: 106, earnings: 3000,
    afterWithholding: 2328, year: 17472, refund: 74 });
  assert.equal(pay({ year: '2025-26', salary: '3000', period: 'fortnight' }).withheld.earlierStudyLoan, 0);
});

// Medicare Levy Act 1986 ss 8B to 8D, Private Health Insurance Act 2007 ss 22-30 to 22-45 and the ATO's
// 'Medicare levy surcharge income, thresholds and rates' (last updated 22 June 2026), read 18 November 2026,
// with its example of Tom: $90,000 taxable income and $27,000 of reportable fringe benefits, $1,170.
test('the Medicare levy surcharge follows the tiers, family thresholds and days without cover', () => {
  const mls = (fields) => medicareLevySurcharge({ year: '2026-27', taxable: 0, fringe: 0, super: 0, losses: 0, spouse: null,
    children: 0, uncoveredDays: 365, ...fields });
  assert.equal(mls({ taxable: 90000, fringe: 27000 }).surcharge, 1170);
  for (const [taxable, rate] of [[105000, 0], [105001, 1], [123000, 1], [123001, 1.25], [164000, 1.25], [164001, 1.5]]) {
    assert.equal(mls({ taxable }).rate, rate, String(taxable));
  }
  assert.equal(mls({ taxable: 100000, spouse: 110000, children: 0 }).threshold, 210000);
  assert.equal(mls({ taxable: 100000, spouse: 110000, children: 0 }).surcharge, 0);
  assert.equal(mls({ taxable: 100000, spouse: 110001, children: 0 }).surcharge, 1000);
  assert.equal(mls({ taxable: 100000, children: 1 }).threshold, 210000);
  assert.equal(mls({ taxable: 100000, children: 4 }).threshold, 214500);
  assert.equal(mls({ taxable: 28012, spouse: 300000 }).surcharge, 420.18);
  assert.equal(mls({ taxable: 28011, spouse: 300000 }).surcharge, 0);
  // Section 8D(3)(c) for each year: nil at the year's threshold amount, 1.5% of a dollar more, with the couple above tier 3.
  for (const [year, amount, surcharge] of [['2026-27', 28011, 420.18], ['2025-26', 28011, 420.18], ['2024-25', 27222, 408.35],
    ['2023-24', 26000, 390.02], ['2022-23', 24276, 364.16], ['2021-22', 23365, 350.49], ['2020-21', 23226, 348.41]]) {
    const couple = (taxable) => mls({ year, taxable, spouse: 400000, uncoveredDays: daysInYear(year) }).surcharge;
    assert.equal(couple(amount), 0, year);
    assert.equal(couple(amount + 1), surcharge, year);
  }
  assert.equal(mls({ taxable: 120000, uncoveredDays: 0 }).surcharge, 0);
  assert.deepEqual(INCOME_TAX_YEARS.map(daysInYear), [365, 365, 365, 366, 365, 365, 365]);
  assert.throws(() => mls({ taxable: 1, uncoveredDays: 366 }), { message: 'Enter the days without hospital cover as a whole number from 0 to 365.' });
  for (const [year, singles] of [['2026-27', [105000, 123000, 164000]], ['2025-26', [101000, 118000, 158000]],
    ['2024-25', [97000, 113000, 151000]], ['2023-24', [93000, 108000, 144000]], ['2022-23', [90000, 105000, 140000]],
    ['2021-22', [90000, 105000, 140000]], ['2020-21', [90000, 105000, 140000]]]) {
    assert.deepEqual(SURCHARGE_THRESHOLDS[year], singles, year);
  }
});

test('the estimate is the tax withheld less the year’s tax, levies and repayment', () => {
  const ESTIMATE = { year: '2026-27', residency: 'resident', taxable: '90000', fringe: '27000', super: '0', losses: '0',
    foreign: '0', studyLoan: false, uncoveredDays: '365', spouse: null, children: '0', withheld: '21000' };
  const r = taxEstimate(ESTIMATE);
  assert.deepEqual([r.assessed, r.withheld, r.refund], [20490, 21000, 510]);
  assert.equal(taxEstimate({ ...ESTIMATE, withheld: '20000.01' }).refund, -489.99);
  assert.equal(taxEstimate({ ...ESTIMATE, residency: 'foreign' }).surcharge, 0);
  assert.equal(taxEstimate({ ...ESTIMATE, studyLoan: true }).repaymentIncome, 117000);
  assert.throws(() => taxEstimate({ ...ESTIMATE, withheld: '1.001' }));
  assert.throws(() => taxEstimate({ ...ESTIMATE, studyLoan: 'yes' }), { message: 'Say whether you have a study or training loan.' });
});

test('the engines refuse inputs they cannot work', () => {
  assert.throws(() => incomeTax('50000', '2019-20', 'resident'), { message: 'Choose an income year from 2020-21 to 2026-27.' });
  assert.throws(() => incomeTax('50000', '2026-27', 'part-year'),
    { message: 'Choose Australian resident, foreign resident or working holiday maker.' });
  for (const value of ['', '-1', '50000.50', '1e5', '1000000001']) assert.throws(() => incomeTax(value, '2026-27', 'resident'));
  assert.throws(() => studyLoanRepayment({ taxable: '1', fringe: '0', losses: '0', super: '0', foreign: '0' }, '2019-20'),
    { message: 'Choose an income year from 2020-21 to 2026-27.' });
  assert.throws(() => studyLoanRepayment({ taxable: '1', fringe: '0', losses: '0', super: '0' }, '2026-27'));
  assert.throws(() => pay({ salary: '1', includesSuper: 'yes' }), { message: 'Say whether the salary includes super.' });
  assert.throws(() => pay({ year: '2020-21', salary: '1' }), { message: 'Choose an income year from 2021-22 to 2026-27.' });
  assert.throws(() => pay({ salary: '1', period: 'quarter' }), { message: 'Choose a year, month, fortnight or week.' });
  assert.throws(() => pay({ salary: '1000', sacrifice: '1000.01' }), { message: 'Enter salary sacrifice no more than the salary.' });
  assert.throws(() => pay({ salary: '1', hospitalCover: 'no' }),
    { message: 'Say whether you had private patient hospital cover all year.' });
});

test('the take-home page says the amounts are not the PAYG withholding schedules', () => {
  const html = readFileSync(new URL('../_includes/calculators/take-home-pay.html', import.meta.url), 'utf8');
  assert.match(html, /not the amounts an employer withholds/);
});

for (const page of Object.keys(shownCases)) {
  test(`the ${page} page opens on the result its calculation gives for the form’s inputs`, () => {
    const html = readFileSync(new URL(`../_includes/calculators/${page}.html`, import.meta.url), 'utf8');
    const example = html.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/);
    const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
    const defaults = formDefaults(html);
    const fields = page === 'fhss' ? fhssExampleFields(defaults) : page === 'work-expenses' ? { ...defaults, scope: 'yes' } : defaults;
    // The browser reads a field through form.elements, which has no entry for a name the form lacks.
    const value = (name) => {
      assert.ok(Object.hasOwn(fields, name), `${page} reads ${name}, which its form does not have`);
      return fields[name] ?? '';
    };
    const result = page === 'fhss' ? fhssResult(value, aud) : page === 'work-expenses' ? workExpensesResult(value, aud)
      : individualResult(page, value, aud);
    assert.equal(result.inputs, example[1]);
    assert.equal(result.rows.map((row) => row.join('|')).join(';'), example[2]);
    assert.equal(String(result.principal), example[3]);
    assert.equal(result.note, example[4]);
  });
}

test('a form that is not an individual tax calculator gets no result, whatever its name', () => {
  for (const kind of ['gst', 'constructor', 'toString', '__proto__']) {
    assert.equal(individualResult(kind, () => '0', String), undefined, kind);
  }
});

const SUPER = { age: '30', retire: '67', balance: '50000', salary: '80000', employer: '12', sacrifice: '0', afterTax: '0',
  returnRate: '6.1', percentFee: '0.11', adminFee: '59', insurance: '599', growth: '3.7', discount: '3.7' };
const project = (fields) => superProjection({ ...SUPER, ...fields });

// Worked by hand: $50,000, $9,600 from the employer less $1,440 tax, $59 and $599 out, so $7,502 of net flows;
// 6.1% and 0.11% of $53,751 are $3,278.81 and $59.13; 15% of the $717.13 of fees is deducted.
test('super projection works one year by hand', () => {
  const r = project({ age: '66' });
  assert.deepEqual([r.employer, r.contributed, r.earnings, r.fees, r.balance], [9600, 8160, 3278.81, 609.56, 60829.25]);
  assert.equal(r.present, 58658.87);
});

test('super projection adds up: the balance is the start plus contributions and earnings less fees', () => {
  for (const fields of [{}, { sacrifice: '22900' }, { employer: '0', afterTax: '5000' }, { age: '45', retire: '60' }]) {
    const r = project(fields);
    assert.equal(Math.round((50000 + r.contributed + r.earnings - r.fees) * 100), Math.round(r.balance * 100));
  }
});

// ASIC Corporations (Superannuation Calculators and Retirement Estimates) Instrument 2022/603, s 4 'present value'.
test('super projection discounts the final balance at the Instrument’s 3.7% for each year', () => {
  const r = project({});
  assert.equal(r.years, 37);
  assert.equal(r.present, Math.round((r.balance / 1.037 ** 37) * 100) / 100);
  assert.equal(project({ discount: '0' }).present, r.balance);
});

// Instrument 2022/603, s 4 'assumed retirement age': the greater of the age entered and the preservation age, 60.
test('super projection takes a retirement age under 60 as the preservation age', () => {
  const early = project({ age: '45', retire: '55' });
  assert.deepEqual([early.retire, early.years], [60, 15]);
  assert.deepEqual(early, project({ age: '45', retire: '60' }));
  assert.throws(() => project({ age: '60', retire: '59' }), /after your current age/);
});

test('super projection pays the employer rate only up to the maximum contribution base', () => {
  assert.equal(project({ salary: '270830' }).employer, 32499.6);
  assert.equal(project({ salary: '300000', employer: '10' }).employer, 27083);
  assert.equal(project({ salary: '400000' }).employer, 32499.6);
  assert.equal(project({ employer: '15' }).employer, 12000);
});

test('super projection grows salary, contributions, fees and premiums with wages after the first year', () => {
  const flat = project({ age: '65', returnRate: '0', percentFee: '0', growth: '0', discount: '0' });
  const grown = project({ age: '65', returnRate: '0', percentFee: '0', growth: '10', discount: '0' });
  assert.equal(grown.contributed - flat.contributed, 816);
  assert.equal(Math.round((grown.fees - flat.fees) * 100), Math.round(65.8 * 85));
});

test('super projection lets fees take no more than the account holds', () => {
  const r = project({ balance: '1000', salary: '0', employer: '0' });
  assert.equal(r.balance, 0);
  assert.equal(Math.round((1000 + r.earnings) * 100), Math.round(r.fees * 100));
});

test('super projection refuses what it does not compute', () => {
  assert.throws(() => project({ retire: '14' }), /between 15 and 75/);
  assert.throws(() => project({ retire: '76' }), /between 15 and 75/);
  assert.throws(() => project({ age: '67', retire: '67' }), /after your current age/);
  assert.throws(() => project({ age: '14' }), /between 15 and 74/);
  assert.throws(() => project({ sacrifice: '22900.01' }), /above the \$32,500 cap/);
  assert.equal(project({ sacrifice: '22900' }).concessional, 32500);
  assert.throws(() => project({ afterTax: '130000.01' }), /above the \$130,000 cap/);
  assert.throws(() => project({ returnRate: '20.01' }), /between 0 and 20/);
  assert.throws(() => project({ employer: '30.01' }), /between 0 and 30/);
  assert.throws(() => project({ percentFee: '0.111' }), /2 decimal places/);
  assert.throws(() => project({ salary: '80000.5' }), /whole number/);
});

const PACK = { year: '2026-27', residency: 'resident', employer: 'charity', salary: '80000', typeTwo: '0', typeOne: '0', meals: '0',
  mealsTypeOne: true, studyLoan: false, hospitalCover: true };
const pack = (fields) => salaryPackaging({ ...PACK, ...fields });

// The ATO's Fringe benefits tax – a guide for employers, chapter 6, section 6.10 (read 19 November 2026): a health
// promotion charity employee with a $7,700 Type 1 car, $9,000 of Type 2 benefits and $3,300 of meal entertainment.
test('salary packaging gives the FBT in the ATO’s worked example', () => {
  const r = pack({ typeOne: '7700', typeTwo: '9000', meals: '3300', mealsTypeOne: false });
  assert.deepEqual([r.grossedTypeOne, r.grossedTypeTwo, r.grossed, r.mealAllowance, r.excess, r.fbt],
    [16018, 23208, 39226, 5000, 4226, 1986.22]);
});

test('salary packaging rounds each grossed-up total to the dollar against the cap', () => {
  assert.equal(pack({ typeTwo: '15900.20' }).excess, 0);
  assert.equal(pack({ typeTwo: '15900.21' }).fbt, 0.47);
  assert.equal(pack({ employer: 'hospital', typeTwo: '9009.96' }).excess, 0);
  assert.equal(pack({ employer: 'hospital', typeTwo: '9010.23' }).excess, 1);
  assert.equal(pack({ typeOne: '1000' }).grossedTypeOne, 2080);
});

test('salary packaging lets up to $5,000 of meal entertainment over the cap and no more', () => {
  const within = pack({ typeTwo: '15899.93', meals: '2403.61' });
  assert.deepEqual([within.grossedMeals, within.mealAllowance, within.fbt], [5000, 5000, 0]);
  const over = pack({ typeTwo: '20000', meals: '3000' });
  assert.equal(over.mealAllowance, 5000);
  assert.equal(over.excess, 37736 + 6241 - 30000 - 5000);
  assert.equal(pack({ meals: '3000' }).mealAllowance, 0);
});

test('salary packaging reports benefits over $2,000 grossed up at 1 / 0.53, cents dropped', () => {
  assert.equal(pack({ typeTwo: '2000' }).reportable, 0);
  assert.equal(pack({ typeTwo: '2000.01' }).reportable, 3773);
  assert.equal(pack({ typeTwo: '15899.93' }).reportable, 29999);
  assert.equal(pack({ typeOne: '3000', meals: '2000' }).reportable, 9433);
});

test('salary packaging adds the reportable amount for the surcharge and the study loan', () => {
  const r = pack({ salary: '100000', typeTwo: '15899.93', studyLoan: true, hospitalCover: false });
  assert.ok(r.surchargeAfter > 0);
  assert.ok(r.studyLoanAfter > 0);
  assert.equal(pack({ salary: '100000', typeTwo: '15899.93' }).surchargeAfter, 0);
});

test('salary packaging takes the standard deduction only from 2026-27 and for a resident', () => {
  assert.equal(pack({}).taxableBefore, 79000);
  assert.equal(pack({ year: '2025-26' }).taxableBefore, 80000);
  assert.equal(pack({ residency: 'foreign' }).taxableBefore, 80000);
});

test('salary packaging refuses what it does not compute', () => {
  assert.throws(() => pack({ year: '2021-22' }), { message: 'Choose an income year from 2022-23 to 2026-27.' });
  assert.throws(() => pack({ residency: 'working-holiday' }), { message: 'Choose an Australian resident or a foreign resident.' });
  assert.throws(() => pack({ employer: 'rebatable' }), /public benevolent institution/);
  assert.throws(() => pack({ studyLoan: 'yes' }), { message: 'Answer each yes or no question.' });
  assert.throws(() => pack({ salary: '1000', typeTwo: '1000.01' }), { message: 'The benefits packaged cannot exceed the salary.' });
  assert.throws(() => pack({ typeTwo: '-1' }), /between 0/);
});

const LEASE = { year: '2026-27', residency: 'resident', salary: '100000', studyLoan: false, hospitalCover: true, kind: 'bev',
  firstUsed: '2022-07-01', commitment: false, saleYear: '2026-27', price: '60000', otherSupply: false, reduced: false, days: '365',
  gstCosts: '15000', otherCosts: '1000' };
const lease = (fields) => novatedLease({ ...LEASE, ...fields });

test('novated lease tests each condition of the electric car exemption', () => {
  assert.equal(lease({}).exempt, true);
  assert.equal(lease({ kind: 'fcev' }).exempt, true);
  assert.equal(lease({ kind: 'other' }).reason, 'it is not a battery electric or hydrogen fuel cell car');
  assert.match(lease({ kind: 'phev' }).reason, /only under a commitment/);
  assert.equal(lease({ kind: 'phev', commitment: true, saleYear: '2024-25' }).exempt, true);
  // A plug-in hybrid in use before 1 April 2025 cannot have been first sold after 2024-25.
  assert.throws(() => lease({ kind: 'phev', commitment: true, saleYear: '2025-26' }), /first sold by 2024-25/);
  assert.throws(() => lease({ kind: 'phev', commitment: true, firstUsed: '2025-04-01', saleYear: '2024-25' }), /use before 1 April 2025/);
  assert.equal(lease({ kind: 'phev', year: '2024-25', saleYear: '2024-25' }).exempt, true);
  assert.equal(lease({ firstUsed: '2022-06-30', saleYear: '2021-22' }).reason, 'it was first held and used before 1 July 2022');
  let atThreshold;
  assert.doesNotThrow(() => { atThreshold = lease({ price: '91661', gstCosts: '25000' }); });
  assert.equal(atThreshold.exempt, true);
  assert.equal(lease({ price: '91661.01', gstCosts: '25000', days: '274', lctTiming: 'before-all' }).reason, 'luxury car tax was payable on its first retail sale');
  assert.equal(lease({ saleYear: '2025-26', price: '91387.01', gstCosts: '25000', lctTiming: 'before-all' }).exempt, false);
  assert.equal(lease({ saleYear: '2025-26', price: '91387', gstCosts: '25000' }).exempt, true);
  assert.equal(lease({ otherSupply: true, lctTiming: 'before-all' }).reason, 'luxury car tax became payable on another supply or an importation of it');
});

test('novated lease applies luxury car tax at the time of the counted benefits', () => {
  // A taxable first retail sale on 1 April 2026 follows every benefit in the FBT year ending 31 March 2026.
  const sale = { year: '2025-26', saleYear: '2025-26', firstUsed: '2025-04-01', price: '100000', gstCosts: '25000' };
  assert.equal(lease({ ...sale, lctTiming: 'after-all' }).exempt, true);
  assert.equal(lease({ ...sale, days: '274', lctTiming: 'before-all' }).exempt, false);
  assert.throws(() => lease({ ...sale, days: '275', lctTiming: 'before-all' }), /cannot be before all/);
  assert.throws(() => lease(sale), /one treatment for the year/);
  assert.throws(() => lease({ ...sale, lctTiming: 'mixed-or-unknown' }), /one treatment for the year/);
  assert.equal(lease({ otherSupply: true, lctTiming: 'after-all' }).exempt, true);
  assert.throws(() => lease({ otherSupply: true, lctTiming: 'mixed-or-unknown' }), /one treatment for the year/);
  const previousSale = { ...sale, saleYear: '2023-24' };
  assert.equal(lease(previousSale).exempt, false);
  assert.throws(() => lease({ ...previousSale, lctTiming: 'after-all' }), /before this FBT year/);
  const overlappingSale = { ...sale, saleYear: '2024-25', lctTiming: 'after-all' };
  assert.equal(lease({ ...overlappingSale, days: '91' }).exempt, true);
  assert.throws(() => lease({ ...overlappingSale, days: '92' }), /cannot be after all/);
  // Private availability can precede the car's first use.
  assert.equal(lease({ ...overlappingSale, firstUsed: '2025-07-01', days: '1' }).exempt, true);
  const laterSale = { ...sale, saleYear: '2026-27' };
  assert.equal(lease(laterSale).exempt, true);
  assert.equal(lease({ ...laterSale, lctTiming: 'mixed-or-unknown' }).exempt, true);
  assert.throws(() => lease({ ...laterSale, lctTiming: 'before-all' }), /cannot be before all/);
  assert.throws(() => lease({ lctTiming: 'before-all' }), /timing needs a taxable first retail sale/);
  assert.throws(() => lease({ lctTiming: 'after-all' }), /timing needs a taxable first retail sale/);
  assert.throws(() => lease({ kind: 'other', lctTiming: 'before-all' }), /timing needs a taxable first retail sale/);
  assert.match(lease({ ...sale, otherSupply: true, lctTiming: 'before-all' }).reason, /before the benefits/);
});

// The ATO's Luxury car tax rate and thresholds (last updated 1 June 2026, read 19 November 2026).
test('novated lease uses the ATO’s fuel-efficient luxury car tax thresholds', () => {
  assert.deepEqual(FUEL_EFFICIENT_THRESHOLD, { '2026-27': 91661, '2025-26': 91387, '2024-25': 91387, '2023-24': 89332,
    '2022-23': 84916, '2021-22': 79659 });
});

test('novated lease values the car by the statutory formula over the days available', () => {
  assert.equal(lease({}).taxableValue, 12000);
  assert.equal(lease({ reduced: true }).taxableValue, 8000);
  assert.equal(lease({ days: '182' }).taxableValue, 5983.56);
  assert.equal(lease({ year: '2023-24', saleYear: '2023-24' }).taxableValue, 11967.21);
  assert.equal(lease({ days: '0' }).taxableValue, 0);
});

test('novated lease counts availability from first use through 31 March inclusive', () => {
  const boundary = { year: '2025-26', saleYear: '2025-26', firstUsed: '2026-03-31', days: '1' };
  assert.equal(lease(boundary).exempt, true);
  assert.equal(lease(boundary).taxableValue, 32.88);
  assert.throws(() => lease({ ...boundary, firstUsed: '2026-04-01' }), /no car benefit in the FBT year/);
  assert.throws(() => lease({ ...boundary, days: '2' }), /cannot exceed 1 between first use and 31 March 2026/);
  assert.equal(lease({ ...boundary, year: '2023-24', saleYear: '2023-24', firstUsed: '2024-02-29', days: '32' }).taxableValue, 1049.18);
  assert.throws(() => lease({ ...boundary, firstUsed: '2026-02-29' }), /as a calendar date/);
});

test('novated lease splits the costs as the exemption or the employee contribution method requires', () => {
  const r = lease({});
  assert.equal(r.netCosts, 14636.36);
  assert.deepEqual([r.exemptCase.preTax, r.exemptCase.postTax, r.exemptCase.reportable], [14636.36, 0, 22641]);
  assert.deepEqual([r.contribution.preTax, r.contribution.postTax, r.contribution.reportable], [3727.27, 12000, 0]);
  assert.equal(r.exemptCase.saving, 6047.48);
  assert.equal(r.contribution.saving, 1465.69);
  assert.equal(lease({ kind: 'other' }).exemptCase, null);
  assert.equal(lease({ days: '0' }).exemptCase.reportable, 0);
});

test('novated lease refuses what it does not compute', () => {
  assert.throws(() => lease({ year: '2022-23', saleYear: '2022-23' }), { message: 'Choose an income year from 2023-24 to 2026-27.' });
  assert.throws(() => lease({ kind: 'diesel' }), { message: 'Choose the kind of car.' });
  assert.throws(() => lease({ firstUsed: 'later' }), { message: 'Enter the date the car was first held and used as a calendar date.' });
  assert.throws(() => lease({ saleYear: '2027-28' }), /first retail sale, from 2021-22 to 2026-27/);
  assert.throws(() => lease({ price: '0' }), { message: 'Enter the car’s cost price.' });
  assert.throws(() => lease({ salary: '10000', gstCosts: '15000' }), { message: 'The car’s costs cannot exceed the salary.' });
  assert.throws(() => lease({ kind: 'other', gstCosts: '1000' }), /cannot cover it/);
  assert.throws(() => lease({ commitment: 'no' }), { message: 'Answer each yes or no question.' });
  assert.throws(() => lease({ otherSupply: undefined }), { message: 'Answer each yes or no question.' });
  assert.throws(() => lease({ days: '367' }), /between 0/);
});

const BONUS = { period: 'week', residency: 'resident', studyLoan: false, method: 'A', earnings: '0', additional: '0', spread: '52',
  backPays: '0', backEarnings: '0', backEach: '0', backWithheld: '0', yearToDate: '0', paysToDate: '1', earlierAdditional: '0',
  earlierWithheld: '0' };
const bonus = (fields) => bonusWithholding({ ...BONUS, ...fields });

// Schedule 5, 'Withholding amounts examples' (published 17 June 2026), read 19 November 2026: each step of example 1.
test('Method A gives each step of the ATO’s example 1, Jarrod, with and without HELP', () => {
  const plain = bonus({ earnings: '1400', additional: '900' });
  assert.deepEqual([plain.step1, plain.step2.tax, plain.step3, plain.step4, plain.step5.tax, plain.step7.tax, plain.limit],
    [1400, 267, 17, 1417, 272, 260, 423]);
  const help = bonus({ earnings: '1400', additional: '900', studyLoan: true });
  assert.deepEqual([help.step2.studyLoan, help.step5.studyLoan, help.step7.studyLoan, help.onAdditional, help.total],
    [10, 12, 104, 364, 641]);
});

test('the 47% limit applies to the additional payment with its study loan component, cents ignored', () => {
  const r = bonus({ earnings: '4000', additional: '5200.99', studyLoan: true });
  assert.equal(r.step7.total, 2964);
  assert.equal(r.limit, 2444.46);
  assert.equal(r.onAdditional, 2444);
  assert.equal(r.total, r.step2.total + 2444);
  // Method B(i) has no limit: with nothing withheld before, the earlier pay's whole withholding is more than 47%.
  const back = bonus({ method: 'B', earnings: '4000', backPays: '1', backEarnings: '4000', backEach: '5200', backWithheld: '0' });
  assert.ok(back.methodBi.onBackPayment > 5200 * 0.47);
});

test('Method B(ii) averages this pay’s B(i) back payment into the earnings to date, as example 4 does', () => {
  const r = bonus({ method: 'B', period: 'month', studyLoan: true, earnings: '7000', backPays: '2', backEarnings: '6200',
    backEach: '800', backWithheld: '1257', additional: '8800', yearToDate: '19400', paysToDate: '3' });
  assert.equal(r.methodBii.step1, 7000);
  assert.deepEqual([r.methodBii.step7.tax, r.methodBii.step7.studyLoan], [2808, 1296]);
  assert.equal(r.total, 6492);
});

test('the bonus calculator refuses what Schedule 5 or its scales here do not cover', () => {
  assert.throws(() => bonus({ period: 'year', additional: '1' }), { message: 'Choose weekly, fortnightly or monthly pay.' });
  assert.throws(() => bonus({ residency: 'working-holiday', additional: '1' }), /tax-free threshold or a foreign resident/);
  assert.throws(() => bonus({ studyLoan: 'no', additional: '1' }), { message: 'Say whether the payee has a study or training loan.' });
  assert.throws(() => bonus({ method: 'C', additional: '1' }), { message: 'Choose Method A or Method B.' });
  assert.throws(() => bonus({}), { message: 'Enter the additional payment.' });
  assert.throws(() => bonus({ additional: '1', spread: '1' }), /between 2 and 52/);
  assert.throws(() => bonus({ period: 'month', additional: '1', spread: '13' }), /between 2 and 12/);
  assert.throws(() => bonus({ method: 'B' }), /back payment for earlier pays this year or another additional payment/);
  assert.throws(() => bonus({ method: 'B', backPays: '53' }), /between 0 and 52/);
  assert.throws(() => bonus({ method: 'B', backPays: '2' }), { message: 'Enter the back payment for each earlier pay.' });
  assert.throws(() => bonus({ method: 'B', earnings: '100', additional: '1', yearToDate: '99' }),
    { message: 'Enter normal earnings to date that include this pay.' });
  // The first failure wins: a missing payment before a bad spread, a missing B(i) amount before a bad B(ii) count.
  assert.throws(() => bonus({ spread: '1' }), { message: 'Enter the additional payment.' });
  assert.throws(() => bonus({ method: 'B', backPays: '2', additional: '1', paysToDate: '0' }),
    { message: 'Enter the back payment for each earlier pay.' });
});

const D293 = { year: '2026-27', interests: 'accumulation', taxable: '0', fringe: '0', losses: '0', trust: '0', fhss: '0', lumpSum: '0',
  concessional: '0', unused: '0', balanceUnder: false };
const d293 = (fields) => division293Tax({ ...D293, ...fields });

// ATO, 'Division 293 tax on concessional contributions by high-income earners' (last updated 24 August 2026), read 19 November 2026.
test('Division 293 gives the ATO’s example: Jan’s $255,000 is $5,000 over, taxed at 15%', () => {
  const r = d293({ taxable: '240000', concessional: '15000' });
  assert.deepEqual([r.combined, r.over, r.taxable, r.tax], [255000, 5000, 5000, 750]);
});

test('Division 293 income adds the surcharge measure’s parts without reportable super contributions', () => {
  // s 995-1: taxable income less FHSS, plus family trust distribution tax income, fringe benefits and net investment loss,
  // less a zero-rate lump sum.
  const r = d293({ year: '2023-24', taxable: '200000', fringe: '10000', losses: '15000', trust: '20000', fhss: '5000',
    lumpSum: '3000' });
  assert.equal(r.income, 237000);
  // Taxable income without an FHSS amount larger than it is nil, as the income tests page takes it.
  assert.equal(d293({ taxable: '1000', fhss: '1500', fringe: '300' }).income, 300);
  assert.throws(() => d293({ year: '2023-24', taxable: '1000', fhss: '600', lumpSum: '401' }), /cannot exceed taxable income less/);
  // s 301-20 taxes a lump sum at 0% only from preservation age to under 60: nobody from 2024-25.
  assert.equal(d293({ year: '2023-24', taxable: '1000', lumpSum: '1000' }).income, 0);
  assert.throws(() => d293({ year: '2024-25', taxable: '1000', lumpSum: '1' }), /From 2024-25 nobody under 60/);
});

test('Division 293 leaves out the excess over the cap unless unused cap carried forward covers it', () => {
  const plain = d293({ taxable: '210000', fringe: '33000', concessional: '45000' });
  assert.deepEqual([plain.cap, plain.excess, plain.low, plain.taxable, plain.tax], [32500, 12500, 32500, 25500, 3825]);
  // s 291-20(3) and (4): only with a balance under $500,000, and by no more than the excess.
  const carried = d293({ taxable: '210000', fringe: '33000', concessional: '45000', unused: '20000', balanceUnder: true });
  assert.deepEqual([carried.carried, carried.excess, carried.low, carried.tax], [12500, 0, 45000, 5700]);
  assert.equal(d293({ taxable: '210000', fringe: '33000', concessional: '45000', unused: '20000' }).tax, 3825);
  assert.equal(d293({ taxable: '100000', concessional: '20000', unused: '20000', balanceUnder: true }).carried, 0);
  assert.equal(d293({ year: '2021-22', concessional: '30000' }).excess, 2500);
});

test('Division 293 taxes only what exceeds $250,000 and nothing without low tax contributions', () => {
  const at = d293({ taxable: '235000', concessional: '15000' });
  assert.deepEqual([at.taxable, at.room], [0, 0]);
  assert.equal(d293({ taxable: '200000', concessional: '20000' }).room, 30000);
  assert.equal(d293({ taxable: '300000', concessional: '25000' }).taxable, 25000);
  assert.equal(d293({ taxable: '400000' }).tax, 0);
  // Only the part within the cap is a low tax contribution.
  assert.equal(d293({ taxable: '400000', concessional: '40000', year: '2025-26' }).taxable, 30000);
});

test('the Division 293 calculator refuses what it does not cover', () => {
  assert.throws(() => d293({ year: '2027-28' }), { message: 'Choose an income year from 2021-22 to 2026-27.' });
  assert.throws(() => d293({ year: '2020-21' }), { message: 'Choose an income year from 2021-22 to 2026-27.' });
  assert.throws(() => d293({ interests: 'other' }), /Subdivisions 293-D to 293-F/);
  assert.throws(() => d293({ balanceUnder: 'yes' }), { message: 'Say whether your total super balance was under $500,000.' });
  assert.throws(() => d293({ taxable: '1.5' }), /whole number/);
  assert.throws(() => d293({ concessional: '-1' }), /between 0/);
  assert.throws(() => d293({ unused: 'x' }), /digits only/);
});

const arrears = (year, taxable, accrual, gain = '0') => lumpSumArrears({ year, resident: true, otherAmounts: false, taxable, gain,
  accrual: accrual.map(([y, amount, income, more]) => ({ year: y, arrears: amount, ...(income ? { taxable: income } : {}),
    ...more })) });

// ATO, 'Lump sum payment in arrears' (last updated 8 June 2026, read 19 November 2026): the ATO names a year by its
// end, so its 2017 is 2016-17. Anthony's 2016-17 taxable income is not given: $100,000 keeps it in the 37% band.
test('Anthony’s offset is his arrears at 45% in 2025-26 less 37% in 2016-17', () => {
  const r = arrears('2025-26', '314166', [['2016-17', '43979', '100000']], '111231');
  assert.deepEqual([r.testIncome, r.tenPercent, r.met], [158956, 15895.6, true]);
  assert.deepEqual([r.taxOnArrears, r.notional[0].amount, r.offset], [19790.55, 16272.23, 3518.32]);
});

test('Sudeep’s arrears below 10% of the rest of his income get no offset, and exactly 10% does', () => {
  const sudeep = arrears('2025-26', '53000', [['2023-24', '3500', '50000']]);
  assert.deepEqual([sudeep.tenPercent, sudeep.met, sudeep.offset, sudeep.taxOnArrears], [4950, false, 0, null]);
  // $5,000 of arrears on $55,000 leaves $50,000, whose 10% is $5,000: the test is met.
  assert.equal(arrears('2025-26', '55000', [['2023-24', '5000', '50000']]).met, true);
  assert.equal(arrears('2025-26', '55001', [['2023-24', '5000', '50000']]).met, false);
});

test('Yan’s distant years take the average of the 2 recent years’ rates, each rounded as s 159ZRD says', () => {
  const r = arrears('2025-26', '100000', [['2023-24', '3000', '30000'], ['2022-23', '2500', '17000'], ['2021-22', '1400'],
    ['2020-21', '1700'], ['2019-20', '1400'], ['2018-19', '1000']]);
  assert.deepEqual(r.rates, { mostRecent: 0.19, secondMostRecent: 0.099, average: 0.1445 });
  assert.deepEqual([r.distant.amount, r.notionalTotal, r.offset], [794.75, 1611.75, 1688.25]);
  // 0.0985 rises to 0.099 and 0.0984 stays 0.098 (s 159ZRD(2) and (3)).
  const fourth = arrears('2025-26', '40000', [['2023-24', '3800', '16370'], ['2022-23', '3800', '16368'], ['2021-22', '1000']]);
  assert.deepEqual([fourth.rates.mostRecent, fourth.rates.secondMostRecent, fourth.distant.amount], [0.099, 0.098, 98.5]);
});

// s 159ZRD(1): every distant year takes the same average rate, so the form's note to put the oldest years' total in
// its last row, when there are more than 6 accrual years, gives the offset the years entered one by one give.
test('distant years entered together give the offset they give one by one', () => {
  const recent = [['2023-24', '3000', '30000'], ['2022-23', '2500', '17000']];
  const apart = arrears('2025-26', '100000', [...recent, ['2021-22', '1400'], ['2020-21', '1700'], ['2019-20', '1400'],
    ['2018-19', '1000'], ['2017-18', '800']]);
  const together = arrears('2025-26', '100000', [...recent, ['2021-22', '1400'], ['2020-21', '1700'], ['2019-20', '1400'],
    ['2018-19', '1800']]);
  assert.deepEqual([together.distant.amount, together.offset], [apart.distant.amount, apart.offset]);
  // 11,800 at 30% is 3,540, less 570, 247 and 6,300 at 0.1445 (910.35).
  assert.equal(apart.offset, 1812.65);
});

test('recent years use taxable income and the distant years’ rate normal taxable income', () => {
  const r = arrears('2025-26', '60000', [['2023-24', '3000', '50000', { gain: '10000' }], ['2022-23', '2500', '17000'],
    ['2021-22', '1000']]);
  assert.deepEqual([r.notional[0].amount, r.rates.mostRecent, r.distant.amount, r.offset], [975, 0.19, 144.5, 583.5]);
});

test('a recent rebate year is adjusted both ways, and the repair levy adds 2% above $180,000 in 2016-17 only', () => {
  const rebate = arrears('2025-26', '30000', [['2023-24', '3000', '46000', { rebateYearArrears: '4000', earlierRebateArrears: '1000' }]]);
  assert.equal(rebate.notional[0].amount, 705);
  assert.equal(arrears('2025-26', '100000', [['2016-17', '10000', '200000']]).notional[0].amount, 4700);
  assert.equal(arrears('2025-26', '100000', [['2017-18', '10000', '200000']]).notional[0].amount, 4500);
  assert.equal(arrears('2025-26', '100000', [['2014-15', '10000', '175000']]).notional[0].amount, 4200);
});

test('the earlier scales are the ATO’s resident tables from 2012-13', () => {
  const top = (year, income) => arrears('2025-26', '1', [[year, '1', String(income - 1)]]).notional[0].amount;
  for (const [year, bands] of [['2012-13', [37000, 80000]], ['2015-16', [37000, 80000]], ['2017-18', [37000, 87000]],
    ['2019-20', [37000, 90000]], ['2020-21', [45000, 120000]]]) {
    assert.equal(top(year, bands[0]), 0.19, year);
    assert.equal(top(year, bands[0] + 1), 0.33, year);
    assert.equal(top(year, bands[1]), 0.33, year);
    assert.equal(top(year, bands[1] + 1), 0.37, year);
  }
  assert.equal(top('2018-19', 18200), 0);
});

test('lump sum in arrears refuses what it cannot work', () => {
  const ok = [['2023-24', '3000', '30000']];
  for (const [call, message] of [
    [() => lumpSumArrears({ year: '2023-24', resident: true, taxable: '1', gain: '0', accrual: [] }), 'Choose 2024-25, 2025-26, 2026-27.'],
    [() => lumpSumArrears({ year: '2025-26', resident: false, taxable: '1', gain: '0', accrual: [] }), /only for a person resident/],
    [() => lumpSumArrears({ year: '2025-26', resident: 'yes', taxable: '1', gain: '0', accrual: [] }), /Say whether the person/],
    [() => lumpSumArrears({ year: '2025-26', resident: true, taxable: '1', gain: '0', accrual: [] }),
      /Say whether an employment termination payment, unused leave paid on termination, a super benefit/],
    [() => lumpSumArrears({ year: '2025-26', resident: true, otherAmounts: true, taxable: '1', gain: '0', accrual: [] }),
      /does not work the offset when an employment termination payment.* is in the year of receipt or a recent accrual year/],
    [() => arrears('2025-26', '1.5', ok), 'Enter taxable income in whole dollars, from 0 to 1000000000.'],
    [() => arrears('2025-26', '1000', []), 'Give each earlier income year in which part of the arrears accrued.'],
    [() => arrears('2025-26', '1000', [['2023-2024', '1', '1']]), /such as 2023-24/],
    [() => arrears('2025-26', '1000', [['2025-26', '1', '1']]), /2025-26 is not before the year of receipt/],
    [() => arrears('2025-26', '1000', [['2023-24', '0', '1']]), 'Leave out 2023-24: no arrears accrued in it.'],
    [() => arrears('2025-26', '1000', [['2023-24', '1', '1'], ['2023-24', '1', '1']]), /given more than once/],
    [() => arrears('2025-26', '1000', [['2023-24', '1']]), 'Enter 2023-24’s taxable income: it is a recent accrual year.'],
    [() => arrears('2025-26', '1000', [['2023-24', '1', '1', { gain: '1' }]]), /Leave out 2023-24’s net capital gain/],
    [() => arrears('2025-26', '1000', [['2023-24', '1', '1'], ['2022-23', '1', '1'], ['2021-22', '1', '1']]),
      /2021-22 is a distant accrual year/],
    [() => arrears('2025-26', '1000', [['2011-12', '1000', '1']]), /holds resident rates from 2012-13 only/],
  ]) {
    assert.throws(call, { message }, String(message));
  }
  // Below the 10% test the rates of a recent year before 2012-13 are not needed.
  assert.equal(arrears('2025-26', '100000', [['2005-06', '1000', '1']]).offset, 0);
});

test('the lump sum in arrears form needs a year for each slot it fills', () => {
  const fields = { year: '2025-26', resident: 'yes', taxable: '1000', gain: '0', 'earlier-2-arrears': '5' };
  assert.throws(() => individualResult('lump-sum-arrears', (name) => fields[name] ?? '', String),
    { message: 'Enter the income year of each accrual year you fill in, such as 2023-24.' });
});

// australian-tax-calculators 1.0.0, the release the page ports: see the fixture's engine line.
test('lump sum in arrears agrees with the australian-accounting engine on every differential case', () => {
  const { cases } = JSON.parse(readFileSync(new URL('./lump-sum-arrears-engine-differential.json', import.meta.url), 'utf8'));
  assert.ok(cases.length > 240);
  assert.ok(cases.filter((c) => c.refused).length > 20);
  for (const { source, call, amounts, rates, refused } of cases) {
    if (refused) {
      assert.throws(() => lumpSumArrears(call), Error, `${source}: the engine refused, ${refused}`);
      continue;
    }
    const r = lumpSumArrears(call);
    const mine = { total_arrears_amount: r.total, normal_taxable_income: r.normal, threshold_test_income: r.testIncome,
      ten_percent_of_threshold_test_income: r.tenPercent, lump_sum_arrears_tax_offset: r.offset };
    if (r.met) {
      Object.assign(mine, { tax_on_arrears: r.taxOnArrears, notional_tax_on_arrears: r.notionalTotal,
        notional_tax_most_recent_year: r.notional[0].amount });
      if (r.notional[1]) mine.notional_tax_second_most_recent_year = r.notional[1].amount;
      if (r.distant) mine.notional_tax_distant_accrual_years = r.distant.amount;
    }
    assert.deepEqual(Object.fromEntries(Object.entries(mine).map(([key, value]) => [key, value.toFixed(2)])), amounts, source);
    const wanted = r.rates ? [r.rates.mostRecent, r.rates.secondMostRecent, r.rates.average] : [];
    const given = ['tax_rate_on_arrears_most_recent_year', 'tax_rate_on_arrears_second_most_recent_year',
      'average_tax_rate_on_recent_arrears'].filter((key) => key in rates).map((key) => Number(rates[key]));
    assert.deepEqual(wanted, given, source);
  }
});

const SOLE = { year: '2026-27', income: '22000', expenses: '2000', wages: '60000', deductions: '0', super: '0', offset: true,
  studyLoan: false, hospitalCover: true, gst: false, credits: '0', invoice: '1000' };
const sole = (extra) => soleTraderSetAside({ ...SOLE, ...extra });

// ITAA 1997 s 328-360 (Compilation No. 268, read 19 November 2026), worked by hand. 2026-27: $20,000 of
// profit and $59,000 of wages after the standard deduction is $79,000 of taxable income, taxed $4,020 plus
// 30% of $34,000, $14,220; the offset is 16% x 20,000 / 79,000 x $14,220 = $576.00. On the wages alone,
// $59,000 is taxed $8,220 less a low income tax offset of $325 - 1.5% x $14,000 = $115 plus a $1,180 levy.
test('the small business income tax offset is 16% of the profit’s share of the basic income tax liability', () => {
  const r = sole({});
  assert.deepEqual([r.taxable, r.tax, r.smallBusinessOffset, r.medicare, r.total], [79000, 14220, 576, 1580, 15224]);
  assert.equal(r.wagesTax, 8220 - 115 + 1180);
  assert.equal(r.businessTax, 15224 - 9285);
  // A published worked example's 2024-25 figures: $40,754.08 of tax on $160,584 with $29,000 of net small
  // business income, so 16% of $7,359.76 is $1,177.56 and the offset is the $1,000 cap (s 328-360(2)).
  const capped = sole({ year: '2024-25', income: '29000', expenses: '0', wages: '131584' });
  assert.deepEqual([capped.taxable, capped.tax, capped.smallBusinessOffset], [160584, 40754.08, 1000]);
  // Taxable income below the profit: total net small business income stops at taxable income, so the
  // offset is 16% of the whole tax, here 2023-24 on $32,000: 19% of $13,800 = $2,622, so $419.52.
  const deducted = sole({ year: '2023-24', income: '40000', expenses: '5000', wages: '0', deductions: '3000' });
  assert.deepEqual([deducted.taxable, deducted.tax, deducted.smallBusinessOffset], [32000, 2622, 419.52]);
  // The low and middle income tax offsets come first and leave nothing for this one (s 63-10, item 20).
  const low = sole({ year: '2021-22', income: '25000', expenses: '0', wages: '0' });
  assert.deepEqual([low.tax, low.offset, low.lmito, low.smallBusinessOffset, low.medicare], [1292, 700, 592, 0, 163.5]);
  // Not qualifying, and personal services income outside a personal services business, gets none.
  assert.equal(sole({ offset: false }).smallBusinessOffset, 0);
});

test('the standard deduction comes off the wages only, from 2026-27 (s 25-130(4))', () => {
  assert.equal(sole({ wages: '0' }).deduction, 0);
  assert.equal(sole({ wages: '600.50' }).deduction, 600.5);
  assert.equal(sole({ year: '2025-26' }).deduction, 0);
  assert.equal(sole({}).deduction, 1000);
});

test('with no job the whole year’s tax is the business’s; with one it is the difference', () => {
  const alone = sole({ wages: '0' });
  assert.equal(alone.wagesTax, 0);
  assert.equal(alone.businessTax, alone.total);
  // Other deductions come off both: $57,000 of wages after them is taxed $4,020 plus 30% of $12,000, less a
  // $145 low income tax offset, plus a $1,140 levy.
  assert.equal(sole({ deductions: '2000' }).wagesTax, 7620 - 145 + 1140);
  // $20,000 of profit on $70,000 of wages in 2026-27 lands in the 30% band with the 2% levy: $6,400.
  const rival = sole({ income: '20000', expenses: '0', wages: '70000', offset: false });
  assert.deepEqual([rival.businessTax, rival.taxShare, rival.quarterly, rival.weekly], [6400, 32, 1600, 123.08]);
});

// GST Act ss 9-70 and 9-75 (Compilation No. 96, read 19 November 2026): 10% of the GST-exclusive income.
// Deductible personal super contributions are reportable super contributions, so they come off taxable income
// but count in repayment income and income for surcharge purposes (HESA s 154-5(1); ATO 'Income tests', read
// 19 November 2026). 2025-26, $110,000 of profit and $10,000 of contributions: taxable $100,000, taxed $4,288
// plus 30% of $55,000, $20,788, less the $1,000 cap, plus $2,000 levy; surcharge income $110,000 is tier 1, 1% of
// $100,000; repayment income $110,000 repays 15% of $43,000, $6,450. Alone, $10,000 of contributions owes nothing.
test('personal super contributions reduce taxable income but join repayment and surcharge income', () => {
  const r = sole({ year: '2025-26', income: '110000', expenses: '0', wages: '0', super: '10000', studyLoan: true,
    hospitalCover: false });
  assert.deepEqual([r.taxable, r.tax, r.smallBusinessOffset, r.medicare, r.surcharge, r.studyLoan, r.total, r.wagesTax],
    [100000, 20788, 1000, 2000, 1000, 6450, 29238, 0]);
  // The offset's share leaves them out (s 328-370(c)): the whole $110,000 of profit is above taxable income.
  const deducted = sole({ year: '2025-26', income: '110000', expenses: '0', wages: '0', super: '10000' });
  assert.equal(deducted.smallBusinessOffset, 1000);
  assert.equal(sole({ year: '2023-24', income: '40000', expenses: '5000', wages: '0', super: '3000' }).smallBusinessOffset,
    419.52);
});

test('on the wages alone, contributions count only up to the wages they can be deducted from', () => {
  // $80,000 of contributions against $20,000 of wages: the wages alone deduct and report $20,000, so their
  // repayment income is $20,000, under the 2025-26 threshold of $67,000, and nothing is due on them.
  // Reporting all $80,000 would put $1,950 (15% of $13,000) of repayment on the wages alone.
  const r = sole({ year: '2025-26', income: '150000', expenses: '0', wages: '20000', super: '80000', studyLoan: true });
  assert.equal(r.taxable, 90000);
  assert.equal(r.wagesTax, 0);
  assert.equal(r.businessTax, r.total);
});

test('a GST-registered business sets aside GST less credits, and one share of each invoice covers both', () => {
  const r = sole({ income: '90000', expenses: '15000', wages: '0', gst: true, credits: '1200', invoice: '1100' });
  assert.deepEqual([r.gstOnIncome, r.gst, r.businessTax, r.setAside], [9000, 7800, 13520, 21320]);
  // $21,320 over $99,000 of invoices is 21.535..%, and $1,100 x 21,320 / 99,000 = $236.888.., $236.89.
  assert.deepEqual([r.invoiceShare, r.invoice.setAside, r.invoice.left], [21.54, 236.89, 863.11]);
  assert.deepEqual([r.quarterly, r.monthly, r.weekly], [5330, 1776.67, 410]);
  // Half a cent of GST rounds up: $0.05 of income carries $0.005.
  assert.equal(sole({ income: '0.05', expenses: '0', wages: '0', gst: true }).gstOnIncome, 0.01);
  assert.equal(sole({}).gstOnIncome, 0);
});

test('the notes flag GST registration and PAYG instalment entry at the ATO’s thresholds', () => {
  assert.equal(sole({ income: '75000', expenses: '0' }).mustRegister, true);
  assert.equal(sole({ income: '74999.99', expenses: '0' }).mustRegister, false);
  assert.equal(sole({ income: '75000', expenses: '0', gst: true }).mustRegister, false);
  assert.equal(sole({ income: '4000', expenses: '0' }).instalments, true);
  assert.equal(sole({ income: '3999.99', expenses: '0' }).instalments, false);
  // $25,000 of profit alone in 2021-22 leaves $163.50 of levy, under the $1,000 test.
  assert.equal(sole({ year: '2021-22', income: '25000', expenses: '0', wages: '0' }).instalments, false);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  const fields = { ...Object.fromEntries(Object.entries(SOLE).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 'yes' : 'no') : v])),
    'study-loan': 'no', cover: 'yes', income: '80000', wages: '0' };
  const note = individualResult('sole-trader', (name) => fields[name], aud).note;
  assert.match(note, /must register for GST/);
  assert.doesNotMatch(note, /wages alone/);
});

test('the sole trader calculator refuses what it does not work', () => {
  assert.throws(() => sole({ year: '2020-21' }), { message: 'Choose an income year from 2021-22 to 2026-27.' });
  assert.throws(() => sole({ year: '2027-28' }), { message: 'Choose an income year from 2021-22 to 2026-27.' });
  assert.throws(() => sole({ expenses: '22000.01' }),
    { message: 'Enter business expenses no more than the business income: a loss is not worked here.' });
  const tooMuch = { message: 'Enter other deductions and super contributions no more than the profit and wages less '
    + 'any standard deduction.' };
  assert.throws(() => sole({ wages: '0', deductions: '20000.01' }), tooMuch);
  assert.throws(() => sole({ wages: '0', deductions: '10000', super: '10000.01' }), tooMuch);
  assert.throws(() => sole({ credits: '1' }), { message: 'Enter 0 for GST credits when the business is not registered for GST.' });
  assert.throws(() => sole({ gst: true, credits: '2200.01' }),
    { message: 'Enter GST credits no more than the GST on the business income: a refund is not worked here.' });
  assert.throws(() => sole({ gst: 'yes' }), { message: 'Say whether the business is registered for GST.' });
  assert.throws(() => sole({ offset: 'yes' }), { message: 'Say whether the business qualifies for the small business income tax offset.' });
  for (const value of ['', '-1', '1.001', '1e5', '1000000001']) assert.throws(() => sole({ income: value }), value);
  assert.deepEqual(SOLE_TRADER_YEARS, INCOME_TAX_YEARS.filter((year) => year >= '2021-22'));
});

// Income tests. Read 19 November 2026: ITAA 1997 s 995-1 and s 293-20 (Compilation No. 268), ITAA 1936 s 6(1),
// HESA s 154-5(1), the Co-contribution Act s 8 and the Family Assistance Act Sch 3 cls 2 and 4 (Compilation No. 124).
const tests = (given, resident = true) => incomeTests({ resident,
  ...Object.fromEntries(INCOME_TEST_PARTS.map((key) => [key, '0'])), ...given });

// ATO, 'When you must repay your loan' (last updated 13 October 2026): $50,420 + $1,250 + $4,560 + $2,580 +
// $15,000 = $73,810. 'Study and training loan repayment thresholds and rates' (last updated 30 June 2026), example
// 1: $60,470 + $5,400 + $1,330 + $16,500 + $2,680 = $86,380. 'Medicare levy surcharge income, thresholds and rates'
// (last updated 22 June 2026): Tom's $90,000 and $27,000 give $117,000. All read 19 November 2026.
test('income tests give the ATO’s repayment income and income for surcharge purposes', () => {
  assert.equal(tests({ taxable: '50420', financialLoss: '1250', fringeOther: '4560', exemptForeign: '2580',
    targetForeign: '2580', employerSuper: '15000', assessable: '50420' }).repaymentIncome, 73810);
  assert.equal(tests({ taxable: '60470', fringeOther: '5400', rentalLoss: '1330', employerSuper: '16500',
    exemptForeign: '2680', targetForeign: '2680', assessable: '60470' }).repaymentIncome, 86380);
  assert.equal(tests({ taxable: '90000', fringeOther: '27000', assessable: '90000' }).surchargeIncome, 117000);
});

// The ATO's 'Rebate income 2026' worksheet (last updated 30 May 2026, read 19 November 2026): 'question IT1 – label N
// in your tax return multiplied by 0.53 and rounded down to the nearest dollar', plus label W. $4,567 x 0.53 =
// $2,420.51, so $2,420; $1 x 0.53 is nil; $100 x 0.53 is $53 exactly.
test('section 57A fringe benefits count at 53%, rounded down, in rebate and adjusted taxable income only', () => {
  const r = tests({ taxable: '40000', fringe57a: '4567', fringeOther: '1000', assessable: '40000' });
  assert.deepEqual([r.fringeTotal, r.adjustedFringe, r.rebateIncome, r.adjustedTaxableIncome, r.surchargeIncome,
    r.repaymentIncome, r.coContributionIncome], [5567, 3420, 43420, 43420, 45567, 45567, 45567]);
  assert.equal(tests({ fringe57a: '1' }).adjustedFringe, 0);
  assert.equal(tests({ fringe57a: '100' }).adjustedFringe, 53);
});

// Each measure's own list: s 995-1 'income for surcharge purposes' (a) adds the family trust distribution amounts
// Sch 2F s 271-105(1) kept out; Sch 3 cl 2(1) adds tax-free pensions and target foreign income less child support,
// with no floor; s 293-20(1)(a) leaves out reportable super contributions; s 8(2) takes off business deductions.
test('each income measure adds only the parts its definition names', () => {
  const trust = tests({ taxable: '100000', familyTrust: '20000', assessable: '100000' });
  assert.deepEqual([trust.surchargeIncome, trust.division293Income, trust.rebateIncome, trust.repaymentIncome,
    trust.adjustedTaxableIncome, trust.coContributionIncome], [120000, 120000, 100000, 100000, 100000, 100000]);
  const family = tests({ taxable: '20000', pensions: '5000', targetForeign: '3000', childSupport: '8000', assessable: '20000' });
  assert.deepEqual([family.adjustedTaxableIncome, family.rebateIncome, family.surchargeIncome], [20000, 20000, 20000]);
  assert.equal(tests({ childSupport: '1000' }).adjustedTaxableIncome, -1000);
  const business = tests({ taxable: '35000', fringeOther: '2000', employerSuper: '1000', businessDeductions: '5000',
    assessable: '40000' });
  assert.deepEqual([business.coContributionIncome, business.division293Income, business.surchargeIncome], [38000, 37000, 38000]);
});

// s 995-1 'reportable superannuation contributions' and the Co-contribution Act s 8(1A): 'reduced (but not below
// zero)' by excess concessional contributions. $10,000 + $5,000 - $3,000 = $12,000; $10,000 - $3,000 = $7,000.
test('excess concessional contributions reduce the contributions, but not below nil', () => {
  const some = tests({ taxable: '60000', employerSuper: '10000', personalSuper: '5000', excessConcessional: '3000',
    assessable: '63000' });
  assert.deepEqual([some.contributions, some.coEmployer, some.coContributionIncome], [12000, 7000, 70000]);
  const all = tests({ taxable: '60000', employerSuper: '10000', personalSuper: '5000', excessConcessional: '20000',
    assessable: '63000' });
  assert.deepEqual([all.contributions, all.coEmployer, all.rebateIncome], [0, 0, 60000]);
});

// Each measure disregards the assessable FHSS released amount; more than taxable income leaves none (ITAA 1997
// s 4-15(1)). The co-contribution takes it from assessable income (s 8(1)(a)).
test('the FHSS released amount comes out of every measure', () => {
  const part = tests({ taxable: '30000', fhss: '10000', assessable: '45000' });
  assert.deepEqual([part.taxableWithoutFhss, part.rebateIncome, part.coContributionIncome], [20000, 20000, 35000]);
  const all = tests({ taxable: '30000', fhss: '40000', assessable: '50000' });
  assert.deepEqual([all.taxableWithoutFhss, all.repaymentIncome, all.coContributionIncome], [0, 0, 10000]);
});

test('income tests name where the ATO’s surcharge page adds exempt foreign employment income', () => {
  assert.equal(tests({ taxable: '50420', exemptForeign: '2580', targetForeign: '2580', assessable: '50420' }).exemptForeignDiffers, true);
  assert.equal(tests({ exemptForeign: '2580', targetForeign: '2580' }).exemptForeignDiffers, false);
  assert.equal(tests({ taxable: '50420', assessable: '50420' }).exemptForeignDiffers, false);
});

test('income tests refuse a part larger than its whole, cents, residency they do not cover and missing parts', () => {
  for (const [given, message] of [
    [{ taxable: '50421', assessable: '50420' }, 'Taxable income cannot exceed assessable income: it is assessable income less deductions.'],
    [{ fhss: '2', assessable: '1' }, 'The assessable FHSS released amount cannot exceed assessable income, which includes it.'],
    [{ excessConcessional: '2', assessable: '1' }, 'Excess concessional contributions cannot exceed assessable income, which includes them.'],
    [{ exemptForeign: '2581', targetForeign: '2580' }, 'Exempt foreign employment income cannot exceed target foreign income, which includes it.'],
    [{ taxable: '1.50' }, 'Enter each amount in whole dollars, 0 if none.'],
    [{ rentalLoss: '-1' }, 'Enter each amount in whole dollars, 0 if none.'],
    [{ pensions: '1000000001' }, 'Enter a whole number between 0 and 1000000000.'],
    [{ childSupport: undefined }, 'Enter each amount in whole dollars, 0 if none.'],
  ]) {
    assert.throws(() => tests(given), { message }, JSON.stringify(given));
  }
  assert.throws(() => tests({}, false), { message: 'This calculator works the measures only for a person resident in Australia for the whole year.' });
  assert.throws(() => tests({}, 'yes'), { message: 'Say whether the person was an Australian resident all year.' });
});

// australian-tax-calculators 1.0.0, the release the page ports: see the fixture's engine line.
test('income tests agree with the australian-accounting engine on every differential case', () => {
  const { cases } = JSON.parse(readFileSync(new URL('./income-tests-engine-differential.json', import.meta.url), 'utf8'));
  assert.ok(cases.length > 240);
  assert.ok(cases.filter((c) => c.refused).length > 10);
  for (const { source, call, amounts, warns, refused } of cases) {
    if (refused) {
      assert.throws(() => incomeTests(call), Error, `${source}: the engine refused, ${refused}`);
      continue;
    }
    const result = incomeTests(call);
    assert.deepEqual(Object.fromEntries(Object.keys(amounts).map((key) => [key, result[key].toFixed(2)])), amounts, source);
    assert.equal(result.exemptForeignDiffers, warns, source);
  }
});

// The income tests page works Division 293 income with the Division 293 calculator's own function.
test('the income tests and Division 293 pages give the same Division 293 income', () => {
  for (const given of [
    { taxable: '200000', fringeOther: '20000', financialLoss: '5000', employerSuper: '20000', assessable: '200000' },
    { taxable: '30000', fhss: '40000', familyTrust: '1000', fringe57a: '3000', assessable: '50000' },
    { taxable: '260000', familyTrust: '20000', rentalLoss: '7000', personalSuper: '10000', excessConcessional: '2000',
      assessable: '262000' },
  ]) {
    const t = tests(given);
    const d = d293({ taxable: given.taxable, fhss: given.fhss ?? '0', trust: given.familyTrust ?? '0',
      fringe: String(t.fringeTotal), losses: String(t.losses) });
    assert.equal(d.income, t.division293Income, JSON.stringify(given));
  }
});

const SAM = [['2019-20', '11000'], ['2020-21', '12000'], ['2021-22', '13000'], ['2022-23', '14000'], ['2023-24', '15000']]
  .map(([year, contributions]) => ({ year, contributions }));
const catchUp = (given) => concessionalCatchUp({ year: '2024-25', balance: '450000', concessional: '97500',
  definedBenefit: false, earlier: SAM, ...given });

// ATO, 'Concessional contributions cap' (last updated 2 July 2026, read 19 November 2026): Sam's table 1.
test('Sam’s unused cap of 2019-20 to 2023-24 makes his 2024-25 cap $97,500, used earliest year first', () => {
  const r = catchUp({});
  assert.deepEqual([r.cap, r.unusedCarried, r.available, r.carryForwardApplied, r.excess], [30000, 67500, 97500, 67500, 0]);
  assert.deepEqual(r.applied, { '2019-20': 14000, '2020-21': 13000, '2021-22': 14500, '2022-23': 13500, '2023-24': 12500 });
  // $1 more is excess, and $1 less leaves $1 of 2023-24's amount; no more than the carried $67,500 is applied.
  assert.deepEqual([catchUp({ concessional: '120000' }).carryForwardApplied, catchUp({ concessional: '120000' }).excess],
    [67500, 22500]);
  assert.equal(catchUp({ concessional: '97501' }).excess, 1);
  assert.deepEqual(catchUp({ concessional: '97499' }).years.at(-2), { year: '2023-24', remaining: 1, expiresAtEndOf: '2028-29' });
});

test('the caps are the ATO’s Table 1.1, from 2018-19', () => {
  assert.deepEqual(CAP, { '2018-19': 25000, '2019-20': 25000, '2020-21': 25000, '2021-22': 27500, '2022-23': 27500,
    '2023-24': 27500, '2024-25': 30000, '2025-26': 30000, '2026-27': 32500 });
  assert.equal(concessionalCatchUp({ year: '2026-27', balance: '0', concessional: '32500', definedBenefit: false,
    earlier: ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26'].map((year) => ({ year, contributions: '0' })) })
    .carryForwardApplied, 0);
});

test('a balance of $500,000 stops the increase, a cent less does not, and the amounts age either way', () => {
  const at = catchUp({ balance: '500000', concessional: '40000' });
  assert.deepEqual([at.available, at.carryForwardApplied, at.excess, at.expiring, at.carriesForward], [30000, 0, 10000, 14000, false]);
  const below = catchUp({ balance: '499999.99', concessional: '40000' });
  assert.deepEqual([below.available, below.carryForwardApplied, below.excess, below.expiring], [97500, 10000, 0, 4000]);
  // An earlier year over its cap at $500,000 applied nothing, so the years before it are not needed.
  const earlier = SAM.map((row) => (row.year === '2021-22' ? { ...row, contributions: '40000', balance: '500000' } : row));
  let atLimit;
  assert.doesNotThrow(() => { atLimit = catchUp({ concessional: '0', earlier }); });
  assert.deepEqual(atLimit.earlierApplied, {});
});

test('an earlier year over its cap takes the unused cap of the 5 years before it, earliest first', () => {
  const earlier = [['2018-19', '5000'], ['2019-20', '25000'], ['2020-21', '15000'], ['2021-22', '27500'],
    ['2022-23', '50000', '300000'], ['2023-24', '7500'], ['2024-25', '30000']]
    .map(([year, contributions, balance]) => ({ year, contributions, ...(balance ? { balance } : {}) }));
  const r = concessionalCatchUp({ year: '2025-26', balance: '400000', concessional: '40000', definedBenefit: false, earlier });
  assert.deepEqual(r.earlierApplied, { '2022-23': { '2018-19': 20000, '2020-21': 2500 } });
  assert.deepEqual([r.unusedCarried, r.carryForwardApplied], [27500, 10000]);
  assert.deepEqual(r.applied, { '2020-21': 7500, '2023-24': 2500 });
  const proposed = concessionalCatchUp({ year: '2025-26', balance: '400000', concessional: '40000', proposed: '20000',
    definedBenefit: false, earlier });
  assert.deepEqual([proposed.withProposal, proposed.excessWithProposal, proposed.remaining], [60000, 2500, 17500]);
});

test('catch-up refuses what it cannot work', () => {
  const sixth = SAM.map((row) => (row.year === '2020-21' ? { ...row, contributions: '40000', balance: '1' } : row));
  for (const [given, message] of [
    [{ year: '2023-24' }, 'Choose 2024-25, 2025-26, 2026-27.'],
    [{ definedBenefit: true }, /defined benefit interest changes what counts/],
    [{ definedBenefit: 'no' }, 'Say whether the person has a defined benefit interest.'],
    [{ earlier: SAM.slice(1) }, /from 2019-20 to 2023-24, and of any years before them back to 2018-19 without a gap/],
    [{ earlier: [...SAM, { year: '2024-25', contributions: '0' }] }, /give none for 2024-25 or later/],
    [{ earlier: SAM.filter((row) => row.year !== '2021-22') }, /without a gap/],
    [{ earlier: [{ year: '2017-18', contributions: '0' }, ...SAM] }, /back to 2018-19/],
    [{ earlier: SAM.map((row) => (row.year === '2022-23' ? { ...row, contributions: '30000' } : row)) },
      /2022-23’s concessional contributions exceed its \$27,500 cap: give its total super balance/],
    [{ earlier: sixth }, /2020-21’s concessional contributions exceed its cap, so unused cap from 2018-19 onwards/],
    [{ balance: '-1' }, /^Total super balance on 30 June before the year: Enter an amount between 0/],
    [{ proposed: '1.001' }, /^Proposed contribution: Enter a number with no more than 2 decimal places/],
    [{ earlier: SAM.map((row) => ({ ...row, balance: 'x' })) }, /^2019-20 total super balance: Enter a number/],
  ]) {
    assert.throws(() => catchUp(given), { message }, JSON.stringify(given));
  }
  // A blank proposal or earlier balance is not given.
  assert.equal(catchUp({ proposed: ' ', earlier: SAM.map((row) => ({ ...row, balance: '' })) }).withProposal, null);
});

test('the catch-up form refuses a balance for a year without contributions', () => {
  const fields = { year: '2024-25', balance: '0', concessional: '0', proposed: '', 'defined-benefit': 'no' };
  const value = (name) => fields[name] ?? (name === 'balance-2018-19' ? '1' : '');
  assert.throws(() => individualResult('concessional-catch-up', value, String), {
    message: 'Enter 2018-19’s concessional contributions, or clear its balance.' });
});

// australian-tax-calculators 1.0.0, the release the page ports: see the fixture's engine line.
test('catch-up agrees with the australian-accounting engine on every differential case', () => {
  const { cases } = JSON.parse(readFileSync(new URL('./concessional-catch-up-engine-differential.json', import.meta.url), 'utf8'));
  const tag = (year) => year.replace('-', '_');
  assert.ok(cases.length > 240);
  assert.ok(cases.filter((c) => c.refused).length > 40);
  for (const { source, call, amounts, expiry, refused } of cases) {
    if (refused) {
      assert.throws(() => concessionalCatchUp(call), Error, `${source}: the engine refused, ${refused}`);
      continue;
    }
    const r = concessionalCatchUp(call);
    const mine = { unused_concessional_cap: r.unusedCarried, concessional_available: r.available,
      carry_forward_applied: r.carryForwardApplied, concessional_remaining: r.remaining, excess_concessional: r.excess,
      unused_cap_expiring: r.expiring,
      ...(r.withProposal === null ? {} : { contributions_with_proposal: r.withProposal,
        excess_with_proposal: r.excessWithProposal }) };
    for (const [to, from] of Object.entries(r.earlierApplied)) {
      for (const [year, value] of Object.entries(from)) mine[`applied_${tag(year)}_in_${tag(to)}`] = value;
    }
    for (const [year, value] of Object.entries(r.applied)) mine[`applied_${tag(year)}_in_${tag(call.year)}`] = value;
    assert.deepEqual(Object.fromEntries(Object.entries(mine).map(([key, value]) => [key, value.toFixed(2)])), amounts, source);
    assert.deepEqual(r.years.map((row) => ({ ...row, remaining: row.remaining.toFixed(2) })), expiry, source);
  }
});
