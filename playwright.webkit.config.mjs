import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';

// A manual WebKit pass, the closest local stand-in for iOS Safari. It reuses the
// main configuration and runs every spec: the tests branch on project capability
// (tests/browser/project-kind.mjs), so the desktop-only checks skip as they do in
// mobile Chromium, and the screenshot comparisons skip because their committed
// baselines are Chromium renders. CI does not run it:
// `npm run test:browser:webkit` after a layout or form change.
export default defineConfig({
  ...base,
  projects: [
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
