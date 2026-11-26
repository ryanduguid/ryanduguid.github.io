// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// A complying SMSF's income tax calculation statement (item 13 of the SMSF annual return) for 2020-21 to
// 2026-27: the `smsf-tax` command of ryanduguid/australian-accounting (main at e1f5bee) ported line for line,
// with its inputs, steps, rounding and refusal codes in the order the command checks them. The command read,
// on 22 November 2026: ITAA 1997 Division 295 (ss 295-10, 295-385, 295-387, 295-390, 295-545, 295-550, 295-605
// and 295-610), the Income Tax Rates Act 1986 ss 26 and 29, the Superannuation (Self Managed Superannuation
// Funds) Supervisory Levy Imposition Regulations 2018 s 6 and the ATO's 'Instructions to complete your SMSF
// annual return 2026' (last updated 30 May 2026). Amounts are held in ten-thousandths of a dollar, so every
// step is exact; each is rounded half up to the cent once, when shown.

import { field, flag, money, readFields, refuse, scope, shownCents } from './aa-command.mjs';

export const SMSF_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];

/** Section B and C amounts, in whole dollars ('Don't show cents'). */
const WHOLE_DOLLARS = ['assessable_contributions', 'no_tfn_contributions', 'net_non_arms_length_income', 'segregated_pension_income',
  'unsegregated_income', 'segregated_non_current_income', 'deductions', 'contribution_deductions'];
/** Section D amounts and the general expense amount, to the cent. */
const CENTS = ['general_expense_non_arms_length_income', 'non_refundable_offsets', 'carry_forward_offsets', 'refundable_offsets',
  'eligible_credits', 'payg_instalments', 'interest_charge'];
/** The command's parameters, in its order. */
const PARAMS = /** @type {const} */ ([['complying_fund', 'raw'], ['australian_superannuation_fund', 'raw'], ['assessable_contributions', 'dec'],
  ['no_tfn_contributions', 'dec'], ['net_non_arms_length_income', 'dec'], ['general_expense_non_arms_length_income', 'dec'],
  ['segregated_pension_income', 'dec'], ['unsegregated_income', 'dec'], ['segregated_non_current_income', 'dec'], ['exempt_proportion', 'dec'],
  ['disregarded_small_fund_assets', 'raw'], ['deductions', 'dec'], ['contribution_deductions', 'dec'], ['non_refundable_offsets', 'dec'],
  ['carry_forward_offsets', 'dec'], ['refundable_offsets', 'dec'], ['eligible_credits', 'dec'], ['payg_instalments', 'dec'],
  ['interest_charge', 'dec'], ['newly_registered', 'raw'], ['wound_up', 'raw'], ['year', 'raw'], ['scope_confirmed', 'raw']]);
/** Each part, the total it is part of, and why. */
const PARTS_OF = [
  ['no_tfn_contributions', 'assessable_contributions', 'no-TFN contributions income is an amount Subdivision 295-C includes (s 295-610(1))'],
  ['contribution_deductions', 'deductions', 'they are the deductions attributable to the contributions (s 295-545(2A)(b)(ii))'],
  ['contribution_deductions', 'assessable_contributions', 'the calculator does not take deductions attributable to contributions above the contributions'],
];
/** The 20 steps of the statement and the return labels they fill. */
export const SMSF_LABELS = new Map([['gross_income', 'W'], ['exempt_current_pension_income', 'Y'], ['total_assessable_income', 'V'],
  ['taxable_income', 'A'], ['loss', ''], ['non_arms_length_component', ''], ['low_tax_component', ''], ['tax_on_taxable_income', 'T1'],
  ['no_tfn_contributions_tax', 'J'], ['gross_tax', 'B'], ['subtotal_1', 'T2'], ['non_refundable_offsets_lost', ''], ['subtotal_2', 'T3'],
  ['carry_forward_offsets_unused', ''], ['tax_payable', 'T5'], ['tax_offset_refunds', 'I'], ['supervisory_levy', 'L'],
  ['levy_adjustment_wound_up', 'M'], ['levy_adjustment_new_fund', 'N'], ['amount_due_or_refundable', 'S']]);
const RATES = { low_tax_rate: '0.15', non_arms_length_rate: '0.45', no_tfn_rate: '0.32', levy: '259' };
/** One dollar in the engine's unit, a ten-thousandth of a dollar. */
const DOLLAR = 10000n;
const LEVY = 259n * DOLLAR;
const PRECISION = 40;

/** @param {bigint} a @param {bigint} b */
const min = (a, b) => (a < b ? a : b);
/** @param {bigint} a */
const nil = (a) => (a > 0n ? a : 0n);

/** floor(dollars x proportion), with the product first rounded half even to the command's 40 digits.
 * @param {bigint} dollars @param {bigint} coefficient @param {number} exponent */
function floorProduct(dollars, coefficient, exponent) {
  let product = dollars * coefficient;
  let exp = exponent;
  const digits = product.toString().length;
  if (digits > PRECISION) {
    const scale = 10n ** BigInt(digits - PRECISION);
    const [q, r] = [product / scale, product % scale];
    product = 2n * r > scale || (2n * r === scale && q % 2n === 1n) ? q + 1n : q;
    exp += digits - PRECISION;
  }
  return exp >= 0 ? product * 10n ** BigInt(exp) : product / 10n ** BigInt(-exp);
}

/**
 * @typedef {{year: string, amounts: Record<string, string>, rates: Record<string, string>, returnLabels: Record<string, string>,
 *   values: Map<string, bigint>, taxableIncome: number, grossTax: number, taxPayable: number, amountDue: number}} SmsfTaxResult
 */

/** The fund's tax, levy and amount due or refundable for one income year, from the command's call.
 * @param {Record<string, unknown>} call @returns {SmsfTaxResult} */
export function smsfTax(call) {
  const fields = readFields(call, 'smsf-tax', PARAMS);
  const year = scope(fields, SMSF_YEARS);
  const value = (/** @type {string} */ key) => field(fields, key).value;
  if (!flag(value('complying_fund'), 'complying_fund')) {
    refuse('smsf_tax.non_complying', 'A non-complying fund is taxed at 45% on all its taxable income (Income Tax Rates Act 1986 s 26(2)); '
      + 'this calculator takes a complying fund only.');
  }
  if (!flag(value('australian_superannuation_fund'), 'australian_superannuation_fund')) {
    refuse('smsf_tax.foreign_fund', 'A fund that is not an Australian superannuation fund works out its taxable income as if its trustee were '
      + 'not an Australian resident (ITAA 1997 s 295-10(1) step 3(b)); this calculator takes an Australian superannuation fund only.');
  }
  /** @type {Map<string, bigint>} */
  const v = new Map();
  for (const key of WHOLE_DOLLARS) {
    const cents = money(field(fields, key).dec);
    if (cents % 100n) refuse('input.amount_not_whole_dollars', `Enter ${key.replaceAll('_', ' ')} in whole dollars.`);
    v.set(key, cents * 100n);
  }
  for (const key of CENTS) v.set(key, money(field(fields, key).dec) * 100n);
  const proportion = field(fields, 'exempt_proportion').dec;
  if (!proportion?.finite || (proportion.negative && proportion.coefficient) || proportion.coefficient > 10n ** BigInt(-proportion.exponent)) {
    return refuse('smsf_tax.proportion_invalid', 'Enter the actuary’s proportion as a decimal from 0 to 1 (ITAA 1997 s 295-390(3)).');
  }
  const at = (/** @type {string} */ key) => v.get(key) ?? 0n;
  for (const [part, whole, why] of PARTS_OF) {
    if (at(part) > at(whole)) refuse('smsf_tax.part_exceeds_total', `${part.replaceAll('_', ' ')} exceeds ${whole.replaceAll('_', ' ')}: ${why}.`);
  }
  if (flag(value('disregarded_small_fund_assets'), 'disregarded_small_fund_assets') && at('segregated_pension_income')) {
    refuse('smsf_tax.disregarded_small_fund_assets', 'Disregarded small fund assets are not segregated current pension assets '
      + '(ITAA 1997 ss 295-385(7) and 295-387): enter their income as unsegregated income, with the actuary’s proportion.');
  }
  const isNew = flag(value('newly_registered'), 'newly_registered');
  const woundUp = flag(value('wound_up'), 'wound_up');
  const steps = statement(at, floorProduct(at('unsegregated_income') / DOLLAR, proportion.coefficient, proportion.exponent) * DOLLAR,
    woundUp && !isNew, isNew && !woundUp);
  const dollars = (/** @type {string} */ id) => Number(shownCents(steps.get(id) ?? 0n, 4));
  return { year, values: steps, rates: { ...RATES }, taxableIncome: dollars('taxable_income'), grossTax: dollars('gross_tax'),
    taxPayable: dollars('tax_payable'), amountDue: dollars('amount_due_or_refundable'), returnLabels: Object.fromEntries([...SMSF_LABELS].filter(([, label]) => label)),
    amounts: Object.fromEntries([...steps].map(([id, n]) => [id, shownCents(n, 4)])) };
}

/** The 20 steps in order. @param {(key: string) => bigint} at @param {bigint} exemptUnsegregated
 * @param {boolean} woundUpExisting @param {boolean} newNotWoundUp */
function statement(at, exemptUnsegregated, woundUpExisting, newNotWoundUp) {
  const gross = at('assessable_contributions') + at('net_non_arms_length_income') + at('segregated_pension_income') + at('unsegregated_income')
    + at('segregated_non_current_income');
  const exempt = exemptUnsegregated + at('segregated_pension_income');
  const assessable = gross - exempt;
  const taxable = nil(assessable - at('deductions'));
  const nali = min(at('net_non_arms_length_income') + at('general_expense_non_arms_length_income'),
    nil(taxable - at('assessable_contributions') + at('contribution_deductions')));
  const low = taxable - nali;
  const tax = (low * 15n + nali * 45n) / 100n;
  const noTfn = (at('no_tfn_contributions') * 32n) / 100n;
  const grossTax = tax + noTfn;
  const subtotal1 = nil(grossTax - at('non_refundable_offsets'));
  const subtotal2 = nil(subtotal1 - at('carry_forward_offsets'));
  const payable = nil(subtotal2 - at('refundable_offsets'));
  const refunds = nil(at('refundable_offsets') - subtotal2);
  const [m, n] = [woundUpExisting ? LEVY : 0n, newNotWoundUp ? LEVY : 0n];
  return new Map([['gross_income', gross], ['exempt_current_pension_income', exempt], ['total_assessable_income', assessable],
    ['taxable_income', taxable], ['loss', nil(at('deductions') - assessable)], ['non_arms_length_component', nali], ['low_tax_component', low],
    ['tax_on_taxable_income', tax], ['no_tfn_contributions_tax', noTfn], ['gross_tax', grossTax], ['subtotal_1', subtotal1],
    ['non_refundable_offsets_lost', nil(at('non_refundable_offsets') - grossTax)], ['subtotal_2', subtotal2],
    ['carry_forward_offsets_unused', nil(at('carry_forward_offsets') - subtotal1)], ['tax_payable', payable], ['tax_offset_refunds', refunds],
    ['supervisory_levy', LEVY], ['levy_adjustment_wound_up', m], ['levy_adjustment_new_fund', n],
    ['amount_due_or_refundable', payable + at('interest_charge') + LEVY + n - at('eligible_credits') - refunds - at('payg_instalments') - m]]);
}

/** The page's fields and the command's inputs they fill, in the form's order. */
const FORM = [['contributions', 'assessable_contributions'], ['no-tfn', 'no_tfn_contributions'], ['nali', 'net_non_arms_length_income'],
  ['nali-expense', 'general_expense_non_arms_length_income'], ['segregated', 'segregated_pension_income'], ['unsegregated', 'unsegregated_income'],
  ['proportion', 'exempt_proportion'], ['non-current', 'segregated_non_current_income'], ['deductions', 'deductions'],
  ['contribution-deductions', 'contribution_deductions'], ['non-refundable', 'non_refundable_offsets'], ['carry-forward', 'carry_forward_offsets'],
  ['refundable', 'refundable_offsets'], ['credits', 'eligible_credits'], ['instalments', 'payg_instalments'], ['interest', 'interest_charge']];

/** The form's input as the command's call. @param {(name: string) => string} value @returns {Record<string, unknown>} */
export function smsfFormInput(value) {
  const yes = (/** @type {string} */ name) => value(name) === 'yes';
  return { complying_fund: true, australian_superannuation_fund: true, ...Object.fromEntries(FORM.map(([name, key]) => [key, value(name)])),
    disregarded_small_fund_assets: yes('disregarded'), newly_registered: yes('new-fund'), wound_up: yes('wound-up'), year: value('year'),
    scope_confirmed: true };
}

/** How the page writes the command's input. @param {Record<string, unknown>} x @param {(value: number) => string} aud */
export function smsfInputsText(x, aud) {
  const n = (/** @type {string} */ key) => Number(new Map(Object.entries(x)).get(key));
  const some = [['assessable contributions', 'assessable_contributions'], ['no-TFN contributions', 'no_tfn_contributions'],
    ['net non-arm’s length income', 'net_non_arms_length_income'], ['segregated pension income', 'segregated_pension_income'],
    ['other income', 'unsegregated_income'], ['segregated non-current income', 'segregated_non_current_income'], ['deductions', 'deductions'],
    ['non-refundable offsets', 'non_refundable_offsets'], ['carry forward offsets', 'carry_forward_offsets'],
    ['refundable offsets', 'refundable_offsets'], ['credits', 'eligible_credits'], ['interest charge', 'interest_charge'], ['PAYG instalments', 'payg_instalments']]
    .filter(([, key]) => n(key)).map(([words, key]) => `${words} ${aud(n(key))}`);
  const proportion = n('exempt_proportion');
  const status = [x.newly_registered && 'newly registered', x.wound_up && 'wound up'].filter(Boolean);
  return `${x.year}; ${some.join(', ')}${n('unsegregated_income') ? `; actuary’s proportion ${proportion}` : ''}`
    + `${status.length ? `; ${status.join(' and ')}` : ''}`;
}

/** The page's result. @param {(name: string) => string} value @param {(value: number) => string} aud */
export function smsfTaxResult(value, aud) {
  const input = smsfFormInput(value);
  const r = smsfTax(input);
  const a = (/** @type {string} */ id) => aud(Number(new Map(Object.entries(r.amounts)).get(id)));
  const has = (/** @type {string} */ id) => (r.values.get(id) ?? 0n) !== 0n;
  /** @type {[string, string][]} */
  const rows = [['Gross income (W)', a('gross_income')], ['Exempt current pension income (Y)', a('exempt_current_pension_income')],
    ['Total assessable income (V)', a('total_assessable_income')]];
  if (has('loss')) rows.push(['Loss (O), carried forward', a('loss')]);
  rows.push(['Taxable income (A)', a('taxable_income')]);
  if (has('non_arms_length_component')) rows.push(['Non-arm’s length component, at 45%', a('non_arms_length_component')]);
  rows.push(['Tax on taxable income (T1)', a('tax_on_taxable_income')]);
  if (has('no_tfn_contributions_tax')) rows.push(['Tax on no-TFN contributions, at 32% (J)', a('no_tfn_contributions_tax')]);
  rows.push(['Gross tax (B)', a('gross_tax')], ['Subtotal 1, after non-refundable offsets (T2)', a('subtotal_1')],
    ['Subtotal 2, after carry forward offsets (T3)', a('subtotal_2')], ['Tax payable (T5)', a('tax_payable')]);
  if (has('tax_offset_refunds')) rows.push(['Tax offset refunds (I)', a('tax_offset_refunds')]);
  rows.push(['Supervisory levy (L)', a('supervisory_levy')]);
  if (has('levy_adjustment_wound_up')) rows.push(['Levy adjustment for a fund wound up (M)', a('levy_adjustment_wound_up')]);
  if (has('levy_adjustment_new_fund')) rows.push(['Levy adjustment for a new fund (N)', a('levy_adjustment_new_fund')]);
  const due = r.values.get('amount_due_or_refundable') ?? 0n;
  const principal = rows.push([due < 0n ? 'Amount refundable (S)' : 'Amount due (S)', aud(Math.abs(Number(r.amounts.amount_due_or_refundable)))]) - 1;
  const note = has('loss') ? 'A loss: no tax on taxable income; the loss is carried forward in Section E'
    : 'Low tax component at 15% and any non-arm’s length component at 45% (Income Tax Rates Act 1986 s 26(1))';
  return { inputs: smsfInputsText(input, aud), rows, principal, note };
}
