import { test, expect } from '@playwright/test';

const componentRoutes = [
  ['/tools/payday-super/', 'australian-accounting', 'packages/payday-super-checker'],
  ['/tools/ato-benchmarks/', 'australian-accounting', 'packages/ato-benchmark-compare'],
  ['/tools/company-tax-franking/', 'australian-accounting', 'packages/the-exchequer-tally'],
  ['/tools/trust-distributions/', 'australian-accounting', 'packages/solomons-sword'],
  ['/tools/wip-schedule/', 'australian-accounting', 'packages/the-wip-tally'],
  ['/tools/australian-tax-ai-agents/', 'australian-accounting', 'apps/aus-accounting-mcp'],
  ['/tools/xero-trial-balance/', 'accounting-review-pipeline', 'packages/xero-trial-balance-export'],
  ['/tools/workpaper-review-gate/', 'accounting-review-pipeline', 'packages/review-ready-gate'],
  ['/tools/monthly-close-controls/', 'accounting-review-pipeline', 'packages/monthly-close-control-plane'],
  ['/tools/subcontractor-ledgers/', 'australian-accounting-skills', ''],
];

test('current tool routes lead to maintained component source and support', async ({ page }) => {
  for (const [route, repository, directory] of componentRoutes) {
    await page.goto(route);
    const repositoryUrl = `https://github.com/ryanduguid/${repository}`;
    const sourceUrl = directory ? `${repositoryUrl}/tree/main/${directory}` : repositoryUrl;
    await expect(page.getByRole('link', { name: 'Source on GitHub', exact: true }))
      .toHaveAttribute('href', sourceUrl);
    await expect(page.getByRole('link', { name: 'Open an issue', exact: true }))
      .toHaveAttribute('href', `${repositoryUrl}/issues`);
  }

  const install = page.locator('#get-it');
  await expect(install.getByRole('link', { name: 'Adopt', exact: true }))
    .toHaveAttribute('href', '/tools/australian-tax-ai-agents/#install');
  await install.getByRole('link', { name: 'Adopt', exact: true }).click();
  await expect(page.locator('#install')).toBeVisible();
  // Adopt shows one route at a time: open the Skills route before reading it.
  await page.locator('label[for="adopt-skills"]').click();
  const stableInstall = page.getByRole('region', { name: 'Skills install command', exact: true });
  await expect(stableInstall)
    .toContainText('checkout --detach v0.4.0');
  await expect(stableInstall)
    .toContainText("npx --yes skills@1.5.22 add ./accounting-skills-release --agent codex claude-code --skill '*' --yes --copy");
  const developmentInstall = page.getByRole('region', { name: 'Development skills install command', exact: true });
  await expect(developmentInstall).toBeHidden();
  await page.getByText('Development installation', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(developmentInstall).toBeVisible();
  await expect(developmentInstall)
    .toContainText('npx --yes skills@1.5.22 add ryanduguid/australian-accounting-skills');
});

test('adoption routes survive sharing, reload and browser history', async ({ page }) => {
  for (const route of ['none', 'claude', 'codex', 'skills', 'github']) {
    await page.goto(`/?source=shared#adopt-${route}`);
    await expect(page).toHaveURL(new RegExp(`/tools/australian-tax-ai-agents/\\?source=shared#adopt-${route}$`));
    await expect(page.locator(`#adopt-${route}`)).toBeChecked();
    await expect(page.locator(`#adopt-${route} + label + .adopt-panel`)).toBeVisible();
    const bounds = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      copyButtonRight: document.querySelector('.adopt-input:checked + label + .adopt-panel .copy-button')
        ?.getBoundingClientRect().right ?? 0,
    }));
    expect(bounds.pageWidth, `${route} page overflow`).toBeLessThanOrEqual(bounds.viewportWidth);
    expect(bounds.copyButtonRight, `${route} copy button`).toBeLessThanOrEqual(bounds.viewportWidth);
  }
  await page.goto('/tools/australian-tax-ai-agents/#install');
  await expect(page.locator('#adopt-none')).toBeChecked();
  // Position each label before clicking so WebKit cannot scroll it between pointer events.
  await page.locator('label[for="adopt-codex"]').evaluate((label) => label.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.locator('label[for="adopt-codex"]').click();
  await expect(page).toHaveURL(/#adopt-codex$/);
  await page.reload();
  await expect(page.locator('#adopt-codex')).toBeChecked();
  await page.locator('label[for="adopt-skills"]').evaluate((label) => label.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.locator('label[for="adopt-skills"]').click();
  await expect(page).toHaveURL(/#adopt-skills$/);
  await page.goBack();
  await expect(page.locator('#adopt-codex')).toBeChecked();
  await page.goForward();
  await expect(page.locator('#adopt-skills')).toBeChecked();
});

test('home keeps its adoption overview and links to the installation guide', async ({ page }) => {
  await page.goto('/#adopt');
  await expect(page.locator('#adopt')).toBeVisible();
  await expect(page.locator('#adopt pre')).toHaveCount(0);
  await page.getByRole('link', { name: 'Set up AI tools', exact: true }).click();
  await expect(page).toHaveURL(/\/tools\/australian-tax-ai-agents\/#install$/);
  await expect(page.locator('#adopt-none')).toBeChecked();
});

test('task shortcuts expose Excel compatibility and both browser calculator routes', async ({ page }) => {
  await page.goto('/tools/');
  const related = page.locator('#related-resources');
  await expect(related.getByRole('link', { name: 'Tax prompt guide and refusal examples' }))
    .toHaveAttribute('href', '/tools/refusals/#drdebits');
  await expect(related.getByRole('link', { name: 'Fictional cash flow example' }))
    .toHaveAttribute('href', '/examples/profit-vs-cash-flow/');
  const excel = page.locator('.task-routes a[href="/tools/ozzit/"]');
  await expect(excel).toContainText('Microsoft 365 or Excel 2024 or later');
  await expect(page.getByRole('link', { name: '9 business planning calculators', exact: true }))
    .toHaveAttribute('href', '/tools/business-calculators/');
  await excel.click();
  await expect(page).toHaveURL(/\/tools\/ozzit\/$/);
});

test('review previews expose their captured reports before installation', async ({ page, request }) => {
  await page.goto('/tools/monthly-close-controls/');
  await expect(page.locator('.article-body > section').first()).toHaveAttribute('id', 'worked-example');
  await expect(page.getByRole('region', { name: 'Fictional creditors inputs and generated difference' })).toContainText('-250.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  const monthly = await request.get('/assets/examples/monthly-close/exceptions.csv');
  expect(monthly.ok()).toBe(true);
  expect(await monthly.text()).toContain('subledger_reconciliation,REVIEW');

  await page.goto('/tools/workpaper-review-gate/');
  await expect(page.locator('.article-body > section').first()).toHaveAttribute('id', 'worked-example');
  await expect(page.getByRole('region', { name: 'Fictional BAS inputs and generated findings' })).toContainText('OPEN_ITEM_BLOCKING');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  const findings = await request.get('/assets/examples/review-gate/findings.csv');
  expect(findings.ok()).toBe(true);
  expect(await findings.text()).toContain('MISSING_ARTEFACT,NOT_READY,gst_control_gl,true');
  const summary = await request.get('/assets/examples/review-gate/readiness-summary.md');
  expect(summary.ok()).toBe(true);
  expect(await summary.text()).toContain('A human must still decide whether the file is acceptable.');
});

test('rates offer an Excel import and the existing update feed', async ({ page, request }) => {
  await page.goto('/rates/');
  await page.locator('#excel summary').click();
  await expect(page.getByRole('region', { name: 'Power Query import for super guarantee rates' })).toContainText('general_sg_rate_percent');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  await expect(page.getByRole('link', { name: 'Follow updates with the Atom feed' })).toHaveAttribute('href', '/feed.xml');
  const csv = await request.get('/rates/super-guarantee/super-guarantee-rates.csv');
  expect(csv.ok()).toBe(true);
  expect(await csv.text()).toContain('period_start,period_end,general_sg_rate_percent,notes');
});
