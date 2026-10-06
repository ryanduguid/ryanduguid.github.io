import assert from 'node:assert/strict';
import test from 'node:test';
import * as calculations from '../assets/business-calculators.mjs';
import { gst, businessUse, margin, breakEven, hourlyRate, variance, loan,
  staffCost, cashForecast } from '../assets/business-calculators.mjs';

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
  assert.throws(() => breakEven('1000', '18', '18'));
  assert.throws(() => breakEven('1000', '17', '18'));
  assert.throws(() => breakEven('1000000000', '1000000000', '999999999.99'));
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
});

test('blank, non-finite, over-precise and unsafe amounts cannot become a zero result', () => {
  for (const value of ['', ' ', 'NaN', 'Infinity', '1e10', '100.001', '-1', '1000000001', null]) {
    assert.throws(() => gst(value, false), String(value));
  }
});
