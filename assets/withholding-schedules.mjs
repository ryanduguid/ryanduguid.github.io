// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// PAYG withholding beside Schedule 1, ported from australian-accounting's australian-tax-calculators
// worksheets (engine/withholding_schedules.rs, engine/payment_withholding.rs and engine.rs) with their
// inputs and refusal codes: Schedule 2 (horticulture and shearing), 3 (entertainers), 4 (return to
// work payments), 6 (annuities), 9 (seniors and pensioners), 10 (voluntary agreements), 14 (an agreed
// additional amount) and 15 (working holiday makers), the tax table for daily and casual workers, and
// withholding where no ABN is quoted (TAA 1953 Sch 1 s 12-190). Each command takes the JSON input
// the crate's command does and returns its amounts and rates as strings.
import {
  add, arg, cmp, count, date, dec, div, down, flag, halfUp, int, money, mul, pick, pyDecimal, refuse, scope, sub, cents,
} from './withholding-decimal.mjs';
import { SCHEDULE_1, SCHEDULE_8, SCHEDULE_8_FROM, YEARS, choices, forPeriod, formula, payPeriod, schedule1, scheduleScale,
  weeklyEarnings } from './withholding-schedule-1.mjs';
import { SCHEDULE_3, SCHEDULE_9 } from './withholding-tables.mjs';

/** @typedef {import('./withholding-decimal.mjs').Q} Q */
/** @typedef {import('./withholding-decimal.mjs').Arg} Arg */
/** @typedef {import('./withholding-schedule-1.mjs').Step} Step */
/** @typedef {{amounts: Record<string, string>, rates: Record<string, string>, withholding_basis?: string}} Result */

/** @param {Step[]} steps @param {[string, string][]} rates @param {string} [basis] @returns {Result} */
function result(steps, rates, basis) {
  const out = { amounts: Object.fromEntries(steps.map((s) => [s.id, cents(s.value)])), rates: Object.fromEntries(rates) };
  return basis === undefined ? out : { ...out, withholding_basis: basis };
}
/** No TFN: 47%, or 45% for a foreign resident, of the amount with cents ignored, cents in the result ignored.
 * @param {string} name @param {Q} amount @param {boolean} foreign @returns {Step[]} */
function noTfn(name, amount, foreign) {
  const used = down(amount);
  return [{ id: `${name}_used`, value: used }, { id: 'withholding', value: down(mul(dec(foreign ? '0.45' : '0.47'), used)) }];
}
/** @param {boolean} foreign @returns {[string, string][]} */
const noTfnRate = (foreign) => [['rate', foreign ? '0.45' : '0.47']];
/** @param {Arg} a @param {string} schedule */
function notWorkingHolidayMaker(a, schedule) {
  if (flag(a, 'working_holiday_maker')) {
    refuse('withholding.working_holiday_maker', `${schedule} does not apply to a working holiday maker: Schedule 15 governs every payment to them.`);
  }
}

/** Schedule 2: 13% (30% foreign resident) of the earnings with cents ignored, to the nearest dollar. @param {Record<string, Arg>} a */
function horticulture(a) {
  scope(a.scope_confirmed, a.year, YEARS);
  const earnings = money(a.earnings);
  const tfn = flag(a.tfn_quoted, 'tfn_quoted');
  const foreign = flag(a.foreign_resident, 'foreign_resident');
  const claimed = flag(a.tax_free_threshold_claimed, 'tax_free_threshold_claimed');
  notWorkingHolidayMaker(a.working_holiday_maker, 'Schedule 2');
  if (flag(a.labour_mobility_scheme, 'labour_mobility_scheme')) {
    refuse('horticulture_shearing_withholding.labour_mobility_scheme', 'Schedule 2 does not apply to a worker under the Pacific Australia Labour Mobility scheme.');
  }
  if (tfn && !claimed) refuse('horticulture_shearing_withholding.threshold_not_claimed', 'Schedule 2 is for a worker who has claimed the tax-free threshold.');
  if (!tfn) return result(noTfn('earnings', earnings, foreign), noTfnRate(foreign));
  const rate = foreign ? '0.30' : '0.13';
  const used = down(earnings);
  return result([{ id: 'earnings_used', value: used }, { id: 'withholding', value: halfUp(mul(dec(rate), used)) }], [['rate', rate]]);
}

/** Schedule 14: the Schedule 1 amount plus the additional amount agreed in writing. @param {Record<string, Arg>} a @param {import('./withholding-schedule-1.mjs').Options} o */
function upward(a, o) {
  const year = scope(a.scope_confirmed, a.year, YEARS);
  const earnings = money(a.earnings);
  const period = payPeriod(a.pay_period, true);
  const scale = scheduleScale(a.scale, year);
  const additional = money(a.additional_amount);
  const w = schedule1(year, earnings, period, scale, choices(o, scale, period));
  const normal = /** @type {Step} */ (w.steps.pop());
  w.steps.push({ id: 'normal_withholding', value: normal.value }, { id: 'additional_amount', value: additional },
    { id: 'withholding', value: add(normal.value, additional) });
  return result(w.steps, w.rates);
}

/** The tax table for daily and casual workers. @param {Record<string, Arg>} a @param {Arg | undefined} offsetsArg */
function dailyCasual(a, offsetsArg) {
  const year = scope(a.scope_confirmed, a.year, YEARS);
  const earnings = money(a.earnings);
  const tfn = flag(a.tfn_quoted, 'tfn_quoted');
  const foreign = flag(a.foreign_resident, 'foreign_resident');
  const claimed = flag(a.tax_free_threshold_claimed, 'tax_free_threshold_claimed');
  if (tfn && !claimed) refuse('daily_casual_withholding.threshold_not_claimed', 'The tax table for daily and casual workers is for a payee who has claimed the tax-free threshold.');
  if (tfn && foreign) refuse('daily_casual_withholding.foreign_resident_tfn', 'A foreign resident who quoted a TFN is not worked out here.');
  notWorkingHolidayMaker(a.working_holiday_maker, 'The tax table for daily and casual workers');
  const offsets = offsetsArg ? money(offsetsArg) : null;
  if (!tfn) {
    if (offsets && offsets.p !== 0n) refuse('daily_casual_withholding.tax_offsets_not_allowed', 'Tax offsets do not reduce withholding when no TFN has been provided.');
    return result(noTfn('earnings', earnings, foreign), noTfnRate(foreign));
  }
  const x = add(mul(down(earnings), int(5)), dec('0.99'));
  const { a: ca, b: cb, y } = formula(x, pick(pick(SCHEDULE_1, year), 2));
  const daily = halfUp(div(y, int(5)));
  /** @type {Step[]} */
  const steps = [{ id: 'weekly_earnings_used', value: x }, { id: 'weekly_withholding', value: y }, { id: 'daily_withholding', value: daily }];
  if (offsets === null) steps.push({ id: 'withholding', value: daily });
  else {
    const reduction = halfUp(mul(offsets, dec('0.0038')));
    if (cmp(daily, reduction) < 0) refuse('daily_casual_withholding.offsets_exceed_withholding', 'The daily value of the tax offsets exceeds the daily amount withheld before them.');
    steps.push({ id: 'tax_offset_reduction', value: reduction }, { id: 'withholding', value: sub(daily, reduction) });
  }
  return result(steps, [['scale', '2'], ['a', ca], ['b', cb]]);
}

/** s 12-190: 47% of the payment, cents ignored, unless the supply's payments without GST are $75 or less. @param {Record<string, Arg>} a */
function noAbn(a) {
  scope(a.scope_confirmed, a.year, YEARS);
  const payment = money(a.payment);
  const gst = money(a.gst_included);
  const total = money(a.supply_total_excluding_gst);
  const excluding = sub(payment, gst);
  if (excluding.p < 0n) refuse('no_abn_withholding.gst_above_payment', 'gst_included is more than the payment.');
  if (cmp(total, excluding) < 0) refuse('no_abn_withholding.total_below_payment', 'supply_total_excluding_gst is less than this payment without its GST.');
  const steps = cmp(total, int(75)) > 0 ? noTfn('payment', payment, false) : [{ id: 'withholding', value: int(0) }];
  return result(steps, [['rate', '0.47'], ['threshold', '75']]);
}

/** Schedule 3: withholding from a payment for a day's performances. @param {Record<string, Arg>} a @param {Arg | undefined} offsetsArg */
function entertainer(a, offsetsArg) {
  const year = scope(a.scope_confirmed, a.year, YEARS);
  const week = count(a.performances_per_week, 'performances_per_week', 1, 1000);
  const day = count(a.performances_per_day, 'performances_per_day', 1, week);
  const earnings = money(a.earnings);
  const tfn = flag(a.tfn_quoted, 'tfn_quoted');
  const foreign = flag(a.foreign_resident, 'foreign_resident');
  const threshold = flag(a.tax_free_threshold_claimed, 'tax_free_threshold_claimed');
  notWorkingHolidayMaker(a.working_holiday_maker, 'Schedule 3');
  const offsets = offsetsArg ? money(offsetsArg) : null;
  const claimed = offsets !== null && offsets.p !== 0n;
  if (tfn && foreign) refuse('entertainer_withholding.foreign_resident_tfn', 'A foreign resident who quoted a TFN is not worked out here.');
  if (claimed && !(tfn && threshold)) refuse('entertainer_withholding.tax_offsets_not_allowed', 'Schedule 3 allows no tax offsets without a TFN and the tax-free threshold.');
  if (claimed && day > 1) refuse('entertainer_withholding.offsets_several_performances', 'Schedule 3 gives no daily value of tax offsets for more than one performance a day.');
  if (!tfn) {
    const paid = mul(earnings, int(day));
    return result([{ id: 'day_earnings', value: paid }, ...noTfn('day_earnings', paid, foreign)], noTfnRate(foreign));
  }
  const x = add(mul(down(earnings), int(week)), dec('0.99'));
  const { a: ca, b: cb, y } = formula(x, SCHEDULE_3[year === '2026-27' ? 2026 : 2024][threshold ? 0 : 1]);
  const daily = halfUp(mul(div(y, int(week)), int(day)));
  /** @type {Step[]} */
  const steps = [{ id: 'weekly_earnings_used', value: x }, { id: 'weekly_withholding', value: y }, { id: 'daily_withholding', value: daily }];
  if (!claimed) steps.push({ id: 'withholding', value: daily });
  else {
    const reduction = halfUp(div(div(/** @type {Q} */ (offsets), int(52)), int(week)));
    if (cmp(daily, reduction) < 0) refuse('entertainer_withholding.offsets_exceed_withholding', 'The per performance value of the tax offsets exceeds the amount withheld before them.');
    steps.push({ id: 'tax_offset_reduction', value: reduction }, { id: 'withholding', value: sub(daily, reduction) });
  }
  return result(steps, [['table', threshold ? 'A' : 'B'], ['a', ca], ['b', cb]]);
}

/** Schedule 4: 32% of the payment to the nearest dollar. @param {Record<string, Arg>} a */
function returnToWork(a) {
  scope(a.scope_confirmed, a.year, YEARS);
  const payment = money(a.payment);
  const tfn = flag(a.tfn_quoted, 'tfn_quoted');
  const foreign = flag(a.foreign_resident, 'foreign_resident');
  notWorkingHolidayMaker(a.working_holiday_maker, 'Schedule 4');
  if (!tfn) return result(noTfn('payment', payment, foreign), noTfnRate(foreign));
  return result([{ id: 'withholding', value: halfUp(mul(payment, dec('0.32'))) }], [['rate', '0.32']]);
}

/** Schedule 6: Schedule 1 on the income in each annuity payment. @param {Record<string, Arg>} a @param {import('./withholding-schedule-1.mjs').Options} o */
function annuity(a, o) {
  const year = scope(a.scope_confirmed, a.year, YEARS);
  const payment = money(a.payment);
  const period = payPeriod(a.pay_period, true);
  const scale = scheduleScale(a.scale, year);
  const deductible = money(a.deductible_amount);
  const instalments = count(a.instalments, 'instalments', 1, 366);
  const c = choices(o, scale, period);
  if (scale === 4) {
    if (c.extra) refuse('annuity_withholding.extra_pay_without_tfn', 'Schedule 6 without a TFN says nothing of the additional amount for 53 or 27 pays.');
    return result(noTfn('payment', payment, c.foreign === true), noTfnRate(c.foreign === true));
  }
  const income = sub(payment, div(deductible, int(instalments)));
  if (income.p < 0n) refuse('annuity_withholding.deductible_above_payment', 'The deductible amount for each instalment exceeds the annuity payment.');
  if (cmp(down(income, 2), income) !== 0) refuse('annuity_withholding.income_not_whole_cents', 'The deductible amount divided by the instalments does not come to whole cents.');
  const w = schedule1(year, income, period, scale, c);
  return result([{ id: 'earnings', value: income }, ...w.steps], w.rates);
}

/** Schedule 10's rate as Python divides the percentage. @param {Arg} percent */
function instalmentRate(percent) {
  if (percent.kind !== 'dec' || cmp(percent.value, int(0)) < 0 || cmp(percent.value, int(100)) > 0) {
    refuse('input.percentage_invalid', 'instalment_rate must be a finite Decimal percentage from 0 to 100.');
  }
  let n = (percent.value.p * 10n ** BigInt(percent.places)) / percent.value.q;
  let exp = -percent.places - 2;
  while (exp < -percent.places && n % 10n === 0n) { n /= 10n; exp += 1; }
  return { value: div(percent.value, int(100)), text: pyDecimal(n, exp) };
}
/** Schedule 10: the payment without GST times the instalment rate, or 20%. @param {Record<string, Arg>} a @param {Arg | undefined} cirArg */
function voluntary(a, cirArg) {
  scope(a.scope_confirmed, a.year, YEARS);
  const payment = money(a.payment);
  const gst = money(a.gst_included);
  if (!flag(a.agreement_in_force, 'agreement_in_force')) refuse('voluntary_agreement_withholding.agreement_not_in_force', 'Schedule 10 applies only under a voluntary agreement in force.');
  if (!flag(a.abn_quoted, 'abn_quoted')) refuse('voluntary_agreement_withholding.abn_not_quoted', 'Schedule 10 applies only when the payee quotes an ABN in force.');
  const applies = flag(a.agreement_applies_instalment_rate, 'agreement_applies_instalment_rate');
  let rate = { value: dec('0.20'), text: '0.20' };
  if (!cirArg && applies) refuse('voluntary_agreement_withholding.instalment_rate_missing', 'The agreement applies the instalment rate, but none was given.');
  if (cirArg) {
    const cir = instalmentRate(cirArg);
    if (applies || cmp(cir.value, dec('0.20')) >= 0) rate = cir;
  }
  if (cmp(payment, gst) < 0) refuse('voluntary_agreement_withholding.gst_above_payment', 'The GST included is more than the payment.');
  const net = sub(payment, gst);
  return result([{ id: 'payment_excluding_gst', value: net }, { id: 'withholding', value: halfUp(mul(net, rate.value)) }], [['rate', rate.text]]);
}

/** Schedule 15's columns for a registered employer and a payee with a TFN: payments before, lowest and highest. */
const COLUMNS = /** @type {[string | null, string | null, string][]} */ ([[null, '45000.99', '0.15'], ['45001', '135000', '0.30'],
  ['135001', '190000', '0.37'], ['190000.01', null, '0.45']]);
/** Schedule 15: withholding from one payment to a working holiday maker. @param {Record<string, Arg>} a */
function workingHolidayMaker(a) {
  const year = scope(a.scope_confirmed, a.year, YEARS);
  const payment = money(a.payment);
  const before = money(a.payments_before);
  const registered = flag(a.employer_registered, 'employer_registered');
  const tfn = flag(a.tfn_quoted, 'tfn_quoted');
  const period = payPeriod(a.pay_period, false);
  if (!registered && tfn) {
    const { y } = formula(weeklyEarnings(payment, period), pick(pick(SCHEDULE_1, year), 3));
    return result([{ id: 'payment_used', value: payment }, { id: 'withholding', value: forPeriod(y, period) }], [['scale', '3']],
      'unregistered employer: foreign resident rates, the Schedule 1 scale 3 amount for the pay period');
  }
  let column = 6;
  let rate = '0.45';
  if (tfn) {
    const found = COLUMNS.findIndex(([low, high]) => (low === null || cmp(dec(low), before) <= 0) && (high === null || cmp(before, dec(high)) <= 0));
    if (found < 0) refuse('working_holiday_maker.band_unsettled', 'Payments before of $135,000.01 to $135,000.99 are in none of Schedule 15’s columns; confirm the rate with the ATO.');
    column = found + 2;
    rate = COLUMNS.slice(found)[0][2];
  }
  const used = down(payment);
  const product = mul(dec(rate), used);
  const basis = registered ? `registered employer, ${tfn ? 'TFN quoted' : 'no TFN'}: column ${column}, rate ${rate} on the payment with cents ignored`
    : `unregistered employer, no TFN: the foreign resident rate without a TFN (Schedule 1 scale 4), ${rate} on the payment with cents ignored`;
  return result([{ id: 'payment_used', value: used }, { id: 'withholding', value: column <= 4 ? halfUp(product) : down(product) }],
    [['rate', rate]], basis);
}

/** Schedule 8's component for a Schedule 9 payee with a study loan, checked with its pay date. @param {string} year @param {Arg} loan @param {Arg | undefined} payDate */
function seniorsLoanRows(year, loan, payDate) {
  if (!flag(loan, 'study_loan')) {
    if (payDate) refuse('payg.pay_date_without_study_loan', 'pay_date is given only with study_loan true.');
    return null;
  }
  if (!Object.hasOwn(SCHEDULE_8, year)) refuse('period.unsupported', `study_loan is supported for ${Object.keys(SCHEDULE_8).join(', ')} only.`);
  const from = pick(SCHEDULE_8_FROM, year);
  const start = Number(year.slice(0, 4));
  if (payDate) {
    const day = date(payDate, 'pay_date');
    const days = (/** @type {string} */ text) => Date.parse(`${text}T00:00:00Z`) / 86400000;
    if (day < days(`${start}-07-01`) || day > days(`${start + 1}-06-30`)) refuse('payg.pay_date_outside_year', `pay_date is outside the ${year} income year.`);
    if (day < days(from)) refuse('payg.pay_date_before_schedule', `Schedule 8's coefficients for ${year} apply to payments made on or after ${from}.`);
  } else if (from !== `${start}-07-01`) refuse('input.missing_field', `pay_date is required for ${year}.`);
  return pick(SCHEDULE_8, year);
}
/** Schedule 9: withholding from one payment to a senior or pensioner. @param {Record<string, Arg>} a @param {Arg} loan @param {Arg | undefined} payDate */
function seniorsPensioners(a, loan, payDate) {
  const year = scope(a.scope_confirmed, a.year, YEARS);
  const earnings = money(a.earnings);
  const period = payPeriod(a.pay_period, false);
  const status = a.status.kind === 'text' ? ['single', 'illness_separated', 'couple'].indexOf(a.status.value) : -1;
  if (status < 0) refuse('input.status_invalid', 'status must be single, illness_separated or couple.');
  const exemption = a.medicare_levy_exemption.kind === 'text' ? ['none', 'full', 'half'].indexOf(a.medicare_levy_exemption.value) : -1;
  if (exemption < 0) refuse('input.medicare_levy_exemption_invalid', 'medicare_levy_exemption must be none, full or half.');
  const scale = exemption * 3 + status + 1;
  const loanRows = seniorsLoanRows(year, loan, payDate);
  const x = weeklyEarnings(earnings, period);
  const { a: ca, b: cb, y } = formula(x, SCHEDULE_9[year === '2026-27' ? 2026 : 2024][scale - 1]);
  const withholding = forPeriod(y, period);
  /** @type {Step[]} */
  const steps = [{ id: 'weekly_earnings_used', value: x }, { id: 'weekly_withholding', value: y }];
  /** @type {[string, string][]} */
  const rates = [['scale', String(scale)], ['a', ca], ['b', cb]];
  if (!loanRows) return result([...steps, { id: 'withholding', value: withholding }], rates);
  const component = formula(x, loanRows);
  const loanAmount = forPeriod(component.y, period);
  return result([...steps, { id: 'schedule_9_withholding', value: withholding }, { id: 'study_loan_component', value: loanAmount },
    { id: 'withholding', value: add(withholding, loanAmount) }], [...rates, ['component_a', component.a], ['component_b', component.b]]);
}

const PAYEE = ['earnings', 'tfn_quoted', 'foreign_resident', 'tax_free_threshold_claimed', 'working_holiday_maker', 'year', 'scope_confirmed'];
const PAYG_OPTIONS = ['foreign_resident', 'tax_offsets', 'medicare_adjustment_children', 'extra_pay_withholding'];
/** Each command: its inputs in order (decimals marked '$') and its optional inputs; any other is refused.
 * @type {Record<string, {params: string[], optional: string[]}>} */
const COMMANDS = {
  'horticulture-shearing-withholding': { params: ['$earnings', ...PAYEE.slice(1), 'labour_mobility_scheme'], optional: [] },
  'upward-variation-withholding': { params: ['$earnings', 'pay_period', 'scale', '$additional_amount', 'year', 'scope_confirmed'],
    optional: PAYG_OPTIONS, },
  'daily-casual-withholding': { params: ['$earnings', ...PAYEE.slice(1)], optional: ['tax_offsets'], },
  'no-abn-withholding': { params: ['$payment', '$gst_included', '$supply_total_excluding_gst', 'year', 'scope_confirmed'], optional: [],
    },
  'entertainer-withholding': { params: ['performances_per_week', 'performances_per_day', '$earnings', ...PAYEE.slice(1)],
    optional: ['tax_offsets'], },
  'return-to-work-withholding': { params: ['$payment', 'tfn_quoted', 'foreign_resident', 'working_holiday_maker', 'year',
    'scope_confirmed'], optional: [] },
  'annuity-withholding': { params: ['$payment', '$deductible_amount', 'instalments', 'pay_period', 'scale', 'year', 'scope_confirmed'],
    optional: PAYG_OPTIONS, },
  'voluntary-agreement-withholding': { params: ['$payment', '$gst_included', 'agreement_in_force', 'abn_quoted',
    'agreement_applies_instalment_rate', 'year', 'scope_confirmed'], optional: ['instalment_rate'], },
  'working-holiday-maker-withholding': { params: ['$payment', '$payments_before', 'employer_registered', 'tfn_quoted', 'pay_period',
    'year', 'scope_confirmed'], optional: [] },
  'seniors-pensioners-withholding': { params: ['$earnings', 'pay_period', 'status', 'medicare_levy_exemption', 'year', 'scope_confirmed'],
    optional: ['study_loan', 'pay_date'] },
};
/** The commands this module ports. */
export const WITHHOLDING_COMMANDS = Object.keys(COMMANDS);

/** Runs one command on its JSON input, as the crate's command does: its amounts and rates, or a refusal
 * with the crate's code. @param {string} command @param {unknown} input @returns {Result} */
export function withholdingSchedule(command, input) {
  const spec = pick(COMMANDS, command);
  if (!spec) refuse('command.unknown', `unknown command ${command}`);
  if (typeof input !== 'object' || input === null || Array.isArray(input)) refuse('input.not_object', 'input must be a JSON object');
  const given = new Map(Object.entries(input));
  const names = spec.params.map((p) => p.replace('$', ''));
  const unknown = [...given.keys()].find((k) => !names.includes(k) && !spec.optional.includes(k));
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an input of ${command}`);
  /** @type {Record<string, Arg>} */
  const a = Object.fromEntries(spec.params.map((p) => {
    const key = p.replace('$', '');
    if (!given.has(key)) refuse('input.missing_field', `${key} is required`);
    return [key, arg(given.get(key), p.startsWith('$'), key)];
  }));
  /** @param {string} key @param {boolean} decimal */
  const optional = (key, decimal) => (given.has(key) ? arg(given.get(key), decimal, key) : undefined);
  const options = () => ({ offsets: optional('tax_offsets', true), foreign: optional('foreign_resident', false),
    children: optional('medicare_adjustment_children', false), extra: optional('extra_pay_withholding', false) });
  switch (command) {
    case 'horticulture-shearing-withholding': return horticulture(a);
    case 'upward-variation-withholding': return upward(a, options());
    case 'daily-casual-withholding': return dailyCasual(a, optional('tax_offsets', true));
    case 'no-abn-withholding': return noAbn(a);
    case 'entertainer-withholding': return entertainer(a, optional('tax_offsets', true));
    case 'return-to-work-withholding': return returnToWork(a);
    case 'annuity-withholding': return annuity(a, options());
    case 'voluntary-agreement-withholding': return voluntary(a, optional('instalment_rate', true));
    case 'working-holiday-maker-withholding': return workingHolidayMaker(a);
    default: return seniorsPensioners(a, optional('study_loan', false) ?? { kind: 'bool', value: false }, optional('pay_date', false));
  }
}
