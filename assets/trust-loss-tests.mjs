// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Which ITAA 1936 Schedule 2F trust loss tests apply to a trust deducting a prior-year tax loss, and whether each is
// passed on the facts stated: the `trust-loss-tests` command of ryanduguid/australian-accounting's solomons-sword
// ported line for line, with its inputs, order of checks and refusal texts. A fact left unstated stays unknown, so a
// test can be 'not established' rather than passed or failed. Schedule 2F read in the AustLII consolidation on
// 27 November 2026.

import { add, cmp, d, str } from './exact-decimal.mjs';
import { array, fact, integer, percentage, refusal, text, year } from './partnership-net-income.mjs';

/** @param {string} message */
const fail = (message) => Object.assign(new Error(message), { code: 'refused' });

const STAKE = 'ss 266-40, 267-40, 269-55 Sch 2F ITAA 1936';
const PATTERN = 'ss 267-30, 269-60 Sch 2F ITAA 1936';
const CONTROL = 'ss 267-45, 269-95 Sch 2F ITAA 1936';

/** @typedef {{ test: string, provision: string, applies: boolean | null, passed: boolean | null, basis: string }} LossTest */

/** @param {string} test @param {string} provision @param {string} basis @returns {LossTest} */
const outside = (test, provision, basis) => ({ test, provision, applies: false, passed: null, basis });
/** @param {boolean | null} x */
const not = (x) => (x === null ? null : !x);
/** True if either is true, false if both are false. @param {boolean | null} a @param {boolean | null} b */
const either = (a, b) => (a === true || b === true ? true : a === false && b === false ? false : null);

/** The s 272-100 paragraph of each excepted trust the command accepts. */
export const EXCEPTED_TRUSTS = /** @type {const} */ ([
  ['family_trust', 's 272-100(a)'],
  ['complying_superannuation_fund', 's 272-100(b)'],
  ['complying_approved_deposit_fund', 's 272-100(b)'],
  ['pooled_superannuation_trust', 's 272-100(b)'],
  ['deceased_estate', 's 272-100(c)'],
  ['exempt_entity_unit_trust', 's 272-100(d)'],
  ['designated_infrastructure_project_entity', 's 272-100(f)'],
]);
const WIDELY_HELD = ['unlisted_widely_held', 'listed_widely_held', 'unlisted_very_widely_held', 'wholesale_widely_held'];

const NOT_DECIDED = [
  'deducting the part of a loss attributable to part of the loss year (ss 266-50, 267-50)',
  'family trust distribution tax (Div 271)',
  "which income years' distributions are test year distributions (s 269-65), and ss 269-75, 269-80 and 269-85: the caller states the percentages after applying them",
];

/** @param {Record<string, unknown>} v @returns {[string, string] | null} */
function excepted(v) {
  if (v.excepted_trust === undefined || v.excepted_trust === null) return null;
  const kind = text(v, 'excepted_trust');
  const found = EXCEPTED_TRUSTS.find(([k]) => k === kind);
  if (!found) throw fail('excepted_trust must be family_trust, complying_superannuation_fund, complying_approved_deposit_fund, pooled_superannuation_trust, deceased_estate, exempt_entity_unit_trust, designated_infrastructure_project_entity or null');
  return [kind, found[1]];
}

/** @param {string} para @returns {LossTest[]} */
function exceptedTests(para) {
  const why = `an excepted trust (${para}) at all times in the test period is outside ss 266-25 and 267-20`;
  return [outside('fifty_percent_stake', STAKE, why), outside('pattern_of_distributions', PATTERN, why), outside('control', CONTROL, why)];
}

/** @param {Record<string, unknown>} v @returns {LossTest[]} */
function fixedTests(v) {
  const stake = fact(v, 'fifty_percent_stake_test_passed');
  const alternative = stake === true ? null : fact(v, 'alternative_stake_test_passed');
  return [
    { test: 'fifty_percent_stake', provision: 'ss 266-25(2), 266-40, 266-45, 269-55 Sch 2F ITAA 1936', applies: true, passed: either(stake, alternative),
      basis: 'a fixed trust must pass the 50% stake test for the test period or meet the s 266-45 conditions (stated)' },
    outside('pattern_of_distributions', PATTERN, 'applies only to a non-fixed trust (s 267-20)'),
    outside('control', CONTROL, 'applies only to a non-fixed trust (s 267-20)'),
  ];
}

/** One test year distribution: each individual's percentage, totalling at most 100%. @param {unknown} x @param {string} kind */
function distribution(x, kind) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw fail(`each ${kind} test year distribution must be an object`);
  let sum = d('0');
  /** @type {Map<string, import('./exact-decimal.mjs').Dec>} */
  const out = new Map();
  for (const name of Object.keys(x).sort((a, b) => (a < b ? -1 : Number(a > b)))) {
    let p;
    try {
      p = percentage({ p: /** @type {Record<string, unknown>} */ (x)[name] }, 'p'); // eslint-disable-line security/detect-object-injection -- the caller's own key
    } catch {
      throw fail(`${kind} distribution to ${name} must be a percentage from 0 to 100`);
    }
    sum = add(sum, p);
    out.set(name, p);
  }
  if (cmp(sum, d('100')) > 0) throw fail(`a ${kind} test year distribution totals ${str(sum)}%, more than 100%`);
  return out;
}

/** The smallest percentage each individual received across the distributions, and their total (s 269-70).
 * @param {unknown[]} list @param {string} kind */
function minimums(list, kind) {
  const dists = list.map((x) => distribution(x, kind));
  /** @type {Record<string, string>} */
  const out = {};
  let total = d('0');
  const seen = new Set();
  for (const m of dists) {
    for (const name of m.keys()) {
      if (seen.has(name)) continue;
      seen.add(name);
      let least = d('100');
      for (const other of dists) {
        const p = other.get(name) ?? d('0');
        if (cmp(p, least) < 0) least = p;
      }
      total = add(total, least);
      out[name] = str(least); // eslint-disable-line security/detect-object-injection -- the caller's own key
    }
  }
  return { out, total };
}

/** @param {Record<string, unknown>} dists @returns {[boolean | null, string, Record<string, unknown>]} */
function patternFrom(dists) {
  /** @type {(boolean | null)[]} */
  const results = [];
  /** @type {Record<string, unknown>} */
  const working = {};
  for (const kind of ['income', 'capital']) {
    const list = array(dists, kind);
    if (list.length === 0) {
      results.push(null);
      continue;
    }
    const { out, total } = minimums(list, kind);
    results.push(cmp(total, d('50')) > 0);
    working[kind] = { minimum_percentages: out, total: str(total) }; // eslint-disable-line security/detect-object-injection -- 'income' or 'capital'
  }
  const [income, capital] = results;
  if (income === null && capital === null) throw fail('test_year_distributions has no income or capital distribution');
  const passed = income === false || capital === false ? false : income === true && capital === true ? true : null;
  const basis = passed === null
    ? 'the distributions of one kind pass, but whether s 269-60 is met with no test year distribution of the other kind is not decided'
    : 'each individual counts the smallest percentage they received in any test year distribution; the totals must exceed 50% for income and for capital';
  return [passed, basis, working];
}

/** @param {Record<string, unknown>} v */
function patternApplies(v) {
  /** @type {(boolean | null)[]} */
  const kinds = [];
  for (const kind of ['income', 'capital']) {
    const now = fact(v, `${kind}_distributed_in_income_year_or_2_months_after`);
    const before = fact(v, `${kind}_distributed_in_6_earlier_years`);
    kinds.push(now === true && before === true ? true : now === false || before === false ? false : null);
  }
  return either(kinds[0], kinds[1]);
}

/** @param {Record<string, unknown>} v @returns {[LossTest, unknown]} */
function patternTest(v) {
  let passed;
  let basis;
  /** @type {unknown} */
  let working = null;
  if (v.test_year_distributions === undefined || v.test_year_distributions === null) {
    passed = fact(v, 'pattern_of_distributions_test_passed');
    basis = 'the pattern of distributions test result as stated';
  } else {
    const t = v.test_year_distributions;
    [passed, basis, working] = patternFrom(/** @type {Record<string, unknown>} */ (t && typeof t === 'object' && !Array.isArray(t) ? t : {}));
  }
  return [{ test: 'pattern_of_distributions', provision: 'ss 267-30, 269-60, 269-65, 269-70 Sch 2F ITAA 1936', applies: patternApplies(v), passed, basis }, working];
}

/** @param {Record<string, unknown>} v @returns {[LossTest[], unknown]} */
function nonFixedTests(v) {
  const [pattern, working] = patternTest(v);
  return [[
    pattern,
    { test: 'pattern_of_distributions_not_previously_failed', provision: 's 267-35 Sch 2F ITAA 1936', applies: true,
      passed: not(fact(v, 'previously_failed_pattern_test')),
      basis: 'the trust must not have been denied the loss in an earlier year for failing s 267-30(2)' },
    { test: 'fifty_percent_stake', provision: 'ss 267-40, 269-50, 269-55 Sch 2F ITAA 1936', applies: fact(v, 'individuals_had_over_50_percent_stake'),
      passed: fact(v, 'stake_maintained'),
      basis: 'where individuals had more than a 50% stake in income or capital in the test period, the same individuals must keep it to the end (including any s 267-40(3) discretion, as stated)' },
    { test: 'control', provision: 'ss 267-45, 269-95 Sch 2F ITAA 1936', applies: true, passed: not(fact(v, 'group_began_to_control')),
      basis: 'a group must not begin to control the trust in the test period' },
  ], working];
}

/** @param {Record<string, unknown>} v @param {string | undefined} para @returns {LossTest} */
function injectionTest(v, para) {
  const exempt = para === 's 272-100(b)' || para === 's 272-100(c)' || para === 's 272-100(d)';
  return { test: 'income_injection', provision: 'ss 270-10, 270-15, 270-25 Sch 2F ITAA 1936', applies: !exempt,
    passed: exempt ? null : not(fact(v, 'income_injection_scheme')),
    basis: exempt ? 'does not apply to an excepted trust under s 272-100(b), (c) or (d) (s 270-10(1)(d))'
      : 'where a s 270-10 scheme exists, the deduction is not allowable to the extent it relates to the scheme assessable income (s 270-15)' };
}

/** @param {Record<string, unknown>} v */
function deduction(v) {
  const kind = text(v, 'deduction');
  if (kind === 'prior_year_tax_loss') return;
  if (kind === 'bad_debt') throw fail(refusal('a bad debt or debt/equity swap deduction is not modelled', 'ss 266-35, 267-25 Sch 2F ITAA 1936'));
  if (kind === 'current_year_loss') throw fail(refusal('working out net income and a tax loss by periods is not modelled', 's 266-30, Subdiv 267-C, Div 268 Sch 2F ITAA 1936'));
  throw fail('deduction must be prior_year_tax_loss, bad_debt or current_year_loss');
}

/** @param {Record<string, unknown>} v */
function trustKind(v) {
  const kind = text(v, 'trust_kind');
  if (kind === 'fixed' || kind === 'non_fixed') return kind;
  if (WIDELY_HELD.includes(kind)) throw fail(refusal(`trust_kind ${kind} is not modelled`, 'Subdivs 266-C, 266-D, 266-E Sch 2F ITAA 1936'));
  throw fail('trust_kind must be fixed, non_fixed, unlisted_widely_held, listed_widely_held, unlisted_very_widely_held or wholesale_widely_held');
}

/** True when every applicable test passes, false when an applicable one fails, otherwise not established (null).
 * @param {LossTest[]} tests */
function verdict(tests) {
  if (tests.some((t) => t.applies === true && t.passed === false)) return false;
  if (tests.some((t) => t.applies !== false && t.passed !== true)) return null;
  return true;
}

/** @param {Record<string, any>} v */
export function trustLossTests(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw fail('input must be a JSON object');
  const fy = year(v);
  const lossYear = integer(v, 'loss_year');
  if (lossYear >= fy) throw fail(`loss_year ${lossYear} must be earlier than financial_year ${fy}`);
  deduction(v);
  const kind = trustKind(v);
  const exc = excepted(v);
  let tests;
  /** @type {unknown} */
  let working = null;
  if (exc) tests = exceptedTests(exc[1]);
  else if (kind === 'fixed') tests = fixedTests(v);
  else [tests, working] = nonFixedTests(v);
  tests.push(injectionTest(v, exc?.[1]));
  const notEstablished = tests.filter((t) => (t.applies === true ? t.passed === null : t.applies === false ? false : t.passed !== true)).map((t) => t.test);
  return { financial_year: fy, loss_year: lossYear, trust_kind: kind, excepted_trust: exc ? { kind: exc[0], provision: exc[1] } : null,
    tests, pattern_of_distributions_working: working, deductible: verdict(tests), not_established: notEstablished, not_decided: NOT_DECIDED };
}

const WORDS = { fifty_percent_stake: '50% stake test', pattern_of_distributions: 'Pattern of distributions test',
  pattern_of_distributions_not_previously_failed: 'Pattern test not failed in an earlier year', control: 'Control test', income_injection: 'Income injection test' };

/** @param {string} answer @returns {boolean | null} */
const tri = (answer) => (answer === 'yes' ? true : answer === 'no' ? false : null);

/** The form's call. @param {(name: string) => string} value */
export function trustLossFormInput(value) {
  const fy = Number(value('year'));
  /** @type {Record<string, unknown>} */
  const call = { financial_year: fy, loss_year: Number(value('loss-year')), deduction: 'prior_year_tax_loss', trust_kind: value('kind') };
  if (value('excepted') !== 'none') call.excepted_trust = value('excepted');
  for (const [field, key] of [['stake', 'fifty_percent_stake_test_passed'], ['alternative', 'alternative_stake_test_passed'],
    ['income-now', 'income_distributed_in_income_year_or_2_months_after'], ['income-before', 'income_distributed_in_6_earlier_years'],
    ['capital-now', 'capital_distributed_in_income_year_or_2_months_after'], ['capital-before', 'capital_distributed_in_6_earlier_years'],
    ['pattern', 'pattern_of_distributions_test_passed'], ['previously-failed', 'previously_failed_pattern_test'],
    ['over-50', 'individuals_had_over_50_percent_stake'], ['maintained', 'stake_maintained'], ['control', 'group_began_to_control'],
    ['injection', 'income_injection_scheme']]) {
    call[key] = tri(value(field)); // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
  }
  return call;
}

/** How the page writes the call. @param {Record<string, any>} x */
export function trustLossInputsText(x) {
  const yearText = (/** @type {number} */ fy) => `${fy - 1}-${String(fy % 100).padStart(2, '0')}`;
  return `${yearText(x.financial_year)}; a ${x.trust_kind === 'fixed' ? 'fixed' : 'non-fixed'} trust deducting a tax loss from ${yearText(x.loss_year)}`
    + `${x.excepted_trust ? `; excepted trust: ${String(x.excepted_trust).replaceAll('_', ' ')}` : ''}`;
}

/** The page's result. @param {(name: string) => string} value */
export function trustLossResult(value) {
  const input = trustLossFormInput(value);
  if (/** @type {number} */ (input.loss_year) >= /** @type {number} */ (input.financial_year)) throw new Error('Choose a loss year earlier than the income year deducting it.');
  const r = trustLossTests(input);
  const state = (/** @type {LossTest} */ t) => (t.applies === false ? 'Does not apply' : t.passed === true ? (t.applies === null ? 'Passed; whether it applies not stated' : 'Passed')
    : t.passed === false ? (t.applies === null ? 'Failed; whether it applies not stated' : 'Failed') : 'Not established');
  const rows = r.tests.map((t) => [`${WORDS[/** @type {keyof typeof WORDS} */ (t.test)]} (${t.provision.replace(' Sch 2F ITAA 1936', '')})`, state(t)]);
  const principal = rows.push(['Prior-year loss deductible under Schedule 2F', r.deductible === true ? 'Yes' : r.deductible === false ? 'No' : 'Not established']) - 1;
  const note = r.not_established.length ? `Not established: ${r.not_established.map((n) => WORDS[/** @type {keyof typeof WORDS} */ (n)].toLowerCase()).join(', ')}` // eslint-disable-line security/detect-object-injection -- WORDS is keyed by the module's own test names
    : 'Each test that applies was answered on the facts stated';
  return { inputs: trustLossInputsText(input), rows, principal, note };
}
