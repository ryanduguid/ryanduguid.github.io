import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { observePageHealth } from './health.mjs';

test('view mode defaults to Human and preserves the page when switching back', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/');
  const human = page.getByRole('radio', { name: 'Human', exact: true });
  const machine = page.getByRole('radio', { name: 'Machine', exact: true });
  await expect(human).toBeChecked();
  await page.locator('#adopt').scrollIntoViewIfNeeded();
  const originalScroll = await page.evaluate(() => scrollY);
  await machine.check();
  const view = page.getByRole('main', { name: 'Machine view' });
  await expect(view).toContainText('Source: https://duguid.com.au/');
  await expect(view).toContainText('Australian accounting tools, with the working explained.');
  await expect(view).toContainText('https://duguid.com.au/evaluate/#profit-and-cash');
  await expect(view).toContainText('Nothing here is tax, legal, or financial advice.');
  await expect(page.locator('#main')).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
  await human.check();
  await expect(view).toBeHidden();
  await expect(page.locator('#main')).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(originalScroll);
  health.assertHealthy();
});

test('saved Machine mode follows the current page and synchronises other tabs', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Machine', exact: true }).check();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Machine', exact: true })).toBeChecked();
  await expect(page.getByRole('main', { name: 'Machine view' })).toContainText('Source: https://duguid.com.au/');
  await page.goto('/about/');
  await expect(page.getByRole('main', { name: 'Machine view' })).toContainText('Source: https://duguid.com.au/about/');
  const other = await context.newPage();
  await other.goto('/tools/');
  await expect(other.getByRole('radio', { name: 'Machine', exact: true })).toBeChecked();
  await other.getByRole('radio', { name: 'Human', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Human', exact: true })).toBeChecked();
  await expect(page.locator('#main')).toBeVisible();
});

test('view mode works with keyboard, narrow screens and forced colours', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tools/accounting-questions/');
  const human = page.getByRole('radio', { name: 'Human', exact: true });
  const machine = page.getByRole('radio', { name: 'Machine', exact: true });
  await human.focus();
  await page.keyboard.press('ArrowRight');
  await expect(machine).toBeChecked();
  const view = page.getByRole('main', { name: 'Machine view' });
  await expect(view).toContainText('Source: https://duguid.com.au/tools/accounting-questions/');
  expect(await view.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await view.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => view.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);
  await page.emulateMedia({ forcedColors: 'active' });
  await machine.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(human).toBeChecked();
  await expect(page.locator('#main')).toBeVisible();
});

test('storage denial does not prevent switching views', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await page.getByRole('radio', { name: 'Machine', exact: true }).check();
  await expect(page.getByRole('main', { name: 'Machine view' })).toContainText('Source: https://duguid.com.au/tools/coal-lsl-levy/');
  await page.getByRole('radio', { name: 'Human', exact: true }).check();
  await expect(page.locator('#main')).toBeVisible();
  health.assertHealthy();
});

test('text download failures offer a working way back and can be retried', async ({ page }) => {
  await page.route('**/llms-full.txt', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await page.getByRole('radio', { name: 'Machine', exact: true }).check();
  await expect(page.getByText('Page text could not be loaded.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open full text' })).toHaveAttribute('href', '/llms-full.txt');
  await page.getByRole('radio', { name: 'Human', exact: true }).check();
  await expect(page.locator('#main')).toBeVisible();
  await page.unroute('**/llms-full.txt');
  await page.getByRole('radio', { name: 'Machine', exact: true }).check();
  await expect(page.getByRole('main', { name: 'Machine view' })).toContainText('Source: https://duguid.com.au/');
});

test('Human content stays usable when JavaScript is disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('#main')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'View mode' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Machine-readable index', exact: true })).toBeVisible();
  await context.close();
});

test('saved Machine mode renders the unindexed not-found page without a text download', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/');
  await page.getByRole('radio', { name: 'Machine', exact: true }).check();
  await expect(page.getByRole('main', { name: 'Machine view' })).toContainText('Source: https://duguid.com.au/');
  let textRequests = 0;
  await page.route('**/llms-full.txt', route => {
    textRequests += 1;
    return route.abort();
  });
  await page.goto('/404.html');
  await expect(page.getByRole('main', { name: 'Machine view' })).toContainText('No page at this address.');
  expect(textRequests).toBe(0);
  await page.getByRole('radio', { name: 'Human', exact: true }).check();
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  health.assertHealthy();
});

test('the floating switch leaves the last footer link unobscured', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  const index = await page.getByRole('link', { name: 'Machine-readable index', exact: true }).boundingBox();
  const toggle = await page.getByRole('radiogroup', { name: 'View mode' }).boundingBox();
  expect(index.y + index.height).toBeLessThan(toggle.y);
});
