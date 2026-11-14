// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { expect, test } from '@playwright/test';

import { waitForVisualFonts } from './visual.mjs';

test('chart dialogs keep interior clicks open and restore focus after dismissal', async ({ page }) => {
  for (const route of ['/', '/examples/profit-vs-cash-flow/']) {
    await page.goto(route);
    const chart = page.locator('.case-preview > a');
    const dialog = page.getByRole('dialog', { name: 'Full-size chart' });
    for (const dismissal of ['button', 'backdrop', 'Escape']) {
      await chart.click();
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      await page.mouse.click(bounds.x + 4, bounds.y + 4);
      expect(await dialog.isVisible()).toBe(true);
      await dialog.getByRole('img').click();
      await expect(dialog).toBeVisible();
      if (dismissal === 'button') {
        await dialog.getByRole('button', { name: 'Close' }).click();
      } else if (dismissal === 'backdrop') {
        await page.mouse.click(1, 1);
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(dialog).toBeHidden();
      await expect(chart).toBeFocused();
    }
  }
});

test('printing hides an open chart viewer and restores it afterwards', async ({ page }) => {
  for (const route of ['/', '/examples/profit-vs-cash-flow/']) {
    await page.goto(route);
    await page.locator('.case-preview > a').click();
    const dialog = page.locator('.chart-dialog');
    await expect(dialog).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(dialog).toBeHidden();
    await expect(dialog).toHaveAttribute('open', '');
    await page.emulateMedia({ media: null });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.case-preview > a')).toBeFocused();
  }
});

test('printing keeps the full tool register available without a duplicate task list', async ({ page }) => {
  await page.goto('/tools/');
  await expect(page.locator('.work-chooser')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.collection-entry')).toHaveCount(12);
  await expect(page.locator('.collection-entry__title').filter({ hasText: 'Ozzit' })).toBeVisible();
  await expect(page.locator('.collection-entry__title').filter({ hasText: 'Aus Accounting MCP' })).toBeVisible();
});

test('AI tool comparison keeps all four columns readable', async ({ page }) => {
  await page.goto('/tools/australian-tax-ai-agents/');
  await waitForVisualFonts(page);
  const table = page.locator('.comparison-table');
  const geometry = await table.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    widths: [...element.querySelectorAll('tbody tr:first-child :is(th, td)')]
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
    name: 'Explore the cash flow example', exact: true,
  });
  const bounds = await link.boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
});

test('cash-flow entry points reach the workbook and About reaches review evidence', async ({ page, browserName, isMobile }) => {
  for (const action of ['image', 'keyboard']) {
    await page.goto('/');
    const figure = page.locator('.case-preview');
    const chart = figure.getByRole('link', { name: /View full-size chart$/ });
    await expect(figure.locator('a[href="/assets/examples/lumbridge/cash-preview.png"]')).toHaveCount(1);
    // The label is clipped to nothing. Firefox's IntersectionObserver ignores clip-path, so
    // not.toBeInViewport() fails there although nothing is painted.
    await expect(chart.getByText('View full-size chart', { exact: true })).toHaveCSS('clip-path', 'inset(50%)');
    await expect(chart.getByRole('img')).toHaveAttribute('alt',
      'Excel chart of weekly closing cash after a 45-day receipt delay, showing the cash gap against the assumed buffer');
    if (action === 'image') {
      await chart.getByRole('img').click();
    } else {
      await chart.focus();
      if (browserName === 'chromium') {
        await page.keyboard.press('Tab');
        await expect(figure.getByRole('link', { name: 'Capture record', exact: true })).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(chart).toBeFocused();
      }
      await page.keyboard.press('Enter');
    }
    const dialog = page.getByRole('dialog', { name: 'Full-size chart' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => dialog.getByRole('img').evaluate((image) => image.naturalWidth)).toBe(isMobile ? 856 : 1282);
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
    if (action === 'image') {
      await dialog.getByRole('button', { name: 'Close' }).click();
      await expect(dialog).toBeHidden();
    } else {
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(chart).toBeFocused();
    }
  }
  for (const [route, name] of [['/', 'Explore the cash flow example'], ['/tools/', 'Understand why profit and cash differ']]) {
    await page.goto(route);
    await page.getByRole('link', { name, exact: false }).click();
    await expect(page).toHaveURL(/\/examples\/profit-vs-cash-flow\/$/);
    await waitForVisualFonts(page);
    const downloadOffset = await page.locator('#try').evaluate((section) => (
      section.querySelector('a[download]').getBoundingClientRect().top
      - section.getBoundingClientRect().top
    ));
    expect(downloadOffset).toBeLessThan(500);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download the fictional Excel forecast', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('lumbridge.xlsx');
    expect(await download.failure()).toBeNull();
  }
  await page.goto('/about/');
  await page.locator('#work-samples').getByRole('link', { name: 'accounting review pipeline', exact: true }).click();
  await expect(page).toHaveURL(/\/evaluate\/#month-end-preview$/);
  const excerpt = page.getByRole('region', { name: 'Fictional month-end exception excerpt' });
  await expect(excerpt.getByRole('row')).toHaveCount(4);
  if (page.viewportSize().width < 704) {
    await excerpt.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => excerpt.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }
});
