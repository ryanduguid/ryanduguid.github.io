import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCents, bonusCents, grossUp,
  baseRateWages, annualSalaryWages, casualWages, levyCents,
  CASUAL_METHOD_CHANGE_MONTH,
} from '../assets/levy.mjs';

const d = toCents; // dollars to cents, for readability below

test('D1 base rate: Formula A wins when there is nothing else', () => {
  const r = baseRateWages({ baseRateCents: d(6000) });
  assert.equal(r.formulaA, 600000);
  assert.equal(r.formulaB, 450000);
  assert.equal(r.winner, 'A');
  assert.equal(r.eligibleWagesCents, 600000);
  assert.equal(levyCents(r.eligibleWagesCents), 16200);
});

test('D2 base rate: Formula B wins once overtime and allowances are large', () => {
  const r = baseRateWages({
    baseRateCents: d(6000),
    overtimeAndPenaltyCents: d(3000),
    allowancesCents: d(500),
  });
  assert.equal(r.formulaB, 712500);
  assert.equal(r.winner, 'B');
  assert.equal(r.eligibleWagesCents, 712500);
  // 712500 * 27 / 1000 = 19237.5 cents exactly, rounds half up
  assert.equal(levyCents(r.eligibleWagesCents), 19238);
});

test('D3 base rate: exact tie resolves to Formula A', () => {
  const r = baseRateWages({ baseRateCents: d(6000), overtimeAndPenaltyCents: d(2000) });
  assert.equal(r.formulaA, 600000);
  assert.equal(r.formulaB, 600000);
  assert.equal(r.winner, 'A', 'a tie is not a Formula B win');
  assert.equal(r.eligibleWagesCents, 600000);
});

test('D4 base rate: expense reimbursements never enter the Formula B bracket', () => {
  // The caller must exclude reimbursements. Passing 2500 of overtime and no
  // allowance is the correct encoding of "2500 overtime plus 500 reimbursement".
  const r = baseRateWages({ baseRateCents: d(6000), overtimeAndPenaltyCents: d(2500) });
  assert.equal(r.formulaB, 637500);
  assert.equal(r.eligibleWagesCents, 637500);
  assert.equal(levyCents(r.eligibleWagesCents), 17213); // 17212.5 rounds half up
});

test('D5 base rate: a monthly bonus counts in both formulas', () => {
  const r = baseRateWages({
    baseRateCents: d(6000),
    bonuses: [{ amount: 400, frequency: 'monthly' }],
  });
  assert.equal(r.formulaA, 640000);
  assert.equal(r.eligibleWagesCents, 640000);
  assert.equal(levyCents(r.eligibleWagesCents), 17280);
});

test('D6 base rate: an annual bonus is dropped, not spread', () => {
  const r = baseRateWages({
    baseRateCents: d(6000),
    bonuses: [{ amount: 12000, frequency: 'annually' }],
  });
  assert.equal(r.formulaA, 600000, 'annual bonus must not be added');
  assert.equal(r.eligibleWagesCents, 600000);
});

test('D7 base rate: salary sacrifice is grossed up', () => {
  const base = grossUp(d(5000), d(1000));
  assert.equal(base, 600000);
  const r = baseRateWages({ baseRateCents: base });
  assert.equal(r.eligibleWagesCents, 600000);
});

test('D8 annual salary: single limb, overtime and shift loading excluded', () => {
  const r = annualSalaryWages({
    annualSalaryPaidCents: d(10000),
    bonuses: [{ amount: 200, frequency: 'monthly' }],
  });
  assert.equal(r.branch, 's 3B(2)');
  assert.equal(r.eligibleWagesCents, 1020000);
  assert.equal(levyCents(r.eligibleWagesCents), 27540);
});

test('D9 casual: quantifiable loading is added as a third component', () => {
  const r = casualWages({
    reportingMonth: '2026-06',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: true,
    baseRatePayCents: d(1800),      // 40.00/hr x 45 hours
    casualLoadingCents: d(450),     // 25 per cent
  });
  assert.equal(r.branch, 's 3B(3)(a)');
  assert.equal(r.eligibleWagesCents, 225000);
  assert.equal(levyCents(r.eligibleWagesCents), 6075);
});

test('D10 casual: unquantifiable loading uses the ordinary rate and is not added twice', () => {
  const r = casualWages({
    reportingMonth: '2026-06',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: false,
    ordinaryRatePayCents: d(2250),  // 50.00/hr all-in x 45 hours
  });
  assert.equal(r.branch, 's 3B(3)(b)');
  assert.equal(r.eligibleWagesCents, 225000);
});

test('D11 casual: months before January 2024 use the legacy method', () => {
  const r = casualWages({
    reportingMonth: '2023-12',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: true,
    baseRatePayCents: d(1800),
    casualLoadingCents: d(450),
  });
  assert.equal(r.branch, 'pre-2024');
  assert.equal(r.eligibleWagesCents, 180000, 'loading is excluded before 2024');
  assert.equal(levyCents(r.eligibleWagesCents), 4860);
});

test('D11b casual: January 2024 itself is NOT legacy', () => {
  // Guards a string-comparison trap: "2024-01" < "2024-01-01" is true, so a
  // date-shaped constant would wrongly send January 2024 down the legacy path.
  assert.equal(CASUAL_METHOD_CHANGE_MONTH, '2024-01');
  const r = casualWages({
    reportingMonth: '2024-01',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: true,
    baseRatePayCents: d(1800),
    casualLoadingCents: d(450),
  });
  assert.equal(r.branch, 's 3B(3)(a)');
  assert.equal(r.eligibleWagesCents, 225000);
});

test('D12 zero wages produce zero levy', () => {
  const r = baseRateWages({ baseRateCents: 0 });
  assert.equal(r.eligibleWagesCents, 0);
  assert.equal(levyCents(0), 0);
});

test('bonus frequency test admits weekly, fortnightly and monthly only', () => {
  const all = [
    { amount: 100, frequency: 'weekly' },
    { amount: 100, frequency: 'fortnightly' },
    { amount: 100, frequency: 'monthly' },
    { amount: 100, frequency: 'quarterly' },
    { amount: 100, frequency: 'halfYearly' },
    { amount: 100, frequency: 'annually' },
  ];
  assert.equal(bonusCents(all), 30000);
  assert.equal(bonusCents([]), 0);
  assert.equal(bonusCents(undefined), 0);
});

test('Formula B keeps fractional cents and is never rounded early', () => {
  // The real risk is not the literal, it is premature rounding. Rounding Formula B
  // to whole cents here would compound with the rounding in levyCents and would
  // also change which formula wins in a near-tie. This asserts the fraction
  // survives.
  const r = baseRateWages({ baseRateCents: 100003, overtimeAndPenaltyCents: 0 });
  assert.equal(r.formulaB, 75002.25);
  assert.notEqual(r.formulaB, Math.round(r.formulaB), 'must not be pre-rounded');
});

test('toCents rejects a non-finite amount', () => {
  assert.throws(() => toCents(NaN), TypeError);
  assert.throws(() => toCents(Infinity), TypeError);
});
