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

test('bundled evidence hashes match the bytes the Worker serves', async () => {
  const period = 'urn:sbrm:period:coal-lsl-levy:2026-06';
  const rates = await (await call(`/v1/rates/${period}`)).json();
  for (const entry of rates.entries) {
    const response = await call(`/v1/rates/${period}/${entry.rate_id}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.content_hash);
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
