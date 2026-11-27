// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The state and territory portable long service leave levies: construction, community services, contract cleaning
// and security, in every scheme the `portable-lsl-levy` command of ryanduguid/australian-accounting covers. Its states
// part ported line for line: the command line's reading of a call, the order of checks, refusal codes, rates,
// thresholds and each scheme's rounding. The command read every rate and rule from the boards' pages and the
// legislation on 24 November 2026. Coal LSL (jurisdiction cth, scheme coal) is the Coal LSL levy calculator's.

const KIND = 'portable_lsl_levy';
export const PLSL_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24'];
const JURISDICTIONS = ['cth', 'nsw', 'vic', 'qld', 'sa', 'wa', 'act', 'tas', 'nt'];
const SCHEMES = ['coal', 'construction', 'community_services', 'contract_cleaning', 'security'];
const PARAMS = [['jurisdiction', 'raw'], ['scheme', 'raw'], ['year', 'raw'], ['scope_confirmed', 'raw']];
const OPTIONAL = [['ordinary_wages', 'dec'], ['paid_on_time', 'raw'], ['project_cost', 'dec'], ['partial_exemption', 'raw'],
  ['reporting_month', 'raw'], ['branch', 'raw'], ['eligible_employee', 'raw'], ['base_rate_of_pay', 'dec'], ['annual_salary_paid', 'dec'],
  ['casual_loading', 'dec'], ['ordinary_rate_of_pay', 'dec'], ['salary_sacrificed', 'dec'], ['overtime_and_penalty_rates', 'dec'],
  ['allowances', 'dec'], ['allowances_exclude_expense_reimbursements', 'raw'], ['bonuses', 'raw'], ['instrument_specifies_loading', 'raw'],
  ['loading_quantifiable', 'raw']];
/** The Coal LSL inputs, which no state scheme reads. */
const COAL_FIELDS = OPTIONAL.slice(4).map(([key]) => key);

/** @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** A finite decimal as Python's Decimal keeps it: sign, coefficient and power of 10. */
/** @typedef {{ s: boolean, c: bigint, e: number }} Dec */
const PLAIN = /^-?\d+(?:\.\d+)?$/; // eslint-disable-line security/detect-unsafe-regex -- anchored, with no repetition over overlapping characters: linear
const SPECIAL = /^[+-]?(?:inf|infinity|s?nan\d*)$/i;

/** Python's str.isspace() code points: unlike JavaScript's trim, U+FEFF is not space, and U+001C to U+001F and U+0085 are. */
const SPACE = new Set([9, 10, 11, 12, 13, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000]);

/** Python's str.strip(). @param {string} text */
function strip(text) {
  let [start, end] = [0, text.length];
  while (start < end && SPACE.has(text.charCodeAt(start))) start += 1;
  while (end > start && SPACE.has(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

/** The command's reading of decimal text; Infinity and NaN read but are not finite. @param {string} text */
function parseDec(text) {
  const t = strip(text);
  if (SPECIAL.test(t)) return { finite: false };
  if (!PLAIN.test(t)) return null;
  const [whole, fraction = ''] = t.replace('-', '').split('.');
  return { s: t.startsWith('-'), c: BigInt(`${whole}${fraction}`), e: -fraction.length };
}

/** @param {string} text @returns {Dec} */
const d = (text) => /** @type {Dec} */ (parseDec(text));
/** @param {Dec} a @param {number} e */
const signed = (a, e) => (a.s ? -1n : 1n) * a.c * 10n ** BigInt(a.e - e);
/** @param {Dec} a @param {Dec} b */
const cmp = (a, b) => {
  const e = Math.min(a.e, b.e);
  const [x, y] = [signed(a, e), signed(b, e)];
  return x < y ? -1 : Number(x > y);
};
/** Python's sum where it cannot be negative: every sum here is of levies over a positive threshold, or of nil parts with a positive sign. @param {Dec} a @param {Dec} b @returns {Dec} */
const add = (a, b) => {
  const e = Math.min(a.e, b.e);
  return { s: false, c: signed(a, e) + signed(b, e), e };
};
/** @param {Dec} a @param {Dec} b @returns {Dec} */
const mul = (a, b) => ({ s: a.s !== b.s, c: a.c * b.c, e: a.e + b.e });
const ZERO = d('0');

/** Rounds to exponent `e`, keeping the sign: 'down' truncates, 'half-up' rounds half away from zero. @param {Dec} a @param {number} e @param {'down' | 'half-up'} mode @returns {Dec} */
function quantize(a, e, mode) {
  if (a.e >= e) return { s: a.s, c: a.c * 10n ** BigInt(a.e - e), e };
  const unit = 10n ** BigInt(e - a.e);
  const q = a.c / unit;
  return { s: a.s, c: mode === 'half-up' && (a.c % unit) * 2n >= unit ? q + 1n : q, e };
}

/** Python's str() of a Decimal with no positive exponent, as every amount and rate here has. @param {Dec} a */
function decText(a) {
  const sign = a.s ? '-' : '';
  if (a.e === 0) return sign + a.c.toString();
  const padded = a.c.toString().padStart(-a.e + 1, '0');
  return `${sign}${padded.slice(0, a.e)}.${padded.slice(a.e)}`;
}

/** The nearest whole dollar with 50 cents rounded down: Qld BCI Act 1991 s 72(2) and NT Act 2005 s 33(2). @param {Dec} value */
function dollarsHalfDown(value) {
  const down = quantize(value, 0, 'down');
  return cmp(add(value, { ...down, s: !down.s }), d('0.5')) > 0 ? add(down, d('1')) : down;
}

/** @param {string} key @param {unknown} value */
function decimalInput(key, value) {
  if (typeof value !== 'string') return value;
  if (new TextEncoder().encode(value).length > 8192) refuse('input.decimal_too_long', `${key}: decimal input exceeds 8192 bytes`);
  return parseDec(value) ?? refuse('input.decimal_unreadable', 'decimal.InvalidOperation');
}

/** The command line's reading: an unknown key (in code unit order), then each input in order, decimal text parsed. @param {Record<string, unknown>} call */
function readCall(call) {
  const known = new Set([...PARAMS, ...OPTIONAL].map(([key]) => key));
  const unknown = Object.keys(call).sort((a, b) => Number(a > b) - Number(a < b)).find((key) => !known.has(key));
  if (unknown) refuse('input.field_unknown', `${unknown} is not an input of portable-lsl-levy`);
  /** @type {Map<string, unknown>} */
  const read = new Map();
  for (const [index, [key, kind]] of [...PARAMS, ...OPTIONAL].entries()) {
    const given = Object.hasOwn(call, key);
    if (!given && index < PARAMS.length) refuse('input.missing_field', `${key} is required`);
    if (given) read.set(key, kind === 'dec' ? decimalInput(key, call[key]) : call[key]); // eslint-disable-line security/detect-object-injection -- key is one of the command's own input names
  }
  return read;
}

/** The engine's `money`: a finite decimal from 0 to 1e12 with at most 2 decimal places. @param {unknown} value @returns {Dec} */
function money(value) {
  const v = /** @type {any} */ (value);
  if (typeof v?.c !== 'bigint' || cmp(v, ZERO) < 0 || cmp(v, d('1000000000000')) > 0 || v.e < -2) {
    refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  }
  return v;
}

/** @param {unknown} value @param {string} name */
function flag(value, name) {
  if (typeof value !== 'boolean') refuse('input.flag_invalid', `${name} must be a boolean.`);
  return value;
}

/** Refuses the first field supplied that the scheme does not read. @param {Map<string, unknown>} v @param {string[]} names @param {string} context */
function rejectPresent(v, names, context) {
  const name = names.find((n) => v.has(n));
  if (name) refuse('portable_lsl_levy.branch_field_mismatch', `${name} does not apply to ${context}.`);
}

/** @param {Map<string, unknown>} v @param {string} name @param {string} context */
function requiredMoney(v, name, context) {
  if (!v.has(name)) refuse('input.missing_field', `${name} is required for ${context}.`);
  return money(v.get(name));
}

/** @param {string} jurisdiction @param {string} scheme @param {string} year @param {string} allowed */
function checkYear(jurisdiction, scheme, year, allowed) {
  if (!allowed.split(', ').includes(year)) {
    refuse('portable_lsl_levy.scheme_year_unsupported', `${jurisdiction} ${scheme} portable LSL levy rates are verified for ${allowed}, not ${year}.`);
  }
}

// jurisdiction|scheme|board|years|rate|authority, as the command's PAYROLL_ROWS.
const PAYROLL_ROWS = [
  "nsw|contract_cleaning|Long Service Corporation (NSW)|2023-24, 2024-25, 2025-26, 2026-27|0.01|Contract Cleaning Industry (Portable Long Service Leave Scheme) Act 2010 (NSW) and NSW Long Service Corporation 'Managing employer returns and paying levies in the contract cleaning industry' (read 24 November 2026): 1% of gross ordinary wages from 1 July 2021, rounded half up to the cent",
  "vic|construction|LeavePlus (Victoria)|2026-27|0.027|Construction Industry Long Service Leave Act 1997 (Vic) and LeavePlus 'Long service leave charges' (read 24 November 2026): 2.7% of gross reportable ordinary pay, rounded half up to the cent",
  "vic|community_services|Portable Long Service Authority (Victoria)|2026-27|0.0165|Long Service Benefits Portability Act 2018 (Vic) and Portable Long Service Authority 'About the Portable Long Service Benefits Scheme' (read 24 November 2026): 1.65% of ordinary pay for community services, rounded half up to the cent",
  "vic|contract_cleaning|Portable Long Service Authority (Victoria)|2026-27|0.018|Long Service Benefits Portability Act 2018 (Vic) and Portable Long Service Authority 'About the Portable Long Service Benefits Scheme' (read 24 November 2026): 1.80% of ordinary pay for contract cleaning, rounded half up to the cent",
  "vic|security|Portable Long Service Authority (Victoria)|2026-27|0.018|Long Service Benefits Portability Act 2018 (Vic) and Portable Long Service Authority 'About the Portable Long Service Benefits Scheme' (read 24 November 2026): 1.80% of ordinary pay for security, rounded half up to the cent",
  "qld|contract_cleaning|QLeave (Queensland)|2026-27|0.005|Contract Cleaning Industry (Portable Long Service Leave) Act 2005 (Qld) s 83 and QLeave 'Employer obligations' (read 24 November 2026): 0.5% of workers' ordinary wages, rounded half up to the cent",
  "qld|community_services|QLeave (Queensland)|2026-27|0.0135|Community Services Industry (Portable Long Service Leave) Act 2020 (Qld) and QLeave 'Paying the levy' (read 24 November 2026): 1.35% of workers' ordinary wages, rounded half up to the cent",
  "sa|construction|SA Portable Long Service Leave|2026-27|0.02|Construction Industry Long Service Leave Act 1987 (SA) s 26 and SA Portable Long Service Leave 'How to complete Employer Returns' (read 24 November 2026): 2.00% of declared gross remuneration (excluding levy-free apprentices), rounded half up to the cent",
  "sa|community_services|SA Portable Long Service Leave|2026-27|0.022|Portable Long Service Leave Act 2024 (SA) and SA Portable Long Service Leave 'What do I have to do?' (read 24 November 2026): 2.2% of gross remuneration (excluding exempt trainees), rounded half up to the cent",
  "wa|construction|MyLeave (Western Australia)|2026-27|0.0075|Construction Industry Portable Paid Long Service Leave Act 1985 (WA) s 34 and MyLeave public notice '2027 Employer Contribution Rate' (4 November 2026, read 24 November 2026): 0.75% of ordinary pay for the 2026 and 2027 calendar years (excluding apprentices), rounded half up to the cent",
  "act|construction|ACT Leave|2025-26, 2026-27|0.0275|Long Service Leave (Portable Schemes) Act 2009 (ACT) s 51 and Building and Construction Industry Employer Levy Determination 2024 (DI2024-12, in force from 1 October 2024, read 24 November 2026): 2.75% of gross ordinary wages, rounded half up to the cent",
  "act|community_services|ACT Leave|2024-25, 2025-26, 2026-27|0.0185|Long Service Leave (Portable Schemes) Act 2009 (ACT) s 56A and Community Sector Industry Employer Levy Determination 2024 (DI2024-16, in force from 1 July 2024, read 24 November 2026): 1.85% of gross ordinary wages, rounded half up to the cent",
  "act|security|ACT Leave|2024-25, 2025-26, 2026-27|0.0147|Long Service Leave (Portable Schemes) Act 2009 (ACT) s 56A and Security Industry Employer Levy Determination 2024 (DI2024-15, in force from 1 July 2024, read 24 November 2026): 1.47% of gross ordinary wages, rounded half up to the cent",
  "act|contract_cleaning|ACT Leave|2025-26, 2026-27|0.0107|Long Service Leave (Portable Schemes) Act 2009 (ACT) s 51 and Services Industry Employer Levy Determinations 2024 (DI2024-224, from 1 April 2025) and 2026 (DI2026-228, from 1 January 2027), read 24 November 2026: 1.07% of gross ordinary wages for contract cleaning under the Services Industry Scheme, rounded half up to the cent",
].map((row) => row.split('|'));

const NSW_COMMUNITY = "Community Services Sector (Portable Long Service Leave) Act 2024 (NSW) and NSW Long Service Corporation 'Making levy contributions as a community services employer' (read 24 November 2026): ";

/** @param {string} jurisdiction @param {string} scheme @param {string} year @returns {string[] | undefined} [board, years, rate, authority] */
function payrollRule(jurisdiction, scheme, year) {
  if (jurisdiction === 'nsw' && scheme === 'community_services') {
    const [rate, words] = year === '2025-26'
      ? ['0.013', '1.3% transitional levy rate on gross ordinary wages for 2025-26, rounded half up to the cent']
      : ['0.017', '1.7% of gross ordinary wages from 1 July 2026, rounded half up to the cent'];
    return ['Long Service Corporation (NSW)', '2025-26, 2026-27', rate, NSW_COMMUNITY + words];
  }
  return PAYROLL_ROWS.find(([j, s]) => j === jurisdiction && s === scheme)?.slice(2);
}

/** @typedef {{ id: string, authority: string, value: Dec }} Step */
/** @typedef {{ year: string, jurisdiction: string, scheme: string, basis: string, board: string }} Meta */

/** The command's result: each step's amount to the cent, half up, and the scheme it applied. @param {Meta} meta @param {Step[]} steps @param {[string, Dec][]} rates */
function finish(meta, steps, rates) {
  const shown = steps.map(({ id, authority, value }) => ({ step: id, authority, value: decText(quantize(value, -2, 'half-up')) }));
  return { calculation: KIND, period: meta.year, amounts: Object.fromEntries(shown.map(({ step, value }) => [step, value])),
    rates: Object.fromEntries(rates.map(([key, value]) => [key, decText(value)])), steps: shown,
    jurisdiction: meta.jurisdiction, scheme: meta.scheme, basis: meta.basis, authority_board: meta.board };
}

/** A wage-based scheme: the rate on ordinary wages, rounded half up to the cent. @param {Meta} meta @param {Dec} wages @param {string} rate @param {string} authority */
function payrollLevy(meta, wages, rate, authority) {
  const applied = d(rate);
  return finish(meta, [{ id: 'levy', authority, value: quantize(mul(wages, applied), -2, 'half-up') }], [['rate', applied]]);
}

/** @param {Map<string, unknown>} v @param {string} jurisdiction @param {string} scheme @param {string} year @param {string} context */
function payrollScheme(v, jurisdiction, scheme, year, context) {
  const rule = payrollRule(jurisdiction, scheme, year);
  if (!rule) refuse('portable_lsl_levy.scheme_unavailable', `No portable long service leave scheme is covered for jurisdiction '${jurisdiction}' and scheme '${scheme}'.`);
  const [board, years, rate, authority] = rule;
  checkYear(jurisdiction, scheme, year, years);
  rejectPresent(v, ['project_cost', 'partial_exemption', 'paid_on_time'], context);
  const wages = requiredMoney(v, 'ordinary_wages', context);
  return payrollLevy({ year, jurisdiction, scheme, basis: 'ordinary_wages', board }, wages, rate, authority);
}

const TAS = "Construction Industry (Long Service) Act 1997 (Tas) s 7 and TasBuild 'Employers Information' FAQ (read 24 November 2026): ";

/** @param {Map<string, unknown>} v @param {string} year */
function tasConstruction(v, year) {
  const context = 'Tasmania construction portable LSL levy';
  checkYear('tas', 'construction', year, '2026-27');
  rejectPresent(v, ['project_cost', 'partial_exemption'], context);
  if (!v.has('paid_on_time')) {
    refuse('input.missing_field', 'paid_on_time is required for Tasmania construction (true for the 1.8% on-time discounted rate, false for the 2.5% standard rate).');
  }
  const onTime = flag(v.get('paid_on_time'), 'paid_on_time');
  const wages = requiredMoney(v, 'ordinary_wages', context);
  const [rate, words] = onTime
    ? ['0.018', '1.8% discounted rate on ordinary pay when returns and invoices are lodged and paid by the due dates, rounded half up to the cent']
    : ['0.025', '2.5% standard contribution rate on ordinary pay, rounded half up to the cent'];
  return payrollLevy({ year, jurisdiction: 'tas', scheme: 'construction', basis: 'ordinary_wages', board: 'TasBuild (Tasmania)' }, wages, rate, TAS + words);
}

/** The project cost a construction levy is on, after its checks. @param {Map<string, unknown>} v @param {string} context */
function projectCost(v, context) {
  rejectPresent(v, ['ordinary_wages', 'paid_on_time'], context);
  if (v.has('partial_exemption') && flag(v.get('partial_exemption'), 'partial_exemption')) {
    refuse('portable_lsl_levy.exemption_unsupported', `Partial or special exemptions (owner-builder, non-profit, church, Crown or local government reductions) are outside ${context}.`);
  }
  return requiredMoney(v, 'project_cost', context);
}

/** @param {string} id @param {string} authority @returns {Step} */
const nil = (id, authority) => ({ id, authority, value: ZERO });

/** @param {Map<string, unknown>} v @param {string} year */
function nswConstruction(v, year) {
  checkYear('nsw', 'construction', year, '2023-24, 2024-25, 2025-26, 2026-27');
  const cost = projectCost(v, 'NSW building and construction levy');
  const [threshold, applied] = [d('250000'), d('0.0025')];
  const step = cmp(cost, threshold) < 0
    ? nil('levy', "Building and Construction Industry Long Service Payments Act 1986 (NSW) and NSW Long Service Corporation 'About the long service levy' (read 24 November 2026): no levy is payable on works costing less than $250,000 (including GST)")
    : { id: 'levy', authority: "Building and Construction Industry Long Service Payments Act 1986 (NSW) and NSW Long Service Corporation 'About the long service levy for the building and construction industry' and Building Levy Calculator (verified 24 November 2026): 0.25% of the cost of works of $250,000 or more (including GST), rounded down to the whole dollar",
      value: quantize(mul(cost, applied), 0, 'down') };
  return finish({ year, jurisdiction: 'nsw', scheme: 'construction', basis: 'project_cost', board: 'Long Service Corporation (NSW)' },
    [step], [['threshold', threshold], ['rate', applied]]);
}

const QLD_ACT = 'Building and Construction Industry (Portable Long Service Leave) Act 1991 (Qld) s 72';
const QLD_PARTS = [
  ['lsl_levy', '0.0035', `${QLD_ACT}(1)(b) and (2) and Regulation 2024 s 8(b): 0.35% of cost of work (excluding GST), rounded to the nearest dollar with 50c rounded downwards`],
  ['training_levy', '0.001', `${QLD_ACT}(1)(a) and (2) and Regulation 2024 s 8(a): 0.1% CSQ training levy on cost of work (excluding GST), rounded to the nearest dollar with 50c rounded downwards`],
  ['whs_levy', '0.00125', `${QLD_ACT}(1)(c) and (2) and Regulation 2024 s 8(c): 0.125% WHSQ levy on cost of work (excluding GST), rounded to the nearest dollar with 50c rounded downwards`],
];

/** @param {Map<string, unknown>} v @param {string} year */
function qldConstruction(v, year) {
  checkYear('qld', 'construction', year, '2025-26, 2026-27');
  const cost = projectCost(v, 'Queensland building and construction levy');
  const threshold = d('150000');
  const below = 'Building and Construction Industry (Portable Long Service Leave) Regulation 2024 (Qld) ss 9 and 11 (SL No. 162 of 2024, read 24 November 2026): levy is not payable when the cost of work (excluding GST, s 73(1)) is less than $150,000';
  const parts = QLD_PARTS.map(([id, rate, authority]) => (cmp(cost, threshold) < 0 ? nil(id, below) : { id, authority, value: dollarsHalfDown(mul(cost, d(rate))) }));
  const total = { id: 'levy', authority: `${QLD_ACT} and QLeave 'What is the levy?' (read 24 November 2026): combined QLeave portable long service leave, CSQ training and WHSQ levies payable`,
    value: parts.reduce((sum, part) => add(sum, part.value), ZERO) };
  return finish({ year, jurisdiction: 'qld', scheme: 'construction', basis: 'project_cost', board: 'QLeave (Queensland)' }, [...parts, total],
    [['threshold', threshold], ...QLD_PARTS.map(([id, rate]) => /** @type {[string, Dec]} */ ([id.replace('levy', 'rate'), d(rate)])), ['combined_rate', d('0.00575')]]);
}

/** @param {Map<string, unknown>} v @param {string} year */
function ntConstruction(v, year) {
  checkYear('nt', 'construction', year, '2026-27');
  const cost = projectCost(v, 'Northern Territory construction levy');
  const [threshold, upper, applied] = [d('1000000'), d('5000000000'), d('0.001')];
  if (cmp(cost, upper) > 0) {
    refuse('portable_lsl_levy.project_cost_above_tier', 'Northern Territory construction projects over $5 billion are subject to a two-tier ministerial levy determination, which this worksheet does not calculate.');
  }
  const step = cmp(cost, threshold) < 0
    ? nil('levy', "Construction Industry Long Service Leave and Benefits Act 2005 (NT) and NT Build 'Levy Payers' (read 24 November 2026): no levy is payable on construction projects with a total contract price under $1,000,000 (including GST)")
    : { id: 'levy', authority: "Construction Industry Long Service Leave and Benefits Act 2005 (NT) s 33 and NT Build 'Levy Payers' (read 24 November 2026): 0.1% of total cost of construction work (including GST) from $1 million to $5 billion, rounded to the nearest dollar with 50c rounded downwards",
      value: dollarsHalfDown(mul(cost, applied)) };
  return finish({ year, jurisdiction: 'nt', scheme: 'construction', basis: 'project_cost', board: 'NT Build (Northern Territory)' },
    [step], [['threshold', threshold], ['upper_tier_limit', upper], ['rate', applied]]);
}

const CONSTRUCTION = { nsw: nswConstruction, qld: qldConstruction, nt: ntConstruction, tas: tasConstruction };

/**
 * The command's result for one state or territory scheme: period, amounts (cents, half up), rates, the steps with
 * their authorities, and the jurisdiction, scheme, basis and board. Refuses as the command does, by code.
 * @param {Record<string, unknown>} call
 */
export function portableLslLevy(call) {
  const v = readCall(call);
  if (v.get('scope_confirmed') !== true) refuse('scope.not_confirmed', 'Establish all stated scope conditions before calculating.');
  const year = v.get('year');
  if (typeof year !== 'string' || !PLSL_YEARS.includes(year)) refuse('period.unsupported', `Unsupported period ${JSON.stringify(year)}; supported: ${[...PLSL_YEARS].reverse().join(', ')}.`);
  const [jurisdiction, scheme] = [v.get('jurisdiction'), v.get('scheme')];
  if (typeof jurisdiction !== 'string' || !JURISDICTIONS.includes(jurisdiction)) {
    refuse('portable_lsl_levy.jurisdiction_invalid', 'jurisdiction must be cth, nsw, vic, qld, sa, wa, act, tas or nt.');
  }
  if (typeof scheme !== 'string' || !SCHEMES.includes(scheme)) {
    refuse('portable_lsl_levy.scheme_invalid', 'scheme must be coal, construction, community_services, contract_cleaning or security.');
  }
  if (jurisdiction === 'cth' || scheme === 'coal') {
    const coal = jurisdiction === 'cth' && scheme === 'coal' ? 'Coal LSL is the Coal LSL levy calculator’s' : "use jurisdiction 'cth' with scheme 'coal' for Coal LSL";
    refuse('portable_lsl_levy.scheme_unavailable', `No portable long service leave scheme is covered for jurisdiction '${jurisdiction}' and scheme '${scheme}' (${coal}).`);
  }
  const context = `${jurisdiction} ${scheme} portable LSL levy`;
  rejectPresent(v, COAL_FIELDS, context);
  const construction = scheme === 'construction' ? CONSTRUCTION[/** @type {keyof typeof CONSTRUCTION} */ (jurisdiction)] : undefined;
  return construction ? construction(v, year) : payrollScheme(v, jurisdiction, scheme, year, context);
}

const PLACES = { nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland', sa: 'South Australia', wa: 'Western Australia', act: 'ACT', tas: 'Tasmania',
  nt: 'Northern Territory' };
const INDUSTRIES = { construction: 'construction', community_services: 'community services', contract_cleaning: 'contract cleaning', security: 'security' };
const STEP_LABELS = { lsl_levy: 'Portable LSL levy', training_levy: 'CSQ training levy', whs_levy: 'WHSQ levy', levy: 'Levy payable' };
const yes = (/** @type {string} */ text) => text === 'yes';

/** The command's call from the page's form: a project cost for NSW, Queensland and NT construction, otherwise ordinary wages. @param {(name: string) => string} value */
export function plslFormInput(value) {
  const [jurisdiction, scheme] = [value('jurisdiction'), value('scheme')];
  /** @type {Record<string, unknown>} */
  const call = { jurisdiction, scheme, year: value('year'), scope_confirmed: true };
  const amount = value('amount').trim() || '0';
  const construction = scheme === 'construction';
  if (construction && ['nsw', 'qld', 'nt'].includes(jurisdiction)) Object.assign(call, { project_cost: amount, partial_exemption: yes(value('exemption')) });
  else call.ordinary_wages = amount;
  if (construction && jurisdiction === 'tas') call.paid_on_time = yes(value('onTime'));
  return call;
}

/** How a call reads on the page. @param {Record<string, any>} x @param {(value: number) => string} aud */
export function plslInputsText(x, aud) {
  const place = PLACES[/** @type {keyof typeof PLACES} */ (x.jurisdiction)];
  const industry = INDUSTRIES[/** @type {keyof typeof INDUSTRIES} */ (x.scheme)];
  const basis = 'project_cost' in x ? `project cost ${aud(Number(x.project_cost))}` : `ordinary wages ${aud(Number(x.ordinary_wages))}`;
  const extra = 'paid_on_time' in x ? `; ${x.paid_on_time ? 'paid on time' : 'not paid on time'}` : '';
  return `${x.year}; ${place} ${industry}; ${basis}${extra}${x.partial_exemption ? '; partial exemption' : ''}`;
}

/** The amounts a page shows for one call, as numbers. @param {Record<string, unknown>} input */
export function plslFigures(input) {
  return { levy: Number(portableLslLevy(input).amounts.levy) };
}

const ROUNDING = 'Wage-based levies round half up to the cent; NSW construction rounds down to the whole dollar, and Queensland and NT construction round to the nearest dollar with 50 cents rounded down';

const PAGE_REFUSALS = {
  'input.amount_invalid': 'Enter the amount from $0 to $1,000,000,000,000, to the cent.',
  'input.decimal_unreadable': 'Enter the amount as a number, such as 1250.50.',
  'portable_lsl_levy.scheme_unavailable': 'There is no portable long service leave scheme for that industry in that state or territory here: choose another industry.',
};

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function plslResult(value, aud) {
  const input = plslFormInput(value);
  let r;
  try {
    r = portableLslLevy(input);
  } catch (error) {
    const words = PAGE_REFUSALS[/** @type {keyof typeof PAGE_REFUSALS} */ (/** @type {{ code?: string }} */ (error).code)];
    throw words ? new Error(words) : error;
  }
  const percent = (/** @type {string} */ rate) => `${String(Number((Number(rate) * 100).toFixed(4)))}%`;
  const rows = [['Board', r.authority_board], ['Levied on', r.basis === 'project_cost' ? 'The cost of the building or construction work' : 'Ordinary wages']];
  if (r.rates.rate) rows.push(['Rate', percent(r.rates.rate)]);
  else rows.push(['Rate', `${percent(r.rates.combined_rate)} in 3 parts`]);
  if (r.rates.threshold) rows.push(['No levy below', aud(Number(r.rates.threshold))]);
  for (const s of r.steps) rows.push([STEP_LABELS[/** @type {keyof typeof STEP_LABELS} */ (s.step)], aud(Number(s.value))]);
  return { inputs: plslInputsText(input, aud), rows, principal: rows.length - 1, note: ROUNDING };
}
