// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { renderSocialCards } from './render-social-cards.mjs';

const OUTPUTS = [
  'social-card-site-20261123.png',
  'social-card-tools-20261123.png',
  'social-card-evaluations-20261104b.png',
  'social-card-rates-20261104b.png',
  'social-card-evidence-20261104b.png',
  'social-card-calculators-20261128.png',
  'social-card-individual-tax-20261123.png',
  'social-card-depreciation-20261123.png',
  'social-card-questions-20261123.png',
];

test('renders all contextual social cards reproducibly without touching assets', async ({ browser }) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'duguid-social-'));
  // A promise's finally, not a try block: Codacy's ESLint rule security-node/detect-unhandled-async-errors
  // crashes on a try without a catch, and that stops its analysis of other files.
  await (async () => {
    expect(await renderSocialCards(browser, directory)).toEqual(OUTPUTS);

    for (const output of OUTPUTS) {
      const rendered = await readFile(path.join(directory, output));
      const committed = await readFile(
        new URL(`../assets/${output}`, import.meta.url),
      );
      expect(rendered).toEqual(committed);
    }
  })().finally(() => rm(directory, { recursive: true, force: true }));
});
