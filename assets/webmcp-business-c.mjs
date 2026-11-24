// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort C (9 calculators):
// capital gains tax, small business CGT concessions, PCG 2021/4 risk scorer,
// PCG 2021/4 allocation, plus PSI and rental property from webmcp-business-c-rental.mjs
// and super lump sum tax, unused leave and workers compensation from
// webmcp-business-c-workforce.mjs. Imported by assets/webmcp-tools.mjs.

import { psiDeterminationTool, rentalPropertyTool } from './webmcp-business-c-rental.mjs';
import {
  requireWhen, superBenefitTaxTool, unusedLeaveTool, workersCompensationTool,
} from './webmcp-business-c-workforce.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {import('./webmcp-tools.mjs').Schema} Schema */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const PCG_ALLOCATION_YEARS = new Map([
  ['2026-27', { scale: '0,0,0;18201,0,15;45001,4020,30;135001,31020,37;190001,51370,45', baseRate: '25', companyRate: '30' }],
  ['2025-26', { scale: '0,0,0;18201,0,16;45001,4288,30;135001,31288,37;190001,51638,45', baseRate: '25', companyRate: '30' }],
  ['2024-25', { scale: '0,0,0;18201,0,16;45001,4288,30;135001,31288,37;190001,51638,45', baseRate: '25', companyRate: '30' }],
  ['2023-24', { scale: '0,0,0;18201,0,19;45001,5092,32.5;120001,29467,37;180001,51667,45', baseRate: '25', companyRate: '30' }],
  ['2022-23', { scale: '0,0,0;18201,0,19;45001,5092,32.5;120001,29467,37;180001,51667,45', baseRate: '25', companyRate: '30' }],
  ['2020-21', { scale: '0,0,0;18201,0,19;45001,5092,32.5;120001,29467,37;180001,51667,45', baseRate: '26', companyRate: '30' }],
]);

/** @param {string} value @param {string} name */
function assertRealDate(value, name) {
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() + 1 !== m || parsed.getUTCDate() !== d) {
    throw new Error(`${name} must be a real calendar date as YYYY-MM-DD.`);
  }
}

/** @param {ToolKit} kit @returns {Schema} */
function cgtHomeSchema(kit) {
  const { text, record } = kit;
  const absenceSchema = record({
    from: text('date', 'First day away after moving in, YYYY-MM-DD.'),
    to: text('date', 'Last day away, YYYY-MM-DD.'),
    rented: { type: 'boolean', description: 'true when rented or available for rent during this period.' },
    treatAsMainResidence: { type: 'boolean', description: 'true to choose ITAA 1997 s 118-145 main residence treatment.' },
  }, ['from', 'to', 'rented', 'treatAsMainResidence']);
  return record({
    purchaseSettlementDate: text('date', 'Settlement date of the purchase, YYYY-MM-DD.'),
    saleSettlementDate: text('date', 'Settlement date of the sale, YYYY-MM-DD.'),
    movedInDate: text('date', 'Date moved into the home, YYYY-MM-DD.'),
    movedInAsSoonAsPracticable: { type: 'boolean', description: 'true when moved in as soon as practicable (s 118-135); true when omitted.' },
    hasExclusions: { type: 'boolean', description: 'true if >2 ha, spouse with another main residence, inherited, built on owned land or 2-home overlap (refused); false when omitted.' },
    absences: { type: 'array', maxItems: 10, items: absenceSchema, description: 'Optional periods away after moving in, in date order without overlaps.' },
    incomeProducingFloorPercent: text('percent', 'Floor area percentage used to produce income (0 to 100); "0" when omitted.'),
    incomeProducingFrom: text('date', 'First day of income-producing floor area use, YYYY-MM-DD; required when incomeProducingFloorPercent > 0.'),
    incomeProducingTo: text('date', 'Last day of income-producing floor area use, YYYY-MM-DD; required when incomeProducingFloorPercent > 0.'),
    marketValueAtFirstIncomeUse: text('cost', 'Market value when first used to produce income in AUD (for s 118-192); "0" when omitted.'),
  }, ['purchaseSettlementDate', 'saleSettlementDate', 'movedInDate']);
}

/** @param {Record<string, any> | undefined} h @returns {import('./cgt.mjs').CgtHome} */
function buildCgtHome(h) {
  if (!h) {
    return {
      purchased: '', sold: '', movedIn: '', practicable: 'yes', exclusions: 'none',
      away: [], partPercent: '0', partFrom: '', partTo: '', market: '0',
    };
  }
  const {
    absences = [], incomeProducingFloorPercent = '0', incomeProducingFrom = '',
    incomeProducingTo = '', marketValueAtFirstIncomeUse = '0',
  } = h;
  const hasPart = Number(incomeProducingFloorPercent) > 0;
  requireWhen(hasPart, h.incomeProducingFrom, 'incomeProducingFrom', 'when incomeProducingFloorPercent is above zero');
  requireWhen(hasPart, h.incomeProducingTo, 'incomeProducingTo', 'when incomeProducingFloorPercent is above zero');
  return {
    purchased: h.purchaseSettlementDate,
    sold: h.saleSettlementDate,
    movedIn: h.movedInDate,
    practicable: h.movedInAsSoonAsPracticable === false ? 'no' : 'yes',
    exclusions: h.hasExclusions === true ? 'some' : 'none',
    away: absences.map((/** @type {Record<string, any>} */ a) => ({
      from: a.from, to: a.to, rented: a.rented, choose: a.treatAsMainResidence,
    })),
    partPercent: incomeProducingFloorPercent,
    partFrom: incomeProducingFrom,
    partTo: incomeProducingTo,
    market: marketValueAtFirstIncomeUse,
  };
}

/** @param {Record<string, any>} input @returns {import('./cgt.mjs').CgtEvent} */
function buildCgtEvent(input) {
  if (input.entity !== 'individual' && input.otherTaxableIncome !== undefined) {
    throw new Error('otherTaxableIncome applies only when entity is "individual".');
  }
  requireWhen(input.assetKind === 'home', input.home, 'home', 'when assetKind is "home"');
  if (input.buyingCosts) assertRealDate(input.buyingCosts.date, 'buyingCosts.date');
  const {
    buyingCosts = { amount: '0', date: '' }, improvements = [], sellingCosts = '0', owningCosts = '0',
    capitalWorksDeductions = '0', currentYearCapitalLosses = '0', priorYearCapitalLosses = '0', otherTaxableIncome = 0,
  } = input;
  for (const item of improvements) assertRealDate(item.date, 'improvements.date');
  return {
    entity: input.entity,
    resident: input.australianResident === false ? 'no' : 'yes',
    kind: input.assetKind,
    acquired: input.purchaseContractDate,
    event: input.saleContractDate,
    proceeds: input.proceeds,
    price: input.purchasePrice,
    buying: buyingCosts,
    improvements,
    selling: sellingCosts,
    owning: owningCosts,
    works: capitalWorksDeductions,
    currentLosses: currentYearCapitalLosses,
    priorLosses: priorYearCapitalLosses,
    income: String(otherTaxableIncome),
    home: buildCgtHome(input.home),
  };
}

/** @param {ToolKit} kit @param {BusinessCalculators['capitalGain']} capitalGain */
export function cgtTool(kit, capitalGain) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  const datedCostSchema = record({
    amount: text('cost', 'Amount in AUD with at most 2 decimal places.'),
    date: text('date', 'Date the cost was incurred, YYYY-MM-DD.'),
  }, ['amount', 'date']);
  return tool({
    name: 'calculate_capital_gains_tax',
    title: 'Capital gains tax calculator',
    description: 'Capital gain or capital loss in AUD from one CGT event A1 (sale contract from 1 July 2020 to 30 June 2027) '
      + 'for an Australian resident individual, trust, complying super fund or company under ITAA 1997 Parts 3-1 and 3-3: '
      + 'cost base, indexed cost base (pre-21 September 1999 assets), reduced cost base, discount or indexation comparison, '
      + 'main residence exemption (6-year absence rule, s 118-190 income-producing floor area and s 118-192 market value reset), '
      + 'supplementary return labels A and V in whole dollars and, for an individual, estimated extra resident income tax and '
      + 'Medicare levy. Refuses foreign or temporary residents, collectables, personal use assets, 10%+ non-widely-held equity '
      + 'interests for non-companies and main residence exclusions. Does not cover Division 152 concessions or contracts from 1 July 2027.',
    inputSchema: record({
      entity: choice(['individual', 'trust', 'super', 'company'], 'Who made the capital gain or loss.'),
      australianResident: { type: 'boolean', description: 'true when an Australian resident (not temporary resident) throughout ownership after 8 May 2012; false refuses; true when omitted.' },
      assetKind: choice(['investment', 'equity', 'home', 'personal'], '"investment", "home" (individual main residence), "equity" (10%+ non-widely-held; refused for non-companies) or "personal" (refused).'),
      purchaseContractDate: text('date', 'Purchase contract date as YYYY-MM-DD (on or after 1985-09-20).'),
      saleContractDate: text('date', 'Sale contract date as YYYY-MM-DD, from 2020-07-01 to 2027-06-30.'),
      proceeds: text('cost', 'Capital proceeds in AUD with at most 2 decimal places.'),
      purchasePrice: text('cost', 'Purchase price in AUD with at most 2 decimal places.'),
      buyingCosts: datedCostSchema,
      improvements: { type: 'array', maxItems: 20, items: datedCostSchema, description: 'Optional capital improvements or title costs with their dates (up to 20).' },
      sellingCosts: text('cost', 'Selling costs (agent, legal fees) in AUD; "0" when omitted.'),
      owningCosts: text('cost', 'Non-deductible costs of owning (post-20 August 1991 assets) in AUD; "0" when omitted.'),
      capitalWorksDeductions: text('cost', 'Capital works deductions claimed or claimable in AUD; "0" when omitted.'),
      currentYearCapitalLosses: text('cost', 'Other capital losses in this income year in AUD; "0" when omitted.'),
      priorYearCapitalLosses: text('cost', 'Net capital losses carried forward from earlier years in AUD; "0" when omitted.'),
      otherTaxableIncome: whole(0, 1000000000, 'Individual only: other taxable income this year in whole AUD; 0 when omitted.'),
      home: cgtHomeSchema(kit),
    }, ['entity', 'assetKind', 'purchaseContractDate', 'saleContractDate', 'proceeds', 'purchasePrice']),
    run(input) {
      const r = capitalGain(buildCgtEvent(input));
      return {
        method: r.method, incomeYear: r.year, effectiveAcquisitionDate: r.acquired,
        costBase: dollars(r.costBase),
        indexedCostBase: r.indexedCostBase === null ? null : dollars(r.indexedCostBase),
        reducedCostBase: dollars(r.reducedCostBase),
        grossGainOrLoss: dollars(r.gross),
        ownershipDays: r.ownershipDays, nonMainResidenceDays: r.nonMainDays,
        incomeProducingPartDays: r.partDays, incomeProducingPartPercent: r.partPercent,
        section118_192Date: r.incomeTime,
        totalCurrentYearGain: dollars(r.gain), capitalLoss: dollars(r.loss),
        currentYearLossesApplied: dollars(r.currentApplied), priorYearLossesApplied: dollars(r.priorApplied),
        discount: dollars(r.discount), netCapitalGain: dollars(r.net),
        labelAWholeDollars: String(r.labelA), lossesCarriedForward: dollars(r.carried),
        labelVWholeDollars: String(r.labelV),
        estimatedExtraTax: r.tax === null ? null : dollars(r.tax),
        sixYearCapExceeded: r.sixYears,
        alternativeMethod: r.alternative ? { method: r.alternative.method, netCapitalGain: dollars(r.alternative.net) } : null,
        currency: 'AUD', source: `${CALCULATORS}cgt/`,
      };
    },
  });
}

/** @param {Record<string, any>} input @returns {import('./cgt-concessions.mjs').ConcessionAnswers} */
function buildConcessionsAnswers(input) {
  requireWhen(input.businessInPreviousYear === true, input.previousYearTurnover, 'previousYearTurnover', 'when businessInPreviousYear is true');
  requireWhen(input.businessInEarlierYear === true, input.earlierYearTurnover, 'earlierYearTurnover', 'when businessInEarlierYear is true');
  requireWhen(input.businessInSaleYear !== 'no', input.likelyTurnover, 'likelyTurnover', 'when businessInSaleYear is not "no"');
  requireWhen(input.businessInSaleYear !== 'no', input.actualTurnover, 'actualTurnover', 'when businessInSaleYear is not "no"');
  const isEntity = input.entity !== 'individual';
  requireWhen(isEntity, input.significantIndividualJustBefore, 'significantIndividualJustBefore', 'when entity is a company or trust');
  requireWhen(isEntity, input.significantIndividualFor15Years, 'significantIndividualFor15Years', 'when entity is a company or trust');
  if (input.businessCeasedDate === undefined && input.commissionerExtension !== undefined) {
    throw new Error('commissionerExtension applies only when businessCeasedDate is supplied.');
  }
  const {
    previousYearTurnover = '0', earlierYearTurnover = '0', likelyTurnover = '0', actualTurnover = '0',
    passivelyHeld = 'none', businessCeasedDate = '', retirementLimitUsed = '0',
  } = input;
  const yesNo = (/** @type {boolean | undefined} */ flag) => (flag === true ? 'yes' : 'no');
  return {
    entity: input.entity, partnership: yesNo(input.partnershipAsset), asset: input.assetKind,
    acquired: input.purchaseContractDate, event: input.saleContractDate, business: input.businessInSaleYear,
    previousBusiness: yesNo(input.businessInPreviousYear), previous: previousYearTurnover,
    earlierBusiness: yesNo(input.businessInEarlierYear), earlier: earlierYearTurnover,
    likely: likelyTurnover, actual: actualTurnover, netAssets: input.netAssetValue,
    passive: passivelyHeld, ceased: businessCeasedDate, extension: yesNo(input.commissionerExtension),
    active: String(input.activeDays), born: input.dateOfBirth, retiring: yesNo(input.retiring),
    incapacitated: yesNo(input.permanentlyIncapacitated),
    significant: yesNo(input.significantIndividualJustBefore), fifteen: yesNo(input.significantIndividualFor15Years),
    choice: input.retirementChoiceDate, used: retirementLimitUsed,
  };
}

/** @param {ToolKit} kit @param {BusinessCalculators['cgtConcessions']} cgtConcessions */
export function cgtConcessionsTool(kit, cgtConcessions) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'check_small_business_cgt_concessions',
    title: 'Small business CGT concessions checker',
    description: 'Check which of the 4 Division 152 small business CGT concessions (15-year exemption, 50% active asset '
      + 'reduction, retirement exemption with remaining AUD lifetime limit and roll-over replacement asset period) are open '
      + 'for one CGT event A1 sale contract from 1 July 2020 to 30 June 2027, testing CGT small business entity turnover '
      + '($2,000,000 AUD), maximum net asset value ($6,000,000 AUD), passively held assets and the active asset test. Refuses '
      + 'shares or trust interests (s 152-10(2)), pre-CGT assets, exact 15-year anniversaries, ambiguous 7.5-year day counts '
      + '(2,736 to 2,745 days) and contracts from 1 July 2027.',
    inputSchema: record({
      entity: choice(['individual', 'company', 'trust'], 'Who made the capital gain.'),
      assetKind: choice(['business', 'share'], '"business" (active business asset, not a depreciating asset) or "share" (share/trust interest; refused).'),
      partnershipAsset: { type: 'boolean', description: 'true when the asset is your interest in a partnership asset; false when omitted.' },
      purchaseContractDate: text('date', 'Purchase contract date as YYYY-MM-DD (on or after 1985-09-20).'),
      saleContractDate: text('date', 'Sale contract date as YYYY-MM-DD, from 2020-07-01 to 2027-06-30.'),
      businessInSaleYear: choice(['yes', 'winding-up', 'no'], 'Whether a business was carried on in the sale year ("yes", "winding-up" under s 328-110(5) or "no").'),
      businessInPreviousYear: { type: 'boolean', description: 'true when a business was carried on in the previous income year; false when omitted.' },
      previousYearTurnover: text('cost', 'Previous income year aggregated turnover in AUD; required when businessInPreviousYear is true.'),
      businessInEarlierYear: { type: 'boolean', description: 'true when a business was carried on in the income year before the previous year; false when omitted.' },
      earlierYearTurnover: text('cost', 'Aggregated turnover in the year before the previous year in AUD; required when businessInEarlierYear is true.'),
      likelyTurnover: text('cost', 'Likely aggregated turnover for the sale year in AUD; required when businessInSaleYear is not "no".'),
      actualTurnover: text('cost', 'Actual aggregated turnover at the end of the sale year in AUD; required when businessInSaleYear is not "no".'),
      netAssetValue: text('cost', 'Net value of CGT assets of you, affiliates and connected entities just before the sale in AUD (0 if nil or less).'),
      passivelyHeld: choice(['none', 'affiliate', 'partnership'], '"none" (or omitted), "affiliate" (s 152-10(1A)) or "partnership" (s 152-10(1B)).'),
      activeDays: whole(0, 100000, 'Days the asset was an active asset during the test period (both ends counted).'),
      businessCeasedDate: text('date', 'Optional date the business ceased before the sale, YYYY-MM-DD.'),
      commissionerExtension: { type: 'boolean', description: 'Only when businessCeasedDate is supplied: true if the Commissioner allowed longer than 12 months; false when omitted.' },
      dateOfBirth: text('date', 'Date of birth of the individual (or company/trust significant individual), YYYY-MM-DD.'),
      retiring: { type: 'boolean', description: 'true when the sale is in connection with retirement; false when omitted.' },
      permanentlyIncapacitated: { type: 'boolean', description: 'true when permanently incapacitated at the sale; false when omitted.' },
      significantIndividualJustBefore: { type: 'boolean', description: 'Company or trust only: true when there was a significant individual just before the sale (s 152-50).' },
      significantIndividualFor15Years: { type: 'boolean', description: 'Company or trust only: true when there was a significant individual for a total of 15 years.' },
      retirementChoiceDate: text('date', 'Date of the retirement exemption choice (or company/trust payment), YYYY-MM-DD, on or after saleContractDate.'),
      retirementLimitUsed: text('cost', 'CGT exempt amounts already chosen by or for the individual in AUD (up to 500000); "0" when omitted.'),
    }, ['entity', 'assetKind', 'purchaseContractDate', 'saleContractDate', 'businessInSaleYear', 'netAssetValue', 'activeDays', 'dateOfBirth', 'retirementChoiceDate']),
    run(input) {
      const r = cgtConcessions(buildConcessionsAnswers(input));
      return {
        basicConditionsMet: r.basic, smallBusinessEntity: r.smallBusiness, turnoverRule: r.turnoverRule,
        likelyTurnoverBarred: r.barred, netAssetValue: dollars(r.netValue / 100), netAssetsTestMet: r.netAssets,
        passivelyHeld: r.passive, activeAssetTestMet: r.activeAsset, ownedOver15Years: r.over15,
        activeTestPeriod: { from: r.testFrom, to: r.testTo, testDays: r.testDays, activeDays: r.activeDays },
        concessions: {
          fifteenYearExemption: r.fifteenYear, fifteenYearUnmet: r.fifteenYearUnmet,
          fiftyPercentReduction: r.reduction, retirementExemption: r.retirement,
          retirementLimitRemaining: dollars(r.retirementLimit), superContributionRequired: r.superContribution,
          rollover: r.rollover, replacementPeriod: { from: r.replacementFrom, to: r.replacementTo },
        },
        significantIndividualMet: r.significant, currency: 'AUD', source: `${CALCULATORS}cgt-concessions/`,
      };
    },
  });
}

/** @param {ReturnType<BusinessCalculators['pcgRisk']>} r */
function pcgScoreFields(r) {
  return {
    returnedPercent: r.returned.toFixed(2),
    factor1Score: r.factor1,
    effectiveTaxRatePercent: r.taxRate === null ? null : r.taxRate.toFixed(2),
    factor2Score: r.factor2,
    benchmarkSharePercent: r.benchmarkShare === null ? null : r.benchmarkShare.toFixed(2),
    factor3Score: r.factor3,
    aggregateScore: r.total,
    riskZone: r.zone,
    wholeEntitlementReturned: r.total === null,
  };
}

/** @param {ToolKit} kit @param {BusinessCalculators['pcgRisk']} pcgRisk */
export function pcgRiskTool(kit, pcgRisk) {
  const { text, record, tool, CALCULATORS } = kit;
  return tool({
    name: 'score_pcg_2021_4_risk',
    title: 'PCG 2021/4 risk scorer',
    description: 'ATO PCG 2021/4 risk assessment factor scores and risk zone (green, amber or red) for one individual '
      + 'professional practitioner (IPP) profit allocation arrangement passing Gateways 1 and 2, from amounts in AUD: '
      + 'Factor 1 (profit entitlement returned by the IPP), Factor 2 (total effective tax rate) and optional Factor 3 '
      + '(IPP remuneration against a commercial benchmark). Returning 100% of the entitlement scores green without '
      + 'Factors 2 and 3 (paragraph 81). Refuses arrangements failing either gateway. Does not test whether PCG 2021/4 '
      + 'applies or compute each entity\'s tax.',
    inputSchema: record({
      gateway1Passed: { type: 'boolean', description: 'true when Gateway 1 (commercially driven, paras 39-46) is passed; false refuses.' },
      gateway2Passed: { type: 'boolean', description: 'true when Gateway 2 (no high-risk features, paras 47-63) is passed; false refuses.' },
      profitEntitlement: text('cost', 'Total profit entitlement of the IPP and associated entities from the whole of firm group in AUD, above zero.'),
      returnedByIpp: text('cost', 'Amount returned by the IPP in their own tax return in AUD, no more than profitEntitlement.'),
      taxPaid: text('cost', 'Total tax paid by the IPP and associated entities on that firm income under para 85 in AUD, no more than profitEntitlement.'),
      includeFactor3: { type: 'boolean', description: 'true to score all 3 factors; false or omitted to score Factors 1 and 2 only.' },
      ippRemuneration: text('cost', 'Factor 3 only: IPP remuneration returned in AUD; required when includeFactor3 is true.'),
      commercialBenchmark: text('cost', 'Factor 3 only: commercial benchmark for the IPP\'s services in AUD (above zero); required when includeFactor3 is true.'),
    }, ['gateway1Passed', 'gateway2Passed', 'profitEntitlement', 'returnedByIpp', 'taxPaid']),
    run({
      gateway1Passed, gateway2Passed, profitEntitlement, returnedByIpp, taxPaid,
      includeFactor3 = false, ippRemuneration, commercialBenchmark,
    }) {
      requireWhen(includeFactor3, ippRemuneration, 'ippRemuneration', 'when includeFactor3 is true');
      requireWhen(includeFactor3, commercialBenchmark, 'commercialBenchmark', 'when includeFactor3 is true');
      const r = pcgRisk({
        gateway1: gateway1Passed, gateway2: gateway2Passed, entitlement: profitEntitlement,
        returned: returnedByIpp, tax: taxPaid, factor3: includeFactor3,
        remuneration: ippRemuneration ?? '0', benchmark: commercialBenchmark ?? '0',
      });
      return { ...pcgScoreFields(r), currency: 'AUD', source: `${CALCULATORS}pcg-2021-4/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['pcgAllocation']} pcgAllocation */
export function pcgAllocationTool(kit, pcgAllocation) {
  const { text, choice, record, tool, dollars, CALCULATORS } = kit;
  const ippSchema = record({
    firmIncome: text('cost', 'IPP firm income in AUD.'),
    firmDeductions: text('cost', 'IPP firm-related deductions in AUD; "0" when omitted.'),
    otherNetIncome: text('signedCost', 'IPP other income less other deductions in AUD (may be negative); "0" when omitted.'),
  }, ['firmIncome']);
  const associateSchema = record({
    kind: choice(['individual', 'base-rate-company', 'company', 'other'], 'Associate recipient kind; "other" refuses.'),
    firmIncome: text('cost', 'Associate firm income in AUD.'),
    firmDeductions: text('cost', 'Associate firm-related deductions in AUD; "0" when omitted.'),
    otherNetIncome: text('signedCost', 'Associate other income less other deductions in AUD (may be negative); "0" when omitted.'),
  }, ['kind', 'firmIncome']);
  return tool({
    name: 'calculate_pcg_2021_4_allocation',
    title: 'PCG 2021/4 allocation calculator',
    description: 'Each recipient\'s tax counted under PCG 2021/4 paragraph 85 (larger of tax on firm income alone or extra '
      + 'tax added to other income, before levies and offsets) in AUD, total effective tax rate, risk factor scores and risk '
      + 'zone for one IPP and up to 5 associates across 2020-21 (guideline examples) and 2022-23 to 2026-27. Refuses failed '
      + 'gateways and unsupported associate kinds (non-residents, minors, s 98/99A trustees, super funds or fringe benefits).',
    inputSchema: record({
      incomeYear: choice(Array.from(PCG_ALLOCATION_YEARS.keys()), 'Income year tax rates ("2020-21" for guideline examples, or "2022-23" to "2026-27").'),
      gateway1Passed: { type: 'boolean', description: 'true when Gateway 1 (commercially driven, paras 39-46) is passed; false refuses.' },
      gateway2Passed: { type: 'boolean', description: 'true when Gateway 2 (no high-risk features, paras 47-63) is passed; false refuses.' },
      includeFactor3: { type: 'boolean', description: 'true to score all 3 factors using IPP firm income against commercialBenchmark; false or omitted for Factors 1 and 2.' },
      commercialBenchmark: text('cost', 'Factor 3 only: commercial benchmark for the IPP\'s services in AUD (above zero); required when includeFactor3 is true.'),
      ipp: ippSchema,
      associates: { type: 'array', maxItems: 5, items: associateSchema, description: 'Up to 5 associated entities receiving firm income; omit or [] for none.' },
    }, ['incomeYear', 'gateway1Passed', 'gateway2Passed', 'ipp']),
    run({
      incomeYear, gateway1Passed, gateway2Passed, includeFactor3 = false, commercialBenchmark, ipp, associates = [],
    }) {
      requireWhen(includeFactor3, commercialBenchmark, 'commercialBenchmark', 'when includeFactor3 is true');
      const yearRates = PCG_ALLOCATION_YEARS.get(incomeYear);
      if (!yearRates) throw new Error('Choose a supported income year.');
      const { firmIncome, firmDeductions = '0', otherNetIncome = '0' } = ipp;
      /** @type {import('./pcg-2021-4.mjs').PcgRecipient[]} */
      const recipients = [
        { kind: 'individual', firm: firmIncome, deductions: firmDeductions, other: otherNetIncome },
        ...associates.map((/** @type {Record<string, any>} */ a) => ({
          kind: a.kind, firm: a.firmIncome, deductions: a.firmDeductions ?? '0', other: a.otherNetIncome ?? '0',
        })),
      ];
      const r = pcgAllocation({
        gateway1: gateway1Passed, gateway2: gateway2Passed, factor3: includeFactor3,
        benchmark: commercialBenchmark ?? '0', recipients,
      }, yearRates);
      const [ippTax, ...associateTaxes] = r.recipients;
      return {
        incomeYear,
        ipp: ippTax ? { taxCounted: dollars(ippTax.tax), rule: ippTax.rule } : null,
        associates: associateTaxes.map((t, index) => ({
          associate: index + 1, taxCounted: t ? dollars(t.tax) : null, rule: t ? t.rule : null,
        })),
        totalFirmIncome: dollars(r.firmIncome), totalTaxCounted: dollars(r.tax),
        ...pcgScoreFields(r), currency: 'AUD', source: `${CALCULATORS}pcg-2021-4-allocation/`,
      };
    },
  });
}

/**
 * Business Calculators Cohort C (9 tools), keyed by each form's `data-calculator` slug.
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'capitalGain' | 'cgtConcessions' | 'pcgRisk' | 'pcgAllocation'
 *   | 'psiDetermination' | 'RENTAL_YEARS' | 'rentalProperty' | 'SBT_YEARS' | 'superBenefitTax'
 *   | 'SWH_FIRST_DAY' | 'superWithholding' | 'DASP_YEARS' | 'daspTax' | 'unusedLeave'
 *   | 'WC_SCHEMES' | 'workersCompensation'>} calculate
 */
export function businessCohortCTools(kit, calculate) {
  return {
    cgt: cgtTool(kit, calculate.capitalGain),
    'cgt-concessions': cgtConcessionsTool(kit, calculate.cgtConcessions),
    'pcg-2021-4': pcgRiskTool(kit, calculate.pcgRisk),
    'pcg-2021-4-allocation': pcgAllocationTool(kit, calculate.pcgAllocation),
    'psi-determination': psiDeterminationTool(kit, calculate.psiDetermination),
    'rental-property': rentalPropertyTool(kit, calculate),
    'super-benefit-tax': superBenefitTaxTool(kit, calculate),
    'unused-leave': unusedLeaveTool(kit, calculate.unusedLeave),
    'workers-compensation': workersCompensationTool(kit, calculate),
  };
}
