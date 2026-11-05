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
  const [, ...message] = read('../docs/listing-request-draft.md').split('To: ');
  const body = message.join('');
  assert.doesNotMatch(body, /\b\d+ synthetic cases/);
  assert.doesNotMatch(body, /\b(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/);
});
