import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { loadRegister, RATE_SERIES_PATH, METHODS_PATH, REPO_ROOT } from '../src/register.mjs';

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
