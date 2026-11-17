// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as calculations from '../assets/business-calculators.mjs';
import { PAYROLL_TAX_2026_27 } from '../assets/payroll-tax.mjs';
import { gst, businessUse, margin, breakEven, hourlyRate, variance, loan,
  staffCost, cashForecast, div7aMinimumRepayment, transferDuty, firstHomeDuty } from '../assets/business-calculators.mjs';
import { fbtBenefitResult } from '../assets/fbt-benefit-forms.mjs';

test('finite-decimal calculations round half cents up without binary drift', () => {
  assert.equal(businessUse('20.15', '50').share, 10.08);
  assert.equal(businessUse('4.27', '50').share, 2.14);
  assert.equal(businessUse('999999999.99', '99.99').share, 999899999.99);
  assert.equal(hourlyRate('20.15', '0', '2').rate, 10.08);
  assert.equal(hourlyRate('1000000000', '1000000000', '0.01').rate, 200000000000);
  assert.equal(staffCost('51.30', '0', '0').monthly, 4.28);
  assert.equal(loan('20.15', '0', '2').payment, 10.08);
  assert.equal(loan('201.50', '60', '12').firstInterest, 10.08);
});

test('positive-interest loan agrees with an independently calculated amortising case', () => {
  assert.deepEqual(loan('100000', '6', '360'), {
    payment: 599.55, firstInterest: 500, firstPrincipal: 99.55, totalInterest: 115838.19,
  });
});

// Two-payment cases use P = B(1+r)^2/(2+r); longer terms use independent
// high-precision sums of discounted payments. Each result rounds separately.
for (const [inputs, expected] of [
  [['1000000000', '2.4788', '2'], {
    payment: 501549782.82, firstInterest: 2065666.67, firstPrincipal: 499484116.16, totalInterest: 3099565.64,
  }],
  [['1000000000', '2.4789', '2'], {
    payment: 501549845.36, firstInterest: 2065750, firstPrincipal: 499484095.36, totalInterest: 3099690.73,
  }],
  [['18.76', '1.28', '2'], {
    payment: 9.40, firstInterest: 0.02, firstPrincipal: 9.38, totalInterest: 0.03,
  }],
  [['100.50', '12', '2'], {
    payment: 51.01, firstInterest: 1.01, firstPrincipal: 50, totalInterest: 1.51,
  }],
  [['893155987.49', '51.2498', '498'], {
    payment: 38145054.81, firstInterest: 38145054.77, firstPrincipal: 0.03, totalInterest: 18103081306.61,
  }],
  [['827222772.08', '56.9526', '297'], {
    payment: 39260447.40, firstInterest: 39260406.37, firstPrincipal: 41.03, totalInterest: 10833130106.16,
  }],
  [['1000000000', '0.0001', '600'], {
    payment: 1666708.40, firstInterest: 83.33, firstPrincipal: 1666625.07, totalInterest: 25041.87,
  }],
  [['1000000000', '100', '600'], {
    payment: 83333333.33, firstInterest: 83333333.33, firstPrincipal: 0, totalInterest: 49000000000,
  }],
  [['0.01', '100', '600'], {
    payment: 0, firstInterest: 0, firstPrincipal: 0, totalInterest: 0.49,
  }],
  [['0', '100', '600'], {
    payment: 0, firstInterest: 0, firstPrincipal: 0, totalInterest: 0,
  }],
]) {
  test(`loan rounds each result to the nearest cent for ${inputs.join(' / ')}`, () => {
    assert.deepEqual(loan(...inputs), expected);
  });
}

test('cash calendar uses complete weeks across leap days and year boundaries', () => {
  const dates = calculations.cashWeekDates('2028-02-28');
  assert.equal(dates.length, 13);
  assert.deepEqual(dates[0], { start: '2028-02-28', end: '2028-03-05' });
  assert.deepEqual(dates[1], { start: '2028-03-06', end: '2028-03-12' });
  assert.deepEqual(calculations.cashWeekDates('2026-12-28')[0], { start: '2026-12-28', end: '2027-01-03' });
  for (const date of ['', '2026-02-29', '2026-13-01', '9999-12-01']) {
    assert.throws(() => calculations.cashWeekDates(date));
  }
});

test('cash file validation rejects an invalid scenario before accepting inputs', () => {
  const data = { version: 1, currency: 'AUD', startDate: '2026-09-28', opening: '200', buffer: '100',
    week: '1', amount: '100', delay: '2', weeks: Array.from({ length: 13 }, () => ({ receipts: '1000', payments: '300' })) };
  const parse = changes => calculations.parseCashScenario(JSON.stringify({ ...data, ...changes }));
  assert.deepEqual(parse({}), data);
  for (const change of [{ version: 2 }, { currency: 'USD' }, { weeks: [] }, { startDate: '2026-02-29' },
    { opening: '1e20' }, { amount: '1001' }, { delay: '1.5' }]) assert.throws(() => parse(change));
  assert.throws(() => calculations.parseCashScenario('null'));
  assert.throws(() => calculations.parseCashScenario('{'));
  assert.throws(() => calculations.parseCashScenario(' '.repeat(65537)));
});

test('accepted cash amounts are ready for number fields after loading', () => {
  const data = { version: 1, currency: 'AUD', startDate: '2026-09-28', opening: '-200.00', buffer: '100',
    week: '1', amount: '100', delay: '2', weeks: Array.from({ length: 13 }, () => ({ receipts: '1000', payments: '300' })) };
  const padded = structuredClone(data);
  for (const key of ['opening', 'buffer', 'week', 'amount', 'delay']) padded[key] = ` \t${data[key]}\n\u00a0`;
  for (const row of padded.weeks) {
    row.receipts = ` \t${row.receipts}\n\u00a0`;
    row.payments = ` \t${row.payments}\n\u00a0`;
  }
  assert.deepEqual(calculations.parseCashScenario(JSON.stringify(padded)), data);
  const written = { ...structuredClone(data), opening: '-$1,200.00', buffer: '$100' };
  for (const row of written.weeks) row.receipts = '$1,000';
  assert.deepEqual(calculations.parseCashScenario(JSON.stringify(written)), { ...data, opening: '-1200.00' });
});

test('money accepts a leading dollar sign and grouped thousands, and nothing looser', () => {
  assert.deepEqual(gst('$85,000', false), gst('85000', false));
  assert.deepEqual(gst(' $1,234,567.89 ', true), gst('1234567.89', true));
  assert.equal(variance('-$1,080', '-$1,000', 'income').difference, -80);
  assert.equal(hourlyRate('80,000', '0', '1,600').rate, 50);
  for (const value of ['8,5000', '85,00', ',000', '1,,000', '1,000,', '$', '$$5', '$-5', '$ 5', '5$', '$1e3', '1,000e3']) {
    assert.throws(() => gst(value, false), /Enter a number using digits only\./, value);
  }
  assert.throws(() => gst('$1,000.001', false), /no more than 2 decimal places/);
  assert.throws(() => businessUse('100', '$50'), /Enter a number using digits only\./);
  assert.throws(() => loan('1000', '12', '$12'), /Enter a number using digits only\./);
});

test('GST extracts a component instead of adding another ten per cent', () => {
  assert.deepEqual(gst('110.00', true), { net: 100, gst: 10, gross: 110 });
  assert.deepEqual(gst('100.05', false), { net: 100.05, gst: 10.01, gross: 110.06 });
  assert.deepEqual(gst('0.05', true), { net: 0.05, gst: 0, gross: 0.05 });
});

test('business use apportions the supplied eligible cost and rejects impossible shares', () => {
  assert.equal(businessUse('1200', '25').share, 300);
  assert.throws(() => businessUse('1200', '101'));
});

test('margin uses revenue as denominator and markup uses cost', () => {
  assert.deepEqual(margin('150', '100'), { profit: 50, margin: 33.33, markup: 50 });
  assert.deepEqual(margin('0', '100'), { profit: -100, margin: null, markup: -100 });
  assert.equal(margin('100', '0').markup, null);
});

test('percentages round exact ties half away from zero, whatever the amounts', () => {
  // Each pair is the same exact 1.005% margin; float division showed 1.00% for one, 1.01% for the other.
  assert.equal(margin('200', '197.99').margin, 1.01);
  assert.equal(margin('1000', '989.95').margin, 1.01);
  assert.equal(margin('202.01', '200').markup, 1.01);
  assert.equal(margin('197.99', '200').markup, -1.01);
  assert.equal(variance('2004.10', '2000', 'cost').percent, 0.21);
  assert.equal(variance('1995.90', '2000', 'cost').percent, -0.21);
  assert.equal(variance('-1995.90', '-2000', 'income').percent, 0.21);
  // Either side of a tie: 1.004% rounds down and 1.006% rounds up.
  assert.equal(margin('1000', '989.96').margin, 1);
  assert.equal(margin('1000', '989.94').margin, 1.01);
});

test('a percentage that rounds to zero is never negative zero', () => {
  for (const value of [margin('100000', '100000.01').margin, margin('100000.01', '100000.02').markup,
    variance('99999.99', '100000', 'income').percent]) {
    assert.ok(Object.is(value, 0), `expected +0, got ${value}`);
  }
});

test('break-even rounds units up and refuses non-positive contributions', () => {
  assert.deepEqual(breakEven('1000', '30', '18'), { contribution: 12, units: 84, sales: 2520 });
  const refusal = { message: 'Price must exceed variable cost per unit to reach break-even.' };
  assert.throws(() => breakEven('1000', '18', '18'), refusal);
  assert.throws(() => breakEven('1000', '17', '18'), refusal);
  assert.throws(() => breakEven('1000000000', '1000000000', '999999999.99'));
});

// Worked by hand: 18.5 hours x $95 / (1 - 40%) = $2,929.1666..., up to the next $10 is
// $2,930; GST $293; $3,223 / 12 = $268.5833... rounds down to $268.58, 11 of which are
// $2,954.38, so the first is $3,223 - $2,954.38 = $268.62; $2,930 / 18.5 = $158.378... is
// $158.38 an hour. 12 hours at $180 is $2,160, up to the next $50 is $2,200, with GST $2,420:
// $201.66 a month after a first of $201.74; $2,200 / 12 hours = $183.33.
test('a fixed fee comes from hours at a rate or a cost and margin, rounded up to the step', () => {
  assert.deepEqual(calculations.fixedFee('18.5', '95', '40', '10', true, '12'),
    { fee: 2930, gst: 293, total: 3223, first: 268.62, instalment: 268.58, effectiveRate: 158.38 });
  assert.deepEqual(calculations.fixedFee('12', '180', '0', '50', true, '12'),
    { fee: 2200, gst: 220, total: 2420, first: 201.74, instalment: 201.66, effectiveRate: 183.33 });
  // Exactly on a step stays there; 1 cent over goes to the next step.
  assert.equal(calculations.fixedFee('10', '100', '0', '100', false, '1').fee, 1000);
  assert.equal(calculations.fixedFee('10', '100.01', '0', '100', false, '1').fee, 1100);
  // A margin is a share of the fee: $120 at 45% is $218.1818..., up to $218.19.
  assert.equal(calculations.fixedFee('1', '120', '45', '0.01', false, '1').fee, 218.19);
  assert.equal(calculations.fixedFee('1', '120', '45', '0.01', true, '1').gst, 21.82);
});

test('fixed fee instalments add up to the fee to the cent, the first carrying the cents left over', () => {
  for (const total of ['0.01', '1', '10.13', '330', '999.99', '3223', '1234567.89']) {
    for (const count of [1, 2, 3, 7, 11, 12, 13, 23, 24]) {
      const result = calculations.fixedFee('1', total, '0', '0.01', false, String(count));
      const [whole, first, each] = [result.total, result.first, result.instalment].map((value) => Math.round(value * 100));
      assert.equal(whole, Math.round(Number(total) * 100));
      assert.equal(first + each * (count - 1), whole, `${total} over ${count}`);
      assert.ok(first - each >= 0 && first - each < count, `${total} over ${count}`);
      // After any number of months the client has paid at least that many months' even share.
      for (let paid = 1; paid <= count; paid += 1) assert.ok((first + each * (paid - 1)) * count >= whole * paid);
    }
  }
});

test('fixed fee refuses a full margin, an unknown step, an instalment count outside 1 to 24 and a fee over $1 billion', () => {
  const refuse = (args, message) => assert.throws(() => calculations.fixedFee(...args), { message });
  refuse(['10', '100', '100', '10', true, '12'], 'Enter an amount between 0 and 99.99.');
  refuse(['10', '100', '0', '5', true, '12'], 'Choose a rounding step.');
  for (const count of ['0', '25', '1.5']) refuse(['10', '100', '0', '10', true, count], 'Enter a whole number between 1 and 24.');
  refuse(['8784', '1000000', '99.99', '10', false, '1'], 'The fee is over $1,000,000,000. Use smaller amounts.');
  assert.equal(calculations.fixedFee('1', '909090909.09', '0', '0.01', true, '1').total, 1000000000);
  refuse(['1', '909090909.1', '0', '0.01', true, '1'], 'The fee is over $1,000,000,000. Use smaller amounts.');
});

test('hourly pricing uses billable hours and annual target profit', () => {
  assert.equal(hourlyRate('80000', '20000', '1000').rate, 100);
  assert.throws(() => hourlyRate('80000', '20000', '0'));
});

test('a required hourly rate rounds up so the hours cover costs and profit', () => {
  // $100 over 3 hours is 33.333...: the nearest cent, 33.33, would recover $99.99.
  assert.equal(hourlyRate('100', '0', '3').rate, 33.34);
  assert.equal(hourlyRate('100000', '0', '2999').rate, 33.35);
  assert.ok(hourlyRate('100000', '0', '2999').rate * 2999 >= 100000);
});

test('exponent notation asks for digits rather than blaming decimal places', () => {
  assert.throws(() => hourlyRate('1e3', '0', '10'), /Enter a number using digits only\./);
  assert.throws(() => hourlyRate('100.005', '0', '10'), /no more than 2 decimal places/);
});

test('variance changes favourability for costs and keeps zero budget undefined', () => {
  assert.deepEqual(variance('120', '100', 'income'), { difference: 20, percent: 20, effect: 'Favourable' });
  assert.equal(variance('120', '100', 'cost').effect, 'Unfavourable');
  assert.equal(variance('20', '0', 'cost').percent, null);
  assert.equal(variance('-80', '-100', 'income').percent, 20);
  assert.throws(() => variance('1', '1', 'anything'));
});

// Each balloon or advance result here was worked separately in exact fractions: the
// payment is (principal - balloon v^n) over the sum of v^k, for k = 1 to n in arrears and
// 0 to n - 1 in advance, with v = 1 / (1 + r); total interest is n payments plus the
// balloon less the principal. The first 2 are also AusCalc's worked example on its vehicle
// finance page, read 15 November 2026: $954.09 a month and total interest $15,245.63, and
// $1,202.28 and $12,136.61 with no residual.
for (const [inputs, expected] of [
  [['60000', '7.5', '60', '18000'], { payment: 954.09, firstInterest: 375, firstPrincipal: 579.09, totalInterest: 15245.63 }],
  [['60000', '7.5', '60', '0'], { payment: 1202.28, firstInterest: 375, firstPrincipal: 827.28, totalInterest: 12136.61 }],
  [['60000', '7.5', '60', '18000', 'advance'], { payment: 948.17, firstInterest: 0, firstPrincipal: 948.17, totalInterest: 14890.07 }],
  [['60000', '7.5', '60', '0', 'advance'], { payment: 1194.81, firstInterest: 0, firstPrincipal: 1194.81, totalInterest: 11688.56 }],
  // A balloon equal to the principal leaves interest only: 1% of $1,000 a month in arrears,
  // and 1% discounted a month, 1,000 x 0.01 / 1.01, in advance.
  [['1000', '12', '12', '1000'], { payment: 10, firstInterest: 10, firstPrincipal: 0, totalInterest: 120 }],
  [['1000', '12', '1', '1000', 'advance'], { payment: 9.9, firstInterest: 0, firstPrincipal: 9.9, totalInterest: 9.9 }],
  // At nil interest the balloon comes off the principal and the rest divides evenly.
  [['1200', '0', '12', '200', 'advance'], { payment: 83.33, firstInterest: 0, firstPrincipal: 83.33, totalInterest: 0 }],
  [['1200', '0', '12', '1200'], { payment: 0, firstInterest: 0, firstPrincipal: 0, totalInterest: 0 }],
]) {
  test(`loan takes a balloon and payments in advance: ${inputs.join(' / ')}`, () => {
    assert.deepEqual(loan(...inputs), expected);
  });
}

test('loan refuses a balloon above the principal and an unknown payment timing', () => {
  assert.throws(() => loan('1000', '12', '12', '1000.01'), { message: 'The balloon cannot be more than the loan principal.' });
  assert.throws(() => loan('1000', '12', '12', '0', 'start'), { message: 'Choose payments in arrears or in advance.' });
  assert.throws(() => loan('1000', '12', '12', '-1'), /between 0 and/);
});

test('loan handles zero interest and a hand-calculated one-period loan', () => {
  assert.deepEqual(loan('1200', '0', '12'), { payment: 100, firstInterest: 0, firstPrincipal: 100, totalInterest: 0 });
  assert.deepEqual(loan('1000', '12', '1'), { payment: 1010, firstInterest: 10, firstPrincipal: 1000, totalInterest: 10 });
  assert.throws(() => loan('1000', '12', '1.5'));
});

test('staff cost adds supplied amounts without double-counting paid leave', () => {
  assert.deepEqual(staffCost('80000', '9600', '4000'), { annual: 93600, monthly: 7800 });
});

test('cash delay creates a temporary gap, preserving the end balance on receipt', () => {
  const rows = Array.from({ length: 13 }, () => ({ receipts: '0', payments: '100' }));
  rows[0].receipts = '1000';
  const result = cashForecast('200', rows, '100', { week: 1, amount: '1000', delay: 2 });
  assert.equal(result.rows[0].closing, 100);
  assert.equal(result.rows[1].closing, 0);
  assert.equal(result.rows[2].receipts, 1000);
  assert.equal(result.closing, -100);
  assert.equal(result.minimum, -100);
  assert.equal(result.funding, 200);
  assert.equal(result.deferred, 0);
});

test('cash funding counts the opening balance when every week rises', () => {
  // The lowest point is the opening balance itself, before any week's receipts.
  const rows = Array.from({ length: 13 }, () => ({ receipts: '50', payments: '0' }));
  const result = cashForecast('20', rows, '100');
  assert.equal(result.minimum, 20);
  assert.equal(result.funding, 80);
});

test('cash keeps out-of-horizon receipts visible and includes opening deficits', () => {
  const rows = Array.from({ length: 13 }, () => ({ receipts: '0', payments: '0' }));
  rows[12].receipts = '1000';
  const result = cashForecast('-50', rows, '100', { week: 13, amount: '600', delay: 1 });
  assert.equal(result.closing, 350);
  assert.equal(result.deferred, 600);
  assert.equal(result.funding, 150);
  assert.throws(() => cashForecast('0', rows, '0', { week: 13, amount: '1001', delay: 1 }));
  assert.throws(() => cashForecast('0', rows.slice(1), '0'));
  assert.equal(cashForecast('0', rows, '0', { week: 13, amount: '0', delay: 13 }).closing, 1000);
  const landing = cashForecast('0', rows, '0', { week: 12, amount: '0', delay: 1 });
  assert.equal(landing.deferred, 0);
  rows[11].receipts = '700';
  const lastWeek = cashForecast('0', rows, '0', { week: 12, amount: '700', delay: 1 });
  assert.equal(lastWeek.deferred, 0);
  assert.equal(lastWeek.closing, 1700);
});

// The boundary cases each calculator page shows are data this test runs, so a page
// cannot state a result the engine does not return.
const shownCases = JSON.parse(readFileSync(new URL('../_data/calculator_cases.json', import.meta.url), 'utf8'));
// Each land tax jurisdiction's data as its radio in the land tax include holds it, keyed as the
// browser's dataset keys it (data-trust-scale becomes trustScale): its name, scales (from, base,
// rate, over, rule for each band) and fixed charge.
const landTaxHtml = readFileSync(new URL('../_includes/calculators/land-tax.html', import.meta.url), 'utf8');
const landTaxRadios = [...landTaxHtml.matchAll(/<input type="radio" name="jurisdiction" value="([^"]+)"((?: data-[a-z-]+="[^"]*")+)(?: checked)? \/> ([^<]+)<\/label>/g)]
  .map(([, code, attributes, label]) => ({ code, label, data: Object.fromEntries([...attributes.matchAll(/data-([a-z-]+)="([^"]*)"/g)]
    .map(([, key, value]) => [key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value])) }));
const landTaxPlaces = Object.fromEntries(landTaxRadios.map((radio) => [radio.code, radio]));
const landTaxArgs = ([value, place, choices]) => [value, landTaxPlaces[place].data, choices];
// Each jurisdiction's transfer duty scale as rates/transfer-duty/transfer-duty-rates.csv holds it:
// over, to, base, rate, rule for each bracket. No cell in that table is quoted.
const PLACES = { 'AU-NSW': 'New South Wales', 'AU-VIC': 'Victoria', 'AU-QLD': 'Queensland',
  'AU-WA': 'Western Australia', 'AU-SA': 'South Australia', 'AU-TAS': 'Tasmania',
  'AU-ACT': 'Australian Capital Territory', 'AU-NT': 'Northern Territory' };
const transferDutyScales = (() => {
  const [header, ...lines] = readFileSync(new URL('../rates/transfer-duty/transfer-duty-rates.csv', import.meta.url), 'utf8')
    .trim().split(/\r?\n/).map((line) => (assert.ok(!line.includes('"')), line.split(',')));
  const column = (name) => header.indexOf(name);
  const scales = {};
  for (const cells of lines) {
    (scales[cells[column('jurisdiction')]] ??= []).push(
      ['value_over', 'value_to', 'base_amount', 'rate_percent', 'rule'].map((name) => cells[column(name)]));
  }
  return scales;
})();
// A boundary case names its jurisdiction; the engine takes that jurisdiction's scale.
const engineArgs = (name, call) => (name === 'transferDuty' ? [call[0], transferDutyScales[call[1]]]
  : name === 'firstHomeDuty' ? [call[0], transferDutyScales[call[1]], call[1], call[2]]
  : name === 'landTaxYear' ? landTaxArgs(call) : call);
const dollars = (value) => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-AU',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// How each result reads on a page, so a value shown under the wrong label fails.
const LABELS = { net: 'exclusive', gst: 'GST', gross: 'inclusive', share: 'business share', profit: 'profit',
  contribution: 'contribution', sales: 'sales', rate: 'rate', difference: 'difference', payment: 'payment',
  firstInterest: 'first interest', firstPrincipal: 'first principal', totalInterest: 'total interest',
  annual: 'annual', monthly: 'monthly', closing: 'closing', minimum: 'minimum', funding: 'funding',
  deferred: 'deferred', repayment: 'repayment', interest: 'interest', principal: 'principal',
  fee: 'fee', total: 'total', first: 'first instalment', instalment: 'each later instalment', effectiveRate: 'effective rate', duty: 'duty' };
Object.assign(LABELS, { baseValue: 'base value', statutory: 'statutory formula value', operating: 'operating cost value',
  taxableValue: 'taxable value', grossedUp: 'grossed-up value', fbt: 'FBT', general: 'general duty' });
Object.assign(LABELS, { final: 'final instalment', totalPaid: 'total paid', gic: 'GIC' });
// PCG 2021/4 results are scores, a zone and percentages of the entitlement or the benchmark.
const PCG_SHOWN = { returned: (v) => `returned ${v.toFixed(2)}%`, taxRate: (v) => `tax rate ${v.toFixed(2)}%`,
  benchmarkShare: (v) => `${v.toFixed(2)}% of benchmark`, factor1: (v) => `factor 1 score ${v}`,
  factor2: (v) => `factor 2 score ${v}`, factor3: (v) => `factor 3 score ${v}`,
  total: (v) => (v === null ? 'no aggregate' : `aggregate ${v}`), zone: (v) => `${v} zone` };
// A date as the objection deadline page writes it: 'Saturday 18 November 2028'.
const longDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shownField = (field, value, labels = LABELS) => {
  if (typeof labels[field] === 'function') return labels[field](value);
  if (field === 'effect' || field === 'rule') return value;
  if (field === 'instalmentRate') return `instalment rate ${value.toFixed(2)}%`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${labels[field]} ${longDay(value)}`;
  if (field === 'units') return `${value} units`;
  if (field === 'percent') return value === null ? 'no percentage' : `${value.toFixed(2)}%`;
  if (field === 'margin' || field === 'markup') return value === null ? `no ${field}` : `${field} ${value.toFixed(2)}%`;
  return `${labels[field]} ${dollars(value)}`;
};
Object.assign(LABELS, { periodEnds: 'period ends', lastDay: 'last day', amendedEnds: '60 days after the amended notice',
  firstEnds: 'first notice period ends' });
Object.assign(LABELS, { amount: 'amount', credit: 'credit', due: 'due by this instalment' });
// Fields an engine shows its own way, by engine: a label, or a function that writes the value.
const ENGINE_LABELS = { paygInstalment: { instalment: 'instalment' }, pcgRisk: PCG_SHOWN,
  gicPaymentPlan: { instalment: 'instalment', lastDate: (v) => `last instalment ${v}`,
    assumedDays: (v) => `${v} ${v === 1 ? 'day' : 'days'} at the assumed rate` } };
// The vehicle classifier's results are answers, a load in kg and money.
const kgs = (value) => `${Number(value).toLocaleString('en-AU')} kg`;
ENGINE_LABELS.vehicleClass = { load: (v) => `load ${kgs(v)}`, car: (v) => (v ? 'a car' : 'not a car'),
  passengers: (v) => (v === null ? 'passenger design not decided' : v ? 'designed for passengers' : 'not designed for passengers'),
  carLimit: (v) => (v === null ? 'car limit not decided' : v ? 'car limit applies' : 'no car limit'),
  capApplies: (v) => (v === null ? 'GST credit cap not decided' : v ? 'GST credit cap applies' : 'no GST credit cap'),
  credit: (v) => (v === null ? 'GST credit not decided' : `GST credit ${dollars(v)}`), cost: (v) => `cost ${dollars(v)}`,
  luxury: (v) => ({ 'not-a-car': 'not a car for LCT', under: 'LCT cannot apply', over: 'LCT can apply',
    commercial: 'a commercial vehicle for LCT', undetermined: 'LCT not decided' })[v],
  over: (v) => `${dollars(v)} over the LCT threshold`,
  fbt: (v) => ({ '47(6)': 'FBT subsection 47(6)', '8(2)(a)(i)': 'FBT paragraph 8(2)(a)(i)', '8(2)(a)(ii)': 'FBT paragraph 8(2)(a)(ii)',
    'car-benefit': 'a car fringe benefit' })[v],
  exempt: (v) => (v ? 'exempt on the stated use' : 'not exempt') };
// The vehicle classifier's years, as its form's radios carry them; a test below binds them to their sources.
const vehicleYears = Object.fromEntries([...readFileSync(new URL('../_includes/calculators/vehicle-class.html', import.meta.url), 'utf8')
  .matchAll(/name="year" value="([^"]+)" data-car-limit="(\d+)" data-fuel-efficient="(\d+)" data-other="(\d+)"/g)]
  .map(([, year, carLimit, fuelEfficientThreshold, otherThreshold]) => [year, { carLimit, fuelEfficientThreshold, otherThreshold }]));
const VEHICLE_BODIES = { passenger: 'Passenger body', 'single-cab': 'Single cab ute', 'dual-cab': 'Dual cab ute', van: 'Panel van',
  other: 'Another body', motorcycle: 'Motor cycle' };

test('every business calculator shows its boundary cases', () => {
  const pages = readdirSync(new URL('../tools/business-calculators/', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(Object.keys(shownCases).sort(), pages);
});

// How each calculator's arguments read as a page's input, so a displayed input cannot
// describe anything but the arguments its row runs.
const INPUTS = {
  gst: (amount, inclusive) => `${dollars(amount)} ${inclusive ? 'including' : 'excluding'} GST`,
  businessUse: (amount, percent) => `${dollars(amount)} at ${percent}%`,
  margin: (sales, cost) => `Sales ${dollars(sales)}, cost ${dollars(cost)}`,
  breakEven: (fixed, price, variable) =>
    `Fixed ${dollars(fixed)}, price ${dollars(price)}, variable ${dollars(variable)}`,
  hourlyRate: (costs, profit, hours) => `Costs ${dollars(costs)}, profit ${dollars(profit)}, ${hours} hours`,
  fixedFee: (hours, rate, margin, roundTo, addGst, instalments) => `${hours} ${hours === '1' ? 'hour' : 'hours'} at `
    + `${dollars(rate)} an hour, ${margin}% margin, rounded up to ${roundTo === '0.01' ? 'the cent' : `$${roundTo}`}, `
    + `${addGst ? 'GST added' : 'no GST'}, ${instalments} ${instalments === '1' ? 'instalment' : 'instalments'}`,
  variance: (actual, budget, kind) => `Actual ${dollars(actual)}, budget ${dollars(budget)}, ${kind}`,
  loan: (principal, rate, months, balloon = '0', timing = 'arrears') =>
    `${dollars(principal)} at ${rate}% over ${months} ${months === '1' ? 'month' : 'months'}`
    + `${balloon === '0' ? '' : `, balloon ${dollars(balloon)}`}${timing === 'advance' ? ', paid in advance' : ''}`,
  staffCost: (wages, superannuation, other) =>
    `Wages ${dollars(wages)}, super ${dollars(superannuation)}, other ${dollars(other)}`,
  div7aMinimumRepayment: (balance, rate, term) => `${dollars(balance)} at ${rate}% over ${term} ${term === '1' ? 'year' : 'years'}`,
  transferDuty: (value, place) => `${PLACES[place]}, ${dollars(value)}`,
  firstHomeDuty: (value, place, home) => `${PLACES[place]}, ${dollars(value)}, first home buyer, ${home} home`,
  fbtCar: (car, year) => `${car.method === 'operating' ? `Operating cost ${dollars(car.costs)} at ${car.businessUse}% business use; `
    : 'Statutory formula; '}cost price ${dollars(car.cost)}${car.accessories === '0' ? '' : ` plus ${dollars(car.accessories)} accessories`}`
    + `${car.reduced ? ', held 4 years' : ''}, ${car.days} of ${year.days} days, contributions ${dollars(car.contribution)}, gross-up ${year.grossUp}`,
  pcgRisk: (a) => `${a.gateway1 && a.gateway2 ? 'Gateways passed' : `Gateway ${a.gateway1 ? 2 : 1} failed`}; entitlement `
    + `${dollars(a.entitlement)}, returned ${dollars(a.returned)}, tax ${dollars(a.tax)}`
    + `${a.factor3 ? `, remuneration ${dollars(a.remuneration)} against ${dollars(a.benchmark)}` : ''}`,
  gicPaymentPlan: (p) => `${dollars(p.debt)} from ${p.start}, ${p.count} ${p.frequency} `
    + `${p.count === '1' ? 'instalment' : 'instalments'}, ${p.assumedRate}% assumed after the table`,
  vehicleClass: (v, y) => `${VEHICLE_BODIES[v.body]}, ${v.seats} ${v.seats === '1' ? 'seat' : 'seats'}, gross vehicle mass ${kgs(v.gvm)}`
    + `${v.kerb === '0' ? '' : `, kerb weight ${kgs(v.kerb)}`}${v.payload === '0' ? '' : `, payload ${kgs(v.payload)}`}`
    + `${v.accessories === '0' ? '' : `, accessories at supply ${kgs(v.accessories)}`}`
    + `${{ no: '', plated: ', modified, manufacturer’s figures', unplated: ', modified, manufacturer’s figures unknown' }[v.modified]}`
    + `, ${Object.keys(vehicleYears).find((year) => JSON.stringify(vehicleYears[year]) === JSON.stringify(y))}, price ${dollars(Number(v.cost))}`
    + `${v.credit === 'none' ? ', no GST credit' : ''}${v.fuel === 'efficient' ? ', fuel-efficient' : ''}`
    + `${v.use === 'other' ? ', private use more than limited' : ''}`,
  cashForecast: (opening, weeks, buffer, delayed) => {
    const week = weeks.findIndex(({ receipts }) => receipts !== '0');
    assert.ok(weeks.every(({ receipts, payments }, index) => payments === '0' && (index === week || receipts === '0')));
    assert.equal(delayed.week, week + 1);
    return `Opening ${dollars(opening)}, buffer ${dollars(buffer)}, ${dollars(weeks[week].receipts)} received in `
      + `week ${week + 1}, ${dollars(delayed.amount)} of it delayed ${delayed.delay} week`;
  },
  objectionDeadline: (decision, group, notice, first) => {
    const date = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
      { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const kind = { assessment: 'Income tax assessment', amended: 'Amended income tax assessment', fbt: 'FBT assessment',
      'amended-fbt': 'Amended FBT assessment', other: 'Other decision' }[decision];
    return `${kind}${decision === 'assessment' || decision === 'amended' ? `, ${group} years` : ''}, notice ${date(notice)}`
      + `${decision.startsWith('amended') ? `, first notice ${date(first)}` : ''}`;
  },
  paygInstalment: (f) => ({
    amount: `Instalment amount ${dollars(f.notified)}`,
    'varied-amount': `Varied amount, instalment ${f.instalment}; estimated tax ${dollars(f.estimatedTax)}, `
      + `earlier instalments ${dollars(f.earlier)}, credits ${dollars(f.credits)}`,
    rate: `Instalment income ${dollars(f.income)} at ${f.rate}%`,
    'varied-rate': `Varied rate from estimated tax ${dollars(f.estimatedTax)} on ${dollars(f.estimatedIncome)}; `
      + `instalment income ${dollars(f.income)}, rate at T2 ${f.rate}%; earlier instalments ${dollars(f.earlier)}, `
      + `credits ${dollars(f.credits)}, on ${dollars(f.earlierIncome)}`,
  })[f.method],
};
Object.assign(INPUTS, { landTaxYear: (value, place, { trust, foreign, surchargeValue, metro } = {}) =>
  `${PLACES[place]}${trust ? ', trust rates' : ''}${foreign ? ', foreign or absentee owner' : ''}, ${dollars(value)}`
    + `${surchargeValue ? `, surcharge value ${dollars(surchargeValue)}` : ''}${metro ? ', Perth metropolitan region' : ''}` });
Object.assign(ENGINE_LABELS, { landTaxYear: { tax: 'land tax', surcharge: 'surcharge', mrit: 'MRIT', total: 'total' } });
const wholeDollars = (value) => `$${Number(value).toLocaleString('en-AU')}`;
const PEER_INPUTS = {
  margin: (sales, cost) => `${wholeDollars(sales)} total revenue and ${wholeDollars(cost)} cost of goods sold`,
  breakEven: (fixed, price, variable) => `${wholeDollars(fixed)} fixed costs, a ${wholeDollars(price)} price and `
    + `${wholeDollars(variable)} variable cost a unit, which is a ${(price - variable) / price * 100}% gross profit margin`,
  loan: (principal, rate, months) =>
    `$${Number(principal).toLocaleString('en-AU')} at ${rate}% over ${months / 12} years, repaid monthly, no fees`,
};

// peer_result and verdict are dated manual observations of the official calculator. This
// binds the published verdict to the recorded observation; it does not reread the official site.
// whole: the official calculator shows whole dollars, so this calculator's cents are rounded to compare.
const PEER_READINGS = {
  gst: { form: /^GST \$(\d+\.\d{2}), price including GST \$(\d+\.\d{2})$/,
    own: (result) => [result.gst, result.gross], verdict: 'Both give the same cents on this input' },
  loan: { form: /^repayments of \$([\d,]+) a month, total repayments \$([\d,]+)$/,
    own: (result, [principal]) => [result.payment, Number(principal) + result.totalInterest], whole: true,
    verdict: 'Moneysmart shows whole dollars, and the 2 agree to the dollar on this input' },
  // Business Queensland's calculators dropped the cents of each amount entered on 13 November 2026
  // (20.99 less 13 gave a gross profit of 7), so these inputs and results are whole dollars.
  margin: { form: /^a gross profit of \$([\d,]+) and a gross profit margin of (\d+\.\d{2})%$/,
    own: (result) => [result.profit, result.margin],
    verdict: 'Business Queensland ignored the cents in amounts entered, so this input is in whole dollars; '
      + 'the 2 agree on it' },
  breakEven: { form: /^a break-even point of \$([\d,]+)$/, own: (result) => [result.sales],
    verdict: 'Business Queensland ignored the cents in amounts entered and does not round up to a whole unit, '
      + 'so this input is in whole dollars and breaks even on a whole unit; the 2 agree on it' },
};
const assertPeerReading = (name, peer, result) => {
  const { form, own, whole, verdict } = PEER_READINGS[name];
  assert.match(peer.peer_result, form);
  assert.deepEqual(peer.peer_result.match(form).slice(1).map((figure) => Number(figure.replaceAll(',', ''))),
    own(result, peer.call).map((figure) => (whole ? Math.round(figure) : figure)));
  assert.equal(peer.verdict, verdict);
};

const assertShown = (actual, { result, output }, labels = LABELS) => {
  const fields = Object.entries(result);
  for (const [field, value] of fields) assert.equal(actual[field], value, field);
  assert.equal(output.replace(/ on the \S+ borrowed$/, '').toLowerCase(),
    fields.map(([field, value]) => shownField(field, value, labels)).join(', ').toLowerCase());
};

// The FBT car parking, loan and meal entertainment cases: how each call and result reads.
Object.assign(INPUTS, {
  fbtLoan: (l, y) => `Daily balances ${dollars(l.balances)}, accrued ${dollars(l.accrued)}, income use ${l.incomeUse}%, `
    + `deduction ${dollars(l.deduction)}, at ${y.rate}%`,
  fbtMealEntertainment: (x) => (x.method === 'split' ? `50/50 split, expenses ${dollars(x.expenses)}`
    : `Register, expenses ${dollars(x.expenses)}, ${dollars(x.registerBenefits)} of ${dollars(x.registerTotal)}, `
      + `first valid ${x.firstYear}${x.earlier.length ? `, earlier years ${x.earlier.map(dollars).join(' and ')}` : ''}`),
  fbtCarParking: (p, y) => `${{ station: `Station, ${p.benefits} at ${dollars(p.each)}`,
    market: `Market value, ${p.benefits} at ${dollars(p.each)}`,
    average: `Average cost, ${p.benefits} at fees ${dollars(p.firstFee)} and ${dollars(p.lastFee)}`,
    register: `Register, ${dollars(p.registerValue)} over ${p.days} days, first valid ${p.firstYear}`,
    spaces: `Spaces, ${p.spaces} at ${dollars(p.rate)} for ${p.spaceDays} days, employees ${p.employeesStart} and `
      + `${p.employeesEnd}, spaces ${p.spacesStart} and ${p.spacesEnd}` }[p.method]}`
    + `${p.method === 'register' ? '' : `, contributions ${dollars(p.contribution)}`}; fee ${dollars(p.fee)} against ${dollars(y.threshold)}`,
});
Object.assign(ENGINE_LABELS, {
  fbtLoan: { notional: 'notional interest', gross: 'gross taxable value', grossDeduction: 'gross deduction',
    notionalDeduction: 'notional deduction', reduction: 'reduction' },
  fbtMealEntertainment: { registerPercent: (v) => `register percentage ${v.toFixed(2)}%` },
  fbtCarParking: { benefit: (v) => (v ? 'benefit arises' : 'no benefit arises'), gross: 'gross taxable value',
    contributionApplied: 'contributions applied', excess: 'excess contributions', average: 'average cost',
    annual: 'annual value', statutoryBenefit: 'total statutory benefit' },
});

for (const [page, { function: name, peer, rows }] of Object.entries(shownCases)) {
  if (peer) {
    test(`${page} official comparison states what this calculator returns`, () => {
      assert.match(peer.url, /^https:\/\/(moneysmart\.gov\.au|www\.business\.qld\.gov\.au)\//);
      assert.match(peer.checked, /^\d{1,2} [A-Z][a-z]+ \d{4}$/);
      assert.equal((PEER_INPUTS[name] ?? INPUTS[name])(...peer.call), peer.input);
      assertShown(calculations[name](...peer.call), peer);
      assertPeerReading(name, peer, calculations[name](...peer.call));
    });
  }
  for (const row of rows) {
    test(`${page} boundary case returns what its page shows: ${row.case}`, () => {
      // A row may name another engine of the same calculator.
      const engine = row.function ?? name;
      assert.equal(INPUTS[engine](...row.call), row.input);
      if (row.refused) {
        assert.throws(() => calculations[engine](...engineArgs(engine, row.call)), { message: row.refused });
        assert.equal(row.output, `Refused: ${row.refused[0].toLowerCase()}${row.refused.slice(1, -1)}`);
        return;
      }
      assertShown(calculations[engine](...engineArgs(engine, row.call)), row, { ...LABELS, ...ENGINE_LABELS[engine] });
    });
  }
}

// The published fixtures of the div7a-loan-review rule in ryanduguid/australian-accounting at
// 3d48f51d40350bee627eb8194a4406b800e2f8d7, packages/div7a-loan-review/evaluation/div7a_myr/
// expected_results.json: the 3 hand-worked scenarios, ROUND_HALF_UP to cents.
for (const [id, balance, rate, term, required] of [
  ['myr_met_exact', '100000.00', '8.77', '5', 25556.00],
  ['myr_short_by_1000', '250000.00', '8.27', '7', 48462.41],
  ['rising_benchmark', '48500.00', '8.77', '3', 19081.67],
]) {
  test(`Division 7A repayment matches the div7a-loan-review fixture ${id}`, () => {
    assert.equal(div7aMinimumRepayment(balance, rate, term).repayment, required);
  });
}

// ATO, 'Loans by private companies', read 13 November 2026 ('Last updated 2 July 2026'):
// https://www.ato.gov.au/businesses-and-organisations/corporate-tax-measures-and-assurance/private-company-benefits-division-7a-dividends/in-detail/division-7a-loans
// 2015: '55,000 × 0.0595 = 3272.5' ... '3272.5 ÷ 0.332742732 = 9835 (when rounded to the closest dollar)'.
// 2016: '50,430 × 0.0545 = 2748.435' ... '2748.435 ÷ 0.27268843 = $10,079 (when rounded to the closest dollar)'.
test('Division 7A repayment agrees with the ATO worked examples', () => {
  for (const [balance, rate, term, step1, dollarsShown] of [['55000', '5.95', '7', 3272.5, 9835], ['50430', '5.45', '6', 2748.44, 10079]]) {
    const result = div7aMinimumRepayment(balance, rate, term);
    assert.equal(result.interest, step1);
    assert.equal(Math.round(result.repayment), dollarsShown);
    assert.equal(Math.round((result.interest + result.principal) * 100), Math.round(result.repayment * 100));
  }
});

test('Division 7A repayment takes a remaining term of 1 to 25 whole years and a positive rate', () => {
  assert.deepEqual(div7aMinimumRepayment('1000', '8.77', '25'), { repayment: 99.92, interest: 87.7, principal: 12.22 });
  for (const term of ['0', '26', '2.5']) {
    assert.throws(() => div7aMinimumRepayment('1000', '8.77', term), { message: 'Enter a whole number between 1 and 25.' });
  }
  assert.throws(() => div7aMinimumRepayment('1000', '0', '7'), { message: 'Enter an amount between 0.01 and 100.' });
});

// The year selector offers only the years the site's rate table holds, at its rates.
test('Division 7A years and rates are the rate table rows, newest first', () => {
  const table = readFileSync(new URL('../rates/div7a-benchmark-rate/div7a-benchmark-rates.csv', import.meta.url), 'utf8')
    .trim().split(/\r?\n/).slice(1).map((line) => line.split(',').slice(0, 2)).reverse();
  const html = readFileSync(new URL('../_includes/calculators/div7a.html', import.meta.url), 'utf8');
  const options = [...html.matchAll(/<option value="([^"]+)" data-rate="([^"]+)">([^<]+)<\/option>/g)]
    .map(([, year, rate, label]) => (assert.equal(label, `${year} (${rate}%)`), [year, rate]));
  assert.equal(options.length, (html.match(/<option\b/g) ?? []).length);
  assert.deepEqual(options, table);
});

// Each jurisdiction's radio carries exactly its rows of the rate table, in the table's order.
test('transfer duty radios carry the rate table rows for all 8 jurisdictions', () => {
  const html = readFileSync(new URL('../_includes/calculators/transfer-duty.html', import.meta.url), 'utf8');
  const radios = [...html.matchAll(/<input type="radio" name="jurisdiction" value="([^"]+)" data-name="([^"]+)" data-scale="([^"]+)"(?: checked)? \/> ([^<]+)<\/label>/g)]
    .map(([, code, name, scale, label]) => (assert.equal(label, name), assert.equal(PLACES[code], name),
      [code, scale.split(';').map((row) => row.split(','))]));
  assert.equal(radios.length, (html.match(/name="jurisdiction"/g) ?? []).length);
  assert.equal((html.match(/name="jurisdiction"[^>]* checked /g) ?? []).length, 1);
  assert.deepEqual(Object.fromEntries(radios), transferDutyScales);
  assert.deepEqual(radios.map(([code]) => code), Object.keys(PLACES));
});

// Worked by hand from the scales read on 15 November 2026: at the top of a band the lower band
// applies, so WA $725,000 is $11,115 + 3,650 x $4.75 and NSW $103,000 is $525 + 650 x $1.75.
test('transfer duty at the top of a band uses that band and rejects a broken table', () => {
  assert.equal(transferDuty('725000', transferDutyScales['AU-WA']).duty, 28452.5);
  assert.equal(transferDuty('725001', transferDutyScales['AU-WA']).duty, 28458.15);
  assert.equal(transferDuty('103000', transferDutyScales['AU-NSW']).duty, 1662.5);
  // NT: (0.06571441 x 525^2) + 15 x 525 = 25,987.53425625, then 4.95% of the whole value.
  assert.equal(transferDuty('525000', transferDutyScales['AU-NT']).duty, 25987.53);
  assert.equal(transferDuty('525001', transferDutyScales['AU-NT']).duty, 25987.55);
  // Victoria rounds nothing before the cent: 2.4% of $25,001 - $25,000 is 2.4 cents.
  assert.equal(transferDuty('25001', transferDutyScales['AU-VIC']).duty, 350.02);
  assert.throws(() => transferDuty('0', transferDutyScales['AU-NSW']), { message: 'Enter a whole number between 1 and 1000000000.' });
  const nsw = transferDutyScales['AU-NSW'];
  for (const broken of [[], nsw.slice(1), nsw.slice(0, -1), [...nsw.slice(0, 2), ...nsw.slice(3)],
    nsw.map((row, index) => (index ? row : [...row.slice(0, 4), 'per-cent']))]) {
    assert.throws(() => transferDuty('1000', broken), { message: 'This jurisdiction’s rate table is not usable.' });
  }
  // A band ending part way through a dollar, or at or below where it starts, is refused even
  // for a value in a band that is still well formed.
  for (const broken of [[['0', '1000.5', '0', '1', 'excess'], ['1000.5', '', '10', '2', 'excess']],
    [['0', '1000', '0', '1', 'excess'], ['1000', '1000', '10', '2', 'excess'], ['1000', '', '10', '3', 'excess']],
    [['0', '5000', '0', '1', 'excess'], ['5000', '3000', '50', '2', 'excess'], ['3000', '', '10', '3', 'excess']]]) {
    for (const value of ['500', '2000', '9000']) {
      assert.throws(() => transferDuty(value, broken), { message: 'This jurisdiction’s rate table is not usable.' },
        `${JSON.stringify(broken)} ${value}`);
    }
  }
});

// First home buyers, from the sources read on 16 November 2026. New South Wales: the NSW
// Government's 2026-27 reduced rate table ($850,000 to $990,000) and Revenue NSW's First Home
// Buyers Assistance calculator (the rest), which rounds the concession to the cent, so
// $38,991.065 gives $38,991.06, and keeps the $20 minimum. Queensland: the Queensland Revenue
// Office's examples. The other figures are worked by hand in the comments.
test('first home buyer duty matches the revenue offices’ figures either side of each threshold', () => {
  const duty = (value, place, home = 'established') => firstHomeDuty(value, transferDutyScales[place], place, home);
  for (const [value, expected] of [['800000', 0], ['850000', 9796.75], ['900000', 19593.5], ['950000', 29390.25],
    ['990000', 37227.65], ['999000', 38991.06], ['997000', 38599.19], ['800001', 20], ['850050', 9808.8],
    ['999999', 39186.85], ['1000000', 39187]]) {
    assert.equal(duty(value, 'AU-NSW').duty, expected, value);
    assert.equal(duty(value, 'AU-NSW', 'new').duty, expected, value);
  }
  // By hand: $709,999 is the home concession rate's $10,150 + 1,700 x $4.50 less $17,350, and
  // $710,000 the same $17,800 less $15,615; from $800,000 only the home concession rate applies.
  for (const [value, expected] of [['650000', 0], ['700000', 0], ['709999', 450], ['710000', 2185], ['730000', 6555],
    ['799999', 20115], ['800000', 21850], ['850000', 24100]]) {
    assert.equal(duty(value, 'AU-QLD').duty, expected, value);
  }
  // By hand: Victoria's general duty on $600,001 is $31,070.06, times $1 / $150,000, and on
  // $700,000 $37,070 times 100,000 / 150,000. Western Australia: $16.15 for each $100, or part.
  for (const [value, expected] of [['600000', 0], ['600001', 0.21], ['700000', 24713.33], ['750000', 40070], ['750001', 40070.06]]) {
    assert.equal(duty(value, 'AU-VIC').duty, expected, value);
  }
  for (const [value, expected] of [['600000', 0], ['600001', 16.15], ['700000', 16150], ['800000', 32300], ['800001', 32320.65]]) {
    assert.equal(duty(value, 'AU-WA').duty, expected, value);
  }
  for (const [place, home] of [['AU-QLD', 'new'], ['AU-SA', 'new'], ['AU-ACT', 'established'], ['AU-ACT', 'new']]) {
    assert.deepEqual(duty('3000000', place, home), { duty: 0, general: transferDuty('3000000', transferDutyScales[place]).duty,
      concession: true }, place);
  }
  for (const [place, home] of [['AU-SA', 'established'], ['AU-TAS', 'established'], ['AU-TAS', 'new'], ['AU-NT', 'new']]) {
    const general = transferDuty('500000', transferDutyScales[place]).duty;
    assert.deepEqual(duty('500000', place, home), { duty: general, general, concession: false }, place);
  }
  assert.throws(() => duty('500000', 'AU-NSW', 'vacant'), { message: 'Choose an established or a new home.' });
  assert.throws(() => firstHomeDuty('500000', transferDutyScales['AU-NSW'], 'NSW', 'new'), { message: 'Choose a state or territory.' });
  assert.throws(() => duty('500000.50', 'AU-NSW'), { message: 'Enter a whole number between 1 and 1000000000.' });
});

// The FBT car form passes the checked option's gross-up and the form's days and FBT rate; the
// FBT car test below binds those to this row of the table.
const fbtRow = readFileSync(new URL('../rates/fbt-rate/fbt-rates.csv', import.meta.url), 'utf8')
  .trim().split(/\r?\n/).map((line) => line.split(',')).find(([ending]) => ending === '2027-03-31');
const fbtDays = String((Date.parse(fbtRow[0]) - Date.parse(`${Number(fbtRow[0].slice(0, 4)) - 1}${fbtRow[0].slice(4)}`)) / 86400000);
const fbtYear = { 1: { days: fbtDays, grossUp: fbtRow[2], fbtRate: fbtRow[1] }, 2: { days: fbtDays, grossUp: fbtRow[3], fbtRate: fbtRow[1] } };
// ATO, 'Fringe benefits tax – a guide for employers', chapter 7 (current document 22 November 2024),
// read 15 November 2026: https://www.ato.gov.au/law/view/document?docid=SAV/FBTGEMP/00008
// Example 28: '$60,000 × 0.2 = $12,000', '2,184,000 ÷ 365 = $5,983', '$5,983 - $1,000 = $4,983'.
// Example 31: '$19,580 × 25% = $4,895', '$4, 895 - $2,000 = $2,895 (taxable value)'.
// Example 23: a $39,000 car 'may be reduced by $13,000', and $4,000 of later accessories join the base value.
const fbtInputs = (fields) => ({ method: 'statutory', cost: '0', accessories: '0', reduced: false, days: '365',
  costs: '0', businessUse: '0', contribution: '0', ...fields });
test('FBT car values agree with the ATO guide’s worked examples', () => {
  const example28 = calculations.fbtCar(fbtInputs({ cost: '60000', days: '182', contribution: '1000' }), fbtYear[1]);
  // The guide leaves out the cents of $5,983.56 at step 4.
  assert.equal(Math.trunc(example28.statutory + 1000), 5983);
  assert.equal(Math.trunc(example28.taxableValue), 4983);
  const example31 = fbtInputs({ method: 'operating', cost: '100000', costs: '19580', businessUse: '75', contribution: '2000' });
  assert.equal(calculations.fbtCar(example31, fbtYear[1]).taxableValue, 2895);
  const example23 = calculations.fbtCar(fbtInputs({ cost: '39000', accessories: '4000', reduced: true }), fbtYear[1]);
  assert.equal(example23.baseValue, 39000 - 13000 + 4000);
});

// Worked by hand: $4,983.56 × 2.0802 = $10,366.801512, so $10,366.80, and 47% of that is $4,872.396,
// so $4,872.40. An operating cost of 1 cent at 50% business use is exactly half a cent, so 1 cent.
test('FBT car values, gross-up and FBT round half up from the figure before them', () => {
  const opening = calculations.fbtCar(fbtInputs({ cost: '60000', days: '182', contribution: '1000' }), fbtYear[1]);
  assert.deepEqual([opening.grossedUp, opening.fbt], [10366.8, 4872.4]);
  const half = calculations.fbtCar(fbtInputs({ method: 'operating', cost: '1000', costs: '0.01', businessUse: '50' }), fbtYear[1]);
  assert.deepEqual([half.operating, half.taxableValue], [0.01, 0.01]);
  assert.equal(calculations.fbtCar(fbtInputs({ cost: '0.01', reduced: true }), fbtYear[1]).baseValue, 0.01);
});

test('FBT car refuses an unknown method, a missing answer and out-of-range figures', () => {
  assert.throws(() => calculations.fbtCar(fbtInputs({ method: 'logbook' }), fbtYear[1]), { message: 'Choose a valuation method.' });
  assert.throws(() => calculations.fbtCar(fbtInputs({ reduced: 'yes' }), fbtYear[1]), { message: 'Say whether the car was held for 4 years.' });
  assert.throws(() => calculations.fbtCar(fbtInputs({ method: 'operating', businessUse: '100.01' }), fbtYear[1]),
    { message: 'Enter an amount between 0 and 100.' });
  assert.throws(() => calculations.fbtCar(fbtInputs({ days: '1.5' }), fbtYear[1]), { message: 'Enter a whole number between 0 and 365.' });
  // Nil operating costs would give nil FBT under the operating cost method.
  assert.throws(() => calculations.fbtCar(fbtInputs({ method: 'operating', cost: '60000', businessUse: '20' }), fbtYear[1]),
    { message: 'Enter the car’s operating costs for the year to use the operating cost method.' });
  assert.equal(calculations.fbtCar(fbtInputs({ days: '366' }), { ...fbtYear[1], days: '366' }).statutory, 0);
});

// The form's gross-up options, days and FBT rate are the rate table's row for the year ending 31 March 2027.
test('FBT car rates are the rate table row for the FBT year ending 31 March 2027', () => {
  const html = readFileSync(new URL('../_includes/calculators/fbt-car.html', import.meta.url), 'utf8');
  const options = [...html.matchAll(/<input type="radio" name="type" value="(\d)" data-gross-up="([^"]+)"/g)];
  assert.deepEqual(options.map(([, type, rate]) => [type, rate]), [['1', fbtYear[1].grossUp], ['2', fbtYear[2].grossUp]]);
  assert.ok(html.includes(`data-year-days="${fbtDays}" data-fbt-rate="${fbtRow[1]}"`));
  assert.equal(fbtDays, '365');
});

// ATO, 'Fringe benefits tax return 2026' (NAT 1067), item 14, read 15 November 2026: 'Calculated
// fringe benefits taxable amounts (whole dollars only)', and the benefits table 'WHOLE DOLLARS ONLY'.
// The calculator keeps cents, so the page must say a return can differ.
test('FBT car page says the FBT return takes whole dollars', () => {
  const html = readFileSync(new URL('../_includes/calculators/fbt-car.html', import.meta.url), 'utf8');
  assert.match(html, /FBT return for the year ending 31 March 2026, read 15 November 2026, asks for whole dollars/);
});

// ATO, chapter 7 of the guide for employers, read 15 November 2026: 'This guide is being reviewed as a
// result of a recent court decision', naming SEPL Pty Ltd as trustee of the SFT Trust v Commissioner
// of Taxation [2026] FCAFC 36, judgment date 27 March 2026 in the decision impact statement.
test('FBT car page dates the review of the ATO guide chapter it applies', () => {
  const html = readFileSync(new URL('../_includes/calculators/fbt-car.html', import.meta.url), 'utf8');
  assert.match(html, /On 15 November 2026 chapter 7 of the ATO’s guide said it was being reviewed after the Full Federal Court’s decision of 27 March 2026 in SEPL Pty Ltd as trustee of the SFT Trust v Commissioner of Taxation \[2026\] FCAFC 36/);
});

// The values each form opens with, read from its include: an input's value or
// checked state, the checked radio's value, and a select's selected option (else its first).
const formDefaults = (html) => {
  const fields = {};
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    // A radio group opens on its checked button.
    if (name && /\btype="radio"/.test(tag) && !/\bchecked\b/.test(tag)) continue;
    if (name) fields[name] = /\btype="checkbox"/.test(tag) ? /\bchecked\b/.test(tag) : tag.match(/\bvalue="([^"]*)"/)?.[1];
  }
  for (const [, name, body] of html.matchAll(/<select\b[^>]*\bname="([^"]+)"[^>]*>(.*?)<\/select>/gs)) {
    const options = [...body.matchAll(/<option\b([^>]*)>/g)].map(([, attributes]) => attributes);
    fields[name] = (options.find((attributes) => /\bselected\b/.test(attributes)) ?? options[0]).match(/\bvalue="([^"]*)"/)[1];
  }
  return fields;
};
// The Division 7A form passes the chosen year's rate from its option; the test above binds the
// options to this table.
const div7aRates = Object.fromEntries(
  readFileSync(new URL('../rates/div7a-benchmark-rate/div7a-benchmark-rates.csv', import.meta.url), 'utf8')
    .trim().split(/\r?\n/).slice(1).map((line) => line.split(',').slice(0, 2)));
// How assets/accounting-pages.mjs passes each form's fields to its calculation.
const FORM_CALLS = {
  gst: (f) => [f.amount, f.inclusive],
  businessUse: (f) => [f.cost, f.percent],
  margin: (f) => [f.sales, f.cost],
  breakEven: (f) => [f.fixed, f.price, f.variable],
  hourlyRate: (f) => [f.cost, f.profit, f.hours],
  fixedFee: (f) => [f.hours, f.rate, f.margin, f.round, f.gst, f.instalments],
  variance: (f) => [f.actual, f.budget, f.kind],
  loan: (f) => [f.principal, f.rate, f.months, f.balloon, f.timing],
  div7aMinimumRepayment: (f) => [f.balance, div7aRates[f.year], f.term],
  // The radio's scale is bound to the rate table by its own test, so the call names the jurisdiction.
  transferDuty: (f) => [f.value, f.jurisdiction],
  fbtCar: (f) => [{ method: f.method, cost: f.cost, accessories: f.accessories, reduced: f.reduced === 'yes', days: f.days,
    costs: f.costs, businessUse: f['business-use'], contribution: f.contribution }, fbtYear[f.type]],
  pcgRisk: (f) => [{ gateway1: f.gateway1 === 'yes', gateway2: f.gateway2 === 'yes', entitlement: f.entitlement,
    returned: f.returned, tax: f.tax, factor3: f.factor3 === 'yes', remuneration: f.remuneration, benchmark: f.benchmark }],
  gicPaymentPlan: (f) => [{ debt: f.debt, start: f.start, count: f.count, frequency: f.frequency, assumedRate: f.assumedRate }],
  vehicleClass: (f) => [{ body: f.body, seats: f.seats, gvm: f.gvm, kerb: f.kerb, payload: f.payload, accessories: f.accessories,
    modified: f.modified,
    cost: f.cost, credit: f.credit, fuel: f.fuel, use: f.use }, vehicleYears[f.year]],
  staffCost: (f) => [f.wages, f.super, f.other],
  cashForecast: (f) => [f.opening,
    Array.from({ length: 13 }, (_, i) => ({ receipts: f[`receipts-${i + 1}`], payments: f[`payments-${i + 1}`] })),
    f.buffer, { week: Number(f.week), amount: f.amount, delay: Number(f.delay) }],
  objectionDeadline: (f) => [f.decision, f.group, f.notice, f.first],
  paygInstalment: (f) => [{ method: f.method, notified: f.notified, instalment: f.instalment, estimatedTax: f['estimated-tax'],
    earlier: f.earlier, credits: f.credits, income: f.income, rate: f.rate, estimatedIncome: f['estimated-income'],
    earlierIncome: f['earlier-income'] }],
};
// The radio's scales are read by the tests below, so the call names the jurisdiction; the choices
// a row leaves at the form's opening values are left out.
Object.assign(FORM_CALLS, { landTaxYear: (f) => {
  const choices = Object.entries({ trust: f.owner === 'trust', foreign: f.foreign === 'yes',
    surchargeValue: f['surcharge-value'], metro: f.metro }).filter(([, chosen]) => chosen);
  return choices.length ? [f.value, f.jurisdiction, Object.fromEntries(choices)] : [f.value, f.jurisdiction];
} });

// The year each FBT benefit form passes, from its include's data attributes; a test below binds
// them to the ATO's rates page.
const fbtBenefitYear = (page) => Object.fromEntries([...readFileSync(new URL(`../_includes/calculators/${page}.html`,
  import.meta.url), 'utf8').match(/<form [^>]*>/)[0].matchAll(/data-([a-z-]+)="([^"]*)"/g)]
  .map(([, key, value]) => [key.replace(/-(\w)/g, (_, c) => c.toUpperCase()), value]));
Object.assign(FORM_CALLS, {
  fbtCarParking: (f) => {
    const { threshold, yearDays, yearEnded } = fbtBenefitYear('fbt-car-parking');
    return [{ method: f.method, fee: f.fee, benefits: f.benefits, each: f.each, firstFee: f['first-fee'], lastFee: f['last-fee'],
      registerValue: f['register-value'], days: f.days, firstYear: f['first-year'], rate: f.rate, spaceDays: f['space-days'],
      spaces: f.spaces, employeesStart: f['employees-start'], employeesEnd: f['employees-end'], spacesStart: f['spaces-start'],
      spacesEnd: f['spaces-end'], contribution: f.contribution }, { threshold, days: yearDays, ended: yearEnded }];
  },
  fbtLoan: (f) => {
    const { yearDays, statutoryRate } = fbtBenefitYear('fbt-loan');
    return [{ balances: f.balances, accrued: f.accrued, incomeUse: f['income-use'], deduction: f.deduction },
      { days: yearDays, rate: statutoryRate }];
  },
  fbtMealEntertainment: (f) => {
    const { yearEnded } = fbtBenefitYear('fbt-meal-entertainment');
    const earlier = [];
    for (let year = Number(f['first-year']); year < Number(yearEnded); year += 1) earlier.push(f[`earlier-${year}`]);
    return [{ method: f.method, expenses: f.expenses, registerBenefits: f['register-benefits'], registerTotal: f['register-total'],
      firstYear: f['first-year'], earlier }, { ended: yearEnded }];
  },
});

for (const [page, { function: name, rows: [first] }] of Object.entries(shownCases)) {
  test(`${page} opens on its first boundary case as the fictional example`, () => {
    const html = readFileSync(new URL(`../_includes/calculators/${page}.html`, import.meta.url), 'utf8');
    assert.equal(first.refused, undefined);
    assert.deepEqual(FORM_CALLS[name](formDefaults(html)), first.call);
    assert.equal(html.match(/\{% include calculator-example\.html /g)?.length, 1);
  });
}

test('blank, non-finite, over-precise and unsafe amounts cannot become a zero result', () => {
  for (const value of ['', ' ', 'NaN', 'Infinity', '1e10', '100.001', '-1', '1000000001', null]) {
    assert.throws(() => gst(value, false), String(value));
  }
});

// Taxation Administration Act 1953 s 14ZW (Compilation No. 227, 1 October 2026) and Acts
// Interpretation Act 1901 s 36 (Compilation No. 39, 28 March 2026), both read 15 November 2026:
// https://www.legislation.gov.au/C1953A00001/latest/text and https://www.legislation.gov.au/C1901A00002/latest/text
// s 36(2) example: 'If a person has until 31 March to make an application and 31 March is a
// Saturday, the application may be made on Monday 2 April.' 31 March 2029 is a Saturday.
test('objection deadline moves a weekend last day as the Acts Interpretation Act example does', () => {
  const act = calculations.objectionDeadline('other', '2', '2029-01-30', '2029-01-30');
  assert.deepEqual([act.periodEnds, act.lastDay], ['2029-03-31', '2029-04-02']);
  // Worked by hand: notice on Wednesday 18 November 2026; the 2 years start on 19 November 2026
  // and end on Saturday 18 November 2028, so subsection 36(2) allows Monday 20 November 2028.
  assert.equal(calculations.objectionDeadline('assessment', '2', '2026-11-18', '2026-11-18').lastDay, '2028-11-20');
});

test('objection periods are 2 or 4 years, 60 days, or the later of an amendment’s 2 dates', () => {
  const on = (decision, group, notice, first = notice) => calculations.objectionDeadline(decision, group, notice, first).periodEnds;
  assert.equal(on('assessment', '2', '2027-06-15'), '2029-06-15');
  assert.equal(on('assessment', '4', '2027-06-15'), '2031-06-15');
  assert.equal(on('fbt', '2', '2027-06-15'), '2031-06-15');
  assert.equal(on('other', '4', '2027-06-15'), '2027-08-14');
  // 60 days after 31 December 2027 run through a 29-day February to 29 February 2028.
  assert.equal(on('other', '2', '2027-12-31'), '2028-02-29');
  // The later date wins either way round; a first notice on the amended notice's day is allowed.
  assert.equal(on('amended', '4', '2027-06-15', '2024-01-10'), '2028-01-10');
  assert.equal(on('amended', '2', '2027-06-15', '2024-01-10'), '2027-08-14');
  assert.equal(on('amended-fbt', '2', '2027-06-15', '2027-06-15'), '2031-06-15');
  assert.equal(on('amended-fbt', '2', '2027-06-15', '2024-01-10'), '2028-01-10');
  assert.equal(on('amended-fbt', '2', '2027-06-15', '2023-01-10'), '2027-08-14');
  assert.equal(calculations.objectionDeadline('amended-fbt', '2', '2027-06-15', '2027-06-15').rule, 'subsection 14ZW(1B)');
});

test('objection deadline refuses an unknown decision or item and an impossible date', () => {
  assert.throws(() => calculations.objectionDeadline('ruling', '2', '2026-11-18', '2026-11-18'),
    { message: 'Choose the decision objected to.' });
  assert.throws(() => calculations.objectionDeadline('assessment', '3', '2026-11-18', '2026-11-18'),
    { message: 'Choose whether item 1, 2, 3 or 3A applies.' });
  for (const notice of ['2026-02-29', '2026-13-01', '18/11/2026', '', '1899-12-31', '9990-01-01']) {
    assert.throws(() => calculations.objectionDeadline('other', '2', notice, notice),
      { message: 'Enter a date from 1 January 1900 to 31 December 9989.' }, notice);
  }
  assert.equal(calculations.objectionDeadline('other', '2', '9989-12-31', '').periodEnds, '9990-03-01');
});

// The ATO's worked examples, read 15 November 2026:
// https://www.ato.gov.au/forms-and-instructions/payg-instalments-how-to-complete-your-activity-statement
//   (last updated 9 January 2023): Sophia, '$20,100 × 1.7% = $341.70', 'She enters 341 at both T11 and 5A';
//   Bill, rate 10% then varied to 5%, $10,000 a quarter: '($10,000 x 5%) = instalment payment of $500', 5B $500.
// https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/payg-instalments/calculate-your-payg-instalments
//   (last updated 9 March 2022): Julie Co, '$106,000 × 11% = $11,660'.
// https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/payg-instalments/how-to-vary-your-payg-instalments
//   (last updated 23 June 2026): example 1, Cari, '$14,000 × 75% = $10,500', '$10,500 − ($5,000 + $5,000) = $500',
//   '$14,000 − ($5,000 + $5,000 + $500) = $3,500'; example 2, Harmander, '($10,125 ÷ $82,480) × 100 = 12.27%'.
const instalment = (fields) => calculations.paygInstalment({ method: 'rate', notified: '0', instalment: '1', estimatedTax: '0',
  earlier: '0', credits: '0', income: '0', rate: '0', estimatedIncome: '0', earlierIncome: '0', ...fields });
test('PAYG instalments agree with the ATO’s worked examples', () => {
  const sophia = instalment({ income: '20100', rate: '1.7' });
  assert.deepEqual([sophia.amount, sophia.instalment], [341.7, 341]);
  assert.equal(instalment({ income: '106000', rate: '11' }).instalment, 11660);
  assert.equal(instalment({ method: 'varied-amount', instalment: '3', estimatedTax: '14000', earlier: '10000' }).instalment, 500);
  assert.equal(instalment({ method: 'varied-amount', instalment: '4', estimatedTax: '14000', earlier: '10500' }).instalment, 3500);
  assert.equal(instalment({ method: 'varied-rate', estimatedTax: '10125', estimatedIncome: '82480', rate: '16.84' }).instalmentRate, 12.27);
  const bill = instalment({ method: 'varied-rate', estimatedTax: '500', estimatedIncome: '10000', income: '10000', rate: '10',
    earlier: '1000', earlierIncome: '10000' });
  assert.deepEqual([bill.instalmentRate, bill.instalment, bill.credit], [5, 500, 500]);
});

test('PAYG instalments read only the fields of the chosen method', () => {
  const unused = { notified: 'x', instalment: 'x', estimatedTax: 'x', earlier: 'x', credits: 'x', estimatedIncome: 'x', earlierIncome: 'x' };
  assert.equal(instalment({ ...unused, income: '1000', rate: '10' }).instalment, 100);
  assert.equal(instalment({ ...unused, method: 'amount', notified: '99.99' }).instalment, 99);
  // A higher varied rate reads no earlier figures, as no credit can arise.
  assert.equal(instalment({ ...unused, method: 'varied-rate', estimatedTax: '30', estimatedIncome: '100', income: '1000',
    rate: '10' }).instalment, 300);
});

test('PAYG instalments refuse what the activity statement cannot hold', () => {
  assert.throws(() => instalment({ method: 'annual' }), { message: 'Choose how this instalment is worked out.' });
  assert.throws(() => instalment({ method: 'varied-amount', instalment: '1', earlier: '1' }),
    { message: 'The first instalment of the year has no earlier instalments.' });
  assert.throws(() => instalment({ method: 'varied-amount', instalment: '5' }), { message: 'Enter a whole number between 1 and 4.' });
  assert.throws(() => instalment({ method: 'varied-amount', instalment: '2', earlier: '100', credits: '101' }),
    { message: 'Credits claimed cannot exceed the earlier instalments.' });
  assert.throws(() => instalment({ method: 'varied-rate', estimatedTax: '101', estimatedIncome: '100', rate: '10' }),
    { message: 'Estimated tax cannot exceed estimated instalment income.' });
  assert.throws(() => instalment({ income: '100', rate: '100.01' }), { message: 'Enter an amount between 0 and 100.' });
  assert.throws(() => instalment({ income: '100', rate: '1.005' }), { message: 'Enter a number with no more than 2 decimal places.' });
  // Nil estimated income varies the rate to nil, as the ATO allows.
  assert.equal(instalment({ method: 'varied-rate', income: '100', rate: '10' }).instalmentRate, 0);
});

// The PSI rules checker. Part 2-42 of the Income Tax Assessment Act 1997, Compilation No. 268
// (1 October 2026), and Taxation Ruling TR 2022/3, both read 17 November 2026:
// https://www.legislation.gov.au/C2004A05138/latest/text
// https://www.ato.gov.au/law/view/document?docid=TXR/TR20223/NAT/ATO/00001
// The ATO's pages under https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/personal-services-income
// read the same day: 'Self-assessing as a PSB', 'Results test', 'Unrelated clients test', 'Employment test' and
// 'Business premises test' (each last updated 23 November 2022), and 'PSI – obtaining work through an agency'
// (last updated 23 November 2022).
const PSI_FLAGS = ['associate', 'offer', 'result', 'tools', 'defects'];
const PSI_PREMISES = ['times', 'mainly', 'exclusive', 'private', 'clients'];
const psiPayer = (amount, ...flags) => ({ amount, ...Object.fromEntries(PSI_FLAGS.map((flag) => [flag, flags.includes(flag)])) });
const psiPremises = (...on) => Object.fromEntries(PSI_PREMISES.map((key) => [key, on.includes(key)]));
const ALL_PREMISES = psiPremises(...PSI_PREMISES);
const RESULT_TEST = ['result', 'tools', 'defects'];
const psiAnswers = (fields = {}) => ({ earner: 'sole-trader', mainly: true, determination: false, agent: false,
  commission: '0', principal: '0', others: '0', apprentice: false, premises: psiPremises(), ...fields,
  payers: [...(fields.payers ?? []), ...Array(5 - (fields.payers ?? []).length).fill(psiPayer('0'))] });
const psi = (fields) => calculations.psiDetermination(psiAnswers(fields));
const psiStep = (result, start) => result.steps.find(([label]) => label.startsWith(start))?.[1];

Object.assign(INPUTS, {
  psiDetermination: (a) => [
    { 'sole-trader': 'Sole trader', entity: 'Entity', employee: 'Employee' }[a.earner],
    ...(a.mainly ? [] : ['not mainly personal efforts or skills']),
    ...(a.determination ? ['determination in force'] : []),
    `payers ${a.payers.filter((p) => p.amount !== '0').map((p) => {
      const on = PSI_FLAGS.filter((flag) => p[flag]);
      return `${dollars(Number(p.amount))}${on.length ? ` (${on.join(', ')})` : ''}`;
    }).join(', ') || 'none'}`,
    ...(a.others === '0' ? [] : [`others’ principal work ${dollars(Number(a.others))}`]),
    ...(a.apprentice ? ['an apprentice'] : []),
    ...(PSI_PREMISES.some((key) => a.premises[key])
      ? [`premises: ${PSI_PREMISES.filter((key) => a.premises[key]).join(', ')}`] : []),
    ...(a.agent ? [`agent, ${dollars(Number(a.commission))} commission of ${dollars(Number(a.principal))}`] : []),
  ].join('; '),
});
Object.assign(FORM_CALLS, {
  psiDetermination: (f) => [{ earner: f.earner, mainly: f.mainly === 'yes', determination: f.determination === 'yes',
    payers: Array.from({ length: 5 }, (_, i) => ({ amount: f[`amount-${i + 1}`],
      ...Object.fromEntries(PSI_FLAGS.map((flag) => [flag, f[`${flag}-${i + 1}`]])) })),
    agent: f.agent === 'yes', commission: f.commission, principal: f.principal, others: f.others,
    apprentice: f.apprentice === 'yes', premises: Object.fromEntries(PSI_PREMISES.map((key) => [key, f[`premises-${key}`]])) }],
});
Object.assign(ENGINE_LABELS, {
  psiDetermination: { results: (v) => `results test ${v.toFixed(2)}%`, source: (v) => `largest payer ${v.toFixed(2)}%`,
    unrelated: (v) => `${v} unrelated by public offer`, employment: (v) => `others’ work ${v.toFixed(2)}%` },
});

const PSB = 'a personal services business, so Divisions 85 and 86 do not apply';
const ONE_SOURCE = 'not a personal services business unless a determination is in force, so Division 85 applies';
const NOT_PSB = 'not a personal services business, so Division 85 applies';

// Section 87-18; TR 2022/3 paragraph 77 and examples 17 to 21 (paragraphs 195 to 209); ATO 'Results test'.
// Each example states which of the 3 conditions hold; the amounts are this test's, as the examples give none
// that matter. Examples 17 and 19 (and the ATO's Louise and Joseph) are for one payer; the PSI rules
// then apply without a determination (subsection 87-15(3)).
test('PSI results test reproduces TR 2022/3 examples 17 to 21 and the ATO’s results test examples', () => {
  // Example 17 (Consultant Co, hourly, department's equipment, no rectification) and the ATO's Louise.
  const consultant = psi({ earner: 'entity', payers: [psiPayer('120000')] });
  assert.equal(psiStep(consultant, 'Subsection 87-18(3)'), '0.00%, under 75%: not met');
  assert.deepEqual([consultant.rule, consultant.effect], ['subsection 87-15(3)',
    'not a personal services business unless a determination is in force, so Division 86 applies']);
  // Example 18: fixed price for a product to specification, own equipment, must rectify.
  const product = psi({ earner: 'entity', payers: [psiPayer('150000', ...RESULT_TEST)] });
  assert.deepEqual([product.rule, product.effect, product.psb], ['subsection 87-18(3)', PSB, true]);
  // Example 19: Mick Smith Pty Ltd, $75 an hour capped at $210,000, none of the conditions.
  const mick = psi({ earner: 'entity', payers: [psiPayer('210000')] });
  assert.deepEqual([mick.rule, mick.results, mick.source], ['subsection 87-15(3)', 0, 100]);
  // Examples 20 (Joe, ducts) and 21 (John, a board report): all 3 conditions, sole traders.
  for (const amount of ['18000', '25000']) {
    assert.deepEqual([psi({ payers: [psiPayer(amount, ...RESULT_TEST)] }).rule], ['subsection 87-18(1)']);
  }
  // ATO: Dave invoices for fixing his mistakes, so DaveCo fails the third condition.
  assert.equal(psi({ earner: 'entity', payers: [psiPayer('90000', 'result', 'tools')] }).results, 0);
  // ATO: Joseph is paid by the hour, so JoCo fails the first condition.
  assert.equal(psi({ earner: 'entity', payers: [psiPayer('90000', 'tools', 'defects')] }).results, 0);
});

// Section 87-20; TR 2022/3 paragraphs 97 to 108 and examples 22 to 26 (paragraphs 210 to 223).
test('PSI unrelated clients test reproduces TR 2022/3 examples 22 to 26', () => {
  // Example 22: Kevin, his brother's company (an associate) and 2 companies from his website; none
  // pays more than 80%. Equal thirds are this test's figures.
  const kevin = psi({ payers: [psiPayer('30000', 'associate'), psiPayer('30000', 'offer'), psiPayer('30000', 'offer')] });
  assert.deepEqual([kevin.rule, kevin.effect, kevin.unrelated, kevin.source], ['section 87-20', PSB, 2, 33.33]);
  // Example 23: Debart's word-of-mouth clients do not count; with one advertised client it has 1.
  assert.equal(psi({ earner: 'entity', payers: [psiPayer('40000', 'offer'), psiPayer('40000')] }).unrelated, 1);
  // Example 24: Ian, 70% from Rock Pty Ltd won by advertising, 30% through a labour hire firm.
  const ian = psi({ payers: [psiPayer('70', 'offer'), psiPayer('30')] });
  assert.deepEqual([ian.source, ian.unrelated, ian.rule, ian.effect], [70, 1, 'subsection 87-15(1)', NOT_PSB]);
  // Example 25: Sonya, one advertised contract and Big Bank, won by her advertising but paid through
  // Management Specialists, which is the payer for the 80% rule. Halves are this test's figures.
  assert.equal(psi({ payers: [psiPayer('50000', 'offer'), psiPayer('50000', 'offer')] }).rule, 'section 87-20');
  // Example 26: Mike, 2 unrelated companies by word of mouth in a niche industry: your answer is an offer.
  assert.equal(psi({ payers: [psiPayer('60000', 'offer'), psiPayer('60000', 'offer')] }).unrelated, 2);
});

// Section 87-25; TR 2022/3 paragraphs 109 to 128 and examples 27, 29, 30 and 31 (paragraphs 224 to 245).
// Example 28 gives no figures and conditions its conclusion on the 20% threshold, so it is not a case here.
test('PSI employment test reproduces TR 2022/3 examples 27, 29, 30 and 31', () => {
  // Example 27: Nan's contract administration is not principal work, so nothing counts.
  assert.equal(psiStep(psi({ payers: [psiPayer('180000')] }), 'Section 87-25'),
    '0.00%, under 20%, no apprentice for half the year: not met');
  // Example 29: Jack, $120,000 for his own work and $36,000 charged for Tom's: '23%'. Big Mining Co is
  // his only client, so the 80% rule still needs a determination.
  const jack = psi({ payers: [psiPayer('156000')], others: '36000' });
  assert.equal(jack.employment, 23.07);
  assert.match(psiStep(jack, 'Section 87-25'), /: met$/);
  assert.deepEqual([jack.rule, jack.effect], ['subsection 87-15(3)', ONE_SOURCE]);
  // Example 30: Jodie, $100,000 and $40,000 billed, Ian's work $22,000 and $4,000: '19%', not met,
  // though 22% on the larger contract.
  const jodie = psi({ payers: [psiPayer('100000'), psiPayer('40000')], others: '26000' });
  assert.deepEqual([jodie.employment, jodie.source, jodie.rule], [18.57, 71.42, 'subsection 87-15(1)']);
  // Example 31: Joe has apprentices for 7 months of the year.
  const joe = psi({ payers: [psiPayer('60000'), psiPayer('40000')], apprentice: true });
  assert.match(psiStep(joe, 'Section 87-25'), /0\.00%, under 20%, an apprentice for at least half the year: met$/);
  assert.deepEqual([joe.rule, joe.effect], ['section 87-25', PSB]);
});

// Section 87-30; TR 2022/3 paragraphs 129 to 148, examples 32 to 37 (paragraphs 246 to 256) and 39
// (paragraphs 261 to 265); ATO 'Business premises test', John from 1 February.
test('PSI business premises test reproduces TR 2022/3 examples 32 to 37 and 39', () => {
  const premises = (...on) => psi({ payers: [psiPayer('60000'), psiPayer('40000')], premises: psiPremises(...on) });
  const without = (missing) => premises(...PSI_PREMISES.filter((key) => key !== missing));
  // Examples 33, 35 and 37 (Col, Norm, Robbo Enterprises) and the ATO's John, who held an office for all
  // 5 months he traded (paragraph 135).
  assert.deepEqual([premises(...PSI_PREMISES).rule, premises(...PSI_PREMISES).effect], ['section 87-30', PSB]);
  // Example 32: Byte uses the premises 90% for retail. Example 34: Dale has no exclusive use.
  // Example 36: Melanie's office is above the family's entertainment room. Example 39: Penny and Jill
  // lacked exclusive, separate premises for 4 months.
  for (const missing of ['mainly', 'exclusive', 'private', 'times', 'clients']) {
    assert.equal(psiStep(without(missing), 'Section 87-30'), 'No: not met', missing);
    assert.equal(without(missing).rule, 'subsection 87-15(1)', missing);
  }
});

// Subsection 87-15(3) and section 87-35. The Act's examples to subsections 87-35(1) and (2): 60% from a
// State department and 40% from a State-owned corporation; 70% from Treasury and 30% from the ATO.
// The ATO's Binglei: $70,000 from ABC Pty Ltd and $30,000 from its subsidiary, one payer. The ATO's agency
// examples: Erica, 100% from one agency; Alan and Simon, 50% from each of 2 agencies.
test('PSI 80% rule reproduces the Act’s section 87-35 examples and the ATO’s', () => {
  const state = psi({ payers: [psiPayer('60000', 'offer'), psiPayer('40000', 'offer')] });
  assert.deepEqual([state.source, psiStep(state, 'Subsection 87-15(3)')], [60, '60.00%, under 80%']);
  assert.equal(psi({ payers: [psiPayer('70000'), psiPayer('30000')] }).source, 70);
  const binglei = psi({ payers: [psiPayer('100000')] });
  assert.deepEqual([binglei.source, binglei.rule], [100, 'subsection 87-15(3)']);
  const erica = psi({ earner: 'entity', payers: [psiPayer('150000')] });
  assert.deepEqual([erica.source, erica.results, erica.rule], [100, 0, 'subsection 87-15(3)']);
  const alan = psi({ earner: 'entity', payers: [psiPayer('50000'), psiPayer('50000')] });
  assert.deepEqual([alan.source, alan.unrelated, alan.rule], [50, 0, 'subsection 87-15(1)']);
  // The results test applies 'regardless of how much of your personal services income is paid from one
  // source' (section 87-1): one payer and all 3 conditions met.
  assert.equal(psi({ payers: [psiPayer('100000', ...RESULT_TEST)] }).rule, 'subsection 87-18(1)');
});

// Section 87-40 and TR 2022/3 example 40 (paragraph 266), also on the ATO's 'Self-assessing as a PSB'
// page: Chris, $70,000 commission and a $30,000 retainer, 70%, cannot use the agent rules.
test('PSI agent rule reproduces TR 2022/3 example 40 and refuses an agent it may apply to', () => {
  const chris = psi({ agent: true, commission: '70000', principal: '100000', payers: [psiPayer('100000')] });
  assert.equal(psiStep(chris, 'Paragraph 87-40(2)(c)'), '70.00%, under 75%: the agent rules do not apply');
  assert.equal(chris.rule, 'subsection 87-15(3)');
  assert.throws(() => psi({ agent: true, commission: '75000', principal: '100000', payers: [psiPayer('100000')] }),
    /section 87-40 may treat the principal’s customers as the sources/);
  // The results test comes first and does not depend on the agent rules.
  assert.equal(psi({ agent: true, commission: '75000', principal: '100000',
    payers: [psiPayer('100000', ...RESULT_TEST)] }).rule, 'subsection 87-18(1)');
  for (const [commission, principal] of [['1', '0'], ['100.01', '100']]) {
    assert.throws(() => psi({ agent: true, commission, principal, payers: [psiPayer('100')] }),
      { message: 'Enter the principal’s payments and the part of them that is commission or performance fees.' });
  }
});

// Section 84-5, subsection 85-35(1), subsection 87-15(1) and TR 2022/3 example 41 (paragraphs 267 to 269):
// The JB Trust meets the results test for Jason, though Part IVA may still apply, which the page notes.
test('PSI steps stop at the first decisive section and name each section', () => {
  // Section 84-5 example 2 (Trux) and TR 2022/3 examples 4 to 6: mainly from an asset, goods or a business structure.
  const trux = psi({ mainly: false, payers: [psiPayer('100')] });
  assert.deepEqual([trux.rule, trux.effect, trux.psb], ['subsection 84-5(1)',
    'not personal services income, so Part 2-42 does not apply', null]);
  assert.equal(psi({ earner: 'employee', payers: [psiPayer('100')] }).rule, 'subsection 85-35(1)');
  assert.equal(psi({ determination: true, payers: [psiPayer('100')] }).rule, 'paragraph 87-15(1)(a)');
  const jason = psi({ earner: 'entity', payers: [psiPayer('120000', ...RESULT_TEST)] });
  assert.deepEqual([jason.rule, jason.effect, jason.steps.length], ['subsection 87-18(3)', PSB, 3]);
  const all = psi({ payers: [psiPayer('50', 'offer'), psiPayer('50', 'offer')], others: '20', premises: ALL_PREMISES });
  assert.equal(all.rule, 'sections 87-20, 87-25 and 87-30');
  assert.equal(all.steps.length, 7);
  for (const [label] of all.steps) assert.match(label, /^(Section|Subsection|Paragraph) 8[4-7]-\d+/);
});

test('PSI shares compare exact cents and show 2 places rounded down', () => {
  // 2 in 3 is 66.666...%, shown 66.66%; a share of 79.999...% is under 80%.
  assert.equal(psi({ payers: [psiPayer('2'), psiPayer('1')] }).source, 66.66);
  const near = psi({ payers: [psiPayer('7999999.99', 'offer'), psiPayer('2000000.01', 'offer')] });
  assert.deepEqual([near.source, near.rule], [79.99, 'section 87-20']);
  assert.equal(psi({ payers: [psiPayer('8000000', 'offer'), psiPayer('2000000', 'offer')] }).rule, 'subsection 87-15(3)');
  // 74.999...% fails the results test, 19.999...% fails the employment test.
  assert.equal(psi({ payers: [psiPayer('7499999.99', ...RESULT_TEST), psiPayer('2500000.01')] }).rule, 'subsection 87-15(1)');
  assert.equal(psi({ payers: [psiPayer('60'), psiPayer('40')], others: '19.99' }).employment, 19.99);
});

test('PSI refuses what it cannot work through', () => {
  assert.throws(() => calculations.psiDetermination({ ...psiAnswers(), earner: 'trust' }), { message: 'Choose who receives the income.' });
  assert.throws(() => calculations.psiDetermination({ ...psiAnswers(), payers: Array(6).fill(psiPayer('1')) }),
    { message: 'Enter up to 5 payers.' });
  assert.throws(() => psi({ payers: [psiPayer('1000000000'), psiPayer('0.01')] }),
    { message: 'The PSI from all payers together cannot exceed $1,000,000,000.' });
  assert.throws(() => psi({ payers: [psiPayer('-1')] }), { message: 'Enter an amount between 0 and 1000000000.' });
  assert.throws(() => psi({ payers: [psiPayer('100')], others: '100.01' }),
    { message: 'The market value of principal work by others cannot exceed the PSI entered.' });
});

test('PSI page states its consequences, sources and the expense allocation it leaves out', () => {
  const html = readFileSync(new URL('../_includes/calculators/psi-determination.html', import.meta.url), 'utf8');
  const fields = formDefaults(html);
  const view = calculations.psiDeterminationResult((name) => fields[name], (name) => fields[name],
    (value) => `$${value.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`);
  const example = html.match(/\{% include calculator-example\.html inputs="([^"]+)" rows="([^"]+)" principal="(\d+)" note="([^"]+)" %\}/);
  assert.deepEqual([view.inputs, view.rows.map((row) => row.join('|')).join(';'), String(view.principal), view.note],
    example.slice(1));
  assert.match(view.note, /^The PSI is still reported in the tax return, and Part IVA can still apply/);
  // Without liability for defects the results test fails, so the Division 85 or 86 consequences show.
  const noDefects = (name) => name !== 'defects-1' && fields[name];
  const soleTrader = calculations.psiDeterminationResult((name) => fields[name], noDefects, String);
  assert.match(soleTrader.note, /^Division 85 stops a deduction an employee could not claim \(section 85-10\)/);
  const entity = calculations.psiDeterminationResult((name) => ({ ...fields, earner: 'entity' })[name], noDefects, String);
  assert.match(entity.note, /^Section 86-15 puts the entity’s PSI, less the deductions section 86-20 allows/);
  assert.match(html, /Compilation No\. 268 of 1 October 2026, read 17 November 2026/);
  assert.match(html, /which replaced TR 2001\/7 and TR 2001\/8 \(paragraph 30\)/);
  assert.match(html, /The checker does not allocate expenses across PSI, business income and other income\./);
  assert.match(html, /so any split is practice rather than law/);
});

// Redundancy and ETP withholding. Schedule 11, 'Tax table for employment termination payments', in the
// Taxation Administration (Withholding Schedules) Instrument 2026 (F2026L00716, in force, no later
// replacement), read on legislation.gov.au 15 November 2026, and on the ATO's page (last updated
// 17 June 2026), read 15 November 2026 at 12:13 AEDT:
// https://www.ato.gov.au/tax-rates-and-codes/payg-withholding-schedule-11-tax-table-for-employment-termination-payments
// 'The ETP cap amount for the 2026–27 income year is $270,000'; 'The whole-of-income cap amount for the
// 2026–27 income year is $180,000'; note 1: 'The tax-free base limit for the 2026–27 income year is $13,598
// plus $6,801 for each completed year of service'; Table A: 32% under preservation age and 17% at or over
// it up to the cap, 47% above it; preservation age 'by the end of the income year'.
const SCHEDULE_11 = { yearEnd: '2027-06-30', etpCap: '270000', wholeOfIncomeCap: '180000', baseAmount: '13598',
  serviceAmount: '6801', rateUnder: '32', rateReached: '17', rateAbove: '47' };
const etpHtml = readFileSync(new URL('../_includes/calculators/termination-payment.html', import.meta.url), 'utf8');
// The form's data attributes, as assets/accounting-pages.mjs passes them in form.dataset.
const etpYear = Object.fromEntries([...etpHtml.match(/<form [^>]*>/)[0].matchAll(/ data-([a-z-]+)="([^"]*)"/g)]
  .filter(([, name]) => name !== 'calculator')
  .map(([, name, value]) => [name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
const noEtp = { redundancy: '0', years: '0', excluded: '0', nonExcluded: '0', other: '0', born: '1996-08-01' };
const etp = (fields, year = etpYear) => calculations.terminationPayment({ ...noEtp, ...fields }, year);
const longDate = (iso) => new Date(`${iso}T00:00:00Z`)
  .toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
Object.assign(LABELS, { taxFreeLimit: 'tax-free limit', taxFree: 'tax-free part', excluded: 'code R taxable component',
  excludedWithholding: 'withheld from code R', wholeOfIncomeCap: 'whole-of-income cap left', cap: 'code O cap',
  nonExcludedWithholding: 'withheld from code O', withholding: 'total withheld' });
Object.assign(INPUTS, { terminationPayment: (payment, year) => {
  assert.deepEqual(year, SCHEDULE_11);
  return `Redundancy payment ${dollars(payment.redundancy)} after ${payment.years} ${payment.years === '1' ? 'year' : 'years'}, `
    + `other code R ${dollars(payment.excluded)}, code O ${dollars(payment.nonExcluded)}, other payments ${dollars(payment.other)}, `
    + `born ${longDate(payment.born)}`;
} });
Object.assign(FORM_CALLS, { terminationPayment: (f) => [{ redundancy: f.redundancy, years: f.years, excluded: f.excluded,
  nonExcluded: f['non-excluded'], other: f.other, born: f.born }, etpYear] });

test('the ETP form carries Schedule 11’s caps, amounts and rates for 2026-27', () => {
  assert.deepEqual(etpYear, SCHEDULE_11);
});

// Example 1 gives only the ETP, the part of a genuine redundancy payment over its limit, so it is
// entered as a code R amount. Ages are those the examples give.
test('ETP withholding agrees with Schedule 11’s 4 examples', () => {
  // Example 1, Lloyd, 41: 'BigBiz withholds $14,400 from Lloyd’s ETP. This is 32% of ... $45,000.'
  assert.equal(etp({ excluded: '45000', born: '1985-01-01' }).withholding, 14400);
  // Example 2, Jane, 50, paid $84,000: whole-of-income cap '$96,000'; 'SmallBiz withholds $3,200'.
  const jane = etp({ nonExcluded: '10000', other: '84000', born: '1976-01-01' });
  assert.deepEqual([jane.wholeOfIncomeCap, jane.cap, jane.withholding], [96000, 96000, 3200]);
  // Example 3, Chris, paid $50,000 of leave and $50,000 of wages: '$25,600 ($80,000 × 32%) plus
  // $18,800 ($40,000 × 47%)', '$44,400'.
  const chris = etp({ nonExcluded: '120000', other: '100000' });
  assert.deepEqual([chris.cap, chris.withholding], [80000, 44400]);
  // Example 4, Alec, 30, paid $140,000: '$48,000 less $47,603 due to the 5 years of service', 'withholds
  // $127 (32% of $397)', then the gratuity's cap is the $40,000 whole-of-income cap, below 'the ETP cap of
  // $269,603', and 'withholds ... $5,657 from the $17,678 gratuity part'.
  const alec = etp({ redundancy: '48000', years: '5', nonExcluded: '17678', other: '140000' });
  assert.deepEqual([alec.taxFreeLimit, alec.taxFree, alec.excluded, alec.excludedWithholding, alec.wholeOfIncomeCap,
    alec.cap, alec.nonExcludedWithholding, alec.withholding, alec.reached, alec.rate],
  [47603, 47603, 397, 127, 40000, 40000, 5657, 5784, false, 32]);
});

// Schedule 11's table: born before 1 July 1960, 55; each later year from 1 July, a year more; after
// 30 June 1964, 60. Each row's first and last birthday reaches its age on that birthday, not the day before.
test('preservation age follows Schedule 11’s table and counts if reached by the year’s last day', () => {
  for (const [born, age] of [['1950-01-01', 55], ['1960-06-30', 55], ['1960-07-01', 56], ['1961-06-30', 56],
    ['1961-07-01', 57], ['1962-07-01', 58], ['1963-07-01', 59], ['1964-06-30', 59], ['1964-07-01', 60], ['1996-08-01', 60]]) {
    const birthday = `${Number(born.slice(0, 4)) + age}${born.slice(4)}`;
    const dayBefore = new Date(Date.parse(`${birthday}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    assert.equal(etp({ born }, { ...etpYear, yearEnd: birthday }).reached, true, born);
    assert.equal(etp({ born }, { ...etpYear, yearEnd: dayBefore }).reached, false, born);
  }
  assert.deepEqual([etp({ born: '1967-06-30' }).rate, etp({ born: '1967-07-01' }).rate], [17, 32]);
});

// Worked by hand: each part rounds on its own, so $1.57 of each at 32% ($0.5024) withholds $1 twice,
// where their $3.14 together would withhold $1; 17% of $26.47 is $4.4999, so $4.
test('ETP withholding rounds each part to the nearest dollar, 50 cents up', () => {
  assert.deepEqual([etp({ excluded: '1.57', nonExcluded: '1.57' }).withholding, etp({ nonExcluded: '3.14' }).withholding], [2, 1]);
  assert.equal(etp({ nonExcluded: '26.47', born: '1960-06-30' }).withholding, 4);
  // Over the cap: $10,000 of other payments leave a $170,000 cap; $200,000 is $54,400 + $14,100.
  assert.equal(etp({ nonExcluded: '200000', other: '10000' }).withholding, 54400 + 14100);
  // Other payments over $180,000 leave no whole-of-income cap, so all of code O is at 47%.
  const over = etp({ nonExcluded: '1000', other: '200000' });
  assert.deepEqual([over.wholeOfIncomeCap, over.cap, over.withholding], [0, 0, 470]);
});

test('ETP withholding refuses an impossible date of birth and years of service outside 0 to 150', () => {
  for (const born of ['', '1996-02-30', '1899-12-31', '2027-07-01', '1 August 1996']) {
    assert.throws(() => etp({ born }), { message: 'Enter a valid date of birth from 1900 to the end of the income year.' }, born);
  }
  assert.equal(etp({ born: '2027-06-30' }).reached, false);
  for (const years of ['-1', '151', '2.5']) {
    assert.throws(() => etp({ years }), { message: 'Enter a whole number between 0 and 150.' }, years);
  }
  assert.equal(etp({ redundancy: '1000000', years: '150' }).taxFreeLimit, 13598 + 150 * 6801);
});

// PCG 2021/4, read 15 November 2026 (updated guideline of 19 June 2024):
// https://www.ato.gov.au/law/view/document?docid=COG/PCG20214/NAT/ATO/00001
// Each case study in the appendix: entitlement, amount the IPP returns, the tax of every recipient
// on the firm income as its effective tax rate formula adds them, the guideline's 2 percentages,
// its scores and its zone. Case study 2's 54.5% is rounded to one place there.
const PCG_CASE_STUDIES = [
  ['1 Nicolas', '600000', '330000', [119167, 70200], [55, 31.56], [4, 3], 7, 'green'],
  ['2 Donald', '880000', '480000', [186667, 83200, 16467], [54.5, 32.54], [4, 3], 7, 'green'],
  ['3 Hilary', '250000', '162500', [45192, 22750], [65, 27.18], [3, 4], 7, 'green'],
  ['4 Bernie', '500000', '325000', [116916, 49817], [65, 33.35], [3, 3], 6, 'green'],
  ['5 Frank', '500000', '300000', [105666, 52000], [60, 31.53], [4, 3], 7, 'green'],
  ['8 Maria', '600000', '360000', [132667, 51667, 15600], [60, 33.32], [4, 3], 7, 'green'],
  ['9 David', '600000', '300000', [105667, 78000], [50, 30.61], [4, 3], 7, 'green'],
  ['10 Astrid', '400000', '200000', [60667, 40567, 13000], [50, 28.56], [4, 4], 8, 'amber'],
  ['11 Yan', '400000', '300000', [105667, 26000], [75, 32.92], [3, 3], 6, 'green'],
  ['12 Benjamin', '600000', '300000', [105667, 52000, 22967], [50, 30.11], [4, 3], 7, 'green'],
];
const pcgArrangement = (fields) => ({ gateway1: true, gateway2: true, entitlement: '1000', returned: '0', tax: '0',
  factor3: false, remuneration: '0', benchmark: '0', ...fields });
for (const [name, entitlement, returned, taxes, [share, rate], [factor1, factor2], total, zone] of PCG_CASE_STUDIES) {
  test(`PCG 2021/4 scores case study ${name} as the guideline does`, () => {
    const tax = String(taxes.reduce((sum, amount) => sum + amount, 0));
    const result = calculations.pcgRisk(pcgArrangement({ entitlement, returned, tax }));
    assert.equal(Math.trunc(result.returned * 10) / 10, share);
    assert.deepEqual([result.taxRate, result.factor1, result.factor2, result.total, result.zone],
      [rate, factor1, factor2, total, zone]);
    assert.equal(result.factor3, null);
  });
}

// Case study 7: '($360,000 ÷ $350,000) × 100 = 103%', a factor 3 score of 3, aggregate 10, green on all 3.
// Case study 6: Felix returns all of his $65,000, so he is green with no other factor (paragraphs 81, 154).
test('PCG 2021/4 scores case studies 7 and 6, which use factor 3 and the whole entitlement', () => {
  assert.deepEqual(calculations.pcgRisk(pcgArrangement({ entitlement: '600000', returned: '360000',
    tax: String(132667 + 51667 + 15600), factor3: true, remuneration: '360000', benchmark: '350000' })),
  { returned: 60, factor1: 4, taxRate: 33.32, factor2: 3, benchmarkShare: 102.86, factor3: 3, total: 10, zone: 'green' });
  assert.deepEqual(calculations.pcgRisk(pcgArrangement({ entitlement: '65000', returned: '65000', tax: '11592' })),
    { returned: 100, factor1: 1, taxRate: null, factor2: null, benchmarkShare: null, factor3: null, total: null, zone: 'green' });
});

// Table 1 at paragraph 76, band by band: each boundary percentage of $100, one cent above it and,
// where the band includes its boundary, one cent below. Written from the table, not the engine.
const PCG_BOUNDARIES = {
  factor1: [['90.01', 1], ['90', 2], ['75.01', 2], ['75', 3], ['60.01', 3], ['60', 4], ['50', 4], ['49.99', 5],
    ['25.01', 5], ['25', 6], ['0', 6]],
  factor2: [['40.01', 1], ['40', 2], ['35.01', 2], ['35', 3], ['30', 3], ['29.99', 4], ['25.01', 4], ['25', 5],
    ['20.01', 5], ['20', 6], ['0', 6]],
  factor3: [['200.01', 1], ['200', 2], ['150.01', 2], ['150', 3], ['100.01', 3], ['100', 4], ['90.01', 4],
    ['90', 5], ['70.01', 5], ['70', 6], ['0', 6]],
};
for (const [factor, cases] of Object.entries(PCG_BOUNDARIES)) {
  test(`PCG 2021/4 ${factor} changes score at each boundary in Table 1`, () => {
    for (const [percent, score] of cases) {
      const fields = { factor1: { returned: percent, tax: '30' }, factor2: { returned: '55', tax: percent },
        factor3: { returned: '55', tax: '30', factor3: true, remuneration: percent, benchmark: '100' } }[factor];
      assert.equal(calculations.pcgRisk(pcgArrangement({ entitlement: '100', ...fields }))[factor], score, percent);
    }
  });
}

// Table 2 at paragraph 78: every aggregate either side of each zone boundary.
test('PCG 2021/4 zones follow Table 2 for 2 factors and for all 3', () => {
  for (const [fields, total, zone] of [
    [{ returned: '55', tax: '31' }, 7, 'green'], [{ returned: '55', tax: '28' }, 8, 'amber'],
    [{ returned: '40', tax: '28' }, 9, 'red'], [{ returned: '10', tax: '0' }, 12, 'red'],
    [{ returned: '55', tax: '31', factor3: true, remuneration: '120' }, 10, 'green'],
    [{ returned: '55', tax: '31', factor3: true, remuneration: '95' }, 11, 'amber'],
    [{ returned: '55', tax: '31', factor3: true, remuneration: '80' }, 12, 'amber'],
    [{ returned: '55', tax: '31', factor3: true, remuneration: '50' }, 13, 'red'],
    [{ returned: '95', tax: '45', factor3: true, remuneration: '250' }, 3, 'green'],
  ]) {
    const result = calculations.pcgRisk(pcgArrangement({ entitlement: '100', benchmark: '100', ...fields }));
    assert.deepEqual([result.total, result.zone], [total, zone], JSON.stringify(fields));
  }
});

test('PCG 2021/4 refuses a failed gateway and figures it cannot score', () => {
  for (const [fields, message] of [
    [{ gateway1: false }, 'The arrangement fails Gateway 1, so PCG 2021/4 gives it no risk score.'],
    [{ gateway1: false, gateway2: false }, 'The arrangement fails Gateway 1, so PCG 2021/4 gives it no risk score.'],
    [{ gateway2: false }, 'The arrangement fails Gateway 2, so PCG 2021/4 gives it no risk score.'],
    [{ gateway1: 'yes' }, 'The arrangement fails Gateway 1, so PCG 2021/4 gives it no risk score.'],
    [{ entitlement: '0' }, 'Enter a profit entitlement above nil.'],
    [{ returned: '1000.01' }, 'The amount returned cannot exceed the profit entitlement.'],
    [{ tax: '1000.01' }, 'The tax cannot exceed the firm income.'],
    [{ factor3: true, remuneration: '10' }, 'Enter a commercial benchmark above nil.'],
    [{ tax: '-1' }, 'Enter an amount between 0 and 1000000000.'],
    [{ factor3: 'false' }, 'Factor 3 must be true or false.'],
    [{ factor3: undefined }, 'Factor 3 must be true or false.'],
  ]) {
    assert.throws(() => calculations.pcgRisk(pcgArrangement(fields)), { message }, JSON.stringify(fields));
  }
});

// General interest charge, Taxation Administration Act 1953 ss 8AAC and 8AAD (Compilation No. 227,
// 1 October 2026), read 15 November 2026: https://www.legislation.gov.au/C1953A00001/latest/text
// A day's rate is the annual rate divided by the days in the calendar year, applied to the debt and
// the GIC still unpaid at the end of the day.
//
// $1,000 by 3 monthly instalments from 1 October 2026, worked by hand at 11.51% (October to December
// 2026, 365 days): one day's growth g = 1 + 0.1151 / 365 = 1.000315342466. The instalments fall on
// 1 October, 1 November (31 days later) and 1 December (30 days later), so an equal instalment P
// clears the debt when 1000 x g^61 = P x (g^61 + g^30 + 1), and P = 1000 x 1.019414 / 3.028907 =
// 336.5616: $336.56, rounded down to the cent.
//   1 October:  1000.00 - 336.56 = 663.44, which grows by g^31 = 1.009822 to 669.9563 on 1 November.
//   1 November: 669.9563 - 336.56 = 333.3963, which grows by g^30 = 1.009504 to 336.5648 on 1 December.
//   1 December: the final instalment pays 336.5648, which is $336.56.
// Total paid 336.56 + 336.56 + 336.56 = $1,009.68, so the plan costs $9.68 of GIC over paying now.
test('GIC on 3 monthly instalments matches the hand-worked example', () => {
  const g = 1 + 0.1151 / 365;
  const exact = 1000 * g ** 61 / (g ** 61 + g ** 30 + 1);
  assert.equal(Math.floor(exact * 100) / 100, 336.56);
  const second = (1000 - 336.56) * g ** 31 - 336.56;
  assert.equal(Math.round(second * g ** 30 * 100) / 100, 336.56);
  assert.deepEqual(calculations.gicPaymentPlan({ debt: '1000', start: '2026-10-01', count: '3', frequency: 'monthly',
    assumedRate: '11.51' }), { instalment: 336.56, final: 336.56, totalPaid: 1009.68, gic: 9.68, lastDate: '2026-12-01',
    assumedDays: 0 });
});

// The rate table CSV is the ATO's list, read 15 November 2026 from
// https://www.ato.gov.au/tax-rates-and-codes/general-interest-charge-rates (last updated 4 September 2026).
const GIC_SOURCE = 'https://www.ato.gov.au/tax-rates-and-codes/general-interest-charge-rates';
const gicCsv = readFileSync(new URL('../rates/general-interest-charge/general-interest-charge-rates.csv', import.meta.url), 'utf8')
  .trim().split(/\r?\n/);
const gicRows = gicCsv.slice(1).map((line) => Object.fromEntries(line.split(',').map((cell, i) => [gicCsv[0].split(',')[i], cell])));
test('GIC rate CSV: contiguous quarters from July 1999, each daily rate from its annual rate, each with its source', () => {
  assert.equal(gicCsv[0], 'quarter_start,quarter_end,annual_rate_percent,daily_rate_percent,source_url,checked_at');
  const oldest = [...gicRows].reverse();
  assert.equal(oldest[0].quarter_start, '1999-07-01');
  oldest.forEach((row, i) => {
    const start = new Date(`${row.quarter_start}T00:00:00Z`);
    assert.equal(start.getUTCDate(), 1, row.quarter_start);
    assert.equal(start.getUTCMonth() % 3, 0, row.quarter_start);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0)).toISOString().slice(0, 10);
    assert.equal(row.quarter_end, end, row.quarter_start);
    if (i > 0) assert.equal(Date.parse(row.quarter_start) - Date.parse(oldest[i - 1].quarter_end), 86400000);
    // The ATO's daily rate is the annual rate over the days in the calendar year to 8 places; in 13
    // quarters its last place is 1 away from the nearest rounding, never more.
    const year = start.getUTCFullYear();
    const days = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
    assert.match(row.annual_rate_percent, /^\d{1,2}\.\d{2}$/);
    assert.match(row.daily_rate_percent, /^0\.\d{8}$/);
    const [annual, daily] = [Math.round(Number(row.annual_rate_percent) * 100), Number(row.daily_rate_percent.slice(2))];
    assert.ok(Math.abs(daily * days - annual * 1000000) < 1.5 * days, row.quarter_start);
    assert.equal(row.source_url, GIC_SOURCE);
    assert.equal(row.checked_at, '2026-11-15');
  });
  // The rate page says 13 quarters differ from the nearest rounding.
  assert.equal(gicRows.filter((row) => {
    const year = Number(row.quarter_start.slice(0, 4));
    const days = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
    return Number(row.daily_rate_percent.slice(2)) !== Math.round(Math.round(Number(row.annual_rate_percent) * 100) * 1000000 / days);
  }).length, 13);
  // The latest 2 quarters, as the ATO page states them.
  assert.deepEqual(gicRows.slice(0, 2).map((row) => [row.quarter_start, row.annual_rate_percent, row.daily_rate_percent]),
    [['2026-10-01', '11.51', '0.03153425'], ['2026-07-01', '11.43', '0.03131507']]);
});

test('the GIC engine uses the CSV rates, and the pages name the month its table ends', () => {
  assert.deepEqual(calculations.GIC_QUARTERS, [...gicRows].reverse().map((row) => [row.quarter_start, row.annual_rate_percent]));
  const end = new Date(`${gicRows[0].quarter_end}T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const html = readFileSync(new URL('../_includes/calculators/gic-payment-plan.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../assets/accounting-pages.mjs', import.meta.url), 'utf8');
  const named = [...html.matchAll(/after (\w+ \d{4})/g), ...script.matchAll(/after (\w+ \d{4})/g)].map((m) => m[1]);
  assert.equal(named.length, 6);
  assert.ok(named.every((month) => month === end), named.join(', '));
  assert.match(html, new RegExp(`up to ${new Date(`${gicRows[0].quarter_end}T00:00:00Z`).toLocaleDateString('en-AU',
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} comes from`));
});

// The rate page's example: $10,000 unpaid for the 92 days of October to December 2026 at 11.51%.
test('the GIC rate page example compounds 92 days of the October to December 2026 rate', () => {
  const grown = (1000000n * 3651151n ** 92n * 2n + 3650000n ** 92n) / (2n * 3650000n ** 92n);
  assert.equal(grown, 1029432n);
  const page = readFileSync(new URL('../rates/general-interest-charge/index.html', import.meta.url), 'utf8');
  assert.match(page, /grows\s+to \$10,294\.32: \$294\.32 of GIC/);
});

test('GIC instalments fall on the same day each month, or the last day of a shorter month', () => {
  const plan = (start, count, frequency) => calculations.gicPaymentPlan({ debt: '100', start, count, frequency, assumedRate: '11.51' });
  assert.equal(plan('2026-01-31', '2', 'monthly').lastDate, '2026-02-28');
  assert.equal(plan('2026-01-31', '3', 'monthly').lastDate, '2026-03-31');
  assert.equal(plan('2026-08-31', '5', 'monthly').lastDate, '2026-12-31');
  assert.equal(plan('2026-12-31', '2', 'fortnightly').lastDate, '2027-01-14');
  assert.equal(plan('2026-12-31', '2', 'fortnightly').assumedDays, 13);
});

test('GIC payment plan refuses inputs it cannot work', () => {
  const plan = { debt: '1000', start: '2026-10-01', count: '3', frequency: 'monthly', assumedRate: '11.51' };
  for (const [fields, message] of [
    [{ start: '2026-02-30' }, 'Enter a start date from 1999-07-01 to 2099-12-31.'],
    [{ start: '2100-01-01' }, 'Enter a start date from 1999-07-01 to 2099-12-31.'],
    [{ start: '1 October 2026' }, 'Enter a start date from 1999-07-01 to 2099-12-31.'],
    [{ count: '2.5' }, 'Enter a whole number between 1 and 120.'],
    [{ count: '0' }, 'Enter a whole number between 1 and 120.'],
    [{ frequency: 'quarterly' }, 'Choose weekly, fortnightly or monthly.'],
    [{ assumedRate: '0' }, 'Enter an amount between 0.01 and 100.'],
    [{ debt: '-1' }, 'Enter an amount between 0 and 1000000000.'],
  ]) {
    assert.throws(() => calculations.gicPaymentPlan({ ...plan, ...fields }), { message }, JSON.stringify(fields));
  }
});

// Division 7A loan schedule. ITAA 1936 ss 109E and 109N (compilation 193, 1 October 2026), read
// 17 November 2026 at https://www.legislation.gov.au/C1936A00027/latest/text; the ATO's benchmark
// rate table (last updated 1 July 2026), read 17 November 2026 at
// https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate: '2027 | 8.77%',
// '2026 | 8.37%', '2025 | 8.77%', '2024 | 8.27%', '2023 | 4.77%', '2022 | 4.52%', each income year
// ending 30 June.
const { DIV7A_PUBLISHED_RATES } = await import('../assets/div7a.mjs');
const div7aScheduleHtml = readFileSync(new URL('../_includes/calculators/div7a-schedule.html', import.meta.url), 'utf8');
const scheduleLoan = { made: '2022-10-01', amount: '100000', term: '7', assumedRate: '8.77', repayments: '', marginalRate: '',
  franking: 'unfranked', lodgment: false, refinanced: false, interposed: false };
const schedule = (fields = {}) => calculations.div7aSchedule({ ...scheduleLoan, ...fields });
Object.assign(INPUTS, { div7aSchedule: (loan) => `Made ${loan.made}, ${dollars(loan.amount)}, ${loan.term} years, `
  + `${loan.assumedRate}% assumed, repayments '${loan.repayments}'`
  + ['lodgment', 'refinanced', 'interposed'].filter((flag) => loan[flag]).map((flag) => `, ${flag}`).join('') });
Object.assign(FORM_CALLS, { div7aSchedule: (f) => [{ made: f.made, amount: f.amount, term: f.term, assumedRate: f['assumed-rate'],
  repayments: f.repayments, marginalRate: f['marginal-rate'], franking: f.franking, lodgment: f.lodgment === 'yes',
  refinanced: f.refinanced === 'yes', interposed: f.interposed === 'yes' }] });
Object.assign(ENGINE_LABELS, { div7aSchedule: { firstMinimum: 'first minimum', totalRepaid: 'repaid', totalInterest: 'interest',
  lastYear: (v) => `last year ${v}`, closing: 'not repaid', shortfall: 'shortfall',
  projectedFrom: (v) => (v === null ? 'no projected year' : `projected from ${v}`) } });

test('the Division 7A schedule’s published rates are the ATO’s, the site’s rate table rows and the page’s list', () => {
  assert.deepEqual(DIV7A_PUBLISHED_RATES.map(([year, rate]) => [year, rate]), [['2021-22', '4.52'], ['2022-23', '4.77'],
    ['2023-24', '8.27'], ['2024-25', '8.77'], ['2025-26', '8.37'], ['2026-27', '8.77']]);
  for (const [year, rate] of DIV7A_PUBLISHED_RATES) {
    assert.equal(div7aRates[year], rate, year);
    assert.ok(div7aScheduleHtml.includes(`${rate}% for ${year}`), year);
  }
  // A year the site's table adds after 2026-27 must join the schedule's rates.
  assert.equal(Object.keys(div7aRates).sort().at(-1), DIV7A_PUBLISHED_RATES.at(-1)[0]);
  assert.equal(div7aScheduleHtml.includes('<select'), false);
});

test('each Division 7A schedule year is the s 109E(6) minimum on the balance the year before carries', () => {
  const { years } = schedule();
  assert.deepEqual(years.map((row) => [row.year, row.rate, row.projected, row.remainingTerm]), [['2023-24', 8.27, false, 7],
    ['2024-25', 8.77, false, 6], ['2025-26', 8.37, false, 5], ['2026-27', 8.77, false, 4], ['2027-28', 8.77, true, 3],
    ['2028-29', 8.77, true, 2], ['2029-30', 8.77, true, 1]]);
  let opening = 100000;
  for (const row of years) {
    const single = div7aMinimumRepayment(String(row.opening), String(row.rate), String(row.remainingTerm));
    assert.deepEqual([row.opening, row.minimum], [opening, single.repayment], row.year);
    assert.equal(Math.round((row.repayment - row.interest) * 100) / 100, row.principal, row.year);
    assert.equal(Math.round((row.opening - row.principal) * 100) / 100, row.closing, row.year);
    opening = row.closing;
  }
  // In the last year the minimum is the balance and a full year's interest, more than repaying the
  // loan on 30 June needs, as that day carries no balance; the blank entry repays it and no more.
  const last = years.at(-1);
  assert.ok(last.repayment < last.minimum);
  assert.deepEqual([last.closing, last.shortfall], [0, 0]);
});

// 'Loans by private companies' works interest 'annually in arrears by reference to the daily
// balance', a repayment reducing the balance from its day, and says: 'The amount of the loan repaid
// during an income year is obtained by deducting the interest from the actual repayments made during
// the year.' Worked by hand: 2023-24 holds 29 February, so 365 days at $100,000 and 8.27% are
// $8,247.40 and 30 June at $80,615.04 is $18.22; 2024-25 at $88,880.66 and 8.77% is $7,773.48 for
// 364 days and then $20.15 on $83,880.66 or $18.95 on $78,880.66.
test('a Division 7A repayment on 30 June leaves that day on the reduced balance, and meets the interest first', () => {
  const [first, short] = schedule({ repayments: '; 5000' }).years;
  assert.deepEqual([first.interest, first.principal, first.closing], [8265.62, 11119.34, 88880.66]);
  // The ATO's amount not repaid is the opening balance plus the interest less the repayments,
  // so the $2,793.63 of interest that $5,000 leaves unpaid adds to the balance.
  assert.deepEqual([short.opening, short.interest, short.repayment, short.principal, short.closing, short.shortfall],
    [88880.66, 7793.63, 5000, -2793.63, 91674.29, 14677.59]);
  const [, partial] = schedule({ repayments: '; 10000' }).years;
  assert.deepEqual([partial.interest, partial.principal, partial.closing], [7792.43, 2207.57, 86673.09]);
  // With no repayment the whole year is one period: 8.27% of $100,000, all of it unpaid.
  const [none] = schedule({ repayments: '0' }).years;
  assert.deepEqual([none.interest, none.principal, none.closing], [8270, -8270, 108270]);
  // $8.01 at 40%: the interest rounds to $3.21 over a $3.20 minimum, so meeting the minimum leaves
  // a cent unpaid, the next minimum is $3.21 and a second $3.20 falls a cent short.
  const tiny = schedule({ made: '2027-01-15', amount: '8.01', term: '25', assumedRate: '40', repayments: '3.20; 3.20' });
  assert.deepEqual(tiny.years.map((row) => [row.minimum, row.principal, row.closing, row.shortfall]),
    [[3.2, -0.01, 8.02, 0], [3.21, -0.01, 8.03, 0.01]]);
});

test('a Division 7A repayment a cent short of the minimum is the shortfall, and the schedule stops', () => {
  const minimum = schedule().years[1].minimum;
  const short = schedule({ repayments: `; ${(minimum - 0.01).toFixed(2)}` });
  assert.deepEqual([short.years.length, short.lastYear, short.shortfall, short.projectedFrom], [2, '2024-25', 0.01, null]);
  const met = schedule({ repayments: `; ${minimum.toFixed(2)}` });
  assert.deepEqual([met.years.length, met.shortfall], [7, 0]);
  // A nil repayment in the first year falls short by the whole minimum.
  assert.equal(schedule({ repayments: '0' }).shortfall, 19384.96);
});

test('a larger Division 7A repayment lowers the later minimums and can end the loan early', () => {
  const minimums = schedule().years.map((row) => row.minimum);
  const extra = schedule({ repayments: '40000' }).years.map((row) => row.minimum);
  assert.equal(extra[0], minimums[0]);
  for (let k = 1; k < 7; k += 1) assert.ok(extra[k] < minimums[k], String(k));
  // $50,000 leaves $58,258.70; 364 days at 8.77% add $5,095.29, so $63,353.99 repays it.
  const early = schedule({ repayments: '50000; 63353.99' });
  assert.deepEqual([early.years.length, early.closing, early.shortfall, early.lastYear], [2, 0, 0, '2024-25']);
  assert.throws(() => schedule({ repayments: '50000; 63354' }), { message: 'The 2024-25 repayment is more than $63,353.99, which repays the loan on 30 June.' });
  // Repaying in full is no shortfall, even below a minimum: subsection 109E(1)(b) needs the loan unpaid.
  const full = schedule({ repayments: '108247.40' });
  assert.deepEqual([full.years.length, full.closing, full.shortfall], [1, 0, 0]);
});

test('only the Division 7A years after 2026-27 move with the assumed rate', () => {
  const [base, higher] = [schedule(), schedule({ assumedRate: '10' })];
  assert.deepEqual(higher.years.slice(0, 4), base.years.slice(0, 4));
  assert.deepEqual(higher.years.slice(4).map((row) => row.rate), [10, 10, 10]);
  assert.ok(higher.totalInterest > base.totalInterest);
});

test('a Division 7A loan takes 7 or 25 years from the year after the one it was made in', () => {
  const secured = schedule({ made: '2027-01-15', term: '25', amount: '500000' });
  assert.deepEqual([secured.years.length, secured.years[0].year, secured.lastYear, secured.projectedFrom],
    [25, '2027-28', '2051-52', '2027-28']);
  assert.deepEqual(secured.years.map((row) => row.remainingTerm), Array.from({ length: 25 }, (_, k) => 25 - k));
  // 30 June ends the income year; 1 July starts the next.
  assert.equal(schedule({ made: '2023-06-30' }).years[0].year, '2023-24');
  assert.equal(schedule({ made: '2023-07-01' }).years[0].year, '2024-25');
  assert.equal(schedule({ made: '2020-07-01' }).years[0].rate, 4.52);
  assert.equal(schedule({ made: '2027-06-30' }).years[0].year, '2027-28');
});

// D x (1 - m) = R unfranked; D x (1 - m) / (1 - c) = R franked at the corporate rate c.
test('the dividend that funds a Division 7A repayment is rounded up to the cent', () => {
  const funding = (marginalRate, franking) => schedule({ marginalRate, franking }).years[0].funding;
  assert.equal(schedule().years[0].funding, null);
  assert.equal(funding('0', 'unfranked'), 19384.96);
  assert.equal(funding('30', '30'), 19384.96);
  assert.equal(funding('25', '25'), 19384.96);
  // 1,938,496 / 0.53 = 3,657,539.62... cents; x 0.7 = 2,560,277.73... cents.
  assert.equal(funding('47', 'unfranked'), 36575.40);
  assert.equal(funding('47', '30'), 25602.78);
  // 1,938,496 x 0.7 = 1,356,947.2 cents with no tax to pay.
  assert.equal(funding('0', '30'), 13569.48);
});

test('the Division 7A schedule refuses what its sources do not cover', () => {
  for (const flag of ['lodgment', 'refinanced', 'interposed']) {
    assert.throws(() => schedule({ [flag]: 'no' }), { message: 'Answer each question about the loan.' }, flag);
    assert.throws(() => schedule({ [flag]: true }), { message: /^This page does not work / }, flag);
  }
  for (const [fields, message] of [[{ made: '1997-12-03' }, /subsection 109D\(5\)/], [{ made: '2020-06-30' }, /from 1 July 2020/],
    [{ made: '2027-07-01' }, /to 30 June 2027/], [{ made: '2022-02-30' }, /^Enter the date the loan was made\.$/],
    [{ made: '' }, /^Enter the date the loan was made\.$/], [{ term: '10' }, /^Choose a 7-year or 25-year term\.$/],
    [{ franking: 'toString' }, /^Choose unfranked/], [{ amount: '0' }, /^Enter an amount between 0.01 and/],
    [{ marginalRate: '100' }, /^Enter an amount between 0 and 99.99\.$/], [{ assumedRate: '0' }, /^Enter an amount between 0.01 and 100\.$/],
    [{ repayments: '1;1;1;1;1;1;1;1' }, /no more than 7 repayments/], [{ repayments: '-1' }, /^Enter an amount between 0 and/],
    [{ repayments: '108247.41' }, /more than \$108,247\.40, which repays the loan on 30 June\.$/], [{ repayments: '50000; 63353.99; 1' }, /repaid in 2024-25/]]) {
    assert.throws(() => schedule(fields), { message }, JSON.stringify(fields));
  }
  assert.equal(schedule({ repayments: '108247.40' }).closing, 0);
});

test('the Division 7A schedule page opens on the result its calculation gives for the form’s inputs', () => {
  const example = div7aScheduleHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const result = calculations.div7aScheduleResult(scheduleLoan, aud);
  assert.deepEqual([result.inputs, result.rows.map((row) => row.join('|')).join(';'), String(result.principal), result.note],
    example.slice(1, 5));
  assert.deepEqual(result.table.map((row) => row[1]), ['8.27%', '8.77%', '8.37%', '8.77%', '8.77% assumed', '8.77% assumed', '8.77% assumed']);
  assert.equal(div7aScheduleHtml.match(/<th scope="col">/g).length, result.table[0].length);
  const short = calculations.div7aScheduleResult({ ...scheduleLoan, repayments: '; 10000' }, aud);
  assert.equal(short.principal, 4);
  assert.match(short.note, /^The 2024-25 repayment falls short of the minimum, so subsection 109E\(1\)/);
});

// ATO, 'Fringe benefits tax - rates and thresholds' (last updated 20 May 2026), read 17 November 2026:
// https://www.ato.gov.au/tax-rates-and-codes/fringe-benefits-tax-rates-and-thresholds
// Table 9, car parking threshold, '31 March 2027 $11.48'; Table 10, statutory or benchmark interest
// rate, '31 March 2027 8.27%'. The FBT year from 1 April 2026 to 31 March 2027 has 365 days.
test('FBT benefit forms carry the ATO’s rate and threshold for the year ending 31 March 2027', () => {
  assert.deepEqual(fbtBenefitYear('fbt-car-parking'), { calculator: 'fbt-car-parking', threshold: '11.48', yearDays: '365', yearEnded: '2027' });
  assert.deepEqual(fbtBenefitYear('fbt-loan'), { calculator: 'fbt-loan', yearDays: '365', statutoryRate: '8.27' });
  assert.deepEqual(fbtBenefitYear('fbt-meal-entertainment'), { calculator: 'fbt-meal-entertainment', yearEnded: '2027' });
  assert.equal((Date.parse('2027-03-31') - Date.parse('2026-03-31')) / 86400000, 365);
  const include = (page) => readFileSync(new URL(`../_includes/calculators/${page}.html`, import.meta.url), 'utf8');
  assert.match(include('fbt-car-parking'), /threshold for the year ending 31 March 2027 is \$11\.48, from Table 9 of <a href="https:\/\/www\.ato\.gov\.au\/tax-rates-and-codes\/fringe-benefits-tax-rates-and-thresholds">/);
  assert.match(include('fbt-loan'), /rate of 8\.27% for the FBT year ending 31 March 2027, from Table 10 of <a href="https:\/\/www\.ato\.gov\.au\/tax-rates-and-codes\/fringe-benefits-tax-rates-and-thresholds">/);
});

// ATO, 'Fringe benefits tax - a guide for employers', chapter 8, read 17 November 2026:
// https://www.ato.gov.au/law/view/document?docid=SAV/FBTGEMP/00009 (statutory interest rate 5.65%).
// 8.5: '$2,825 ($50,000 × 5.65%)' less '$2,500 ($50,000 × 5%)', 'The difference of $325'.
// 8.8: 'Example – rate set without regard to employee's use of loan', '$825 - $495 = $330'; 'with regard
// to employee's use', '$1,695 - $282.50 = $1,412.50', '$825 - $1,412.50 = 0'.
test('FBT loan agrees with the guide’s worked examples at their 5.65% rate', () => {
  const at = (accrued, use, deduction) => calculations.fbtLoan({ balances: '18250000', accrued, incomeUse: use, deduction },
    { days: '365', rate: '5.65' });
  assert.deepEqual([at('2500', '0', '0').notional, at('2500', '0', '0').taxableValue], [2825, 325]);
  assert.deepEqual(at('2000', '60', '1200'), { notional: 2825, gross: 825, grossDeduction: 1695, notionalDeduction: 495,
    reduction: 495, taxableValue: 330 });
  assert.equal(at('2000', '60', '282.50').taxableValue, 0);
});

// s 19(1)(ba): RD above GD leaves no notional deduction, so the value is not increased. Worked by hand at
// 8.27%: notional interest $4,135.00 less $4,000.00 accrued is $135.00; GD is 10% of $4,135.00, $413.50.
test('FBT loan: a deduction for accrued interest above the gross deduction adds nothing', () => {
  const r = calculations.fbtLoan({ balances: '18250000', accrued: '4000', incomeUse: '10', deduction: '4000' }, { days: '365', rate: '8.27' });
  assert.deepEqual([r.gross, r.grossDeduction, r.notionalDeduction, r.reduction, r.taxableValue], [135, 413.5, 0, 0, 135]);
});

// s 18: the daily balances at the statutory rate are divided by the days in the year. Worked by hand:
// $18,300,000 of daily balances at 8.27% over a 366-day year is $4,135.00; over 365 days, $4,146.33.
test('FBT loan divides by the days in its FBT year', () => {
  const at = (days) => calculations.fbtLoan({ balances: '18300000', accrued: '0', incomeUse: '0', deduction: '0' }, { days, rate: '8.27' });
  assert.deepEqual([at('366').notional, at('365').notional], [4135, 4146.33]);
});

// ATO, 'Fringe benefits tax - a guide for employers', chapter 16, read 17 November 2026:
// https://www.ato.gov.au/law/view/document?docid=SAV/FBTGEMP/00017
// Example 12: on 1 April 2022 stations charged $5.50 and $10, 'more than the car parking threshold of
// $9.72', so 'Qstore can use the lower rate of $5.50'. Example 15: car park A '$18.50 ((17 + 20) ÷ 2)',
// car park B '$12.50 ((10 + 15) ÷ 2)', B's lowest first business day fee being $10. Example 17
// (1 October 2019 to 31 March 2020): '$2,500 × (52 ÷ 12) = $10,833.33', '183 ÷ 366', '$5,416.67'.
// Example 18 (2022-23): '$4,535.08 × (3 ÷ 4) = $3,401.31', '$30 × 26 weeks × 3 employees = $2,340',
// '$1,061.31'. Examples 17 and 18 say benefits arose, so a fee above the threshold is supplied for each.
// ATO historical rates and thresholds (last updated 1 April 2026), read 17 November 2026: 31 March 2020, $8.95.
test('FBT car parking agrees with the guide’s examples at their own years’ thresholds', () => {
  const y2023 = { threshold: '9.72', days: '365', ended: '2023' };
  const base = { method: 'station', fee: '10', benefits: '1', each: '0', firstFee: '0', lastFee: '0', registerValue: '0', days: '0',
    firstYear: '2023', rate: '0', spaceDays: '1', spaces: '1', employeesStart: '0', employeesEnd: '0', spacesStart: '0',
    spacesEnd: '0', contribution: '0' };
  const park = (fields, year = y2023) => calculations.fbtCarParking({ ...base, ...fields }, year);
  assert.equal(park({ each: '5.50' }).taxableValue, 5.5);
  assert.equal(park({ method: 'average', fee: '17', firstFee: '17', lastFee: '20' }).average, 18.5);
  assert.equal(park({ method: 'average', fee: '10', firstFee: '10', lastFee: '15' }).average, 12.5);
  // Car park B's facts in the year ending 31 March 2027: $10 is not above $11.48, so no benefit arises.
  assert.deepEqual(park({ method: 'average', fee: '10', firstFee: '10', lastFee: '15' },
    { threshold: '11.48', days: '365', ended: '2027' }), { benefit: false, gross: 0, taxableValue: 0 });
  const register = park({ method: 'register', fee: '9', registerValue: '2500', days: '183', firstYear: '2020' },
    { threshold: '8.95', days: '366', ended: '2020' });
  assert.deepEqual([register.annual, register.taxableValue], [10833.33, 5416.67]);
  const spaces = park({ method: 'spaces', rate: '10', spaceDays: '182', spaces: '4', employeesStart: '3', employeesEnd: '3',
    spacesStart: '4', spacesEnd: '4', contribution: '2340' });
  assert.deepEqual([spaces.statutoryBenefit, spaces.gross, spaces.taxableValue], [4535.08, 3401.31, 1061.31]);
});

test('FBT benefits refuse inputs they cannot work', () => {
  const year = { threshold: '11.48', days: '365', ended: '2027' };
  const base = { method: 'station', fee: '12', benefits: '1', each: '12', firstFee: '0', lastFee: '0', registerValue: '0', days: '0',
    firstYear: '2027', rate: '0', spaceDays: '1', spaces: '1', employeesStart: '0', employeesEnd: '0', spacesStart: '0',
    spacesEnd: '0', contribution: '0' };
  for (const [fields, message] of [
    [{ method: 'actual' }, 'Choose a valuation method.'],
    [{ benefits: '1.5' }, 'Enter a whole number between 0 and 1000000.'],
    [{ method: 'register', days: '366' }, 'Enter a whole number between 0 and 365.'],
    [{ method: 'register', firstYear: '2028' }, 'The register must have been first valid for an FBT year ending 31 March 2023 to 2027.'],
    [{ method: 'spaces', spaceDays: '0' }, 'Enter a whole number between 1 and 365.'],
    [{ method: 'spaces', employeesStart: '2.5' }, 'Enter a whole number between 0 and 1000000.'],
  ]) {
    assert.throws(() => calculations.fbtCarParking({ ...base, ...fields }, year), { message }, JSON.stringify(fields));
  }
  // Inputs are checked whether or not a benefit arises.
  assert.throws(() => calculations.fbtCarParking({ ...base, fee: '1', benefits: '-1' }, year),
    { message: 'Enter a whole number between 0 and 1000000.' });
  const meal = { method: 'register', expenses: '100', registerBenefits: '1', registerTotal: '2', firstYear: '2026', earlier: ['100'] };
  for (const [fields, message] of [
    [{ method: 'actual' }, 'Choose a valuation method.'],
    [{ registerTotal: '0', registerBenefits: '0' }, 'The register’s meal entertainment must be more than nil and at least its fringe benefits.'],
    [{ registerBenefits: '3' }, 'The register’s meal entertainment must be more than nil and at least its fringe benefits.'],
    [{ earlier: [] }, 'Enter the expenses of each FBT year from the register’s first valid year to the year before this one.'],
  ]) {
    assert.throws(() => calculations.fbtMealEntertainment({ ...meal, ...fields }, { ended: '2027' }), { message }, JSON.stringify(fields));
  }
  assert.throws(() => calculations.fbtLoan({ balances: '1', accrued: '0', incomeUse: '100.01', deduction: '0' }, { days: '365', rate: '8.27' }),
    { message: 'Enter an amount between 0 and 100.' });
  assert.throws(() => calculations.fbtLoan({ balances: '1', accrued: '0', incomeUse: '0', deduction: '0' }, { days: '365', rate: '0' }),
    { message: 'Enter an amount between 0.01 and 100.' });
});

// The engines the FBT pages port, run on the same cases: see the fixture's engine line.
test('FBT benefits agree with the australian-accounting engines on every differential case', () => {
  const { cases } = JSON.parse(readFileSync(new URL('./fbt-engine-differential.json', import.meta.url), 'utf8'));
  assert.ok(cases.length > 150);
  for (const { name, source, call, amounts, refused } of cases) {
    if (refused) {
      assert.throws(() => calculations[name](...call), Error, `${source}: the engine refused, ${refused}`);
      continue;
    }
    let result;
    assert.doesNotThrow(() => { result = calculations[name](...call); }, source);
    assert.deepEqual(Object.fromEntries(Object.keys(amounts).map((k) => [k, result[k].toFixed(2)])), amounts, source);
  }
});

// FBTAA s 39GF(3), Compilation No. 97, read 17 November 2026: a register 'ceases to be valid at the end of
// that FBT year if the number of car parking fringe benefits ... increases by more than 10% on any day in
// that FBT year'. The calculator cannot see daily counts, so a register kept before this year carries the
// condition in its result; one kept this year has no earlier year to check.
test('FBT car parking register results name the 10% rule they do not check', () => {
  const fields = { method: 'register', fee: '12.36', 'register-value': '2500', days: '183', 'first-year': '2025', contribution: '0' };
  const form = { dataset: { calculator: 'fbt-car-parking', threshold: '11.48', yearDays: '365', yearEnded: '2027' } };
  const value = (name) => fields[name] ?? '0';
  const result = () => fbtBenefitResult(form, calculations, { aud: String, value, money: value });
  assert.equal(result().note, 'Valid only if the number of car parking fringe benefits did not rise by more than 10% '
    + 'on any day in the years ending 31 March 2025 to 2026 (subsection 39GF(3)), which this calculator does not check');
  assert.equal(result().rows.at(-1)[1], '5416.67');
  fields['first-year'] = '2027';
  assert.equal(result().note, undefined);
  fields.method = 'station';
  fields['first-year'] = '2025';
  assert.equal(result().note, undefined);
  assert.throws(() => fbtBenefitResult({ dataset: { calculator: 'fbt-boat' } }, calculations, {}), { message: 'Unknown calculator.' });
});

// FBTAA ss 39C, 39D and 39DA reduce each benefit by its own recipients contribution, so a total taken off
// several benefits is right only where none was overpaid: 2 benefits of $10 with $20 paid for one leave $10,
// where the total gives $0. The result says so whenever contributions come off. s 39FB(6): the reduction for
// fewer employees than spaces applies only to representative numbers, which the calculator cannot see.
test('FBT car parking results name the contribution and spaces conditions they do not check', () => {
  const fields = { method: 'station', fee: '12', benefits: '2', each: '10', contribution: '20' };
  const form = { dataset: { calculator: 'fbt-car-parking', threshold: '11.48', yearDays: '365', yearEnded: '2027' } };
  const value = (name) => fields[name] ?? '0';
  const result = () => fbtBenefitResult(form, calculations, { aud: String, value, money: value });
  const total = 'Contributions come off in total: if one benefit’s contribution was more than its value, '
    + 'the excess does not reduce other benefits, so value that benefit separately';
  assert.equal(result().note, total);
  Object.assign(fields, { 'first-fee': '10', 'last-fee': '10' });
  for (const method of ['market', 'average']) {
    fields.method = method;
    assert.equal(result().note, total, method);
  }
  Object.assign(fields, { method: 'station', each: '0', contribution: '5' });
  assert.deepEqual([result().rows.at(-2)[1], result().note], ['5', total]);
  fields.fee = '11.48';
  assert.equal(result().note, 'No car parking benefit arises: the first business day fee is not more than the $11.48 threshold');
  Object.assign(fields, { fee: '12', each: '10', contribution: '0' });
  assert.equal(result().note, undefined);
  Object.assign(fields, { method: 'spaces', rate: '10', 'space-days': '182', spaces: '4', 'employees-start': '3',
    'employees-end': '3', 'spaces-start': '4', 'spaces-end': '4', contribution: '2340' });
  assert.equal(result().note, 'The reduction for fewer employees than spaces applies only if both numbers are '
    + 'representative (subsection 39FB(6)), which this calculator does not check');
  assert.equal(result().rows.at(-1)[1], '1061.31');
  Object.assign(fields, { 'employees-start': '4', 'employees-end': '4' });
  assert.equal(result().note, undefined);
});

// From 2^46 dollars (about $70.37 trillion) a Number cannot hold every cent: 71,000 benefits at
// $1,000,000,000 less 1 cent would show as $70,999,999,999,999.98, so it is refused.
test('FBT benefits refuse a result too large to show to the cent', () => {
  const parking = { method: 'station', fee: '12', benefits: '1000000', each: '1000000000', firstFee: '0', lastFee: '0',
    registerValue: '0', days: '0', firstYear: '2027', rate: '0', spaceDays: '1', spaces: '1', employeesStart: '0',
    employeesEnd: '0', spacesStart: '0', spacesEnd: '0', contribution: '0.01' };
  assert.throws(() => calculations.fbtCarParking(parking, { threshold: '11.48', days: '365', ended: '2027' }),
    { message: 'The result is too large to work to the cent: enter smaller amounts.' });
  const year = { threshold: '11.48', days: '365', ended: '2027' };
  assert.throws(() => calculations.fbtCarParking({ ...parking, benefits: '71000' }, year),
    { message: 'The result is too large to work to the cent: enter smaller amounts.' });
  assert.equal(calculations.fbtCarParking({ ...parking, benefits: '70000' }, year).taxableValue.toFixed(2), '69999999999999.99');
  // 2^17 benefits at 2^29 dollars total exactly 2^46 dollars, the largest total taken.
  const cap = { ...parking, benefits: '131072', each: '536870912', contribution: '0' };
  let shown;
  assert.doesNotThrow(() => { shown = calculations.fbtCarParking(cap, year).taxableValue.toFixed(2); });
  assert.equal(shown, '70368744177664.00');
});

// The meal form passes each earlier year's expenses oldest first, so the 20% rule compares the right years:
// $1,300 after a $1,000 first year ends the register; $1,000 after a $1,300 first year does not.
test('FBT meal entertainment form passes the earlier years oldest first', () => {
  const fields = { method: 'register', expenses: '900', 'register-benefits': '1000', 'register-total': '3000',
    'first-year': '2025', 'earlier-2025': '1000', 'earlier-2026': '1300' };
  const form = { dataset: { calculator: 'fbt-meal-entertainment', yearEnded: '2027' },
    elements: { namedItem: (name) => (name in fields ? { value: fields[name] } : null) } };
  const value = (name) => fields[name] ?? '0';
  const result = () => fbtBenefitResult(form, calculations, { aud: String, value, money: value });
  assert.throws(result, { message: /ceased to be valid at the end of the FBT year ending 31 March 2026/ });
  Object.assign(fields, { 'earlier-2025': '1300', 'earlier-2026': '1000' });
  assert.deepEqual(result().rows.slice(0, 2), [['Register percentage', '33.33%'], ['Taxable value', '300']]);
});

// ATO, 'Luxury car tax rate and thresholds' (QC38161, last updated 1 June 2026), read 16 November 2026:
// https://www.ato.gov.au/tax-rates-and-codes/luxury-car-tax-rate-and-thresholds
// '2026-27 $91,661 $80,809' and '2025–26 $91,387 $80,567' (fuel-efficient vehicles, other vehicles).
const LCT_THRESHOLDS = { '2026-27': ['91661', '80809'], '2025-26': ['91387', '80567'] };
test('the vehicle classifier’s years are the car limit table’s rows and the ATO’s LCT thresholds', () => {
  const limits = Object.fromEntries(readFileSync(new URL('../rates/car-limit/car-limit.csv', import.meta.url), 'utf8')
    .trim().split(/\r?\n/).slice(1).map((line) => line.split(',').slice(0, 2)));
  assert.deepEqual(Object.keys(vehicleYears), ['2026-27', '2025-26']);
  for (const [year, { carLimit, fuelEfficientThreshold, otherThreshold }] of Object.entries(vehicleYears)) {
    assert.equal(carLimit, limits[year], year);
    assert.deepEqual([fuelEfficientThreshold, otherThreshold], LCT_THRESHOLDS[year], year);
  }
});

// ITAA 1997 s 40-230(1), read 16 November 2026 (https://www.ato.gov.au/law/view/document?docid=PAC/19970038/40-230):
// 'The first element of the cost of a car designed mainly for carrying passengers'; s 995-1: a car carries 'a load of
// less than 1 tonne'. A ute or van at exactly 1 tonne is not a car, and a car not designed mainly for carrying
// passengers is outside the limit whatever its body, so the car limit table must not tie utes and vans to the load alone.
test('the car limit table names the vehicles section 40-230 reaches', () => {
  const page = readFileSync(new URL('../rates/car-limit/index.html', import.meta.url), 'utf8');
  // check_site runs this against the rendered page, where the FAQ is HTML rather than front matter.
  const answer = page.match(/A car designed mainly for carrying passengers \(section 40-230\)\.[^"<]+/)?.[0] ?? '';
  assert.match(answer, /less than 1 tonne and fewer than 9 passengers \(section 995-1\), so a ute or van designed to carry 1 tonne or more/);
  assert.match(answer, /a car not designed mainly for carrying passengers/);
});

const vehicle = (fields) => ({ body: 'passenger', seats: '5', gvm: '3000', kerb: '2135', payload: '0', accessories: '0',
  modified: 'no', cost: '75000', credit: 'full', fuel: 'other', use: 'limited', ...fields });
// ATO, 'Instant asset write-off for eligible businesses' (last updated 28 August 2026), read 16 November 2026:
// https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/depreciation-and-capital-expenses-and-allowances/simpler-depreciation-for-small-business/instant-asset-write-off
// '$69,674 ÷ 11 = $6,334', '($75,000 − $6,334 = $68,666)' and, not registered, 'the car limit ($69,674 in 2025–26)'.
// ATO, 'Car thresholds from 1 July' (QC 107449, published 9 June 2026), read 16 November 2026:
// 'For 2026–27, the most GST credit you can claim is $6,353 (that is, 1/11 × $69,883)'.
test('the GST credit cap and the car limit agree with the ATO’s worked examples', () => {
  const registered = calculations.vehicleClass(vehicle({}), vehicleYears['2025-26']);
  assert.deepEqual([registered.credit, registered.cost], [6334, 68666]);
  assert.equal(calculations.vehicleClass(vehicle({ credit: 'none' }), vehicleYears['2025-26']).cost, 69674);
  assert.equal(calculations.vehicleClass(vehicle({ cost: '200000' }), vehicleYears['2026-27']).credit, 6353);
});

// TD 2006/40, read 16 November 2026: https://www.ato.gov.au/law/view/document?docid=TXD/TD200640/NAT/ATO/00001
// Example 1: '$77,000 is reduced by the input tax credit of $5,182 (1/11 of $57,009) ... to $71,818', then to
// '$57,009'. Example 2: '$60,000 ... reduced by the input tax credit of $5,182 ... to $54,818'. The
// determination leaves out the cents of 1/11 of $57,009, $5,182.636..., which rounds to $5,182.64.
test('the car limit applies after the GST credit, as TD 2006/40’s 2 examples show', () => {
  const year = { carLimit: '57009', fuelEfficientThreshold: '91661', otherThreshold: '80809' };
  const first = calculations.vehicleClass(vehicle({ cost: '77000' }), year);
  assert.deepEqual([Math.trunc(first.credit), first.credit, first.cost], [5182, 5182.64, 57009]);
  const second = calculations.vehicleClass(vehicle({ cost: '60000' }), year);
  assert.deepEqual([second.cost, 60000 - Math.trunc(second.credit)], [54817.36, 54818]);
});

// MT 2024 (consolidated 22 October 2008), read 16 November 2026:
// https://www.ato.gov.au/law/view/document?docid=MTR/MT2024/NAT/ATO/00001
// Paragraph 17: 'a gross vehicle weight of 2,000 kgs, a basic kerb weight of 1,400 kgs, and ... a designed seating
// capacity of five ... the total load capacity is 600 kgs of which the majority, 340 kgs, would be absorbed'.
// FBT guide for employers, chapter 7, example 19: 1,950 kg and 1,400 kg with 5 seats is 'designed principally for
// carrying passengers'. LCTD 2023/1, read 16 November 2026, example 5: 5 seats and a 960 kg load, '340 kg' against
// '960 kg × 0.5 = 480 kg', so the Commissioner will not review it as a luxury car. TD 94/19's 4-wheel drive
// wagon with 5 seats and 865 kg 'is designed principally for carrying passengers'.
test('the design tests agree with MT 2024, the FBT guide, LCTD 2023/1 and TD 94/19', () => {
  const year = vehicleYears['2026-27'];
  for (const [fields, passengers, fbt] of [
    [{ body: 'dual-cab', gvm: '2000', kerb: '1400' }, true, 'car-benefit'],
    [{ body: 'dual-cab', gvm: '1950', kerb: '1400' }, true, 'car-benefit'],
    [{ body: 'dual-cab', gvm: '3000', kerb: '2040' }, false, '8(2)(a)(ii)'],
    [{ body: 'passenger', gvm: '3000', kerb: '2135' }, true, 'car-benefit'],
  ]) {
    const result = calculations.vehicleClass(vehicle(fields), year);
    assert.deepEqual([result.passengers, result.fbt], [passengers, fbt], JSON.stringify(fields));
  }
  assert.equal(calculations.vehicleClass(vehicle({ body: 'dual-cab', gvm: '3000', kerb: '2040', cost: '85000' }), year).luxury,
    'commercial');
  // LCTD 2023/1 paragraphs 52 and 53: the ATO will not review a cargo or delivery van as a luxury car.
  const van = calculations.vehicleClass(vehicle({ body: 'van', seats: '3', gvm: '3000', kerb: '2100', cost: '90000' }), year);
  assert.equal(van.luxury, 'commercial');
  // TD 94/19 leaves a body other than a dual cab to its appearance, marketing and specifications, and no ATO
  // source says whether a single cab ute or panel van is designed mainly for carrying passengers: the car limit
  // is left undecided, whilst FBT's paragraph 8(2)(a)(i) covers both without asking.
  for (const body of ['single-cab', 'van']) {
    const result = calculations.vehicleClass(vehicle({ body, seats: '3', gvm: '3000', kerb: '2100', cost: '90000' }), year);
    assert.deepEqual([result.car, result.passengers, result.carLimit, result.cost, result.fbt], [true, null, null, null, '8(2)(a)(i)'], body);
  }
});

// ITAA 1997 s 40-230(1), read 17 November 2026 (https://www.ato.gov.au/law/view/document?docid=PAC/19970038/40-230),
// reaches 'a car designed mainly for carrying passengers'. MT 2024 paragraphs 14 to 16 set the dual cab test for FBT's
// subsection 8(2), TD 94/19 confines that method to dual cabs, and TD 2006/39 paragraph 7 carries only MT 2033's
// modification reasoning to s 40-230 (each read 17 November 2026). No ATO ruling applies MT 2024's test to the car
// limit, so a dual cab's car limit is not decided here, whatever its FBT answer. Section 40-230 only reduces a cost
// above the limit, so a cost after the credit within the limit is given either way.
test('a dual cab’s car limit is not decided here, whatever MT 2024 says for FBT', () => {
  const year = vehicleYears['2026-27'];
  for (const [gvm, kerb, passengers, fbt] of [['2000', '1400', true, 'car-benefit'], ['3000', '2040', false, '8(2)(a)(ii)']]) {
    const result = calculations.vehicleClass(vehicle({ body: 'dual-cab', gvm, kerb, cost: '50000' }), year);
    assert.deepEqual([result.passengers, result.fbt, result.carLimit, result.cost], [passengers, fbt, null, 45454.55], kerb);
  }
  // Without a credit, a price over the $69,883 limit leaves the cost undecided; at the limit it is the price.
  const uncredited = (cost) => calculations.vehicleClass(vehicle({ body: 'dual-cab', cost, credit: 'none' }), year).cost;
  assert.deepEqual([uncredited('69883'), uncredited('69883.01')], [69883, null]);
  assert.equal(calculations.vehicleClass(vehicle({ body: 'van', seats: '3', gvm: '3000', kerb: '2100', cost: '60000' }), year).cost,
    54545.45);
});

// GST Act s 69-10(4)(a), read 17 November 2026 (https://www.ato.gov.au/law/view/document?docid=PAC/19990055/69-10),
// lifts the cap only for 'a car that is not a luxury car because of subsection 25-1(2)' of the LCT Act, whose
// paragraph (c) asks whether a commercial vehicle is 'designed for the principal purpose of carrying passengers'.
// LCTD 2023/1 paragraphs 53, 55 and 58 say only when the ATO will not apply compliance resources, and paragraph 59
// says the simplified method 'does not affect the determination of the principal purpose' (read 17 November 2026).
// So above the car limit a van's or ute's GST credit is not decided here.
test('the ATO’s LCT compliance approach does not lift the GST credit cap', () => {
  const year = vehicleYears['2026-27'];
  for (const fields of [{ body: 'van', seats: '3', gvm: '3000', kerb: '2100' }, { body: 'dual-cab', gvm: '3000', kerb: '2040' }]) {
    const over = calculations.vehicleClass(vehicle({ ...fields, cost: '90000' }), year);
    assert.deepEqual([over.luxury, over.capApplies, over.credit], ['commercial', null, null], fields.body);
    // Within the car limit the credit is the GST in the price, capped or not.
    assert.equal(calculations.vehicleClass(vehicle({ ...fields, cost: '60000' }), year).credit, 5454.55, fields.body);
  }
  // Section 69-10 reaches only a car: a van carrying 1 tonne takes the whole GST as its credit.
  const truck = calculations.vehicleClass(vehicle({ body: 'van', seats: '3', gvm: '3000', kerb: '2000', cost: '90000' }), year);
  assert.deepEqual([truck.car, truck.capApplies, truck.credit], [false, false, 8181.82]);
});

// LCTD 2023/1, read 17 November 2026: paragraph 55 takes the simplified method's load carrying capacity as 'the
// difference between the GVM and the unladen mass', with 'all options fitted', and paragraph 56 adds 'If the
// vehicle has been fitted with accessories at the time of supply, then the weight of those accessories must be
// taken into account'. MT 2024 paragraph 11's basic kerb weight is without them, so they come off the load for
// luxury car tax only.
test('accessories fitted at supply come off the load for LCTD 2023/1’s simplified method only', () => {
  const year = vehicleYears['2026-27'];
  // 5 seats are 340 kg: a 690 kg load is more than twice that, 690 kg less 20 kg of accessories is not.
  const ute = (accessories) => calculations.vehicleClass(vehicle({ body: 'dual-cab', kerb: '2310', cost: '90000', accessories }), year);
  assert.deepEqual([ute('0').luxury, ute('20').luxury], ['commercial', 'undetermined']);
  assert.deepEqual([ute('20').load, ute('20').passengers, ute('20').fbt], [690, false, '8(2)(a)(ii)']);
  for (const [accessories, message] of [['690', 'The accessories fitted at supply must weigh less than the designed load.'],
    ['1.5', 'Enter a whole number between 0 and 100000.'], ['', 'Enter a number using digits only.']]) {
    assert.throws(() => ute(accessories), { message }, accessories);
  }
});

// Each test turns on one edge: a load of 1 tonne (s 995-1) or 2 tonnes (LCT Act s 27-1), 9 seats, MT 2024's
// 'exceeds the remaining load', LCTD 2023/1's 'less than 50%', a price over the threshold or the car limit.
test('the vehicle classifier changes its answer at each edge the law sets', () => {
  const year = vehicleYears['2026-27'];
  const at = (fields) => calculations.vehicleClass(vehicle(fields), year);
  assert.deepEqual([at({ kerb: '2001' }).car, at({ kerb: '2000' }).car], [true, false]);
  assert.deepEqual([at({ kerb: '1001', cost: '90000' }).luxury, at({ kerb: '1000', cost: '90000' }).luxury], ['over', 'not-a-car']);
  assert.deepEqual([at({ seats: '8' }).car, at({ seats: '9' }).car, at({ seats: '9' }).fbt], [true, false, '47(6)']);
  // 5 seats are 340 kg: a 679 kg load leaves 339 kg, 680 kg leaves 340 kg.
  assert.deepEqual([at({ body: 'dual-cab', kerb: '2321' }).passengers, at({ body: 'dual-cab', kerb: '2320' }).passengers], [true, false]);
  // LCTD 2023/1's simplified method needs 340 kg below half the load: 681 kg is, 680 kg is not.
  assert.deepEqual([at({ body: 'dual-cab', kerb: '2319', cost: '90000' }).luxury, at({ body: 'dual-cab', kerb: '2320', cost: '90000' }).luxury],
    ['commercial', 'undetermined']);
  assert.deepEqual([at({ fuel: 'efficient', cost: '91661' }).luxury, at({ fuel: 'efficient', cost: '91661.01' }).over], ['under', 0.01]);
  assert.deepEqual([at({ cost: '80809.01' }).luxury, at({ cost: '80809.01', fuel: 'efficient' }).luxury], ['over', 'under']);
  // At the car limit the GST in the price is already 1/11 of it; a cent over, the cap holds the credit.
  assert.deepEqual([at({ cost: '69883' }).credit, at({ cost: '69883.01' }).credit], [6353, 6353]);
  assert.deepEqual([at({ cost: '69883' }).cost, at({ cost: '69883.11' }).cost], [63530, 63530.11]);
  // An undecided LCT design leaves the credit undecided only above the car limit.
  assert.deepEqual([at({ body: 'dual-cab', kerb: '2320', cost: '69883' }).credit, at({ body: 'dual-cab', kerb: '2320', cost: '69883.01' }).credit],
    [6353, null]);
  assert.equal(at({ body: 'motorcycle', seats: '1', gvm: '400', kerb: '220' }).car, false);
});

test('a stated payload stands alone or agrees with the mass and kerb weight', () => {
  const year = vehicleYears['2026-27'];
  assert.equal(calculations.vehicleClass(vehicle({ kerb: '0', payload: '865' }), year).load, 865);
  assert.equal(calculations.vehicleClass(vehicle({ payload: '865' }), year).load, 865);
});

// The page takes private use as the user's statement and never concludes it: the statement moves only the exemption.
test('the stated private use changes only whether an eligible vehicle is exempt', () => {
  const year = vehicleYears['2026-27'];
  for (const fields of [{ body: 'van', seats: '3' }, { seats: '9' }, { body: 'passenger' }]) {
    const limited = calculations.vehicleClass(vehicle({ ...fields, use: 'limited' }), year);
    const other = calculations.vehicleClass(vehicle({ ...fields, use: 'other' }), year);
    assert.deepEqual({ ...limited, exempt: null }, { ...other, exempt: null }, JSON.stringify(fields));
    assert.deepEqual([limited.exempt, other.exempt], [limited.fbt !== 'car-benefit', false], JSON.stringify(fields));
  }
});

test('the vehicle classifier refuses a specification it cannot classify', () => {
  const year = vehicleYears['2026-27'];
  for (const [fields, message] of [
    [{ kerb: '3000' }, 'The kerb weight and the payload must each be less than the gross vehicle mass.'],
    [{ kerb: '0', payload: '3000' }, 'The kerb weight and the payload must each be less than the gross vehicle mass.'],
    [{ kerb: '0' }, 'Enter the kerb weight or the payload.'],
    [{ payload: '866' }, 'The payload is not the gross vehicle mass less the kerb weight: check the specification.'],
    [{ modified: 'unplated' }, 'A modified vehicle is classified on its manufacturer’s figures from the compliance plate; '
      + 'without them this page cannot classify it.'],
    [{ body: 'other' }, 'Whether this body was designed principally to carry passengers turns on its appearance, '
      + 'marketing and specifications (TD 94/19), which this page does not weigh.'],
    [{ body: 'bus' }, 'Choose the body type.'],
    [{ modified: 'yes' }, 'Say whether the vehicle was modified.'],
    [{ credit: 'part' }, 'Say whether a full GST credit is claimed.'],
    [{ fuel: 'hybrid' }, 'Choose the fuel consumption.'],
    [{ use: 'minor' }, 'Choose the private use you state.'],
    [{ seats: '0' }, 'Enter a whole number between 1 and 99.'],
    [{ seats: '5.5' }, 'Enter a whole number between 1 and 99.'],
    [{ gvm: '2500.5' }, 'Enter a whole number between 1 and 100000.'],
    [{ cost: '0' }, 'Enter a price above nil.'],
  ]) {
    assert.throws(() => calculations.vehicleClass(vehicle(fields), year), { message }, JSON.stringify(fields));
  }
  // A body other than a passenger body, ute, van or motor cycle is classified once it is not a car.
  assert.equal(calculations.vehicleClass(vehicle({ body: 'other', kerb: '1000' }), year).fbt, '47(6)');
  assert.equal(calculations.vehicleClass(vehicle({ body: 'other', kerb: '1500', cost: '90000' }), year).luxury, 'undetermined');
});

// One radio for each of the 7 states and territories that levy land tax, in the transfer duty
// order; the page says the Northern Territory has none.
test('land tax radios carry a scale for each of the 7 jurisdictions that levy land tax', () => {
  assert.equal(landTaxRadios.length, (landTaxHtml.match(/name="jurisdiction"/g) ?? []).length);
  // One checked radio for each group: the jurisdiction, the rates and a foreign or absentee owner.
  assert.equal((landTaxHtml.match(/ checked /g) ?? []).length, 3);
  assert.deepEqual(landTaxRadios.map(({ code }) => code), Object.keys(PLACES).filter((code) => code !== 'AU-NT'));
  for (const { code, label, data } of landTaxRadios) {
    assert.equal(label, data.name);
    assert.equal(PLACES[code], data.name);
  }
  // Which jurisdiction has which rule, as read on 16 November 2026.
  const holding = (key) => landTaxRadios.filter(({ data }) => key in data).map(({ code }) => code);
  assert.deepEqual(holding('fixed'), ['AU-ACT']);
  assert.deepEqual(holding('trustScale'), ['AU-NSW', 'AU-VIC', 'AU-QLD', 'AU-SA']);
  assert.deepEqual(holding('absenteeScale'), ['AU-QLD']);
  assert.deepEqual(holding('surcharge'), ['AU-NSW', 'AU-VIC', 'AU-QLD', 'AU-TAS', 'AU-ACT']);
  assert.deepEqual(holding('trustSurcharge'), ['AU-VIC']);
  assert.deepEqual(holding('surchargeBase'), ['AU-NSW', 'AU-TAS']);
  assert.deepEqual(holding('mrit'), ['AU-WA']);
  assert.deepEqual(landTaxRadios.flatMap(({ data }) => Object.keys(data)).filter((key, index, keys) => keys.indexOf(key) === index).sort(),
    ['absenteeScale', 'fixed', 'mrit', 'name', 'scale', 'surcharge', 'surchargeBase', 'trustScale', 'trustSurcharge']);
  assert.equal(landTaxPlaces['AU-ACT'].data.fixed, '1778');
  assert.match(landTaxHtml, /The Northern Territory has no land tax\./);
  // Each scale's land tax year, and RevenueSA's $20 rule, are stated on the page.
  assert.match(landTaxHtml, /the 2026 calendar year in New South Wales and Victoria, and the 2026-27 financial year in Queensland, Western Australia, South Australia, Tasmania and the Australian Capital Territory\./);
  assert.match(landTaxHtml, /RevenueSA issues no assessment where the calculated land tax is under \$20/);
  // The indexes describe what the page computes: trust rates and surcharges, not only the general scale.
  for (const index of ['../llms.txt', '../.well-known/llms.txt', '../tools/business-calculators/index.html']) {
    const entry = readFileSync(new URL(index, import.meta.url), 'utf8').split('\n').find((line) => line.includes('/land-tax/'));
    assert.match(entry, /at the general or trust rates, with a foreign or absentee owner surcharge and WA.s metropolitan region improvement tax where chosen, before any exemption\./, index);
  }
});

// Worked by hand from the rates read on 16 November 2026: each surcharge and MRIT starts at its
// first value, and a refused choice is named rather than taxed at another scale.
test('land tax applies trust rates, surcharges and MRIT from their first value and refuses what it cannot compute', () => {
  const year = (value, place, choices) => calculations.landTaxYear(...landTaxArgs([value, place, choices]));
  const parts = ({ tax, surcharge, mrit, total }) => [tax, surcharge, mrit, total];
  for (const [value, place, choices, expected] of [
    // NSW special trust: 1.6% from the first dollar, 2% above $6,571,000.
    ['1', 'AU-NSW', { trust: true }, [0.02, 0, 0, 0.02]], ['6571000', 'AU-NSW', { trust: true }, [105136, 0, 0, 105136]],
    ['6571001', 'AU-NSW', { trust: true }, [105136.02, 0, 0, 105136.02]],
    // NSW surcharge: 5% of the surcharge value even with no land tax.
    ['0', 'AU-NSW', { foreign: true, surchargeValue: '500000' }, [0, 25000, 0, 25000]],
    // Victorian trust surcharge rates: $82 from $25,000, and 1.1072% of $1,199,999 is 13,286.388928 dollars.
    ['24999', 'AU-VIC', { trust: true }, [0, 0, 0, 0]], ['25000', 'AU-VIC', { trust: true }, [82, 0, 0, 82]],
    ['2999999', 'AU-VIC', { trust: true }, [31649.39, 0, 0, 31649.39]],
    // Victorian absentee owner surcharge: 4% of the whole value from $50,000, or from $25,000 at trust rates.
    ['49999', 'AU-VIC', { foreign: true }, [0, 0, 0, 0]], ['50000', 'AU-VIC', { foreign: true }, [500, 2000, 0, 2500]],
    ['25000', 'AU-VIC', { trust: true, foreign: true }, [82, 1000, 0, 1082]],
    // Queensland: the absentee rates and 3% over $350,000; a foreign company or trustee pays the company rates.
    ['350000', 'AU-QLD', { foreign: true }, [1450, 0, 0, 1450]],
    ['10000000', 'AU-QLD', { foreign: true }, [175000, 289500, 0, 464500]],
    ['10000000', 'AU-QLD', { trust: true, foreign: true }, [187500, 289500, 0, 477000]],
    // WA MRIT: nil to $300,000, then 0.14 cents a dollar, so $4 over is 0.56 cents, which rounds to 1 cent.
    ['300000', 'AU-WA', { metro: true }, [0, 0, 0, 0]], ['300004', 'AU-WA', { metro: true }, [300, 0, 0.01, 300.01]],
    // South Australian trust rates: $125 plus 50 cents for each $100 or part over $25,000.
    ['25000', 'AU-SA', { trust: true }, [0, 0, 0, 0]], ['25001', 'AU-SA', { trust: true }, [125.5, 0, 0, 125.5]],
    ['936001', 'AU-SA', { trust: true }, [4681, 0, 0, 4681]],
    // Tasmania: 2% of the surcharge value, whatever the land tax value.
    ['600000', 'AU-TAS', { foreign: true, surchargeValue: '0' }, [3237.5, 0, 0, 3237.5]],
    // The ACT: 0.75% of $1 is 0.75 cents, so 1 cent.
    ['1', 'AU-ACT', { foreign: true }, [1778.01, 0.01, 0, 1778.02]],
  ]) {
    assert.deepEqual(parts(year(value, place, choices)), expected, `${place} ${value} ${JSON.stringify(choices)}`);
  }
  for (const [place, choices, message] of [
    ['AU-WA', { trust: true }, 'This calculator has no trust rates for Western Australia.'],
    ['AU-TAS', { trust: true }, 'This calculator has no trust rates for Tasmania.'],
    ['AU-SA', { foreign: true }, 'This calculator has no foreign or absentee owner rates for South Australia.'],
    ['AU-WA', { foreign: true }, 'This calculator has no foreign or absentee owner rates for Western Australia.'],
    ['AU-NSW', { metro: true }, 'The metropolitan region improvement tax applies only in Western Australia.'],
    ['AU-NSW', { foreign: true }, 'Enter the surcharge value as a whole number between 0 and 1000000000.'],
    ['AU-TAS', { foreign: true, surchargeValue: '1.5' }, 'Enter the surcharge value as a whole number between 0 and 1000000000.'],
  ]) {
    assert.throws(() => year('1000000', place, choices), { message }, `${place} ${JSON.stringify(choices)}`);
  }
});

// Worked by hand from the scales read on 16 November 2026: a band applies from its first value.
test('land tax applies a band from its first value, adds the ACT fixed charge and rejects a broken table', () => {
  const tax = (value, place) => calculations.landTaxYear(...landTaxArgs([value, place])).tax;
  for (const [value, place, expected] of [
    // Victoria: nil below $50,000, a flat $500, then $975 to $299,999 and $1,350 + 0.3% from $300,000.
    ['49999', 'AU-VIC', 0], ['50000', 'AU-VIC', 500], ['299999', 'AU-VIC', 975], ['300010', 'AU-VIC', 1350.03],
    // Queensland: $600,000 itself pays $500.
    ['599999', 'AU-QLD', 0], ['600000', 'AU-QLD', 500],
    // Western Australia: nil to $300,000, then a flat $300 to $420,000.
    ['300000', 'AU-WA', 0], ['300001', 'AU-WA', 300], ['420000', 'AU-WA', 300], ['420001', 'AU-WA', 300],
    // New South Wales: $100 + 1.6% of $1 above the threshold, and 2% above the premium threshold.
    ['1075001', 'AU-NSW', 100.02], ['6571000', 'AU-NSW', 88036], ['6571001', 'AU-NSW', 88036.02],
    // South Australia: $1 over a band's threshold is a whole $100 at that band's rate.
    ['1504001', 'AU-SA', 2841], ['3504001', 'AU-SA', 36002.4],
    // Tasmania: $125,000 itself pays $50, and $500,000 pays $1,737.50.
    ['124999', 'AU-TAS', 0], ['125000', 'AU-TAS', 50], ['500000', 'AU-TAS', 1737.5],
    // The ACT: the $1,778 fixed charge at any value, and 0.54% of $1 is 0.54 cents, so 1 cent.
    ['0', 'AU-ACT', 1778], ['1', 'AU-ACT', 1778.01], ['150000', 'AU-ACT', 2588], ['2000001', 'AU-ACT', 24878.01],
  ]) {
    assert.equal(tax(value, place), expected, `${place} ${value}`);
  }
  const nswData = landTaxPlaces['AU-NSW'].data;
  const nsw = nswData.scale.split(';').map((row) => row.split(','));
  const withScale = (rows) => ({ ...nswData, scale: rows.map((row) => row.join(',')).join(';') });
  assert.throws(() => calculations.landTaxYear('-1', nswData), { message: 'Enter a whole number between 0 and 1000000000.' });
  for (const broken of [[], nsw.slice(1), [nsw[0], nsw[2], nsw[1]], [nsw[0], ['1075001', '100', '1.6', '1075002', 'excess']],
    [nsw[0], ['1075000.5', '100', '1.6', '1075000', 'excess']], [nsw[0], ['1075001', '100', '1.6', '1075000', 'whole-value']],
    [nsw[0], ['1075001', '100', '1.60001', '1075000', 'excess']],
    // A malformed base or an extra field is refused in any band, not only the one a value falls in.
    [nsw[0], ['1075001', 'bad', '1.6', '1075000', 'excess'], nsw[2]], [nsw[0], nsw[1], ['6571001', '88036.001', '2', '6571000', 'excess']],
    [nsw[0], ['1075001', '100', '1.6', '1075000', 'excess', 'extra'], nsw[2]], [['0', '0', '0', '0', 'excess', ''], nsw[1], nsw[2]],
    // A rate over 100% or a base over the helpers' $1,000,000,000 is refused in any band too.
    [nsw[0], ['1075001', '100', '101', '1075000', 'excess'], nsw[2]], [nsw[0], ['1075001', '1000000001', '1.6', '1075000', 'excess'], nsw[2]]]) {
    for (const value of ['500', '2000000', '9000000']) {
      assert.throws(() => calculations.landTaxYear(value, withScale(broken)), { message: 'This jurisdiction’s rate table is not usable.' },
        `${JSON.stringify(broken)} ${value}`);
    }
  }
  for (const choice of ['trust', 'foreign', 'metro']) {
    for (const flag of ['false', 0, null]) {
      assert.throws(() => calculations.landTaxYear('2000000', nswData, { [choice]: flag }),
        { message: 'Trust rates, a foreign or absentee owner and the metropolitan region must each be true or false.' }, `${choice} ${flag}`);
    }
  }
});

// Payroll tax for 2026-27. The engine's table must be the page's data file, row for row: each
// item is a figure, and each 'rate' row a rate with the Australian wages it applies above.
const payrollTaxCsv = readFileSync(new URL('../tools/business-calculators/payroll-tax/payroll-tax-rates.csv', import.meta.url), 'utf8');
const payrollTaxHtml = readFileSync(new URL('../_includes/calculators/payroll-tax.html', import.meta.url), 'utf8');
const payrollTax = (wages, australian, place) => calculations.payrollTax(wages, australian, place);
const PAYROLL_TAX_PLACES = { ...PLACES, 'AU-VIC-REGIONAL': 'Victoria, regional employer' };
Object.assign(INPUTS, { payrollTax: (wages, australian, place) =>
  `${PAYROLL_TAX_PLACES[place]}, wages ${dollars(Number(wages))}, Australian wages ${dollars(Number(australian || wages))}` });
Object.assign(FORM_CALLS, { payrollTax: (f) => [f.wages, f.australian, f.jurisdiction] });
Object.assign(ENGINE_LABELS, { payrollTax: { deduction: 'deduction', taxable: 'taxable amount', tax: 'payroll tax',
  levy: 'first surcharge or levy', extraLevy: 'second surcharge or levy', total: 'total' } });

test('the payroll tax table is the page’s data file, with a source and dates for every figure', () => {
  const [header, ...lines] = payrollTaxCsv.trim().split(/\r?\n/).map((line) => (assert.ok(!line.includes('"')), line.split(',')));
  assert.deepEqual(header, ['employer', 'item', 'value', 'wages_over', 'in_force_from', 'provision', 'notes', 'source_url', 'checked_at']);
  const law = {};
  for (const [employer, item, value, over, from, provision, , url, checked] of lines) {
    assert.match(from, /^\d{4}-\d{2}-\d{2}$/, `${employer} ${item}`);
    assert.ok(from <= '2026-07-01' && provision && /^https:\/\//.test(url) && checked === '2026-11-17', `${employer} ${item}`);
    const entry = (law[employer] ??= employer === 'AU-VIC-REGIONAL' ? { ...law['AU-VIC'], rates: [] } : { rates: [] });
    if (item === 'rate') entry.rates.push([over, value]);
    else entry[item.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  assert.deepEqual(law, PAYROLL_TAX_2026_27);
  const radios = [...payrollTaxHtml.matchAll(/<input type="radio" name="jurisdiction" value="([^"]+)"/g)].map(([, code]) => code);
  assert.deepEqual(radios, Object.keys(PAYROLL_TAX_2026_27));
});

// Published examples, read 17 November 2026. Revenue NSW, thresholds and rates: 'NSW wages
// (employed for 365 days) $1,500,000 ... Payroll tax calculated on $300,000'; '$1,200,000 x
// ($900,000 ÷ $3,000,000) = $360,000'.
test('payroll tax agrees with Revenue NSW’s examples', () => {
  assert.deepEqual(payrollTax('1500000', '', 'AU-NSW'), payrollTax('1500000', '1500000', 'AU-NSW'));
  assert.deepEqual([payrollTax('1500000', '', 'AU-NSW').taxable, payrollTax('1500000', '', 'AU-NSW').tax], [300000, 16350]);
  assert.equal(payrollTax('900000', '3000000', 'AU-NSW').deduction, 360000);
});

// SRO Victoria, payroll tax surcharges, example 2 (2025-26, the same thresholds): $80 million in
// Victoria and $70 million in NSW give thresholds of '$5,333,333.33' and '$53,333,333.33'; each
// surcharge is 0.5% of Victorian wages above each. Threshold and phase-out rate, example 1, says
// the full-year Victoria-only deduction is '$5 million minus their wage bill multiplied by the
// phase-out rate': here ($5,000,000 - $4,200,000) x 50% = $400,000, and $3,800,000 at 4.85%.
test('payroll tax agrees with the Victorian State Revenue Office’s examples', () => {
  const surcharge = Math.round(((80000000 - 5333333.33) * 0.005 + (80000000 - 53333333.33) * 0.005) * 100) / 100;
  const big = payrollTax('80000000', '150000000', 'AU-VIC');
  assert.deepEqual([big.deduction, big.tax, big.levy, big.extraLevy], [0, 3880000, surcharge, surcharge]);
  assert.equal(big.total, 3880000 + 2 * surcharge);
  assert.deepEqual([payrollTax('4200000', '', 'AU-VIC').deduction, payrollTax('4200000', '', 'AU-VIC').tax], [400000, 184300]);
  assert.equal(payrollTax('4200000', '', 'AU-VIC-REGIONAL').tax, 46075);
});

// Queensland Revenue Office, payroll tax deductions (example image AD-July-2023.png): Queensland
// wages $1,356,789 and Australian wages $1,789,776 give an annual deduction of $932,460 to the dollar.
test('payroll tax agrees with the Queensland Revenue Office’s deduction example', () => {
  const qld = payrollTax('1356789', '1789776', 'AU-QLD');
  assert.equal(Math.round(qld.deduction), 932460);
  assert.deepEqual([qld.deduction, qld.taxable, qld.tax], [932459.64, 424329.36, 20155.64]);
});

// RevenueWA, payroll tax employer guide (updated 2 June 2026): annual wages of $1,104,000 give
// '$6,600'. Its local example ($1,200,000: deduction '$969,231', tax '$12,692.30') and interstate
// example ($1,000,000 in WA of $4,000,000: '$134,616', '$47,596.12') round the deduction to the
// dollar first; the Act sets no rounding, so this calculator keeps the cents.
test('payroll tax agrees with RevenueWA’s examples', () => {
  assert.deepEqual(payrollTax('1104000', '', 'AU-WA'), payrollTax('1104000', '1104000', 'AU-WA'));
  assert.deepEqual([payrollTax('1104000', '', 'AU-WA').deduction, payrollTax('1104000', '', 'AU-WA').tax], [984000, 6600]);
  assert.deepEqual([payrollTax('1200000', '', 'AU-WA').deduction, payrollTax('1200000', '', 'AU-WA').tax], [969230.77, 12692.31]);
  assert.deepEqual([payrollTax('1000000', '4000000', 'AU-WA').deduction, payrollTax('1000000', '4000000', 'AU-WA').tax],
    [134615.38, 47596.15]);
});

// RevenueSA, Guide to Legislation 2026-27 (version 2026-27.01): '$800,000' of '$1,600,000' gives a
// deduction of '$300,000' and '$500,000' of '$2,000,000' '$150,000'. Sch 1 cl 5(2) gives 2.475% at
// $1,600,000; the guide's rate table cuts it to 2.47%.
test('payroll tax agrees with RevenueSA’s deduction examples and the Act’s phased rate', () => {
  assert.deepEqual([payrollTax('500000', '2000000', 'AU-SA').deduction, payrollTax('500000', '2000000', 'AU-SA').tax], [150000, 17325]);
  const phased = payrollTax('800000', '1600000', 'AU-SA');
  assert.deepEqual([phased.deduction, phased.tax, phased.lines[0].rate], [300000, 12375, '2.475%']);
  assert.equal(payrollTax('1560000', '', 'AU-SA').lines[0].rate, '1.485%');
  assert.equal(payrollTax('1512345.67', '', 'AU-SA').lines[0].rate, 'about 0.3056%');
});

// SRO Tasmania, annual adjustment return guideline (2025-26, the same thresholds and rates):
// example 1, $2,400,000 in Tasmania only, '$30,000' + '$24,400' = '$54,400'; example 2,
// $2,400,000 of $3,000,000, '$24,000' + '$48,800' = '$72,800'.
test('payroll tax agrees with the Tasmanian State Revenue Office’s examples', () => {
  const only = payrollTax('2400000', '', 'AU-TAS');
  assert.deepEqual([only.lines.map((line) => line.amount), only.tax], [[30000, 24400], 54400]);
  const shared = payrollTax('2400000', '3000000', 'AU-TAS');
  assert.deepEqual([shared.deduction, shared.lines.map((line) => [line.on, line.amount]), shared.tax],
    [1000000, [[600000, 24000], [800000, 48800]], 72800]);
});

// No numeric example is published by the ACT Revenue Office or, on a page that could be read, the
// Territory Revenue Office; these are worked by hand from the Acts. ACT: $3,000,000 less $1,750,000
// at 6.75% is $84,375; $25,000,000 of $30,000,000 has a deduction of $1,458,333.33 and 6.85% on
// $23,541,666.67 is $1,612,604.17. NT: $3,000,000 has a deduction of $2,500,000 less half of
// $500,000, $2,250,000, and 5.5% of $750,000 is $41,250.
test('payroll tax in the ACT and the Northern Territory agrees with examples worked from the Acts', () => {
  assert.deepEqual([payrollTax('3000000', '', 'AU-ACT').deduction, payrollTax('3000000', '', 'AU-ACT').tax], [1750000, 84375]);
  assert.deepEqual([payrollTax('25000000', '30000000', 'AU-ACT').deduction, payrollTax('25000000', '30000000', 'AU-ACT').tax],
    [1458333.33, 1612604.17]);
  assert.deepEqual([payrollTax('3000000', '', 'AU-NT').deduction, payrollTax('3000000', '', 'AU-NT').tax], [2250000, 41250]);
});

test('payroll tax thresholds, tapers and rate bands meet at their edges', () => {
  const tax = (wages, place, all = '') => payrollTax(wages, all, place);
  // South Australia's threshold is not its deduction: no tax to $1,500,000, a $600,000 deduction.
  for (const [place, threshold, deduction = threshold] of [['AU-NSW', '1200000'], ['AU-VIC', '1000000'], ['AU-QLD', '1300000'],
    ['AU-WA', '1000000'], ['AU-SA', '1500000', '600000'], ['AU-TAS', '1250000'], ['AU-ACT', '1750000'], ['AU-NT', '2500000']]) {
    assert.deepEqual([tax(threshold, place).deduction, tax(threshold, place).total], [Number(deduction), 0], place);
    assert.equal(tax('0', place, '0').total, 0, place);
  }
  // Each deduction reaches nil: Victoria at $5m, Queensland at $10.4m, WA at $7.5m, NT at $7.5m.
  for (const [place, wages] of [['AU-VIC', '5000000'], ['AU-QLD', '10400000'], ['AU-WA', '7500000'], ['AU-NT', '7500000']]) {
    assert.equal(tax(wages, place).deduction, 0, place);
    assert.ok(tax(String(Number(wages) - 7), place).deduction > 0, place);
  }
  assert.equal(tax('3000000', 'AU-VIC').deduction, 1000000);
  assert.deepEqual([tax('6500000', 'AU-QLD').lines[0].rate, tax('6500000.01', 'AU-QLD').lines[0].rate], ['4.75%', '4.95%']);
  assert.deepEqual([tax('20000000', 'AU-ACT').lines[0].rate, tax('20000000.01', 'AU-ACT').lines[0].rate], ['6.75%', '6.85%']);
  assert.deepEqual([tax('150000000', 'AU-ACT').lines[0].rate, tax('150000000.01', 'AU-ACT').lines[0].rate], ['7.85%', '8.75%']);
  assert.deepEqual([tax('99999999.99', 'AU-NT').lines[0].rate, tax('100000000', 'AU-NT').lines[0].rate], ['5.5%', '6.5%']);
  assert.deepEqual([tax('1500000.01', 'AU-SA').tax, tax('1700000', 'AU-SA').lines[0].rate, tax('1700000.01', 'AU-SA').lines[0].rate],
    [0, '4.95%', '4.95%']);
  assert.deepEqual([tax('1200000', 'AU-SA').deduction, tax('1200000', 'AU-SA').lines[0].rate, tax('1200000', 'AU-SA').total],
    [600000, '0%', 0]);
  assert.deepEqual([tax('500000', 'AU-SA').deduction, tax('500000', 'AU-SA').total], [500000, 0]);
  assert.deepEqual(tax('2000000', 'AU-TAS').lines.map((line) => line.on), [750000, 0]);
  // 0.25% of $400 above $10m is $1; nothing above $100m until wages pass it.
  assert.deepEqual([tax('10000000', 'AU-QLD').levy, tax('10000400', 'AU-QLD').levy, tax('100000000', 'AU-QLD').extraLevy], [0, 1, 0]);
  // Victoria above $100m: 0.5% of $90,000,100 and of $100, $450,000.50 + $0.50.
  assert.deepEqual([tax('10000000', 'AU-VIC').levy, tax('100000100', 'AU-VIC').levy], [0, 450001]);
});

test('payroll tax refuses wages it cannot work', () => {
  for (const [wages, australian, place, message] of [
    ['-1', '', 'AU-NSW', 'Enter an amount between 0 and 100000000000.'],
    ['1000', '-1', 'AU-NSW', 'Enter an amount between 0 and 100000000000.'],
    ['100000000000.01', '', 'AU-NSW', 'Enter an amount between 0 and 100000000000.'],
    ['', '', 'AU-NSW', 'Enter a number using digits only.'],
    ['NaN', '', 'AU-NSW', 'Enter a number using digits only.'],
    ['1500000.001', '', 'AU-NSW', 'Enter a number with no more than 2 decimal places.'],
    ['2000000', '1999999.99', 'AU-NSW', 'Enter total Australian wages of at least the wages in the state or territory.'],
    ['1500000', '', 'AU-VIC-METRO', 'Choose a state or territory.'],
    ['1500000', '', 'toString', 'Choose a state or territory.'],
  ]) {
    assert.throws(() => payrollTax(wages, australian, place), { message }, `${wages} ${australian} ${place}`);
  }
});

test('the payroll tax page opens on the result its calculation gives for the form’s inputs', () => {
  const example = payrollTaxHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const fields = formDefaults(payrollTaxHtml);
  const result = calculations.payrollTaxResult(fields.wages, fields.australian, fields.jurisdiction, aud);
  assert.equal(result.inputs, example[1]);
  assert.equal(result.rows.map((row) => row.join('|')).join(';'), example[2]);
  assert.equal(String(result.principal), example[3]);
  assert.equal(result.note, example[4]);
});
