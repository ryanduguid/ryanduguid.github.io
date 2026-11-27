// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The individual tax result rows and notes that the pages' opening examples do not show, such as
// withholding each pay, dated super earnings, Method B bonuses, Division 293 excess, a proposed
// catch-up contribution, salary packaging and novated lease cases and distant arrears years.
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
  ['income-tax', readFileSync('_includes/calculators/income-tax.html', 'utf8')],
  ['study-loan', readFileSync('_includes/calculators/study-loan.html', 'utf8')],
  ['sole-trader', readFileSync('_includes/calculators/sole-trader.html', 'utf8')],
  ['salary-packaging', readFileSync('_includes/calculators/salary-packaging.html', 'utf8')],
  ['novated-lease', readFileSync('_includes/calculators/novated-lease.html', 'utf8')],
  ['lump-sum-arrears', readFileSync('_includes/calculators/lump-sum-arrears.html', 'utf8')],
  ['income-tests', readFileSync('_includes/calculators/income-tests.html', 'utf8')],
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

test('a 2021-22 income tax estimate with a study loan shows LMITO and the 8.5% repayment', () => {
  // Repayment income $117,000 sits in 2021-22's $112,346 to $119,094 band, repaid at 8.5%.
  const r = result('income-tax', { year: '2021-22', 'study-loan': 'yes', uncovered: '1', children: '1' });
  assert.equal(row(r, 'Low and middle income tax offset'), '$1,500.00');
  assert.equal(row(r, 'Study and training loan repayment'), '$9,945.00');
  assert.match(r.inputs, /a study or training loan with exempt foreign employment income \$0\.00, 1 day without private hospital cover, no spouse and 1 dependent child,/);
});

test('a later income tax estimate has no LMITO or loan row and counts several children', () => {
  const r = result('income-tax', { year: '2025-26', children: '2' });
  assert.equal(row(r, 'Low and middle income tax offset'), undefined);
  assert.equal(row(r, 'Study and training loan repayment'), undefined);
  assert.match(r.inputs, /no study or training loan, 365 days without private hospital cover, no spouse and 2 dependent children,/);
});

test('a take-home salary that includes super names it so', () => {
  // $80,000 including super at the 2025-26 rate of 12%: $80,000 / 1.12 salary and the rest super.
  const r = result('take-home-pay', { year: '2025-26', super: 'included', salary: '80000' });
  assert.equal(row(r, 'Salary for the year'), '$71,428.57');
  assert.equal(row(r, 'Estimated employer super guarantee'), '$8,571.43');
  assert.match(r.inputs, /salary \$80,000\.00 a year including super, /);
});

test('a 2025-26 study loan over the minimum is repaid on the marginal system', () => {
  // 15% of the $13,000 over $67,000.
  const r = result('study-loan', { year: '2025-26', taxable: '80000', fringe: '0', losses: '0', super: '0', foreign: '0' });
  assert.equal(row(r, 'Compulsory repayment'), '$1,950.00');
  assert.equal(r.note, '15% of repayment income over $67,000 up to $125,000, and 17% of any part above it');
});

test('a 2024-25 study loan takes one band’s rate on all of the repayment income', () => {
  // $86,380 falls in 2024-25's band from $84,108, repaid at 4.5% of the whole.
  const r = result('study-loan', { year: '2024-25' });
  assert.equal(row(r, 'Repayment income'), '$86,380.00');
  assert.equal(row(r, 'Compulsory repayment'), '$3,887.10');
  assert.equal(r.note, 'The 2024-25 rate for this repayment income, applied to all of it');
});

test('a sole trader who does not qualify gets no small business income tax offset', () => {
  const r = result('sole-trader', { offset: 'no' });
  assert.equal(row(r, 'Small business income tax offset'), '$0.00');
  assert.match(r.inputs, /, does not qualify for the small business income tax offset, /);
});

test('a hospital package over its $17,000 cap uses the meal entertainment allowance', () => {
  // $9,000 of Type 2 benefits grossed up by 1 / 0.53 is $16,981 and the $1,000 of Type 1 meals by 2.0802 is $2,080, so
  // the $2,061 over the cap is meal entertainment within the $5,000 allowance and no FBT is due.
  const r = result('salary-packaging', { employer: 'hospital', residency: 'foreign', 'type-two': '9000', meals: '1000' });
  assert.equal(row(r, 'Cap for a hospital or ambulance service'), '$17,000.00');
  assert.equal(row(r, 'Meal entertainment allowed above the cap, up to $5,000'), '$2,061.00');
  assert.equal(row(r, 'Grossed-up amount liable to FBT'), '$0.00');
  assert.equal(row(r, 'Room left under the cap, as Type 2 benefits'), undefined);
  assert.match(r.inputs, /^2026-27, foreign resident employed by a public or not-for-profit hospital or public ambulance service, /);
});

test('benefits of $2,000 or less are not reportable and leave room under the cap', () => {
  // $1,500 grossed up is $2,830, leaving $27,170 of the charity cap: $14,400.10 of Type 2 benefits at 53%.
  const r = result('salary-packaging', { 'type-two': '1500' });
  assert.equal(row(r, 'Reportable fringe benefits amount'), '$0.00');
  assert.equal(row(r, 'Room left under the cap, as Type 2 benefits'), '$14,400.10');
  assert.equal(r.note, 'Benefits of $2,000 or less are not reportable');
  assert.equal(result('salary-packaging', { 'type-two': '0' }).note, undefined);
});

test('a novated electric car with costs above its taxable value also shows the contribution method', () => {
  // The statutory formula value is 20% of $60,000; an after-tax contribution of it covers ten elevenths, $10,909.09, of the
  // $12,000 costs, leaving $1,090.91 from pre-tax salary.
  const r = result('novated-lease', { 'gst-costs': '0', 'other-costs': '12000' });
  assert.equal(row(r, 'Statutory formula value for 365 days'), '$12,000.00');
  assert.equal(row(r, 'Were it not exempt: after-tax contribution'), '$12,000.00');
  assert.equal(row(r, 'Were it not exempt: from pre-tax salary'), '$1,090.91');
  assert.equal(r.rows[r.principal][0], 'Exempt: saving');
});

test('a car that is not exempt is worked by the employee contribution method alone', () => {
  // Held over 4 years, the base value falls by a third: 20% of $40,000 is $8,000.
  const r = result('novated-lease', { kind: 'other', residency: 'foreign', 'gst-costs': '0', 'other-costs': '12000',
    'other-supply': 'yes', reduced: 'yes', 'study-loan': 'yes', cover: 'no' });
  assert.equal(row(r, 'Electric car exemption'), 'does not apply: it is not a battery electric or hydrogen fuel cell car');
  assert.equal(row(r, 'Employee contribution method: after-tax contribution'), '$8,000.00');
  assert.equal(row(r, 'Employee contribution method: from pre-tax salary'), '$4,727.27');
  assert.equal(r.rows[r.principal][0], 'Employee contribution method: saving');
  assert.equal(r.note, undefined);
  assert.match(r.inputs, /^2026-27, foreign resident, salary \$100,000\.00, petrol, diesel or hybrid car first held .*, luxury car tax payable at another supply or importation, held over 4 years, .*, with study loan, without private hospital cover$/);
});

test('a plug-in hybrid names whether a commitment from before 1 April 2025 applies', () => {
  const committed = result('novated-lease', { kind: 'phev', commitment: 'yes', year: '2024-25', 'first-used': '2024-07-01',
    'sale-year': '2024-25', days: '273' });
  assert.equal(row(committed, 'Electric car exemption'), 'applies');
  assert.match(committed.inputs, /plug-in hybrid first held and used on 1 July 2024, with a commitment from before 1 April 2025, /);
  const later = result('novated-lease', { kind: 'phev', commitment: 'no', 'gst-costs': '0', 'other-costs': '12000' });
  assert.equal(row(later, 'Electric car exemption'),
    'does not apply: a plug-in hybrid is exempt from 1 April 2025 only under a commitment made and used before then');
  assert.match(later.inputs, /, without a commitment from before 1 April 2025, /);
});

test('Method A without a study loan has no loan note and names the tax alone', () => {
  const r = result('bonus-withholding', { method: 'A', 'study-loan': 'no' });
  assert.equal(row(r, 'Tax the payment adds to a year of this pay'), '$288.00');
  assert.equal(r.note, 'The last row is the payment’s effect on the year’s assessment, were every pay this pay; the withholding '
    + 'schedules do not aim to match it');
});

test('Division 293 shows carried-forward cap, the room under the threshold and no note when nothing is due', () => {
  const carried = result('division-293', { unused: '20000', 'balance-under': 'yes', concessional: '45000' });
  assert.equal(row(carried, 'Unused cap carried forward that raises it'), '$12,500.00');
  assert.equal(row(carried, 'Division 293 tax at 15%'), '$5,250.00');
  assert.match(carried.inputs, /unused cap carried forward \$20,000\.00, total super balance under \$500,000$/);
  const under = result('division-293', { taxable: '100000' });
  assert.equal(row(under, 'Room left under the $250,000 threshold'), '$135,000.00');
  assert.equal(under.note, undefined);
  assert.match(result('division-293', { unused: '20000' }).inputs, /, total super balance \$500,000 or more$/);
});

const recentOnly = { 'earlier-1-year': '', 'earlier-1-arrears': '', 'earlier-2-year': '', 'earlier-2-arrears': '',
  'earlier-3-year': '', 'earlier-3-arrears': '', 'earlier-4-year': '', 'earlier-4-arrears': '' };

test('one distant accrual year takes the average of the recent years’ rates', () => {
  // 2023-24's $3,000 on $30,000 adds tax at 19% and 2022-23's $2,500 on $17,000 at 9.9% (each rate to 3 decimal places):
  // 2021-22's $1,400 at their 14.45% mean is $202.30 (s 159ZRD).
  const r = result('lump-sum-arrears', { ...recentOnly, taxable: '50000', 'earlier-1-year': '2021-22', 'earlier-1-arrears': '1400' });
  assert.equal(row(r, 'Notional tax for the distant years'), '$202.30');
  assert.equal(r.note, 'The distant year 2021-22 takes the average rate on recent arrears, 14.45%: 19% for 2023-24 and 9.9% for 2022-23');
});

test('arrears in the 2 recent years alone are taxed at their own years’ rates', () => {
  // 2025-26: $500 at 16% and $5,000 at 30% from $44,500 to $50,000 is $1,580.
  const r = result('lump-sum-arrears', { ...recentOnly, taxable: '50000' });
  assert.equal(row(r, 'Tax on arrears in 2025-26'), '$1,580.00');
  assert.equal(row(r, 'Notional tax on arrears'), '$817.00');
  assert.equal(r.note, 'The notional tax is what the arrears would have added to the tax of the years they accrued in');
});

test('no offset when the notional tax is not less than the tax on arrears', () => {
  // Both recent years at 45%: $1,350 and $1,125 against $1,580.
  const r = result('lump-sum-arrears', { ...recentOnly, taxable: '50000', 'latest-taxable': '200000', 'before-taxable': '200000' });
  assert.equal(row(r, 'Notional tax on arrears'), '$2,475.00');
  assert.equal(row(r, 'Lump sum payment in arrears tax offset'), '$0.00');
  assert.match(r.note, /\. Nil: the notional tax is not less than the tax on arrears$/);
});

test('a 2021-22 sole trader without cover, with a loan and GST shows each of those rows', () => {
  // GST is a tenth of the $80,000 business income.
  const r = result('sole-trader', { year: '2021-22', cover: 'no', 'study-loan': 'yes', gst: 'yes', credits: '500', super: '1000',
    wages: '0', income: '80000' });
  assert.equal(row(r, 'Low and middle income tax offset'), '$1,500.00');
  assert.equal(row(r, 'Medicare levy surcharge'), '$0.00');
  assert.ok(row(r, 'Study and training loan repayment'));
  assert.equal(row(r, 'GST on the business income'), '$8,000.00');
  assert.equal(row(r, 'Less GST credits'), '$500.00');
  assert.ok(row(r, 'Share of each invoice, GST included, to set aside'));
  assert.equal(row(r, 'Less the same on the wages alone'), undefined);
  assert.match(r.inputs, /, personal super contributions \$1,000\.00, qualifies .*, with a study or training loan, no private hospital cover, registered for GST with credits of \$500\.00, /);
});

test('a catch-up year with a balance at or over $500,000 carries no unused cap forward', () => {
  const r = result('concessional-catch-up', { balance: '600000', 'balance-2023-24': '400000' });
  assert.equal(row(r, 'Concessional cap available'), '$30,000.00');
  assert.equal(row(r, 'Excess concessional contributions'), '$67,500.00');
  assert.equal(r.note, 'With a total super balance of $500,000 or more on 30 June before the year, no unused cap increases this '
    + 'year’s; the unused amounts still lapse after 5 years');
});

test('income tests without exempt foreign employment income have no surcharge note', () => {
  assert.equal(result('income-tests', { 'exempt-foreign': '0' }).note, undefined);
});
