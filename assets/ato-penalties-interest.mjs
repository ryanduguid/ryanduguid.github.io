// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// business-calculators.mjs re-exports this module, so GIC_QUARTERS is read inside functions only.
import { GIC_QUARTERS } from './business-calculators.mjs';

// ATO interest and penalties, each before any remission: the `ato-interest-penalties` command of
// ryanduguid/australian-accounting ported line for line (its inputs, exact arithmetic, rounding and
// refusal codes). Read 22 November 2026:
// - Taxation Administration Act 1953 ss 8AAC and 8AAD (GIC) and Sch 1 ss 280-100 and 280-105 (SIC),
//   284-85, 284-90, 284-220, 284-224 and 284-225 (statement penalties) and 286-80 (failure to lodge);
//   ITAA 1997 s 5-15; Taxation (Interest on Overpayments and Early Payments) Act 1983 ss 8A to 8C, 9,
//   10, 12D and 12E; Crimes Act 1914 s 4AA.
// - The ATO's 'General interest charge (GIC) rates' and 'Shortfall interest charge (SIC) rates' (last
//   updated 4 September 2026), 'Credit interest rates and calculation' (QC58284, last updated 19 June
//   2026) and 'Penalty units' (QC71196, last updated 26 June 2026); PS LA 2006/8, 2011/19, 2011/23 and
//   2012/5; MT 2008/2 and MT 2012/3.
// One rate table serves every charge: GIC_QUARTERS. The SIC rate is the GIC rate less 4 points
// (base + 3 against base + 7, ss 280-105(2) and 8AAD(1)), which holds for all 87 quarters the ATO's
// SIC table lists from April 2005; the base interest rate is the GIC rate less 7 points.

const DAY = 86400000;
export const ATO_PENALTIES_READ = '2026-11-22';
/** The financial years the command works, each the year of the question's last date. */
export const ATO_PENALTY_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27', '2027-28'];
export const ATO_QUESTIONS = ['gic', 'sic', 'failure_to_lodge', 'statement_penalty', 'early_payment_interest', 'overpayment_interest'];
/** The penalty unit from each day, in dollars (the ATO's 'Penalty units'; Crimes Act 1914 s 4AA). The ATO's
 * first row, $110 to 27 December 2012, has no start, so earlier days are not taken. */
export const PENALTY_UNITS = [['2012-12-28', 170], ['2015-07-31', 180], ['2017-07-01', 210], ['2020-07-01', 222],
  ['2023-01-01', 275], ['2023-07-01', 313], ['2024-11-07', 330], ['2026-07-01', 364]];
const TABLE_END = '2026-12-31';
const SIC_FROM = '2005-04-01';
const REMISSION = 'Before remission: the Commissioner may remit GIC (TAA 1953 s 8AAG), SIC (TAA Sch 1 s 280-160) and administrative '
  + 'penalties (s 298-20), which this calculator does not estimate';

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {string} iso */
const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;
/** @param {number} day */
const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** @param {number} day */
const yearOf = (day) => new Date(day * DAY).getUTCFullYear();
/** @param {number} day */
const yearDays = (day) => { const y = yearOf(day); return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 366 : 365; };
/** The first day of a day's calendar quarter. @param {number} day */
const quarterOf = (day) => { const d = new Date(day * DAY); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (d.getUTCMonth() % 3), 1) / DAY; };
/** The financial year a day falls in, as 2026-27. @param {number} day */
export function financialYear(day) {
  const d = new Date(day * DAY);
  const start = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
// Results are dollars as JavaScript numbers, which hold every cent only below 2^46 dollars: larger figures are refused.
const SAFE_CENTS = 100n * (1n << 46n);
/** Cents as dollars. @param {bigint} c */
function dollars(c) {
  if (c >= SAFE_CENTS) refuse('input.amount_invalid', 'This calculator shows amounts to the cent only below $70,368,744,177,664; a figure here is larger.');
  return Number(c) / 100;
}
/** Hundredths of 1% as a percentage: 1151 is 11.51. @param {number} h */
const percent = (h) => h / 100;

/** @type {{rows: number[][], end: number} | undefined} */
let table;
/** Each quarter's first day and GIC rate in hundredths of 1%, and the last published day. */
const gicTable = () => (table ??= { rows: GIC_QUARTERS.map(([from, rate]) => [dayOf(from), Math.round(Number(rate) * 100)]), end: dayOf(TABLE_END) });
/** The published GIC rate for a day in hundredths of 1%, or null. @param {number} day */
function gicOn(day) {
  const { rows, end } = gicTable();
  if (day > end) return null;
  for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i][0] <= day) return rows[i][1];
  return null;
}
/** @param {number} day */
const sicOn = (day) => { const rate = day >= dayOf(SIC_FROM) ? gicOn(day) : null; return rate === null ? null : rate - 400; };
/** @param {number} day */
const baseOn = (day) => { const rate = gicOn(day); return rate === null ? null : rate - 700; };
/** The penalty unit in dollars on a day, or null before the table. @param {number} day */
export function penaltyUnitOn(day) {
  for (let i = PENALTY_UNITS.length - 1; i >= 0; i -= 1) if (dayOf(/** @type {string} */ (PENALTY_UNITS[i][0])) <= day) return /** @type {number} */ (PENALTY_UNITS[i][1]);
  return null;
}

/** The facts of one question, read as the command reads them. */
class Facts {
  /** @param {string} question @param {Record<string, unknown>} map */
  constructor(question, map) {
    this.question = question;
    this.map = map;
    this.item = `question ${question}`;
  }
  /** @param {string[]} takes */
  only(takes) { known(this.map, this.item, this.question, takes); }
  /** @param {string} key */
  given(key) { return Object.hasOwn(this.map, key); }
  /** @param {string} key */
  value(key) { return required(this.map, this.item, key); }
  /** @param {string} key */
  cents(key) { return amount(this.map, this.item, key); }
  /** @param {string} key */
  date(key) { return dateIn(this.value(key), this.item, key); }
  /** @param {string} key */
  flag(key) { return flagIn(this.value(key), this.item, key); }
  /** @param {string} key @param {number} most @returns {unknown[]} */
  list(key, most) {
    const items = this.value(key);
    if (!Array.isArray(items) || items.length === 0 || items.length > most) {
      refuse('ato_interest_penalties.fact_invalid', `${this.item}: ${key} must be a list of 1 to ${most} entries.`);
    }
    return items;
  }
}

/** @param {Record<string, unknown>} fields @param {string} item @param {string} what @param {readonly string[]} allowed */
function known(fields, item, what, allowed) {
  const extra = Object.keys(fields).find((key) => !allowed.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${item}: ${extra} is not an input of ${what}.`);
}
/** @param {Record<string, unknown>} fields @param {string} item @param {string} key */
function required(fields, item, key) {
  if (!Object.hasOwn(fields, key)) refuse('input.missing_field', `${item}: ${key} is required.`);
  return fields[key];
}
/** An amount in whole cents, at most $1,000,000,000,000 and 2 decimal places.
 * @param {Record<string, unknown>} fields @param {string} item @param {string} key */
function amount(fields, item, key) {
  const value = required(fields, item, key);
  const parts = typeof value === 'string' && value.length <= 32 ? /^(\d+)(?:\.(\d{1,2}))?$/.exec(value) : null;
  const cents = parts ? BigInt(parts[1] + (parts[2] ?? '').padEnd(2, '0')) : null;
  if (cents === null || cents > 100000000000000n) {
    refuse('input.amount_invalid', `${item}: enter ${key.replaceAll('_', ' ')} in dollars and cents, from 0 to 1,000,000,000,000.`);
  }
  return cents;
}
/** @param {unknown} value @param {string} item @param {string} key */
function dateIn(value, item, key) {
  const day = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? dayOf(value) : NaN;
  if (!Number.isInteger(day) || isoOf(day) !== value) refuse('ato_interest_penalties.fact_invalid', `${item}: ${key} must be a date.`);
  return day;
}
/** @param {unknown} value @param {string} item @param {string} key */
function flagIn(value, item, key) {
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `${item}: ${key} must be yes or no.`);
  return value;
}
/** @param {unknown} value @param {string} item @param {string} key @param {readonly string[]} choices */
function choiceIn(value, item, key, choices) {
  const found = choices.find((c) => c === value);
  if (found === undefined) refuse('ato_interest_penalties.fact_invalid', `${item}: ${key} must be one of ${choices.join(', ')}.`);
  return found;
}
/** `year` must be the financial year of the question's last date. @param {number} day @param {string} year @param {string} key */
function inYear(day, year, key) {
  const found = financialYear(day);
  if (found !== year) refuse('ato_interest_penalties.year_mismatch', `${key} (${longDay(isoOf(day))}) is in ${found}, not ${year}.`);
}
/** @param {string} message @returns {never} */
const dateOrder = (message) => refuse('ato_interest_penalties.date_order', message);
/** @param {string} message @returns {never} */
const unpublished = (message) => refuse('ato_interest_penalties.rate_unpublished', message);

/** @typedef {{from: string, to: string, days: number, rate: number, assumed: boolean}} Stretch */
/** @typedef {{from: number, to: number, rate: number, assumed: boolean}} DayStretch */
/** Adds a day to the last stretch when it continues it at the same rate in the same quarter.
 * @param {DayStretch[]} stretches @param {number} day @param {number} rate @param {boolean} assumed */
function addDay(stretches, day, rate, assumed) {
  const last = stretches.at(-1);
  if (last && last.to + 1 === day && last.rate === rate && last.assumed === assumed && quarterOf(last.from) === quarterOf(day)) last.to = day;
  else stretches.push({ from: day, to: day, rate, assumed });
}
/** @param {DayStretch[]} stretches @returns {Stretch[]} */
const shownStretches = (stretches) => stretches.map((s) => ({ from: isoOf(s.from), to: isoOf(s.to), days: s.to - s.from + 1,
  rate: percent(s.rate), assumed: s.assumed }));

/** A list of `{<dateKey>, amount}` objects, in the order given. @param {Facts} f @param {string} dateKey @returns {[number, bigint][]} */
function datedAmounts(f, dateKey) {
  return f.list('payments', 1000).map((item, i) => {
    const name = `payment ${i + 1}`;
    if (!isObject(item)) refuse('ato_interest_penalties.fact_invalid', `${name} must be an object.`);
    known(item, name, 'a payment', [dateKey, 'amount']);
    const day = dateIn(required(item, name, dateKey), name, dateKey);
    return [day, amount(item, name, 'amount')];
  });
}

/** The exact balance at the end of `last` of an amount unpaid from the start of `first`, charged daily, each payment
 * applied on its day before that day's charge (TAA 1953 s 8AAC(3)), as a ratio, with its stretches of days.
 * @param {(day: number) => [number, boolean]} rateOf @param {bigint} owed @param {number} first @param {number} last
 * @param {[number, bigint][]} payments */
function compound(rateOf, owed, first, last, payments) {
  let [numerator, denominator] = [owed, 1n];
  /** @type {DayStretch[]} */
  const stretches = [];
  for (let day = first; day <= last; day += 1) {
    for (const [on, paid] of payments) {
      if (on !== day) continue;
      if (paid * denominator > numerator) {
        refuse('ato_interest_penalties.overpaid', `The payment of $${dollars(paid).toFixed(2)} on ${longDay(isoOf(day))} is more than the amount owing that day.`);
      }
      numerator -= paid * denominator;
    }
    const [rate, assumed] = rateOf(day);
    const base = BigInt(10000 * yearDays(day));
    numerator *= base + BigInt(rate);
    denominator *= base;
    addDay(stretches, day, rate, assumed);
  }
  return { numerator, denominator, stretches };
}
/** Half up on a non-negative ratio. @param {bigint} numerator @param {bigint} denominator */
const halfUp = (numerator, denominator) => (2n * numerator + denominator) / (2n * denominator);

/** @param {Facts} f @param {string} year */
function gic(f, year) {
  f.only(['amount', 'due_date', 'to', 'payments', 'assumed_annual_rate']);
  const owed = f.cents('amount');
  const [due, to] = [f.date('due_date'), f.date('to')];
  inYear(to, year, 'to');
  if (to < due) dateOrder('Enter a last day on or after the due date, the first day GIC accrues.');
  if (due < gicTable().rows[0][0]) unpublished('GIC rates are published from 1 July 1999.');
  let assumed = null;
  if (f.given('assumed_annual_rate')) {
    const rate = f.cents('assumed_annual_rate');
    if (rate === 0n || rate > 10000n) refuse('ato_interest_penalties.fact_invalid', 'Enter an assumed annual rate above 0% and at most 100%.');
    assumed = Number(rate);
  }
  const listed = f.given('payments') && !(Array.isArray(f.map.payments) && f.map.payments.length === 0);
  const payments = listed ? datedAmounts(f, 'date') : [];
  const outside = payments.findIndex(([day]) => day < due || day > to);
  if (outside >= 0) dateOrder(`Payment ${outside + 1}: enter a date from the due date to the last day.`);
  const end = gicTable().end;
  /** @param {number} day @returns {[number, boolean]} */
  const rateOf = (day) => {
    const rate = gicOn(day);
    if (rate !== null) return [rate, false];
    if (assumed !== null && day > end) return [assumed, true];
    return unpublished(`The ATO has published GIC rates to 31 December 2026; enter an assumed rate to project ${longDay(isoOf(day))} and later.`);
  };
  const { numerator, denominator, stretches } = compound(rateOf, owed, due, to, payments);
  const balance = halfUp(numerator, denominator);
  const paid = payments.reduce((sum, [, c]) => sum + c, 0n);
  const assumedDays = stretches.filter((s) => s.assumed).reduce((sum, s) => sum + s.to - s.from + 1, 0);
  const warnings = assumedDays ? [`${assumedDays} days after 31 December 2026 use the assumed rate: the GIC for them is an estimate, not a published rate`] : [];
  return { question: 'gic', year, gic: dollars(balance + paid - owed), paid: dollars(paid), balance: dollars(balance), days: to - due + 1,
    assumedDays, assumedRate: assumed === null ? null : percent(assumed), stretches: shownStretches(stretches), warnings };
}

/** @param {Facts} f @param {string} year */
function sic(f, year) {
  f.only(['amount', 'due_date', 'notice_date']);
  const owed = f.cents('amount');
  const [due, notice] = [f.date('due_date'), f.date('notice_date')];
  inYear(notice, year, 'notice_date');
  if (due < dayOf(SIC_FROM) && notice > due) unpublished('SIC rates are published from 1 April 2005.');
  /** @param {number} day @returns {[number, boolean]} */
  const rateOf = (day) => {
    const rate = sicOn(day);
    return rate === null ? unpublished(`The ATO has published SIC rates to 31 December 2026; ${longDay(isoOf(day))} is later.`) : [rate, false];
  };
  const { numerator, denominator, stretches } = compound(rateOf, owed, due, notice - 1, []);
  const days = Math.max(notice - due, 0);
  return { question: 'sic', year, sic: dollars(halfUp(numerator, denominator) - owed), days, firstDay: days ? isoOf(due) : null,
    lastDay: days ? isoOf(notice - 1) : null, stretches: shownStretches(stretches), warnings: [] };
}

const SIZES = /** @type {const} */ ({ small: 1n, medium: 2n, large: 5n, significant_global: 500n });

/** @param {Facts} f @param {string} year */
function failureToLodge(f, year) {
  f.only(['due_date', 'given_on', 'size']);
  const size = choiceIn(f.value('size'), f.item, 'size', Object.keys(SIZES));
  const [due, given] = [f.date('due_date'), f.date('given_on')];
  inYear(given, year, 'given_on');
  if (given < due) dateOrder('Enter a lodgement date on or after the due date.');
  if (penaltyUnitOn(due) === null) {
    refuse('ato_interest_penalties.penalty_unit_unpublished', 'The ATO’s penalty unit table starts its values on 28 December 2012; an earlier due date is not worked.');
  }
  if (size === 'significant_global' && due < dayOf('2017-07-01')) {
    refuse('ato_interest_penalties.sge_before_2017', 'The significant global entity penalty applies to documents due on or after 1 July 2017 (PS LA 2011/19 para 23).');
  }
  const late = given - due;
  // s 286-80(2) and (5): 1 unit for each 28 days or part, at most 5, each at the unit applying when its period starts.
  const periods = Array.from({ length: Math.min(Math.ceil(late / 28), 5) }, (_, k) => {
    const start = due + 28 * k;
    return { from: isoOf(start), unit: /** @type {number} */ (penaltyUnitOn(start)) };
  });
  const base = periods.reduce((sum, p) => sum + BigInt(p.unit) * 100n, 0n);
  const multiplier = SIZES[/** @type {keyof typeof SIZES} */ (size)];
  return { question: 'failure_to_lodge', year, basePenaltyAmount: dollars(base), penalty: dollars(base * multiplier),
    multiplier: Number(multiplier), daysLate: late, penaltyUnits: periods.length, periods, warnings: [] };
}

/** Each behaviour's base penalty percentage (items 1 to 3) and penalty units with no shortfall (items 3A to 3C). */
const BEHAVIOURS = /** @type {const} */ ({ intentional_disregard: [75n, 60n], recklessness: [50n, 40n],
  failure_to_take_reasonable_care: [25n, 20n], reasonable_care: [0n, 0n] });
const DISCLOSURES = ['none', 'before_examination', 'during_examination'];
const PART_FIELDS = ['shortfall_amount', 'behaviour', 'not_reasonably_arguable', 'accepted_way_amount', 'increase', 'disclosure'];

/** @typedef {{shortfall: bigint | null, behaviour: keyof typeof BEHAVIOURS, notArguable: boolean, accepted: bigint,
 *   increase: boolean, disclosure: string}} Part */
/** @param {unknown} item @param {string} name @returns {Part} */
function part(item, name) {
  if (!isObject(item)) refuse('ato_interest_penalties.fact_invalid', `${name} must be an object.`);
  known(item, name, 'a part', PART_FIELDS);
  const shortfall = required(item, name, 'shortfall_amount') === null ? null : amount(item, name, 'shortfall_amount');
  const behaviour = /** @type {keyof typeof BEHAVIOURS} */ (choiceIn(required(item, name, 'behaviour'), name, 'behaviour', Object.keys(BEHAVIOURS)));
  const optional = (/** @type {string} */ key) => (Object.hasOwn(item, key) ? flagIn(item[key], name, key) : false);
  const [notArguable, increase] = [optional('not_reasonably_arguable'), optional('increase')];
  const disclosure = Object.hasOwn(item, 'disclosure') ? choiceIn(item.disclosure, name, 'disclosure', DISCLOSURES) : 'none';
  const hasAccepted = Object.hasOwn(item, 'accepted_way_amount');
  const accepted = hasAccepted ? amount(item, name, 'accepted_way_amount') : 0n;
  if (shortfall === null && (notArguable || hasAccepted)) {
    refuse('ato_interest_penalties.fact_invalid', `${name}: not reasonably arguable and the accepted-way amount need a shortfall amount.`);
  }
  if (shortfall !== null && accepted > shortfall) refuse('ato_interest_penalties.fact_invalid', `${name}: the accepted-way amount cannot exceed the shortfall amount.`);
  return { shortfall, behaviour, notArguable, accepted, increase, disclosure };
}

/** s 284-90(3)(a): the greater of $10,000 and 1% of the tax on the return, in hundredths of a cent. @param {bigint} tax */
const thresholdHundredths = (tax) => (tax > 100000000n ? tax : 100000000n);

/** The tax on the return (needed only with a part not reasonably arguable) and the period's shortfall amounts disclosed
 * before an examination (MT 2012/3 para 35). @param {Facts} f @param {Part[]} parts */
function context(f, parts) {
  const disclosed = parts.filter((p) => p.disclosure === 'before_examination' && p.shortfall !== null);
  const other = 'other_disclosed_before_examination';
  if (!disclosed.length && f.given(other)) refuse('input.field_unknown', `${f.item}: ${other} is an input only with a part disclosed before an examination.`);
  const otherCents = disclosed.length ? f.cents(other) : 0n;
  const arguable = parts.some((p) => p.notArguable);
  if (arguable && f.given('trust_or_partnership') && f.flag('trust_or_partnership')) {
    refuse('ato_interest_penalties.item_not_worked', 'A trust’s or partnership’s position that is not reasonably arguable (s 284-90(1) items 5 and 6) is not worked.');
  }
  if (!arguable && f.given('income_tax_payable')) refuse('input.field_unknown', `${f.item}: income_tax_payable is an input only with a part that is not reasonably arguable.`);
  const tax = arguable ? f.cents('income_tax_payable') : null;
  return { tax, disclosedBefore: disclosed.reduce((sum, p) => sum + /** @type {bigint} */ (p.shortfall), otherCents) };
}

/** One part's base penalty amount in ten-thousandths of a cent before the SGE doubling, and what it shows.
 * @param {Part} p @param {{tax: bigint | null, unit: number}} c */
function baseAmount(p, c) {
  const [percentage, units] = BEHAVIOURS[p.behaviour];
  if (p.shortfall === null) return { scaled: units * BigInt(c.unit) * 1000000n, shown: { penaltyUnits: Number(units), penaltyUnit: c.unit } };
  const over = c.tax !== null && p.shortfall * 100n > thresholdHundredths(c.tax);
  const applied = p.notArguable && over && percentage < 25n ? 25n : percentage;
  return { scaled: (p.shortfall - p.accepted) * applied * 100n, shown: { shortfallAmount: dollars(p.shortfall),
    acceptedWayAmount: p.accepted ? dollars(p.accepted) : null, aboveThreshold: p.notArguable ? over : null, basePercentage: Number(applied) } };
}

/** s 284-225: the reduction in percent, or null where it reduces to nil. @param {Part} p @param {bigint} disclosedBefore */
function reduction(p, disclosedBefore) {
  if (p.disclosure === 'before_examination') return p.shortfall !== null && disclosedBefore >= 100000n ? 80n : null;
  return p.disclosure === 'during_examination' ? 20n : 0n;
}

/** @param {bigint} scaled ten-thousandths of a cent, half up to the cent */
const scaledCents = (scaled) => (scaled + 5000n) / 10000n;

/** @param {Facts} f @param {string} year */
function statementPenalty(f, year) {
  f.only(['statement_date', 'significant_global_entity', 'trust_or_partnership', 'income_tax_payable', 'other_disclosed_before_examination', 'parts']);
  const made = f.date('statement_date');
  inYear(made, year, 'statement_date');
  const sge = f.flag('significant_global_entity');
  const parts = f.list('parts', 100).map((item, i) => part(item, `part ${i + 1}`));
  const { tax, disclosedBefore } = context(f, parts);
  const c = { tax, unit: /** @type {number} */ (penaltyUnitOn(made)) };
  let [baseTotal, total] = [0n, 0n];
  const worked = parts.map((p, i) => {
    const { scaled, shown } = baseAmount(p, c);
    const bpa = scaled * (sge ? 2n : 1n);
    const [increase, cut] = [p.increase ? 20n : 0n, reduction(p, disclosedBefore)];
    if (cut === null && increase) {
      refuse('ato_interest_penalties.increase_with_nil', `Part ${i + 1}: s 284-225 reduces the base penalty amount to nil, not by a percentage, and s 284-85 does not say how an increase then applies; this is not worked.`);
    }
    const penalty = cut === null ? 0n : (bpa * (100n + increase - cut)) / 100n;
    [baseTotal, total] = [baseTotal + bpa, total + penalty];
    return { part: i + 1, behaviour: p.behaviour, ...shown, basePenaltyAmount: dollars(scaledCents(bpa)), increasePercent: Number(increase),
      reduction: cut === null ? 'to nil' : `${cut}%`, disclosure: p.disclosure, penalty: dollars(scaledCents(penalty)) };
  });
  return { question: 'statement_penalty', year, basePenaltyAmount: dollars(scaledCents(baseTotal)), penalty: dollars(scaledCents(total)),
    penaltyUnit: c.unit, threshold: tax === null ? null : dollars((thresholdHundredths(tax) + 99n) / 100n), parts: worked,
    warnings: sge ? ['Doubled for a significant global entity (s 284-90(1A)): stated, not tested against the trigger day'] : [] };
}

/** Every day's denominator: 10,000 (hundredths of 1%) x 365 x 366. */
const SIMPLE = 10000n * 365n * 366n;
/** Simple interest at the base interest rate from the start of `first` to the end of `last`, over SIMPLE, in cents.
 * @param {bigint} owed @param {number} first @param {number} last */
function simple(owed, first, last) {
  let sum = 0n;
  /** @type {DayStretch[]} */
  const stretches = [];
  for (let day = first; day <= last; day += 1) {
    const rate = baseOn(day);
    if (rate === null) return unpublished(`No base interest rate is published for ${longDay(isoOf(day))}: the rates run from 1 July 1999 to 31 December 2026.`);
    sum += BigInt(rate) * (yearDays(day) === 365 ? 366n : 365n);
    addDay(stretches, day, rate, false);
  }
  return { numerator: owed * sum, stretches };
}
/** ss 12D and 12E: half a cent up, and nothing under 50 cents payable. @param {bigint} numerator */
function credit(numerator) {
  const interest = (2n * numerator + SIMPLE) / (2n * SIMPLE);
  return { interest: dollars(interest), interestPayable: dollars(interest >= 50n ? interest : 0n) };
}

const LIABILITIES = ['income_tax', 'shortfall_interest_charge', 'compulsory_study_loan_repayment', 'fs_assessment_debt'];

/** @param {Facts} f @param {string} year */
function earlyPaymentInterest(f, year) {
  const fsa = f.flag('full_self_assessment');
  f.only(['amount', 'liability', 'paid_on', 'due_date', 'full_self_assessment', ...(fsa ? [] : ['notice_issued'])]);
  if (!LIABILITIES.includes(/** @type {string} */ (f.value('liability')))) {
    refuse('ato_interest_penalties.liability_not_listed', 'Only income tax, SIC, a compulsory study loan repayment or an FS assessment debt earns early payment interest (s 8A(1)(a)); GST and PAYG instalments do not.');
  }
  const owed = f.cents('amount');
  const [paid, due] = [f.date('paid_on'), f.date('due_date')];
  inYear(due, year, 'due_date');
  if (paid > due) dateOrder('The payment date is after the due date, so the payment is not early (s 8A(1)(b)).');
  const start = fsa ? paid : Math.max(paid, f.date('notice_issued'));
  const early = due - paid;
  const earns = early > 14 && start <= due;
  const { numerator, stretches } = earns ? simple(owed, start, due) : { numerator: 0n, stretches: [] };
  return { question: 'early_payment_interest', year, ...credit(numerator), daysEarly: early, entitled: early > 14, days: earns ? due - start + 1 : 0,
    firstDay: earns ? isoOf(start) : null, lastDay: earns ? isoOf(due) : null, stretches: shownStretches(stretches),
    warnings: early > 14 ? [] : [`The payment was ${early} days before the due day, not more than 14 (s 8A(1)(b)): no interest`] };
}

/** s 9(3): the refund goes to the payments in reverse order of payment, each part earning interest from the later of
 * the notice and its payment day. @param {[number, bigint][]} paid @param {bigint} refunded @param {number} notice @param {number} on */
function attribute(paid, refunded, notice, on) {
  let [left, total] = [refunded, 0n];
  const parts = [];
  for (const [day, cents] of [...paid].sort((a, b) => a[0] - b[0]).reverse()) {
    if (left === 0n) break;
    const share = left < cents ? left : cents;
    left -= share;
    const from = Math.max(notice, day);
    if (from > on) dateOrder('The refund date is before a payment it refunds or the notice day.');
    const { numerator, stretches } = simple(share, from, on);
    total += numerator;
    parts.push({ paidOn: isoOf(day), attributed: dollars(share), firstDay: isoOf(from), lastDay: isoOf(on), days: on - from + 1,
      stretches: shownStretches(stretches) });
  }
  return { total, parts };
}

/** @param {Facts} f @param {string} year */
function overpaymentInterest(f, year) {
  f.only(['payments', 'refunded', 'refunded_on', 'notice_issued', 'relevant_tax', 'decision_to_which_act_applies']);
  if (!(f.flag('relevant_tax') && f.flag('decision_to_which_act_applies'))) {
    refuse('ato_interest_penalties.not_entitled', 'Part III interest is payable only on relevant tax (s 3C) overpaid as a result of a decision to which the Act applies (s 3(1)).');
  }
  const [refunded, on, notice] = [f.cents('refunded'), f.date('refunded_on'), f.date('notice_issued')];
  inYear(on, year, 'refunded_on');
  const paid = datedAmounts(f, 'paid_on');
  if (refunded > paid.reduce((sum, [, c]) => sum + c, 0n)) refuse('ato_interest_penalties.overpaid', 'The refund is more than the payments.');
  const { total, parts } = attribute(paid, refunded, notice, on);
  return { question: 'overpayment_interest', year, refunded: dollars(refunded), ...credit(total), attribution: parts, warnings: [] };
}

const WORK = new Map(Object.entries({ gic, sic, failure_to_lodge: failureToLodge, statement_penalty: statementPenalty,
  early_payment_interest: earlyPaymentInterest, overpayment_interest: overpaymentInterest }));

/** The command: `question` picks the charge, penalty or interest; `year` is the financial year of its last date; every
 * other field is a fact of the question. Every amount is before remission.
 * @param {{question: string, year: string} & Record<string, unknown>} input */
export function atoPenaltiesInterest(input) {
  const { question, year, ...facts } = input;
  if (!ATO_PENALTY_YEARS.includes(year)) refuse('period.unsupported', 'Enter a last date from 1 July 2020 to 30 June 2028, the financial years 2020-21 to 2027-28.');
  if (question === 'remission') {
    refuse('ato_interest_penalties.remission_discretionary', 'Remission of GIC (TAA 1953 s 8AAG), SIC (TAA Sch 1 s 280-160) and administrative penalties (s 298-20) is the Commissioner’s discretion: every amount here is before remission, and the calculator does not estimate one.');
  }
  if (question === 'scheme_penalty') {
    refuse('ato_interest_penalties.scheme_penalty', 'Scheme penalties (TAA Sch 1 Subdivision 284-C) turn on the scheme’s dominant purpose and whether the position was reasonably arguable; the calculator does not work them.');
  }
  if (!ATO_QUESTIONS.includes(question)) refuse('ato_interest_penalties.question_invalid', `Choose one of ${ATO_QUESTIONS.join(', ')}.`);
  return { .../** @type {NonNullable<ReturnType<typeof WORK.get>>} */ (WORK.get(question))(new Facts(question, facts), year), remission: REMISSION };
}

// The page: the command's input from the form, how the page writes it, and the result's rows and working table.

/** Each question's last date field, which sets the financial year. */
const LAST_DATE = { gic: 'gic-to', sic: 'sic-notice', failure_to_lodge: 'ftl-given', statement_penalty: 'st-date',
  early_payment_interest: 'ep-due', overpayment_interest: 'op-refunded-on' };
export const ATO_FORM_PAYMENTS = 3;
export const ATO_FORM_PARTS = 2;
const blank = (/** @type {string} */ text) => text.trim() === '';

/** Up to 3 dated amounts from the form, skipping a blank pair. @param {(name: string) => string} value @param {string} prefix @param {string} key */
function formPayments(value, prefix, key) {
  const out = [];
  for (let i = 1; i <= ATO_FORM_PAYMENTS; i += 1) {
    const [on, paid] = [value(`${prefix}-paid-on-${i}`), value(`${prefix}-paid-${i}`)];
    if (!blank(on) || !blank(paid)) out.push({ [key]: on, amount: paid });
  }
  return out;
}

/** @param {(name: string) => string} value */
function formParts(value) {
  const parts = [];
  for (let i = 1; i <= ATO_FORM_PARTS; i += 1) {
    const behaviour = value(`st-behaviour-${i}`);
    if (behaviour === '') continue;
    const shortfall = value(`st-shortfall-${i}`);
    /** @type {Record<string, unknown>} */
    const p = { shortfall_amount: blank(shortfall) ? null : shortfall, behaviour };
    if (value(`st-nra-${i}`) === 'yes') p.not_reasonably_arguable = true;
    if (!blank(value(`st-accepted-${i}`))) p.accepted_way_amount = value(`st-accepted-${i}`);
    if (value(`st-increase-${i}`) === 'yes') p.increase = true;
    if (value(`st-disclosure-${i}`) !== 'none') p.disclosure = value(`st-disclosure-${i}`);
    parts.push(p);
  }
  return parts;
}

/** @param {(name: string) => string} value */
function formStatement(value) {
  const parts = formParts(value);
  /** @type {Record<string, unknown>} */
  const facts = { statement_date: value('st-date'), significant_global_entity: value('st-sge') === 'yes', parts };
  if (value('st-trust') === 'yes') facts.trust_or_partnership = true;
  if (parts.some((p) => p.not_reasonably_arguable)) facts.income_tax_payable = value('st-tax');
  if (parts.some((p) => p.disclosure === 'before_examination' && p.shortfall_amount !== null)) facts.other_disclosed_before_examination = value('st-other');
  return facts;
}

/** Each question's facts from the form. @type {Record<string, (value: (name: string) => string) => Record<string, unknown>>} */
const FORM_FACTS = {
  gic: (value) => {
    const payments = formPayments(value, 'gic', 'date');
    return { amount: value('gic-amount'), due_date: value('gic-due'), to: value('gic-to'), ...(payments.length ? { payments } : {}),
      ...(blank(value('gic-assumed')) ? {} : { assumed_annual_rate: value('gic-assumed') }) };
  },
  sic: (value) => ({ amount: value('sic-amount'), due_date: value('sic-due'), notice_date: value('sic-notice') }),
  failure_to_lodge: (value) => ({ due_date: value('ftl-due'), given_on: value('ftl-given'), size: value('ftl-size') }),
  statement_penalty: formStatement,
  early_payment_interest: (value) => {
    const fsa = value('ep-fsa') === 'yes';
    return { amount: value('ep-amount'), liability: value('ep-liability'), paid_on: value('ep-paid'), due_date: value('ep-due'),
      full_self_assessment: fsa, ...(fsa ? {} : { notice_issued: value('ep-notice') }) };
  },
  overpayment_interest: (value) => ({ payments: formPayments(value, 'op', 'paid_on'), refunded: value('op-refunded'),
    refunded_on: value('op-refunded-on'), notice_issued: value('op-notice'), relevant_tax: value('op-relevant') === 'yes',
    decision_to_which_act_applies: value('op-decision') === 'yes' }),
};
const FORM_FACTS_OF = new Map(Object.entries(FORM_FACTS));

/** The command's input from the page's fields; the year is the financial year of the question's last date.
 * @param {(name: string) => string} value @returns {{question: string, year: string} & Record<string, unknown>} */
export function atoPenaltiesFormInput(value) {
  const question = value('question');
  const facts = FORM_FACTS_OF.get(question)?.(value) ?? {};
  const last = Object.hasOwn(LAST_DATE, question) ? value(LAST_DATE[/** @type {keyof typeof LAST_DATE} */ (question)]) : '2026-07-01';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(last) ? dayOf(last) : NaN;
  return { question, year: Number.isInteger(day) && isoOf(day) === last ? financialYear(day) : '', ...facts };
}

/** '21 November 2025'. @param {unknown} iso */
const longDay = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)
  ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(iso));
const SIZE_NAMES = { small: 'a small entity', medium: 'a medium entity (x2)', large: 'a large entity (x5)', significant_global: 'a significant global entity (x500)' };
const BEHAVIOUR_NAMES = { intentional_disregard: 'intentional disregard', recklessness: 'recklessness',
  failure_to_take_reasonable_care: 'failure to take reasonable care', reasonable_care: 'reasonable care taken' };
const DISCLOSURE_NAMES = { before_examination: 'disclosed before an examination', during_examination: 'disclosed after notice of an examination, saving time' };
const LIABILITY_NAMES = { income_tax: 'income tax', shortfall_interest_charge: 'SIC', compulsory_study_loan_repayment: 'a compulsory study loan repayment',
  fs_assessment_debt: 'an FS assessment debt' };
/** @param {Record<string, string>} names @param {unknown} key */
const named = (names, key) => names[/** @type {string} */ (key)] ?? String(key);

/** @param {Record<string, any>} x @param {(value: number) => string} money @param {string} key */
function paymentsText(x, money, key) {
  return (x.payments ?? []).map((/** @type {Record<string, string>} */ p) => `${money(Number(p.amount))} paid ${longDay(p[key])}`).join(', ');
}

/** How the page writes each question's input. @type {Record<string, (x: Record<string, any>, money: (value: number) => string) => string>} */
const INPUT_TEXT = {
  gic: (x, m) => [`GIC on ${m(Number(x.amount))} due ${longDay(x.due_date)}, to ${longDay(x.to)}`, paymentsText(x, m, 'date'),
    x.assumed_annual_rate === undefined ? '' : `${x.assumed_annual_rate}% a year assumed after December 2026`].filter(Boolean).join('; '),
  sic: (x, m) => `SIC on ${m(Number(x.amount))} of additional tax first due ${longDay(x.due_date)}, amended assessment notice ${longDay(x.notice_date)}`,
  failure_to_lodge: (x) => `Failure to lodge, due ${longDay(x.due_date)}, lodged ${longDay(x.given_on)}, ${named(SIZE_NAMES, x.size)}`,
  statement_penalty: (x, m) => [`Statement penalty, statement made ${longDay(x.statement_date)}${x.significant_global_entity ? ', a significant global entity' : ''}`,
    ...x.parts.map((/** @type {Record<string, any>} */ p, /** @type {number} */ i) => `part ${i + 1}: ${p.shortfall_amount === null ? 'no shortfall amount'
      : `shortfall ${m(Number(p.shortfall_amount))}`}, ${named(BEHAVIOUR_NAMES, p.behaviour)}${p.not_reasonably_arguable ? ', not reasonably arguable' : ''}`
      + `${p.accepted_way_amount === undefined ? '' : `, ${m(Number(p.accepted_way_amount))} from an accepted treatment`}${p.increase ? ', increased 20%' : ''}`
      + `${p.disclosure ? `, ${named(DISCLOSURE_NAMES, p.disclosure)}` : ''}`),
    x.income_tax_payable === undefined ? '' : `income tax on the return ${m(Number(x.income_tax_payable))}`,
    x.other_disclosed_before_examination === undefined ? '' : `other shortfalls disclosed before an examination ${m(Number(x.other_disclosed_before_examination))}`,
    x.trust_or_partnership ? 'a trust or partnership' : ''].filter(Boolean).join('; '),
  early_payment_interest: (x, m) => `${m(Number(x.amount))} of ${named(LIABILITY_NAMES, x.liability)} paid ${longDay(x.paid_on)}, due ${longDay(x.due_date)}, `
    + `${x.full_self_assessment ? 'full self-assessment taxpayer' : `notice issued ${longDay(x.notice_issued)}`}`,
  overpayment_interest: (x, m) => `${paymentsText(x, m, 'paid_on')}; notice issued ${longDay(x.notice_issued)}; ${m(Number(x.refunded))} refunded `
    + `${longDay(x.refunded_on)}${x.relevant_tax && x.decision_to_which_act_applies ? '' : '; not relevant tax overpaid on a decision'}`,
  remission: () => 'Remission of a charge or penalty',
  scheme_penalty: () => 'A scheme penalty',
};

/** How the page writes the command's input. @param {Record<string, any>} input @param {(value: number) => string} money */
export function atoPenaltiesInputsText(input, money) {
  return (INPUT_TEXT[input.question] ?? (() => String(input.question)))(input, money);
}

/** A stretch of days as a row of the working table. @param {Stretch} s */
const stretchRow = (s) => [`${longDay(s.from)} to ${longDay(s.to)}`, `${s.days} day${s.days === 1 ? '' : 's'}`,
  `${s.rate.toFixed(2)}% a year${s.assumed ? ', assumed' : ''}`];
const days = (/** @type {number} */ n) => `${n} day${n === 1 ? '' : 's'}`;

/** Each question's rows, principal row and working table. @type {Record<string, (r: Record<string, any>, aud: (value: number) => string) => {rows: string[][], working: string[][]}>} */
const RESULT = {
  gic: (r, aud) => ({ rows: [[`GIC to ${longDay(r.stretches.at(-1).to)}`, aud(r.gic)], ['Paid in the period', aud(r.paid)],
    ['Owing at the end of that day, with GIC', aud(r.balance)], ['Days of GIC', days(r.days)]], working: r.stretches.map(stretchRow) }),
  sic: (r, aud) => ({ rows: [['SIC', aud(r.sic)], ['Days of SIC', r.days ? `${days(r.days)}, ${longDay(r.firstDay)} to ${longDay(r.lastDay)}` : '0 days']],
    working: r.stretches.map(stretchRow) }),
  failure_to_lodge: (r, aud) => ({ rows: [['Failure to lodge penalty', aud(r.penalty)], ['Days late', days(r.daysLate)],
    ['Penalty units', String(r.penaltyUnits)], ['Base penalty amount', aud(r.basePenaltyAmount)], ['Size multiplier', `x${r.multiplier}`]],
    working: r.periods.map((/** @type {{from: string, unit: number}} */ p, /** @type {number} */ k) => [`28-day period ${k + 1}, from ${longDay(p.from)}`,
      '1 penalty unit', aud(p.unit)]) }),
  statement_penalty: (r, aud) => ({ rows: [['Statement penalty', aud(r.penalty)], ['Base penalty amount', aud(r.basePenaltyAmount)],
    ['Penalty unit on the statement date', aud(r.penaltyUnit)], ...(r.threshold === null ? [] : [['Reasonably arguable threshold', aud(r.threshold)]])],
    working: r.parts.map((/** @type {Record<string, any>} */ p) => [`Part ${p.part}: ${named(BEHAVIOUR_NAMES, p.behaviour)}`,
      `${p.shortfallAmount === undefined ? `${p.penaltyUnits} penalty units` : `${p.basePercentage}% of ${aud(p.shortfallAmount - (p.acceptedWayAmount ?? 0))}`}`
      + `${p.aboveThreshold === false ? ' (not above the threshold)' : ''}, base ${aud(p.basePenaltyAmount)}, increase ${p.increasePercent}%, reduction ${p.reduction}`,
      aud(p.penalty)]) }),
  early_payment_interest: (r, aud) => ({ rows: [['Interest payable', aud(r.interestPayable)], ['Interest worked out', aud(r.interest)],
    ['Days early', days(r.daysEarly)], ['Days of interest', r.days ? `${days(r.days)}, ${longDay(r.firstDay)} to ${longDay(r.lastDay)}` : '0 days']],
    working: r.stretches.map(stretchRow) }),
  overpayment_interest: (r, aud) => ({ rows: [['Interest payable', aud(r.interestPayable)], ['Interest worked out', aud(r.interest)], ['Refunded', aud(r.refunded)]],
    working: r.attribution.flatMap((/** @type {Record<string, any>} */ a) => [[`${aud(a.attributed)} of the payment on ${longDay(a.paidOn)}`,
      `${longDay(a.firstDay)} to ${longDay(a.lastDay)}`, days(a.days)], ...a.stretches.map(stretchRow)]) }),
};
const RESULT_OF = new Map(Object.entries(RESULT));

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function atoPenaltiesInterestResult(value, aud) {
  const input = atoPenaltiesFormInput(value);
  const r = atoPenaltiesInterest(input);
  const { rows, working } = /** @type {NonNullable<ReturnType<typeof RESULT_OF.get>>} */ (RESULT_OF.get(r.question))(r, aud);
  const note = [...r.warnings, r.remission].join('. ');
  return { inputs: atoPenaltiesInputsText(input, aud), rows, principal: 0, note, tables: { working } };
}
