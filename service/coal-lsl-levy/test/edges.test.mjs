// Refusals and faults the fixtures do not reach: missing request sections, money helpers given
// values they refuse, register rows that start or end mid-month, a register of the wrong shape,
// routes and faults past the calculator’s own refusals, and an upload abandoned part-way.
import { test } from 'node:test';
import { connect } from 'node:net';
import { IncomingMessage } from 'node:http';
import assert from 'node:assert/strict';

import { clientKey, listen, resolvePath } from '../src/server.mjs';
import { atMostPattern } from '../src/openapi.mjs';
import { codeRevision } from '../deploy/revision.mjs';
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

test('a target URL cannot parse is logged as unparsed and answered 500', async () => {
  let logged;
  const line = new Promise((resolve) => { logged = resolve; });
  const { app, close } = await serve({ log: (text) => logged(JSON.parse(text)) });
  try {
    const received = await new Promise((resolve) => {
      let text = '';
      const socket = connect(app.server.address().port, '127.0.0.1');
      socket.on('data', (chunk) => { text += chunk; if (text.includes('\r\n\r\n')) { socket.destroy(); resolve(text); } });
      socket.write('GET // HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
    });
    assert.match(received, /^HTTP\/1\.1 500 /);
    const record = await line;
    assert.deepEqual([record.path, record.status], ['(unparsed)', 500]);
  } finally { await close(); }
});

test('a calculation without a Content-Type is refused with 415', async () => {
  const { call, close } = await serve();
  try {
    const response = await call(CALCULATE, { method: 'POST', body: new Blob([JSON.stringify(request())]) });
    assert.equal(response.status, 415);
    assert.equal((await response.json()).error, 'unsupported_media_type');
  } finally { await close(); }
});

// Node stops a paused request's data events; a runtime whose pause() does not still has to
// answer one 413 and ignore the rest of the upload.
test('an oversized upload whose data keeps coming after the refusal gets one 413', { timeout: 10000 }, async () => {
  const { pause } = IncomingMessage.prototype;
  IncomingMessage.prototype.pause = function ignored() { return this; };
  const { app, close } = await serve({ maxBodyBytes: 1000 });
  try {
    const chunk = `${(600).toString(16)}\r\n${'x'.repeat(600)}\r\n`;
    const received = await new Promise((resolve) => {
      let text = '';
      const socket = connect(app.server.address().port, '127.0.0.1');
      socket.on('data', (part) => { text += part; });
      socket.on('error', () => {});
      socket.on('close', () => resolve(text));
      socket.write(`POST ${CALCULATE} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n`
        + `Transfer-Encoding: chunked\r\n\r\n${chunk.repeat(4)}0\r\n\r\n`);
    });
    assert.equal(received.match(/^HTTP\/1\.1 /gm).length, 1, received);
    assert.match(received, /^HTTP\/1\.1 413 /);
    assert.match(received, /"max_body_bytes":1000/);
  } finally {
    IncomingMessage.prototype.pause = pause;
    await close();
  }
});

test('the client key falls back to "unknown" without a socket address', () => {
  assert.equal(clientKey({ headers: {}, socket: {} }), 'unknown');
});

test('request targets resolve to the routed path, keeping a segment that cannot be decoded', () => {
  assert.deepEqual(resolvePath(undefined), { pathname: '/', segments: [''] });
  assert.deepEqual(resolvePath('/v1/a%20b/%E0%A4%A'), { pathname: '/v1/a b/%E0%A4%A', segments: ['v1', 'a b', '%E0%A4%A'] });
});

test('rate rows verified in the same month serve each month their checks vouch for', () => {
  const rows = register([
    rateRow({ row_id: 'first', period_start: '2024-01-01', period_end: '2024-01-31', verified_at: '2024-03-01' }),
    rateRow({ row_id: 'second', period_start: '2024-02-01', period_end: null, verified_at: '2024-03-20' }),
  ]);
  assert.deepEqual(rows.supportedMonths(), ['2024-01', '2024-02']);
  assert.equal(rows.rateFor('2024-02').row_id, 'second');
});

// Every amount up to twice the ceiling, in each form parseMoney accepts, matches exactly when it
// is at or below the ceiling.
test('the amount pattern admits exactly the amounts at or below its ceiling', () => {
  const fractions = ['', ...Array.from({ length: 10 }, (_, d) => `.${d}`),
    ...Array.from({ length: 100 }, (_, c) => `.${String(c).padStart(2, '0')}`)];
  const cents = (amount) => {
    const [dollars, fraction = ''] = amount.split('.');
    return Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  };
  for (const ceiling of ['9', '5.50', '19.99', '10.00', '100.05', '230.4']) {
    const pattern = new RegExp(atMostPattern(ceiling));
    const limit = cents(ceiling);
    for (let dollars = 0; dollars * 100 <= 2 * limit + 100; dollars += 1) {
      for (const fraction of fractions) {
        const amount = `${dollars}${fraction}`;
        assert.equal(pattern.test(amount), cents(amount) <= limit, `${amount} against ${ceiling}`);
      }
    }
    assert.equal(pattern.test(`0${ceiling}`), false, 'a leading zero is not an amount');
  }
});

test('the manifest revision is HEAD, marked dirty by local changes, and null without Git', () => {
  const git = (changes) => (...args) => (args[0] === 'status' ? changes : 'abc123');
  assert.equal(codeRevision(git('')), 'abc123');
  assert.equal(codeRevision(git(' M assets/levy.mjs')), 'abc123-dirty');
  assert.equal(codeRevision(() => { throw new Error('not a git repository'); }), null);
});
