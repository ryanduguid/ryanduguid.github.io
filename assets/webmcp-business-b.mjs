// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort B (9 calculators):
// 13-week cash forecast, depreciation pools and capital works, Division 7A loan schedule,
// first home owner grant, PAYG instalments, payroll tax, salary against dividends,
// SGC and Payday Super, and staff cost. Imported by assets/webmcp-tools.mjs.

import {
  checkModeFields, paygInstalmentsTool, payrollTaxTool, salaryDividendTool, sgcPaydayTool, staffCostTool,
} from './webmcp-business-b-payroll.mjs';

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {import('./webmcp-tools.mjs').Schema} Schema */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

const POOL_COMMON = new Set(['worksheet', 'incomeYear', 'scopeConfirmed']);
const POOL_ALLOWED = new Map([
  ['low-value-pool', new Set(['previousClosingPoolBalance', 'lowCostAssets', 'lowValueAssets', 'secondElementCosts', 'terminationValues'])],
  ['small-business-pool', new Set(['openingPoolBalance', 'additions', 'costAdditions', 'terminationValues'])],
  ['capital-works', new Set(['constructionExpenditure', 'constructionStart', 'fourPercentManner', 'daysUsed', 'taxableUse', 'undeductedConstructionExpenditure'])],
]);
const POOL_REQUIRED = new Map([
  ['low-value-pool', ['previousClosingPoolBalance', 'lowCostAssets', 'lowValueAssets', 'secondElementCosts', 'terminationValues']],
  ['small-business-pool', ['openingPoolBalance', 'additions', 'costAdditions', 'terminationValues']],
  ['capital-works', ['constructionExpenditure', 'constructionStart', 'fourPercentManner', 'daysUsed', 'taxableUse', 'undeductedConstructionExpenditure']],
]);

export const DUTY_SCALES = new Map([
  ['AU-NSW', '0,1600,20,0,excess-rounded-up-to-100;1600,18000,20,1.25,excess-rounded-up-to-100;18000,38000,225,1.5,excess-rounded-up-to-100;38000,103000,525,1.75,excess-rounded-up-to-100;103000,387000,1662,3.5,excess-rounded-up-to-100;387000,1290000,11602,4.5,excess-rounded-up-to-100;1290000,3870000,52237,5.5,excess-rounded-up-to-100;3870000,,194137,7,excess-rounded-up-to-100'],
  ['AU-VIC', '0,25000,0,1.4,excess;25000,130000,350,2.4,excess;130000,960000,2870,6,excess;960000,2000000,0,5.5,whole-value;2000000,,110000,6.5,excess'],
  ['AU-QLD', '0,5000,0,0,excess-rounded-up-to-100;5000,75000,0,1.5,excess-rounded-up-to-100;75000,540000,1050,3.5,excess-rounded-up-to-100;540000,1000000,17325,4.5,excess-rounded-up-to-100;1000000,,38025,5.75,excess-rounded-up-to-100'],
  ['AU-WA', '0,120000,0,1.9,excess-rounded-up-to-100;120000,150000,2280,2.85,excess-rounded-up-to-100;150000,360000,3135,3.8,excess-rounded-up-to-100;360000,725000,11115,4.75,excess-rounded-up-to-100;725000,,28453,5.15,excess-rounded-up-to-100'],
  ['AU-SA', '0,12000,0,1,excess-rounded-up-to-100;12000,30000,120,2,excess-rounded-up-to-100;30000,50000,480,3,excess-rounded-up-to-100;50000,100000,1080,3.5,excess-rounded-up-to-100;100000,200000,2830,4,excess-rounded-up-to-100;200000,250000,6830,4.25,excess-rounded-up-to-100;250000,300000,8955,4.75,excess-rounded-up-to-100;300000,500000,11330,5,excess-rounded-up-to-100;500000,,21330,5.5,excess-rounded-up-to-100'],
  ['AU-TAS', '0,3000,50,0,excess-rounded-up-to-100;3000,25000,50,1.75,excess-rounded-up-to-100;25000,75000,435,2.25,excess-rounded-up-to-100;75000,200000,1560,3.5,excess-rounded-up-to-100;200000,375000,5935,4,excess-rounded-up-to-100;375000,725000,12935,4.25,excess-rounded-up-to-100;725000,,27810,4.5,excess-rounded-up-to-100'],
  ['AU-ACT', '0,200000,0,1.2,excess-rounded-up-to-100;200000,300000,2400,2.2,excess-rounded-up-to-100;300000,500000,4600,3.4,excess-rounded-up-to-100;500000,750000,11400,4.32,excess-rounded-up-to-100;750000,1000000,22200,5.9,excess-rounded-up-to-100;1000000,1455000,36950,6.4,excess-rounded-up-to-100;1455000,,0,4.54,whole-value'],
  ['AU-NT', '0,525000,0,0,nt-formula;525000,2999999,0,4.95,whole-value;2999999,4999999,0,5.75,whole-value;4999999,,0,5.95,whole-value'],
].map(([place, scale]) => /** @type {[string, string[][]]} */ ([place, scale.split(';').map((row) => row.split(','))])));

/**
 * @param {ToolKit} kit
 * @param {BusinessCalculators['cashForecast']} cashForecast
 * @param {BusinessCalculators['cashWeekDates']} cashWeekDates
 */
export function cashForecastTool(kit, cashForecast, cashWeekDates) {
  const { text, whole, record, tool, dollars, CALCULATORS } = kit;
  const weekSchema = record({
    receipts: text('cost', 'Expected cash receipts for the week in AUD, up to 1,000,000,000.'),
    payments: text('cost', 'Expected cash payments for the week in AUD, up to 1,000,000,000.'),
  }, ['receipts', 'payments']);
  const delaySchema = record({
    week: whole(1, 13, 'Original week number (1 to 13) of the receipt being delayed.'),
    amount: text('cost', 'Receipt amount delayed in AUD, no more than that week\'s receipts.'),
    delayWeeks: whole(0, 13, 'Whole weeks to delay the receipt (0 to 13); delays past week 13 are reported as deferred.'),
  }, ['week', 'amount', 'delayWeeks']);
  return tool({
    name: 'calculate_cash_forecast',
    title: '13-week cash forecast calculator',
    description: 'Weekly closing cash in AUD over 13 weeks from an opening balance (may be negative), weekly receipts and '
      + 'payments, one optional delayed receipt and a minimum cash buffer, returning the lowest balance, funding gap to the '
      + 'buffer and receipts deferred beyond week 13. Weekly totals can hide intra-week shortages; no statutory rate applies.',
    inputSchema: record({
      startDate: text('date', 'Optional first day of week 1 as YYYY-MM-DD (from 1900-01-01); adds 7-day start and end dates to each week.'),
      opening: text('signedCost', 'Opening bank balance in AUD (may be negative), from -1,000,000,000 to 1,000,000,000.'),
      buffer: text('cost', 'Minimum cash buffer in AUD, from 0 to 1,000,000,000.'),
      weeks: { type: 'array', maxItems: 13, items: weekSchema, description: 'Exactly 13 weekly {receipts, payments} objects in order, weeks 1 to 13.' },
      delayedReceipt: delaySchema,
    }, ['opening', 'buffer', 'weeks']),
    run({ startDate, opening, buffer, weeks, delayedReceipt }) {
      const dates = startDate === undefined ? null : cashWeekDates(startDate);
      const scenario = delayedReceipt
        ? { week: delayedReceipt.week, amount: delayedReceipt.amount, delay: delayedReceipt.delayWeeks }
        : undefined;
      const r = cashForecast(opening, weeks, buffer, scenario);
      return {
        closingCash: dollars(r.closing),
        lowestBalance: dollars(r.minimum),
        fundingGap: dollars(r.funding),
        deferredBeyondWeek13: dollars(r.deferred),
        weeks: r.rows.map((row, index) => {
          const span = dates ? dates.at(index) : undefined;
          return {
            week: row.week,
            ...(span ? { startDate: span.start, endDate: span.end } : {}),
            opening: dollars(row.opening),
            receipts: dollars(row.receipts),
            payments: dollars(row.payments),
            closing: dollars(row.closing),
          };
        }),
        currency: 'AUD',
        source: `${CALCULATORS}cash/`,
      };
    },
  });
}

/**
 * @param {Record<string, any>} input
 * @param {BusinessCalculators['capitalWorks']} capitalWorks
 * @param {{scope_confirmed?: boolean}} scope
 * @param {(value: number) => string} dollars
 * @param {string} source
 */
function runCapitalWorks(input, capitalWorks, scope, dollars, source) {
  const r = capitalWorks({
    year: input.incomeYear,
    construction_expenditure: input.constructionExpenditure,
    construction_start: input.constructionStart,
    four_percent_manner: input.fourPercentManner,
    days_used: input.daysUsed,
    taxable_use: input.taxableUse,
    undeducted_construction_expenditure: input.undeductedConstructionExpenditure,
    ...scope,
  });
  return {
    worksheet: 'capital-works', incomeYear: r.year, ratePercent: r.rate, provision: r.provision,
    rateAmount: dollars(r.rateAmount), reducedAmount: dollars(r.reducedAmount),
    deduction: dollars(r.deduction), limitedToUndeducted: r.limited,
    currency: 'AUD', source,
  };
}

/**
 * @param {Record<string, any>} input
 * @param {Pick<BusinessCalculators, 'lowValuePool' | 'smallBusinessPool' | 'capitalWorks'>} engines
 * @param {(value: number) => string} dollars
 * @param {string} source
 */
function runDepreciationWorksheet(input, { lowValuePool, smallBusinessPool, capitalWorks }, dollars, source) {
  const scope = input.scopeConfirmed === undefined ? {} : { scope_confirmed: input.scopeConfirmed };
  if (input.worksheet === 'low-value-pool') {
    const r = lowValuePool({
      year: input.incomeYear,
      previous_closing_pool_balance: input.previousClosingPoolBalance,
      low_cost_assets: input.lowCostAssets,
      low_value_assets: input.lowValueAssets,
      second_element_costs: input.secondElementCosts,
      termination_values: input.terminationValues,
      ...scope,
    });
    return {
      worksheet: 'low-value-pool', incomeYear: r.year,
      newAssetsDecline: dollars(r.newAssetsDecline), poolDecline: dollars(r.poolDecline),
      declineInValue: dollars(r.declineInValue), closingBeforeDisposals: dollars(r.closingBeforeDisposals),
      closingPoolBalance: dollars(r.closingPoolBalance), assessableExcess: dollars(r.assessableExcess),
      warnings: r.warnings, currency: 'AUD', source,
    };
  }
  if (input.worksheet === 'small-business-pool') {
    const r = smallBusinessPool({
      year: input.incomeYear,
      opening_pool_balance: input.openingPoolBalance,
      additions: input.additions,
      cost_additions: input.costAdditions,
      termination_values: input.terminationValues,
      ...scope,
    });
    return {
      worksheet: 'small-business-pool', incomeYear: r.year, outcome: r.outcome,
      lowPoolValueThreshold: r.threshold === null ? null : dollars(r.threshold),
      lowPoolValueAmount: dollars(r.lowPoolValueAmount),
      lowPoolValueDeduction: dollars(r.lowPoolValueDeduction),
      poolDeduction: dollars(r.poolDeduction),
      newAssetDeduction: dollars(r.newAssetDeduction),
      costAdditionDeduction: dollars(r.costAdditionDeduction),
      deduction: dollars(r.deduction),
      assessableIncome: dollars(r.assessableIncome),
      closingPoolBalance: dollars(r.closingPoolBalance),
      warnings: r.warnings, currency: 'AUD', source,
    };
  }
  return runCapitalWorks(input, capitalWorks, scope, dollars, source);
}

/**
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'lowValuePool' | 'smallBusinessPool' | 'capitalWorks' | 'POOL_YEARS'>} calculate
 */
export function depreciationPoolsTool(kit, calculate) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  return tool({
    name: 'calculate_depreciation_pool',
    title: 'Depreciation pools and capital works calculator',
    description: 'One income year (2020-21 to 2026-27) deduction in AUD for a Division 40 low-value pool (18.75% and 37.5%, '
      + 'ITAA 1997 ss 40-440 to 40-445), a Subdivision 328-D general small business pool (15% and 30% with the low pool '
      + 'value write-off under s 328-210 and IT(TP)A s 328-181(5)) or a Division 43 capital works deduction (2.5% or 4% '
      + 'under ss 43-210 and 43-215). Pool inputs are already at their taxable use or purpose proportion. Refuses fields '
      + 'from another worksheet, capital works begun before 16 September 1987, the 4% rate before 27 February 1992 and the '
      + '2020-21 backing business investment pool edge case.',
    inputSchema: record({
      worksheet: choice(['low-value-pool', 'small-business-pool', 'capital-works'], 'Worksheet to calculate.'),
      incomeYear: choice(calculate.POOL_YEARS, `Income year from ${calculate.POOL_YEARS[0]} to ${calculate.POOL_YEARS.at(-1)}.`),
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
      previousClosingPoolBalance: text('cost', 'Low-value pool: closing pool balance for the previous year in AUD.'),
      lowCostAssets: text('cost', 'Low-value pool: cost of low-cost assets allocated this year (at taxable use) in AUD.'),
      lowValueAssets: text('cost', 'Low-value pool: opening adjustable values of low-value assets allocated this year in AUD.'),
      secondElementCosts: text('cost', 'Low-value pool: second element costs for the year (at taxable use) in AUD.'),
      terminationValues: text('cost', 'Low-value pool or small business pool: termination values of pooled assets disposed of this year in AUD.'),
      openingPoolBalance: text('cost', 'Small business pool: opening pool balance in AUD.'),
      additions: text('cost', 'Small business pool: adjustable values of assets allocated this year (at taxable purpose proportion) in AUD.'),
      costAdditions: text('cost', 'Small business pool: cost addition amounts for pooled assets in AUD.'),
      constructionExpenditure: text('cost', 'Capital works: your construction expenditure in AUD.'),
      constructionStart: text('date', 'Capital works: date construction began as YYYY-MM-DD (on or after 1987-09-16).'),
      fourPercentManner: { type: 'boolean', description: 'Capital works: true when used in the 4% manner (s 43-145); refused before 1992-02-27.' },
      daysUsed: whole(0, 366, 'Capital works: whole days in the income year the part was held and used that way.'),
      taxableUse: text('share', 'Capital works: fraction of taxable use over daysUsed, from "0" to "1", for example "1" or "0.5".'),
      undeductedConstructionExpenditure: text('cost', 'Capital works: undeducted construction expenditure (s 43-235) in AUD.'),
    }, ['worksheet', 'incomeYear']),
    run(input) {
      checkModeFields(input, input.worksheet, POOL_ALLOWED, POOL_REQUIRED, POOL_COMMON);
      return runDepreciationWorksheet(input, calculate, dollars, `${CALCULATORS}depreciation-pools/`);
    },
  });
}

/**
 * Converts sparse year-numbered repayment overrides into the semicolon-separated list div7aSchedule takes.
 * @param {Array<{yearNumber: number, amount: string}> | undefined} repayments
 * @param {number} term
 */
function buildDiv7aRepayments(repayments, term) {
  if (!repayments || repayments.length === 0) return '';
  /** @type {Map<number, string>} */
  const byYear = new Map();
  let highest = 0;
  for (const entry of repayments) {
    if (entry.yearNumber > term) {
      throw new Error(`Repayment yearNumber ${entry.yearNumber} exceeds the ${term}-year loan term.`);
    }
    if (byYear.has(entry.yearNumber)) {
      throw new Error(`Duplicate repayment for yearNumber ${entry.yearNumber}.`);
    }
    byYear.set(entry.yearNumber, entry.amount);
    if (entry.yearNumber > highest) highest = entry.yearNumber;
  }
  return Array.from({ length: highest }, (_, index) => byYear.get(index + 1) ?? '').join(';');
}

/** @param {ToolKit} kit @param {BusinessCalculators['div7aSchedule']} div7aSchedule */
export function div7aScheduleTool(kit, div7aSchedule) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  const repaymentSchema = record({
    yearNumber: whole(1, 25, 'Repayment year number from 1 (the first income year after the loan was made) up to termYears.'),
    amount: text('cost', 'Actual repayment made on 30 June of that year in AUD.'),
  }, ['yearNumber', 'amount']);
  return tool({
    name: 'calculate_div7a_schedule',
    title: 'Division 7A loan schedule calculator',
    description: 'Year-by-year schedule in AUD for one complying Division 7A amalgamated loan over a 7-year unsecured or '
      + '25-year mortgage-secured term (ITAA 1936 ss 109E and 109N), using ATO benchmark interest rates from 2021-22 to '
      + '2026-27 (8.77% for 2026-27) and an assumed rate for later projected years. Assumes repayments on 30 June and '
      + 'stops at the first shortfall year. Optional funding dividend calculation at the borrower\'s marginal rate. Refuses '
      + 'loans made before 1 July 2020, interposed entities (Subdivision E), refinanced or extended loans and pre-lodgment repayments.',
    inputSchema: record({
      madeDate: text('date', 'Date the company made the loan as YYYY-MM-DD, from 2020-07-01 to 2027-06-30.'),
      amount: text('cost', 'Amalgamated loan not repaid at 30 June of the year made, in AUD above zero, up to 1,000,000,000.'),
      termYears: choice(['7', '25'], 'Maximum complying loan term under s 109N(3): "7" or "25".'),
      assumedBenchmarkRate: text('percent', 'Assumed benchmark interest rate in per cent (0.01 to 100) for income years after 2026-27; required if the schedule runs past 2026-27.'),
      repayments: { type: 'array', maxItems: 25, items: repaymentSchema, description: 'Optional custom repayments on 30 June by yearNumber; omitted years pay the minimum.' },
      marginalRate: text('percent', 'Optional borrower marginal tax rate in per cent (0 to 99.99) to calculate funding dividends.'),
      franking: choice(['unfranked', '30', '25'], 'Funding dividend franking ("unfranked", "30" or "25"); applies only when marginalRate is supplied.'),
      repaidBeforeLodgmentDay: { type: 'boolean', description: 'true if any part was repaid after 30 June and before the lodgment day for the loan year (refused); false when omitted.' },
      refinancedOrExtended: { type: 'boolean', description: 'true if the loan refinances another or had its term extended under a mortgage (refused); false when omitted.' },
      interposedEntity: { type: 'boolean', description: 'true if made through an interposed entity under Subdivision E (refused); false when omitted.' },
    }, ['madeDate', 'amount', 'termYears']),
    run({
      madeDate, amount, termYears, assumedBenchmarkRate, repayments, marginalRate, franking,
      repaidBeforeLodgmentDay = false, refinancedOrExtended = false, interposedEntity = false,
    }) {
      if (franking !== undefined && marginalRate === undefined) {
        throw new Error('franking applies only when marginalRate is supplied.');
      }
      const repaymentList = buildDiv7aRepayments(repayments, Number(termYears));
      const r = div7aSchedule({
        made: madeDate, amount, term: termYears,
        assumedRate: assumedBenchmarkRate ?? '8.77',
        repayments: repaymentList,
        marginalRate: marginalRate ?? '',
        franking: franking ?? 'unfranked',
        lodgment: repaidBeforeLodgmentDay,
        refinanced: refinancedOrExtended,
        interposed: interposedEntity,
      });
      if (r.projectedFrom !== null && assumedBenchmarkRate === undefined) {
        throw new Error(`assumedBenchmarkRate is required when the schedule extends to ${r.projectedFrom} or later.`);
      }
      return {
        firstMinimumRepayment: dollars(r.firstMinimum),
        totalRepaid: dollars(r.totalRepaid),
        totalInterest: dollars(r.totalInterest),
        lastYear: r.lastYear,
        closingBalance: dollars(r.closing),
        shortfall: dollars(r.shortfall),
        projectedFrom: r.projectedFrom,
        years: r.years.map((y) => ({
          incomeYear: y.year,
          benchmarkRatePercent: y.rate.toFixed(2),
          projected: y.projected,
          remainingTerm: y.remainingTerm,
          openingBalance: dollars(y.opening),
          minimumRepayment: dollars(y.minimum),
          repayment: dollars(y.repayment),
          interest: dollars(y.interest),
          principal: dollars(y.principal),
          closingBalance: dollars(y.closing),
          shortfall: dollars(y.shortfall),
          fundingDividend: y.funding === null ? null : dollars(y.funding),
        })),
        currency: 'AUD',
        source: `${CALCULATORS}div7a-schedule/`,
      };
    },
  });
}

/**
 * @param {string} place
 * @param {string} home
 * @param {string} contractDate
 * @param {number} value
 * @param {string} dutyFrom
 * @param {BusinessCalculators['firstHomeDuty']} firstHomeDuty
 * @param {(value: number) => string} dollars
 */
function formatFhogTransferDuty(place, home, contractDate, value, dutyFrom, firstHomeDuty, dollars) {
  if (home === 'built') {
    return {
      computed: false,
      reason: 'Duty on a building contract falls on the land, and first home buyer concessions on vacant land are not computed.',
      firstHomeBuyerDuty: null, generalDuty: null, concessionApplies: null,
    };
  }
  if (contractDate < dutyFrom) {
    return {
      computed: false,
      reason: `Transfer duty rates cover contracts from ${dutyFrom}.`,
      firstHomeBuyerDuty: null, generalDuty: null, concessionApplies: null,
    };
  }
  const scale = DUTY_SCALES.get(place);
  if (!scale) throw new Error('Choose a state or territory.');
  const f = firstHomeDuty(String(value), scale, place, home === 'bought' ? 'new' : 'established');
  return {
    computed: true, reason: null,
    firstHomeBuyerDuty: dollars(f.duty), generalDuty: dollars(f.general), concessionApplies: f.concession,
  };
}

/**
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'firstHomeOwnerGrant' | 'firstHomeDuty' | 'FHOG' | 'FHOG_FIRST' | 'FHOG_LAST' | 'FHOG_HOMES'>} calculate
 */
export function firstHomeOwnerGrantTool(kit, calculate) {
  const { text, choice, whole, record, tool, dollars, CALCULATORS } = kit;
  const factsSchema = record({
    person: { type: 'boolean', description: 'true when every applicant is a natural person aged 18 or over.' },
    citizen: { type: 'boolean', description: 'true when at least one applicant is an Australian citizen or permanent resident.' },
    first: { type: 'boolean', description: 'true when no applicant or spouse is excluded by the jurisdiction\'s prior grant and ownership rules.' },
    residence: { type: 'boolean', description: 'true when the applicants will meet the jurisdiction\'s residence requirement.' },
    contract: { type: 'boolean', description: 'New home built only: true when the building contract price (without land) is at least the grant.' },
    nt: { type: 'boolean', description: 'Northern Territory only: true when the contract does not replace one signed before 1 October 2024.' },
    tas: { type: 'boolean', description: 'Tasmania only: true when completion within 24 months (or Commissioner extension) and non-replacement conditions are met.' },
  }, ['person', 'citizen', 'first', 'residence']);
  return tool({
    name: 'calculate_first_home_owner_grant',
    title: 'First home owner grant calculator',
    description: 'First home owner grant in AUD across all 8 Australian states and territories for a new home bought or '
      + `built under a contract from ${calculate.FHOG_FIRST} to ${calculate.FHOG_LAST}, returning the grant amount, value `
      + 'cap, stated residence requirement and (for bought or established homes within supported duty rate dates) eligible '
      + 'first home buyer transfer duty beside general transfer duty. Refuses unstated required eligibility facts, '
      + 'out-of-range dates, owner-builders and substantially renovated homes.',
    inputSchema: record({
      place: choice(Object.keys(calculate.FHOG), 'State or territory, for example "AU-NSW".'),
      contractDate: text('date', `Contract date as YYYY-MM-DD, from ${calculate.FHOG_FIRST} to ${calculate.FHOG_LAST}.`),
      home: choice(calculate.FHOG_HOMES, '"bought" (new home bought), "built" (new home built under a comprehensive building contract) or "established".'),
      value: whole(1, 1000000000, 'Total value of the home and land in whole AUD, from 1 to 1,000,000,000.'),
      northOf26thParallel: { type: 'boolean', description: 'Western Australia only: true when north of the 26th parallel, false when south; omit for other jurisdictions.' },
      facts: factsSchema,
    }, ['place', 'contractDate', 'home', 'value', 'facts']),
    run({ place, contractDate, home, value, northOf26thParallel, facts }) {
      const [y, m, d] = contractDate.split('-').map(Number);
      const parsed = new Date(Date.UTC(y, m - 1, d));
      if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() + 1 !== m || parsed.getUTCDate() !== d) {
        throw new Error('contractDate must be a real calendar date as YYYY-MM-DD.');
      }
      if (place !== 'AU-WA' && northOf26thParallel !== undefined) {
        throw new Error('northOf26thParallel applies only to Western Australia (AU-WA).');
      }
      const r = calculate.firstHomeOwnerGrant({
        place, date: contractDate, home, value: String(value),
        ...(northOf26thParallel === undefined ? {} : { north: northOf26thParallel }),
        facts,
      });
      return {
        place, contractDate, home,
        grant: dollars(r.grant),
        reason: r.reason || null,
        valueCap: r.cap,
        residenceRequirement: r.residence,
        dutyFrom: r.dutyFrom,
        transferDuty: formatFhogTransferDuty(place, home, contractDate, value, r.dutyFrom, calculate.firstHomeDuty, dollars),
        currency: 'AUD',
        source: `${CALCULATORS}first-home-owner-grant/`,
      };
    },
  });
}

/**
 * Business Calculators Cohort B (9 tools), keyed by each form's `data-calculator` slug.
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'cashForecast' | 'cashWeekDates' | 'lowValuePool' | 'smallBusinessPool'
 *   | 'capitalWorks' | 'POOL_YEARS' | 'div7aSchedule' | 'firstHomeOwnerGrant' | 'firstHomeDuty' | 'FHOG'
 *   | 'FHOG_FIRST' | 'FHOG_LAST' | 'FHOG_HOMES' | 'paygInstalment' | 'payrollTax' | 'salaryDividend'
 *   | 'paydaySuperCharge' | 'quarterlySgCharge' | 'staffCost'>} calculate
 */
export function businessCohortBTools(kit, calculate) {
  return {
    cash: cashForecastTool(kit, calculate.cashForecast, calculate.cashWeekDates),
    'depreciation-pools': depreciationPoolsTool(kit, calculate),
    'div7a-schedule': div7aScheduleTool(kit, calculate.div7aSchedule),
    'first-home-owner-grant': firstHomeOwnerGrantTool(kit, calculate),
    'payg-instalments': paygInstalmentsTool(kit, calculate.paygInstalment),
    'payroll-tax': payrollTaxTool(kit, calculate.payrollTax),
    'salary-dividend': salaryDividendTool(kit, calculate.salaryDividend),
    'sgc-payday': sgcPaydayTool(kit, calculate),
    staff: staffCostTool(kit, calculate.staffCost),
  };
}
