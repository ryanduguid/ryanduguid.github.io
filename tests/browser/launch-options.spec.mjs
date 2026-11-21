// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { chromium, expect, test } from '@playwright/test';

test('Chromium gets one feature list, with Windows port randomisation off', async ({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium' || process.platform !== 'win32', 'Windows Chromium launch switches only');
  const server = await chromium.launchServer(testInfo.project.use.launchOptions);
  try {
    const switches = server.process().spawnargs.filter((arg) => arg.startsWith('--disable-features='));
    // Since Chromium 141, on Windows 11 22H2 and later, Chromium sets SO_RANDOMIZE_PORT
    // on each connection (crbug.com/40744069), which is implicated in rare connect
    // failures reported as net::ERR_NO_BUFFER_SPACE. Playwright has turned the feature
    // off itself since 1.65; this fails if an upgrade stops doing so. Chromium uses the
    // last --disable-features switch, so a second one would replace Playwright's list.
    expect(switches).toHaveLength(1);
    expect(switches[0].slice('--disable-features='.length).split(',')).toContain('TcpPortRandomizationWin');
  } finally {
    await server.close();
  }
});
