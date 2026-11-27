// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Annual and long service leave provisions under AASB 119, split current and non-current under AASB 101 para 69:
// the `leave-provisions` command of ryanduguid/australian-accounting ported line for line (its inputs, 40-digit
// arithmetic, rounding and refusal codes, in the order it checks them). The command read the AASB 119
// compilations of December 2022 and the AASB 101 compilations of March 2020 to December 2022 on 23 November 2026.
// A short-term line is undiscounted (AASB 119 paras 11, 13 and 16); an other long-term line is projected with
// salary growth, weighted by the probability of payment and discounted (paras 67, 68, 72, 83 to 87 and 155).

import { useFraction, usePercent } from './instant-asset-write-off.mjs';

export const LEAVE_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
export const LEAVE_ROWS = 3;
const FIELDS = ['lines', 'defined_benefit_plan', 'plan_assets', 'year', 'scope_confirmed'];
const SHORT = ['label', 'leave', 'hours', 'hourly_rate', 'probability', 'settled_within_12_months'];
const LONG = ['years_to_settlement', 'salary_growth', 'discount_rate', 'can_defer_settlement'];
const MOST = 500;
const MOST_YEARS = 50;
/** The command's working precision: 40 significant digits, half-even. */
const PRECISION = 40;

export const LEAVE_DEFINED_BENEFIT = 'A defined benefit plan or other post-employment benefit is measured under AASB 119 paras 26 to 152, which this worksheet does not apply.';
export const LEAVE_ASSUMPTIONS = "The discount rate, salary growth, probabilities, settlement expectations and rights to defer are the preparer's stated assumptions and judgements (AASB 119 paras 75 to 87; AASB 101 para 69); the worksheet applies them and does not test them.";
export const LEAVE_PLAN_ASSETS = 'Plan assets and reimbursement rights for other long-term benefits follow AASB 119 paras 113 to 119 (through para 155), which this worksheet does not apply.';

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** @param {string} why @returns {never} */
const invalid = (why) => refuse('leave_provisions.line_invalid', why);

/** @typedef {{c: bigint, e: number}} Dec A non-negative decimal: coefficient times 10 to the exponent. */

const digits = (/** @type {bigint} */ c) => c.toString().length;
const pow10 = (/** @type {number} */ n) => 10n ** BigInt(n);

/** `c` times 10^`e` rounded half-even to 40 significant digits; `sticky` marks a non-zero remainder already dropped.
 * @param {bigint} c @param {number} e @param {boolean} [sticky] @returns {Dec} */
function round(c, e, sticky = false) {
  const drop = digits(c) - PRECISION;
  if (drop <= 0) return { c, e };
  const unit = pow10(drop);
  let q = c / unit;
  const twice = 2n * (c % unit);
  if (twice > unit || (twice === unit && (sticky || q % 2n === 1n))) q += 1n;
  if (digits(q) > PRECISION) return { c: q / 10n, e: e + drop + 1 };
  return { c: q, e: e + drop };
}

const add = (/** @type {Dec} */ a, /** @type {Dec} */ b) => {
  const e = Math.min(a.e, b.e);
  return round(a.c * pow10(a.e - e) + b.c * pow10(b.e - e), e);
};
const mul = (/** @type {Dec} */ a, /** @type {Dec} */ b) => round(a.c * b.c, a.e + b.e);
/** `a / b`, correctly rounded to 40 digits. @param {Dec} a @param {Dec} b */
function div(a, b) {
  if (a.c === 0n) return { c: 0n, e: a.e - b.e };
  const shift = Math.max(0, PRECISION + 2 + digits(b.c) - digits(a.c));
  const n = a.c * pow10(shift);
  return round(n / b.c, a.e - b.e - shift, n % b.c !== 0n);
}
const ONE = { c: 1n, e: 0 };

/** `(1 + rate)` to the power `years`, each product rounded as the command's loop rounds it. @param {Dec} rate @param {number} years */
function compound(rate, years) {
  const factor = add(ONE, rate);
  let out = ONE;
  for (let i = 0; i < years; i += 1) out = mul(out, factor);
  return out;
}

/** Cents, rounded half-up; the command's quantize refuses a result of more than 40 digits. @param {Dec} v @returns {bigint} */
function cents(v) {
  let out;
  if (v.e >= -2) out = v.c * pow10(v.e + 2);
  else {
    const unit = pow10(-2 - v.e);
    out = v.c / unit + (2n * (v.c % unit) >= unit ? 1n : 0n);
  }
  if (digits(out) > PRECISION) refuse('decimal.InvalidOperation', 'The amounts are too large to work out to 40 significant digits.');
  return out;
}

/** A typed decimal input as the command reads one: digits, an optional point with digits after it, no exponent.
 * @param {unknown} value @returns {Dec | null} */
function decimal(value) {
  if (typeof value !== 'string') return null;
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim()); // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!parts) return null;
  const c = BigInt(parts[2] + (parts[3] ?? ''));
  return { c: parts[1] && c !== 0n ? -c : c, e: -(parts[3] ?? '').length };
}

/** @param {Record<string, unknown>} fields @param {string} key @param {number} n */
function unit(fields, key, n) {
  const v = decimal(fields[key]); // eslint-disable-line security/detect-object-injection -- key comes from this module's own field lists
  if (v && v.e >= -6 && v.c >= 0n && v.c <= pow10(-v.e)) return v;
  return invalid(`line ${n}: ${key} must be a decimal string from 0 to 1, at most 6 places.`);
}

/** @param {Record<string, unknown>} fields @param {string} key @param {number} n */
function amount(fields, key, n) {
  const v = decimal(fields[key]); // eslint-disable-line security/detect-object-injection -- key comes from this module's own field lists
  if (v && v.e >= -2 && v.c >= 0n && v.c <= pow10(12 - v.e)) return v;
  return invalid(`line ${n}: ${key} must be a finite non-negative decimal string, at most 2dp and 1e12.`);
}

/** @param {Record<string, unknown>} fields @param {string} key @param {number} n */
function boolean(fields, key, n) {
  const v = fields[key]; // eslint-disable-line security/detect-object-injection -- key comes from this module's own field lists
  return typeof v === 'boolean' ? v : invalid(`line ${n}: ${key} must be a boolean.`);
}

/** @typedef {{label: string, longService: boolean, hours: Dec, rate: Dec, probability: Dec,
 *   longTerm: {years: number, growth: Dec, discount: Dec, canDefer: boolean} | null}} Line */

/** One line, read in the command's order. @param {number} n @param {unknown} value @returns {Line} */
function line(n, value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid(`line ${n} must be an object.`);
  const fields = /** @type {Record<string, unknown>} */ (value);
  // The first unknown key in code unit order, as the command's sorted map reports it.
  const extra = Object.keys(fields).filter((k) => !SHORT.includes(k) && !LONG.includes(k))
    .reduce((/** @type {string | undefined} */ first, k) => (first === undefined || k < first ? k : first), undefined);
  if (extra !== undefined) invalid(`line ${n}: ${extra} is not a field of a line.`);
  const shortTerm = boolean(fields, 'settled_within_12_months', n);
  const longKey = shortTerm ? LONG.find((k) => Object.hasOwn(fields, k)) : undefined;
  if (longKey !== undefined) {
    invalid(`line ${n}: ${longKey} is for a line not expected to be settled wholly within 12 months; a short-term line is undiscounted (AASB 119 para 11).`);
  }
  const label = fields.label;
  if (typeof label !== 'string' || !label.trim() || [...label].length > 200) invalid(`line ${n}: label must be a non-empty string of at most 200 characters.`);
  if (fields.leave !== 'annual' && fields.leave !== 'long_service') {
    invalid(`line ${n}: leave must be annual or long_service; sick, parental, jury and military service leave, long-term disability and termination benefits are outside this worksheet (AASB 119 paras 17, 18, 157 and 159).`);
  }
  const hours = amount(fields, 'hours', n);
  const rate = amount(fields, 'hourly_rate', n);
  const probability = unit(fields, 'probability', n);
  let longTerm = null;
  if (!shortTerm) {
    const years = fields.years_to_settlement;
    if (typeof years !== 'number' || !Number.isInteger(years) || years < 1 || years > MOST_YEARS) {
      invalid(`line ${n}: years_to_settlement must be a whole number from 1 to ${MOST_YEARS}; the part of a long-term benefit expected within 12 months stays long-term (AASB 119 para 8) at 1 year, the nearest whole year this worksheet takes.`);
    }
    longTerm = { years: /** @type {number} */ (years), growth: unit(fields, 'salary_growth', n), discount: unit(fields, 'discount_rate', n), canDefer: boolean(fields, 'can_defer_settlement', n) };
  }
  return { label: /** @type {string} */ (label), longService: fields.leave === 'long_service', hours, rate, probability, longTerm };
}

/** One line's amounts in cents (AASB 119 paras 11 and 16, or 155, 67, 68, 72 and 83 to 87; AASB 101 para 69).
 * @param {Line} l */
function measure(l) {
  const value = mul(l.hours, l.rate);
  if (!l.longTerm) return { value: cents(value), projected: null, provision: cents(mul(value, l.probability)), current: true };
  const projected = mul(value, compound(l.longTerm.growth, l.longTerm.years));
  const provision = div(mul(projected, l.probability), compound(l.longTerm.discount, l.longTerm.years));
  return { value: cents(value), projected: cents(projected), provision: cents(provision), current: !l.longTerm.canDefer };
}

const text = (/** @type {bigint} */ c) => `${c / 100n}.${String(c % 100n).padStart(2, '0')}`;

/** @typedef {{label: string, leave: string, category: string, value_at_current_rate: string, projected_value?: string,
 *   provision: string, classification: string}} LeaveLine */
/** @typedef {{year: string, amounts: Record<string, string>, rates: Record<string, string>, lines: LeaveLine[], warnings: string[],
 *   annual: number, longService: number, total: number, current: number, nonCurrent: number}} LeaveResult */

/**
 * Annual and long service leave provisions for one entity at one reporting date.
 * @param {Record<string, unknown>} input the command's input, with decimal amounts as strings
 * @returns {LeaveResult}
 */
export function leaveProvisions(input) {
  const extra = Object.keys(input).find((key) => !FIELDS.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not an input of leave-provisions.`);
  for (const key of FIELDS) if (!Object.hasOwn(input, key)) refuse('input.missing_field', `${key} is required.`);
  if (input.scope_confirmed !== true) refuse('scope.not_confirmed', 'Confirm the facts the calculator takes as given.');
  const year = /** @type {string} */ (input.year);
  if (!LEAVE_YEARS.includes(year)) refuse('period.unsupported', `Choose a year from ${LEAVE_YEARS[0]} to ${LEAVE_YEARS.at(-1)}.`);
  for (const [key, code, why] of [['defined_benefit_plan', 'leave_provisions.defined_benefit_plan', LEAVE_DEFINED_BENEFIT],
    ['plan_assets', 'leave_provisions.plan_assets', LEAVE_PLAN_ASSETS]]) {
    if (typeof input[key] !== 'boolean') refuse('input.flag_invalid', `${key} must be a boolean.`); // eslint-disable-line security/detect-object-injection -- key comes from this module's own list
    if (input[key]) refuse(code, why); // eslint-disable-line security/detect-object-injection -- key comes from this module's own list
  }
  const given = input.lines;
  if (!Array.isArray(given) || given.length === 0 || given.length > MOST) invalid(`lines must be a list of 1 to ${MOST} objects.`);
  const list = /** @type {unknown[]} */ (given);
  const all = list.map((v, i) => line(i + 1, v));
  const measured = all.map(measure);
  /** @param {(i: number) => boolean} keep @returns {bigint} */
  const sum = (keep) => measured.reduce((/** @type {bigint} */ t, m, i) => (keep(i) ? t + m.provision : t), 0n);
  const annual = sum((i) => !all[i].longService); // eslint-disable-line security/detect-object-injection -- i indexes the lines
  const longService = sum((i) => all[i].longService); // eslint-disable-line security/detect-object-injection -- i indexes the lines
  const total = annual + longService;
  const current = sum((i) => measured[i].current); // eslint-disable-line security/detect-object-injection -- i indexes the lines
  const nonCurrent = total - current;
  const lines = all.map((l, i) => {
    const m = measured[i]; // eslint-disable-line security/detect-object-injection -- i indexes the lines
    return { label: l.label, leave: l.longService ? 'long_service' : 'annual', category: l.longTerm ? 'other_long_term' : 'short_term',
      value_at_current_rate: text(m.value), ...(m.projected !== null ? { projected_value: text(m.projected) } : {}),
      provision: text(m.provision), classification: m.current ? 'current' : 'non_current' };
  });
  return { year, amounts: { annual_leave_provision: text(annual), long_service_leave_provision: text(longService), total_provision: text(total),
    current_provision: text(current), non_current_provision: text(nonCurrent) }, rates: {}, lines, warnings: [LEAVE_ASSUMPTIONS],
  annual: Number(annual) / 100, longService: Number(longService) / 100, total: Number(total) / 100, current: Number(current) / 100,
  nonCurrent: Number(nonCurrent) / 100 };
}

/** The command's input from the form: a line with neither a name nor hours is left out. @param {(name: string) => string} value */
export function leaveFormInput(value) {
  const lines = [];
  for (let n = 1; n <= LEAVE_ROWS; n += 1) {
    const field = (/** @type {string} */ name) => value(`line-${n}-${name}`);
    if (!field('label').trim() && !field('hours').trim()) continue;
    const short = field('settled') === 'yes';
    /** @type {Record<string, unknown>} */
    const line = { label: field('label'), leave: field('leave'), hours: field('hours').trim(), hourly_rate: field('rate').trim(),
      probability: useFraction(field('probability')), settled_within_12_months: short };
    if (!short) {
      Object.assign(line, { years_to_settlement: Number(field('years')), salary_growth: useFraction(field('growth')),
        discount_rate: useFraction(field('discount')), can_defer_settlement: field('defer') === 'yes' });
    }
    lines.push(line);
  }
  return { lines, defined_benefit_plan: false, plan_assets: false, year: value('year'), scope_confirmed: true };
}

/** The inputs as the page states them. @param {Record<string, any>} x @param {(value: number) => string} aud */
export function leaveInputsText(x, aud) {
  const lines = Array.isArray(x.lines) ? x.lines.map((/** @type {Record<string, any>} */ l) => `${l.label}: ${l.leave === 'long_service' ? 'long service' : 'annual'} leave, `
    + `${Number(l.hours).toLocaleString('en-AU', { maximumFractionDigits: 2 })} hours at ${aud(Number(l.hourly_rate))}, probability ${usePercent(l.probability)}, `
    + (l.settled_within_12_months ? 'settled within 12 months'
      : `settled in ${l.years_to_settlement} years, salary growth ${usePercent(l.salary_growth)}, discount rate ${usePercent(l.discount_rate)}, `
        + `${l.can_defer_settlement ? 'can defer' : 'cannot defer'} settlement`)) : [];
  return `${x.year}; ${lines.join('; ')}`;
}

/** The page's result: the provisions, their split and each line. @param {(name: string) => string} value
 * @param {(value: number) => string} aud */
export function leaveProvisionsResult(value, aud) {
  const input = leaveFormInput(value);
  const r = leaveProvisions(input);
  const rows = [['Annual leave provision', aud(r.annual)], ['Long service leave provision', aud(r.longService)],
    ['Total leave provisions', aud(r.total)], ['Current (AASB 101 para 69)', aud(r.current)], ['Non-current', aud(r.nonCurrent)]];
  const lines = r.lines.map((l) => `${l.label}: ${l.category === 'short_term' ? 'short-term' : 'other long-term'}, `
    + `${l.classification === 'current' ? 'current' : 'non-current'}, ${aud(Number(l.provision))}`);
  return { inputs: leaveInputsText(input, aud), rows, principal: 2, note: [...lines, r.warnings[0].replace(/\.$/, '')].join('. ') };
}
