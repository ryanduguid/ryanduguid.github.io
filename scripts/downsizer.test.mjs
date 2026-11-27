// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The downsizer contribution test (ITAA 1997 s 292-102) on the concessional catch-up page, against the
// `contribution-caps` command of ryanduguid/australian-accounting given its `downsizer_*` inputs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { concessionalCatchUp } from '../assets/concessional-catch-up.mjs';
import { DOWNSIZER_INPUTS, downsizer, downsizerGiven, readDownsizerInputs } from '../assets/downsizer.mjs';
import { individualResult } from '../assets/individual-tax-results.mjs';

const fixture = createRequire(import.meta.url)('./downsizer-engine-differential.json');
// Every runner (check_site, mutation-check and `node --test scripts/`) starts in the site's root.
const page = readFileSync('_includes/calculators/concessional-catch-up.html', 'utf8');
const BASE = { downsizer_contribution: '100000.01', downsizer_contribution_date: '2025-10-31', downsizer_age: 70,
  downsizer_contract_date: '2025-08-01', downsizer_settlement_date: '2025-10-01', downsizer_longer_period_allowed: false,
  downsizer_capital_proceeds: '400000.00', downsizer_earlier_own: '0.00', downsizer_earlier_from_proceeds: '300000.00',
  downsizer_conditions_met: true };
const run = (fields) => downsizer({ ...BASE, ...fields }, '2025-26');
const code = (fields) => {
  try {
    run(fields);
  } catch (error) {
    return error.code;
  }
  return 'computed';
};

test('the downsizer test agrees with the australian-accounting command on every differential case', () => {
  for (const c of fixture.cases) {
    let got;
    try {
      const r = downsizer(c.call, c.call.year);
      got = { amounts: r.amounts, eligible: r.eligible, tests: r.tests };
    } catch (error) {
      if (!error.code) throw error;
      got = { refused: error.code };
    }
    assert.deepEqual(got, c.refused ? { refused: c.refused } : { amounts: c.amounts, eligible: c.eligible, tests: c.tests }, c.source);
  }
  assert.equal(fixture.cases.length, 693);
  assert.ok(page.includes('The test agrees with the command on 693 test cases'));
});

test('the downsizer covers the lesser of the 2 limits, and nothing when a criterion fails', () => {
  assert.deepEqual(run({}).amounts, { downsizer_cap_remaining: '300000.00', downsizer_proceeds_remaining: '100000.00',
    downsizer_covered: '100000.00', downsizer_not_covered: '0.01' });
  assert.equal(run({ downsizer_earlier_own: '250000', downsizer_earlier_from_proceeds: '0' }).amounts.downsizer_covered, '50000.00');
  assert.equal(run({ downsizer_earlier_own: '300000.01' }).amounts.downsizer_cap_remaining, '0.00');
  assert.equal(run({ downsizer_earlier_from_proceeds: '400000.01' }).amounts.downsizer_proceeds_remaining, '0.00');
  for (const [fields, failed] of [[{ downsizer_age: 54 }, 'age'], [{ downsizer_contract_date: '2018-06-30' }, 'contract_date'],
    [{ downsizer_contribution_date: '2025-12-31' }, 'within_90_days'], [{ downsizer_conditions_met: false }, 'stated_conditions']]) {
    const r = run(fields);
    assert.deepEqual([r.eligible, r.amounts.downsizer_covered, r.tests.filter((t) => !t.met).map((t) => t.test)], [false, '0.00', [failed]]);
  }
  assert.equal(run({ downsizer_age: 55, downsizer_contract_date: '2018-07-01', downsizer_contribution_date: '2025-12-30' }).eligible, true);
  assert.equal(run({ downsizer_contribution_date: '2025-12-31', downsizer_longer_period_allowed: true }).eligible, true);
});

test('a -0 contribution or proceeds stays -0 where the command’s decimals keep it', () => {
  assert.deepEqual(run({ downsizer_contribution: '-0', downsizer_age: 54 }).amounts.downsizer_not_covered, '-0.00');
  assert.deepEqual([run({ downsizer_contribution: '-0' }).amounts.downsizer_covered, run({ downsizer_contribution: '-0' }).amounts.downsizer_not_covered],
    ['-0.00', '0.00']);
  assert.equal(run({ downsizer_capital_proceeds: '-0', downsizer_earlier_from_proceeds: '0' }).amounts.downsizer_proceeds_remaining, '-0.00');
  assert.equal(run({ downsizer_capital_proceeds: '-0', downsizer_earlier_from_proceeds: '-0' }).amounts.downsizer_proceeds_remaining, '0.00');
});

test('the downsizer refuses as the command does, in its order', () => {
  assert.equal(downsizerGiven({ year: '2025-26' }), false);
  assert.equal(downsizerGiven({ downsizer_age: 70 }), true);
  const noAge = Object.fromEntries(Object.entries(BASE).filter(([key]) => key !== 'downsizer_age'));
  assert.throws(() => downsizer(noAge, '2025-26'), { code: 'input.missing_field', message: 'downsizer_age is required' });
  assert.equal(DOWNSIZER_INPUTS.length, 10);
  for (const [fields, refused] of [
    [{ downsizer_contribution: 'x'.repeat(8193) }, 'input.decimal_too_long'], [{ downsizer_contribution: '1e3' }, 'input.decimal_unreadable'],
    [{ downsizer_contribution: 'NaN', downsizer_age: 151 }, 'input.age_invalid'], [{ downsizer_contribution: 'NaN' }, 'input.amount_invalid'],
    [{ downsizer_capital_proceeds: 5 }, 'input.amount_invalid'], [{ downsizer_earlier_own: '1.005' }, 'input.amount_invalid'],
    [{ downsizer_earlier_from_proceeds: '-1' }, 'input.amount_invalid'], [{ downsizer_contribution: '1000000000000.01' }, 'input.amount_invalid'],
    [{ downsizer_age: '70' }, 'input.age_invalid'], [{ downsizer_age: 70.5 }, 'input.age_invalid'], [{ downsizer_age: -1 }, 'input.age_invalid'],
    [{ downsizer_contribution_date: '2025-02-30' }, 'input.date_invalid'], [{ downsizer_contract_date: 20250801 }, 'input.date_invalid'],
    [{ downsizer_settlement_date: '1899-12-31' }, 'input.date_invalid'], [{ downsizer_settlement_date: '2101-01-01' }, 'input.date_invalid'],
    [{ downsizer_contribution_date: '2025-06-30' }, 'downsizer.date_outside_year'], [{ downsizer_contribution_date: '2026-07-01' }, 'downsizer.date_outside_year'],
    [{ downsizer_settlement_date: '2025-07-31' }, 'downsizer.settlement_before_contract'],
    [{ downsizer_settlement_date: '2025-11-01' }, 'downsizer.contribution_before_settlement'],
    [{ downsizer_longer_period_allowed: null }, 'input.flag_invalid'], [{ downsizer_conditions_met: 'yes' }, 'input.flag_invalid'],
  ]) assert.equal(code(fields), refused, JSON.stringify(fields));
});

const SAM = { year: '2024-25', balance: '450000', concessional: '97500', 'defined-benefit': 'no', 'contributions-2019-20': '11000',
  'contributions-2020-21': '12000', 'contributions-2021-22': '13000', 'contributions-2022-23': '14000', 'contributions-2023-24': '15000' };
const FORM = { downsizer: 'yes', 'downsizer-amount': '300000', 'downsizer-made': '2025-01-15', 'downsizer-age': '67',
  'downsizer-contract': '2024-10-01', 'downsizer-settled': '2024-12-01', 'downsizer-longer': 'no', 'downsizer-proceeds': '900000',
  'downsizer-earlier-own': '0', 'downsizer-earlier-proceeds': '0', 'downsizer-conditions': 'yes' };
const shown = (fields) => individualResult('concessional-catch-up', (name) => new Map(Object.entries({ ...SAM, ...fields })).get(name) ?? '', String);

test('the catch-up page adds the downsizer rows only when a downsizer contribution is given', () => {
  assert.equal(shown({}).rows.some((row) => row[0].startsWith('Downsizer')), false);
  const r = shown(FORM);
  assert.deepEqual(r.rows.slice(-4).map((row) => row[1]), ['300000', '0', '300000', '900000']);
  assert.ok(r.inputs.endsWith(', downsizer contribution 300000'));
  assert.ok(r.note.endsWith('The downsizer contribution is covered up to the lesser of the 2 limits (s 292-102(3))'));
  const late = shown({ ...FORM, 'downsizer-made': '2025-03-15', 'downsizer-age': '54' });
  assert.equal(late.rows.at(-4)[1], '0');
  assert.match(late.note, /not covered: aged 54 .*; 104 days after the change of ownership/);
});

// The general caps of s 291-20 (2019-20 and 2020-21 $25,000, 2021-22 to 2023-24 $27,500, 2024-25 $30,000) leave
// $67,500 unused from Sam's earlier years, so $97,500 uses the whole $97,500 available and a $10,000 proposal is all excess.
test('the catch-up page works a proposed contribution alongside a downsizer contribution', () => {
  const r = shown({ ...FORM, proposed: '10000' });
  const row = (label) => r.rows.find((x) => x[0] === label)?.[1];
  assert.deepEqual([row('Concessional cap available'), row('Contributions with the proposed one'),
    row('Excess with the proposed contribution'), row('Downsizer contribution covered, outside both caps')],
  ['97500', '107500', '10000', '300000']);
  assert.ok(r.inputs.includes(', proposed 10000, ') && r.inputs.endsWith(', downsizer contribution 300000'));
});

test('the catch-up page words the downsizer refusals for the form', () => {
  for (const [fields, message] of [[{ 'downsizer-age': '6.5' }, 'Enter the age at the downsizer contribution in whole years, from 0 to 150.'],
    [{ 'downsizer-made': '' }, 'Enter each downsizer day as a date.'], [{ 'downsizer-amount': '' }, 'Enter each downsizer amount in dollars and cents.'],
    [{ 'downsizer-proceeds': '-5' }, 'Enter each downsizer amount from 0 to 1,000,000,000,000, to the cent.'],
    [{ 'downsizer-made': '2025-07-01' }, 'Enter a downsizer contribution day in 2024-25.'],
    [{ 'downsizer-amount': '1'.repeat(8193) }, 'downsizer_contribution is too long.'],
    [{ 'downsizer-settled': '2024-09-01' }, 'The change of ownership cannot be before the sale contract.'],
    [{ 'downsizer-made': '2024-11-01', 'downsizer-contract': '2024-10-01' }, 'Enter a downsizer contribution made on or after the change of ownership.']]) {
    assert.throws(() => shown({ ...FORM, ...fields }), { message }, JSON.stringify(fields));
  }
});

// What the contribution-caps command (australian-accounting 7f3c3eb, release build) refused for each pair of one
// catch-up fault and one downsizer fault: it reads this year's amounts, then the downsizer inputs, then checks the
// catch-up, then works the downsizer. A code is the downsizer's refusal; null is the catch-up's.
const TWO_FAULTS = {
  'defined benefit': [{ definedBenefit: true }, ['input.decimal_unreadable', 'input.missing_field', 'input.decimal_too_long', null, null, null]],
  year: [{ year: '2023-24' }, ['input.decimal_unreadable', 'input.missing_field', 'input.decimal_too_long', null, null, null]],
  'negative concessional': [{ concessional: '-1' }, ['input.decimal_unreadable', 'input.missing_field', 'input.decimal_too_long', null, null, null]],
  'earlier gap': [{ earlier: [{ year: '2024-25', contributions: '1' }] },
    ['input.decimal_unreadable', 'input.missing_field', 'input.decimal_too_long', null, null, null]],
  'unreadable balance': [{ balance: 'abc' }, [null, null, null, null, null, null]],
};
const DOWNSIZER_FAULTS = [{ downsizer_contribution: 'abc' }, { downsizer_age: undefined }, { downsizer_capital_proceeds: '1'.repeat(8193) },
  { downsizer_contribution_date: '2026-07-01' }, { downsizer_age: -1 }, { downsizer_capital_proceeds: '-1' }];
const CATCH_UP = { year: '2025-26', balance: '450000.00', concessional: '20000.00', definedBenefit: false,
  earlier: ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25'].map((year) => ({ year, contributions: '1000' })) };

test('with a fault in the catch-up and one in the downsizer, the page refuses the one the command does', () => {
  for (const [name, [fault, codes]] of Object.entries(TWO_FAULTS)) {
    DOWNSIZER_FAULTS.forEach((downsizerFault, i) => {
      const given = Object.fromEntries(Object.entries({ ...BASE, ...downsizerFault }).filter(([, v]) => v !== undefined));
      const input = { ...CATCH_UP, ...fault };
      assert.throws(() => {
        concessionalCatchUp(input, () => readDownsizerInputs(given));
        downsizer(given, input.year);
      }, (error) => (error.code ?? null) === codes.at(i), `${name} with ${JSON.stringify(downsizerFault).slice(0, 60)}`);
    });
  }
  // The form: a downsizer amount it cannot read comes before the defined benefit refusal, a day outside the year after it,
  // and a balance it cannot read before both.
  assert.throws(() => shown({ ...FORM, 'defined-benefit': 'yes', 'downsizer-amount': '' }), { message: 'Enter each downsizer amount in dollars and cents.' });
  assert.throws(() => shown({ ...FORM, 'defined-benefit': 'yes', 'downsizer-made': '2025-07-01' }), /Subdivision 291-C/);
  assert.throws(() => shown({ ...FORM, balance: 'abc', 'downsizer-amount': '' }), { message: /^Total super balance on 30 June before the year: / });
});
