// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The take-home pay calculator's 'withholding under another schedule' option: the form's answers as
// the input of the australian-accounting command for that schedule, worked by withholding-schedules.mjs,
// and the rows and note it adds to the page's result.
import { withholdingSchedule } from './withholding-schedules.mjs';
import { pick } from './withholding-decimal.mjs';

/** Each option: its command, its name in the result and what its payment is. */
const SCHEDULES = /** @type {Record<string, {command: string, name: string, payment: string}>} */ ({
  daily: { command: 'daily-casual-withholding', name: 'Daily or casual pay', payment: 'the day’s earnings' },
  sch2: { command: 'horticulture-shearing-withholding', name: 'Schedule 2', payment: 'the earnings for the pay period' },
  sch3: { command: 'entertainer-withholding', name: 'Schedule 3', payment: 'the earnings for one performance' },
  sch4: { command: 'return-to-work-withholding', name: 'Schedule 4', payment: 'the return to work payment' },
  sch6: { command: 'annuity-withholding', name: 'Schedule 6', payment: 'the annuity payment' },
  sch9: { command: 'seniors-pensioners-withholding', name: 'Schedule 9', payment: 'the earnings for the pay period' },
  sch10: { command: 'voluntary-agreement-withholding', name: 'Schedule 10', payment: 'the payment under the voluntary agreement' },
  sch14: { command: 'upward-variation-withholding', name: 'Schedule 14', payment: 'the earnings for the pay period' },
  sch15: { command: 'working-holiday-maker-withholding', name: 'Schedule 15', payment: 'the payment for the pay period' },
  noabn: { command: 'no-abn-withholding', name: 'No ABN quoted', payment: 'the payment for the supply' },
});
const LABELS = /** @type {Record<string, string>} */ ({
  earnings_used: 'Earnings used, cents ignored', payment_used: 'Payment used', day_earnings: 'Earnings for the day’s performances',
  day_earnings_used: 'Day’s earnings used, cents ignored', weekly_earnings_used: 'Weekly earnings used (x)',
  weekly_withholding: 'Weekly amount (y = ax − b)', daily_withholding: 'Amount for the day before tax offsets',
  tax_offset_reduction: 'Tax offsets taken off', withholding_before_adjustments: 'Amount before tax offsets',
  additional_withholding: 'Additional amount for 53 or 27 pays', normal_withholding: 'Schedule 1 amount',
  additional_amount: 'Additional amount agreed in writing', earnings: 'Income in the payment',
  payment_excluding_gst: 'Payment excluding GST', schedule_9_withholding: 'Schedule 9 amount',
  study_loan_component: 'Study and training loan component', weekly_medicare_levy_adjustment: 'Weekly Medicare levy adjustment',
  medicare_levy_adjustment: 'Medicare levy adjustment',
});
const PAY_PERIOD = /** @type {Record<string, string>} */ ({ week: 'weekly', fortnight: 'fortnightly', month: 'monthly' });

/** @param {string} message @returns {never} */
function fail(message) {
  throw new Error(message);
}
/** The Schedule 1 scale Schedules 6 and 14 apply: 4 without a TFN, 3 for a foreign resident, 1 without
 * the tax-free threshold, and 2, 5 or 6 with it for no, a full or a half Medicare levy exemption.
 * @param {(name: string) => string} value @param {boolean} foreign */
function scale(value, foreign) {
  if (value('ws-tfn') === 'no') return { scale: 4, foreign_resident: foreign };
  if (foreign) return { scale: 3 };
  if (value('ws-threshold') === 'no') return { scale: 1 };
  return { scale: { none: 2, full: 5, half: 6 }[value('ws-exemption')] ?? 2 };
}
/** The yearly tax offsets claimed, when any. @param {(name: string) => string} value */
const offsets = (value) => (Number(value('ws-offsets')) > 0 ? { tax_offsets: value('ws-offsets') } : {});

/** The command's input for the chosen schedule. @param {string} key @param {(name: string) => string} value */
function scheduleInput(key, value) {
  const residency = value('residency');
  const holiday = residency === 'working-holiday';
  const foreign = residency !== 'resident';
  const period = PAY_PERIOD[value('period')];
  if (['sch6', 'sch9', 'sch14', 'sch15'].includes(key) && !period) fail(`${pick(SCHEDULES, key).name} works one pay: choose a month, fortnight or week as the pay period.`);
  if (key === 'sch15' && !holiday) fail('Schedule 15 is for a working holiday maker: choose that residency.');
  if (['sch6', 'sch9', 'sch14'].includes(key) && holiday) fail(`Schedule 15, not ${pick(SCHEDULES, key).name}, covers every payment to a working holiday maker.`);
  if (key === 'sch9' && foreign) fail('Schedule 9 is for a payee who is an Australian resident for tax purposes.');
  const base = { year: value('year'), scope_confirmed: true };
  const payment = value('ws-payment');
  const payee = { tfn_quoted: value('ws-tfn') === 'yes', foreign_resident: foreign && !holiday,
    tax_free_threshold_claimed: value('ws-threshold') === 'yes', working_holiday_maker: holiday, ...base };
  switch (key) {
    case 'daily': return { earnings: payment, ...payee, ...offsets(value) };
    case 'sch2': return { earnings: payment, ...payee, labour_mobility_scheme: false };
    case 'sch3': return { performances_per_week: Number(value('ws-week')), performances_per_day: Number(value('ws-day')),
      earnings: payment, ...payee, ...offsets(value) };
    case 'sch4': return { payment, tfn_quoted: payee.tfn_quoted, foreign_resident: payee.foreign_resident, working_holiday_maker: holiday, ...base };
    case 'sch6': return { payment, deductible_amount: value('ws-deductible'), instalments: Number(value('ws-instalments')),
      pay_period: period, ...scale(value, foreign), ...base, ...offsets(value) };
    case 'sch9': return { earnings: payment, pay_period: period, status: value('ws-status'), medicare_levy_exemption: value('ws-exemption'),
      ...base, ...(value('study-loan') === 'yes' ? { study_loan: true, ...(value('ws-pay-date') ? { pay_date: value('ws-pay-date') } : {}) } : {}) };
    case 'sch10': return { payment, gst_included: value('ws-gst'), agreement_in_force: true, abn_quoted: true,
      agreement_applies_instalment_rate: value('ws-cir-applies') === 'yes', ...base,
      ...(value('ws-cir').trim() ? { instalment_rate: value('ws-cir').trim() } : {}) };
    case 'sch14': return { earnings: payment, pay_period: period, ...scale(value, foreign), additional_amount: value('ws-additional'),
      ...base, ...offsets(value) };
    case 'sch15': return { payment, payments_before: value('ws-before'), employer_registered: value('ws-registered') === 'yes',
      tfn_quoted: value('ws-tfn') === 'yes', pay_period: period, ...base };
    default: return { payment, gst_included: value('ws-gst'), supply_total_excluding_gst: value('ws-supply'), ...base };
  }
}

/** The option's rows, input summary and note, or nothing when no other schedule is chosen. A refusal
 * becomes the note, so the take-home result still shows.
 * @param {(name: string) => string} value @param {(amount: number) => string} aud
 * @returns {{rows: string[][], inputs: string, note: string} | undefined} */
export function scheduleResult(value, aud) {
  const key = value('withholding-schedule');
  const chosen = pick(SCHEDULES, key);
  if (!chosen) return undefined;
  const inputs = `, withholding under ${chosen.name} on ${aud(Number(value('ws-payment')))} as ${chosen.payment}`;
  try {
    const r = withholdingSchedule(chosen.command, scheduleInput(key, value));
    const rows = Object.entries(r.amounts).map(([id, amount]) => [id === 'withholding' ? `${chosen.name}: amount to withhold`
      : pick(LABELS, id) ?? id, aud(Number(amount))]);
    const rates = Object.entries(r.rates).map(([k, v]) => `${k} ${v}`).join(', ');
    return { rows, inputs, note: `${chosen.name} (${chosen.command}): ${r.withholding_basis ?? rates}` };
  } catch (error) {
    return { rows: [], inputs, note: `${chosen.name} is not worked: ${error instanceof Error ? error.message : String(error)}` };
  }
}
