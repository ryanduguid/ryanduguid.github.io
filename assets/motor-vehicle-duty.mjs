// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Duty on registering, or transferring the registration of, one passenger vehicle in any state or territory,
// for a duty date in 2026-27: the `motor-vehicle-duty` command of ryanduguid/australian-accounting (main at
// 4df634b) ported line for line, with its scales, rounding and refusal codes in the order the command checks
// them. Every figure was read on 24 November 2026 (New South Wales from Revenue NSW and Service NSW, its Act
// not being readable at the legislation site).

import { dateArg, field, flag, money, readFields, refuse, scope } from './aa-command.mjs';
import { add, cents, cmp, dec, div, fromInput, lit, mul, quantize, sub, text, whole } from './aa-decimal.mjs';

export const MOTOR_VEHICLE_DUTY_YEARS = ['2026-27'];
export const MOTOR_PLACES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'];
const PARAMS = /** @type {const} */ ([['jurisdiction', 'raw'], ['vehicle_class', 'raw'], ['dutiable_value', 'dec'], ['duty_date', 'raw'],
  ['year', 'raw'], ['scope_confirmed', 'raw']]);
const CONDITIONAL = /** @type {const} */ ([['engine', 'qld', 'in Queensland'], ['green_car', 'vic', 'in Victoria'],
  ['primary_producer', 'vic', 'in Victoria'], ['emissions_category', 'act', 'in the ACT'], ['new_vehicle', 'act', 'in the ACT'],
  ['fleet_discount', 'tas', 'in Tasmania'], ['electric', 'nt', 'in the Northern Territory']]);
const OPTIONAL = CONDITIONAL.map(([key]) => /** @type {const} */ ([key, 'raw']));

/** A band: values from `from` pay `base` plus `rate` for every `per` dollars, or part, over `over`; a rate of '0' is a fixed `base`.
 * @typedef {{from: number, base: string, rate: string, over: number}} Band
 * @typedef {{authority: string, per: number, minimum: string | null, bands: Band[]}} Scale */
/** @param {number} from @param {string} base @param {string} rate @param {number} over @returns {Band} */
const band = (from, base, rate, over) => ({ from, base, rate, over });
/** @param {string} authority @param {Band[]} bands @param {number} [per] @param {string | null} [minimum] @returns {Scale} */
const scale = (authority, bands, per = 100, minimum = null) => ({ authority, per, minimum, bands });

const NSW = scale('Revenue NSW and Service NSW: $3 for every $100, or part, to $44,999; $1,350 plus $5 for every $100, or part, over $45,000 '
  + '(Duties Act 1997 (NSW) Chapter 9)', [band(0, '0', '3', 0), band(45001, '1350', '5', 45000)]);
const VIC_TABLE = 'Duties Act 2000 (Vic) s 218(1) Table and (5): per $200, or part, of the dutiable value; the 2026-27 luxury car tax threshold is $80,809';
const VIC = scale(VIC_TABLE, [band(0, '0', '8.40', 0), band(80810, '0', '10.40', 0), band(100001, '0', '14.00', 0), band(150001, '0', '18.00', 0)], 200);
const VIC_CONCESSION = scale('Duties Act 2000 (Vic) s 218(1) Table items 1 and 2: a green car (tailpipe CO2 of 120 g/km or less) or a primary '
  + 'producer passenger car, $8.40 per $200, or part', [band(0, '0', '8.40', 0)], 200);
const QLD_AUTHORITY = 'Duties Act 2001 (Qld) s 383 and Sch 4C: the row’s rate for each $100, or part, plus $2 for each $100, or part, of the whole '
  + 'value if it is more than $100,000';
/** @type {[string, Scale][]} */
const QLD = [['hybrid_or_electric', '2', '4'], ['up_to_4_cylinders', '3', '5'], ['5_or_6_cylinders', '3.50', '5.50'], ['7_or_more_cylinders', '4', '6']]
  .map(([row, low, high]) => [row, scale(QLD_AUTHORITY, [band(0, '0', low, 0), band(100001, '0', high, 0)])]);
const WA = 'Duties Act 2008 (WA) s 236(1) and (2): 2.75% to $25,000; R% to $50,000, R = 2.75 + (value - 25,000) / 6,666.66 to 2 places; 6.5% '
  + 'above; rounded down to 5 cents';
const SA = scale('Stamp Duties Act 1923 (SA) Sch 2 cl 2(1)(a) and (c): $1 for every $100, or part, to $1,000; $10 plus $2 over $1,000; $30 plus $3 '
  + 'over $2,000; $60 plus $4 over $3,000; at least $5', [band(0, '0', '1', 0), band(1001, '10', '2', 1000), band(2001, '30', '3', 2000),
  band(3001, '60', '4', 3000)], 100, '5');
const TAS = scale('Duties Act 2001 (Tas) s 197(2) to (4): $20 to $600; $3 per $100, or part, to $35,000; $1,050 plus $11 per $100, or part, over '
  + '$35,000 to $40,000; $4 per $100, or part, of the whole value above', [band(0, '20', '0', 0), band(601, '0', '3', 0),
  band(35001, '1050', '11', 35000), band(40001, '0', '4', 0)]);
const TAS_FLEET = scale('Duties Act 2001 (Tas) s 197(3A): a new vehicle with a manufacturer’s fleet discount, $3.50 per $100, or part ($20 to $600)',
  [band(0, '20', '0', 0), band(601, '0', '3.50', 0)]);
const NT = scale('Stamp Duty Act 1978 (NT) Sch 1 cl 6: $3 for every $100, or part', [band(0, '0', '3', 0)]);
const NT_ELECTRIC = scale('Stamp Duty Act 1978 (NT) s 92A: an electric vehicle registered from 1 July 2022 to 30 June 2027, the first $50,000 '
  + 'exempt and $3 for every $100, or part, above', [band(0, '0', '0', 0), band(50001, '0', '3', 50000)]);
/** The ACT categories in the determinations' row order; a non-rated vehicle pays Category C's rates. */
const CATEGORIES = new Map([['aaa', 0], ['aa', 1], ['a', 2], ['b', 3], ['c', 4], ['d', 5], ['non_rated', 4]]);
/** Each determination's rows: Table 1's rate, Table 2's base and rate over $45,000 and Table 3's base over $80,000 (rate $8). */
const ACT = [
  ['Taxation Administration (Amounts Payable—Motor Vehicle Duty) Determination 2025 (DI2025-152) s 6 Tables 1 to 3', [
    ['2.50', '1125.00', '4.00', '2525.00'], ['2.67', '1201.50', '4.41', '2745.00'], ['2.84', '1278.00', '4.81', '2961.50'],
    ['3.00', '1350.00', '5.22', '3177.00'], ['3.17', '1426.50', '5.62', '3393.50'], ['4.53', '2038.50', '7.81', '4772.00']]],
  ['Taxation Administration (Amounts Payable—Motor Vehicle Duty) Determination 2026 (DI2026-154, from 1 February 2027) s 6 Tables 1 to 3', [
    ['2.50', '1125.00', '4.00', '2525.00'], ['2.67', '1201.50', '4.41', '2745.00'], ['2.84', '1278.00', '4.81', '2961.50'],
    ['3.25', '1462.50', '5.59', '3419.00'], ['3.72', '1674.00', '6.44', '3928.00'], ['4.83', '2173.50', '8.00', '4973.50']]],
];

/** @param {number} n */
const int = (n) => dec(BigInt(Math.abs(n)), 0, n < 0);

/**
 * The duty, from the command's call.
 * @param {Record<string, unknown>} call
 * @returns {{year: string, amounts: {duty: string}, rates: Record<string, string>, authority: string, duty: number}}
 */
export function motorVehicleDuty(call) {
  const fields = readFields(call, 'motor-vehicle-duty', PARAMS, OPTIONAL);
  const year = scope(fields, MOTOR_VEHICLE_DUTY_YEARS);
  const value = (/** @type {string} */ key) => field(fields, key).value;
  const place = MOTOR_PLACES.find((p) => p === value('jurisdiction'));
  if (!place) refuse('motor_vehicle_duty.jurisdiction_invalid', 'jurisdiction must be nsw, vic, qld, wa, sa, tas, act or nt.');
  if (value('vehicle_class') !== 'passenger') {
    refuse('motor_vehicle_duty.vehicle_class_unsupported', 'vehicle_class must be passenger: motorcycles, goods and commercial vehicles, buses, heavy '
      + 'vehicles, trailers and special or conditionally registered vehicles are not worked.');
  }
  const first = Number(year.slice(0, 4));
  const day = dateArg(value('duty_date'), 'duty_date');
  if (day < Date.UTC(first, 6, 1) / 86400000 || day > Date.UTC(first + 1, 5, 30) / 86400000) {
    refuse('motor_vehicle_duty.date_outside_year', `duty_date must be in the ${year} financial year.`);
  }
  const given = field(fields, 'dutiable_value');
  money(given.dec);
  const amount = fromInput(/** @type {import('./aa-command.mjs').Dec} */ (given.dec));
  if (!whole(amount)) refuse('input.amount_not_whole_dollars', 'Supply established whole-dollar dutiable values.');
  for (const [key, home, why] of CONDITIONAL) {
    if (home !== place && fields.has(key)) refuse('input.field_unknown', `${key} is an input only ${why}`);
  }
  /** A conditional input of this place: required, then read as a flag or text. @param {string} key @param {string} why */
  const needed = (key, why) => {
    const got = fields.get(key);
    if (!got) refuse('input.missing_field', `${key} is required ${why}.`);
    return got.value;
  };
  const yes = (/** @type {string} */ key, /** @type {string} */ why) => flag(needed(key, why), key);
  const s = place === 'wa' ? null : placeScale(place, day, needed, yes);
  const [step, rates] = s ? banded(s, amount) : westernAustralia(amount);
  return { year, amounts: { duty: cents(step) }, rates, authority: s ? s.authority : WA, duty: Number(cents(step)) };
}

/** @param {string} place @param {number} day @param {(key: string, why: string) => unknown} needed @param {(key: string, why: string) => boolean} yes
 * @returns {Scale} */
function placeScale(place, day, needed, yes) {
  if (place === 'nsw') return NSW;
  if (place === 'sa') return SA;
  if (place === 'vic') {
    const why = 'in Victoria (Duties Act 2000 (Vic) s 218(1) items 1 and 2)';
    const green = yes('green_car', why);
    const primary = yes('primary_producer', why);
    return green || primary ? VIC_CONCESSION : VIC;
  }
  if (place === 'qld') {
    const row = needed('engine', 'in Queensland (Duties Act 2001 (Qld) Sch 4C)');
    const found = QLD.find(([code]) => code === row);
    if (!found) {
      refuse('motor_vehicle_duty.engine_invalid', 'engine must be hybrid_or_electric, up_to_4_cylinders (or 2 rotors or steam), 5_or_6_cylinders '
        + '(or 3 rotors) or 7_or_more_cylinders.');
    }
    return found[1];
  }
  if (place === 'tas') return yes('fleet_discount', 'in Tasmania (Duties Act 2001 (Tas) s 197(3A))') ? TAS_FLEET : TAS;
  if (place === 'nt') return yes('electric', 'in the Northern Territory (Stamp Duty Act 1978 (NT) s 92A)') ? NT_ELECTRIC : NT;
  const why = 'in the ACT (the motor vehicle duty determination’s categories)';
  const category = needed('emissions_category', why);
  const isNew = yes('new_vehicle', why);
  let index = typeof category === 'string' ? CATEGORIES.get(category) : undefined;
  if (index === undefined) refuse('motor_vehicle_duty.emissions_category_invalid', 'emissions_category must be aaa, aa, a, b, c, d or non_rated.');
  if (!isNew && index !== 0) index = 4;
  const [authority, rows] = ACT[day < Date.UTC(2027, 1, 1) / 86400000 ? 0 : 1];
  const [table1, base2, rate2, base3] = rows[index];
  return scale(`Duties Act 1999 (ACT) s 208 and the ${authority}`, [band(0, '0', table1, 0), band(45000, base2, rate2, 45000), band(80000, base3, '8', 80000)]);
}

/** The duty from the band of `s` that holds `value`. @param {Scale} s @param {import('./aa-decimal.mjs').D} value
 * @returns {[import('./aa-decimal.mjs').D, Record<string, string>]} */
function banded(s, value) {
  let found = s.bands[0];
  for (const b of s.bands) if (cmp(value, int(b.from)) >= 0) found = b;
  /** @type {Record<string, string>} */
  const rates = { base: found.base, [`rate_per_${s.per}`]: found.rate, threshold: String(found.over) };
  const share = div(sub(value, int(found.over)), int(s.per));
  const down = quantize(share, 0, 'down');
  const lots = cmp(down, share) < 0 ? add(down, int(1)) : down;
  const charged = mul(lots, lit(found.rate));
  let amount;
  if (found.rate === '0') amount = lit(found.base);
  else if (found.over === 0) amount = charged;
  else amount = add(lit(found.base), charged);
  if (s.minimum) {
    if (cmp(amount, lit(s.minimum)) < 0) amount = lit(s.minimum);
    rates.minimum = s.minimum;
  }
  return [amount, rates];
}

/** Western Australia's s 236(2), rounded down to 5 cents. @param {import('./aa-decimal.mjs').D} value
 * @returns {[import('./aa-decimal.mjs').D, Record<string, string>]} */
function westernAustralia(value) {
  /** @type {Record<string, string>} */
  let rates;
  let percent;
  if (cmp(value, int(25000)) > 0 && cmp(value, int(50000)) <= 0) {
    // 2.75 + (value - 25,000) / 6,666.66 to the cent, half up, worked exactly: 100 x R = 275 + 10,000 (value - 25,000) / 666,666.
    const over = sub(value, int(25000));
    const scaledOver = over.c * 10n ** BigInt(Math.max(over.e, 0)) / 10n ** BigInt(Math.max(-over.e, 0));
    const num = 275n * 666666n + 10000n * scaledOver;
    percent = dec((2n * num + 666666n) / (2n * 666666n), -2);
    rates = { base_rate: '2.75', threshold: '25000', divisor: '6666.66' };
  } else {
    percent = cmp(value, int(50000)) > 0 ? lit('6.5') : lit('2.75');
    rates = { rate_percent: text(percent) };
  }
  rates.rate_applied_percent = text(percent);
  const twenty = int(20);
  const amount = div(quantize(mul(div(mul(value, percent), int(100)), twenty), 0, 'down'), twenty);
  return [amount, rates];
}

/** The form's input as the command's call. @param {(name: string) => string} value */
export function motorVehicleDutyFormInput(value) {
  const place = value('jurisdiction');
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  /** @type {Record<string, unknown>} */
  const call = { jurisdiction: place, vehicle_class: 'passenger', dutiable_value: value('value'), duty_date: value('date'), year: '2026-27',
    scope_confirmed: true };
  if (place === 'qld') call.engine = value('engine');
  if (place === 'vic') Object.assign(call, { green_car: yes('green'), primary_producer: yes('primary') });
  if (place === 'act') Object.assign(call, { emissions_category: value('category'), new_vehicle: yes('new') });
  if (place === 'tas') call.fleet_discount = yes('fleet');
  if (place === 'nt') call.electric = yes('electric');
  return call;
}

/** @param {Record<string, unknown>} x @param {(value: number) => string} aud */
export function motorVehicleDutyInputsText(x, aud) {
  const extra = [x.engine && `engine ${String(x.engine).replaceAll('_', ' ')}`, x.green_car && 'a green car', x.primary_producer && 'a primary producer car',
    x.emissions_category && `category ${String(x.emissions_category).replace('non_rated', 'non-rated').toUpperCase()}`,
    x.jurisdiction === 'act' && (x.new_vehicle ? 'new' : 'used'), x.fleet_discount && 'a fleet discount', x.electric && 'electric'].filter(Boolean);
  return `${String(x.jurisdiction).toUpperCase()}; passenger vehicle; dutiable value ${aud(Number(x.dutiable_value))}; duty date ${x.duty_date}`
    + `${extra.length ? `; ${extra.join(', ')}` : ''}`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function motorVehicleDutyResult(value, aud) {
  const input = motorVehicleDutyFormInput(value);
  const r = motorVehicleDuty(input);
  /** @type {[string, string][]} */
  const rows = [['Dutiable value', aud(Number(input.dutiable_value))]];
  if (r.rates.rate_applied_percent) rows.push(['Rate applied', `${r.rates.rate_applied_percent}%`]);
  rows.push(['Motor vehicle duty', aud(r.duty)]);
  return { inputs: motorVehicleDutyInputsText(input, aud), rows, principal: rows.length - 1, note: r.authority };
}
