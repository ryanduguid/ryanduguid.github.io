// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { ratioCents } from './money.mjs';

// Fuel tax credits for business fuel acquired from 1 July 2022, the `fuel-tax-credits` command of
// ryanduguid/australian-accounting ported line for line: its inputs, rate periods, rounding and
// refusal codes. Read 19 November 2026:
// - Fuel Tax Act 2006 ss 41-5, 41-20, 43-5, 43-10 and 47-5 at the ATO's legal database.
// - The ATO's 'Rates - business' (QC44494, last updated 29 July 2026) and its year pages QC69964,
//   QC72768, QC102637, QC105117 and QC107638: the 16 periods below, 192 rates in cents a litre
//   (LNG and CNG: cents a kilogram), each typed against its page.
// - 'Working out your fuel tax credits' (QC44511): quantity x rate, rounded to the cent; label 7D
//   takes the whole dollars.
// - PCG 2016/2 (small claimants: Method 1, litres from the cost and the average price; Method 2,
//   the rate on the tax period's last day across indexation) and PCG 2021/2 with the ATO's 'Basic
//   method for heavy vehicles' (QC64655, last updated 2 June 2021) and its rigid truck table.
// Entitlement, the use of the fuel and the small claimant test are the user's facts.

export const FTC_RATES_READ = '2026-11-19';
export const FTC_YEARS = ['2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];

/** The ATO's 6 rows of eligible fuel types, in the order each period's rates list them. */
export const FTC_CATEGORIES = ['Liquid fuels, for example diesel or petrol', 'Blended fuels: B5, B20, E10', 'Blended fuel: E85',
  'Liquefied petroleum gas (LPG) (duty paid)', 'Liquefied natural gas (LNG) or compressed natural gas (CNG) (duty paid)', 'B100'];

/** Each fuel a line may name: how the page writes it, its ATO row and its unit. */
export const FTC_FUELS = {
  diesel: { name: 'diesel', row: 0, unit: 'litres' },
  petrol: { name: 'petrol', row: 0, unit: 'litres' },
  b5: { name: 'B5', row: 1, unit: 'litres' },
  b20: { name: 'B20', row: 1, unit: 'litres' },
  e10: { name: 'E10', row: 1, unit: 'litres' },
  e85: { name: 'E85', row: 2, unit: 'litres' },
  lpg: { name: 'LPG', row: 3, unit: 'litres' },
  lng_cng: { name: 'LNG or CNG', row: 4, unit: 'kilograms' },
  b100: { name: 'B100', row: 5, unit: 'litres' },
};

/** How the page writes each use. */
export const FTC_USES = {
  heavy_vehicle_public_road: 'heavy vehicle on a public road',
  other_business: 'other business use',
  light_vehicle_public_road: 'vehicle of 4.5 tonnes GVM or less on a public road',
};

/** Why a period's rates start: Method 2 may span only indexation. */
const STARTS = {
  financial_year: 'a new financial year',
  indexation: 'indexation',
  excise_relief: 'the excise reduction from 1 April 2026',
  excise_relief_ended: 'the end of the excise reduction of 30 March to 28 September 2022',
  indexation_and_excise_relief_ended: 'indexation, the end of the 30.4% excise reduction and the road user charge of 32.4 cents a litre',
};

// From, to, why it starts, the ATO page and table, then the heavy vehicle on a public road and
// the all other business uses rates for each of the 6 rows. The ATO gives the last period no end;
// rates are indexed in February and August, so it is held only to 31 January 2027.
/** @type {[string, string, keyof typeof STARTS, string, string, string[], string[]][]} */
const PERIODS = [
  ['2022-07-01', '2022-07-31', 'financial_year', 'QC69964', 'Table 4', ['0', '0', '0', '0', '0', '0'], ['22.1', '22.1', '9.435', '7.2', '15.2', '5.2']],
  ['2022-08-01', '2022-09-28', 'indexation', 'QC69964', 'Table 3', ['0', '0', '0', '0', '0', '0'], ['23.0', '23.0', '9.825', '7.5', '15.8', '5.4']],
  ['2022-09-29', '2023-01-31', 'excise_relief_ended', 'QC69964', 'Table 2', ['18.8', '18.8', '0', '0', '0', '0'], ['46.0', '46.0', '19.735', '15.0', '31.5', '10.7']],
  ['2023-02-01', '2023-06-30', 'indexation', 'QC69964', 'Table 1', ['20.5', '20.5', '0', '0', '0', '0'], ['47.7', '47.7', '20.415', '15.6', '32.7', '11.1']],
  ['2023-07-01', '2023-07-31', 'financial_year', 'QC72768', 'Table 3', ['18.9', '18.9', '0', '0', '0', '0'], ['47.7', '47.7', '20.415', '15.6', '32.7', '12.7']],
  ['2023-08-01', '2024-02-04', 'indexation', 'QC72768', 'Table 2', ['20.0', '20.0', '0', '0', '0', '0'], ['48.8', '48.8', '20.92', '15.9', '33.4', '13.0']],
  ['2024-02-05', '2024-06-30', 'indexation', 'QC72768', 'Table 1', ['20.8', '20.8', '0', '0', '0', '0'], ['49.6', '49.6', '21.295', '16.2', '34.0', '13.2']],
  ['2024-07-01', '2024-08-04', 'financial_year', 'QC102637', 'Table 3', ['19.1', '19.1', '0', '0', '0', '0'], ['49.6', '49.6', '21.295', '16.2', '34.0', '14.9']],
  ['2024-08-05', '2025-02-02', 'indexation', 'QC102637', 'Table 2', ['20.1', '20.1', '0', '0', '0', '0'], ['50.6', '50.6', '21.7', '16.5', '34.7', '15.2']],
  ['2025-02-03', '2025-06-30', 'indexation', 'QC102637', 'Table 1', ['20.3', '20.3', '0', '0', '0', '0'], ['50.8', '50.8', '21.73', '16.6', '34.8', '15.2']],
  ['2025-07-01', '2025-08-03', 'financial_year', 'QC105117', 'Table 4', ['18.4', '18.4', '0', '0', '0', '0'], ['50.8', '50.8', '21.73', '16.6', '34.8', '16.9']],
  ['2025-08-04', '2026-02-01', 'indexation', 'QC105117', 'Table 3', ['19.2', '19.2', '0', '0', '0', '0'], ['51.6', '51.6', '22.105', '16.9', '35.4', '17.2']],
  ['2026-02-02', '2026-03-31', 'indexation', 'QC105117', 'Table 2', ['20.2', '20.2', '0', '0', '0', '0'], ['52.6', '52.6', '22.510', '17.2', '36.0', '17.5']],
  ['2026-04-01', '2026-06-30', 'excise_relief', 'QC105117', 'Table 1', ['20.6', '20.6', '8.870', '6.8', '14.1', '6.9'], ['20.6', '20.6', '8.870', '6.8', '14.1', '6.9']],
  ['2026-07-01', '2026-08-02', 'financial_year', 'QC107638', 'Table 2', ['20.2', '20.2', '0', '0', '3.2', '0'], ['36.6', '36.6', '15.690', '12.0', '25.1', '13.4']],
  ['2026-08-03', '2027-01-31', 'indexation_and_excise_relief_ended', 'QC107638', 'Table 1', ['21.3', '21.3', '0', '0', '0', '0'], ['53.7', '53.7', '23.015', '17.5', '36.8', '19.7']],
];

export const FTC_PERIODS = PERIODS.map(([from, to, starts, page, table, heavy, other]) => ({ from, to, starts, page, table, heavy, other }));
export const FTC_LAST_DAY = PERIODS[PERIODS.length - 1][1];

// The rigid truck diesel consumption rates in litres a kilometre, by the top of each gross weight
// class in tonnes (QC64655 Table 1, from PCG 2021/2 Schedule 1); the last class has no top.
const RIGID_TRUCKS = [['12', '0.18'], ['16.5', '0.23'], ['24', '0.28'], ['30', '0.32'], [null, '0.35']];
const MAX_LINES = 1000;

/** A refusal with the command's code. @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

const DAY = 86400000;
/** @param {string} iso */
const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;
/** @param {number} day */
const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** 19 November 2026. @param {string} iso */
export const plainDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A YYYY-MM-DD date that exists, as a day number. @param {unknown} value @param {string} what */
function dateOf(value, what) {
  const text = typeof value === 'string' ? value : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(dayOf(text)) || isoOf(dayOf(text)) !== text) {
    refuse('input.date_invalid', `Enter ${what} as a date that exists, YYYY-MM-DD.`);
  }
  return dayOf(text);
}

/** A decimal string scaled to a whole number of 10^-places, at most 10^12.
 * @param {unknown} value @param {number} places */
function scaled(value, places) {
  const parts = typeof value === 'string' && value.length <= 32 ? /^(\d+)(?:\.(\d+))?$/.exec(value) : null;
  if (!parts || (parts[2] ?? '').length > places) return null;
  const whole = BigInt(parts[1] + (parts[2] ?? '').padEnd(places, '0'));
  return whole > 10n ** BigInt(12 + places) ? null : whole;
}

/** A rate in cents as a whole number of thousandths of a cent. @param {string} text */
const milli = (text) => /** @type {bigint} */ (scaled(text, 3));

/** An exact value of `numerator` / 10^places, without trailing zeros. @param {bigint} numerator @param {number} places */
function decimal(numerator, places) {
  const text = numerator.toString().padStart(places + 1, '0');
  const point = text.length - places;
  return `${text.slice(0, point)}.${text.slice(point)}`.replace(/\.?0+$/, '');
}

/** @param {Record<string, unknown>} fields @param {number} n @param {string} key @param {string} what @param {number} places */
function quantity(fields, n, key, what, places) {
  if (!Object.hasOwn(fields, key)) refuse('input.missing_field', `Line ${n}: enter ${what}.`);
  const value = scaled(fields[key], places);
  if (value === null) {
    refuse('fuel_tax_credits.quantity_invalid', `Line ${n}: enter ${what} as a number of 0 or more, at most 1,000,000,000,000 with no more than ${places} decimal places.`);
  }
  return value;
}

/** @param {Record<string, unknown>} fields @param {number} n @param {string[]} keys */
function oneOf(fields, n, keys) {
  const given = keys.filter((key) => Object.hasOwn(fields, key));
  if (given.length !== 1) refuse('fuel_tax_credits.fact_conflict', `Line ${n}: give exactly one of ${keys.join(' and ')}.`);
  return given[0];
}

const FIELDS = {
  quantity: ['fuel', 'use', 'acquired', 'quantity'],
  litres_from_cost: ['method', 'fuel', 'use', 'acquired', 'cost', 'average_price_cents_per_litre'],
  basic_heavy_vehicle: ['method', 'fuel', 'acquired', 'litres', 'public_road_km', 'total_km', 'rigid_truck_gross_weight_tonnes', 'litres_per_km'],
};
/** The liquid taxable fuels PCG 2016/2 covers (para 4(b)). */
const LIQUID = ['diesel', 'petrol', 'b5', 'b20', 'e10', 'e85', 'b100'];

/** A line's checked facts: quantities as whole numbers of 10^-4 (litres, kilometres given,
 * average price in cents), cost in cents, kilometres worked in 10^-7 and litres a kilometre in 10^-6.
 * @typedef {{n: number, fuel: keyof typeof FTC_FUELS, name: string, row: number, unit: string, acquired: number,
 *   method: 'quantity' | 'litres_from_cost' | 'basic_heavy_vehicle', use: keyof typeof FTC_USES | 'basic', quantity?: bigint,
 *   cost?: bigint, price?: bigint, litres?: bigint, km?: bigint, kmBasis?: string, rate?: bigint, rateBasis?: string}} FtcLine */

/** The diesel consumption rate in millionths of a litre a kilometre, and its basis.
 * @param {Record<string, unknown>} fields @param {number} n */
function consumption(fields, n) {
  if (oneOf(fields, n, ['rigid_truck_gross_weight_tonnes', 'litres_per_km']) === 'litres_per_km') {
    const rate = quantity(fields, n, 'litres_per_km', 'the litres a kilometre', 6);
    if (rate === 0n) refuse('fuel_tax_credits.quantity_invalid', `Line ${n}: the litres a kilometre must be above 0.`);
    return { rate, rateBasis: 'the engine’s diagnostic ‘driving fuel’ economy (PCG 2021/2 paragraph 9)' };
  }
  const weight = quantity(fields, n, 'rigid_truck_gross_weight_tonnes', 'the rigid truck’s gross weight in tonnes', 3);
  if (weight <= 4500n) {
    refuse('fuel_tax_credits.simplified_method_unavailable',
      `Line ${n}: a rigid truck of 4.5 tonnes or less is not a heavy vehicle, so the basic method does not apply (PCG 2021/2 paragraph 4).`);
  }
  const [, rate] = /** @type {[string | null, string]} */ (RIGID_TRUCKS.find(([top]) => top === null || weight <= milli(top)));
  return { rate: /** @type {bigint} */ (scaled(rate, 6)), rateBasis: 'the rigid truck rate for its gross weight (QC64655 Table 1, from PCG 2021/2 Schedule 1)' };
}

/** One line's checked facts. @param {unknown} value @param {number} n @returns {FtcLine} */
function parseLine(value, n) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) refuse('fuel_tax_credits.lines_invalid', `Line ${n} is not a line.`);
  const fields = /** @type {Record<string, unknown>} */ (value);
  const method = Object.hasOwn(fields, 'method') ? fields.method : 'quantity';
  if (method !== 'litres_from_cost' && method !== 'basic_heavy_vehicle' && method !== 'quantity') {
    return refuse('fuel_tax_credits.method_invalid', `Line ${n}: the method must be basic_heavy_vehicle or litres_from_cost.`);
  }
  const unknown = Object.keys(fields).find((key) => !FIELDS[method].includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `Line ${n}: ${unknown} is not an input of this line.`);
  if (!Object.hasOwn(fields, 'fuel')) refuse('input.missing_field', `Line ${n}: choose the fuel.`);
  const fuel = /** @type {keyof typeof FTC_FUELS} */ (fields.fuel);
  const allowed = method === 'quantity' ? Object.keys(FTC_FUELS) : method === 'basic_heavy_vehicle' ? ['diesel'] : LIQUID;
  if (typeof fuel !== 'string' || !allowed.includes(fuel)) {
    if (method === 'quantity') refuse('fuel_tax_credits.fuel_invalid', `Line ${n}: choose one of the ATO’s eligible fuels.`);
    refuse('fuel_tax_credits.simplified_method_unavailable', method === 'basic_heavy_vehicle'
      ? `Line ${n}: the basic method for heavy vehicles is for diesel only (PCG 2021/2 paragraph 5).`
      : `Line ${n}: PCG 2016/2 Method 1 is for liquid fuels only (paragraph 4(b)), not LPG, LNG or CNG.`);
  }
  if (!Object.hasOwn(fields, 'acquired')) refuse('input.missing_field', `Line ${n}: enter the day the fuel was acquired.`);
  const acquired = dateOf(fields.acquired, `line ${n}’s acquisition day`);
  const line = { n, fuel, acquired, method, ...FTC_FUELS[fuel] };
  if (method === 'basic_heavy_vehicle') {
    const litres = quantity(fields, n, 'litres', 'the litres of diesel', 4);
    // Kilometres in ten-millionths, so 98.4% of a kilometre to 4 places stays exact.
    const km = oneOf(fields, n, ['public_road_km', 'total_km']) === 'public_road_km'
      ? { km: quantity(fields, n, 'public_road_km', 'the public road kilometres', 4) * 1000n, kmBasis: 'actual' }
      : { km: quantity(fields, n, 'total_km', 'the total kilometres', 4) * 984n, kmBasis: 'derived: total kilometres × 98.4%' };
    return { ...line, use: 'basic', litres, ...km, ...consumption(fields, n) };
  }
  if (!Object.hasOwn(fields, 'use')) refuse('input.missing_field', `Line ${n}: choose the use.`);
  const use = /** @type {keyof typeof FTC_USES} */ (fields.use);
  if (typeof use !== 'string' || !Object.hasOwn(FTC_USES, use)) refuse('fuel_tax_credits.use_invalid', `Line ${n}: choose the use.`);
  if (method === 'quantity') return { ...line, use, quantity: quantity(fields, n, 'quantity', `the ${line.unit}`, 4) };
  if (!Object.hasOwn(fields, 'cost')) refuse('input.missing_field', `Line ${n}: enter the cost of the fuel.`);
  const cost = scaled(fields.cost, 2);
  if (cost === null) refuse('input.amount_invalid', `Line ${n}: enter the GST inclusive cost as an amount of 0 or more with no more than 2 decimal places.`);
  const price = quantity(fields, n, 'average_price_cents_per_litre', 'the average price in cents a litre', 4);
  if (price === 0n) refuse('fuel_tax_credits.quantity_invalid', `Line ${n}: the average price must be above 0.`);
  return { ...line, use, cost, price };
}

/** The rate period that holds `day`. @param {number} day */
const periodOn = (day) => /** @type {typeof FTC_PERIODS[number]} */ (FTC_PERIODS.find((p) => dayOf(p.from) <= day && day <= dayOf(p.to)));

/** PCG 2016/2 Method 2's tax period, checked; its last day sets every line's rate.
 * @param {unknown} given @param {[number, number]} year @param {FtcLine[]} lines */
function periodEnd(given, year, lines) {
  if (given === null || typeof given !== 'object' || Array.isArray(given)) {
    refuse('fuel_tax_credits.period_invalid', 'Give the tax period’s first and last days for the rate at its end.');
  }
  const fields = /** @type {Record<string, unknown>} */ (given);
  const unknown = Object.keys(fields).find((key) => key !== 'start' && key !== 'end');
  if (unknown !== undefined) refuse('input.field_unknown', `The tax period takes a start and an end, not ${unknown}.`);
  const start = dateOf(fields.start ?? '', 'the tax period’s first day');
  const end = dateOf(fields.end ?? '', 'the tax period’s last day');
  if (start > end || start < year[0] || end > year[1]) {
    refuse('fuel_tax_credits.fact_conflict', 'The tax period must start on or before it ends and lie inside the income year.');
  }
  if (end > dayOf(FTC_LAST_DAY)) {
    refuse('fuel_tax_credits.rate_unpublished', `No published rate is held for ${plainDate(isoOf(end))}, the tax period’s last day; the rates change at the February 2027 indexation.`);
  }
  for (const line of lines) {
    if (line.acquired < start || line.acquired > end) {
      refuse('fuel_tax_credits.fact_conflict', `Line ${line.n} was acquired outside the tax period; PCG 2016/2 Method 2 takes the fuel acquired in the period.`);
    }
    if (line.fuel === 'lpg' || line.fuel === 'lng_cng') {
      refuse('fuel_tax_credits.simplified_method_unavailable', `Line ${line.n}: PCG 2016/2 covers liquid fuels only (paragraph 4(b)), not ${line.name}.`);
    }
  }
  const change = FTC_PERIODS.find((p) => dayOf(p.from) > start && dayOf(p.from) <= end && p.starts !== 'indexation');
  if (change) {
    refuse('fuel_tax_credits.simplified_method_unavailable', `The rates change on ${plainDate(change.from)} for a reason other than indexation `
      + `alone (${STARTS[change.starts]}), so PCG 2016/2 Method 2 (paragraph 11: ‘because of indexation’) does not apply: give each line’s own acquisition day instead.`);
  }
  return end;
}

/** One line's credit in cents and how it was worked. @param {FtcLine} line @param {number} rateDay */
function workLine(line, rateDay) {
  const period = periodOn(rateDay);
  const heavy = period.heavy[line.row];
  const other = period.other[line.row];
  const base = { line: line.n, fuel: line.fuel, unit: line.unit, acquired: isoOf(line.acquired), rateDay: isoOf(rateDay),
    period: { from: period.from, to: period.to, page: period.page, table: period.table } };
  if (line.use === 'basic') {
    const [litres, km, rate] = /** @type {bigint[]} */ ([line.litres, line.km, line.rate]);
    // Public road litres in 10^-13 litres: kilometres in 10^-7 times litres a kilometre in 10^-6.
    const publicLitres = km * rate;
    const all = litres * 10n ** 9n;
    if (publicLitres > all) {
      refuse('fuel_tax_credits.fact_conflict', `Line ${line.n}: the public road litres (${decimal(km, 7)} km × ${decimal(rate, 6)} L/km = `
        + `${decimal(publicLitres, 13)}) exceed the ${decimal(litres, 4)} litres of diesel; check the kilometres and the consumption rate.`);
    }
    const publicCredit = ratioCents(publicLitres * milli(heavy), 10n ** 16n);
    const otherCredit = ratioCents((all - publicLitres) * milli(other), 10n ** 16n);
    return { ...base, method: 'basic_heavy_vehicle', litres: decimal(litres, 4), publicRoadKm: decimal(km, 7),
      kmBasis: line.kmBasis, litresPerKm: decimal(rate, 6), rateBasis: line.rateBasis, publicRoadLitres: decimal(publicLitres, 13), otherLitres: decimal(all - publicLitres, 13),
      publicRoadRate: heavy, otherRate: other, publicRoadCredit: Number(publicCredit) / 100, otherCredit: Number(otherCredit) / 100,
      cents: publicCredit + otherCredit };
  }
  const rate = line.use === 'heavy_vehicle_public_road' ? heavy : line.use === 'other_business' ? other : '0';
  const rateCents = decimal(milli(rate), 3) || '0';
  if (line.method === 'litres_from_cost') {
    const [cost, price] = /** @type {bigint[]} */ ([line.cost, line.price]);
    // Litres = cost in cents / price in 10^-4 cents a litre x 10^4; the credit uses the exact quotient.
    const cents = ratioCents(cost * milli(rate) * 10n, price);
    return { ...base, method: 'litres_from_cost', use: line.use, cost: Number(cost) / 100, averagePrice: decimal(price, 4),
      quantity: (Number(ratioCents(cost * 10n ** 8n, price)) / 10000).toFixed(4), rateCents, cents };
  }
  const q = /** @type {bigint} */ (line.quantity);
  return { ...base, method: 'quantity', use: line.use, quantity: decimal(q, 4) || '0', rateCents, cents: ratioCents(q * milli(rate), 10n ** 7n) };
}

/** @typedef {{year: string, lines: unknown, small_claimant?: unknown, rate_at_period_end?: unknown, return_date?: unknown}} FtcInput */

/** The fuel tax credits for one income year's fuel lines, as the `fuel-tax-credits` command works them.
 * @param {FtcInput} input */
export function fuelTaxCredits(input) {
  const unknown = Object.keys(input).find((key) => !['year', 'lines', 'small_claimant', 'rate_at_period_end', 'return_date'].includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an input.`);
  if (!FTC_YEARS.includes(input.year)) refuse('period.unsupported', 'Choose an income year from 2022-23 to 2026-27.');
  const first = Number(input.year.slice(0, 4));
  const year = /** @type {[number, number]} */ ([dayOf(`${first}-07-01`), dayOf(`${first + 1}-06-30`)]);
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > MAX_LINES) {
    refuse('fuel_tax_credits.lines_invalid', `Enter from 1 to ${MAX_LINES} fuel lines.`);
  }
  const lines = input.lines.map((line, i) => parseLine(line, i + 1));
  for (const line of lines) {
    if (line.acquired < year[0] || line.acquired > year[1]) {
      refuse('fuel_tax_credits.date_outside_year', `Line ${line.n} was acquired outside the income year ${input.year}; work each income year apart.`);
    }
    if (line.acquired > dayOf(FTC_LAST_DAY)) {
      refuse('fuel_tax_credits.rate_unpublished', `Line ${line.n}: no published rate is held for fuel acquired after ${plainDate(FTC_LAST_DAY)}; `
        + `the rates change at the February 2027 indexation and were not published when this page was checked on ${plainDate(FTC_RATES_READ)}.`);
    }
  }
  const simplified = lines.some((l) => l.method !== 'quantity') || input.rate_at_period_end !== undefined;
  if (simplified && input.small_claimant === undefined) {
    refuse('input.missing_field', 'Say whether the business is a small claimant: the basic method and Methods 1 and 2 are for small claimants only.');
  }
  if (input.small_claimant !== undefined) {
    if (!simplified) refuse('input.field_unknown', 'The small claimant answer is an input only with the basic method or Method 1 or 2.');
    if (typeof input.small_claimant !== 'boolean') refuse('input.flag_invalid', 'Answer the small claimant question yes or no.');
    if (!input.small_claimant) {
      refuse('fuel_tax_credits.simplified_method_unavailable', 'The simplified methods are for a business whose fuel tax credits were $10,000 or less '
        + 'in the previous 12 months and are expected to be in the current 12 months (PCG 2016/2 paragraph 4; PCG 2021/2 paragraph 6).');
    }
  }
  const end = input.rate_at_period_end === undefined ? null : periodEnd(input.rate_at_period_end, year, lines);
  const worked = lines.map((line) => workLine(line, end ?? line.acquired));
  const cents = worked.reduce((sum, line) => sum + line.cents, 0n);
  const warnings = [];
  if (end !== null) warnings.push(`PCG 2016/2 Method 2: every line takes the rate in force on ${plainDate(isoOf(end))}, the tax period’s last day (paragraph 11).`);
  if (lines.some((line) => line.acquired > dayOf(FTC_RATES_READ))) {
    warnings.push(`Some fuel was acquired after ${plainDate(FTC_RATES_READ)}, when the rates were last read: check the ATO’s fuel tax credit rates for business for a change since.`);
  }
  /** @type {number[] | null} */
  let timeLimitLines = null;
  if (input.return_date !== undefined) {
    const day = dateOf(input.return_date, 'the day the return is given');
    timeLimitLines = [];
    for (const line of lines) {
      if (day < line.acquired) refuse('fuel_tax_credits.fact_conflict', `Line ${line.n}: the return is given before the fuel was acquired.`);
      const acquired = isoOf(line.acquired);
      if (day > dayOf(`${Number(acquired.slice(0, 4)) + 4}${acquired.slice(4)}`)) timeLimitLines.push(line.n);
    }
    if (timeLimitLines.length) {
      warnings.push(`Fuel Tax Act 2006 subsection 47-5(2): the entitlement for line ${timeLimitLines.join(', ')} ceases unless a return taking it into `
        + `account is given within 4 years after the day of acquisition, and the return is given on ${plainDate(isoOf(day))}. That does not apply to `
        + 'a credit already taken into account in an assessment (Linfox Australia Pty Ltd v Commissioner of Taxation [2019] FCAFC 131; MT 2024/1) '
        + 'or to the section 47-10 exception; otherwise leave those lines out.');
    }
  }
  return { lines: worked.map(({ cents: c, ...line }) => ({ ...line, credit: Number(c) / 100 })), total: Number(cents) / 100,
    label7d: Number(cents / 100n), warnings, timeLimitLines };
}

const FORM_LINES = 4;
const blank = (/** @type {string} */ text) => text.trim() === '';

/** The command's input from the form's fields: each line with a fuel chosen, and the heavy vehicle
 * when its litres are entered. @param {(name: string) => string} value */
export function fuelFormInput(value) {
  const lines = [];
  for (let i = 1; i <= FORM_LINES; i += 1) {
    const fuel = value(`fuel-${i}`);
    if (fuel === '') continue;
    const [quantity, cost, price] = [`quantity-${i}`, `cost-${i}`, `price-${i}`].map(value);
    const line = { fuel, use: value(`use-${i}`), acquired: value(`acquired-${i}`) };
    if (!blank(quantity) && (!blank(cost) || !blank(price))) {
      throw new Error(`Line ${i}: enter the ${FTC_FUELS[/** @type {keyof typeof FTC_FUELS} */ (fuel)]?.unit ?? 'quantity'}, or the cost and the average price, not both.`);
    }
    if (!blank(quantity)) lines.push({ ...line, quantity });
    else if (!blank(cost) || !blank(price)) lines.push({ method: 'litres_from_cost', ...line, cost, average_price_cents_per_litre: price });
    else throw new Error(`Line ${i}: enter the quantity, or the cost and the average price.`);
  }
  const vehicle = ['litres', 'public-km', 'total-km', 'weight', 'per-km'].map((name) => value(`basic-${name}`));
  if (vehicle.some((text) => !blank(text))) {
    const [litres, publicKm, totalKm, weight, perKm] = vehicle;
    lines.push({ method: 'basic_heavy_vehicle', fuel: 'diesel', acquired: value('basic-acquired'), litres,
      ...(blank(publicKm) ? {} : { public_road_km: publicKm }), ...(blank(totalKm) ? {} : { total_km: totalKm }),
      ...(blank(weight) ? {} : { rigid_truck_gross_weight_tonnes: weight }), ...(blank(perKm) ? {} : { litres_per_km: perKm }) });
  }
  const [start, end, returned] = ['period-start', 'period-end', 'return-date'].map(value);
  /** @type {FtcInput} */
  const input = { year: value('year'), lines };
  if (!blank(start) || !blank(end)) input.rate_at_period_end = { start, end };
  if (lines.some((line) => 'method' in line) || input.rate_at_period_end) input.small_claimant = value('small-claimant') === 'yes';
  if (!blank(returned)) input.return_date = returned;
  return input;
}

const number = (/** @type {string} */ text) => {
  const [whole, part] = text.split('.');
  return `${Number(whole).toLocaleString('en-AU')}${part ? `.${part}` : ''}`;
};
const quantityText = (/** @type {string} */ q, /** @type {string} */ unit) => `${number(q)} ${q === '1' ? unit.slice(0, -1) : unit}`;
const rateText = (/** @type {string} */ cents, /** @type {string} */ unit) => `${cents} cents a ${unit === 'kilograms' ? 'kilogram' : 'litre'}`;

/** How the page writes the form's input. @param {FtcInput} input @param {(value: number) => string} aud */
export function fuelInputsText(input, aud) {
  const lines = /** @type {Record<string, string>[]} */ (input.lines).map((l, i) => {
    const fuel = FTC_FUELS[/** @type {keyof typeof FTC_FUELS} */ (l.fuel)];
    const acquired = `acquired ${plainDate(l.acquired)}`;
    if (l.method === 'basic_heavy_vehicle') {
      return `heavy vehicle (basic method): ${quantityText(l.litres, 'litres')} of diesel ${acquired}, `
        + `${l.public_road_km ? `${number(l.public_road_km)} public road km` : `${number(l.total_km)} km in total`}, `
        + `${l.litres_per_km ? `${l.litres_per_km} L/km` : `a ${l.rigid_truck_gross_weight_tonnes} tonne rigid truck`}`;
    }
    const what = l.method === 'litres_from_cost' ? `${aud(Number(l.cost))} of ${fuel.name} at an average ${l.average_price_cents_per_litre} cents a litre`
      : `${quantityText(l.quantity, fuel.unit)} of ${fuel.name}`;
    return `line ${i + 1}: ${what} ${acquired}, ${FTC_USES[/** @type {keyof typeof FTC_USES} */ (l.use)]}`;
  });
  const period = /** @type {{start: string, end: string} | undefined} */ (input.rate_at_period_end);
  return [input.year, ...lines, period && `the rate on the last day of the tax period ${plainDate(period.start)} to ${plainDate(period.end)}`,
    input.return_date !== undefined && `return given ${plainDate(/** @type {string} */ (input.return_date))}`].filter(Boolean).join('; ');
}

/** The page's result: a row for each line's credit, the total and label 7D.
 * @param {(name: string) => string} value @param {(value: number) => string} aud */
export function fuelTaxCreditsResult(value, aud) {
  const input = fuelFormInput(value);
  const r = fuelTaxCredits(input);
  const rows = [];
  for (const l of r.lines) {
    const rated = `${rateText(l.rateCents ?? '', l.unit)} from ${plainDate(l.period.from)}`;
    if (l.method === 'basic_heavy_vehicle') {
      rows.push([`Heavy vehicle: ${quantityText(l.publicRoadLitres ?? '', 'litres')} on public roads (${number(l.publicRoadKm ?? '')} km × ${l.litresPerKm} L/km) at `
        + `${rateText(l.publicRoadRate ?? '', 'litres')}`, aud(l.publicRoadCredit ?? 0)],
      [`Heavy vehicle: the other ${quantityText(l.otherLitres ?? '', 'litres')} at ${rateText(l.otherRate ?? '', 'litres')}`, aud(l.otherCredit ?? 0)]);
      continue;
    }
    const from = l.method === 'litres_from_cost' ? ` worked out from the cost (PCG 2016/2 Method 1)` : '';
    rows.push([`Line ${l.line}: ${quantityText(l.quantity ?? '', l.unit)}${from}, ${FTC_USES[/** @type {keyof typeof FTC_USES} */ (l.use)]}, at ${rated}`, aud(l.credit)]);
  }
  rows.push(['Fuel tax credits', aud(r.total)], ['Label 7D on the BAS, in whole dollars', aud(r.label7d)]);
  const note = r.warnings.length ? r.warnings.join(' ').replace(/\.$/, '') : undefined;
  return { inputs: fuelInputsText(input, aud), rows, principal: rows.length - 1, note };
}
