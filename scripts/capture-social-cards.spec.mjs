import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { renderSocialCards } from './render-social-cards.mjs';

const OUTPUTS = [
  'social-card-site.png',
  'social-card-tools.png',
  'social-card-evaluations.png',
  'social-card-rates.png',
  'social-card-evidence.png',
];

const REGISTER_SENTINELS = [
  { point: [75, 75], colour: [238, 244, 240, 255] },
  { point: [100, 200], colour: [77, 255, 136, 255] },
  { point: [1004, 234], colour: [238, 244, 240, 255] },
];

async function samplePixels(page, image, sentinels) {
  await page.setContent(
    `<canvas width="1200" height="630"></canvas><img src="data:image/png;base64,${image.toString('base64')}">`,
  );
  return page.evaluate((points) => {
    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('2d');
    const source = document.querySelector('img');
    context.drawImage(source, 0, 0);
    return points.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
  }, sentinels.map(({ point }) => point));
}

test('renders all contextual social cards reproducibly without touching assets', async ({ browser }) => {
  const firstDirectory = await mkdtemp(path.join(os.tmpdir(), 'duguid-social-first-'));
  const secondDirectory = await mkdtemp(path.join(os.tmpdir(), 'duguid-social-second-'));
  const inspectionPage = await browser.newPage();
  try {
    expect(await renderSocialCards(browser, firstDirectory)).toEqual(OUTPUTS);
    expect(await renderSocialCards(browser, secondDirectory)).toEqual(OUTPUTS);

    for (const output of OUTPUTS) {
      const first = await readFile(path.join(firstDirectory, output));
      const second = await readFile(path.join(secondDirectory, output));
      const committed = await readFile(
        new URL(`../assets/${output}`, import.meta.url),
      );
      expect(first).toEqual(second);
      expect(first).toEqual(committed);
      expect(await samplePixels(inspectionPage, first, REGISTER_SENTINELS)).toEqual(
        REGISTER_SENTINELS.map(({ colour }) => colour),
      );
    }
  } finally {
    await inspectionPage.close();
    await Promise.all([
      rm(firstDirectory, { recursive: true, force: true }),
      rm(secondDirectory, { recursive: true, force: true }),
    ]);
  }
});
