// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { number, cents, ratioCents } from './money.mjs';

const LAND_TAX_RULES = ['excess', 'excess-rounded-up-to-100'];
const PAYABLE_RULES = ['nil-below-20', 'ten-cents'];

/** Exact tax as a rational number of cents (`num / den`), together with the matched band, from one
 * scale written as a jurisdiction's radio holds it: from,base,rate,over,rule for each band, lowest
 * first, separated by semicolons.
 * @param {number} dollars @param {string | undefined} text @param {string} [fixed] */
function landTaxExact(dollars, text, fixed = '0') {
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
  if (rule === 'excess') return { num: charges * 10000n + parts * excess, den: 10000n, band };
  return { num: charges * 100n + (excess + 99n) / 100n * parts, den: 100n, band };
}

/** Land Tax Rating Act 2000 (Tas) s 7: cents not divisible by 10 round up to the next 10 cents if
 * more than 5 cents remain, otherwise down.
 * @param {bigint} num @param {bigint} den */
function tenCents(num, den) {
  const ten = 10n * den;
  const rest = num % ten;
  const kept = (num - rest) / den;
  return rest > 5n * den ? kept + 10n : kept;
}

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
  const { num, den, band } = landTaxExact(dollars, text, fixed);
  return { amount: ratioCents(num, den), band };
}

/** Land tax for a full year on one total taxable land value, with a foreign or absentee owner's
 * surcharge and Western Australia's metropolitan region improvement tax (MRIT) where chosen.
 * `place` is the chosen jurisdiction's radio data: its `name`, general `scale` and `fixed` charge,
 * and where the jurisdiction has them: `trustScale`; `absenteeScale`, the scale a foreign or
 * absentee owner pays instead of the general one (Queensland's absentee rates); `surcharge`, the
 * surcharge scale for a foreign or absentee owner; `absenteeTrust` ('unsupported' for Victoria,
 * where s 46IA apportions by absentee beneficiaries' interests); `payable` ('nil-below-20' for
 * South Australia's s 6 minimum or 'ten-cents' for Tasmania's s 7 rounding); `surchargeBase`
 * 'separate' where the surcharge applies to a value the owner enters apart from the taxable land
 * value; and `mrit`, the MRIT scale.
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
  if (place.payable !== undefined && !PAYABLE_RULES.includes(place.payable)) {
    throw new Error('This jurisdiction’s rate table is not usable.');
  }
  if (trust && !place.trustScale) throw new Error(`This calculator has no trust rates for ${place.name}.`);
  if (trust && foreign && place.absenteeTrust === 'unsupported') {
    throw new Error('A Victorian absentee trust’s surcharge turns on its absentee beneficiaries’ interests (section 46IA of the Land Tax Act 2005 (Vic)), which this calculator does not take.');
  }
  if (foreign && !place.surcharge) throw new Error(`This calculator has no foreign or absentee owner rates for ${place.name}.`);
  if (metro && !place.mrit) throw new Error('The metropolitan region improvement tax applies only in Western Australia.');
  const landExact = landTaxExact(dollars, trust ? place.trustScale : (foreign && place.absenteeScale) || place.scale, place.fixed ?? '0');
  let landAmount = place.payable === 'ten-cents' ? tenCents(landExact.num, landExact.den) : ratioCents(landExact.num, landExact.den);
  if (place.payable === 'nil-below-20' && landAmount < 2000n) landAmount = 0n;
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
    if (place.payable === 'ten-cents' && base > dollars) {
      throw new Error('Surcharge value cannot exceed the taxable land value in Tasmania: the foreign investor land tax applies to residential general land, part of the owner’s taxable land.');
    }
    const surchargeExact = landTaxExact(base, place.surcharge);
    if (place.payable === 'ten-cents') {
      surcharge = tenCents(surchargeExact.num, surchargeExact.den);
      const together = tenCents(landExact.num * surchargeExact.den + surchargeExact.num * landExact.den, landExact.den * surchargeExact.den);
      if (landAmount + surcharge !== together) {
        throw new Error('Rounding the land tax and the foreign investor land tax to 10 cents each gives a different total from rounding their sum; which section 7 of the Land Tax Rating Act 2000 (Tas) requires is unsettled.');
      }
    } else {
      surcharge = ratioCents(surchargeExact.num, surchargeExact.den);
    }
  }
  const mrit = metro ? landTaxCents(dollars, place.mrit).amount : 0n;
  return { tax: Number(landAmount) / 100, band: landExact.band, surcharge: Number(surcharge) / 100, mrit: Number(mrit) / 100,
    total: Number(landAmount + surcharge + mrit) / 100 };
}
