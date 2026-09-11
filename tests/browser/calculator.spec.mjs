import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

test('home proof rejects invalid amounts and recovers without stale results', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/');
  const result = page.locator('.proof-calc__result');
  for (const name of ['Base rate of pay', 'Overtime and penalty', 'Allowances']) {
    const field = page.getByRole('spinbutton', { name, exact: true });
    const original = await field.inputValue();
    for (const value of ['-1', '0.001', '', '1e308']) {
      await field.fill(value);
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(result).toBeHidden();
      await expect(page.locator('#home-levy-error')).toBeVisible();
      await expect(field).toHaveAccessibleDescription(/Enter an amount of \$0\.00 or more/);
    }
    await field.fill(original);
    await expect(field).not.toHaveAttribute('aria-invalid', 'true');
    await expect(field).not.toHaveAccessibleDescription(/Enter an amount of \$0\.00 or more/);
    await expect(page.locator('#home-levy-error')).toBeHidden();
    await expect(result).toBeVisible();
    await expect(result.locator('[data-out="levy"]')).toHaveText(COAL_LSL_PROOF.expected.levy);
  }
  for (const input of await page.locator('#home-levy input').all()) await input.fill('0');
  await expect(result.locator('[data-out="levy"]')).toHaveText('$0.00');
  await page.locator('#calc-base').fill('10000');
  await expect(result.locator('[data-out="levy"]')).toHaveText('$270.00');
  health.assertHealthy();
});

test('home proof announces the applied formula and rejects an oversized combined result', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/');
  const announcement = page.locator('#home-levy [aria-live="polite"]');
  await expect(announcement).toContainText('Formula B applies.');
  await page.locator('#calc-overtime').fill('0');
  await page.locator('#calc-allowances').fill('0');
  await expect(announcement).toContainText('Formula A applies.');
  await page.locator('#calc-base').fill('3');
  await page.locator('#calc-overtime').fill('1');
  await expect(announcement).toContainText('Formula A applies.');
  await page.locator('#calc-overtime').fill('2');
  await expect(announcement).toContainText('Formula B applies.');
  for (const input of await page.locator('#home-levy input').all()) await input.fill('500000000000');
  await expect(page.locator('.proof-calc__result')).toBeHidden();
  await expect(page.locator('#home-levy-error')).toContainText('The total is too large');
  for (const input of await page.locator('#home-levy input').all()) await input.fill('0');
  await expect(announcement).toContainText('Formula A applies.');
  await expect(announcement).toContainText('$0.00');
  health.assertHealthy();
});

test('every calculator branch and added bonus rejects oversized amounts and recovers', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  for (const branch of ['baseRate', 'annual', 'casual']) {
    await page.locator(`input[name="branch"][value="${branch}"]`).check();
    if (branch === 'casual') await page.locator('#reportingMonth').fill('2026-09');
    for (const field of await page.locator('#calc-form input[type="number"]').all()) {
      await field.fill('1e308');
      await page.getByRole('button', { name: 'Calculate', exact: true }).click();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toBeFocused();
      await field.fill('0');
      await expect(field).not.toHaveAttribute('aria-invalid', 'true');
    }
  }
  await page.getByRole('button', { name: 'Add a bonus', exact: true }).click();
  const bonus = page.locator('.bonus-amount');
  await bonus.fill('1e308');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(bonus).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Load the synthetic example', exact: true }).click();
  await expect(page.locator('[data-result-kind="levy"] strong')).toHaveText(COAL_LSL_PROOF.expected.levy);
  health.assertHealthy();
});

test('oversized calculations and employee totals recover without changing saved rows', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await page.locator('#baseRate').fill('500000000000');
  await page.locator('#sacrificed').fill('500000000000');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('#result-actions')).toBeHidden();
  await expect(page.locator('#result')).toBeEmpty();
  await expect(page.locator('#result-notice')).toContainText('The total is too large');
  await page.locator('#sacrificed').fill('0');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await page.locator('#add-employee').click();
  await expect(page.locator('#employee-rows tr')).toHaveCount(1);
  await page.locator('#add-employee').click();
  await expect(page.locator('#table-status')).toContainText('No row was added.');
  await expect(page.locator('#employee-rows tr')).toHaveCount(1);
  await expect(page.locator('#employee-total-levy')).toHaveText('$13,500,000,000.00');
  await page.getByRole('button', { name: 'Remove Reference 1', exact: true }).click();
  await page.locator('#add-employee').click();
  await expect(page.locator('#table-status')).toContainText('Reference 1 added');
  health.assertHealthy();
});

test('loaded synthetic example matches the homepage default proof', async ({ page }) => {
  await page.goto('/');
  const expected = await page.locator('[data-out="levy"]').textContent();
  await page.goto('/tools/coal-lsl-levy/');
  await page.getByRole('button', { name: 'Load the synthetic example', exact: true }).click();
  await expect(page.locator('[data-result-kind="levy"] strong')).toHaveText(expected);
});

test('blank monetary inputs produce an explained zero result', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  const result = page.locator('#result');
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

test('casual pay the selected branch cannot use is named, not silently dropped', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await page.getByRole('radio', {
    name: 'As a casual (section 3B(3))',
    exact: true,
  }).check();
  // Both loading checkboxes keep their unchecked default, which selects
  // s 3B(3)(b). That branch reads neither field filled in below.
  await page.getByLabel('Reporting month', { exact: true }).fill('2026-08');
  await page.getByRole('spinbutton', { name: 'Base rate pay', exact: true }).fill('1800');
  await page.getByRole('spinbutton', { name: 'Casual loading', exact: true }).fill('450');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  const result = page.locator('#result');
  await expect(result.locator('[data-result-kind="eligible-wages"]')).toContainText('$0.00');
  await expect(result.locator('[data-result-kind="levy"]')).toContainText('$0.00');
  await expect(result.locator('.result-blank-policy')).toHaveText(
    'Not counted on the section 3B(3)(b) branch: Base rate pay, Casual loading. '
    + 'The reporting month and the two casual loading answers select which pay fields apply.',
  );
  health.assertHealthy();
});

test('a casual salary sacrifice does not make a counted figure read as dropped', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await page.getByRole('radio', { name: 'As a casual (section 3B(3))', exact: true }).check();
  // Both boxes ticked selects s 3B(3)(a), which reads base rate pay and the
  // loading. The sacrifice field sits outside the branch fields and applies to
  // the base rate of pay, so every figure below reaches the total and the page
  // must name nothing as not counted.
  await page.getByRole('checkbox', {
    name: 'An industrial instrument specifies a casual loading',
    exact: true,
  }).check();
  await page.getByRole('checkbox', {
    name: 'That loading can be quantified separately from the ordinary rate',
    exact: true,
  }).check();
  await page.getByLabel('Reporting month', { exact: true }).fill('2026-08');
  await page.getByRole('spinbutton', { name: 'Base rate pay', exact: true }).fill('1800');
  await page.getByRole('spinbutton', { name: 'Casual loading', exact: true }).fill('450');
  await page.getByLabel('Salary sacrificed amount').fill('100');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  const result = page.locator('#result');
  await expect(result.locator('[data-result-kind="eligible-wages"]')).toContainText('$2,350.00');
  await expect(result.locator('.result-blank-policy')).toHaveCount(0);

  // The mirror case on s 3B(3)(b), where the sacrifice grosses up the all-in
  // ordinary rate instead and base rate pay is the field left blank.
  await page.getByRole('checkbox', {
    name: 'An industrial instrument specifies a casual loading',
    exact: true,
  }).uncheck();
  await page.getByRole('checkbox', {
    name: 'That loading can be quantified separately from the ordinary rate',
    exact: true,
  }).uncheck();
  await page.getByRole('spinbutton', { name: 'Base rate pay', exact: true }).fill('');
  await page.getByRole('spinbutton', { name: 'Casual loading', exact: true }).fill('');
  await page.getByRole('spinbutton', { name: 'All-in ordinary rate pay', exact: true }).fill('2250');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  await expect(result.locator('[data-result-kind="eligible-wages"]')).toContainText('$2,350.00');
  await expect(result.locator('.result-blank-policy')).toHaveCount(0);
  health.assertHealthy();
});

test('a pre-2024 casual month names the all-in rate it discards', async ({ page }) => {
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await page.getByRole('radio', { name: 'As a casual (section 3B(3))', exact: true }).check();
  // Before 2024 there is one pay figure, so the all-in rate typed alongside the
  // base rate is thrown away and has to be named.
  await page.getByLabel('Reporting month', { exact: true }).fill('2023-12');
  await page.getByRole('spinbutton', { name: 'Base rate pay', exact: true }).fill('1800');
  await page.getByRole('spinbutton', { name: 'All-in ordinary rate pay', exact: true }).fill('2250');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  const result = page.locator('#result');
  await expect(result.locator('[data-result-kind="eligible-wages"]')).toContainText('$1,800.00');
  await expect(result.locator('.result-blank-policy')).toHaveText(
    'Not counted on the pre-2024 branch: All-in ordinary rate pay. '
    + 'The reporting month and the two casual loading answers select which pay fields apply.',
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
  await expect(page.locator('#result').locator('[data-result-kind="eligible-wages"]'))
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
  await expect(page.getByText('Published 24 August 2026. Last reviewed 10 September 2026.'))
    .toBeVisible();
  await expect(page.locator('.calculator-method')).toContainText('Boundary');
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('.article-crumb')).toBeHidden();
  await expect(page.locator('button:visible')).toHaveCount(0);
  await expect(page.getByLabel('Employee reference', { exact: true })).toBeHidden();
  await expect(page.locator('#employee-table')).toBeHidden();
  health.assertHealthy();
});

test('monthly table explains aggregate rounding and downloads a sourced CSV', async ({ page }) => {
  const health = observePageHealth(page);
  await calculateFormulaB(page);
  await page.getByRole('spinbutton', { name: 'Base rate of pay', exact: true }).fill('6000.20');
  await page.getByLabel('Overtime and penalty rates').fill('0');
  await page.getByLabel('Allowances, excluding expense reimbursements').fill('0');
  await page.getByLabel('Salary sacrificed amount').fill('0');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await page.getByLabel('Employee reference', { exact: true }).fill('EMP-001');
  await page.getByRole('button', { name: 'Add to monthly table', exact: true }).click();
  await expect(page.locator('#employee-rows tr')).toHaveCount(1);
  await expect(page.locator('#employee-rows tr')).toContainText('EMP-001');
  const status = page.locator('#table-status');
  await expect(status).toHaveText('EMP-001 added to the monthly table, 1 row.');
  expect((await status.boundingBox()).height).toBeGreaterThan(1);

  await page.getByLabel('Employee reference', { exact: true }).fill('=SUM("1",2)');
  await page.getByRole('button', { name: 'Add to monthly table', exact: true }).click();
  await expect(page.locator('#employee-rows tr td:nth-child(4)')).toHaveText(['$162.01', '$162.01']);
  await expect(page.locator('#employee-total-wages')).toHaveText('$12,000.40');
  await expect(page.locator('#employee-total-levy')).toHaveText('$324.01');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let csv = '';
  for await (const chunk of stream) csv += chunk.toString('utf8');
  expect(download.suggestedFilename()).toBe('coal-lsl-levy.csv');
  expect(csv).toContain('Estimate only, not advice.');
  expect(csv).toContain('Label,Branch,Eligible wages,Levy');
  expect(csv).toContain('Currency,AUD\n');
  expect(csv).toContain('Levy rate,2.7%\n');
  expect(csv).toContain('Rate reviewed,2026-09-02\n');
  expect(csv).toContain('Rate source,https://www.legislation.gov.au/F2018L00217/latest/latest/text/original/pdf\n');
  expect(csv).toContain('EMP-001,s 3B(1),6000.20,162.01\n');
  expect(csv).toContain('"\'=SUM(""1"",2)",s 3B(1),6000.20,162.01\n');
  expect(csv).toContain('Total,,12000.40,324.01');
  const rounding = page.locator('#employee-rounding-note');
  await expect(rounding).toBeVisible();
  await expect(rounding).toContainText('combined eligible wages and rounded once');
  await expect(rounding).toContainText('may differ from the sum of the displayed row levies');
  expect(csv).toContain(`Rounding,${await rounding.textContent()}\n`);
  health.assertHealthy();
});

test('monthly table automatic references avoid existing labels after removal', async ({ page }) => {
  const health = observePageHealth(page);
  await calculateFormulaB(page);
  const add = page.getByRole('button', { name: 'Add to monthly table', exact: true });
  const labels = page.locator('#employee-rows tr td:first-child');
  for (let index = 0; index < 3; index += 1) await add.click();
  await expect(labels).toHaveText(['Reference 1', 'Reference 2', 'Reference 3']);
  await page.getByRole('button', { name: 'Remove Reference 1', exact: true }).click();
  await add.click();
  await expect(labels).toHaveText(['Reference 2', 'Reference 3', 'Reference 4']);

  await page.getByLabel('Employee reference', { exact: true }).fill('Reference 5');
  await add.click();
  await add.click();
  await expect(labels).toHaveText([
    'Reference 2', 'Reference 3', 'Reference 4', 'Reference 5', 'Reference 6',
  ]);
  health.assertHealthy();
});

test('calculates a Formula B levy without browser errors', async ({ page }) => {
  const health = observePageHealth(page);

  await calculateFormulaB(page);

  const result = page.locator('#result');
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
  await expect(method).toContainText('2 September 2026');
  await expect(method).toContainText('Section 3B branch test');
  await expect(method).toContainText('Estimate only');

  const result = page.locator('#result');
  await expect(result).toContainText('as at 2 September 2026');
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

test('calculator example is available within the initial mobile viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile contract only');
  const health = observePageHealth(page);
  await page.goto('/tools/coal-lsl-levy/');
  await waitForVisualFonts(page);
  const example = await page.locator('#load-example').boundingBox();
  const viewport = page.viewportSize();
  expect(example).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(example.y + example.height).toBeLessThanOrEqual(viewport.height);
  health.assertHealthy();
});

test('edited results stay marked until a valid recalculation', async ({ page }) => {
  await page.goto('/tools/coal-lsl-levy/');
  const notice = page.locator('#result-notice');
  await page.locator('#baseRate').fill('8000');
  await expect(notice).toBeEmpty();
  await page.locator('#load-example').click();
  await expect(notice).toBeEmpty();
  await page.locator('#baseRate').fill('-1');
  await expect(notice).toHaveText('Inputs changed. Calculate again.');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(notice).toBeVisible();
  await expect(page.locator('#baseRate')).toBeFocused();
  await page.locator('#baseRate').fill('8000');
  await expect(notice).toHaveText('Inputs changed. Calculate again.');
  await expect(page.locator('[data-result-kind="levy"] strong')).toHaveText('$192.38');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(notice).toBeEmpty();
  await expect(page.locator('[data-result-kind="levy"] strong')).toHaveText('$232.88');
  await page.locator('#baseRate').fill('9000');
  await page.locator('#load-example').click();
  await expect(notice).toBeEmpty();
  await expect(page.locator('[data-result-kind="levy"] strong')).toHaveText('$192.38');
});

test('bonus and branch changes mark the previous result for recalculation', async ({ page }) => {
  await calculateFormulaB(page);
  const notice = page.locator('#result-notice');
  const calculate = page.getByRole('button', { name: 'Calculate', exact: true });
  await page.locator('#add-bonus').click();
  await expect(notice).toHaveText('Inputs changed. Calculate again.');
  await page.locator('.bonus-row input').fill('100');
  await calculate.click();
  await expect(notice).toBeEmpty();
  await page.locator('.bonus-row select').selectOption('quarterly');
  await expect(notice).toHaveText('Inputs changed. Calculate again.');
  await calculate.click();
  await expect(notice).toBeEmpty();
  await page.getByRole('button', { name: 'Remove bonus 1', exact: true }).click();
  await expect(notice).toHaveText('Inputs changed. Calculate again.');
  await calculate.click();
  await page.locator('input[value="annual"]').check();
  await expect(notice).toHaveText('Inputs changed. Calculate again.');
  await calculate.click();
  await expect(notice).toBeEmpty();
});

test('bonus controls keep keyboard focus through additions and removals', async ({ page }) => {
  await page.goto('/tools/coal-lsl-levy/');
  const add = page.getByRole('button', { name: 'Add a bonus', exact: true });
  const amounts = page.locator('.bonus-row input[type="number"]');
  for (let index = 0; index < 3; index += 1) {
    await add.focus();
    await add.press('Enter');
    await expect(amounts.nth(index)).toBeFocused();
    await amounts.nth(index).fill(String((index + 1) * 100));
  }
  await page.getByRole('button', { name: 'Remove bonus 2', exact: true }).press('Enter');
  await expect(amounts.nth(1)).toBeFocused();
  await expect(amounts.nth(1)).toHaveValue('300');
  await page.getByRole('button', { name: 'Remove bonus 2', exact: true }).press('Enter');
  await expect(amounts.first()).toBeFocused();
  await page.getByRole('button', { name: 'Remove bonus 1', exact: true }).press('Enter');
  await expect(add).toBeFocused();
});

test('monthly table removal keeps focus in the remaining work', async ({ page }) => {
  await calculateFormulaB(page);
  const reference = page.getByLabel('Employee reference', { exact: true });
  for (const label of ['EMP-001', 'EMP-002', 'EMP-003']) {
    await reference.fill(label);
    await page.getByRole('button', { name: 'Add to monthly table', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Remove EMP-002', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Remove EMP-003', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Remove EMP-003', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Remove EMP-001', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Remove EMP-001', exact: true }).press('Enter');
  await expect(reference).toBeFocused();
  await expect(page.locator('#employee-table-wrap')).toBeHidden();
});

test('mobile calculations move keyboard focus to the result', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'stacked result only');
  await calculateFormulaB(page);
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Load the synthetic example', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeFocused();
});

test('mobile result scrolling keeps touch targets clear of the sticky header', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'stacked result only');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await calculateFormulaB(page);
    for (const action of ['calculation', 'example']) {
      if (action === 'example') await page.locator('#load-example').click();
      await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeFocused();
      await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeInViewport();
      const audit = await new AxeBuilder({ page }).withRules(['target-size']).analyze();
      expect(audit.violations, `touch targets after ${action} at ${width}px`).toEqual([]);
    }
  }
});

test('calculator result and employee table do not overflow at 320 CSS pixels', async ({ page }) => {
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
  await page.getByLabel('Employee reference', { exact: true }).fill('EMP-001');
  await page.getByRole('button', { name: 'Add to monthly table', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(0);
  const tableLevy = page.locator('#employee-rows td').nth(3);
  const levyLines = await tableLevy.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  });
  expect(levyLines).toBe(1);
  health.assertHealthy();
});

test('Formula B result matches the mobile visual baseline', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile baseline only');
  const health = observePageHealth(page);

  await calculateFormulaB(page, { visualSnapshot: true });
  const result = page.locator('#result');
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
