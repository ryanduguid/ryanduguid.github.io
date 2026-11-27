// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The CGT page's share parcels form against the `cgt-parcels` command of ryanduguid/australian-accounting
// on every case of its differential fixture, with the boundaries of s 115-25(1), TD 33 para 4 matching
// and the page's own lines.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { cgtParcels } from '../assets/cgt-parcels.mjs';
import { cgtParcelsResult, parcelLines, saleLines } from '../assets/cgt-parcels-page.mjs';

const fixture = createRequire(import.meta.url)('./cgt-parcels-engine-differential.json');
const page = readFileSync('_includes/cgt-parcels.html', 'utf8');
const sources = readFileSync('_includes/calculators/cgt.html', 'utf8');
const pick = (r) => ({ amounts: r.amounts, rates: r.rates, matches: r.matches, holdings: r.holdings });
const code = (run) => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return 'computed';
};
const base = { entity: 'individual', identification: 'first_in_first_out', other_discount_capital_gains: '0', other_capital_gains: '0',
  other_capital_losses: '0', prior_net_capital_losses: '0', year: '2025-26', scope_confirmed: true };
const parcel = (id, acquired, units, cost) => ({ parcel: id, security: 'ABC', acquired, units, acquisition_cost: cost, incidental_costs: '0' });
const sale = (date, units, proceeds) => ({ security: 'ABC', date, units, capital_proceeds: proceeds, incidental_costs: '0' });

test('the form agrees with the australian-accounting command on every differential case', () => {
  assert.ok(fixture.cases.length >= 280, 'the fixture keeps its cases');
  for (const c of fixture.cases) {
    let got;
    try {
      got = pick(cgtParcels(c.call));
    } catch (error) {
      if (!error.code) throw error;
      got = { refused: error.code };
    }
    assert.deepEqual(got, c.refused ? { refused: c.refused } : c.result, c.source);
  }
});

test('the 12 months leave out the day bought and the day sold (s 115-25(1))', () => {
  const run = (date) => cgtParcels({ ...base, parcels: [parcel('A', '2024-08-01', '10', '100')], disposals: [sale(date, '10', '200')] });
  assert.equal(run('2025-08-02').matches[0].discount.startsWith('discount'), true);
  assert.equal(run('2025-08-01').matches[0].discount.startsWith('not'), true);
  const leap = (date) => cgtParcels({ ...base, parcels: [parcel('A', '2025-02-27', '10', '100')], disposals: [sale(date, '10', '200')] });
  assert.equal(leap('2026-02-28').matches[0].discount.startsWith('discount'), true);
  assert.equal(leap('2026-02-27').matches[0].discount.startsWith('not'), true);
});

test('first in, first out takes the earliest parcel, and shares round half up to the cent', () => {
  const r = cgtParcels({ ...base, parcels: [parcel('B', '2023-01-01', '3', '100'), parcel('A', '2021-01-01', '3', '10')],
    disposals: [sale('2026-01-10', '4', '100')] });
  assert.deepEqual(r.matches.map((m) => [m.parcel, m.units, m.cost_base, m.capital_proceeds]), [['A', '3', '10.00', '75.00'], ['B', '1', '33.33', '25.00']]);
  assert.deepEqual(r.holdings.map((h) => [h.parcel, h.units, h.cost_base]), [['B', '2', '66.67']]);
});

test('a complying super fund takes a third off, rounding once', () => {
  const r = cgtParcels({ ...base, entity: 'complying_superannuation_entity', parcels: [parcel('A', '2020-01-01', '1', '0')],
    disposals: [sale('2026-01-10', '1', '100')] });
  assert.equal(r.amounts.discount, '33.33');
  assert.equal(r.amounts.net_capital_gain, '66.67');
});

test('losses go first against gains that are not discount gains (s 102-5(1) step 1)', () => {
  const r = cgtParcels({ ...base, other_capital_losses: '50', prior_net_capital_losses: '500',
    parcels: [parcel('A', '2020-01-01', '1', '0'), parcel('B', '2025-12-01', '1', '0')],
    disposals: [sale('2026-01-10', '1', '100'), sale('2026-01-11', '1', '80')] });
  assert.equal(r.amounts.losses_applied_to_other_gains, '50.00');
  assert.equal(r.amounts.prior_losses_applied_to_other_gains, '30.00');
  assert.equal(r.amounts.prior_losses_applied_to_discount_gains, '100.00');
  assert.equal(r.amounts.net_capital_losses_carried_forward, '370.00');
});

test('the command refuses what it does not work', () => {
  const one = { parcels: [parcel('A', '2020-01-01', '10', '100')], disposals: [sale('2026-01-10', '10', '200')] };
  assert.equal(code(() => cgtParcels({ ...base, ...one, parcels: [parcel('A', '1999-09-21', '10', '100')] })), 'cgt_parcels.indexation_or_pre_cgt');
  assert.equal(code(() => cgtParcels({ ...base, ...one, disposals: [sale('2026-01-10', '11', '200')] })), 'cgt_parcels.units_not_held');
  assert.equal(code(() => cgtParcels({ ...base, ...one, year: '2027-28' })), 'period.unsupported');
  assert.equal(code(() => cgtParcels({ ...base, ...one, entity: 'company', other_discount_capital_gains: '1' })), 'cgt_parcels.fact_conflict');
  assert.equal(code(() => cgtParcels({ ...base, ...one, other_capital_gains: '1e2' })), 'input.decimal_unreadable');
  assert.equal(code(() => cgtParcels({ ...base, ...one })), 'computed');
});

test('the page reads its lines and shows the result in its own words', () => {
  assert.deepEqual(parcelLines('A ABC 2020-08-03 1000 5200 19.95 5'), [{ parcel: 'A', security: 'ABC', acquired: '2020-08-03', units: '1000',
    acquisition_cost: '5200', incidental_costs: '19.95', ownership_costs: '5' }]);
  assert.deepEqual(saleLines('ABC 2026-02-02 10 100 0 A:4 B:6', true)[0].parcels, [{ parcel: 'A', units: '4' }, { parcel: 'B', units: '6' }]);
  assert.throws(() => saleLines('ABC 2026-02-02 10 100 0 A:4', false), /Sale line 1/);
  const fields = new Map([['entity', 'individual'], ['identification', 'first_in_first_out'], ['year', '2025-26'],
    ['parcel-lines', 'A ABC 2020-08-03 1000 5200 19.95\nB ABC 2025-09-15 1000 8000 19.95'], ['sale-lines', 'ABC 2026-02-02 1500 13500 29.95']]);
  const r = cgtParcelsResult((name) => fields.get(name) ?? '', (n) => `$${n.toFixed(2)}`);
  assert.deepEqual(r.rows[r.principal], ['Net capital gain', '$2360.08']);
  assert.equal(r.rows.at(-1)[0], 'Still held: parcel B, 500 ABC');
  fields.set('parcel-lines', 'A ABC 2020-08-03 1000 5200 1.999');
  assert.throws(() => cgtParcelsResult((name) => fields.get(name) ?? '', String), /the buying or selling costs must be/);
  assert.ok(page.includes('data-calculator="cgt-parcels"') && sources.includes('TD33'));
});
