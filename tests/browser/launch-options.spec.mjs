import { chromium, expect, test } from '@playwright/test';

test('Chromium gets one feature list, with Windows port randomisation off', async ({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Chromium launch switches only');
  const server = await chromium.launchServer(testInfo.project.use.launchOptions);
  try {
    const switches = server.process().spawnargs.filter((arg) => arg.startsWith('--disable-features='));
    // A second switch means an upgrade changed Playwright's list; copy the new list
    // into playwright.config.mjs, or Chromium drops whichever switch comes first.
    expect(switches).toHaveLength(1);
    expect(switches[0].slice('--disable-features='.length).split(',')).toContain('TcpPortRandomizationWin');
  } finally {
    await server.close();
  }
});
