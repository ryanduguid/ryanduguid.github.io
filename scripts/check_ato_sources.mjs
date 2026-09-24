// Checks every ATO page the portfolio cites, through Firecrawl, because the
// ATO answers GitHub runners with HTTP 403 and check_links.py can only accept
// that denial on trust. Firecrawl fetches each page and compares it with the
// snapshot it kept from the previous weekly run.
//
// Failures: a page that returns an error status, a page Firecrawl reports as
// removed, and a page whose text changed since the last run. A changed page
// needs editorial review of every file that cites it; the diff goes to the job
// summary. A moved page that still resolves is printed as a note.
//
// ponytail: Firecrawl holds the only baseline, so a change fails one run and
// the next run compares against the changed page. The failed run and its
// summary are the record. Commit baselines here if that proves too thin.
//
// Run with: node scripts/check_ato_sources.mjs [--list] [directory ...]
// Directories default to this repository. --list prints the URLs and the files
// citing them without any network request. A live run needs FIRECRAWL_API_KEY.

import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.firecrawl.dev/v2/batch/scrape';
// Ryan approved a weekly sweep of up to 200 pages on 24 September 2026.
// Raising this is a new approval, not a code change.
export const MAX_URLS = 200;
const TAG = 'ato-sources-weekly';
const POLL_MS = 10_000;
const DEADLINE_MS = 20 * 60_000;

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

// Firecrawl may echo a requested URL with different percent-encoding, and the
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

// Sorts one Firecrawl document into a failure, a note or nothing.
export function classify(url, doc) {
  if (!doc) return { failure: `${url}: Firecrawl could not read the page` };
  const status = doc.metadata?.statusCode;
  if (!status || status >= 400) return { failure: `${url}: HTTP ${status ?? 'unknown'}` };
  const change = doc.changeTracking?.changeStatus;
  if (change === 'removed') return { failure: `${url}: removed` };
  if (change === 'changed') {
    return { failure: `${url}: changed since ${doc.changeTracking.previousScrapeAt}`, diff: doc.changeTracking.diff?.text ?? '' };
  }
  if (!change) return { failure: `${url}: no change tracking result` };
  const final = doc.metadata?.url;
  if (final && sameUrl(final) !== sameUrl(url)) return { note: `${url}: now resolves to ${final}` };
  return {};
}

async function firecrawl(url, key, body) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Firecrawl ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

async function scrapeAll(urls, key) {
  const job = await firecrawl(API, key, {
    urls,
    formats: ['markdown', { type: 'changeTracking', modes: ['git-diff'], tag: TAG }],
    onlyMainContent: true,
  });
  const invalid = job.invalidURLs ?? [];
  const deadline = Date.now() + DEADLINE_MS;
  let status;
  do {
    if (Date.now() > deadline) throw new Error(`Firecrawl batch ${job.id} did not finish in 20 minutes`);
    await new Promise((done) => setTimeout(done, POLL_MS));
    status = await firecrawl(`${API}/${job.id}`, key);
  } while (status.status === 'scraping');
  if (status.status !== 'completed') throw new Error(`Firecrawl batch ${job.id} ended as ${status.status}`);
  const docs = [...status.data];
  for (let next = status.next; next; ) {
    const page = await firecrawl(next, key);
    docs.push(...page.data);
    next = page.next;
  }
  const byUrl = new Map(docs.map((doc) => [sameUrl(doc.metadata?.sourceURL ?? ''), doc]));
  return { byUrl, invalid };
}

async function main() {
  const args = process.argv.slice(2);
  const directories = args.filter((arg) => !arg.startsWith('--'));
  const sources = collectSources(directories.length ? directories : [root]);
  if (args.includes('--list')) {
    for (const [url, files] of sources) console.log(`${url}\n  ${files.join('\n  ')}`);
    console.log(`${sources.size} ATO URLs`);
    return 0;
  }
  if (sources.size > MAX_URLS) {
    console.error(`${sources.size} ATO URLs exceed the approved cap of ${MAX_URLS}`);
    return 1;
  }
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    console.error('FIRECRAWL_API_KEY is not set');
    return 1;
  }
  const { byUrl, invalid } = await scrapeAll([...sources.keys()], key);
  const failures = invalid.map((url) => `${url}: rejected by Firecrawl as invalid`);
  const summary = [];
  for (const [url, files] of sources) {
    if (invalid.includes(url)) continue;
    const { failure, note, diff } = classify(url, byUrl.get(sameUrl(url)));
    if (note) console.log(`note: ${note}`);
    if (!failure) continue;
    failures.push(failure);
    summary.push(`### ${url}\n\nCited in: ${files.map((file) => `\`${file}\``).join(', ')}\n`);
    if (diff) summary.push('```diff', diff, '```', '');
  }
  if (process.env.GITHUB_STEP_SUMMARY && summary.length) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ATO sources to review\n\n${summary.join('\n')}\n`);
  }
  for (const failure of failures) console.error(failure);
  if (failures.length) return 1;
  console.log(`${sources.size} ATO sources unchanged`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
