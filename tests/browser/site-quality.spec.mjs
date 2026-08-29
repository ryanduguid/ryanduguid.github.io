import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { observePageHealth } from './health.mjs';
import { gotoForVisualSnapshot, waitForVisualFonts } from './visual.mjs';

const routes = [
  ['home', '/'],
  ['about', '/about/'],
  ['evidence', '/evidence/'],
  ['super guarantee rate', '/rates/super-guarantee/'],
  ['Australian tax AI agents', '/tools/australian-tax-ai-agents/'],
  ['Coal LSL calculator', '/tools/coal-lsl-levy/'],
  ['not-found page', '/404.html'],
];

const homeHeightBaseline = {
  'mobile-chromium': 9512,
  'desktop-chromium': 7611,
};

async function decodedHomeProof(page) {
  const proof = page.getByRole('img', {
    name: /Coal LSL calculator result showing Formula B/,
  });
  await proof.scrollIntoViewIfNeeded();
  await expect.poll(() => proof.evaluate((image) => (
    image.complete && image.naturalWidth > 0
  ))).toBe(true);
  await proof.evaluate((image) => image.decode());
  return proof;
}

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

test('home leads with adoption actions and a shorter tool preview', async ({ page }, testInfo) => {
  const health = observePageHealth(page);
  await page.goto('/');
  await waitForVisualFonts(page);
  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Review-ready controls for Australian accounting work.',
    exact: true,
  })).toBeVisible();

  const actions = page.getByRole('navigation', { name: 'Homepage actions' });
  await expect(actions.getByRole('link')).toHaveText([
    'Browse the tools',
    'Discuss a workflow',
  ]);
  await expect(actions.getByRole('link').nth(0)).toHaveAttribute('href', '/tools/');
  await expect(actions.getByRole('link').nth(1)).toHaveAttribute('href', '/#engage');

  const categories = page.getByRole('navigation', { name: 'Tool categories' });
  await expect(categories.getByRole('heading', { level: 3 })).toHaveText([
    'Extract',
    'Calculate',
    'Control',
    'Inspect',
  ]);
  expect(await page.evaluate(() => {
    const preview = document.querySelector('.home-tool-preview');
    const proof = document.querySelector('.proof-feature');
    return Boolean(preview && proof
      && (preview.compareDocumentPosition(proof) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  for (const identifier of ['adopt', 'verify', 'engage']) {
    await expect(page.locator(`#${identifier}`)).toHaveCount(1);
  }
  expect(await page.locator('.route-section').evaluateAll((sections) =>
    sections.map((section) => getComputedStyle(section).minHeight)
  )).toEqual(['0px', '0px', '0px', '0px']);
  expect(await page.evaluate(() => document.documentElement.scrollHeight))
    .toBeLessThan(homeHeightBaseline[testInfo.project.name]);
  health.assertHealthy();
});

test('mobile primary navigation and catalogue index remain keyboard reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile contract only');
  const health = observePageHealth(page);
  await page.goto('/');
  const primary = page.getByRole('navigation', { name: 'Primary' });
  expect(await primary.evaluate((element) =>
    getComputedStyle(element).flexWrap
  )).toBe('nowrap');
  const firstPrimaryLink = primary.getByRole('link', { name: 'Tools' });
  const lastPrimaryLink = primary.getByRole('link', { name: 'Contact' });
  await firstPrimaryLink.focus();
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(lastPrimaryLink).toBeFocused();
  expect(await primary.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  const catalogue = page.getByRole('navigation', { name: 'Tool categories' });
  const extract = catalogue.getByRole('link', { name: 'Extract' });
  const inspect = catalogue.getByRole('link', { name: 'Inspect' });
  await extract.focus();
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(inspect).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/tools\/#inspect-tools$/);
  health.assertHealthy();
});

test('home does not overflow at refinement acceptance widths', async ({ page }) => {
  const health = observePageHealth(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const viewport = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth, `homepage overflow at ${width}px`)
      .toBeLessThanOrEqual(viewport.clientWidth);
  }
  health.assertHealthy();
});

test('home proof image loads only when requested and decodes before capture', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/');
  const proof = page.getByRole('img', {
    name: /Coal LSL calculator result showing Formula B/,
  });
  await expect(proof).toHaveAttribute('loading', 'lazy');
  await expect(proof).toHaveAttribute('fetchpriority', 'low');
  await decodedHomeProof(page);
  expect(await proof.evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))).toEqual({ width: 868, height: 580 });
  health.assertHealthy();
});

test('home proof uses practical inspection width without page overflow', async ({ page }, testInfo) => {
  const health = observePageHealth(page);
  await page.goto('/');
  const proof = await decodedHomeProof(page);
  const geometry = await proof.evaluate((image) => {
    const rect = image.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  const minimumProofWidth = testInfo.project.name === 'mobile-chromium'
    ? 380
    : 680;

  expect(geometry.width, `${testInfo.project.name} proof width`)
    .toBeGreaterThanOrEqual(minimumProofWidth);
  expect(geometry.left, `${testInfo.project.name} proof left edge`)
    .toBeGreaterThanOrEqual(0);
  expect(geometry.right, `${testInfo.project.name} proof right edge`)
    .toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollWidth, `${testInfo.project.name} document overflow`)
    .toBeLessThanOrEqual(geometry.viewportWidth);
  health.assertHealthy();
});

test('home matches its viewport visual baseline', async ({ page }, testInfo) => {
  const health = observePageHealth(page);
  await gotoForVisualSnapshot(page, '/');
  await decodedHomeProof(page);
  await page.evaluate(() => scrollTo(0, 0));

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
