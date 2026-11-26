// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// A partnership's net income or partnership loss (ITAA 1936 s 90) and each partner's share of it and of exempt and
// non-assessable non-exempt income (s 92): the `partnership-net-income` command of ryanduguid/australian-accounting's
// solomons-sword ported line for line, with its inputs, order of checks, refusal texts and rounding (each share half up
// to the cent, the cents left over to the largest shares first). ss 90 to 92 read on the Federal Register of
// Legislation (Compilation No. 193, 1 October 2026) on 27 November 2026.

import { add, cents, cmp, d, div, fixed2, adjusted, isFiniteDec, isZero, mul, parse, quantize, str, sub } from './exact-decimal.mjs';

/** Income years 2024-25 to 2026-27, as the years ending 30 June the command takes. */
export const PARTNERSHIP_YEARS = /** @type {const} */ ([2025, 2026, 2027]);
export const PARTNERSHIP_PAGE_PARTNERS = 4;

const OUT_OF_SCOPE = /** @type {const} */ ([
  ['corporate_limited_partnership', 'a corporate limited partnership is taxed as a company', 'Div 5A ITAA 1936'],
  ['venture_capital_partnership', "a VCLP, ESVCLP, AFOF or VCMP limits limited partners' loss deductions", 'ss 92(2AA), 92A ITAA 1936'],
  ['foreign_hybrid', "a foreign hybrid limited partnership limits partners' loss deductions", 's 92(2) ITAA 1936; s 830-45 ITAA 1997'],
  ['uncontrolled_partnership_income', 'a partner without real and effective control of their share is taxed under s 94', 's 94 ITAA 1936'],
  ['segregated_or_pension_asset_interest', "a partner's interest that is a segregated exempt asset or segregated current pension asset takes no loss deduction", 's 92(2A) ITAA 1936'],
  ['partner_salaries_or_interest', "salary or interest allocated to partners changes each partner's individual interest and is not modelled", 's 92 ITAA 1936'],
]);
export const PARTNERSHIP_OUT_OF_SCOPE = OUT_OF_SCOPE.map(([key, what]) => /** @type {const} */ ([key, what]));

const STEPS = [
  'The partnership lodges a return but is not liable to tax on its income (s 91).',
  'Net income: assessable income less deductions other than those under s 290-150 or Division 36 ITAA 1997, as if the partnership were a resident taxpayer; a partnership loss is the excess of those deductions (s 90).',
  'Each partner includes their individual interest in the net income, or deducts their interest in the partnership loss (s 92(1), (2)), and includes their interest in exempt and non-assessable non-exempt income (s 92(3), (4)).',
  "A non-resident partner takes only the part from Australian sources; this command decides that only when all the partnership's income is from Australian sources (s 92(1)(b) to (4)(b)).",
  "Shares are rounded half up to the cent; cents left over go to the largest shares first, so shares add up to the partnership's figure.",
];

const ZERO = d('0');
const HUNDRED = d('100');

/** A refusal as the command words one. @param {string} reason @param {string} provision */
export const refusal = (reason, provision) => `refused: ${reason} (${provision})`;
/** @param {string} message */
const fail = (message) => Object.assign(new Error(message), { code: 'refused' });

/** @param {Record<string, unknown>} v @param {string} key */
const absent = (v, key) => v[key] === undefined || v[key] === null;

/** @param {Record<string, unknown>} v @param {string} key */
export function text(v, key) {
  const t = v[key];
  if (typeof t !== 'string') throw fail(`${key} must be a string`);
  return t;
}

/** @param {Record<string, unknown>} v @param {string} key */
export function integer(v, key) {
  const n = v[key];
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw fail(`${key} must be an integer`);
  return n;
}

/** @param {Record<string, unknown>} v @param {string} key */
export function decimal(v, key) {
  const t = text(v, key);
  if (new TextEncoder().encode(t).length > 8192) throw fail(`${key}: decimal input exceeds 8192 bytes`);
  const x = parse(t.replaceAll('_', ''));
  if (!x) throw fail('decimal.InvalidOperation');
  return x;
}

/** @param {Record<string, unknown>} v */
export function year(v) {
  const fy = integer(v, 'financial_year');
  if (fy < 2025 || fy > 2027) throw fail(refusal(`financial_year ${fy} is outside 2025 (2024-25) to 2027 (2026-27)`, 'years this command covers'));
  return fy;
}

/** A non-negative amount in dollars and cents below 1E+15; omitted or null is nil. @param {Record<string, unknown>} v @param {string} key */
export function money(v, key) {
  if (absent(v, key)) return ZERO;
  const x = decimal(v, key);
  const bad = !isFiniteDec(x) || (x.neg && !isZero(x) ? true : false) || (!isZero(x) && adjusted(x) > 14) || cmp(quantize(x, -2), x) !== 0;
  if (bad) throw fail(`${key} must be a non-negative amount below 1E+15 with at most 2 decimal places`);
  return x;
}

/** A percentage from 0 to 100 inclusive. @param {Record<string, unknown>} v @param {string} key */
export function percentage(v, key) {
  const x = decimal(v, key);
  if (!isFiniteDec(x) || (x.neg && !isZero(x)) || cmp(x, HUNDRED) > 0) throw fail(`${key} must be a percentage from 0 to 100`);
  return x;
}

/** @param {Record<string, unknown>} v @param {string} key */
export function flag(v, key) {
  const b = v[key];
  if (b === undefined || b === null) return false;
  if (typeof b !== 'boolean') throw fail(`${key} must be true or false`);
  return b;
}

/** True, false or unstated (null). @param {Record<string, unknown>} v @param {string} key @returns {boolean | null} */
export function fact(v, key) {
  const b = v[key];
  if (b === undefined || b === null) return null;
  if (typeof b !== 'boolean') throw fail(`${key} must be true, false or null`);
  return b;
}

/** @param {Record<string, unknown>} v @param {string} key @returns {unknown[]} */
export function array(v, key) {
  const a = v[key];
  if (a === undefined) return [];
  if (!Array.isArray(a)) throw fail(`${key} must be an array`);
  return a;
}

/** Splits `total` by `weights`: each part half up to the cent, the cents left over or overdrawn to the largest parts first.
 * @param {import('./exact-decimal.mjs').Dec} total @param {import('./exact-decimal.mjs').Dec[]} weights */
function shareOut(total, weights) {
  const exact = weights.map((w) => mul(total, w));
  const parts = exact.map(cents);
  const order = parts.map((_, i) => i).sort((a, b) => cmp(exact[b], exact[a]));
  let left = parts.reduce((t, p) => sub(t, p), total);
  const cent = left.neg && !isZero(left) ? d('-0.01') : d('0.01');
  for (const i of order) {
    if (isZero(left)) break;
    parts[i] = add(parts[i], cent);
    left = sub(left, cent);
  }
  return parts;
}

/** @param {unknown} p @param {boolean | null} australian */
function partner(p, australian) {
  const row = /** @type {Record<string, unknown>} */ (p && typeof p === 'object' && !Array.isArray(p) ? p : {});
  const residency = text(row, 'residency');
  if (residency === 'non_resident' && australian !== true) {
    throw fail(refusal("a non-resident partner's share is limited to income from Australian sources; state all_income_from_australian_sources true or leave the partner out", 's 92(1)(b) ITAA 1936'));
  }
  if (residency === 'part_year') throw fail(refusal('a partner resident for part of the year takes shares attributable to periods', 's 92(1) ITAA 1936'));
  if (residency !== 'resident' && residency !== 'non_resident') throw fail('residency must be resident, non_resident or part_year');
  return { name: text(row, 'name'), residency, interest: percentage(row, 'interest_percentage') };
}

/** @param {Record<string, any>} v */
export function partnershipNetIncome(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw fail('input must be a JSON object');
  const fy = year(v);
  for (const [key, what, law] of OUT_OF_SCOPE) if (flag(v, key)) throw fail(refusal(what, law));
  const assessable = money(v, 'assessable_income');
  const deductions = money(v, 'deductions');
  const excluded = money(v, 'excluded_deductions');
  if (cmp(excluded, deductions) > 0) throw fail('excluded_deductions is part of deductions and cannot exceed it');
  const counted = sub(deductions, excluded);
  const [net, loss] = cmp(assessable, counted) < 0 ? [ZERO, sub(counted, assessable)] : [sub(assessable, counted), ZERO];
  const exempt = money(v, 'exempt_income');
  const nane = money(v, 'non_assessable_non_exempt_income');
  const australian = fact(v, 'all_income_from_australian_sources');
  const list = array(v, 'partners').map((p) => partner(p, australian));
  const total = list.reduce((t, p) => add(t, p.interest), ZERO);
  if (list.length === 0 || cmp(total, HUNDRED) !== 0) throw fail(`partners' interest_percentage must total 100, not ${str(total)}`);
  const weights = list.map((p) => div(p.interest, HUNDRED));
  const split = [net, loss, exempt, nane].map((x) => shareOut(x, weights));
  return {
    financial_year: fy, assessable_income: fixed2(assessable), deductions_counted: fixed2(counted), excluded_deductions: fixed2(excluded),
    net_income: fixed2(net), partnership_loss: fixed2(loss), exempt_income: fixed2(exempt), non_assessable_non_exempt_income: fixed2(nane),
    partners: list.map((p, i) => ({ name: p.name, residency: p.residency, interest_percentage: str(p.interest),
      assessable_income: fixed2(split[0][i]), deductible_loss: fixed2(split[1][i]), exempt_income: fixed2(split[2][i]),
      non_assessable_non_exempt_income: fixed2(split[3][i]) })),
    steps: STEPS,
  };
}

/** `2025-26` for 2026. @param {number} fy */
export const partnershipYearText = (fy) => `${fy - 1}-${String(fy % 100).padStart(2, '0')}`;

/** The form's call: a partner row is left out when its name is blank. @param {(name: string) => string} value */
export function partnershipFormInput(value) {
  const partners = [];
  for (let n = 1; n <= PARTNERSHIP_PAGE_PARTNERS; n += 1) {
    const name = value(`partner-${n}-name`).trim();
    if (name === '') continue;
    partners.push({ name, residency: value(`partner-${n}-residency`), interest_percentage: value(`partner-${n}-interest`).trim() });
  }
  /** @type {Record<string, unknown>} */
  const call = { financial_year: Number(value('year')) };
  for (const key of ['assessable_income', 'deductions', 'excluded_deductions', 'exempt_income', 'non_assessable_non_exempt_income']) {
    const given = value(key.replaceAll('_', '-')).trim();
    call[key] = given === '' ? '0' : given; // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
  }
  call.all_income_from_australian_sources = value('australian') === 'yes';
  const scope = value('scope');
  if (scope !== 'none') call[scope] = true; // eslint-disable-line security/detect-object-injection -- a value from the page's own select
  call.partners = partners;
  return call;
}

/** How the page writes the call. @param {Record<string, any>} x @param {(value: number) => string} aud */
export function partnershipInputsText(x, aud) {
  const partners = x.partners.map((/** @type {Record<string, string>} */ p) => `${p.name} ${p.interest_percentage}%${p.residency === 'non_resident' ? ' (non-resident)' : ''}`);
  return `${partnershipYearText(x.financial_year)}; assessable income ${aud(Number(x.assessable_income))}, deductions ${aud(Number(x.deductions))}`
    + `${Number(x.excluded_deductions) ? ` (${aud(Number(x.excluded_deductions))} under s 290-150 or Division 36)` : ''}`
    + `${Number(x.exempt_income) ? `, exempt income ${aud(Number(x.exempt_income))}` : ''}`
    + `${Number(x.non_assessable_non_exempt_income) ? `, non-assessable non-exempt income ${aud(Number(x.non_assessable_non_exempt_income))}` : ''}`
    + `; partners: ${partners.join(', ')}`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function partnershipResult(value, aud) {
  const input = partnershipFormInput(value);
  const partners = /** @type {Record<string, string>[]} */ (input.partners);
  if (partners.length === 0) throw new Error('Enter at least one partner with a name and interest.');
  if (partners.some((p) => p.residency === 'non_resident') && !input.all_income_from_australian_sources) {
    throw new Error('A foreign resident partner’s share is limited to income from Australian sources (section 92(1)(b)): choose Yes for all the income being from Australian sources, or leave the partner out.');
  }
  const total = partners.reduce((sum, p) => sum + Number(p.interest_percentage), 0);
  if (partners.every((p) => /^\d+(\.\d+)?$/.test(p.interest_percentage)) && Math.abs(total - 100) > 1e-9) {
    throw new Error(`Enter partner interests that total 100%; these total ${Number(total.toPrecision(12))}%.`);
  }
  const r = partnershipNetIncome(input);
  const isLoss = Number(r.partnership_loss) > 0;
  const rows = [['Assessable income', aud(Number(r.assessable_income))], ['Deductions counted (s 90)', aud(Number(r.deductions_counted))]];
  const principal = rows.push(isLoss ? ['Partnership loss (s 90)', aud(Number(r.partnership_loss))] : ['Net income (s 90)', aud(Number(r.net_income))]) - 1;
  for (const p of r.partners) {
    rows.push([`${p.name} (${p.interest_percentage}%): ${isLoss ? 'share of the loss to deduct' : 'share of net income'}`,
      aud(Number(isLoss ? p.deductible_loss : p.assessable_income))]);
    if (Number(p.exempt_income)) rows.push([`${p.name}: share of exempt income`, aud(Number(p.exempt_income))]);
    if (Number(p.non_assessable_non_exempt_income)) rows.push([`${p.name}: share of non-assessable non-exempt income`, aud(Number(p.non_assessable_non_exempt_income))]);
  }
  return { inputs: partnershipInputsText(input, aud), rows, principal,
    note: 'Each share is rounded half up to the cent; any cent left over goes to the largest share' };
}
