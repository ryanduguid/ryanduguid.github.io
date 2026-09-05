import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { results, exactLevyCents } from '../assets/home-levy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const homepage = readFileSync(join(root, 'index.html'), 'utf8');

function inputValue(name) {
  const found = new RegExp(`name="${name}"[^>]*value="([^"]*)"`).exec(homepage);
  assert.ok(found, `no ${name} input in index.html`);
  return Number(found[1]);
}

function shown(key) {
  const found = new RegExp(`data-out="${key}">([^<]*)<`).exec(homepage);
  assert.ok(found, `no ${key} output in index.html`);
  return found[1];
}

// The section ships a complete worked example in static markup so it reads
// correctly with scripting off. That only stays true while the markup agrees
// with the module, which is what this asserts.
test('the figures printed in index.html are the ones the module computes', () => {
  const computed = results({
    base: inputValue('base'),
    overtime: inputValue('overtime'),
    allowances: inputValue('allowances'),
  });
  for (const key of ['formulaA', 'formulaB', 'eligible', 'exact', 'levy']) {
    assert.equal(shown(key), computed[key], `${key} in index.html`);
  }
});

test('the row marked as applied in index.html is the one that actually wins', () => {
  const computed = results({
    base: inputValue('base'),
    overtime: inputValue('overtime'),
    allowances: inputValue('allowances'),
  });
  const applied = /data-row="([AB])"([^>]*)class="is-applied"/.exec(homepage);
  assert.ok(applied, 'no applied row marked in index.html');
  assert.equal(applied[1], computed.winner);
  // Exactly one row may claim to be the applied one.
  assert.equal((homepage.match(/class="is-applied"/g) ?? []).length, 1);
});

test('the worked example shows the greater-of test doing something', () => {
  const computed = results({
    base: inputValue('base'),
    overtime: inputValue('overtime'),
    allowances: inputValue('allowances'),
  });
  // A default where Formula A simply wins would illustrate nothing, since the
  // section exists to show the s 3B(1) comparison changing the answer.
  assert.equal(computed.winner, 'B');
  assert.notEqual(computed.formulaA, computed.formulaB);
});

test('the worked example still lands on a fractional cent', () => {
  // The levy before rounding is shown to four decimals to make the point that
  // rounding happens once, at the end. A default that divided evenly would
  // quietly remove the only evidence of it.
  const eligible = 637500;
  assert.equal(exactLevyCents(eligible), 17212.5);
  assert.equal(shown('exact'), '$172.1250');
  assert.equal(shown('levy'), '$172.13');
});

test('Formula A wins when there is little beyond the base rate', () => {
  const computed = results({ base: 6000, overtime: 0, allowances: 0 });
  assert.equal(computed.winner, 'A');
  assert.equal(computed.formulaA, '$6,000.00');
  assert.equal(computed.eligible, '$6,000.00');
});

test('every amount is formatted as Australian currency', () => {
  const computed = results({ base: 1234.5, overtime: 0, allowances: 0 });
  assert.equal(computed.eligible, '$1,234.50');
  assert.equal(computed.levy, '$33.33');
});
