// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';
import * as calculate from '../assets/business-calculators.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import {
  calculatorTools, depreciationTools, fhssTools, governmentSuperTools, individualTaxTools, levyTools, ozzitTools,
  pensionMinimumTools, residencyDaysTools, transferBalanceTools, workExpensesTools,
} from '../assets/webmcp-tools.mjs';
import { engines as individualEngines } from '../assets/individual-tax-results.mjs';
import { fhss } from '../assets/fhss-result.mjs';
import { workExpenses, workExpensesYears } from '../assets/work-expenses-result.mjs';
import { governmentSuperAmounts, governmentSuperYears } from '../assets/government-super-result.mjs';
import { PENSION_MINIMUM_YEARS, pensionMinimum } from '../assets/pension-minimum.mjs';
import { MAX_PERIODS, RESIDENCY_YEARS, residencyDays } from '../assets/residency-days.mjs';
import { ATO_TABLE_5, CHARGE_YEARS, RELEASE_YEARS, excessContributions } from '../assets/excess-contributions.mjs';
import { TBA_KINDS, TBA_YEARS, dayOf, label, transferBalance, yearOf } from '../assets/transfer-balance.mjs';
import * as depreciation from '../assets/depreciation-rates.mjs';
import { computeEntry } from '../assets/levy-form.mjs';
import { levyCents } from '../assets/levy.mjs';
import { DUTY_SCALES } from '../assets/webmcp-business-b.mjs';
import { CONFIRMED_HOLIDAYS, DIVISION_296_YEAR, ETP_YEAR } from '../assets/webmcp-business-d.mjs';
import { FBT_CAR_YEAR, FBT_LOAN_YEAR, FBT_MEAL_YEAR, FBT_PARKING_YEAR } from '../assets/webmcp-business-d-fbt.mjs';
import { LAND_TAX_PLACES } from '../assets/webmcp-business-d-property.mjs';

const tool = calculatorTools(calculate).gst;

test('GST tool is read-only and requires only an amount', () => {
  assert.equal(tool.name, 'calculate_gst');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.deepEqual(tool.inputSchema.required, ['amount']);
  assert.equal(tool.inputSchema.additionalProperties, false);
});

test('GST tool returns the same cents as the calculator', async () => {
  const inclusive = await tool.execute({ amount: '1100', inclusive: true });
  assert.deepEqual([inclusive.excludingGst, inclusive.gst, inclusive.includingGst], ['1000.00', '100.00', '1100.00']);
  // 0.5 cents of GST rounds up, as on the page.
  const exclusive = await tool.execute({ amount: '0.05' });
  assert.deepEqual([exclusive.excludingGst, exclusive.gst, exclusive.includingGst], ['0.05', '0.01', '0.06']);
});

test('GST tool schema pattern agrees with the calculator on amounts', async () => {
  const pattern = new RegExp(tool.inputSchema.properties.amount.pattern);
  for (const amount of ['0', '12.5', '999999999.99']) {
    assert.ok(pattern.test(amount), amount);
    await tool.execute({ amount });
  }
  for (const amount of ['-1', '1.234', '1e3', '']) {
    assert.equal(pattern.test(amount), false, amount);
    await assert.rejects(tool.execute({ amount }));
  }
  // The schema stops at nine integer digits, one short of the calculator's 1,000,000,000 ceiling.
  assert.equal(pattern.test('1000000000'), false);
});

test('GST tool refuses a non-boolean inclusive flag', async () => {
  await assert.rejects(tool.execute({ amount: '100', inclusive: 'yes' }), /true or false/);
});

test('GST tool refuses a number, an unknown input or a missing amount rather than converting it', async () => {
  await assert.rejects(tool.execute({ amount: 1100 }), /amount does not match its description/);
  await assert.rejects(tool.execute({ amount: '1100', includesGst: true }), /includesGst is not an input of this tool/);
  await assert.rejects(tool.execute({ inclusive: true }), /amount is required/);
  await assert.rejects(tool.execute('1100'), /input must be an object/);
});

const tools = calculatorTools(calculate);
const declineInValue = depreciationTools(depreciation).declineInValue;
const levy = levyTools({ computeEntry, levyCents }).levy;

test('each business calculator tool is keyed by the form that registers it', () => {
  for (const key of Object.keys(tools)) {
    // The share parcels form sits on the CGT page, so its markup is a part, not a calculator page of its own.
    const folder = key === 'cgt-parcels' ? '' : 'calculators/';
    const form = readFileSync(new URL(`../_includes/${folder}${key}.html`, import.meta.url), 'utf8');
    assert.ok(form.includes(`<form class="calculator-split" data-calculator="${key}">`)
      || form.includes(`<form class="calculator-split" data-calculator="${key}" `)
      || form.includes(`<form data-calculator="${key}">`), key);
  }
});

test('every calculator tool is read-only, refuses unknown inputs and has its own name', () => {
  const all = [...Object.values(tools), declineInValue, levy];
  assert.deepEqual(all.map(t => t.name), ['calculate_gst', 'calculate_div7a_minimum_repayment', 'calculate_loan_schedule',
    'calculate_hire_purchase_schedule', 'calculate_lease_schedule', 'calculate_break_even', 'calculate_company_tax',
    'calculate_foreign_purchaser_surcharges', 'calculate_long_service_leave', 'calculate_fuel_tax_credits',
    'calculate_borrowing_expenses', 'calculate_asic_fee', 'calculate_ato_penalties_interest',
    'calculate_business_use_share', 'calculate_fixed_fee', 'calculate_franking_account', 'calculate_gic_payment_plan',
    'calculate_gst_margin_scheme', 'calculate_hourly_rate', 'calculate_luxury_car_tax', 'calculate_margin_and_markup',
    'calculate_objection_deadline', 'calculate_budget_variance', 'classify_vehicle', 'calculate_wine_equalisation_tax',
    'calculate_cash_forecast', 'calculate_depreciation_pool', 'calculate_div7a_schedule',
    'calculate_first_home_owner_grant', 'calculate_payg_instalment', 'calculate_payroll_tax',
    'calculate_salary_vs_dividend', 'calculate_sgc_payday', 'calculate_staff_cost',
    'calculate_capital_gains_tax', 'check_small_business_cgt_concessions', 'score_pcg_2021_4_risk',
    'calculate_pcg_2021_4_allocation', 'check_psi_rules', 'calculate_rental_property',
    'calculate_super_benefit_tax', 'calculate_unused_leave_withholding', 'calculate_workers_compensation_premium',
    'calculate_business_days', 'calculate_division_296_tax', 'calculate_fbt_car', 'calculate_fbt_car_parking',
    'calculate_fbt_expense_payment', 'calculate_fbt_loan', 'calculate_fbt_meal_entertainment', 'calculate_fbt_property',
    'calculate_land_tax', 'calculate_termination_payment', 'calculate_transfer_duty',
    'calculate_rd_tax_offset', 'calculate_gst_adjustments', 'calculate_deferred_tax', 'calculate_sole_trader_vs_company', 'calculate_trust_streaming',
    'calculate_casual_overtime_pay', 'calculate_contractor_employee', 'calculate_cgt_share_parcels', 'calculate_payday_super_cashflow', 'check_tax_invoice',
    'calculate_decline_in_value', 'calculate_coal_lsl_levy']);
  for (const t of all) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.inputSchema.additionalProperties, false, t.name);
    for (const name of t.inputSchema.required) assert.ok(name in t.inputSchema.properties, `${t.name} ${name}`);
  }
});

test('every calculator tool description names its currency and says the result is general information', () => {
  for (const t of [...Object.values(tools), declineInValue, levy]) {
    assert.match(t.description, /\bAUD\b|Australian dollar/, t.name);
    assert.match(t.description, / General information only, not advice\.$/, t.name);
  }
});

test('the business calculator tools pass the page function the strings its form would', async () => {
  const calls = [];
  const spy = Object.fromEntries(['gst', 'div7aMinimumRepayment', 'financeSchedule', 'interestByIncomeYear', 'breakEven'].map(name =>
    [name, (...args) => { calls.push([name, ...args]); return calculate[name](...args); }]));
  const spied = calculatorTools({ ...calculate, ...spy });
  await spied.div7a.execute({ balance: '1000', benchmarkRate: '8.77', remainingTerm: 1 });
  await spied.loan.execute({ solve: 'payment', amount: '100000', annualRate: '6', payments: 360, startDate: '2026-07-01' });
  await spied['break-even'].execute({ fixedCosts: '1000', pricePerUnit: '30', variableCostPerUnit: '18' });
  await spied.loan.execute({ solve: 'rate', amount: '60000', payment: '948.17', payments: 60, balloon: '30', balloonKind: 'percent',
    frequency: 'monthly', timing: 'advance', startDate: '2026-07-01' });
  // What the form passes: every field as a string, the unused one blank.
  const form = (terms) => ({ solve: 'payment', amount: '', rate: '', payments: '', payment: '', balloon: '0', balloonKind: 'amount',
    frequency: 'monthly', timing: 'arrears', start: '2026-07-01', ...terms });
  assert.deepEqual(calls, [['div7aMinimumRepayment', '1000', '8.77', '1'],
    ['financeSchedule', form({ amount: '100000', rate: '6', payments: '360' })], ['breakEven', '1000', '30', '18'],
    ['financeSchedule', form({ solve: 'rate', amount: '60000', payments: '60', payment: '948.17', balloon: '30', balloonKind: 'percent',
      timing: 'advance' })]]);
});

test('Division 7A tool returns the page worked example', async () => {
  // The page's example: $1,000.00 not repaid at 30 June 2026, 8.77% for 2026-27, 1 year left.
  const r = await tools.div7a.execute({ balance: '1000', benchmarkRate: '8.77', remainingTerm: 1 });
  assert.deepEqual([r.minimumRepayment, r.interest, r.principal, r.currency], ['1087.70', '87.70', '1000.00', 'AUD']);
  assert.equal(r.source, 'https://duguid.com.au/tools/business-calculators/div7a/');
});

test('Division 7A tool names the newest benchmark rate in the rate table', () => {
  const rows = readFileSync(new URL('../rates/div7a-benchmark-rate/div7a-benchmark-rates.csv', import.meta.url), 'utf8')
    .trim().split(/\r?\n/).slice(1).map((line) => line.split(','));
  const [year, rate] = rows[rows.length - 1];
  assert.ok(tools.div7a.description.includes(`${rate} for ${year}`), tools.div7a.description);
});

test('Division 7A tool refuses a term as text, out of range or under another name', async () => {
  const valid = { balance: '1000', benchmarkRate: '8.77', remainingTerm: 1 };
  await assert.rejects(tools.div7a.execute({ ...valid, remainingTerm: '1' }), /remainingTerm must be a whole number from 1 to 25/);
  await assert.rejects(tools.div7a.execute({ ...valid, remainingTerm: 26 }), /from 1 to 25/);
  await assert.rejects(tools.div7a.execute({ ...valid, benchmarkRate: '8.77%' }), /benchmarkRate does not match/);
  const { benchmarkRate, ...withoutRate } = valid;
  await assert.rejects(tools.div7a.execute({ ...withoutRate, rate: benchmarkRate }), /rate is not an input of this tool/);
});

test('loan tool returns the cent-by-cent schedule of the independently checked amortising case', async () => {
  const r = await tools.loan.execute({ solve: 'payment', amount: '100000', annualRate: '6', payments: 360, startDate: '2026-07-01' });
  assert.deepEqual([r.payment, r.lastPayment, r.payments, r.totalInterest, r.balloonRow, r.currency],
    ['599.55', '600.00', 360, '115838.45', null, 'AUD']);
  assert.deepEqual(r.schedule[0], { date: '2026-08-01', opening: '100000.00', payment: '599.55', interest: '500.00',
    principal: '99.55', closing: '99900.45' });
  assert.equal(r.schedule.length, 360);
  assert.equal(r.source, 'https://duguid.com.au/tools/business-calculators/loan/');
});

test('loan tool takes a balloon, payments in advance and any frequency as the page does', async () => {
  // AusCalc's vehicle finance worked example, read 15 November 2026: $954.09 a month; in
  // advance each payment is that divided by 1.00625.
  const terms = { solve: 'payment', amount: '60000', annualRate: '7.5', payments: 60, balloon: '18000', startDate: '2026-07-01' };
  const arrears = await tools.loan.execute(terms);
  assert.deepEqual([arrears.payment, arrears.lastPayment, arrears.totalInterest, arrears.balloonDue],
    ['954.09', '954.35', '15245.66', '2031-07-01']);
  const advance = await tools.loan.execute({ ...terms, timing: 'advance' });
  assert.deepEqual([advance.payment, advance.lastPayment, advance.totalInterest, advance.balloonRow.interest],
    ['948.17', '948.00', '14890.03', '111.80']);
  const weekly = await tools.loan.execute({ ...terms, amount: '10000', annualRate: '5.2', payments: 52, balloon: '0', frequency: 'weekly' });
  assert.deepEqual([weekly.payment, weekly.schedule[0].interest, weekly.schedule[0].date], ['197.45', '10.00', '2026-07-08']);
});

test('loan tool works out the rate, the amount financed and the number of payments', async () => {
  const start = { startDate: '2025-09-15' };
  const rate = await tools.loan.execute({ solve: 'rate', amount: '50000', payment: '850', payments: 60, balloon: '10000', ...start });
  assert.deepEqual([rate.annualRatePercent, rate.lastPayment], ['6.9860', '849.95']);
  const amount = await tools.loan.execute({ solve: 'amount', payment: '954.09', annualRate: '7.5', payments: 60, balloon: '18000', ...start });
  assert.equal(amount.amountFinanced, '59999.81');
  const term = await tools.loan.execute({ solve: 'term', amount: '60000', payment: '1202.28', annualRate: '7.5', ...start });
  assert.deepEqual([term.payments, term.lastPayment], [60, '1202.06']);
});

test('loan tool refuses missing terms, an unknown frequency and a balloon above the amount financed', async () => {
  const valid = { solve: 'payment', amount: '1000', annualRate: '12', payments: 12, startDate: '2026-07-01' };
  await assert.rejects(tools.loan.execute({ ...valid, timing: 'start' }), /timing does not match/);
  await assert.rejects(tools.loan.execute({ ...valid, frequency: 'daily' }), /frequency does not match/);
  await assert.rejects(tools.loan.execute({ ...valid, balloon: 100 }), /balloon does not match/);
  await assert.rejects(tools.loan.execute({ ...valid, balloon: '1000.01' }), /The balloon cannot be more than the amount financed/);
  await assert.rejects(tools.loan.execute({ ...valid, payments: 1.5 }), /payments must be a whole number from 1 to 2600/);
  await assert.rejects(tools.loan.execute({ ...valid, annualRate: '12%' }), /annualRate does not match/);
  const { amount, ...withoutAmount } = valid;
  await assert.rejects(tools.loan.execute(withoutAmount), /amount is required to work out the payment/);
  await assert.rejects(tools.loan.execute({ ...valid, solve: 'rate', payment: '80' }), /no rate of nil or more fits/);
  const { startDate, ...withoutStart } = valid;
  await assert.rejects(tools.loan.execute(withoutStart), /startDate is required/);
});

test('hire purchase tool adds interest by income year, sharing a period across 30 June', async () => {
  const r = await tools['hire-purchase'].execute({ solve: 'payment', amount: '1000', annualRate: '12', payments: 3,
    startDate: '2027-06-15' });
  assert.deepEqual(r.interestByIncomeYear, { '2026-27': '5.33', '2027-28': '14.74' });
  assert.deepEqual([r.payment, r.lastPayment, r.totalInterest], ['340.02', '340.03', '20.07']);
  assert.equal(r.source, 'https://duguid.com.au/tools/business-calculators/hire-purchase/');
  assert.equal((await tools.loan.execute({ solve: 'payment', amount: '1000', annualRate: '12', payments: 3,
    startDate: '2027-06-15' })).interestByIncomeYear, undefined);
  assert.match(tools['hire-purchase'].description, /does not work out GST, the GST credit, the car limit or income tax/);
});

test('lease tool returns the page’s AASB 16 schedule and refuses what the page refuses', async () => {
  // IFRS 16 Illustrative Example 13: CU355,391 and CU420,391.
  const r = await tools.lease.execute({ payment: '50000', payments: 10, frequency: 'annual', timing: 'advance', annualRate: '5',
    startDate: '2026-07-01', incentives: '5000', initialDirectCosts: '20000' });
  assert.deepEqual([r.leaseLiability, r.rightOfUseAsset, r.totalInterest, r.leaseTermEnds], ['355391.08', '420391.08', '94608.92', '2036-07-01']);
  // As in the example's table, the payment made at commencement is not a payment against the liability.
  assert.deepEqual(r.incomeYears[0], { year: '2026-27', interest: '17769.55', payments: '0.00', leaseLiability: '373160.63',
    depreciation: '42039.11', rightOfUseAsset: '378351.97' });
  assert.equal(r.schedule.length, 9);
  assert.equal(r.source, 'https://duguid.com.au/tools/business-calculators/lease/');
  const opening = { payment: '1000', payments: 60, annualRate: '7.5', startDate: '2026-07-01', initialDirectCosts: '500' };
  assert.deepEqual([(await tools.lease.execute(opening)).leaseLiability, (await tools.lease.execute(opening)).shortTermElectionAvailable], ['49905.31', false]);
  const owned = await tools.lease.execute({ ...opening, residual: '5000', ownershipTransfers: true, usefulLifeMonths: 96 });
  assert.equal(owned.depreciatedTo, '2034-07-01');
  await assert.rejects(tools.lease.execute({ ...opening, ownershipTransfers: true }), /Enter the asset’s useful life in months/);
  await assert.rejects(tools.lease.execute({ ...opening, ownershipTransfers: 'yes' }), /ownershipTransfers must be true or false/);
  await assert.rejects(tools.lease.execute({ ...opening, payment: '1,000' }), /payment does not match/);
  await assert.rejects(tools.lease.execute({ ...opening, incentives: '60000' }), /nothing to depreciate/);
  assert.match(tools.lease.description, /does not work out GST or income tax/);
});

test('break-even tool rounds units up as the page does', async () => {
  const r = await tools['break-even'].execute({ fixedCosts: '1000', pricePerUnit: '30', variableCostPerUnit: '18' });
  assert.deepEqual([r.contributionPerUnit, r.units, r.sales], ['12.00', 84, '2520.00']);
});

test('break-even tool refuses grouped digits and a price at or below variable cost', async () => {
  const valid = { fixedCosts: '1000', pricePerUnit: '30', variableCostPerUnit: '18' };
  await assert.rejects(tools['break-even'].execute({ ...valid, fixedCosts: '1,000' }), /fixedCosts does not match/);
  await assert.rejects(tools['break-even'].execute({ ...valid, pricePerUnit: '18' }), /Price must exceed variable cost/);
});

// The ATO's 'Guide to depreciating assets 2026' (read 13 November 2026, as in
// depreciation-rates.test.mjs): a $1,500 photocopier first used 1 July 2025 with a 5 year
// life declines by $600 in 2025-26 under diminishing value and by $300 under prime cost.
test('decline in value tool returns the ATO photocopier example', async () => {
  const input = { cost: '1500', effectiveLife: '5', startDate: '2025-07-01', incomeYearEnding: 2026 };
  const dv = await declineInValue.execute({ ...input, method: 'diminishing-value' });
  assert.equal(dv.rate, '40.00%');
  assert.deepEqual(dv.years, [{ incomeYear: '2025-26', daysHeld: 365, openingValue: '1500.00', declineInValue: '600.00',
    deduction: '600.00', closingValue: '900.00' }]);
  const pc = await declineInValue.execute({ ...input, method: 'prime-cost', taxableUse: '50' });
  assert.equal(pc.rate, '20.00%');
  assert.deepEqual([pc.years[0].declineInValue, pc.years[0].deduction, pc.years[0].closingValue], ['300.00', '150.00', '1200.00']);
});

test('decline in value tool refuses an unknown method, a year as text and a use as a number', async () => {
  const valid = { cost: '1500', effectiveLife: '5', startDate: '2025-07-01', incomeYearEnding: 2026, method: 'prime-cost' };
  await assert.rejects(declineInValue.execute({ ...valid, method: 'straight-line' }), /method does not match/);
  await assert.rejects(declineInValue.execute({ ...valid, incomeYearEnding: '2026' }), /incomeYearEnding must be a whole number/);
  await assert.rejects(declineInValue.execute({ ...valid, taxableUse: 50 }), /taxableUse does not match/);
  await assert.rejects(declineInValue.execute({ ...valid, startDate: '1/7/2025' }), /startDate does not match/);
  await assert.rejects(declineInValue.execute({ ...valid, startDate: '2006-05-09' }), /on or after 10 May 2006/);
});

test('Coal LSL levy tool gives the levy test cases', async () => {
  // Levy test D2: base $6,000, overtime $3,000 and allowances $500 make Formula B, 75% of
  // $9,500, the greater: $7,125.00 of eligible wages and $192.38 of levy (192.375 rounds up).
  const base = await levy.execute({ reportingMonth: '2026-09', branch: 'baseRate', baseRate: '6000', overtime: '3000', allowances: '500' });
  assert.deepEqual([base.section, base.eligibleWages, base.levy, base.greaterOf, base.formulaA, base.formulaB],
    ['s 3B(1)', '7125', '192.38', 'B', '6000', '7125']);
  // A quarterly bonus does not count; a monthly one does.
  const bonus = { reportingMonth: '2026-09', branch: 'baseRate', baseRate: '6000' };
  const quarterly = await levy.execute({ ...bonus, bonuses: [{ amount: '1000', frequency: 'quarterly' }] });
  const monthly = await levy.execute({ ...bonus, bonuses: [{ amount: '1000', frequency: 'monthly' }] });
  assert.deepEqual([quarterly.levy, monthly.levy], ['162.00', '189.00']);
  // A casual paid at an all-in rate: the base pay and loading entered beside it are named, not counted.
  const casual = await levy.execute({ reportingMonth: '2026-09', branch: 'casual', casualBasePay: '2000', casualLoading: '500', ordinaryPay: '2500' });
  assert.deepEqual([casual.section, casual.levy, casual.ignored], ['s 3B(3)(b)', '67.50', ['baseRatePay', 'casualLoading']]);
});

test('Coal LSL levy tool refuses an early month, an unknown branch and a malformed bonus', async () => {
  const valid = { reportingMonth: '2026-09', branch: 'baseRate', baseRate: '6000' };
  await assert.rejects(levy.execute({ ...valid, reportingMonth: '2023-06' }), /not supported/);
  await assert.rejects(levy.execute({ ...valid, reportingMonth: '2026-13' }), /reportingMonth does not match/);
  await assert.rejects(levy.execute({ ...valid, branch: 'salary' }), /branch does not match/);
  await assert.rejects(levy.execute({ ...valid, baseRate: '-6000' }), /baseRate does not match/);
  await assert.rejects(levy.execute({ ...valid, bonuses: [{ amount: 1000, frequency: 'monthly' }] }), /amount does not match/);
  await assert.rejects(levy.execute({ ...valid, bonuses: [{ amount: '1000', frequency: 'yearly' }] }), /frequency does not match/);
  await assert.rejects(levy.execute({ ...valid, bonuses: { amount: '1000', frequency: 'monthly' } }), /bonuses must be a list/);
});


const referenceFile = readdirSync(new URL('../assets/', import.meta.url))
  .filter(name => /^ozzit-function-reference-v[\d.]+\.json$/.test(name))
  .sort()
  .at(-1);
const reference = JSON.parse(readFileSync(new URL(`../assets/${referenceFile}`, import.meta.url), 'utf8'));
const lookup = ozzitTools(async () => reference).lookup;

test('Ozzit tool is read-only and requires only a name', () => {
  assert.equal(lookup.name, 'ozzit_function');
  assert.equal(lookup.annotations.readOnlyHint, true);
  assert.deepEqual(lookup.inputSchema.required, ['name']);
  assert.equal(lookup.inputSchema.additionalProperties, false);
});

test('Ozzit tool finds a function however its name is typed', async () => {
  for (const name of ['oz.Amortiseλ', 'Amortise', 'amortiseλ', ' OZ.AMORTISE ']) {
    const found = await lookup.execute({ name });
    assert.equal(found.name, 'oz.Amortiseλ', name);
    assert.equal(found.module, 'Financial');
    assert.ok(found.signature.startsWith('oz.Amortiseλ('));
    assert.equal(found.source, 'https://duguid.com.au/tools/ozzit/functions/financial/#oz-amortise');
    assert.ok(found.parameters.some(p => p.name === 'Principals'));
  }
});

test('Ozzit tool refuses an unknown or empty name', async () => {
  await assert.rejects(lookup.execute({ name: 'NotAFunction' }), /No Ozzit function is named NotAFunction/);
  await assert.rejects(lookup.execute({ name: '  ' }), /function name/);
  await assert.rejects(lookup.execute({}), /function name/);
});

// The company tax page's example (the ATO's Happy Feet income) and Dillmore Manufacture's new company case.
test('company tax tool returns the page worked example and passes the form’s strings', async () => {
  const calls = [];
  const spied = calculatorTools({ ...calculate, companyTax: (input) => (calls.push(input), calculate.companyTax(input)) });
  const r = await spied['company-tax'].execute({ turnover: '104000', assessableIncome: '104000', passiveIncome: '4000',
    taxableIncome: '104000', existedLastYear: true, previousTurnover: '104000', previousAssessableIncome: '104000',
    previousPassiveIncome: '4000', dividend: '30000', frankingPercent: '100', marginalRate: '30' });
  assert.deepEqual([r.baseRateEntity, r.taxRatePercent, r.tax, r.imputationRatePercent, r.maximumFrankingCredit, r.shareholderNet],
    [true, 25, '26000.00', 25, '10000.00', '2000.00']);
  assert.equal(r.source, 'https://duguid.com.au/tools/business-calculators/company-tax/');
  const fresh = await spied['company-tax'].execute({ turnover: '60000000', assessableIncome: '1000000', passiveIncome: '0',
    taxableIncome: '1000000', existedLastYear: false, dividend: '75000', frankingPercent: '50', marginalRate: '0' });
  assert.deepEqual([fresh.taxRatePercent, fresh.imputationRatePercent, fresh.frankingCredit, fresh.shareholderNet], [30, 25, '12500.00', '-12500.00']);
  assert.deepEqual(calls[1].prior, { turnover: '0', assessable: '0', passive: '0' });
  await assert.rejects(spied['company-tax'].execute({ turnover: 104000, assessableIncome: '1', passiveIncome: '0', taxableIncome: '1',
    existedLastYear: false, dividend: '0', frankingPercent: '0', marginalRate: '0' }), /turnover does not match its description/);
});

// The foreign surcharge page's example: Revenue NSW's 9% of $1,000,000 and 5% of $1,200,000.
test('foreign surcharge tool returns the page worked example and refuses what the page refuses', async () => {
  const tool = tools['foreign-surcharge'];
  const r = await tool.execute({ place: 'AU-NSW', buyer: 'individual', status: 'other', use: 'residential', value: 1000000,
    share: 1000000, landValue: 1200000 });
  assert.deepEqual([r.dutySurchargeRatePercent, r.dutySurcharge, r.landTaxSurcharge, r.currency], [9, '90000.00', '60000.00', 'AUD']);
  assert.match(r.dutyTest, /^Foreign: /);
  const trust = await tool.execute({ place: 'AU-VIC', buyer: 'trust', status: 'citizen', use: 'residential', value: 1000000,
    share: 1000000, landValue: 1000000, largestForeignPercent: '50', foreignPercent: '50', absenteePercent: '50' });
  assert.deepEqual([trust.dutySurcharge, trust.landTaxSurcharge], ['0.00', '20000.00']);
  // Each yes or no answer reaches the engine under its own name, and an omitted one is no.
  const flags = ['nzResident', 'resides', 'absent', 'home', 'overseas', 'amendable', 'control', 'named'];
  const calls = [];
  const spied = calculatorTools({ ...calculate, foreignSurcharge: (buyer, purchase) => (calls.push(buyer), calculate.foreignSurcharge(buyer, purchase)) });
  const base = { place: 'AU-NSW', buyer: 'company', status: 'citizen', use: 'other', value: 1, share: 1, landValue: 0 };
  await spied['foreign-surcharge'].execute(base);
  await spied['foreign-surcharge'].execute({ ...base, ...Object.fromEntries(flags.map((flag) => [flag, true])) });
  assert.deepEqual(calls.map((buyer) => flags.map((flag) => buyer[flag])), [flags.map(() => false), flags.map(() => true)]);
  await assert.rejects(tool.execute({ place: 'AU-NSW', buyer: 'individual', status: 'partner', use: 'residential', value: 1, share: 1,
    landValue: 0 }), /status does not match its description/);
  await assert.rejects(tool.execute({ place: 'AU-NSW', buyer: 'individual', status: 'other', use: 'residential', value: 1, share: 1,
    landValue: 0, exemption: true }), /exemption is not an input of this tool/);
  await assert.rejects(tool.execute({ place: 'AU-NSW', buyer: 'individual', status: 'other', use: 'residential', value: 1, share: 2,
    landValue: 0 }), /The buyer’s share cannot be worth more than the whole property\./);
  // New South Wales needs the days in Australia for a permanent visa holder; it never assumes none.
  const permanent = { place: 'AU-NSW', buyer: 'individual', status: 'permanent', use: 'residential', value: 1, share: 1, landValue: 0 };
  await assert.rejects(tool.execute({ ...permanent, daysBefore: 365 }), /give daysBefore and daysToDecember/);
  const counted = await tool.execute({ ...permanent, daysBefore: 365, daysToDecember: 0 });
  assert.match(counted.dutyTest, /^Not foreign: /);
});

test('foreign surcharge tool uses separate federal consideration and the legal share for an FIRB fee', async () => {
  const tool = tools['foreign-surcharge'];
  const purchase = { place: 'AU-NSW', buyer: 'individual', status: 'other', use: 'residential',
    value: 1200000, share: 600000, landValue: 1200000 };
  const firb = { kind: 'vacant', consideration: 1000000, ownership: 'tenant-in-common', interest: '1/2' };
  const r = await tool.execute({ ...purchase, firb });
  assert.deepEqual([r.dutySurcharge, r.landTaxSurcharge], ['54000.00', '60000.00']);
  assert.deepEqual([r.firb.applicationFee, r.firb.feeYear], ['7800.00', '2026-27']);
  assert.equal(r.firb.wholePropertyFee, '15600.00');
  assert.match(r.firb.notes.join(' '), /regulation 57\(2\)/);
  assert.doesNotMatch(r.firb.notes.join(' '), /payment adjustments/);
  const joint = await tool.execute({ ...purchase, firb: { kind: 'established', consideration: 2000000, ownership: 'joint', interest: '1/1' } });
  assert.equal(joint.firb.applicationFee, '93900.00');
  assert.equal(joint.firb.ownership, 'joint');
  assert.match(joint.firb.notes.join(' '), /generally banned.*same interest on the same day under subsection 113\(1\) of the Foreign Acquisitions and Takeovers Act 1975.*same section of the Fees Imposition Regulations.*in full or in part on a later day.*at the end of that day.*paid towards that one fee on that day/);
  assert.equal((await tool.execute(purchase)).firb, undefined);
  assert.equal((await tool.execute({ ...purchase, firb: { kind: 'none' } })).firb.applicationFee, '0.00');
  await assert.rejects(tool.execute({ ...purchase, firb: { kind: 'none', interest: 'invalid-fraction' } }), /interest/);
  await assert.rejects(tool.execute({ ...purchase, firb: { kind: 'vacant', ownership: 'tenant-in-common', interest: '1/2' } }), /consideration/);
  await assert.rejects(tool.execute({ ...purchase, firb: { kind: 'vacant', consideration: 1000000, interest: '1/2' } }), /ownership/);
  await assert.rejects(tool.execute({ ...purchase, firb: { ...firb, interest: '2/1' } }), /ownership share/);
  await assert.rejects(tool.execute({ ...purchase, firb: { ...firb, ownership: 'joint' } }), /fractional FIRB ownership share/);
  await assert.rejects(tool.execute({ ...purchase, use: 'other', firb }), /fee here is for residential land/);
});

// The long service leave page's example (redundancy after 12 years and 6 months in New South Wales) and
// SafeWork SA's Liam, still employed after 13 years with 10 weeks taken.
test('long service leave tool returns the page worked example and passes the form’s strings', async () => {
  const calls = [];
  const spied = calculatorTools({ ...calculate, longServiceLeave: (input) => (calls.push(input), calculate.longServiceLeave(input)) });
  const tool = spied['long-service-leave'];
  const r = await tool.execute({ place: 'AU-NSW', firstDay: '2014-02-01', lastDay: '2026-07-31', employment: 'ends', reason: 'redundancy',
    weeklyPay: '1500' });
  assert.deepEqual([r.years, r.months, r.days, r.daysCounted, r.weeks, r.weeksLeft, r.value, r.currency, r.next],
    [12, 6, 0, 4564, '10.8333', '10.8333', '16250.00', 'AUD', null]);
  assert.equal(r.rule, 'Pro rata on 3 months for 15 years, any reason, subparagraph 4(2)(a)(ii)');
  assert.equal(r.basis, 'Acts read 19 November 2026; Queensland, South Australia and Tasmania rechecked 24 November 2026. '
    + 'Weeks round half up to 4 decimal places; the value is the exact weeks times the pay, rounded half up to the cent.');
  assert.match(tool.description, /Refuses positive prior leave where 15 years could have been completed by the end of 30 June 2012; undated excluded periods are not deducted for this screen\./);
  assert.equal(r.source, 'https://duguid.com.au/tools/business-calculators/long-service-leave/');
  const liam = await tool.execute({ place: 'AU-SA', firstDay: '2013-01-01', lastDay: '2025-12-31', employment: 'employed',
    takenWeeks: '10', excludedDays: 0, weeklyPay: '1000' });
  assert.deepEqual([liam.weeks, liam.takenWeeks, liam.weeksLeft, liam.value, liam.next], ['16.9000', '10.0000', '6.9000', '6900.00',
    { years: 14, date: '2026-12-31', weeks: '18.2000' }]);
  assert.deepEqual(calls[1], { place: 'AU-SA', start: '2013-01-01', end: '2025-12-31', excluded: '0', taken: '10', mode: 'employed',
    reason: 'redundancy', pay: '1000' });
  const base = { place: 'AU-NSW', firstDay: '2014-02-01', lastDay: '2026-07-31', employment: 'ends', weeklyPay: '1500' };
  await assert.rejects(tool.execute(base), /reason is required when employment ends/);
  await assert.rejects(tool.execute({ ...base, reason: 'sacked' }), /reason does not match its description/);
  await assert.rejects(tool.execute({ ...base, reason: 'resign', weeklyPay: 1500 }), /weeklyPay does not match its description/);
  await assert.rejects(tool.execute({ ...base, place: 'AU-NT', firstDay: '2017-01-01', lastDay: '2025-12-31', reason: 'death' }),
    /subsection 10[(]3[)]/);
});

// The borrowing expenses page's example (the ATO's Peter and Fiona and Max in 2024-25) and a
// refinancing, then refusals.
test('borrowing expenses tool returns the page worked example and a refinancing, and refuses what the page refuses', async () => {
  const tool = calculatorTools(calculate)['borrowing-expenses'];
  const peter = { borrowingExpenses: '1600.00', firstBorrowed: '2020-07-03', contractEnd: '2045-07-02', incomeUse: '1' };
  const r = await tool.execute({ year: '2024-25', loans: [peter,
    { borrowingExpenses: '1670.00', firstBorrowed: '2020-07-17', contractEnd: '2040-07-16', incomeUse: '0.813397' }] });
  assert.deepEqual([r.borrowingExpenses, r.maximumDeduction, r.deduction, r.remainingAfterYear, r.currency],
    ['3270.00', '653.65', '591.36', '16.38', 'AUD']);
  assert.match(r.basis, /remainingAfterYear is before income-use apportionment/);
  assert.match(r.basis, /amounts before any applicable vacant land or residential loss limit/);
  assert.match(r.warnings.join(' '), /s 26-102/);
  assert.deepEqual(r.loans[1].years.at(-1), { incomeYear: '2025-26', remaining: '14.63', daysInYear: 16, daysLeft: 16, maximum: '14.63',
    deduction: '11.90', section26_155: false, projected: false });
  assert.equal(r.source, 'https://duguid.com.au/tools/business-calculators/borrowing-expenses/');
  const refinanced = await tool.execute({ year: '2025-26', loans: [{ borrowingExpenses: '1500.00', firstBorrowed: '2024-09-01',
    contractEnd: '2028-08-31', repaidOn: '2025-12-31', incomeUse: '1' }, { borrowingExpenses: '800.00', firstBorrowed: '2025-12-31', incomeUse: '1', refinances: 1 }] });
  assert.equal(refinanced.deduction, '1268.65');
  await assert.rejects(tool.execute({ year: '2024-25', loans: [{ ...peter, firstBorrowed: '2017-06-30' }] }), /before 1 July 2017/);
  await assert.rejects(tool.execute({ year: '2024-25', loans: [{ ...peter, incomeUse: 1 }] }), /incomeUse does not match its description/);
  await assert.rejects(tool.execute({ year: '2024-25', loans: [{ ...peter, accounting: true }] }), /accounting is not an input of this tool/);
});

const individual = {
  ...individualTaxTools(individualEngines),
  ...fhssTools({ fhss }),
  ...workExpensesTools({ workExpenses, workExpensesYears }),
  ...governmentSuperTools({ governmentSuperAmounts, governmentSuperYears }),
  ...pensionMinimumTools({ pensionMinimum, PENSION_MINIMUM_YEARS }),
  ...transferBalanceTools({ ATO_TABLE_5, CHARGE_YEARS, RELEASE_YEARS, TBA_KINDS, TBA_YEARS, dayOf, excessContributions, label, transferBalance, yearOf }),
  ...residencyDaysTools({ MAX_PERIODS, RESIDENCY_YEARS, residencyDays }),
};

test('each individual tax tool is keyed by the form that registers it and is read-only', () => {
  assert.deepEqual(Object.values(individual).map(t => t.name), ['calculate_income_tests', 'estimate_income_tax',
    'calculate_take_home_pay', 'calculate_study_loan_repayment', 'project_super_balance',
    'calculate_sole_trader_set_aside', 'calculate_lump_sum_arrears', 'calculate_division_293_tax',
    'calculate_concessional_catch_up', 'calculate_bonus_withholding', 'calculate_salary_packaging',
    'calculate_novated_lease', 'calculate_fhss_release', 'calculate_work_expenses',
    'calculate_government_super_amounts', 'calculate_pension_minimum', 'calculate_transfer_balance',
    'calculate_residency_days']);
  for (const [key, t] of Object.entries(individual)) {
    const form = readFileSync(new URL(`../_includes/calculators/${key}.html`, import.meta.url), 'utf8');
    assert.ok(form.includes(`<form class="calculator-split" data-calculator="${key}">`), key);
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.inputSchema.additionalProperties, false, t.name);
    for (const name of t.inputSchema.required) assert.ok(name in t.inputSchema.properties, `${t.name} ${name}`);
    // A day count has no money in it.
    if (t.name !== 'calculate_residency_days') assert.match(t.description, /\bAUD\b/, t.name);
    assert.match(t.description, / General information only, not advice\.$/, t.name);
  }
});

test('income tax tool returns the page worked example: the ATO’s Tom with $21,000 withheld', async () => {
  const r = await individual['income-tax'].execute({ incomeYear: '2026-27', residency: 'resident', taxableIncome: 90000,
    reportableFringeBenefits: 27000, daysWithoutHospitalCover: 365, taxWithheld: '21000' });
  assert.deepEqual([r.taxOnTaxableIncome, r.medicareLevy, r.medicareLevySurcharge, r.total, r.refund, r.amountOwing],
    ['17520.00', '1800.00', '1170.00', '20490.00', '510.00', '0.00']);
  const owing = await individual['income-tax'].execute({ incomeYear: '2021-22', residency: 'resident', taxableIncome: 45000 });
  assert.deepEqual([owing.lowIncomeTaxOffset, owing.lowAndMiddleIncomeTaxOffset, owing.refund, owing.amountOwing],
    ['325.00', '1275.00', '0.00', '4392.00']);
  const family = await individual['income-tax'].execute({ incomeYear: '2026-27', residency: 'resident', taxableIncome: 113001,
    spouseIncome: 100000, dependentChildren: 3, daysWithoutHospitalCover: 365 });
  assert.equal(family.medicareLevySurcharge, '1130.01');
});

test('take-home pay tool gives PAYG withholding for a pay in any year and none for a year', async () => {
  const r = await individual['take-home-pay'].execute({ incomeYear: '2026-27', residency: 'resident', salary: '3000',
    payPeriod: 'fortnight', salarySacrifice: '200', studyLoan: true });
  assert.deepEqual(r.paygWithholding, { eachPay: '554.00', studyLoanComponent: '20.00',
    studyLoanComponentBefore24September2025: null, year: '14404.00', refund: '0.00', amountOwing: '212.80' });
  const late = await individual['take-home-pay'].execute({ incomeYear: '2025-26', residency: 'resident', salary: '3000',
    payPeriod: 'fortnight', studyLoan: true });
  assert.deepEqual(late.paygWithholding, { eachPay: '672.00', studyLoanComponent: '64.00',
    studyLoanComponentBefore24September2025: '106.00', year: '17472.00', refund: '74.00', amountOwing: '0.00' });
  assert.equal(r.takeHomeYear, '58183.20');
  const year = await individual['take-home-pay'].execute({ incomeYear: '2025-26', residency: 'resident', salary: '75000' });
  assert.deepEqual([year.takeHomeYear, year.medicareLevy, year.paygWithholding], ['60212.00', '1500.00', null]);
  const holiday = await individual['take-home-pay'].execute({ incomeYear: '2026-27', residency: 'working-holiday',
    salary: '3000', payPeriod: 'fortnight' });
  assert.equal(holiday.paygWithholding, null);
  assert.match(individual['take-home-pay'].description, /for a working holiday maker it gives none/);
  assert.match(individual['take-home-pay'].description,
    /For 2025-26 every pay takes the study loan component from 24 September 2025, and so do the year's withholding/);
  for (const limit of [/first home super saver/, /family trust distribution tax/, /super lump sum/, /debt still owed/,
    /Medicare levy exemption/, /working holiday maker who is an Australian resident or has other income/]) {
    assert.match(individual['income-tax'].description, limit);
  }
  for (const limit of [/Without datedPay, employer super is an annual estimate/,
    /52, 26 or 12 pays a year; a 53rd weekly or 27th fortnightly pay is not computed by this annualisation/]) {
    assert.match(individual['take-home-pay'].description, limit);
  }
});

test('take-home pay tool reports the dated super contribution basis', async () => {
  const tool = individual['take-home-pay'];
  const input = { incomeYear: '2025-26', residency: 'resident', salary: '260000' };
  const annual = await tool.execute(input);
  assert.equal(annual.superGuarantee, '30000.00');
  assert.ok(!Object.hasOwn(annual, 'superGuaranteeBasis'));
  const datedPay = ['2025-09-30', '2025-10-01', '2026-01-01', '2026-04-01'].map((payday, i) => ({
    payday, grossSalary: i % 2 === 0 ? '70000' : '60000', superEarnings: i % 2 === 0 ? '70000' : '60000',
  }));
  const dated = await tool.execute({ ...input, datedPay });
  assert.equal(dated.superGuarantee, '29400.00');
  assert.equal(dated.superGuaranteeBasis, 'dated-quarterly-earnings');
  assert.equal(dated.division293TaxableContributions, '29400.00');
  assert.equal(dated.takeHomeYear, annual.takeHomeYear);
  await assert.rejects(tool.execute({ ...input, datedPay: [{ ...datedPay[0], grossSalary: 70000 }] }), /grossSalary/);
  await assert.rejects(tool.execute({ ...input, datedPay, includesSuper: true }), /super is paid on top/);
});

// ATO, 'When you must repay your loan' (last updated 13 October 2026, read 19 November 2026): Christina's $73,810.
test('income tests tool returns the page worked example and refuses what the page refuses', async () => {
  const tool = individual['income-tests'];
  const r = await tool.execute({ taxableIncome: 50420, netFinancialInvestmentLoss: 1250, reportableFringeBenefitsOther: 4560,
    exemptForeignEmploymentIncome: 2580, targetForeignIncome: 2580, reportableEmployerSuperContributions: 15000,
    assessableIncome: 50420 });
  assert.deepEqual([r.repaymentIncome, r.incomeForSurchargePurposes, r.division293Income, r.rebateIncome,
    r.adjustedTaxableIncome, r.coContributionTotalIncome, r.source],
  ['73810.00', '71230.00', '56230.00', '71230.00', '73810.00', '69980.00',
    'https://duguid.com.au/tools/individual-tax/income-tests/']);
  const exempt = await tool.execute({ taxableIncome: 40000, assessableIncome: 40000, reportableFringeBenefitsSection57a: 4567 });
  assert.deepEqual([exempt.adjustedFringeBenefitsTotal, exempt.rebateIncome], ['2420.00', '42420.00']);
  assert.equal((await tool.execute({ taxableIncome: 0, childSupportPaid: 1000 })).adjustedTaxableIncome, '-1000.00');
  await assert.rejects(tool.execute({ taxableIncome: 2, assessableIncome: 1 }), /cannot exceed assessable income/);
  await assert.rejects(tool.execute({ taxableIncome: 1.5 }), /taxableIncome must be a whole number/);
  await assert.rejects(tool.execute({ taxableIncome: 1, residency: 'foreign' }), /residency is not an input of this tool/);
  await assert.rejects(tool.execute({}), /taxableIncome is required/);
  assert.match(tool.description, /resident in Australia all year/);
});

test('individual tax tools refuse a year they do not offer, cents of taxable income and an unknown input', async () => {
  const tax = individual['income-tax'];
  await assert.rejects(tax.execute({ incomeYear: '2019-20', residency: 'resident', taxableIncome: 1 }), /incomeYear does not match/);
  await assert.rejects(tax.execute({ incomeYear: '2026-27', residency: 'resident', taxableIncome: 1.5 }), /taxableIncome must be a whole number/);
  await assert.rejects(tax.execute({ incomeYear: '2026-27', residency: 'resident', taxableIncome: '1' }), /taxableIncome must be a whole number/);
  await assert.rejects(tax.execute({ incomeYear: '2026-27', residency: 'resident', taxableIncome: 1, spouse: true }),
    /spouse is not an input of this tool/);
  const pay = individual['take-home-pay'];
  await assert.rejects(pay.execute({ incomeYear: '2020-21', residency: 'resident', salary: '1' }), /incomeYear does not match/);
  await assert.rejects(pay.execute({ incomeYear: '2026-27', residency: 'resident', salary: '1000', salarySacrifice: '1000.01' }),
    /no more than the salary/);
  await assert.rejects(pay.execute({ incomeYear: '2026-27', residency: 'resident', salary: '1', payPeriod: 'quarter' }),
    /payPeriod does not match/);
});

test('super projection tool gives the page’s worked example and refuses what the page refuses', async () => {
  const tool = individual['super-projection'];
  const r = await tool.execute({ age: 30, balance: '50000', salary: 80000 });
  assert.deepEqual([r.yearsProjected, r.balanceAtRetirement, r.presentValue, r.source],
    [37, '2068319.69', '539266.80', 'https://duguid.com.au/tools/individual-tax/super-projection/']);
  const year = await tool.execute({ age: 66, balance: '50000', salary: 80000 });
  assert.deepEqual([year.employerContributionsFirstYear, year.balanceAtRetirement], ['9600.00', '60829.25']);
  assert.equal((await tool.execute({ age: 30, retirementAge: 59, balance: '50000', salary: 80000 })).retirementAge, 60);
  await assert.rejects(tool.execute({ age: 30, retirementAge: 76, balance: '50000', salary: 80000 }), /retirementAge/);
  await assert.rejects(tool.execute({ age: 30, balance: '50000', salary: 80000, salarySacrifice: '30000' }), /\$32,500 cap/);
  await assert.rejects(tool.execute({ age: 30, balance: 50000, salary: 80000 }), /balance/);
  assert.match(tool.description, /not a prediction or a recommendation/);
});

test('salary packaging tool gives the ATO’s FBT example and refuses what the page refuses', async () => {
  const tool = individual['salary-packaging'];
  const ato = await tool.execute({ incomeYear: '2026-27', residency: 'resident', employer: 'charity', salary: 80000,
    typeOneBenefits: '7700', typeTwoBenefits: '9000', mealEntertainment: '3300', mealEntertainmentTypeOne: false });
  assert.deepEqual([ato.grossedUp, ato.mealEntertainmentAllowed, ato.liableToFbt, ato.fbt, ato.reportableFringeBenefits, ato.source],
    ['39226.00', '5000.00', '4226.00', '1986.22', '37735.00', 'https://duguid.com.au/tools/individual-tax/salary-packaging/']);
  const filled = await tool.execute({ incomeYear: '2026-27', residency: 'resident', employer: 'charity', salary: 70000,
    typeTwoBenefits: '15899.93' });
  assert.deepEqual([filled.fbt, filled.gainAfterFbt], ['0.00', '5291.50']);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', residency: 'resident', employer: 'rebatable', salary: 1 }),
    /employer does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2021-22', residency: 'resident', employer: 'charity', salary: 1 }),
    /incomeYear does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', residency: 'resident', employer: 'charity' }), /salary/);
  assert.match(tool.description, /rebatable or ordinary employers/);
  assert.match(tool.inputSchema.properties.employer.description, /predominantly in or supporting its ambulance services/);
});

test('novated lease tool tests the electric car exemption and refuses what the page refuses', async () => {
  const tool = individual['novated-lease'];
  const car = { incomeYear: '2026-27', residency: 'resident', salary: 100000, car: 'bev', firstHeldAndUsed: '2022-07-01',
    firstSaleYear: '2026-27', costPrice: '60000', daysAvailable: 365, costsWithGst: '15000', costsWithoutGst: '1000' };
  const bev = await tool.execute(car);
  assert.deepEqual([bev.exempt, bev.statutoryValue, bev.exemptCase.saving, bev.exemptCase.reportableFringeBenefits,
    bev.employeeContributionMethod.saving, bev.source],
    [true, '12000.00', '6047.48', '22641.00', '1465.69', 'https://duguid.com.au/tools/individual-tax/novated-lease/']);
  const phev = await tool.execute({ ...car, car: 'phev' });
  assert.deepEqual([phev.exempt, phev.exemptCase], [false, null]);
  assert.match(phev.reasonNotExempt, /commitment/);
  assert.equal((await tool.execute({ ...car, car: 'phev', phevCommitment: true, firstSaleYear: '2024-25' })).exempt, true);
  const taxed = { ...car, luxuryCarTaxOnOtherSupply: true };
  assert.match((await tool.execute({ ...taxed, luxuryCarTaxTiming: 'before-all' })).reasonNotExempt, /another supply or an importation/);
  assert.equal((await tool.execute({ ...taxed, luxuryCarTaxTiming: 'after-all' })).exempt, true);
  await assert.rejects(tool.execute(taxed), /one treatment for the year/);
  await assert.rejects(tool.execute({ ...taxed, luxuryCarTaxTiming: 'mixed-or-unknown' }), /one treatment for the year/);
  await assert.rejects(tool.execute({ ...car, luxuryCarTaxTiming: 'before-all' }), /timing needs a taxable first retail sale/);
  await assert.rejects(tool.execute({ ...car, car: 'diesel' }), /car does not match/);
  await assert.rejects(tool.execute({ ...car, costPrice: undefined }), /costPrice/);
  await assert.rejects(tool.execute({ ...car, firstHeldAndUsed: undefined }), /firstHeldAndUsed/);
  const lastDay = { ...car, firstHeldAndUsed: '2027-03-31', daysAvailable: 1 };
  assert.equal((await tool.execute(lastDay)).statutoryValue, '32.88');
  await assert.rejects(tool.execute({ ...lastDay, firstHeldAndUsed: '2027-04-01' }), /no car benefit in the FBT year/);
  assert.match(tool.description, /employee contribution method/);
});

test('bonus withholding tool gives the ATO’s Schedule 5 examples and refuses what the page refuses', async () => {
  const tool = individual['bonus-withholding'];
  const jarrod = await tool.execute({ payPeriod: 'week', residency: 'resident', studyLoan: true, method: 'A', earnings: '1400',
    additionalPayment: '900' });
  assert.deepEqual([jarrod.withheldOnEarnings, jarrod.beforeLimit, jarrod.limit, jarrod.withheldOnAdditionalPayment,
    jarrod.totalWithheld], ['277.00', '364.00', '423.00', '364.00', '641.00']);
  const bradley = await tool.execute({ payPeriod: 'month', residency: 'resident', studyLoan: true, method: 'B', earnings: '7000',
    backPayPays: 2, backPayEach: '800', backPayPayEarnings: '6200', backPayPayWithheld: '1257', additionalPayment: '8800',
    earningsToDate: '19400', paysToDate: 3 });
  assert.deepEqual([bradley.methodBi, bradley.methodBii, bradley.totalWithheld], ['754.00', '4104.00', '6492.00']);
  await assert.rejects(tool.execute({ payPeriod: 'year', residency: 'resident', method: 'A', earnings: '1' }), /payPeriod does not match/);
  await assert.rejects(tool.execute({ payPeriod: 'week', residency: 'working-holiday', method: 'A', earnings: '1' }),
    /residency does not match/);
  await assert.rejects(tool.execute({ payPeriod: 'month', residency: 'resident', method: 'A', earnings: '1', additionalPayment: '1',
    spreadOverPays: 13 }), /between 2 and 12/);
  assert.match(tool.description, /does not compute scales 1, 5 or 6, a payee without a tax file number, a working holiday maker/);
});

test('Division 293 tool gives the ATO’s example and refuses what the page refuses', async () => {
  const tool = individual['division-293'];
  const jan = await tool.execute({ incomeYear: '2026-27', accumulationOnly: true, taxableIncome: 240000,
    concessionalContributions: '15000' });
  assert.deepEqual([jan.division293Income, jan.taxableContributions, jan.division293Tax, jan.source],
    ['240000.00', '5000.00', '750.00', 'https://duguid.com.au/tools/individual-tax/division-293/']);
  const carried = await tool.execute({ incomeYear: '2026-27', accumulationOnly: true, taxableIncome: 210000,
    reportableFringeBenefits: 33000, concessionalContributions: '45000', unusedCapCarriedForward: '20000',
    totalSuperBalanceUnder500k: true });
  assert.deepEqual([carried.unusedCapApplied, carried.excessConcessionalContributions, carried.division293Tax],
    ['12500.00', '0.00', '5700.00']);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', accumulationOnly: false, taxableIncome: 1, concessionalContributions: '1' }),
    /Subdivisions 293-D to 293-F/);
  await assert.rejects(tool.execute({ incomeYear: '2027-28', accumulationOnly: true, taxableIncome: 1, concessionalContributions: '1' }),
    /incomeYear does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', accumulationOnly: true, taxableIncome: 1 }), /concessionalContributions/);
  assert.match(tool.description, /defined benefit interests/);
});

test('sole trader tool returns the page worked example and the GST share of each invoice', async () => {
  const tool = individual['sole-trader'];
  const r = await tool.execute({ incomeYear: '2026-27', businessIncome: '22000', businessExpenses: '2000', wages: '60000',
    invoice: '1000' });
  assert.deepEqual([r.taxableIncome, r.smallBusinessIncomeTaxOffset, r.businessTax, r.setAsideQuarter, r.invoiceSharePercent,
    r.setAsideFromInvoice], ['79000.00', '576.00', '5939.00', '1484.75', '27.00', '269.95']);
  const gst = await tool.execute({ incomeYear: '2026-27', businessIncome: '90000', businessExpenses: '15000',
    registeredForGst: true, gstCredits: '1200', invoice: '1100' });
  assert.deepEqual([gst.gst, gst.setAsideYear, gst.invoiceSharePercent, gst.setAsideFromInvoice],
    ['7800.00', '21320.00', '21.54', '236.89']);
  const none = await tool.execute({ incomeYear: '2026-27', businessIncome: '22000', smallBusinessOffset: false });
  assert.equal(none.smallBusinessIncomeTaxOffset, '0.00');
  // The unit test's 2025-26 case: $10,000 of contributions joins repayment and surcharge income.
  const contributions = await tool.execute({ incomeYear: '2025-26', businessIncome: '110000',
    personalSuperContributions: '10000', studyLoan: true, privateHospitalCover: false });
  assert.deepEqual([contributions.taxableIncome, contributions.businessTax], ['100000.00', '29238.00']);
  for (const limit of [/refuses a business loss/, /all sales are taxable supplies/, /at most \$1,000/]) {
    assert.match(tool.description, limit);
  }
});

test('sole trader tool refuses a year it does not offer, a loss, a number for an amount and an unknown input', async () => {
  const tool = individual['sole-trader'];
  await assert.rejects(tool.execute({ incomeYear: '2020-21', businessIncome: '1' }), /incomeYear does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', businessIncome: '1', businessExpenses: '2' }), /a loss is not worked here/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', businessIncome: 1 }), /businessIncome does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', businessIncome: '1', residency: 'resident' }),
    /residency is not an input of this tool/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', businessIncome: '1', gstCredits: '1' }), /not registered for GST/);
});

test('llms.txt and the agent tooling notes name every calculator tool', () => {
  const names = [...Object.values(tools), declineInValue, levy, ...Object.values(individual)].map(t => t.name);
  const llms = readFileSync(new URL('../llms.txt', import.meta.url), 'utf8');
  const notes = readFileSync(new URL('../docs/agent-tooling.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.ok(llms.includes(`${names.length} read-only calculator tools`), `llms.txt should count ${names.length} tools`);
  for (const name of names) {
    assert.ok(llms.includes(`\`${name}\``), `llms.txt ${name}`);
    assert.ok(notes.includes(`\`${name}\``), `docs/agent-tooling.md ${name}`);
  }
});

// The fuel tax credit page's example (from 3 August 2026) and the ATO's Jim by the basic method, then refusals.
test('fuel tax credit tool returns the page worked example and the basic method, and refuses what the page refuses', async () => {
  const tool = calculatorTools(calculate)['fuel-tax-credits'];
  const r = await tool.execute({ year: '2026-27', lines: [{ fuel: 'diesel', use: 'heavy_vehicle_public_road', acquired: '2026-09-15', quantity: '10000' },
    { fuel: 'diesel', use: 'other_business', acquired: '2026-09-15', quantity: '2000' }] });
  assert.deepEqual([r.fuelTaxCredits, r.label7d, r.lines.map((l) => [l.rateCents, l.credit]), r.currency, r.timeLimitLines],
    ['3204.00', '3204', [['21.3', '2130.00'], ['53.7', '1074.00']], 'AUD', null]);
  assert.equal(r.source, 'https://duguid.com.au/tools/business-calculators/fuel-tax-credits/');
  const jim = await tool.execute({ year: '2026-27', smallClaimant: true, lines: [{ method: 'basic_heavy_vehicle', fuel: 'diesel', acquired: '2026-09-30',
    litres: '11430', totalKm: '32000', rigidTruckGrossWeightTonnes: '32' }] });
  assert.deepEqual([jim.fuelTaxCredits, jim.lines[0].publicRoadLitres, jim.lines[0].otherLitres], ['2567.17', '11020.8', '409.2']);
  const base = { year: '2026-27', lines: [{ fuel: 'diesel', use: 'other_business', acquired: '2027-02-01', quantity: '100' }] };
  await assert.rejects(tool.execute(base), /no published rate is held/);
  await assert.rejects(tool.execute({ ...base, lines: [{ ...base.lines[0], quantity: 100 }] }), /quantity does not match its description/);
  await assert.rejects(tool.execute({ ...base, vehicle: 'truck' }), /vehicle is not an input of this tool/);
});

test('study loan tool returns the page worked examples and refuses invalid or unknown inputs', async () => {
  const tool = individual['study-loan'];
  const marginal = await tool.execute({ incomeYear: '2026-27', taxableIncome: 60470, reportableFringeBenefits: 5400,
    totalNetInvestmentLoss: 1330, reportableSuperContributions: 16500, exemptForeignEmploymentIncome: 2680 });
  assert.deepEqual([marginal.repaymentIncome, marginal.compulsoryRepayment, marginal.method, marginal.currency, marginal.source],
    ['86380.00', '2527.80', 'marginal', 'AUD', 'https://duguid.com.au/tools/individual-tax/study-loan/']);
  const branson = await tool.execute({ incomeYear: '2024-25', taxableIncome: 99736 });
  assert.deepEqual([branson.compulsoryRepayment, branson.method], ['5485.48', 'percent-of-income']);
  await assert.rejects(tool.execute({ incomeYear: '2019-20', taxableIncome: 70000 }), /incomeYear does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', taxableIncome: '70000' }), /taxableIncome must be a whole number/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', taxableIncome: 70000, debtBalance: 10000 }), /debtBalance is not an input of this tool/);
});

test('concessional catch-up tool returns Sam’s example, enforces the $500k cap and refuses invalid or unknown inputs', async () => {
  const tool = individual['concessional-catch-up'];
  const earlierYears = [
    { year: '2019-20', contributions: '11000' }, { year: '2020-21', contributions: '12000' },
    { year: '2021-22', contributions: '13000' }, { year: '2022-23', contributions: '14000' },
    { year: '2023-24', contributions: '15000' },
  ];
  const sam = await tool.execute({ incomeYear: '2024-25', totalSuperBalance: '450000', concessionalContributions: '97500', earlierYears });
  assert.deepEqual([sam.generalCap, sam.carriesForward, sam.unusedCapCarriedForward, sam.availableCap, sam.remainingCap,
    sam.excessConcessionalContributions, sam.source],
  ['30000.00', true, '67500.00', '97500.00', '0.00', '0.00', 'https://duguid.com.au/tools/individual-tax/concessional-catch-up/']);
  const over = await tool.execute({ incomeYear: '2024-25', totalSuperBalance: '500000', concessionalContributions: '40000',
    proposedContribution: '5000', earlierYears });
  assert.deepEqual([over.carriesForward, over.availableCap, over.excessConcessionalContributions, over.withProposal, over.excessWithProposal],
    [false, '30000.00', '10000.00', '45000.00', '15000.00']);
  await assert.rejects(tool.execute({ incomeYear: '2024-25', totalSuperBalance: '450000', concessionalContributions: '30000',
    definedBenefit: true, earlierYears }), /Subdivision 291-C/);
  await assert.rejects(tool.execute({ incomeYear: '2024-25', totalSuperBalance: 450000, concessionalContributions: '30000', earlierYears }),
    /totalSuperBalance does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2024-25', totalSuperBalance: '450000', concessionalContributions: '30000',
    earlierYears, extraField: true }), /extraField is not an input of this tool/);
});

test('lump sum arrears tool returns the page worked example, nil below 10% and refuses invalid or unknown inputs', async () => {
  const tool = individual['lump-sum-arrears'];
  const accrualYears = [
    { year: '2023-24', arrears: 3000, taxableIncome: 30000 }, { year: '2022-23', arrears: 2500, taxableIncome: 17000 },
    { year: '2021-22', arrears: 1400 }, { year: '2020-21', arrears: 1700 },
    { year: '2019-20', arrears: 1400 }, { year: '2018-19', arrears: 1000 },
  ];
  const r = await tool.execute({ receiptYear: '2025-26', taxableIncome: 100000, australianResidentAllYears: true, accrualYears });
  assert.deepEqual([r.totalArrears, r.taxOnArrears, r.notionalTaxTotal, r.offset, r.distantYears.amount, r.recentRatesPercent.average, r.source],
    ['11000.00', '3300.00', '1611.75', '1688.25', '794.75', '14.45', 'https://duguid.com.au/tools/individual-tax/lump-sum-arrears/']);
  const below = await tool.execute({ receiptYear: '2025-26', taxableIncome: 1000000, australianResidentAllYears: true, accrualYears });
  assert.deepEqual([below.thresholdMet, below.offset, below.taxOnArrears], [false, '0.00', null]);
  await assert.rejects(tool.execute({ receiptYear: '2025-26', taxableIncome: 100000, australianResidentAllYears: false, accrualYears }),
    /resident in Australia for the whole/);
  await assert.rejects(tool.execute({ receiptYear: '2025-26', taxableIncome: 100000, australianResidentAllYears: true,
    hasOtherExcludedAmounts: true, accrualYears }), /employment termination payment/);
  await assert.rejects(tool.execute({ receiptYear: '2025-26', taxableIncome: 100000, australianResidentAllYears: true,
    accrualYears, resident: true }), /resident is not an input of this tool/);
});

test('FHSS tool handles stated and estimate modes, serialises JSON cleanly and refuses invalid or unknown inputs', async () => {
  const tool = individual.fhss;
  const stated = await tool.execute({ mode: 'stated', scopeConfirmed: true, determinationDate: '2025-06-20',
    concessional: '8500', nonConcessional: '5000', associatedEarnings: '850', withholdingBasis: 'unable', debtOffset: '0' });
  assert.deepEqual([stated.maximumReleaseAmount, stated.assessableFhssReleasedAmount, stated.taxWithheld, stated.paidToYou,
    stated.fhssTaxOffset, stated.fhssTaxIfNotUsed, stated.recontributionRequired, stated.source],
  ['14350.00', '9350.00', '1589.00', '12761.00', '2805.00', '1870.00', '7761.00', 'https://duguid.com.au/tools/individual-tax/fhss/']);
  const est = await tool.execute({ mode: 'estimate', scopeConfirmed: true, determinationDate: '2024-01-02',
    determinationRequested: '2024-01-02', withholdingBasis: 'unable',
    contributions: [{ date: '2024-01-01', amount: '7000', kind: 'personal' }, { date: '2024-01-02', amount: '7000', kind: 'personal' }] });
  assert.deepEqual([est.maximumReleaseAmount, est.contributions.length, est.contributions[0].counted], ['14004.00', 2, '7000.00']);
  assert.doesNotThrow(() => JSON.stringify(est));
  const split = await tool.execute({ mode: 'estimate', scopeConfirmed: true, determinationDate: '2024-01-02',
    determinationRequested: '2024-01-02', withholdingBasis: 'marginal', marginalPercent: '32.5',
    contributions: [{ date: '2023-09-01', amount: '10000', kind: 'personal' }],
    deductions: [{ financialYear: '2023-24', amount: '4000' }] });
  assert.equal(split.contributions.length, 2);
  assert.equal(split.contributions[0].row, split.contributions[1].row);
  assert.notEqual(split.contributions[0].deemedEarnings, null);
  assert.equal(split.contributions[1].deemedEarnings, null);
  await assert.rejects(tool.execute({ mode: 'stated', scopeConfirmed: false, determinationDate: '2025-06-20',
    concessional: '8500', nonConcessional: '5000', associatedEarnings: '850', withholdingBasis: 'unable' }), /scope conditions/);
  await assert.rejects(tool.execute({ mode: 'stated', scopeConfirmed: true, determinationDate: '2025-06-20',
    concessional: '8500', nonConcessional: '5000', associatedEarnings: '850', withholdingBasis: 'unable',
    contributions: [{ date: '2024-01-01', amount: '7000', kind: 'personal' }] }), /applies only when mode is "estimate"/);
  await assert.rejects(tool.execute({ mode: 'estimate', scopeConfirmed: true, determinationDate: '2024-01-02',
    determinationRequested: '2024-01-02', withholdingBasis: 'unable', concessional: '5000',
    contributions: [{ date: '2024-01-01', amount: '7000', kind: 'personal' }] }), /applies only when mode is "stated"/);
  await assert.rejects(tool.execute({ mode: 'stated', scopeConfirmed: true, determinationDate: '2025-06-20',
    concessional: '8500', nonConcessional: '5000', associatedEarnings: '850', withholdingBasis: 'unable', marginalPercent: '30' }),
  /marginalPercent applies only when withholdingBasis is "marginal"/);
  await assert.rejects(tool.execute({ mode: 'stated', scopeConfirmed: true, determinationDate: '2025-06-20',
    concessional: '8500', nonConcessional: '5000', associatedEarnings: '850', withholdingBasis: 'unable', withholdingAmount: '500' }),
  /withholdingAmount applies only when withholdingBasis is "supplied_estimate" or "actual"/);
  await assert.rejects(tool.execute({ mode: 'stated', scopeConfirmed: true, determinationDate: '2025-06-20',
    concessional: '8500', nonConcessional: '5000', associatedEarnings: '850', withholdingBasis: 'unable', transition: 'ordinary' }),
  /transition applies only to determinations before 2024-09-15/);
  await assert.rejects(tool.execute({ mode: 'stated', scopeConfirmed: true, determinationDate: '2025-06-20',
    concessional: '8500', nonConcessional: '5000', associatedEarnings: '850', withholdingBasis: 'unable', unknownKey: 1 }),
  /unknownKey is not an input of this tool/);
});

test('work expenses tool covers all 4 methods and refuses cross-method, expired or unknown inputs', async () => {
  const tool = individual['work-expenses'];
  const wfh = await tool.execute({ method: 'home_office', incomeYear: '2025-26', scopeConfirmed: true, hours: '843',
    runningExpensesIncurred: true });
  assert.deepEqual([wfh.amounts.fixed_rate_method, wfh.amounts.fixed_rate_return_amount, wfh.higherMethod, wfh.source],
    ['590.10', '590.00', 'fixed_rate', 'https://duguid.com.au/tools/individual-tax/work-expenses/']);
  const cpk = await tool.execute({ method: 'car_cents_per_kilometre', incomeYear: '2025-26', scopeConfirmed: true,
    ownedOrLeased: true, businessKilometres: '2514' });
  assert.deepEqual([cpk.amounts.return_amount, cpk.kilometresDiscarded], ['2212.00', false]);
  const log = await tool.execute({ method: 'car_log_book', incomeYear: '2025-26', scopeConfirmed: true, ownedOrLeased: true,
    businessKilometres: '2514', totalKilometres: '10000', carExpenses: '17275.33', logBookYear: '2025-26', logBookWeeks: 12,
    logBookRepresentative: true });
  assert.deepEqual([log.amounts.business_use_percentage, log.logBookValidTo], ['25.14', '2029-30']);
  const edu = await tool.execute({ method: 'self_education', incomeYear: '2021-22', scopeConfirmed: true,
    connection: 'maintains_or_improves_skills', employedWhenIncurred: true, categoryA: '290', prescribedCourse: true });
  assert.deepEqual([edu.amounts.return_amount, edu.reductionApplies], ['40.00', true]);
  await assert.rejects(tool.execute({ method: 'home_office', incomeYear: '2025-26', scopeConfirmed: true, hours: '843',
    runningExpensesIncurred: true, businessKilometres: '100' }), /is not an input of work-expenses/);
  await assert.rejects(tool.execute({ method: 'car_log_book', incomeYear: '2025-26', scopeConfirmed: true, ownedOrLeased: true,
    businessKilometres: '2514', totalKilometres: '10000', carExpenses: '1000', logBookYear: '2020-21', logBookWeeks: 12,
    logBookRepresentative: true }), /serves that year and the next 4 only/);
  await assert.rejects(tool.execute({ method: 'car_log_book', incomeYear: '2025-26', scopeConfirmed: true, ownedOrLeased: true,
    businessKilometres: '2514', totalKilometres: '10000', carExpenses: '1000', logBookYear: '2025-26', logBookWeeks: 11,
    logBookRepresentative: true }), /logBookWeeks must be a whole number from 12 to 53/);
  await assert.rejects(tool.execute({ method: 'home_office', incomeYear: '2025-26', scopeConfirmed: true, hours: '843',
    runningExpensesIncurred: true, rent: '500' }), /rent is not an input of this tool/);
});

test('government super tool returns co-contribution, LISTO and spouse offset and refuses invalid or unknown inputs', async () => {
  const tool = individual['government-super'];
  const base = { incomeYear: '2023-24', scopeConfirmed: true, residency: 'full_year_resident', assessableIncome: 35000,
    taxableIncome: 35000, eligibleIncome: '35000', personalContributions: '1040', returnLodged: true, under71: true,
    nonConcessionalWithinCap: 'yes', totalSuperBalanceBelowCap: 'yes' };
  const r = await tool.execute(base);
  assert.deepEqual([r.amounts.co_contribution, r.amounts.co_contribution_paid, r.amounts.listo, r.thresholds.lowerIncomeThreshold, r.source],
    ['500.00', '500.00', '0.00', '43445', 'https://duguid.com.au/tools/individual-tax/government-super/']);
  const withSpouse = await tool.execute({ ...base, incomeYear: '2025-26', assessableIncome: 50000, taxableIncome: 50000,
    eligibleIncome: '50000', personalContributions: '1000', spouse: { contributions: '3000', assessableIncome: '39999',
      nonConcessionalWithinCap: 'yes', totalSuperBalanceBelowCap: 'yes' } });
  assert.deepEqual([withSpouse.amounts.co_contribution, withSpouse.amounts.co_contribution_paid, withSpouse.amounts.spouse_contribution_offset],
    ['416.28', '416.30', '0.18']);
  await assert.rejects(tool.execute({ ...base, temporaryVisaHeld: true }), /New Zealand citizens/);
  await assert.rejects(tool.execute({ ...base, totalSuperBalanceBelowCap: 'unknown' }), /was not given/);
  await assert.rejects(tool.execute({ ...base, residency: 'foreign_resident' }), /whole year only/);
  await assert.rejects(tool.execute({ ...base, superFund: 'example' }), /superFund is not an input of this tool/);
});

test('ASIC fees tool returns standard and late fee worked examples and refuses invalid or mismatched inputs', async () => {
  const tool = tools['asic-fees'];
  const late = await tool.execute({ fee: 'late-review-payment', dueDate: '2026-09-15', receivedDate: '2026-10-15' });
  assert.deepEqual([late.code, late.amount, late.tier, late.firstMonthEnds, late.gstApplies, late.currency, late.source],
    ['LPF1_ETM', '102.00', 'within one month', '2026-10-15', false, 'AUD', 'https://duguid.com.au/tools/business-calculators/asic-fees/']);
  assert.doesNotThrow(() => JSON.stringify(late));
  const reg = await tool.execute({ fee: 'company-share-capital' });
  assert.deepEqual([reg.code, reg.amount, reg.tier, reg.firstMonthEnds], ['I02', '636.00', null, null]);
  await assert.rejects(tool.execute({ fee: 'company-share-capital', dueDate: '2026-09-15' }), /apply only to late-review-payment/);
  await assert.rejects(tool.execute({ fee: 'late-lodgement', dueDate: '2026-09-15' }), /dueDate and receivedDate are required/);
  await assert.rejects(tool.execute({ fee: 'late-payment' }), /fee does not match/);
  await assert.rejects(tool.execute({ fee: 'company-share-capital', gst: true }), /gst is not an input of this tool/);
});

test('ATO penalties and interest tool covers all 6 questions and refuses cross-question or unknown inputs', async () => {
  const tool = tools['ato-penalties-interest'];
  const gic = await tool.execute({ question: 'gic', incomeYear: '2025-26', amount: '10000', dueDate: '2025-11-21', toDate: '2026-06-30' });
  assert.deepEqual([gic.gic, gic.paid, gic.balance, gic.days, gic.currency, gic.source],
    ['676.86', '0.00', '10676.86', 222, 'AUD', 'https://duguid.com.au/tools/business-calculators/ato-penalties-interest/']);
  assert.doesNotThrow(() => JSON.stringify(gic));
  const sic = await tool.execute({ question: 'sic', incomeYear: '2025-26', amount: '10000', dueDate: '2025-11-21', noticeDate: '2026-05-20' });
  assert.equal(sic.days, 180);
  assert.doesNotThrow(() => JSON.stringify(sic));
  const ftl = await tool.execute({ question: 'failure_to_lodge', incomeYear: '2026-27', dueDate: '2026-07-15', givenOn: '2026-08-20', entitySize: 'medium' });
  assert.deepEqual([ftl.penaltyUnits, ftl.multiplier, ftl.basePenaltyAmount, ftl.penalty], [2, 2, '728.00', '1456.00']);
  const stmt = await tool.execute({ question: 'statement_penalty', incomeYear: '2026-27', statementDate: '2026-08-01',
    significantGlobalEntity: false, parts: [{ shortfallAmount: '10000', behaviour: 'recklessness' }] });
  assert.deepEqual([stmt.basePenaltyAmount, stmt.penalty], ['5000.00', '5000.00']);
  const epi = await tool.execute({ question: 'early_payment_interest', incomeYear: '2025-26', amount: '5000',
    liability: 'income_tax', paidOn: '2025-10-01', dueDate: '2025-11-21', fullSelfAssessment: true });
  assert.equal(epi.entitled, true);
  const opi = await tool.execute({ question: 'overpayment_interest', incomeYear: '2025-26',
    payments: [{ date: '2025-10-01', amount: '5000' }], refunded: '2000', refundedOn: '2026-02-01',
    noticeIssued: '2025-10-15', relevantTax: true, decisionToWhichActApplies: true });
  assert.equal(opi.refunded, '2000.00');
  assert.doesNotThrow(() => JSON.stringify(opi));
  await assert.rejects(tool.execute({ question: 'sic', incomeYear: '2025-26', amount: '10000', dueDate: '2025-11-21',
    noticeDate: '2026-05-20', entitySize: 'small' }), /is not an input of sic/);
  await assert.rejects(tool.execute({ question: 'remission', incomeYear: '2025-26' }), /question does not match/);
  await assert.rejects(tool.execute({ question: 'gic', incomeYear: '2025-26', amount: '10000', dueDate: '2025-11-21',
    toDate: '2026-06-30', extra: 1 }), /extra is not an input of this tool/);
});

test('business use tool returns the page worked example and refuses invalid or unknown inputs', async () => {
  const tool = tools['business-use'];
  const r = await tool.execute({ cost: '20.15', businessUsePercent: '50' });
  assert.deepEqual([r.businessUseShare, r.currency, r.source],
    ['10.08', 'AUD', 'https://duguid.com.au/tools/business-calculators/business-use/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  await assert.rejects(tool.execute({ cost: '20.15', businessUsePercent: '101' }), /100/);
  await assert.rejects(tool.execute({ cost: 20.15, businessUsePercent: '50' }), /cost does not match/);
  await assert.rejects(tool.execute({ cost: '20.15', businessUsePercent: '50', gst: true }), /gst is not an input of this tool/);
});

test('fixed fee tool returns the page worked example and refuses invalid or unknown inputs', async () => {
  const tool = tools['fixed-fee'];
  const r = await tool.execute({ hours: '18.5', rate: '95', marginPercent: '40', roundTo: '10', addGst: true, instalments: 12 });
  assert.deepEqual([r.feeBeforeGst, r.gst, r.feeIncludingGst, r.firstInstalment, r.remainingInstalment, r.effectiveHourlyRate, r.currency, r.source],
    ['2930.00', '293.00', '3223.00', '268.62', '268.58', '158.38', 'AUD', 'https://duguid.com.au/tools/business-calculators/fixed-fee/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const once = await tool.execute({ hours: '10', rate: '100' });
  assert.deepEqual([once.feeIncludingGst, once.remainingInstalment], ['1000.00', null]);
  await assert.rejects(tool.execute({ hours: '10', rate: '100', roundTo: '5' }), /roundTo does not match/);
  await assert.rejects(tool.execute({ hours: '10', rate: '100', instalments: 25 }), /instalments must be a whole number/);
  await assert.rejects(tool.execute({ hours: '10', rate: '100', discount: '5' }), /discount is not an input of this tool/);
});

test('franking account tool returns the page worked example, handles opening deficits and refuses invalid or unknown inputs', async () => {
  const tool = tools['franking-account'];
  const r = await tool.execute({
    incomeYear: '2025-26', entity: 'public', imputationRatePercent: '30', openingBalance: '10000',
    events: [
      { date: '2025-10-28', type: 'payg_instalment', amount: '125000' },
      { date: '2025-11-15', type: 'income_tax_refund', amount: '60000' },
      { date: '2026-02-28', type: 'payg_instalment', amount: '125000' },
      { date: '2026-03-31', type: 'streaming_determination', amount: '20000' },
      { date: '2026-04-28', type: 'payg_instalment', amount: '250000' },
    ],
    distributions: [{ date: '2025-09-30', amount: '1190000', frankingCredit: '510000' }],
  });
  assert.deepEqual([r.credits, r.debits, r.closingBalance, r.balanceCode, r.frankingDeficitTax, r.offsetReduction,
    r.frankingDeficitTaxOffset, r.labelK, r.frankingTaxPayable, r.dueDate, r.significantVariation, r.source],
  ['500000.00', '590000.00', '-80000.00', 'D', '80000.00', '18000.00', '62000.00', '20000.00', '80000.00',
    '2026-07-31', false, 'https://duguid.com.au/tools/business-calculators/franking-account/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const deficit = await tool.execute({ incomeYear: '2026-27', entity: 'private', imputationRatePercent: '25', openingBalance: '-5000' });
  assert.deepEqual([deficit.credits, deficit.closingBalance], ['5000.00', '0.00']);
  await assert.rejects(tool.execute({ incomeYear: '2025-26', entity: 'trust', imputationRatePercent: '30', openingBalance: '0' }),
    /entity does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2025-26', entity: 'public', imputationRatePercent: '30', openingBalance: '0',
    lastBenchmarkPercent: '50' }), /franking periods/);
  await assert.rejects(tool.execute({ incomeYear: '2025-26', entity: 'public', imputationRatePercent: '30', openingBalance: '0',
    extra: true }), /extra is not an input of this tool/);
});

test('GIC payment plan tool returns the page worked example and requires assumedAnnualRate after 2026', async () => {
  const tool = tools['gic-payment-plan'];
  const r = await tool.execute({ debt: '1000', startDate: '2026-10-01', instalments: 3, frequency: 'monthly', assumedAnnualRate: '11.51' });
  assert.deepEqual([r.instalment, r.finalInstalment, r.lastDate, r.totalPaid, r.gic, r.assumedDays, r.currency, r.source],
    ['336.56', '336.56', '2026-12-01', '1009.68', '9.68', 0, 'AUD', 'https://duguid.com.au/tools/business-calculators/gic-payment-plan/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const noAssumed = await tool.execute({ debt: '1000', startDate: '2026-10-01', instalments: 3, frequency: 'monthly' });
  assert.equal(noAssumed.gic, '9.68');
  await assert.rejects(tool.execute({ debt: '1000', startDate: '2026-11-01', instalments: 4, frequency: 'monthly' }),
    /assumedAnnualRate is required when the plan runs after 2026-12-31/);
  await assert.rejects(tool.execute({ debt: '1000', startDate: '2026-10-01', instalments: 3, frequency: 'quarterly' }),
    /frequency does not match/);
  await assert.rejects(tool.execute({ debt: '1000', startDate: '2026-10-01', instalments: 3, frequency: 'monthly', fee: '10' }),
    /fee is not an input of this tool/);
});

test('GST margin scheme tool returns the page worked example, checks valuation dates and refuses mismatched or unknown inputs', async () => {
  const tool = tools['gst-margin-scheme'];
  const r = await tool.execute({
    interest: 'freehold', taxable: true, agreedInWriting: true, acquired: 'margin',
    method: 'consideration', price: '190000', priceBasis: 'inclusive', cost: '400000', part: '200000', whole: '2000000',
  });
  assert.deepEqual([r.applies, r.acquisitionShare, r.margin, r.marginSchemeGst, r.gstWithoutScheme, r.gstSaving, r.gstPayable, r.currency, r.source],
    [true, '40000.00', '150000.00', '13636.36', '17272.73', '3636.37', '13636.36', 'AUD', 'https://duguid.com.au/tools/business-calculators/gst-margin-scheme/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const val = await tool.execute({
    interest: 'freehold', taxable: true, agreedInWriting: true, acquired: 'before-2000',
    method: 'valuation', price: '500000', priceBasis: 'inclusive', cost: '280000',
    valuationDay: '2000-07-01', registrationAtTransition: 'yes', valuationProperty: 'improved',
  });
  assert.equal(val.marginSchemeGst, '20000.00');
  await assert.rejects(tool.execute({
    interest: 'freehold', taxable: true, agreedInWriting: true, acquired: 'margin',
    method: 'consideration', price: '190000', priceBasis: 'inclusive', cost: '400000', valuationDay: '2000-07-01',
  }), /valuationDay applies only when method is "valuation"/);
  await assert.rejects(tool.execute({
    interest: 'freehold', taxable: true, agreedInWriting: true, acquired: 'margin',
    method: 'consideration', price: '190000', priceBasis: 'inclusive', cost: '400000', part: '1',
  }), /Supply both part and whole/);
  await assert.rejects(tool.execute({
    interest: 'freehold', taxable: true, agreedInWriting: true, acquired: 'margin', buyerIsAssociate: true,
    method: 'consideration', price: '190000', priceBasis: 'inclusive', cost: '400000',
  }), /section 75-13/);
  await assert.rejects(tool.execute({
    interest: 'freehold', taxable: true, agreedInWriting: true, acquired: 'margin',
    method: 'consideration', price: '190000', priceBasis: 'inclusive', cost: '400000', stampDuty: '1000',
  }), /stampDuty is not an input of this tool/);
});

test('hourly rate tool returns the page worked example and refuses invalid or unknown inputs', async () => {
  const tool = tools.hourly;
  const r = await tool.execute({ annualCosts: '20.15', targetProfit: '0', billableHours: '2' });
  assert.deepEqual([r.requiredHourlyRate, r.currency, r.source],
    ['10.08', 'AUD', 'https://duguid.com.au/tools/business-calculators/hourly/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  await assert.rejects(tool.execute({ annualCosts: '20.15', targetProfit: '0', billableHours: '0' }), /0\.01/);
  await assert.rejects(tool.execute({ annualCosts: '20.15', targetProfit: '0', billableHours: '2', gst: true }),
    /gst is not an input of this tool/);
});

test('luxury car tax tool returns the page worked example, handles refunds and refuses invalid or unknown inputs', async () => {
  const tool = tools['luxury-car-tax'];
  const r = await tool.execute({
    incomeYear: '2026-27',
    lines: [{ kind: 'sale', luxuryCarTaxValue: '88000' }, { kind: 'importation', luxuryCarTaxValue: '101500' }],
  });
  assert.deepEqual([r.onSales, r.label1e, r.label1f, r.onImportations, r.threshold, r.fuelEfficientLimit, r.currency, r.source],
    ['2157.30', '2157', '0', '6207.30', '80809.00', '91661.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/luxury-car-tax/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const refund = await tool.execute({
    incomeYear: '2026-27',
    lines: [{ kind: 'refund', claimant: 'primary_producer', refundEligibleCar: true, lctBorne: '12500' }],
  });
  assert.equal(refund.refunds, '10000.00');
  await assert.rejects(tool.execute({
    incomeYear: '2026-27',
    lines: [{ kind: 'refund', claimant: 'primary_producer', refundEligibleCar: true, lctBorne: '5000', fuelConsumptionLitresPer100km: '5' }],
  }), /is not an input of a refund/);
  await assert.rejects(tool.execute({ incomeYear: '2018-19', lines: [{ kind: 'sale', luxuryCarTaxValue: '88000' }] }),
    /incomeYear does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', lines: [{ kind: 'sale', luxuryCarTaxValue: '88000' }], extra: 1 }),
    /extra is not an input of this tool/);
});

test('margin and markup tool returns the page worked example, null on zero base and refuses invalid or unknown inputs', async () => {
  const tool = tools.margin;
  const r = await tool.execute({ sales: '100', directCost: '80' });
  assert.deepEqual([r.grossProfit, r.marginPercent, r.markupPercent, r.currency, r.source],
    ['20.00', '20.00', '25.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/margin/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const zeroCost = await tool.execute({ sales: '100', directCost: '0' });
  assert.deepEqual([zeroCost.marginPercent, zeroCost.markupPercent], ['100.00', null]);
  await assert.rejects(tool.execute({ sales: '-100', directCost: '80' }), /sales does not match/);
  await assert.rejects(tool.execute({ sales: '100', directCost: '80', gst: false }), /gst is not an input of this tool/);
});

test('objection deadline tool returns the page worked example, checks amended assessments and refuses mismatched or unknown inputs', async () => {
  const tool = tools['objection-deadline'];
  const r = await tool.execute({ decision: 'assessment', reviewPeriodYears: '2', noticeDate: '2026-11-18' });
  assert.deepEqual([r.rule, r.periodEnds, r.lastDay, r.amendedEnds, r.firstEnds, r.source],
    ['subparagraph 14ZW(1)(aa)(i)', '2028-11-18', '2028-11-20', null, null, 'https://duguid.com.au/tools/business-calculators/objection-deadline/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const amended = await tool.execute({ decision: 'amended', reviewPeriodYears: '2', noticeDate: '2026-11-18', firstNoticeDate: '2025-11-18' });
  assert.deepEqual([amended.rule, amended.amendedEnds, amended.firstEnds], ['subsection 14ZW(1BA)', '2027-01-17', '2027-11-18']);
  await assert.rejects(tool.execute({ decision: 'assessment', noticeDate: '2026-11-18' }), /reviewPeriodYears is required/);
  await assert.rejects(tool.execute({ decision: 'fbt', reviewPeriodYears: '4', noticeDate: '2026-11-18' }), /reviewPeriodYears applies only/);
  await assert.rejects(tool.execute({ decision: 'assessment', reviewPeriodYears: '2', noticeDate: '2026-11-18', firstNoticeDate: '2025-11-18' }),
    /firstNoticeDate applies only/);
  await assert.rejects(tool.execute({ decision: 'ruling', noticeDate: '2026-11-18' }), /decision does not match/);
  await assert.rejects(tool.execute({ decision: 'other', noticeDate: '2026-11-18', state: 'NSW' }), /state is not an input of this tool/);
});

test('budget variance tool returns the page worked example, supports negative values and refuses invalid or unknown inputs', async () => {
  const tool = tools.variance;
  const r = await tool.execute({ actual: '110', budget: '100', kind: 'income' });
  assert.deepEqual([r.difference, r.percentOfAbsoluteBudget, r.effect, r.currency, r.source],
    ['10.00', '10.00', 'Favourable', 'AUD', 'https://duguid.com.au/tools/business-calculators/variance/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const neg = await tool.execute({ actual: '-110', budget: '-100', kind: 'cost' });
  assert.deepEqual([neg.difference, neg.percentOfAbsoluteBudget, neg.effect], ['-10.00', '-10.00', 'Favourable']);
  const zero = await tool.execute({ actual: '50', budget: '0', kind: 'cost' });
  assert.deepEqual([zero.percentOfAbsoluteBudget, zero.effect], [null, 'Unfavourable']);
  await assert.rejects(tool.execute({ actual: '110', budget: '100', kind: 'expense' }), /kind does not match/);
  await assert.rejects(tool.execute({ actual: '1,100', budget: '100', kind: 'income' }), /actual does not match/);
  await assert.rejects(tool.execute({ actual: '110', budget: '100', kind: 'income', extra: 1 }), /extra is not an input of this tool/);
});

test('vehicle classifier tool returns the page worked example, matches form year limits and refuses invalid or unknown inputs', async () => {
  const tool = tools['vehicle-class'];
  const base = {
    incomeYear: '2026-27', body: 'passenger', seats: 5, grossVehicleMassKg: 3000, kerbWeightKg: 2135,
    price: '75000', gstCredit: 'full', fuelConsumption: 'other', privateUse: 'limited',
  };
  const r = await tool.execute(base);
  assert.deepEqual([r.designedLoadKg, r.isCar, r.designedForPassengers, r.carLimitApplies, r.carLimit, r.gstCredit,
    r.firstElementOfCost, r.luxuryCarTaxStatus, r.luxuryCarTaxThreshold, r.fbtTreatment, r.fbtExemptOnStatedUse, r.source],
  [865, true, true, true, '69883.00', '6353.00', '68647.00', 'under', '80809.00', 'car-benefit', false,
    'https://duguid.com.au/tools/business-calculators/vehicle-class/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const form = readFileSync('_includes/calculators/vehicle-class.html', 'utf8');
  for (const [, year, limit, efficient, other] of form.matchAll(/name="year" value="(\d{4}-\d{2})" data-car-limit="(\d+)" data-fuel-efficient="(\d+)" data-other="(\d+)"/g)) {
    const check = await tool.execute({ ...base, incomeYear: year, fuelConsumption: 'efficient' });
    assert.deepEqual([check.carLimit, check.luxuryCarTaxThreshold], [`${limit}.00`, `${efficient}.00`], year);
    const checkOther = await tool.execute({ ...base, incomeYear: year, fuelConsumption: 'other' });
    assert.equal(checkOther.luxuryCarTaxThreshold, `${other}.00`, year);
  }
  await assert.rejects(tool.execute({ ...base, modified: 'unplated' }), /compliance plate/);
  await assert.rejects(tool.execute({ ...base, body: 'truck' }), /body does not match/);
  await assert.rejects(tool.execute({ ...base, engine: 'diesel' }), /engine is not an input of this tool/);
});

test('wine equalisation tax tool returns the page worked example, supports average wholesale and refuses invalid or unknown inputs', async () => {
  const tool = tools['wine-equalisation-tax'];
  const rc = { producer: true, sourceProductOwned85Percent: true, containerAndTradeMark: true };
  const r = await tool.execute({
    incomeYear: '2026-27',
    dealings: [
      { kind: 'retail_sale', retailPriceIncludingWetAndGst: '20000', rebateConditions: rc },
      { kind: 'wholesale_sale', priceExcludingWetAndGst: '30000', rebateConditions: rc },
      { kind: 'quoted_sale', priceExcludingWetAndGst: '15000', purchaserIntention: 'taxable_dealing', rebateConditions: rc },
      { kind: 'quoted_sale', priceExcludingWetAndGst: '20000', purchaserIntention: 'gst_free_supply', rebateConditions: rc },
      { kind: 'own_use', retailPriceIncludingWetAndGst: '2000', rebateConditions: rc },
    ],
    rebateClaimedEarlierInYear: '0',
    associatedProducer: false,
  });
  assert.deepEqual([r.wineTax, r.label1c, r.rebateBeforeCap, r.rebate, r.label1d, r.cap, r.capLeft, r.currency, r.source],
    ['11890.00', '11890', '16240.00', '16240.00', '16240', '400000.00', '400000.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/wine-equalisation-tax/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const avg = await tool.execute({
    incomeYear: '2026-27',
    dealings: [{
      kind: 'own_use',
      averageWholesale: {
        grapeWine: true, wholesaleShareAtLeast10Percent: true, quantity: '10',
        wholesaleSales: [{ quantity: '100', priceExcludingWetAndGst: '1000' }],
      },
    }],
  });
  assert.deepEqual([avg.wineTax, avg.dealings[0].taxableValue], ['29.00', '100.00']);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', scopeConfirmed: false,
    dealings: [{ kind: 'wholesale_sale', priceExcludingWetAndGst: '100' }] }), /scope conditions/);
  await assert.rejects(tool.execute({ incomeYear: '2022-23',
    dealings: [{ kind: 'wholesale_sale', priceExcludingWetAndGst: '100' }] }), /incomeYear does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27',
    dealings: [{ kind: 'wholesale_sale', priceExcludingWetAndGst: '100' }], extra: true }), /extra is not an input of this tool/);
});

test('cash forecast tool returns the page worked example, supports startDate and refuses invalid or unknown inputs', async () => {
  const tool = tools.cash;
  const weeks = Array.from({ length: 13 }, (_, i) => ({ receipts: i === 12 ? '1000' : '0', payments: '0' }));
  const r = await tool.execute({
    startDate: '2026-07-06', opening: '-50', buffer: '100', weeks,
    delayedReceipt: { week: 13, amount: '600', delayWeeks: 1 },
  });
  assert.deepEqual([r.closingCash, r.lowestBalance, r.fundingGap, r.deferredBeyondWeek13, r.currency, r.source],
    ['350.00', '-50.00', '150.00', '600.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/cash/']);
  assert.deepEqual([r.weeks[0].startDate, r.weeks[0].endDate, r.weeks[12].closing], ['2026-07-06', '2026-07-12', '350.00']);
  assert.doesNotThrow(() => JSON.stringify(r));
  await assert.rejects(tool.execute({ opening: '0', buffer: '0', weeks: weeks.slice(0, 12) }), /Enter all 13 weeks/);
  await assert.rejects(tool.execute({ opening: '0', buffer: '0', weeks, delayedReceipt: { week: 13, amount: '1001', delayWeeks: 1 } }),
    /cannot exceed that week's receipts/);
  await assert.rejects(tool.execute({ opening: '0', buffer: '0', weeks, extra: 1 }), /extra is not an input of this tool/);
});

test('depreciation pools tool returns all 3 page worked examples and refuses mismatched or unknown inputs', async () => {
  const tool = tools['depreciation-pools'];
  const lvp = await tool.execute({
    worksheet: 'low-value-pool', incomeYear: '2025-26',
    previousClosingPoolBalance: '5000', lowCostAssets: '594', lowValueAssets: '0', secondElementCosts: '0', terminationValues: '0',
  });
  assert.deepEqual([lvp.newAssetsDecline, lvp.poolDecline, lvp.declineInValue, lvp.closingPoolBalance, lvp.currency, lvp.source],
    ['111.38', '1875.00', '1986.38', '3607.62', 'AUD', 'https://duguid.com.au/tools/business-calculators/depreciation-pools/']);
  assert.doesNotThrow(() => JSON.stringify(lvp));
  const sbp = await tool.execute({
    worksheet: 'small-business-pool', incomeYear: '2025-26',
    openingPoolBalance: '100000', additions: '28000', costAdditions: '0', terminationValues: '8000',
  });
  assert.deepEqual([sbp.outcome, sbp.deduction, sbp.closingPoolBalance, sbp.lowPoolValueThreshold],
    ['rated', '34200.00', '85800.00', '20000.00']);
  assert.doesNotThrow(() => JSON.stringify(sbp));
  const cw = await tool.execute({
    worksheet: 'capital-works', incomeYear: '2025-26', constructionExpenditure: '115800', constructionStart: '1991-08-01',
    fourPercentManner: false, daysUsed: 346, taxableUse: '1', undeductedConstructionExpenditure: '20000',
  });
  assert.deepEqual([cw.ratePercent, cw.provision, cw.deduction, cw.limitedToUndeducted], ['2.5', '43-215', '2744.30', false]);
  assert.doesNotThrow(() => JSON.stringify(cw));
  await assert.rejects(tool.execute({
    worksheet: 'low-value-pool', incomeYear: '2025-26', openingPoolBalance: '100',
    previousClosingPoolBalance: '5000', lowCostAssets: '0', lowValueAssets: '0', secondElementCosts: '0', terminationValues: '0',
  }), /openingPoolBalance does not apply/);
  await assert.rejects(tool.execute({
    worksheet: 'capital-works', incomeYear: '2025-26', constructionExpenditure: '115800', constructionStart: '1991-08-01',
    fourPercentManner: true, daysUsed: 346, taxableUse: '1', undeductedConstructionExpenditure: '20000',
  }), /before 27 February 1992/);
  await assert.rejects(tool.execute({ worksheet: 'low-value-pool', incomeYear: '2025-26', extra: 1 }),
    /extra is not an input of this tool/);
});

test('Division 7A schedule tool returns the page worked example, supports custom repayments and refuses invalid or unknown inputs', async () => {
  const tool = tools['div7a-schedule'];
  const r = await tool.execute({ madeDate: '2022-10-01', amount: '100000', termYears: '7', assumedBenchmarkRate: '8.77' });
  assert.deepEqual([r.firstMinimumRepayment, r.totalRepaid, r.totalInterest, r.closingBalance, r.shortfall, r.projectedFrom, r.currency, r.source],
    ['19384.96', '137086.99', '37086.99', '0.00', '0.00', '2027-28', 'AUD', 'https://duguid.com.au/tools/business-calculators/div7a-schedule/']);
  assert.equal(r.years.length, 7);
  assert.doesNotThrow(() => JSON.stringify(r));
  const funded = await tool.execute({
    madeDate: '2022-10-01', amount: '100000', termYears: '7', assumedBenchmarkRate: '8.77',
    repayments: [{ yearNumber: 1, amount: '30000' }], marginalRate: '47', franking: '25',
  });
  assert.equal(funded.years[0].repayment, '30000.00');
  assert.ok(funded.years[0].fundingDividend !== null);
  await assert.rejects(tool.execute({ madeDate: '2022-10-01', amount: '100000', termYears: '7' }),
    /assumedBenchmarkRate is required/);
  await assert.rejects(tool.execute({ madeDate: '2022-10-01', amount: '100000', termYears: '7', assumedBenchmarkRate: '8.77', franking: '25' }),
    /franking applies only when marginalRate is supplied/);
  await assert.rejects(tool.execute({ madeDate: '2022-10-01', amount: '100000', termYears: '7', assumedBenchmarkRate: '8.77', interposedEntity: true }),
    /interposed entity/);
  await assert.rejects(tool.execute({ madeDate: '2022-10-01', amount: '100000', termYears: '7', assumedBenchmarkRate: '8.77', extra: 1 }),
    /extra is not an input of this tool/);
});

test('first home owner grant tool returns the page worked example, matches form duty scales and refuses invalid or unknown inputs', async () => {
  const tool = tools['first-home-owner-grant'];
  const facts = { person: true, citizen: true, first: true, residence: true };
  const r = await tool.execute({ place: 'AU-NSW', contractDate: '2026-08-01', home: 'bought', value: 600000, facts });
  assert.deepEqual([r.grant, r.valueCap, r.transferDuty.computed, r.transferDuty.firstHomeBuyerDuty, r.transferDuty.generalDuty, r.currency, r.source],
    ['10000.00', 'up to $600,000', true, '0.00', '21187.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/first-home-owner-grant/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const scalesText = readFileSync('_includes/duty-jurisdictions.html', 'utf8');
  for (const [, place, scaleStr] of scalesText.matchAll(/value="(AU-[A-Z]+)"[^>]*data-scale="([^"]+)"/g)) {
    const scale = scaleStr.split(';').map((row) => row.split(','));
    const extra = place === 'AU-WA' ? { northOf26thParallel: false } : {};
    const check = await tool.execute({
      place, contractDate: '2026-08-01', home: 'established', value: 500000, ...extra, facts,
    });
    const expected = calculate.firstHomeDuty('500000', scale, place, 'established');
    assert.deepEqual([check.transferDuty.firstHomeBuyerDuty, check.transferDuty.generalDuty],
      [expected.duty.toFixed(2), expected.general.toFixed(2)], place);
  }
  await assert.rejects(tool.execute({ place: 'AU-NSW', contractDate: '2026-02-30', home: 'bought', value: 600000, facts }),
    /real calendar date/);
  await assert.rejects(tool.execute({ place: 'AU-NSW', contractDate: '2026-08-01', home: 'bought', value: 600000, northOf26thParallel: true, facts }),
    /northOf26thParallel applies only to Western Australia/);
  await assert.rejects(tool.execute({ place: 'AU-NSW', contractDate: '2026-08-01', home: 'bought', value: 600000, facts: { ...facts, person: false } }),
    /Not computed/);
  await assert.rejects(tool.execute({ place: 'AU-NSW', contractDate: '2026-08-01', home: 'bought', value: 600000, facts, extra: 1 }),
    /extra is not an input of this tool/);
});

test('PAYG instalments tool returns the page worked example, supports all 4 methods and refuses mismatched or unknown inputs', async () => {
  const tool = tools['payg-instalments'];
  const r = await tool.execute({ method: 'rate', instalmentIncome: '20100', instalmentRatePercent: '1.7' });
  assert.deepEqual([r.calculatedAmount, r.instalmentWholeDollars, r.creditWholeDollars, r.instalmentRatePercent, r.currency, r.source],
    ['341.70', '341', '0', '1.70', 'AUD', 'https://duguid.com.au/tools/business-calculators/payg-instalments/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const varied = await tool.execute({
    method: 'varied-amount', instalmentNumber: 2, estimatedTax: '4000', earlierInstalments: '1500',
  });
  assert.deepEqual([varied.dueToDate, varied.instalmentWholeDollars, varied.creditWholeDollars], ['2000.00', '500', '0']);
  const variedRate = await tool.execute({
    method: 'varied-rate', instalmentIncome: '20000', estimatedTax: '10125', estimatedIncome: '82480',
    previousRatePercent: '15', earlierInstalments: '3000', earlierIncome: '20000',
  });
  assert.equal(variedRate.instalmentRatePercent, '12.27');
  await assert.rejects(tool.execute({ method: 'rate', instalmentIncome: '20100', instalmentRatePercent: '1.7', notifiedAmount: '100' }),
    /notifiedAmount does not apply/);
  await assert.rejects(tool.execute({ method: 'amount' }), /notifiedAmount is required/);
  await assert.rejects(tool.execute({ method: 'annual' }), /method does not match/);
  await assert.rejects(tool.execute({ method: 'amount', notifiedAmount: '500', extra: 1 }), /extra is not an input of this tool/);
});

test('payroll tax tool returns the page worked example, supports interstate wages and refuses invalid or unknown inputs', async () => {
  const tool = tools['payroll-tax'];
  const r = await tool.execute({ place: 'AU-NSW', wages: '1500000' });
  assert.deepEqual([r.incomeYear, r.deduction, r.taxableWages, r.payrollTax, r.total, r.currency, r.source],
    ['2026-27', '1200000.00', '300000.00', '16350.00', '16350.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/payroll-tax/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const vic = await tool.execute({ place: 'AU-VIC', wages: '80000000', australianWages: '150000000' });
  assert.ok(Number(vic.levy) > 0 && Number(vic.extraLevy) > 0);
  await assert.rejects(tool.execute({ place: 'AU-NSW', wages: '2000000', australianWages: '1000000' }), /total Australian wages/);
  await assert.rejects(tool.execute({ place: 'NSW', wages: '1500000' }), /place does not match/);
  await assert.rejects(tool.execute({ place: 'AU-NSW', wages: '1500000', extra: 1 }), /extra is not an input of this tool/);
});

test('sole trader against company tool returns the page worked example and refuses invalid or unknown inputs', async () => {
  const tool = tools['sole-trader-company'];
  const example = { incomeYear: '2026-27', businessProfit: '150000', amountTakenOut: '100000', salary: '60000',
    baseRateEntity: true, smallBusinessOffset: true };
  const r = await tool.execute(example);
  assert.deepEqual([r.soleTrader.totalTax, r.soleTrader.smallBusinessIncomeTaxOffset, r.company.companyTax,
    r.company.frankingCredit, r.company.retainedAfterTax, r.company.topUpTaxOnDividend, r.company.totalTax,
    r.companyLessSoleTraderTax, r.currency, r.source],
  ['38570.00', '1000.00', '20700.00', '13333.33', '22100.00', '3848.23', '34913.23', '-3656.77', 'AUD',
    'https://duguid.com.au/tools/business-calculators/sole-trader-company/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  await assert.rejects(tool.execute({ ...example, salary: '140000', amountTakenOut: '140000' }), /pays its super guarantee/);
  await assert.rejects(tool.execute({ ...example, amountTakenOut: '130000' }), /profit left after company tax/);
  await assert.rejects(tool.execute({ ...example, incomeYear: '2020-21' }), /incomeYear does not match/);
  const { smallBusinessOffset, ...missing } = example;
  await assert.rejects(tool.execute(missing), /smallBusinessOffset/);
  await assert.rejects(tool.execute({ ...example, extra: 1 }), /extra is not an input of this tool/);
});

test('salary against dividends tool returns the page worked example and refuses invalid or unknown inputs', async () => {
  const tool = tools['salary-dividend'];
  const r = await tool.execute({
    incomeYear: '2026-27', companyProfit: '200000', baseRateEntity: true, salary: '100000', otherTaxableIncome: '0',
  });
  assert.deepEqual([r.superGuarantee, r.companyTax, r.dividend, r.frankingCredit, r.ownerTaxableIncome, r.ownerExtraTax,
    r.superTax, r.cashKept, r.superKept, r.totalKept, r.bestSplit.salary, r.bestSplit.totalKept, r.currency, r.source],
  ['12000.00', '22000.00', '66000.00', '22000.00', '187000.00', '32000.00', '1800.00', '134000.00', '10200.00',
    '144200.00', '178571.43', '146463.02', 'AUD', 'https://duguid.com.au/tools/business-calculators/salary-dividend/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  await assert.rejects(tool.execute({ incomeYear: '2026-27', companyProfit: '200000', baseRateEntity: true, salary: '200000' }),
    /pays its super guarantee/);
  await assert.rejects(tool.execute({ incomeYear: '2020-21', companyProfit: '200000', baseRateEntity: true, salary: '100000' }),
    /incomeYear does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', companyProfit: '200000', baseRateEntity: true, salary: '100000', extra: 1 }),
    /extra is not an input of this tool/);
});

test('SGC and Payday Super tool returns the page worked example, supports quarterly law and refuses mismatched or unknown inputs', async () => {
  const tool = tools['sgc-payday'];
  const r = await tool.execute({
    regime: 'payday', payday: '2026-07-30', qualifyingEarnings: '1000', receivedLate: '120',
    lateReceiptDate: '2026-08-25', assessmentDate: '2026-12-01',
  });
  assert.deepEqual([r.dueDate, r.sgAmount, r.daysLate, r.businessDaysToReceipt, r.baseShortfall, r.finalShortfall,
    r.notionalEarnings, r.upliftPercent, r.administrativeUplift, r.sgCharge, r.currency, r.source],
  ['2026-08-11', '120.00', 14, 17, '120.00', '0.00', '0.53', 40, '0.21', '0.74', 'AUD',
    'https://duguid.com.au/tools/business-calculators/sgc-payday/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const q = await tool.execute({
    regime: 'quarter', incomeYear: '2025-26', quarter: '1', salaryOrWages: '12000',
    ordinaryTimeEarnings: '10000', contributionsOnTime: '0', statementLodgedDate: '2025-11-20',
  });
  assert.equal(q.regime, 'quarter');
  assert.equal(q.shortfall, '1440.00');
  assert.doesNotThrow(() => JSON.stringify(q));
  await assert.rejects(tool.execute({
    regime: 'payday', payday: '2026-07-30', qualifyingEarnings: '1000', norfolkIsland: true,
  }), /Norfolk Island/);
  await assert.rejects(tool.execute({
    regime: 'payday', payday: '2026-07-30', qualifyingEarnings: '1000', quarter: '1',
  }), /quarter does not apply/);
  await assert.rejects(tool.execute({
    regime: 'payday', payday: '2026-07-30', qualifyingEarnings: '1000', nextPayday: '2026-08-13',
  }), /nextPayday applies only to out-of-cycle/);
  await assert.rejects(tool.execute({
    regime: 'payday', payday: '2026-07-30', qualifyingEarnings: '1000', assessmentDate: '2027-02-01',
  }), /assumedGicRate is required/);
  await assert.rejects(tool.execute({
    regime: 'payday', payday: '2026-07-30', qualifyingEarnings: '1000', extra: 1,
  }), /extra is not an input of this tool/);
});

test('staff cost tool returns the page worked example and refuses invalid or unknown inputs', async () => {
  const tool = tools.staff;
  const r = await tool.execute({ wages: '51.30', superAmount: '0', otherCosts: '0' });
  assert.deepEqual([r.annualCost, r.monthlyAverage, r.currency, r.source],
    ['51.30', '4.28', 'AUD', 'https://duguid.com.au/tools/business-calculators/staff/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  await assert.rejects(tool.execute({ wages: '-51.30' }), /wages does not match/);
  await assert.rejects(tool.execute({ wages: '51.30', extra: 1 }), /extra is not an input of this tool/);
});

test('CGT tool returns the page worked example, supports main residence and refuses invalid or unknown inputs', async () => {
  const tool = tools.cgt;
  const r = await tool.execute({
    entity: 'individual', assetKind: 'investment', purchaseContractDate: '1997-07-01', saleContractDate: '2026-02-01',
    proceeds: '496000', purchasePrice: '144000', buyingCosts: { amount: '20000', date: '1997-07-01' },
    improvements: [{ amount: '30000', date: '2025-10-01' }], sellingCosts: '12500', owningCosts: '0',
    capitalWorksDeductions: '255', currentYearCapitalLosses: '0', priorYearCapitalLosses: '0', otherTaxableIncome: 90000,
  });
  assert.deepEqual([r.method, r.costBase, r.indexedCostBase, r.totalCurrentYearGain, r.discount, r.netCapitalGain,
    r.labelAWholeDollars, r.alternativeMethod.method, r.alternativeMethod.netCapitalGain, r.estimatedExtraTax, r.currency, r.source],
  ['discount', '206245.00', '211493.00', '289755.00', '144877.50', '144877.50', '144877', 'indexation', '284507.00',
    '56942.19', 'AUD', 'https://duguid.com.au/tools/business-calculators/cgt/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const home = await tool.execute({
    entity: 'individual', assetKind: 'home', purchaseContractDate: '2018-01-10', saleContractDate: '2026-02-01',
    proceeds: '850000', purchasePrice: '600000',
    home: { purchaseSettlementDate: '2018-02-15', saleSettlementDate: '2026-03-15', movedInDate: '2018-02-15' },
  });
  assert.equal(home.method, 'exempt');
  assert.equal(home.netCapitalGain, '0.00');
  assert.doesNotThrow(() => JSON.stringify(home));
  await assert.rejects(tool.execute({
    entity: 'individual', assetKind: 'investment', purchaseContractDate: '2020-02-30', saleContractDate: '2026-02-01',
    proceeds: '500000', purchasePrice: '400000',
  }), /as a date/);
  await assert.rejects(tool.execute({
    entity: 'individual', assetKind: 'investment', purchaseContractDate: '2020-07-01', saleContractDate: '2026-02-01',
    proceeds: '500000', purchasePrice: '400000', buyingCosts: { amount: '0', date: '2026-02-30' },
  }), /real calendar date/);
  await assert.rejects(tool.execute({
    entity: 'individual', assetKind: 'investment', purchaseContractDate: '2020-07-01', saleContractDate: '2026-02-01',
    proceeds: '500000', purchasePrice: '400000', improvements: [{ amount: '0', date: '2026-02-30' }],
  }), /real calendar date/);
  await assert.rejects(tool.execute({
    entity: 'company', assetKind: 'investment', purchaseContractDate: '2020-07-01', saleContractDate: '2026-02-01',
    proceeds: '500000', purchasePrice: '400000', otherTaxableIncome: 90000,
  }), /otherTaxableIncome applies only/);
  await assert.rejects(tool.execute({
    entity: 'individual', assetKind: 'home', purchaseContractDate: '2020-07-01', saleContractDate: '2026-02-01',
    proceeds: '500000', purchasePrice: '400000',
  }), /home is required/);
  await assert.rejects(tool.execute({
    entity: 'individual', australianResident: false, assetKind: 'investment', purchaseContractDate: '2020-07-01',
    saleContractDate: '2026-02-01', proceeds: '500000', purchasePrice: '400000',
  }), /residents only/);
  await assert.rejects(tool.execute({
    entity: 'individual', assetKind: 'investment', purchaseContractDate: '2020-07-01', saleContractDate: '2026-02-01',
    proceeds: '500000', purchasePrice: '400000', extra: 1,
  }), /extra is not an input of this tool/);
});

test('small business CGT concessions tool returns the page worked example and refuses invalid or unknown inputs', async () => {
  const tool = tools['cgt-concessions'];
  const base = {
    entity: 'individual', assetKind: 'business', purchaseContractDate: '2014-03-03', saleContractDate: '2026-02-02',
    businessInSaleYear: 'yes', businessInPreviousYear: true, previousYearTurnover: '2150000',
    businessInEarlierYear: true, earlierYearTurnover: '1900000', likelyTurnover: '2100000', actualTurnover: '1950000',
    netAssetValue: '6200000', activeDays: 3000, dateOfBirth: '1975-08-14', retirementChoiceDate: '2026-10-31',
  };
  const r = await tool.execute(base);
  assert.deepEqual([r.basicConditionsMet, r.smallBusinessEntity, r.turnoverRule, r.netAssetValue, r.netAssetsTestMet,
    r.activeAssetTestMet, r.concessions.fifteenYearExemption, r.concessions.fiftyPercentReduction,
    r.concessions.retirementExemption, r.concessions.retirementLimitRemaining, r.concessions.superContributionRequired,
    r.concessions.rollover, r.concessions.replacementPeriod.from, r.concessions.replacementPeriod.to, r.currency, r.source],
  [true, true, 'subsection 328-110(4)', '6200000.00', false, true, false, true, true, '500000.00', true, true,
    '2025-02-02', '2028-02-02', 'AUD', 'https://duguid.com.au/tools/business-calculators/cgt-concessions/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  await assert.rejects(tool.execute({ ...base, saleContractDate: '2026-02-30' }), /as a date/);
  await assert.rejects(tool.execute({ ...base, assetKind: 'share' }), /subsection 152-10\(2\)/);
  await assert.rejects(tool.execute({ ...base, significantIndividualJustBefore: true }), /applies only when entity is a company or trust/);
  await assert.rejects(tool.execute({ ...base, entity: 'company' }), /is required when entity is a company or trust/);
  await assert.rejects(tool.execute({ ...base, extra: 1 }), /extra is not an input of this tool/);
});

test('PCG 2021/4 risk scorer tool returns the page worked example, supports factor 3 and refuses invalid or unknown inputs', async () => {
  const tool = tools['pcg-2021-4'];
  const r = await tool.execute({
    gateway1Passed: true, gateway2Passed: true, profitEntitlement: '600000', returnedByIpp: '330000', taxPaid: '189367',
  });
  assert.deepEqual([r.returnedPercent, r.factor1Score, r.effectiveTaxRatePercent, r.factor2Score, r.factor3Score,
    r.aggregateScore, r.riskZone, r.currency, r.source],
  ['55.00', 4, '31.56', 3, null, 7, 'green', 'AUD', 'https://duguid.com.au/tools/business-calculators/pcg-2021-4/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const f3 = await tool.execute({
    gateway1Passed: true, gateway2Passed: true, profitEntitlement: '600000', returnedByIpp: '330000', taxPaid: '189367',
    includeFactor3: true, ippRemuneration: '360000', commercialBenchmark: '350000',
  });
  assert.deepEqual([f3.factor3Score, f3.aggregateScore, f3.riskZone], [3, 10, 'green']);
  await assert.rejects(tool.execute({
    gateway1Passed: false, gateway2Passed: true, profitEntitlement: '600000', returnedByIpp: '330000', taxPaid: '189367',
  }), /fails Gateway 1/);
  await assert.rejects(tool.execute({
    gateway1Passed: true, gateway2Passed: true, profitEntitlement: '600000', returnedByIpp: '330000', taxPaid: '189367',
    commercialBenchmark: '350000',
  }), /commercialBenchmark applies only/);
  await assert.rejects(tool.execute({
    gateway1Passed: true, gateway2Passed: true, profitEntitlement: '600000', returnedByIpp: '330000', taxPaid: '189367', extra: 1,
  }), /extra is not an input of this tool/);
});

test('PCG 2021/4 allocation tool returns the page worked example, matches form scales and refuses invalid or unknown inputs', async () => {
  const tool = tools['pcg-2021-4-allocation'];
  const r = await tool.execute({
    incomeYear: '2020-21', gateway1Passed: true, gateway2Passed: true,
    ipp: { firmIncome: '330000' }, associates: [{ kind: 'base-rate-company', firmIncome: '270000' }],
  });
  assert.deepEqual([r.ipp.taxCounted, r.ipp.rule, r.associates[0].taxCounted, r.associates[0].rule,
    r.totalFirmIncome, r.totalTaxCounted, r.returnedPercent, r.factor1Score, r.effectiveTaxRatePercent, r.factor2Score,
    r.aggregateScore, r.riskZone, r.currency, r.source],
  ['119167.00', '85(a)', '70200.00', '85(a)', '600000.00', '189367.00', '55.00', 4, '31.56', 3, 7, 'green',
    'AUD', 'https://duguid.com.au/tools/business-calculators/pcg-2021-4-allocation/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const formText = readFileSync('_includes/calculators/pcg-2021-4-allocation.html', 'utf8');
  for (const [, year, scale, baseRate, companyRate] of formText.matchAll(
    /name="year" value="(\d{4}-\d{2})" data-scale="([^"]+)" data-base-rate="([^"]+)" data-company-rate="([^"]+)"/g,
  )) {
    const res = await tool.execute({
      incomeYear: year, gateway1Passed: true, gateway2Passed: true,
      ipp: { firmIncome: '200000' }, associates: [{ kind: 'base-rate-company', firmIncome: '100000' }],
    });
    const expected = calculate.pcgAllocation({
      gateway1: true, gateway2: true, factor3: false, benchmark: '0',
      recipients: [
        { kind: 'individual', firm: '200000', deductions: '0', other: '0' },
        { kind: 'base-rate-company', firm: '100000', deductions: '0', other: '0' },
      ],
    }, { scale, baseRate, companyRate });
    assert.equal(res.totalTaxCounted, expected.tax.toFixed(2), year);
  }
  await assert.rejects(tool.execute({
    incomeYear: '2026-27', gateway1Passed: true, gateway2Passed: true,
    ipp: { firmIncome: '330000' }, associates: [{ kind: 'other', firmIncome: '10000' }],
  }), /cannot tax/);
  await assert.rejects(tool.execute({
    incomeYear: '2026-27', gateway1Passed: true, gateway2Passed: true,
    ipp: { firmIncome: '330000' }, commercialBenchmark: '300000',
  }), /commercialBenchmark applies only/);
  await assert.rejects(tool.execute({
    incomeYear: '2026-27', gateway1Passed: true, gateway2Passed: true, ipp: { firmIncome: '330000' }, extra: 1,
  }), /extra is not an input of this tool/);
});

test('PSI rules checker tool returns the page worked example and refuses invalid or unknown inputs', async () => {
  const tool = tools['psi-determination'];
  const r = await tool.execute({
    earner: 'sole-trader', mainlyPersonalEfforts: true, hasPsbDetermination: false,
    payers: [{ amount: '18000', paidForResult: true, suppliesTools: true, liableForDefects: true }],
  });
  assert.deepEqual([r.rule, r.isPersonalServicesBusiness, r.resultsTestPercent, r.source],
    ['subsection 87-18(1)', true, '100.00', 'https://duguid.com.au/tools/business-calculators/psi-determination/']);
  assert.ok(Array.isArray(r.steps) && r.steps.length >= 3);
  assert.doesNotThrow(() => JSON.stringify(r));
  const notPsi = await tool.execute({ earner: 'sole-trader', mainlyPersonalEfforts: false });
  assert.equal(notPsi.rule, 'subsection 84-5(1)');
  await assert.rejects(tool.execute({
    earner: 'sole-trader', mainlyPersonalEfforts: true,
    payers: [{ amount: '100000' }], paidAsAgent: true, agentPrincipalPayments: '100000', agentCommission: '80000',
  }), /section 87-40/);
  await assert.rejects(tool.execute({
    earner: 'sole-trader', mainlyPersonalEfforts: true, agentCommission: '1000',
  }), /agentCommission applies only/);
  await assert.rejects(tool.execute({
    earner: 'trust', mainlyPersonalEfforts: true,
  }), /earner does not match/);
  await assert.rejects(tool.execute({
    earner: 'sole-trader', mainlyPersonalEfforts: true, extra: 1,
  }), /extra is not an input of this tool/);
});

test('rental property tool returns the page worked example, serialises borrowingLoans and refuses invalid or unknown inputs', async () => {
  const tool = tools['rental-property'];
  const r = await tool.execute({
    incomeYear: '2025-26', ownershipShare: '1', acquiredDate: '2025-07-20', daysAvailable: 346, otherTaxableIncome: 90000,
    income: { rentalIncome: '8500.00', otherRentalIncome: '800.00' },
    expenses: {
      bodyCorporateFees: '500.00', cleaning: '100.00', councilRates: '700.00', gardening: '350.00', insurance: '495.00',
      landTax: '200.00', legalExpenses: '150.00', pestControl: '50.00', repairsAndMaintenance: '1000.00',
      stationeryTelephonePostage: '80.00', travel: '436.00', waterCharges: '350.00', sundry: '95.00',
    },
    rentalOnlyExpenses: { advertisingForTenants: '48.00', propertyAgentFees: '800.00' },
    loans: [{ interest: '14108.00', principalForRental: '170000.00', principalTotal: '209000.00', redrawnInYear: false }],
    borrowingExpenses: '259.62',
    capitalWorks: [{
      constructionExpenditure: '115800.00', kind: 'building', beganDate: '1991-08-01', firstUsedDate: '1992-03-01',
      takenToBeginBefore16September1987: false,
    }],
    depreciatingAssets: [{
      declineInValue: '796.00', acquiredDate: '2025-07-20', firstUsedDate: '2025-07-20',
      heldWhenFirstUsed: true, residenceOrPrivateUse: false, lowValuePool: false,
    }],
  });
  assert.deepEqual([r.grossRent, r.totalDeductions, r.netRent, r.amounts.travel_denied, r.amounts.tax_effect, r.currency, r.source],
    ['9300.00', '20193.33', '-10893.33', '436.00', '3267.90', 'AUD', 'https://duguid.com.au/tools/business-calculators/rental-property/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const withBorrowing = await tool.execute({
    incomeYear: '2025-26', ownershipShare: '1', acquiredDate: '2025-07-01', daysAvailable: 365,
    borrowingLoans: [{ borrowingExpenses: '1000', firstBorrowed: '2025-07-01', contractEnd: '2055-06-30', incomeUse: '1' }],
  });
  assert.equal(withBorrowing.borrowingLoans.length, 1);
  assert.doesNotThrow(() => JSON.stringify(withBorrowing));
  await assert.rejects(tool.execute({
    incomeYear: '2025-26', ownershipShare: '1', acquiredDate: '2025-02-30', daysAvailable: 100,
  }), /YYYY-MM-DD/);
  await assert.rejects(tool.execute({
    incomeYear: '2025-26', ownershipShare: '1', acquiredDate: '2025-07-01', daysAvailable: 365, section26_50Applies: true,
  }), /Section 26-50/);
  await assert.rejects(tool.execute({
    incomeYear: '2025-26', ownershipShare: '1', acquiredDate: '2025-07-01', daysAvailable: 365, extra: 1,
  }), /extra is not an input of this tool/);
});

test('super lump sum tax tool returns all 3 calculations and refuses mismatched or unknown inputs', async () => {
  const tool = tools['super-benefit-tax'];
  const tax = await tool.execute({
    calculation: 'tax', incomeYear: '2026-27', paymentDate: '2026-10-01', recipient: 'member',
    benefit: '300000', interestValue: '300000', interestTaxFreeComponent: '30000', untaxedElement: '80000',
    serviceBeforeJuly1983: false, dateOfBirth: '1964-05-01', terminalMedicalCondition: false,
    disabilitySuperannuationBenefit: false, untaxedPlanCapUsed: '0',
  });
  assert.deepEqual([tax.treatment, tax.taxFreeComponent, tax.taxedElement, tax.untaxedElement, tax.assessableIncome,
    tax.notAssessableIncome, tax.maximumTax, tax.age, tax.preservationAge, tax.currency, tax.source],
  ['aged_60_or_over', '30000.00', '190000.00', '80000.00', '80000.00', '220000.00', '12000.00', 62, 59, 'AUD',
    'https://duguid.com.au/tools/business-calculators/super-benefit-tax/']);
  assert.doesNotThrow(() => JSON.stringify(tax));
  const wh = await tool.execute({
    calculation: 'withholding', incomeYear: '2026-27', paymentDate: '2026-10-01', recipient: 'member',
    benefit: '300000', interestValue: '300000', interestTaxFreeComponent: '30000', untaxedElement: '80000',
    serviceBeforeJuly1983: false, dateOfBirth: '1964-05-01', terminalMedicalCondition: false,
    disabilitySuperannuationBenefit: false, untaxedPlanCapUsed: '0', tfnProvided: true, foreignResident: false,
  });
  assert.equal(wh.withholding, '13600.00');
  assert.doesNotThrow(() => JSON.stringify(wh));
  const dasp = await tool.execute({
    calculation: 'dasp', incomeYear: '2026-27', taxFreeComponent: '25000', taxedElement: '17000',
    untaxedElement: '0', workingHolidayMakerContributions: false, unclaimedMoneyRollover: false,
  });
  assert.deepEqual([dasp.payment, dasp.taxedElementTax, dasp.totalTax, dasp.netPayment],
    ['42000.00', '5950.00', '5950.00', '36050.00']);
  assert.doesNotThrow(() => JSON.stringify(dasp));
  await assert.rejects(tool.execute({
    calculation: 'tax', incomeYear: '2026-27', paymentDate: '2026-02-30', recipient: 'death_benefits_dependant',
    benefit: '10000', interestValue: '10000', interestTaxFreeComponent: '0',
  }), /as a date/);
  await assert.rejects(tool.execute({
    calculation: 'tax', incomeYear: '2026-27', paymentDate: '2026-10-01', recipient: 'death_benefits_dependant',
    benefit: '10000', interestValue: '10000', interestTaxFreeComponent: '0', tfnProvided: true,
  }), /tfnProvided does not apply/);
  await assert.rejects(tool.execute({
    calculation: 'dasp', incomeYear: '2026-27', taxFreeComponent: '1000', taxedElement: '1000',
    workingHolidayMakerContributions: false, unclaimedMoneyRollover: false, extra: 1,
  }), /extra is not an input of this tool/);
});

test('unused leave tool returns the page worked example and refuses invalid or unknown inputs', async () => {
  const tool = tools['unused-leave'];
  const r = await tool.execute({
    annualLeave: '0', leaveLoading: '0', longServiceLeave: '22020', accrualStartDate: '1977-01-01', reason: 'normal',
    lslBefore16August1978: '780', lsl16August1978To17August1993: '6420', payee: 'tfn',
    normalGrossEarnings: '1155', payPeriod: 'week',
  });
  assert.deepEqual([r.lumpSumA, r.lumpSumAType, r.lumpSumB, r.lslPre1978Assessable, r.paidLeaveTypeU,
    r.assessableIncome, r.flatWithholding, r.marginalWithholding, r.totalWithholding, r.currency, r.source],
  ['6420.00', 'T', '780.00', '39.00', '14820.00', '21279.00', '2054.00', '4732.00', '6786.00', 'AUD',
    'https://duguid.com.au/tools/business-calculators/unused-leave/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  await assert.rejects(tool.execute({
    accrualStartDate: '2026-02-30', reason: 'normal', payee: 'no-tfn', annualLeave: '1000',
  }), /began to accrue/);
  await assert.rejects(tool.execute({
    accrualStartDate: '2020-01-01', reason: 'normal', payee: 'no-tfn', annualLeave: '1000', normalGrossEarnings: '1000',
  }), /normalGrossEarnings applies only/);
  await assert.rejects(tool.execute({
    accrualStartDate: '2020-01-01', reason: 'normal', payee: 'tfn', annualLeave: '1000',
  }), /normalGrossEarnings is required/);
  await assert.rejects(tool.execute({
    accrualStartDate: '2020-01-01', reason: 'normal', payee: 'no-tfn', annualLeave: '1000', extra: 1,
  }), /extra is not an input of this tool/);
});

test('workers compensation tool returns the page worked example, supports statutory schemes and refuses mismatched or unknown inputs', async () => {
  const tool = tools['workers-compensation'];
  const nt = await tool.execute({
    place: 'AU-NT', estimatedWages: '400000', ratePercent: '3.5', actualWages: '500000',
  });
  assert.deepEqual([nt.policyYear, nt.premiumBeforeGst, nt.gst, nt.insuranceDuty, nt.estimatedTotal,
    nt.actualTotal, nt.adjustment, nt.currency, nt.source],
  ['2026-27', '14000.00', '1400.00', '0.00', '15400.00', '19250.00', '3850.00', 'AUD',
    'https://duguid.com.au/tools/business-calculators/workers-compensation/']);
  assert.doesNotThrow(() => JSON.stringify(nt));
  const sa = await tool.execute({
    place: 'AU-SA', estimatedWages: '450000', ratePercent: '2', saFirstFullYear: false, saClaimsCosts: '0',
  });
  assert.equal(sa.premiumBeforeGst, '8550.00');
  assert.doesNotThrow(() => JSON.stringify(sa));
  await assert.rejects(tool.execute({
    place: 'AU-NT', estimatedWages: '400000', ratePercent: '3.5', qldPolicyStart: 'q1',
  }), /qldPolicyStart does not apply/);
  await assert.rejects(tool.execute({
    place: 'AU-SA', estimatedWages: '450000', ratePercent: '2', saFirstFullYear: true, saClaimsCosts: '500',
  }), /saClaimsCosts does not apply/);
  await assert.rejects(tool.execute({
    place: 'AU-NSW', estimatedWages: '400000', ratePercent: '2', nswDustDiseasesRatePercent: '0.01', groupedEmployer: true,
  }), /member of a group/);
  await assert.rejects(tool.execute({
    place: 'AU-NT', estimatedWages: '400000', ratePercent: '3.5', extra: 1,
  }), /extra is not an input of this tool/);
});


// The Payday Super cashflow page's example and the ATO's example 3 weekly payday, then refusals.
test('Payday Super cashflow tool returns the page worked example and refuses what the page refuses', async () => {
  const tool = tools['payday-cashflow'];
  const r = await tool.execute({ quarter: '1', payCycle: 'fortnightly', firstPayday: '2026-07-02', earningsPerPayday: '10000' });
  assert.deepEqual([r.paydays.length, r.paydays[2], r.quarterlyDueDate, r.superGuaranteeForQuarter, r.peakExtraWorkingCapital,
    r.peakFrom, r.peakDays, r.averageDaysEarlier, r.currency, r.source],
  [7, { payday: '2026-07-30', superGuarantee: '1200.00', fundMustReceiveBy: '2026-08-11', dueDateDependsOnPartDayHolidays: false,
    daysBeforeQuarterlyDueDate: 78, extraWorkingCapital: '3600.00' }, '2026-10-28', '8400.00', '8400.00', '2026-10-07', 21, '64.6',
  'AUD', 'https://duguid.com.au/tools/business-calculators/payday-cashflow/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const december = await tool.execute({ quarter: '2', payCycle: 'weekly', firstPayday: '2026-10-01', earningsPerPayday: '10000' });
  assert.deepEqual(december.paydays.filter((p) => p.payday >= '2026-12-10').map((p) => [p.fundMustReceiveBy, p.dueDateDependsOnPartDayHolidays]),
    [['2026-12-21', false], ['2026-12-30', true], ['2027-01-07', true], ['2027-01-12', false]]);
  await assert.rejects(tool.execute({ quarter: '1', payCycle: 'weekly', firstPayday: '2026-07-08', earningsPerPayday: '10000' }),
    /a date in its first 7 days/);
  await assert.rejects(tool.execute({ quarter: '1', payCycle: 'weekly', firstPayday: '2026-07-01', earningsPerPayday: 10000 }),
    /earningsPerPayday does not match its description/);
  await assert.rejects(tool.execute({ quarter: '5', payCycle: 'weekly', firstPayday: '2026-07-01', earningsPerPayday: '1' }),
    /quarter does not match its description/);
  await assert.rejects(tool.execute({ quarter: '1', payCycle: 'weekly', firstPayday: '2026-07-01', earningsPerPayday: '1', extra: 1 }),
    /extra is not an input of this tool/);
});

test('every calculator include in _includes/calculators has a registered WebMCP tool', () => {
  const slugs = readdirSync('_includes/calculators')
    .filter((name) => name.endsWith('.html'))
    .map((name) => name.slice(0, -5))
    .sort();
  const registered = [...Object.keys(tools), ...Object.keys(individual)].sort();
  assert.deepEqual(registered.filter((slug) => slug !== 'cgt-parcels'), slugs);
  assert.equal(registered.length + 2, 84);
});

test('business days tool returns the page worked example, matches holiday JSON and refuses mismatched or invalid inputs', async () => {
  const tool = tools['business-days'];
  const holidaysJson = JSON.parse(readFileSync('_data/payday_super_business_days.json', 'utf8'));
  assert.deepEqual(CONFIRMED_HOLIDAYS, calculate.parseHolidays(JSON.stringify(holidaysJson.non_business_days)));
  const r = await tool.execute({ mode: 'count', place: 'NSW', startDate: '2026-12-21', endDate: '2027-01-04' });
  assert.deepEqual([r.businessDays, r.resultDate, r.skippedHolidays.length, r.source],
    [7, null, 3, 'https://duguid.com.au/tools/business-calculators/business-days/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const added = await tool.execute({ mode: 'add', place: 'VIC', startDate: '2026-11-02', businessDays: 1 });
  assert.deepEqual([added.resultDate, added.skippedHolidays.length], ['2026-11-04', 1]);
  await assert.rejects(tool.execute({ mode: 'count', place: 'NSW', startDate: '2026-02-30', endDate: '2026-03-02' }), /as a date/);
  await assert.rejects(tool.execute({ mode: 'count', place: 'NSW', startDate: '2026-12-21', endDate: '2027-01-04', businessDays: 5 }), /does not apply/);
  await assert.rejects(tool.execute({ mode: 'add', place: 'NSW', startDate: '2026-12-21', endDate: '2027-01-04' }), /does not apply/);
  await assert.rejects(tool.execute({ mode: 'count', place: 'NSW', startDate: '2026-12-21', endDate: '2027-01-04', extra: 1 }), /extra is not an input of this tool/);
});

test('Division 296 tool returns EM examples, matches form attributes and refuses invalid or unknown inputs', async () => {
  const tool = tools['division-296'];
  const formText = readFileSync('_includes/calculators/division-296.html', 'utf8');
  const match = formText.match(
    /data-large-threshold="([^"]+)" data-very-large-threshold="([^"]+)" data-rate="([^"]+)" data-very-large-rate="([^"]+)"/,
  );
  assert.ok(match);
  assert.deepEqual(DIVISION_296_YEAR, { largeThreshold: match[1], veryLargeThreshold: match[2], rate: match[3], veryLargeRate: match[4] });
  const jordan = await tool.execute({ totalSuperBalance: '4000000', totalSuperEarnings: '100000' });
  assert.deepEqual([jordan.liability, jordan.shareAboveLargeThresholdPercent, jordan.taxableSuperEarnings, jordan.division296Tax, jordan.currency, jordan.source],
    ['liable', '25.00', '25000.00', '3750.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/division-296/']);
  assert.doesNotThrow(() => JSON.stringify(jordan));
  const kelly = await tool.execute({ totalSuperBalance: '12000000', totalSuperEarnings: '500000' });
  assert.deepEqual([kelly.shareAboveLargeThresholdPercent, kelly.shareAboveVeryLargeThresholdPercent, kelly.taxAt15Percent, kelly.taxAt10Percent, kelly.division296Tax],
    ['75.00', '16.67', '56250.00', '8335.00', '64585.00']);
  const died = await tool.execute({ totalSuperBalance: '12000000', totalSuperEarnings: '500000', diedBy30June2027: true });
  assert.deepEqual([died.liability, died.liable, died.division296Tax], ['died', false, '0.00']);
  await assert.rejects(tool.execute({ totalSuperBalance: '-1', totalSuperEarnings: '100000' }), /totalSuperBalance does not match/);
  await assert.rejects(tool.execute({ totalSuperBalance: '4000000', totalSuperEarnings: '100000', extra: 1 }), /extra is not an input of this tool/);
});

test('FBT car tool returns worked example, checks EV exemption, matches form attributes and refuses mismatched inputs', async () => {
  const tool = tools['fbt-car'];
  const formText = readFileSync('_includes/calculators/fbt-car.html', 'utf8');
  const formMatch = formText.match(/data-year-days="([^"]+)" data-fbt-rate="([^"]+)" data-year-ended="([^"]+)"/);
  const t1 = formText.match(/name="type" value="1" data-gross-up="([^"]+)"/);
  const t2 = formText.match(/name="type" value="2" data-gross-up="([^"]+)"/);
  assert.ok(formMatch && t1 && t2);
  assert.deepEqual(FBT_CAR_YEAR, {
    days: formMatch[1], fbtRate: formMatch[2], ended: formMatch[3], type1GrossUp: t1[1], type2GrossUp: t2[1],
  });
  const r = await tool.execute({
    method: 'statutory', costPrice: '60000', laterAccessories: '0', heldBefore1April2022: false,
    daysAvailable: 182, employeeContribution: '1000', gstCreditEntitled: true,
  });
  assert.deepEqual([r.baseValue, r.statutoryTaxableValue, r.operatingTaxableValue, r.taxableValue, r.grossedUpTaxableValue, r.fbt, r.currency, r.source],
    ['60000.00', '4983.56', null, '4983.56', '10366.80', '4872.40', 'AUD', 'https://duguid.com.au/tools/business-calculators/fbt-car/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const ev = await tool.execute({
    method: 'statutory', costPrice: '60000', daysAvailable: 182, employeeContribution: '1000', gstCreditEntitled: true,
    vehicleKind: 'battery',
    electricCar: {
      currentEmployee: true, firstHeldAndUsed: '2026-04-01', firstRetailSale: '2026-04-01',
      lctValue: '60000', lctOnOtherSupply: false,
    },
  });
  assert.deepEqual([ev.evExemption.exempt, ev.taxableValue, ev.taxableValueBeforeExemption, ev.fbt], [true, '0.00', '4983.56', '0.00']);
  assert.doesNotThrow(() => JSON.stringify(ev));
  await assert.rejects(tool.execute({
    method: 'statutory', costPrice: '60000', daysAvailable: 182, gstCreditEntitled: true, operatingCosts: '10000',
  }), /operatingCosts applies only/);
  await assert.rejects(tool.execute({
    method: 'operating', costPrice: '60000', daysAvailable: 182, gstCreditEntitled: true,
  }), /operatingCosts is required/);
  await assert.rejects(tool.execute({
    method: 'statutory', costPrice: '60000', daysAvailable: 182, gstCreditEntitled: true, vehicleKind: 'battery',
  }), /electricCar is required/);
  await assert.rejects(tool.execute({
    method: 'statutory', costPrice: '60000', daysAvailable: 182, gstCreditEntitled: true, extra: 1,
  }), /extra is not an input of this tool/);
});

test('FBT car parking tool covers methods, matches form attributes and refuses mismatched or unknown inputs', async () => {
  const tool = tools['fbt-car-parking'];
  const formText = readFileSync('_includes/calculators/fbt-car-parking.html', 'utf8');
  const match = formText.match(/data-threshold="([^"]+)" data-year-days="([^"]+)" data-year-ended="([^"]+)"/);
  assert.ok(match);
  assert.deepEqual(FBT_PARKING_YEAR, { threshold: match[1], days: match[2], ended: match[3] });
  const r = await tool.execute({
    method: 'station', firstBusinessDayFee: '12.36', benefits: 22, feePerBenefit: '12.36', employeeContribution: '0',
  });
  assert.deepEqual([r.benefitArises, r.grossTaxableValue, r.taxableValue, r.currency, r.source],
    [true, '271.92', '271.92', 'AUD', 'https://duguid.com.au/tools/business-calculators/fbt-car-parking/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const below = await tool.execute({ method: 'station', firstBusinessDayFee: '11.48', benefits: 22, feePerBenefit: '11.48' });
  assert.deepEqual([below.benefitArises, below.taxableValue], [false, '0.00']);
  await assert.rejects(tool.execute({
    method: 'register', firstBusinessDayFee: '15.00', registerValue: '1250', availabilityDays: 366, registerFirstValidYear: 2027,
  }), /availabilityDays must be a whole number/);
  const regOk = await tool.execute({
    method: 'register', firstBusinessDayFee: '15.00', registerValue: '1250', availabilityDays: 365, registerFirstValidYear: 2027,
  });
  assert.equal(regOk.annualisedRegisterValue, '5416.67');
  await assert.rejects(tool.execute({
    method: 'station', firstBusinessDayFee: '12.36', benefits: 22, feePerBenefit: '12.36', registerValue: '100',
  }), /registerValue does not apply/);
  await assert.rejects(tool.execute({
    method: 'station', firstBusinessDayFee: '12.36', benefits: 22, feePerBenefit: '12.36', extra: 1,
  }), /extra is not an input of this tool/);
});

test('FBT expense payment tool covers external and in-house examples and refuses mismatched or unknown inputs', async () => {
  const tool = tools['fbt-expense-payment'];
  const ext = await tool.execute({
    method: 'external', expenditure: '500', paidOrReimbursed: '250', employeeContribution: '0',
    incomeUsePercent: '80', portionDeduction: '200',
  });
  assert.deepEqual([ext.grossValue, ext.grossDeduction, ext.notionalDeduction, ext.taxableValue, ext.currency, ext.source],
    ['250.00', '400.00', '200.00', '50.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/fbt-expense-payment/']);
  assert.doesNotThrow(() => JSON.stringify(ext));
  const ih = await tool.execute({
    method: 'in-house-acquired', expenditure: '1000', paidOrReimbursed: '250', price: '800', notionalValue: '1000',
  });
  assert.deepEqual([ih.grossValue, ih.recipientsPortion, ih.taxableValue], ['800.00', '750.00', '50.00']);
  assert.doesNotThrow(() => JSON.stringify(ih));
  await assert.rejects(tool.execute({
    method: 'in-house-acquired', expenditure: '1000', paidOrReimbursed: '250', price: '800', notionalValue: '1000', incomeUsePercent: '50',
  }), /incomeUsePercent does not apply/);
  await assert.rejects(tool.execute({
    method: 'external', expenditure: '500', paidOrReimbursed: '250', price: '500',
  }), /price does not apply/);
  await assert.rejects(tool.execute({
    method: 'external', expenditure: '500', paidOrReimbursed: '250', extra: 1,
  }), /extra is not an input of this tool/);
});

test('FBT loan tool returns worked example, matches form attributes and refuses invalid or unknown inputs', async () => {
  const tool = tools['fbt-loan'];
  const formText = readFileSync('_includes/calculators/fbt-loan.html', 'utf8');
  const match = formText.match(/data-year-days="([^"]+)" data-statutory-rate="([^"]+)"/);
  assert.ok(match);
  assert.deepEqual(FBT_LOAN_YEAR, { days: match[1], rate: match[2] });
  const r = await tool.execute({
    totalDailyBalances: '18250000', interestAccrued: '2000', incomeUsePercent: '60', deductionForAccruedInterest: '1200',
  });
  assert.deepEqual([r.notionalInterest, r.grossTaxableValue, r.grossDeduction, r.notionalDeduction, r.reductionApplied, r.taxableValue, r.currency, r.source],
    ['4135.00', '2135.00', '2481.00', '1281.00', '1281.00', '854.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/fbt-loan/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  await assert.rejects(tool.execute({
    totalDailyBalances: '18250000', interestAccrued: '1000', deductionForAccruedInterest: '1500',
  }), /cannot be more than that interest/);
  await assert.rejects(tool.execute({ totalDailyBalances: '18250000', extra: 1 }), /extra is not an input of this tool/);
});

test('FBT meal entertainment tool covers split and register methods, matches form attributes and refuses invalid inputs', async () => {
  const tool = tools['fbt-meal-entertainment'];
  const formText = readFileSync('_includes/calculators/fbt-meal-entertainment.html', 'utf8');
  const match = formText.match(/data-year-ended="([^"]+)"/);
  assert.ok(match);
  assert.deepEqual(FBT_MEAL_YEAR, { ended: match[1] });
  const split = await tool.execute({ method: 'split', expenses: '4000' });
  assert.deepEqual([split.taxableValue, split.currency, split.source],
    ['2000.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/fbt-meal-entertainment/']);
  assert.doesNotThrow(() => JSON.stringify(split));
  const reg = await tool.execute({
    method: 'register', expenses: '900', registerBenefits: '1000', registerTotal: '3000', registerFirstValidYear: 2027,
  });
  assert.deepEqual([reg.registerPercent, reg.taxableValue, reg.fiftyFiftySplitComparison], ['33.33', '300.00', '450.00']);
  assert.doesNotThrow(() => JSON.stringify(reg));
  await assert.rejects(tool.execute({
    method: 'register', expenses: '900', registerBenefits: '1000', registerTotal: '3000',
    registerFirstValidYear: 2025, earlierYearExpenses: ['1000', '1201'],
  }), /more than 20% higher/);
  await assert.rejects(tool.execute({
    method: 'split', expenses: '4000', registerTotal: '3000',
  }), /registerTotal does not apply/);
  await assert.rejects(tool.execute({ method: 'split', expenses: '4000', extra: 1 }), /extra is not an input of this tool/);
});

test('FBT property tool returns worked example and refuses mismatched or unknown inputs', async () => {
  const tool = tools['fbt-property'];
  const r = await tool.execute({ method: 'in-house-public-price', price: '900', employeeContribution: '500' });
  assert.deepEqual([r.grossValue, r.contributionApplied, r.valueAfterContribution, r.inHouseReduction, r.taxableValue, r.currency, r.source],
    ['675.00', '500.00', '175.00', '0.00', '175.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/fbt-property/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  await assert.rejects(tool.execute({ method: 'in-house-public-price', price: '900', notionalValue: '900' }), /notionalValue does not apply/);
  await assert.rejects(tool.execute({ method: 'external-cost-price', price: '500', inHouseReductionAvailable: '100' }), /inHouseReductionAvailable does not apply/);
  await assert.rejects(tool.execute({ method: 'in-house-public-price', price: '900', extra: 1 }), /extra is not an input of this tool/);
});

test('land tax tool returns worked examples, matches form scales 1:1 and refuses mismatched or unknown inputs', async () => {
  const tool = tools['land-tax'];
  const formText = readFileSync('_includes/calculators/land-tax.html', 'utf8');
  const seen = [];
  for (const [, tag] of formText.matchAll(/<input type="radio" name="jurisdiction"([^>]+)>/g)) {
    const attrs = new Map(Array.from(tag.matchAll(/(value|data-[a-z-]+)="([^"]+)"/g), ([, k, v]) => [k, v]));
    const code = attrs.get('value');
    assert.ok(code);
    seen.push(code);
    const placeData = LAND_TAX_PLACES.get(code);
    assert.ok(placeData, code);
    assert.equal(placeData.name, attrs.get('data-name'), `${code} name`);
    assert.equal(placeData.scale, attrs.get('data-scale'), `${code} scale`);
    assert.equal(placeData.trustScale, attrs.get('data-trust-scale'), `${code} trustScale`);
    assert.equal(placeData.absenteeScale, attrs.get('data-absentee-scale'), `${code} absenteeScale`);
    assert.equal(placeData.surcharge, attrs.get('data-surcharge'), `${code} surcharge`);
    assert.equal(placeData.absenteeTrust, attrs.get('data-absentee-trust'), `${code} absenteeTrust`);
    assert.equal(placeData.payable, attrs.get('data-payable'), `${code} payable`);
    assert.equal(placeData.surchargeBase, attrs.get('data-surcharge-base'), `${code} surchargeBase`);
    assert.equal(placeData.mrit, attrs.get('data-mrit'), `${code} mrit`);
    assert.equal(placeData.fixed, attrs.get('data-fixed'), `${code} fixed`);
  }
  assert.deepEqual(seen, Array.from(LAND_TAX_PLACES.keys()));
  const nsw = await tool.execute({ place: 'AU-NSW', taxableLandValue: 1100000 });
  assert.deepEqual([nsw.landTax, nsw.total, nsw.currency, nsw.source],
    ['500.00', '500.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/land-tax/']);
  assert.doesNotThrow(() => JSON.stringify(nsw));
  const wa = await tool.execute({ place: 'AU-WA', taxableLandValue: 1500000, perthMetropolitanRegion: true });
  assert.deepEqual([wa.landTax, wa.metropolitanRegionImprovementTax, wa.total], ['6250.00', '1680.00', '7930.00']);
  const act = await tool.execute({ place: 'AU-ACT', taxableLandValue: 600000, foreignOrAbsentee: true });
  assert.deepEqual([act.landTax, act.foreignSurcharge, act.total], ['7418.00', '4500.00', '11918.00']);
  const saNil = await tool.execute({ place: 'AU-SA', taxableLandValue: 936100 });
  assert.deepEqual([saNil.landTax, saNil.total], ['0.00', '0.00']);
  const qldAbs = await tool.execute({ place: 'AU-QLD', taxableLandValue: 350000, foreignOrAbsentee: true });
  assert.equal(qldAbs.foreignSurcharge, '0.03');
  await assert.rejects(tool.execute({ place: 'AU-VIC', taxableLandValue: 1000000, rates: 'trust', foreignOrAbsentee: true }), /section 46IA/);
  await assert.rejects(tool.execute({ place: 'AU-NSW', taxableLandValue: 1100000, foreignOrAbsentee: true }), /surchargeLandValue is required/);
  await assert.rejects(tool.execute({ place: 'AU-VIC', taxableLandValue: 1000000, foreignOrAbsentee: true, surchargeLandValue: 1000000 }), /surchargeLandValue applies only/);
  await assert.rejects(tool.execute({ place: 'AU-NT', taxableLandValue: 1000000 }), /place does not match/);
  await assert.rejects(tool.execute({ place: 'AU-NSW', taxableLandValue: 1100000, extra: 1 }), /extra is not an input of this tool/);
});

test('termination payment tool returns Schedule 11 example 4, matches form attributes and refuses invalid or unknown inputs', async () => {
  const tool = tools['termination-payment'];
  const formText = readFileSync('_includes/calculators/termination-payment.html', 'utf8');
  const match = formText.match(
    /data-year-end="([^"]+)" data-etp-cap="([^"]+)" data-whole-of-income-cap="([^"]+)" data-base-amount="([^"]+)" data-service-amount="([^"]+)" data-rate-under="([^"]+)" data-rate-reached="([^"]+)" data-rate-above="([^"]+)"/,
  );
  assert.ok(match);
  assert.deepEqual(ETP_YEAR, {
    yearEnd: match[1], etpCap: match[2], wholeOfIncomeCap: match[3], baseAmount: match[4],
    serviceAmount: match[5], rateUnder: match[6], rateReached: match[7], rateAbove: match[8],
  });
  const alec = await tool.execute({
    genuineRedundancyPayment: '48000', completedYearsOfService: 5, otherCodeRTaxableComponent: '0',
    codeOTaxableComponent: '17678', otherTaxablePayments: '140000', dateOfBirth: '1996-08-01',
  });
  assert.deepEqual([alec.taxFreeLimit, alec.taxFreeRedundancyPart, alec.codeRTaxableComponent, alec.codeRWithholding,
    alec.wholeOfIncomeCapRemaining, alec.codeOCap, alec.codeOWithholding, alec.totalWithholding,
    alec.reachedPreservationAge, alec.rateWithinCapPercent, alec.currency, alec.source],
  ['47603.00', '47603.00', '397.00', '127.00', '40000.00', '40000.00', '5657.00', '5784.00',
    false, 32, 'AUD', 'https://duguid.com.au/tools/business-calculators/termination-payment/']);
  assert.doesNotThrow(() => JSON.stringify(alec));
  await assert.rejects(tool.execute({ dateOfBirth: '1996-02-30' }), /valid date of birth/);
  await assert.rejects(tool.execute({ dateOfBirth: '1996-08-01', extra: 1 }), /extra is not an input of this tool/);
});

test('transfer duty tool returns worked examples, matches duty-jurisdictions.html 1:1 and refuses invalid or unknown inputs', async () => {
  const tool = tools['transfer-duty'];
  const dutyText = readFileSync('_includes/duty-jurisdictions.html', 'utf8');
  const seen = [];
  for (const [, code, scaleText] of dutyText.matchAll(/name="jurisdiction" value="([^"]+)"[^>]*data-scale="([^"]+)"/g)) {
    seen.push(code);
    assert.deepEqual(DUTY_SCALES.get(code), scaleText.split(';').map((row) => row.split(',')), code);
  }
  assert.deepEqual(seen, Array.from(DUTY_SCALES.keys()));
  const nsw = await tool.execute({ place: 'AU-NSW', dutiableValue: 1350000 });
  assert.deepEqual([nsw.generalDuty, nsw.firstHomeBuyerDuty, nsw.nswResidentialPremiumBracket, nsw.currency, nsw.source],
    ['55537.00', null, false, 'AUD', 'https://duguid.com.au/tools/business-calculators/transfer-duty/']);
  assert.doesNotThrow(() => JSON.stringify(nsw));
  const fhb = await tool.execute({ place: 'AU-NSW', dutiableValue: 850000, buyer: 'established' });
  assert.deepEqual([fhb.firstHomeConcessionApplies, fhb.firstHomeBuyerDuty], [true, '9796.75']);
  const premium = await tool.execute({ place: 'AU-NSW', dutiableValue: 4000000 });
  assert.deepEqual([premium.generalDuty, premium.nswResidentialPremiumBracket], ['203237.00', true]);
  const tas = await tool.execute({ place: 'AU-TAS', dutiableValue: 500000, buyer: 'established' });
  assert.deepEqual([tas.firstHomeConcessionApplies, tas.firstHomeBuyerDuty], [false, '18247.50']);
  await assert.rejects(tool.execute({ place: 'AU-NSW', dutiableValue: 0 }), /dutiableValue must be a whole number/);
  await assert.rejects(tool.execute({ place: 'AU-NSW', dutiableValue: 1350000, extra: 1 }), /extra is not an input of this tool/);
});

test('R&D tax offset tool returns ATO worked examples, covers refundable and clawback tiers and refuses invalid inputs', async () => {
  const tool = tools['rd-tax-offset'];
  const nonRefund = await tool.execute({
    incomeYear: '2021-22', notionalDeductions: '3600000', aggregatedTurnover: '60000000',
    baseRateEntity: false, totalExpenses: '15000000', recoupmentClawback: '2300000', presentYearBaseRateEntity: false,
  });
  assert.deepEqual([nonRefund.refundable, nonRefund.taxOffset, nonRefund.clawbackAmount, nonRefund.adjustedOffset,
    nonRefund.deductionAmount, nonRefund.clawbackIncome, nonRefund.currency, nonRefund.source],
  [false, '1650000.00', '2300000.00', '580500.00', '690000.00', '1265000.00', 'AUD', 'https://duguid.com.au/tools/business-calculators/rd-tax-offset/']);
  assert.doesNotThrow(() => JSON.stringify(nonRefund));
  const refund = await tool.execute({
    incomeYear: '2025-26', notionalDeductions: '100000', aggregatedTurnover: '19999999.99',
    baseRateEntity: true, totalExpenses: '1000000',
  });
  assert.deepEqual([refund.refundable, refund.corporateTaxRatePercent, refund.refundableOffset, refund.nonRefundableOffset],
    [true, 25, '43500.00', '0.00']);
  const belowThreshold = await tool.execute({
    incomeYear: '2024-25', notionalDeductions: '19999.99', rspCrcExpenditure: '5000', aggregatedTurnover: '10000000',
    baseRateEntity: true, totalExpenses: '100000',
  });
  assert.deepEqual([belowThreshold.offsetBase, belowThreshold.taxOffset], ['5000.00', '2175.00']);
  await assert.rejects(tool.execute({
    incomeYear: '2020-21', notionalDeductions: '100000', aggregatedTurnover: '10000000', totalExpenses: '100000',
  }), /incomeYear does not match/);
  await assert.rejects(tool.execute({
    incomeYear: '2024-25', notionalDeductions: '1000', rspCrcExpenditure: '1000.01', aggregatedTurnover: '10000000', totalExpenses: '100000',
  }), /cannot exceed them/);
  await assert.rejects(tool.execute({
    incomeYear: '2024-25', notionalDeductions: '100000', aggregatedTurnover: '10000000', totalExpenses: '100000', recoupmentClawback: '80000.01',
  }), /does not choose between them/);
  await assert.rejects(tool.execute({
    incomeYear: '2024-25', notionalDeductions: '100000', aggregatedTurnover: '10000000', totalExpenses: '100000', scopeConfirmed: false,
  }), /Establish all stated scope conditions/);
  await assert.rejects(tool.execute({
    incomeYear: '2024-25', notionalDeductions: '100000', aggregatedTurnover: '10000000', totalExpenses: '100000', extra: 1,
  }), /extra is not an input of this tool/);
});

test('GST adjustments tool runs all 6 worksheets and refuses mismatched, conditional or scope-barred inputs', async () => {
  const tool = tools['gst-adjustments'];
  const cp = await tool.execute({
    worksheet: 'creditable-purpose', year: '2021-22', gstExclusiveValue: '3000', relatesToBusinessFinance: false,
    fullInputTaxCredit: '300', intendedOrFormerApplicationPercent: '90', actualApplicationPercent: '60',
    applicationBasis: 'Logbook of business use', attributedPeriodEnd: '2021-03-31', taxPeriodMonths: 3,
  });
  assert.deepEqual([cp.outcome, cp.amount, cp.adjustmentPeriod.number, cp.currency, cp.source],
    ['increasing adjustment', '90.00', 1, 'AUD', 'https://duguid.com.au/tools/business-calculators/gst-adjustments/']);
  assert.doesNotThrow(() => JSON.stringify(cp));
  const aa = await tool.execute({
    worksheet: 'annual-apportionment', year: '2025-26', smallBusinessEntity: true, carriesOnBusiness: true,
    instalmentElection: false, annualTaxPeriodElection: false, electionMade: true, gstOnAcquisition: '50',
    creditablePurposePercent: '10',
  });
  assert.deepEqual([aa.outcome, aa.amount], ['increasing adjustment', '45.00']);
  const fat = await tool.execute({
    worksheet: 'financial-acquisitions', year: '2025-26', gstGroup: true, currentFinancialCredits: '3600',
    currentTotalCredits: '69000', futureFinancialCredits: '10200', futureTotalCredits: '99000',
  });
  assert.deepEqual([fat.exceedsThreshold, fat.amount, fat.failingConditions], [true, null, ['future_within_ten_percent']]);
  const gc = await tool.execute({
    worksheet: 'going-concern', year: '2025-26', forConsideration: true, recipientRegistration: 'registered',
    writtenAgreement: 'on_or_before_supply_day', allThingsNecessary: true, carriedOnUntilSupply: true,
  });
  assert.deepEqual([gc.gstFree, gc.outcome], [true, 'GST-free']);
  const shg = await tool.execute({
    worksheet: 'second-hand-goods', year: '2025-26', consideration: '5500', acquiredForSaleOrExchange: true,
    animalsOrPlants: false, supplyToYou: 'neither', imported: false, byWayOfHire: false, resupplyTaxable: true, resupplyGst: '300',
  });
  assert.deepEqual([shg.applies, shg.amount], [true, '300.00']);
  const bd = await tool.execute({
    worksheet: 'bad-debt', year: '2021-22', party: 'supplier', event: 'overdue_12_months', amount: '550',
    taxableOrCreditable: true, cashBasis: false, specialRule: 'none', attributed: true,
    overdueFrom: '2021-04-16', asAt: '2022-04-16',
  });
  assert.deepEqual([bd.applies, bd.direction, bd.amount], [true, 'decreasing', '50.00']);
  await assert.rejects(tool.execute({
    worksheet: 'creditable-purpose', year: '2021-22', gstExclusiveValue: '3000', relatesToBusinessFinance: false,
    fullInputTaxCredit: '300', intendedOrFormerApplicationPercent: '90', actualApplicationPercent: '60',
    applicationBasis: 'Logbook', attributedPeriodEnd: '2021-02-29', taxPeriodMonths: 3,
  }), /attributed_period_end must be/);
  await assert.rejects(tool.execute({
    worksheet: 'creditable-purpose', year: '2021-22', gstExclusiveValue: '3000', relatesToBusinessFinance: false,
    fullInputTaxCredit: '300', intendedOrFormerApplicationPercent: '90', actualApplicationPercent: '60',
    applicationBasis: 'Logbook', attributedPeriodEnd: '2021-03-31', taxPeriodMonths: 3, car: true,
  }), /car does not apply when using "creditable-purpose"/);
  await assert.rejects(tool.execute({
    worksheet: 'going-concern', year: '2025-26', forConsideration: true, recipientRegistration: 'registered',
    writtenAgreement: 'on_or_before_supply_day', allThingsNecessary: true, carriedOnUntilSupply: true, farmLand: true,
  }), /Subdivision 38-O/);
  await assert.rejects(tool.execute({
    worksheet: 'second-hand-goods', year: '2025-26', consideration: '300', acquiredForSaleOrExchange: true,
    animalsOrPlants: false, supplyToYou: 'neither', imported: false, byWayOfHire: false, resupplyTaxable: true, resupplyGst: '10',
  }), /more than \$300/);
  await assert.rejects(tool.execute({
    worksheet: 'bad-debt', year: '2025-26', party: 'supplier', event: 'written_off', amount: '550',
    taxableOrCreditable: true, cashBasis: false, specialRule: 'none', attributed: true, reducedCreditAcquisition: false,
  }), /not an input for this party/);
  await assert.rejects(tool.execute({
    worksheet: 'going-concern', year: '2025-26', forConsideration: true, recipientRegistration: 'registered',
    writtenAgreement: 'on_or_before_supply_day', allThingsNecessary: true, carriedOnUntilSupply: true, extra: 1,
  }), /extra is not an input of this tool/);
});

test('deferred tax tool returns AASB 112 example, supports losses and negative profit and refuses barred items', async () => {
  const tool = tools['deferred-tax'];
  const r = await tool.execute({
    incomeYear: '2025-26',
    items: [
      { label: 'Plant', class: 'asset', carryingAmount: '70000', taxBase: '50000', openingCarryingAmount: '80000', openingTaxBase: '65000' },
      { label: 'Leave provision', class: 'liability', carryingAmount: '12000', taxBase: '0', openingCarryingAmount: '10000', openingTaxBase: '0' },
      { label: 'Prepayment', class: 'asset', carryingAmount: '3000', taxBase: '0', openingCarryingAmount: '2000', openingTaxBase: '0' },
    ],
    accountingProfit: '100000', nonDeductibleExpenses: '4000', taxableIncome: '100000',
  });
  assert.deepEqual([r.deferredTaxLiability, r.deferredTaxAsset, r.netDeferredTaxLiability, r.deferredTaxExpense,
    r.currentTax, r.incomeTaxExpense, r.effectiveTaxRate, r.warnings, r.currency, r.source],
  ['6900.00', '3600.00', '3300.00', '1200.00', '30000.00', '31200.00', '0.3120', [], 'AUD',
    'https://duguid.com.au/tools/business-calculators/deferred-tax/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const loss = await tool.execute({
    incomeYear: '2020-21', baseRateEntity: true, expectedRate: 'standard',
    items: [{ label: 'Asset', class: 'asset', carryingAmount: '1000', taxBase: '1000', openingCarryingAmount: '0', openingTaxBase: '0' }],
    accountingProfit: '-10000', taxableIncome: '0', unusedTaxLosses: '10000',
  });
  assert.deepEqual([loss.applicableRate, loss.deferredTaxAsset, loss.deferredTaxExpense], ['0.26', '3000.00', '-3000.00']);
  await assert.rejects(tool.execute({
    incomeYear: '2025-26', items: [], accountingProfit: '0', taxableIncome: '0',
  }), /Enter 1 to 500 items/);
  await assert.rejects(tool.execute({
    incomeYear: '2025-26',
    items: [{ label: 'Plant', class: 'asset', carryingAmount: '1000', taxBase: '0', openingCarryingAmount: '0', openingTaxBase: '0' }],
    accountingProfit: '1000', taxableIncome: '0', businessCombination: true,
  }), /business combination/);
  await assert.rejects(tool.execute({
    incomeYear: '2025-26',
    items: [{ label: 'Plant', class: 'asset', carryingAmount: '1000', taxBase: '0', openingCarryingAmount: '0', openingTaxBase: '0' }],
    accountingProfit: '1000', taxableIncome: '0', scopeConfirmed: false,
  }), /Establish all stated scope conditions/);
  await assert.rejects(tool.execute({
    incomeYear: '2025-26',
    items: [{ label: 'Plant', class: 'asset', carryingAmount: '1000', taxBase: '0', openingCarryingAmount: '0', openingTaxBase: '0' }],
    accountingProfit: '1000', taxableIncome: '0', extra: 1,
  }), /extra is not an input of this tool/);
});

test('pension minimum tool covers full years, pro-rating, 1 June nil and leap years and refuses invalid dates', async () => {
  const tool = individual['pension-minimum'];
  const full = await tool.execute({ incomeYear: '2026-27', accountBalance: '600000', age: 67 });
  assert.deepEqual([full.percentageFactorPercent, full.daysCounted, full.daysInYear, full.clause, full.minimumBeforeRounding,
    full.minimumPayment, full.currency, full.source],
  [5, 365, 365, 'cl 1(1)', '30000.00', '30000.00', 'AUD', 'https://duguid.com.au/tools/individual-tax/pension-minimum/']);
  assert.doesNotThrow(() => JSON.stringify(full));
  const thavi = await tool.execute({ incomeYear: '2024-25', accountBalance: '250000', age: 66, startDate: '2025-01-01' });
  assert.deepEqual([thavi.daysCounted, thavi.clause, thavi.minimumBeforeRounding, thavi.minimumPayment], [181, 'cl 3', '6198.63', '6200.00']);
  const june = await tool.execute({ incomeYear: '2025-26', accountBalance: '250000', age: 66, startDate: '2026-06-01' });
  assert.deepEqual([june.daysCounted, june.clause, june.minimumPayment], [30, 'cl 4', '0.00']);
  const leap = await tool.execute({ incomeYear: '2027-28', accountBalance: '300000', age: 80, startDate: '2027-07-01' });
  assert.deepEqual([leap.daysCounted, leap.daysInYear, leap.minimumPayment], [366, 366, '21000.00']);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', accountBalance: '600000', age: 67, startDate: '2026-06-30' }), /from 1 July 2026 to 30 June 2027/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', accountBalance: '600000', age: 67, startDate: '2027-02-29' }), /from 1 July 2026 to 30 June 2027/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', accountBalance: '600000', age: 151 }), /age must be a whole number from 0 to 150/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', accountBalance: '600000', age: 67, scopeConfirmed: false }), /Confirm the facts/);
  await assert.rejects(tool.execute({ incomeYear: '2026-27', accountBalance: '600000', age: 67, extra: 1 }), /extra is not an input of this tool/);
});

test('residency day count tool counts broken periods, leap years and the exception, and decides no residency', async () => {
  const tool = individual['residency-days'];
  const page = await tool.execute({ incomeYear: '2025-26', usualPlaceOfAbodeOutsideAustralia: false, intendsToTakeUpResidence: false,
    periods: [{ arrival: '2025-07-01', departure: '2025-09-30' }, { arrival: '2025-11-15', departure: '2026-03-31' }] });
  assert.deepEqual([page.daysInAustralia, page.daysInYear, page.daysNeeded, page.moreThanHalfReached, page.exceptionApplies, page.test183Met,
    page.residencyDecided, page.source], [229, 365, 183, true, false, true, false, 'https://duguid.com.au/tools/individual-tax/residency-days/']);
  assert.doesNotThrow(() => JSON.stringify(page));
  // TR 2023/1 example 5: Conchita, 9 months on holiday with her abode in Mexico.
  const conchita = await tool.execute({ incomeYear: '2025-26', usualPlaceOfAbodeOutsideAustralia: true, intendsToTakeUpResidence: false,
    periods: [{ arrival: '2025-08-01', departure: '2026-04-30' }] });
  assert.deepEqual([conchita.daysInAustralia, conchita.exceptionApplies, conchita.test183Met], [273, true, false]);
  // 2023-24 includes 29 February 2024: 184 days needed; overlaps and days outside the year count once or not at all.
  const leap = await tool.execute({ incomeYear: '2023-24', usualPlaceOfAbodeOutsideAustralia: false, intendsToTakeUpResidence: false,
    periods: [{ arrival: '2023-01-01', departure: '2023-12-31' }, { arrival: '2023-12-01', departure: '2023-12-31' }] });
  assert.deepEqual([leap.daysInYear, leap.daysNeeded, leap.daysInAustralia, leap.test183Met], [366, 184, 184, true]);
  await assert.rejects(tool.execute({ incomeYear: '2025-26', usualPlaceOfAbodeOutsideAustralia: false, intendsToTakeUpResidence: false,
    periods: [{ arrival: '2026-01-02', departure: '2026-01-01' }] }), /ends before it starts/);
  await assert.rejects(tool.execute({ incomeYear: '2025-26', usualPlaceOfAbodeOutsideAustralia: false, intendsToTakeUpResidence: false,
    periods: [{ arrival: '2026-02-30', departure: '2026-03-01' }] }), /is not a date/);
  await assert.rejects(tool.execute({ incomeYear: '2027-28', usualPlaceOfAbodeOutsideAustralia: false, intendsToTakeUpResidence: false, periods: [] }),
    /incomeYear does not match/);
  await assert.rejects(tool.execute({ incomeYear: '2025-26', usualPlaceOfAbodeOutsideAustralia: false, intendsToTakeUpResidence: false, periods: [],
    scopeConfirmed: false }), /Establish all stated scope conditions/);
  await assert.rejects(tool.execute({ incomeYear: '2025-26', usualPlaceOfAbodeOutsideAustralia: false, intendsToTakeUpResidence: false, periods: [],
    resides: true }), /resides is not an input of this tool/);
});

test('transfer balance tool runs transfer, charge and release modes and refuses mismatched or invalid inputs', async () => {
  const tool = individual['transfer-balance'];
  const elisabeth = await tool.execute({
    calculation: 'transfer',
    events: [
      { date: '2017-08-02', kind: 'new_income_stream', amount: '1600000' },
      { date: '2019-09-07', kind: 'commutation', amount: '1630000' },
      { date: '2019-10-12', kind: 'new_income_stream', amount: '1640000' },
    ],
    toDate: '2019-12-31',
  });
  assert.deepEqual([elisabeth.incomeYear, elisabeth.transferBalance, elisabeth.transferBalanceCap, elisabeth.excessTransferBalance,
    elisabeth.notionalEarnings, elisabeth.excessTransferBalanceTax, elisabeth.inExcess, elisabeth.currency, elisabeth.source],
  ['2019-20', '1610176.42', '1600000.00', '10176.42', '178.65', '26.80', true, 'AUD', 'https://duguid.com.au/tools/individual-tax/transfer-balance/']);
  assert.doesNotThrow(() => JSON.stringify(elisabeth));
  const charge = await tool.execute({
    calculation: 'concessional_charge', incomeYear: '2020-21', additionalTax: '1000', taxDueDate: '2021-12-01',
  });
  assert.deepEqual([charge.days, charge.excessConcessionalContributionsCharge], [518, '44.17']);
  const release = await tool.execute({
    calculation: 'non_concessional_release', incomeYear: '2024-25', excess: '100000', determinationDate: '2025-09-15',
  });
  assert.deepEqual([release.associatedEarnings, release.totalReleaseAmount, release.associatedEarningsTaxOffset,
    release.atoPublishedTable5AnnualPercent],
  ['14663.00', '112463.55', '2199.45', '11.33']);
  await assert.rejects(tool.execute({
    calculation: 'transfer', events: [{ date: '2017-08-02', kind: 'new_income_stream', amount: '1600000' }], toDate: '2019-02-30',
  }), /valid calendar date/);
  await assert.rejects(tool.execute({
    calculation: 'transfer', events: [{ date: '2017-08-02', kind: 'reversionary_income_stream', amount: '1600000' }], toDate: '2019-12-31',
  }), /kind does not match/);
  await assert.rejects(tool.execute({
    calculation: 'concessional_charge', incomeYear: '2021-22', additionalTax: '1000', taxDueDate: '2022-12-01',
  }), /repealed TAA 1953/);
  await assert.rejects(tool.execute({
    calculation: 'transfer', events: [{ date: '2017-08-02', kind: 'new_income_stream', amount: '1600000' }], toDate: '2019-12-31',
    incomeYear: '2019-20',
  }), /incomeYear does not apply/);
  await assert.rejects(tool.execute({
    calculation: 'non_concessional_release', incomeYear: '2024-25', excess: '0', determinationDate: '2025-09-15',
  }), /above nil/);
  await assert.rejects(tool.execute({
    calculation: 'transfer', events: [{ date: '2017-08-02', kind: 'new_income_stream', amount: '1600000' }], toDate: '2019-12-31', extra: 1,
  }), /extra is not an input of this tool/);
});

test('casual and overtime pay tool returns the page example, Payday Super and quarterly rules, leave loading and refusals', async () => {
  const tool = tools['casual-overtime'];
  const r = await tool.execute({ payday: '2026-07-10', baseRate: '30.00', casualLoadingPercent: '25', ordinaryHours: '30',
    lines: [{ hours: '5', percentOfBaseRate: '150', overtime: false }, { hours: '3', percentOfBaseRate: '175', overtime: true }] });
  assert.deepEqual([r.rules, r.grossPay, r.ordinaryTimeEarnings, r.notOrdinaryTimeEarnings, r.superGuarantee, r.awardApplied, r.currency, r.source],
    ['payday', '1507.50', '1350.00', '157.50', '162.00', false, 'AUD', 'https://duguid.com.au/tools/business-calculators/casual-overtime/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const leave = await tool.execute({ payday: '2026-03-12', baseRate: '40', ordinaryHours: '38', annualLeaveHours: '38',
    leaveLoadingPercent: '17.5', leaveLoadingForLostOvertime: true });
  assert.deepEqual([leave.rules, leave.leaveLoading, leave.grossPay, leave.ordinaryTimeEarnings, leave.superGuarantee],
    ['quarterly', '266.00', '3306.00', '3040.00', '364.80']);
  await assert.rejects(tool.execute({ payday: '2025-06-30', baseRate: '30', ordinaryHours: '1' }), /1 July 2025 to 30 June 2027/);
  await assert.rejects(tool.execute({ payday: '2026-07-01', baseRate: '2708.31', ordinaryHours: '100' }), /annual maximum contribution base of \$270,830/);
  assert.equal((await tool.execute({ payday: '2026-07-01', baseRate: '2708.30', ordinaryHours: '100' })).superGuarantee, '32499.60');
  await assert.rejects(tool.execute({ payday: '2026-07-10', baseRate: '30', ordinaryHours: '1', casualLoadingPercent: '25', annualLeaveHours: '1' }), /not both/);
  await assert.rejects(tool.execute({ payday: '2026-07-10', baseRate: '30', ordinaryHours: '1', extra: 1 }), /extra is not an input of this tool/);
  await assert.rejects(tool.execute({ payday: '2026-07-10', baseRate: '30', ordinaryHours: '1', lines: [{ hours: '1', percentOfBaseRate: '150' }] }), /overtime is required/);
});

test('contractor against employee tool works the page default, section 12(3) and its refusals', async () => {
  const tool = tools['contractor-employee'];
  const base = { incomeYear: '2026-27', hoursPerWeek: '38', salary: '100000', payrollTaxPercent: '5.45', workersCompensationPercent: '1.5',
    contractorHourlyRate: '70', contractorExpenses: '2000' };
  const r = await tool.execute(base);
  assert.deepEqual([r.hoursWorked, r.section12_3Applies, r.employee.cost, r.employee.takeHome, r.contractor.superGuarantee, r.contractor.cost,
    r.contractor.takeHome, r.costDifference, r.currency, r.source],
  [1824, true, '119604.00', '77800.00', '15321.60', '143001.60', '94942.40', '-23397.60', 'AUD', 'https://duguid.com.au/tools/business-calculators/contractor-employee/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const delegated = await tool.execute({ ...base, rightToDelegate: true });
  assert.deepEqual([delegated.section12_3Applies, delegated.section12_3Elements.personal, delegated.contractor.superGuarantee], [false, false, '0.00']);
  await assert.rejects(tool.execute({ ...base, incomeYear: '2020-21' }), /incomeYear/);
  await assert.rejects(tool.execute({ ...base, annualLeaveWeeks: '50', otherLeaveWeeks: '2' }), /fewer than 52 weeks/);
  await assert.rejects(tool.execute({ ...base, awardRate: '30' }), /awardRate is not an input of this tool/);
});

// The tax invoice page's example (GSTR 2013/1 example 2), a mixed invoice by the taxable supply rule, an RCTI and refusals.
test('tax invoice tool returns the page example, a mixed invoice and an RCTI, and refuses what the page refuses', async () => {
  const tool = tools['tax-invoice'];
  const base = { supplierName: 'Example Stationery Pty Ltd', supplierAbn: '51 824 753 556', recipientName: 'Jim', issued: '2026-11-26',
    lines: [{ description: 'Pens', quantity: '20', unitPrice: '1.10', treatment: 'taxable' },
      { description: 'Boxes of staples', quantity: '10', unitPrice: '1.10', treatment: 'taxable' },
      { description: 'Staplers', quantity: '4', unitPrice: '38.50', treatment: 'taxable' }] };
  const r = await tool.execute(base);
  assert.deepEqual([r.heading, r.totalPrice, r.gst, r.statements, r.checks.length, r.currency, r.source],
    ['Tax invoice', '187.00', '17.00', ['Each supply is taxable. Total price includes GST.'], 7, 'AUD',
      'https://duguid.com.au/tools/business-calculators/tax-invoice/']);
  assert.doesNotThrow(() => JSON.stringify(r));
  const mixed = await tool.execute({ ...base, rounding: 'supply', pricesIncludeGst: false,
    lines: [{ description: 'Consulting', quantity: '1', unitPrice: '100.05', treatment: 'taxable' },
      { description: 'Postage', quantity: '1', unitPrice: '0.05', treatment: 'taxable' },
      { description: 'Bread', quantity: '1', unitPrice: '4.00', treatment: 'gst-free' }] });
  assert.deepEqual([mixed.gst, mixed.totalPrice, mixed.lines.map((l) => [l.gst, l.markedTaxable])],
    ['10.02', '114.12', [['10.01', true], ['0.01', true], ['0.00', false]]]);
  const rcti = await tool.execute({ ...base, issuedBy: 'recipient', recipientName: 'Example Processor Pty Ltd', recipientAbn: '53 004 085 616',
    rctiConditionsMet: true });
  assert.equal(rcti.heading, 'Recipient created tax invoice');
  assert.ok(rcti.statements.includes('The GST shown is payable by the supplier.'));
  await assert.rejects(tool.execute({ ...base, issuedBy: 'recipient', recipientAbn: '53 004 085 616' }), /Determination 2023 allows this RCTI/);
  await assert.rejects(tool.execute({ ...base, supplierAbn: '51 824 753 557' }), /passes the check digit test/);
  const { recipientName: _jim, ...noRecipient } = base;
  await assert.rejects(tool.execute({ ...noRecipient, lines: [{ ...base.lines[2], quantity: '26' }] }), /\$1,000 or more/);
  await assert.rejects(tool.execute({ ...base, lines: [{ ...base.lines[0], unitPrice: 1.1 }] }), /unitPrice does not match its description/);
  await assert.rejects(tool.execute({ ...base, lines: [{ ...base.lines[0], treatment: 'exempt' }] }), /treatment does not match its description/);
  await assert.rejects(tool.execute({ ...base, extra: 1 }), /extra is not an input of this tool/);
});

test('trust streaming tool returns the ATO Lang Trust example and the trustee’s s 99A tax, and refuses invalid inputs', async () => {
  const tool = tools['trust-streaming'];
  const lang = await tool.execute({
    otherTrustIncome: '80000', otherNetIncome: '80000', frankedDistributions: '70000', frankingCredits: '30000',
    beneficiaries: [{ name: 'Lucy', kind: 'individual', presentEntitlement: '75000' },
      { name: 'Hannah', kind: 'individual', presentEntitlement: '75000', frankedEntitled: '50000' }],
  });
  assert.deepEqual(lang.beneficiaries.map((b) => [b.frankedShare, b.frankingCredit, b.division6]),
    [[15000, 6428.57, 60000], [55000, 23571.43, 20000]]);
  assert.deepEqual([lang.netIncome, lang.trustee.assessable, lang.currency, lang.source],
    [180000, 0, 'AUD', 'https://duguid.com.au/tools/business-calculators/trust-streaming/']);
  assert.doesNotThrow(() => JSON.stringify(lang));
  const trustee = await tool.execute({ otherTrustIncome: '10000', otherNetIncome: '10000', capitalGain: '200', capitalGainRemaining: '100',
    capitalGainConcessions: 'discount', capitalGainTrustIncome: '200', beneficiaries: [] });
  assert.deepEqual([trustee.trustee.provision, trustee.trustee.assessable, trustee.trustee.tax], ['s 99A(4)', 10200, 4590]);
  await assert.rejects(tool.execute({ otherTrustIncome: '1', otherNetIncome: '1', beneficiaries: [], extra: 1 }), /extra is not an input of this tool/);
  await assert.rejects(tool.execute({ otherTrustIncome: '1', otherNetIncome: '1', beneficiaries: [{ kind: 'partnership', presentEntitlement: '1' }] }),
    /kind does not match/);
  await assert.rejects(tool.execute({ otherTrustIncome: '100', otherNetIncome: '100', beneficiaries: [{ kind: 'individual', presentEntitlement: '101' }] }),
    /cannot exceed the trust/);
});
