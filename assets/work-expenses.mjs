// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// An employee's working from home, car and self-education deductions for one income year from
// 2020-21 to 2026-27, one method a calculation, as the `work-expenses` command of
// ryanduguid/australian-accounting works them. Sources, read 22 November 2026:
// - PCG 2023/1 paras 14, 15, 18, 23 to 26A (Table 1: 67c for 2022-23 and 2023-24, 70c from 1 July
//   2024) and 49 to 59; the ATO's 'Fixed rate method - 52 cents' and 'Shortcut method' pages
//   (PCG 2020/3, 80c) for 2020-21 and 2021-22; the ATO's 'Actual cost method' page.
// - ITAA 1997 ss 28-12, 28-25, 28-90, 28-115 and 28-120, and the cents per kilometre rate for each
//   year under s 28-25(4): 72c (2020-21 and 2021-22), 78c, 85c, 88c (2024-25 and 2025-26), 91c.
// - ITAA 1997 s 8-1, TR 2024/3 and the ATO's 'Self-education expenses' page; the $250 reduction of
//   ITAA 1936 s 82A as the ATO's 'Self-education reduction in expenses' and TR 98/9 apply it, for
//   2021-22 and earlier (Act No. 84, 2022, Schedule 3 items 26 and 33).
// Amounts carry exactly as big integers; a division (the log book's business use percentage)
// keeps 40 significant digits, rounding half to even, as the command does. Each amount shows
// rounded half up to the cent, and a return amount disregards the cents of the unrounded total.

import { number } from './money.mjs';

export const WORK_EXPENSES_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
export const WORK_EXPENSES_METHODS = ['home_office', 'car_cents_per_kilometre', 'car_log_book', 'self_education'];
/** Hourly working from home rates in cents: the fixed rate, and the 80c shortcut to 2021-22. */
export const HOME_OFFICE_RATES = /** @type {Record<string, { fixed: number, shortcut?: number }>} */ ({
  '2020-21': { fixed: 52, shortcut: 80 }, '2021-22': { fixed: 52, shortcut: 80 }, '2022-23': { fixed: 67 },
  '2023-24': { fixed: 67 }, '2024-25': { fixed: 70 }, '2025-26': { fixed: 70 }, '2026-27': { fixed: 70 },
});
/** Cents per kilometre under s 28-25(4), by income year. */
export const CENTS_PER_KILOMETRE = /** @type {Record<string, number>} */ ({
  '2020-21': 72, '2021-22': 72, '2022-23': 78, '2023-24': 85, '2024-25': 88, '2025-26': 88, '2026-27': 91,
});
export const KILOMETRE_CAP = 5000;
export const SELF_EDUCATION_REDUCTION = 250;
const CONNECTIONS = ['maintains_or_improves_skills', 'increases_income', 'general_only', 'new_employment'];
const HOME_AMOUNTS = ['energy', 'phone', 'internet', 'stationery', 'cleaning', 'furniture_decline', 'asset_decline', 'repairs'];
const PRECISION = 40;
// Amounts are held in ten-thousandths of a dollar: hundredths of an hour times a rate in cents.
const UNIT = 10000n;

/** @typedef {Record<string, string | boolean | undefined>} WorkExpensesFacts */
/** @typedef {{ c: bigint, e: number }} Exact a value c x 10^e */
/** @typedef {{ method: string, year: string, amounts: Record<string, string>, rates: Record<string, string>,
 *   methodsAvailable?: string[], higherMethod?: string, fixedRateUnavailable?: string | null,
 *   kilometresDiscarded?: boolean, logBookValidTo?: string, deductible?: boolean, reductionApplies?: boolean }} WorkExpenses */

/** @param {string} code @param {string} message @returns {never} */
export function refuseWorkExpenses(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** @param {WorkExpensesFacts} facts @param {string} name */
function flag(facts, name) {
  const value = facts[name];
  if (typeof value !== 'boolean') return refuseWorkExpenses('input.flag_invalid', `Answer yes or no: ${name.replace(/_/g, ' ')}.`);
  return value;
}

/** An amount of at most 2 decimal places from 0 to $1,000,000,000,000, in ten-thousandths.
 * @param {WorkExpensesFacts} facts @param {string} name */
function amount(facts, name) {
  try {
    return BigInt(Math.round(number(facts[name], { max: 1e12, money: true }) * 100)) * 100n;
  } catch {
    return refuseWorkExpenses('input.amount_invalid',
      `${name.replace(/_/g, ' ')} must be a number from 0 to 1,000,000,000,000 with up to 2 decimal places.`);
  }
}

/** Digits in a positive integer. @param {bigint} n */
const digits = (n) => n.toString().length;

/** `x` rounded half to even to at most 40 significant digits. @param {Exact} x @returns {Exact} */
function significant({ c, e }) {
  const drop = digits(c) - PRECISION;
  if (drop <= 0) return { c, e };
  const scale = 10n ** BigInt(drop);
  let q = c / scale;
  const twice = 2n * (c % scale);
  if (twice > scale || (twice === scale && q % 2n === 1n)) q += 1n;
  return significant({ c: q, e: e + drop });
}

/** `n / d` for positive integers, to 40 significant digits. @param {bigint} n @param {bigint} d @returns {Exact} */
function quotient(n, d) {
  if (n === 0n) return { c: 0n, e: 0 };
  // At least 42 digits of the quotient, so 2 or more fall below the 40th; a last digit of 1 stands
  // for any remainder, so a quotient just above a half rounds up and only an exact half goes to even.
  const shift = PRECISION + 2 + digits(d) - digits(n);
  const scaled = shift >= 0 ? n * 10n ** BigInt(shift) : n;
  const divisor = shift >= 0 ? d : d * 10n ** BigInt(-shift);
  const sticky = scaled % divisor === 0n ? 0n : 1n;
  return significant({ c: (scaled / divisor) * 10n + sticky, e: -shift - 1 });
}

/** An exact value as a fraction. @param {Exact} x @returns {{ num: bigint, den: bigint }} */
const rational = ({ c, e }) => (e >= 0 ? { num: c * 10n ** BigInt(e), den: 1n } : { num: c, den: 10n ** BigInt(-e) });

/** A value as the command shows it: half up to the cent, 2 places. @param {{ num: bigint, den: bigint }} x */
function centsText({ num, den }) {
  const cents = (2n * num * 100n + den) / (2n * den);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

/** The return amount: the unrounded total with its cents disregarded. @param {{ num: bigint, den: bigint }} x */
const wholeText = ({ num, den }) => `${num / den}.00`;

/** Ten-thousandths as a rational. @param {bigint} units */
const units = (units) => ({ num: units, den: UNIT });

/** The year and method, once the scope is confirmed and nothing reimbursed or paid by an allowance.
 * @param {WorkExpensesFacts} facts */
function checkScope(facts) {
  if (facts.scope_confirmed !== true) {
    refuseWorkExpenses('scope.not_confirmed', 'Confirm the conditions above before calculating.');
  }
  const year = String(facts.year);
  if (!WORK_EXPENSES_YEARS.includes(year)) {
    refuseWorkExpenses('scope.period_unsupported', 'Choose an income year from 2020-21 to 2026-27.');
  }
  const method = String(facts.method);
  if (!WORK_EXPENSES_METHODS.includes(method)) refuseWorkExpenses('work_expenses.method_invalid', 'Choose a method.');
  if (flag(facts, 'reimbursed')) {
    refuseWorkExpenses('work_expenses.reimbursed', 'An expense reimbursed or paid for by an employer or anyone else is '
      + 'outside this calculator: enter only expenses you incurred and bore (PCG 2023/1 para 50).');
  }
  if (flag(facts, 'allowance_received')) {
    refuseWorkExpenses('work_expenses.allowance_received', 'An allowance for these expenses brings in the reasonable allowance '
      + 'substantiation exceptions and occupation-specific guidance, which this calculator does not apply.');
  }
  return { year, method, first: Number(year.slice(0, 4)) };
}

/** The hours in hundredths, each expense in ten-thousandths, and the 2 answers every hourly rate turns on.
 * @param {WorkExpensesFacts} facts @param {string} year @param {number} first */
function homeInputs(facts, year, first) {
  const early = first < 2022;
  const hours = amount(facts, 'hours') / 100n;
  const x = Object.fromEntries(HOME_AMOUNTS.map((name) => [name, amount(facts, name)]));
  // An income year whose February has 29 days holds 366.
  const days = (first + 1) % 4 === 0 ? 366 : 365;
  if (hours > BigInt(24 * days) * 100n) {
    refuseWorkExpenses('work_expenses.fact_conflict', `Hours cannot exceed the ${(24 * days).toLocaleString('en-AU')} hours in ${year}.`);
  }
  const incurred = flag(facts, 'running_expenses_incurred');
  const dedicated = !early || flag(facts, 'dedicated_home_office');
  // From 2022-23 the kinds the fixed rate covers (PCG 2023/1 para 14); before then any running expense.
  const running = ['energy', 'phone', 'internet', 'stationery', ...(early ? ['cleaning'] : [])];
  if (!incurred && running.some((name) => x[name] !== 0n)) {
    refuseWorkExpenses('work_expenses.fact_conflict', `You answered that no additional running expenses were incurred, yet `
      + `${early ? 'energy, phone, internet, stationery or cleaning' : 'energy, phone, internet or stationery'} has an amount.`);
  }
  return { early, hours, x, incurred, dedicated };
}

/** Working from home: each available hourly method beside the actual cost.
 * @param {WorkExpensesFacts} facts @param {string} year @param {number} first @returns {WorkExpenses} */
function homeOffice(facts, year, first) {
  const { early, hours, x, incurred, dedicated } = homeInputs(facts, year, first);
  const { fixed, shortcut } = HOME_OFFICE_RATES[year];
  /** @type {Record<string, string>} */
  const amounts = {};
  /** @type {[string, bigint][]} */
  const methods = [];
  const show = (/** @type {string} */ id, /** @type {bigint} */ value) => { amounts[id] = centsText(units(value)); };
  const back = (/** @type {string} */ id, /** @type {bigint} */ value) => { amounts[id] = wholeText(units(value)); };
  if (incurred && dedicated) {
    const hourly = hours * BigInt(fixed);
    const beside = (early ? ['phone', 'internet', 'stationery', 'asset_decline', 'repairs']
      : ['cleaning', 'furniture_decline', 'asset_decline', 'repairs']).reduce((sum, name) => sum + x[name], 0n);
    show('fixed_rate_amount', hourly);
    show('fixed_rate_separate_expenses', beside);
    show('fixed_rate_method', hourly + beside);
    back('fixed_rate_return_amount', hourly + beside);
    methods.push(['fixed_rate', hourly + beside]);
  }
  if (incurred && shortcut) {
    show('shortcut_method', hours * BigInt(shortcut));
    back('shortcut_return_amount', hours * BigInt(shortcut));
    methods.push(['shortcut', hours * BigInt(shortcut)]);
  }
  const actual = HOME_AMOUNTS.reduce((sum, name) => sum + x[name], 0n);
  show('actual_cost_method', actual);
  back('actual_cost_return_amount', actual);
  methods.push(['actual_cost', actual]);
  // The first listed wins a tie, so a fixed rate equal to the actual cost is named.
  const higher = methods.reduce((best, m) => (m[1] > best[1] ? m : best));
  return { method: 'home_office', year, amounts, rates: rateTexts(fixed, shortcut, incurred && Boolean(shortcut)),
    methodsAvailable: methods.map(([name]) => name), higherMethod: higher[0],
    fixedRateUnavailable: !incurred ? 'no-running-expenses' : dedicated ? null : 'no-dedicated-home-office' };
}

/** @param {number} fixed @param {number | undefined} shortcut @param {boolean} withShortcut */
function rateTexts(fixed, shortcut, withShortcut) {
  /** @type {Record<string, string>} */
  const rates = { fixed_rate: `0.${String(fixed).padStart(2, '0')}` };
  if (withShortcut && shortcut) rates.shortcut_rate = `0.${shortcut}`;
  return rates;
}

/** @param {WorkExpensesFacts} facts */
function carHeld(facts) {
  if (!flag(facts, 'owned_or_leased')) {
    refuseWorkExpenses('work_expenses.car_not_held', 'Division 28’s methods are for a car you owned or leased '
      + '(ITAA 1997 s 28-12(1)); for any other car this calculator does not work out a deduction.');
  }
}

/** Cents per kilometre: s 28-25. @param {WorkExpensesFacts} facts @param {string} year @returns {WorkExpenses} */
function centsPerKilometre(facts, year) {
  carHeld(facts);
  const kilometres = amount(facts, 'business_kilometres');
  const cap = BigInt(KILOMETRE_CAP) * UNIT;
  const counted = kilometres < cap ? kilometres : cap;
  const rate = CENTS_PER_KILOMETRE[year];
  // Ten-thousandths of a kilometre times cents is millionths of a dollar.
  const deduction = { num: counted * BigInt(rate), den: UNIT * 100n };
  return { method: 'car_cents_per_kilometre', year,
    amounts: { claimed_kilometres: centsText(units(counted)), deduction: centsText(deduction), return_amount: wholeText(deduction) },
    rates: { rate_per_kilometre: `0.${rate}`, kilometre_cap: String(KILOMETRE_CAP) }, kilometresDiscarded: kilometres > cap };
}

/** The log book's first year, once it serves `first`, covers 12 weeks and still represents the car's use.
 * @param {WorkExpensesFacts} facts @param {string} year @param {number} first */
function logBookKept(facts, year, first) {
  const text = String(facts.log_book_year ?? '');
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  const kept = match ? Number(match[1]) : NaN;
  if (!match || Number(match[2]) !== (kept + 1) % 100) {
    refuseWorkExpenses('work_expenses.fact_invalid', 'Enter the log book’s income year as YYYY-YY.');
  }
  if (kept > first) refuseWorkExpenses('work_expenses.fact_conflict', 'The log book’s year cannot be after the year claimed.');
  if (first - kept > 4) {
    refuseWorkExpenses('work_expenses.log_book_expired', `A log book kept for ${text} serves that year and the next 4 only `
      + `(ITAA 1997 s 28-115(2)); a new one is needed for ${year}.`);
  }
  const weeks = String(facts.log_book_weeks ?? '');
  if (!/^\d{1,6}$/.test(weeks)) refuseWorkExpenses('work_expenses.fact_invalid', 'Enter the log book’s weeks as a whole number.');
  if (Number(weeks) < 12) {
    refuseWorkExpenses('work_expenses.log_book_too_short', 'A log book must cover a continuous period of at least 12 weeks '
      + '(ITAA 1997 s 28-120(1)); the shorter period for a car held under 12 weeks is outside this calculator.');
  }
  if (!flag(facts, 'log_book_representative')) {
    refuseWorkExpenses('work_expenses.log_book_unrepresentative', 'A log book that no longer represents the car’s business use, '
      + 'as after a change of job or home, does not serve: a new 12 week log book is needed (ATO ‘Logbook method’).');
  }
  return kept;
}

/** Log book: s 28-90. @param {WorkExpensesFacts} facts @param {string} year @param {number} first @returns {WorkExpenses} */
function logBook(facts, year, first) {
  carHeld(facts);
  const kept = logBookKept(facts, year, first);
  const business = amount(facts, 'business_kilometres');
  const total = amount(facts, 'total_kilometres');
  const expenses = amount(facts, 'car_expenses') / 100n;
  if (total === 0n || business > total) {
    refuseWorkExpenses('work_expenses.fact_conflict', 'Total kilometres must be above 0 and at least the business kilometres (s 28-90(3)).');
  }
  // The percentage keeps 40 digits; times the expenses in cents, 40 digits again; then over 100.
  const share = quotient(business, total);
  const percentage = { c: share.c, e: share.e + 2 };
  const product = significant({ c: expenses * percentage.c, e: percentage.e - 2 });
  const deduction = rational({ c: product.c, e: product.e - 2 });
  return { method: 'car_log_book', year,
    amounts: { business_use_percentage: centsText(rational(percentage)), deduction: centsText(deduction), return_amount: wholeText(deduction) },
    rates: {}, logBookValidTo: `${kept + 4}-${String((kept + 5) % 100).padStart(2, '0')}` };
}

/** Self-education: s 8-1 and, to 2021-22 for a prescribed course, s 82A.
 * @param {WorkExpensesFacts} facts @param {string} year @param {number} first @returns {WorkExpenses} */
function selfEducation(facts, year, first) {
  const early = first < 2022;
  if (!CONNECTIONS.includes(String(facts.connection))) refuseWorkExpenses('work_expenses.fact_invalid', 'Choose how the course relates to your work.');
  const employed = flag(facts, 'employed_when_incurred');
  const connected = employed && ['maintains_or_improves_skills', 'increases_income'].includes(String(facts.connection));
  const [a, b, c, d] = ['category_a', 'category_b', 'category_c', 'category_d'].map((name) => amount(facts, name));
  if (facts.log_book_car_in_category_a !== undefined) {
    const logBookCar = flag(facts, 'log_book_car_in_category_a');
    if (d !== 0n && logBookCar) {
      refuseWorkExpenses('work_expenses.fact_conflict', 'Category D, cents per kilometre car expenses, cannot be claimed beside log '
        + 'book car expenses in category A: a car’s expenses take one method (ATO ‘Self-education reduction in expenses’).');
    }
  } else if (d !== 0n) {
    refuseWorkExpenses('input.missing_field', 'Answer whether category A includes log book car expenses, as category D is above 0.');
  }
  const prescribed = early && flag(facts, 'prescribed_course');
  const e = prescribed ? amount(facts, 'category_e') : 0n;
  /** @type {Record<string, string>} */
  const amounts = {};
  /** @type {Record<string, string>} */
  const rates = {};
  let deduction = a + b + c + d;
  if (!connected) deduction = 0n;
  else if (prescribed) {
    const offset = c + d + e;
    const threshold = BigInt(SELF_EDUCATION_REDUCTION) * UNIT;
    const reduction = threshold > offset ? threshold - offset : 0n;
    const reduced = a > reduction ? a - reduction : 0n;
    Object.assign(amounts, { reduction_offset: centsText(units(offset)), reduction: centsText(units(reduction)),
      category_a_after_reduction: centsText(units(reduced)) });
    rates.self_education_reduction = String(SELF_EDUCATION_REDUCTION);
    deduction = reduced + b + c + d;
  }
  Object.assign(amounts, { deduction: centsText(units(deduction)), return_amount: wholeText(units(deduction)) });
  return { method: 'self_education', year, amounts, rates, deductible: connected, reductionApplies: connected && prescribed };
}

/** The worksheet for one method and year. Facts use the command's input names.
 * @param {WorkExpensesFacts} facts @returns {WorkExpenses} */
export function workExpenses(facts) {
  const { year, method, first } = checkScope(facts);
  if (method === 'home_office') return homeOffice(facts, year, first);
  if (method === 'car_cents_per_kilometre') return centsPerKilometre(facts, year);
  if (method === 'car_log_book') return logBook(facts, year, first);
  return selfEducation(facts, year, first);
}
