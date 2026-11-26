// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The deductible amount of the undeducted purchase price of a foreign pension or annuity: ITAA 1936
// s 27H(2), A x (B - C) / D, or for 2025-26 the ATO's D11 shortcuts for a UK State Pension and a
// Dutch SVB pension. A port of the `foreign-pension-upp` command of ryanduguid/australian-accounting,
// checked against it on every case of its differential fixture.

import {
  amountsOf, callFields, cmp, div, dollars, exact, exactText, flag, min, money, mul, positiveDecimal, refuse, sub, yearOf,
} from './command-args.mjs';
import { formAmount, formMoney } from './form-amount.mjs';

export const FOREIGN_PENSION_YEARS = Array.from({ length: 20 }, (_, i) => `${2007 + i}-${String(8 + i).padStart(2, '0').slice(-2)}`);
export const FOREIGN_PENSION_METHODS = ['formula', 'uk_state_pension', 'dutch_svb_fallback'];
const OPTIONAL = ['undeducted_purchase_price', 'residual_capital_value', 'relevant_number', 'total_annuity_derived', 'commuted', 'whole_year', 'uk_category'];
const NEEDS = new Map([
  ['formula', ['undeducted_purchase_price', 'residual_capital_value', 'relevant_number', 'commuted', 'whole_year']],
  ['uk_state_pension', ['uk_category']],
  ['dutch_svb_fallback', []],
]);
const DETERMINATION = 'Request a determination (NAT 16543).';

/** Each input the method needs is given, and no other (total_annuity_derived is optional for the formula). */
function checkGiven(/** @type {Map<string, unknown>} */ input, /** @type {string} */ method) {
  const needs = /** @type {string[]} */ (NEEDS.get(method));
  for (const key of OPTIONAL) {
    const optional = key === 'total_annuity_derived' && method === 'formula';
    if (needs.includes(key) && !input.has(key)) refuse('input.missing_field', `${key} is required for method ${method}`);
    if (!needs.includes(key) && !optional && input.has(key)) refuse('input.field_unknown', `${key} is not an input of foreign-pension-upp with method ${method}`);
  }
}

/** s 27H(4) 'relevant number': a term of years certain or a life expectation factor. @param {unknown} value */
function relevantNumber(value) {
  const bad = () => refuse('foreign_pension_upp.relevant_number_invalid', 'Enter the relevant number as a term of years certain or a life expectation factor above 0. For any other annuity the Commissioner sets it: request a determination (NAT 16543).');
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return bad();
  const fields = new Map(Object.entries(value));
  if ([...fields.keys()].some((key) => key !== 'basis' && key !== 'years')) return bad();
  const basis = fields.get('basis');
  if (basis !== 'term_years' && basis !== 'life_expectation_factor') return bad();
  const years = positiveDecimal(fields.get('years'));
  return years ? { basis, years } : bad();
}

/** s 27H(4) 'relevant share': whole dollars of yours over whole dollars of the whole annuity. */
function relevantShare(/** @type {import('./command-args.mjs').Exact} */ own, /** @type {unknown} */ total) {
  if (total === undefined) return exact(1n);
  const whole = dollars(money(total), false);
  const mine = dollars(own, false);
  if (cmp(whole, mine) < 0 || whole.n === 0n) {
    refuse('foreign_pension_upp.share_invalid', 'Enter the whole annuity shared as at least your part and at least $1 (s 27H(4) ‘relevant share’).');
  }
  return div(mine, whole);
}

/** s 27H(2), A x (B - C) / D, with its rates. */
function formula(/** @type {Map<string, unknown>} */ input, /** @type {import('./command-args.mjs').Exact} */ annuity) {
  if (flag(input.get('commuted'), 'commuted')) refuse('foreign_pension_upp.commuted', `Part of the annuity has been commuted: s 27H(3A) reduces the deductible amount by what the Commissioner considers appropriate. ${DETERMINATION}`);
  if (!flag(input.get('whole_year'), 'whole_year')) refuse('foreign_pension_upp.part_year', `The annuity was not paid for the whole income year: s 27H(2) gives no rule for part of a year. ${DETERMINATION}`);
  const price = money(input.get('undeducted_purchase_price'));
  const residual = money(input.get('residual_capital_value'));
  if (cmp(residual, price) > 0) refuse('foreign_pension_upp.residual_exceeds_price', 'The residual capital value cannot be more than the undeducted purchase price.');
  const { basis, years } = relevantNumber(input.get('relevant_number'));
  const share = relevantShare(annuity, input.get('total_annuity_derived'));
  return { value: div(mul(share, sub(price, residual)), years), rates: { relevant_share: exactText(share), relevant_number: exactText(years), relevant_number_basis: basis } };
}

/** The ATO's D11 shortcut for a UK State Pension. */
function ukPension(/** @type {unknown} */ category, /** @type {import('./command-args.mjs').Exact} */ annuity) {
  const rate = category === 'a' || category === 'b_widow' ? exact(8n, 100n) : category === 'c' || category === 'd' ? exact(0n) : null;
  if (!rate) return refuse('foreign_pension_upp.uk_category_invalid', 'Choose the UK State Pension category: A, B (widow’s), C or D.');
  return { value: mul(annuity, rate), rates: { uk_rate: rate.n === 0n ? '0' : '0.08' } };
}

/**
 * The command's result: { period, amounts, rates }, each amount to the cent.
 * @param {unknown} given the command's JSON input
 */
export function foreignPensionUpp(given) {
  const input = callFields(given, 'foreign-pension-upp', ['method', 'annuity_derived', 'year', 'scope_confirmed'], OPTIONAL,
    ['annuity_derived', 'undeducted_purchase_price', 'residual_capital_value', 'total_annuity_derived']);
  const year = yearOf(input, FOREIGN_PENSION_YEARS);
  const method = input.get('method');
  if (typeof method !== 'string' || !FOREIGN_PENSION_METHODS.includes(method)) refuse('foreign_pension_upp.method_invalid', 'Choose the method: the s 27H formula, a UK State Pension or a Dutch SVB pension.');
  const annuity = money(input.get('annuity_derived'));
  checkGiven(input, method);
  if (method !== 'formula' && year !== '2025-26') refuse('foreign_pension_upp.method_year_unsupported', `The UK and Dutch shortcuts follow the ATO's 2026 D11 instructions, read for 2025-26 only; use the s 27H formula for ${year}.`);
  const first = method === 'formula' ? formula(input, annuity)
    : method === 'uk_state_pension' ? ukPension(input.get('uk_category'), annuity)
      : { value: mul(annuity, exact(1n, 4n)), rates: {} };
  const excluded = min(first.value, annuity);
  return {
    period: year,
    amounts: amountsOf([['deductible_amount', first.value], ['excluded_amount', excluded], ['assessable_amount', sub(annuity, excluded)]]),
    rates: { method, ...first.rates },
  };
}

/** The command's input from the page's form. @param {(name: string) => string} value */
export function foreignPensionFormInput(value) {
  const method = value('method');
  const base = { method, year: value('year'), scope_confirmed: true, annuity_derived: formAmount(value('annuity'), 'the pension or annuity you received in the year') };
  if (method === 'uk_state_pension') return { ...base, uk_category: value('uk-category') };
  if (method !== 'formula') return base;
  const total = value('total').trim();
  return {
    ...base,
    undeducted_purchase_price: formAmount(value('price'), 'the undeducted purchase price'),
    residual_capital_value: formAmount(value('residual'), 'the residual capital value'),
    relevant_number: { basis: value('basis'), years: value('years').trim() },
    commuted: value('commuted') === 'yes', whole_year: value('whole-year') === 'yes',
    ...(total === '' ? {} : { total_annuity_derived: formAmount(total, 'the whole annuity shared') }),
  };
}

const METHOD_WORDS = new Map([['formula', 's 27H formula'], ['uk_state_pension', 'UK State Pension, 2025-26 instructions'], ['dutch_svb_fallback', 'Dutch SVB pension, 2025-26 instructions']]);

/** The page's result. @param {(name: string) => string} value */
export function foreignPensionResult(value) {
  const input = foreignPensionFormInput(value);
  const r = foreignPensionUpp(input);
  const a = r.amounts;
  const rows = [['Deductible amount', formMoney(a.deductible_amount)], ['Excluded from assessable income', formMoney(a.excluded_amount)],
    ['Assessable foreign pension or annuity', formMoney(a.assessable_amount)]];
  const note = r.rates.relevant_number === undefined ? `${METHOD_WORDS.get(r.rates.method)}: deductible rate ${r.rates.uk_rate === undefined ? '25%' : r.rates.uk_rate === '0' ? 'nil' : '8%'}`
    : `Relevant share ${r.rates.relevant_share} × (price less residual value) ÷ relevant number ${r.rates.relevant_number}`;
  return { inputs: `${r.period}; ${METHOD_WORDS.get(r.rates.method)}; received ${formMoney(input.annuity_derived)}`, rows, principal: 1, note };
}
