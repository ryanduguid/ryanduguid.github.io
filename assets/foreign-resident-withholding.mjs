// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Foreign resident capital gains withholding: the amount a purchaser pays the Commissioner under TAA 1953 Schedule 1
// s 14-200 on acquiring taxable Australian real property or a company title interest from 1 July 2017 to 30 June 2027.
// The `foreign-resident-withholding` command of ryanduguid/australian-accounting ported line for line, with its inputs,
// order of checks, refusal codes, citations and rounding: 12.5% with the $750,000 market value exclusion before
// 1 January 2025 and 15% with none from then (Acts No. 57 of 2017 and No. 135 of 2024), each vendor's interest share
// of the base at the full rate, its notice of variation's rate or nil for a clearance certificate. ss 14-200 to 14-235
// read in the AustLII consolidation of Schedule 1 on 27 November 2026. Shares are worked in the command's 40-digit context.

import { add, cents, cmp, d, div, isFiniteDec, isPlainDecimal, isZero, mul, parse, quantize, str, sub } from './exact-decimal.mjs';

export const FRCGW_YEARS = ['2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
export const FRCGW_PAGE_VENDORS = 3;
const P = 40;
const MAX_VENDORS = 50;
const FIFTEEN_FROM = '2025-01-01';
const PARAMS = ['payment', 'acquisition_date', 'asset', 'market_value', 'cost_base_first_element', 'option_payments', 'sale_price',
  'vendors', 'exclusion', 'class_variation_to_nil', 'year', 'scope_confirmed'];
const DECIMAL_PARAMS = new Set(['market_value', 'cost_base_first_element', 'option_payments', 'sale_price']);

/** The s 14-215 paragraphs the operator can state. */
export const FRCGW_EXCLUSIONS = /** @type {const} */ ([
  ['approved_stock_exchange', 's 14-215(b)'],
  ['crossing_system', 's 14-215(c)'],
  ['already_withheld', 's 14-215(d)'],
  ['securities_lending', 's 14-215(e)'],
  ['insolvent_company', 's 14-215(f)'],
  ['bankruptcy', 's 14-215(g)'],
]);
const ASSETS = ['taxable_australian_real_property', 'company_title_interest'];

const STEPS = {
  withholding_base: "TAA Sch 1 s 14-200(3)(a): the first element of the asset's cost base just after the acquisition less any payment or property given for an option you exercised to acquire it",
  rate: 'TAA Sch 1 s 14-200(3)(a): 12.5% for acquisitions from 1 July 2017 (Act No. 57 of 2017 Sch 1 items 1 and 4), 15% on or after 1 January 2025 (Act No. 135 of 2024 Sch 1 items 1 and 7); the acquisition is when the contract is entered into (ITAA 1997 s 109-5(2) item A1)',
  vendors: "TAA Sch 1 s 14-210(1)(e) and (2): every vendor without a clearance certificate; each vendor's interest share of the base at the full rate, its notice's varied rate (s 14-235(2)), or nil for a clearance certificate (PAYG withholding variation F2016L01123; LI 2026/38 s 6)",
  amount_payable: "TAA Sch 1 s 14-200(3) and (4): the sum of the vendors' amounts, or with no document the single s 14-200(3)(a) amount; nil if excluded (s 14-215) or varied to nil (s 14-235(5), (6)). The law sets no rounding: by the worksheet's convention each amount is rounded half up to the cent, and the single amount's rows share its cents",
};

/** @param {string} code @param {string} message */
const refuse = (code, message) => Object.assign(new Error(message), { code });

/** Python's repr of a JSON value as the command words it. @param {unknown} x @returns {string} */
function repr(x) {
  if (x === null) return 'None';
  if (x === true) return 'True';
  if (x === false) return 'False';
  if (typeof x === 'string') return x.includes("'") && !x.includes('"') ? `"${x}"` : `'${x.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  if (Array.isArray(x)) return `[${x.map(repr).join(', ')}]`;
  if (typeof x === 'object') return `{${Object.entries(/** @type {object} */ (x)).map(([k, v]) => `${repr(k)}: ${repr(v)}`).join(', ')}}`;
  return String(x);
}

/** Decimals this module read, so a caller's own object is never taken for one. @type {WeakSet<object>} */
const PARSED = new WeakSet();

/** The command's reading of a decimal string: plain digits, an optional minus and point; infinities and NaNs read.
 * @param {string} text */
function parseInput(text) {
  const parsed = parse(text.replaceAll('_', ''));
  if (!parsed) return null;
  const unsigned = text.trim().replace(/^-/, '');
  if (isFiniteDec(parsed) && !isPlainDecimal(unsigned)) return null;
  PARSED.add(parsed);
  return parsed;
}

/** `_money`: a finite non-negative amount, at most 2dp and 1e12. @param {unknown} x */
function money(x) {
  const bad = () => refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  if (!x || typeof x !== 'object' || !PARSED.has(x)) throw bad();
  const v = /** @type {import('./exact-decimal.mjs').Dec} */ (x);
  if (!isFiniteDec(v) || (v.neg && !isZero(v)) || cmp(v, d('1e12')) > 0 || v.exp < -2) throw bad();
  return v;
}

/** A vendor's amount: a decimal string of at most 32 characters. @param {Record<string, unknown>} fields @param {string} name @param {string} key */
function statedAmount(fields, name, key) {
  if (!(key in fields)) throw refuse('input.missing_field', `${name}: ${key} is required`);
  const given = fields[key]; // eslint-disable-line security/detect-object-injection -- the command's own key
  const parsed = typeof given === 'string' && given.length <= 32 ? parseInput(given) : null;
  try {
    if (parsed) return money(parsed);
  } catch { /* refused below as the command refuses it */ }
  throw refuse('input.amount_invalid', `${name}: ${key} must be a decimal string, finite and non-negative, at most 2dp and 1e12.`);
}

/** @param {string} message */
const vendorsInvalid = (message) => refuse('foreign_resident_withholding.vendors_invalid', message);

/** @param {unknown} item @param {string} name */
function vendor(item, name) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw vendorsInvalid(`${name} must be an object with interest and document.`);
  const fields = /** @type {Record<string, unknown>} */ (item);
  const interest = statedAmount(fields, name, 'interest');
  if (isZero(interest)) throw vendorsInvalid(`${name}: interest must be above nil.`);
  const kind = typeof fields.document === 'string' ? fields.document : null;
  const keys = kind === 'variation' ? ['interest', 'document', 'rate', 'maximum_price'] : ['interest', 'document'];
  const unknown = Object.keys(fields).find((k) => !keys.includes(k));
  if (unknown !== undefined) throw refuse('input.field_unknown', `${name}: ${unknown} is not an input of a vendor`);
  if (kind === 'none' || kind === 'clearance_certificate') return { interest, kind, rate: null, maximum: null };
  if (kind === 'variation') {
    const parsed = typeof fields.rate === 'string' && fields.rate.length <= 32 ? parseInput(fields.rate) : null;
    if (!parsed || !isFiniteDec(parsed) || (parsed.neg && !isZero(parsed)) || cmp(parsed, d('1')) > 0) {
      throw vendorsInvalid(`${name}: rate must be a decimal string from 0 to 1, the varied rate on the notice of variation.`);
    }
    return { interest, kind, rate: parsed, maximum: statedAmount(fields, name, 'maximum_price') };
  }
  throw vendorsInvalid(`${name}: document must be none, clearance_certificate or variation.`);
}

/** Day number of a YYYY-MM-DD date from 1900 to 2100, or null. @param {unknown} text */
function day(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, dd] = text.split('-').map(Number);
  const t = Date.UTC(y, m - 1, dd);
  const back = new Date(t);
  return y >= 1900 && y <= 2100 && back.getUTCMonth() === m - 1 && back.getUTCDate() === dd ? t / 86400000 : null;
}

/** @param {number} n */
const dayText = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

/** The command's own inputs, read in order and with decimals parsed. @param {any} v @returns {Record<string, any>} */
function collectInputs(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw refuse('input.not_object', 'input must be a JSON object');
  const unknown = Object.keys(v).find((k) => !PARAMS.includes(k));
  if (unknown !== undefined) throw refuse('input.field_unknown', `${unknown} is not an input of foreign-resident-withholding`);
  /** @type {Record<string, unknown>} */
  const a = {};
  for (const key of PARAMS) {
    if (!(key in v)) throw refuse('input.missing_field', `${key} is required`);
    const given = v[key]; // eslint-disable-line security/detect-object-injection -- the command's own key
    if (DECIMAL_PARAMS.has(key) && typeof given === 'string') {
      if (new TextEncoder().encode(given).length > 8192) throw refuse('input.decimal_too_long', `${key}: decimal input exceeds 8192 bytes`);
      const parsed = parseInput(given);
      if (!parsed) throw refuse('input.decimal_unreadable', 'decimal.InvalidOperation');
      a[key] = parsed; // eslint-disable-line security/detect-object-injection -- the command's own key
    } else a[key] = given; // eslint-disable-line security/detect-object-injection -- the command's own key
  }
  return a;
}

/** The checked facts of one acquisition. @param {Record<string, any>} a */
function checkedFacts(a) {
  if (a.scope_confirmed !== true) throw refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = a.year;
  if (typeof year !== 'string' || !FRCGW_YEARS.includes(year)) {
    throw refuse('period.unsupported', `Unsupported period ${repr(year)}; supported: ${FRCGW_YEARS.join(', ')}.`);
  }
  if (a.payment !== 'capital_gains') {
    throw refuse('foreign_resident_withholding.payment_unsupported', 'Only payment capital_gains (TAA Sch 1 s 14-200) is built. The s 14-205 amount for a look-through earnout, interest, dividend and royalty withholding (Subdivision 12-F), managed investment trust fund payments (Subdivision 12-H) and s 12-315 payments are not.');
  }
  if (typeof a.asset !== 'string' || !ASSETS.includes(a.asset)) {
    throw refuse('foreign_resident_withholding.asset_unsupported', 'asset must be taxable_australian_real_property or company_title_interest. For another indirect Australian real property interest or an option or right, s 14-210(1)(a) to (d) turn on what the purchaser knows or believes and s 14-225 declarations can apply.');
  }
  const first = Number(year.slice(0, 4));
  const start = /** @type {number} */ (day(`${first}-07-01`));
  const end = /** @type {number} */ (day(`${first + 1}-06-30`));
  const acquired = day(a.acquisition_date);
  if (acquired === null) throw refuse('input.date_invalid', 'acquisition_date must be a YYYY-MM-DD date from 1900 to 2100.');
  if (acquired < start || acquired > end) {
    throw refuse('foreign_resident_withholding.date_outside_year', `acquisition_date must be in the ${year} income year, from ${dayText(start)} to ${dayText(end)}.`);
  }
  const marketValue = money(a.market_value);
  const costBase = money(a.cost_base_first_element);
  const option = money(a.option_payments);
  const salePrice = money(a.sale_price);
  if (cmp(option, costBase) > 0) throw refuse('foreign_resident_withholding.option_exceeds_price', 'option_payments cannot exceed cost_base_first_element.');
  if (!Array.isArray(a.vendors)) throw vendorsInvalid('vendors must be a list of objects with interest and document.');
  if (a.vendors.length === 0 || a.vendors.length > MAX_VENDORS) throw vendorsInvalid(`vendors must hold 1 to ${MAX_VENDORS} entries.`);
  const vendors = a.vendors.map((item, i) => vendor(item, `vendor ${i + 1}`));
  let excluded = null;
  if (a.exclusion !== null) {
    const found = FRCGW_EXCLUSIONS.find(([key]) => a.exclusion === key);
    if (!found) throw refuse('foreign_resident_withholding.exclusion_invalid', 'exclusion must be null or one of approved_stock_exchange, crossing_system, already_withheld, securities_lending, insolvent_company or bankruptcy (s 14-215).');
    excluded = found[1];
  }
  if (typeof a.class_variation_to_nil !== 'boolean') throw refuse('input.flag_invalid', 'class_variation_to_nil must be a boolean.');
  const nilClass = a.class_variation_to_nil;
  return { year, acquired, marketValue, costBase, option, salePrice, vendors, excluded, nilClass };
}

/** Each vendor's share, amount and basis, and the totals payable. @param {any[]} vendors @param {any} base @param {any} salePrice @param {any} full @param {string | null} nil */
function vendorAmounts(vendors, base, salePrice, full, nil) {
  const total = vendors.reduce((sum, x) => add(sum, x.interest), d('0'));
  const rows = vendors.map((x) => {
    const share = div(mul(base, x.interest, P), total, P);
    /** @type {[import('./exact-decimal.mjs').Dec, string]} */
    const [applied, basis] = x.kind === 'none' ? [full, 'no document: full rate'] : x.kind === 'clearance_certificate' ? [d('0'), 'clearance certificate: nil']
      : cmp(salePrice, /** @type {any} */ (x.maximum)) > 0 ? [full, 'variation does not apply above its maximum price: full rate']
        : [/** @type {any} */ (x.rate), 'notice of variation: varied rate'];
    return { share, amount: mul(applied, share, P), basis };
  });
  const fullAmount = mul(full, base, P);
  let payable = d('0');
  if (nil === null && vendors.every((x) => x.kind === 'none')) {
    payable = cents(fullAmount);
    let left = payable;
    const remainders = rows.map((row, i) => {
      const down = quantize(row.amount, -2, 'down');
      const remainder = sub(row.amount, down, P);
      left = sub(left, down, P);
      row.amount = down;
      return { remainder, i };
    });
    remainders.sort((x, y) => cmp(y.remainder, x.remainder));
    for (const { i } of remainders) {
      if (cmp(left, d('0')) <= 0) break;
      rows[i].amount = add(rows[i].amount, d('0.01'), P); // eslint-disable-line security/detect-object-injection -- an index into rows
      rows[i].basis = 'no document: full rate, plus the rounding cent left over from the single amount'; // eslint-disable-line security/detect-object-injection -- an index into rows
      left = sub(left, d('0.01'), P);
    }
  } else if (nil === null) {
    for (const row of rows) row.amount = cents(row.amount);
    payable = rows.reduce((sum, row) => add(sum, row.amount, P), d('0'));
  }
  return { rows, fullAmount, payable };
}

/** The worksheet for one acquisition. @param {Record<string, any>} v */
export function foreignResidentWithholding(v) {
  const a = collectInputs(v);
  const { year, acquired, marketValue, costBase, option, salePrice, vendors, excluded, nilClass } = checkedFacts(a);
  const base = sub(costBase, option);
  const later = acquired >= /** @type {number} */ (day(FIFTEEN_FROM));
  const fullRate = later ? '0.15' : '0.125';
  const threshold = later ? null : '750000';
  const full = d(fullRate);
  for (const x of vendors) {
    if (x.kind === 'variation' && cmp(/** @type {import('./exact-decimal.mjs').Dec} */ (x.rate), full) > 0) {
      throw refuse('foreign_resident_withholding.variation_invalid', `A varied rate cannot exceed the full rate of ${fullRate} for the acquisition date.`);
    }
  }
  let nil = null;
  if (excluded) nil = `excluded transaction (${excluded})`;
  else if (threshold && cmp(marketValue, d(threshold)) < 0) nil = 'excluded transaction: market value under $750,000 (s 14-215(1)(a), acquisitions before 1 January 2025)';
  else if (nilClass) nil = 'class variation to nil (s 14-235(5) and (6))';
  else if (vendors.every((x) => x.kind === 'clearance_certificate')) nil = 'every vendor gave a clearance certificate: s 14-210(1) applies to none (s 14-210(2))';
  if (nil === null) {
    for (const x of vendors) {
      if (x.kind === 'variation' && cmp(salePrice, /** @type {any} */ (x.maximum)) > 0 && cmp(base, /** @type {any} */ (x.maximum)) <= 0) {
        throw refuse('foreign_resident_withholding.variation_maximum_unsettled', "A notice's maximum sale price is at least the base but below sale_price, so whether it applies turns on whether the maximum is GST inclusive. If it is, the notice does not apply: give that vendor document none. If it is net of the input tax credit, give sale_price net of the credit.");
      }
    }
  }
  const { rows, fullAmount, payable } = vendorAmounts(vendors, base, salePrice, full, nil);
  return {
    period: year,
    amounts: { withholding_base: str(cents(base)), amount_at_full_rate: str(cents(fullAmount)), amount_payable: str(cents(payable)) },
    rates: { rate: fullRate, threshold: threshold ?? 'none' },
    acquisition_date: dayText(acquired),
    nil_reason: nil,
    vendors: rows.map((row) => ({ share_of_base: str(cents(row.share)), amount: nil === null ? str(row.amount) : '0.00', basis: row.basis })),
    authorities: STEPS,
  };
}

const ASSET_WORDS = { taxable_australian_real_property: 'taxable Australian real property', company_title_interest: 'a company title interest' };
const DOCUMENT_WORDS = { none: 'no clearance certificate or variation', clearance_certificate: 'a clearance certificate', variation: 'a notice of variation' };

/** The income year a date falls in, such as `2025-26` for 2026-03-01. @param {string} date */
export function frcgwYearOf(date) {
  const [y, m] = date.split('-').map(Number);
  const first = m >= 7 ? y : y - 1;
  return `${first}-${String((first + 1) % 100).padStart(2, '0')}`;
}

/** The form's call: a vendor row is left out when its interest is blank. @param {(name: string) => string} value */
export function frcgwFormInput(value) {
  const date = value('date');
  const vendors = [];
  for (let n = 1; n <= FRCGW_PAGE_VENDORS; n += 1) {
    const interest = value(`vendor-${n}-interest`).trim();
    if (interest === '') continue;
    const document = value(`vendor-${n}-document`);
    /** @type {Record<string, string>} */
    const row = { interest, document };
    if (document === 'variation') Object.assign(row, { rate: value(`vendor-${n}-rate`).trim(), maximum_price: value(`vendor-${n}-maximum`).trim() });
    vendors.push(row);
  }
  const exclusion = value('exclusion');
  const amount = (/** @type {string} */ name) => value(name).trim() || '0';
  return { payment: 'capital_gains', acquisition_date: date, asset: value('asset'), market_value: amount('market-value'),
    cost_base_first_element: amount('price'), option_payments: amount('option'), sale_price: amount('sale-price') === '0' ? amount('price') : amount('sale-price'),
    vendors, exclusion: exclusion === 'none' ? null : exclusion, class_variation_to_nil: value('class-nil') === 'yes',
    year: /^\d{4}-\d{2}-\d{2}$/.test(date) ? frcgwYearOf(date) : '', scope_confirmed: true };
}

/** A rate such as 0.07 as a percentage, 7, without binary fractions. @param {string} rate */
const percent = (rate) => String(Number((Number(rate) * 100).toPrecision(12)));

/** How the page writes the call. @param {Record<string, any>} x @param {(value: number) => string} aud */
export function frcgwInputsText(x, aud) {
  const vendors = x.vendors.map((/** @type {Record<string, string>} */ v, /** @type {number} */ i) => `vendor ${i + 1}: interest ${v.interest}, ${DOCUMENT_WORDS[/** @type {keyof typeof DOCUMENT_WORDS} */ (v.document)] ?? v.document}`
    + `${v.document === 'variation' ? ` at ${percent(v.rate)}% up to ${aud(Number(v.maximum_price))}` : ''}`);
  return `Contract ${x.acquisition_date}; ${ASSET_WORDS[/** @type {keyof typeof ASSET_WORDS} */ (x.asset)] ?? x.asset}, market value ${aud(Number(x.market_value))}, `
    + `purchase price ${aud(Number(x.cost_base_first_element))}${Number(x.option_payments) ? `, option fee ${aud(Number(x.option_payments))}` : ''}; ${vendors.join('; ')}`;
}

/** The amounts a page shows for one call, as numbers. @param {Record<string, any>} input */
export function frcgwFigures(input) {
  const r = foreignResidentWithholding(input);
  return { withholdingBase: Number(r.amounts.withholding_base), amountPayable: Number(r.amounts.amount_payable), nilReason: r.nil_reason };
}

/** The page's words for refusals that name the command's fields. */
const PAGE_REFUSALS = {
  'foreign_resident_withholding.option_exceeds_price': 'Enter an option fee no more than the purchase price.',
  'foreign_resident_withholding.variation_maximum_unsettled': 'A notice’s maximum sale price is at least the withholding base but below the sale price, so whether it applies turns on whether the maximum includes GST. If it does, choose no document for that vendor; if it excludes GST, enter the sale price less the input tax credit.',
};

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function frcgwResult(value, aud) {
  const input = frcgwFormInput(value);
  if (input.vendors.length === 0) throw new Error('Enter the interest of at least one vendor.');
  let r;
  try {
    r = foreignResidentWithholding(input);
  } catch (error) {
    const words = PAGE_REFUSALS[/** @type {keyof typeof PAGE_REFUSALS} */ (/** @type {{ code?: string }} */ (error).code)];
    throw words ? new Error(words) : error;
  }
  const rows = [['Withholding base (first element of the cost base less any option fee)', aud(Number(r.amounts.withholding_base))],
    [`Rate for a contract on ${r.acquisition_date}`, `${percent(r.rates.rate)}%`]];
  r.vendors.forEach((v, i) => rows.push([`Vendor ${i + 1}: ${v.basis}`, aud(Number(v.amount))]));
  const principal = rows.push(['Amount to pay the ATO at settlement', aud(Number(r.amounts.amount_payable))]) - 1;
  return { inputs: frcgwInputsText(input, aud), rows, principal,
    note: r.nil_reason ? `Nothing to withhold: ${r.nil_reason}` : 'Each amount is rounded half up to the cent; with no document, the single amount’s cents are shared by the largest remainders' };
}
