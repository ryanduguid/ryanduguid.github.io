// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { number, ratioCents } from './money.mjs';

// GST on one sale of real property under the margin scheme, against GST on the whole price. Read
// 19 November 2026: A New Tax System (Goods and Services Tax) Act 1999 ss 75-5 (eligibility), 75-10
// (the margin by consideration or by an approved valuation), 75-12 (consideration not paid), 75-13
// (sales to associates), 75-14 (improvements left out), 75-15 (subdivided property), 75-20 (no input
// tax credit for the buyer), 75-30 (no tax invoice), 9-90 (rounding) and s 195-1 (long-term lease),
// and GSTR 2006/8 (apportionment, paras 58 to 61; the GST-exclusive price, para 145).

/**
 * @typedef {'freehold' | 'stratum' | 'lease' | 'other'} MarginInterest
 * @typedef {'margin' | 'untaxed' | 'before-2000' | 'full-gst' | 'special'} MarginAcquisition
 * @typedef {{interest: MarginInterest, taxable: boolean, agreed: boolean, acquired: MarginAcquisition,
 *   associate: boolean, method: 'consideration' | 'valuation', price: string, basis: 'inclusive' | 'exclusive',
 *   cost: string, part: string, whole: string}} MarginSchemeInput
 */

/** What was sold, as subsection 75-5(1) and section 195-1 describe it. @type {Record<MarginInterest, string>} */
export const MARGIN_INTERESTS = {
  freehold: 'A freehold interest in land (paragraph 75-5(1)(a))',
  stratum: 'A stratum unit (paragraph 75-5(1)(b))',
  lease: 'A long-term lease of at least 50 years, granted or sold (paragraph 75-5(1)(c) and section 195-1)',
  other: 'Not a freehold interest, a stratum unit or a long-term lease (subsection 75-5(1))',
};

/** How the seller acquired it, for the conditions the calculator decides. @type {Record<MarginAcquisition, string>} */
export const MARGIN_ACQUISITIONS = {
  margin: 'Acquired under the margin scheme',
  untaxed: 'Acquired in a sale that was not taxable',
  'before-2000': 'Acquired, or contracted to acquire, before 1 July 2000 (GSTR 2006/8 paragraph 39A)',
  'full-gst': 'Acquired in a taxable sale with GST on the whole price: ineligible (subsections 75-5(2) and (3))',
  special: 'Acquired in a way section 75-11 or 75-22 provides for',
};

/** Whole cents from dollars and cents, to $1,000,000,000,000. @param {string} value */
const amount = (value) => BigInt(Math.round(number(value, { max: 1e12, money: true }) * 100));
/** An area, a count or a price used only as a proportion, to 2 decimals, in hundredths. @param {string} value */
const measure = (value) => BigInt(Math.round(number(value, { max: 1e12 }) * 100));
/** The larger of `value` and nil. @param {bigint} value */
const nil = (value) => (value > 0n ? value : 0n);

/** The margin scheme's conditions in section 75-5 and the GST on the sale. The cost is the
 * consideration paid for the acquisition (s 75-12), without improvements, duty or fees (s 75-14), or
 * an approved valuation for property held since before 1 July 2000 (s 75-10(3)); for part of the
 * land, only the part's share of it, `part` of `whole` (s 75-15), shown half up to the cent. The margin
 * is the GST-inclusive consideration less that cost, nil if it is not more (s 75-10(2)); the GST is
 * 1/11 of it, worked from the exact share and rounded once, half up to the cent (ss 75-10(1) and
 * 9-90), as the australian-accounting command does. From a GST-exclusive price E, the GST is
 * (E - cost) / 10, so that it is 1/11 of the margin on E plus that GST (GSTR 2006/8 para 145).
 * Without the margin scheme the GST is 1/11 of the GST-inclusive price, or 10% of E.
 * @param {MarginSchemeInput} input */
export function gstMarginScheme(input) {
  if (!input.taxable) {
    throw new Error('The margin scheme works out the GST on a taxable sale (subsection 75-5(1)); a sale that is not '
      + 'taxable, such as one of established residential premises or one that is GST-free, has no GST to work out.');
  }
  if (input.acquired === 'special') {
    throw new Error('Property inherited, acquired within a GST group or joint venture, as a GST-free going concern, '
      + 'farm land or government land, or from an associate, has its own eligibility tests (paragraphs 75-5(3)(b) to (g)) '
      + 'and margins (subsection 75-10(3) item 2A and section 75-11), and property acquired partly in a sale with GST on '
      + 'the whole price has an increasing adjustment (section 75-22): this calculator does not work them out.');
  }
  if (input.associate) {
    throw new Error('On a sale to your associate the consideration is the GST-inclusive market value (section 75-13): '
      + 'this calculator does not work out that value.');
  }
  if (input.method === 'valuation' && input.acquired !== 'before-2000') {
    throw new Error('An approved valuation sets the margin only for property held since before 1 July 2000 '
      + '(subsection 75-10(3)); use the consideration you paid for property acquired later.');
  }
  const [part, whole] = [measure(input.part), measure(input.whole)];
  if (part <= 0n || whole <= 0n) throw new Error('Enter this sale’s part and the whole as more than 0.');
  if (part > whole) throw new Error('This sale’s part cannot be more than the whole it is part of.');
  const price = amount(input.price);
  const cost = amount(input.cost);
  const share = part === whole ? cost : ratioCents(cost * part, whole);
  const conditions = { interest: input.interest !== 'other', agreed: input.agreed, eligible: input.acquired !== 'full-gst' };
  const exclusive = input.basis === 'exclusive';
  const basic = ratioCents(price, exclusive ? 10n : 11n);
  const schemeGst = ratioCents(nil(price * whole - cost * part), (exclusive ? 10n : 11n) * whole);
  const consideration = exclusive ? price + schemeGst : price;
  const applies = conditions.interest && conditions.agreed && conditions.eligible;
  const dollars = (/** @type {bigint} */ value) => Number(value) / 100;
  return { conditions, applies, share: dollars(share), consideration: dollars(consideration),
    margin: dollars(nil(consideration - share)), schemeGst: dollars(schemeGst),
    basicConsideration: dollars(exclusive ? price + basic : price), basicGst: dollars(basic),
    saving: dollars(basic - schemeGst), gst: dollars(applies ? schemeGst : basic) };
}

/** The page's result: its inputs sentence, labelled rows and note.
 * @param {MarginSchemeInput} input @param {(value: number) => string} aud */
export function gstMarginSchemeResult(input, aud) {
  const r = gstMarginScheme(input);
  const valuation = input.method === 'valuation';
  const count = (/** @type {string} */ value) => Number(value).toLocaleString('en-AU');
  const part = input.part === input.whole ? '' : ` for ${count(input.part)} of ${count(input.whole)}`;
  const acquired = MARGIN_ACQUISITIONS[input.acquired];
  const inputs = `${MARGIN_INTERESTS[input.interest]}; agreed in writing: ${input.agreed ? 'yes' : 'no'}; `
    + `${acquired[0].toLowerCase()}${acquired.slice(1)}; price ${aud(Number(input.price))} GST-${input.basis}; `
    + `${valuation ? 'approved valuation' : 'consideration'} ${aud(Number(input.cost))}${part}`;
  const conditions = [[MARGIN_INTERESTS[input.interest], r.conditions.interest ? 'Condition met' : 'Condition not met'],
    ['Agreed in writing with the buyer (subsections 75-5(1) and (1A))', r.conditions.agreed ? 'Condition met' : 'Condition not met'],
    [MARGIN_ACQUISITIONS[input.acquired], r.conditions.eligible ? 'Condition met' : 'Condition not met']];
  if (!r.applies) {
    return { inputs, rows: [['Consideration for the sale, GST-inclusive', aud(r.basicConsideration)], ...conditions,
      ['The margin scheme', 'Cannot apply: GST is worked out on the whole price'],
      ['GST on the sale, 1/11 of the GST-inclusive price', aud(r.gst)]], principal: conditions.length + 2,
    note: 'Without the margin scheme a buyer whose purchase is a creditable acquisition (section 11-5: for a creditable '
      + 'purpose, for consideration and registered or required to be registered) can claim an input tax credit for the GST' };
  }
  // The sale's price leads, so the first row of every example is an amount.
  return { inputs, rows: [['Consideration for the sale, GST-inclusive', aud(r.consideration)], ...conditions,
    ['The margin scheme', 'Can apply: section 75-5 is met'],
    [`${valuation ? 'Approved valuation' : 'Consideration for the acquisition'}${part ? ', this part’s share (section 75-15)' : ''}`,
      aud(r.share)],
    [`Margin (subsection 75-10(${valuation ? '3' : '2'}))`, aud(r.margin)],
    ['GST under the margin scheme, 1/11 of the margin', aud(r.schemeGst)],
    ['GST without the margin scheme, 1/11 of the GST-inclusive price', aud(r.basicGst)],
    ['GST the margin scheme saves', aud(r.saving)]], principal: conditions.length + 4,
  note: 'The buyer cannot claim an input tax credit (section 75-20) and needs no tax invoice (section 75-30)' };
}
