// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// One of 3 Victorian taxes on land for the 2025 or 2026 tax year: vacant residential land tax (Land Tax Act 2005
// (Vic) Part 2 Division 6 and s 35(3)), the commercial and industrial property tax (Commercial and Industrial
// Property Tax Reform Act 2024 (Vic)), nil in both years with the land's earliest possible tax year, and windfall
// gains tax (Windfall Gains Tax Act 2021 (Vic)) on a rezoning. The `vic-property-taxes` command of
// ryanduguid/australian-accounting (main at 4df634b) ported line for line, with its inputs, rounding and refusal
// codes in the order the command checks them. Every figure was read on 23 and 24 November 2026.

import { addMonths, field, flag, formatDay, money, parseDate, parseDecimal, readFields, refuse, scope } from './aa-command.mjs';
import { add, cents, cmp, dec, fromInput, lit, mul, sub, text, whole } from './aa-decimal.mjs';

export const VIC_PROPERTY_YEARS = ['2025', '2026'];
const PARAMS = /** @type {const} */ ([['tax', 'raw'], ['year', 'raw'], ['scope_confirmed', 'raw']]);
const OPTIONAL = /** @type {const} */ ([['capital_improved_value', 'dec'], ['residential_land', 'raw'], ['new_residential_concession', 'raw'],
  ['liable_previous_tax_year', 'raw'], ['liable_tax_year_before', 'raw'], ['entry_date', 'raw'], ['parcels', 'raw']]);
const OWN = { vacant_residential_land: ['capital_improved_value', 'residential_land', 'new_residential_concession', 'liable_previous_tax_year',
  'liable_tax_year_before'], commercial_industrial: ['entry_date'], windfall_gains: ['parcels'] };

export const VIC_PROPERTY_AUTHORITIES = {
  undeveloped: 'Land Tax Act 2005 (Vic) ss 19(1A), 34A, 37A and 35(3)(a): 1% of the capital improved value of undeveloped land in a residential zone '
    + '(s 34B(2B))',
  concession: 'Land Tax Act 2005 (Vic) ss 34A, 37A and 88EB: the concessional 1% for land exempt under s 88EA in a later preceding tax year and since '
    + 'neither used, occupied nor sold',
  history: ['1% of the capital improved value, the land not liable in the preceding tax year', '2%, the land liable in the preceding tax year but '
    + 'not the one before', '3%, the land liable in the last 2 preceding tax years'],
  cipt: 'Commercial and Industrial Property Tax Reform Act 2024 (Vic) ss 3 and 17: land is CIPT taxable land only once its 10-year transition '
    + 'period from its entry date has ended, and an entry on or after 1 July 2024 ends no earlier than 1 July 2034, so the tax is nil in 2025 and 2026',
  wgt: 'Windfall Gains Tax Act 2021 (Vic) ss 9, 10, 11 and 16: the value uplift on each title, negative uplifts ignored; nil to $100,000, 62.5% of '
    + 'the part over $100,000 below $500,000, and 50% of the whole uplift from $500,000',
};

/** @typedef {import('./aa-decimal.mjs').D} D */

/** A whole-dollar amount. @param {import('./aa-command.mjs').Dec | null} parsed @param {string} what @returns {D} */
function dollars(parsed, what) {
  money(parsed);
  const value = fromInput(/** @type {import('./aa-command.mjs').Dec} */ (parsed));
  if (!whole(value)) refuse('input.amount_not_whole_dollars', `Supply established whole-dollar ${what}.`);
  return value;
}

/**
 * The tax, from the command's call.
 * @param {Record<string, unknown>} call
 * @returns {{year: string, tax: string, amounts: Record<string, string>, rates: Record<string, string>, authority: string, total: number}}
 */
export function vicPropertyTaxes(call) {
  const fields = readFields(call, 'vic-property-taxes', PARAMS, OPTIONAL);
  const year = scope(fields, VIC_PROPERTY_YEARS);
  const tax = field(fields, 'tax').value;
  if (tax !== 'vacant_residential_land' && tax !== 'commercial_industrial' && tax !== 'windfall_gains') {
    refuse('vic_property_taxes.tax_invalid', 'tax must be vacant_residential_land, commercial_industrial or windfall_gains.');
  }
  for (const [other, keys] of Object.entries(OWN)) {
    if (other === tax) continue;
    for (const key of keys) if (fields.has(key)) refuse('input.field_unknown', `${key} is an input only for ${other}`);
  }
  const needed = (/** @type {string} */ key, /** @type {string} */ why) => {
    const got = fields.get(key);
    if (!got) refuse('input.missing_field', `${key} is required ${why}.`);
    return got;
  };
  /** @type {[string, D][]} */
  let steps;
  /** @type {Record<string, string>} */
  let rates;
  let authority;
  if (tax === 'vacant_residential_land') [steps, rates, authority] = vacant(year, fields, needed);
  else if (tax === 'commercial_industrial') [steps, rates, authority] = commercial(needed);
  else [steps, rates, authority] = windfall(needed);
  /** @type {Record<string, string>} */
  const amounts = Object.fromEntries(steps.map(([id, value]) => [id, cents(value)]));
  amounts.total = cents(/** @type {[string, D]} */ (steps.at(-1))[1]);
  return { year, tax, amounts, rates, authority, total: Number(amounts.total) };
}

/** @typedef {(key: string, why: string) => import('./aa-command.mjs').Field} Needed */

/** @param {string} year @param {Map<string, import('./aa-command.mjs').Field>} fields @param {Needed} needed
 * @returns {[[string, D][], Record<string, string>, string]} */
function vacant(year, fields, needed) {
  const why = 'for vacant_residential_land';
  const civ = dollars(needed('capital_improved_value', why).dec, 'capital improved values');
  const land = needed('residential_land', why).value;
  let undeveloped = false;
  if (land === 'undeveloped') {
    if (year === '2025') refuse('vic_property_taxes.undeveloped_before_2026', 'Vacant residential land tax applies to undeveloped land (s 34B(2B)) from the 2026 tax year.');
    undeveloped = true;
  } else if (land !== 'vacant_home' && land !== 'construction' && land !== 'uninhabitable') {
    refuse('vic_property_taxes.residential_land_invalid', 'residential_land must be vacant_home, construction, uninhabitable or undeveloped.');
  }
  const key = 'new_residential_concession';
  if (undeveloped && fields.has(key)) refuse('input.field_unknown', `${key} is an input only for vacant_residential_land other than undeveloped land`);
  const concession = undeveloped ? false : flag(needed(key, 'for vacant_residential_land other than undeveloped land').value, key);
  if (concession && year === '2025') {
    refuse('vic_property_taxes.concession_unavailable', 'new_residential_concession was claimed for 2025: s 88EB needs an s 88EA exemption in a '
      + 'preceding tax year, and s 88EA commenced on 1 January 2025.');
  }
  const history = !undeveloped && !concession;
  const hWhy = 'for vacant_residential_land at the s 35(3)(b) rates, which depend on it';
  for (const k of ['liable_previous_tax_year', 'liable_tax_year_before']) {
    if (!history && fields.has(k)) refuse('input.field_unknown', `${k} is an input only ${hWhy}`);
    if (history) needed(k, hWhy);
  }
  let rate = '0.01';
  let authority = undeveloped ? VIC_PROPERTY_AUTHORITIES.undeveloped : VIC_PROPERTY_AUTHORITIES.concession;
  if (history) {
    const previous = flag(field(fields, 'liable_previous_tax_year').value, 'liable_previous_tax_year');
    const before = flag(field(fields, 'liable_tax_year_before').value, 'liable_tax_year_before');
    const index = !previous ? 0 : before ? 2 : 1;
    rate = ['0.01', '0.02', '0.03'][index]; // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
    const paragraph = year === '2025' ? `(${'abc'[index]}) as in force for 2025` : `(b)(${['i', 'ii', 'iii'][index]})`; // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
    authority = `Land Tax Act 2005 (Vic) ss 19(1A), 34A, 37A and 35(3)${paragraph}: ${VIC_PROPERTY_AUTHORITIES.history[index]}`; // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
  }
  return [[['vrlt', mul(civ, lit(rate))]], { vrlt_rate: rate }, authority];
}

/** @param {Needed} needed @returns {[[string, D][], Record<string, string>, string]} */
function commercial(needed) {
  const entry = parseDate(needed('entry_date', 'for commercial_industrial').value);
  if (entry === null) refuse('input.date_invalid', 'entry_date must be a YYYY-MM-DD date from 1900 to 2100.');
  if (entry < /** @type {number} */ (parseDate('2024-07-01'))) {
    refuse('vic_property_taxes.entry_date_before_reform', 'entry_date is before 1 July 2024, when the Commercial and Industrial Property Tax Reform '
      + 'Act 2024 (Vic) commenced (s 2); no land entered the scheme before then.');
  }
  const ends = formatDay(addMonths(entry, 120));
  if (ends.endsWith('-12-31')) {
    refuse('vic_property_taxes.transition_end_unsettled', 'entry_date is 31 December: the transition period ends at midnight on 31 December, the '
      + 'moment that fixes liability, and the Acts do not settle whether the land is still within it then.');
  }
  const rates = { entry_date: formatDay(entry), transition_period_ends: ends, earliest_possible_tax_year: String(Number(ends.slice(0, 4)) + 1),
    cipt_rate: '0.01', btr_cipt_rate: '0.005' };
  return [[['cipt', dec(0n)]], rates, VIC_PROPERTY_AUTHORITIES.cipt];
}

/** @param {Needed} needed @returns {[[string, D][], Record<string, string>, string]} */
function windfall(needed) {
  const list = needed('parcels', 'for windfall_gains').value;
  /** @param {string} why @returns {never} */
  const bad = (why) => refuse('vic_property_taxes.parcels_invalid', why);
  if (!Array.isArray(list) || list.length === 0 || list.length > 100) return bad('parcels must be a list of 1 to 100 objects, one for each title the rezoning rezoned.');
  /** @type {[string, D][]} */
  const steps = [];
  /** @type {Record<string, string>} */
  const rates = {};
  let taxable = dec(0n);
  /** @type {unknown[]} */ (list).forEach((item, i) => {
    const n = i + 1;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) bad(`parcel ${n}: must be an object with civ_before and civ_after.`);
    const extra = Object.keys(/** @type {Record<string, unknown>} */ (item)).find((k) => k !== 'civ_before' && k !== 'civ_after');
    if (extra !== undefined) refuse('input.field_unknown', `parcel ${n}: ${extra} is not a fact it takes beside civ_before and civ_after.`);
    const read = (/** @type {string} */ key) => {
      const raw = /** @type {Record<string, unknown>} */ (item)[key]; // eslint-disable-line security/detect-object-injection -- keys and indexes come from this module's own constant lists or a checked choice
      // Unlike a top-level field, a parcel's value has no length limit (Decimal::parse_input).
      const parsed = typeof raw === 'string' ? parseDecimal(raw) : null;
      try {
        return dollars(parsed, 'capital improved values');
      } catch {
        return bad(`parcel ${n}: ${key} must be a whole-dollar amount of 0 or more, as a string.`);
      }
    };
    const before = read('civ_before');
    const after = read('civ_after');
    Object.assign(rates, { [`civ_before_${n}`]: text(before), [`civ_after_${n}`]: text(after) });
    const uplift = sub(after, before);
    steps.push([`value_uplift_${n}`, uplift]);
    if (cmp(uplift, dec(0n)) > 0) taxable = add(taxable, uplift);
  });
  let wgt = dec(0n);
  if (cmp(taxable, dec(100000n)) > 0) wgt = cmp(taxable, dec(500000n)) < 0 ? mul(sub(taxable, dec(100000n)), lit('0.625')) : mul(taxable, lit('0.5'));
  steps.push(['taxable_value_uplift', taxable], ['wgt', wgt]);
  Object.assign(rates, { wgt_threshold: '100000', wgt_lower_rate: '0.625', wgt_upper_band: '500000', wgt_upper_rate: '0.5' });
  return [steps, rates, VIC_PROPERTY_AUTHORITIES.wgt];
}

/** The form's input as the command's call: only the chosen tax's facts, and only those its answers ask for. @param {(name: string) => string} value */
export function vicPropertyFormInput(value) {
  const tax = value('tax');
  /** @type {Record<string, unknown>} */
  const call = { tax, year: value('year'), scope_confirmed: true };
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  if (tax === 'vacant_residential_land') {
    Object.assign(call, { capital_improved_value: value('civ'), residential_land: value('land') });
    if (value('land') !== 'undeveloped') {
      call.new_residential_concession = yes('concession');
      if (!yes('concession')) Object.assign(call, { liable_previous_tax_year: yes('previous'), liable_tax_year_before: yes('before') });
    }
  } else if (tax === 'commercial_industrial') call.entry_date = value('entry');
  else {
    call.parcels = [1, 2, 3].map((n) => ({ civ_before: value(`before-${n}`), civ_after: value(`after-${n}`) }))
      .filter((p, i) => i === 0 || p.civ_before !== '' || p.civ_after !== '');
  }
  return call;
}

const TAX_NAMES = { vacant_residential_land: 'vacant residential land tax', commercial_industrial: 'commercial and industrial property tax',
  windfall_gains: 'windfall gains tax' };

/** @param {Record<string, unknown>} x @param {(value: number) => string} aud */
export function vicPropertyInputsText(x, aud) {
  const name = TAX_NAMES[/** @type {keyof typeof TAX_NAMES} */ (x.tax)] ?? x.tax;
  if (x.tax === 'vacant_residential_land') {
    const history = x.new_residential_concession ? 's 88EB concession' : x.liable_previous_tax_year === undefined ? 'undeveloped land'
      : `liable in the preceding tax year: ${x.liable_previous_tax_year ? 'yes' : 'no'}; the one before: ${x.liable_tax_year_before ? 'yes' : 'no'}`;
    return `${x.year} ${name}; capital improved value ${aud(Number(x.capital_improved_value))}; ${String(x.residential_land).replaceAll('_', ' ')}; ${history}`;
  }
  if (x.tax === 'commercial_industrial') return `${x.year} ${name}; entry date ${x.entry_date}`;
  const parcels = /** @type {{civ_before: string, civ_after: string}[]} */ (x.parcels);
  return `${x.year} ${name}; ${parcels.map((p) => `${aud(Number(p.civ_before))} to ${aud(Number(p.civ_after))}`).join(', ')}`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function vicPropertyResult(value, aud) {
  const input = vicPropertyFormInput(value);
  const r = vicPropertyTaxes(input);
  /** @type {[string, string][]} */
  const rows = [];
  if (r.tax === 'vacant_residential_land') rows.push(['Rate', `${Number(r.rates.vrlt_rate) * 100}% of the capital improved value`]);
  if (r.tax === 'commercial_industrial') {
    rows.push(['Transition period ends', r.rates.transition_period_ends], ['Earliest tax year the land can be liable', r.rates.earliest_possible_tax_year]);
  }
  if (r.tax === 'windfall_gains') {
    for (const [key, amount] of Object.entries(r.amounts)) {
      if (key.startsWith('value_uplift_')) rows.push([`Value uplift, title ${key.slice(13)}`, aud(Number(amount))]);
    }
    rows.push(['Taxable value uplift', aud(Number(r.amounts.taxable_value_uplift))]);
  }
  rows.push([`${r.year} ${TAX_NAMES[/** @type {keyof typeof TAX_NAMES} */ (r.tax)]}`, aud(r.total)]);
  return { inputs: vicPropertyInputsText(input, aud), rows, principal: rows.length - 1, note: r.authority };
}
