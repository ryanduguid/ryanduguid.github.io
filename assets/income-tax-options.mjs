// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The income tax calculator's optional offsets: reading them from the form, and the rows, notes
// and input summary they add to its result. tax-estimate.mjs works them out.
import { number } from './money.mjs';
import { CARER_CASES, ZONE_SHARED } from './individual-offsets.mjs';
import { LHC_LOADING, refuse } from './private-health-rebate.mjs';

const AREAS = /** @type {Record<string, string>} */ ({ special_area: 'a special area', zone_a: 'Zone A',
  zone_b: 'Zone B', overseas_forces: 'overseas forces service' });
const TIER_NAMES = /** @type {Record<string, string>} */ ({ base: 'the base tier', tier_1: 'tier 1', tier_2: 'tier 2',
  tier_3: 'tier 3' });

/** A whole number of days, or undefined for a blank field. @param {string} text */
const optionalDays = (text) => (text.trim() === '' ? undefined : number(text, { max: 366, integer: true }));

/** Space-separated entries on each non-blank line. @param {string} text */
const rows = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/\s+/));

/** @param {string} text */
function statementLines(text) {
  const lines = rows(text).map((entries) => {
    if (entries.length !== 3 || !/^\d+$/.test(entries[0])) {
      refuse('private_health_insurance_rebate.lines_invalid', 'Enter each statement line as its benefit code, premiums '
        + 'eligible and rebate received, separated by spaces.');
    }
    return { benefit_code: Number(entries[0]), premiums_eligible: entries[1], rebate_received: entries[2] };
  });
  return lines;
}

/** @param {string} text */
function zoneDependants(text) {
  return rows(text).map((entries) => {
    if (entries.length < 2 || entries.length > 3 || !['student', 'child'].includes(entries[0].toLowerCase())) {
      refuse('zone_tax_offset.dependants_invalid', 'Enter each dependant as student or child, their adjusted taxable '
        + 'income and, for part of the year, the days, separated by spaces.');
    }
    const [kind, income, days] = entries;
    return { kind: kind.toLowerCase(), adjusted_taxable_income: income,
      ...(days === undefined ? {} : { days: number(days, { max: 366, integer: true }) }) };
  });
}

/** The offsets the form asks for, or undefined when it asks for none, so the estimate is the
 * plain one. @param {(name: string) => string} value @param {boolean} spouse
 * @returns {import('./tax-estimate.mjs').Offsets | undefined} */
export function incomeTaxOptions(value, spouse) {
  /** @type {import('./tax-estimate.mjs').Offsets} */
  const o = {};
  if (number(value('rebatable-benefit'), { max: 1e9, money: true }) > 0) o.rebatableBenefit = value('rebatable-benefit');
  if (value('carer') === 'yes') {
    const kind = value('carer-case');
    if (Object.hasOwn(CARER_CASES, kind)) refuse(...CARER_CASES[kind]);
    const dependant = value('carer-dependant');
    if (dependant === 'spouse' && !spouse) throw new Error('For a spouse who is the dependant, answer yes to having a spouse all year.');
    o.carer = { dependant, adjusted_taxable_income: value('carer-income'),
      dependant_adjusted_taxable_income: value('carer-dependant-income'), days: optionalDays(value('carer-days')),
      spouse_adjusted_taxable_income: spouse && dependant === 'other' ? value('carer-spouse-income') : undefined };
  }
  const area = value('zone');
  if (area !== 'none') {
    if (value('zone-shared') === 'yes') refuse('zone_tax_offset.shared_maintenance', ZONE_SHARED);
    const soleDays = optionalDays(value('zone-sole-days'));
    if (soleDays !== undefined && spouse) throw new Error('The sole parent notional tax offset is for a person with no spouse (ITAA 1997 s 961-55).');
    const dependants = zoneDependants(value('zone-dependants'));
    o.zone = { area, days: number(value('zone-days'), { max: 366, integer: true }),
      dependants: dependants.length ? dependants : undefined, sole_parent_days: soleDays };
    if (area !== 'overseas_forces') {
      const prior = value('zone-prior-year').trim();
      Object.assign(o.zone, { remote_area_allowance: value('zone-allowance'),
        prior_year: prior || undefined, prior_days: optionalDays(value('zone-prior-days')),
        continuous_residence: value('zone-continuous') === 'yes' || undefined,
        includes_first_day: value('zone-first-day') === 'yes' || undefined });
    }
  }
  if (value('phi') === 'yes') {
    if (value('phi-loading') === 'yes') refuse('private_health_insurance_rebate.lhc_loading', LHC_LOADING);
    o.privateHealth = { maintained: value('phi-maintained') === 'yes', lines: statementLines(value('phi-lines')) };
  }
  return Object.keys(o).length ? o : undefined;
}

/** @typedef {ReturnType<typeof import('./tax-estimate.mjs').taxEstimate> & Record<string, any>} Estimate */

/** The rows the offsets add: [before the low income tax offset, after the low and middle income
 * tax offset, after the study loan repayment]. @param {Estimate} r @param {(amount: number) => string} aud */
export function optionRows(r, aud) {
  const zoneLabel = r.zone?.resident === null ? 'Overseas forces tax offset' : 'Zone tax offset';
  return [
    r.benefit ? [['Beneficiary tax offset', aud(r.beneficiary)]] : [],
    [...(r.carer ? [['Invalid and invalid carer tax offset', aud(r.carerOffset)]] : []),
      ...(r.zone ? [[zoneLabel, aud(r.zoneOffset)]] : [])],
    r.privateHealth ? [['Private health insurance tax offset, refundable', aud(r.privateHealth.offset)],
      ['Excess private health insurance rebate to repay', aud(r.privateHealth.excess)]] : [],
  ];
}

/** Sentences for the result note. @param {Estimate} r @param {boolean} spouse */
export function optionNotes(r, spouse) {
  const whole = (/** @type {number} */ amount) => `$${amount.toLocaleString('en-AU', { maximumFractionDigits: 2 })}`;
  const notes = [];
  if (r.carer && !r.carer.eligible) {
    notes.push(`No invalid and invalid carer tax offset: income of ${whole(r.carer.tested)} is more than the FTB Part B limit of ${whole(r.carer.limit)}`);
  }
  if (r.zone) {
    notes.push(r.zone.resident === null
      ? `Overseas forces: ${r.zone.days * 2 > r.zone.yearDays ? 'the full amount' : `${r.zone.days}/183 of the full amount`} of ${whole(r.zone.full)}`
      : `Zone tax offset: ${r.zone.resident ? `a resident of the area, ${r.zone.residence}` : `not a resident of the area, ${r.zone.residence}`}`);
  }
  const p = r.privateHealth;
  if (p) {
    notes.push(`Private health insurance rebate: ${TIER_NAMES[p.tier]}, on income for surcharge purposes of ${whole(p.income)}`
      + `${spouse ? ' with the spouse’s' : ''} against ${p.families ? 'family' : 'singles'} thresholds of ${p.thresholds.map(whole).join(', ')}`);
  }
  const claimed = (r.benefit?.offset ?? 0) + (r.carer?.offset ?? 0) + (r.zone?.offset ?? 0);
  const used = r.beneficiary + r.carerOffset + r.zoneOffset;
  if (claimed > used + 0.001) notes.push('The tax offsets exceed the tax on taxable income: the rest is not refunded and does not reduce the Medicare levy');
  return notes;
}

/** The input summary the offsets add. @param {(name: string) => string} value
 * @param {import('./tax-estimate.mjs').Offsets} o @param {(amount: number) => string} aud */
export function optionInputs(value, o, aud) {
  const parts = [];
  if (o.rebatableBenefit) parts.push(`rebatable benefits ${aud(Number(o.rebatableBenefit))}`);
  if (o.carer) {
    parts.push(`an invalid or invalid carer dependant who is ${o.carer.dependant === 'spouse' ? 'your spouse' : 'another relative'}, `
      + `with adjusted taxable income of ${aud(Number(o.carer.dependant_adjusted_taxable_income))}`
      + `${o.carer.days === undefined ? '' : ` over ${o.carer.days} days`}, yours ${aud(Number(o.carer.adjusted_taxable_income))}`
      + `${o.carer.spouse_adjusted_taxable_income === undefined ? '' : ` and your spouse’s ${aud(Number(o.carer.spouse_adjusted_taxable_income))}`}`);
  }
  if (o.zone) {
    const n = o.zone.dependants ? /** @type {unknown[]} */ (o.zone.dependants).length : 0;
    parts.push(`${AREAS[o.zone.area]} for ${o.zone.days} days${n ? ` with ${n} dependant${n === 1 ? '' : 's'}` : ''}`
      + `${o.zone.prior_year ? `, ${o.zone.prior_days} days carried from ${o.zone.prior_year}` : ''}`
      + `${o.zone.sole_parent_days === undefined ? '' : `, sole parent for ${o.zone.sole_parent_days} days`}`
      + `${Number(o.zone.remote_area_allowance) > 0 ? `, remote area allowance ${aud(Number(o.zone.remote_area_allowance))}` : ''}`);
  }
  if (o.privateHealth) {
    const n = o.privateHealth.lines.length;
    parts.push(`a private health insurance statement with ${n} line${n === 1 ? '' : 's'}`
      + `${value('phi-maintained') === 'yes' ? ', maintaining a dependent child or sibling' : ''}`);
  }
  return parts.length ? `, ${parts.join(', ')}` : '';
}
