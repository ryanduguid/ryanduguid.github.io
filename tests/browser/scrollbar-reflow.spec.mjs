import { test, expect } from '@playwright/test';
import { chromiumLaunchOptions } from '../../playwright.config.mjs';

// Playwright hides scrollbars by default. Keep the real desktop gutter for
// this regression without changing the existing visual baselines.
test.use({
  launchOptions: {
    ...chromiumLaunchOptions,
    ignoreDefaultArgs: [...(chromiumLaunchOptions.ignoreDefaultArgs ?? []), '--hide-scrollbars'],
  },
});
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Traditional Chromium desktop scrollbar coverage');

test('narrow pages reflow inside a traditional scrollbar gutter', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const size of ['100%', '200%']) {
    for (const route of ['/', '/tools/', '/evidence/', '/evaluate/', '/contact/', '/changelog/', '/tools/coal-lsl-levy/']) {
      await page.goto(route);
      await page.evaluate((fontSize) => {
        document.documentElement.style.scrollbarGutter = 'stable';
        document.documentElement.style.fontSize = fontSize;
      }, size);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => ({
        available: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
        overflow: [document.documentElement, document.body].map((element) => getComputedStyle(element).overflowX),
      }));
      expect(geometry.available, 'A classic scrollbar must consume viewport space').toBeLessThan(320);
      for (const overflow of geometry.overflow) {
        expect(['hidden', 'clip']).not.toContain(overflow);
      }
      expect(geometry.content, `${route} at ${size}`).toBeLessThanOrEqual(geometry.available);
      const links = await page.locator('.site-nav a').evaluateAll((elements) => elements.map((link) => {
        const rect = link.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(link);
        return { label: link.textContent, width: rect.width, height: rect.height, right: rect.right,
          lines: text.getClientRects().length };
      }));
      for (const link of links) {
        expect(link.width, link.label).toBeGreaterThanOrEqual(44);
        expect(link.height, link.label).toBeGreaterThanOrEqual(44);
        expect(link.right, link.label).toBeLessThanOrEqual(geometry.available);
        expect(link.lines, link.label).toBe(1);
      }
    }
  }
});
