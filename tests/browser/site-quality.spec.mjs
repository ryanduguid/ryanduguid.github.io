import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { observePageHealth } from './health.mjs';
import { gotoForVisualSnapshot, waitForVisualFonts } from './visual.mjs';

// Every page in the sitemap, plus the not-found page, gets the shell and axe checks.
const routes = [
  ...[...readFileSync('sitemap.xml', 'utf8').matchAll(/<loc>https:\/\/duguid\.com\.au([^<]+)<\/loc>/g)]
    .map(([, path]) => [path, path]),
  ['not-found page', '/404.html'],
];

const primaryNavigation = [
  ['/tools/', 'Tools'],
  ['/rates/', 'Rates'],
  ['/evaluate/', 'Evaluations'],
  ['/evidence/', 'Evidence'],
  ['/about/', 'About'],
  ['/contact/', 'Contact'],
];

const currentNavigationCases = [
  ['/tools/', 'Tools', 'page'],
  ['/tools/coal-lsl-levy/', 'Tools', 'location'],
  ['/rates/', 'Rates', 'page'],
  ['/rates/super-guarantee/', 'Rates', 'location'],
  ['/evaluate/', 'Evaluations', 'page'],
  ['/evaluate/manager-review-gate/', 'Evaluations', 'location'],
  ['/contact/', 'Contact', 'page'],
];

// Worked examples sit under Home, so no primary link claims the current
// location on those routes.
const noCurrentNavigationRoutes = ['/examples/profit-vs-cash-flow/'];

const homepagePreviewRoutes = [
  ['Calculate a Coal LSL levy', '/tools/coal-lsl-levy/', 'calc-form'],
  ['Check a BAS pack before manager review', '/evaluate/manager-review-gate/', 'accounting-problem'],
  ['Use accounting functions in Excel', '/tools/ozzit/', 'worked-example'],
];

const homeHeightBaseline = {
  // Ceilings, not targets, re-measured against the merged page: main shortened
  // these routes with the shared rhythm and the adoption route lengthens the
  // homepage, so neither side's numbers described the result. Mobile now
  // renders at 9,489px and keeps the 234px guard the adoption route documented.
  // Desktop renders at 6,360px, under the ceilings main already had, so those
  // stay as they are rather than being loosened to fit.
  // On 25 September the Adopt and Verify routes shrank to one sentence, two
  // links and a note each. Home measures 5,945px mobile and 4,411px desktop;
  // both ceilings drop to that plus the 234px guard so the page stays short.
  'mobile-chromium': 6179,
  'desktop-chromium': 4645,
};

const representativeHeightBaseline = {
  'mobile-chromium': new Map([
    // Shortened homepage, 25 September: 5,945px plus the 234px guard.
    ['/', 6179],
    // The four starting routes (heading plus four two-line rows) replaced the
    // direct example links on 18 September 2026, and the Ozzit entry joined
    // the Calculate group the same day. Tools measures 8,978px at 390px wide
    // in the mobile project. Retain the 234px guard.
    // The 21 September Excel chooser row and calculator shortcut add 121px
    // at 390px in Camofox. Add that measured content cost to the existing
    // ceiling; Chromium CI run 35598730192 confirms this limit passes.
    ['/tools/', 9333],
    // The Xero certification record adds a badge, 4 dated facts and its
    // boundary note to Identity and credentials. The upstream summary then
    // gained the detection-is-not-prevention qualification on 18 September
    // 2026. Evidence measures 7,354px at 390px wide, with the record's facts
    // held to 2 columns at this width rather than stacking to 8 lines. Retain
    // the same 234px guard.
    // The 22 September local-engine, AI-host and optional-adapter boundaries
    // add 350px. Measured at 7,704px; retain the existing 234px guard.
    // On 23 September the upstream details move below the contents into a
    // named section with normal body text. Navigation arrives sooner; the
    // page measures 8,062px. Keep the 234px guard for this readable layout.
    // On 25 September the XeroAPI command-line merge joins accepted upstream
    // work. Chromium CI run 36020935294 measures 8,372px; keep the 234px guard.
    // The corpus and release policy links moved here from the homepage on
    // 25 September. With both changes the page measures 8,595px; keep the
    // 234px guard.
    ['/evidence/', 8829],
  ]),
  'desktop-chromium': new Map([
    // The browser-calculator route replaced 'nothing sent anywhere' with the
    // input-scoped description on 18 September 2026, which wraps to a third
    // line. Home measures 6,535px at 1440px wide, plus the 234px guard.
    // Shortened homepage, 25 September: 4,411px plus the 234px guard.
    ['/', 4645],
    // Tools renders at 5,386px in Chromium CI run 35598730192 after the
    // Excel chooser row and calculator shortcut. Retain the 234px guard.
    ['/tools/', 5620],
    // Evidence renders at 4,802px with the article body on the 68ch reading
    // measure and the Xero certification record under Identity and
    // credentials, plus the 234px guard.
    // The same scoped privacy explanation measures 5,241px on desktop.
    // The XeroAPI command-line merge adds a paragraph: 5,563px in Chromium CI
    // run 36020935294, plus the 234px guard.
    // With the corpus and release policy links from the homepage (25
    // September) and the XeroAPI paragraph it measures 5,724px. Keep the
    // 234px guard.
    // The 56ch reading measure of 26 September wraps its prose sooner: 6,451px
    // locally, plus the 234px guard.
    ['/evidence/', 6685],
  ]),
};

async function decodedHomeProof(page) {
  const disclosure = page.locator('.proof-capture');
  if ((await disclosure.getAttribute('open')) === null) {
    await disclosure.locator('summary').click();
  }
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

    // Moderate and best-practice findings fail too: the 26 September audit found
    // a landmark gap that a serious-or-critical filter let through on every page.
    const scan = await new AxeBuilder({ page }).analyze();
    const violations = scan.violations.map(({ id, impact, nodes }) => `${id} (${impact}): ${nodes[0]?.target}`);
    expect(violations, `${route} has axe violations`).toEqual([]);
    health.assertHealthy();
  });
}

test('refusal tables keep prose readable and scroll with the keyboard', async ({ page }) => {
  await page.goto('/tools/refusals/');
  await waitForVisualFonts(page);
  const regions = page.locator('.table-scroll');
  for (const region of await regions.all()) {
    const cells = await region.locator('tbody td').evaluateAll((elements) => elements.map((cell) => {
      const style = getComputedStyle(cell);
      return cell.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    }));
    for (const width of cells) expect(width).toBeGreaterThanOrEqual(100);
    if (await region.evaluate((element) => element.scrollWidth > element.clientWidth)) {
      await region.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

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
    name: 'Open source tools for Australian accountants',
    exact: true,
  })).toBeVisible();

  const actions = page.getByRole('navigation', { name: 'Homepage actions' });
  await expect(actions.getByRole('link')).toHaveText([
    'Explore the cash flow example',
  ]);
  await expect(actions.getByRole('link').nth(0)).toHaveAttribute('href', '/examples/profit-vs-cash-flow/');
  await expect(page.locator('.home-tool-preview a[href="/tools/"]')).toHaveText([
    'Browse tools by accounting task',
  ]);

  await expect(page.locator('main > section, main > aside').first()).toHaveClass(/home-hero/);
  await expect(page.locator('.home-hero + section')).toHaveClass(/home-tool-preview/);
  if (testInfo.project.name === 'mobile-chromium') {
    const primaryAction = await actions.getByRole('link').first().boundingBox();
    expect(primaryAction.y + primaryAction.height).toBeLessThan(page.viewportSize().height);
  }

  const categories = page.getByRole('navigation', { name: 'Starting routes' });
  await expect(categories.getByRole('heading', { level: 3 })).toHaveText([
    'Use accounting functions in Excel',
    'Review a month-end close',
    'Calculate a Coal LSL levy',
    'Check a BAS pack before manager review',
  ]);
  expect(await page.evaluate(() => {
    const preview = document.querySelector('.home-tool-preview');
    const proof = document.querySelector('.proof-feature');
    return Boolean(preview && proof
      && (preview.compareDocumentPosition(proof) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  for (const identifier of ['adopt', 'verify']) {
    await expect(page.locator(`#${identifier}`)).toHaveCount(1);
  }
  await expect(page.locator('#engage')).toHaveCount(0);
  expect(await page.locator('.route-section').evaluateAll((sections) =>
    sections.map((section) => getComputedStyle(section).minHeight)
  )).toEqual(['0px', '0px', '0px']);
  await decodedHomeProof(page);
  expect(await page.evaluate(() => document.documentElement.scrollHeight))
    .toBeLessThan(homeHeightBaseline[testInfo.project.name]);
  health.assertHealthy();
});

// The retired /engage/ path itself is a 301 at the Cloudflare edge, checked by
// scripts/check_production.mjs; the local preview only sees the hash form.
test('the retired Engage hash redirects quietly to the homepage', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/#engage');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Open source tools for Australian accountants',
  );
  health.assertHealthy();
});

test('representative routes stay within their height limits', async ({ page }, testInfo) => {
  for (const [route, baseline] of representativeHeightBaseline[testInfo.project.name]) {
    await page.goto(route);
    await waitForVisualFonts(page);
    if (route === '/') await decodedHomeProof(page);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, `${route} ${testInfo.project.name}`).toBeLessThan(baseline);
  }
});

test('home proposition and actions fit the initial desktop viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop viewport matrix runs once');

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await waitForVisualFonts(page);

    const geometry = await page.evaluate(() => {
      const heading = document.querySelector('.home-hero h1');
      const actions = document.querySelector('.home-hero__actions');
      const headingStyle = getComputedStyle(heading);
      const headingBounds = heading.getBoundingClientRect();
      const actionBounds = actions.getBoundingClientRect();
      return {
        fontSize: parseFloat(headingStyle.fontSize),
        lineCount: Math.round(headingBounds.height / parseFloat(headingStyle.lineHeight)),
        actionsBottom: actionBounds.bottom,
        viewportHeight: innerHeight,
      };
    });

    expect(geometry.fontSize, `${viewport.width}px long headline`).toBeLessThanOrEqual(60);
    expect(geometry.lineCount, `${viewport.width}px heading lines`).toBeLessThanOrEqual(2);
    expect(geometry.actionsBottom, `${viewport.width}px action position`)
      .toBeLessThanOrEqual(geometry.viewportHeight);
  }
});

test('homepage supporting text respects contrast and print overrides while staying dark on screen', async ({ page }) => {
  await page.goto('/');
  const note = page.locator('.home-hero__note');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(note).toHaveCSS('color', 'rgb(218, 218, 218)');
  }
  await page.emulateMedia({ contrast: 'more' });
  await expect(note).toHaveCSS('color', 'rgb(242, 242, 242)');
  for (const contrast of ['no-preference', 'more']) {
    await page.emulateMedia({ contrast, media: 'print' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(note).toHaveCSS('color', 'rgb(0, 0, 0)');
  }
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
  for (const route of noCurrentNavigationRoutes) {
    await page.goto(route);
    const primary = page.getByRole('navigation', { name: 'Primary' });
    await expect(primary.locator('[aria-current]')).toHaveCount(0);
  }
  health.assertHealthy();
});

test('all six primary navigation links fit the smallest mobile width', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile contract only');
  const health = observePageHealth(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  const primary = page.getByRole('navigation', { name: 'Primary' });
  // Every link, Contact included, must be visible without horizontal
  // scrolling: a clipped nav item with no scroll cue is an invisible route.
  // Below 360 px the row may wrap instead.
  const geometry = await primary.evaluate((navigation) => {
    const navigationBounds = navigation.getBoundingClientRect();
    return {
      clientWidth: navigation.clientWidth,
      scrollWidth: navigation.scrollWidth,
      links: [...navigation.querySelectorAll('a')].map((link) => {
        const bounds = link.getBoundingClientRect();
        return {
          label: link.textContent,
          fullyVisible: bounds.left >= navigationBounds.left - 1
            && bounds.right <= navigationBounds.right + 1,
        };
      }),
    };
  });
  expect(geometry.scrollWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.links).toHaveLength(6);
  for (const link of geometry.links) {
    expect(link.fullyVisible, `${link.label} is clipped`).toBe(true);
  }
  const lastPrimaryLink = primary.getByRole('link', { name: 'Contact' });
  await primary.getByRole('link', { name: 'Tools' }).focus();
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(lastPrimaryLink).toBeFocused();
  health.assertHealthy();
});

test('mobile sticky header gives readable navigation two rows', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile contract only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const height = await page.locator('.site-header').evaluate((header) => (
    Math.round(header.getBoundingClientRect().height)
  ));
  expect(height).toBeLessThanOrEqual(132);
  for (const width of [320, 360, 390, 480, 481, 640]) {
    await page.setViewportSize({ width, height: 844 });
    const sizes = await page.locator('.site-nav a').evaluateAll(links => links.map(link => {
      const rect = link.getBoundingClientRect();
      return { width: rect.width, height: rect.height, font: parseFloat(getComputedStyle(link).fontSize) };
    }));
    for (const size of sizes) {
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
      expect(size.font).toBeGreaterThanOrEqual(14);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('all homepage starting routes land on their targets', async ({ page }) => {
  const health = observePageHealth(page);
  for (const [label, href, target] of homepagePreviewRoutes) {
    await page.goto('/');
    const catalogue = page.getByRole('navigation', { name: 'Starting routes' });
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

test('home proof image loads only when requested and decodes before capture', async ({ page }, testInfo) => {
  const health = observePageHealth(page);
  await page.goto('/');
  const proof = page.getByRole('img', {
    name: /Coal LSL calculator result showing Formula B/,
    includeHidden: true,
  });
  await expect(proof).toHaveAttribute('loading', 'lazy');
  await decodedHomeProof(page);
  // The mobile breakpoint serves the 390-CSS-px render at twice the density
  // so the ledger text stays legible; wider viewports keep the desktop asset.
  const expectedNatural = testInfo.project.name === 'mobile-chromium'
    ? { width: 780, height: 1280 }
    : { width: 868, height: 580 };
  expect(await proof.evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))).toEqual(expectedNatural);
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
  // This baseline shows the disclosure closed. The proof tests above cover
  // opening and decoding each responsive image.
  await expect(page.locator('.proof-capture')).not.toHaveAttribute('open');
  await page.evaluate(() => scrollTo(0, 0));

  const viewport = testInfo.project.name === 'mobile-chromium'
    ? 'mobile'
    : 'desktop';
  await expect(page).toHaveScreenshot(`homepage-${viewport}.png`, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    // The former ratio allowance grew with page height and hid a stale
    // adoption heading. Keep a fixed margin for incidental raster noise.
    maxDiffPixels: 100,
  });
  health.assertHealthy();
});
