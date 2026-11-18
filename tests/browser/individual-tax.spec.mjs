// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { test, expect } from '@playwright/test';
import { waitForCalculator } from './calculator-ready.mjs';

// Each individual tax calculator opens on the ATO's worked example, its first boundary case, already worked.
const CALCULATORS = { 'income-tax': '$510.00', 'take-home-pay': '$60,212.00', 'study-loan': '$2,527.80',
  'concessional-catch-up': '$97,500.00' };

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
    await waitForCalculator(form);
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
    await waitForCalculator(form);
    await form.locator('input[type=number]').first().fill('1');
    await expect(output).toHaveText('Enter the inputs and calculate.');
  });
}

test('catch-up carries nothing forward at a $500,000 balance and refuses a defined benefit interest offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/concessional-catch-up/');
  const form = page.locator('#concessional-catch-up form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel(/^Total super balance on 30 June before the year/).fill('500000');
  await form.getByLabel(/^Concessional contributions for the year so far/).fill('40000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await expect(row('Concessional cap available')).toHaveText('$30,000.00');
  await expect(row('Excess concessional contributions')).toHaveText('$10,000.00');
  await expect(row('2019-20 unused cap left, lapses after 2024-25')).toHaveText('$14,000.00');
  await form.locator('[name="defined-benefit"][value="yes"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText(
    'A defined benefit interest changes what counts as concessional contributions (ITAA 1997 Subdivision 291-C); this calculator does not cover it.');
});

test('a foreign resident pays no Medicare levy or surcharge and gets no offset', async ({ page }) => {
  await page.goto('/tools/individual-tax/income-tax/');
  const form = page.locator('#income-tax form');
  await waitForCalculator(form);
  await form.getByLabel('Foreign resident').check();
  await form.getByLabel('Taxable income (whole dollars)').fill('100000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await expect(row('Total tax, levies and repayment')).toHaveText('$30,000.00');
  await expect(row('Amount owing estimate')).toHaveText('$9,000.00');
  await expect(form.locator('output .result-note')).toHaveText(
    'A foreign resident gets no low income tax offset and pays no Medicare levy or surcharge.');
});

test('a 2026-27 fortnightly pay shows PAYG withheld beside the year spread evenly', async ({ page }) => {
  await page.goto('/tools/individual-tax/take-home-pay/');
  const form = page.locator('#take-home-pay form');
  await waitForCalculator(form);
  await form.getByLabel('2026-27').check();
  await form.getByLabel('A fortnight').check();
  await form.getByLabel(/^Salary for each pay period/).fill('3000');
  await form.getByLabel(/^Salary sacrificed to super/).fill('200');
  await form.locator('input[name="study-loan"][value="yes"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await expect(row('PAYG withheld each fortnight, with the study loan component')).toHaveText('$554.00');
  await expect(row('Pay after withholding each fortnight')).toHaveText('$2,246.00');
  await expect(row('Amount owing estimate')).toHaveText('$212.80');
  await expect(form.locator('output .result-row--principal strong')).toHaveText('$58,183.20');
});

for (const [id, name, input, expected] of [
  ['income-tax', 'estimate_income_tax', { incomeYear: '2026-27', residency: 'resident', taxableIncome: 90000,
    reportableFringeBenefits: 27000, daysWithoutHospitalCover: 365, taxWithheld: '21000' }, { refund: '510.00' }],
  ['take-home-pay', 'calculate_take_home_pay', { incomeYear: '2025-26', residency: 'resident', salary: '75000' },
    { takeHomeYear: '60212.00' }],
]) {
  test(`${id} registers ${name} where the browser offers modelContext`, async ({ page }) => {
    await page.addInitScript(() => {
      window.registeredTools = [];
      Object.defineProperty(document, 'modelContext', {
        value: { registerTool: async (tool) => { window.registeredTools.push(tool); } },
      });
    });
    await page.goto(`/tools/individual-tax/${id}/`);
    await page.waitForFunction(() => window.registeredTools.length === 1);
    const result = await page.evaluate(async (args) => {
      const [tool] = window.registeredTools;
      return { name: tool.name, readOnly: tool.annotations.readOnlyHint, output: await tool.execute(args) };
    }, input);
    expect(result).toMatchObject({ name, readOnly: true, output: expected });
  });
}
