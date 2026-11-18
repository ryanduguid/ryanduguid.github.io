// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import assert from 'node:assert/strict';
import test from 'node:test';
import * as calculate from '../assets/business-calculators.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { calculatorTools, depreciationTools, levyTools, ozzitTools } from '../assets/webmcp-tools.mjs';
import { individualTaxTools } from '../assets/webmcp-tools.mjs';
import { engines as individualEngines } from '../assets/individual-tax-results.mjs';
import * as depreciation from '../assets/depreciation-rates.mjs';
import { computeEntry } from '../assets/levy-form.mjs';
import { levyCents } from '../assets/levy.mjs';

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
    const form = readFileSync(new URL(`../_includes/calculators/${key}.html`, import.meta.url), 'utf8');
    assert.ok(form.includes(`<form class="calculator-split" data-calculator="${key}">`), key);
  }
});

test('every calculator tool is read-only, refuses unknown inputs and has its own name', () => {
  const all = [...Object.values(tools), declineInValue, levy];
  assert.deepEqual(all.map(t => t.name), ['calculate_gst', 'calculate_div7a_minimum_repayment', 'calculate_loan_payment',
    'calculate_break_even', 'calculate_decline_in_value', 'calculate_coal_lsl_levy']);
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
  const spy = Object.fromEntries(['gst', 'div7aMinimumRepayment', 'loan', 'breakEven'].map(name =>
    [name, (...args) => { calls.push([name, ...args]); return calculate[name](...args); }]));
  const spied = calculatorTools(spy);
  await spied.div7a.execute({ balance: '1000', benchmarkRate: '8.77', remainingTerm: 1 });
  await spied.loan.execute({ principal: '100000', annualRate: '6', months: 360 });
  await spied['break-even'].execute({ fixedCosts: '1000', pricePerUnit: '30', variableCostPerUnit: '18' });
  await spied.loan.execute({ principal: '60000', annualRate: '7.5', months: 60, balloon: '18000', timing: 'advance' });
  assert.deepEqual(calls, [['div7aMinimumRepayment', '1000', '8.77', '1'], ['loan', '100000', '6', '360', '0', 'arrears'],
    ['breakEven', '1000', '30', '18'], ['loan', '60000', '7.5', '60', '18000', 'advance']]);
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

test('loan tool returns the independently calculated amortising case', async () => {
  const r = await tools.loan.execute({ principal: '100000', annualRate: '6', months: 360 });
  assert.deepEqual([r.monthlyPayment, r.firstInterest, r.firstPrincipal, r.totalInterest],
    ['599.55', '500.00', '99.55', '115838.19']);
});

test('loan tool takes a balloon and payments in advance as the page does', async () => {
  // AusCalc's vehicle finance worked example, read 15 November 2026: $954.09 a month and
  // $15,245.63 total interest; in advance each payment is that divided by 1.00625.
  const arrears = await tools.loan.execute({ principal: '60000', annualRate: '7.5', months: 60, balloon: '18000' });
  assert.deepEqual([arrears.monthlyPayment, arrears.firstInterest, arrears.firstPrincipal, arrears.totalInterest],
    ['954.09', '375.00', '579.09', '15245.63']);
  const advance = await tools.loan.execute({ principal: '60000', annualRate: '7.5', months: 60, balloon: '18000', timing: 'advance' });
  assert.deepEqual([advance.monthlyPayment, advance.firstInterest, advance.firstPrincipal, advance.totalInterest],
    ['948.17', '0.00', '948.17', '14890.07']);
});

test('loan tool refuses an unknown timing, a balloon as a number and one above the principal', async () => {
  const valid = { principal: '1000', annualRate: '12', months: 12 };
  await assert.rejects(tools.loan.execute({ ...valid, timing: 'start' }), /timing does not match/);
  await assert.rejects(tools.loan.execute({ ...valid, balloon: 100 }), /balloon does not match/);
  await assert.rejects(tools.loan.execute({ ...valid, balloon: '1000.01' }), /The balloon cannot be more than the loan principal/);
});

test('loan tool refuses a fractional term, a rate with a sign and a missing principal', async () => {
  await assert.rejects(tools.loan.execute({ principal: '1000', annualRate: '12', months: 1.5 }), /months must be a whole number from 1 to 600/);
  await assert.rejects(tools.loan.execute({ principal: '1000', annualRate: '12%', months: 12 }), /annualRate does not match/);
  await assert.rejects(tools.loan.execute({ annualRate: '12', months: 12 }), /principal is required/);
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

const individual = individualTaxTools(individualEngines);

test('each individual tax tool is keyed by the form that registers it and is read-only', () => {
  assert.deepEqual(Object.values(individual).map(t => t.name), ['estimate_income_tax', 'calculate_take_home_pay']);
  for (const [key, t] of Object.entries(individual)) {
    const form = readFileSync(new URL(`../_includes/calculators/${key}.html`, import.meta.url), 'utf8');
    assert.ok(form.includes(`<form class="calculator-split" data-calculator="${key}">`), key);
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.inputSchema.additionalProperties, false, t.name);
    assert.match(t.description, /\bAUD\b/, t.name);
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

test('take-home pay tool gives PAYG withholding for a 2026-27 pay and none for a year', async () => {
  const r = await individual['take-home-pay'].execute({ incomeYear: '2026-27', residency: 'resident', salary: '3000',
    payPeriod: 'fortnight', salarySacrifice: '200', studyLoan: true });
  assert.deepEqual(r.paygWithholding, { eachPay: '554.00', studyLoanComponent: '20.00', year: '14404.00', refund: '0.00',
    amountOwing: '212.80' });
  assert.equal(r.takeHomeYear, '58183.20');
  const year = await individual['take-home-pay'].execute({ incomeYear: '2025-26', residency: 'resident', salary: '75000' });
  assert.deepEqual([year.takeHomeYear, year.medicareLevy, year.paygWithholding], ['60212.00', '1500.00', null]);
  const holiday = await individual['take-home-pay'].execute({ incomeYear: '2026-27', residency: 'working-holiday',
    salary: '3000', payPeriod: 'fortnight' });
  assert.equal(holiday.paygWithholding, null);
  assert.match(individual['take-home-pay'].description, /for a working holiday maker it gives none/);
  for (const limit of [/first home super saver/, /family trust distribution tax/, /super lump sum/, /debt still owed/]) {
    assert.match(individual['income-tax'].description, limit);
  }
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
