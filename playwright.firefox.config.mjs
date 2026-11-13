// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

// A manual Firefox pass. Firefox has no scroll timelines, so it is the browser
// that shows the table scroll regions' edge-rule cue. Playwright's Firefox has
// no phone emulation, so this is one desktop project; the width sweep in
// site-quality.spec.mjs still checks every page at 320 and 390px. It reuses the
// main configuration, and the screenshot comparisons skip because their
// committed baselines are Chromium renders. CI does not run it:
// `npm run test:browser:firefox` after a table or layout change.
export default defineConfig({
  ...base,
  projects: [
    {
      name: 'desktop-firefox',
      use: { browserName: 'firefox', viewport: { width: 1440, height: 1000 } },
    },
  ],
});
