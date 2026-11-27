// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The fuel tax credits engine's refusals of malformed lines and periods, and the page's wording of
// the basic heavy vehicle method, Method 1, singular quantities and results without a warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuelFormInput, fuelInputsText, fuelTaxCredits, fuelTaxCreditsResult } from '../assets/fuel-tax-credits.mjs';

const aud = (/** @type {number} */ value) => `$${value.toFixed(2)}`;
const LINE = { fuel: 'diesel', use: 'other_business', acquired: '2025-08-01', quantity: '100' };
const COST = { method: 'litres_from_cost', fuel: 'diesel', use: 'other_business', acquired: '2025-08-01', cost: '200', average_price_cents_per_litre: '200' };
const HEAVY = { method: 'basic_heavy_vehicle', fuel: 'diesel', acquired: '2025-08-01', litres: '1000', total_km: '1000', rigid_truck_gross_weight_tonnes: '10' };
const work = (lines, more = {}) => fuelTaxCredits({ year: '2025-26', lines, ...more });
const refused = (lines, code, more = {}) => assert.throws(() => work(lines, more), { code }, JSON.stringify({ lines, more }));
const without = (line, key) => Object.fromEntries(Object.entries(line).filter(([name]) => name !== key));

test('lines that are not lines, or lack a fuel, day, use or cost, are refused', () => {
  refused(['diesel'], 'fuel_tax_credits.lines_invalid');
  refused([{ ...LINE, colour: 'red' }], 'input.field_unknown');
  refused([without(LINE, 'fuel')], 'input.missing_field');
  refused([without(LINE, 'acquired')], 'input.missing_field');
  refused([without(LINE, 'use')], 'input.missing_field');
  refused([without(COST, 'cost')], 'input.missing_field', { small_claimant: true });
  refused([without(HEAVY, 'litres')], 'input.missing_field', { small_claimant: true });
});

test('malformed days, quantities, costs and prices are refused', () => {
  refused([{ ...LINE, acquired: 20250801 }], 'input.date_invalid');
  refused([{ ...LINE, quantity: 100 }], 'fuel_tax_credits.quantity_invalid');
  refused([{ ...LINE, quantity: '1'.repeat(33) }], 'fuel_tax_credits.quantity_invalid');
  refused([{ ...LINE, quantity: '1000000000001' }], 'fuel_tax_credits.quantity_invalid');
  refused([{ ...COST, cost: 'two hundred' }], 'input.amount_invalid', { small_claimant: true });
  refused([{ ...COST, average_price_cents_per_litre: '0' }], 'fuel_tax_credits.quantity_invalid', { small_claimant: true });
  refused([{ ...HEAVY, public_road_km: '900' }], 'fuel_tax_credits.fact_conflict', { small_claimant: true });
  refused([{ ...without(HEAVY, 'rigid_truck_gross_weight_tonnes'), litres_per_km: '0' }], 'fuel_tax_credits.quantity_invalid', { small_claimant: true });
});

test('an unknown input, a stray or non-boolean small claimant answer and a malformed tax period are refused', () => {
  refused([LINE], 'input.field_unknown', { colour: 'red' });
  refused([LINE], 'input.field_unknown', { small_claimant: true });
  refused([COST], 'input.flag_invalid', { small_claimant: 'yes' });
  const period = (rate) => ({ small_claimant: true, rate_at_period_end: rate });
  refused([LINE], 'input.field_unknown', period({ start: '2025-07-01', end: '2025-09-30', length: 'quarter' }));
  refused([LINE], 'input.date_invalid', period({ end: '2025-09-30' }));
  refused([LINE], 'input.date_invalid', period({ start: '2025-07-01' }));
});

test('a light vehicle on a public road and a nil quantity earn no credit', () => {
  const [light, nil] = work([{ ...LINE, use: 'light_vehicle_public_road' }, { ...LINE, quantity: '0' }]).lines;
  assert.deepEqual([light.rateCents, light.credit], ['0', 0]);
  assert.deepEqual([nil.quantity, nil.credit], ['0', 0]);
});

const form = (fields) => { const map = new Map(Object.entries(fields)); return (name) => map.get(name) ?? ''; };

test('the form refuses a line with both a quantity and a cost, and carries the tax period and return day', () => {
  assert.throws(() => fuelFormInput(form({ year: '2025-26', 'fuel-1': 'diesel', 'quantity-1': '5', 'cost-1': '10' })),
    { message: 'Line 1: enter the litres, or the cost and the average price, not both.' });
  assert.throws(() => fuelFormInput(form({ year: '2025-26', 'fuel-1': 'kerosene', 'quantity-1': '5', 'price-1': '10' })),
    { message: 'Line 1: enter the quantity, or the cost and the average price, not both.' });
  const input = fuelFormInput(form({ year: '2025-26', 'fuel-1': 'diesel', 'use-1': 'other_business', 'acquired-1': '2025-08-01',
    'quantity-1': '1', 'period-start': '2025-07-01', 'period-end': '2025-09-30', 'return-date': '2025-10-28', 'small-claimant': 'yes' }));
  assert.deepEqual([input.rate_at_period_end, input.small_claimant, input.return_date],
    [{ start: '2025-07-01', end: '2025-09-30' }, true, '2025-10-28']);
});

test('the page writes the basic method by total kilometres and truck weight, a single kilogram and the return day', () => {
  assert.equal(fuelInputsText({ year: '2025-26', lines: [HEAVY, { ...LINE, fuel: 'lng_cng', quantity: '1' }], return_date: '2025-10-28' }, aud),
    '2025-26; heavy vehicle (basic method): 1,000 litres of diesel acquired 1 August 2025, 1,000 km in total, a 10 tonne rigid truck; '
      + `line 2: 1 kilogram of ${'LNG or CNG'} acquired 1 August 2025, other business use; return given 28 October 2025`);
});

test('result rows show the heavy vehicle split and Method 1, with no note when nothing warns', () => {
  const result = fuelTaxCreditsResult(form({ year: '2025-26', 'fuel-1': 'diesel', 'use-1': 'other_business', 'acquired-1': '2025-08-01',
    'cost-1': '200', 'price-1': '200', 'basic-litres': '1000', 'basic-total-km': '1000', 'basic-weight': '10',
    'basic-acquired': '2025-08-01', 'small-claimant': 'yes' }), aud);
  const labels = result.rows.map(([label]) => label);
  // 50.8 cents a litre is the ATO's published rate for diesel in other business use from 1 July 2025 (QC105117 Table 4).
  assert.equal(labels[0], 'Line 1: 100.0000 litres worked out from the cost (PCG 2016/2 Method 1), other business use, at 50.8 cents a litre from 1 July 2025');
  assert.deepEqual(result.rows[0][1], '$50.80');
  assert.match(labels[1], /^Heavy vehicle: [\d,.]+ litres on public roads \(984 km × [\d.]+ L\/km\) at [\d.]+ cents a litre$/);
  assert.match(labels[2], /^Heavy vehicle: the other [\d,.]+ litres at 50\.8 cents a litre$/);
  assert.equal(result.note, undefined);
});

test('the page writes the basic method by public road kilometres and litres a kilometre', () => {
  const heavy = { ...HEAVY, total_km: undefined, rigid_truck_gross_weight_tonnes: undefined, public_road_km: '900', litres_per_km: '0.5' };
  assert.equal(fuelInputsText({ year: '2025-26', lines: [heavy] }, aud),
    '2025-26; heavy vehicle (basic method): 1,000 litres of diesel acquired 1 August 2025, 900 public road km, 0.5 L/km');
});

test('a gas line is rated by the kilogram and a return over 4 years later is noted', () => {
  const result = fuelTaxCreditsResult(form({ year: '2025-26', 'fuel-1': 'lng_cng', 'use-1': 'other_business', 'acquired-1': '2025-08-01',
    'quantity-1': '10', 'return-date': '2029-08-02' }), aud);
  assert.match(result.rows[0][0], /^Line 1: 10 kilograms, other business use, at [\d.]+ cents a kilogram from /);
  assert.match(result.note ?? '', /^Fuel Tax Act 2006 subsection 47-5\(2\): the entitlement for line 1 ceases unless/);
});
