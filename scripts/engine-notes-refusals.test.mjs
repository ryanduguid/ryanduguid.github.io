// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Notes, rows and refusals of the calculator engines that their opening examples and suites do not
// reach: offsets, the surcharge and rebate, residency, pensions, rental property, owner pay, the
// contractor screen, the SG charge, CGT, the franking account, luxury car tax, leases and deferred tax.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as calculations from '../assets/business-calculators.mjs';
import { invalidCarerOffset, zoneOffset } from '../assets/individual-offsets.mjs';
import { individualResult } from '../assets/individual-tax-results.mjs';
import { medicareLevySurcharge } from '../assets/income-tax.mjs';
import { residencyDaysResult } from '../assets/residency-days.mjs';
import { pensionMinimumResult } from '../assets/pension-minimum.mjs';
import { rentalPropertyResult } from '../assets/rental-property-result.mjs';
import { deferredTax } from '../assets/deferred-tax.mjs';
import { aud, formReader } from './form-fields.mjs';

const FORMS = new Map([
  ['income-tax', readFileSync('_includes/calculators/income-tax.html', 'utf8')],
  ['residency-days', readFileSync('_includes/calculators/residency-days.html', 'utf8')],
  ['pension-minimum', readFileSync('_includes/calculators/pension-minimum.html', 'utf8')],
  ['rental-property', readFileSync('_includes/calculators/rental-property.html', 'utf8')],
  ['contractor-employee', readFileSync('_includes/calculators/contractor-employee.html', 'utf8')],
  ['sgc-payday', readFileSync('_includes/calculators/sgc-payday.html', 'utf8')],
  ['cgt', readFileSync('_includes/calculators/cgt.html', 'utf8')],
  ['franking-account', readFileSync('_includes/calculators/franking-account.html', 'utf8')],
  ['luxury-car-tax', readFileSync('_includes/calculators/luxury-car-tax.html', 'utf8')],
  ['lease', readFileSync('_includes/calculators/lease.html', 'utf8')],
]);
const page = (name, changes = {}) => formReader(/** @type {string} */ (FORMS.get(name)), changes);
const rowsOf = (/** @type {{rows: string[][]}} */ r) => new Map(r.rows);
const NO_TAX = { year: '2025-26', income: '0', fringe: '0', uncovered: '0', withheld: '0' };

test('the invalid and invalid carer offset refuses a dependant who is neither a spouse nor another relative', () => {
  assert.throws(() => invalidCarerOffset({ year: '2025-26', dependant: 'parent' }), { code: 'invalid_carer_tax_offset.dependant_invalid' });
});

test('the zone offset refuses a dependant’s income or days it cannot count', () => {
  const zone = (dependant) => zoneOffset({ year: '2025-26', area: 'zone_a', days: 365, dependants: [{ kind: 'child', adjusted_taxable_income: '0', ...dependant }] });
  assert.throws(() => zone({ adjusted_taxable_income: 'x' }), { code: 'zone_tax_offset.dependants_invalid',
    message: 'Dependant 1: give the adjusted taxable income as an amount from $0 to $1 billion.' });
  assert.throws(() => zone({ days: 366 }), { code: 'zone_tax_offset.dependants_invalid', message: 'Dependant 1: days must be a whole number from 0 to 365.' });
});

test('the income tax page passes each zone dependant line, with its days, to the zone offset', () => {
  const r = individualResult('income-tax', page('income-tax', { ...NO_TAX, income: '60000', zone: 'zone_a', 'zone-days': '365',
    'zone-dependants': 'Student 0\nchild 1000 100' }), aud);
  const offset = zoneOffset({ year: '2025-26', area: 'zone_a', days: 365, dependants: [{ kind: 'student', adjusted_taxable_income: '0' },
    { kind: 'child', adjusted_taxable_income: '1000', days: 100 }] });
  assert.equal(offset.dependants, 376);
  assert.equal(rowsOf(r).get('Zone tax offset'), aud(offset.offset));
});

test('the Medicare levy surcharge refuses more than 20 dependent children', () => {
  assert.throws(() => medicareLevySurcharge({ year: '2026-27', taxable: 0, fringe: 0, super: 0, losses: 0, spouse: null, children: 21,
    uncoveredDays: 0 }), { message: 'Enter the dependent children as a whole number from 0 to 20.' });
});

test('the private health insurance rebate refuses a statement line amount that is not money', () => {
  assert.throws(() => individualResult('income-tax', page('income-tax', { ...NO_TAX, phi: 'yes', 'phi-lines': '30 abc 0' }), aud),
    { code: 'private_health_insurance_rebate.lines_invalid', message: 'Line 1’s premiums eligible must be an amount from $0 to $1 billion, to the cent.' });
});

test('the residency days page refuses a day outside 1900 to 2100 and passes on other refusals', () => {
  for (const day of ['1899-12-31', '2101-01-01']) {
    assert.throws(() => residencyDaysResult(page('residency-days', { 'departed-2': day })),
      { code: 'residency_tests.presence_invalid', message: 'Enter each day as a date from 1900 to 2100.' }, day);
  }
  assert.throws(() => residencyDaysResult(page('residency-days', { year: '2015-16' })), { code: 'period.unsupported' });
});

test('the pension minimum page passes on the engine’s refusals', () => {
  assert.throws(() => pensionMinimumResult(page('pension-minimum', { age: '200' }), aud), { code: 'input.age_invalid' });
  assert.throws(() => pensionMinimumResult(page('pension-minimum', { year: '2010-11' }), aud), { code: 'period.unsupported' });
});

test('the rental property page refuses a disposal before acquisition and names a loss beyond other income', () => {
  assert.throws(() => rentalPropertyResult(page('rental-property', { disposed: '2025-07-01' }), aud), { code: 'rental_property.fact_conflict',
    message: 'The day you stopped holding the property must be in the income year and not before you acquired it.' });
  const r = rentalPropertyResult(page('rental-property', { 'other-income': '100' }), aud);
  assert.ok(r.note.endsWith('The loss beyond your other taxable income is a tax loss (Division 36), not worked out here'));
  assert.ok(!rentalPropertyResult(page('rental-property'), aud).note.includes('Division 36'));
});

const LISTO = 'The low income super tax offset, up to $500 back on the contributions tax, is not counted';
test('owner pay results name the low income super tax offset when the salary carries super and taxable income is $37,000 or less', () => {
  const pay = { year: '2026-27', profit: '25000', baseRate: true, salary: '20000', other: '0' };
  assert.ok(calculations.salaryDividendResult(pay, aud).note.endsWith(LISTO));
  assert.ok(!calculations.salaryDividendResult({ ...pay, profit: '200000', salary: '100000' }, aud).note.includes(LISTO));
  const structures = { year: '2026-27', profit: '50000', takenOut: '30000', salary: '30000', baseRate: true, offset: true };
  assert.ok(calculations.soleTraderCompanyResult(structures, aud).note.endsWith(LISTO));
  assert.ok(!calculations.soleTraderCompanyResult({ ...structures, profit: '150000', takenOut: '100000', salary: '60000' }, aud).note.includes(LISTO));
});

test('the contractor screen notes GST registration when an unregistered contractor’s fee reaches $75,000', () => {
  const note = (changes) => calculations.contractorEmployeeResult(page('contractor-employee', changes), aud).note;
  assert.match(note({ rate: '150', gst: 'no', credits: 'no' }), /This engagement alone pays \$75,000 or more a year, so GST registration may be required/);
  assert.doesNotMatch(note({ rate: '150' }), /GST registration/);
});

test('an SG payday with no base shortfall shows the nil shortfall and why', () => {
  const covered = calculations.sgcPaydayResult(page('sgc-payday', { 'on-time': '120', late: '0' }), aud);
  assert.deepEqual([covered.rows.at(-1), covered.principal], [['Base shortfall', '$0.00'], 0]);
  assert.equal(covered.note, 'Contributions received by the due date cover the SG amount, so there is no SG charge for this payday');
  const capped = calculations.sgcPaydayResult(page('sgc-payday', { earlier: '300000' }), aud);
  assert.deepEqual(capped.rows.slice(1), [['SG amount, 12%', '$0.00'], ['Base shortfall', '$0.00']]);
  assert.match(capped.note, /reached the maximum contributions base of \$270,830, so the SG amount is nil$/);
});

test('a capital gain shows the current and earlier capital losses applied', () => {
  const rows = rowsOf(calculations.cgtResult(page('cgt', { 'current-losses': '1000', 'prior-losses': '2000' }), () => false, aud));
  assert.deepEqual([rows.get('Capital losses of this year applied'), rows.get('Net capital losses of earlier years applied')], ['$1,000.00', '$2,000.00']);
  assert.equal(rows.get('Net capital gain'), aud((289755 - 3000) / 2));
});

test('a home partly used to produce income shows the floor area share and its days', () => {
  const rows = rowsOf(calculations.cgtResult(page('cgt', { kind: 'home', acquired: '2015-07-01', event: '2025-07-01', purchased: '2015-07-01',
    sold: '2025-08-01', 'moved-in': '2015-07-01', 'part-percent': '20', 'part-from': '2018-07-01', 'part-to': '2025-07-01', market: '600000',
    'improvement-1': '0', 'improvement-1-date': '', buying: '0', 'buying-date': '' }), () => false, aud));
  // 1 July 2018 to 1 July 2025 counted inclusively: 7 years of 365 days, 2 leap days and the last day.
  assert.equal(rows.get('Part used to produce income (section 118-190)'), `20.00% of the floor area for ${(7 * 365 + 2 + 1).toLocaleString('en-AU')} days`);
});

// The form has no earlier-liability field: the page reads the missing field as blank.
const franking = (changes) => calculations.frankingAccountResult(page('franking-account', { 'earlier-liability': '', ...changes }), aud);
test('the franking account uses the offset against the year’s income tax and carries the rest forward', () => {
  const all = rowsOf(franking({ 'tax-before': '1000000', 'offset-forward': '1000' }));
  const total = Number(all.get('Offset used against this year’s income tax'));
  assert.equal(all.get('Offset carried forward'), '0.00');
  const part = rowsOf(franking({ 'tax-before': '50000', 'offset-forward': '1000' }));
  assert.deepEqual([part.get('Offset used against this year’s income tax'), part.get('Offset carried forward')], ['50000.00', (total - 50000).toFixed(2)]);
});

test('the franking account refuses a permitted percentage above 100', () => {
  assert.throws(() => franking({ 'distribution-1-permitted': '101' }),
    { message: 'Distribution 1’s permitted percentage: enter an amount between 0 and 100.' });
});

test('luxury car tax rows name change of use adjustments and refunds', () => {
  const rows = (changes) => calculations.luxuryCarTaxResult(page('luxury-car-tax', changes), aud).rows.slice(2, 4);
  assert.deepEqual(rows({ 'kind-3': 'change_of_use_decreasing', 'on-supply-3': '5000', 'kind-4': 'refund', 'claimant-4': 'primary_producer',
    'eligible-4': 'yes', 'borne-4': '12000', 'supplied-4': '2026-27' }), [
    ['Line 3: change of use, decreasing adjustment of the tax payable on the supply', '$5,000.00'],
    ['Line 4: refund to a primary producer, the lesser of $12,000.00 borne and $10,000', '$10,000.00']]);
  assert.deepEqual(rows({ 'kind-3': 'change_of_use_increasing', 'value-3': '120000', 'supplied-3': '2026-27', 'kind-4': 'refund',
    'claimant-4': 'tourism_operator', 'eligible-4': 'no', 'borne-4': '3000', 'supplied-4': '2026-27' }), [
    ['Line 3: change of use, increasing adjustment of the tax on the supply at $120,000.00, threshold $80,809 for 2026-27, $39,191.00 over', '$11,757.30'],
    ['Line 4: refund to a tourism operator, not a refund-eligible car, so nil', '$0.00']]);
});

test('a lease residual is paid with GST and claimed back in the comparison', () => {
  const value = page('lease');
  const terms = Object.fromEntries(['payment', 'payments', 'frequency', 'timing', 'rate', 'start', 'residual', 'prepaid', 'incentives', 'direct',
    'restoration', 'ownership', 'life'].map((name) => [name, value(name)]));
  const purchase = { price: value('price'), gst: value('gst'), hpRate: value('hp-rate'), life: value('effective-life'), method: value('method'),
    taxRate: value('tax-rate'), car: value('car') };
  const without = calculations.leaseComparison(terms, purchase).lease;
  const residual = calculations.leaseComparison({ ...terms, residual: '10000' }, purchase).lease;
  assert.deepEqual([residual.cash - without.cash, residual.credits - without.credits, residual.taxValue], [11000, 1000, 10000]);
});

test('deferred tax refuses a decimal of more than 8,192 bytes', () => {
  const { cases } = JSON.parse(readFileSync('scripts/deferred-tax-engine-differential.json', 'utf8'));
  const { call } = cases.find((c) => !c.refused);
  assert.throws(() => deferredTax({ ...call, unused_tax_losses: '1'.repeat(8193) }), { code: 'input.decimal_too_long' });
});
