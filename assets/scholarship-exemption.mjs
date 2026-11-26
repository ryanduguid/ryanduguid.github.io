// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Whether a scholarship, bursary, educational allowance or educational assistance is exempt income
// under ITAA 1997 s 51-10 item 2.1A, subject to the exceptions in s 51-35, for 2017-18 to 2026-27: a
// port of the `scholarship-exemption` command of ryanduguid/australian-accounting, checked against it
// on every case of its differential fixture.

import { callFields, flag, refuse, yearOf } from './command-args.mjs';

export const SCHOLARSHIP_YEARS = ['2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
export const PAYMENT_TYPES = ['scholarship', 'bursary', 'educational_allowance', 'educational_assistance'];
export const COMMONWEALTH_PAYMENTS = ['none', 'secondary_or_isolated_children', 'education_or_training_payment', 'education_entry_payment'];
const FIELDS = ['payment_type', 'full_time_student', 'employment_condition', 'labour_contract_condition', 'principally_educational',
  'commonwealth_payment', 'friendly_society_plan', 'year', 'scope_confirmed'];
const NOT_TESTED = 'The ATO’s ‘Is my scholarship taxable?’ tool does not deal with these Commonwealth payments, and neither does this calculator.';
const COMMONWEALTH = new Map([
  ['secondary_or_isolated_children', 'A Commonwealth payment for secondary education or the education of isolated children is not exempt under item 2.1A (s 51-35(a)); item 2.1B of the s 51-10 table, subject to s 51-40, may exempt it.'],
  ['education_or_training_payment', 'A Commonwealth education or training payment, such as Austudy, ABSTUDY or Youth Allowance, is not exempt under item 2.1A (s 51-35(b)); Subdivision 52-E or 52-F may exempt all or part of it.'],
  ['education_entry_payment', 'An education entry payment under Part 2.13A of the Social Security Act 1991 is not exempt under item 2.1A (s 51-35(f)).'],
]);
export const CONDITIONS = [
  ['full_time_student', 'Paid to a full-time student at a school, college or university (s 51-10 item 2.1A)'],
  ['no_employment_condition', 'Not paid on condition that the student becomes or stays the payer’s employee (s 51-35(c))'],
  ['no_labour_contract_condition', 'Not paid on condition of a contract wholly or principally for the student’s labour (s 51-35(d))'],
  ['principally_educational', 'Provided principally for educational purposes (s 51-35(e))'],
];

/**
 * The command's result: { period, payment_type, exempt, conditions_not_met, conditions }.
 * @param {unknown} given the command's JSON input
 */
export function scholarshipExemption(given) {
  const input = callFields(given, 'scholarship-exemption', FIELDS, [], []);
  const year = yearOf(input, SCHOLARSHIP_YEARS);
  const kind = input.get('payment_type');
  if (typeof kind !== 'string' || !PAYMENT_TYPES.includes(kind)) {
    refuse('scholarship_exemption.payment_type_invalid', 'Choose a scholarship, bursary, educational allowance or educational assistance: the payments item 2.1A covers. A prize, award or other payment is not tested here.');
  }
  const commonwealth = input.get('commonwealth_payment');
  if (typeof commonwealth !== 'string' || !COMMONWEALTH_PAYMENTS.includes(commonwealth)) {
    refuse('scholarship_exemption.commonwealth_payment_invalid', 'Choose whether the payment is one of the Commonwealth payments listed, or none of them.');
  }
  if (commonwealth !== 'none') refuse('scholarship_exemption.commonwealth_payment', `${COMMONWEALTH.get(commonwealth)} ${NOT_TESTED}`);
  if (flag(input.get('friendly_society_plan'), 'friendly_society_plan')) {
    refuse('scholarship_exemption.friendly_society_plan', 'Education benefits under a friendly society scholarship plan can be taxable (the ATO’s ‘Is my scholarship taxable?’ page); this calculator does not test them.');
  }
  const facts = FIELDS.slice(1, 5).map((key) => flag(input.get(key), key));
  const met = [facts[0], !facts[1], !facts[2], facts[3]];
  const conditions = CONDITIONS.map(([condition], i) => ({ condition, met: met[i] }));
  return {
    period: year, payment_type: kind, exempt: met.every(Boolean),
    conditions_not_met: conditions.filter((c) => !c.met).map((c) => c.condition), conditions,
  };
}

/** The command's input from the page's form. @param {(name: string) => string} value */
export function scholarshipFormInput(value) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  return {
    year: value('year'), scope_confirmed: true, payment_type: value('payment-type'), commonwealth_payment: value('commonwealth'),
    full_time_student: yes('full-time'), employment_condition: yes('employment'), labour_contract_condition: yes('labour'),
    principally_educational: yes('educational'), friendly_society_plan: yes('friendly-society'),
  };
}

/** The page's result. @param {(name: string) => string} value */
export function scholarshipResult(value) {
  const input = scholarshipFormInput(value);
  const r = scholarshipExemption(input);
  const rows = [...CONDITIONS.map(([id, words]) => [words, r.conditions.find((c) => c.condition === id)?.met ? 'Met' : 'Not met']),
    ['Exempt under item 2.1A', r.exempt ? 'Yes' : 'No']];
  const note = r.exempt ? 'Exempt income: tell the provider it is exempt and leave it out of your tax return'
    : 'Not exempt: include it in your tax return as assessable income and tell the provider, who may need to withhold from periodic payments';
  return { inputs: `${r.period}; ${String(r.payment_type).replaceAll('_', ' ')}`, rows, principal: 4, note };
}
