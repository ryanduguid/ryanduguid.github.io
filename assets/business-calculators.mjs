// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Planning arithmetic. Rates, eligibility and classifications belong to the caller.
// Money inputs are decimal strings in AUD; monetary results are numeric AUD.
/**
 * @typedef {{receipts: string, payments: string}} CashWeek
 * @typedef {{week: number | string, amount: string, delay: number | string}} CashDeferral
 * @typedef {{version: 1, currency: 'AUD', startDate: string, opening: string,
 *   buffer: string, week: string, amount: string, delay: string, weeks: CashWeek[]}} CashScenario
 */

/** @param {unknown} value
 * @param {{min?: number, max?: number, places?: number, integer?: boolean, money?: boolean}} [options] */
function number(value, { min = 0, max = 1e9, places = 2, integer = false, money = false } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  // Thousands may be grouped in 3s ('85,000'), and money may start with '$' after
  // any minus sign. A number field accepts exponent notation such as 1e3; ask for
  // digits instead of blaming decimal places the entry does not have.
  const parts = /^-?(\$?)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(text);
  if (!parts || (parts[1] && !money)) throw new Error('Enter a number using digits only.');
  if ((parts[2] ?? '').length > places) {
    throw new Error(`Enter a number with no more than ${places} decimal places.`);
  }
  const result = Number(text.replace(/[$,]/g, ''));
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) {
    throw new Error(`Enter ${integer ? 'a whole number' : 'an amount'} between ${min} and ${max}.`);
  }
  return result;
}

/** @param {string} value @param {number} [min] */
const cents = (value, min = 0) => Math.round(number(value, { min, money: true }) * 100);
// Non-negative ratios in cents round half up. BigInt keeps large products exact.
/** @param {bigint} numerator @param {bigint} denominator */
const ratioCents = (numerator, denominator) => (2n * numerator + denominator) / (2n * denominator);
/** @param {bigint} numerator @param {bigint} denominator */
const ratioMoney = (numerator, denominator) => Number(ratioCents(numerator, denominator)) / 100;
// Percentages round half away from zero to 0.01, as Excel's ROUND does, from the
// exact cents ratio rather than a float quotient. A zero result is never -0.
/** @param {number} numerator cents @param {number} denominator cents, positive */
const ratioPercent = (numerator, denominator) => {
  const [top, bottom] = [BigInt(Math.abs(numerator)) * 10000n, BigInt(denominator)];
  const hundredths = Number((2n * top + bottom) / (2n * bottom));
  return (numerator < 0 && hundredths ? -hundredths : hundredths) / 100;
};

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

/** @param {string} principal @param {string} annualRate @param {string} months
 * @param {string} [balloon] the lump sum still owed at the end of the term
 * @param {'arrears' | 'advance'} [timing] payments at the end or the start of each month */
export function loan(principal, annualRate, months, balloon = '0', timing = 'arrears') {
  if (!['arrears', 'advance'].includes(timing)) throw new Error('Choose payments in arrears or in advance.');
  const balanceCents = BigInt(cents(principal));
  const rateUnits = BigInt(Math.round(number(annualRate, { max: 100, places: 4 }) * 10000));
  const term = BigInt(number(months, { min: 1, max: 600, integer: true }));
  const residual = BigInt(cents(balloon));
  if (residual > balanceCents) throw new Error('The balloon cannot be more than the loan principal.');
  const advance = timing === 'advance';
  const rateScale = 12000000n;
  // A payment in advance falls before any interest accrues.
  const firstInterest = advance ? 0 : ratioMoney(balanceCents * rateUnits, rateScale);
  if (rateUnits === 0n) {
    const payment = ratioMoney(balanceCents - residual, term);
    return { payment, firstInterest: 0, firstPrincipal: payment, totalInterest: 0 };
  }
  // Multiply through by rateScale ** term to keep the amortisation fractions exact. The
  // balloon's value today comes off the principal; each payment in advance is discounted
  // one month less, so the payment is one month's growth smaller.
  const growth = (rateScale + rateUnits) ** term;
  const scale = rateScale ** term;
  const denominator = (advance ? rateScale + rateUnits : rateScale) * (growth - scale);
  const paymentNumerator = (balanceCents * growth - residual * scale) * rateUnits;
  const payment = ratioMoney(paymentNumerator, denominator);
  return { payment, firstInterest,
    firstPrincipal: advance ? payment : ratioMoney((balanceCents - residual) * rateUnits * scale, denominator),
    totalInterest: ratioMoney(paymentNumerator * term - (balanceCents - residual) * denominator, denominator) };
}

/** Division 7A minimum yearly repayment of an amalgamated loan: s 109E(6) of the Income
 * Tax Assessment Act 1936, as the ATO's five steps state it. The Act prescribes no rounding;
 * each amount rounds half up to the cent. The interest part is the benchmark rate on the
 * whole balance for the year, so the parts assume one repayment on the year's last day.
 * @param {string} balance the loan not repaid at the end of the previous income year
 * @param {string} benchmarkRate the current year's benchmark interest rate, in per cent
 * @param {string} remainingTerm the remaining term in whole years */
export function div7aMinimumRepayment(balance, benchmarkRate, remainingTerm) {
  const balanceCents = BigInt(cents(balance));
  // A benchmark rate has two decimal places: a whole number of 1/10,000ths a year.
  const rate = BigInt(Math.round(number(benchmarkRate, { min: 0.01, max: 100 }) * 100));
  const term = BigInt(number(remainingTerm, { min: 1, max: 25, integer: true }));
  // balance x I / (1 - (1 / (1 + I)) ^ T), multiplied through by 10,000 ^ (T + 1).
  const growth = (10000n + rate) ** term;
  const scale = 10000n ** term;
  const repayment = ratioCents(balanceCents * rate * growth, 10000n * (growth - scale));
  const interest = ratioCents(balanceCents * rate, 10000n);
  return { repayment: Number(repayment) / 100, interest: Number(interest) / 100,
    principal: Number(repayment - interest) / 100 };
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
