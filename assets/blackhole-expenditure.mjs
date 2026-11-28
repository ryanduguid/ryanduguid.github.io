// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Business capital expenditure, the 'blackhole' deduction of ITAA 1997 s 40-880, item by item: the
// `business-capital-expenditure` command of ryanduguid/australian-accounting ported line for line, with its inputs,
// order of checks, refusal codes, citations and rounding. Each item is deducted in equal fifths over 5 income years
// from the year incurred (s 40-880(2)), or in full that year as a start-up cost (s 40-880(2A)), to the extent
// s 40-880(3) or (4) allows and unless s 40-880(4)(b), (5), (7), (8) or (9) excludes it. The command cites ITAA 1997
// compilation 268 (1 October 2026), in which s 40-880 was last amended by Act No 92 of 2020; s 40-880 read on the
// Federal Register of Legislation on 26 November 2026. Amounts are worked in the command's 40-digit decimal context
// rounded half even; each total is shown to the cent half up.

import { cents, cmp, d, div, mul, refuse, rounded, stripSpace, ZERO } from './gst-adjustments.mjs';

export const BLACKHOLE_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27', '2027-28'];
const FIRST_INCURRED = 2020;
const FIELDS = ['items', 'year', 'scope_confirmed'];

/** Each paragraph an item may state excludes it, with its citation. */
export const BLACKHOLE_EXCLUSIONS = /** @type {const} */ ([
  ['5(a)', 'ITAA 1997 s 40-880(5)(a): it forms part of the cost of a depreciating asset you hold, used to hold or will hold'],
  ['5(b)', 'ITAA 1997 s 40-880(5)(b): you can deduct an amount for it under another provision'],
  ['5(c)', 'ITAA 1997 s 40-880(5)(c): it forms part of the cost of land'],
  ['5(d)', 'ITAA 1997 s 40-880(5)(d): it is in relation to a lease or other legal or equitable right'],
  ['5(e)', 'ITAA 1997 s 40-880(5)(e): it would otherwise be taken into account in working out a profit included in assessable income or a loss you can deduct'],
  ['5(f)', 'ITAA 1997 s 40-880(5)(f): it could otherwise be taken into account in working out a capital gain or capital loss from a CGT event'],
  ['5(g)', 'ITAA 1997 s 40-880(5)(g): another provision would expressly make it non-deductible if it were not capital'],
  ['5(h)', 'ITAA 1997 s 40-880(5)(h): another provision expressly prevents it being taken into account as s 40-880(5)(a) to (f) describe, for a reason other than its being capital'],
  ['5(i)', 'ITAA 1997 s 40-880(5)(i): it is of a private or domestic nature'],
  ['5(j)', 'ITAA 1997 s 40-880(5)(j): it is incurred in relation to gaining or producing exempt income or non-assessable non-exempt income'],
  ['8', 'ITAA 1997 s 40-880(8): a market value substitution rule excluded it from the cost of a depreciating asset or the cost base or reduced cost base of a CGT asset'],
  ['9(a)', 'ITAA 1997 s 40-880(9)(a): it is incurred by way of returning an amount you received that was not included in your assessable income'],
  ['9(b)', 'ITAA 1997 s 40-880(9)(b): for another entity it is a return on or of an equity interest, or of a debt interest that is your obligation'],
]);

/** The paragraph of s 40-880(2) each kind of business falls in. */
const BUSINESSES = /** @type {const} */ ([
  ['current', 'ITAA 1997 s 40-880(2)(a): capital expenditure in relation to your business'],
  ['former', 'ITAA 1997 s 40-880(2)(b): capital expenditure in relation to a business that used to be carried on'],
  ['proposed', 'ITAA 1997 s 40-880(2)(c): capital expenditure in relation to a business proposed to be carried on'],
  ['wind_up', 'ITAA 1997 s 40-880(2)(d): capital expenditure to liquidate or deregister a company of which you were a member, or to wind up a partnership or trust in which you were a partner or beneficiary, that carried on a business'],
]);

const OWN_LIMIT = 'ITAA 1997 s 40-880(3): to the extent the business you carry on, used to carry on or propose to carry on is, was or is proposed to be carried on for a taxable purpose';
const OTHER_LIMIT = 'ITAA 1997 s 40-880(4)(a): to the extent the business another entity used to carry on or proposes to carry on was or is proposed to be carried on for a taxable purpose';
const NOT_CONNECTED = 'ITAA 1997 s 40-880(4)(b): it is not in connection with your deriving assessable income from the business and with the business itself';
const NOT_REASONABLE_TIME = 'ITAA 1997 s 40-880(7): it is not reasonable to conclude that the business is proposed to be carried on within a reasonable time';
const GOODWILL = 'ITAA 1997 s 40-880(6): s 40-880(5)(d) and (f) do not apply, as the expenditure preserves (but does not enhance) the value of goodwill and is in relation to a right whose value is solely attributable to its effect on goodwill';
const FIVE_YEARS = "ITAA 1997 s 40-880(2): in equal proportions over 5 income years starting in the year incurred, one fifth a year, not apportioned for part of a year (TR 2011/6 para 10, the Commissioner's view)";

const START_UP = /** @type {const} */ ([
  ['advice_or_services', 'advice or services relating to the proposed structure or operation of the business (s 40-880(2A)(b)(i))'],
  ['government_fees', 'fees, taxes or charges paid to an Australian government agency relating to establishing the business or its operating structure (s 40-880(2A)(b)(ii))'],
  ['neither', ''],
]);
const ENTITY_TESTS = /** @type {const} */ ([
  ['small_business_entity', 'a small business entity (s 40-880(2A)(c))'],
  ['covered_by_2b', 'an entity covered by s 40-880(2B), which would be a small business entity at $50 million (s 40-880(2A)(c))'],
  ['not_in_business_and_unconnected', 'an entity carrying on no business, not connected with or an affiliate of one that carries on a business and is neither a small business entity nor covered by s 40-880(2B) (s 40-880(2A)(c)(i) and (ii))'],
  ['none', ''],
]);
const WHO = /** @type {const} */ ([['you', ''], ['another_entity', '']]);

/** `text` without its trailing zeros, by a scan rather than a pattern. @param {string} text */
const trimZeros = (text) => {
  let end = text.length;
  while (end > 0 && text.charAt(end - 1) === '0') end -= 1;
  return text.slice(0, end);
};

/** `2026-27` for 2026. @param {number} first */
const yearText = (first) => `${first}-${String((first + 1) % 100).padStart(2, '0')}`;
/** 2026 for `2026-27`; null for text that is not an income year. @param {unknown} text */
const yearFirst = (text) => {
  if (typeof text !== 'string' || !/^\d{4}/.test(text)) return null;
  const first = Number(text.slice(0, 4));
  return yearText(first) === text ? first : null;
};

/** A decimal as the command reads it: plain digits with an optional minus and point, Python's whitespace
 * stripped; null for anything else. @param {unknown} value @returns {{c: bigint, e: number, text: string} | null} */
function decimal(value) {
  if (typeof value !== 'string') return null;
  const text = stripSpace(value);
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text); // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!parts) return null;
  const v = d(`${parts[2]}${parts[3] === undefined ? '' : `.${parts[3]}`}`);
  // Decimal's fixed form: the sign, the whole part without leading zeros and the places as written.
  const whole = parts[2].replace(/^0+(?=\d)/, '');
  return { c: parts[1] ? -v.c : v.c, e: v.e, text: `${parts[1]}${whole}${parts[3] === undefined ? '' : `.${parts[3]}`}` };
}

/** An exact amount with at least 2 decimal places and no trailing zeros beyond them. Every amount it writes is
 * non-negative: an item's amount (refused below nil), its share of it at a taxable purpose from 0 to 1 and the
 * fifths of that. @param {{c: bigint, e: number}} v */
function exact(v) {
  const digits = v.c.toString();
  let whole;
  let fraction;
  if (v.e >= 0) {
    whole = digits + '0'.repeat(v.e);
    fraction = '';
  } else {
    const padded = digits.padStart(-v.e + 1, '0');
    whole = padded.slice(0, padded.length + v.e);
    fraction = padded.slice(padded.length + v.e);
  }
  return `${whole}.${trimZeros(fraction).padEnd(2, '0')}`;
}

/** @param {number} n @param {string} key @param {string} why @returns {never} */
function missing(n, key, why) {
  return refuse('business_capital.fact_missing', `item ${n}: ${key} is required: ${why}.`);
}
/** @param {number} n @param {string} key @param {string} expected @returns {never} */
function invalid(n, key, expected) {
  return refuse('business_capital.fact_invalid', `item ${n}: ${key} must be ${expected}.`);
}
/** @returns {never} */
function itemsInvalid() {
  return refuse('business_capital.items_invalid', 'items must be a non-empty list of objects, one for each item of capital expenditure.');
}

/** The stated facts of one item, each read once. @param {number} n @param {Record<string, unknown>} fields */
function facts(n, fields) {
  /** @type {string[]} */
  const taken = [];
  /** @param {string} key @param {string} why */
  const get = (key, why) => {
    taken.push(key);
    if (!Object.hasOwn(fields, key)) missing(n, key, why);
    return fields[key]; // eslint-disable-line security/detect-object-injection -- the key is one of this module's own constants
  };
  return {
    get,
    /** @param {string} key @param {string} why */
    flag(key, why) {
      const value = get(key, why);
      if (typeof value !== 'boolean') invalid(n, key, 'a JSON boolean');
      return value;
    },
    /** @param {string} key @param {readonly (readonly [string, string])[]} options @param {string} why
     * @returns {readonly [string, string]} */
    choice(key, options, why) {
      const given = get(key, why);
      const found = options.find(([name]) => name === given);
      return found ?? invalid(n, key, `one of ${options.map(([name]) => name).join(', ')}`);
    },
    /** @param {string} key */
    decimal: (key) => decimal(get(key, 'every item states it')),
    noneLeft() {
      const extra = Object.keys(fields).find((key) => !taken.includes(key));
      if (extra !== undefined) refuse('input.field_unknown', `item ${n}: ${extra} is not a fact this item takes beside its other facts`);
    },
  };
}

/** @typedef {{amount: {c: bigint, e: number}, incurred: number, business: string, limit: string,
 *   share: {c: bigint, e: number, text: string}, excludedBy: string[], immediate: string | null, notes: string[]}} Item */

/** One item from its stated facts. @param {number} n @param {unknown} value @param {number} year @returns {Item} */
function readItem(n, value, year) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) itemsInvalid();
  const f = facts(n, /** @type {Record<string, unknown>} */ (value));
  const amount = f.decimal('amount');
  if (amount === null || amount.c < 0n || amount.e < -2 || cmp(amount, d('1000000000000')) > 0) {
    refuse('input.amount_invalid', `item ${n}: amount must be a finite non-negative decimal string, at most 2dp and 1e12.`);
  }
  const incurred = yearFirst(f.get('incurred_in', 'every item states it'));
  if (incurred === null) invalid(n, 'incurred_in', 'an income year such as "2025-26"');
  if (incurred < FIRST_INCURRED) {
    refuse('business_capital.incurred_before_july_2020', `item ${n}: expenditure incurred before 1 July 2020 is out of scope: s 40-880 as amended by Act No 92 of 2020 applies from then, and this worksheet does not hold the earlier form.`);
  }
  if (incurred > year) {
    refuse('business_capital.incurred_after_year', `item ${n}: it was incurred in ${yearText(incurred)}, after the ${yearText(year)} income year asked about.`);
  }
  if (!f.flag('capital', 'the operator establishes that the outlay is capital expenditure')) {
    refuse('business_capital.not_capital', `item ${n}: s 40-880 deducts capital expenditure only; a revenue outlay is a question for s 8-1, which this worksheet does not decide.`);
  }
  /** @type {Item} */
  const item = { amount, incurred, business: '', limit: '', share: { c: 1n, e: 0, text: '1' }, excludedBy: [], immediate: null, notes: [] };
  const [kind, paragraph] = f.choice('business', BUSINESSES, 'every item states it');
  item.business = paragraph;
  let another = kind === 'wind_up';
  if (kind === 'former' || kind === 'proposed') {
    another = f.choice('carried_on_by', WHO, 's 40-880(3) limits your own former or proposed business and s 40-880(4) another entity\'s')[0] === 'another_entity';
  }
  item.limit = another ? OTHER_LIMIT : OWN_LIMIT;
  if (another && !f.flag('assessable_income_connection', 's 40-880(4)(b) limits expenditure on another entity\'s business')) item.excludedBy.push(NOT_CONNECTED);
  if (kind === 'proposed') {
    if (!f.flag('within_reasonable_time', 's 40-880(7) limits expenditure on a proposed business')) item.excludedBy.push(NOT_REASONABLE_TIME);
    startUp(f, item);
  }
  const share = f.decimal('taxable_purpose');
  if (share === null || cmp(share, ZERO) < 0 || cmp(share, d('1')) > 0) {
    refuse('input.fraction_invalid', `item ${n}: taxable_purpose must be a finite decimal fraction from 0 to 1.`);
  }
  item.share = share;
  const goodwill = exclusions(n, f, item);
  if (goodwill) item.notes.push(GOODWILL);
  f.noneLeft();
  return item;
}

/** s 40-880(2A): whether a proposed business's expenditure is deducted at once. @param {ReturnType<typeof facts>} f @param {Item} item */
function startUp(f, item) {
  const [kind, kindText] = f.choice('start_up_expense', START_UP, 's 40-880(2A)(b) decides whether a proposed business\'s expenditure is deducted at once');
  if (kind === 'neither') {
    item.notes.push('s 40-880(2A)(b) is not met: the expenditure is neither advice or services nor a government agency\'s fee, tax or charge, so s 40-880(2) spreads it');
    return;
  }
  const [test, testText] = f.choice('entity_test', ENTITY_TESTS, 's 40-880(2A)(c) decides who deducts start-up expenditure at once');
  if (test === 'none') {
    item.notes.push('s 40-880(2A)(c) is not met for the income year incurred, so s 40-880(2) spreads it');
    return;
  }
  item.immediate = `ITAA 1997 s 40-880(2A): all of it in the income year incurred, as ${kindText} for a business proposed to be carried on, incurred by ${testText} for that year`;
}

/** The stated exclusions: refuses s 40-880(5)(a) and (f), cites the rest and returns whether s 40-880(6) applied.
 * @param {number} n @param {ReturnType<typeof facts>} f @param {Item} item */
function exclusions(n, f, item) {
  const expected = 'a list of the paragraphs of s 40-880 that exclude the expenditure, each once, from "5(a)" to "5(j)", "8", "9(a)" and "9(b)"; [] when none does';
  const given = f.get('exclusions', 'every item states the exclusions in s 40-880(5), (8) and (9) that apply, [] for none');
  if (!Array.isArray(given)) invalid(n, 'exclusions', expected);
  /** @type {string[]} */
  const labels = [];
  for (const value of /** @type {unknown[]} */ (given)) {
    const found = BLACKHOLE_EXCLUSIONS.find(([label]) => label === value);
    if (!found || labels.includes(found[0])) return invalid(n, 'exclusions', expected);
    labels.push(found[0]);
  }
  if (labels.includes('5(a)')) {
    refuse('business_capital.depreciating_asset_cost', `item ${n}: s 40-880(5)(a) excludes expenditure that forms part of the cost of a depreciating asset; it is deducted as the asset's decline in value under Division 40 (s 40-25, with its cost under Subdivision 40-C), which this worksheet does not work out.`);
  }
  const goodwill = (labels.includes('5(d)') || labels.includes('5(f)'))
    && f.flag('goodwill_right', 's 40-880(6) decides whether s 40-880(5)(d) and (f) apply to expenditure preserving goodwill');
  if (labels.includes('5(f)') && !goodwill) {
    refuse('business_capital.cgt_amount', `item ${n}: s 40-880(5)(f) excludes expenditure that could be taken into account in working out a capital gain or loss; the CGT provisions take it, in the cost base (s 110-25), reduced cost base (s 110-55) or capital proceeds (s 116-20), which this worksheet does not work out.`);
  }
  for (const [label, citation] of BLACKHOLE_EXCLUSIONS) {
    if (labels.includes(label) && !(goodwill && (label === '5(d)' || label === '5(f)'))) item.excludedBy.push(citation);
  }
  return goodwill;
}

/** @param {{c: bigint, e: number}} a @param {{c: bigint, e: number}} b */
const add = (a, b) => {
  const e = Math.min(a.e, b.e);
  return rounded(a.c * 10n ** BigInt(a.e - e) + b.c * 10n ** BigInt(b.e - e), e);
};
const FIVE = d('5');

/**
 * @typedef {{income_year: string, deduction: string}} BlackholeYear
 * @typedef {{item: number, incurred_in: string, amount: string, business: string, limit: string, taxable_purpose: string,
 *   excluded_by: string[], deductible_expenditure: string, method: string | null, deduction: string, schedule: BlackholeYear[],
 *   notes: string[]}} BlackholeRow
 * @typedef {{period: string, amounts: {expenditure: string, deductible_expenditure: string, deduction: string,
 *   remaining_expenditure_after_year: string}, rates: {items: string}, items: BlackholeRow[], totalDeduction: number,
 *   remaining: number, deductibleExpenditure: number}} BlackholeResult
 */

/** One item's terms in the 4 amounts and its row. @param {Item} it @param {number} n @param {number} year */
function worked(it, n, year) {
  const excluded = it.excludedBy.length > 0;
  const deductible = excluded ? ZERO : mul(it.amount, it.share);
  let deduction = ZERO;
  let remaining = ZERO;
  /** @type {[number, {c: bigint, e: number}][]} */
  let schedule = [];
  if (!excluded && it.immediate !== null) {
    deduction = it.incurred === year ? deductible : ZERO;
    schedule = [[it.incurred, deductible]];
  } else if (!excluded) {
    const fifth = div(deductible, FIVE);
    const later = it.incurred + 4 - year;
    if (later >= 0) deduction = fifth;
    if (later > 0) remaining = div(mul(deductible, d(String(later))), FIVE);
    schedule = [0, 1, 2, 3, 4].map((k) => [it.incurred + k, fifth]);
  }
  /** @type {BlackholeRow} */
  const row = { item: n, incurred_in: yearText(it.incurred), amount: exact(it.amount), business: it.business, limit: it.limit,
    taxable_purpose: it.share.text, excluded_by: it.excludedBy, deductible_expenditure: exact(deductible),
    method: excluded ? null : it.immediate ?? FIVE_YEARS, deduction: exact(deduction),
    schedule: schedule.map(([first, value]) => ({ income_year: yearText(first), deduction: exact(value) })), notes: it.notes };
  return { terms: [it.amount, deductible, deduction, remaining], row };
}

/** ITAA 1997 s 40-880: the deduction for `year` of each item of business capital expenditure, the totals and what
 * is left for later years. @param {{items: unknown, year: unknown, scope_confirmed: unknown}} input @returns {BlackholeResult} */
export function businessCapitalExpenditure(input) {
  const extra = Object.keys(input).find((key) => !FIELDS.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not an input of business-capital-expenditure.`);
  for (const key of FIELDS) if (!(key in input)) refuse('input.missing_field', `${key} is required.`);
  if (input.scope_confirmed !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  if (typeof input.year !== 'string' || !BLACKHOLE_YEARS.includes(input.year)) {
    refuse('period.unsupported', `Choose an income year from ${BLACKHOLE_YEARS[0]} to ${BLACKHOLE_YEARS.at(-1)}.`);
  }
  const first = Number(input.year.slice(0, 4));
  if (!Array.isArray(input.items) || input.items.length === 0) itemsInvalid();
  const items = /** @type {unknown[]} */ (input.items).map((value, i) => readItem(i + 1, value, first));
  const totals = [ZERO, ZERO, ZERO, ZERO];
  const rows = items.map((it, i) => {
    const { terms, row } = worked(it, i + 1, first);
    terms.forEach((term, k) => { totals[k] = i === 0 ? term : add(totals[k], term); }); // eslint-disable-line security/detect-object-injection -- k is an index of a 4-element array
    return row;
  });
  const [expenditure, deductibleExpenditure, deduction, remaining] = totals.map(cents);
  return { period: input.year, amounts: { expenditure, deductible_expenditure: deductibleExpenditure, deduction,
    remaining_expenditure_after_year: remaining }, rates: { items: String(items.length) }, items: rows,
  totalDeduction: Number(deduction), remaining: Number(remaining), deductibleExpenditure: Number(deductibleExpenditure) };
}

/** Up to this many items on the page; the WebMCP tool takes any number. */
export const BLACKHOLE_PAGE_ITEMS = 2;
const BUSINESS_WORDS = /** @type {Record<string, string>} */ ({ current: 'your business', former: 'a former business',
  proposed: 'a proposed business', wind_up: 'winding up a company, partnership or trust' });

/** Moves a decimal point in digit text: `shift(text, -2)` divides by 100. @param {string} whole @param {string} part @param {number} by */
function shift(whole, part, by) {
  const all = `${whole}${part}`;
  const at = whole.length + by;
  const padded = at < 1 ? `${'0'.repeat(1 - at)}${all}` : all.padEnd(at, '0');
  const point = Math.max(at, 1);
  const head = padded.slice(0, point).replace(/^0+(?=\d)/, '');
  const tail = trimZeros(padded.slice(point));
  return tail ? `${head}.${tail}` : head;
}

/** A percentage as typed, as the fraction the command takes ('75' is '0.75'). @param {string} text */
export function percentFraction(text) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim()); // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!m) throw new Error('Enter the taxable purpose as a percentage from 0 to 100, such as 75.');
  return shift(m[1], m[2] ?? '', -2);
}

/** A fraction the command takes as a percentage ('0.75' is '75'). @param {string} text */
const fractionPercent = (text) => {
  const [whole, part = ''] = text.split('.');
  return shift(whole, part, 2);
};

/** The form's items as the command's call: an item is left out when its amount is blank, and each takes only the
 * facts its business, exclusion and start-up answers call for. @param {(name: string) => string} value */
export function blackholeFormInput(value) {
  const items = [];
  for (let n = 1; n <= BLACKHOLE_PAGE_ITEMS; n += 1) {
    const field = (/** @type {string} */ name) => value(`item-${n}-${name}`);
    if (field('amount').trim() === '') continue;
    const business = field('business');
    /** @type {Record<string, unknown>} */
    const item = { amount: field('amount'), incurred_in: field('incurred'), capital: true, business };
    let another = business === 'wind_up';
    if (business === 'former' || business === 'proposed') {
      item.carried_on_by = field('by');
      another = field('by') === 'another_entity';
    }
    if (another) item.assessable_income_connection = field('connection') === 'yes';
    if (business === 'proposed') {
      item.within_reasonable_time = field('reasonable') === 'yes';
      item.start_up_expense = field('startup');
      if (field('startup') !== 'neither') item.entity_test = field('entity');
    }
    item.taxable_purpose = percentFraction(field('purpose'));
    const exclusion = field('exclusion');
    item.exclusions = exclusion === 'none' ? [] : [exclusion];
    if (exclusion === '5(d)' || exclusion === '5(f)') item.goodwill_right = field('goodwill') === 'yes';
    items.push(item);
  }
  return { items, year: value('year'), scope_confirmed: true };
}

/** A paragraph label as the Act writes it: '5(a)' is '(5)(a)', '8' is '(8)'. @param {string} label */
const paragraph = (label) => {
  const at = label.indexOf('(');
  return at < 0 ? `(${label})` : `(${label.slice(0, at)})${label.slice(at)}`;
};

/** How the page writes the call. @param {{items: Record<string, any>[], year: string}} x @param {(value: number) => string} aud */
export function blackholeInputsText(x, aud) {
  const items = x.items.map((it, k) => `item ${k + 1}: ${aud(Number(it.amount))} incurred in ${it.incurred_in} for `
    + `${BUSINESS_WORDS[it.business]}${it.carried_on_by === 'another_entity' ? ' of another entity' : ''}, `
    + `${fractionPercent(it.taxable_purpose)}% taxable purpose`
    + `${it.exclusions.length ? `, excluded by section 40-880${paragraph(it.exclusions[0])}` : ''}`
    + `${it.start_up_expense && it.start_up_expense !== 'neither' ? ', a start-up cost' : ''}`);
  return `${x.year}; ${items.join('; ')}`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function blackholeResult(value, aud) {
  const input = blackholeFormInput(value);
  if (input.items.length === 0) throw new Error('Enter the amount of at least one item of capital expenditure.');
  const r = businessCapitalExpenditure(input);
  const rows = r.items.flatMap((it) => {
    const how = it.method === null ? 'excluded, nothing to deduct' : it.method.includes('(2A)') ? `in full in ${it.incurred_in}, a start-up cost`
      : `a fifth a year from ${it.incurred_in} to ${it.schedule.at(-1)?.income_year}`;
    return [[`Item ${it.item}: deductible expenditure`, aud(Number(it.deductible_expenditure))],
      [`Item ${it.item}: deduction for ${r.period} (${how})`, aud(Number(it.deduction))]];
  });
  const principal = rows.push([`Deduction for ${r.period}`, aud(Number(r.amounts.deduction))]) - 1;
  rows.push(['Left to deduct in later income years', aud(Number(r.amounts.remaining_expenditure_after_year))]);
  const excluded = r.items.filter((it) => it.excluded_by.length).map((it) => `item ${it.item} by ${it.excluded_by.map((c) => c.split(':')[0].replace('ITAA 1997 ', '')).join(' and ')}`);
  const note = excluded.length ? `Excluded: ${excluded.join('; ')}` : 'Section 40-880(2) deducts a fifth in each of 5 income years from the year incurred, not apportioned for part of a year';
  return { inputs: blackholeInputsText(input, aud), rows, principal, note };
}
