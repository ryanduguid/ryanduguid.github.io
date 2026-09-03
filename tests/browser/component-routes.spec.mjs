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
    .toHaveAttribute('href', '/#adopt');
  await install.getByRole('link', { name: 'Adopt', exact: true }).click();
  await expect(page.locator('#adopt')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Supported installation commands' }))
    .toContainText('npx skills add ryanduguid/australian-accounting-skills');
});
