import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { periodOf, australianToday, toTabSeparated } from '../assets/rate-tables.mjs';

test('row headers map to the dates they cover', () => {
  assert.deepEqual(periodOf('2026-27'), ['2026-07-01', '2027-06-30']);
  assert.deepEqual(periodOf('1999-00'), ['1999-07-01', '2000-06-30']);
  assert.deepEqual(periodOf('31 March 2027'), ['2026-04-01', '2027-03-31']);
  assert.deepEqual(periodOf('1 July 2024 to 30 June 2025'), ['2024-07-01', '2025-06-30']);
  assert.deepEqual(periodOf(' 1 July 2025\n onwards '), ['2025-07-01', '9999-12-31']);
});

test('headers in no known form mark nothing', () => {
  for (const label of ['2026-28', '2026', '30 June 2027', '1 Juli 2025 onwards', 'Income year']) {
    assert.equal(periodOf(label), null, label);
  }
});

test('today is the Canberra date, not the reader clock', () => {
  // 30 June 2026 at 14:30 UTC is 1 July 2026 at 00:30 in Canberra.
  assert.equal(australianToday(new Date('2026-06-30T14:30:00Z')), '2026-07-01');
  assert.equal(australianToday(new Date('2026-06-30T13:59:00Z')), '2026-06-30');
  // Daylight saving: 31 March 2027 at 13:30 UTC is 1 April 2027 at 00:30 AEDT.
  assert.equal(australianToday(new Date('2027-03-31T13:30:00Z')), '2027-04-01');
});

test('copied rows paste one value per cell', () => {
  assert.equal(
    toTabSeparated([['Income year', 'Car limit'], ['2026-27', '$69,883'], ['A\tsplit\n cell', ' x ']]),
    'Income year\tCar limit\n2026-27\t$69,883\nA split cell\tx',
  );
});

test('every rate table row header on a page loading the script is in a known form', () => {
  const pages = readdirSync('rates', { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(`rates/${entry.name}/index.html`))
    .map((entry) => `rates/${entry.name}/index.html`)
    .filter((page) => readFileSync(page, 'utf8').includes('/assets/rate-tables.mjs'));
  assert.ok(pages.length >= 6, `expected the 6 rate pages, found ${pages.length}`);
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    // Attribute order and quoting vary, so match the way the browser reads them.
    const tables = [...html.matchAll(/<table\b[^>]*\brate-figures\b[^>]*>([\s\S]*?)<\/table>/g)];
    assert.ok(tables.length > 0, `${page} has no rate table`);
    for (const [, table] of tables) {
      const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/.exec(table)?.[1] ?? '';
      // The script reads each header's text, so markup inside a header is dropped here too.
      for (const [, cell] of body.matchAll(/<th\b[^>]*\bscope\s*=\s*["']?row\b[^>]*>([\s\S]*?)<\/th>/g)) {
        const label = cell.split(/<[^>]*>/).join('');
        assert.notEqual(periodOf(label), null, `${page}: ${label}`);
      }
    }
  }
});
