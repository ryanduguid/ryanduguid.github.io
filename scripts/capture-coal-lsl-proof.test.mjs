import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { COAL_LSL_PROOF } from './coal-lsl-proof-fixture.mjs';
import {
  captureCoalLslProof,
  renderCoalLslProof,
} from './capture-coal-lsl-proof.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROOF_PATH = path.join(ROOT, 'assets', 'coal-lsl-calculator.webp');
const CAPTURE_MODULE = path.join(ROOT, 'scripts', 'capture-coal-lsl-proof.mjs');
const CALCULATOR_PATH = path.join(ROOT, 'tools', 'coal-lsl-levy', 'index.html');
const TEMP_PREFIX = `.${path.basename(PROOF_PATH)}.`;
const execFileAsync = promisify(execFile);

async function proofTemporarySiblings() {
  return (await readdir(path.dirname(PROOF_PATH)))
    .filter((name) => name.startsWith(TEMP_PREFIX) && name.endsWith('.tmp'));
}

async function restoreProof(original) {
  const current = await lstat(PROOF_PATH).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (current) await rm(PROOF_PATH, { force: true });
  await writeFile(PROOF_PATH, original);
}

async function withCalculatorMutation(mutate, action) {
  const original = await readFile(CALCULATOR_PATH, 'utf8');
  await writeFile(CALCULATOR_PATH, mutate(original), 'utf8');
  try {
    return await action();
  } finally {
    await writeFile(CALCULATOR_PATH, original, 'utf8');
  }
}

test('renders the deterministic Coal LSL result without writing', async () => {
  const before = await readFile(PROOF_PATH);
  const first = await renderCoalLslProof();
  const second = await renderCoalLslProof();
  for (const result of [first, second]) {
    assert.equal(result.width, COAL_LSL_PROOF.capture.width);
    assert.equal(result.height, COAL_LSL_PROOF.capture.height);
    assert.equal(result.bytes, result.image.byteLength);
    assert.ok(result.bytes > 0);
    assert.ok(result.bytes <= COAL_LSL_PROOF.capture.maxBytes);
    assert.equal(result.image.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(result.image.subarray(8, 12).toString('ascii'), 'WEBP');
  }
  assert.equal(second.width, first.width);
  assert.equal(second.height, first.height);
  assert.equal(second.bytes, first.bytes);
  assert.deepEqual(second.image, first.image);
  assert.deepEqual(await readFile(PROOF_PATH), before);
});

test('fixed-destination capture rejects every caller-supplied option', async () => {
  await assert.rejects(
    captureCoalLslProof({ outputPath: path.join(ROOT, 'work', 'proof.webp') }),
    /does not accept options/,
  );
});

test('direct CLI rejects trailing arguments before browser launch', async () => {
  const before = await readFile(PROOF_PATH);
  const work = await mkdtemp(path.join(os.tmpdir(), 'coal-lsl-cli-'));
  const elsewhere = path.join(work, 'elsewhere.webp');
  try {
    await assert.rejects(
      execFileAsync(
        process.execPath,
        [CAPTURE_MODULE, '--output', elsewhere],
        {
          cwd: ROOT,
          env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: work },
        },
      ),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /does not accept CLI arguments/);
        assert.doesNotMatch(error.stderr, /Executable doesn't exist/);
        return true;
      },
    );
    assert.deepEqual(await readFile(PROOF_PATH), before);
    await assert.rejects(readFile(elsewhere), { code: 'ENOENT' });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test('request and browser-health failures reject capture and release resources', async () => {
  const healthProbe = String.raw`
    <script>
      const drain = (url, options) => fetch(url, options)
        .then((response) => response.text())
        .catch(() => {});
      void drain('/%ZZ');
      void drain('/..%2fpackage.json');
      void drain('/', { method: 'POST' });
      void drain('/package.json');
      void drain('https://example.invalid/proof-boundary');
      console.error('proof-health-sentinel');
    </script>
  `;
  await withCalculatorMutation(
    (html) => html.replace('</body>', `${healthProbe}</body>`),
    async () => {
      await assert.rejects(
        renderCoalLslProof(),
        (error) => {
          assert.match(error.message, /Proof capture browser health failed/);
          assert.match(error.message, /calculator HTTP 400: .*\/%ZZ/);
          assert.match(error.message, /calculator HTTP 403: .*\/\.\.%2fpackage\.json/i);
          assert.match(error.message, /calculator HTTP 405: .*\/$/m);
          assert.match(error.message, /calculator HTTP 415: .*\/package\.json/);
          assert.match(
            error.message,
            /calculator requestfailed: https:\/\/example\.invalid\/proof-boundary/,
          );
          assert.match(error.message, /calculator console: proof-health-sentinel/);
          return true;
        },
      );
    },
  );

  const recovered = await renderCoalLslProof();
  assert.equal(recovered.width, COAL_LSL_PROOF.capture.width);
  assert.equal(recovered.height, COAL_LSL_PROOF.capture.height);
});

test('fixed capture atomically replaces the proof and removes temporary siblings', async () => {
  const before = await readFile(PROOF_PATH);
  const beforeStat = await stat(PROOF_PATH, { bigint: true });
  try {
    const result = await captureCoalLslProof();
    const after = await readFile(PROOF_PATH);
    const afterStat = await stat(PROOF_PATH, { bigint: true });
    assert.equal(result.width, COAL_LSL_PROOF.capture.width);
    assert.equal(result.height, COAL_LSL_PROOF.capture.height);
    assert.equal(result.bytes, after.byteLength);
    assert.notEqual(afterStat.ino, beforeStat.ino);
    assert.deepEqual(await proofTemporarySiblings(), []);
  } finally {
    await restoreProof(before);
  }
});

test('fixed capture refuses a destination swapped to a symbolic link during render', async () => {
  const before = await readFile(PROOF_PATH);
  const work = await mkdtemp(path.join(os.tmpdir(), 'coal-lsl-symlink-'));
  const target = path.join(work, 'target.webp');
  const sentinel = Buffer.from('outside-target-sentinel');
  let capturePromise;
  try {
    await writeFile(target, sentinel);
    capturePromise = captureCoalLslProof();
    const rejection = assert.rejects(capturePromise, /symbolic-link proof output/);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await rm(PROOF_PATH);
    await symlink(target, PROOF_PATH, 'file');
    await rejection;
    assert.deepEqual(await readFile(target), sentinel);
    assert.deepEqual(await proofTemporarySiblings(), []);
  } finally {
    await capturePromise?.catch(() => {});
    await restoreProof(before);
    await rm(work, { recursive: true, force: true });
  }
  assert.deepEqual(await readFile(PROOF_PATH), before);
});
