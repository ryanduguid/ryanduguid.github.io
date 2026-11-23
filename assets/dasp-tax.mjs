// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The tax on a departing Australia superannuation payment, the `dasp-tax` command of
// ryanduguid/australian-accounting (PR 744) ported line for line: its inputs, rounding and refusal
// codes, in the order the command checks them. Read 19 November 2026:
// - The Superannuation (Departing Australia Superannuation Payments Tax) Act 2007 ss 4 to 6
//   (compilation 5) at the Federal Register of Legislation.
// - ITAA 1997 ss 301-170 and 301-175 at the ATO's legal database.
// The components and the working holiday maker contributions are the user's facts.

import { ratioCents } from './money.mjs';
import { flag, money, read, refuse } from './super-benefit-tax.mjs';

/** The income years the command works. */
export const DASP_YEARS = ['2025-26', '2026-27', '2027-28'];
const REQUIRED = ['tax_free_component', 'taxed_element', 'untaxed_element', 'working_holiday_maker_contributions',
  'unclaimed_money_rollover', 'year', 'scope_confirmed'];

/** In dollars: the payment, the tax on each component and in all, the net payment, the rates and
 * whether they are the ordinary or the working holiday maker rates.
 * @typedef {{payment: number, taxFreeTax: number, taxedTax: number, untaxedTax: number, tax: number, net: number,
 *   rates: Record<string, string>, rateBasis: string}} DaspWorked */

/**
 * The tax on one departing Australia superannuation payment, as the `dasp-tax` command works it.
 * @param {unknown} given the command's input, with decimal amounts as strings
 * @returns {DaspWorked}
 */
export function daspTax(given) {
  if (typeof given !== 'object' || !given || Array.isArray(given)) refuse('input.not_object', 'The input is not an object.');
  const input = /** @type {Record<string, unknown>} */ (given);
  const amounts = read(input, REQUIRED, []);
  if (input.scope_confirmed !== true) refuse('scope.not_confirmed', 'Confirm the facts the calculator takes as given.');
  if (!DASP_YEARS.includes(/** @type {string} */ (input.year))) refuse('period.unsupported', 'Choose an income year from 2025-26 to 2027-28.');
  const free = money('tax_free_component', amounts.tax_free_component);
  const taxed = money('taxed_element', amounts.taxed_element);
  const untaxed = money('untaxed_element', amounts.untaxed_element);
  const whm = flag('working_holiday_maker_contributions', input.working_holiday_maker_contributions);
  if (flag('unclaimed_money_rollover', input.unclaimed_money_rollover) && untaxed !== 0n) {
    refuse('dasp_tax.unclaimed_money_rollover', 'The element untaxed in the fund of an unclaimed money roll-over bears nil on any excess untaxed roll-over amount (DASP Tax Act s 5(2)), which this calculator does not take.');
  }
  const payment = free + taxed + untaxed;
  if (payment === 0n) refuse('dasp_tax.payment_nil', 'A departing Australia superannuation payment of nil has no tax; give its components.');
  // Section 5(1): 35% and 45%; s 5(3): 65% on both elements for a working holiday maker. Each to the cent.
  const [taxedRate, untaxedRate] = whm ? [65n, 65n] : [35n, 45n];
  const taxedTax = ratioCents(taxed * taxedRate, 100n);
  const untaxedTax = ratioCents(untaxed * untaxedRate, 100n);
  const tax = taxedTax + untaxedTax;
  const dollars = (/** @type {bigint} */ cents) => Number(cents) / 100;
  return { payment: dollars(payment), taxFreeTax: 0, taxedTax: dollars(taxedTax), untaxedTax: dollars(untaxedTax), tax: dollars(tax),
    net: dollars(payment - tax), rates: { tax_free_component_rate: '0', taxed_element_rate: `0.${taxedRate}`, untaxed_element_rate: `0.${untaxedRate}` },
    rateBasis: whm ? 'working_holiday_maker' : 'ordinary' };
}

/** The command's input from the form. @param {(name: string) => string} value */
export function daspFormInput(value) {
  const text = (/** @type {string} */ name) => value(name).trim();
  /** @type {Record<string, unknown>} */
  const input = { tax_free_component: text('dasp-free'), taxed_element: text('dasp-taxed'),
    untaxed_element: text('dasp-untaxed') === '' ? '0' : text('dasp-untaxed'), year: text('dasp-year'), scope_confirmed: true };
  const yes = (/** @type {string} */ name) => (text(name) === '' ? undefined : text(name) === 'yes');
  const answers = { working_holiday_maker_contributions: yes('whm'), unclaimed_money_rollover: yes('unclaimed') };
  return Object.fromEntries(Object.entries({ ...input, ...answers }).filter(([, v]) => v !== undefined));
}

/** The page's result for a departing Australia superannuation payment.
 * @param {(name: string) => string} value @param {(value: number) => string} aud */
export function daspTaxResult(value, aud) {
  const input = daspFormInput(value);
  const r = daspTax(input);
  const rate = (/** @type {string} */ share) => `${Math.round(Number(share) * 100)}%`;
  const rows = [['Payment', aud(r.payment)], ['Tax free component, at 0%', aud(r.taxFreeTax)],
    [`Element taxed in the fund, at ${rate(r.rates.taxed_element_rate)}`, aud(r.taxedTax)],
    [`Element untaxed in the fund, at ${rate(r.rates.untaxed_element_rate)}`, aud(r.untaxedTax)],
    ['Departing Australia superannuation payment tax', aud(r.tax)], ['Net payment', aud(r.net)]];
  const whm = r.rateBasis === 'working_holiday_maker';
  const inputs = [input.year, `tax free component ${aud(Number(input.tax_free_component))}`, `taxed element ${aud(Number(input.taxed_element))}`,
    `untaxed element ${aud(Number(input.untaxed_element))}`, whm ? 'working holiday maker contributions' : 'no working holiday maker contributions'];
  if (input.unclaimed_money_rollover) inputs.push('unclaimed money roll-over');
  return { inputs: inputs.join('; '), rows, principal: 4,
    note: whm ? 'Working holiday maker contributions: 65% on each element (section 5(3))' : 'The ordinary rates: 35% on the taxed element and 45% on the untaxed element (section 5(1))' };
}
