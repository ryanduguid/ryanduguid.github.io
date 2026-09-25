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
  await expect(page.getByRole('region', { name: 'Skills install command' }))
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

test('tool chooser exposes Excel compatibility and both browser calculator routes', async ({ page }) => {
  await page.goto('/tools/');
  await page.getByText('Browse more accounting tasks', { exact: true }).click();
  const excel = page.locator('.work-chooser a[href="/tools/ozzit/"]');
  await expect(excel).toContainText('Microsoft 365 or Excel 2024 or later');
  await expect(page.getByRole('link', { name: '9 business planning calculators', exact: true }))
    .toHaveAttribute('href', '/tools/business-calculators/');
  await excel.click();
  await expect(page).toHaveURL(/\/tools\/ozzit\/$/);
});
