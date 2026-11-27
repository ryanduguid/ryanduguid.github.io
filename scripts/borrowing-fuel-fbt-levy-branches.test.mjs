// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The borrowing expenses accounting column, the fuel tax credit basic heavy vehicle rows and
// refusals, the FBT loan and meal entertainment forms and the levy's annual salary branch: cases
// the pages' opening examples reach only in the browser, or not at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as calculations from '../assets/business-calculators.mjs';
import { borrowingFormInput, borrowingResult } from '../assets/borrowing-expenses.mjs';
import { fuelTaxCredits, fuelTaxCreditsResult } from '../assets/fuel-tax-credits.mjs';
import { fbtBenefitResult } from '../assets/fbt-benefit-forms.mjs';
import { compute, computeEntry } from '../assets/levy-form.mjs';
import { aud, formReader } from './form-fields.mjs';

const borrowingForm = readFileSync('_includes/calculators/borrowing-expenses.html', 'utf8');
const fuelForm = readFileSync('_includes/calculators/fuel-tax-credits.html', 'utf8');
const fbtLoanForm = readFileSync('_includes/calculators/fbt-loan.html', 'utf8');
const fbtMealForm = readFileSync('_includes/calculators/fbt-meal-entertainment.html', 'utf8');

/** Dollars from the pages' money text: '-$1,234.50' is -1234.5. @param {string} text */
const dollars = (text) => Number(text.replace(/[$,]/g, ''));

test('the borrowing accounting column sets each loan’s effective rate and the asked year’s costs beside section 25-25', () => {
  const r = borrowingResult(formReader(borrowingForm, { accounting: 'yes', 'qualifying-1': 'yes' }), aud);
  const rows = new Map(r.rows);
  for (const n of [1, 2]) assert.match(rows.get(`Loan ${n}: effective interest rate (AASB 9)`), /^\d+\.\d{4}% a year$/);
  const asked = r.tables.accounting.find((row) => row[0] === '2024-25');
  assert.deepEqual([rows.get('Accounting borrowing costs for 2024-25'), rows.get('Section 25-25 amount less accounting costs, 2024-25')],
    [asked[2], asked[3]]);
  const deductions = new Map(r.tables.years.map(([year, , deduction]) => [year, deduction]));
  for (const [year, tax, cost, difference] of r.tables.accounting) {
    assert.equal(tax, deductions.get(year) ?? aud(0), year);
    assert.equal(dollars(difference), Math.round((dollars(tax) - dollars(cost)) * 100) / 100, year);
  }
  assert.match(r.note, /Loan 1: a qualifying asset: these borrowing costs, with the interest, are capitalised/);
});

test('a borrowing form with use by year leaves a schedule refusal to the calculation', () => {
  const value = formReader(borrowingForm, { 'start-1': '2030-01-01', 'use-by-year-1': '2024-25 50' });
  assert.deepEqual(borrowingFormInput(value).loans[0].loan_start, '2030-01-01');
  assert.throws(() => borrowingResult(value, aud), { code: 'borrowing.loan_starts_after_year' });
});

test('the fuel tax credit basic method shows the public road and other litres at their own rates', () => {
  const r = fuelTaxCreditsResult(formReader(fuelForm, { 'basic-litres': '11430', 'basic-total-km': '32000', 'basic-weight': '32',
    'basic-acquired': '2026-09-30', 'small-claimant': 'yes' }), aud);
  const lines = r.rows.slice(0, -4).reduce((cents, [, credit]) => cents + Math.round(dollars(credit) * 100), 0);
  const total = (lines + 234743 + 21974) / 100;
  assert.deepEqual(r.rows.slice(-4), [
    ['Heavy vehicle: 11,020.8 litres on public roads (31,488 km × 0.35 L/km) at 21.3 cents a litre', '$2,347.43'],
    ['Heavy vehicle: the other 409.2 litres at 53.7 cents a litre', '$219.74'],
    ['Fuel tax credits', aud(total)],
    ['Label 7D on the BAS, in whole dollars', aud(Math.floor(total))]]);
});

test('fuel tax credits refuse a line, method or tax period they cannot work', () => {
  const line = { fuel: 'diesel', use: 'other_business', acquired: '2026-09-30', quantity: '1' };
  const method2 = (period, lines = [line]) => ({ year: '2026-27', small_claimant: true, rate_at_period_end: period, lines });
  const heavy = { method: 'basic_heavy_vehicle', fuel: 'diesel', acquired: '2026-09-30', litres: '100', total_km: '1000',
    rigid_truck_gross_weight_tonnes: '32' };
  for (const [input, code, message] of [
    [{ year: '2026-27', lines: [{ ...line, quantity: '-1' }] }, 'fuel_tax_credits.quantity_invalid', /^Line 1: enter the litres as a number of 0 or more/],
    [{ year: '2026-27', lines: [{ ...line, method: 'guess' }] }, 'fuel_tax_credits.method_invalid', /^Line 1: the method must be/],
    [method2('2026-07-01'), 'fuel_tax_credits.period_invalid', /first and last days/],
    [method2({ start: '2026-10-01', end: '2026-09-30' }), 'fuel_tax_credits.fact_conflict', /start on or before it ends/],
    [method2({ start: '2026-10-01', end: '2026-12-31' }), 'fuel_tax_credits.fact_conflict', /^Line 1 was acquired outside the tax period/],
    [method2({ start: '2026-07-01', end: '2026-09-30' }, [{ ...line, fuel: 'lpg' }]), 'fuel_tax_credits.simplified_method_unavailable',
      /covers liquid fuels only \(paragraph 4\(b\)\), not LPG/],
    [{ year: '2026-27', lines: [heavy] }, 'input.missing_field', /^Say whether the business is a small claimant/],
  ]) assert.throws(() => fuelTaxCredits(input), { code, message }, code);
});

/** The form a page include opens with: its data attributes as the browser's dataset. @param {string} include */
const pageForm = (include) => {
  const tag = /** @type {string} */ (include.match(/<form\b[^>]*>/)?.[0]);
  const dataset = Object.fromEntries([...tag.matchAll(/\bdata-([a-z-]+)="([^"]*)"/g)]
    .map(([, name, text]) => [name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), text]));
  return { dataset };
};

/** The opening example an include shows: its inputs, rows and principal row. @param {string} include */
const openingExample = (include) => {
  const [, inputs, rows, principal] = /** @type {RegExpMatchArray} */ (include.match(/\{% include calculator-example\.html inputs="([^"]*)" rows="([^"]*)" principal="(\d+)"/));
  return { inputs, rows: rows.split(';').map((row) => row.split('|')), principal: Number(principal) };
};

for (const [name, include] of [['FBT loan', fbtLoanForm], ['FBT meal entertainment 50/50 split', fbtMealForm]]) {
  test(`the ${name} form opens on the result its calculation gives`, () => {
    const value = formReader(include);
    const r = fbtBenefitResult(pageForm(include), calculations, { aud, value, money: (field) => aud(Number(value(field))) });
    assert.deepEqual({ inputs: r.inputs, rows: r.rows, principal: r.principal }, openingExample(include));
  });
}

test('the levy’s annual salary branch grosses up the sacrifice and adds only bonuses paid at least monthly', () => {
  const r = computeEntry({ reportingMonth: '2026-06', branch: 'annual', annualSalary: 10000, sacrificed: 500,
    bonuses: [{ amount: 200, frequency: 'monthly' }, { amount: 5000, frequency: 'annually' }] });
  assert.deepEqual(r, { branch: 's 3B(2)', eligibleWagesCents: 1070000, reportingMonth: '2026-06' });
});

test('the levy form reads each bonus row, a blank amount as nil', () => {
  const field = (value) => ({ value });
  const bonus = (amount, frequency) => {
    const parts = new Map([['.bonus-amount', field(amount)], ['.bonus-frequency', field(frequency)]]);
    return { querySelector: (selector) => parts.get(selector) };
  };
  const form = {
    elements: { reportingMonth: field('2026-06'), annualSalary: field('8000') },
    querySelector: () => field('annual'),
    querySelectorAll: (selector) => (selector === '.bonus-row' ? [bonus('300', 'fortnightly'), bonus('', 'weekly')] : []),
  };
  assert.equal(compute(form).eligibleWagesCents, 830000);
});
