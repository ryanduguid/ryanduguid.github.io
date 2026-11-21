// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { number, cents, ratioCents } from './money.mjs';

// An amortisation schedule for a loan, a hire purchase agreement or a chattel mortgage: level
// payments weekly to yearly, in arrears or in advance, with an optional balloon, solving for
// whichever of the payment, the amount financed, the number of payments or the rate is missing.
//
// Rounding. Money is whole cents. Each period's interest is the period rate times the balance
// it accrues on, rounded half up to the cent. A payment worked out from the other terms is
// rounded half up to the cent once; every payment but the last is that amount, and the last is
// what the balance then needs, so the schedule closes on exactly the balloon, or nil. The period
// rate is the annual nominal rate divided by the payments a year (52, 26, 12, 4 or 1).

/** Payments a year, the step between payment dates in days or months, and the most payments
 * a schedule takes: 50 years of them. */
export const FREQUENCIES = Object.freeze({
  weekly: { perYear: 52, days: 7, months: 0, most: 2600, noun: 'weekly' },
  fortnightly: { perYear: 26, days: 14, months: 0, most: 1300, noun: 'fortnightly' },
  monthly: { perYear: 12, days: 0, months: 1, most: 600, noun: 'monthly' },
  quarterly: { perYear: 4, days: 0, months: 3, most: 200, noun: 'quarterly' },
  annual: { perYear: 1, days: 0, months: 12, most: 50, noun: 'annual' },
});

/** A solved rate is a whole number of 2^-48ths of 100% a year: bisection halves that range 48 times. */
const RATE_BITS = 48n;
const RATE_ONE = 1n << RATE_BITS;
/** An entered rate has at most 4 decimal places of a per cent: whole millionths a year. */
const ENTERED_ONE = 1000000n;
/** The largest amount financed or payment, $1,000,000,000.00, in cents. */
const MOST_CENTS = 100000000000n;

/**
 * @typedef {'payment' | 'amount' | 'term' | 'rate'} FinanceSolve
 * @typedef {keyof typeof FREQUENCIES} FinanceFrequency
 * @typedef {{solve: FinanceSolve, amount: string, rate: string, payments: string, payment: string,
 *   balloon: string, balloonKind: 'amount' | 'percent', frequency: FinanceFrequency,
 *   timing: 'arrears' | 'advance', start: string}} FinanceTerms
 * @typedef {{period: number, date: string, opening: number, payment: number, interest: number,
 *   principal: number, closing: number}} FinanceRow
 * @typedef {{amount: number, payment: number, finalPayment: number, payments: number, rate: number,
 *   balloon: number, balloonDate: string, totalPaid: number, totalInterest: number,
 *   rows: FinanceRow[], balloonRow: FinanceRow | null}} FinanceSchedule
 * @typedef {{num: bigint, den: bigint}} PeriodRate a period's rate as an exact fraction
 */

const DAY = 86400000;
/** @param {string} text @returns {number} whole days since 1970 */
function startDay(text) {
  const day = Date.parse(`${text}T00:00:00Z`) / DAY;
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isInteger(day)
    || isoDay(day) !== text || text < '1900-01-01' || text > '2099-12-31') {
    throw new Error('Enter a start date from 1 January 1900 to 31 December 2099.');
  }
  return day;
}
/** @param {number} day whole days since 1970 */
const isoDay = (day) => new Date(day * DAY).toISOString().slice(0, 10);

/** The day `count` payment periods after `start`: every 7 or 14 days, or the same day of the
 * month 1, 3 or 12 months on, the month's last day where it has no such day.
 * @param {number} start @param {number} count @param {FinanceFrequency} frequency */
export function periodsAfter(start, count, frequency) {
  const { days, months } = FREQUENCIES[frequency];
  if (days) return start + count * days;
  const first = new Date(start * DAY);
  const [year, month] = [first.getUTCFullYear(), first.getUTCMonth() + count * months];
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(first.getUTCDate(), last)) / DAY;
}

/** The level payment, in cents, that takes `amount` to `balloon` over `count` periods.
 * @param {bigint} amount @param {bigint} balloon @param {number} count @param {PeriodRate} rate @param {boolean} advance */
function levelPayment(amount, balloon, count, rate, advance) {
  if (rate.num === 0n) return ratioCents(amount - balloon, BigInt(count));
  // payment = (amount - balloon v^n) r / (1 - v^n), with v = 1 / (1 + r), multiplied through by
  // den^n; a payment in advance is discounted one period less, so it is divided by (1 + r).
  const growth = (rate.den + rate.num) ** BigInt(count);
  const scale = rate.den ** BigInt(count);
  return ratioCents((amount * growth - balloon * scale) * rate.num, (advance ? rate.den + rate.num : rate.den) * (growth - scale));
}

/** Whether the payments and the balloon, discounted at `rate`, are worth more than (1), as much
 * as (0) or less than (-1) the amount financed. Discounting at a higher rate is worth less.
 * @param {bigint} amount @param {bigint} payment @param {bigint} balloon @param {number} count
 * @param {PeriodRate} rate @param {boolean} advance */
function compareWorth(amount, payment, balloon, count, rate, advance) {
  if (rate.num === 0n) return Math.sign(Number(payment * BigInt(count) + balloon - amount));
  const growth = (rate.den + rate.num) ** BigInt(count);
  const scale = rate.den ** BigInt(count);
  // Worth x num x growth: payment x (den or den + num) x (growth - scale) + balloon x scale x num.
  const worth = payment * (advance ? rate.den + rate.num : rate.den) * (growth - scale) + balloon * scale * rate.num;
  const target = amount * rate.num * growth;
  return worth > target ? 1 : worth < target ? -1 : 0;
}

/** The annual rate, in 2^-48ths of 100%, at which the payments and the balloon are worth the
 * amount financed: bisection of 0% to 100% a year, keeping the root between the bounds, so the
 * rate returned is the upper bound, within 2^-48 of 100% a year (about 0.0000000000004%) above it.
 * @param {bigint} amount @param {bigint} payment @param {bigint} balloon @param {number} count
 * @param {bigint} perYear @param {boolean} advance */
function solveRate(amount, payment, balloon, count, perYear, advance) {
  const at = (/** @type {bigint} */ annual) => compareWorth(amount, payment, balloon, count, { num: annual, den: perYear * RATE_ONE }, advance);
  const atNil = at(0n);
  if (atNil < 0) throw new Error('The payments and balloon add up to less than the amount financed, so no rate of nil or more fits.');
  if (atNil === 0) return 0n;
  if (at(RATE_ONE) > 0) throw new Error('These payments need a rate above 100% a year, which this page does not work.');
  let [low, high] = [0n, RATE_ONE];
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if (at(middle) > 0) low = middle;
    else high = middle;
  }
  return high;
}

/** The schedule's rows in cents, one for each payment date: the interest accrued since the last
 * payment (none at the first payment in advance), the payment and the balance it leaves. With
 * `count` null the payments run until one takes the balance to the balloon, which finds the
 * number of payments. The balloon has its own row at the end of the last period: in arrears on
 * the last payment's date with no interest; in advance a period later, so the last payment leaves
 * the balloon's value then, rounded to the cent, and the balloon row's interest is the rest of it.
 * @param {bigint} amount @param {bigint} balloon @param {bigint} payment @param {number | null} count
 * @param {PeriodRate} rate @param {boolean} advance @param {number} most */
function scheduleCents(amount, balloon, payment, count, rate, advance, most) {
  const left = advance ? ratioCents(balloon * rate.den, rate.den + rate.num) : balloon;
  /** @type {{opening: bigint, payment: bigint, interest: bigint, closing: bigint}[]} */
  const rows = [];
  let balance = amount;
  for (let k = 1; ; k += 1) {
    const interest = advance && k === 1 ? 0n : ratioCents(balance * rate.num, rate.den);
    const last = count === null ? balance + interest - payment <= left : k === count;
    const paid = last ? balance + interest - left : payment;
    const closing = balance + interest - paid;
    if (paid < 0n || closing < 0n) {
      throw new Error('Rounding each period’s interest to the cent at this rate and term stops the schedule closing on the balloon. Use fewer payments, a lower rate or a larger amount.');
    }
    rows.push({ opening: balance, payment: paid, interest, closing });
    if (last) break;
    if (count === null && closing >= balance) throw new Error('The payment does not cover a period’s interest, so the balance never falls to the balloon.');
    if (count === null && k === most) throw new Error(`The payment does not reach the balloon within ${most} payments, 50 years.`);
    balance = closing;
  }
  return { rows, balloonRow: balloon ? { opening: left, payment: balloon, interest: balloon - left, closing: 0n } : null };
}

/** The amount financed, in cents, that `count` payments and the balloon are worth at `rate`: the
 * balloon in cents, or as `share` hundredths of 1% of the amount itself when `share` is not null.
 * @param {bigint} payment @param {number} count @param {PeriodRate} rate @param {boolean} advance
 * @param {bigint | null} share @param {bigint} balloon */
function amountFinanced(payment, count, rate, advance, share, balloon) {
  const k = advance ? rate.den + rate.num : rate.den;
  const growth = (rate.den + rate.num) ** BigInt(count);
  const scale = rate.den ** BigInt(count);
  let amount;
  if (share === null) {
    amount = rate.num === 0n ? payment * BigInt(count) + balloon
      : ratioCents(payment * k * (growth - scale) + balloon * scale * rate.num, rate.num * growth);
  } else {
    // amount = payments' worth / (1 - share x v^n), as the balloon is a share of the amount.
    if (rate.num === 0n && share === 10000n) throw new Error('At nil interest a 100% balloon leaves the payments nothing to repay, so no amount fits.');
    amount = rate.num === 0n ? ratioCents(payment * BigInt(count) * 10000n, 10000n - share)
      : ratioCents(payment * k * (growth - scale) * 10000n, rate.num * (10000n * growth - share * scale));
  }
  if (amount > MOST_CENTS) throw new Error('The amount financed this gives is over $1,000,000,000. Use a smaller payment or fewer payments.');
  if (amount === 0n) throw new Error('The amount financed this gives rounds to nil. Use a larger payment.');
  return amount;
}

/** A finance schedule from 3 of the payment, the amount financed, the number of payments and the
 * rate, with the balloon, solving for the fourth. The balloon is an amount, or a percentage of the
 * amount financed rounded half up to the cent. Payments in arrears fall at the end of each period,
 * the first one period after the start date; in advance at the start, the first on the start date.
 * Either way the balloon falls due at the end of the last period.
 * @param {FinanceTerms} terms @returns {FinanceSchedule} */
export function financeSchedule(terms) {
  const { solve, frequency, timing, balloonKind } = terms;
  if (!['payment', 'amount', 'term', 'rate'].includes(solve)) throw new Error('Choose what to work out.');
  if (!Object.hasOwn(FREQUENCIES, frequency)) throw new Error('Choose how often payments fall.');
  if (timing !== 'arrears' && timing !== 'advance') throw new Error('Choose payments in arrears or in advance.');
  if (balloonKind !== 'amount' && balloonKind !== 'percent') throw new Error('Choose a balloon in dollars or as a percentage.');
  const { perYear, most } = FREQUENCIES[frequency];
  const advance = timing === 'advance';
  const start = startDay(terms.start);
  const given = (/** @type {FinanceSolve} */ field) => solve !== field;
  let amount = given('amount') ? BigInt(cents(terms.amount, 0.01)) : 0n;
  const rateUnits = given('rate') ? BigInt(Math.round(number(terms.rate, { max: 100, places: 4 }) * 10000)) : 0n;
  let count = given('term') ? number(terms.payments, { min: 1, max: most, integer: true }) : null;
  let payment = given('payment') ? BigInt(cents(terms.payment, 0.01)) : 0n;
  // A percentage balloon is whole hundredths of 1% of the amount financed.
  const share = balloonKind === 'percent' ? BigInt(Math.round(number(terms.balloon, { max: 100 }) * 100)) : null;
  const balloonOf = (/** @type {bigint} */ financed) => (share === null ? BigInt(cents(terms.balloon)) : ratioCents(financed * share, 10000n));
  /** @type {PeriodRate} */
  let rate = { num: rateUnits, den: BigInt(perYear) * ENTERED_ONE };
  let annual = Number(rateUnits) / 10000;

  if (solve === 'amount') amount = amountFinanced(payment, /** @type {number} */ (count), rate, advance, share, share === null ? balloonOf(0n) : 0n);
  const balloon = balloonOf(amount);
  if (balloon > amount) throw new Error('The balloon cannot be more than the amount financed.');
  if (solve === 'rate') {
    const units = solveRate(amount, payment, balloon, /** @type {number} */ (count), BigInt(perYear), advance);
    rate = { num: units, den: BigInt(perYear) * RATE_ONE };
    // The annual rate in per cent to 4 decimal places, half up.
    annual = Number(ratioCents(units * 1000000n, RATE_ONE)) / 10000;
  }
  if (solve === 'payment') payment = levelPayment(amount, balloon, /** @type {number} */ (count), rate, advance);
  const { rows, balloonRow } = scheduleCents(amount, balloon, payment, count, rate, advance, most);
  count = rows.length;
  const totalPaid = rows.reduce((sum, row) => sum + row.payment, 0n) + balloon;
  if (totalPaid > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The payments total more than this page can show to the cent. Use smaller amounts.');
  const dollars = (/** @type {bigint} */ value) => Number(value) / 100;
  /** @param {{opening: bigint, payment: bigint, interest: bigint, closing: bigint}} row @param {number} period @param {number} time */
  const shown = (row, period, time) => ({ period, date: isoDay(periodsAfter(start, time, frequency)), opening: dollars(row.opening),
    payment: dollars(row.payment), interest: dollars(row.interest), principal: dollars(row.payment - row.interest), closing: dollars(row.closing) });
  return { amount: dollars(amount), payment: dollars(payment), finalPayment: dollars(rows[count - 1].payment), payments: count,
    rate: annual, balloon: dollars(balloon), balloonDate: isoDay(periodsAfter(start, count, frequency)),
    totalPaid: dollars(totalPaid), totalInterest: dollars(totalPaid - amount),
    rows: rows.map((row, index) => shown(row, index + 1, advance ? index : index + 1)),
    balloonRow: balloonRow && shown(balloonRow, count + 1, count) };
}

/** The calendar year in which the income year holding `day` starts on 1 July. @param {number} day */
const yearStarting = (day) => {
  const date = new Date(day * DAY);
  return date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
};
/** An income year's label: 2026 gives '2026-27'. @param {number} first */
const yearLabel = (first) => `${first}-${String((first + 1) % 100).padStart(2, '0')}`;

/** Each income year's interest, 1 July to 30 June. Each row's interest accrues over the payment
 * period that ends on its date; a period that runs across 30 June shares its interest by days, the days before 1 July rounded half up to the cent and the rest in the next year.
 * @param {FinanceTerms} terms @param {FinanceSchedule} [schedule] the terms' schedule, when already worked
 * @returns {Record<string, number>} interest in AUD by income year label, such as '2026-27', in date order */
export function interestByIncomeYear(terms, schedule = financeSchedule(terms)) {
  const start = startDay(terms.start);
  /** @type {Map<string, bigint>} */
  const years = new Map();
  const add = (/** @type {number} */ day, /** @type {bigint} */ value) => {
    const year = yearLabel(yearStarting(day));
    years.set(year, (years.get(year) ?? 0n) + value);
  };
  for (const row of [...schedule.rows, ...(schedule.balloonRow ? [schedule.balloonRow] : [])]) {
    const to = startDay(row.date);
    // The period before the payment: one payment interval back, from the start date's day.
    const from = periodsAfter(start, (terms.timing === 'advance' ? row.period - 1 : row.period) - 1, terms.frequency);
    const interest = BigInt(Math.round(row.interest * 100));
    if (interest === 0n) continue;
    // The last 1 July before the period ends; a period is shorter than a year and a day.
    const july = Date.UTC(yearStarting(to - 1), 6, 1) / DAY;
    const before = july > from && july < to ? ratioCents(interest * BigInt(july - from), BigInt(to - from)) : interest;
    add(from, before);
    if (before !== interest) add(july, interest - before);
  }
  return Object.fromEntries([...years].map(([year, interest]) => [year, Number(interest) / 100]));
}

const SOLVED = { payment: 'the payment', amount: 'the amount financed', term: 'the number of payments', rate: 'the rate' };
/** The agreement types the hire purchase page takes, and the account its payments reduce. */
const AGREEMENTS = { 'hire-purchase': ['hire purchase', 'Hire purchase liability'], 'chattel-mortgage': ['chattel mortgage', 'Chattel mortgage loan'] };
/** A date as the tables write it: '1 Aug 2026'. @param {string} iso */
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** A date as a sentence writes it: '1 August 2026'. @param {string} iso */
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The page's result for one schedule: its inputs sentence, summary rows with the solved figure
 * emphasised, a note, the tables and a CSV. On the hire purchase page `agreement` names the
 * agreement type, which adds interest by income year and a journal for each payment.
 * @param {FinanceTerms} terms @param {(value: number) => string} aud
 * @param {'hire-purchase' | 'chattel-mortgage' | null} [agreement] */
export function financeResult(terms, aud, agreement = null) {
  if (agreement !== null && !Object.hasOwn(AGREEMENTS, agreement)) throw new Error('Choose hire purchase or a chattel mortgage.');
  const r = financeSchedule(terms);
  const { noun } = FREQUENCIES[terms.frequency];
  const solved = terms.solve;
  const rate = solved === 'rate' ? r.rate.toFixed(4) : String(r.rate);
  const balloon = terms.balloonKind === 'percent' ? `balloon ${terms.balloon.trim()}% of the amount financed`
    : r.balloon ? `balloon ${aud(r.balloon)}` : 'no balloon';
  const inputs = [agreement && AGREEMENTS[agreement][0], solved !== 'amount' && `amount financed ${aud(r.amount)}`,
    solved !== 'rate' && `${rate}% annual nominal rate`,
    `${solved === 'term' ? '' : `${r.payments} `}${noun} payment${solved !== 'term' && r.payments === 1 ? '' : 's'}`
      + `${solved === 'payment' ? '' : ` of ${aud(r.payment)}`} in ${terms.timing}`,
    balloon, `starting ${longDate(terms.start)}`].filter(Boolean).join(', ');
  const last = r.rows[r.rows.length - 1];
  const notes = [solved === 'rate' && `The rate is the annual nominal rate at which the payments and balloon, discounted, equal the amount financed, `
    + 'found by bisection to within 0.0000000000004% a year and shown to 4 decimal places',
  last.payment !== r.payment && `The last payment is ${aud(last.payment)}, not ${aud(r.payment)}: it is what the balance needs after each period’s interest is rounded to the cent`]
    .filter(Boolean);
  // The balloon's own row, last, labelled in place of a payment number.
  const all = [...r.rows.map((row) => ({ ...row, label: String(row.period) })), ...(r.balloonRow ? [{ ...r.balloonRow, label: 'Balloon' }] : [])];
  /** @type {Record<string, string[][]>} */
  const tables = { schedule: all.map((row) => [row.label, shortDate(row.date), aud(row.opening), aud(row.payment),
    aud(row.interest), aud(row.principal), aud(row.closing)]) };
  const money = (/** @type {number} */ value) => value.toFixed(2);
  const csv = ['Currency,AUD', 'Planning estimate; interest rounded half up to the cent each period; the last payment takes the rounding',
    ...(agreement ? [`Agreement,${AGREEMENTS[agreement][0]}`] : []),
    `Amount financed,${money(r.amount)}`, `Annual nominal rate (%),${rate}`, `Payments,${r.payments} ${noun} in ${terms.timing}`,
    `Regular payment,${money(r.payment)}`, `Balloon,${money(r.balloon)}`, `Balloon due,${r.balloonDate}`,
    `Total paid,${money(r.totalPaid)}`, `Total interest,${money(r.totalInterest)}`, '',
    'Period,Date,Opening,Payment,Interest,Principal,Closing',
    ...all.map((row) => [row.label, row.date, ...[row.opening, row.payment, row.interest, row.principal, row.closing].map(money)].join(','))];
  if (agreement) {
    const years = Object.entries(interestByIncomeYear(terms, r));
    tables.years = years.map(([year, interest]) => [year, aud(interest)]);
    const account = AGREEMENTS[agreement][1];
    tables.journal = [...all.map((row) => [shortDate(row.date), row.label, aud(row.principal), aud(row.interest), aud(row.payment)]),
      ['Total', '', aud(r.amount), aud(r.totalInterest), aud(r.totalPaid)]];
    csv.push('', 'Income year,Interest', ...years.map(([year, interest]) => `${year},${money(interest)}`), '',
      `Date,Payment,Debit ${account},Debit interest expense,Credit bank`,
      ...all.map((row) => [row.date, row.label, money(row.principal), money(row.interest), money(row.payment)].join(',')));
  }
  const label = `${noun[0].toUpperCase()}${noun.slice(1)} payment`;
  return { inputs: `${inputs}; working out ${SOLVED[solved]}`,
    rows: [[label, aud(r.payment)], [`Last payment, ${longDate(last.date)}`, aud(last.payment)], ['Number of payments', String(r.payments)],
      ['Amount financed', aud(r.amount)], ['Annual nominal rate', `${rate}%`], [`Balloon, due ${longDate(r.balloonDate)}`, aud(r.balloon)],
      ['Total paid, with the balloon', aud(r.totalPaid)], ['Total interest', aud(r.totalInterest)]],
    principal: { payment: 0, term: 2, amount: 3, rate: 4 }[solved], note: notes.length ? notes.join('. ') : undefined,
    tables, csv: csv.join('\r\n') };
}
