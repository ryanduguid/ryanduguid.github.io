// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The super lump sum tax page's withholding and departing Australia superannuation payment options
// against Schedule 12's examples (the ATO's 2020 schedule and LI 2026/18, read 23 November 2026), the
// DASP Tax Act s 5 rates, and the `super-withholding` and `dasp-tax` commands of
// ryanduguid/australian-accounting on every case of their differential fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { DASP_YEARS, daspFormInput, daspTax } from '../assets/dasp-tax.mjs';
import { superBenefitTaxResult } from '../assets/super-lump-sum.mjs';
import { streamFormInput, streamWithholdingResult, superWithholding, swhFormInput } from '../assets/super-withholding.mjs';

const fixture = createRequire(import.meta.url)('./super-lump-sum-options-engine-differential.json');
const streams = createRequire(import.meta.url)('./super-income-stream-engine-differential.json');
// Every runner (check_site, mutation-check and `node --test scripts/`) starts in the site's root.
const page = readFileSync('_includes/calculators/super-benefit-tax.html', 'utf8');
const aud = (v) => `$${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The form's opening values: each input's value, the checked radio's and each select's selected option. */
const defaults = () => {
  const fields = new Map();
  for (const [tag] of page.matchAll(/<input\b[^>]*>/g)) if (!tag.includes('type="radio"') || tag.includes(' checked')) fields.set(tag.match(/\bname="([^"]+)"/)[1], tag.match(/\bvalue="([^"]*)"/)?.[1] ?? '');
  for (const [, name, body] of page.matchAll(/<select\b[^>]*\bname="([^"]+)"[^>]*>(.*?)<\/select>/gs)) {
    const options = [...body.matchAll(/<option\b([^>]*)>/g)].map(([, attributes]) => attributes);
    fields.set(name, (options.find((attributes) => /\bselected\b/.test(attributes)) ?? options[0]).match(/\bvalue="([^"]*)"/)[1]);
  }
  return fields;
};
const form = (change = {}) => {
  const fields = new Map([...defaults(), ...Object.entries(change)]);
  return (name) => fields.get(name) ?? '';
};
const code = (run) => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return 'computed';
};
const withheld = (change) => superWithholding(swhFormInput(form({ calc: 'withholding', ...change }))).withholding;

test('withholding and DASP tax agree with the australian-accounting commands on every differential case', () => {
  const extra = { 'super-withholding': 'treatment', 'dasp-tax': 'rate_basis' };
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort());
  const shape = {
    'dasp-tax': (call) => {
      const r = daspTax(call);
      const m = (v) => v.toFixed(2);
      return { amounts: sorted({ payment: m(r.payment), tax_free_component_tax: m(r.taxFreeTax), taxed_element_tax: m(r.taxedTax),
        untaxed_element_tax: m(r.untaxedTax), dasp_tax: m(r.tax), net_payment: m(r.net) }), rates: sorted(r.rates), extra: r.rateBasis };
    },
    'super-withholding': (call) => {
      const r = superWithholding(call);
      return { amounts: sorted(r.amounts), rates: sorted(r.rates), extra: r.treatment };
    },
  };
  for (const c of fixture.cases) {
    let got;
    try {
      got = shape[c.command](c.call);
    } catch (error) {
      if (!error.code) throw error;
      got = { refused: error.code };
    }
    const want = c.refused ? { refused: c.refused } : { amounts: sorted(c.amounts), rates: sorted(c.rates), extra: c[extra[c.command]] };
    assert.deepEqual(got, want, c.source);
  }
  assert.equal(fixture.cases.length, 613);
  assert.ok(page.includes(`super-withholding</code> and <code>dasp-tax</code> commands on ${fixture.cases.length} more`));
});

test('income stream withholding agrees with the super-withholding command on every differential case', () => {
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort());
  for (const c of streams.cases) {
    let got;
    try {
      const r = superWithholding(c.call);
      got = { amounts: sorted(r.amounts), rates: sorted(r.rates), treatment: r.treatment, period: r.period };
    } catch (error) {
      if (!error.code) throw error;
      got = { refused: error.code };
    }
    const want = c.refused ? { refused: c.refused }
      : { amounts: sorted(c.amounts), rates: sorted(c.rates), treatment: c.treatment, period: c.income_stream_period };
    assert.deepEqual(got, want, c.source);
  }
  assert.equal(streams.cases.length, 359);
  assert.ok(page.includes(`income stream withholding on ${streams.cases.length} more`));
});

test('Schedule 13 Case A: Veronica’s fortnightly disability super income stream in each year', () => {
  const veronica = { calc: 'stream' };
  const stream = (change) => superWithholding(streamFormInput(form({ ...veronica, ...change })));
  assert.equal(stream({}).withholding, 2);
  assert.equal(stream({ 'stream-year': '2025-26', 'stream-paid': '2025-09-01', 'stream-born': '1967-01-15' }).withholding, 10);
  assert.equal(stream({ 'stream-year': '2024-25', 'stream-paid': '2024-09-01', 'stream-born': '1966-01-15' }).withholding, 10);
  // Without a TFN: 47% of the taxable component, cents ignored, and no threshold answer is sent.
  const noTfn = streamFormInput(form({ 'stream-tfn': 'no' }));
  assert.equal(Object.hasOwn(noTfn, 'tax_free_threshold_claimed'), false);
  assert.equal(superWithholding(noTfn).withholding, 517);
  const aud = (/** @type {number} */ value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  const shown = (/** @type {Record<string, string>} */ change) => {
    const r = streamWithholdingResult(form({ ...veronica, ...change }), aud);
    return r.rows[r.principal];
  };
  assert.deepEqual([shown({}), shown({ 'stream-tfn': 'no' })],
    [['Amount to withhold, to the nearest dollar', '$2.00'], ['Amount to withhold, cents ignored', '$517.00']]);
  // A dependant's stream sends the deceased's age, not the disability answer.
  const dependant = streamFormInput(form({ 'stream-recipient': 'death_benefits_dependant' }));
  assert.deepEqual([dependant.deceased_aged_60_or_over, Object.hasOwn(dependant, 'disability_superannuation_benefit')], [false, false]);
  assert.equal(code(() => superWithholding(streamFormInput(form({ 'stream-capped': 'yes', 'stream-born': '1950-01-01' })))), 'super_withholding.capped_defined_benefit');
});

test('Schedule 12 examples: Tom’s roll-overs, Chloe, Heather and Dean', () => {
  const tom = { recipient: 'rollover', benefit: '1585000', interest: '1585000', 'interest-free': '0', untaxed: '1585000', 'plan-used': '0' };
  assert.equal(withheld({ ...tom, year: '2020-21', paid: '2020-11-01' }), 9400);
  assert.equal(withheld({ ...tom, benefit: '1967000', interest: '1967000', untaxed: '1967000' }), 15040);
  // Chloe (LI 2026/18) is the form's lump sum: 62, $80,000 untaxed at 17%.
  assert.equal(withheld({}), 13600);
  const heather = { year: '2020-21', paid: '2020-12-01', born: '1961-01-15', benefit: '250000', interest: '250000', 'interest-free': '30000', untaxed: '0' };
  assert.equal(withheld(heather), 850);
  assert.equal(withheld({ ...heather, born: '1959-06-01' }), 0);
  // No TFN: 47% of the taxable component, cents ignored in the amount and the result.
  assert.equal(withheld({ born: '1981-01-01', benefit: '10000.99', interest: '10000.99', 'interest-free': '0', untaxed: '0', tfn: 'no' }), 4700);
  assert.equal(withheld({ ...tom, benefit: '1935212.99', interest: '1935212.99', untaxed: '1935212.99', tfn: 'no' }), 99);
  assert.equal(code(() => withheld({ year: '2020-21', paid: '2020-10-12' })), 'super_withholding.schedule_not_read');
  assert.equal(code(() => withheld({ recipient: 'non_dependant', tfn: 'no' })), 'super_withholding.no_tfn_unstated');
});

test('the withholding form sends only the facts each payee’s withholding takes', () => {
  const sent = (change) => Object.keys(swhFormInput(form({ calc: 'withholding', ...change }))).sort();
  const base = ['benefit', 'foreign_resident', 'interest_tax_free_component', 'interest_value', 'payment_date', 'recipient', 'scope_confirmed',
    'tfn_provided', 'untaxed_element', 'year'];
  assert.deepEqual(sent({ recipient: 'rollover' }), [...base, 'service_before_july_1983', 'untaxed_plan_cap_used'].sort());
  assert.deepEqual(sent({ recipient: 'deceased_estate_trustee' }), base);
  const member = [...base, 'date_of_birth', 'disability_superannuation_benefit', 'service_before_july_1983', 'terminal_medical_condition'];
  assert.deepEqual(sent({ tfn: 'no' }), member.sort());
  assert.deepEqual(sent({ terminal: 'yes' }), member.sort());
  assert.deepEqual(sent({}), [...member, 'untaxed_plan_cap_used'].sort());
  assert.equal(code(() => superWithholding(swhFormInput(form({ calc: 'withholding', tfn: '' })))), 'input.missing_field');
});

test('DASP tax: the Act’s rates, a working holiday maker’s 65% and the refusals', () => {
  const tax = (change) => daspTax(daspFormInput(form(change)));
  assert.deepEqual([tax({}).tax, tax({}).net], [5950, 36050]);
  assert.equal(tax({ whm: 'yes' }).tax, 11050);
  assert.deepEqual([tax({ 'dasp-free': '1000', 'dasp-taxed': '10000', 'dasp-untaxed': '20000' }).tax,
    tax({ 'dasp-free': '1000', 'dasp-taxed': '10000', 'dasp-untaxed': '20000', whm: 'yes' }).tax], [12500, 19500]);
  assert.equal(code(() => tax({ 'dasp-untaxed': '50', unclaimed: 'yes' })), 'dasp_tax.unclaimed_money_rollover');
  assert.equal(code(() => tax({ 'dasp-free': '0', 'dasp-taxed': '0' })), 'dasp_tax.payment_nil');
  const years = [...page.match(/<select name="dasp-year"[^>]*>(.*?)<\/select>/s)[1].matchAll(/value="([^"]+)"/g)].map(([, y]) => y);
  assert.deepEqual(years, [...DASP_YEARS].reverse());
});

test('the page shows each calculation’s result and dates the sources it adds', () => {
  const result = (calc) => superBenefitTaxResult(form({ calc }), aud);
  const w = result('withholding');
  assert.deepEqual(w.rows[w.principal], ['Amount to withhold, to the nearest dollar', '$13,600.00']);
  assert.ok(w.rows.some(([label, value]) => label === 'Untaxed element within the untaxed plan cap left, $80,000.00 at 17%' && value === '$13,600.00'));
  const shown = (change) => superBenefitTaxResult(form({ calc: 'withholding', ...change }), aud);
  const member = shown({ born: '1981-01-01', benefit: '10000.99', interest: '10000.99', 'interest-free': '0', untaxed: '0', tfn: 'no' });
  assert.deepEqual(member.rows[member.principal], ['Amount to withhold, cents ignored', '$4,700.00']);
  assert.match(member.note, /no TFN: 47% with no offsets or Medicare levy, cents ignored$/);
  const tom = shown({ recipient: 'rollover', benefit: '1967000.99', interest: '1967000.99', 'interest-free': '0', untaxed: '1967000.99', 'plan-used': '0', tfn: 'no' });
  assert.deepEqual(tom.rows[tom.principal], ['Amount to withhold, cents ignored', '$15,040.00']);
  assert.ok(tom.rows.some(([label, value]) => label === 'Untaxed element above the untaxed plan cap left' && value === '$32,000.99'));
  assert.match(tom.note, /nothing on the rest, cents ignored without a TFN$/);
  // A member's untaxed element above the plan cap: withheld at 47%, stated once.
  const above = shown({ benefit: '100000', interest: '100000', 'interest-free': '0', untaxed: '100000', 'plan-used': '1900000' });
  assert.ok(above.rows.some(([label]) => /^Untaxed element above the untaxed plan cap left, \$[\d,.]+ at 47%$/.test(label)));
  assert.ok(above.rows.every(([label]) => !label.includes('top marginal rate')));
  const d = result('dasp');
  assert.deepEqual(d.rows[d.principal], ['Departing Australia superannuation payment tax', '$5,950.00']);
  assert.equal(result('tax').rows.at(-2)[1], '$12,000.00');
  assert.equal((page.match(/read 23 November 2026/g) ?? []).length, 2);
  assert.ok(page.includes('read again on 23 November 2026'));
});

// The income stream page's result as accounting-pages.mjs shows it: every differential case the form can enter (the
// form gives back the case's call), each row checked against the super-withholding command's amounts.
test('the income stream page shows the command’s withholding for every case its form can enter', () => {
  const aud = (value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  const yesNo = (flag) => (flag === undefined ? '' : flag ? 'yes' : 'no');
  const fieldsOf = (call) => ({ calc: 'stream', 'stream-payment': call.benefit, 'stream-interest': call.interest_value,
    'stream-interest-free': call.interest_tax_free_component, 'stream-untaxed': call.untaxed_element, 'stream-recipient': call.recipient,
    'stream-paid': call.payment_date, 'stream-year': call.year, 'stream-tfn': yesNo(call.tfn_provided), 'stream-foreign': yesNo(call.foreign_resident),
    'stream-period': call.income_stream_period, 'stream-born': call.date_of_birth, 'stream-capped': yesNo(call.capped_defined_benefit),
    'stream-threshold': yesNo(call.tax_free_threshold_claimed), 'stream-disability': yesNo(call.disability_superannuation_benefit),
    'stream-deceased': yesNo(call.deceased_aged_60_or_over) });
  const seen = new Set();
  let shown = 0;
  for (const { source, call, amounts, rates, refused } of streams.cases) {
    const fields = fieldsOf(call);
    const value = (name) => fields[name] ?? '';
    if (refused || JSON.stringify(Object.entries(streamFormInput(value)).sort()) !== JSON.stringify(Object.entries(call).sort())) continue;
    shown += 1;
    const r = superBenefitTaxResult(value, aud);
    const row = (label) => r.rows.find(([name]) => name.startsWith(label))?.[1];
    assert.equal(row('Amount withheld from, cents ignored'), aud(Number(amounts.withheld_from)), source);
    assert.equal(row('Schedule 1 amount for the'), 'withholding_amount' in amounts ? aud(Number(amounts.withholding_amount)) : undefined, source);
    assert.deepEqual(r.rows[r.principal], [`Amount to withhold, ${call.tfn_provided ? 'to the nearest dollar' : 'cents ignored'}`,
      aud(Number(amounts.withholding))], source);
    if (!call.tfn_provided) {
      assert.ok(r.note.endsWith(`no TFN: ${rates.no_tfn_rate === '0.45' ? 45 : 47}% with no offsets or Medicare levy adjustment, cents ignored`), source);
      seen.add(`no TFN ${rates.no_tfn_rate}`);
    }
    assert.equal(r.inputs.includes(', foreign resident'), call.foreign_resident, source);
    assert.equal(r.inputs.includes(', tax-free threshold not claimed'), call.tax_free_threshold_claimed === false, source);
    assert.ok(r.inputs.includes(call.recipient === 'member' ? '; member;' : '; death benefits dependant;'), source);
    seen.add(call.recipient);
    if (call.foreign_resident) seen.add('foreign');
    if (call.tax_free_threshold_claimed === false) seen.add('no threshold');
  }
  assert.deepEqual([...seen].sort(), ['death_benefits_dependant', 'foreign', 'member', 'no TFN 0.45', 'no TFN 0.47', 'no threshold']);
  assert.ok(shown >= 200, `${shown} cases`);
  // A blank untaxed element is nil, and a blank answer is left out for the command to refuse or default.
  const blank = streamFormInput(form({ 'stream-untaxed': '', 'stream-foreign': '' }));
  assert.deepEqual([blank.untaxed_element, 'foreign_resident' in blank], ['0', false]);
  assert.equal(code(() => superWithholding(streamFormInput(form({ 'stream-born': '1968-02-30' })))), 'input.date_invalid');
});
