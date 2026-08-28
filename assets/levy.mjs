// Coal LSL payroll levy: eligible wages under s 3B of the Coal Mining Industry
// (Long Service Leave) Payroll Levy Collection Act 1992, Compilation No. 11
// (C2026C00338, 7 July 2026). Rate prescribed by s 6 of the Coal Mining Industry
// (Long Service Leave) Payroll Levy Regulations 2018.
//
// Money is integer cents throughout. Dollars only cross the public boundary via
// toCents(). No DOM access: this module is imported by both the page and the tests.

export const LEVY_RATE_NUMERATOR = 27;
export const LEVY_RATE_DENOMINATOR = 1000; // 2.7 per cent
export const LEVY_RATE_AS_AT = '2026-08-24';
export const LEVY_RATE_SOURCE =
  'https://www.legislation.gov.au/F2018L00217/latest/latest/text/original/pdf';

// The casual method changed for reporting months on or after January 2024.
// Deliberately 'YYYY-MM', not a full date: reportingMonth is compared as a
// string, and '2024-01' < '2024-01-01' is true, which would misroute January.
export const CASUAL_METHOD_CHANGE_MONTH = '2024-01';

// s 3B(4)(c) and (d): incentive payments and bonuses count only where paid at
// least once a month. Quarterly, half-yearly and annual amounts drop out
// entirely; they are not spread across the year.
const AT_LEAST_MONTHLY = new Set(['weekly', 'fortnightly', 'monthly']);

export function toCents(dollars) {
  if (typeof dollars !== 'number' || !Number.isFinite(dollars)) {
    throw new TypeError('amount must be a finite number of dollars');
  }
  return Math.round(dollars * 100);
}

export function bonusCents(bonuses) {
  if (!bonuses) return 0;
  return bonuses
    .filter((b) => AT_LEAST_MONTHLY.has(b.frequency))
    .reduce((total, b) => total + toCents(b.amount), 0);
}

// s 3B(4)(a), (aa), (b): gross up for salary sacrifice applies to exactly three
// components, being base rate of pay, ordinary rate of pay and annual salary.
// It does NOT apply to the casual loading, bonuses, overtime or allowances.
export function grossUp(paidCents, sacrificedCents = 0) {
  return paidCents + sacrificedCents;
}

// s 3B(1): eligible wages are the GREATER of Formula A and Formula B.
export function baseRateWages({
  baseRateCents,
  bonuses,
  overtimeAndPenaltyCents = 0,
  allowancesCents = 0,
}) {
  const bonus = bonusCents(bonuses);
  const formulaA = baseRateCents + bonus;
  const aggregate = baseRateCents + bonus + overtimeAndPenaltyCents + allowancesCents;
  // 75 per cent as an exact quarter division. Both this and `* 0.75` are exact
  // here, because 0.75 is 3 x 2^-2 and so is representable; the integer form is
  // kept because it is exact by construction rather than by a property of the
  // literal that a later reader has to know. The value that matters is that
  // formulaB keeps its fractional cents: rounding here instead of at levyCents
  // would compound.
  const formulaB = (aggregate * 3) / 4;
  return {
    branch: 's 3B(1)',
    formulaA,
    formulaB,
    winner: formulaB > formulaA ? 'B' : 'A',
    eligibleWagesCents: Math.max(formulaA, formulaB),
  };
}

// s 3B(2): single limb. Overtime, penalty rates and shift loading are excluded.
export function annualSalaryWages({ annualSalaryPaidCents, bonuses }) {
  return {
    branch: 's 3B(2)',
    eligibleWagesCents: annualSalaryPaidCents + bonusCents(bonuses),
  };
}

// s 3B(3): no greater-of test and no 75 per cent factor. The branch is selected.
export function casualWages({
  reportingMonth,
  instrumentSpecifiesLoading = false,
  loadingQuantifiable = false,
  baseRatePayCents = 0,
  casualLoadingCents = 0,
  ordinaryRatePayCents = 0,
  bonuses,
}) {
  if (typeof reportingMonth !== 'string' || !/^\d{4}-\d{2}$/.test(reportingMonth)) {
    throw new TypeError('reportingMonth must be a YYYY-MM string');
  }
  const bonus = bonusCents(bonuses);
  if (reportingMonth < CASUAL_METHOD_CHANGE_MONTH) {
    // Mirrors the s 3B(1)(a) shape, with no casual loading component. The
    // base-rate/ordinary-rate split is a post-2024 UI distinction; before
    // then there was just one figure, so fall back to the ordinary rate
    // field when only that one was filled in. Without this, a user who
    // enters the all-in rate for a pre-2024 month got a silent $0.00.
    const payCents = baseRatePayCents || ordinaryRatePayCents;
    return { branch: 'pre-2024', eligibleWagesCents: payCents + bonus };
  }
  if (instrumentSpecifiesLoading && loadingQuantifiable) {
    return {
      branch: 's 3B(3)(a)',
      eligibleWagesCents: baseRatePayCents + bonus + casualLoadingCents,
    };
  }
  // The loading is already inside the ordinary rate. Do not add it again.
  return { branch: 's 3B(3)(b)', eligibleWagesCents: ordinaryRatePayCents + bonus };
}

// Rounding is a CHOICE, not a rule. Neither the Act, the Regulations nor the
// guidance note states one, and real inputs land on half a cent. Half up at the
// final step only. The page states this openly.
export function levyCents(eligibleWagesCents) {
  return Math.round((eligibleWagesCents * LEVY_RATE_NUMERATOR) / LEVY_RATE_DENOMINATOR);
}
