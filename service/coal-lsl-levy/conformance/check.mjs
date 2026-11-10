#!/usr/bin/env node
// Local conformance check against the six sections of the LodgeiT Labs
// publishing standard as published at https://lodgeit.org/publish.html and
// read on 26 September 2026 (snapshot: docs/contract-snapshot.md).
//
// This is Ryan's own reading of a draft standard. Passing it is not a
// LodgeiT conformance result, not a listing and not an approval. Only
// LodgeiT can say whether the surface conforms.
//
// Usage:
//   node conformance/check.mjs                 # starts a loopback server
//   node conformance/check.mjs --base <url>    # checks a running service
//   node conformance/check.mjs --base <url> --expect-month <YYYY-MM> --expect-revision <git-sha>

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createApp } from '../src/server.mjs';
import { loadRegister } from '../src/load-register.mjs';
import { atScale, SCALE } from '../src/money.mjs';
import { declaredScalesHold } from './declared-scales.mjs';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'cases.json'), 'utf8'));
const CALC = 'urn:sbrm:calculator:coal-lsl:levy';
const isHash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

const results = [];
const check = (section, name, ok, detail = '') => results.push({ section, name, ok, detail });

function matchesExpected(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'excluded_components') {
      assert.deepEqual(actual.excluded.map((entry) => entry.component), value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      assert.ok(actual?.[key] && typeof actual[key] === 'object', `${key} missing`);
      matchesExpected(actual[key], value);
    } else {
      assert.deepEqual(actual?.[key], value, key);
    }
  }
}

function releaseFigures(wages, percent) {
  const [whole, fraction = ''] = percent.split('.');
  const rate = BigInt(whole + fraction);
  const rateScale = 10n ** BigInt(fraction.length);
  // The fixture fixes eligible wages independently of the engine. Convert
  // the register percentage to a fraction and round once, at the final cent.
  const numerator = BigInt(wages.replace('.', '')) * rate;
  const denominator = 10n ** BigInt(SCALE.quarterCents) * rateScale * 100n;
  const cents = (numerator * 100n + denominator / 2n) / denominator;
  return {
    eligible_wages: wages,
    levy: atScale(cents, 100n, SCALE.money),
    levy_before_rounding: atScale(numerator, denominator, SCALE.levyBeforeRounding),
    'rate.value_percent': atScale(rate, rateScale, SCALE.rate),
  };
}

async function run(base, expectedMonth, expectedRevision) {
  const exchange = async (request) => {
    const response = await fetch(request);
    let body = null;
    try { body = await response.clone().json(); } catch { /* not JSON */ }
    return { response, body, bytes: Buffer.from(await response.arrayBuffer()) };
  };
  const json = (path, init) => exchange(
    new Request(`${base}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) }));

  // 1. Describe yourself
  const listing = await json('/v1/calculators');
  check('1 discovery', 'GET /v1/calculators answers 200 with a calculator array',
    listing.response.status === 200 && Array.isArray(listing.body) && listing.body.length > 0);
  const entry = Array.isArray(listing.body) ? listing.body[0] : {};
  check('1 discovery', 'the entry carries calc_uri, input_schema_ref and supported_periods',
    Boolean(entry.calc_uri && entry.input_schema_ref && Array.isArray(entry.supported_periods) && entry.supported_periods.length),
    `${entry.supported_periods?.length ?? 0} periods`);
  const openapi = await json('/openapi.json');
  const modules = await json('/v1/modules');
  const filtered = await json(`/v1/calculators?module=${encodeURIComponent(entry.module)}`);
  const unknownModule = await json('/v1/calculators?module=urn:sbrm:module:unknown');
  check('1 discovery', 'module discovery, filtering and canonical identifiers agree',
    /^urn:sbrm:calculator:[^:]+:[^:]+$/.test(entry.calc_uri ?? '')
      && entry.module === 'urn:sbrm:module:coal-lsl' && Boolean(entry.description)
      && entry.selection?.kind === 'fact'
      && modules.body?.some((module) => module.module === entry.module && module.calculators.includes(entry.calc_uri))
      && filtered.body?.[0]?.calc_uri === entry.calc_uri
      && Array.isArray(unknownModule.body) && unknownModule.body.length === 0);
  check('1 discovery', 'the schema and invocation are discoverable without prose',
    entry.input_schema_ref === '/openapi.json#/components/schemas/CoalLslLevyInput'
      && Boolean(openapi.body?.components?.schemas?.CoalLslLevyInput)
      && entry.invocation?.method === 'POST'
      && Boolean(openapi.body?.paths?.[entry.invocation.path]?.post));
  check('1 discovery', 'GET /openapi.json answers an OpenAPI 3 document',
    openapi.response.status === 200 && String(openapi.body?.openapi ?? '').startsWith('3.'), openapi.body?.openapi ?? '');
  const health = await json('/healthz');
  check('1 discovery', 'GET /healthz answers 200', health.response.status === 200);
  const period = entry.supported_periods?.at(-1);
  const rates = await json(`/v1/rates/${period}`);
  const entries = Array.isArray(rates.body?.entries) ? rates.body.entries : [];
  const rateEntry = entries.find((item) => item.rate_id === 'levy-rate');
  const methodEntry = entries.find((item) => item.rate_id === 'eligible-wages-method');
  // Every check below compares against these two, so an empty listing proves nothing.
  const evidenceListed = rates.response.status === 200
    && isHash(rateEntry?.content_hash) && isHash(methodEntry?.content_hash);
  check('1 discovery', 'GET /v1/rates/{period_uri} lists rate tables with content hashes', evidenceListed);

  // 3. Name what you consumed: the hash must be of the bytes actually served.
  let hashesMatch = evidenceListed;
  for (const item of entries) {
    const served = await json(`/v1/rates/${period}/${item.rate_id}`);
    if (served.response.status !== 200
      || createHash('sha256').update(served.bytes).digest('hex') !== item.content_hash) hashesMatch = false;
  }
  check('3 manifest', 'each declared content hash equals the SHA-256 of the bytes the rate route serves', hashesMatch);

  // 2. Validate, then refuse honestly. 4. Decimal strings. 5. Determinism.
  const post = (periodUrn, body) => json(`/v1/calculators/${CALC}/${periodUrn}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  let computed = 0;
  let refusals = 0;
  let validations = 0;
  let notFound = 0;
  // 4. Every figure a response carries must match the fixed-scale pattern the
  // served OpenAPI declares for it, and the four headline figures must exist.
  const resultSchema = openapi.body?.components?.schemas?.CoalLslLevyResult;
  const headline = ['eligible_wages', 'levy', 'levy_before_rounding', 'rate.value_percent'];
  const valueAt = (node, path) => path.split('.').reduce((value, key) => value?.[key], node);
  const patternAt = (path) => valueAt(resultSchema, `properties.${path.split('.').join('.properties.')}`)?.pattern;
  const computedScalesHold = (body) => headline.every((path) => typeof valueAt(body, path) === 'string')
    && declaredScalesHold(resultSchema, body);
  let decimalStrings = headline.every((path) => typeof patternAt(path) === 'string');
  let manifestComplete = true;
  let advisoryPresent = true;
  const documentedPolicy = openapi.body?.components?.schemas?.CoalLslLevyResult?.properties?.manifest?.properties?.rounding_policy?.const;
  let roundingNamed = typeof documentedPolicy === 'string' && documentedPolicy.length > 0;
  for (const fixture of fixtures.cases) {
    const periodUrn = fixture.period_urn ?? `${fixtures.period_urn_prefix}${fixture.request.reporting_month}`;
    const { response, body, bytes } = await post(periodUrn, fixture.request);
    if (response.status !== fixture.expected_status) {
      check('5 fixture', `${fixture.id} returns ${fixture.expected_status}`, false, `got ${response.status}`);
      continue;
    }
    try {
      matchesExpected(body, fixture.expected);
    } catch (issue) {
      check('5 fixture', `${fixture.id} matches every expected value`, false, issue.message);
    }
    if (response.status === 200) {
      computed += 1;
      if (!computedScalesHold(body)) {
        decimalStrings = false;
      }
      const manifest = body.manifest ?? {};
      if (!(manifest.calculator && manifest.period && manifest.engine?.version
        && Array.isArray(manifest.rate_table_uris) && manifest.rate_table_uris.length > 0
        && manifest.rate_table_uris.every((item) => isHash(item.sha256))
        && isHash(manifest.method?.sha256) && manifest.citation)) manifestComplete = false;
      if (manifest.calculator !== CALC || manifest.period !== periodUrn
        || manifest.rate_table_uris?.[0]?.sha256 !== rateEntry?.content_hash
        || manifest.method?.sha256 !== methodEntry?.content_hash) manifestComplete = false;
      if (manifest.rounding_policy !== documentedPolicy) roundingNamed = false;
      if (!(body.advisory?.figure_type && Array.isArray(body.advisory?.notes) && body.advisory.notes.length)) advisoryPresent = false;
      const repeat = await post(periodUrn, fixture.request);
      if (repeat.response.status !== 200 || !repeat.bytes.equals(bytes)) {
        check('5 determinism', `${fixture.id} repeats byte-identically`, false);
      }
    } else if (response.status === 400) {
      refusals += 1;
      if (!body?.refusal_class || !body?.reason) check('2 refusals', `${fixture.id} carries refusal_class and a reason`, false);
    } else if (response.status === 422) {
      validations += 1;
      if (!body?.field) check('2 refusals', `${fixture.id} names the field that failed`, false);
    } else if (response.status === 404) {
      notFound += 1;
      if (!body?.accepted) check('2 refusals', `${fixture.id} names what the calculator does accept`, false);
    }
  }
  check('5 fixture', `every fixture returns its expected status and values (${fixtures.cases.length} cases)`,
    !results.some((item) => item.section.startsWith('5') && !item.ok));
  check('2 refusals', `the fixture set exercises 200, 400, 422 and 404`,
    computed > 0 && refusals > 0 && validations > 0 && notFound > 0,
    `${computed} computed, ${refusals} refused, ${validations} rejected, ${notFound} not found`);
  check('4 numbers', 'money and rates are decimal strings at the scales the OpenAPI declares, never JSON numbers', computed > 0 && decimalStrings);
  check('3 manifest', 'every 200 carries a complete manifest', computed > 0 && manifestComplete);
  check('3 manifest', 'every 200 names the rounding policy its OpenAPI documents', computed > 0 && roundingNamed, documentedPolicy ?? 'undocumented');
  check('3 manifest', 'every 200 carries an advisory block', computed > 0 && advisoryPresent);

  if (expectedMonth) {
    const expectedPeriod = `${fixtures.period_urn_prefix}${expectedMonth}`;
    check('release', 'the newest advertised period is the expected period',
      period === expectedPeriod, period ?? 'none');
    const fixture = fixtures.cases.find((item) => item.id === 'F1-base-rate-formula-a-wins');
    const { response, body } = await post(expectedPeriod, { ...fixture.request, reporting_month: expectedMonth });
    const manifest = body?.manifest;
    check('release', 'the expected period computes on the expected revision',
      response.status === 200 && computedScalesHold(body)
        && manifest?.calculator === CALC && manifest.period === expectedPeriod
        && manifest.engine?.code_revision === expectedRevision,
      `HTTP ${response.status}, revision ${manifest?.engine?.code_revision ?? 'none'}`);
    const approved = loadRegister();
    const approvedRate = approved.rateFor(expectedMonth);
    const expected = approvedRate && releaseFigures(fixture.expected.eligible_wages, approvedRate.value);
    const mismatch = expected && Object.entries(expected).find(([path, value]) => valueAt(body, path) !== value);
    let detail = expected ? '' : 'no approved rate for this month';
    if (mismatch) {
      const [path, value] = mismatch;
      detail = `${path}: expected ${value}, received ${valueAt(body, path) ?? 'none'}`;
    }
    check('release', 'the expected period returns the expected levy',
      response.status === 200 && expected !== null && !mismatch, detail);
    const citedRate = manifest?.rate_table_uris?.[0];
    check('release', 'the computation cites the expected period’s verified rate and method',
      period === expectedPeriod && rates.body?.period_uri === expectedPeriod && hashesMatch
        && approvedRate !== null && rateEntry?.row_id === approvedRate.row_id
        && rateEntry.content_hash === approved.rateSha256 && methodEntry.content_hash === approved.methodsSha256
        && citedRate?.row_id === rateEntry.row_id
        && citedRate?.uri === rateEntry.uri && citedRate?.sha256 === rateEntry.content_hash
        && manifest?.method?.uri === methodEntry.uri && manifest.method.sha256 === methodEntry.content_hash);
  }

  // 6. Access and cost: limits are declared and enforced.
  check('6 limits', 'discovery declares the body and rate limits',
    Boolean(entry.limits?.max_body_bytes && entry.limits?.requests_per_minute_per_client));
  const oversized = await post(period, { pad: 'x'.repeat((entry.limits?.max_body_bytes ?? 16384) + 1000) });
  check('6 limits', 'an oversized body is refused with 413', oversized.response.status === 413);

  const failed = results.filter((item) => !item.ok);
  for (const item of results) {
    process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'}  ${item.section.padEnd(14)} ${item.name}${item.detail ? `  (${item.detail})` : ''}\n`);
  }
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed against ${base}\n`);
  process.stdout.write('This is a self-check against Ryan\'s reading of the draft standard. It is not a LodgeiT conformance result or a listing.\n');
  return failed.length === 0;
}

// Usage errors exit 2, so they cannot be mistaken for a failed check (exit 1).
let options;
try {
  ({ values: options } = parseArgs({
    options: {
      base: { type: 'string' },
      'expect-month': { type: 'string' },
      'expect-revision': { type: 'string' },
    },
  }));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const { base: target, 'expect-month': expectedMonth, 'expect-revision': expectedRevision } = options;
if (target === '') { console.error('--base needs a URL'); process.exit(2); }
if ((expectedMonth !== undefined || expectedRevision !== undefined)
  && !(target && /^\d{4}-(0[1-9]|1[0-2])$/.test(expectedMonth ?? '')
    && /^[0-9a-f]{40}$/.test(expectedRevision ?? ''))) {
  console.error('A release check requires --base, --expect-month YYYY-MM and --expect-revision with a full Git SHA.');
  process.exit(2);
}
let app = null;
let base = target;
if (base === undefined) {
  app = createApp({ port: 0, log: () => {} });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.server.address().port}`;
}
try {
  process.exit(await run(base, expectedMonth, expectedRevision) ? 0 : 1);
} finally {
  app?.server.close();
}
