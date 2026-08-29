import baseConfig from './playwright.config.mjs';

export default {
  ...baseConfig,
  testDir: './scripts',
  testMatch: 'capture-coal-lsl-proof.spec.mjs',
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
      },
    },
  ],
};
