import {
  annualSalaryWages,
  baseRateWages,
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
    // Every casual figure is handed over exactly as the user typed it, with
    // the sacrifice kept separate. casualWages() decides which components its
    // branch reads, grosses the sacrifice onto that one and reports the rest
    // as ignored. Collapsing or pre-grossing anything here would make that
    // report describe this function's arithmetic instead of the user's input:
    // a blank field carrying only a grossed-up sacrifice was named as "not
    // counted" while its money sat in the total, and a pre-2024 all-in rate
    // folded into the base-rate argument was discarded without being named.
    return casualWages({
      reportingMonth: form.elements.reportingMonth.value,
      instrumentSpecifiesLoading: form.elements.instrumentSpecifiesLoading.checked,
      loadingQuantifiable: form.elements.loadingQuantifiable.checked,
      baseRatePayCents: toCents(num('casualBasePay')),
      casualLoadingCents: toCents(num('casualLoading')),
      ordinaryRatePayCents: toCents(num('ordinaryPay')),
      sacrificedCents: toCents(num('sacrificed')),
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
