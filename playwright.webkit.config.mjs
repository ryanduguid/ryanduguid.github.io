import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';

// A manual WebKit pass, the closest local stand-in for iOS Safari. It reuses the
// main configuration and leaves out the specs that branch on the Chromium project
// names or compare screenshots against the committed win32 baselines. CI does not
// run it: `npm run test:browser:webkit` after a layout or form change.
export default defineConfig({
  ...base,
  testIgnore: [
    '**/site-quality.spec.mjs',
    '**/template-budgets.spec.mjs',
    '**/mobile-discovery.spec.mjs',
  ],
  projects: [
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
