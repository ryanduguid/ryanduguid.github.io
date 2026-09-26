import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { calculate, Refusal } from '../src/calculate.mjs';
import { loadRegister } from '../src/load-register.mjs';
import { validateRequest, ValidationError } from '../src/schema.mjs';
import { DEFAULTS } from '../src/server.mjs';
import { levyCents, MAX_WAGES_CENTS } from '../../../assets/levy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'cases.json'), 'utf8'));
const register = loadRegister();
const config = { ...DEFAULTS, codeRevision: 'test' };

// Deep subset match: every key in `expected` must be present and equal in `actual`.
function assertSubset(actual, expected, path = 'result') {
  for (const [key, value] of Object.entries(expected)) {
    assert.ok(actual !== null && typeof actual === 'object' && key in actual, `${path}.${key} missing`);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      assertSubset(actual[key], value, `${path}.${key}`);
    } else {
      assert.deepEqual(actual[key], value, `${path}.${key}`);
    }
  }
}

function run(request) {
  try {
    return { status: 200, body: calculate(validateRequest(request), register, config) };
  } catch (issue) {
    if (issue instanceof ValidationError) return { status: 422, body: issue.toJSON() };
    if (issue instanceof Refusal) return { status: 400, body: issue.toJSON() };
    throw issue;
  }
}

for (const fixture of fixtures.cases) {
  if (fixture.expected_status === 404 || fixture.id.startsWith('V7')) continue; // routing cases live in server.test.mjs
  test(`fixture ${fixture.id}`, () => {
    const { status, body } = run(fixture.request);
    assert.equal(status, fixture.expected_status, JSON.stringify(body));
    const { excluded_components, ...rest } = fixture.expected;
    assertSubset(body, rest);
    if (excluded_components) {
      assert.deepEqual(body.excluded.map((entry) => entry.component), excluded_components);
    }
  });
}

test('the two unsupported months refuse at the calculation layer too', () => {
  for (const month of ['2023-12', '2026-09', '2026-12']) {
    const { status, body } = run({
      reporting_month: month, branch: 'annual_salary', employee: { eligible_employee: true },
      pay: { annual_salary_paid: '10.00', salary_sacrificed: '0.00', bonuses: [] },
    });
    assert.equal(status, 400);
    assert.equal(body.refusal_class, 'unsupported_period');
    assert.equal(body.supported_months.first, '2024-01');
    assert.equal(body.supported_months.last, '2026-08');
  }
});

test('a computed result is byte-identical across repeated calls', () => {
  const request = fixtures.cases.find((c) => c.id.startsWith('F2')).request;
  const first = JSON.stringify(run(request).body);
  for (let i = 0; i < 5; i += 1) assert.equal(JSON.stringify(run(request).body), first);
});

test('the manifest binds the result to its inputs and evidence', () => {
  const { body } = run(fixtures.cases[0].request);
  assert.equal(body.manifest.calculator, 'urn:sbrm:calculator:coal-lsl:levy');
  assert.equal(body.manifest.period, 'urn:sbrm:period:coal-lsl-levy:2026-06');
  assert.match(body.manifest.engine.module_sha256, /^[0-9a-f]{64}$/);
  assert.equal(body.manifest.rate_table_uris.length, 1);
  assert.equal(body.manifest.rate_table_uris[0].sha256, register.rateSha256);
  assert.equal(body.manifest.method.sha256, register.methodsSha256);
  assert.equal(body.rate.review, 'automated-retrieval');
  assert.ok(body.advisory.notes.some((note) => note.includes('not a lodgement figure')));
});

test('levy rounding agrees with exact BigInt half-up across quarter-cent positions', () => {
  // Independent check of the engine's Number arithmetic against integer
  // arithmetic for every quarter-cent residue near several magnitudes.
  for (const base of [0n, 100n, 123457n, 99999999n, BigInt(MAX_WAGES_CENTS) * 4n - 4000n]) {
    for (let offset = 0n; offset < 400n; offset += 1n) {
      const quarters = base + offset;
      const expected = Number((quarters * 27n + 2000n) / 4000n);
      assert.equal(levyCents(Number(quarters) / 4), expected, `quarters=${quarters}`);
    }
  }
});

test('an amount that parses on its own but overflows in aggregate is a 422, never a wrong figure', () => {
  const big = `${Math.floor(MAX_WAGES_CENTS / 100)}.00`;
  const { status, body } = run({
    reporting_month: '2026-06', branch: 'base_rate', employee: { eligible_employee: true },
    pay: { base_rate_of_pay: big, salary_sacrificed: '0.00', overtime_and_penalty_rates: big, allowances: '0.00', allowances_exclude_expense_reimbursements: true, bonuses: [] },
  });
  assert.equal(status, 422);
  assert.equal(body.code, 'amount_out_of_range');
});

test('casual salary sacrifice grosses onto the component the branch reads', () => {
  const a = run({
    reporting_month: '2026-08', branch: 'casual', employee: { eligible_employee: true },
    pay: { instrument_specifies_loading: true, loading_quantifiable: true, base_rate_of_pay: '1800.00', casual_loading: '450.00', ordinary_rate_of_pay: '0.00', salary_sacrificed: '100.00', bonuses: [] },
  });
  assert.equal(a.status, 200);
  assert.equal(a.body.eligible_wages, '2350.00');
  assert.equal(a.body.workings.salary_sacrifice_grossed_onto, 'pay.base_rate_of_pay');
  const b = run({
    reporting_month: '2026-08', branch: 'casual', employee: { eligible_employee: true },
    pay: { instrument_specifies_loading: false, loading_quantifiable: false, base_rate_of_pay: '0.00', casual_loading: '0.00', ordinary_rate_of_pay: '2250.00', salary_sacrificed: '100.00', bonuses: [] },
  });
  assert.equal(b.body.eligible_wages, '2350.00');
  assert.equal(b.body.workings.salary_sacrifice_grossed_onto, 'pay.ordinary_rate_of_pay');
});

test('an unknown loading answer does not block a branch a false fact has already settled', () => {
  // s 3B(3)(a) needs a specified AND a quantifiable loading, so a known false
  // on either side fixes the branch at s 3B(3)(b) whatever the other answer is.
  // Only an unknown that can still flip the branch may refuse.
  const settled = run({
    reporting_month: '2026-08', branch: 'casual', employee: { eligible_employee: true },
    pay: { instrument_specifies_loading: 'unknown', loading_quantifiable: false, base_rate_of_pay: '0.00', casual_loading: '0.00', ordinary_rate_of_pay: '2250.00', salary_sacrificed: '0.00', bonuses: [] },
  });
  assert.equal(settled.status, 200, JSON.stringify(settled.body));
  assert.equal(settled.body.branch.code, 's 3B(3)(b)');
  assert.equal(settled.body.eligible_wages, '2250.00');

  const mirror = run({
    reporting_month: '2026-08', branch: 'casual', employee: { eligible_employee: true },
    pay: { instrument_specifies_loading: false, loading_quantifiable: 'unknown', base_rate_of_pay: '0.00', casual_loading: '0.00', ordinary_rate_of_pay: '2250.00', salary_sacrificed: '0.00', bonuses: [] },
  });
  assert.equal(mirror.status, 200, JSON.stringify(mirror.body));
  assert.equal(mirror.body.branch.code, 's 3B(3)(b)');

  for (const loadingQuantifiable of ['unknown', true]) {
    const open = run({
      reporting_month: '2026-08', branch: 'casual', employee: { eligible_employee: true },
      pay: { instrument_specifies_loading: 'unknown', loading_quantifiable: loadingQuantifiable, base_rate_of_pay: '1800.00', casual_loading: '450.00', ordinary_rate_of_pay: '0.00', salary_sacrificed: '0.00', bonuses: [] },
    });
    assert.equal(open.status, 400, JSON.stringify(open.body));
    assert.equal(open.body.refusal_class, 'insufficient_facts');
    assert.equal(open.body.field, 'pay.instrument_specifies_loading');
  }
});
