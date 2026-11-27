// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The crystallised segment of a superannuation interest's tax free component at 30 June 2007
// (ITAA 1997 s 307-225), with its pre-July 83 component under former ITAA 1936 s 27AA(1)(d): a port
// of the `super-crystallisation` command of ryanduguid/australian-accounting, checked against it on
// every case of its differential fixture. The non-qualifying and excessive components are nil.

import { add, amountsOf, callFields, cmp, dateOf, div, exact, flag, min, money, mul, refuse, sub, yearOf } from './command-args.mjs';
import { dayOf } from './residency-days.mjs';
import { formAmount, formMoney } from './form-amount.mjs';

const COMPONENTS = ['interest_value', 'concessional_component', 'post_june_1994_invalidity_component', 'cgt_exempt_component', 'undeducted_contributions'];
const FIELDS = ['eligible_service_start', ...COMPONENTS, 'untaxed_source', 'income_stream_before_july_2007', 'year', 'scope_confirmed'];
const END = /** @type {number} */ (dayOf('2007-06-30'));
const BEFORE = /** @type {number} */ (dayOf('1983-06-30'));

/** The days of service to 30 June 2007 and those before 1 July 1983, both ends counted. @param {number} start */
function serviceDays(start) {
  if (start > END) refuse('super_crystallisation.dates_invalid', 'Enter an eligible service start on or before 30 June 2007 (ITAA 1997 s 307-225(1)).');
  return [END - start + 1, Math.max(0, BEFORE - start + 1)];
}

/**
 * The command's result: { period, amounts, rates }, each amount to the cent.
 * @param {unknown} given the command's JSON input
 */
export function superCrystallisation(given) {
  const input = callFields(given, 'super-crystallisation', FIELDS, [], COMPONENTS);
  const year = yearOf(input, ['2006-07']);
  if (flag(input.get('untaxed_source'), 'untaxed_source')) {
    refuse('super_crystallisation.untaxed_source', 'An interest from an untaxed source is not worked here: s 307-225(3) disregards the element untaxed in the fund for the pre-July 83 component.');
  }
  if (flag(input.get('income_stream_before_july_2007'), 'income_stream_before_july_2007')) {
    refuse('super_crystallisation.income_stream_before_july_2007', 'An income stream first paid before 1 July 2007 is not worked here: ITAA 1997 s 307-125 works out its tax free component from the s 27H deductible amount instead.');
  }
  const [total, before] = serviceDays(dateOf(input.get('eligible_service_start'), 'eligible_service_start'));
  const [value, concessional, invalidity, cgt, undeducted] = COMPONENTS.map((key) => money(input.get(key)));
  if (cmp(add(add(add(concessional, invalidity), cgt), undeducted), value) > 0) {
    refuse('super_crystallisation.components_exceed_value', 'The concessional, post-June 1994 invalidity and CGT exempt components and the undeducted contributions add to more than the value of the interest.');
  }
  const base = sub(sub(sub(value, concessional), invalidity), cgt);
  const byDays = div(mul(base, exact(BigInt(before))), exact(BigInt(total)));
  const chosen = min(byDays, sub(base, undeducted));
  const pre = exact((200n * chosen.n + chosen.d) / (2n * chosen.d), 100n);
  const segment = add(add(add(add(concessional, invalidity), undeducted), cgt), pre);
  return {
    period: year,
    amounts: amountsOf([['pre_july_83_base', base], ['pre_july_83_component', pre], ['crystallised_segment', segment], ['taxable_component', sub(value, segment)]]),
    rates: { service_days: String(total), pre_july_1983_days: String(before), post_june_1983_days: String(total - before) },
  };
}

/** The command's input from the page's form. @param {(name: string) => string} value */
export function crystallisationFormInput(value) {
  return {
    year: '2006-07', scope_confirmed: true, eligible_service_start: value('service-start'),
    interest_value: formAmount(value('interest'), 'the value of the interest at 30 June 2007'),
    concessional_component: formAmount(value('concessional'), 'the concessional component'),
    post_june_1994_invalidity_component: formAmount(value('invalidity'), 'the post-June 1994 invalidity component'),
    cgt_exempt_component: formAmount(value('cgt'), 'the CGT exempt component'),
    undeducted_contributions: formAmount(value('undeducted'), 'the undeducted contributions'),
    untaxed_source: value('untaxed') === 'yes', income_stream_before_july_2007: value('income-stream') === 'yes',
  };
}

/** The page's result. @param {(name: string) => string} value */
export function crystallisationResult(value) {
  const input = crystallisationFormInput(value);
  let r;
  try {
    r = superCrystallisation(input);
  } catch (error) {
    if (/** @type {{code?: string}} */ (error).code === 'input.date_invalid') refuse('input.date_invalid', 'Enter the eligible service start as a date from 1900 to 2100.');
    throw error;
  }
  const a = r.amounts;
  const rows = [['Pre-July 83 component', formMoney(a.pre_july_83_component)], ['Crystallised segment (tax free component)', formMoney(a.crystallised_segment)],
    ['Taxable component left', formMoney(a.taxable_component)]];
  const note = `${r.rates.pre_july_1983_days} of ${r.rates.service_days} days of eligible service fall before 1 July 1983`;
  return { inputs: `Service from ${input.eligible_service_start}; interest ${formMoney(input.interest_value)} at 30 June 2007`, rows, principal: 1, note };
}
