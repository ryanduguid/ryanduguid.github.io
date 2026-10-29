import { expect, test } from '@playwright/test';

// 20 October 2026 at 09:00 in Canberra: the 2026-27 income year and the FBT
// year ending 31 March 2027.
const NOW = new Date('2026-10-19T22:00:00Z');

test('the row in force today is labelled in words', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/rates/car-limit/');
  const current = page.locator('table.rate-figures .rate-current');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText('In force today');
  await expect(page.getByRole('rowheader', { name: '2026-27 In force today' })).toBeVisible();

  await page.goto('/rates/fbt-rate/');
  await expect(page.getByRole('rowheader', { name: '31 March 2027 In force today' })).toBeVisible();

  await page.goto('/rates/super-guarantee/');
  await expect(page.getByRole('rowheader', { name: '1 July 2025 onwards In force today' })).toBeVisible();
});

test('a table with no row in force today gets no label', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/rates/maximum-contribution-base/');
  const quarterly = page.getByRole('region', { name: 'Maximum contribution base by quarter to 30 June 2026' });
  await expect(quarterly.locator('.rate-current')).toHaveCount(0);
});

test('Copy for Excel copies the table as tab-separated rows without the label', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => {
    window.copied = [];
    window.denyCopy = false;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        async writeText(text) {
          if (window.denyCopy) throw new DOMException('Permission denied', 'NotAllowedError');
          window.copied.push(text);
        },
      },
    });
  });
  await page.goto('/rates/car-limit/');
  const copy = page.getByRole('button', { name: 'Copy for Excel: car limit history' });
  const status = copy.locator('..').getByRole('status');

  await copy.click();
  await expect(status).toHaveText('Copied. Paste into Excel to fill one cell per value.');
  const [text] = await page.evaluate(() => window.copied);
  const lines = text.split('\n');
  expect(lines[0]).toBe('Income year\tCar limit\tRead from');
  expect(lines[1]).toBe('2026-27\t$69,883\tATO car thresholds notice, 9 June 2026');
  expect(lines).toHaveLength(9);
  expect(text).not.toContain('In force today');

  await page.evaluate(() => { window.denyCopy = true; });
  await copy.click();
  await expect(status).toHaveText('Copy unavailable. Download the CSV below instead.');
});

test('Copy for Excel stays a 44px target and hides in print', async ({ page }) => {
  await page.goto('/rates/super-guarantee/');
  const copy = page.getByRole('button', { name: 'Copy for Excel: super guarantee rate history' });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await copy.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.emulateMedia({ media: 'print' });
  await expect(copy).toBeHidden();
});
