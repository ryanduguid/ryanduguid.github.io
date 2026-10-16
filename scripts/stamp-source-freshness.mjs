// Stamps every tool card with the last commit date of the source it links to,
// so the register shows real maintenance instead of a hand-typed date. The
// dates are baked into the HTML, which keeps the site's connect-src at 'self'
// and adds no runtime JavaScript.
//
// Default mode re-checks the committed stamps offline and is safe for CI.
// --write refreshes them through gh, which holds its own credentials.
// --check-releases reads release records through gh and flags changelog drift.
//
// Exit 1 means the check ran and found something; exit 2 means it could not
// finish (an API failure, say), so a caller can tell drift from an outage.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

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
    // Maintainer script; it runs the maintainer's own gh CLI from PATH.
    'gh', // NOSONAR
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
      .reduce((newest, date) => (date > newest ? date : newest), '');
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

export async function fetchReleases(repository, run = execFileSync) {
  const releases = [];
  for (let pageNumber = 1; ; pageNumber += 1) {
    const endpoint = `repos/${repository}/releases?per_page=100&page=${pageNumber}`;
    const page = JSON.parse(run(
      'gh',
      ['api', endpoint, '--jq', 'map({tag_name, draft, prerelease, published_at})'],
      { encoding: 'utf8', timeout: 15_000 },
    ));
    if (!Array.isArray(page)) throw new Error(`Invalid release list for ${repository}`);
    releases.push(...page);
    if (page.length < 100) return releases;
  }
}

export async function checkReleases(html, lookup = fetchReleases) {
  const section = /<section\b[^>]*\baria-labelledby="tool-releases"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
  const links = [...section.matchAll(/<a href="https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/releases\/tag\/([^"#?]+)"/g)];
  if (!links.length) return ['no release links found in changelog/index.html'];
  const recorded = new Set(links.map(([, repository, tag]) => `${repository}/${tag}`));
  const failures = [];
  const repositories = new Map();
  // One line per package, naming its newest recorded tag: the table keeps every
  // past release, so a line per row would repeat the same drift many times.
  const behind = new Map();
  for (const [, repository, tag] of links) {
    if (!repositories.has(repository)) repositories.set(repository, await lookup(repository));
    const published = repositories.get(repository).filter((release) =>
      !release.draft && !release.prerelease && release.published_at);
    const version = /^(.*?)(?<!\d)(\d+\.\d+\.\d+)$/.exec(tag);
    if (!version || !published.some((release) => release.tag_name === tag)) {
      failures.push(`${repository}: ${tag} is not a published stable release`);
      continue;
    }
    const prefix = version[1];
    const tags = published.map((release) => release.tag_name).filter((name) =>
      name.startsWith(prefix) && /^\d+\.\d+\.\d+$/.test(name.slice(prefix.length)));
    const latest = tags.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
    const key = `${repository}/${latest}`;
    if (!recorded.has(key) &&
        (!behind.has(key) || behind.get(key).tag.localeCompare(tag, 'en', { numeric: true }) < 0)) {
      behind.set(key, { repository, tag, latest });
    }
  }
  for (const { repository, tag, latest } of behind.values()) {
    failures.push(`${repository}: ${tag} is behind ${latest}; review changelog/index.html and capability descriptions`);
  }
  return failures;
}

// A tool page may pin an older release for its worked example, but then it
// must name the current release too, so a reader who installs from the page
// knows which version they are getting. The page passes when its release-meta
// tag is current, or when the current tag appears somewhere in the page text.
export async function checkToolReleases(pages, lookup = fetchReleases) {
  const failures = [];
  const repositories = new Map();
  for (const [rel, html] of pages) {
    let meta = /<p class="release-meta">([\s\S]*?)<\/p>/.exec(html)?.[1];
    if (meta?.includes('{{ release.url }}')) {
      const slug = rel.split('/')[1];
      const snapshot = JSON.parse(readFileSync(join(root, '_data/tool_releases.json'), 'utf8'))[slug];
      if (!snapshot?.url) throw new Error(rel + ': no release snapshot');
      meta = meta.replace('{{ release.url }}', snapshot.url);
    }
    if (!meta) continue;
    const link = /<a href="https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/releases\/tag\/([^"#?]+)"/.exec(meta);
    if (!link) continue;
    const [, repository, tag] = link;
    const version = /^(.*?)(?<!\d)(\d+\.\d+\.\d+)$/.exec(tag);
    if (!version) {
      failures.push(`${rel}: ${tag} is not a stable release tag`);
      continue;
    }
    if (!repositories.has(repository)) repositories.set(repository, await lookup(repository));
    const prefix = version[1];
    const tags = repositories.get(repository)
      .filter((release) => !release.draft && !release.prerelease && release.published_at)
      .map((release) => release.tag_name)
      .filter((name) => name.startsWith(prefix) && /^\d+\.\d+\.\d+$/.test(name.slice(prefix.length)));
    const latest = tags.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
    if (latest && latest !== tag && !html.includes(latest)) {
      failures.push(`${rel}: pins ${tag} but does not name the current release ${latest}`);
    }
  }
  return failures;
}

function toolPages() {
  const toolsDirectory = join(root, 'tools');
  return readdirSync(toolsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(toolsDirectory, entry.name, 'index.html'))
    .filter((path) => existsSync(path))
    .map((path) => [relative(root, path).replaceAll('\\', '/'), readFileSync(path, 'utf8')]);
}

// Release data is refreshed explicitly at build time; ordinary Jekyll builds use
// the checked snapshot so offline checks never depend on GitHub availability.
export async function buildToolReleaseData(tools, lookup = fetchReleases) {
  const repositories = new Map();
  const data = {};
  for (const [slug, tool] of Object.entries(tools)) {
    if (tool.tagPrefix === null) continue; // The browser levy has no tagged release.
    if (!repositories.has(tool.repository)) repositories.set(tool.repository, await lookup(tool.repository));
    const releases = repositories.get(tool.repository).filter((r) =>
      !r.draft && !r.prerelease && r.published_at && r.tag_name.startsWith(tool.tagPrefix) &&
      /^\d+\.\d+\.\d+$/.test(r.tag_name.slice(tool.tagPrefix.length)));
    const latest = releases.sort((a, b) =>
      a.tag_name.localeCompare(b.tag_name, 'en', { numeric: true })).at(-1);
    if (!latest) throw new Error(slug + ': no published stable release');
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(latest.published_at));
    data[slug] = { version: latest.tag_name.slice(tool.tagPrefix.length), tag: latest.tag_name,
      date, dateLabel: formatDate(date),
      url: 'https://github.com/' + tool.repository + '/releases/tag/' + latest.tag_name };
  }
  return data;
}

export function stampToolMetadata(html, tool, release) {
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, body) => {
    const schema = JSON.parse(body);
    for (const entry of schema['@graph'] ?? [schema]) {
      if ([entry['@type']].flat().includes('SoftwareApplication')) {
        Object.assign(entry, { '@type': ['SoftwareApplication', 'SoftwareSourceCode'],
          name: tool.name, alternateName: tool.alternateName, softwareVersion: release.version,
          dateModified: release.date, codeRepository: tool.codeRepository, isAccessibleForFree: true });
        delete entry.offers;
        if (tool.sameAs?.length) entry.sameAs = tool.sameAs;
        else if (tool.sameAs) delete entry.sameAs;
      }
    }
    return '<script type="application/ld+json">\n' + JSON.stringify(schema, null, 2) + '\n</script>';
  });
}

export function stampToolSitemap(sitemap, url, html) {
  const dates = new Set();
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const schema = JSON.parse(match[1]);
    for (const entry of schema['@graph'] ?? [schema]) {
      if ([entry['@type']].flat().some(type => ['WebPage', 'TechArticle'].includes(type)) && entry.dateModified) {
        dates.add(entry.dateModified);
      }
    }
  }
  if (dates.size !== 1) throw new Error(url + ': expected one document modification date');
  return sitemap.replace(new RegExp('(<loc>' + url.replaceAll('.', '\\.') + '</loc>\\s*<lastmod>)[^<]+'),
    (_, start) => start + [...dates][0]);
}

const escapeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// The register's Delivery and Boundary come from _data/tools.json, the facts
// each tool page shows. They are written as static text so the register keeps
// no Liquid beyond the shared chrome, which lets wording-only pull requests
// use the offline site checks.
export function stampRegisterFacts(register, slug, tool) {
  // Each entry runs from its own opening div to the next one, so a card that
  // loses its facts cannot borrow a later card's.
  const marker = '<div class="collection-entry">';
  const parts = register.split(marker);
  const title = '<a class="collection-entry__title" href="/tools/' + slug + '/">';
  const found = parts.flatMap((part, index) => (index > 0 && part.includes(title) ? [index] : []));
  if (found.length !== 1) {
    throw new Error('tools/index.html: expected one register entry for ' + slug + ', found ' + found.length);
  }
  let entry = parts[found[0]];
  for (const [label, value, field] of [
    ['Delivery', tool.delivery, /(<dt>Delivery<\/dt><dd>)[^<]*(<\/dd>)/g],
    ['Boundary', tool.boundary, /(<dt>Boundary<\/dt><dd>)[^<]*(<\/dd>)/g],
  ]) {
    const count = [...entry.matchAll(field)].length;
    if (count !== 1) throw new Error(`tools/index.html: expected one ${label} for ${slug}, found ${count}`);
    entry = entry.replace(field, (_, start, end) => start + escapeHtml(value) + end);
  }
  parts[found[0]] = entry;
  return parts.join(marker);
}

// The homepage lists the newest tagged releases. Ties on a date fall back to
// the slug, so a refresh never reorders an unchanged list.
export function stampLatestReleases(home, tools, data, limit = 3) {
  const list = /(<ul class="latest-releases"[^>]*>\n)[\s\S]*?(\n[ \t]*<\/ul>)/;
  if (!list.test(home)) throw new Error('index.html: latest releases list not found');
  const items = Object.entries(data)
    .filter(([slug, release]) => release.tag && tools[slug])
    .sort(([a, x], [b, y]) => y.date.localeCompare(x.date) || b.localeCompare(a))
    .slice(0, limit)
    .map(([slug, release]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(release.date)) throw new Error(slug + ': release date must be YYYY-MM-DD');
      return '            <li><a href="/tools/' + slug + '/">' + escapeHtml(tools[slug].name)
        + ' v' + escapeHtml(release.version) + '</a> <time datetime="' + release.date + '">'
        + escapeHtml(release.dateLabel) + '</time></li>';
    });
  return home.replace(list, (_, start, end) => start + items.join('\n') + end);
}

export function stampMcpIndex(text, release) {
  return text.replace(/(\[Aus Accounting MCP\]\(https:\/\/duguid\.com\.au\/tools\/australian-tax-ai-agents\/\): local MCP server, current release )v[\d.]+ \([^)]+\)/,
    (_, start) => start + 'v' + release.version + ' (' + release.dateLabel + ')');
}

export function buildCalculatorRevision(run = execFileSync) {
  const repository = 'ryanduguid/ryanduguid.github.io';
  const revisions = SOURCE_PATHS.get(repository).map(path => JSON.parse(run(
    // Maintainer entry point, using the same trusted CLI as fetchReleases.
    'gh', // NOSONAR
    ['api', 'repos/' + repository + '/commits?path=' + encodeURIComponent(path) + '&per_page=1',
      '--jq', '.[0]|{sha,date:.commit.committer.date}'],
    { encoding: 'utf8', timeout: 15_000 })));
  return revisions.sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

async function main() {
  if (process.argv.includes('--build') || process.argv.includes('--write-tool-releases')) {
    const tools = JSON.parse(readFileSync(join(root, '_data/tools.json'), 'utf8'));
    const data = await buildToolReleaseData(tools);
    const revision = buildCalculatorRevision();
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(revision.date));
    data['coal-lsl-levy'] = { version: revision.sha, date, dateLabel: formatDate(date),
      url: 'https://github.com/ryanduguid/ryanduguid.github.io/commit/' + revision.sha };
    writeFileSync(join(root, '_data/tool_releases.json'), JSON.stringify(data, null, 2) + '\n');
    let sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
    let register = readFileSync(page, 'utf8');
    for (const [slug, tool] of Object.entries(tools)) {
      const source = join(root, 'tools', slug, 'index.html');
      const html = stampToolMetadata(readFileSync(source, 'utf8'), tool, data[slug]);
      writeFileSync(source, html);
      const url = 'https://duguid.com.au/tools/' + slug + '/';
      sitemap = stampToolSitemap(sitemap, url, html);
      register = register.replace(new RegExp('(class="collection-entry__title" href="/tools/' + slug + '/">)[^<]*'),
        (_, start) => start + tool.name);
      register = register.replace(new RegExp('("name": ")[^"\\n]+("[,]?\\s*"url": "' + url.replaceAll('.', '\\.') + '")'),
        (_, start, end) => start + tool.name + end);
      register = stampRegisterFacts(register, slug, tool);
    }
    writeFileSync(join(root, 'sitemap.xml'), sitemap);
    writeFileSync(page, register);
    const home = join(root, 'index.html');
    writeFileSync(home, stampLatestReleases(readFileSync(home, 'utf8'), tools, data));
    const index = join(root, 'llms.txt');
    writeFileSync(index, stampMcpIndex(readFileSync(index, 'utf8'), data['australian-tax-ai-agents']));
    console.log('tool releases refreshed from published GitHub tags; browser levy from source revision');
    if (process.argv.includes('--build')) execFileSync(
      // Maintainer entry point, using the maintainer's own Rust toolchain.
      'cargo', // NOSONAR
      ['run', '--locked', '--quiet', '--manifest-path', 'scripts/Cargo.toml', '--', 'build_site'],
      { cwd: root, stdio: 'inherit', timeout: 300_000 });
    return 0;
  }
  if (process.argv.includes('--check-releases')) {
    const releaseLookup = new Map();
    const cachedLookup = async (repository) => {
      if (!releaseLookup.has(repository)) releaseLookup.set(repository, await fetchReleases(repository));
      return releaseLookup.get(repository);
    };
    const failures = [
      ...await checkReleases(readFileSync(join(root, 'changelog', 'index.html'), 'utf8'), cachedLookup),
      ...await checkToolReleases(toolPages(), cachedLookup),
    ];
    for (const failure of failures) console.error(failure);
    if (failures.length) return 1;
    console.log('current release references passed');
    return 0;
  }
  const html = readFileSync(page, 'utf8');
  if (process.argv.includes('--write')) {
    if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') {
      throw new Error('Source freshness writes in GitHub Actions require the main branch');
    }
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
    process.exitCode = 2;
  });
}
