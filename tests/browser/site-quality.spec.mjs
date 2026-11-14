// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

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

// Ryan cut the primary navigation to 5 links on 4 November 2026.
const primaryNavigation = [
  ['/tools/', 'Tools'],
  ['/tools/accounting-questions/', 'Questions'],
  ['/rates/', 'Rates'],
  ['/evidence/', 'Evidence'],
  ['/about/', 'About'],
];

const currentNavigationCases = [
  ['/tools/', 'Tools', 'page'],
  ['/tools/coal-lsl-levy/', 'Tools', 'location'],
  ['/works-with/', 'Tools', 'location'],
  ['/works-with/xero/', 'Tools', 'location'],
  ['/works-with/claude/', 'Tools', 'location'],
  ['/rates/', 'Rates', 'page'],
  ['/rates/super-guarantee/', 'Rates', 'location'],
  ['/tools/accounting-questions/', 'Questions', 'page'],
  ['/tools/accounting-questions/payroll-super/', 'Questions', 'location'],
  ['/evaluate/', 'Tools', 'location'],
  ['/evaluate/manager-review-gate/', 'Tools', 'location'],
];

// Worked examples sit under Home, and Contact has no primary link, so no
// primary link claims the current location on those routes.
const noCurrentNavigationRoutes = ['/examples/profit-vs-cash-flow/', '/contact/'];

// One destination from each reader route, plus the task routes they lead with.
const homepagePreviewRoutes = [
  ['Calculate a Coal LSL levy', '/tools/coal-lsl-levy/', 'calc-form'],
  ['Check a BAS pack before manager review', '/evaluate/manager-review-gate/', 'accounting-problem'],
  ['Use accounting functions in Excel', '/tools/ozzit/', 'worked-example'],
  ['Maintained rate tables', '/rates/', 'excel'],
  ['Evidence behind the tools', '/evidence/', 'identity-and-credentials'],
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
  // The Latest tool releases list of 25 October adds a measured 332px mobile
  // and 260px desktop. Keep the previous headroom above the new content height.
  // The 29 October Skills release replaces the shorter MCP link in the latest
  // releases list. Its extra wrapped line adds 50px on mobile; retain the margin.
  // The footer's humans.txt link of 29 October adds a measured 52px mobile and
  // 32px desktop to every page. Keep the previous headroom above the new
  // content height, here and in the route ceilings below.
  // On 4 November reader routes and one release register replace the Coal
  // LSL proof and the 3 closing sections. Home measures 3,626px mobile and
  // 2,136px desktop; both ceilings drop to that plus the 234px guard.
  mobile: 3860,
  desktop: 2370,
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
    // The 29 October footer link adds 52px.
    ['/tools/', 9385],
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
    // The fabricated quarter case of 4 October adds the checked narrative,
    // three cash rows and six evidence downloads. It measures 14,555px at
    // 390px; retain the existing 234px allowance above the content height.
    // The 29 October footer link adds 52px.
    // 'Results you can check' and the dated nearby products measure 16,743px;
    // retain the 234px allowance.
    ['/evidence/', 16977],
  ]),
  desktop: new Map([
    // The browser-calculator route replaced 'nothing sent anywhere' with the
    // input-scoped description on 18 September 2026, which wraps to a third
    // line. Home measures 6,535px at 1440px wide, plus the 234px guard.
    // Shortened homepage, 25 September: 4,411px plus the 234px guard.
    ['/', homeHeightBaseline.desktop],
    // Tools renders at 5,386px in Chromium CI run 35598730192 after the
    // Excel chooser row and calculator shortcut. Retain the 234px guard.
    // Later content had used most of that guard: on 5 October main measured
    // 5,611px, 9px under this ceiling. The gap added that day between the
    // starting routes and the note after them measures 24px (5,635px), so the
    // ceiling rises by 24px and keeps the same 9px allowance.
    // The keyword and delivery filter of 25 October measures 205px (5,840px);
    // the ceiling rises by that cost and keeps the same 9px allowance.
    // The 29 October footer link adds 32px (5,872px); same allowance.
    ['/tools/', 5881],
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
    // The same quarter case measures 11,036px at 1440px. Retain the 234px
    // allowance; the new content accounts for this increase.
    // The 29 October footer link adds 32px.
    // 'Results you can check' and the dated nearby products measure 12,662px;
    // retain the 234px allowance.
    ['/evidence/', 12896],
  ]),
};

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

    // A body that opens with a heading keeps the standard gap below the header
    // rule; on 5 October 2026 Contact and Evaluations had theirs flush against it.
    const headingGap = await page.evaluate(() => {
      const header = document.querySelector('main .article-header');
      if (!header) return null;
      const bottom = header.getBoundingClientRect().bottom;
      const first = [...header.closest('main').querySelectorAll('h2, h3, p, li, dl, table, summary, figure, nav')]
        .filter((element) => !header.contains(element) && element.getBoundingClientRect().height > 0)
        .find((element) => element.getBoundingClientRect().top >= bottom - 1);
      return first && /^H[23]$/.test(first.tagName) ? first.getBoundingClientRect().top - bottom : null;
    });
    if (headingGap !== null) expect(headingGap, `${route} heading below the header rule`).toBeGreaterThanOrEqual(24);

    // Moderate and best-practice findings fail too: the 26 September audit found
    // a landmark gap that a serious-or-critical filter let through on every page.
    const scan = await new AxeBuilder({ page }).analyze();
    const violations = scan.violations.map(({ id, impact, nodes }) => `${id} (${impact}): ${nodes[0]?.target}`);
    expect(violations, `${route} has axe violations`).toEqual([]);
    // Since 13 October 2026 the pass token, Rhodesian green, is the one green
    // the site may show; any other green is a leftover of the retired palette.
    const greenAccents = await page.evaluate(() => {
      const properties = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor',
        'outlineColor', 'textDecorationColor', 'accentColor'];
      return [...document.querySelectorAll('*')].flatMap((element) => {
        const style = getComputedStyle(element);
        return properties.flatMap((property) => {
          const channels = style[property].match(/^rgba?\((\d+), (\d+), (\d+)/);
          if (!channels) return [];
          const [, red, green, blue] = channels.map(Number);
          if (red === 15 && green === 75 && blue === 50) return [];
          return green > red + 20 && green > blue + 20
            ? [`${element.tagName}.${element.className}: ${property} ${style[property]}`]
            : [];
        });
      });
    });
    expect(greenAccents, `${route} keeps a green accent`).toEqual([]);
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

// The about and contact facts are 2 columns of prose and links: on a 320px
// phone they fit their regions rather than scroll a few pixels (14 November 2026).
test('key-value tables fit a 320px phone without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const route of ['/about/', '/contact/']) {
    await page.goto(route);
    await waitForVisualFonts(page);
    const overflow = await page.locator('main .table-scroll:has(> .facts--kv)').evaluateAll((regions) => regions
      .map((region) => region.scrollWidth - region.clientWidth));
    expect(overflow.length, `${route} key-value regions`).toBeGreaterThan(0);
    expect(overflow, `${route} key-value overflow in pixels`).toEqual(overflow.map(() => 0));
  }
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
  expect(() => health.assertHealthy()).not.toThrow();
});

test('home leads with one action, then 3 reader routes and the release register', async ({ page }, testInfo) => {
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
    'All tools by accounting task',
  ]);

  await expect(page.locator('main > section, main > aside').first()).toHaveClass(/home-hero/);
  await expect(page.locator('.home-hero + section')).toHaveClass(/home-tool-preview/);
  if (projectKind(testInfo) === 'mobile') {
    const primaryAction = await actions.getByRole('link').first().boundingBox();
    expect(primaryAction.y + primaryAction.height).toBeLessThan(page.viewportSize().height);
  }

  const categories = page.getByRole('navigation', { name: 'Starting routes' });
  await expect(categories.getByRole('heading', { level: 3 })).toHaveText([
    'Check a pack or calculate',
    'Answer a tax or payroll question',
    'Review my work',
  ]);
  await expect(page.locator('.home-tool-preview + section')).toHaveId('adopt');
  for (const identifier of ['adopt', 'verify']) {
    await expect(page.locator(`#${identifier}`)).toHaveCount(1);
  }
  await expect(page.locator('#engage')).toHaveCount(0);
  await expect(page.locator('script[src="/assets/home-levy.mjs"], link[href="/assets/levy.mjs"]'))
    .toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight))
    .toBeLessThan(homeHeightBaseline[projectKind(testInfo)]);
  health.assertHealthy();
});

// The retired /engage/ path itself is a 301 at the Cloudflare edge, checked by
// site-tools check_production; the local preview only sees the hash form.
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
    await expect(note).toHaveCSS('color', 'rgb(229, 228, 226)');
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

test('all five primary navigation links fit the smallest mobile width', async ({ page, browserName }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'mobile', 'mobile contract only');
  const health = observePageHealth(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  const primary = page.getByRole('navigation', { name: 'Primary' });
  // Every link, About included, must be visible without horizontal
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
  expect(geometry.links).toHaveLength(5);
  for (const link of geometry.links) {
    expect(link.fullyVisible, `${link.label} is clipped`).toBe(true);
  }
  // WebKit, like Safari, leaves links out of the Tab order by default, so the
  // keyboard traversal is a Chromium check.
  if (browserName === 'chromium') {
    const lastPrimaryLink = primary.getByRole('link', { name: 'About' });
    await primary.getByRole('link', { name: 'Tools' }).focus();
    for (let index = 0; index < 4; index += 1) {
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

// A figure or result code broken across lines can be misread. On 10 November
// 2026 a phone showed '$68,108' as '$68,1' over '08' on the car limit page, and
// desktop split 'NOT_READY' on Workpaper Review Gate: the body's
// overflow-wrap: anywhere let table columns shrink below a whole word.
const splitFigures = (page) => page.evaluate(() => {
  const whole = /^\(?[-−]?\$?\d[\d,.]*%?\)?[,.;:]?$|^[A-Z][A-Z_]{3,}[A-Z]$/;
  const found = [];
  for (const cell of document.querySelectorAll('main td')) {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // Firefox breaks a line between a minus and '$', which Chromium keeps
      // together: '-$50.00,' split at 320 and 390px on 14 November 2026.
      if (!/^(nowrap|pre)$/.test(getComputedStyle(node.parentElement).whiteSpace)) {
        found.push(...[...node.nodeValue.matchAll(/[-−]\$\S*/g)].map((match) => match[0]));
      }
      for (const match of node.nodeValue.matchAll(/\S+/g)) {
        if (!whole.test(match[0])) continue;
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const lines = new Set([...range.getClientRects()].filter((rect) => rect.width > 0)
          .map((rect) => Math.round(rect.top)));
        if (lines.size > 1) found.push(match[0]);
      }
    }
  }
  return found;
});

const supportsCue = (page) => page.evaluate(() =>
  CSS.supports('(scroll-timeline: --table-scroll inline) and (animation-timeline: --table-scroll)'));

const cueStates = (page) => page.evaluate(() => new Promise((resolve) => {
  // The scroll timeline settles after layout.
  requestAnimationFrame(() => requestAnimationFrame(() => resolve(
    [...document.querySelectorAll('main :is(.table-scroll, .employee-table-scroll)')].map((region) => {
      const style = getComputedStyle(region, '::before');
      return {
        label: region.getAttribute('aria-label'),
        scrolls: region.scrollWidth > region.clientWidth,
        cue: style.content.includes('Scroll sideways for more columns') &&
          style.visibility === 'visible' && style.display !== 'none' && style.blockSize !== '0px',
      };
    }),
  )));
}));

// One test per width: all four in one test made 260 navigations, which took
// 22 to 35 seconds on a Windows CI runner against the 30-second test limit.
// Each route loads once per width for every check below.
for (const width of [320, 390, 768, 1440]) {
  test(`public pages do not overflow at the ${width}px refinement acceptance width`, async ({ page }, testInfo) => {
    test.skip(projectKind(testInfo) !== 'desktop', 'width matrix runs once');
    const health = observePageHealth(page);
    await page.setViewportSize({ width, height: 844 });
    const cueSupported = await supportsCue(page);
    const broken = [];
    const miscued = [];
    for (const [, route] of routes) {
      await page.goto(route);
      const viewport = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(viewport.scrollWidth, `${route} overflow at ${width}px`)
        .toBeLessThanOrEqual(viewport.clientWidth);
      await page.evaluate(() => document.fonts.ready);
      broken.push(...(await splitFigures(page)).map((token) => `${route} ${token}`));
      for (const region of await cueStates(page)) {
        if (region.cue !== (cueSupported && region.scrolls)) {
          miscued.push(`${route} ${region.label}: scrolls ${region.scrolls}, cue ${region.cue}`);
        }
      }
    }
    expect(broken, `figures and result codes split across lines at ${width}px`).toEqual([]);
    expect(miscued, `scroll cues that disagree with scrolling at ${width}px`).toEqual([]);
    health.assertHealthy();
  });
}

// The reduced-motion rule shortens every animation, and paper does not scroll.
test('the scroll cue holds with reduced motion and stays off paper', async ({ page }, testInfo) => {
  test.skip(projectKind(testInfo) !== 'mobile', 'phone tables scroll');
  const cueSupported = await supportsCue(page);
  await page.goto('/tools/refusals/');
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await cueStates(page);
  expect(reduced.some((region) => region.scrolls)).toBe(true);
  expect(reduced.map((region) => region.cue)).toEqual(reduced.map((region) => cueSupported && region.scrolls));
  await page.emulateMedia({ media: 'print' });
  const paper = await cueStates(page);
  expect(paper.length).toBeGreaterThan(0);
  expect(paper.every((region) => !region.cue)).toBe(true);
});

// Without scroll timelines (Firefox 157) the cue is a rule at the region's right
// edge, which no computed style reports, so it is read from pixels: the edge as
// shown differs from the edge with the rule hidden. The hiding rule goes in
// through the CSS object model, which the pages' content security policy allows.
const hideEdgeCueOnProbe = (page) => page.evaluate(() => {
  const sheet = [...document.styleSheets]
    .find((candidate) => candidate.href && new URL(candidate.href).pathname === '/assets/site.css');
  sheet.insertRule('[data-cue-probe]::before { visibility: hidden !important; }', sheet.cssRules.length);
});

const edgeCueShown = async (page, region) => {
  await region.scrollIntoViewIfNeeded();
  const box = await region.boundingBox();
  // Start below the region's 3px top rule; end at the region or the window.
  const top = Math.max(box.y + 4, 0);
  const clip = {
    x: box.x + box.width - 6,
    y: top,
    width: 6,
    height: Math.min(box.y + box.height, page.viewportSize().height) - top,
  };
  const shown = await page.screenshot({ clip });
  await region.evaluate((element) => { element.dataset.cueProbe = ''; });
  const hidden = await page.screenshot({ clip });
  await region.evaluate((element) => { delete element.dataset.cueProbe; });
  return !shown.equals(hidden);
};

// Before 14 November 2026 Firefox showed no cue at all on a table that scrolls.
for (const width of [320, 390]) {
  test(`at ${width}px the edge cue marks exactly the tables that scroll`, async ({ page }, testInfo) => {
    test.skip(projectKind(testInfo) !== 'desktop', 'width matrix runs once');
    // Every page loads, and each visible region takes up to 4 screenshots.
    test.setTimeout(120_000);
    const health = observePageHealth(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    test.skip(await supportsCue(page), 'the caption cue is checked in the width sweep');
    const miscued = [];
    let checked = 0;
    let scrolling = 0;
    for (const [, route] of routes) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      const regions = page.locator('main :is(.table-scroll, .employee-table-scroll)');
      const count = await regions.count();
      if (count > 0) await hideEdgeCueOnProbe(page);
      for (let index = 0; index < count; index += 1) {
        const region = regions.nth(index);
        if (!(await region.isVisible())) continue;
        const label = `${route} ${await region.getAttribute('aria-label')}`;
        const scrolls = await region.evaluate((element) => element.scrollWidth > element.clientWidth);
        const cue = await edgeCueShown(page, region);
        if (cue !== scrolls) miscued.push(`${label}: scrolls ${scrolls}, cue ${cue}`);
        if (scrolls) {
          scrolling += 1;
          // Once the table's end is in view there is nothing more to the right.
          await region.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
          if (await edgeCueShown(page, region)) miscued.push(`${label}: cue at the table's end`);
          await region.evaluate((element) => { element.scrollLeft = 0; });
        }
        checked += 1;
      }
    }
    expect(checked, 'visible table regions checked').toBeGreaterThan(40);
    expect(scrolling, 'regions that scroll').toBeGreaterThan(0);
    expect(miscued, `edge cues that disagree with scrolling at ${width}px`).toEqual([]);
    health.assertHealthy();
  });
}

test('home matches its viewport visual baseline', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'the committed baselines are Chromium renders');
  const health = observePageHealth(page);
  await gotoForVisualSnapshot(page, '/');
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
  // Text extractors read both copies, so a space keeps them separate words.
  expect(await motto.textContent()).toBe('Ex fide fiducia Ex fide fiducia, Latin for from faith comes confidence');
  // The site's one advice disclaimer is a single small-print footer line that
  // links to the full boundary on About.
  const legal = page.locator('.site-footer__legal');
  await expect(legal).toHaveCount(1);
  await expect(legal).toContainText('not a registered tax or BAS agent');
  await expect(legal.getByRole('link', { name: 'Advice and review boundary' })).toHaveAttribute('href', '/about/#advice-boundary');
  const geometry = await page.evaluate(() => {
    const inner = document.querySelector('.site-footer__inner');
    const box = (element) => element.getBoundingClientRect();
    const size = (element) => parseFloat(getComputedStyle(element).fontSize);
    const disclaimer = inner.querySelector(':scope > .site-footer__legal');
    return {
      last: inner.lastElementChild.textContent,
      firstNote: inner.querySelector(':scope > p') === disclaimer,
      disclaimerSize: size(disclaimer),
      mottoSize: size(inner.querySelector('.site-footer__motto')),
      bodySize: size(document.body),
      disclaimerLeft: box(disclaimer).left,
      mottoLeft: box(inner.querySelector('.site-footer__motto')).left,
      mottoBottom: box(inner.querySelector('.site-footer__motto')).bottom,
      abnLeft: box(inner.lastElementChild).left,
      abnTop: box(inner.lastElementChild).top,
    };
  });
  expect(geometry.last).toBe('Ryan Duguid, ABN 59 834 031 764');
  expect(geometry.firstNote).toBe(true);
  expect(geometry.disclaimerSize).toBe(geometry.mottoSize);
  expect(geometry.disclaimerSize).toBeLessThan(geometry.bodySize);
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
  // The ASCII art is decoration, so search snippets skip it.
  await expect(page.locator('.about-portrait')).toHaveAttribute('data-nosnippet', '');
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
