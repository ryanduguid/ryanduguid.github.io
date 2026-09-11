import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as freshness from './stamp-source-freshness.mjs';
const { checkHtml, formatDate, stampHtml } = freshness;

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

test('the site repository card is dated from the calculator, not the repo root', () => {
  // Dating it from the root would credit the calculator with unrelated copy
  // edits, and this workflow's own commits would restamp it every week.
  const asked = [];
  const stamped = stampHtml(
    card('https://github.com/ryanduguid/ryanduguid.github.io'),
    (owner, repo, path) => {
      asked.push(path);
      return path === 'assets/levy-form.mjs' ? '2026-09-04' : '2026-09-01';
    },
  );
  assert.deepEqual(asked, [
    'assets/levy.mjs',
    'assets/levy-form.mjs',
    'assets/levy-page.mjs',
    'assets/levy-explanation.mjs',
  ]);
  // The newest of the calculator files wins.
  assert.match(stamped, /<time datetime="2026-09-04">4 September 2026<\/time>/);
});

test('check fails when a card drifts out of the stamped set', () => {
  const drifted = [
    stampHtml(fixture, () => '2026-09-02'),
    '            <div class="collection-entry">',
    '              <p class="entry-links"><a href="https://github.com/ryanduguid/x">Source</a></p>',
    '            </div>',
  ].join('\n');
  assert.deepEqual(checkHtml(drifted, '2026-09-05'), [
    '3 tool cards but 2 carry a links row; a card has drifted out of the stamped set',
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

function releaseTable(...tags) {
  return '<section aria-labelledby="tool-releases">' + tags.map((tag) =>
    `<a href="https://github.com/ryanduguid/example/releases/tag/${tag}">${tag}</a>`).join('') + '</section>';
}

function release(tag_name, overrides = {}) {
  return { tag_name, draft: false, prerelease: false, published_at: '2026-09-10T00:00:00Z', ...overrides };
}

test('release check flags a newer stable version within each package', async () => {
  const html = releaseTable('tool/v0.1.9', 'other/v1.0.0');
  const failures = await freshness.checkReleases(html, async () => [
    release('tool/v0.1.9'), release('tool/v0.1.10'), release('other/v1.0.0'),
    release('tool/v0.2.0', { prerelease: true }),
    release('tool/v0.3.0', { draft: true }),
    release('tool/v0.4.0', { published_at: null }),
    release('tool/v0.5.0-rc.1'),
  ]);
  assert.deepEqual(failures, [
    'ryanduguid/example: tool/v0.1.9 is behind tool/v0.1.10; review changelog/index.html and capability descriptions',
  ]);
});

test('release check accepts current plain tags and ignores unrelated packages', async () => {
  const failures = await freshness.checkReleases(releaseTable('v1.2.0'), async () => [
    release('v1.2.0'), release('v1.1.0', { published_at: '2026-09-11T00:00:00Z' }),
    release('other/v9.0.0'),
  ]);
  assert.deepEqual(failures, []);
});

test('release check refuses a missing published tag or missing release links', async () => {
  assert.deepEqual(await freshness.checkReleases(releaseTable('tool/v1.0.0'), async () => []), [
    'ryanduguid/example: tool/v1.0.0 is not a published stable release',
  ]);
  assert.deepEqual(await freshness.checkReleases('<p>No release links</p>'), [
    'no release links found in changelog/index.html',
  ]);
});

test('release lookup follows pagination and refuses an API failure', async () => {
  const requests = [];
  const releases = await freshness.fetchReleases('ryanduguid/example', async (url) => {
    requests.push(url);
    return new Response(JSON.stringify(requests.length === 1
      ? Array.from({ length: 100 }, () => release('other/v1.0.0'))
      : [release('tool/v1.1.0')]), { status: 200 });
  });
  assert.equal(releases.at(-1).tag_name, 'tool/v1.1.0');
  assert.deepEqual(requests, [
    'https://api.github.com/repos/ryanduguid/example/releases?per_page=100&page=1',
    'https://api.github.com/repos/ryanduguid/example/releases?per_page=100&page=2',
  ]);
  await assert.rejects(freshness.fetchReleases('ryanduguid/example', async () =>
    new Response('Rate limited', { status: 403 })), /GitHub release lookup failed.*403/);
});

test('release check leaves historical references outside the current table alone', async () => {
  const html = releaseTable('v1.2.0') +
    '<p>Earlier evaluation: <a href="https://github.com/ryanduguid/example/releases/tag/v1.1.0">v1.1.0</a></p>';
  assert.deepEqual(await freshness.checkReleases(html, async () => [release('v1.2.0'), release('v1.1.0')]), []);
});
