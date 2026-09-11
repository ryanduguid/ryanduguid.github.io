// Planning arithmetic. Rates, eligibility and classifications belong to the caller.
function number(value, { min = 0, max = 1e9, places = 2, integer = false } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!new RegExp(`^-?\\d+(?:\\.\\d{1,${places}})?$`).test(text)) {
    throw new Error(`Enter a number with no more than ${places} decimal places.`);
  }
  const result = Number(text);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) {
    throw new Error(`Enter ${integer ? 'a whole number' : 'an amount'} between ${min} and ${max}.`);
  }
  return result;
}

const cents = (value, min = 0) => Math.round(number(value, { min }) * 100);
// Non-negative ratios in cents round half up. BigInt keeps large products exact.
const ratioMoney = (numerator, denominator) => Number((2n * numerator + denominator) / (2n * denominator)) / 100;
// Only the amortising loan formula is approximate; allow for its floating-point error.
const loanMoney = value => Math.round(value * 100 + Math.abs(value * 100) * Number.EPSILON * 4) / 100;

export function gst(amount, inclusive = false) {
  const value = cents(amount);
  const tax = Math.round(value / (inclusive ? 11 : 10));
  return { net: (inclusive ? value - tax : value) / 100, gst: tax / 100,
    gross: (inclusive ? value : value + tax) / 100 };
}

export function businessUse(cost, percent) {
  const share = Math.round(number(percent, { max: 100 }) * 100);
  return { share: ratioMoney(BigInt(cents(cost)) * BigInt(share), 10000n) };
}

export function margin(sales, cost) {
  const revenue = number(sales);
  const expense = number(cost);
  const profit = (cents(sales) - cents(cost)) / 100;
  return { profit, margin: revenue ? profit * 100 / revenue : null,
    markup: expense ? profit * 100 / expense : null };
}

export function breakEven(fixed, price, variable) {
  const cost = cents(fixed);
  const selling = cents(price);
  const contribution = selling - cents(variable);
  if (contribution <= 0) throw new Error('Price must exceed variable cost per unit to reach break-even.');
  const units = Math.ceil(cost / contribution);
  if (!Number.isSafeInteger(units * selling)) throw new Error('Required sales exceed the supported range. Use smaller amounts.');
  return { contribution: contribution / 100, units, sales: units * selling / 100 };
}

export function hourlyRate(cost, profit, hours) {
  const time = Math.round(number(hours, { min: 0.01, max: 8784 }) * 100);
  return { rate: ratioMoney(BigInt(cents(cost) + cents(profit)) * 100n, BigInt(time)) };
}

export function variance(actual, budget, kind) {
  if (!['income', 'cost'].includes(kind)) throw new Error('Choose income or cost.');
  const base = number(budget, { min: -1e9 });
  const difference = (cents(actual, -1e9) - cents(budget, -1e9)) / 100;
  return { difference, percent: base ? difference * 100 / Math.abs(base) : null,
    effect: difference === 0 ? 'On budget' : (difference * (kind === 'income' ? 1 : -1) > 0 ? 'Favourable' : 'Unfavourable') };
}

export function loan(principal, annualRate, months) {
  const balanceCents = cents(principal);
  const balance = balanceCents / 100;
  const rateUnits = Math.round(number(annualRate, { max: 100, places: 4 }) * 10000);
  const rate = rateUnits / 12000000;
  const term = number(months, { min: 1, max: 600, integer: true });
  const firstInterest = ratioMoney(BigInt(balanceCents) * BigInt(rateUnits), 12000000n);
  if (!rate) {
    const payment = ratioMoney(BigInt(balanceCents), BigInt(term));
    return { payment, firstInterest: 0, firstPrincipal: payment, totalInterest: 0 };
  }
  if (term === 1) return { payment: ratioMoney(BigInt(balanceCents) * BigInt(12000000 + rateUnits), 12000000n),
    firstInterest, firstPrincipal: balance, totalInterest: firstInterest };
  // log1p/expm1 retain precision for very small positive rates.
  const payment = balance * rate / -Math.expm1(-term * Math.log1p(rate));
  return { payment: loanMoney(payment), firstInterest,
    firstPrincipal: loanMoney(payment - balance * rate), totalInterest: loanMoney(payment * term - balance) };
}

export function staffCost(wages, superAmount, other) {
  const annual = (cents(wages) + cents(superAmount) + cents(other)) / 100;
  return { annual, monthly: ratioMoney(BigInt(cents(wages) + cents(superAmount) + cents(other)), 12n) };
}

export function cashWeekDates(startDate) {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)
    || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== startDate
    || date.getUTCFullYear() < 1900) throw new Error('Enter a valid first day from 1900 onwards.');
  const dates = Array.from({ length: 13 }, (_, week) => ({
    start: new Date(date.getTime() + week * 7 * 86400000).toISOString().slice(0, 10),
    end: new Date(date.getTime() + (week * 7 + 6) * 86400000).toISOString().slice(0, 10),
  }));
  if (dates.at(-1).end.startsWith('+')) throw new Error('All 13 weeks must end before the year 10000.');
  return dates;
}

export function parseCashScenario(text) {
  if (typeof text !== 'string' || text.length > 65536) throw new Error('Choose a scenario file under 64 KB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Choose a valid scenario JSON file.'); }
  if (!data || data.version !== 1 || data.currency !== 'AUD') throw new Error('Choose a version 1 AUD cash scenario.');
  cashWeekDates(data.startDate);
  cashForecast(data.opening, data.weeks, data.buffer, { week: data.week, amount: data.amount, delay: data.delay });
  return { version: 1, currency: 'AUD', startDate: data.startDate, opening: data.opening, buffer: data.buffer,
    week: String(data.week), amount: data.amount, delay: String(data.delay),
    weeks: data.weeks.map(row => ({ receipts: row.receipts, payments: row.payments })) };
}

export function cashForecast(opening, weeks, buffer, scenario = { week: 1, amount: '0', delay: 0 }) {
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
