import { test } from 'node:test';
import assert from 'node:assert/strict';

import { declaredScalesHold } from '../conformance/declared-scales.mjs';
import { buildOpenApi } from '../src/openapi.mjs';
import { loadRegister } from '../src/load-register.mjs';

const result = buildOpenApi({ version: 'test', calculatorUrn: 'urn:test', periodUrnPrefix: 'urn:period:' }, loadRegister())
  .components.schemas.CoalLslLevyResult;

const good = {
  eligible_wages: '7125.0000',
  levy: '192.38',
  levy_before_rounding: '192.37500000',
  rate: { value_percent: '2.7000' },
  workings: { formula_b_basis: { aggregate: '9500.00', factor: '0.7500' }, bonuses_counted: [{ amount: '100.00' }] },
  excluded: [{ amount: '300.00', reason: 'quarterly' }],
};

test('a response at the declared scales passes, and absent workings are allowed', () => {
  assert.equal(declaredScalesHold(result, good), true);
  assert.equal(declaredScalesHold(result, { ...good, workings: {}, excluded: [] }), true);
});

test('a wrong scale anywhere the schema declares one fails', () => {
  assert.equal(declaredScalesHold(result, { ...good, levy_before_rounding: '192.375' }), false);
  assert.equal(declaredScalesHold(result, { ...good, rate: { value_percent: '2.7' } }), false);
  assert.equal(declaredScalesHold(result, { ...good, workings: { formula_b_basis: { aggregate: '9500.00', factor: '0.75' } } }), false);
  assert.equal(declaredScalesHold(result, { ...good, excluded: [{ amount: '300.000' }] }), false);
  assert.equal(declaredScalesHold(result, { ...good, levy: 192.38 }), false, 'a JSON number is not a decimal string');
});

test('an array the schema declares must arrive as an array', () => {
  assert.equal(declaredScalesHold(result, { ...good, excluded: { amount: '1.000' } }), false);
  assert.equal(declaredScalesHold(result, { ...good, excluded: 'none' }), false);
  assert.equal(declaredScalesHold(result, { ...good, workings: { bonuses_counted: null } }), false);
});
