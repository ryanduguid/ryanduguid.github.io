// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { expect } from '@playwright/test';

/**
 * Waits until accounting-pages.mjs has loaded a calculator's modules and enabled its form.
 * Each calculator's controls start in a disabled fieldset, so the first control stays
 * disabled until then. Call it before going offline or setting a file, which skip
 * Playwright's enabled check. Do not wait on the fieldset itself: Playwright reports a
 * fieldset as enabled whatever its disabled attribute, so that check passes at once.
 */
export async function waitForCalculator(form) {
  await expect(form.locator('input, select').first()).toBeEnabled();
}
