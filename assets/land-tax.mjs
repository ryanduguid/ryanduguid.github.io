// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { number, cents, ratioCents } from './money.mjs';

const LAND_TAX_RULES = ['excess', 'excess-rounded-up-to-100'];

/** Tax in cents on one whole-dollar value from one scale, written as a jurisdiction's radio holds
 * it: from,base,rate,over,rule for each band, lowest first, separated by semicolons. A band covers
 * the values from its `from` up to the next band's `from`, so a band that starts at a threshold
 * applies at that value. Its rule says how the rate applies above `over`:
 * excess: base plus the rate per cent of the value over `over`;
 * excess-rounded-up-to-100: base plus the rate in dollars for every $100, or part of $100, over `over`.
 * `fixed` is a charge added at every value, as the ACT adds its fixed charge to the valuation
 * charge. A fraction of a cent rounds half up.
 * @param {number} dollars @param {string | undefined} text @param {string} [fixed] */
export function landTaxCents(dollars, text, fixed = '0') {
  const scale = (text ?? '').split(';').map((row) => row.split(','));
  const whole = (/** @type {string} */ value) => /^\d+$/.test(value);
  const usable = scale.every((row, index) => {
    const [from, base, rate, over, rule] = row;
    return row.length === 5 && LAND_TAX_RULES.includes(rule) && whole(from) && whole(over) && Number(over) <= Number(from)
      && /^\d+(\.\d{1,2})?$/.test(base) && Number(base) <= 1e9 && /^\d+(\.\d{1,4})?$/.test(rate) && Number(rate) <= 100
      && (index ? Number(from) > Number(scale[index - 1][0]) : from === '0');
  });
  if (!usable) throw new Error('This jurisdiction’s rate table is not usable.');
  const band = scale[scale.filter(([from]) => dollars >= Number(from)).length - 1];
  const [, base, rate, over, rule] = band;
  const excess = BigInt(dollars) - BigInt(over);
  // A rate has at most 4 decimal places, as Victoria's trust rate of 1.1072% does: ten-thousandths
  // of 1%, or of a dollar for every $100.
  const parts = BigInt(Math.round(number(rate, { max: 100, places: 4 }) * 10000));
  const charges = BigInt(cents(base) + cents(fixed));
  const amount = rule === 'excess' ? charges + ratioCents(parts * excess, 10000n)
    : charges + ratioCents((excess + 99n) / 100n * parts, 100n);
  return { amount, band };
}

/** Land tax for a full year on one total taxable land value, with a foreign or absentee owner's
 * surcharge and Western Australia's metropolitan region improvement tax (MRIT) where chosen.
 * `place` is the chosen jurisdiction's radio data: its `name`, general `scale` and `fixed` charge,
 * and where the jurisdiction has them: `trustScale`; `absenteeScale`, the scale a foreign or
 * absentee owner pays instead of the general one (Queensland's absentee rates); `surcharge` and
 * `trustSurcharge`, the surcharge scale for a foreign or absentee owner at the general and trust
 * rates; `surchargeBase` 'separate' where the surcharge applies to a value the owner enters apart
 * from the taxable land value; and `mrit`, the MRIT scale.
 * @param {string} value the total taxable land value in whole dollars
 * @param {Readonly<Record<string, string | undefined>>} place
 * @param {{ trust?: boolean, foreign?: boolean, surchargeValue?: string, metro?: boolean }} [choices]
 *   trust rates, a foreign or absentee owner, the value a separate surcharge applies to, and land
 *   that is all in the Perth metropolitan region */
export function landTaxYear(value, place, { trust = false, foreign = false, surchargeValue = '', metro = false } = {}) {
  const whole = { max: 1e9, integer: true, money: true };
  const dollars = number(value, whole);
  if (![trust, foreign, metro].every((flag) => typeof flag === 'boolean')) {
    throw new Error('Trust rates, a foreign or absentee owner and the metropolitan region must each be true or false.');
  }
  if (trust && !place.trustScale) throw new Error(`This calculator has no trust rates for ${place.name}.`);
  if (foreign && !place.surcharge) throw new Error(`This calculator has no foreign or absentee owner rates for ${place.name}.`);
  if (metro && !place.mrit) throw new Error('The metropolitan region improvement tax applies only in Western Australia.');
  const land = landTaxCents(dollars, trust ? place.trustScale : (foreign && place.absenteeScale) || place.scale, place.fixed);
  let surcharge = 0n;
  if (foreign) {
    let base = dollars;
    if (place.surchargeBase === 'separate') {
      try {
        base = number(surchargeValue, whole);
      } catch {
        throw new Error('Enter the surcharge value as a whole number between 0 and 1000000000.');
      }
    }
    surcharge = landTaxCents(base, (trust && place.trustSurcharge) || place.surcharge).amount;
  }
  const mrit = metro ? landTaxCents(dollars, place.mrit).amount : 0n;
  return { tax: Number(land.amount) / 100, band: land.band, surcharge: Number(surcharge) / 100, mrit: Number(mrit) / 100,
    total: Number(land.amount + surcharge + mrit) / 100 };
}
