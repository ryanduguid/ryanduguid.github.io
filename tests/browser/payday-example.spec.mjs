import { test, expect } from '@playwright/test';

test('fixed Payday example reaches a reviewer without installation', async ({ page }) => {
  await page.goto('/tools/payday-super/');
  const example = page.locator('#synthetic-worked-example');
  await expect(example.locator('[data-example="expected_verdict"]')).toHaveText('AT_RISK');
  await expect(example.locator('[data-example="sg_amount"]')).toHaveText('$120.00');
  await expect(example.locator('[data-example="expected_due_date"]')).toHaveText('17 August 2026');
  const decision = example.locator('p').filter({ hasText: 'Human decision:' });
  const bounds = await decision.boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height);
  await expect(page.locator('main input, main form')).toHaveCount(0);
  await page.getByText('Version, file fingerprints and timing boundary', { exact: true }).click();
  await expect(page.locator('[data-example="fixture_blob_sha"]')).toBeVisible();
});
