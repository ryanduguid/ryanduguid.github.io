// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The most income tax a superannuation lump sum can bear, the `super-benefit-tax` command of
// ryanduguid/australian-accounting (PR 786) ported line for line: its inputs, caps, rounding and
// refusal codes, in the order the command checks them. Read 22 November 2026:
// - ITAA 1997 ss 301-10 to 301-35, 301-90 to 301-115, 301-225, 302-60, 302-140, 302-145, 303-10,
//   307-125, 307-275, 307-345 and 307-350 at the ATO's legal database.
// - The ATO's 'Payments from super' (last updated 16 September 2026): Table 9, the low rate cap,
//   and Table 10, the untaxed plan cap; 'Tax rates, Australian residents' (13 August 2026): 45%.
// - The ATO's 'Tax on super benefits' (2 August 2023): the Tony, Suzi, Frankie, Peta,
//   Mei, Howard and Anh examples.
// - Schedule 12 of the withholding schedules (2020 and LI 2026/18): Heather, Dean and Chloe.
// The components, the element untaxed in the fund, dependency and a terminal medical condition
// are the user's facts.

import { ratioCents } from './money.mjs';

export const SBT_READ = '2026-11-22';
/** The income years the command works. */
export const SBT_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
/** Table 9: the low rate cap amount (s 307-345). From 2024-25 nobody is at preservation age and
 * under 60, so no later year needs it. */
export const SBT_LOW_RATE_CAP = { '2020-21': 215000, '2021-22': 225000, '2022-23': 230000, '2023-24': 235000 };
/** Table 10: the untaxed plan cap amount (s 307-350). */
export const SBT_UNTAXED_PLAN_CAP = { '2020-21': 1565000, '2021-22': 1615000, '2022-23': 1650000, '2023-24': 1705000,
  '2024-25': 1780000, '2025-26': 1865000, '2026-27': 1935000 };
export const SBT_RECIPIENTS = { member: 'member', death_benefits_dependant: 'death benefits dependant', non_dependant: 'non-dependant',
  rollover: 'roll-over', deceased_estate_trustee: 'trustee of a deceased estate' };

const REQUIRED = ['benefit', 'interest_value', 'interest_tax_free_component', 'untaxed_element', 'recipient', 'payment_date',
  'year', 'scope_confirmed'];
const OPTIONAL = ['date_of_birth', 'terminal_medical_condition', 'disability_superannuation_benefit', 'service_before_july_1983',
  'low_rate_cap_used', 'untaxed_plan_cap_used', 'other_lump_sums_this_year'];
const DECIMALS = new Set(['benefit', 'interest_value', 'interest_tax_free_component', 'untaxed_element', 'low_rate_cap_used',
  'untaxed_plan_cap_used', 'tax_free_component', 'taxed_element']);
const WORDS = /** @type {Record<string, string>} */ ({ benefit: 'the lump sum', interest_value: 'the value of the super interest',
  interest_tax_free_component: 'the interest’s tax free component', untaxed_element: 'the element untaxed in the fund',
  low_rate_cap_used: 'the low rate cap amount used', untaxed_plan_cap_used: 'the untaxed plan cap amount used',
  recipient: 'who receives the benefit', payment_date: 'the payment date', year: 'the income year',
  scope_confirmed: 'the scope confirmation', date_of_birth: 'the member’s date of birth',
  terminal_medical_condition: 'whether the member has a terminal medical condition',
  disability_superannuation_benefit: 'whether the benefit is a disability superannuation benefit',
  service_before_july_1983: 'whether the untaxed element relates to service before 1 July 1983',
  other_lump_sums_this_year: 'whether the member received other lump sums this income year',
  tfn_provided: 'whether the payee gave the fund a TFN', foreign_resident: 'whether the payee is a foreign resident',
  tax_free_component: 'the payment’s tax free component', taxed_element: 'the element taxed in the fund',
  working_holiday_maker_contributions: 'whether the payment includes contributions made whilst a working holiday maker',
  unclaimed_money_rollover: 'whether the payment is an unclaimed money roll-over' });
const MAX = 10n ** 14n;

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
export function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** A decimal input as the command reads it: cents, or null when readable but not an amount it
 * takes (not a string, not finite, below nil, above $1,000,000,000,000 or with more than 2 places).
 * @param {string} key @param {unknown} value @returns {bigint | null} */
function decimal(key, value) {
  if (typeof value !== 'string') return null;
  if (value.length > 8192) refuse('input.decimal_too_long', `Enter ${WORDS[key]} with fewer digits.`);
  const text = value.trim();
  if (/^-?(inf|infinity|s?nan)$/i.test(text)) return null;
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!parts) refuse('input.decimal_unreadable', `Enter ${WORDS[key]} as an amount in digits, such as 1250.50.`);
  const places = (parts[3] ?? '').length;
  if (places > 2) return null;
  const cents = BigInt(parts[2] + (parts[3] ?? '').padEnd(2, '0'));
  return (parts[1] && cents > 0n) || cents > MAX ? null : cents;
}

/** @param {string} key @param {bigint | null} cents @returns {bigint} */
export function money(key, cents) {
  if (cents === null) refuse('input.amount_invalid', `Enter ${WORDS[key]} as an amount of 0 or more with no more than 2 decimal places.`);
  return cents;
}

/** @param {string} key @param {unknown} value @returns {boolean} */
export function flag(key, value) {
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `Answer ${WORDS[key]} yes or no.`);
  return value;
}

/** A YYYY-MM-DD date from 1900 to 2100 as [year, month, day], or null. @param {unknown} value */
export function civil(value) {
  const parts = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!parts) return null;
  const [y, m, d] = parts.slice(1).map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= days ? [y, m, d] : null;
}

/** @param {string} key @param {unknown} value @returns {[number, number, number]} */
function date(key, value) {
  const day = civil(value);
  if (!day) refuse('input.date_invalid', `Enter ${WORDS[key]} as a date from 1900 to 2100.`);
  return /** @type {[number, number, number]} */ (day);
}

export const dayText = (/** @type {number[]} */ [y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Completed years on `day`; a 29 February birthday falls on 1 March in a common year.
 * @param {number[]} born @param {number[]} day */
export function ageOn(born, day) {
  return day[0] - born[0] - (day[1] < born[1] || (day[1] === born[1] && day[2] < born[2]) ? 1 : 0);
}

/** SISR reg 6.01(2): 55 for those born before 1 July 1960, rising a year for each later year to 60.
 * @param {number[]} born */
export function preservationAge([year, month]) {
  return Math.min(60, Math.max(55, (month >= 7 ? year : year - 1) - 1960 + 56));
}

/** `given` when `needed`, refused when given and not needed. @param {boolean} needed
 * @param {Record<string, unknown>} input @param {string} key @param {string} why */
export function when(needed, input, key, why) {
  const given = Object.hasOwn(input, key);
  if (needed && !given) refuse('input.missing_field', `Enter ${WORDS[key]}: it is needed ${why}.`);
  if (!needed && given) refuse('input.field_unknown', `Leave out ${WORDS[key]}: it is an input only ${why}.`);
  return given;
}

const conflict = (/** @type {string} */ message) => refuse('super_benefit_tax.fact_conflict', message);
export const min = (/** @type {bigint} */ a, /** @type {bigint} */ b) => (a < b ? a : b);
/** Cents times a rate in hundredths, half up to the cent. @param {bigint} cents @param {bigint} hundredths */
const atRate = (cents, hundredths) => ratioCents(cents * hundredths, 100n);
const RATE_TEXT = /** @type {Record<string, string>} */ ({ 0: '0', 15: '0.15', 20: '0.20', 30: '0.30', 45: '0.45' });

/** @typedef {{id: string, amount: bigint, rate: number}} SbtPart */
/** @typedef {{id: string, amount: number, rate: number, tax: number}} SbtShownPart */
/** In dollars: each component, each part with its ceiling rate (a percentage) and tax, the caps left
 * and counted where the treatment uses them, and the command's rates, ages and treatment as text.
 * @typedef {{treatment: string, taxFree: number, taxable: number, taxed: number, untaxed: number, parts: SbtShownPart[],
 *   caps: {lowRateCapLeft?: number, untaxedPlanCapLeft?: number, lowRateCapCounted?: number, untaxedPlanCapCounted?: number}, rates: Record<string, string>, assessable: number, notAssessable: number, maximumTax: number,
 *   age?: number, preservationAge?: number}} SbtWorked */

/** The input's keys, required fields and decimals, refused as the command's reader refuses them: the
 * required fields in the command's order, then the optional ones.
 * @param {Record<string, unknown>} input @param {string[]} required @param {string[]} optional */
export function read(input, required = REQUIRED, optional = OPTIONAL) {
  const unknown = Object.keys(input).find((key) => !required.includes(key) && !optional.includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an input of this calculator.`);
  /** @type {Record<string, bigint | null>} */
  const amounts = {};
  for (const key of [...required, ...optional]) {
    if (!Object.hasOwn(input, key)) {
      if (required.includes(key)) refuse('input.missing_field', `Enter ${new Map(Object.entries(WORDS)).get(key)}.`);
      continue;
    }
    if (DECIMALS.has(key)) amounts[key] = decimal(key, input[key]);
  }
  return amounts;
}

/** The income year and the payment date inside it. @param {Record<string, unknown>} input */
export function period(input) {
  if (input.scope_confirmed !== true) refuse('scope.not_confirmed', 'Confirm the facts the calculator takes as given.');
  const year = /** @type {string} */ (input.year);
  if (!SBT_YEARS.includes(year)) {
    refuse('period.unsupported', 'Choose an income year from 2020-21 to 2026-27; the untaxed plan cap for 2027-28 is not yet published.');
  }
  const paid = date('payment_date', input.payment_date);
  const first = Number(year.slice(0, 4));
  if (dayText(paid) < `${first}-07-01` || dayText(paid) > `${first + 1}-06-30`) conflict(`The payment date must fall in the ${year} income year.`);
  return { year, paid };
}

/** The income year, the payment date inside it and the components.
 * @param {Record<string, unknown>} input @param {Record<string, bigint | null>} amounts */
function components(input, amounts) {
  return { ...period(input), ...lumpSum(amounts) };
}

/** The lump sum's components (ss 307-125 and 307-275). @param {Record<string, bigint | null>} amounts */
export function lumpSum(amounts) {
  const [benefit, interest, interestFree, untaxed] = ['benefit', 'interest_value', 'interest_tax_free_component', 'untaxed_element']
    .map((key) => money(key, amounts[key]));
  if (benefit === 0n || interest === 0n) refuse('super_benefit_tax.benefit_nil', 'The lump sum and the value of the super interest must each be more than nil.');
  if (benefit > interest) conflict('The lump sum cannot exceed the value of the super interest it is paid from.');
  if (interestFree > interest) conflict('The interest’s tax free component cannot exceed its value.');
  const taxFree = ratioCents(benefit * interestFree, interest);
  const taxable = benefit - taxFree;
  if (untaxed > taxable) conflict('The element untaxed in the fund cannot exceed the taxable component the proportioning rule gives.');
  return { benefit, interest, c: { taxFree, taxable, taxed: taxable - untaxed, untaxed } };
}

/** The recipient's treatment, with a member's age and preservation age.
 * @param {Record<string, unknown>} input @param {{paid: number[], benefit: bigint, interest: bigint}} facts */
export function treatment(input, { paid, benefit, interest }) {
  const member = input.recipient === 'member';
  if (!member && input.recipient !== 'death_benefits_dependant' && input.recipient !== 'non_dependant') {
    refuse('super_benefit_tax.recipient_invalid', 'Choose who receives the benefit: the member, a death benefits dependant or a non-dependant.');
  }
  const why = 'for a member benefit';
  for (const key of ['date_of_birth', 'terminal_medical_condition', 'disability_superannuation_benefit']) when(member, input, key, why);
  if (!member) return { name: /** @type {string} */ (input.recipient) };
  if (flag('disability_superannuation_benefit', input.disability_superannuation_benefit)) {
    refuse('super_benefit_tax.disability_benefit', 'A disability superannuation benefit’s tax free component is increased under ITAA 1997 s 307-145 from the service days and days to retirement, which this calculator does not take.');
  }
  const born = date('date_of_birth', input.date_of_birth);
  if (dayText(born) >= dayText(paid)) conflict('The date of birth must be before the payment date.');
  const age = ageOn(born, paid);
  const preservation = preservationAge(born);
  const name = flag('terminal_medical_condition', input.terminal_medical_condition) ? 'terminal_medical_condition'
    : benefit < 20000n && benefit === interest ? 'under_200_closing_the_interest'
      : age >= 60 ? 'aged_60_or_over' : age >= preservation ? 'preservation_age_to_59' : 'under_preservation_age';
  return { name, age, preservation };
}

/** The year's cap less the amount used, refused above the cap.
 * @param {Record<string, unknown>} input @param {Record<string, bigint | null>} amounts @param {string} key @param {number} cap */
function capLeft(input, amounts, key, cap) {
  const used = money(key, amounts[key]);
  if (used > BigInt(cap) * 100n) conflict(`${WORDS[key][0].toUpperCase()}${WORDS[key].slice(1)} cannot exceed the year’s cap of $${cap.toLocaleString('en-AU')}.`);
  return BigInt(cap) * 100n - used;
}

/** @typedef {{lowRateCapLeft?: bigint, untaxedPlanCapLeft?: bigint, lowRateCapCounted?: bigint, untaxedPlanCapCounted?: bigint}} SbtCaps */

/** The parts, rates and caps one lump sum builds up, with the steps that add to them.
 * @param {Record<string, unknown>} input @param {Record<string, bigint | null>} amounts @param {string} year
 * @param {{taxed: bigint, untaxed: bigint}} c */
export function ledger(input, amounts, year, c) {
  /** @type {SbtPart[]} */
  const parts = [];
  /** @type {Record<string, string>} */
  const rates = {};
  /** @type {SbtCaps} */
  const caps = {};
  const part = (/** @type {string} */ id, /** @type {bigint} */ amount, /** @type {number} */ rate) => {
    parts.push({ id, amount, rate });
    rates[`${id}_rate`] = RATE_TEXT[rate];
  };
  /** The untaxed plan cap left (s 307-350), or null without an untaxed element. */
  const planLeft = () => {
    if (!when(c.untaxed !== 0n, input, 'untaxed_plan_cap_used', 'for a member benefit with an element untaxed in the fund')) return null;
    const cap = SBT_UNTAXED_PLAN_CAP[/** @type {keyof typeof SBT_UNTAXED_PLAN_CAP} */ (year)];
    rates.untaxed_plan_cap = String(cap);
    return (caps.untaxedPlanCapLeft = capLeft(input, amounts, 'untaxed_plan_cap_used', cap));
  };
  /** The untaxed element within the plan cap (with any share of the low rate cap) and above it.
   * @param {bigint} left @param {number} rate @param {bigint | null} lowLeft */
  const untaxedParts = (left, rate, lowLeft) => {
    const within = min(c.untaxed, left);
    const counted = lowLeft === null ? 0n : min(within, lowLeft);
    if (lowLeft !== null) part('untaxed_within_low_rate_cap', counted, 15);
    part('untaxed_within_plan_cap', within - counted, rate);
    part('untaxed_above_plan_cap', c.untaxed - within, 45);
    caps.untaxedPlanCapCounted = within;
    return counted;
  };
  return { parts, rates, caps, part, planLeft, untaxedParts };
}

/** A member taxed by age (ss 301-10 to 301-115), the low rate cap first used by the taxed element.
 * @param {ReturnType<typeof ledger>} l @param {Record<string, unknown>} input @param {Record<string, bigint | null>} amounts
 * @param {string} year @param {{taxed: bigint}} c @param {string} name */
export function memberParts(l, input, amounts, year, c, name) {
  const why = 'for a member at or above preservation age and under 60';
  const needed = name === 'preservation_age_to_59';
  const lowGiven = when(needed, input, 'low_rate_cap_used', why);
  const others = when(needed, input, 'other_lump_sums_this_year', why) && flag('other_lump_sums_this_year', input.other_lump_sums_this_year);
  const plan = l.planLeft();
  if (needed && lowGiven) {
    const cap = SBT_LOW_RATE_CAP[/** @type {keyof typeof SBT_LOW_RATE_CAP} */ (year)];
    l.rates.low_rate_cap = String(cap);
    const lowLeft = l.caps.lowRateCapLeft = capLeft(input, amounts, 'low_rate_cap_used', cap);
    if (others && lowLeft !== 0n) {
      refuse('super_benefit_tax.other_lump_sums_this_year', 'Other lump sums received in the same income year at or above preservation age and under 60 share the year’s low rate cap left, the taxed element first whatever the order of payment (ITAA 1997 ss 301-20(3) and 301-105(5) and (6)), which this calculator does not take; with none of the cap left they do not change the result.');
    }
    const low = min(c.taxed, lowLeft);
    l.part('taxed_within_low_rate_cap', low, 0);
    l.part('taxed_above_low_rate_cap', c.taxed - low, 15);
    l.caps.lowRateCapCounted = low + (plan === null ? 0n : l.untaxedParts(plan, 30, lowLeft - low));
  } else if (name === 'under_preservation_age') {
    l.part('taxed_element_part', c.taxed, 20);
    if (plan !== null) l.untaxedParts(plan, 30, null);
  } else if (plan !== null) l.untaxedParts(plan, 15, null);
}

/** A death benefit, or a member benefit the whole of which is tax free; refuses the caps it does not use.
 * @param {ReturnType<typeof ledger>} l @param {Record<string, unknown>} input @param {{taxed: bigint, untaxed: bigint}} c @param {string} name */
export function otherParts(l, input, c, name) {
  if (name === 'non_dependant') {
    l.part('taxed_element_part', c.taxed, 15);
    l.part('untaxed_element_part', c.untaxed, 30);
  } else if (name !== 'death_benefits_dependant') {
    const plan = l.planLeft();
    if (plan !== null) l.caps.untaxedPlanCapCounted = min(c.untaxed, plan);
  }
  if (name === 'death_benefits_dependant' || name === 'non_dependant') when(false, input, 'untaxed_plan_cap_used', 'for a member benefit');
  const why = 'for a member benefit taxed by age (not wholly tax free)';
  when(false, input, 'low_rate_cap_used', why);
  when(false, input, 'other_lump_sums_this_year', why);
}

export const MEMBER_BANDS = ['aged_60_or_over', 'preservation_age_to_59', 'under_preservation_age'];
export const inDollars = (/** @type {bigint} */ cents) => Number(cents) / 100;

/** Section 307-150's modification for service before 1 July 1983, which the command does not take, refused.
 * @param {Record<string, unknown>} input @param {{untaxed: bigint}} c */
export function refusePre1983(input, c) {
  if (when(c.untaxed !== 0n, input, 'service_before_july_1983', 'with an element untaxed in the fund')
    && flag('service_before_july_1983', input.service_before_july_1983)) {
    refuse('super_benefit_tax.pre_july_1983_service', 'An element untaxed in the fund that relates to service before 1 July 1983 moves part of it to the tax free component under ITAA 1997 s 307-150, which this calculator does not take.');
  }
}

/**
 * The tax on one superannuation lump sum, as the `super-benefit-tax` command works it.
 * @param {unknown} given the command's input, with decimal amounts as strings
 * @returns {SbtWorked}
 */
export function superBenefitTax(given) {
  if (typeof given !== 'object' || !given || Array.isArray(given)) refuse('input.not_object', 'The input is not an object.');
  const input = /** @type {Record<string, unknown>} */ (given);
  const amounts = read(input);
  const facts = components(input, amounts);
  const { year, c } = facts;
  const t = treatment(input, facts);
  refusePre1983(input, c);
  const l = ledger(input, amounts, year, c);
  const member = MEMBER_BANDS.includes(t.name);
  if (member) memberParts(l, input, amounts, year, c, t.name);
  else otherParts(l, input, c, t.name);
  const assessable = t.name === 'aged_60_or_over' ? c.untaxed : member || t.name === 'non_dependant' ? c.taxable : 0n;
  const maximum = l.parts.reduce((sum, p) => sum + atRate(p.amount, BigInt(p.rate)), 0n);
  if (t.age !== undefined) Object.assign(l.rates, { age: String(t.age), preservation_age: String(t.preservation) });
  return { treatment: t.name, taxFree: inDollars(c.taxFree), taxable: inDollars(c.taxable), taxed: inDollars(c.taxed), untaxed: inDollars(c.untaxed),
    parts: l.parts.map((p) => ({ id: p.id, amount: inDollars(p.amount), rate: p.rate, tax: inDollars(atRate(p.amount, BigInt(p.rate))) })),
    caps: /** @type {SbtWorked['caps']} */ (Object.fromEntries(Object.entries(l.caps).map(([k, v]) => [k, inDollars(v)]))), rates: l.rates,
    assessable: inDollars(assessable), notAssessable: inDollars(facts.benefit - assessable), maximumTax: inDollars(maximum),
    ...(t.age === undefined ? {} : { age: t.age, preservationAge: t.preservation }) };
}

export const PART_LABELS = /** @type {Record<string, string>} */ ({
  taxed_within_low_rate_cap: 'Taxed element within the low rate cap left',
  taxed_above_low_rate_cap: 'Taxed element above the low rate cap left',
  taxed_element_part: 'Taxed element',
  untaxed_within_low_rate_cap: 'Untaxed element within the low rate cap the taxed element left',
  untaxed_within_plan_cap: 'Untaxed element within the untaxed plan cap left',
  untaxed_above_plan_cap: 'Untaxed element above the untaxed plan cap left, at the top marginal rate',
  untaxed_element_part: 'Untaxed element',
});
export const TREATMENTS = /** @type {Record<string, string>} */ ({
  aged_60_or_over: '60 or over, so only the untaxed element is assessable (ss 301-10 and 301-95)',
  preservation_age_to_59: 'at or above preservation age and under 60 (ss 301-15, 301-20 and 301-105)',
  under_preservation_age: 'under preservation age (ss 301-30, 301-35 and 301-115)',
  terminal_medical_condition: 'a terminal medical condition makes the whole lump sum tax free (s 303-10)',
  under_200_closing_the_interest: 'under $200 and closing the interest, the whole lump sum is tax free (s 301-225)',
  death_benefits_dependant: 'A death benefit to a death benefits dependant is wholly tax free (s 302-60)',
  non_dependant: 'A death benefit to a non-dependant: the taxable component is assessable (ss 302-140 and 302-145)',
});

/** The command's input from the form. A member's date of birth, terminal medical condition and
 * disability answer go only with a member benefit; the pre-1983 service answer only with an
 * untaxed element; the caps only where the member's treatment uses them, worked out from the same
 * age and preservation age the calculation takes. A blank amount or answer where one is needed is
 * left out, so the calculation asks for it.
 * @param {(name: string) => string} value */
export function sbtFormInput(value) {
  const text = (/** @type {string} */ name) => value(name).trim();
  const yes = (/** @type {string} */ name) => (text(name) === '' ? undefined : text(name) === 'yes');
  /** @type {Record<string, unknown>} */
  const input = { benefit: text('benefit'), interest_value: text('interest'), interest_tax_free_component: text('interest-free'),
    untaxed_element: text('untaxed') === '' ? '0' : text('untaxed'), recipient: text('recipient'), payment_date: text('paid'),
    year: text('year'), scope_confirmed: true };
  const put = (/** @type {string} */ key, /** @type {unknown} */ given) => {
    if (given !== undefined && given !== '') input[key] = given;
  };
  const untaxed = Number(input.untaxed_element) !== 0;
  if (untaxed) put('service_before_july_1983', yes('service'));
  if (input.recipient !== 'member') return input;
  put('date_of_birth', text('born'));
  put('terminal_medical_condition', yes('terminal'));
  put('disability_superannuation_benefit', yes('disability'));
  const born = civil(text('born'));
  const paid = civil(text('paid'));
  const benefit = text('benefit');
  const whollyFree = yes('terminal') === true || (Number(benefit) === Number(text('interest')) && Number(benefit) < 200);
  if (born && paid && !whollyFree) {
    const age = ageOn(born, paid);
    if (age < 60 && age >= preservationAge(born)) {
      put('low_rate_cap_used', text('low-used'));
      put('other_lump_sums_this_year', yes('others'));
    }
  }
  if (untaxed) put('untaxed_plan_cap_used', text('plan-used'));
  return input;
}

export const plainDate = (/** @type {string} */ iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The inputs as the page states them. @param {Record<string, any>} input @param {(value: number) => string} aud */
export function sbtInputsText(input, aud) {
  const money = (/** @type {string} */ v) => aud(Number(v));
  const parts = [input.year, `${SBT_RECIPIENTS[/** @type {keyof typeof SBT_RECIPIENTS} */ (input.recipient)] ?? input.recipient}`,
    `paid ${plainDate(input.payment_date)}`, `lump sum ${money(input.benefit)} from an interest of ${money(input.interest_value)}`
      + ` with ${money(input.interest_tax_free_component)} tax free`, `untaxed element ${money(input.untaxed_element)}`];
  if (input.date_of_birth !== undefined) parts.push(`born ${plainDate(input.date_of_birth)}`);
  if (input.terminal_medical_condition) parts.push('terminal medical condition');
  if (input.service_before_july_1983 !== undefined) parts.push(input.service_before_july_1983 ? 'service before 1 July 1983' : 'no service before 1 July 1983');
  if (input.low_rate_cap_used !== undefined) parts.push(`low rate cap used ${money(input.low_rate_cap_used)}`);
  if (input.other_lump_sums_this_year !== undefined) parts.push(input.other_lump_sums_this_year ? 'other lump sums this year' : 'no other lump sums this year');
  if (input.untaxed_plan_cap_used !== undefined) parts.push(`untaxed plan cap used ${money(input.untaxed_plan_cap_used)}`);
  return parts.join('; ');
}

/** The page's result for the most tax: the components, each part's ceiling rate and tax, and the most tax.
 * @param {(name: string) => string} value @param {(value: number) => string} aud */
export function sbtTaxResult(value, aud) {
  const input = sbtFormInput(value);
  const r = superBenefitTax(input);
  const rows = [['Tax free component', aud(r.taxFree)], ['Taxable component: element taxed in the fund', aud(r.taxed)],
    ['Taxable component: element untaxed in the fund', aud(r.untaxed)]];
  for (const p of r.parts) {
    if (p.amount) rows.push([`${PART_LABELS[p.id]}, ${aud(p.amount)} at no more than ${p.rate}%`, aud(p.tax)]);
  }
  rows.push(['Assessable income', aud(r.assessable)], ['Not assessable income and not exempt income', aud(r.notAssessable)],
    ['Most income tax on the lump sum, before Medicare levy', aud(r.maximumTax)]);
  const principal = rows.length - 1;
  if (r.caps.lowRateCapCounted !== undefined) rows.push(['Low rate cap amount counted', aud(r.caps.lowRateCapCounted)]);
  if (r.caps.untaxedPlanCapCounted !== undefined) rows.push(['Untaxed plan cap amount counted', aud(r.caps.untaxedPlanCapCounted)]);
  const who = r.age === undefined ? '' : `Aged ${r.age} on the payment date, preservation age ${r.preservationAge}: `;
  return { inputs: sbtInputsText(input, aud), rows, principal, note: `${who}${TREATMENTS[r.treatment]}` };
}
