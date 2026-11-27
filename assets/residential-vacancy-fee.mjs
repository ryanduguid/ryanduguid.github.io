// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The annual vacancy fee for a foreign owner of a residential dwelling: Part 6A of the Foreign Acquisitions and
// Takeovers Act 1975 (ss 115A to 115T), Division 4A of the Foreign Acquisitions and Takeovers Regulation 2015 (ss 43C
// and 43D) and the Foreign Acquisitions and Takeovers Fees Imposition Act 2015 and Regulations 2020, for vacancy years
// starting in 2020-21 to 2026-27. The `residential-vacancy-fee` command of ryanduguid/australian-accounting ported
// line for line: its inputs, order of checks, refusal codes, fee schedule from 1 January 2021 to 30 June 2027, the
// doubling for vacancy years from 9 April 2024, the tripled established dwelling fees and the cap floor. The command
// read the compilations and the ATO and Treasury pages its source names on 24 November 2026.

import { addMonths, cmp, decText, flag, formatDay, int, money, monthsEnd, mul, parseDay, parseDec, quantize, readCall, refuse,
  rendered, scopeYear, yearFirst } from './aa-port.mjs';

export const RVF_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21'];
const PERIODS = [...RVF_YEARS].reverse();
/** @type {import('./aa-port.mjs').Param[]} */
const PARAMS = ['vacancy_year_start', 'held_full_vacancy_year', 'residentially_occupied_days', 'return_lodged_on_time', 'exemption',
  'acquisition_basis', 'ownership', 'application_fee_waiver', 'vacancy_fee_waiver_or_remission', 'year', 'scope_confirmed']
  .map((key) => [key, 'raw']);
/** @type {import('./aa-port.mjs').Param[]} */
const OPTIONAL = [['application_fee_payable', 'dec'], ['consideration', 'dec'], ['dwelling_kind', 'raw'], ['application_date', 'raw'],
  ['ownership_share', 'raw']];
const DAY = (/** @type {string} */ text) => /** @type {number} */ (parseDay(text));
const APRIL_2024 = DAY('2024-04-09');
const CAP_FLOOR = 7_791_000;
export const RVF_EXEMPTIONS = {
  damaged_unsafe_or_unsuitable: 'FATR 2015 s 43D(2)(a) and (3)(a): dwelling damaged, unsafe or otherwise unsuitable to be occupied as a residence',
  substantial_repairs_or_renovations: 'FATR 2015 s 43D(2)(a) and (3)(b): dwelling undergoing substantial repairs or renovations',
  legal_restriction_or_court_order: 'FATR 2015 s 43D(2)(a) and (3)(c): occupation prohibited or made impracticable by a court or tribunal order or a Commonwealth, State or Territory law',
  medical_or_residential_care: 'FATR 2015 s 43D(2)(b): ordinary occupant absent to receive medical care, residential care or funded aged care services in a residential care home, supported by evidence',
};
// Fees Imposition Regulations 2020: from, to, de minimis, tier one, tier step, residential cap, established dwellings tripled.
const SCHEDULE = /** @type {const} */ ([
  ['2021-01-01', '2021-06-30', 2000, 6350, 12700, 500000, false], ['2021-07-01', '2022-06-30', 2000, 6350, 12700, 503000, false],
  ['2022-07-01', '2022-07-28', 2000, 6600, 13200, 522500, false], ['2022-07-29', '2023-06-30', 4000, 13200, 26400, 1045000, false],
  ['2023-07-01', '2024-04-08', 4200, 14100, 28200, 1119100, false], ['2024-04-09', '2024-06-30', 4200, 14100, 28200, 1119100, true],
  ['2024-07-01', '2025-06-30', 4300, 14700, 29500, 1171600, true], ['2025-07-01', '2026-06-30', 4500, 15100, 30300, 1205200, true],
  ['2026-07-01', '2027-06-30', 4600, 15600, 31300, 1245500, true]]);
// Fees Imposition Act 2015 s 6(3) statutory fee cap (Fees Regulations s 61A).
const CAPS = /** @type {const} */ ([['2021-01-01', '2021-06-30', 1000000], ['2021-07-01', '2022-06-30', 1006000],
  ['2022-07-01', '2023-06-30', 1045000], ['2023-07-01', '2024-04-08', 1119100], ['2024-04-09', '2024-06-30', 7000000],
  ['2024-07-01', '2025-06-30', 7329000], ['2025-07-01', '2026-06-30', 7539000], ['2026-07-01', '2027-06-30', CAP_FLOOR]]);

/** @typedef {import('./aa-port.mjs').Dec} Dec */
/** @typedef {import('./aa-port.mjs').Step} Step */
/** @typedef {{ deMinimis: number, tierOne: number, tierStep: number, cap: number, triple: boolean }} Schedule */
/** @typedef {{ steps: Step[], rates: [string, string][], base: Dec, basis: string, kind?: string, appDay?: number }} FeeBase */

/** @param {number} day @returns {Schedule | null} */
function scheduleFor(day) {
  const row = SCHEDULE.find(([from, to]) => day >= DAY(from) && day <= DAY(to));
  return row ? { deMinimis: row[2], tierOne: row[3], tierStep: row[4], cap: row[5], triple: row[6] } : null;
}

const invalid = (/** @type {string} */ what, /** @type {string} */ message) => refuse(`residential_vacancy_fee.${what}`, message);

/** The vacancy year and the stated facts, in the command's order. @param {Record<string, any>} v */
function parseVacancy(v) {
  const year = scopeYear(v, PERIODS);
  const first = /** @type {number} */ (yearFirst(year));
  const start = parseDay(v.vacancy_year_start) ?? refuse('input.date_invalid', 'vacancy_year_start must be a YYYY-MM-DD date from 1900 to 2100.');
  if (start < DAY(`${first}-07-01`) || start > DAY(`${first + 1}-06-30`)) invalid('date_outside_year', `vacancy_year_start must be in the ${year} financial year, from ${first}-07-01 to ${first + 1}-06-30.`);
  const end = monthsEnd(start, 12);
  const heldFull = flag(v.held_full_vacancy_year, 'held_full_vacancy_year');
  const occupied = v.residentially_occupied_days;
  if (!Number.isInteger(occupied) || occupied < 0 || occupied > end - start + 1) invalid('days_invalid', `residentially_occupied_days must be a JSON integer from 0 to ${end - start + 1} for this vacancy year.`);
  const lodged = flag(v.return_lodged_on_time, 'return_lodged_on_time');
  const exemption = v.exemption === null ? null : typeof v.exemption === 'string' && Object.hasOwn(RVF_EXEMPTIONS, v.exemption) ? v.exemption
    : invalid('exemption_invalid', 'exemption must be null or one of damaged_unsafe_or_unsuitable, substantial_repairs_or_renovations, legal_restriction_or_court_order or medical_or_residential_care.');
  const basis = parseBasis(v.acquisition_basis);
  if (!['sole', 'joint_tenants', 'tenants_in_common'].includes(v.ownership)) invalid('ownership_invalid', 'ownership must be sole, joint_tenants or tenants_in_common.');
  const waived = parseWaiver(v.application_fee_waiver, basis);
  if (flag(v.vacancy_fee_waiver_or_remission, 'vacancy_fee_waiver_or_remission')) {
    invalid('discretionary_waiver_unsupported', 'Discretionary waiver or remission of a vacancy fee under FATA s 115H is decided case by case by the Treasurer or Commissioner and cannot be calculated here.');
  }
  let status = 'liable_vacant';
  if (!heldFull) status = 'not_required';
  else if (!lodged) status = 'deemed_liable_late_return';
  else if (occupied >= 183) status = 'not_liable_occupied';
  else if (exemption) status = 'exempt';
  return { year, start, end, heldFull, lodged, exemption, basis, ownership: /** @type {string} */ (v.ownership), waived, status };
}

/** @param {unknown} given */
function parseBasis(given) {
  if (given === 'build_to_rent') {
    invalid('build_to_rent_unsupported', 'Build-to-rent developments receive case-by-case commercial-rate fee waivers under FATA s 115 and bespoke Treasury vacancy-fee reporting conditions (Guidance Note 6 Section I, Guidance Note 10 Section L) and are outside this worksheet.');
  }
  if (!['notifiable_action', 'developer_exemption_certificate', 'other_exemption_certificate', 'no_notice_order'].includes(/** @type {string} */ (given))) {
    invalid('acquisition_basis_invalid', 'acquisition_basis must be notifiable_action, developer_exemption_certificate, other_exemption_certificate, no_notice_order or build_to_rent.');
  }
  return /** @type {string} */ (given);
}

/** Whether the application fee was waived in full. @param {unknown} given @param {string} basis */
function parseWaiver(given, basis) {
  if (given === 'none') return false;
  if (given === 'partial') invalid('partial_waiver_unsupported', "Partial waivers of the original application fee fall outside Fees Regulations 2020 Part 3's full-waiver substitution rules and depend on case-by-case Treasury waiver or remission under FATA s 115H.");
  if (given !== 'full') invalid('waiver_invalid', 'application_fee_waiver must be none, full or partial.');
  if (basis === 'developer_exemption_certificate') invalid('waiver_invalid', 'application_fee_waiver cannot be full for developer_exemption_certificate: under Fees Regulations s 44 the purchaser paid no personal application fee to waive.');
  if (basis === 'other_exemption_certificate') invalid('other_ec_waiver_unsupported', 'Under Fees Regulations s 45(b), a waived fee for another exemption certificate uses the lowest Division 7 fee for that specific certificate kind, which depends on the Division 7 category (s 32, s 33 or s 34) and is outside this worksheet.');
  return true;
}

/** @param {Record<string, any>} v @param {string} basis */
function dwellingKind(v, basis) {
  const kind = v.dwelling_kind;
  if (kind !== 'new_or_near_new' && kind !== 'established') invalid('dwelling_kind_invalid', 'dwelling_kind is required and must be new_or_near_new or established.');
  if (basis === 'developer_exemption_certificate' && kind === 'established') invalid('dwelling_kind_invalid', 'dwelling_kind cannot be established for developer_exemption_certificate: Fees Regulations s 44 covers only s 57 new dwellings and reg 43A near-new dwelling interests certificates.');
  return /** @type {string} */ (kind);
}

/** @param {Record<string, any>} v @param {string} basis @param {number} start @returns {[number, Schedule]} */
function applicationDate(v, basis, start) {
  const unsupported = (/** @type {string} */ m) => invalid('application_date_unsupported', m);
  if (!Object.hasOwn(v, 'application_date')) unsupported('application_date (YYYY-MM-DD, from 2021-01-01 to 2027-06-30) is required to determine the statutory residential fee schedule.');
  const day = parseDay(v.application_date) ?? refuse('input.date_invalid', 'application_date must be a YYYY-MM-DD date from 1900 to 2100.');
  const schedule = scheduleFor(day) ?? unsupported('application_date must be from 2021-01-01 to 2027-06-30, where the Fees Imposition Regulations 2020 residential fee schedule is verified. For a pre-2021 notified acquisition, supply application_fee_payable directly.');
  if ((basis === 'notifiable_action' || basis === 'developer_exemption_certificate') && day > start) {
    unsupported('application_date cannot be after vacancy_year_start for a notified acquisition or developer exemption certificate.');
  }
  return [day, schedule];
}

/** A tenant in common's share, strictly between 0 and 1. @param {Record<string, any>} v @param {string} ownership @returns {Dec | null} */
function ownershipShare(v, ownership) {
  const given = Object.hasOwn(v, 'ownership_share');
  if (ownership !== 'tenants_in_common') {
    if (given) invalid('ownership_invalid', 'ownership_share applies only to tenants_in_common (Fees Regulations s 57(2)); omit it for sole or joint_tenants.');
    return null;
  }
  if (!given) invalid('ownership_invalid', 'ownership_share (a decimal string strictly between 0 and 1) is required for tenants_in_common when deriving the application fee from the statutory schedule.');
  const text = v.ownership_share;
  const share = typeof text === 'string' && new TextEncoder().encode(text).length <= 32 ? parseDec(text) : null;
  if (share && share.finite !== false && cmp(share, int(0)) > 0 && cmp(share, int(1)) < 0) return share;
  return invalid('ownership_invalid', 'ownership_share must be a decimal string strictly between 0 and 1 for tenants_in_common (use sole for a 100% owner).');
}

/** The whole property's fee, then this owner's: all of it, or a tenant in common's share to the cent. @param {Step} whole @param {Dec | null} share */
function shareSteps(whole, share) {
  if (!share) {
    return { steps: [whole, { id: 'application_fee_base', authority: 'Fees Regulations 2020 Part 3 (ss 43 to 46) and s 57(1): full residential application fee basis for a sole owner or joint tenancy', value: whole.value }], base: whole.value };
  }
  const base = quantize(mul(whole.value, share), -2, 'half-up');
  return { steps: [whole, { id: 'application_fee_base', authority: "Fees Regulations 2020 s 57(2): tenant in common's proportionate share of the application fee", value: base }], base };
}

/** Fees Regulations ss 43(a), 45(a) and 46(a): the application fee stated. @param {Record<string, any>} v @param {string} basis @param {boolean} waived @returns {FeeBase} */
function statedFee(v, basis, waived) {
  const bad = (/** @type {string} */ m) => invalid('application_fee_invalid', m);
  if (waived) bad('Omit application_fee_payable when application_fee_waiver is full.');
  if (basis === 'developer_exemption_certificate') bad('Omit application_fee_payable for developer_exemption_certificate: Fees Regulations s 44 derives the notional Division 2 fee from consideration, dwelling_kind and application_date.');
  if (OPTIONAL.slice(1).some(([key]) => Object.hasOwn(v, key))) bad('Supply either application_fee_payable alone, or consideration, dwelling_kind and application_date (with ownership_share for tenants_in_common), not both.');
  const fee = money(v.application_fee_payable);
  if (cmp(fee, int(0)) <= 0) bad('application_fee_payable must be above nil.');
  // eslint-disable-next-line security/detect-object-injection -- basis is a parsed acquisition basis, one of these fixed keys
  const authority = {
    notifiable_action: 'Fees Regulations 2020 s 43(a): Division 2 Part 2 application fee payable by the person for the s 81 notice',
    other_exemption_certificate: 'Fees Regulations 2020 s 45(a): Division 7 Part 2 application fee payable by the person for the exemption certificate',
    no_notice_order: 'Fees Regulations 2020 s 46(a): s 23 application fee payable by the person for the Division 2 Part 3 order or no objection notification',
  }[/** @type {'notifiable_action'} */ (basis)];
  return { steps: [{ id: 'application_fee_base', authority, value: fee }], rates: [], base: fee, basis: 'stated_application_fee' };
}

/** Fees Regulations ss 43(b) and 46(b): the tier one fee for a fee waived in full. @param {Record<string, any>} v @param {ReturnType<typeof parseVacancy>} p @returns {FeeBase} */
function waivedFee(v, p) {
  if (Object.hasOwn(v, 'consideration')) invalid('consideration_invalid', 'Omit consideration when application_fee_waiver is full: Fees Regulations ss 43(b) and 46(b) substitute s 10 item 1 regardless of consideration.');
  const share = ownershipShare(v, p.ownership);
  if (p.start >= APRIL_2024) {
    const kind = dwellingKind(v, p.basis);
    const [appDay, schedule] = applicationDate(v, p.basis, p.start);
    const triple = kind === 'established' && schedule.triple ? 3 : 1;
    const whole = { id: 'whole_property_application_fee', authority: `Fees Regulations 2020 s ${p.basis === 'notifiable_action' ? '43(b)' : '46(b)'} (as amended by Act No. 17 of 2024) and s 10(1) item 1, (2): notional tier-1 fee in force when the notice was given`, value: int(schedule.tierOne * triple) };
    return { ...shareSteps(whole, share), rates: [['tier_one_fee', String(schedule.tierOne)], ['established_multiplier', String(triple)]], basis: 'waived_tier_one', kind, appDay };
  }
  const unsettled = (/** @type {string} */ m) => invalid('pre_2024_waiver_boundary_unsettled', m);
  if (!p.lodged) unsettled('For a pre-9 April 2024 vacancy year with a waived application fee and a late return, the s 10 item 1 amount turns on when the Commissioner issues the s 115E notice or the fee becomes payable, which is outside this worksheet.');
  if (Object.hasOwn(v, 'application_date') || Object.hasOwn(v, 'dwelling_kind')) invalid('application_fee_invalid', 'For a vacancy year starting before 9 April 2024 with a waived application fee, omit application_date and dwelling_kind: pre-9 April 2024 Fees Regulations ss 43(b) and 46(b) use the s 10 item 1 amount in force when the vacancy fee becomes payable.');
  const [atEnd, atDue] = [scheduleFor(p.end), scheduleFor(p.end + 30)];
  if (!atEnd || !atDue) return unsettled('The vacancy year end or 30-day return window lies outside the verified Fees Regulations 2020 schedule dates.');
  if (atEnd.tierOne !== atDue.tierOne) unsettled(`The 30-day return window (${formatDay(p.end)} to ${formatDay(p.end + 30)}) crosses a change in the s 10 item 1 fee ($${atEnd.tierOne} to $${atDue.tierOne}), so the pre-9 April 2024 waived-fee amount depends on the exact date the fee became payable.`);
  const whole = { id: 'whole_property_application_fee', authority: 'Fees Regulations 2020 (pre-9 April 2024 compilation) s 43(b) or s 46(b) and s 10 item 1: lowest residential tier fee', value: int(atEnd.tierOne) };
  return { ...shareSteps(whole, share), rates: [['tier_one_fee', String(atEnd.tierOne)]], basis: 'waived_tier_one' };
}

/** The whole property's notional fee from its consideration. @param {string} basis @param {Dec} consideration @param {Schedule} s @param {number} triple @returns {{ step: Step, rates: [string, string][] }} */
function wholeFee(basis, consideration, s, triple) {
  const id = 'whole_property_application_fee';
  if (cmp(consideration, int(75_000)) < 0) {
    if (basis === 'developer_exemption_certificate') invalid('de_minimis_developer_ec_unsettled', 'Consideration below $75,000 under a developer exemption certificate hits the unsettled boundary between Fees Regulations s 44(2) (Division 2 of Part 2) and s 53(1) (de minimis rule despite Part 2).');
    return { step: { id, authority: 'Fees Regulations 2020 s 53(1): de minimis residential application fee for consideration below $75,000 (3x for established dwellings from 9 April 2024)', value: int(s.deMinimis * triple) },
      rates: [['de_minimis_fee', String(s.deMinimis)], ['established_multiplier', String(triple)]] };
  }
  if (cmp(consideration, int(1_000_000)) <= 0) {
    return { step: { id, authority: 'Fees Regulations 2020 s 9 item 1 and s 10(1) item 1, (2): residential land fee for consideration up to $1 million (3x for established dwellings from 9 April 2024)', value: int(s.tierOne * triple) },
      rates: [['tier_one_fee', String(s.tierOne)], ['established_multiplier', String(triple)]] };
  }
  // s 11(1) for an exact multiple of $1,000,000, else s 11(2).
  const floored = (consideration.c * 10n ** BigInt(Math.max(consideration.e, 0))) / 10n ** BigInt(6 - Math.min(consideration.e, 0));
  const multiple = cmp(mul({ s: false, c: floored, e: 0 }, int(1_000_000)), consideration) === 0 ? floored - 1n : floored;
  const single = BigInt(s.tierStep) * multiple;
  const capped = single > BigInt(s.cap) ? BigInt(s.cap) : single;
  return { step: { id, authority: 'Fees Regulations 2020 s 9 item 1, s 10(1) items 2 and 3, s 10(2) and s 11: residential land fee above $1 million, capped at the s 10 maximum (3x for established dwellings from 9 April 2024)', value: { s: false, c: capped * BigInt(triple), e: 0 } },
    rates: [['tier_step', String(s.tierStep)], ['tier_multiple', String(multiple)], ['residential_fee_cap', String(s.cap)], ['established_multiplier', String(triple)]] };
}

/** Fees Regulations ss 43(b), 44 and 46(b) with Part 2: the notional fee. @param {Record<string, any>} v @param {ReturnType<typeof parseVacancy>} p @returns {FeeBase} */
function notionalFee(v, p) {
  if (p.basis === 'other_exemption_certificate') invalid('application_fee_invalid', 'Supply application_fee_payable for other_exemption_certificate: Fees Regulations s 45(a) uses the Division 7 fee payable for that certificate (ss 32, 33 or 34).');
  if (!Object.hasOwn(v, 'consideration')) invalid('consideration_invalid', 'Supply either application_fee_payable, or consideration with dwelling_kind and application_date.');
  const consideration = money(v.consideration);
  if (cmp(consideration, int(0)) <= 0) invalid('consideration_invalid', 'consideration must be above nil.');
  const kind = dwellingKind(v, p.basis);
  const [appDay, schedule] = applicationDate(v, p.basis, p.start);
  const share = ownershipShare(v, p.ownership);
  const triple = kind === 'established' && schedule.triple ? 3 : 1;
  const whole = wholeFee(p.basis, consideration, schedule, triple);
  return { ...shareSteps(whole.step, share), rates: whole.rates, basis: 'notional_schedule', kind, appDay };
}

const NIL_AUTHORITY = {
  not_required: 'FATA 1975 s 115C(2) and s 115D(3) note: no vacancy year completed because the foreign person ceased to hold the interest or ceased to be a foreign person during the year',
  not_liable_occupied: 'FATA 1975 s 115C(1) and (4): dwelling residentially occupied for 183 or more days in the vacancy year and return lodged on time',
};
const OWNERSHIP_NOTES = {
  sole: 'Sole foreign owner: lodges one return and is liable for the full vacancy fee if payable.',
  joint_tenants: 'Joint tenants (FATA s 115D(4), Fees Regulations s 57(1)): one return by any foreign joint tenant with the same vacancy year satisfies the lodgment obligation, and one vacancy fee is payable jointly.',
  tenants_in_common: 'Tenants in common (Fees Regulations s 57(2)): each foreign tenant in common must lodge a separate vacancy fee return and pays only their own proportionate share.',
};

/** The vacancy fee from the fee base: nil, or the base (doubled from 9 April 2024) under the cap floor. @param {ReturnType<typeof parseVacancy>} p @param {Dec} base @param {number} multiplier @returns {{ steps: Step[], cap?: number }} */
function vacancySteps(p, base, multiplier) {
  const liable = p.status === 'liable_vacant' || p.status === 'deemed_liable_late_return';
  if (!liable) {
    const authority = p.status === 'exempt' ? RVF_EXEMPTIONS[/** @type {keyof typeof RVF_EXEMPTIONS} */ (p.exemption)] : NIL_AUTHORITY[/** @type {keyof typeof NIL_AUTHORITY} */ (p.status)];
    return { steps: [{ id: 'uncapped_vacancy_fee', authority, value: int(0) }, { id: 'vacancy_fee_payable', authority, value: int(0) }] };
  }
  const uncapped = mul(base, int(multiplier));
  const floor = CAPS.find(([from, to]) => p.end >= DAY(from) && p.end <= DAY(to))?.[2] ?? CAP_FLOOR;
  if (cmp(uncapped, int(floor)) > 0) {
    invalid('cap_unsettled', `The uncapped vacancy fee ($${decText(uncapped)}) exceeds the Fees Imposition Act 2015 s 6(3) statutory fee cap floor at vacancy_year_end ($${floor}). Because the applicable indexed cap under s 7 and Fees Regulations s 61A can rise if the Commissioner's s 115E notice or s 115F due date falls after a later 1 July indexation, and this worksheet takes no notice date, a fee above the cap floor is refused.`);
  }
  return { cap: floor, steps: [
    { id: 'uncapped_vacancy_fee', authority: multiplier === 2 ? 'Fees Regulations 2020 Part 3 (ss 43 to 46) and s 67(2) (Act No. 17 of 2024): double the application fee basis for vacancy years starting on or after 9 April 2024' : 'Fees Regulations 2020 Part 3 (ss 43 to 46, pre-9 April 2024 compilation): equal to the application fee basis for vacancy years starting before 9 April 2024', value: uncapped },
    { id: 'vacancy_fee_payable', authority: 'Fees Imposition Act 2015 ss 6(3) and 7(3) and Fees Regulations 2020 s 61A: uncapped vacancy fee does not exceed the non-decreasing statutory fee cap floor, so the cap cannot bind regardless of s 115E notice or s 115F due date', value: uncapped }] };
}

/**
 * The command's result for one dwelling and one vacancy year: period, amounts (cents, half up), rates, the vacancy year,
 * the return's due date and record keeping, the liability and the notes the command gives.
 * @param {Record<string, unknown>} call
 */
export function residentialVacancyFee(call) {
  const v = readCall(call, 'residential-vacancy-fee', PARAMS, OPTIONAL);
  const p = parseVacancy(v);
  let fee;
  if (Object.hasOwn(v, 'application_fee_payable')) fee = statedFee(v, p.basis, p.waived);
  else fee = p.waived ? waivedFee(v, p) : notionalFee(v, p);
  const multiplier = p.start >= APRIL_2024 ? 2 : 1;
  const vacancy = vacancySteps(p, fee.base, multiplier);
  const rates = [...fee.rates, ['vacancy_fee_multiplier', String(multiplier)]];
  if (vacancy.cap) rates.push(['statutory_fee_cap_floor', String(vacancy.cap)]);
  const { amounts, steps } = rendered([...fee.steps, ...vacancy.steps]);
  const liable = p.status === 'liable_vacant' || p.status === 'deemed_liable_late_return';
  const banned = fee.kind === 'established' && /** @type {number} */ (fee.appDay) >= DAY('2025-04-01') && /** @type {number} */ (fee.appDay) <= DAY('2029-06-30');
  return { calculation: 'residential_vacancy_fee', period: p.year, amounts, rates: Object.fromEntries(rates), steps,
    vacancy_year_start: formatDay(p.start), vacancy_year_end: formatDay(p.end), days_in_vacancy_year: p.end - p.start + 1,
    return_required: p.heldFull, return_due_date: p.heldFull ? formatDay(p.end + 30) : null,
    record_retention_until: p.heldFull ? formatDay(addMonths(p.end, 60)) : null, liable, liability_status: p.status,
    fee_basis: fee.basis, exemption_applied: p.status === 'exempt' ? p.exemption : null,
    payment_due_rule: liable ? 'Due on the day specified in the s 115E notice of liability, at least 21 days after the notice is given (FATA 1975 s 115F).' : null,
    civil_penalty_units: 500, joint_ownership_note: OWNERSHIP_NOTES[/** @type {keyof typeof OWNERSHIP_NOTES} */ (p.ownership)],
    established_dwelling_ban_note: banned ? "Foreign persons are generally banned from purchasing established dwellings from 1 April 2025 to 30 June 2029 unless a limited exception applies (ATO 'Types of property a foreign person can buy' and Treasury GN6 v5)." : null };
}

/** The command's call from the page's form. @param {(name: string) => string} value */
export function rvfFormInput(value) {
  const waived = value('waiver') === 'full';
  const start = value('start');
  /** @type {Record<string, unknown>} */
  const call = { vacancy_year_start: start, held_full_vacancy_year: value('held') === 'yes',
    residentially_occupied_days: /^\d+$/.test(value('days').trim()) ? Number(value('days').trim()) : value('days'),
    return_lodged_on_time: value('lodged') === 'yes', exemption: value('exemption') || null, acquisition_basis: value('basis'),
    ownership: value('ownership'), application_fee_waiver: waived ? 'full' : 'none', vacancy_fee_waiver_or_remission: false,
    year: value('year'), scope_confirmed: true };
  if (!waived && value('from') === 'stated') return { ...call, application_fee_payable: value('fee').trim() };
  if (!waived) call.consideration = value('consideration').trim();
  if (!waived || start >= '2024-04-09') Object.assign(call, { dwelling_kind: value('kind'), application_date: value('applied') });
  if (value('ownership') === 'tenants_in_common') call.ownership_share = value('share').trim();
  return call;
}

const BASIS_WORDS = { notifiable_action: 'notified', developer_exemption_certificate: 'developer certificate',
  other_exemption_certificate: 'other certificate', no_notice_order: 'order' };

/** How a call reads on the page. @param {Record<string, any>} x @param {(value: number) => string} aud */
export function rvfInputsText(x, aud) {
  const parts = [`${x.year}; vacancy year from ${x.vacancy_year_start}; ${x.residentially_occupied_days} days occupied`];
  if (!x.held_full_vacancy_year) parts.push('not held all year');
  if (!x.return_lodged_on_time) parts.push('return late');
  if (x.exemption) parts.push(String(x.exemption).replace(/_/g, ' '));
  parts.push(`${BASIS_WORDS[/** @type {keyof typeof BASIS_WORDS} */ (x.acquisition_basis)] ?? x.acquisition_basis}, ${String(x.ownership).replace(/_/g, ' ')}`);
  if (x.application_fee_payable !== undefined) parts.push(`application fee ${aud(Number(x.application_fee_payable))}`);
  else parts.push(x.application_fee_waiver === 'full' ? 'application fee waived' : `consideration ${aud(Number(x.consideration))}`);
  if (x.dwelling_kind) parts.push(`${x.dwelling_kind === 'established' ? 'established' : 'new or near-new'} dwelling notified ${x.application_date}`);
  if (x.ownership_share !== undefined) parts.push(`share ${x.ownership_share}`);
  return parts.join('; ');
}

/** The amounts a page shows for one call, as numbers. @param {Record<string, unknown>} input */
export function rvfFigures(input) {
  const r = residentialVacancyFee(input);
  return { applicationFeeBase: Number(r.amounts.application_fee_base), vacancyFee: Number(r.amounts.vacancy_fee_payable) };
}

const PAGE_REFUSALS = {
  'input.amount_invalid': 'Enter each amount from $0 to $1,000,000,000,000, to the cent.',
  'input.decimal_unreadable': 'Enter each amount as a number, such as 1250.50.',
  'input.date_invalid': 'Enter each date as a day from 1900 to 2100.',
  'residential_vacancy_fee.days_invalid': 'Enter the days occupied as a whole number no more than the days in the vacancy year.',
  'residential_vacancy_fee.date_outside_year': 'Choose the financial year the vacancy year starts in.',
};
const STATUS_WORDS = { not_required: 'No return: not held as a foreign person all year', deemed_liable_late_return: 'Liable: return not lodged on time',
  not_liable_occupied: 'Not liable: occupied 183 days or more', exempt: 'Not liable: exempt', liable_vacant: 'Liable: occupied fewer than 183 days' };

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function rvfResult(value, aud) {
  const input = rvfFormInput(value);
  let r;
  try {
    r = residentialVacancyFee(input);
  } catch (error) {
    const words = PAGE_REFUSALS[/** @type {keyof typeof PAGE_REFUSALS} */ (/** @type {{ code?: string }} */ (error).code)];
    throw words ? new Error(words) : error;
  }
  const a = r.amounts;
  const rows = [['Vacancy year', `${r.vacancy_year_start} to ${r.vacancy_year_end}`],
    ['Liability', STATUS_WORDS[/** @type {keyof typeof STATUS_WORDS} */ (r.liability_status)]],
    ['Application fee basis', aud(Number(a.application_fee_base))], ['Vacancy fee multiplier', r.rates.vacancy_fee_multiplier]];
  const principal = rows.push(['Vacancy fee payable', aud(Number(a.vacancy_fee_payable))]) - 1;
  if (r.return_due_date) rows.push(['Return due', r.return_due_date], ['Keep records until', /** @type {string} */ (r.record_retention_until)]);
  return { inputs: rvfInputsText(input, aud), rows, principal,
    note: 'The fee is the application fee for the dwelling, doubled for a vacancy year from 9 April 2024; it is payable on the date in the notice of liability' };
}
