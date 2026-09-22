import { test, expect } from '@playwright/test';

test('mobile discovery links have room to tap without horizontal scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile layout coverage');
  const routes = [
    ['/', '.home-hero__actions a, .home-tool-preview__entry a, .proof-feature__links a'],
    ['/tools/', '.task-routes a, .collection-entry__title, .collection-entry__links a'],
    ['/tools/ozzit/', '.article-toc a'],
    ['/evaluate/manager-review-gate/', '.article-toc a'],
    ['/examples/profit-vs-cash-flow/', '.article-toc a'],
  ];
  for (const width of [320, 390, 640]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [route, selector] of routes) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      const targets = await page.locator(selector).evaluateAll((links) => links.map((link) => {
        const rect = link.getBoundingClientRect();
        return { text: link.textContent.trim(), width: rect.width, height: rect.height };
      }));
      expect(targets.length, route).toBeGreaterThan(0);
      for (const target of targets) {
        expect(target.height, `${width}px ${route} ${target.text}`).toBeGreaterThanOrEqual(44);
        expect(target.width, `${width}px ${route} ${target.text}`).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth), route)
        .toBeLessThanOrEqual(width);
    }
  }
});

test('the extra task chooser works with keyboard and touch', async ({ page }, testInfo) => {
  await page.goto('/tools/');
  const chooser = page.locator('.work-chooser details');
  const summary = chooser.locator('summary');
  const excel = chooser.getByRole('link', { name: /Ozzit Excel LAMBDA library/ });
  await expect(chooser).not.toHaveAttribute('open');
  await expect(excel).not.toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(excel).toBeVisible();
  await page.keyboard.press('Space');
  await expect(excel).not.toBeVisible();
  if (testInfo.project.name === 'mobile-chromium') {
    await summary.tap();
    await excel.tap();
  } else {
    await summary.click();
    await excel.click();
  }
  await expect(page).toHaveURL(/\/tools\/ozzit\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/tools\/$/);
  await expect(page.getByRole('navigation', { name: 'Start with what you came to do' })).toBeVisible();
});

test('enlarged mobile text keeps the page in view and navigation reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile text resizing coverage');
  for (const route of ['/', '/tools/', '/tools/ozzit/', '/evaluate/manager-review-gate/']) {
    await page.goto(route);
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%', 'important'));
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(390);
    const contact = page.locator('.site-nav').getByRole('link', { name: 'Contact', exact: true });
    await contact.evaluate((link) => link.scrollIntoView({ block: 'nearest', inline: 'end', behavior: 'instant' }));
    await expect.poll(async () => {
      const position = await contact.boundingBox();
      return position.x >= 0 && position.x + position.width <= 390;
    }).toBe(true);
    const overlap = await page.evaluate(() => {
      const name = document.querySelector('.site-identity').getBoundingClientRect();
      const mode = document.querySelector('.view-mode').getBoundingClientRect();
      return name.right > mode.left && name.bottom > mode.top;
    });
    expect(overlap, `${route} site name and view switch overlap`).toBe(false);
  }
});
