import { defineConfig } from '@playwright/test';

// Since Chromium 141, on Windows 11 22H2 and later, Chromium sets SO_RANDOMIZE_PORT
// on each connection (crbug.com/40744069), which is implicated in rare connect
// failures reported as net::ERR_NO_BUFFER_SPACE. Chromium uses the last
// --disable-features switch, so Playwright's own list is replaced whole
// (microsoft/playwright#22186); tests/browser/launch-options.spec.mjs fails if an
// upgrade changes that list.
const playwrightDisabledFeatures =
  '--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,DestroyProfileOnBrowserClose,' +
  'DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,' +
  'PaintHolding,ThirdPartyStoragePartitioning,BlockOriginHeaderModificationOnRedirect,' +
  'Translate,AutoDeElevate,OptimizationHints,msForceBrowserSignIn,' +
  'msEdgeUpdateLaunchServicesPreferredVersion';
export const chromiumLaunchOptions = process.platform === 'win32'
  ? {
      ignoreDefaultArgs: [playwrightDisabledFeatures],
      args: [`${playwrightDisabledFeatures},TcpPortRandomizationWin`],
    }
  : {};

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
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
        launchOptions: chromiumLaunchOptions,
      },
    },
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 1000 },
        launchOptions: chromiumLaunchOptions,
      },
    },
  ],
  webServer: {
    command: 'python -u scripts/serve_site.py',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
