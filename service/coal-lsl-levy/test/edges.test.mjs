// Refusals and faults the fixtures do not reach: missing request sections, money helpers given
// values they refuse, register rows that start or end mid-month, a register of the wrong shape,
// routes and faults past the calculator’s own refusals, and an upload abandoned part-way.
import { test } from 'node:test';
import { connect } from 'node:net';
import assert from 'node:assert/strict';

import { listen } from '../src/server.mjs';
import { loadRegister } from '../src/load-register.mjs';
import { createRegister } from '../src/register.mjs';
import { validateRequest } from '../src/schema.mjs';
import { centsToString, exactDecimal } from '../src/money.mjs';

const PERIOD = 'urn:sbrm:period:coal-lsl-levy:2026-06';
const CALCULATE = `/v1/calculators/urn:sbrm:calculator:coal-lsl:levy/${PERIOD}`;
const request = () => ({
  reporting_month: '2026-06', branch: 'annual_salary', employee: { eligible_employee: true },
  pay: { annual_salary_paid: '10000.00', salary_sacrificed: '0.00', bonuses: [] },
});

test('each missing request section is named in the validation error', () => {
  const without = (edit) => { const body = request(); edit(body); return body; };
  const cases = [
    [without((body) => { delete body.reporting_month; }), 'reporting_month'],
    [without((body) => { delete body.employee; }), 'employee'],
    [without((body) => { delete body.pay; }), 'pay'],
    [without((body) => { delete body.pay.bonuses; }), 'pay.bonuses'],
  ];
  for (const [body, field] of cases) {
    assert.throws(() => validateRequest(body), (issue) => {
      assert.deepEqual([issue.toJSON().field, issue.toJSON().code], [field, 'missing_required_field']);
      return true;
    }, field);
  }
});

test('the money helpers refuse negative cents and non-BigInt fractions', () => {
  assert.equal(centsToString(5), '0.05');
  assert.throws(() => centsToString(-1), RangeError);
  assert.throws(() => centsToString(0.5), RangeError);
  assert.throws(() => exactDecimal(1, 2n), RangeError);
  assert.throws(() => exactDecimal(1n, 0n), RangeError);
  assert.throws(() => exactDecimal(-1n, 2n), RangeError);
});

const bytes = (value) => Buffer.from(JSON.stringify(value));
const rateRow = (row) => ({ row_id: 'row', value: '2.7', status: 'verified', verified_at: '2030-01-01', ...row });
const methodRow = { period_start: '2024-01-01', period_end: null, service_supported: true };
const register = (rows, { rates = {}, methods = {} } = {}) => createRegister({
  rateBytes: bytes({ schema_version: 1, unit: 'percent', rows, ...rates }),
  methodBytes: bytes({ schema_version: 1, records: [methodRow], ...methods }),
  engineBytes: Buffer.from('engine'),
});

test('a rate row starting or ending mid-month covers only the whole months inside it', () => {
  const rows = register([rateRow({ period_start: '2024-03-15', period_end: '2024-06-20' })]);
  assert.equal(rows.rateFor('2024-03'), null, 'the start month is only partly covered');
  assert.equal(rows.rateFor('2024-04').row_id, 'row');
  assert.equal(rows.rateFor('2024-05').row_id, 'row');
  assert.equal(rows.rateFor('2024-06'), null, 'the end month is only partly covered');
  assert.deepEqual(rows.supportedMonths(), ['2024-04', '2024-05']);
  const whole = register([rateRow({ period_start: '2024-03-01', period_end: '2024-06-30' })]);
  assert.deepEqual(whole.supportedMonths(), ['2024-03', '2024-04', '2024-05', '2024-06']);
});

test('a register of the wrong shape is refused at start', () => {
  assert.throws(() => register([], { rates: { unit: 'cents' } }), /unexpected rate series shape/);
  assert.throws(() => register([], { rates: { schema_version: 2 } }), /unexpected rate series shape/);
  assert.throws(() => register([], { methods: { schema_version: 2 } }), /unexpected methods shape/);
});

/** Starts an app on a free loopback port and returns a fetch bound to it. */
async function serve(options = {}) {
  const app = await listen({ port: 0, host: '127.0.0.1', rateLimitPerMinute: 1000, log: () => {}, ...options });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = (path, init) => fetch(base + path, init);
  return { app, call, close: () => new Promise((resolve) => { app.server.closeAllConnections(); app.server.close(resolve); }) };
}
const post = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('listen binds the configured host and serves', async () => {
  const { app, call, close } = await serve();
  try {
    assert.equal(app.config.host, '127.0.0.1');
    assert.ok(app.server.address().port > 0);
    assert.equal((await call('/healthz')).status, 200);
  } finally { await close(); }
});

test('unknown periods and routes past discovery answer 404', async () => {
  const { call, close } = await serve();
  try {
    const evidence = await call('/v1/rates/urn:sbrm:period:coal-lsl-levy:1999-01/levy-rate');
    assert.equal(evidence.status, 404);
    assert.equal((await evidence.json()).message, 'Unsupported period URN.');
    const elsewhere = await call('/v1/rates', post(request()));
    assert.equal(elsewhere.status, 404);
    assert.equal((await elsewhere.json()).message, 'No such route.');
  } finally { await close(); }
});

test('a casual loading of unknown quantifiability is refused when it decides the branch', async () => {
  const { call, close } = await serve();
  try {
    const response = await call(CALCULATE, post({
      reporting_month: '2026-06', branch: 'casual', employee: { eligible_employee: true },
      pay: { instrument_specifies_loading: true, loading_quantifiable: 'unknown', base_rate_of_pay: '1800.00',
        casual_loading: '450.00', ordinary_rate_of_pay: '0.00', salary_sacrificed: '0.00', bonuses: [] },
    }));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.refusal_class, 'insufficient_facts');
    assert.match(body.reason, /^pay\.loading_quantifiable is "unknown"/);
  } finally { await close(); }
});

test('a fault in the register answers 500 with the request id, not a refusal', async () => {
  const healthy = loadRegister();
  const broken = { ...healthy, rateFor() { throw new Error('register fault'); } };
  const { call, close } = await serve({ register: broken });
  try {
    const response = await call(CALCULATE, post(request()));
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'internal_error');
    assert.equal(body.request_id, response.headers.get('x-request-id'));
  } finally { await close(); }
});

test('an upload the client abandons part-way is logged as a 500, not calculated', { timeout: 10000 }, async () => {
  let logged;
  const line = new Promise((resolve) => { logged = resolve; });
  const { app, close } = await serve({ log: (text) => logged(JSON.parse(text)) });
  try {
    const socket = connect(app.server.address().port, '127.0.0.1');
    app.server.once('request', () => socket.destroy());
    socket.write(`POST ${CALCULATE} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n`
      + 'Content-Length: 200\r\n\r\n{"reporting_month":');
    const record = await line;
    assert.equal(record.path, CALCULATE);
    assert.equal(record.status, 500);
  } finally { await close(); }
});
