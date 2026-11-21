// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// Taxable values of 5 fringe benefits under the Fringe Benefits Tax Assessment Act 1986
// (Compilation No. 97, 1 July 2026): a loan (Division 4), meal entertainment (Division 9A)
// and car parking (Division 10A), ported from the fbt-loan, fbt-meal-entertainment and
// fbt-car-parking worksheets of ryanduguid/australian-accounting's
// australian-tax-calculators at 376607610d73c4e13a3dbc8ea316bc4490fbb19a; an expense payment
// (Division 5) and property (Division 11), ported from its fbt-expense-payment and
// fbt-property worksheets at 60e834aa9d9580ddd7a3c5065dde430fadd82c47. Amounts work in
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
// Up to 2^46 dollars, Numbers are at most 0.78 of a cent apart, so dollars() lies within 0.4 of a
// cent of the exact amount and shows every cent; a larger total is refused, not rounded.
const MOST_CENTS = 100n * 2n ** 46n;
/** @param {bigint} value */
const dollars = (value) => {
  if (value > MOST_CENTS) throw new Error('The result is too large to work to the cent: enter smaller amounts.');
  return Number(value) / 100;
};

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
  // A nil first year is far more often a field left at 0 than a real year, and against it the
  // 20% rule below would check nothing, so this calculator does not take it.
  if (earlier[0] === 0n) throw new Error('This calculator does not take a register whose first valid year had nil expenses: enter that year’s expenses.');
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

/** @param {bigint} value */
const quarters = (value) => ratioCents(value * 3n, 4n);

/**
 * @typedef {'in-house-salary-packaging' | 'in-house-trade-price' | 'in-house-public-price' | 'in-house-produced-other'
 *   | 'in-house-acquired' | 'in-house-other'} InHouseMethod
 * @typedef {InHouseMethod | 'external-cost-price' | 'external-expenditure' | 'external-notional-value'} PropertyMethod
 * @typedef {'external' | InHouseMethod | 'in-house-residual-salary-packaging' | 'in-house-residual-public-price'
 *   | 'in-house-residual-other'} ExpensePaymentMethod
 * @typedef {{method: PropertyMethod, price: string, notional: string, contribution: string, incomeUse: string,
 *   contributionDeduction: string, available: string}} FbtProperty
 * @typedef {{method: ExpensePaymentMethod, expenditure: string, paid: string, contribution: string, incomeUse: string,
 *   portionDeduction: string, price: string, notional: string, available: string}} FbtExpensePayment
 * @typedef {{gross: number, recipientsPortion?: number, contributionApplied: number, excess: number,
 *   valueAfterContribution: number, grossDeduction?: number, deductionApplied?: number,
 *   notionalDeduction?: number, reduction?: number, inHouseReduction?: number, taxableValue: number}} BenefitValue
 * @typedef {(p: {price: string, notional: string}) => bigint} Valuation
 * @typedef {{reduction: bigint, figures: Record<string, number>}} Deductible
 */

/** The property valuation rules by method, each giving the value before any contribution from
 * `price` or `notional`, the notional value (s 136(1)). The first 6 are the in-house rules of
 * s 42(1), the last 3 the external rules of s 43. Airline transport (s 42(1)(ab)) is left out.
 * @type {Record<string, Valuation>} */
const PROPERTY_RULES = {
  'in-house-salary-packaging': (p) => money(p.notional), // s 42(1)(aa)
  'in-house-trade-price': (p) => money(p.price), // s 42(1)(a)(i)
  'in-house-public-price': (p) => quarters(money(p.price)), // s 42(1)(a)(ii)
  'in-house-produced-other': (p) => quarters(money(p.notional)), // s 42(1)(a)(iii)
  'in-house-acquired': (p) => least(money(p.price), money(p.notional)), // s 42(1)(b) and (2)
  'in-house-other': (p) => quarters(money(p.notional)), // s 42(1)(c)
  'external-cost-price': (p) => money(p.price), // s 43(a)
  'external-expenditure': (p) => money(p.price), // s 43(b)
  'external-notional-value': (p) => money(p.notional), // s 43(c)
};

/** The in-house residual rules an in-house residual expense payment takes (s 22A(2), with
 * s 22A(3) for a period benefit): paragraphs (aa), (a) and (b) of ss 48 and 49. Airline
 * transport is left out.
 * @type {Record<string, Valuation>} */
const RESIDUAL_RULES = {
  'in-house-residual-salary-packaging': PROPERTY_RULES['in-house-salary-packaging'],
  'in-house-residual-public-price': PROPERTY_RULES['in-house-public-price'],
  'in-house-residual-other': PROPERTY_RULES['in-house-other'],
};

/** The rule `method` names in `rules`.
 * @param {Record<string, Valuation>} rules @param {string} method */
function valuation(rules, method) {
  if (!Object.hasOwn(rules, method)) throw new Error('Choose a valuation rule.');
  return rules[method];
}

/** `paid` against `gross`, never taking it below nil, then the otherwise deductible rule's
 * reduction where `deductible` gives one, then s 62 for an in-house rule other than salary
 * packaging (s 62(2)): the part of the employee's $1,000 in-house reduction for the year that
 * their other in-house benefits have left, `available`.
 * @param {string} method @param {bigint} gross @param {bigint} paid @param {string} available
 * @param {(value: bigint) => Deductible} [deductible]
 * @returns {BenefitValue} */
function benefitValue(method, gross, paid, available, deductible) {
  const applied = least(paid, gross);
  const value = gross - applied;
  const rule = deductible ? deductible(value) : { reduction: 0n, figures: {} };
  const reduces = method.startsWith('in-house-') && !method.endsWith('-salary-packaging');
  const inHouse = reduces ? least(money(available, 1000), value - rule.reduction) : 0n;
  return { gross: dollars(gross), contributionApplied: dollars(applied), excess: dollars(paid - applied),
    valueAfterContribution: dollars(value), ...rule.figures, ...(reduces ? { inHouseReduction: dollars(inHouse) } : {}),
    taxableValue: dollars(value - rule.reduction - inHouse) };
}

/** The otherwise deductible rule (ss 24(1) and 44(1)): the gross deduction, `base` × the income
 * use share, less RD, `rd` up to that deduction, is the notional deduction, which comes off the
 * value after the contribution, never below nil.
 * @param {bigint} base @param {string} incomeUse @param {bigint} rd
 * @returns {(value: bigint) => Deductible} */
function otherwiseDeductible(base, incomeUse, rd) {
  const gd = ratioCents(base * hundredths(incomeUse), 10000n);
  const applied = least(rd, gd);
  return (value) => {
    const reduction = least(gd - applied, value);
    return { reduction, figures: { grossDeduction: dollars(gd), deductionApplied: dollars(applied),
      notionalDeduction: dollars(gd - applied), reduction: dollars(reduction) } };
  };
}

/** A property fringe benefit's taxable value (Division 11): the in-house (s 42(1)) or external
 * (s 43) value less the employee's contribution, reduced by the otherwise deductible rule (s 44(1)),
 * its gross deduction on the value before the contribution, and for an in-house benefit by s 62.
 * @param {FbtProperty} p the rule, the price or notional value it takes, the contribution, the
 *   income use percentage, the deduction for the contribution and the s 62 reduction left
 * @returns {BenefitValue} */
export function fbtProperty(p) {
  const gross = valuation(PROPERTY_RULES, p.method)(p);
  const contribution = money(p.contribution);
  const rd = money(p.contributionDeduction);
  if (rd > contribution) throw new Error('The deduction for the employee’s contribution cannot be more than the contribution.');
  return benefitValue(p.method, gross, contribution, p.available, otherwiseDeductible(gross, p.incomeUse, rd));
}

/** An expense payment fringe benefit's taxable value (Division 5). External (s 23): the payment
 * or reimbursement less the employee's contribution to a payment, reduced by the otherwise
 * deductible rule on the employee's expenditure (s 24(1)), RD being the deduction for the
 * recipient's portion. In-house (s 22A(1) or (2)): the in-house property or residual value less
 * the recipient's portion, the expenditure less the payment net of the contribution, then s 62.
 * The otherwise deductible rule for an in-house payment (s 24(1)(b)(i)) is refused, not applied.
 * @param {FbtExpensePayment} e the method, the expenditure, the payment or reimbursement, the
 *   contribution, the otherwise deductible inputs or the in-house rule's inputs
 * @returns {BenefitValue} */
export function fbtExpensePayment(e) {
  const rule = e.method === 'external' ? undefined
    : valuation({ ...PROPERTY_RULES, ...RESIDUAL_RULES }, e.method.startsWith('in-house-') ? e.method : '');
  const expenditure = money(e.expenditure);
  const paid = money(e.paid);
  const contribution = money(e.contribution);
  if (paid > expenditure) throw new Error('The payment or reimbursement cannot be more than the employee’s expenditure (section 20).');
  // s 136(1): the recipient's portion is the expenditure less the payment net of the contribution.
  const portion = expenditure - paid + contribution;
  const rd = money(e.portionDeduction);
  if (!rule) {
    if (rd > portion) {
      throw new Error('The deduction for the recipient’s portion cannot be more than that portion, the expenditure less '
        + 'the payment net of the contribution.');
    }
    return benefitValue(e.method, paid, contribution, '0', otherwiseDeductible(expenditure, e.incomeUse, rd));
  }
  if (hundredths(e.incomeUse) > 0n || rd > 0n) {
    throw new Error('This calculator does not apply the otherwise deductible rule to an in-house expense payment '
      + '(subparagraph 24(1)(b)(i)): enter 0% income use and no deduction.');
  }
  return { recipientsPortion: dollars(portion), ...benefitValue(e.method, rule(e), portion, e.available) };
}
