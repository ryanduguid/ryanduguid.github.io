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

/** @param {string} actual @param {string} budget @param {'income' | 'cost'} kind */
export function variance(actual, budget, kind) {
  if (!['income', 'cost'].includes(kind)) throw new Error('Choose income or cost.');
  const base = cents(budget, -1e9);
  const difference = cents(actual, -1e9) - base;
  return { difference: difference / 100, percent: base ? ratioPercent(difference, Math.abs(base)) : null,
    effect: difference === 0 ? 'On budget' : (difference * (kind === 'income' ? 1 : -1) > 0 ? 'Favourable' : 'Unfavourable') };
}

/** @param {string} principal @param {string} annualRate @param {string} months */
export function loan(principal, annualRate, months) {
  const balanceCents = BigInt(cents(principal));
  const rateUnits = BigInt(Math.round(number(annualRate, { max: 100, places: 4 }) * 10000));
  const term = BigInt(number(months, { min: 1, max: 600, integer: true }));
  const rateScale = 12000000n;
  const firstInterest = ratioMoney(balanceCents * rateUnits, rateScale);
  if (rateUnits === 0n) {
    const payment = ratioMoney(balanceCents, term);
    return { payment, firstInterest: 0, firstPrincipal: payment, totalInterest: 0 };
  }
  // Multiply through by rateScale ** term to keep the amortisation fractions exact.
  const growth = (rateScale + rateUnits) ** term;
  const scale = rateScale ** term;
  const denominator = rateScale * (growth - scale);
  const paymentNumerator = balanceCents * rateUnits * growth;
  return { payment: ratioMoney(paymentNumerator, denominator), firstInterest,
    firstPrincipal: ratioMoney(balanceCents * rateUnits * scale, denominator),
    totalInterest: ratioMoney(paymentNumerator * term - balanceCents * denominator, denominator) };
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
    // 25%, 50%, 75% or 100% of estimated tax, less earlier instalments net of credits claimed.
    const due = Number(ratioCents(BigInt(cents(inputs.estimatedTax)) * BigInt(instalment), 4n));
    if (instalment === 1 && cents(inputs.earlier)) throw new Error('The first instalment of the year has no earlier instalments.');
    const amount = due - earlierLessCredits();
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
