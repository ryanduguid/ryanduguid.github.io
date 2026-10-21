import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

test('release history passes when each package includes its latest stable tag', async () => {
  const lookup = async () => [
    release('tool/v0.1.9'), release('tool/v0.1.10'), release('other/v1.0.0'),
  ];
  for (const tags of [
    ['tool/v0.1.9', 'other/v1.0.0', 'tool/v0.1.10'],
    ['tool/v0.1.10', 'other/v1.0.0', 'tool/v0.1.9'],
  ]) {
    assert.deepEqual(await freshness.checkReleases(releaseTable(...tags), lookup), []);
  }
});

test('release history cannot hide a missing stable tag or another package drifting', async () => {
  const failures = await freshness.checkReleases(
    releaseTable('tool/v0.1.8', 'tool/v0.1.10', 'other/v1.0.0'),
    async () => [release('tool/v0.1.10'), release('other/v1.0.0'), release('other/v1.1.0')],
  );
  assert.deepEqual(failures, [
    'ryanduguid/example: tool/v0.1.8 is not a published stable release',
    'ryanduguid/example: other/v1.0.0 is behind other/v1.1.0; review changelog/index.html and capability descriptions',
  ]);
});

test('release history behind the latest tag is reported once, from its newest row', async () => {
  const lookup = async () => [
    release('tool/v0.1.8'), release('tool/v0.1.9'), release('tool/v0.1.10'), release('tool/v0.2.0'),
  ];
  for (const tags of [
    ['tool/v0.1.10', 'tool/v0.1.9', 'tool/v0.1.8'],
    ['tool/v0.1.8', 'tool/v0.1.10', 'tool/v0.1.9'],
  ]) {
    assert.deepEqual(await freshness.checkReleases(releaseTable(...tags), lookup), [
      'ryanduguid/example: tool/v0.1.10 is behind tool/v0.2.0; review changelog/index.html and capability descriptions',
    ]);
  }
});

test('a current tag in another repository cannot satisfy release freshness', async () => {
  const html = releaseTable('tool/v1.0.0').replace('</section>',
    '<a href="https://github.com/ryanduguid/another/releases/tag/tool/v1.1.0">tool/v1.1.0</a></section>');
  assert.deepEqual(await freshness.checkReleases(html, async () => [
    release('tool/v1.0.0'), release('tool/v1.1.0'),
  ]), [
    'ryanduguid/example: tool/v1.0.0 is behind tool/v1.1.0; review changelog/index.html and capability descriptions',
  ]);
});

test('release check refuses a missing published tag or missing release links', async () => {
  assert.deepEqual(await freshness.checkReleases(releaseTable('tool/v1.0.0'), async () => []), [
    'ryanduguid/example: tool/v1.0.0 is not a published stable release',
  ]);
  assert.deepEqual(await freshness.checkReleases('<p>No release links</p>'), [
    'no release links found in changelog/index.html',
  ]);
});

test('release check finds the links in the committed changelog', async () => {
  const html = readFileSync(join(root, 'changelog', 'index.html'), 'utf8');
  const failures = await freshness.checkReleases(html, async () => []);
  assert.ok(failures.length > 0);
  assert.ok(!failures.includes('no release links found in changelog/index.html'));
});

test('release lookup follows pagination and refuses an API failure', async () => {
  const requests = [];
  const releases = await freshness.fetchReleases('ryanduguid/example', (command, args, options) => {
    assert.equal(command, 'gh');
    assert.equal(options.encoding, 'utf8');
    assert.equal(options.timeout, 15_000);
    requests.push(args);
    return JSON.stringify(requests.length === 1
      ? Array.from({ length: 100 }, () => release('other/v1.0.0'))
      : [release('tool/v1.1.0')]);
  });
  assert.equal(releases.length, 101);
  assert.equal(releases.at(-1).tag_name, 'tool/v1.1.0');
  assert.deepEqual(requests, [
    ['api', 'repos/ryanduguid/example/releases?per_page=100&page=1',
      '--jq', 'map({tag_name, draft, prerelease, published_at})'],
    ['api', 'repos/ryanduguid/example/releases?per_page=100&page=2',
      '--jq', 'map({tag_name, draft, prerelease, published_at})'],
  ]);
  for (const message of ['GitHub HTTP 403', 'gh authentication required', 'spawnSync gh ETIMEDOUT']) {
    await assert.rejects(freshness.fetchReleases('ryanduguid/example', () => {
      throw new Error(message);
    }), { message });
  }
});

test('release lookup refuses malformed data and accepts an empty release list', async () => {
  await assert.rejects(freshness.fetchReleases('ryanduguid/example', () => 'not JSON'), SyntaxError);
  await assert.rejects(freshness.fetchReleases('ryanduguid/example', () => '{}'), /Invalid release list/);
  assert.deepEqual(await freshness.fetchReleases('ryanduguid/example', () => '[]'), []);
});

test('release check leaves historical references outside the current table alone', async () => {
  const html = releaseTable('v1.2.0') +
    '<p>Earlier evaluation: <a href="https://github.com/ryanduguid/example/releases/tag/v1.1.0">v1.1.0</a></p>';
  assert.deepEqual(await freshness.checkReleases(html, async () => [release('v1.2.0'), release('v1.1.0')]), []);
});

function toolPage(pinned, extra = '') {
  return [
    '<p class="release-meta">Reference release ',
    `<a href="https://github.com/ryanduguid/example/releases/tag/tool/${pinned}">tool/${pinned}</a>, tagged source.</p>`,
    extra,
  ].join('');
}

test('a tool page may pin an older release only if it names the current one', async () => {
  const lookup = async () => [release('tool/v1.2.0'), release('tool/v1.1.0')];
  assert.deepEqual(await freshness.checkToolReleases([['tools/a/index.html', toolPage('v1.2.0')]], lookup), []);
  assert.deepEqual(await freshness.checkToolReleases([
    ['tools/a/index.html', toolPage('v1.1.0', '<p>The current release is tool/v1.2.0.</p>')],
  ], lookup), []);
  assert.deepEqual(await freshness.checkToolReleases([['tools/a/index.html', toolPage('v1.1.0')]], lookup), [
    'tools/a/index.html: pins tool/v1.1.0 but does not name the current release tool/v1.2.0',
  ]);
  assert.deepEqual(await freshness.checkToolReleases([['tools/b/index.html', '<p>No release-meta here</p>']], lookup), []);
});

// The workflow opens a drift issue on exit 1 only, so an outage must not share
// that code. With PATH holding only an empty directory, gh cannot be found and
// the lookup fails before any request. (Dropping PATH is not enough: on Windows
// the child then searches the parent's PATH.)
test('a release check that cannot reach gh exits 2, not 1', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH'));
  env.PATH = mkdtempSync(join(tmpdir(), 'no-gh-'));
  let result;
  try {
    result = spawnSync(process.execPath, [join(root, 'scripts', 'stamp-source-freshness.mjs'), '--check-releases'], {
      cwd: root, env, encoding: 'utf8', timeout: 15_000,
    });
  } finally {
    rmSync(env.PATH, { recursive: true, force: true });
  }
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /ENOENT/);
});

test('tool release snapshot selects published stable package tags in Sydney time', async () => {
  const tools = { a: { repository: 'owner/repo', tagPrefix: 'a/v' }, b: { repository: 'owner/repo', tagPrefix: 'b/v' } };
  let calls = 0;
  const lookup = async () => { calls += 1; return [
    { tag_name: 'a/v0.9.0', published_at: '2026-10-19T14:00:00Z' },
    { tag_name: 'a/v0.10.0', published_at: '2026-10-19T14:00:00Z' },
    { tag_name: 'a/v1.0.0', published_at: '2026-10-19T14:00:00Z', draft: true },
    { tag_name: 'a/v2.0.0', published_at: '2026-10-19T14:00:00Z', prerelease: true },
    { tag_name: 'b/v3.5.0', published_at: '2026-10-19T08:00:00Z' },
  ]; };
  const data = await freshness.buildToolReleaseData(tools, lookup);
  assert.equal(calls, 1);
  assert.equal(data.a.version, '0.10.0');
  assert.equal(data.a.date, '2026-10-20');
  assert.equal(data.b.date, '2026-10-19');
  await assert.rejects(freshness.buildToolReleaseData({ absent: { repository: 'owner/repo', tagPrefix: 'absent/v' } }, lookup), /no published stable release/);
});

test('metadata stamping preserves pinned examples whilst replacing current product metadata', () => {
  const source = '<p>Worked example v0.1.3</p><script type="application/ld+json">' + JSON.stringify({ '@graph': [
    { '@type': 'TechArticle', dateModified: '2026-10-21' },
    { '@type': 'SoftwareApplication', name: 'Old name', offers: { '@type': 'Offer', price: '0' } },
  ] }) + '</script>';
  const stamped = freshness.stampToolMetadata(source, { name: 'Tool', alternateName: ['old'], codeRepository: 'https://example.com/source', sameAs: ['https://pypi.org/project/tool/'] },
    { version: '0.2.2', date: '2026-10-20' });
  assert.ok(stamped.includes('Worked example v0.1.3'));
  assert.ok(!stamped.includes('Offer'));
  assert.ok(stamped.includes('SoftwareSourceCode'));
  const stampedGraph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(stamped)[1])['@graph'];
  assert.equal(stampedGraph[0].dateModified, '2026-10-21');
  assert.equal(stampedGraph[1].dateModified, '2026-10-20');
  const sitemap = '<loc>https://example.com/tool/</loc><lastmod>2026-09-01</lastmod>';
  assert.equal(freshness.stampToolSitemap(sitemap, 'https://example.com/tool/', stamped),
    '<loc>https://example.com/tool/</loc><lastmod>2026-10-21</lastmod>');
  assert.deepEqual(stampedGraph[1].sameAs, ['https://pypi.org/project/tool/']);
  const cleared = freshness.stampToolMetadata(stamped, { name: 'Tool', alternateName: [], codeRepository: 'https://example.com/source', sameAs: [] }, { version: '0.2.2', date: '2026-10-20' });
  const clearedGraph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(cleared)[1])['@graph'];
  assert.equal(Object.hasOwn(clearedGraph[1], 'sameAs'), false);
});

test('sitemap refresh rejects missing or inconsistent document dates', () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({ '@graph': [
    { '@type': 'WebPage', dateModified: '2026-10-20' },
    { '@type': 'TechArticle', dateModified: '2026-10-21' },
  ] }) + '</script>';
  assert.throws(() => freshness.stampToolSitemap('', 'https://example.com/tool/', html), /one document modification date/);
  assert.throws(() => freshness.stampToolSitemap('', 'https://example.com/tool/', ''), /one document modification date/);
});

test('MCP index refresh changes only the current release', () => {
  const index = '[Aus Accounting MCP](https://duguid.com.au/tools/australian-tax-ai-agents/): local MCP server, current release v0.5.0 (1 October 2026). Pinned example v0.2.8.';
  const updated = freshness.stampMcpIndex(index, { version: '0.6.0', dateLabel: '20 October 2026' });
  assert.ok(updated.includes('current release v0.6.0 (20 October 2026)'));
  assert.ok(updated.includes('Pinned example v0.2.8'));
});

test('calculator identity uses the newest implementing file, including its page adapter', () => {
  const paths = [];
  const revision = freshness.buildCalculatorRevision((command, args, options) => {
    assert.equal(command, 'gh');
    assert.equal(options.timeout, 15_000);
    const path = new URL(args[1], 'https://api.github.com/').searchParams.get('path');
    paths.push(path);
    return JSON.stringify(path === 'assets/levy-page.mjs'
      ? { sha: 'new-adapter', date: '2026-10-19T12:33:50Z' }
      : { sha: 'old-core', date: '2026-09-27T00:00:00Z' });
  });
  assert.deepEqual(paths, ['assets/levy.mjs', 'assets/levy-form.mjs', 'assets/levy-page.mjs', 'assets/levy-explanation.mjs']);
  assert.deepEqual(revision, { sha: 'new-adapter', date: '2026-10-19T12:33:50Z' });
});
