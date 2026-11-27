// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// GST adjustments and tests beside the GST and margin scheme calculators: the 6 commands of
// ryanduguid/australian-accounting (PRs 799 and 801, merged in #813) ported line for line, with their inputs,
// conditions, steps, rounding and refusal codes in the order the commands check them:
// - `gst-creditable-purpose-change`: GST Act Division 129, whether a tax period ending on 30 June is an
//   adjustment period (ss 129-10, 129-20 and 129-25) and the adjustment (ss 129-40, 129-70 and 129-75);
// - `gst-annual-apportionment`: Division 131, eligibility (s 131-5), the credit (s 131-40) and the
//   increasing adjustment (s 131-55) against the s 11-30 credit;
// - `gst-financial-acquisitions-threshold`: Division 189, the current (s 189-5) and future (s 189-10) tests;
// - `gst-going-concern`: s 38-325, condition by condition;
// - `gst-second-hand-goods`: Subdivision 66-A (ss 66-5 and 66-10) with the s 195-1 exclusions and GSTD 2012/6;
// - `gst-bad-debt`: Division 21 (ss 21-5 to 21-20) reduced under Subdivision 136-A (ss 136-5 and 136-10(1)).
// The commands cite the GST Act compilation 96 (C2026C00081, from 1 January 2026), whose provisions here read
// the same as compilation 82 (in force on 1 July 2020), and GSTR 2000/24, GSTR 2003/9, GSTR 2002/5, GSTD 2012/6
// and GSTR 2000/2, all read 22 November 2026. The authority and consequence texts below are the commands' own.
// Amounts are worked as the commands work them, in a 40-digit decimal context rounded half even, and each is
// shown to the cent half up.

export const GST_ADJUSTMENT_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
export function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** @typedef {{c: bigint, e: number}} Dec A decimal: coefficient times 10 to the exponent. */

const TEN = 10n;
const PRECISION = 40;
/** @param {bigint} n */
const digits = (n) => (n < 0n ? -n : n).toString().length;
/** @param {bigint} n */
const abs = (n) => (n < 0n ? -n : n);

/** `c` rounded half even to the context's 40 digits, `sticky` when a discarded remainder follows it.
 * @param {bigint} c @param {number} e @param {boolean} [sticky] @returns {Dec} */
export function rounded(c, e, sticky = false) {
  const n = digits(c);
  if (n <= PRECISION && !sticky) return { c, e };
  const drop = Math.max(n - PRECISION, 0);
  const divisor = TEN ** BigInt(drop);
  const sign = c < 0n ? -1n : 1n;
  let high = abs(c) / divisor;
  const low = abs(c) % divisor;
  const twice = 2n * low;
  if (drop > 0 && (twice > divisor || (twice === divisor && (sticky || high % 2n === 1n)))) high += 1n;
  if (drop === 0 && sticky) return { c, e };
  let exponent = e + drop;
  if (digits(high) > PRECISION) {
    high /= TEN;
    exponent += 1;
  }
  return { c: sign * high, e: exponent };
}
/** @param {Dec} a @param {Dec} b */
export const mul = (a, b) => rounded(a.c * b.c, a.e + b.e);
/** @param {Dec} a @param {Dec} b @returns {[bigint, bigint, number]} */
const aligned = (a, b) => {
  const e = Math.min(a.e, b.e);
  return [a.c * TEN ** BigInt(a.e - e), b.c * TEN ** BigInt(b.e - e), e];
};
/** @param {Dec} a @param {Dec} b */
export const sub = (a, b) => { const [x, y, e] = aligned(a, b); return rounded(x - y, e); };
/** @param {Dec} a @param {Dec} b */
/** The quotient rounded half even to 40 digits. @param {Dec} a @param {Dec} b */
export function div(a, b) {
  const shift = Math.max(PRECISION + 2 + digits(b.c) - digits(a.c), 0);
  const top = abs(a.c) * TEN ** BigInt(shift);
  const q = top / abs(b.c);
  const r = top % abs(b.c);
  const sign = (a.c < 0n) !== (b.c < 0n) ? -1n : 1n;
  return rounded(sign * q, a.e - b.e - shift, r !== 0n);
}
/** -1, 0 or 1. @param {Dec} a @param {Dec} b */
export const cmp = (a, b) => { const [x, y] = aligned(a, b); return x < y ? -1 : x > y ? 1 : 0; };
/** @param {string} text */
export const d = (text) => { const [whole, part = ''] = text.split('.'); return { c: BigInt(whole + part), e: -part.length }; };
export const ZERO = d('0');
const ONE = d('1');
/** The decimal to the cent, half up, as the commands write it. @param {Dec} a */
export function cents(a) {
  let q;
  if (a.e >= -2) q = abs(a.c) * TEN ** BigInt(a.e + 2);
  else {
    const divisor = TEN ** BigInt(-2 - a.e);
    q = abs(a.c) / divisor;
    if (2n * (abs(a.c) % divisor) >= divisor) q += 1n;
  }
  return `${a.c < 0n ? '-' : ''}${q / 100n}.${String(q % 100n).padStart(2, '0')}`;
}
/** A decimal's value as a JavaScript number, for display. @param {Dec} a */

/** Python's whitespace, which the commands strip from a decimal before reading it. */
const SPACE = /[\t\n\v\f\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/; // eslint-disable-line no-control-regex -- Python's whitespace includes U+001C to U+001F
/** `text` without Python's whitespace at either end. @param {string} text */
export const stripSpace = (text) => {
  let start = 0;
  let end = text.length;
  while (start < end && SPACE.test(text.charAt(start))) start += 1;
  while (end > start && SPACE.test(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
};

/** A decimal input as the commands read it: a Dec, `null` for a value that is not finite or not a string, or a
 * refusal for text they cannot read. @param {string} key @param {unknown} value @returns {Dec | null} */
function decimal(key, value) {
  if (typeof value !== 'string') return null;
  if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', `${key}: the number has too many digits.`);
  const text = stripSpace(value);
  if (/^[+-]?(inf|infinity|s?nan\d*)$/i.test(text)) return null;
  const parts = /^(-?)(\d+(?:\.\d+)?)$/.exec(text); // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!parts) refuse('input.decimal_unreadable', `${key}: enter a number in digits, such as 1250.50.`);
  const v = d(parts[2]);
  return parts[1] ? { c: -v.c, e: v.e } : v;
}

/** An amount: finite, nil or more, at most 2 decimal places and $1,000,000,000,000. @param {Dec | null} v @param {string} key */
function money(v, key) {
  if (v === null || v.c < 0n || v.e < -2 || cmp(v, d('1000000000000')) > 0) {
    refuse('input.amount_invalid', `Enter ${key} as an amount of 0 or more with no more than 2 decimal places.`);
  }
  return v;
}

/** A fraction from 0 to 1. @param {Dec | null} v @param {string} name */
function fraction(v, name) {
  if (v === null || cmp(v, ZERO) < 0 || cmp(v, ONE) > 0) refuse('input.fraction_invalid', `${name} must be a fraction from 0 to 1.`);
  return v;
}

/** @param {unknown} value @param {string} name @returns {boolean} */
function flag(value, name) {
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `${name} must be yes or no.`);
  return value;
}

const DAY = 86400000;
/** A YYYY-MM-DD date from 1900 to 2100 as a day number, or null. @param {unknown} text */
export function parseDay(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, dd] = text.split('-').map(Number);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || dd < 1 || dd > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return Date.UTC(y, m - 1, dd) / DAY;
}
/** @param {unknown} value @param {string} name */
function dateArg(value, name) {
  const day = parseDay(value);
  if (day === null) refuse('input.date_invalid', `${name} must be a YYYY-MM-DD date from 1900 to 2100.`);
  return day;
}
/** @param {number} day @returns {[number, number, number]} */
const civil = (day) => { const t = new Date(day * DAY); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
/** The same day `months` later or earlier, or the month's last day. @param {number} day @param {number} months */
function addMonths(day, months) {
  const [y, m, dd] = civil(day);
  const index = y * 12 + (m - 1) + months;
  const [year, month] = [Math.floor(index / 12), (index % 12 + 12) % 12];
  return Date.UTC(year, month, Math.min(dd, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())) / DAY;
}

/** The checks every command makes before its worksheet: unknown, then missing and unreadable inputs, then scope and
 * year. @param {Record<string, unknown>} input @param {string} command @param {string[]} required
 * @param {string[]} decimals @param {string[]} optional @returns {{year: string, dec: Record<string, Dec | null>}} */
function checked(input, command, required, decimals, optional) {
  const extra = Object.keys(input).find((key) => !required.includes(key) && !optional.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not an input of ${command}.`);
  /** @type {Record<string, Dec | null>} */
  const dec = {};
  for (const key of [...required, ...optional]) {
    if (!(key in input)) {
      if (required.includes(key)) refuse('input.missing_field', `${key} is required.`);
      continue;
    }
    if (decimals.includes(key)) dec[key] = decimal(key, input[key]); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  }
  if (input.scope_confirmed !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = input.year;
  if (typeof year !== 'string' || !GST_ADJUSTMENT_YEARS.includes(year)) {
    refuse('period.unsupported', `Choose an income year from ${GST_ADJUSTMENT_YEARS[0]} to ${GST_ADJUSTMENT_YEARS.at(-1)}.`);
  }
  return { year, dec };
}

/** @typedef {{condition: string, authority: string, met: boolean}} Condition */
/** @param {string} id @param {string} authority @param {boolean} met @returns {Condition} */
const condition = (id, authority, met) => ({ condition: id, authority, met });
/** @param {Condition[]} rows */
const failing = (rows) => rows.filter((row) => !row.met).map((row) => row.condition);
/** Each step's amount to the cent. @param {[string, Dec][]} steps */
const amountsOf = (steps) => Object.fromEntries(steps.map(([id, v]) => [id, cents(v)]));

/** `first` times each factor given: the product. @param {Dec} first @param {(Dec | undefined)[]} rest */
const product = (first, rest) => {
  let value = first;
  for (const factor of rest) if (factor) value = mul(value, factor);
  return value;
};

const CP_BELOW_FINANCE = "GST Act s 129-10(1): no adjustment for an acquisition that relates to business finance unless its GST exclusive value is more than $10,000";
const CP_BELOW_OTHER = "GST Act s 129-10(2): no adjustment for an acquisition that does not relate to business finance unless its GST exclusive value is more than $1,000";
const CP_TOO_EARLY = "GST Act s 129-20(1)(a): the tax period starts less than 12 months after the end of the tax period the acquisition is attributable to, so it is not an adjustment period";
const CP_TOO_LATE = "GST Act s 129-20(2) and (3): the tax period is after the last of the adjustment periods the GST exclusive value allows";
const CP_AFTER_END = "GST Act s 129-25(1): the thing was disposed of, lost, stolen or destroyed, or its period expired, and the next tax period ending on 30 June after that was the last adjustment period";
const CP_AFTER_132 = "GST Act s 129-25(2): the thing was disposed of with a Division 132 decreasing adjustment, and the last adjustment period is the last to end before the disposal";
const AA_TURNOVER_THRESHOLD = "2000000";
const AA_ENTITY = "GST Act s 131-5(1)(a): a small business entity (other than because of ITAA 1997 s 328-110(4)) for the income year, or an entity that does not carry on a business with a GST turnover not over the $2 million annual apportionment turnover threshold (s 131-5(2))";
const AA_NO_INSTALMENTS = "GST Act s 131-5(1)(b): no election to pay GST by instalments (s 162-15) in effect";
const AA_NO_ANNUAL_PERIOD = "GST Act s 131-5(1)(c): no annual tax period election (s 151-10) in effect";
const AA_ATTRIBUTION = "The increasing adjustment is attributable to the tax period in which the income tax return for the income year in which the credit's tax period starts is due, or to the tax period with 31 December of the next financial year without a return, or to an earlier tax period you choose (GST Act s 131-60(1)); to the tax period in which a revocation or disallowance during the financial year takes effect (s 131-60(2)).";
const AA_CEASES = "An election ceases on revocation, disallowance, not being a small business entity for an income year (from the start of the tax period with that income year's first day) or failing s 131-5(1)(a)(ii) on 31 July (from that tax period) (GST Act s 131-20).";
const AA_NOT_ELIGIBLE = "The entity is not eligible to make an annual apportionment election (GST Act s 131-5), so the credit is apportioned in the tax period it is attributable to (s 11-30).";
const AA_NO_ELECTION = "No annual apportionment election is made, so the credit is apportioned in the tax period it is attributable to (GST Act s 11-30).";
const FAT_AMOUNT_LIMIT = "150000";
const FAT_EXCEEDS = "The entity exceeds the financial acquisitions threshold (GSTR 2003/9 para 13: either test is enough): an acquisition is not for a creditable purpose to the extent it relates to making input taxed financial supplies (GST Act s 11-15(2)(a)), apart from reduced credit acquisitions (Division 70), and changes in applying things to financial supplies count for Division 129 (s 129-5(2)).";
const FAT_WITHIN = "The entity does not exceed the financial acquisitions threshold: an acquisition relating to making financial supplies is not, for that reason alone, outside a creditable purpose (GST Act s 11-15(4)), and Division 129 disregards changes in applying things to financial supplies (s 129-5(2)).";
const GC_CONSIDERATION = "GST Act s 38-325(1)(a): the supply is for consideration";
const GC_REGISTERED = "GST Act s 38-325(1)(b): the recipient is registered or required to be registered";
const GC_AGREED = "GST Act s 38-325(1)(c): the supplier and the recipient have agreed in writing that the supply is of a going concern, on or before the day of the supply (GSTR 2002/5 para 182)";
const GC_ALL_THINGS = "GST Act s 38-325(2)(a): under the arrangement the supplier supplies to the recipient all of the things that are necessary for the continued operation of an enterprise";
const GC_CARRIED_ON = "GST Act s 38-325(2)(b): the supplier carries on, or will carry on, the enterprise until the day of the supply (whether or not as part of a larger enterprise)";
const GC_NOT_GST_FREE = "The supply is not GST-free under s 38-325; whether it, or each part of it, is taxable, input taxed or GST-free under another provision is not decided here.";
const GC_GST_FREE = ["The supply of the going concern is GST-free (GST Act s 38-325(1)).", "A recipient that intends some supplies made through the enterprise to be neither taxable nor GST-free has an increasing adjustment under s 135-5, and Division 129 applies to later changes in that proportion under s 135-10 (GSTR 2002/5 paras 13 and 14)."];
const SHG_LIMIT = "300";
const SHG_FOR_SALE = "GST Act s 66-5(1): the second-hand goods are acquired for sale or exchange (but not for manufacture) in the ordinary course of business";
const SHG_GOODS = "GST Act s 195-1 'second-hand goods': the goods are not animals or plants";
const SHG_SUPPLY_TO_YOU = "GST Act s 66-5(2)(a): the supply of the goods to you was neither a taxable supply nor GST-free";
const SHG_IMPORTED = "GST Act s 66-5(2)(b): you did not import the goods";
const SHG_HIRE = "GST Act s 66-5(2)(c): the supply of the goods to you was not by way of hire";
const SHG_RESUPPLY = "GST Act s 66-5(2)(e): you do not make a supply of the goods that is not a taxable supply";
const SHG_NOT_APPLIES = "Subdivision 66-A gives no input tax credit for this acquisition; whether another provision does is not decided here.";
const SHG_APPLIES = ["The acquisition is a creditable acquisition despite the supply to you not being taxable (GST Act s 66-5(1)); keep the record s 66-17 requires: the supplier's name and address, the goods and their quantity, and the date and consideration of the acquisition.", "Where the consideration is more than $300, or you choose, the credit is attributable to the tax period in which any consideration for your taxable supply of the goods is received, or an earlier invoice is issued (s 66-15(1)); on a cash basis, to the extent the consideration is received (s 66-15(2)). Otherwise s 29-10 attributes it."];
const BD_QUALIFIES_SUPPLIER = "GST Act s 21-5(1)(a): you made a taxable supply";
const BD_QUALIFIES_RECIPIENT = "GST Act s 21-15(1)(a): you made a creditable acquisition for consideration";
const BD_ATTRIBUTED_SUPPLIER = "GSTR 2000/2 para 15: the GST on the supply was attributed to an earlier tax period, or is attributed to the one in which the debt is written off";
const BD_ATTRIBUTED_RECIPIENT = "GSTR 2000/2 para 21: the input tax credit was attributed to an earlier tax period, or is attributed to the one in which you become aware the debt is written off";
const BD_WRITTEN_OFF = "GST Act ss 21-5(1)(c) and 21-15(1)(c): the debt is written off as bad, or has been overdue for 12 months or more (s 195-1 'overdue')";
const BD_NOT_CASH = "GST Act ss 21-5(2) and 21-15(2): you do not account on a cash basis";
const BD_PRIOR = "GST Act ss 21-10(a) and 21-20(a): you had the earlier adjustment under s 21-5 or s 21-15 for the debt";

const FAT_PROVISIONS = {
  current: ["GST Act s 189-5(1)(a): the input tax credits for the financial acquisitions of the 12 months ending at the end of the month, treated as solely for a creditable purpose, do not exceed $150,000",
    "GST Act s 189-5(1)(b): those credits are not more than 10% of the input tax credits for all acquisitions and importations of those 12 months, the financial acquisitions included"],
  currentGroup: ["GST Act s 189-5(2)(a): the input tax credits for every GST group member's financial acquisitions of the 12 months ending at the end of the month, treated as solely for a creditable purpose, do not exceed $150,000",
    "GST Act s 189-5(2)(b): those credits are not more than 10% of the input tax credits for all the members' acquisitions and importations of those 12 months, the financial acquisitions included"],
  future: ["GST Act s 189-10(1)(a): the input tax credits for the financial acquisitions of the month and the next 11 months, treated as solely for a creditable purpose, do not exceed $150,000",
    "GST Act s 189-10(1)(b): those credits are not more than 10% of the input tax credits for all acquisitions and importations of those months, the financial acquisitions included"],
  futureGroup: ["GST Act s 189-10(2)(a): the input tax credits for every GST group member's financial acquisitions of the month and the next 11 months, treated as solely for a creditable purpose, do not exceed $150,000",
    "GST Act s 189-10(2)(b): those credits are not more than 10% of the input tax credits for all the members' acquisitions and importations of those months, the financial acquisitions included"],
};
const BD_APPLIES = 'The adjustment is made in the tax period to which it is attributable; this command does not work out that period.';
const BD_NOT_APPLIES = 'Division 21 gives no adjustment on these facts.';

// Division 129: a change in creditable purpose.
const CP_REQUIRED = ['gst_exclusive_value', 'relates_to_business_finance', 'full_input_tax_credit', 'intended_or_former_application',
  'actual_application', 'application_basis', 'attributed_period_end', 'tax_period_months', 'year', 'scope_confirmed'];

/** The first day of the tax period of `months` months that ends on 30 June of `endYear`. @param {number} endYear @param {number} months */
const periodStart = (endYear, months) => addMonths(Date.UTC(endYear, 6, 1) / DAY, -months);
/** The calendar year in which the financial year containing `day` ends. @param {number} day */
const yearEnding = (day) => { const [y, m] = civil(day); return m >= 7 ? y + 1 : y; };

/** Whether the tested 30 June tax period is an adjustment period (ss 129-20 and 129-25).
 * @param {Record<string, unknown>} x @param {string} year @param {Dec} value @param {boolean} finance */
function adjustmentPeriod(x, year, value, finance) {
  const months = x.tax_period_months;
  if (typeof months !== 'number' || ![1, 3, 12].includes(months)) {
    refuse('gst_creditable_purpose_change.tax_period_unsupported', 'tax_period_months must be 1, 3 or 12: calendar months, quarters or a '
      + 'financial year, each with a tax period ending on 30 June.');
  }
  const attributed = dateArg(x.attributed_period_end, 'attributed_period_end');
  if (civil(attributed + 1)[2] !== 1) {
    refuse('gst_creditable_purpose_change.period_end_invalid', 'attributed_period_end must be the last day of a month, the end of the tax '
      + 'period the acquisition is attributable to.');
  }
  const earliest = addMonths(attributed + 1, 12);
  let firstYear = yearEnding(earliest);
  if (periodStart(firstYear, months) < earliest) firstYear += 1;
  const tested = Number(year.slice(0, 4)) + 1;
  const [low, lowCount] = finance ? ['50000', 1] : ['5000', 2];
  const count = cmp(value, d(low)) <= 0 ? lowCount : cmp(value, d('500000')) < 0 ? 5 : 10;
  const number = tested - firstYear + 1;
  /** @type {[number, string] | null} */
  let last = null;
  if (!('ended_on' in x)) {
    if ('division_132_disposal' in x) refuse('input.missing_field', 'ended_on is required with division_132_disposal.');
  } else {
    const ended = dateArg(x.ended_on, 'ended_on');
    const by132 = 'division_132_disposal' in x ? flag(x.division_132_disposal, 'division_132_disposal') : false;
    const own = yearEnding(ended);
    if (by132) last = [own - 1, CP_AFTER_132];
    else {
      if (ended >= periodStart(own, months)) {
        refuse('gst_creditable_purpose_change.last_period_unsettled', 'ended_on falls in a tax period that itself ends on 30 June; whether '
          + 'section 129-25(1)’s ‘next tax period’ that ends on 30 June is that period or the following one is not settled here.');
      }
      last = [own, CP_AFTER_END];
    }
  }
  if (last && last[1] === CP_AFTER_END && last[0] < firstYear && last[0] === tested) {
    refuse('gst_creditable_purpose_change.last_period_unsettled', 'The next tax period ending on 30 June after ended_on ends before the '
      + 'first adjustment period section 129-20(1) allows; whether section 129-25(1), which applies despite section 129-20, makes it an '
      + 'adjustment period is not settled here.');
  }
  const notOne = number < 1 ? CP_TOO_EARLY : last && tested > last[0] ? last[1] : number > count ? CP_TOO_LATE : null;
  return { number, count, firstYear, notOne };
}

/** GST Act Division 129: the adjustment, if any, for one acquisition in the tax period ending on 30 June of the year.
 * @param {Record<string, unknown>} x */
export function gstCreditablePurposeChange(x) {
  const { year, dec } = checked(x, 'gst-creditable-purpose-change', CP_REQUIRED,
    ['gst_exclusive_value', 'full_input_tax_credit', 'intended_or_former_application', 'actual_application'], ['ended_on', 'division_132_disposal']);
  const value = money(dec.gst_exclusive_value, 'the GST exclusive value');
  const finance = flag(x.relates_to_business_finance, 'relates_to_business_finance');
  const full = money(dec.full_input_tax_credit, 'the full input tax credit');
  const former = fraction(dec.intended_or_former_application, 'intended_or_former_application');
  const actual = fraction(dec.actual_application, 'actual_application');
  const basis = x.application_basis;
  if (typeof basis !== 'string' || !basis.trim() || [...basis].length > 200) {
    refuse('gst_creditable_purpose_change.basis_missing', 'Describe, in 1 to 200 characters, the method and records the 2 applications '
      + 'rest on; the calculator does not judge whether the method is fair or reasonable.');
  }
  const period = adjustmentPeriod(x, year, value, finance);
  const why = (cmp(value, d(finance ? '10000' : '1000')) <= 0 ? (finance ? CP_BELOW_FINANCE : CP_BELOW_OTHER) : null) ?? period.notOne;
  /** @type {[string, Dec][]} */
  let steps = [['increasing_adjustment', ZERO], ['decreasing_adjustment', ZERO]];
  if (why === null && cmp(actual, former) < 0) steps = [['increasing_adjustment', mul(full, sub(former, actual))], ['decreasing_adjustment', ZERO]];
  else if (why === null && cmp(actual, former) > 0) steps = [['increasing_adjustment', ZERO], ['decreasing_adjustment', mul(full, sub(actual, former))]];
  return { period: year, amounts: amountsOf(steps), rates: { value_threshold: finance ? '10000' : '1000', adjustment_periods: String(period.count) },
    adjustment_period: { is_adjustment_period: period.notOne === null, number: period.notOne === null ? period.number : null, of: period.count,
      first: `the tax period ending 30 June ${period.firstYear}` }, no_adjustment_reason: why, application_basis: basis };
}

// Division 131: annual apportionment.
const AA_REQUIRED = ['small_business_entity', 'carries_on_business', 'instalment_election', 'annual_tax_period_election', 'election_made',
  'gst_on_acquisition', 'creditable_purpose', 'car', 'reduced_credit_acquisition', 'year', 'scope_confirmed'];

/** GST Act Division 131: eligibility, and the credit and adjustment for one partly creditable acquisition.
 * @param {Record<string, unknown>} x */
export function gstAnnualApportionment(x) {
  const { year, dec } = checked(x, 'gst-annual-apportionment', AA_REQUIRED, ['gst_on_acquisition', 'creditable_purpose', 'gst_turnover',
    'non_input_taxed_extent', 'consideration_extent'], ['gst_turnover', 'non_input_taxed_extent', 'consideration_extent']);
  if (flag(x.car, 'car')) {
    refuse('gst_annual_apportionment.car', 'An acquisition of a car: section 131-50 limits the credit to the section 69-10 car limit amount, '
      + 'which this calculator does not work.');
  }
  if (flag(x.reduced_credit_acquisition, 'reduced_credit_acquisition')) {
    refuse('gst_annual_apportionment.reduced_credit_acquisition', 'An acquisition that is to any extent a reduced credit acquisition: '
      + 'section 131-40(5) excludes it from annual apportionment.');
  }
  const small = flag(x.small_business_entity, 'small_business_entity');
  const business = flag(x.carries_on_business, 'carries_on_business');
  if (small && !business) refuse('gst_annual_apportionment.fact_conflict', 'A small business entity carries on a business (ITAA 1997 s 328-110(1)).');
  const needed = !small && !business;
  if (needed && !('gst_turnover' in x)) refuse('input.missing_field', 'Enter the GST turnover for an entity that does not carry on a business.');
  if (!needed && 'gst_turnover' in x) refuse('input.field_unknown', 'The GST turnover is an input only for an entity that does not carry on a business.');
  const entity = needed ? cmp(money(dec.gst_turnover, 'the GST turnover'), d(AA_TURNOVER_THRESHOLD)) <= 0 : small;
  const rows = [condition('entity_eligible', AA_ENTITY, entity),
    condition('no_instalment_election', AA_NO_INSTALMENTS, !flag(x.instalment_election, 'instalment_election')),
    condition('no_annual_tax_period_election', AA_NO_ANNUAL_PERIOD, !flag(x.annual_tax_period_election, 'annual_tax_period_election'))];
  const elected = flag(x.election_made, 'election_made');
  const gst = money(dec.gst_on_acquisition, 'the GST on the acquisition');
  const purpose = fraction(dec.creditable_purpose, 'creditable_purpose');
  const nit = 'non_input_taxed_extent' in x ? fraction(dec.non_input_taxed_extent, 'non_input_taxed_extent') : undefined;
  const consideration = 'consideration_extent' in x ? fraction(dec.consideration_extent, 'consideration_extent') : undefined;
  if (cmp(purpose, nit ?? ONE) > 0) {
    refuse('gst_annual_apportionment.fact_conflict', 'The creditable purpose cannot exceed the non-input-taxed extent: an acquisition is not '
      + 'for a creditable purpose to the extent it relates to making input taxed supplies (s 11-15(2)(a)).');
  }
  const whole = cmp(purpose, ONE) === 0 && cmp(consideration ?? ONE, ONE) === 0;
  if (cmp(purpose, ZERO) === 0 || cmp(consideration ?? ONE, ZERO) === 0 || whole) {
    refuse('gst_annual_apportionment.not_partly_creditable', 'Division 131 is for partly creditable acquisitions (s 11-30(1)): some, but '
      + 'not all, for a creditable purpose, or only part of the consideration provided.');
  }
  const failed = failing(rows);
  const eligible = failed.length === 0;
  if (elected && !rows[0].met) {
    refuse('gst_annual_apportionment.election_status_unsettled', 'An election is made but the entity test of section 131-5(1)(a) fails: '
      + 'whether the election ceased turns on section 131-20(1)(c) or (d) and the income year or 31 July test, which this calculator does not take.');
  }
  const without = product(gst, [purpose, consideration]);
  const fullCredit = cmp(nit ?? ONE, ONE) === 0 && cmp(consideration ?? ONE, ONE) === 0;
  const withIt = !elected ? without : fullCredit ? gst : product(gst, [nit, consideration]);
  const consequences = elected ? [AA_ATTRIBUTION, AA_CEASES] : eligible ? [AA_NO_ELECTION] : [AA_NOT_ELIGIBLE, AA_CEASES];
  return { period: year, amounts: amountsOf([['credit_without_annual_apportionment', without], ['annual_apportionment_credit', withIt],
    ['increasing_adjustment', sub(withIt, without)]]), rates: { turnover_threshold: AA_TURNOVER_THRESHOLD }, eligible, applies: elected,
  failing_conditions: failed, conditions: rows, consequences };
}

// Division 189: the financial acquisitions threshold.
/** GST Act Division 189: the current and the future acquisitions tests. @param {Record<string, unknown>} x */
export function gstFinancialAcquisitionsThreshold(x) {
  const amounts = ['current_financial_credits', 'current_total_credits', 'future_financial_credits', 'future_total_credits'];
  const { year, dec } = checked(x, 'gst-financial-acquisitions-threshold', [...amounts, 'gst_group', 'year', 'scope_confirmed'], amounts, []);
  const group = flag(x.gst_group, 'gst_group');
  /** @type {Condition[]} */
  const rows = [];
  /** @type {[string, Dec][]} */
  const steps = [];
  for (const name of ['current', 'future']) {
    const financial = money(dec[`${name}_financial_credits`], `the ${name} financial acquisitions’ credits`);
    const total = money(dec[`${name}_total_credits`], `the ${name} total credits`);
    if (cmp(financial, total) > 0) {
      refuse('gst_financial_acquisitions_threshold.fact_conflict', `The ${name} financial acquisitions’ credits cannot exceed the ${name} total credits, which include them.`);
    }
    const [amountRule, shareRule] = FAT_PROVISIONS[/** @type {keyof typeof FAT_PROVISIONS} */ (`${name}${group ? 'Group' : ''}`)];
    const tenth = mul(total, d('0.10'));
    rows.push(condition(`${name}_within_amount`, amountRule, cmp(financial, d(FAT_AMOUNT_LIMIT)) <= 0),
      condition(`${name}_within_ten_percent`, shareRule, cmp(financial, tenth) <= 0));
    steps.push([`${name}_ten_percent`, tenth]);
  }
  const failed = failing(rows);
  const exceeds = failed.length > 0;
  return { period: year, amounts: amountsOf(steps), rates: { amount_limit: FAT_AMOUNT_LIMIT, proportion_limit: '0.10' }, exceeds_threshold: exceeds,
    failing_conditions: failed, conditions: rows, consequences: [exceeds ? FAT_EXCEEDS : FAT_WITHIN] };
}

// Section 38-325: the supply of a going concern.
const GC_REQUIRED = ['for_consideration', 'recipient_registration', 'written_agreement', 'all_things_necessary', 'carried_on_until_supply',
  'farm_land', 'part_outside_arrangement', 'year', 'scope_confirmed'];

/** One of `allowed`, or a refusal naming them. @param {unknown} value @param {string} key @param {string[]} allowed @param {string} code */
function choice(value, key, allowed, code) {
  if (typeof value !== 'string' || !allowed.includes(value)) refuse(code, `${key} must be one of ${allowed.join(', ')}.`);
  return value;
}

/** GST Act s 38-325: the conditions and whether the supply is GST-free. @param {Record<string, unknown>} x */
export function gstGoingConcern(x) {
  const { year } = checked(x, 'gst-going-concern', GC_REQUIRED, [], []);
  if (flag(x.farm_land, 'farm_land')) {
    refuse('gst_going_concern.farm_land', 'A supply of farm land for farming: Subdivision 38-O has its own conditions, which this calculator does not test.');
  }
  if (flag(x.part_outside_arrangement, 'part_outside_arrangement')) {
    refuse('gst_going_concern.part_outside_arrangement', 'Part of the supply is not under the arrangement: that part is not GST-free under '
      + 'section 38-325, and section 9-80 apportions the supply (GSTR 2002/5 paras 168 and 169), which this calculator does not work.');
  }
  const registration = choice(x.recipient_registration, 'recipient_registration', ['registered', 'required_to_be_registered', 'neither'], 'gst_going_concern.fact_invalid');
  const agreement = choice(x.written_agreement, 'written_agreement', ['on_or_before_supply_day', 'after_supply_day', 'none'], 'gst_going_concern.fact_invalid');
  const rows = [condition('for_consideration', GC_CONSIDERATION, flag(x.for_consideration, 'for_consideration')),
    condition('recipient_registered', GC_REGISTERED, registration !== 'neither'),
    condition('agreed_in_writing', GC_AGREED, agreement === 'on_or_before_supply_day'),
    condition('all_things_necessary', GC_ALL_THINGS, flag(x.all_things_necessary, 'all_things_necessary')),
    condition('carried_on_until_supply', GC_CARRIED_ON, flag(x.carried_on_until_supply, 'carried_on_until_supply'))];
  const failed = failing(rows);
  return { period: year, amounts: {}, rates: { gst_rate: '0.10' }, gst_free: failed.length === 0, failing_conditions: failed, conditions: rows,
    consequences: failed.length === 0 ? GC_GST_FREE : [GC_NOT_GST_FREE] };
}

// Subdivision 66-A: second-hand goods.
const SHG_REQUIRED = ['consideration', 'acquired_for_sale_or_exchange', 'animals_or_plants', 'supply_to_you', 'imported', 'by_way_of_hire',
  'resupply_taxable', 'divided_for_resupply', 'valuable_metal', 'leased_before_sale', 'year', 'scope_confirmed'];

/** GST Act Subdivision 66-A: the conditions and the notional credit. @param {Record<string, unknown>} x */
export function gstSecondHandGoods(x) {
  const { year, dec } = checked(x, 'gst-second-hand-goods', SHG_REQUIRED, ['consideration', 'resupply_gst'], ['resupply_gst']);
  if (flag(x.divided_for_resupply, 'divided_for_resupply')) {
    refuse('gst_second_hand_goods.divided_for_resupply', 'Goods it is reasonable to expect you to divide before supplying them in 2 or more '
      + 'supplies: Subdivision 66-B may apply (s 66-40), and section 66-5(2)(d) then excludes Subdivision 66-A. This calculator does not work Subdivision 66-B.');
  }
  if (flag(x.valuable_metal, 'valuable_metal')) {
    refuse('gst_second_hand_goods.valuable_metal', 'Goods consisting partly or wholly of gold, silver or platinum: section 195-1 excludes them '
      + 'from second-hand goods to the extent of the valuable metal, unless they are incidental valuable metal goods, which this calculator does not decide.');
  }
  if (flag(x.leased_before_sale, 'leased_before_sale')) {
    refuse('gst_second_hand_goods.leased_before_sale', 'Goods leased before they are sold: GSTD 2012/6 counts both taxable supplies and '
      + 'attributes the credit to each in part, which this calculator does not work.');
  }
  const consideration = money(dec.consideration, 'the consideration');
  const supply = choice(x.supply_to_you, 'supply_to_you', ['neither', 'taxable', 'gst_free'], 'gst_second_hand_goods.fact_invalid');
  const rows = [condition('acquired_for_sale_or_exchange', SHG_FOR_SALE, flag(x.acquired_for_sale_or_exchange, 'acquired_for_sale_or_exchange')),
    condition('second_hand_goods', SHG_GOODS, !flag(x.animals_or_plants, 'animals_or_plants')),
    condition('supply_to_you_not_taxable', SHG_SUPPLY_TO_YOU, supply === 'neither'),
    condition('not_imported', SHG_IMPORTED, !flag(x.imported, 'imported')),
    condition('not_by_way_of_hire', SHG_HIRE, !flag(x.by_way_of_hire, 'by_way_of_hire')),
    condition('resupply_taxable', SHG_RESUPPLY, flag(x.resupply_taxable, 'resupply_taxable'))];
  const failed = failing(rows);
  const applies = failed.length === 0;
  /** @type {[string, Dec][]} */
  let steps = [];
  if (applies) {
    const eleventh = div(consideration, d('11'));
    const above = cmp(consideration, d(SHG_LIMIT)) > 0;
    const given = 'resupply_gst' in x;
    if (!above && given) refuse('input.field_unknown', 'The GST on your resupply is an input only when the consideration is more than $300.');
    if (above && !given) refuse('input.missing_field', 'Enter the GST on your taxable supply of the goods: the consideration is more than $300 (s 66-10(1)(b)).');
    if (!above) steps = [['input_tax_credit', eleventh]];
    else {
      const gst = money(dec.resupply_gst, 'the GST on your resupply');
      steps = [['one_eleventh_of_consideration', eleventh], ['input_tax_credit', cmp(gst, eleventh) < 0 ? gst : eleventh]];
    }
  }
  return { period: year, amounts: amountsOf(steps), rates: { consideration_limit: SHG_LIMIT }, applies, failing_conditions: failed,
    conditions: rows, consequences: applies ? SHG_APPLIES : [SHG_NOT_APPLIES] };
}

// Division 21 with Subdivision 136-A: bad debts.
const BD_REQUIRED = ['party', 'event', 'amount', 'taxable_or_creditable', 'cash_basis', 'special_rule', 'year', 'scope_confirmed'];
const BD_OPTIONAL = ['attributed', 'overdue_from', 'as_at', 'prior_adjustment', 'taxable_proportion', 'creditable_purpose', 'consideration_extent',
  'reduced_credit_acquisition', 'annual_apportionment'];
const BD_SPECIAL = /** @type {Record<string, string>} */ ({ none: '',
  taxable_at_less_than_one_eleventh: 'The supply or acquisition was taxable or creditable at less than 1/11 of the price, such as under the margin scheme: Subdivision 136-B works the adjustment (ss 136-30 to 136-45).',
  gambling_supply: 'A bad debt from a gambling supply: Division 126 deals with it, not Division 21 (GSTR 2000/2 para 7).',
  debt_assigned: 'The debt was assigned: Division 21 cannot operate, and an assignee has no adjustment (GSTR 2000/2 para 47).',
  transition_act_s15g: 'A decreasing adjustment under s 15G of the GST Transition Act, which displaces s 21-5 (GSTR 2000/2 para 8A).',
  incapacitated_entity_representative: 'A representative of an incapacitated entity: Division 58 has special rules for bad debt adjustments (s 21-99).' });
/** An optional input: refused when given but not used, or missing when needed.
 * @param {Record<string, unknown>} x @param {string} name @param {boolean} used @param {boolean} needed */
function field(x, name, used, needed) {
  if (name in x && !used) refuse('input.field_unknown', `${name} is not an input for this party and event.`);
  if (!(name in x) && needed) refuse('input.missing_field', `${name} is required for this party and event.`);
  return name in x;
}

/** GST Act Division 21 with Subdivision 136-A: one bad debt adjustment. @param {Record<string, unknown>} x */
export function gstBadDebt(x) {
  const { year, dec } = checked(x, 'gst-bad-debt', BD_REQUIRED, ['amount', 'taxable_proportion', 'creditable_purpose', 'consideration_extent'], BD_OPTIONAL);
  const supplier = choice(x.party, 'party', ['supplier', 'recipient'], 'gst_bad_debt.fact_invalid') === 'supplier';
  const event = choice(x.event, 'event', ['written_off', 'overdue_12_months', 'recovered'], 'gst_bad_debt.fact_invalid');
  const recovered = event === 'recovered';
  const rule = typeof x.special_rule === 'string' && Object.hasOwn(BD_SPECIAL, x.special_rule) ? x.special_rule : null;
  if (rule === null) refuse('gst_bad_debt.fact_invalid', `special_rule must be one of ${Object.keys(BD_SPECIAL).join(', ')}.`);
  if (rule !== 'none') refuse('gst_bad_debt.special_rule', BD_SPECIAL[rule]); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  if (recovered && flag(x.cash_basis, 'cash_basis')) {
    refuse('gst_bad_debt.accounting_basis_changed', 'A recovery or payment on a cash basis: the earlier adjustment needed a non-cash basis '
      + '(ss 21-5(2) and 21-15(2)), so the basis has changed, which Division 159 governs.');
  }
  for (const [name, code, why] of [['reduced_credit_acquisition', 'gst_bad_debt.reduced_credit_acquisition', 'A reduced credit acquisition: '
    + 'section 136-10(2) reduces the adjustment by the percentage credit reduction of Division 70, which this calculator does not work.'],
  ['annual_apportionment', 'gst_bad_debt.annual_apportionment', 'The credit was worked out under Division 131: section 136-10(3) turns on '
    + 'whether the adjustment is attributable to a tax period no later than the section 131-55 adjustment’s, which this calculator does not work.']]) {
    if (field(x, name, !supplier, !supplier) && flag(x[name], name)) refuse(code, why); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  }
  const amount = money(dec.amount, 'the amount');
  /** @param {string} name @param {boolean} used @returns {Dec | undefined} */
  const reduction = (name, used) => {
    if (!field(x, name, used, false)) return undefined;
    const v = fraction(dec[name], name); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
    if (cmp(v, ZERO) === 0) {
      refuse('gst_bad_debt.fact_conflict', `${name} of nil contradicts taxable_or_creditable: omit it for a wholly taxable supply or creditable acquisition.`);
    }
    return v;
  };
  const proportion = reduction('taxable_proportion', supplier);
  const purpose = reduction('creditable_purpose', !supplier);
  const extent = reduction('consideration_extent', !supplier);
  const prior = field(x, 'prior_adjustment', recovered, recovered);
  const rows = [condition('taxable_or_creditable', supplier ? BD_QUALIFIES_SUPPLIER : BD_QUALIFIES_RECIPIENT,
    flag(x.taxable_or_creditable, 'taxable_or_creditable'))];
  if (prior) rows.push(condition('prior_adjustment', BD_PRIOR, flag(x.prior_adjustment, 'prior_adjustment')));
  if (field(x, 'attributed', !recovered, !recovered)) {
    const attributed = flag(x.attributed, 'attributed');
    const overdue = event === 'overdue_12_months';
    const from = field(x, 'overdue_from', overdue, overdue);
    const asAt = field(x, 'as_at', overdue, overdue);
    let due = true;
    if (from && asAt) {
      const [start, tested] = [dateArg(x.overdue_from, 'overdue_from'), dateArg(x.as_at, 'as_at')];
      if (tested < start) refuse('gst_bad_debt.dates_invalid', 'The test date cannot be before the first day overdue.');
      due = tested >= addMonths(start, 12);
    }
    rows.push(condition('attributed', supplier ? BD_ATTRIBUTED_SUPPLIER : BD_ATTRIBUTED_RECIPIENT, attributed),
      condition('written_off_or_overdue_12_months', BD_WRITTEN_OFF, due),
      condition('not_cash_basis', BD_NOT_CASH, !flag(x.cash_basis, 'cash_basis')));
  }
  const failed = failing(rows);
  const applies = failed.length === 0;
  const increasing = supplier === recovered;
  const id = increasing ? 'increasing_adjustment' : 'decreasing_adjustment';
  /** @type {[string, Dec][]} */
  let steps = [];
  if (applies) {
    const full = div(amount, d('11'));
    steps = proportion || purpose || extent
      ? [['full_adjustment', full], [id, supplier ? product(full, [proportion]) : product(full, [purpose, extent])]] : [[id, full]];
  }
  return { period: year, amounts: amountsOf(steps), rates: {}, applies, direction: increasing ? 'increasing' : 'decreasing',
    failing_conditions: failed, conditions: rows, consequences: [applies ? BD_APPLIES : BD_NOT_APPLIES] };
}
