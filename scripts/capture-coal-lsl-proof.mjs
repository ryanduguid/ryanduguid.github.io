import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { COAL_LSL_PROOF } from './coal-lsl-proof-fixture.mjs';
import { observePageHealth } from '../tests/browser/health.mjs';
import { waitForVisualFonts } from '../tests/browser/visual.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROOF_OUTPUT = path.join(ROOT, 'assets', 'coal-lsl-calculator.webp');

function normalisedText(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

async function assertContains(locator, expected, label) {
  await locator.waitFor({ state: 'visible' });
  const actual = normalisedText(await locator.textContent());
  if (!actual.includes(normalisedText(expected))) {
    throw new Error(`${label} mismatch: ${actual}`);
  }
}

export async function renderCoalLslProofPage(page) {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/', { waitUntil: 'networkidle' });
  await waitForVisualFonts(page);

  await page.getByRole('radio', {
    name: COAL_LSL_PROOF.branchName,
    exact: true,
  }).check();
  await page.getByRole('spinbutton', {
    name: 'Base rate of pay',
    exact: true,
  }).fill(COAL_LSL_PROOF.inputs.baseRate);
  await page.getByLabel('Overtime and penalty rates')
    .fill(COAL_LSL_PROOF.inputs.overtimeAndPenalties);
  await page.getByLabel('Allowances, excluding expense reimbursements')
    .fill(COAL_LSL_PROOF.inputs.allowances);
  await page.getByLabel('Salary sacrificed amount')
    .fill(COAL_LSL_PROOF.inputs.salarySacrifice);
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  const result = page.getByRole('status');
  for (const [kind, expected] of Object.entries({
    'formula-a': COAL_LSL_PROOF.expected.formulaA,
    'formula-b': COAL_LSL_PROOF.expected.formulaB,
    'eligible-wages': COAL_LSL_PROOF.expected.eligibleWages,
    levy: COAL_LSL_PROOF.expected.levy,
    branch: COAL_LSL_PROOF.expected.branch,
  })) {
    await assertContains(result.locator(`[data-result-kind="${kind}"]`), expected, kind);
  }
  await assertContains(
    result.locator('.result-why'),
    COAL_LSL_PROOF.expected.explanation,
    'explanation',
  );

  const panel = page.locator('.calculator-result');
  await panel.evaluate((element, capture) => {
    const background = getComputedStyle(document.body).backgroundColor;
    document.body.replaceChildren(element);
    Object.assign(document.documentElement.style, {
      width: `${capture.width}px`,
      height: `${capture.height}px`,
      margin: '0',
      overflow: 'hidden',
    });
    Object.assign(document.body.style, {
      width: `${capture.width}px`,
      height: `${capture.height}px`,
      minHeight: '0',
      margin: '0',
      overflow: 'hidden',
      background,
    });
    Object.assign(element.style, {
      boxSizing: 'border-box',
      width: `${capture.width}px`,
      height: `${capture.height}px`,
      maxWidth: 'none',
      minWidth: '0',
      margin: '0',
      position: 'static',
      overflow: 'hidden',
      background,
    });
  }, COAL_LSL_PROOF.capture);

  const bounds = await panel.boundingBox();
  if (
    !bounds
    || Math.round(bounds.width) !== COAL_LSL_PROOF.capture.width
    || Math.round(bounds.height) !== COAL_LSL_PROOF.capture.height
  ) {
    throw new Error(`Unexpected proof bounds: ${JSON.stringify(bounds)}`);
  }
  const scrollHeight = await panel.evaluate((element) => element.scrollHeight);
  if (scrollHeight > COAL_LSL_PROOF.capture.height) {
    throw new Error(`Proof content exceeds capture height: ${scrollHeight}`);
  }

  const png = await panel.screenshot({
    type: 'png',
    animations: 'disabled',
    caret: 'hide',
  });
  const webpUrl = await page.evaluate(async ({ pngBase64, capture }) => {
    const source = new Image();
    source.src = `data:image/png;base64,${pngBase64}`;
    await source.decode();
    const canvas = document.createElement('canvas');
    canvas.width = capture.width;
    canvas.height = capture.height;
    const drawing = canvas.getContext('2d');
    if (!drawing) throw new Error('Canvas 2D context unavailable');
    drawing.drawImage(source, 0, 0, capture.width, capture.height);
    return canvas.toDataURL('image/webp', capture.quality);
  }, {
    pngBase64: png.toString('base64'),
    capture: COAL_LSL_PROOF.capture,
  });
  health.assertHealthy();
  return Buffer.from(webpUrl.slice('data:image/webp;base64,'.length), 'base64');
}

export async function writeCoalLslProof(image) {
  const temporary = `${PROOF_OUTPUT}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, image, { flag: 'wx', mode: 0o600 });
    await rename(temporary, PROOF_OUTPUT);
  } finally {
    await rm(temporary, { force: true });
  }
}
