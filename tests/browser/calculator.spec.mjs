import { expect, test } from '@playwright/test';

import { COAL_LSL_PROOF } from '../../scripts/coal-lsl-proof-fixture.mjs';
import { observePageHealth } from './health.mjs';
import { gotoForVisualSnapshot, waitForVisualFonts } from './visual.mjs';

async function calculateFormulaB(page, { visualSnapshot = false } = {}) {
  if (visualSnapshot) {
    await gotoForVisualSnapshot(page, '/tools/coal-lsl-levy/');
  } else {
    await page.goto('/tools/coal-lsl-levy/');
    await waitForVisualFonts(page);
  }
  const baseRateBranch = page.getByRole('radio', {
    name: 'A base rate of pay (section 3B(1))',
    exact: true,
  });
  await baseRateBranch.check();
  await expect(baseRateBranch).toBeChecked();
  await page
    .getByRole('spinbutton', { name: 'Base rate of pay', exact: true })
    .fill(COAL_LSL_PROOF.inputs.baseRate);
  await page.getByLabel('Overtime and penalty rates')
    .fill(COAL_LSL_PROOF.inputs.overtimeAndPenalties);
  await page.getByLabel('Allowances, excluding expense reimbursements')
    .fill(COAL_LSL_PROOF.inputs.allowances);
  await page.getByLabel('Salary sacrificed amount')
    .fill(COAL_LSL_PROOF.inputs.salarySacrifice);
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
}

test('calculates a Formula B levy without browser errors', async ({ page }) => {
  const health = observePageHealth(page);

  await calculateFormulaB(page);

  const result = page.getByRole('status');
  await expect(result.locator('[data-result-kind="formula-b"]'))
    .toContainText(COAL_LSL_PROOF.expected.formulaB);
  await expect(result.locator('[data-result-kind="eligible-wages"]'))
    .toContainText(COAL_LSL_PROOF.expected.eligibleWages);
  await expect(result.locator('[data-result-kind="levy"]'))
    .toContainText(COAL_LSL_PROOF.expected.levy);
  await expect(result.locator('[data-result-kind="branch"]'))
    .toContainText(COAL_LSL_PROOF.expected.branch);
  await expect(result.locator('.result-why'))
    .toContainText(COAL_LSL_PROOF.expected.explanation);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(0);
  health.assertHealthy();
});

test('calculator orientation and result render as an inspectable ledger', async ({ page }) => {
  const health = observePageHealth(page);
  await calculateFormulaB(page);

  const method = page.locator('.calculator-method');
  await expect(method).toContainText('2.7 per cent');
  await expect(method).toContainText('28 August 2026');
  await expect(method).toContainText('Section 3B branch test');
  await expect(method).toContainText('Estimate only');

  const result = page.getByRole('status');
  const rows = result.locator('.result-row');
  await expect(rows).toHaveCount(6);
  await expect(result.locator('[data-result-kind="eligible-wages"]'))
    .toContainText(COAL_LSL_PROOF.expected.eligibleWages);
  await expect(result.locator('[data-result-kind="levy"]'))
    .toContainText(COAL_LSL_PROOF.expected.levy);
  await expect(result.locator('[data-result-kind="branch"]'))
    .toContainText(COAL_LSL_PROOF.expected.branch);
  await expect(result.locator('[data-result-kind="formula-a"]'))
    .toContainText(COAL_LSL_PROOF.expected.formulaA);
  await expect(result.locator('[data-result-kind="formula-b"]'))
    .toContainText(COAL_LSL_PROOF.expected.formulaB);
  expect(await rows.first().evaluate((element) =>
    getComputedStyle(element).display
  )).toBe('grid');
  expect(await result.locator('[data-result-kind="levy"] strong')
    .evaluate((element) => ({
      numeric: getComputedStyle(element).fontVariantNumeric,
      whiteSpace: getComputedStyle(element).whiteSpace,
    }))).toEqual({ numeric: 'tabular-nums', whiteSpace: 'nowrap' });
  expect(await result.locator('.result-why').evaluate((element) =>
    getComputedStyle(element).borderTopStyle
  )).toBe('solid');
  await expect(result.locator('.result-why'))
    .toContainText(COAL_LSL_PROOF.expected.explanation);
  health.assertHealthy();
});

test('calculator task begins in the initial mobile viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile contract only');
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await waitForVisualFonts(page);
  const fieldset = await page.locator('#calc-form fieldset').first().boundingBox();
  expect(fieldset).not.toBeNull();
  expect(fieldset.y).toBeLessThan(844);
  health.assertHealthy();
});

test('calculator result ledger does not overflow at 320 CSS pixels', async ({ page }) => {
  const health = observePageHealth(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await calculateFormulaB(page);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(0);
  const levy = page.locator('[data-result-kind="levy"] strong');
  await expect(levy).toContainText(COAL_LSL_PROOF.expected.levy);
  expect(await levy.evaluate((element) => element.scrollWidth))
    .toBeLessThanOrEqual(await levy.evaluate((element) => element.clientWidth));
  health.assertHealthy();
});

test('Formula B result matches the mobile visual baseline', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile baseline only');
  const health = observePageHealth(page);

  await calculateFormulaB(page, { visualSnapshot: true });
  const result = page.getByRole('status');
  await expect(result).toContainText('Formula B wins this month');
  await waitForVisualFonts(page);

  await expect(result).toHaveScreenshot(
    'calculator-formula-b-result-mobile.png',
    {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
    },
  );
  health.assertHealthy();
});
