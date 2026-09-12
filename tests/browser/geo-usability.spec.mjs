import { expect, test } from '@playwright/test';

import { waitForVisualFonts } from './visual.mjs';

test('printing includes the fixed proof without opening its disclosure', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
  const disclosure = page.locator('.proof-capture');
  await expect(disclosure).not.toHaveAttribute('open');
  await expect(disclosure.locator('figure')).toBeVisible();
  await expect(disclosure.locator('figcaption')).toBeVisible();
});

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

test('mobile visitors can open the cash-flow example from the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForVisualFonts(page);
  const link = page.getByRole('navigation', { name: 'Homepage actions' }).getByRole('link', {
    name: 'Explore the cash-flow example', exact: true,
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

test('cash-flow entry points reach the workbook and About reaches review evidence', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'View full-size chart', exact: true }).click();
  await expect(page).toHaveURL(/\/assets\/examples\/lumbridge\/cash-preview\.png$/);
  await expect.poll(() => page.locator('img').evaluate((image) => image.naturalWidth)).toBe(1282);
  for (const [route, name] of [['/', 'Explore the cash-flow example'], ['/tools/', 'Fictional Newcastle cash-flow case Excel and source files']]) {
    await page.goto(route);
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(/\/evaluate\/#profit-and-cash$/);
    await waitForVisualFonts(page);
    const downloadOffset = await page.locator('#profit-and-cash').evaluate((section) => (
      section.querySelector('a[download]').getBoundingClientRect().top
      - section.getBoundingClientRect().top
    ));
    expect(downloadOffset).toBeLessThan(500);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download the synthetic Excel forecast', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('lumbridge.xlsx');
    expect(await download.failure()).toBeNull();
  }
  await page.goto('/about/');
  await page.locator('#work-samples').getByRole('link', { name: 'accounting review pipeline', exact: true }).click();
  await expect(page).toHaveURL(/\/evaluate\/#month-end-preview$/);
  const excerpt = page.getByRole('region', { name: 'Synthetic month-end exception excerpt' });
  await expect(excerpt.getByRole('row')).toHaveCount(4);
  if (page.viewportSize().width < 704) {
    await excerpt.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => excerpt.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }
});
