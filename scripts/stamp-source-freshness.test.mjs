import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { checkHtml, formatDate, stampHtml } from './stamp-source-freshness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Two cards in the shape tools/index.html uses: one package inside a monorepo,
// one whole repository.
function card(href, rows = '') {
  return [
    '            <div class="collection-entry">',
    '              <h3><a class="collection-entry__title" href="/tools/x/">X</a></h3>',
    '              <dl>',
    '                <div><dt>Delivery</dt><dd>Python</dd></div>',
    '                <div><dt>Boundary</dt><dd>Review aid.</dd></div>',
    rows,
    '              </dl>',
    `              <p class="collection-entry__links"><a href="${href}">Source repository</a></p>`,
    '            </div>',
  ].filter((line) => line !== '').join('\n');
}

const MONOREPO =
  'https://github.com/ryanduguid/australian-accounting/tree/main/packages/payday-super-checker';
const WHOLE_REPO = 'https://github.com/ryanduguid/australian-accounting-skills';

const fixture = `${card(MONOREPO)}\n${card(WHOLE_REPO)}`;

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

test('stamping adds one row per card and keeps the existing rows', () => {
  const stamped = stampHtml(fixture, () => '2026-09-02');
  const rows = stamped.match(/<dt>Last commit<\/dt>/g);
  assert.equal(rows.length, 2);
  assert.match(
    stamped,
    /<div><dt>Last commit<\/dt><dd><time datetime="2026-09-02">2 September 2026<\/time><\/dd><\/div>/,
  );
  assert.match(stamped, /<dt>Delivery<\/dt>/);
  assert.match(stamped, /<dt>Boundary<\/dt>/);
  // The row lines up with the rows already in the card.
  assert.match(stamped, /\n {16}<div><dt>Last commit<\/dt>/);
});

test('restamping replaces the old date instead of stacking rows', () => {
  const first = stampHtml(fixture, () => '2026-09-02');
  const second = stampHtml(first, () => '2026-09-04');
  assert.equal(second.match(/<dt>Last commit<\/dt>/g).length, 2);
  assert.doesNotMatch(second, /2 September 2026/);
  assert.match(second, /4 September 2026/);
  // Stamping the same dates again is a no-op, so the scheduled run only ever
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
    '                <div><dt>Last commit</dt><dd><time datetime="2026-09-02">2 August 2026</time></dd></div>',
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
