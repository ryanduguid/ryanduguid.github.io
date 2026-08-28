import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  cp,
  copyFile,
  mkdtemp,
  mkdir,
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
import { pathToFileURL } from 'node:url';
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

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

const trackedHashesBefore = {
  calculator: await sha256(CALCULATOR_PATH),
  proof: await sha256(PROOF_PATH),
};
const trackedInodesBefore = {
  calculator: (await stat(CALCULATOR_PATH, { bigint: true })).ino,
  proof: (await stat(PROOF_PATH, { bigint: true })).ino,
};

test.after(async () => {
  assert.deepEqual({
    calculator: await sha256(CALCULATOR_PATH),
    proof: await sha256(PROOF_PATH),
  }, trackedHashesBefore);
  assert.deepEqual({
    calculator: (await stat(CALCULATOR_PATH, { bigint: true })).ino,
    proof: (await stat(PROOF_PATH, { bigint: true })).ino,
  }, trackedInodesBefore);
  assert.deepEqual(await proofTemporarySiblings(), []);
});

test('security tests contain no tracked-path mutation or restoration', async () => {
  const source = await readFile(import.meta.filename, 'utf8');
  const forbidden = [
    ['restore', 'Proof'].join(''),
    ['withCalculator', 'Mutation'].join(''),
    ['writeFile(', 'PROOF_PATH'].join(''),
    ['rm(', 'PROOF_PATH'].join(''),
    ['symlink(target, ', 'PROOF_PATH'].join(''),
    ['writeFile(', 'CALCULATOR_PATH'].join(''),
  ];
  for (const mutation of forbidden) {
    assert.equal(source.includes(mutation), false, `tracked mutation remains: ${mutation}`);
  }
});

async function proofTemporarySiblings() {
  return (await readdir(path.dirname(PROOF_PATH)))
    .filter((name) => name.startsWith(TEMP_PREFIX) && name.endsWith('.tmp'));
}

async function createIsolatedHarness() {
  const harnessRoot = await mkdtemp(path.join(os.tmpdir(), 'coal-lsl-harness-'));
  try {
    await cp(path.join(ROOT, 'assets'), path.join(harnessRoot, 'assets'), {
      recursive: true,
    });
    for (const relative of [
      ['scripts', 'capture-coal-lsl-proof.mjs'],
      ['scripts', 'coal-lsl-proof-fixture.mjs'],
      ['tests', 'browser', 'visual.mjs'],
      ['tools', 'coal-lsl-levy', 'index.html'],
      ['package.json'],
    ]) {
      const target = path.join(harnessRoot, ...relative);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(ROOT, ...relative), target);
    }
    await symlink(
      path.join(ROOT, 'node_modules'),
      path.join(harnessRoot, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const modulePath = path.join(
      harnessRoot,
      'scripts',
      'capture-coal-lsl-proof.mjs',
    );
    const proofPath = path.join(
      harnessRoot,
      'assets',
      'coal-lsl-calculator.webp',
    );
    const calculatorPath = path.join(
      harnessRoot,
      'tools',
      'coal-lsl-levy',
      'index.html',
    );
    return {
      root: harnessRoot,
      proofPath,
      calculatorPath,
      capture: await import(
        `${pathToFileURL(modulePath).href}?harness=${randomUUID()}`
      ),
      temporarySiblings: async () => (
        (await readdir(path.dirname(proofPath)))
          .filter((name) => name.startsWith(TEMP_PREFIX) && name.endsWith('.tmp'))
      ),
      cleanup: () => rm(harnessRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(harnessRoot, { recursive: true, force: true });
    throw error;
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
  const failingHarness = await createIsolatedHarness();
  try {
    const calculator = await readFile(failingHarness.calculatorPath, 'utf8');
    await writeFile(
      failingHarness.calculatorPath,
      calculator.replace('</body>', `${healthProbe}</body>`),
      'utf8',
    );
    await assert.rejects(
      failingHarness.capture.renderCoalLslProof(),
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
  } finally {
    await failingHarness.cleanup();
  }

  const recoveryHarness = await createIsolatedHarness();
  try {
    const recovered = await recoveryHarness.capture.renderCoalLslProof();
    assert.equal(recovered.width, COAL_LSL_PROOF.capture.width);
    assert.equal(recovered.height, COAL_LSL_PROOF.capture.height);
  } finally {
    await recoveryHarness.cleanup();
  }
});

test('fixed capture atomically replaces the proof and removes temporary siblings', async () => {
  const harness = await createIsolatedHarness();
  try {
    const beforeStat = await stat(harness.proofPath, { bigint: true });
    const result = await harness.capture.captureCoalLslProof();
    const after = await readFile(harness.proofPath);
    const afterStat = await stat(harness.proofPath, { bigint: true });
    assert.equal(result.width, COAL_LSL_PROOF.capture.width);
    assert.equal(result.height, COAL_LSL_PROOF.capture.height);
    assert.equal(result.bytes, after.byteLength);
    assert.notEqual(afterStat.ino, beforeStat.ino);
    assert.deepEqual(await harness.temporarySiblings(), []);
  } finally {
    await harness.cleanup();
  }
});

test('fixed capture refuses a destination swapped to a symbolic link during render', async () => {
  const harness = await createIsolatedHarness();
  const target = path.join(harness.root, 'outside-target.webp');
  const sentinel = Buffer.from('outside-target-sentinel');
  let capturePromise;
  try {
    await writeFile(target, sentinel);
    capturePromise = harness.capture.captureCoalLslProof();
    const rejection = assert.rejects(capturePromise, /symbolic-link proof output/);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await rm(harness.proofPath);
    await symlink(target, harness.proofPath, 'file');
    await rejection;
    assert.deepEqual(await readFile(target), sentinel);
    assert.deepEqual(await harness.temporarySiblings(), []);
  } finally {
    await capturePromise?.catch(() => {});
    await harness.cleanup();
  }
});
