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
  // 75 per cent as an exact quarter division. Multiplying an integer by 3 and
  // dividing by 4 is exact in IEEE754; multiplying by 0.75 as a decimal is not.
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
  const bonus = bonusCents(bonuses);
  if (reportingMonth < CASUAL_METHOD_CHANGE_MONTH) {
    // Mirrors the s 3B(1)(a) shape, with no casual loading component.
    return { branch: 'pre-2024', eligibleWagesCents: baseRatePayCents + bonus };
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
