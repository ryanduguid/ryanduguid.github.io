// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { test, expect } from '@playwright/test';

// Each individual tax calculator opens on the ATO's worked example, its first boundary case, already worked.
const CALCULATORS = { 'income-tax': '$1,126.90', 'take-home-pay': '$60,212.00', 'study-loan': '$2,527.80' };

test.describe('before any script runs', () => {
  test.use({ javaScriptEnabled: false });
  test('every individual tax calculator arrives with its worked example', async ({ page }) => {
    for (const [id, principal] of Object.entries(CALCULATORS)) {
      await page.goto(`/tools/individual-tax/${id}/`);
      const output = page.locator(`#${id} output`);
      await expect(output.locator('.result-example'), id).toHaveText(
        'Fictional example: the first boundary case below. Change the inputs and calculate your own.');
      await expect(output.locator('.result-row--principal strong'), id).toHaveText(principal);
    }
  });
});

for (const id of Object.keys(CALCULATORS)) {
  test(`${id} keeps its served example at load, Calculate agrees, and an edit replaces it`, async ({ page }) => {
    const response = await page.goto(`/tools/individual-tax/${id}/`);
    const served = (await response.text()).match(/<output aria-live="polite" data-example>([\s\S]*?)<\/output>/)[1];
    const form = page.locator(`#${id} form`);
    const output = form.locator('output');
    await expect(form.locator('fieldset').first()).toBeEnabled();
    expect(await output.evaluate((element) => element.innerHTML)).toBe(served);
    const example = await output.evaluate((element) => {
      const copy = element.cloneNode(true);
      copy.querySelector('.result-example').remove();
      return copy.textContent;
    });
    await form.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(output.locator('.result-example')).toHaveCount(0);
    expect(await output.evaluate((element) => element.textContent)).toBe(example);
    await page.reload();
    await expect(form.locator('fieldset').first()).toBeEnabled();
    await form.locator('input[type=number]').first().fill('1');
    await expect(output).toHaveText('Enter the inputs and calculate.');
  });
}

test('a foreign resident pays no Medicare levy and gets no offset', async ({ page }) => {
  await page.goto('/tools/individual-tax/income-tax/');
  const form = page.locator('#income-tax form');
  await expect(form.locator('fieldset').first()).toBeEnabled();
  await form.getByLabel('Foreign resident').check();
  await form.getByLabel('Taxable income (whole dollars)').fill('100000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output .result-row--principal strong')).toHaveText('$30,000.00');
  await expect(form.locator('output .result-note')).toHaveText(
    'A foreign resident gets no low income tax offset and pays no Medicare levy.');
});
