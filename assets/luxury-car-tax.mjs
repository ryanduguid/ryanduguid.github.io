// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { ratioCents } from './money.mjs';

// Luxury car tax on one tax period's lines, the `luxury-car-tax` command of
// ryanduguid/australian-accounting (PR 748) ported line for line: its inputs, thresholds, rounding
// and refusal codes. Read 22 November 2026:
// - A New Tax System (Luxury Car Tax) Act 1999 ss 5-15, 7-15, 15-20, 15-25, 15-30, 18-5, 18-10 and
//   25-1 at the ATO's legal database, with the history of ss 18-5(3) and 18-10(3).
// - Treasury Laws Amendment (Tax Incentives and Integrity) Act 2025 (No. 29, 2025) Schedule 1: the
//   3.5 litre fuel-efficient rating for supplies and importations from 1 July 2025 and item 4(2)'s
//   continued 7 litre rating.
// - Treasury Laws Amendment (2019 Measures No. 2) Act 2019 (No. 94, 2019) Schedule 2: refunds of
//   the lesser of the tax and $10,000 for refund-eligible cars supplied or imported from 1 July 2019.
// - The ATO's 'Luxury car tax rate and thresholds' (QC38161, last updated 1 June 2026): 33% and the
//   table below; 'Working out the LCT on a sale' (QC22107) and 'on an import' (QC22108), both last
//   updated 1 June 2026; 'Luxury car tax credits and refunds' (QC39467, 16 July 2025); the BAS page
//   'Luxury car tax (LCT)' (QC33694, 1 May 2025): labels 1E and 1F.
// Whether a vehicle is a luxury car, whether a supply is taxable, its value and its rating are the
// user's facts.

export const LCT_READ = '2026-11-22';
/** The tax period's financial years the command works. */
export const LCT_YEARS = ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];

/** QC38161: financial year, fuel-efficient car limit, luxury car tax threshold (whole dollars). */
export const LCT_THRESHOLDS = /** @type {[string, number, number][]} */ ([
  ['2012-13', 75375, 59133], ['2013-14', 75375, 60316], ['2014-15', 75375, 61884], ['2015-16', 75375, 63184],
  ['2016-17', 75526, 64132], ['2017-18', 75526, 65094], ['2018-19', 75526, 66331], ['2019-20', 75526, 67525],
  ['2020-21', 77565, 68740], ['2021-22', 79659, 69152], ['2022-23', 84916, 71849], ['2023-24', 89332, 76950],
  ['2024-25', 91387, 80567], ['2025-26', 91387, 80567], ['2026-27', 91661, 80809],
]);
const FIRST_YEAR = LCT_THRESHOLDS[0][0];
const REFUND_CAP = 1000000n;
const MAX_LINES = 1000;

export const LCT_KINDS = {
  sale: 'sale',
  importation: 'importation',
  price_adjustment: 'price adjustment',
  change_of_use_increasing: 'change of use, increasing adjustment',
  change_of_use_decreasing: 'change of use, decreasing adjustment',
  refund: 'refund',
};
/** The fields each kind of line takes, as the command lists them. */
const FIELDS = {
  sale: ['kind', 'luxury_car_tax_value', 'fuel_consumption_litres_per_100km', 'used_before_1_july_2025', 'lct_previously_payable'],
  importation: ['kind', 'luxury_car_tax_value', 'fuel_consumption_litres_per_100km', 'used_before_1_july_2025'],
  price_adjustment: ['kind', 'supplied_in', 'corrected_luxury_car_tax_value', 'fuel_consumption_litres_per_100km',
    'used_before_1_july_2025', 'lct_previously_payable', 'previously_attributed_lct'],
  change_of_use_increasing: ['kind', 'supplied_in', 'luxury_car_tax_value', 'fuel_consumption_litres_per_100km',
    'used_before_1_july_2025', 'lct_previously_payable'],
  change_of_use_decreasing: ['kind', 'lct_payable_on_supply'],
  refund: ['kind', 'supplied_in', 'claimant', 'refund_eligible_car', 'lct_borne'],
};
export const LCT_CLAIMANTS = { primary_producer: 'primary producer', tourism_operator: 'tourism operator' };
const WORDS = { luxury_car_tax_value: 'the luxury car tax value', corrected_luxury_car_tax_value: 'the corrected luxury car tax value',
  lct_previously_payable: 'the luxury car tax already payable on the car', previously_attributed_lct: 'the luxury car tax previously attributed',
  lct_payable_on_supply: 'the luxury car tax payable on the supply', lct_borne: 'the luxury car tax borne' };

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** A decimal string of at most 32 characters as a whole number of 10^-places, or null.
 * `-0` is nil, as the command's decimal reads it. @param {unknown} value @param {number} places */
function scaled(value, places) {
  const parts = typeof value === 'string' && value.length <= 32 ? /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim()) : null;
  if (!parts || (parts[3] ?? '').length > places) return null;
  const whole = BigInt(parts[2] + (parts[3] ?? '').padEnd(places, '0'));
  return parts[1] && whole > 0n ? null : whole;
}

/** An amount in cents: a decimal string, non-negative, at most 2 places and $1,000,000,000,000.
 * @param {Record<string, unknown>} fields @param {number} n @param {string} key */
function amount(fields, n, key) {
  if (!Object.hasOwn(fields, key)) refuse('input.missing_field', `Line ${n}: enter ${WORDS[key]}.`);
  const cents = scaled(fields[key], 2);
  if (cents === null || cents > 10n ** 14n) {
    refuse('input.amount_invalid', `Line ${n}: enter ${WORDS[key]} as an amount of 0 or more with no more than 2 decimal places.`);
  }
  return cents;
}

/** @param {unknown} value @param {number} n @param {string} what */
function flag(value, n, what) {
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `Line ${n}: answer ${what} yes or no.`);
  return value;
}

/** The combined rating in hundredths of a litre per 100 km, or null for a car without one.
 * @param {Record<string, unknown>} fields @param {number} n */
function rating(fields, n) {
  const key = 'fuel_consumption_litres_per_100km';
  if (!Object.hasOwn(fields, key)) refuse('input.missing_field', `Line ${n}: enter the combined fuel consumption rating, or none.`);
  if (fields[key] === null) return null;
  const value = scaled(fields[key], 2);
  if (value === null || value > 10000n) {
    refuse('luxury_car_tax.consumption_invalid', `Line ${n}: enter the combined rating in litres per 100 km, from 0 to 100 with no more than 2 decimal places, or leave it blank for none.`);
  }
  return value;
}

/** The supply's financial year: the tax period's, or `supplied_in`, no later.
 * @param {Record<string, unknown>} fields @param {number} n @param {string} year */
function supplyYear(fields, n, year) {
  if (!Object.hasOwn(fields, 'supplied_in')) return year;
  const given = fields.supplied_in;
  if (typeof given !== 'string' || !LCT_THRESHOLDS.some(([y]) => y === given) || given > year) {
    refuse('luxury_car_tax.year_invalid', `Line ${n}: the supply’s financial year must be from ${FIRST_YEAR} to ${year}, the years whose thresholds the ATO publishes, and not after the tax period’s.`);
  }
  return given;
}

/** @typedef {{year: string, value: bigint, rating: bigint | null, usedBefore: boolean}} Car */

/** @param {Record<string, unknown>} fields @param {number} n @param {string} year @param {string} valueKey @returns {Car} */
function car(fields, n, year, valueKey) {
  const supplied = supplyYear(fields, n, year);
  const value = amount(fields, n, valueKey);
  const rated = rating(fields, n);
  const matters = supplied >= '2025-26' && rated !== null && rated > 350n && rated <= 700n;
  const given = Object.hasOwn(fields, 'used_before_1_july_2025');
  if (matters && !given) {
    refuse('input.missing_field', `Line ${n}: say whether, before 1 July 2025, the car was supplied or imported and used in Australia other than for a quotable purpose: a car rated above 3.5 and up to 7 litres per 100 km keeps the 7 litre rating only then (Act No. 29 of 2025 Schedule 1 item 4(2)).`);
  }
  if (!matters && given) {
    refuse('input.field_unknown', `Line ${n}: use before 1 July 2025 matters only for a car rated above 3.5 and up to 7 litres per 100 km supplied or imported from 1 July 2025.`);
  }
  return { year: supplied, value, rating: rated, usedBefore: matters && flag(fields.used_before_1_july_2025, n, 'use before 1 July 2025') };
}

/** @typedef {{n: number, kind: keyof typeof FIELDS, car: Car | null, previous: bigint, attributed: bigint,
 *   claimant?: keyof typeof LCT_CLAIMANTS, eligible?: boolean}} LctLine */

/** One line's checked facts, in the order the command checks them. @param {unknown} value @param {number} n @param {string} year @returns {LctLine} */
function parseLine(value, n, year) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) refuse('luxury_car_tax.line_invalid', `Line ${n} is not a line.`);
  const fields = /** @type {Record<string, unknown>} */ (value);
  const kind = /** @type {keyof typeof FIELDS} */ (fields.kind);
  if (typeof kind !== 'string' || !Object.hasOwn(FIELDS, kind)) refuse('luxury_car_tax.kind_invalid', `Line ${n}: choose what the line is.`);
  const unknown = Object.keys(fields).find((key) => !FIELDS[kind].includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `Line ${n}: ${unknown} is not an input of a ${LCT_KINDS[kind]}.`);
  if ((kind === 'price_adjustment' || kind === 'change_of_use_increasing') && !Object.hasOwn(fields, 'supplied_in')) {
    refuse('input.missing_field', `Line ${n}: choose the financial year of the supply, whose threshold applies.`);
  }
  const valueKey = kind === 'price_adjustment' ? 'corrected_luxury_car_tax_value' : 'luxury_car_tax_value';
  const worked = kind === 'change_of_use_decreasing' || kind === 'refund' ? null : car(fields, n, year, valueKey);
  const optional = (/** @type {string} */ key) => (Object.hasOwn(fields, key) ? amount(fields, n, key) : 0n);
  /** @type {LctLine} */
  const line = { n, kind, car: worked, previous: 0n, attributed: 0n };
  if (kind === 'change_of_use_decreasing') line.previous = amount(fields, n, 'lct_payable_on_supply');
  else if (kind === 'refund') line.previous = amount(fields, n, 'lct_borne');
  else if (kind === 'price_adjustment') [line.previous, line.attributed] = [optional('lct_previously_payable'), amount(fields, n, 'previously_attributed_lct')];
  else line.previous = optional('lct_previously_payable');
  if (kind === 'refund') {
    if (supplyYear(fields, n, year) < '2019-20') {
      refuse('luxury_car_tax.refund_invalid', `Line ${n}: the refund of the lesser of the tax and $10,000 is for a refund-eligible car supplied or imported from 1 July 2019 (Act No. 94 of 2019 Schedule 2 item 3); the earlier refund is not worked out here.`);
    }
    if (!Object.hasOwn(fields, 'claimant')) refuse('input.missing_field', `Line ${n}: choose who claims the refund.`);
    const claimant = /** @type {keyof typeof LCT_CLAIMANTS} */ (fields.claimant);
    if (typeof claimant !== 'string' || !Object.hasOwn(LCT_CLAIMANTS, claimant)) {
      refuse('luxury_car_tax.refund_invalid', `Line ${n}: a refund is for a primary producer or a tourism operator.`);
    }
    if (!Object.hasOwn(fields, 'refund_eligible_car')) refuse('input.missing_field', `Line ${n}: say whether the car is refund-eligible.`);
    Object.assign(line, { claimant, eligible: flag(fields.refund_eligible_car, n, 'whether the car is refund-eligible') });
  }
  return line;
}

const nil = (/** @type {bigint} */ cents) => (cents < 0n ? 0n : cents);
const thresholds = (/** @type {string} */ year) => /** @type {[string, number, number]} */ (LCT_THRESHOLDS.find(([y]) => y === year));

/** The car's threshold in cents and which one it is: the fuel-efficient car limit for a rating of at
 * most 3.5 litres from 1 July 2025 (s 25-1(4) as Act No. 29 of 2025 amended it), 7 litres before
 * and where item 4(2) continues it; otherwise the general threshold. @param {Car} c */
function threshold(c) {
  const [, efficient, general] = thresholds(c.year);
  const limit = c.year >= '2025-26' && !c.usedBefore ? 350n : 700n;
  return c.rating !== null && c.rating <= limit
    ? { cents: BigInt(efficient) * 100n, kind: /** @type {const} */ ('fuel_efficient'), litres: limit }
    : { cents: BigInt(general) * 100n, kind: /** @type {const} */ ('general'), litres: limit };
}

/** s 5-15(1) and s 7-15(1): 33% x 10/11 of the value over the threshold, half up to the cent. @param {Car} c */
function taxOn(c) {
  const t = threshold(c);
  const over = nil(c.value - t.cents);
  return { threshold: t, over, tax: ratioCents(over * 330n, 1100n) };
}

/** @typedef {{line: number, kind: keyof typeof FIELDS, year?: string, value?: number, threshold?: number, thresholdKind?: string, litres?: number,
 *   over?: number, tax?: number, payable?: number, priceWithLct?: number, previous?: number, attributed?: number, corrected?: number,
 *   increasing?: number, decreasing?: number, claimant?: string, eligible?: boolean, borne?: number, refund?: number}} LctWorked */

const dollars = (/** @type {bigint} */ cents) => Number(cents) / 100;

/** Luxury car tax on one tax period's lines, as the `luxury-car-tax` command works them.
 * @param {{year: string, lines: unknown[]}} input */
export function luxuryCarTax(input) {
  const unknown = Object.keys(input).find((key) => key !== 'year' && key !== 'lines');
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an input.`);
  const { year } = input;
  if (!LCT_YEARS.includes(year)) refuse('period.unsupported', `Choose a tax period in a financial year from ${LCT_YEARS[0]} to ${LCT_YEARS.at(-1)}.`);
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > MAX_LINES) {
    refuse('luxury_car_tax.lines_invalid', `Enter from 1 to ${MAX_LINES} lines.`);
  }
  const lines = input.lines.map((line, i) => parseLine(line, i + 1, year));
  const primary = lines.filter((l) => l.claimant === 'primary_producer' && l.eligible);
  if (primary.length > 1) {
    refuse('luxury_car_tax.refund_limit', 'A primary producer is refunded for one car a financial year (LCT Act s 18-5(4)): give at most one primary producer refund.');
  }
  const sums = { sales: 0n, imports: 0n, up: 0n, down: 0n, refunds: 0n };
  /** @type {LctWorked[]} */
  const worked = lines.map((l) => {
    /** @type {LctWorked} */
    const out = { line: l.n, kind: l.kind };
    if (l.car) {
      const { threshold: t, over, tax } = taxOn(l.car);
      Object.assign(out, { year: l.car.year, value: dollars(l.car.value), threshold: dollars(t.cents), thresholdKind: t.kind,
        litres: Number(t.litres) / 100, over: dollars(over), tax: dollars(tax) });
      if (l.previous) out.previous = dollars(l.previous);
      if (l.kind === 'importation') sums.imports += tax;
      else if (l.kind === 'sale') {
        const payable = nil(tax - l.previous);
        Object.assign(out, { payable: dollars(payable), priceWithLct: dollars(l.car.value + payable) });
        sums.sales += payable;
      } else if (l.kind === 'price_adjustment') {
        const corrected = nil(tax - l.previous);
        const change = corrected - l.attributed;
        Object.assign(out, { corrected: dollars(corrected), attributed: dollars(l.attributed) });
        if (change < 0n) { out.decreasing = dollars(-change); sums.down -= change; }
        else { out.increasing = dollars(change); sums.up += change; }
      } else {
        const payable = nil(tax - l.previous);
        out.increasing = dollars(payable);
        sums.up += payable;
      }
    } else if (l.kind === 'refund') {
      const refund = !l.eligible ? 0n : l.previous > REFUND_CAP ? REFUND_CAP : l.previous;
      Object.assign(out, { claimant: l.claimant, eligible: l.eligible, borne: dollars(l.previous), refund: dollars(refund) });
      sums.refunds += refund;
    } else {
      out.decreasing = dollars(l.previous);
      sums.down += l.previous;
    }
    return out;
  });
  const [, efficient, general] = thresholds(year);
  const warnings = primary.length ? ['A primary producer is refunded for one car a financial year (LCT Act s 18-5(4)): '
    + 'only this tax period’s lines are seen here, so a refund for another car earlier in the year means none is due on this one'] : [];
  return { year, lines: worked, onSales: dollars(sums.sales), increasing: dollars(sums.up), decreasing: dollars(sums.down),
    label1e: Number((sums.sales + sums.up) / 100n), label1f: Number(sums.down / 100n), onImportations: dollars(sums.imports),
    refunds: dollars(sums.refunds), threshold: general, fuelEfficientLimit: efficient, warnings };
}

const FORM_LINES = 4;
const blank = (/** @type {string} */ text) => text.trim() === '';

/** The command's input from the form: each line with a kind chosen, with only the fields its kind
 * shows. A blank optional amount is left out; a blank rating means the car has none.
 * @param {(name: string) => string} value */
export function lctFormInput(value) {
  const year = value('year');
  const lines = [];
  for (let i = 1; i <= FORM_LINES; i += 1) {
    const kind = value(`kind-${i}`);
    if (kind === '') continue;
    /** @type {Record<string, unknown>} */
    const line = { kind };
    const take = (/** @type {string} */ key, /** @type {string} */ name, optional = false) => {
      const text = value(`${name}-${i}`);
      if (!(optional && blank(text))) line[key] = text.trim();
    };
    const supplied = value(`supplied-${i}`);
    const dated = (kind === 'price_adjustment' || kind === 'change_of_use_increasing' || kind === 'refund') && supplied !== '';
    if (dated) line.supplied_in = supplied;
    if (kind !== 'change_of_use_decreasing' && kind !== 'refund') {
      take(kind === 'price_adjustment' ? 'corrected_luxury_car_tax_value' : 'luxury_car_tax_value', 'value');
      const rated = value(`rating-${i}`).trim();
      line.fuel_consumption_litres_per_100km = rated === '' ? null : rated;
      const litres = scaled(rated, 2);
      const used = value(`used-before-${i}`);
      // The command takes this answer only where it decides the rating: above 3.5 and up to 7
      // litres, supplied or imported from 1 July 2025.
      if ((dated ? supplied : year) >= '2025-26' && litres !== null && litres > 350n && litres <= 700n && used !== '') {
        line.used_before_1_july_2025 = used === 'yes';
      }
      if (kind !== 'importation') take('lct_previously_payable', 'earlier', true);
      if (kind === 'price_adjustment') take('previously_attributed_lct', 'attributed');
    }
    if (kind === 'change_of_use_decreasing') take('lct_payable_on_supply', 'on-supply');
    if (kind === 'refund') {
      line.claimant = value(`claimant-${i}`);
      const eligible = value(`eligible-${i}`);
      if (eligible !== '') line.refund_eligible_car = eligible === 'yes';
      take('lct_borne', 'borne');
    }
    lines.push(line);
  }
  if (!lines.length) throw new Error('Choose what at least one line is.');
  return { year, lines };
}

/** How the page writes the form's input. @param {{year: string, lines: Record<string, unknown>[]}} input @param {(value: number) => string} aud */
export function lctInputsText(input, aud) {
  const money = (/** @type {unknown} */ text) => aud(Number(text));
  const lines = input.lines.map((l, i) => {
    const parts = [`line ${i + 1}: ${LCT_KINDS[/** @type {keyof typeof LCT_KINDS} */ (l.kind)]}`];
    if (l.supplied_in) parts.push(`supplied in ${l.supplied_in}`);
    const carValue = l.luxury_car_tax_value ?? l.corrected_luxury_car_tax_value;
    if (carValue !== undefined) {
      parts.push(`${l.kind === 'price_adjustment' ? 'corrected value' : 'value'} ${money(carValue)}`,
        l.fuel_consumption_litres_per_100km === null ? 'no fuel consumption rating' : `rated ${l.fuel_consumption_litres_per_100km} litres per 100 km`);
    }
    if (l.used_before_1_july_2025 !== undefined) parts.push(`${l.used_before_1_july_2025 ? '' : 'not '}supplied and used before 1 July 2025`);
    if (l.lct_previously_payable !== undefined) parts.push(`${money(l.lct_previously_payable)} already payable on the car`);
    if (l.previously_attributed_lct !== undefined) parts.push(`${money(l.previously_attributed_lct)} previously attributed`);
    if (l.lct_payable_on_supply !== undefined) parts.push(`${money(l.lct_payable_on_supply)} payable on the supply`);
    if (l.claimant !== undefined) parts.push(`to a ${LCT_CLAIMANTS[/** @type {keyof typeof LCT_CLAIMANTS} */ (l.claimant)] ?? 'claimant'}`);
    if (l.refund_eligible_car !== undefined) parts.push(l.refund_eligible_car ? 'refund-eligible car' : 'not a refund-eligible car');
    if (l.lct_borne !== undefined) parts.push(`${money(l.lct_borne)} borne`);
    return parts.join(', ');
  });
  return [input.year, ...lines].join('; ');
}

/** One worked line as the page shows it. @param {LctWorked} l @param {(value: number) => string} aud */
function lineRow(l, aud) {
  const over = () => `${aud(l.value ?? 0)}, ${l.thresholdKind === 'fuel_efficient' ? 'fuel-efficient car limit' : 'threshold'} `
    + `${aud(l.threshold ?? 0).replace(/\.00$/, '')} for ${l.year}, ${aud(l.over ?? 0)} over`;
  const less = l.previous ? `, less ${aud(l.previous)} already payable on the car` : '';
  switch (l.kind) {
    case 'sale':
      return [`Line ${l.line}: sale at ${over()}${l.previous ? `, tax ${aud(l.tax ?? 0)}${less}` : ''}`, aud(l.payable ?? 0)];
    case 'importation':
      return [`Line ${l.line}: importation at ${over()}, paid to the Department of Home Affairs, not at 1E`, aud(l.tax ?? 0)];
    case 'price_adjustment':
      return [`Line ${l.line}: price adjustment, corrected value ${over()}, corrected tax ${aud(l.corrected ?? 0)}${less} against `
        + `${aud(l.attributed ?? 0)} attributed: ${l.decreasing === undefined ? 'increasing' : 'decreasing'} adjustment`, aud(l.decreasing ?? l.increasing ?? 0)];
    case 'change_of_use_increasing':
      return [`Line ${l.line}: change of use, increasing adjustment of the tax on the supply at ${over()}${less}`, aud(l.increasing ?? 0)];
    case 'change_of_use_decreasing':
      return [`Line ${l.line}: change of use, decreasing adjustment of the tax payable on the supply`, aud(l.decreasing ?? 0)];
    default:
      return [`Line ${l.line}: refund to a ${LCT_CLAIMANTS[/** @type {keyof typeof LCT_CLAIMANTS} */ (l.claimant)]}, `
        + (l.eligible ? `the lesser of ${aud(l.borne ?? 0)} borne and $10,000` : 'not a refund-eligible car, so nil'), aud(l.refund ?? 0)];
  }
}

/** The page's result: a row for each line, the totals and labels 1E and 1F.
 * @param {(name: string) => string} value @param {(value: number) => string} aud */
export function luxuryCarTaxResult(value, aud) {
  const input = lctFormInput(value);
  const r = luxuryCarTax(input);
  const rows = r.lines.map((l) => lineRow(l, aud));
  rows.push(['Luxury car tax on sales', aud(r.onSales)], ['Increasing adjustments', aud(r.increasing)],
    ['Label 1E on the BAS, in whole dollars', aud(r.label1e)]);
  const principal = rows.length - 1;
  rows.push(['Decreasing adjustments', aud(r.decreasing)], ['Label 1F on the BAS, in whole dollars', aud(r.label1f)]);
  if (r.lines.some((l) => l.kind === 'importation')) rows.push(['Luxury car tax on importations, paid to the Department of Home Affairs', aud(r.onImportations)]);
  if (r.lines.some((l) => l.kind === 'refund')) rows.push(['Refunds, claimed on the ATO’s form, not the BAS', aud(r.refunds)]);
  return { inputs: lctInputsText(/** @type {any} */ (input), aud), rows, principal, note: r.warnings.length ? r.warnings.join(' ') : undefined };
}
