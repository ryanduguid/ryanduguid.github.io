import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

// Budgets for the failures the 26 September 2026 live audit found: the working
// control below the first screen, a phone header that covered a sixth of the
// screen, and body lines of about 90 characters.
const paths = [...readFileSync('sitemap.xml', 'utf8').matchAll(/<loc>https:\/\/duguid\.com\.au([^<]+)<\/loc>/g)]
  .map(([, path]) => path);
const calculators = paths.filter((path) => /^\/tools\/business-calculators\/[a-z-]+\/$/.test(path));
const topics = paths.filter((path) => /^\/tools\/accounting-questions\/[a-z-]+\/$/.test(path));

test('calculator and question pages open on their working control', async ({ page }) => {
  expect(calculators).toHaveLength(9);
  expect(topics).toHaveLength(10);
  for (const path of [...calculators, ...topics]) {
    await page.goto(path);
    const selector = calculators.includes(path) ? 'form[data-calculator] input' : 'details.question summary';
    const box = await page.locator(selector).first().boundingBox();
    expect(box.y + Math.min(box.height, 44), path).toBeLessThanOrEqual(page.viewportSize().height);
  }
});

test('the header scrolls away on phones and stays one sticky line on wide screens', async ({ page }, testInfo) => {
  await page.goto('/tools/');
  const header = await page.locator('.site-header').evaluate((element) => ({
    position: getComputedStyle(element).position,
    height: element.getBoundingClientRect().height,
  }));
  if (testInfo.project.name === 'mobile-chromium') {
    expect(header.position).not.toBe('sticky');
    await page.evaluate(() => window.scrollTo(0, 1200));
    const toggle = await page.getByRole('radiogroup', { name: 'View mode' }).boundingBox();
    expect(toggle.y + toggle.height).toBeLessThanOrEqual(0);
  } else {
    expect(header.position).toBe('sticky');
    // 72px of header plus its 1px rule.
    expect(header.height).toBeLessThanOrEqual(73);
  }
});

test('reading paragraphs stay within about 75 characters a line', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'line length is a wide-screen measure');
  for (const path of paths) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const long = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('2d');
      return [...document.querySelectorAll('main p')]
        .filter((paragraph) => paragraph.offsetParent !== null && paragraph.innerText.trim().length > 160)
        .map((paragraph) => {
          const style = getComputedStyle(paragraph);
          const text = paragraph.innerText.trim();
          context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          return { characters: Math.round(paragraph.clientWidth / (context.measureText(text).width / text.length)), text: text.slice(0, 40) };
        })
        .filter(({ characters }) => characters > 78);
    });
    expect(long, path).toEqual([]);
  }
});
