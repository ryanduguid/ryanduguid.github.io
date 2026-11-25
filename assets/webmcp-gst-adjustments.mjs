// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for GST adjustments and tests (Divisions 21, 129, 131,
// 136 and 189, Subdivision 66-A and s 38-325). Imported by assets/webmcp-business-e.mjs.

import { checkModeFields } from './webmcp-business-b-payroll.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {import('./webmcp-tools.mjs').Schema} Schema */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const GST_COMMON = new Set(['worksheet', 'year', 'scopeConfirmed']);
const GST_ALLOWED = new Map([
  ['creditable-purpose', new Set([
    'gstExclusiveValue', 'relatesToBusinessFinance', 'fullInputTaxCredit', 'intendedOrFormerApplicationPercent',
    'actualApplicationPercent', 'applicationBasis', 'attributedPeriodEnd', 'taxPeriodMonths', 'endedOn',
    'division132Disposal',
  ])],
  ['annual-apportionment', new Set([
    'smallBusinessEntity', 'carriesOnBusiness', 'gstTurnover', 'instalmentElection', 'annualTaxPeriodElection',
    'electionMade', 'gstOnAcquisition', 'creditablePurposePercent', 'nonInputTaxedExtentPercent',
    'considerationExtentPercent', 'car', 'reducedCreditAcquisition',
  ])],
  ['financial-acquisitions', new Set([
    'gstGroup', 'currentFinancialCredits', 'currentTotalCredits', 'futureFinancialCredits', 'futureTotalCredits',
  ])],
  ['going-concern', new Set([
    'forConsideration', 'recipientRegistration', 'writtenAgreement', 'allThingsNecessary', 'carriedOnUntilSupply',
    'farmLand', 'partOutsideArrangement',
  ])],
  ['second-hand-goods', new Set([
    'consideration', 'resupplyGst', 'acquiredForSaleOrExchange', 'animalsOrPlants', 'supplyToYou', 'imported',
    'byWayOfHire', 'resupplyTaxable', 'dividedForResupply', 'valuableMetal', 'leasedBeforeSale',
  ])],
  ['bad-debt', new Set([
    'party', 'event', 'amount', 'taxableOrCreditable', 'cashBasis', 'specialRule', 'attributed', 'overdueFrom',
    'asAt', 'priorAdjustment', 'taxableProportionPercent', 'creditablePurposePercent', 'considerationExtentPercent',
    'reducedCreditAcquisition', 'annualApportionment',
  ])],
]);
const GST_REQUIRED = new Map([
  ['creditable-purpose', [
    'gstExclusiveValue', 'relatesToBusinessFinance', 'fullInputTaxCredit', 'intendedOrFormerApplicationPercent',
    'actualApplicationPercent', 'applicationBasis', 'attributedPeriodEnd', 'taxPeriodMonths',
  ]],
  ['annual-apportionment', [
    'smallBusinessEntity', 'carriesOnBusiness', 'instalmentElection', 'annualTaxPeriodElection', 'electionMade',
    'gstOnAcquisition', 'creditablePurposePercent',
  ]],
  ['financial-acquisitions', [
    'gstGroup', 'currentFinancialCredits', 'currentTotalCredits', 'futureFinancialCredits', 'futureTotalCredits',
  ]],
  ['going-concern', [
    'forConsideration', 'recipientRegistration', 'writtenAgreement', 'allThingsNecessary', 'carriedOnUntilSupply',
  ]],
  ['second-hand-goods', [
    'consideration', 'acquiredForSaleOrExchange', 'animalsOrPlants', 'supplyToYou', 'imported', 'byWayOfHire',
    'resupplyTaxable',
  ]],
  ['bad-debt', ['party', 'event', 'amount', 'taxableOrCreditable', 'cashBasis', 'specialRule']],
]);

const SPECIAL_RULES = [
  'none', 'taxable_at_less_than_one_eleventh', 'gambling_supply', 'debt_assigned', 'transition_act_s15g',
  'incapacitated_entity_representative',
];

/** @param {ToolKit} kit @param {readonly string[]} worksheets @param {readonly string[]} years @returns {Record<string, Schema>} */
function gstCoreSchema(kit, worksheets, years) {
  const { text, choice, whole } = kit;
  return {
    worksheet: choice([...worksheets], 'GST adjustment worksheet or test to run.'),
    year: choice([...years], `Financial year of the tax period, ${years[0]} to ${years.at(-1)}.`),
    scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    gstExclusiveValue: text('trillionCost', 'creditable-purpose: GST exclusive value of the acquisition in AUD.'),
    relatesToBusinessFinance: { type: 'boolean', description: 'creditable-purpose: true when the acquisition relates to making financial supplies (s 129-10(3)).' },
    fullInputTaxCredit: text('trillionCost', 'creditable-purpose: full input tax credit in AUD.'),
    intendedOrFormerApplicationPercent: text('percent', 'creditable-purpose: intended or former creditable application (0 to 100%).'),
    actualApplicationPercent: text('percent', 'creditable-purpose: actual creditable application to 30 June (0 to 100%).'),
    applicationBasis: { type: 'string', description: 'creditable-purpose: method and records the 2 applications rest on (1 to 200 characters).' },
    attributedPeriodEnd: text('date', 'creditable-purpose: last day of the tax period the acquisition is attributable to, YYYY-MM-DD.'),
    taxPeriodMonths: whole(1, 12, 'creditable-purpose: tax period length in months (1 monthly, 3 quarterly, or 12 annual).'),
    endedOn: text('date', 'creditable-purpose optional: YYYY-MM-DD when disposed of, lost, stolen, destroyed or expired.'),
    division132Disposal: { type: 'boolean', description: 'creditable-purpose with endedOn: true when disposal had a Division 132 adjustment; false when omitted.' },
  };
}

/** @param {ToolKit} kit @returns {Record<string, Schema>} */
function gstMoreSchema(kit) {
  const { text, choice } = kit;
  return {
    smallBusinessEntity: { type: 'boolean', description: 'annual-apportionment: true when a small business entity (not via ITAA 1997 s 328-110(4)).' },
    carriesOnBusiness: { type: 'boolean', description: 'annual-apportionment: true when carrying on a business.' },
    gstTurnover: text('trillionCost', 'annual-apportionment: GST turnover in AUD; required only when smallBusinessEntity and carriesOnBusiness are both false.'),
    instalmentElection: { type: 'boolean', description: 'annual-apportionment: true when paying GST by instalments (s 162-15).' },
    annualTaxPeriodElection: { type: 'boolean', description: 'annual-apportionment: true when an annual tax period election (s 151-10) is in effect.' },
    electionMade: { type: 'boolean', description: 'annual-apportionment: true when an annual apportionment election is in effect.' },
    gstOnAcquisition: text('trillionCost', 'annual-apportionment: GST payable on the supply in AUD.'),
    creditablePurposePercent: text('percent', 'annual-apportionment or recipient bad-debt: extent of creditable purpose (0 to 100%).'),
    nonInputTaxedExtentPercent: text('percent', 'annual-apportionment optional: extent not relating to input taxed supplies (0 to 100%); 100% when omitted.'),
    considerationExtentPercent: text('percent', 'annual-apportionment or recipient bad-debt optional: extent of consideration provided (0 to 100%); 100% when omitted.'),
    car: { type: 'boolean', description: 'annual-apportionment optional: true for a car (s 131-50, refused); false when omitted.' },
    reducedCreditAcquisition: { type: 'boolean', description: 'annual-apportionment or recipient bad-debt optional: true for a reduced credit acquisition (refused); false when omitted.' },
    gstGroup: { type: 'boolean', description: 'financial-acquisitions: true when a member of a GST group.' },
    currentFinancialCredits: text('trillionCost', 'financial-acquisitions: financial acquisitions credits over the 12 months ending this month in AUD.'),
    currentTotalCredits: text('trillionCost', 'financial-acquisitions: all acquisitions and importations credits over the same 12 months in AUD.'),
    futureFinancialCredits: text('trillionCost', 'financial-acquisitions: financial acquisitions credits over this month and the next 11 months in AUD.'),
    futureTotalCredits: text('trillionCost', 'financial-acquisitions: all acquisitions and importations credits over the same future 12 months in AUD.'),
    forConsideration: { type: 'boolean', description: 'going-concern: true when supplied for consideration.' },
    recipientRegistration: choice(['registered', 'required_to_be_registered', 'neither'], 'going-concern: recipient GST registration status.'),
    writtenAgreement: choice(['on_or_before_supply_day', 'after_supply_day', 'none'], 'going-concern: timing of written agreement.'),
    allThingsNecessary: { type: 'boolean', description: 'going-concern: true when all things necessary for continued operation are supplied.' },
    carriedOnUntilSupply: { type: 'boolean', description: 'going-concern: true when carried on until the day of supply.' },
    farmLand: { type: 'boolean', description: 'going-concern optional: true for farm land supplied for farming (refused); false when omitted.' },
    partOutsideArrangement: { type: 'boolean', description: 'going-concern optional: true when part is outside the arrangement (refused); false when omitted.' },
  };
}

/** @param {ToolKit} kit @returns {Record<string, Schema>} */
function gstTailSchema(kit) {
  const { text, choice } = kit;
  return {
    consideration: text('trillionCost', 'second-hand-goods: consideration given for the goods in AUD.'),
    resupplyGst: text('trillionCost', 'second-hand-goods: GST on taxable resupply in AUD; required above $300, refused at $300 or less.'),
    acquiredForSaleOrExchange: { type: 'boolean', description: 'second-hand-goods: true when acquired for sale or exchange (not manufacture) in ordinary course of business.' },
    animalsOrPlants: { type: 'boolean', description: 'second-hand-goods: true when animals or plants.' },
    supplyToYou: choice(['neither', 'taxable', 'gst_free'], 'second-hand-goods: GST status of the supply to you.'),
    imported: { type: 'boolean', description: 'second-hand-goods: true when imported by you.' },
    byWayOfHire: { type: 'boolean', description: 'second-hand-goods: true when supplied by way of hire.' },
    resupplyTaxable: { type: 'boolean', description: 'second-hand-goods: true when your resupply of the goods is taxable.' },
    dividedForResupply: { type: 'boolean', description: 'second-hand-goods optional: true when divided into 2 or more resupplies (refused); false when omitted.' },
    valuableMetal: { type: 'boolean', description: 'second-hand-goods optional: true when partly or wholly gold, silver or platinum (refused); false when omitted.' },
    leasedBeforeSale: { type: 'boolean', description: 'second-hand-goods optional: true when leased before sold (refused); false when omitted.' },
    party: choice(['supplier', 'recipient'], 'bad-debt: "supplier" or "recipient".'),
    event: choice(['written_off', 'overdue_12_months', 'recovered'], 'bad-debt: event triggering the adjustment.'),
    amount: text('trillionCost', 'bad-debt: amount written off, overdue, recovered or paid including GST in AUD.'),
    taxableOrCreditable: { type: 'boolean', description: 'bad-debt: true for a taxable supply (supplier) or creditable acquisition for consideration (recipient).' },
    cashBasis: { type: 'boolean', description: 'bad-debt: true when accounting on a cash basis.' },
    specialRule: choice(SPECIAL_RULES, 'bad-debt: "none" (any special rule refuses).'),
    attributed: { type: 'boolean', description: 'bad-debt (written_off or overdue_12_months): true when GST or credit was attributed.' },
    overdueFrom: text('date', 'bad-debt (overdue_12_months): first day overdue as YYYY-MM-DD.'),
    asAt: text('date', 'bad-debt (overdue_12_months): test date as YYYY-MM-DD.'),
    priorAdjustment: { type: 'boolean', description: 'bad-debt (recovered): true when an earlier Division 21 adjustment applied.' },
    taxableProportionPercent: text('percent', 'bad-debt (supplier optional): taxable proportion (0 to 100%); wholly taxable when omitted.'),
    annualApportionment: { type: 'boolean', description: 'bad-debt (recipient optional): true if credit worked under Division 131 (refused); false when omitted.' },
  };
}

/** @param {Record<string, any>} x @param {(p: string) => string} pf */
function buildCpInput(x, pf) {
  return {
    gst_exclusive_value: x.gstExclusiveValue, relates_to_business_finance: x.relatesToBusinessFinance,
    full_input_tax_credit: x.fullInputTaxCredit, intended_or_former_application: pf(x.intendedOrFormerApplicationPercent),
    actual_application: pf(x.actualApplicationPercent), application_basis: x.applicationBasis,
    attributed_period_end: x.attributedPeriodEnd, tax_period_months: x.taxPeriodMonths,
    ...(x.endedOn !== undefined ? { ended_on: x.endedOn } : {}),
    ...(x.division132Disposal !== undefined ? { division_132_disposal: x.division132Disposal } : {}),
  };
}

/** @param {Record<string, any>} x @param {(p: string) => string} pf */
function buildAaInput(x, pf) {
  return {
    small_business_entity: x.smallBusinessEntity, carries_on_business: x.carriesOnBusiness,
    instalment_election: x.instalmentElection, annual_tax_period_election: x.annualTaxPeriodElection,
    election_made: x.electionMade, gst_on_acquisition: x.gstOnAcquisition,
    creditable_purpose: pf(x.creditablePurposePercent), car: x.car ?? false,
    reduced_credit_acquisition: x.reducedCreditAcquisition ?? false,
    ...(x.gstTurnover !== undefined ? { gst_turnover: x.gstTurnover } : {}),
    ...(x.nonInputTaxedExtentPercent !== undefined ? { non_input_taxed_extent: pf(x.nonInputTaxedExtentPercent) } : {}),
    ...(x.considerationExtentPercent !== undefined ? { consideration_extent: pf(x.considerationExtentPercent) } : {}),
  };
}

/** @param {Record<string, any>} x @param {(p: string) => string} pf */
function buildBadDebtInput(x, pf) {
  const recipient = x.party === 'recipient';
  return {
    party: x.party, event: x.event, amount: x.amount, taxable_or_creditable: x.taxableOrCreditable,
    cash_basis: x.cashBasis, special_rule: x.specialRule,
    ...(x.attributed !== undefined ? { attributed: x.attributed } : {}),
    ...(x.overdueFrom !== undefined ? { overdue_from: x.overdueFrom } : {}),
    ...(x.asAt !== undefined ? { as_at: x.asAt } : {}),
    ...(x.priorAdjustment !== undefined ? { prior_adjustment: x.priorAdjustment } : {}),
    ...(x.taxableProportionPercent !== undefined ? { taxable_proportion: pf(x.taxableProportionPercent) } : {}),
    ...(x.creditablePurposePercent !== undefined ? { creditable_purpose: pf(x.creditablePurposePercent) } : {}),
    ...(x.considerationExtentPercent !== undefined ? { consideration_extent: pf(x.considerationExtentPercent) } : {}),
    ...(recipient || x.reducedCreditAcquisition !== undefined ? { reduced_credit_acquisition: x.reducedCreditAcquisition ?? false } : {}),
    ...(recipient || x.annualApportionment !== undefined ? { annual_apportionment: x.annualApportionment ?? false } : {}),
  };
}

/** @param {Record<string, any>} x @param {(p: string) => string} pf */
function buildGstEngineInput(x, pf) {
  const common = { year: x.year, scope_confirmed: x.scopeConfirmed ?? true };
  if (x.worksheet === 'creditable-purpose') return { ...common, ...buildCpInput(x, pf) };
  if (x.worksheet === 'annual-apportionment') return { ...common, ...buildAaInput(x, pf) };
  if (x.worksheet === 'financial-acquisitions') {
    return {
      ...common, gst_group: x.gstGroup, current_financial_credits: x.currentFinancialCredits,
      current_total_credits: x.currentTotalCredits, future_financial_credits: x.futureFinancialCredits,
      future_total_credits: x.futureTotalCredits,
    };
  }
  if (x.worksheet === 'going-concern') {
    return {
      ...common, for_consideration: x.forConsideration, recipient_registration: x.recipientRegistration,
      written_agreement: x.writtenAgreement, all_things_necessary: x.allThingsNecessary,
      carried_on_until_supply: x.carriedOnUntilSupply, farm_land: x.farmLand ?? false,
      part_outside_arrangement: x.partOutsideArrangement ?? false,
    };
  }
  if (x.worksheet === 'second-hand-goods') {
    return {
      ...common, consideration: x.consideration, acquired_for_sale_or_exchange: x.acquiredForSaleOrExchange,
      animals_or_plants: x.animalsOrPlants, supply_to_you: x.supplyToYou, imported: x.imported,
      by_way_of_hire: x.byWayOfHire, resupply_taxable: x.resupplyTaxable,
      divided_for_resupply: x.dividedForResupply ?? false, valuable_metal: x.valuableMetal ?? false,
      leased_before_sale: x.leasedBeforeSale ?? false, ...(x.resupplyGst !== undefined ? { resupply_gst: x.resupplyGst } : {}),
    };
  }
  return { ...common, ...buildBadDebtInput(x, pf) };
}

/**
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'gstAdjustment' | 'percentFraction' | 'GST_WORKSHEETS' | 'GST_ADJUSTMENT_YEARS'>} calculate
 */
export function gstAdjustmentsTool(kit, calculate) {
  const { record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_gst_adjustments',
    title: 'GST adjustments calculator',
    description: 'GST Act adjustment or test in AUD for one tax period in 2020-21 to 2026-27 across 6 worksheets: '
      + 'Division 129 change in creditable purpose, Division 131 annual apportionment, Division 189 financial '
      + 'acquisitions threshold, s 38-325 supply of a going concern, Subdivision 66-A second-hand goods credit and '
      + 'Division 21 / Subdivision 136-A bad debt adjustment. Refuses fields from another worksheet and excluded '
      + 'facts such as cars, reduced credit acquisitions, farm land, divided resupplies, valuable metal and special bad debt rules.',
    inputSchema: record(
      { ...gstCoreSchema(kit, calculate.GST_WORKSHEETS, calculate.GST_ADJUSTMENT_YEARS), ...gstMoreSchema(kit), ...gstTailSchema(kit) },
      ['worksheet', 'year'],
    ),
    run(input) {
      checkModeFields(input, input.worksheet, GST_ALLOWED, GST_REQUIRED, GST_COMMON);
      const r = /** @type {Record<string, any>} */ (calculate.gstAdjustment(input.worksheet, buildGstEngineInput(input, calculate.percentFraction)));
      return {
        worksheet: input.worksheet, incomeYear: r.period, outcome: r.outcome,
        amount: r.amount === null ? null : dollars(r.amount), amounts: r.amounts, rates: r.rates,
        ...(r.adjustment_period ? { adjustmentPeriod: r.adjustment_period, noAdjustmentReason: r.no_adjustment_reason, applicationBasis: r.application_basis } : {}),
        ...(r.eligible !== undefined ? { eligible: r.eligible } : {}),
        ...(r.applies !== undefined ? { applies: r.applies } : {}),
        ...(r.exceeds_threshold !== undefined ? { exceedsThreshold: r.exceeds_threshold } : {}),
        ...(r.gst_free !== undefined ? { gstFree: r.gst_free } : {}),
        ...(r.direction ? { direction: r.direction } : {}),
        ...(r.failing_conditions ? { failingConditions: r.failing_conditions } : {}),
        conditions: r.conditions, consequences: r.consequences, currency: 'AUD', source: `${CALCULATORS}gst-adjustments/`,
      };
    },
  });
}
