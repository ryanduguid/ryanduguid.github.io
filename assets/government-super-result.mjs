// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

import { GOVERNMENT_SUPER_YEARS, governmentSuperAmounts, INCOME_INPUTS, SPOUSE_INPUTS } from './government-super.mjs';
export { governmentSuperAmounts, GOVERNMENT_SUPER_YEARS as governmentSuperYears };

/** Each income field the form asks for, by the command's input name; the rest are nil. */
const INCOME_FIELDS = /** @type {Record<string, string>} */ ({
  assessable_income: 'assessable', taxable_income: 'taxable', assessable_fhss_released_amount: 'fhss',
  reportable_fringe_benefits_section_57a: 'fringe-57a', reportable_fringe_benefits_other: 'fringe-other',
  reportable_employer_super_contributions: 'employer-super', deductible_personal_super_contributions: 'personal-super',
  excess_concessional_contributions: 'excess-concessional', net_financial_investment_loss: 'financial-loss',
  net_rental_property_loss: 'rental-loss', tax_free_government_pensions: 'pensions', target_foreign_income: 'target-foreign',
  child_support_paid: 'child-support', business_deductions: 'business-deductions',
});
const INCOME_LABELS = /** @type {Record<string, string>} */ ({
  assessable_fhss_released_amount: 'FHSS released amount', reportable_fringe_benefits_section_57a: 'section 57A fringe benefits',
  reportable_fringe_benefits_other: 'other fringe benefits', reportable_employer_super_contributions: 'employer super',
  deductible_personal_super_contributions: 'deducted personal super', excess_concessional_contributions: 'excess concessional',
  net_financial_investment_loss: 'financial investment loss', net_rental_property_loss: 'rental loss',
  tax_free_government_pensions: 'tax-free pensions', target_foreign_income: 'target foreign income',
  child_support_paid: 'child support paid', business_deductions: 'business deductions',
});
const SPOUSE_FIELDS = ['spouse-contributions', 'spouse-assessable', 'spouse-fhss', 'spouse-fringe', 'spouse-employer', 'spouse-excess'];
/** Why an amount is nil: each condition not met, as the result says it. */
const NOT_MET = /** @type {Record<string, string>} */ ({
  personal_contributions_made: 'no personal contributions', eligible_income_10_percent: 'under 10% of total income is eligible income',
  below_higher_income_threshold: 'total income at or above the higher threshold', return_lodged: 'no return lodged',
  non_concessional_within_cap: 'non-concessional contributions over the cap',
  total_super_balance_below_cap: 'total super balance at or above the general transfer balance cap', under_71: '71 or older',
  concessional_contributions_made: 'no concessional contributions', adjusted_taxable_income_37000: 'adjusted taxable income above $37,000',
  spouse_contributions_made: 'no spouse contributions', spouse_income_below_40000: 'spouse’s income $40,000 or more',
  spouse_non_concessional_within_cap: 'spouse’s non-concessional contributions over the cap',
  spouse_total_super_balance_below_cap: 'spouse’s total super balance at or above the general transfer balance cap',
});
const AMOUNT_NAMES = /** @type {Record<string, string>} */ ({ co_contribution: 'No co-contribution', listo: 'No LISTO',
  spouse_contribution_offset: 'No spouse offset' });

/** Whole dollars, as the ATO publishes a threshold. @param {string} text */
const whole = (text) => `$${Number(text).toLocaleString('en-AU')}`;
/** A three-way answer: yes, no, or not known (null). @param {string} answer */
const known = (answer) => (answer === 'unknown' ? null : answer === 'yes');

/** The form's answers as the `government-super-amounts` command's input.
 * @param {(name: string) => string} value @returns {import('./government-super.mjs').GovernmentSuperFacts} */
export function governmentSuperFormFacts(value) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  /** @type {import('./government-super.mjs').GovernmentSuperFacts} */
  const facts = Object.fromEntries(INCOME_INPUTS.map(([name]) => [name, INCOME_FIELDS[name] ? value(INCOME_FIELDS[name]) : '0']));
  Object.assign(facts, { residency: yes('resident') ? 'full_year_resident' : 'part_year_resident', eligible_income: value('eligible'),
    personal_contributions: value('personal'), concessional_contributions: value('concessional'), return_lodged: yes('lodged'),
    under_71: yes('under-71'), temporary_visa_held: yes('visa'), non_concessional_within_cap: known(value('non-concessional')),
    total_super_balance_below_cap: known(value('balance')), year: value('year'), scope_confirmed: yes('scope') });
  if (yes('spouse')) {
    SPOUSE_FIELDS.forEach((field, i) => { facts[SPOUSE_INPUTS[i]] = value(field); });
    facts.spouse_non_concessional_within_cap = known(value('spouse-non-concessional'));
    facts.spouse_total_super_balance_below_cap = known(value('spouse-balance'));
  }
  return facts;
}

/** @param {import('./government-super.mjs').GovernmentSuperFacts} facts @param {(n: number) => string} aud */
function inputsText(facts, aud) {
  const cash = (/** @type {string} */ name) => aud(Number(facts[name]));
  const others = Object.keys(INCOME_LABELS).filter((name) => Number(facts[name]) !== 0)
    .map((name) => `, ${INCOME_LABELS[name]} ${cash(name)}`).join('');
  const unknown = [['non_concessional_within_cap', 'non-concessional cap'], ['total_super_balance_below_cap', 'total super balance']]
    .filter(([name]) => facts[name] === null).map(([, label]) => `, ${label} not known`).join('');
  const spouse = 'spouse_contributions' in facts ? `, spouse contributions ${cash('spouse_contributions')}, spouse assessable income `
    + `${cash('spouse_assessable_income')}` : '';
  return `${facts.year}, assessable income ${cash('assessable_income')}, taxable income ${cash('taxable_income')}${others}, eligible `
    + `income ${cash('eligible_income')}, personal contributions ${cash('personal_contributions')}, concessional contributions `
    + `${cash('concessional_contributions')}${facts.return_lodged ? '' : ', no return lodged'}${facts.under_71 ? '' : ', 71 or older'}`
    + `${unknown}${spouse}`;
}

/** Why each nil amount is nil. @param {import('./government-super.mjs').GovernmentSuper} r */
function notMet(r) {
  return Object.entries(AMOUNT_NAMES).flatMap(([amount, name]) => {
    const reasons = r.conditions.filter((c) => c.amount === amount && c.met === false).map((c) => NOT_MET[c.condition]);
    return reasons.length ? [`${name}: ${reasons.join(', ')}`] : [];
  });
}

/** @param {(name: string) => string} value @param {(amount: number) => string} aud */
export function governmentSuperResult(value, aud) {
  const facts = governmentSuperFormFacts(value);
  const r = governmentSuperAmounts(facts);
  const a = r.amounts;
  const cash = (/** @type {string | undefined} */ text) => aud(Number(text));
  const rows = [['Total income for the co-contribution', cash(a.co_contribution_total_income)],
    ['Income thresholds', `${whole(r.rates.lower_income_threshold)} and ${whole(r.rates.higher_income_threshold)}`],
    ['Half the personal contributions', cash(a.co_contribution_matched)], ['Maximum after the taper', cash(a.co_contribution_maximum)],
    ['Super co-contribution', cash(a.co_contribution)], ['Co-contribution paid, up to 5 cents', cash(a.co_contribution_paid)],
    ['Adjusted taxable income', cash(a.adjusted_taxable_income)], ['LISTO', cash(a.listo)], ['LISTO paid, up to 5 cents', cash(a.listo_paid)]];
  if ('spouse_income' in a) {
    rows.push(['Spouse’s income', cash(a.spouse_income)], ['Spouse contribution limit', cash(a.spouse_contribution_limit)],
      ['Spouse contribution tax offset', cash(a.spouse_contribution_offset)]);
  }
  const notes = [...notMet(r), 'The ATO works out the co-contribution and LISTO from your return and your fund’s reports and pays them to your fund'];
  return { inputs: inputsText(facts, aud), rows, principal: 5, note: notes.join('. ') };
}
