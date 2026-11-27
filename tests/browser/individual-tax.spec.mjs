// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { waitForCalculator } from './calculator-ready.mjs';

// Each individual tax calculator opens on the ATO's worked example, its first boundary case, already worked.
const CALCULATORS = { 'income-tax': '$510.00', 'take-home-pay': '$60,212.00', 'study-loan': '$2,527.80',
  'sole-trader': '$5,939.00', 'lump-sum-arrears': '$1,688.25', 'division-293': '$750.00', 'income-tests': '$73,810.00',
  'concessional-catch-up': '$97,500.00', 'bonus-withholding': '$641.00',
  'salary-packaging': '$5,291.50', 'novated-lease': '$6,047.48',
  'super-projection': '$539,266.80', fhss: '$14,350.00', 'work-expenses': '$590.00',
  'government-super': '$500.00', 'transfer-balance': '$26.80', 'pension-minimum': '$30,000.00',
  'residency-days': 'Met', 'lodgment-required': 'Yes', 'defined-benefit-income-cap': '$7,500.00',
  'foreign-pension-upp': '$11,217.05', 'scholarship-exemption': 'Yes', 'super-crystallisation': '$178,873.84', 'help-indexation': '$30,840.00' };

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
    if (id === 'government-super') await form.locator('#government-super-scope').selectOption('yes');
    if (id === 'fhss') {
      await form.locator('#fhss-scope').selectOption('yes');
      await form.locator('input[name=withholding-basis][value=unable]').check();
      await form.locator('#fhss-debt-offset').fill('0');
    }
    if (id === 'work-expenses') await form.locator('#work-expenses-scope').selectOption('yes');
    await form.getByRole('button', { name: id === 'scholarship-exemption' ? 'Check' : 'Calculate', exact: true }).click();
    await expect(output.locator('.result-example')).toHaveCount(0);
    expect(await output.evaluate((element) => element.textContent)).toBe(example);
    await page.reload();
    await waitForCalculator(form);
    if (id === 'residency-days') await form.locator('input[type=date]').first().fill('2025-07-02');
    else if (id === 'scholarship-exemption') await form.locator('input[name=full-time][value=no]').check();
    else await form.locator('input[type=number], input[inputmode=decimal]').first().fill('1');
    await expect(output).toHaveText('Enter the inputs and calculate.');
  });
}

test('FHSS separates the actual partial release and income year and works offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/fhss/');
  const form = page.locator('#fhss form');
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await waitForCalculator(form);
  await context.setOffline(true);
  await calculate.click();
  await expect(form.locator('#fhss-scope')).toBeFocused();
  await form.locator('#fhss-scope').selectOption('no');
  await form.locator('input[name=withholding-basis][value=actual]').check();
  await form.locator('#fhss-withholding').fill('340');
  await calculate.click();
  await expect(form.locator('output')).toHaveText('Confirm the scope conditions before calculating.');
  await form.locator('#fhss-scope').selectOption('yes');
  await form.locator('#fhss-non-concessional').fill('10000');
  await form.locator('#fhss-earnings').fill('1500');
  await form.locator('#fhss-requested').fill('15000');
  await form.locator('#fhss-release-requested').fill('2025-07-01');
  await form.locator('#fhss-actual').fill('12000');
  await calculate.click();
  await expect(row('Actual gross release')).toHaveText('$12,000.00');
  await expect(row('Assessable FHSS released amount')).toHaveText('$2,000.00');
  await expect(row('Income year of the release request')).toHaveText('2025-26');
  await expect(row('Amount paid to you')).toHaveText('Unknown');
  await expect(form.getByRole('button', { name: 'Print working' })).toBeVisible();
  await form.locator('#fhss-debt-offset').fill('1000');
  await expect(form.getByRole('button', { name: 'Print working' })).toBeHidden();
  await calculate.click();
  await expect(row('Amount paid to you')).toHaveText('$10,660.00');
});

test('FHSS switches to the ledger, keeps the discrepancy on printed working and stops at the verified quarter', async ({ page }) => {
  await page.goto('/tools/individual-tax/fhss/');
  const form = page.locator('#fhss form');
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  await waitForCalculator(form);
  await form.locator('#fhss-scope').selectOption('yes');
  await form.getByRole('radio', { name: 'Contribution ledger estimate' }).check();
  await expect(form.locator('#fhss-concessional')).toBeDisabled();
  await form.locator('#fhss-determined').fill('2024-01-02');
  await form.locator('#fhss-determination-requested').fill('2024-01-02');
  await form.locator('#fhss-contributions').fill('2024-01-01,7000,personal\n2024-01-02,7000,personal');
  await form.locator('input[name=withholding-basis][value=unable]').check();
  await calculate.click();
  await expect(form.locator('.result-row--principal strong')).toHaveText('$14,004.00');
  await expect(form.locator('table[data-results] tbody tr')).toHaveCount(2);
  await form.locator('#fhss-contributions').fill('2024-01-01,7000,employer_voluntary\n2024-01-02,10000,personal');
  await form.locator('#fhss-deductions').fill('2023-24,1000.00');
  await calculate.click();
  const working = form.locator('table[data-results]');
  await expect(working.locator('tbody tr')).toHaveCount(3);
  await expect(working.getByRole('row').filter({
    has: page.getByRole('rowheader', { name: '2024-01-01 · Salary sacrifice', exact: true }),
  })).toContainText('$6,000.00');
  await page.emulateMedia({ media: 'print' });
  await expect(form.locator('output')).toContainText(/\$7,859.*\$5,190.*difference remains unresolved/);
  await expect(form.locator('output')).toBeVisible();
  await expect(working).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await form.locator('#fhss-determined').fill('2027-01-01');
  await calculate.click();
  await expect(form.locator('output')).toContainText('through 31 December 2026');
  await expect(form.locator('table[data-results]')).toBeHidden();
});

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

test('the private health insurance rebate refunds at nil income, the zone questions follow the area, and a loading is refused offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/income-tax/');
  const form = page.locator('#income-tax form');
  await waitForCalculator(form);
  await context.setOffline(true);
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  // G1: nil income in 2025-26, $1,000 of premiums under code 30 and no rebate received: 24.288% is refunded.
  await form.locator('input[name=year][value="2025-26"]').check();
  await form.getByLabel('Taxable income (whole dollars)').fill('0');
  await form.getByLabel('Reportable fringe benefits total (whole dollars)').fill('0');
  await expect(form.locator('#income-tax-phi-lines')).toBeHidden();
  await form.locator('input[name=phi][value=yes]').check();
  await form.locator('#income-tax-phi-lines').fill('30 1000 0');
  await calculate.click();
  await expect(row('Private health insurance tax offset, refundable')).toHaveText('$242.88');
  // Overseas forces asks only for the days; a zone also asks about residence.
  await form.locator('input[name=zone][value=overseas_forces]').check();
  await expect(form.locator('#income-tax-zone-days')).toBeVisible();
  await expect(form.locator('#income-tax-zone-allowance')).toBeHidden();
  await form.locator('input[name=zone][value=zone_a]').check();
  await expect(form.locator('#income-tax-zone-allowance')).toBeVisible();
  await form.locator('input[name=zone][value=none]').check();
  await expect(form.locator('#income-tax-zone-days')).toBeHidden();
  await form.locator('input[name=phi-loading][value=yes]').check();
  await calculate.click();
  await expect(form.locator('output')).toContainText('Lifetime health cover loading is outside the rebate');
});

test('the net medical expenses offset works for a 2018-19 return beside the income tax calculator offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/income-tax/');
  const form = page.locator('#net-medical-expenses form');
  await waitForCalculator(form);
  await context.setOffline(true);
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await calculate.click();
  await expect(row('Net medical expenses tax offset')).toHaveText('$1,524.60');
  // A spouse's income is asked for only when married on 30 June, and counts with your own.
  await expect(form.getByLabel('Your spouse’s adjusted taxable income for rebates (dollars and cents)')).toBeHidden();
  await form.locator('input[name=nme-spouse][value=yes]').check();
  await form.getByLabel('Your adjusted taxable income for rebates (dollars and cents)').fill('100000');
  await form.getByLabel('Your spouse’s adjusted taxable income for rebates (dollars and cents)').fill('80001');
  await calculate.click();
  await expect(row('Net medical expenses tax offset')).toHaveText('$439.10');
  await expect(row('Threshold, family')).toHaveText('$180,000');
  await expect(form.locator('.sources-applied')).toBeVisible();
});

test('foreign income converts beside the income tax calculator, and the offset asks only for its limit method’s figures, offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/income-tax/');
  const fx = page.locator('#foreign-income-conversion form');
  await waitForCalculator(fx);
  await context.setOffline(true);
  const row = (form, label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await fx.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(row(fx, 'Australian dollars')).toHaveText('$8,843.04');
  // Each kind asks for its own dates.
  await expect(fx.getByLabel('Date derived')).toBeVisible();
  await fx.locator('input[name=fx-kind][value=deduction]').check();
  await expect(fx.getByLabel('Date derived')).toBeHidden();
  await expect(fx.getByLabel('Date it became deductible')).toBeVisible();
  const form = page.locator('#income-tax form');
  await expect(form.locator('#income-tax-fito-paid')).toBeHidden();
  await form.locator('input[name=fito][value=yes]').check();
  await expect(form.locator('#income-tax-fito-income')).toBeHidden();
  await form.locator('input[name=fito-method][value=worked]').check();
  await expect(form.locator('#income-tax-fito-income')).toBeVisible();
  await expect(form.locator('#income-tax-fito-payable')).toBeHidden();
  await form.locator('#income-tax-fito-paid').fill('5000');
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(row(form, 'Foreign income tax offset')).toHaveText('$2,970.00');
});

test('a minor’s unearned income is taxed beside the income tax calculator, with each ground’s facts asked only for it, offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/income-tax/');
  const form = page.locator('#minors-income form');
  await waitForCalculator(form);
  await context.setOffline(true);
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await calculate.click();
  await expect(row('Basic income tax')).toHaveText('$385.44');
  await expect(form.locator('input[name=mi-ft-4][value=yes]')).toBeHidden();
  await form.getByLabel('Excepted person').selectOption('full_time_occupation');
  await expect(form.locator('input[name=mi-dependent][value=yes]')).toBeHidden();
  await form.locator('input[name=mi-ft-4][value=yes]').check();
  await calculate.click();
  await expect(row('Basic income tax')).toHaveText('$385.44');
  await form.locator('input[name=mi-ft-4][value=no]').check();
  await calculate.click();
  await expect(row('Basic income tax')).toHaveText('$0.00');
  await form.getByLabel('Excepted person').selectOption('none');
  await form.getByLabel('Taxable income (whole dollars)', { exact: true }).fill('30000');
  await form.getByLabel('Employment income (dollars and cents)', { exact: true }).fill('28000');
  await form.getByLabel('Other assessable income (dollars and cents)', { exact: true }).fill('2000');
  await calculate.click();
  await expect(row('Basic income tax')).toHaveText('$2,468.00');
  await expect(form.locator('.sources-applied')).toBeVisible();
});

test('the sole trader page says whether a non-commercial loss is deferred, asking for an estimate only in a part year, offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/sole-trader/');
  const form = page.locator('#non-commercial-losses form');
  await waitForCalculator(form);
  await context.setOffline(true);
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await calculate.click();
  await expect(row('Deferred')).toHaveText('$1,000.00');
  const estimate = form.locator('#ncl-estimate');
  const otherIncome = form.locator('#ncl-other-income');
  await expect(estimate).toBeHidden();
  await expect(otherIncome).toBeHidden();
  await form.locator('input[name=ncl-part-year][value=yes]').check();
  await form.locator('#ncl-income').fill('8000');
  await estimate.fill('22000');
  await calculate.click();
  await expect(row('Deductible this year')).toHaveText('$2,000.00');
  await form.locator('input[name=ncl-part-year][value=no]').check();
  await expect(estimate).toBeHidden();
  await form.locator('input[name=ncl-activity][value=primary_production]').check();
  await otherIncome.fill('39999.99');
  await calculate.click();
  await expect(row('Deferred')).toHaveText('$0.00');
  await expect(form.locator('.sources-applied')).toBeVisible();
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

test('take-home pay shows only the chosen schedule’s questions and works Schedule 14 beside the year offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/take-home-pay/');
  const form = page.locator('#take-home-pay form');
  await waitForCalculator(form);
  const agreed = form.locator('fieldset[data-show-values="sch14"]');
  await expect(agreed).toBeHidden();
  await context.setOffline(true);
  await form.getByLabel('2026-27').check();
  await form.getByLabel('A fortnight').check();
  await form.locator('input[name="withholding-schedule"][value="sch14"]').check();
  await expect(agreed).toBeVisible();
  await expect(form.locator('fieldset[data-show-values="sch6"]')).toBeHidden();
  await form.locator('#take-home-ws-payment').fill('1299.30');
  await form.locator('#take-home-ws-offsets').fill('1645');
  await form.locator('#take-home-ws-additional').fill('20');
  await form.locator('input[name="ws-exemption"][value="full"]').check();
  await form.getByRole('button', { name: 'Calculate', exact: true }).click();
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await expect(row('Schedule 14: amount to withhold')).toHaveText('$43.00');
});

test('take-home pay uses the supplied salary dates for super', async ({ page }) => {
  await page.goto('/tools/individual-tax/take-home-pay/');
  const form = page.locator('#take-home-pay form');
  await waitForCalculator(form);
  await form.getByLabel(/^Salary for each pay period/).fill('260000');
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  await calculate.click();
  await expect(form.locator('output')).toContainText('Estimated employer super guarantee');
  await expect(form.locator('output')).toContainText('$30,000.00');
  await form.getByText('Use dated earnings for super', { exact: true }).click();
  const payments = form.getByLabel('Dated payments (optional)', { exact: true });
  await payments.fill('2025-09-30 70000 70000\n2025-10-01 60000 60000\n2026-01-01 70000 70000\n2026-04-01 60000 60000');
  await calculate.click();
  await expect(form.locator('output')).toContainText('Employer super guarantee from dated earnings');
  await expect(form.locator('output')).toContainText('$29,400.00');
  await expect(form.locator('output')).toContainText('tax and PAYG estimates use the salary and sacrifice inputs');
  await payments.fill('2025-09-30 70000 70000');
  await calculate.click();
  await expect(form.locator('output')).toContainText('Dated gross payments must add up to the salary for the year.');
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

test('salary packaging works the ATO’s FBT example and the hospital cap', async ({ page }) => {
  await page.goto('/tools/individual-tax/salary-packaging/');
  const form = page.locator('#salary-packaging form');
  await waitForCalculator(form);
  await form.getByLabel(/^Salary for the year/).fill('80000');
  await form.getByLabel(/^Benefits your employer gets no GST credit for/).fill('9000');
  await form.getByLabel(/^Benefits your employer claims a GST credit for/).fill('7700');
  await form.getByLabel(/^Salary packaged meal entertainment/).fill('3300');
  await form.getByLabel('No: Type 2').check();
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await calculate.click();
  await expect(row('Grossed-up amount liable to FBT')).toHaveText('$4,226.00');
  await expect(row('FBT on it at 47%')).toHaveText('$1,986.22');
  await form.getByLabel('A public or not-for-profit hospital').check();
  await calculate.click();
  await expect(row('Cap for a hospital or ambulance service')).toHaveText('$17,000.00');
  await expect(row('FBT on it at 47%')).toHaveText('$8,096.22');
});

test('novated lease names the exemption condition a plug-in hybrid fails, applies it under a commitment, then refuses it for luxury car tax at another supply', async ({ page }) => {
  await page.goto('/tools/individual-tax/novated-lease/');
  const form = page.locator('#novated-lease form');
  await waitForCalculator(form);
  await form.getByLabel('Plug-in hybrid', { exact: true }).check();
  await form.getByLabel(/^Date the car was first held and used/).fill('2024-07-01');
  await form.getByRole('group', { name: /first retail sale/ }).getByLabel('2024-25').check();
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await calculate.click();
  await expect(row('Electric car exemption')).toHaveText(/only under a commitment/);
  await expect(form.locator('output .result-row--principal strong')).toHaveText('$1,465.69');
  await form.getByRole('group', { name: /^Plug-in hybrid only/ }).getByLabel('Yes').check();
  await calculate.click();
  await expect(row('Electric car exemption')).toHaveText('applies');
  await expect(form.locator('output .result-row--principal strong')).toHaveText('$6,047.48');
  await form.getByRole('group', { name: /other supply of the car/ }).getByLabel('Yes').check();
  await calculate.click();
  await expect(form.locator('output')).toContainText('This calculator needs one treatment for the year.');
  await form.getByLabel('After all those benefits').check();
  await calculate.click();
  await expect(row('Electric car exemption')).toHaveText('applies');
  await form.getByLabel('Before all those benefits').check();
  await calculate.click();
  await expect(row('Electric car exemption')).toHaveText(/another supply or an importation/);
  await expect(form.locator('output .result-row--principal strong')).toHaveText('$1,465.69');
});

test('novated lease accepts first use on 31 March and refuses first use on 1 April offline', async ({ page, context }) => {
  await page.goto('/tools/individual-tax/novated-lease/');
  const form = page.locator('#novated-lease form');
  await waitForCalculator(form);
  await context.setOffline(true);
  await form.getByRole('group', { name: 'Income year' }).getByLabel('2025-26').check();
  await form.getByLabel(/^Days of private use or availability/).fill('1');
  const date = form.getByLabel(/^Date the car was first held and used/);
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  await date.fill('2026-03-31');
  await calculate.click();
  await expect(form.locator('output')).toContainText('$32.88');
  await date.fill('2026-04-01');
  await calculate.click();
  await expect(form.locator('output')).toContainText('The car was first held and used after 31 March 2026');
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

test('Division 293 leaves out the excess over the cap until unused cap carried forward covers it', async ({ page }) => {
  await page.goto('/tools/individual-tax/division-293/');
  const form = page.locator('#division-293 form');
  await waitForCalculator(form);
  await form.getByLabel(/^Taxable income/).fill('210000');
  await form.getByLabel(/^Reportable fringe benefits/).fill('33000');
  await form.getByLabel(/^Concessional contributions/).fill('45000');
  await form.getByLabel(/^Unused concessional cap/).fill('20000');
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  const row = (label) => form.locator('output .result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await calculate.click();
  await expect(row('Excess concessional contributions')).toHaveText('$12,500.00');
  await expect(form.locator('output .result-row--principal strong')).toHaveText('$3,825.00');
  await form.getByLabel('Under $500,000').check();
  await calculate.click();
  await expect(row('Unused cap carried forward that raises it')).toHaveText('$12,500.00');
  await expect(form.locator('output .result-row--principal strong')).toHaveText('$5,700.00');
  await form.getByLabel('A defined benefit interest').check();
  await calculate.click();
  await expect(form.locator('output')).toContainText('Subdivisions 293-D to 293-F');
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
  ['salary-packaging', 'calculate_salary_packaging', { incomeYear: '2026-27', residency: 'resident', employer: 'charity',
    salary: 80000, typeOneBenefits: '7700', typeTwoBenefits: '9000', mealEntertainment: '3300', mealEntertainmentTypeOne: false },
    { fbt: '1986.22' }],
  ['novated-lease', 'calculate_novated_lease', { incomeYear: '2026-27', residency: 'resident', salary: 100000, car: 'bev',
    firstHeldAndUsed: '2026-04-01', firstSaleYear: '2025-26', costPrice: '60000', daysAvailable: 365, costsWithGst: '15000',
    costsWithoutGst: '1000' }, { statutoryValue: '12000.00' }],
  ['bonus-withholding', 'calculate_bonus_withholding', { payPeriod: 'fortnight', residency: 'resident', method: 'B',
    earnings: '1800', additionalPayment: '2480', earningsToDate: '18000', paysToDate: 10 }, { totalWithheld: '992.00' }],
  ['sole-trader', 'calculate_sole_trader_set_aside', { incomeYear: '2026-27', businessIncome: '22000', businessExpenses: '2000',
    wages: '60000', invoice: '1000' }, { setAsideYear: '5939.00' }],
  ['division-293', 'calculate_division_293_tax', { incomeYear: '2026-27', accumulationOnly: true, taxableIncome: 300000,
    concessionalContributions: '25000' }, { division293Tax: '3750.00' }],
  ['income-tests', 'calculate_income_tests', { taxableIncome: 90000, reportableFringeBenefitsOther: 27000, assessableIncome: 90000 },
    { incomeForSurchargePurposes: '117000.00' }],
  ['super-projection', 'project_super_balance', { age: 66, balance: '50000', salary: 80000 }, { balanceAtRetirement: '60829.25' }],
  ['study-loan', 'calculate_study_loan_repayment', { incomeYear: '2026-27', taxableIncome: 60470, reportableFringeBenefits: 5400,
    totalNetInvestmentLoss: 1330, reportableSuperContributions: 16500, exemptForeignEmploymentIncome: 2680 },
  { compulsoryRepayment: '2527.80' }],
  ['concessional-catch-up', 'calculate_concessional_catch_up', { incomeYear: '2024-25', totalSuperBalance: '450000',
    concessionalContributions: '97500', earlierYears: [
      { year: '2019-20', contributions: '11000' }, { year: '2020-21', contributions: '12000' },
      { year: '2021-22', contributions: '13000' }, { year: '2022-23', contributions: '14000' },
      { year: '2023-24', contributions: '15000' },
    ] }, { availableCap: '97500.00' }],
  ['lump-sum-arrears', 'calculate_lump_sum_arrears', { receiptYear: '2025-26', taxableIncome: 100000,
    australianResidentAllYears: true, accrualYears: [
      { year: '2023-24', arrears: 3000, taxableIncome: 30000 }, { year: '2022-23', arrears: 2500, taxableIncome: 17000 },
      { year: '2021-22', arrears: 1400 }, { year: '2020-21', arrears: 1700 },
      { year: '2019-20', arrears: 1400 }, { year: '2018-19', arrears: 1000 },
    ] }, { offset: '1688.25' }],
  ['fhss', 'calculate_fhss_release', { mode: 'stated', scopeConfirmed: true, determinationDate: '2025-06-20',
    concessional: '8500', nonConcessional: '5000', associatedEarnings: '850', withholdingBasis: 'unable', debtOffset: '0' },
  { maximumReleaseAmount: '14350.00' }],
  ['work-expenses', 'calculate_work_expenses', { method: 'home_office', incomeYear: '2025-26', scopeConfirmed: true,
    hours: '843', runningExpensesIncurred: true }, { amounts: { fixed_rate_return_amount: '590.00' } }],
  ['government-super', 'calculate_government_super_amounts', { incomeYear: '2023-24', scopeConfirmed: true,
    residency: 'full_year_resident', assessableIncome: 35000, taxableIncome: 35000, eligibleIncome: '35000',
    personalContributions: '1040', returnLodged: true, under71: true, nonConcessionalWithinCap: 'yes',
    totalSuperBalanceBelowCap: 'yes' }, { amounts: { co_contribution_paid: '500.00' } }],
  ['lodgment-required', 'check_lodgment_required', { incomeYear: '2025-26', residency: 'whole_year', taxableIncome: '18200.01',
    dividendsAndFrankingCredits: '0' }, { lodgmentRequired: true, dueDate: '2026-10-31' }],
  ['pension-minimum', 'calculate_pension_minimum', { incomeYear: '2026-27', accountBalance: '600000', age: 67 },
    { minimumPayment: '30000.00' }],
  ['transfer-balance', 'calculate_transfer_balance', { calculation: 'concessional_charge', incomeYear: '2020-21',
    additionalTax: '1000', taxDueDate: '2021-12-01' }, { excessConcessionalContributionsCharge: '44.17' }],
  ['residency-days', 'calculate_residency_days', { incomeYear: '2025-26', usualPlaceOfAbodeOutsideAustralia: false,
    intendsToTakeUpResidence: false, periods: [{ arrival: '2025-07-01', departure: '2025-09-30' },
      { arrival: '2025-11-15', departure: '2026-03-31' }] }, { daysInAustralia: 229, test183Met: true }],
  ['help-indexation', 'calculate_help_indexation', { incomeYear: '2025-26', previousAccumulatedDebt: '30000' },
    { indexationDate: '2026-06-01' }],
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

test('work expenses switches method and year, shows only their inputs and refuses an expired log book', async ({ page }) => {
  await page.goto('/tools/individual-tax/work-expenses/');
  const form = page.locator('#work-expenses form');
  const output = form.locator('output');
  const row = (label) => output.locator('.result-row').filter({ hasText: label }).locator('strong');
  await waitForCalculator(form);
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  // Unconfirmed figures are refused, and the select takes focus.
  await calculate.click();
  await expect(form.locator('#work-expenses-scope')).toBeFocused();
  await form.locator('#work-expenses-scope').selectOption('yes');
  // 2021-22 shows the dedicated home office question; the 52c rate, the shortcut and actual cost all appear.
  await form.locator('input[name=year][value="2021-22"]').check();
  await expect(form.locator('input[name=dedicated][value=yes]')).toBeVisible();
  await form.locator('#work-expenses-hours').fill('1000');
  await form.locator('#work-expenses-phone').fill('120');
  await calculate.click();
  await expect(row('Fixed rate method')).toHaveText('$640.00');
  await expect(row('Higher method, cents disregarded')).toHaveText('$800.00');
  // Johan's 2,514 km at 88c in 2025-26.
  await form.locator('input[name=year][value="2025-26"]').check();
  await form.locator('input[name=method][value=car_cents_per_kilometre]').check();
  await expect(form.locator('#work-expenses-hours')).toBeHidden();
  await expect(form.locator('#work-expenses-total-kilometres')).toBeHidden();
  await calculate.click();
  await expect(row('Deduction, cents disregarded')).toHaveText('$2,212.00');
  // A log book from 2020-21 does not serve 2025-26 (s 28-115(2)).
  await form.locator('input[name=method][value=car_log_book]').check();
  await form.locator('#work-expenses-log-book-year').fill('2020-21');
  await calculate.click();
  await expect(output).toContainText('serves that year and the next 4 only');
  // Self-education in 2021-22 asks whether the course is prescribed and takes category E.
  await form.locator('input[name=method][value=self_education]').check();
  await form.locator('input[name=year][value="2021-22"]').check();
  await expect(form.locator('#work-expenses-category-e')).toBeVisible();
  await calculate.click();
  await expect(row('Deduction, cents disregarded')).toHaveText('$40.00');
});

test('transfer balance shows the account’s tables, and the charge and the release on request', async ({ page }) => {
  await page.goto('/tools/individual-tax/transfer-balance/');
  const form = page.locator('#transfer-balance form');
  const output = form.locator('output');
  await waitForCalculator(form);
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  await calculate.click();
  await expect(output.locator('.result-row--principal strong')).toHaveText('$26.80');
  const periods = form.locator('table[data-results="tba-periods"]');
  await expect(periods).toBeVisible();
  await expect(periods.locator('tbody tr').first().locator('td').last()).toHaveText('$26.80');
  await expect(form.locator('table[data-results="tba-ledger"] tbody tr').nth(1).locator('td').last()).toHaveText('−$30,000.00');
  // A 4th event: $20,000 commuted on 1 November 2019 leaves no excess at the last day.
  await form.locator('#transfer-balance-event-4-date').fill('2019-11-01');
  await form.locator('#transfer-balance-event-4-kind').selectOption('commutation');
  await form.locator('#transfer-balance-event-4-amount').fill('20000');
  await calculate.click();
  await expect(output.locator('.result-row').filter({ has: page.getByText('Excess transfer balance', { exact: true }) }).locator('strong')).toHaveText('$0.00');
  await form.locator('[name="calc"][value="charge"]').check();
  await expect(form.locator('#transfer-balance-event-1-date')).toBeHidden();
  await calculate.click();
  await expect(output.locator('.result-row--principal strong')).toHaveText('$44.17');
  await form.locator('[name="calc"][value="release"]').check();
  await calculate.click();
  await expect(output.locator('.result-row--principal strong')).toHaveText('$112,463.55');
  await form.locator('#transfer-balance-release-year').selectOption('2020-21');
  await form.locator('#transfer-balance-determination-date').fill('2020-06-30');
  await calculate.click();
  await expect(output).toContainText('on or after 1 July of the contributions year');
});

test('pension minimum pro-rates a first year from the start day and refuses a day outside the year', async ({ page }) => {
  await page.goto('/tools/individual-tax/pension-minimum/');
  const form = page.locator('#pension-minimum form');
  const output = form.locator('output');
  await waitForCalculator(form);
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  await form.locator('[name="year"][value="2024-25"]').check();
  await form.locator('#pension-minimum-balance').fill('250000');
  await form.locator('#pension-minimum-age').fill('66');
  await form.locator('#pension-minimum-started').fill('2025-01-01');
  await calculate.click();
  await expect(output.locator('.result-row--principal strong')).toHaveText('$6,200.00');
  await expect(output).toContainText('181 of 365');
  await form.locator('#pension-minimum-started').fill('2025-07-01');
  await calculate.click();
  await expect(output).toHaveText('Enter a start day from 1 July 2024 to 30 June 2025, or leave it blank.');
});

test('government super shows the spouse inputs on request and refuses a temporary visa and an unknown balance', async ({ page }) => {
  await page.goto('/tools/individual-tax/government-super/');
  const form = page.locator('#government-super form');
  const output = form.locator('output');
  const row = (label) => output.locator('.result-row').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
  await waitForCalculator(form);
  const calculate = form.getByRole('button', { name: 'Calculate', exact: true });
  // Unconfirmed answers are refused, and the select takes focus.
  await calculate.click();
  await expect(form.locator('#government-super-scope')).toBeFocused();
  await form.locator('#government-super-scope').selectOption('yes');
  // The taper: $50,000 in 2025-26 and $1,000 of personal contributions give $416.28, paid as $416.30.
  await form.locator('input[name=year][value="2025-26"]').check();
  for (const id of ['assessable', 'taxable', 'eligible']) await form.locator(`#government-super-${id}`).fill('50000');
  await form.locator('#government-super-personal').fill('1000');
  await calculate.click();
  await expect(row('Super co-contribution')).toHaveText('$416.28');
  await expect(row('Co-contribution paid, up to 5 cents')).toHaveText('$416.30');
  // The spouse's inputs appear only on request: $39,999 of spouse income leaves 18% of $1.
  await expect(form.locator('#government-super-spouse-assessable')).toBeHidden();
  await form.locator('input[name=spouse][value=yes]').check();
  await form.locator('#government-super-spouse-assessable').fill('39999');
  await calculate.click();
  await expect(row('Spouse contribution tax offset')).toHaveText('$0.18');
  // A balance answer of not known that decides the co-contribution is refused.
  await form.locator('input[name=balance][value=unknown]').check();
  await calculate.click();
  await expect(output).toContainText('was not given');
  await form.locator('input[name=balance][value=yes]').check();
  await form.locator('input[name=visa][value=yes]').check();
  await calculate.click();
  await expect(output).toContainText('New Zealand citizens');
});
