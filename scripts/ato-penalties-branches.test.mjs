// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The ATO interest and penalties engine's refusals of malformed facts, and the page's wording of
// inputs and results, past what the opening example, the differential cases and the form tests reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  atoPenaltiesInputsText, atoPenaltiesInterest, atoPenaltiesInterestResult,
} from '../assets/ato-penalties-interest.mjs';

const money = (/** @type {number} */ value) => `$${value.toFixed(2)}`;
const GIC = { question: 'gic', year: '2026-27', amount: '1000', due_date: '2026-10-01', to: '2026-11-30' };
const LODGE = { question: 'failure_to_lodge', year: '2025-26', due_date: '2025-10-31', given_on: '2025-12-01', size: 'small' };
const STATEMENT = { question: 'statement_penalty', year: '2025-26', statement_date: '2026-03-15', significant_global_entity: false };
const OVERPAID = { question: 'overpayment_interest', year: '2025-26', payments: [{ paid_on: '2024-11-21', amount: '5000' }],
  refunded: '2000', refunded_on: '2025-09-30', notice_issued: '2024-10-15', relevant_tax: true, decision_to_which_act_applies: true };
const statement = (parts, more = {}) => ({ ...STATEMENT, parts, ...more });
const refused = (input, code) => assert.throws(() => atoPenaltiesInterest(input), { code }, JSON.stringify(input));

test('malformed amounts, dates, flags and choices are refused by kind', () => {
  refused({ ...GIC, amount: 1000 }, 'input.amount_invalid');
  refused({ ...GIC, amount: '1'.repeat(33) }, 'input.amount_invalid');
  refused({ ...GIC, due_date: 20261001 }, 'ato_interest_penalties.fact_invalid');
  refused({ ...GIC, due_date: '2026-02-30' }, 'ato_interest_penalties.fact_invalid');
  refused({ ...LODGE, size: 'tiny' }, 'ato_interest_penalties.fact_invalid');
  refused(statement([{ shortfall_amount: '100', behaviour: 'recklessness', increase: 'yes' }]), 'input.flag_invalid');
  refused({ ...GIC, question: 'interest' }, 'ato_interest_penalties.question_invalid');
});

test('payments and statement parts that are not objects are refused', () => {
  refused({ ...GIC, payments: ['2026-10-01'] }, 'ato_interest_penalties.fact_invalid');
  refused(statement(['part']), 'ato_interest_penalties.fact_invalid');
});

test('dates out of order and assumed rates outside 0% to 100% are refused', () => {
  refused({ ...GIC, due_date: '2026-12-01' }, 'ato_interest_penalties.date_order');
  refused({ ...GIC, payments: [{ date: '2026-09-30', amount: '10' }] }, 'ato_interest_penalties.date_order');
  refused({ ...LODGE, given_on: '2025-10-30', due_date: '2025-10-31' }, 'ato_interest_penalties.date_order');
  refused({ ...OVERPAID, payments: [{ paid_on: '2025-10-01', amount: '5000' }], refunded_on: '2025-09-30' }, 'ato_interest_penalties.date_order');
  refused({ ...GIC, assumed_annual_rate: '0' }, 'ato_interest_penalties.fact_invalid');
  refused({ ...GIC, assumed_annual_rate: '100.01' }, 'ato_interest_penalties.fact_invalid');
});

test('statement facts that the parts do not call for are refused', () => {
  refused(statement([{ shortfall_amount: '100', behaviour: 'recklessness', accepted_way_amount: '100.01' }]), 'ato_interest_penalties.fact_invalid');
  refused(statement([{ shortfall_amount: '100', behaviour: 'recklessness' }], { other_disclosed_before_examination: '5' }), 'input.field_unknown');
  refused(statement([{ shortfall_amount: '100', behaviour: 'recklessness' }], { income_tax_payable: '5' }), 'input.field_unknown');
});

test('the page writes every optional statement fact, each payment form and an unknown question', () => {
  const parts = [{ shortfall_amount: null, behaviour: 'failure_to_take_reasonable_care' },
    { shortfall_amount: '7000', behaviour: 'reasonable_care', not_reasonably_arguable: true, accepted_way_amount: '1000',
      increase: true, disclosure: 'before_examination' }];
  assert.equal(atoPenaltiesInputsText(statement(parts, { significant_global_entity: true, income_tax_payable: '50000',
    other_disclosed_before_examination: '200', trust_or_partnership: true }), money),
  'Statement penalty, statement made 15 March 2026, a significant global entity; part 1: no shortfall amount, '
    + 'failure to take reasonable care; part 2: shortfall $7000.00, reasonable care taken, not reasonably arguable, '
    + '$1000.00 from an accepted treatment, increased 20%, disclosed before an examination; income tax on the return $50000.00; '
    + 'other shortfalls disclosed before an examination $200.00; a trust or partnership');
  assert.equal(atoPenaltiesInputsText({ ...GIC, assumed_annual_rate: '11' }, money),
    'GIC on $1000.00 due 1 October 2026, to 30 November 2026; 11% a year assumed after December 2026');
  assert.equal(atoPenaltiesInputsText({ question: 'early_payment_interest', amount: '1926', liability: 'payg', paid_on: '2025-11-03',
    due_date: '2025-11-21', full_self_assessment: true }, money),
  '$1926.00 of payg paid 3 November 2025, due 21 November 2025, full self-assessment taxpayer');
  assert.equal(atoPenaltiesInputsText({ ...OVERPAID, relevant_tax: false }, money),
    '$5000.00 paid 21 November 2024; notice issued 15 October 2024; $2000.00 refunded 30 September 2025; not relevant tax overpaid on a decision');
  assert.equal(atoPenaltiesInputsText({ ...LODGE, due_date: 'soon', size: 'tiny' }, money), 'Failure to lodge, due soon, lodged 1 December 2025, tiny');
  assert.equal(atoPenaltiesInputsText({ question: 'objection' }, money), 'objection');
});

const result = (fields) => atoPenaltiesInterestResult((name) => fields[name] ?? '', money);

test('result rows name single days, assumed rates, no days of SIC and parts without a shortfall', () => {
  // 11.51% is the ATO's published GIC for October to December 2026 (rates/general-interest-charge).
  const projected = result({ question: 'gic', 'gic-amount': '1000', 'gic-due': '2026-12-31', 'gic-to': '2027-01-01', 'gic-assumed': '12' });
  assert.deepEqual(projected.tables.working, [['31 December 2026 to 31 December 2026', '1 day', '11.51% a year'],
    ['1 January 2027 to 1 January 2027', '1 day', '12.00% a year, assumed']]);
  assert.deepEqual(projected.rows.at(-1), ['Days of GIC', '2 days']);
  const none = result({ question: 'sic', 'sic-amount': '1000', 'sic-due': '2025-11-21', 'sic-notice': '2025-11-21' });
  assert.deepEqual(none.rows, [['SIC', '$0.00'], ['Days of SIC', '0 days']]);
  const one = result({ question: 'sic', 'sic-amount': '1000', 'sic-due': '2025-11-21', 'sic-notice': '2025-11-22' });
  assert.deepEqual(one.rows.at(-1), ['Days of SIC', '1 day, 21 November 2025 to 21 November 2025']);
  const units = result({ question: 'statement_penalty', 'st-date': '2026-08-01', 'st-behaviour-1': 'failure_to_take_reasonable_care',
    'st-disclosure-1': 'none', 'st-disclosure-2': 'none' });
  assert.equal(units.rows.length, 3, 'no threshold row without a part that is not reasonably arguable');
  assert.match(units.tables.working[0][1], /^20 penalty units, base /);
  const below = result({ question: 'statement_penalty', 'st-date': '2026-03-15', 'st-behaviour-1': 'reasonable_care',
    'st-shortfall-1': '7000', 'st-nra-1': 'yes', 'st-tax': '50000', 'st-disclosure-1': 'none', 'st-disclosure-2': 'none' });
  assert.deepEqual(below.rows.at(-1), ['Reasonably arguable threshold', '$10000.00']);
  assert.match(below.tables.working[0][1], /^0% of \$7000\.00 \(not above the threshold\), base /);
});

test('early payment interest reports no days of interest when the payment is not early enough', () => {
  const late = result({ question: 'early_payment_interest', 'ep-amount': '1926', 'ep-liability': 'income_tax', 'ep-paid': '2025-11-14',
    'ep-due': '2025-11-21', 'ep-fsa': 'yes' });
  assert.deepEqual(late.rows.at(-1), ['Days of interest', '0 days']);
  assert.match(late.note, /^The payment was 7 days before the due day, not more than 14/);
});
