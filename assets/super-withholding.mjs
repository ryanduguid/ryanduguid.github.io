// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The amount a fund withholds from a superannuation lump sum under Schedule 12, the
// `super-withholding` command of ryanduguid/australian-accounting (PR 813) ported line for line: its
// inputs, rounding and refusal codes, in the order the command checks them. It works the lump sum
// as the super lump sum tax calculator does, then applies Table A's rates in place of the offsets'
// ceilings. Read 22 November 2026:
// - The ATO's Schedule 12 from 13 October 2020 to 30 June 2024: Table A, 'Rollovers', 'When a TFN
//   has not been provided' and 'Rounding of withholding amounts', with the Heather, Dean and Tom examples.
// - Schedule 12 of the Taxation Administration (Withholding Schedules) Instruments 2024 (F2024L00664),
//   2025 (F2025L00647), (No. 2) 2025 (F2025L01016) and 2026 (F2026L00716): the same rules, with Tom and Chloe.
// The TFN, residency and roll-over are the user's facts.

import { MEMBER_BANDS, PART_LABELS, TREATMENTS, dayText, flag, inDollars, ledger, lumpSum, memberParts, min, otherParts, period,
  read, refuse, refusePre1983, sbtFormInput, sbtInputsText, treatment, when } from './super-benefit-tax.mjs';

/** Schedule 12 as read covers payments from this day. */
export const SWH_FIRST_DAY = '2020-10-13';
const REQUIRED = ['benefit', 'interest_value', 'interest_tax_free_component', 'untaxed_element', 'recipient', 'payment_date',
  'tfn_provided', 'foreign_resident', 'year', 'scope_confirmed'];
const RECIPIENTS = ['member', 'death_benefits_dependant', 'non_dependant', 'rollover', 'deceased_estate_trustee'];
const MEMBER_FACTS = ['date_of_birth', 'terminal_medical_condition', 'disability_superannuation_benefit'];
const CAPS = ['low_rate_cap_used', 'untaxed_plan_cap_used', 'other_lump_sums_this_year'];
const NIL_TREATMENTS = { terminal_medical_condition: 1, under_200_closing_the_interest: 1, death_benefits_dependant: 1 };

/** Each of `keys` refused when given. @param {Record<string, unknown>} input @param {string[]} keys @param {string} why */
const noneOf = (input, keys, why) => keys.forEach((key) => when(false, input, key, why));
/** A rate in hundredths as the command writes it. @param {number} hundredths */
const rateText = (hundredths) => (hundredths ? `0.${String(hundredths).padStart(2, '0')}` : '0');
/** An amount as the command prints it: to the cent, half up. @param {bigint} units @param {number} places of `units` */
export function centsText(units, places) {
  const c = places > 2 ? (units + 5n * 10n ** BigInt(places - 3)) / 10n ** BigInt(places - 2) : units * 10n ** BigInt(2 - places);
  return `${c / 100n}.${String(c % 100n).padStart(2, '0')}`;
}

/** @typedef {{steps: Record<string, string>, rates: Record<string, string>, withholding: bigint}} SwhTail */
/** In dollars: the components, each amount the command works, as it prints it, the rates, the
 * treatment, the member's ages and the amount to withhold, in whole dollars.
 * @typedef {{treatment: string, taxFree: number, taxable: number, taxed: number, untaxed: number,
 *   amounts: Record<string, string>, rates: Record<string, string>, withholding: number, age?: number, preservationAge?: number}} SwhWorked */

/** @returns {SwhTail} */
const nil = () => ({ steps: {}, rates: {}, withholding: 0n });

/** A member's roll-over: 47% of the element untaxed in the fund above the untaxed plan cap left.
 * @param {Record<string, unknown>} input @param {Record<string, bigint | null>} amounts @param {string} year
 * @param {{taxed: bigint, untaxed: bigint}} c @param {boolean} tfn @returns {SwhTail} */
function rollover(input, amounts, year, c, tfn) {
  noneOf(input, [...MEMBER_FACTS, 'low_rate_cap_used', 'other_lump_sums_this_year'], 'for a member benefit (recipient member)');
  refusePre1983(input, c);
  const l = ledger(input, amounts, year, c);
  const left = l.planLeft();
  if (left === null) return nil();
  const above = c.untaxed - min(c.untaxed, left);
  // With a TFN, the nearest dollar of 47%; without one, cents ignored in the amount and the result.
  const withholding = tfn ? (above * 47n + 5000n) / 10000n : ((above / 100n) * 47n) / 100n;
  return { steps: { untaxed_plan_cap_left: centsText(left, 2), untaxed_above_plan_cap: centsText(above, 2) },
    rates: { ...l.rates, rollover_rate: '0.47' }, withholding };
}

/** No TFN: 47%, or 45% for a foreign resident, of the amount the payee's age sets, cents ignored.
 * @param {string} name @param {{taxable: bigint, untaxed: bigint}} c @param {boolean} foreign @returns {SwhTail} */
function noTfn(name, c, foreign) {
  if (name === 'terminal_medical_condition' || name === 'death_benefits_dependant') return nil();
  if (!MEMBER_BANDS.includes(name)) {
    refuse('super_withholding.no_tfn_unstated', 'Schedule 12’s rates without a TFN turn on the payee’s age, which the calculator does not take for a death benefit, and it states none for a member benefit under $200.');
  }
  const from = (name === 'aged_60_or_over' ? c.untaxed : c.taxable) / 100n;
  const rate = foreign ? 45n : 47n;
  return { steps: { withheld_from: centsText(from, 0) }, rates: { no_tfn_rate: rateText(Number(rate)) }, withholding: (from * rate) / 100n };
}

/** With a TFN: each part at Table A's rate, its ceiling plus the 2% Medicare levy for a resident, the
 * total rounded once to the nearest dollar. @param {ReturnType<typeof ledger>} l @param {boolean} foreign @returns {SwhTail} */
function tableA(l, foreign) {
  if (!l.parts.length) return nil();
  /** @type {Record<string, string>} */
  const steps = {};
  for (const [key, value] of Object.entries(l.caps)) steps[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = centsText(value, 2);
  const rates = Object.fromEntries(Object.entries(l.rates).filter(([key]) => !key.endsWith('_rate')));
  let sum = 0n;
  for (const p of l.parts) {
    const rate = p.rate && p.rate + (foreign ? 0 : 2);
    rates[`${p.id}_withholding_rate`] = rateText(rate);
    const value = p.amount * BigInt(rate);
    Object.assign(steps, { [p.id]: centsText(p.amount, 2), [`${p.id}_withholding`]: centsText(value, 4) });
    sum += value;
  }
  return { steps, rates, withholding: (sum + 5000n) / 10000n };
}

/**
 * The amount to withhold from one superannuation lump sum, as the `super-withholding` command works it.
 * @param {unknown} given the command's input, with decimal amounts as strings
 * @returns {SwhWorked}
 */
export function superWithholding(given) {
  if (typeof given !== 'object' || !given || Array.isArray(given)) refuse('input.not_object', 'The input is not an object.');
  const input = /** @type {Record<string, unknown>} */ (given);
  const amounts = read(input, REQUIRED);
  const { year, paid } = period(input);
  if (dayText(paid) < SWH_FIRST_DAY) {
    refuse('super_withholding.schedule_not_read', 'Schedule 12 as it stood before 13 October 2020 was not read for this calculator; the payment date must be on or after 13 October 2020.');
  }
  const tfn = flag('tfn_provided', input.tfn_provided);
  const foreign = flag('foreign_resident', input.foreign_resident);
  if (!RECIPIENTS.includes(/** @type {string} */ (input.recipient))) {
    refuse('super_withholding.recipient_invalid', 'Choose who receives the payment: the member, a death benefits dependant, a non-dependant, a roll-over or the trustee of a deceased estate.');
  }
  const facts = { paid, ...lumpSum(amounts) };
  const { c } = facts;
  /** @type {{name: string, age?: number, preservation?: number}} */
  let t = { name: /** @type {string} */ (input.recipient) };
  let tail;
  if (t.name === 'rollover') tail = rollover(input, amounts, year, c, tfn);
  else if (t.name === 'deceased_estate_trustee') {
    noneOf(input, [...MEMBER_FACTS, 'service_before_july_1983', ...CAPS], 'for a member benefit or a roll-over');
    tail = nil();
  } else {
    t = treatment(input, facts);
    refusePre1983(input, c);
    const free = t.name in NIL_TREATMENTS;
    if (!tfn || free) noneOf(input, CAPS, tfn ? 'for a benefit taxed by age' : 'with a TFN (tfn_provided true)');
    if (!tfn) tail = noTfn(t.name, c, foreign);
    else if (free) tail = nil();
    else {
      const l = ledger(input, amounts, year, c);
      if (MEMBER_BANDS.includes(t.name)) memberParts(l, input, amounts, year, c, t.name);
      else otherParts(l, input, c, t.name);
      tail = tableA(l, foreign);
    }
  }
  if (t.age !== undefined) Object.assign(tail.rates, { age: String(t.age), preservation_age: String(t.preservation) });
  return { treatment: t.name, taxFree: inDollars(c.taxFree), taxable: inDollars(c.taxable), taxed: inDollars(c.taxed),
    untaxed: inDollars(c.untaxed), amounts: { tax_free_component: centsText(c.taxFree, 2), taxable_component: centsText(c.taxable, 2),
      taxed_element: centsText(c.taxed, 2), untaxed_element: centsText(c.untaxed, 2), ...tail.steps, withholding: centsText(tail.withholding, 0) },
    rates: tail.rates, withholding: Number(tail.withholding),
    ...(t.age === undefined ? {} : { age: t.age, preservationAge: t.preservation }) };
}

/** The command's input from the form: the lump sum as the tax calculation takes it, with the payee's TFN
 * and residency. A roll-over takes the member's untaxed plan cap used and none of the member's other facts;
 * a deceased estate's trustee, no service answer; a member benefit with no withholding or no TFN, no caps.
 * @param {(name: string) => string} value */
export function swhFormInput(value) {
  const recipient = value('recipient').trim();
  const yes = (/** @type {string} */ name) => (value(name).trim() === '' ? undefined : value(name).trim() === 'yes');
  /** @type {Record<string, unknown>} */
  const input = { ...sbtFormInput((name) => (name === 'recipient' && recipient === 'rollover' ? 'member' : value(name))), recipient,
    tfn_provided: yes('tfn'), foreign_resident: yes('foreign') };
  const free = input.terminal_medical_condition === true
    || (Number(input.benefit) === Number(input.interest_value) && Number(input.benefit) < 200);
  const drop = [...(recipient === 'rollover' ? [...MEMBER_FACTS, 'low_rate_cap_used', 'other_lump_sums_this_year'] : []),
    ...(recipient === 'deceased_estate_trustee' ? ['service_before_july_1983'] : []),
    ...(recipient === 'member' && (input.tfn_provided === false || free) ? CAPS : [])];
  return Object.fromEntries(Object.entries(input).filter(([key, v]) => v !== undefined && !drop.includes(key)));
}

/** The page's result for the amount to withhold: the components, each part at Table A's rate and the
 * amount to withhold. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function superWithholdingResult(value, aud) {
  const input = swhFormInput(value);
  const r = superWithholding(input);
  const amounts = new Map(Object.entries(r.amounts));
  const rates = new Map(Object.entries(r.rates));
  const dollars = (/** @type {string} */ id) => aud(Number(amounts.get(id)));
  const rows = [['Tax free component', aud(r.taxFree)], ['Taxable component: element taxed in the fund', aud(r.taxed)],
    ['Taxable component: element untaxed in the fund', aud(r.untaxed)]];
  if (amounts.has('withheld_from')) rows.push(['Amount withheld from, cents ignored', dollars('withheld_from')]);
  if (r.treatment === 'rollover' && amounts.has('untaxed_above_plan_cap')) {
    rows.push(['Untaxed element above the untaxed plan cap left', dollars('untaxed_above_plan_cap')]);
  }
  for (const [id, label] of Object.entries(PART_LABELS)) {
    if (amounts.has(`${id}_withholding`) && Number(amounts.get(id))) {
      rows.push([`${label}, ${dollars(id)} at ${Math.round(Number(rates.get(`${id}_withholding_rate`)) * 100)}%`, dollars(`${id}_withholding`)]);
    }
  }
  rows.push(['Amount to withhold, to the nearest dollar', aud(r.withholding)]);
  const who = r.age === undefined ? '' : `Aged ${r.age} on the payment date, preservation age ${r.preservationAge}: `;
  const levy = input.foreign_resident ? 'without the Medicare levy for a foreign resident' : 'with the 2% Medicare levy';
  const how = r.treatment === 'rollover' ? 'a roll-over: 47% of the untaxed element above the untaxed plan cap left, nothing on the rest'
    : r.treatment === 'deceased_estate_trustee' ? 'nothing is withheld from a death benefit paid to the trustee of a deceased estate'
      : r.rates.no_tfn_rate === undefined && r.treatment in NIL_TREATMENTS ? `${TREATMENTS[r.treatment]}, so nothing is withheld`
        : !input.tfn_provided ? `no TFN: ${r.rates.no_tfn_rate === '0.45' ? 45 : 47}% with no offsets or Medicare levy, cents ignored`
        : `${TREATMENTS[r.treatment]}; Table A’s rate for each part, ${levy}`;
  const payee = `${input.tfn_provided ? 'TFN given' : 'no TFN'}${input.foreign_resident ? ', foreign resident' : ''}`;
  return { inputs: `${sbtInputsText(input, aud)}; ${payee}`, rows, principal: rows.length - 1, note: `${who}${how}` };
}
