// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort D FBT Division 5 and
// Division 11 calculators: FBT expense payment and FBT property. Shares rule
// tables and output formatting to avoid duplication. Imported by
// assets/webmcp-business-d.mjs.

import { checkModeFields } from './webmcp-business-c-workforce.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const IN_HOUSE_PROPERTY_METHODS = [
  'in-house-salary-packaging',
  'in-house-trade-price',
  'in-house-public-price',
  'in-house-produced-other',
  'in-house-acquired',
  'in-house-other',
];

const PROPERTY_METHODS = [
  ...IN_HOUSE_PROPERTY_METHODS,
  'external-cost-price',
  'external-expenditure',
  'external-notional-value',
];

const EXPENSE_PAYMENT_METHODS = [
  'external',
  ...IN_HOUSE_PROPERTY_METHODS,
  'in-house-residual-salary-packaging',
  'in-house-residual-public-price',
  'in-house-residual-other',
];

const PRICE_ONLY_METHODS = new Set([
  'in-house-trade-price',
  'in-house-public-price',
  'external-cost-price',
  'external-expenditure',
  'in-house-residual-public-price',
]);

const BOTH_VALUE_METHODS = new Set(['in-house-acquired']);

/**
 * Builds per-method allowed and required field maps for FBT property and expense payment rules.
 * @param {string[]} methods
 */
function buildValuationMaps(methods) {
  /** @type {Map<string, Set<string>>} */
  const allowed = new Map();
  /** @type {Map<string, string[]>} */
  const required = new Map();
  for (const method of methods) {
    if (method === 'external') {
      allowed.set(method, new Set(['incomeUsePercent', 'portionDeduction']));
      required.set(method, []);
      continue;
    }
    const needsPrice = PRICE_ONLY_METHODS.has(method) || BOTH_VALUE_METHODS.has(method);
    const needsNotional = !PRICE_ONLY_METHODS.has(method);
    const hasSection62 = method.startsWith('in-house-') && !method.endsWith('-salary-packaging');
    const req = [...(needsPrice ? ['price'] : []), ...(needsNotional ? ['notionalValue'] : [])];
    allowed.set(method, new Set([...req, ...(hasSection62 ? ['inHouseReductionAvailable'] : [])]));
    required.set(method, req);
  }
  return { allowed, required };
}

const PROPERTY_COMMON = new Set(['method', 'employeeContribution', 'incomeUsePercent', 'contributionDeduction']);
const PROPERTY_MAPS = buildValuationMaps(PROPERTY_METHODS);

const EXPENSE_COMMON = new Set(['method', 'expenditure', 'paidOrReimbursed', 'employeeContribution']);
const EXPENSE_MAPS = buildValuationMaps(EXPENSE_PAYMENT_METHODS);

/**
 * Formats the shared BenefitValue shape returned by fbtProperty and fbtExpensePayment.
 * @param {import('./fbt-benefits.mjs').BenefitValue} r
 * @param {string} method
 * @param {(value: number) => string} dollars
 * @param {string} source
 */
function formatBenefitValue(r, method, dollars, source) {
  const deductible = r.grossDeduction === undefined ? {} : {
    grossDeduction: dollars(r.grossDeduction),
    deductionApplied: dollars(r.deductionApplied ?? 0),
    notionalDeduction: dollars(r.notionalDeduction ?? 0),
    otherwiseDeductibleReduction: dollars(r.reduction ?? 0),
  };
  return {
    fbtYearEnding: '2027-03-31',
    method,
    grossValue: dollars(r.gross),
    ...(r.recipientsPortion === undefined ? {} : { recipientsPortion: dollars(r.recipientsPortion) }),
    contributionApplied: dollars(r.contributionApplied),
    excessContribution: dollars(r.excess),
    valueAfterContribution: dollars(r.valueAfterContribution),
    ...deductible,
    ...(r.inHouseReduction === undefined ? {} : { inHouseReduction: dollars(r.inHouseReduction) }),
    taxableValue: dollars(r.taxableValue),
    currency: 'AUD',
    source,
  };
}

/** @param {ToolKit} kit @param {BusinessCalculators['fbtProperty']} fbtProperty */
export function fbtPropertyTool(kit, fbtProperty) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_fbt_property',
    title: 'FBT property calculator',
    description: 'Taxable value in AUD of one property fringe benefit for the FBT year ending 31 March 2027 under '
      + 'Division 11 of the Fringe Benefits Tax Assessment Act 1986: 6 in-house property rules (s 42(1)) and 3 '
      + 'external property rules (s 43), less employee contributions, the otherwise deductible rule (s 44(1)) and '
      + 'the employee\'s remaining $1,000 in-house reduction (s 62, excluding salary packaging). Refuses fields '
      + 'belonging to another valuation rule and deductions exceeding the employee\'s contribution. Stops at '
      + 'taxable value without gross-up or FBT, and does not cover airline transport, car property benefits or '
      + 'Division 13 exemptions.',
    inputSchema: record({
      method: choice(PROPERTY_METHODS, 'Property valuation rule under s 42(1) or s 43.'),
      price: text('cost', 'Price-based rules and in-house-acquired: lowest trade/public price, arm\'s length purchase price, cost price or third-party expenditure including GST, in AUD.'),
      notionalValue: text('cost', 'Notional-value rules and in-house-acquired: arm\'s length notional value in AUD (s 136(1)).'),
      employeeContribution: text('cost', 'Employee contribution paid for the property in AUD; "0" when omitted.'),
      incomeUsePercent: text('percent', 'Share of use giving the employee a once-only income tax deduction (0 to 100%); "0" when omitted.'),
      contributionDeduction: text('cost', 'Deduction the employee could claim for their contribution in AUD (no more than employeeContribution); "0" when omitted.'),
      inHouseReductionAvailable: text('cost', 'In-house rules other than salary packaging: remaining portion of the employee\'s $1,000 s 62 annual reduction in AUD (0 to 1000); "0" when omitted.'),
    }, ['method']),
    run(input) {
      checkModeFields(input, input.method, PROPERTY_MAPS.allowed, PROPERTY_MAPS.required, PROPERTY_COMMON);
      const {
        method, price = '0', notionalValue = '0', employeeContribution = '0',
        incomeUsePercent = '0', contributionDeduction = '0', inHouseReductionAvailable = '0',
      } = input;
      const r = fbtProperty({
        method, price, notional: notionalValue, contribution: employeeContribution,
        incomeUse: incomeUsePercent, contributionDeduction, available: inHouseReductionAvailable,
      });
      return formatBenefitValue(r, method, dollars, `${CALCULATORS}fbt-property/`);
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['fbtExpensePayment']} fbtExpensePayment */
export function fbtExpensePaymentTool(kit, fbtExpensePayment) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_fbt_expense_payment',
    title: 'FBT expense payment calculator',
    description: 'Taxable value in AUD of one expense payment fringe benefit for the FBT year ending 31 March 2027 '
      + 'under Division 5 of the Fringe Benefits Tax Assessment Act 1986: external payment or reimbursement (s 23) '
      + 'with the otherwise deductible rule (s 24(1)), or an in-house property or residual expense payment (s 22A) '
      + 'less the recipient\'s portion (s 136(1)) and remaining $1,000 s 62 in-house reduction (excluding salary '
      + 'packaging). Refuses mismatched rule fields, otherwise deductible inputs on in-house expense payments '
      + '(s 24(1)(b)(i)) and payments exceeding the employee\'s expenditure. Stops at taxable value without gross-up '
      + 'or FBT.',
    inputSchema: record({
      method: choice(EXPENSE_PAYMENT_METHODS, '"external" (s 23) or one of the 9 in-house property or residual valuation rules (s 22A).'),
      expenditure: text('cost', 'Employee\'s expenditure before any reimbursement, in AUD.'),
      paidOrReimbursed: text('cost', 'Employer\'s payment or reimbursement of that expenditure, in AUD (no more than expenditure).'),
      employeeContribution: text('cost', 'Employee contribution towards the employer\'s payment in AUD; "0" when omitted.'),
      incomeUsePercent: text('percent', 'External only: share of the expenditure giving a once-only deduction (0 to 100%); "0" when omitted.'),
      portionDeduction: text('cost', 'External only: employee\'s deduction for the recipient\'s portion they bore in AUD; "0" when omitted.'),
      price: text('cost', 'In-house price rules and in-house-acquired: lowest or arm\'s length price including GST, in AUD.'),
      notionalValue: text('cost', 'In-house notional-value rules and in-house-acquired: arm\'s length notional value in AUD.'),
      inHouseReductionAvailable: text('cost', 'In-house rules other than salary packaging: remaining portion of the employee\'s $1,000 s 62 reduction in AUD (0 to 1000); "0" when omitted.'),
    }, ['method', 'expenditure', 'paidOrReimbursed']),
    run(input) {
      checkModeFields(input, input.method, EXPENSE_MAPS.allowed, EXPENSE_MAPS.required, EXPENSE_COMMON);
      const {
        method, expenditure, paidOrReimbursed, employeeContribution = '0', incomeUsePercent = '0',
        portionDeduction = '0', price = '0', notionalValue = '0', inHouseReductionAvailable = '0',
      } = input;
      const r = fbtExpensePayment({
        method, expenditure, paid: paidOrReimbursed, contribution: employeeContribution,
        incomeUse: incomeUsePercent, portionDeduction, price, notional: notionalValue,
        available: inHouseReductionAvailable,
      });
      return formatBenefitValue(r, method, dollars, `${CALCULATORS}fbt-expense-payment/`);
    },
  });
}
