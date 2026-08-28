import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { COAL_LSL_PROOF } from './coal-lsl-proof-fixture.mjs';
import {
  captureCoalLslProof,
  renderCoalLslProof,
} from './capture-coal-lsl-proof.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROOF_PATH = path.join(ROOT, 'assets', 'coal-lsl-calculator.webp');

test('renders the deterministic Coal LSL result without writing', async () => {
  const before = await readFile(PROOF_PATH);
  const result = await renderCoalLslProof();
  assert.equal(result.width, COAL_LSL_PROOF.capture.width);
  assert.equal(result.height, COAL_LSL_PROOF.capture.height);
  assert.equal(result.bytes, result.image.byteLength);
  assert.ok(result.bytes > 0);
  assert.ok(result.bytes <= COAL_LSL_PROOF.capture.maxBytes);
  assert.equal(result.image.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(result.image.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.deepEqual(await readFile(PROOF_PATH), before);
});

test('fixed-destination capture rejects every caller-supplied option', async () => {
  await assert.rejects(
    captureCoalLslProof({ outputPath: path.join(ROOT, 'work', 'proof.webp') }),
    /does not accept options/,
  );
});
