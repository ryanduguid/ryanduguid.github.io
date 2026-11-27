// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// WebMCP tool descriptors for Business Calculators Cohort F (the 4 calculators added on 26 November 2026):
// SMSF tax, trading stock, prepayments and alcohol excise. Imported by assets/webmcp-tools.mjs.

/** @typedef {import('./webmcp-tools.mjs').ToolKit} ToolKit */
/** @typedef {typeof import('./business-calculators.mjs')} BusinessCalculators */

/** @param {ToolKit} kit @param {BusinessCalculators['smsfTax']} smsfTax @param {readonly string[]} years */
export function smsfTaxTool(kit, smsfTax, years) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  const dollarsIn = (/** @type {string} */ what) => text('trillionCost', `${what} in whole AUD; "0" when omitted.`);
  const centsIn = (/** @type {string} */ what) => text('trillionCost', `${what} in AUD; "0" when omitted.`);
  const flag = (/** @type {string} */ what) => ({ type: /** @type {const} */ ('boolean'), description: `${what}; false when omitted.` });
  return tool({
    name: 'calculate_smsf_tax',
    title: 'SMSF tax calculator',
    description: 'A complying Australian SMSF\'s income tax calculation statement (SMSF annual return item 13) for 2020-21 to 2026-27 '
      + 'under ITAA 1997 Division 295: gross income, exempt current pension income (segregated plus the actuary\'s proportion of other '
      + 'income), taxable income, the low tax component at 15% and the non-arm\'s length component at 45% (s 295-545), no-TFN '
      + 'contributions tax at 32%, offsets and credits, the $259 supervisory levy and its M and N adjustments, and the amount due or '
      + 'refundable (label S). It does not decide which income is non-arm\'s length, segregated or deductible, or work losses forward. Amounts in AUD.',
    inputSchema: record({
      incomeYear: choice([...years], `Income year, ${years[0]} to ${years.at(-1)}.`),
      assessableContributions: dollarsIn('Assessable contributions (Subdivision 295-C)'),
      noTfnContributions: dollarsIn('Of those, no-TFN contributions income'),
      netNonArmsLengthIncome: dollarsIn('Net non-arm\'s length income (label U)'),
      generalExpenseNonArmsLengthIncome: centsIn('Non-arm\'s length income from general expenses (s 295-550(8) and (9))'),
      segregatedPensionIncome: dollarsIn('Income from segregated current pension assets'),
      unsegregatedIncome: dollarsIn('Other income the actuary\'s proportion applies to'),
      exemptProportion: text('share', 'The actuary\'s proportion as a decimal from 0 to 1; "0" when omitted.'),
      segregatedNonCurrentIncome: dollarsIn('Income from segregated non-current assets'),
      deductions: dollarsIn('Total deductions'),
      contributionDeductions: dollarsIn('Of those, deductions attributable to the contributions'),
      nonRefundableOffsets: centsIn('Non-refundable non-carry forward tax offsets (label C)'),
      carryForwardOffsets: centsIn('Non-refundable carry forward tax offsets (label D)'),
      refundableOffsets: centsIn('Refundable tax offsets (label E)'),
      eligibleCredits: centsIn('Eligible credits (label H)'), paygInstalments: centsIn('PAYG instalments raised (label K)'),
      interestCharge: centsIn('Section 102AAM interest charge (label G)'),
      disregardedSmallFundAssets: flag('true when the fund has disregarded small fund assets'),
      newlyRegistered: flag('true for a fund newly registered in the year'), woundUp: flag('true for a fund wound up in the year'),
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation that the fund is a complying Australian superannuation fund; false refuses.' },
    }, ['incomeYear']),
    run(input) {
      const amount = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : '0');
      const r = smsfTax({ complying_fund: true, australian_superannuation_fund: true,
        assessable_contributions: amount(input.assessableContributions), no_tfn_contributions: amount(input.noTfnContributions),
        net_non_arms_length_income: amount(input.netNonArmsLengthIncome),
        general_expense_non_arms_length_income: amount(input.generalExpenseNonArmsLengthIncome),
        segregated_pension_income: amount(input.segregatedPensionIncome), unsegregated_income: amount(input.unsegregatedIncome),
        segregated_non_current_income: amount(input.segregatedNonCurrentIncome), exempt_proportion: amount(input.exemptProportion),
        disregarded_small_fund_assets: input.disregardedSmallFundAssets ?? false, deductions: amount(input.deductions),
        contribution_deductions: amount(input.contributionDeductions), non_refundable_offsets: amount(input.nonRefundableOffsets),
        carry_forward_offsets: amount(input.carryForwardOffsets), refundable_offsets: amount(input.refundableOffsets),
        eligible_credits: amount(input.eligibleCredits), payg_instalments: amount(input.paygInstalments), interest_charge: amount(input.interestCharge),
        newly_registered: input.newlyRegistered ?? false, wound_up: input.woundUp ?? false, year: input.incomeYear,
        scope_confirmed: input.scopeConfirmed ?? true });
      return { incomeYear: r.year, taxableIncome: r.amounts.taxable_income, grossTax: r.amounts.gross_tax, taxPayable: r.amounts.tax_payable,
        supervisoryLevy: r.amounts.supervisory_levy, amountDueOrRefundable: r.amounts.amount_due_or_refundable, returnLabels: r.returnLabels,
        amounts: r.amounts, rates: r.rates, currency: 'AUD', source: `${CALCULATORS}smsf-tax/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['tradingStock']} tradingStock @param {readonly string[]} years */
export function tradingStockTool(kit, tradingStock, years) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  const value = (/** @type {string} */ what) => text('trillionCost', `${what} in AUD; omit when not known.`);
  const item = record({
    cost: value('Cost'), marketSellingValue: value('Market selling value'), replacementValue: value('Replacement value'),
    method: choice(['cost', 'market_selling_value', 'replacement_value', 'lowest', 'obsolescence'],
      'The value elected for the item (s 70-45(1)); "lowest" takes the lowest of the 3, "obsolescence" a lower value under s 70-50.'),
    obsolescenceValue: text('trillionCost', 'The s 70-50 value in AUD, below all 3 others; only with the obsolescence method.'),
  }, ['method']);
  return tool({
    name: 'calculate_trading_stock',
    title: 'Trading stock calculator',
    description: 'The change in value of trading stock under ITAA 1997 s 70-35 for 2020-21 to 2026-27: each item at its elected cost, '
      + 'market selling value or replacement value (s 70-45) or an obsolescence value (s 70-50), the closing value, and the assessable '
      + 'increase or deduction; and the small business choice not to account for the change (s 328-285) where the estimate is within '
      + '$5,000 of the opening value, open to an entity under $50 million turnover from 2021-22. It does not work out cost or count stock. Amounts in AUD.',
    inputSchema: record({
      incomeYear: choice([...years], `Income year, ${years[0]} to ${years.at(-1)}.`),
      entity: choice(['small_business_entity', 'medium_business_entity', 'other'],
        '"medium_business_entity" for an entity covered by s 328-285(2) (aggregated turnover under $50 million).'),
      openingValue: text('trillionCost', 'Value of all trading stock on hand at the start of the year in AUD.'),
      items: { type: 'array', maxItems: 500, items: item, description: 'Each item or class on hand at the end of the year.' },
      estimatedClosingValue: text('trillionCost', 'A reasonable estimate of the closing value in AUD; the stocktake value when omitted.'),
      simplifiedChoice: { type: 'boolean', description: 'true to choose not to account for the change (s 328-285); false when omitted.' },
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['incomeYear', 'entity', 'openingValue', 'items']),
    run(input) {
      const list = /** @type {Record<string, unknown>[]} */ (input.items);
      const r = tradingStock({ entity: input.entity, opening_value: input.openingValue, items: list.map((x) => ({
        cost: x.cost ?? null, market_selling_value: x.marketSellingValue ?? null, replacement_value: x.replacementValue ?? null, method: x.method,
        ...(x.obsolescenceValue === undefined ? {} : { obsolescence_value: x.obsolescenceValue }) })),
      estimated_closing_value: input.estimatedClosingValue ?? null, simplified_choice: input.simplifiedChoice ?? false, year: input.incomeYear,
      scope_confirmed: input.scopeConfirmed ?? true });
      return { incomeYear: r.year, stocktakeValue: r.amounts.stocktake_value, closingValue: r.amounts.closing_value,
        assessableIncrease: r.amounts.assessable_increase, deduction: r.amounts.deduction, simplifiedAvailable: r.simplifiedAvailable,
        simplifiedChosen: r.simplifiedChosen, items: r.items, amounts: r.amounts, rates: r.rates, currency: 'AUD',
        source: `${CALCULATORS}trading-stock/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['prepayments']} prepayments @param {readonly string[]} years */
export function prepaymentsTool(kit, prepayments, years) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  const flag = (/** @type {string} */ what) => ({ type: /** @type {const} */ ('boolean'), description: `${what}; false when omitted.` });
  return tool({
    name: 'calculate_prepayments',
    title: 'Prepaid expenses calculator',
    description: 'When one prepaid amount incurred in 2020-21 to 2026-27 is deductible under ITAA 1936 ss 82KZL to 82KZMF: in full when '
      + 'incurred (excluded expenditure under $1,000, a thing done in the year, or the 12-month rule for a small business, an entity under '
      + '$50 million turnover or an individual\'s non-business expenditure), or apportioned by days of the eligible service period, at most '
      + '10 years, with each year\'s deduction. It does not decide whether the expenditure is deductible at all. Amounts in AUD.',
    inputSchema: record({
      incomeYear: choice([...years], `Income year the expenditure is incurred in, ${years[0]} to ${years.at(-1)}.`),
      taxpayer: choice(['small_business_entity', 'medium_business_entity', 'other'],
        '"medium_business_entity" for an entity covered by s 82KZM(1A) (aggregated turnover under $50 million).'),
      individual: flag('true for an individual'), businessExpenditure: flag('true when incurred in carrying on a business'),
      chose82kzmd: flag('true when a small or medium business has chosen to apply s 82KZMD'),
      expenditure: text('trillionCost', 'The prepaid amount in AUD.'),
      incurred: text('date', 'Day the expenditure was incurred, YYYY-MM-DD, in the income year.'),
      serviceStart: text('date', 'First day of the services paid for, YYYY-MM-DD.'),
      serviceEnd: text('date', 'Last day of the services paid for, YYYY-MM-DD.'),
      agreementDate: text('date', 'Day the agreement was entered into, YYYY-MM-DD; the day incurred when omitted.'),
      exclusion: choice(['none', 'law_or_court_order', 'contract_of_service'], 'An excluded expenditure limb of s 82KZL(1); "none" when omitted.'),
      taxShelter: flag('true when s 82KZME applies to the agreement'),
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['incomeYear', 'taxpayer', 'expenditure', 'incurred', 'serviceStart', 'serviceEnd']),
    run(input) {
      const r = prepayments({ taxpayer: input.taxpayer, individual: input.individual ?? false, business_expenditure: input.businessExpenditure ?? false,
        chose_82kzmd: input.chose82kzmd ?? false, expenditure: input.expenditure, incurred: input.incurred, service_start: input.serviceStart,
        service_end: input.serviceEnd, agreement_date: input.agreementDate ?? input.incurred, exclusion: input.exclusion ?? 'none',
        tax_shelter: input.taxShelter ?? false, year: input.incomeYear, scope_confirmed: input.scopeConfirmed ?? true });
      return { incomeYear: r.year, treatment: r.treatment, authority: r.authority, eligibleServicePeriod: r.eligible_service_period,
        deductionThisYear: r.amounts.deduction_expenditure_year, deductionLaterYears: r.amounts.deduction_later_years, schedule: r.schedule,
        amounts: r.amounts, rates: r.rates, currency: 'AUD', source: `${CALCULATORS}prepayments/` };
    },
  });
}

/** @param {ToolKit} kit @param {BusinessCalculators['alcoholExcise']} alcoholExcise @param {readonly string[]} years */
export function alcoholExciseTool(kit, alcoholExcise, years) {
  const { tool, text, choice, record, CALCULATORS } = kit;
  const line = record({
    date: text('date', 'Day the goods are entered for home consumption, YYYY-MM-DD, in the financial year.'),
    product: choice(['beer', 'brandy', 'spirit', 'other_excisable_beverage'], 'The product; wine bears wine equalisation tax instead.'),
    volumeLitres: text('quantity', 'Volume in litres, at most 4 decimal places.'),
    strengthPercent: text('rate', 'Actual alcohol strength, % by volume, at most 3 decimal places.'),
    labelledStrengthPercent: text('rate', 'The labelled strength where higher than the actual one (Excise Act 1901 s 77FA).'),
    containerLitres: text('quantity', 'Beer only: the container size in litres; over 48 litres, or 8 to 48 on a pressurised system, is draught.'),
    pressurisedSystem: { type: 'boolean', description: 'Beer in a container of 8 to 48 litres only: true when designed to connect to a pressurised gas or pump system.' },
    brewOnPremises: { type: 'boolean', description: 'Beer only: true for beer brewed on premises (subitems 1.15 and 1.16), with no container.' },
    remission: { type: 'boolean', description: 'true to claim the alcohol manufacturer remission for the line; false when omitted.' },
  }, ['date', 'product', 'volumeLitres', 'strengthPercent']);
  return tool({
    name: 'calculate_alcohol_excise',
    title: 'Alcohol excise calculator',
    description: 'Excise duty on beer, spirits and other excisable beverages entered for home consumption from 1 July 2022 to 31 January '
      + '2027 (Excise Tariff Act 1921 Schedule items 1 to 3): each line\'s subitem and litres of alcohol (beer on the strength above 1.15%), '
      + 'the rate in force on the day from the Commissioner\'s notices, return lines truncated to 0.1 litre and the cent, and the alcohol '
      + 'manufacturer remission under its $350,000 (to 2025-26) or $400,000 (from 2026-27) financial year cap, part-year cap and refund. '
      + 'It does not cover imported goods, wine, concessional spirit or licensing. Amounts in AUD.',
    inputSchema: record({
      financialYear: choice([...years], `Financial year, ${years[0]} to ${years.at(-1)}.`),
      lines: { type: 'array', maxItems: 1000, items: line, description: 'Each delivery of goods of one kind (1 to 1,000).' },
      remissionUsedThisYear: text('trillionCost', 'With a remission line: remission, rebates and refunds already used in the year, in AUD.'),
      manufacturerFrom: text('date', 'With a remission line: the day the business first became an alcohol manufacturer, if in the year.'),
      dutyPaid: { type: 'boolean', description: 'With a remission line: true when the duty was paid and is to be refunded on application.' },
      scopeConfirmed: { type: 'boolean', description: 'Optional scope confirmation; false refuses.' },
    }, ['financialYear', 'lines']),
    run(input) {
      const keys = new Map([['date', 'date'], ['product', 'product'], ['volumeLitres', 'volume_litres'], ['strengthPercent', 'strength_percent'],
        ['labelledStrengthPercent', 'labelled_strength_percent'], ['containerLitres', 'container_litres'], ['pressurisedSystem', 'pressurised_system'],
        ['brewOnPremises', 'brew_on_premises'], ['remission', 'remission']]);
      const lines = /** @type {Record<string, unknown>[]} */ (input.lines).map((x) => Object.fromEntries(Object.entries(x)
        .map(([k, v]) => [keys.get(k) ?? k, v])));
      /** @type {Record<string, unknown>} */
      const call = { lines, year: input.financialYear, scope_confirmed: input.scopeConfirmed ?? true };
      if (lines.some((x) => x.remission === true)) {
        call.remission_used_this_year = input.remissionUsedThisYear ?? '0';
        if (input.manufacturerFrom !== undefined) call.manufacturer_from = input.manufacturerFrom;
        if (input.dutyPaid !== undefined) call.duty_paid = input.dutyPaid;
      }
      const r = alcoholExcise(call);
      return { financialYear: r.year, exciseDuty: r.amounts.excise_duty, netDuty: r.amounts.net_duty, returnLines: r.return_lines,
        partYearCap: r.part_year_cap, amounts: r.amounts, rates: r.rates, currency: 'AUD', source: `${CALCULATORS}alcohol-excise/` };
    },
  });
}

/**
 * Business Calculators Cohort F (the 4 tools added 26 November 2026), keyed by each form's `data-calculator` slug.
 * @param {ToolKit} kit
 * @param {Pick<BusinessCalculators, 'smsfTax' | 'SMSF_YEARS' | 'tradingStock' | 'TRADING_STOCK_YEARS' | 'prepayments' | 'PREPAYMENT_YEARS'
 *   | 'alcoholExcise' | 'ALCOHOL_YEARS'>} calculate
 */
export function businessCohortFTools(kit, calculate) {
  return {
    'smsf-tax': smsfTaxTool(kit, calculate.smsfTax, calculate.SMSF_YEARS),
    'trading-stock': tradingStockTool(kit, calculate.tradingStock, calculate.TRADING_STOCK_YEARS),
    prepayments: prepaymentsTool(kit, calculate.prepayments, calculate.PREPAYMENT_YEARS),
    'alcohol-excise': alcoholExciseTool(kit, calculate.alcoholExcise, calculate.ALCOHOL_YEARS),
  };
}
