// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as calculations from '../assets/business-calculators.mjs';
import { DIVISION_296_LIABILITY } from '../assets/division-296.mjs';
import { PAYROLL_TAX_2026_27 } from '../assets/payroll-tax.mjs';
import { gst, businessUse, margin, breakEven, hourlyRate, variance, financeSchedule, interestByIncomeYear,
  staffCost, cashForecast, div7aMinimumRepayment, transferDuty, firstHomeDuty } from '../assets/business-calculators.mjs';
import { EV_EXEMPT_NOTE, fbtBenefitResult, fbtEvResult } from '../assets/fbt-benefit-forms.mjs';
import { FUEL_EFFICIENT_THRESHOLDS } from '../assets/fbt-ev-exemption.mjs';
import { COMPANY_TAX_LAW } from '../assets/company-tax.mjs';
import { FOREIGN_SURCHARGES } from '../assets/foreign-surcharge.mjs';
import { BUSINESS_DAY_PLACES, BUSINESS_DAYS_COVERAGE, STATE_ONLY_HOLIDAYS } from '../assets/business-days.mjs';

test('finite-decimal calculations round half cents up without binary drift', () => {
  assert.equal(businessUse('20.15', '50').share, 10.08);
  assert.equal(businessUse('4.27', '50').share, 2.14);
  assert.equal(businessUse('999999999.99', '99.99').share, 999899999.99);
  assert.equal(hourlyRate('20.15', '0', '2').rate, 10.08);
  assert.equal(hourlyRate('1000000000', '1000000000', '0.01').rate, 200000000000);
  assert.equal(staffCost('51.30', '0', '0').monthly, 4.28);
  assert.equal(finance({ amount: '20.15', rate: '0', payments: '2', balloon: '0' }).payment, 10.08);
  assert.equal(finance({ amount: '201.50', rate: '60', payments: '12', balloon: '0' }).rows[0].interest, 10.08);
});

// A finance schedule's terms: the page's opening example, $60,000.00 at 7.5% over 60 monthly
// payments in arrears from 1 July 2026 with an $18,000.00 balloon, changed as a case needs.
const OPENING_TERMS = { solve: 'payment', amount: '60000', rate: '7.5', payments: '60', payment: '1000', balloon: '18000',
  balloonKind: 'amount', frequency: 'monthly', timing: 'arrears', start: '2026-07-01' };
/** @param {Partial<typeof OPENING_TERMS>} changes */
const finance = (changes = {}) => financeSchedule({ ...OPENING_TERMS, ...changes });
/** The payment and the first row's interest and principal, in AUD. */
const firstSplit = (r) => ({ payment: r.payment, firstInterest: r.rows[0].interest, firstPrincipal: r.rows[0].principal });

test('a 30-year loan matches its cent-by-cent schedule: $599.55 a month and a last payment of $600.00', () => {
  const r = finance({ amount: '100000', rate: '6', payments: '360', balloon: '0' });
  assert.deepEqual(firstSplit(r), { payment: 599.55, firstInterest: 500, firstPrincipal: 99.55 });
  assert.deepEqual([r.finalPayment, r.totalInterest, r.rows.at(-1).closing], [600, 115838.45, 0]);
});

// Two-payment cases use P = B(1+r)^2/(2+r); longer terms use independent
// high-precision sums of discounted payments. Each result rounds separately, except the
// first principal: the rounded payment less the rounded interest, so the 3 add up.
for (const [[amount, rate, payments], expected] of [
  [['1000000000', '2.4788', '2'], { payment: 501549782.82, firstInterest: 2065666.67, firstPrincipal: 499484116.15 }],
  [['1000000000', '2.4789', '2'], { payment: 501549845.36, firstInterest: 2065750, firstPrincipal: 499484095.36 }],
  [['18.76', '1.28', '2'], { payment: 9.40, firstInterest: 0.02, firstPrincipal: 9.38 }],
  [['100.50', '12', '2'], { payment: 51.01, firstInterest: 1.01, firstPrincipal: 50 }],
  [['827222772.08', '56.9526', '297'], { payment: 39260447.40, firstInterest: 39260406.37, firstPrincipal: 41.03 }],
  [['1000000000', '0.0001', '600'], { payment: 1666708.40, firstInterest: 83.33, firstPrincipal: 1666625.07 }],
  [['1000000000', '100', '600'], { payment: 83333333.33, firstInterest: 83333333.33, firstPrincipal: 0 }],
]) {
  test(`a loan rounds its payment and first interest to the nearest cent for ${amount} / ${rate} / ${payments}`, () => {
    const r = finance({ amount, rate, payments, balloon: '0' });
    assert.deepEqual(firstSplit(r), expected);
    assert.equal(r.rows.at(-1).closing, 0);
  });
}

test('every row adds up, the balances run on and the schedule closes on the balloon', () => {
  // The generator is mulberry32. Each case is checked to the cent in integer arithmetic.
  let seed = 20261118;
  const next = (n) => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const c = (value) => Math.round(value * 100);
  const frequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual'];
  for (let i = 0; i < 600; i += 1) {
    const frequency = frequencies[next(5)];
    const amount = `${1 + next(10000000)}.${String(next(100)).padStart(2, '0')}`;
    const terms = { amount, rate: `${next(30)}.${String(next(10000)).padStart(4, '0')}`, frequency,
      payments: String(1 + next({ weekly: 520, fortnightly: 260, monthly: 120, quarterly: 40, annual: 10 }[frequency])),
      balloon: String(next(2) ? 0 : Math.floor(Number(amount) * next(50) / 100)), timing: next(2) ? 'arrears' : 'advance' };
    const label = JSON.stringify(terms);
    const r = finance(terms);
    let opening = c(r.amount);
    for (const row of r.rows) {
      assert.equal(c(row.opening), opening, label);
      assert.equal(c(row.interest) + c(row.principal), c(row.payment), label);
      assert.equal(c(row.opening) + c(row.interest) - c(row.payment), c(row.closing), label);
      opening = c(row.closing);
    }
    assert.ok(r.rows.slice(0, -1).every((row) => row.payment === r.payment), label);
    const last = r.balloonRow ?? r.rows.at(-1);
    assert.equal(c(last.closing), 0, label);
    if (terms.timing === 'arrears') assert.equal(c(r.rows.at(-1).closing), c(r.balloon), label);
    const interest = [...r.rows, ...(r.balloonRow ? [r.balloonRow] : [])].reduce((sum, row) => sum + c(row.interest), 0);
    assert.equal(interest, c(r.totalInterest), label);
    assert.equal(c(r.totalPaid), c(r.amount) + c(r.totalInterest), label);
  }
});

// Worked by hand: $1,000 at 12% a year is 1% a month. The payment is 1,000 x 0.01 x 1.01^3 /
// (1.01^3 - 1) = 10.30301 / 0.030301 = 340.0221..., so $340.02. Interest is 1% of each opening
// balance, half up: $10.00; 669.98 x 1% = 6.6998, $6.70; 336.66 x 1% = 3.3666, $3.37. The last
// payment is the balance and its interest, 336.66 + 3.37 = $340.03, and total interest $20.07.
test('a 3-payment loan matches the schedule worked by hand', () => {
  const r = finance({ amount: '1000', rate: '12', payments: '3', balloon: '0' });
  assert.deepEqual(r.rows.map(({ opening, payment, interest, principal, closing }) => [opening, payment, interest, principal, closing]), [
    [1000, 340.02, 10, 330.02, 669.98], [669.98, 340.02, 6.70, 333.32, 336.66], [336.66, 340.03, 3.37, 336.66, 0]]);
  assert.deepEqual(r.rows.map((row) => row.date), ['2026-08-01', '2026-09-01', '2026-10-01']);
  assert.deepEqual([r.totalInterest, r.balloonRow], [20.07, null]);
});

// Present value: the payments and balloon discounted at the rate. The australian-accounting
// hire-purchase-schedule command (australian-tax-calculators 1.0.0) gave this agreement an
// implicit monthly rate of 0.0058216536166952, a nominal 6.98598% a year, on 18 November 2026.
test('the solved rate discounts the payments and balloon back to the amount financed', () => {
  const r = finance({ solve: 'rate', amount: '50000', payment: '850', payments: '60', balloon: '10000', start: '2025-09-15' });
  assert.equal(r.rate, 6.986);
  const v = 1 / (1 + 0.0058216536166952);
  let worth = 10000 * v ** 60;
  for (let k = 1; k <= 60; k += 1) worth += 850 * v ** k;
  assert.ok(Math.abs(worth - 50000) < 0.005, String(worth));
  // The schedule keeps $850.00 to the last payment, which takes the cents of rounding.
  assert.deepEqual([r.payment, r.finalPayment, r.totalInterest], [850, 849.95, 10999.95]);
  // At the page's own 7.5% the schedule's payments, discounted, come back to $60,000.00 within half a
  // cent a payment: each period's interest is rounded once, and the last payment takes the rest.
  const own = finance();
  const w = 1 / (1 + 0.075 / 12);
  const flows = [...own.rows.map((row, k) => [row.payment, k + 1]), [own.balloon, 60]];
  assert.ok(Math.abs(flows.reduce((sum, [paid, k]) => sum + paid * w ** k, 0) - 60000) <= 0.005 * 60);
});

test('each frequency divides the annual rate by its payments a year and steps its dates', () => {
  // The first interest is the amount times the rate over the payments a year: $10,000 at 5.2% is
  // $10.00 a week and $20.00 a fortnight; at 8% a quarter is $200.00; at 10% a year $1,000.00.
  const cases = [['weekly', '5.2', '52', 10, ['2026-07-08', '2027-06-30']], ['fortnightly', '5.2', '26', 20, ['2026-07-15', '2027-06-30']],
    ['monthly', '12', '12', 100, ['2026-08-01', '2027-07-01']], ['quarterly', '8', '8', 200, ['2026-10-01', '2028-07-01']],
    ['annual', '10', '3', 1000, ['2027-07-01', '2029-07-01']]];
  for (const [frequency, rate, payments, first, dates] of cases) {
    const r = finance({ amount: '10000', rate, payments, balloon: '0', frequency });
    assert.equal(r.rows[0].interest, first, frequency);
    assert.deepEqual([r.rows[0].date, r.rows.at(-1).date], dates, frequency);
  }
  // A month-end start keeps to the month's last day where a month is shorter.
  assert.deepEqual(finance({ start: '2027-01-31', payments: '3', balloon: '0' }).rows.map((row) => row.date),
    ['2027-02-28', '2027-03-31', '2027-04-30']);
  // Each frequency stops at 50 years of payments.
  assert.throws(() => finance({ frequency: 'weekly', payments: '2601' }), /between 1 and 2600/);
  assert.throws(() => finance({ frequency: 'annual', payments: '51' }), /between 1 and 50/);
});

test('in advance the first payment carries no interest and the balloon falls a period after the last', () => {
  const arrears = finance();
  const advance = finance({ timing: 'advance' });
  assert.deepEqual(firstSplit(arrears), { payment: 954.09, firstInterest: 375, firstPrincipal: 579.09 });
  assert.deepEqual(firstSplit(advance), { payment: 948.17, firstInterest: 0, firstPrincipal: 948.17 });
  // 954.09 / 1.00625 = 948.16..., rounded half up from the exact payment.
  assert.deepEqual([advance.rows[0].date, advance.rows.at(-1).date, advance.balloonDate], ['2026-07-01', '2031-06-01', '2031-07-01']);
  assert.deepEqual([arrears.rows.at(-1).date, arrears.balloonDate], ['2031-07-01', '2031-07-01']);
  // The last payment leaves the balloon's value a month earlier, 18,000 / 1.00625 = 17,888.20; the
  // balloon row's interest is the other $111.80.
  assert.deepEqual([advance.rows.at(-1).closing, advance.balloonRow.interest, advance.balloonRow.payment], [17888.2, 111.8, 18000]);
  assert.deepEqual([arrears.balloonRow.opening, arrears.balloonRow.interest], [18000, 0]);
});

test('a balloon equal to the amount financed leaves interest only, and nil interest divides the balance', () => {
  const only = finance({ amount: '1000', rate: '12', payments: '12', balloon: '1000' });
  assert.ok(only.rows.every((row) => row.payment === 10 && row.principal === 0 && row.closing === 1000));
  assert.equal(only.totalInterest, 120);
  // In advance each payment is 1% discounted a month: 1,000 x 0.01 / 1.01 = 9.90.
  assert.equal(finance({ amount: '1000', rate: '12', payments: '12', balloon: '1000', timing: 'advance' }).payment, 9.9);
  assert.deepEqual(firstSplit(finance({ amount: '1200', rate: '0', payments: '12', balloon: '200', timing: 'advance' })),
    { payment: 83.33, firstInterest: 0, firstPrincipal: 83.33 });
  const nil = finance({ amount: '1200', rate: '0', payments: '12', balloon: '1200' });
  assert.deepEqual([nil.payment, nil.totalInterest, nil.balloonRow.payment], [0, 0, 1200]);
});

test('a percentage balloon is that share of the amount financed, rounded half up to the cent', () => {
  assert.deepEqual([finance({ balloon: '30', balloonKind: 'percent' }).balloon, finance().payment], [18000, 954.09]);
  assert.equal(finance({ amount: '100.05', balloon: '10', balloonKind: 'percent', payments: '1' }).balloon, 10.01);
  assert.throws(() => finance({ balloon: '100.01', balloonKind: 'percent' }), /between 0 and 100/);
});

test('the missing element: the amount financed, the number of payments and the rate', () => {
  // The amount financed is the payments and balloon discounted at 7.5%, rounded half up.
  assert.equal(finance({ solve: 'amount', payment: '954.09' }).amount, 59999.81);
  // With a percentage balloon the balloon is a share of the amount being found. A refusal here
  // is a wrong answer too, so it is compared rather than thrown.
  const attempt = (changes) => { try { return finance(changes); } catch (error) { return { refused: error.message }; } };
  const share = attempt({ solve: 'amount', payment: '954.09', balloon: '30', balloonKind: 'percent' });
  assert.deepEqual([share.amount, share.balloon], [59999.76, 17999.93]);
  // $1,202.28 a month repays $60,000.00 at 7.5% in 60 payments, the last $1,202.06.
  const term = finance({ solve: 'term', payment: '1202.28', balloon: '0' });
  assert.deepEqual([term.payments, term.finalPayment], [60, 1202.06]);
  // A payment a cent short of the 60-payment level needs a 61st payment for the cents left over.
  assert.deepEqual([finance({ solve: 'term', payment: '954.09' }).payments, finance({ solve: 'term', payment: '954.09' }).finalPayment], [61, 112.76]);
  assert.equal(finance({ solve: 'rate', amount: '1200', payment: '100', payments: '12', balloon: '0' }).rate, 0);
  assert.equal(finance({ solve: 'rate', amount: '10000', payment: '200', payments: '52', balloon: '0', frequency: 'weekly' }).rate, 7.7509);
});

test('the missing element is refused where no answer exists', () => {
  assert.throws(() => finance({ solve: 'rate', amount: '1000', payment: '80', payments: '12', balloon: '0' }),
    { message: 'The payments and balloon add up to less than the amount financed, so no rate of nil or more fits.' });
  assert.throws(() => finance({ solve: 'rate', amount: '1000', payment: '200', payments: '12', balloon: '0' }),
    { message: 'These payments need a rate above 100% a year, which this page does not work.' });
  assert.throws(() => finance({ solve: 'term', payment: '375' }),
    { message: 'The payment does not cover a period’s interest, so the balance never falls to the balloon.' });
  assert.throws(() => finance({ solve: 'term', payment: '375.01', frequency: 'annual', rate: '0.0001', balloon: '0' }),
    { message: 'The payment does not reach the balloon within 50 payments, 50 years.' });
  assert.throws(() => finance({ solve: 'amount', rate: '0', payment: '10', balloon: '100', balloonKind: 'percent' }),
    { message: 'At nil interest a 100% balloon leaves the payments nothing to repay, so no amount fits.' });
  // $0.01 at 100% a year over 600 months grows past what the page can show to the cent.
  // At 4.27% a month over 498 months a half cent of rounding grows about a billionfold, so the
  // last payment cannot take it.
  assert.throws(() => finance({ amount: '893155987.49', rate: '51.2498', payments: '498', balloon: '0' }),
    { message: 'Rounding each period’s interest to the cent at this rate and term stops the schedule closing on the balloon. Use fewer payments, a lower rate or a larger amount.' });
});

test('income-year interest shares a period across 30 June by days', () => {
  // Monthly from 15 June 2027: the first payment's $375.00 accrues 15 June to 15 July, 16 days
  // before 1 July of 30: 375 x 16 / 30 = $200.00 in 2026-27 and $175.00 in 2027-28.
  const terms = { ...OPENING_TERMS, start: '2027-06-15' };
  const years = interestByIncomeYear(terms);
  assert.equal(years['2026-27'], 200);
  const r = financeSchedule(terms);
  assert.equal(Object.values(years).reduce((sum, value) => sum + Math.round(value * 100), 0), Math.round(r.totalInterest * 100));
  // Starting on 1 July, no period runs across 30 June.
  assert.deepEqual(Object.keys(interestByIncomeYear(OPENING_TERMS)), ['2026-27', '2027-28', '2028-29', '2029-30', '2030-31']);
  // In advance from 1 June 2026 the first payment carries no interest; the second, on 1 July, carries
  // June's: (60,000 - 948.17) x 7.5% / 12 = $369.07, all of it in 2025-26.
  const advance = { ...OPENING_TERMS, timing: 'advance', start: '2026-06-01' };
  assert.equal(interestByIncomeYear(advance)['2025-26'], 369.07);
});

// The 3-payment schedule above, as the hire purchase page sets it out from 15 June 2027.
test('the hire purchase result sets out the income years, the journal and the CSV', () => {
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  const terms = { ...OPENING_TERMS, amount: '1000', rate: '12', payments: '3', balloon: '0', start: '2027-06-15' };
  const result = calculations.financeResult(terms, aud, 'hire-purchase');
  assert.deepEqual(result.tables.years, [['2026-27', '$5.33'], ['2027-28', '$14.74']]);
  // Each payment debits the liability with its principal and interest expense with its interest.
  assert.deepEqual(result.tables.journal, [['15 July 2027', '1', '$330.02', '$10.00', '$340.02'],
    ['15 Aug 2027', '2', '$333.32', '$6.70', '$340.02'], ['15 Sept 2027', '3', '$336.66', '$3.37', '$340.03'],
    ['Total', '', '$1,000.00', '$20.07', '$1,020.07']]);
  const csv = result.csv.split('\r\n');
  assert.equal(csv[2], 'Agreement,hire purchase');
  assert.ok(csv.includes('2027-07-15,1,330.02,10.00,340.02'));
  assert.ok(csv.includes('Date,Payment,Debit Hire purchase liability,Debit interest expense,Credit bank'));
  assert.ok(csv.includes('2027-28,14.74'));
  assert.equal(calculations.financeResult(terms, aud, 'chattel-mortgage').csv.split('\r\n')
    .find((line) => line.startsWith('Date,Payment,')), 'Date,Payment,Debit Chattel mortgage loan,Debit interest expense,Credit bank');
  // The loan page shows the schedule alone.
  assert.deepEqual(Object.keys(calculations.financeResult(terms, aud).tables), ['schedule']);
  assert.throws(() => calculations.financeResult(terms, aud, 'lease'), { message: 'Choose hire purchase or a chattel mortgage.' });
});

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
  assert.throws(() => finance({ payments: '$12' }), /Enter a number using digits only\./);
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

test('a finance schedule refuses a balloon above the amount financed and an unknown choice', () => {
  assert.throws(() => finance({ amount: '1000', balloon: '1000.01' }), { message: 'The balloon cannot be more than the amount financed.' });
  assert.throws(() => finance({ timing: 'start' }), { message: 'Choose payments in arrears or in advance.' });
  assert.throws(() => finance({ frequency: 'daily' }), { message: 'Choose how often payments fall.' });
  assert.throws(() => finance({ solve: 'balloon' }), { message: 'Choose what to work out.' });
  assert.throws(() => finance({ balloonKind: 'share' }), { message: 'Choose a balloon in dollars or as a percentage.' });
  assert.throws(() => finance({ balloon: '-1' }), /between 0 and/);
  assert.throws(() => finance({ payments: '1.5' }));
  assert.throws(() => finance({ amount: '0' }), /between 0.01 and/);
  assert.throws(() => finance({ start: '2026-02-29' }), { message: 'Enter a start date from 1 January 1900 to 31 December 2099.' });
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
// A calculator's include with the shared jurisdiction radios in place, as Jekyll renders it.
const calculatorInclude = (page) => readFileSync(new URL(`../_includes/calculators/${page}.html`, import.meta.url), 'utf8')
  .replace('{% include duty-jurisdictions.html %}', readFileSync(new URL('../_includes/duty-jurisdictions.html', import.meta.url), 'utf8'))
  .replace('{% include finance-fields.html %}', readFileSync(new URL('../_includes/finance-fields.html', import.meta.url), 'utf8'));
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
  : name === 'landTaxYear' ? landTaxArgs(call)
  : name === 'businessDays' ? [call[0], businessDayHolidays]
  : name === 'pcgAllocation' ? [call[0], pcgYears[call[1]]] : call);
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
  // An income year's total, keyed 2026-27.
  if (/^\d{4}-\d{2}$/.test(field)) return `${field} ${dollars(value)}`;
  if (field === 'percent') return value === null ? 'no percentage' : `${value.toFixed(2)}%`;
  if (field === 'margin' || field === 'markup') return value === null ? `no ${field}` : `${field} ${value.toFixed(2)}%`;
  return `${labels[field]} ${dollars(value)}`;
};
Object.assign(LABELS, { periodEnds: 'period ends', lastDay: 'last day', amendedEnds: '60 days after the amended notice',
  firstEnds: 'first notice period ends' });
Object.assign(LABELS, { amount: 'amount', credit: 'credit', due: 'due by this instalment' });
// Fields an engine shows its own way, by engine: a label, or a function that writes the value.
const ENGINE_LABELS = { paygInstalment: { instalment: 'instalment' }, pcgRisk: PCG_SHOWN,
  financeSchedule: { finalPayment: 'last payment', amount: 'amount financed', payments: (v) => `${v} payments`,
    rate: (v) => `rate ${v.toFixed(4)}%` },
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
  // The field being worked out is not used, so the input leaves it out.
  financeSchedule: (t) => [t.solve !== 'amount' && `${dollars(t.amount)} financed`, t.solve !== 'rate' && `${t.rate}% a year`,
    `${t.solve === 'term' ? '' : `${t.payments} `}${t.frequency} payments${t.timing === 'advance' ? ' in advance' : ''}`,
    t.solve !== 'payment' && `${dollars(t.payment)} each`,
    t.balloon !== '0' && `balloon ${t.balloonKind === 'percent' ? `${t.balloon}%` : dollars(t.balloon)}`, `from ${t.start}`]
    .filter(Boolean).join(', ')
    + `; working out the ${{ payment: 'payment', amount: 'amount financed', term: 'number of payments', rate: 'rate' }[t.solve]}`,
  interestByIncomeYear: (t) => INPUTS.financeSchedule(t),
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
  financeSchedule: (t) => (assert.equal(t.frequency, 'monthly'),
    `$${Number(t.amount).toLocaleString('en-AU')} at ${t.rate}% over ${t.payments / 12} years, repaid monthly, no fees`),
};

// peer_result and verdict are dated manual observations of the official calculator. This
// binds the published verdict to the recorded observation; it does not reread the official site.
// whole: the official calculator shows whole dollars, so this calculator's cents are rounded to compare.
const PEER_READINGS = {
  gst: { form: /^GST \$(\d+\.\d{2}), price including GST \$(\d+\.\d{2})$/,
    own: (result) => [result.gst, result.gross], verdict: 'Both give the same cents on this input' },
  financeSchedule: { form: /^repayments of \$([\d,]+) a month, total repayments \$([\d,]+)$/,
    own: (result) => [result.payment, result.totalPaid], whole: true,
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
  fbtProperty: (p) => `${p.method}, price ${dollars(p.price)}, notional value ${dollars(p.notional)}, contribution `
    + `${dollars(p.contribution)}, income use ${p.incomeUse}%, deduction ${dollars(p.contributionDeduction)}, in-house reduction `
    + `left ${dollars(p.available)}`,
  fbtExpensePayment: (e) => `${e.method}, expenditure ${dollars(e.expenditure)}, paid ${dollars(e.paid)}, contribution `
    + `${dollars(e.contribution)}, income use ${e.incomeUse}%, deduction ${dollars(e.portionDeduction)}, price ${dollars(e.price)}, `
    + `notional value ${dollars(e.notional)}, in-house reduction left ${dollars(e.available)}`,
});
const BENEFIT_LABELS = { gross: 'value before contributions', recipientsPortion: 'recipient’s portion',
  contributionApplied: 'contribution applied', excess: 'excess contribution', valueAfterContribution: 'value after the contribution',
  grossDeduction: 'gross deduction', deductionApplied: 'deduction applied', notionalDeduction: 'notional deduction',
  reduction: 'reduction', inHouseReduction: 'in-house reduction' };
Object.assign(ENGINE_LABELS, {
  fbtLoan: { notional: 'notional interest', gross: 'gross taxable value', grossDeduction: 'gross deduction',
    notionalDeduction: 'notional deduction', reduction: 'reduction' },
  fbtMealEntertainment: { registerPercent: (v) => `register percentage ${v.toFixed(2)}%` },
  fbtCarParking: { benefit: (v) => (v ? 'benefit arises' : 'no benefit arises'), gross: 'gross taxable value',
    contributionApplied: 'contributions applied', excess: 'excess contributions', average: 'average cost',
    annual: 'annual value', statutoryBenefit: 'total statutory benefit' },
  fbtProperty: BENEFIT_LABELS,
  fbtExpensePayment: BENEFIT_LABELS,
});
// The electric cars exemption cases: the car's facts and the verdict with the threshold it applied.
Object.assign(INPUTS, {
  fbtEvExemption: (e, y) => `${{ battery: 'Battery electric', 'fuel-cell': 'Hydrogen fuel cell electric', 'plug-in-hybrid': 'Plug-in hybrid' }[e.vehicle]}, `
    + `${e.currentEmployee ? 'current' : 'former or future'} employee, first held and used ${e.firstUsed}, first retail sale ${e.firstSale} `
    + `at ${dollars(e.lctValue)}${e.otherSupply ? ', LCT on another supply' : ''}`
    + `${e.hybrid ? `, ${e.hybrid.committed ? 'committed' : 'not committed'} before 1 April 2025, ${e.hybrid.newCommitment ? 'a' : 'no'} new commitment, `
      + `${e.hybrid.exemptBefore ? 'an' : 'no'} exempt benefit before 1 April 2025` : ''}; FBT year ending 31 March ${y.ended}`,
});
ENGINE_LABELS.fbtEvExemption = { exempt: (v) => (v ? 'exempt' : 'not exempt'), saleYear: (v) => `sale in ${v}`,
  threshold: (v) => (v === null ? 'after the FBT year' : `threshold ${dollars(v)}`) };

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
test('transfer duty and foreign surcharge radios carry the rate table rows for all 8 jurisdictions', () => {
  for (const page of ['transfer-duty', 'foreign-surcharge']) {
    const html = calculatorInclude(page);
    const radios = [...html.matchAll(/<input type="radio" name="jurisdiction" value="([^"]+)" data-name="([^"]+)" data-scale="([^"]+)"(?: checked)? \/> ([^<]+)<\/label>/g)]
      .map(([, code, name, scale, label]) => (assert.equal(label, name), assert.equal(PLACES[code], name),
        [code, scale.split(';').map((row) => row.split(','))]));
    assert.equal(radios.length, (html.match(/name="jurisdiction"/g) ?? []).length);
    assert.equal((html.match(/name="jurisdiction"[^>]* checked /g) ?? []).length, 1);
    assert.deepEqual(Object.fromEntries(radios), transferDutyScales);
    assert.deepEqual(radios.map(([code]) => code), Object.keys(PLACES));
  }
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

// The electric cars exemption: Fringe Benefits Tax Assessment Act 1986 s 8A (Compilation No. 97, 1 July 2026)
// and the Treasury Laws Amendment (Electric Car Discount) Act 2022 as made, Schedule 1 item 7(2) and Schedule 2
// item 5, read 19 November 2026 at https://www.legislation.gov.au/C2004A03280/latest/text and
// https://www.legislation.gov.au/C2022A00086/asmade/text. The ATO's 'Electric cars exemption' (last updated
// 1 April 2026) and 'FBT on plug-in hybrid electric vehicles' (last updated 14 March 2025), read the same day,
// give the worked examples: Shelly's car first used on 1 April 2022 is not exempt; John's, held from 15 June 2022
// and first used on 5 July 2022, is; GHI Co's $85,000 car was above 2022-23's threshold; Simon's plug-in hybrid
// lease from 1 April 2024 to 31 March 2027 stays exempt; Tony's break in the novation is a new commitment.
// The boundary cases' Cleancut example is a published FBT worked example (¶3-045, reviewed 30 June 2026): a $72,000
// car before GST, $79,200 with it, first held and used on 1 July 2025, under 2025-26's $91,387 threshold, is exempt.
const evFacts = (fields) => ({ vehicle: 'battery', currentEmployee: true, firstUsed: '2026-04-01', firstSale: '2026-04-01',
  lctValue: '60000', otherSupply: false, ...fields });
const evYear = { ended: '2027' };
const unmet = (r) => r.conditions.filter((c) => !c.met).map((c) => c.condition);
test('the electric cars exemption names each condition and fails on any one of them', () => {
  const cleancut = calculations.fbtEvExemption(evFacts({}), evYear);
  assert.deepEqual(cleancut.conditions.map((c) => c.condition),
    ['current-employee', 'zero-or-low-emissions', 'first-held-and-used', 'first-sale', 'other-supply']);
  assert.equal(cleancut.exempt, true);
  assert.equal(calculations.fbtEvExemption(evFacts({ vehicle: 'fuel-cell' }), evYear).exempt, true);
  assert.deepEqual(unmet(calculations.fbtEvExemption(evFacts({ currentEmployee: false }), evYear)), ['current-employee']);
  assert.deepEqual(unmet(calculations.fbtEvExemption(evFacts({ otherSupply: true }), evYear)), ['other-supply']);
  // Schedule 1 item 7(2): the earliest time a person both held and used the car is at or after the start of 1 July 2022.
  assert.deepEqual(unmet(calculations.fbtEvExemption(evFacts({ firstUsed: '2022-06-30', firstSale: '2022-06-30' }), evYear)),
    ['first-held-and-used']);
  assert.equal(calculations.fbtEvExemption(evFacts({ firstUsed: '2022-07-01', firstSale: '2022-06-30' }), evYear).exempt, true);
  const all = calculations.fbtEvExemption(evFacts({ currentEmployee: false, firstUsed: '2022-01-01', firstSale: '2022-01-01',
    lctValue: '90000', otherSupply: true }), evYear);
  assert.deepEqual(unmet(all), ['current-employee', 'first-held-and-used', 'first-sale', 'other-supply']);
});

test('the electric cars exemption takes a plug-in hybrid only under Schedule 2 item 5(2)', () => {
  const hybrid = (committed, newCommitment, exemptBefore) => calculations.fbtEvExemption(evFacts({ vehicle: 'plug-in-hybrid',
    firstUsed: '2024-06-01', firstSale: '2024-06-01', hybrid: { committed, newCommitment, exemptBefore } }), evYear);
  assert.deepEqual(hybrid(true, false, true).conditions.map((c) => c.condition), ['current-employee', 'hybrid-committed',
    'hybrid-no-new-commitment', 'hybrid-exempt-before', 'first-held-and-used', 'first-sale', 'other-supply']);
  assert.equal(hybrid(true, false, true).exempt, true);
  assert.deepEqual(unmet(hybrid(false, false, true)), ['hybrid-committed']);
  assert.deepEqual(unmet(hybrid(true, true, true)), ['hybrid-no-new-commitment']);
  assert.deepEqual(unmet(hybrid(true, false, false)), ['hybrid-exempt-before']);
});

// The ATO's 'Luxury car tax rate and thresholds' (last updated 1 June 2026), read 19 November 2026:
// https://www.ato.gov.au/tax-rates-and-codes/luxury-car-tax-rate-and-thresholds, fuel-efficient vehicles.
test('the fuel-efficient threshold is the ATO table’s for the financial year of the first retail sale', () => {
  assert.deepEqual(Object.entries(FUEL_EFFICIENT_THRESHOLDS), [['2012-13', 75375], ['2013-14', 75375], ['2014-15', 75375],
    ['2015-16', 75375], ['2016-17', 75526], ['2017-18', 75526], ['2018-19', 75526], ['2019-20', 75526], ['2020-21', 77565],
    ['2021-22', 79659], ['2022-23', 84916], ['2023-24', 89332], ['2024-25', 91387], ['2025-26', 91387], ['2026-27', 91661]]);
  // A sale on 30 June falls in the year ending then; one on 1 July, in the next.
  assert.equal(calculations.fbtEvExemption(evFacts({ firstUsed: '2025-06-30', firstSale: '2025-06-30' }), evYear).saleYear, '2024-25');
  assert.equal(calculations.fbtEvExemption(evFacts({ firstSale: '2026-07-01' }), evYear).threshold, 91661);
  assert.equal(calculations.fbtEvExemption(evFacts({ firstSale: '2012-07-01', firstUsed: '2022-07-01' }), evYear).threshold, 75375);
  // LCT Act s 25-1(1): luxury car tax falls on a value above the threshold, so the threshold itself pays none.
  assert.equal(calculations.fbtEvExemption(evFacts({ lctValue: '91387.00', firstSale: '2025-07-01' }), evYear).exempt, true);
  assert.equal(calculations.fbtEvExemption(evFacts({ lctValue: '91387.01', firstSale: '2025-07-01' }), evYear).exempt, false);
  // s 8A(1)(c) counts luxury car tax payable before the benefit: a first retail sale after the FBT year,
  // in 2026-27 or a later year the table does not hold, comes after every benefit in it.
  // These facts settle the year, so a refusal here is a wrong result.
  const settled = (fields) => {
    let result;
    assert.doesNotThrow(() => { result = calculations.fbtEvExemption(evFacts(fields), evYear); }, JSON.stringify(fields));
    return result;
  };
  for (const firstSale of ['2027-04-01', '2027-07-01']) {
    const later = settled({ lctValue: '200000', firstSale });
    assert.equal(later.exempt, true, firstSale);
    assert.equal(later.threshold, null, firstSale);
  }
  assert.equal(settled({ lctValue: '200000', firstUsed: '2027-03-31', firstSale: '2027-03-31' }).exempt, false);
  // An after-year sale settles only that sale: luxury car tax on an earlier supply or import still fails s 8A(1)(c).
  assert.deepEqual(unmet(calculations.fbtEvExemption(evFacts({ firstSale: '2027-04-01', otherSupply: true }), evYear)), ['other-supply']);
  // No benefit comes before the car is first held and used, so a sale before the year, or on or before that day, precedes them all.
  assert.equal(calculations.fbtEvExemption(evFacts({ firstUsed: '2025-01-01', firstSale: '2026-03-31', lctValue: '200000' }), evYear).exempt, false);
  assert.equal(settled({ firstUsed: '2026-07-01', firstSale: '2026-07-01', lctValue: '200000' }).exempt, false);
  // A sale within the year after that day may fall between benefits; under the threshold it fails nothing.
  assert.equal(calculations.fbtEvExemption(evFacts({ firstUsed: '2026-04-01', firstSale: '2026-07-01', lctValue: '91661' }), evYear).exempt, true);
});

test('the electric cars exemption refuses facts it cannot decide or that contradict the year', () => {
  const refuses = (fields, message) => assert.throws(() => calculations.fbtEvExemption(evFacts(fields), evYear), { message });
  refuses({ vehicle: 'diesel' }, 'Choose a battery electric, hydrogen fuel cell electric or plug-in hybrid car.');
  refuses({ hybrid: { committed: true, newCommitment: false, exemptBefore: true } }, 'Answer the plug-in hybrid questions for a plug-in hybrid only.');
  refuses({ vehicle: 'plug-in-hybrid' }, 'Answer the plug-in hybrid questions for a plug-in hybrid only.');
  refuses({ vehicle: 'plug-in-hybrid', hybrid: { committed: 'yes', newCommitment: false, exemptBefore: true } }, 'Answer each yes or no question.');
  refuses({ otherSupply: 'no' }, 'Answer each yes or no question.');
  refuses({ firstUsed: '2026-02-30' }, 'Enter the date the car was first held and used as a calendar date.');
  refuses({ firstSale: '1 July 2026' }, 'Enter the date of the car’s first retail sale as a calendar date.');
  refuses({ firstUsed: '2027-04-01' }, 'The car was first held and used after 31 March 2027, so it gave no car benefit in the FBT year.');
  refuses({ firstUsed: '2026-04-01', firstSale: '2026-04-02', lctValue: '91661.01' }, 'Luxury car tax on a first retail sale within the FBT year, '
    + 'after the car was first held and used, does not affect a benefit provided before the sale (section 8A(1)(c)), so this calculator '
    + 'cannot give one result for the year.');
  refuses({ firstUsed: '2025-01-01', firstSale: '2026-04-01', lctValue: '200000' }, /^Luxury car tax on a first retail sale within the FBT year/);
  refuses({ firstSale: '2012-06-30' }, 'This calculator takes a first retail sale from 1 July 2012, the years the ATO’s luxury car tax table lists.');
  refuses({ vehicle: 'plug-in-hybrid', firstUsed: '2025-04-01', hybrid: { committed: true, newCommitment: false, exemptBefore: true } },
    'A car first held and used from 1 April 2025 cannot have given an exempt car benefit before that day.');
  assert.throws(() => calculations.fbtEvExemption(evFacts({}), { ended: '2025' }), { message: 'Enter a whole number between 2026 and 2100.' });
});

// The form reads the exemption's facts by name and, for an exempt car, the FBT car result sets the taxable
// value, the gross-up and FBT to nil and shows the value before the exemption as reportable (s 135P(3)).
test('the FBT car form passes the electric car facts and says what an exempt car still reports', () => {
  const fields = { kind: 'battery', 'current-employee': 'yes', 'first-used': '2026-07-01', 'first-sale': '2026-07-01',
    'lct-value': '60000', 'other-supply': 'no', 'hybrid-committed': 'no', 'hybrid-new': 'no', 'hybrid-exempt-before': 'no' };
  const value = (name) => fields[name];
  const form = { dataset: { yearEnded: '2027' } };
  const result = () => fbtEvResult(form, calculations, { aud: String, value, money: value });
  assert.equal(result().exempt, true);
  assert.equal(result().rows.at(-1).join(': '), 'Electric cars exemption, section 8A: applies');
  assert.match(result().inputs, /^battery electric car for a current employee, first held and used 1 July 2026, first sold at retail 1 July 2026 /);
  fields.kind = 'plug-in-hybrid';
  assert.deepEqual(result().rows.filter(([, met]) => met === 'not met').map(([label]) => label),
    ['Committed before 1 April 2025 for a period that began before then and includes the benefit, Schedule 2 item 5(2)(b)',
      'An exempt car benefit with the car before 1 April 2025, Schedule 2 item 5(2)(d) and (e)']);
  fields.kind = 'other';
  assert.equal(result(), null);
  assert.match(EV_EXEMPT_NOTE, /subsection 135P\(3\)\), reported when the employee’s total for the year is more than \$2,000, unless the car is a pooled or shared car/);
  const html = readFileSync(new URL('../_includes/calculators/fbt-car.html', import.meta.url), 'utf8');
  assert.ok(html.includes('data-year-ended="2027"'));
  for (const name of Object.keys(fields)) assert.match(html, new RegExp(`name="${name}"`), name);
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
  financeSchedule: (f) => [{ solve: f.solve, amount: f.amount, rate: f.rate, payments: f.payments, payment: f.payment,
    balloon: f.balloon, balloonKind: f['balloon-kind'], frequency: f.frequency, timing: f.timing, start: f.start }],
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
  fbtProperty: (f) => [{ method: f.method, price: f.price, notional: f.notional, contribution: f.contribution,
    incomeUse: f['income-use'], contributionDeduction: f['contribution-deduction'], available: f.available }],
  fbtExpensePayment: (f) => [{ method: f.method, expenditure: f.expenditure, paid: f.paid, contribution: f.contribution,
    incomeUse: f['income-use'], portionDeduction: f['portion-deduction'], price: f.price, notional: f.notional, available: f.available }],
});

for (const [page, { function: name, rows: [first] }] of Object.entries(shownCases)) {
  test(`${page} opens on its first boundary case as the fictional example`, () => {
    const html = calculatorInclude(page);
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

// PCG 2021/4 allocation, with each recipient's tax worked out (assets/pcg-2021-4.mjs). The guideline
// as updated 19 June 2024, read 17 November 2026 at the URL above. Paragraph 122: the case studies
// use 2020-21 rates; footnote 7: a corporate taxpayer is a base rate entity at 26%. Every figure
// below is the guideline's own, from its text or the alt text of its effective tax rate formulas.
const pcgAllocationHtml = readFileSync(new URL('../_includes/calculators/pcg-2021-4-allocation.html', import.meta.url), 'utf8');
// Each year radio's data, as assets/accounting-pages.mjs passes the checked one.
const pcgYears = Object.fromEntries([...pcgAllocationHtml.matchAll(
  /name="year" value="([^"]+)" data-scale="([^"]+)" data-base-rate="([^"]+)" data-company-rate="([^"]+)"/g)]
  .map(([, year, scale, baseRate, companyRate]) => [year, { scale, baseRate, companyRate }]));
const PCG_WHO = { individual: 'individual', 'base-rate-company': 'base rate company', company: 'company', other: 'other',
  none: 'not used' };
Object.assign(INPUTS, { pcgAllocation: (a, year) => [`${year} rates`,
  a.gateway1 && a.gateway2 ? 'gateways passed' : `Gateway ${a.gateway1 ? 2 : 1} failed`,
  ...a.recipients.flatMap((r, i) => (r.kind === 'none' && [r.firm, r.deductions, r.other].every((v) => v === '0') ? []
    : [`${i ? `associate ${i} ${PCG_WHO[r.kind]}` : 'IPP'} ${dollars(r.firm)}`
      + `${r.deductions === '0' ? '' : ` less ${dollars(r.deductions)} firm deductions`}${r.other === '0' ? '' : `, other ${dollars(r.other)}`}`])),
  ...(a.factor3 ? [`benchmark ${dollars(a.benchmark)}`] : [])].join('; ') });
Object.assign(FORM_CALLS, { pcgAllocation: (f) => [{ gateway1: f.gateway1 === 'yes', gateway2: f.gateway2 === 'yes',
  factor3: f.factor3 === 'yes', benchmark: f.benchmark, recipients: Array.from({ length: 6 }, (_, i) => ({
    kind: i ? f[`kind-${i}`] : 'individual', firm: f[`firm-${i}`], deductions: f[`deductions-${i}`], other: f[`other-${i}`] })) },
f.year] });
Object.assign(ENGINE_LABELS, { pcgAllocation: { ...PCG_SHOWN, firmIncome: 'firm income', tax: 'tax counted' } });

const pcgRecipient = ([kind, firm, other = '0', deductions = '0']) => ({ kind, firm, deductions, other });
const pcgAllocate = (recipients, fields = {}, year = '2020-21') => calculations.pcgAllocation({ gateway1: true,
  gateway2: true, factor3: false, benchmark: '0', ...fields, recipients: recipients.map(pcgRecipient) }, pcgYears[year]);

// Each case study: its recipients (the IPP first), the tax the guideline gives each, its effective
// tax rate, scores, aggregate and zone. Case study 4 counts Bernie's and Jane's $20,225 shares of the rental loss
// as other income less deductions; the guideline disregards them (paragraph 144), and paragraph 85(a) does too.
const PCG_ALLOCATED = [
  ['1 Nicolas', [['individual', '330000'], ['base-rate-company', '270000']], [119167, 70200], 31.56, [4, 3], 7, 'green'],
  ['2 Donald', [['individual', '480000'], ['base-rate-company', '320000'], ['individual', '80000']],
    [186667, 83200, 16467], 32.54, [4, 3], 7, 'green'],
  ['3 Hilary', [['individual', '162500'], ['base-rate-company', '87500']], [45192, 22750], 27.18, [3, 4], 7, 'green'],
  ['4 Bernie', [['individual', '325000', '-20225'], ['individual', '175000', '-20225']], [116916, 49817], 33.35, [3, 3], 6, 'green'],
  ['5 Frank', [['individual', '300000'], ['base-rate-company', '200000']], [105666, 52000], 31.53, [4, 3], 7, 'green'],
  ['8 Maria', [['individual', '360000'], ['individual', '180000'], ['base-rate-company', '60000']],
    [132667, 51667, 15600], 33.32, [4, 3], 7, 'green'],
  ['9 David', [['individual', '300000'], ['base-rate-company', '300000']], [105667, 78000], 30.61, [4, 3], 7, 'green'],
  ['10 Astrid', [['individual', '200000'], ['individual', '150000'], ['base-rate-company', '50000']],
    [60667, 40567, 13000], 28.56, [4, 4], 8, 'amber'],
  ['11 Yan', [['individual', '300000'], ['base-rate-company', '100000']], [105667, 26000], 32.92, [3, 3], 6, 'green'],
  ['12 Benjamin', [['individual', '300000'], ['individual', '100000'], ['base-rate-company', '200000']],
    [105667, 22967, 52000], 30.11, [4, 3], 7, 'green'],
];
for (const [name, recipients, taxes, rate, [factor1, factor2], total, zone] of PCG_ALLOCATED) {
  test(`PCG 2021/4 allocation works out case study ${name}’s tax and scores as the guideline does`, () => {
    const result = pcgAllocate(recipients);
    // The 2020-21 scale gives $116,917 on Bernie's $325,000 and $105,667 on Frank's $300,000, as it
    // does for David, Yan and Benjamin; the guideline prints each $1 less, with the same rate.
    const printed = { '4 Bernie': [1, 0], '5 Frank': [1, 0] }[name] ?? taxes.map(() => 0);
    assert.deepEqual(result.recipients.map((one) => one.tax), taxes.map((tax, i) => tax + printed[i]));
    assert.deepEqual([result.taxRate, result.factor1, result.factor2, result.total, result.zone],
      [rate, factor1, factor2, total, zone]);
  });
}

// Case study 7: Jacinta, her spouse and a company; '($360,000 ÷ $350,000) × 100 = 103%', a factor 3
// score of 3 and an aggregate of 10, green on all 3. Case study 6: Felix returns all $65,000 and pays
// $11,592, green with no other factor (paragraphs 81, 152 to 154).
test('PCG 2021/4 allocation scores case study 7 on all 3 factors and case study 6 on the whole entitlement', () => {
  const jacinta = pcgAllocate([['individual', '360000'], ['individual', '180000'], ['base-rate-company', '60000']],
    { factor3: true, benchmark: '350000' });
  assert.deepEqual(jacinta.recipients.map((one) => one.tax), [132667, 51667, 15600]);
  assert.deepEqual([jacinta.taxRate, jacinta.benchmarkShare, jacinta.factor3, jacinta.total, jacinta.zone],
    [33.32, 102.86, 3, 10, 'green']);
  const felix = pcgAllocate([['individual', '65000']]);
  assert.deepEqual([felix.recipients[0].tax, felix.factor1, felix.total, felix.zone], [11592, 1, null, 'green']);
});

// Example 4 (paragraphs 87 to 93): the IPP's $240,667 on $600,000; associate 1 $22,967; associate 2
// $33,850 under 85(b) ($40,567 less $6,717); associates 3 and 4 $22,967 under 85(a), as (b) gives
// $6,717 and nil; associate 5 $22,967 under both. '... multiply by 100 equals 33.3%'.
test('PCG 2021/4 allocation follows example 4 recipient by recipient', () => {
  const result = pcgAllocate([['individual', '600000'], ['individual', '100000'], ['individual', '100000', '50000'],
    ['individual', '100000', '-50000'], ['individual', '100000', '-100000'], ['individual', '100000']]);
  assert.deepEqual(result.recipients, [{ tax: 240667, rule: '85(a)' }, { tax: 22967, rule: '85(a)' },
    { tax: 33850, rule: '85(b)' }, { tax: 22967, rule: '85(a)' }, { tax: 22967, rule: '85(a)' }, { tax: 22967, rule: '85(a)' }]);
  assert.deepEqual([result.firmIncome, result.tax, Math.round(result.taxRate * 10) / 10], [1100000, 366385, 33.3]);
});

// Example 5 (paragraph 94): $600,000 from the firm, a $40,000 firm-related interest deduction and $50,000
// of other income. Under 85(a) the tax on $560,000 is $222,667; under 85(b) it is $245,167 less $6,717,
// $238,450, which counts. Example 6 (paragraphs 98 and 99): $60,667 on a $200,000 salary, 30.33%, and
// $14,842 on a $75,000 salary, 19.79%; its FBT is outside this calculator.
test('PCG 2021/4 allocation follows examples 5 and 6', () => {
  assert.deepEqual(pcgAllocate([['individual', '600000', '50000', '40000']]).recipients, [{ tax: 238450, rule: '85(b)' }]);
  assert.deepEqual(pcgAllocate([['individual', '600000', '0', '40000']]).recipients, [{ tax: 222667, rule: '85(a)' }]);
  for (const [salary, tax, rate] of [['200000', 60667, 30.33], ['75000', 14842, 19.79]]) {
    const ipp = pcgAllocate([['individual', salary]]);
    assert.equal(ipp.recipients[0].tax, tax);
    assert.equal(Math.round(tax / Number(salary) * 10000) / 100, rate);
  }
});

// The site's individual income tax table, rows 'resident_tax' for each year the form offers. Company
// rates: ATO 'Tax rates 2011–12 to 2020–21' (26%) and 'Tax rates 2022–23' to 'Tax rates 2025–26' (25%),
// read 17 November 2026; for 2026-27, Income Tax Rates Act 1986 s 23(2), Compilation No. 66 (1 July 2026),
// read 17 November 2026: 'if the company is a base rate entity for a year of income—25%; or otherwise—30%'.
test('PCG 2021/4 allocation years carry the site’s resident scales and the company rates', () => {
  const rows = readFileSync(new URL('../rates/individual-income-tax/individual-income-tax-rates.csv', import.meta.url), 'utf8')
    .trim().split(/\r?\n/).map((line) => line.split(',')).filter(([, component]) => component === 'resident_tax');
  assert.deepEqual(Object.keys(pcgYears), ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2020-21']);
  for (const [year, { scale, baseRate, companyRate }] of Object.entries(pcgYears)) {
    assert.equal(scale, rows.filter(([income]) => income === year).map(([, , from, , base, rate]) => `${from},${base},${rate}`)
      .join(';'), year);
    assert.deepEqual([baseRate, companyRate], [year === '2020-21' ? '26' : '25', '30'], year);
  }
});

// Worked by hand on the 2020-21 scale: $45,000.02 is 2 cents into the 32.5% band, 0.65 cents, so 1 cent;
// $45,000.01 gives 0.325 cents, so none. A company at 30% on $0.05 owes 1.5 cents, so 2 cents.
test('PCG 2021/4 allocation rounds each tax half up to the cent and counts nil on a firm loss', () => {
  const tax = (recipients) => pcgAllocate(recipients).recipients.map((one) => one.tax);
  assert.deepEqual(tax([['individual', '45000.02']]), [5092.01]);
  assert.deepEqual(tax([['individual', '45000.01']]), [5092]);
  assert.deepEqual(tax([['individual', '1'], ['company', '0.05']]), [0, 0.02]);
  assert.deepEqual(tax([['individual', '100'], ['individual', '100', '0', '200']]), [0, 0]);
});

test('PCG 2021/4 allocation refuses recipients and figures it cannot use', () => {
  const ipp = ['individual', '300000'];
  for (const [recipients, message, year = '2020-21'] of [
    [[['base-rate-company', '300000']], 'The IPP is an individual.'],
    [[ipp, ['trust', '1']], 'Choose who each associate is.'],
    [[ipp, ['toString', '1']], 'Choose who each associate is.'],
    [[ipp, ['none', '0', '-1']], 'Associate 1 is marked not used but has amounts; choose who it is or set them to 0.'],
    [[ipp, ipp, ipp, ['other', '0']], 'Associate 3 is a recipient this calculator cannot tax; work out its tax yourself '
      + 'and enter the total in the PCG 2021/4 risk scorer.'],
    [[], 'Enter the IPP and up to 5 associates.'],
    [Array(7).fill(ipp), 'Enter the IPP and up to 5 associates.'],
    [[['individual', '600000000'], ['individual', '400000000.01']],
      'The firm income of all recipients together cannot exceed $1,000,000,000.'],
    [[['individual', '0']], 'Enter a profit entitlement above nil.'],
    [[['individual', '1', '-1000000000.01']], 'Enter an amount between -1000000000 and 1000000000.'],
    [[ipp], 'This income year’s tax rates are not usable.', '2021-22'],
  ]) {
    assert.throws(() => pcgAllocate(recipients, {}, year), { message }, JSON.stringify(recipients));
  }
  const year = pcgYears['2026-27'];
  for (const broken of [{ ...year, scale: year.scale.replace('0,0,0;', '') }, { ...year, scale: '0,0,0;100,0,15;50,0,30' },
    { ...year, scale: year.scale.replace(',15;', ',15.125;') }, { ...year, baseRate: '' }, { ...year, companyRate: '101' }]) {
    assert.throws(() => calculations.pcgAllocation({ gateway1: true, gateway2: true, factor3: false, benchmark: '0',
      recipients: [pcgRecipient(ipp)] }, broken), { message: 'This income year’s tax rates are not usable.' }, JSON.stringify(broken));
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

// Division 296, read 17 November 2026 on the Federal Register of Legislation: ITAA 1997 ss 296-30
// and 296-35 (compilation 268, 1 October 2026), https://www.legislation.gov.au/C2004A05138/latest/text:
// 'for the 2026‑27 income year—$3,000,000' and '$10,000,000'; the Superannuation (Building a Stronger
// and Fairer Super System) Imposition Act 2026 s 5, https://www.legislation.gov.au/C2026A00009/asmade/text:
// '15% of the person’s taxable superannuation earnings' and '10% of the person’s very large
// superannuation balance earnings component'.
const DIVISION_296_LAW = { largeThreshold: '3000000', veryLargeThreshold: '10000000', rate: '15', veryLargeRate: '10' };
const division296Html = readFileSync(new URL('../_includes/calculators/division-296.html', import.meta.url), 'utf8');
// The form's data attributes, as assets/accounting-pages.mjs passes them in form.dataset.
const division296Year = Object.fromEntries([...division296Html.match(/<form [^>]*>/)[0].matchAll(/ data-([a-z-]+)="([^"]*)"/g)]
  .filter(([, name]) => name !== 'calculator')
  .map(([, name, value]) => [name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
const noException = { child: false, settlement: false, died: false };
const division296 = (balance, earnings, flags = {}) =>
  calculations.division296({ balance, earnings, ...noException, ...flags }, DIVISION_296_LAW);
const DIVISION_296_SHOWN = { 'not-above': 'not liable: balance not above $3,000,000', 'no-earnings': 'not liable: earnings not above nil',
  liable: 'liable', 'rounds-to-nil': 'liable, share rounds to nil', child: 'not liable: child recipient',
  settlement: 'not liable: structured settlement', died: 'not liable: died' };
Object.assign(INPUTS, { division296: (member, year) => {
  assert.deepEqual(year, DIVISION_296_LAW);
  const flags = { child: 'child recipient', settlement: 'structured settlement', died: 'died by 30 June 2027' };
  return `Balance ${dollars(member.balance)}, earnings ${dollars(member.earnings)}`
    + Object.keys(flags).filter((flag) => member[flag]).map((flag) => `, ${flags[flag]}`).join('');
} });
Object.assign(FORM_CALLS, { division296: (f) => [{ balance: f.balance, earnings: f.earnings, child: f.child === 'yes',
  settlement: f.settlement === 'yes', died: f.died === 'yes' }, division296Year] });
Object.assign(ENGINE_LABELS, { division296: { liability: (v) => DIVISION_296_SHOWN[v],
  percentage: (v) => `${v.toFixed(2)}% above $3,000,000`, veryLargePercentage: (v) => `${v.toFixed(2)}% above $10,000,000`,
  taxable: 'taxable earnings', component: (v) => `very large component ${dollars(v)}`,
  tax: '15% tax', veryLargeTax: '10% tax', total: 'Division 296 tax' } });

test('the Division 296 form carries the 2026-27 thresholds and rates of the Acts', () => {
  assert.deepEqual(division296Year, DIVISION_296_LAW);
});

// The Explanatory Memorandum to the Treasury Laws Amendment (Building a Stronger and Fairer Super System)
// Bill 2026, read 17 November 2026 on ParlInfo (r7437): example 1.1, Jordan, '$4 million', '$100,000',
// '25 per cent', '$25,000', '$3,750'; example 1.2, Kelly, '$12 million', '$500,000', '75 per cent',
// '16.67 per cent', '$375,000', '$83,350', '$56,250', '$8,335', '$64,585'.
test('Division 296 tax agrees with the Explanatory Memorandum’s examples 1.1 and 1.2', () => {
  assert.deepEqual(division296('4000000', '100000'), { liability: 'liable', percentage: 25, veryLargePercentage: 0,
    taxable: 25000, component: 0, tax: 3750, veryLargeTax: 0, total: 3750 });
  assert.deepEqual(division296('12000000', '500000'), { liability: 'liable', percentage: 75, veryLargePercentage: 16.67,
    taxable: 375000, component: 83350, tax: 56250, veryLargeTax: 8335, total: 64585 });
});

// ss 296-40(3) and 296-45(3): 'rounded to 2 decimal places (rounding up if the third decimal place is 5
// or more)'. $150 over $3 million is 0.004999...% and $150.01 is 0.005000...%; $500.02 over $10 million
// is 0.004999...% and $500.03 is 0.005000...%; $32 million is 90.625% and 68.75% exactly.
test('Division 296 shares round to 2 places, up from a third decimal place of 5', () => {
  assert.equal(division296('3000150', '100000').percentage, 0);
  assert.equal(division296('3000150', '100000').liability, 'rounds-to-nil');
  assert.equal(division296('3000150.01', '100000').percentage, 0.01);
  assert.equal(division296('10000500.02', '100000').veryLargePercentage, 0);
  assert.deepEqual(division296('10000500.03', '100000'), { liability: 'liable', percentage: 70, veryLargePercentage: 0.01,
    taxable: 70000, component: 10, tax: 10500, veryLargeTax: 1, total: 10501 });
  const tie = division296('32000000', '100000');
  assert.deepEqual([tie.percentage, tie.veryLargePercentage, tie.total], [90.63, 68.75, 20469.5]);
});

test('Division 296 balances must be greater than each threshold, not equal to it', () => {
  for (const balance of ['0', '2999999.99', '3000000']) assert.equal(division296(balance, '100000').liability, 'not-above', balance);
  for (const balance of ['9999999.99', '10000000', '10000000.01']) {
    const result = division296(balance, '100000');
    assert.deepEqual([result.percentage, result.veryLargePercentage, result.total], [70, 0, 10500], balance);
  }
});

// Each amount stays exact and rounds half up to the cent once: 25% of $0.38 is $0.095 and its tax
// $0.01425; $12 million and $0.04 give taxes of $0.0045 and $0.000667, a total of $0.01.
test('Division 296 amounts round to the cent only when shown', () => {
  assert.deepEqual(division296('4000000', '0.38'), { liability: 'liable', percentage: 25, veryLargePercentage: 0,
    taxable: 0.1, component: 0, tax: 0.01, veryLargeTax: 0, total: 0.01 });
  const small = division296('12000000', '0.04');
  assert.deepEqual([small.tax, small.veryLargeTax, small.total], [0, 0, 0.01]);
  assert.equal(division296('6000000', '0.20').total, 0.02);
});

test('Division 296 earnings of nil or less give no tax, and the very large component keeps their sign', () => {
  // Subsection 296-45(1) has no 'greater than nil' condition: 16.67% of the earnings, whatever their sign.
  const components = { 0: 0, '-0': 0, '-50000': -8335, '-1000000000': -166700000 };
  for (const [earnings, component] of Object.entries(components)) {
    const result = division296('12000000', earnings);
    assert.deepEqual([result.liability, result.taxable, result.component, result.tax, result.veryLargeTax, result.total],
      ['no-earnings', 0, component, 0, 0, 0], earnings);
  }
  assert.equal(division296('10000000.01', '-50000').component, 0);
});

test('each Division 296 exception removes the liability, and death makes the balance nil', () => {
  assert.deepEqual(division296('4000000', '100000', { child: true }), { liability: 'child', percentage: 25,
    veryLargePercentage: 0, taxable: 25000, component: 0, tax: 0, veryLargeTax: 0, total: 0 });
  assert.equal(division296('4000000', '100000', { settlement: true }).liability, 'settlement');
  assert.equal(division296('4000000', '100000', { settlement: true }).taxable, 25000);
  assert.deepEqual(division296('12000000', '500000', { died: true }), { liability: 'died', percentage: 0,
    veryLargePercentage: 0, taxable: 0, component: 0, tax: 0, veryLargeTax: 0, total: 0 });
  assert.equal(division296('4000000', '100000', { child: true, died: true }).liability, 'child');
  assert.equal(division296('4000000', '100000', { child: true, died: true }).taxable, 0);
});

test('Division 296 refuses an unanswered exception and figures it cannot work', () => {
  assert.throws(() => division296('4000000', '100000', { died: 'no' }), { message: 'Answer each question about the exceptions.' });
  assert.throws(() => division296('4000000', '100000', { child: undefined }), { message: 'Answer each question about the exceptions.' });
  for (const [balance, earnings, message] of [['-0.01', '0', 'Enter an amount between 0 and 1000000000.'],
    ['1000000000.01', '0', 'Enter an amount between 0 and 1000000000.'], ['4000000.001', '0', 'Enter a number with no more than 2 decimal places.'],
    ['4000000', '-1000000000.01', 'Enter an amount between -1000000000 and 1000000000.'], ['4000000', 'NaN', 'Enter a number using digits only.']]) {
    assert.throws(() => division296(balance, earnings), { message }, `${balance} ${earnings}`);
  }
});

test('the Division 296 page opens on the result its calculation gives for the form’s inputs', () => {
  const example = division296Html.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const result = calculations.division296Result({ balance: '4000000', earnings: '100000', ...noException }, division296Year, aud);
  assert.equal(result.inputs, example[1]);
  assert.equal(result.rows.map((row) => row.join('|')).join(';'), example[2]);
  assert.equal(String(result.principal), example[3]);
  assert.equal(result.note, example[4]);
  assert.equal(result.note, DIVISION_296_LIABILITY.liable);
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

// FBTAA ss 42(1), 44(1) and 62, Compilation No. 97, read 19 November 2026: '75% of the lowest price at which
// that property was so sold to a member of the public'; s 62(1) reduces an employee's in-house total by
// '$1,000'; s 62(2) 'does not apply to an in-house fringe benefit provided under a salary packaging
// arrangement'. The forms name only the figures the chosen rule reads and the notes the result rests on.
test('FBT property and expense payment forms show the rule’s figures and the notes they rest on', () => {
  const run = (calculator, fields) => {
    const value = (name) => fields[name] ?? '0';
    return fbtBenefitResult({ dataset: { calculator } }, calculations, { aud: String, value, money: (name) => `$${value(name)}` });
  };
  const desk = run('fbt-property', { method: 'in-house-public-price', price: '900', contribution: '500', available: '1000' });
  assert.equal(desk.inputs, 'in-house made and sold to the public, 75% of the lowest public price, lowest public price $900, '
    + 'employee contribution $500, 0% income use, deduction for the contribution $0, in-house reduction left $1000');
  assert.deepEqual(desk.rows.slice(-2), [['In-house reduction, section 62', '175'], ['Taxable value', '0']]);
  assert.equal(desk.principal, desk.rows.length - 1);
  assert.match(desk.note, /^The \$1,000 in-house reduction in section 62 is for all of the employee’s in-house fringe benefits/);
  const packaged = run('fbt-property', { method: 'in-house-salary-packaging', notional: '2000', available: '1000', 'income-use': '50' });
  assert.equal(packaged.inputs.startsWith('in-house under salary packaging, the notional value, notional value $2000, employee'), true);
  assert.equal(packaged.rows.some(([label]) => label.startsWith('In-house reduction')), false);
  assert.match(packaged.note, /^The otherwise deductible reduction needs the employee’s declaration .*\(paragraph 44\(1\)\(c\)\)/);
  assert.equal(run('fbt-property', { method: 'external-cost-price', price: '50' }).note, undefined);
  const bought = run('fbt-property', { method: 'in-house-acquired', price: '500', notional: '750' });
  assert.match(bought.inputs, /arm’s length purchase price \$500, notional value \$750, employee contribution \$0, .*, in-house reduction left \$0$/);
  // Guide 9.3: s 22A values the retailer's sale to the employee, goods it bought: the lesser of its cost and the notional value.
  const petrol = run('fbt-expense-payment', { method: 'in-house-acquired', expenditure: '1000', paid: '250', price: '800',
    notional: '1000' });
  assert.deepEqual(petrol.rows.map(([label]) => label), ['In-house value', 'Recipient’s portion', 'Recipient’s portion applied',
    'Excess portion', 'Value after the portion', 'In-house reduction, section 62', 'Taxable value']);
  assert.equal(petrol.rows.at(-1)[1], '50');
  const reimbursed = run('fbt-expense-payment', { method: 'external', expenditure: '500', paid: '250', 'income-use': '80',
    'portion-deduction': '200' });
  assert.equal(reimbursed.rows.at(-1)[1], '50');
  assert.match(reimbursed.note, /evidence paragraph 24\(1\)\(c\) asks for, .*\(paragraph 24\(1\)\(e\)\)$/);
  // The field note's RD: the employee bore $500 − ($250 − $50) = $300, 80% of it $240; GD $400 less $240 is $160 off $200.
  const contributed = run('fbt-expense-payment', { method: 'external', expenditure: '500', paid: '250', contribution: '50',
    'income-use': '80', 'portion-deduction': '240' });
  assert.equal(contributed.rows.at(-1)[1], '40');
  assert.throws(() => run('fbt-property', { method: 'in-house-airline' }), { message: 'Choose a valuation rule.' });
  assert.throws(() => run('fbt-expense-payment', { method: 'external-cost-price' }), { message: 'Choose a valuation rule.' });
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
  const fixture = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')).cases;
  const cases = [...fixture('./fbt-engine-differential.json'), ...fixture('./fbt-property-expense-engine-differential.json')];
  assert.ok(cases.length > 330);
  for (const name of ['fbtProperty', 'fbtExpensePayment']) assert.ok(cases.filter((c) => c.name === name).length > 75, name);
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

// Company tax and franking, foreign purchaser surcharges and business days: how each call and
// result reads on its page, and how each form passes its fields.
const SURCHARGE_STATUS = { citizen: 'Australian citizen', permanent: 'permanent visa', nz: 'New Zealand citizen on a special category visa',
  other: 'temporary visa or none', partner: 'partner or retirement visa' };
const SURCHARGE_ANSWERS = { nzResident: 'resides 6 months', resides: 'ordinarily resident', absent: 'away', home: 'lives there',
  amendable: 'deed amendable', control: 'foreign trustee or appointor', named: 'foreign named beneficiary', exemption: 'exemption sought' };
const BUSINESS_DAY_PLACE_NAMES = { ...Object.fromEntries(Object.entries(PLACES).map(([code, name]) => [code.slice(3), name])),
  any: 'Any state or territory' };
Object.assign(INPUTS, {
  companyTax: (i) => `Turnover ${dollars(i.turnover)}, passive income ${dollars(i.passive)} of ${dollars(i.assessable)}, taxable income `
    + `${dollars(i.taxable)}; ${i.existed ? `last year turnover ${dollars(i.prior.turnover)}, passive income ${dollars(i.prior.passive)} of `
    + `${dollars(i.prior.assessable)}` : 'no previous year'}; dividend ${dollars(i.dividend)} franked ${i.franking}%, marginal rate ${i.marginal}%`,
  foreignSurcharge: (b, p) => {
    const interests = `foreign ${b.largest}% largest and ${b.combined}% together${b.absentee === '0' ? '' : `, absentee ${b.absentee}%`}`;
    const who = { individual: `individual, ${SURCHARGE_STATUS[b.status]}, ${b.daysBefore} and ${b.daysDecember} days in Australia`,
      company: `company${b.overseas ? ' incorporated overseas' : ''}, ${interests}`, trust: `fixed trust, ${interests}`,
      smsf: `SMSF, ${interests}`, discretionary: `discretionary trust, ${b.capital}% of capital and ${b.defaults}% in default to foreign persons` }[b.type];
    const answers = Object.entries(SURCHARGE_ANSWERS).filter(([flag]) => b[flag]).map(([, text]) => `, ${text}`).join('');
    return `${PLACES[p.place]}, ${who}${answers}; ${p.use} property ${dollars(p.value)}${p.share === p.value ? '' : `, share ${dollars(p.share)}`}, `
      + `land ${dollars(p.land)}`;
  },
  businessDays: (q) => `${BUSINESS_DAY_PLACE_NAMES[q.place]}, ${q.mode === 'count' ? `${longDay(q.start)} to ${longDay(q.end)}`
    : `${q.count} business ${q.count === '1' ? 'day' : 'days'} ${q.mode === 'add' ? 'after' : 'before'} ${longDay(q.start)}`}`,
});
Object.assign(FORM_CALLS, {
  companyTax: (f) => [{ turnover: f.turnover, assessable: f.assessable, passive: f.passive, taxable: f.taxable, existed: f.existed === 'yes',
    prior: { turnover: f['prior-turnover'], assessable: f['prior-assessable'], passive: f['prior-passive'] }, dividend: f.dividend,
    franking: f.franking, marginal: f.marginal }],
  foreignSurcharge: (f) => [{ type: f.buyer, status: f.status, daysBefore: f['days-before'], daysDecember: f['days-december'],
    ...Object.fromEntries(Object.keys(SURCHARGE_ANSWERS).map((flag) => [flag, f[flag.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)] === 'yes'])),
    overseas: f.overseas === 'yes', largest: f.largest, combined: f.combined, absentee: f.absentee, capital: f.capital, defaults: f.defaults },
  { place: f.jurisdiction, use: f.use, value: f.value, share: f.share, land: f.land }],
  businessDays: (f) => [{ mode: f.mode, place: f.place, start: f.start, end: f.end, count: f.count }],
});
Object.assign(ENGINE_LABELS, {
  companyTax: { rate: (v) => `tax rate ${v}%`, tax: 'tax', imputationRate: (v) => `franking rate ${v}%`, maximum: 'maximum franking credit',
    credit: 'franking credit', net: (v) => (v < 0 ? `refund ${dollars(-v)}` : `tax left to pay ${dollars(v)}`) },
  foreignSurcharge: { dutyRate: (v) => (v === null ? 'no duty surcharge' : `duty surcharge rate ${v}%`), duty: 'duty surcharge',
    land: 'land tax surcharge' },
  businessDays: { days: (v) => `${v} business ${v === 1 ? 'day' : 'days'}`, date: (v) => `date ${longDay(v)}` },
});
const businessDayRows = JSON.parse(readFileSync(new URL('../_data/payday_super_business_days.json', import.meta.url), 'utf8')).non_business_days;
const businessDayHolidays = calculations.parseHolidays(JSON.stringify(businessDayRows));

// The GST margin scheme: how each call and result reads on its page, and how its form passes its fields.
const MARGIN_WHAT = { freehold: 'Freehold', stratum: 'Stratum unit', lease: 'Long-term lease', other: 'Not land, a unit or a long-term lease' };
const MARGIN_HOW = { margin: 'bought under the margin scheme', untaxed: 'bought in a sale not taxable',
  'before-2000': 'held since before 1 July 2000', 'full-gst': 'bought with GST on the whole price', special: 'acquired under section 75-11' };
const counted = (value) => Number(value).toLocaleString('en-AU');
Object.assign(INPUTS, {
  gstMarginScheme: (i) => `${MARGIN_WHAT[i.interest]}${i.taxable ? '' : ', not a taxable sale'}${i.agreed ? '' : ', no written agreement'}, `
    + `${MARGIN_HOW[i.acquired]}${i.associate ? ', sold to an associate' : ''}; price ${dollars(i.price)} GST-${i.basis}, `
    + `${i.method === 'valuation' ? 'valuation' : 'cost'} ${dollars(i.cost)}${i.part === i.whole ? '' : `, ${counted(i.part)} of ${counted(i.whole)}`}`,
});
Object.assign(FORM_CALLS, {
  gstMarginScheme: (f) => [{ interest: f.interest, taxable: f.taxable === 'yes', agreed: f.agreed === 'yes', acquired: f.acquired,
    associate: f.associate === 'yes', method: f.method, price: f.price, basis: f.basis, cost: f.cost, part: f.part, whole: f.whole }],
});
Object.assign(ENGINE_LABELS, {
  gstMarginScheme: { applies: (v) => (v ? 'margin scheme can apply' : 'margin scheme cannot apply'), share: (v) => `cost share ${dollars(v)}`,
    consideration: (v) => `GST-inclusive price ${dollars(v)}`, margin: (v) => `margin ${dollars(v)}`,
    schemeGst: (v) => `margin scheme GST ${dollars(v)}`, basicGst: (v) => `GST on the whole price ${dollars(v)}`,
    saving: (v) => `saved ${dollars(v)}`, gst: (v) => `GST payable ${dollars(v)}` },
});

test('the GST margin scheme page opens on GSTR 2006/8 Example 6 as its calculation gives it', () => {
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const html = calculatorInclude('gst-margin-scheme');
  const example = html.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/).slice(1);
  const r = calculations.gstMarginSchemeResult(FORM_CALLS.gstMarginScheme(formDefaults(html))[0], aud);
  assert.deepEqual([r.inputs, r.rows.map((row) => row.join('|')).join(';'), String(r.principal), r.note], example);
  assert.equal(r.rows[r.principal][1], '$13,636.36');
});

// GSTR 2006/8 Example 14 (paragraph 145): GST-inclusive price = ((E - C) / 10) + E, so the GST on a
// GST-exclusive price is 1/11 of the margin on the price it gives, to the cent either way.
test('a GST-exclusive price adds GST that is 1/11 of the margin on the price it makes', () => {
  const input = { interest: 'freehold', taxable: true, agreed: true, acquired: 'margin', associate: false, method: 'consideration',
    basis: 'exclusive', part: '1', whole: '1' };
  for (const [price, cost] of [['96364', '60000'], ['100000.05', '100000'], ['250000.01', '0'], ['900000000000.07', '1']]) {
    const exclusive = calculations.gstMarginScheme({ ...input, price, cost });
    const inclusive = calculations.gstMarginScheme({ ...input, basis: 'inclusive', price: exclusive.consideration.toFixed(2), cost });
    assert.equal(inclusive.schemeGst, exclusive.schemeGst, price);
  }
});

// Section 75-15 takes the exact proportion and s 9-90 rounds only the GST, as PR 740's command does: a share rounded
// to the cent first would move each of these GSTs by a cent.
test('the margin scheme GST on a lot is worked from the exact share and rounded once', () => {
  const input = { interest: 'freehold', taxable: true, agreed: true, acquired: 'margin', associate: false, method: 'consideration' };
  const inclusive = calculations.gstMarginScheme({ ...input, basis: 'inclusive', price: '863124.48', cost: '135641.61', part: '289', whole: '306' });
  assert.deepEqual([inclusive.share, inclusive.schemeGst], [128105.97, 66819.87]);
  const exclusive = calculations.gstMarginScheme({ ...input, basis: 'exclusive', price: '684719.36', cost: '80630.34', part: '781', whole: '4306' });
  assert.deepEqual([exclusive.share, exclusive.schemeGst], [14624.31, 67009.5]);
  // The margin shown is the exact one rounded: $1.00 less half of 1 cent is $0.995, so $1.00, not $1.00 less a rounded cent.
  const tiny = calculations.gstMarginScheme({ ...input, basis: 'inclusive', price: '1', cost: '0.01', part: '1', whole: '2' });
  assert.deepEqual([tiny.share, tiny.margin, tiny.schemeGst], [0.01, 1, 0.09]);
});

test('the margin scheme leaves the buyer without an input tax credit and says so', () => {
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  const call = FORM_CALLS.gstMarginScheme(formDefaults(calculatorInclude('gst-margin-scheme')))[0];
  assert.match(calculations.gstMarginSchemeResult(call, aud).note, /cannot claim an input tax credit .*section 75-20/);
  const ineligible = calculations.gstMarginSchemeResult({ ...call, acquired: 'full-gst' }, aud);
  assert.deepEqual(ineligible.rows[ineligible.principal], ['GST on the sale, 1/11 of the GST-inclusive price', '$17,272.73']);
  // PR 740's command names s 11-5: only a buyer making a creditable acquisition can claim the credit.
  assert.match(ineligible.note, /creditable acquisition \(section 11-5: .*can claim an input tax credit/);
  // A part acquired with GST on the whole price is refused with s 75-22, as the command refuses it.
  assert.throws(() => calculations.gstMarginScheme({ ...call, acquired: 'special' }), /section 75-22/);
});

test('the company tax law is the Income Tax Rates Act’s, and the page states it', () => {
  assert.deepEqual(COMPANY_TAX_LAW, { threshold: '50000000', passiveLimit: '80', baseRate: '25', rate: '30' });
  const html = readFileSync(new URL('../_includes/calculators/company-tax.html', import.meta.url), 'utf8');
  assert.match(html, /25% for a base rate entity and 30% otherwise, where a base rate entity has no more than 80% of its assessable income as base rate entity passive income and aggregated turnover of less than \$50 million/);
  assert.match(html, /Compilation No\. 66, 1 July 2026/);
});

// ATO, Allocating franking credits, example 2, read 18 November 2026: Dillmore Manufacture franks
// a $100,000 distribution at 30% and shows '$42,857.75' from a gross-up rate rounded to 2.3333.
// Section 202-60 gives $100,000 x 30/70 = $42,857.142857..., so the exact credit is $42,857.14.
test('a franking credit never exceeds the section 202-60 maximum, which is exact to the cent', () => {
  const dillmore = calculations.companyTax({ turnover: '45000000', assessable: '45000000', passive: '0', taxable: '0', existed: true,
    prior: { turnover: '52000000', assessable: '52000000', passive: '0' }, dividend: '100000', franking: '100', marginal: '0' });
  assert.deepEqual([dillmore.rate, dillmore.imputationRate, dillmore.maximum], [25, 30, 42857.14]);
  let seed = 20261118;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  const year = { turnover: '1', assessable: '1', passive: '0' };
  for (let i = 0; i < 500; i += 1) {
    const dividend = (next() / 100).toFixed(2);
    const franking = (next() % 10001 / 100).toFixed(2);
    for (const prior of [year, { ...year, turnover: '50000000' }]) {
      const r = calculations.companyTax({ ...year, taxable: '0', existed: true, prior, dividend, franking, marginal: '0' });
      // Whole cents: the maximum is the exact figure rounded down, and the credit is no more than it.
      const exact = Number(dividend) * 100 * r.imputationRate / (100 - r.imputationRate);
      assert.equal(Math.round(r.maximum * 100), Math.floor(exact + 1e-6), `${dividend}`);
      assert.ok(r.credit <= r.maximum, `${dividend} ${franking}`);
      assert.equal(r.net, -r.credit);
    }
  }
});

test('company tax refuses an unanswered question and figures it cannot work', () => {
  const happy = { turnover: '104000', assessable: '104000', passive: '4000' };
  const input = { ...happy, taxable: '104000', existed: true, prior: happy, dividend: '30000', franking: '100', marginal: '30' };
  assert.throws(() => calculations.companyTax({ ...input, existed: 'yes' }), { message: 'Say whether the company existed in the previous income year.' });
  assert.throws(() => calculations.companyTax({ ...input, prior: { ...happy, passive: '104000.01' } }),
    { message: 'Base rate entity passive income cannot be more than assessable income.' });
  for (const field of ['franking', 'marginal']) assert.throws(() => calculations.companyTax({ ...input, [field]: '100.01' }), field);
  for (const field of ['taxable', 'dividend']) assert.throws(() => calculations.companyTax({ ...input, [field]: '-0.01' }), field);
  assert.throws(() => calculations.companyTax({ ...input, dividend: '1.001' }), { message: 'Enter a number with no more than 2 decimal places.' });
  // A company that did not exist last year ignores last year's figures, however malformed.
  assert.equal(calculations.companyTax({ ...input, existed: false, prior: { turnover: '', assessable: '', passive: '' } }).imputation, 'new');
});

test('each foreign owner land tax surcharge scale is the land tax calculator’s', () => {
  for (const [code, law] of Object.entries(FOREIGN_SURCHARGES)) {
    assert.equal(law.land, landTaxPlaces[code]?.data.surcharge, code);
    assert.equal(law.trustLand, landTaxPlaces[code]?.data.trustSurcharge, code);
    assert.equal(law.name, PLACES[code]);
  }
});

const noAnswers = { type: 'individual', status: 'other', daysBefore: '0', daysDecember: '0', nzResident: false, resides: false, absent: false,
  home: false, overseas: false, largest: '0', combined: '0', absentee: '0', capital: '0', amendable: false, control: false, named: false, defaults: '0',
  exemption: false };
const surcharge = (buyer, place, use = 'residential') => calculations.foreignSurcharge({ ...noAnswers, ...buyer },
  { place, use, value: '1000000', share: '1000000', land: '1000000' });

// Each jurisdiction's test of a discretionary trust, as its revenue office states it (sources on the page).
test('each jurisdiction tests a discretionary trust its own way', () => {
  const trust = (answers) => ({ type: 'discretionary', ...answers });
  for (const [place, answers, foreign] of [
    ['AU-NSW', {}, false], ['AU-NSW', { capital: '0.01' }, true], ['AU-NSW', { amendable: true }, true],
    ['AU-VIC', { capital: '50' }, false], ['AU-VIC', { capital: '50.01' }, true],
    ['AU-QLD', { defaults: '49.99', capital: '100' }, false], ['AU-QLD', { defaults: '50' }, true],
    ['AU-WA', { defaults: '49.99' }, false], ['AU-WA', { control: true }, true], ['AU-WA', { defaults: '50' }, true],
    ['AU-SA', { capital: '100' }, false], ['AU-SA', { defaults: '0.01' }, true], ['AU-SA', { named: true }, true], ['AU-SA', { control: true }, true],
    ['AU-TAS', { capital: '49.99', defaults: '100' }, false], ['AU-TAS', { capital: '50' }, true]]) {
    assert.equal(surcharge(trust(answers), place).duty > 0, foreign, `${place} ${JSON.stringify(answers)}`);
  }
  // Victoria's land tax looks at named beneficiaries; the ACT's at a named person's most possible share.
  assert.equal(surcharge(trust({ capital: '100' }), 'AU-VIC').land, 0);
  assert.equal(surcharge(trust({ named: true }), 'AU-VIC').land, 40000);
  assert.equal(surcharge(trust({ capital: '100' }), 'AU-ACT').land, 0);
  assert.equal(surcharge(trust({ named: true, capital: '49.99' }), 'AU-ACT').land, 0);
  assert.equal(surcharge(trust({ named: true, capital: '50' }), 'AU-ACT').land, 7500);
});

test('each jurisdiction tests an individual, a company and a super fund its own way', () => {
  // Victoria: a New Zealand citizen is foreign for duty unless resident 6 months; a complying fund never pays the absentee surcharge.
  assert.equal(surcharge({ status: 'nz' }, 'AU-VIC').duty, 80000);
  assert.equal(surcharge({ status: 'nz', nzResident: true }, 'AU-VIC').duty, 0);
  assert.equal(surcharge({ type: 'smsf', largest: '100', combined: '100', absentee: '100' }, 'AU-VIC').land, 0);
  assert.equal(surcharge({ type: 'smsf', largest: '100', combined: '100' }, 'AU-VIC').duty, 80000);
  // Victoria's absentee owner surcharge starts at $25,000 of land for a trust and $50,000 for anyone else.
  const vicLand = (buyer) => calculations.foreignSurcharge({ ...noAnswers, ...buyer },
    { place: 'AU-VIC', use: 'residential', value: '40000', share: '40000', land: '40000' }).land;
  assert.deepEqual([vicLand({ type: 'trust', largest: '100', combined: '100', absentee: '100' }), vicLand({ absent: true })], [1600, 0]);
  // SRO Victoria, Absentee fixed trusts, example 1 (read 18 November 2026): Clara, an absentee, holds half of the
  // ABC Fixed Trust's $1 million of land, so the surcharge is $500,000 x 4% = $20,000.
  assert.equal(surcharge({ type: 'trust', largest: '50', combined: '50', absentee: '50' }, 'AU-VIC').land, 20000);
  // Victoria's land tax counts absentee interests, not foreign ones: foreign owners who live here are no absentees.
  const resident = (type) => surcharge({ type, largest: '60', combined: '60', absentee: '0' }, 'AU-VIC');
  assert.deepEqual([resident('company').duty, resident('company').land, resident('trust').duty, resident('trust').land], [80000, 0, 80000, 0]);
  assert.equal(surcharge({ type: 'company', largest: '0', combined: '0', absentee: '50.01' }, 'AU-VIC').land, 40000);
  // A fixed trust wholly foreign held, a quarter for absentees, pays on that quarter of the land.
  assert.equal(surcharge({ type: 'trust', largest: '100', combined: '100', absentee: '25' }, 'AU-VIC').land, 10000);
  // Queensland's land tax surcharge on an individual is the absentee test, on 30 June.
  assert.equal(surcharge({ absent: false }, 'AU-QLD').land, 0);
  assert.equal(surcharge({ absent: true }, 'AU-QLD').land, 19500);
  assert.equal(surcharge({ absent: true, resides: true }, 'AU-QLD').land, 0);
  // A company: 50% or more in Queensland, more than 50% in Victoria, 20% for one person in NSW.
  const company = (combined, largest = combined) => ({ type: 'company', largest, combined });
  assert.deepEqual(['AU-NSW', 'AU-VIC', 'AU-QLD'].map((place) => surcharge(company('50'), place).duty > 0), [true, false, true]);
  assert.deepEqual(['AU-NSW', 'AU-VIC', 'AU-QLD'].map((place) => surcharge(company('39.99', '19.99'), place).duty > 0), [false, false, false]);
  assert.equal(surcharge(company('40', '10'), 'AU-NSW').duty, 90000);
  // Western Australia and South Australia levy no land tax surcharge; the Northern Territory neither surcharge.
  assert.deepEqual(['AU-WA', 'AU-SA', 'AU-NT'].map((place) => surcharge({}, place).land), [0, 0, 0]);
  assert.equal(surcharge({}, 'AU-NT').landTest, 'The Northern Territory charges no foreign owner land tax surcharge, and no land tax');
  assert.equal(surcharge({}, 'AU-ACT').dutyTest, 'The Australian Capital Territory charges no foreign purchaser duty');
  assert.equal(surcharge({}, 'AU-NSW', 'primary').dutyTest, 'No surcharge: New South Wales charges it on residential property only');
});

test('foreign surcharges refuse what each Commissioner decides and answers they cannot use', () => {
  const purchase = { place: 'AU-NSW', use: 'residential', value: '1000000', share: '1000000', land: '1000000' };
  for (const [buyer, change, message] of [
    [{ nzResident: 'no' }, {}, 'Answer each yes or no question.'],
    [{ largest: '30', combined: '20' }, {}, 'The largest foreign interest cannot be more than all foreign interests together.'],
    [{}, { share: '1000001' }, 'The buyer’s share cannot be worth more than the whole property.'],
    [{}, { place: 'AU' }, 'Choose a state or territory.'], [{}, { use: 'farm' }, 'Choose what the property is used for.'],
    [{ type: 'partnership' }, {}, 'Choose who is buying.'], [{ status: 'resident' }, {}, 'Choose the individual’s citizenship or visa.']]) {
    assert.throws(() => calculations.foreignSurcharge({ ...noAnswers, ...buyer }, { ...purchase, ...change }), { message }, message);
  }
  for (const days of ['367', '-1', '200.5']) assert.throws(() => surcharge({ daysBefore: days }, 'AU-NSW'), days);
  // A partner visa is refused only for an individual: a company's status answer is not used.
  assert.equal(surcharge({ type: 'company', status: 'partner' }, 'AU-NSW').duty, 0);
});

test('provisional public holidays fall outside the business days coverage, and the state-only days are not in the table', () => {
  const { until, ...shorter } = BUSINESS_DAYS_COVERAGE;
  const provisional = businessDayRows.filter((row) => row.provisional);
  assert.ok(provisional.length > 0);
  for (const row of provisional) {
    assert.ok(row.date > shorter.any, row.date);
    for (const place of row.jurisdictions) assert.ok(row.date > (shorter[place] ?? until), `${row.date} ${place}`);
  }
  for (const { date, jurisdictions } of STATE_ONLY_HOLIDAYS) {
    assert.ok(!businessDayRows.some((row) => row.date === date && row.jurisdictions.some((place) => jurisdictions.includes(place))), date);
  }
  assert.deepEqual(businessDayHolidays.map(({ date }) => date), businessDayRows.filter((row) => !row.provisional).map(({ date }) => date));
  assert.deepEqual(Object.keys(BUSINESS_DAY_PLACES), [...new Set(businessDayRows.flatMap(({ jurisdictions }) => jurisdictions))].sort());
});

test('business days refuse an unusable table, an impossible date and a count they cannot work', () => {
  for (const text of ['{}', '[{"date":"2026-1-1","name":"x","jurisdictions":[],"provisional":false}]', '[{"date":"2026-01-01"}]']) {
    assert.throws(() => calculations.parseHolidays(text), { message: 'The public holiday table is not usable.' }, text);
  }
  const days = (question) => calculations.businessDays({ mode: 'count', place: 'NSW', start: '2026-11-18', end: '2026-11-18', count: '1',
    ...question }, businessDayHolidays);
  assert.throws(() => days({ start: '2026-02-29' }), { message: 'Enter the start date as a date.' });
  assert.throws(() => days({ end: '18/11/2026' }), { message: 'Enter the end date as a date.' });
  assert.throws(() => days({ mode: 'add', count: '0' }));
  assert.throws(() => days({ mode: 'add', count: '1.5' }));
  assert.throws(() => days({ place: 'AU-NSW' }), { message: 'Choose a state or territory.' });
  assert.throws(() => days({ mode: 'sum' }), { message: 'Choose what to work out.' });
  assert.throws(() => days({ start: '2025-12-31' }), { message: /^This page has public holidays from 1 January 2026 to 31 December 2027/ });
  // Melbourne Cup Day is not a holiday throughout Victoria in the table, so 'any' does not skip it.
  assert.equal(days({ place: 'any', start: '2026-11-02', end: '2026-11-04' }).days, 2);
  // The last covered day counts, and a count back stops at the first covered day.
  assert.equal(days({ start: '2027-12-30', end: '2027-12-31' }).days, 1);
  assert.equal(days({ mode: 'subtract', start: '2026-01-05', count: '1' }).date, '2026-01-02');
  assert.throws(() => days({ mode: 'subtract', start: '2026-01-02', count: '1' }));
  // A count and its reverse agree, and the holidays skipped are listed in date order either way.
  const on = days({ mode: 'add', start: '2026-12-21', count: '10' });
  assert.equal(days({ end: on.date, start: '2026-12-21' }).days, 10);
  assert.equal(days({ mode: 'subtract', start: on.date, count: '10' }).date, '2026-12-21');
  assert.deepEqual(on.skipped.map(({ date }) => date), ['2026-12-25', '2026-12-28', '2027-01-01']);
  assert.deepEqual(days({ mode: 'subtract', start: on.date, count: '10' }).skipped.map(({ date }) => date), ['2026-12-25', '2026-12-28', '2027-01-01']);
});

test('the company tax, foreign surcharge, business days, loan and hire purchase pages open on the result their calculations give', () => {
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const example = (page) => calculatorInclude(page).match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/).slice(1);
  const shown = (result) => [result.inputs, result.rows.map((row) => row.join('|')).join(';'), String(result.principal), result.note];
  const opening = (page) => FORM_CALLS[shownCases[page].function](formDefaults(calculatorInclude(page)))[0];
  assert.deepEqual(shown(calculations.companyTaxResult(opening('company-tax'), aud)), example('company-tax'));
  const [buyer, purchase] = FORM_CALLS.foreignSurcharge(formDefaults(calculatorInclude('foreign-surcharge')));
  assert.deepEqual(shown(calculations.foreignSurchargeResult(buyer, purchase, surchargeGenerals(purchase.value),
    formDefaults(calculatorInclude('foreign-surcharge')).firb, aud)), example('foreign-surcharge'));
  assert.deepEqual(shown(calculations.businessDaysResult(opening('business-days'), businessDayHolidays)), example('business-days'));
  assert.deepEqual(shown(calculations.financeResult(opening('loan'), aud)), example('loan'));
  assert.deepEqual(shown(calculations.financeResult(opening('hire-purchase'), aud, formDefaults(calculatorInclude('hire-purchase')).agreement)),
    example('hire-purchase'));
});

// The SGC and Payday Super page: how each call and result reads.
const sgcHtml = readFileSync(new URL('../_includes/calculators/sgc-payday.html', import.meta.url), 'utf8');
const plainDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
Object.assign(INPUTS, {
  paydaySuperCharge: (x) => {
    const timing = { standard: '7 business days', first: '20 business days for a first contribution',
      'out-of-cycle': `out of cycle, next regular payday ${plainDate(x.nextPayday)}`,
      exceptional: `determination made ${plainDate(x.determination)}`,
      'first-out-of-cycle': `20 business days for a first contribution, out of cycle, next regular payday ${plainDate(x.nextPayday)}`,
      'out-of-cycle-exceptional': `out of cycle, next regular payday ${plainDate(x.nextPayday)}, determination made ${plainDate(x.determination)}` }[x.timing];
    const charge = x.late === '0' && x.onTime !== '0' ? [] : [
      ...(x.late === '0' ? [] : [`late ${dollars(Number(x.late))} received ${plainDate(x.received)}`]),
      `assessed ${plainDate(x.assessment)}`, `${x.assessed === 'yes' ? 'an' : 'no'} earlier ATO-initiated assessment`,
      x.disclosure === 'lodged' ? `disclosure lodged ${plainDate(x.lodged)}` : 'no disclosure',
      ...(x.assessment > '2027-01-01' ? [`GIC ${x.assumedRate}% assumed after 2026`] : [])];
    return [`Payday ${plainDate(x.payday)}`, timing, `earnings ${dollars(Number(x.earnings))}`,
      ...(x.earlier === '0' ? [] : [`${dollars(Number(x.earlier))} earlier in 2026-27`]),
      `on time ${dollars(Number(x.onTime))}`, ...charge].join('; ');
  },
  quarterlySgCharge: (x) => `Quarter ${x.quarter} of ${x.year}; salary or wages ${dollars(Number(x.wages))}; `
    + `ordinary time earnings ${dollars(Number(x.ote))}; contributions ${dollars(Number(x.contributions))}; lodged ${plainDate(x.lodged)}`,
});
Object.assign(FORM_CALLS, { paydaySuperCharge: (f) => [{ payday: f.payday, timing: f.timing, nextPayday: f['next-payday'],
  determination: f.determination, earnings: f.earnings, earlier: f.earlier, onTime: f['on-time'], late: f.late, received: f.received,
  assessment: f.assessment, assessed: f.assessed, disclosure: f.disclosure, lodged: f.disclosed, assumedRate: f['assumed-rate'] }] });
Object.assign(ENGINE_LABELS, {
  paydaySuperCharge: { due: (v) => `due ${longDay(v)}`, rule: (v) => v, sgAmount: (v) => `SG amount ${dollars(v)}`,
    base: (v) => `base shortfall ${dollars(v)}`, final: (v) => `final shortfall ${dollars(v)}`,
    days: (v) => `${v} days of notional earnings`, assumedDays: (v) => `${v} days at the assumed rate`,
    notional: (v) => `notional earnings ${dollars(v)}`, upliftPercent: (v) => `uplift ${v}%`, uplift: (v) => `uplift ${dollars(v)}`,
    charge: (v) => `SG charge ${dollars(v)}` },
  quarterlySgCharge: { payable: (v) => `payable ${longDay(v)}`, chargePercent: (v) => `charge percentage ${v.toFixed(2)}%`,
    shortfall: (v) => `shortfall ${dollars(v)}`, days: (v) => `${v} days`, interest: (v) => `nominal interest ${dollars(v)}`,
    administration: (v) => `administration component ${dollars(v)}`, charge: (v) => `SG charge ${dollars(v)}` },
});

test('Payday Super due dates count business days from the site’s calendar, to its last verified day', () => {
  const csv = readFileSync(new URL('../tools/payday-super/business-days/payday-super-business-days.csv', import.meta.url), 'utf8')
    .trim().split(/\r?\n/).slice(1).map((line) => line.split(',')[0]);
  assert.deepEqual(calculations.NON_BUSINESS_WEEKDAYS, csv);
  const calendar = JSON.parse(readFileSync(new URL('../_data/payday_super_business_days.json', import.meta.url), 'utf8'));
  assert.equal(calculations.CALENDAR_END, calendar.verified_until);
  const due = (payday, timing = 'standard', nextPayday = '', determination = '') =>
    calculations.paydaySuperDue({ payday, timing, nextPayday, determination }).due;
  // 3 August 2026 (NT Picnic Day) is not a business day; a weekend is not either.
  assert.equal(due('2026-07-23'), '2026-08-04');
  assert.equal(due('2026-07-24'), '2026-08-05');
  assert.equal(due('2027-06-30', 'first'), '2027-07-28');
  assert.throws(() => due('2027-06-30', 'out-of-cycle', '2027-08-24'),
    { message: 'That due date falls after 31 August 2027, where the business day calendar ends.' });
  assert.throws(() => due('2026-09-03', 'out-of-cycle', '2026-09-03'), { message: 'The next regular payday must be after the out-of-cycle payday.' });
  assert.throws(() => due('2026-09-03', 'weekly'), { message: 'Choose how long the fund has to receive the contribution.' });
  // Where more than one longer period applies, the fund has to the end of the latest (ATO LCR 2026/2
  // Example 9). An out-of-cycle bonus on Friday 7 August 2026 under a determination made on 7 August:
  // item 3 runs to 4 September; with the next regular payday on 10 September, item 2 runs to 21 September.
  const both = (next) => calculations.paydaySuperDue({ payday: '2026-08-07', timing: 'out-of-cycle-exceptional', nextPayday: next,
    determination: '2026-08-07' });
  assert.deepEqual(both('2026-09-10'), { due: '2026-09-21',
    rule: '7 business days after the next regular payday, subsection 18C(2) item 2' });
  assert.deepEqual(both('2026-08-10'), { due: '2026-09-04',
    rule: 'the later of 20 business days after payday and after the determination, subsection 18C(2) item 3' });
  // A new employee's first pay is a bonus paid out of cycle on 9 July 2026: item 1 runs to 7 August,
  // and item 2 to 7 business days after the next regular payday when that is later.
  assert.equal(due('2026-07-09', 'first-out-of-cycle', '2026-07-16'), '2026-08-07');
  assert.equal(due('2026-07-09', 'first-out-of-cycle', '2026-08-06'), '2026-08-17');
  for (const day of ['2026-02-30', '30/07/2026', '', '2027-07-01']) {
    assert.throws(() => due(day), { message: 'Enter a payday from 1 July 2026 to 30 June 2027.' }, day);
  }
});

// ATO, 'Making a voluntary disclosure for Payday Super' (last updated 1 July 2026), read 18 November
// 2026, Juliet: '$24.74' of notional earnings on $3,600 paid 25 days late and '$49.65 (based on 50
// days)', both at the 10% the example assumes.
test('notional earnings compound daily as the ATO’s Juliet example does', () => {
  const tenPercent = (days) => Array.from({ length: days }, () => [1000, 365]);
  assert.equal(calculations.compoundedEarnings(360000, tenPercent(25)), 2474);
  assert.equal(calculations.compoundedEarnings(360000, tenPercent(50)), 4965);
  assert.equal(calculations.compoundedEarnings(360000, []), 0);
  // Juliet's funds received the contributions on 10 December, 25 days after the 15 November due
  // date, and the 25 days include that day. The same count here, due 16 November 2026.
  const juliet = calculations.paydaySuperCharge({ payday: '2026-11-05', timing: 'standard', nextPayday: '', determination: '',
    earnings: '1000', earlier: '0', onTime: '0', late: '120', received: '2026-12-11', assessment: '2027-02-01', assessed: 'no',
    disclosure: 'none', lodged: '', assumedRate: '11.51' });
  assert.deepEqual([juliet.due, juliet.days, juliet.earningsTo, juliet.assumedDays], ['2026-11-16', 25, '2026-12-11', 0]);
});

// ATO, LCR 2026/3 Payday Super: calculation and assessment of the superannuation guarantee charge
// (5 August 2026), read 18 November 2026, paragraphs 176 to 181: at an assumed 10%, William's $510
// for 48 days gives '$6.75', Ella's $460 for the 19 days to and including the receipt day '$2.40',
// Kai's $750 for 48 days '$9.93', each rounded to the cent, and the uplift is '40% × ($1,160 +
// $19.08) = $471.63'.
test('notional earnings and the uplift round per employee as LCR 2026/3’s Employer Co example does', () => {
  const tenPercent = (days) => Array.from({ length: days }, () => [1000, 365]);
  assert.equal(calculations.compoundedEarnings(51000, tenPercent(48)), 675);
  assert.equal(calculations.compoundedEarnings(46000, tenPercent(19)), 240);
  assert.equal(calculations.compoundedEarnings(75000, tenPercent(48)), 993);
  assert.equal(675 + 240 + 993, 1908);
  // The same count through the engine: due 11 August 2026, receipt on 30 August is the 19th day.
  const ella = calculations.paydaySuperCharge({ payday: '2026-07-30', timing: 'standard', nextPayday: '', determination: '',
    earnings: '5500', earlier: '0', onTime: '200', late: '460', received: '2026-08-30', assessment: '2026-09-29', assessed: 'no',
    disclosure: 'none', lodged: '', assumedRate: '11.51' });
  assert.deepEqual([ella.due, ella.base, ella.final, ella.days], ['2026-08-11', 460, 0, 19]);
});

// Regulation 13D counts from the payday: the 30-day period starting on it ends on day 29. Earnings
// of $6,500 on 6 August 2026 give an SG amount of $780, due 17 August; $540 arrived on 2 September.
test('the administrative uplift falls by the regulation 13C and 13D points, to nil at most', () => {
  const base = { payday: '2026-08-06', timing: 'standard', nextPayday: '2026-08-06', determination: '2026-08-06', earnings: '6500',
    earlier: '0', onTime: '0', late: '540', received: '2026-09-02', assessment: '2027-06-30', assessed: 'yes', disclosure: 'lodged',
    lodged: '2026-08-06', assumedRate: '11.51' };
  for (const [lodged, percent] of [['2026-09-04', 20], ['2026-09-05', 25], ['2026-10-04', 25], ['2026-10-05', 30],
    ['2026-12-03', 30], ['2026-12-04', 45], ['2027-06-29', 45]]) {
    assert.equal(calculations.paydaySuperCharge({ ...base, lodged }).upliftPercent, percent, lodged);
  }
  assert.equal(calculations.paydaySuperCharge({ ...base, disclosure: 'none' }).upliftPercent, 60);
  assert.equal(calculations.paydaySuperCharge({ ...base, assessed: 'no' }).upliftPercent, 0);
  assert.equal(calculations.paydaySuperCharge({ ...base, assessed: 'no', lodged: '2026-12-04' }).upliftPercent, 25);
  const r = calculations.paydaySuperCharge({ ...base, assessed: 'no', disclosure: 'none' });
  assert.equal(r.uplift, Math.round((r.final + r.notional) * 40) / 100);
  assert.equal(r.charge, Math.round((r.final + r.notional + r.uplift) * 100) / 100);
  assert.throws(() => calculations.paydaySuperCharge({ ...base, assessed: 'maybe' }),
    { message: 'Choose whether the ATO assessed or estimated SG charge for this employer from 1 July 2026 to the payday.' });
  assert.throws(() => calculations.paydaySuperCharge({ ...base, disclosure: 'yes' }),
    { message: 'Choose whether a voluntary disclosure statement was lodged.' });
});

test('the SGC page refuses malformed, nil and out-of-range money instead of reading it as nil', () => {
  const pay = { payday: '2026-07-30', timing: 'standard', nextPayday: '2026-07-30', determination: '2026-07-30', earnings: '1000',
    earlier: '0', onTime: '0', late: '120', received: '2026-08-25', assessment: '2026-12-01', assessed: 'no', disclosure: 'none',
    lodged: '2026-07-30', assumedRate: '11.51' };
  for (const field of ['earnings', 'earlier', 'onTime', 'late']) {
    for (const value of ['', 'abc', '-1', '1e3', '100.001', '1000000001']) {
      assert.throws(() => calculations.paydaySuperCharge({ ...pay, [field]: value }), Error, `${field} ${value}`);
    }
  }
  assert.throws(() => calculations.paydaySuperCharge({ ...pay, earnings: '0' }),
    { message: 'Enter the qualifying earnings paid on the payday, above nil.' });
  for (const rate of ['0', '100.01', '']) assert.throws(() => calculations.paydaySuperCharge({ ...pay, assumedRate: rate }), Error, rate);
  const quarter = { year: '2025-26', quarter: '1', wages: '12000', ote: '10000', contributions: '0', lodged: '2025-11-20' };
  for (const field of ['wages', 'ote', 'contributions']) {
    for (const value of ['', 'abc', '-1', '100.001']) {
      assert.throws(() => calculations.quarterlySgCharge({ ...quarter, [field]: value }), Error, `${field} ${value}`);
    }
  }
  assert.throws(() => calculations.quarterlySgCharge({ ...quarter, year: '2021-22' }), { message: 'Choose the income year of the quarter.' });
  assert.throws(() => calculations.quarterlySgCharge({ ...quarter, quarter: '5' }), { message: 'Choose the quarter.' });
});

test('the SGC page opens on the result its calculation gives for the form’s inputs, and cites each source with its date', () => {
  const example = sgcHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)"(?: note="([^"]*)")? %\}/);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const fields = formDefaults(sgcHtml);
  const result = calculations.sgcPaydayResult((name) => fields[name], aud);
  assert.equal(result.inputs, example[1]);
  assert.equal(result.rows.map((row) => row.join('|')).join(';'), example[2]);
  assert.equal(String(result.principal), example[3]);
  assert.equal(result.note, example[4]);
  for (const cited of ['(Compilation No. 78, 1 July 2026), read 18 November 2026', '(Compilation No. 8, 1 July 2026), read 18 November 2026',
    '(last updated 29 September 2026), read 18 November 2026', '(last updated 17 April 2026), read 18 November 2026',
    '(last updated 4 September 2026), read 18 November 2026', '(Compilation No. 77)', '(Compilation No. 7)']) {
    assert.ok(sgcHtml.includes(cited), cited);
  }
  // The quarterly form opens on one of the Imogen example's 30 employees.
  const quarter = calculations.sgcPaydayResult((name) => ({ ...fields, regime: 'quarter' })[name], aud);
  assert.equal(quarter.rows.at(-1).join('|'), 'SG charge for the quarter|$1,519.18');
});

// The foreign surcharge page's general duty in each jurisdiction, as its radios' scales give it.
const surchargeGenerals = (value) => Object.fromEntries(Object.keys(PLACES).map((place) => [place, transferDuty(value, transferDutyScales[place]).duty]));
Object.assign(INPUTS, {
  firbFee: (kind, consideration) => `${{ none: 'No FIRB application', vacant: 'Residential land without an established dwelling',
    established: 'An established dwelling' }[kind]}, consideration ${dollars(consideration)}`,
});

test('the FIRB fee follows Guidance Note 10’s steps and examples for 2026-27', () => {
  const fee = (kind, consideration) => calculations.firbFee(kind, consideration).fee;
  // Guidance Note 10 (version 12), examples 2 and 3: $2 million of residential land.
  assert.equal(fee('vacant', '2000000'), 31300);
  assert.equal(fee('established', '2000000'), 93900);
  // The schedule of fees (version 8): each step, the $75,000 lower fee and the cap above $40 million.
  for (const [consideration, vacant, established] of [['1', 4600, 13800], ['74999', 4600, 13800], ['75000', 15600, 46800],
    ['1000000', 15600, 46800], ['1000001', 31300, 93900], ['3000000', 62600, 187800], ['3000001', 93900, 281700],
    ['40000000', 1220700, 3662100], ['40000001', 1245500, 3736500], ['1000000000', 1245500, 3736500]]) {
    assert.deepEqual([fee('vacant', consideration), fee('established', consideration)], [vacant, established], consideration);
  }
  assert.equal(fee('none', '2000000'), 0);
  assert.throws(() => fee('commercial', '2000000'), { message: 'Choose whether a FIRB application is made, and for which kind of residential land.' });
  for (const consideration of ['0', '', '1.5', '-1', '1000000001']) assert.throws(() => fee('vacant', consideration), Error, consideration);
});

test('the foreign surcharge page compares every jurisdiction and adds the FIRB fee to the upfront total', () => {
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const [buyer, purchase] = FORM_CALLS.foreignSurcharge(formDefaults(calculatorInclude('foreign-surcharge')));
  const result = (firb, change = {}) => calculations.foreignSurchargeResult(buyer, { ...purchase, ...change },
    surchargeGenerals(change.value ?? purchase.value), firb, aud);
  const vacant = result('vacant');
  assert.deepEqual(vacant.tables.places.map((row) => row[0]), Object.values(PLACES));
  // Each row is that jurisdiction's own general duty and surcharge, with the one FIRB fee.
  for (const [i, place] of Object.keys(PLACES).entries()) {
    const general = transferDuty(purchase.value, transferDutyScales[place]).duty;
    const surcharge = calculations.foreignSurcharge(buyer, { ...purchase, place }).duty;
    assert.deepEqual(vacant.tables.places[i], [PLACES[place], aud(general), aud(surcharge), aud(Math.round((general + surcharge + 15600) * 100) / 100)]);
  }
  assert.deepEqual(vacant.tables.places[0], ['New South Wales', '$39,187.00', '$90,000.00', '$144,787.00']);
  assert.deepEqual(vacant.tables.places[7].slice(2), ['$0.00', aud(transferDuty(purchase.value, transferDutyScales['AU-NT']).duty + 15600)]);
  // Without an application there is no fee row and the total is the duty and surcharge.
  const none = result('none');
  assert.equal(none.rows.some(([label]) => label.startsWith('FIRB')), false);
  assert.deepEqual(none.rows.find(([label]) => label.startsWith('Upfront total')), ['Upfront total: general duty and duty surcharge', '$129,187.00']);
  // An established dwelling's fee is tripled, and the result names the ban.
  const established = result('established');
  assert.deepEqual(established.rows.find(([label]) => label.startsWith('FIRB')), ['FIRB application fee for 2026-27 on the buyer’s share', '$46,800.00']);
  assert.match(established.note, /From 1 April 2025 to 30 June 2029 foreign persons are generally banned from buying established dwellings/);
  // A buyer of a share pays that share of the fee on the whole property (Guidance Note 10, tenants in
  // common rule): half of $125,200 on $5 million, and half of $31,300 on $1.2 million, not the $15,600
  // a $600,000 purchase alone would pay.
  const firbOn = (share, value) => result('vacant', { share, value }).rows.find(([label]) => label.startsWith('FIRB'))[1];
  assert.equal(firbOn('2500000', '5000000'), '$62,600.00');
  assert.equal(firbOn('600000', '1200000'), '$15,650.00');
  assert.equal(firbOn('1', '3'), '$1,533.33');
  // Joint tenants share one fee on the whole, which the note names; a buyer of the whole gets no such note.
  assert.match(result('vacant', { share: '600000', value: '1200000' }).note, /joint tenants pay one fee of \$31,300\.00 on the whole property/);
  assert.doesNotMatch(vacant.note, /joint tenants/);
  // Not residential: no general duty, no comparison, and no residential land fee.
  const generals = Object.fromEntries(Object.keys(PLACES).map((place) => [place, null]));
  const other = calculations.foreignSurchargeResult(buyer, { ...purchase, use: 'other' }, generals, 'none', aud);
  assert.equal(other.tables.places, undefined);
  assert.equal(other.rows.some(([label]) => label.startsWith('Upfront total')), false);
  assert.throws(() => calculations.foreignSurchargeResult(buyer, { ...purchase, use: 'other' }, generals, 'vacant', aud),
    { message: 'The FIRB fee here is for residential land; agricultural and commercial land have their own fee steps.' });
});

// The CGT page: how each call and result reads.
const cgtHtml = readFileSync(new URL('../_includes/calculators/cgt.html', import.meta.url), 'utf8');
const cgtPlain = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const CGT_WHO = { individual: 'Individual', trust: 'Trust', super: 'Complying super fund', company: 'Company' };
const CGT_KIND = { investment: 'investment', equity: 'shares or units held at least 10%', home: 'home', personal: 'personal use asset' };
const CGT_METHOD = { discount: 'discount method', indexation: 'indexation method', other: 'other method', loss: 'a capital loss',
  exempt: 'fully exempt', nil: 'no gain or loss' };
Object.assign(INPUTS, {
  capitalGain: (x) => {
    const money = (v) => dollars(Number(v));
    const costs = [`price ${money(x.price)}`, Number(x.buying.amount) && `buying ${money(x.buying.amount)} on ${cgtPlain(x.buying.date)}`,
      ...x.improvements.filter((c) => Number(c.amount)).map((c) => `cost ${money(c.amount)} on ${cgtPlain(c.date)}`),
      Number(x.selling) && `selling ${money(x.selling)}`, Number(x.owning) && `owning ${money(x.owning)}`,
      Number(x.works) && `capital works ${money(x.works)}`].filter(Boolean);
    const parts = [`${CGT_WHO[x.entity]}${x.resident === 'yes' ? '' : ', not resident'}, ${CGT_KIND[x.kind]}`,
      `bought ${cgtPlain(x.acquired)}, sold ${cgtPlain(x.event)} for ${money(x.proceeds)}`, costs.join(', ')];
    if (Number(x.currentLosses) || Number(x.priorLosses)) parts.push(`losses ${money(x.currentLosses)} this year, ${money(x.priorLosses)} earlier`);
    if (x.entity === 'individual') parts.push(`other income ${money(x.income)}`);
    if (x.kind === 'home') {
      const h = x.home;
      parts.push(`settled ${cgtPlain(h.purchased)} and ${cgtPlain(h.sold)}, moved in ${cgtPlain(h.movedIn)}`
        + `${h.practicable === 'yes' ? '' : ', not as soon as practicable'}`, ...h.away.filter((a) => a.from)
        .map((a) => `away ${cgtPlain(a.from)} to ${cgtPlain(a.to)}${a.rented ? ', rented' : ''}${a.choose ? ', chosen' : ''}`));
      if (Number(h.partPercent)) parts.push(`${h.partPercent}% used for income ${cgtPlain(h.partFrom)} to ${cgtPlain(h.partTo)}`);
      if (Number(h.market)) parts.push(`market value ${money(h.market)}`);
      if (h.exclusions !== 'none') parts.push('an excluded case');
    }
    return parts.join('; ');
  },
});
Object.assign(FORM_CALLS, { capitalGain: (f) => [calculations.cgtEventOf((name) => f[name], (name) => f[name])] });
Object.assign(ENGINE_LABELS, {
  capitalGain: { method: (v) => CGT_METHOD[v], costBase: 'cost base', indexedCostBase: 'indexed cost base',
    reducedCostBase: 'reduced cost base', gain: 'capital gain', loss: 'capital loss', discount: 'discount', net: 'net capital gain',
    labelA: (v) => `label A $${v.toLocaleString('en-AU')}`, carried: 'losses carried forward',
    ownershipDays: (v) => `${v.toLocaleString('en-AU')} ownership days`,
    nonMainDays: (v) => `${v.toLocaleString('en-AU')} non-main residence days`, partDays: (v) => `${v.toLocaleString('en-AU')} part-use days`,
    incomeTime: (v) => (v ? `taken to be acquired ${cgtPlain(v)}` : 'section 118-192 does not apply'), tax: 'extra tax' },
});
const cgtBase = () => structuredClone(shownCases.cgt.rows[0].call[0]);
/** A call the CGT page must work, not refuse: a refusal fails an assertion. @param {() => any} call */
const cgtWorks = (call) => {
  try {
    return call();
  } catch (error) {
    return assert.fail(`refused: ${error.message}`);
  }
};

// ATO, Guide to capital gains tax 2026, 'How to work out your capital gain or capital loss' (last
// updated 30 May 2026), read 19 November 2026: example 12, '68.7 ÷ 63.8 = 1.077'; example 13,
// '68.7 ÷ 59.0 = 1.164' and '68.7 ÷ 59.3 = 1.159'. Appendix 2 (published 30 May 2026): the
// September 1985 quarter is the first, 39.7, and the September 1999 quarter the last, 68.7.
test('indexation factors are the ATO’s, from the September 1985 quarter to September 1999', () => {
  assert.equal(calculations.indexationFactor('1995-03-15'), 1077n);
  assert.equal(calculations.indexationFactor('1991-06-24'), 1164n);
  assert.equal(calculations.indexationFactor('1991-09-30'), 1159n);
  assert.equal(calculations.indexationFactor('1985-07-01'), 1730n);
  assert.equal(calculations.indexationFactor('1999-06-30'), 1009n);
  assert.equal(calculations.indexationFactor('1999-07-01'), 1000n);
  assert.equal(calculations.indexationFactor('2025-10-01'), 1000n);
  assert.deepEqual([calculations.CPI[1985], calculations.CPI[1990][3], calculations.CPI[1991][0], calculations.CPI[1999]],
    [[0, 0, 397, 405], 590, 589, [678, 681, 687, 0]]);
  assert.throws(() => calculations.indexationFactor('1985-06-30'),
    { message: 'The CPI index numbers start at the September 1985 quarter: enter a later date of expenditure.' });
});

test('the 12 months for the discount leave out the day bought and the day sold, and 29 February moves to 1 March', () => {
  const held = (acquired, event) => calculations.capitalGain({ ...cgtBase(), acquired, event, buying: { amount: '0', date: '' },
    improvements: [{ amount: '0', date: '' }, { amount: '0', date: '' }], works: '0' }).method;
  assert.equal(held('2025-02-02', '2026-02-03'), 'discount');
  assert.equal(held('2025-02-02', '2026-02-02'), 'other');
  // Acquired 28 February 2023: the 12 months run from 1 March 2023 to 29 February 2024.
  assert.equal(held('2023-02-28', '2024-02-29'), 'other');
  assert.equal(held('2023-02-28', '2024-03-01'), 'discount');
  // Acquired 29 February 2024: from 1 March 2024 to 28 February 2025.
  assert.equal(held('2024-02-29', '2025-02-28'), 'other');
  assert.equal(held('2024-02-29', '2025-03-01'), 'discount');
});

// Section 118-145(2) and the ATO's examples 77 and 79: 6 years for each absence while the home is
// rented, unlimited while it is not, and a new 6 years after moving back in.
test('the 6 years a rented home can stay the main residence run per absence, across its rows', () => {
  const sale = (away, market = '0') => calculations.capitalGain({ ...cgtBase(), kind: 'home', acquired: '2000-01-10', event: '2026-05-01',
    proceeds: '900000', price: '400000', buying: { amount: '0', date: '' }, improvements: [{ amount: '0', date: '' }, { amount: '0', date: '' }],
    selling: '0', works: '0', home: { ...cgtBase().home, purchased: '2000-02-10', sold: '2026-05-29', movedIn: '2000-02-10', market,
      away: [...away, ...Array.from({ length: 4 - away.length }, () => ({ from: '', to: '', rented: false, choose: false }))] } });
  const rented = (from, to, choose = true) => ({ from, to, rented: true, choose });
  // Example 79: 2 absences, each with 6 years rented and 2 vacant, 2 years home between them.
  const lana = sale([rented('2002-05-29', '2008-05-28'), { from: '2008-05-29', to: '2010-05-28', rented: false, choose: true },
    rented('2012-05-29', '2018-05-28'), { from: '2018-05-29', to: '2020-05-28', rented: false, choose: true }], '500000');
  assert.deepEqual([lana.method, lana.nonMainDays], ['exempt', 0]);
  // The 6 years run to the sixth anniversary inclusive, as the ATO's example 72 counts them, and its
  // example 80 counts a day fewer, so rent ending on the anniversary is refused, in one row or across
  // an absence's rows. The day before is within both counts; a day after is over under both, section
  // 118-192 then starts the ownership period at the first rent, and the result notes the count.
  const boundary = /examples 72 and 80 count the 6 years a rented home can stay the main residence a day apart/;
  const vacant = (from, to) => ({ from, to, rented: false, choose: true });
  assert.throws(() => sale([rented('2002-05-29', '2008-05-29'), vacant('2008-05-30', '2010-05-28'), vacant('2011-01-01', '2011-06-30')],
    '500000'), boundary);
  assert.throws(() => sale([rented('2002-05-29', '2005-05-28'), vacant('2005-05-29', '2006-05-28'), rented('2006-05-29', '2009-05-29')],
    '500000'), boundary);
  const within = cgtWorks(() => sale([rented('2002-05-29', '2008-05-28'), vacant('2008-05-29', '2010-05-28')], '500000'));
  assert.deepEqual([within.method, within.nonMainDays, within.sixYears], ['exempt', 0, false]);
  const over = cgtWorks(() => sale([rented('2002-05-29', '2008-05-30'), vacant('2008-05-31', '2010-05-28')], '500000'));
  assert.deepEqual([over.nonMainDays, over.incomeTime, over.ownershipDays, over.sixYears], [1, '2002-05-29', 8767, true]);
  // From 29 February the anniversary is 28 February or 1 March, so rent ending on either is refused.
  const leap = (to, back) => sale([rented('2004-02-29', to), vacant(back, '2012-05-28')], '500000');
  for (const [to, back] of [['2010-02-28', '2010-03-01'], ['2010-03-01', '2010-03-02']]) assert.throws(() => leap(to, back), boundary, to);
  assert.deepEqual([cgtWorks(() => leap('2010-02-27', '2010-02-28')).nonMainDays, cgtWorks(() => leap('2010-03-02', '2010-03-03')).nonMainDays],
    [0, 2]);
  // Rows that do not follow on are separate absences, each with its own 6 years.
  const apart = sale([rented('2002-05-29', '2008-05-28'), rented('2008-05-30', '2014-05-28')], '500000');
  assert.equal(apart.nonMainDays, 0);
  // Not choosing makes every day away a non-main residence day.
  const unchosen = sale([rented('2002-05-29', '2004-05-28', false)], '500000');
  assert.deepEqual([unchosen.nonMainDays, unchosen.incomeTime], [731, '2002-05-29']);
  assert.throws(() => sale([rented('2000-02-10', '2001-02-09')]),
    { message: 'Absence 1 must start after the home became the main residence and end by settlement of the sale.' });
  assert.throws(() => sale([rented('2002-05-29', '2004-05-28'), rented('2004-05-28', '2005-05-28')]),
    { message: 'Enter the absences in date order, without overlaps.' });
  assert.throws(() => sale([rented('2002-05-29', '2002-05-28')]), { message: 'Absence 1 must end on or after the day it starts.' });
  assert.throws(() => sale([rented('2002-05-29', '2026-05-29'), rented('2010-01-01', '2011-01-01')]),
    { message: 'Enter the absences in date order, without overlaps.' });
  assert.throws(() => sale([rented('2002-05-29', '2026-05-29')]),
    { message: 'Enter the market value when the home was first used to produce income (section 118-192).' });
});

// Section 118-190(3): use to produce income during a chosen absence is ignored only for a part not
// so used just before the move; ATO example 81's surgery stays taxable. Section 118-192 needs the
// home fully exempt until first used to produce income (ATO examples 68 and 69: not when used so
// from purchase), and a first use on 20 August 1996 turns on the time.
test('part use, and when section 118-192 applies to the home', () => {
  const sale = (home) => calculations.capitalGain({ ...cgtBase(), kind: 'home', acquired: '1994-01-10', event: '2025-05-01', proceeds: '600000',
    price: '200000', buying: { amount: '0', date: '' }, improvements: [{ amount: '0', date: '' }, { amount: '0', date: '' }], selling: '0',
    works: '0', home: { ...cgtBase().home, purchased: '1994-02-10', sold: '2025-05-29', movedIn: '1994-02-10', ...home } });
  const surgery = cgtWorks(() => sale({ partPercent: '25', partFrom: '1994-02-10', partTo: '2025-05-29',
    away: [{ from: '2019-07-01', to: '2025-05-29', rented: true, choose: true }, ...cgtBase().home.away.slice(1)] }));
  assert.deepEqual([surgery.incomeTime, surgery.partDays, surgery.gain], [null, 11432, 100000]);
  // Part use that began during a chosen absence is ignored for it (subsection 118-190(3)): refused.
  const away = [{ from: '2019-07-01', to: '2022-06-30', rented: false, choose: true }, ...cgtBase().home.away.slice(1)];
  for (const partFrom of ['2019-07-01', '2022-06-30']) {
    assert.throws(() => sale({ partPercent: '25', partFrom, partTo: '2025-05-29', market: '450000', away }), /subsection 118-190\(3\)/, partFrom);
  }
  assert.equal(sale({ partPercent: '25', partFrom: '2022-07-01', partTo: '2025-05-29', market: '450000', away }).incomeTime, '2022-07-01');
  // Part use that began past the 6 years of a rented absence is not under the choice, so it is worked.
  const pastSix = [{ from: '2010-01-01', to: '2025-05-29', rented: true, choose: true }, ...cgtBase().home.away.slice(1)];
  assert.equal(cgtWorks(() => sale({ partPercent: '25', partFrom: '2018-01-01', partTo: '2025-05-29', market: '450000', away: pastSix })).incomeTime,
    '2010-01-01');
  assert.equal(sale({ partPercent: '25', partFrom: '2019-07-01', partTo: '2025-05-29', market: '450000',
    away: [{ ...away[0], choose: false }, ...away.slice(1)] }).incomeTime, '2019-07-01');
  const later = sale({ partPercent: '25', partFrom: '2010-01-01', partTo: '2025-05-29', market: '450000' });
  assert.deepEqual([later.incomeTime, later.ownershipDays, later.partDays, later.gain], ['2010-01-01', 5628, 5628, 37500]);
  assert.throws(() => sale({ partPercent: '25', partFrom: '1996-08-20', partTo: '2025-05-29', market: '300000' }),
    { message: 'Whether section 118-192 applies to first use to produce income on 20 August 1996 turns on whether it began after '
      + '7.30 pm: this page cannot tell.' });
  const early = sale({ partPercent: '25', partFrom: '1996-08-19', partTo: '2025-05-29', market: '300000' });
  // $400,000 × 25% × 10,511 ÷ 11,432 days.
  assert.deepEqual([early.incomeTime, early.partDays, early.gain], [null, 10511, 91943.67]);
  // Moving in late, not as soon as practicable, means it was not fully exempt before the first use.
  const late = sale({ movedIn: '1995-02-10', practicable: 'no', partPercent: '25', partFrom: '2010-01-01', partTo: '2025-05-29', market: '450000' });
  assert.deepEqual([late.incomeTime, late.nonMainDays], [null, 365]);
  // A cost spent before the first use is in the market value that replaces the cost base.
  const improved = sale({ partPercent: '25', partFrom: '2010-01-01', partTo: '2025-05-29', market: '450000' });
  const withCost = calculations.capitalGain({ ...cgtBase(), kind: 'home', acquired: '1994-01-10', event: '2025-05-01', proceeds: '600000',
    price: '200000', buying: { amount: '0', date: '' }, improvements: [{ amount: '50000', date: '2005-03-01' }, { amount: '0', date: '' }],
    selling: '0', works: '0', home: { ...cgtBase().home, purchased: '1994-02-10', sold: '2025-05-29', movedIn: '1994-02-10', partPercent: '25',
      partFrom: '2010-01-01', partTo: '2025-05-29', market: '450000' } });
  assert.deepEqual([withCost.costBase, withCost.gain], [improved.costBase, improved.gain]);
  assert.throws(() => sale({ partPercent: '25', partFrom: '1994-02-09', partTo: '2025-05-29' }),
    { message: 'Enter the part used to produce income within the ownership period, from settlement to settlement.' });
  assert.throws(() => sale({ movedIn: '1994-02-09' }),
    { message: 'Enter the day you moved in from settlement of the purchase to settlement of the sale.' });
  assert.throws(() => sale({ exclusions: 'some' }), /does not work out a home on more than 2 hectares/);
  assert.throws(() => sale({ purchased: '1994-01-09' }), { message: 'Each settlement must be on or after its contract.' });
});

test('the CGT page refuses malformed, out-of-range and missing figures instead of reading them as nil', () => {
  for (const field of ['proceeds', 'price', 'selling', 'owning', 'works', 'currentLosses', 'priorLosses']) {
    for (const value of ['', 'abc', '-1', '1e3', '100.001', '1000000001']) {
      assert.throws(() => calculations.capitalGain({ ...cgtBase(), [field]: value }), Error, `${field} ${value}`);
    }
  }
  for (const value of ['', '90000.5', '-1']) assert.throws(() => calculations.capitalGain({ ...cgtBase(), income: value }), Error, value);
  assert.throws(() => calculations.capitalGain({ ...cgtBase(), acquired: '2026-02-30' }), { message: 'Enter the date of the purchase contract as a date.' });
  assert.throws(() => calculations.capitalGain({ ...cgtBase(), event: '2020-06-30' }), { message: 'Enter a sale contract from 1 July 2020 to 30 June 2027.' });
  assert.throws(() => calculations.capitalGain({ ...cgtBase(), acquired: '2026-02-01' }), { message: 'The sale contract must come after the purchase contract.' });
  assert.throws(() => calculations.capitalGain({ ...cgtBase(), entity: 'partnership' }), { message: 'Choose who made the capital gain or loss.' });
  assert.throws(() => calculations.capitalGain({ ...cgtBase(), improvements: [{ amount: '100', date: '' }, { amount: '0', date: '' }] }),
    { message: 'Enter the date of the improvement or title cost 1 as a date.' });
  assert.throws(() => calculations.capitalGain({ ...cgtBase(), improvements: [{ amount: '100', date: '1997-06-30' }, { amount: '0', date: '' }] }),
    { message: 'Enter the date of the improvement or title cost 1 from 1 July 1997 to 1 February 2026.' });
  assert.throws(() => calculations.capitalGain({ ...cgtBase(), works: '300000' }),
    { message: 'Capital works deductions cannot exceed the amounts spent on the asset.' });
  // Costs of owning are in the cost base unindexed and not in the reduced cost base (subsection 110-55(2)).
  const owned = calculations.capitalGain({ ...cgtBase(), owning: '1000' });
  assert.deepEqual([owned.costBase, owned.indexedCostBase, owned.reducedCostBase], [207245, 212493, 206245]);
  // A company gets no discount, so section 115-45 does not matter to its shares.
  const company = { ...cgtBase(), entity: 'company' };
  assert.deepEqual(cgtWorks(() => calculations.capitalGain({ ...company, kind: 'equity' })), calculations.capitalGain(company));
  for (const entity of ['individual', 'trust', 'super']) {
    assert.throws(() => calculations.capitalGain({ ...cgtBase(), entity, kind: 'equity' }), /section 115-45/, entity);
  }
  // Unused losses of this year and earlier years are both carried forward, with a capital loss.
  const antonio = shownCases.cgt.rows.find((row) => row.case.startsWith('ATO example 14')).call[0];
  assert.equal(calculations.capitalGain({ ...antonio, currentLosses: '1000', priorLosses: '400' }).carried, 3900);
  // When both methods leave nil, the one carrying more losses forward wins.
  const val = shownCases.cgt.rows.find((row) => row.case.startsWith('ATO example 13')).call[0];
  const both = calculations.capitalGain({ ...val, currentLosses: '200000' });
  assert.deepEqual([both.method, both.net, both.carried], ['indexation', 0, 38213]);
  // Capital works deductions on an asset acquired before 13 May 1997 come out of the reduced cost base
  // only, unless they can be on an improvement after 30 June 1999 (subsection 110-45(1A)).
  const before = calculations.capitalGain({ ...cgtBase(), acquired: '1997-05-12', buying: { amount: '20000', date: '1997-05-12' },
    improvements: [{ amount: '30000', date: '1999-06-30' }, { amount: '0', date: '' }] });
  assert.deepEqual([before.costBase, before.reducedCostBase], [206500, 206245]);
  assert.throws(() => calculations.capitalGain({ ...cgtBase(), acquired: '1997-05-12', buying: { amount: '20000', date: '1997-05-12' } }),
    /subsection 110-45\(1A\)/);
});

test('the CGT page opens on the result its calculation gives for the form’s inputs, and cites each source with its date', () => {
  const example = cgtHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)"(?: note="([^"]*)")? %\}/);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const fields = formDefaults(cgtHtml);
  const result = calculations.cgtResult((name) => fields[name], (name) => fields[name], aud);
  assert.equal(result.inputs, example[1]);
  assert.equal(result.rows.map((row) => row.join('|')).join(';'), example[2]);
  assert.equal(String(result.principal), example[3]);
  assert.equal(result.note, example[4]);
  for (const cited of ['as at 21 May 2026 (Compilation No. 264), read 19 November 2026', '(Act No. 49 of 2026, read 19 November 2026)',
    '(Guide to capital gains tax 2026, last updated 30 May 2026), read 19 November 2026', '(published 30 May 2026), read 19 November 2026',
    '(last updated 30 May 2026), read 19 November 2026', 'label H of $289,755 and label A of $144,877',
    'A company, not a life insurance company or listed investment company']) {
    assert.ok(cgtHtml.includes(cited), cited);
  }
  // A home: example 72's figures as the page shows them.
  const roya = shownCases.cgt.rows.find((row) => row.case.startsWith('ATO example 72')).call[0];
  const flat = { entity: 'individual', resident: 'yes', kind: 'home', acquired: roya.acquired, event: roya.event, proceeds: roya.proceeds,
    price: roya.price, buying: '0', 'buying-date': '', 'improvement-1': '0', 'improvement-1-date': '', 'improvement-2': '0',
    'improvement-2-date': '', selling: roya.selling, owning: '0', works: '0', 'current-losses': '0', 'prior-losses': '0', income: '90000',
    purchased: roya.home.purchased, sold: roya.home.sold, 'moved-in': roya.home.movedIn, practicable: 'yes', exclusions: 'none',
    'away-1-from': '1997-09-29', 'away-1-to': '2024-09-29', 'away-1-rented': true, 'away-1-choose': true, 'part-percent': '0',
    'part-from': '', 'part-to': '', market: '340000' };
  const home = calculations.cgtResult((name) => flat[name] ?? '', (name) => flat[name] === true, aud);
  assert.deepEqual(home.rows.slice(4, 7), [['Ownership period, settlement to settlement', '9,863 days, 7,671 not the main residence'],
    ['Home first used to produce income (section 118-192)', 'Applies: taken to be acquired on 29 September 1997 for $340,000.00'],
    ['Capital gain before the main residence exemption', '$200,000.00']]);
});

// The small business CGT concessions checker: how each call and result reads.
const concessionsHtml = readFileSync(new URL('../_includes/calculators/cgt-concessions.html', import.meta.url), 'utf8');
const concessionDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const CONCESSION_WHO = { individual: 'Individual', company: 'Company', trust: 'Trust' };
const CONCESSION_BUSINESS = { yes: 'business', 'winding-up': 'winding up', no: 'no business' };
Object.assign(INPUTS, {
  cgtConcessions: (x) => {
    const money = (v) => dollars(Number(v));
    const turnover = (business, amount) => (business === 'yes' ? money(amount) : 'none');
    const parts = [`${CONCESSION_WHO[x.entity]}${x.asset === 'share' ? ', a share or trust interest' : ''}`
      + `${x.partnership === 'yes' ? ', a partnership asset' : ''}`, `bought ${concessionDate(x.acquired)}, sold ${concessionDate(x.event)}`,
    `${CONCESSION_BUSINESS[x.business]}, turnover ${turnover(x.previousBusiness, x.previous)} previous, `
      + `${turnover(x.earlierBusiness, x.earlier)} before, ${money(x.likely)} likely, ${money(x.actual)} actual`,
    `net assets ${money(x.netAssets)}${x.passive === 'none' ? '' : `, passively held (${x.passive})`}`,
    `active ${x.active} days${x.ceased ? `, ceased ${concessionDate(x.ceased)}${x.extension === 'yes' ? ' with a longer period allowed' : ''}` : ''}`,
    `born ${concessionDate(x.born)}${x.retiring === 'yes' ? ', retiring' : ''}${x.incapacitated === 'yes' ? ', incapacitated' : ''}`];
    if (x.entity !== 'individual') parts.push(`significant individual ${x.significant}, for 15 years ${x.fifteen}`);
    parts.push(`choice ${concessionDate(x.choice)}${Number(x.used) ? `, ${money(x.used)} already chosen` : ''}`);
    return parts.join('; ');
  },
});
Object.assign(FORM_CALLS, { cgtConcessions: (f) => [calculations.cgtConcessionsAnswersOf((name) => f[name])] });
Object.assign(ENGINE_LABELS, {
  cgtConcessions: { basic: (v) => `basic conditions ${v ? 'met' : 'not met'}`,
    turnoverRule: (v) => (v ? `a CGT small business entity by ${v}` : 'not a CGT small business entity'),
    netAssets: (v) => `net asset value test ${v ? 'met' : 'not met'}`, testDays: (v) => `${v.toLocaleString('en-AU')}-day test period`,
    activeAsset: (v) => `active asset test ${v ? 'met' : 'not met'}`,
    fifteenYear: (v) => `15-year exemption ${v ? 'available' : 'not available'}`,
    reduction: (v) => `50% reduction ${v ? 'applies' : 'does not apply'}`,
    retirement: (v) => `retirement exemption ${v ? 'available' : 'not available'}`,
    superContribution: (v) => (v ? 'contributed to super' : 'no super contribution'), retirementLimit: 'limit left',
    rollover: (v) => `roll-over ${v ? 'available' : 'not available'}`, replacementTo: 'replacement asset period to' },
});
const concessionAud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
const concessionsBase = () => structuredClone(shownCases['cgt-concessions'].rows[0].call[0]);
const concessionRow = (x, label) => calculations.cgtConcessionsResult((name) => ({ ...concessionsFields(), ...x })[name], concessionAud)
  .rows.find(([start]) => start.startsWith(label))?.[1];
const concessionsFields = () => formDefaults(concessionsHtml);

test('the concessions page opens on a cited example whose rows the example tag can split', () => {
  const view = calculations.cgtConcessionsResult((name) => concessionsFields()[name], concessionAud);
  const tag = concessionsHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="0"/);
  assert.equal(tag[2], view.rows.map((row) => row.join('|')).join(';'));
  for (const [label, finding] of view.rows) assert.doesNotMatch(`${label}${finding}`, /[;|]/, label);
  assert.equal(view.rows[0].join('|'), 'Concessions open|50% active asset reduction, retirement exemption and roll-over (Division 152)');
  assert.match(concessionsHtml, /Compilation No\. 264\), read 19 November 2026/);
  assert.match(concessionsHtml, /Schedule 1 item 82/);
  // The explanation gives the band the engine refuses, as the 2,735 and 2,746 day cases bound it.
  assert.match(concessionsHtml, /7\.5 years is 2,736 to 2,746 days, [^<]*a total from 2,736 to 2,745 is refused/);
});

// Subsection 152-10(1AA) and section 328-110 (Compilation No. 264, read 19 November 2026): each
// route to a CGT small business entity, the subsection (3) bar and the partnership's own test.
test('the concessions rows name the turnover rule, the 2-year bar and a failed basic condition', () => {
  assert.equal(concessionRow({}, 'CGT small business entity'),
    'Aggregated turnover for the year, at its end, $1,950,000.00, under $2,000,000 (subsection 328-110(4)): met');
  assert.equal(concessionRow({ previous: '2200000', earlier: '2300000', likely: '1800000', actual: '2100000' }, 'CGT small business entity'),
    'No aggregated turnover under $2,000,000 that counts: the likely turnover does not after 2 years at $2,000,000 or more '
    + '(subsection 328-110(3)): not met');
  assert.equal(concessionRow({ business: 'no' }, 'CGT small business entity'),
    'No business carried on in the income year (paragraph 328-110(1)(a)): not met');
  assert.equal(concessionRow({ partnership: 'yes', 'previous-business': 'no' }, 'Partnership a CGT small business entity'),
    'Aggregated turnover for the year, at its end, $1,950,000.00, under $2,000,000 (subsection 328-110(4)): met');
  assert.equal(concessionRow({ 'previous-business': 'no', likely: '1999999.99' }, 'CGT small business entity'),
    'Likely aggregated turnover for the year $1,999,999.99, under $2,000,000 (subparagraph 328-110(1)(b)(ii)): met');
  assert.equal(concessionRow({ actual: '2000000', active: '2000' }, 'Basic conditions'),
    'Not met: none of the 4 tests in paragraph 152-10(1)(c) and the active asset test (paragraph 152-10(1)(d))');
  assert.equal(concessionRow({ active: '2000' }, 'Basic conditions'), 'Not met: the active asset test (paragraph 152-10(1)(d))');
});

// Sections 152-305 and 152-325: an individual under 55 contributes to super; a company or trust
// pays its stakeholders within 7 days, into super for one under 55.
// Subparagraph 152-35(2)(b)(ii): the 12 months run back from the CGT event, so a business that
// ceased on 29 February 2024 did not cease in the 12 months before 1 March 2025.
test('the active asset test period ends at a cessation in the 12 months before the CGT event', () => {
  const ended = (ceased) => calculations.cgtConcessions({ ...concessionsBase(), acquired: '2014-03-03', event: '2025-03-01',
    ceased, extension: 'no', active: '2000' });
  const leap = ended('2024-02-29');
  assert.deepEqual([leap.testTo, leap.testDays, leap.activeAsset], ['2025-03-01', 4017, false]);
  const within = ended('2024-03-01');
  assert.deepEqual([within.testTo, within.testDays, within.activeAsset], ['2024-03-01', 3652, true]);
  // From 29 February the replacement asset period takes the narrower reading of each end (subsection 104-190(1A)).
  const leapSale = calculations.cgtConcessions({ ...concessionsBase(), acquired: '2014-03-03', event: '2024-02-29' });
  assert.deepEqual([leapSale.replacementFrom, leapSale.replacementTo], ['2023-03-01', '2026-02-28']);
  // Winding up a business carries it on for the CGT small business entity test (subsection 328-110(5)).
  assert.equal(calculations.cgtConcessions({ ...concessionsBase(), business: 'winding-up' }).smallBusiness, true);
});

test('the retirement exemption row gives each entity its conditions and the limit left', () => {
  assert.equal(concessionRow({}, 'Retirement exemption'), 'Available: up to $500,000.00 of the gain left after the 50% reduction '
    + '(section 152-320), with the exempt amount contributed to a complying super fund or RSA at the later of the choice and '
    + 'receiving the proceeds, each instalment in turn, as the individual is under 55 just before the choice (subsections '
    + '152-305(1) and (1A))');
  assert.equal(concessionRow({ entity: 'company', significant: 'yes', used: '125000.50' }, 'Retirement exemption'),
    'Available: up to $374,999.50 for this stakeholder, counted as their percentage of what the company or trust disregards '
    + '(subsections 152-320(1) and (2)), with the lesser of the proceeds received and the exempt amount paid to its CGT '
    + 'concession stakeholders within 7 days of the later of the choice and receiving the proceeds, each instalment in turn '
    + '(subsections 152-325(2), (4) and (5)), with the payment contributed to a complying super fund or RSA, telling its '
    + 'trustee or provider, as the individual is under 55 just before the payment (subsection 152-325(7))');
  // A company or trust can give its exempt amount to another stakeholder, even a nil percentage to this one.
  assert.equal(concessionRow({ entity: 'company', significant: 'yes', used: '500000' }, 'Retirement exemption'),
    'Not available for this stakeholder, whose $500,000 limit is used up; another CGT concession stakeholder with limit '
    + 'left can take a percentage of the exempt amount (subsections 152-315(2) and (5))');
  assert.equal(concessionRow({ entity: 'trust' }, 'Retirement exemption'),
    'Not available: no significant individual just before the CGT event (paragraph 152-305(2)(b))');
  assert.equal(concessionRow({ used: '500000' }, 'Retirement exemption'), 'Not available: the $500,000 limit is used up (section 152-320)');
  const fifteen = { acquired: '2005-06-30', active: '7523', born: '1962-05-20', retiring: 'yes' };
  assert.equal(concessionRow(fifteen, 'Retirement exemption'), 'Not needed: the 15-year exemption disregards the whole gain (section 152-330)');
  assert.equal(concessionRow(fifteen, '50% active asset reduction'), 'Not needed: the 15-year exemption disregards the whole gain (section 152-215)');
  assert.equal(concessionRow({ entity: 'company', ...fifteen }, '15-year exemption'), 'Not available, as these are not met: a significant '
    + 'individual for a total of 15 years of ownership (paragraph 152-110(1)(c)) and a significant individual just before the CGT '
    + 'event (paragraph 152-110(1)(d))');
});

test('the concessions engine refuses malformed answers with a reason', () => {
  const refuses = (fields, message) => assert.throws(() => calculations.cgtConcessions({ ...concessionsBase(), ...fields }), { message });
  refuses({ entity: 'partnership' }, 'Choose who made the capital gain.');
  refuses({ partnership: 'yes', passive: 'affiliate' }, 'Subsections 152-10(1A) and (1B) are for an asset that is not your interest in '
    + 'an asset of a partnership you are a partner in: choose one or the other.');
  refuses({ passive: 'affiliate' }, /paragraphs 152-10\(1A\)\(b\) and \(1B\)\(c\)/);
  refuses({ passive: 'partnership', business: 'winding-up' }, /answer No to a business carried on/);
  refuses({ event: '2020-06-30' }, 'Enter a sale contract from 1 July 2020 to 30 June 2027.');
  refuses({ acquired: '2026-02-02' }, 'The sale contract must come after the purchase contract.');
  refuses({ acquired: '2026-02-30' }, 'Enter the date of the purchase contract as a date.');
  refuses({ business: 'maybe' }, 'Choose whether a business was carried on in the income year.');
  refuses({ previous: '-1' }, 'Enter an amount between 0 and 1000000000.');
  refuses({ ceased: '2013-01-01' }, 'Enter the day the business ceased from the purchase to the sale contract.');
  refuses({ active: '4356' }, 'The days active cannot exceed the 4,355 days of the test period.');
  refuses({ active: '3000.5' }, 'Enter a whole number between 0 and 100000.');
  refuses({ born: '2026-02-02' }, 'The date of birth must come before the sale contract.');
  refuses({ choice: '2026-02-01' }, 'The choice is made on or after the sale contract.');
  refuses({ used: '500000.01' }, 'The CGT exempt amounts already chosen cannot exceed the $500,000 limit (section 152-320).');
  refuses({ entity: 'company', significant: '' }, 'Choose whether there was a significant individual just before the CGT event.');
});

// The unused leave page: how each call and result reads. Its figures come from Schedule 7 for payments
// from 1 July 2026 and the ATO's examples, read 19 November 2026.
const leaveHtml = readFileSync(new URL('../_includes/calculators/unused-leave.html', import.meta.url), 'utf8');
const LEAVE_REASONS = { normal: 'normal termination', 'genuine-redundancy': 'genuine redundancy',
  'early-retirement': 'early retirement scheme', invalidity: 'invalidity' };
const LEAVE_PAYEES = { tfn: 'TFN, scale 2', 'tfn-foreign': 'foreign resident with a TFN, scale 3', 'no-tfn': 'no TFN',
  'no-tfn-foreign': 'foreign resident with no TFN' };
const LEAVE_PERIODS = { week: 'a week', fortnight: 'a fortnight', month: 'a month' };
const leavePart = (text, words) => (text === '' ? '' : ` (${dollars(Number(text))} ${words})`);
Object.assign(INPUTS, {
  unusedLeave: (x) => [`Annual leave ${dollars(Number(x.annual))}${leavePart(x.annualBefore1993, 'before 18 August 1993')}`,
    `loading ${dollars(Number(x.loading))}${leavePart(x.loadingBefore1993, 'before 18 August 1993')}`,
    `long service leave ${dollars(Number(x.longService))}${leavePart(x.lslBefore1978, 'before 16 August 1978')}`
      + `${leavePart(x.lsl1978To1993, '16 August 1978 to 17 August 1993')}`,
    `accrued from ${plainDate(x.accrualStart)}`, LEAVE_REASONS[x.reason], LEAVE_PAYEES[x.payee],
    ...(x.payee.startsWith('tfn') ? [`${dollars(Number(x.earnings))} ${LEAVE_PERIODS[x.period]}`] : [])].join(', '),
});
Object.assign(FORM_CALLS, { unusedLeave: (f) => [{ annual: f.annual, loading: f.loading, longService: f['long-service'],
  accrualStart: f['accrual-start'], reason: f.reason, annualBefore1993: f['annual-1993'], loadingBefore1993: f['loading-1993'],
  lslBefore1978: f['lsl-1978'], lsl1978To1993: f['lsl-1993'], payee: f.payee, earnings: f.earnings, period: f.period }] });
Object.assign(ENGINE_LABELS, {
  unusedLeave: { capped: (v) => `lump sum A ${dollars(v)}`, lumpSumAType: (v) => `type ${v}`, lumpSumB: (v) => `lump sum B ${dollars(v)}`,
    unusedLeave: (v) => `paid leave type U ${dollars(v)}`, assessable: (v) => `assessable ${dollars(v)}`,
    flat: (v) => `32% part ${dollars(v)}`, marginalWithheld: (v) => `marginal rate part ${dollars(v)}`,
    withholding: (v) => `withhold ${dollars(v)}` },
});
const leave = { annual: '0', loading: '0', longService: '0', accrualStart: '2000-01-01', reason: 'normal', annualBefore1993: '',
  loadingBefore1993: '', lslBefore1978: '', lsl1978To1993: '', payee: 'tfn', earnings: '1155', period: 'week' };
const norman = { ...leave, longService: '22020', lslBefore1978: '780', lsl1978To1993: '6420', accrualStart: '1977-01-01' };

test('unused leave reproduces Schedule 7’s example for Norman step by step', () => {
  const r = calculations.unusedLeave(norman);
  // 5% of $780 is $39; $6,420 × 32% is $2,054.40; ($39 + $14,820) ÷ 52 is $285.75, so $285; $1,155 withholds
  // $188 and $1,440 $279, so ($279 − $188) × 52 is $4,732; $2,054 + $4,732 is $6,786.
  assert.deepEqual([r.lslPre1978Assessable, r.flat, r.marginalAmount, r.marginal?.onEarnings, r.marginal?.share,
    r.marginal?.withShare, r.marginalWithheld, r.withholding], [39, 2054, 14859, 188, 285, 279, 4732, 6786]);
  assert.deepEqual([r.lslPre1978NotAssessable, r.assessable, r.capped, r.lumpSumA, r.lumpSumB, r.unusedLeave, r.lumpSumAType],
    [741, 21279, 6420, 6420, 780, 14820, 'T']);
});

test('unused leave keeps the parts of the ATO’s examples that do not depend on their 2014-15 tax tables', () => {
  // Matt (example 8): $80,000 with $3,852 before 16 August 1978, $31,407 to 17 August 1993 and $44,741 after.
  const matt = calculations.unusedLeave({ ...leave, longService: '80000', lslBefore1978: '3852', lsl1978To1993: '31407',
    accrualStart: '1977-01-01', earnings: '1200' });
  assert.deepEqual([matt.lslPre1978Assessable, matt.flat, matt.marginalAmount, matt.marginal?.share], [192.6, 10050, 44933.6, 864]);
  // Mark (example 4): $4,000 after 17 August 1993 over 52 weeks is $76.
  assert.equal(calculations.unusedLeave({ ...leave, annual: '4000', earnings: '1000' }).marginal?.share, 76);
  // Sali (example 9): all $16,000 before 16 August 1978; 5% is $800, $15 a week.
  const sali = calculations.unusedLeave({ ...leave, longService: '16000', lslBefore1978: '16000', lsl1978To1993: '0',
    accrualStart: '1972-01-01', earnings: '2400' });
  assert.deepEqual([sali.lslPre1978Assessable, sali.marginal?.share, sali.capped], [800, 15, 0]);
});

test('unused leave withholds 32% to the nearest dollar, 50 cents up, and limits a small normal payment to 32%', () => {
  const capped = (amount) => calculations.unusedLeave({ ...leave, annual: amount, reason: 'invalidity' }).withholding;
  // $1.57 × 32% is $0.5024, so $1; $1.56 is $0.4992, so nil.
  assert.deepEqual([capped('1.57'), capped('1.56')], [1, 0]);
  // On $3,000 a week, $299.99 is $5 a week; under $300 the lesser of the marginal amount and 32% ($96) is withheld.
  const under = calculations.unusedLeave({ ...leave, annual: '299.99', earnings: '3000' });
  assert.deepEqual([under.marginal?.beforeLimit, under.marginal?.limited, under.marginalWithheld], [104, true, 96]);
  const at = calculations.unusedLeave({ ...leave, annual: '300', earnings: '3000' });
  assert.deepEqual([at.marginal?.limited, at.marginalWithheld], [false, at.marginal?.beforeLimit]);
  // A capped payment on a genuine redundancy is not limited, however small.
  assert.equal(calculations.unusedLeave({ ...leave, annual: '100', reason: 'genuine-redundancy' }).marginal?.limited, false);
});

test('without a TFN unused leave withholds 47%, or 45% for a foreign resident, from the whole payment, cents ignored', () => {
  const noTfn = (fields) => calculations.unusedLeave({ ...leave, payee: 'no-tfn', earnings: '', period: '', ...fields });
  // $1,002 × 47% is $470.94, so $470; $1,002.99 is $471.4053, so $471.
  assert.deepEqual([noTfn({ annual: '1002' }).withholding, noTfn({ annual: '1002.99' }).withholding], [470, 471]);
  // Norman's $22,020, the 95% of his pre-16 August 1978 leave included: 45% is $9,909.
  const foreign = calculations.unusedLeave({ ...norman, payee: 'no-tfn-foreign' });
  assert.deepEqual([foreign.withholding, foreign.noTfnRate, foreign.flat, foreign.lumpSumB], [9909, 45, null, 780]);
  // No $300 limit applies, and pre-16 August 1978 leave may join a small payment.
  assert.equal(noTfn({ annual: '100', longService: '1000', lslBefore1978: '1000', lsl1978To1993: '0', annualBefore1993: '0',
    loadingBefore1993: '0', accrualStart: '1970-01-01' }).withholding, 517);
});

test('unused leave needs each part from the day before its date and not after it', () => {
  const run = (accrualStart, fields = {}) => calculations.unusedLeave({ ...leave, annual: '6000', longService: '9000', accrualStart, ...fields });
  assert.throws(() => run('1993-08-17'), { message: /^Enter the annual leave for employment before 18 August 1993: / });
  assert.doesNotThrow(() => run('1993-08-18'));
  assert.throws(() => run('1993-08-18', { annualBefore1993: '1' }), { message: /^The leave accrued from 18 August 1993, so none of it is annual leave/ });
  assert.equal(run('1993-08-18', { annualBefore1993: '0' }).capped, 0);
  const from1978 = { annualBefore1993: '0', loadingBefore1993: '0', lsl1978To1993: '0' };
  assert.throws(() => run('1978-08-15', from1978), { message: /^Enter the long service leave for the period before 16 August 1978: / });
  assert.doesNotThrow(() => run('1978-08-16', from1978));
  assert.throws(() => run('1978-08-16', { ...from1978, lslBefore1978: '1' }), { message: /so none of it is long service leave for the period before 16 August 1978/ });
  // A genuine redundancy caps every part from 16 August 1978, so only the 1978 part is needed.
  const redundancy = run('1970-01-01', { reason: 'genuine-redundancy', lslBefore1978: '1000' });
  assert.deepEqual([redundancy.capped, redundancy.lumpSumAType, redundancy.unusedLeave], [14000, 'R', 0]);
});

test('unused leave refuses what it cannot work out', () => {
  const refuses = (fields, message) => assert.throws(() => calculations.unusedLeave({ ...leave, ...fields }), { message }, JSON.stringify(fields));
  refuses({ payee: 'whm' }, 'Choose whether the employee gave a TFN and is a foreign resident.');
  refuses({ period: 'quarter' }, 'Choose weekly, fortnightly or monthly pay.');
  refuses({ earnings: '' }, 'Normal gross earnings: enter a number using digits only.');
  refuses({ reason: 'death' }, 'Choose the reason the employment ended.');
  for (const accrualStart of ['', '2026-02-30', '1899-12-31', '2027-07-01', '1 July 2000']) {
    refuses({ accrualStart }, 'Enter the day the leave began to accrue, from 1 January 1900 to 30 June 2027.');
  }
  for (const [field, label] of [['annual', 'Annual leave'], ['loading', 'Leave loading'], ['longService', 'Long service leave']]) {
    for (const value of ['', '-1', '1.001', 'abc']) assert.throws(() => calculations.unusedLeave({ ...leave, [field]: value }), { message: new RegExp(`^${label}: `) });
  }
  refuses({ longService: '5000', lslBefore1978: '3000', lsl1978To1993: '2500', accrualStart: '1970-01-01', annualBefore1993: '0',
    loadingBefore1993: '0' }, 'The long service leave before 16 August 1978 and from then to 17 August 1993 together are more than the long service leave.');
  refuses({ annual: '100', longService: '1000', lslBefore1978: '1000', lsl1978To1993: '0', annualBefore1993: '0', loadingBefore1993: '0',
    accrualStart: '1970-01-01' }, /^A post-17 August 1993 payment under \$300 has at most 32% of it withheld/);
});

test('unused leave agrees with australian-tax-calculators 1.0.0 on every recorded case', () => {
  const { engine, cases } = JSON.parse(readFileSync(new URL('./unused-leave-engine-differential.json', import.meta.url), 'utf8'));
  assert.match(engine, /^australian-tax-calculators 1\.0\.0 .*commit 6ac566682829731d52a1b4456708a0b9d29b5695/);
  assert.ok(cases.length >= 250);
  const toCents = (text) => {
    const [whole, fraction = ''] = text.split('.');
    const digits = `${fraction}000`;
    return (Number(whole) * 100 + Number(digits.slice(0, 2)) + (Number(digits[2]) >= 5 ? 1 : 0)) / 100;
  };
  for (const { source, call, amounts, lump_sum_a_type: type, refused } of cases) {
    if (refused) {
      assert.throws(() => calculations.unusedLeave(call), Error, source);
      continue;
    }
    const r = calculations.unusedLeave(call);
    const mine = { annual_leave_capped: r.annualCapped, annual_leave_marginal: r.annualMarginal, long_service_leave_pre_1978: r.lslPre1978,
      long_service_leave_pre_1978_assessable: r.lslPre1978Assessable, long_service_leave_pre_1978_not_assessable: r.lslPre1978NotAssessable,
      long_service_leave_capped: r.lslCapped, long_service_leave_marginal: r.lslMarginal, assessable_income: r.assessable,
      offset_capped_income: r.capped, withholding: r.withholding, lump_sum_a: r.lumpSumA, lump_sum_b: r.lumpSumB,
      unused_leave_on_termination: r.unusedLeave, qualifying_earnings: 0,
      ...(r.marginal ? { flat_rate_withholding: r.flat, marginal_rate_amount: r.marginalAmount, withholding_on_earnings: r.marginal.onEarnings,
        marginal_amount_per_period: r.marginal.share, withholding_on_earnings_and_share: r.marginal.withShare,
        marginal_withholding_before_limit: r.marginal.beforeLimit, marginal_withholding: r.marginalWithheld } : {}) };
    assert.deepEqual(mine, Object.fromEntries(Object.entries(amounts).map(([key, value]) => [key, toCents(value)])), source);
    assert.equal(r.lumpSumAType, type, source);
  }
});

test('the unused leave page opens on Norman’s result and cites each source with its date', () => {
  const example = leaveHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const fields = formDefaults(leaveHtml);
  const result = calculations.unusedLeaveResult((name) => fields[name], aud);
  assert.equal(result.inputs, example[1]);
  assert.equal(result.rows.map((row) => row.join('|')).join(';'), example[2]);
  assert.equal(String(result.principal), example[3]);
  assert.equal(result.note, example[4]);
  assert.equal(result.rows.at(-1).join('|'), 'Total to withhold from the leave|$6,786.00');
  for (const cited of ['read on the ATO Legal Database 19 November 2026', '(published 17 June 2026, for payments from 1 July 2026), read 19 November 2026',
    '(both last updated 1 May 2020), read 19 November 2026', '(last updated 12 November 2025), read 19 November 2026']) {
    assert.ok(leaveHtml.includes(cited), cited);
  }
  // Without a TFN the form needs no earnings, and the result says why the whole payment counts.
  const noTfn = calculations.unusedLeaveResult((name) => ({ ...fields, payee: 'no-tfn', earnings: '' })[name], aud);
  assert.equal(noTfn.rows.at(-1).join('|'), 'To withhold: 47% of the payment, cents ignored|$10,349.00');
});

// The long service leave page: how each call and result reads, and the Acts' thresholds a day
// either side.
const lslHtml = readFileSync(new URL('../_includes/calculators/long-service-leave.html', import.meta.url), 'utf8');
Object.assign(INPUTS, { longServiceLeave: (x) => `${PLACES[x.place]}, ${plainDate(x.start)} to ${plainDate(x.end)}`
  + `${x.excluded === '0' ? '' : `, ${x.excluded} days excluded`}, `
  + `${x.mode === 'ends' ? `ends by ${calculations.lslReasonText(x.place, x.reason)}` : 'still employed'}${x.taken === '0' ? '' : `, ${x.taken} weeks taken`}, `
  + `pay ${dollars(Number(x.pay))} a week` });
Object.assign(FORM_CALLS, { longServiceLeave: (f) => [{ place: f.jurisdiction, start: f.start, end: f.end, excluded: f.excluded,
  taken: f.taken, mode: f.mode, reason: f.reason, pay: f.pay }] });
Object.assign(ENGINE_LABELS, { longServiceLeave: { weeks: (v) => `${v.toFixed(4)} weeks`, balance: (v) => `${v.toFixed(4)} weeks left`,
  value: 'payment' } });
const lsl = (change) => calculations.longServiceLeave({ place: 'AU-NSW', start: '2016-01-01', end: '2025-12-31', excluded: '0',
  taken: '0', mode: 'employed', reason: 'redundancy', pay: '1500', ...change });

test('the long service leave page opens on the result its calculation gives, and cites each Act with its version and date read', () => {
  const example = lslHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)"(?: note="([^"]*)")? %\}/);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const fields = formDefaults(lslHtml);
  const result = calculations.longServiceLeaveResult((name) => fields[name], aud);
  assert.deepEqual([result.inputs, result.rows.map((row) => row.join('|')).join(';'), String(result.principal), result.note], example.slice(1));
  for (const cited of ['(version for 1 July 2025 to date), read 19 November 2026', '(Authorised Version No. 006, as at 12 December 2025), read 19 November 2026',
    '(reprint current from 1 January 2026), read 19 November 2026','(official version 04-m0-00, as at 31 January 2025), read 19 November 2026',
    '(version of 1 July 2017), read 19 November 2026', '(version current from 10 December 2018), read 19 November 2026',
    '(republication R29, effective 19 November 2025), read 19 November 2026', '(reprint as in force at 14 October 2015), read 19 November 2026',
    '(last updated 13 May 2026), read the same day', '(last updated 3 October 2024), read the same day']) {
    assert.ok(lslHtml.includes(cited), cited);
  }
  const radios = [...lslHtml.matchAll(/name="jurisdiction" value="([^"]+)"(?: checked)? \/> ([^<]+)</g)].map(([, code, name]) => [code, name]);
  assert.deepEqual(radios, Object.entries(calculations.LSL_ACTS).map(([code, { name }]) => [code, name]));
  const reasons = [...lslHtml.matchAll(/name="reason" value="([^"]+)"/g)].map(([, code]) => code);
  assert.deepEqual(reasons, Object.keys(calculations.LSL_REASONS));
});

test('long service leave becomes available on the day each Act’s qualifying period completes, not the day before', () => {
  // Each Act's full entitlement at its qualifying period: 8 2/3 weeks for 10 years in NSW, Qld, WA
  // and Tas; 13 weeks in SA and the NT; 1/60th of 2,557 days in Victoria; 7 × 1/5 of a month in the ACT.
  for (const [place, years, weeks, value] of [['AU-NSW', 10, 8.6667, 13000], ['AU-VIC', 7, 6.0881, 9132.14], ['AU-QLD', 10, 8.6667, 13000],
    ['AU-WA', 10, 8.6667, 13000], ['AU-SA', 10, 13, 19500], ['AU-TAS', 10, 8.6667, 13000], ['AU-ACT', 7, 6.0667, 9100], ['AU-NT', 10, 13, 19500]]) {
    const last = `${2015 + years}-12-31`;
    assert.deepEqual([lsl({ place, end: `${2015 + years}-12-30` }).weeks, lsl({ place, end: last }).weeks, lsl({ place, end: last }).value],
      [0, weeks, value], place);
  }
  // The ACT guidelines' 7 years at $560 a week: the exact 91/15 weeks, not the rounded 6.0667, times the pay.
  assert.equal(lsl({ place: 'AU-ACT', end: '2022-12-31', pay: '560' }).value, 3397.33);
  // Pro rata from 5 years in NSW and the ACT and 7 elsewhere, for a redundancy.
  for (const [place, years] of [['AU-NSW', 5], ['AU-QLD', 7], ['AU-WA', 7], ['AU-SA', 7], ['AU-TAS', 7], ['AU-ACT', 5], ['AU-NT', 7], ['AU-VIC', 7]]) {
    const ends = (end) => lsl({ place, end, mode: 'ends' }).weeks;
    assert.equal(ends(`${2015 + years}-12-30`), 0, place);
    assert.ok(ends(`${2015 + years}-12-31`) > 0, place);
  }
});

test('long service leave service counts completed months from a day a later month lacks to that month’s last day', () => {
  // 29 February 2016: 10 years complete with 28 February 2026, and 15 with 28 February 2031.
  const leap = lsl({ start: '2016-02-29', end: '2026-02-28' });
  assert.deepEqual([leap.years, leap.months, leap.days, leap.weeks, leap.next], [10, 0, 0, 8.6667, { years: 15, date: '2031-02-28', weeks: 13 }]);
  assert.equal(lsl({ start: '2016-02-29', end: '2026-02-27' }).years, 9);
  // 31 January: a month completes with 28 February.
  assert.deepEqual(['months', 'days'].map((f) => lsl({ start: '2025-01-31', end: '2025-02-28' })[f]), [1, 0]);
  assert.deepEqual(['months', 'days'].map((f) => lsl({ start: '2025-01-31', end: '2025-02-27' })[f]), [0, 28]);
});

test('long service leave gives the next amount’s date, moved on by excluded days, while employment continues', () => {
  const at = (change) => calculations.longServiceLeaveResult((name) => ({ jurisdiction: 'AU-NSW', start: '2014-02-01', end: '2026-07-31',
    excluded: '0', taken: '0', mode: 'employed', reason: 'redundancy', pay: '1500', ...change })[name], String);
  assert.equal(at({}).note, '15 years of service completes on 31 January 2029, when the leave to take becomes 13.0000 weeks, if no more days are excluded');
  assert.equal(at({ excluded: '30' }).note, '15 years of service completes on 2 March 2029, when the leave to take becomes 13.0000 weeks, if no more days are excluded');
  assert.equal(at({ jurisdiction: 'AU-VIC' }).note, 'Leave accrues continuously from here under the Long Service Leave Act 2018 (Vic)');
  assert.equal(at({ jurisdiction: 'AU-SA' }).note.slice(0, 41), '13 years of service completes on 31 Janua');
  assert.equal(at({ mode: 'ends' }).note, undefined);
  assert.deepEqual(at({ taken: '2.5' }).rows.slice(2, 4), [['Less leave already taken or paid', '2.5000 weeks'], ['Weeks the employee can take now', '6.1667 weeks']]);
  // 8 2/3 less 2.5 weeks is 37/6 weeks: $9,250.00, not 6.1667 × $1,500.
  assert.equal(lsl({ end: '2026-07-31', start: '2014-02-01', taken: '2.5' }).value, 9250);
});

test('long service leave refuses malformed input instead of returning nil leave', () => {
  for (const [change, message] of [[{ place: 'AU-XX' }, 'Choose the state or territory whose Act applies.'],
    [{ mode: 'maybe' }, 'Choose whether the employee is still employed or employment ends.'],
    [{ mode: 'ends', reason: '' }, 'Choose why employment ends.'],
    [{ start: '2025-02-30' }, 'Enter the first day of service from 23 June 1990 to 31 December 2099.'],
    [{ start: '1990-06-22' }, 'Enter the first day of service from 23 June 1990 to 31 December 2099.'],
    [{ end: '2100-01-01' }, 'Enter the day to work it out at from 23 June 1990 to 31 December 2099.'],
    [{ end: '2026-7-31' }, 'Enter the day to work it out at from 23 June 1990 to 31 December 2099.'],
    [{ pay: '1000000.01' }, 'Enter weekly pay of no more than $1,000,000.'],
    [{ excluded: '3653' }, 'Excluded days must be fewer than the days from the first day to the last.']]) {
    assert.throws(() => lsl(change), { message }, JSON.stringify(change));
  }
  for (const [field, value] of [['excluded', '1.5'], ['excluded', '-1'], ['excluded', ''], ['taken', '1.00001'], ['taken', '-1'],
    ['taken', 'abc'], ['pay', '-1'], ['pay', '100.001'], ['pay', '']]) {
    assert.throws(() => lsl({ [field]: value }), Error, `${field} ${value}`);
  }
  assert.equal(lsl({ excluded: '3652', end: '2025-12-31' }).counted, 1);
});

test('long service leave keeps the fixed amounts and exclusions the Acts state', () => {
  // Queensland, paragraph 95(2)(a): 8.6667 weeks to take from 10 years until 15, not a proportion of 12½ years.
  assert.equal(lsl({ place: 'AU-QLD', start: '2014-01-01', end: '2026-06-30' }).weeks, 8.6667);
  // South Australia, subsection 5(4): nothing under 10 years after dismissal for serious and wilful misconduct.
  assert.equal(lsl({ place: 'AU-SA', start: '2018-01-01', end: '2025-12-31', mode: 'ends', reason: 'misconduct' }).weeks, 0);
  assert.equal(lsl({ place: 'AU-SA', start: '2018-01-01', end: '2025-12-31', mode: 'ends', reason: 'performance' }).weeks, 10.4);
});

test('Queensland counts a part year’s days over 364 and flags an unfair dismissal under 10 years', () => {
  // Business Queensland: 18 years, 3 months, 2 weeks and 2 days is 15.8548 weeks (16/364 of a year, not 16/365.25).
  assert.equal(lsl({ place: 'AU-QLD', start: '2007-01-01', end: '2025-04-16' }).weeks, 15.8548);
  assert.equal(lsl({ place: 'AU-QLD', start: '2007-01-01', end: '2025-04-16', mode: 'ends', reason: 'resign' }).weeks, 15.8548);
  // Other Acts keep days over 365.25: WorkSafe Tasmania's 13 years, 6 months and 14 days is 13.5383 years.
  assert.equal(lsl({ place: 'AU-TAS', start: '2012-01-01', end: '2025-07-14', mode: 'ends', reason: 'resign' }).weeks, 11.7332);
  // Subparagraph 95(4)(c)(iii) pays for an unfair dismissal, which the calculator cannot decide: the row says so.
  for (const reason of ['performance', 'misconduct']) {
    const r = lsl({ place: 'AU-QLD', start: '2017-01-01', end: '2025-12-31', mode: 'ends', reason });
    assert.deepEqual([r.weeks, r.rule.endsWith('unless the dismissal was unfair, which subparagraph 95(4)(c)(iii) pays for and this calculator does not decide')], [0, true], reason);
  }
  assert.ok(!lsl({ place: 'AU-QLD', start: '2017-01-01', end: '2025-12-31', mode: 'ends', reason: 'resign' }).rule.includes('unfair'));
});

test('long service leave words each Act’s misconduct test and states the conditions it cannot decide', () => {
  // 9 years of service, or 6 in the ACT, whose full period is 7 years.
  const ends = (place, reason) => lsl({ place, start: place === 'AU-ACT' ? '2020-01-01' : '2017-01-01', end: '2025-12-31', mode: 'ends', reason });
  const shown = (place, reason) => calculations.longServiceLeaveResult((name) => ({ jurisdiction: place, start: '2017-01-01', end: '2025-12-31',
    excluded: '0', taken: '0', mode: 'ends', reason, pay: '1500' })[name], String).inputs;
  // NSW s 4(2)(a)(iii), SA s 5(4)(a), Tas s 8(3)(d) and ACT s 11C(1)(a)(iv) withhold pro rata only for serious and wilful
  // misconduct, so a serious but not wilful dismissal is the dismissal short of it, which pays.
  for (const place of ['AU-NSW', 'AU-SA', 'AU-TAS', 'AU-ACT']) {
    assert.deepEqual([ends(place, 'misconduct').weeks, ends(place, 'misconduct').rule.startsWith(
      `Under ${calculations.LSL_ACTS[place].full} years, dismissal for serious and wilful misconduct does not qualify`)], [0, true], place);
    assert.ok(ends(place, 'performance').weeks > 0, place);
    assert.ok(shown(place, 'performance').includes('ends by dismissal for conduct, capacity or performance short of serious and wilful misconduct,'), place);
  }
  // WA s 8(3) and NT s 10(2) say serious misconduct, without 'wilful'.
  for (const place of ['AU-WA', 'AU-NT']) {
    assert.ok(!ends(place, 'misconduct').rule.includes('wilful'), place);
    assert.ok(shown(place, 'misconduct').includes('ends by dismissal for serious misconduct,'), place);
  }
  // The form's labels, shared by all 8 Acts, carry the same distinction.
  const wilful = '(serious and wilful misconduct in New South Wales, South Australia, Tasmania and the Australian Capital Territory)</label>';
  for (const label of [`value="performance" /> Dismissal for conduct, capacity or performance short of serious misconduct ${wilful}`,
    `value="misconduct" /> Dismissal for serious misconduct ${wilful}`]) {
    assert.ok(lslHtml.includes(label), label);
  }
  // SA s 5(4)(b): leaving without the required notice is an unlawful termination only where the notice was required.
  assert.ok(ends('AU-SA', 'no-notice').rule.endsWith('if the employer waived the notice, choose resignation'));
  assert.ok(ends('AU-SA', 'resign').weeks > 0);
});

// The franking account page: how each call and result reads. Its rules come from ITAA 1997 Division 205,
// ss 202-60 to 204-70 and the ATO's Franking account tax return 2026 instructions, read 19 November 2026.
const frankingHtml = readFileSync(new URL('../_includes/calculators/franking-account.html', import.meta.url), 'utf8');
const FRANKING_ENTITY = { public: 'not a private company', private: 'private company', exempt: 'exempt from the benchmark rule' };
Object.assign(INPUTS, {
  frankingAccount: (x) => [`${x.year}, ${FRANKING_ENTITY[x.entity]}, ${x.rate}%, opening ${dollars(Number(x.opening))}`,
    ...(Number(x.rdForward) ? [`R&D deferral ${dollars(Number(x.rdForward))}`] : []),
    ...(x.lastBenchmark ? [`last benchmark ${x.lastBenchmark}% ${x.periodsSince} periods before`] : []),
    ...(x.determination ? ['Commissioner’s determination'] : []),
    ...(x.taxBefore || x.offsetForward ? [`income tax ${dollars(Number(x.taxBefore))}, offset brought forward ${dollars(Number(x.offsetForward))}`
      + `${x.earlierLiability ? `, ${x.earlierLiability === 'yes' ? 'an' : 'no'} earlier liability` : ''}`] : []),
    ...x.events.map((e) => `${plainDate(e.date)} ${calculations.FRANKING_EVENTS[e.type]?.label ?? e.type} ${dollars(Number(e.amount))}`
      + `${e.rdPart ? ` (R&D ${dollars(Number(e.rdPart))})` : ''}`),
    ...x.distributions.map((d) => `${plainDate(d.date)} distribution ${dollars(Number(d.amount))} franked ${dollars(Number(d.credit))}`
      + `${d.permitted ? ` (permitted ${d.permitted}%)` : ''}`)].join(', '),
});
Object.assign(FORM_CALLS, { frankingAccount: (f) => [calculations.frankingInput((name) => f[name])] });
Object.assign(ENGINE_LABELS, {
  frankingAccount: { closing: (v) => `closing balance ${dollars(v)}`, fdt: (v) => `franking deficit tax ${dollars(v)}`,
    offset: (v) => `offset ${dollars(v)}`, oft: (v) => `over-franking tax ${dollars(v)}`,
    offsetCode: (v) => (v === null ? 'no offset code' : `code ${v}`), variation: (v) => (v ? 'significant variation' : 'no significant variation') },
});
const franking = { year: '2025-26', entity: 'public', rate: '30', opening: '0', rdForward: '0', lastBenchmark: '', periodsSince: '',
  determination: false, taxBefore: '', offsetForward: '', earlierLiability: '', events: [], distributions: [] };
const fev = (date, type, amount, rdPart = '') => ({ date, type, amount, rdPart });
const fdist = (date, amount, credit, permitted = '') => ({ date, amount, credit, permitted });
const ekw = { ...franking, opening: '10000', events: [fev('2025-10-28', 'payg_instalment', '125000'), fev('2025-11-15', 'income_tax_refund', '60000'),
  fev('2026-02-28', 'payg_instalment', '125000'), fev('2026-03-31', 'streaming_determination', '20000'), fev('2026-04-28', 'payg_instalment', '250000')],
distributions: [fdist('2025-09-30', '1190000', '510000')] };

test('franking account reproduces the ATO’s example 4 for EKW Ltd line by line', () => {
  const r = calculations.frankingAccount(ekw);
  // Credits $500,000; the item 1 and 2 debits ($510,000 and $60,000) less the $10,000 opening and the credits leave
  // $60,000 attributable, over 10% of the credits, so 30% of it ($18,000) comes off the $80,000.
  assert.deepEqual([r.credits, r.debits, r.closing, r.fdt, r.reduction, r.offset, r.labelK, r.payable, r.due],
    [500000, 590000, -80000, 80000, 18000, 62000, 20000, 80000, '2026-07-31']);
  assert.deepEqual(r.ledger.map((l) => l.balance), [-500000, -375000, -435000, -310000, -330000, -80000]);
  assert.deepEqual([r.balanceCode, r.offsetCode, r.required, r.variation], ['D', null, true, false]);
});

test('franking account keeps the offset whole at exactly 10% and reduces it a cent over', () => {
  const at = (payg) => calculations.frankingAccount({ ...franking, events: [fev('2025-10-28', 'payg_instalment', payg)],
    distributions: [fdist('2025-09-30', '1283333.34', '550000')] });
  assert.deepEqual([at('500000').fdt, at('500000').reduction], [50000, 0]);
  // $499,999.99 of credits: the $50,000.01 part is over $49,999.999, so 30% of it, $15,000.003, comes off.
  assert.deepEqual([at('499999.99').fdt, at('499999.99').reduction, at('499999.99').offset], [50000.01, 15000, 35000.01]);
});

test('franking account works Salomon Pty Ltd’s over-franking tax on the exact maximum credit', () => {
  const r = calculations.frankingAccount({ ...franking, entity: 'private', opening: '1000',
    distributions: [fdist('2025-08-01', '700', '120'), fdist('2026-03-01', '500', '214.29')] });
  // $500 × 60% ÷ (70/30) is $128.571…; the $214.29 allocated is capped at $214.2857…
  assert.deepEqual([r.oft, r.grossUp, r.closing], [128.57, '2.3333', 665.71]);
  assert.deepEqual([r.distributions[1].percentage, r.distributions[1].comparedWith, r.distributions[1].credit], ['100.00', '40.00', 214.29]);
  assert.equal(r.periods.length, 1);
});

test('franking account counts 20 points for each franking period since the last benchmark', () => {
  const acolmal = calculations.frankingAccount({ ...franking, entity: 'private', opening: '1000', lastBenchmark: '50', periodsSince: '2',
    distributions: [fdist('2025-08-01', '700', '300')] });
  assert.deepEqual([acolmal.periods[0].threshold, acolmal.variation, acolmal.required, acolmal.due], [40, true, true, '2026-07-31']);
  const small = calculations.frankingAccount({ ...franking, entity: 'private', opening: '1000', lastBenchmark: '60', periodsSince: '1',
    distributions: [fdist('2025-08-01', '700', '135')] });
  assert.deepEqual([small.periods[0].benchmark, small.variation, small.required, small.due], ['45.00', false, false, null]);
});

test('franking account takes back a refund received after the year’s end only when it creates a deficit', () => {
  assert.throws(() => calculations.frankingAccount({ ...franking, events: [fev('2026-10-01', 'income_tax_refund', '1')] }),
    { message: /^Event 1: enter a date from 1 July 2025 to 30 September 2026/ });
  const r = calculations.frankingAccount({ ...franking, events: [fev('2025-10-28', 'payg_instalment', '5000'),
    fev('2026-08-15', 'income_tax_refund', '20000'), fev('2026-09-30', 'income_tax_refund', '1000', '1000')] });
  assert.deepEqual([r.fdt, r.fdtFromRefunds, r.offsetCode], [15000, 15000, 'F']);
  assert.deepEqual(r.refunds.map((x) => [x.date, x.taken, x.dueOtherwise, x.dueWithReturn]),
    [['2026-08-15', true, '2026-08-29', null], ['2026-09-30', false, null, null]]);
});

test('franking account defers a refund’s R&D part as RI Pty Ltd’s example 2 does', () => {
  const year = (rdForward, events) => calculations.frankingAccount({ ...franking, opening: '50000', rdForward, events });
  const first = year('0', [fev('2025-10-01', 'income_tax_refund', '45000', '45000')]);
  assert.deepEqual([first.debits, first.rdCarried], [0, 45000]);
  const second = year('45000', [fev('2025-12-01', 'income_tax_paid', '30000')]);
  assert.deepEqual([second.credits, second.rdCarried], [0, 15000]);
  const third = year('15000', [fev('2025-12-01', 'income_tax_paid', '36000')]);
  assert.deepEqual([third.credits, third.rdCarried], [21000, 0]);
});

test('franking account refuses what it cannot work out', () => {
  const refuses = (fields, message) => assert.throws(() => calculations.frankingAccount({ ...franking, ...fields }), { message }, JSON.stringify(fields));
  refuses({ year: '2027-28' }, 'Choose the income year: 2025-26 or 2026-27.');
  refuses({ rate: '27.5' }, 'Choose the corporate tax rate for imputation purposes: 25% or 30%.');
  refuses({ entity: 'trust' }, 'Choose the kind of entity.');
  refuses({ opening: '1.001' }, /^Opening balance: /);
  refuses({ events: [fev('2025-07-01', 'dpt_paid', '1')] }, 'Event 1: choose what it is.');
  refuses({ events: [fev('2025-07-01', 'constructor', '1')] }, 'Event 1: choose what it is.');
  refuses({ events: [fev('2025-07-01', 'payg_instalment', '0')] }, 'Event 1: enter an amount above nil.');
  refuses({ events: [fev('2025-07-01', 'payg_instalment', '1', '1')] }, 'Event 1: an R&D part is for an income tax refund only.');
  refuses({ events: [fev('2025-07-01', 'income_tax_refund', '1', '2')] }, 'Event 1: the R&D part is more than the refund.');
  refuses({ distributions: [fdist('2025-09-01', '1', '0'), fdist('2025-08-01', '1', '0')] }, /^Distribution 2: enter the distributions in date order/);
  refuses({ distributions: [fdist('2025-09-01', '1', '0', '50')] }, /^Distribution 1: a permitted percentage is for a distribution after the first/);
  refuses({ lastBenchmark: '60', periodsSince: '' }, /^Enter the franking periods from the one after the last benchmark’s/);
  refuses({ taxBefore: '1', offsetForward: '' }, /^Offset brought forward: /);
  refuses({ entity: 'private', taxBefore: '1', offsetForward: '0' }, /^Say whether the private company had an income tax liability/);
});

test('franking account agrees with the franking-account command on every recorded case', () => {
  const { engine, cases } = JSON.parse(readFileSync(new URL('./franking-account-engine-differential.json', import.meta.url), 'utf8'));
  assert.match(engine, /^australian-tax-calculators 1\.0\.0 .*commit 7caa54d24f5811d2cd4c610aec8933efaf83bfbe/);
  assert.ok(cases.length >= 260);
  for (const { source, call, refused, amounts, rates, balances, percentages } of cases) {
    if (refused) {
      assert.throws(() => calculations.frankingAccount(call), Error, source);
      continue;
    }
    const r = calculations.frankingAccount(call);
    const mine = { opening_balance: Number(call.opening), credits: r.credits, debits: r.debits, closing_balance: r.closing,
      franking_deficit_tax: r.fdt, fdt_from_refunds_after_year_end: r.fdtFromRefunds, fdt_offset_reduction: r.reduction,
      offsetable_fdt: r.offset, debits_not_subject_to_reduction: r.labelK, over_franking_tax: r.oft, franking_tax_payable: r.payable,
      rd_deferred_debit_carried_forward: r.rdCarried,
      ...(r.offsetTotal === null ? {} : { fdt_offset_total: r.offsetTotal, fdt_offset_used: r.offsetUsed, fdt_offset_carried_forward: r.offsetCarried }) };
    assert.deepEqual(mine, Object.fromEntries(Object.entries(amounts).map(([key, value]) => [key, Number(value)])), source);
    assert.deepEqual({ balance_code: r.balanceCode, offset_code: r.offsetCode ?? 'none', significant_variation: String(r.variation),
      return_required: String(r.required), return_due: r.due ?? 'none' }, rates, source);
    assert.deepEqual(r.ledger.map((l) => l.balance), balances.map(Number), source);
    assert.deepEqual(r.distributions.map((x) => x.percentage), percentages, source);
  }
});

test('the franking account page opens on EKW Ltd’s result and cites each source with its date', () => {
  const example = frankingHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const fields = formDefaults(frankingHtml);
  const result = calculations.frankingAccountResult((name) => fields[name], aud);
  assert.deepEqual([result.inputs, result.rows.map((row) => row.join('|')).join(';'), String(result.principal), result.note],
    example.slice(1, 5).map((text) => text.replaceAll('&amp;', '&')));
  assert.equal(result.rows[result.principal].join('|'), 'Franking tax payable (label E), due 31 July 2026|$80,000.00');
  assert.equal(result.tables.ledger.length, 6);
  for (const cited of ['read on the ATO Legal Database 19 November 2026', 'read on the Federal Register of Legislation 19 November 2026',
    '(published 30 May 2026), read 19 November 2026']) {
    assert.ok(frankingHtml.includes(cited), cited);
  }
  // Each event type the engine takes is one the form offers.
  const offered = [...frankingHtml.match(/<select name="event-1-type">(.*?)<\/select>/s)[1].matchAll(/value="([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(offered, Object.keys(calculations.FRANKING_EVENTS));
});

test('the franking account page dates tax from a refund after the year’s end under s 214-150(4)', () => {
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const blank = Object.fromEntries([3, 4, 5].flatMap((i) => ['date', 'amount', 'rd'].map((k) => [`event-${i}-${k}`, ''])));
  const page = (overrides) => {
    const fields = { ...formDefaults(frankingHtml), ...blank, opening: '0', 'event-1-type': 'payg_instalment', 'event-1-date': '2025-10-28',
      'event-1-amount': '5000', 'event-1-rd': '', 'event-2-type': 'income_tax_refund', 'event-2-amount': '20000', 'event-2-rd': '',
      'distribution-1-date': '', 'distribution-1-amount': '', 'distribution-1-credit': '', 'distribution-1-permitted': '', ...overrides };
    return calculations.frankingAccountResult((name) => fields[name], aud).rows.map((row) => row.join('|'));
  };
  // No return outstanding: the whole tax is the refund's, due 14 days after it.
  const late = page({ 'event-2-date': '2026-08-15' });
  assert.ok(late.includes('Franking tax payable (label E)|$15,000.00'), late.join('\n'));
  assert.ok(late.includes('Of it, from the refund received 15 August 2026, due 29 August 2026 (s 214-150(4))|$15,000.00'), late.join('\n'));
  // A deficit before the refund leaves a return outstanding, whose due date the refund's tax may take.
  const outstanding = page({ 'event-2-date': '2026-07-15', 'distribution-1-date': '2025-09-30', 'distribution-1-amount': '14000',
    'distribution-1-credit': '6000' });
  assert.ok(outstanding.includes('Franking tax payable (label E), due 31 July 2026 but for the refund tax below|$21,000.00'), outstanding.join('\n'));
  assert.ok(outstanding.includes('Of it, from the refund received 15 July 2026, due 31 July 2026 if in the outstanding return, otherwise 29 July 2026 (s 214-150(4))|$20,000.00'),
    outstanding.join('\n'));
});

// Salary against dividends: how each call and result reads, how the form passes its fields, and the
// page's example worked by hand. 2026-27, a base rate entity, $200,000 of profit, $100,000 of salary:
// super guarantee 12% of $100,000 = $12,000; company tax 25% of $88,000 = $22,000; dividend $66,000
// with a credit of $66,000 x 25/75 = $22,000; taxable income $100,000 + $66,000 + $22,000 less the
// $1,000 standard deduction = $187,000; tax $31,020 + 37% of $52,000 = $50,260 and the Medicare levy
// $3,740, $54,000 less the $22,000 credit = $32,000; cash $166,000 - $32,000 = $134,000; super
// $12,000 less 15% = $10,200. All salary: $178,571.43 and $21,428.57 of super guarantee use the
// profit; taxable income $177,571, tax $31,020 + 37% of $42,571 = $46,771.27 and levy $3,551.42, so
// cash $128,248.74, and super $21,428.57 less $3,214.29 = $18,214.28. All dividends: company tax
// $50,000, taxable income $200,000, tax $55,870 and levy $4,000 less the $50,000 credit = $9,870.
const { SALARY_DIVIDEND_YEARS } = await import('../assets/salary-dividend.mjs');
const salaryDividendHtml = readFileSync(new URL('../_includes/calculators/salary-dividend.html', import.meta.url), 'utf8');
const ownerPay = { year: '2026-27', profit: '200000', baseRate: true, salary: '100000', other: '0' };
Object.assign(INPUTS, {
  salaryDividend: (p) => `${p.year}, profit ${dollars(Number(p.profit))}, ${p.baseRate ? '25%' : '30%'} company, salary `
    + `${dollars(Number(p.salary))}, other income ${dollars(Number(p.other))}`,
});
Object.assign(FORM_CALLS, {
  salaryDividend: (f) => [{ year: f.year, profit: f.profit, baseRate: f['base-rate'] === 'yes', salary: f.salary, other: f.other }],
});
Object.assign(ENGINE_LABELS, {
  salaryDividend: { superGuarantee: 'super guarantee', companyTax: 'company tax', dividend: 'dividend', credit: 'franking credit',
    ownerTax: (v) => (v < 0 ? `owner’s refund ${dollars(-v)}` : `owner’s tax ${dollars(v)}`), superTax: 'super tax', cash: 'cash kept',
    superNet: 'super kept', kept: 'kept in all', allSalary: 'all salary keeps', allDividends: 'all dividends keep',
    bestSalary: 'best salary', bestKept: 'best keeps' },
});

test('salary against dividends works the page’s example, all salary and all dividends as by hand', () => {
  const r = calculations.salaryDividend(ownerPay);
  assert.deepEqual([r.superGuarantee, r.companyTax, r.dividend, r.credit, r.taxable, r.ownerTax, r.cash, r.superTax, r.superNet, r.kept],
    [12000, 22000, 66000, 22000, 187000, 32000, 134000, 1800, 10200, 144200]);
  assert.deepEqual([r.largest, r.allSalary, r.allDividends], [178571.43, 146463.02, 140130]);
  const all = calculations.salaryDividend({ ...ownerPay, salary: '178571.43' });
  assert.deepEqual([all.superGuarantee, all.companyTax, all.taxable, all.ownerTax, all.cash, all.superTax, all.superNet],
    [21428.57, 0, 177571, 50322.69, 128248.74, 3214.29, 18214.28]);
  const none = calculations.salaryDividend({ ...ownerPay, salary: '0' });
  assert.deepEqual([none.companyTax, none.taxable, none.ownerTax, none.cash], [50000, 200000, 9870, 140130]);
});

test('salary against dividends counts Division 293 tax and stops the super guarantee at the year’s base', () => {
  // Taxable income $566,500 and $32,499.60 of super guarantee exceed $250,000 by more than the
  // contributions, so Division 293 taxes all $32,499.60 at 15%: $4,874.94 (section 293-20).
  const r = calculations.salaryDividend({ ...ownerPay, profit: '600000', salary: '270830' });
  assert.deepEqual([r.superGuarantee, r.division293, r.superTax], [32499.6, 4874.94, 9749.88]);
  assert.equal(calculations.salaryDividend({ ...ownerPay, profit: '600000', salary: '300000' }).superGuarantee, 32499.6);
  // 2025-26: 4 quarters of $62,500 is the base; above it a salary adds no super guarantee.
  assert.equal(calculations.salaryDividend({ ...ownerPay, year: '2025-26', profit: '400000', salary: '260000' }).superGuarantee, 30000);
  assert.equal(calculations.salaryDividend({ ...ownerPay, year: '2024-25', salary: '100000' }).superGuarantee, 11500);
});

test('salary against dividends finds a best split no worse than all salary, all dividends or the split entered', () => {
  for (const [year, profit, baseRate, other] of [['2026-27', '30000', true, '0'], ['2025-26', '24000', true, '0'],
    ['2021-22', '41000', false, '0'], ['2024-25', '38000', true, '12000'], ['2026-27', '900000', false, '50000']]) {
    for (const salary of ['0', '5000', '20000']) {
      const r = calculations.salaryDividend({ year, profit, baseRate, salary, other });
      for (const kept of [r.allSalary, r.allDividends, r.kept]) assert.ok(r.bestKept >= kept - 1, `${year} ${profit} ${salary}`);
      assert.equal(calculations.salaryDividend({ year, profit, baseRate, salary: String(r.bestSalary), other }).kept, r.bestKept);
    }
  }
});

test('salary against dividends refuses what it does not cover', () => {
  assert.throws(() => calculations.salaryDividend({ ...ownerPay, year: '2020-21' }), { message: 'Choose an income year from 2021-22 to 2026-27.' });
  assert.throws(() => calculations.salaryDividend({ ...ownerPay, baseRate: 'yes' }), { message: 'Say whether the company is a base rate entity.' });
  assert.throws(() => calculations.salaryDividend({ ...ownerPay, salary: '178571.44' }),
    { message: 'Enter a salary of no more than $178,571.43: the profit also pays its super guarantee.' });
  assert.throws(() => calculations.salaryDividend({ ...ownerPay, other: '-1' }), { message: 'Enter an amount between 0 and 1000000000.' });
});

test('the salary against dividends page offers each year the engine covers and opens on its example', () => {
  const years = [...salaryDividendHtml.matchAll(/name="year" value="([^"]+)"/g)].map(([, year]) => year);
  assert.deepEqual(years, SALARY_DIVIDEND_YEARS);
  assert.deepEqual(SALARY_DIVIDEND_YEARS, ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22']);
  const example = salaryDividendHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const result = calculations.salaryDividendResult(ownerPay, aud);
  assert.equal(result.inputs, example[1]);
  assert.equal(result.rows.map((row) => row.join('|')).join(';'), example[2]);
  assert.equal(String(result.principal), example[3]);
  assert.equal(result.note, example[4]);
  for (const cited of ['(last updated 17 April 2026), read 19 November 2026', '(last updated 4 September 2026), read 19 November 2026',
    'last updated 24 August 2026, read 19 November 2026', 'paragraph 26(1)(a) of the Income Tax Rates Act 1986, read 19 November 2026']) {
    assert.ok(salaryDividendHtml.includes(cited), cited);
  }
});

test('salary against dividends charges the owner only the extra tax over other income, and rounds the credit down', () => {
  // $40,000 of other income alone: 15% of $21,800 = $3,270, less the $575 low income tax offset,
  // plus the $800 levy = $3,495. With the $37,500 dividend and $12,500 credit, taxable income is
  // $90,000: $4,020 + 30% of $45,000 = $17,520 and the $1,800 levy, less the credit, $6,820; the
  // extra tax is $6,820 - $3,495 = $3,325.
  const other = calculations.salaryDividend({ ...ownerPay, profit: '50000', salary: '0', other: '40000' });
  assert.deepEqual([other.taxable, other.ownerTax, other.cash], [90000, 3325, 34175]);
  // At 30%, $100,000.01 leaves a $70,000.01 dividend: 3/7 of it is $30,000.0043, so $30,000.00.
  const odd = calculations.salaryDividend({ ...ownerPay, profit: '100000.01', baseRate: false, salary: '0' });
  assert.deepEqual([odd.companyTax, odd.dividend, odd.credit], [30000, 70000.01, 30000]);
});

// The AASB 16 lease page: how its call and results read.
const leaseHtml = calculatorInclude('lease');
const LEASE_EXTRAS = [['residual', 'residual'], ['prepaid', 'paid before commencement'], ['incentives', 'incentives'],
  ['direct', 'initial direct costs'], ['restoration', 'restoration']];
Object.assign(INPUTS, {
  lease: (t) => [`${t.payments} ${t.frequency} payments of ${dollars(Number(t.payment))}${t.timing === 'advance' ? ' in advance' : ''}`,
    `${t.rate}% a year`, ...LEASE_EXTRAS.filter(([k]) => Number(t[k]) !== 0).map(([k, w]) => `${w} ${dollars(Number(t[k]))}`), `from ${t.start}`,
    t.ownership === 'yes' ? `ownership transfers${t.life ? `, useful life ${t.life} months` : ''}` : t.life ? `useful life ${t.life} months` : '']
    .filter(Boolean).join(', '),
});
Object.assign(FORM_CALLS, {
  lease: (f) => [{ payment: f.payment, payments: f.payments, frequency: f.frequency, timing: f.timing, rate: f.rate, start: f.start,
    residual: f.residual, prepaid: f.prepaid, incentives: f.incentives, direct: f.direct, restoration: f.restoration,
    ownership: f.ownership, life: f.life }],
});
Object.assign(ENGINE_LABELS, {
  lease: { liability: 'lease liability', cost: 'right-of-use asset', shortTerm: (v) => (v ? 'short term' : 'not short term') },
});
const LEASE_TERMS = FORM_CALLS.lease(formDefaults(leaseHtml))[0];
const leaseOf = (changes = {}) => calculations.lease({ ...LEASE_TERMS, ...changes });
const PURCHASE = { price: '50000', gst: 'credit', hpRate: '7.5', life: '8', method: 'diminishing-value', taxRate: '25', car: 'no' };
const compare = (terms = {}, purchase = {}) => calculations.leaseComparison({ ...LEASE_TERMS, ...terms }, { ...PURCHASE, ...purchase });
// A calculation the test expects to work: a refusal fails the assertion, not the test run.
const worked = (run) => {
  let result;
  assert.doesNotThrow(() => { result = run(); });
  return result;
};

test('the lease page opens on the result its calculation gives for the form’s inputs', () => {
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const example = leaseHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/);
  const fields = formDefaults(leaseHtml);
  const result = calculations.leaseResult((name) => fields[name], aud);
  assert.deepEqual([result.inputs, result.rows.map((row) => row.join('|')).join(';'), String(result.principal), result.note], example.slice(1));
  assert.deepEqual(Object.keys(result.tables), ['years', 'schedule', 'commencement', 'comparison']);
  assert.equal(calculations.leaseResult((name) => ({ ...fields, compare: 'no' })[name], aud).tables.comparison, undefined);
});

test('the lease engine reproduces IFRS 16 Example 13 to the currency unit, year by year', () => {
  // Illustrative Examples accompanying IFRS 16, Example 13 (IE5 as amended in 2020): CU50,000 a year
  // in advance for 10 years at 5%, initial direct costs CU20,000, an incentive CU5,000. The example
  // rounds each year to the whole CU; the engine rounds to the cent, so each figure is within 1 CU.
  const r = worked(() => leaseOf({ payment: '50000', payments: '10', frequency: 'annual', timing: 'advance', rate: '5', incentives: '5000', direct: '20000' }));
  assert.deepEqual([r.liability, r.cost], [355391.08, 420391.08]);
  const ie = [[17770, 373161, 378352], [16158, 339319, 336313], [14466, 303785, 294274], [12689, 266474, 252235],
    [10823, 227297, 210196], [8865, 186162, 168157]];
  ie.forEach(([interest, liability, asset], i) => {
    const year = r.years[i];
    for (const [got, want] of [[year.interest, interest], [year.liability, liability], [year.asset, asset], [year.depreciation, 42039]]) {
      assert.ok(Math.abs(got - want) <= 1, `${year.year}: ${got} against ${want}`);
    }
  });
  // Over the whole term the depreciation is the cost and the liability closes on nil.
  assert.equal(Math.round(r.years.reduce((sum, year) => sum + year.depreciation * 100, 0)), 42039108);
  assert.equal(r.years.at(-1).liability, 0);
});

test('a residual on a lease paid in advance falls a period after the last payment', () => {
  // Paid monthly in advance from 1 July 2026, the 60th payment falls on 1 June 2031 and the residual at the end of the term.
  const r = worked(() => leaseOf({ timing: 'advance', residual: '10000' }));
  assert.deepEqual(r.rows.slice(-2).map(({ date, payment }) => [date, payment]), [['2031-06-01', 1000], ['2031-07-01', 10000]]);
  assert.equal(r.end, '2031-07-01');
});

test('the lease engine depreciates over the useful life when ownership transfers or the life is shorter', () => {
  assert.equal(leaseOf().depreciationEnd, '2031-07-01');
  assert.equal(leaseOf({ residual: '5000', ownership: 'yes', life: '96' }).depreciationEnd, '2034-07-01');
  assert.equal(leaseOf({ life: '36' }).depreciationEnd, '2029-07-01');
  // A longer life without ownership transferring leaves the lease term as the period.
  assert.equal(leaseOf({ life: '96' }).depreciationEnd, '2031-07-01');
  assert.equal(leaseOf({ payment: '2000', payments: '12', rate: '6' }).shortTerm, true);
  assert.equal(leaseOf({ payment: '2000', payments: '12', rate: '6', residual: '100', ownership: 'yes', life: '60' }).shortTerm, false);
  // Appendix A excludes only a lease with a purchase option: a residual value guarantee alone leaves it short-term.
  assert.equal(leaseOf({ payment: '2000', payments: '12', rate: '6', residual: '100' }).shortTerm, true);
  assert.equal(leaseOf({ payments: '13' }).shortTerm, false);
  for (const [changes, message] of [[{ payments: '0' }, 'Enter a whole number between 1 and 600.'], [{ life: '1.5' }, 'Enter a whole number between 1 and 600.'],
    [{ ownership: 'maybe' }, 'Choose whether ownership transfers or a purchase option is reasonably certain.']]) {
    assert.throws(() => leaseOf(changes), { message }, JSON.stringify(changes));
  }
});

test('the lease comparison times each GST credit as the ATO’s hire purchase and leasing guidance does', () => {
  // ATO, GST and hire purchase and leasing: a $220 monthly lease payment carries a $20 credit in the
  // period it is paid; a hire purchase entered into after 1 July 2012 gives one-eleventh of all its
  // payments as a credit in the period of the first payment.
  const melinda = worked(() => compare({ payment: '200', payments: '36' }, { price: '6000' }));
  // Paid monthly in arrears from 1 July 2026: 11 payments in 2026-27 and the 36th on 1 July 2029.
  assert.deepEqual(melinda.lease.years.map((y) => y.credits), [220, 240, 240, 20]);
  assert.deepEqual(melinda.lease.years.map((y) => y.cash), [2420, 2640, 2640, 220]);
  const c = worked(() => compare());
  assert.equal(c.hirePurchase.years[0].credits, Math.round(c.hirePurchase.cash * 100 / 11) / 100);
  assert.ok(c.hirePurchase.years.slice(1).every((y) => y.credits === 0));
  assert.deepEqual([c.buy.years[0].cash, c.buy.years[0].credits], [55000, 5000]);
  assert.deepEqual([c.lease.net, c.hirePurchase.net, c.buy.net], [45000, 47306.02, 39720.66]);
  // Section 27-5: a claimed credit is not deductible, so the lease deducts the GST-exclusive payments.
  assert.equal(c.lease.deductions, 60000);
  // Without a credit, the GST paid is part of each deduction; with no GST charged, nothing is added.
  const noCredit = compare({}, { gst: 'no-credit' });
  assert.deepEqual([noCredit.lease.credits, noCredit.lease.deductions, noCredit.buy.cash], [0, 66000, 55000]);
  const none = compare({}, { gst: 'none' });
  assert.deepEqual([none.lease.cash, none.lease.credits, none.buy.cash], [60000, 0, 50000]);
  // Every income year from commencement to the last payment is shown, so a payment on 1 July 2031 counts.
  assert.equal(c.lastYear, '2031-32');
  assert.equal(c.lease.years.reduce((sum, y) => sum + y.cash * 100, 0), 6600000);
});

test('the lease comparison refuses a car above the car limit and inputs it cannot read', () => {
  assert.throws(() => compare({}, { car: 'yes' }), /Division 242/);
  for (const [purchase, message] of [[{ car: '' }, 'Choose whether the asset is a car above the car limit.'], [{ gst: 'some' }, 'Choose how GST applies.'],
    [{ method: 'straight' }, 'Choose prime cost or diminishing value.']]) {
    assert.throws(() => compare({}, purchase), { message }, JSON.stringify(purchase));
  }
  for (const purchase of [{ price: '-1' }, { price: '' }, { taxRate: '100.01' }, { hpRate: 'abc' }, { life: '0' }]) {
    assert.throws(() => compare({}, purchase), Error, JSON.stringify(purchase));
  }
});

// The workers compensation premium page: how each call and result reads, each scheme's published
// examples and the edges of its method.
const wcHtml = readFileSync(new URL('../_includes/calculators/workers-compensation.html', import.meta.url), 'utf8');
Object.assign(INPUTS, { workersCompensation: (x) => [`${PLACES[x.place]}, wages ${dollars(Number(x.wages))} at ${x.rate}%`,
  x.apprentice !== '0' && `apprentice wages ${dollars(Number(x.apprentice))}`,
  x.place === 'AU-NSW' && `dust diseases ${x.dust}%, reward ${x.reward}%`,
  x.place === 'AU-VIC' && `${x.vicEmployer} employer, ${x.days} days${x.buyout === 'yes' ? ', excess bought out' : ''}`,
  x.place === 'AU-QLD' && `policy from ${x.qldStart}`,
  x.place === 'AU-SA' && (x.firstYear === 'yes' ? 'first full year' : `claims ${dollars(Number(x.claims))}`),
  x.group === 'yes' && 'a member of a group',
  x.actual !== '' && `actual wages ${dollars(Number(x.actual))}`].filter(Boolean).join(', ') });
Object.assign(FORM_CALLS, { workersCompensation: (f) => [{ place: f.jurisdiction, wages: f.wages, rate: f.rate, apprentice: f.apprentice,
  actual: f.actual, group: f.group, dust: f.dust, reward: f.reward, vicEmployer: f['vic-employer'], days: f.days, buyout: f.buyout,
  qldStart: f['qld-start'], firstYear: f['first-year'], claims: f.claims }] });
Object.assign(ENGINE_LABELS, { workersCompensation: { premium: 'premium before GST', total: 'payable', actualTotal: 'payable on actual wages',
  adjustment: 'adjustment' } });
const wc = (change) => calculations.workersCompensation({ place: 'AU-NT', wages: '400000', rate: '3.5', apprentice: '0', actual: '', group: 'no',
  dust: '0', reward: '0', vicEmployer: 'new', days: '365', buyout: 'no', qldStart: 'q1', firstYear: 'no', claims: '0', ...change });
// A refusal where a result is due fails as an assertion, so the mutation check counts it as caught.
const ok = (change) => {
  try {
    return wc(change);
  } catch (error) {
    return assert.fail(`${JSON.stringify(change)} was refused: ${error.message}`);
  }
};

test('the workers compensation page opens on the result its calculation gives, names every scheme and cites each source with the date read', () => {
  const example = wcHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)" note="([^"]*)" %\}/);
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }).replace(/^-/, '−');
  const fields = formDefaults(wcHtml);
  const result = calculations.workersCompensationResult((name) => fields[name], aud);
  assert.deepEqual([result.inputs, result.rows.map((row) => row.join('|')).join(';'), String(result.principal), result.note], example.slice(1));
  const radios = [...wcHtml.matchAll(/name="jurisdiction" value="([^"]+)"(?: checked)? \/> ([^<]+)</g)].map(([, code, name]) => [code, name]);
  assert.deepEqual(radios, Object.entries(calculations.WC_SCHEMES).map(([code, { name }]) => [code, name]));
  for (const cited of ['Guidelines 2026</a>, for policies issued or renewed from 4 pm on 30 June 2026, read 19 November 2026',
    '(updated 9 November 2026)', 'and the values WorkSafe set in Gazette S 284 of 2 June 2026, both read 19 November 2026',
    '(Queensland Government Gazette No. 43, 26 June 2026), read 19 November 2026', '(reprint current from 22 October 2026), read 19 November 2026',
    'Your premium explained</a>, read 19 November 2026', '(last updated 21 March 2025), read 19 November 2026',
    'suggested reasonable premium rates for 2026/27, each read 19 November 2026']) {
    assert.ok(wcHtml.includes(cited), cited);
  }
});

test('workers compensation matches each scheme’s published worked figures', () => {
  // NT WorkSafe's bulletin: $400,000 × 3.50% = $14,000 + $1,400 GST; $500,000 actual gives $19,250, $3,850 more.
  assert.deepEqual(['total', 'actualTotal', 'adjustment'].map((k) => ok({ actual: '500000' })[k]), [15400, 19250, 3850]);
  // ReturnToWorkSA's 3 examples, before GST and the WHS fee.
  for (const [wages, rate, claims, premium] of [['450000', '2', '0', 8550], ['450000', '2', '2500', 9900], ['1000000', '6', '5000', 56000]]) {
    assert.equal(ok({ place: 'AU-SA', wages, rate, claims }).premium, premium, `${wages} ${claims}`);
  }
  // icare's Rob's Restaurant: $1,200,000 at 2.250% is an APP of $27,000; the 7.5% reward takes $2,025 off.
  const rob = ok({ place: 'AU-NSW', wages: '1200000', rate: '2.25', reward: '7.5' });
  assert.deepEqual([rob.lines[0][1], rob.lines[1][1], rob.premium], [2700000n, -202500n, 24975]);
});

test('workers compensation applies each scheme’s thresholds, rounding and minimums at their edges', () => {
  // SIRA Guidelines 2026 clause 6.7: a basic tariff premium that does not exceed $30,000 is a small employer's.
  assert.equal(ok({ place: 'AU-NSW', wages: '1000000', rate: '3' }).premium, 30000);
  assert.throws(() => wc({ place: 'AU-NSW', wages: '1000000.17', rate: '3' }), /\$30,000\.01 is more than \$30,000/);
  // icare's $240 minimum: $12,000 at 2% is exactly $240 and stands; a cent of premium less is refused.
  assert.equal(ok({ place: 'AU-NSW', wages: '12000', rate: '2' }).premium, 240);
  assert.throws(() => wc({ place: 'AU-NSW', wages: '11999.5', rate: '2' }), /\$239\.99 is below icare’s minimum premium of \$240/);
  // NSW: the apprentice incentive is apprentice wages × the WIC rate, and the dust diseases rate already includes GST.
  const nsw = ok({ place: 'AU-NSW', wages: '500000', rate: '2', apprentice: '50000', dust: '0.044' });
  assert.deepEqual([nsw.premium, nsw.gst, nsw.total], [9000, 900, 10120]);
  // ReturnToWorkSA's discount bands: 5% under $10,000 up to 30% at $1,000,000, each from its lower bound.
  for (const [base, band] of [['9999.99', 5], ['10000', 10], ['49999.99', 10], ['50000', 15], ['99999.99', 15], ['100000', 20],
    ['499999.99', 20], ['500000', 25], ['999999.99', 25], ['1000000', 30]]) {
    const { lines } = ok({ place: 'AU-SA', wages: String(Number(base) * 50), rate: '2' });
    assert.equal(lines[1][0], `Less discount at ${band}% for a base premium in its band`, base);
  }
  // Claims costs are capped at 3 × D × BP, $1,350 on a $9,000 base premium; the premium rounds down to the dollar.
  assert.equal(ok({ place: 'AU-SA', wages: '450000', rate: '2', claims: '1350' }).premium, 9900);
  assert.equal(ok({ place: 'AU-SA', wages: '450000', rate: '2', claims: '1349.99' }).premium, 9899);
  assert.equal(ok({ place: 'AU-SA', wages: '1000', rate: '2' }).premium, 200);
  assert.equal(ok({ place: 'AU-SA', wages: '450000', rate: '2', firstYear: 'yes', claims: 'not read' }).premium, 9000);
  // Premiums Order (No. 34) clauses 9 and 11: 2% of $150,000 less 2% of $15,500; the $400 minimum below that.
  assert.equal(ok({ place: 'AU-VIC', wages: '150000', rate: '2' }).premium, 2690);
  assert.equal(ok({ place: 'AU-VIC', wages: '150000', rate: '2', days: '73' }).premium, 2938);
  // Clause 6(4): the deductible of $84.931507 is $84.93 before it comes off, so $2,915.07, not $2,915.06.
  assert.equal(ok({ place: 'AU-VIC', wages: '150000', rate: '2', days: '100' }).premium, 2915.07);
  assert.equal(ok({ place: 'AU-VIC', wages: '35499', rate: '2' }).premium, 400);
  assert.equal(ok({ place: 'AU-VIC', wages: '35501', rate: '2' }).premium, 400.02);
  // Clause 6(6): remuneration to the nearest dollar.
  assert.equal(ok({ place: 'AU-VIC', wages: '150000.49', rate: '2' }).premium, 2690);
  assert.equal(ok({ place: 'AU-VIC', wages: '150000.50', rate: '2' }).premium, 2690.02);
  // Clause 10: the buy-out is 0.1 of the WorkCover premium.
  assert.equal(ok({ place: 'AU-VIC', wages: '150000', rate: '2', buyout: 'yes' }).premium, 2959);
  // Queensland: 5% duty on the premium and its GST (DA356.1), and section 4.1's minimums by quarter, including both.
  const qld = ok({ place: 'AU-QLD', wages: '500000', rate: '1.343' });
  assert.deepEqual([qld.premium, qld.gst, qld.duty, qld.total], [6715, 671.5, 369.33, 7755.83]);
  for (const [qldStart, minimum] of [['q1', 200], ['q2', 150], ['q3', 100], ['q4', 50]]) {
    assert.equal(ok({ place: 'AU-QLD', wages: '1000', rate: '1.343', qldStart }).total, minimum, qldStart);
  }
  // A premium of $181.31 is under $200 alone, but $209.41 with GST and duty, so no minimum applies.
  assert.equal(ok({ place: 'AU-QLD', wages: '13500', rate: '1.343' }).total, 209.41);
});

test('workers compensation refuses what only the insurer decides and malformed input instead of guessing', () => {
  const rate = 'Enter the rate as a percentage from 0.0001% to 100%, to no more than 4 decimal places.';
  for (const [change, message] of [[{ place: 'AU-CTH' }, 'Choose the state or territory whose scheme insures the workers.'],
    [{ group: 'maybe' }, 'Choose whether the employer is a member of a group.'],
    [{ place: 'AU-VIC', vicEmployer: 'other' }, /performance-rated premium/],
    [{ place: 'AU-QLD', qldStart: 'existing' }, /simplified or experience-based model/],
    [{ place: 'AU-SA', group: 'yes' }, /group’s wages or premiums together/],
    [{ place: 'AU-NSW', apprentice: '400000.01' }, 'Apprentice wages are part of the wages: enter no more than the wages.'],
    [{ place: 'AU-WA', apprentice: '1' }, 'There is no apprentice deduction for Western Australia here: enter 0 apprentice wages.'],
    [{ rate: '0' }, rate], [{ rate: '1.00001' }, rate], [{ rate: '' }, rate],
    [{ wages: '' }, 'Enter the estimated wages in dollars and cents, from $0 to $10,000,000,000.'],
    [{ actual: '-1' }, 'Enter the actual wages in dollars and cents, from $0 to $10,000,000,000.'],
    [{ place: 'AU-NSW', dust: '' }, 'Enter the dust diseases rate as a percentage from 0% to 10%, to no more than 4 decimal places.'],
    [{ place: 'AU-VIC', days: '366' }, 'Enter the days in 2026-27 the employer is registered, from 1 to 365.'],
    [{ place: 'AU-SA', claims: '' }, 'Enter the claims costs in dollars and cents, from $0 to $10,000,000,000.'],
    [{ place: 'AU-NSW', wages: '1000000', rate: '2', actual: '1600000' }, /Error: On the actual wages, the average performance premium of \$32,000\.00/]]) {
    assert.throws(() => wc(change), message instanceof RegExp ? message : { message }, JSON.stringify(change));
  }
  // A group does not change a privately set rate × wages, and only the chosen scheme's own answers are read.
  assert.equal(wc({ group: 'yes' }).total, 15400);
  assert.equal(wc({ dust: 'x', days: 'x', claims: 'x', vicEmployer: 'x', qldStart: 'x', firstYear: 'x' }).total, 15400);
});

// ATO Key superannuation rates and thresholds, Table 21, read 19 November 2026: Norfolk Island's
// transitional rate is 11% for 2026-27 and 7% to 10% for 2022-23 to 2025-26.
test('the SGC page refuses Norfolk Island salary or wages under either law rather than apply the general rate', () => {
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  const fields = formDefaults(sgcHtml);
  assert.equal(fields['norfolk-island'], 'no');
  for (const regime of ['payday', 'quarter']) {
    assert.throws(() => calculations.sgcPaydayResult((name) => ({ ...fields, regime, 'norfolk-island': 'yes' })[name], aud),
      { message: 'Norfolk Island salary or wages have a lower transitional super guarantee rate (7% to 10% for 2022-23 to '
        + '2025-26, 11% for 2026-27), which this calculator does not apply.' }, regime);
    assert.throws(() => calculations.sgcPaydayResult((name) => ({ ...fields, regime, 'norfolk-island': undefined })[name], aud),
      { message: 'Say whether any of the pay is Norfolk Island salary or wages.' }, regime);
  }
  assert.ok(sgcHtml.includes('(Table 21, read 19 November 2026)'));
});

// The borrowing expenses page: how each call and result reads, section 25-25 against the ATO's
// and the command's cases, the accounting column against an independent effective rate, and the
// command it ports, run on the same cases.
const borrowHtml = readFileSync(new URL('../_includes/calculators/borrowing-expenses.html', import.meta.url), 'utf8');
const borrowAud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
Object.assign(INPUTS, { borrowingSchedule: (x) => calculations.borrowingInputsText(x, borrowAud) });
Object.assign(FORM_CALLS, { borrowingSchedule: (f) => [calculations.borrowingFormInput((name) => f[name] ?? '')] });
Object.assign(ENGINE_LABELS, { borrowingSchedule: { borrowingExpenses: 'borrowing expenses', maximumDeduction: 'maximum deduction', deduction: 'deduction',
  remainingAfterYear: 'still to deduct' } });
const borrowLoan = (over = {}) => ({ borrowing_expenses: '1600.00', loan_start: '2020-07-03', loan_term_end: '2045-07-02', repaid_on: null,
  income_use: '1', section_26_50_applies: false, ...over });
const borrowRows = (r, n) => r.loans[n - 1].rows.map((row) => [row.income_year, (Number(row.remaining) / 100).toFixed(2),
  (Number(row.maximum) / 100).toFixed(2), (Number(row.deduction) / 100).toFixed(2), row.days, row.left]);
const borrowCode = (input) => {
  try {
    calculations.borrowingSchedule(input);
  } catch (error) {
    return error.code;
  }
  return 'computed';
};

// The fuel tax credit page: how each call and result reads, the ATO's rates for each period, the
// small claimant methods and the command it ports, run on the same cases.
const ftcHtml = readFileSync(new URL('../_includes/calculators/fuel-tax-credits.html', import.meta.url), 'utf8');
const ftcAud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
Object.assign(INPUTS, { fuelTaxCredits: (x) => calculations.fuelInputsText(x, ftcAud) });
Object.assign(FORM_CALLS, { fuelTaxCredits: (f) => [calculations.fuelFormInput((name) => f[name] ?? '')] });
Object.assign(ENGINE_LABELS, { fuelTaxCredits: { total: 'fuel tax credits', label7d: (v) => `label 7D ${dollars(v)}` } });
const ftcLine = (fuel, use, acquired, quantity) => ({ fuel, use, acquired, quantity });
const ftc = (year, lines, more = {}) => calculations.fuelTaxCredits({ year, lines, ...more });
const ftcCode = (input) => {
  try {
    calculations.fuelTaxCredits(input);
  } catch (error) {
    return error.code;
  }
  return 'computed';
};

test('the borrowing expenses page opens on the result its calculation gives, and dates its sources', () => {
  const example = borrowHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)"(?: note="([^"]*)")? %\}/);
  const fields = formDefaults(borrowHtml);
  const result = calculations.borrowingResult((name) => fields[name] ?? '', borrowAud);
  assert.deepEqual([result.inputs, result.rows.map((row) => row.join('|')).join(';'), String(result.principal), result.note], example.slice(1));
  for (const cited of ['section 25-25</a> of the Income Tax Assessment Act 1997 at the ATO’s legal database, read 19 November 2026',
    '(last updated 22 May 2026), read 19 November 2026', 'section 26-155</a>, read 19 November 2026',
    '/aasb-9-feb-2025">compilation 6</a> covers periods beginning from January to June 2026',
    '/aasb-9-feb-2025-0">Compilation 7</a>, checked on 20 November 2026, covers periods beginning from July to December 2026',
    'AASB’s list of versions and amendments</a> for your reporting period',
    '/aasb-123-mar-2020">AASB 123 Borrowing Costs</a> (compilation 2)']) {
    assert.ok(borrowHtml.includes(cited), cited);
  }
});

// The ATO's Peter and Fiona and Max, 'Borrowing expenses' (last updated 22 May 2026), read
// 19 November 2026, as the command's tests give each year.
test('borrowing expenses give every year of the ATO’s Peter and Fiona and Max by days', () => {
  const r = calculations.borrowingSchedule({ year: '2024-25', loans: [borrowLoan(),
    borrowLoan({ borrowing_expenses: '1670.00', loan_start: '2020-07-17', loan_term_end: '2040-07-16', income_use: '0.813397' })] });
  assert.deepEqual(borrowRows(r, 1), [['2020-21', '1600.00', '318.07', '318.07', 363, 1826], ['2021-22', '1281.93', '319.83', '319.83', 365, 1463],
    ['2022-23', '962.10', '319.82', '319.82', 365, 1098], ['2023-24', '642.28', '320.70', '320.70', 366, 733],
    ['2024-25', '321.58', '319.83', '319.83', 365, 367], ['2025-26', '1.75', '1.75', '1.75', 2, 2]]);
  assert.deepEqual(borrowRows(r, 2), [['2020-21', '1670.00', '319.18', '259.62', 349, 1826], ['2021-22', '1350.82', '333.82', '271.53', 365, 1477],
    ['2022-23', '1017.00', '333.82', '271.53', 365, 1112], ['2023-24', '683.18', '334.73', '272.27', 366, 747],
    ['2024-25', '348.45', '333.82', '271.53', 365, 381], ['2025-26', '14.63', '14.63', '11.90', 16, 16]]);
  assert.equal(r.loans[0].to, '2025-07-02');
});

test('a loan’s period ends at its contract, a repayment or 5 years, and years from 2027-28 are flagged', () => {
  const ben = calculations.borrowingSchedule({ year: '2027-28', loans: [borrowLoan({ borrowing_expenses: '3600.00', loan_start: '2025-09-01',
    loan_term_end: '2029-08-31' })] });
  assert.deepEqual(ben.loans[0].rows.map((row) => [row.days, row.left, row.section_26_155, row.projected]),
    [[303, 1461, false, false], [365, 1158, false, false], [366, 793, true, false], [365, 427, true, true], [62, 62, true, true]]);
  assert.match(ben.warnings.join(' '), /s 26-155\(1\)/);
  assert.deepEqual(ben.schedule.map((row) => [row.income_year, row.section_26_155, row.projected]),
    [['2025-26', false, false], ['2026-27', false, false], ['2027-28', true, false], ['2028-29', true, true], ['2029-30', true, true]]);
  // Refinanced on 31 December 2025: loan 1 deducts what remains that year, loan 2 spreads over its own 5 years.
  const refinanced = calculations.borrowingSchedule({ year: '2025-26', loans: [borrowLoan({ borrowing_expenses: '1500.00', loan_start: '2024-09-01',
    loan_term_end: '2028-08-31', repaid_on: '2025-12-31' }), borrowLoan({ borrowing_expenses: '800.00', loan_start: '2025-12-31', loan_term_end: null, refinances: 1 })] });
  assert.deepEqual(borrowRows(refinanced, 1).at(-1), ['2025-26', '1188.91', '1188.91', '1188.91', 184, 184]);
  assert.deepEqual(borrowRows(refinanced, 2)[0], ['2025-26', '800.00', '79.74', '79.74', 182, 1826]);
  assert.equal(refinanced.loans[0].refinancedBy, 2);
  // A 29 February start: 5 years end on 28 February 2029.
  assert.equal(calculations.borrowingSchedule({ year: '2023-24', loans: [borrowLoan({ loan_start: '2024-02-29', loan_term_end: null })] }).loans[0].to, '2029-02-28');
});

test('the $100 rule counts every loan first drawn in the year and the other borrowing expenses', () => {
  const loans = [borrowLoan({ borrowing_expenses: '60.00', loan_start: '2025-08-01', loan_term_end: '2028-07-31' }),
    borrowLoan({ borrowing_expenses: '40.00', loan_start: '2026-02-01', loan_term_end: null })];
  const whole = calculations.borrowingSchedule({ year: '2025-26', loans });
  assert.deepEqual([whole.deduction, whole.loans[1].spread], [100, 'not spread: $100 or less (s 25-25(6))']);
  const spread = calculations.borrowingSchedule({ year: '2025-26', loans, other_borrowing_expenses: { '2025-26': '0.01' } });
  assert.equal(spread.loans[0].spread, 'spread over the period of the loan (s 25-25(4))');
  // Nil income use in the first year is not the $100 test's use: the expenses are still spread.
  assert.equal(calculations.borrowingSchedule({ year: '2025-26', loans: [{ ...loans[0], income_use: '0' }] }).loans[0].rows.length > 1, true);
});

test('borrowing expenses refuse what section 25-25 as read does not cover', () => {
  const at = (year, over) => borrowCode({ year, loans: [borrowLoan(over)] });
  assert.equal(at('2024-25', { loan_start: '2017-06-30' }), 'borrowing.loan_before_2017_18');
  assert.equal(at('2028-29', {}), 'period.unsupported');
  assert.equal(at('2019-20', { loan_start: '2020-07-03' }), 'borrowing.loan_starts_after_year');
  assert.equal(at('2024-25', { section_26_50_applies: true }), 'borrowing.s26_50_denied');
  assert.equal(at('2024-25', { income_use: '1.5' }), 'borrowing.income_use_invalid');
  assert.equal(at('2024-25', { borrowing_expenses: '12.345' }), 'input.amount_invalid');
  assert.equal(at('2024-25', { lender: 'bank' }), 'input.field_unknown');
});

// The effective interest rate and each year's amortisation, from an independent Decimal solve of
// the same monthly cash flows at 40 digits, 19 November 2026.
test('the accounting column amortises the costs at the effective interest rate and adds up to them', () => {
  const account = (loan, facts, year = '2026-27') => {
    const input = { year, loans: [loan], accounting: [{ annual_rate: '6', balloon_percent: '0', qualifying_asset: false, ...facts }] };
    return calculations.borrowingAccounting(input, calculations.borrowingSchedule(input))[0];
  };
  for (const [loan, facts, rate, firstYears] of [
    [borrowLoan(), { amount: '300000', payments: '300' }, '6.2274223332', [72.66, 74.44, 75.69]],
    [borrowLoan({ borrowing_expenses: '1500.00', loan_start: '2025-07-01', loan_term_end: '2030-06-30' }), { amount: '100000', payments: '60' },
      '6.8354893170', [495.76, 411.61, 314.39]],
    [borrowLoan({ borrowing_expenses: '1670.00', loan_start: '2020-07-17', loan_term_end: '2040-07-16' }), { amount: '209000', payments: '240' },
      '6.2732820936', [102.43, 108.05, 108.57]]]) {
    const a = account(loan, facts);
    assert.equal(a.effectiveAnnualRate.toFixed(10), rate);
    assert.deepEqual(a.years.slice(0, 3).map((y) => y.cost), firstYears);
    assert.equal(Math.round(a.years.reduce((s, y) => s + y.cost, 0) * 100), Math.round(Number(loan.borrowing_expenses) * 100));
    assert.equal(a.years.at(-1).unamortised, 0);
  }
  // Repaid early: what is left is written off in that year (AASB 9 para 3.3.3).
  const early = account(borrowLoan({ repaid_on: '2023-03-15' }), { amount: '300000', payments: '300' });
  assert.deepEqual([early.years.at(-1).first, early.years.at(-1).unamortised], [2022, 0]);
  assert.match(early.notes.join(' '), /written off in profit or loss \(para 3\.3\.3\)/);
  assert.match(account(borrowLoan(), { amount: '300000', payments: '300', qualifying_asset: true }).notes[0], /AASB 123 paras 8 and 17 to 25/);
});

test('a refinancing with the same lender takes the 10% test, and under 10% is refused', () => {
  const loans = (term) => [borrowLoan({ repaid_on: '2023-03-15' }), borrowLoan({ borrowing_expenses: '900.00', loan_start: '2023-03-15', loan_term_end: term, refinances: 1 })];
  // The $900 is all paid to the lender unless `fees` says otherwise (null: not given).
  const facts = (amount, rate, payments, lender, fees = '900') => [{ amount: '300000', annual_rate: '6', payments: '300', balloon_percent: '0', qualifying_asset: false },
    { amount, annual_rate: rate, payments, balloon_percent: '0', qualifying_asset: false, ...(lender === undefined ? {} : { same_lender: lender }),
      ...(fees === null ? {} : { lender_fees: fees }) }];
  const account = (term, accounting) => {
    const input = { year: '2024-25', loans: loans(term), accounting };
    return calculations.borrowingAccounting(input, calculations.borrowingSchedule(input));
  };
  const substantial = account('2048-03-14', facts('290000', '3', '300', true))[1];
  assert.ok(substantial.test.change >= 0.1);
  assert.deepEqual([substantial.years[0].first, substantial.years[0].cost, substantial.years.slice(1).every((y) => y.cost === 0)], [2022, 900, true]);
  assert.match(substantial.notes[0], /para B3\.3\.6A/);
  assert.match(account('2048-03-14', facts('290000', '5', '300', false))[1].notes[0], /another lender/);
  assert.throws(() => account('2042-07-02', facts('288000', '6', '232', true)), { code: 'accounting.modification_out_of_scope' });
  // Either side of 10%: 4.8% a year differs by 9.41% and is refused, 4.6% by 11.22% and is not.
  assert.throws(() => account('2048-03-14', facts('290000', '4.8', '300', true)), { message: /differ by 9\.41%, under 10%/ });
  assert.equal(account('2048-03-14', facts('290000', '4.6', '300', true))[1].test.change.toFixed(4), '0.1122');
  assert.throws(() => account('2048-03-14', facts('290000', '5', '300')), { code: 'input.flag_invalid' });
  // Para B3.3.6 counts only fees between the borrower and the lender: at 4.75% the $900 paid to the
  // lender leaves the terms 9.86% apart, but paid to a broker it is left out and they are 10.18% apart.
  assert.throws(() => account('2048-03-14', facts('290000', '4.75', '300', true)), { message: /differ by 9\.86%, under 10%/ });
  const change = (fees) => {
    try {
      return account('2048-03-14', facts('290000', '4.75', '300', true, fees))[1].test.change.toFixed(4);
    } catch (error) {
      return error.code;
    }
  };
  assert.deepEqual([change('0'), change('450')], ['0.1018', '0.1002']);
  for (const fees of [null, '900.01']) {
    assert.throws(() => account('2048-03-14', facts('290000', '4.6', '300', true, fees)), { code: 'accounting.lender_fees_invalid' });
  }
});

test('the borrowing expenses form reads use by year and needs the loans in order', () => {
  const fields = formDefaults(borrowHtml);
  const input = (change) => calculations.borrowingFormInput((name) => ({ ...fields, ...change })[name] ?? '');
  assert.deepEqual(input({ 'use-by-year-1': '2022-23 50, 2023-24 50, 2024-25 0, 2025-26 50' }).loans[0].income_use,
    { '2020-21': '1', '2021-22': '1', '2022-23': '0.5', '2023-24': '0.5', '2024-25': '0', '2025-26': '0.5' });
  assert.throws(() => input({ 'use-by-year-1': '2019-20 50' }), { message: 'Loan 1: 2019-20 is not an income year of the loan’s period.' });
  assert.throws(() => input({ 'expenses-2': '', 'expenses-3': '100' }), { message: 'Fill in loan 2 before loan 3.' });
  assert.equal(input({ accounting: 'yes' }).accounting.length, 2);
  assert.deepEqual(input({ accounting: 'yes', 'refinances-2': '1', 'lender-2': 'same', 'lender-fees-2': '500' }).accounting[1],
    { amount: '209000', annual_rate: '6', payments: '240', balloon_percent: '0', qualifying_asset: false, same_lender: true, lender_fees: '500' });
});

// The command this page ports, run on the same cases: see the fixture's engine line.
test('borrowing expenses agree with the australian-accounting command on every differential case', () => {
  const { cases } = JSON.parse(readFileSync(new URL('./borrowing-expenses-engine-differential.json', import.meta.url), 'utf8'));
  assert.ok(cases.length > 200);
  const text = (cents) => (Number(cents) / 100).toFixed(2);
  for (const { source, call, amounts, loans, refused } of cases) {
    if (refused) {
      assert.equal(borrowCode(call), refused, source);
      continue;
    }
    const r = calculations.borrowingSchedule(call);
    assert.deepEqual({ borrowing_expenses: r.borrowingExpenses.toFixed(2), maximum_deduction: r.maximumDeduction.toFixed(2),
      deduction: r.deduction.toFixed(2), remaining_expenditure_after_year: r.remainingAfterYear.toFixed(2) }, amounts, source);
    assert.deepEqual(r.loans.map((l) => l.rows.map((row) => `${row.income_year} ${text(row.remaining)} ${row.days ?? '-'}/${row.left ?? '-'} `
      + `${text(row.maximum)} ${text(row.deduction)}${row.section_26_155 ? ' s26-155' : ''}${row.projected ? ' projected' : ''}`)), loans, source);
  }
});

test('the fuel tax credit page opens on the result its calculation gives, and names the average price source', () => {
  const example = ftcHtml.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)"(?: note="([^"]*)")? %\}/);
  const fields = formDefaults(ftcHtml);
  const result = calculations.fuelTaxCreditsResult((name) => fields[name] ?? '', ftcAud);
  assert.deepEqual([result.inputs, result.rows.map((row) => row.join('|')).join(';'), String(result.principal), result.note], example.slice(1));
  assert.ok(ftcHtml.includes('<a href="https://aip.com.au/pricing/pump-prices-retail/">'));
  for (const cited of ['(last updated 29 July 2026)', '2022-23</a> (27 June 2024)', '2024-25</a> (29 January 2025)', '2025-26</a> (28 April 2026)',
    '(last updated 2 June 2021), both read 19 November 2026', 'PCG 2016/2</a>, read 19 November 2026']) {
    assert.ok(ftcHtml.includes(cited), cited);
  }
});

// The liquid fuel rates in cents a litre, heavy vehicle on a public road and all other business uses,
// typed from the ATO's year pages (QC69964, QC72768, QC102637, QC105117 and QC107638), read
// 19 November 2026, apart from the module's table.
const ATO_LIQUID = [['2022-07-01', '0', '22.1'], ['2022-08-01', '0', '23.0'], ['2022-09-29', '18.8', '46.0'], ['2023-02-01', '20.5', '47.7'],
  ['2023-07-01', '18.9', '47.7'], ['2023-08-01', '20.0', '48.8'], ['2024-02-05', '20.8', '49.6'], ['2024-07-01', '19.1', '49.6'],
  ['2024-08-05', '20.1', '50.6'], ['2025-02-03', '20.3', '50.8'], ['2025-07-01', '18.4', '50.8'], ['2025-08-04', '19.2', '51.6'],
  ['2026-02-02', '20.2', '52.6'], ['2026-04-01', '20.6', '20.6'], ['2026-07-01', '20.2', '36.6'], ['2026-08-03', '21.3', '53.7']];
const yearOf = (iso) => (Number(iso.slice(5, 7)) >= 7 ? `${iso.slice(0, 4)}-${String(Number(iso.slice(2, 4)) + 1).padStart(2, '0')}`
  : `${Number(iso.slice(0, 4)) - 1}-${iso.slice(2, 4)}`);
const dayBefore = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

test('each fuel tax credit period takes the ATO’s rate from its first day to its last', () => {
  assert.deepEqual(calculations.FTC_PERIODS.map((p) => [p.from, p.heavy[0], p.other[0]]), ATO_LIQUID);
  const ends = [...ATO_LIQUID.slice(1).map(([from]) => dayBefore(from)), '2027-01-31'];
  ATO_LIQUID.forEach(([from, heavy, other], i) => {
    for (const day of [from, ends[i]]) {
      const r = ftc(yearOf(day), [ftcLine('diesel', 'heavy_vehicle_public_road', day, '100'), ftcLine('petrol', 'other_business', day, '100')]);
      assert.deepEqual(r.lines.map((l) => l.credit), [Number(heavy), Number(other)], day);
    }
  });
  // 192 rates in all: 6 rows in 2 uses for each of the 16 periods, each from an ATO page.
  assert.equal(calculations.FTC_PERIODS.flatMap((p) => [...p.heavy, ...p.other]).length, 192);
  assert.ok(calculations.FTC_PERIODS.every((p) => /^QC\d+$/.test(p.page) && /^Table \d$/.test(p.table)));
});

test('gaseous fuels, blends and B100 take their own rows, LNG and CNG by the kilogram', () => {
  for (const [fuel, use, day, credit] of [['lng_cng', 'other_business', '2026-09-01', 36.8], ['lng_cng', 'heavy_vehicle_public_road', '2026-07-15', 3.2],
    ['lng_cng', 'heavy_vehicle_public_road', '2026-09-01', 0], ['lpg', 'other_business', '2026-09-01', 17.5], ['e10', 'other_business', '2023-03-01', 47.7],
    ['b100', 'other_business', '2023-07-01', 12.7], ['e85', 'heavy_vehicle_public_road', '2026-05-01', 8.87]]) {
    assert.equal(ftc(yearOf(day), [ftcLine(fuel, use, day, '100')]).lines[0].credit, credit, `${fuel} ${day}`);
  }
  assert.equal(ftc('2026-27', [ftcLine('lng_cng', 'other_business', '2026-09-01', '1')]).lines[0].unit, 'kilograms');
});

test('fuel tax credit lines round half up to the cent and label 7D drops the cents', () => {
  const r = ftc('2026-27', [ftcLine('e85', 'other_business', '2026-10-01', '300'), ftcLine('diesel', 'other_business', '2026-10-01', '1001')]);
  assert.deepEqual([r.lines[0].credit, r.lines[1].credit, r.total, r.label7d], [69.05, 537.54, 606.59, 606]);
  // 0.0001 litre at 53.7 cents is 0.00537 cents: nothing.
  assert.equal(ftc('2026-27', [ftcLine('diesel', 'other_business', '2026-10-01', '0.0001')]).total, 0);
});

test('the basic method splits a heavy vehicle’s diesel and takes each rigid truck class’s rate', () => {
  const vehicle = { method: 'basic_heavy_vehicle', fuel: 'diesel', acquired: '2026-09-30', litres: '11430' };
  const jim = { ...vehicle, total_km: '32000', rigid_truck_gross_weight_tonnes: '32' };
  const l = ftc('2026-27', [jim], { small_claimant: true }).lines[0];
  assert.deepEqual([l.publicRoadKm, l.litresPerKm, l.publicRoadLitres, l.otherLitres, l.publicRoadCredit, l.otherCredit, l.credit],
    ['31488', '0.35', '11020.8', '409.2', 2347.43, 219.74, 2567.17]);
  // Actual kilometres and the engine's diagnostic rate, PCG 2021/2 paragraph 9.
  const actual = ftc('2026-27', [{ ...vehicle, public_road_km: '20000', litres_per_km: '0.493' }], { small_claimant: true }).lines[0];
  assert.deepEqual([actual.publicRoadLitres, actual.otherLitres], ['9860', '1570']);
  for (const [weight, rate] of [['4.501', '0.18'], ['12', '0.18'], ['12.001', '0.23'], ['16.5', '0.23'], ['24', '0.28'], ['30', '0.32'], ['30.001', '0.35']]) {
    const truck = { ...vehicle, public_road_km: '100', rigid_truck_gross_weight_tonnes: weight };
    assert.equal(ftc('2026-27', [truck], { small_claimant: true }).lines[0].litresPerKm, rate, weight);
  }
  assert.equal(ftcCode({ year: '2026-27', lines: [{ ...jim, rigid_truck_gross_weight_tonnes: '4.5' }], small_claimant: true }), 'fuel_tax_credits.simplified_method_unavailable');
  assert.equal(ftcCode({ year: '2026-27', lines: [{ ...jim, total_km: '40000' }], small_claimant: true }), 'fuel_tax_credits.fact_conflict');
});

test('PCG 2016/2 Method 1 works out litres from the cost, and Method 2 spans indexation only', () => {
  const fromCost = (cost) => ({ method: 'litres_from_cost', fuel: 'diesel', use: 'other_business', acquired: '2026-09-30', cost, average_price_cents_per_litre: '245.9' });
  const r = ftc('2026-27', [fromCost('2459.00'), fromCost('100.00')], { small_claimant: true });
  assert.deepEqual(r.lines.map((l) => [l.quantity, l.credit]), [['1000.0000', 537], ['40.6669', 21.84]]);
  const across = (start, end, day) => ftcCode({ year: yearOf(day), lines: [ftcLine('diesel', 'other_business', day, '1000')], small_claimant: true,
    rate_at_period_end: { start, end } });
  assert.equal(ftc('2025-26', [ftcLine('diesel', 'other_business', '2026-01-10', '1000')], { small_claimant: true,
    rate_at_period_end: { start: '2026-01-01', end: '2026-03-31' } }).total, 526);
  for (const [start, end, day] of [['2022-07-01', '2022-09-30', '2022-07-10'], ['2026-01-01', '2026-06-30', '2026-01-10'], ['2026-07-01', '2026-09-30', '2026-07-10']]) {
    assert.equal(across(start, end, day), 'fuel_tax_credits.simplified_method_unavailable', start);
  }
  // A period that starts on the change day spans no change; one ending after 31 January 2027 has no rate.
  assert.equal(across('2026-04-01', '2026-06-30', '2026-05-01'), 'computed');
  assert.equal(across('2027-01-01', '2027-03-31', '2027-01-10'), 'fuel_tax_credits.rate_unpublished');
  assert.equal(across('2023-01-01', '2023-03-31', '2023-01-10'), 'computed');
});

test('a line acquired more than 4 years before the return is flagged under subsection 47-5(2) and kept', () => {
  const lines = [ftcLine('diesel', 'other_business', '2022-11-19', '100'), ftcLine('diesel', 'other_business', '2023-01-05', '100')];
  assert.deepEqual(ftc('2022-23', lines, { return_date: '2026-11-19' }).timeLimitLines, []);
  const late = ftc('2022-23', lines, { return_date: '2026-11-20' });
  assert.deepEqual([late.timeLimitLines, late.total], [[1], 92]);
  assert.match(late.warnings.join(' '), /subsection 47-5\(2\).*Linfox/);
  // Section 47-10 relieves only subsection 47-5(1), so it is no exception to this warning.
  assert.doesNotMatch(late.warnings.join(' '), /47-10/);
  assert.equal(ftcCode({ year: '2022-23', lines, return_date: '2022-11-18' }), 'fuel_tax_credits.fact_conflict');
});

test('the fuel tax credit form passes the small claimant answer only with a simplified method', () => {
  const fields = formDefaults(ftcHtml);
  const input = (change) => calculations.fuelFormInput((name) => ({ ...fields, ...change })[name] ?? '');
  assert.equal(input({}).small_claimant, undefined);
  assert.equal(input({ 'small-claimant': 'yes' }).small_claimant, undefined);
  assert.equal(input({ 'quantity-2': '', 'cost-2': '100', 'price-2': '200', 'small-claimant': 'yes' }).small_claimant, true);
  assert.deepEqual(input({ 'basic-litres': '100', 'basic-acquired': '2026-09-01', 'basic-public-km': '10', 'basic-per-km': '0.3' }).lines[2],
    { method: 'basic_heavy_vehicle', fuel: 'diesel', acquired: '2026-09-01', litres: '100', public_road_km: '10', litres_per_km: '0.3' });
  assert.throws(() => input({ 'cost-1': '100' }), { message: 'Line 1: enter the litres, or the cost and the average price, not both.' });
  assert.throws(() => input({ 'quantity-1': '' }), { message: 'Line 1: enter the quantity, or the cost and the average price.' });
  assert.equal(ftcCode(input({ 'fuel-1': '', 'fuel-2': '' })), 'fuel_tax_credits.lines_invalid');
});

// The command this page ports, run on the same cases: see the fixture's engine line.
test('fuel tax credits agree with the australian-accounting command on every differential case', () => {
  const { cases } = JSON.parse(readFileSync(new URL('./fuel-tax-credits-engine-differential.json', import.meta.url), 'utf8'));
  assert.ok(cases.length > 200);
  for (const { source, call, amounts, refused } of cases) {
    if (refused) {
      assert.equal(ftcCode(call), refused, source);
      continue;
    }
    const r = calculations.fuelTaxCredits(call);
    assert.deepEqual({ fuel_tax_credits: r.total.toFixed(2), label_7d: `${r.label7d}.00`, lines: r.lines.map((l) => l.credit.toFixed(2)),
      time_limit_lines: r.timeLimitLines?.map(String) ?? null }, amounts, source);
  }
});
