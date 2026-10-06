import { test, expect } from '@playwright/test';
import { projectKind } from './project-kind.mjs';

// How far a focused control's ring reaches past its box, and how much of that
// a clipping ancestor (a scroll region or the nav) cuts off. Runs in the page.
function focusRingCut(element) {
  const style = getComputedStyle(element);
  if (style.outlineStyle === 'none') return Infinity;
  const reach = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
  const box = element.getBoundingClientRect();
  let cut = 0;
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const s = getComputedStyle(node);
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
    const r = node.getBoundingClientRect();
    const left = r.left + node.clientLeft;
    const top = r.top + node.clientTop;
    cut = Math.max(cut,
      left - (box.left - reach),
      (box.right + reach) - (left + node.clientWidth),
      top - (box.top - reach),
      (box.bottom + reach) - (top + node.clientHeight));
  }
  return cut;
}

test('a wrapped heading link paints its hover fill as one box', async ({ page }) => {
  // Drawn line by line at the heading leading, each line's fill covered the
  // descenders of the line above.
  for (const route of ['/', '/tools/', '/evaluate/', '/rates/', '/tools/accounting-questions/']) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const boxes = await page.locator(':is(h1, h2, h3, h4, h5, h6) > a')
      .evaluateAll((links) => links.map((link) => [link.textContent.trim(), link.getClientRects().length]));
    expect(boxes.length, route).toBeGreaterThan(0);
    for (const [text, count] of boxes) expect(count, `${route} ${text}`).toBe(1);
  }
});

test('Copy sits below its code, clear of every line', async ({ page }) => {
  for (const [route, block] of [['/tools/payday-super/', '#try-example'], ['/tools/ato-benchmarks/', '#get-it']]) {
    await page.goto(route);
    const wrap = page.locator(`${block} .copy-wrap`);
    const code = await wrap.locator('pre').boundingBox();
    const copy = await wrap.getByRole('button', { name: /^Copy/ }).boundingBox();
    expect(copy.y, route).toBeGreaterThanOrEqual(code.y + code.height);
    expect(copy.x + copy.width, route).toBeLessThanOrEqual(code.x + code.width + 0.5);
  }
});

test('a caption in a scroll region wraps to the visible width', async ({ page }) => {
  for (const route of ['/evaluate/', '/evidence/', '/rates/announced-not-yet-law/', '/tools/ozzit/', '/examples/profit-vs-cash-flow/']) {
    await page.goto(route);
    const widths = await page.locator(':is(.table-scroll, .employee-table-scroll) caption').evaluateAll((captions) => captions
      .filter((caption) => caption.getClientRects().length)
      .map((caption) => [caption.getBoundingClientRect().width, caption.closest('.table-scroll, .employee-table-scroll').clientWidth]));
    expect(widths.length, route).toBeGreaterThan(0);
    for (const [caption, region] of widths) expect(caption, route).toBeLessThanOrEqual(region + 0.5);
  }
});

test('header links keep their whole focus ring where the nav scrolls', async ({ page }, testInfo) => {
  const widths = projectKind(testInfo) === 'mobile' ? [320, 390] : [768, 896];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/about/');
    await page.keyboard.press('Tab');
    const links = page.locator('.site-nav a');
    for (let index = 0; index < await links.count(); index += 1) {
      const link = links.nth(index);
      await link.focus();
      expect(await link.evaluate(focusRingCut), `${width}px link ${index}`).toBeLessThanOrEqual(0.5);
    }
  }
});

test('weekly cash inputs show a six-figure amount and a whole focus ring at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/tools/business-calculators/cash/');
  const inputs = page.locator('.cash-scroll input[name^="receipts-"], .cash-scroll input[name^="payments-"]');
  await expect(inputs.first()).toBeEnabled();
  const overflow = await inputs.evaluateAll((all) => all.map((input) => {
    input.value = '123456.78';
    return input.scrollWidth - input.clientWidth;
  }));
  expect(Math.max(...overflow)).toBeLessThanOrEqual(0);
  await page.keyboard.press('Tab');
  for (const name of ['receipts-1', 'payments-1']) {
    const input = page.locator(`.cash-scroll input[name="${name}"]`);
    await input.focus();
    expect(await input.evaluate(focusRingCut), name).toBeLessThanOrEqual(0.5);
  }
});

test('Machine view draws its focus ring inside the window', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('duguid-view-mode', 'machine'));
  await page.goto('/about/');
  const view = page.locator('#machine-view');
  await expect(view).toBeVisible();
  for (let presses = 0; presses < 10 && !await view.evaluate((element) => element === document.activeElement); presses += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(view).toBeFocused();
  const ring = await view.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.outlineStyle === 'none' ? Infinity : parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
  });
  expect(ring).toBeLessThanOrEqual(0);
});

test('printed code wraps to the page and leaves out Copy', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });
  for (const route of ['/tools/refusals/', '/tools/ato-benchmarks/']) {
    await page.goto(route);
    const overflow = await page.locator('main pre').evaluateAll((blocks) => blocks
      .filter((block) => !block.closest('.about-portrait'))
      .map((block) => block.scrollWidth - block.clientWidth));
    expect(overflow.length, route).toBeGreaterThan(0);
    expect(Math.max(...overflow), route).toBeLessThanOrEqual(1);
    await expect(page.locator('.copy-button').first(), route).toBeHidden();
  }
});
