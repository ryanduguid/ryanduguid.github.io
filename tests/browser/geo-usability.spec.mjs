import { expect, test } from '@playwright/test';

import { waitForVisualFonts } from './visual.mjs';

test('AI tool comparison keeps all four columns readable', async ({ page }) => {
  await page.goto('/tools/australian-tax-ai-agents/');
  await waitForVisualFonts(page);
  const table = page.locator('.comparison-table');
  const geometry = await table.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    widths: [...element.querySelectorAll('tbody tr:first-child td')]
      .map((cell) => cell.getBoundingClientRect().width),
  }));
  expect(geometry.widths).toHaveLength(4);
  expect(Math.min(...geometry.widths)).toBeGreaterThan(140);
  expect(Math.max(...geometry.widths) / Math.min(...geometry.widths)).toBeLessThan(2);
  expect(geometry.height).toBeLessThan(1200);

  if (page.viewportSize().width < 704) {
    const region = page.getByRole('region', { name: 'Comparison of Australian tax AI tool types' });
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }
});

test('mobile visitors see a named tool in the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForVisualFonts(page);
  const link = page.locator('.home-tool-preview').getByRole('link', {
    name: 'Xero trial balance CSV export', exact: true,
  });
  const bounds = await link.boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);

  const disclosure = page.locator('.proof-capture');
  const summary = disclosure.locator('summary');
  await expect(disclosure).not.toHaveAttribute('open');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(disclosure).not.toHaveAttribute('open');
});
