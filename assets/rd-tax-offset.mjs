// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// One R&D entity's tax offset for an income year from 2021-22 to 2026-27, and the amount included in
// assessable income for a clawback amount attributable to it: the `rd-tax-offset` command of
// ryanduguid/australian-accounting (PR 795, merged in #813) ported line for line, with its inputs, steps,
// rounding and refusal codes in the order the command checks them. Read 22 November 2026:
// - ITAA 1997 ss 355-100 (the offset, the $20,000 threshold and the $150 million cap), 355-115 (total
//   expenses), 355-440 and 355-445 (recoupment and feedstock), 355-450 (the clawback), 67-30 and
//   63-10(1) item 35 (refundable or not), and Income Tax Rates Act 1986 s 23(2) (25% or 30%), at the
//   ATO's legal database; Act No. 92 of 2020 Sch 4 item 14 and Sch 5 item 56(3) (from 1 July 2021).
// - The ATO's 'Rates of R&D tax incentive offset', 'Calculate the clawback adjustment' and 'Clawback of
//   feedstock adjustments' (each last updated 13 May 2026), and the R&D tax incentive schedule 2022
//   instructions, Part E.
// Rates are held in thousandths, so every product is exact; each amount is rounded half up to the cent once.

import { ratioCents } from './money.mjs';

export const RD_YEARS = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
const EARLIER_YEARS = ['2011-12', '2012-13', '2013-14', '2014-15', '2015-16', '2016-17', '2017-18', '2018-19', '2019-20', '2020-21'];
const EARLIER_RATES = 'Income years starting before 1 July 2021 used the earlier R&D offset rates, cap and clawback rules, replaced by '
  + 'Act No. 92 of 2020 (Sch 4 item 14, Sch 5 item 56(3)); this calculator does not hold them.';

/** The command's inputs, in the order it reads them. */
const FIELDS = ['notional_deductions', 'rsp_crc_expenditure', 'aggregated_turnover', 'exempt_entity_controlled', 'base_rate_entity',
  'total_expenses', 'recoupment_clawback', 'feedstock_revenue', 'feedstock_expenditure', 'present_year_base_rate_entity', 'year',
  'scope_confirmed'];
const DECIMALS = new Set(['notional_deductions', 'rsp_crc_expenditure', 'aggregated_turnover', 'total_expenses', 'recoupment_clawback',
  'feedstock_revenue', 'feedstock_expenditure']);
const WORDS = /** @type {Record<string, string>} */ ({ notional_deductions: 'the notional deductions',
  rsp_crc_expenditure: 'the research service provider and CRC expenditure', aggregated_turnover: 'the aggregated turnover',
  exempt_entity_controlled: 'whether exempt entities control the company', base_rate_entity: 'whether the company is a base rate entity',
  total_expenses: 'the total expenses', recoupment_clawback: 'the recoupment clawback amount', feedstock_revenue: 'the feedstock revenue',
  feedstock_expenditure: 'the feedstock expenditure', present_year_base_rate_entity: 'whether the company is a base rate entity in the present year' });
const MAX = 10n ** 14n;
const THRESHOLD = 2000000n;
const CAP = 15000000000n;

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** Python's whitespace, which the command strips from a decimal before reading it. */
const SPACE = /[\t\n\v\f\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/; // eslint-disable-line no-control-regex -- Python's whitespace includes U+001C to U+001F
/** `text` without Python's whitespace at either end. @param {string} text */
const stripSpace = (text) => {
  let start = 0;
  let end = text.length;
  while (start < end && SPACE.test(text.charAt(start))) start += 1;
  while (end > start && SPACE.test(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
};

/** A decimal input as the command reads it: cents, or null when readable but not an amount it takes
 * (not a string, not finite, below nil, above $1,000,000,000,000 or with more than 2 places).
 * @param {string} key @param {unknown} value @returns {bigint | null} */
function decimal(key, value) {
  if (typeof value !== 'string') return null;
  if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', `Enter ${WORDS[key]} with fewer digits.`); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  const text = stripSpace(value);
  if (/^[+-]?(inf|infinity|s?nan\d*)$/i.test(text)) return null;
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text); // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
  if (!parts) refuse('input.decimal_unreadable', `Enter ${WORDS[key]} as an amount in digits, such as 1250.50.`); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  if ((parts[3] ?? '').length > 2) return null;
  const cents = BigInt(parts[2] + (parts[3] ?? '').padEnd(2, '0'));
  return (parts[1] && cents > 0n) || cents > MAX ? null : cents;
}

/** @param {string} key @param {bigint | null} cents @returns {bigint} */
function money(key, cents) {
  if (cents === null) refuse('input.amount_invalid', `Enter ${WORDS[key]} as an amount of 0 or more with no more than 2 decimal places.`); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  return cents;
}

/** @param {string} key @param {unknown} value @returns {boolean} */
function flag(key, value) {
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `Answer ${WORDS[key]} yes or no.`); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  return value;
}

/** The corporate tax rate in thousandths: 25% for a base rate entity, else 30%. @param {boolean} bre */
const corporateRate = (bre) => (bre ? 250n : 300n);
/** @param {bigint} a @param {bigint} b */
const min = (a, b) => (a < b ? a : b);
/** @param {bigint} a @param {bigint} b */
const max = (a, b) => (a > b ? a : b);
/** Millionths of a cent as cents text, half away from zero. @param {bigint} n */
const shown = (n) => {
  const c = n < 0n ? -ratioCents(-n, 1000000n) : ratioCents(n, 1000000n);
  const abs = c < 0n ? -c : c;
  return `${c < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};

/**
 * @typedef {{notional: bigint, rspCrc: bigint, totalExpenses: bigint, refundable: boolean, rate: bigint}} Entity
 */

/** s 355-100 on `total` cents, as the 7 steps' values in millionths of a cent: the base and capped base, the
 * base offset, the 2 premium tiers, the excess over the cap and the offset. @param {bigint} total @param {Entity} e */
function offsetValues(total, e) {
  const base = total < THRESHOLD ? e.rspCrc : total;
  const capped = min(base, CAP);
  const twoPercent = e.totalExpenses * 20n;
  const [baseOffset, tier1, tier2] = e.refundable ? [capped * (e.rate + 185n) * 1000n, 0n, 0n]
    : [capped * e.rate * 1000n, min(capped * 1000n, twoPercent) * 85n, max(capped * 1000n - twoPercent, 0n) * 165n];
  const excess = max(base - CAP, 0n) * e.rate * 1000n;
  return [base * 1000000n, capped * 1000000n, baseOffset, tier1, tier2, excess, baseOffset + tier1 + tier2 + excess];
}

const STARTING = ['offset_base', 'capped_base', 'base_offset', 'premium_tier_1', 'premium_tier_2', 'excess_offset', 'tax_offset'];
const ADJUSTED = ['adjusted_offset_base', 'adjusted_capped_base', 'adjusted_base_offset', 'adjusted_premium_tier_1',
  'adjusted_premium_tier_2', 'adjusted_excess_offset', 'adjusted_offset'];

/** The checks before the worksheet: unknown, then missing and unreadable inputs, then scope and year, then each
 * amount and answer in turn. @param {Record<string, unknown>} input */
function read(input) {
  const extra = Object.keys(input).find((key) => !FIELDS.includes(key));
  if (extra !== undefined) refuse('input.field_unknown', `${extra} is not an input of rd-tax-offset.`);
  /** @type {Record<string, bigint | null>} */
  const cents = {};
  for (const key of FIELDS) {
    if (!(key in input)) refuse('input.missing_field', `${key} is required.`);
    if (DECIMALS.has(key)) cents[key] = decimal(key, input[key]); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  }
  if (input.scope_confirmed !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = input.year;
  if (typeof year !== 'string' || !RD_YEARS.includes(year)) {
    const earlier = typeof year === 'string' && EARLIER_YEARS.includes(year) ? ` ${EARLIER_RATES}` : '';
    refuse('period.unsupported', `Choose an income year from ${RD_YEARS[0]} to ${RD_YEARS.at(-1)}.${earlier}`);
  }
  const amount = (/** @type {string} */ key) => money(key, cents[key]); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  const notional = amount('notional_deductions');
  const rspCrc = amount('rsp_crc_expenditure');
  const turnover = amount('aggregated_turnover');
  const exempt = flag('exempt_entity_controlled', input.exempt_entity_controlled);
  const bre = flag('base_rate_entity', input.base_rate_entity);
  const e = { notional, rspCrc, totalExpenses: amount('total_expenses'), refundable: turnover < 2000000000n && !exempt, rate: corporateRate(bre) };
  const recoupment = amount('recoupment_clawback');
  const revenue = amount('feedstock_revenue');
  const expenditure = amount('feedstock_expenditure');
  const presentRate = corporateRate(flag('present_year_base_rate_entity', input.present_year_base_rate_entity));
  return { year, e, recoupment, revenue, expenditure, presentRate };
}

/** The bounds the law sets between the amounts. @param {Entity} e @param {bigint} expenditure @param {bigint} clawback */
function check(e, expenditure, clawback) {
  if (e.rspCrc > e.notional) {
    refuse('rd_tax_offset.threshold_expenditure_above_total', 'The research service provider and CRC expenditure is part of the notional '
      + 'deductions and cannot exceed them (ITAA 1997 s 355-100(2)).');
  }
  if (expenditure > e.notional) {
    refuse('rd_tax_offset.feedstock_expenditure_above_total', 'The feedstock expenditure is deductions for this offset year and cannot '
      + 'exceed the notional deductions (ITAA 1997 s 355-445(1)(b) and (2)(b)).');
  }
  if (clawback > e.notional) {
    refuse('rd_tax_offset.clawback_above_total', 'The clawback amount exceeds the notional deductions, the total the adjusted offset '
      + 'reduces (ITAA 1997 s 355-450(1)).');
  }
  if (clawback !== 0n && e.notional - clawback < THRESHOLD) {
    refuse('rd_tax_offset.clawback_below_threshold', 'With a clawback amount, the notional deductions or the adjusted total is under '
      + '$20,000: section 355-100(2) then limits the adjusted offset to research service provider and CRC expenditure, but neither '
      + 'section 355-450 nor the ATO says how the clawback reduces that expenditure, and the ATO’s feedstock example applies the full '
      + 'rate below $20,000; this calculator does not choose between them.');
  }
}

/**
 * @typedef {{year: string, refundable: boolean, rate: number, presentRate: number, amounts: Record<string, string>,
 *   rates: Record<string, string>, taxOffset: number, refundableOffset: number, nonRefundableOffset: number,
 *   clawbackAmount: number, adjustedOffset: number, deductionAmount: number, clawbackIncome: number}} RdTaxOffsetResult
 */

/**
 * @typedef {{notional_deductions: string, rsp_crc_expenditure: string, aggregated_turnover: string, exempt_entity_controlled: boolean,
 *   base_rate_entity: boolean, total_expenses: string, recoupment_clawback: string, feedstock_revenue: string,
 *   feedstock_expenditure: string, present_year_base_rate_entity: boolean, year: string, scope_confirmed: boolean}} RdTaxOffsetInput
 */

/** ITAA 1997 s 355-100: the offset for one income year, its refundable or non-refundable part (s 67-30), and
 * s 355-450's amount for a clawback amount attributable to the year. @param {RdTaxOffsetInput} given @returns {RdTaxOffsetResult} */
export function rdTaxOffset(given) {
  const { year, e, recoupment, revenue, expenditure, presentRate } = read(/** @type {Record<string, unknown>} */ (given));
  const clawback = recoupment + min(revenue, expenditure);
  check(e, expenditure, clawback);
  const starting = offsetValues(e.notional, e);
  const offset = starting[6];
  const adjusted = offsetValues(e.notional - clawback, e);
  const deduction = clawback * e.rate * 1000n;
  // (offset - adjusted - deduction) / rate: millionths of a cent over thousandths is the same unit times 1000 / rate.
  const income = offset - adjusted[6] - deduction;
  const incomeCents = (income < 0n ? -1n : 1n) * ratioCents((income < 0n ? -income : income), presentRate * 1000n);
  /** @type {Record<string, string>} */
  const amounts = {};
  STARTING.forEach((id, k) => { amounts[id] = shown(starting[k]); }); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  amounts.refundable_offset = shown(e.refundable ? offset : 0n);
  amounts.non_refundable_offset = shown(e.refundable ? 0n : offset);
  amounts.clawback_amount = shown(clawback * 1000000n);
  ADJUSTED.forEach((id, k) => { amounts[id] = shown(adjusted[k]); }); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  amounts.deduction_amount = shown(deduction);
  amounts.clawback_income = shown(incomeCents * 1000000n);
  const ratio = (/** @type {bigint} */ r) => (r === 250n ? '0.25' : '0.30');
  const dollars = (/** @type {string} */ id) => Number(amounts[id]); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  return { year, refundable: e.refundable, rate: Number(e.rate) / 10, presentRate: Number(presentRate) / 10, amounts,
    rates: { corporate_tax_rate: ratio(e.rate), present_year_corporate_tax_rate: ratio(presentRate) },
    taxOffset: dollars('tax_offset'), refundableOffset: dollars('refundable_offset'), nonRefundableOffset: dollars('non_refundable_offset'),
    clawbackAmount: dollars('clawback_amount'), adjustedOffset: dollars('adjusted_offset'), deductionAmount: dollars('deduction_amount'),
    clawbackIncome: dollars('clawback_income') };
}

/** The form's input as the command's call: each amount as typed, each answer from its yes or no.
 * @param {(name: string) => string} value @returns {RdTaxOffsetInput} */
export function rdFormInput(value) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  return { notional_deductions: value('notional'), rsp_crc_expenditure: value('rsp-crc'), aggregated_turnover: value('turnover'),
    exempt_entity_controlled: yes('exempt'), base_rate_entity: yes('bre'), total_expenses: value('expenses'),
    recoupment_clawback: value('recoupment'), feedstock_revenue: value('feedstock-revenue'), feedstock_expenditure: value('feedstock-expenditure'),
    present_year_base_rate_entity: yes('present-bre'), year: value('year'), scope_confirmed: true };
}

/** How the page writes the command's input. @param {RdTaxOffsetInput} x @param {(value: number) => string} aud */
export function rdInputsText(x, aud) {
  const money = (/** @type {unknown} */ text) => aud(Number(text));
  const clawback = [Number(x.recoupment_clawback) && `recoupment clawback ${money(x.recoupment_clawback)}`,
    (Number(x.feedstock_revenue) || Number(x.feedstock_expenditure))
      && `feedstock revenue ${money(x.feedstock_revenue)} and expenditure ${money(x.feedstock_expenditure)}`].filter(Boolean);
  return `${x.year}; notional deductions ${money(x.notional_deductions)}`
    + `${Number(x.rsp_crc_expenditure) ? `, research service provider and CRC expenditure ${money(x.rsp_crc_expenditure)}` : ''}`
    + `, aggregated turnover ${money(x.aggregated_turnover)}${x.exempt_entity_controlled ? ', controlled by exempt entities' : ''}, `
    + `${x.base_rate_entity ? 'a base rate entity' : 'not a base rate entity'}, total expenses ${money(x.total_expenses)}`
    + `${clawback.length ? `; ${clawback.join(', ')}, ${x.present_year_base_rate_entity ? 'a base rate entity' : 'not a base rate entity'} in the present year` : ''}`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function rdTaxOffsetResult(value, aud) {
  const input = rdFormInput(value);
  const r = rdTaxOffset(input);
  const a = (/** @type {string} */ id) => aud(Number(r.amounts[id])); // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  const pct = (/** @type {number} */ n) => `${n.toLocaleString('en-AU', { maximumFractionDigits: 1 })}%`;
  const below = Number(input.notional_deductions) < 20000;
  const rows = [[below ? 'Offset base: research service provider and CRC expenditure, the total being under $20,000' : 'Offset base: the notional deductions', a('offset_base')]];
  if (r.refundable) rows.push([`At ${pct(r.rate + 18.5)}, the corporate tax rate plus 18.5 points, up to $150 million`, a('base_offset')]);
  else {
    rows.push([`At ${pct(r.rate)}, the corporate tax rate, up to $150 million`, a('base_offset')],
      ['Premium of 8.5% on the part up to 2% of total expenses', a('premium_tier_1')], ['Premium of 16.5% on the part above 2% of total expenses', a('premium_tier_2')]);
  }
  if (Number(r.amounts.excess_offset)) rows.push([`Above $150 million, at ${pct(r.rate)}`, a('excess_offset')]);
  const principal = rows.push([r.refundable ? 'Tax offset, refundable' : 'Tax offset, non-refundable', a('tax_offset')]) - 1;
  if (r.clawbackAmount) {
    rows.push(['Clawback amount', a('clawback_amount')], ['Adjusted offset, on the notional deductions less the clawback amount', a('adjusted_offset')],
      [`Deduction amount, the clawback amount at ${pct(r.rate)}`, a('deduction_amount')],
      [`Included in assessable income in the present year, over ${pct(r.presentRate)}`, a('clawback_income')]);
  }
  const note = r.refundable ? 'Aggregated turnover under $20 million and no exempt entity control: item 1, a refundable offset (section 67-30)'
    : 'Turnover of $20 million or more, or exempt entity control: a non-refundable offset, which may be carried forward (Division 65)';
  return { inputs: rdInputsText(input, aud), rows, principal, note };
}
