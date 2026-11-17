// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { number, cents, ratioCents } from './money.mjs';

// Division 7A of the Income Tax Assessment Act 1936 (compilation 193, 1 October 2026), read
// 17 November 2026: the minimum yearly repayment (s 109E(6)) and a complying loan's schedule.

/** Division 7A minimum yearly repayment of an amalgamated loan, in cents: s 109E(6), as the
 * ATO's five steps state it. The Act prescribes no rounding; the amount rounds half up.
 * @param {bigint} balance cents @param {bigint} rate hundredths of 1% @param {bigint} term years */
function minimumCents(balance, rate, term) {
  // balance x I / (1 - (1 / (1 + I)) ^ T), multiplied through by 10,000 ^ (T + 1).
  const growth = (10000n + rate) ** term;
  const scale = 10000n ** term;
  return ratioCents(balance * rate * growth, 10000n * (growth - scale));
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
  const repayment = minimumCents(balanceCents, rate, term);
  const interest = ratioCents(balanceCents * rate, 10000n);
  return { repayment: Number(repayment) / 100, interest: Number(interest) / 100,
    principal: Number(repayment - interest) / 100 };
}

// The benchmark interest rates the ATO publishes for income years ending 30 June, from
// 'Division 7A – benchmark interest rate' (last updated 1 July 2026, read 17 November 2026):
// https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate
// The Node tests bind each to this site's table, rates/div7a-benchmark-rate.
export const DIV7A_PUBLISHED_RATES = /** @type {const} */ ([
  ['2021-22', '4.52'], ['2022-23', '4.77'], ['2023-24', '8.27'], ['2024-25', '8.77'],
  ['2025-26', '8.37'], ['2026-27', '8.77'],
]);
/** @type {Map<string, bigint>} */
const PUBLISHED = new Map(DIV7A_PUBLISHED_RATES.map(([year, rate]) => [year, BigInt(Math.round(Number(rate) * 100))]));
const FIRST_YEAR = Number(DIV7A_PUBLISHED_RATES[0][0].slice(0, 4));
const LAST_YEAR = Number(DIV7A_PUBLISHED_RATES[DIV7A_PUBLISHED_RATES.length - 1][0].slice(0, 4));
/** The label of the income year starting on 1 July of `start`: 2026 gives '2026-27'.
 * @param {number} start */
const yearLabel = (start) => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
/** @param {bigint} value cents */
const dollars = (value) => Number(value) / 100;

/**
 * @typedef {{made: string, amount: string, term: string, assumedRate: string, repayments: string,
 *   marginalRate: string, franking: string, lodgment: boolean, refinanced: boolean, interposed: boolean}} Div7aLoan
 * @typedef {{year: string, rate: number, projected: boolean, remainingTerm: number, opening: number,
 *   minimum: number, repayment: number, interest: number, principal: number, closing: number,
 *   shortfall: number, funding: number | null}} Div7aYear
 */

/** The cases this page cannot work from its sources, as it refuses them. */
export const DIV7A_REFUSED = {
  interposed: 'This page does not work a loan made through an interposed entity (Subdivision E of Division 7A).',
  refinanced: 'This page does not work a loan that refinances another or whose term was extended under a mortgage (subsections 109N(3A) to (3D) and 109E(3A) and (3B)).',
  lodgment: 'This page does not work a repayment made after 30 June and before the lodgment day for the year the loan was made, which reduces the amalgamated loan and also counts in the next year.',
};

/** The income year the loan was made in, from the date it was made, refusing loans the page
 * cannot work: before 4 December 1997 (s 109D(5)), before the published rates or after them.
 * @param {string} made an ISO calendar date */
function yearMade(made) {
  const valid = typeof made === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(made)
    && new Date(`${made}T00:00:00Z`).toISOString().startsWith(made);
  if (!valid) throw new Error('Enter the date the loan was made.');
  if (made < '1997-12-04') {
    throw new Error('Division 7A reaches a loan made before 4 December 1997 only once its term or amount is varied (subsection 109D(5)); this page does not work one.');
  }
  if (made < `${FIRST_YEAR - 1}-07-01` || made > `${LAST_YEAR + 1}-06-30`) {
    throw new Error(`Enter a loan made from 1 July ${FIRST_YEAR - 1} to 30 June ${LAST_YEAR + 1}: the ATO’s published rates start with ${yearLabel(FIRST_YEAR)}.`);
  }
  const year = Number(made.slice(0, 4));
  return made.slice(5) >= '07-01' ? year : year - 1;
}

/** Each year's entered repayment in cents, or null where the entry is blank for the minimum.
 * @param {string} list amounts separated by semicolons @param {number} term */
function enteredRepayments(list, term) {
  if (typeof list !== 'string') throw new Error('Enter the repayments as amounts separated by semicolons.');
  const entries = list.trim() === '' ? [] : list.split(';').map((entry) => entry.trim());
  if (entries.length > term) throw new Error(`Enter no more than ${term} repayments, one for each year of the term.`);
  return entries.map((entry) => (entry === '' ? null : BigInt(cents(entry))));
}

/** The dividend that leaves the repayment in hand after tax at the marginal rate, rounded up to
 * the cent: unfranked, D(1 - m) = R; franked at the corporate rate c, D(1 - c) is grossed up by
 * D x c / (1 - c) and that franking credit is offset, so D(1 - m) / (1 - c) = R. Rates are in
 * hundredths of 1%. @param {bigint} repayment @param {bigint} marginal @param {bigint} corporate */
const fundingDividend = (repayment, marginal, corporate) =>
  (repayment * (10000n - corporate) + 10000n - marginal - 1n) / (10000n - marginal);

// The corporate tax rate a dividend is franked at, in hundredths of 1%.
const FRANKING = new Map([['unfranked', 0n], ['30', 3000n], ['25', 2500n]]);

/** @param {Div7aLoan} loan */
function checkedLoan(loan) {
  for (const flag of ['interposed', 'refinanced', 'lodgment']) {
    const answer = loan[/** @type {'interposed' | 'refinanced' | 'lodgment'} */ (flag)];
    if (typeof answer !== 'boolean') throw new Error('Answer each question about the loan.');
    if (answer) throw new Error(DIV7A_REFUSED[/** @type {'interposed' | 'refinanced' | 'lodgment'} */ (flag)]);
  }
  const made = yearMade(loan.made);
  const amount = BigInt(cents(loan.amount, 0.01));
  if (loan.term !== '7' && loan.term !== '25') throw new Error('Choose a 7-year or 25-year term.');
  const term = Number(loan.term);
  const assumed = BigInt(Math.round(number(loan.assumedRate, { min: 0.01, max: 100 }) * 100));
  const marginal = loan.marginalRate === '' ? null : BigInt(Math.round(number(loan.marginalRate, { max: 99.99 }) * 100));
  const corporate = FRANKING.get(loan.franking);
  if (corporate === undefined) throw new Error('Choose unfranked or franked at 30% or 25%.');
  return { made, amount, term, assumed, marginal, corporate, entered: enteredRepayments(loan.repayments, term) };
}

/** Days in the income year starting on 1 July of `start`: 366 when it holds 29 February.
 * @param {number} start */
const yearDays = (start) => BigInt(new Date(Date.UTC(start + 1, 2, 0)).getUTCDate() === 29 ? 366 : 365);

/** A year's interest at the benchmark rate on the balance from time to time (s 109E(7)), as the
 * ATO's 'Loans by private companies' works it: daily, a repayment reducing the balance from the
 * day it is made, each period's interest rounded half up to the cent. A repayment on 30 June
 * leaves that one day on the reduced balance, or on nil once the repayment passes the balance.
 * @param {bigint} opening @param {bigint} repayment @param {bigint} rate @param {bigint} days */
function yearInterest(opening, repayment, rate, days) {
  if (repayment === 0n) return ratioCents(opening * rate, 10000n);
  const after = opening > repayment ? opening - repayment : 0n;
  return ratioCents(opening * rate * (days - 1n), 10000n * days) + ratioCents(after * rate, 10000n * days);
}

/** The schedule of a complying Division 7A loan, from the first income year after the year it
 * was made. Each year's minimum yearly repayment is s 109E(6) on the amount not repaid at the
 * end of the previous year, at that year's benchmark rate, over the remaining term: the loan's
 * term, the 7 or 25 years s 109N(3) allows, less the years since the year it was made. Each repayment is made
 * on 30 June; a blank one is the minimum, or the amount that repays the loan if that is less.
 * A repayment meets the year's interest first and only the rest repays the loan. One short of
 * the minimum, with the loan not repaid, is the shortfall s 109E(1) and (2) take to be a
 * dividend, subject to s 109Y, at the end of that year; the schedule stops there. Years after
 * the ATO's published rates use the assumed rate and are marked projected.
 * @param {Div7aLoan} loan */
export function div7aSchedule(loan) {
  const { made, amount, term, assumed, marginal, corporate, entered } = checkedLoan(loan);
  /** @type {Div7aYear[]} */
  const years = [];
  let [opening, repaid, charged] = [amount, 0n, 0n];
  for (let k = 1; k <= term; k += 1) {
    const label = yearLabel(made + k);
    const rate = PUBLISHED.get(label) ?? assumed;
    const remainingTerm = term - k + 1;
    const minimum = minimumCents(opening, rate, BigInt(remainingTerm));
    const days = yearDays(made + k);
    // Repaying in full on 30 June: interest to 29 June, as the last day carries no balance.
    const payoff = opening + yearInterest(opening, opening, rate, days);
    const repayment = entered[k - 1] ?? (minimum < payoff ? minimum : payoff);
    const interest = yearInterest(opening, repayment, rate, days);
    if (repayment > opening + interest) {
      throw new Error(`The ${label} repayment is more than $${dollars(payoff).toLocaleString('en-AU', { minimumFractionDigits: 2 })}, which repays the loan on 30 June.`);
    }
    const principal = repayment > interest ? repayment - interest : 0n;
    const shortfall = principal < opening && repayment < minimum ? minimum - repayment : 0n;
    years.push({ year: label, rate: Number(rate) / 100, projected: !PUBLISHED.has(label), remainingTerm,
      opening: dollars(opening), minimum: dollars(minimum), repayment: dollars(repayment), interest: dollars(interest),
      principal: dollars(principal), closing: dollars(opening - principal), shortfall: dollars(shortfall),
      funding: marginal === null ? null : dollars(fundingDividend(repayment, marginal, corporate)) });
    [opening, repaid, charged] = [opening - principal, repaid + repayment, charged + interest];
    if (shortfall > 0n || opening === 0n) break;
  }
  if (opening === 0n && entered.length > years.length) {
    throw new Error(`The loan is repaid in ${years[years.length - 1].year}; leave out the repayments after it.`);
  }
  const last = years[years.length - 1];
  return { years, firstMinimum: years[0].minimum, totalRepaid: dollars(repaid), totalInterest: dollars(charged),
    lastYear: last.year, closing: last.closing, shortfall: last.shortfall,
    projectedFrom: years.find((row) => row.projected)?.year ?? null };
}

/** A calendar date as the page writes it: '1 October 2022'. @param {string} iso */
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** 30 June at the end of an income year: '2026-27' gives 2027. @param {string} label */
const yearEnd = (label) => Number(label.slice(0, 4)) + 1;

/** The page's result for one loan: its inputs sentence, summary rows, note and one table row
 * for each year. @param {Div7aLoan} loan @param {(value: number) => string} aud */
export function div7aScheduleResult(loan, aud) {
  const r = div7aSchedule(loan);
  const first = r.years[0].year;
  const made = Number(first.slice(0, 4)) - 1;
  const entries = loan.repayments.trim() === '' ? [] : loan.repayments.split(';').map((entry) => entry.trim());
  const repayments = entries.length ? entries.map((entry) => (entry === '' ? 'the minimum' : aud(Number(entry.replace(/[$,]/g, ''))))).join('; ')
    : 'the minimum each year';
  const funding = loan.marginalRate === '' ? 'no funding dividend worked'
    : `funding dividends ${loan.franking === 'unfranked' ? 'unfranked' : `franked at ${loan.franking}%`} at a ${loan.marginalRate}% marginal rate`;
  const shortfall = r.shortfall > 0;
  const notes = [r.projectedFrom && `Figures from ${r.projectedFrom} on are a projection on your assumed benchmark rate of ${loan.assumedRate}%, as the ATO has published rates only to 2026-27`,
    shortfall && `The ${r.lastYear} repayment falls short of the minimum, so subsection 109E(1) takes the company to pay a dividend of the shortfall at 30 June ${yearEnd(r.lastYear)}, limited by section 109Y to its distributable surplus. The schedule stops there: the sources applied do not say how later years are worked`]
    .filter(Boolean);
  return { inputs: `loan made ${longDate(loan.made)}, in ${yearLabel(made)}, ${aud(dollars(BigInt(cents(loan.amount, 0.01))))} not repaid at 30 June ${made + 1}, `
    + `${loan.term === '25' ? '25-year term secured by a registered mortgage' : '7-year unsecured term'}, benchmark rate after 2026-27 assumed at ${loan.assumedRate}%, `
    + `repayments: ${repayments}, ${funding}`,
  rows: [[`Minimum yearly repayment for ${first}`, aud(r.firstMinimum)],
    [`Repaid from ${first} to ${r.lastYear}`, aud(r.totalRepaid)], ['Interest at the benchmark rates', aud(r.totalInterest)],
    [`Not repaid at 30 June ${yearEnd(r.lastYear)}`, aud(r.closing)],
    [shortfall ? `Shortfall taken to be a dividend for ${r.lastYear}` : 'Shortfall taken to be a dividend', aud(r.shortfall)]],
  principal: shortfall ? 4 : 0, note: notes.length ? notes.join('. ') : undefined,
  table: r.years.map((row) => [row.year, `${row.rate.toFixed(2)}%${row.projected ? ' assumed' : ''}`, aud(row.opening), aud(row.minimum),
    aud(row.repayment), aud(row.interest), aud(row.principal), aud(row.closing), aud(row.shortfall),
    row.funding === null ? 'Not worked' : aud(row.funding)]) };
}
