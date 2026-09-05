import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { checkHtml, formatDate, stampHtml } from './stamp-source-freshness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// A card in the shape tools/index.html uses. The stamp belongs on the links
// paragraph, so that is where the fixture puts an existing one.
function card(href, stamp = '', evaluation = '') {
  return [
    '            <div class="collection-entry">',
    '              <h3><a class="collection-entry__title" href="/tools/x/">X</a></h3>',
    '              <dl>',
    '                <div><dt>Delivery</dt><dd>Python</dd></div>',
    '                <div><dt>Boundary</dt><dd>Review aid.</dd></div>',
    '              </dl>',
    `              <p class="collection-entry__links"><a href="${href}">Source repository</a>${evaluation}${stamp}</p>`,
    '            </div>',
  ].join('\n');
}

const MONOREPO =
  'https://github.com/ryanduguid/australian-accounting/tree/main/packages/payday-super-checker';
const WHOLE_REPO = 'https://github.com/ryanduguid/australian-accounting-skills';
const EVALUATION = '<a href="/evaluate/payday-super-evidence/">Reproduce the evaluation</a>';

const fixture = `${card(MONOREPO, '', EVALUATION)}\n${card(WHOLE_REPO)}`;

test('formatDate writes the site date style', () => {
  assert.equal(formatDate('2026-09-02'), '2 September 2026');
  assert.equal(formatDate('2026-12-25'), '25 December 2026');
});

test('each card is looked up by its own repository and path', () => {
  const asked = [];
  stampHtml(fixture, (owner, repo, path) => {
    asked.push([owner, repo, path]);
    return '2026-09-02';
  });
  assert.deepEqual(asked, [
    ['ryanduguid', 'australian-accounting', 'packages/payday-super-checker'],
    ['ryanduguid', 'australian-accounting-skills', undefined],
  ]);
});

test('stamping adds one stamp per card and keeps the links', () => {
  const stamped = stampHtml(fixture, () => '2026-09-02');
  assert.equal(stamped.match(/collection-entry__stamp/g).length, 2);
  assert.match(
    stamped,
    /<span class="collection-entry__stamp">Last commit <time datetime="2026-09-02">2 September 2026<\/time><\/span><\/p>/,
  );
  assert.match(stamped, /<a href="[^"]*payday-super-checker">Source repository<\/a>/);
  assert.match(stamped, /Reproduce the evaluation/);
});

test('the stamp rides the links row and adds no card row', () => {
  // tests/browser/site-quality.spec.mjs holds /tools/ to a page-length budget.
  // A row per card breaches it, so the stamp must not become one.
  const stamped = stampHtml(fixture, () => '2026-09-02');
  assert.doesNotMatch(stamped, /<dt>Last commit<\/dt>/);
  assert.equal(stamped.split('\n').length, fixture.split('\n').length);
});

test('restamping replaces the old date instead of stacking stamps', () => {
  const first = stampHtml(fixture, () => '2026-09-02');
  const second = stampHtml(first, () => '2026-09-04');
  assert.equal(second.match(/collection-entry__stamp/g).length, 2);
  assert.doesNotMatch(second, /2 September 2026/);
  assert.match(second, /4 September 2026/);
  // An unchanged run is a byte-identical no-op, so the scheduled workflow only
  // opens a pull request when a date actually moved.
  assert.equal(stampHtml(second, () => '2026-09-04'), second);
});

test('a stamped page passes its own check', () => {
  const stamped = stampHtml(fixture, () => '2026-09-02');
  assert.deepEqual(checkHtml(stamped, '2026-09-05'), []);
});

test('check rejects a missing, mistyped or future stamp', () => {
  assert.deepEqual(checkHtml(fixture, '2026-09-05'), [
    'ryanduguid/australian-accounting/packages/payday-super-checker: no last-commit stamp',
    'ryanduguid/australian-accounting-skills: no last-commit stamp',
  ]);

  const mistyped = card(
    WHOLE_REPO,
    '<span class="collection-entry__stamp">Last commit <time datetime="2026-09-02">2 August 2026</time></span>',
  );
  assert.deepEqual(checkHtml(mistyped, '2026-09-05'), [
    'ryanduguid/australian-accounting-skills: stamp reads "2 August 2026", expected "2 September 2026"',
  ]);

  const future = stampHtml(card(WHOLE_REPO), () => '2026-09-09');
  assert.deepEqual(checkHtml(future, '2026-09-05'), [
    'ryanduguid/australian-accounting-skills: stamp date 2026-09-09 is in the future',
  ]);
});

test('check fails loudly if the card markup stops matching', () => {
  assert.deepEqual(checkHtml('<p>no cards here</p>', '2026-09-05'), [
    'no tool cards matched; the card markup has changed',
  ]);
});

test('the committed tools register is stamped and consistent', () => {
  const html = readFileSync(join(root, 'tools', 'index.html'), 'utf8');
  assert.deepEqual(checkHtml(html), []);
});
