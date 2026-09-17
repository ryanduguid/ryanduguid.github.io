#!/usr/bin/env node
// Local launcher. Binds to loopback unless COAL_LSL_HOST says otherwise.
import { execFileSync } from 'node:child_process';
import { listen } from '../src/server.mjs';
import { REPO_ROOT } from '../src/register.mjs';

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function codeRevision() {
  const fromEnv = env('COAL_LSL_CODE_REVISION', null);
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const port = Number(env('COAL_LSL_PORT', '8787'));
const rateLimit = Number(env('COAL_LSL_RATE_LIMIT_PER_MINUTE', '60'));
const maxBody = Number(env('COAL_LSL_MAX_BODY_BYTES', String(16 * 1024)));
if (![port, rateLimit, maxBody].every((n) => Number.isInteger(n) && n > 0)) {
  console.error('COAL_LSL_PORT, COAL_LSL_RATE_LIMIT_PER_MINUTE and COAL_LSL_MAX_BODY_BYTES must be positive integers');
  process.exit(2);
}

const app = await listen({
  host: env('COAL_LSL_HOST', '127.0.0.1'),
  port,
  rateLimitPerMinute: rateLimit,
  maxBodyBytes: maxBody,
  allowedOrigins: env('COAL_LSL_ALLOWED_ORIGINS', '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env('COAL_LSL_TRUST_PROXY', '0') === '1',
  // How many proxies you control sit in front of this service. The caller's
  // address is that many places from the right of X-Forwarded-For; everything
  // to the left of it is whatever the caller chose to send.
  trustedProxyDepth: Number(env('COAL_LSL_TRUSTED_PROXY_DEPTH', '0')),
  calculatorUrn: env('COAL_LSL_CALCULATOR_URN', 'urn:sbrm:calc:coal-lsl-levy'),
  publicBaseUrl: env('COAL_LSL_PUBLIC_BASE_URL', null),
  codeRevision: codeRevision(),
});
const months = app.register.supportedMonths();
console.error(`coal-lsl-levy ${app.config.version} listening on http://${app.config.host}:${app.config.port} `
  + `(${months.length} supported months, ${months[0]} to ${months[months.length - 1]}; `
  + `origins allowed: ${app.config.allowedOrigins.length ? app.config.allowedOrigins.join(' ') : 'none'})`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => app.server.close(() => process.exit(0)));
}
