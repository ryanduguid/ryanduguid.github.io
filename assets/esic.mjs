// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The early stage investor tax offset (ITAA 1997 Subdivision 360-A) for one investor's shares in one company in an
// income year from 2016-17 to 2026-27: the early stage innovation company tests (s 360-40), the 100-point innovation
// test (s 360-45) from the items stated, the investor tests (ss 360-15(1) and 360-20), the 20% offset (s 360-25(1)),
// its $200,000 cap (s 360-25(2)) and whether the modified CGT treatment (Subdivision 360-B) follows. The `esic`
// command of ryanduguid/australian-accounting ported line for line: its inputs, order of checks, refusal codes, tests,
// findings and rounding. The command read the ATO legal database text with its history notes on 24 November 2026:
// Act No. 8 of 2020 Sch 2 for income years from 2018-19 and Act No. 92 of 2020 Sch 5 item 37 from 2021-22.

import { add, cmp, decText, flag, int, isZero, money, mul, readCall, refuse, rendered, scopeYear, sub, yearFirst } from './aa-port.mjs';

export const ESIC_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21', '2019-20', '2018-19',
  '2017-18', '2016-17'];
const PERIODS = [...ESIC_YEARS].reverse();
const AMENDED_2020 = 2018;
const POINTS = [75, 75, 50, 50, 50, 50, 25, 25];
/** @type {import('./aa-port.mjs').Param[]} */
const PARAMS = [['investor', 'raw'], ['affiliate_of_company', 'raw'], ['ess_interests', 'raw'], ['more_than_30_percent', 'raw'],
  ['amount_paid', 'dec'], ['non_cash_benefit', 'dec'], ['disclosure_exemption', 'raw'], ['incorporated_year', 'raw'],
  ['abr_registered_year', 'raw'], ['expenses_three_prior_years', 'dec'], ['total_expenses_previous_year', 'dec'],
  ['assessable_income_previous_year', 'dec'], ['accelerating_commercialisation_grant', 'dec'], ['rd_clawback_income', 'dec'],
  ['listed', 'raw'], ['foreign_company', 'raw'], ['innovation_items', 'raw'], ['principles_test', 'raw'], ['other_offsets', 'dec'],
  ['carried_forward_offsets', 'dec'], ['year', 'raw'], ['scope_confirmed', 'raw']];
/** @type {import('./aa-port.mjs').Param[]} */
const OPTIONAL = [['other_companies_paid', 'dec'], ['amount_receivable', 'dec'], ['other_companies_exempt', 'raw']];

/** @typedef {import('./aa-port.mjs').Dec} Dec */
/** @typedef {{ test: string, authority: string, met: boolean | null, finding: string }} Row */
/** @typedef {{ v: Record<string, any>, current: number, rows: Row[] }} Work */

/** @param {Work} w @param {string} test @param {string} authority @param {boolean | null} met @param {string} finding */
const addRow = (w, test, authority, met, finding) => { w.rows.push({ test, authority, met, finding }); };
/** @param {Work} w */
const allMet = (w) => w.rows.every((r) => r.met !== false);

/** s 360-15(1)(a): null when the investor may be entitled, else why not. @param {unknown} given @param {number} first */
function investorKind(given, first) {
  if (given === 'individual' || given === 'company') return null;
  if (given === 'widely_held_company') return 'a widely held company or a 100% subsidiary of one (s 360-15(1)(a)(ii))';
  if (given === 'esvclp' && first >= AMENDED_2020) return 'an ESVCLP (s 360-15(1)(a)(ia))';
  if (given === 'trust' || given === 'partnership' || given === 'esvclp') {
    refuse('esic.trust_or_partnership_unsupported', 'A trust or partnership is not entitled under ITAA 1997 s 360-15(1)(a)(i), but its members and trustee may be (ss 360-15(2), (3), 360-30 and 360-35), which this worksheet does not work out.');
  }
  return refuse('esic.investor_invalid', 'investor must be individual, company, widely_held_company, esvclp, trust or partnership.');
}

/** An income year given as text, or 'none': its first calendar year. @param {unknown} given @param {string} key @param {number} current */
function yearOrNone(given, key, current) {
  if (given === 'none') return null;
  const first = yearFirst(given);
  if (first === null) refuse('esic.year_invalid', `${key} must be an income year such as 2024-25, or none.`);
  if (first > current) refuse('esic.incorporation_after_year', `${key} is after the income year of the test.`);
  return first;
}

/** s 360-40(1)(a): incorporated or registered recently enough. @param {Work} w */
function ageTest(w) {
  const { v, current } = w;
  const incorporated = yearOrNone(v.incorporated_year, 'incorporated_year', current);
  const registered = yearOrNone(v.abr_registered_year, 'abr_registered_year', current);
  const within = (/** @type {number | null} */ year, /** @type {number} */ span) => year !== null && current - year < span;
  if (within(incorporated, 3)) {
    addRow(w, 'incorporation', 'ITAA 1997 s 360-40(1)(a)(i)', true, 'incorporated in Australia within the last 3 income years');
  } else if (within(registered, 3)) {
    addRow(w, 'incorporation', 'ITAA 1997 s 360-40(1)(a)(iii)', true, 'registered in the Australian Business Register within the last 3 income years');
  } else if (within(incorporated, 6)) {
    if (current < AMENDED_2020) {
      refuse('esic.six_year_route_before_2018_19', "Before 2018-19, s 360-40(1)(a)(ii) counted expenses across the last 3 of the 6 income years including the current year (Act No. 8 of 2020 Sch 2 item 12 added 'before the current year'); this worksheet takes the 3 years before it only.");
    }
    const met = cmp(money(v.expenses_three_prior_years), int(1_000_000)) <= 0;
    addRow(w, 'incorporation', 'ITAA 1997 s 360-40(1)(a)(ii)', met, `incorporated in Australia within the last 6 income years, ${met ? 'with total expenses of $1 million or less' : 'but with total expenses over $1 million'} across the 3 income years before the current year`);
  } else {
    addRow(w, 'incorporation', 'ITAA 1997 s 360-40(1)(a)', false, 'neither incorporated in Australia within the last 6 income years nor registered in the Australian Business Register within the last 3');
  }
}

/** s 360-40(1)(c) and (2): the previous year's assessable income counted. @param {Work} w */
function countedIncome({ v, current }) {
  const [income, grant, clawback] = [money(v.assessable_income_previous_year), money(v.accelerating_commercialisation_grant), money(v.rd_clawback_income)];
  if (cmp(add(grant, clawback), income) > 0) {
    refuse('esic.amount_above_income', 'accelerating_commercialisation_grant and rd_clawback_income are parts of assessable_income_previous_year and together cannot exceed it.');
  }
  if (current === 2021 && !isZero(clawback)) {
    refuse('esic.clawback_year_unsettled', 's 360-40(2)(b) applies to assessments for income years commencing on or after 1 July 2021 (Act No. 92 of 2020 Sch 5 item 37) and refers to s 355-450(1) as that Act amended it; a 2020-21 amount tested in 2021-22 is not decided here.');
  }
  return current >= 2022
    ? { id: 'counted_assessable_income', authority: "ITAA 1997 s 360-40(1)(c) and (2): the previous year's assessable income, disregarding an Accelerating Commercialisation Grant and a s 355-450(1) amount", value: sub(sub(income, grant), clawback) }
    : { id: 'counted_assessable_income', authority: 'ITAA 1997 s 360-40(1)(c) and (2) as in force before Act No. 92 of 2020 Sch 5 item 37: disregarding an Accelerating Commercialisation Grant only', value: sub(income, grant) };
}

/** s 360-45(1): the points of the items stated to apply. @param {unknown} given */
function innovationPoints(given) {
  const invalid = () => refuse('esic.innovation_items_invalid', 'innovation_items must be a list of distinct whole numbers from 1 to 8, the s 360-45(1) table items that apply.');
  if (!Array.isArray(given)) invalid();
  const seen = Array(8).fill(false);
  for (const item of /** @type {unknown[]} */ (given)) {
    if (!Number.isInteger(item) || /** @type {number} */ (item) < 1 || /** @type {number} */ (item) > 8 || seen[/** @type {number} */ (item) - 1]) invalid();
    seen[/** @type {number} */ (item) - 1] = true;
  }
  if (seen[0] && seen[2]) refuse('esic.innovation_items_conflict', 'Items 1 (at least 50% of total expenses) and 3 (at least 15% but less than 50%) cannot both apply.');
  if (seen[5]) seen[6] = false; // Item 7 applies only 'unless item 6 applies'.
  return POINTS.reduce((sum, p, i) => sum + (seen[i] ? p : 0), 0); // eslint-disable-line security/detect-object-injection -- i is an index of the 8 items
}

/** s 360-40(1)(b) to (f): expenses, income, listing, innovation and foreign company. @param {Work} w @param {Dec} income */
function companyTests(w, income) {
  const { v, current } = w;
  const expenses = money(v.total_expenses_previous_year);
  addRow(w, 'total_expenses', 'ITAA 1997 s 360-40(1)(b)', cmp(expenses, int(1_000_000)) <= 0, `total expenses of $${decText(expenses)} in the previous income year, limit $1,000,000`);
  addRow(w, 'assessable_income', 'ITAA 1997 s 360-40(1)(c)', cmp(income, int(200_000)) <= 0, `assessable income counted of $${decText(income)} in the previous income year, limit $200,000`);
  addRow(w, 'not_listed', 'ITAA 1997 s 360-40(1)(d)', !flag(v.listed, 'listed'), 'equity interests listed for quotation on a stock exchange: stated');
  const points = innovationPoints(v.innovation_items);
  const principles = flag(v.principles_test, 'principles_test');
  addRow(w, 'innovation', 'ITAA 1997 s 360-40(1)(e)', points >= 100 || principles, `${points} points under s 360-45(1); principles-based test stated ${principles ? 'met' : 'not met'}`);
  const foreign = flag(v.foreign_company, 'foreign_company');
  if (current >= AMENDED_2020) {
    addRow(w, 'not_foreign_company', 'ITAA 1997 s 360-40(1)(f)', !foreign, 'a foreign company within the meaning of the Corporations Act 2001: stated');
  } else {
    addRow(w, 'not_foreign_company', 'ITAA 1997 s 360-40(1)(f), inserted by Act No. 8 of 2020 for income years from 2018-19', null, 'not a test before 2018-19');
  }
  return points;
}

/** s 360-15(1)(d) to (f): the stated facts, each of which must be false. @param {Work} w */
function investorTests(w) {
  const thirty = w.current >= AMENDED_2020
    ? ['ITAA 1997 s 360-15(1)(f)', 'more than 30% of income, capital or voting rights in the company or a connected entity']
    : ['ITAA 1997 s 360-15(1)(f) before Act No. 8 of 2020', 'more than 30% of the equity interests in the company or a connected entity'];
  const rows = [
    ['not_affiliate', 'ITAA 1997 s 360-15(1)(d)', 'the investor and the company affiliates of each other', 'affiliate_of_company'],
    ['not_ess_interests', 'ITAA 1997 s 360-15(1)(e)', 'an acquisition of ESS interests under an employee share scheme', 'ess_interests'],
    ['not_more_than_30_percent', ...thirty, 'more_than_30_percent'],
  ];
  for (const [id, authority, fact, key] of rows) {
    const stated = flag(w.v[key], key);
    addRow(w, id, authority, !stated, `${fact}: stated ${stated ? 'yes' : 'no'}`);
  }
}

/** The amount paid to other companies and whether an offer of theirs was exempt: given exactly when this company's offers had no disclosure exemption. @param {Record<string, any>} v */
function paidElsewhere(v) {
  const exempt = flag(v.disclosure_exemption, 'disclosure_exemption');
  const [paid, other] = [Object.hasOwn(v, 'other_companies_paid'), Object.hasOwn(v, 'other_companies_exempt')];
  if (exempt && !paid && !other) return null;
  if (exempt) refuse('input.field_unknown', 'other_companies_paid and other_companies_exempt are inputs only when disclosure_exemption is false');
  if (!paid || !other) refuse('input.missing_field', 'other_companies_paid and other_companies_exempt are required when disclosure_exemption is false.');
  return { elsewhere: money(v.other_companies_paid), otherExempt: flag(v.other_companies_exempt, 'other_companies_exempt') };
}

/** s 360-20: the $50,000 limit where no offer had a disclosure exemption. @param {Work} w @param {Dec} paid @param {Dec} whole */
function retailLimit(w, paid, whole) {
  const given = paidElsewhere(w.v);
  if (!given) {
    addRow(w, 'retail_limit', 'ITAA 1997 s 360-20(1)(a)', null, 's 708(8), (10) or (11) of the Corporations Act 2001 removed the need for a disclosure document for an offer: no $50,000 limit');
    return;
  }
  const limit = int(50_000);
  // On money paid; on money receivable and a non-cash benefit too; and the ATO's count across all ESICs.
  const readings = [cmp(paid, limit) > 0, cmp(whole, limit) > 0, !given.otherExempt && cmp(add(whole, given.elsewhere), limit) > 0];
  const unsettled = readings.some((r) => r !== readings[0]);
  if (unsettled && !allMet(w)) {
    addRow(w, 'retail_limit', 'ITAA 1997 s 360-20', null, 'not decided: the readings differ on these amounts, and another test is not met');
    return;
  }
  if (unsettled) {
    refuse('esic.retail_limit_unsettled', "s 360-20(1)(b) counts more than $50,000 paid for this company's shares where none of its offers had a disclosure exemption; the ATO counts investments in all ESICs and lifts the limit for an exempt offer by any of them, and money still receivable or a non-cash benefit may or may not be 'paid'. On these amounts the readings differ.");
  }
  addRow(w, 'retail_limit', 'ITAA 1997 s 360-20', !readings[0], `${readings[0] ? 'more than $50,000' : '$50,000 or less'} paid without a disclosure exemption`);
}

/** s 360-25(1): the amount for the issue of the shares. @param {Work} w @param {Dec} paid @param {Dec} receivable @param {Dec} nonCash */
function baseStep({ v, current }, paid, receivable, nonCash) {
  if (current < AMENDED_2020) {
    return { id: 'offset_base', authority: 'ITAA 1997 s 360-25(1) before Act No. 8 of 2020: the total amount paid for the shares', value: paid };
  }
  const authority = 'ITAA 1997 s 360-25(1)(a) and (b): money received or entitled to be received for the issue, and the market value of any non-cash benefit';
  return { id: 'offset_base', authority, value: Object.hasOwn(v, 'amount_receivable') ? add(add(paid, receivable), nonCash) : add(paid, nonCash) };
}

/** s 360-25: the 20%, the cap room and the offset. @param {Work} w @param {import('./aa-port.mjs').Step} first @param {boolean} entitled */
function offsetSteps({ v }, first, entitled) {
  const [other, carried] = [money(v.other_offsets), money(v.carried_forward_offsets)];
  const gross = entitled
    ? { id: 'gross_offset', authority: 'ITAA 1997 s 360-25(1): 20% of the amount for the issue of the shares', value: mul(first.value, { s: false, c: 20n, e: -2 }) }
    : { id: 'gross_offset', authority: 'ITAA 1997 s 360-15(1): not entitled, a test is not met', value: int(0) };
  const left = sub(sub(int(200_000), other), carried);
  const room = cmp(int(0), left) > 0 ? int(0) : left;
  return [first, gross,
    { id: 'cap_room', authority: 'ITAA 1997 s 360-25(2): $200,000 less the offsets for the year of the investor and its affiliates and those they carry forward to it', value: room },
    { id: 'tax_offset', authority: 'ITAA 1997 s 360-25(2): the offset, reduced so the sum does not exceed $200,000', value: cmp(room, gross.value) < 0 ? room : gross.value }];
}

/**
 * The command's result for one investor's shares in one company: period, amounts (cents, half up), the tests and
 * whether the investor is entitled to the offset and the modified CGT treatment.
 * @param {Record<string, unknown>} call
 */
export function esic(call) {
  const v = readCall(call, 'esic', PARAMS, OPTIONAL);
  const year = scopeYear(v, PERIODS);
  /** @type {Work} */
  const w = { v, current: /** @type {number} */ (yearFirst(year)), rows: [] };
  const notEntitled = investorKind(v.investor, w.current);
  const [paid, receivable, nonCash] = [money(v.amount_paid), Object.hasOwn(v, 'amount_receivable') ? money(v.amount_receivable) : int(0), money(v.non_cash_benefit)];
  if (w.current < AMENDED_2020 && !isZero(nonCash)) {
    refuse('esic.non_cash_before_2018_19', "Before 2018-19, s 360-25(1) took 20% of 'the total amount paid for the shares'; Act No. 8 of 2020 Sch 2 item 8 added the market value of non-cash benefits. This worksheet does not decide what the earlier text counted.");
  }
  ageTest(w);
  const income = countedIncome(w);
  const points = companyTests(w, income.value);
  const isEsic = allMet(w);
  addRow(w, 'investor', 'ITAA 1997 s 360-15(1)(a)', notEntitled === null, notEntitled ?? 'an individual or a company that is not widely held');
  investorTests(w);
  retailLimit(w, paid, add(add(paid, receivable), nonCash));
  const entitled = allMet(w);
  const { amounts, steps } = rendered([income, ...offsetSteps(w, baseStep(w, paid, receivable, nonCash), entitled)]);
  return { calculation: 'esic', period: year, amounts, rates: {}, steps, esic: isEsic, innovation_points: points, entitled,
    modified_cgt_treatment: entitled, tests: w.rows };
}

const yes = (/** @type {string} */ value) => value === 'yes';

/** The command's call from the page's form. @param {(name: string) => string} value */
export function esicFormInput(value) {
  const amount = (/** @type {string} */ name) => value(name).trim() || '0';
  const items = value('items').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  /** @type {Record<string, unknown>} */
  const call = { investor: value('investor'), affiliate_of_company: yes(value('affiliate')), ess_interests: yes(value('ess')),
    more_than_30_percent: yes(value('thirty')), amount_paid: amount('paid'), non_cash_benefit: amount('noncash'),
    disclosure_exemption: yes(value('disclosure')), incorporated_year: value('incorporated'), abr_registered_year: value('registered'),
    expenses_three_prior_years: amount('expenses3'), total_expenses_previous_year: amount('expenses'),
    assessable_income_previous_year: amount('income'), accelerating_commercialisation_grant: amount('grant'),
    rd_clawback_income: amount('clawback'), listed: yes(value('listed')), foreign_company: yes(value('foreign')), innovation_items: items,
    principles_test: yes(value('principles')), other_offsets: amount('others'), carried_forward_offsets: amount('carried'),
    year: value('year'), scope_confirmed: true };
  if (value('receivable').trim()) call.amount_receivable = value('receivable').trim();
  if (!call.disclosure_exemption) Object.assign(call, { other_companies_paid: amount('elsewhere'), other_companies_exempt: yes(value('elsewhereExempt')) });
  return call;
}

/** How a call reads on the page. @param {Record<string, any>} x @param {(value: number) => string} aud */
export function esicInputsText(x, aud) {
  const paid = aud(Number(x.amount_paid) + Number(x.amount_receivable ?? 0) + Number(x.non_cash_benefit));
  const items = x.innovation_items.length ? `items ${x.innovation_items.join(', ')}` : 'no innovation items';
  return `${x.year}; ${String(x.investor).replace(/_/g, ' ')} investing ${paid}; company incorporated ${x.incorporated_year}, `
    + `expenses ${aud(Number(x.total_expenses_previous_year))}, income ${aud(Number(x.assessable_income_previous_year))}; ${items}`;
}

/** The amounts a page shows for one call, as numbers. @param {Record<string, unknown>} input */
export function esicFigures(input) {
  const r = esic(input);
  return { offsetBase: Number(r.amounts.offset_base), taxOffset: Number(r.amounts.tax_offset), points: r.innovation_points };
}

const PAGE_REFUSALS = {
  'input.amount_invalid': 'Enter each amount from $0 to $1,000,000,000,000, to the cent.',
  'input.decimal_unreadable': 'Enter each amount as a number, such as 1250.50.',
  'esic.innovation_items_invalid': 'Enter the innovation test items as distinct numbers from 1 to 8, separated by commas.',
  'esic.year_invalid': 'Choose the year the company was incorporated or registered.',
};

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function esicResult(value, aud) {
  const input = esicFormInput(value);
  let r;
  try {
    r = esic(input);
  } catch (error) {
    const words = PAGE_REFUSALS[/** @type {keyof typeof PAGE_REFUSALS} */ (/** @type {{ code?: string }} */ (error).code)];
    throw words ? new Error(words) : error;
  }
  const a = r.amounts;
  const failed = r.tests.filter((t) => t.met === false).map((t) => t.finding);
  const rows = [['Early stage innovation company', r.esic ? 'Yes' : 'No'], ['Innovation points', String(r.innovation_points)],
    ['Amount for the issue of the shares', aud(Number(a.offset_base))], ['20% of that amount', aud(Number(a.gross_offset))],
    ['Room under the $200,000 cap', aud(Number(a.cap_room))]];
  const principal = rows.push(['Tax offset', aud(Number(a.tax_offset))]) - 1;
  rows.push(['Modified CGT treatment', r.modified_cgt_treatment ? 'Applies to these shares' : 'Does not apply']);
  if (failed.length) rows.push(['Test not met', failed[0]]);
  return { inputs: esicInputsText(input, aud), rows, principal,
    note: 'The offset is 20% of the amount for the issue, capped so the year’s offsets with affiliates and carried forward amounts do not exceed $200,000' };
}
