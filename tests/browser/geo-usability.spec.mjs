// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

import { expect, test } from '@playwright/test';

import {
  SCENARIOS,
  buildStepPath,
  buildDeficitPath,
  buildNegativeStrokePath,
  negativeRuns,
  xPos,
  yPos,
} from '../../assets/cash-chart.mjs';
import { waitForVisualFonts } from './visual.mjs';

test('chart dialogs keep interior clicks open and restore focus after dismissal', async ({ page }) => {
  for (const route of ['/examples/profit-vs-cash-flow/']) {
    await page.goto(route);
    const chart = page.locator('.case-preview > a');
    const dialog = page.getByRole('dialog', { name: 'Full-size chart' });
    for (const dismissal of ['button', 'backdrop', 'Escape']) {
      await chart.click();
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      await page.mouse.click(bounds.x + 4, bounds.y + 4);
      expect(await dialog.isVisible()).toBe(true);
      await dialog.getByRole('img').click();
      await expect(dialog).toBeVisible();
      if (dismissal === 'button') {
        await dialog.getByRole('button', { name: 'Close' }).click();
      } else if (dismissal === 'backdrop') {
        await page.mouse.click(1, 1);
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(dialog).toBeHidden();
      await expect(chart).toBeFocused();
    }
  }
});

test('printing hides an open chart viewer and restores it afterwards', async ({ page }) => {
  for (const route of ['/examples/profit-vs-cash-flow/']) {
    await page.goto(route);
    await page.locator('.case-preview > a').click();
    const dialog = page.locator('.chart-dialog');
    await expect(dialog).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(dialog).toBeHidden();
    await expect(dialog).toHaveAttribute('open', '');
    await page.emulateMedia({ media: null });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.case-preview > a')).toBeFocused();
  }
});

test('printing keeps the full tool register available without a duplicate task list', async ({ page }) => {
  await page.goto('/tools/');
  await expect(page.locator('.work-chooser')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.collection-entry')).toHaveCount(12);
  await expect(page.locator('.collection-entry__title').filter({ hasText: 'Ozzit' })).toBeVisible();
  await expect(page.locator('.collection-entry__title').filter({ hasText: 'Aus Accounting MCP' })).toBeVisible();
});

test('AI tool comparison keeps all four columns readable', async ({ page }) => {
  await page.goto('/tools/australian-tax-ai-agents/');
  await waitForVisualFonts(page);
  const table = page.locator('.comparison-table');
  const geometry = await table.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    widths: [...element.querySelectorAll('tbody tr:first-child :is(th, td)')]
      .map((cell) => cell.getBoundingClientRect().width),
  }));
  expect(geometry.widths).toHaveLength(4);
  expect(Math.min(...geometry.widths)).toBeGreaterThan(140);
  expect(Math.max(...geometry.widths) / Math.min(...geometry.widths)).toBeLessThan(2);
  expect(geometry.height).toBeLessThan(1200);

  if (page.viewportSize().width < 704) {
    const region = page.getByRole('region', { name: 'Comparison of Australian tax AI tool types' });
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }
});

test('mobile visitors can open the cash-flow example from the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForVisualFonts(page);
  const link = page.getByRole('navigation', { name: 'Homepage actions' }).getByRole('link', {
    name: 'Explore the cash flow example', exact: true,
  });
  const bounds = await link.boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
});

test('cash-flow entry points reach the workbook and About reaches review evidence', async ({ page, browser, baseURL }) => {
  const sensitivity = JSON.parse(readFileSync('assets/examples/lumbridge/sensitivity.json', 'utf8'));
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDate = (iso) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${shortMonths[m - 1]}`;
  };
  const formatCash = (amount) => {
    const abs = Math.abs(Math.round(amount)).toLocaleString('en-AU');
    return amount < 0 ? `($${abs})` : `$${abs}`;
  };

  const zipPath = 'assets/examples/lumbridge/lumbridge-sample-pack.zip';
  const readZipText = (targetName) => {
    const buf = readFileSync(zipPath);
    let eocd = buf.length - 22;
    while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
    if (eocd < 0) throw new Error(`Missing ZIP EOCD in ${zipPath}`);
    let off = buf.readUInt32LE(eocd + 16);
    const count = buf.readUInt16LE(eocd + 10);
    for (let i = 0; i < count; i += 1) {
      if (buf.readUInt32LE(off) !== 0x02014b50) break;
      const method = buf.readUInt16LE(off + 10);
      const compSize = buf.readUInt32LE(off + 20);
      const nameLen = buf.readUInt16LE(off + 28);
      const extraLen = buf.readUInt16LE(off + 30);
      const commentLen = buf.readUInt16LE(off + 32);
      const localOff = buf.readUInt32LE(off + 42);
      const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
      if (name === targetName) {
        const lNameLen = buf.readUInt16LE(localOff + 26);
        const lExtraLen = buf.readUInt16LE(localOff + 28);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const data = buf.subarray(start, start + compSize);
        return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error(`Missing ZIP entry ${targetName}`);
  };

  const dailyRows = readZipText('lumbridge-services/daily-cash.csv').trim().split(/\r?\n/).slice(1)
    .map((line) => line.split(','));
  const openVRow = readZipText('lumbridge-services/data/invoices.csv').trim().split(/\r?\n/).slice(1)
    .map((line) => line.split(','))
    .find((cols) => cols[0] === 'OPEN-V');
  expect(openVRow).toBeTruthy();
  const openVCents = Math.round((Number(openVRow[3]) + Number(openVRow[4])) * 100);
  const openVBaseDate = openVRow[5];
  expect(openVBaseDate).toBe('2026-10-14');

  const expectedByDelay = new Map();
  const baseFlows = new Map(
    dailyRows.map(([date, receipts, payments]) => [
      date,
      Math.round(Number(receipts) * 100) - Math.round(Number(payments) * 100),
    ]),
  );
  const baseStartMs = Date.UTC(2026, 9, 1);
  for (const row of sensitivity.results) {
    const delay = String(row.delay_days);
    const flows = new Map(baseFlows);
    if (row.delay_days > 0) {
      flows.set(openVBaseDate, flows.get(openVBaseDate) - openVCents);
      flows.set(row.receipt_date, flows.get(row.receipt_date) + openVCents);
    }
    let balCents = 3000000;
    const states = [[0, 30000]];
    let minCents = balCents;
    let minDate = '2026-10-01';
    let negDays = 0;
    let receiptDay = -1;
    let receiptBalance = 0;
    for (let day = 1; day <= 91; day += 1) {
      const iso = new Date(baseStartMs + day * 86400000).toISOString().slice(0, 10);
      balCents += flows.get(iso) ?? 0;
      const whole = Math.round(balCents / 100);
      if (whole !== states.at(-1)[1]) states.push([day, whole]);
      if (balCents < minCents) {
        minCents = balCents;
        minDate = iso;
      }
      if (balCents < 0) negDays += 1;
      if (iso === row.receipt_date) {
        receiptDay = day;
        receiptBalance = whole;
      }
    }
    const scenario = SCENARIOS[delay];
    expect(scenario.states).toEqual(states);
    expect(minCents / 100).toBe(row.minimum_daily_cash);
    expect(minDate).toBe(row.minimum_date);
    expect(negDays).toBe(row.days_negative);
    expect(balCents / 100).toBe(row.december_closing_cash);
    expect(row.quarter_profit_before_tax).toBe(35957.55);
    expect(scenario.receiptDay).toBe(receiptDay);
    expect(scenario.lowValue).toBe(row.minimum_daily_cash);
    expect(negativeRuns(states).length).toBe(row.delay_days === 0 ? 0 : row.delay_days === 60 ? 2 : 1);
    expectedByDelay.set(delay, {
      states,
      receiptDay,
      receiptBalance,
      negPeriods: negativeRuns(states).length,
    });
  }

  const pageErrors = [];
  const cspViolations = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective}:${event.blockedURI}`);
    });
  });

  await page.goto('/');
  const figure = page.locator('.case-preview');
  const chart = figure.locator('[data-cash-chart]');
  const group = chart.getByRole('radiogroup', { name: 'Receipt delay (days)' });
  const minVal = chart.locator('[data-cash-min-value]');
  const minNote = chart.locator('[data-cash-min-note]');
  const deficit = chart.locator('[data-cash-deficit]');
  const line = chart.locator('[data-cash-line]');
  const negLine = chart.locator('[data-cash-neg-line]');
  const receiptLine = chart.locator('[data-cash-receipt-line]');
  const receiptDot = chart.locator('[data-cash-receipt-dot]');
  const receiptLabel = chart.locator('[data-cash-receipt-label]');
  const lowDot = chart.locator('[data-cash-low-dot]');
  const status = chart.locator('[data-cash-status]');

  await expect(figure.locator('a[href="/assets/examples/lumbridge/sensitivity.json"]')).toHaveText('Source data');
  await expect(chart.locator('.cash-chart__kpi dt').first()).toHaveText('Quarterly profit before tax');
  await expect(chart).toContainText('$35,957.55');
  await expect(chart.locator('svg')).toContainText('$67,320');
  await expect(group.getByRole('radio', { name: '45 days', exact: true })).toBeChecked();
  await expect(minVal).toHaveText('($25,160)');
  await expect(minNote).toHaveText('6 Nov · 16 days below $0');
  await expect(status).toHaveText('');

  // SSR 45-day paths and coordinates must match cash-chart.mjs SCENARIOS['45'].
  const ssr = SCENARIOS['45'];
  const ssrMeta = expectedByDelay.get('45');
  await expect(line).toHaveAttribute('d', buildStepPath(ssr.states));
  await expect(deficit).toHaveAttribute('d', buildDeficitPath(ssr.states));
  await expect(negLine).toHaveAttribute('d', buildNegativeStrokePath(ssr.states));
  await expect(receiptLine).toHaveAttribute('x1', String(xPos(ssrMeta.receiptDay)));
  await expect(receiptLine).toHaveAttribute('y2', String(yPos(ssrMeta.receiptBalance)));
  await expect(receiptDot).toHaveAttribute('cx', String(xPos(ssrMeta.receiptDay)));
  await expect(receiptDot).toHaveAttribute('cy', String(yPos(ssrMeta.receiptBalance)));
  await expect(lowDot).toHaveAttribute('cx', String(xPos(ssr.lowDay)));
  await expect(lowDot).toHaveAttribute('cy', String(yPos(ssr.lowValue)));

  let prevLine = '';
  for (const row of sensitivity.results) {
    const delay = String(row.delay_days);
    const meta = expectedByDelay.get(delay);
    await group.getByRole('radio', { name: `${delay} days`, exact: true }).check();
    await expect(chart).toHaveAttribute('data-state', row.days_negative === 0 ? 'ok' : 'alert');
    await expect(minVal).toHaveText(formatCash(row.minimum_daily_cash));
    const unit = row.days_negative === 1 ? 'day' : 'days';
    const expectedNote = meta.negPeriods > 1
      ? `${shortDate(row.minimum_date)} · ${row.days_negative} ${unit} below $0 (${meta.negPeriods} periods)`
      : `${shortDate(row.minimum_date)} · ${row.days_negative} ${unit} below $0`;
    await expect(minNote).toHaveText(expectedNote);
    await expect(receiptLabel).toHaveText(`OPEN-V receipt · ${shortDate(row.receipt_date)}`);
    const linePath = await line.getAttribute('d');
    expect(linePath).toBe(buildStepPath(meta.states));
    expect(linePath).toMatch(/^M 12 137/);
    expect(linePath).not.toBe(prevLine);
    prevLine = linePath;
    await expect(deficit).toHaveAttribute('d', buildDeficitPath(meta.states));
    await expect(negLine).toHaveAttribute('d', buildNegativeStrokePath(meta.states));
    await expect(receiptLine).toHaveAttribute('x1', String(xPos(meta.receiptDay)));
    await expect(receiptLine).toHaveAttribute('y2', String(yPos(meta.receiptBalance)));
    if (row.days_negative === 0) {
      expect(await deficit.getAttribute('d')).toBe('');
      expect(await negLine.getAttribute('d')).toBe('');
    } else {
      expect(await deficit.getAttribute('d')).not.toBe('');
      expect(await negLine.getAttribute('d')).not.toBe('');
    }
    await expect(status).toContainText(`${delay} days (${shortDate(row.receipt_date)} receipt)`);
    await expect(status).toContainText(formatCash(row.minimum_daily_cash));
    await expect(status).toContainText('Quarterly profit before tax remains $35,957.55.');
    if (meta.negPeriods > 1) {
      await expect(status).toContainText(`across ${meta.negPeriods} separate periods`);
    }
  }

  // Keyboard ArrowLeft from 60d moves back to 45d and restores the 16-day negative state.
  await page.keyboard.press('ArrowLeft');
  await expect(group.getByRole('radio', { name: '45 days', exact: true })).toBeChecked();
  await expect(minNote).toHaveText('6 Nov · 16 days below $0');

  // Print hides interactive delay controls and shows the static delay summary.
  await page.emulateMedia({ media: 'print' });
  await expect(group).toBeHidden();
  await expect(chart.locator('[data-cash-static-delay]')).toBeVisible();
  await expect(chart.locator('[data-cash-static-delay]')).toHaveText('45 days (28 Nov receipt)');
  await page.emulateMedia({ media: null });

  // Forced-colours mode distinguishes the checked delay option and keeps focus visible.
  await page.emulateMedia({ forcedColors: 'active' });
  const radio0 = group.getByRole('radio', { name: '0 days', exact: true });
  await radio0.focus();
  const checkedStyle = await group.locator('.cash-chart__option:has(:checked)').evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el).color,
  }));
  expect(checkedStyle.bg).not.toBe('rgba(0, 0, 0, 0)');
  await page.emulateMedia({ forcedColors: 'none' });

  // Narrowest 320px viewport keeps KPIs single-line, SVG labels unclipped, and controls >= 44px.
  const initialViewport = page.viewportSize();
  try {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    for (const kpi of await chart.locator('.cash-chart__kpi-value').all()) {
      const box = await kpi.boundingBox();
      expect(box.height).toBeLessThanOrEqual(28);
    }
    const svgCheck = await chart.locator('svg').evaluate((svg) => {
      const s = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('text')].map((node) => {
        const r = node.getBoundingClientRect();
        return {
          text: node.textContent,
          clipped: r.left < s.left - 1 || r.right > s.right + 1 || r.top < s.top - 1 || r.bottom > s.bottom + 1,
        };
      });
    });
    expect(svgCheck.filter((item) => item.clipped)).toEqual([]);
    for (const option of await group.locator('.cash-chart__option').all()) {
      const box = await option.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }

    // 200% enlarged root text keeps the homepage free of horizontal overflow and controls usable.
    await page.setViewportSize(initialViewport);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(initialViewport.width + 1);
    await expect(chart.locator('.cash-chart__kpis')).toBeVisible();
    await expect(group).toBeVisible();
  } finally {
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize(initialViewport);
  }

  // Toggle theme and verify zero runtime CSP violations across all interactions.
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  cspViolations.push(...(await page.evaluate(() => window.__cspViolations || [])));
  expect(cspViolations).toEqual([]);

  // JavaScript disabled keeps the static 45-day summary, KPIs, and SSR 45-day SVG without dead controls.
  const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto('/');
  await expect(noJsPage.locator('[data-cash-static-delay]')).toBeVisible();
  await expect(noJsPage.locator('[data-cash-static-delay]')).toHaveText('45 days (28 Nov receipt)');
  await expect(noJsPage.locator('[data-cash-controls]')).toBeHidden();
  await expect(noJsPage.locator('[data-cash-min-value]')).toHaveText('($25,160)');
  await expect(noJsPage.locator('[data-cash-line]')).toHaveAttribute('d', buildStepPath(ssr.states));
  await noJs.close();

  expect(pageErrors).toEqual([]);
  for (const [route, name] of [['/', 'Explore the cash flow example'], ['/tools/', 'Understand why profit and cash differ']]) {
    await page.goto(route);
    await page.getByRole('link', { name, exact: false }).click();
    await expect(page).toHaveURL(/\/examples\/profit-vs-cash-flow\/$/);
    await waitForVisualFonts(page);
    const downloadOffset = await page.locator('#try').evaluate((section) => (
      section.querySelector('a[download]').getBoundingClientRect().top
      - section.getBoundingClientRect().top
    ));
    expect(downloadOffset).toBeLessThan(500);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download the fictional Excel forecast', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('lumbridge.xlsx');
    expect(await download.failure()).toBeNull();
  }
  await page.goto('/about/');
  await page.locator('#work-samples').getByRole('link', { name: 'accounting review pipeline', exact: true }).click();
  await expect(page).toHaveURL(/\/evaluate\/#month-end-preview$/);
  const excerpt = page.getByRole('region', { name: 'Fictional month-end exception excerpt' });
  await expect(excerpt.getByRole('row')).toHaveCount(4);
  if (page.viewportSize().width < 704) {
    await excerpt.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => excerpt.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }
});
