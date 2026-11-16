// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Taxable values of 3 fringe benefits under the Fringe Benefits Tax Assessment Act 1986
// (Compilation No. 97, 1 July 2026): a loan (Division 4), meal entertainment (Division 9A)
// and car parking (Division 10A). Ported from the fbt-loan, fbt-meal-entertainment and
// fbt-car-parking worksheets of ryanduguid/australian-accounting's
// australian-tax-calculators at 376607610d73c4e13a3dbc8ea316bc4490fbb19a. Amounts work in
// integer cents; a fraction of a cent rounds half up, as the worksheets round. The year's
// rate, threshold and days come from the caller, which reads them from its page.

import { number, ratioCents, ratioPercent } from './money.mjs';

/** A decimal string of AUD to cents, from 0 to `max` dollars.
 * @param {string} value @param {number} [max] */
const money = (value, max = 1e9) => BigInt(Math.round(number(value, { max, money: true }) * 100));
/** A percentage with up to 2 decimal places, in hundredths of 1%.
 * @param {string} value @param {number} [min] */
const hundredths = (value, min = 0) => BigInt(Math.round(number(value, { min, max: 100 }) * 100));
/** @param {string} value @param {number} max @param {number} [min] */
const whole = (value, max, min = 0) => BigInt(number(value, { min, max, integer: true }));
/** @param {bigint} a @param {bigint} b */
const least = (a, b) => (a < b ? a : b);
/** @param {bigint} value */
const dollars = (value) => Number(value) / 100;

/** The recipients' payments against a gross value in cents: the part applied, never more than
 * the value, the excess, and the taxable value.
 * @param {bigint} gross @param {bigint} contribution */
function lessPayments(gross, contribution) {
  const applied = least(contribution, gross);
  return { gross: dollars(gross), contributionApplied: dollars(applied), excess: dollars(contribution - applied),
    taxableValue: dollars(gross - applied) };
}

/**
 * @typedef {{balances: string, accrued: string, incomeUse: string, deduction: string}} FbtLoan
 * @typedef {{days: string, rate: string}} FbtLoanYear
 */

/** A loan fringe benefit's taxable value for one FBT year. Section 18: the notional amount of
 * interest, the daily balances at the statutory interest rate (s 136(1)), less the interest
 * that accrued. Section 19, the otherwise deductible rule: the gross deduction, the share of
 * the notional interest the employee could have deducted, less the deduction for the interest
 * that accrued, comes off, never taking the value below nil.
 * @param {FbtLoan} loan the sum of the daily balances, interest accrued, income use percentage
 *   and the deduction for the interest accrued
 * @param {FbtLoanYear} year the FBT year's days and statutory interest rate in per cent */
export function fbtLoan(loan, year) {
  const days = BigInt(number(year.days, { min: 365, max: 366, integer: true }));
  const rate = hundredths(year.rate, 0.01);
  const balances = money(loan.balances, 1e12);
  const accrued = money(loan.accrued);
  const use = hundredths(loan.incomeUse);
  const deduction = money(loan.deduction);
  if (deduction > accrued) throw new Error('The deduction for the interest accrued cannot be more than that interest.');
  const notional = ratioCents(balances * rate, 10000n * days);
  const gross = notional - least(accrued, notional);
  const grossDeduction = ratioCents(notional * use, 10000n);
  const notionalDeduction = grossDeduction - least(deduction, grossDeduction);
  const reduction = least(notionalDeduction, gross);
  return { notional: dollars(notional), gross: dollars(gross), grossDeduction: dollars(grossDeduction),
    notionalDeduction: dollars(notionalDeduction), reduction: dollars(reduction), taxableValue: dollars(gross - reduction) };
}

/**
 * @typedef {{method: 'split' | 'register', expenses: string, registerBenefits: string,
 *   registerTotal: string, firstYear: string, earlier: string[]}} FbtMeal
 */

/** The first FBT year a register can have been valid for and still be valid in `ended`: it is
 * valid for its first year and the 4 after it (ss 37CD(1), 39GF(1)).
 * @param {string} firstYear @param {number} ended */
function registerYear(firstYear, ended) {
  try {
    return number(firstYear, { min: ended - 4, max: ended, integer: true });
  } catch {
    throw new Error(`The register must have been first valid for an FBT year ending 31 March ${ended - 4} to ${ended}.`);
  }
}

/** Meal entertainment fringe benefits' total taxable value for one FBT year, under the 50/50
 * split method (s 37BA) or the 12 week register method (s 37CB). The register percentage is
 * worked exactly and shown to 2 places. A register valid for a year ceases to be valid at its
 * end if that year's expenses were more than 20% higher than its first valid year's (s 37CD(3)),
 * so each year's expenses from the first valid year to the year before this one are checked.
 * @param {FbtMeal} meal the method, the year's expenses and the register's figures; `earlier`
 *   holds each year's expenses from the register's first valid year to the year before, oldest first
 * @param {{ended: string}} year the year the FBT year ends, 31 March */
export function fbtMealEntertainment(meal, year) {
  if (!['split', 'register'].includes(meal.method)) throw new Error('Choose a valuation method.');
  const ended = number(year.ended, { min: 2000, max: 2100, integer: true });
  const expenses = money(meal.expenses);
  if (meal.method === 'split') return { taxableValue: dollars(ratioCents(expenses, 2n)) };
  const benefits = money(meal.registerBenefits);
  const total = money(meal.registerTotal);
  if (total === 0n || benefits > total) {
    throw new Error('The register’s meal entertainment must be more than nil and at least its fringe benefits.');
  }
  const first = registerYear(meal.firstYear, ended);
  if (meal.earlier.length !== ended - first) {
    throw new Error('Enter the expenses of each FBT year from the register’s first valid year to the year before this one.');
  }
  const earlier = meal.earlier.map((value) => money(value));
  // s 37CC(1): meal entertainment is provided throughout the register's 12 weeks, so a nil
  // first year is a blank entry, against which the 20% rule below would check nothing.
  if (earlier[0] === 0n) throw new Error('Enter the expenses of the register’s first valid year: they cannot be nil.');
  // The first year's expenses times 1.2, compared in tenths of a cent.
  const limit = earlier.length ? earlier[0] * 12n : 0n;
  const over = earlier.findIndex((value) => value * 10n > limit);
  if (over > 0) {
    throw new Error(`The register ceased to be valid at the end of the FBT year ending 31 March ${first + over}: `
      + 'its expenses were more than 20% higher than those of the register’s first valid year. Keep a new register.');
  }
  return { registerPercent: ratioPercent(Number(benefits), Number(total)),
    taxableValue: dollars(ratioCents(expenses * benefits, total)) };
}

/**
 * @typedef {{method: 'station' | 'market' | 'average' | 'register' | 'spaces', fee: string,
 *   benefits: string, each: string, firstFee: string, lastFee: string, registerValue: string,
 *   days: string, firstYear: string, rate: string, spaceDays: string, spaces: string,
 *   employeesStart: string, employeesEnd: string, spacesStart: string, spacesEnd: string,
 *   contribution: string}} FbtParking
 * @typedef {{threshold: string, days: string, ended: string}} FbtParkingYear
 * @typedef {{gross: number, contributionApplied?: number, excess?: number, taxableValue: number,
 *   average?: number, annual?: number, statutoryBenefit?: number, averageEmployees?: number,
 *   averageSpaces?: number}} ParkingValue
 */

const MOST = 1e6;

/** s 39C, s 39D or s 39DA: each benefit at the lowest all-day fee on its day, the valuer's
 * arm's length amount, or the average of the lowest fees on the first and last days a benefit
 * was provided in the year; less the recipients' payments.
 * @param {FbtParking} p @returns {ParkingValue} */
function feeMethod(p) {
  const count = whole(p.benefits, MOST);
  const contribution = money(p.contribution);
  if (p.method !== 'average') return lessPayments(count * money(p.each), contribution);
  const pair = money(p.firstFee) + money(p.lastFee);
  return { average: dollars(ratioCents(pair, 2n)), ...lessPayments(ratioCents(count * pair, 2n), contribution) };
}

/** s 39GB: the register's total value (s 39GC, already net of payments) × 52 ÷ 12 × the days in
 * the car parking availability period ÷ 366, the divisor the Act sets for every year.
 * @param {FbtParking} p @param {number} yearDays @param {number} ended @returns {ParkingValue} */
function registerMethod(p, yearDays, ended) {
  const value = money(p.registerValue);
  const days = whole(p.days, yearDays);
  registerYear(p.firstYear, ended);
  const gross = ratioCents(value * 52n * days, 12n * 366n);
  return { annual: dollars(ratioCents(value * 52n, 12n)), gross: dollars(gross), taxableValue: dollars(gross) };
}

/** s 39FA(4) with s 39FB, for spaces sharing one daily rate amount and availability period:
 * daily rate amount × days ÷ 366 × 228 for each space, the total statutory benefit; times the
 * average employees over the average eligible spaces where the employees are fewer; less the
 * relevant recipients contributions (s 39FE), never below nil.
 * @param {FbtParking} p @param {number} yearDays @returns {ParkingValue} */
function spacesMethod(p, yearDays) {
  const rate = money(p.rate);
  const days = whole(p.spaceDays, yearDays, 1);
  const spaces = whole(p.spaces, MOST, 1);
  const [e0, e1, s0, s1] = [p.employeesStart, p.employeesEnd, p.spacesStart, p.spacesEnd].map((v) => whole(v, MOST));
  const contribution = money(p.contribution);
  const statutory = ratioCents(rate * days * 228n * spaces, 366n);
  // The averages are each a sum over 2, so their ratio is the ratio of the sums.
  const gross = e0 + e1 < s0 + s1 ? ratioCents(statutory * (e0 + e1), s0 + s1) : statutory;
  return { statutoryBenefit: dollars(statutory), averageEmployees: Number(e0 + e1) / 2, averageSpaces: Number(s0 + s1) / 2,
    ...lessPayments(gross, contribution) };
}

const PARKING_METHODS = ['station', 'market', 'average', 'register', 'spaces'];

/** Car parking fringe benefits' taxable value for one FBT year and one premises, by one method.
 * No benefit arises unless a commercial parking station within 1 km charged a lowest all-day fee
 * of more than the year's car parking threshold on its first business day (s 39A(1)(a)(iii)):
 * `fee` is the highest of those stations' lowest fees. Each method's inputs are checked first.
 * @param {FbtParking} p the method and its figures
 * @param {FbtParkingYear} year the car parking threshold, the days in the year and the year it ends
 * @returns {ParkingValue & {benefit: boolean}} */
export function fbtCarParking(p, year) {
  if (!PARKING_METHODS.includes(p.method)) throw new Error('Choose a valuation method.');
  const threshold = money(year.threshold);
  const yearDays = number(year.days, { min: 365, max: 366, integer: true });
  const ended = number(year.ended, { min: 2000, max: 2100, integer: true });
  const fee = money(p.fee);
  const benefit = fee > threshold;
  if (p.method === 'spaces' && !benefit) {
    throw new Error('These spaces gave rise to no car parking benefit: the first business day fee is not more than '
      + 'the car parking threshold, so the spaces method does not count them.');
  }
  let value;
  if (p.method === 'register') value = registerMethod(p, yearDays, ended);
  else if (p.method === 'spaces') value = spacesMethod(p, yearDays);
  else value = feeMethod(p);
  return benefit ? { benefit, ...value } : { benefit, gross: 0, taxableValue: 0 };
}
