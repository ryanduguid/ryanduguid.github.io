import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { declaredScalesHold } from '../conformance/declared-scales.mjs';
import { calculate } from '../src/calculate.mjs';
import { loadRegister } from '../src/load-register.mjs';
import { buildOpenApi } from '../src/openapi.mjs';
import { validateRequest } from '../src/schema.mjs';
import { DEFAULTS } from '../src/server.mjs';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/cases.json', import.meta.url), 'utf8'));
const register = loadRegister();
const config = { ...DEFAULTS, codeRevision: 'test' };
const schema = buildOpenApi(config, register).components.schemas.CoalLslLevyResult;
const respond = (prefix) =>
  calculate(validateRequest(fixtures.cases.find((fixture) => fixture.id.startsWith(prefix)).request), register, config);

// Real responses: F2 carries every base-rate working, F6 counted and excluded bonuses.
const formulaB = respond('F2-');
const bonuses = respond('F6-');

// One change applied to a copy of a real response.
function changed(body, edit) {
  const copy = structuredClone(body);
  edit(copy);
  return copy;
}

test('real responses pass at their declared scales', () => {
  assert.equal(declaredScalesHold(schema, formulaB), true);
  assert.equal(declaredScalesHold(schema, bonuses), true);
});

test('a wrong scale anywhere the schema declares one fails', () => {
  assert.equal(declaredScalesHold(schema, changed(formulaB, (body) => { body.levy_before_rounding = '192.375'; })), false);
  assert.equal(declaredScalesHold(schema, changed(formulaB, (body) => { body.rate.value_percent = '2.7'; })), false);
  assert.equal(declaredScalesHold(schema, changed(formulaB, (body) => { body.workings.formula_b_basis.factor = '0.75'; })), false);
  assert.equal(declaredScalesHold(schema, changed(bonuses, (body) => { body.excluded[0].amount += '0'; })), false);
  assert.equal(declaredScalesHold(schema, changed(formulaB, (body) => { body.levy = 192.38; })), false,
    'a JSON number is not a decimal string');
});

test('a declared array or object must arrive with its declared shape', () => {
  assert.equal(declaredScalesHold(schema, changed(bonuses, (body) => { body.excluded = { amount: '1.000' }; })), false);
  assert.equal(declaredScalesHold(schema, changed(bonuses, (body) => { body.workings.bonuses_counted = null; })), false);
  assert.equal(declaredScalesHold(schema, changed(formulaB, (body) => { body.workings.formula_b_basis = null; })), false);
  assert.equal(declaredScalesHold(schema, changed(formulaB, (body) => { body.workings.formula_b_basis = '9500.00'; })), false);
  assert.equal(declaredScalesHold(schema, changed(formulaB, (body) => { body.rate = ['2.7000']; })), false);
});

test('a declared object must carry its required members', () => {
  assert.equal(declaredScalesHold(schema, changed(formulaB, (body) => { delete body.workings.formula_b_basis.factor; })), false);
  assert.equal(declaredScalesHold(schema, changed(formulaB, (body) => { delete body.levy_before_rounding; })), false);
  assert.equal(declaredScalesHold(schema, changed(bonuses, (body) => { delete body.excluded[0].reason; })), false);
});
