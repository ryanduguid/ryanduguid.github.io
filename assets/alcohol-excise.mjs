// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Excise duty on beer, spirits and other excisable beverages entered for home consumption from 1 July 2022,
// line by line at the rate in force on the day, with the remission for alcohol manufacturers under its
// financial year cap and the refund of duty paid where that remission was available: the `alcohol-excise`
// command of ryanduguid/australian-accounting (main at e1f5bee) ported line for line, with its inputs, rates,
// rounding and refusal codes in the order the command checks them. The command read, on 22 November 2026, the
// Excise Tariff Act 1921 compilation 58 (1 July 2026), the Excise Act 1901 compilation 69 (27 August 2026), the
// Excise Regulation 2015 compilations 4, 5 and 6, the ATO's Excise guidelines for the alcohol industry
// chapter 6 and its pages QC63603, QC63605 ('Excise duty rates for alcohol', updated 29 July 2026) and QC65935,
// and each Notice of Substituted Rates of Excise Duty below (Excise Tariff Act 1921 s 6A(9)).
// Litres of alcohol are held in billionths of a litre and duty in thousandths of a dollar, so each step is exact.

import { dateArg, field, flag, formatDay, money, parseDate, parseDecimal, readFields, refuse, scope, shownCents } from './aa-command.mjs';

export const ALCOHOL_YEARS = ['2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
const PARAMS = /** @type {const} */ ([['lines', 'raw'], ['year', 'raw'], ['scope_confirmed', 'raw']]);
const OPTIONAL = /** @type {const} */ ([['remission_used_this_year', 'dec'], ['manufacturer_from', 'raw'], ['duty_paid', 'raw']]);
const MAX_LINES = 1000;
export const RATES_READ = '2026-11-22';
/** The Schedule subitems with a rate, in the rate rows' order. */
export const SUBITEMS = ['1.1', '1.2', '1.5', '1.6', '1.10', '1.11', '1.15', '1.16', '2', '3.1', '3.2', '3.10'];
/** Each notice's rates in dollars per litre of alcohol, for the subitems in order, and the days they apply to here. */
export const ALCOHOL_PERIODS = [
  ['2022-07-01', '2022-07-31', 'C2022G00070', '46.02 9.20 53.59 28.82 53.59 37.76 3.24 3.73 90.78 84.78 90.78 90.78'],
  ['2022-08-01', '2023-01-31', 'C2022G00663', '47.86 9.57 55.73 29.97 55.73 39.27 3.37 3.88 94.41 88.17 94.41 94.41'],
  ['2023-02-01', '2023-07-31', 'C2023G00124', '49.63 9.92 57.79 31.08 57.79 40.72 3.49 4.02 97.90 91.43 97.90 97.90'],
  ['2023-08-01', '2024-02-04', 'C2023G00894', '50.72 10.14 59.06 31.76 59.06 41.62 3.57 4.11 100.05 93.44 100.05 100.05'],
  ['2024-02-05', '2024-08-04', 'C2024G00102', '51.63 10.32 60.12 32.33 60.12 42.37 3.63 4.18 101.85 95.12 101.85 101.85'],
  ['2024-08-05', '2025-02-02', 'C2024G00457', '52.66 10.53 61.32 32.98 61.32 43.22 3.70 4.26 103.89 97.02 103.89 103.89'],
  ['2025-02-03', '2025-08-03', 'C2025G00050', '52.87 10.57 61.57 33.11 61.57 43.39 3.71 4.28 104.31 97.41 104.31 104.31'],
  ['2025-08-04', '2026-02-01', 'C2025G00377', '53.72 10.57 62.56 33.11 62.56 43.39 3.77 4.35 105.98 98.97 105.98 105.98'],
  ['2026-02-02', '2026-08-02', 'C2026G00056', '54.74 10.57 63.75 33.11 63.75 43.39 3.84 4.43 107.99 100.85 107.99 107.99'],
  ['2026-08-03', '2027-01-31', 'C2026G00508', '55.83 10.57 65.03 33.11 65.03 43.39 3.92 4.52 110.15 102.87 110.15 110.15'],
].map(([from, to, notice, row]) => ({ from: /** @type {number} */ (parseDate(from)), to: /** @type {number} */ (parseDate(to)),
  notice, rates: new Map(row.split(' ').map((rate, i) => [/** @type {string} */ (SUBITEMS[i]), rate])) }));
const LAST = ALCOHOL_PERIODS[ALCOHOL_PERIODS.length - 1].to;

const PRODUCTS = ['beer', 'brandy', 'spirit', 'other_excisable_beverage'];
const REFUSED = new Map([
  ['wine', ['alcohol_excise.not_excisable', 'wine is not an excisable beverage; it bears wine equalisation tax: use the wine equalisation tax calculator.']],
  ['tobacco', ['alcohol_excise.product_out_of_scope', 'tobacco (Schedule item 5) is outside this calculator, which covers items 1 to 3 only.']],
  ['fuel', ['alcohol_excise.product_out_of_scope', 'fuel (Schedule item 10) is outside this calculator, which covers items 1 to 3 only.']],
  ['concessional_spirit', ['alcohol_excise.product_out_of_scope', 'spirit under subitems 3.5 to 3.8 is free only under an approval or '
    + 'determination (Excise Act 1901 ss 77FD to 77FG), a licensing question this calculator does not decide.']],
  ['non_commercial', ['alcohol_excise.not_excisable', 'liquor produced for non-commercial purposes using non-commercial facilities and '
    + 'equipment, other than liquor that is or contains distilled spirit, is outside Schedule items 1 to 3.']],
]);
const COMMON = ['date', 'product', 'volume_litres', 'strength_percent', 'labelled_strength_percent', 'remission', 'imported'];
const BEER = ['container_litres', 'pressurised_system', 'brew_on_premises'];

/** A line's decimal field above 0, at most `max` and `places` places, scaled to whole units of 10^-places; null when absent.
 * @param {Map<string, unknown>} line @param {number} n @param {string} key @param {bigint} max @param {number} places */
function quantity(line, n, key, max, places) {
  if (!line.has(key)) return null;
  const value = line.get(key);
  const dec = typeof value === 'string' && value.length <= 32 ? parseDecimal(value) : null;
  const scaled = dec?.finite && -dec.exponent <= places ? dec.coefficient * 10n ** BigInt(places + dec.exponent) : null;
  if (scaled === null || (dec?.finite && dec.negative) || scaled <= 0n || scaled > max * 10n ** BigInt(places)) {
    refuse('alcohol_excise.quantity_invalid', `line ${n}: ${key} must be a decimal string above 0, at most ${max} and ${places} decimal places.`);
  }
  return scaled;
}

/** @param {bigint | null} value @param {number} n @param {string} key @returns {bigint} */
function required(value, n, key) {
  if (value === null) refuse('input.missing_field', `line ${n}: ${key} is required`);
  return value;
}

/** A line's yes or no field, false when absent. @param {Map<string, unknown>} line @param {number} n @param {string} key */
function boolean(line, n, key) {
  if (!line.has(key)) return false;
  const value = line.get(key);
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `line ${n}: ${key} must be a boolean.`);
  return value;
}

/** Whether a beer container takes the draught rate: over 48 litres, or 8 to 48 litres designed to connect to a pressurised gas
 * or pump delivery system. @param {Map<string, unknown>} line @param {number} n */
function draught(line, n) {
  const container = required(quantity(line, n, 'container_litres', 1000000n, 3), n, 'container_litres');
  const middle = container >= 8000n && container <= 48000n;
  const has = line.has('pressurised_system');
  if (middle && !has) refuse('input.missing_field', `line ${n}: pressurised_system is required for a container of 8 to 48 litres`);
  if (middle) return boolean(line, n, 'pressurised_system');
  if (has) refuse('input.field_unknown', `line ${n}: pressurised_system is an input only for a container of 8 to 48 litres`);
  return container > 48000n;
}

/** The subitem for `product` at `strength` thousandths of a percent: Schedule items 1, 2 and 3.
 * @param {Map<string, unknown>} line @param {number} n @param {string} product @param {bigint} strength */
function classify(line, n, product, strength) {
  if ((product === 'beer' || product === 'other_excisable_beverage') && strength <= 1150n) {
    refuse('alcohol_excise.not_excisable', `line ${n}: ${product.replaceAll('_', ' ')} must contain more than 1.15% alcohol by volume to be excisable.`);
  }
  if (product === 'brandy') return '3.1';
  if (product === 'spirit') return '3.10';
  if (product === 'other_excisable_beverage') return strength > 10000n ? '3.2' : '2';
  const [over3, over35] = [strength > 3000n, strength > 3500n];
  if (boolean(line, n, 'brew_on_premises')) {
    const key = ['container_litres', 'pressurised_system'].find((k) => line.has(k));
    if (key) refuse('input.field_unknown', `line ${n}: ${key} is not an input for beer brewed on premises`);
    return over3 ? '1.16' : '1.15';
  }
  const tap = draught(line, n);
  if (!over3) return tap ? '1.2' : '1.1';
  if (!over35) return tap ? '1.6' : '1.5';
  return tap ? '1.11' : '1.10';
}

/** @typedef {{date: number, product: string, volume: bigint, strength: bigint, labelled: boolean, subitem: string, remission: boolean}} Line */

/** One line's facts, checked and classified. @param {unknown} given @param {number} n @returns {Line} */
function parseLine(given, n) {
  if (given === null || typeof given !== 'object' || Array.isArray(given)) refuse('alcohol_excise.line_invalid', `line ${n} must be an object.`);
  const line = new Map(Object.entries(given));
  const named = line.get('product');
  const product = PRODUCTS.find((p) => p === named);
  if (!product) {
    const refused = typeof named === 'string' ? REFUSED.get(named) : undefined;
    if (refused) refuse(refused[0], `line ${n}: ${refused[1]}`);
    if (!line.has('product')) refuse('input.missing_field', `line ${n}: product is required`);
    return refuse('alcohol_excise.product_invalid', `line ${n}: product must be beer, brandy, spirit or other_excisable_beverage.`);
  }
  const extra = [...line.keys()].find((k) => !COMMON.includes(k) && !(product === 'beer' && BEER.includes(k)));
  if (extra !== undefined) refuse('input.field_unknown', `line ${n}: ${extra} is not an input for ${product}`);
  if (boolean(line, n, 'imported')) {
    refuse('alcohol_excise.product_out_of_scope', `line ${n}: imported goods bear customs duty under the Customs Tariff Act 1995, not excise duty.`);
  }
  const date = dateArg(typeof line.get('date') === 'string' ? line.get('date') : '', `line ${n}: date`);
  const volume = required(quantity(line, n, 'volume_litres', 10n ** 12n, 4), n, 'volume_litres');
  const actual = required(quantity(line, n, 'strength_percent', 100n, 3), n, 'strength_percent');
  const subitem = classify(line, n, product, actual);
  const label = quantity(line, n, 'labelled_strength_percent', 100n, 3);
  let [strength, labelled] = [actual, false];
  if (label !== null && label > actual) {
    const other = classify(line, n, product, label);
    if (other !== subitem) {
      refuse('alcohol_excise.classification_unsettled', `line ${n}: the labelled strength puts the goods in subitem ${other} and the actual `
        + `strength in ${subitem}; Excise Act 1901 s 77FA charges duty on the labelled strength but does not say which subitem’s rate then applies.`);
    }
    [strength, labelled] = [label, true];
  }
  return { date, product, volume, strength, labelled, subitem, remission: boolean(line, n, 'remission') };
}

/** The period whose rates apply on `day`. @param {number} day */
const periodOn = (day) => /** @type {typeof ALCOHOL_PERIODS[number]} */ (ALCOHOL_PERIODS.find((p) => p.from <= day && day <= p.to));
/** @param {typeof ALCOHOL_PERIODS[number]} period @param {string} subitem */
const rateOf = (period, subitem) => /** @type {string} */ (period.rates.get(subitem));
/** A rate in cents. @param {string} rate */
const rateCents = (rate) => BigInt(rate.replace('.', ''));

/** Billionths as a decimal without trailing zeros. @param {bigint} n */
const litres = (n) => {
  let fraction = String(n % 1000000000n).padStart(9, '0');
  while (fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  return fraction ? `${n / 1000000000n}.${fraction}` : String(n / 1000000000n);
};

/**
 * @typedef {{subitem: string, rate_per_litre_of_alcohol: string, litres_of_alcohol: string, litres_of_alcohol_truncated: string,
 *   duty: string, remission: boolean, lines: number[], notices: string[]}} ReturnLine
 * @typedef {{year: string, amounts: Record<string, string>, rates: Record<string, string>, lines: (Line & {litres: string})[],
 *   return_lines: ReturnLine[], part_year_cap: {manufacturer_from: string, eligible_days: number} | null, exciseDuty: number,
 *   netDuty: number}} AlcoholExciseResult
 */

/** Excise duty for one financial year's lines, from the command's call. @param {Record<string, unknown>} call @returns {AlcoholExciseResult} */
export function alcoholExcise(call) {
  const fields = readFields(call, 'alcohol-excise', PARAMS, OPTIONAL);
  const year = scope(fields, ALCOHOL_YEARS);
  const first = Number(year.slice(0, 4));
  const bounds = [Date.UTC(first, 6, 1) / 86400000, Date.UTC(first + 1, 5, 30) / 86400000];
  const items = field(fields, 'lines').value;
  if (!Array.isArray(items)) refuse('alcohol_excise.lines_invalid', 'lines must be a list of line objects.');
  if (!items.length || items.length > MAX_LINES) refuse('alcohol_excise.lines_invalid', `lines must hold from 1 to ${MAX_LINES} lines.`);
  const lines = items.map((item, i) => parseLine(item, i + 1));
  for (const [i, line] of lines.entries()) {
    if (line.date < bounds[0] || line.date > bounds[1]) {
      refuse('alcohol_excise.date_outside_year', `line ${i + 1}: date is outside the financial year ${year}; work each financial year apart, as the `
        + 'remission cap is yearly.');
    }
    if (line.date > LAST) {
      refuse('alcohol_excise.rate_unpublished', `line ${i + 1}: no rate is held for goods entered after ${formatDay(LAST)}; the rates are replaced `
        + `on the February 2027 indexation day (Excise Tariff Act 1921 s 6A) and had not been published when this was checked on ${RATES_READ}.`);
    }
  }
  /** @type {{periods: typeof ALCOHOL_PERIODS, subitem: string, remission: boolean, lal: bigint, lines: number[]}[]} */
  const groups = [];
  const worked = lines.map((line, i) => {
    // Beer's rate is on the alcohol above 1.15% (Schedule item 1): litres of alcohol = volume x (strength - 1.15) / 100.
    const lal = line.volume * (line.product === 'beer' ? line.strength - 1150n : line.strength);
    const period = periodOn(line.date);
    const rate = rateOf(period, line.subitem);
    const g = groups.find((x) => x.subitem === line.subitem && x.remission === line.remission && rateOf(x.periods[0], x.subitem) === rate);
    if (g) {
      g.lal += lal;
      g.lines.push(i + 1);
      if (!g.periods.some((p) => p.from === period.from)) g.periods = [...g.periods, period].sort((a, b) => a.from - b.from);
    } else groups.push({ periods: [period], subitem: line.subitem, remission: line.remission, lal, lines: [i + 1] });
    return { ...line, litres: litres(lal) };
  });
  groups.sort((a, b) => a.periods[0].from - b.periods[0].from || SUBITEMS.indexOf(a.subitem) - SUBITEMS.indexOf(b.subitem)
    || Number(a.remission) - Number(b.remission));
  let [duty, eligible] = [0n, 0n];
  const returned = groups.map((g) => {
    const rate = rateOf(g.periods[0], g.subitem);
    const tenths = g.lal / 100000000n;
    const amount = (tenths * rateCents(rate)) / 10n;
    duty += amount;
    if (g.remission) eligible += amount;
    return { subitem: g.subitem, rate_per_litre_of_alcohol: rate, litres_of_alcohol: litres(g.lal),
      litres_of_alcohol_truncated: `${tenths / 10n}.${tenths % 10n}`, duty: shownCents(amount), remission: g.remission, lines: g.lines,
      notices: g.periods.map((p) => p.notice) };
  });
  const rates = { rates_read: RATES_READ, rates_from: '2022-07-01', rates_to: formatDay(LAST) };
  const facts = remissionFacts(fields, lines, bounds, year);
  if (!facts) {
    return { year, exciseDuty: Number(shownCents(duty)), netDuty: Number(shownCents(duty)),
      amounts: { excise_duty: shownCents(duty), net_duty: shownCents(duty) }, rates, lines: worked, return_lines: returned,
      part_year_cap: null };
  }
  const left = facts.used.cents < facts.cap ? facts.cap - facts.used.cents : 0n;
  const applied = eligible < left ? eligible : left;
  const capText = facts.partYear ? shownCents(facts.cap) : String(facts.cap / 100n);
  // Decimal subtraction keeps the finer exponent: 400000 - 1000.5 is 398999.5; a cap used up is 0.
  const places = Math.max(facts.partYear ? 2 : 0, facts.used.places);
  const leftText = left ? `${left / 100n}${places ? `.${String(left % 100n).padStart(2, '0').slice(0, places)}` : ''}` : '0';
  return { year, exciseDuty: Number(shownCents(duty)), netDuty: Number(shownCents(duty - applied)),
    rates: { ...rates, remission_cap: capText, remission_cap_left: leftText }, lines: worked, return_lines: returned,
    part_year_cap: facts.partYear ? { manufacturer_from: formatDay(facts.partYear[0]), eligible_days: facts.partYear[1] } : null,
    amounts: { excise_duty: shownCents(duty), remission_eligible_duty: shownCents(eligible), remission: shownCents(facts.paid ? 0n : applied),
      refund: shownCents(facts.paid ? applied : 0n), over_cap: shownCents(eligible - applied), net_duty: shownCents(duty - applied) } };
}

/** The remission facts, required where a line is marked remission and not inputs otherwise.
 * @param {Map<string, import('./aa-command.mjs').Field>} fields @param {Line[]} lines @param {number[]} bounds @param {string} year */
function remissionFacts(fields, lines, bounds, year) {
  const marked = lines.filter((l) => l.remission).map((l) => l.date);
  const given = (/** @type {string} */ key) => fields.has(key);
  if (!marked.length) {
    if (given('remission_used_this_year') || given('manufacturer_from') || given('duty_paid')) {
      refuse('input.field_unknown', 'remission_used_this_year, manufacturer_from and duty_paid are inputs only with a line marked remission');
    }
    return null;
  }
  const first = Math.min(...marked);
  if (!given('remission_used_this_year')) refuse('input.missing_field', 'remission_used_this_year is required with a line marked remission');
  const full = year >= '2026-27' ? 40000000n : 35000000n;
  let [cap, partYear] = [full, /** @type {[number, number] | null} */ (null)];
  if (given('manufacturer_from')) {
    const from = dateArg(field(fields, 'manufacturer_from').value, 'manufacturer_from');
    if (from > first) {
      refuse('alcohol_excise.fact_conflict', `manufacturer_from (${formatDay(from)}) is after a line marked remission (${formatDay(first)}): `
        + 'the remission is for goods an alcohol manufacturer entered.');
    }
    if (from > bounds[0]) {
      const days = bounds[1] - from + 1;
      [cap, partYear] = [(full * BigInt(days)) / 365n, [from, days]];
    }
  }
  const used = field(fields, 'remission_used_this_year').dec;
  const usedCents = money(used);
  const paid = given('duty_paid') ? flag(field(fields, 'duty_paid').value, 'duty_paid') : false;
  return { cap, partYear, used: { cents: usedCents, places: -(/** @type {{exponent: number}} */ (used)).exponent }, paid };
}

const LINES_ON_PAGE = 3;
export const PRODUCT_WORDS = new Map([['beer', 'beer'], ['brandy', 'brandy'], ['spirit', 'spirits'], ['other_excisable_beverage', 'other excisable beverage']]);

/** The form's input as the command's call: each line with a volume entered. @param {(name: string) => string} value */
export function alcoholFormInput(value) {
  const lines = [];
  for (let n = 1; n <= LINES_ON_PAGE; n += 1) {
    if (value(`volume-${n}`).trim() === '') continue;
    const product = value(`product-${n}`);
    /** @type {Record<string, unknown>} */
    const line = { date: value(`date-${n}`), product, volume_litres: value(`volume-${n}`), strength_percent: value(`strength-${n}`) };
    if (value(`labelled-${n}`).trim() !== '') line.labelled_strength_percent = value(`labelled-${n}`);
    if (product === 'beer') {
      line.container_litres = value(`container-${n}`);
      if (value(`pressurised-${n}`) !== '') line.pressurised_system = value(`pressurised-${n}`) === 'yes';
    }
    if (value(`remission-${n}`) === 'yes') line.remission = true;
    lines.push(line);
  }
  /** @type {Record<string, unknown>} */
  const call = { lines, year: value('year'), scope_confirmed: true };
  if (lines.some((line) => line.remission)) {
    call.remission_used_this_year = value('used');
    if (value('manufacturer-from').trim() !== '') call.manufacturer_from = value('manufacturer-from');
    call.duty_paid = value('duty-paid') === 'yes';
  }
  return call;
}

/** How the page writes the command's input. @param {Record<string, unknown>} x @param {(value: number) => string} aud */
export function alcoholInputsText(x, aud) {
  const lines = /** @type {Record<string, string>[]} */ (x.lines);
  const each = lines.map((l) => `${l.volume_litres} litres of ${PRODUCT_WORDS.get(l.product) ?? l.product} at ${l.strength_percent}% on ${l.date}`
    + `${l.container_litres ? ` in ${l.container_litres} litre containers` : ''}${l.remission ? ', remission claimed' : ''}`);
  return `${x.year}; ${each.join('; ')}${x.remission_used_this_year === undefined ? ''
    : `; remission already used this year ${aud(Number(x.remission_used_this_year))}`}`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function alcoholExciseResult(value, aud) {
  const input = alcoholFormInput(value);
  const r = alcoholExcise(input);
  const a = (/** @type {string | undefined} */ text) => aud(Number(text));
  /** @type {[string, string][]} */
  const rows = r.return_lines.map((g) => [`Subitem ${g.subitem}: ${g.litres_of_alcohol_truncated} litres of alcohol at $${g.rate_per_litre_of_alcohol}`
    + `${g.remission ? ', remission claimed' : ''}`, a(g.duty)]);
  rows.push(['Excise duty', a(r.amounts.excise_duty)]);
  if ('remission_eligible_duty' in r.amounts) {
    rows.push(['Remission under the cap', a(r.amounts.remission)]);
    if (Number(r.amounts.refund)) rows.push(['Refund of duty paid, on application', a(r.amounts.refund)]);
    if (Number(r.amounts.over_cap)) rows.push(['Duty above the remission cap', a(r.amounts.over_cap)]);
  }
  const principal = rows.push(['Net duty payable', a(r.amounts.net_duty)]) - 1;
  const note = r.rates.remission_cap ? `Remission cap ${a(r.rates.remission_cap)} for the year, ${a(r.rates.remission_cap_left)} left before these goods`
    : 'Rates from the Commissioner’s notice in force on the day the goods are entered for home consumption';
  return { inputs: alcoholInputsText(input, aud), rows, principal, note };
}
