// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { number, cents, ratioCents, ratioMoney, ratioPercent } from './money.mjs';
export { fbtCarParking, fbtExpensePayment, fbtLoan, fbtMealEntertainment, fbtProperty } from './fbt-benefits.mjs';
export { fbtEvExemption } from './fbt-ev-exemption.mjs';
export { landTaxYear } from './land-tax.mjs';
export { vehicleClass } from './vehicle-class.mjs';
export { pcgRisk, pcgAllocation, pcgAllocationResult } from './pcg-2021-4.mjs';
export { cgtConcessions, cgtConcessionsAnswersOf, cgtConcessionsResult } from './cgt-concessions.mjs';
export { psiDetermination, psiDeterminationResult } from './psi-determination.mjs';
export { CPI, capitalGain, cgtEventOf, cgtResult, indexationFactor } from './cgt.mjs';
export { CALENDAR_END, NON_BUSINESS_WEEKDAYS, compoundedEarnings, paydaySuperDue, paydaySuperCharge, quarterlySgCharge, sgcPaydayResult }
  from './sgc-payday.mjs';
export { LSL_ACTS, LSL_REASONS, longServiceLeave, longServiceLeaveResult, lslReasonText } from './long-service-leave.mjs';
export { FTC_FUELS, FTC_PERIODS, FTC_USES, fuelFormInput, fuelInputsText, fuelTaxCredits, fuelTaxCreditsResult } from './fuel-tax-credits.mjs';
export { SBT_LOW_RATE_CAP, SBT_RECIPIENTS, SBT_UNTAXED_PLAN_CAP, SBT_YEARS, sbtFormInput, sbtInputsText, superBenefitTax, superBenefitTaxResult }
  from './super-benefit-tax.mjs';
export { LCT_CLAIMANTS, LCT_KINDS, LCT_THRESHOLDS, LCT_YEARS, lctFormInput, lctInputsText, luxuryCarTax, luxuryCarTaxResult } from './luxury-car-tax.mjs';
export { unusedLeave, unusedLeaveResult } from './unused-leave.mjs';
export { FRANKING_EVENTS, frankingAccount, frankingAccountResult, frankingInput } from './franking-account.mjs';
export { BORROWING_YEARS, borrowingAccounting, borrowingFormInput, borrowingInputsText, borrowingResult, borrowingSchedule } from './borrowing-expenses.mjs';
export { WC_SCHEMES, workersCompensation, workersCompensationResult } from './workers-compensation.mjs';

// Planning arithmetic. Rates, eligibility and classifications belong to the caller.
// Money inputs are decimal strings in AUD; monetary results are numeric AUD.
/**
 * @typedef {{receipts: string, payments: string}} CashWeek
 * @typedef {{week: number | string, amount: string, delay: number | string}} CashDeferral
 * @typedef {{version: 1, currency: 'AUD', startDate: string, opening: string,
 *   buffer: string, week: string, amount: string, delay: string, weeks: CashWeek[]}} CashScenario
 */

/** @param {string} amount @param {boolean} [inclusive] */
export function gst(amount, inclusive = false) {
  const value = cents(amount);
  const tax = Math.round(value / (inclusive ? 11 : 10));
  return { net: (inclusive ? value - tax : value) / 100, gst: tax / 100,
    gross: (inclusive ? value : value + tax) / 100 };
}

/** @param {string} cost @param {string} percent */
export function businessUse(cost, percent) {
  const share = Math.round(number(percent, { max: 100 }) * 100);
  return { share: ratioMoney(BigInt(cents(cost)) * BigInt(share), 10000n) };
}

/** @param {string} sales @param {string} cost */
export function margin(sales, cost) {
  const revenue = cents(sales);
  const expense = cents(cost);
  const profit = revenue - expense;
  return { profit: profit / 100, margin: revenue ? ratioPercent(profit, revenue) : null,
    markup: expense ? ratioPercent(profit, expense) : null };
}

/** @param {string} fixed @param {string} price @param {string} variable */
export function breakEven(fixed, price, variable) {
  const cost = cents(fixed);
  const selling = cents(price);
  const contribution = selling - cents(variable);
  if (contribution <= 0) throw new Error('Price must exceed variable cost per unit to reach break-even.');
  const units = Math.ceil(cost / contribution);
  if (!Number.isSafeInteger(units * selling)) throw new Error('Required sales exceed the supported range. Use smaller amounts.');
  return { contribution: contribution / 100, units, sales: units * selling / 100 };
}

/** @param {string} cost @param {string} profit @param {string} hours */
export function hourlyRate(cost, profit, hours) {
  const time = BigInt(Math.round(number(hours, { min: 0.01, max: 8784 }) * 100));
  // A required rate rounds up to the cent, as break-even rounds units up, so the
  // rate times the hours always covers costs plus profit.
  const numerator = BigInt(cents(cost) + cents(profit)) * 100n;
  return { rate: Number((numerator + time - 1n) / time) / 100 };
}

/** Rounding steps a fixed fee can round up to, in cents. */
const FEE_STEPS = new Map([['0.01', 1n], ['10', 1000n], ['50', 5000n], ['100', 10000n]]);

/** A fixed fee from estimated hours at an hourly rate, or at a cost per hour with a target
 * margin on the fee, then GST and monthly instalments that add up to it to the cent.
 * @param {string} hours estimated hours for the work
 * @param {string} rate hourly rate, or cost per hour, before GST
 * @param {string} marginPercent margin as a share of the fee; 0 when the rate already includes profit
 * @param {'0.01' | '10' | '50' | '100'} roundTo the dollar step the fee rounds up to
 * @param {boolean} addGst add GST at 10% of the fee
 * @param {string} instalments the number of monthly instalments */
export function fixedFee(hours, rate, marginPercent, roundTo, addGst, instalments) {
  const step = FEE_STEPS.get(roundTo);
  if (!step) throw new Error('Choose a rounding step.');
  const time = BigInt(Math.round(number(hours, { min: 0.01, max: 8784 }) * 100));
  const margin = BigInt(Math.round(number(marginPercent, { max: 99.99 }) * 100));
  const count = BigInt(number(instalments, { min: 1, max: 24, integer: true }));
  // hours x rate / (1 - margin), in cents, rounded up to the step so the fee keeps the margin.
  const numerator = time * BigInt(cents(rate)) * 100n;
  const denominator = (10000n - margin) * step;
  const fee = (numerator + denominator - 1n) / denominator * step;
  const tax = addGst ? ratioCents(fee, 10n) : 0n;
  const total = fee + tax;
  if (total > 100000000000n) throw new Error('The fee is over $1,000,000,000. Use smaller amounts.');
  // Each instalment is the total divided evenly, rounded down to the cent; the first also
  // carries the cents left over, so the instalments add up to the total and the share paid
  // after any number of months is never less than that many months' share of the fee.
  const instalment = total / count;
  return { fee: Number(fee) / 100, gst: Number(tax) / 100, total: Number(total) / 100,
    first: Number(total - instalment * (count - 1n)) / 100, instalment: Number(instalment) / 100,
    effectiveRate: ratioMoney(fee * 100n, time) };
}

/** @param {string} actual @param {string} budget @param {'income' | 'cost'} kind */
export function variance(actual, budget, kind) {
  if (!['income', 'cost'].includes(kind)) throw new Error('Choose income or cost.');
  const base = cents(budget, -1e9);
  const difference = cents(actual, -1e9) - base;
  return { difference: difference / 100, percent: base ? ratioPercent(difference, Math.abs(base)) : null,
    effect: difference === 0 ? 'On budget' : (difference * (kind === 'income' ? 1 : -1) > 0 ? 'Favourable' : 'Unfavourable') };
}

export { FREQUENCIES, financeSchedule, financeResult, interestByIncomeYear } from './finance-schedule.mjs';
export { lease, leaseComparison, leaseResult } from './lease.mjs';
export { div7aMinimumRepayment, div7aSchedule, div7aScheduleResult } from './div7a.mjs';

const TRANSFER_DUTY_RULES = ['excess-rounded-up-to-100', 'excess', 'whole-value', 'nt-formula'];

/** General transfer (stamp) duty on one dutiable value, from one jurisdiction's scale in
 * rates/transfer-duty/transfer-duty-rates.csv. A bracket covers values above `over` up to and
 * including `to` ('' for no limit). Its rule says how the rate applies:
 * excess-rounded-up-to-100: base plus the rate for every $100, or part of $100, over `over`;
 * excess: base plus the rate per cent of the excess over `over`;
 * whole-value: the rate per cent of the whole value;
 * nt-formula: Stamp Duty Act 1978 (NT) Schedule 1 clause 1(2)(a): (0.06571441 x V squared)
 * + 15V, V being the value divided by 1,000.
 * A fraction of a cent rounds half up.
 * @param {string} value the dutiable value in whole dollars
 * @param {readonly (readonly string[])[]} scale
 *   [over, to, base, rate per cent, rule] for each bracket, lowest first */
export function transferDuty(value, scale) {
  const dollars = number(value, { min: 1, max: 1e9, integer: true, money: true });
  const contiguous = Array.isArray(scale) && scale.length > 0 && scale.every(([over, to, , , rule], index) =>
    TRANSFER_DUTY_RULES.includes(rule) && over === (index ? scale[index - 1][1] : '0')
      && (index === scale.length - 1 ? to === '' : /^\d+$/.test(to) && Number(to) > Number(over)));
  if (!contiguous) throw new Error('This jurisdiction’s rate table is not usable.');
  const bracket = scale.findIndex(([, to]) => to === '' || dollars <= Number(to));
  const [over, , base, rate, rule] = scale[bracket];
  const whole = BigInt(dollars);
  const excess = whole - BigInt(over);
  // A rate has at most 2 decimal places: whole hundredths of 1%, or cents for every $100.
  const hundredths = BigInt(Math.round(number(rate, { max: 100 }) * 100));
  const baseCents = BigInt(number(base, { integer: true })) * 100n;
  let duty;
  if (rule === 'excess-rounded-up-to-100') duty = baseCents + hundredths * ((excess + 99n) / 100n);
  else if (rule === 'excess') duty = baseCents + ratioCents(hundredths * excess, 100n);
  else if (rule === 'whole-value') duty = ratioCents(hundredths * whole, 100n);
  // (0.06571441 V^2 + 15 V) dollars with V = value / 1,000 is (6571441 value^2 + 15 x 10^11 value) / 10^12 cents.
  else duty = ratioCents(6571441n * whole * whole + 1500000000000n * whole, 1000000000000n);
  return { duty: Number(duty) / 100, bracket };
}

// First home buyer duty concessions on a home, new or established, bought as the buyer's
// principal place of residence, as each source stated them on 16 November 2026 (the
// calculator page lists the sources). Vacant land, off-the-plan and shared equity rules
// are left out. A home type missing here has no first home buyer concession.
/** @typedef {{rule: 'exempt'} | {rule: 'phase-out', exemptTo: bigint, below: bigint, minimum: bigint}
 *   | {rule: 'share', exemptTo: bigint, upTo: bigint} | {rule: 'per-100', exemptTo: bigint, upTo: bigint, cents: bigint}
 *   | {rule: 'home-rate-less', scale: string[][], amounts: bigint[][]}} FirstHomeRule */
/** @type {FirstHomeRule} */
const EXEMPT = { rule: 'exempt' };
// Revenue NSW: exempt to $800,000. Below $1,000,000 the duty on $800,000, scaled down
// evenly to nil at $1,000,000, comes off; Revenue NSW's calculator rounds that amount to the
// cent and keeps the $20 minimum.
/** @type {FirstHomeRule} */
const NSW_FIRST_HOME = { rule: 'phase-out', exemptTo: 800000n, below: 1000000n, minimum: 2000n };
// Duties Act 2000 (Vic) s 57JA: exempt to $600,000; to $750,000 the duty otherwise payable
// times (value - $600,000) / $150,000.
/** @type {FirstHomeRule} */
const VIC_FIRST_HOME = { rule: 'share', exemptTo: 600000n, upTo: 750000n };
// WA first home owner rate, agreements from 7 May 2026: exempt to $600,000; to $800,000,
// $16.15 for every $100, or part of $100, over $600,000.
/** @type {FirstHomeRule} */
const WA_FIRST_HOME = { rule: 'per-100', exemptTo: 600000n, upTo: 800000n, cents: 1615n };
// Queensland Revenue Office, contracts from 9 June 2024: the home concession rate less the
// first home concession amount for the value's $10,000 band, never below nil.
/** @type {FirstHomeRule} */
const QLD_FIRST_HOME = { rule: 'home-rate-less',
  scale: [['0', '350000', '0', '1', 'excess-rounded-up-to-100'], ['350000', '540000', '3500', '3.5', 'excess-rounded-up-to-100'],
    ['540000', '1000000', '10150', '4.5', 'excess-rounded-up-to-100'], ['1000000', '', '30850', '5.75', 'excess-rounded-up-to-100']],
  // [highest whole-dollar value, amount in dollars]; nil from $800,000.
  amounts: [[709999n, 17350n], [719999n, 15615n], [729999n, 13880n], [739999n, 12145n], [749999n, 10410n],
    [759999n, 8675n], [769999n, 6940n], [779999n, 5205n], [789999n, 3470n], [799999n, 1735n]] };
/** @type {Record<string, {established?: FirstHomeRule, new?: FirstHomeRule}>} */
const FIRST_HOME = {
  'AU-NSW': { established: NSW_FIRST_HOME, new: NSW_FIRST_HOME },
  'AU-VIC': { established: VIC_FIRST_HOME, new: VIC_FIRST_HOME },
  // First home (new home) concession, from 1 May 2025: full, with no value cap.
  'AU-QLD': { established: QLD_FIRST_HOME, new: EXEMPT },
  'AU-WA': { established: WA_FIRST_HOME, new: WA_FIRST_HOME },
  // RevenueSA, contracts from 13 February 2025: full relief on a new home, whatever its value.
  'AU-SA': { new: EXEMPT },
  'AU-TAS': {},
  // ACT Home Buyer Concession Scheme, transactions from 1 July 2026: no duty, with no value limit.
  'AU-ACT': { established: EXEMPT, new: EXEMPT },
  'AU-NT': {},
};

/** Transfer duty for a buyer who meets a jurisdiction's first home buyer conditions, on a
 * home bought as their principal place of residence; the conditions are not tested.
 * `general` is transferDuty's figure on the same scale, and `concession` is false where
 * the jurisdiction has no first home buyer concession for that home.
 * @param {string} value the dutiable value in whole dollars
 * @param {readonly (readonly string[])[]} scale the jurisdiction's general scale, as transferDuty takes it
 * @param {string} place the jurisdiction's code, such as 'AU-NSW'
 * @param {string} home 'established' or 'new' */
export function firstHomeDuty(value, scale, place, home) {
  if (!Object.hasOwn(FIRST_HOME, place)) throw new Error('Choose a state or territory.');
  if (home !== 'established' && home !== 'new') throw new Error('Choose an established or a new home.');
  const general = transferDuty(value, scale).duty;
  const scheme = FIRST_HOME[place][home];
  if (!scheme) return { duty: general, general, concession: false };
  const whole = BigInt(number(value, { min: 1, max: 1e9, integer: true, money: true }));
  // transferDuty's figures are whole cents, so this recovers them exactly.
  const centsOf = (/** @type {string} */ dollars, rates = scale) => BigInt(Math.round(transferDuty(dollars, rates).duty * 100));
  let duty;
  if (scheme.rule === 'exempt') duty = 0n;
  else if (scheme.rule === 'home-rate-less') {
    const amount = (scheme.amounts.find(([upTo]) => whole <= upTo)?.[1] ?? 0n) * 100n;
    duty = centsOf(value, scheme.scale) - amount;
    if (duty < 0n) duty = 0n;
  } else if (whole <= scheme.exemptTo) duty = 0n;
  // Above the concession's range, general duty applies.
  else if (scheme.rule === 'phase-out' ? whole >= scheme.below : whole > scheme.upTo) duty = centsOf(value);
  else if (scheme.rule === 'phase-out') {
    const off = ratioCents(centsOf(String(scheme.exemptTo)) * (scheme.below - whole), scheme.below - scheme.exemptTo);
    duty = centsOf(value) - off;
    if (duty < scheme.minimum) duty = scheme.minimum;
  } else if (scheme.rule === 'share') {
    duty = ratioCents(centsOf(value) * (whole - scheme.exemptTo), scheme.upTo - scheme.exemptTo);
  } else duty = scheme.cents * ((whole - scheme.exemptTo + 99n) / 100n);
  return { duty: Number(duty) / 100, general, concession: true };
}

/**
 * @typedef {{method: 'statutory' | 'operating', cost: string, accessories: string, reduced: boolean,
 *   days: string, costs: string, businessUse: string, contribution: string}} FbtCar
 * @typedef {{days: string, grossUp: string, fbtRate: string}} FbtYear
 */

/** FBT on one car's fringe benefits for one FBT year. The statutory formula is s 9 of the
 * Fringe Benefits Tax Assessment Act 1986, base value × 20% × days available ÷ days in the
 * year, less the recipient's payment, with the cost price cut to two-thirds under s 9(2)(a)
 * once the car has been held 4 years. The operating cost method is s 10(2), operating costs
 * × (100% − business use) less the recipient's payment, and s 10(5) keeps the statutory
 * value when it is lower. The Act prescribes no rounding: each value rounds half up to the
 * cent before the payment comes off, never below nil, and the grossed-up value and the FBT
 * round half up from the figure before them.
 * @param {FbtCar} car the car's figures as entered
 * @param {FbtYear} year the FBT year's days, gross-up rate and FBT rate, from the caller */
export function fbtCar(car, year) {
  if (!['statutory', 'operating'].includes(car.method)) throw new Error('Choose a valuation method.');
  if (typeof car.reduced !== 'boolean') throw new Error('Say whether the car was held for 4 years.');
  const yearDays = number(year.days, { min: 365, max: 366, integer: true });
  const days = BigInt(number(car.days, { max: yearDays, integer: true }));
  // The base value in thirds of a cent, so two-thirds of any cost price stays exact.
  const base = BigInt(cents(car.cost)) * (car.reduced ? 2n : 3n) + 3n * BigInt(cents(car.accessories));
  const payment = cents(car.contribution);
  /** @param {bigint} numerator @param {bigint} denominator */
  const net = (numerator, denominator) => Math.max(0, Number(ratioCents(numerator, denominator)) - payment);
  const statutory = net(base * 20n * days, 300n * BigInt(yearDays));
  const operating = car.method === 'operating'
    ? net(BigInt(cents(car.costs)) * (10000n - BigInt(Math.round(number(car.businessUse, { max: 100 }) * 100))), 10000n)
    : null;
  // Operating costs always include the car's deemed depreciation and interest or its lease
  // charges, so nil means none were entered, not a car that cost nothing to run.
  if (operating !== null && cents(car.costs) === 0) throw new Error('Enter the car’s operating costs for the year to use the operating cost method.');
  const taxable = Math.min(statutory, operating ?? statutory);
  const grossedUp = ratioCents(BigInt(taxable) * BigInt(Math.round(number(year.grossUp, { min: 1, max: 3, places: 4 }) * 10000)), 10000n);
  const fbt = ratioCents(grossedUp * BigInt(Math.round(number(year.fbtRate, { min: 0.01, max: 100 }) * 100)), 10000n);
  return { baseValue: ratioMoney(base, 3n), statutory: statutory / 100, operating: operating === null ? null : operating / 100,
    taxableValue: taxable / 100, grossedUp: Number(grossedUp) / 100, fbt: Number(fbt) / 100 };
}

/** @param {string} wages @param {string} superAmount @param {string} other */
export function staffCost(wages, superAmount, other) {
  const annual = (cents(wages) + cents(superAmount) + cents(other)) / 100;
  return { annual, monthly: ratioMoney(BigInt(cents(wages) + cents(superAmount) + cents(other)), 12n) };
}

/** @param {string} startDate */
export function cashWeekDates(startDate) {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)
    || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== startDate
    || date.getUTCFullYear() < 1900) throw new Error('Enter a valid first day from 1900 onwards.');
  const dates = Array.from({ length: 13 }, (_, week) => ({
    start: new Date(date.getTime() + week * 7 * 86400000).toISOString().slice(0, 10),
    end: new Date(date.getTime() + (week * 7 + 6) * 86400000).toISOString().slice(0, 10),
  }));
  if (dates[dates.length - 1].end.startsWith('+')) throw new Error('All 13 weeks must end before the year 10000.');
  return dates;
}

/** @param {unknown} text @returns {CashScenario} */
export function parseCashScenario(text) {
  if (typeof text !== 'string' || text.length > 65536) throw new Error('Choose a scenario file under 64 KB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Choose a valid scenario JSON file.'); }
  if (!data || data.version !== 1 || data.currency !== 'AUD') throw new Error('Choose a version 1 AUD cash scenario.');
  cashWeekDates(data.startDate);
  cashForecast(data.opening, data.weeks, data.buffer, { week: data.week, amount: data.amount, delay: data.delay });
  // Number inputs discard surrounding whitespace, '$' and grouping commas that numeric validation accepts.
  /** @param {unknown} value */
  const plain = value => String(value).trim().replace(/[$,]/g, '');
  return { version: 1, currency: 'AUD', startDate: data.startDate, opening: plain(data.opening), buffer: plain(data.buffer),
    week: plain(data.week), amount: plain(data.amount), delay: plain(data.delay),
    weeks: data.weeks.map(/** @param {CashWeek} row */ row => ({ receipts: plain(row.receipts), payments: plain(row.payments) })) };
}

/** @type {Readonly<CashDeferral>} */
const NO_DEFERRAL = Object.freeze({ week: 1, amount: '0', delay: 0 });

/** @param {string} opening @param {readonly CashWeek[]} weeks @param {string} buffer
 * @param {CashDeferral} [scenario] */
export function cashForecast(opening, weeks, buffer, scenario = NO_DEFERRAL) {
  if (!Array.isArray(weeks) || weeks.length !== 13) throw new Error('Enter all 13 weeks.');
  let balance = cents(opening, -1e9);
  const minimumBuffer = cents(buffer);
  const rows = weeks.map(row => ({ receipts: cents(row.receipts), payments: cents(row.payments) }));
  const week = number(String(scenario.week), { min: 1, max: 13, integer: true }) - 1;
  const delay = number(String(scenario.delay), { max: 13, integer: true });
  const delayed = cents(scenario.amount);
  if (delayed > rows[week].receipts) throw new Error('The delayed receipt cannot exceed that week\'s receipts.');
  rows[week].receipts -= delayed;
  const deferred = week + delay >= rows.length ? delayed : 0;
  if (week + delay < rows.length) rows[week + delay].receipts += delayed;
  let minimum = balance;
  const result = rows.map((row, index) => {
    const start = balance;
    balance += row.receipts - row.payments;
    minimum = Math.min(minimum, balance);
    return { week: index + 1, opening: start / 100, receipts: row.receipts / 100,
      payments: row.payments / 100, closing: balance / 100 };
  });
  return { rows: result, closing: balance / 100, minimum: minimum / 100,
    funding: Math.max(0, minimumBuffer - minimum) / 100, deferred: deferred / 100 };
}

const DAY = 86400000;
/** @param {unknown} text @returns {Date} midnight UTC on that calendar day */
function noticeDay(text) {
  const date = new Date(`${text}T00:00:00Z`);
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== text || text < '1900-01-01' || text > '9989-12-31') {
    throw new Error('Enter a date from 1 January 1900 to 31 December 9989.');
  }
  return date;
}
/** @param {Date} date */
const isoDay = (date) => date.toISOString().slice(0, 10);
/** The last day of a period of whole years after a day. Under s 36(1) item 6 of the Acts
 * Interpretation Act 1901 the period starts the next day, and it runs to the day before that
 * date in the later year; a 29 February start with no 29 February then runs to 28 February.
 * @param {Date} day @param {number} years */
function yearsAfter(day, years) {
  const start = new Date(day.getTime() + DAY);
  return new Date(Date.UTC(start.getUTCFullYear() + years, start.getUTCMonth(), start.getUTCDate()) - DAY);
}
/** @param {Date} day */
const sixtyDaysAfter = (day) => new Date(day.getTime() + 60 * DAY);

/** @typedef {'assessment' | 'amended' | 'fbt' | 'amended-fbt' | 'other'} ObjectionDecision */
/** The last day to lodge a taxation objection under s 14ZW of the Taxation Administration Act
 * 1953, and the day s 36(2) of the Acts Interpretation Act 1901 allows when it is a Saturday or
 * Sunday. Public holidays depend on the place of lodgement and are not applied.
 * @param {ObjectionDecision} decision
 * @param {'2' | '4'} group the s 170(1) item that applies to an income tax assessment: '2' for
 *   item 1, 2, 3 or 3A, '4' otherwise; not read for other decisions
 * @param {string} notice the day notice of the decision was given or served
 * @param {string} first for an amended assessment, the day notice of the first assessment for the year was given
 * @returns {{rule: string, periodEnds: string, lastDay: string, amendedEnds: string | null, firstEnds: string | null}} */
export function objectionDeadline(decision, group, notice, first) {
  if (!['assessment', 'amended', 'fbt', 'amended-fbt', 'other'].includes(decision)) throw new Error('Choose the decision objected to.');
  const income = decision === 'assessment' || decision === 'amended';
  if (income && group !== '2' && group !== '4') throw new Error('Choose whether item 1, 2, 3 or 3A applies.');
  const years = decision === 'fbt' || decision === 'amended-fbt' || group === '4' ? 4 : 2;
  const day = noticeDay(notice);
  let rule = decision === 'other' ? 'paragraph 14ZW(1)(c)' : decision === 'fbt' ? 'paragraph 14ZW(1)(aaa)'
    : `subparagraph 14ZW(1)(aa)(${years === 2 ? 'i' : 'ii'})`;
  let periodEnds = decision === 'other' ? sixtyDaysAfter(day) : yearsAfter(day, years);
  /** @type {string | null} */
  let amendedEnds = null;
  /** @type {string | null} */
  let firstEnds = null;
  if (decision === 'amended' || decision === 'amended-fbt') {
    // Subsections (1B) and (1BA): the later of 60 days after the amended notice and the
    // original period after the first assessment's notice (subsection (1C)).
    const firstDay = noticeDay(first);
    if (firstDay.getTime() > day.getTime()) throw new Error('The first assessment’s notice cannot be later than the amended one.');
    const amended = sixtyDaysAfter(day);
    const original = yearsAfter(firstDay, years);
    amendedEnds = isoDay(amended);
    firstEnds = isoDay(original);
    rule = years === 2 ? 'subsection 14ZW(1BA)' : 'subsection 14ZW(1B)';
    periodEnds = amended.getTime() > original.getTime() ? amended : original;
  }
  // s 36(2): a Saturday or Sunday moves to the next day that is not one.
  const weekday = periodEnds.getUTCDay();
  const lastDay = new Date(periodEnds.getTime() + (weekday === 6 ? 2 : weekday === 0 ? 1 : 0) * DAY);
  return { rule, periodEnds: isoDay(periodEnds), lastDay: isoDay(lastDay), amendedEnds, firstEnds };
}

/** @typedef {'amount' | 'varied-amount' | 'rate' | 'varied-rate'} InstalmentMethod
 * @typedef {{method: InstalmentMethod, notified: string, instalment: string, estimatedTax: string, earlier: string,
 *   credits: string, income: string, rate: string, estimatedIncome: string, earlierIncome: string}} InstalmentInputs */
/** Cents down to whole dollars, as an activity statement takes them. @param {number} value cents, not negative */
const wholeDollars = (value) => Math.floor(value / 100);

/** One quarterly PAYG instalment under Division 45 in Schedule 1 to the Taxation Administration
 * Act 1953, worked as the ATO's activity statement steps work it: the notified amount (s 45-112),
 * an amount varied from estimated tax (s 45-410), instalment income times the rate (s 45-110), or
 * times a varied rate (s 45-205) with any credit for earlier quarters (s 45-215). Each method reads
 * only its own fields. Money rounds half up to the cent; a figure for the activity statement then
 * drops its cents, and a varied rate drops what follows its second decimal place.
 * @param {InstalmentInputs} inputs
 * @returns {{amount: number, instalment: number, credit: number, due: number | null, instalmentRate: number | null}} */
export function paygInstalment(inputs) {
  const { method } = inputs;
  if (method === 'amount') {
    const notified = cents(inputs.notified);
    return { amount: notified / 100, instalment: wholeDollars(notified), credit: 0, due: null, instalmentRate: null };
  }
  const earlierLessCredits = () => {
    const [earlier, credits] = [cents(inputs.earlier), cents(inputs.credits)];
    if (credits > earlier) throw new Error('Credits claimed cannot exceed the earlier instalments.');
    return earlier - credits;
  };
  if (method === 'varied-amount') {
    const instalment = number(inputs.instalment, { min: 1, max: 4, integer: true });
    // 25%, 50%, 75% or 100% of estimated tax, less earlier instalments net of credits claimed. Only the
    // third and fourth add back credits (s 45-410(4) and (5)); none can exist before the second.
    const due = Number(ratioCents(BigInt(cents(inputs.estimatedTax)) * BigInt(instalment), 4n));
    if (instalment === 1 && cents(inputs.earlier)) throw new Error('The first instalment of the year has no earlier instalments.');
    const net = earlierLessCredits();
    if (instalment < 3 && cents(inputs.credits)) throw new Error('The first and second instalments of the year add back no credits.');
    const amount = due - net;
    return { amount: amount / 100, instalment: wholeDollars(Math.max(0, amount)), credit: wholeDollars(Math.max(0, -amount)),
      due: due / 100, instalmentRate: null };
  }
  if (method !== 'rate' && method !== 'varied-rate') throw new Error('Choose how this instalment is worked out.');
  // Rates are whole hundredths of a per cent.
  const given = Math.round(number(inputs.rate, { max: 100 }) * 100);
  let rate = given;
  let credit = 0;
  if (method === 'varied-rate') {
    const [tax, yearIncome] = [BigInt(cents(inputs.estimatedTax)), BigInt(cents(inputs.estimatedIncome))];
    if (tax > yearIncome) throw new Error('Estimated tax cannot exceed estimated instalment income.');
    rate = yearIncome ? Number(tax * 10000n / yearIncome) : 0;
    if (rate < given) {
      const earlierAtRate = Number(ratioCents(BigInt(cents(inputs.earlierIncome)) * BigInt(rate), 10000n));
      credit = wholeDollars(Math.max(0, earlierLessCredits() - earlierAtRate));
    }
  }
  const amount = Number(ratioCents(BigInt(cents(inputs.income)) * BigInt(rate), 10000n));
  return { amount: amount / 100, instalment: wholeDollars(amount), credit, due: null, instalmentRate: rate / 100 };
}

/**
 * @typedef {{redundancy: string, years: string, excluded: string, nonExcluded: string,
 *   other: string, born: string}} TerminationPayment
 * @typedef {{yearEnd: string, etpCap: string, wholeOfIncomeCap: string, baseAmount: string,
 *   serviceAmount: string, rateUnder: string, rateReached: string, rateAbove: string}} EtpYear
 */

/** The payer's withholding from one life benefit employment termination payment under
 * Schedule 11 of the Taxation Administration (Withholding Schedules) Instrument 2026. The
 * tax-free part of a genuine redundancy or early retirement scheme payment is the base amount
 * plus the service amount for each completed year of service (ITAA 1997 s 83-170). The code R
 * part (the redundancy payment over that, and other excluded payments) comes first, within the
 * ETP cap alone; the code O part comes second, within the smaller of the ETP cap left and the
 * whole-of-income cap less the payer's other taxable payments (Schedule 11, 'Steps to work out
 * smallest cap' and example 4). Each part is withheld at the rate within its cap, set by
 * whether the employee is their preservation age by the year's end, and the top rate above
 * it, rounded to the nearest dollar with 50 cents up.
 * @param {TerminationPayment} payment the payment's parts as entered, money in AUD
 * @param {EtpYear} year the income year's last day, caps, amounts and Table A rates, from the caller */
export function terminationPayment(payment, year) {
  const born = payment.born;
  const date = new Date(`${born}T00:00:00Z`);
  if (typeof born !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(born) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== born || born < '1900' || born > year.yearEnd) {
    throw new Error('Enter a valid date of birth from 1900 to the end of the income year.');
  }
  // Schedule 11's preservation age table: 55 if born before 1 July 1960, a year more for each
  // later year from 1 July, and 60 if born after 30 June 1964.
  const july = Number(born.slice(0, 4)) - (Number(born.slice(5, 7)) < 7 ? 1 : 0);
  const age = Math.min(60, Math.max(55, july - 1904));
  const reached = `${Number(born.slice(0, 4)) + age}${born.slice(4)}` <= year.yearEnd;
  /** @param {string} value a Table A rate in per cent, as hundredths of 1% */
  const rate = (value) => BigInt(Math.round(number(value, { max: 100 }) * 100));
  const [within, above] = [rate(reached ? year.rateReached : year.rateUnder), rate(year.rateAbove)];
  /** @param {number} component cents @param {number} cap cents @returns {[number, number]} */
  const part = (component, cap) => {
    const inside = Math.min(component, cap);
    // Cents times hundredths of 1% are millionths of a dollar.
    const dollars = ratioCents(BigInt(inside) * within + BigInt(component - inside) * above, 1000000n);
    return [inside, Number(dollars) * 100];
  };
  const etpCap = cents(year.etpCap);
  const limit = cents(year.baseAmount) + cents(year.serviceAmount) * number(payment.years, { max: 150, integer: true });
  const redundancy = cents(payment.redundancy);
  const taxFree = Math.min(redundancy, limit);
  const excluded = redundancy - taxFree + cents(payment.excluded);
  const [excludedWithin, excludedWithholding] = part(excluded, etpCap);
  const wholeOfIncomeCap = Math.max(0, cents(year.wholeOfIncomeCap) - cents(payment.other));
  const cap = Math.min(etpCap - excludedWithin, wholeOfIncomeCap);
  const [, nonExcludedWithholding] = part(cents(payment.nonExcluded), cap);
  return { reached, rate: Number(within) / 100, taxFreeLimit: limit / 100, taxFree: taxFree / 100,
    excluded: excluded / 100, excludedWithholding: excludedWithholding / 100, wholeOfIncomeCap: wholeOfIncomeCap / 100,
    cap: cap / 100, nonExcludedWithholding: nonExcludedWithholding / 100,
    withholding: (excludedWithholding + nonExcludedWithholding) / 100 };
}

/** The general interest charge annual rate for each quarter, from its first day, as the ATO's
 * 'General interest charge (GIC) rates' page lists it; the same rows as
 * rates/general-interest-charge/general-interest-charge-rates.csv, which a Node test holds them to.
 * @type {ReadonlyArray<readonly [string, string]>} */
export const GIC_QUARTERS = [
  ['1999-07-01', '12.72'], ['1999-10-01', '12.73'], ['2000-01-01', '13.08'], ['2000-04-01', '13.65'],
  ['2000-07-01', '14.00'], ['2000-10-01', '13.86'], ['2001-01-01', '13.86'], ['2001-04-01', '13.86'],
  ['2001-07-01', '11.89'], ['2001-10-01', '11.95'], ['2002-01-01', '11.28'], ['2002-04-01', '11.31'],
  ['2002-07-01', '11.84'], ['2002-10-01', '11.96'], ['2003-01-01', '11.84'], ['2003-04-01', '11.75'],
  ['2003-07-01', '11.78'], ['2003-10-01', '11.82'], ['2004-01-01', '12.31'], ['2004-04-01', '12.57'],
  ['2004-07-01', '12.51'], ['2004-10-01', '12.44'], ['2005-01-01', '12.43'], ['2005-04-01', '12.63'],
  ['2005-07-01', '12.68'], ['2005-10-01', '12.62'], ['2006-01-01', '12.63'], ['2006-04-01', '12.61'],
  ['2006-07-01', '12.87'], ['2006-10-01', '13.19'], ['2007-01-01', '13.37'], ['2007-04-01', '13.37'],
  ['2007-07-01', '13.37'], ['2007-10-01', '13.75'], ['2008-01-01', '14.15'], ['2008-04-01', '14.69'],
  ['2008-07-01', '14.75'], ['2008-10-01', '14.31'], ['2009-01-01', '11.76'], ['2009-04-01', '10.16'],
  ['2009-07-01', '10.13'], ['2009-10-01', '10.30'], ['2010-01-01', '10.95'], ['2010-04-01', '11.16'],
  ['2010-07-01', '11.80'], ['2010-10-01', '11.74'], ['2011-01-01', '12.02'], ['2011-04-01', '11.92'],
  ['2011-07-01', '12.00'], ['2011-10-01', '11.86'], ['2012-01-01', '11.62'], ['2012-04-01', '11.37'],
  ['2012-07-01', '10.66'], ['2012-10-01', '10.62'], ['2013-01-01', '10.24'], ['2013-04-01', '9.95'],
  ['2013-07-01', '9.82'], ['2013-10-01', '9.60'], ['2014-01-01', '9.59'], ['2014-04-01', '9.63'],
  ['2014-07-01', '9.69'], ['2014-10-01', '9.63'], ['2015-01-01', '9.75'], ['2015-04-01', '9.36'],
  ['2015-07-01', '9.15'], ['2015-10-01', '9.14'], ['2016-01-01', '9.22'], ['2016-04-01', '9.28'],
  ['2016-07-01', '9.01'], ['2016-10-01', '8.76'], ['2017-01-01', '8.76'], ['2017-04-01', '8.78'],
  ['2017-07-01', '8.73'], ['2017-10-01', '8.70'], ['2018-01-01', '8.72'], ['2018-04-01', '8.77'],
  ['2018-07-01', '8.96'], ['2018-10-01', '8.96'], ['2019-01-01', '8.94'], ['2019-04-01', '8.96'],
  ['2019-07-01', '8.54'], ['2019-10-01', '7.98'], ['2020-01-01', '7.91'], ['2020-04-01', '7.89'],
  ['2020-07-01', '7.10'], ['2020-10-01', '7.10'], ['2021-01-01', '7.02'], ['2021-04-01', '7.01'],
  ['2021-07-01', '7.04'], ['2021-10-01', '7.01'], ['2022-01-01', '7.04'], ['2022-04-01', '7.07'],
  ['2022-07-01', '8.00'], ['2022-10-01', '9.31'], ['2023-01-01', '10.06'], ['2023-04-01', '10.46'],
  ['2023-07-01', '10.90'], ['2023-10-01', '11.15'], ['2024-01-01', '11.38'], ['2024-04-01', '11.34'],
  ['2024-07-01', '11.36'], ['2024-10-01', '11.38'], ['2025-01-01', '11.42'], ['2025-04-01', '11.17'],
  ['2025-07-01', '10.78'], ['2025-10-01', '10.61'], ['2026-01-01', '10.65'], ['2026-04-01', '10.96'],
  ['2026-07-01', '11.43'], ['2026-10-01', '11.51'],
];
/** @param {number} year */
const yearDays = (year) => (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365);
/** @param {string} date an ISO calendar date, as a whole number of days since 1970 */
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY;
/** @param {number} day a whole number of days since 1970 @returns {string} */
const isoDayNumber = (day) => isoDay(new Date(day * DAY));
// Each quarter's first day and annual rate in hundredths of 1%, and the day after the table ends.
const GIC_FROM = GIC_QUARTERS.map(([from, rate]) => ({ from: dayNumber(from), rate: Math.round(Number(rate) * 100) }));
const GIC_TABLE_END = (() => {
  const last = new Date(GIC_FROM[GIC_FROM.length - 1].from * DAY);
  return Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 3, 1) / DAY;
})();

/** Instalment days: every 7 or 14 days, or the same day of each month, or the month's last day.
 * @param {number} start @param {number} count @param {'weekly' | 'fortnightly' | 'monthly'} frequency */
function instalmentDays(start, count, frequency) {
  const first = new Date(start * DAY);
  return Array.from({ length: count }, (_, k) => {
    if (frequency !== 'monthly') return start + k * (frequency === 'weekly' ? 7 : 14);
    const [year, month] = [first.getUTCFullYear(), first.getUTCMonth() + k];
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Date.UTC(year, month, Math.min(first.getUTCDate(), last)) / DAY;
  });
}

/** The general interest charge on a tax debt paid by equal instalments, against paying it all now.
 * GIC for a day is the GIC rate for that day times the debt and earlier GIC still unpaid at
 * its end (Taxation Administration Act 1953 s 8AAC); the rate for a day is the quarter's annual
 * rate divided by the days in its calendar year (s 8AAD(1)). Instalments start on the start
 * date. The equal instalment is worked exactly and rounded down to the cent; the final
 * instalment pays the rest, half up to the cent. Days after the last quarter in the table
 * use the assumed annual rate.
 * @param {{debt: string, start: string, count: string, frequency: 'weekly' | 'fortnightly' | 'monthly',
 *   assumedRate: string}} plan */
export function gicPaymentPlan(plan) {
  const debt = BigInt(cents(plan.debt));
  if (debt === 0n) throw new Error('Enter a debt above nil.');
  const start = dayNumber(plan.start);
  if (typeof plan.start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(plan.start) || !Number.isInteger(start)
    || isoDayNumber(start) !== plan.start || start < GIC_FROM[0].from || plan.start > '2099-12-31') {
    throw new Error(`Enter a start date from ${GIC_QUARTERS[0][0]} to 2099-12-31.`);
  }
  const count = number(plan.count, { min: 1, max: 120, integer: true });
  if (!['weekly', 'fortnightly', 'monthly'].includes(plan.frequency)) throw new Error('Choose weekly, fortnightly or monthly.');
  const assumed = Math.round(number(plan.assumedRate, { min: 0.01, max: 100 }) * 100);
  const days = instalmentDays(start, count, plan.frequency);
  const last = days[days.length - 1];
  // Over a common denominator: the debt grown to each day, and the growth of 1 cent paid on each
  // instalment day. Each day's factor is (10,000 x days in the year + rate) / (10,000 x days in the year).
  let [grown, paid, scale, assumedDays, quarter] = [debt, 0n, 1n, 0, 0];
  for (let day = start, next = 0; ; day += 1) {
    if (day === days[next]) {
      paid += scale;
      next += 1;
    }
    if (day === last) break;
    while (quarter + 1 < GIC_FROM.length && GIC_FROM[quarter + 1].from <= day) quarter += 1;
    const rate = day < GIC_TABLE_END ? GIC_FROM[quarter].rate : assumed;
    if (day >= GIC_TABLE_END) assumedDays += 1;
    const base = 10000n * BigInt(yearDays(new Date(day * DAY).getUTCFullYear()));
    [grown, paid, scale] = [grown * (base + BigInt(rate)), paid * (base + BigInt(rate)), scale * base];
  }
  const instalment = grown / paid;
  const left = grown - instalment * (paid - scale);
  const final = (2n * left + scale) / (2n * scale);
  const totalPaid = instalment * BigInt(count - 1) + final;
  return { instalment: Number(instalment) / 100, final: Number(final) / 100, totalPaid: Number(totalPaid) / 100,
    gic: Number(totalPaid - debt) / 100, lastDate: isoDayNumber(last), assumedDays };
}

export { division296, division296Result } from './division-296.mjs';
export { payrollTax, payrollTaxResult } from './payroll-tax.mjs';
export { companyTax, companyTaxResult } from './company-tax.mjs';
export { gstMarginScheme, gstMarginSchemeResult } from './gst-margin-scheme.mjs';
export { lowValuePool, smallBusinessPool, capitalWorks, depreciationPoolsResult, poolFormInput, poolInputsText, POOL_YEARS } from './depreciation-pools.mjs';
export { wineEqualisationTax, wineEqualisationTaxResult, wetFormInput, wetInputsText, WET_YEARS } from './wine-equalisation-tax.mjs';
export { atoPenaltiesInterest, atoPenaltiesFormInput, atoPenaltiesInputsText, atoPenaltiesInterestResult, ATO_PENALTY_YEARS, PENALTY_UNITS } from './ato-penalties-interest.mjs';
export { asicFee, asicFeesResult, asicFeeFormInput, asicFeeInputsText, firstMonthEnds, ASIC_FEES, ASIC_LATE_FEES } from './asic-fees.mjs';
export { salaryDividend, salaryDividendResult } from './salary-dividend.mjs';
export { firbApplicationFee, firbFee, foreignSurcharge, foreignSurchargeResult } from './foreign-surcharge.mjs';
export { businessDays, businessDaysResult, parseHolidays } from './business-days.mjs';
