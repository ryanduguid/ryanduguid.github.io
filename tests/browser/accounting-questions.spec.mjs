// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

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
  ['loan', { principal: '1000', rate: '12', months: '1' }, '$1,010.00'],
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

for (const [rate, months, expected] of [
  ['2.4789', '2', ['Monthly payment: $501,549,845.36.', 'First payment principal: $499,484,095.36.']],
  ['100', '600', ['Monthly payment: $83,333,333.33.', 'Estimated total interest: $49,000,000,000.00.']],
]) {
  test(`loan handles the maximum principal with ${rate}% over ${months} payments`, async ({ page }) => {
    await page.goto('/tools/business-calculators/loan/');
    const form = page.locator('#loan form');
    await form.locator('[name="principal"]').fill('1000000000');
    await form.locator('[name="rate"]').fill(rate);
    await form.locator('[name="months"]').fill(months);
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
    for (const text of expected) await expect(form.locator('output')).toContainText(text);
  });
}

test('loan takes a balloon and payments in advance from the form', async ({ page }) => {
  await page.goto('/tools/business-calculators/loan/');
  const form = page.locator('#loan form');
  await form.getByLabel('Loan principal (AUD)').fill('60000');
  await form.getByLabel('Annual nominal interest rate (%)').fill('7.5');
  await form.getByLabel('Number of monthly payments').fill('60');
  await form.getByLabel('Balloon or residual owed at the end (AUD)').fill('18000');
  await form.getByRole('radio', { name: 'At the start of each month (in advance)', exact: true }).check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  expect(await form.locator('output').evaluate((element) => element.textContent)).toBe(
    'Inputs: principal $60,000.00, 7.5% annual nominal rate, 60 monthly payments in advance, balloon $18,000.00. '
    + 'Monthly payment: $948.17. First payment interest: $0.00. First payment principal: $948.17. Estimated total interest: $14,890.07.');
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
  await form.getByLabel('Lodged', { exact: true }).check();
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

// Each calculator opens on a fictional example, its first boundary case, already worked.
const CALCULATORS = ['gst', 'business-use', 'margin', 'break-even', 'hourly', 'fixed-fee', 'variance', 'loan', 'div7a',
  'fbt-car', 'vehicle-class', 'pcg-2021-4', 'pcg-2021-4-allocation', 'gic-payment-plan', 'staff', 'cash', 'objection-deadline', 'payg-instalments',
  'termination-payment', 'transfer-duty', 'land-tax', 'fbt-car-parking', 'fbt-loan', 'fbt-meal-entertainment',
  'div7a-schedule', 'division-296', 'payroll-tax', 'psi-determination', 'sgc-payday'];

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
