// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { number, cents, ratioCents } from './money.mjs';

// Division 296 tax for 2026-27: ITAA 1997 ss 296-15 to 296-50 (compilation 268, 1 October
// 2026), the Income Tax (Transitional Provisions) Act 1997 s 296-1 (compilation 104) and the
// Superannuation (Building a Stronger and Fairer Super System) Imposition Act 2026 s 5, all read
// 17 November 2026. The thresholds and rates belong to the caller, as the form gives them.

/**
 * @typedef {{balance: string, earnings: string, child: boolean, settlement: boolean, died: boolean}} Division296Member
 * @typedef {{largeThreshold: string, veryLargeThreshold: string, rate: string, veryLargeRate: string}} Division296Year
 * @typedef {'liable' | 'rounds-to-nil' | 'child' | 'settlement' | 'died' | 'not-above' | 'no-earnings'} Division296Liability
 */

/** The share of `balance` above `threshold`, in hundredths of 1%, rounded to 2 decimal places
 * with a third decimal place of 5 or more rounding up (ss 296-40(3) and 296-45(3)); nil when the
 * balance is not greater than the threshold. Both are in cents.
 * @param {bigint} balance @param {bigint} threshold */
const shareAbove = (balance, threshold) => (balance > threshold ? ratioCents((balance - threshold) * 10000n, balance) : 0n);

/** Exact hundredths of a cent, signed, rounded half up to the cent for display.
 * @param {bigint} value @param {bigint} scale */
const shown = (value, scale) => Number(value < 0n ? -ratioCents(-value, scale) : ratioCents(value, scale)) / 100;

/** Why the tax is what it is, as the page states it. @type {Record<Division296Liability, string>} */
export const DIVISION_296_LIABILITY = {
  liable: 'Liable under section 296-15: the balance at 30 June 2027 is above the large superannuation balance threshold and total superannuation earnings are above nil',
  'rounds-to-nil': 'Liable under section 296-15, but the share above the large superannuation balance threshold rounds to 0.00% under subsection 296-40(3), so the tax is nil',
  child: 'Not liable: a child recipient of a superannuation income stream in the year (section 296-20)',
  settlement: 'Not liable: a structured settlement contribution was made for this person in 2026-27 or an earlier year (section 296-25)',
  died: 'Not liable: died on or before 30 June 2027 (subsection 296-1(3) of the Income Tax (Transitional Provisions) Act 1997)',
  'not-above': 'Not liable: the balance at 30 June 2027 is not above the large superannuation balance threshold (subsection 296-40(1))',
  'no-earnings': 'Not liable: total superannuation earnings are not above nil (subsection 296-40(1))',
};

/** Why the member is or is not liable, in the order the exceptions and conditions apply.
 * @param {Division296Member} member @param {bigint} reference @param {bigint} largeThreshold
 * @param {bigint} earnings @param {bigint} percentage @returns {Division296Liability} */
function liabilityOf(member, reference, largeThreshold, earnings, percentage) {
  if (member.child) return 'child';
  if (member.settlement) return 'settlement';
  if (member.died) return 'died';
  if (reference <= largeThreshold) return 'not-above';
  if (earnings <= 0n) return 'no-earnings';
  return percentage === 0n ? 'rounds-to-nil' : 'liable';
}

/** A rate in per cent, to 2 decimal places, in hundredths of 1%. @param {string} rate */
const hundredths = (rate) => BigInt(Math.round(number(rate, { max: 100 }) * 100));

/** One individual's Division 296 tax for 2026-27. For that year only the total superannuation
 * balance at the end of the year counts (ITTPA s 296-1(2)), and it is nil after death
 * (s 296-50). Taxable superannuation earnings are the earnings times the share above the large
 * threshold, when that balance is greater than the threshold and the earnings greater than nil
 * (s 296-40); the very large component is the earnings times the share above the very large
 * threshold (s 296-45), which has no 'greater than nil' condition, so it is negative when the
 * earnings are and is then returned as null. Sections 296-20 and 296-25 and ITTPA s 296-1(3)
 * remove the liability, not the earnings. The tax is 15% of the first plus 10% of the second
 * (Imposition Act s 5). Amounts stay exact until each rounds half up to the cent.
 * @param {Division296Member} member @param {Division296Year} year */
export function division296(member, year) {
  const balance = BigInt(cents(member.balance));
  const earnings = BigInt(cents(member.earnings, -1e9));
  for (const flag of [member.child, member.settlement, member.died]) {
    if (typeof flag !== 'boolean') throw new Error('Answer each question about the exceptions.');
  }
  const reference = member.died ? 0n : balance;
  const largeThreshold = BigInt(cents(year.largeThreshold));
  const percentage = shareAbove(reference, largeThreshold);
  const veryLargePercentage = shareAbove(reference, BigInt(cents(year.veryLargeThreshold)));
  const liability = liabilityOf(member, reference, largeThreshold, earnings, percentage);
  // Earnings in cents times a share in hundredths of 1% are hundredths of a cent times 100.
  const taxable = earnings > 0n ? earnings * percentage : 0n;
  const component = earnings * veryLargePercentage;
  const liable = liability === 'liable' || liability === 'rounds-to-nil';
  const tax = liable ? taxable * hundredths(year.rate) : 0n;
  const veryLargeTax = liable && component > 0n ? component * hundredths(year.veryLargeRate) : 0n;
  return { liability, percentage: Number(percentage) / 100, veryLargePercentage: Number(veryLargePercentage) / 100,
    taxable: shown(taxable, 10000n), component: component < 0n ? null : shown(component, 10000n),
    tax: shown(tax, 100000000n), veryLargeTax: shown(veryLargeTax, 100000000n),
    total: shown(tax + veryLargeTax, 100000000n) };
}


/** The page's result for one member: its inputs sentence, labelled rows and the liability note.
 * @param {Division296Member} member @param {Division296Year} year @param {(value: number) => string} aud */
export function division296Result(member, year, aud) {
  const r = division296(member, year);
  const money = (/** @type {string} */ text) => aud(Number(text));
  const exceptions = [member.child && 'a child recipient of a superannuation income stream in the year',
    member.settlement && 'a structured settlement contribution made in 2026-27 or earlier', member.died && 'died by 30 June 2027']
    .filter(Boolean);
  return { inputs: `total superannuation balance ${money(member.balance)} at 30 June 2027, total superannuation earnings `
    + `${money(member.earnings)} for 2026-27, ${exceptions.length ? exceptions.join(', ') : 'no exception applies'}`,
  rows: [[`Share of the balance above ${money(year.largeThreshold)}`, `${r.percentage.toFixed(2)}%`],
    [`Share of the balance above ${money(year.veryLargeThreshold)}`, `${r.veryLargePercentage.toFixed(2)}%`],
    ['Taxable superannuation earnings', aud(r.taxable)],
    ['Very large superannuation balance earnings component', r.component === null ? 'None: the earnings are negative' : aud(r.component)],
    [`Tax at ${year.rate}% on taxable superannuation earnings`, aud(r.tax)],
    [`Tax at ${year.veryLargeRate}% on the very large component`, aud(r.veryLargeTax)], ['Division 296 tax', aud(r.total)]],
  principal: 6, note: DIVISION_296_LIABILITY[r.liability] };
}
