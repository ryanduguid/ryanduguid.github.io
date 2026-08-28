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

test('registers and executes the four read-only calculator WebMCP tools', async ({ page }) => {
  const health = observePageHealth(page);
  await page.addInitScript(() => {
    window.__coalLslRegistrations = [];
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool) {
          window.__coalLslRegistrations.push(tool);
          return Promise.resolve();
        },
      },
    });
  });

  await page.goto('/tools/coal-lsl-levy/');
  const registrations = await page.evaluate(() =>
    window.__coalLslRegistrations.map(({ name, annotations, inputSchema }) => ({
      name,
      annotations,
      additionalProperties: inputSchema.additionalProperties,
    }))
  );
  expect(registrations).toEqual([
    'calculate_coal_lsl_levy',
    'run_coal_lsl_fixture',
    'explain_coal_lsl_method',
    'get_coal_lsl_evidence',
  ].map((name) => ({
    name,
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    additionalProperties: false,
  })));

  const output = await page.evaluate(async (input) => {
    document.getElementById('employeeLabel').value = 'DO-NOT-READ-THIS-LABEL';
    const tool = window.__coalLslRegistrations.find(
      ({ name }) => name === 'calculate_coal_lsl_levy',
    );
    return tool.execute(input);
  }, {
    branch: 'base_rate',
    baseRate: 6000,
    overtimeAndPenalties: 3000,
    allowances: 500,
  });
  expect(output.eligibleWagesCents).toBe(712500);
  expect(output.levyCents).toBe(19238);
  expect(JSON.stringify(output)).not.toContain('DO-NOT-READ-THIS-LABEL');

  await calculateFormulaB(page);
  await expect(page.getByRole('status')).toContainText('Formula B wins this month');
  health.assertHealthy();
});
