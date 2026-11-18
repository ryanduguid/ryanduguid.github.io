// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { number, ratioCents } from './money.mjs';
import { landTaxCents } from './land-tax.mjs';

// Foreign purchaser duty surcharges and foreign owner land tax surcharges, with each jurisdiction's
// test of who is foreign for each. Each revenue office's own pages, read 18 November 2026, are listed
// in the page's sources: Revenue NSW (surcharge purchaser duty, surcharge land tax and Revenue Ruling
// G009), the State Revenue Office Victoria (foreign purchaser additional duty and the absentee owner
// surcharge), the Queensland Revenue Office (additional foreign acquirer duty and the land tax foreign
// surcharge), the Western Australian Department of Treasury and Finance (foreign transfer duty fact
// sheet of 22 October 2026), RevenueSA (foreign ownership surcharge), the State Revenue Office
// Tasmania (foreign investor duty surcharge and land tax surcharge guidelines) and the ACT Revenue
// Office (foreign ownership surcharge for land tax). The ACT's duty determination DI2026-155 and the
// Northern Territory's Stamp Duty Act 1978 set no foreign purchaser duty, and the Territory has no
// land tax. Each land tax surcharge scale is the land tax calculator's, in its form (from, base,
// rate, over, rule for each band); scripts/business-calculators.test.mjs binds the two.

/**
 * @typedef {'citizen' | 'permanent' | 'nz' | 'other' | 'partner'} ResidencyStatus an Australian
 *   citizen; a permanent visa holder; a New Zealand citizen on a special category visa; anyone else;
 *   a partner (provisional) or retirement visa holder, whose status this page does not decide
 * @typedef {'individual' | 'company' | 'trust' | 'discretionary' | 'smsf'} BuyerType
 * @typedef {{type: BuyerType, status: ResidencyStatus, daysBefore: string, daysDecember: string,
 *   nzResident: boolean, resides: boolean, absent: boolean, home: boolean, overseas: boolean, largest: string,
 *   combined: string, absentee: string, capital: string, amendable: boolean, control: boolean, named: boolean, defaults: string,
 *   exemption: boolean}} ForeignBuyer
 * @typedef {'residential' | 'primary' | 'other'} PropertyUse
 * @typedef {{place: string, use: PropertyUse, value: string, share: string, land: string}} ForeignPurchase the
 *   jurisdiction, the property's use, its dutiable value and that of the buyer's share, in whole dollars,
 *   and the taxable land value the land tax surcharge applies to
 * @typedef {{foreign: boolean, why: string}} Verdict
 * @typedef {{name: string, duty?: string, primary?: string, land?: string, trustLand?: string,
 *   landOn?: 'residential' | 'all'}} SurchargeLaw
 */

/** @type {Record<string, SurchargeLaw>} */
export const FOREIGN_SURCHARGES = {
  'AU-NSW': { name: 'New South Wales', duty: '9', land: '0,0,5,0,excess', landOn: 'residential' },
  'AU-VIC': { name: 'Victoria', duty: '8', land: '0,0,0,0,excess;50000,0,4,0,excess',
    trustLand: '0,0,0,0,excess;25000,0,4,0,excess', landOn: 'all' },
  'AU-QLD': { name: 'Queensland', duty: '8', land: '0,0,0,0,excess;350000,0,3,350000,excess', landOn: 'all' },
  'AU-WA': { name: 'Western Australia', duty: '7' },
  'AU-SA': { name: 'South Australia', duty: '7' },
  'AU-TAS': { name: 'Tasmania', duty: '8', primary: '1.5', land: '0,0,2,0,excess', landOn: 'residential' },
  'AU-ACT': { name: 'Australian Capital Territory', land: '0,0,0.75,0,excess', landOn: 'residential' },
  'AU-NT': { name: 'Northern Territory' },
};

/** A share or rate per cent to 2 decimal places, in hundredths of 1%. @param {string} value */
const hundredths = (value) => BigInt(Math.round(number(value, { max: 100 }) * 100));
/** @param {boolean} foreign @param {string} why @returns {Verdict} */
const verdict = (foreign, why) => ({ foreign, why: `${foreign ? 'Foreign' : 'Not foreign'}: ${why}` });
/** A share test: `held` hundredths of 1% against `limit` per cent, at or over, or over. */
const atLeast = (/** @type {bigint} */ held, /** @type {number} */ limit) => held >= BigInt(limit * 100);
const over = (/** @type {bigint} */ held, /** @type {number} */ limit) => held > BigInt(limit * 100);

/** The common test of an individual: an Australian citizen, a permanent visa holder or a New Zealand
 * citizen on a special category visa is not foreign; anyone else is. @param {ForeignBuyer} b */
const visaTest = (b) => (b.status === 'other'
  ? verdict(true, 'not an Australian citizen, a permanent visa holder or a New Zealand citizen on a special category visa')
  : verdict(false, 'an Australian citizen, a permanent visa holder or a New Zealand citizen on a special category visa'));

/** The absentee tests of Victoria and Queensland land tax: a non-citizen without a permanent visa
 * who does not ordinarily reside in Australia and was away on the day or for over 6 months of the year
 * before. @param {ForeignBuyer} b @param {string} when */
const absenteeTest = (b, when) => {
  const absentee = (/** @type {boolean} */ is, /** @type {string} */ why) => ({ foreign: is, why: `${is ? 'Absentee' : 'Not an absentee'}: ${why}` });
  if (b.status === 'citizen' || b.status === 'permanent') return absentee(false, 'an Australian citizen or permanent visa holder');
  if (b.resides) return absentee(false, 'ordinarily resides in Australia');
  return absentee(b.absent, `does not ordinarily reside in Australia and ${b.absent ? 'was' : 'was not'} away ${when}`);
};

/** New South Wales: a foreign person under the FATA as section 104J of the Duties Act 1997 modifies
 * it (Revenue Ruling G009): an individual not ordinarily resident, a 20% substantial interest of one
 * foreign person with associates or a 40% aggregate interest, and for a discretionary trust any
 * potential foreign beneficiary or a deed that could be amended to admit one (section 104JA).
 * @param {ForeignBuyer} b @param {string} days @param {string} when */
function nswTest(b, days, when) {
  if (b.type === 'individual') {
    if (b.status === 'citizen') return verdict(false, 'an Australian citizen is never a foreign person (section 104J)');
    if (b.status === 'other') return verdict(true, 'a temporary or bridging visa holder, or a non-citizen with no visa (G009)');
    const present = number(days, { max: 366, integer: true }) >= 200;
    return verdict(!present, `a permanent visa holder or New Zealand citizen on a special category visa, in Australia `
      + `${present ? '200 days or more' : 'fewer than 200 days'} of the 12 months before ${when} (G009)`);
  }
  if (b.type === 'discretionary') {
    return verdict(hundredths(b.capital) > 0n || b.amendable, hundredths(b.capital) > 0n || b.amendable
      ? 'a discretionary trust a foreign person could benefit from, now or by amending the deed (section 104JA)'
      : 'no foreign person can benefit and the deed cannot be amended to allow one (section 104JA)');
  }
  const [largest, combined] = [hundredths(b.largest), hundredths(b.combined)];
  return verdict(atLeast(largest, 20) || atLeast(combined, 40), 'a substantial interest is 20% or more held by one foreign '
    + `person with associates, or 40% or more by foreign persons together; here ${b.largest}% and ${b.combined}% (G009)`);
}

/** Victoria's foreign purchaser test (Duties Act 2000, as SRO Victoria states it): a foreign
 * natural person, a corporation incorporated outside Australia or with a foreign controlling interest
 * of more than 50%, and a trust with a foreign substantial interest of more than 50% of the capital,
 * a discretionary trust's beneficiaries being taken to hold the most they could receive.
 * @param {ForeignBuyer} b */
function vicDutyTest(b) {
  if (b.type === 'individual') {
    if (b.status === 'nz') {
      return verdict(!b.nzResident, `a New Zealand citizen who ${b.nzResident ? 'ordinarily resides' : 'does not ordinarily reside'} `
        + 'in Australia for 6 consecutive months within the 12 months before or after settlement');
    }
    return b.status === 'other' ? verdict(true, 'not an Australian citizen or permanent visa holder')
      : verdict(false, 'an Australian citizen or permanent visa holder');
  }
  if (b.type === 'company' && b.overseas) return verdict(true, 'a corporation incorporated outside Australia');
  const held = hundredths(b.type === 'discretionary' ? b.capital : b.combined);
  return verdict(over(held, 50), `foreign persons with associates hold ${b.type === 'discretionary' ? b.capital : b.combined}%, `
    + `against more than 50% (${b.type === 'company' ? 'a controlling interest' : 'a substantial interest in the capital'})`);
}

/** Victoria's absentee owner surcharge: an absentee individual, a corporation incorporated outside
 * Australia or with an absentee controlling interest over 50%, a fixed trust with any absentee
 * beneficiary (on the land held for them), and a discretionary trust with an absentee specified
 * (named) beneficiary; a complying super fund is an excluded trust. @param {ForeignBuyer} b */
function vicLandTest(b) {
  if (b.type === 'individual') return absenteeTest(b, 'on 31 December or for over 6 months of the year before the tax year');
  if (b.type === 'smsf') return verdict(false, 'a complying superannuation fund is an excluded trust');
  if (b.type === 'discretionary') {
    return verdict(b.named, `a specified (named) beneficiary ${b.named ? 'is' : 'is not'} an absentee`);
  }
  if (b.type === 'company' && b.overseas) return verdict(true, 'a corporation incorporated outside Australia');
  // Victoria tests absentee interests here, not foreign ones: a foreign person who lives in Australia is no absentee.
  const held = hundredths(b.absentee);
  return b.type === 'company' ? verdict(over(held, 50), `absentee persons hold ${b.absentee}%, against more than 50%`)
    : verdict(held > 0n, `absentee beneficiaries hold ${b.absentee}% of the trust land, which bears the surcharge`);
}

/** The 50%-or-more tests of Queensland, Western Australia, South Australia, Tasmania and the ACT,
 * with each one's rule for a discretionary trust. @param {ForeignBuyer} b @param {string} place */
function majorityTest(b, place) {
  if (b.type === 'individual') return visaTest(b);
  if (b.type === 'company' && b.overseas) return verdict(true, 'a corporation incorporated outside Australia');
  if (b.type !== 'discretionary') {
    const held = hundredths(b.combined);
    return verdict(atLeast(held, 50), `foreign persons with associates hold ${b.combined}%, against 50% or more`);
  }
  const [capital, defaults] = [hundredths(b.capital), hundredths(b.defaults)];
  const rules = {
    'AU-QLD': [atLeast(defaults, 50), `foreign takers in default hold ${b.defaults}%, against 50% or more`],
    'AU-WA': [b.control || atLeast(defaults, 50), `${b.control ? 'a foreign person controls the trust' : 'no foreign person controls the trust'}, and foreign takers in default hold ${b.defaults}%, against 50% or more`],
    'AU-SA': [b.control || b.named || defaults > 0n, 'foreign if a trustee, an appointor, a named object or a taker in default is a foreign person'],
    'AU-TAS': [atLeast(capital, 50), `the trustee could give foreign persons ${b.capital}% of the capital, against 50% or more`],
    'AU-ACT': [b.named && atLeast(capital, 50), `only a foreign person named in the deed counts, at the most they could receive: ${b.named ? `${b.capital}%` : 'none named'}, against 50% or more`],
  }[place];
  return verdict(.../** @type {[boolean, string]} */ (rules));
}

/** The ACT's foreign ownership surcharge: a foreign individual is not an Australian citizen, permanent
 * resident, New Zealand citizen on a special category visa or person ordinarily resident in Australia,
 * and pays no surcharge on the home they live in as their principal place of residence.
 * @param {ForeignBuyer} b @returns {Verdict} */
function actLandTest(b) {
  if (b.type !== 'individual') return majorityTest(b, 'AU-ACT');
  if (b.status !== 'other') return visaTest(b);
  if (b.resides) return verdict(false, 'ordinarily resident in Australia');
  return b.home ? { foreign: false, why: 'Not payable: a foreign person who lives in the home as their principal place of residence' }
    : verdict(true, 'not an Australian citizen, permanent resident, New Zealand citizen on a special category visa or ordinarily resident');
}

/** Who is foreign for each surcharge, by jurisdiction. */
const TESTS = {
  'AU-NSW': { duty: (/** @type {ForeignBuyer} */ b) => nswTest(b, b.daysBefore, 'the contract'),
    land: (/** @type {ForeignBuyer} */ b) => nswTest(b, b.daysDecember, '31 December') },
  'AU-VIC': { duty: vicDutyTest, land: vicLandTest },
  'AU-QLD': { duty: (/** @type {ForeignBuyer} */ b) => majorityTest(b, 'AU-QLD'),
    land: (/** @type {ForeignBuyer} */ b) => (b.type === 'individual' ? absenteeTest(b, 'on 30 June or for over 6 months of the financial year') : majorityTest(b, 'AU-QLD')) },
  'AU-WA': { duty: (/** @type {ForeignBuyer} */ b) => majorityTest(b, 'AU-WA') },
  'AU-SA': { duty: (/** @type {ForeignBuyer} */ b) => majorityTest(b, 'AU-SA') },
  'AU-TAS': { duty: (/** @type {ForeignBuyer} */ b) => majorityTest(b, 'AU-TAS'), land: (/** @type {ForeignBuyer} */ b) => majorityTest(b, 'AU-TAS') },
  'AU-ACT': { land: actLandTest },
  'AU-NT': {},
};

/** Refuses what the page leaves to each Commissioner or does not decide, and checks every answer.
 * @param {ForeignBuyer} b */
function checkBuyer(b) {
  if (!['individual', 'company', 'trust', 'discretionary', 'smsf'].includes(b.type)) throw new Error('Choose who is buying.');
  if (!['citizen', 'permanent', 'nz', 'other', 'partner'].includes(b.status)) throw new Error('Choose the individual’s citizenship or visa.');
  if (b.exemption) {
    throw new Error('Exemptions, refunds and relief from these surcharges are decided by each Commissioner on application, so this page does not work them out.');
  }
  if (b.type === 'individual' && b.status === 'partner') {
    throw new Error('This page does not decide the status of a partner (provisional) or retirement visa holder: each revenue office treats them differently.');
  }
  for (const flag of ['nzResident', 'resides', 'absent', 'home', 'overseas', 'amendable', 'control', 'named']) {
    if (typeof b[/** @type {keyof ForeignBuyer} */ (flag)] !== 'boolean') throw new Error('Answer each yes or no question.');
  }
  for (const days of [b.daysBefore, b.daysDecember]) number(days, { max: 366, integer: true });
  for (const held of [b.capital, b.defaults, b.absentee]) hundredths(held);
  if (hundredths(b.largest) > hundredths(b.combined)) {
    throw new Error('The largest foreign interest cannot be more than all foreign interests together.');
  }
}

/** A territory's name with 'The'. @param {SurchargeLaw} law */
const theName = (law) => `${law.name.endsWith('Territory') ? 'The ' : ''}${law.name}`;
/** Why no duty surcharge applies when none is tested. @param {SurchargeLaw} law */
const noDuty = (law) => (!law.duty ? `${theName(law)} charges no foreign purchaser duty`
  : `No surcharge: ${law.name} charges it on residential${law.primary ? ' and primary production' : ''} property only`);
/** Why no land tax surcharge applies when none is tested. @param {SurchargeLaw} law */
const noLand = (law) => (!law.land ? `${theName(law)} charges no foreign owner land tax surcharge${law.name === 'Northern Territory' ? ', and no land tax' : ''}`
  : `No surcharge: ${law.name} charges it on residential land only`);

/** One buyer's foreign purchaser duty surcharge on its share of one property, and the foreign owner
 * land tax surcharge for a full year on the land value entered, in the chosen jurisdiction. A
 * surcharge is the rate times the value, exact until it rounds half up to the cent; Victoria's
 * absentee owner surcharge on a fixed trust falls on the land held for absentee beneficiaries.
 * @param {ForeignBuyer} buyer @param {ForeignPurchase} purchase */
export function foreignSurcharge(buyer, purchase) {
  const law = FOREIGN_SURCHARGES[purchase.place];
  if (!law) throw new Error('Choose a state or territory.');
  if (!['residential', 'primary', 'other'].includes(purchase.use)) throw new Error('Choose what the property is used for.');
  checkBuyer(buyer);
  const whole = { min: 1, max: 1e9, integer: true, money: true };
  const share = number(purchase.share, whole);
  if (share > number(purchase.value, whole)) throw new Error('The buyer’s share cannot be worth more than the whole property.');
  const land = number(purchase.land, { max: 1e9, integer: true, money: true });
  const tests = /** @type {{duty?: (b: ForeignBuyer) => Verdict, land?: (b: ForeignBuyer) => Verdict}} */ (
    TESTS[/** @type {keyof typeof TESTS} */ (purchase.place)]);
  const rate = { residential: law.duty, primary: law.primary, other: undefined }[purchase.use];
  const dutyTest = rate && tests.duty ? tests.duty(buyer) : null;
  const duty = dutyTest?.foreign ? ratioCents(BigInt(share) * hundredths(/** @type {string} */ (rate)), 100n) : 0n;
  const landTest = tests.land && (law.landOn === 'all' || purchase.use === 'residential') ? tests.land(buyer) : null;
  let surcharge = 0n;
  if (landTest?.foreign) {
    const trust = buyer.type !== 'individual' && buyer.type !== 'company';
    surcharge = landTaxCents(land, (trust && law.trustLand) || /** @type {string} */ (law.land)).amount;
    if (purchase.place === 'AU-VIC' && buyer.type === 'trust') surcharge = ratioCents(surcharge * hundredths(buyer.absentee), 10000n);
  }
  return { dutyRate: dutyTest ? Number(rate) : null, dutyTest: dutyTest?.why ?? noDuty(law), duty: Number(duty) / 100,
    landTest: landTest?.why ?? noLand(law), land: Number(surcharge) / 100 };
}

/** The buyer as the result's inputs describe it. @param {ForeignBuyer} b */
function buyerText(b) {
  const interests = `foreign interests ${b.largest}% largest and ${b.combined}% together, absentee interests ${b.absentee}%`;
  return {
    individual: `an individual: ${{ citizen: 'an Australian citizen', permanent: 'a permanent visa holder', nz: 'a New Zealand citizen on a special category visa',
      other: 'another visa or none', partner: 'a partner or retirement visa holder' }[b.status]}`,
    company: `a company${b.overseas ? ' incorporated outside Australia' : ''}, ${interests}`,
    trust: `the trustee of a fixed or unit trust, ${interests}`,
    smsf: `the trustee of a self-managed super fund, ${interests}`,
    discretionary: `the trustee of a discretionary trust, ${b.capital}% of capital could go to foreign persons, foreign takers in default ${b.defaults}%`,
  }[b.type];
}

/** The page's result: its inputs sentence, labelled rows and note. `general` is the general transfer
 * duty on the whole property, which the caller works out from the transfer duty scale, or null.
 * @param {ForeignBuyer} buyer @param {ForeignPurchase} purchase @param {number | null} general
 * @param {(value: number) => string} aud */
export function foreignSurchargeResult(buyer, purchase, general, aud) {
  const r = foreignSurcharge(buyer, purchase);
  const law = FOREIGN_SURCHARGES[purchase.place];
  const money = (/** @type {string} */ text) => aud(Number(text));
  // Each amount comes before its test, so the result opens on a figure.
  const rows = [[r.dutyRate === null ? 'Foreign purchaser duty surcharge' : `Foreign purchaser duty surcharge at ${r.dutyRate}% of the buyer’s share`,
    aud(r.duty)], ['Duty surcharge test', r.dutyTest]];
  if (general !== null) rows.push(['General transfer duty on the whole property, all buyers', aud(general)]);
  rows.push(['Land tax surcharge for a full year', aud(r.land)], ['Land tax surcharge test', r.landTest]);
  return { inputs: `${law.name}, ${buyerText(buyer)}, ${{ residential: 'residential', primary: 'primary production', other: 'other' }[purchase.use]} `
    + `property worth ${money(purchase.value)}, buyer’s share ${money(purchase.share)}, land value for land tax ${money(purchase.land)}`,
  rows, principal: 0, note: 'Each test is the jurisdiction’s own, from your answers; the revenue office decides who is foreign' };
}
