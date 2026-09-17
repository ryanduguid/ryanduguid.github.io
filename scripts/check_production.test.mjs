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

test("Cloudflare's documented rewrite is a note, not a failure", () => {
  const delivered =
    '<p>Write to <a href="/cdn-cgi/l/email-protection#abc">[email&#160;protected]</a>.</p>';
  const { failures, notes } = inspectHtml('/contact/', SOURCE, delivered);
  assert.deepEqual(failures, []);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /rewritten by Cloudflare/);
});

test('a mailto that is neither intact nor rewritten is a failure', () => {
  const { failures } = inspectHtml('/contact/', SOURCE, '<p>Write to us.</p>');
  assert.equal(failures.length, 1);
  assert.match(failures[0], /gone missing/);
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
