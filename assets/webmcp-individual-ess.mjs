// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptor for the employee share scheme discount calculator. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {{ESS_YEARS: string[], MAX_INTERESTS: number, CAUSES: string[],
 *   essDiscount: typeof import('./ess-discount.mjs').essDiscount}} EssDiscountEngine */

/** The tool's names for each interest's facts and the command's, each group in the command's order. */
const FACTS = [['consideration', 'consideration'], ['exercisePrice', 'exercise_price'], ['shareMarketValue', 'share_market_value'],
  ['lastExerciseDay', 'last_exercise_day'], ['valuation', 'valuation'], ['marketValue', 'market_value']];
const CONDITIONS = [['employed', 'employed'], ['ordinarySharesOnly', 'ordinary_shares_only'],
  ['notShareTradingCompany', 'not_share_trading_company'], ['minimumHoldingPeriod', 'minimum_holding_period'],
  ['tenPercentLimit', 'ten_percent_limit'], ['nonDiscriminatory', 'non_discriminatory'], ['realRiskOfForfeiture', 'real_risk_of_forfeiture'],
  ['broadAvailability', 'broad_availability'], ['salarySacrifice', 'salary_sacrifice'], ['deferralStated', 'deferral_stated']];
const START_UP = [['unlisted', 'unlisted'], ['incorporatedUnder10Years', 'incorporated_under_10_years'],
  ['aggregatedTurnover', 'aggregated_turnover'], ['employerAustralianResident', 'employer_australian_resident']];
const FORFEITURE = [['cause', 'cause'], ['protectsAgainstFall', 'protects_against_fall'], ['considerationReceived', 'consideration_received'],
  ['amountIncluded', 'amount_included'], ['yearIncluded', 'year_included']];
const DATES = [['restrictionsLifted', 'restrictions_lifted'], ['exercised', 'exercised'],
  ['shareRestrictionsLifted', 'share_restrictions_lifted'], ['employmentEnded', 'employment_ended'], ['disposed', 'disposed']];
const INCOME = [['taxableIncome', 'taxable_income'], ['reportableFringeBenefitsTotal', 'reportable_fringe_benefits_total'],
  ['reportableSuperContributions', 'reportable_super_contributions'], ['totalNetInvestmentLoss', 'total_net_investment_loss']];

/** The given facts under the command's names. @param {Record<string, unknown>} given @param {string[][]} names */
function renamed(given, names) {
  const facts = new Map(Object.entries(given));
  return Object.fromEntries(names.filter(([name]) => facts.has(name)).map(([name, key]) => [key, facts.get(name)]));
}

/** A deferred interest's dated facts: an omitted day has not happened (null), and an omitted day employment ended
 * means still employed. @param {Record<string, any>} d @param {string} kind @param {string} acquired */
function deferralFacts(d, kind, acquired) {
  const given = new Map(Object.entries(d));
  const days = DATES.filter(([, key]) => (kind === 'right' || (key !== 'exercised' && key !== 'share_restrictions_lifted'))
    && (key !== 'employment_ended' || acquired < '2022-07-01'));
  const tp = d.taxingPointValue;
  return { ...Object.fromEntries(days.map(([name, key]) => [key, given.get(name) ?? null])), cost_base: d.costBase,
    taxing_point_value: tp ? { date: tp.date, ...renamed(tp, [['marketValue', 'market_value'], ['shareMarketValue', 'share_market_value']]) }
      : null };
}

/** One interest in the command's form. @param {Record<string, any>} i */
function commandInterest(i) {
  const head = { kind: i.kind, acquired: i.acquired };
  if (i.forfeiture) return { ...head, ...renamed(i, FACTS), forfeiture: renamed(i.forfeiture, FORFEITURE) };
  return { ...head, ...renamed(i, FACTS), conditions: renamed(i.conditions ?? {}, CONDITIONS),
    start_up: i.startUp ? renamed(i.startUp, START_UP) : null, ...(i.deferral ? deferralFacts(i.deferral, i.kind, i.acquired) : {}) };
}

/** The schema of one interest, and the money schema. @param {ToolKit} kit @param {string[]} CAUSES */
function interestSchema({ text, choice, record }, CAUSES) {
  const flag = (/** @type {string} */ description) => (/** @type {const} */ ({ type: 'boolean', description }));
  const money = (/** @type {string} */ description) => text('trillionCost', `${description} in AUD, totals for the parcel.`);
  const date = (/** @type {string} */ description) => text('date', `${description}, YYYY-MM-DD.`);
  const conditions = record(Object.fromEntries(CONDITIONS.map(([name]) => [name, flag(`Whether ${name} is met, as Division 83A states it; `
    + 'broadAvailability for a share only, deferralStated (the scheme states Subdivision 83A-C applies) for a right only.')])),
  CONDITIONS.slice(0, 7).map(([name]) => name).concat('salarySacrifice'));
  const interest = record({
    kind: choice(['share', 'right'], 'A share, or a right to acquire one.'), acquired: date('Day the interest was acquired, from 2015-07-01'),
    consideration: money('What was paid for the interest'), marketValue: money('Market value when acquired (a right valued at market)'),
    exercisePrice: money('A right: the lowest total exercise price'), shareMarketValue: money('A right: market value of the shares it may acquire'),
    lastExerciseDay: date('A right: its last exercise day'),
    valuation: choice(['market_value', 'regulations'], 'A right: market value, or the regulations\' tables (unlisted rights).'),
    conditions,
    startUp: record(Object.fromEntries(START_UP.map(([name]) => [name, name === 'aggregatedTurnover' ? money('Aggregated turnover')
      : flag(`Start-up concession fact: ${name}.`)])), START_UP.map(([name]) => name)),
    deferral: record({ ...Object.fromEntries(DATES.map(([name]) => [name, date(`Deferral fact ${name}; omit if it has not happened`)])),
      costBase: money('Cost base at the taxing point'),
      taxingPointValue: record({ date: date('The deferred taxing point'), marketValue: money('Market value then'),
        shareMarketValue: money('A right valued by the regulations: market value of its shares then') }, ['date']) }, ['costBase']),
    forfeiture: record({ cause: choice(CAUSES, 'Why the interest was forfeited or lost.'), protectsAgainstFall: flag('Lost under a condition protecting against a fall in value.'),
      considerationReceived: flag('Valuable consideration was received for it.'), amountIncluded: money('The amount included for it earlier'),
      yearIncluded: text('incomeYear', 'Income year it was included in, such as 2023-24.') },
    ['cause', 'protectsAgainstFall', 'considerationReceived', 'amountIncluded', 'yearIncluded']),
  }, ['kind', 'acquired']);
  return { interest, money };
}

/** @param {ToolKit} kit @param {EssDiscountEngine} engine */
export function essDiscountTool(kit, { ESS_YEARS, MAX_INTERESTS, CAUSES, essDiscount }) {
  const { choice, record, tool, INDIVIDUAL } = kit;
  const { interest, money } = interestSchema(kit, CAUSES);
  return tool({
    name: 'calculate_ess_discount',
    title: 'Employee share scheme discount calculator',
    description: `Works out, in AUD, what ITAA 1997 Division 83A includes in an Australian resident's assessable income for ${ESS_YEARS.at(-1)} `
      + `to ${ESS_YEARS[0]} for employee share scheme shares and rights acquired from 1 July 2015: each discount taxed upfront `
      + '(s 83A-25) or at the deferred taxing point (ss 83A-105 to 83A-120, with the 30-day rule), the start-up concession '
      + '(s 83A-33), the $1,000 reduction with the $180,000 income test (s 83A-35), an unlisted right valued by the 2021 regulations\' '
      + 'tables, and the amount s 83A-310 excludes for a forfeited interest; question 12 labels D, E, F and B. Give a held '
      + 'interest its conditions and startUp (or none), and its deferral facts when Subdivision 83A-C applies. Values and '
      + 'conditions are yours to establish: it never values a share. Excludes foreign employment, temporary residents and '
      + 'interests acquired before 1 July 2015.',
    inputSchema: record({
      incomeYear: choice(ESS_YEARS, 'Income year, such as 2025-26.'),
      interests: { type: 'array', maxItems: MAX_INTERESTS, items: interest, description: 'The interests, one parcel each.' },
      incomeTest: record(Object.fromEntries(INCOME.map(([name]) => [name, money(`s 83A-35(2)(b): ${name}`)])), INCOME.map(([name]) => name)),
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['incomeYear', 'interests']),
    run({ incomeYear, interests, incomeTest, scopeConfirmed = true }) {
      const r = essDiscount({ interests: interests.map(commandInterest), income_test: incomeTest ? renamed(incomeTest, INCOME) : null,
        foreign_employment: false, year: incomeYear, scope_confirmed: scopeConfirmed });
      return { incomeYear: r.year, amounts: r.amounts, rates: r.rates, interests: r.interests, forfeitureExclusions: r.forfeiture_exclusions,
        currency: 'AUD', source: `${INDIVIDUAL}ess-discount/` };
    },
  });
}
