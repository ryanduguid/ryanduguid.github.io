// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The transfer balance page against the ATO's examples ('Calculating your personal transfer balance cap',
// 31 March 2026; 'Transfer balance account', 18 June 2025; 'Excess transfer balance', 7 February 2025),
// the australian-accounting oracle's figures, and the `transfer-balance` and `excess-contributions`
// commands on every case of their differential fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { CHARGE_YEARS, RELEASE_YEARS, excessContributions } from '../assets/excess-contributions.mjs';
import { TBA_YEARS, dollarsText, transferBalance } from '../assets/transfer-balance.mjs';
import { excessFormInput, tbaFormInput, transferBalanceResult } from '../assets/transfer-balance-result.mjs';

const fixture = createRequire(import.meta.url)('./transfer-balance-engine-differential.json');
// Every runner (check_site, mutation-check and `node --test scripts/`) starts in the site's root.
const page = readFileSync('_includes/calculators/transfer-balance.html', 'utf8');
const aud = (v) => v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const code = (run) => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return 'computed';
};
const events = (list) => list.map(([date, kind, amount]) => ({ date, kind, amount }));
const account = (list, to, liable = false) => transferBalance({ events: events(list), to, previously_liable: liable,
  year: `${Number(to.slice(0, 4)) - (Number(to.slice(5, 7)) < 7 ? 1 : 0)}-${String((Number(to.slice(0, 4)) + (Number(to.slice(5, 7)) < 7 ? 0 : 1)) % 100).padStart(2, '0')}`,
  scope_confirmed: true });
/** A form's value reader over the given fields. */
const ask = (fields) => (name) => new Map(Object.entries(fields)).get(name) ?? '';
/** The option values of a select, in page order. */
const options = (select) => [...page.match(select)[1].matchAll(/value="([^"]+)"/g)].map(([, y]) => y);
const capIn = (r, year) => r.caps.find((c) => c.year === year)?.cap;

test('the page agrees with the australian-accounting commands on every differential case', () => {
  const shape = {
    'transfer-balance': (call) => {
      const r = transferBalance(call);
      const caps = r.caps.map((c) => ({ year: c.year, general_transfer_balance_cap: `${c.general}.00`, transfer_balance_cap: `${c.cap}.00`,
        ...(c.highest === undefined ? {} : { highest_transfer_balance: c.highest, highest_on: c.highestOn, cap_on_that_day: `${c.capThen}.00` }),
        ...(c.why === 'indexed' ? { unused_cap_percentage: c.unused, indexation_increase: `${c.increase}.00` } : {}) }));
      return { amounts: r.amounts, rates: r.rates, to: r.to, caps,
        ledger: r.ledger.map((l) => ({ date: l.date, kind: l.kind, debit: l.debit, credit: l.credit, transfer_balance: l.balance })),
        excess_periods: r.periods.map((p) => ({ from: p.from, to: p.to, days: p.days, notional_earnings: p.earnings,
          tax_rate_percent: p.rate, excess_transfer_balance_tax: p.tax })),
        in_excess_at_to: r.inExcess };
    },
    'excess-contributions': (call) => {
      const r = excessContributions(call);
      return { amounts: r.amounts, rates: r.rates, question: r.question, days: r.days,
        ...(r.firstDay === undefined ? {} : { first_day: r.firstDay, last_day: r.lastDay }) };
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
    assert.deepEqual(got, c.refused ? { refused: c.refused } : c.result, c.source);
  }
  assert.equal(fixture.cases.length, 585);
  assert.ok(page.includes(`agrees with both commands on ${fixture.cases.length} test cases`));
});

test('an exact amount shows to the cent, half up away from nil, as the command rounds it', () => {
  assert.deepEqual([dollarsText(-3000000n, 1n), dollarsText(1n, 2n), dollarsText(-1n, 2n), dollarsText(-1n, 3n), dollarsText(5n, 1n)],
    ['-30000.00', '0.01', '-0.01', '0.00', '0.05']);
});

test('proportional indexation: Nina, Leanne, Nada and Maryanne', () => {
  const nina = account([['2018-10-01', 'new_income_stream', '1200000'], ['2023-10-01', 'new_income_stream', '400000']], '2026-07-01');
  assert.deepEqual(['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'].map((y) => capIn(nina, y)),
    [1600000, 1625000, 1625000, 1675000, 1675000, 1680000, 1685000]);
  assert.equal(nina.amounts.cap_space, '85000.00');
  const leanne = account([['2025-10-01', 'new_income_stream', '1000000'], ['2026-05-13', 'commutation', '200000']], '2026-07-01');
  assert.deepEqual([capIn(leanne, '2026-27'), leanne.amounts.transfer_balance], [2050000, '800000.00']);
  const nada = account([['2024-05-14', 'new_income_stream', '490000'], ['2025-10-10', 'new_income_stream', '510000']], '2026-07-01');
  assert.deepEqual([capIn(nada, '2025-26'), capIn(nada, '2026-27')], [1975000, 2025000]);
  const maryanne = account([['2025-12-01', 'new_income_stream', '2000000'], ['2026-07-01', 'commutation', '400000']], '2026-07-01');
  assert.deepEqual([maryanne.amounts.transfer_balance_cap, maryanne.amounts.cap_space], ['2000000.00', '400000.00']);
});

test('excess transfer balance earnings and tax: Simon, Elisabeth, Paolo and IT(TP)A s 294-30', () => {
  const simon = account([['2025-07-01', 'new_income_stream', '2000000'], ['2026-06-30', 'commutation', '2000000'],
    ['2026-07-01', 'new_income_stream', '2100000']], '2026-07-31');
  assert.deepEqual([simon.amounts.notional_earnings, simon.amounts.transfer_balance, simon.inExcess], ['975.34', '2100943.73', true]);
  const elisabeth = [['2017-08-02', 'new_income_stream', '1600000'], ['2019-09-07', 'commutation', '1630000'], ['2019-10-12', 'new_income_stream', '1640000']];
  const e = account(elisabeth, '2019-12-31');
  assert.equal(e.ledger[1].balance, '-30000.00');
  assert.deepEqual([e.periods[0].from, e.amounts.notional_earnings, e.amounts.excess_transfer_balance_tax], ['2019-10-12', '178.65', '26.80']);
  // Liable for an earlier period from 1 July 2018: 30%.
  assert.equal(account(elisabeth, '2019-12-31', true).amounts.excess_transfer_balance_tax, '53.59');
  const paolo = account([['2017-07-01', 'existing_income_stream', '1950000'], ['2017-08-01', 'commutation', '353000']], '2017-08-31');
  assert.deepEqual([paolo.amounts.notional_earnings, paolo.amounts.transfer_balance, paolo.amounts.excess_transfer_balance_tax],
    ['2604.41', '1599604.41', '390.66']);
  const held = (debit) => account([['2017-07-01', 'existing_income_stream', '1650000'], ['2017-12-01', 'commutation', debit]], '2018-06-30');
  assert.deepEqual([held('50000').periods.length, held('40000').periods[0].from], [0, '2017-07-01']);
  assert.equal(code(() => account([['2017-07-01', 'existing_income_stream', '1650000']], '2017-12-30')), 'transfer_balance.transition_undecided');
  assert.equal(code(() => account([['2017-07-01', 'reversionary_income_stream', '100']], '2017-12-30')), 'transfer_balance.event_refused');
  assert.equal(code(() => account([['2026-12-31', 'new_income_stream', '2200000']], '2027-01-01')), 'transfer_balance.rate_unpublished');
});

test('the excess concessional contributions charge and the release of excess non-concessional contributions', () => {
  const charge = (year, tax, due) => excessContributions({ question: 'concessional_charge', year, scope_confirmed: true, additional_tax: tax, tax_due_date: due });
  assert.equal(charge('2020-21', '1000', '2021-12-01').amounts.excess_concessional_contributions_charge, '44.17');
  assert.equal(charge('2013-14', '2500.50', '2014-11-21').amounts.excess_concessional_contributions_charge, '205.03');
  assert.equal(code(() => charge('2021-22', '1000', '2022-12-01')), 'excess_contributions.charge_abolished');
  const release = (year, excess, date) => excessContributions({ question: 'non_concessional_release', year, scope_confirmed: true, excess, determination_date: date });
  const r = release('2024-25', '100000', '2025-09-15');
  assert.deepEqual(r.amounts, { associated_earnings: '14663.00', total_release_amount: '112463.55', assessable_associated_earnings: '14663.00',
    associated_earnings_tax_offset: '2199.45' });
  assert.equal(r.rates.proxy_rate_percent, '11.332466');
  assert.equal(release('2020-21', '50000', '2021-11-30').amounts.associated_earnings, '5251.00');
  assert.equal(code(() => release('2024-25', '100000', '2024-06-30')), 'excess_contributions.date_order');
});

test('the form sends the rows it has, the year of the last day, and each question’s facts', () => {
  const fields = { 'event-1-date': '2025-10-01', 'event-1-kind': 'new_income_stream', 'event-1-amount': '1000000', 'event-3-date': '2026-05-13',
    'event-3-kind': 'commutation', 'event-3-amount': '200000', to: '2026-07-01', liable: 'no' };
  const input = tbaFormInput(ask(fields));
  assert.deepEqual(input, { events: [{ date: '2025-10-01', kind: 'new_income_stream', amount: '1000000' },
    { date: '2026-05-13', kind: 'commutation', amount: '200000' }], to: '2026-07-01', previously_liable: false, year: '2026-27', scope_confirmed: true });
  assert.equal(tbaFormInput(ask({ ...fields, to: '' })).year, '');
  assert.deepEqual(excessFormInput(ask({ calc: 'charge', 'charge-year': '2020-21', 'additional-tax': '5', 'due-date': '2021-12-01' })),
    { question: 'concessional_charge', year: '2020-21', scope_confirmed: true, additional_tax: '5', tax_due_date: '2021-12-01' });
  assert.deepEqual(options(/<select name="charge-year"[^>]*>(.*?)<\/select>/s), [...CHARGE_YEARS].reverse());
  assert.deepEqual(options(/<select name="release-year"[^>]*>(.*?)<\/select>/s), [...RELEASE_YEARS].reverse());
  assert.equal(TBA_YEARS.at(-1), '2026-27');
});

test('the page shows the account’s caps, ledger and excess periods, and each question’s result', () => {
  const defaults = new Map();
  for (const [tag] of page.matchAll(/<input\b[^>]*>/g)) if (!tag.includes('type="radio"') || tag.includes(' checked')) defaults.set(tag.match(/\bname="([^"]+)"/)[1], tag.match(/\bvalue="([^"]*)"/)?.[1] ?? '');
  for (const [, name, body] of page.matchAll(/<select\b[^>]*\bname="([^"]+)"[^>]*>(.*?)<\/select>/gs)) {
    const options = [...body.matchAll(/<option\b([^>]*)>/g)].map(([, a]) => a);
    defaults.set(name, (options.find((a) => /\bselected\b/.test(a)) ?? options[0]).match(/\bvalue="([^"]*)"/)[1]);
  }
  const result = (calc) => transferBalanceResult((name) => (name === 'calc' ? calc : defaults.get(name) ?? ''), aud);
  const t = result('transfer');
  assert.deepEqual(t.rows[t.principal], ['Excess transfer balance tax', '$26.80']);
  assert.deepEqual(t.tables['tba-periods'], [['12 October 2019 to 31 December 2019', '81', '$178.65', '15%', '$26.80']]);
  assert.deepEqual(t.tables['tba-ledger'][1], ['7 September 2019', 'Commutation (debit)', '$1,630,000.00', '$0.00', '-$30,000.00']);
  assert.equal(t.tables['tba-caps'].length, 3);
  const c = result('charge');
  assert.deepEqual(c.rows[c.principal], ['Excess concessional contributions charge', '$44.17']);
  const r = result('release');
  assert.deepEqual(r.rows[r.principal], ['Total release amount: the excess and 85% of the earnings', '$112,463.55']);
  assert.match(r.note, /The ATO publishes 11\.33% a year/);
});
