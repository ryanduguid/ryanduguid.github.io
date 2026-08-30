import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { COAL_LSL_PROOF } from './coal-lsl-proof-fixture.mjs';
import {
  renderCoalLslProofPage,
  writeCoalLslProof,
} from './capture-coal-lsl-proof.mjs';

// Canvas size straight from the WebP container, so the published proof can be
// held to the capture contract without decoding it. A file Chromium wrote is
// VP8X, but read the two simple forms as well rather than assume the encoder.
function webpCanvasSize(image) {
  const chunk = image.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X') {
    return {
      width: image.readUIntLE(24, 3) + 1,
      height: image.readUIntLE(27, 3) + 1,
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: image.readUInt16LE(26) & 0x3fff,
      height: image.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = image.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  throw new Error(`Unrecognised WebP chunk: ${JSON.stringify(chunk)}`);
}

function expectProofContract(image, label) {
  expect(image.subarray(0, 4).toString('ascii'), `${label} RIFF`).toBe('RIFF');
  expect(image.subarray(8, 12).toString('ascii'), `${label} WEBP`).toBe('WEBP');
  expect(image.byteLength, `${label} byte budget`)
    .toBeLessThanOrEqual(COAL_LSL_PROOF.capture.maxBytes);
  expect(webpCanvasSize(image), `${label} canvas size`).toEqual({
    width: COAL_LSL_PROOF.capture.width,
    height: COAL_LSL_PROOF.capture.height,
  });
}

test('renders the fixed Coal LSL proof within its published image contract', async ({ page }, testInfo) => {
  const proofPath = new URL('../assets/coal-lsl-calculator.webp', import.meta.url);
  const publishedProof = await readFile(proofPath);
  const image = await renderCoalLslProofPage(page);

  expectProofContract(image, 'rendered proof');

  if (testInfo.config.updateSnapshots === 'all') {
    await writeCoalLslProof(image);
    return;
  }

  // The rendered bytes are deliberately not compared with the published ones.
  // This WebP comes from canvas.toDataURL in whichever Chromium the runner
  // carries, over a PNG screenshot whose text the host rasterised, so both
  // layers differ across platforms. CI runs Windows and the committed proof
  // was captured elsewhere, which made a byte comparison unsatisfiable rather
  // than strict. What the proof actually promises is checked instead, on the
  // published file this time and not only on the fresh render: it is a WebP
  // of the contracted canvas size inside the same byte budget. The figures it
  // depicts are covered above, because renderCoalLslProofPage matches every
  // one of them against COAL_LSL_PROOF and throws when any has drifted.
  expectProofContract(publishedProof, 'published proof');
});
