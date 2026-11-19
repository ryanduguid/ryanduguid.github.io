// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// The income measures that the Medicare levy surcharge, Division 293 tax, the seniors and pensioners
// tax offset, study and training loan repayments, the dependant offsets and the super co-contribution
// test, for one person resident all year, from the amounts on the tax return in whole dollars. Read
// 19 November 2026: ITAA 1997 s 995-1 and s 293-20 (Compilation No. 268, 1 October 2026), ITAA 1936
// s 6(1), HESA s 154-5, FBTAA s 135Q, the Superannuation (Government Co-contribution for Low Income
// Earners) Act 2003 s 8 and the A New Tax System (Family Assistance) Act 1999 Sch 3 cls 2 to 8
// (Compilation No. 124, 1 July 2026). The definitions read the same for 2024-25 to 2026-27.

/** The amounts each measure is built from, in the order the page asks for them. */
export const INCOME_TEST_PARTS = /** @type {const} */ (['taxable', 'fhss', 'familyTrust', 'fringe57a', 'fringeOther',
  'employerSuper', 'personalSuper', 'excessConcessional', 'financialLoss', 'rentalLoss', 'pensions', 'targetForeign',
  'exemptForeign', 'childSupport', 'assessable', 'businessDeductions']);

/** @typedef {Record<typeof INCOME_TEST_PARTS[number], string> & {resident: boolean}} IncomeTestParts */

/** A part that is included in another, and why, so a part larger than its whole is refused. */
const PARTS_OF = /** @type {const} */ ([
  ['taxable', 'assessable', 'Taxable income cannot exceed assessable income: it is assessable income less deductions.'],
  ['fhss', 'assessable', 'The assessable FHSS released amount cannot exceed assessable income, which includes it.'],
  ['excessConcessional', 'assessable', 'Excess concessional contributions cannot exceed assessable income, which includes them.'],
  ['exemptForeign', 'targetForeign', 'Exempt foreign employment income cannot exceed target foreign income, which includes it.'],
]);

/** Whole dollars from 0 to $1 billion, as the return's labels take them. @param {string} value */
function dollars(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d+$/.test(text)) throw new Error('Enter each amount in whole dollars, 0 if none.');
  const amount = Number(text);
  if (amount > 1e9) throw new Error('Enter a whole number between 0 and 1000000000.');
  return amount;
}

/**
 * The 6 income measures and the amounts they share, in whole dollars.
 * @param {IncomeTestParts} parts
 */
export function incomeTests(parts) {
  // The measures were checked for a person resident all year only: a foreign resident pays no Medicare levy or
  // surcharge (ITAA 1936 s 251S(1)(a)) and repays a study loan on worldwide income (HESA ss 154-16 and 154-17).
  if (typeof parts?.resident !== 'boolean') throw new Error('Say whether the person was an Australian resident all year.');
  if (!parts.resident) throw new Error('This calculator works the measures only for a person resident in Australia for the whole year.');
  const p = /** @type {Record<string, number>} */ ({});
  for (const name of INCOME_TEST_PARTS) p[name] = dollars(parts?.[name]);
  for (const [part, whole, message] of PARTS_OF) if (p[part] > p[whole]) throw new Error(message);
  // Each measure disregards the assessable FHSS released amount (ITAA 1997 s 313-20); no taxable income is left
  // where it is more (s 4-15(1)).
  const taxable = Math.max(0, p.taxable - p.fhss);
  // FBTAA s 135N: reportable fringe benefits amounts from section 57A employers and others.
  const fringe = p.fringe57a + p.fringeOther;
  // Family Assistance Act Sch 3 cl 4: a section 57A employer's amounts before FBTAA s 135Q(4) grossed them up at
  // 1 / (1 - 47%), so times 0.53, rounded down to the dollar as the ATO's 2026 rebate income worksheet does.
  const adjustedFringe = Math.floor((p.fringe57a * 53) / 100) + p.fringeOther;
  const losses = p.financialLoss + p.rentalLoss;
  // ITAA 1997 s 995-1 'reportable superannuation contributions': reduced, but not below zero, by excess
  // concessional contributions.
  const contributions = Math.max(0, p.employerSuper + p.personalSuper - p.excessConcessional);
  // s 995-1 (a) to (d), (a) disregarding ITAA 1936 Sch 2F s 271-105(1); the s 301-20(3) amount is nil from
  // 2024-25, as nobody under 60 has reached preservation age.
  const surcharge = taxable + p.familyTrust + fringe + contributions + losses;
  // Superannuation (Government Co-contribution for Low Income Earners) Act 2003 s 8(1A).
  const coEmployer = Math.max(0, p.employerSuper - p.excessConcessional);
  return {
    taxableWithoutFhss: taxable, fringeTotal: fringe, adjustedFringe, losses, contributions,
    surchargeIncome: surcharge,
    // ITAA 1997 s 293-20(1)(a): disregarding reportable superannuation contributions.
    division293Income: surcharge - contributions,
    // ITAA 1936 s 6(1) 'rebate income' (a) to (d).
    rebateIncome: taxable + contributions + losses + adjustedFringe,
    // HESA s 154-5(1) (a) to (e).
    repaymentIncome: taxable + losses + fringe + p.exemptForeign + contributions,
    // Family Assistance Act Sch 3 cl 2(1), disregarding cls 3 and 3A, less deductible child maintenance
    // expenditure (cl 8); it sets no floor.
    adjustedTaxableIncome: taxable + adjustedFringe + p.targetForeign + losses + p.pensions + contributions - p.childSupport,
    coEmployer,
    // Co-contribution Act s 8(1) and (2).
    coContributionIncome: p.assessable - p.fhss + fringe + coEmployer - p.businessDeductions,
    // ITAA 1997 s 995-1 does not add exempt foreign employment income to income for surcharge purposes, though the
    // ATO's surcharge page adds it where taxable income is $1 or more.
    exemptForeignDiffers: p.exemptForeign > 0 && p.taxable > 0,
  };
}
