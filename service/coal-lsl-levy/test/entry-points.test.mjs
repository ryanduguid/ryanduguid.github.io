// The 2 entry points, run in Node. The Worker entry loads against stand-ins for the
// cloudflare: modules and a fake rate limiter; the local launcher runs as a child process with
// its configuration in the environment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Server } from 'node:http';
import { createServer } from 'node:net';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const stand = (source) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });
const STAND_INS = {
  'cloudflare:node': stand('export const httpServerHandler = (options) => ({ handler: "workerd", options });'),
  'cloudflare:workers': stand('export const env = globalThis.coalLslWorkerEnv;'),
};

test('the Worker entry keys its limiter on the Cloudflare client address and refuses past it', async () => {
  const keys = [];
  globalThis.coalLslWorkerEnv = { COAL_LSL_RATE_LIMITER: { async limit({ key }) {
    keys.push(key);
    return { success: key !== '192.0.2.9' };
  } } };
  const hooks = registerHooks({ resolve: (specifier, context, next) => STAND_INS[specifier] ?? next(specifier, context) });
  // workerd routes port 8080 to the handler; Node binds a free loopback port instead.
  const bound = [];
  const { listen } = Server.prototype;
  Server.prototype.listen = function standIn(port) {
    bound.push([this, port]);
    return listen.call(this, 0, '127.0.0.1');
  };
  let worker;
  try {
    worker = await import('../src/worker.mjs');
  } finally {
    Server.prototype.listen = listen;
    hooks.deregister();
  }
  const [[server, port]] = bound;
  try {
    assert.equal(port, 8080);
    assert.deepEqual(worker.default, { handler: 'workerd', options: { port: 8080 } });
    if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const listing = await fetch(`${base}/v1/calculators`, { headers: { 'cf-connecting-ip': '192.0.2.1' } });
    assert.equal(listing.status, 200);
    const [entry] = await listing.json();
    assert.match(entry.limits.rate_limit_scope, /per client IP, per Cloudflare location/);
    const refused = await fetch(`${base}/healthz`, { headers: { 'cf-connecting-ip': '192.0.2.9' } });
    assert.equal(refused.status, 429);
    assert.equal(refused.headers.get('retry-after'), '60');
    await (await fetch(`${base}/healthz`)).text();
    // A socket that has already closed reports no address.
    server.prependOnceListener('request', (request) => {
      Object.defineProperty(request.socket, 'remoteAddress', { value: undefined });
    });
    await (await fetch(`${base}/healthz`)).text();
    assert.deepEqual(keys, ['192.0.2.1', '192.0.2.9', '127.0.0.1', 'unknown']);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.coalLslWorkerEnv;
  }
});

const SERVE = fileURLToPath(new URL('../bin/serve.mjs', import.meta.url));
const freePort = () => new Promise((resolve) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const revisionAt = async (port) => {
  const response = await fetch(`http://127.0.0.1:${port}/v1/calculators/urn:sbrm:calculator:coal-lsl:levy/urn:sbrm:period:coal-lsl-levy:2026-06`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      reporting_month: '2026-06', branch: 'annual_salary', employee: { eligible_employee: true },
      pay: { annual_salary_paid: '10000.00', salary_sacrificed: '0.00', bonuses: [] } }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).manifest.engine.code_revision;
};

/** Runs the launcher; once it reports listening, `ready` sees the port, then SIGTERM stops it. */
function launch(env, ready) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVE], { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', async (chunk) => {
      stderr += chunk;
      if (!ready || !stderr.includes('listening on')) return;
      const run = ready;
      ready = null;
      try { await run(stderr); } catch (error) { reject(error); } finally { child.kill('SIGTERM'); }
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stderr }));
  });
}

test('the launcher refuses a configuration that is not a positive integer', async () => {
  for (const env of [{ COAL_LSL_PORT: 'eighty' }, { COAL_LSL_RATE_LIMIT_PER_MINUTE: '0' }, { COAL_LSL_MAX_BODY_BYTES: '1.5' }]) {
    const { code, stderr } = await launch(env);
    assert.equal(code, 2, JSON.stringify(env));
    assert.match(stderr, /must be positive integers/);
  }
});

test('the launcher serves on the configured port, names its origins and revision, and stops on SIGTERM', async () => {
  const port = await freePort();
  const env = { COAL_LSL_PORT: String(port), COAL_LSL_ALLOWED_ORIGINS: 'https://duguid.com.au, ,https://example.org',
    COAL_LSL_CODE_REVISION: 'abc123def456' };
  const { code, stderr } = await launch(env, async () => {
    assert.equal(await revisionAt(port), 'abc123def456');
  });
  assert.equal(code, 0, stderr);
  assert.match(stderr, new RegExp(`listening on http://127\\.0\\.0\\.1:${port} \\(\\d+ supported months, `));
  assert.match(stderr, /origins allowed: https:\/\/duguid\.com\.au https:\/\/example\.org\)/);
});

test('the launcher starts without Git, reporting no origins and no revision', async () => {
  const port = await freePort();
  const { code, stderr } = await launch({ COAL_LSL_PORT: String(port), COAL_LSL_CODE_REVISION: '', PATH: '' }, async () => {
    assert.equal(await revisionAt(port), null);
  });
  assert.equal(code, 0, stderr);
  assert.match(stderr, /origins allowed: none\)/);
});
