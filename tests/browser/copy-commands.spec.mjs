import { expect, test } from '@playwright/test';

test('install commands report copy success and denial without changing the action', async ({ page }) => {
  // Keep the operating-system clipboard untouched and exercise both permission outcomes.
  await page.addInitScript(() => {
    window.copiedCommands = [];
    window.denyCopy = false;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        async writeText(text) {
          if (window.denyCopy) throw new DOMException('Permission denied', 'NotAllowedError');
          window.copiedCommands.push(text);
        },
      },
    });
  });
  await page.goto('/');
  await page.locator('label[for="adopt-claude"]').click();
  const command = page.getByRole('region', { name: 'Claude Code install command' });
  const wrap = command.locator('..');
  const copy = wrap.getByRole('button', { name: 'Copy: claude code install command' });
  const status = wrap.getByRole('status');

  await copy.focus();
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Copied');
  await expect(copy).toHaveText('Copy');
  await expect(copy).toBeFocused();
  expect(await page.evaluate(() => window.copiedCommands)).toEqual([
    'claude mcp add aus-accounting -- uvx aus-accounting-mcp',
  ]);

  await page.evaluate(() => { window.denyCopy = true; });
  await copy.click();
  await expect(status).toContainText('Select the command and copy it manually');
  await expect(command).toBeVisible();
  await expect(copy).toHaveText('Copy');

  await page.evaluate(() => { window.denyCopy = false; });
  await copy.click();
  await expect(status).toContainText('Copied');
  expect(await page.evaluate(() => window.copiedCommands)).toHaveLength(2);
});

test('copy controls remain usable at narrow widths', async ({ page }) => {
  await page.goto('/');
  await page.locator('label[for="adopt-claude"]').click();
  const copy = page.getByRole('button', { name: 'Copy: claude code install command' });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await copy.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
});

test('install commands stay selectable when the clipboard API is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
  });
  await page.goto('/');
  await page.locator('label[for="adopt-claude"]').click();
  const command = page.getByRole('region', { name: 'Claude Code install command' });
  await expect(command).toBeVisible();
  await command.focus();
  await expect(command).toBeFocused();
  await expect(page.getByRole('button', { name: /Copy:/ })).toHaveCount(0);
});
