import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inspectHtml, sitemapPaths } from './check_production.mjs';

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
