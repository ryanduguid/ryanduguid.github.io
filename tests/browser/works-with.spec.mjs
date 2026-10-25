import { expect, test } from '@playwright/test';

test('software guides reflow and access tables can scroll at narrow widths', async ({ page }) => {
  for (const width of [320, 360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/works-with/', '/works-with/xero/', '/works-with/claude/']) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${route} at ${width}px`).toBeLessThanOrEqual(1);
      const table = page.locator('.table-scroll');
      if (width < 768 && await table.count()) {
        await table.focus();
        await table.press('ArrowRight');
        await expect.poll(() => table.evaluate(el => el.scrollLeft), { message: `${route} table scrolls with the keyboard` }).toBeGreaterThan(0);
      }
    }
  }
});

test('software discovery leads from Tools to the Xero setup and credential-free evaluation', async ({ page }) => {
  await page.goto('/tools/');
  await page.getByRole('link', { name: 'Works with Xero and Claude', exact: true }).click();
  await expect(page).toHaveURL('/works-with/');
  await page.getByRole('link', { name: 'See Xero setup and access', exact: true }).click();
  await expect(page).toHaveURL('/works-with/xero/');
  await expect(page.getByRole('region', { name: 'Xero exporter access' })).toContainText('No ledger write access.');
  await page.getByRole('link', { name: 'Open the Xero installation and first run guide', exact: true }).click();
  await expect(page).toHaveURL('/tools/xero-trial-balance/#get-it');
  await expect(page.getByRole('heading', { name: 'Get it', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Works with Xero: setup and access', exact: true }).click();
  await page.getByRole('link', { name: 'reproduce the trial balance integrity evaluation', exact: true }).click();
  await expect(page).toHaveURL('/evaluate/xero-trial-balance-integrity/');
  await expect(page.locator('main')).toContainText('fictional');
});

test('Claude discovery distinguishes local MCP from skills and reaches the existing installer', async ({ page }) => {
  await page.goto('/works-with/');
  await page.getByRole('link', { name: 'See Claude setup and access', exact: true }).click();
  await expect(page).toHaveURL('/works-with/claude/');
  await expect(page.getByRole('region', { name: 'Claude accounting routes and access' })).toContainText('It has no Xero connection');
  await expect(page.locator('#choose')).toContainText('no hosted endpoint');
  await expect(page.locator('#choose')).toContainText('do not disable the agent’s other tools');
  await page.getByRole('link', { name: 'installation guide', exact: true }).first().click();
  await expect(page).toHaveURL('/tools/australian-tax-ai-agents/#install');
  await page.locator('label[for="adopt-claude"]').click();
  await expect(page.getByRole('region', { name: 'Claude Code install command' })).toContainText('claude mcp add aus-accounting');
  await page.getByRole('link', { name: 'Works with Claude: MCP and skills', exact: true }).click();
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Works with', exact: true }).click();
  await expect(page).toHaveURL('/works-with/');
});

test('software guides and setup links remain available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/works-with/');
    for (const [label, route, setupLabel] of [
      ['See Xero setup and access', '/works-with/xero/', 'Open the Xero installation and first run guide'],
      ['See Claude setup and access', '/works-with/claude/', 'installation guide'],
    ]) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(route);
      await expect(page.getByRole('link', { name: setupLabel, exact: true }).first()).toBeVisible();
      await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Works with', exact: true }).click();
    }
  } finally {
    await context.close();
  }
});
