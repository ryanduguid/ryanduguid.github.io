// HTTP surface: node:http only, no dependencies.
//
// Routes follow the LodgeiT Labs publishing standard as read on 18
// September 2026 (discovery, OpenAPI, liveness, rate tables, invocation).
// Everything the calculation needs is loaded once at start-up; a request
// never touches the file system, the clock (beyond logging) or the network.

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { MAX_WAGES_CENTS } from '../../../assets/levy.mjs';
import { calculate, REFUSAL_CLASSES, Refusal } from './calculate.mjs';
import { centsToString } from './money.mjs';
import { buildOpenApi } from './openapi.mjs';
import { loadRegister } from './register.mjs';
import { ValidationError, validateRequest } from './schema.mjs';

export const DEFAULTS = Object.freeze({
  host: '127.0.0.1',
  port: 8787,
  version: '0.1.0',
  calculatorUrn: 'urn:sbrm:calc:coal-lsl-levy',
  // Accepted in the path as well as the canonical form above, because the
  // live LodgeiT discovery uses this longer form while publish.html asks
  // for the short one. docs/identifier-mapping.md explains.
  calculatorUrnAliases: ['urn:sbrm:calculator:coal-lsl-levy'],
  periodUrnPrefix: 'urn:sbrm:period:coal-lsl-levy:',
  rateUrnPrefix: 'urn:sbrm:rate:coal-lsl-levy:',
  methodUrnPrefix: 'urn:sbrm:method:coal-lsl-levy:',
  requestSchemaId: 'coal-lsl-levy-request/1',
  maxBodyBytes: 16 * 1024,
  rateLimitPerMinute: 60,
  allowedOrigins: [],
  trustProxy: false,
  trustedProxyDepth: 0,
  codeRevision: null,
  publicBaseUrl: null,
  log: (line) => process.stderr.write(`${line}\n`),
});

const JSON_TYPE = 'application/json; charset=utf-8';

function send(response, status, body, headers = {}) {
  const bytes = Buffer.from(typeof body === 'string' ? body : `${JSON.stringify(body)}\n`, 'utf8');
  response.writeHead(status, {
    'Content-Type': JSON_TYPE,
    'Content-Length': bytes.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  response.end(bytes);
  return status;
}

// Fixed-window per-client throttle. One Map in process memory, enough for one
// instance behind an instance cap; a fleet needs a shared store, which is the
// documented upgrade path in docs/runbook.md.
//
// The whole map is replaced when the window turns, rather than swept per
// insert. The old sweep only deleted entries from a previous window, so while
// one window was open it freed nothing and rescanned everything on every
// insert past its size threshold: a caller producing many distinct keys made
// each of its own later requests O(n).
export function createThrottle(limitPerMinute, now = Date.now) {
  let windows = new Map();
  let openWindow = null;
  return {
    take(key) {
      const current = now();
      const windowStart = current - (current % 60000);
      if (windowStart !== openWindow) {
        windows = new Map();
        openWindow = windowStart;
      }
      const entry = windows.get(key);
      if (!entry) {
        windows.set(key, { count: 1 });
        return { allowed: true };
      }
      entry.count += 1;
      if (entry.count > limitPerMinute) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + 60000 - current) / 1000)) };
      }
      return { allowed: true };
    },
  };
}

// X-Forwarded-For grows left to right: a client may send its own, and each
// proxy appends the address it saw. So the rightmost entries are the ones a
// client cannot forge, and the caller's real address is `trustedProxyDepth`
// places from the right. Reading element [0], as this did, reads whatever the
// client wrote: an unlimited bypass, and a way to spend another client's
// budget by naming it.
export function clientKey(request, { trustProxy = false, trustedProxyDepth = 0 } = {}) {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const chain = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
      const index = chain.length - 1 - trustedProxyDepth;
      if (index >= 0) return chain[index];
      // The chain is shorter than the configured depth, so the entry that
      // should be there is missing. Fall through to the socket address rather
      // than trust the leftmost value.
    }
  }
  return request.socket.remoteAddress ?? 'unknown';
}

// Stop reading once the ceiling is passed, but leave the socket alone: the
// caller still has to write the 413 the contract promises. Destroying the
// request here closed the connection with no response at all, so a chunked
// oversized body got silence instead of the documented status.
function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    request.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        request.pause();
        reject(Object.assign(new Error('body too large'), { code: 'body_too_large' }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => { if (!done) resolve(Buffer.concat(chunks)); });
    request.on('error', (issue) => { if (!done) reject(issue); });
  });
}

// Resolve a request target to the path the routing uses: dot segments
// resolved by `URL`, then each segment percent-decoded. Both the router and
// the log read this, so the record cannot describe a different route from the
// one that ran.
export function resolvePath(requestUrl) {
  const url = new URL(requestUrl ?? '/', 'http://localhost');
  const segments = url.pathname.split('/').slice(1).map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  });
  return { pathname: `/${segments.join('/')}`, segments };
}

export function createApp(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const register = options.register ?? loadRegister();
  const throttle = createThrottle(config.rateLimitPerMinute, options.now);
  const months = register.supportedMonths();
  const periodUrns = new Set(months.map((month) => `${config.periodUrnPrefix}${month}`));
  const calculatorUrns = new Set([config.calculatorUrn, ...config.calculatorUrnAliases]);
  const openapi = buildOpenApi(config, register);
  const openapiText = `${JSON.stringify(openapi, null, 2)}\n`;
  const listing = [{
    calc_uri: config.calculatorUrn,
    calc_uri_aliases: config.calculatorUrnAliases,
    label: 'Coal LSL payroll levy on eligible wages (s 3B)',
    method: 'eligible_wages_times_prescribed_percentage',
    supported_periods: [...periodUrns],
    input_schema_ref: '#/components/schemas/CoalLslLevyInput',
    jurisdiction: 'AU',
    limits: {
      max_body_bytes: config.maxBodyBytes,
      requests_per_minute_per_client: config.rateLimitPerMinute,
      money: `decimal strings, at most 2 decimal places, whole-cent amounts up to ${centsToString(MAX_WAGES_CENTS)} each`,
      max_amount: centsToString(MAX_WAGES_CENTS),
    },
    refusal_classes: Object.keys(REFUSAL_CLASSES),
    status: 'development',
  }];
  const listingText = `${JSON.stringify(listing)}\n`;

  function rateListing(periodUrn) {
    const month = periodUrn.slice(config.periodUrnPrefix.length);
    return {
      period_uri: periodUrn,
      entries: [
        {
          rate_id: 'levy-rate',
          uri: `${config.rateUrnPrefix}${month}:levy-rate`,
          content_hash: register.rateSha256,
          hash_algorithm: 'sha256',
          hashed_bytes: 'the exact body of GET /v1/rates/{period_uri}/levy-rate, which is rates/register/series/coal-lsl-levy.json as committed',
          row_id: register.rateFor(month).row_id,
        },
        {
          rate_id: 'eligible-wages-method',
          uri: `${config.methodUrnPrefix}${register.methodFor(month).record_id}`,
          content_hash: register.methodsSha256,
          hash_algorithm: 'sha256',
          hashed_bytes: 'the exact body of GET /v1/rates/{period_uri}/eligible-wages-method, which is service/coal-lsl-levy/methods.json as committed',
        },
      ],
    };
  }

  function corsHeaders(request) {
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || !config.allowedOrigins.includes(origin)) return {};
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    };
  }

  async function handle(request, response) {
    const started = process.hrtime.bigint();
    const requestId = randomUUID();
    const cors = corsHeaders(request);
    // The path the routing actually used, not the raw request target, so a
    // caller cannot make the record disagree with what ran.
    let logPath = '(unparsed)';
    try {
      logPath = resolvePath(request.url).pathname;
    } catch { /* keep the placeholder */ }
    let status;
    try {
      status = await route(request, response, cors, requestId);
    } catch (issue) {
      // Never echo the error; the request id links the log line to the response.
      config.log(JSON.stringify({ level: 'error', request_id: requestId, message: issue?.message ?? String(issue) }));
      status = send(response, 500, { error: 'internal_error', request_id: requestId }, { 'X-Request-Id': requestId });
    }
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    // Minimal log: no bodies, no client address, no query strings.
    config.log(JSON.stringify({ request_id: requestId, method: request.method, path: logPath, status, ms: Math.round(ms) }));
  }

  async function route(request, response, cors, requestId) {
    const headers = { ...cors, 'X-Request-Id': requestId };
    const { pathname: path, segments } = resolvePath(request.url);

    // Throttle first, for every method. A preflight is a request the service
    // answers, so it spends budget like any other; skipping it left a method
    // outside the limit discovery publishes.
    const throttled = throttle.take(clientKey(request, config));
    if (!throttled.allowed) {
      return send(response, 429, { error: 'throttled', retry_after_seconds: throttled.retryAfterSeconds },
        { ...headers, 'Retry-After': String(throttled.retryAfterSeconds) });
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(Object.keys(cors).length ? 204 : 404, headers);
      response.end();
      return Object.keys(cors).length ? 204 : 404;
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      if (path === '/healthz' || path === '/livez') {
        return send(response, 200, { status: 'ok', service: 'coal-lsl-levy', version: config.version }, headers);
      }
      if (path === '/openapi.json') return send(response, 200, openapiText, headers);
      if (path === '/v1/calculators') return send(response, 200, listingText, headers);
      if (segments[0] === 'v1' && segments[1] === 'rates' && segments.length === 3) {
        if (!periodUrns.has(segments[2])) {
          return send(response, 404, { error: 'not_found', message: 'Unsupported period URN.', accepted: { periods: [...periodUrns] } }, headers);
        }
        return send(response, 200, rateListing(segments[2]), headers);
      }
      if (segments[0] === 'v1' && segments[1] === 'rates' && segments.length === 4) {
        if (!periodUrns.has(segments[2])) {
          return send(response, 404, { error: 'not_found', message: 'Unsupported period URN.', accepted: { periods: [...periodUrns] } }, headers);
        }
        if (segments[3] === 'levy-rate') {
          response.writeHead(200, { ...headers, 'Content-Type': JSON_TYPE, 'Content-Length': register.rateBytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          response.end(register.rateBytes);
          return 200;
        }
        if (segments[3] === 'eligible-wages-method') {
          response.writeHead(200, { ...headers, 'Content-Type': JSON_TYPE, 'Content-Length': register.methodBytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          response.end(register.methodBytes);
          return 200;
        }
        return send(response, 404, { error: 'not_found', message: 'Unknown rate id.', accepted: { rate_ids: ['levy-rate', 'eligible-wages-method'] } }, headers);
      }
      if (segments[0] === 'v1' && segments[1] === 'calculators' && segments.length === 4) {
        return send(response, 405, { error: 'method_not_allowed', message: 'Use POST to invoke the calculator.' }, { ...headers, Allow: 'POST, OPTIONS' });
      }
      return send(response, 404, { error: 'not_found', message: 'No such route.' }, headers);
    }

    if (request.method === 'POST') {
      if (!(segments[0] === 'v1' && segments[1] === 'calculators' && segments.length === 4)) {
        return send(response, 404, { error: 'not_found', message: 'No such route.' }, headers);
      }
      const [, , calculatorUrn, periodUrn] = segments;
      if (!calculatorUrns.has(calculatorUrn)) {
        return send(response, 404, { error: 'not_found', message: 'Unknown calculator URN.', accepted: { calculators: [...calculatorUrns] } }, headers);
      }
      if (!periodUrns.has(periodUrn)) {
        return send(response, 404, {
          error: 'not_found',
          message: 'This calculator does not accept that period URN.',
          accepted: { period_urn_pattern: `${config.periodUrnPrefix}YYYY-MM`, first: [...periodUrns][0], last: [...periodUrns][periodUrns.size - 1] },
        }, headers);
      }
      const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        return send(response, 415, { error: 'unsupported_media_type', message: 'Send Content-Type: application/json.' }, headers);
      }
      const declared = Number(request.headers['content-length'] ?? 0);
      if (declared > config.maxBodyBytes) {
        return send(response, 413, { error: 'body_too_large', max_body_bytes: config.maxBodyBytes }, headers);
      }
      let bytes;
      try {
        bytes = await readBody(request, config.maxBodyBytes);
      } catch (issue) {
        if (issue.code === 'body_too_large') {
          return send(response, 413, { error: 'body_too_large', max_body_bytes: config.maxBodyBytes }, headers);
        }
        throw issue;
      }
      let body;
      try {
        body = JSON.parse(bytes.toString('utf8'));
      } catch {
        return send(response, 422, { error: 'validation_error', field: 'body', code: 'invalid_json', message: 'The body is not valid JSON.' }, headers);
      }
      try {
        const validated = validateRequest(body);
        const expectedMonth = periodUrn.slice(config.periodUrnPrefix.length);
        if (validated.reportingMonth !== expectedMonth) {
          return send(response, 422, {
            error: 'validation_error', field: 'reporting_month', code: 'period_mismatch',
            message: `reporting_month ${validated.reportingMonth} does not match the period URN month ${expectedMonth}.`,
          }, headers);
        }
        const result = calculate(validated, register, config);
        return send(response, 200, result, headers);
      } catch (issue) {
        if (issue instanceof ValidationError) return send(response, 422, issue.toJSON(), headers);
        if (issue instanceof Refusal) return send(response, 400, issue.toJSON(), headers);
        throw issue;
      }
    }
    return send(response, 405, { error: 'method_not_allowed' }, { ...headers, Allow: 'GET, POST, OPTIONS' });
  }

  const server = createServer((request, response) => { handle(request, response); });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  return { server, config, register, openapi, listing };
}

export function listen(options = {}) {
  const app = createApp(options);
  return new Promise((resolve) => {
    app.server.listen(app.config.port, app.config.host, () => resolve(app));
  });
}
