// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// A resident discretionary trust's net income for one income year, shared between its beneficiaries and its
// trustee. Capital gains and franked distributions are streamed: each beneficiary's share of the capital gain
// (ITAA 1997 ss 115-225, 115-227, 115-228) and of the franked distribution and its franking credit (ss 207-37,
// 207-55, 207-57, 207-58) is what they are specifically entitled to plus their adjusted Division 6 percentage
// (ITAA 1936 s 95(1)) of the rest. Division 6E (ss 102UW to 102UY) takes both out of Division 6, which shares what
// is left of the net income in proportion to present entitlement to the rest of the trust's income. The trustee is
// assessed under s 99A at 45% (Income Tax Rates Act 1986 s 12(9)) on the part no beneficiary is presently entitled
// to, grossed up for a discounted gain (s 115-222(4)), with the trustee's share of the franking credit as an
// offset (ss 207-35(6), 207-45). Where net income other than franking credits falls short of the net capital gain
// and net franked distribution together, both are reduced rateably (ss 115-225(2), (3), 207-37(2), (3)).
// The adjusted Division 6 percentage is worked as the ATO's examples work it: present entitlement less the amounts
// of the capital gain and franked distribution the beneficiary is specifically entitled to, over trust income less
// all such amounts. Sections read on the ATO legal database, and the ATO's 'Streaming trust capital gains and
// franked distributions' pages (last updated 27 June 2024, 'Rateable reduction' 19 December 2024), on
// 26 November 2026. Amounts are exact fractions of cents; each figure is rounded half up to the cent once.

import { cents } from './money.mjs';

export const TRUST_STREAMING_ROWS = 6;
export const CONCESSIONS = /** @type {const} */ (['none', 'discount', 'small_business', 'both']);
export const BENEFICIARY_KINDS = /** @type {const} */ (['individual', 'company', 'trust']);
const GROSS_UP = { none: 1n, discount: 2n, small_business: 2n, both: 4n };
const MAX = 1e9;

/** @param {string} message @returns {never} */
function refuse(message) {
  throw new Error(message);
}

// Exact fractions [numerator, denominator] in cents; the denominator is always positive.
/** @typedef {[bigint, bigint]} Fraction */
/** @param {bigint} n @returns {Fraction} */
const whole = (n) => [n, 1n];
/** @param {Fraction} a @param {Fraction} b @returns {Fraction} */
const add = (a, b) => [a[0] * b[1] + b[0] * a[1], a[1] * b[1]];
/** @param {Fraction} a @param {Fraction} b @returns {Fraction} */
const sub = (a, b) => [a[0] * b[1] - b[0] * a[1], a[1] * b[1]];
/** @param {Fraction} a @param {Fraction} b @returns {Fraction} */
const mul = (a, b) => [a[0] * b[0], a[1] * b[1]];
/** @param {Fraction} a @param {Fraction} b @returns {Fraction} */
const div = (a, b) => (b[0] < 0n ? [-a[0] * b[1], a[1] * -b[0]] : [a[0] * b[1], a[1] * b[0]]);
/** @param {Fraction} a */
const sign = (a) => (a[0] > 0n ? 1 : a[0] < 0n ? -1 : 0);
/** @param {Fraction} a @param {Fraction} b */
const less = (a, b) => sign(sub(a, b)) < 0;
const ZERO = whole(0n);
const ONE = whole(1n);
/** Dollars, rounded half away from nil to the cent. @param {Fraction} a */
const money = ([n, d]) => {
  const c = (2n * (n < 0n ? -n : n) + d) / (2n * d);
  return Number(n < 0n ? -c : c) / 100;
};
/** A fraction as a percentage to 2 places, half up. @param {Fraction} a */
const percent = ([n, d]) => Number((2n * n * 10000n + d) / (2n * d)) / 100;

/** @param {unknown} value @param {string} words @param {number} [min] */
function amount(value, words, min = 0) {
  try {
    return BigInt(cents(String(value ?? ''), min));
  } catch (error) {
    refuse(`${words}: ${/** @type {Error} */ (error).message}`);
  }
}

/**
 * @typedef {{ name: string, kind: string, present_entitlement: string, capital_gain_entitled: string,
 *   franked_entitled: string }} TrustBeneficiaryInput
 * @typedef {{ other_trust_income: string, other_net_income: string, franked_distributions: string, franking_credits: string,
 *   franked_deductions: string, capital_gain: string, capital_gain_remaining: string, capital_gain_concessions: string,
 *   capital_gain_trust_income: string, beneficiaries: TrustBeneficiaryInput[] }} TrustStreamingInput
 */

/** Each beneficiary's and the trustee's assessment. @param {TrustStreamingInput} input */
export function trustStreaming(input) {
  const otherIncome = amount(input.other_trust_income, 'Other trust income', -MAX);
  const otherNet = amount(input.other_net_income, 'Other net income', -MAX);
  const franked = amount(input.franked_distributions, 'Franked distributions');
  const credits = amount(input.franking_credits, 'Franking credits');
  const frankedDeductions = amount(input.franked_deductions, 'Deductions directly relevant to the franked distributions');
  const gain = amount(input.capital_gain, 'Capital gain');
  const remaining = amount(input.capital_gain_remaining, 'Capital gain remaining after losses and concessions');
  const gainIncome = amount(input.capital_gain_trust_income, 'Capital gain in trust income');
  const concessions = /** @type {keyof typeof GROSS_UP} */ (input.capital_gain_concessions);
  if (!CONCESSIONS.includes(/** @type {any} */ (concessions))) refuse('Choose the concessions applied to the capital gain.');
  const rows = Array.isArray(input.beneficiaries) ? input.beneficiaries : [];
  if (rows.length > TRUST_STREAMING_ROWS) refuse(`Enter at most ${TRUST_STREAMING_ROWS} beneficiaries.`);

  if (frankedDeductions > franked) refuse('Deductions directly relevant to the franked distributions cannot exceed them.');
  // A franking credit is at most the distribution grossed up at the 30% corporate tax rate: 30/70 of it (s 202-60).
  if (7n * credits > 3n * franked + 7n) refuse('Franking credits cannot exceed 30/70 of the franked distributions.');
  if (gain === 0n && (remaining > 0n || gainIncome > 0n)) refuse('Enter the capital gain before losses and concessions, or nil for all 3 capital gain amounts.');
  if (gain > 0n && (remaining === 0n || remaining > gain)) {
    refuse('The capital gain remaining after losses and concessions must be above nil and no more than the capital gain.');
  }
  const netFranked = franked - frankedDeductions;
  const trustIncome = otherIncome + gainIncome + netFranked;
  const netIncome = otherNet + remaining + netFranked + credits;
  if (netIncome <= 0n) refuse('The trust has no net income, so Division 6 assesses nobody on it.');
  const withoutCredits = netIncome - credits;
  if (withoutCredits <= 0n && remaining + netFranked > 0n) {
    refuse('Net income without franking credits is nil or below: the rateable reduction in sections 115-225(3) and 207-37(3) is not settled for that case.');
  }

  const beneficiaries = rows.map((b, i) => {
    const label = String(b?.name ?? '').trim() || `Beneficiary ${i + 1}`;
    if (!BENEFICIARY_KINDS.includes(/** @type {any} */ (b?.kind))) refuse(`${label}: choose individual, company or trust.`);
    const entitlement = amount(b.present_entitlement, `${label}, present entitlement`);
    const gainBenefit = amount(b.capital_gain_entitled, `${label}, capital gain specifically entitled to`);
    const frankedBenefit = amount(b.franked_entitled, `${label}, franked distributions specifically entitled to`);
    if (gainBenefit + frankedBenefit > entitlement) {
      refuse(`${label}: the amounts specifically entitled to are part of the present entitlement, so cannot exceed it.`);
    }
    return { name: label, kind: String(b.kind), entitlement, gainBenefit, frankedBenefit };
  });
  const total = (/** @type {(b: typeof beneficiaries[number]) => bigint} */ f) => beneficiaries.reduce((t, b) => t + f(b), 0n);
  if (total((b) => b.gainBenefit) > gainIncome) refuse('Specific entitlements to the capital gain cannot exceed the capital gain in trust income.');
  if (total((b) => b.frankedBenefit) > netFranked) {
    refuse('Specific entitlements to the franked distributions cannot exceed them, less directly relevant deductions.');
  }
  const unentitled = trustIncome - total((b) => b.entitlement);
  if (unentitled < 0n) refuse('Present entitlements cannot exceed the trust’s income.');

  // ss 115-228(1), 207-58(1): the gain or distribution times the share of its net financial benefit.
  const G = whole(gain);
  const F = whole(franked);
  const specific = beneficiaries.map((b) => ({
    gain: gainIncome ? div(mul(G, whole(b.gainBenefit)), whole(gainIncome)) : ZERO,
    franked: netFranked ? div(mul(F, whole(b.frankedBenefit)), whole(netFranked)) : ZERO,
  }));
  const gainLeft = specific.reduce((t, s) => sub(t, s.gain), G);
  const frankedLeft = specific.reduce((t, s) => sub(t, s.franked), F);

  // s 95(1): adjusted Division 6 percentages, needed only for a part nobody is specifically entitled to.
  const base = specific.reduce((t, s) => sub(sub(t, s.gain), s.franked), whole(trustIncome));
  const needed = sign(gainLeft) > 0 || sign(frankedLeft) > 0;
  let adjusted = beneficiaries.map(() => ZERO);
  let trusteeAdjusted = ZERO;
  if (needed) {
    if (sign(base) <= 0) {
      refuse('Trust income less the amounts specifically entitled to is nil or below, so the adjusted Division 6 percentage of the rest of the capital gain or franked distributions is not defined.');
    }
    adjusted = beneficiaries.map((b, i) => {
      const part = sub(sub(whole(b.entitlement), specific[i].gain), specific[i].franked);
      if (sign(part) < 0) {
        refuse(`${b.name}: present entitlement less the amounts specifically entitled to is below nil, so the adjusted Division 6 percentage is not settled.`);
      }
      return div(part, base);
    });
    trusteeAdjusted = div(whole(unentitled), base);
  }

  // ss 115-225(2), (3) and 207-37(2), (3): the rateable reduction.
  const streamed = remaining + netFranked;
  const scale = withoutCredits < streamed ? div(whole(withoutCredits), whole(streamed)) : ONE;
  const gainNet = mul(whole(remaining), scale);
  const frankedNet = mul(whole(netFranked), scale);
  const gross = whole(GROSS_UP[concessions]); // eslint-disable-line security/detect-object-injection -- a checked choice

  /** @param {Fraction} gainShare @param {Fraction} frankedShare */
  const streams = (gainShare, frankedShare) => ({
    gainShare,
    attributable: gain ? div(mul(gainNet, gainShare), G) : ZERO,
    frankedShare,
    frankedAttributable: franked ? div(mul(frankedNet, frankedShare), F) : ZERO,
    credit: franked ? div(mul(whole(credits), frankedShare), F) : ZERO,
    // s 102UY(4): the part of the share that was in the trust's income.
    inIncome: add(gain ? div(mul(gainShare, whole(gainIncome)), G) : ZERO, franked ? div(mul(frankedShare, whole(netFranked)), F) : ZERO),
  });
  const shares = beneficiaries.map((b, i) => streams(add(specific[i].gain, mul(gainLeft, adjusted[i])),
    add(specific[i].franked, mul(frankedLeft, adjusted[i]))));
  const trusteeShares = streams(mul(gainLeft, trusteeAdjusted), mul(frankedLeft, trusteeAdjusted));

  // Division 6E: income and net income without the streamed amounts, and present entitlements without them.
  const income6E = otherIncome > 0n ? otherIncome : 0n;
  const net6E = whole(otherNet > 0n ? otherNet : 0n);
  const entitled6E = beneficiaries.map((b, i) => sub(whole(b.entitlement), shares[i].inIncome));
  if (income6E > 0n) {
    entitled6E.forEach((e, i) => {
      if (sign(e) < 0) refuse(`${beneficiaries[i].name}: the Division 6E present entitlement is below nil, which the calculator does not settle.`);
    });
    if (sign(sub(whole(unentitled), trusteeShares.inIncome)) < 0) {
      refuse('The income no beneficiary is presently entitled to, less the trustee’s share of the streamed amounts, is below nil, which the calculator does not settle.');
    }
  }
  const percentage6E = entitled6E.map((e) => (income6E > 0n ? div(e, whole(income6E)) : ZERO));
  const division6 = percentage6E.map((p) => mul(net6E, p));
  const trusteeDivision6 = division6.reduce((t, d) => sub(t, d), net6E);

  const KIND_DISCOUNT = { individual: true, trust: true, company: false };
  const out = beneficiaries.map((b, i) => {
    const s = shares[i];
    const extra = mul(s.attributable, gross);
    // s 115-215(4): the beneficiary's own discount if it can have one, then the small business 50% reduction.
    let ownNet = extra;
    if ((concessions === 'discount' || concessions === 'both') && KIND_DISCOUNT[/** @type {'individual'} */ (b.kind)]) ownNet = div(ownNet, whole(2n));
    if (concessions === 'small_business' || concessions === 'both') ownNet = div(ownNet, whole(2n));
    const assessable = add(add(add(division6[i], ownNet), s.frankedAttributable), s.credit);
    return {
      name: b.name, kind: b.kind, presentEntitlement: money(whole(b.entitlement)),
      specificGain: money(specific[i].gain), specificFranked: money(specific[i].franked),
      adjustedPercentage: needed ? percent(adjusted[i]) : null,
      division6EPercentage: percent(percentage6E[i]), division6: money(division6[i]),
      gainShare: money(s.gainShare), attributableGain: money(s.attributable), extraCapitalGain: money(extra), netCapitalGain: money(ownNet),
      frankedShare: money(s.frankedShare), attributableFranked: money(s.frankedAttributable), frankingCredit: money(s.credit),
      assessable: money(assessable),
    };
  });

  const trusteeGain = mul(trusteeShares.attributable, gross);
  const trusteeAmount = add(add(add(trusteeDivision6, trusteeGain), trusteeShares.frankedAttributable), trusteeShares.credit);
  const tax = mul(trusteeAmount, [45n, 100n]);
  const afterOffset = sub(tax, trusteeShares.credit);
  const beneficiaryAmounts = [...division6, ...shares.map((s) => s.attributable), ...shares.map((s) => s.frankedAttributable)];
  const trustee = {
    unentitledIncome: money(whole(unentitled)), adjustedPercentage: needed ? percent(trusteeAdjusted) : null,
    division6: money(trusteeDivision6), gainShare: money(trusteeShares.gainShare), attributableGain: money(trusteeShares.attributable),
    grossedUpGain: money(trusteeGain), frankedShare: money(trusteeShares.frankedShare), attributableFranked: money(trusteeShares.frankedAttributable),
    frankingCredit: money(trusteeShares.credit), assessable: money(trusteeAmount),
    // s 99A(4) when no part of the net income is a beneficiary's, (4A) when part is.
    provision: sign(trusteeAmount) <= 0 ? null : beneficiaryAmounts.some((a) => sign(a) > 0) ? 's 99A(4A)' : 's 99A(4)',
    tax: money(tax), offset: money(trusteeShares.credit), taxAfterOffset: money(sign(afterOffset) > 0 ? afterOffset : ZERO),
  };
  // Flat figures for the boundary cases: beneficiary n's as b<n>..., then the trust's and the trustee's.
  const flat = Object.fromEntries(out.flatMap((b, i) => [[`b${i + 1}Division6`, b.division6], [`b${i + 1}AttributableGain`, b.attributableGain],
    [`b${i + 1}ExtraCapitalGain`, b.extraCapitalGain], [`b${i + 1}AttributableFranked`, b.attributableFranked],
    [`b${i + 1}FrankingCredit`, b.frankingCredit], [`b${i + 1}Assessable`, b.assessable]]));
  return {
    ...flat, netIncome: money(whole(netIncome)), trusteeAssessable: trustee.assessable, trusteeTax: trustee.tax,
    trusteeTaxAfterOffset: trustee.taxAfterOffset,
    amounts: {
      trustIncome: money(whole(trustIncome)), netIncome: money(whole(netIncome)), division6EIncome: money(whole(income6E)),
      division6ENetIncome: money(net6E), netFranked: money(whole(netFranked)), adjustedBase: needed ? money(base) : null,
      gainLeft: money(gainLeft), frankedLeft: money(frankedLeft),
      reducedGain: money(gainNet), reducedFranked: money(frankedNet), reduced: less(scale, ONE),
    },
    grossUp: Number(GROSS_UP[concessions]), // eslint-disable-line security/detect-object-injection -- a checked choice
    beneficiaries: out, trustee,
  };
}

const KIND_WORDS = { individual: 'an individual', company: 'a company', trust: 'a trust' };
const CONCESSION_WORDS = { none: 'no discount', discount: 'the 50% CGT discount', small_business: 'the small business 50% reduction',
  both: 'the CGT discount and the small business 50% reduction' };

/** The form's inputs as the engine takes them. @param {(name: string) => string} value @returns {TrustStreamingInput} */
export function trustStreamingFormInput(value) {
  const beneficiaries = [];
  for (let n = 1; n <= TRUST_STREAMING_ROWS; n += 1) {
    const name = value(`b${n}-name`);
    const figures = ['entitlement', 'gain', 'franked'].map((f) => value(`b${n}-${f}`));
    if (!name.trim() && figures.every((f) => !f.trim() || Number(f) === 0)) continue;
    beneficiaries.push({ name, kind: value(`b${n}-kind`), present_entitlement: figures[0] || '0', capital_gain_entitled: figures[1] || '0',
      franked_entitled: figures[2] || '0' });
  }
  return { other_trust_income: value('other-income'), other_net_income: value('other-net'), franked_distributions: value('franked'),
    franking_credits: value('credits'), franked_deductions: value('franked-deductions'), capital_gain: value('gain'),
    capital_gain_remaining: value('gain-remaining'), capital_gain_concessions: value('concessions'), capital_gain_trust_income: value('gain-income'),
    beneficiaries };
}

/** How the page writes the inputs. @param {TrustStreamingInput} x @param {(value: number) => string} aud */
export function trustStreamingInputsText(x, aud) {
  const m = (/** @type {string} */ t) => aud(Number(t));
  const parts = [`other trust income ${m(x.other_trust_income)}, other net income ${m(x.other_net_income)}`];
  if (Number(x.franked_distributions)) {
    parts.push(`franked distributions ${m(x.franked_distributions)} with franking credits ${m(x.franking_credits)}`
      + `${Number(x.franked_deductions) ? ` and directly relevant deductions ${m(x.franked_deductions)}` : ''}`);
  }
  if (Number(x.capital_gain)) {
    parts.push(`capital gain ${m(x.capital_gain)}, ${m(x.capital_gain_remaining)} after losses and ${CONCESSION_WORDS[/** @type {'none'} */ (x.capital_gain_concessions)] ?? 'concessions'}, `
      + `${m(x.capital_gain_trust_income)} in trust income`);
  }
  const people = x.beneficiaries.map((b) => `${b.name.trim() || 'a beneficiary'} (${KIND_WORDS[/** @type {'individual'} */ (b.kind)] ?? b.kind}) entitled to ${m(b.present_entitlement)}`
    + `${Number(b.capital_gain_entitled) ? `, ${m(b.capital_gain_entitled)} of it from the capital gain` : ''}`
    + `${Number(b.franked_entitled) ? `, ${m(b.franked_entitled)} of it from franked distributions` : ''}`);
  parts.push(people.length ? `beneficiaries: ${people.join('; ')}` : 'no beneficiary presently entitled');
  return parts.join('; ');
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function trustStreamingResult(value, aud) {
  const input = trustStreamingFormInput(value);
  const r = trustStreaming(input);
  const t = r.trustee;
  const pct = (/** @type {number | null} */ p) => (p === null ? 'not needed' : `${p.toLocaleString('en-AU', { maximumFractionDigits: 2 })}%`);
  const rows = [['Net income of the trust', aud(r.amounts.netIncome)], ['Division 6E net income, shared by present entitlement', aud(r.amounts.division6ENetIncome)],
    ['Beneficiaries’ assessable income from the trust, together', aud(r.beneficiaries.reduce((s, b) => s + b.assessable, 0))],
    [`Trustee assessed under ${t.provision ?? 'section 99A'}, no beneficiary presently entitled`, aud(t.assessable)],
    ['Trustee’s tax at 45%', aud(t.tax)], ['Less the trustee’s franking credit offset', aud(t.offset)], ['Trustee’s tax after the offset', aud(t.taxAfterOffset)]];
  const tables = {
    beneficiaries: [...r.beneficiaries.map((b) => [b.name, aud(b.division6), aud(b.extraCapitalGain), aud(b.netCapitalGain), aud(b.attributableFranked),
      aud(b.frankingCredit), aud(b.assessable)]),
    ['Trustee, s 99A', aud(t.division6), aud(t.grossedUpGain), aud(t.grossedUpGain), aud(t.attributableFranked), aud(t.frankingCredit), aud(t.assessable)]],
    shares: [...r.beneficiaries.map((b) => [b.name, aud(b.presentEntitlement), aud(b.specificGain), aud(b.specificFranked), pct(b.adjustedPercentage),
      aud(b.gainShare), aud(b.frankedShare), pct(b.division6EPercentage)]),
    ['Trustee', aud(t.unentitledIncome), aud(0), aud(0), pct(t.adjustedPercentage), aud(t.gainShare), aud(t.frankedShare), 'the rest']],
  };
  const notes = [];
  if (r.amounts.reduced) notes.push(`Net income without franking credits is less than the net capital gain and net franked distributions together, so both are reduced rateably, to ${aud(r.amounts.reducedGain)} and ${aud(r.amounts.reducedFranked)}`);
  if (r.grossUp > 1) notes.push(`Each extra capital gain is the attributable gain times ${r.grossUp}, reversing ${CONCESSION_WORDS[/** @type {'none'} */ (input.capital_gain_concessions)]}; the net capital gain assumes the beneficiary has no other gains or losses`);
  notes.push('Assessable income here is the Division 6 share, the net capital gain, the attributable franked distribution and the franking credit');
  return { inputs: trustStreamingInputsText(input, aud), rows, principal: 6, note: notes.join('. '), tables };
}
