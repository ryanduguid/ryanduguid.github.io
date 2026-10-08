import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { headerNotes, inspectHtml, sitemapPaths, REQUIRED_HEADERS, REDIRECTS } from './check_production.mjs';

// The address is only a fixture; the checks never hard-code the real one.
const SOURCE = '<p>Write to <a href="mailto:someone@example.com">someone@example.com</a>.</p>';

test('a mailto delivered intact passes without comment', () => {
  const { failures, notes } = inspectHtml('/contact/', SOURCE, SOURCE);
  assert.deepEqual(failures, []);
  assert.deepEqual(notes, []);
});

test('an obfuscated mailto fails the intact delivery requirement', () => {
  const delivered =
    '<p>Write to <a href="/cdn-cgi/l/email-protection#abc">[email&#160;protected]</a>.</p>';
  const { failures, notes } = inspectHtml('/contact/', SOURCE, delivered);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /not delivered intact/);
  assert.deepEqual(notes, []);
});

test('a missing mailto is a failure', () => {
  const { failures } = inspectHtml('/contact/', SOURCE, '<p>Write to us.</p>');
  assert.equal(failures.length, 1);
  assert.match(failures[0], /not delivered intact/);
});

test('an unrelated obfuscation marker cannot hide a missing mailto', () => {
  const delivered = '<p data-path="/cdn-cgi/l/email-protection">Write to us.</p>';
  const { failures } = inspectHtml('/contact/', SOURCE, delivered);
  assert.equal(failures.length, 1);
});

test('Rocket Loader fails by its loader script or a re-typed page script', () => {
  // The loader is also a script the site does not ship, so it fails both rules.
  for (const [delivered, count] of [
    [`${SOURCE}<script src="/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js" defer></script>`, 2],
    [`${SOURCE}<script type="f08f7cd8f54470ab5e2006e7-module" src="/assets/levy-page.mjs"></script>`, 1],
    [`${SOURCE}<script defer src="/assets/view-mode.mjs" type="f08f7cd8f54470ab5e2006e7-text/javascript"></script>`, 1],
  ]) {
    const { failures } = inspectHtml('/tools/coal-lsl-levy/', SOURCE, delivered);
    assert.equal(failures.length, count, delivered);
    assert.match(failures[0], /Rocket Loader/);
  }
});

test('module scripts the page ships itself pass', () => {
  const delivered = `${SOURCE}<script type="module" src="/assets/levy-page.mjs"></script><script type="application/ld+json">{}</script>`;
  assert.deepEqual(inspectHtml('/tools/coal-lsl-levy/', SOURCE, delivered).failures, []);
});

test('a script the site does not ship fails, same-origin or not', () => {
  for (const src of [
    'https://duguid.com.au/.webmcp/bridge.js',
    '/.webmcp/bridge.js',
    'https://cdn.example.net/tag.js',
  ]) {
    const delivered = `${SOURCE}<script type="module" src="${src}" data-packs="c2pa"></script>`;
    const { failures } = inspectHtml('/tools/', SOURCE, delivered);
    assert.equal(failures.length, 1, src);
    assert.match(failures[0], /a script the site does not ship/);
  }
});

test('a script is read however its tag is written and resolved before it is judged', () => {
  for (const tag of [
    "<script src='/.webmcp/bridge.js'>",
    '<script src=/.webmcp/bridge.js>',
    '<SCRIPT SRC="/.webmcp/bridge.js">',
    '<script data-note="a>b" src="/.webmcp/bridge.js">',
    '<script src="/assets/../evil.js">',
    '<script src="/assets/%2e%2e/evil.js">',
    '<script src="/cdn-cgi/../evil.js">',
    '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js">',
    '<script src="/assets/not-shipped.mjs">',
    '<script src="http://[">',
  ]) {
    const { failures } = inspectHtml('/tools/', SOURCE, `${SOURCE}${tag}</script>`);
    assert.equal(failures.length, 1, tag);
    assert.match(failures[0], /a script the site does not ship/, tag);
  }
  const shipped = `${SOURCE}<script type=module src='https://duguid.com.au/assets/levy-page.mjs?v=1'></script>`;
  assert.deepEqual(inspectHtml('/tools/', SOURCE, shipped).failures, []);
});

test('no message repeats the address itself', () => {
  const { failures } = inspectHtml('/contact/', SOURCE, '<p>Write to us.</p>');
  assert.equal(failures.some((line) => line.includes('someone@example.com')), false);
});

test('an inline script is reported as a note, a JSON-LD block is not', () => {
  const delivered = SOURCE + '<script type="application/ld+json">{}</script><script>x()</script>';
  const { failures, notes } = inspectHtml('/contact/', SOURCE, delivered);
  assert.deepEqual(failures, []);
  assert.equal(notes.filter((line) => line.includes('inline script')).length, 1);
});

test('sitemapPaths reads the site paths out of the sitemap', () => {
  const xml = '<url><loc>https://duguid.com.au/</loc></url>'
    + '<url><loc>https://duguid.com.au/contact/</loc></url>';
  assert.deepEqual(sitemapPaths(xml), ['/', '/contact/']);
});

test('a sampled report-only policy is a note, and its absence says nothing', () => {
  const policy = "script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'";
  const sampled = new Headers({ 'content-security-policy-report-only': policy });
  assert.deepEqual(headerNotes('/changelog/', sampled), [`/changelog/: report-only CSP delivered: ${policy}`]);
  assert.deepEqual(headerNotes('/changelog/', new Headers()), []);
});

test('the CLI uses the extracted artifact tree before and after publication', async (t) => {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'delivery-source-'));
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  mkdirSync(join(sourceRoot, 'assets'));
  mkdirSync(join(sourceRoot, 'contact'));
  writeFileSync(join(sourceRoot, 'assets', 'fixture.mjs'), 'export {};');
  const html = `${SOURCE}<script type="module" src="/assets/fixture.mjs"></script>`;
  writeFileSync(join(sourceRoot, 'index.html'), html);
  writeFileSync(join(sourceRoot, 'contact', 'index.html'), html);
  writeFileSync(join(sourceRoot, 'sitemap.xml'), '<loc>https://duguid.com.au/</loc><loc>https://duguid.com.au/contact/</loc>');
  let injected = false;
  let base;
  const server = createServer((request, response) => {
    if (request.url in REDIRECTS) {
      response.writeHead(301, { location: base + REDIRECTS[request.url] }).end();
    } else if (request.url === '/' || request.url === '/contact/') {
      response.writeHead(200, REQUIRED_HEADERS).end(html + (injected ? '<script src="/.webmcp/bridge.js"></script>' : ''));
    } else response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const cli = (root, sourceOnly = false) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./check_production.mjs', import.meta.url)), '--source-root', root, '--base', base, ...(sourceOnly ? ['--source-only'] : [])]);
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
  assert.equal((await cli(sourceRoot, true)).code, 0);
  assert.equal((await cli(sourceRoot)).code, 0);
  injected = true;
  const failed = await cli(sourceRoot);
  assert.equal(failed.code, 1);
  assert.match(failed.output, /a script the site does not ship/);
  rmSync(join(sourceRoot, 'contact', 'index.html'));
  assert.equal((await cli(sourceRoot, true)).code, 1);
});
