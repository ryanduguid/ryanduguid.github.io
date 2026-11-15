// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import {
  annualSalaryWages,
  assertReportingMonthSupported,
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

// The form's pay fields, in dollars. A field an entry leaves out counts as 0.
const PAY_FIELDS = ['annualSalary', 'sacrificed', 'casualBasePay', 'casualLoading', 'ordinaryPay',
  'baseRate', 'overtime', 'allowances'];

export function compute(form) {
  // Fields for the branches that are hidden do not exist in the DOM,
  // so form.elements[name] is undefined. Optional chaining, not a crash.
  const num = (name) => Number(form.elements[name]?.value || 0);
  const entry = {
    reportingMonth: form.elements.reportingMonth?.value,
    branch: form.querySelector('input[name="branch"]:checked').value,
    bonuses: readBonuses(form),
    ...Object.fromEntries(PAY_FIELDS.map((name) => [name, num(name)])),
  };
  if (entry.branch === 'casual') {
    entry.instrumentSpecifiesLoading = form.elements.instrumentSpecifiesLoading.checked;
    entry.loadingQuantifiable = form.elements.loadingQuantifiable.checked;
  }
  return computeEntry(entry);
}

// The levy for one entry with the form's field names, from the page or its
// WebMCP tool: the branch, the reporting month, bonuses as {amount, frequency}
// and each pay field in dollars.
export function computeEntry(entry) {
  // Enforced once here for every branch. casualWages() also enforces it in
  // the engine, so no path can price a pre-July-2023 month at the 2.7% rate.
  const { reportingMonth, branch, bonuses = [] } = entry;
  assertReportingMonthSupported(reportingMonth);
  const num = (name) => entry[name] ?? 0;

  if (branch === 'annual') {
    return {
      ...annualSalaryWages({
        annualSalaryPaidCents: grossUp(toCents(num('annualSalary')), toCents(num('sacrificed'))),
        bonuses,
      }),
      reportingMonth,
    };
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
    return {
      ...casualWages({
        reportingMonth,
        instrumentSpecifiesLoading: entry.instrumentSpecifiesLoading ?? false,
        loadingQuantifiable: entry.loadingQuantifiable ?? false,
        baseRatePayCents: toCents(num('casualBasePay')),
        casualLoadingCents: toCents(num('casualLoading')),
        ordinaryRatePayCents: toCents(num('ordinaryPay')),
        sacrificedCents: toCents(num('sacrificed')),
        bonuses,
      }),
      reportingMonth,
    };
  }
  return {
    ...baseRateWages({
      baseRateCents: grossUp(toCents(num('baseRate')), toCents(num('sacrificed'))),
      bonuses,
      overtimeAndPenaltyCents: toCents(num('overtime')),
      allowancesCents: toCents(num('allowances')),
    }),
    reportingMonth,
  };
}
