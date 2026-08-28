import assert from 'node:assert/strict';
import { test } from 'node:test';

import { explainLevyResult, money } from '../assets/levy-explanation.mjs';
import {
  calculateScenario,
  coalLslTools,
  registerCoalLslTools,
} from '../assets/levy-webmcp.mjs';

const TOOL_NAMES = [
  'calculate_coal_lsl_levy',
  'run_coal_lsl_fixture',
  'explain_coal_lsl_method',
  'get_coal_lsl_evidence',
];

const formulaBInput = {
  branch: 'base_rate',
  baseRate: 6000,
  overtimeAndPenalties: 3000,
  allowances: 500,
};

function normaliseWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function assertStrictObjectSchemas(schema, path = '$') {
  if (schema?.type === 'object') {
    assert.equal(
      schema.additionalProperties,
      false,
      `${path} must reject additional properties`,
    );
  }
  for (const [key, child] of Object.entries(schema?.properties ?? {})) {
    assertStrictObjectSchemas(child, `${path}.properties.${key}`);
  }
  if (schema?.items) assertStrictObjectSchemas(schema.items, `${path}.items`);
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    for (const [index, child] of (schema?.[keyword] ?? []).entries()) {
      assertStrictObjectSchemas(child, `${path}.${keyword}[${index}]`);
    }
  }
}

test('shared presentation keeps the existing Formula B explanation', () => {
  assert.equal(money(712500), '$7,125.00');
  assert.equal(
    normaliseWhitespace(explainLevyResult({
      branch: 's 3B(1)',
      winner: 'B',
      formulaA: 600000,
      formulaB: 712500,
    })),
    'Formula B wins this month. Overtime, penalty rates and allowances reached '
      + 'the levy base only because 75 per cent of the aggregate ($7,125.00) '
      + 'exceeded base pay plus at-least-monthly bonuses ($6,000.00).',
  );
});

test('Formula B scenario preserves engine cents and final-step rounding', () => {
  const result = calculateScenario(formulaBInput);

  assert.equal(result.branch, 's 3B(1)');
  assert.equal(result.winner, 'B');
  assert.equal(result.formulaACents, 600000);
  assert.equal(result.formulaBCents, 712500);
  assert.equal(result.eligibleWagesCents, 712500);
  assert.equal(result.levyCents, 19238);
  assert.equal(result.eligibleWagesDisplay, '$7,125.00');
  assert.equal(result.levyDisplay, '$192.38');
  assert.equal(result.ratePercent, 2.7);
  assert.equal(result.rateAsAt, '2026-08-24');
  assert.equal(result.pageReviewed, '2026-08-28');
  assert.equal(result.estimateOnly, true);
  assert.match(result.boundary, /not legal, tax, accounting or financial advice/i);
});

test('scenario validation rejects extra, unsafe and malformed values', () => {
  for (const [label, input] of [
    ['unknown key', { ...formulaBInput, employeeName: 'Client One' }],
    ['identifier', { ...formulaBInput, employeeId: '123' }],
    ['file', { ...formulaBInput, file: 'payroll.csv' }],
    ['URL', { ...formulaBInput, url: 'https://example.com' }],
    ['negative amount', { ...formulaBInput, baseRate: -1 }],
    ['non-finite amount', { ...formulaBInput, baseRate: Number.POSITIVE_INFINITY }],
    ['too-large amount', { ...formulaBInput, baseRate: 100000001 }],
    ['invalid frequency', {
      ...formulaBInput,
      bonuses: [{ amount: 100, frequency: 'sometimes' }],
    }],
    ['bonus extra key', {
      ...formulaBInput,
      bonuses: [{ amount: 100, frequency: 'monthly', memo: 'client' }],
    }],
    ['missing base field', { branch: 'base_rate' }],
    ['missing annual field', { branch: 'annual_salary' }],
    ['wrong branch field', { branch: 'annual_salary', baseRate: 6000 }],
    ['missing casual month', { branch: 'casual', ordinaryPay: 1000 }],
    ['invalid casual month', {
      branch: 'casual', reportingMonth: '2026-13', ordinaryPay: 1000,
    }],
    ['missing casual loading decision', {
      branch: 'casual', reportingMonth: '2026-06', ordinaryPay: 1000,
    }],
    ['missing quantifiable loading amounts', {
      branch: 'casual',
      reportingMonth: '2026-06',
      instrumentSpecifiesLoading: true,
      loadingQuantifiable: true,
    }],
    ['missing all-in ordinary pay', {
      branch: 'casual',
      reportingMonth: '2026-06',
      instrumentSpecifiesLoading: false,
    }],
    ['ambiguous legacy pay', {
      branch: 'casual',
      reportingMonth: '2023-12',
      instrumentSpecifiesLoading: true,
      loadingQuantifiable: true,
      casualBasePay: 1000,
      ordinaryPay: 1250,
    }],
    ['array input', []],
    ['null input', null],
  ]) {
    assert.throws(() => calculateScenario(input), TypeError, label);
  }
});

test('valid annual and casual branches reuse the protected engine', () => {
  const annual = calculateScenario({
    branch: 'annual_salary',
    annualSalary: 10000,
    bonuses: [{ amount: 200, frequency: 'monthly' }],
  });
  assert.equal(annual.branch, 's 3B(2)');
  assert.equal(annual.eligibleWagesCents, 1020000);
  assert.equal(annual.levyCents, 27540);

  const casual = calculateScenario({
    branch: 'casual',
    reportingMonth: '2026-06',
    instrumentSpecifiesLoading: true,
    loadingQuantifiable: true,
    casualBasePay: 1800,
    casualLoading: 450,
  });
  assert.equal(casual.branch, 's 3B(3)(a)');
  assert.equal(casual.eligibleWagesCents, 225000);
  assert.equal(casual.levyCents, 6075);
});

test('tool catalogue is exact, strict and read-only', () => {
  const tools = coalLslTools();
  assert.deepEqual(tools.map(({ name }) => name), TOOL_NAMES);
  for (const tool of tools) {
    assert.equal(typeof tool.title, 'string');
    assert.equal(typeof tool.description, 'string');
    assert.ok(tool.description.length <= 500);
    assert.deepEqual(tool.annotations, {
      readOnlyHint: true,
      untrustedContentHint: false,
    });
    assertStrictObjectSchemas(tool.inputSchema, tool.name);
    assert.equal(typeof tool.execute, 'function');
  }
});

test('tool executions are deterministic and reject client-shaped data', async () => {
  const byName = Object.fromEntries(coalLslTools().map((tool) => [tool.name, tool]));

  const calculated = await byName.calculate_coal_lsl_levy.execute(formulaBInput);
  assert.equal(calculated.eligibleWagesCents, 712500);
  assert.equal(calculated.levyCents, 19238);
  await assert.rejects(
    () => byName.calculate_coal_lsl_levy.execute({
      ...formulaBInput,
      employeeLabel: 'J Smith',
    }),
    TypeError,
  );

  const fixture = await byName.run_coal_lsl_fixture.execute({ fixture: 'D2' });
  assert.equal(fixture.fixture, 'D2');
  assert.equal(fixture.result.eligibleWagesCents, 712500);
  await assert.rejects(
    () => byName.run_coal_lsl_fixture.execute({ fixture: 'custom-client-case' }),
    TypeError,
  );

  const method = await byName.explain_coal_lsl_method.execute({ method: 'base_rate' });
  assert.equal(method.method, 'base_rate');
  assert.match(method.explanation, /Formula A|Formula B/);
  assert.match(method.roundingBoundary, /final step/i);

  const evidence = await byName.get_coal_lsl_evidence.execute({});
  assert.equal(evidence.pageReviewed, '2026-08-28');
  assert.equal(evidence.estimateOnly, true);
  assert.deepEqual(
    evidence.sources.map(({ url }) => url),
    [
      'https://www.legislation.gov.au/C2004A04352/latest/text',
      'https://www.legislation.gov.au/F2018L00217/latest/text',
      'https://coallsl.com.au/guidance-notes/eligible-wages',
      'https://coallsl.com.au/about-us/governing-legislation/legislation',
      'https://coallsl.com.au',
    ],
  );
  await assert.rejects(
    () => byName.get_coal_lsl_evidence.execute({ url: 'https://example.com' }),
    TypeError,
  );
});

test('all allowlisted fixtures retain D-series engine parity', async () => {
  const fixtureTool = coalLslTools().find(({ name }) => name === 'run_coal_lsl_fixture');
  const expected = {
    D1: ['s 3B(1)', 600000, 16200],
    D2: ['s 3B(1)', 712500, 19238],
    D3: ['s 3B(1)', 600000, 16200],
    D4: ['s 3B(1)', 637500, 17213],
    D5: ['s 3B(1)', 640000, 17280],
    D6: ['s 3B(1)', 600000, 16200],
    D7: ['s 3B(1)', 600000, 16200],
    D8: ['s 3B(2)', 1020000, 27540],
    D9: ['s 3B(3)(a)', 225000, 6075],
    D10: ['s 3B(3)(b)', 225000, 6075],
    D11: ['pre-2024', 180000, 4860],
    D11b: ['s 3B(3)(a)', 225000, 6075],
    D12: ['s 3B(1)', 0, 0],
  };
  assert.deepEqual(fixtureTool.inputSchema.properties.fixture.enum, Object.keys(expected));

  for (const [fixture, values] of Object.entries(expected)) {
    const output = await fixtureTool.execute({ fixture });
    assert.deepEqual(
      [output.result.branch, output.result.eligibleWagesCents, output.result.levyCents],
      values,
      fixture,
    );
  }
});

test('registration captures all definitions and unsupported hosts are a no-op', () => {
  const registered = [];
  const modelContext = {
    registerTool(tool) {
      registered.push(tool);
      return Promise.resolve();
    },
  };

  assert.equal(registerCoalLslTools(modelContext), true);
  assert.deepEqual(registered.map(({ name }) => name), TOOL_NAMES);
  assert.equal(registerCoalLslTools(modelContext), false);
  assert.equal(registered.length, TOOL_NAMES.length);
  assert.equal(registerCoalLslTools(undefined), false);
  assert.equal(registerCoalLslTools({}), false);
});
