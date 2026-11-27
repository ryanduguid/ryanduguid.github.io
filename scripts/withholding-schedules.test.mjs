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
