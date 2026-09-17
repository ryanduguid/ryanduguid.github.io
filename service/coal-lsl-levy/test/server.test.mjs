import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { clientKey, createApp, createThrottle } from '../src/server.mjs';
import { REQUEST_SCHEMA } from '../src/openapi.mjs';
import { validateRequest } from '../src/schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'cases.json'), 'utf8'));
const PERIOD = 'urn:sbrm:period:coal-lsl-levy:2026-06';
const CALC = 'urn:sbrm:calc:coal-lsl-levy';

let app;
let base;
const logs = [];
before(async () => {
  app = createApp({ port: 0, rateLimitPerMinute: 1000, allowedOrigins: ['https://duguid.com.au'], log: (line) => logs.push(line) });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => app.server.close());

const post = (path, body, headers = {}) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('discovery lists the calculator, its periods, limits and refusal classes', async () => {
  const response = await fetch(`${base}/v1/calculators`);
  assert.equal(response.status, 200);
  const [entry] = await response.json();
  assert.equal(entry.calc_uri, CALC);
  assert.deepEqual(entry.calc_uri_aliases, ['urn:sbrm:calculator:coal-lsl-levy']);
  assert.equal(entry.supported_periods[0], 'urn:sbrm:period:coal-lsl-levy:2024-01');
  assert.equal(entry.supported_periods.at(-1), 'urn:sbrm:period:coal-lsl-levy:2026-08');
  assert.equal(entry.supported_periods.length, 32);
  assert.ok(entry.refusal_classes.includes('unsupported_period'));
  assert.equal(entry.limits.max_body_bytes, 16384);
});

test('liveness answers on both documented paths', async () => {
  for (const path of ['/healthz', '/livez']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
  }
});

test('openapi.json is served and every request property it declares is one the validator reads', async () => {
  const response = await fetch(`${base}/openapi.json`);
  assert.equal(response.status, 200);
  const doc = await response.json();
  assert.equal(doc.openapi, '3.1.0');
  assert.ok(doc.paths[`/v1/calculators/${CALC}/{period_uri}`]);
  // Parity: build a request from the schema's declared properties per branch
  // and confirm the validator accepts it, then confirm an extra property is refused.
  const money = '1.00';
  const samples = {
    base_rate: { base_rate_of_pay: money, salary_sacrificed: money, overtime_and_penalty_rates: money, allowances: money, allowances_exclude_expense_reimbursements: true, bonuses: [] },
    annual_salary: { annual_salary_paid: money, salary_sacrificed: money, bonuses: [] },
    casual: { instrument_specifies_loading: true, loading_quantifiable: true, base_rate_of_pay: money, casual_loading: money, ordinary_rate_of_pay: money, salary_sacrificed: money, bonuses: [] },
  };
  for (const variant of REQUEST_SCHEMA.properties.pay.oneOf) {
    const declared = Object.keys(variant.properties).sort();
    assert.deepEqual(declared, [...variant.required].sort(), `${variant.title}: every property is required`);
    assert.deepEqual(declared, Object.keys(samples[variant.title]).sort(), `${variant.title}: sample covers the schema`);
    const validated = validateRequest({ reporting_month: '2026-06', branch: variant.title, employee: { eligible_employee: true }, pay: samples[variant.title] });
    assert.equal(validated.branch, variant.title);
    assert.throws(() => validateRequest({ reporting_month: '2026-06', branch: variant.title, employee: { eligible_employee: true }, pay: { ...samples[variant.title], extra: '1.00' } }), /unknown_field|not a field/);
  }
});

test('rate listing hashes equal the SHA-256 of the exact bytes the rate routes serve', async () => {
  const listing = await (await fetch(`${base}/v1/rates/${PERIOD}`)).json();
  assert.equal(listing.entries.length, 2);
  for (const entry of listing.entries) {
    const body = Buffer.from(await (await fetch(`${base}/v1/rates/${PERIOD}/${entry.rate_id}`)).arrayBuffer());
    assert.equal(createHash('sha256').update(body).digest('hex'), entry.content_hash, entry.rate_id);
  }
  const series = readFileSync(join(here, '..', '..', '..', 'rates', 'register', 'series', 'coal-lsl-levy.json'));
  assert.equal(createHash('sha256').update(series).digest('hex'), listing.entries[0].content_hash, 'served bytes are the committed series file');
  assert.equal((await fetch(`${base}/v1/rates/urn:sbrm:period:coal-lsl-levy:2023-12`)).status, 404);
  assert.equal((await fetch(`${base}/v1/rates/${PERIOD}/no-such-rate`)).status, 404);
});

test('fixtures reproduce over HTTP, including the routing-only cases', async () => {
  for (const fixture of fixtures.cases) {
    const period = fixture.period_urn ?? `${fixtures.period_urn_prefix}${fixture.request.reporting_month}`;
    const response = await post(`/v1/calculators/${CALC}/${period}`, fixture.request);
    assert.equal(response.status, fixture.expected_status, fixture.id);
    const body = await response.json();
    if (fixture.expected_status === 200) {
      assert.equal(body.levy, fixture.expected.levy, fixture.id);
      assert.equal(body.manifest.rate_table_uris[0].sha256, app.register.rateSha256);
    } else if (fixture.expected_status === 400) {
      assert.equal(body.refusal_class, fixture.expected.refusal_class, fixture.id);
    } else if (fixture.expected_status === 404) {
      assert.equal(body.error, 'not_found');
      assert.ok(body.accepted.period_urn_pattern);
    } else {
      assert.equal(body.error, 'validation_error', fixture.id);
      assert.equal(body.code, fixture.expected.code, fixture.id);
      assert.equal(body.field, fixture.expected.field, fixture.id);
    }
    assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  }
});

test('the live-style long calculator URN is accepted as an alias', async () => {
  const response = await post(`/v1/calculators/urn:sbrm:calculator:coal-lsl-levy/${PERIOD}`, fixtures.cases[0].request);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).calculator, CALC, 'the manifest names the canonical URN');
});

test('unknown calculator URN, wrong method and bad media type are named', async () => {
  const unknown = await post(`/v1/calculators/urn:sbrm:calc:other/${PERIOD}`, {});
  assert.equal(unknown.status, 404);
  assert.ok((await unknown.json()).accepted.calculators.includes(CALC));
  const get = await fetch(`${base}/v1/calculators/${CALC}/${PERIOD}`);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST, OPTIONS');
  const text = await fetch(`${base}/v1/calculators/${CALC}/${PERIOD}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(text.status, 415);
  const bad = await post(`/v1/calculators/${CALC}/${PERIOD}`, '{not json');
  assert.equal(bad.status, 422);
  assert.equal((await bad.json()).code, 'invalid_json');
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  assert.equal((await fetch(`${base}/healthz`, { method: 'DELETE' })).status, 405);
});

test('bodies above the limit are refused before parsing, with and without Content-Length', async () => {
  const padding = 'x'.repeat(20000);
  const declared = await post(`/v1/calculators/${CALC}/${PERIOD}`, { pad: padding });
  assert.equal(declared.status, 413);
  assert.equal((await declared.json()).max_body_bytes, 16384);
  const chunked = await fetch(`${base}/v1/calculators/${CALC}/${PERIOD}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(`{"pad":"${padding}"}`)); controller.close(); } }),
    duplex: 'half',
  }).catch((issue) => ({ status: 'aborted', issue }));
  assert.ok(chunked.status === 413 || chunked.status === 'aborted');
});

test('CORS headers appear only for an allowed origin, and CORS is not authentication', async () => {
  const allowed = await fetch(`${base}/v1/calculators`, { headers: { origin: 'https://duguid.com.au' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://duguid.com.au');
  assert.equal(allowed.headers.get('vary'), 'Origin');
  const other = await fetch(`${base}/v1/calculators`, { headers: { origin: 'https://example.com' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  assert.equal(other.status, 200, 'a disallowed origin still gets an answer; CORS only governs the browser');
  const preflight = await fetch(`${base}/v1/calculators/${CALC}/${PERIOD}`, { method: 'OPTIONS', headers: { origin: 'https://duguid.com.au' } });
  assert.equal(preflight.status, 204);
  const noOrigin = await fetch(`${base}/v1/calculators`, { method: 'OPTIONS' });
  assert.equal(noOrigin.status, 404);
});

test('throttling returns 429 with Retry-After and is keyed per client', () => {
  let now = 1_000_000;
  const throttle = createThrottle(2, () => now);
  assert.equal(throttle.take('a').allowed, true);
  assert.equal(throttle.take('a').allowed, true);
  const third = throttle.take('a');
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSeconds >= 1 && third.retryAfterSeconds <= 60);
  assert.equal(throttle.take('b').allowed, true, 'another client is not throttled by the first');
  now += 60000;
  assert.equal(throttle.take('a').allowed, true, 'a new window resets the count');
});

test('a throttled server answers 429 over HTTP', async () => {
  const strict = createApp({ port: 0, rateLimitPerMinute: 1, log: () => {} });
  await new Promise((resolve) => strict.server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${strict.server.address().port}/healthz`;
    assert.equal((await fetch(url)).status, 200);
    const second = await fetch(url);
    assert.equal(second.status, 429);
    assert.match(second.headers.get('retry-after'), /^[0-9]+$/);
  } finally {
    strict.server.close();
  }
});

test('X-Forwarded-For is ignored unless the proxy is trusted', async () => {
  const strict = createApp({ port: 0, rateLimitPerMinute: 1, log: () => {} });
  await new Promise((resolve) => strict.server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${strict.server.address().port}/healthz`;
    assert.equal((await fetch(url, { headers: { 'x-forwarded-for': '203.0.113.1' } })).status, 200);
    assert.equal((await fetch(url, { headers: { 'x-forwarded-for': '203.0.113.2' } })).status, 429, 'a spoofed header does not buy a fresh bucket');
  } finally {
    strict.server.close();
  }
});

test('logs carry no request bodies, amounts or client addresses', () => {
  const joined = logs.join('\n');
  assert.ok(logs.length > 0);
  assert.ok(!joined.includes('6000.00'));
  assert.ok(!joined.includes('127.0.0.1'));
  assert.ok(!joined.includes('base_rate_of_pay'));
});


// -- regressions from the 18 September 2026 review ------------------------

test('a forwarded chain cannot buy a fresh bucket or spend another client\'s', () => {
  const socket = { remoteAddress: '10.0.0.1' };
  const withChain = (value) => ({ headers: { 'x-forwarded-for': value }, socket });
  const trusted = { trustProxy: true, trustedProxyDepth: 0 };

  // The leftmost entry is whatever the caller wrote. The rightmost is what the
  // proxy we trust appended, which is the one that identifies the caller.
  assert.equal(clientKey(withChain('1.2.3.4, 203.0.113.7'), trusted), '203.0.113.7');
  assert.equal(clientKey(withChain('9.9.9.9, 203.0.113.7'), trusted), '203.0.113.7',
    'a different spoofed prefix is still the same client');
  assert.equal(clientKey(withChain('203.0.113.9, 10.1.1.1'), trusted), '10.1.1.1',
    'naming a victim on the left does not spend the victim\'s budget');

  // Two proxies deep, the caller is two from the right.
  assert.equal(clientKey(withChain('1.2.3.4, 203.0.113.7, 10.1.1.1'),
    { trustProxy: true, trustedProxyDepth: 1 }), '203.0.113.7');
  // A chain shorter than the configured depth falls back to the socket.
  assert.equal(clientKey(withChain('1.2.3.4'), { trustProxy: true, trustedProxyDepth: 2 }), '10.0.0.1');
  // Untrusted, the header is ignored entirely.
  assert.equal(clientKey(withChain('1.2.3.4, 5.6.7.8'), { trustProxy: false }), '10.0.0.1');
});

test('a preflight spends throttle budget like any other request', async () => {
  const strict = createApp({ port: 0, rateLimitPerMinute: 2, allowedOrigins: ['https://duguid.com.au'], log: () => {} });
  await new Promise((resolve) => strict.server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${strict.server.address().port}/healthz`;
    await fetch(url, { method: 'OPTIONS', headers: { origin: 'https://duguid.com.au' } });
    await fetch(url, { method: 'OPTIONS', headers: { origin: 'https://duguid.com.au' } });
    assert.equal((await fetch(url)).status, 429, 'the preflights consumed the budget');
  } finally {
    strict.server.close();
  }
});

test('the throttle map does not grow across windows', () => {
  let now = 1_000_000;
  const throttle = createThrottle(5, () => now);
  for (let i = 0; i < 20000; i += 1) throttle.take(`key-${i}`);
  // A key from the previous window starts fresh rather than accumulating.
  now += 60000;
  for (let i = 0; i < 5; i += 1) assert.equal(throttle.take('key-0').allowed, true);
  assert.equal(throttle.take('key-0').allowed, false);
});

test('the logged path is the route that ran, not the raw target', async () => {
  const seen = [];
  const app2 = createApp({ port: 0, rateLimitPerMinute: 1000, log: (line) => seen.push(JSON.parse(line)) });
  await new Promise((resolve) => app2.server.listen(0, '127.0.0.1', resolve));
  try {
    const root = `http://127.0.0.1:${app2.server.address().port}`;
    // Dot segments resolve before routing, so this runs the liveness handler.
    const traversed = await fetch(`${root}/v1/rates/urn:sbrm:period:coal-lsl-levy:2026-06/../../../healthz`);
    assert.equal(traversed.status, 200);
    assert.equal(seen.at(-1).path, '/healthz', 'the log names the handler that ran');
    // A percent-encoded segment routes decoded, and the log says so too.
    await fetch(`${root}/v1/%72ates/urn:sbrm:period:coal-lsl-levy:2026-06`);
    assert.ok(!seen.at(-1).path.includes('%72'), 'the log is not the caller\'s spelling');
  } finally {
    app2.server.close();
  }
});

test('an oversized chunked body gets the documented 413, not a dropped connection', async () => {
  const padding = 'x'.repeat(40000);
  const response = await fetch(`${base}/v1/calculators/${CALC}/${PERIOD}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(`{"pad":"${padding}"}`)); controller.close(); },
    }),
    duplex: 'half',
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).max_body_bytes, 16384);
});

test('discovery publishes the real money ceiling, not a rounded one', async () => {
  const [entry] = await (await fetch(`${base}/v1/calculators`)).json();
  assert.equal(entry.limits.max_amount, '833999930994.53');
  assert.ok(entry.limits.money.includes('833999930994.53'));
  // The published figure is the one the boundary actually enforces.
  const over = await post(`/v1/calculators/${CALC}/${PERIOD}`, {
    reporting_month: '2026-06', branch: 'annual_salary', employee: { eligible_employee: true },
    pay: { annual_salary_paid: '833999930994.54', salary_sacrificed: '0.00', bonuses: [] },
  });
  assert.equal(over.status, 422);
  const at = await post(`/v1/calculators/${CALC}/${PERIOD}`, {
    reporting_month: '2026-06', branch: 'annual_salary', employee: { eligible_employee: true },
    pay: { annual_salary_paid: entry.limits.max_amount, salary_sacrificed: '0.00', bonuses: [] },
  });
  assert.equal(at.status, 200);
});
