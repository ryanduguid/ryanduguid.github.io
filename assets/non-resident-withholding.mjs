// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Non-resident withholding on dividends, interest and royalties: the amount a payer withholds from a payment to a
// foreign resident under TAA 1953 Schedule 1 Subdivision 12-F for 2024-25 to 2026-27. The `non-resident-withholding`
// command of ryanduguid/australian-accounting ported line for line for its dividend, interest and royalty payment
// types, with its inputs, order of checks, refusal codes, citations and rounding: the payment less its franked part and
// conduit foreign income (ITAA 1936 s 128B(3)(ga)(i)), whole dollars under Taxation Administration Regulations 2017
// s 26, 30% (dividends, royalties) or 10% (interest) or a stated treaty rate under regs 40 to 42, capped by s 12-300.
// Managed investment trust fund payments, gaming junkets, entertainers and construction payments are refused here.
// Subdivision 12-F, s 12-300 and TAR 2017 ss 26 and 39 to 42 read on the Federal Register on 27 November 2026.

export const NRW_YEARS = ['2026-27', '2025-26', '2024-25'];
export const NRW_TYPES = /** @type {const} */ (['dividend', 'interest', 'royalty']);
const OTHER_TYPES = ['mit_fund_payment', 'gaming_junket', 'entertainment_or_sports', 'construction'];
const BASE = ['payment_type', 'payment', 'year', 'scope_confirmed'];
const OPTIONAL = ['franked_amount', 'conduit_foreign_income', 'treaty_rate', 'information_exchange_country',
  'clean_building_mit_amount', 'non_concessional_mit_income', 'company_not_acting_as_agent', 'payee_entity',
  'base_rate_entity', 'contract_date', 'variation_rate', 'exempt', 'already_withheld'];
const WANTED = { dividend: [0, 1, 2, 11, 12], interest: [2, 11, 12], royalty: [2, 11, 12] };
const DOMESTIC = { dividend: '0.30', interest: '0.10', royalty: '0.30' };
const DECIMAL_INPUTS = new Set(['payment', 'franked_amount', 'conduit_foreign_income', 'already_withheld']);

export const NRW_STEPS = {
  dividend_base: 'ITAA 1936 s 128B(3)(ga)(i) and ITAA 1997 ss 802-15 and 802-17: dividend less its franked part and conduit foreign income (TAA Sch 1 s 12-220; TAR 2017 s 39)',
  interest_base: 'TAA Sch 1 ss 12-245, 12-250 and 12-255; ITAA 1936 s 128B(2), (2A) and (5): interest payment subject to Subdivision 12-F',
  royalty_base: 'TAA Sch 1 ss 12-280 and 12-285; ITAA 1936 s 128B(2B), (2C) and (5A): royalty payment subject to Subdivision 12-F',
  payment_used: 'Taxation Administration Regulations 2017 s 26(1)(a), (2) and (3): cents in the payment disregarded, and an amount under $1 disregarded',
  dividend_regulation: 'TAR 2017 s 40 (30% or stated treaty rate) and s 26(1)(b), (2) and (3): cents in the worked-out amount disregarded',
  interest_regulation: 'TAR 2017 s 41 (10% of the interest) and s 26(1)(b), (2) and (3): cents in the worked-out amount disregarded',
  royalty_regulation: 'TAR 2017 s 42 (30% or stated treaty rate) and s 26(1)(b), (2) and (3): cents in the worked-out amount disregarded',
  s_12_300_cap: 'TAA Sch 1 s 12-300(a) and (b); ITAA 1936 s 128B; IT(DIRWHT)A 1974 s 7; International Tax Agreements Act 1953 s 4: withholding tax payable less amounts already withheld under Subdivision 12-F (floored to whole cents so the statutory limit is not exceeded)',
  withholding: 'TAA Sch 1 s 12-300: lesser of the regulation withholding amount and the s 12-300(b) limit',
  exempt_withholding: 'TAA Sch 1 s 12-300(a): no amount is required to be withheld when no withholding tax is payable',
  net_payment: 'Payment less amounts already withheld and withholding required now',
};

/** @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

// A decimal as a signed integer coefficient and a power of 10, as Python's Decimal keeps it (trailing zeros kept).
// The command reads digits with an optional point and leading minus; Infinity and NaN read but are not finite.
/** @typedef {{ c: bigint, e: number, finite?: false }} Dec */
const PLAIN = /^-?\d+(?:\.\d+)?$/;
const SPECIAL = /^[+-]?(?:inf|infinity|s?nan\d*)$/i;

/** @param {string} text @returns {Dec | null} */
export function parseDec(text) {
  const t = text.trim();
  if (SPECIAL.test(t)) return { c: 0n, e: 0, finite: false };
  if (!PLAIN.test(t)) return null;
  const [whole, fraction = ''] = t.replace('-', '').split('.');
  const c = BigInt(`${whole}${fraction}`);
  return { c: t.startsWith('-') ? -c : c, e: -fraction.length };
}

/** @param {Dec} a @param {number} e */
const scaled = (a, e) => a.c * 10n ** BigInt(a.e - e);
/** @param {Dec} a @param {Dec} b */
const cmp = (a, b) => {
  const e = Math.min(a.e, b.e);
  const [x, y] = [scaled(a, e), scaled(b, e)];
  return x < y ? -1 : x > y ? 1 : 0;
};
/** @param {Dec} a @param {Dec} b @returns {Dec} */
const sub = (a, b) => {
  const e = Math.min(a.e, b.e);
  return { c: scaled(a, e) - scaled(b, e), e };
};
/** @param {Dec} a @param {Dec} b @returns {Dec} */
const add = (a, b) => sub(a, { c: -b.c, e: b.e });
/** @param {Dec} a @param {Dec} b @returns {Dec} */
const mul = (a, b) => ({ c: a.c * b.c, e: a.e + b.e });
const ZERO = { c: 0n, e: 0 };

/** Rounds `a` to exponent `e`: 'down' truncates towards zero, 'half-up' rounds half away from zero. @param {Dec} a @param {number} e @param {'down' | 'half-up'} mode @returns {Dec} */
function quantize(a, e, mode) {
  if (a.e >= e) return { c: scaled(a, e), e };
  const unit = 10n ** BigInt(e - a.e);
  const negative = a.c < 0n;
  const magnitude = negative ? -a.c : a.c;
  let q = magnitude / unit;
  if (mode === 'half-up' && (magnitude % unit) * 2n >= unit) q += 1n;
  return { c: negative ? -q : q, e };
}

/** Python's str() of a Decimal. @param {Dec} a */
export function decText(a) {
  const sign = a.c < 0n ? '-' : '';
  const digits = (a.c < 0n ? -a.c : a.c).toString();
  const adjusted = a.e + digits.length - 1;
  if (a.e <= 0 && adjusted >= -6) {
    if (a.e === 0) return sign + digits;
    const padded = digits.padStart(-a.e + 1, '0');
    return `${sign}${padded.slice(0, a.e)}.${padded.slice(a.e)}`;
  }
  const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return `${sign}${mantissa}E${adjusted >= 0 ? '+' : ''}${adjusted}`;
}

/** The command's `_money`: a decimal string, finite, from 0 to 1e12, at most 2 decimal places. @param {unknown} value */
function money(value) {
  const v = /** @type {Dec | null} */ (value);
  if (!v || typeof v !== 'object' || v.finite === false || v.c < 0n || cmp(v, { c: 1n, e: 12 }) > 0 || v.e < -2) {
    refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  }
  return v;
}

/** Each input as the command reads it: unknown keys first (in key order), then each input in order, a decimal string parsed. @param {Record<string, unknown>} call */
function readInputs(call) {
  const unknown = Object.keys(call).sort().find((key) => !BASE.includes(key) && !OPTIONAL.includes(key));
  if (unknown) refuse('input.field_unknown', `${unknown} is not an input of non-resident-withholding`);
  /** @type {Record<string, unknown>} */
  const read = {};
  for (const key of [...BASE, ...OPTIONAL]) {
    if (!(key in call)) {
      if (BASE.includes(key)) refuse('input.missing_field', `${key} is required`);
      continue;
    }
    const value = call[key]; // eslint-disable-line security/detect-object-injection -- key is one of the command's own input names
    read[key] = DECIMAL_INPUTS.has(key) && typeof value === 'string' ? decimalInput(key, value) : value; // eslint-disable-line security/detect-object-injection -- key is one of the command's own input names
  }
  return read;
}

/** @param {string} key @param {string} value */
function decimalInput(key, value) {
  if (value.length > 8192) refuse('input.decimal_too_long', `${key}: decimal input exceeds 8192 bytes`);
  return parseDec(value) ?? refuse('input.decimal_unreadable', 'decimal.InvalidOperation');
}

/** The scope and period checks, then the payment type and its facts. @param {Record<string, unknown>} v */
function checkCall(v) {
  if (v.scope_confirmed !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  if (typeof v.year !== 'string' || !NRW_YEARS.includes(v.year)) {
    refuse('period.unsupported', `Unsupported period ${pyRepr(v.year)}; supported: ${[...NRW_YEARS].reverse().join(', ')}.`);
  }
  const type = typeof v.payment_type === 'string' ? v.payment_type : '';
  if (OTHER_TYPES.includes(type)) {
    refuse('non_resident_withholding.payment_type_out_of_scope', 'This page covers dividend, interest and royalty payments under Subdivision 12-F only.');
  }
  const wanted = WANTED[/** @type {keyof typeof WANTED} */ (type)];
  if (!wanted) {
    const hint = type === 'capital_gains' ? ' Use foreign-resident-withholding for foreign resident capital gains withholding (TAA Sch 1 s 14-200).' : '';
    refuse('non_resident_withholding.payment_type_invalid',
      `payment_type must be dividend, interest, royalty, mit_fund_payment, gaming_junket, entertainment_or_sports or construction.${hint}`);
  }
  const payment = money(v.payment);
  OPTIONAL.forEach((key, i) => {
    if (wanted.includes(i) && !(key in v)) refuse('input.missing_field', `${key} is required for this payment_type.`);
    if (!wanted.includes(i) && key in v) refuse('input.field_unknown', `${key} is not an input for this payment_type`);
  });
  return { type: /** @type {typeof NRW_TYPES[number]} */ (type), payment };
}

/** Python's repr() of a JSON value, as the command's period message quotes it. @param {unknown} value */
function pyRepr(value) {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

/** A treaty rate: null, or a decimal string from 0 to the domestic rate. @param {unknown} given @param {Dec} max */
function treatyRate(given, max) {
  if (given === null) return { ok: true, rate: null };
  const parsed = typeof given === 'string' && given.length <= 32 ? parseDec(given) : null;
  if (parsed && parsed.finite !== false && parsed.c >= 0n && cmp(parsed, max) <= 0) return { ok: true, rate: parsed };
  return { ok: false, rate: null };
}

/** TAR 2017 s 26(2) and (3): an amount under $1 is nil; cents above whole dollars are disregarded. @param {Dec} a */
const wholeDollars = (a) => (cmp(a, { c: 1n, e: 0 }) < 0 ? ZERO : quantize(a, 0, 'down'));

/** @param {string} step @param {string} authority @param {Dec} value */
const stepOf = (step, authority, value) => ({ step, authority, value: decText(value) });

/** The withholding base: a dividend less its franked part and conduit foreign income, or the whole payment. @param {string} type @param {Dec} payment @param {Record<string, unknown>} v */
function withholdingBase(type, payment, v) {
  if (type !== 'dividend') return payment;
  const exemptParts = add(money(v.franked_amount), money(v.conduit_foreign_income));
  if (cmp(exemptParts, payment) > 0) {
    refuse('non_resident_withholding.exempt_exceeds_payment', 'franked_amount plus conduit_foreign_income exceeds payment.');
  }
  return sub(payment, exemptParts);
}

/** The regulation amount and the s 12-300 cap, the lesser withheld. @param {string} type @param {Dec} base @param {Dec} used @param {Dec} applied @param {Dec} already */
function regulationWithholding(type, base, used, applied, already) {
  const regRate = type === 'interest' ? /** @type {Dec} */ (parseDec(DOMESTIC.interest)) : applied;
  const reg = wholeDollars(mul(regRate, used));
  const left = sub(mul(applied, base), already);
  const cap = quantize(cmp(left, ZERO) < 0 ? ZERO : left, -2, 'down');
  return { reg, cap, withholding: cmp(cap, reg) < 0 ? cap : reg };
}

/**
 * The command's result for one Subdivision 12-F payment: period, amounts (cents, half up), rates and steps.
 * @param {Record<string, unknown>} call
 */
export function nonResidentWithholding(call) {
  const v = readInputs(call);
  const { type, payment } = checkCall(v);
  const domesticText = DOMESTIC[type];
  const domestic = /** @type {Dec} */ (parseDec(domesticText));
  const treaty = treatyRate(v.treaty_rate, domestic);
  if (!treaty.ok) {
    refuse('non_resident_withholding.treaty_rate_invalid', `treaty_rate must be null or a decimal string from 0 to ${domesticText} for ${type}.`);
  }
  if (typeof v.exempt !== 'boolean') refuse('input.flag_invalid', 'exempt must be a boolean.');
  const already = money(v.already_withheld);
  if (cmp(already, payment) > 0) refuse('non_resident_withholding.already_withheld_exceeds_payment', 'already_withheld exceeds payment.');
  const base = withholdingBase(type, payment, v);
  const applied = treaty.rate ?? domestic;
  const used = wholeDollars(base);
  const steps = [stepOf('withholding_base', NRW_STEPS[`${type}_base`], base), stepOf('payment_used', NRW_STEPS.payment_used, used)];
  let worked = { reg: ZERO, withholding: ZERO };
  if (v.exempt) {
    steps.push(stepOf('withholding', NRW_STEPS.exempt_withholding, ZERO));
  } else {
    const w = regulationWithholding(type, base, used, applied, already);
    steps.push(stepOf('regulation_withholding', NRW_STEPS[`${type}_regulation`], w.reg),
      stepOf('s_12_300_cap', NRW_STEPS.s_12_300_cap, w.cap), stepOf('withholding', NRW_STEPS.withholding, w.withholding));
    worked = w;
  }
  const net = sub(sub(payment, already), worked.withholding);
  steps.push(stepOf('net_payment', NRW_STEPS.net_payment, net));
  return nrwOutput(v, { base, used, reg: worked.reg, withholding: worked.withholding, net }, { domesticText, applied, treaty: treaty.rate }, steps);
}

/** @param {Record<string, unknown>} v @param {Record<string, Dec>} amounts @param {{ domesticText: string, applied: Dec, treaty: Dec | null }} r @param {object[]} steps */
function nrwOutput(v, amounts, r, steps) {
  const cents = (/** @type {Dec} */ a) => decText(quantize(a, -2, 'half-up'));
  /** @type {Record<string, string>} */
  const rates = { domestic_rate: r.domesticText, applied_rate: v.exempt ? '0' : decText(r.applied) };
  if (r.treaty) rates.treaty_rate = decText(r.treaty);
  return {
    calculation: 'non_resident_withholding', period: /** @type {string} */ (v.year), payment_type: /** @type {string} */ (v.payment_type),
    subdivision: '12-F', final_tax: true,
    amounts: { withholding_base: cents(amounts.base), payment_used: cents(amounts.used), regulation_withholding: cents(amounts.reg),
      withholding: cents(amounts.withholding), net_payment: cents(amounts.net) },
    rates, steps,
  };
}

const TYPE_WORDS = { dividend: 'dividend', interest: 'interest', royalty: 'royalty' };
const percentOf = (/** @type {string} */ rate) => String(Number((Number(rate) * 100).toFixed(6)));

/** The command's call from the page's form. @param {(name: string) => string} value */
export function nrwFormInput(value) {
  const type = value('type');
  const treaty = value('treaty').trim();
  /** @type {Record<string, unknown>} */
  const call = { payment_type: type, payment: value('payment').trim(), year: value('year'), scope_confirmed: true,
    treaty_rate: treaty === '' ? null : treaty, exempt: value('exempt') === 'yes', already_withheld: value('already').trim() || '0' };
  if (type === 'dividend') Object.assign(call, { franked_amount: value('franked').trim() || '0', conduit_foreign_income: value('cfi').trim() || '0' });
  return call;
}

/** How a call reads on the page. @param {Record<string, any>} x @param {(value: number) => string} aud */
export function nrwInputsText(x, aud) {
  const parts = [`${x.year}; ${TYPE_WORDS[/** @type {keyof typeof TYPE_WORDS} */ (x.payment_type)] ?? x.payment_type} of ${aud(Number(x.payment))}`];
  if (x.payment_type === 'dividend') parts.push(`franked ${aud(Number(x.franked_amount))}, conduit foreign income ${aud(Number(x.conduit_foreign_income))}`);
  parts.push(x.treaty_rate === null ? 'no treaty rate' : `treaty rate ${percentOf(x.treaty_rate)}%`);
  if (x.exempt) parts.push('exempt');
  if (Number(x.already_withheld)) parts.push(`already withheld ${aud(Number(x.already_withheld))}`);
  return parts.join('; ');
}

/** The amounts a page shows for one call, as numbers. @param {Record<string, unknown>} input */
export function nrwFigures(input) {
  const r = nonResidentWithholding(input);
  return { withholdingBase: Number(r.amounts.withholding_base), withholding: Number(r.amounts.withholding), netPayment: Number(r.amounts.net_payment) };
}

/** The page's words for refusals that name the command's fields. */
const PAGE_REFUSALS = {
  'input.amount_invalid': 'Enter each amount from $0 to $1,000,000,000,000, to the cent.',
  'input.decimal_unreadable': 'Enter each amount as a number, such as 1250.50.',
  'non_resident_withholding.treaty_rate_invalid': 'Enter the treaty rate as a decimal no more than the domestic rate (0.15 for 15%), or leave it blank.',
  'non_resident_withholding.already_withheld_exceeds_payment': 'Enter an amount already withheld no more than the payment.',
  'non_resident_withholding.exempt_exceeds_payment': 'Enter a franked amount and conduit foreign income that together are no more than the dividend.',
};

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function nrwResult(value, aud) {
  const input = nrwFormInput(value);
  let r;
  try {
    r = nonResidentWithholding(input);
  } catch (error) {
    const words = PAGE_REFUSALS[/** @type {keyof typeof PAGE_REFUSALS} */ (/** @type {{ code?: string }} */ (error).code)];
    throw words ? new Error(words) : error;
  }
  const a = r.amounts;
  const rows = [['Withholding base', aud(Number(a.withholding_base))], ['Payment used (whole dollars)', aud(Number(a.payment_used))],
    [`Rate applied`, `${percentOf(r.rates.applied_rate)}%`], ['Regulation amount (whole dollars)', aud(Number(a.regulation_withholding))]];
  const principal = rows.push(['Amount to withhold', aud(Number(a.withholding))]) - 1;
  rows.push(['Net payment to the foreign resident', aud(Number(a.net_payment))]);
  return { inputs: nrwInputsText(input, aud), rows, principal,
    note: 'The payment and the regulation amount drop their cents; the amount withheld is no more than the withholding tax payable less any amount already withheld' };
}
