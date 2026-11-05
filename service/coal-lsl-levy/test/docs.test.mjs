import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const { cases } = JSON.parse(read('../fixtures/cases.json'));
const tally = (status) => cases.filter((fixture) => fixture.expected_status === status).length;

test('the README counts the fixtures as they stand', () => {
  const words = read('../README.md').replace(/\s+/g, ' ');
  assert.ok(words.includes(`[${cases.length} synthetic fixtures](fixtures/cases.json) cover ${tally(200)} computed results, `
    + `${tally(400)} factual refusals, ${tally(422)} validation failures and ${tally(404)} unsupported periods.`), 'README fixture sentence');
});

test('the listing template states no fixture count or month range that can go stale', () => {
  const template = read('../docs/listing-request-draft.md').replace(/\s+/g, ' ');
  const start = template.indexOf('To: ');
  assert.notEqual(start, -1, 'the template holds a message');
  const body = template.slice(start);
  for (const field of [
    'verified deployed URL', 'published source revision', 'date and result',
    'fixture count', 'computed count', 'first and last supported months',
  ]) assert.ok(body.includes(`[insert ${field}]`), field);
  assert.doesNotMatch(body, /\b\d+ synthetic cases/);
  assert.doesNotMatch(body, /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* 20\d\d\b/);
  assert.doesNotMatch(body, /\b20\d\d-(0[1-9]|1[0-2])\s*(to|through|until|-|\u2013|\.\.)\s*20\d\d-(0[1-9]|1[0-2])\b/);
});
