// Strict request validation for the Coal LSL levy service.
//
// The browser form tolerates blanks and treats them as $0.00, because a
// person is looking at the result. An HTTP caller is not, so every field
// the selected branch reads is required, every unknown field is rejected,
// and the three-valued facts (true, false, "unknown") are kept apart from
// a missing fact. Validation errors are the 422 class: the request is
// malformed or incomplete and must not be retried unchanged. Scope
// refusals (the 400 class) live in calculate.mjs.

import { MoneyError, parseMoney } from './money.mjs';

export const BRANCHES = Object.freeze(['base_rate', 'annual_salary', 'casual']);
// The engine's own frequency vocabulary, unchanged.
export const BONUS_FREQUENCIES = Object.freeze([
  'weekly', 'fortnightly', 'monthly', 'quarterly', 'halfYearly', 'annually',
]);
const TRISTATE = Object.freeze([true, false, 'unknown']);
export const MAX_BONUSES = 24;

export class ValidationError extends Error {
  constructor(field, code, message) {
    super(message);
    this.field = field;
    this.code = code;
  }
  toJSON() {
    return { error: 'validation_error', field: this.field, code: this.code, message: this.message };
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireObject(value, field) {
  if (!isPlainObject(value)) {
    throw new ValidationError(field, 'not_an_object', `${field} must be a JSON object.`);
  }
  return value;
}

function rejectUnknownKeys(object, allowed, field) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      throw new ValidationError(`${field}.${key}`, 'unknown_field',
        `${field}.${key} is not a field of this request. Allowed: ${allowed.join(', ')}.`);
    }
  }
}

function requireMoney(object, key, field) {
  if (!(key in object)) {
    throw new ValidationError(`${field}.${key}`, 'missing_required_field',
      `${field}.${key} is required. Send "0.00" for an amount of nil; a missing amount is not nil.`);
  }
  try {
    return parseMoney(object[key], `${field}.${key}`);
  } catch (issue) {
    if (issue instanceof MoneyError) {
      throw new ValidationError(issue.field, issue.code, issue.message);
    }
    throw issue;
  }
}

function requireTristate(object, key, field) {
  if (!(key in object)) {
    throw new ValidationError(`${field}.${key}`, 'missing_required_field',
      `${field}.${key} is required: true, false or "unknown".`);
  }
  const value = object[key];
  if (!TRISTATE.includes(value)) {
    throw new ValidationError(`${field}.${key}`, 'invalid_enum',
      `${field}.${key} must be true, false or "unknown".`);
  }
  return value;
}

function requireEnum(object, key, field, values) {
  if (!(key in object)) {
    throw new ValidationError(`${field}.${key}`, 'missing_required_field',
      `${field}.${key} is required. One of: ${values.join(', ')}.`);
  }
  if (!values.includes(object[key])) {
    throw new ValidationError(`${field}.${key}`, 'invalid_enum',
      `${field}.${key} must be one of: ${values.join(', ')}.`);
  }
  return object[key];
}

// YYYY-MM with a real calendar month. A full date is a shape error: the
// levy is reported by month and a day would silently misroute the string
// comparison the engine does.
export function parseReportingMonth(value, field = 'reporting_month') {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}$/.test(value)) {
    throw new ValidationError(field, 'invalid_reporting_month',
      `${field} must be a calendar month in YYYY-MM form.`);
  }
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new ValidationError(field, 'invalid_reporting_month',
      `${field} month must be 01 to 12.`);
  }
  return value;
}

function parseBonuses(object, field) {
  if (!('bonuses' in object)) {
    throw new ValidationError(`${field}.bonuses`, 'missing_required_field',
      `${field}.bonuses is required; send [] when there are none.`);
  }
  const list = object.bonuses;
  if (!Array.isArray(list)) {
    throw new ValidationError(`${field}.bonuses`, 'not_an_array', `${field}.bonuses must be an array.`);
  }
  if (list.length > MAX_BONUSES) {
    throw new ValidationError(`${field}.bonuses`, 'too_many_items',
      `${field}.bonuses holds more than ${MAX_BONUSES} entries.`);
  }
  return list.map((entry, index) => {
    const where = `${field}.bonuses[${index}]`;
    requireObject(entry, where);
    rejectUnknownKeys(entry, ['amount', 'frequency'], where);
    return {
      amountCents: requireMoney(entry, 'amount', where),
      frequency: requireEnum(entry, 'frequency', where, BONUS_FREQUENCIES),
    };
  });
}

export function validateRequest(body) {
  requireObject(body, 'body');
  rejectUnknownKeys(body, ['reporting_month', 'branch', 'employee', 'pay'], 'body');
  if (!('reporting_month' in body)) {
    throw new ValidationError('reporting_month', 'missing_required_field', 'reporting_month is required.');
  }
  const reportingMonth = parseReportingMonth(body.reporting_month);
  const branch = requireEnum(body, 'branch', 'body', BRANCHES).replace('body.', '');

  if (!('employee' in body)) {
    throw new ValidationError('employee', 'missing_required_field', 'employee is required.');
  }
  const employee = requireObject(body.employee, 'employee');
  rejectUnknownKeys(employee, ['eligible_employee'], 'employee');
  const eligibleEmployee = requireTristate(employee, 'eligible_employee', 'employee');

  if (!('pay' in body)) {
    throw new ValidationError('pay', 'missing_required_field', 'pay is required.');
  }
  const pay = requireObject(body.pay, 'pay');
  const result = { reportingMonth, branch, eligibleEmployee, pay: null };

  if (branch === 'base_rate') {
    rejectUnknownKeys(pay, [
      'base_rate_of_pay', 'salary_sacrificed', 'overtime_and_penalty_rates', 'allowances',
      'allowances_exclude_expense_reimbursements', 'bonuses',
    ], 'pay');
    result.pay = {
      baseRateOfPayCents: requireMoney(pay, 'base_rate_of_pay', 'pay'),
      salarySacrificedCents: requireMoney(pay, 'salary_sacrificed', 'pay'),
      overtimeAndPenaltyCents: requireMoney(pay, 'overtime_and_penalty_rates', 'pay'),
      allowancesCents: requireMoney(pay, 'allowances', 'pay'),
      allowancesExcludeExpenseReimbursements: requireTristate(
        pay, 'allowances_exclude_expense_reimbursements', 'pay',
      ),
      bonuses: parseBonuses(pay, 'pay'),
    };
  } else if (branch === 'annual_salary') {
    rejectUnknownKeys(pay, ['annual_salary_paid', 'salary_sacrificed', 'bonuses'], 'pay');
    result.pay = {
      annualSalaryPaidCents: requireMoney(pay, 'annual_salary_paid', 'pay'),
      salarySacrificedCents: requireMoney(pay, 'salary_sacrificed', 'pay'),
      bonuses: parseBonuses(pay, 'pay'),
    };
  } else {
    rejectUnknownKeys(pay, [
      'instrument_specifies_loading', 'loading_quantifiable', 'base_rate_of_pay',
      'casual_loading', 'ordinary_rate_of_pay', 'salary_sacrificed', 'bonuses',
    ], 'pay');
    result.pay = {
      instrumentSpecifiesLoading: requireTristate(pay, 'instrument_specifies_loading', 'pay'),
      loadingQuantifiable: requireTristate(pay, 'loading_quantifiable', 'pay'),
      baseRateOfPayCents: requireMoney(pay, 'base_rate_of_pay', 'pay'),
      casualLoadingCents: requireMoney(pay, 'casual_loading', 'pay'),
      ordinaryRateOfPayCents: requireMoney(pay, 'ordinary_rate_of_pay', 'pay'),
      salarySacrificedCents: requireMoney(pay, 'salary_sacrificed', 'pay'),
      bonuses: parseBonuses(pay, 'pay'),
    };
  }
  return result;
}
