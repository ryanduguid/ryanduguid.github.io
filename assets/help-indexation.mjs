// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// One person's accumulated HELP debt on 1 June from 2020 to 2026 under Division 140 of the Higher
// Education Support Act 2003, and what a voluntary repayment's timing does to it: the `help-indexation`
// command of ryanduguid/australian-accounting, with its inputs, steps, rounding and refusal codes in the
// order the command checks them. Sources, read again on 27 November 2026: HESA Compilation No. 105
// (17 October 2026) ss 137-19A, 140-5, 140-10, 140-25, 140-26 and 140-30, and the ATO's 'Study and
// training loan indexation rates' (last updated 17 April 2026), whose rate plus one is each factor.
// Amounts are held in millionths of a dollar, so the 20% reduction and every factor are exact; each
// amount shown is rounded half up to the cent once.

/** The income years, each ending on the 1 June its debt is indexed, newest first. */
export const HELP_INDEXATION_YEARS = ['2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21', '2019-20'];

/** The HELP debt indexation factor in thousandths for 1 June at the end of each year, the rule that set it,
 * and the factor first published before the 2024 Act recalculated it (Schedule 1 item 56). */
const FACTORS = new Map(/** @type {[string, [number, string, string | null]][]} */ ([
  ['2019-20', [1018, 'CPI', null]], ['2020-21', [1006, 'CPI', null]], ['2021-22', [1039, 'CPI', null]],
  ['2022-23', [1032, 'lower of CPI and WPI', '1.071']], ['2023-24', [1040, 'lower of CPI and WPI', '1.047']],
  ['2024-25', [1032, 'lower of CPI and WPI', null]], ['2025-26', [1028, 'lower of CPI and WPI', null]],
]));
/** The year HESA s 140-26 reduces by 20% (the accumulated HELP debt of 1 June 2025). */
const REDUCTION_YEAR = '2024-25';
export const MAX_ENTRIES = 100;
const MAX_CENTS = 10n ** 14n;
const MICRO = 10000n;

const DEBT_MISSING = 'Enter the accumulated HELP debt on the preceding 1 June as your ATO account shows it (nil for none): '
  + 'the calculator never estimates a balance.';
const LOCATION_PREFERRED = 'A Secretary’s determination for a location-preferred HELP debtor reduces the indexation factor (HESA s 140-10(1)(a) '
  + 'and (1A)) or the debt (ss 142-15 and 144-10), which this calculator does not take.';
const ALREADY_REDUCED = 'For 2024-25, give the balance and debts before the 20% reduction, and give a debt incurred from 1 January to '
  + '1 June 2025 as incurred: the calculator applies HESA ss 140-26 and 137-19A to them itself.';

/** The command's optional inputs, in the order it reads them. */
const OPTIONAL = ['previous_accumulated_debt', 'earlier_debts', 'voluntary_repayments', 'compulsory_repayments', 'assessment_increases',
  'assessment_reductions', 'current_debts', 'current_repayments', 'proposed_repayment', 'debts_already_reduced'];
const REQUIRED = ['location_preferred', 'year', 'scope_confirmed'];
const RAW = new Set(['earlier_debts', 'current_debts', 'voluntary_repayments', 'debts_already_reduced']);

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** Cents from a decimal string the command takes as an amount (finite, nil or more, at most 2 places and
 * $1,000,000,000,000); `undefined` when the text is no decimal at all, null when it is one but not an amount.
 * @param {string} value @returns {bigint | null | undefined} */
function cents(value) {
  const text = value.trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return /^[+-]?(?:inf|infinity|s?nan\d*)$/i.test(text) ? null : undefined;
  const fraction = m[3] ?? '';
  if (fraction.length > 2) return null;
  const amount = BigInt(m[2] + fraction.padEnd(2, '0'));
  return (m[1] && amount !== 0n) || amount > MAX_CENTS ? null : amount;
}

/** A top-level amount, read as the command reads every decimal input. @param {string} key @param {unknown} value */
function topLevel(key, value) {
  if (typeof value !== 'string') return { cents: null };
  if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', `${key}: decimal input exceeds 8192 bytes`);
  const read = cents(value);
  if (read === undefined) refuse('input.decimal_unreadable', 'decimal.InvalidOperation');
  return { cents: read };
}

/** Millionths of a dollar from a read amount, or its refusal. @param {{cents: bigint | null} | undefined} read */
function money(read) {
  if (!read || read.cents === null) refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  return read.cents * MICRO;
}

/** Days since 1 January 1970 from a `YYYY-MM-DD` string from 1900 to 2100, or null. @param {unknown} text */
function day(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2100 || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return back.getTime() / 86400000;
}
/** @param {number} n */
const dateText = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

/** The objects of a list input, at most 100. @param {unknown} given @param {string} name @returns {Record<string, unknown>[]} */
function objects(given, name) {
  if (given === undefined) return [];
  if (!Array.isArray(given) || given.length > MAX_ENTRIES) {
    refuse('help_indexation.entries_invalid', `${name} must be a list of at most ${MAX_ENTRIES} objects.`);
  }
  return given.map((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      refuse('help_indexation.entries_invalid', `each entry of ${name} must be an object.`);
    }
    return /** @type {Record<string, unknown>} */ (item);
  });
}

/** An entry's field, refused when absent. @param {Record<string, unknown>} fields @param {string} item @param {string} key */
function required(fields, item, key) {
  if (!Object.hasOwn(fields, key)) refuse('input.missing_field', `${item}: ${key} is required`);
  return new Map(Object.entries(fields)).get(key);
}

/** Refuses a field outside `allowed`. @param {Record<string, unknown>} fields @param {string} item @param {string} what
 * @param {string[]} allowed */
function knownKeys(fields, item, what, allowed) {
  const key = Object.keys(fields).find((k) => !allowed.includes(k));
  if (key !== undefined) refuse('input.field_unknown', `${item}: ${key} is not an input of ${what}`);
}

/** A dated entry's day, refused outside `from` to `to`. @param {Record<string, unknown>} fields @param {string} item
 * @param {string} key @param {[number, number]} period */
function dated(fields, item, key, [from, to]) {
  const on = day(required(fields, item, key));
  if (on === null) refuse('help_indexation.entries_invalid', `${item}: ${key} must be a YYYY-MM-DD date.`);
  if (on < from || on > to) {
    refuse('help_indexation.date_outside_period', `${item}: ${key} ${dateText(on)} is outside ${dateText(from)} to ${dateText(to)}, `
      + 'the period this input covers for the year.');
  }
  return on;
}

/** A list entry's amount in millionths. @param {Record<string, unknown>} fields @param {string} item */
function entryAmount(fields, item) {
  const value = required(fields, item, 'amount');
  const read = typeof value === 'string' && new TextEncoder().encode(value).length <= 32 ? cents(value) : null;
  if (read === null || read === undefined) {
    refuse('input.amount_invalid', `${item}: amount must be a decimal string, finite and non-negative, at most 2dp and 1e12.`);
  }
  return read * MICRO;
}

/** A debt's group key, or null for a list's one debt without a group. @param {Record<string, unknown>} fields
 * @param {string} item @param {boolean} several */
function groupOf(fields, item, several) {
  if (!Object.hasOwn(fields, 'group')) {
    if (several) {
      refuse('help_indexation.entries_invalid', `${item}: give each of several debts a group, such as one course with one provider; `
        + 'HESA s 140-5(1) step 2A and s 140-25(1A) cut each group’s total to whole dollars.');
    }
    return null;
  }
  if (typeof fields.group !== 'string' || fields.group === '') refuse('help_indexation.entries_invalid', `${item}: group must be a non-empty string.`);
  return fields.group;
}

/** HESA s 140-5(1) steps 2 and 2A, or s 140-25(1A): each debt (less 20% when s 137-19A reduces it, one
 * incurred from 1 January to 1 June 2025) added to its group, and each group's total cut to whole dollars.
 * Returns millionths of a dollar and whether any was reduced.
 * @param {unknown} given @param {string} name @param {[number, number]} period @returns {[bigint, boolean]} */
function debtTotal(given, name, period) {
  const [from, to] = [/** @type {number} */ (day('2025-01-01')), /** @type {number} */ (day('2025-06-01'))];
  /** @type {Map<string | null, bigint>} */
  const groups = new Map();
  let anyReduced = false;
  const debts = objects(given, name);
  debts.forEach((fields, i) => {
    const item = `${name} ${i + 1}`;
    knownKeys(fields, item, 'a debt', ['incurred', 'amount', 'group']);
    const on = dated(fields, item, 'incurred', period);
    let amount = entryAmount(fields, item);
    if (on >= from && on <= to) {
      amount = (amount * 8n) / 10n;
      anyReduced = true;
    }
    const key = groupOf(fields, item, debts.length > 1);
    groups.set(key, (groups.get(key) ?? 0n) + amount);
  });
  let total = 0n;
  for (const sum of groups.values()) total += (sum / 1000000n) * 1000000n;
  return [total, anyReduced];
}

/** HESA s 140-5(1) step 3: the voluntary repayments made from 1 June in the preceding year to 31 May.
 * @param {unknown} given @param {[number, number]} period */
function repaymentTotal(given, period) {
  const name = 'voluntary_repayments';
  return objects(given, name).reduce((sum, fields, i) => {
    const item = `${name} ${i + 1}`;
    knownKeys(fields, item, 'a repayment', ['date', 'amount']);
    dated(fields, item, 'date', period);
    return sum + entryAmount(fields, item);
  }, 0n);
}

/**
 * @typedef {{previous: bigint, earlier: bigint, repaid: bigint, compulsory: bigint, increases: bigint, reductions: bigint,
 *   current: bigint, currentRepaid: bigint, proposed: bigint | null}} Facts
 */

/** The command's checks of the names, flags and year, and its first read of each decimal input.
 * @param {Record<string, unknown>} input @returns {[string, Map<string, unknown>]} */
function checkedInput(input) {
  const unknown = Object.keys(input).find((key) => !REQUIRED.includes(key) && !OPTIONAL.includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an input of help-indexation`);
  for (const key of REQUIRED) if (!Object.hasOwn(input, key)) refuse('input.missing_field', `${key} is required`);
  const given = new Map(Object.entries(input));
  const read = new Map(OPTIONAL.filter((key) => given.has(key))
    .map((key) => [key, RAW.has(key) ? given.get(key) : topLevel(key, given.get(key))]));
  if (input.scope_confirmed !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = typeof input.year === 'string' ? input.year : '';
  if (!FACTORS.has(year)) refuse('period.unsupported', 'help_indexation covers 2019-20 to 2025-26.');
  if (typeof input.location_preferred !== 'boolean') refuse('input.flag_invalid', 'location_preferred must be true or false.');
  if (input.location_preferred) refuse('help_indexation.location_preferred', LOCATION_PREFERRED);
  if (!read.has('previous_accumulated_debt')) refuse('help_indexation.debt_missing', DEBT_MISSING);
  return [year, read];
}

/** The facts as HESA s 140-5(1) names them, read in the command's order. @param {string} year @param {Map<string, unknown>} read
 * @returns {Facts} */
function facts(year, read) {
  const y = Number(year.slice(0, 4)) + 1;
  const date = (/** @type {string} */ md, /** @type {number} */ yy) => /** @type {number} */ (day(`${yy}-${md}`));
  const [earlier, earlierReduced] = debtTotal(read.get('earlier_debts'), 'earlier_debts', [date('01-01', y - 1), date('06-30', y - 1)]);
  const [current] = debtTotal(read.get('current_debts'), 'current_debts', [date('07-01', y - 1), date('12-31', y - 1)]);
  const reduced = read.get('debts_already_reduced');
  if ((year === REDUCTION_YEAR || earlierReduced) && reduced !== undefined) {
    if (typeof reduced !== 'boolean') refuse('input.flag_invalid', 'debts_already_reduced must be true or false.');
    if (reduced) refuse('help_indexation.reduction_already_applied', ALREADY_REDUCED);
  }
  const amount = (/** @type {string} */ key) => (read.has(key) ? money(/** @type {{cents: bigint | null}} */ (read.get(key))) : 0n);
  const previous = amount('previous_accumulated_debt');
  return {
    previous, earlier,
    repaid: repaymentTotal(read.get('voluntary_repayments'), [date('06-01', y - 1), date('05-31', y)]),
    compulsory: amount('compulsory_repayments'), increases: amount('assessment_increases'), reductions: amount('assessment_reductions'),
    current, currentRepaid: amount('current_repayments'), proposed: read.has('proposed_repayment') ? amount('proposed_repayment') : null,
  };
}

/** The accumulated HELP debt with `repaid` as the step 3 total, in millionths of a dollar: s 140-5(1) steps 1
 * to 7 (step 7, s 140-26, reduces 2024-25's amount and its current debts by 20%), the factor, then s 140-25(1)
 * and s 140-30 (cents disregarded). @param {string} year @param {Facts} f @param {bigint} repaid @param {bigint} factor */
function work(year, f, repaid, factor) {
  const reduce = year === REDUCTION_YEAR;
  const before = f.previous + f.earlier - repaid - f.compulsory - f.increases + f.reductions;
  const currentNet = f.current - f.currentRepaid;
  if (before < 0n || currentNet < 0n) {
    refuse('help_indexation.repayments_exceed_debt', 'The repayments given exceed the debts they reduce (HESA ss 140-5(1) and '
      + '140-25(1)); check the amounts and the periods they were made in.');
  }
  const base = reduce ? (before * 8n) / 10n : before;
  const current = reduce ? (currentNet * 8n) / 10n : currentNet;
  const former = (base * factor) / 1000n;
  const accumulated = ((former + current) / 1000000n) * 1000000n;
  return { before, reduction: before - base, base, former, currentNet, currentReduction: currentNet - current, accumulated };
}

/** Millionths of a dollar to dollars and cents, half up, as the command shows each amount. @param {bigint} micro */
function shown(micro) {
  const negative = micro < 0n;
  const whole = ((negative ? -micro : micro) + 5000n) / MICRO;
  const text = `${whole / 100n}.${String(whole % 100n).padStart(2, '0')}`;
  return negative && whole > 0n ? `-${text}` : text;
}

/** The debt with `proposed` repaid before 1 June (first to the debts indexed, then to the year's own, as HESA
 * s 151-10(2) applies a payment without directions) and on or after it. @param {string} year @param {Facts} f
 * @param {bigint} factor @param {ReturnType<typeof work>} w @param {bigint} proposed @returns {[string, bigint][]} */
function timing(year, f, factor, w, proposed) {
  const toIndexed = proposed < w.before ? proposed : w.before;
  const paid = { ...f, repaid: f.repaid + toIndexed, currentRepaid: f.currentRepaid + proposed - toIndexed };
  const early = work(year, paid, paid.repaid, factor).accumulated;
  const late = w.accumulated - proposed < 0n ? 0n : w.accumulated - proposed;
  return [['proposed_repayment', proposed], ['accumulated_debt_if_paid_before_1_june', early],
    ['accumulated_debt_if_paid_on_or_after_1_june', late], ['saving_if_paid_before_1_june', late - early]];
}

/**
 * The accumulated HELP debt on 1 June at the end of `year`, with each step's amount as the command names it,
 * and with `proposed_repayment` the debt with that repayment made before 1 June and on or after it.
 * @param {Record<string, unknown>} input the command's inputs
 * @returns {{year: string, amounts: Record<string, string>, rates: Record<string, string>, indexationDate: string}}
 */
export function helpIndexation(input) {
  const [year, read] = checkedInput(input);
  const f = facts(year, read);
  const [thousandths, rule, superseded] = /** @type {[number, string, string | null]} */ (FACTORS.get(year));
  const factor = BigInt(thousandths);
  const w = work(year, f, f.repaid, factor);
  /** @type {[string, bigint][]} */
  const amounts = [['previous_accumulated_debt', f.previous], ['earlier_debts', f.earlier], ['voluntary_repayments', f.repaid],
    ['compulsory_repayments', f.compulsory], ['before_indexation', w.before], ['reduction', w.reduction],
    ['indexation', w.former - w.base], ['former_accumulated_debt', w.former], ['current_debts', w.currentNet - w.currentReduction],
    ['current_reduction', w.currentReduction], ['accumulated_debt', w.accumulated]];
  if (f.proposed !== null) amounts.push(...timing(year, f, factor, w, f.proposed));
  /** @type {Record<string, string>} */
  const rates = { indexation_factor: (thousandths / 1000).toFixed(3), factor_rule: rule };
  if (superseded) rates.superseded_factor = superseded;
  if (year === REDUCTION_YEAR) rates.reduction_rate = '0.20';
  const end = Number(year.slice(0, 4)) + 1;
  return { year, amounts: Object.fromEntries(amounts.map(([k, v]) => [k, shown(v)])), rates, indexationDate: `${end}-06-01` };
}

/** One dated entry from the form, or none when its amount is blank or nil. @param {(name: string) => string} value
 * @param {string} amountName @param {string} dateName @param {string} dateKey */
function formEntry(value, amountName, dateName, dateKey) {
  const amount = value(amountName).trim();
  if (amount === '' || Number(amount) === 0) return [];
  const on = value(dateName).trim();
  if (on === '') refuse('help_indexation.entries_invalid', 'Enter the day for each debt or repayment you enter.');
  return [{ [dateKey]: on, amount }];
}

/** The command's inputs from the page's form. @param {(name: string) => string} value */
export function helpIndexationFormInput(value) {
  /** @type {Record<string, unknown>} */
  const input = { location_preferred: false, year: value('year'), scope_confirmed: true, previous_accumulated_debt: value('previous').trim() || '0' };
  const lists = [['earlier_debts', 'earlier', 'incurred'], ['current_debts', 'current', 'incurred'], ['voluntary_repayments', 'repaid', 'date']];
  for (const [key, name, dateKey] of lists) {
    const entries = formEntry(value, `${name}-amount`, `${name}-date`, dateKey);
    if (entries.length) input[key] = entries; // eslint-disable-line security/detect-object-injection -- key is one of this function's own names
  }
  const compulsory = value('compulsory').trim();
  if (compulsory) input.compulsory_repayments = compulsory;
  const proposed = value('proposed').trim();
  if (proposed) input.proposed_repayment = proposed;
  return input;
}

/** The page's result. @param {(name: string) => string} value @param {(n: number) => string} aud */
export function helpIndexationResult(value, aud) {
  const r = helpIndexation(helpIndexationFormInput(value));
  const a = new Map(Object.entries(r.amounts));
  const money = (/** @type {string} */ key) => aud(Number(a.get(key)));
  const end = r.indexationDate.slice(0, 4);
  const rows = [[`Accumulated HELP debt on 1 June ${Number(end) - 1}`, money('previous_accumulated_debt')],
    [`Plus debts incurred 1 January to 30 June ${Number(end) - 1}`, money('earlier_debts')],
    ['Less voluntary and compulsory repayments', aud(Number(a.get('voluntary_repayments')) + Number(a.get('compulsory_repayments')))],
    ['Amount indexed', money('before_indexation')]];
  if (r.year === REDUCTION_YEAR) rows.push(['Less the 20% reduction (s 140-26)', money('reduction')]);
  rows.push([`Indexation at ${Number(((Number(r.rates.indexation_factor) - 1) * 100).toFixed(1))}%`, money('indexation')],
    [`Plus debts incurred 1 July to 31 December ${Number(end) - 1}`, money('current_debts')],
    [`Accumulated HELP debt on 1 June ${end}`, money('accumulated_debt')]);
  const principal = rows.length - 1;
  let note = `Cents are dropped from the debt on 1 June ${end}`;
  if (a.has('proposed_repayment')) {
    rows.push([`With your repayment made before 1 June ${end}`, money('accumulated_debt_if_paid_before_1_june')],
      [`With it made on or after 1 June ${end}`, money('accumulated_debt_if_paid_on_or_after_1_june')]);
    const saving = Number(a.get('saving_if_paid_before_1_june'));
    const paying = `Paying ${money('proposed_repayment')}`;
    note = saving > 0 ? `${paying} before 1 June ${end} saves ${aud(saving)} of indexation`
      : saving < 0 ? `${paying} on or after 1 June ${end} leaves ${aud(-saving)} less, as a repayment before it is cut by the 20% reduction too`
        : `${paying} before or on or after 1 June ${end} gives the same debt`;
  }
  return { inputs: `${r.year}; debt on 1 June ${Number(end) - 1} ${money('previous_accumulated_debt')}`, rows, principal, note };
}
