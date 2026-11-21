// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

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

/**
 * Waits until any calculators on the page have loaded their modules. The calculator
 * engines are imported after the page's load event, so a test that moves to the next
 * page sooner cancels those requests, and a health check reports each as
 * net::ERR_ABORTED. One wait covers every form: accounting-pages.mjs enables them together.
 */
export async function waitForCalculators(page) {
  const form = page.locator('form[data-calculator]').first();
  if (await form.count()) await waitForCalculator(form);
}
