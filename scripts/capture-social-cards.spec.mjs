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

test('renders all contextual social cards reproducibly without touching assets', async ({ browser }) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'duguid-social-'));
  try {
    expect(await renderSocialCards(browser, directory)).toEqual(OUTPUTS);

    for (const output of OUTPUTS) {
      const rendered = await readFile(path.join(directory, output));
      const committed = await readFile(
        new URL(`../assets/${output}`, import.meta.url),
      );
      expect(rendered).toEqual(committed);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
