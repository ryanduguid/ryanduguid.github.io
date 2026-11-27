// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The pages ported from the australian-accounting and solomons-sword commands in page train 7: the shared decimal
// helpers against Python's decimal module (the commands' arithmetic), and each page's form, wording and refusals
// against the commands' recorded results in the engine-differential fixtures.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as calculations from '../assets/business-calculators.mjs';
import { field, parseDate, parseDecimal, readFields } from '../assets/aa-command.mjs';
import { dec, div, lit, text } from '../assets/aa-decimal.mjs';
import * as exact from '../assets/exact-decimal.mjs';
import { decText, parseDec } from '../assets/non-resident-withholding.mjs';
import { calculatorTools } from '../assets/webmcp-tools.mjs';

const require = createRequire(import.meta.url);
const FIXTURES = new Map([
  ['motor-vehicle-duty', () => require('./motor-vehicle-duty-engine-differential.json').cases],
  ['insurance-duty', () => require('./insurance-duty-engine-differential.json').cases],
  ['vic-property-taxes', () => require('./vic-property-taxes-engine-differential.json').cases],
  ['non-resident-withholding', () => require('./non-resident-withholding-engine-differential.json').cases],
]);
const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const form = (values) => {
  const entries = new Map(Object.entries(values));
  return (name) => entries.get(name) ?? '';
};
const fixture = (slug) => FIXTURES.get(slug)();
const codeOf = (run) => {
  try {
    run();
  } catch (error) {
    return error.code ?? error.message;
  }
  return 'computed';
};
const messageOf = (run) => {
  try {
    run();
  } catch (error) {
    return error.message;
  }
  return 'computed';
};
const yesNo = (flag) => (flag ? 'yes' : 'no');

test('the commands read a decimal after stripping Python whitespace, and refuse a non-object or an over-long decimal', () => {
  assert.deepEqual(parseDecimal('\u3000 12.50\t'), { finite: true, negative: false, coefficient: 1250n, exponent: -2 });
  assert.deepEqual(['-Infinity', 'sNaN', 'nan7'].map(parseDecimal), [{ finite: false }, { finite: false }, { finite: false }]);
  assert.deepEqual(['1e3', '', '.5', '+1'].map(parseDecimal), [null, null, null, null]);
  const params = [['amount', 'dec']];
  for (const call of [null, [], 'x']) assert.equal(codeOf(() => readFields(call, 'c', params)), 'input.not_object');
  assert.equal(codeOf(() => readFields({ amount: '1'.repeat(8193) }, 'c', params)), 'input.decimal_too_long');
  assert.deepEqual(field(readFields({ amount: '1' }, 'c', params), 'missing'), { value: undefined, dec: null });
  // Day numbers since 1 January 1970: 2024 is a leap year, 2023 and 1900 are not.
  assert.deepEqual([parseDate('2024-02-29'), parseDate('2023-02-29'), parseDate('1900-02-29'), parseDate(20240229)], [19782, null, null, null]);
});

test('the state duty decimals divide, multiply and print as Python Decimal does', () => {
  // Python: Decimal(1) / Decimal(20) == Decimal('0.05'); Decimal('0.00') / Decimal(100) == Decimal('0.00').
  assert.deepEqual([text(div(lit('1'), lit('20'))), text(div(lit('0.00'), lit('100'))), text(div(lit('-3'), lit('200')))], ['0.05', '0.00', '-0.015']);
  // str(Decimal('5E+1')), str(Decimal('1.2E+4')), str(Decimal('1E-8')), str(Decimal('1.5E-8')).
  assert.deepEqual([text(dec(5n, 1)), text(dec(12n, 3)), text(dec(1n, -8)), text(dec(15n, -9, true))], ['5E+1', '1.2E+4', '1E-8', '-1.5E-8']);
});

test('exact decimals round, divide and print as Python Decimal does', () => {
  const { d, div: quotient, mul, str, fixed2 } = exact;
  // Context(prec=1).multiply(Decimal('9.5'), 1) == Decimal('1E+1'): the carry past the precision drops a digit.
  assert.equal(str(mul(d('9.5'), d('1'), 1)), '1E+1');
  assert.throws(() => quotient(d('1'), d('0')), RangeError);
  // Decimal('1' * 31) / 1 at 28 digits, then Decimal(1) / 3 and -1 / 3.
  assert.equal(str(quotient(d('1'.repeat(31)), d('1'))), '1.111111111111111111111111111E+30');
  assert.deepEqual([str(quotient(d('1'), d('3'))), str(quotient(d('-1'), d('3')))], ['0.3333333333333333333333333333', '-0.3333333333333333333333333333']);
  assert.deepEqual([str(d('-Infinity')), str(d('NaN')), str(d('1E+3')), str(d('0.0000001')), str(d('-1.5E-8'))], ['-Infinity', 'NaN', '1E+3', '1E-7', '-1.5E-8']);
  // format(Decimal('-0.004'), '.2f') == '-0.00'; format(Decimal('-1.5'), '.2f') == '-1.50'.
  assert.deepEqual([fixed2(d('-0.004')), fixed2(d('-1.5')), fixed2(d('7'))], ['-0.00', '-1.50', '7.00']);
});

test('the non-resident withholding decimals read and print as the command does', () => {
  assert.deepEqual([parseDec('-inf'), parseDec('1e3')], [{ c: 0n, e: 0, finite: false }, null]);
  assert.deepEqual([decText({ c: 5n, e: 1 }), decText({ c: -15n, e: -9 }), decText({ c: -125n, e: -2 })], ['5E+1', '-1.5E-8', '-1.25']);
});

test('the motor vehicle duty page shows the command’s duty for every recorded case its form can send', () => {
  let shown = 0;
  for (const c of fixture('motor-vehicle-duty')) {
    if (c.refused) continue;
    const x = c.call;
    const values = { jurisdiction: x.jurisdiction, value: x.dutiable_value, date: x.duty_date, engine: x.engine, green: yesNo(x.green_car),
      primary: yesNo(x.primary_producer), category: x.emissions_category, new: yesNo(x.new_vehicle), fleet: yesNo(x.fleet_discount), electric: yesNo(x.electric) };
    try {
      assert.deepEqual(calculations.motorVehicleDutyFormInput(form(values)), x);
    } catch {
      continue;
    }
    shown += 1;
    const r = calculations.motorVehicleDutyResult(form(values), aud);
    assert.deepEqual(r.rows[r.principal], ['Motor vehicle duty', aud(Number(c.amounts.duty))], c.source);
    assert.equal(r.rows.length === 3, Boolean(c.rates.rate_applied_percent), c.source);
    assert.ok(r.inputs.startsWith(`${x.jurisdiction.toUpperCase()}; passenger vehicle; `), c.source);
  }
  assert.ok(shown >= 100, `${shown}`);
  assert.equal(codeOf(() => calculations.motorVehicleDuty({ jurisdiction: 'act', vehicle_class: 'passenger', dutiable_value: '30000', duty_date: '2026-09-01',
    year: '2026-27', scope_confirmed: true, emissions_category: 5, new_vehicle: true })), 'motor_vehicle_duty.emissions_category_invalid');
  const act = calculations.motorVehicleDutyInputsText({ jurisdiction: 'act', dutiable_value: '30000', duty_date: '2026-09-01', emissions_category: 'non_rated',
    new_vehicle: false }, aud);
  assert.equal(act, 'ACT; passenger vehicle; dutiable value $30,000.00; duty date 2026-09-01; category NON-RATED, used');
  assert.match(calculations.motorVehicleDutyInputsText({ jurisdiction: 'qld', dutiable_value: '1', duty_date: 'd', engine: 'up_to_4_cylinders' }, aud),
    /; engine up to 4 cylinders$/);
});

test('the insurance duty page shows the command’s duty for every recorded case its form can send', () => {
  let shown = 0;
  for (const c of fixture('insurance-duty')) {
    if (c.refused) continue;
    const x = c.call;
    const values = { class: `${x.jurisdiction}/${x.class}`, premium: x.premium, effected: x.effected_date, term: yesNo(x.term_over_one_year), taken: x.policy_taken_out };
    try {
      assert.deepEqual(calculations.insuranceDutyFormInput(form(values)), x);
    } catch {
      continue;
    }
    shown += 1;
    const r = calculations.insuranceDutyResult(form(values), aud);
    assert.deepEqual(r.rows[r.principal], ['Insurance duty', aud(Number(c.amounts.duty))], c.source);
    assert.equal(r.rows.length === 3, Boolean(c.rates.rate_percent), c.source);
    if (c.rates.abolished_from) assert.ok(r.note.endsWith(`; abolished from ${c.rates.abolished_from}`), c.source);
  }
  assert.ok(shown >= 100, `${shown}`);
  assert.match(calculations.insuranceDutyInputsText({ jurisdiction: 'vic', class: 'unknown', premium: '1', effected_date: 'd' }, aud), /^VIC unknown; /);
});

test('the Victorian property taxes page shows the command’s total for every recorded case its form can send', () => {
  const seen = new Set();
  for (const c of fixture('vic-property-taxes')) {
    if (c.refused) continue;
    const x = c.call;
    const values = { tax: x.tax, year: x.year, civ: x.capital_improved_value, land: x.residential_land, concession: yesNo(x.new_residential_concession),
      previous: yesNo(x.liable_previous_tax_year), before: yesNo(x.liable_tax_year_before), entry: x.entry_date };
    (x.parcels ?? []).forEach((p, i) => Object.assign(values, { [`before-${i + 1}`]: p.civ_before, [`after-${i + 1}`]: p.civ_after }));
    try {
      assert.deepEqual(calculations.vicPropertyFormInput(form(values)), x);
    } catch {
      continue;
    }
    seen.add(x.tax);
    const r = calculations.vicPropertyTaxes(x);
    const page = calculations.vicPropertyResult(form(values), aud);
    assert.deepEqual(page.rows[page.principal][1], aud(Number(c.amounts.total)), c.source);
    if (x.tax === 'windfall_gains') {
      assert.deepEqual(page.rows.at(-2), ['Taxable value uplift', aud(Number(c.amounts.taxable_value_uplift))], c.source);
      assert.equal(page.rows.filter(([label]) => label.startsWith('Value uplift, title ')).length, Object.keys(r.amounts).filter((k) => k.startsWith('value_uplift_')).length);
    }
    if (x.tax === 'commercial_industrial') assert.deepEqual(page.rows[0], ['Transition period ends', c.rates.transition_period_ends], c.source);
    if (x.tax === 'vacant_residential_land') assert.deepEqual(page.rows[0], ['Rate', `${Number(c.rates.vrlt_rate) * 100}% of the capital improved value`], c.source);
  }
  assert.deepEqual([...seen].sort(), ['commercial_industrial', 'vacant_residential_land', 'windfall_gains']);
  assert.equal(codeOf(() => calculations.vicPropertyTaxes({ tax: 'vacant_residential_land', year: '2026', scope_confirmed: true, capital_improved_value: '800000',
    residential_land: 'undeveloped', new_residential_concession: false })), 'input.field_unknown');
  assert.equal(calculations.vicPropertyInputsText({ tax: 'other', year: '2026', parcels: [] }, aud), '2026 other; ');
  assert.equal(calculations.vicPropertyInputsText({ tax: 'commercial_industrial', year: '2026', entry_date: '2026-01-01' }, aud),
    '2026 commercial and industrial property tax; entry date 2026-01-01');
});

test('the non-resident withholding page shows the command’s amounts for every recorded case its form can send', () => {
  let shown = 0;
  for (const c of fixture('non-resident-withholding')) {
    if (c.refused) continue;
    const x = c.call;
    const values = { type: x.payment_type, payment: x.payment, year: x.year, treaty: x.treaty_rate ?? '', exempt: yesNo(x.exempt), already: x.already_withheld,
      franked: x.franked_amount, cfi: x.conduit_foreign_income };
    try {
      assert.deepEqual(calculations.nrwFormInput(form(values)), x);
    } catch {
      continue;
    }
    shown += 1;
    const r = calculations.nrwResult(form(values), aud);
    assert.deepEqual(r.rows[r.principal], ['Amount to withhold', aud(Number(c.amounts.withholding))], c.source);
    assert.equal(r.inputs.includes('; exempt'), x.exempt, c.source);
  }
  assert.ok(shown >= 50, `${shown}`);
  const blank = calculations.nrwFormInput(form({ type: 'dividend', payment: '100', year: '2025-26' }));
  assert.deepEqual([blank.already_withheld, blank.franked_amount, blank.conduit_foreign_income, blank.treaty_rate], ['0', '0', '0', null]);
  assert.match(calculations.nrwInputsText({ year: '2025-26', payment_type: 'other', payment: '1', treaty_rate: null, exempt: true, already_withheld: '0' }, aud),
    /^2025-26; other of \$1\.00; no treaty rate; exempt$/);
  // The command quotes a bad period with Python's repr: repr(True) is True, repr(2026) is 2026.
  const call = { payment_type: 'interest', payment: '1', treaty_rate: null, exempt: false, already_withheld: '0', scope_confirmed: true };
  for (const [year, quoted] of [[true, 'True'], [false, 'False'], [2026, '2026'], [null, 'None']]) {
    assert.throws(() => calculations.nonResidentWithholding({ ...call, year }), (error) => error.message.startsWith(`Unsupported period ${quoted}; `));
  }
  assert.equal(codeOf(() => calculations.nonResidentWithholding({ ...call, year: '2025-26', payment: '1'.repeat(8193) })), 'input.decimal_too_long');
  assert.equal(codeOf(() => calculations.nonResidentWithholding({ ...call, year: '2025-26', payment_type: 5 })), codeOf(() => calculations.nonResidentWithholding({ ...call, year: '2025-26', payment_type: 'x' })));
  assert.throws(() => calculations.nrwResult(form({ type: 'interest', payment: '100', year: '2023-24' }), aud), /Unsupported period/);
});

test('foreign resident capital gains withholding refuses what the command refuses, quoting a bad year as Python does', () => {
  const sale = { payment: 'capital_gains', acquisition_date: '2026-03-15', asset: 'taxable_australian_real_property', market_value: '1200000',
    cost_base_first_element: '1200000', option_payments: '0', sale_price: '1200000', vendors: [{ interest: '1', document: 'none' }], exclusion: null,
    class_variation_to_nil: false, year: '2025-26', scope_confirmed: true };
  const code = (more) => codeOf(() => calculations.foreignResidentWithholding({ ...sale, ...more }));
  // repr() of JSON values: None, True, False, 'a', "it's", 'a\\b', [1, 'a'], {'k': [None, False]}, 1.5.
  for (const [year, quoted] of [[null, 'None'], [true, 'True'], [false, 'False'], ['a', "'a'"], ["it's", '"it\'s"'], ['a\\b', "'a\\\\b'"],
    [[1, 'a'], "[1, 'a']"], [{ k: [null, false] }, "{'k': [None, False]}"], [1.5, '1.5']]) {
    assert.throws(() => calculations.foreignResidentWithholding({ ...sale, year }),
      (error) => error.code === 'period.unsupported' && error.message.startsWith(`Unsupported period ${quoted}; `));
  }
  for (const call of [null, [], 'x']) assert.equal(codeOf(() => calculations.foreignResidentWithholding(call)), 'input.not_object');
  assert.equal(code({ market_value: '1'.repeat(8193) }), 'input.decimal_too_long');
  for (const market_value of [null, 5, {}]) assert.equal(code({ market_value }), 'input.amount_invalid');
  assert.equal(code({ class_variation_to_nil: 'no' }), 'input.flag_invalid');
  for (const vendors of [[null], [[]], ['x']]) assert.equal(code({ vendors }), 'foreign_resident_withholding.vendors_invalid');
  assert.throws(() => calculations.foreignResidentWithholding({ ...sale, vendors: [{ document: 'none' }] }), { code: 'input.missing_field', message: 'vendor 1: interest is required' });
  for (const interest of [5, '1'.repeat(33)]) assert.equal(code({ vendors: [{ interest, document: 'none' }] }), 'input.amount_invalid');
  assert.throws(() => calculations.foreignResidentWithholding({ ...sale, vendors: [{ interest: '1', document: 5 }] }), /document must be none, clearance_certificate or variation/);
  for (const rate of [5, 'inf', '-0.1', '1.01']) {
    assert.equal(code({ vendors: [{ interest: '1', document: 'variation', rate, maximum_price: '1' }] }), 'foreign_resident_withholding.vendors_invalid', String(rate));
  }
  assert.equal(code({ vendors: [{ interest: '1', document: 'variation', rate: '-0', maximum_price: '1300000' }] }), 'computed');
});

test('the foreign resident capital gains withholding page words the year, the documents and a refusal it has no words for', () => {
  assert.deepEqual([calculations.frcgwYearOf('2026-08-01'), calculations.frcgwYearOf('2026-06-30')], ['2026-27', '2025-26']);
  const sale = { date: '2026-03-15', asset: 'taxable_australian_real_property', 'market-value': '700000', price: '700000', exclusion: 'none', 'class-nil': 'no',
    'vendor-1-interest': '1', 'vendor-1-document': 'none' };
  assert.equal(calculations.frcgwFormInput(form({ ...sale, date: '15/03/2026' })).year, '');
  const nil = calculations.frcgwResult(form({ ...sale, exclusion: 'approved_stock_exchange' }), aud);
  assert.match(nil.note, /^Nothing to withhold: /);
  assert.deepEqual(nil.rows[nil.principal], ['Amount to pay the ATO at settlement', '$0.00']);
  assert.throws(() => calculations.frcgwResult(form({ ...sale, asset: 'shares' }), aud), (error) => error.code !== undefined);
  assert.match(calculations.frcgwInputsText({ acquisition_date: 'd', asset: 'other', market_value: '1', cost_base_first_element: '1', option_payments: '0',
    vendors: [{ interest: '1', document: 'other' }] }, aud), /^Contract d; other, market value \$1\.00, purchase price \$1\.00; vendor 1: interest 1, other$/);
});

test('the partnership page shows net income, the shares of exempt and non-assessable non-exempt income, and its own refusals', () => {
  const values = { year: '2026', 'assessable-income': '1000', deductions: '400', 'exempt-income': '100', 'non-assessable-non-exempt-income': '50',
    'excluded-deductions': '', scope: 'none', australian: 'yes', 'partner-1-name': 'A', 'partner-1-interest': '50', 'partner-1-residency': 'resident',
    'partner-2-name': 'B', 'partner-2-interest': '50', 'partner-2-residency': 'non_resident' };
  const r = calculations.partnershipResult(form(values), aud);
  // ITAA 1936 s 90: $1,000 less $400 is $600 of net income, shared 50:50; the exempt and NANE income are shared as well.
  assert.deepEqual(r.rows.slice(2), [['Net income (s 90)', '$600.00'], ['A (50%): share of net income', '$300.00'], ['A: share of exempt income', '$50.00'],
    ['A: share of non-assessable non-exempt income', '$25.00'], ['B (50%): share of net income', '$300.00'], ['B: share of exempt income', '$50.00'],
    ['B: share of non-assessable non-exempt income', '$25.00']]);
  assert.match(r.inputs, /, exempt income \$100\.00, non-assessable non-exempt income \$50\.00; partners: A 50%, B 50% \(non-resident\)$/);
  assert.throws(() => calculations.partnershipResult(form({ ...values, 'partner-1-name': '', 'partner-2-name': '', 'partner-1-interest': '', 'partner-2-interest': '' }), aud),
    { message: 'Enter at least one partner with a name and interest.' });
  const scoped = calculations.partnershipFormInput(form({ ...values, scope: 'foreign_hybrid' }));
  assert.equal(scoped.foreign_hybrid, true);
  const engine = (call) => messageOf(() => calculations.partnershipNetIncome(call));
  for (const call of [null, [], 'x']) assert.equal(engine(call), 'input must be a JSON object');
  const call = calculations.partnershipFormInput(form(values));
  assert.equal(engine({ ...call, financial_year: '2026' }), 'financial_year must be an integer');
  assert.equal(engine({ ...call, assessable_income: 5 }), 'assessable_income must be a string');
  assert.equal(engine({ ...call, assessable_income: '1'.repeat(8193) }), 'assessable_income: decimal input exceeds 8192 bytes');
  assert.equal(engine({ ...call, partners: 'A' }), 'partners must be an array');
  assert.equal(engine({ ...call, partners: [null] }), 'residency must be a string');
});

test('the trust loss page words each test’s state and the deduction as the command decides them', () => {
  const words = new Map([
    ['false/true', 'Does not apply'], ['false/false', 'Does not apply'], ['false/null', 'Does not apply'],
    ['null/true', 'Passed; whether it applies not stated'], ['true/true', 'Passed'],
    ['null/false', 'Failed; whether it applies not stated'], ['true/false', 'Failed'],
    ['true/null', 'Not established'], ['null/null', 'Not established'],
  ]);
  const fields = ['stake', 'alternative', 'income-now', 'income-before', 'capital-now', 'capital-before', 'pattern', 'previously-failed', 'over-50', 'maintained',
    'control', 'injection'];
  const seen = new Set();
  const deductible = new Set();
  const notes = new Set();
  for (const kind of ['fixed', 'non_fixed']) {
    for (const excepted of ['none', 'family_trust']) {
      for (const rest of ['yes', 'no', 'unknown']) {
        for (const name of fields) {
          for (const answer of ['yes', 'no', 'unknown']) {
            const values = { year: '2026', 'loss-year': '2023', kind, excepted, ...Object.fromEntries(fields.map((f) => [f, rest])), [name]: answer };
            const r = calculations.trustLossTests(calculations.trustLossFormInput(form(values)));
            const page = calculations.trustLossResult(form(values));
            r.tests.forEach((t, i) => {
              const [, state] = page.rows.at(i);
              assert.equal(state, words.get(`${t.applies}/${t.passed}`));
              seen.add(state);
            });
            assert.equal(page.rows[page.principal][1], r.deductible === true ? 'Yes' : r.deductible === false ? 'No' : 'Not established');
            deductible.add(r.deductible);
            notes.add(r.not_established.length > 0);
          }
        }
      }
    }
  }
  assert.equal(seen.size, 6);
  assert.deepEqual([deductible.size, notes.size], [3, 2]);
  assert.match(calculations.trustLossInputsText({ financial_year: 2026, loss_year: 2023, trust_kind: 'fixed', excepted_trust: 'family_trust' }), /; excepted trust: family trust$/);
  const engine = (call) => messageOf(() => calculations.trustLossTests(call));
  for (const call of [null, [], 'x']) assert.equal(engine(call), 'input must be a JSON object');
  const base = { financial_year: 2026, loss_year: 2023, deduction: 'prior_year_tax_loss', trust_kind: 'non_fixed' };
  assert.equal(engine({ ...base, test_year_distributions: 5 }), engine({ ...base, test_year_distributions: {} }));
  const working = (income) => calculations.trustLossTests({ ...base, test_year_distributions: { income, capital: [] } });
  assert.deepEqual(working([{ b: '30', a: '30', c: '40' }]), working([{ c: '40', a: '30', b: '30' }]));
});

test('the train 7 tools pass their optional inputs to the commands and refuse a year outside their range', async () => {
  const tools = calculatorTools(calculations);
  const frcgw = tools['foreign-resident-withholding'];
  const sale = { acquisitionDate: '2026-08-01', asset: 'taxable_australian_real_property', marketValue: '1200000', costBaseFirstElement: '1200000',
    vendors: [{ interest: '1', document: 'variation' }] };
  await assert.rejects(frcgw.execute(sale), /rate must be a decimal string from 0 to 1/);
  const july = await frcgw.execute({ ...sale, vendors: [{ interest: '1', document: 'none' }] });
  assert.equal(july.incomeYear, '2026-27');
  const nrw = tools['non-resident-withholding'];
  const interest = await nrw.execute({ incomeYear: '2025-26', paymentType: 'interest', payment: '1000' });
  assert.equal(interest.withholding, '100.00');
  await assert.rejects(nrw.execute({ incomeYear: '2025-26', paymentType: 'interest', payment: '1000', frankedAmount: '1' }), /franked_amount/);
  await assert.rejects(nrw.execute({ incomeYear: '2025-26', paymentType: 'interest', payment: '1000', conduitForeignIncome: '1' }), /conduit_foreign_income/);
  const dividend = await nrw.execute({ incomeYear: '2025-26', paymentType: 'dividend', payment: '1000' });
  assert.equal(dividend.withholding, '300.00');
  const trust = tools['trust-loss-tests'];
  const t = await trust.execute({ incomeYear: '2025-26', lossYear: 2023, trustKind: 'non_fixed', exceptedTrust: 'family_trust' });
  assert.deepEqual([t.deductible, t.exceptedTrust], [calculations.trustLossTests({ financial_year: 2026, loss_year: 2023, deduction: 'prior_year_tax_loss',
    trust_kind: 'non_fixed', excepted_trust: 'family_trust' }).deductible, { kind: 'family_trust', provision: 's 272-100(a)' }]);
  const income = [[{ individual: 'Ann', percent: '60' }], [{ individual: 'Ann', percent: '55' }]];
  const tYears = await trust.execute({ incomeYear: '2025-26', lossYear: 2023, trustKind: 'non_fixed', testYearDistributions: { income } });
  assert.deepEqual(tYears.patternOfDistributionsWorking, calculations.trustLossTests({ financial_year: 2026, loss_year: 2023, deduction: 'prior_year_tax_loss',
    trust_kind: 'non_fixed', test_year_distributions: { income: [{ Ann: '60' }, { Ann: '55' }], capital: [] } }).pattern_of_distributions_working);
  const car = await tools['motor-vehicle-duty'].execute({ jurisdiction: 'qld', dutiableValue: '50000', dutyDate: '2026-09-01', engine: 'up_to_4_cylinders' });
  assert.equal(car.duty, calculations.motorVehicleDuty({ jurisdiction: 'qld', vehicle_class: 'passenger', dutiable_value: '50000', duty_date: '2026-09-01',
    year: '2026-27', scope_confirmed: true, engine: 'up_to_4_cylinders' }).amounts.duty);
  const cover = tools['insurance-duty'];
  const nt = { jurisdiction: 'nt', class: 'general', premium: '1000', effectedDate: '2026-09-01' };
  await assert.rejects(cover.execute({ ...nt, termOverOneYear: true }), /term/);
  const typeC = await cover.execute({ jurisdiction: 'nsw', class: 'type_c', premium: '1000', effectedDate: '2026-09-01', policyTakenOut: '2018-01-01' });
  assert.equal(typeC.duty, '0.00');
});
