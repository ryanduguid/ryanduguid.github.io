// Stamps every tool card with the last commit date of the source it links to,
// so the register shows real maintenance instead of a hand-typed date. The
// dates are baked into the HTML, which keeps the site's connect-src at 'self'
// and adds no runtime JavaScript.
//
// Default mode re-checks the committed stamps offline and is safe for CI.
// --write refreshes them through gh, which holds its own credentials.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = join(root, 'tools', 'index.html');

// A tool card is a <dl> of labelled facts followed immediately by its source
// link, so one pattern pairs the two without needing an HTML parser. Anchoring
// on collection-entry__links keeps evaluation-summary lists out of the match.
const CARD =
  /(<dl>)([\s\S]*?)(<\/dl>)(\s*<p class="collection-entry__links"><a href="https:\/\/github\.com\/([^/"]+)\/([^/"]+)(?:\/tree\/main\/([^"]+))?")/g;

const STAMP =
  /\n[ \t]*<div><dt>Last commit<\/dt><dd><time datetime="[^"]*">[^<]*<\/time><\/dd><\/div>/g;

const READ_STAMP =
  /<dt>Last commit<\/dt><dd><time datetime="(\d{4}-\d{2}-\d{2})">([^<]*)<\/time><\/dd>/;

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
  return html.replace(CARD, (match, open, body, close, links, owner, repo, path) => {
    const iso = lookup(owner, repo, path);
    const rows = body.replace(STAMP, '');
    // Take the indentation from the card itself so the diff stays local.
    const indent = /\n([ \t]*)<div>/.exec(rows)?.[1] ?? '';
    const tail = /\n[ \t]*$/.exec(rows)?.[0] ?? '\n';
    const stamped =
      `${rows.replace(/\n[ \t]*$/, '')}\n${indent}` +
      `<div><dt>Last commit</dt><dd><time datetime="${iso}">${formatDate(iso)}</time></dd></div>`;
    return `${open}${stamped}${tail}${close}${links}`;
  });
}

export function checkHtml(html, today = new Date().toISOString().slice(0, 10)) {
  const failures = [];
  let cards = 0;
  for (const [, , body, , , owner, repo, path] of html.matchAll(CARD)) {
    cards += 1;
    const source = sourceName(owner, repo, path);
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
  if (cards === 0) {
    failures.push('no tool cards matched; the card markup has changed');
  }
  return failures;
}

function main() {
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
  process.exit(main());
}
