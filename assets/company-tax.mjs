// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { number, ratioCents, ratioPercent } from './money.mjs';

// A company's tax rate and tax, its corporate tax rate for imputation purposes, the maximum
// franking credit on a dividend, and an individual shareholder's tax on it. Read 18 November 2026:
// the Income Tax Rates Act 1986 ss 23(2), 23AA and 23AB (Compilation No. 66, 1 July 2026); the
// Income Tax Assessment Act 1997 s 995-1 (the corporate tax rate for imputation purposes and the
// corporate tax gross-up rate), ss 202-60 and 202-65, ss 207-20 and 67-25.

/**
 * @typedef {{turnover: string, assessable: string, passive: string}} CompanyYear one income year's
 *   aggregated turnover, assessable income and base rate entity passive income
 * @typedef {CompanyYear & {taxable: string, existed: boolean, prior: CompanyYear, dividend: string,
 *   franking: string, marginal: string}} CompanyTaxInput
 * @typedef {{threshold: string, passiveLimit: string, baseRate: string, rate: string}} CompanyTaxLaw
 * @typedef {'base-rate' | 'turnover' | 'passive' | 'both' | 'new'} CompanyRateReason
 */

/** The law for 2021-22 and later years: aggregated turnover under $50 million and no more than 80%
 * passive income for the 25% rate, and 30% otherwise (Rates Act ss 23(2) and 23AA).
 * @type {CompanyTaxLaw} */
export const COMPANY_TAX_LAW = { threshold: '50000000', passiveLimit: '80', baseRate: '25', rate: '30' };

/** Why a rate applies, as the page states it. @type {Record<CompanyRateReason, string>} */
export const COMPANY_RATE_REASON = {
  'base-rate': 'A base rate entity (section 23AA)',
  turnover: 'Not a base rate entity: aggregated turnover is not under the threshold (paragraph 23AA(b))',
  passive: 'Not a base rate entity: base rate entity passive income is over 80% of assessable income (paragraph 23AA(a))',
  both: 'Not a base rate entity: turnover is not under the threshold and passive income is over 80% (section 23AA)',
  new: 'The company did not exist in the previous income year (paragraph (b) of the definition in section 995-1)',
};

/** Whole cents from dollars and cents, to $1,000,000,000,000. @param {string} value */
const amount = (value) => BigInt(Math.round(number(value, { max: 1e12, money: true }) * 100));
/** A rate per cent to 2 decimal places, in hundredths of 1%. @param {string} value */
const hundredths = (value) => BigInt(Math.round(number(value, { max: 100 }) * 100));

/** Whether a company is a base rate entity for a year (Rates Act s 23AA): no more than 80% of its
 * assessable income is base rate entity passive income, and its aggregated turnover is less than
 * the threshold. @param {CompanyYear} year @param {CompanyTaxLaw} law @returns {{reason: CompanyRateReason, share: number | null}} */
function baseRateTest(year, law) {
  const [turnover, assessable, passive] = [amount(year.turnover), amount(year.assessable), amount(year.passive)];
  if (passive > assessable) throw new Error('Base rate entity passive income cannot be more than assessable income.');
  const passiveOk = passive * 10000n <= hundredths(law.passiveLimit) * assessable;
  const turnoverOk = turnover < amount(law.threshold);
  const share = assessable ? ratioPercent(Number(passive), Number(assessable)) : null;
  if (passiveOk && turnoverOk) return { reason: 'base-rate', share };
  return { reason: passiveOk ? 'turnover' : turnoverOk ? 'passive' : 'both', share };
}

/** A company's tax for one income year from 2021-22, its corporate tax rate for imputation
 * purposes for that year, the maximum franking credit on a frankable distribution (s 202-60), the
 * credit at the franking percentage chosen, and an Australian resident individual shareholder's tax
 * on the grossed-up dividend less the franking tax offset (ss 207-20 and 67-25): positive is tax
 * to pay, negative a refund. The tax rounds half up to the cent; a franking credit rounds down,
 * so a stated credit never exceeds the maximum (s 202-65).
 * @param {CompanyTaxInput} input @param {CompanyTaxLaw} [law] */
export function companyTax(input, law = COMPANY_TAX_LAW) {
  if (typeof input.existed !== 'boolean') throw new Error('Say whether the company existed in the previous income year.');
  const year = baseRateTest(input, law);
  const rate = hundredths(year.reason === 'base-rate' ? law.baseRate : law.rate);
  const imputation = input.existed ? baseRateTest(input.prior, law) : { reason: /** @type {CompanyRateReason} */ ('new'), share: null };
  const imputationRate = hundredths(imputation.reason === 'base-rate' || imputation.reason === 'new' ? law.baseRate : law.rate);
  const taxable = amount(input.taxable);
  const dividend = amount(input.dividend);
  const franking = hundredths(input.franking);
  // Section 202-60(2): the distribution times 1 over the gross-up rate, (100% - rate) / rate.
  const maximum = dividend * imputationRate / (10000n - imputationRate);
  const credit = dividend * imputationRate * franking / ((10000n - imputationRate) * 10000n);
  const grossedUp = dividend + credit;
  const shareholderTax = ratioCents(grossedUp * hundredths(input.marginal), 10000n);
  return { entity: year.reason, passiveShare: year.share, rate: Number(rate) / 100,
    tax: Number(ratioCents(taxable * rate, 10000n)) / 100, imputation: imputation.reason,
    imputationRate: Number(imputationRate) / 100, maximum: Number(maximum) / 100, credit: Number(credit) / 100,
    grossedUp: Number(grossedUp) / 100, shareholderTax: Number(shareholderTax) / 100,
    net: Number(shareholderTax - credit) / 100 };
}

/** The page's result: its inputs sentence, labelled rows and note.
 * @param {CompanyTaxInput} input @param {(value: number) => string} aud */
export function companyTaxResult(input, aud) {
  const r = companyTax(input);
  const money = (/** @type {string} */ text) => aud(Number(text));
  const year = (/** @type {CompanyYear} */ y) => `aggregated turnover ${money(y.turnover)}, assessable income `
    + `${money(y.assessable)}, base rate entity passive income ${money(y.passive)}`;
  const share = r.passiveShare === null ? '' : `, with passive income ${r.passiveShare.toFixed(2)}% of assessable income`;
  return { inputs: `this year ${year(input)}, taxable income ${money(input.taxable)}; previous year `
    + `${input.existed ? year(input.prior) : 'the company did not exist'}; dividend ${money(input.dividend)} franked at `
    + `${input.franking}%, shareholder’s marginal rate ${input.marginal}%`,
  rows: [[`Company tax rate: ${r.rate}%`, `${COMPANY_RATE_REASON[r.entity]}${share}`], ['Tax on taxable income', aud(r.tax)],
    [`Corporate tax rate for imputation purposes: ${r.imputationRate}%`, COMPANY_RATE_REASON[r.imputation]],
    ['Maximum franking credit on the dividend', aud(r.maximum)], [`Franking credit at ${input.franking}%`, aud(r.credit)],
    ['Grossed-up dividend in the shareholder’s assessable income', aud(r.grossedUp)],
    [`Shareholder’s tax at ${input.marginal}% on it`, aud(r.shareholderTax)], ['Franking tax offset', aud(r.credit)],
    [r.net < 0 ? 'Refund of excess franking credits' : 'Tax left to pay on the dividend', aud(Math.abs(r.net))]],
  principal: 1, note: 'Franking credits round down to the cent, so the credit stated never exceeds the maximum (section 202-65)' };
}
