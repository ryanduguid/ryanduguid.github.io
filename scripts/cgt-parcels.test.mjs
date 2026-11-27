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
import { cgtParcelsResult, inPageWords, parcelLines, saleLines } from '../assets/cgt-parcels-page.mjs';

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

test('refusals keep the command\'s words, and the page names its own lines and inputs', () => {
  // The command's message on 27 November 2026 for selected parcels that do not add up to the sale.
  const two = [parcel('A', '2020-01-01', '10.5', '100'), parcel('B', '2021-01-01', '5.25', '100')];
  const picks = [{ parcel: 'A', units: '4.50' }, { parcel: 'B', units: '1' }];
  assert.throws(() => cgtParcels({ ...base, identification: 'selected', parcels: two, disposals: [{ ...sale('2026-01-10', '6', '200'), parcels: picks }] }),
    { message: "disposal 1: the selected parcels' units add up to 5.50, not the 6 disposed of." });
  assert.equal(inPageWords('disposal 2: 12 units of ABC are disposed of, 2 more than the parcels acquired by then still hold.'),
    'Sale line 2: 12 units of ABC are disposed of, 2 more than the parcels acquired by then still hold.');
  assert.equal(inPageWords('parcel 1: incidental_costs must be a finite non-negative decimal string, at most 2dp and 1e12.'),
    'Parcel line 1: the buying or selling costs must be a finite non-negative decimal string, at most 2dp and 1e12.');
  assert.equal(inPageWords('disposal 1, selected parcel 2: units is required.'), 'Sale line 1, selected parcel 2: the number of units is required.');
  assert.throws(() => parcelLines('A ABC 2020-08-03 1000 5200'), { message: /^Parcel line 1: enter a name, the code, the purchase date, the units,/ });
  const fields = new Map([['entity', 'company'], ['identification', 'first_in_first_out'], ['year', '2025-26'],
    ['parcel-lines', 'A ABC 2020-08-03 1000 5200 19.95'], ['sale-lines', 'ABC 2026-02-02 900 13500 29.95']]);
  const rows = cgtParcelsResult((name) => fields.get(name) ?? '', (n) => `$${n.toFixed(2)}`).rows;
  assert.deepEqual(rows.find(([label]) => label.startsWith('CGT discount')), ['CGT discount: none for a company', '$0.00']);
  fields.set('entity', 'complying_superannuation_entity');
  assert.equal(cgtParcelsResult((name) => fields.get(name) ?? '', String).rows.find(([label]) => label.startsWith('CGT discount'))[0], 'CGT discount of 33 1/3%');
});

// Each input's code from the australian-accounting release build (main 7f3c3eb), 27 November 2026.
test('the command reads each input as australian-accounting does, refusing what it refuses', () => {
  const without = (o, key) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
  const one = { parcels: [parcel('A', '2020-01-01', '10', '100')], disposals: [sale('2026-01-10', '10', '200')] };
  const ok = { ...base, ...one };
  const withParcel = (over) => ({ ...ok, parcels: [{ ...one.parcels[0], ...over }] });
  const selected = (picks) => ({ ...ok, identification: 'selected', disposals: [{ ...one.disposals[0], parcels: picks }] });
  const inputs = [
    null, [], { ...ok, colour: 'red' }, without(ok, 'year'), { ...ok, other_capital_gains: '1'.repeat(9000) },
    { ...ok, other_capital_gains: 'NaN' }, { ...ok, other_capital_gains: '-1' }, { ...ok, scope_confirmed: false },
    { ...ok, entity: 'partnership' }, { ...ok, identification: 'average' }, { ...ok, parcels: 'A' }, { ...ok, parcels: [1] },
    { ...ok, disposals: [] }, withParcel({ parcel: 5 }), withParcel({ acquired: 20200101 }), withParcel({ acquired: '2020-1-01' }),
    withParcel({ acquired: '2020-02-30' }), withParcel({ acquired: '1899-12-31' }), withParcel({ units: '0' }), withParcel({ units: 5 }),
    withParcel({ units: '1.5.0' }), withParcel({ units: '.5' }), withParcel({ units: '5.' }), withParcel({ title_costs: '1.234' }),
    { ...ok, parcels: [without(one.parcels[0], 'acquisition_cost')] }, { ...ok, parcels: [one.parcels[0], one.parcels[0]] },
    withParcel({ acquired: '2026-07-01' }), { ...ok, disposals: [sale('2026-07-01', '10', '200')] },
    selected('A'), selected([]), selected([1]), selected([{ parcel: 'A', units: '5' }, { parcel: 'A', units: '5' }]),
    selected([{ parcel: 'B', units: '10' }]), selected([{ parcel: 'A', units: '11' }]), selected([{ parcel: 'A', units: '9' }]),
    selected([{ parcel: 'A', units: '10' }]),
    { ...selected([{ parcel: 'A', units: '10' }]), parcels: [{ ...one.parcels[0], security: 'XYZ' }] },
    { ...selected([{ parcel: 'A', units: '10' }]), parcels: [{ ...one.parcels[0], acquired: '2026-02-01' }] },
    { ...ok, parcels: [{ ...one.parcels[0], security: 'XYZ' }, parcel('B', '2026-02-01', '10', '1')] },
    { ...ok, other_capital_gains: ' 2.5 ' }, { ...ok, other_capital_gains: '+2.5' }, { ...ok, other_capital_gains: '-0' },
    { ...ok, other_capital_gains: 'Infinity' }, { ...ok, other_capital_gains: '1e2' },
  ];
  const want = [
    'input.not_object', 'input.not_object', 'input.field_unknown', 'input.missing_field',
    'input.decimal_too_long', 'input.amount_invalid', 'input.amount_invalid', 'scope.not_confirmed',
    'cgt_parcels.entity_invalid', 'cgt_parcels.identification_invalid', 'cgt_parcels.list_invalid', 'cgt_parcels.list_invalid',
    'cgt_parcels.list_invalid', 'cgt_parcels.fact_invalid', 'cgt_parcels.fact_invalid', 'cgt_parcels.fact_invalid',
    'cgt_parcels.fact_invalid', 'cgt_parcels.fact_invalid', 'cgt_parcels.fact_invalid', 'cgt_parcels.fact_invalid',
    'cgt_parcels.fact_invalid', 'cgt_parcels.fact_invalid', 'cgt_parcels.fact_invalid', 'cgt_parcels.fact_invalid',
    'cgt_parcels.fact_missing', 'cgt_parcels.fact_conflict', 'cgt_parcels.fact_conflict', 'cgt_parcels.fact_conflict',
    'cgt_parcels.fact_invalid', 'cgt_parcels.fact_invalid', 'cgt_parcels.fact_invalid', 'cgt_parcels.fact_conflict',
    'cgt_parcels.fact_conflict', 'cgt_parcels.units_not_held', 'cgt_parcels.fact_conflict', 'computed',
    'cgt_parcels.fact_conflict', 'cgt_parcels.fact_conflict', 'cgt_parcels.units_not_held', 'computed',
    'input.decimal_unreadable', 'computed', 'input.amount_invalid', 'input.decimal_unreadable',
  ];
  assert.equal(inputs.length, want.length);
  inputs.forEach((input, i) => assert.equal(code(() => cgtParcels(input)), want[i], JSON.stringify(input)?.slice(0, 120)));
});

test('the 12 months from 28 February 2024 end on 28 February 2025, so the discount starts on 1 March', () => {
  const run = (date) => cgtParcels({ ...base, parcels: [parcel('A', '2024-02-28', '10', '100')], disposals: [sale(date, '10', '200')] }).matches[0];
  assert.equal(run('2025-03-01').discount.startsWith('discount'), true);
  assert.equal(run('2025-02-28').discount.startsWith('not'), true);
  assert.deepEqual([run('2025-03-01').counted, run('2025-03-01').income_year], [false, '2024-25']);
});

test('the page shows losses, sales outside the year, the optional costs and what it refuses', () => {
  assert.deepEqual(parcelLines('A ABC 2020-08-03 1000 5200 19.95 5 6 7')[0], { parcel: 'A', security: 'ABC', acquired: '2020-08-03', units: '1000',
    acquisition_cost: '5200', incidental_costs: '19.95', ownership_costs: '5', capital_expenditure: '6', title_costs: '7' });
  assert.equal(Object.hasOwn(parcelLines('A ABC 2020-08-03 1000 5200 19.95 5 6')[0], 'title_costs'), false);
  assert.throws(() => parcelLines('A ABC 2020-08-03 1000 5200 19.95 5 6 7 8'), /Parcel line 1/);
  assert.throws(() => saleLines('ABC 2026-02-02 10 100 0', true), /each parcel sold as name:units, separated/);
  assert.throws(() => saleLines('ABC 2026-02-02 10 100', false), /Sale line 1/);
  assert.throws(() => saleLines('ABC 2026-02-02 10 100 0 :4', true), /such as A:100/);
  const fields = new Map([['entity', 'individual'], ['identification', 'selected'], ['year', '2025-26'], ['prior-losses', '700'],
    ['parcel-lines', 'A ABC 2020-08-03 10 1000 0\nB ABC 2025-01-15 10 100 0'],
    ['sale-lines', 'ABC 2025-06-30 5 50 0 A:5\nABC 2026-01-10 5 300 0 B:5\nABC 2026-01-11 5 100 0 A:5']]);
  const value = (/** @type {string} */ name) => fields.get(name) ?? '';
  const r = cgtParcelsResult(value, String);
  assert.deepEqual(r.rows.slice(0, 3).map(([, shown]) => shown), ['Sold in 2024-25, outside the year: proceeds 50, cost base 500, loss 450',
    'proceeds 300, cost base 50, gain 250, no discount', 'proceeds 100, cost base 500, loss 400']);
  assert.deepEqual(r.rows.find(([label]) => label.startsWith('Net capital losses carried')), ['Net capital losses carried forward (label V), whole dollars', '$850']);
  assert.equal(r.inputs, '2 parcels and 3 sales, matched as selected, for 2025-26');
  fields.set('identification', 'first_in_first_out').set('sale-lines', 'ABC 2026-01-10 1 300 0').set('parcel-lines', 'B ABC 2025-12-15 10 100 0');
  const short = cgtParcelsResult(value, String);
  assert.equal(short.inputs, '1 parcel and 1 sale, matched first in, first out, for 2025-26');
  assert.equal(short.rows[0][1], 'proceeds 300, cost base 10, gain 290, no discount');
  fields.set('year', '2027-28');
  assert.throws(() => cgtParcelsResult(value, String), { code: 'period.unsupported' });
});

test('a fact refusal naming an input the form has no words for keeps its name', () => {
  assert.equal(inPageWords('disposal 1: parcels must be a non-empty list of objects, each with parcel and units.'),
    'Sale line 1: parcels must be a non-empty list of objects, each with parcel and units.');
});
