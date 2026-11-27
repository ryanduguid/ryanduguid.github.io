// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The trust streaming engine's refusals of malformed amounts and over-stated franked entitlements,
// and the page's wording of unnamed beneficiaries, unknown choices and blank form rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustStreaming, trustStreamingFormInput, trustStreamingInputsText } from '../assets/trust-streaming.mjs';

const aud = (/** @type {number} */ value) => `$${value.toFixed(2)}`;
const ZERO = { other_trust_income: '0', other_net_income: '0', franked_distributions: '0', franking_credits: '0', franked_deductions: '0',
  capital_gain: '0', capital_gain_remaining: '0', capital_gain_concessions: 'none', capital_gain_trust_income: '0', beneficiaries: [] };
const person = (present, franked = '0', more = {}) => ({ name: 'Ricky', kind: 'individual', present_entitlement: present,
  capital_gain_entitled: '0', franked_entitled: franked, ...more });

test('an amount that is not money is refused with the field it came from', () => {
  assert.throws(() => trustStreaming({ ...ZERO, other_trust_income: 'lots' }), (error) => /^Other trust income|other trust income/i.test(error.message));
  assert.throws(() => trustStreaming({ ...ZERO, other_trust_income: '1000', other_net_income: '1000', beneficiaries: [person('abc', '0', { name: undefined })] }),
    { message: /^Beneficiary 1, present entitlement: / });
});

test('beneficiaries that are not a list count as none, and franked entitlements above the net franked amount are refused', () => {
  const none = trustStreaming({ ...ZERO, other_trust_income: '1000', other_net_income: '1000', beneficiaries: 'Ricky' });
  assert.deepEqual(none.beneficiaries, []);
  assert.throws(() => trustStreaming({ ...ZERO, other_trust_income: '1000', other_net_income: '1000', franked_distributions: '700',
    franking_credits: '300', franked_deductions: '100', beneficiaries: [person('1000', '650')] }),
  { message: 'Specific entitlements to the franked distributions cannot exceed them, less directly relevant deductions.' });
});

test('the form skips a blank row and fills blank figures of a named one with nil', () => {
  const fields = { 'b1-name': '', 'b1-entitlement': '0', 'b2-name': 'Julian', 'b2-kind': 'company', 'b2-entitlement': '500' };
  const map = new Map(Object.entries(fields));
  const input = trustStreamingFormInput((name) => map.get(name) ?? '');
  assert.deepEqual(input.beneficiaries, [{ name: 'Julian', kind: 'company', present_entitlement: '500', capital_gain_entitled: '0', franked_entitled: '0' }]);
});

test('the page writes franked deductions, an unknown concession and kind, and an unnamed beneficiary', () => {
  const text = trustStreamingInputsText({ ...ZERO, franked_distributions: '700', franking_credits: '300', franked_deductions: '100',
    capital_gain: '1000', capital_gain_remaining: '500', capital_gain_concessions: 'rollover', capital_gain_trust_income: '1000',
    beneficiaries: [person('100', '0', { name: ' ', kind: 'fund' })] }, aud);
  assert.equal(text, 'other trust income $0.00, other net income $0.00; franked distributions $700.00 with franking credits $300.00 '
    + 'and directly relevant deductions $100.00; capital gain $1000.00, $500.00 after losses and concessions, $1000.00 in trust income; '
    + 'beneficiaries: a beneficiary (fund) entitled to $100.00');
});
