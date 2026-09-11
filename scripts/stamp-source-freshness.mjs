// Stamps every tool card with the last commit date of the source it links to,
// so the register shows real maintenance instead of a hand-typed date. The
// dates are baked into the HTML, which keeps the site's connect-src at 'self'
// and adds no runtime JavaScript.
//
// Default mode re-checks the committed stamps offline and is safe for CI.
// --write refreshes them through gh, which holds its own credentials.
// --check-releases reads public release records and flags changelog drift.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = join(root, 'tools', 'index.html');

// The stamp rides the links paragraph each card already has, rather than adding
// a row. That line is where the source link lives, so the date sits beside the
// thing it describes, and on desktop it costs the page no extra height. The
// tool register is held to a page-length budget by
// tests/browser/site-quality.spec.mjs, which a new row per card would breach.
const CARD = /<p class="collection-entry__links">([\s\S]*?)<\/p>/g;

// Counting cards independently of CARD is what stops a card whose links markup
// drifts from being skipped in silence while the rest still pass.
const ENTRY = /<div class="collection-entry">/g;

const SOURCE =
  /<a href="https:\/\/github\.com\/([^/"]+)\/([^/"]+)(?:\/tree\/main\/([^"]+))?"/;

const STAMP = /<span class="collection-entry__stamp">[\s\S]*?<\/span>/;

// A card can link to a repository root that holds far more than the tool it
// describes. The site repository is the case in point: dating the Coal LSL
// calculator from the root would credit it with every unrelated copy edit, and
// this workflow's own commits would move that date every week and restamp the
// card forever. Date those cards from the files that implement the tool
// instead, newest of them wins.
const SOURCE_PATHS = new Map([
  [
    'ryanduguid/ryanduguid.github.io',
    [
      'assets/levy.mjs',
      'assets/levy-form.mjs',
      'assets/levy-page.mjs',
      'assets/levy-explanation.mjs',
    ],
  ],
]);

function pathsFor(owner, repo, path) {
  return SOURCE_PATHS.get(`${owner}/${repo}`) ?? [path];
}

const READ_STAMP =
  /<span class="collection-entry__stamp">Last commit <time datetime="(\d{4}-\d{2}-\d{2})">([^<]*)<\/time><\/span>/;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// The site writes dates as "3 September 2026", with no leading zero.
export function formatDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function sourceName(owner, repo, path) {
  return path ? `${owner}/${repo}/${path}` : `${owner}/${repo}`;
}

// gh is used rather than a bare fetch so the token stays inside the CLI. In
// Actions it authenticates from GH_TOKEN; locally it uses the stored login.
function lastCommitDate(owner, repo, path) {
  const query = new URLSearchParams({ per_page: '1' });
  if (path) {
    query.set('path', path);
  }
  const endpoint = `repos/${owner}/${repo}/commits?${query}`;
  const answer = execFileSync(
    'gh',
    ['api', endpoint, '--jq', '.[0].commit.committer.date'],
    { encoding: 'utf8' },
  ).trim();
  const iso = answer.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`${endpoint}: expected a commit date, got ${answer || '(empty)'}`);
  }
  return iso;
}

export function stampHtml(html, lookup = lastCommitDate) {
  return html.replace(CARD, (match, body) => {
    const source = SOURCE.exec(body);
    if (!source) {
      return match;
    }
    const [, owner, repo, path] = source;
    // ISO dates compare correctly as strings, so the newest is simply the max.
    const iso = pathsFor(owner, repo, path)
      .map((each) => lookup(owner, repo, each))
      .reduce((newest, date) => (date > newest ? date : newest));
    const stamp =
      '<span class="collection-entry__stamp">Last commit ' +
      `<time datetime="${iso}">${formatDate(iso)}</time></span>`;
    return `<p class="collection-entry__links">${body.replace(STAMP, '')}${stamp}</p>`;
  });
}

export function checkHtml(html, today = new Date().toISOString().slice(0, 10)) {
  const failures = [];
  let cards = 0;
  for (const [, body] of html.matchAll(CARD)) {
    cards += 1;
    const found = SOURCE.exec(body);
    if (!found) {
      failures.push('a tool card links to no source repository');
      continue;
    }
    const source = sourceName(found[1], found[2], found[3]);
    const stamp = READ_STAMP.exec(body);
    if (!stamp) {
      failures.push(`${source}: no last-commit stamp`);
      continue;
    }
    const [, iso, text] = stamp;
    if (text !== formatDate(iso)) {
      failures.push(`${source}: stamp reads "${text}", expected "${formatDate(iso)}"`);
    }
    if (iso > today) {
      failures.push(`${source}: stamp date ${iso} is in the future`);
    }
  }
  const entries = (html.match(ENTRY) ?? []).length;
  if (cards === 0) {
    failures.push('no tool cards matched; the card markup has changed');
  } else if (cards !== entries) {
    failures.push(
      `${entries} tool cards but ${cards} carry a links row; ` +
        'a card has drifted out of the stamped set',
    );
  }
  return failures;
}

export async function fetchReleases(repository, request = fetch) {
  const releases = [];
  for (let pageNumber = 1; ; pageNumber += 1) {
    const url = `https://api.github.com/repos/${repository}/releases?per_page=100&page=${pageNumber}`;
    const response = await request(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`GitHub release lookup failed for ${repository}: HTTP ${response.status}`);
    }
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Invalid release list for ${repository}`);
    releases.push(...page);
    if (page.length < 100) return releases;
  }
}

export async function checkReleases(html, lookup = fetchReleases) {
  const section = /<section aria-labelledby="tool-releases">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
  const links = [...section.matchAll(/<a href="https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/releases\/tag\/([^"#?]+)"/g)];
  if (!links.length) return ['no release links found in changelog/index.html'];
  const failures = [];
  const repositories = new Map();
  for (const [, repository, tag] of links) {
    if (!repositories.has(repository)) repositories.set(repository, await lookup(repository));
    const published = repositories.get(repository).filter((release) =>
      !release.draft && !release.prerelease && release.published_at);
    const version = /^(.*?)(\d+\.\d+\.\d+)$/.exec(tag);
    if (!version || !published.some((release) => release.tag_name === tag)) {
      failures.push(`${repository}: ${tag} is not a published stable release`);
      continue;
    }
    const prefix = version[1];
    const tags = published.map((release) => release.tag_name).filter((name) =>
      name.startsWith(prefix) && /^\d+\.\d+\.\d+$/.test(name.slice(prefix.length)));
    const latest = tags.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
    if (latest !== tag) {
      failures.push(`${repository}: ${tag} is behind ${latest}; review changelog/index.html and capability descriptions`);
    }
  }
  return failures;
}

async function main() {
  if (process.argv.includes('--check-releases')) {
    const failures = await checkReleases(readFileSync(join(root, 'changelog', 'index.html'), 'utf8'));
    for (const failure of failures) console.error(failure);
    if (failures.length) return 1;
    console.log('current release references passed');
    return 0;
  }
  const html = readFileSync(page, 'utf8');
  if (process.argv.includes('--write')) {
    const updated = stampHtml(html);
    if (updated !== html) {
      writeFileSync(page, updated);
    }
    console.log(updated === html ? 'source freshness unchanged' : 'source freshness updated');
    return 0;
  }
  const failures = checkHtml(html);
  for (const failure of failures) {
    console.error(failure);
  }
  if (failures.length) {
    return 1;
  }
  console.log('source freshness stamps passed');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
