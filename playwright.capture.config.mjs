import baseConfig from './playwright.config.mjs';

export default {
  ...baseConfig,
  testDir: './scripts',
  testMatch: [
    'capture-coal-lsl-proof.spec.mjs',
    'capture-social-cards.spec.mjs',
  ],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  projects: [
    {
      name: 'proof-chromium',
      use: {
        ...baseConfig.use,
        browserName: 'chromium',
        viewport: { width: 868, height: 1106 },
        // The proof renderer decodes its own PNG screenshot inside the
        // calculator page through a data: URL before encoding the WebP. The
        // published img-src 'self' policy refuses that, so this capture-only
        // project bypasses the page policy. Visitors never run this code.
        bypassCSP: true,
      },
    },
  ],
};
