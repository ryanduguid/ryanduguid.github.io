// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort E (the 3 calculators
// added on 24 November 2026): R&D tax offset, GST adjustments and deferred tax.
// Imported by assets/webmcp-tools.mjs.

import { gstAdjustmentsTool } from './webmcp-gst-adjustments.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {readonly string[]} years */
function rdSchema(kit, years) {
  const { text, choice, record } = kit;
  return record({
    incomeYear: choice([...years], `Income year of the R&D offset, ${years[0]} to ${years.at(-1)}.`),
    notionalDeductions: text('trillionCost', 'Notional R&D deductions for the year in AUD (0 to 1,000,000,000,000).'),
    rspCrcExpenditure: text('trillionCost', 'Expenditure to non-associate research service providers and CRC contributions in AUD; "0" when omitted.'),
    aggregatedTurnover: text('trillionCost', 'Aggregated turnover for the income year in AUD.'),
    exemptEntityControlled: { type: 'boolean', description: 'true when exempt entities control the company (s 355-100(1) item 2); false when omitted.' },
    baseRateEntity: { type: 'boolean', description: 'true when a base rate entity (25% tax rate) in the offset year; false (30%) when omitted.' },
    totalExpenses: text('trillionCost', 'Total expenses for the year (s 355-115) in AUD.'),
    recoupmentClawback: text('trillionCost', 'Recoupment clawback amount (s 355-440) in AUD; "0" when omitted.'),
    feedstockRevenue: text('trillionCost', 'Feedstock revenue (s 355-445(4)) in AUD; "0" when omitted.'),
    feedstockExpenditure: text('trillionCost', 'Feedstock expenditure taken into this year\'s offset (s 355-445(2)(b)) in AUD; "0" when omitted.'),
    presentYearBaseRateEntity: { type: 'boolean', description: 'true when a base rate entity (25%) in the present year when clawback arises; false (30%) when omitted.' },
    scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
  }, ['incomeYear', 'notionalDeductions', 'aggregatedTurnover', 'totalExpenses']);
}

/** @param {ToolKit} kit @param {BusinessCalculators['rdTaxOffset']} rdTaxOffset @param {readonly string[]} rdYears */
export function rdTaxOffsetTool(kit, rdTaxOffset, rdYears) {
  const { tool, CALCULATORS } = kit;
  return tool({
    name: 'calculate_rd_tax_offset',
    title: 'R&D tax offset calculator',
    description: 'Company R&D tax incentive offset in AUD under ITAA 1997 ss 355-100, 355-115 and 67-30 for 2021-22 to '
      + '2026-27 (refundable corporate tax rate + 18.5% under $20M turnover without exempt entity control, or '
      + 'non-refundable + 8.5% / 16.5% intensity tiers), $20,000 RSP/CRC threshold, $150M cap and s 355-450 recoupment '
      + 'and feedstock clawbacks. Refuses clawbacks when notional or adjusted deductions fall below $20,000.',
    inputSchema: rdSchema(kit, rdYears),
    run(input) {
      const r = rdTaxOffset({
        year: input.incomeYear, notional_deductions: input.notionalDeductions, rsp_crc_expenditure: input.rspCrcExpenditure ?? '0',
        aggregated_turnover: input.aggregatedTurnover, exempt_entity_controlled: input.exemptEntityControlled ?? false,
        base_rate_entity: input.baseRateEntity ?? false, total_expenses: input.totalExpenses,
        recoupment_clawback: input.recoupmentClawback ?? '0', feedstock_revenue: input.feedstockRevenue ?? '0',
        feedstock_expenditure: input.feedstockExpenditure ?? '0',
        present_year_base_rate_entity: input.presentYearBaseRateEntity ?? false, scope_confirmed: input.scopeConfirmed ?? true,
      });
      return {
        incomeYear: r.year, refundable: r.refundable, corporateTaxRatePercent: r.rate,
        presentYearCorporateTaxRatePercent: r.presentRate, offsetBase: r.amounts.offset_base,
        cappedBase: r.amounts.capped_base, baseOffset: r.amounts.base_offset, premiumTier1: r.amounts.premium_tier_1,
        premiumTier2: r.amounts.premium_tier_2, excessOffset: r.amounts.excess_offset, taxOffset: r.amounts.tax_offset,
        refundableOffset: r.amounts.refundable_offset, nonRefundableOffset: r.amounts.non_refundable_offset,
        clawbackAmount: r.amounts.clawback_amount, adjustedOffset: r.amounts.adjusted_offset,
        deductionAmount: r.amounts.deduction_amount, clawbackIncome: r.amounts.clawback_income,
        amounts: r.amounts, rates: r.rates, currency: 'AUD', source: `${CALCULATORS}rd-tax-offset/`,
      };
    },
  });
}

/** @param {ToolKit} kit @param {readonly string[]} years */
function deferredTaxSchema(kit, years) {
  const { text, choice, record } = kit;
  const itemSchema = record({
    label: { type: 'string', description: 'Item name (1 to 200 non-whitespace characters).' },
    class: choice(['asset', 'liability'], '"asset" or "liability".'),
    carryingAmount: text('trillionCost', 'Closing carrying amount in AUD.'),
    taxBase: text('trillionCost', 'Closing tax base in AUD.'),
    openingCarryingAmount: text('trillionCost', 'Opening carrying amount in AUD.'),
    openingTaxBase: text('trillionCost', 'Opening tax base in AUD.'),
  }, ['label', 'class', 'carryingAmount', 'taxBase', 'openingCarryingAmount', 'openingTaxBase']);
  return record({
    incomeYear: choice([...years], `Income year of the worksheet, ${years[0]} to ${years.at(-1)}.`),
    items: { type: 'array', maxItems: 500, items: itemSchema, description: 'From 1 to 500 balance sheet items.' },
    accountingProfit: text('signedTrillionCost', 'Accounting profit (negative for loss) in AUD.'),
    nonDeductibleExpenses: text('trillionCost', 'Non-deductible expenses in AUD; "0" when omitted.'),
    nonAssessableIncome: text('trillionCost', 'Non-assessable income in AUD; "0" when omitted.'),
    taxableIncome: text('trillionCost', 'Taxable income in AUD.'),
    taxOffsets: text('trillionCost', 'Non-refundable tax offsets in AUD; "0" when omitted.'),
    unusedTaxLosses: text('trillionCost', 'Closing unused tax losses in AUD; "0" when omitted.'),
    openingUnusedTaxLosses: text('trillionCost', 'Opening unused tax losses in AUD; "0" when omitted.'),
    unrecognisedDeductible: text('trillionCost', 'Closing unrecognised deductible amounts and losses in AUD; "0" when omitted.'),
    openingUnrecognisedDeductible: text('trillionCost', 'Opening unrecognised deductible amounts and losses in AUD; "0" when omitted.'),
    unrecognisedUsed: text('trillionCost', 'Previously unrecognised opening amounts used this year in AUD; "0" when omitted.'),
    baseRateEntity: { type: 'boolean', description: 'true when a base rate entity for the current year (26% in 2020-21, 25% later); false (30%) when omitted.' },
    expectedRate: choice(['standard', 'base_rate_entity'], 'Closing expected reversal rate ("standard" 30% when omitted, or "base_rate_entity" 25%).'),
    openingExpectedRate: choice(['standard', 'base_rate_entity'], 'Opening expected reversal rate ("standard" 30% when omitted, or "base_rate_entity" 25%).'),
    businessCombination: { type: 'boolean', description: 'true if deferred tax arises in a business combination (refused); false when omitted.' },
    uncertainTaxTreatment: { type: 'boolean', description: 'true for uncertain tax treatments under AASB Interpretation 23 (refused); false when omitted.' },
    taxConsolidatedGroup: { type: 'boolean', description: 'true for a tax-consolidated group member (refused); false when omitted.' },
    outsideProfitOrLoss: { type: 'boolean', description: 'true for tax outside profit or loss (refused); false when omitted.' },
    scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
  }, ['incomeYear', 'items', 'accountingProfit', 'taxableIncome']);
}

/** @param {Record<string, any>} input */
function buildDeferredTaxCall(input) {
  return {
    year: input.incomeYear,
    items: input.items.map((/** @type {Record<string, string>} */ item) => ({
      label: item.label, class: item.class, carrying_amount: item.carryingAmount, tax_base: item.taxBase,
      opening_carrying_amount: item.openingCarryingAmount, opening_tax_base: item.openingTaxBase,
    })),
    accounting_profit: input.accountingProfit, non_deductible_expenses: input.nonDeductibleExpenses ?? '0',
    non_assessable_income: input.nonAssessableIncome ?? '0', taxable_income: input.taxableIncome,
    tax_offsets: input.taxOffsets ?? '0', unused_tax_losses: input.unusedTaxLosses ?? '0',
    opening_unused_tax_losses: input.openingUnusedTaxLosses ?? '0', unrecognised_deductible: input.unrecognisedDeductible ?? '0',
    opening_unrecognised_deductible: input.openingUnrecognisedDeductible ?? '0', unrecognised_used: input.unrecognisedUsed ?? '0',
    base_rate_entity: input.baseRateEntity ?? false, expected_rate: input.expectedRate ?? 'standard',
    opening_expected_rate: input.openingExpectedRate ?? 'standard', business_combination: input.businessCombination ?? false,
    uncertain_tax_treatment: input.uncertainTaxTreatment ?? false, tax_consolidated_group: input.taxConsolidatedGroup ?? false,
    outside_profit_or_loss: input.outsideProfitOrLoss ?? false, scope_confirmed: input.scopeConfirmed ?? true,
  };
}

/** @param {ToolKit} kit @param {BusinessCalculators['deferredTax']} deferredTax @param {readonly string[]} dtYears */
export function deferredTaxTool(kit, deferredTax, dtYears) {
  const { tool, CALCULATORS } = kit;
  return tool({
    name: 'calculate_deferred_tax',
    title: 'Deferred tax calculator',
    description: 'AASB 112 company tax effect worksheet in AUD for 2020-21 to 2026-27: closing and opening temporary '
      + 'differences, deferred tax liability and asset at expected reversal rates (25% or 30%), net balance movement, '
      + 'current tax at the Income Tax Rates Act 1986 s 23(2) company rate (26% BRE in 2020-21, 25% later, 30% standard) '
      + 'and para 81(c)(i) reconciliation. Refuses business combinations, uncertain tax treatments, consolidated group '
      + 'allocations, tax outside profit or loss and unscheduled rate changes.',
    inputSchema: deferredTaxSchema(kit, dtYears),
    run(input) {
      const r = deferredTax(buildDeferredTaxCall(input));
      return {
        incomeYear: r.period, deferredTaxLiability: r.amounts.deferred_tax_liability,
        deferredTaxAsset: r.amounts.deferred_tax_asset, netDeferredTaxLiability: r.amounts.net_deferred_tax_liability,
        deferredTaxExpense: r.amounts.deferred_tax_expense, currentTax: r.amounts.current_tax,
        incomeTaxExpense: r.amounts.income_tax_expense, applicableRate: r.rates.applicable_rate,
        closingRate: r.rates.closing_rate, openingRate: r.rates.opening_rate,
        effectiveTaxRate: r.rates.effective_tax_rate ?? null, amounts: r.amounts,
        items: r.items.map((it) => ({
          label: it.label, class: it.class, temporaryDifference: it.temporary_difference, nature: it.nature,
          openingTemporaryDifference: it.opening_temporary_difference, openingNature: it.opening_nature,
        })),
        warnings: r.warnings, basis: r.applicable_rate_basis, currency: 'AUD', source: `${CALCULATORS}deferred-tax/`,
      };
    },
  });
}

/**
 * Business Calculators Cohort E (the 3 tools added 25 November 2026), keyed by each form's `data-calculator` slug.
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'rdTaxOffset' | 'RD_YEARS' | 'gstAdjustment' | 'percentFraction'
 *   | 'GST_WORKSHEETS' | 'GST_ADJUSTMENT_YEARS' | 'deferredTax' | 'DEFERRED_TAX_YEARS'>} calculate
 */
export function businessCohortETools(kit, calculate) {
  return {
    'rd-tax-offset': rdTaxOffsetTool(kit, calculate.rdTaxOffset, calculate.RD_YEARS),
    'gst-adjustments': gstAdjustmentsTool(kit, calculate),
    'deferred-tax': deferredTaxTool(kit, calculate.deferredTax, calculate.DEFERRED_TAX_YEARS),
  };
}
