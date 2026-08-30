import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCents, bonusCents, grossUp,
  baseRateWages, annualSalaryWages, casualWages, levyCents,
  CASUAL_METHOD_CHANGE_MONTH,
} from '../assets/levy.mjs';
import { compute } from '../assets/levy-form.mjs';

const d = toCents; // dollars to cents, for readability below

// A stand-in for the casual form, holding exactly the strings a user typed.
// compute() reads it through form.elements and form.querySelector, so the fake
// only has to answer those. Anything omitted is left blank, which is what an
// untouched field gives.
function casualForm(typed) {
  const field = (name) => ({ value: typed[name] ?? '' });
  return {
    elements: {
      reportingMonth: field('reportingMonth'),
      instrumentSpecifiesLoading: { checked: Boolean(typed.instrumentSpecifiesLoading) },
      loadingQuantifiable: { checked: Boolean(typed.loadingQuantifiable) },
      casualBasePay: field('casualBasePay'),
      casualLoading: field('casualLoading'),
      ordinaryPay: field('ordinaryPay'),
      sacrificed: field('sacrificed'),
    },
    querySelector(selector) {
      assert.equal(selector, 'input[name="branch"]:checked');
      return { value: 'casual' };
    },
    querySelectorAll(selector) {
      assert.equal(selector, '.bonus-row');
      return [];
    },
  };
}

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
    casualLoadingCents: d(450),     // must be ignored on this branch
  });
  assert.equal(r.branch, 's 3B(3)(b)');
  assert.equal(r.eligibleWagesCents, 225000);
});

test('D10b casual: pay the selected branch drops is reported, not silently zeroed', () => {
  // Both checkboxes default to unchecked, so a user who fills the base rate
  // and loading fields lands on s 3B(3)(b), which reads neither. The result
  // must name what it dropped instead of presenting a confident $0.00.
  const b = casualWages({
    reportingMonth: '2026-08',
    baseRatePayCents: d(1800),
    casualLoadingCents: d(450),
  });
  assert.equal(b.branch, 's 3B(3)(b)');
  assert.equal(b.eligibleWagesCents, 0);
  assert.deepEqual(b.ignored, ['baseRatePay', 'casualLoading']);

  // The mirror case: both boxes ticked, only the all-in ordinary rate filled.
  const a = casualWages({
    reportingMonth: '2026-08',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: true,
    ordinaryRatePayCents: d(2250),
  });
  assert.equal(a.branch, 's 3B(3)(a)');
  assert.equal(a.eligibleWagesCents, 0);
  assert.deepEqual(a.ignored, ['ordinaryRatePay']);

  // A branch that reads everything entered reports nothing ignored.
  assert.deepEqual(
    casualWages({ reportingMonth: '2026-08', ordinaryRatePayCents: d(2250) }).ignored,
    [],
  );
});

test('D10c casual: a salary sacrifice never makes a blank field look discarded', () => {
  // The sacrifice reaches the total on whichever component the branch reads,
  // so no component may be named as not counted. The failure this guards is a
  // controller that grosses the sacrifice into every pay argument: the blank
  // field then arrives non-zero, and the page tells the user money it did in
  // fact count was dropped.
  const a = compute(casualForm({
    reportingMonth: '2026-08',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: true,
    casualBasePay: '1800',
    casualLoading: '450',
    sacrificed: '100',
  }));
  assert.equal(a.branch, 's 3B(3)(a)');
  assert.equal(a.eligibleWagesCents, 235000, 'base pay, loading and sacrifice all count');
  assert.deepEqual(a.ignored, [], 'the all-in ordinary rate field was left blank');

  const b = compute(casualForm({
    reportingMonth: '2026-08',
    ordinaryPay: '2250',
    sacrificed: '100',
  }));
  assert.equal(b.branch, 's 3B(3)(b)');
  assert.equal(b.eligibleWagesCents, 235000, 'ordinary rate pay and sacrifice both count');
  assert.deepEqual(b.ignored, [], 'the base rate pay field was left blank');

  // The report still names pay the branch did drop, sacrifice or not.
  const dropped = compute(casualForm({
    reportingMonth: '2026-08',
    casualBasePay: '1800',
    casualLoading: '450',
    ordinaryPay: '2250',
    sacrificed: '100',
  }));
  assert.equal(dropped.eligibleWagesCents, 235000);
  assert.deepEqual(dropped.ignored, ['baseRatePay', 'casualLoading']);
});

test('D10d casual: the pre-2024 branch names the all-in rate it discards', () => {
  // Before 2024 there is one pay figure, so a user who fills both fields has
  // one of them thrown away. The audited defect survived here while the
  // controller collapsed the two fields into one argument: the engine could
  // not see the discarded figure, so the page said nothing about it.
  const result = compute(casualForm({
    reportingMonth: '2023-12',
    casualBasePay: '1800',
    ordinaryPay: '2250',
  }));
  assert.equal(result.branch, 'pre-2024');
  assert.equal(result.eligibleWagesCents, 180000, 'the base rate figure is the one read');
  assert.deepEqual(result.ignored, ['ordinaryRatePay']);

  // The casual loading has no place in the pre-2024 method, so an entered
  // loading is discarded there too and must be named.
  const withLoading = compute(casualForm({
    reportingMonth: '2023-12',
    casualBasePay: '1800',
    casualLoading: '450',
    ordinaryPay: '2250',
  }));
  assert.equal(withLoading.eligibleWagesCents, 180000);
  assert.deepEqual(withLoading.ignored, ['casualLoading', 'ordinaryRatePay']);

  // Only the all-in rate filled: it is read, so nothing is reported ignored.
  const allIn = compute(casualForm({ reportingMonth: '2023-12', ordinaryPay: '2250' }));
  assert.equal(allIn.eligibleWagesCents, 225000);
  assert.deepEqual(allIn.ignored, []);
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

test('pre-2024 casual controller selects ordinary pay before grossing up sacrifice', () => {
  const result = compute(casualForm({
    reportingMonth: '2023-12',
    ordinaryPay: '1000',
    sacrificed: '100',
  }));

  assert.equal(result.branch, 'pre-2024');
  assert.equal(result.eligibleWagesCents, 110000);
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

test('casualWages rejects an empty reportingMonth', () => {
  // Guards against "" < "2024-01" (true in JS), which would otherwise
  // silently misroute a blank field to the pre-2024 branch.
  assert.throws(() => casualWages({ reportingMonth: '' }), TypeError);
});

test('casualWages rejects an undefined reportingMonth', () => {
  assert.throws(() => casualWages({ reportingMonth: undefined }), TypeError);
});

test('casualWages rejects a full-date reportingMonth', () => {
  // Wrong shape, not just a wrong value: 'YYYY-MM-DD' must not pass.
  assert.throws(() => casualWages({ reportingMonth: '2024-01-01' }), TypeError);
});

test('casualWages still accepts valid YYYY-MM values and routes them as before', () => {
  const post = casualWages({
    reportingMonth: '2024-01',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: true,
    baseRatePayCents: d(1800),
    casualLoadingCents: d(450),
  });
  assert.equal(post.branch, 's 3B(3)(a)');
  assert.equal(post.eligibleWagesCents, 225000);

  const pre = casualWages({
    reportingMonth: '2023-12',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: true,
    baseRatePayCents: d(1800),
    casualLoadingCents: d(450),
  });
  assert.equal(pre.branch, 'pre-2024');
  assert.equal(pre.eligibleWagesCents, 180000);
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
