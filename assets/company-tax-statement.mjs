// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// A company's return from taxable income to the amount due or refundable, for 2020-21 to 2026-27: the
// `company-tax-statement` command of ryanduguid/australian-accounting (packages/the-exchequer-tally) ported line for
// line, with its order of checks, rounding and output. Prior-year losses are deducted only where the stated
// continuity of ownership or business continuity outcome allows (ITAA 1997 ss 165-10 to 165-15, 165-210, 165-211),
// oldest first (s 36-17(7)); net exempt income absorbs them first (s 36-17(2) to (4)); a tax loss is worked out under
// s 36-10. Offsets follow the Company tax return 2026 instructions' calculation statement (labels A to S). The loss
// carry back tax offset (Division 160) is worked for the claim years the law gives it: 2020-21 to 2022-23 under
// Division 160 as in force to 30 June 2026, and 2026-27 under the Division 160 that Treasury Laws Amendment (Tax
// Reform No. 2) Act 2026 Sch 1 substituted for income years from 1 July 2026. 2023-24 to 2025-26 have no offset.
// Rates: Income Tax Rates Act 1986 ss 23(2), 23AA and 23AB. Read 26 November 2026. Amounts are whole cents; the
// command's 28-digit context never rounds an amount it accepts, and an amount of more than 28 digits is refused.

import { stripSpace } from './gst-adjustments.mjs';

/** @param {string} reason @param {string} provision */
const refuse = (reason, provision) => new Error(`refused: ${reason} (${provision})`);
/** @param {string} message @returns {never} */
function fail(message) {
  throw new Error(message);
}


/** @typedef {{c: bigint, e: number} | null} Exact A finite decimal, coefficient times 10 to the exponent; null when not finite. */

/** Python's Decimal of a string, finite or not. @param {string} text
 * @returns {{c: bigint, e: number, negative: boolean, digits: number} | null | undefined} undefined when unreadable */
function parse(text) {
  const t = stripSpace(text).replaceAll('_', '');
  if (/^[+-]?(inf|infinity|s?nan\d*)$/i.test(t)) return null;
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(t); // eslint-disable-line security/detect-unsafe-regex -- anchored; each group takes a distinct character class
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return undefined;
  const fraction = m[3] ?? '';
  const exponent = Number(m[4] ?? '0') - fraction.length;
  const c = BigInt(`${m[2]}${fraction}` || '0');
  return { c: m[1] === '-' ? -c : c, e: exponent, negative: m[1] === '-', digits: (`${m[2]}${fraction}`.replace(/^0+(?=\d)/, '') || '0').length };
}

/** @param {Record<string, unknown>} v @param {string} key */
function text(v, key) {
  const value = v[key]; // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
  if (typeof value !== 'string') fail(`${key} must be a string`);
  return value;
}
/** @param {Record<string, unknown>} v @param {string} key */
function number(v, key) {
  const value = v[key]; // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(`${key} must be an integer`);
  return value;
}
/** A decimal input as the command reads it. @param {Record<string, unknown>} v @param {string} key */
function decimal(v, key) {
  const t = text(v, key);
  if (new TextEncoder().encode(t).length > 8192) fail(`${key}: decimal input exceeds 8192 bytes`);
  const x = parse(t);
  if (x === undefined) fail(`${key}: not a decimal amount`);
  if (x !== null) {
    const adjusted = x.e + /** @type {{digits: number}} */ (/** @type {unknown} */ (x)).digits - 1;
    if (Math.abs(x.e) > 10000 || Math.abs(adjusted) > 10000) fail(`${key}: decimal exponent or adjusted exponent exceeds 10000`);
  }
  return x;
}
const isNull = (/** @type {unknown} */ value) => value === undefined || value === null;

/** A non-negative amount in whole cents; omitted or null is nil. @param {Record<string, unknown>} v @param {string} key */
function money(v, key) {
  if (isNull(v[key])) return 0n; // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
  const x = decimal(v, key);
  /** @returns {never} */
  function bad() {
    return fail(`${key} must be a non-negative amount with at most 2 decimal places`);
  }
  if (x === null || x.c < 0n) bad();
  let c;
  if (x.e >= -2) c = x.c * 10n ** BigInt(x.e + 2);
  else {
    const divisor = 10n ** BigInt(-2 - x.e);
    if (x.c % divisor !== 0n) bad();
    c = x.c / divisor;
  }
  if (c.toString().length > 28) fail('decimal.InvalidOperation');
  return c;
}
/** @param {Record<string, unknown>} v @param {string} key */
function flag(v, key) {
  const value = v[key]; // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
  if (isNull(value)) return false;
  if (typeof value !== 'boolean') fail(`${key} must be a boolean`);
  return value;
}
/** @param {Record<string, unknown>} v @param {string} key @returns {unknown[]} */
function array(v, key) {
  if (!Object.hasOwn(v, key)) return [];
  const value = v[key]; // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
  if (!Array.isArray(value)) fail(`${key} must be an array`);
  return value;
}
/** @param {unknown} value @returns {Record<string, unknown>} */
const object = (value) => /** @type {Record<string, unknown>} */ (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {});

const floor = (/** @type {bigint} */ x) => (x < 0n ? 0n : x);
const least = (/** @type {bigint} */ a, /** @type {bigint} */ b) => (b < a ? b : a);
/** Cents as the command writes them. @param {bigint} x */
const amount = (x) => `${x < 0n ? '-' : ''}${(x < 0n ? -x : x) / 100n}.${String((x < 0n ? -x : x) % 100n).padStart(2, '0')}`;
/** cents times thousandths, half up to the cent. @param {bigint} c @param {bigint} rate */
const times = (c, rate) => (2n * c * rate + 1000n) / 2000n;

/** Exact comparison of a finite decimal with an integer of dollars scaled by 10^k. @param {{c: bigint, e: number}} x @param {bigint} c @param {number} e */
function compare(x, c, e) {
  const m = Math.min(x.e, e);
  const a = x.c * 10n ** BigInt(x.e - m);
  const b = c * 10n ** BigInt(e - m);
  return a < b ? -1 : a > b ? 1 : 0;
}
/** Python's str of a finite decimal input, for a message. @param {{c: bigint, e: number}} x */
const show = (x) => {
  if (x.e >= 0) return `${x.c}${x.e ? `E+${x.e}` : ''}`;
  const s = (x.c < 0n ? -x.c : x.c).toString().padStart(-x.e + 1, '0');
  return `${x.c < 0n ? '-' : ''}${s.slice(0, s.length + x.e)}.${s.slice(s.length + x.e)}`;
};

/**
 * @typedef {{fy: number, turnover: {c: bigint, e: number}, bre: boolean, rate: bigint, rateText: string}} Rate
 */

/** Income Tax Rates Act 1986 ss 23(2), 23AA, 23AB: the `corporate-tax` rate for a year's three facts.
 * @param {Record<string, unknown>} v @param {number} fy @returns {Rate & {json: Record<string, unknown>}} */
function corporateTax(v, fy) {
  const facts = /** @type {const} */ (['aggregated_turnover', 'assessable_income', 'passive_income']).map((key) => decimal(v, key));
  facts.forEach((x, k) => {
    if (x === null || x.c < 0n) fail(`${['aggregated_turnover', 'assessable_income', 'passive_income'][k]} must be a non-negative finite amount, got ${x === null ? 'a value that is not finite' : show(x)}`); // eslint-disable-line security/detect-object-injection -- k indexes a 3-element list
  });
  const [turnover, assessable, passive] = /** @type {{c: bigint, e: number}[]} */ (facts);
  const gt = (/** @type {{c: bigint, e: number}} */ a, /** @type {{c: bigint, e: number}} */ b) => compare(a, b.c, b.e) > 0;
  if (gt(passive, assessable)) fail('passive_income must not exceed assessable_income');
  if (fy < 2018 || fy > 2027) fail(`No legislated company-rate table exists for FY${fy}`);
  const threshold = fy === 2018 ? 25000000n : 50000000n;
  let bre = false;
  if (compare(turnover, threshold, 0) < 0) {
    if (compare(assessable, 0n, 0) <= 0) fail(`FY${fy}: base rate entity status is not determinable because there is no assessable income to run the s 23AB passive-income test against; supply assessable_income for the year`);
    bre = compare({ c: passive.c * 100n, e: passive.e }, assessable.c * 80n, assessable.e) <= 0;
  }
  const rateText = bre ? (fy <= 2020 ? '0.275' : fy === 2021 ? '0.260' : '0.250') : '0.300';
  const rate = BigInt(rateText.slice(2));
  const percent = `${Number(rate) / 10}`.includes('.') ? `${Number(rate) / 10}` : `${Number(rate) / 10}.0`;
  const json = { financial_year: fy, is_base_rate_entity: bre, applicable_rate: rateText,
    rate_description: bre ? `Base Rate Entity (${percent}%)` : 'Standard Corporate Tax Rate (30.0%)',
    statutory_basis: bre ? `s 23AA Income Tax Rates Act 1986; turnover < $${fy === 2018 ? 25 : 50}M and BREPI <= 80%`
      : 's 23(2) Income Tax Rates Act 1986; exceeds turnover or BREPI threshold' };
  return { fy, turnover, bre, rate, rateText, json };
}

const OUT_OF_SCOPE = /** @type {const} */ ([
  ['consolidated_group', 'a head company of a consolidated or MEC group is not modelled', 'Part 3-90 ITAA 1997'],
  ['foreign_hybrid_or_cfc_income', 'attributable income from a controlled foreign company or a foreign hybrid is not modelled', 'outside this command\'s scope'],
  ['foreign_resident', 'a foreign resident company\'s taxable income and franking cap differ', 'CTR 2026 label A; s 160-10(3) and (5) ITAA 1997'],
  ['special_rate_company', 'an RSA provider, PDF, life insurance company, non-profit company, recognised medium credit union or trustee has other rates', 'Income Tax Rates Act 1986 ss 23(3) to (7), 23A'],
  ['subdivision_165_b_applies', 'a year of change of ownership or control without the business continuity test is worked out by periods', 'Subdiv 165-B ITAA 1997'],
  ['deductions_limited_by_s_26_55', 'deductions limited so that they cannot contribute to a tax loss are not modelled', 's 26-55 ITAA 1997; s 36-10 note 1'],
  ['shipping_exempt_income', 'net exempt income relating to shipping exempt income is partly disregarded', 'ss 36-10(5), 36-17(4A) ITAA 1997'],
]);

/** The stated outcome of the loss tests, as ss 165-10 and 165-15 leave it. */
export const LOSS_TESTS = /** @type {const} */ (['continuity_of_ownership', 'same_business', 'similar_business', 'failed', 'part_year']);

/** @param {unknown} raw @param {number} fy */
function loss(raw, fy) {
  const e = object(raw);
  const year = number(e, 'loss_year');
  if (year >= fy) throw refuse(`loss year ${year} is not an earlier income year`, 's 36-17(1) ITAA 1997');
  const test = text(e, 'test');
  /** @type {[boolean, string]} */
  let found;
  if (test === 'continuity_of_ownership') found = [true, 'ss 165-12, 165-15 ITAA 1997'];
  else if (test === 'same_business') found = [true, 'ss 165-13, 165-210 ITAA 1997'];
  else if (test === 'similar_business' && year >= 2016) found = [true, 'ss 165-13, 165-211 ITAA 1997'];
  else if (test === 'similar_business') {
    throw refuse(`the similar business test does not apply to the loss year ending in ${year}, which started before 1 July 2015`, 's 165-211(1)(a) ITAA 1997');
  } else if (test === 'failed') found = [false, 's 165-10 ITAA 1997: not deductible'];
  else if (test === 'part_year') throw refuse(`a part-year deduction of the loss for the year ending in ${year} is not modelled`, 's 165-20 ITAA 1997');
  else fail('test must be continuity_of_ownership, same_business, similar_business, failed or part_year');
  return { year, amount: money(e, 'amount'), test, basis: found[1], deductible: found[0] };
}

/** Taxable income or tax loss after prior-year losses (ss 36-10, 36-17). @param {Record<string, unknown>} v @param {number} fy */
function income(v, fy) {
  const losses = array(v, 'prior_year_losses').map((e) => loss(e, fy)).sort((a, b) => a.year - b.year);
  const twice = losses.find((l, k) => k > 0 && losses[k - 1].year === l.year);
  if (twice) fail(`prior_year_losses lists the loss year ending in ${twice.year} twice`);
  const assessable = money(v, 'assessable_income');
  const deductions = money(v, 'deductions');
  const nei = money(v, 'net_exempt_income');
  const excess = assessable - deductions;
  const available = losses.filter((l) => l.deductible).reduce((t, l) => t + l.amount, 0n);
  // s 36-17(3)(a) and (4): net exempt income, less any shortfall, absorbs losses first; with assessable income
  // equal to deductions neither subsection applies.
  const neiLeft = excess === 0n ? 0n : floor(nei - floor(-excess));
  const fromNei = least(neiLeft, available);
  const cap = least(floor(available - fromNei), floor(excess));
  let choice = cap;
  if (!isNull(v.loss_deduction_chosen)) {
    choice = money(v, 'loss_deduction_chosen');
    if (excess <= 0n && choice > 0n) throw refuse('no choice of loss deduction exists when deductions are not less than assessable income', 's 36-17(4) ITAA 1997');
    if (choice > cap) fail(`loss_deduction_chosen ${amount(choice)} exceeds the ${amount(cap)} the deductible losses allow`);
  }
  let left = fromNei + choice;
  const rows = losses.map((l) => {
    const deducted = l.deductible ? least(l.amount, left) : 0n;
    left -= deducted;
    return { loss_year: l.year, amount: amount(l.amount), test: l.test, basis: l.basis, deducted: amount(deducted),
      remaining: amount(l.amount - deducted) };
  });
  return { taxable: floor(excess - choice), taxLoss: floor(floor(-excess) - nei), nei, choice,
    json: { assessable_income: amount(assessable), deductions: amount(deductions), net_exempt_income: amount(nei),
      losses_deducted_from_net_exempt_income: amount(fromNei), losses_deducted: amount(choice), prior_year_losses: rows } };
}

const TEMPORARY = /** @type {const} */ ([['corporate_tax_entity_throughout', 'ss 160-5(b), 160-25'], ['returns_lodged', 's 160-5(e)'],
  ['choice_in_approved_form', 'ss 160-5(f), 160-15(2)'], ['carried_on_business_each_loss_year', 's 160-20'],
  ['no_transferred_losses', 's 160-30(1)(a), (2)'], ['no_excess_franking_offset_losses', 's 160-30(1)(b)'], ['no_integrity_scheme', 's 160-35']]);
const PERMANENT = /** @type {const} */ ([['corporate_tax_entity_throughout', 's 160-5(1)(b) and (2)(c)'],
  ['not_significant_global_entity', 's 160-5(1)(e)'], ['returns_lodged', 's 160-5(1)(f)'], ['choice_in_approved_form', 'ss 160-5(1)(g), 160-15(2)'],
  ['no_transferred_losses', 's 160-25(1)(a), (2)'], ['no_excess_franking_offset_losses', 's 160-25(1)(b)'], ['no_integrity_scheme', 's 160-30']]);
/** The conditions each version of Division 160 asks to be stated true, by claim year. */
export const CARRY_BACK_CONDITIONS = { temporary: TEMPORARY.map(([key]) => key), permanent: PERMANENT.map(([key]) => key) };
/** Claim years with a loss carry back tax offset, as income years ending 30 June. */
export const CARRY_BACK_YEARS = [2021, 2022, 2023, 2027];

/** Division 160's loss carry back tax offset, or null when none is claimed.
 * @param {Record<string, unknown>} v @param {number} fy @param {Rate} rate @param {bigint} taxLoss */
function carryBack(v, fy, rate, taxLoss) {
  if (isNull(v.loss_carry_back)) return null;
  const raw = v.loss_carry_back;
  if (typeof raw !== 'object' || Array.isArray(raw)) fail('loss_carry_back must be an object');
  const lcb = object(raw);
  let permanent;
  if (fy >= 2021 && fy <= 2023) permanent = false;
  else if (fy === 2027) permanent = true;
  else throw refuse(`there is no loss carry back tax offset for the claim year ending in ${fy}`, 's 160-5(a) ITAA 1997 to 30 June 2026; Treasury Laws Amendment (Tax Reform No. 2) Act 2026 Sch 1 item 11');
  const given = object(lcb.conditions);
  for (const [key, provision] of permanent ? PERMANENT : TEMPORARY) {
    if (!flag(given, key)) throw refuse(`loss carry back condition ${key} is not stated as true`, `${provision} ITAA 1997 ${permanent ? 'as substituted from 1 July 2026' : 'as in force to 30 June 2026'}`);
  }
  if (isNull(lcb.franking_account_balance)) fail('loss_carry_back.franking_account_balance is required');
  const balance = money(lcb, 'franking_account_balance');
  const turnover = decimal(v, 'aggregated_turnover');
  /** @type {Map<number, {taxLoss: bigint, rate: bigint, rateText: string, turnover: {c: bigint, e: number} | null}>} */
  const losses = new Map([[fy, { taxLoss, rate: rate.rate, rateText: rate.rateText, turnover }]]);
  for (const raw2 of array(lcb, 'loss_years')) {
    const e = object(raw2);
    const year = number(e, 'year');
    const r = corporateTax(e, year);
    if (year >= fy || losses.has(year)) fail('loss_years lists the claim year, a later year or a year twice');
    losses.set(year, { taxLoss: money(e, 'tax_loss'), rate: r.rate, rateText: r.rateText, turnover: r.turnover });
  }
  const pairs = array(lcb, 'carry_backs').map((raw3) => {
    const e = object(raw3);
    const p = { loss: number(e, 'loss_year'), earlier: number(e, 'earlier_year'), amount: money(e, 'amount') };
    const ok = permanent ? p.loss === fy && p.earlier >= fy - 2 && p.earlier < fy
      : p.loss >= 2020 && p.loss <= fy && p.earlier >= 2019 && p.earlier < p.loss;
    if (!ok) {
      throw refuse(`carrying the loss year ending in ${p.loss} back to the year ending in ${p.earlier} is outside ${permanent
        ? 'the claim year\'s loss and the 2 income years before it' : 'a loss year from 2019-20 to the claim year and an earlier year from 2018-19'}`,
      permanent ? 'ss 160-5(2)(a), 160-15(1) ITAA 1997 as substituted from 1 July 2026' : 'ss 160-5(c) and (d), 160-15(1) ITAA 1997 as in force to 30 June 2026');
    }
    return p;
  });
  if (permanent && taxLoss <= 0n) throw refuse('the claim year is not a loss year', 's 160-5(1)(c) ITAA 1997');
  const unknown = pairs.find((p) => !losses.has(p.loss));
  if (unknown) fail(`loss_years has no entry for the loss year ending in ${unknown.loss}`);
  for (const [year, l] of [...losses].sort((a, b) => a[0] - b[0])) {
    const carried = pairs.filter((p) => p.loss === year).reduce((t, p) => t + p.amount, 0n);
    if (carried > l.taxLoss) throw refuse(`${amount(carried)} carried back from the year ending in ${year} exceeds its tax loss of ${amount(l.taxLoss)}`, 's 160-10(2) method statement step 1 ITAA 1997');
    if (!permanent && carried > 0n && l.turnover !== null && compare(l.turnover, 5000000000n, 0) >= 0) {
      throw refuse(`aggregated turnover for the loss year ending in ${year} is not under $5 billion`, 's 160-20 ITAA 1997 as in force to 30 June 2026');
    }
  }
  /** @type {Map<number, {liability: bigint, nei: bigint, used: bigint}>} */
  const earlier = new Map();
  for (const raw4 of array(lcb, 'earlier_years')) {
    const e = object(raw4);
    // Stated even when nil: a missing amount must not reuse liability an earlier claim already took.
    for (const key of ['income_tax_liability', 'liability_previously_used']) {
      if (isNull(e[key])) fail(`earlier_years.${key} is required, even when nil`); // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
    }
    const row = { liability: money(e, 'income_tax_liability'), nei: money(e, 'net_exempt_income'), used: money(e, 'liability_previously_used') };
    if (row.used > row.liability) fail('earlier_years.liability_previously_used exceeds income_tax_liability');
    const year = number(e, 'year');
    if (earlier.has(year)) fail('earlier_years lists a year twice');
    earlier.set(year, row);
  }
  let total = 0n;
  const components = [...new Set(pairs.map((p) => p.earlier))].sort((a, b) => a - b).map((year) => {
    const e = earlier.get(year);
    if (!e) fail(`earlier_years has no entry for the year ending in ${year}`);
    if (permanent && e.liability <= 0n) throw refuse(`the year ending in ${year} has no income tax liability, so it is not an eligible carry back year`, 's 160-5(2)(b) ITAA 1997');
    let nei = e.nei;
    let sum = 0n;
    const steps = pairs.filter((p) => p.earlier === year).sort((a, b) => a.loss - b.loss).map((p) => {
      const l = /** @type {{rate: bigint, rateText: string}} */ (losses.get(p.loss));
      const reduced = floor(p.amount - nei);
      nei = floor(nei - p.amount);
      const product = times(reduced, l.rate);
      sum += product;
      return { loss_year: p.loss, carried_back: amount(p.amount), after_net_exempt_income: amount(reduced), loss_year_rate: l.rateText, step_3: amount(product) };
    });
    const cap = floor(e.liability - e.used);
    const component = least(sum, cap);
    total += component;
    return { earlier_year: year, losses: steps, sum_of_step_3: amount(sum), unused_income_tax_liability: amount(cap), component: amount(component) };
  });
  const offset = least(total, balance);
  return { offset, fromCurrentYear: pairs.filter((p) => p.loss === fy).reduce((t, p) => t + p.amount, 0n),
    json: { law: permanent ? 'Div 160 ITAA 1997 as substituted by Treasury Laws Amendment (Tax Reform No. 2) Act 2026 Sch 1 (income years from 1 July 2026)'
      : 'Div 160 ITAA 1997 as in force to 30 June 2026 (claim years 2020-21 to 2022-23)',
    components, sum_of_components: amount(total), franking_account_balance: amount(balance), offset: amount(offset),
    label: 'E (refundable tax offset, s 67-23 ITAA 1997)' } };
}

const STEPS = [
  'Rate: base rate entity rate for the year if aggregated turnover is under the threshold and base rate entity passive income is no more than 80% of assessable income, otherwise 30% (Income Tax Rates Act 1986 ss 23(2), 23AA, 23AB).',
  'Prior-year losses are deducted only where the stated continuity of ownership (ss 165-12, 165-15) or business continuity (ss 165-13, 165-210, 165-211) outcome allows (s 165-10), oldest first (s 36-17(7)); the command does not judge either test.',
  'Net exempt income absorbs losses first; the company then deducts the amount it chooses from the excess of assessable income over deductions, or the most allowed when no choice is stated (s 36-17(2) to (4)).',
  'Tax loss: deductions less assessable income, less net exempt income (s 36-10).',
  'Gross tax: taxable income times the rate, rounded half up to the cent (CTR 2026 labels T1 and B).',
  'Offsets apply in order C, D, E (including the loss carry back tax offset), F; excess C is lost, excess D and F carry forward, excess E is refunded at I (CTR 2026 calculation statement steps 4 to 7).',
  'Amount due or refundable: S = T5 + G - H - I - K; negative is refundable (CTR 2026 step 9).',
];

/** The company tax return's calculation statement for one income year from 2020-21 to 2026-27: taxable income after
 * prior-year losses, the tax at the year's rate, the offsets at labels C to F (with any loss carry back tax offset at
 * E), and S, the amount due (negative: refundable). Throws an Error naming the provision for a case it does not
 * cover. @param {unknown} input */
export function companyTaxStatement(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('input must be a JSON object');
  const v = /** @type {Record<string, unknown>} */ (input);
  const fy = number(v, 'financial_year');
  if (fy < 2021 || fy > 2027) throw refuse(`financial_year ${fy} is outside 2021 (2020-21) to 2027 (2026-27)`, 'years this command covers');
  for (const [key, what, law] of OUT_OF_SCOPE) if (flag(v, key)) throw refuse(what, law);
  const rate = corporateTax(v, fy);
  const inc = income(v, fy);
  const gross = times(inc.taxable, rate.rate);
  const c = money(v, 'non_refundable_non_carry_forward_offsets');
  const franking = money(v, 'franking_tax_offsets');
  if (franking > c) fail('franking_tax_offsets is part of non_refundable_non_carry_forward_offsets and cannot exceed it');
  if (franking > 0n && inc.choice > 0n) throw refuse('franking tax offsets limit the choice of prior-year loss deduction', 's 36-17(5) ITAA 1997');
  if (franking > floor(gross - (c - franking))) throw refuse('excess franking offsets are converted into a tax loss', 's 36-55 ITAA 1997');
  if (money(v, 'non_refundable_carry_forward_offsets') > 0n && inc.nei > 0n) throw refuse('carry forward tax offsets first reduce net exempt income', 'Div 65 ITAA 1997; CTR 2026 label D');
  const lcb = carryBack(v, fy, rate, inc.taxLoss);
  const offset = lcb ? lcb.offset : 0n;
  const back = lcb ? lcb.fromCurrentYear : 0n;
  const dd = money(v, 'non_refundable_carry_forward_offsets');
  const f = money(v, 'franking_deficit_tax_offset');
  const e = money(v, 'refundable_tax_offsets') + offset;
  const g = money(v, 'section_102aam_interest');
  const h = money(v, 'eligible_credits');
  const k = money(v, 'payg_instalments');
  const t2 = floor(gross - c);
  const t3 = floor(t2 - dd);
  const t4 = floor(t3 - e);
  const i = floor(e - t3);
  const t5 = floor(t4 - f);
  const s = t5 + g - h - i - k;
  return { financial_year: fy, corporate_tax: rate.json,
    taxable_income: { ...inc.json, taxable_income: amount(inc.taxable), tax_loss: amount(inc.taxLoss),
      tax_loss_carried_back: amount(back), tax_loss_carried_forward: amount(inc.taxLoss - back) },
    loss_carry_back: lcb ? lcb.json : null,
    calculation_statement: { A: amount(inc.taxable), T1: amount(gross), B: amount(gross), C: amount(c), T2: amount(t2), D: amount(dd),
      T3: amount(t3), E: amount(e), T4: amount(t4), F: amount(f), T5: amount(t5), G: amount(g), H: amount(h), I: amount(i), K: amount(k), S: amount(s) },
    offsets_not_used: { non_refundable_non_carry_forward_offsets_lost: amount(floor(c - gross)),
      non_refundable_carry_forward_offsets_carried_forward: amount(floor(dd - t2)),
      franking_deficit_tax_offset_carried_forward: amount(floor(f - t4)) },
    steps: STEPS };
}

const yearText = (/** @type {number} */ fy) => `${fy - 1}-${String(fy % 100).padStart(2, '0')}`;
const PAGE_CONDITIONS = (/** @type {number} */ fy) => (fy === 2027 ? CARRY_BACK_CONDITIONS.permanent : CARRY_BACK_CONDITIONS.temporary);

/** The page's statement option as the command's call, with the company's figures from the page's first fields.
 * @param {(name: string) => string} value */
export function statementFormInput(value) {
  const field = (/** @type {string} */ name) => value(`statement-${name}`);
  const fy = Number(field('year'));
  /** @type {Record<string, unknown>} */
  const call = { financial_year: fy, aggregated_turnover: value('turnover'), assessable_income: value('assessable'),
    passive_income: value('passive'), deductions: field('deductions'), net_exempt_income: field('exempt'),
    prior_year_losses: [1, 2].filter((n) => field(`loss-${n}-year`) !== '').map((n) => ({ loss_year: Number(field(`loss-${n}-year`)),
      amount: field(`loss-${n}-amount`), test: field(`loss-${n}-test`) })) };
  if (field('chosen').trim() !== '') call.loss_deduction_chosen = field('chosen');
  for (const [key, name] of /** @type {const} */ ([['non_refundable_non_carry_forward_offsets', 'c'], ['franking_tax_offsets', 'franking'],
    ['non_refundable_carry_forward_offsets', 'd'], ['refundable_tax_offsets', 'e'], ['franking_deficit_tax_offset', 'f'],
    ['section_102aam_interest', 'g'], ['eligible_credits', 'h'], ['payg_instalments', 'k']])) call[key] = field(name); // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
  if (field('carry-back') === 'yes') {
    const rows = [1, 2].filter((n) => Number(field(`back-${n}-amount`)) > 0);
    call.loss_carry_back = { franking_account_balance: field('balance'),
      conditions: Object.fromEntries(PAGE_CONDITIONS(fy).map((key) => [key, field('conditions') === 'yes'])),
      carry_backs: rows.map((n) => ({ loss_year: fy, earlier_year: fy - 3 + n, amount: field(`back-${n}-amount`) })),
      earlier_years: rows.map((n) => ({ year: fy - 3 + n, income_tax_liability: field(`back-${n}-liability`),
        liability_previously_used: field(`back-${n}-used`), net_exempt_income: field(`back-${n}-exempt`) })) };
  }
  return call;
}

/** The statement's rows for the page, labelled as the return labels them. @param {ReturnType<typeof companyTaxStatement>} r
 * @param {(value: number) => string} aud */
export function statementRows(r, aud) {
  const a = (/** @type {string} */ text) => aud(Number(text));
  const s = r.calculation_statement;
  const t = r.taxable_income;
  /** @type {[string, string][]} */
  const rows = [];
  if (Number(t.losses_deducted_from_net_exempt_income)) rows.push(['Prior-year losses absorbed by net exempt income (s 36-17)', a(t.losses_deducted_from_net_exempt_income)]);
  if (t.prior_year_losses.length) rows.push(['Prior-year losses deducted (s 36-17)', a(t.losses_deducted)]);
  rows.push([`Taxable income for ${yearText(r.financial_year)} (label A)`, a(s.A)],
    [`Gross tax at ${Number(r.corporate_tax.applicable_rate) * 100}% (labels T1 and B)`, a(s.B)]);
  for (const [label, words] of /** @type {const} */ ([['C', 'Non-refundable non-carry forward offsets (C)'], ['D', 'Non-refundable carry forward offsets (D)'],
    ['E', 'Refundable tax offsets (E)'], ['F', 'Franking deficit tax offset (F)']])) {
    if (Number(s[label])) rows.push([words, a(s[label])]); // eslint-disable-line security/detect-object-injection -- labels are this module's own constants
  }
  rows.push(['Tax payable (T5)', a(s.T5)]);
  for (const [label, words] of /** @type {const} */ ([['G', 'Section 102AAM interest charge (G)'], ['H', 'Credits for amounts withheld (H)'],
    ['I', 'Refundable offsets in excess of tax (I)'], ['K', 'PAYG instalments (K)']])) {
    if (Number(s[label])) rows.push([words, a(s[label])]); // eslint-disable-line security/detect-object-injection -- labels are this module's own constants
  }
  rows.push([Number(s.S) < 0 ? 'Amount refundable (S)' : 'Amount due (S)', aud(Math.abs(Number(s.S)))]);
  if (Number(t.tax_loss)) {
    rows.push(['Tax loss for the year (s 36-10)', a(t.tax_loss)]);
    if (r.loss_carry_back) rows.push(['Carried back (Division 160)', a(t.tax_loss_carried_back)], ['Loss carry back tax offset, in label E', a(r.loss_carry_back.offset)]);
    rows.push(['Carried forward', a(t.tax_loss_carried_forward)]);
  }
  return rows;
}

/** The company tax page's result, with the statement option's rows when it is chosen.
 * @param {import('./company-tax.mjs').CompanyTaxInput} input @param {(name: string) => string} value @param {(value: number) => string} aud
 * @param {(input: import('./company-tax.mjs').CompanyTaxInput, aud: (value: number) => string) => {inputs: string, rows: [string, string][], principal: number, note: string}} base */
export function companyTaxPageResult(input, value, aud, base) {
  const result = base(input, aud);
  if (value('statement') !== 'yes') return result;
  const r = companyTaxStatement(statementFormInput(value));
  if (Number(r.calculation_statement.A) !== Number(input.taxable)) {
    throw new Error(`The statement gives taxable income of ${aud(Number(r.calculation_statement.A))} (label A): enter that as taxable income for the year.`);
  }
  return { ...result, inputs: `${result.inputs}; calculation statement for ${yearText(r.financial_year)}`, rows: [...result.rows, ...statementRows(r, aud)] };
}
