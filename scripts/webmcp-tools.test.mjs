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
  assert.deepEqual(all.map(t => t.name), ['calculate_gst', 'calculate_div7a_minimum_repayment', 'calculate_loan_schedule',
    'calculate_hire_purchase_schedule', 'calculate_break_even', 'calculate_company_tax', 'calculate_foreign_purchaser_surcharges', 'calculate_long_service_leave', 'calculate_fuel_tax_credits', 'calculate_decline_in_value',
    'calculate_coal_lsl_levy']);
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
  const spied = calculatorTools(spy);
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

const individual = individualTaxTools(individualEngines);

test('each individual tax tool is keyed by the form that registers it and is read-only', () => {
  assert.deepEqual(Object.values(individual).map(t => t.name), ['calculate_income_tests', 'estimate_income_tax',
    'calculate_take_home_pay', 'calculate_sole_trader_set_aside', 'calculate_division_293_tax']);
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
  for (const limit of [/super guarantee worked on the year's earnings, not pay by pay or quarter by quarter/,
    /52, 26 or 12 pays a year; a 53rd weekly or 27th fortnightly pay is not computed/]) {
    assert.match(individual['take-home-pay'].description, limit);
  }
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
