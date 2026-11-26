// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP for the S8 pages: foreign resident capital gains withholding, partnership net income and the trust loss tests.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** yes, no or unknown, as the command's true, false or null. @param {unknown} answer */
const tri = (answer) => (answer === 'yes' ? true : answer === 'no' ? false : null);

/** @param {ToolKit} kit @param {BusinessCalculators['foreignResidentWithholding']} run @param {readonly string[]} years */
export function frcgwTool(kit, run, years) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  const vendor = record({
    interest: text('trillionCost', 'The vendor\'s interest in the asset, in any unit shared by the vendors, for example "50" for half of 100.'),
    document: choice(['none', 'clearance_certificate', 'variation'], 'The vendor\'s document: none, a clearance certificate (s 14-210(2)) or a notice of variation (s 14-235(2)).'),
    rate: text('share', 'Variation only: the varied rate from 0 to 1 on the notice, for example "0.05".'),
    maximumPrice: text('trillionCost', 'Variation only: the maximum sale price on the notice in AUD.'),
  }, ['interest', 'document']);
  return tool({
    name: 'calculate_foreign_resident_withholding',
    title: 'Foreign resident capital gains withholding calculator',
    description: 'The foreign resident capital gains withholding amount in AUD a purchaser pays the ATO under TAA 1953 Schedule 1 s 14-200 '
      + 'on acquiring taxable Australian real property or a company title interest under a contract from 1 July 2017 to 30 June 2027: 12.5% with '
      + 'the $750,000 market value exclusion before 1 January 2025 and 15% with no threshold from then, of the first element of the cost base less '
      + 'any option fee, shared by the vendors\' interests; a clearance certificate gives nil and a notice of variation its rate. '
      + 'Clearance certificates, variations and s 14-215 exclusions are stated, not judged. It does not cover other indirect real property '
      + 'interests, options or rights, look-through earnouts or other withholding.',
    inputSchema: record({
      acquisitionDate: text('date', 'The contract date (YYYY-MM-DD), from 2017-07-01 to 2027-06-30.'),
      asset: choice(['taxable_australian_real_property', 'company_title_interest'], 'The asset acquired.'),
      marketValue: text('trillionCost', 'Market value of the asset in AUD.'),
      costBaseFirstElement: text('trillionCost', 'The first element of the cost base: what you paid or must pay for the asset, in AUD.'),
      optionPayments: text('trillionCost', 'Any amount paid for an option exercised to acquire it, in AUD; "0" when omitted.'),
      salePrice: text('trillionCost', 'The sale price in AUD, compared with a notice of variation\'s maximum; the cost base first element when omitted.'),
      vendors: { type: 'array', maxItems: 50, items: vendor, description: 'Each vendor, 1 to 50.' },
      exclusion: choice(['approved_stock_exchange', 'crossing_system', 'already_withheld', 'securities_lending', 'insolvent_company', 'bankruptcy'],
        'A s 14-215 exclusion that applies, if any.'),
      classVariationToNil: { type: 'boolean', description: 'true when a class variation to nil applies (s 14-235(5), (6)); false when omitted.' },
    }, ['acquisitionDate', 'asset', 'marketValue', 'costBaseFirstElement', 'vendors']),
    run(input) {
      const date = input.acquisitionDate;
      const [y, m] = date.split('-').map(Number);
      const first = m >= 7 ? y : y - 1;
      const r = run({ payment: 'capital_gains', acquisition_date: date, asset: input.asset, market_value: input.marketValue,
        cost_base_first_element: input.costBaseFirstElement, option_payments: input.optionPayments ?? '0', sale_price: input.salePrice ?? input.costBaseFirstElement,
        vendors: input.vendors.map((/** @type {Record<string, any>} */ v) => (v.document === 'variation'
          ? { interest: v.interest, document: v.document, rate: v.rate ?? '', maximum_price: v.maximumPrice ?? '' } : { interest: v.interest, document: v.document })),
        exclusion: input.exclusion ?? null, class_variation_to_nil: input.classVariationToNil ?? false,
        year: `${first}-${String((first + 1) % 100).padStart(2, '0')}`, scope_confirmed: true });
      if (!years.includes(r.period)) throw new Error('acquisitionDate is outside the years this tool covers.');
      return { incomeYear: r.period, amountPayable: r.amounts.amount_payable, withholdingBase: r.amounts.withholding_base,
        amountAtFullRate: r.amounts.amount_at_full_rate, rate: r.rates.rate, nilReason: r.nil_reason, vendors: r.vendors,
        authorities: r.authorities, currency: 'AUD', source: `${CALCULATORS}foreign-resident-withholding/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['partnershipNetIncome']} run */
export function partnershipTool(kit, run) {
  const { text, choice, record, tool, CALCULATORS } = kit;
  const partner = record({
    name: { type: 'string', description: 'The partner\'s name.' },
    residency: choice(['resident', 'non_resident'], 'The partner\'s residency for the whole year; non_resident needs allIncomeFromAustralianSources.'),
    interestPercentage: text('consumption', 'The partner\'s individual interest, 0 to 100 per cent, at most 6 decimal places.'),
  }, ['name', 'residency', 'interestPercentage']);
  return tool({
    name: 'calculate_partnership_net_income',
    title: 'Partnership net income calculator',
    description: 'A partnership\'s net income or partnership loss in AUD for 2024-25 to 2026-27 under ITAA 1936 s 90 (deductions under s 290-150 '
      + 'and Division 36 ITAA 1997 left out) and each partner\'s share of it and of exempt and non-assessable non-exempt income under s 92, '
      + 'by the interests stated, each share rounded half up to the cent with the cents left over to the largest shares. Refuses part-year '
      + 'residents, a non-resident partner unless all income is from Australian sources, and partner salaries or interest.',
    inputSchema: record({
      incomeYear: choice(['2024-25', '2025-26', '2026-27'], 'The income year.'),
      assessableIncome: text('trillionCost', 'The partnership\'s assessable income in AUD.'),
      deductions: text('trillionCost', 'All its deductions in AUD.'),
      excludedDeductions: text('trillionCost', 'The part of deductions under s 290-150 or Division 36 ITAA 1997, in AUD; "0" when omitted.'),
      exemptIncome: text('trillionCost', 'Exempt income in AUD; "0" when omitted.'),
      nonAssessableNonExemptIncome: text('trillionCost', 'Non-assessable non-exempt income in AUD; "0" when omitted.'),
      allIncomeFromAustralianSources: { type: 'boolean', description: 'true when all the partnership\'s income is from Australian sources.' },
      partnerSalariesOrInterest: { type: 'boolean', description: 'true when salary or interest is allocated to partners; refused, as it is not modelled.' },
      partners: { type: 'array', maxItems: 50, items: partner, description: 'Each partner; interests must total 100.' },
    }, ['incomeYear', 'assessableIncome', 'deductions', 'partners']),
    run(input) {
      const r = run({ financial_year: Number(input.incomeYear.slice(0, 4)) + 1, assessable_income: input.assessableIncome, deductions: input.deductions,
        excluded_deductions: input.excludedDeductions ?? '0', exempt_income: input.exemptIncome ?? '0',
        non_assessable_non_exempt_income: input.nonAssessableNonExemptIncome ?? '0',
        all_income_from_australian_sources: input.allIncomeFromAustralianSources ?? null, partner_salaries_or_interest: input.partnerSalariesOrInterest ?? false,
        partners: input.partners.map((/** @type {Record<string, any>} */ p) => ({ name: p.name, residency: p.residency, interest_percentage: p.interestPercentage })) });
      return { incomeYear: input.incomeYear, netIncome: r.net_income, partnershipLoss: r.partnership_loss, deductionsCounted: r.deductions_counted,
        partners: r.partners, steps: r.steps, currency: 'AUD', source: `${CALCULATORS}partnership-net-income/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['trustLossTests']} run */
export function trustLossTool(kit, run) {
  const { text, choice, whole, record, tool, CALCULATORS } = kit;
  const FACT = choice(['yes', 'no', 'unknown'], 'yes, no, or unknown when not established; unknown when omitted.');
  const share = record({ individual: { type: 'string', description: 'The individual\'s name.' },
    percent: text('consumption', 'The percentage of the distribution they received, 0 to 100.') }, ['individual', 'percent']);
  const distribution = { type: /** @type {const} */ ('array'), maxItems: 50, items: share,
    description: 'One test year distribution: each individual and the percentage of it they received, totalling at most 100.' };
  return tool({
    name: 'check_trust_loss_tests',
    title: 'Trust loss tests checker',
    description: 'Which ITAA 1936 Schedule 2F trust loss tests apply to a fixed or non-fixed trust deducting a prior-year tax loss in 2024-25 to '
      + '2026-27, and whether each is passed on the facts stated: the 50% stake test, the pattern of distributions test (worked from stated '
      + 'test year distributions when given), the control test and the income injection test, with excepted trusts such as a family trust. '
      + 'Unstated facts stay unknown, so a test can be not established. It works no amounts in AUD. Refuses widely held trusts, bad debts and current-year losses.',
    inputSchema: record({
      incomeYear: choice(['2024-25', '2025-26', '2026-27'], 'The income year the loss is deducted in.'),
      lossYear: whole(2000, 2026, 'The income year of the loss, as the calendar year it ends (2023 for 2022-23).'),
      trustKind: choice(['fixed', 'non_fixed'], 'A fixed trust or a non-fixed trust.'),
      exceptedTrust: choice(['family_trust', 'complying_superannuation_fund', 'complying_approved_deposit_fund', 'pooled_superannuation_trust',
        'deceased_estate', 'exempt_entity_unit_trust', 'designated_infrastructure_project_entity'], 'An excepted trust under s 272-100 at all times in the test period, if any.'),
      fiftyPercentStakeTestPassed: FACT, alternativeStakeTestPassed: FACT,
      incomeDistributedInIncomeYearOr2MonthsAfter: FACT, incomeDistributedIn6EarlierYears: FACT,
      capitalDistributedInIncomeYearOr2MonthsAfter: FACT, capitalDistributedIn6EarlierYears: FACT,
      patternOfDistributionsTestPassed: FACT, previouslyFailedPatternTest: FACT, individualsHadOver50PercentStake: FACT,
      stakeMaintained: FACT, groupBeganToControl: FACT, incomeInjectionScheme: FACT,
      testYearDistributions: record({
        income: { type: 'array', maxItems: 7, items: distribution, description: 'Income test year distributions.' },
        capital: { type: 'array', maxItems: 7, items: distribution, description: 'Capital test year distributions.' },
      }, []),
    }, ['incomeYear', 'lossYear', 'trustKind']),
    run(input) {
      const keys = /** @type {const} */ ([['fiftyPercentStakeTestPassed', 'fifty_percent_stake_test_passed'], ['alternativeStakeTestPassed', 'alternative_stake_test_passed'],
        ['incomeDistributedInIncomeYearOr2MonthsAfter', 'income_distributed_in_income_year_or_2_months_after'],
        ['incomeDistributedIn6EarlierYears', 'income_distributed_in_6_earlier_years'],
        ['capitalDistributedInIncomeYearOr2MonthsAfter', 'capital_distributed_in_income_year_or_2_months_after'],
        ['capitalDistributedIn6EarlierYears', 'capital_distributed_in_6_earlier_years'], ['patternOfDistributionsTestPassed', 'pattern_of_distributions_test_passed'],
        ['previouslyFailedPatternTest', 'previously_failed_pattern_test'], ['individualsHadOver50PercentStake', 'individuals_had_over_50_percent_stake'],
        ['stakeMaintained', 'stake_maintained'], ['groupBeganToControl', 'group_began_to_control'], ['incomeInjectionScheme', 'income_injection_scheme']]);
      /** @type {Record<string, unknown>} */
      const call = { financial_year: Number(input.incomeYear.slice(0, 4)) + 1, loss_year: input.lossYear, deduction: 'prior_year_tax_loss', trust_kind: input.trustKind };
      if (input.exceptedTrust !== undefined) call.excepted_trust = input.exceptedTrust;
      for (const [from, to] of keys) call[to] = tri(input[from]); // eslint-disable-line security/detect-object-injection -- keys are this module's own constants
      const asObject = (/** @type {{individual: string, percent: string}[][] | undefined} */ list) => (list ?? [])
        .map((dist) => Object.fromEntries(dist.map((x) => [x.individual, x.percent])));
      if (input.testYearDistributions) {
        call.test_year_distributions = { income: asObject(input.testYearDistributions.income), capital: asObject(input.testYearDistributions.capital) };
      }
      const r = run(call);
      return { incomeYear: input.incomeYear, deductible: r.deductible, tests: r.tests, notEstablished: r.not_established, notDecided: r.not_decided,
        exceptedTrust: r.excepted_trust, patternOfDistributionsWorking: r.pattern_of_distributions_working, source: `${CALCULATORS}trust-loss-tests/` };
    },
  });
}

/** The S8 tools, keyed by each form's `data-calculator` slug. @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'foreignResidentWithholding' | 'FRCGW_YEARS' | 'partnershipNetIncome' | 'trustLossTests'>} calculate */
export function businessS8Tools(kit, calculate) {
  return {
    'foreign-resident-withholding': frcgwTool(kit, calculate.foreignResidentWithholding, calculate.FRCGW_YEARS),
    'partnership-net-income': partnershipTool(kit, calculate.partnershipNetIncome),
    'trust-loss-tests': trustLossTool(kit, calculate.trustLossTests),
  };
}
