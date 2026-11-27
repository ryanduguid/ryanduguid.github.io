// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// When one prepaid amount is deductible under ITAA 1936 Subdivision H (ss 82KZL to 82KZMF), for expenditure
// incurred in 2020-21 to 2026-27: the `prepayments` command of ryanduguid/australian-accounting (main at e1f5bee)
// ported line for line, with its inputs, rounding and refusal codes in the order the command checks
// them. The command read ITAA 1936 compilation 193 (1 October 2026) on 22 November 2026; compilation 175
// (4 April 2021) reads the same, and the $50 million entity of ss 82KZM(1A) and 82KZMA(2A) applies to
// expenditure incurred on or after 1 July 2020 (Act No. 92 of 2020 Sch 3 item 40(5)). Months are read under
// Acts Interpretation Act 1901 s 2G(2). Apportioned amounts are worked on the running total of days and
// rounded half up to the cent there, so the years add up to the expenditure.

import { dateArg, field, flag, formatDay, money, monthsEnd, parseDate, readFields, refuse, scope, shownCents, yearStart }
  from './aa-command.mjs';

export const PREPAYMENT_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
const PARAMS = /** @type {const} */ ([['taxpayer', 'raw'], ['individual', 'raw'], ['business_expenditure', 'raw'], ['chose_82kzmd', 'raw'],
  ['expenditure', 'dec'], ['incurred', 'raw'], ['service_start', 'raw'], ['service_end', 'raw'], ['agreement_date', 'raw'], ['exclusion', 'raw'],
  ['tax_shelter', 'raw'], ['year', 'raw'], ['scope_confirmed', 'raw']]);
/** Section 82KZL(1) 'excluded expenditure' (a), in cents. */
const EXCLUDED_BELOW = 100000n;
/** Section 82KZL(1) 'eligible service period' (d): 10 years. */
const MAX_MONTHS = 120;
/** 11 November 1999 (ss 82KZME(2)(a) and (8)): the last agreement day the calculator refuses. */
const CUTOFF = /** @type {number} */ (parseDate('1999-11-11'));

export const PREPAYMENT_AUTHORITIES = new Map([
  ['excluded_expenditure', 'ITAA 1936 s 82KZL(1) ‘excluded expenditure’: less than $1,000, required by a law or court order, or under a contract '
    + 'of service; Subdivision H does not apply and ITAA 1997 s 8-1 allows the deduction when incurred'],
  ['not_prepaid', 'ITAA 1936 s 82KZL(1) ‘eligible service period’: the thing was to be done no later than the day the expenditure was incurred, '
    + 'so no period remains; s 8-1 allows the deduction when incurred'],
  ['done_in_year', 'ITAA 1936 ss 82KZMA(3)(c) and 82KZME(2)(b): the thing is wholly done within the expenditure year, and s 82KZM(1)(ba) is not met; '
    + 's 8-1 allows the deduction when incurred'],
  ['twelve_month_rule', 'ITAA 1936 s 82KZM(1)(aa) and (ba): a small business entity or an entity covered by s 82KZM(1A) that has not chosen '
    + 's 82KZMD, or an individual’s non-business expenditure, with an eligible service period of no more than 12 months ending by the last day of '
    + 'the next income year; s 8-1 allows the deduction when incurred'],
  ['apportioned_82kzm', 'ITAA 1936 s 82KZM(1): the deduction x days of the eligible service period in the year / days of the eligible service '
    + 'period, for each year the period touches'],
  ['apportioned_82kzmd', 'ITAA 1936 ss 82KZMA and 82KZMD(2): expenditure x days of the eligible service period in the year / total days of the '
    + 'eligible service period, for business expenditure, a non-individual’s non-business expenditure, or a small or medium business’s choice under '
    + 's 82KZMA(2)(b)'],
  ['apportioned_82kzmf', 'ITAA 1936 ss 82KZME and 82KZMF(1): an agreement the operator states s 82KZME applies to; expenditure x days of the '
    + 'eligible service period in the year / total days; s 8-1 no longer allows the whole deduction when incurred, so s 82KZM(1)(c) is not met'],
]);

/** @param {string} why @returns {never} */
const datesInvalid = (why) => refuse('prepayments.dates_invalid', why);

/** The facts read and checked, in the command's order. @param {Map<string, import('./aa-command.mjs').Field>} fields @param {number} first */
function readFacts(fields, first) {
  const value = (/** @type {string} */ key) => field(fields, key).value;
  const taxpayer = value('taxpayer');
  if (taxpayer !== 'small_business_entity' && taxpayer !== 'medium_business_entity' && taxpayer !== 'other') {
    refuse('prepayments.taxpayer_invalid', 'taxpayer must be small_business_entity, medium_business_entity or other.');
  }
  const smallOrMedium = taxpayer !== 'other';
  const chose = flag(value('chose_82kzmd'), 'chose_82kzmd');
  if (chose && !smallOrMedium) {
    refuse('prepayments.choice_unavailable', 'Only a small business entity or an entity covered by ITAA 1936 s 82KZMA(2A) chooses to apply '
      + 's 82KZMD (s 82KZMA(2)(b)).');
  }
  const expenditureField = field(fields, 'expenditure');
  const expenditure = money(expenditureField.dec);
  const minus = typeof expenditureField.value === 'string' && expenditureField.value.trim().startsWith('-');
  const incurred = dateArg(value('incurred'), 'incurred');
  const start = dateArg(value('service_start'), 'service_start');
  const end = dateArg(value('service_end'), 'service_end');
  const agreement = dateArg(value('agreement_date'), 'agreement_date');
  if (incurred < yearStart(first) || incurred >= yearStart(first + 1)) datesInvalid('The day incurred must fall in the income year.');
  if (end < start) datesInvalid('The last service day must not be before the first.');
  if (agreement > incurred) datesInvalid('The agreement date must not be after the day incurred.');
  if (agreement <= CUTOFF) {
    refuse('prepayments.agreement_before_cutoff', 'An agreement entered into on or before 11 November 1999 may carry a pre-RBT obligation '
      + '(ITAA 1936 s 82KZL(1)) or a pre-existing obligation (s 82KZME(8)), whose rules this calculator does not apply.');
  }
  const individual = flag(value('individual'), 'individual');
  const business = flag(value('business_expenditure'), 'business_expenditure');
  const exclusion = value('exclusion');
  if (exclusion !== 'none' && exclusion !== 'law_or_court_order' && exclusion !== 'contract_of_service') {
    refuse('prepayments.exclusion_invalid', 'exclusion must be none, law_or_court_order or contract_of_service.');
  }
  const excluded = exclusion !== 'none' || expenditure < EXCLUDED_BELOW;
  const shelter = flag(value('tax_shelter'), 'tax_shelter');
  return { smallOrMedium, individual, business, chose, expenditure, minus, incurred, start, end, excluded, shelter };
}

/** @typedef {ReturnType<typeof readFacts>} Facts */

/** How the deduction falls, and whether it is apportioned. @param {Facts} f @param {number} first @param {[number, number] | null} period
 * @returns {[string, boolean]} */
function treatment(f, first, period) {
  if (f.excluded) return ['excluded_expenditure', false];
  if (!period) return ['not_prepaid', false];
  const [start, end] = period;
  if (end <= yearStart(first + 1) - 1) return ['done_in_year', false];
  if (f.shelter) return ['apportioned_82kzmf', true];
  if ((f.smallOrMedium && !f.chose) || (f.individual && !f.business)) {
    return end <= monthsEnd(start, 12) && end <= yearStart(first + 2) - 1 ? ['twelve_month_rule', false] : ['apportioned_82kzm', true];
  }
  return ['apportioned_82kzmd', true];
}

/**
 * @typedef {{year: string, amounts: Record<string, string>, rates: Record<string, string>, treatment: string, authority: string,
 *   eligible_service_period: {start: string, end: string, days: number} | null,
 *   schedule: {year: string, days: number | null, deduction: string}[], deductionNow: number, deductionLater: number}} PrepaymentsResult
 */

/** When one prepaid amount is deductible, from the command's call. @param {Record<string, unknown>} call @returns {PrepaymentsResult} */
export function prepayments(call) {
  const fields = readFields(call, 'prepayments', PARAMS);
  const year = scope(fields, PREPAYMENT_YEARS);
  const first = Number(year.slice(0, 4));
  const f = readFacts(fields, first);
  const from = Math.max(f.start, f.incurred);
  /** @type {[number, number] | null} */
  const period = f.end >= from ? [from, Math.min(f.end, monthsEnd(from, MAX_MONTHS))] : null;
  const [id, apportioned] = treatment(f, first, period);
  if (f.chose && id !== 'apportioned_82kzmd') {
    refuse('prepayments.choice_unavailable', 'A s 82KZMD choice applies only to business expenditure, or a non-individual’s non-business '
      + 'expenditure, that is not excluded expenditure, is not under a stated tax shelter and pays for a thing not wholly done in the expenditure '
      + 'year (ITAA 1936 ss 82KZMA(3) and (4)).');
  }
  if (f.shelter && !apportioned) {
    refuse('prepayments.tax_shelter_conflict', 's 82KZME cannot apply to excluded expenditure (s 82KZME(7)) or to expenditure for a thing done by '
      + 'the end of the expenditure year (s 82KZME(2)(b)), so tax_shelter contradicts the other facts.');
  }
  const label = (/** @type {number} */ y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  /** @type {{year: string, days: number | null, deduction: string}[]} */
  const schedule = [];
  let now = f.expenditure;
  if (apportioned && period) {
    const [start, end] = period;
    const total = BigInt(end - start + 1);
    let [counted, allowed] = [0n, 0n];
    for (let y = first; yearStart(y) <= end; y += 1) {
      const days = Math.max(Math.min(end, yearStart(y + 1) - 1) - Math.max(start, yearStart(y)) + 1, 0);
      counted += BigInt(days);
      const running = (2n * f.expenditure * counted + total) / (2n * total);
      if (y === first) now = running;
      schedule.push({ year: label(y), days, deduction: shownCents(running - allowed) });
      allowed = running;
    }
  } else {
    schedule.push({ year: label(first), days: null, deduction: f.minus && !f.expenditure ? '-0.00' : shownCents(f.expenditure) });
  }
  const whole = f.minus && !f.expenditure ? '-0.00' : shownCents(f.expenditure);
  const shown = f.excluded ? null : period;
  return { year, treatment: id, deductionNow: Number(apportioned ? shownCents(now) : shownCents(f.expenditure)),
    deductionLater: Number(shownCents(f.expenditure - now)), authority: PREPAYMENT_AUTHORITIES.get(id) ?? '',
    amounts: { expenditure: whole, deduction_expenditure_year: apportioned ? shownCents(now) : whole,
      deduction_later_years: shownCents(f.expenditure - now) },
    rates: { excluded_below: '1000', longest_period_months: String(MAX_MONTHS) }, schedule,
    eligible_service_period: shown ? { start: formatDay(shown[0]), end: formatDay(shown[1]), days: shown[1] - shown[0] + 1 } : null };
}

/** The form's input as the command's call. @param {(name: string) => string} value */
export function prepaymentsFormInput(value) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  return { taxpayer: value('taxpayer'), individual: yes('individual'), business_expenditure: yes('business'), chose_82kzmd: yes('chose'),
    expenditure: value('expenditure'), incurred: value('incurred'), service_start: value('start'), service_end: value('end'),
    agreement_date: value('agreement'), exclusion: value('exclusion'), tax_shelter: yes('shelter'), year: value('year'), scope_confirmed: true };
}

/** How the page writes the command's input. @param {ReturnType<typeof prepaymentsFormInput>} x @param {(value: number) => string} aud */
export function prepaymentsInputsText(x, aud) {
  const who = new Map([['small_business_entity', 'a small business entity'], ['medium_business_entity', 'an entity with turnover under $50 million'],
    ['other', x.individual ? 'an individual' : 'another taxpayer']]).get(x.taxpayer) ?? x.taxpayer;
  return `${x.year}; ${who}; ${aud(Number(x.expenditure))} ${x.business_expenditure ? 'business' : 'non-business'} expenditure incurred ${x.incurred} `
    + `for services from ${x.service_start} to ${x.service_end}${x.chose_82kzmd ? '; choosing section 82KZMD' : ''}`
    + `${x.tax_shelter ? '; a tax shelter arrangement' : ''}`;
}

const TREATMENT_NOTES = new Map([['excluded_expenditure', 'Excluded expenditure: deductible in full when incurred (section 82KZL(1))'],
  ['not_prepaid', 'No service period remains after the day incurred: deductible in full when incurred'],
  ['done_in_year', 'The services are wholly done in the expenditure year: deductible in full when incurred'],
  ['twelve_month_rule', 'The 12-month rule: deductible in full when incurred (section 82KZM(1)(aa) and (ba))'],
  ['apportioned_82kzm', 'Apportioned by days of the service period in each year (section 82KZM(1))'],
  ['apportioned_82kzmd', 'Apportioned by days of the service period in each year (sections 82KZMA and 82KZMD)'],
  ['apportioned_82kzmf', 'A tax shelter arrangement: apportioned by days (sections 82KZME and 82KZMF)']]);

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function prepaymentsResult(value, aud) {
  const input = prepaymentsFormInput(value);
  const r = prepayments(input);
  /** @type {[string, string][]} */
  const rows = [['Expenditure', aud(Number(r.amounts.expenditure))]];
  if (r.eligible_service_period) {
    rows.push([`Eligible service period, ${r.eligible_service_period.start} to ${r.eligible_service_period.end}`,
      `${r.eligible_service_period.days.toLocaleString('en-AU')} days`]);
  }
  const principal = rows.push([`Deduction in ${r.year}`, aud(Number(r.amounts.deduction_expenditure_year))]) - 1;
  for (const row of r.schedule.slice(1)) rows.push([`Deduction in ${row.year} (${row.days} days)`, aud(Number(row.deduction))]);
  return { inputs: prepaymentsInputsText(input, aud), rows, principal, note: TREATMENT_NOTES.get(r.treatment) ?? r.treatment };
}
