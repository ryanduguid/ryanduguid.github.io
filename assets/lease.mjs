// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { number, cents, ratioCents } from './money.mjs';
import { FREQUENCIES, financeSchedule, interestByIncomeYear, periodsAfter } from './finance-schedule.mjs';
import { parseLife, schedule as declineInValue } from './depreciation-rates.mjs';

// A lessee's lease under AASB 16 Leases (compiled standard F2024C00049, compilation 8 of
// 31 December 2023, read 19 November 2026), and the same asset leased, bought on hire purchase or
// bought outright, compared by income year after GST and income tax.
//
// The lease liability is the lease payments not paid at commencement, discounted at the rate the
// lessee enters (paragraphs 26 and 27): the payments and any residual value guarantee or purchase
// option price, discounted one period at a time as the finance schedule does, rounded half up to
// the cent. The right-of-use asset's cost adds the payments made at or before commencement, less
// incentives received, the initial direct costs and the restoration estimate (paragraph 24). Each
// period's interest is the period rate on the liability, rounded half up to the cent (paragraph
// 37); the payments stay as the lease states them, so the last period's interest takes the cents
// that rounding leaves and the liability closes on nil. The asset is depreciated straight line by
// days, over the lease term, or the useful life where ownership transfers or a purchase option is
// reasonably certain (paragraph 32), each income year rounded half up and the last taking the rest.

/**
 * @typedef {import('./finance-schedule.mjs').FinanceFrequency} FinanceFrequency
 * @typedef {{payment: string, payments: string, frequency: FinanceFrequency, timing: 'arrears' | 'advance',
 *   rate: string, start: string, residual: string, prepaid: string, incentives: string, direct: string,
 *   restoration: string, ownership: 'yes' | 'no', life: string}} LeaseTerms
 * @typedef {{period: number, date: string, opening: number, payment: number, interest: number,
 *   principal: number, closing: number}} LeaseRow
 * @typedef {{year: string, interest: number, paid: number, liability: number, depreciation: number,
 *   asset: number}} LeaseYear
 * @typedef {{liability: number, cost: number, paidAtStart: number, restoration: number, payment: number,
 *   payments: number, rate: number, end: string, depreciationEnd: string, totalInterest: number,
 *   shortTerm: boolean, rows: LeaseRow[], years: LeaseYear[]}} Lease
 */

const DAY = 86400000;
/** @param {string} iso */
const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;
/** @param {number} day */
const isoDay = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** The calendar year in which the income year holding `day` starts. @param {number} day */
const yearStarting = (day) => {
  const date = new Date(day * DAY);
  return date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
};
/** '2026-27' for the income year starting 1 July 2026. @param {number} first */
const yearLabel = (first) => `${first}-${String((first + 1) % 100).padStart(2, '0')}`;
/** @param {bigint} value */
const dollars = (value) => Number(value) / 100;

/** The finance schedule's terms for the lease's payments, worked for their present value. @param {LeaseTerms} terms */
const presentValueTerms = (terms) => ({ solve: /** @type {const} */ ('amount'), amount: '1', rate: terms.rate, payments: terms.payments,
  payment: terms.payment, balloon: terms.residual, balloonKind: /** @type {const} */ ('amount'), frequency: terms.frequency,
  timing: terms.timing, start: terms.start });

/** Each income year's straight-line depreciation of `cost` over `count` periods from `start`: an
 * equal share each period, the cents of rounding spread so the shares add up to the cost, and a
 * period that runs across 30 June shared by days, the days before 1 July rounded half up.
 * @param {bigint} cost @param {number} start @param {number} count @param {FinanceFrequency} frequency
 * @returns {Map<string, bigint>} */
function straightLine(cost, start, count, frequency) {
  /** @type {Map<string, bigint>} */
  const years = new Map();
  const add = (/** @type {number} */ day, /** @type {bigint} */ value) => {
    const year = yearLabel(yearStarting(day));
    years.set(year, (years.get(year) ?? 0n) + value);
  };
  for (let k = 1; k <= count; k += 1) {
    const share = ratioCents(cost * BigInt(k), BigInt(count)) - ratioCents(cost * BigInt(k - 1), BigInt(count));
    const [from, to] = [periodsAfter(start, k - 1, frequency), periodsAfter(start, k, frequency)];
    const july = Date.UTC(yearStarting(to - 1), 6, 1) / DAY;
    const before = july > from ? ratioCents(share * BigInt(july - from), BigInt(to - from)) : share;
    add(from, before);
    if (before !== share) add(july, share - before);
  }
  return years;
}

/** A lessee's lease under AASB 16: the lease liability and right-of-use asset at commencement,
 * the liability's schedule and each income year's interest, payments, depreciation and closing
 * balances. Amounts are entered excluding any GST the lessee can claim back.
 * @param {LeaseTerms} terms @returns {Lease} */
export function lease(terms) {
  if (terms.ownership !== 'yes' && terms.ownership !== 'no') throw new Error('Choose whether ownership transfers or a purchase option is reasonably certain.');
  const pv = financeSchedule(presentValueTerms(terms));
  const advance = terms.timing === 'advance';
  const payment = BigInt(Math.round(pv.payment * 100));
  const residual = BigInt(Math.round(pv.balloon * 100));
  // Paragraph 26: only the payments not paid at commencement; one in advance is paid then.
  const liability = BigInt(Math.round(pv.amount * 100)) - (advance ? payment : 0n);
  const [prepaid, incentives, direct, restoration] = [terms.prepaid, terms.incentives, terms.direct, terms.restoration]
    .map((value) => BigInt(cents(value)));
  const paidAtStart = prepaid + (advance ? payment : 0n) + direct - incentives;
  const cost = liability + prepaid + (advance ? payment : 0n) - incentives + direct + restoration;
  if (cost <= 0n) throw new Error('The incentives received are as much as the rest of the right-of-use asset’s cost, which leaves it nothing to depreciate.');

  const { perYear } = FREQUENCIES[terms.frequency];
  const rateUnits = BigInt(Math.round(pv.rate * 10000));
  const den = BigInt(perYear) * 1000000n;
  const start = dayOf(terms.start);
  const count = pv.payments;
  /** @type {{period: number, date: number, opening: bigint, payment: bigint, interest: bigint, closing: bigint}[]} */
  const events = [];
  let balance = liability;
  // Each payment after commencement, then the residual: in arrears it falls with the last payment,
  // in advance a period after it. Periods are numbered as the finance schedule numbers them, so
  // its interest by income year reads these rows. The last row's interest takes the cents that
  // rounding leaves, so the payments stay as the lease states them and the liability closes on nil.
  const last = advance && residual ? count + 1 : count;
  for (let period = advance ? 2 : 1; period <= last; period += 1) {
    const paid = (period <= count ? payment : 0n) + (period === last ? residual : 0n);
    const interest = period === last ? paid - balance : ratioCents(balance * rateUnits, den);
    if (interest < 0n) throw new Error('Rounding each period’s interest to the cent leaves the last period with negative interest. Use a larger payment or fewer payments.');
    events.push({ period, date: periodsAfter(start, advance ? period - 1 : period, terms.frequency), opening: balance, payment: paid, interest,
      closing: balance + interest - paid });
    balance += interest - paid;
  }
  /** @param {typeof events[number]} row @returns {LeaseRow} */
  const shown = (row) => ({ period: row.period, date: isoDay(row.date), opening: dollars(row.opening), payment: dollars(row.payment),
    interest: dollars(row.interest), principal: dollars(row.payment - row.interest), closing: dollars(row.closing) });
  const rows = events.map(shown);

  const end = periodsAfter(start, count, terms.frequency);
  const months = terms.life.trim() === '' ? null : number(terms.life, { min: 1, max: 600, integer: true });
  if (terms.ownership === 'yes' && months === null) throw new Error('Enter the asset’s useful life in months: with ownership transferring, the asset is depreciated over it.');
  // Paragraph 32: over the useful life where ownership transfers, else to the earlier of its end and
  // the lease term's: over the lease's own payment periods, or months of the useful life.
  const byLife = months !== null && (terms.ownership === 'yes' || periodsAfter(start, months, 'monthly') < end);
  const depreciation = byLife ? straightLine(cost, start, /** @type {number} */ (months), 'monthly') : straightLine(cost, start, count, terms.frequency);
  const to = byLife ? periodsAfter(start, /** @type {number} */ (months), 'monthly') : end;
  const years = incomeYears(terms, rows, events, depreciation, liability, cost);
  const totalInterest = events.reduce((sum, row) => sum + row.interest, 0n);
  return { liability: dollars(liability), cost: dollars(cost), paidAtStart: dollars(paidAtStart), restoration: dollars(restoration),
    payment: dollars(payment), payments: count, rate: pv.rate, end: isoDay(end), depreciationEnd: isoDay(to), totalInterest: dollars(totalInterest),
    // Appendix A: a lease term of 12 months or less. A lease containing a purchase option is not
    // short-term, which a reasonably certain one shows here; whether it has any other, the note asks.
    shortTerm: end <= periodsAfter(start, 12, 'monthly') && terms.ownership === 'no',
    rows, years };
}

/** Each income year's interest, payments and depreciation, and the liability and asset at its 30 June.
 * @param {LeaseTerms} terms @param {LeaseRow[]} rows the schedule as shown
 * @param {{date: number, payment: bigint}[]} events the payments, dated by day
 * @param {Map<string, bigint>} depreciation by income year @param {bigint} liability @param {bigint} cost
 * @returns {LeaseYear[]} */
function incomeYears(terms, rows, events, depreciation, liability, cost) {
  const interestYears = interestByIncomeYear(/** @type {any} */ ({ start: terms.start, timing: terms.timing, frequency: terms.frequency }),
    /** @type {any} */ ({ rows, balloonRow: null }));
  /** @type {Map<string, bigint>} */
  const paidYears = new Map();
  for (const row of events) {
    const year = yearLabel(yearStarting(row.date));
    paidYears.set(year, (paidYears.get(year) ?? 0n) + row.payment);
  }
  const labels = [...new Set([...depreciation.keys(), ...Object.keys(interestYears), ...paidYears.keys()])].sort((a, b) => a.localeCompare(b));
  let [owed, carried] = [liability, cost];
  return labels.map((year) => {
    const interest = BigInt(Math.round((interestYears[year] ?? 0) * 100));
    const paid = paidYears.get(year) ?? 0n;
    const charge = depreciation.get(year) ?? 0n;
    owed += interest - paid;
    carried -= charge;
    return { year, interest: dollars(interest), paid: dollars(paid), liability: dollars(owed), depreciation: dollars(charge), asset: dollars(carried) };
  });
}

/**
 * @typedef {'credit' | 'no-credit' | 'none'} GstCase GST charged and claimed in full; charged
 *   and not claimed; not charged
 * @typedef {{price: string, gst: GstCase, hpRate: string, life: string, method: 'prime-cost' | 'diminishing-value',
 *   taxRate: string, car: 'yes' | 'no'}} Purchase
 * @typedef {{year: string, cash: number, credits: number, deductions: number, taxSaved: number, net: number}} OptionYear
 * @typedef {{years: OptionYear[], cash: number, credits: number, deductions: number, taxSaved: number, net: number,
 *   taxValue: number}} OptionTotal
 */

/** 1/10 of a GST-exclusive amount, half up. @param {bigint} value */
const gstOn = (value) => ratioCents(value, 10n);

/** The lease against hire purchase against buying outright, by income year from commencement to
 * the year the lease term ends: cash paid, GST credits, deductions, the tax they save at the rate
 * entered and the net cost. The lease's residual is paid at the end to buy the asset; hire purchase
 * runs on the lease's payment dates with the residual as its balloon.
 *
 * GST (ATO, 'GST – hire purchase and leasing', last updated 6 April 2017, read 19 November 2026):
 * a lease payment's credit falls with each payment; a hire purchase agreement entered into on or
 * after 1 July 2012 is taxable in every component, credit charge included, and its whole credit
 * falls with the first payment; a purchase's credit falls when it is paid. Deductions exclude any
 * GST credit (section 27-5 of the Income Tax Assessment Act 1997): lease payments when paid
 * (section 8-1), and for hire purchase the notional interest (Division 240) and, for hire purchase
 * and buying, the asset's decline in value (Division 40) to 30 June of the last year.
 * @param {LeaseTerms} terms @param {Purchase} purchase */
export function leaseComparison(terms, purchase) {
  if (purchase.car !== 'yes' && purchase.car !== 'no') throw new Error('Choose whether the asset is a car above the car limit.');
  if (purchase.car === 'yes') {
    throw new Error('A car above the car limit is not compared: a lease of one is a luxury car lease under Division 242, and its GST credit is capped by section 69-10 of the GST Act.');
  }
  if (!['credit', 'no-credit', 'none'].includes(purchase.gst)) throw new Error('Choose how GST applies.');
  if (purchase.method !== 'prime-cost' && purchase.method !== 'diminishing-value') throw new Error('Choose prime cost or diminishing value.');
  const leased = lease(terms);
  const price = BigInt(cents(purchase.price, 0.01));
  const life = parseLife(purchase.life);
  const taxUnits = BigInt(Math.round(number(purchase.taxRate, { max: 100, places: 2 }) * 100));
  const charged = purchase.gst !== 'none';
  const claim = purchase.gst === 'credit';
  /** What is paid for a GST-exclusive amount. @param {bigint} value */
  const gross = (value) => (charged ? value + gstOn(value) : value);
  /** What a GST-exclusive amount deducts: the price paid, less any credit. @param {bigint} value */
  const deductible = (value) => (claim ? value : gross(value));
  // To the income year holding the end of the lease term, when the last payment or the residual falls.
  const lastYear = yearStarting(dayOf(leased.end));
  const firstYear = yearStarting(dayOf(terms.start));
  /** @returns {Map<string, {cash: bigint, credits: bigint, deductions: bigint}>} */
  const blank = () => new Map(Array.from({ length: lastYear - firstYear + 1 }, (_, i) => [yearLabel(firstYear + i),
    { cash: 0n, credits: 0n, deductions: 0n }]));
  /** @param {Map<string, {cash: bigint, credits: bigint, deductions: bigint}>} years @param {string} date
   * @param {'cash' | 'credits' | 'deductions'} field @param {bigint} value */
  const add = (years, date, field, value) => {
    const line = years.get(yearLabel(yearStarting(dayOf(date))));
    if (!line) throw new Error(`No income year holds ${date}.`);
    line[field] += value;
  };
  const decline = (/** @type {bigint} */ cost, /** @type {Map<string, {cash: bigint, credits: bigint, deductions: bigint}>} */ years) => {
    const lines = declineInValue({ cost, life, start: terms.start, yearEnd: lastYear + 1, method: purchase.method });
    // The schedule runs from commencement to the last year, so each of its years is in the map.
    for (const line of lines) /** @type {{deductions: bigint}} */ (years.get(yearLabel(line.yearEnd - 1))).deductions += line.deduction;
    return /** @type {{closing: bigint}} */ (lines.at(-1)).closing;
  };

  // The lease: each regular payment, the one at commencement included, then the residual bought.
  const leaseYears = blank();
  const payment = BigInt(Math.round(leased.payment * 100));
  const advance = terms.timing === 'advance';
  for (let k = 0; k < leased.payments; k += 1) {
    const date = isoDay(periodsAfter(dayOf(terms.start), advance ? k : k + 1, terms.frequency));
    add(leaseYears, date, 'cash', gross(payment));
    if (claim) add(leaseYears, date, 'credits', gstOn(payment));
    add(leaseYears, date, 'deductions', deductible(payment));
  }
  const residual = BigInt(cents(terms.residual));
  if (residual) {
    add(leaseYears, leased.end, 'cash', gross(residual));
    if (claim) add(leaseYears, leased.end, 'credits', gstOn(residual));
  }

  // Hire purchase: the GST-inclusive price financed at the hire purchase rate.
  const hp = financeSchedule({ solve: 'payment', amount: (Number(gross(price)) / 100).toFixed(2), rate: purchase.hpRate, payments: terms.payments,
    payment: '1', balloon: (Number(gross(residual)) / 100).toFixed(2), balloonKind: 'amount', frequency: terms.frequency, timing: terms.timing,
    start: terms.start });
  const hpYears = blank();
  for (const row of [...hp.rows, ...(hp.balloonRow ? [hp.balloonRow] : [])]) add(hpYears, row.date, 'cash', BigInt(Math.round(row.payment * 100)));
  const hpTotal = BigInt(Math.round(hp.totalPaid * 100));
  if (claim) add(hpYears, hp.rows[0].date, 'credits', ratioCents(hpTotal, 11n));
  const hpInterest = interestByIncomeYear(/** @type {any} */ ({ start: terms.start, timing: terms.timing, frequency: terms.frequency }), hp);
  for (const [year, interest] of Object.entries(hpInterest)) {
    const value = BigInt(Math.round(interest * 100));
    /** @type {{deductions: bigint}} */ (hpYears.get(year)).deductions += claim ? ratioCents(value * 10n, 11n) : value;
  }
  const cost = deductible(price);
  const hpLeft = decline(cost, hpYears);

  // Buying outright on the commencement date.
  const buyYears = blank();
  add(buyYears, terms.start, 'cash', gross(price));
  if (claim) add(buyYears, terms.start, 'credits', gstOn(price));
  const buyLeft = decline(cost, buyYears);

  /** @param {Map<string, {cash: bigint, credits: bigint, deductions: bigint}>} years @param {bigint} taxValue @returns {OptionTotal} */
  const total = (years, taxValue) => {
    const lines = [...years].map(([year, line]) => {
      const taxSaved = ratioCents(line.deductions * taxUnits, 10000n);
      return { year, cash: line.cash, credits: line.credits, deductions: line.deductions, taxSaved, net: line.cash - line.credits - taxSaved };
    });
    const sum = (/** @type {'cash' | 'credits' | 'deductions' | 'taxSaved' | 'net'} */ field) => dollars(lines.reduce((acc, line) => acc + line[field], 0n));
    return { years: lines.map((line) => ({ year: line.year, cash: dollars(line.cash), credits: dollars(line.credits),
      deductions: dollars(line.deductions), taxSaved: dollars(line.taxSaved), net: dollars(line.net) })),
    cash: sum('cash'), credits: sum('credits'), deductions: sum('deductions'), taxSaved: sum('taxSaved'), net: sum('net'),
    taxValue: dollars(taxValue) };
  };
  return { lease: total(leaseYears, residual ? deductible(residual) : 0n), hirePurchase: total(hpYears, hpLeft), buy: total(buyYears, buyLeft),
    hpPayment: hp.payment, lastYear: yearLabel(lastYear) };
}

/** A date as the tables write it: '1 Aug 2026'. @param {string} iso */
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** A date as a sentence writes it: '1 August 2026'. @param {string} iso */
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const GST_CASES = { credit: 'GST charged and claimed in full', 'no-credit': 'GST charged and not claimed', none: 'no GST charged' };
const OPTIONS = /** @type {const} */ ([['lease', 'Lease'], ['hirePurchase', 'Hire purchase'], ['buy', 'Buying outright']]);
/** The lease form's amounts that are left out of its inputs sentence when nil, and how each reads. */
const EXTRAS = /** @type {const} */ ([['residual', 'residual'], ['prepaid', 'paid before commencement'], ['incentives', 'incentives'],
  ['direct', 'initial direct costs'], ['restoration', 'restoration']]);

/** The lease page's result from its form: the inputs sentence, summary rows, a note, the tables
 * and a CSV. @param {(name: string) => string} value the form field named @param {(value: number) => string} aud */
export function leaseResult(value, aud) {
  /** @type {LeaseTerms} */
  const terms = { payment: value('payment'), payments: value('payments'), frequency: /** @type {FinanceFrequency} */ (value('frequency')),
    timing: /** @type {'arrears' | 'advance'} */ (value('timing')), rate: value('rate'), start: value('start'), residual: value('residual'),
    prepaid: value('prepaid'), incentives: value('incentives'), direct: value('direct'), restoration: value('restoration'),
    ownership: /** @type {'yes' | 'no'} */ (value('ownership')), life: value('life') };
  const r = lease(terms);
  const { noun } = FREQUENCIES[terms.frequency];
  const extras = EXTRAS.filter(([field]) => cents(terms[field]) !== 0)
    .map(([field, words]) => (field === 'prepaid' ? `${aud(Number(terms[field]))} ${words}` : `${words} ${aud(Number(terms[field]))}`));
  const inputs = [`${r.payments} ${noun} payment${r.payments === 1 ? '' : 's'} of ${aud(r.payment)} in ${terms.timing}`,
    `${r.rate}% a year discount rate`, ...extras, `commencing ${longDate(terms.start)}`,
    terms.ownership === 'yes' ? `ownership transfers, useful life ${terms.life.trim()} months` : ''].filter(Boolean).join(', ');
  const rows = [['Lease liability at commencement', aud(r.liability)], ['Right-of-use asset at commencement', aud(r.cost)],
    ['Total interest over the lease', aud(r.totalInterest)], ['Lease term ends', longDate(r.end)],
    ['Right-of-use asset depreciated straight line to', longDate(r.depreciationEnd)]];
  /** @type {(string | false)[]} */
  const notes = [r.shortTerm && 'The lease term is 12 months or less, so unless the lease contains a purchase option, paragraphs 5 and 6 let the lessee elect to expense the payments instead'];
  const all = r.rows.map((row) => ({ ...row, label: row.period > r.payments ? 'Residual' : String(row.period) }));
  const commencement = [['Debit right-of-use asset', aud(r.cost)], ['Credit lease liability', aud(r.liability)],
    ...(r.restoration ? [['Credit provision for restoration', aud(r.restoration)]] : []),
    ...(r.paidAtStart ? [[r.paidAtStart > 0 ? 'Credit bank: paid at or before commencement, less incentives' : 'Debit bank: incentives received, less what was paid',
      aud(Math.abs(r.paidAtStart))]] : [])];
  /** @type {Record<string, string[][]>} */
  const tables = {
    years: r.years.map((y) => [y.year, aud(y.interest), aud(y.paid), aud(y.liability), aud(y.depreciation), aud(y.asset)]),
    schedule: all.map((row) => [row.label, shortDate(row.date), aud(row.opening), aud(row.payment), aud(row.interest), aud(row.principal), aud(row.closing)]),
    commencement,
  };
  const money = (/** @type {number} */ figure) => figure.toFixed(2);
  const csv = ['Currency,AUD', 'AASB 16 lessee estimate; interest rounded half up to the cent each period; the last period takes the rounding',
    `Lease liability at commencement,${money(r.liability)}`, `Right-of-use asset at commencement,${money(r.cost)}`,
    `Payments,${r.payments} ${noun} of ${money(r.payment)} in ${terms.timing}`, `Discount rate (% a year),${r.rate}`,
    `Lease term ends,${r.end}`, `Depreciated to,${r.depreciationEnd}`, `Total interest,${money(r.totalInterest)}`, '',
    'Income year,Interest,Lease payments,Lease liability at 30 June,Depreciation,Right-of-use asset at 30 June',
    ...r.years.map((y) => [y.year, ...[y.interest, y.paid, y.liability, y.depreciation, y.asset].map(money)].join(',')), '',
    'Payment,Date,Opening,Payment,Interest,Principal,Closing',
    ...all.map((row) => [row.label, row.date, ...[row.opening, row.payment, row.interest, row.principal, row.closing].map(money)].join(','))];
  if (value('compare') === 'yes') {
    /** @type {Purchase} */
    const purchase = { price: value('price'), gst: /** @type {GstCase} */ (value('gst')), hpRate: value('hp-rate'), life: value('effective-life'),
      method: /** @type {'prime-cost' | 'diminishing-value'} */ (value('method')), taxRate: value('tax-rate'), car: /** @type {'yes' | 'no'} */ (value('car')) };
    const c = leaseComparison(terms, purchase);
    const total = (/** @type {string} */ label, /** @type {'cash' | 'credits' | 'deductions' | 'taxSaved' | 'net' | 'taxValue'} */ field) =>
      [label, ...OPTIONS.map(([key]) => aud(c[key][field]))];
    tables.comparison = [...c.lease.years.map((line, i) => [`Net cost, ${line.year}`, ...OPTIONS.map(([key]) => aud(c[key].years[i].net))]),
      total('Cash paid', 'cash'), total('GST credits', 'credits'), total('Deductions', 'deductions'),
      total(`Tax saved at ${purchase.taxRate.trim()}%`, 'taxSaved'), total('Net cost', 'net'), total('Tax value left at the end', 'taxValue')];
    rows.push(...OPTIONS.map(([key, name]) => [`Net cost after GST and tax, ${name.toLowerCase()}`, aud(c[key].net)]));
    notes.push(`Hire purchase at ${purchase.hpRate.trim()}% a year pays ${aud(c.hpPayment)} a period; ${GST_CASES[purchase.gst]}`);
    csv.push('', `Comparison,price ${money(Number(purchase.price))} excluding GST,${GST_CASES[purchase.gst]},hire purchase ${purchase.hpRate.trim()}%,`
      + `effective life ${purchase.life.trim()} years ${purchase.method},tax rate ${purchase.taxRate.trim()}%`,
    'Option,Income year,Cash paid,GST credits,Deductions,Tax saved,Net cost',
    ...OPTIONS.flatMap(([key, name]) => c[key].years.map((line) => [name, line.year, ...[line.cash, line.credits, line.deductions, line.taxSaved, line.net].map(money)].join(','))),
    ...OPTIONS.map(([key, name]) => `${name},Tax value left at 30 June ${c.lastYear.slice(0, 2)}${c.lastYear.slice(-2)},${money(c[key].taxValue)}`));
  }
  const live = notes.filter(Boolean);
  return { inputs, rows, principal: 0, note: live.length ? live.join('. ') : undefined, tables, csv: csv.join('\r\n') };
}
