// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { number } from './money.mjs';

// First home owner grants in the 8 states and territories for a new home bought or built under
// a contract made from 1 July 2025, as each source stated them on 22 November 2026 (the page
// lists the sources):
// - NSW: First Home Owner Grant and Shared Equity Act 2000 No 21: $10,000 from 1 January 2016;
//   eligibility caps of $600,000 for a home bought and $750,000 for a home built.
// - Vic: State Revenue Office: $10,000 from 1 July 2013 for a home worth up to $750,000; First Home Owner
//   Grant and Home Buyer Schemes Act 2000 (authorised version 053, read 24 November 2026) s 18(1A): the lesser
//   of the consideration and $10,000; s 13(1A) and (7)(b): the $750,000 cap on a home built is on the
//   building work's consideration alone, so a land and building total over it is not computed.
// - Qld: First Home Owner Grant and Other Home Owner Grants Act 2000 s 20: the lesser of the
//   consideration and $30,000; s 5(6) to (8): not eligible at $750,000 or more.
// - Qld and WA: s 5(6) to (8) and s 14AC(2) and (3) test the cap on a value that can differ from the
//   consideration: for a home bought, the greater of the price and the unencumbered value of the home
//   and land; for a home built, the contract and the land's value. The page takes that value as
//   `capValue` where it differs; the consideration still limits the grant (Qld s 20(1), WA s 19(2CA)).
// - WA: Department of Treasury and Finance fact sheet as at 28 July 2026: $10,000; caps of $750,000
//   south and $1,000,000 north of the 26th parallel to 6 May 2026, $800,000 south from 7 May 2026;
//   First Home Owner Grant Act 2000 (as at 22 October 2026, read 24 November 2026) s 19(2CA): the lesser of
//   $10,000 and the consideration.
// - SA: RevenueSA: $15,000 but not more than the consideration; no cap from 6 June 2024.
// - Tas: First Home Owner Grant Act 2000 (authorised version as at 9 October 2026) s 18: the lesser
//   of the consideration and $30,000 from 1 July 2025 to 30 June 2026 (s 18L) or $20,000 from 1 July
//   2026 to 30 June 2027 (s 18M), for a transaction completed within 24 months or a period the
//   Commissioner extends, that replaces no transaction for the same property between or benefiting
//   substantially the same parties entered before the 1 July starting its period; s 7 sets no value cap. The State Revenue Office's table gives the same amounts.
// - NT: HomeGrown Territory Grant: $50,000 for contracts from 1 October 2024 to 30 September 2027,
//   with no cap; First Home Owner Grant Act 2000 (as in force at 1 July 2026, read 24 November 2026)
//   s 18(1): the lesser of the consideration and the amount; s 13(1)(a)(iii) and s 18(3D)(b): $10,000
//   for an established home bought from 1 October 2024 to 30 September 2025; s 13(1)(a)(iv): a new home only after.
// - ACT: ACT Revenue Office: no grant from 1 July 2019.

export const FHOG_FIRST = '2025-07-01';
export const FHOG_LAST = '2026-11-22';
export const FHOG_HOMES = ['bought', 'built', 'established'];
export const FHOG_FACTS = ['person', 'citizen', 'first', 'residence'];
// Facts only some transactions need: the grant for a home built is the lesser of the building
// contract's consideration and the amount, and the NT and Tasmanian amounts carry their own conditions.
export const FHOG_CASE_FACTS = ['contract', 'nt', 'tas'];
/** @type {Record<string, string>} */
const FACT_NAMES = { person: 'every applicant is a person aged 18 or over', citizen: 'an applicant is an Australian citizen or permanent resident',
  first: 'no applicant or spouse is excluded by the jurisdiction’s prior grant and ownership rules', residence: 'the residence requirement will be met',
  contract: 'the building contract price is at least the grant', nt: 'the contract replaces none signed before 1 October 2024',
  tas: 'the transaction completes within 24 months or a period the Commissioner extends, and replaces no transaction for the same property, between or benefiting substantially the same parties, entered into before 1 July 2025 (for a 2025-26 contract) or 1 July 2026 (for a 2026-27 contract)' };

/** @typedef {{from: string, to: string, amount: number, established?: number, bought?: number, built?: number, north?: number, lesser?: boolean}} GrantRule
 * `bought`, `built` and `north` are the highest eligible whole-dollar value; a rule without them has no cap.
 * `established` is the amount for an established home; a rule without it pays none. */
/** @type {Record<string, {name: string, residence: string, rules: GrantRule[]}>} */
export const FHOG = {
  'AU-NSW': { name: 'New South Wales', residence: 'each applicant lives in the home for 12 continuous months, starting within 12 months',
    rules: [{ from: '2016-01-01', to: '9999-12-31', amount: 10000, bought: 600000, built: 750000 }] },
  'AU-VIC': { name: 'Victoria', residence: 'at least one applicant lives in the home for 12 months, starting within 12 months',
    rules: [{ from: '2013-07-01', to: '9999-12-31', amount: 10000, bought: 750000, built: 750000, lesser: true }] },
  // $750,000 or more is not eligible, so the highest whole-dollar value is $749,999.
  'AU-QLD': { name: 'Queensland', residence: 'each applicant lives in the home for 6 continuous months, starting within 1 year',
    rules: [{ from: '2023-11-20', to: '9999-12-31', amount: 30000, bought: 749999, built: 749999, lesser: true }] },
  'AU-WA': { name: 'Western Australia', residence: 'each applicant lives in the home for 6 continuous months, starting within 12 months',
    rules: [{ from: '2000-07-01', to: '2026-05-06', amount: 10000, bought: 750000, built: 750000, north: 1000000, lesser: true },
      { from: '2026-05-07', to: '9999-12-31', amount: 10000, bought: 800000, built: 800000, north: 1000000, lesser: true }] },
  'AU-SA': { name: 'South Australia', residence: 'all applicants live in the home for 6 continuous months, starting within 12 months',
    rules: [{ from: '2024-06-06', to: '9999-12-31', amount: 15000, lesser: true }] },
  'AU-TAS': { name: 'Tasmania', residence: 'each applicant lives in the home for 6 continuous months, starting within 12 months',
    rules: [{ from: '2025-07-01', to: '2026-06-30', amount: 30000, lesser: true }, { from: '2026-07-01', to: '2027-06-30', amount: 20000, lesser: true }] },
  'AU-NT': { name: 'Northern Territory', residence: 'the applicants live in the home for at least 12 months after taking possession or completion',
    rules: [{ from: '2024-10-01', to: '2025-09-30', amount: 50000, established: 10000, lesser: true },
      { from: '2025-10-01', to: '2027-09-30', amount: 50000, lesser: true }] },
  'AU-ACT': { name: 'Australian Capital Territory', residence: 'none, as no grant is paid', rules: [{ from: '2019-07-01', to: '9999-12-31', amount: 0 }] },
};

// The first contract date each jurisdiction's duty rates and first home buyer concession on the
// transfer duty calculator cover: NSW's 2026-27 scale, WA's first home owner rate from 7 May 2026,
// Tasmania after its established homes exemption ended with settlements on 30 June 2026, and the
// ACT's 2026-27 scale and Home Buyer Concession Scheme.
/** @type {Record<string, string>} */
export const DUTY_FROM = { 'AU-NSW': '2026-07-01', 'AU-VIC': '2025-07-01', 'AU-QLD': '2025-07-01', 'AU-WA': '2026-05-07',
  'AU-SA': '2025-07-01', 'AU-TAS': '2026-07-01', 'AU-ACT': '2026-07-01', 'AU-NT': '2025-07-01' };

const whole = (/** @type {number} */ n) => `$${n.toLocaleString('en-AU')}`;
const longDate = (/** @type {string} */ iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * The first home owner grant for one transaction, for applicants who state every eligibility fact.
 * @param {{place: string, date: string, home: string, value: string, north?: boolean, capValue?: string, contractPrice?: string, facts: Record<string, boolean>}} input
 *   `date` is the contract date as YYYY-MM-DD and `value` the total value in whole dollars: for a home bought the
 *   price, the consideration; for a home built the land and contract, whose consideration is the contract alone
 *   (Qld schedule 'consideration' (b), WA s 14AB(b), s 13 in Vic, SA, Tas, ACT and NT; the NSW Act was not read),
 *   which the `contract` fact puts at the grant or more, so `value` never limits a built home's grant;
 *   `north` is required in Western Australia; `capValue`, taken only in Queensland and Western Australia, is the
//   value their caps test where it differs from `value`.
 *   `contractPrice`, taken only for a home built, is the building contract's price, its consideration (the total
 *   payable for the building work; in the NT the amount actually paid, s 18(1)(a)): below the amount it is the grant
 *   (Qld s 20(1), Vic s 18(1A), WA s 19(2CA), SA, Tas and NT s 18(1)), and in Victoria it is what the s 13(1A) cap
 *   tests. It replaces the `contract` fact. A NSW price below the grant is not computed: that Act was not read.
 * @returns {{grant: number, reason: string, cap: string, residence: string, dutyFrom: string}}
 */
export function firstHomeOwnerGrant({ place, date, home, value, north, capValue, contractPrice, facts }) {
  if (!Object.hasOwn(FHOG, place)) throw new Error('Choose a state or territory.');
  if (!FHOG_HOMES.includes(home)) throw new Error('Choose a home bought, built or established.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < FHOG_FIRST || date > FHOG_LAST) {
    throw new Error(`Not computed: choose a contract date from ${longDate(FHOG_FIRST)} to ${longDate(FHOG_LAST)}, the day the grant rules were read.`);
  }
  const missing = FHOG_FACTS.filter((f) => facts?.[f] !== true);
  if (missing.length) throw new Error(`Not computed: the grant and the first home buyer duty need every eligibility fact stated; not stated: ${missing.map((f) => FACT_NAMES[f]).join('; ')}.`);
  const dollars = number(value, { min: 1, max: 1e9, integer: true, money: true });
  const capDollars = capValue ? number(capValue, { min: 1, max: 1e9, integer: true, money: true }) : undefined;
  const scheme = FHOG[place];
  if (capDollars !== undefined && place !== 'AU-QLD' && place !== 'AU-WA') {
    throw new Error(`Not computed: the value the cap tests is taken only in Queensland and Western Australia; clear it for ${scheme.name}.`);
  }
  const price = contractPrice ? number(contractPrice, { min: 1, max: 1e9, integer: true, money: true }) : undefined;
  if (price !== undefined && home !== 'built') throw new Error('Not computed: the building contract price is taken only for a home built; clear it.');
  if (price !== undefined && price > dollars) throw new Error('Not computed: the building contract price cannot be more than the total value, which includes it.');
  // Qld s 5(6) to (8), WA s 14AC(2) and (3): a home bought is tested on the greater of the price and the value,
  // a home built on the value given; Vic s 13(1A) and (7)(b): a home built on its contract price.
  const tested = price !== undefined && place === 'AU-VIC' ? price
    : capDollars === undefined ? dollars : home === 'built' ? capDollars : Math.max(dollars, capDollars);
  const out = { residence: scheme.residence, dutyFrom: DUTY_FROM[place] };
  const rule = scheme.rules.find((r) => r.from <= date && date <= r.to);
  if (!rule) throw new Error(`Not computed: no ${scheme.name} grant rule covers that date.`);
  if (rule.amount === 0) return { ...out, grant: 0, cap: 'none', reason: `the ${scheme.name} has paid none since ${longDate(rule.from)}` };
  const amount = home === 'established' ? rule.established ?? 0 : rule.amount;
  if (amount === 0) return { ...out, grant: 0, cap: 'none', reason: 'the grant is for a new home only' };
  const unstated = FHOG_CASE_FACTS.filter((f) => facts?.[f] !== true
    && (f === 'contract' ? home === 'built' && price === undefined : place === (f === 'nt' ? 'AU-NT' : 'AU-TAS')));
  if (price !== undefined && facts?.contract === true && price < amount) {
    throw new Error(`Not computed: the building contract price is below the ${whole(amount)} grant, so it is not at least the grant as stated.`);
  }
  if (unstated.length) throw new Error(`Not computed: the ${scheme.name} grant for this home needs another fact stated: ${unstated.map((f) => FACT_NAMES[f]).join('; ')}.`);
  if (place === 'AU-WA' && typeof north !== 'boolean') throw new Error('Not computed: choose where the Western Australian home is, south or north of the 26th parallel.');
  // An established home has no cap: only the NT's pays, and its rule has none.
  const limit = place === 'AU-WA' && north ? rule.north : home === 'built' ? rule.built : home === 'bought' ? rule.bought : undefined;
  const cap = limit === undefined ? 'none' : place === 'AU-QLD' ? 'under $750,000' : `up to ${whole(limit)}`;
  if (limit !== undefined && tested > limit) {
    if (place === 'AU-VIC' && home === 'built' && price === undefined) {
      throw new Error('Not computed: the Victorian cap applies to the consideration for the building work (First Home Owner Grant and Home Buyer Schemes Act 2000 (Vic) s 13(1A) and (7)(b)), not the land and building total entered.');
    }
    return { ...out, grant: 0, cap, reason: place === 'AU-QLD' ? 'the value is $750,000 or more' : `the value is over the ${scheme.name} cap` };
  }
  // The consideration: a home built's contract price, which without it is known only to be at least the amount.
  const consideration = price ?? dollars;
  if (consideration < amount) {
    if (home === 'built' && price === undefined) throw new Error(`Not computed: a total value below the ${whole(amount)} grant cannot hold a building contract price of at least the grant.`);
    if (!rule.lesser) throw new Error(`Not computed: a value below the ${whole(amount)} grant; the ${scheme.name} rule for that case was not confirmed.`);
    return { ...out, grant: consideration, cap, reason: 'the grant cannot be more than the consideration' };
  }
  return { ...out, grant: amount, cap, reason: '' };
}

/** The engine's input from the form: `value` gives a field's value and `checked` a checkbox's state.
 * @param {(name: string) => string} value @param {(name: string) => boolean} checked */
export function fhogFormInput(value, checked) {
  const location = value('wa-location');
  const capValue = value('cap-value');
  const contractPrice = value('contract-price');
  return { place: value('jurisdiction'), date: value('date'), home: value('home'), value: value('value'), ...(location ? { north: location === 'north' } : {}),
    ...(capValue ? { capValue } : {}), ...(contractPrice ? { contractPrice } : {}),
    facts: Object.fromEntries([...FHOG_FACTS, ...FHOG_CASE_FACTS].map((f) => [f, checked(`fact-${f}`)])) };
}

/** How an input reads above its result.
 * @param {{place: string, date: string, home: string, value: string, north?: boolean, capValue?: string, contractPrice?: string, facts: Record<string, boolean>}} input
 * @param {(n: number) => string} aud */
export function fhogInputsText(input, aud) {
  const homeText = { bought: 'new home bought', built: 'new home built under a contract', established: 'established home' }[input.home];
  const north = input.place !== 'AU-WA' ? '' : input.north === undefined ? ', location not stated' : `, ${input.north ? 'north' : 'south'} of the 26th parallel`;
  const missing = FHOG_FACTS.filter((f) => input.facts?.[f] !== true);
  return `${FHOG[input.place]?.name ?? input.place}, contract ${longDate(input.date)}, ${homeText}${north}, total value ${aud(Number(input.value))}, `
    + (input.capValue ? `value the cap tests ${aud(Number(input.capValue))}, ` : '')
    + (input.contractPrice ? `building contract price ${aud(Number(input.contractPrice))}, ` : '')
    + (missing.length ? `not stated: ${missing.map((f) => FACT_NAMES[f]).join('; ')}` : 'every eligibility fact stated');
}

/**
 * The page's result: the grant beside the transfer duty calculator's figures for the same home.
 * @param {(name: string) => string} value the form's value by name
 * @param {(name: string) => boolean} checked whether the form's checkbox is ticked
 * @param {readonly (readonly string[])[]} scale the jurisdiction's general duty scale
 * @param {(value: string, scale: readonly (readonly string[])[], place: string, home: string) => {duty: number, general: number, concession: boolean}} firstHomeDuty
 * @param {(n: number) => string} aud
 */
export function firstHomeOwnerGrantResult(value, checked, scale, firstHomeDuty, aud) {
  const input = fhogFormInput(value, checked);
  const r = firstHomeOwnerGrant(input);
  const name = FHOG[input.place].name;
  const rows = [['First home owner grant', r.reason ? `${aud(r.grant)}: ${r.reason}` : aud(r.grant)], ['Value cap', r.cap],
    ['Residence requirement you stated', r.residence]];
  if (input.home === 'built') {
    rows.push(['Transfer duty', 'not computed: duty on a building contract falls on the land, and this site does not compute first home buyer concessions on vacant land']);
  } else if (input.date < r.dutyFrom) {
    rows.push(['Transfer duty', `not computed: the transfer duty calculator’s ${name} rates cover contracts from ${longDate(r.dutyFrom)}`]);
  } else {
    const f = firstHomeDuty(input.value, scale, input.place, input.home === 'bought' ? 'new' : 'established');
    rows.push(['Transfer duty for an eligible first home buyer', f.concession ? aud(f.duty) : 'no concession for this home, so general duty applies'],
      ['General transfer duty on the same value', aud(f.general)]);
  }
  return { inputs: fhogInputsText(input, aud), rows, principal: 0 };
}
