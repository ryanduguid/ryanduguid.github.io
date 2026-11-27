// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The take-home pay calculator's other withholding schedules: the port against australian-accounting's
// commands, the published examples of the withholding schedules instruments and the page's form.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WITHHOLDING_COMMANDS, withholdingSchedule } from '../assets/withholding-schedules.mjs';
import { scheduleResult } from '../assets/take-home-schedules.mjs';
import { individualResult } from '../assets/individual-tax-results.mjs';

const page = readFileSync('_includes/calculators/take-home-pay.html', 'utf8');
const aud = (/** @type {number} */ value) => value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

test('the withholding schedules agree with the australian-accounting commands on every differential case', () => {
  const { engine, cases } = JSON.parse(readFileSync('scripts/withholding-schedules-engine-differential.json', 'utf8'));
  assert.match(engine, /australian-accounting main at 0b8ca5ab/);
  assert.ok(cases.length > 3000);
  assert.ok(page.includes(`on ${cases.length.toLocaleString('en-AU')} cases`));
  for (const command of WITHHOLDING_COMMANDS) {
    assert.ok(cases.some((c) => c.command === command && c.refused), `${command} refused`);
    assert.ok(cases.filter((c) => c.command === command && c.amounts).length >= 20, `${command} worked`);
  }
  for (const { source, command, call, amounts, rates, withholding_basis: basis, refused } of cases) {
    if (refused) {
      assert.throws(() => withholdingSchedule(command, call), (error) => error.code === refused, source);
      continue;
    }
    assert.deepEqual(withholdingSchedule(command, call), { amounts, rates, ...(basis ? { withholding_basis: basis } : {}) }, source);
  }
});

const year = (/** @type {string} */ y) => ({ year: y, scope_confirmed: true });
test('the schedules give the examples published in the withholding schedules instruments', () => {
  // Schedule 2, $231.50 for the pay period: $30 (13%), $108 without a TFN, $69 foreign resident, $103 (45%).
  for (const [tfn, foreign, expected] of [[true, false, '30.00'], [false, false, '108.00'], [true, true, '69.00'], [false, true, '103.00']]) {
    const r = withholdingSchedule('horticulture-shearing-withholding', { earnings: '231.50', tfn_quoted: tfn, foreign_resident: foreign,
      tax_free_threshold_claimed: true, working_holiday_maker: false, labour_mobility_scheme: false, ...year('2026-27') });
    assert.equal(r.amounts.withholding, expected);
  }
  // Schedule 4: 32% of $18,000 is $5,760.
  assert.equal(withholdingSchedule('return-to-work-withholding', { payment: '18000', tfn_quoted: true, foreign_resident: false,
    working_holiday_maker: false, ...year('2026-27') }).amounts.withholding, '5760.00');
  // The daily and casual table: $193.62 with $500 of offsets is $25 less $2 from 1 July 2026, $26 less $2 before.
  for (const [y, before] of [['2026-27', '25.00'], ['2025-26', '26.00']]) {
    const r = withholdingSchedule('daily-casual-withholding', { earnings: '193.62', tfn_quoted: true, foreign_resident: false,
      tax_free_threshold_claimed: true, working_holiday_maker: false, tax_offsets: '500', ...year(y) });
    assert.deepEqual([r.amounts.daily_withholding, r.amounts.tax_offset_reduction], [before, '2.00']);
  }
  // Schedule 1, 2026: $1,299.30 a fortnight on scale 5 is $86 less 3.8% of $1,645, or $63.
  const sch14 = withholdingSchedule('upward-variation-withholding', { earnings: '1299.30', pay_period: 'fortnightly', scale: 5,
    additional_amount: '20', tax_offsets: '1645', ...year('2026-27') });
  assert.deepEqual([sch14.amounts.withholding_before_adjustments, sch14.amounts.tax_offset_reduction, sch14.amounts.normal_withholding,
    sch14.amounts.withholding], ['86.00', '63.00', '23.00', '43.00']);
  // Schedule 10: a 25% instalment rate on $11,000 including $1,000 GST.
  const sch10 = withholdingSchedule('voluntary-agreement-withholding', { payment: '11000', gst_included: '1000', agreement_in_force: true,
    abn_quoted: true, agreement_applies_instalment_rate: false, instalment_rate: '25', ...year('2026-27') });
  assert.deepEqual([sch10.amounts.withholding, sch10.rates.rate], ['2500.00', '0.25']);
  // No ABN: $75 or less for the supply excluding GST is nil; above it, 47% with cents ignored.
  const noAbn = (/** @type {string} */ total) => withholdingSchedule('no-abn-withholding', { payment: '82.50', gst_included: '7.50',
    supply_total_excluding_gst: total, ...year('2026-27') }).amounts.withholding;
  assert.deepEqual([noAbn('75'), noAbn('75.01')], ['0.00', '38.00']);
});

test('the schedules round in the 40-digit context australian-accounting uses', () => {
  // $17 a week over 6 performances, 3 on the day: 17 ÷ 6 is 2.8333… to 40 digits, so 3 times it is 8.4999…, not 8.5.
  const r = withholdingSchedule('entertainer-withholding', { performances_per_week: 6, performances_per_day: 3, earnings: '22.51',
    tfn_quoted: true, foreign_resident: false, tax_free_threshold_claimed: false, working_holiday_maker: false, ...year('2024-25') });
  assert.deepEqual([r.amounts.weekly_withholding, r.amounts.daily_withholding], ['17.00', '8.00']);
});

/** The form's defaults, then `fields`. @param {Record<string, string>} fields */
function form(fields) {
  /** @type {Map<string, string>} */
  const all = new Map();
  for (const m of page.matchAll(/<input[^>]*name="([^"]+)"[^>]*>/g)) {
    const tag = m[0];
    const v = /value="([^"]*)"/.exec(tag)?.[1] ?? '';
    if (!/type="radio"/.test(tag) || / checked/.test(tag)) all.set(m[1], v);
  }
  for (const m of page.matchAll(/<textarea[^>]*name="([^"]+)"/g)) all.set(m[1], '');
  for (const [name, v] of Object.entries(fields)) all.set(name, v);
  return (/** @type {string} */ name) => {
    assert.ok(all.has(name), `the form has no ${name}`);
    return /** @type {string} */ (all.get(name));
  };
}

test('the take-home page offers each schedule and works it beside the take-home result', () => {
  const keys = [...page.matchAll(/name="withholding-schedule" value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['none', 'daily', 'sch2', 'sch3', 'sch4', 'sch6', 'sch9', 'sch10', 'sch14', 'sch15', 'noabn']);
  assert.equal(scheduleResult(form({}), aud), undefined);
  const base = { year: '2026-27', period: 'fortnight', 'ws-payment': '1299.30' };
  const sch14 = individualResult('take-home-pay', form({ ...base, 'withholding-schedule': 'sch14', 'ws-additional': '20',
    'ws-offsets': '1645', 'ws-exemption': 'full' }), aud);
  assert.deepEqual(sch14.rows.slice(-3), [['Schedule 1 amount', '$23.00'], ['Additional amount agreed in writing', '$20.00'],
    ['Schedule 14: amount to withhold', '$43.00']]);
  assert.match(sch14.inputs, /withholding under Schedule 14 on \$1,299\.30 as the earnings for the pay period$/);
  const whm = individualResult('take-home-pay', form({ ...base, residency: 'working-holiday', 'withholding-schedule': 'sch15',
    'ws-before': '50000' }), aud);
  assert.deepEqual(whm.rows.at(-1), ['Schedule 15: amount to withhold', '$390.00']);
  assert.match(whm.note, /column 3, rate 0\.30/);
  const refused = individualResult('take-home-pay', form({ ...base, 'withholding-schedule': 'sch15' }), aud);
  assert.match(refused.note, /Schedule 15 is not worked: Schedule 15 is for a working holiday maker/);
  const early = scheduleResult(form({ ...base, year: '2023-24', 'withholding-schedule': 'sch4' }), aud);
  assert.match(early?.note ?? '', /2023-24 is not covered: these schedules are worked for 2024-25, 2025-26, 2026-27/);
  const yearly = scheduleResult(form({ ...base, period: 'year', 'withholding-schedule': 'sch9' }), aud);
  assert.match(yearly?.note ?? '', /choose a month, fortnight or week/);
  for (const key of keys.slice(1)) {
    const r = scheduleResult(form({ ...base, residency: key === 'sch15' ? 'working-holiday' : 'resident', 'withholding-schedule': key,
      'ws-supply': '2000' }), aud);
    assert.ok(r && r.rows.length, `${key}: ${r?.note}`);
  }
});

test('the take-home pay WebMCP tool works another schedule beside the year', async () => {
  const { individualTaxTools } = await import('../assets/webmcp-tools.mjs');
  const { engines } = await import('../assets/individual-tax-results.mjs');
  const tool = individualTaxTools(engines)['take-home-pay'];
  const input = { incomeYear: '2026-27', residency: 'working-holiday', salary: '1299.30', payPeriod: 'fortnight' };
  const r = await tool.execute({ ...input, otherSchedule: { command: 'working-holiday-maker-withholding', payment: '1299.30',
    payments_before: '50000', employer_registered: true, tfn_quoted: true, pay_period: 'fortnightly' } });
  assert.deepEqual(r.otherSchedule, { command: 'working-holiday-maker-withholding', amounts: { payment_used: '1299.00', withholding: '390.00' },
    rates: { rate: '0.30' }, withholding_basis: 'registered employer, TFN quoted: column 3, rate 0.30 on the payment with cents ignored' });
  assert.equal((await tool.execute(input)).otherSchedule, undefined);
  await assert.rejects(tool.execute({ ...input, otherSchedule: { command: 'no-abn-withholding', abn: true } }), /abn is not an input of this tool/);
  await assert.rejects(tool.execute({ ...input, otherSchedule: { command: 'no-abn-withholding', payment: '100' } }), /gst_included is required/);
});

const refusal = (/** @type {string} */ command, /** @type {object} */ call) => {
  try {
    withholdingSchedule(command, call);
  } catch (error) {
    return /** @type {{code: string}} */ (error).code;
  }
  return 'worked';
};

test('the schedules refuse each input the australian-accounting 1.4.0 release refuses, with its code', () => {
  const hort = { earnings: '231.50', tfn_quoted: true, foreign_resident: false, tax_free_threshold_claimed: true, working_holiday_maker: false,
    labour_mobility_scheme: false, ...year('2026-27') };
  const up = { earnings: '1299.30', pay_period: 'fortnightly', scale: 2, additional_amount: '20', ...year('2026-27') };
  const seniors = { earnings: '1000.00', pay_period: 'fortnightly', status: 'single', medicare_levy_exemption: 'none', study_loan: true,
    ...year('2026-27') };
  // Each code is the one the release binary's --refusal-json gives for the same call.
  for (const [command, call, code] of /** @type {[string, object, string][]} */ ([
    ['horticulture-shearing-withholding', { ...hort, earnings: '1'.repeat(8193) }, 'input.decimal_too_long'],
    ['horticulture-shearing-withholding', { ...hort, earnings: 'Infinity' }, 'input.amount_invalid'],
    ['horticulture-shearing-withholding', { ...hort, earnings: 'abc' }, 'input.decimal_unreadable'],
    ['horticulture-shearing-withholding', { ...hort, year: 2026 }, 'period.unsupported'],
    ['seniors-pensioners-withholding', { ...seniors, pay_date: 20260901 }, 'input.date_invalid'],
    ['seniors-pensioners-withholding', { ...seniors, pay_date: '2026-02-30' }, 'input.date_invalid'],
    ['upward-variation-withholding', { ...up, scale: 4 }, 'input.missing_field'],
    ['upward-variation-withholding', { ...up, foreign_resident: false }, 'payg.foreign_resident_not_scale_4'],
    ['upward-variation-withholding', { ...up, scale: 1, medicare_adjustment_children: 1 }, 'payg.medicare_adjustment_not_allowed'],
    ['upward-variation-withholding', { ...up, medicare_adjustment_children: -1 }, 'input.children_invalid'],
    ['upward-variation-withholding', { ...up, medicare_adjustment_children: '2' }, 'input.children_invalid'],
    ['upward-variation-withholding', { ...up, pay_period: 'monthly', extra_pay_withholding: true }, 'payg.extra_pays_not_weekly_or_fortnightly'],
    // The crate's API refuses a command it does not have (api.rs).
    ['payroll-tax', hort, 'command.unknown'],
  ])) assert.equal(refusal(command, call), code, `${command} ${JSON.stringify(call).slice(0, 80)}`);
  assert.throws(() => withholdingSchedule('horticulture-shearing-withholding', { ...hort, year: 2026 }), /That year is not covered/);
  // The same release's amounts for the calls just inside those checks.
  assert.deepEqual(withholdingSchedule('horticulture-shearing-withholding', { ...hort, earnings: ' 231.50 ' }).amounts,
    { earnings_used: '231.00', withholding: '30.00' });
  assert.deepEqual(withholdingSchedule('upward-variation-withholding', { ...up, scale: 4, foreign_resident: true }).amounts,
    { earnings_used: '1299.00', normal_withholding: '584.00', additional_amount: '20.00', withholding: '604.00' });
  assert.equal(withholdingSchedule('upward-variation-withholding', { ...up, pay_period: 'weekly', extra_pay_withholding: true })
    .amounts.additional_withholding, '3.00');
  assert.equal(withholdingSchedule('seniors-pensioners-withholding', { ...seniors, pay_date: '2026-09-01' }).amounts.study_loan_component, '0.00');
});

test('a Schedule 10 instalment rate prints as Python prints the percentage divided by 100', () => {
  const rate = (/** @type {string} */ percent) => withholdingSchedule('voluntary-agreement-withholding', { payment: '11000', gst_included: '1000',
    agreement_in_force: true, abn_quoted: true, agreement_applies_instalment_rate: true, instalment_rate: percent, ...year('2026-27') }).rates.rate;
  // The release binary gives these texts; Python's str(Decimal) uses exponent form below 1E-6.
  assert.deepEqual(['0.0000001', '0.00000012', '0', '25'].map(rate), ['1E-9', '1.2E-9', '0', '0.25']);
});

test('the decimal helpers follow Python decimal at the edges the schedules never reach', async () => {
  const { q, mul, int, cents, fixed, pyDecimal, dec } = await import('../assets/withholding-decimal.mjs');
  // Decimal(3) / Decimal(-6) is -0.5; 0 / 0 raises InvalidOperation, here a RangeError.
  assert.deepEqual(q(3n, -6n), { p: -1n, q: 2n });
  assert.throws(() => q(0n, 0n), RangeError);
  // Context(prec=40, rounding=ROUND_HALF_EVEN).multiply(n, 1) for a 41-digit n: a half rounds to the even digit.
  const big = (/** @type {bigint} */ n) => mul(int(n), int(1));
  assert.deepEqual(big(12345678901234567890123456789012345678905n), int(12345678901234567890123456789012345678900n));
  assert.deepEqual(big(12345678901234567890123456789012345678915n), int(12345678901234567890123456789012345678920n));
  // quantize(Decimal('0.01'), ROUND_HALF_UP) of -1.005 is -1.01; ROUND_DOWN of -12.345 is -12.34.
  assert.equal(cents(dec('-1.005')), '-1.01');
  assert.equal(fixed(dec('-12.345'), 2), '-12.34');
  // str(Decimal((sign, digits, exponent))).
  assert.deepEqual([pyDecimal(-15n, -1), pyDecimal(1n, 2), pyDecimal(-123n, 3), pyDecimal(12n, -10), pyDecimal(-7n, -8)],
    ['-1.5', '1E+2', '-1.23E+5', '1.2E-9', '-7E-8']);
});

test('the take-home form picks the Schedule 1 scale and the optional inputs each schedule takes', () => {
  const base = { year: '2026-27', period: 'fortnight', 'ws-payment': '1299.30' };
  const note = (/** @type {Record<string, string>} */ fields) => scheduleResult(form({ ...base, ...fields }), aud)?.note ?? '';
  // Schedule 1's scales: 4 without a TFN, 3 for a foreign resident, 1 without the tax-free threshold, 6 with a half exemption.
  // Scale 4 is 47% for a resident and 45% for a foreign resident.
  assert.match(note({ 'withholding-schedule': 'sch14', 'ws-tfn': 'no' }), /scale 4, tax_rate 0\.47$/);
  assert.match(note({ 'withholding-schedule': 'sch14', 'ws-tfn': 'no', residency: 'foreign' }), /scale 4, tax_rate 0\.45$/);
  assert.match(note({ 'withholding-schedule': 'sch14', residency: 'foreign' }), /\): scale 3,/);
  assert.match(note({ 'withholding-schedule': 'sch14', 'ws-threshold': 'no' }), /\): scale 1,/);
  assert.match(note({ 'withholding-schedule': 'sch6', 'ws-exemption': 'half' }), /\): scale 6,/);
  const noTfn = scheduleResult(form({ ...base, 'withholding-schedule': 'sch14', 'ws-tfn': 'no', residency: 'foreign' }), aud);
  assert.deepEqual(noTfn?.rows.at(-1), ['Schedule 14: amount to withhold', '$634.00']);
  assert.match(note({ 'withholding-schedule': 'sch6', residency: 'working-holiday' }),
    /Schedule 15, not Schedule 6, covers every payment to a working holiday maker/);
  assert.match(note({ 'withholding-schedule': 'sch9', residency: 'foreign' }), /Schedule 9 is for a payee who is an Australian resident/);
  // Schedule 9 with a study loan, with and without the pay date, gives the command's own rows.
  // 2025-26 needs the date, as its Schedule 8 coefficients start on 24 September 2025.
  for (const [y, date] of [['2026-27', ''], ['2025-26', '2025-10-01']]) {
    const fields = { year: y, 'ws-payment': '3000', 'withholding-schedule': 'sch9', 'study-loan': 'yes', 'ws-pay-date': date };
    const r = withholdingSchedule('seniors-pensioners-withholding', { earnings: '3000', pay_period: 'fortnightly', status: 'single',
      medicare_levy_exemption: 'none', ...year(y), study_loan: true, ...(date ? { pay_date: date } : {}) });
    assert.notEqual(r.amounts.study_loan_component, '0.00', y);
    assert.deepEqual(scheduleResult(form({ ...base, ...fields }), aud)?.rows.at(-2), ['Study and training loan component',
      aud(Number(r.amounts.study_loan_component))], date);
  }
  // Schedule 10: the published 25% instalment rate on $11,000 including $1,000 GST, typed with spaces.
  const sch10 = scheduleResult(form({ ...base, 'ws-payment': '11000', 'ws-gst': '1000', 'withholding-schedule': 'sch10', 'ws-cir-applies': 'yes',
    'ws-cir': ' 25 ' }), aud);
  assert.deepEqual([sch10?.rows.at(-1), sch10?.note], [['Schedule 10: amount to withhold', '$2,500.00'],
    'Schedule 10 (voluntary-agreement-withholding): rate 0.25']);
});
