import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { loadRegister } from '../src/load-register.mjs';
import { rowMatchesEngine } from '../src/register.mjs';
import { fileURLToPath } from 'node:url';
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RATE_SERIES_PATH = join(REPO_ROOT, 'rates/register/series/coal-lsl-levy.json');
const METHODS_PATH = fileURLToPath(new URL('../methods.json', import.meta.url));

test('supported months run from the amended method start to the rate source-check month', () => {
  const register = loadRegister();
  const months = register.supportedMonths();
  assert.equal(months[0], '2024-01');
  assert.equal(months.at(-1), '2026-08');
  assert.equal(months.length, 32);
  assert.equal(register.isSupported('2023-12'), false);
  assert.equal(register.isSupported('2026-09'), false, 'the 18 September check does not cover the whole month');
  assert.equal(register.isSupported('2026-10'), false);
  assert.equal(register.rateFor('2026-08').row_id, '2023-07-01');
  assert.equal(register.rateFor('2026-09'), null, 'a month the check does not wholly cover has no rate');
});

test('the committed SHA256SUMS agrees with the register files the service hashes', () => {
  const register = loadRegister();
  const sums = readFileSync(join(REPO_ROOT, 'rates', 'register', 'SHA256SUMS'), 'utf8');
  assert.ok(sums.includes(`${register.rateSha256}  series/coal-lsl-levy.json`), 'series hash listed');
});

test('a series with no verified row, or a row checked before the method start, supports nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coal-lsl-register-'));
  const series = JSON.parse(readFileSync(RATE_SERIES_PATH, 'utf8'));
  series.rows[0].status = 'unverified';
  series.rows[0].verification_note = 'test';
  const unverified = join(dir, 'unverified.json');
  writeFileSync(unverified, JSON.stringify(series));
  assert.deepEqual(loadRegister({ rateSeriesPath: unverified }).supportedMonths(), []);

  const stale = JSON.parse(readFileSync(RATE_SERIES_PATH, 'utf8'));
  stale.rows[0].verified_at = '2023-08-01';
  const stalePath = join(dir, 'stale.json');
  writeFileSync(stalePath, JSON.stringify(stale));
  assert.deepEqual(loadRegister({ rateSeriesPath: stalePath }).supportedMonths(), [], 'checked before the method existed');

  const methods = JSON.parse(readFileSync(METHODS_PATH, 'utf8'));
  methods.records[0].service_supported = false;
  const methodsPath = join(dir, 'methods.json');
  writeFileSync(methodsPath, JSON.stringify(methods));
  assert.deepEqual(loadRegister({ methodsPath }).supportedMonths(), [], 'no supported method record');
});

test('hashes are of the exact bytes on disk', () => {
  const register = loadRegister();
  assert.equal(register.rateSha256, createHash('sha256').update(readFileSync(RATE_SERIES_PATH)).digest('hex'));
  assert.equal(register.methodsSha256, createHash('sha256').update(readFileSync(METHODS_PATH)).digest('hex'));
});

test('rowMatchesEngine compares the percentage exactly, not as text', () => {
  assert.equal(rowMatchesEngine('2.7'), true);
  assert.equal(rowMatchesEngine('2.70'), true, 'trailing zeros are the same rate');
  assert.equal(rowMatchesEngine('2.700000'), true);
  assert.equal(rowMatchesEngine('2.8'), false);
  assert.equal(rowMatchesEngine('2.71'), false);
  assert.equal(rowMatchesEngine('27'), false, 'a percentage, not a fraction');
  assert.equal(rowMatchesEngine('0.027'), false);
  assert.equal(rowMatchesEngine(2.7), false, 'a float is not a decimal string');
  assert.equal(rowMatchesEngine('two point seven'), false);
  assert.equal(rowMatchesEngine(''), false);
});

test('a verified row the engine does not implement is recorded and never served', () => {
  // The engine owns the arithmetic and its rate is a constant, so a register
  // row carrying a different percentage cannot change the levy. It changed
  // what the response CLAIMED the levy was computed at, which is the figure
  // and its provenance disagreeing inside one response.
  const series = JSON.parse(readFileSync(RATE_SERIES_PATH, 'utf8'));
  const row = JSON.parse(JSON.stringify(series.rows[0]));
  row.row_id = '2026-07-01';
  row.value = '3.1';
  row.period_start = '2026-07-01';
  row.period_end = null;
  row.verified_at = '2026-09-18';
  series.rows[0].period_end = '2026-06-30';
  series.rows.push(row);

  const directory = mkdtempSync(join(tmpdir(), 'coal-lsl-rate-'));
  const path = join(directory, 'series.json');
  writeFileSync(path, JSON.stringify(series));
  const register = loadRegister({ rateSeriesPath: path });

  assert.equal(register.isSupported('2026-08'), false, 'August falls in the unimplemented row');
  assert.equal(register.rateFor('2026-08'), null);
  assert.deepEqual(
    register.unimplementedRows.map((item) => [item.row_id, item.value]),
    [['2026-07-01', '3.1']],
  );
  assert.equal(register.unimplementedRows[0].engine_rate_percent, '2.7');
  // The months the engine still matches stay served.
  assert.equal(register.isSupported('2026-06'), true);
});
