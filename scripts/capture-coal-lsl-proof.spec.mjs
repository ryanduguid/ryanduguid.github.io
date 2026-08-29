import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { COAL_LSL_PROOF } from './coal-lsl-proof-fixture.mjs';
import {
  renderCoalLslProofPage,
  writeCoalLslProof,
} from './capture-coal-lsl-proof.mjs';

test('renders the fixed Coal LSL proof within its published image contract', async ({ page }, testInfo) => {
  const proofPath = new URL('../assets/coal-lsl-calculator.webp', import.meta.url);
  const publishedProof = await readFile(proofPath);
  const image = await renderCoalLslProofPage(page);

  expect(image.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(image.subarray(8, 12).toString('ascii')).toBe('WEBP');
  expect(image.byteLength).toBeLessThanOrEqual(COAL_LSL_PROOF.capture.maxBytes);

  if (testInfo.config.updateSnapshots === 'all') {
    await writeCoalLslProof(image);
  } else {
    expect(await readFile(proofPath)).toEqual(publishedProof);
  }
});
