import { expect, test } from '@playwright/test';

const TEMPLATE = '/assets/examples/lumbridge/trial-response-template.txt';
const SAMPLE_PACK = '/assets/examples/lumbridge/lumbridge-sample-pack.zip';

// The four starting routes, as the homepage, Tools and llms.txt all state them.
const startingRoutes = [
  ['Understand an accounting problem', '/evaluate/#profit-and-cash'],
  ['Try a browser calculator', '/tools/coal-lsl-levy/'],
  ['Evaluate an accounting workflow', '/evaluate/manager-review-gate/'],
  ['Inspect or integrate the software', '/tools/australian-tax-ai-agents/#install'],
];

test('the review task is reachable from the homepage and Contact', async ({ page }) => {
  for (const route of ['/', '/contact/']) {
    await page.goto(route);
    await page.getByRole('link', { name: /Lumbridge/ }).first().click();
    await expect(page).toHaveURL(/\/evaluate\/#independent-review$/);
    const section = page.locator('#independent-review');
    await expect(section).toBeVisible();
    // The fragment must land below the sticky header, not underneath it.
    const top = await section.evaluate((element) => element.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    await expect(section).toContainText('guided reproduction');
    await expect(section.getByRole('listitem')).toHaveCount(6);
  }
});

test('the feedback route keeps its subject and a written-out address', async ({ page }) => {
  await page.goto('/evaluate/#independent-review');
  await expect(page.locator('#independent-review').getByRole('link', { name: /@/ }))
    .toHaveAttribute('href', 'mailto:ryan@duguid.com.au?subject=Lumbridge%20review');
  await expect(page.locator('#independent-review')).toContainText('duguid dot com dot au');
  await page.goto('/contact/#example-feedback');
  await expect(page.locator('#example-feedback')).toContainText('duguid dot com dot au');
});

test('both downloads are served as real files, not error pages', async ({ request }) => {
  const pack = await request.get(SAMPLE_PACK);
  expect(pack.status()).toBe(200);
  expect(pack.headers()['content-type']).toContain('zip');
  expect((await pack.body()).byteLength).toBeGreaterThan(10000);

  const template = await request.get(TEMPLATE);
  expect(template.status()).toBe(200);
  expect(template.headers()['content-type']).toContain('text/plain');
  const text = await template.text();
  expect(text.startsWith('<')).toBe(false);
  for (const section of [
    '== 1. Which workbook you tested ==',
    '== 2. What you had already seen ==',
    '== 3. Your environment ==',
    '== 4. Scenario and input changes ==',
    '== 5. Expected versus observed ==',
    '== 6. Completion and help ==',
    '== 8. Defects and reproducible observations ==',
    '== 11. Permission for later quotation ==',
  ]) {
    expect(text).toContain(section);
  }
  // Every figure the page asks a reviewer to record needs somewhere to write it.
  for (const figure of [
    'October closing cash on time',
    'October closing cash with a 45-day delay',
    'December closing cash on time',
    'December closing cash with a 45-day delay',
    'Profit before income tax on time',
  ]) {
    expect(text).toContain(figure);
  }
  expect(text).toContain('is used for corrections only and is not quoted');
});

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
    const [path, fragment] = href.split('#');
    await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}`));
    if (fragment) {
      await expect(page.locator(`#${fragment}`)).toBeVisible();
    }
  }
});

test('the review route still works with scripts unavailable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/evaluate/#independent-review');
  const section = page.locator('#independent-review');
  await expect(section).toBeVisible();
  await expect(section.getByRole('listitem')).toHaveCount(6);
  // Cloudflare rewrites mailto links in delivered HTML, so the spelled-out
  // address has to be readable without scripts.
  await expect(section).toContainText('duguid dot com dot au');
  await expect(section.getByRole('link', { name: 'Download the blank response template' }))
    .toHaveAttribute('href', TEMPLATE);
  await expect(section.getByRole('link', { name: 'sample pack' }))
    .toHaveAttribute('href', SAMPLE_PACK);
  await context.close();
});
