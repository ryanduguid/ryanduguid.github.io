// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { test, expect } from '@playwright/test';
import { waitForCalculator } from './calculator-ready.mjs';

// Each individual tax calculator opens on the ATO's worked example, its first boundary case, already worked.
const CALCULATORS = { 'income-tax': '$510.00', 'take-home-pay': '$60,212.00', 'study-loan': '$2,527.80',
  'bonus-withholding': '$641.00' };

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

test('Method B works a back payment over 2 years by B(i) and B(ii), as the ATO’s example 4 does', async ({ page }) => {
  await page.goto('/tools/individual-tax/bonus-withholding/');
  const form = page.locator('#bonus-withholding form');
  await waitForCalculator(form);
  await form.getByLabel('Monthly').check();
  await form.getByLabel(/^Gross earnings this pay/).fill('7000');
  await form.getByLabel('Method B: B(i) for back pay').check();
  await form.getByLabel(/^Bonus, commission or other additional payment/).fill('8800');
  for (const [label, amount] of [[/^Earlier pays this year it covers/, '2'], [/^Back payment for each/, '800'],
    [/^Earnings each of those pays/, '6200'], [/^Withheld from each of those pays/, '1257'],
    [/^Normal earnings this year to date/, '19400'], [/^Pays this year to date/, '3']]) {
    await form.getByLabel(label).fill(amount);
  }
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await expect(row('Less what was withheld, times 2 pays (B(i) steps 4 and 5)')).toHaveText('$754.00');
  await expect(row('Withheld from the payment, the lesser (B(ii) step 10)')).toHaveText('$4,104.00');
  await expect(form.locator('output .result-row--principal strong')).toHaveText('$6,492.00');
});

for (const [id, name, input, expected] of [
  ['income-tax', 'estimate_income_tax', { incomeYear: '2026-27', residency: 'resident', taxableIncome: 90000,
    reportableFringeBenefits: 27000, daysWithoutHospitalCover: 365, taxWithheld: '21000' }, { refund: '510.00' }],
  ['take-home-pay', 'calculate_take_home_pay', { incomeYear: '2025-26', residency: 'resident', salary: '75000' },
    { takeHomeYear: '60212.00' }],
  ['bonus-withholding', 'calculate_bonus_withholding', { payPeriod: 'fortnight', residency: 'resident', method: 'B',
    earnings: '1800', additionalPayment: '2480', earningsToDate: '18000', paysToDate: 10 }, { totalWithheld: '992.00' }],
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
