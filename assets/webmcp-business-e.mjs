// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort E (the 3 calculators
// added on 24 November 2026: R&D tax offset, GST adjustments and deferred tax;
// and trust streaming, added on 26 November 2026).
// Imported by assets/webmcp-tools.mjs.

import { gstAdjustmentsTool } from './webmcp-gst-adjustments.mjs';
import { soleTraderCompanyTool } from './webmcp-sole-trader-company.mjs';

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

/** @param {ToolKit} kit @param {BusinessCalculators['trustStreaming']} trustStreaming @param {number} rows */
export function trustStreamingTool(kit, trustStreaming, rows) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  const beneficiary = record({
    name: { type: 'string', description: 'Beneficiary name (up to 200 characters); blank gives "Beneficiary n".' },
    kind: choice(['individual', 'company', 'trust'], 'Kind of beneficiary; decides whether it applies the CGT discount to its extra capital gain.'),
    presentEntitlement: text('amount', 'Present entitlement to the trust\'s income in AUD, including any amounts specifically entitled to.'),
    capitalGainEntitled: text('amount', 'Of that, the financial benefit referable to the capital gain the beneficiary is specifically entitled to (s 115-228), AUD; "0" when omitted.'),
    frankedEntitled: text('amount', 'Of that, the financial benefit referable to the franked distributions the beneficiary is specifically entitled to (s 207-58), AUD; "0" when omitted.'),
  }, ['kind', 'presentEntitlement']);
  return tool({
    name: 'calculate_trust_streaming',
    title: 'Trust streaming calculator',
    description: 'A resident discretionary trust\'s net income for one income year in AUD: each resident beneficiary\'s '
      + 'Division 6 share (ITAA 1936) of net income other than capital gains, franked distributions and franking credits '
      + 'by Division 6E present entitlement; capital gains streamed under Subdivision 115-C and franked distributions and '
      + 'franking credits under Subdivision 207-B ITAA 1997 to beneficiaries specifically entitled, the rest by adjusted '
      + 'Division 6 percentage, with the rateable reduction; and the trustee\'s s 99A assessment at 45% with its franking '
      + 'credit offset. One capital gain; no s 98 beneficiaries, s 115-230 choice, s 100A, family trust or bucket company advice.',
    inputSchema: record({
      otherTrustIncome: text('signedCost', 'Trust income other than the capital gain and franked distributions, after expenses charged against it, AUD (may be negative).'),
      otherNetIncome: text('signedCost', 'Net income other than the capital gain, franked distributions and franking credits, AUD (may be negative).'),
      frankedDistributions: text('amount', 'Franked distributions received, AUD; "0" when omitted.'),
      frankingCredits: text('amount', 'Franking credits attached, AUD; "0" when omitted.'),
      frankedDeductions: text('amount', 'Deductions directly relevant to the franked distributions, AUD; "0" when omitted.'),
      capitalGain: text('amount', 'The capital gain before capital losses and concessions, AUD; "0" when omitted.'),
      capitalGainRemaining: text('amount', 'The gain remaining after steps 1 to 6 of the s 102-5(1) method statement, AUD; "0" when omitted.'),
      capitalGainConcessions: choice(['none', 'discount', 'small_business', 'both'], 'Concessions the trust applied to the gain; "none" when omitted.'),
      capitalGainTrustIncome: text('amount', 'Amount of the gain included in the trust\'s income, AUD; "0" when omitted.'),
      beneficiaries: { type: 'array', maxItems: rows, items: beneficiary, description: `Up to ${rows} presently entitled beneficiaries, each a resident not under a legal disability.` },
    }, ['otherTrustIncome', 'otherNetIncome', 'beneficiaries']),
    run(input) {
      const r = trustStreaming({
        other_trust_income: input.otherTrustIncome, other_net_income: input.otherNetIncome,
        franked_distributions: input.frankedDistributions ?? '0', franking_credits: input.frankingCredits ?? '0',
        franked_deductions: input.frankedDeductions ?? '0', capital_gain: input.capitalGain ?? '0',
        capital_gain_remaining: input.capitalGainRemaining ?? '0', capital_gain_concessions: input.capitalGainConcessions ?? 'none',
        capital_gain_trust_income: input.capitalGainTrustIncome ?? '0',
        beneficiaries: input.beneficiaries.map((/** @type {Record<string, string>} */ b) => ({ name: b.name ?? '', kind: b.kind,
          present_entitlement: b.presentEntitlement, capital_gain_entitled: b.capitalGainEntitled ?? '0', franked_entitled: b.frankedEntitled ?? '0' })),
      });
      return { ...r.amounts, grossUp: r.grossUp, beneficiaries: r.beneficiaries, trustee: r.trustee, currency: 'AUD',
        source: `${CALCULATORS}trust-streaming/` };
    },
  });
}

/**
 * Business Calculators Cohort E (the 3 tools added 25 November 2026, and sole trader against company and
 * trust streaming, 26 November), keyed by each form's `data-calculator` slug.
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'rdTaxOffset' | 'RD_YEARS' | 'gstAdjustment' | 'percentFraction'
 *   | 'GST_WORKSHEETS' | 'GST_ADJUSTMENT_YEARS' | 'deferredTax' | 'DEFERRED_TAX_YEARS' | 'soleTraderCompany'
 *   | 'SOLE_TRADER_COMPANY_YEARS' | 'trustStreaming' | 'TRUST_STREAMING_ROWS'>} calculate
 */
export function businessCohortETools(kit, calculate) {
  return {
    'rd-tax-offset': rdTaxOffsetTool(kit, calculate.rdTaxOffset, calculate.RD_YEARS),
    'gst-adjustments': gstAdjustmentsTool(kit, calculate),
    'deferred-tax': deferredTaxTool(kit, calculate.deferredTax, calculate.DEFERRED_TAX_YEARS),
    'sole-trader-company': soleTraderCompanyTool(kit, calculate.soleTraderCompany, calculate.SOLE_TRADER_COMPANY_YEARS),
    'trust-streaming': trustStreamingTool(kit, calculate.trustStreaming, calculate.TRUST_STREAMING_ROWS),
  };
}
