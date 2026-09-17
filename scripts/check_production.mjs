// Checks the public site as delivered, which the repository's own checks
// cannot see: they run against _site or the local preview, while Cloudflare
// sits in front of GitHub Pages and rewrites what visitors receive.
//
// Hard failures are the promises README.md makes about delivery: the five
// response headers the transform rule adds, the two edge redirects, and
// mailto links that survive delivery (Email Address Obfuscation rewrites them
// and strips the address when it is on). Injected inline scripts and the
// analytics tag are reported, not failed, because they are edge settings the
// page's own Content Security Policy already blocks.
//
// Run with: node scripts/check_production.mjs [--base https://duguid.com.au]

import { readFileSync } from 'node:fs';
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
};

export function sitemapPaths(xml) {
  return [...xml.matchAll(/<loc>https:\/\/duguid\.com\.au([^<]*)<\/loc>/g)].map((match) => match[1]);
}

// Cloudflare's email obfuscation replaces a mailto href with this path and
// decodes it in a script. /privacy/ documents the rewrite, so a delivered href
// that no longer matches the source is expected rather than a fault. One that
// is neither the original nor the rewrite has been dropped, which is a fault.
const EMAIL_PROTECTION = '/cdn-cgi/l/email-protection';

export function inspectHtml(path, sourceHtml, deliveredHtml) {
  const failures = [];
  const notes = [];
  const sourceMailtos = [...sourceHtml.matchAll(/href="(mailto:[^"]+)"/g)].map((match) => match[1]);
  for (const href of new Set(sourceMailtos)) {
    if (deliveredHtml.includes(`href="${href}"`)) continue;
    if (deliveredHtml.includes(EMAIL_PROTECTION)) {
      notes.push(`${path}: a mailto link was rewritten by Cloudflare's email obfuscation, as /privacy/ describes`);
    } else {
      failures.push(`${path}: a mailto link is neither delivered intact nor rewritten by Cloudflare, so it has gone missing`);
    }
  }
  const inlineScripts = [...deliveredHtml.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)]
    .filter((match) => !/type="application\/ld\+json"/.test(match[1]));
  if (inlineScripts.length) {
    notes.push(`${path}: ${inlineScripts.length} inline script(s) injected on delivery; the page CSP blocks them`);
  }
  if (/cloudflareinsights\.com\/beacon/.test(deliveredHtml)) {
    notes.push(`${path}: Cloudflare analytics tag present; the page CSP blocks it`);
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
