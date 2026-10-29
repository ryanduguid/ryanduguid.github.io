// Checks every ATO page the portfolio cites, and the pages outside the ATO in
// WATCHED. The ATO answers GitHub runners with HTTP 403 and site-tools check_links can
// only accept that denial on trust, so this sweep runs on Ryan's machine:
// `nodriver batch` reads each page in a local Chrome and the text is compared
// with the copy kept in --baseline from the previous weekly run.
//
// Failures: a page that returns an error status or no text, and a page whose
// text changed substantively since the previous run, other than the legal
// database home (CHANGE_EXEMPT). A substantive change needs editorial review of
// every file that cites it; the report lists those files and the lines that
// differ. A change confined to NOISE lines, or to a listing page (listing), is
// recorded but passes. A dead link (HTTP 404 or 410) needs its citations
// repointed. A cited page dated after the accounting question answers citing it
// were checked needs those answers rechecked (QUESTIONS below). A moved page that still resolves is a permanent redirect when every
// hop is 301 or 308, listed for a mechanical update, and otherwise a note. The
// exit code (exitCode) is 1 when any page could not be read and 2 when every
// other page was read and one changed, is a dead link, needs answers rechecked
// or moved permanently, so
// the scheduled run can tell findings to act on from a broken sweep. --issue FILE
// writes the findings as a GitHub issue body that names only public URLs and
// repository paths.
//
// ponytail: every run overwrites the baseline, so a change fails one run and
// the next run compares against the changed page. The report is the record, so
// it is saved first and a rerun the same day adds to it; keep the baseline
// folder in git if a longer history is wanted.
//
// Run with: node scripts/check_ato_sources.mjs [--list] [--baseline DIR] [--out DIR] [--issue FILE] [directory ...]
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
const TEXT_EXTENSIONS = new Set(['.html', '.md', '.py', '.rs', '.json', '.mjs', '.js', '.txt', '.yml', '.yaml', '.csv', '.toml']);
const TEST_FILE = /(?:^test_)|\.test\.|\.spec\./;
const ATO_URL = /https:\/\/www\.ato\.gov\.au\/[^\s"'<>()[\]`\\|,]*/g;

// Pages outside the ATO behind values their publishers revise: the NSW budget
// in June, the land tax year in January and the Coal LSL corporation when it
// announces a new levy. They are read every run whether or not a file cites
// them, and a change lists every file using each value, because the calculators
// and examples reuse the values without citing the page.
export const WATCHED = new Map([
  ['https://coallsl.com.au/employer/administer-lsl/levy', ['2.7%']],
  ['https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/thresholds-and-rates', ['$1,075,000']],
  ['https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/payroll-tax/lodge-and-pay-returns/thresholds-and-rates', ['5.45%', '$1,200,000']],
]);

// A watched URL counts only where the next character cannot continue it.
function citesWhole(text, url) {
  for (let at = text.indexOf(url); at !== -1; at = text.indexOf(url, at + 1)) {
    if (!/[\w/%-]/.test(text[at + url.length] ?? '')) return true;
  }
  return false;
}

export function extractUrls(text) {
  const urls = new Set();
  for (const match of text.matchAll(ATO_URL)) {
    const url = match[0].replaceAll('&amp;', '&').replace(/(?<![.,;:])[.,;:]+$/, '').split('#')[0];
    // Skip templates such as f-strings and printf patterns.
    if (!/[{}$%]/.test(url.replace(/%[0-9A-Fa-f]{2}/g, ''))) urls.add(url);
  }
  for (const url of WATCHED.keys()) if (citesWhole(text, url)) urls.add(url);
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
  const sources = new Map([...WATCHED.keys()].map((url) => [url, []]));
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

// Maps each watched value to the files containing it, labelled as above.
export function collectValues(directories) {
  const values = new Map([...WATCHED.values()].flat().map((value) => [value, []]));
  for (const directory of directories) {
    const label = basename(resolve(directory));
    for (const path of textFiles(directory)) {
      const text = readFileSync(path, 'utf8');
      for (const [value, files] of values) {
        if (text.includes(value)) files.push(`${label}/${relative(directory, path).replaceAll('\\', '/')}`);
      }
    }
  }
  return values;
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
const CHANGE_EXEMPT = new Set([sameUrl('https://www.ato.gov.au/single-page-applications/legaldatabase')]);

// Non-breaking spaces and trailing blanks vary between renders of one page.
export const tidy = (text) => text.replace(/[^\S\n\t]/g, ' ').replace(/(?<![ \t])[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

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

// Text that changes without the cited content changing, removed from each line
// before two versions are compared: the legal database's count of documents
// citing a ruling, a listing's result count, the external link label (reworded
// from "Opens in a new window" in October 2026) and the Last updated stamp, which
// alone marks no change worth review. Most of the 16 changes on 19 October 2026
// were these or a listing page.
export const NOISE = [
  { pattern: /^[\d,]+ related documents?$/, label: 'related documents count' },
  { pattern: /^Showing [\d,]+ - [\d,]+ of [\d,]+$/, label: 'result count' },
  { pattern: /(?:^| )(?:Opens in a new window|External Link)(?= |$)/g, label: 'external link label' },
  { pattern: /^Last updated:? \d{1,2} [A-Z][a-z]+ \d{4}$/, label: 'Last updated stamp' },
];

const substance = (text) => text.split('\n')
  .map((line) => NOISE.reduce((kept, { pattern }) => kept.replace(pattern, ''), line).trim())
  .filter(Boolean)
  .join('\n');

const stampText = (text) => /^Last updated:? (.+)$/m.exec(text)?.[1];

const andList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

// Pages that list rather than state: the ATO home and the tax rates and codes
// hub rotate feature tiles, a newsroom lists its latest articles, and the
// single-page applications (the calculators) give the browser only navigation
// or a loader. A change to one needs no review; its status and removal still
// count. Returns why the page is a listing, or undefined.
export function listing(url) {
  const path = new URL(url).pathname.replace(/\/$/, '');
  if (path === '' || path === '/tax-rates-and-codes') return 'a hub page, whose feature tiles rotate';
  if (path.endsWith('-newsroom')) return 'a newsroom, whose article list changes weekly';
  if (path.startsWith('/single-page-applications/')) return 'a single-page application, whose text is navigation or a loader';
  return undefined;
}

// Says whether a change needs review. url is the cited page, so a cited article
// that now redirects to its newsroom is a change to review, every week until its
// citations are updated, not a newsroom. A substantive change's diff leaves out
// the noise, and a moved Last updated stamp comes with it as a hint.
export function describeChange(url, before, after) {
  const kind = listing(url);
  if (kind) return { substantive: false, reason: kind, diff: lineDiff(before, after) };
  const [was, now] = [substance(before), substance(after)];
  if (was === now) {
    const [had, has] = [new Set(before.split('\n')), new Set(after.split('\n'))];
    const changed = [...had].filter((line) => !has.has(line)).concat([...has].filter((line) => !had.has(line)));
    const labels = NOISE.filter(({ pattern }) => changed.some((line) => line.replace(pattern, '') !== line)).map(({ label }) => label);
    return { substantive: false, reason: `only the ${andList(labels) || 'spacing'} changed`, diff: lineDiff(before, after) };
  }
  const [from, to] = [stampText(before), stampText(after)];
  return { substantive: true, diff: lineDiff(was, now), hint: from && to && from !== to ? `Last updated moved from ${from} to ${to}.` : undefined };
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
  if (!page.status || page.status >= 400) return { failure: `HTTP ${page.status ?? 'unknown'}`, dead: page.status === 404 || page.status === 410 };
  if (page.truncated) return { failure: 'page text was cut off' };
  const text = tidy(page.text ?? '');
  if (text.length < MIN_TEXT) return { failure: 'no page text' };
  const note = page.finalUrl && sameUrl(page.finalUrl) !== sameUrl(url) ? `now resolves to ${page.finalUrl}` : undefined;
  if (previous !== undefined && previous !== text && !CHANGE_EXEMPT.has(sameUrl(url))) {
    const change = describeChange(url, previous, text);
    return { failure: change.substantive ? 'changed since the previous run' : undefined, change, text, note };
  }
  return { text, note };
}

// The accounting questions date each bold answer (fact_checked, else the file's
// facts_checked). A cited page the ATO dates later needs that answer rechecked,
// even on the run that first reads the page and has no baseline to compare:
// question 6 cited a page added on 13 October 2026, changed by the ATO on 15
// October and first read on 19 October, so no run reported the change.
export const QUESTIONS = '_data/accounting_questions.json';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A real calendar date written YYYY-MM-DD, so check dates compare as strings.
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function lastUpdated(text) {
  const match = text.match(/Last updated:?\s+(\d{1,2})\s+(\w+)\s+(\d{4})/);
  const month = MONTHS.indexOf(match?.[2]) + 1;
  const date = month ? `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}` : undefined;
  return isIsoDate(date) ? date : undefined;
}

// Returns url => { updated, ids } for cited pages dated after the answers citing them were checked.
export function answersToRecheck(data, texts) {
  const stale = new Map();
  for (const question of data.questions) {
    if (!question.fact) continue;
    const checked = question.fact_checked ?? data.facts_checked;
    // A malformed date would compare wrongly and hide a stale answer, so it stops the run.
    if (!isIsoDate(checked)) throw new Error(`${QUESTIONS}: question ${question.id} check date ${checked} is not a YYYY-MM-DD date`);
    for (const key of [question.source, ...(question.fact_sources ?? [])]) {
      const url = data.sources[key]?.url;
      const updated = texts.has(url) ? lastUpdated(texts.get(url)) : undefined;
      if (!updated || updated <= checked) continue;
      if (!stale.has(url)) stale.set(url, { updated, ids: [] });
      if (!stale.get(url).ids.includes(question.id)) stale.get(url).ids.push(question.id);
    }
  }
  return stale;
}

// Follows a moved page's redirects without the browser: the ATO answers plain
// requests from the sweep machine with real 301s. A move is permanent when every
// hop is 301 or 308; target keeps any fragment the last Location names.
export async function followRedirects(url, { get = fetch } = {}) {
  let target = url;
  let permanent = true;
  for (let hops = 0; hops < 10; hops++) {
    const response = await get(target, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (response.status < 300 || response.status > 399 || !location) return { target, permanent: permanent && hops > 0 };
    permanent &&= response.status === 301 || response.status === 308;
    target = new URL(location, target).href;
  }
  throw new Error('more than 10 redirects');
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
// the browser in batches. JavaScript assets start with the whole-text reader;
// they have no page containers. A page without either container is read whole, and a
// page that errors is read again, up to three rounds in all, because Chrome
// sometimes fails to start and a page sometimes times out once.
export async function readPages(urls, { batch = runBatch, pdf = readPdf } = {}) {
  const pages = new Map();
  for (const url of urls.filter(isPdf)) pages.set(url, await pdf(url));
  const args = { selector: ['--selector', PAGE_SELECTOR], main: ['--main'] };
  const mode = new Map();
  let todo = urls.filter((url) => !isPdf(url));
  for (const url of todo) mode.set(url, /[.]js$/i.test(new URL(url).pathname) ? 'main' : 'selector');
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

const cited = (files) => files.map((path) => `\`${path}\``).join(', ') || 'no file';
const sentence = (text) => `${text[0].toUpperCase()}${text.slice(1)}.`;
// A browser error can quote a file on the sweep machine; the issue is public.
// A Windows path can hold spaces, so it is cut to the next quote or line end.
const publicText = (text) => text
  .replace(/file:\/\/\S*/gi, '(local path)')
  .replace(/(?<![\w/.:-])(?:[A-Za-z]:[\\/]|\\\\)[^'"\n]*/g, '(local path)')
  .replace(/(?<![\w/.:-])\/(?:Users|home|tmp|root|mnt|var|private|opt)\/[^\s'",)]*/g, '(local path)');

const MOVES_HELP = 'Replace each cited URL with its target in every file listed, including `scripts/src/check_links_data.rs` (keep HTTP_403_AUTOMATION_DENIAL_URLS sorted and its length current) and `scripts/src/site_contracts/data.rs`.';
// A cited page that now redirects to a hub or newsroom was withdrawn rather than moved.
const withdrawn = (target) => listing(target) && !new URL(target).pathname.startsWith('/single-page-applications/');
const moveLine = ({ url, target, files }) => `- \`${url}\` → \`${target}\`${
  withdrawn(target) ? ' (a hub or newsroom, so the cited page was probably withdrawn: review the citation rather than replace it)' : ''
}. Cited in: ${cited(files)}`;

// One page to review: what failed, where it is cited and, for a change, the lines that differ.
const valueLines = (values) => values.map(([value, where]) => `  - \`${value}\` appears in: ${cited(where)}`);

function reviewLines({ url, files, failure, change, values }, { fold = false, diffs = true } = {}) {
  const lines = [`### ${url}`, '', `${sentence(fold ? publicText(failure) : failure)} Cited in: ${cited(files)}`, ''];
  if (change?.hint) lines.push(change.hint, '');
  for (const [value, where] of values) lines.push(`\`${value}\` appears in: ${cited(where)}`, '');
  if (change && diffs) {
    const block = ['```diff', change.diff, '```'];
    lines.push(...(fold ? ['<details><summary>Changed lines</summary>', '', ...block, '', '</details>'] : block), '');
  }
  return lines;
}

// findings: date, read and seeded counts; review, the pages that failed (with
// change set for a substantive change); quiet, the changes that need no review;
// moves, the permanent redirects; and notes, as strings.
export function renderReport({ date, read, seeded, review, quiet, moves, notes }) {
  const report = [`# ATO sources check ${date}`, '', `${read} pages read, ${seeded} new to the baseline.`, '', '## To review', ''];
  report.push(...(review.length ? review.flatMap((entry) => reviewLines(entry)) : ['None.', '']));
  if (quiet.length) {
    report.push('## Changed, no review needed', '');
    for (const { url, files, change } of quiet) report.push(`### ${url}`, '', `${sentence(change.reason)} Cited in: ${cited(files)}`, '', '```diff', change.diff, '```', '');
  }
  if (moves.length) report.push('## Permanent redirects', '', MOVES_HELP, '', ...moves.map(moveLine), '');
  if (notes.length) report.push('## Notes', '', ...notes.map((note) => `- ${note}`), '');
  return report;
}

// GitHub refuses an issue body over 65,536 characters; past this the issue drops
// its diffs and the report keeps them.
const ISSUE_LIMIT = 60_000;

// The same findings as a GitHub issue body. The repository is public, so it
// names only the pages, the repository paths citing them and the diffs.
export function renderIssue(findings, diffs = true) {
  const { date, read, review, quiet, moves, notes } = findings;
  const changed = review.filter((entry) => entry.change);
  const dead = review.filter((entry) => entry.dead);
  const recheck = review.filter((entry) => entry.recheck);
  const unread = review.filter((entry) => !entry.change && !entry.dead && !entry.recheck);
  const lines = [
    `The weekly ATO source sweep of ${date} read ${read} pages: ${changed.length} changed substantively, ${quiet.length} changed with nothing to review, ${dead.length} returned HTTP 404 or 410 (dead links), ${recheck.length} need accounting answers rechecked, ${unread.length} could not be read and ${moves.length} cited URLs redirect permanently.`,
    '',
  ];
  if (changed.length) {
    lines.push('## Substantive changes', '', 'Review each file citing these pages against the page.', '', ...changed.flatMap((entry) => reviewLines(entry, { fold: true, diffs })));
  }
  if (dead.length) lines.push('## Dead links', '', 'Repoint each citation of these pages in every file listed.', '', ...dead.flatMap(({ url, files, failure, values }) => [`- ${url}: ${publicText(failure)}. Cited in: ${cited(files)}`, ...valueLines(values)]), '');
  if (recheck.length) lines.push('## Answers to recheck', '', ...recheck.map(({ url, files, failure }) => `- ${url}: ${failure}. Cited in: ${cited(files)}`), '');
  if (unread.length) lines.push('## Pages that could not be read', '', ...unread.flatMap(({ url, files, failure, values }) => [`- ${url}: ${publicText(failure)}. Cited in: ${cited(files)}`, ...valueLines(values)]), '');
  if (moves.length) lines.push('## Permanent redirects', '', MOVES_HELP, '', ...moves.map(moveLine), '');
  if (quiet.length) lines.push('## Changes that need no review', '', ...quiet.map(({ url, files, change }) => `- ${url}: ${change.reason}. Cited in: ${cited(files)}`), '');
  if (notes.length) lines.push('## Other redirects', '', ...notes.map((note) => `- ${publicText(note)}`), '');
  const body = lines.join('\n');
  if (diffs && body.length > ISSUE_LIMIT) return renderIssue(findings, false);
  // Still too long without diffs: cut it; the report on the sweep machine has the rest.
  return body.length > ISSUE_LIMIT ? `${body.slice(0, ISSUE_LIMIT)}\n\n(Cut at ${ISSUE_LIMIT} characters; the sweep's report lists every finding.)\n` : body;
}

// Sorts the moved pages into permanent redirects and notes.
export async function sortMoves(moved, { follow = followRedirects } = {}) {
  const moves = [];
  const notes = [];
  for (const { url, files, note } of moved) {
    try {
      const { target, permanent } = await follow(url);
      if (permanent) moves.push({ url, target, files });
      else notes.push(`${url} ${note}`);
    } catch (error) {
      notes.push(`${url} ${note} (redirect not checked: ${error.cause?.code ?? error.message})`);
    }
  }
  return { moves, notes };
}

// Save the report before any baseline moves: it is the only record of a change, so never replace an earlier one.
export function saveResults({ out, baseline, date, report, keep }) {
  // Maintainer CLI; the output folders are its own --out and --baseline arguments.
  mkdirSync(out, { recursive: true }); // NOSONAR
  const file = join(out, `ato-sources-check-${date}.md`);
  // Maintainer CLI; the output folders are its own --out and --baseline arguments.
  writeFileSync(file, `${existsSync(file) ? '\n---\n\n' : ''}${report.join('\n')}`, { flag: 'a' }); // NOSONAR
  // Maintainer CLI; the output folders are its own --out and --baseline arguments.
  mkdirSync(baseline, { recursive: true }); // NOSONAR
  for (const [path, text] of keep) writeFileSync(path, text);
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { list: { type: 'boolean' }, baseline: { type: 'string' }, out: { type: 'string' }, issue: { type: 'string' } },
    allowPositionals: true,
  });
  const directories = positionals.length ? positionals : [root];
  const sources = collectSources(directories);
  if (values.list) {
    for (const [url, files] of sources) console.log(`${url}\n  ${files.join('\n  ')}`);
    console.log(`${sources.size} URLs, ${WATCHED.size} of them watched outside the ATO`);
    return 0;
  }
  if (!values.baseline || !values.out) {
    console.error('--baseline DIR and --out DIR are required for a live run');
    return 1;
  }
  if (sources.size > MAX_URLS) {
    console.error(`${sources.size} URLs exceed the limit of ${MAX_URLS}`);
    return 1;
  }
  const pages = await readPages([...sources.keys()]);
  const valueFiles = collectValues(directories);
  const review = [];
  const quiet = [];
  const moved = [];
  const keep = new Map();
  const texts = new Map();
  let seeded = 0;
  for (const [url, files] of sources) {
    const file = join(values.baseline, baselineFile(url));
    const previous = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    const { failure, change, note, text, dead } = classify(url, pages.get(url), previous);
    if (text !== undefined) {
      keep.set(file, text);
      texts.set(url, text);
    }
    if (text !== undefined && previous === undefined) seeded++;
    if (note) moved.push({ url, files, note });
    if (change && !failure) quiet.push({ url, files, change });
    if (failure) review.push({ url, files, failure, change, dead, values: (WATCHED.get(url) ?? []).map((value) => [value, valueFiles.get(value)]) });
  }
  for (const directory of directories.filter((dir) => existsSync(join(dir, QUESTIONS)))) {
    const data = JSON.parse(readFileSync(join(directory, QUESTIONS), 'utf8'));
    for (const [url, { updated, ids }] of answersToRecheck(data, texts)) {
      const failure = `updated ${updated}, after the answers to questions ${ids.join(', ')} were checked; recheck them against the page and set their \`fact_checked\` in \`${basename(resolve(directory))}/${QUESTIONS}\``;
      review.push({ url, files: sources.get(url) ?? [], failure, recheck: true, values: [] });
    }
  }
  const findings = { date: new Date().toLocaleDateString('en-CA'), read: sources.size, seeded, review, quiet, ...(await sortMoves(moved)) };
  // Maintainer CLI; the issue file is its own --issue argument. It is written
  // before any baseline moves, so a failed write leaves the changes to find again.
  if (values.issue) writeFileSync(values.issue, renderIssue(findings)); // NOSONAR
  saveResults({ out: values.out, baseline: values.baseline, date: findings.date, report: renderReport(findings), keep });
  for (const { url, target } of findings.moves) console.log(`moved: ${url} -> ${target}`);
  for (const note of findings.notes) console.log(`note: ${note}`);
  for (const { url, failure } of review) console.error(`${url}: ${failure}`);
  console.log(`${sources.size} sources read, ${seeded} new to the baseline, ${quiet.length} changed with nothing to review`);
  return exitCode(findings);
}

// 1 when a page could not be read; 2 when every other page was read and a page
// changed substantively, is a dead link (HTTP 404 or 410), needs answers
// rechecked or a cited URL moved
// permanently, so the scheduled task raises the issue until the citing files are
// updated; otherwise 0.
export function exitCode({ review, moves }) {
  if (review.some((entry) => !entry.change && !entry.dead && !entry.recheck)) return 1;
  return review.length || moves.length ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
