// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { RENTAL_LINES, rentalProperty } from './rental-property.mjs';

// The rental property page's form and result: the form's fields as the command's input, how the page
// writes that input, and the result's rows, table and notes.

export const RENTAL_FORM_LOANS = 2;
export const RENTAL_FORM_WORKS = 2;
export const RENTAL_FORM_ASSETS = 2;
const LINES = Object.keys(RENTAL_LINES);
const blank = (/** @type {string} */ text) => text.trim() === '';
const dash = (/** @type {string} */ key) => key.replaceAll('_', '-');
const numbers = (/** @type {number} */ count) => Array.from({ length: count }, (_, i) => i + 1);
/** The lines given, by key, from the fields `<prefix>-<line>`. @param {(name: string) => string} value @param {string} prefix @param {string[]} keys */
const given = (value, prefix, keys) => Object.fromEntries(keys.filter((k) => !blank(value(`${prefix}-${dash(k)}`)))
  .map((k) => [k, value(`${prefix}-${dash(k)}`)]));

/** The capital works items and depreciating assets the form gives. @param {(name: string) => string} value */
function formItems(value) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  /** An optional yes or no answer, left out when not answered. @param {string} key @param {string} name */
  const answered = (key, name) => (value(name) === '' ? {} : { [key]: yes(name) });
  const works = numbers(RENTAL_FORM_WORKS).filter((n) => !blank(value(`works-cost-${n}`))).map((n) => ({
    construction_expenditure: value(`works-cost-${n}`), kind: value(`works-kind-${n}`), began: value(`works-began-${n}`),
    first_used: value(`works-first-${n}`), ...answered('taken_to_begin_before_16_september_1987', `works-contract-${n}`) }));
  const assets = numbers(RENTAL_FORM_ASSETS).filter((n) => !blank(value(`asset-decline-${n}`))).map((n) => ({
    decline_in_value: value(`asset-decline-${n}`), acquired: value(`asset-acquired-${n}`), first_used: value(`asset-first-${n}`),
    held_when_first_used: yes(`asset-held-${n}`), residence_or_private_use: yes(`asset-private-${n}`), low_value_pool: yes(`asset-pool-${n}`),
    ...answered('new_premises_exception', `asset-new-${n}`), ...answered('deductible_in_2016_17', `asset-2016-${n}`) }));
  return { works, assets };
}

/** The command's input from the form: up to 2 loans, 2 capital works items and 2 assets, and the year's borrowing
 * expenses deduction from the borrowing expenses calculator. @param {(name: string) => string} value */
export function rentalFormInput(value) {
  const days = value('days');
  const { works, assets } = formItems(value);
  /** @type {Record<string, unknown>} */
  const input = { year: value('year'), ownership_share: value('share'), acquired: value('acquired'),
    disposed: blank(value('disposed')) ? null : value('disposed'), days_available: /^\d+$/.test(days) ? Number(days) : days,
    section_26_50_applies: value('holiday') === 'yes', income: given(value, 'income', ['rental_income', 'other_rental_income']),
    expenses: given(value, 'exp', LINES), rental_only_expenses: given(value, 'only', LINES.filter((k) => k !== 'travel')),
    loans: numbers(RENTAL_FORM_LOANS).filter((n) => !blank(value(`loan-interest-${n}`))).map((n) => ({ interest: value(`loan-interest-${n}`),
      principal_for_rental: value(`loan-rental-${n}`), principal_total: value(`loan-total-${n}`), redrawn_in_year: value(`loan-redrawn-${n}`) === 'yes' })),
    borrowing_expenses: blank(value('borrowing')) ? '0' : value('borrowing'), capital_works: works, depreciating_assets: assets };
  // The effect on tax is worked from 2024-25, so an earlier year's net rent is worked without it.
  if (!blank(value('other-income')) && value('year') >= '2024-25') input.other_taxable_income = value('other-income');
  // The select is required, so the page sends the answer; a call without it is taken as confirmed.
  if (value('scope') !== '') input.scope_confirmed = value('scope') === 'yes';
  return input;
}

const longDay = (/** @type {string} */ iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** How the page writes the command's input. @param {Record<string, any>} input @param {(value: number) => string} aud */
export function rentalInputsText(input, aud) {
  const money = (/** @type {unknown} */ text) => aud(Number(text));
  const sum = (/** @type {Record<string, string>} */ lines) => Object.values(lines).reduce((s, v) => s + Number(v), 0);
  const parts = [input.year, `legal interest ${input.ownership_share}`,
    `held from ${longDay(input.acquired)}${input.disposed ? ` to ${longDay(input.disposed)}` : ''}`, `${input.days_available} days let or available`,
    `rental income ${money(sum(input.income))}`, `expenses apportioned by days ${money(sum(input.expenses) - Number(input.expenses.travel ?? 0))}`,
    `expenses solely for renting ${money(sum(input.rental_only_expenses))}`];
  if (input.expenses.travel !== undefined) parts.push(`travel ${money(input.expenses.travel)}`);
  input.loans.forEach((/** @type {Record<string, string>} */ l, /** @type {number} */ i) => parts.push(`loan ${i + 1}: interest `
    + `${money(l.interest)}, ${money(l.principal_for_rental)} of ${money(l.principal_total)} for the rental${l.redrawn_in_year ? ', redrawn' : ''}`));
  if (input.borrowing_expenses !== undefined) parts.push(`borrowing expenses ${money(input.borrowing_expenses)}`);
  input.capital_works.forEach((/** @type {Record<string, string>} */ w, /** @type {number} */ i) => parts.push(`capital works ${i + 1}: `
    + `${money(w.construction_expenditure)}, ${w.kind.replace('_', ' ')} begun ${longDay(w.began)}, first used ${longDay(w.first_used)}`));
  input.depreciating_assets.forEach((/** @type {Record<string, string>} */ a, /** @type {number} */ i) => parts.push(`asset ${i + 1}: `
    + `decline in value ${money(a.decline_in_value)}`));
  if (input.other_taxable_income !== undefined) parts.push(`other taxable income ${money(input.other_taxable_income)}`);
  return parts.join('; ');
}

/** The deduction lines, each loan, asset and capital works item under its line.
 * @param {ReturnType<typeof rentalProperty>} r @param {(value: number) => string} aud */
function deductionRows(r, aud) {
  const a = r.amounts;
  const rows = LINES.filter((k) => k in a).map((k) => [k === 'travel' ? 'Travel, not deductible (s 26-31)'
    : RENTAL_LINES[/** @type {keyof typeof RENTAL_LINES} */ (k)], aud(a[k])]);
  rows.push(['Interest', aud(a.interest)], ...r.loans.map((l) => [`Loan ${l.loan}: ${aud(l.interest)} of interest, ${aud(l.principalForRental)} of ${aud(l.principalTotal)} principal for the rental`, aud(l.deduction)]));
  rows.push(['Borrowing expenses', aud(a.borrowing_expenses)], ['Decline in value', aud(a.decline_in_value)]);
  rows.push(...r.assets.map((x, i) => [`Asset ${i + 1}: decline in value ${aud(x.decline)}${x.why ? ', nil under s 40-27' : ''}`, aud(x.deduction)]));
  rows.push(['Capital works', aud(a.capital_works)], ...r.capitalWorks.map((w, i) => [`Capital works ${i + 1}: ${w.kind.replace('_', ' ')} begun `
    + `${longDay(w.began)}${w.rate === null ? ', nil' : `, ${w.rate === '0.04' ? '4%' : '2.5%'} for ${w.daysUsed} days, `
    + `${aud(/** @type {number} */ (w.undeducted))} undeducted`}`, aud(w.deduction)]));
  return rows;
}

/** The page's result: the net rent and the effect on tax as rows, each deduction in the table.
 * @param {(name: string) => string} value @param {(value: number) => string} aud */
export function rentalPropertyResult(value, aud) {
  const input = rentalFormInput(value);
  const r = rentalProperty(input);
  const a = r.amounts;
  const rows = [['Your share of the rent', aud(a.gross_rent)], ['Total deductions', aud(a.total_deductions)],
    ['Net rent, a loss if negative', aud(a.net_rent)]];
  const notes = [];
  if (a.travel_denied) notes.push(`Travel of ${aud(a.travel_denied)} at your interest is not deductible (ITAA 1997 s 26-31)`);
  r.assets.forEach((x, i) => { if (x.why) notes.push(`Asset ${i + 1} is nil: ${x.why}`); });
  r.capitalWorks.forEach((w, i) => { if (w.why) notes.push(`Capital works ${i + 1} is nil: ${w.why}`); });
  if (!('tax_effect' in a) && value('year') < '2024-25') notes.push('The effect on tax is worked from 2024-25 only');
  if ('tax_effect' in a) {
    rows.push([`Tax on ${aud(a.taxable_income_without_rental)} without the rental`, aud(a.tax_without_rental)],
      [`Tax on ${aud(a.taxable_income_with_rental)} with the net rent`, aud(a.tax_with_rental)],
      ['Less tax because of the rental, more if negative', aud(a.tax_effect)]);
    notes.push('The tax is at the resident scale only: the Medicare levy, the surcharge, offsets and study loan repayments are left out');
    if (a.taxable_income_without_rental + Math.trunc(a.net_rent) < 0) {
      notes.push('The loss beyond your other taxable income is a tax loss (Division 36), not worked out here');
    }
  }
  return { inputs: rentalInputsText(input, aud), rows, principal: 2, note: notes.join('. '), tables: { deductions: deductionRows(r, aud) } };
}
