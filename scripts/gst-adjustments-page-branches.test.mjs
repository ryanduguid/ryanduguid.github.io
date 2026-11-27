// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The GST adjustments page's form reading, wording and result rows on the paths its opening example
// does not take: each worksheet's other outcomes, the optional fields and the fallbacks for an entry
// the page cannot word. Every amount agrees with the australian-accounting v1.4.0 release binary's
// command on the same input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gstAdjustment, gstAdjustmentsResult, gstFormInput, gstInputsText } from '../assets/gst-adjustments-page.mjs';
import { aud, formReader } from './form-fields.mjs';

const HTML = readFileSync(new URL('../_includes/calculators/gst-adjustments.html', import.meta.url), 'utf8');
const page = (/** @type {Record<string, string>} */ changes) => gstAdjustmentsResult(formReader(HTML, changes), aud);
const shown = (/** @type {Record<string, string>} */ changes) => {
  const r = page(changes);
  return { rows: r.rows, principal: r.principal };
};

test('a worksheet the form does not offer reads as the creditable purpose worksheet', () => {
  assert.equal(gstFormInput(formReader(HTML, { worksheet: 'nonsense' })).worksheet, 'creditable-purpose');
  assert.throws(() => gstAdjustment('nonsense', {}), { code: 'input.field_unknown', message: /nonsense is not a worksheet/ });
});

test('a creditable purpose increase gives a decreasing adjustment, the page’s second amount', () => {
  assert.deepEqual(shown({ 'cp-former': '60', 'cp-actual': '90' }), { rows: [['Adjustment period', '1 of 2'],
    ['Increasing adjustment', '$0.00'], ['Decreasing adjustment', '$90.00']], principal: 2 });
});

test('a period past the last adjustment period, or after a Division 132 disposal, has no adjustment and says why', () => {
  const late = page({ 'cp-attributed': '2015-03-31' });
  assert.deepEqual(late.rows[0], ['Adjustment period', 'none of 2']);
  assert.match(late.note, /^GST Act s 129-20\(2\) and \(3\): the tax period is after the last of the adjustment periods/);
  const ended = page({ 'cp-ended': '2022-03-15', 'cp-disposal': 'yes' });
  assert.deepEqual(ended.rows, [['Adjustment period', 'none of 2'], ['Increasing adjustment', '$0.00'], ['Decreasing adjustment', '$0.00']]);
  assert.ok(ended.inputs.endsWith(', 3 month tax periods, application ended 15 March 2022 by a Division 132 supply'), ended.inputs);
  assert.match(ended.note, /^GST Act s 129-25\(2\): the thing was disposed of with a Division 132 decreasing adjustment/);
  assert.ok(page({ 'cp-ended': '2022-03-15' }).inputs.endsWith(', 3 month tax periods, application ended 15 March 2022'));
});

test('a tax period length that is not a number of months passes as written, and the command refuses it', () => {
  assert.equal(gstFormInput(formReader(HTML, { 'cp-months': 'x' })).input.tax_period_months, 'x');
  assert.throws(() => page({ 'cp-months': 'x' }), { code: 'gst_creditable_purpose_change.tax_period_unsupported' });
});

test('an entity neither small nor in business gives its turnover and the optional extents, and is not eligible', () => {
  const r = page({ worksheet: 'annual-apportionment', 'aa-small': 'no', 'aa-business': 'no', 'aa-turnover': '3000000', 'aa-input-taxed': '80',
    'aa-consideration': '50', 'aa-elected': 'no' });
  assert.deepEqual(r.rows, [['Credit without annual apportionment (s 11-30)', '$5.00'], ['Credit with annual apportionment (s 131-40)', '$5.00'],
    ['Increasing adjustment (s 131-55)', '$0.00']]);
  assert.equal(r.inputs, '2021-22 annual apportionment; not a small business entity, not carrying on a business, GST turnover $3,000,000.00, '
    + 'not paying by instalments, not with annual tax periods, election not made, GST $100.00, creditable purpose 10%, not for input taxed '
    + 'supplies 80%, consideration provided 50%, not a car, not reduced credit');
  assert.match(r.note, /^The entity is not eligible to make an annual apportionment election \(GST Act s 131-5\)/);
  const input = gstFormInput(formReader(HTML, { worksheet: 'annual-apportionment', 'aa-elected': 'no' })).input;
  assert.equal(gstAdjustment('annual-apportionment', input).outcome, 'eligible, no election');
});

test('financial acquisitions within 10% of the next 12 months’ credits do not exceed the threshold', () => {
  assert.deepEqual(shown({ worksheet: 'financial-acquisitions', 'fat-future-financial': '100000' }), { rows: [
    ['10% of the past 12 months’ total credits', '$110,000.00'], ['10% of the next 12 months’ total credits', '$122,000.00'],
    ['Financial acquisitions threshold', 'Not exceeded']], principal: 2 });
});

test('a going concern sold to a recipient neither registered nor required to be is not GST-free', () => {
  const r = page({ worksheet: 'going-concern', 'gc-registration': 'neither' });
  assert.deepEqual(r.rows, [['Supply of a going concern', 'Not GST-free under s 38-325']]);
  assert.ok(r.inputs.includes(', recipient neither registered nor required to be, '), r.inputs);
  assert.deepEqual(page({ worksheet: 'going-concern' }).rows, [['Supply of a going concern', 'GST-free']]);
});

test('second-hand goods: a taxable supply to you gives no Subdivision 66-A credit; the default gives one eleventh, capped', () => {
  const none = page({ worksheet: 'second-hand-goods', 'shg-consideration': '200', 'shg-supply': 'taxable' });
  assert.deepEqual([none.rows, none.principal], [[['Input tax credit (s 66-10)', 'None under Subdivision 66-A']], 0]);
  assert.ok(none.inputs.includes('consideration $200.00, for sale or exchange, not animals or plants, supply to you taxable,'), none.inputs);
  assert.ok(!none.inputs.includes('GST on the resupply'), none.inputs);
  const credit = page({ worksheet: 'second-hand-goods' });
  assert.deepEqual([credit.rows, credit.principal], [[['One eleventh of the consideration', '$500.00'], ['Input tax credit (s 66-10)', '$300.00']], 1]);
  assert.ok(credit.inputs.includes('supply to you neither taxable nor GST-free') && credit.inputs.endsWith(', GST on the resupply $300.00'), credit.inputs);
});

test('bad debts: a supplier’s taxable proportion, a recipient’s recovery and an unqualified debt', () => {
  const supplier = page({ worksheet: 'bad-debt', 'bd-qualifies': 'yes', 'bd-attributed': 'yes', 'bd-proportion': '50' });
  assert.deepEqual([supplier.rows, supplier.principal], [[['Full adjustment, 1/11 of the amount', '$50.00'], ['Decreasing adjustment', '$25.00']], 1]);
  assert.ok(supplier.inputs.endsWith(', overdue from 16 April 2021 to 16 April 2022, taxable proportion 50%'), supplier.inputs);
  const recipient = page({ worksheet: 'bad-debt', 'bd-party': 'recipient', 'bd-event': 'recovered', 'bd-qualifies': 'yes', 'bd-prior': 'yes',
    'bd-purpose': '100', 'bd-extent': '25' });
  assert.deepEqual(recipient.rows, [['Full adjustment, 1/11 of the amount', '$50.00'], ['Decreasing adjustment', '$12.50']]);
  assert.equal(recipient.inputs, '2021-22 bad debt; recipient, recovered, $550.00, a creditable acquisition, not cash basis, special rule none, '
    + 'earlier adjustment made, creditable purpose 100%, consideration provided 25%, not reduced credit, not annually apportioned');
  assert.deepEqual(page({ worksheet: 'bad-debt', 'bd-event': 'recovered', 'bd-qualifies': 'yes', 'bd-prior': 'yes' }).rows,
    [['Increasing adjustment', '$50.00']]);
  const unqualified = page({ worksheet: 'bad-debt', 'bd-qualifies': 'no', 'bd-event': 'written_off' });
  assert.deepEqual(unqualified.rows, [['Decreasing adjustment', 'None under Division 21']]);
  assert.equal(unqualified.note, 'Division 21 gives no adjustment on these facts');
  const input = gstFormInput(formReader(HTML, { worksheet: 'bad-debt', 'bd-qualifies': 'no', 'bd-event': 'written_off' })).input;
  assert.deepEqual([gstAdjustment('bad-debt', input).outcome, gstAdjustment('bad-debt', input).amount], ['no adjustment', null]);
});

test('the inputs line writes an entry it cannot read as a percentage, date or word as given, and drops trailing zeros', () => {
  const x = { year: '2021-22', gst_exclusive_value: '3000.00', relates_to_business_finance: false, full_input_tax_credit: '300.00',
    intended_or_former_application: 0.9, actual_application: '1.2.3', application_basis: 'Hours logged', attributed_period_end: 'soon',
    tax_period_months: 3 };
  assert.equal(gstInputsText('creditable-purpose', x, aud), '2021-22 creditable purpose change; GST exclusive value $3,000.00, not business '
    + 'finance, full input tax credit $300.00, intended or former 0.9, actual 1.2.3, basis ‘Hours logged’, attributed to the period ending soon, '
    + '3 month tax periods');
  const fractions = (/** @type {unknown} */ a, /** @type {unknown} */ b) => gstInputsText('creditable-purpose',
    { ...x, intended_or_former_application: a, actual_application: b }, aud).match(/intended or former (.*), actual (.*), basis/)?.slice(1);
  assert.deepEqual(fractions('0.1250', '0.500'), ['12.5%', '50%']);
  assert.deepEqual(fractions('', 'a.5'), ['', 'a.5']);
  const debt = { year: '2025-26', party: 7, event: 'written_off', amount: '1.00', taxable_or_creditable: true, cash_basis: false,
    special_rule: 'second_hand_goods' };
  assert.equal(gstInputsText('bad-debt', debt, aud), '2025-26 bad debt; 7, written off, $1.00, a creditable acquisition, not cash basis, '
    + 'special rule second hand goods');
});
