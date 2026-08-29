import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { observePageHealth } from './health.mjs';
import { gotoForVisualSnapshot, waitForVisualFonts } from './visual.mjs';

const routes = [
  ['home', '/'],
  ['about', '/about/'],
  ['evidence', '/evidence/'],
  ['tools', '/tools/'],
  ['evaluations', '/evaluate/'],
  ['rates', '/rates/'],
  ['super guarantee rate', '/rates/super-guarantee/'],
  ['Australian tax AI agents', '/tools/australian-tax-ai-agents/'],
  ['Coal LSL calculator', '/tools/coal-lsl-levy/'],
  ['not-found page', '/404.html'],
];

const primaryNavigation = [
  ['/tools/', 'Tools'],
  ['/rates/', 'Rates'],
  ['/evidence/', 'Evidence'],
  ['/about/', 'About'],
  ['/#engage', 'Contact'],
];

const currentNavigationCases = [
  ['/tools/', 'Tools', 'page'],
  ['/tools/coal-lsl-levy/', 'Tools', 'location'],
  ['/evaluate/', 'Tools', 'location'],
  ['/evaluate/manager-review-gate/', 'Tools', 'location'],
  ['/rates/', 'Rates', 'page'],
  ['/rates/super-guarantee/', 'Rates', 'location'],
];

const homepagePreviewRoutes = [
  ['Extract', '/tools/#extract-tools', 'extract-tools'],
  ['Calculate', '/tools/#calculate-tools', 'calculate-tools'],
  ['Control', '/tools/#control-tools', 'control-tools'],
  ['Inspect', '/tools/#inspect-tools', 'inspect-tools'],
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

test('primary navigation order and current states match the collection hierarchy', async ({ page }) => {
  const health = observePageHealth(page);
  for (const [route, currentLabel, currentValue] of currentNavigationCases) {
    await page.goto(route);
    const primary = page.getByRole('navigation', { name: 'Primary' });
    const links = primary.getByRole('link');
    await expect(links).toHaveText(primaryNavigation.map(([, label]) => label));
    expect(await links.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('href'))
    )).toEqual(primaryNavigation.map(([href]) => href));
    const current = primary.locator('[aria-current]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(currentLabel);
    await expect(current).toHaveAttribute('aria-current', currentValue);
  }
  health.assertHealthy();
});

test('focused mobile primary navigation links scroll fully into view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile contract only');
  const health = observePageHealth(page);
  await page.setViewportSize({ width: 320, height: 844 });
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
  const geometry = await lastPrimaryLink.evaluate((link) => {
    const navigation = link.closest('nav');
    const linkBounds = link.getBoundingClientRect();
    const navigationBounds = navigation.getBoundingClientRect();
    return {
      clientWidth: navigation.clientWidth,
      scrollWidth: navigation.scrollWidth,
      scrollLeft: navigation.scrollLeft,
      linkLeft: linkBounds.left,
      linkRight: linkBounds.right,
      navigationLeft: navigationBounds.left,
      navigationRight: navigationBounds.right,
      fullyVisible: linkBounds.left >= navigationBounds.left - 1
        && linkBounds.right <= navigationBounds.right + 1,
    };
  });
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  expect(geometry.scrollLeft).toBeGreaterThan(0);
  expect(geometry.fullyVisible, JSON.stringify(geometry)).toBe(true);
  health.assertHealthy();
});

test('all homepage preview routes land on valid Tools anchors', async ({ page }) => {
  const health = observePageHealth(page);
  for (const [label, href, target] of homepagePreviewRoutes) {
    await page.goto('/');
    const catalogue = page.getByRole('navigation', { name: 'Tool categories' });
    const link = catalogue.getByRole('link', { name: label, exact: true });
    await expect(link).toHaveAttribute('href', href);
    await link.click();
    await expect.poll(() => {
      const current = new URL(page.url());
      return `${current.pathname}${current.hash}`;
    }).toBe(href);
    await expect(page.locator(`#${target}`)).toBeVisible();
  }
  health.assertHealthy();
});

test('public pages do not overflow at refinement acceptance widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'width matrix runs once');
  const health = observePageHealth(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [, route] of routes) {
      await page.goto(route);
      const viewport = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(viewport.scrollWidth, `${route} overflow at ${width}px`)
        .toBeLessThanOrEqual(viewport.clientWidth);
    }
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
