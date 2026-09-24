import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { classify, collectSources, extractUrls, MAX_URLS, sameUrl } from './check_ato_sources.mjs';

const PAGE = 'https://www.ato.gov.au/tax-rates-and-codes/general-interest-charge-rates';
const ok = (changeStatus, extra = {}) => ({
  metadata: { statusCode: 200, sourceURL: PAGE, url: PAGE },
  changeTracking: { changeStatus, previousScrapeAt: '2026-09-21T06:00:00Z', ...extra },
});

test('URLs are cleaned of entities, fragments and trailing punctuation', () => {
  const text = `<a href="${PAGE}#rates">GIC</a>. See ${PAGE}. Or https://www.ato.gov.au/law/view/document?a=1&amp;b=2`;
  assert.deepEqual(extractUrls(text), [PAGE, 'https://www.ato.gov.au/law/view/document?a=1&b=2']);
});

test('a CSV row yields each URL separately', () => {
  assert.deepEqual(extractUrls(`${PAGE},2026-09-22,https://www.ato.gov.au/rental`), [PAGE, 'https://www.ato.gov.au/rental']);
});

test('templates are skipped and percent-encoding is kept', () => {
  const encoded = 'https://www.ato.gov.au/law/view/document?DocID=COG%2FLCR20262%2FNAT%2FATO%2F00001';
  const text = `f"https://www.ato.gov.au/{slug}" "https://www.ato.gov.au/%s/text" ${encoded}`;
  assert.deepEqual(extractUrls(text), [encoded]);
});

test('sources skip generated output, tests and test files', () => {
  const root = mkdtempSync(join(tmpdir(), 'ato-sources-'));
  for (const dir of ['rates', '_site', 'tests', 'scripts']) mkdirSync(join(root, dir));
  writeFileSync(join(root, 'rates', 'index.html'), `<a href="${PAGE}">GIC</a>`);
  writeFileSync(join(root, '_site', 'index.html'), 'https://www.ato.gov.au/generated');
  writeFileSync(join(root, 'tests', 'fixture.json'), '"https://www.ato.gov.au/fixture"');
  writeFileSync(join(root, 'scripts', 'test_links.py'), '"https://www.ato.gov.au/test-file"');
  const sources = collectSources([root]);
  assert.deepEqual([...sources.keys()], [PAGE]);
  assert.match(sources.get(PAGE)[0], /\/rates\/index\.html$/);
});

test('unchanged and first-seen pages pass silently', () => {
  assert.deepEqual(classify(PAGE, ok('same')), {});
  assert.deepEqual(classify(PAGE, ok('new')), {});
});

test('a changed page fails and carries its diff', () => {
  const result = classify(PAGE, ok('changed', { diff: { text: '-7.17%\n+7.42%' } }));
  assert.match(result.failure, /changed since 2026-09-21/);
  assert.equal(result.diff, '-7.17%\n+7.42%');
});

test('error statuses, removed pages and missing results fail', () => {
  const missing = { ...ok('same'), metadata: { statusCode: 404, sourceURL: PAGE } };
  assert.match(classify(PAGE, missing).failure, /HTTP 404/);
  assert.match(classify(PAGE, ok('removed')).failure, /removed/);
  assert.match(classify(PAGE, undefined).failure, /could not read/);
  assert.match(classify(PAGE, { metadata: { statusCode: 200 } }).failure, /no change tracking/);
});

test('a redirect that still resolves is a note, not a failure', () => {
  const moved = { ...ok('same'), metadata: { statusCode: 200, sourceURL: PAGE, url: `${PAGE}-2026` } };
  assert.deepEqual(classify(PAGE, moved), { note: `${PAGE}: now resolves to ${PAGE}-2026` });
});

test('a redirect that only drops the trailing slash is silent', () => {
  const slashed = 'https://www.ato.gov.au/tax-rates-and-codes/';
  const doc = { ...ok('same'), metadata: { statusCode: 200, sourceURL: slashed, url: slashed.slice(0, -1) } };
  assert.deepEqual(classify(slashed, doc), {});
});

test('an echoed URL with other encoding still matches', () => {
  assert.equal(sameUrl('https://www.ato.gov.au/a?docid=%22x%22'), sameUrl('https://www.ato.gov.au/a?docid="x"'));
});

test('the approved cap stays at 200 pages', () => {
  assert.equal(MAX_URLS, 200);
});
