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

// PCG 2021/4, Table 1 (paragraph 76): each risk assessment factor's bands, from score 1 to 5,
// as a percentage and whether the band includes it; anything below the fifth band scores 6.
// Factor 1 is the profit entitlement returned by the IPP, factor 2 the total effective tax
// rate and factor 3 the IPP's remuneration as a share of the commercial benchmark.
/** @type {ReadonlyArray<ReadonlyArray<readonly [number, boolean]>>} */
const PCG_BANDS = [
  [[90, false], [75, false], [60, false], [50, true], [25, false]],
  [[40, false], [35, false], [30, true], [25, false], [20, false]],
  [[200, false], [150, false], [100, false], [90, false], [70, false]],
];
// Table 2 (paragraph 78): the highest green and the highest amber aggregate, against 2 factors or all 3.
/** @type {Readonly<Record<2 | 3, readonly [number, number]>>} */
const PCG_ZONES = { 2: [7, 8], 3: [10, 12] };

/** The score for part over whole: the first band it reaches, compared exactly in cents.
 * @param {number} part @param {number} whole positive @param {number} factor 0, 1 or 2 */
const pcgScore = (part, whole, factor) => {
  const band = PCG_BANDS[factor].findIndex(([percent, inclusive]) =>
    (inclusive ? part * 100 >= percent * whole : part * 100 > percent * whole));
  return band === -1 ? 6 : band + 1;
};

/** PCG 2021/4, Allocation of professional firm profits: the ATO's risk zone for one IPP's
 * arrangement. The guideline scores only an arrangement that passes both gateways
 * (paragraphs 10 to 12). Returning the whole entitlement is low risk with no other factor
 * scored (paragraph 81). Factor 3 is optional (paragraphs 77 to 80). Each factor's
 * percentage is compared with its bands exactly; the percentages returned round to 0.01.
 * @param {{gateway1: boolean, gateway2: boolean, entitlement: string, returned: string, tax: string,
 *   factor3: boolean, remuneration: string, benchmark: string}} arrangement */
export function pcgRisk(arrangement) {
  const failed = [arrangement.gateway1, arrangement.gateway2].findIndex((passed) => passed !== true);
  if (failed !== -1) throw new Error(`The arrangement fails Gateway ${failed + 1}, so PCG 2021/4 gives it no risk score.`);
  const entitlement = cents(arrangement.entitlement);
  const returned = cents(arrangement.returned);
  if (entitlement === 0) throw new Error('Enter a profit entitlement above nil.');
  const tax = cents(arrangement.tax);
  if (returned > entitlement) throw new Error('The amount returned cannot exceed the profit entitlement.');
  if (tax > entitlement) throw new Error('The tax cannot exceed the firm income.');
  if (returned === entitlement) {
    return { returned: 100, factor1: 1, taxRate: null, factor2: null, benchmarkShare: null, factor3: null,
      total: null, zone: 'green' };
  }
  const factor1 = pcgScore(returned, entitlement, 0);
  const factor2 = pcgScore(tax, entitlement, 1);
  /** @type {number | null} */
  let benchmarkShare = null;
  /** @type {number | null} */
  let factor3 = null;
  if (arrangement.factor3) {
    const benchmark = cents(arrangement.benchmark);
    if (benchmark === 0) throw new Error('Enter a commercial benchmark above nil.');
    const remuneration = cents(arrangement.remuneration);
    benchmarkShare = ratioPercent(remuneration, benchmark);
    factor3 = pcgScore(remuneration, benchmark, 2);
  }
  const total = factor1 + factor2 + (factor3 ?? 0);
  const [green, amber] = PCG_ZONES[factor3 === null ? 2 : 3];
  return { returned: ratioPercent(returned, entitlement), factor1, taxRate: ratioPercent(tax, entitlement), factor2,
    benchmarkShare, factor3, total, zone: total <= green ? 'green' : total <= amber ? 'amber' : 'red' };
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
const DAY = 86400000;
/** @param {number} year */
const yearDays = (year) => (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365);
/** @param {string} date an ISO calendar date, as a whole number of days since 1970 */
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY;
/** @param {number} day @returns {string} */
const isoDay = (day) => new Date(day * DAY).toISOString().slice(0, 10);
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
    || isoDay(start) !== plan.start || start < GIC_FROM[0].from || plan.start > '2099-12-31') {
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
    gic: Number(totalPaid - debt) / 100, lastDate: isoDay(last), assumedDays };
}
