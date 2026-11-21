// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from '@playwright/test';

// The site server is `site-tools serve_site`. CI sets SITE_TOOLS to a prebuilt
// binary; locally Cargo builds it on first use.
export const siteServerCommand = process.env.SITE_TOOLS
  ? `"${process.env.SITE_TOOLS}" serve_site`
  : 'cargo run --locked --quiet --release --manifest-path scripts/Cargo.toml -- serve_site';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: !process.env.CI && process.platform === 'win32' ? 4 : undefined,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  outputDir: 'work/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'work/playwright-report', open: 'never' }],
    ['./tests/browser/flaky-summary-reporter.mjs'],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command: siteServerCommand,
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
