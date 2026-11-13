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

test('a life set after the start date is flagged, and a later start is not', async ({ page }) => {
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
