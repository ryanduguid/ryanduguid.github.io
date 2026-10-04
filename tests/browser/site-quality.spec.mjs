import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { observePageHealth } from './health.mjs';
import { gotoForVisualSnapshot, waitForVisualFonts } from './visual.mjs';
import { projectKind } from './project-kind.mjs';

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
  // The single chart action of 1 October adds a measured 35px mobile and
  // 36px desktop. Keep the previous headroom above the new content height.
  mobile: 6214,
  desktop: 4681,
};

const representativeHeightBaseline = {
  mobile: new Map([
    // Shortened homepage, 25 September: 5,945px plus the 234px guard.
    ['/', homeHeightBaseline.mobile],
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
    // On 28 September six more merged upstream changes join the section.
    // Measured at 10,221px; keep the 234px guard.
    // Supplier information for AI registers, 29 September: 11,335px, plus the
    // 234px guard.
    // The security policy and Actions table of 30 September replaces two
    // link-chain sentences; its 44px phone targets make it 12,031px. Keep
    // the 234px guard.
    ['/evidence/', 12265],
  ]),
  desktop: new Map([
    // The browser-calculator route replaced 'nothing sent anywhere' with the
    // input-scoped description on 18 September 2026, which wraps to a third
    // line. Home measures 6,535px at 1440px wide, plus the 234px guard.
    // Shortened homepage, 25 September: 4,411px plus the 234px guard.
    ['/', homeHeightBaseline.desktop],
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
    // Six more merged upstream changes on 28 September: 7,682px locally,
    // plus the 234px guard.
    // Supplier information for AI registers, 29 September: 8,534px locally,
    // plus the 234px guard.
    // The security policy and Actions table, 30 September: 8,986px locally,
    // plus the 234px guard.
    ['/evidence/', 9220],
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

test('a focused and hovered skip link keeps its contrast', async ({ page }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'desktop', 'hover needs a pointer');
  await page.goto('/');
  const skip = page.locator('.skip-link');
  // Read the settled colours, not a frame of the link colour transition:
  // a:hover used to turn the text stamp green on ink (1.17:1). The page CSP
  // refuses an injected stylesheet, so the transition is switched off through
  // the element's own style object.
  await skip.evaluate((element) => { element.style.transition = 'none'; });
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await skip.hover();
  const colours = await skip.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(colours).toEqual({ color: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 240)' });
  const scan = await new AxeBuilder({ page }).include('.skip-link').withRules(['color-contrast']).analyze();
  expect(scan.violations).toEqual([]);
});

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

// Prose keeps the 56ch measure, but a wide table's scroll box may take the free
// content column, so every column shows once that column has room, from about
// 1065px (a regression of the 26 September measure change). Narrower columns,
// beside the contents rail or on phones, may still scroll.
const wideTablePages = [
  '/evaluate/',
  '/examples/profit-vs-cash-flow/',
  '/tools/australian-tax-ai-agents/',
  '/tools/limitations/',
  '/tools/monthly-close-controls/',
  '/tools/ozzit/',
  '/tools/refusals/',
  '/tools/xero-trial-balance/',
];

test('wide tables show every column where the content column has room', async ({ page }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'desktop', 'phones keep the 44rem table minimum and scroll sideways');
  for (const width of [1080, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of wideTablePages) {
      await page.goto(path);
      await waitForVisualFonts(page);
      const boxes = await page
        .locator('main .table-scroll:has(> .tool-table--wide, > .rate-table--wide)')
        .evaluateAll((elements) => elements.map((element) => ({
          label: element.getAttribute('aria-label'),
          hidden: element.scrollWidth - element.clientWidth,
          pastShell: Math.round(element.getBoundingClientRect().right - element.closest('.site-shell').getBoundingClientRect().right),
        })));
      expect(boxes.length, `${path} wide tables`).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(box.hidden, `${path} ${box.label} at ${width}px`).toBeLessThanOrEqual(1);
        expect(box.pastShell, `${path} ${box.label} at ${width}px`).toBeLessThanOrEqual(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
  // The article grid is a size container now; its contents rail must still stick.
  await page.goto('/tools/ozzit/');
  await page.evaluate(() => window.scrollTo({ top: 2400, behavior: 'instant' }));
  const rail = await page.evaluate(() => ({
    top: document.querySelector('.article-toc').getBoundingClientRect().top,
    header: document.querySelector('.site-header').getBoundingClientRect().bottom,
  }));
  expect(rail.top).toBeGreaterThanOrEqual(rail.header);
  expect(rail.top).toBeLessThanOrEqual(rail.header + 48);
});

test('homepage levy inputs share one top edge when a label wraps', async ({ page }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'mobile', 'the overtime label wraps only at phone width');
  await page.goto('/');
  await waitForVisualFonts(page);
  const tops = await page.locator('.proof-calc__fields input').evaluateAll((inputs) => inputs
    .map((input) => Math.round(input.getBoundingClientRect().top + window.scrollY)));
  expect(Math.abs(tops[0] - tops[1])).toBeLessThanOrEqual(1);
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
  if (projectKind(testInfo) === 'mobile') {
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
    .toBeLessThan(homeHeightBaseline[projectKind(testInfo)]);
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
  for (const [route, baseline] of representativeHeightBaseline[projectKind(testInfo)]) {
    await page.goto(route);
    await waitForVisualFonts(page);
    if (route === '/') await decodedHomeProof(page);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, `${route} ${testInfo.project.name}`).toBeLessThan(baseline);
  }
});

test('home proposition and actions fit the initial desktop viewport', async ({ page }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'desktop', 'desktop viewport matrix runs once');

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
  await expect(note).toHaveCSS('color', 'rgb(255, 255, 240)');
  for (const contrast of ['no-preference', 'more']) {
    await page.emulateMedia({ contrast, media: 'print' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(note).toHaveCSS('color', 'rgb(0, 0, 0)');
  }
});

test('printed pages keep every visible text colour readable on white paper', async ({ page }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'desktop', 'print colours run once');
  // Printers drop background colours, so light ink on a dark fill would print white on white.
  await page.emulateMedia({ media: 'print' });
  const failures = [];
  for (const [name, path] of routes) {
    await page.goto(path);
    const low = await page.evaluate(() => {
      const luminance = (colour) => {
        const [r, g, b] = colour.match(/[\d.]+/g).slice(0, 3).map((value) => {
          const channel = Number(value) / 255;
          return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const found = new Set();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const element = node.parentElement;
        if (!node.textContent.trim() || !element.checkVisibility({ visibilityProperty: true })) continue;
        const colour = getComputedStyle(element).color;
        if (1.05 / (luminance(colour) + 0.05) < 4.5) found.add(`${element.tagName.toLowerCase()} ${colour}`);
      }
      return [...found];
    });
    failures.push(...low.map((item) => `${name}: ${item}`));
  }
  expect(failures).toEqual([]);
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

test('all six primary navigation links fit the smallest mobile width', async ({ page, browserName }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'mobile', 'mobile contract only');
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
  // WebKit, like Safari, leaves links out of the Tab order by default, so the
  // keyboard traversal is a Chromium check.
  if (browserName === 'chromium') {
    const lastPrimaryLink = primary.getByRole('link', { name: 'Contact' });
    await primary.getByRole('link', { name: 'Tools' }).focus();
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(lastPrimaryLink).toBeFocused();
  }
  health.assertHealthy();
});

test('mobile sticky header gives readable navigation two rows', async ({ page }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'mobile', 'mobile contract only');
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
  test.skip(projectKind(testInfo) !== 'desktop', 'width matrix runs once');
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
  const expectedNatural = projectKind(testInfo) === 'mobile'
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
  const minimumProofWidth = projectKind(testInfo) === 'mobile'
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

test('home matches its viewport visual baseline', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'the committed baselines are Chromium renders');
  const health = observePageHealth(page);
  await gotoForVisualSnapshot(page, '/');
  // This baseline shows the disclosure closed. The proof tests above cover
  // opening and decoding each responsive image.
  await expect(page.locator('.proof-capture')).not.toHaveAttribute('open');
  await page.evaluate(() => scrollTo(0, 0));

  const viewport = projectKind(testInfo) === 'mobile'
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

test('the footer signs off with the motto above the ABN line', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/');
  const motto = page.locator('.site-footer__motto');
  // The visible copy is decoration for assistive technology; the hidden copy
  // carries the Latin, spoken as words, and its meaning.
  await expect(motto.locator('.site-footer__motto-mark')).toHaveAttribute('aria-hidden', 'true');
  await expect(motto.locator('.site-footer__motto-mark')).toHaveAttribute('title', 'From faith comes confidence');
  await expect(motto.locator('.site-footer__motto-mark')).toHaveText('EX FIDE FIDUCIA', { useInnerText: true });
  await expect(motto.locator('.visually-hidden')).toHaveText('Ex fide fiducia, Latin for from faith comes confidence');
  await expect(motto.locator('.visually-hidden [lang="la"]')).toHaveText('Ex fide fiducia');
  const geometry = await page.evaluate(() => {
    const inner = document.querySelector('.site-footer__inner');
    const box = (element) => element.getBoundingClientRect();
    const [disclaimer] = inner.querySelectorAll(':scope > p');
    return {
      last: inner.lastElementChild.textContent,
      disclaimerLeft: box(disclaimer).left,
      mottoLeft: box(inner.querySelector('.site-footer__motto')).left,
      mottoBottom: box(inner.querySelector('.site-footer__motto')).bottom,
      abnLeft: box(inner.lastElementChild).left,
      abnTop: box(inner.lastElementChild).top,
    };
  });
  expect(geometry.last).toBe('Ryan Duguid, ABN 59 834 031 764');
  expect(geometry.mottoLeft).toBe(geometry.disclaimerLeft);
  expect(geometry.abnLeft).toBe(geometry.disclaimerLeft);
  expect(geometry.abnTop).toBeGreaterThan(geometry.mottoBottom);
  health.assertHealthy();
});

test('Tools group headings start on the entry descriptions edge', async ({ page }) => {
  await page.goto('/tools/');
  await waitForVisualFonts(page);
  const edges = await page.evaluate(() => [...document.querySelectorAll('.collection-group')].map((group) => ({
    id: group.id,
    heading: group.querySelector(':scope > header > h2').getBoundingClientRect().left,
    description: group.querySelector('.collection-entry > p').getBoundingClientRect().left,
  })));
  expect(edges.length).toBeGreaterThan(0);
  for (const { id, heading, description } of edges) {
    expect(Math.abs(heading - description), id).toBeLessThanOrEqual(1);
  }
});

test('Tools group anchors land just below the header', async ({ page }) => {
  await page.goto('/tools/');
  await waitForVisualFonts(page);
  const gap = await page.evaluate(async () => {
    const group = document.querySelector('#calculate-tools');
    group.scrollIntoView({ behavior: 'instant', block: 'start' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const header = document.querySelector('.site-header').getBoundingClientRect();
    return group.getBoundingClientRect().top - Math.max(0, header.bottom);
  });
  // The root scroll padding is the one owner of header clearance.
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(24);
});

test('the About portrait is centred and fits its frame', async ({ page }) => {
  // At tablet width the portrait stacks under the statement but is narrower
  // than the column, so this is where an uncentred frame shows.
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/about/');
  await waitForVisualFonts(page);
  const geometry = await page.evaluate(() => {
    const frame = document.querySelector('.about-portrait');
    const pre = frame.querySelector('pre');
    const column = frame.parentElement.getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    return {
      stacked: getComputedStyle(frame).gridColumnStart !== '2',
      offCentre: (box.left - column.left) - (column.right - box.right),
      overflow: pre.scrollWidth - pre.clientWidth,
      rows: pre.textContent.trim().split('\n').length,
      longest: Math.max(...pre.textContent.split('\n').map((line) => line.length)),
    };
  });
  expect(geometry.stacked).toBe(true);
  expect(Math.abs(geometry.offCentre)).toBeLessThanOrEqual(1);
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(geometry.rows).toBeGreaterThan(40);
  // The stylesheet sizes the type for 120 columns.
  expect(geometry.longest).toBeLessThanOrEqual(120);
});

test('on a landscape phone the header and view switch scroll away', async ({ page }) => {
  // 812 wide is the two-row tablet header; 932 wide is above the 56rem
  // collapse, where the contents rail and calculator result would otherwise stick.
  for (const viewport of [{ width: 812, height: 375 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(viewport);
    for (const route of ['/about/', '/tools/coal-lsl-levy/']) {
      await page.goto(route);
      await waitForVisualFonts(page);
      await page.evaluate(() => scrollTo({ top: 600, behavior: 'instant' }));
      const geometry = await page.evaluate(() => ({
        scrolled: scrollY,
        header: document.querySelector('.site-header').getBoundingClientRect().bottom,
        toggle: document.querySelector('.view-mode').getBoundingClientRect().bottom,
        rail: getComputedStyle(document.querySelector('.article-toc, .calculator-result')).position,
      }));
      const label = `${route} ${viewport.width}x${viewport.height}`;
      expect(geometry.scrolled, label).toBeGreaterThan(0);
      expect(geometry.header, label).toBeLessThanOrEqual(0);
      expect(geometry.toggle, label).toBeLessThanOrEqual(0);
      expect(geometry.rail, label).toBe('static');
    }
  }
  // Machine view fills the viewport, so there the switch stays pinned in view
  // even when the page underneath was left scrolled.
  await page.addInitScript(() => localStorage.setItem('duguid-view-mode', 'machine'));
  for (const viewport of [{ width: 812, height: 375 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/about/');
    await expect(page.getByRole('main', { name: 'Machine view' })).toBeVisible();
    await page.evaluate(() => scrollTo({ top: 600, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    const toggle = page.locator('.view-mode');
    await expect(toggle).toHaveCSS('position', 'fixed');
    await expect(toggle).toBeInViewport({ ratio: 1 });
  }
});

// WCAG 2.2 target size: these links measured 22px at 768px on 30 September
// 2026. Phones already get the 44px rule, so the tablet width is the one to hold.
test('secondary entry and footer links stay at least 24px tall at tablet width', async ({ page }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'desktop', 'phones use the 44px rule');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/tools/');
  await waitForVisualFonts(page);
  const links = await page.locator('.collection-entry__links a, .site-footer__links a').evaluateAll((elements) =>
    elements
      .filter((element) => element.getClientRects().length)
      .map((element) => ({ text: element.textContent.trim(), height: element.getBoundingClientRect().height })));
  expect(links.length).toBeGreaterThan(0);
  for (const { text, height } of links) expect(height, text).toBeGreaterThanOrEqual(24);
});

// A line may break between U+2212 and "$", which stranded the minus sign at
// 320px until each negative amount was wrapped in .nowrap.
test('a minus sign stays on the line of its amount at 320px', async ({ page }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'mobile', 'narrow-screen wrapping');
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of ['/', '/examples/profit-vs-cash-flow/', '/evaluate/', '/tools/monthly-close-controls/']) {
    await page.goto(path);
    await waitForVisualFonts(page);
    const split = await page.evaluate(() => {
      const found = [];
      const letter = (node, index) => {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        return range.getClientRects()[0];
      };
      const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let i = node.data.indexOf('−$'); i >= 0; i = node.data.indexOf('−$', i + 1)) {
          const minus = letter(node, i);
          const dollar = letter(node, i + 1);
          if (minus && dollar && Math.abs(minus.top - dollar.top) > 2) found.push(node.data.slice(i, i + 12));
        }
      }
      return found;
    });
    expect(split, path).toEqual([]);
  }
});
