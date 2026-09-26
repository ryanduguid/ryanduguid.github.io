import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test('calculator load failure explains recovery and reload retries the module', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/assets/business-calculators.mjs', route => route.abort());
  await page.goto('/tools/business-calculators/gst/');
  await expect(page.locator('#gst output')).toContainText('Calculators could not load.');
  await expect(page.locator('form[data-calculator] fieldset:disabled')).toHaveCount(1);
  await page.unroute('**/assets/business-calculators.mjs');
  await page.getByRole('button', { name: 'Reload this page to retry' }).first().click();
  await expect(page.locator('#gst fieldset')).toBeEnabled();
  await page.locator('#gst input[name=amount]').fill('100');
  await page.locator('#gst').getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('#gst output')).toContainText('GST: $10.00');
  expect(errors).toEqual([]);
});

test('an invalid business calculator field gets an inline instruction and focus', async ({ page }) => {
  await page.goto('/tools/business-calculators/gst/');
  const form = page.locator('#gst form');
  const amount = form.locator('input[name=amount]');
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
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
  const download = page.waitForEvent('download');
  await form.getByRole('button', { name: 'Save inputs' }).click();
  const saved = await download;
  const path = await saved.path();
  const input = JSON.parse(await readFile(path, 'utf8'));
  expect(input.startDate).toBe('2026-09-28');
  expect(input.weeks[0]).toEqual({ receipts: '1000', payments: '300' });
  await page.reload();
  await page.getByLabel('Load inputs (replaces the current forecast)').setInputFiles(path);
  await expect(form.getByLabel('First day of week 1')).toHaveValue('2026-09-28');
  await expect(form.getByLabel('Week 1 receipts', { exact: true })).toHaveValue('1000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('#cash-results tbody tr').first()).toContainText(/28 Sept? 2026/);
  await expect(page.locator('#cash-results tbody tr').nth(1)).toContainText('5 Oct 2026');
  await expect(page.locator('#cash-results tbody tr').first()).toContainText('-$100.00');
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

test('cash scenario exports delayed receipts and reports the funding gap', async ({ page }) => {
  await page.goto('/tools/business-calculators/cash/');
  const form = page.locator('#cash form');
  await form.getByLabel('First day of week 1').fill('2026-09-28');
  await form.getByLabel('Opening bank balance (AUD)').fill('200');
  await form.getByLabel('Minimum cash buffer (AUD)').fill('100');
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

for (const [id, inputs, expected] of [
  ['business-use', { cost: '20.15', percent: '50' }, '$10.08'],
  ['margin', { sales: '150', cost: '100' }, 'Margin: 33.33%'],
  ['break-even', { fixed: '1000', price: '30', variable: '18' }, '84 whole units'],
  ['hourly', { cost: '80000', profit: '20000', hours: '1000' }, '$100.00'],
  ['variance', { actual: '120', budget: '100', kind: 'cost' }, 'Unfavourable'],
  ['loan', { principal: '1000', rate: '12', months: '1' }, '$1,010.00'],
  ['staff', { wages: '80000', super: '9600', other: '4000' }, '$93,600.00'],
]) {
  test(`${id} sends the entered values to its calculation`, async ({ page }) => {
    await page.goto(`/tools/business-calculators/${id}/`);
    const form = page.locator(`#${id} form`);
    for (const [name, value] of Object.entries(inputs)) {
      const field = form.locator(`[name="${name}"]`);
      if (name === 'kind') await field.selectOption(value);
      else await field.fill(value);
    }
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(form.locator('output')).toContainText(expected);
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
