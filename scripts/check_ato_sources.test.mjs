import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { baselineFile, classify, collectSources, collectValues, extractUrls, lineDiff, readPages, sameUrl, saveResults, tidy, WATCHED } from './check_ato_sources.mjs';

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
  assert.equal(result.diff, '- The rate for the December quarter is 11.17%.\n+ The rate for the December quarter is 11.42%.');
  assert.equal(result.text, now);
});

test('the legal database home may change, but other law pages may not', () => {
  const home = 'https://www.ato.gov.au/law/';
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
