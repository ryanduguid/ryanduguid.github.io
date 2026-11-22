// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { waitForCalculator } from './calculator-ready.mjs';

// money and land-tax are business-calculators' helpers: a retry must fetch them afresh too.
for (const module of ['business-calculators', 'field-errors', 'money', 'land-tax']) {
  test(`calculator load failure explains recovery and retry loads the module (${module})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const moduleRoute = `**/assets/${module}.mjs*`;
    await page.route(moduleRoute, route => route.abort());
    await page.goto('/tools/business-calculators/gst/');
    await expect(page.locator('#gst output')).toContainText('Calculators could not load.');
    await expect(page.locator('form[data-calculator] fieldset:disabled')).toHaveCount(1);
    const retry = page.getByRole('button', { name: 'Retry loading calculators' });
    await retry.click();
    await expect(retry).toBeEnabled();
    await expect(retry).toBeFocused();
    await page.locator('#gst input[name=amount]').evaluate(input => {
      input.value = '100';
      input.form.elements.namedItem('inclusive').checked = false;
    });
    await page.unroute(moduleRoute);
    await retry.click();
    await expect(page.locator('#gst input[name=amount]')).toBeEnabled();
    await expect(page.locator('#gst input[name=amount]')).toBeFocused();
    await expect(page.locator('#gst input[name=amount]')).toHaveValue('100');
    await expect(page.locator('#gst output')).toHaveText('Enter the inputs and calculate.');
    await page.locator('#gst').getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(page.locator('#gst output')).toContainText('GST: $10.00');
    expect(errors).toEqual([]);
  });
}

test('a calculator page works without the question pages’ script', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const requested = [];
  page.on('request', request => requested.push(request.url()));
  await page.route('**/assets/accounting-questions.mjs*', route => route.abort());
  await page.goto('/tools/business-calculators/gst/');
  const form = page.locator('#gst form');
  await waitForCalculator(form);
  await form.locator('input[name=amount]').fill('110');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('#gst output')).toContainText('GST: $10.00');
  expect(requested.filter(url => url.includes('accounting-questions.mjs'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('an invalid business calculator field gets an inline instruction and focus', async ({ page }) => {
  await page.goto('/tools/business-calculators/gst/');
  const form = page.locator('#gst form');
  const amount = form.locator('input[name=amount]');
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  await form.getByLabel('Amount includes GST').uncheck();
  await amount.fill('');
  await calculate.click();
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await expect(amount).toBeFocused();
  await expect(form.locator('.field-error')).toHaveText('Enter an amount.');
  await expect(form.locator('output')).toHaveText('Enter the inputs and calculate.');
  await amount.fill('-1');
  await expect(form.locator('.field-error')).toHaveCount(0);
  await calculate.click();
  await expect(form.locator('.field-error')).toHaveText('Enter $0.00 or more.');
  await amount.fill('1.005');
  await calculate.click();
  await expect(form.locator('.field-error')).toHaveText('Use no more than two decimal places.');
  await amount.fill('1.01');
  await calculate.click();
  await expect(form.locator('.field-error')).toHaveCount(0);
  await expect(form.locator('output')).toContainText('GST: $0.10');
});

test('an inline error leaves the field beside it in place', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tools/business-calculators/gst/');
  const form = page.locator('#gst form');
  const amount = form.locator('label.field');
  const inclusive = form.locator('.check-field');
  await amount.locator('input').fill('');
  const field = await amount.boundingBox();
  const before = await inclusive.boundingBox();
  // At this width the checkbox shares the amount's row.
  expect(before.y).toBeLessThan(field.y + field.height);
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const error = form.locator('.field-error');
  await expect(error).toHaveText('Enter an amount.');
  expect(await inclusive.boundingBox()).toEqual(before);
  expect((await error.boundingBox()).y).toBeGreaterThanOrEqual(field.y + field.height);
});

test('question search finds abbreviations and words in the guidance', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/tools/accounting-questions/payroll-super/');
  await page.getByText('Search or build a checklist').click();
  for (const [term, id] of [['STP', 46], ['superannuation', 41]]) {
    await page.getByLabel('Search questions').fill(term);
    await expect(page.locator(`#q${id}`)).toBeVisible();
  }
  await page.getByLabel('Search questions').fill('STP');
  await expect(page.locator('details.question:visible')).toHaveCount(1);
  expect(requests.some(url => url.endsWith('/assets/business-calculators.mjs'))).toBe(false);
});

test('a cached older script still leaves Clear filters usable', async ({ page }) => {
  // Cloudflare can serve the previous module with new HTML; that module only
  // enabled the controls, so the markup must not disable the button itself.
  await page.route('**/assets/accounting-pages.mjs', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: "document.querySelector('.question-controls fieldset').disabled = false;",
  }));
  await page.goto('/tools/accounting-questions/gst-bas/');
  await page.getByText('Search or build a checklist').click();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeEnabled();
});

test('the questions hub links every question to its topic page', async ({ page }) => {
  await page.goto('/tools/accounting-questions/');
  await expect(page.locator('ol.question-index li')).toHaveCount(100);
  await expect(page.locator('#q100 a')).toHaveAttribute('href', '/tools/accounting-questions/investments-local/#q100');
  await page.locator('#q100 a').click();
  await expect(page).toHaveURL(/investments-local\/#q100$/);
  await expect(page.locator('#q100')).toHaveAttribute('open', '');
});

test('old hash links land on the page that now holds the content', async ({ page }) => {
  await page.goto('/tools/business-calculators/#cash');
  await expect(page).toHaveURL(/business-calculators\/cash\/$/);
  await expect(page.locator('#cash form')).toBeVisible();
  await page.goto('/tools/accounting-questions/#q100');
  await expect(page).toHaveURL(/investments-local\/#q100$/);
  await expect(page.locator('#q100')).toHaveAttribute('open', '');
});

test('saved hub searches retain their query and explain an unknown topic', async ({ page }) => {
  const term = '<GST> & BAS "cash"';
  const query = new URLSearchParams({ q: term, topic: 'retired-topic' });
  await page.goto(`/tools/accounting-questions/?${query}`);
  const notice = page.locator('#question-search-context');
  await expect(notice).toContainText(term);
  await expect(notice).toContainText('not recognised');
  await expect(notice.locator('*')).toHaveCount(0);
  const topics = page.locator('.question-group h2 a');
  await expect(topics).toHaveCount(10);
  for (const href of await topics.evaluateAll(links => links.map(link => link.href))) {
    expect(new URL(href).searchParams.get('q')).toBe(term);
  }
  await page.goto('/tools/accounting-questions/?q=GST');
  await expect(notice).toContainText('Saved search: GST.');
  await page.locator('#gst-bas h2 a').click();
  await expect(page.getByLabel('Search questions in GST and BAS')).toHaveValue('GST');
  await page.goto('/tools/accounting-questions/?topic=retired-topic');
  await expect(notice).toContainText('no longer available');
});

test('saved topic searches forward while direct question fragments still take priority', async ({ page }) => {
  await page.goto('/tools/accounting-questions/?topic=gst-bas&q=GST');
  await expect(page).toHaveURL(/accounting-questions\/gst-bas\/\?q=GST$/);
  await expect(page.getByLabel('Search questions')).toHaveValue('GST');
  await page.goto('/tools/accounting-questions/?topic=gst-bas');
  await expect(page).toHaveURL(/accounting-questions\/gst-bas\/$/);
  await page.goto('/tools/accounting-questions/?topic=gst-bas&q=GST#q100');
  await expect(page).toHaveURL(/investments-local\/#q100$/);
  await expect(page.locator('#q100')).toHaveAttribute('open', '');
});

test('every topic scopes search, clears it and accepts its old topic parameter', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tools/accounting-questions/');
  const links = await page.locator('.question-group h2 a').evaluateAll(nodes =>
    nodes.map(node => ({ href: node.href, topic: node.closest('section').id, label: node.textContent.trim() })));
  for (const { href, topic, label } of links) {
    await page.goto(`${href}?topic=${topic}&q=zznomatchingquestionzz`);
    const search = page.getByLabel(`Search questions in ${label}`, { exact: true });
    await expect(search).toHaveValue('zznomatchingquestionzz');
    await expect(page.locator('#question-topic')).toHaveCount(0);
    await expect(page.locator('#question-count')).toContainText('No questions match.');
    await expect(page).not.toHaveURL(/topic=/);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await expect(page.locator('details.question:visible')).toHaveCount(10);
    await expect(page).toHaveURL(href);
  }
  expect(errors).toEqual([]);
});

test('cash inputs survive a save and reload with dated results', async ({ page }) => {
  await page.goto('/tools/business-calculators/cash/');
  const form = page.locator('#cash form');
  const startDate = form.getByLabel('First day of week 1');
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  await startDate.fill('1899-12-31');
  await calculate.click();
  await expect(form.locator('.field-error')).toHaveText('Enter 1 January 1900 or later.');
  await expect(startDate).toBeFocused();
  await startDate.fill('9999-12-31');
  await calculate.click();
  await expect(form.locator('.field-error')).toHaveText('Enter 2 October 9999 or earlier.');
  await startDate.fill('2026-09-28');
  await form.getByLabel('Opening bank balance (AUD)').fill('200');
  await form.getByLabel('Week 1 receipts', { exact: true }).fill('1000');
  await form.getByLabel('Week 1 payments', { exact: true }).fill('300');
  await form.getByLabel('Receipt to delay (AUD)').fill('1000');
  await form.getByLabel('Delay in whole weeks').fill('2');
  await form.getByLabel('Original receipt week').fill('1');
  await form.getByLabel('Week 13 receipts', { exact: true }).fill('0');
  const download = page.waitForEvent('download');
  await form.getByRole('button', { name: 'Save inputs' }).click();
  const saved = await download;
  const path = await saved.path();
  const input = JSON.parse(await readFile(path, 'utf8'));
  expect(input.startDate).toBe('2026-09-28');
  expect(input.weeks[0]).toEqual({ receipts: '1000', payments: '300' });
  await page.reload();
  await waitForCalculator(form);
  await page.getByLabel('Load inputs (replaces the current forecast)').setInputFiles(path);
  await expect(form.getByLabel('First day of week 1')).toHaveValue('2026-09-28');
  await expect(form.getByLabel('Week 1 receipts', { exact: true })).toHaveValue('1000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('#cash-results tbody tr').first()).toContainText(/28 Sept? 2026/);
  await expect(page.locator('#cash-results tbody tr').nth(1)).toContainText('5 Oct 2026');
  await expect(page.locator('#cash-results tbody tr').first()).toContainText('−$100.00');
  const csvDownload = page.waitForEvent('download');
  await form.getByRole('button', { name: 'Download forecast CSV' }).click();
  const csv = await readFile(await (await csvDownload).path(), 'utf8');
  expect(csv).toContain('First day of week 1,2026-09-28');
  expect(csv).toContain('1,2026-09-28,2026-10-04,200.00,0.00,300.00,-100.00');
  await page.getByLabel('Load inputs (replaces the current forecast)').setInputFiles({
    name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...input, weeks: [] })),
  });
  await expect(page.locator('#cash-file-status')).toContainText('13 weeks');
  await expect(form.getByLabel('Week 1 receipts', { exact: true })).toHaveValue('1000');
  await expect(form.getByRole('button', { name: 'Download forecast CSV' })).toBeEnabled();
});

test('cash imports keep accepted amounts with surrounding whitespace', async ({ page }) => {
  await page.goto('/tools/business-calculators/cash/');
  const form = page.locator('#cash form');
  await waitForCalculator(form);
  const data = { version: 1, currency: 'AUD', startDate: '2026-09-28', opening: ' \t200.00\n\u00a0', buffer: ' 100 ',
    week: ' 1 ', amount: ' 100 ', delay: ' 2 ', weeks: Array.from({ length: 13 }, () => ({ receipts: ' 1000 ', payments: ' 300 ' })) };
  await page.getByLabel('Load inputs (replaces the current forecast)').setInputFiles({
    name: 'spaced-inputs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator('#cash-file-status')).toHaveText('Inputs loaded. Calculate to refresh the results.');
  for (const [name, value] of [['opening', '200.00'], ['buffer', '100'], ['week', '1'], ['amount', '100'], ['delay', '2']]) {
    await expect(form.locator(`[name="${name}"]`)).toHaveValue(value);
  }
  for (let week = 1; week <= 13; week++) {
    await expect(form.locator(`[name="receipts-${week}"]`)).toHaveValue('1000');
    await expect(form.locator(`[name="payments-${week}"]`)).toHaveValue('300');
  }
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('Closing cash: $9,300.00.');
  await expect(form.getByRole('button', { name: 'Download forecast CSV' })).toBeEnabled();
});

test('a cash file load locks saving and loading until the read finishes', async ({ page }) => {
  await page.goto('/tools/business-calculators/cash/');
  const locked = page.locator('#cash fieldset:disabled');
  await expect(locked).toHaveCount(0);
  // Slow the read so the in-flight state can be observed.
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = function slowText() {
      return new Promise(resolve => setTimeout(() => resolve(read.call(this)), 1000));
    };
  });
  await page.getByLabel('Load inputs (replaces the current forecast)').setInputFiles({
    name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from('{}'),
  });
  await expect(locked).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Save inputs' })).toBeDisabled();
  await expect(locked).toHaveCount(0);
  await expect(page.locator('#cash-file-status')).not.toHaveText('Loading saved inputs…');
});

test('all 100 questions remain readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/tools/accounting-questions/');
  await expect(page.locator('ol.question-index li')).toHaveCount(100);
  await page.goto('/tools/accounting-questions/investments-local/');
  await expect(page.locator('details.question')).toHaveCount(10);
  await page.getByText('Search or build a checklist').click();
  await expect(page.getByLabel('Search questions')).toBeVisible();
  await expect(page.getByLabel('Search questions')).toBeDisabled();
  await page.locator('#q100 summary').click();
  await expect(page.locator('#q100 .question-answer')).toBeVisible();
  await expect(page.locator('#q100 a').first()).toHaveAttribute('href', /tpb.gov.au/);
  await context.close();
});

test('search, topic selection and a direct link can reveal the last question', async ({ page }) => {
  await page.goto('/tools/accounting-questions/investments-local/');
  await expect(page.locator('#clear-filters')).toBeDisabled();
  await page.getByText('Search or build a checklist').click();
  await page.getByLabel('Search questions').fill('Newcastle');
  await expect(page.locator('#clear-filters')).toBeEnabled();
  await expect(page.locator('details.question:visible')).toHaveCount(2);
  await expect(page.locator('#q99')).toBeVisible();
  await page.getByLabel('Search questions').fill('payroll tax');
  await expect(page.locator('#question-count')).toContainText('0 questions');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('details.question:visible')).toHaveCount(10);
  await page.goto('/tools/accounting-questions/investments-local/#q100');
  await expect(page.locator('#q100')).toHaveAttribute('open', '');
  await page.getByLabel('Add to my checklist, question 100', { exact: true }).check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download selected checklist' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('accounting-checklist.md');
  const checklist = await readFile(await file.path(), 'utf8');
  expect(checklist).toContain('## 100. How do I choose a Newcastle accountant');
  expect(checklist).toContain('https://www.tpb.gov.au/public-register');
  expect(checklist).not.toContain('## 99.');
});

test('calculators show working, invalidate edited results and reject empty inputs', async ({ page }) => {
  await page.goto('/tools/business-calculators/gst/');
  const form = page.locator('#gst form');
  await form.getByLabel('Amount (AUD)').fill('110');
  await form.getByLabel('Amount includes GST').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('$10.00');
  await form.getByLabel('Amount (AUD)').fill('220');
  await expect(form.locator('output')).toContainText('Inputs changed');
  await form.getByLabel('Amount (AUD)').fill('');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.getByLabel('Amount (AUD)')).toBeFocused();
});

test('cash scenario exports delayed receipts and reports the funding gap offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/cash/');
  const form = page.locator('#cash form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('First day of week 1').fill('2026-09-28');
  await form.getByLabel('Opening bank balance (AUD)').fill('200');
  await form.getByLabel('Minimum cash buffer (AUD)').fill('100');
  await form.getByLabel('Original receipt week').fill('1');
  await form.getByLabel('Week 13 receipts', { exact: true }).fill('0');
  await form.getByLabel('Week 1 receipts', { exact: true }).fill('1000');
  await form.getByLabel('Week 1 payments', { exact: true }).fill('300');
  await form.getByLabel('Receipt to delay (AUD)').fill('1000');
  await form.getByLabel('Delay in whole weeks').fill('2');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('$200.00');
  await expect(page.locator('#cash-results tbody tr')).toHaveCount(13);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download forecast CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('cash-forecast.csv');
  const csv = await readFile(await file.path(), 'utf8');
  expect(csv).toContain('1,2026-09-28,2026-10-04,200.00,0.00,300.00,-100.00');
  expect(csv).toContain('3,2026-10-12,2026-10-18,-100.00,1000.00,0.00,900.00');
  expect(csv).toContain('Funding gap,200.00');
  await form.getByLabel('Week 1 payments', { exact: true }).fill('400');
  await expect(page.getByRole('button', { name: 'Download forecast CSV' })).toBeDisabled();
});

test('business calculators print only a current result', async ({ page }) => {
  await page.addInitScript(() => {
    window.__printCalls = 0;
    window.print = () => { window.__printCalls += 1; };
  });
  await page.goto('/tools/business-calculators/gst/');
  const form = page.locator('#gst form');
  const print = form.getByRole('button', { name: 'Print working', exact: true });
  await expect(print).toBeHidden();
  await form.getByLabel('Amount (AUD)').fill('110');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await print.click();
  expect(await page.evaluate(() => window.__printCalls)).toBe(1);
  await form.getByLabel('Amount (AUD)').fill('220');
  await expect(print).toBeHidden();
});

test('printed business calculator working keeps the boundary and a blank sign-off', async ({ page }) => {
  await page.goto('/tools/business-calculators/gst/');
  const form = page.locator('#gst form');
  await form.getByLabel('Amount (AUD)').fill('110');
  await form.getByLabel('Amount includes GST').uncheck();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(form.locator('output')).toContainText('GST: $11.00');
  const [boundary, abn] = [page.locator('.site-footer__legal'), page.locator('.site-footer__inner > p').last()];
  await expect(boundary).toBeVisible();
  await expect(boundary).toContainText('not a registered tax or BAS agent');
  await expect(abn).toHaveText('Ryan Duguid, ABN 59 834 031 764');
  for (const chrome of ['.site-footer__nav', '.site-footer__links', '.site-footer__motto']) {
    await expect(page.locator(chrome)).toBeHidden();
  }
  await expect(page.locator('button:visible')).toHaveCount(0);
  expect(await page.locator('.site-footer__inner').evaluate((element) =>
    getComputedStyle(element, '::after').content)).toContain('Reviewer:');
});

// The modules load after the page's load event; a slow load must still hold the wait below.
test('a calculator whose modules arrive late works offline once its form is ready', async ({ page, context }) => {
  await page.route('**/assets/business-calculators.mjs', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.goto('/tools/business-calculators/gst/');
  const form = page.locator('#gst form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Amount (AUD)').fill('110');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('GST: $10.00');
});

// The calculator pages invite readers to disconnect once the page has loaded,
// so every calculation here runs with the browser offline.
for (const [id, inputs, expected] of [
  ['gst', { amount: '220' }, 'GST: $20.00'],
  ['business-use', { cost: '2000', percent: '35' }, '$700.00'],
  ['margin', { sales: '150', cost: '100' }, 'Margin: 33.33%'],
  ['break-even', { fixed: '12000', price: '80', variable: '50' }, '400 whole units'],
  ['hourly', { cost: '80000', profit: '20000', hours: '1000' }, '$100.00'],
  ['fixed-fee', { hours: '12', rate: '180', margin: '0', instalments: '12' }, 'Fee including GST: $2,376.00'],
  ['variance', { actual: '120', budget: '100', kind: 'cost' }, 'Unfavourable'],
  ['loan', { amount: '1000', rate: '12', payments: '1', balloon: '0' }, '$1,010.00'],
  ['hire-purchase', { amount: '1000', rate: '12', payments: '3', balloon: '0', start: '2027-06-15' }, 'Last payment, 15 September 2027: $340.03.'],
  ['staff', { wages: '80000', super: '9600', other: '4000' }, '$93,600.00'],
]) {
  test(`${id} sends the entered values to its calculation offline`, async ({ page, context }) => {
    await page.goto(`/tools/business-calculators/${id}/`);
    const form = page.locator(`#${id} form`);
    await waitForCalculator(form);
    await context.setOffline(true);
    for (const [name, value] of Object.entries(inputs)) {
      const field = form.locator(`[name="${name}"]`);
      if (name === 'kind') await field.selectOption(value);
      else await field.fill(value);
    }
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(form.locator('output')).toContainText(expected);
  });
}

// Exact ties (the -1.005% markup and -0.205% variance) round half away from zero,
// and the page writes negatives with U+2212.
for (const [id, inputs, expected] of [
  ['margin', { sales: '197.99', cost: '200' }, ['Margin: −1.02%', 'Markup: −1.01%']],
  ['variance', { actual: '1995.90', budget: '2000', kind: 'cost' }, ['budget: −0.21%']],
]) {
  test(`${id} shows an exact negative tie rounded away from zero`, async ({ page }) => {
    await page.goto(`/tools/business-calculators/${id}/`);
    const form = page.locator(`#${id} form`);
    for (const [name, value] of Object.entries(inputs)) {
      const field = form.locator(`[name="${name}"]`);
      if (name === 'kind') await field.selectOption(value);
      else await field.fill(value);
    }
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
    for (const text of expected) await expect(form.locator('output')).toContainText(text);
  });
}

// At 100% a month's interest on $1,000,000,000.00 rounds to the whole payment, so the balance
// stays and the last payment repays it.
for (const [rate, months, expected] of [
  ['2.4789', '2', ['Monthly payment: $501,549,845.36.', 'Last payment, 1 September 2026: $501,549,845.37.']],
  ['100', '600', ['Monthly payment: $83,333,333.33.', 'Total interest: $49,999,999,998.00.']],
]) {
  test(`loan handles the maximum amount financed with ${rate}% over ${months} payments`, async ({ page }) => {
    await page.goto('/tools/business-calculators/loan/');
    const form = page.locator('#loan form');
    await form.locator('[name="amount"]').fill('1000000000');
    await form.locator('[name="rate"]').fill(rate);
    await form.locator('[name="payments"]').fill(months);
    await form.locator('[name="balloon"]').fill('0');
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
    for (const text of expected) await expect(form.locator('output')).toContainText(text);
  });
}

test('loan takes a balloon and payments in advance from the form and lists every payment', async ({ page }) => {
  await page.goto('/tools/business-calculators/loan/');
  const form = page.locator('#loan form');
  await form.getByLabel('Amount financed (AUD)').fill('60000');
  await form.getByLabel('Annual nominal interest rate (%)').fill('7.5');
  await form.getByLabel('Number of payments', { exact: true }).fill('60');
  await form.getByLabel('Balloon or residual due at the end of the term').fill('18000');
  await form.getByRole('radio', { name: 'At the start of its period (in advance)', exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: amount financed $60,000.00, 7.5% annual nominal rate, 60 monthly payments in advance, balloon $18,000.00, '
    + 'starting 1 July 2026; working out the payment. Monthly payment: $948.17. Last payment, 1 June 2031: $948.00. '
    + 'Number of payments: 60. Amount financed: $60,000.00. Annual nominal rate: 7.5%. Balloon, due 1 July 2031: $18,000.00. '
    + 'Total paid, with the balloon: $74,890.03. Total interest: $14,890.03. '
    + 'The last payment is $948.00, not $948.17: it is what the balance needs after each period’s interest is rounded to the cent.');
  const rows = form.locator('table[data-results="schedule"] tbody tr');
  await expect(rows).toHaveCount(61);
  await expect(rows.first()).toHaveText(['1', '1 July 2026', '$60,000.00', '$948.17', '$0.00', '$948.17', '$59,051.83'].join(''));
  await expect(rows.last()).toHaveText(['Balloon', '1 July 2031', '$17,888.20', '$18,000.00', '$111.80', '$17,888.20', '$0.00'].join(''));
  await expect(form.getByRole('button', { name: 'Download schedule CSV' })).toBeEnabled();
});

test('loan works out the rate and disables the field it works out', async ({ page }) => {
  await page.goto('/tools/business-calculators/loan/');
  const form = page.locator('#loan form');
  await form.getByRole('radio', { name: 'The interest rate', exact: true }).check();
  await expect(form.getByLabel('Annual nominal interest rate (%)')).toBeDisabled();
  await expect(form.getByLabel('Regular payment (AUD)')).toBeEnabled();
  await form.getByLabel('Amount financed (AUD)').fill('50000');
  await form.getByLabel('Regular payment (AUD)').fill('850');
  await form.getByLabel('Balloon or residual due at the end of the term').fill('10000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('Annual nominal rate: 6.9860%.');
  await expect(form.locator('output')).toContainText('Last payment, 1 July 2031: $849.95.');
});

test('hire purchase totals interest by income year and sets out the journal', async ({ page }) => {
  await page.goto('/tools/business-calculators/hire-purchase/');
  const form = page.locator('#hire-purchase form');
  await form.getByLabel('Amount financed (AUD)').fill('1000');
  await form.getByLabel('Annual nominal interest rate (%)').fill('12');
  await form.getByLabel('Number of payments', { exact: true }).fill('3');
  await form.getByLabel('Balloon or residual due at the end of the term').fill('0');
  await form.getByLabel('Start date, when the amount is advanced').fill('2027-06-15');
  await form.getByRole('radio', { name: 'Chattel mortgage', exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('Inputs: chattel mortgage, amount financed $1,000.00');
  await expect(form.locator('table[data-results="years"] tbody tr')).toHaveText(['2026-27$5.33', '2027-28$14.74']);
  await expect(form.locator('table[data-results="journal"] tbody tr').last()).toHaveText('Total$1,000.00$20.07$1,020.07');
});

test('the AASB 16 lease page works IFRS 16 Example 13 and hides the comparison once it is turned off', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/lease/');
  const form = page.locator('#lease form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('table[data-results="comparison"] tbody tr').last()).toHaveText('Tax value left at the end$0.00$8,882.68$8,882.68');
  await form.getByLabel('Regular lease payment, excluding GST you can claim (AUD)').fill('50000');
  await form.getByLabel('Number of payments in the lease term').fill('10');
  await form.getByRole('radio', { name: 'Yearly', exact: true }).check();
  await form.getByRole('radio', { name: 'At the start of its period (in advance)', exact: true }).check();
  await form.getByLabel('Discount rate: the rate implicit in the lease, or your incremental borrowing rate (% a year)').fill('5');
  await form.getByLabel('Lease incentives received (AUD)').fill('5000');
  await form.getByLabel('Initial direct costs (AUD)').fill('20000');
  await form.getByRole('group', { name: /^Compare with hire purchase/ }).getByRole('radio', { name: 'No', exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('Lease liability at commencement: $355,391.08.');
  await expect(form.locator('output')).toContainText('Right-of-use asset at commencement: $420,391.08.');
  await expect(form.locator('table[data-results="years"] tbody tr').first()).toHaveText('2026-27$17,769.55$0.00$373,160.63$42,039.11$378,351.97');
  await expect(form.locator('table[data-results="schedule"] tbody tr')).toHaveCount(9);
  await expect(form.locator('table[data-results="comparison"]')).toBeHidden();
});

test('CGT concessions give Janet’s 40% interest the 15-year exemption and refuse a share offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/cgt-concessions/');
  const form = page.locator('#cgt-concessions form');
  const output = form.locator('output');
  await waitForCalculator(form);
  await context.setOffline(true);
  // The ATO's 15-year exemption page: Janet sells land she bought on 1 December 2002 on her 60th birthday, and retires.
  const fields = { acquired: '2002-12-01', event: '2020-12-15', born: '1960-12-15', active: '6590', choice: '2021-05-01' };
  for (const [name, value] of Object.entries(fields)) await form.locator(`[name="${name}"]`).fill(value);
  await form.locator('[name="retiring"][value="yes"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output.locator('.result-row--principal strong')).toHaveText('15-year exemption (Division 152)');
  await expect(output).toContainText('Active for 6,590 of the 6,590 days from 1 December 2002 to 15 December 2020');
  await expect(output).toContainText('Not needed: the 15-year exemption disregards the whole gain (section 152-330)');
  await form.locator('[name="asset"][value="share"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('subsection 152-10(2)');
});

test('Division 7A takes the chosen year’s rate from the table and works the repayment offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/div7a/');
  const form = page.locator('#div7a form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Income year (benchmark rate)').selectOption('2023-24');
  await form.getByLabel('Loan not repaid at the end of the previous income year (AUD)').fill('250000');
  await form.getByLabel('Remaining term (whole years)').fill('7');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: 2023-24 income year at the 8.27% benchmark rate, $250,000.00 not repaid at 30 June 2023, 7 years remaining. '
    + 'Minimum yearly repayment: $48,462.41. Interest for the year, if repaid on 30 June: $20,675.00. Principal, if repaid on 30 June: $27,787.41.');
  await form.getByLabel('Remaining term (whole years)').fill('26');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('.field-error')).toHaveText('Enter 25 or less.');
});

test('Division 296 works both tiers and a death by 30 June 2027 offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/division-296/');
  const form = page.locator('#division-296 form');
  const output = form.locator('output');
  await waitForCalculator(form);
  await context.setOffline(true);
  // The Explanatory Memorandum's example 1.2: $12 million and $500,000 of earnings.
  await form.locator('[name="balance"]').fill('12000000');
  await form.locator('[name="earnings"]').fill('500000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('Very large superannuation balance earnings component: $83,350.00');
  await expect(output).toContainText('Division 296 tax: $64,585.00');
  await form.locator('[name="died"][value="yes"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('Division 296 tax: $0.00');
  await expect(output).toContainText('Not liable: died on or before 30 June 2027');
});

test('CGT works a rented home under section 118-192 and refuses a foreign resident offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/cgt/');
  const form = page.locator('#cgt form');
  const output = form.locator('output');
  await waitForCalculator(form);
  await context.setOffline(true);
  // The ATO's example 72: Roya rents out her apartment from 29 September 1997 and chooses to treat it as her main residence.
  const fields = { acquired: '1995-08-15', event: '2024-07-15', proceeds: '555000', price: '280000', buying: '0', 'buying-date': '',
    'improvement-1': '0', 'improvement-1-date': '', selling: '15000', works: '0', purchased: '1995-09-15', sold: '2024-09-29',
    'moved-in': '1995-09-15', 'away-1-from': '1997-09-29', 'away-1-to': '2024-09-29', market: '340000' };
  await form.locator('[name="kind"][value="home"]').check();
  for (const [name, value] of Object.entries(fields)) await form.locator(`[name="${name}"]`).fill(value);
  await form.locator('[name="away-1-rented"]').check();
  await form.locator('[name="away-1-choose"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('9,863 days, 7,671 not the main residence');
  await expect(output).toContainText('Applies: taken to be acquired on 29 September 1997 for $340,000.00');
  await expect(output).toContainText('Total current year capital gains (label H): $155,551.05');
  await expect(output.locator('.result-row--principal strong')).toHaveText('$77,775.53');
  await form.locator('[name="resident"][value="no"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('This page works out residents only');
});

test('Division 7A schedule lists each year, stops at a shortfall and refuses an interposed loan offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/div7a-schedule/');
  const form = page.locator('#div7a-schedule form');
  const output = form.locator('output');
  const rows = form.locator('#div7a-schedule-results tbody tr');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  // The minimum each year runs the 7 years, on the assumed rate after the ATO's last published year.
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(3).locator('td').first()).toHaveText('8.77%');
  await expect(rows.nth(4).locator('th, td').first()).toHaveText('2027-28');
  await expect(rows.nth(4).locator('td').first()).toHaveText('8.77% assumed');
  await form.locator('[name="repayments"]').fill('; 10000');
  await form.locator('[name="marginal-rate"]').fill('47');
  await form.getByLabel('Fully franked at 30%').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  // Worked by hand: 2023-24 holds 29 February, so 365 of 366 days on $100,000 and 1 day on $80,615.04.
  await expect(rows).toHaveCount(2);
  expect(await rows.nth(0).locator('th, td').allTextContents()).toEqual(['2023-24', '8.27%', '$100,000.00', '$19,384.96',
    '$19,384.96', '$8,265.62', '$11,119.34', '$88,880.66', '$0.00', '$25,602.78']);
  expect(await rows.nth(1).locator('th, td').allTextContents()).toEqual(['2024-25', '8.77%', '$88,880.66', '$19,677.59',
    '$10,000.00', '$7,792.43', '$2,207.57', '$86,673.09', '$9,677.59', '$13,207.55']);
  await expect(output).toContainText('Shortfall taken to be a dividend for 2024-25: $9,677.59');
  await form.locator('[name="interposed"][value="yes"]').check();
  await expect(form.locator('.table-scroll')).toBeHidden();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toHaveText('This page does not work a loan made through an interposed entity (Subdivision E of Division 7A).');
});

test('ETP withholding takes the date of birth and works both caps offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/termination-payment/');
  const form = page.locator('#termination-payment form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Genuine redundancy or early retirement scheme payment, before its tax-free part (AUD)').fill('0');
  await form.getByLabel('Completed years of service').fill('0');
  await form.locator('[name="non-excluded"]').fill('120000');
  await form.getByLabel('Other taxable payments you made to the employee in 2026-27, excluding the ETP (AUD)').fill('100000');
  await form.getByLabel('Employee’s date of birth').fill('1960-03-15');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: genuine redundancy or early retirement scheme payment $0.00 after 0 completed years of service, other code R taxable component $0.00, '
    + 'code O taxable component $120,000.00, other taxable payments in 2026-27 $100,000.00, born 15 Mar 1960. Tax-free limit: $13,598.00. '
    + 'Tax-free part of the redundancy payment: $0.00. Code R taxable component: $0.00. Withhold from the code R part: $0.00. '
    + 'Whole-of-income cap left: $80,000.00. Cap for the code O part: $80,000.00. Withhold from the code O part: $32,400.00. '
    + 'Total to withhold: $32,400.00. Preservation age or older on 30 June 2027: 17% within each cap and 47% above it.');
  await form.getByLabel('Completed years of service').fill('151');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('.field-error')).toHaveText('Enter 150 or less.');
});

test('FBT car works the operating cost method at the Type 2 gross-up offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/fbt-car/');
  const form = page.locator('#fbt-car form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Operating cost, elected, with log book records').check();
  await form.getByLabel('Cost price, including GST, dealer delivery and accessories fitted at purchase (AUD)').fill('50000');
  await form.getByLabel('Days used or available for private use').fill('365');
  await form.getByLabel('Operating costs for the year, operating cost method only (AUD)').fill('19580');
  await form.getByLabel('Business use percentage, operating cost method only').fill('75');
  await form.getByLabel('Employee contributions for the year (AUD)').fill('2000');
  await form.getByLabel('No: Type 2 gross-up, 1.8868').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: operating cost method, cost price $50,000.00, later non-business accessories $0.00, first held on or after 1 April 2022, '
    + '365 days of 365 available for private use, operating costs $19,580.00 at 75% business use, employee contributions $2,000.00, '
    + 'Type 2 gross-up 1.8868. Base value: $50,000.00. Statutory formula taxable value: $8,000.00. Operating cost taxable value: $2,895.00. '
    + 'Taxable value: $2,895.00. Grossed-up taxable value: $5,462.29. FBT at 47%: $2,567.28.');
  // A percentage limit reads as a figure, not as dollars.
  await form.getByLabel('Business use percentage, operating cost method only').fill('101');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('.field-error')).toHaveText('Enter 100 or less.');
});

test('FBT property values goods bought for the business and takes the in-house reduction offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/fbt-property/');
  const form = page.locator('#fbt-property form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('In-house goods you buy for the business').check();
  await form.getByLabel('Price rules only').fill('500');
  await form.getByLabel('Notional value: what the employee').fill('750');
  await form.getByLabel('Employee contribution paid for the property (AUD)').fill('400');
  await form.getByLabel('In-house rules other than salary packaging').fill('1000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: in-house bought for the business, the lesser of the arm’s length purchase price and the notional value, arm’s length '
    + 'purchase price $500.00, notional value $750.00, employee contribution $400.00, 0% income use, deduction for the contribution '
    + '$0.00, in-house reduction left $1,000.00. Value before the contribution: $500.00. Employee contribution applied: $400.00. '
    + 'Excess contribution: $0.00. Value after the contribution: $100.00. Gross deduction: $0.00. Deduction for the contribution '
    + 'applied: $0.00. Notional deduction: $0.00. Otherwise deductible reduction: $0.00. In-house reduction, section 62: $100.00. '
    + 'Taxable value: $0.00. The $1,000 in-house reduction in section 62 is for all of the employee’s in-house fringe benefits in '
    + 'the year together.');
  await form.getByLabel('Deduction the employee could claim for their contribution (AUD)').fill('400.01');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('The deduction for the employee’s contribution cannot be more than the contribution.');
});

test('FBT expense payment refuses the otherwise deductible rule in-house, then works the guide’s petroleum offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/fbt-expense-payment/');
  const form = page.locator('#fbt-expense-payment form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('In-house goods the seller bought for its business').check();
  await form.getByLabel('Employee’s expenditure before any reimbursement (AUD)').fill('1000');
  await form.getByLabel('Your payment or reimbursement of it (AUD)').fill('250');
  await form.getByLabel('In-house price rules only').fill('800');
  await form.getByLabel('In-house notional value').fill('1000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('This calculator does not apply the otherwise deductible rule to an in-house '
    + 'expense payment (subparagraph 24(1)(b)(i)): enter 0% income use and no deduction.');
  await form.getByLabel('External only: share of the expenditure').fill('0');
  await form.getByLabel('External only: employee’s deduction').fill('0');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: in-house bought for the business, the lesser of the arm’s length purchase price and the notional value, '
    + 'arm’s length purchase price $800.00, notional value $1,000.00, expenditure $1,000.00, '
    + 'paid or reimbursed $250.00, employee contribution $0.00, in-house reduction left $0.00. In-house value: $800.00. '
    + 'Recipient’s portion: $750.00. Recipient’s portion applied: $750.00. Excess portion: $0.00. Value after the portion: $50.00. '
    + 'In-house reduction, section 62: $0.00. Taxable value: $50.00. The $1,000 in-house reduction in section 62 is for all of the '
    + 'employee’s in-house fringe benefits in the year together.');
});

test('FBT car exempts an eligible electric car and keeps its value reportable offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/fbt-car/');
  const form = page.locator('#fbt-car form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Battery electric').check();
  await form.getByLabel('Electric cars only: first day held and used').fill('2026-07-01');
  await form.getByLabel('Electric cars only: first retail sale').fill('2026-07-01');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: statutory formula, cost price $60,000.00, later non-business accessories $0.00, first held on or after 1 April 2022, '
    + '182 days of 365 available for private use, employee contributions $1,000.00, Type 1 gross-up 2.0802, battery electric car for a '
    + 'current employee, first held and used 1 July 2026, first sold at retail 1 July 2026 at a luxury car tax value of $60,000.00 against '
    + 'the 2026-27 fuel-efficient threshold of $91,661.00, no luxury car tax on another sale or an import before the benefit. '
    + 'Provided to a current employee, s 8A(1)(a): met. A battery electric or hydrogen fuel cell electric car, s 8A(1)(b): met. '
    + 'First held and used on or after 1 July 2022, Schedule 1 item 7(2): met. '
    + 'No luxury car tax payable on the first retail sale before the benefit, s 8A(1)(c): met. '
    + 'No luxury car tax payable on another sale or an import before the benefit, s 8A(1)(c): met. Electric cars exemption, section 8A: applies. '
    + 'Base value: $60,000.00. Statutory formula taxable value: $4,983.56. Taxable value before the exemption, for reporting: $4,983.56. '
    + 'Taxable value: $0.00. Grossed-up taxable value: $0.00. FBT at 47%: $0.00. '
    + 'The taxable value before the exemption still counts in the employee’s reportable fringe benefits amount (subsection 135P(3)), '
    + 'reported when the employee’s total for the year is more than $2,000, unless the car is a pooled or shared car, whose benefit is '
    + 'excluded. The car’s registration, insurance, repairs, maintenance and fuel, electricity included, are exempt too (subsection 53(1)) '
    + 'and not reported; a home charging station is not a car expense under that exemption.');
  // A plug-in hybrid with no commitment from before 1 April 2025 is not exempt, so FBT is due.
  await form.getByLabel('Plug-in hybrid electric').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('Electric cars exemption, section 8A: does not apply.');
  await expect(form.locator('output')).toContainText('FBT at 47%: $4,872.40.');
  // A first retail sale after the FBT year comes after every benefit in it, whatever its luxury car tax value (s 8A(1)(c)).
  await form.getByLabel('Battery electric').check();
  await form.getByLabel('Electric cars only: first retail sale').fill('2027-04-01');
  await form.getByLabel('Electric cars only: luxury car tax value').fill('150000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('first sold at retail 1 April 2027 after the FBT year, so after every benefit in it, ');
  await expect(form.locator('output')).toContainText('Electric cars exemption, section 8A: applies.');
  await expect(form.locator('output')).toContainText('FBT at 47%: $0.00.');
});

test('fixed fee takes its rounding step from a radio and shows one payment for one instalment', async ({ page }) => {
  await page.goto('/tools/business-calculators/fixed-fee/');
  const form = page.locator('#fixed-fee form');
  await form.getByLabel('Estimated hours for the work').fill('1');
  await form.getByLabel('Hourly rate or cost per hour, before GST (AUD)').fill('120');
  await form.getByLabel('Target margin on the fee (%)').fill('45');
  await form.getByLabel('Monthly instalments').fill('1');
  await form.getByRole('radio', { name: 'The cent', exact: true }).check();
  await form.getByLabel('Add GST at 10%').uncheck();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: 1 hour at $120.00 an hour, 45% margin, fee rounded up to the cent, no GST, 1 monthly instalment. '
    + 'Fee before GST: $218.19. GST: $0.00. Fee including GST: $218.19. Paid at once: $218.19. Effective hourly rate before GST: $218.19.');
});

test('PCG 2021/4 refuses a failed gateway and scores case study 7 on all 3 factors offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/pcg-2021-4/');
  const form = page.locator('#pcg-2021-4 form');
  await waitForCalculator(form);
  await context.setOffline(true);
  const gateway2 = form.getByRole('group', { name: 'Gateway 2: is the arrangement free of high-risk features, as paragraphs 47 to 63 describe?' });
  await gateway2.getByLabel('No').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText('The arrangement fails Gateway 2, so PCG 2021/4 gives it no risk score.');
  await gateway2.getByLabel('Yes').check();
  await form.getByLabel('Amount the IPP returns in their own tax return (AUD)').fill('360000');
  await form.getByLabel('Tax paid by the IPP and associated entities on that firm income (AUD)').fill('199934');
  await form.getByLabel('All 3 factors', { exact: true }).check();
  await form.getByLabel('Remuneration the IPP returns, all 3 factors only (AUD)').fill('360000');
  await form.getByLabel('Commercial benchmark for the IPP’s services, all 3 factors only (AUD)').fill('350000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: gateways 1 and 2 passed, profit entitlement $600,000.00, returned by the IPP $360,000.00, tax on that firm income $199,934.00, '
    + 'remuneration $360,000.00 against a commercial benchmark of $350,000.00, all 3 factors. '
    + 'Factor 1: profit entitlement returned by the IPP: 60.00%, score 4. Factor 2: total effective tax rate: 33.32%, score 3. '
    + 'Factor 3: remuneration as a share of the benchmark: 102.86%, score 3. Aggregate score: 10. Risk zone: Green: low risk.');
});

// PCG 2021/4 case study 2: Donald returns $480,000, a company $320,000 and an adult beneficiary $80,000 of the
// service trust's income; the guideline's tax is $186,667, $83,200 and $16,467, 32.54% in all.
test('PCG 2021/4 allocation works case study 2 and refuses a recipient it cannot tax offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/pcg-2021-4-allocation/');
  const form = page.locator('#pcg-2021-4-allocation form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('IPP firm income', { exact: true }).fill('480000');
  await form.getByLabel('Associate 1 firm income', { exact: true }).fill('320000');
  await form.getByRole('group', { name: 'Who associate 2 is' }).getByLabel('Individual').check();
  await form.getByLabel('Associate 2 firm income', { exact: true }).fill('80000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: 2020-21 rates, gateways 1 and 2 passed, IPP: firm income $480,000.00; associate 1, company (base rate entity): '
    + 'firm income $320,000.00; associate 2, individual: firm income $80,000.00; factors 1 and 2. '
    + 'IPP: tax counted, paragraph 85(a): $186,667.00. Associate 1: tax counted, paragraph 85(a): $83,200.00. '
    + 'Associate 2: tax counted, paragraph 85(a): $16,467.00. Firm income of the IPP and associates: $880,000.00. '
    + 'Tax counted on that firm income: $286,334.00. Factor 1: profit entitlement returned by the IPP: 54.55%, score 4. '
    + 'Factor 2: total effective tax rate: 32.54%, score 3. Aggregate score: 7. Risk zone: Green: low risk.');
  await form.getByRole('group', { name: 'Who associate 3 is' }).getByLabel('Another kind').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText('Associate 3 is a recipient this calculator cannot tax; '
    + 'work out its tax yourself and enter the total in the PCG 2021/4 risk scorer.');
});

test('GIC payment plan works a weekly plan and one past the published rates offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/gic-payment-plan/');
  const form = page.locator('#gic-payment-plan form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Tax debt on the plan’s first day (AUD)').fill('1000000');
  await form.getByLabel('Date of the first instalment').fill('2026-09-30');
  await form.getByLabel('Number of equal instalments').fill('2');
  await form.getByLabel('Weekly').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: debt $1,000,000.00, first instalment 30 Sept 2026, 2 weekly instalments, 11.51% a year assumed after December 2026. '
    + 'Paid in full now: $1,000,000.00. Each instalment but the last: $500,551.21. Final instalment, 7 Oct 2026: $500,551.22. '
    + 'Total paid on the plan: $1,001,102.43. GIC on the plan, over paying now: $1,102.43.');
  await form.getByLabel('Tax debt on the plan’s first day (AUD)').fill('20000');
  await form.getByLabel('Date of the first instalment').fill('2026-11-15');
  await form.getByLabel('Number of equal instalments').fill('12');
  await form.getByLabel('Monthly, on the same day of the month').check();
  await form.getByLabel('Annual GIC rate to assume after December 2026 (%)').fill('9');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText('GIC on the plan, over paying now: $891.43.');
  await expect(form.locator('output .result-note')).toHaveText('287 days after December 2026 use the assumed rate.');
  await form.getByLabel('Number of equal instalments').fill('121');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('.field-error')).toHaveText('Enter 120 or less.');
});

test('SGC page works a Payday Super charge, an old-law quarter and a refusal offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/sgc-payday/');
  const form = page.locator('#sgc-payday form');
  await waitForCalculator(form);
  await context.setOffline(true);
  // Part paid late after an ATO-initiated assessment, disclosed on day 29: 60% less 40 points.
  await form.getByLabel('Payday', { exact: true }).fill('2026-08-06');
  await form.getByLabel('Qualifying earnings (AUD)').fill('6500');
  await form.getByLabel('Received late (AUD)').fill('540');
  await form.getByLabel('Late receipt date').fill('2026-09-02');
  await form.getByLabel('Assessment date').fill('2026-12-10');
  await form.getByLabel('Yes', { exact: true }).check();
  await form.getByLabel('Lodged in the approved form', { exact: true }).check();
  await form.getByLabel('Disclosure date').fill('2026-09-04');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText('SG charge for the payday, before any choice loading: $322.16.');
  await expect(form.locator('output')).toContainText('Administrative uplift, 20%: $53.69.');
  // A contribution received on the due date is refused, not counted as late.
  await form.getByLabel('Late receipt date').fill('2026-08-17');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText('A contribution the fund received by the due date is on time: add it to the on-time amount.');
  // The old law: one of Imogen's 30 employees in quarter 1 of 2025-26.
  await form.getByLabel('Quarterly, 2022-23 to 2025-26').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText('SG charge for the quarter: $1,519.18.');
  // Norfolk Island's lower transitional rate is refused, not replaced by the general rate.
  await form.locator('[name="norfolk-island"][value="yes"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText('Norfolk Island salary or wages have a lower transitional super guarantee rate '
    + '(7% to 10% for 2022-23 to 2025-26, 11% for 2026-27), which this calculator does not apply.');
});

test('franking account page works EKW Ltd’s example, shows the ledger and refuses a private company without its income tax offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/franking-account/');
  const form = page.locator('#franking-account form');
  await waitForCalculator(form);
  await context.setOffline(true);
  // EKW Ltd, the ATO's example 4, is the form's default.
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText('Franking tax payable (label E), due 31 July 2026: $80,000.00.');
  await expect(form.locator('output')).toContainText('Franking deficit tax offset (label C): $62,000.00.');
  const ledger = form.locator('table[data-results="ledger"]');
  await expect(ledger).toBeVisible();
  await expect(ledger.locator('tbody tr')).toHaveCount(6);
  await expect(ledger.locator('tbody tr').last().locator('td').last()).toHaveText('−$80,000.00');
  // A private company whose offset would be reduced needs its income tax for s 205-70(5).
  await form.getByLabel('A private company', { exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText(/^The offset reduction applies unless section 205-70\(5\) does/);
});

test('franking account page rolls a late refund and its additional deficit tax into the next year offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/franking-account/');
  const form = page.locator('#franking-account form');
  await waitForCalculator(form);
  await context.setOffline(true);
  const field = (name) => form.locator(`[name="${name}"]`);
  const calc = form.getByRole('button', { name: 'Calculate', exact: true });
  const output = form.locator('output');
  for (const name of ['event-1-date', 'event-1-amount', 'event-3-date', 'event-3-amount',
    'event-4-date', 'event-4-amount', 'event-5-date', 'event-5-amount',
    'distribution-1-date', 'distribution-1-amount', 'distribution-1-credit']) {
    await field(name).fill('');
  }
  await field('opening').fill('100');
  await field('event-2-date').fill('2026-07-18');
  await field('event-2-amount').fill('200');
  await field('event-2-rd').fill('40');
  await calc.click();
  await expect(output).toContainText('Actual 30 June balance for next year’s opening: $100.00.');
  await expect(output).toContainText('Actual 30 June R&D deferral for next year (s 205-15(4)): $0.00.');
  await expect(output).toContainText('due 1 August 2026 if no return is outstanding (s 214-150(4)): $60.00.');

  await form.locator('[name="year"][value="2026-27"]').check();
  await field('event-3-type').selectOption('prior_year_refund_fdt');
  await field('event-3-date').fill('2026-07-18');
  await field('event-3-amount').fill('60');
  await calc.click();
  const ledger = form.locator('table[data-results="ledger"] tbody tr');
  await expect(ledger).toHaveCount(2);
  await expect(ledger.last()).toContainText('Additional franking deficit tax from a prior-year refund');
  await expect(ledger.last().locator('td').last()).toHaveText('$0.00');
  await expect(output).toContainText('Actual 30 June R&D deferral for next year (s 205-15(4)): $40.00.');
});

test('unused leave page works Schedule 7’s example, a no-TFN payment and a refusal offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/unused-leave/');
  const form = page.locator('#unused-leave form');
  await waitForCalculator(form);
  await context.setOffline(true);
  // Norman, Schedule 7's example, is the form's default.
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText('Total to withhold from the leave: $6,786.00.');
  // Without a TFN, 47% of the whole $22,020, cents ignored.
  await form.getByLabel('No TFN given', { exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText('To withhold: 47% of the payment, cents ignored: $10,349.00.');
  // Leave that began to accrue after 16 August 1978 has no part before it.
  await form.getByLabel('Leave began to accrue').fill('1980-01-01');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText('The leave accrued from 1 January 1980, so none of it is long service leave for the period before 16 August 1978: enter 0 or leave it blank.');
});

// The ATO's Peter and Fiona and Max in 2024-25, the accounting column beside them, and a loan first drawn after the year.
test('borrowing expenses page works its example, the accounting column and a refusal offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/borrowing-expenses/');
  const form = page.locator('#borrowing-expenses form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText('Section 25-25 amount for 2024-25: $591.36.');
  await expect(form.locator('table[data-results="loans"] tbody tr')).toHaveCount(12);
  await expect(form.locator('table[data-results="accounting"]')).toBeHidden();
  await form.locator('input[name="accounting"][value="yes"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('Loan 1: effective interest rate (AASB 9): 6.2274% a year.');
  await expect(form.locator('table[data-results="accounting"]')).toBeVisible();
  await form.locator('[name="start-1"]').fill('2025-08-01');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText(/loan 1: loan_start must not be after the 2024-25 income year ended/i);
});

test('borrowing expenses page nets same-lender fees paid and received offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/borrowing-expenses/');
  const form = page.locator('#borrowing-expenses form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.locator('[name="repaid-1"]').fill('2023-03-15');
  await form.locator('[name="expenses-2"]').fill('900');
  await form.locator('[name="start-2"]').fill('2023-03-15');
  await form.locator('[name="term-end-2"]').fill('2048-03-14');
  await form.locator('[name="refinances-2"]').selectOption('1');
  await form.locator('[name="amount-2"]').fill('290000');
  await form.locator('[name="rate-2"]').fill('4.75');
  await form.locator('[name="payments-2"]').fill('300');
  await form.locator('[name="lender-2"]').selectOption('same');
  const paid = form.locator('[name="lender-fees-2"]');
  const received = form.locator('[name="lender-fees-received-2"]');
  await expect(paid).toHaveAccessibleName(/paid to the same lender or on its behalf/);
  await expect(received).toHaveAccessibleName(/paid by it on your behalf/);
  await paid.fill('900');
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const deduction = form.locator('output .result-row--principal');
  await calculate.click();
  await expect(deduction).toHaveText('Section 25-25 amount for 2024-25: $146.25.');
  await form.locator('input[name="accounting"][value="yes"]').check();
  await calculate.click();
  await expect(form.locator('output')).toContainText('differ by 9.86%, under 10%');
  await received.fill('500');
  await calculate.click();
  await expect(form.locator('output')).toContainText('including net lender fees, differ by 10.04%');
  await expect(deduction).toHaveText('Section 25-25 amount for 2024-25: $146.25.');
  const accounting = form.locator('table[data-results="accounting"]');
  const refinanceYear = accounting.getByRole('row').filter({ has: page.getByText('2022-23', { exact: true }) });
  // $1,452.90 for the original loan plus $400 at refinancing, with zero unamortised.
  await expect(refinanceYear.locator('th, td')).toHaveText([
    '2022-23', '$1,005.37', '$1,852.90', '−$847.53', '$846.80', '$0.00', '$289,086.73',
  ]);
});

// The fuel tax credit page's example, its second line by the cost and average price (PCG 2016/2 Method 1), and fuel
// acquired after the last rate the page holds.
test('fuel tax credit page works its example, a line from its cost and a refusal offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/fuel-tax-credits/');
  const form = page.locator('#fuel-tax-credits form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText('Label 7D on the BAS, in whole dollars: $3,204.00.');
  await form.locator('[name="quantity-2"]').fill('');
  await form.locator('[name="cost-2"]').fill('2459');
  await form.locator('[name="price-2"]').fill('245.9');
  await form.locator('input[name="small-claimant"][value="yes"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('Line 2: 1,000.0000 litres worked out from the cost (PCG 2016/2 Method 1), other business use, at 53.7 cents a litre from 3 August 2026: $537.00.');
  await expect(form.locator('output .result-row--principal')).toHaveText('Label 7D on the BAS, in whole dollars: $2,667.00.');
  await form.locator('[name="acquired-1"]').fill('2027-02-01');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('Line 1: no published rate is held for fuel acquired after 31 January 2027');
});

// Western Australia's Anastasia (serious misconduct after 12 years and 1 month: the 8 2/3 weeks accrued), the same
// service still employed, and the Northern Territory death under 10 years the page refuses.
test('long service leave page works a Western Australian example, the leave still to come and a refusal offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/long-service-leave/');
  const form = page.locator('#long-service-leave form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Western Australia', { exact: true }).check();
  await form.getByLabel('First day of service').fill('2014-01-01');
  await form.getByLabel('Last day of employment, or the day to work it out at').fill('2026-01-31');
  await form.getByLabel('Dismissal for serious misconduct').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText('Payment at $1,500.00 a week: $13,000.00.');
  await expect(form.locator('output')).toContainText('Leave already accrued only, after dismissal for serious misconduct, subsection 8(2): 8.6667 weeks.');
  await form.getByLabel('Continues: leave the employee can take now').check();
  await form.getByLabel('Days that do not count as service').fill('31');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-note')).toHaveText(
    '15 years of service completes on 31 January 2029, when the leave to take becomes 13.0000 weeks, if no more days are excluded.');
  await form.getByLabel('Northern Territory', { exact: true }).check();
  await form.getByLabel('Days that do not count as service').fill('0');
  await form.getByLabel('Last day of employment, or the day to work it out at').fill('2022-12-31');
  await form.getByLabel('Ends on the last day').check();
  await form.getByLabel('Death of the employee').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText(
    'Under 10 years, the NT Act pays on death what the employee would have been paid for leaving that day for a reason in subsection 10(2) (subsection 10(3)): choose that reason instead.');
});

// ReturnToWorkSA's example 1 ($450,000 at 2%: a $9,000 base premium less the 5% discount), then a Queensland
// policy renewed from before 1 July 2026, whose rate only WorkCover Queensland sets, refused.
test('workers compensation page works a South Australian example and refuses a renewed Queensland policy offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/workers-compensation/');
  const form = page.locator('#workers-compensation form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('South Australia', { exact: true }).check();
  await form.getByLabel('Estimated wages for the policy period').fill('450000');
  await form.getByLabel('Industry or premium rate from your insurer').fill('2');
  await form.getByLabel('Actual wages for the policy period').fill('');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText('Premium payable on the estimated wages: $9,405.00.');
  await expect(form.locator('output')).toContainText('Less discount at 5% for a base premium in its band: $450.00.');
  await form.getByLabel('Queensland', { exact: true }).check();
  await form.getByLabel('Before 1 July 2026, renewed for 2026-27').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText(
    'A policy that commenced before 1 July 2026 has a premium rate from WorkCover Queensland’s simplified or experience-based model and an adjustment for 2025-26 (Notice (No. 1) of 2026, parts 5 and 6): use the premium notice.');
});

// TR 2022/3 example 22 (paragraphs 210 to 214): Kevin's brother's company is an associate, and Pebbles and
// GemCo found him through his website; equal thirds are this test's figures. Then an agent paid 75% commission,
// whom section 87-40 may cover, is refused.
test('PSI rules checker works TR 2022/3 example 22 and refuses an agent it cannot assess offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/psi-determination/');
  const form = page.locator('#psi-determination form');
  await waitForCalculator(form);
  await context.setOffline(true);
  for (const [payer, amount] of [[1, '30000'], [2, '30000'], [3, '30000']]) {
    await form.getByLabel(`PSI from payer ${payer} (AUD)`, { exact: true }).fill(amount);
  }
  // The page opens on example 20, with payer 1 paid for a result; Kevin's payers are not.
  for (const condition of ['pays for a result', 'needs them to supply the plant, equipment or tools',
    'leaves them liable for the cost of defects']) {
    await form.getByLabel(`Payer 1 ${condition}`).uncheck();
  }
  await form.getByLabel('Payer 1 is an associate of the individual or entity').check();
  for (const payer of [2, 3]) {
    await form.getByLabel(`Payer ${payer} engaged them as a direct result of an offer to the public`).check();
  }
  await form.getByLabel('Market value of principal work by others engaged, in the year (AUD)').fill('0');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: Received by the individual as a contractor, mainly a reward for personal efforts or skills, no PSB '
    + 'determination; payer 1 $30,000.00, ticked: an associate; payer 2 $30,000.00, ticked: won by a public offer; '
    + 'payer 3 $30,000.00, ticked: won by a public offer; principal work by others $0.00, no apprentice; business '
    + 'premises conditions: none; not an agent. Outcome: Section 87-20: a personal services business, so Divisions 85 '
    + 'and 86 do not apply. Subsection 84-5(1): income mainly a reward for the individual’s personal efforts or '
    + 'skills: Yes, as you answered. Paragraph 87-15(1)(a): a personal services business determination in force: No, '
    + 'as you answered. Subsection 87-18(1): PSI paid for a result, with the tools supplied and liability for '
    + 'defects: 0.00%, under 75%: not met. Subsection 87-15(3): largest share of the PSI from one payer and its '
    + 'associates: 33.33%, under 80%. Section 87-20: unrelated payers that engaged the individual or entity as a '
    + 'direct result of offers to the public: 2, at least 2: met. Section 87-25: principal work by others engaged, by '
    + 'market value, or an apprentice: 0.00%, under 20%, no apprentice for half the year: not met. Section 87-30: '
    + 'business premises meeting all 4 conditions at all times in the year: No: not met. The PSI is still reported in '
    + 'the tax return, and Part IVA can still apply to splitting it (TR 2022/3 paragraphs 25 and 160).');
  await form.getByRole('group', { name: 'Paid as an agent by a principal for services to its customers (section 87-40)?' })
    .getByLabel('Yes').check();
  await form.getByLabel('Agent: the principal’s payments in the year (AUD)').fill('100000');
  await form.getByLabel('Agent: commission or performance fees in them (AUD)').fill('75000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText('At least 75% of the principal’s payments are commission or performance fees, '
    + 'so section 87-40 may treat the principal’s customers as the sources of the PSI; this page does not apply section 87-40.');
});

// Subsection 87-15(3) counts one payer's rows together, and subsection 85-35(2) covers a religious
// practitioner's payment, as the psi-test command of ryanduguid/australian-accounting does.
test('PSI rules checker counts one payer’s 2 rows as one source and cites subsection 85-35(2)', async ({ page }) => {
  await page.goto('/tools/business-calculators/psi-determination/');
  const form = page.locator('#psi-determination form');
  await waitForCalculator(form);
  await form.getByLabel('PSI from payer 1 (AUD)', { exact: true }).fill('74');
  await form.getByLabel('PSI from payer 2 (AUD)', { exact: true }).fill('26');
  await form.getByLabel('Payer 2 is the same payer as').selectOption('1');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const output = form.locator('output');
  await expect(output).toContainText('payer 1 $74.00, ticked: paid for a result, tools supplied, liable for defects; '
    + 'payer 2 $26.00, same payer as payer 1, ticked: none;');
  await expect(output).toContainText('Outcome: Subsection 87-15(3): not a personal services business unless a '
    + 'determination is in force, so Division 85 applies.');
  await expect(output).toContainText('Subsection 87-18(1): PSI paid for a result, with the tools supplied and liability '
    + 'for defects: 74.00%, under 75%: not met. Subsection 87-15(3): largest share of the PSI from one payer and its '
    + 'associates: 100.00%, 80% or more.');
  await form.getByLabel('The individual, as a religious practitioner paid for that vocation').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('Outcome: Subsection 85-35(2): a payment to a religious practitioner, so the PSI '
    + 'rules do not apply. Subsection 84-5(1)');
});

test('transfer duty notes NSW premium duty from the first dollar over $3,870,000 only', async ({ page }) => {
  await page.goto('/tools/business-calculators/transfer-duty/');
  const form = page.locator('#transfer-duty form');
  await waitForCalculator(form);
  const duty = async (value) => {
    await form.getByLabel('Dutiable value (whole dollars)').fill(value);
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
    return form.locator('output');
  };
  let output = await duty('3870000');
  await expect(output.locator('.result-row strong').first()).toHaveText('$194,137.00');
  await expect(output.locator('.result-note')).toHaveCount(0);
  output = await duty('3870001');
  await expect(output.locator('.result-row strong').first()).toHaveText('$194,144.00');
  await expect(output.locator('.result-note')).toHaveText(
    'Premium duty applies to residential land only; other land continues at $5.50 for every $100 over $1,290,000.');
  await form.getByLabel('Victoria').check();
  output = await duty('4000000');
  await expect(output.locator('.result-note')).toHaveCount(0);
});

test('vehicle classifier works LCTD 2023/1’s dual cab and the 2025-26 car limit offline, and refuses what it cannot weigh', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/vehicle-class/');
  const form = page.locator('#vehicle-class form');
  // A row by its whole label, so a label's words inside another row's answer do not match.
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  const calculate = () => form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await waitForCalculator(form);
  await context.setOffline(true);
  // LCTD 2023/1 example 5: 5 seats and a 960 kg load, 340 kg against 480 kg.
  await form.getByLabel('Dual or extra cab ute').check();
  await form.getByLabel('Basic kerb weight (kg), 0 if unknown').fill('2040');
  await form.getByLabel('Price including GST, before luxury car tax (AUD)').fill('85000');
  await calculate();
  await expect(row('Designed principally to carry passengers')).toHaveText('No: 5 seats × 68 kg = 340 kg, not more than the 620 kg left (MT 2024)');
  await expect(row('Car limit, section 40-230'))
    .toHaveText('Not decided here: MT 2024’s dual cab test is for FBT, and no ATO ruling applies it to the car limit');
  await expect(row('GST credit, section 69-10 of the GST Act')).toHaveText('Not decided here: above the car limit it turns on whether the vehicle '
    + 'is a commercial vehicle not designed principally to carry passengers (LCT Act paragraph 25-1(2)(c)), which the ATO’s compliance approach does not decide');
  await expect(row(/^Luxury car tax at the /)).toHaveText('Treated as a commercial vehicle: the seats at 68 kg are less than half the 960 kg load at supply, '
    + 'so the ATO will not review it (LCTD 2023/1 paragraphs 55 and 56)');
  await expect(row('FBT on an employee’s private use')).toHaveText('Exempt under paragraph 8(2)(a)(ii), if private use was as limited as you state');
  await expect(form.locator('output .result-note')).toHaveText(
    'LCTD 2023/1’s simplified method assumes the ute is a goods vehicle under the Australian Design Rules (paragraph 57).');
  // LCTD 2023/1 paragraph 56: 280 kg of accessories fitted at supply leave 680 kg, exactly twice the seats.
  const accessories = form.getByLabel('Accessories at supply, not in kerb weight (kg), 0 if none');
  await accessories.fill('280');
  await calculate();
  await expect(row(/^Luxury car tax at the /)).toHaveText('Not decided here: whether it is a commercial vehicle turns on LCTD 2023/1 paragraph 13');
  await expect(row('Designed load: gross vehicle mass less kerb weight')).toHaveText('960 kg');
  await accessories.fill('0');
  // The ATO's instant asset write-off example: $75,000 in 2025-26 gives a $6,334 credit and a $68,666 cost.
  await form.getByLabel('Passenger body (sedan, wagon, SUV)').check();
  await form.getByLabel('Basic kerb weight (kg), 0 if unknown').fill('2135');
  await form.getByLabel('Price including GST, before luxury car tax (AUD)').fill('75000');
  await form.getByLabel('2025-26').check();
  await calculate();
  await expect(row('Car limit, section 40-230')).toHaveText('Applies: $69,674.00');
  await expect(row('GST credit, section 69-10 of the GST Act')).toHaveText('$6,334.00: the GST in the price, up to 1/11 of the car limit');
  await expect(row('First element of cost for decline in value')).toHaveText('$68,666.00');
  // No ATO source says whether a single cab ute is designed mainly for carrying passengers.
  await form.getByLabel('Single cab ute').check();
  await calculate();
  await expect(row('Designed principally to carry passengers'))
    .toHaveText('Not decided here: TD 94/19 weighs a single cab ute’s appearance, marketing and specifications');
  await expect(row('Car limit, section 40-230'))
    .toHaveText('Not decided here: it applies only to a car designed mainly for carrying passengers');
  await expect(row('First element of cost for decline in value')).toHaveCount(0);
  // Within the limit the cost after the credit is the same whether or not the limit applies.
  await form.getByLabel('Price including GST, before luxury car tax (AUD)').fill('55000');
  await calculate();
  await expect(row('First element of cost for decline in value')).toHaveText('$50,000.00');
  await form.getByLabel('Another body, such as a truck or bus').check();
  await calculate();
  await expect(form.locator('output')).toHaveText('Whether this body was designed principally to carry passengers turns on its appearance, '
    + 'marketing and specifications (TD 94/19), which this page does not weigh.');
  await form.getByLabel('Yes, figures unknown').check();
  await calculate();
  await expect(form.locator('output')).toHaveText('A modified vehicle is classified on its manufacturer’s figures from the compliance plate; '
    + 'without them this page cannot classify it.');
});

test('transfer duty takes a first home buyer chosen by keyboard and says where there is no concession', async ({ page }) => {
  await page.goto('/tools/business-calculators/transfer-duty/');
  const form = page.locator('#transfer-duty form');
  await waitForCalculator(form);
  await form.getByLabel('Queensland').check();
  await form.getByLabel('Eligible first home buyer, established home').focus();
  await page.keyboard.press('Space');
  await expect(form.getByLabel('Eligible first home buyer, established home')).toBeChecked();
  await form.getByLabel('Dutiable value (whole dollars)').fill('730000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: Queensland, dutiable value $730,000.00, eligible first home buyer, established home. '
    + 'Duty for an eligible first home buyer: $6,555.00. General transfer duty: $25,875.00. '
    + 'Rate applied: $17,325 plus $4.50 for every $100, or part of $100, over $540,000.');
  await form.getByLabel('Tasmania').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal')).toHaveText(
    'Duty for an eligible first home buyer: none for this home, so general duty applies.');
});

// ATO, Allocating franking credits, example 2: Dillmore Manufacture's $52 million year sets a 30% rate
// for franking a $100,000 distribution, whatever this year's 25% rate; the exact credit is $42,857.14.
test('company tax and franking works Dillmore Manufacture offline and refuses impossible passive income', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/company-tax/');
  const form = page.locator('#company-tax form');
  await waitForCalculator(form);
  await context.setOffline(true);
  for (const [label, amount] of [['Aggregated turnover for the year (AUD)', '45000000'],
    ['Assessable income for the year (AUD)', '45000000'], ['Base rate entity passive income in it, franking credits included (AUD)', '0'],
    ['Taxable income for the year (AUD)', '4500000'], ['Previous year’s aggregated turnover (AUD)', '52000000'],
    ['Previous year’s assessable income (AUD)', '52000000'], ['Previous year’s base rate entity passive income (AUD)', '0'],
    ['Dividend paid this year (AUD)', '100000'], ['Shareholder’s marginal tax rate, with any Medicare levy (%)', '45']]) {
    await form.getByLabel(label, { exact: true }).fill(amount);
  }
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const output = form.locator('output');
  await expect(output).toContainText('Company tax rate: 25%: A base rate entity (section 23AA), with passive income 0.00% of assessable income.');
  await expect(output).toContainText('Corporate tax rate for imputation purposes: 30%: Not a base rate entity: aggregated turnover is not under');
  await expect(output).toContainText('Maximum franking credit on the dividend: $42,857.14.');
  await expect(output).toContainText('Tax left to pay on the dividend: $21,428.57.');
  await form.getByRole('group', { name: 'Did the company exist in the previous income year?' }).getByLabel('No').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('Maximum franking credit on the dividend: $33,333.33.');
  await form.getByLabel('Base rate entity passive income in it, franking credits included (AUD)', { exact: true }).fill('45000000.01');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toHaveText('Base rate entity passive income cannot be more than assessable income.');
});

test('salary against dividends works a 30% company in 2021-22 and Division 293 offline and refuses unpaid super', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/salary-dividend/');
  const form = page.locator('#salary-dividend form');
  await waitForCalculator(form);
  await context.setOffline(true);
  const fill = async (profit, salary) => {
    await form.getByLabel('Company profit before the owner’s salary and super (AUD)', { exact: true }).fill(profit);
    await form.getByLabel('Salary paid to the owner (AUD)', { exact: true }).fill(salary);
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  };
  await form.getByLabel('2021-22', { exact: true }).check();
  await form.getByLabel('No: tax and franking at 30%', { exact: true }).check();
  await fill('41000', '20000');
  const output = form.locator('output');
  await expect(output).toContainText('Super guarantee at 10% of the salary: $2,000.00.');
  await expect(output).toContainText('Owner’s extra income tax and Medicare levy, less the franking credit: −$2,418.00.');
  await expect(output).toContainText('Kept in all, cash and super: $37,418.00.');
  await expect(output).toContainText('Most kept: salary of $35,000.00');
  await form.getByLabel('2026-27', { exact: true }).check();
  await form.getByLabel('Yes: tax and franking at 25%', { exact: true }).check();
  await fill('600000', '270830');
  await expect(output).toContainText('Contributions tax and Division 293 tax on the super: $9,749.88.');
  await expect(output).toContainText('Division 293 tax is counted against the super');
  await fill('100000', '95000');
  await expect(output).toHaveText('Enter a salary of no more than $89,285.71: the profit also pays its super guarantee.');
});

// GSTR 2006/8 Example 14: a GST-exclusive price of $96,364 on land acquired for $60,000 comes to $100,000.40
// GST-inclusive, a margin of $40,000.40 and GST of $3,636.40; a sale to an associate is refused.
test('GST margin scheme works GSTR 2006/8 Example 14 offline and refuses a sale to an associate', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/gst-margin-scheme/');
  const form = page.locator('#gst-margin-scheme form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Price for the sale (AUD)', { exact: true }).fill('96364');
  await form.getByRole('group', { name: 'Does the price include GST?' }).getByLabel('No, GST-exclusive', { exact: true }).check();
  await form.getByLabel('Consideration or approved valuation for the whole (AUD)', { exact: true }).fill('60000');
  await form.getByLabel('This sale’s part, by area, lots or anticipated price', { exact: true }).fill('1');
  await form.getByLabel('The whole, in the same measure', { exact: true }).fill('1');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const output = form.locator('output');
  await expect(output).toContainText('Consideration for the sale, GST-inclusive: $100,000.40.');
  await expect(output).toContainText('Margin (subsection 75-10(2)): $40,000.40.');
  await expect(output.locator('.result-row--principal strong')).toHaveText('$3,636.40');
  await form.getByRole('group', { name: 'Is the buyer your associate?' }).getByLabel('Yes').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toHaveText('On a sale to your associate the consideration is the GST-inclusive market value (section 75-13): '
    + 'this calculator does not work out that value.');
});

test('GST margin scheme refuses the wrong valuation date and accepts the earlier GST application date offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/gst-margin-scheme/');
  const form = page.locator('#gst-margin-scheme form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByRole('radio', { name: /^Acquired, or contracted for, before 1 July 2000/ }).check();
  await form.getByRole('radio', { name: 'An approved valuation (held since before 1 July 2000)', exact: true }).check();
  await form.getByLabel('Price for the sale (AUD)', { exact: true }).fill('660000');
  await form.getByLabel('Consideration or approved valuation for the whole (AUD)', { exact: true }).fill('440000');
  await form.getByLabel('This sale’s part, by area, lots or anticipated price', { exact: true }).fill('1');
  await form.getByLabel('The whole, in the same measure', { exact: true }).fill('1');
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const output = form.locator('output');
  await calculate.click();
  await expect(output).toContainText('Say whether you were registered or required to be registered');
  await form.getByRole('combobox', { name: 'Were you registered or required to be registered for GST on 1 July 2000?', exact: true })
    .selectOption('applied-later');
  await form.getByRole('combobox', { name: 'Property and supplier for the valuation', exact: true }).selectOption('unimproved');
  await form.getByLabel('Date GST registration took effect, if you answered No', { exact: true }).fill('2003-05-01');
  const valuation = form.getByLabel('Date the valuation applies to', { exact: true });
  await calculate.click();
  await expect(output).toHaveText('Enter the valuation date.');
  await valuation.fill('2003-05-01');
  await calculate.click();
  await expect(output).toHaveText('Enter the date you applied for GST registration.');
  await form.getByLabel('Date you applied for GST registration, if you answered No and applied', { exact: true }).fill('2003-04-30');
  await calculate.click();
  await expect(output).toHaveText('Use an approved valuation as at 2003-04-30 (subsection 75-10(3)).');
  await valuation.fill('2003-04-30');
  await calculate.click();
  await expect(output.locator('.result-row--principal strong')).toHaveText('$20,000.00');
});

// SRO Victoria's Clara: a fixed trust holding $1,000,000 of land, half for absentee beneficiaries, pays
// $20,000 of absentee owner surcharge; at 50% foreign it is not a foreign purchaser for duty.
test('foreign purchaser surcharges work SRO Victoria’s fixed trust offline and refuse an exemption', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/foreign-surcharge/');
  const form = page.locator('#foreign-surcharge form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Victoria', { exact: true }).check();
  await form.getByLabel('The trustee of a fixed or unit trust', { exact: true }).check();
  await form.getByLabel('Land value for land tax: all the buyer’s taxable land in the state or territory, their share only (whole dollars)',
    { exact: true }).fill('1000000');
  await form.getByLabel('Company, trust or fund: largest interest held by one foreign person with associates (%)', { exact: true }).fill('50');
  await form.getByLabel('Company, trust or fund: interests of all foreign persons together, with associates (%)', { exact: true }).fill('50');
  await form.getByLabel('Victorian land tax, company or fixed trust: interests of absentee persons together, with associates (%)', { exact: true })
    .fill('50');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const output = form.locator('output');
  await expect(output).toContainText('Foreign purchaser duty surcharge at 8% of the buyer’s share: $0.00.');
  await expect(output).toContainText('Land tax surcharge for a full year: $20,000.00.');
  await form.getByLabel('Northern Territory', { exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('Duty surcharge test: The Northern Territory charges no foreign purchaser duty.');
  await form.getByRole('group', { name: 'Is an exemption, refund or ex gratia relief from a surcharge being sought?' }).getByLabel('Yes').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toHaveText('Exemptions, refunds and relief from these surcharges are decided by each Commissioner on application, '
    + 'so this page does not work them out.');
});

test('foreign purchaser surcharges add the FIRB fee, compare every state offline and hide the comparison off residential land', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/foreign-surcharge/');
  const form = page.locator('#foreign-surcharge form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('An established dwelling, generally banned to 30 June 2029', { exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const output = form.locator('output');
  await expect(output).toContainText('FIRB application fee for 2026-27: $46,800.00.');
  await expect(output).toContainText('Upfront total: general duty, duty surcharge and FIRB fee: $175,987.00.');
  await expect(output).toContainText('From 1 April 2025 to 30 June 2029 foreign persons are generally banned from buying established dwellings');
  const rows = form.locator('table[data-results="places"] tbody tr');
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toHaveText('New South Wales$39,187.00$90,000.00$175,987.00');
  await form.getByLabel('Dutiable value of the whole property (whole dollars)', { exact: true }).fill('1200000');
  await form.getByLabel('Dutiable value of this buyer’s share (whole dollars)', { exact: true }).fill('600000');
  await form.getByLabel('Tenant in common', { exact: true }).check();
  await form.getByLabel(/^FIRB ownership fraction/).fill('1/2');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('FIRB application fee for 2026-27 on the ownership share: $23,400.00.');
  await expect(output).toContainText('Foreign purchaser duty surcharge at 9% of the buyer’s share: $54,000.00.');
  await form.getByLabel('Joint tenant', { exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('FIRB application fee for 2026-27 before payment adjustments: $46,800.00.');
  await expect(output).toContainText('calculated under the same section of the Fees Imposition Regulations');
  const jointSource = form.locator('li').filter({ hasText: 'Joint tenants see the full fee.' });
  await expect(jointSource).toContainText('same interest on the same day under subsection 113(1) of the Foreign Acquisitions and Takeovers Act 1975');
  await expect(jointSource).toContainText('calculated under the same section of the Fees Imposition Regulations');
  await expect(jointSource).toContainText('paid in full or in part on a later day');
  await expect(jointSource).toContainText('at the end of that day by the amount paid towards that one fee on that day');
  await form.getByLabel('Commercial or other', { exact: true }).check();
  await form.getByLabel('None: not a foreign person under the Foreign Acquisitions and Takeovers Act, or not needed', { exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).not.toContainText('Upfront total');
  await expect(form.locator('table[data-results="places"]')).toBeHidden();
});

// Business Victoria lists Melbourne Cup Day, Tuesday 3 November 2026, for all of Victoria; the WA
// Government's page lists no such day, so the same dates give 1 business day in Victoria and 2 in WA.
test('business days skip Melbourne Cup Day in Victoria offline and refuse a date past the coverage', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/business-days/');
  const form = page.locator('#business-days form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Victoria', { exact: true }).check();
  await form.getByLabel('Start date', { exact: true }).fill('2026-11-02');
  await form.getByLabel('End date, to count between 2 dates', { exact: true }).fill('2026-11-04');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const output = form.locator('output');
  await expect(output).toContainText('Business days after the start, to and including the end: 1.');
  await expect(output).toContainText('Weekday public holidays skipped: 3 November 2026 (Melbourne Cup Day).');
  await form.getByLabel('Western Australia', { exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toContainText('Business days after the start, to and including the end: 2.');
  await form.getByLabel('Victoria', { exact: true }).check();
  await form.getByLabel('Start date', { exact: true }).fill('2027-09-01');
  await form.getByLabel('End date, to count between 2 dates', { exact: true }).fill('2027-09-30');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toHaveText('This page has public holidays from 1 January 2026 to 31 August 2027 for Victoria; choose dates in that range.');
});

// Each calculator opens on a fictional example, its first boundary case, already worked.
const CALCULATORS = ['gst', 'business-use', 'margin', 'break-even', 'hourly', 'fixed-fee', 'variance', 'loan', 'hire-purchase', 'div7a',
  'fbt-car', 'vehicle-class', 'pcg-2021-4', 'pcg-2021-4-allocation', 'gic-payment-plan', 'staff', 'cash', 'objection-deadline', 'payg-instalments',
  'termination-payment', 'transfer-duty', 'land-tax', 'fbt-car-parking', 'fbt-loan', 'fbt-meal-entertainment', 'fbt-property', 'fbt-expense-payment',
  'div7a-schedule', 'division-296', 'payroll-tax', 'psi-determination', 'cgt-concessions',
  'franking-account', 'company-tax', 'salary-dividend', 'foreign-surcharge', 'business-days', 'sgc-payday', 'cgt', 'long-service-leave', 'unused-leave', 'borrowing-expenses',
  'workers-compensation', 'fuel-tax-credits', 'lease', 'gst-margin-scheme', 'asic-fees'];

test.describe('before any script runs', () => {
  test.use({ javaScriptEnabled: false });
  test('every calculator page arrives with a worked example result', async ({ page }) => {
    for (const id of CALCULATORS) {
      await page.goto(`/tools/business-calculators/${id}/`);
      const output = page.locator(`#${id} output`);
      await expect(output.locator('.result-example'), id).toHaveText(
        'Fictional example: the first boundary case below. Change the inputs and calculate your own.');
      await expect(output.locator('.result-row strong').first(), id).toHaveText(/\d/);
    }
  });
});

for (const id of CALCULATORS) {
  test(`${id} keeps its served example at load, Calculate agrees, and an edit replaces it`, async ({ page }) => {
    const response = await page.goto(`/tools/business-calculators/${id}/`);
    const served = (await response.text()).match(/<output aria-live="polite" data-example>([\s\S]*?)<\/output>/)[1];
    const form = page.locator(`#${id} form`);
    const output = form.locator('output');
    await waitForCalculator(form);
    // The scripts leave the served example alone: nothing moves, and the live region has nothing to announce.
    expect(await output.evaluate((element) => element.innerHTML)).toBe(served);
    const example = await output.evaluate((element) => {
      const copy = element.cloneNode(true);
      copy.querySelector('.result-example').remove();
      return copy.textContent;
    });
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(output.locator('.result-example')).toHaveCount(0);
    // The cash result also names week 1's first day, which the page sets to today.
    const calculated = await output.evaluate((element) => element.textContent);
    expect(calculated.replace(/^Inputs: week 1 from [^,]+, /, 'Inputs: ')).toBe(example);
    await page.reload();
    await waitForCalculator(form);
    // The objection deadline form has dates and choices only.
    const edit = form.locator('input[type=number], input[type=date]').first();
    await edit.fill(await edit.getAttribute('type') === 'date' ? '2027-01-01' : '1');
    await expect(output).toHaveText('Enter the inputs and calculate.');
  });
}

test('printing includes selected questions hidden by a filter and restores the screen', async ({ page }) => {
  await page.goto('/tools/accounting-questions/investments-local/#q100');
  await page.getByLabel('Add to my checklist, question 100', { exact: true }).check();
  await page.getByLabel('Search questions').fill('Newcastle fee');
  // Suppress only the native print dialog; exercise the real selection and CSS.
  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole('button', { name: 'Print selected checklist' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.question:visible')).toHaveCount(1);
  await expect(page.locator('#q100 .question-answer')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await expect(page.getByLabel('Search questions')).toHaveValue('Newcastle fee');
  await expect(page.locator('#q100')).toBeHidden();
  await expect(page.locator('#question-count')).toContainText('1 selected');
});

test('selected checklist retains worked examples and the topic review period', async ({ page }) => {
  await page.goto('/tools/accounting-questions/gst-bas/');
  for (const id of [36, 37]) {
    await page.locator(`#q${id} summary`).click();
    await page.getByLabel(`Add to my checklist, question ${id}`, { exact: true }).check();
  }
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download selected checklist' }).click();
  const checklist = await readFile(await (await download).path(), 'utf8');
  expect(checklist.match(/Fictional worked example/g)).toHaveLength(1);
  expect(checklist).toContain('Reviewed 11 September 2026.');
  expect(checklist).toContain('Use the BAS period');
  expect(checklist).toContain('GST component payable is $1,200');
  expect(checklist).toContain('## 37.');
});

for (const route of ['/tools/accounting-questions/', '/tools/accounting-questions/gst-bas/', '/tools/business-calculators/', '/tools/business-calculators/cash/']) {
  test(`new page is accessible and stays within the viewport: ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveTitle(/Australian accounting questions|business calculators|cash forecast calculator/);
    await expect(page.locator('h1')).toHaveCount(1);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

// The month after a due date of 30 November 2026 starts on 1 December, so it runs to 31 December
// (Acts Interpretation Act 1901 s 2G(1)); a payment after a Sunday month end and by the Wednesday is refused.
test('ASIC fees page counts the late fee month from the day after the due date and refuses a weekend boundary offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/asic-fees/');
  const form = page.locator('#asic-fees form');
  await waitForCalculator(form);
  await context.setOffline(true);
  const output = form.locator('output');
  await form.locator('[name="fee"]').selectOption('late-lodgement');
  await form.locator('[name="due"]').fill('2026-11-30');
  await form.locator('[name="received"]').fill('2026-12-31');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output.locator('.result-row--principal')).toHaveText('Late fee, no GST: $102.00.');
  await expect(output).toContainText('Last day of the first month after the due date: Thursday 31 December 2026.');
  await form.locator('[name="received"]').fill('2027-01-01');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output.locator('.result-row--principal')).toHaveText('Late fee, no GST: $428.00.');
  await form.locator('[name="fee"]').selectOption('late-review-payment');
  await form.locator('[name="due"]').fill('2027-01-29');
  await form.locator('[name="received"]').fill('2027-03-01');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toHaveText(/^The first month after the due date ends on a Saturday or Sunday/);
  // A fixed fee needs no dates, and the browser's date checks must not stop the engine's own refusal.
  await form.locator('[name="due"]').fill('');
  await form.locator('[name="received"]').fill('');
  await form.locator('[name="fee"]').selectOption('review-public');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output.locator('.result-row--principal')).toHaveText('ASIC fee, no GST: $1,591.00.');
  await form.locator('[name="fee"]').selectOption('late-lodgement');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(output).toHaveText(/^Enter a real date as YYYY-MM-DD/);
});

test('objection deadline takes the later of an amended assessment’s 2 dates offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/objection-deadline/');
  const form = page.locator('#objection-deadline form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Amended income tax assessment', { exact: true }).check();
  await form.getByLabel('No: 4 years').check();
  await form.getByLabel('Day notice of the decision was given or served').fill('2028-10-02');
  await form.getByLabel('Amended assessments only: day notice of the first assessment for the year was given or served').fill('2024-10-23');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: amended income tax assessment, no item 1, 2, 3 or 3A (4 years), notice given 2 October 2028, '
    + 'first assessment’s notice given 23 October 2024. 60 days after the amended notice: Friday 1 December 2028. '
    + '4 years after the first notice: Monday 23 October 2028. Period ends, subsection 14ZW(1B): Friday 1 December 2028. '
    + 'Last day to lodge, under subsection 36(2) of the Acts Interpretation Act 1901: Friday 1 December 2028. '
    + 'If that day is a public holiday where the objection is lodged, or the office is closed all day, it may be lodged on the next day '
    + 'that is not a Saturday, Sunday or holiday. After the last day, an objection needs a written request under '
    + 'subsection 14ZW(2), which the Commissioner decides under section 14ZX.');
  await form.getByLabel('Day notice of the decision was given or served').fill('2028-09-01');
  await form.getByLabel('Amended assessments only: day notice of the first assessment for the year was given or served').fill('2028-09-02');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText('The first assessment’s notice cannot be later than the amended one.');
});

test('a varied PAYG instalment rate gives the instalment and its credit offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/payg-instalments/');
  const form = page.locator('#payg-instalments form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Option 2, varied: a rate from your estimates for the year').check();
  await form.getByLabel('Varying only: estimated tax on instalment income for the year, T8 (AUD)').fill('10125');
  await form.getByLabel('Varied rate only: estimated instalment income for the year (AUD)').fill('82480');
  await form.getByLabel('Option 2: instalment income for the quarter at T1 (AUD)').fill('20620');
  await form.getByLabel('Option 2: instalment rate at T2 (%)').fill('16.84');
  await form.getByLabel('Varying only: earlier instalments this income year, as at 5A (AUD)').fill('6944');
  await form.getByLabel('Varied rate only: instalment income of the earlier quarters (AUD)').fill('41240');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  // The ATO's example 2 rate; the instalment and credit are worked by hand: $20,620 × 12.27% = $2,530.07,
  // and $6,944 − $41,240 × 12.27% ($5,060.15) = $1,883.85.
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: varied instalment rate (option 2), estimated tax $10,125.00 on estimated instalment income $82,480.00 for the year, '
    + 'instalment income $20,620.00 at T1, instalment rate 16.84% at T2, earlier instalments $6,944.00 less credits claimed $0.00, '
    + 'on earlier instalment income $41,240.00. Varied rate at T3: 12.27%. T1 × T3: $2,530.07. '
    + 'Instalment at T11 and 5A, whole dollars: $2,530.00. Credit to claim at 5B, whole dollars: $1,883.00. '
    + 'A credit applies only when the varied rate is lower than the rate at T2.');
  await form.getByLabel('Varying only: estimated tax on instalment income for the year, T8 (AUD)').fill('82480.01');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText('Estimated tax cannot exceed estimated instalment income.');
});

test('land tax adds the ACT fixed charge and names the band it applied, offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/land-tax/');
  const form = page.locator('#land-tax form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel('Australian Capital Territory', { exact: true }).check();
  await form.getByLabel('Total taxable land value (whole dollars)').fill('600000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  // Worked by hand from DI2026-152: $1,778 + $1,610 + 1.24% of $325,000.
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: Australian Capital Territory, total taxable land value $600,000.00. Land tax for the year: $7,418.00. '
    + 'Rate applied: the $1,778 fixed charge plus $1,610 plus 1.24% of the value over $275,000.');
});

test('land tax adds a foreign owner surcharge and MRIT from the radios and checkbox, offline', async ({ page, context }) => {
  await page.goto('/tools/business-calculators/land-tax/');
  const form = page.locator('#land-tax form');
  await waitForCalculator(form);
  await context.setOffline(true);
  const text = () => form.locator('output').evaluate((element) => element.textContent);
  // Revenue NSW's surcharge land tax example 1.
  await form.getByLabel('Yes', { exact: true }).check();
  await form.getByLabel('Total taxable land value (whole dollars)').fill('1200000');
  await form.getByLabel('Surcharge value, New South Wales and Tasmania only (whole dollars)').fill('1200000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await text()).toBe('Inputs: New South Wales, foreign or absentee owner, total taxable land value $1,200,000.00, '
    + 'surcharge value $1,200,000.00. Land tax for the year: $2,100.00. Rate applied: $100 plus 1.6% of the value over $1,075,000. '
    + 'Foreign or absentee owner surcharge: $60,000.00. Total for the year: $62,100.00.');
  // Western Australia has no surcharge here, so the choice is refused rather than ignored.
  await form.getByLabel('Western Australia', { exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await text()).toBe('This calculator has no foreign or absentee owner rates for Western Australia.');
  // Worked by hand: $1,750 + 0.9% of $500,000, and MRIT of 0.14% of $1,200,000.
  await form.getByLabel('No', { exact: true }).check();
  await form.getByLabel('Total taxable land value (whole dollars)').fill('1500000');
  await form.getByLabel('All the land is in the Perth metropolitan region (Western Australia)').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await text()).toBe('Inputs: Western Australia, total taxable land value $1,500,000.00, all in the Perth metropolitan region. '
    + 'Land tax for the year: $6,250.00. Rate applied: $1,750 plus 0.9% of the value over $1,000,000. '
    + 'Metropolitan region improvement tax: $1,680.00. Total for the year: $7,930.00.');
});

test('land tax says RevenueSA assesses nothing under $20 only when the South Australian figure is under $20', async ({ page }) => {
  await page.goto('/tools/business-calculators/land-tax/');
  const form = page.locator('#land-tax form');
  await waitForCalculator(form);
  const note = form.locator('output .result-note');
  await form.getByLabel('South Australia', { exact: true }).check();
  // $50 over the threshold is a whole $100 at 50 cents; $939,900 is 39 lots of $100, $19.50.
  for (const [value, shown] of [['936050', '$0.50'], ['939900', '$19.50']]) {
    await form.getByLabel('Total taxable land value (whole dollars)').fill(value);
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(form.locator('output .result-row strong').first()).toHaveText(shown);
    await expect(note).toHaveText('RevenueSA issues no land tax assessment where the calculated land tax is under $20.');
  }
  // $940,000 is 40 lots of $100, $20.00, and New South Wales has no such rule.
  await form.getByLabel('Total taxable land value (whole dollars)').fill('940000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row strong').first()).toHaveText('$20.00');
  await expect(note).toHaveCount(0);
  await form.getByLabel('New South Wales', { exact: true }).check();
  await form.getByLabel('Total taxable land value (whole dollars)').fill('1075001');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row strong').first()).toHaveText('$100.02');
  await expect(note).toHaveCount(0);
});
