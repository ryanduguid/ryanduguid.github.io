// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { number, ratioCents } from './money.mjs';

// Annual payroll tax for 2026-27 for one employer that is not a member of a group and pays wages
// for the whole year. The figures are those of the page's data file,
// tools/business-calculators/payroll-tax/payroll-tax-rates.csv, which records each one's source,
// the date it took effect and the date it was read; scripts/business-calculators.test.mjs binds
// this table to that file. Amounts are whole dollars and rates per cent; each `rates` row is the
// Australian wages above which a rate applies and the rate.

/** @typedef {[bigint, bigint]} Fraction numerator and positive denominator
 * @typedef {{from: Fraction, to: Fraction, rate: Fraction}} TaxSlice the Australian wages from and
 *   to which a rate applies; the employer's share of them is taxed at it
 * @typedef {{tax: TaxSlice[], levy?: {size: bigint, rate: Fraction}, extraLevy?: {size: bigint, rate: Fraction}}} PayrollTaxRule
 * @typedef {'AU-NSW' | 'AU-VIC' | 'AU-VIC-REGIONAL' | 'AU-QLD' | 'AU-WA' | 'AU-SA' | 'AU-TAS' | 'AU-ACT' | 'AU-NT'} PayrollTaxPlace
 */

export const PAYROLL_TAX_2026_27 = {
  'AU-NSW': { threshold: '1200000', rates: [['0', '5.45']] },
  'AU-VIC': { threshold: '1000000', phaseOutFrom: '3000000', phaseOutRate: '50', rates: [['0', '4.85']],
    surchargeThreshold: '10000000', secondSurchargeThreshold: '100000000', surchargeRate: '0.5' },
  'AU-VIC-REGIONAL': { threshold: '1000000', phaseOutFrom: '3000000', phaseOutRate: '50', rates: [['0', '1.2125']],
    surchargeThreshold: '10000000', secondSurchargeThreshold: '100000000', surchargeRate: '0.5' },
  'AU-QLD': { threshold: '1300000', taperPer: '7', rates: [['0', '4.75'], ['6500000', '4.95']],
    levyThreshold: '10000000', levyRate: '0.25', additionalLevyThreshold: '100000000', additionalLevyRate: '0.5' },
  'AU-WA': { threshold: '1000000', upperThreshold: '7500000', rates: [['0', '5.5']] },
  'AU-SA': { threshold: '1500000', deduction: '600000', fullRateAbove: '1700000', rates: [['0', '4.95']] },
  'AU-TAS': { threshold: '1250000', rates: [['0', '4'], ['2000000', '6.1']] },
  'AU-ACT': { threshold: '1750000', rates: [['0', '6.75'], ['20000000', '6.85'], ['50000000', '7.35'],
    ['100000000', '7.85'], ['150000000', '8.75']] },
  // Section 7A(2): 6.5% when Australian wages are equal to or greater than $100,000,000.
  'AU-NT': { threshold: '2500000', taperPer: '2', rates: [['0', '5.5'], ['99999999.99', '6.5']] },
};
const LAW = PAYROLL_TAX_2026_27;

/** @param {string} dollars */
const lawCents = (dollars) => BigInt(Math.round(Number(dollars) * 100));
/** A rate per cent as a fraction of 1. @param {string} value @returns {Fraction} */
const percent = (value) => [BigInt(Math.round(Number(value) * 10000)), 1000000n];
/** @param {bigint} a @param {bigint} b */
const above = (a, b) => (a > b ? a - b : 0n);
/** @param {bigint} a @param {bigint} b */
const least = (a, b) => (a < b ? a : b);
/** The rate of the last row whose wages the Australian wages are above.
 * @param {string[][]} rates @param {bigint} australian */
const banded = (rates, australian) => percent(rates.reduce((found, [over, rate]) => (australian > lawCents(over) ? rate : found), rates[0][1]));
/** One rate on the Australian wages above a deduction base, which can be a fraction of a cent.
 * @param {bigint} australian @param {Fraction} base @param {Fraction} rate @returns {TaxSlice[]} */
const aboveBase = (australian, [n, d], rate) => [{ from: [least(australian * d, n), d], to: [australian, 1n], rate }];
/** A deduction base that falls by $1 for every `per` dollars of Australian wages above the threshold.
 * @param {bigint} australian @param {{threshold: string, taperPer: string}} law @returns {Fraction} */
const tapered = (australian, { threshold, taperPer }) => {
  const per = BigInt(taperPer);
  return [above(lawCents(threshold) * per, above(australian, lawCents(threshold))), per];
};
/** Victoria's surcharge size: the wages above each surcharge threshold, at the same rate.
 * @param {bigint} australian @param {(typeof PAYROLL_TAX_2026_27)['AU-VIC']} law */
const victorianSurcharge = (australian, law) => ({ rate: percent(law.surchargeRate),
  size: above(australian, lawCents(law.surchargeThreshold)) + above(australian, lawCents(law.secondSurchargeThreshold)) });

/** Each jurisdiction's tax on its share of the employer's Australian wages, from those wages.
 * @type {Map<string, (australian: bigint) => PayrollTaxRule>} */
const RULES = new Map(Object.entries({
  // Revenue NSW: the threshold apportioned by NSW wages over Australian wages.
  'AU-NSW': (a) => ({ tax: aboveBase(a, [lawCents(LAW['AU-NSW'].threshold), 1n], banded(LAW['AU-NSW'].rates, a)) }),
  'AU-VIC': (a) => victoria(a, LAW['AU-VIC']),
  'AU-VIC-REGIONAL': (a) => victoria(a, LAW['AU-VIC-REGIONAL']),
  // Payroll Tax Act 1971 (Qld) ss 10, 29(1) and 43I.
  'AU-QLD': (a) => {
    const law = LAW['AU-QLD'];
    return { tax: aboveBase(a, tapered(a, law), banded(law.rates, a)),
      levy: { size: above(a, lawCents(law.levyThreshold)), rate: percent(law.levyRate) },
      extraLevy: { size: above(a, lawCents(law.additionalLevyThreshold)), rate: percent(law.additionalLevyRate) } };
  },
  // Pay-roll Tax Assessment Act 2002 (WA) ss 8, 10 and 13: the deduction falls by the threshold
  // over (upper threshold less threshold) for each dollar above the threshold.
  'AU-WA': (a) => {
    const [threshold, upper] = [lawCents(LAW['AU-WA'].threshold), lawCents(LAW['AU-WA'].upperThreshold)];
    return { tax: aboveBase(a, [above(threshold * (upper - threshold), above(a, threshold) * threshold), upper - threshold],
      banded(LAW['AU-WA'].rates, a)) };
  },
  // Payroll Tax Act 2009 (SA) Sch 1 cl 4 and 5: the deduction, and a rate that is nil up to the
  // threshold and rises in proportion to Australian wages from there to the full rate.
  'AU-SA': (a) => {
    const law = LAW['AU-SA'];
    const [threshold, full, [n, d]] = [lawCents(law.threshold), lawCents(law.fullRateAbove), banded(law.rates, a)];
    /** @type {Fraction} */
    const rate = a > full ? [n, d] : [above(a, threshold) * n, (full - threshold) * d];
    return { tax: aboveBase(a, [lawCents(law.deduction), 1n], rate) };
  },
  // Payroll Tax Act 2008 (Tas) Sch 1 cl 4: the lower rate between the 2 thresholds, the higher above.
  'AU-TAS': (a) => {
    const [[, lower], [upperFrom, upper]] = LAW['AU-TAS'].rates;
    const [start, middle] = [least(a, lawCents(LAW['AU-TAS'].threshold)), least(a, lawCents(upperFrom))];
    return { tax: [{ from: [start, 1n], to: [middle, 1n], rate: percent(lower) }, { from: [middle, 1n], to: [a, 1n], rate: percent(upper) }] };
  },
  // Payroll Tax Act 2011 (ACT) Sch 1 s 1.5, with the rate for the Australian wages from DI2026-151.
  'AU-ACT': (a) => ({ tax: aboveBase(a, [lawCents(LAW['AU-ACT'].threshold), 1n], banded(LAW['AU-ACT'].rates, a)) }),
  // Payroll Tax Act 2009 (NT) s 7A and Sch 1 cl 3 and 5.
  'AU-NT': (a) => ({ tax: aboveBase(a, tapered(a, LAW['AU-NT']), banded(LAW['AU-NT'].rates, a)) }),
}));

/** Payroll Tax Act 2007 (Vic) Sch 1 cl 5: the threshold, less the phase-out rate times the
 * Australian wages above the phase-out start, never below nil; 2 surcharges of the same size.
 * @param {bigint} australian @param {(typeof PAYROLL_TAX_2026_27)['AU-VIC']} law @returns {PayrollTaxRule} */
function victoria(australian, law) {
  const [n, d] = percent(law.phaseOutRate);
  const base = above(lawCents(law.threshold) * d, above(australian, lawCents(law.phaseOutFrom)) * n);
  const surcharge = victorianSurcharge(australian, law);
  return { tax: aboveBase(australian, [base, d], banded(law.rates, australian)), levy: surcharge, extraLevy: surcharge };
}

/** @param {string} value */
const wagesCents = (value) => BigInt(Math.round(number(value, { max: 1e11, money: true }) * 100));
/** A rate as the page shows it: to 4 decimal places, said to be approximate when it is not exact.
 * @param {Fraction} rate */
const rateText = ([n, d]) => {
  const tenThousandths = ratioCents(n * 1000000n, d);
  return `${(n * 1000000n) % d ? 'about ' : ''}${Number(tenThousandths) / 10000}%`;
};

/** One employer's 2026-27 payroll tax in the chosen jurisdiction. `wages` are its taxable wages
 * there and `australian` its taxable and interstate wages across Australia, blank for the same.
 * Each amount is worked exactly and rounds half up to the cent once; the payroll tax and the total
 * add the amounts shown.
 * @param {string} wages @param {string} australian @param {string} place */
export function payrollTax(wages, australian, place) {
  const rule = RULES.get(place);
  if (!rule) throw new Error('Choose a state or territory.');
  const own = wagesCents(wages);
  const all = typeof australian === 'string' && australian.trim() === '' ? own : wagesCents(australian);
  if (all < own) throw new Error('Enter total Australian wages of at least the wages in the state or territory.');
  // The employer's share of n / d of Australian wages, wages × n ÷ (d × Australian wages), in dollars.
  const shown = (/** @type {bigint} */ n, /** @type {bigint} */ d) => (all === 0n ? 0 : Number(ratioCents(own * n, all * d)) / 100);
  const { tax, levy, extraLevy } = rule(all);
  const [base, scale] = tax[0].from;
  const lines = tax.map(({ from: [fn, fd], to: [tn, td], rate: [rn, rd] }) => {
    const size = tn * fd - fn * td;
    return { rate: rateText([rn, rd]), on: shown(size, td * fd), amount: shown(size * rn, td * fd * rd) };
  });
  /** @param {{size: bigint, rate: Fraction} | undefined} part */
  const charge = (part) => (part ? shown(part.size * part.rate[0], part.rate[1]) : 0);
  const cents = (/** @type {number} */ value) => Math.round(value * 100);
  const payroll = lines.reduce((sum, line) => sum + cents(line.amount), 0);
  const [first, second] = [charge(levy), charge(extraLevy)];
  return { deduction: shown(base, scale), taxable: shown(all * scale - base, scale), tax: payroll / 100,
    levy: first, extraLevy: second, total: (payroll + cents(first) + cents(second)) / 100, lines };
}

/** What the page calls each employer and cites for each step. */
const STEPS = {
  'AU-NSW': { name: 'New South Wales', deduction: 'Revenue NSW: threshold times NSW wages over Australian wages',
    tax: 'Revenue NSW: thresholds and rates' },
  'AU-VIC': { name: 'Victoria', deduction: 'Payroll Tax Act 2007 (Vic), Sch 1 cl 5', tax: 'Sch 1 cl 1 and 5',
    levy: 'Mental health and wellbeing surcharge (Sch 1 cl 5)', extraLevy: 'COVID-19 debt temporary surcharge (Sch 1 cl 1B)',
    total: 'Payroll tax and surcharges' },
  'AU-VIC-REGIONAL': { name: 'Victoria, regional employer', deduction: 'Payroll Tax Act 2007 (Vic), Sch 1 cl 5',
    tax: 'regional rate, s 3A and Sch 1 cl 1', levy: 'Mental health and wellbeing surcharge (Sch 1 cl 5)',
    extraLevy: 'COVID-19 debt temporary surcharge (Sch 1 cl 1B)', total: 'Payroll tax and surcharges' },
  'AU-QLD': { name: 'Queensland', deduction: 'Payroll Tax Act 1971 (Qld), s 29', tax: 's 10',
    levy: 'Mental health levy, primary annual levy amount (s 43I)', extraLevy: 'Mental health levy, additional annual levy amount (s 43I)',
    total: 'Payroll tax and mental health levy' },
  'AU-WA': { name: 'Western Australia', deduction: 'Pay-roll Tax Assessment Act 2002 (WA), ss 8, 10 and 13',
    tax: 'Pay-roll Tax Act 2002 (WA), s 5(4)' },
  'AU-SA': { name: 'South Australia', deduction: 'Payroll Tax Act 2009 (SA), Sch 1 cl 5(1)', tax: 'Sch 1 cl 4 and 5' },
  'AU-TAS': { name: 'Tasmania', deduction: 'Payroll Tax Act 2008 (Tas), Sch 1 cl 4', tax: 'Sch 1 cl 1 and 4' },
  'AU-ACT': { name: 'Australian Capital Territory', deduction: 'Payroll Tax Act 2011 (ACT), Sch 1 s 1.5',
    tax: 'Sch 1 s 1.5 and DI2026-151 s 5' },
  'AU-NT': { name: 'Northern Territory', deduction: 'Payroll Tax Act 2009 (NT), Sch 1 cl 3 and 5', tax: 's 7A and Sch 1 cl 5' },
};

/** The page's result: its inputs sentence, a row for each step and the note.
 * @param {string} wages @param {string} australian @param {string} place @param {(value: number) => string} aud */
export function payrollTaxResult(wages, australian, place, aud) {
  const r = payrollTax(wages, australian, place);
  const steps = /** @type {{name: string, deduction: string, tax: string, levy?: string, extraLevy?: string, total?: string}} */ (
    STEPS[/** @type {PayrollTaxPlace} */ (place)]);
  const all = australian.trim() === '' ? wages : australian;
  /** @type {[string, string][]} */
  const rows = [[`Deduction (${steps.deduction})`, aud(r.deduction)], ['Taxable amount: wages less the deduction', aud(r.taxable)],
    ...r.lines.filter((line, index) => index === 0 || line.on > 0)
      .map((line) => /** @type {[string, string]} */ ([`Payroll tax at ${line.rate} on ${aud(line.on)} (${steps.tax})`, aud(line.amount)]))];
  if (steps.levy && steps.extraLevy) rows.push([steps.levy, aud(r.levy)], [steps.extraLevy, aud(r.extraLevy)]);
  rows.push([steps.total ?? 'Payroll tax', aud(r.total)]);
  return { inputs: `${steps.name}, taxable wages ${aud(number(wages, { max: 1e11, money: true }))}, `
    + `total Australian wages ${aud(number(all, { max: 1e11, money: true }))}`, rows, principal: rows.length - 1,
  note: 'An estimate for 2026-27 for one employer that is not a member of a group and pays wages all year, before any exemption, rebate or discount' };
}
