// The checker against a service whose evidence has been tampered with. Each
// case runs conformance/check.mjs through a proxy that rewrites one kind of
// response, because a check that cannot fail proves nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createApp } from '../src/server.mjs';
import { loadRegister } from '../src/load-register.mjs';

const CHECKER = fileURLToPath(new URL('../conformance/check.mjs', import.meta.url));
const isListing = (url) => /^\/v1\/rates\/[^/]+$/.test(url);
const isEvidence = (url) => /^\/v1\/rates\/[^/]+\/[^/]+$/.test(url);
const isComputed = (method, status) => method === 'POST' && status === 200;
const listen = (server) => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
});

// `rewrite` sees each response and returns the fields to replace, if any.
const revision = 'a'.repeat(40);
const releaseArgs = (month = loadRegister().supportedMonths().at(-1)) =>
  ['--expect-month', month, '--expect-revision', revision];

async function checkThrough(rewrite = () => undefined, args = []) {
  const app = createApp({ port: 0, rateLimitPerMinute: 100000, codeRevision: revision, log: () => {} });
  const upstream = await listen(app.server);
  const proxy = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const requestBody = request.method === 'POST' ? Buffer.concat(chunks) : undefined;
    const answer = await fetch(`${upstream}${request.url}`, {
      method: request.method,
      headers: { 'content-type': 'application/json' },
      body: requestBody,
    });
    const bytes = Buffer.from(await answer.arrayBuffer());
    const replaced = rewrite({ method: request.method, url: request.url, status: answer.status, bytes, requestBody }) ?? {};
    response.writeHead(replaced.status ?? answer.status, { 'content-type': 'application/json' });
    response.end(replaced.body ? JSON.stringify(replaced.body) : bytes);
  });
  const base = await listen(proxy);
  try {
    return await new Promise((resolve) => {
      execFile(process.execPath, [CHECKER, '--base', base, ...args], { timeout: 20000 }, (error, stdout) => {
        resolve({ code: error ? error.code : 0, stdout });
      });
    });
  } finally {
    proxy.close();
    app.server.close();
  }
}

const failed = (stdout, name) => stdout.split('\n').some((line) => line.startsWith('FAIL') && line.includes(name));

test('the service as built passes every check', async () => {
  const { code, stdout } = await checkThrough();
  assert.equal(code, 0, stdout);
});

test('the release check verifies the requested month on the requested revision', async () => {
  const { code, stdout } = await checkThrough(undefined, releaseArgs());
  assert.equal(code, 0, stdout);
  assert.match(stdout, /PASS +release +the expected period computes on the expected revision/);
});

test('a healthy service without the expected newest month fails the release check', async () => {
  const { code, stdout } = await checkThrough(undefined, releaseArgs('2999-01'));
  assert.equal(code, 1, stdout);
  assert.ok(failed(stdout, 'newest advertised period'), stdout);
});

test('a stale revision fails even when the expected month computes', async () => {
  const { code, stdout } = await checkThrough(({ method, status, bytes }) => {
    if (!isComputed(method, status)) return undefined;
    const body = JSON.parse(bytes);
    body.manifest.engine.code_revision = 'b'.repeat(40);
    return { body };
  }, releaseArgs());
  assert.equal(code, 1, stdout);
  assert.ok(failed(stdout, 'the expected period computes on the expected revision'), stdout);
});

test('a manifest without a calculation fails for the expected release month', async () => {
  const month = loadRegister().supportedMonths().at(-1);
  const { code, stdout } = await checkThrough(({ method, url, status, bytes, requestBody }) => {
    if (!isComputed(method, status) || !url.endsWith(month)
      || JSON.parse(requestBody).pay?.base_rate_of_pay !== '6000.00') return undefined;
    return { body: { manifest: JSON.parse(bytes).manifest } };
  }, releaseArgs(month));
  assert.equal(code, 1, stdout);
  assert.ok(failed(stdout, 'the expected period computes on the expected revision'), stdout);
});

test('a wrong levy with valid scales and provenance fails for the expected release month', async () => {
  const month = loadRegister().supportedMonths().at(-1);
  const { code, stdout } = await checkThrough(({ method, url, status, bytes, requestBody }) => {
    if (!isComputed(method, status) || !url.endsWith(month)
      || JSON.parse(requestBody).pay?.base_rate_of_pay !== '6000.00') return undefined;
    const body = JSON.parse(bytes);
    body.levy = '999.99';
    body.levy_before_rounding = '999.99000000';
    return { body };
  }, releaseArgs(month));
  assert.equal(code, 1, stdout);
  assert.ok(failed(stdout, 'the expected period returns the expected levy'), stdout);
  assert.match(stdout, /levy: expected \d+\.\d{2}, received 999\.99/);
});

test('a computation citing another rate row fails for the expected release month', async () => {
  const month = loadRegister().supportedMonths().at(-1);
  const { code, stdout } = await checkThrough(({ method, url, status, bytes, requestBody }) => {
    if (!isComputed(method, status) || !url.endsWith(month)
      || JSON.parse(requestBody).pay?.base_rate_of_pay !== '6000.00') return undefined;
    const body = JSON.parse(bytes);
    body.manifest.rate_table_uris[0].row_id = 'another-row';
    return { body };
  }, releaseArgs(month));
  assert.equal(code, 1, stdout);
  assert.ok(failed(stdout, 'cites the expected period’s verified rate and method'), stdout);
});

test('malformed arguments are usage errors, not failed checks', async () => {
  for (const args of [['--base'], ['--base='], ['--unknown'], ['--base', 'http://127.0.0.1:9', '--expect-month', '2026-13']]) {
    const code = await new Promise((resolve) => {
      execFile(process.execPath, [CHECKER, ...args], { timeout: 20000 }, (error) => resolve(error?.code ?? 0));
    });
    assert.equal(code, 2, args.join(' '));
  }
});

test('no listed evidence and no cited hashes fail each evidence check', async () => {
  const { code, stdout } = await checkThrough(({ method, url, status, bytes }) => {
    if (isListing(url)) return { body: { ...JSON.parse(bytes), entries: [] } };
    if (isComputed(method, status)) {
      const body = JSON.parse(bytes);
      delete body.manifest.method;
      body.manifest.rate_table_uris = [];
      return { body };
    }
    return undefined;
  });
  assert.equal(code, 1, stdout);
  assert.ok(failed(stdout, 'lists rate tables with content hashes'), stdout);
  assert.ok(failed(stdout, 'each declared content hash'), stdout);
  assert.ok(failed(stdout, 'every 200 carries a complete manifest'), stdout);
});

test('a listing that omits the method fails even when the manifest omits it too', async () => {
  const { code, stdout } = await checkThrough(({ method, url, status, bytes }) => {
    if (isListing(url)) {
      const body = JSON.parse(bytes);
      return { body: { ...body, entries: body.entries.slice(0, 1) } };
    }
    if (isComputed(method, status)) {
      const body = JSON.parse(bytes);
      delete body.manifest.method;
      return { body };
    }
    return undefined;
  });
  assert.equal(code, 1, stdout);
  assert.ok(failed(stdout, 'lists rate tables with content hashes'), stdout);
  assert.ok(failed(stdout, 'every 200 carries a complete manifest'), stdout);
});

test('an evidence route that fails is not evidence, even when its bytes match', async () => {
  const { code, stdout } = await checkThrough(({ url }) => (isEvidence(url) ? { status: 500 } : undefined));
  assert.equal(code, 1, stdout);
  assert.ok(failed(stdout, 'each declared content hash'), stdout);
});

test('checks about computed results fail when no fixture computes', async () => {
  const { code, stdout } = await checkThrough(({ method, status }) => (
    isComputed(method, status) ? { status: 500 } : undefined
  ));
  assert.equal(code, 1, stdout);
  for (const name of ['decimal strings', 'complete manifest', 'rounding policy', 'advisory block']) {
    assert.ok(failed(stdout, name), `${name}\n${stdout}`);
  }
});
