import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseReportingMonth, validateRequest, ValidationError } from '../src/schema.mjs';

const good = {
  reporting_month: '2026-06', branch: 'annual_salary', employee: { eligible_employee: true },
  pay: { annual_salary_paid: '10.00', salary_sacrificed: '0.00', bonuses: [] },
};
const failure = (body) => { try { validateRequest(body); } catch (e) { assert.ok(e instanceof ValidationError); return `${e.field}:${e.code}`; } return 'accepted'; };

test('reporting month must be a real calendar month in YYYY-MM form', () => {
  assert.equal(parseReportingMonth('2026-01'), '2026-01');
  for (const bad of ['2026-13', '2026-00', '2026-1', '2026-01-01', '202601', '', null, 202601]) {
    assert.throws(() => parseReportingMonth(bad), ValidationError, String(bad));
  }
});

test('required fields, enums and three-valued facts are enforced', () => {
  assert.equal(failure(null), 'body:not_an_object');
  assert.equal(failure([]), 'body:not_an_object');
  assert.equal(failure({ ...good, extra: 1 }), 'body.extra:unknown_field');
  assert.equal(failure({ ...good, branch: 'hourly' }), 'body.branch:invalid_enum');
  assert.equal(failure({ ...good, employee: {} }), 'employee.eligible_employee:missing_required_field');
  assert.equal(failure({ ...good, employee: { eligible_employee: 'yes' } }), 'employee.eligible_employee:invalid_enum');
  assert.equal(failure({ ...good, employee: { eligible_employee: null } }), 'employee.eligible_employee:invalid_enum');
  assert.equal(failure({ ...good, pay: { ...good.pay, bonuses: 'none' } }), 'pay.bonuses:not_an_array');
  assert.equal(failure({ ...good, pay: { ...good.pay, bonuses: [{ amount: '1.00' }] } }), 'pay.bonuses[0].frequency:missing_required_field');
  assert.equal(failure({ ...good, pay: { ...good.pay, bonuses: Array.from({ length: 25 }, () => ({ amount: '1.00', frequency: 'weekly' })) } }), 'pay.bonuses:too_many_items');
  assert.equal(failure({ ...good, pay: { annual_salary_paid: '10.00', salary_sacrificed: '0.00', bonuses: [], base_rate_of_pay: '1.00' } }), 'pay.base_rate_of_pay:unknown_field');
  const casual = validateRequest({
    ...good, branch: 'casual',
    pay: { instrument_specifies_loading: 'unknown', loading_quantifiable: false, base_rate_of_pay: '0.00', casual_loading: '0.00', ordinary_rate_of_pay: '1.00', salary_sacrificed: '0.00', bonuses: [] },
  });
  assert.equal(casual.pay.instrumentSpecifiesLoading, 'unknown', '"unknown" survives validation as a value, not as false');
  assert.equal(validateRequest(good).pay.annualSalaryPaidCents, 1000);
});
