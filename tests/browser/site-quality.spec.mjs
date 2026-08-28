import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { observePageHealth } from './health.mjs';
import { waitForVisualFonts } from './visual.mjs';

const routes = [
  ['home', '/'],
  ['about', '/about/'],
  ['evidence', '/evidence/'],
  ['super guarantee rate', '/rates/super-guarantee/'],
  ['Australian tax AI agents', '/tools/australian-tax-ai-agents/'],
  ['Coal LSL calculator', '/tools/coal-lsl-levy/'],
  ['not-found page', '/404.html'],
];

for (const [label, route] of routes) {
  test(`${label} has a healthy, accessible page shell`, async ({ page }) => {
    const health = observePageHealth(page);

    await page.goto(route);

    const headings = page.getByRole('heading', { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings).toBeVisible();
    await expect(page.locator('main#main')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

    const viewport = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);

    const scan = await new AxeBuilder({ page }).analyze();
    const severe = scan.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    );
    expect(severe, `${route} has serious or critical axe violations`).toEqual([]);
    health.assertHealthy();
  });
}

test('health collector catches a non-success response', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/definitely-missing-agent-test');
  expect(() => health.assertHealthy()).toThrow(/404/);
});

test('known missing-route response is explicitly allowed', async ({ page }) => {
  const health = observePageHealth(
    page,
    (response) => response.status() === 404
      && response.url().endsWith('/definitely-missing-agent-test'),
  );
  await page.goto('/definitely-missing-agent-test');
  health.assertHealthy();
});

test('home does not overflow at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const health = observePageHealth(page);
  await page.goto('/');
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
  health.assertHealthy();
});

test('home matches its viewport visual baseline', async ({ page }, testInfo) => {
  const health = observePageHealth(page);
  await page.goto('/');
  await waitForVisualFonts(page);

  const viewport = testInfo.project.name === 'mobile-chromium'
    ? 'mobile'
    : 'desktop';
  await expect(page).toHaveScreenshot(`homepage-${viewport}.png`, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
  health.assertHealthy();
});
