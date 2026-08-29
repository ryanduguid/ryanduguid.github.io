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

async function unresolvedVisibleMoneyHelp(page) {
  return page.locator('#calc-form input[type="number"]:visible').evaluateAll((inputs) =>
    inputs.flatMap((input) => {
      const tokens = (input.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean);
      const unresolved = tokens.filter((token) => !document.getElementById(token));
      return tokens.length < 2 || unresolved.length
        ? [{ id: input.id, tokens, unresolved }]
        : [];
    })
  );
}

test('blank monetary inputs produce an explained zero result', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  const result = page.getByRole('status');
  await expect(result.locator('[data-result-kind="eligible-wages"]'))
    .toContainText('$0.00');
  await expect(result.locator('[data-result-kind="levy"]')).toContainText('$0.00');
  await expect(result.locator('.result-blank-policy')).toHaveText(
    'All monetary amounts were blank, so the calculator treated each as $0.00.',
  );
  await expect(page.locator('#money-blank-help')).toHaveText(
    'Leave a monetary amount blank to treat it as $0.00.',
  );
  health.assertHealthy();
});

test('visible monetary controls resolve common and field-specific help', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await page.getByRole('button', { name: 'Add a bonus', exact: true }).click();

  for (const branch of [
    'A base rate of pay (section 3B(1))',
    'An annual salary (section 3B(2))',
    'As a casual (section 3B(3))',
  ]) {
    await page.getByRole('radio', { name: branch, exact: true }).check();
    expect(await unresolvedVisibleMoneyHelp(page), branch).toEqual([]);
  }

  const specificHelpIds = await page
    .locator('#calc-form input[type="number"]:visible')
    .evaluateAll((inputs) => inputs.map((input) =>
      input.getAttribute('aria-describedby').split(/\s+/).find((id) => id !== 'money-blank-help')
    ));
  expect(new Set(specificHelpIds).size).toBe(specificHelpIds.length);
  health.assertHealthy();
});

test('casual branch requires and describes the reporting month', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await page.getByRole('radio', {
    name: 'As a casual (section 3B(3))',
    exact: true,
  }).check();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  const month = page.getByLabel('Reporting month', { exact: true });
  await expect(month).toBeFocused();
  await expect(month).toHaveAttribute('aria-invalid', 'true');
  const describedBy = (await month.getAttribute('aria-describedby')).split(/\s+/);
  const errorId = describedBy.find((id) => id.endsWith('-error'));
  expect(errorId).toBeTruthy();
  await expect(page.locator(`#${errorId}`)).toHaveAttribute('role', 'alert');
  await expect(page.locator(`#${errorId}`)).toBeVisible();
  health.assertHealthy();
});

test('casual month typed into the text fallback fails visibly, not silently', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await page.getByRole('radio', {
    name: 'As a casual (section 3B(3))',
    exact: true,
  }).check();
  // Firefox and Safari on desktop have no native month input, so the control
  // takes the text state and required alone cannot catch a bad format.
  const month = page.getByLabel('Reporting month', { exact: true });
  await month.evaluate((input) => { input.type = 'text'; });
  await month.fill('January 2024');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  await expect(month).toBeFocused();
  await expect(month).toHaveAttribute('aria-invalid', 'true');
  const describedBy = (await month.getAttribute('aria-describedby')).split(/\s+/);
  const errorId = describedBy.find((id) => id.endsWith('-error'));
  expect(errorId).toBeTruthy();
  await expect(page.locator(`#${errorId}`)).toBeVisible();

  await month.fill('2026-08');
  await page
    .getByRole('spinbutton', { name: 'All-in ordinary rate pay', exact: true })
    .fill('5000');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('status').locator('[data-result-kind="eligible-wages"]'))
    .toContainText('$5,000.00');
  await expect(page.locator('.result-why')).toContainText('Section 3B(3)(b) applies');
  health.assertHealthy();
});

test('Print working calls the browser print command', async ({ page }) => {
  const health = observePageHealth(page);
  await page.addInitScript(() => {
    window.__printCalls = 0;
    window.print = () => { window.__printCalls += 1; };
  });
  await calculateFormulaB(page);
  await page.getByRole('button', { name: 'Print working', exact: true }).click();
  expect(await page.evaluate(() => window.__printCalls)).toBe(1);
  health.assertHealthy();
});

test('printing and the monthly table recalculate from edited inputs', async ({ page }) => {
  const health = observePageHealth(page);
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto('/tools/coal-lsl-levy/');
  const baseRate = page.getByRole('spinbutton', { name: 'Base rate of pay', exact: true });
  await baseRate.fill('5000');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('[data-result-kind="eligible-wages"]')).toContainText('$5,000.00');

  await baseRate.fill('7000');
  await page.getByRole('button', { name: 'Print working', exact: true }).click();
  await expect(page.locator('[data-result-kind="eligible-wages"]')).toContainText('$7,000.00');

  await baseRate.fill('9000');
  await page.getByRole('button', { name: 'Add to monthly table', exact: true }).click();
  await expect(page.locator('#employee-rows tr td').nth(2)).toHaveText('$9,000.00');
  await expect(page.locator('[data-result-kind="eligible-wages"]')).toContainText('$9,000.00');
  health.assertHealthy();
});

test('print media keeps the working and hides interactive records', async ({ page }) => {
  const health = observePageHealth(page);
  await calculateFormulaB(page);
  await page.emulateMedia({ media: 'print' });

  await expect(page.getByText('A base rate of pay (section 3B(1))', { exact: true }))
    .toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Base rate of pay', exact: true }))
    .toBeVisible();
  await expect(page.locator('[data-result-kind="formula-b"]')).toBeVisible();
  await expect(page.locator('[data-result-kind="eligible-wages"]')).toBeVisible();
  await expect(page.locator('[data-result-kind="levy"]')).toBeVisible();
  await expect(page.getByText('Published 24 August 2026. Last reviewed 30 August 2026.'))
    .toBeVisible();
  await expect(page.locator('.calculator-method')).toContainText('Boundary');
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('.article-crumb')).toBeHidden();
  await expect(page.locator('button:visible')).toHaveCount(0);
  await expect(page.getByLabel('Employee reference', { exact: true })).toBeHidden();
  await expect(page.locator('#employee-table')).toBeHidden();
  health.assertHealthy();
});

test('monthly table uses a reference and downloads the hardened CSV', async ({ page }) => {
  const health = observePageHealth(page);
  await calculateFormulaB(page);
  await page.getByLabel('Employee reference', { exact: true }).fill('EMP-001');
  await page.getByRole('button', { name: 'Add to monthly table', exact: true }).click();
  await expect(page.locator('#employee-rows tr')).toHaveCount(1);
  await expect(page.locator('#employee-rows tr')).toContainText('EMP-001');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let csv = '';
  for await (const chunk of stream) csv += chunk.toString('utf8');
  expect(download.suggestedFilename()).toBe('coal-lsl-levy.csv');
  expect(csv).toContain('Estimate only, not advice.');
  expect(csv).toContain('Label,Branch,Eligible wages,Levy');
  expect(csv).toContain('EMP-001');
  expect(csv).toContain('Total,,');
  health.assertHealthy();
});

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
