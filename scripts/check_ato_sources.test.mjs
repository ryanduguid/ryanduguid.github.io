import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  answersToRecheck, baselineFile, classify, collectSources, collectValues, exitCode, extractUrls, followRedirects, isIsoDate, lastUpdated, lineDiff, readPages,
  renderIssue, renderReport, sameUrl, saveResults, sortMoves, tidy, WATCHED,
} from './check_ato_sources.mjs';

const PAGE = 'https://www.ato.gov.au/tax-rates-and-codes/general-interest-charge-rates';
const TEXT = 'General interest charge rates\nThe rate for the December quarter is 11.17%.\nThe rate for the September quarter is 11.36%.';
const page = (text = TEXT, extra = {}) => ({ status: 200, finalUrl: PAGE, truncated: false, text, ...extra });

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

test('sources include Rust data files', () => {
  const root = mkdtempSync(join(tmpdir(), 'ato-rust-'));
  writeFileSync(join(root, 'check_links_data.rs'), `pub const URLS: [&str; 1] = ["${PAGE}"];`);
  assert.match(collectSources([root]).get(PAGE)[0], /\/check_links_data\.rs$/);
});

test('sources skip generated output, tests and test files', () => {
  const root = mkdtempSync(join(tmpdir(), 'ato-sources-'));
  for (const dir of ['rates', '_site', 'tests', 'scripts']) mkdirSync(join(root, dir));
  writeFileSync(join(root, 'rates', 'index.html'), `<a href="${PAGE}">GIC</a>`);
  writeFileSync(join(root, '_site', 'index.html'), 'https://www.ato.gov.au/generated');
  writeFileSync(join(root, 'tests', 'fixture.json'), '"https://www.ato.gov.au/fixture"');
  writeFileSync(join(root, 'scripts', 'test_links.py'), '"https://www.ato.gov.au/test-file"');
  const sources = collectSources([root]);
  assert.deepEqual([...sources.keys()].filter((url) => !WATCHED.has(url)), [PAGE]);
  assert.match(sources.get(PAGE)[0], /\/rates\/index\.html$/);
});

const LEVY = 'https://coallsl.com.au/employer/administer-lsl/levy';

test('a watched page is found only as a whole URL', () => {
  assert.deepEqual(extractUrls(`<a href="${LEVY}">levy</a>. See ${LEVY}.`), [LEVY]);
  assert.deepEqual(extractUrls(`${LEVY}/history ${LEVY}-rates https://coallsl.com.au/employer`), []);
});

test('watched pages are read even when nothing cites them, and their values are traced', () => {
  const root = mkdtempSync(join(tmpdir(), 'ato-watched-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'levy.mjs'), 'export const NOTE = "2.7% of eligible wages";');
  writeFileSync(join(root, 'index.html'), `<a href="${LEVY}">The levy is 2.7%</a>`);
  const sources = collectSources([root]);
  for (const url of WATCHED.keys()) assert.ok(sources.has(url), url);
  assert.deepEqual(sources.get(LEVY).map((path) => path.split('/').pop()), ['index.html']);
  assert.deepEqual(sources.get([...WATCHED.keys()][1]), []);
  const values = collectValues([root]);
  assert.deepEqual(values.get('2.7%').map((path) => path.split('/').slice(1).join('/')).sort(), ['assets/levy.mjs', 'index.html']);
  assert.deepEqual(values.get('5.45%'), []);
});

test('a first-seen page passes and its text becomes the baseline', () => {
  const result = classify(PAGE, page());
  assert.equal(result.failure, undefined);
  assert.equal(result.text, TEXT);
});

test('a page matching its baseline passes whatever the spacing', () => {
  const respaced = page(`${TEXT.replace('rate for', 'rate\u00a0for')}  \n\n\n`);
  assert.equal(classify(PAGE, respaced, TEXT).failure, undefined);
});

test('a changed page fails, carries its diff and moves the baseline on', () => {
  const now = TEXT.replace('11.17%', '11.42%');
  const result = classify(PAGE, page(now), TEXT);
  assert.match(result.failure, /changed since the previous run/);
  assert.equal(result.change.substantive, true);
  assert.equal(result.change.diff, '- The rate for the December quarter is 11.17%.\n+ The rate for the December quarter is 11.42%.');
  assert.equal(result.text, now);
});

test('a change confined to counters, link labels and the Last updated stamp passes and says why', () => {
  const ruling = 'https://www.ato.gov.au/law/view/document?DocID=TXR/TR20234/NAT/ATO/00001';
  const counted = classify(ruling, page(`${TEXT}\n138 related documents`, { finalUrl: ruling }), `${TEXT}\n139 related documents`);
  assert.equal(counted.failure, undefined);
  assert.equal(counted.change.reason, 'only the related documents count changed');
  assert.equal(counted.text, `${TEXT}\n138 related documents`);
  const before = `Last updated 4 June 2025\n${TEXT}\nPEXA guide Opens in a new window\nOpens in a new window\nShowing 1 - 10 of 32`;
  const after = `Last updated 14 October 2026\n${TEXT}\nPEXA guide External Link\nExternal Link\nExternal Link\nShowing 1 - 10 of 33`;
  const relabelled = classify(PAGE, page(after), before);
  assert.equal(relabelled.failure, undefined);
  assert.equal(relabelled.change.reason, 'only the result count, external link label and Last updated stamp changed');
});

test('a Last updated stamp is a hint beside a real change, and link labels never hide one', () => {
  const before = `Last updated 4 June 2025\n${TEXT}\nSee the PEXA guide Opens in a new window`;
  const after = `Last updated 14 October 2026\n${TEXT}\nSee the e-conveyancing guide External Link`;
  const { failure, change } = classify(PAGE, page(after), before);
  assert.match(failure, /changed since/);
  assert.equal(change.hint, 'Last updated moved from 4 June 2025 to 14 October 2026.');
  assert.equal(change.diff, '- See the PEXA guide\n+ See the e-conveyancing guide');
  const colon = classify(PAGE, page(after.replace('Last updated', 'Last updated:')), before.replace('Last updated', 'Last updated:'));
  assert.equal(colon.change.hint, 'Last updated moved from 4 June 2025 to 14 October 2026.');
});

test('hubs, newsrooms and single-page applications change without review, judged by the cited URL', () => {
  const article = 'https://www.ato.gov.au/tax-and-super-professionals/for-superannuation-professionals/super-funds-newsroom/business-days-decoded';
  const cases = [
    ['https://www.ato.gov.au/', undefined, /hub page/],
    ['https://www.ato.gov.au/tax-rates-and-codes/', undefined, /hub page/],
    ['https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom/', undefined, /newsroom/],
    ['https://www.ato.gov.au/single-page-applications/calculatorsandtools?anchor=DIV7A', undefined, /single-page application/],
  ];
  for (const [url, finalUrl, reason] of cases) {
    const { failure, change } = classify(url, page(`${TEXT}\nNew tile`, { finalUrl: finalUrl ?? url }), TEXT);
    assert.equal(failure, undefined, url);
    assert.match(change.reason, reason, url);
  }
  assert.match(classify(PAGE, page(`${TEXT}\nNew tile`), TEXT).failure, /changed since/);
  // A cited article that now lands on its newsroom needs review, whatever the redirect.
  const landed = classify(article, page(`${TEXT}\nNew tile`, { finalUrl: article.replace(/\/[^/]+$/, '') }), TEXT);
  assert.match(landed.failure, /changed since/);
  assert.match(landed.note, /now resolves to/);
});

test('only a bare Last updated stamp is noise', () => {
  const before = `Last updated 1 July 2026\n${TEXT}`;
  assert.equal(classify(PAGE, page(`Last updated: 2 July 2026\n${TEXT}`), before).failure, undefined);
  const after = `Last updated 2 July 2026 - the rate is now 7%\n${TEXT}`;
  assert.match(classify(PAGE, page(after), before).failure, /changed since/);
});

test('the legal database home may change, but other law pages may not', () => {
  const home = 'https://www.ato.gov.au/single-page-applications/legaldatabase';
  assert.equal(classify(home, page(`${TEXT} and more`, { finalUrl: home }), TEXT).failure, undefined);
  assert.match(classify(home, page(TEXT, { finalUrl: home, status: 404 }), TEXT).failure, /HTTP 404/);
  const ruling = 'https://www.ato.gov.au/law/view/document?DocID=DPC/PCG2026D3/NAT/ATO/00001';
  assert.match(classify(ruling, page(`${TEXT} and more`, { finalUrl: ruling }), TEXT).failure, /changed since/);
});

test('errors, bad statuses, empty text, cut-off text and missing results fail', () => {
  assert.match(classify(PAGE, { error: 'navigation timed out' }).failure, /timed out/);
  assert.match(classify(PAGE, page(TEXT, { status: 404 })).failure, /HTTP 404/);
  assert.match(classify(PAGE, page(TEXT, { status: undefined })).failure, /HTTP unknown/);
  assert.match(classify(PAGE, page('Menu')).failure, /no page text/);
  assert.match(classify(PAGE, page(TEXT, { truncated: true })).failure, /cut off/);
  assert.match(classify(PAGE, undefined).failure, /no result/);
});

test('changed pages and dead links exit 2; any unreadable page exits 1', () => {
  const entry = (result) => ({ url: PAGE, files: [], values: [], ...result });
  const changed = entry(classify(PAGE, page(`${TEXT} and more`), TEXT));
  const dead = entry(classify(PAGE, page(TEXT, { status: 404 })));
  const gone = entry(classify(PAGE, page(TEXT, { status: 410 })));
  assert.equal(dead.dead, true);
  assert.equal(gone.dead, true);
  assert.equal(exitCode({ review: [], moves: [] }), 0);
  assert.equal(exitCode({ review: [changed, dead, gone], moves: [] }), 2);
  assert.equal(exitCode({ review: [dead, entry(classify(PAGE, page(TEXT, { status: 403 })))], moves: [] }), 1);
  assert.equal(exitCode({ review: [changed, entry(classify(PAGE, { error: 'navigation timed out' }))], moves: [] }), 1);
  const recheck = entry({ failure: 'updated 2026-10-15, after the answers to questions 6 were checked', recheck: true });
  assert.equal(exitCode({ review: [recheck], moves: [] }), 2);
  assert.equal(exitCode({ review: [recheck, entry(classify(PAGE, page(TEXT, { status: 403 })))], moves: [] }), 1);
});

test('the issue lists answers to recheck apart from pages that could not be read', () => {
  const recheck = { url: PAGE, files: ['ryanduguid.github.io/_data/accounting_questions.json'], failure: 'updated 2026-10-15, after the answers to questions 6 were checked; recheck them', recheck: true, values: [] };
  const body = renderIssue({ date: '2026-10-29', read: 1, seeded: 0, review: [recheck], quiet: [], moves: [], notes: [] });
  assert.match(body, /1 need accounting answers rechecked, 0 could not be read/);
  assert.match(body, /## Answers to recheck\n\n- \S+: updated 2026-10-15, after the answers to questions 6 were checked; recheck them\. Cited in:/);
  assert.doesNotMatch(body, /## Pages that could not be read/);
});

test('the issue lists dead links apart from pages that could not be read', () => {
  const entry = (url, result) => ({ url, files: ['tools/a/index.html'], values: [], ...result });
  const dead = entry(`${PAGE}-gone`, classify(PAGE, page(TEXT, { status: 404 })));
  const unread = entry(`${PAGE}-slow`, classify(PAGE, { error: 'navigation timed out' }));
  const body = renderIssue({ date: '2026-10-29', read: 2, seeded: 0, review: [dead, unread], quiet: [], moves: [], notes: [] });
  assert.match(body, /1 returned HTTP 404 or 410 \(dead links\), 0 need accounting answers rechecked, 1 could not be read/);
  assert.match(body, /## Dead links\n\nRepoint each citation of these pages in every file listed\.\n\n- https:\S+-gone: HTTP 404\. Cited in: `tools\/a\/index\.html`/);
  assert.match(body, /## Pages that could not be read\n\n- https:\S+-slow: navigation timed out\./);
  assert.doesNotMatch(body.split('## Pages that could not be read')[1], /-gone/);
});

test('a redirect that still resolves is a note, not a failure', () => {
  const result = classify(PAGE, page(TEXT, { finalUrl: `${PAGE}-2026` }));
  assert.equal(result.failure, undefined);
  assert.equal(result.note, `now resolves to ${PAGE}-2026`);
});

test('a redirect that only drops the trailing slash is silent', () => {
  const slashed = 'https://www.ato.gov.au/tax-rates-and-codes/';
  assert.equal(classify(slashed, page(TEXT, { finalUrl: slashed.slice(0, -1) })).note, undefined);
});

test('an echoed URL with other encoding still matches', () => {
  assert.equal(sameUrl('https://www.ato.gov.au/a?docid=%22x%22'), sameUrl('https://www.ato.gov.au/a?docid="x"'));
});

test('tidy normalises spaces and blank runs but keeps line breaks', () => {
  assert.equal(tidy('a\u00a0b  \r\n\n\n\n c\t\n'), 'a b\n\n c');
});

test('the diff lists the lines each version lacks, skipping blanks', () => {
  assert.equal(lineDiff('a\n\nb\nc', 'a\nb\n\nd'), '- c\n+ d');
});

test('a long diff is capped and a pure reorder says so', () => {
  const many = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
  const shown = lineDiff(many, '').split('\n');
  assert.equal(shown.length, 41);
  assert.equal(shown.at(-1), '... 10 more changed lines');
  assert.match(lineDiff('a\nb', 'b\na'), /only the order/);
});

test('baseline files are stable, readable and distinct per URL', () => {
  assert.equal(baselineFile(PAGE), baselineFile(PAGE));
  assert.match(baselineFile(PAGE), /^tax-rates-and-codes-general-interest-charge-rates-[0-9a-f]{8}\.txt$/);
  assert.notEqual(baselineFile(`${PAGE}?a=1`), baselineFile(`${PAGE}?a=2`));
  assert.match(baselineFile('https://www.ato.gov.au/'), /^home-[0-9a-f]{8}\.txt$/);
});

test('readPages sends PDFs to the PDF reader, batches the rest and rereads pages without a container', async () => {
  const urls = Array.from({ length: 120 }, (_, i) => `https://www.ato.gov.au/page-${i}`);
  const pdfUrl = 'https://www.ato.gov.au/api/public/content/abc?1';
  const calls = [];
  const batch = (list, args) => {
    calls.push([list.length, args[0]]);
    const bare = { error: "nothing visible matches '#content, main'" };
    return new Map(list.map((url) => [url, url === urls[7] && args[0] === '--selector' ? bare : { status: 200, text: url }]));
  };
  const pdf = async (url) => ({ status: 200, text: `pdf ${url}` });
  const pages = await readPages([...urls, pdfUrl], { batch, pdf });
  assert.deepEqual(calls, [[50, '--selector'], [50, '--selector'], [20, '--selector'], [1, '--main']]);
  assert.equal(pages.size, 121);
  assert.equal(pages.get(urls[7]).status, 200);
  assert.equal(pages.get(pdfUrl).text, `pdf ${pdfUrl}`);
});

test('JavaScript assets use whole text immediately, while a page with .js only in its query uses containers', async () => {
  const scripts = [
    'https://www.ato.gov.au/misc/spa/calculators/ui/scripts/ato/DIV7A.atogov.min.js',
    'https://www.ato.gov.au/misc/spa/calculators/ui/scripts/ato/subjectArea.IncomeTax.atogov.min.JS?v=1',
  ];
  const html = 'https://www.ato.gov.au/page?example=asset.js';
  const calls = [];
  const batch = (urls, args) => {
    calls.push([urls, args]);
    return new Map(urls.map((url) => [url, scripts.includes(url) && args[0] === '--selector'
      ? { error: "nothing visible matches '#content, main'" }
      : { status: 200, text: TEXT }]));
  };
  const pages = await readPages([...scripts, html], { batch });
  assert.equal(pages.size, 3);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], [[html], ['--selector', '#content, main']]);
  assert.deepEqual(calls[1], [scripts, ['--main']]);
});

test('readPages reads a failed page again, treats any .pdf as a PDF and reports a page that keeps failing', async () => {
  const flaky = 'https://www.ato.gov.au/flaky';
  const broken = 'https://www.ato.gov.au/broken';
  const lawPdf = 'https://www.ato.gov.au/law/view/pdf/pbr/tr2018-003.pdf';
  const calls = [];
  const batch = (list, args) => {
    calls.push([list.map((url) => url.split('/').pop()).join(','), args[0]]);
    return new Map(list.map((url) => [
      url,
      url === flaky && calls.length === 1 ? { error: 'PermissionError: could not tie Chrome to this process' }
        : url === broken ? { error: 'timed out' }
          : { status: 200, text: url },
    ]));
  };
  const pdfCalls = [];
  const pdf = async (url) => { pdfCalls.push(url); return { status: 200, text: `pdf ${url}` }; };
  const pages = await readPages([flaky, broken, lawPdf], { batch, pdf });
  assert.deepEqual(calls, [['flaky,broken', '--selector'], ['flaky,broken', '--selector'], ['broken', '--selector']]);
  assert.deepEqual(pdfCalls, [lawPdf]);
  assert.equal(pages.get(flaky).status, 200);
  assert.equal(pages.get(broken).error, 'timed out');
});

test('saveResults saves the report before it moves any baseline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ato-save-'));
  const baseline = join(dir, 'baseline');
  const kept = join(baseline, 'page.txt');
  const blocker = join(dir, 'not-a-folder');
  mkdirSync(baseline);
  writeFileSync(kept, 'old text');
  writeFileSync(blocker, '');
  const save = (out) => saveResults({ out, baseline, date: '2026-10-05', report: ['# report', ''], keep: new Map([[kept, 'new text']]) });
  assert.throws(() => save(join(blocker, 'reports')));
  assert.equal(readFileSync(kept, 'utf8'), 'old text');
  save(join(dir, 'reports'));
  assert.equal(readFileSync(kept, 'utf8'), 'new text');
});

test('saveResults adds a same-day rerun to the earlier report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ato-rerun-'));
  const save = (report) => saveResults({ out: dir, baseline: join(dir, 'baseline'), date: '2026-10-05', report, keep: new Map() });
  save(['# first', '- old line', '']);
  save(['# second', 'None.', '']);
  assert.equal(readFileSync(join(dir, 'ato-sources-check-2026-10-05.md'), 'utf8'), '# first\n- old line\n\n---\n\n# second\nNone.\n');
});

test('a live run without --out is refused before any page is read', () => {
  const script = fileURLToPath(new URL('./check_ato_sources.mjs', import.meta.url));
  const empty = mkdtempSync(join(tmpdir(), 'ato-empty-'));
  const run = spawnSync(process.execPath, [script, '--baseline', join(empty, 'baseline'), empty], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /--out DIR/);
});

// A fake fetch answering from a table of url => [status, location].
const answering = (table) => async (url, options) => {
  assert.equal(options.redirect, 'manual');
  const [status, location] = table[url] ?? [200];
  return { status, headers: new Headers(location ? { location } : {}), body: null };
};

test('followRedirects calls a chain of 301 and 308 permanent and keeps the last fragment', async () => {
  const get = answering({ [PAGE]: [301, '/rates/gic'], 'https://www.ato.gov.au/rates/gic': [308, 'https://www.ato.gov.au/rates/gic-2#now'] });
  assert.deepEqual(await followRedirects(PAGE, { get }), { target: 'https://www.ato.gov.au/rates/gic-2#now', permanent: true });
});

test('followRedirects calls a 302 hop or no redirect at all not permanent', async () => {
  const get = answering({ [PAGE]: [301, '/a'], 'https://www.ato.gov.au/a': [302, '/b'] });
  assert.deepEqual(await followRedirects(PAGE, { get }), { target: 'https://www.ato.gov.au/b', permanent: false });
  assert.deepEqual(await followRedirects(PAGE, { get: answering({}) }), { target: PAGE, permanent: false });
});

test('sortMoves lists permanent redirects and keeps the rest as notes', async () => {
  const moved = ['permanent', 'temporary', 'unreachable'].map((kind) => ({ url: `${PAGE}/${kind}`, files: ['site/a.md'], note: `now resolves to ${PAGE}/new` }));
  const follow = async (url) => {
    if (url.endsWith('unreachable')) throw new Error('fetch failed', { cause: { code: 'ECONNRESET' } });
    return { target: `${PAGE}/new`, permanent: url.endsWith('/permanent') };
  };
  const { moves, notes } = await sortMoves(moved, { follow });
  assert.deepEqual(moves, [{ url: `${PAGE}/permanent`, target: `${PAGE}/new`, files: ['site/a.md'] }]);
  assert.deepEqual(notes, [`${PAGE}/temporary now resolves to ${PAGE}/new`, `${PAGE}/unreachable now resolves to ${PAGE}/new (redirect not checked: ECONNRESET)`]);
});

const NEWSROOM = 'https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom';
const findings = () => ({
  date: '2026-10-19',
  read: 370,
  seeded: 2,
  review: [
    { url: PAGE, files: ['ryanduguid.github.io/rates/index.html'], failure: 'changed since the previous run', values: [], change: classify(PAGE, page(`Last updated 1 May 2026\n${TEXT}!`), `Last updated 2 May 2026\n${TEXT}`).change },
    { url: `${PAGE}-old`, files: [], failure: String.raw`PermissionError: C:\Users\someone\AppData\Local\Temp\profile is locked`, values: [] },
  ],
  quiet: [{ url: NEWSROOM, files: ['au-fpa-pack/README.md'], change: classify(NEWSROOM, page(`${TEXT}\nNew article`, { finalUrl: NEWSROOM }), TEXT).change }],
  moves: [
    { url: 'https://www.ato.gov.au/rental', target: 'https://www.ato.gov.au/property/rental', files: ['ryanduguid.github.io/scripts/src/check_links_data.rs'] },
    { url: `${NEWSROOM}/old-article`, target: NEWSROOM, files: [] },
  ],
  notes: [`${PAGE}/x now resolves to ${PAGE}/y`],
});

test('the issue body lists each finding with its citing files and names no local path', () => {
  const body = renderIssue(findings());
  assert.match(body, /^The weekly ATO source sweep of 2026-10-19 read 370 pages: 1 changed substantively, 1 changed with nothing to review, 0 returned HTTP 404 or 410 \(dead links\), 0 need accounting answers rechecked, 1 could not be read and 2 cited URLs redirect permanently\./);
  assert.ok(body.includes(`### ${PAGE}\n\nChanged since the previous run. Cited in: \`ryanduguid.github.io/rates/index.html\`\n\nLast updated moved from 2 May 2026 to 1 May 2026.`));
  assert.match(body, /<details><summary>Changed lines<\/summary>\n\n```diff\n- The rate for the September quarter is 11\.36%\.\n\+ The rate for the September quarter is 11\.36%\.!\n```\n\n<\/details>/);
  assert.match(body, /## Pages that could not be read\n\n- \S+-old: PermissionError: \(local path\)\. Cited in: no file/);
  assert.doesNotMatch(body, /Users|AppData|vault|ATO Watch/);
  assert.match(body, /## Permanent redirects\n\n.*`scripts\/src\/check_links_data\.rs` \(keep HTTP_403_AUTOMATION_DENIAL_URLS sorted/);
  assert.match(body, /- `https:\/\/www\.ato\.gov\.au\/rental` → `https:\/\/www\.ato\.gov\.au\/property\/rental`\. Cited in: `ryanduguid\.github\.io\/scripts\/src\/check_links_data\.rs`/);
  assert.match(body, /old-article` → `\S+` \(a hub or newsroom, so the cited page was probably withdrawn/);
  assert.match(body, /## Changes that need no review\n\n- \S+small-business-newsroom: a newsroom, whose article list changes weekly\. Cited in: `au-fpa-pack\/README\.md`/);
  assert.match(body, /## Other redirects\n\n- \S+\/x now resolves to/);
});

test('no local path of any shape reaches the issue, and URLs keep their paths', () => {
  const base = findings();
  const failures = [
    String.raw`EPERM: D:\Work\Client\file.txt locked`,
    String.raw`share \\server\folder\x.txt missing`,
    'ENOENT: /home/someone/profile missing',
    'ENOENT: /root/.cache/x missing',
    String.raw`EPERM: C:\Program Files\Client Name\file.txt`,
    'open file:///home/someone/secret failed',
  ];
  base.review = failures.map((failure, i) => ({ url: `${PAGE}-${i}`, files: [], failure, values: [] }));
  base.notes = [`${PAGE}/x now resolves to https://www.ato.gov.au/home/y (redirect not checked: C:\\Temp\\a)`];
  const body = renderIssue(base);
  assert.doesNotMatch(body, /Work|server|someone|\.cache|Temp|Program|Client|secret/);
  assert.equal(body.match(/\(local path\)/g).length, 7);
  assert.match(body, /https:\/\/www\.ato\.gov\.au\/home\/y/);
});

test('dead and unread watched sources list the files using their values', () => {
  const base = findings();
  base.review = [{ url: PAGE, files: [], failure: 'HTTP 404', dead: true, values: [['2.7%', ['tools/levy/index.html']]] }];
  assert.match(renderIssue(base), /## Dead links\n\n.*\n\n- \S+: HTTP 404\. Cited in: no file\n  - `2\.7%` appears in: `tools\/levy\/index\.html`/);
});

test('an issue body too long even without diffs is cut below the GitHub limit', () => {
  const big = findings();
  big.quiet = Array.from({ length: 2000 }, (_, i) => ({ url: `${NEWSROOM}/${i}`, files: ['a'.repeat(60)], change: { reason: 'a newsroom' } }));
  const body = renderIssue(big);
  assert.ok(body.length < 65_536);
  assert.match(body, /Cut at 60000 characters/);
});

test('an issue body too long for GitHub drops its diffs', () => {
  const big = findings();
  big.review[0].change.diff = 'x'.repeat(70_000);
  const body = renderIssue(big);
  assert.ok(body.length < 60_000);
  assert.doesNotMatch(body, /<details>/);
  assert.match(body, /Last updated moved/);
});

test('the report keeps every diff and adds the quiet changes and redirects', () => {
  const report = renderReport(findings()).join('\n');
  assert.match(report, /^# ATO sources check 2026-10-19\n\n370 pages read, 2 new to the baseline\.\n\n## To review\n\n/);
  assert.ok(report.includes(String.raw`PermissionError: C:\Users`));
  assert.match(report, /## Changed, no review needed\n\n### \S+newsroom\n\nA newsroom, whose article list changes weekly\. Cited in: `au-fpa-pack\/README\.md`\n\n```diff\n\+ New article\n```/);
  assert.match(report, /## Permanent redirects\n\n/);
  assert.match(report, /## Notes\n\n- /);
});

test('the exit code is 1 for an unread page and 2 for a substantive change or a permanent redirect', () => {
  const { review, moves } = findings();
  assert.equal(exitCode({ review, moves }), 1);
  assert.equal(exitCode({ review: review.slice(0, 1), moves: [] }), 2);
  assert.equal(exitCode({ review: [], moves }), 2);
  assert.equal(exitCode({ review: [], moves: [] }), 0);
});

test('the ATO page date is read as an ISO date', () => {
  assert.equal(lastUpdated('Changes to credit card payments\nLast updated 15 October 2026\nPrint'), '2026-10-15');
  assert.equal(lastUpdated('Last updated 1 July 2026'), '2026-07-01');
  assert.equal(lastUpdated('Last updated: 1 July 2026'), '2026-07-01');
  assert.equal(lastUpdated(TEXT), undefined);
  assert.equal(lastUpdated('Last updated\n15 October 2026'), '2026-10-15');
  assert.equal(lastUpdated('Last updated 31 February 2026'), undefined);
  assert.equal(lastUpdated('Last updated 32 October 2026'), undefined);
});

test('check dates must be real YYYY-MM-DD dates', () => {
  for (const good of ['2026-09-27', '2028-02-29']) assert.ok(isIsoDate(good), good);
  for (const bad of ['2026-9-30', '2026-02-30', '2026-13-01', '2026-10-32', '30 September 2026', '', undefined]) assert.ok(!isIsoDate(bad), String(bad));
  const data = { facts_checked: '2026-09-27', sources: {}, questions: [{ id: 6, source: 'pay', fact: 'x', fact_checked: '2026-9-30' }] };
  assert.throws(() => answersToRecheck(data, new Map()), /question 6 check date 2026-9-30/);
});

test("every check date in this site's accounting questions is valid", () => {
  const data = JSON.parse(readFileSync(new URL('../_data/accounting_questions.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => answersToRecheck(data, new Map()));
});

test('an answer is rechecked when a page it cites is dated after its check, even on first read', () => {
  const card = 'https://www.ato.gov.au/businesses-and-organisations/small-business-newsroom/changes-to-credit-card-payments';
  const data = {
    facts_checked: '2026-09-27',
    sources: { pay: { url: PAGE }, card: { url: card }, none: { url: 'https://www.ato.gov.au/unread' } },
    questions: [
      { id: 6, source: 'pay', fact: 'Credit cards until 30 November 2026.', fact_sources: ['card', 'none'] },
      { id: 7, source: 'card', fact: 'Rechecked.', fact_sources: [], fact_checked: '2026-10-20' },
      { id: 8, source: 'card', fact: '', fact_sources: [] },
      { id: 9, source: 'card', fact: 'Same day.', fact_sources: ['card'], fact_checked: '2026-10-15' },
    ],
  };
  const texts = new Map([[PAGE, `${TEXT}\nLast updated 2 September 2026`], [card, 'Changes to credit card payments\nLast updated 15 October 2026']]);
  assert.deepEqual([...answersToRecheck(data, texts)], [[card, { updated: '2026-10-15', ids: [6] }]]);
});
