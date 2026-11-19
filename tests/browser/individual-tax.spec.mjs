// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { test, expect } from '@playwright/test';
import { waitForCalculator } from './calculator-ready.mjs';

// Each individual tax calculator opens on the ATO's worked example, its first boundary case, already worked.
const CALCULATORS = { 'income-tax': '$510.00', 'take-home-pay': '$60,212.00', 'study-loan': '$2,527.80',
  'sole-trader': '$5,939.00', 'lump-sum-arrears': '$1,688.25', 'income-tests': '$73,810.00',
  'concessional-catch-up': '$97,500.00',
  'super-projection': '$539,266.80' };

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

test('lump sum in arrears gives no offset below the 10% test and refuses a non-resident or a termination payment offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/lump-sum-arrears/');
  const form = page.locator('#lump-sum-arrears form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel(/^Taxable income of that year/).fill('1000000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await expect(row('10% of normal taxable income less the arrears')).toHaveText('$98,900.00');
  await expect(row('Lump sum payment in arrears tax offset')).toHaveText('$0.00');
  await form.locator('[name="resident"][value="no"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText('This calculator works the offset only for a person resident in Australia for the '
    + 'whole of the year of receipt and each recent accrual year, taxed at the resident rates with the full tax-free threshold.');
  await form.locator('[name="resident"][value="yes"]').check();
  await form.locator('[name="other"][value="yes"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toContainText('This calculator does not work the offset when an employment termination payment');
});

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

test('income tests count section 57A benefits at 53% and refuse a person not resident all year offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/income-tests/');
  const form = page.locator('#income-tests form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByLabel(/^Reportable fringe benefits from employers exempt under section 57A/).fill('4567');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await expect(row('Adjusted fringe benefits total')).toHaveText('$6,980.00');
  await expect(row('Rebate income')).toHaveText('$73,650.00');
  await form.locator('[name="resident"][value="no"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(form.locator('output')).toHaveText(
    'This calculator works the measures only for a person resident in Australia for the whole year.');
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

test('super projection works one year and refuses salary sacrifice over the cap', async ({ page }) => {
  await page.goto('/tools/individual-tax/super-projection/');
  const form = page.locator('#super-projection form');
  await waitForCalculator(form);
  await form.getByLabel(/^Your age now/).fill('66');
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await calculate.click();
  await expect(row('Balance at 67 in future dollars')).toHaveText('$60,829.25');
  await expect(form.locator('output .result-row--principal strong')).toHaveText('$58,658.87');
  await expect(form.locator('output')).toContainText('not intended to be relied on');
  await form.getByLabel(/^Salary sacrifice/).fill('25000');
  await calculate.click();
  await expect(form.locator('output')).toContainText('above the $32,500 cap');
});

test('a GST-registered sole trader with no job keeps one share of each invoice for tax and GST', async ({ page }) => {
  await page.goto('/tools/individual-tax/sole-trader/');
  const form = page.locator('#sole-trader form');
  await waitForCalculator(form);
  await form.getByLabel(/^Business income for the year/).fill('90000');
  await form.getByLabel(/^Deductible business expenses/).fill('15000');
  await form.getByLabel(/^Wages from a job/).fill('0');
  await form.locator('input[name="gst"][value="yes"]').check();
  await form.getByLabel(/^GST credits for the year/).fill('1200');
  await form.getByLabel(/^One invoice, GST included/).fill('1100');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await expect(row('Small business income tax offset')).toHaveText('$1,000.00');
  await expect(row('GST on the business income')).toHaveText('$9,000.00');
  await expect(row('Share of each invoice, GST included, to set aside')).toHaveText('21.54%');
  await expect(row('From an invoice of $1,100.00, set aside')).toHaveText('$236.89');
  await expect(form.locator('output .result-row--principal strong')).toHaveText('$21,320.00');
});

test('a 2025-26 fortnightly pay with a loan shows both Schedule 8 components', async ({ page }) => {
  await page.goto('/tools/individual-tax/take-home-pay/');
  const form = page.locator('#take-home-pay form');
  await waitForCalculator(form);
  await form.getByLabel('A fortnight').check();
  await form.getByLabel(/^Salary for each pay period/).fill('3000');
  await form.locator('input[name="study-loan"][value="yes"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await expect(row('PAYG withheld each fortnight, with the study loan component')).toHaveText('$672.00');
  await expect(row('Refund estimate')).toHaveText('$74.00');
  await expect(form.locator('output .result-note')).toContainText('Pays before 24 September 2025 had $106.00 withheld');
});

for (const [id, name, input, expected] of [
  ['income-tax', 'estimate_income_tax', { incomeYear: '2026-27', residency: 'resident', taxableIncome: 90000,
    reportableFringeBenefits: 27000, daysWithoutHospitalCover: 365, taxWithheld: '21000' }, { refund: '510.00' }],
  ['take-home-pay', 'calculate_take_home_pay', { incomeYear: '2025-26', residency: 'resident', salary: '75000' },
    { takeHomeYear: '60212.00' }],
  ['sole-trader', 'calculate_sole_trader_set_aside', { incomeYear: '2026-27', businessIncome: '22000', businessExpenses: '2000',
    wages: '60000', invoice: '1000' }, { setAsideYear: '5939.00' }],
  ['income-tests', 'calculate_income_tests', { taxableIncome: 90000, reportableFringeBenefitsOther: 27000, assessableIncome: 90000 },
    { incomeForSurchargePurposes: '117000.00' }],
  ['super-projection', 'project_super_balance', { age: 66, balance: '50000', salary: 80000 }, { balanceAtRetirement: '60829.25' }],
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
