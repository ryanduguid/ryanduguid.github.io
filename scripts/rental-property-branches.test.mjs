// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The rental property engine's refusals of malformed input, and the page's wording of a disposal, nil
// capital works and assets, and each capital works rate. Every refusal code and amount agrees with the
// australian-accounting v1.4.0 release binary's rental-property command on the same input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rentalProperty } from '../assets/rental-property.mjs';
import { rentalPropertyResult } from '../assets/rental-property-result.mjs';
import { aud, formReader } from './form-fields.mjs';

const BASE = { ownership_share: '1', acquired: '2020-07-01', disposed: null, days_available: 330, section_26_50_applies: false,
  income: { rental_income: '50000.00' }, expenses: { sundry: '37000.00' }, rental_only_expenses: { property_agent_fees: '3000.00' },
  loans: [], borrowing_loans: [], capital_works: [], depreciating_assets: [], year: '2025-26', scope_confirmed: true };
const LOAN = { interest: '1000.00', principal_for_rental: '100.00', principal_total: '100.00', redrawn_in_year: false };
const WORKS = { construction_expenditure: '100000.00', kind: 'building', began: '2000-01-01', first_used: '2000-06-01' };
const ASSET = { decline_in_value: '100.00', acquired: '2017-01-01', first_used: '2017-01-01', held_when_first_used: true,
  residence_or_private_use: false, low_value_pool: false };
const without = (/** @type {Record<string, unknown>} */ o, /** @type {string} */ k) => Object.fromEntries(Object.entries(o).filter(([n]) => n !== k));
const refused = (/** @type {Record<string, unknown>} */ changes, /** @type {string} */ code, /** @type {Record<string, unknown>} */ input = { ...BASE, ...changes }) =>
  assert.throws(() => rentalProperty(input), { code }, JSON.stringify(changes).slice(0, 200));

test('amounts and decimals that are not text, too long or unreadable are refused with the command’s codes', () => {
  refused({ income: { rental_income: 50000 } }, 'input.amount_invalid');
  refused({ income: { rental_income: '1'.repeat(33) } }, 'input.amount_invalid');
  assert.throws(() => rentalProperty({ ...BASE, ownership_share: 0.5 }), { code: 'rental_property.fact_invalid',
    message: 'ownership_share must be a decimal fraction above 0 and at most 1.' });
  assert.throws(() => rentalProperty({ ...BASE, ownership_share: '1'.repeat(8193) }), { code: 'input.decimal_too_long',
    message: 'ownership_share: decimal input exceeds 8192 bytes' });
  refused({ ownership_share: 'half' }, 'input.decimal_unreadable');
  assert.throws(() => rentalProperty({ ...BASE, other_taxable_income: 100 }), { code: 'input.amount_invalid',
    message: 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.' });
  refused({ other_taxable_income: '1'.repeat(8193) }, 'input.decimal_too_long');
});

test('days held and available that are not dates or whole numbers, or fall outside the year, are refused', () => {
  refused({ acquired: 20200701 }, 'input.date_invalid');
  refused({ acquired: '2020-7-1' }, 'input.date_invalid');
  refused({ disposed: '2026-02-30' }, 'input.date_invalid');
  refused({ disposed: 5 }, 'rental_property.fact_invalid');
  refused({ acquired: '2026-08-01' }, 'rental_property.fact_conflict');
  refused({ days_available: 330.5 }, 'rental_property.fact_invalid');
  refused({ days_available: '330' }, 'rental_property.fact_invalid');
});

test('lines, lists and list items of the wrong shape are refused', () => {
  refused({ income: 'lots' }, 'rental_property.fact_invalid');
  refused({ loans: 'none' }, 'rental_property.fact_invalid');
  refused({ loans: ['x'] }, 'rental_property.fact_invalid');
  refused({ loans: [{ ...LOAN, colour: 'red' }] }, 'input.field_unknown');
  refused({ loans: [without(LOAN, 'principal_total')] }, 'input.missing_field');
  refused({ loans: [{ ...LOAN, redrawn_in_year: 'no' }] }, 'input.flag_invalid');
  refused({ capital_works: [{ ...WORKS, began: 'soon' }] }, 'rental_property.fact_invalid');
  assert.throws(() => rentalProperty({ ...BASE, depreciating_assets: [ASSET] }), { code: 'input.missing_field',
    message: /deductible_in_2016_17 is required for an asset acquired before 9 May 2017/ });
});

test('other taxable income below a cent, negative or taking the total past the cap is refused', () => {
  refused({ other_taxable_income: '100.001' }, 'input.amount_invalid');
  refused({ other_taxable_income: '-5' }, 'input.amount_invalid');
  refused({ other_taxable_income: '1000000000000' }, 'input.amount_invalid');
});

test('an unknown or missing input, no borrowing input and a s 26-50 answer that is not yes or no are refused', () => {
  refused({ colour: 'red' }, 'input.field_unknown');
  refused({}, 'input.missing_field', without(BASE, 'income'));
  refused({}, 'input.missing_field', without(BASE, 'borrowing_loans'));
  refused({ section_26_50_applies: 'no' }, 'input.flag_invalid');
});

const FORM = readFileSync('_includes/calculators/rental-property.html', 'utf8');
const SOLD = { disposed: '2026-03-31', days: '200',
  'works-cost-1': '100000', 'works-kind-1': 'building', 'works-began-1': '1978-01-01', 'works-first-1': '1979-01-01',
  'works-cost-2': '50000', 'works-kind-2': 'structural_improvement', 'works-began-2': '2010-01-01', 'works-first-2': '2010-06-01',
  'asset-decline-1': '500', 'asset-acquired-1': '2020-07-01', 'asset-first-1': '2020-07-01', 'asset-held-1': 'yes', 'asset-private-1': 'yes',
  'asset-pool-1': 'no' };

test('a property sold in the year with a pre-1979 building, a structural improvement and a private use asset', () => {
  const r = rentalPropertyResult(formReader(FORM, SOLD), aud);
  assert.ok(r.inputs.includes('; held from 20 July 2025 to 31 March 2026; 200 days let or available;'), r.inputs);
  const rows = new Map(r.tables.deductions);
  assert.equal(rows.get('Asset 1: decline in value $500.00, nil under s 40-27'), '$0.00');
  assert.equal(rows.get('Capital works 1: building begun 1 January 1978, nil'), '$0.00');
  assert.equal(rows.get('Capital works 2: structural improvement begun 1 January 2010, 2.5% for 200 days, $31,068.49 undeducted'), '$684.93');
  assert.ok(r.note.includes('Asset 1 is nil: used in one of your residences or for a non-taxable purpose not occasionally (s 40-27(2)(d)). '
    + 'Capital works 1 is nil: a building begun before 22 August 1979, to which Division 43 does not apply (s 43-20(1)).'), r.note);
});

test('a building begun from 18 July 1985 to 15 September 1987 is written off at 4%', () => {
  const r = rentalPropertyResult(formReader(FORM, { ...SOLD, 'works-began-1': '1986-01-01', 'works-first-1': '1986-06-01' }), aud);
  const label = r.tables.deductions.find(([name]) => name.startsWith('Capital works 1:'));
  assert.deepEqual(label, ['Capital works 1: building begun 1 January 1986, 4% for 200 days, $0.00 undeducted', '$0.00']);
  assert.ok(!r.note.includes('Capital works 1 is nil'), r.note);
});
