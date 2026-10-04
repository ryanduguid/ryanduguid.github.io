import { expect, test } from '@playwright/test';
import { projectKind } from './project-kind.mjs';

// Guards for the 5 October 2026 visual refinement pass: result rows that still
// read as the old sentence, the split calculator view, thicker link underlines,
// no synthesised bold, and the spacing, alignment and target fixes it made.
// The same day's review of the live result added the title underline, figure
// table and phone changelog checks.

const results = [
  ['gst', { amount: '1100', inclusive: true }, 1,
    'Inputs: amount $1,100.00, includes GST. Excluding GST: $1,000.00. GST: $100.00. Including GST: $1,100.00.'],
  ['gst', { amount: '250.5' }, 1,
    'Inputs: amount $250.50, excludes GST. Excluding GST: $250.50. GST: $25.05. Including GST: $275.55.'],
  ['business-use', { cost: '2000', percent: '35' }, 0,
    'Inputs: eligible cost $2,000.00, business use 35%. Business-use share: $700.00.'],
  ['margin', { sales: '15000', cost: '9000' }, null,
    'Inputs: sales $15,000.00, direct cost $9,000.00. Gross profit: $6,000.00. Margin: 40.00%. Markup: 66.67%.'],
  ['break-even', { fixed: '12000', price: '80', variable: '50' }, 1,
    'Inputs: fixed costs $12,000.00, selling price $80.00 per unit, variable cost $50.00 per unit. Contribution per unit: $30.00. Break-even: 400 whole units, or $32,000.00 in sales.'],
  ['hourly', { cost: '60000', profit: '30000', hours: '1200' }, 0,
    'Inputs: annual costs $60,000.00, target profit $30,000.00, 1,200 billable hours. Required hourly rate before GST: $75.00.'],
  ['variance', { actual: '10500', budget: '10000', kind: 'cost' }, 0,
    'Inputs: actual $10,500.00, budget $10,000.00, figure type cost. Actual minus budget: $500.00. Difference as a share of absolute budget: 5.00%. Unfavourable.'],
  ['variance', { actual: '10000', budget: '10000', kind: 'income' }, 0,
    'Inputs: actual $10,000.00, budget $10,000.00, figure type income. Actual minus budget: $0.00. Difference as a share of absolute budget: 0.00%. On budget.'],
  ['loan', { principal: '50000', rate: '7.5', months: '60' }, 0,
    'Inputs: principal $50,000.00, 7.5% annual nominal rate, 60 monthly payments. Monthly payment: $1,001.90. First payment interest: $312.50. First payment principal: $689.40. Estimated total interest: $10,113.85.'],
  ['staff', { wages: '80000', super: '9600', other: '2500' }, 0,
    'Inputs: wages $80,000.00, super $9,600.00, other costs $2,500.00. Annual staff cost: $92,100.00. Monthly average: $7,675.00.'],
];

test('calculator results show labelled rows and keep the exact sentence text', async ({ page }) => {
  for (const [name, fields, principal, sentence] of results) {
    await page.goto(`/tools/business-calculators/${name}/`);
    const form = page.locator(`#${name} form`);
    for (const [field, value] of Object.entries(fields)) {
      const control = form.locator(`[name="${field}"]`);
      if (value === true) await control.check();
      else if (await control.evaluate((element) => element.tagName === 'SELECT')) await control.selectOption(value);
      else await control.fill(value);
    }
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
    const output = form.locator('output');
    await expect(output).toHaveAttribute('aria-atomic', 'true');
    expect(await output.evaluate((element) => element.textContent), name).toBe(sentence);
    const rows = output.locator('.result-row');
    const labels = [...sentence.matchAll(/(?:^|\. )([^.:]+): /g)].map(([, label]) => label).slice(1);
    await expect(rows.locator('.result-label')).toHaveText(labels);
    await expect(output.locator('.result-row--principal')).toHaveCount(principal === null ? 0 : 1);
    if (principal !== null) await expect(rows.nth(principal)).toHaveClass(/result-row--principal/);
  }
});

test('the cash forecast result keeps its sentence and stays one column', async ({ page }) => {
  await page.goto('/tools/business-calculators/cash/');
  const data = { version: 1, currency: 'AUD', startDate: '2026-09-28', opening: '200.00', buffer: '100',
    week: '1', amount: '100', delay: '2', weeks: Array.from({ length: 13 }, () => ({ receipts: '1000', payments: '300' })) };
  await page.getByLabel('Load inputs (replaces the current forecast)').setInputFiles({
    name: 'inputs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
  const form = page.locator('#cash form');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: week 1 from 28 Sept 2026, opening cash $200.00, buffer $100.00, receipt of $100.00 in week 1 delayed 2 weeks. Closing cash: $9,300.00. Lowest opening or weekly closing balance: $200.00. Funding gap to the buffer: $0.00. Receipts deferred beyond week 13: $0.00.'
  );
  expect(await form.evaluate((element) => getComputedStyle(element).display)).not.toBe('grid');
});

test('the eight compact calculators put the result beside the inputs on wide screens only', async ({ page }, testInfo) => {
  const names = ['gst', 'business-use', 'margin', 'break-even', 'hourly', 'variance', 'loan', 'staff'];
  for (const name of names) {
    await page.goto(`/tools/business-calculators/${name}/`);
    const layout = await page.locator(`#${name} form`).evaluate((form) => {
      const fieldset = form.querySelector('fieldset').getBoundingClientRect();
      const output = form.querySelector('output').getBoundingClientRect();
      return { split: form.classList.contains('calculator-split'), beside: output.left > fieldset.right, above: output.top >= fieldset.bottom };
    });
    expect(layout.split, name).toBe(true);
    if (projectKind(testInfo) === 'desktop') expect(layout.beside, name).toBe(true);
    else expect(layout.above, name).toBe(true);
  }
});

test('ordinary links carry an accent underline at least 2px thick', async ({ page }) => {
  await page.goto('/');
  for (const selector of ['.case-preview figcaption a', '.home-tool-preview__entry > a']) {
    const underline = await page.locator(selector).first().evaluate((link) => {
      const style = getComputedStyle(link);
      return { colour: style.textDecorationColor, thickness: parseFloat(style.textDecorationThickness) };
    });
    expect(underline.colour, selector).toBe('rgb(153, 0, 36)');
    expect(underline.thickness, selector).toBeGreaterThanOrEqual(2);
  }
});

test('no text asks for a bold the shipped mono face does not have', async ({ page }) => {
  for (const path of ['/', '/about/', '/rates/super-guarantee/', '/tools/business-calculators/gst/', '/changelog/']) {
    await page.goto(path);
    const synthesised = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter((element) => [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim()))
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.fontFamily.startsWith('"Spline Sans Mono"') && Number(style.fontWeight) > 400;
      })
      .map((element) => `${element.tagName}: ${element.textContent.trim().slice(0, 30)}`));
    expect(synthesised, path).toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.body).fontSynthesisWeight), path).toBe('none');
  }
});

test('page edges and gaps that the visual evaluation found touching', async ({ page }, testInfo) => {
  await page.goto('/tools/accounting-questions/gst-bas/');
  const byline = await page.evaluate(() => ({
    rule: document.querySelector('.byline').getBoundingClientRect().left,
    content: document.querySelector('.accounting-content').getBoundingClientRect().left,
  }));
  expect(byline.rule).toBeGreaterThanOrEqual(byline.content - 0.5);

  await page.goto('/tools/');
  const routesGap = await page.evaluate(() => {
    const routes = document.querySelector('.task-routes').getBoundingClientRect();
    const note = document.querySelector('.task-routes + .site-shell p').getBoundingClientRect();
    return note.top - routes.bottom;
  });
  expect(routesGap).toBeGreaterThanOrEqual(16);

  await page.goto('/changelog/');
  if (projectKind(testInfo) === 'desktop') {
    // A row is as tall as its longest cell, so count the date's own text lines.
    const dateLines = await page.locator('.changelog-section tbody th').evaluateAll((cells) => cells.slice(0, 5).map((cell) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    }));
    expect(dateLines).toEqual([1, 1, 1, 1, 1]);
  } else {
    // On a phone a one-line date had squeezed the change into about 18
    // characters a line; the date wraps instead and the change keeps most of the row.
    const share = await page.locator('.changelog-section tbody tr').first().evaluate((row) => (
      row.querySelector('td').getBoundingClientRect().width / row.getBoundingClientRect().width));
    expect(share).toBeGreaterThanOrEqual(0.6);
  }

  // The address is in the first screen of an ordinary 1280 by 800 laptop.
  if (projectKind(testInfo) === 'desktop') {
    await page.goto('/contact/');
    const mail = await page.locator('main a[href^="mailto:"]').first().boundingBox();
    expect(mail.y + mail.height).toBeLessThanOrEqual(800);
  }
});

// Register titles are underlined at rest and wrap in narrow columns. At the
// 1.08 heading leading an 8px offset ran through the next line's letters, so
// the offset plus a 2px stroke must fit between this line's baseline and the
// next line's ascenders, about 0.8em below the next baseline in Besley.
test('register title underlines stay clear of the next line', async ({ page }) => {
  for (const path of ['/tools/', '/rates/', '/evaluate/']) {
    await page.goto(path);
    const crowded = await page.locator('.collection-entry__title').evaluateAll((titles) => titles.map((title) => {
      const style = getComputedStyle(title);
      const fontSize = parseFloat(style.fontSize);
      const room = parseFloat(style.lineHeight) - 0.8 * fontSize;
      return { text: title.textContent.trim(), clear: parseFloat(style.textUnderlineOffset) + 2 <= room };
    }).filter(({ clear }) => !clear).map(({ text }) => text));
    expect(crowded, path).toEqual([]);
  }
});

// Tables that compare figures right-align every value column so the cents and
// thousands line up; dates after an amount stay on one line.
test('figure comparison tables right-align their values', async ({ page }) => {
  for (const path of ['/examples/profit-vs-cash-flow/', '/evaluate/']) {
    await page.goto(path);
    const table = page.locator('table.facts--figures');
    await expect(table).toHaveCount(1);
    const misaligned = await table.evaluate((element) => [...element.querySelectorAll('th, td')]
      .filter((cell) => cell.cellIndex > 0 && getComputedStyle(cell).textAlign !== 'right')
      .map((cell) => cell.textContent.trim()));
    expect(misaligned, path).toEqual([]);
    await expect(table.locator('.nowrap', { hasText: '7 October' })).toHaveCount(1);
  }
});

test.describe('on a touch tablet', () => {
  test.use({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true });

  test('standalone links reach 44px and the homepage chart takes the full width', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const chart = await page.locator('.case-preview').evaluate((figure) => figure.getBoundingClientRect().width);
    const shell = await page.locator('.home-hero').evaluate((hero) => hero.getBoundingClientRect().width);
    expect(chart).toBeGreaterThan(shell * 0.8);
    for (const [path, selector] of [
      ['/', '.home-tool-preview__entry > a'],
      ['/', '.site-footer__nav a'],
      ['/tools/', '.collection-entry__links a'],
      ['/tools/ozzit/', '.article-actions > a:not(.button)'],
      ['/evidence/', '.credential-card__links a'],
      ['/404.html', '.page-404 .links a'],
    ]) {
      await page.goto(path);
      const height = await page.locator(selector).first().evaluate((link) => link.getBoundingClientRect().height);
      expect(height, `${path} ${selector}`).toBeGreaterThanOrEqual(44);
    }
  });
});

// A flex link with text and an element child becomes several flex items, and
// the spaces between them collapse ("Review amonth-endclose"). Links that the
// 44px rule makes flex keep their content in one item.
test('links set as flex targets keep their text in one item', async ({ page }) => {
  const paths = ['/', '/tools/', '/tools/company-tax-franking/', '/evidence/', '/about/', '/tools/ozzit/'];
  for (const path of paths) {
    await page.goto(path);
    const split = await page.evaluate(() => [...document.querySelectorAll('a')].filter((link) => {
      if (!getComputedStyle(link).display.includes('flex')) return false;
      return [...link.childNodes].filter((node) => (node.nodeType === 3 ? node.textContent.trim() !== ''
        : node.nodeType === 1 && !['none'].includes(getComputedStyle(node).display)
          && !['absolute', 'fixed'].includes(getComputedStyle(node).position))).length > 1;
    }).map((link) => link.textContent.trim().slice(0, 40)));
    expect(split, path).toEqual([]);
  }
});
