// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The income tax page's minors' income form: a port of the australian-accounting command
// minors-income. The tax on a minor's taxable income under Division 6AA of Part III of the Income
// Tax Assessment Act 1936 (ss 102AA to 102AGA) and the Income Tax Rates Act 1986 ss 13 and 15 and
// Schedule 11, for 2024-25 to 2026-27, read in ITAA 1936 Compilation No. 193 (1 October 2026) and
// ITRA Compilation No. 66 (1 July 2026) on 22 November 2026. Whether a person is excepted, which
// income is excepted and every amount the Act leaves to the Commissioner's opinion are stated
// facts. Amounts are exact fractions of a cent until each result is rounded half up to the cent.
import { commandCents } from './money.mjs';
import { FOREIGN_SCALE, RESIDENT_SCALES } from './income-tax.mjs';
import { refuse } from './private-health-rebate.mjs';

export const MINORS_YEARS = ['2024-25', '2025-26', '2026-27'];
// ITRA s 13(1)(b) and s 15(2): the nil band, in dollars; s 13(2)(a) and s 15(2)(b)(i): the phase-in
// rate; Schedule 11 Parts I and II clause 2: the special rate, both per cent.
const NIL_BAND = 416;
const PHASE_IN = 66;
const SPECIAL_RATE = 45;
const MAX_ITEMS = 50;

/** The command's inputs in its order, with how each is read. */
const PARAMS = [['taxable_income', 'dec'], ['residency', 'raw'], ['under_18_on_30_june', 'raw'], ['excepted_person', 'raw'],
  ['excepted_income', 'json'], ['trust_shares', 'json'], ['other_assessable_income', 'dec'], ['deductions_exclusive', 'dec'],
  ['deductions_related', 'dec'], ['apportionable_deductions', 'dec'], ['special_income_component', 'raw'], ['year', 'raw']];
const OPTIONAL = ['full_time_occupation', 'dependent_on_relatives'];

// ITAA 1936 s 102AC(2): each excepted person ground and its paragraph.
export const PERSON_GROUNDS = new Map([
  ['full_time_occupation', 's 102AC(2)(b), (6) to (8)'], ['carer_allowance', 's 102AC(2)(c)(i)'],
  ['disability_support_pension', 's 102AC(2)(c)(ii)'], ['disability_certificate', 's 102AC(2)(d)'],
  ['special_disability_trust', 's 102AC(2)(da)'], ['double_orphan_pension', 's 102AC(2)(e), (3)'],
  ['double_orphan_pension_s1003', 's 102AC(2)(f), (3)'], ['permanent_disability_certificate', 's 102AC(2)(g), (4)'],
]);
// s 102AC(3) and (4): the grounds denied to a minor dependent on relatives.
const DEPENDENCY_GROUNDS = ['double_orphan_pension', 'double_orphan_pension_s1003', 'permanent_disability_certificate'];
// s 102AE(2): each excepted assessable income ground other than trust shares (paragraph (e)).
export const INCOME_GROUNDS = ['employment', 'business', 'damages_or_compensation', 'death_benefit', 'public_fund',
  'family_breakdown', 'deceased_estate', 'lottery_prize', 'partnership', 'accumulations'];
// s 102AC(6) to (8): the facts of the full-time occupation test.
const FULL_TIME_FACTS = ['engaged_on_last_day', 'three_months_in_year', 'intends_full_time_occupation_next_year',
  'intends_full_time_education_next_year'];

/** Exact fractions of a cent: [numerator, denominator], the denominator above zero. */
const gcd = (/** @type {bigint} */ a, /** @type {bigint} */ b) => {
  let [x, y] = [a < 0n ? -a : a, b];
  while (y) [x, y] = [y, x % y];
  return x;
};
/** @param {bigint} n @param {bigint} [d] @returns {[bigint, bigint]} */
const q = (n, d = 1n) => {
  const g = gcd(n, d) || 1n;
  return [n / g, d / g];
};
/** @typedef {[bigint, bigint]} Q */
const add = (/** @type {Q} */ [a, b], /** @type {Q} */ [c, e]) => q(a * e + c * b, b * e);
const sub = (/** @type {Q} */ x, /** @type {Q} */ [c, e]) => add(x, [-c, e]);
const mul = (/** @type {Q} */ [a, b], /** @type {Q} */ [c, e]) => q(a * c, b * e);
const gt = (/** @type {Q} */ [a, b], /** @type {Q} */ [c, e]) => a * e > c * b;
const min = (/** @type {Q} */ x, /** @type {Q} */ y) => (gt(x, y) ? y : x);
const max = (/** @type {Q} */ x, /** @type {Q} */ y) => (gt(y, x) ? y : x);
const percent = (/** @type {number} */ rate) => q(BigInt(rate), 100n);
const ZERO = q(0n);
const SCALES = new Map(Object.entries(RESIDENT_SCALES));
/** Cents, half up (away from zero), as a number. @param {Q} value */
const toCents = ([n, d]) => {
  const whole = ((n < 0n ? -n : n) * 2n + d) / (2n * d);
  return Number(n < 0n ? -whole : whole);
};

/** The tax at a scale of [dollars the band starts above, rate per cent] on an amount in cents. */
function scaleTax(/** @type {number[][]} */ scale, /** @type {Q} */ income) {
  return scale.reduce((tax, [low, rate], i) => {
    const next = scale.at(i + 1);
    const ceiling = next ? min(income, q(BigInt(next[0]) * 100n)) : income;
    return add(tax, mul(max(ZERO, sub(ceiling, q(BigInt(low) * 100n))), percent(rate)));
  }, ZERO);
}

/** ITRA s 13(10) for a resident, s 15(8) for a foreign resident: the phase-out limit in whole
 * dollars, rounded down. @param {number[][]} scale @param {boolean} resident */
const phaseOut = (scale, resident) => Math.floor(NIL_BAND * (resident ? PHASE_IN : PHASE_IN - scale[0][1])
  / (PHASE_IN - scale[scale.length - 1][1]));

const unknown = (/** @type {string} */ key, /** @type {string} */ only) => refuse('input.field_unknown',
  `${key} is an input only for ${only}`);
const flag = (/** @type {unknown} */ value, /** @type {string} */ name) => (typeof value === 'boolean' ? value
  : refuse('input.flag_invalid', `${name} must be a boolean.`));
const isObject = (/** @type {unknown} */ value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A top-level amount: a decimal string the command can read, then a money amount. */
function readable(/** @type {unknown} */ value) {
  if (typeof value !== 'string') return;
  if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', 'Decimal input exceeds 8192 bytes.');
  try {
    commandCents(value);
  } catch (error) {
    if (error.code === 'input.decimal_unreadable') throw error;
  }
}
const money = (/** @type {unknown} */ value) => (typeof value === 'string' ? commandCents(value)
  : refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.'));

/** An amount inside an item: a decimal string of at most 32 characters, as a money amount. */
function statedCents(/** @type {Map<string, unknown>} */ fields, /** @type {string} */ name, /** @type {string} */ key) {
  if (!fields.has(key)) refuse('input.missing_field', `${name}: ${key} is required`);
  const value = fields.get(key);
  try {
    if (typeof value === 'string' && new TextEncoder().encode(value).length <= 32) return commandCents(value);
  } catch {
    // Refused below with the item's code.
  }
  return refuse('input.amount_invalid', `${name}: ${key} must be a decimal string, finite and non-negative, at most 2dp and 1e12.`);
}

function knownKeys(/** @type {Map<string, unknown>} */ fields, /** @type {string} */ name, /** @type {string[]} */ allowed) {
  const key = [...fields.keys()].find((k) => !allowed.includes(k));
  if (key !== undefined) refuse('input.field_unknown', `${name}: ${key} is not an input of this item`);
}

/** A list of at most 50 objects, each as a map of its fields, or the refusal code. @returns {Map<string, unknown>[]} */
function items(/** @type {unknown} */ given, /** @type {string} */ code, /** @type {string} */ what) {
  if (Array.isArray(given) && given.length <= MAX_ITEMS && given.every(isObject)) {
    return given.map((item) => new Map(Object.entries(item)));
  }
  return refuse(code, `${what} must be a list of at most ${MAX_ITEMS} objects.`);
}

/** s 102AC(6) to (8): full time on the last day or for 3 months in the year, intending full-time
 * occupation and not full-time education next year. */
function fullTimeTest(/** @type {unknown} */ given) {
  if (!isObject(given)) {
    refuse('input.missing_field', 'full_time_occupation must be an object with the 4 facts of the test.');
  }
  const fields = new Map(Object.entries(/** @type {object} */ (given)));
  knownKeys(fields, 'full_time_occupation', FULL_TIME_FACTS);
  const [onLastDay, threeMonths, occupationNext, educationNext] = FULL_TIME_FACTS.map((key) => {
    if (!fields.has(key)) refuse('input.missing_field', `full_time_occupation: ${key} is required`);
    const fact = fields.get(key);
    return typeof fact === 'boolean' ? fact
      : refuse('input.flag_invalid', `full_time_occupation: ${key} must be a boolean.`);
  });
  return (onLastDay || threeMonths) && occupationNext && !educationNext;
}

/** The excepted person ground's paragraph and whether it holds, or null when no ground applies. */
function exceptedPerson(/** @type {Map<string, unknown>} */ given, /** @type {boolean} */ under18) {
  const ground = given.get('excepted_person');
  const [fullTime, dependent] = OPTIONAL.map((key) => given.get(key));
  if (ground === 'none') {
    const stated = OPTIONAL.find((key) => given.get(key) !== undefined);
    if (stated) unknown(stated, 'an excepted person ground');
    return null;
  }
  const citation = typeof ground === 'string' ? PERSON_GROUNDS.get(ground) : undefined;
  if (citation === undefined) {
    refuse('minors_income.excepted_person_invalid', 'excepted_person must be none or a ground of ITAA 1936 s 102AC(2).');
  }
  // A person 18 or over on 30 June is not prescribed whatever the ground (s 102AC(1)(a)).
  if (!under18) return null;
  const needsDependency = DEPENDENCY_GROUNDS.includes(/** @type {string} */ (ground));
  if (fullTime !== undefined && ground !== 'full_time_occupation') unknown('full_time_occupation', 'the full_time_occupation ground');
  if (dependent !== undefined && !needsDependency) unknown('dependent_on_relatives', 'grounds (e), (f) and (g)');
  if (ground === 'full_time_occupation') return { citation, holds: fullTimeTest(fullTime) };
  if (needsDependency && dependent === undefined) {
    refuse('input.missing_field', 'dependent_on_relatives is required for this ground (s 102AC(3), (4)).');
  }
  return { citation, holds: needsDependency ? !flag(dependent, 'dependent_on_relatives') : true };
}

/**
 * The command's result for its inputs, without scope_confirmed: amounts in cents, rounded half up.
 * @param {Record<string, unknown>} input
 */
export function minorsIncome(input) {
  const unknownKey = Object.keys(input).find((key) => !PARAMS.some(([name]) => name === key) && !OPTIONAL.includes(key));
  if (unknownKey !== undefined) refuse('input.field_unknown', `${unknownKey} is not an input of minors-income`);
  const given = new Map(Object.entries(input));
  for (const [key, kind] of PARAMS) {
    if (!given.has(key)) refuse('input.missing_field', `${key} is required`);
    if (kind === 'dec') readable(given.get(key));
  }
  const year = /** @type {string} */ (input.year);
  if (!MINORS_YEARS.includes(year)) {
    refuse('period.unsupported', `Unsupported period ${String(year)}; supported: ${MINORS_YEARS.join(', ')}.`);
  }
  if (flag(input.special_income_component, 'special_income_component')) {
    refuse('minors_income.special_income_component', 'Taxable income that includes a special income component (an '
      + 'abnormal income amount, Income Tax Rates Act 1986 s 3(1)) is taxed under Schedule 11 clause 3’s formula, '
      + 'which this calculator does not take.');
  }
  if (input.residency !== 'resident' && input.residency !== 'foreign_resident') {
    refuse('minors_income.residency_invalid', 'residency must be resident or foreign_resident.');
  }
  const resident = input.residency === 'resident';
  const taxableCents = money(input.taxable_income);
  if (taxableCents % 100n !== 0n) refuse('input.amount_not_whole_dollars', 'Supply established whole-dollar taxable income.');
  const under18 = flag(input.under_18_on_30_june, 'under_18_on_30_june');
  const person = exceptedPerson(given, under18);
  const prescribed = under18 && !person?.holds;

  let excepted = 0n;
  items(input.excepted_income, 'minors_income.excepted_income_invalid', 'excepted_income').forEach((fields, i) => {
    const name = `excepted income item ${i + 1}`;
    knownKeys(fields, name, ['ground', 'amount']);
    if (!fields.has('ground')) refuse('input.missing_field', `${name}: ground is required`);
    if (!INCOME_GROUNDS.includes(/** @type {string} */ (fields.get('ground')))) {
      refuse('minors_income.excepted_income_invalid', `${name}: ground must be one of ITAA 1936 s 102AE(2).`);
    }
    excepted += statedCents(fields, name, 'amount');
  });
  let [trustExcepted, trustEligible] = [0n, 0n];
  items(input.trust_shares, 'minors_income.trust_shares_invalid', 'trust_shares').forEach((fields, i) => {
    const name = `trust share ${i + 1}`;
    knownKeys(fields, name, ['amount', 'division_6aa_part']);
    const amount = statedCents(fields, name, 'amount');
    const part = statedCents(fields, name, 'division_6aa_part');
    if (part > amount) refuse('minors_income.trust_shares_invalid', `${name}: division_6aa_part exceeds amount.`);
    trustExcepted += amount - part;
    trustEligible += part;
  });
  const other = money(input.other_assessable_income);
  // s 102AG(1) applies only to a prescribed beneficiary; otherwise the whole share is excepted.
  const [exceptedTotal, eligibleAssessable] = prescribed ? [excepted + trustExcepted, other + trustEligible]
    : [excepted + trustExcepted + trustEligible, other];
  const [exclusive, related, apportionable] = ['deductions_exclusive', 'deductions_related', 'apportionable_deductions']
    .map((key) => money(given.get(key)));
  if (taxableCents > eligibleAssessable + exceptedTotal) {
    refuse('minors_income.facts_inconsistent', 'taxable_income exceeds the assessable income given.');
  }

  // s 102AD: eligible assessable income less the deductions in (a) and (b), then the apportioned
  // part of apportionable deductions in (c), nil if negative.
  const taxable = q(taxableCents);
  let [apportioned, eligible] = [ZERO, ZERO];
  const before = eligibleAssessable - exclusive - related;
  if (prescribed && before > 0n) {
    const base = taxableCents + apportionable;
    apportioned = base === 0n ? ZERO : q(apportionable * before, base);
    eligible = max(ZERO, sub(q(before), apportioned));
  }
  if (gt(eligible, taxable)) {
    refuse('minors_income.facts_inconsistent', 'Eligible taxable income exceeds taxable income: a loss or deduction '
      + 'against excepted income, which this calculator does not take.');
  }

  // ITRA s 13, s 15 and Schedule 11.
  const residentScale = /** @type {number[][]} */ (SCALES.get(year));
  const scale = resident ? residentScale : FOREIGN_SCALE;
  const limit = phaseOut(scale, resident);
  const secondRate = residentScale[1][1];
  const rest = sub(taxable, eligible);
  const taxOther = scaleTax(scale, rest);
  const top = sub(scaleTax(scale, taxable), taxOther);
  const nilBand = q(BigInt(NIL_BAND) * 100n);
  const excess = sub(eligible, nilBand);
  const atSpecial = mul(percent(SPECIAL_RATE), eligible);
  const capped = (/** @type {Q} */ floor) => min(atSpecial, max(floor, top));
  const limitCents = q(BigInt(limit) * 100n);
  let rule;
  let taxEligible;
  if (eligible[0] === 0n || (resident && !gt(eligible, nilBand))) {
    [rule, taxEligible] = ['ordinary', top];
  } else if (resident && !gt(eligible, limitCents)) {
    [rule, taxEligible] = ['resident_cap', capped(mul(percent(PHASE_IN), excess))];
  } else if (!resident && !gt(eligible, nilBand)) {
    [rule, taxEligible] = ['foreign_nil_cap', capped(mul(percent(secondRate), eligible))];
  } else if (!resident && !gt(eligible, limitCents)) {
    [rule, taxEligible] = ['foreign_cap', capped(add(mul(percent(secondRate), nilBand), mul(percent(PHASE_IN), excess)))];
  } else {
    [rule, taxEligible] = ['special', atSpecial];
  }
  return {
    year, resident, under18, person, prescribed, rule, phaseOutLimit: limit, secondRate,
    exceptedTotal: Number(exceptedTotal), eligibleAssessable: Number(eligibleAssessable), apportioned: toCents(apportioned),
    eligible: toCents(eligible), otherIncome: toCents(rest), taxOther: toCents(taxOther), taxEligible: toCents(taxEligible),
    total: toCents(add(taxOther, taxEligible)),
  };
}

const RULES = {
  ordinary: 'No special rate applies: eligible taxable income is nil or, for a resident, $416 or less (ITRA s 13(1)(b)), so '
    + 'all taxable income is taxed at ordinary rates; the part shown against eligible taxable income is the top slice of that tax',
  resident_cap: '45% of eligible taxable income (ITRA Schedule 11 Part I clause 2), but no more than the greater of 66% of the '
    + 'excess over $416 and the top slice of ordinary tax, up to the phase-out limit (s 13(2))',
  foreign_nil_cap: '45% of eligible taxable income (ITRA Schedule 11 Part II clause 2), but no more than the greater of the second '
    + 'resident personal tax rate times eligible taxable income and the top slice of ordinary tax (s 15(2)(a))',
  foreign_cap: '45% of eligible taxable income (ITRA Schedule 11 Part II clause 2), but no more than the greater of the second '
    + 'resident personal tax rate times $416 plus 66% of the excess over $416 and the top slice of ordinary tax, up to the '
    + 'phase-out limit (s 15(2)(b))',
  special: '45% of eligible taxable income above the phase-out limit (ITRA Schedule 11 clause 2)',
};

/** The page's minors' income form. @param {(name: string) => string} value @param {(n: number) => string} aud */
export function minorsIncomeResult(value, aud) {
  const ground = value('mi-person');
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  const excepted = [['employment', value('mi-employment')], ['business', value('mi-business')],
    [value('mi-other-ground'), value('mi-other-amount')]].filter(([, amount]) => Number(amount) !== 0);
  const share = [value('mi-trust'), value('mi-trust-part')];
  const r = minorsIncome({
    year: value('mi-year'), taxable_income: value('mi-taxable'), residency: value('mi-residency'),
    under_18_on_30_june: yes('mi-under-18'), excepted_person: ground,
    excepted_income: excepted.map(([g, amount]) => ({ ground: g, amount })),
    trust_shares: Number(share[0]) === 0 && Number(share[1]) === 0 ? [] : [{ amount: share[0], division_6aa_part: share[1] }],
    other_assessable_income: value('mi-other'), deductions_exclusive: value('mi-exclusive'),
    deductions_related: value('mi-related'), apportionable_deductions: value('mi-apportionable'),
    special_income_component: yes('mi-special'),
    ...(ground === 'full_time_occupation' ? { full_time_occupation: Object.fromEntries(
      ['engaged_on_last_day', 'three_months_in_year', 'intends_full_time_occupation_next_year',
        'intends_full_time_education_next_year'].map((key, i) => [key, yes(`mi-ft-${i + 1}`)])) } : {}),
    ...(DEPENDENCY_GROUNDS.includes(ground) ? { dependent_on_relatives: yes('mi-dependent') } : {}),
  });
  const cents = (/** @type {number} */ amount) => aud(amount / 100);
  const why = !r.under18 ? 'Not under 18 on 30 June, so not a prescribed person (ITAA 1936 s 102AC(1))'
    : r.person?.holds ? `An excepted person (ITAA 1936 ${r.person.citation}), so not a prescribed person`
      : 'A prescribed person (ITAA 1936 s 102AC)';
  return {
    inputs: `${r.year}, ${r.resident ? 'Australian resident' : 'foreign resident'}, taxable income ${cents(Number(money(value('mi-taxable'))))}, `
      + `${r.under18 ? 'under 18' : '18 or over'} on 30 June${ground === 'none' ? '' : `, excepted person ground ${ground.replaceAll('_', ' ')}`}`,
    principal: 7,
    rows: [['Excepted assessable income', cents(r.exceptedTotal)], ['Eligible assessable income', cents(r.eligibleAssessable)],
      ['Apportioned deductions', cents(r.apportioned)], ['Eligible taxable income', cents(r.eligible)],
      ['Other taxable income', cents(r.otherIncome)], ['Tax on other taxable income', cents(r.taxOther)],
      ['Tax on eligible taxable income', cents(r.taxEligible)], ['Basic income tax', cents(r.total)]],
    note: `${why}. ${r.prescribed ? `${RULES[r.rule]}.` : 'Ordinary rates apply to all taxable income.'} This is basic income tax `
      + 'before offsets and the Medicare levy; a prescribed person’s low income tax offset cannot exceed the tax on other '
      + 'taxable income (ITAA 1997 s 61-115(2) and (3))',
  };
}
