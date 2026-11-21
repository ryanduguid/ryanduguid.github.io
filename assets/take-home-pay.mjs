// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// Take-home pay from one salary: the year's income tax, Medicare levy, any Medicare levy surcharge
// and study loan repayment on that salary, spread evenly over the year, and the employer's super
// guarantee. It also works the PAYG amount withheld from each pay under the Commissioner's Schedules 1
// and 8 for the year, which is a different figure from the year's tax spread evenly.
import { daysInYear, incomeTax, medicareLevySurcharge } from './income-tax.mjs';
import { cents as amountCents, ratioCents } from './money.mjs';
import { studyLoanRepayment } from './study-loan.mjs';
import { PAYS, withholding } from './payg-withholding.mjs';

// The general super guarantee rate per cent and the maximum contribution base for a full year of
// earnings paid evenly. 2026-27: the charge percentage, 12, in s 17A(2) of the Superannuation
// Guarantee (Administration) Act 1992 (Compilation No. 78, 1 July 2026, read 17 November 2026) and
// the annual base of $270,830 under s 10A(5), from the ATO's 'Super guarantee' page (Table 23, last
// updated 17 April 2026). 2021-22 to 2025-26: the rate under s 19 before Payday Super (Table 21) and
// 4 quarters of the quarterly base (Table 24), read 18 November 2026. Table 24 starts at 2021-22.
/** @type {Record<string, {rate: number, cap: number}>} */
export const SUPER_GUARANTEE = {
  '2026-27': { rate: 12, cap: 270830 },
  '2025-26': { rate: 12, cap: 250000 },
  '2024-25': { rate: 11.5, cap: 260280 },
  '2023-24': { rate: 11, cap: 249080 },
  '2022-23': { rate: 10.5, cap: 240880 },
  '2021-22': { rate: 10, cap: 235680 },
};

// The general concessional contributions cap (ITAA 1997 s 291-20(2), Compilation No. 268, read
// 18 November 2026: $25,000 indexed), from the ATO's 'Contributions caps' (Table 1.1, last updated
// 11 September 2026), read 18 November 2026.
/** @type {Record<string, number>} */
export const CONCESSIONAL_CAP = { '2026-27': 32500, '2025-26': 30000, '2024-25': 30000, '2023-24': 27500,
  '2022-23': 27500, '2021-22': 27500 };

/** Division 293 taxable contributions in cents (ITAA 1997 s 293-20): the lesser of the low tax
 * contributions and the amount by which income for surcharge purposes, less reportable super
 * contributions, plus those contributions exceeds $250,000. Here the low tax contributions are the
 * concessional contributions, as unused cap carried forward is assumed to cover any amount above the
 * cap, leaving no excess (s 293-25).
 * @param {number} income cents @param {number} contributions cents */
export const division293 = (income, contributions) => Math.max(0, Math.min(contributions,
  income + contributions - 25000000));

// From 2026-27 an Australian resident deducts the lesser of $1,000 and assessable labour income,
// less work-related deductions (ITAA 1997 s 25-130, Compilation No. 268, read 17 November 2026; the
// ATO applies it automatically from the 2026-27 return). Here the salary less any amount sacrificed
// is all labour income and there are no other deductions, so it is the lesser of $1,000 and that.
const STANDARD_DEDUCTION_FROM = '2026-27';

/** Each period a salary can be entered for, and how many make a year. */
export const PERIODS = /** @type {Record<string, number>} */ ({ year: 1, ...PAYS });

/** @param {number} numerator @param {number} denominator positive; half up */
const nearest = (numerator, denominator) => Math.floor((2 * numerator + denominator) / (2 * denominator));
/**
 * @typedef {{payday: string, grossSalary: string, superEarnings: string}} DatedPay
 * @typedef {{year: string, residency: string, salary: string, period: string, includesSuper: boolean,
 *   sacrifice: string, studyLoan: boolean, hospitalCover: boolean, datedPay?: DatedPay[]}} Pay
 */

export const MAX_DATED_PAYMENTS = 1000;

/** SG on actual payments from one employer. Gross salary is before salary sacrifice and excludes SG.
 * @param {DatedPay[]} payments @param {string} year @param {number} salary annual cents
 * @param {number} cap annual cents @param {number} tenths rate in tenths of a per cent */
function datedSuperGuarantee(payments, year, salary, cap, tenths) {
  if (!Array.isArray(payments) || !payments.length || payments.length > MAX_DATED_PAYMENTS) {
    throw new Error(`Enter at least one dated payment and no more than ${MAX_DATED_PAYMENTS}.`);
  }
  const start = year.slice(0, 4);
  const from = `${start}-07-01`;
  const to = `${Number(start) + 1}-06-30`;
  // Table 24 applies by quarter through June 2026. From July 2026, s 10A(6) caps
  // qualifying earnings in the year and s 17A(2) combines all payments on the same day.
  const quarterly = year < '2026-27';
  const earningsByPeriod = new Map();
  let grossTotal = 0;
  for (const { payday, grossSalary, superEarnings } of payments) {
    const date = new Date(`${payday}T00:00:00Z`);
    if (typeof payday !== 'string' || payday < from || payday > to
      || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== payday) {
      throw new Error('Enter a valid payday in the selected income year, using YYYY-MM-DD.');
    }
    const gross = amountCents(grossSalary);
    const earnings = amountCents(superEarnings);
    if (earnings > gross) throw new Error('Earnings for super cannot exceed gross salary in a dated payment.');
    grossTotal += gross;
    const period = quarterly ? String(Math.floor(date.getUTCMonth() / 3)) : payday;
    earningsByPeriod.set(period, (earningsByPeriod.get(period) ?? 0) + earnings);
  }
  if (grossTotal !== salary) throw new Error('Dated gross payments must add up to the salary for the year.');

  let remainingBase = quarterly ? cap / 4 : cap;
  let superGuarantee = 0;
  for (const period of [...earningsByPeriod.keys()].sort((a, b) => a.localeCompare(b))) {
    const counted = Math.min(earningsByPeriod.get(period), remainingBase);
    superGuarantee += Number(ratioCents(BigInt(counted) * BigInt(tenths), 1000n));
    if (!quarterly) remainingBase -= counted;
  }
  return superGuarantee;
}

/** One full year at one salary, entered for a `period` and multiplied by that period's pays. With
 * `includesSuper`, the salary is a package of salary and super guarantee: below the base, super is
 * rate ÷ (100 + rate) of it; above, the base times the rate. Super guarantee is the rate on the
 * salary before any salary sacrifice, up to the base (ATO: 'Salary sacrificing super', last updated
 * 21 April 2026: the employer pays the full super guarantee as though there was no sacrifice).
 * Salary sacrificed to super, entered for the same period, is not assessable and is a reportable
 * employer super contribution, so it counts towards repayment income and income for surcharge
 * purposes in whole dollars. Taxable income is the salary less the sacrifice and any standard
 * deduction, in whole dollars. A resident without private patient hospital cover pays the surcharge
 * of a single person for the whole year. The year's net pay divides by 12, 26 and 52, each rounded
 * half up to the cent. A resident (scale 2) or foreign resident (scale 3) paid each week, fortnight
 * or month also gets the amount withheld from one pay of the salary less the
 * sacrifice, a 52nd, 26th or 12th of the year's to the cent, and the year's withholding less the
 * year's tax: positive is a refund, negative an amount owing. For 2025-26 every pay takes the study
 * loan component from 24 September 2025; `earlierStudyLoan` is the one paid before then.
 * @param {Pay} pay */
export function takeHomePay(pay) {
  if (!Object.hasOwn(SUPER_GUARANTEE, pay.year)) throw new Error('Choose an income year from 2021-22 to 2026-27.');
  const { rate, cap } = SUPER_GUARANTEE[pay.year];
  if (!Object.hasOwn(PERIODS, pay.period)) throw new Error('Choose a year, month, fortnight or week.');
  for (const [field, question] of [['includesSuper', 'Say whether the salary includes super.'],
    ['studyLoan', 'Say whether you have a study or training loan.'],
    ['hospitalCover', 'Say whether you had private patient hospital cover all year.']]) {
    if (typeof pay[/** @type {keyof Pay} */ (field)] !== 'boolean') throw new Error(question);
  }
  const pays = PERIODS[pay.period];
  const entered = amountCents(pay.salary) * pays;
  // The rate in tenths of a per cent, so 11.5% is 115 of 1,000.
  const tenths = Math.round(rate * 10);
  const capCents = cap * 100;
  let superGuarantee;
  if (pay.datedPay !== undefined) {
    if (pay.includesSuper) throw new Error('Enter dated payments only when super is paid on top.');
    superGuarantee = datedSuperGuarantee(pay.datedPay, pay.year, entered, capCents, tenths);
  } else if (!pay.includesSuper) superGuarantee = nearest(Math.min(entered, capCents) * tenths, 1000);
  else if (entered * 1000 <= capCents * (1000 + tenths)) superGuarantee = nearest(entered * tenths, 1000 + tenths);
  else superGuarantee = nearest(capCents * tenths, 1000);
  const salary = pay.includesSuper ? entered - superGuarantee : entered;
  const sacrifice = amountCents(pay.sacrifice) * pays;
  if (sacrifice > salary) throw new Error('Enter salary sacrifice no more than the salary.');
  const paid = salary - sacrifice;
  const resident = pay.residency === 'resident';
  const deduction = pay.year >= STANDARD_DEDUCTION_FROM && resident ? Math.min(100000, paid) : 0;
  const taxable = Math.floor((paid - deduction) / 100);
  const tax = incomeTax(String(taxable), pay.year, pay.residency);
  const reported = Math.floor(sacrifice / 100);
  const surcharge = resident ? medicareLevySurcharge({ year: pay.year, taxable, fringe: 0, super: reported, losses: 0,
    spouse: null, children: 0, uncoveredDays: pay.hospitalCover ? 0 : daysInYear(pay.year) }).surcharge : 0;
  const loan = pay.studyLoan ? studyLoanRepayment({ taxable: String(taxable), fringe: '0', losses: '0',
    super: String(reported), foreign: '0' }, pay.year).repayment : 0;
  const cents = (/** @type {number} */ value) => Math.round(value * 100);
  const owed = cents(tax.total) + cents(surcharge) + cents(loan);
  const net = paid - owed;
  // Concessional contributions are the super guarantee and the sacrifice (s 291-25); Division 293
  // adds them to income for surcharge purposes less reportable super contributions (s 293-20).
  const concessional = superGuarantee + sacrifice;
  const overCap = Math.max(0, concessional - CONCESSIONAL_CAP[pay.year] * 100);
  const taxableContributions = division293(taxable * 100, concessional);
  let withheld = null;
  if (pay.residency !== 'working-holiday' && pay.period !== 'year') {
    const earnings = nearest(paid, pays);
    const each = withholding(earnings, pay.period, resident ? 2 : 3, pay.studyLoan, pay.year);
    withheld = { ...each, earnings: earnings / 100, afterWithholding: (earnings - each.total * 100) / 100,
      year: each.total * pays, refund: (each.total * pays * 100 - owed) / 100 };
  }
  return { salary: salary / 100, sacrifice: sacrifice / 100, superGuarantee: superGuarantee / 100,
    concessional: concessional / 100, overCap: overCap / 100, division293: taxableContributions / 100,
    deduction: deduction / 100, taxable, tax: tax.tax, offset: tax.offset, lmito: tax.lmito, medicare: tax.medicare,
    surcharge, studyLoan: loan, net: net / 100, monthly: nearest(net, 12) / 100, fortnightly: nearest(net, 26) / 100,
    weekly: nearest(net, 52) / 100, withheld };
}
