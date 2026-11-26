// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Whether one individual must lodge their own income tax return for an income year from 2020-21 to
// 2025-26, from the `lodgment-required` command of ryanduguid/australian-accounting: the same input,
// the same conditions, exceptions, steps and due date, and the same refusal codes.
// Sources, read on the Federal Register of Legislation on 26 November 2026:
// - Notices of Requirement to Lodge a Return for the Income Year Ended 30 June 2021 (F2021L00577),
//   2022 (F2022L00508) and 2023 (F2023L00533): Tables A, B, J, K and P and section 4.
// - Taxation Laws (Requirement to Lodge a Return for the 2024 Year) Instrument 2024 (F2024L00550), 2025
//   Year (F2025L00570) and 2026 Year (F2026L00618): ss 6(2), 6(3), 6(10), 7(1)(f), 7(2), 7(3) and 8(1).

/** Each year: its register id, the s 6(10)(b) [Table J] income, the s 7(2)(b)(ii) [Table K(1)] taxable
 * income limit, whether that limit is 'less than or equal to', and the s 7(3)(b) [Table K(2)] rebate
 * income limits for single, apart and together, in whole dollars.
 * @type {Record<string, [string, number, number, boolean, number[]]>} */
const INSTRUMENTS = {
  '2020-21': ['F2021L00577', 11655, 21885, false, [32280, 31280, 28975]],
  '2021-22': ['F2022L00508', 11753, 21885, false, [32280, 31280, 28975]],
  '2022-23': ['F2023L00533', 12090, 21885, false, [32280, 31280, 28975]],
  '2023-24': ['F2024L00550', 12887, 21885, false, [32280, 31280, 28975]],
  '2024-25': ['F2025L00570', 13609, 22575, false, [34919, 33732, 30994]],
  '2025-26': ['F2026L00618', 16750, 22575, true, [34919, 33732, 30994]],
};
export const LODGMENT_YEARS = Object.keys(INSTRUMENTS);

/** The conditions stated as answers, in the order the instrument lists them. */
export const STATED = ['payg_withheld', 'tax_loss', 'net_capital_loss', 'business', 'primary_production_trust',
  'primary_production_partnership', 'exempt_overseas_income', 'payg_instalment', 'special_professional',
  'private_health_offset', 'reportable_amounts', 'co_contribution', 'contributions_cap', 'super_lump_sum'];
const SUBSECTION_6_3 = ['resident_whole_year', 'resident_part_year', 'not_resident'];

/** Each condition: its provision from 2023-24, in the Notices before, and what it says. @type {Record<string, string[]>} */
export const PROVISIONS = Object.fromEntries([
  ['payg_withheld', 'paragraph 6(2)(a)', 'Table A item (1)', 'an amount withheld under PAYG withholding, other than from the payments the paragraph excludes'],
  ['tax_loss', 'paragraph 6(2)(b)', 'Table A item (2)', 'a tax loss incurred, or an entitlement to deduct one'],
  ['net_capital_loss', 'paragraph 6(2)(c)', 'Table A item (3)', 'a net capital loss made, or an entitlement to apply one of an earlier year'],
  ['business', 'paragraph 6(2)(f)', 'Table A item (6)', 'a business carried on'],
  ['primary_production_trust', 'paragraph 6(2)(g)', 'Table A item (7)', 'income as a beneficiary of a trust that operated a primary production business in Australia'],
  ['primary_production_partnership', 'paragraph 6(2)(h)', 'Table A item (8)', 'an individual interest in the net income or partnership loss of a partnership that operated a primary production business in Australia'],
  ['under_18', 'paragraph 6(2)(i)', 'Table A item (9)', 'under 18 at all times, with income other than from work, or from dividends and franking credits, over $416'],
  ['exempt_overseas_income', 'paragraph 6(2)(j)', 'Table A item (10)', 'income under ITAA 1936 s 23AF or 23AG and $1 or more of other income'],
  ['payg_instalment', 'paragraph 6(2)(k)', 'Table A item (11)', 'a PAYG instalment paid'],
  ['special_professional', 'paragraph 6(2)(l)', 'Table A item (12)', 'a special professional under ITAA 1997 Division 405'],
  ['private_health_offset', 'paragraph 6(2)(m)', 'Table A item (13)', 'entitled to the private health insurance offset and not claiming the correct offset as a premium reduction, unless a choice was made under ITAA 1997 s 61-215'],
  ['reportable_amounts', 'paragraph 6(2)(n)', 'Table A item (14)', 'reportable fringe benefits or reportable employer superannuation contributions on a payment summary or income statement'],
  ['dividends', 'paragraph 6(2)(o)', 'Table A item (15)', 'assessable income from dividends or distributions and franking credits over $18,200'],
  ['co_contribution', 'paragraph 6(2)(p)', 'Table A item (16)', 'personal contributions that will receive a super co-contribution'],
  ['contributions_cap', 'paragraph 6(2)(q)', 'Table A item (17)', 'a concessional or non-concessional contributions cap exceeded'],
  ['super_lump_sum', 'paragraph 6(2)(r)', 'Table A item (18)', 'an Australian superannuation lump sum with an untaxed element at 60 or over, or a taxed or untaxed element under 60'],
  ['resident_whole_year', 'subparagraph 6(3)(a)(i)', 'Table B item (1)(a)', 'a resident for the whole year with taxable income over $18,200'],
  ['resident_part_year', 'subparagraph 6(3)(a)(ii)', 'Table B item (1)(b)', 'a resident for part of the year with taxable income over the lesser of $18,200 and $13,464 plus $395 a month'],
  ['not_resident', 'paragraph 6(3)(b)', 'Table B item (2)', 'not a resident at any time, with income taxable in Australia other than the excluded withholding payments'],
  ['study_loan', 'subsection 6(10)', 'Table J', "a foreign resident with a study or training loan debt on 1 June before the year and income over the year's amount"],
  ['working_holiday_maker', 'paragraph 7(1)(f)', 'Table P', 'a working holiday maker with no other assessable income and taxable income, without super or ETP remainders, under $45,001'],
  ['listed_payment', 'subsection 7(2)', 'Table K item (1)', "a payment the instrument lists, and no other assessable income or taxable income under the year's amount"],
  ['sapto', 'subsection 7(3)', 'Table K item (2)', "eligible for the seniors and pensioners tax offset, with rebate income under the year's amount"],
].map(([key, ...rest]) => [key, rest]));

/** The command's inputs, in the order it reads them; the 2 amounts are decimal strings. */
const INPUTS = ['residency', 'taxable_income', 'dividends_and_franking_credits', 'under_18', 'triggers', 'study_loan',
  'working_holiday_maker', 'listed_payment', 'sapto', 'child_support_parent', 'year', 'scope_confirmed'];
const DECIMALS = ['taxable_income', 'dividends_and_franking_credits'];

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** @typedef {{cents: bigint, text: string}} Amount an amount in cents and as the command prints it */

/** A decimal string as the command reads one: null for an infinity or NaN, which the amount check
 * refuses; text that is neither is unreadable. @param {string} value @returns {Amount | null} */
function decimal(value) {
  const text = value.trim();
  const negative = text.startsWith('-');
  const pieces = text.slice(negative ? 1 : 0).split('.');
  if (pieces.length <= 2 && pieces.every((piece) => /^\d+$/.test(piece))) {
    const [whole, fraction] = pieces;
    if ((fraction ?? '').length > 2) return { cents: -1n, text };
    const cents = BigInt(whole + (fraction ?? '').padEnd(2, '0'));
    const shown = `${negative ? '-' : ''}${whole.replace(/^0+(?=\d)/, '')}${fraction === undefined ? '' : `.${fraction}`}`;
    return { cents: negative && cents > 0n ? -1n : cents, text: shown };
  }
  if (!/^[+-]?(inf|infinity|s?nan\d*)$/i.test(text)) refuse('input.decimal_unreadable', `${value} is not a number`);
  return null;
}

/** The amount check: finite, from 0 to 1e12, at most 2 decimal places. @param {Amount | null} amount
 * @param {string} message @returns {Amount} */
function money(amount, message = 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.') {
  if (amount === null || amount.cents < 0n || amount.cents > 100000000000000n) refuse('input.amount_invalid', message);
  return amount;
}

/** A stated amount in a fact group: a decimal string of at most 32 bytes.
 * @param {Map<string, unknown>} fields @param {string} item @param {string} key */
function stated(fields, item, key) {
  const given = required(fields, item, key);
  const message = `${item}: ${key} must be a decimal string, finite and non-negative, at most 2dp and 1e12.`;
  if (typeof given !== 'string' || new TextEncoder().encode(given).length > 32) return refuse('input.amount_invalid', message);
  let parsed;
  try {
    parsed = decimal(given);
  } catch {
    return refuse('input.amount_invalid', message);
  }
  return money(parsed, message);
}

/** @param {Map<string, unknown>} fields @param {string} item @param {string} key */
function required(fields, item, key) {
  if (!fields.has(key)) refuse('input.missing_field', `${item}: ${key} is required`);
  return fields.get(key);
}

/** @param {Map<string, unknown>} fields @param {string} item @param {string[]} allowed */
function knownKeys(fields, item, allowed) {
  const unknown = [...fields.keys()].find((key) => !allowed.includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `${item}: ${unknown} is not an input of ${item}`);
}

/** @param {Map<string, unknown>} fields @param {string} item @param {string} key */
function boolean(fields, item, key) {
  const given = required(fields, item, key);
  if (typeof given !== 'boolean') refuse('input.flag_invalid', `${item}: ${key} must be a boolean.`);
  return given;
}

/** @param {unknown} value */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** An optional fact group: null, or an object of the keys given. @param {unknown} given @param {string} name
 * @param {string[]} keys @returns {Map<string, unknown> | null} */
function group(given, name, keys) {
  if (given === null) return null;
  if (!isObject(given)) return refuse('lodgment_required.group_invalid', `${name} must be null or an object with ${keys.join(' and ')}.`);
  const fields = new Map(Object.entries(/** @type {object} */ (given)));
  knownKeys(fields, name, keys);
  return fields;
}

/** @typedef {{status: 'whole'} | {status: 'part', months: number} | {status: 'none', taxable: boolean}} Residency */

/** @param {unknown} given @returns {Residency} */
function residency(given) {
  const bad = () => refuse('lodgment_required.residency_invalid',
    'residency must be {status: whole_year}, {status: part_year, months: 1 to 12} or {status: none, taxable_australian_income: boolean}.');
  if (!isObject(given)) return bad();
  const fields = new Map(Object.entries(/** @type {object} */ (given)));
  const status = fields.get('status');
  const other = { whole_year: null, part_year: 'months', none: 'taxable_australian_income' }[typeof status === 'string' ? status : ''];
  if (other === undefined) return bad();
  knownKeys(fields, 'residency', other === null ? ['status'] : ['status', other]);
  if (other === null) return { status: 'whole' };
  if (other === 'months') {
    const months = fields.get('months');
    return typeof months === 'number' && Number.isInteger(months) && months >= 1 && months <= 12 ? { status: 'part', months } : bad();
  }
  return { status: 'none', taxable: boolean(fields, 'residency', other) };
}

/** @param {unknown} given */
function triggers(given) {
  const bad = () => refuse('lodgment_required.triggers_invalid', `triggers must be a list of these conditions: ${STATED.join(', ')}.`);
  if (!Array.isArray(given)) return bad();
  for (const item of given) if (!STATED.includes(item)) bad();
  return new Set(given);
}

/** @param {string} text */
const upper = (text) => text.charAt(0).toUpperCase() + text.slice(1);
/** @param {boolean} answer */
const yesNo = (answer) => (answer ? 'yes' : 'no');
/** @param {boolean} holds */
const applies = (holds) => (holds ? 'applies' : 'does not apply');
/** @param {number} dollars */
const centsOf = (dollars) => BigInt(dollars) * 100n;

/** @typedef {{year: string, lodgment_required: boolean, required_by: string[], exceptions_applied: string[],
 *   due_date: string | null, instrument: {id: string, title: string}, tests: Record<string, string>,
 *   steps: {step: string, finding: string}[], required: string[], applied: string[]}} LodgmentWorked */

/** Whether a return is required, from the command's input. @param {unknown} given @returns {LodgmentWorked} */
export function lodgmentRequired(given) {
  if (!isObject(given)) refuse('input.not_object', 'input must be a JSON object');
  const input = new Map(Object.entries(/** @type {object} */ (given)));
  const unknown = [...input.keys()].find((key) => !INPUTS.includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an input of lodgment-required`);
  /** @type {Record<string, Amount | null | undefined>} */
  const amounts = {};
  for (const key of INPUTS) {
    if (!input.has(key)) refuse('input.missing_field', `${key} is required`);
    const value = input.get(key);
    if (DECIMALS.includes(key) && typeof value === 'string') {
      if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', `${key}: decimal input exceeds 8192 bytes`);
      amounts[key] = decimal(value);
    }
  }
  const [year, confirmed] = [input.get('year'), input.get('scope_confirmed')];
  if (confirmed === true && year === '2026-27') {
    refuse('lodgment_required.instrument_not_made',
      'No instrument requiring returns for the 2027 year (2026-27) was on the Federal Register of Legislation on 22 November 2026.');
  }
  if (confirmed !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  if (typeof year !== 'string' || !LODGMENT_YEARS.includes(year)) {
    refuse('period.unsupported', `Unsupported period ${JSON.stringify(year)}; supported: ${LODGMENT_YEARS.join(', ')}.`);
  }
  const [id, studyLoanIncome, paymentLimit, paymentInclusive, sapto] = INSTRUMENTS[year];
  const end = Number(year.slice(0, 4)) + 1;
  const notice = end <= 2023;
  /** @param {string} key */
  const cite = (key) => PROVISIONS[key][notice ? 1 : 0];

  const under18Group = group(input.get('under_18'), 'under_18', ['income_excluding_work']);
  const under18 = under18Group && stated(under18Group, 'under_18', 'income_excluding_work');
  const studyGroup = group(input.get('study_loan'), 'study_loan', ['income']);
  const studyLoan = studyGroup && stated(studyGroup, 'study_loan', 'income');
  const resident = residency(input.get('residency'));
  /** @param {string} key */
  const amount = (key) => money(amounts[key] === undefined ? null : /** @type {Amount | null} */ (amounts[key]));
  const taxable = amount('taxable_income');
  const dividends = amount('dividends_and_franking_credits');
  const answered = triggers(input.get('triggers'));
  const parent = input.get('child_support_parent');
  if (typeof parent !== 'boolean') refuse('input.flag_invalid', 'child_support_parent must be a boolean.');

  /** @type {{step: string, finding: string}[]} */
  const steps = [];
  /** @type {string[]} */
  const conditions = [];
  /** @type {Record<string, string>} */
  const tests = {};
  /** @param {string} key @param {string} finding */
  const push = (key, finding) => steps.push({ step: `${upper(cite(key))}: ${PROVISIONS[key][2]}`, finding });
  /** @param {string} key @param {boolean} met @param {string} finding */
  const test = (key, met, finding) => {
    push(key, `${finding}: ${met ? 'met' : 'not met'}`);
    if (met) conditions.push(key);
  };

  // s 6(2) [Table A]: the stated conditions, then the 2 worked out.
  for (const key of STATED) if (answered.has(key)) test(key, true, 'Yes, as you answered');
  if (under18) {
    test('under_18', under18.cents > centsOf(416) || dividends.cents > centsOf(416),
      `under 18 at all times; $${under18.text} other than from work and $${dividends.text} from dividends and franking credits`);
  }
  test('dividends', dividends.cents > centsOf(18200), `$${dividends.text}`);
  // s 6(3) [Table B]: by residency in the year.
  if (resident.status === 'whole') {
    test('resident_whole_year', taxable.cents > centsOf(18200), `taxable income $${taxable.text}`);
  } else if (resident.status === 'part') {
    const sum = 13464 + 395 * resident.months;
    const limit = Math.min(sum, 18200);
    tests.part_year_limit = String(limit);
    test('resident_part_year', taxable.cents > centsOf(limit),
      `${resident.months} months resident, so the lesser of $18,200 and $${sum} is $${limit}; taxable income $${taxable.text}`);
  } else {
    test('not_resident', resident.taxable, `income taxable in Australia, as you answered: ${yesNo(resident.taxable)}`);
  }
  // s 6(10) [Table J]: a foreign resident at some time in the year.
  if (studyLoan && resident.status !== 'whole') {
    test('study_loan', studyLoan.cents > centsOf(studyLoanIncome), `income $${studyLoan.text} against more than $${studyLoanIncome} for ${year}`);
  }

  /** @type {[string, string[]][]} the exceptions that hold, each with the provisions it names */
  const held = [];
  // s 7(1)(f) [Table P]: relieves every requirement of s 6(2) to 6(10).
  const whmKeys = ['other_assessable_income', 'taxable_income_excluding_remainders'];
  const whm = group(input.get('working_holiday_maker'), 'working_holiday_maker', whmKeys);
  if (whm) {
    const other = boolean(whm, 'working_holiday_maker', whmKeys[0]);
    const income = stated(whm, 'working_holiday_maker', whmKeys[1]);
    const holds = !other && income.cents < centsOf(45001);
    push('working_holiday_maker', `other assessable income: ${yesNo(other)}; taxable income without remainders $${income.text}: ${applies(holds)}`);
    if (holds) held.push(['working_holiday_maker', [...conditions]]);
  }
  // s 7(2) [Table K(1)]: a listed payment.
  const listed = group(input.get('listed_payment'), 'listed_payment', ['other_assessable_income']);
  if (listed) {
    const other = boolean(listed, 'listed_payment', 'other_assessable_income');
    const limit = centsOf(paymentLimit);
    const under = paymentInclusive ? taxable.cents <= limit : taxable.cents < limit;
    const holds = !other || under;
    push('listed_payment', `other assessable income: ${yesNo(other)}; taxable income $${taxable.text} against `
      + `${paymentInclusive ? 'at most' : 'less than'} $${paymentLimit}: ${applies(holds)}`);
    // s 7(2) names s 6(2)(i) and 6(3); section 4 of the Notices reaches a person described in Table B only.
    if (holds) held.push(['listed_payment', notice ? SUBSECTION_6_3 : [...SUBSECTION_6_3, 'under_18']]);
  }
  // s 7(3) [Table K(2)]: the seniors and pensioners tax offset.
  const senior = group(input.get('sapto'), 'sapto', ['rebate_income', 'category']);
  if (senior) {
    const rebate = stated(senior, 'sapto', 'rebate_income');
    const index = ['single', 'apart', 'together'].indexOf(/** @type {string} */ (required(senior, 'sapto', 'category')));
    if (index < 0) refuse('lodgment_required.group_invalid', 'sapto: category must be single, apart or together.');
    const holds = rebate.cents < centsOf(sapto[index]);
    push('sapto', `rebate income $${rebate.text} against less than $${sapto[index]}: ${applies(holds)}`);
    if (holds) held.push(['sapto', SUBSECTION_6_3]);
  }

  // An exception that holds for a person covered by a provision it names leaves no requirement under
  // the instrument (s 7(1) to 7(3); in the Notices, section 4 with Table K for a person in Table B).
  /** @type {string[]} */
  const applied = [];
  for (const [key, names] of held) {
    if (names.some((k) => conditions.includes(k))) applied.push(key);
    else push(key, 'covered by no provision it names, so it relieves nothing');
  }
  const left = applied.length === 0 ? conditions : [];
  if (left.length === 0 && parent) {
    refuse('lodgment_required.child_support_parent',
      'This instrument does not require a return, but a parent liable for or entitled to child support may be required to lodge under the separate instrument for parents for the year; the worksheet does not apply it.');
  }
  const title = notice ? `Notice of Requirement to Lodge a Return for the Income Year Ended 30 June ${end}`
    : `Taxation Laws (Requirement to Lodge a Return for the ${end} Year) Instrument ${end}`;
  return { year, lodgment_required: left.length > 0, required_by: left.map(cite), exceptions_applied: applied.map(cite),
    due_date: left.length > 0 ? `${end}-10-31` : null, instrument: { id, title }, tests, steps, required: left, applied };
}

/** @param {string} key a condition @param {string} year */
export const provisionOf = (key, year) => PROVISIONS[key][Number(year.slice(0, 4)) + 1 <= 2023 ? 1 : 0];

/** The command's input from the page's fields. @param {(name: string) => string} value
 * @param {(name: string) => boolean} checked */
export function lodgmentFormInput(value, checked) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  const status = value('residency');
  return {
    residency: status === 'part_year' ? { status, months: Number(value('months')) }
      : status === 'none' ? { status, taxable_australian_income: yes('taxable-australian-income') } : { status },
    taxable_income: value('taxable-income'),
    dividends_and_franking_credits: value('dividends'),
    under_18: yes('under-18') ? { income_excluding_work: value('under-18-income') } : null,
    triggers: STATED.filter((key) => checked(`trigger-${key}`)),
    study_loan: yes('study-loan') ? { income: value('study-loan-income') } : null,
    working_holiday_maker: yes('whm') ? { other_assessable_income: yes('whm-other'), taxable_income_excluding_remainders: value('whm-taxable') } : null,
    listed_payment: yes('listed') ? { other_assessable_income: yes('listed-other') } : null,
    sapto: yes('sapto') ? { rebate_income: value('sapto-rebate'), category: value('sapto-category') } : null,
    child_support_parent: yes('child-support'),
    year: value('year'),
    scope_confirmed: true,
  };
}

/** Dollar amounts in the command's text with their thousands grouped. @param {string} text */
const grouped = (text) => text.replace(/\$(\d+)/g, (_, whole) => `$${BigInt(whole).toLocaleString('en-AU')}`);

const AMOUNT_LABELS = { 'taxable-income': 'your taxable income', dividends: 'your dividends and franking credits (0 if none)',
  'under-18-income': 'your income other than from work', 'study-loan-income': 'your income for the study loan test',
  'whm-taxable': 'your taxable income without super or ETP remainders', 'sapto-rebate': 'your rebate income' };

/** The page's result. @param {(name: string) => string} value @param {(name: string) => boolean} checked */
export function lodgmentRequiredResult(value, checked) {
  const input = lodgmentFormInput(value, checked);
  const used = ['taxable-income', 'dividends', ...(input.under_18 ? ['under-18-income'] : []), ...(input.study_loan ? ['study-loan-income'] : []),
    ...(input.working_holiday_maker ? ['whm-taxable'] : []), ...(input.sapto ? ['sapto-rebate'] : [])];
  for (const name of used) {
    if (value(name).trim() === '') refuse('input.missing_field', `Enter ${AMOUNT_LABELS[/** @type {keyof AMOUNT_LABELS} */ (name)]}.`);
  }
  if (input.residency.status === 'part_year' && !(Number.isInteger(input.residency.months) && input.residency.months >= 1 && input.residency.months <= 12)) {
    refuse('lodgment_required.residency_invalid', 'Enter the months you were a resident as a whole number from 1 to 12.');
  }
  let r;
  try {
    r = lodgmentRequired(input);
  } catch (error) {
    const code = /** @type {{code?: string}} */ (error).code;
    if (code === 'input.amount_invalid' || code === 'input.decimal_unreadable') {
      refuse(code, 'Enter each amount in dollars and cents, from 0 to 1,000,000,000,000.');
    }
    if (code === 'lodgment_required.instrument_not_made') {
      refuse(code, 'No instrument requiring returns for 2026-27 was on the Federal Register of Legislation on 22 November 2026: choose an earlier year.');
    }
    if (code === 'lodgment_required.child_support_parent') {
      refuse(code, 'This instrument does not require you to lodge, but as a parent liable for or entitled to child support you may have to lodge under the separate instrument for parents; this calculator does not apply it.');
    }
    throw error;
  }
  const rows = r.steps.map((s) => [s.step, grouped(upper(s.finding))]);
  rows.push(['Return required', r.lodgment_required ? 'Yes' : 'No']);
  const due = r.due_date ? `${Number(r.due_date.slice(8))} October ${r.due_date.slice(0, 4)}` : '';
  const note = r.lodgment_required
    ? `You must lodge for ${r.year} under ${r.required_by.join(', ')} of the ${r.instrument.title}, by ${due} if you lodge yourself`
    : r.exceptions_applied.length > 0
      ? `No return is required under the ${r.instrument.title}: the exception in ${r.exceptions_applied.join(' and ')} applies`
      : `No condition in the ${r.instrument.title} requires a return; you may still lodge, for example to get a refund of tax withheld`;
  return {
    inputs: `${r.year}; ${input.residency.status === 'whole_year' ? 'resident all year' : input.residency.status === 'part_year'
      ? `resident ${input.residency.months} ${input.residency.months === 1 ? 'month' : 'months'}` : 'not a resident'}; taxable income ${grouped(`$${value('taxable-income').trim()}`)}; `
      + `${input.triggers.length} ${input.triggers.length === 1 ? 'condition' : 'conditions'} ticked`,
    rows, principal: rows.length - 1, note,
  };
}
