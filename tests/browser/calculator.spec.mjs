import { expect, test } from '@playwright/test';

import { observePageHealth } from './health.mjs';
import { waitForVisualFonts } from './visual.mjs';

async function calculateFormulaB(page) {
  await page.goto('/tools/coal-lsl-levy/');
  await page
    .getByRole('spinbutton', { name: 'Base rate of pay', exact: true })
    .fill('6000');
  await page.getByLabel('Overtime and penalty rates').fill('3000');
  await page.getByLabel('Allowances, excluding expense reimbursements').fill('500');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
}

test('calculates a Formula B levy without browser errors', async ({ page }) => {
  const health = observePageHealth(page);

  await calculateFormulaB(page);

  const result = page.getByRole('status');
  await expect(result).toContainText('Formula B wins this month');
  await expect(result).toContainText('$7,125.00');
  await expect(result).toContainText('$192.38');
  health.assertHealthy();
});

test('Formula B result matches the mobile visual baseline', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile baseline only');
  const health = observePageHealth(page);

  await calculateFormulaB(page);
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
