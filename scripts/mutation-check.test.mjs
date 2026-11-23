// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildNamePattern,
  checkMutation,
  createTapTracker,
  indexSuiteTests,
  rankCandidateTests,
  interleaveQueue,
  resolveWorkerCount,
  verdict,
} from './mutation-check.mjs';

test('resolveWorkerCount removes the cap of 4 and honours MUTATION_WORKERS', () => {
  assert.equal(resolveWorkerCount(undefined, 16, 100), 16);
  assert.equal(resolveWorkerCount('', 16, 100), 16);
  assert.equal(resolveWorkerCount('  ', 12, 5), 5);
  assert.equal(resolveWorkerCount('6', 16, 100), 6);
  assert.equal(resolveWorkerCount('20', 4, 12), 12);
  assert.equal(resolveWorkerCount(undefined, 8, 0), 1);
  assert.throws(() => resolveWorkerCount('0', 8, 10), RangeError);
  assert.throws(() => resolveWorkerCount('-2', 8, 10), RangeError);
  assert.throws(() => resolveWorkerCount('abc', 8, 10), RangeError);
  assert.throws(() => resolveWorkerCount('1.5', 8, 10), RangeError);
});

test('buildNamePattern escapes regex metacharacters and respects maxLength', () => {
  assert.equal(buildNamePattern([]), null);
  const pattern = buildNamePattern(['costs $100 (a+b) [1]?', 'plain']);
  assert.equal(pattern, '^(?:costs \\$100 \\(a\\+b\\) \\[1\\]\\?|plain)$');
  assert.equal(buildNamePattern(['abcdef', 'ghijkl'], 14), '^(?:abcdef)$');
  assert.equal(buildNamePattern(['too-long-name'], 10), null);
});

test('interleaveQueue spreads distinct (file, test) groups round-robin', () => {
  const mutations = [
    { file: 'a.mjs', test: 't1.mjs' },
    { file: 'a.mjs', test: 't1.mjs' },
    { file: 'a.mjs', test: 't1.mjs' },
    { file: 'b.mjs', test: 't1.mjs' },
    { file: 'b.mjs', test: 't1.mjs' },
    { file: 'c.mjs', test: 't2.mjs' },
  ];
  assert.deepEqual(interleaveQueue([0, 1, 2, 3, 4, 5], mutations), [0, 3, 5, 1, 4, 2]);
});

test('createTapTracker recognises real assertion failures across split chunks and ignores spoofs', () => {
  const spoof = [
    'TAP version 13',
    'not ok 1 - spoofed error',
    '  ---',
    "  failureType: 'testCodeFailure'",
    '  error: |-',
    '    not ok 9 - inner fake',
    "      code: 'ERR_ASSERTION'",
    "  code: 'ERR_TEST_FAILURE'",
    '  ...',
    'not ok 2 - real \\# killer \\\\ test',
    '  ---',
    "  failureType: 'testCodeFailure'",
    "  code: 'ERR_ASSERTION'",
    '  ...',
    '',
  ].join('\r\n');

  const tracker = createTapTracker();
  let stoppedEarly = false;
  for (let i = 0; i < spoof.length; i += 7) {
    if (tracker.feed(spoof.slice(i, i + 7))) stoppedEarly = true;
  }
  assert.equal(stoppedEarly, true);
  assert.deepEqual(tracker.flush(), { caught: true, killer: 'real # killer \\ test', passed: [] });
});

test('createTapTracker rejects module-level assertions without testCodeFailure', () => {
  const topLevel = [
    'TAP version 13',
    'not ok 1 - scripts/broken.test.mjs',
    '  ---',
    "  code: 'ERR_ASSERTION'",
    '  ...',
    '',
  ].join('\n');
  const tracker = createTapTracker();
  assert.equal(tracker.feed(topLevel), false);
  assert.deepEqual(tracker.flush(), { caught: false, killer: null, passed: [] });
});

const withFixture = async (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-check-unit-'));
  const template = join(dir, 'template');
  const worker = join(dir, 'worker');
  mkdirSync(join(template, 'assets'), { recursive: true });
  mkdirSync(join(template, 'scripts'), { recursive: true });
  mkdirSync(join(worker, 'assets'), { recursive: true });
  mkdirSync(join(worker, 'scripts'), { recursive: true });
  const engine = 'export const add = (a, b) => a + b;\nexport const mul = (a, b) => a * b;\n';
  const suite = [
    "import assert from 'node:assert/strict';",
    "import test from 'node:test';",
    "import { add, mul } from '../assets/calc.mjs';",
    "test('add returns sum ($1 + $2)', () => { assert.equal(add(1, 2), 3); });",
    "test('mul returns product', () => { assert.equal(mul(3, 4), 12); });",
    "test('slow tail test', async () => { await new Promise((r) => setTimeout(r, 400)); assert.equal(1, 1); });",
    '',
  ].join('\n');
  writeFileSync(join(template, 'assets/calc.mjs'), engine);
  writeFileSync(join(template, 'scripts/calc.test.mjs'), suite);
  copyFileSync(join(template, 'assets/calc.mjs'), join(worker, 'assets/calc.mjs'));
  copyFileSync(join(template, 'scripts/calc.test.mjs'), join(worker, 'scripts/calc.test.mjs'));
  return fn({ template, worker, engine }).finally(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  });
};

test('verdict and checkMutation handle caught, survived, invalid controls, fail-fast and fallback', async () => {
  await withFixture(async ({ template, worker, engine }) => {
    const killers = new Map();

    // Baseline survives
    const base = await verdict(template, 'scripts/calc.test.mjs', { failFast: false });
    assert.deepEqual(base, { status: 'survived', killer: null, passed: [] });

    // Broken import control is strictly invalid
    const broken = await checkMutation(worker, template, engine, {
      file: 'assets/calc.mjs',
      test: 'scripts/calc.test.mjs',
      find: 'export const add',
      replace: "import './missing.mjs';\nexport const add",
    });
    assert.equal(broken, 'invalid');

    // Syntax error is strictly invalid
    const syntaxErr = await checkMutation(worker, template, engine, {
      file: 'assets/calc.mjs',
      test: 'scripts/calc.test.mjs',
      find: 'a + b',
      replace: 'a + + * b',
    }, killers);
    assert.equal(syntaxErr, 'invalid');

    // ReferenceError inside a test is strictly invalid
    const refErr = await checkMutation(worker, template, engine, {
      file: 'assets/calc.mjs',
      test: 'scripts/calc.test.mjs',
      find: 'a + b',
      replace: 'noSuchVar + b',
    }, killers);
    assert.equal(refErr, 'invalid');

    // Real mutation is caught, fails fast before slow tail, and populates killer cache
    const t0 = performance.now();
    const caughtAdd = await checkMutation(worker, template, engine, {
      file: 'assets/calc.mjs',
      test: 'scripts/calc.test.mjs',
      find: 'a + b',
      replace: 'a - b',
    }, killers);
    const elapsed = performance.now() - t0;
    assert.equal(caughtAdd, 'caught');
    assert.ok(elapsed < 380, `expected fail-fast before 400 ms tail test, took ${Math.round(elapsed)} ms`);
    assert.deepEqual([...killers.get('assets/calc.mjs\0scripts/calc.test.mjs')], ['add returns sum ($1 + $2)']);

    // Different mutation misses cached killer, falls back to full suite, catches and learns second killer
    const caughtMul = await checkMutation(worker, template, engine, {
      file: 'assets/calc.mjs',
      test: 'scripts/calc.test.mjs',
      find: 'a * b',
      replace: 'a + b',
    }, killers);
    assert.equal(caughtMul, 'caught');
    assert.deepEqual(
      [...killers.get('assets/calc.mjs\0scripts/calc.test.mjs')],
      ['add returns sum ($1 + $2)', 'mul returns product'],
    );

    // Surviving no-op mutation still reports survived after targeted miss + full fallback
    const survived = await checkMutation(worker, template, engine, {
      file: 'assets/calc.mjs',
      test: 'scripts/calc.test.mjs',
      find: 'a + b',
      replace: '(a + b)',
    }, killers);
    assert.equal(survived, 'survived');

    // Worker file restored after every mutation
    assert.equal(readFileSync(join(worker, 'assets/calc.mjs'), 'utf8'), engine);
  });
});

test('indexSuiteTests and rankCandidateTests prioritise learned killers and matching tokens', () => {
  const indexed = indexSuiteTests([
    'unrelated depreciation test',
    'cgt boundary case: ATO example 13',
    'the 6 years a rented home can stay the main residence',
    'each refusal',
  ]);
  const ranked = rankCandidateTests(
    indexed,
    { file: 'assets/cgt.mjs', name: 'CGT main residence 6 years', find: 'mainResidence' },
    new Set(['each refusal']),
  );
  assert.equal(ranked[0], 'each refusal');
  assert.equal(ranked[1], 'the 6 years a rented home can stay the main residence');
  assert.equal(ranked[2], 'cgt boundary case: ATO example 13');
  assert.equal(ranked.length, 3);
});

test('verdict collects passed top-level test names when collectPassed is true', async () => {
  await withFixture(async ({ template }) => {
    const base = await verdict(template, 'scripts/calc.test.mjs', { failFast: false, collectPassed: true });
    assert.equal(base.status, 'survived');
    assert.deepEqual(base.passed, [
      'add returns sum ($1 + $2)',
      'mul returns product',
      'slow tail test',
    ]);
  });
});

test('verdict and checkMutation invalidate per-worker compile cache across mutations', async () => {
  await withFixture(async ({ template, worker, engine }) => {
    const cacheDir = join(worker, '.v8-cache');
    const caught = await checkMutation(worker, template, engine, {
      file: 'assets/calc.mjs',
      test: 'scripts/calc.test.mjs',
      find: 'a + b',
      replace: 'a - b',
    }, null, null, cacheDir);
    assert.equal(caught, 'caught');
    const survived = await checkMutation(worker, template, engine, {
      file: 'assets/calc.mjs',
      test: 'scripts/calc.test.mjs',
      find: 'a + b',
      replace: 'a + b',
    }, null, null, cacheDir);
    assert.equal(survived, 'survived');
  });
});
