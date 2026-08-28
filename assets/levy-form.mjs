import {
  annualSalaryWages,
  baseRateWages,
  CASUAL_METHOD_CHANGE_MONTH,
  casualWages,
  grossUp,
  toCents,
} from './levy.mjs';

function readBonuses(root) {
  return [...root.querySelectorAll('.bonus-row')].map((row) => ({
    amount: Number(row.querySelector('.bonus-amount').value || 0),
    frequency: row.querySelector('.bonus-frequency').value,
  }));
}

export function compute(form) {
  const branch = form.querySelector('input[name="branch"]:checked').value;
  const bonuses = readBonuses(form);
  // Fields for the branches that are hidden do not exist in the DOM,
  // so form.elements[name] is undefined. Optional chaining, not a crash.
  const num = (name) => Number(form.elements[name]?.value || 0);

  if (branch === 'annual') {
    return annualSalaryWages({
      annualSalaryPaidCents: grossUp(toCents(num('annualSalary')), toCents(num('sacrificed'))),
      bonuses,
    });
  }
  if (branch === 'casual') {
    const reportingMonth = form.elements.reportingMonth.value;
    const sacrificedCents = toCents(num('sacrificed'));
    const baseRatePayCents = toCents(num('casualBasePay'));
    const ordinaryRatePayCents = toCents(num('ordinaryPay'));
    const legacyPayCents = baseRatePayCents || ordinaryRatePayCents;
    const legacy = reportingMonth < CASUAL_METHOD_CHANGE_MONTH;
    return casualWages({
      reportingMonth,
      instrumentSpecifiesLoading: form.elements.instrumentSpecifiesLoading.checked,
      loadingQuantifiable: form.elements.loadingQuantifiable.checked,
      baseRatePayCents: grossUp(
        legacy ? legacyPayCents : baseRatePayCents,
        sacrificedCents,
      ),
      casualLoadingCents: toCents(num('casualLoading')),
      ordinaryRatePayCents: legacy
        ? 0
        : grossUp(ordinaryRatePayCents, sacrificedCents),
      bonuses,
    });
  }
  return baseRateWages({
    baseRateCents: grossUp(toCents(num('baseRate')), toCents(num('sacrificed'))),
    bonuses,
    overtimeAndPenaltyCents: toCents(num('overtime')),
    allowancesCents: toCents(num('allowances')),
  });
}
