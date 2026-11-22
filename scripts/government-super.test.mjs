// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The government super amounts page against the ATO's co-contribution, LISTO and spouse offset
// examples, Table 25's thresholds for every year, each boundary and each refusal, all read on
// 22 November 2026, and against the `government-super-amounts` command of
// ryanduguid/australian-accounting on every case of its differential fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CO_CONTRIBUTION_THRESHOLDS, GOVERNMENT_SUPER_YEARS, governmentSuperAmounts } from '../assets/government-super.mjs';
import { governmentSuperFormFacts, governmentSuperResult } from '../assets/government-super-result.mjs';

const fixture = JSON.parse(readFileSync(new URL('./government-super-engine-differential.json', import.meta.url), 'utf8'));
/** A person with every condition met and `salary` of eligible income, and any other inputs. */
const person = (year, salary, extra = {}) => ({ ...fixture.defaults, taxable_income: String(salary), assessable_income: String(salary),
  eligible_income: String(salary), year, ...extra });
const spouse = (income, made, extra = {}) => ({ spouse_contributions: String(made), spouse_assessable_income: String(income),
  spouse_assessable_fhss_released_amount: '0', spouse_reportable_fringe_benefits_total: '0',
  spouse_reportable_employer_super_contributions: '0', spouse_excess_concessional_contributions: '0',
  spouse_non_concessional_within_cap: true, spouse_total_super_balance_below_cap: true, ...extra });
/** The amounts, or the refusal's code, so a wrong refusal fails as an assertion. */
const work = (facts) => {
  try {
    return governmentSuperAmounts(facts).amounts;
  } catch (error) {
    return { refused: error.code ?? String(error) };
  }
};
const refused = (facts, code) => assert.equal(work(facts).refused, code, JSON.stringify(facts));

test('Table 25’s thresholds for each year, the higher $15,000 above the lower (s 10A(3)(d))', () => {
  assert.deepEqual(CO_CONTRIBUTION_THRESHOLDS, { '2020-21': [39837, 54837], '2021-22': [41112, 56112], '2022-23': [42016, 57016],
    '2023-24': [43445, 58445], '2024-25': [45400, 60400], '2025-26': [47488, 62488], '2026-27': [49293, 64293] });
  for (const [lower, higher] of Object.values(CO_CONTRIBUTION_THRESHOLDS)) assert.equal(higher - lower, 15000);
  assert.deepEqual(GOVERNMENT_SUPER_YEARS, ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27']);
});

test('the ATO’s examples: Angelo, Julie, and Robert, Carmel and Aleah’s spouses', () => {
  for (const year of GOVERNMENT_SUPER_YEARS) {
    const angelo = work(person(year, 35000, { personal_contributions: '1040' }));
    assert.deepEqual([angelo.co_contribution_matched, angelo.co_contribution, angelo.co_contribution_paid], ['520.00', '500.00', '500.00'], year);
  }
  const julie = work(person('2022-23', 32000, { taxable_income: '31000', concessional_contributions: '3360' }));
  assert.deepEqual([julie.adjusted_taxable_income, julie.listo_15_percent, julie.listo, julie.listo_paid], ['31000.00', '504.00', '500.00', '500.00']);
  for (const [year, income, made, offset] of [['2021-22', 19000, 3500, '540.00'], ['2021-22', 38000, 3000, '360.00'], ['2022-23', 35000, 2000, '360.00']]) {
    assert.equal(work(person(year, 80000, spouse(income, made))).spouse_contribution_offset, offset, String(income));
  }
});

test('the taper, the $20 minimum and the higher threshold in every year', () => {
  const taper = work(person('2025-26', 50000, { personal_contributions: '1000' }));
  assert.deepEqual([taper.co_contribution_taper, taper.co_contribution, taper.co_contribution_paid], ['83.72', '416.28', '416.30']);
  for (const [year, [lower, higher]] of Object.entries(CO_CONTRIBUTION_THRESHOLDS)) {
    const at = (income) => work(person(year, income, { personal_contributions: '1000' }));
    assert.equal(at(lower).co_contribution, '500.00', year);
    assert.deepEqual([at(lower + 1).co_contribution, at(lower + 1).co_contribution_paid], ['499.97', '500.00'], year);
    assert.deepEqual([at(higher - 1).co_contribution_maximum, at(higher - 1).co_contribution], ['0.08', '20.00'], year);
    assert.equal(at(higher).co_contribution, '0.00', year);
  }
  assert.equal(work(person('2024-25', 30000, { personal_contributions: '10' })).co_contribution, '20.00');
  assert.equal(work(person('2024-25', 30000, { personal_contributions: '40.01' })).co_contribution_matched, '20.01');
  // 2 dollars above the threshold leave $499.93334, paid as $499.95.
  assert.equal(work(person('2025-26', 47490, { personal_contributions: '1000' })).co_contribution_paid, '499.95');
});

test('the 10% eligible income test, on total income before business deductions', () => {
  for (const [eligible, paid] of [['4999', '0.00'], ['4999.99', '0.00'], ['5000', '416.30']]) {
    assert.equal(work(person('2025-26', 50000, { eligible_income: eligible, personal_contributions: '1000' })).co_contribution_paid, paid, eligible);
  }
  const business = work(person('2025-26', 40000, { assessable_income: '60000', business_deductions: '20000', eligible_income: '6000',
    personal_contributions: '1000' }));
  assert.deepEqual([business.co_contribution_total_income, business.eligible_income_test_total, business.co_contribution], ['40000.00', '60000.00', '500.00']);
  assert.equal(work(person('2025-26', 40000, { assessable_income: '60000', business_deductions: '20000', eligible_income: '5999.99',
    personal_contributions: '1000' })).co_contribution, '0.00');
});

test('each co-contribution condition not met leaves it nil', () => {
  for (const extra of [{ return_lodged: false }, { under_71: false }, { non_concessional_within_cap: false },
    { total_super_balance_below_cap: false }, { personal_contributions: '0' }]) {
    assert.equal(work(person('2025-26', 30000, { personal_contributions: '1000', ...extra })).co_contribution_paid, '0.00', JSON.stringify(extra));
  }
});

test('LISTO: the $37,000 limit, 15% to the cent, the $10 minimum and $500 maximum', () => {
  const listo = (income, concessional) => work(person('2025-26', income, { concessional_contributions: concessional }));
  assert.equal(listo(37000, '4000').listo, '500.00');
  assert.equal(listo(37001, '4000').listo, '0.00');
  assert.deepEqual([listo(20000, '50').listo_15_percent, listo(20000, '50').listo], ['7.50', '10.00']);
  assert.deepEqual([listo(20000, '1234.57').listo_15_percent, listo(20000, '1234.57').listo, listo(20000, '1234.57').listo_paid], ['185.19', '185.19', '185.20']);
  assert.deepEqual([listo(20000, '3333.30').listo, listo(20000, '3333.40').listo], ['500.00', '500.00']);
  assert.equal(listo(20000, '0').listo, '0.00');
  // 15% of $666.67 is $100.0005: $100.00 to the nearest cent, so paid as $100.00, not $100.05.
  assert.deepEqual([listo(20000, '666.67').listo, listo(20000, '666.67').listo_paid], ['100.00', '100.00']);
  // Adjusted taxable income adds reportable employer contributions and the adjusted fringe benefits (0.53 for section 57A).
  const ati = work(person('2025-26', 30000, { reportable_employer_super_contributions: '5000', reportable_fringe_benefits_section_57a: '3000',
    concessional_contributions: '5000' }));
  assert.deepEqual([ati.adjusted_taxable_income, ati.listo], ['36590.00', '500.00']);
});

test('the spouse offset: the $40,000 limit, the taper from $37,000 and the cap facts', () => {
  const offset = (income, made, extra) => work(person('2025-26', 90000, spouse(income, made, extra))).spouse_contribution_offset;
  assert.equal(offset(39999, 3000), '0.18');
  assert.equal(offset(40000, 3000), '0.00');
  assert.equal(offset(37000, 5000), '540.00');
  assert.equal(offset(10000, '0.03'), '0.01');
  assert.equal(offset(20000, 3000, { spouse_total_super_balance_below_cap: false }), '0.00');
  assert.equal(offset(20000, 3000, { spouse_non_concessional_within_cap: false }), '0.00');
  const parts = work(person('2025-26', 90000, spouse(30000, 3000, { spouse_assessable_fhss_released_amount: '2000',
    spouse_reportable_fringe_benefits_total: '5000', spouse_reportable_employer_super_contributions: '6000',
    spouse_excess_concessional_contributions: '1000' })));
  assert.deepEqual([parts.spouse_income, parts.spouse_contribution_limit, parts.spouse_contribution_offset], ['38000.00', '2000.00', '360.00']);
  assert.equal(work(person('2025-26', 90000)).spouse_contribution_offset, undefined);
});

test('each refusal', () => {
  refused(person('2025-26', 30000, { scope_confirmed: false }), 'scope.not_confirmed');
  refused(person('2019-20', 30000), 'period.unsupported');
  refused(person('2027-28', 30000), 'period.unsupported');
  refused(person('2025-26', 30000, { spouse_contributions: '100' }), 'input.missing_field');
  refused(person('2025-26', 30000, { temporary_visa_held: true }), 'government_super_amounts.temporary_visa');
  refused(person('2025-26', 30000, { temporary_visa_held: 'no' }), 'input.flag_invalid');
  for (const residency of ['part_year_resident', 'working_holiday_maker', 'foreign_resident']) {
    refused(person('2025-26', 30000, { residency }), 'income_tests.residency_unsupported');
  }
  refused(person('2025-26', 30000, { residency: 'resident' }), 'input.residency_invalid');
  refused(person('2025-26', 30000, { taxable_income: '30001' }), 'income_tests.components_inconsistent');
  refused(person('2025-26', 30000, { eligible_income: '30000.01' }), 'government_super_amounts.fact_conflict');
  refused(person('2025-26', 90000, spouse(1000, 3000, { spouse_assessable_fhss_released_amount: '1000.01' })), 'government_super_amounts.fact_conflict');
  refused(person('2025-26', 90000, spouse(1000, 3000, { spouse_excess_concessional_contributions: '1001' })), 'government_super_amounts.fact_conflict');
  refused(person('2025-26', 30000, { personal_contributions: '1000', total_super_balance_below_cap: null }), 'government_super_amounts.fact_not_supplied');
  refused(person('2025-26', 30000, { personal_contributions: '1000', non_concessional_within_cap: null }), 'government_super_amounts.fact_not_supplied');
  refused(person('2025-26', 90000, spouse(20000, 3000, { spouse_total_super_balance_below_cap: null })), 'government_super_amounts.fact_not_supplied');
  refused(person('2025-26', 0, { personal_contributions: '1000' }), 'government_super_amounts.no_total_income');
  refused(person('2025-26', 0, { concessional_contributions: '1000' }), 'government_super_amounts.no_total_income');
  // A fact not given decides nothing where another condition already fails.
  assert.equal(work(person('2025-26', 62488, { personal_contributions: '1000', total_super_balance_below_cap: null })).co_contribution, '0.00');
  assert.equal(work(person('2025-26', 90000, spouse(40000, 3000, { spouse_non_concessional_within_cap: null }))).spouse_contribution_offset, '0.00');
  assert.equal(work(person('2025-26', 0)).co_contribution, '0.00');
  assert.equal(work(person('2025-26', 0, { personal_contributions: '1000', return_lodged: false })).co_contribution, '0.00');
});

test('amounts are refused past $1,000,000,000,000 or 2 decimal places, and income parts past $1,000,000,000 or in cents', () => {
  const most = work(person('2025-26', 1000000000, { personal_contributions: '1000000000000.00', concessional_contributions: '999999999999.99' }));
  assert.deepEqual([most.co_contribution_matched, most.listo_15_percent], ['500000000000.00', '150000000000.00']);
  refused(person('2025-26', 30000, { personal_contributions: '1000000000000.01' }), 'input.amount_invalid');
  refused(person('2025-26', 30000, { concessional_contributions: '1.001' }), 'input.amount_invalid');
  refused(person('2025-26', 30000, { personal_contributions: '-1' }), 'input.amount_invalid');
  refused(person('2025-26', 90000, spouse(1000, '1e3')), 'input.amount_invalid');
  refused(person('2025-26', 30000, { assessable_income: '1000000001' }), 'input.amount_invalid');
  refused(person('2025-26', 30000, { business_deductions: '10.50' }), 'input.amount_invalid');
});

test('the page agrees with the australian-accounting command on every differential case', () => {
  assert.ok(fixture.cases.length > 450);
  assert.ok(fixture.cases.filter((c) => c.refused).length > 40);
  for (const { source, call, refused: code, amounts, met, thresholds } of fixture.cases) {
    const facts = { ...fixture.defaults, ...call };
    if (code) {
      assert.throws(() => governmentSuperAmounts(facts), { code }, source);
      continue;
    }
    const r = governmentSuperAmounts(facts);
    assert.deepEqual(Object.keys(r.amounts), fixture.amount_keys.slice(0, amounts.length), source);
    assert.deepEqual(Object.values(r.amounts), amounts, source);
    assert.deepEqual(r.conditions.map((c) => `${c.amount}.${c.condition}`), fixture.conditions.slice(0, met.length), source);
    assert.deepEqual(r.conditions.map((c) => c.met), met, source);
    assert.deepEqual([r.rates.lower_income_threshold, r.rates.higher_income_threshold], thresholds, source);
  }
});

const aud = (value) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
const FORM = { year: '2025-26', resident: 'yes', visa: 'no', personal: '1000', concessional: '0', eligible: '50000', assessable: '50000',
  taxable: '50000', 'business-deductions': '0', 'employer-super': '0', 'personal-super': '0', 'fringe-other': '0', 'fringe-57a': '0',
  fhss: '0', 'excess-concessional': '0', 'financial-loss': '0', 'rental-loss': '0', 'target-foreign': '0', pensions: '0',
  'child-support': '0', lodged: 'yes', 'under-71': 'yes', 'non-concessional': 'yes', balance: 'yes', spouse: 'no', scope: 'yes',
  'spouse-contributions': '3000', 'spouse-assessable': '39999', 'spouse-fhss': '0', 'spouse-fringe': '0', 'spouse-employer': '0',
  'spouse-excess': '0', 'spouse-non-concessional': 'yes', 'spouse-balance': 'unknown' };
const form = (extra = {}) => (/** @type {string} */ name) => ({ ...FORM, ...extra })[name] ?? '';

test('the form passes its answers to the engine as the command takes them', () => {
  const facts = governmentSuperFormFacts(form());
  assert.equal(facts.residency, 'full_year_resident');
  assert.equal(facts.exempt_foreign_employment_income, '0');
  assert.equal(facts.family_trust_distribution_amounts, '0');
  assert.equal('spouse_contributions' in facts, false);
  const withSpouse = governmentSuperFormFacts(form({ spouse: 'yes', balance: 'unknown' }));
  assert.deepEqual([withSpouse.spouse_assessable_income, withSpouse.spouse_non_concessional_within_cap,
    withSpouse.spouse_total_super_balance_below_cap, withSpouse.total_super_balance_below_cap], ['39999', true, null, null]);
  assert.equal(governmentSuperFormFacts(form({ resident: 'no' })).residency, 'part_year_resident');
  assert.equal(governmentSuperFormFacts(form({ visa: 'yes' })).temporary_visa_held, true);
  assert.equal(governmentSuperFormFacts(form({ scope: 'no' })).scope_confirmed, false);
});

test('the result shows each amount, the thresholds and why an amount is nil', () => {
  const r = governmentSuperResult(form(), aud);
  assert.equal(r.inputs, '2025-26, assessable income $50,000.00, taxable income $50,000.00, eligible income $50,000.00, '
    + 'personal contributions $1,000.00, concessional contributions $0.00');
  assert.deepEqual(r.rows[1], ['Income thresholds', '$47,488 and $62,488']);
  assert.deepEqual(r.rows[r.principal], ['Co-contribution paid, up to 5 cents', '$416.30']);
  assert.match(r.note, /^No LISTO: no concessional contributions, adjusted taxable income above \$37,000\. The ATO works out/);
  const spouse = governmentSuperResult(form({ spouse: 'yes', 'spouse-balance': 'yes', lodged: 'no', 'under-71': 'no' }), aud);
  assert.deepEqual(spouse.rows.slice(-3), [['Spouse’s income', '$39,999.00'], ['Spouse contribution limit', '$1.00'],
    ['Spouse contribution tax offset', '$0.18']]);
  assert.match(spouse.inputs, /, no return lodged, 71 or older, spouse contributions \$3,000\.00, spouse assessable income \$39,999\.00$/);
  assert.match(spouse.note, /^No co-contribution: no return lodged, 71 or older\. No LISTO/);
  assert.match(governmentSuperResult(form({ balance: 'unknown', personal: '0', 'employer-super': '100' }), aud).inputs,
    /employer super \$100\.00, eligible income .*, total super balance not known$/);
  assert.throws(() => governmentSuperResult(form({ spouse: 'yes' }), aud), { code: 'government_super_amounts.fact_not_supplied' });
  assert.throws(() => governmentSuperResult(form({ visa: 'yes' }), aud), /New Zealand citizens/);
});
