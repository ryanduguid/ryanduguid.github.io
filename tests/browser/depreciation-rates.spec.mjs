// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { projectKind } from './project-kind.mjs';

const PAGE = '/tools/depreciation-rates/';

/** The text of each cell in the row a description heads. */
async function rowCells(scope, description) {
  const row = scope.getByRole('row').filter({ has: scope.page().getByRole('rowheader', { name: description }) }).first();
  return row.getByRole('cell').allInnerTexts();
}

test('a typed asset shows its life, both rates and the date, Table B first', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('#finder-status')).toHaveText('9,311 rows to search.');
  await page.getByLabel('Asset', { exact: true }).fill('laptop');
  await expect(page.locator('#finder-status')).toHaveText('4 rows match ‘laptop’.');
  const results = page.locator('#finder-results');
  await expect(results.getByRole('heading', { level: 3 })).toHaveText([
    'Used across industries (Table B)',
    'Listed for an industry (Table A)',
  ]);
  const cells = await rowCells(results, /^Mobile\/portable computers \(including laptops, tablets\)/);
  expect(cells.slice(0, 4)).toEqual(['2 years', '50.00%', '100.00%', '1 July 2016']);
  // The address keeps the search, so a result can be linked.
  await expect(page).toHaveURL(/\?q=laptop$/);
});

test('a linked search opens with the industry rows ahead of Table B', async ({ page }) => {
  await page.goto(`${PAGE}?q=tractor&industry=agriculture-forestry-and-fishing`);
  await expect(page.locator('#finder-status')).toHaveText('4 rows match ‘tractor’ in Agriculture, forestry and fishing and Table B.');
  await expect(page.getByLabel('Asset', { exact: true })).toHaveValue('tractor');
  await expect(page.getByLabel('Industry (Table A)')).toHaveValue('agriculture-forestry-and-fishing');
  const results = page.locator('#finder-results');
  await expect(results.getByRole('heading', { level: 3 })).toHaveText([
    'Agriculture, forestry and fishing (Table A)',
    'Used across industries (Table B)',
  ]);
  // A tractor's 12 years carries the mark for a capped life.
  const tractors = results.getByRole('rowheader', { name: /^Tractors/ }).first();
  await expect(tractors).toContainText('Capped life available (section 40-102)');
  await page.getByLabel('Industry (Table A)').selectOption('');
  await expect(page.locator('#finder-status')).toHaveText('40 rows match ‘tractor’.');
  await expect(page).toHaveURL(/\?q=tractor$/);
});

test('a word the instrument does not use still finds the asset, and none says so', async ({ page }) => {
  await page.goto(`${PAGE}?q=fridges`);
  await expect(page.locator('#finder-results').getByRole('rowheader', { name: /^Refrigerators/ }).first()).toBeVisible();
  await page.getByLabel('Asset', { exact: true }).fill('xyzzy');
  await expect(page.locator('#finder-status')).toHaveText('No row matches ‘xyzzy’. Try fewer or different words, or browse the tables below.');
  await expect(page.locator('#finder-results')).toBeEmpty();
});

test('a heading opens the rows under it, focus follows and Back returns', async ({ page }) => {
  await page.goto(`${PAGE}?q=motor+vehicle`);
  const results = page.locator('#finder-results');
  await results.getByRole('button', { name: 'Show the 21 rows under this heading' }).first().click();
  const title = results.getByRole('heading', { level: 3, name: 'Motor vehicles and trailers' });
  await expect(title).toBeFocused();
  await expect(results.getByRole('row')).toHaveCount(23);
  expect((await rowCells(results, /^Taxis/)).slice(0, 4)).toEqual(['4 years', '25.00%', '50.00%', '1 July 2015']);
  await results.getByRole('button', { name: 'Back to the search results' }).click();
  await expect(page.getByLabel('Asset', { exact: true })).toBeFocused();
  await expect(page.locator('#finder-status')).toHaveText('304 rows match ‘motor vehicle’.');
});

test('long result lists are drawn 40 rows at a time', async ({ page }) => {
  await page.goto(`${PAGE}?q=pump`);
  const group = page.locator('#finder-results .lives-group').filter({ hasText: 'Listed for an industry (Table A)' });
  await expect(group.locator('tbody tr')).toHaveCount(40);
  await group.getByRole('button', { name: /^Show 40 more/ }).click();
  await expect(group.locator('tbody tr')).toHaveCount(80);
  // Focus goes to the first new row, so the last press, which hides the button, does not lose it.
  await expect(group.locator('tbody tr').nth(40).getByRole('rowheader')).toBeFocused();
  // With no industry chosen, the reader is told that an industry's row comes first.
  await expect(page.locator('#finder-results > p.field-note')).toContainText('Choose your industry to see its rows first.');
});

test('a row sends its life to the calculator, which works the ATO photocopier example', async ({ page }) => {
  await page.goto(`${PAGE}?q=photocopier`);
  await page.getByRole('button', { name: 'Use this life: 5 years, Photo copying machines' }).click();
  await expect(page.getByLabel('Effective life (years)')).toHaveValue('5');
  await expect(page.getByLabel('Cost (AUD)')).toBeFocused();
  const output = page.locator('#deduction-output');
  await expect(output).toContainText('Effective life of 5 years taken from ‘Photo copying machines’');

  await page.getByLabel('Cost (AUD)').fill('$1,500');
  await page.getByLabel('First used or installed ready for use').fill('2025-07-01');
  await expect(page.getByLabel('Income year ending 30 June')).toHaveValue('2026');
  await page.getByRole('button', { name: 'Work out the deduction' }).click();
  // ATO, Guide to depreciating assets 2026: $600 in 2025-26 and $900 left on 30 June 2026.
  await expect(output.locator('.result-row')).toHaveText([
    'Decline in value for 2025-26$600.00',
    'Value left at 30 June 2026$900.00',
  ]);
  await expect(output).toContainText('200% ÷ 5 years (40.00% a year)');

  await page.getByLabel('Method').selectOption('prime-cost');
  await page.getByLabel('Income year ending 30 June').fill('2028');
  await page.getByRole('button', { name: 'Work out the deduction' }).click();
  await expect(page.locator('#deduction-schedule').getByRole('row')).toHaveText([
    /Income year\s*Days held\s*Opening value\s*Decline in value\s*Closing value/,
    /2025-26\s*365\s*\$1,500\.00\s*\$300\.00\s*\$1,200\.00/,
    /2026-27\s*365\s*\$1,200\.00\s*\$300\.00\s*\$900\.00/,
    /2027-28\s*366\s*\$900\.00\s*\$300\.82\s*\$599\.18/,
  ]);
});

test('an input the calculator cannot use is named at its field', async ({ page }) => {
  await page.goto(PAGE);
  const submit = page.getByRole('button', { name: 'Work out the deduction' });
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('Enter a value.');
  await expect(page.getByLabel('Cost (AUD)')).toBeFocused();

  await page.getByLabel('Cost (AUD)').fill('1500');
  await page.getByLabel('Effective life (years)').fill('five');
  await page.getByLabel('First used or installed ready for use').fill('2025-07-01');
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('Enter the effective life in years, such as 10, 7.5 or 6 2/3.');
  await expect(page.getByLabel('Effective life (years)')).toBeFocused();
  await expect(page.getByLabel('Effective life (years)')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('Effective life (years)').fill('6 2/3');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Income year ending 30 June').fill('2025');
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('Enter an income year ending 30 June 2026 or later.');
  await page.getByLabel('Income year ending 30 June').fill('2026');
  await submit.click();
  // 6 2/3 years is 30% a year exactly.
  await expect(page.locator('#deduction-output .result-row').first()).toHaveText('Decline in value for 2025-26$450.00');
});

test('the keyboard alone finds an asset and sends its life to the calculator', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('#finder-status')).toHaveText('9,311 rows to search.');
  await page.getByLabel('Asset', { exact: true }).focus();
  await page.keyboard.type('desks');
  await page.keyboard.press('Enter');
  await expect(page.locator('#finder-status')).toHaveText(/rows? match ‘desks’\.$/);
  const use = page.getByRole('button', { name: 'Use this life: 20 years, Desks' });
  for (let presses = 0; presses < 8 && !(await use.evaluate((node) => node === document.activeElement)); presses += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(use).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Effective life (years)')).toHaveValue('20');
  await expect(page.getByLabel('Cost (AUD)')).toBeFocused();
});

test('browsing opens an industry, then its rows in the determination order', async ({ page }) => {
  await page.goto(PAGE);
  const browse = page.locator('#browse-tables');
  await expect(browse.locator(':scope > details')).toHaveCount(37);
  await browse.getByText('Agriculture, forestry and fishing, ANZSIC 01110 to 05290').click();
  await browse.getByText('Agriculture, forestry and fishing: assets generally (92 rows)').click();
  const table = browse.getByRole('table', { name: 'Agriculture, forestry and fishing: assets generally' });
  await expect(table.locator('tbody tr')).toHaveCount(92);
  await expect(table.locator('tbody th').first()).toHaveText('All terrain vehicles (ATVs) used in primary production activities');
  // A row under a heading is indented one step.
  await expect(table.locator('tbody th.depth-1').first()).toContainText('General (incorporating anchor assemblies');
  await browse.getByText('Assets beginning with V (2 rows)').click();
  await expect(browse.getByRole('table', { name: 'Assets beginning with V' }).locator('tbody tr')).toHaveCount(2);
});

test('results fit the screen: stacked on a phone, one row each on a desktop', async ({ page }, testInfo) => {
  await page.goto(`${PAGE}?q=car`);
  const region = page.locator('#finder-results .table-scroll').first();
  await expect(region.locator('tbody tr').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const use = page.locator('#finder-results').getByRole('button', { name: /^Use this life/ }).first();
  expect((await use.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const widths = await region.evaluate((node) => [node.scrollWidth, node.clientWidth]);
  if (projectKind(testInfo) === 'mobile') {
    // Nothing to scroll sideways, and each figure sits beside the name of its column.
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
    const label = await region.locator('td[data-label="Prime cost rate"]').first()
      .evaluate((node) => getComputedStyle(node, '::before').content);
    expect(label).toBe('"Prime cost rate"');
  } else {
    await expect(region.getByRole('columnheader', { name: 'Prime cost rate' })).toBeVisible();
  }
});

test('the page with results and a schedule drawn passes the accessibility scan', async ({ page }) => {
  await page.goto(`${PAGE}?q=motor+vehicle`);
  await expect(page.locator('#finder-results tbody tr').first()).toBeVisible();
  await page.getByLabel('Cost (AUD)').fill('80000');
  await page.getByLabel('Effective life (years)').fill('5');
  await page.getByLabel('First used or installed ready for use').fill('2024-07-01');
  await page.getByRole('button', { name: 'Work out the deduction' }).click();
  await expect(page.locator('#deduction-schedule table')).toBeVisible();
  // The live region holds the result, not every row of the schedule.
  await expect(page.locator('#deduction-output table')).toHaveCount(0);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
});

test('a life set after the start date is flagged, a later start is not, and the commencement is always noted', async ({ page }) => {
  await page.goto(`${PAGE}?q=electric+scooters`);
  await page.getByRole('button', { name: 'Use this life: 2 years, Electric scooters (e-scooters)' }).click();
  await page.getByLabel('Cost (AUD)').fill('1000');
  await page.getByLabel('First used or installed ready for use').fill('2020-07-01');
  await page.getByRole('button', { name: 'Work out the deduction' }).click();
  const output = page.locator('#deduction-output');
  await expect(output).toContainText(
    'The life of ‘Electric scooters (e-scooters)’ was last set on 1 July 2022, after this start date.',
  );
  await page.getByLabel('First used or installed ready for use').fill('2023-07-01');
  await page.getByRole('button', { name: 'Work out the deduction' }).click();
  await expect(output.locator('.result-row').first()).toContainText('Decline in value for 2023-24');
  await expect(output).not.toContainText('was last set on');
  // A start after LI 2025/20 commenced may still follow a contract, acquisition or construction before it.
  await page.getByLabel('First used or installed ready for use').fill('2025-10-01');
  await page.getByRole('button', { name: 'Work out the deduction' }).click();
  await expect(output).toContainText(
    'LI 2025/20 commenced on 16 September 2025: for an asset contracted for, acquired or started to be constructed before then, subsection 40-95(2) can fix the life in an earlier determination.',
  );
});

test('a year the form accepts in another notation gives a link that restores it', async ({ page }) => {
  await page.goto(PAGE);
  await fillCalculator(page, { cost: '1500', life: '5', start: '2025-07-01', year: '2026.0', method: 'prime-cost' });
  const link = page.getByRole('link', { name: 'Link to this calculation' });
  await expect(link).toHaveAttribute('href', /&year=2026&/);
  await page.goto(/** @type {string} */ (await link.getAttribute('href')));
  await expect(page.locator('#deduction-output .result-row')).toHaveText([
    'Decline in value for 2025-26$300.00',
    'Value left at 30 June 2026$1,200.00',
  ]);
});

test('a section note that redirects the reader shows once with its results', async ({ page }) => {
  await page.goto(`${PAGE}?q=clay`);
  const note = page.locator('#finder-results .asset-place').filter({
    hasText: 'Note: Determinations for assets used in mining clay are shown under the Construction material mining',
  });
  await expect(note).toHaveCount(1);
});

test('without the data file the page says so and the calculator still works', async ({ page }) => {
  await page.route('**/effective-life.json', (route) => route.abort());
  await page.goto(PAGE);
  await expect(page.locator('#finder-status')).toHaveText(
    'The effective life tables could not be loaded. Reload the page, or open the data file linked under Source.',
  );
  // A search of tables that never arrived must not read as 'No row matches'.
  await page.getByLabel('Asset', { exact: true }).fill('laptop');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('#finder-status')).toHaveText(
    'The effective life tables could not be loaded. Reload the page, or open the data file linked under Source.',
  );
  await page.getByLabel('Cost (AUD)').fill('1500');
  await page.getByLabel('Effective life (years)').fill('5');
  await page.getByLabel('First used or installed ready for use').fill('2025-07-01');
  await page.getByRole('button', { name: 'Work out the deduction' }).click();
  await expect(page.locator('#deduction-output .result-row').first()).toHaveText('Decline in value for 2025-26$600.00');
});

test('figures never outlive the inputs they were worked from', async ({ page }) => {
  await page.goto(PAGE);
  const figures = page.locator('#deduction-output .result-row');
  const rows = page.locator('#deduction-schedule').getByRole('row');
  const submit = page.getByRole('button', { name: 'Work out the deduction' });
  await page.getByLabel('Cost (AUD)').fill('1500');
  await page.getByLabel('Effective life (years)').fill('5');
  await page.getByLabel('First used or installed ready for use').fill('2025-07-01');
  await submit.click();
  await expect(rows).toHaveCount(2);

  await page.getByLabel('Cost (AUD)').fill('2500');
  await expect(rows).toHaveCount(0);
  await expect(figures).toHaveCount(0);
  await submit.click();
  await expect(figures.first()).toHaveText('Decline in value for 2025-26$1,000.00');

  await page.getByLabel('Method').selectOption('prime-cost');
  await expect(rows).toHaveCount(0);
  await expect(figures).toHaveCount(0);
});

// The address is written 150 ms after typing stops, so the tables can arrive on either side of it.
for (const timerFirst of [false, true]) {
  test(`text typed before the tables arrive is kept and searched${timerFirst ? ', the address timer having run' : ''}`, async ({ page }) => {
    let release = () => {};
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/effective-life.json', async (route) => {
      await held;
      await route.continue();
    });
    if (timerFirst) await page.clock.install();
    await page.goto(`${PAGE}?industry=agriculture-forestry-and-fishing`, { waitUntil: 'commit' });
    await expect(page.locator('#finder-status')).toHaveText('Loading the effective life tables.');
    await page.getByLabel('Asset', { exact: true }).fill('tractor');
    if (timerFirst) {
      await page.clock.runFor(200);
      // Until the tables arrive the address keeps what it came with.
      await expect(page).toHaveURL(/\?industry=agriculture-forestry-and-fishing$/);
    }
    release();
    await expect(page.locator('#finder-status')).toHaveText('4 rows match ‘tractor’ in Agriculture, forestry and fishing and Table B.');
    await expect(page.getByLabel('Asset', { exact: true })).toHaveValue('tractor');
    await expect(page.getByLabel('Industry (Table A)')).toHaveValue('agriculture-forestry-and-fishing');
    await expect(page).toHaveURL(/\?q=tractor&industry=agriculture-forestry-and-fishing$/);
  });
}

test('text typed before the page script runs is kept and searched', async ({ page }) => {
  let release = () => {};
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/depreciation-rates-page.mjs', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`${PAGE}?q=fridge`, { waitUntil: 'commit' });
  await page.getByLabel('Asset', { exact: true }).fill('tractor');
  release();
  await expect(page.locator('#finder-status')).toContainText('‘tractor’');
  await expect(page.getByLabel('Asset', { exact: true })).toHaveValue('tractor');
  await expect(page).toHaveURL(/\?q=tractor$/);
});

/** Fills the calculator. @param {import('@playwright/test').Page} page
 * @param {{cost: string, life?: string, start: string, use?: string, method?: string, year?: string}} inputs */
async function fillCalculator(page, { cost, life, start, use, method, year }) {
  await page.getByLabel('Cost (AUD)').fill(cost);
  if (life) await page.getByLabel('Effective life (years)').fill(life);
  await page.getByLabel('First used or installed ready for use').fill(start);
  if (year) await page.getByLabel('Income year ending 30 June').fill(year);
  if (use) await page.getByLabel('Taxable use (%)').fill(use);
  if (method) await page.getByLabel('Method').selectOption(method);
  await page.getByRole('button', { name: 'Work out the deduction' }).click();
}

// ATO, Guide to depreciating assets 2026 (read 14 November 2026): Leo's $6,000 computer,
// used 50% for a taxable purpose, declines by $1,500; the deduction is $750 and its
// adjustable value on 30 June 2026 is $4,500. A 4 year life by prime cost gives the $1,500.
test('a taxable use percentage reduces the deduction and not the value, as the ATO example does', async ({ page }) => {
  await page.goto(PAGE);
  await fillCalculator(page, { cost: '6000', life: '4', start: '2025-07-01', use: '50', method: 'prime-cost' });
  const figures = page.locator('#deduction-output .result-row');
  await expect(figures).toHaveText([
    'Decline in value for 2025-26$1,500.00',
    'Deduction at 50% taxable use$750.00',
    'Value left at 30 June 2026$4,500.00',
  ]);
  await expect(page.locator('#deduction-schedule').getByRole('row')).toHaveText([
    /Income year\s*Days held\s*Opening value\s*Decline in value\s*Deduction at 50% taxable use\s*Closing value/,
    /2025-26\s*365\s*\$6,000\.00\s*\$1,500\.00\s*\$750\.00\s*\$4,500\.00/,
  ]);
  // A changed use clears figures worked from the old one.
  await page.getByLabel('Taxable use (%)').fill('150');
  await expect(figures).toHaveCount(0);
  await page.getByRole('button', { name: 'Work out the deduction' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter the taxable use as a percentage from 0 to 100, such as 100 or 62.5.');
  await expect(page.getByLabel('Taxable use (%)')).toBeFocused();
});

test('both methods side by side fit a phone and pass the accessibility scan', async ({ page }) => {
  await page.goto(PAGE);
  await fillCalculator(page, { cost: '1500', life: '5', start: '2025-07-01', method: 'both', year: '2027' });
  // Laura's photocopier from the ATO's guide: $300 by prime cost and $600 by diminishing value in 2025-26.
  await expect(page.locator('#deduction-output .result-row')).toHaveText([
    'Prime cost: decline in value for 2026-27$300.00',
    'Prime cost: value left at 30 June 2027$900.00',
    'Diminishing value: decline in value for 2026-27$360.00',
    'Diminishing value: value left at 30 June 2027$540.00',
  ]);
  await expect(page.locator('#deduction-schedule').getByRole('row')).toHaveText([
    /Income year\s*Days held\s*Prime cost: decline in value\s*Prime cost: closing value\s*Diminishing value: decline in value\s*Diminishing value: closing value/,
    /2025-26\s*365\s*\$300\.00\s*\$1,200\.00\s*\$600\.00\s*\$900\.00/,
    /2026-27\s*365\s*\$300\.00\s*\$900\.00\s*\$360\.00\s*\$540\.00/,
  ]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const name of ['Copy the citation', 'Copy the link', 'Download the schedule as CSV', 'Print the schedule']) {
    expect((await page.getByRole('button', { name }).boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
});

test('a citation and a link copy, and the link restores the calculation', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${PAGE}?q=photocopier`);
  await page.getByRole('button', { name: 'Use this life: 5 years, Photo copying machines' }).click();
  await fillCalculator(page, { cost: '1,500', start: '2025-07-01', use: '62.5' });
  const line = page.locator('#deduction-citation');
  await expect(line).toHaveText(new RegExp(
    '^Effective life 5 years, last updated 1 January 2001: ‘Photo copying machines’ \\(Table B / Office machines and equipment\\), '
    + 'Schedule 2 to the Income Tax Assessment \\(Effective Life of Depreciating Assets\\) Determination 2025 \\(LI 2025/20, F2025L01097\\), '
    + 'read on 13 November 2026\\. LI 2025/20 commenced on 16 September 2025, after this start date: '
    + 'check the life in the determination in force at the time subsection 40-95\\(2\\) fixes\\. Cost \\$1,500\\.00, first used or installed ready for use on 1 July 2025\\. '
    + 'Diminishing value: decline in value for 2025-26 \\$600\\.00, deduction at 62\\.5% taxable use \\$375\\.00\\. Working: http',
  ));
  await page.getByRole('button', { name: 'Copy the citation' }).click();
  await expect(page.locator('.schedule-actions [role="status"]')).toHaveText('Citation copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await line.textContent());
  await page.getByRole('button', { name: 'Copy the link' }).click();
  await expect(page.locator('.schedule-actions [role="status"]')).toHaveText('Link copied.');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(await page.getByRole('link', { name: 'Link to this calculation' }).getAttribute('href'));
  expect(link).toMatch(/\?cost=1%2C500&life=5&start=2025-07-01&year=2026&method=diminishing-value&use=62\.5#deduction$/);
  // The life came from LI 2025/20, which commenced after this start date, so the result says so.
  await expect(page.locator('#deduction-output')).toContainText('LI 2025/20 commenced on 16 September 2025, after this start date');

  await page.goto(link);
  await expect(page.getByLabel('Cost (AUD)')).toHaveValue('1,500');
  await expect(page.getByLabel('Taxable use (%)')).toHaveValue('62.5');
  await expect(page.locator('#deduction-output .result-row')).toHaveText([
    'Decline in value for 2025-26$600.00',
    'Deduction at 62.5% taxable use$375.00',
    'Value left at 30 June 2026$900.00',
  ]);
  // Opened without a row chosen, the life is not credited to the determination.
  await expect(line).toContainText('Effective life 5 years, entered for this working and not taken from a row of the determination.');
  // Once the tables arrive the address still holds the calculation, so it can be reloaded or shared.
  await expect(page.locator('#finder-status')).toHaveText('9,311 rows to search.');
  await expect(page).toHaveURL(link);
});

test('a link with a life and no cost or date fills the form and waits for them', async ({ page }) => {
  // The asset pages link here with the life alone.
  await page.goto(`${PAGE}?life=5&method=both#deduction`);
  await expect(page.getByLabel('Effective life (years)')).toHaveValue('5');
  await expect(page.getByLabel('Method')).toHaveValue('both');
  await expect(page.locator('#deduction-output')).toHaveText(
    'The link filled in the inputs it holds. Enter the rest and work out the deduction.',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Cost (AUD)')).not.toHaveAttribute('aria-invalid', 'true');
  await fillCalculator(page, { cost: '1500', start: '2025-07-01' });
  await expect(page.locator('#deduction-output .result-row').first()).toHaveText('Prime cost: decline in value for 2025-26$300.00');
});

test('a link the form cannot hold fills nothing and says why', async ({ page }) => {
  await page.goto(`${PAGE}?cost=10&method=straight-line#deduction`);
  await expect(page.locator('#deduction-output')).toHaveText(
    'The link’s method is not one the calculator offers. Enter the inputs and work out the deduction.',
  );
  await expect(page.getByLabel('Cost (AUD)')).toHaveValue('');
  // A link with an input blank names that field, and one it leaves out keeps the form's default.
  await page.goto(`${PAGE}?cost=1500&life=5&start=&year=2026&method=prime-cost#deduction`);
  await expect(page.getByRole('alert')).toHaveText('Enter a date.');
  await expect(page.getByLabel('First used or installed ready for use')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Taxable use (%)')).toHaveValue('100');
});

test('the schedule downloads as CSV from the keyboard and prints alone', async ({ page }) => {
  await page.goto(PAGE);
  await fillCalculator(page, { cost: '1500', life: '5', start: '2025-07-01', year: '2027' });
  await page.getByRole('button', { name: 'Download the schedule as CSV' }).focus();
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toBe('decline-in-value.csv');
  const { readFile } = await import('node:fs/promises');
  expect(await readFile(await download.path(), 'utf8')).toBe([
    'Year ending 30 June,Days held,Opening value,Decline in value,Closing value',
    '2026,365,1500.00,600.00,900.00',
    '2027,365,900.00,360.00,540.00',
    '',
  ].join('\r\n'));

  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printedWith = document.body.className;
    };
  });
  await page.getByRole('button', { name: 'Print the schedule' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-printed-with', /\bprint-schedule\b/);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#find')).toBeHidden();
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('#deduction-schedule table')).toBeVisible();
  await expect(page.locator('#deduction-citation')).toBeVisible();
  // Paper keeps the assumptions the figures rest on and the site's disclaimer.
  await expect(page.locator('#deduction > p').filter({ hasText: 'Income years end on 30 June.' })).toBeVisible();
  await expect(page.locator('.site-footer__legal')).toBeVisible();
  await expect(page.locator('#deduction > p').filter({ hasText: 'Choosing ‘Use this life’' })).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('body')).not.toHaveClass(/\bprint-schedule\b/);
  // Printing from the browser prints the whole page.
  await expect(page.locator('#find')).toBeVisible();
});
