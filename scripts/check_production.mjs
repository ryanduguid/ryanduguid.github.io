// Checks the public site as delivered, which the repository's own checks
// cannot see: they run against _site or the local preview, while Cloudflare
// sits in front of GitHub Pages and rewrites what visitors receive.
//
// Hard failures are the promises README.md makes about delivery: the five
// response headers the transform rule adds, the retired-route redirects, and
// mailto links that survive delivery (Email Address Obfuscation rewrites them
// and strips the address when it is on). Injected inline scripts are reported,
// not failed, because they are edge settings the page's own Content Security
// Policy already blocks. An analytics tag fails: the Privacy page states that
// no analytics script is delivered, so its return would falsify that notice.
// Rocket Loader fails too: it re-types every script and runs them through its
// own loader, so visitors would get a page the browser and Lighthouse checks
// never ran. So does any script source other than the site's own /assets/
// modules: Cloudflare's WebMCP setting injected /.webmcp/bridge.js into every
// page, same-origin and executed, and nothing here saw it.
//
// Some paths must stay absent. GitHub Pages' legacy build turned the Markdown
// files without front matter into themed pages the repository's own build never
// makes, with a theme stylesheet; _config.yml now switches that off.
//
// Run with: node scripts/check_production.mjs [--base https://duguid.com.au]

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseIndex = process.argv.indexOf('--base');
const BASE = baseIndex > -1 ? process.argv[baseIndex + 1] : 'https://duguid.com.au';

// A browser user agent, because Cloudflare adds its analytics tag only for
// browser-like requests and the check should see what a visitor sees.
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 duguid-production-check',
  accept: 'text/html,application/xhtml+xml',
};

export const REQUIRED_HEADERS = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "frame-ancestors 'none'",
};

export const REDIRECTS = {
  '/engage/': '/',
  '/tools/review-ready-gate/': '/tools/workpaper-review-gate/',
  '/refusals': '/tools/refusals/',
  '/refusals/': '/tools/refusals/',
};

export const EXPECTED_ABSENT = [
  '/rates/register/',
  '/rates/register/CHANGELOG.html',
  '/assets/credentials/SOURCES.html',
  '/assets/css/style.css',
];

// A script tag read attribute by attribute, quoted either way or not at all, so
// a ">" inside another attribute's value does not end the tag early.
const SCRIPT_TAG = /<script\b((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/gi;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

// Every script source on a page, resolved as a browser would fetch it, so
// "/assets/../x.js" is read as "/x.js". An unparseable source comes back null.
export function scriptSources(html, pageUrl) {
  const sources = [];
  for (const [, attributes] of html.matchAll(SCRIPT_TAG)) {
    for (const [, name, double, single, bare] of attributes.matchAll(ATTRIBUTE)) {
      if (name.toLowerCase() === 'src') sources.push(URL.parse(double ?? single ?? bare ?? '', pageUrl));
    }
  }
  return sources;
}

// A same-origin script the repository ships under assets/. Cloudflare's own
// /cdn-cgi/ scripts get no exemption: the site ships none of them.
function allowedScript(url) {
  return url !== null && url.origin === new URL(BASE).origin
    && /^\/assets\/.+\.m?js$/.test(url.pathname) && existsSync(join(root, url.pathname));
}

export function sitemapPaths(xml) {
  return [...xml.matchAll(/<loc>https:\/\/duguid\.com\.au([^<]*)<\/loc>/g)].map((match) => match[1]);
}

export function inspectHtml(path, sourceHtml, deliveredHtml) {
  const failures = [];
  const notes = [];
  const sourceMailtos = [...sourceHtml.matchAll(/href="(mailto:[^"]+)"/g)].map((match) => match[1]);
  for (const href of new Set(sourceMailtos)) {
    if (!deliveredHtml.includes(`href="${href}"`)) {
      failures.push(`${path}: a mailto link is not delivered intact (missing or obfuscated)`);
    }
  }
  const inlineScripts = [...deliveredHtml.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)]
    .filter((match) => !/type="application\/ld\+json"/.test(match[1]));
  if (inlineScripts.length) {
    notes.push(`${path}: ${inlineScripts.length} inline script(s) injected on delivery; the page CSP blocks them`);
  }
  if (/cloudflareinsights\.com\/beacon/.test(deliveredHtml)) {
    failures.push(`${path}: Cloudflare analytics tag present; the Privacy page says no analytics script is delivered`);
  }
  if (/rocket-loader\.min\.js|<script\b[^>]*\btype="[0-9a-f]{16,}-(?:module|text\/javascript)"/.test(deliveredHtml)) {
    failures.push(`${path}: Cloudflare Rocket Loader rewrites the page's scripts; switch it off under Speed, Optimization`);
  }
  for (const url of scriptSources(deliveredHtml, new URL(path, BASE))) {
    if (!allowedScript(url)) {
      failures.push(`${path}: delivers a script the site does not ship: ${url?.href ?? 'an unparseable source'}`);
    }
  }
  return { failures, notes };
}

export function inspectHeaders(path, headers) {
  const failures = [];
  for (const [name, expected] of Object.entries(REQUIRED_HEADERS)) {
    const actual = headers.get(name);
    if (actual !== expected) {
      failures.push(`${path}: header ${name} is ${actual === null ? 'missing' : JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
  }
  return failures;
}

async function main() {
  const failures = [];
  const notes = [];
  const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  for (const path of sitemapPaths(sitemap)) {
    const response = await fetch(BASE + path, { headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (response.status !== 200) {
      failures.push(`${path}: HTTP ${response.status}`);
      continue;
    }
    failures.push(...inspectHeaders(path, response.headers));
    const delivered = await response.text();
    const sourcePath = join(root, path === '/' ? 'index.html' : path.replace(/^\//, '') + 'index.html');
    const result = inspectHtml(path, readFileSync(sourcePath, 'utf8'), delivered);
    failures.push(...result.failures);
    notes.push(...result.notes);
  }
  for (const [from, to] of Object.entries(REDIRECTS)) {
    const response = await fetch(BASE + from, { headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    const location = response.headers.get('location');
    if (response.status !== 301 || location !== BASE + to) {
      failures.push(`${from}: expected 301 to ${to}, got HTTP ${response.status} ${location ?? ''}`.trim());
    }
  }
  for (const path of EXPECTED_ABSENT) {
    const response = await fetch(BASE + path, { headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (response.status !== 404) {
      failures.push(`${path}: expected HTTP 404, got ${response.status}; the Pages build published a page the site never made`);
    }
  }
  for (const note of notes) console.log(`note: ${note}`);
  for (const failure of failures) console.error(failure);
  if (failures.length) return 1;
  console.log(`production delivery checks passed (${notes.length} notes)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
