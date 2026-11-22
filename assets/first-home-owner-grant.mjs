// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { number } from './money.mjs';

// First home owner grants in the 8 states and territories for a new home bought or built under
// a contract made from 1 July 2025, as each source stated them on 22 November 2026 (the page
// lists the sources):
// - NSW: First Home Owner Grant and Shared Equity Act 2000 No 21: $10,000 from 1 January 2016;
//   eligibility caps of $600,000 for a home bought and $750,000 for a home built.
// - Vic: State Revenue Office: $10,000 from 1 July 2013 for a home worth up to $750,000.
// - Qld: First Home Owner Grant and Other Home Owner Grants Act 2000 s 20: the lesser of the
//   consideration and $30,000; s 5(6) to (8): not eligible at $750,000 or more.
// - WA: Department of Treasury and Finance fact sheet as at 28 July 2026: $10,000; caps of $750,000
//   south and $1,000,000 north of the 26th parallel to 6 May 2026, $800,000 south from 7 May 2026.
// - SA: RevenueSA: $15,000 but not more than the consideration; no cap from 6 June 2024.
// - Tas: State Revenue Office: $30,000 from 1 July 2025 to 30 June 2026, $20,000 from 1 July 2026
//   to 30 June 2027.
// - NT: HomeGrown Territory Grant: $50,000 for contracts from 1 October 2024 to 30 September 2027,
//   with no cap.
// - ACT: ACT Revenue Office: no grant from 1 July 2019.

export const FHOG_FIRST = '2025-07-01';
export const FHOG_LAST = '2026-11-22';
export const FHOG_HOMES = ['bought', 'built', 'established'];
export const FHOG_FACTS = ['person', 'citizen', 'first', 'residence'];
/** @type {Record<string, string>} */
const FACT_NAMES = { person: 'every applicant is a person aged 18 or over', citizen: 'an applicant is an Australian citizen or permanent resident',
  first: 'no applicant or spouse has had a grant or owned a home in Australia', residence: 'the residence requirement will be met' };

/** @typedef {{from: string, to: string, amount: number, bought?: number, built?: number, north?: number, lesser?: boolean}} GrantRule
 * `bought`, `built` and `north` are the highest eligible whole-dollar value; a rule without them has no cap. */
/** @type {Record<string, {name: string, residence: string, rules: GrantRule[]}>} */
export const FHOG = {
  'AU-NSW': { name: 'New South Wales', residence: 'each applicant lives in the home for 12 continuous months, starting within 12 months',
    rules: [{ from: '2016-01-01', to: '9999-12-31', amount: 10000, bought: 600000, built: 750000 }] },
  'AU-VIC': { name: 'Victoria', residence: 'at least one applicant lives in the home for 12 months, starting within 12 months',
    rules: [{ from: '2013-07-01', to: '9999-12-31', amount: 10000, bought: 750000, built: 750000 }] },
  // $750,000 or more is not eligible, so the highest whole-dollar value is $749,999.
  'AU-QLD': { name: 'Queensland', residence: 'each applicant lives in the home for 6 continuous months, starting within 1 year',
    rules: [{ from: '2023-11-20', to: '9999-12-31', amount: 30000, bought: 749999, built: 749999, lesser: true }] },
  'AU-WA': { name: 'Western Australia', residence: 'each applicant lives in the home for 6 continuous months, starting within 12 months',
    rules: [{ from: '2000-07-01', to: '2026-05-06', amount: 10000, bought: 750000, built: 750000, north: 1000000 },
      { from: '2026-05-07', to: '9999-12-31', amount: 10000, bought: 800000, built: 800000, north: 1000000 }] },
  'AU-SA': { name: 'South Australia', residence: 'all applicants live in the home for 6 continuous months, starting within 12 months',
    rules: [{ from: '2024-06-06', to: '9999-12-31', amount: 15000, lesser: true }] },
  'AU-TAS': { name: 'Tasmania', residence: 'each applicant lives in the home for 6 continuous months, starting within 12 months',
    rules: [{ from: '2025-07-01', to: '2026-06-30', amount: 30000 }, { from: '2026-07-01', to: '2027-06-30', amount: 20000 }] },
  'AU-NT': { name: 'Northern Territory', residence: 'the applicants live in the home for at least 12 months after taking possession or completion',
    rules: [{ from: '2024-10-01', to: '2027-09-30', amount: 50000 }] },
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
 * @param {{place: string, date: string, home: string, value: string, north?: boolean, facts: Record<string, boolean>}} input
 *   `date` is the contract date as YYYY-MM-DD and `value` the total value in whole dollars.
 * @returns {{grant: number, reason: string, cap: string, residence: string, dutyFrom: string}}
 */
export function firstHomeOwnerGrant({ place, date, home, value, north = false, facts }) {
  if (!Object.hasOwn(FHOG, place)) throw new Error('Choose a state or territory.');
  if (!FHOG_HOMES.includes(home)) throw new Error('Choose a home bought, built or established.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < FHOG_FIRST || date > FHOG_LAST) {
    throw new Error(`Not computed: choose a contract date from ${longDate(FHOG_FIRST)} to ${longDate(FHOG_LAST)}, the day the grant rules were read.`);
  }
  const missing = FHOG_FACTS.filter((f) => facts?.[f] !== true);
  if (missing.length) throw new Error(`Not computed: the grant and the first home buyer duty need every eligibility fact stated; not stated: ${missing.map((f) => FACT_NAMES[f]).join('; ')}.`);
  const dollars = number(value, { min: 1, max: 1e9, integer: true, money: true });
  const scheme = FHOG[place];
  const out = { residence: scheme.residence, dutyFrom: DUTY_FROM[place] };
  const rule = scheme.rules.find((r) => r.from <= date && date <= r.to);
  if (!rule) throw new Error(`Not computed: no ${scheme.name} grant rule covers that date.`);
  if (rule.amount === 0) return { ...out, grant: 0, cap: 'none', reason: `the ${scheme.name} has paid none since ${longDate(rule.from)}` };
  if (home === 'established') return { ...out, grant: 0, cap: 'none', reason: 'the grant is for a new home only' };
  const limit = place === 'AU-WA' && north ? rule.north : rule[/** @type {'bought' | 'built'} */ (home)];
  const cap = limit === undefined ? 'none' : place === 'AU-QLD' ? 'under $750,000' : `up to ${whole(limit)}`;
  if (limit !== undefined && dollars > limit) return { ...out, grant: 0, cap, reason: place === 'AU-QLD' ? 'the value is $750,000 or more' : `the value is over the ${scheme.name} cap` };
  if (dollars < rule.amount) {
    if (!rule.lesser) throw new Error(`Not computed: a value below the ${whole(rule.amount)} grant; the ${scheme.name} rule for that case was not confirmed.`);
    return { ...out, grant: dollars, cap, reason: 'the grant cannot be more than the consideration' };
  }
  return { ...out, grant: rule.amount, cap, reason: '' };
}

/** The engine's input from the form: `value` gives a field's value and `checked` a checkbox's state.
 * @param {(name: string) => string} value @param {(name: string) => boolean} checked */
export function fhogFormInput(value, checked) {
  return { place: value('jurisdiction'), date: value('date'), home: value('home'), value: value('value'), north: value('wa-location') === 'north',
    facts: Object.fromEntries(FHOG_FACTS.map((f) => [f, checked(`fact-${f}`)])) };
}

/** How an input reads above its result.
 * @param {{place: string, date: string, home: string, value: string, north?: boolean, facts: Record<string, boolean>}} input
 * @param {(n: number) => string} aud */
export function fhogInputsText(input, aud) {
  const homeText = { bought: 'new home bought', built: 'new home built under a contract', established: 'established home' }[input.home];
  const north = input.place === 'AU-WA' ? `, ${input.north ? 'north' : 'south'} of the 26th parallel` : '';
  const missing = FHOG_FACTS.filter((f) => input.facts?.[f] !== true);
  return `${FHOG[input.place]?.name ?? input.place}, contract ${longDate(input.date)}, ${homeText}${north}, total value ${aud(Number(input.value))}, `
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
