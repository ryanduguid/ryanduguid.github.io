// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The individual tax result rows and notes that the pages' opening examples do not show: withholding
// each pay, dated super earnings, Method B bonuses, Division 293 excess and a proposed catch-up
// contribution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { individualResult } from '../assets/individual-tax-results.mjs';
import { aud, formReader, openingFields } from './form-fields.mjs';

const FORMS = new Map([
  ['take-home-pay', readFileSync('_includes/calculators/take-home-pay.html', 'utf8')],
  ['bonus-withholding', readFileSync('_includes/calculators/bonus-withholding.html', 'utf8')],
  ['division-293', readFileSync('_includes/calculators/division-293.html', 'utf8')],
  ['concessional-catch-up', readFileSync('_includes/calculators/concessional-catch-up.html', 'utf8')],
]);
const result = (page, changes) => individualResult(page, formReader(FORMS.get(page), changes), aud);
const row = (r, label) => r.rows.find(([name]) => name === label)?.[1];
const money = (text) => Number(text.replace(/[$,]/g, ''));

test('a fortnightly take-home pay shows the PAYG withheld each pay and the year’s difference', () => {
  const r = result('take-home-pay', { year: '2025-26', period: 'fortnight', salary: '3000', 'study-loan': 'yes' });
  const each = money(row(r, 'PAYG withheld each fortnight, with the study loan component'));
  assert.equal(money(row(r, 'Pay after withholding each fortnight')), 3000 - each);
  assert.equal(money(row(r, 'PAYG withheld over the year')), each * 26);
  assert.ok(r.rows.at(-1)[0] === 'Refund estimate' || r.rows.at(-1)[0] === 'Amount owing estimate');
  assert.match(r.note, /PAYG withheld is what the 2025-26 Schedule 1 and Schedule 8 take from each pay/);
  assert.match(r.note, /Pays before 24 September 2025 had \$106\.00 withheld for the study loan each fortnight under the earlier Schedule 8, not \$64\.00/);
  assert.doesNotMatch(r.note, /spread evenly, not the amounts an employer withholds/);
});

test('without a study loan the withholding rows and note name only Schedule 1', () => {
  const r = result('take-home-pay', { year: '2025-26', period: 'week', salary: '1500', 'study-loan': 'no' });
  assert.ok(row(r, 'PAYG withheld each week'));
  assert.match(r.note, /the 2025-26 Schedule 1 take from each pay/);
  assert.doesNotMatch(r.note, /Schedule 8|24 September 2025/);
});

test('a salary over the cap notes the excess concessional contributions and Division 293', () => {
  const r = result('take-home-pay', { year: '2025-26', period: 'fortnight', salary: '9000', super: 'plus', sacrifice: '1000' });
  assert.match(r.note, /Concessional contributions of \$54,080\.00 exceed the year’s cap by \$24,080\.00/);
  assert.match(r.note, /Division 293 tax applies to \$12,080\.00 of taxable contributions \(section 293-20\), not worked here/);
});

test('dated payments set the super guarantee from each payday’s earnings', () => {
  const r = result('take-home-pay', { year: '2026-27', period: 'year', salary: '10000', 'dated-pay': '2026-07-15 5000 5000\n\n2026-07-29 5000 5000\n' });
  assert.equal(row(r, 'Employer super guarantee from dated earnings'), '$1,200.00');
  assert.equal(row(r, 'Estimated employer super guarantee'), undefined);
  assert.match(r.note, /^Super uses the supplied earnings by payday; tax and PAYG estimates use the salary and sacrifice inputs/);
});

test('dated payments before 2026-27 are worked by quarter', () => {
  const r = result('take-home-pay', { year: '2025-26', period: 'year', salary: '10000', 'dated-pay': '2025-07-15 5000 5000\r\n2025-10-15 5000 5000' });
  assert.match(r.note, /^Super uses the supplied earnings by quarter/);
});

test('a dated payment line without its three values is refused', () => {
  for (const line of ['2026-07-15 5000', '2026-07-15 5000 5000 extra']) {
    assert.throws(() => result('take-home-pay', { year: '2026-27', 'dated-pay': line }),
      { message: 'Enter one payday, gross salary and earnings for super per line.' }, line);
  }
});

test('Method B works a back payment by B(i) and another payment by B(ii), adding both to the pay’s withholding', () => {
  const r = result('bonus-withholding', { method: 'B', 'study-loan': 'yes', period: 'week', earnings: '1400', 'back-pays': '3',
    'back-earnings': '2000', 'back-each': '100', 'back-withheld': '300', additional: '5000', 'year-to-date': '20000',
    'pays-to-date': '10', 'earlier-additional': '0', 'earlier-withheld': '0' });
  const total = money(row(r, 'Withheld from this pay’s earnings')) + money(row(r, 'Less what was withheld, times 3 pays (B(i) steps 4 and 5)'))
    + money(row(r, 'Withheld from the payment, the lesser (B(ii) step 10)'));
  assert.equal(money(row(r, 'Total withheld this pay')), total);
  assert.equal(r.principal, r.rows.length - 1);
  assert.equal(row(r, '47% of the payment, the limit (B(ii) step 9)'), '$2,350.00');
  assert.match(r.inputs, /Method B, B\(i\): back payment \$100\.00 for each of 3 earlier pays .*; B\(ii\): additional payment \$5,000\.00/);
  assert.match(r.note, /^Each amount withheld includes the Schedule 8 study loan component: .* on this pay’s earnings, .* for each earlier pay and .* by B\(ii\)$/);
});

test('Method B with only a back payment and no loan has no B(ii) rows and no note', () => {
  const r = result('bonus-withholding', { method: 'B', 'study-loan': 'no', 'back-pays': '2', 'back-earnings': '1500',
    'back-each': '200', 'back-withheld': '250', additional: '0' });
  assert.equal(r.rows.length, 4);
  assert.ok(!r.rows.some(([label]) => label.includes('B(ii)')));
  assert.equal(r.note, undefined);
  assert.doesNotMatch(r.inputs, /B\(ii\)/);
});

test('Method B with only another payment has no B(i) rows', () => {
  const r = result('bonus-withholding', { method: 'B', 'study-loan': 'yes', 'back-pays': '0', additional: '5000',
    'year-to-date': '20000', 'pays-to-date': '10' });
  assert.ok(!r.rows.some(([label]) => label.includes('B(i) ')));
  assert.match(r.note, /on this pay’s earnings and .* by B\(ii\)$/);
});

test('Division 293 notes an excess, an unused cap that cannot carry forward and the separate notice', () => {
  const r = result('division-293', { taxable: '300000', concessional: '40000', unused: '20000', 'balance-under': 'no' });
  assert.equal(row(r, 'Division 293 tax at 15%'), '$4,875.00');
  assert.equal(r.note, 'The $7,500.00 excess is not taxed here: it is in your assessable income instead (section 291-15), so the '
    + 'taxable income entered should include it. Unused cap does not carry forward with a total super balance of $500,000 or '
    + 'more just before the year. The ATO assesses it on a separate notice, payable 21 days after it is given (section 293-65)');
});

test('a proposed catch-up contribution shows the contributions and excess with it', () => {
  const r = result('concessional-catch-up', { proposed: '5000' });
  assert.equal(row(r, 'Contributions with the proposed one'), aud(Number(openingFields(FORMS.get('concessional-catch-up')).get('concessional')) + 5000));
  assert.equal(row(r, 'Excess with the proposed contribution'), '$5,000.00');
  assert.match(r.inputs, /, proposed \$5,000\.00, earlier years/);
});
