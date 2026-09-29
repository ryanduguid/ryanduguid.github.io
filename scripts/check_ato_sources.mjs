// Checks every ATO page the portfolio cites. The ATO answers GitHub runners
// with HTTP 403 and check_links.py can only accept that denial on trust, so
// this sweep runs on Ryan's machine: `nodriver batch` reads each page in a
// local Chrome and the text is compared with the copy kept in --baseline from
// the previous weekly run.
//
// Failures: a page that returns an error status or no text, and a page whose
// text changed since the previous run, other than the legal database home
// (CHANGE_EXEMPT). A changed page needs editorial review of every file that
// cites it; the report lists those files and the lines that differ. A moved
// page that still resolves is a note.
//
// ponytail: every run overwrites the baseline, so a change fails one run and
// the next run compares against the changed page. The report is the record, so
// it is saved first and a rerun the same day adds to it; keep the baseline
// folder in git if a longer history is wanted.
//
// Run with: node scripts/check_ato_sources.mjs [--list] [--baseline DIR] [--out DIR] [directory ...]
// Directories default to this repository. --list prints the URLs and the files
// citing them without opening a browser. A live run needs --baseline, the folder
// holding one text file per page, and --out, the folder for the dated Markdown report.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODRIVER = [String.raw`C:\Tools\nodriver-browser\.venv\Scripts\python.exe`, String.raw`C:\Tools\nodriver-browser\server.py`];
// A sanity bound rather than a spend limit: a page takes about four seconds, so
// 500 pages fill about 35 minutes of the scheduled task's 90.
export const MAX_URLS = 500;
// nodriver stops a batch after 15 minutes and refuses more than 100 URLs.
const BATCH_SIZE = 50;
const BATCH_TIMEOUT_MS = 20 * 60_000;
// ATO pages keep their text in section#content and the legal database keeps its
// text in main; the menu and footer around them change without the page changing.
const PAGE_SELECTOR = '#content, main';
// The ATO serves these as PDFs, which Chrome shows in its viewer instead of as
// text, so the record for one is the digest of the file.
const isPdf = (url) => url.includes('/api/public/content/') || /[.]pdf([?]|$)/i.test(url);
const MIN_TEXT = 50;
const MAX_DIFF_LINES = 40;

const SKIP_DIRS = new Set(['.git', 'node_modules', '_site', 'graft', 'tests', '.venv', 'venv', 'dist', 'vendor']);
const TEXT_EXTENSIONS = new Set(['.html', '.md', '.py', '.json', '.mjs', '.js', '.txt', '.yml', '.yaml', '.csv', '.toml']);
const TEST_FILE = /^test_|\.test\.|\.spec\./;
const ATO_URL = /https:\/\/www\.ato\.gov\.au\/[^\s"'<>()[\]`\\|,]*/g;

export function extractUrls(text) {
  const urls = new Set();
  for (const match of text.matchAll(ATO_URL)) {
    const url = match[0].replaceAll('&amp;', '&').replace(/[.,;:]+$/, '').split('#')[0];
    // Skip templates such as f-strings and printf patterns.
    if (!/[{}$%]/.test(url.replace(/%[0-9A-Fa-f]{2}/g, ''))) urls.add(url);
  }
  return [...urls];
}

function* textFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* textFiles(path);
    } else if (TEXT_EXTENSIONS.has(extname(entry.name)) && !TEST_FILE.test(entry.name)) {
      yield path;
    }
  }
}

// Maps each cited URL to the files citing it, labelled by directory name.
export function collectSources(directories) {
  const sources = new Map();
  for (const directory of directories) {
    const label = basename(resolve(directory));
    for (const path of textFiles(directory)) {
      for (const url of extractUrls(readFileSync(path, 'utf8'))) {
        if (!sources.has(url)) sources.set(url, []);
        sources.get(url).push(`${label}/${relative(directory, path).replaceAll('\\', '/')}`);
      }
    }
  }
  return new Map([...sources].sort(([a], [b]) => a.localeCompare(b)));
}

// Chrome may report a requested URL with different percent-encoding, and the
// ATO drops a trailing slash by redirect; neither is a move worth a note.
export function sameUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    return decodeURI(parsed.href);
  } catch {
    return url;
  }
}

// The legal database home lists the week's new documents, so its text changes
// every week (the failed runs of 24 and 28 September 2026), and the portfolio
// cites it only as the way into the database. Its status and removal still count.
const CHANGE_EXEMPT = new Set([sameUrl('https://www.ato.gov.au/law/')]);

// Non-breaking spaces and trailing blanks vary between renders of one page.
export const tidy = (text) => text.replace(/[^\S\n\t]/g, ' ').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

// Lists the lines each version lacks, which is what a reviewer needs to see what
// the ATO changed; it does not track where lines moved.
export function lineDiff(before, after) {
  const [was, now] = [before.split('\n'), after.split('\n')];
  const [had, has] = [new Set(was), new Set(now)];
  const lines = [
    ...was.filter((line) => line.trim() && !has.has(line)).map((line) => `- ${line}`),
    ...now.filter((line) => line.trim() && !had.has(line)).map((line) => `+ ${line}`),
  ];
  if (!lines.length) return '(only the order or repeats of lines changed)';
  const shown = lines.slice(0, MAX_DIFF_LINES);
  if (lines.length > shown.length) shown.push(`... ${lines.length - shown.length} more changed lines`);
  return shown.join('\n');
}

// A readable prefix for browsing the baseline, and a digest of the URL so two
// pages never share a file.
export function baselineFile(url) {
  const slug = sameUrl(url).replace(/^https?:\/\/[^/]+/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `${slug || 'home'}-${createHash('sha1').update(url).digest('hex').slice(0, 8)}.txt`;
}

// Sorts one page read into a failure, a note or nothing, and returns the text to
// keep as the next baseline. previous is the baseline text, when there is one.
export function classify(url, page, previous) {
  if (!page) return { failure: 'no result from the browser' };
  if (page.error) return { failure: page.error };
  if (!page.status || page.status >= 400) return { failure: `HTTP ${page.status ?? 'unknown'}` };
  if (page.truncated) return { failure: 'page text was cut off' };
  const text = tidy(page.text ?? '');
  if (text.length < MIN_TEXT) return { failure: 'no page text' };
  const note = page.finalUrl && sameUrl(page.finalUrl) !== sameUrl(url) ? `now resolves to ${page.finalUrl}` : undefined;
  if (previous !== undefined && previous !== text && !CHANGE_EXEMPT.has(sameUrl(url))) {
    return { failure: 'changed since the previous run', diff: lineDiff(previous, text), text, note };
  }
  return { text, note };
}

// Reads one batch with `nodriver batch`, which keeps going past a failed page and
// writes index.json with a text file per page. Returns url => page.
function runBatch(urls, args) {
  const dir = mkdtempSync(join(tmpdir(), 'ato-batch-'));
  try {
    const list = join(dir, 'urls.txt');
    const out = join(dir, 'pages');
    writeFileSync(list, urls.join('\n'));
    const run = spawnSync(NODRIVER[0], [...NODRIVER.slice(1), 'batch', list, '--out-dir', out, '--wait', '3', ...args], {
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: BATCH_TIMEOUT_MS,
      windowsHide: true,
    });
    if (!existsSync(join(out, 'index.json'))) {
      throw new Error(`nodriver batch wrote no index (${run.error?.message ?? `exit ${run.status}`}); see its output above`);
    }
    return new Map(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')).map((entry) => [
      entry.url,
      entry.error
        ? { error: entry.error }
        : { status: entry.status, finalUrl: entry.final_url, truncated: entry.truncated, text: readFileSync(join(out, entry.file), 'utf8') },
    ]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function readPdf(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) return { status: response.status };
      const type = response.headers.get('content-type') ?? '';
      if (!type.startsWith('application/pdf')) return { error: `expected a PDF, got ${type || 'no content type'}` };
      const body = Buffer.from(await response.arrayBuffer());
      const digest = createHash('sha256').update(body).digest('hex');
      return { status: 200, finalUrl: response.url, text: `PDF, ${body.length} bytes, sha256 ${digest}` };
    } catch (error) {
      if (attempt === 3) return { error: `PDF fetch failed: ${error.cause?.code ?? error.message}` };
      await new Promise((done) => setTimeout(done, 3000));
    }
  }
}

// Returns url => page. PDFs are fetched directly; everything else goes through
// the browser in batches. A page without either container is read whole, and a
// page that errors is read again, up to three rounds in all, because Chrome
// sometimes fails to start and a page sometimes times out once.
export async function readPages(urls, { batch = runBatch, pdf = readPdf } = {}) {
  const pages = new Map();
  for (const url of urls.filter(isPdf)) pages.set(url, await pdf(url));
  const args = { selector: ['--selector', PAGE_SELECTOR], main: ['--main'] };
  const mode = new Map();
  let todo = urls.filter((url) => !isPdf(url));
  for (const url of todo) mode.set(url, 'selector');
  for (let round = 1; round <= 3 && todo.length; round++) {
    for (const kind of Object.keys(args)) {
      const list = todo.filter((url) => mode.get(url) === kind);
      for (let start = 0; start < list.length; start += BATCH_SIZE) {
        for (const [url, page] of batch(list.slice(start, start + BATCH_SIZE), args[kind])) pages.set(url, page);
      }
    }
    todo = todo.filter((url) => !pages.get(url) || pages.get(url).error);
    for (const url of todo) if (pages.get(url)?.error?.includes('nothing visible matches')) mode.set(url, 'main');
  }
  return pages;
}

// The report is the only record of a change, so it is saved before any baseline
// moves: a failed write leaves the old baselines to report the change again. A
// rerun the same day adds to that day's report instead of replacing it.
export function saveResults({ out, baseline, date, report, keep }) {
  mkdirSync(out, { recursive: true });
  const file = join(out, `ato-sources-check-${date}.md`);
  writeFileSync(file, `${existsSync(file) ? '\n---\n\n' : ''}${report.join('\n')}`, { flag: 'a' });
  mkdirSync(baseline, { recursive: true });
  for (const [path, text] of keep) writeFileSync(path, text);
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { list: { type: 'boolean' }, baseline: { type: 'string' }, out: { type: 'string' } },
    allowPositionals: true,
  });
  const sources = collectSources(positionals.length ? positionals : [root]);
  if (values.list) {
    for (const [url, files] of sources) console.log(`${url}\n  ${files.join('\n  ')}`);
    console.log(`${sources.size} ATO URLs`);
    return 0;
  }
  if (!values.baseline || !values.out) {
    console.error('--baseline DIR and --out DIR are required for a live run');
    return 1;
  }
  if (sources.size > MAX_URLS) {
    console.error(`${sources.size} ATO URLs exceed the limit of ${MAX_URLS}`);
    return 1;
  }
  const pages = await readPages([...sources.keys()]);
  const failures = [];
  const notes = [];
  const review = [];
  const keep = new Map();
  let seeded = 0;
  for (const [url, files] of sources) {
    const file = join(values.baseline, baselineFile(url));
    const previous = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    const { failure, note, diff, text } = classify(url, pages.get(url), previous);
    if (text !== undefined) keep.set(file, text);
    if (text !== undefined && previous === undefined) seeded++;
    if (note) notes.push(`${url} ${note}`);
    if (!failure) continue;
    failures.push(`${url}: ${failure}`);
    review.push(`### ${url}\n\n${failure}. Cited in: ${files.map((path) => `\`${path}\``).join(', ')}\n`);
    if (diff) review.push('```diff', diff, '```', '');
  }
  const date = new Date().toLocaleDateString('en-CA');
  const report = [`# ATO sources check ${date}`, '', `${sources.size} pages read, ${seeded} new to the baseline.`, '', '## To review', '', ...(review.length ? review : ['None.', ''])];
  if (notes.length) report.push('## Notes', '', ...notes.map((note) => `- ${note}`), '');
  saveResults({ out: values.out, baseline: values.baseline, date, report, keep });
  for (const note of notes) console.log(`note: ${note}`);
  for (const failure of failures) console.error(failure);
  if (failures.length) return 1;
  console.log(`${sources.size} ATO sources read, ${seeded} new to the baseline`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
