// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The income tax page's foreign income tax offset option and foreign income conversion form
// (australian-accounting foreign-income-tax-offset and foreign-income-conversion).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { foreignTaxOffset } from '../assets/foreign-income-tax-offset.mjs';
import { foreignIncomeConversion } from '../assets/foreign-income-conversion.mjs';

export const foreignIncomeFixture = createRequire(import.meta.url)('./foreign-income-engine-differential.json');
const row = (result, label) => result.rows.find(([name]) => name === label)?.[1];

/** The tests that work the page's forms; individual-tax.test.mjs runs them with its form readers.
 * @param {(fields?: object) => any} incomeTax @param {(fields?: object) => any} conversion */
export const foreignIncomeFormTests = (incomeTax, conversion) => {
test('the income tax page takes the foreign income tax offset last, within its limit and not below nil', () => {
  // FITO26 Example 16, Anna: $31,130 in 2025-26, $12,000 of foreign income and $700 of deductions left out,
  // $3,400 of foreign tax. The estimate's own Medicare levy of $311.90, at the 2025-26 threshold of $28,011,
  // gives tax payable of $2,380.70; the guide's $390.80 used the earlier threshold.
  const anna = { year: '2025-26', income: '31130', fringe: '0', uncovered: '0', withheld: '0', fito: 'yes', 'fito-paid': '3400',
    'fito-method': 'worked', 'fito-income': '12000', 'fito-deductions': '700', 'fito-levy-assumed': '0' };
  const r = incomeTax(anna);
  assert.equal(row(r, 'Tax on taxable income'), '$2,068.80');
  assert.equal(row(r, 'Low income tax offset'), '$700.00');
  assert.equal(row(r, 'Medicare levy'), '$311.90');
  // A limit of $2,119.90: the $1,368.80 of tax left after the low income tax offset and the $311.90 levy.
  assert.equal(row(r, 'Foreign income tax offset'), '$1,680.70');
  assert.equal(row(r, 'Total tax, levies and repayment'), '$0.00');
  assert.match(r.note, /Foreign income tax offset: \$3,400\.00 of foreign income tax against a limit of \$2,119\.90, from tax payable of \$2,380\.70 less \$260\.80 without the foreign income; the \$1,280\.10 above it is lost/);
  assert.match(r.note, /; \$439\.20 of the offset is more than the tax, Medicare levy and surcharge and is not refunded/);
  assert.doesNotMatch(r.note, /The tax offsets exceed the tax on taxable income/);
  assert.match(r.inputs, /, foreign income tax of \$3,400\.00 with the limit worked out$/);
  const rows = r.rows.map(([label]) => label);
  assert.ok(rows.indexOf('Foreign income tax offset') > rows.indexOf('Low income tax offset'));
  // The default limit: $1,000 plus the tax on non-assessable non-exempt income.
  const plain = incomeTax({ fito: 'yes', 'fito-paid': '1500', 'fito-nane': '300' });
  assert.equal(row(plain, 'Foreign income tax offset'), '$1,300.00');
  assert.match(plain.inputs, /foreign income tax of \$1,500\.00 and \$300\.00 on non-assessable non-exempt income with the \$1,000 limit$/);
  // Stated figures for an earlier year (FITO24 Example 17).
  const stated = incomeTax({ year: '2023-24', fito: 'yes', 'fito-paid': '2000', 'fito-method': 'stated', 'fito-payable': '18067',
    'fito-payable-assumed': '11167' });
  assert.equal(row(stated, 'Foreign income tax offset'), '$2,000.00');
  assert.equal(incomeTax({ fito: 'no', 'fito-paid': '1500' }).rows.length, incomeTax().rows.length);
  // The zone tax offset (item 20) comes off before it: $1,088 of tax less the $700 low income tax offset
  // leaves $388, of which Zone A takes $338 and the foreign income tax offset the last $50.
  const both = incomeTax({ year: '2025-26', income: '25000', fringe: '0', uncovered: '0', zone: 'zone_a', fito: 'yes', 'fito-paid': '5000' });
  assert.equal(row(both, 'Zone tax offset'), '$338.00');
  assert.equal(row(both, 'Foreign income tax offset'), '$50.00');
  // The worked limit counts the estimate's surcharge with its levy: $17,520 + $1,800 + $1,170.
  assert.match(incomeTax({ fito: 'yes', 'fito-paid': '5000', 'fito-method': 'worked', 'fito-income': '20000' }).note,
    /from tax payable of \$20,490\.00 less /);
});

test('the foreign income tax offset left after the tax comes off the Medicare levy, then the surcharge, never below nil', () => {
  // $26,788 of tax, a $2,400 levy and a $1,500 surcharge, against an offset of $40,000.
  const r = incomeTax({ year: '2025-26', income: '120000', fringe: '0', uncovered: '365', withheld: '0', fito: 'yes',
    'fito-paid': '40000', 'fito-method': 'stated', 'fito-payable': '100000', 'fito-payable-assumed': '0' });
  assert.equal(row(r, 'Foreign income tax offset'), '$30,688.00');
  assert.equal(row(r, 'Total tax, levies and repayment'), '$0.00');
  // $27,788 stops $1,000 into the levy, leaving $1,400 of it and the surcharge.
  const part = incomeTax({ year: '2025-26', income: '120000', fringe: '0', uncovered: '365', withheld: '0', fito: 'yes',
    'fito-paid': '27788', 'fito-method': 'stated', 'fito-payable': '100000', 'fito-payable-assumed': '0' });
  assert.equal(row(part, 'Total tax, levies and repayment'), '$2,900.00');
});

test('the worked foreign income tax offset limit is refused before 2024-25 and for a foreign resident', () => {
  const code = (fields) => {
    try { incomeTax({ fito: 'yes', 'fito-paid': '100', 'fito-method': 'worked', ...fields }); } catch (error) { return error.code ?? error.message; }
    return 'ok';
  };
  assert.equal(code({}), 'ok');
  assert.equal(code({ year: '2023-24' }), 'foreign_income_tax_offset.worked_year');
  assert.equal(code({ residency: 'foreign' }), 'foreign_income_tax_offset.worked_residency');
  assert.equal(code({ residency: 'working-holiday' }), 'foreign_income_tax_offset.worked_residency');
  assert.equal(code({ 'fito-method': 'default', residency: 'foreign' }), 'ok');
});

test('the foreign income conversion form opens on the spec’s US dollar income at the 2025-26 average', () => {
  const r = conversion();
  assert.equal(row(r, 'Australian dollars'), '$8,843.04');
  assert.equal(r.rows[r.principal][0], 'Australian dollars');
  assert.equal(row(r, 'Rule'), 'Section 960-50(6) item 6(b)');
  assert.match(r.inputs, /^2025-26, ordinary income of 6000 USD at 0\.6785 USD to A\$1 \(average for 2025-07-01 to 2026-06-30\)/);
  // The ATO's rental expenses: NZ$1,000 paid when deductible at 1.10.
  const rent = conversion({ 'fx-kind': 'deduction', 'fx-currency': 'nzd', 'fx-amount': '1000', 'fx-deductible': '2025-08-10',
    'fx-paid': '2025-08-10', 'fx-basis': 'specific', 'fx-rate': '1.10', 'fx-rate-date': '2025-08-10', 'fx-source': 'ATO example' });
  assert.equal(row(rent, 'Australian dollars'), '$909.09');
  assert.equal(row(rent, 'Rule'), 'Section 960-50(6) item 8(a)');
  // Income received before it is derived is translated on receipt.
  const early = conversion({ 'fx-received': '2026-01-10' });
  assert.equal(row(early, 'Translated on'), '2026-01-10');
  assert.match(conversion({ 'fx-kind': 'cgt_event', 'fx-event': '2026-01-15' }).note, /large capital asset/);
});
};


const f2 = (/** @type {number} */ n) => n.toFixed(2);
const COMMANDS = /** @type {Map<string, (call: any) => object>} */ (new Map([
  ['foreign-income-tax-offset', (call) => {
    const o = foreignTaxOffset(call);
    return { ...Object.fromEntries(Object.entries(o.steps).map(([k, v]) => [k, f2(v)])), offset_before_limit: f2(o.offsetBeforeLimit),
      offset_limit: f2(o.offsetLimit), offset: f2(o.offset), offset_above_limit: f2(o.offsetAboveLimit) };
  }],
  ['foreign-income-conversion', (call) => {
    const c = foreignIncomeConversion(call);
    return { ...Object.fromEntries(Object.entries(c.totals).map(([k, v]) => [k, f2(v)])),
      items: c.items.map((i) => ({ kind: i.kind, translated_on: i.translatedOn, item: i.item, basis: i.basis, aud: f2(i.aud) })),
      average: c.average, average_capital: c.averageCapital };
  }],
]));

test('the foreign income options agree with the australian-accounting commands on every differential case', () => {
  const { cases } = foreignIncomeFixture;
  for (const command of COMMANDS.keys()) {
    const mine = cases.filter((c) => c.command === command);
    assert.ok(mine.length > 150, command);
    assert.ok(mine.filter((c) => c.refused).length >= 10, command);
  }
  for (const { source, command, call, amounts, refused } of cases) {
    if (refused) {
      assert.throws(() => COMMANDS.get(command)(call), (error) => error.code === refused, source);
      continue;
    }
    // A case the command accepts must not be refused here.
    let got = /** @type {any} */ (null);
    assert.doesNotThrow(() => { got = COMMANDS.get(command)(call); }, source);
    // The commands keep the sign of an amount entered as -0, which is zero.
    assert.deepEqual(got, JSON.parse(JSON.stringify(amounts).replaceAll('"-0.00"', '"0.00"')), source);
  }
});
