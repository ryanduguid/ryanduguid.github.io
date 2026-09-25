import { expect, test } from '@playwright/test';

test('public pages omit external reviewer requests', async ({ page }) => {
  for (const path of ['/', '/contact/', '/evaluate/', '/evidence/', '/privacy/', '/examples/profit-vs-cash-flow/']) {
    await page.goto(path);
    await expect(page.locator('a[href*="independent-review"], a[href*="trial-response-template"]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/External review status|Review the Lumbridge case|independent review/i);
  }
});

test('the fabricated workbook sample remains available', async ({ request }) => {
  const pack = await request.get('/assets/examples/lumbridge/lumbridge-sample-pack.zip');
  expect(pack.status()).toBe(200);
  expect(pack.headers()['content-type']).toContain('zip');
  expect((await pack.body()).byteLength).toBeGreaterThan(10000);
});

// The five starting routes, as the homepage, Tools and llms.txt all state them.
const startingRoutes = [
  ["Understand why profit and cash differ", "/examples/profit-vs-cash-flow/"],
  ["Use accounting functions in Excel", "/tools/ozzit/"],
  ["Review a month-end close", "/tools/monthly-close-controls/"],
  ["Calculate a Coal LSL levy", "/tools/coal-lsl-levy/"],
  ["Check a BAS pack before manager review", "/evaluate/manager-review-gate/"],
];

test('starting routes lead to the promised activity on both pages', async ({ page }) => {
  for (const [source, container] of [['/', 'Starting routes'], ['/tools/', 'Start with what you came to do']]) {
    await page.goto(source);
    const nav = page.getByRole('navigation', { name: container });
    for (const [label, href] of startingRoutes) {
      await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) }))
        .toHaveAttribute('href', href);
    }
  }
  for (const [, href] of startingRoutes) {
    await page.goto(href);
    await expect(page).toHaveURL(href);
    const fragment = href.split('#')[1];
    if (fragment) {
      await expect(page.locator(`#${fragment}`)).toBeVisible();
    }
  }
});
