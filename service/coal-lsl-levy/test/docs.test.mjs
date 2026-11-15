import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadRegister } from '../src/load-register.mjs';
import { buildOpenApi } from '../src/openapi.mjs';
import { DEFAULTS } from '../src/server.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const { cases } = JSON.parse(read('../fixtures/cases.json'));
const tally = (status) => cases.filter((fixture) => fixture.expected_status === status).length;

test('the README counts the fixtures as they stand', () => {
  const words = read('../README.md').replace(/\s+/g, ' ');
  assert.ok(words.includes(`[${cases.length} synthetic fixtures](fixtures/cases.json) cover ${tally(200)} computed results, `
    + `${tally(400)} factual refusals, ${tally(422)} validation failures and ${tally(404)} unsupported periods.`), 'README fixture sentence');
});

test('the listing template states no fixture count or month range that can go stale', () => {
  const template = read('../docs/listing-request-draft.md');
  const recipient = template.match(/^To: \S.*$/m);
  assert.ok(recipient, 'the template holds a message with a recipient line');
  const body = template.slice(recipient.index).replace(/\s+/g, ' ');
  for (const field of [
    'verified deployed URL', 'published source revision', 'date and result',
    'fixture count', 'computed count', 'first and last supported months',
  ]) assert.ok(body.includes(`[insert ${field}]`), field);
  assert.doesNotMatch(body, /\b\d+ synthetic cases/);
  assert.doesNotMatch(body, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[.,]?\s*20\d\d\b/i);
  assert.doesNotMatch(body, /\b20\d\d-(0[1-9]|1[0-2])\s*(to|through|until|[-\u2010-\u2015\u2212]|\.\.)\s*20\d\d-(0[1-9]|1[0-2])\b/i);
});

// The site's Coal LSL page and llms.txt link the deployed API. Every path they give at
// the README's base URL must be a route this OpenAPI document declares, and both must
// give the listing and the document itself.
test('the site documents only routes the OpenAPI document declares', () => {
  const base = read('../README.md').match(/<(https:\/\/[a-z0-9.-]+\.workers\.dev)>/)[1];
  const routes = Object.keys(buildOpenApi({ ...DEFAULTS, codeRevision: 'test' }, loadRegister()).paths);
  for (const file of ['../../../tools/coal-lsl-levy/index.html', '../../../llms.txt']) {
    const documented = read(file).split(base).slice(1).map((rest) => rest.match(/^[^\s"'<>`)]*/)[0]);
    for (const path of documented.filter(Boolean)) assert.ok(routes.includes(path), `${file}: ${path}`);
    for (const path of ['/v1/calculators', '/openapi.json']) assert.ok(documented.includes(path), `${file}: ${path}`);
  }
});
