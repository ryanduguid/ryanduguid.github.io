import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { observePageHealth } from './health.mjs';
import { waitForVisualFonts } from './visual.mjs';

const routes = [
  ['home', '/'],
  ['about', '/about/'],
  ['evidence', '/evidence/'],
  ['super guarantee rate', '/rates/super-guarantee/'],
  ['Australian tax AI agents', '/tools/australian-tax-ai-agents/'],
  ['Coal LSL calculator', '/tools/coal-lsl-levy/'],
  ['not-found page', '/404.html'],
];

async function textLineCount(locator) {
  return locator.evaluate((element) => {
    const range = document.createRange();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const tops = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      range.selectNodeContents(node);
      tops.push(...[...range.getClientRects()].map(({ top }) => Math.round(top)));
    }
    return new Set(tops).size;
  });
}

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

test('home exposes one route register with deliberate heading lines', async ({ page }, testInfo) => {
  const health = observePageHealth(page);
  await page.goto('/');
  await waitForVisualFonts(page);
  const routeRegister = page.getByRole('navigation', { name: 'Choose a path' });
  await expect(routeRegister).toBeVisible();
  for (const target of ['#engage', '#adopt', '#verify']) {
    await expect(routeRegister.locator('a[href="' + target + '"]')).toHaveCount(1);
  }
  if (testInfo.project.name === 'desktop-chromium') {
    expect(await textLineCount(page.getByRole('heading', { level: 1 }))).toBe(2);
    for (const name of ['Engage', 'Adopt', 'Verify']) {
      expect(await textLineCount(page.getByRole('heading', { name, exact: true })))
        .toBe(1);
    }
  } else {
    expect(await textLineCount(page.getByRole('heading', { level: 1 })))
      .toBeLessThanOrEqual(3);
  }
  health.assertHealthy();
});

test('route words remain intact at the narrowest wide layout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'wide-layout seam only');
  const health = observePageHealth(page);
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');
  await waitForVisualFonts(page);
  for (const name of ['Engage', 'Adopt', 'Verify']) {
    const heading = page.getByRole('heading', { name, exact: true });
    expect(await textLineCount(heading)).toBe(1);
    expect(await heading.evaluate((element) => element.scrollWidth))
      .toBeLessThanOrEqual(await heading.evaluate((element) => element.clientWidth));
  }
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
  const firstPrimaryLink = primary.getByRole('link', { name: 'About' });
  const lastPrimaryLink = primary.getByRole('link', { name: 'Awesome List' });
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
  await expect(page).toHaveURL(/#inspect-tools$/);
  health.assertHealthy();
});

test('home does not overflow at refinement acceptance widths', async ({ page }) => {
  const health = observePageHealth(page);
  for (const width of [320, 768]) {
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

test('home matches its viewport visual baseline', async ({ page }, testInfo) => {
  const health = observePageHealth(page);
  await page.goto('/');
  await waitForVisualFonts(page);
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
