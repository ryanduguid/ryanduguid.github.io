// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { financeSchedule } from './finance-schedule.mjs';
import { ratioCents } from './money.mjs';

// Borrowing expenses under ITAA 1997 s 25-25 for several loans and every income year of each:
// the `borrowing-expenses-schedule` command of ryanduguid/australian-accounting ported line for
// line, with its inputs, rounding and refusal codes. Read 19 November 2026 on the ATO's legal
// database: s 25-25 (its step 1 last substituted by Act No 15 of 2017 from 1 April 2017), s 26-50
// and s 26-155 (inserted by Act No 49 of 2026 for 2027-28 and later years), with the ATO's
// 'Borrowing expenses' page (QC103910, last updated 22 May 2026) and the Acts Interpretation Act
// 1901 ss 2G(2) and 36(1).
//
// The optional accounting column applies AASB 9 (compilation 6) and AASB 123 (compilation 2)
// to the same loans: the borrowing expenses as transaction costs at initial recognition (AASB 9
// para 5.1.1), amortised by the effective interest method (Appendix A; paras B5.4.1 to B5.4.4),
// written off when the loan is extinguished (paras 3.3.1 to 3.3.3), and the 10% test of para
// B3.3.6 for a refinancing with the same lender. Which fees are integral, the expected life and
// whether an asset qualifies under AASB 123 stay the user's judgements.

export const BORROWING_READ = '2026-11-19';
/** The income years the command supports: loans first drawn from 1 July 2017 to 2027-28, the last year read. */
export const BORROWING_YEARS = Array.from({ length: 11 }, (_, i) => yearLabel(2017 + i));
const FIRST_YEAR = 2017;
const LAST_YEAR = 2027;
const FACTS = ['borrowing_expenses', 'loan_start', 'loan_term_end', 'repaid_on', 'income_use', 'section_26_50_applies', 'refinances'];
const REQUIRED = FACTS.slice(0, 6);
const ACCOUNTING_FACTS = ['amount', 'annual_rate', 'payments', 'balloon_percent', 'qualifying_asset', 'same_lender', 'lender_fees'];

export const BORROWING_S26_50 = 'Section 26-50 denies deductions for a leisure facility, such as a holiday home, unless s 26-50(3) applies at all times in the income year; part-year use under s 26-50(4) is out of scope.';
const S26_155 = 'From 2027-28 ITAA 1997 s 26-155(1) may quarantine this deduction where the money is used for a residential dwelling held for rent: the amounts here are s 25-25’s before s 26-155, which this page neither applies nor decides the exceptions to.';
const PROJECTED = 'A row marked projected is after 2027-28, the last income year read: it applies s 25-25 as read on 19 November 2026, and a later amendment would change it.';

/** @param {string} code @param {string} message @returns {never} */
function refuse(code, message) {
  throw Object.assign(new Error(message), { code });
}
/** A refusal for loan `n`, its code kept. @template T @param {number} n @param {() => T} work @returns {T} */
function at(n, work) {
  try {
    return work();
  } catch (error) {
    if (error instanceof Error && 'code' in error) error.message = `loan ${n}: ${error.message}`;
    throw error;
  }
}

const DAY = 86400000;
/** @param {number} day */
const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** A YYYY-MM-DD date from 1900 to 2100 as whole days since 1970, or null. @param {unknown} text */
function dayOf(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text) || text < '1900-01-01' || text > '2100-12-31') return null;
  const day = Date.parse(`${text}T00:00:00Z`) / DAY;
  return Number.isInteger(day) && isoOf(day) === text ? day : null;
}
/** @param {number} day */
const civil = (day) => { const d = new Date(day * DAY); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
/** The same day `months` months on, the month's last day where it has no such day. @param {number} day @param {number} months */
function addMonths(day, months) {
  const [y, m, d] = civil(day);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return Date.UTC(y, m - 1 + months, Math.min(d, last)) / DAY;
}
/** 1 July of `first`. @param {number} first */
const yearStart = (first) => Date.UTC(first, 6, 1) / DAY;
/** `2026-27` for 2026. @param {number} first */
function yearLabel(first) {
  return `${first}-${String((first + 1) % 100).padStart(2, '0')}`;
}
/** The calendar year the income year holding `day` starts in. @param {number} day */
const yearOfDay = (day) => { const [y, m] = civil(day); return m >= 7 ? y : y - 1; };
/** @param {string} text */
const yearFirst = (text) => (/^\d{4}-\d{2}$/.test(text) && yearLabel(Number(text.slice(0, 4))) === text ? Number(text.slice(0, 4)) : null);

/** An amount as whole cents: digits with at most 2 decimal places, up to $1,000,000,000,000. @param {unknown} text */
function moneyCents(text) {
  const bad = () => refuse('input.amount_invalid', 'Amounts must be finite non-negative Decimals, at most 2dp and 1e12.');
  if (typeof text !== 'string' || !/^\d+(\.\d{1,2})?$/.test(text)) return bad();
  const [whole, part = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt(part.padEnd(2, '0'));
  return cents > 100000000000000n ? bad() : cents;
}
/** A decimal fraction from 0 to 1 as an exact ratio, or null. @param {unknown} text */
function fraction(text) {
  if (typeof text !== 'string' || !/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, part = ''] = text.split('.');
  const den = 10n ** BigInt(part.length);
  const num = BigInt(whole) * den + BigInt(part || '0');
  return num <= den ? { num, den, text } : null;
}
/** Cents as '318.07'. @param {bigint} cents */
const shown = (cents) => `${cents < 0n ? '-' : ''}${(cents < 0n ? -cents : cents) / 100n}.${String((cents < 0n ? -cents : cents) % 100n).padStart(2, '0')}`;

/**
 * @typedef {{num: bigint, den: bigint, text: string}} Share
 * @typedef {{first: number, end: number, remaining: bigint, left: number, days: number, maximum: bigint}} SpreadYear
 * @typedef {{start: number, termEnd: number | null, repaid: number | null, firstYear: number}} LoanDates
 * @typedef {{expenditure: bigint, loan: LoanDates, years: SpreadYear[], uses: Share[], refinances: number | null}} LoanFacts
 * @typedef {{income_year: string, first: number, period_of_the_loan_to: string | null, remaining: bigint, left: number | null,
 *   days: number | null, maximum: bigint, use: string, deduction: bigint, after: bigint, section_26_155: boolean, projected: boolean}} BorrowingRow
 * @typedef {{loan: number, borrowingExpenses: bigint, from: string, to: string | null, basis: string | null, spread: string,
 *   refinances: number | null, refinancedBy: number | null, rows: BorrowingRow[], total: bigint, notes: string[]}} BorrowingLoan
 */

/** s 25-25(5)(c): 5 years from `start`, that day counted; from 29 February they end on 28 February. @param {number} start */
function fiveYearsEnd(start) {
  const same = addMonths(start, 60);
  return civil(same)[2] === civil(start)[2] ? same - 1 : same;
}
/** s 25-25(5): the shortest period, as determined at the end of the year ending on `last`. @param {LoanDates} loan @param {number} last */
function endAt(loan, last) {
  const five = fiveYearsEnd(loan.start);
  const planned = loan.termEnd === null ? five : Math.min(loan.termEnd, five);
  return loan.repaid !== null && loan.repaid <= last ? Math.min(planned, loan.repaid) : planned;
}
/** @param {LoanDates} loan @param {number} end */
function basis(loan, end) {
  if (loan.termEnd === end) return 's 25-25(5)(a): the original loan contract';
  if (loan.repaid === end) return 's 25-25(5)(b): to the day the loan was repaid';
  return 's 25-25(5)(c): 5 years from the first borrowing';
}
/** s 25-25(4), year by year from the year the loan began to the one its period ends in, each
 * maximum rounded half up to the cent and carried forward. @param {LoanDates} loan @param {bigint} expenditure */
function spreadYears(loan, expenditure) {
  /** @type {SpreadYear[]} */
  const rows = [];
  let remaining = expenditure;
  for (let first = loan.firstYear; ; first += 1) {
    const [from, last] = [yearStart(first), yearStart(first + 1) - 1];
    const end = endAt(loan, last);
    const begin = Math.max(loan.start, from);
    const [left, days] = [end - begin + 1, Math.min(end, last) - begin + 1];
    const maximum = ratioCents(remaining * BigInt(days), BigInt(left));
    rows.push({ first, end, remaining, left, days, maximum });
    if (end <= last) return rows;
    remaining -= maximum;
  }
}

/** @param {SpreadYear[]} years @returns {never} */
function useInvalid(years) {
  return refuse('borrowing.income_use_invalid', `income_use must be a decimal fraction from 0 to 1, or an object giving one for each income year from ${yearLabel(years[0].first)} to ${yearLabel(years[years.length - 1].first)}.`);
}
/** One fraction for every year, or one for each year of the spread. @param {unknown} value @param {SpreadYear[]} years */
function uses(value, years) {
  const one = fraction(value);
  if (one) return years.map(() => one);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== years.length) return useInvalid(years);
  const byYear = /** @type {Record<string, unknown>} */ (value);
  return years.map((row) => fraction(byYear[yearLabel(row.first)]) ?? useInvalid(years));
}

/** One loan's facts, refused as the command refuses them and in its order. @param {unknown} value @param {number} claimed @param {string} year */
function readLoan(value, claimed, year) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return refuse('borrowing.loans_invalid', 'loans must be a non-empty list of objects, one for each loan.');
  const fields = /** @type {Record<string, unknown>} */ (value);
  const unknown = Object.keys(fields).find((key) => !FACTS.includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not a fact a loan takes`);
  const missing = REQUIRED.find((key) => !Object.hasOwn(fields, key));
  if (missing !== undefined) refuse('borrowing.loan_fact_missing', `${missing} is required.`);
  const expenditure = moneyCents(fields.borrowing_expenses);
  if (fields.section_26_50_applies !== false) {
    if (typeof fields.section_26_50_applies === 'boolean') refuse('borrowing.s26_50_denied', BORROWING_S26_50);
    refuse('input.flag_invalid', 'section_26_50_applies must be a boolean.');
  }
  const start = dayOf(fields.loan_start);
  if (start === null) refuse('input.date_invalid', 'loan_start must be a YYYY-MM-DD date from 1900 to 2100.');
  const later = (/** @type {string} */ name) => {
    const given = fields[name];
    if (given === null) return null;
    const day = dayOf(given);
    return day !== null && day >= start ? day : refuse('borrowing.loan_date_invalid', `${name} must be null or a YYYY-MM-DD date no earlier than loan_start.`);
  };
  const [termEnd, repaid] = [later('loan_term_end'), later('repaid_on')];
  /** @type {LoanDates} */
  const loan = { start, termEnd, repaid, firstYear: yearOfDay(start) };
  if (loan.firstYear < FIRST_YEAR) refuse('borrowing.loan_before_2017_18', 'a loan first drawn before 1 July 2017 is out of scope: s 25-25 was read as it applies from the 2017-18 income year.');
  if (loan.firstYear > claimed) refuse('borrowing.loan_starts_after_year', `loan_start must not be after the ${year} income year ended.`);
  const years = spreadYears(loan, expenditure);
  const shares = uses(fields.income_use, years);
  let refinances = null;
  if (Object.hasOwn(fields, 'refinances')) {
    const k = fields.refinances;
    if (!Number.isSafeInteger(k) || /** @type {number} */ (k) < 0) refuse('borrowing.refinance_invalid', REFINANCE_INVALID);
    refinances = /** @type {number} */ (k);
  }
  return /** @type {LoanFacts} */ ({ expenditure, loan, years, uses: shares, refinances });
}
const REFINANCE_INVALID = "refinances must be the number of an earlier loan in loans, repaid on this loan's loan_start and refinanced by no other loan.";

/** The other borrowing expenses by income year, in cents. @param {unknown} value */
function otherExpenses(value) {
  /** @type {Map<number, bigint>} */
  const out = new Map();
  if (value === undefined) return out;
  const invalid = () => refuse('borrowing.other_expenses_invalid', 'other_borrowing_expenses must be an object giving, for an income year such as "2025-26", the income-producing share of borrowing expenses incurred that year on loans not in loans.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  for (const [key, amount] of Object.entries(value)) {
    const first = yearFirst(key);
    if (first === null || typeof amount !== 'string' || !/^\d+(\.\d+)?$/.test(amount)) invalid();
    out.set(/** @type {number} */ (first), moneyCents(amount));
  }
  return out;
}

/**
 * ITAA 1997 s 25-25 for each loan: the year asked about's amounts and every year of each loan,
 * as the `borrowing-expenses-schedule` command works them.
 * @param {{year: string, loans: unknown, other_borrowing_expenses?: unknown}} input
 */
export function borrowingSchedule(input) {
  const unknown = Object.keys(input).find((key) => !['year', 'loans', 'other_borrowing_expenses', 'accounting'].includes(key));
  if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an input.`);
  if (!BORROWING_YEARS.includes(input.year)) refuse('period.unsupported', 'Choose an income year from 2017-18 to 2027-28.');
  const claimed = /** @type {number} */ (yearFirst(input.year));
  if (!Array.isArray(input.loans) || input.loans.length === 0) refuse('borrowing.loans_invalid', 'loans must be a non-empty list of objects, one for each loan.');
  const loans = input.loans.map((value, i) => at(i + 1, () => readLoan(value, claimed, input.year)));
  /** @type {(number | null)[]} */
  const refinancedBy = loans.map(() => null);
  loans.forEach((facts, i) => {
    const k = facts.refinances;
    if (k === null) return;
    const valid = k >= 1 && k <= i && refinancedBy[k - 1] === null && loans[k - 1].loan.repaid === facts.loan.start;
    if (!valid) at(i + 1, () => refuse('borrowing.refinance_invalid', REFINANCE_INVALID));
    refinancedBy[k - 1] = i + 1;
  });
  const other = otherExpenses(input.other_borrowing_expenses);
  // s 25-25(6): the income-producing shares of everything incurred for borrowing in a year,
  // across the loans first drawn that year and the other amounts, exact before the $100 test.
  /** @type {Map<number, {num: bigint, den: bigint}>} */
  const totals = new Map([...other].map(([first, c]) => [first, { num: c, den: 1n }]));
  for (const f of loans) {
    const t = totals.get(f.loan.firstYear) ?? { num: 0n, den: 1n };
    const den = t.den * f.uses[0].den;
    totals.set(f.loan.firstYear, { num: t.num * f.uses[0].den + f.expenditure * f.uses[0].num * t.den, den });
  }
  const whole = loans.map((f) => {
    const t = /** @type {{num: bigint, den: bigint}} */ (totals.get(f.loan.firstYear));
    return f.uses[0].num !== 0n && t.num <= 10000n * t.den;
  });
  const out = loans.map((f, i) => loanResult(i + 1, f, whole[i], refinancedBy[i]));
  /** @type {Map<number, {maximum: bigint, deduction: bigint}>} */
  const byYear = new Map();
  for (const row of out.flatMap((l) => l.rows)) {
    const t = byYear.get(row.first) ?? { maximum: 0n, deduction: 0n };
    byYear.set(row.first, { maximum: t.maximum + row.maximum, deduction: t.deduction + row.deduction });
  }
  const schedule = [...byYear].sort(([a], [b]) => a - b).map(([first, t]) => ({ income_year: yearLabel(first), maximum: t.maximum,
    deduction: t.deduction, section_26_155: first >= 2027, projected: first > LAST_YEAR }));
  const asked = out.map((l) => l.rows.find((row) => row.first === claimed));
  const sum = (/** @type {(row: BorrowingRow) => bigint} */ pick) => asked.reduce((s, row) => s + (row ? pick(row) : 0n), 0n);
  const firsts = out.flatMap((l) => l.rows.map((row) => row.first));
  const warnings = [...(firsts.some((f) => f >= 2027) ? [S26_155] : []), ...(firsts.some((f) => f > LAST_YEAR) ? [PROJECTED] : [])];
  // The year's totals in dollars, each exact to the cent.
  const dollars = (/** @type {bigint} */ cents) => Number(cents) / 100;
  return { year: input.year, loans: out, schedule, warnings, borrowingExpenses: dollars(loans.reduce((s, f) => s + f.expenditure, 0n)),
    maximumDeduction: dollars(sum((r) => r.maximum)), deduction: dollars(sum((r) => r.deduction)),
    remainingAfterYear: dollars(sum((r) => (r.left === null ? 0n : r.after))) };
}

/** One loan's period, how it is deducted, its rows and notes. @param {number} n @param {LoanFacts} f @param {boolean} whole @param {number | null} by */
function loanResult(n, f, whole, by) {
  const flags = (/** @type {number} */ first) => ({ section_26_155: first >= 2027, projected: first > LAST_YEAR });
  /** @type {BorrowingRow[]} */
  const rows = whole
    ? [{ income_year: yearLabel(f.loan.firstYear), first: f.loan.firstYear, period_of_the_loan_to: null, remaining: f.expenditure, left: null, days: null,
      maximum: f.expenditure, use: f.uses[0].text, deduction: ratioCents(f.expenditure * f.uses[0].num, f.uses[0].den), after: 0n, ...flags(f.loan.firstYear) }]
    : f.years.map((y, i) => ({ income_year: yearLabel(y.first), first: y.first, period_of_the_loan_to: isoOf(y.end), remaining: y.remaining, left: y.left,
      days: y.days, maximum: y.maximum, use: f.uses[i].text, deduction: ratioCents(y.maximum * f.uses[i].num, f.uses[i].den),
      after: y.remaining - y.maximum, ...flags(y.first) }));
  const last = f.years[f.years.length - 1];
  const notes = [];
  if (by !== null) notes.push(`Refinanced by loan ${by}: repaid on ${isoOf(last.end)}, so the period of the loan ends that day (s 25-25(5)(b)) and the income year it ends in deducts what remains (s 25-25(4)).`);
  if (f.refinances !== null) notes.push(`Refinances loan ${f.refinances}: this loan’s own borrowing expenses are spread from its first borrowing (s 25-25(5)).`);
  return /** @type {BorrowingLoan} */ ({ loan: n, borrowingExpenses: f.expenditure, from: isoOf(f.loan.start), to: whole ? null : isoOf(last.end),
    basis: whole ? null : basis(f.loan, last.end), spread: whole ? 'not spread: $100 or less (s 25-25(6))' : 'spread over the period of the loan (s 25-25(4))',
    refinances: f.refinances, refinancedBy: by, rows, total: rows.reduce((s, r) => s + r.deduction, 0n), notes });
}

// The accounting column. Money in it is a float of dollars until each income year is rounded to
// the cent: the effective interest rate is irrational in general.

/** @typedef {{amount: string, annual_rate: string, payments: string, balloon_percent: string, qualifying_asset: boolean, same_lender?: boolean,
 *   lender_fees?: string}} AccountingFacts */
/** @typedef {{first: number, cost: number, unamortised: number, amortisedCost: number}} AccountingYear */

/** A loan's contractual cash flows, monthly in arrears from its first borrowing, and the monthly
 * effective interest rate that discounts them to the amount borrowed less `costs` (AASB 9
 * para 5.1.1 and Appendix A). @param {AccountingFacts} a @param {string} start @param {number} costs */
function effectiveRate(a, start, costs) {
  const s = financeSchedule({ solve: 'payment', amount: a.amount, rate: a.annual_rate, payments: a.payments, payment: '', balloon: a.balloon_percent,
    balloonKind: 'percent', frequency: 'monthly', timing: 'arrears', start });
  const flows = s.rows.map((r, i) => ({ t: i + 1, date: r.date, payment: r.payment + (i === s.rows.length - 1 ? s.balloon : 0), interest: r.interest }));
  const net = s.amount - costs;
  if (net <= 0) refuse('accounting.costs_exceed_amount', 'The borrowing expenses must be less than the amount borrowed.');
  const worth = (/** @type {number} */ k) => flows.reduce((sum, f) => sum + f.payment / (1 + k) ** f.t, 0) - net;
  let [low, high] = [0, 1];
  if (worth(high) > 0) refuse('accounting.rate_out_of_range', 'The effective interest rate is above 100% a month, which this page does not work.');
  for (let i = 0; i < 200 && high - low > 1e-16; i += 1) {
    const mid = (low + high) / 2;
    if (worth(mid) > 0) low = mid;
    else high = mid;
  }
  return { flows, monthly: (low + high) / 2, amount: s.amount, net };
}

/** Present value at monthly rate `k` of `flows` after time `tau` (in periods). @param {{t: number, payment: number}[]} flows @param {number} k @param {number} tau */
const presentValue = (flows, k, tau) => flows.filter((f) => f.t > tau).reduce((sum, f) => sum + f.payment / (1 + k) ** (f.t - tau), 0);

/** The time, in periods of a loan's grid, of `day`. @param {string} start @param {{t: number, date: string}[]} flows @param {number} day */
function periodsTo(start, flows, day) {
  let previous = /** @type {number} */ (dayOf(start));
  for (const f of flows) {
    const to = /** @type {number} */ (dayOf(f.date));
    if (day <= to) return f.t - 1 + (day - previous) / (to - previous);
    previous = to;
  }
  return flows.length;
}

/** @typedef {{monthly: number, flows: {t: number, date: string, payment: number, interest: number}[], net: number, amount: number}} Rate */

/** How a loan that refinances another starts: with the same lender, the 10% test of AASB 9
 * para B3.3.6; with another, the earlier loan is discharged (para 3.3.1).
 * @param {AccountingFacts} a @param {BorrowingLoan} t @param {BorrowingLoan} earlier @param {Rate} old */
function refinancing(a, t, earlier, old) {
  if (typeof a.same_lender !== 'boolean') refuse('input.flag_invalid', 'same_lender must be a boolean for a loan that refinances another.');
  const k = earlier.loan;
  if (!a.same_lender) {
    return { rate: null, test: null, expensed: false,
      note: `Loan ${k} is repaid to another lender, so it is extinguished (AASB 9 para 3.3.1) and this loan’s borrowing expenses are transaction costs of a new liability (para 5.1.1).` };
  }
  // The new terms' cash flows and the fees paid to the lender, at the original effective rate,
  // against the original loan's remaining cash flows at that rate. Para B3.3.6 counts only fees
  // between the borrower and the lender, so a broker's, valuer's or government's are left out.
  const lenderFees = typeof a.lender_fees === 'string' ? moneyCents(a.lender_fees) : null;
  if (lenderFees === null || lenderFees > t.borrowingExpenses) {
    refuse('accounting.lender_fees_invalid', 'lender_fees, the part of the borrowing expenses paid to the lender, must be given for a refinancing with the same lender and be no more than the borrowing expenses.');
  }
  const rate = effectiveRate(a, t.from, 0);
  const tau = periodsTo(earlier.from, old.flows, /** @type {number} */ (dayOf(t.from)));
  const before = presentValue(old.flows, old.monthly, tau);
  const after = presentValue(rate.flows, old.monthly, 0) + Number(lenderFees) / 100;
  const change = Math.abs(after - before) / before;
  const shown = `${(change * 100).toFixed(2)}%`;
  if (change < 0.1) {
    refuse('accounting.modification_out_of_scope', `the new terms differ by ${shown}, under 10%, so AASB 9 para B3.3.6A treats the refinancing as a modification of loan ${k}, which this page does not work.`);
  }
  // Accounted for as an extinguishment (para 3.3.2): the costs are part of its gain or loss (para B3.3.6A).
  return { rate, test: { before, after, change, substantial: true }, expensed: true,
    note: `The new terms, with the fees paid to the lender, differ by ${shown} from loan ${k}’s remaining cash flows at its effective rate, at least 10% (AASB 9 para B3.3.6): loan ${k} is extinguished (para 3.3.2), and this loan’s borrowing expenses are part of the gain or loss on extinguishment (para B3.3.6A).` };
}

/** Each period's costs amortised: the effective interest less the contractual interest, shared
 * across 30 June by days, with what is left written off if the loan is repaid before its
 * expected life ends; and the amortised cost at each 30 June (Appendix A), the carrying amount
 * with the effective interest accrued by days.
 * @param {Rate} r @param {number} start @param {number | null} ends @param {number} costs */
function amortise(r, start, ends, costs) {
  /** @type {Map<number, number>} */
  const cost = new Map();
  const add = (/** @type {number} */ day, /** @type {number} */ amount) => cost.set(yearOfDay(day), (cost.get(yearOfDay(day)) ?? 0) + amount);
  /** @type {Map<number, number>} */
  const balances = new Map();
  let [carrying, amortised, previous] = [r.net, 0, start];
  let yearEnd = yearStart(yearOfDay(start) + 1) - 1;
  for (const f of r.flows) {
    const to = /** @type {number} */ (dayOf(f.date));
    const stop = ends !== null && ends < to ? ends : to;
    for (; yearEnd < stop; yearEnd = yearStart(yearOfDay(yearEnd) + 2) - 1) {
      balances.set(yearOfDay(yearEnd), carrying * (1 + (r.monthly * (yearEnd + 1 - previous)) / (to - previous)));
    }
    const amortisation = ((carrying * r.monthly - f.interest) * (stop - previous)) / (to - previous);
    const july = yearStart(yearOfDay(stop - 1));
    if (july > previous && july < stop) {
      add(previous, (amortisation * (july - previous)) / (stop - previous));
      add(july, (amortisation * (stop - july)) / (stop - previous));
    } else add(previous, amortisation);
    amortised += amortisation;
    if (stop < to || (ends === to && f.t < r.flows.length)) {
      // Extinguished early (AASB 9 paras 3.3.1 and 3.3.3): what is left is written off.
      add(stop, costs - amortised);
      return { cost, balances, writtenOff: stop };
    }
    carrying = carrying * (1 + r.monthly) - f.payment;
    previous = to;
  }
  return { cost, balances, writtenOff: null };
}

/** Each year to the cent, rounded on the cumulative amount so the years add up to the costs.
 * @param {Map<number, number>} cost @param {Map<number, number>} balances @param {bigint} total @returns {AccountingYear[]} */
function centsByYear(cost, balances, total) {
  const firsts = [...cost.keys()].sort((x, y) => x - y);
  let [sum, shownSum] = [0, 0n];
  return firsts.map((first, j) => {
    sum += /** @type {number} */ (cost.get(first));
    const cumulative = j === firsts.length - 1 ? total : BigInt(Math.round(sum * 100));
    const yearCents = cumulative - shownSum;
    shownSum = cumulative;
    return { first, cost: Number(yearCents) / 100, unamortised: Number(total - cumulative) / 100,
      amortisedCost: Math.round((balances.get(first) ?? 0) * 100) / 100 };
  });
}

/**
 * The accounting column for each loan: the effective interest rate, the borrowing costs
 * recognised each income year and what is left unamortised at 30 June.
 * @param {{year: string, loans: unknown[], accounting: unknown}} input @param {ReturnType<typeof borrowingSchedule>} tax
 */
export function borrowingAccounting(input, tax) {
  const list = input.accounting;
  if (!Array.isArray(list) || list.length !== input.loans.length) refuse('accounting.facts_invalid', 'Give the accounting facts of every loan, in the order of the loans.');
  const loans = /** @type {Record<string, unknown>[]} */ (input.loans);
  /** @type {Rate[]} */
  const rates = [];
  return list.map((value, i) => at(i + 1, () => {
    const a = /** @type {AccountingFacts} */ (value);
    const unknown = Object.keys(a ?? {}).find((key) => !ACCOUNTING_FACTS.includes(key));
    if (unknown !== undefined) refuse('input.field_unknown', `${unknown} is not an accounting fact a loan takes`);
    if (typeof a.qualifying_asset !== 'boolean') refuse('input.flag_invalid', 'qualifying_asset must be a boolean.');
    const t = tax.loans[i];
    const k = t.refinances;
    const how = k === null ? null : refinancing(a, t, tax.loans[k - 1], rates[k - 1]);
    const costs = how?.expensed ? 0 : Number(t.borrowingExpenses) / 100;
    const r = how?.rate ?? effectiveRate(a, t.from, costs);
    rates[i] = r;
    const start = /** @type {number} */ (dayOf(t.from));
    const ends = loans[i].repaid_on === null ? null : /** @type {number} */ (dayOf(loans[i].repaid_on));
    const amortised = amortise(r, start, ends, costs);
    // Expensed at the start, the costs leave nothing to amortise: the effective interest on the
    // payments, rounded to the cent, differs from the contractual interest by rounding alone.
    const cost = how?.expensed ? new Map([...amortised.cost.keys()].map((first) => [first, 0])) : amortised.cost;
    if (how?.expensed) cost.set(yearOfDay(start), Number(t.borrowingExpenses) / 100);
    const { balances } = amortised;
    const writtenOff = how?.expensed ? null : amortised.writtenOff;
    const notes = how ? [how.note] : [];
    if (writtenOff !== null) notes.push(`Repaid on ${isoOf(writtenOff)}: the loan is extinguished (AASB 9 para 3.3.1) and the unamortised borrowing expenses are written off in profit or loss (para 3.3.3).`);
    if (a.qualifying_asset) notes.push('A qualifying asset: these borrowing costs, with the interest, are capitalised as part of its cost for the capitalisation period (AASB 123 paras 8 and 17 to 25), which you decide; the column shows them before capitalisation.');
    return { loan: i + 1, effectiveAnnualRate: ((1 + r.monthly) ** 12 - 1) * 100, monthlyRate: r.monthly, initialCarrying: r.net,
      years: centsByYear(cost, balances, BigInt(t.borrowingExpenses)), test: how?.test ?? null, notes, qualifyingAsset: a.qualifying_asset };
  }));
}

// The page's form: up to 3 loans, each with its income use as a percentage for every year or by
// year, and the accounting facts when the accounting column is chosen.

export const FORM_LOANS = 3;
const blank = (/** @type {string} */ text) => text.trim() === '';
/** A percentage from 0 to 100 as the fraction the command takes, exactly: '50' gives '0.5'.
 * @param {string} text @param {string} what */
function percentFraction(text, what) {
  const t = text.trim();
  if (!/^\d+(\.\d+)?$/.test(t) || Number(t) > 100) throw new Error(`${what}: enter a percentage from 0 to 100.`);
  const [whole, part = ''] = t.split('.');
  const digits = `${'00'}${whole}${part}`;
  const at = digits.length - part.length - 2;
  const fractionPart = digits.slice(at).replace(/0+$/, '');
  const wholePart = String(Number(digits.slice(0, at)));
  return fractionPart ? `${wholePart}.${fractionPart}` : wholePart;
}
/** '2022-23 50, 2023-24 100' as { '2022-23': '0.5', '2023-24': '1' }. @param {string} text @param {number} n */
function byYear(text, n) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const match = part.match(/^(\d{4}-\d{2})\s*[:=]?\s*(\d+(?:\.\d+)?)%?$/);
    if (!match) throw new Error(`Loan ${n}: write the use by year as an income year and a percentage, such as 2025-26 50, separated by commas.`);
    out[match[1]] = percentFraction(match[2], `Loan ${n}, ${match[1]}`);
  }
  return out;
}

/**
 * @typedef {{year: string, loans: Record<string, unknown>[], other_borrowing_expenses?: Record<string, string>,
 *   accounting?: AccountingFacts[]}} BorrowingInput
 */

/** The page's input from the form's fields. @param {(name: string) => string} value @returns {BorrowingInput} */
export function borrowingFormInput(value) {
  /** @type {Record<string, unknown>[]} */
  const loans = [];
  /** @type {(Record<string, string> | null)[]} */
  const years = [];
  /** @type {AccountingFacts[]} */
  const accounting = [];
  const leisure = value('leisure') === 'yes';
  const withAccounting = value('accounting') === 'yes';
  for (let n = 1; n <= FORM_LOANS; n += 1) {
    if (blank(value(`expenses-${n}`))) continue;
    if (loans.length !== n - 1) throw new Error(`Fill in loan ${n - 1} before loan ${n}.`);
    const optional = (/** @type {string} */ name) => (blank(value(name)) ? null : value(name));
    /** @type {Record<string, unknown>} */
    const loan = { borrowing_expenses: value(`expenses-${n}`), loan_start: value(`start-${n}`), loan_term_end: optional(`term-end-${n}`),
      repaid_on: optional(`repaid-${n}`), income_use: percentFraction(value(`use-${n}`), `Loan ${n}`), section_26_50_applies: leisure };
    // Loan 1 has no earlier loan to refinance, so the form gives it no such field.
    const refinances = n === 1 ? '' : value(`refinances-${n}`);
    if (refinances) loan.refinances = Number(refinances);
    loans.push(loan);
    years.push(blank(value(`use-by-year-${n}`)) ? null : byYear(value(`use-by-year-${n}`), n));
    if (withAccounting) {
      accounting.push({ amount: value(`amount-${n}`), annual_rate: value(`rate-${n}`), payments: value(`payments-${n}`),
        balloon_percent: blank(value(`balloon-${n}`)) ? '0' : value(`balloon-${n}`), qualifying_asset: value(`qualifying-${n}`) === 'yes',
        ...(refinances ? { same_lender: value(`lender-${n}`) === 'same' } : {}),
        ...(refinances && !blank(value(`lender-fees-${n}`)) ? { lender_fees: value(`lender-fees-${n}`) } : {}) });
    }
  }
  /** @type {BorrowingInput} */
  const input = { year: value('year'), loans };
  const other = value('other-amount');
  if (!blank(other)) input.other_borrowing_expenses = { [value('other-year')]: other };
  if (years.some(Boolean)) {
    // The years the use by year leaves out take the loan's percentage: the schedule gives the years.
    let spread = null;
    try {
      spread = borrowingSchedule(input);
    } catch {
      // The schedule gives its refusal when the page calculates.
    }
    loans.forEach((loan, i) => {
      const given = years[i];
      if (!given || !spread) return;
      const all = Object.fromEntries(spread.loans[i].rows.map((row) => [row.income_year, /** @type {string} */ (loan.income_use)]));
      for (const year of Object.keys(given)) {
        if (!Object.hasOwn(all, year)) throw new Error(`Loan ${i + 1}: ${year} is not an income year of the loan’s period.`);
      }
      loan.income_use = { ...all, ...given };
    });
  }
  if (withAccounting) input.accounting = accounting;
  return input;
}

const longDate = (/** @type {string} */ iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** A share as a percentage to at most 4 decimal places. @param {string} share */
const percent = (share) => {
  const f = /** @type {Share} */ (fraction(share));
  return `${(Number(ratioCents(f.num * 1000000n, f.den)) / 10000).toLocaleString('en-AU', { maximumFractionDigits: 4 })}%`;
};
const useText = (/** @type {unknown} */ use) => (typeof use === 'string' ? `${percent(use)} income use` : 'income use by year');

/** How the page writes the input. @param {BorrowingInput} input @param {(value: number) => string} aud */
export function borrowingInputsText(input, aud) {
  const money = (/** @type {unknown} */ text) => aud(Number(text));
  const loans = input.loans.map((loan, i) => {
    const parts = [`loan ${i + 1}: ${money(loan.borrowing_expenses)} of borrowing expenses from ${longDate(String(loan.loan_start))}`];
    if (loan.loan_term_end) parts.push(`contract to ${longDate(String(loan.loan_term_end))}`);
    if (loan.repaid_on) parts.push(`repaid ${longDate(String(loan.repaid_on))}`);
    if (loan.refinances) parts.push(`refinancing loan ${loan.refinances}`);
    parts.push(useText(loan.income_use));
    const a = input.accounting?.[i];
    if (a) parts.push(`${money(a.amount)} borrowed at ${a.annual_rate}% over ${a.payments} monthly payments${Number(a.balloon_percent) ? ` with a ${a.balloon_percent}% balloon` : ''}`);
    return parts.join(', ');
  });
  const other = Object.entries(input.other_borrowing_expenses ?? {}).map(([year, amount]) => `other borrowing expenses ${money(amount)} in ${year}`);
  return [input.year, ...loans, ...other].join('; ');
}

/** The page's result: the year asked about, each loan's rows, the totals by year and, when
 * chosen, the accounting column beside the tax. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function borrowingResult(value, aud) {
  const input = borrowingFormInput(value);
  const tax = borrowingSchedule(input);
  const money = (/** @type {bigint} */ cents) => aud(Number(cents) / 100);
  const year = input.year;
  const rows = [['Borrowing expenses, all loans', aud(tax.borrowingExpenses)], [`Maximum deduction for ${year}`, aud(tax.maximumDeduction)],
    [`Still to deduct after ${year}`, aud(tax.remainingAfterYear)], [`Deduction for ${year}`, aud(tax.deduction)]];
  const flag = (/** @type {{section_26_155: boolean, projected: boolean}} */ row) =>
    [row.section_26_155 ? 's 26-155' : '', row.projected ? 'projected' : ''].filter(Boolean).join(', ');
  /** @type {Record<string, string[][]>} */
  const tables = {
    loans: tax.loans.flatMap((l) => l.rows.map((row) => [`Loan ${l.loan}, ${row.income_year}`, money(row.remaining),
      row.days === null ? 'not spread' : `${row.days} of ${row.left}`, money(row.maximum), percent(row.use), money(row.deduction), flag(row)])),
    years: tax.schedule.map((row) => [row.income_year, money(row.maximum), money(row.deduction), flag(row)]),
  };
  const notes = [...tax.loans.flatMap((l) => l.notes), ...tax.warnings];
  if (input.accounting) {
    const accounts = borrowingAccounting(/** @type {{year: string, loans: unknown[], accounting: unknown}} */ (input), tax);
    for (const a of accounts) rows.push([`Loan ${a.loan}: effective interest rate (AASB 9)`, `${a.effectiveAnnualRate.toFixed(4)}% a year`]);
    tables.accounting = accountingTable(tax, accounts, aud);
    const asked = tables.accounting.find((row) => row[0] === year);
    rows.push([`Accounting borrowing costs for ${year}`, asked?.[2] ?? aud(0)], [`Tax deduction less accounting costs, ${year}`, asked?.[3] ?? aud(0)]);
    notes.push(...accounts.flatMap((a) => a.notes.map((note) => `Loan ${a.loan}: ${note[0].toLowerCase()}${note.slice(1)}`)));
  }
  const note = notes.length ? notes.join(' ').replace(/\.$/, '') : undefined;
  return { inputs: borrowingInputsText(input, aud), rows, principal: 3, note, tables };
}

/** Tax beside accounting by income year: the deduction, the accounting borrowing costs, their
 * difference, what tax and accounting still carry at 30 June, and the amortised cost.
 * @param {ReturnType<typeof borrowingSchedule>} tax @param {ReturnType<typeof borrowingAccounting>} accounts @param {(value: number) => string} aud */
function accountingTable(tax, accounts, aud) {
  const firsts = [...new Set([...tax.schedule.map((row) => /** @type {number} */ (yearFirst(row.income_year))),
    ...accounts.flatMap((a) => a.years.map((y) => y.first))])].sort((x, y) => x - y);
  const deduction = new Map(tax.schedule.map((row) => [yearFirst(row.income_year), row.deduction]));
  return firsts.map((first) => {
    const sum = (/** @type {(y: AccountingYear) => number} */ pick) => accounts.reduce((total, a) => {
      const y = a.years.find((row) => row.first === first);
      return total + (y ? Math.round(pick(y) * 100) : 0);
    }, 0);
    const taxCents = Number(deduction.get(first) ?? 0n);
    const cost = sum((y) => y.cost);
    // What tax still carries at 30 June: each loan's expenditure left after the year.
    const carried = tax.loans.reduce((total, l) => total + Number(l.rows.find((row) => row.first === first)?.after ?? 0n), 0);
    return [yearLabel(first), aud(taxCents / 100), aud(cost / 100), aud((taxCents - cost) / 100), aud(carried / 100), aud(sum((y) => y.unamortised) / 100),
      aud(sum((y) => y.amortisedCost) / 100)];
  });
}
