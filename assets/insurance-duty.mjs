// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Duty on one general insurance premium in any state or territory, for a contract effected or renewed in
// 2026-27: the `insurance-duty` command of ryanduguid/australian-accounting (main at 4df634b) ported line for
// line, with its inputs, rounding and refusal codes in the order the command checks them. Every rate was read
// on 24 November 2026 (New South Wales from Revenue NSW, its Act not being readable at the legislation site).

import { dateArg, field, flag, formatDay, money, parseDate, readFields, refuse, scope } from './aa-command.mjs';
import { cents, div, fromInput, lit, mul, quantize, text } from './aa-decimal.mjs';

export const INSURANCE_DUTY_YEARS = ['2026-27'];
export const INSURANCE_PLACES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'];
const PARAMS = /** @type {const} */ ([['jurisdiction', 'raw'], ['class', 'raw'], ['premium', 'dec'], ['effected_date', 'raw'], ['year', 'raw'],
  ['scope_confirmed', 'raw']]);
const OPTIONAL = /** @type {const} */ ([['term_over_one_year', 'raw'], ['policy_taken_out', 'raw']]);

/** Each class: its place, code, how it is charged ('percent', 'per_premium', 'abolished' from a date, or 'exempt_from' a date with the
 * rate before it), the page's label and the authority. */
export const INSURANCE_CLASSES = /** @type {[string, string, string[], string, string][]} */ ([
  ['nsw', 'type_a', ['percent', '9'], 'Type A: general insurance other than Type B or C',
    'Revenue NSW, ‘Types of insurance’: Type A, 9% of the premium (Duties Act 1997 (NSW) Chapter 8)'],
  ['nsw', 'type_b', ['percent', '5'], 'Type B: motor vehicle, aviation, disability income, occupational indemnity or health insurance',
    'Revenue NSW, ‘Types of insurance’: Type B, 5% of the premium'],
  ['nsw', 'type_c', ['exempt_from', '2018-01-01', '2.5'], 'Type C: crop and livestock insurance',
    'Revenue NSW, ‘Types of insurance’: Type C, 2.5% for a policy taken out on or before 31 December 2017, exempt from 1 January 2018'],
  ['vic', 'general', ['percent', '10'], 'General insurance other than business insurance', 'Duties Act 2000 (Vic) s 179(1): 10% of the premium'],
  ['vic', 'business', ['percent', '7'], 'Business insurance', 'Duties Act 2000 (Vic) ss 3(1) and 179(2) and (4): 7% for business insurance effected or '
    + 'renewed from 1 July 2026 to 30 June 2027'],
  ['qld', 'class_1', ['percent', '9'], 'Class 1 general insurance', 'Duties Act 2001 (Qld) s 362(1)(a): 9% of the premium'],
  ['qld', 'class_2', ['percent', '9'], 'Class 2 general insurance', 'Duties Act 2001 (Qld) s 362(1)(b): 9% of the premium'],
  ['qld', 'ctp', ['per_premium', '0.10'], 'CTP insurance', 'Duties Act 2001 (Qld) s 362(2): 10c on each CTP premium'],
  ['wa', 'general', ['percent', '10'], 'General insurance', 'Duties Act 2008 (WA) s 215: 10% of the premium or instalment'],
  ['sa', 'general', ['percent', '11'], 'Insurance other than life insurance', 'Stamp Duties Act 1923 (SA) s 34(1)(b): 11% of the premium'],
  ['tas', 'general', ['percent', '10'], 'General insurance', 'Duties Act 2001 (Tas) s 166: 10% of the premium'],
  ['act', 'general', ['abolished', '2017-07-01'], 'General insurance', 'Duties Act 1999 (ACT) chapter 8, omitted from 1 July 2017 by A2017-11 s 4: nil'],
  ['nt', 'general', ['percent', '10'], 'General insurance for one year or less', 'Stamp Duty Act 1978 (NT) Sch 1 cl 6(3): 10% of the premium for a '
    + 'policy issued or renewed for one year or less'],
]).map(([place, code, duty, label, authority]) => ({ place, code, duty, label, authority }));

/** @param {string} key @param {string} why @returns {never} */
const unknown = (key, why) => refuse('input.field_unknown', `${key} is an input only ${why}`);

/**
 * The duty on one premium, from the command's call.
 * @param {Record<string, unknown>} call
 * @returns {{year: string, amounts: {duty: string}, rates: Record<string, string>, authority: string, duty: number}}
 */
export function insuranceDuty(call) {
  const fields = readFields(call, 'insurance-duty', PARAMS, OPTIONAL);
  const year = scope(fields, INSURANCE_DUTY_YEARS);
  const value = (/** @type {string} */ key) => field(fields, key).value;
  const place = INSURANCE_PLACES.find((p) => p === value('jurisdiction'));
  if (!place) refuse('insurance_duty.jurisdiction_invalid', 'jurisdiction must be nsw, vic, qld, wa, sa, tas, act or nt.');
  const theirs = INSURANCE_CLASSES.filter((c) => c.place === place);
  const found = theirs.find((c) => c.code === value('class'));
  if (!found) {
    refuse('insurance_duty.class_invalid', `class in ${place} must be one of ${theirs.map((c) => c.code).join(', ')}; life insurance, Queensland `
      + 'accident insurance and CTP insurance outside Queensland are not worked.');
  }
  const first = Number(year.slice(0, 4));
  const day = dateArg(value('effected_date'), 'effected_date');
  if (day < Date.UTC(first, 6, 1) / 86400000 || day > Date.UTC(first + 1, 5, 30) / 86400000) {
    refuse('insurance_duty.date_outside_year', `effected_date must be in the ${year} financial year.`);
  }
  const term = fields.get('term_over_one_year');
  if (place === 'nt' && !term) refuse('input.missing_field', 'term_over_one_year is required in the Northern Territory.');
  if (place !== 'nt' && term) unknown('term_over_one_year', 'in the Northern Territory');
  if (term && flag(term.value, 'term_over_one_year')) {
    refuse('insurance_duty.term_unsettled', 'A Northern Territory policy for more than one year is charged 10% of the premium ‘for each year and any '
      + 'fractional part of a year in the term’ (Sch 1 cl 6(3)(b)(ii)); how that applies to a premium for the whole term is unsettled.');
  }
  const takenOut = fields.get('policy_taken_out');
  const needsDate = found.duty[0] === 'exempt_from';
  if (needsDate && !takenOut) refuse('input.missing_field', 'policy_taken_out is required for New South Wales Type C insurance.');
  if (!needsDate && takenOut) unknown('policy_taken_out', 'for New South Wales Type C insurance');
  const taken = takenOut ? dateArg(takenOut.value, 'policy_taken_out') : null;
  const premiumField = field(fields, 'premium');
  money(premiumField.dec);
  const premium = fromInput(/** @type {import('./aa-command.mjs').Dec} */ (premiumField.dec));
  /** @type {Record<string, string>} */
  const rates = {};
  const percent = (/** @type {string} */ r) => {
    const exact = div(mul(premium, lit(r)), lit('100'));
    Object.assign(rates, { rate_percent: r, exact_duty: text(exact) });
    return quantize(exact, -2, 'half_up');
  };
  let duty;
  const [kind, a, b] = found.duty;
  if (kind === 'percent') duty = percent(a);
  else if (kind === 'per_premium') {
    duty = lit(a);
    Object.assign(rates, { duty_per_premium: a, exact_duty: a });
  } else if (kind === 'abolished') {
    duty = percent('0');
    rates.abolished_from = a;
  } else {
    duty = percent(/** @type {number} */ (taken) < /** @type {number} */ (parseDate(a)) ? /** @type {string} */ (b) : '0');
    rates.exempt_from = a;
  }
  const shown = cents(duty);
  return { year, amounts: { duty: shown }, rates, authority: found.authority, duty: Number(shown) };
}

/** The form's input as the command's call. @param {(name: string) => string} value */
export function insuranceDutyFormInput(value) {
  const [jurisdiction, cls] = value('class').split('/');
  /** @type {Record<string, unknown>} */
  const call = { jurisdiction, class: cls, premium: value('premium'), effected_date: value('effected'), year: '2026-27', scope_confirmed: true };
  if (jurisdiction === 'nt') call.term_over_one_year = value('term') === 'yes';
  if (jurisdiction === 'nsw' && cls === 'type_c') call.policy_taken_out = value('taken');
  return call;
}

/** @param {Record<string, unknown>} x @param {(value: number) => string} aud */
export function insuranceDutyInputsText(x, aud) {
  const found = INSURANCE_CLASSES.find((c) => c.place === x.jurisdiction && c.code === x.class);
  return `${String(x.jurisdiction).toUpperCase()} ${found ? found.label.split(':')[0] : x.class}; premium ${aud(Number(x.premium))}; effected `
    + `${x.effected_date}${x.policy_taken_out ? `; policy taken out ${x.policy_taken_out}` : ''}`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function insuranceDutyResult(value, aud) {
  const input = insuranceDutyFormInput(value);
  const r = insuranceDuty(input);
  /** @type {[string, string][]} */
  const rows = [['Premium', aud(Number(input.premium))]];
  if (r.rates.rate_percent) rows.push(['Rate', `${r.rates.rate_percent}%`]);
  rows.push(['Insurance duty', aud(r.duty)]);
  const note = r.rates.abolished_from ? `${r.authority}; abolished from ${formatDay(/** @type {number} */ (parseDate(r.rates.abolished_from)))}`
    : r.authority;
  return { inputs: insuranceDutyInputsText(input, aud), rows, principal: rows.length - 1, note };
}
