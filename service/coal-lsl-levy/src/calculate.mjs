// One validated request in, one deterministic result out.
//
// The arithmetic is assets/levy.mjs, the same module the browser page
// imports. This file selects the branch, refuses what the supplied facts do
// not settle, and renders the engine's integer and quarter-cent results as
// decimal strings with the manifest and advisory the publishing contract
// asks for. Nothing here reads a clock, the network or the file system.

import {
  annualSalaryWages,
  baseRateWages,
  casualWages,
  grossUp,
  levyCents,
  LEVY_RATE_NUMERATOR,
  LEVY_RATE_DENOMINATOR,
} from '../../../assets/levy.mjs';
import { centsToString, exactDecimal, quarterCentsToString, toQuarterCents } from './money.mjs';
import { ValidationError } from './schema.mjs';

export const REFUSAL_CLASSES = Object.freeze({
  unsupported_period: 'The reporting month is outside the months backed by a verified rate row and a supported method record.',
  out_of_scope_employee: 'The employee is asserted not to be an eligible employee, so the wages are not eligible wages.',
  insufficient_facts: 'A fact the calculation turns on was supplied as "unknown".',
  components_not_read_by_branch: 'Pay was supplied that the selected branch does not read; it would otherwise be discarded silently.',
});

const AT_LEAST_MONTHLY = new Set(['weekly', 'fortnightly', 'monthly']);

const CASUAL_FIELD_NAMES = {
  baseRatePay: 'pay.base_rate_of_pay',
  casualLoading: 'pay.casual_loading',
  ordinaryRatePay: 'pay.ordinary_rate_of_pay',
};

export class Refusal extends Error {
  constructor(refusalClass, reason, details = {}) {
    super(reason);
    this.refusalClass = refusalClass;
    this.details = details;
  }
  toJSON() {
    return { refusal_class: this.refusalClass, reason: this.message, ...this.details };
  }
}

function bonusWorkings(bonuses) {
  const counted = [];
  const excluded = [];
  bonuses.forEach((bonus, index) => {
    const entry = { component: `pay.bonuses[${index}]`, amount: centsToString(bonus.amountCents), frequency: bonus.frequency };
    if (AT_LEAST_MONTHLY.has(bonus.frequency)) {
      counted.push(entry);
    } else {
      excluded.push({
        ...entry,
        reason: 's 3B(4)(c) and (d): an incentive payment or bonus counts only where it is paid at least monthly. It is dropped, not spread across the year.',
      });
    }
  });
  return { counted, excluded };
}

// Engine bonuses take dollars through toCents(); we already hold exact
// cents, so hand the engine a shape whose toCents round trip is exact.
// bonusCents() calls toCents(amount) with amount in dollars; integer cents
// divided by 100 is exactly representable for every value in range because
// toCents rounds back to the same integer.
const engineBonuses = (bonuses) => bonuses.map((b) => ({ amount: b.amountCents / 100, frequency: b.frequency }));

function baseRate(pay) {
  if (pay.allowancesCents > 0 && pay.allowancesExcludeExpenseReimbursements !== true) {
    throw new Refusal('insufficient_facts',
      'pay.allowances_exclude_expense_reimbursements must be true when allowances are supplied: expense reimbursements are not allowances for Formula B, and the calculator does not separate them.',
      { field: 'pay.allowances_exclude_expense_reimbursements' });
  }
  const grossed = grossUp(pay.baseRateOfPayCents, pay.salarySacrificedCents);
  const result = baseRateWages({
    baseRateCents: grossed,
    bonuses: engineBonuses(pay.bonuses),
    overtimeAndPenaltyCents: pay.overtimeAndPenaltyCents,
    allowancesCents: pay.allowancesCents,
  });
  const bonuses = bonusWorkings(pay.bonuses);
  return {
    branch: { code: result.branch, label: 'Base rate of pay: the greater of Formula A and Formula B' },
    eligibleWagesCents: result.eligibleWagesCents,
    workings: {
      base_rate_of_pay_grossed_up: centsToString(grossed),
      bonuses_counted: bonuses.counted,
      formula_a: centsToString(result.formulaA),
      formula_b: quarterCentsToString(toQuarterCents(result.formulaB)),
      formula_b_basis: {
        aggregate: centsToString(grossed + pay.overtimeAndPenaltyCents + pay.allowancesCents
          + bonuses.counted.reduce((total, b) => total + Math.round(Number(b.amount) * 100), 0)),
        factor: '0.75',
      },
      winner: result.winner === 'A' ? 'formula_a' : 'formula_b',
      tie_rule: 'An exact tie resolves to Formula A.',
    },
    excluded: bonuses.excluded,
  };
}

function annualSalary(pay) {
  const grossed = grossUp(pay.annualSalaryPaidCents, pay.salarySacrificedCents);
  const result = annualSalaryWages({ annualSalaryPaidCents: grossed, bonuses: engineBonuses(pay.bonuses) });
  const bonuses = bonusWorkings(pay.bonuses);
  return {
    branch: { code: result.branch, label: 'Annual salary: salary paid plus incentives and bonuses paid at least monthly' },
    eligibleWagesCents: result.eligibleWagesCents,
    workings: {
      annual_salary_paid_grossed_up: centsToString(grossed),
      bonuses_counted: bonuses.counted,
      note: 'Overtime, penalty rates and shift loading are excluded on this branch and are not fields of it.',
    },
    excluded: bonuses.excluded,
  };
}

function casual(pay, reportingMonth) {
  for (const key of ['instrumentSpecifiesLoading', 'loadingQuantifiable']) {
    if (pay[key] === 'unknown') {
      const field = key === 'instrumentSpecifiesLoading' ? 'pay.instrument_specifies_loading' : 'pay.loading_quantifiable';
      throw new Refusal('insufficient_facts',
        `${field} is "unknown". The two loading answers select between s 3B(3)(a) and s 3B(3)(b), so the levy cannot be calculated until they are established.`,
        { field });
    }
  }
  const result = casualWages({
    reportingMonth,
    instrumentSpecifiesLoading: pay.instrumentSpecifiesLoading,
    loadingQuantifiable: pay.loadingQuantifiable,
    baseRatePayCents: pay.baseRateOfPayCents,
    casualLoadingCents: pay.casualLoadingCents,
    ordinaryRatePayCents: pay.ordinaryRateOfPayCents,
    sacrificedCents: pay.salarySacrificedCents,
    bonuses: engineBonuses(pay.bonuses),
  });
  if (result.ignored.length) {
    const fields = result.ignored.map((name) => CASUAL_FIELD_NAMES[name]);
    throw new Refusal('components_not_read_by_branch',
      `Branch ${result.branch} does not read ${fields.join(' or ')}, and a non-nil amount was supplied there. Send "0.00" for those fields, or correct the loading answers.`,
      { branch: result.branch, fields_not_read: fields });
  }
  const bonuses = bonusWorkings(pay.bonuses);
  const labels = {
    's 3B(3)(a)': 'Casual, loading specified and quantifiable: base rate of pay plus casual loading plus bonuses paid at least monthly',
    's 3B(3)(b)': 'Casual, loading not separately quantifiable: ordinary rate of pay plus bonuses paid at least monthly',
    'pre-2024': 'Casual, reporting months before January 2024',
  };
  return {
    branch: { code: result.branch, label: labels[result.branch] },
    eligibleWagesCents: result.eligibleWagesCents,
    workings: {
      bonuses_counted: bonuses.counted,
      salary_sacrifice_grossed_onto: result.branch === 's 3B(3)(a)' ? 'pay.base_rate_of_pay' : 'pay.ordinary_rate_of_pay',
    },
    excluded: bonuses.excluded,
  };
}

export function calculate(request, register, config) {
  const { reportingMonth } = request;
  if (!register.isSupported(reportingMonth)) {
    const months = register.supportedMonths();
    throw new Refusal('unsupported_period',
      `Reporting month ${reportingMonth} is not supported. Supported months run from ${months[0]} to ${months[months.length - 1]}; GET /v1/calculators lists them.`,
      { supported_months: { first: months[0], last: months[months.length - 1] } });
  }
  if (request.eligibleEmployee === 'unknown') {
    throw new Refusal('insufficient_facts',
      'employee.eligible_employee is "unknown". Eligibility under s 4 of the Administration Act is a coverage decision this calculator does not make; establish it first.',
      { field: 'employee.eligible_employee' });
  }
  if (request.eligibleEmployee === false) {
    throw new Refusal('out_of_scope_employee',
      'employee.eligible_employee is false. The levy is imposed on eligible wages of eligible employees, so no levy is calculated.',
      { field: 'employee.eligible_employee' });
  }

  const rateRow = register.rateFor(reportingMonth);
  const method = register.methodFor(reportingMonth);
  let selected;
  if (request.branch === 'base_rate') selected = baseRate(request.pay);
  else if (request.branch === 'annual_salary') selected = annualSalary(request.pay);
  else selected = casual(request.pay, reportingMonth);

  let roundedCents;
  try {
    roundedCents = levyCents(selected.eligibleWagesCents);
  } catch (issue) {
    if (issue instanceof RangeError) {
      throw new ValidationError('pay', 'amount_out_of_range',
        'The combined amounts exceed the total this calculator handles exactly. Reduce the amounts.');
    }
    throw issue;
  }
  const quarters = toQuarterCents(selected.eligibleWagesCents);
  // Levy in dollars before rounding = quarters * 27 / (4 * 1000 * 100).
  const before = exactDecimal(quarters * BigInt(LEVY_RATE_NUMERATOR), 4n * BigInt(LEVY_RATE_DENOMINATOR) * 100n,
    { minScale: 2, maxScale: 8 });
  const after = centsToString(roundedCents);
  const periodUrn = `${config.periodUrnPrefix}${reportingMonth}`;
  const rateUri = `${config.rateUrnPrefix}${reportingMonth}:levy-rate`;

  return {
    calculator: config.calculatorUrn,
    period: periodUrn,
    reporting_month: reportingMonth,
    branch: selected.branch,
    eligible_wages: quarterCentsToString(quarters),
    levy: after,
    levy_before_rounding: before,
    rate: {
      uri: rateUri,
      value_percent: rateRow.value,
      as_fraction: `${LEVY_RATE_NUMERATOR}/${LEVY_RATE_DENOMINATOR}`,
      effective_from: rateRow.period_start,
      source_checked: rateRow.verified_at,
      review: rateRow.review,
    },
    workings: selected.workings,
    excluded: selected.excluded,
    rounding: {
      rule: 'Half up to the nearest cent at the final step only. The Act, the Regulations and the guidance note publish no rounding rule; this is the calculator\'s documented choice.',
      intermediates: 'Eligible wages keep exact quarter cents (Formula B is three quarters of an aggregate); levy_before_rounding is exact.',
      differs: before !== after,
    },
    manifest: {
      calculator: config.calculatorUrn,
      period: periodUrn,
      schema: config.requestSchemaId,
      engine: {
        name: 'coal-lsl-levy',
        version: config.version,
        module: 'assets/levy.mjs',
        module_sha256: register.engineSha256,
        code_revision: config.codeRevision,
      },
      method: {
        record_id: method.record_id,
        uri: `${config.methodUrnPrefix}${method.record_id}`,
        sha256: register.methodsSha256,
        citation: method.citation,
      },
      rate_table_uris: [{ uri: rateUri, sha256: register.rateSha256, row_id: rateRow.row_id }],
      citation: 'Coal Mining Industry (Long Service Leave) Payroll Levy Collection Act 1992, s 3B; Coal Mining Industry (Long Service Leave) Payroll Levy Regulations 2018, s 6',
    },
    advisory: {
      figure_type: 'payroll_levy_estimate',
      notes: [
        'Review aid for a qualified person; not a lodgement figure and not a compliance determination.',
        'Eligibility under s 4 of the Coal Mining Industry (Long Service Leave) Administration Act 1992 is asserted by the caller, not tested here.',
        'Eligible wages are built from the supplied components only; the caller has separated expense reimbursements, insurer-paid amounts and pay outside the payroll weeks ending in the month.',
        'Rounding is the calculator\'s choice, not a statutory rule. Reconcile the monthly return to payroll before relying on this figure.',
        `Rate row ${rateRow.row_id} carries review status "${rateRow.review}". A source-check date does not establish currency after that date.`,
      ],
    },
  };
}
