import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createTestHarness } from 'wrangler';

const harness = createTestHarness({ workers: [{ configPath: './wrangler.toml' }] });
const fixtures = JSON.parse(readFileSync(new URL('../fixtures/cases.json', import.meta.url)));
const path = '/v1/calculators/urn:sbrm:calculator:coal-lsl:levy/';
before(async () => { await harness.listen(); });
after(async () => { await harness.close(); });
const call = (url, init = {}) => harness.fetch(url, {
  ...init, headers: { 'cf-connecting-ip': '192.0.2.1', ...init.headers },
});

const boundaryRequest = (month) => ({
  reporting_month: month, branch: 'annual_salary', employee: { eligible_employee: true },
  pay: { annual_salary_paid: '10000.00', salary_sacrificed: '0.00', bonuses: [] },
});

test('the Worker serves discovery and the expected fixture results in workerd', async () => {
  const listing = await (await call('/v1/calculators')).json();
  assert.equal(listing[0].module, 'urn:sbrm:module:coal-lsl');
  assert.match(listing[0].limits.rate_limit_scope, /Cloudflare location/);
  const doc = await (await call('/openapi.json')).json();
  assert.equal(doc.servers[0].url, '/');
  for (const fixture of fixtures.cases) {
    const period = fixture.period_urn ?? `${fixtures.period_urn_prefix}${fixture.request.reporting_month}`;
    const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixture.request) };
    const response = await call(path + period, init);
    assert.equal(response.status, fixture.expected_status, fixture.id);
    const bytes = await response.text();
    const body = JSON.parse(bytes);
    if (response.status === 200) {
      assert.equal(body.levy, fixture.expected.levy, fixture.id);
      assert.equal(body.eligible_wages, fixture.expected.eligible_wages, fixture.id);
      assert.equal(await (await call(path + period, init)).text(), bytes, 'byte-identical result');
      assert.ok(body.manifest.engine.module_sha256);
    } else {
      for (const [key, value] of Object.entries(fixture.expected)) assert.deepEqual(body[key], value, fixture.id);
    }
  }
});

test('the Worker serves and cites the committed evidence files, hashed here', async () => {
  const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const committed = (file) => sha256(readFileSync(new URL(file, import.meta.url)));
  const expected = {
    'levy-rate': committed('../../../rates/register/series/coal-lsl-levy.json'),
    'eligible-wages-method': committed('../methods.json'),
  };
  const period = 'urn:sbrm:period:coal-lsl-levy:2026-06';
  const rates = await (await call(`/v1/rates/${period}`)).json();
  assert.deepEqual(Object.fromEntries(rates.entries.map((entry) => [entry.rate_id, entry.content_hash])), expected);
  for (const [id, hash] of Object.entries(expected)) {
    const response = await call(`/v1/rates/${period}/${id}`);
    assert.equal(response.status, 200, id);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), hash, id);
  }
  const { manifest } = await (await call(path + period, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(boundaryRequest('2026-06')),
  })).json();
  assert.equal(manifest.rate_table_uris[0].sha256, expected['levy-rate']);
  assert.equal(manifest.method.sha256, expected['eligible-wages-method']);
  assert.equal(manifest.engine.module_sha256, committed('../../../assets/levy.mjs'));
});

test('September and October 2026 are served and November is refused, by GET and POST', async () => {
  const headers = { 'cf-connecting-ip': '192.0.2.4' };
  for (const [month, status] of [['2026-09', 200], ['2026-10', 200], ['2026-11', 404]]) {
    const period = `urn:sbrm:period:coal-lsl-levy:${month}`;
    const listing = await call(`/v1/rates/${period}`, { headers });
    assert.equal(listing.status, status, `GET ${month}`);
    await listing.text();
    const result = await call(path + period, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(boundaryRequest(month)),
    });
    assert.equal(result.status, status, `POST ${month}`);
    await result.text();
  }
});

test('the Worker rejects oversized bodies before JSON parsing', async () => {
  const response = await call(`${path}urn:sbrm:period:coal-lsl-levy:2026-06`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(16385),
  });
  assert.equal(response.status, 413);
});

test('the platform binding returns 429 and ignores spoofed forwarding headers', async () => {
  for (let i = 0; i < 60; i += 1) {
    const response = await call('/healthz', { headers: { 'cf-connecting-ip': '192.0.2.2' } });
    assert.equal(response.status, 200);
    await response.text();
  }
  const denied = await call('/healthz', { headers: {
    'cf-connecting-ip': '192.0.2.2', 'x-forwarded-for': '198.51.100.99',
  } });
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('retry-after'), '60');
  await denied.text();
  const another = await call('/healthz', { headers: { 'cf-connecting-ip': '192.0.2.3' } });
  assert.equal(another.status, 200);
  await another.text();
});
